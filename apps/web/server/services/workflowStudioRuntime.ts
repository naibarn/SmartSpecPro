import { createHash } from "node:crypto";

import {
  buildFeature195NodeAttemptJob,
  compileWorkflowDefinition,
  createNodeRun,
  createWorkflowRun,
  type ExecutionPlan,
  type WorkflowDefinitionV2,
} from "./workflowCompilerRuntimeContracts";
import type { JobDefinition } from "./jobControlPlaneTypes";

export const WORKFLOW_RUN_MODES = [
  "full",
  "run_until",
  "run_from",
  "run_node",
  "run_subflow",
] as const;
export type WorkflowRunMode = (typeof WORKFLOW_RUN_MODES)[number];

export class WorkflowRuntimeError extends Error {
  readonly code:
    | "INVALID_RUN_MODE"
    | "TARGET_NODE_REQUIRED"
    | "TARGET_NODE_INVALID"
    | "CHECKPOINT_REQUIRED"
    | "DEFINITION_INVALID"
    | "INPUT_INVALID";

  constructor(code: WorkflowRuntimeError["code"], message = code) {
    super(message);
    this.name = "WorkflowRuntimeError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type NormalizedWorkflowRunRequest = {
  mode: WorkflowRunMode;
  input: Record<string, unknown>;
  targetNodeId?: string;
  checkpointId?: string;
};

export function normalizeWorkflowRunRequest(input: {
  mode?: string;
  input: Record<string, unknown>;
  targetNodeId?: string;
  checkpointId?: string;
}): NormalizedWorkflowRunRequest {
  if (!WORKFLOW_RUN_MODES.includes(input.mode as WorkflowRunMode))
    throw new WorkflowRuntimeError("INVALID_RUN_MODE");
  if (!input.input || typeof input.input !== "object" || Array.isArray(input.input))
    throw new WorkflowRuntimeError("INPUT_INVALID");
  const mode = input.mode as WorkflowRunMode;
  if (mode !== "full" && !input.targetNodeId?.trim())
    throw new WorkflowRuntimeError("TARGET_NODE_REQUIRED");
  if (mode === "run_from" && !input.checkpointId?.trim())
    throw new WorkflowRuntimeError("CHECKPOINT_REQUIRED");
  return {
    mode,
    input: structuredClone(input.input),
    ...(input.targetNodeId?.trim() ? { targetNodeId: input.targetNodeId.trim() } : {}),
    ...(input.checkpointId?.trim() ? { checkpointId: input.checkpointId.trim() } : {}),
  };
}

export type WorkflowExecutionPlan = {
  contractVersion: "spec-215-v3";
  planId: string;
  jobType: "workflow.node.execute";
  executionClass: "long";
  idempotencyKey: string;
  workflowPlan: ExecutionPlan;
  jobs: JobDefinition[];
  input: {
    tenantId: string;
    actorId: number;
    workflowRunId: string;
    definitionId: string;
    versionId: string;
    contentHash: string;
    mode: WorkflowRunMode;
    targetNodeId?: string;
    checkpointId?: string;
    completedNodeIds?: string[];
    input: Record<string, unknown>;
    selectedNodeIds: string[];
  };
  retryPolicy: JobDefinition["retryPolicy"];
  timeoutPolicy: JobDefinition["timeoutPolicy"];
  requiredCapabilities: Record<string, unknown>;
};

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

export function workflowInputFingerprint(input: Record<string, unknown>): string {
  return fingerprint(input);
}

function topologicalNodeIds(plan: ExecutionPlan): string[] {
  const dependencies = new Map(plan.dependencies.map(item => [item.nodeId, [...item.dependsOn]]));
  const ordered: string[] = [];
  const remaining = new Set(plan.nodes.map(node => node.nodeId));
  while (remaining.size) {
    const next = [...remaining].find(nodeId =>
      (dependencies.get(nodeId) ?? []).every(parent => ordered.includes(parent))
    );
    if (!next) throw new WorkflowRuntimeError("DEFINITION_INVALID", "WORKFLOW_CYCLE_DETECTED");
    ordered.push(next);
    remaining.delete(next);
  }
  return ordered;
}

function selectNodeIds(
  plan: ExecutionPlan,
  mode: WorkflowRunMode,
  targetNodeId?: string,
  completedNodeIds: ReadonlySet<string> = new Set()
): Set<string> {
  const ordered = topologicalNodeIds(plan);
  if (!targetNodeId || mode === "full") return new Set(ordered);
  const targetIndex = ordered.indexOf(targetNodeId);
  if (targetIndex < 0) throw new WorkflowRuntimeError("TARGET_NODE_INVALID");
  if (mode === "run_until") return new Set(ordered.slice(0, targetIndex + 1));
  if (mode === "run_node") return new Set([targetNodeId]);
  if (mode === "run_from") return new Set(ordered.slice(targetIndex).filter(nodeId => !completedNodeIds.has(nodeId)));
  const descendants = new Set<string>([targetNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of plan.dependencies) {
      if (descendants.has(item.nodeId)) continue;
      if (item.dependsOn.some(parent => descendants.has(parent))) {
        descendants.add(item.nodeId);
        changed = true;
      }
    }
  }
  return descendants;
}

export function buildWorkflowExecutionPlan(input: {
  tenantId: string;
  actorId: number;
  runId: string;
  definitionId: string;
  versionId: string;
  contentHash: string;
  definition: WorkflowDefinitionV2;
  input: Record<string, unknown>;
  mode: WorkflowRunMode;
  targetNodeId?: string;
  checkpointId?: string;
  completedNodeIds?: string[];
  idempotencyKey: string;
}): WorkflowExecutionPlan {
  const request = normalizeWorkflowRunRequest(input);
  let workflowPlan: ExecutionPlan;
  try {
    workflowPlan = compileWorkflowDefinition(input.definition);
  } catch (error) {
    throw new WorkflowRuntimeError(
      "DEFINITION_INVALID",
      error instanceof Error ? error.message : "DEFINITION_INVALID"
    );
  }
  const nodeIds = new Set(workflowPlan.nodes.map(node => node.nodeId));
  if (request.targetNodeId && !nodeIds.has(request.targetNodeId))
    throw new WorkflowRuntimeError("TARGET_NODE_INVALID");
  const selectedNodeIds = selectNodeIds(
    workflowPlan,
    request.mode,
    request.targetNodeId,
    new Set(input.completedNodeIds ?? [])
  );
  if (!selectedNodeIds.size) throw new WorkflowRuntimeError("TARGET_NODE_INVALID");
  const run = createWorkflowRun(
    workflowPlan,
    input.runId,
    `workflow-input:${workflowInputFingerprint(request.input)}`
  );
  const ordered = topologicalNodeIds(workflowPlan);
  const jobs = ordered
    .filter(nodeId => selectedNodeIds.has(nodeId))
    .map(nodeId => {
      const nodeRun = createNodeRun(run, nodeId);
      return buildFeature195NodeAttemptJob({
        tenantId: input.tenantId,
        actorId: input.actorId,
        plan: workflowPlan,
        run,
        nodeRun,
        attempt: {
          attemptId: `${input.runId}:${nodeId}:attempt-1`,
          nodeRunId: nodeRun.nodeRunId,
          attemptNumber: 1,
          inputSnapshotRef: `workflow-input:${workflowInputFingerprint(request.input)}`,
        },
      });
    });
  const firstJob = jobs[0];
  return {
    contractVersion: "spec-215-v3",
    planId: workflowPlan.planId,
    jobType: "workflow.node.execute",
    executionClass: "long",
    idempotencyKey: `${input.idempotencyKey}:workflow`,
    workflowPlan,
    jobs,
    input: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      workflowRunId: run.workflowRunId,
      definitionId: input.definitionId,
      versionId: input.versionId,
      contentHash: input.contentHash,
      mode: request.mode,
      ...(request.targetNodeId ? { targetNodeId: request.targetNodeId } : {}),
      ...(request.checkpointId ? { checkpointId: request.checkpointId } : {}),
      ...(input.completedNodeIds?.length ? { completedNodeIds: [...input.completedNodeIds] } : {}),
      input: request.input,
      selectedNodeIds: ordered.filter(nodeId => selectedNodeIds.has(nodeId)),
    },
    retryPolicy: firstJob.retryPolicy,
    timeoutPolicy: firstJob.timeoutPolicy,
    requiredCapabilities: {
      workflow: workflowPlan.workflowId,
      nodeTypes: jobs.map(job => job.requiredCapabilities),
    },
  };
}
