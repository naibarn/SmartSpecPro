import type { JobResult } from "./jobControlPlaneTypes";
import { JobControlPlaneError } from "./jobControlPlaneTypes";
import type { WorkflowNodeTaskDispatcher } from "./workflowNodeTaskExecutor";
import type { CompiledNode } from "./workflowCompilerRuntimeContracts";

export type WorkflowNodePreflight =
  { status: "ready" } | { status: "unavailable"; reasonCode: string };

export type WorkflowNodeAdapterContext = {
  node: CompiledNode;
  /** Principal identity comes from worker_jobs, never the mutable task payload. */
  executionPrincipal: { tenantId: string; actorUserId?: number };
  inputArtifactRefs: string[];
  payload: Record<string, unknown>;
  signal?: AbortSignal;
};

export type WorkflowNodeAdapter = {
  typeId: string;
  typeVersion: string;
  manifestDigest: string;
  preflight(
    context: WorkflowNodeAdapterContext
  ): Promise<WorkflowNodePreflight>;
  execute(context: WorkflowNodeAdapterContext): Promise<JobResult>;
};

function adapterKey(typeId: string, version: string, digest: string): string {
  return `${typeId}\u0000${version}\u0000${digest}`;
}

/** Runtime adapters must match the exact compiler-pinned manifest identity. */
export class WorkflowNodeAdapterRegistry {
  private readonly adapters = new Map<string, WorkflowNodeAdapter>();

  register(adapter: WorkflowNodeAdapter): void {
    if (
      !adapter.typeId.trim() ||
      !adapter.typeVersion.trim() ||
      !/^[a-f0-9]{64}$/i.test(adapter.manifestDigest)
    )
      throw new Error("WORKFLOW_NODE_ADAPTER_IDENTITY_INVALID");
    const key = adapterKey(
      adapter.typeId,
      adapter.typeVersion,
      adapter.manifestDigest
    );
    if (this.adapters.has(key))
      throw new Error("WORKFLOW_NODE_ADAPTER_DUPLICATE");
    this.adapters.set(key, adapter);
  }

  resolve(
    node: Pick<CompiledNode, "typeId" | "typeVersion" | "manifestDigest">
  ): WorkflowNodeAdapter | undefined {
    return this.adapters.get(
      adapterKey(node.typeId, node.typeVersion, node.manifestDigest)
    );
  }

  async preflight(
    node: CompiledNode,
    context: WorkflowNodeAdapterContext
  ): Promise<WorkflowNodePreflight> {
    const adapter = this.resolve(node);
    if (!adapter)
      return {
        status: "unavailable",
        reasonCode: "NODE_ADAPTER_EXACT_VERSION_UNAVAILABLE",
      };
    return adapter.preflight(context);
  }

  entries(): WorkflowNodeAdapter[] {
    return [...this.adapters.values()];
  }
}

export function createWorkflowNodeTaskDispatcher(
  registry: WorkflowNodeAdapterRegistry,
  loadPinnedNode: (payload: Record<string, unknown>) => Promise<{
    node: CompiledNode;
    inputArtifactRefs: string[];
    signal?: AbortSignal;
  }>
): WorkflowNodeTaskDispatcher {
  return async input => {
    const pinned = await loadPinnedNode(input.payload);
    if (
      pinned.node.nodeId !== input.payload.nodeId ||
      pinned.node.typeId !== input.payload.typeId ||
      pinned.node.typeVersion !== input.payload.typeVersion ||
      pinned.node.manifestDigest !== input.payload.manifestDigest
    )
      throw new JobControlPlaneError(
        "WORKFLOW_PLAN_LOCK_MISMATCH",
        "Worker payload does not match the pinned node manifest"
      );
    const adapter = registry.resolve(pinned.node);
    if (!adapter)
      throw new JobControlPlaneError(
        "WORKFLOW_NODE_ADAPTER_UNAVAILABLE",
        "Exact node adapter is unavailable"
      );
    const context = {
      node: pinned.node,
      executionPrincipal: {
        tenantId: input.context.tenantId,
        ...(input.context.requestedByUserId !== undefined
          ? { actorUserId: input.context.requestedByUserId }
          : {}),
      },
      inputArtifactRefs: pinned.inputArtifactRefs,
      payload: input.payload,
      ...(pinned.signal ? { signal: pinned.signal } : {}),
    };
    const preflight = await adapter.preflight(context);
    if (preflight.status !== "ready")
      throw new JobControlPlaneError(
        preflight.reasonCode,
        "Node adapter preflight did not pass"
      );
    await input.reporter.assertActive(input.lease);
    const result = await adapter.execute(context);
    await input.reporter.assertActive(input.lease);
    if (
      !result.resultRef ||
      !/^[a-f0-9]{64}$/i.test(String(result.output?.outputDigest ?? ""))
    )
      throw new JobControlPlaneError(
        "WORKFLOW_OUTPUT_EVIDENCE_INVALID",
        "Adapter must return an artifact reference and content digest"
      );
    return result;
  };
}
