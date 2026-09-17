import { createHash } from "node:crypto";

import {
  JobControlPlaneError,
  type JobDefinition,
} from "./jobControlPlaneTypes";

export const AGENT_CONTROL_PLANE_CONTRACT_VERSION =
  "sah-agent-control-plane-v1";
export type AgentProvider =
  "codex" | "claude_code" | "antigravity" | "deepseek";
export type AgentRuntime = "local_runner" | "cloudflare_container";

export type AgentTaskManifest = {
  taskId: string;
  tenantId: string;
  actorId: number;
  goalId: string;
  planId: string;
  planRevision: number;
  provider: AgentProvider;
  runtime: AgentRuntime;
  workspaceId: string;
  contextPackageIds: string[];
  skillIds: string[];
  mcpGrantIds: string[];
  requestedCapabilities: string[];
};

export type AgentEvent = {
  eventId: string;
  taskId: string;
  sequence: number;
  kind:
    | "started"
    | "text"
    | "tool_call"
    | "approval_required"
    | "completed"
    | "failed"
    | "cancelled";
  payload: Record<string, unknown>;
  nativeEvidenceRef?: string;
};

export interface AgentAdapter {
  readonly provider: AgentProvider;
  start(manifest: AgentTaskManifest): Promise<{ providerSessionId: string }>;
  cancel(providerSessionId: string): Promise<void>;
  collect(providerSessionId: string): Promise<Record<string, unknown>>;
}

function invalid(message: string): never {
  throw new JobControlPlaneError("AGENT_CONTRACT_INVALID", message);
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      /authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key|credential/i.test(
        key
      ) || containsSecret(child)
  );
}

export function validateAgentTaskManifest(
  manifest: AgentTaskManifest
): AgentTaskManifest {
  if (
    !manifest.taskId ||
    !manifest.tenantId ||
    !manifest.goalId ||
    !manifest.planId ||
    !manifest.workspaceId
  )
    invalid("agent identity is incomplete");
  if (
    !Number.isSafeInteger(manifest.actorId) ||
    manifest.actorId <= 0 ||
    !Number.isSafeInteger(manifest.planRevision) ||
    manifest.planRevision < 1
  )
    invalid("agent identity or plan revision is invalid");
  if (
    !["codex", "claude_code", "antigravity", "deepseek"].includes(
      manifest.provider
    ) ||
    !["local_runner", "cloudflare_container"].includes(manifest.runtime)
  )
    invalid("agent provider or runtime is invalid");
  for (const [field, value] of [
    ["contextPackageIds", manifest.contextPackageIds],
    ["skillIds", manifest.skillIds],
    ["mcpGrantIds", manifest.mcpGrantIds],
    ["requestedCapabilities", manifest.requestedCapabilities],
  ] as const) {
    if (
      !Array.isArray(value) ||
      value.some(item => typeof item !== "string" || !item.trim())
    )
      invalid(`${field} is invalid`);
  }
  if (containsSecret(manifest))
    invalid("agent manifest cannot contain credentials");
  return {
    ...manifest,
    contextPackageIds: [...manifest.contextPackageIds],
    skillIds: [...manifest.skillIds],
    mcpGrantIds: [...manifest.mcpGrantIds],
    requestedCapabilities: [...manifest.requestedCapabilities],
  };
}

export function acceptAgentEvent(
  lastSequence: number,
  event: AgentEvent
): "accepted" | "duplicate" | "out_of_order" {
  if (
    !Number.isSafeInteger(event.sequence) ||
    event.sequence < 1 ||
    containsSecret(event.payload)
  )
    invalid("agent event is invalid");
  if (event.sequence <= lastSequence) return "duplicate";
  if (event.sequence !== lastSequence + 1) return "out_of_order";
  return "accepted";
}

export function buildAgentJobDefinition(
  manifest: AgentTaskManifest
): JobDefinition {
  const validated = validateAgentTaskManifest(manifest);
  const manifestHash = createHash("sha256")
    .update(JSON.stringify(validated), "utf8")
    .digest("hex");
  return {
    contractVersion: "feature-186-v1",
    tenantId: validated.tenantId,
    requestedByUserId: validated.actorId,
    // Reuse the existing external-agent executor registration. Provider
    // identity remains in the governed manifest, never in a new Job ledger.
    jobType: "external_agent_task",
    executionClass: "external",
    input: { manifest: validated, manifestHash },
    idempotencyKey:
      `agent:${validated.taskId}:plan:${validated.planId}:${validated.planRevision}`.slice(
        0,
        128
      ),
    retryPolicy: {
      maxAttempts: 2,
      baseDelayMs: 2_000,
      maxDelayMs: 120_000,
      jitter: "bounded",
      deadlineMs: 7_200_000,
      allowedErrorClasses: ["timeout", "unavailable"],
    },
    timeoutPolicy: { softTimeoutMs: 300_000, hardTimeoutMs: 7_200_000 },
    requiredCapabilities: {
      capabilityId: "agent.external_task",
      provider: validated.provider,
      runtime: validated.runtime,
      planId: validated.planId,
      planRevision: validated.planRevision,
    },
  };
}

export class AgentAdapterRegistry {
  private readonly adapters = new Map<AgentProvider, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    if (this.adapters.has(adapter.provider))
      throw new Error(`AGENT_ADAPTER_DUPLICATE:${adapter.provider}`);
    this.adapters.set(adapter.provider, adapter);
  }

  resolve(provider: AgentProvider): AgentAdapter | undefined {
    return this.adapters.get(provider);
  }
}
