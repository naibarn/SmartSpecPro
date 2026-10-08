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

/** Opaque policy references only. Credentials and provider tokens never cross
 * the canonical job boundary. */
export type AgentTaskPolicyBinding = {
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  authorizationGrantRef: string;
  approvalRef: string;
  budgetReservationRef: string;
  budgetCapMinorUnits: number;
  currency: string;
  workspaceRef: string;
  deadline: string;
};

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
  workPackageId?: string;
  contextPackageIds: string[];
  skillIds: string[];
  mcpGrantIds: string[];
  requestedCapabilities: string[];
  /** Opaque pointer to immutable Spec 224 input staged outside the job event log. */
  spec224Input?: {
    inputSourceRef: string;
    inputDigest: string;
    totalBytes: number;
  };
  spec224Execution?: { sourceFingerprint: string; mode: "prompt" | "work_package"; allowedWriteSet: string[] };
  policyBinding?: AgentTaskPolicyBinding;
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

function requiredText(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string") invalid(`${field} is invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength)
    invalid(`${field} is invalid`);
  return normalized;
}

function normalizedIdList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 128)
    invalid(`${field} is invalid`);
  const normalized = (value as unknown[]).map(item =>
    requiredText(item, `${field}[]`, 160)
  );
  if (new Set(normalized).size !== normalized.length)
    invalid(`${field} is invalid`);
  return normalized;
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    const opaqueReference = /(?:ref|id)$/i.test(key);
    return (!opaqueReference && /authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key|credential/i.test(key))
      || containsSecret(child);
  });
}

function validatePolicyBinding(value: unknown): AgentTaskPolicyBinding {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("policy binding is invalid");
  const raw = value as Record<string, unknown>;
  const deadline = requiredText(raw.deadline, "policyBinding.deadline", 64);
  if (!Number.isFinite(Date.parse(deadline))) invalid("policy binding deadline is invalid");
  if (!Number.isSafeInteger(raw.budgetCapMinorUnits) || (raw.budgetCapMinorUnits as number) <= 0)
    invalid("policy binding budget cap is invalid");
  const currency = requiredText(raw.currency, "policyBinding.currency", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) invalid("policy binding currency is invalid");
  return {
    runnerId: requiredText(raw.runnerId, "policyBinding.runnerId", 160),
    runnerSessionId: requiredText(raw.runnerSessionId, "policyBinding.runnerSessionId", 160),
    capabilitySnapshotId: requiredText(raw.capabilitySnapshotId, "policyBinding.capabilitySnapshotId", 160),
    capabilitySnapshotRevision: requiredText(raw.capabilitySnapshotRevision, "policyBinding.capabilitySnapshotRevision", 160),
    authorizationGrantRef: requiredText(raw.authorizationGrantRef, "policyBinding.authorizationGrantRef", 200),
    approvalRef: requiredText(raw.approvalRef, "policyBinding.approvalRef", 200),
    budgetReservationRef: requiredText(raw.budgetReservationRef, "policyBinding.budgetReservationRef", 200),
    budgetCapMinorUnits: raw.budgetCapMinorUnits as number,
    currency,
    workspaceRef: requiredText(raw.workspaceRef, "policyBinding.workspaceRef", 200),
    deadline,
  };
}

export function validateAgentTaskManifest(
  manifest: AgentTaskManifest
): AgentTaskManifest {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    invalid("agent manifest is invalid");
  const raw = manifest as unknown as Record<string, unknown>;
  const taskId = requiredText(raw.taskId, "taskId", 128);
  const tenantId = requiredText(raw.tenantId, "tenantId", 36);
  const goalId = requiredText(raw.goalId, "goalId", 128);
  const planId = requiredText(raw.planId, "planId", 128);
  const workspaceId = requiredText(raw.workspaceId, "workspaceId", 160);
  const workPackageId = raw.workPackageId === undefined
    ? undefined
    : requiredText(raw.workPackageId, "workPackageId", 160);
  if (
    !Number.isSafeInteger(raw.actorId) ||
    (raw.actorId as number) <= 0 ||
    !Number.isSafeInteger(raw.planRevision) ||
    (raw.planRevision as number) < 1
  )
    invalid("agent identity or plan revision is invalid");
  if (
    !(
      typeof raw.provider === "string" &&
      ["codex", "claude_code", "antigravity", "deepseek"].includes(raw.provider)
    ) ||
    !(
      typeof raw.runtime === "string" &&
      ["local_runner", "cloudflare_container"].includes(raw.runtime)
    )
  )
    invalid("agent provider or runtime is invalid");
  const contextPackageIds = normalizedIdList(
    raw.contextPackageIds,
    "contextPackageIds"
  );
  const skillIds = normalizedIdList(raw.skillIds, "skillIds");
  const mcpGrantIds = normalizedIdList(raw.mcpGrantIds, "mcpGrantIds");
  const requestedCapabilities = normalizedIdList(
    raw.requestedCapabilities,
    "requestedCapabilities"
  );
  let spec224Input: AgentTaskManifest["spec224Input"];
  if (raw.spec224Input !== undefined) {
    if (!raw.spec224Input || Array.isArray(raw.spec224Input) || typeof raw.spec224Input !== "object")
      invalid("spec224Input is invalid");
    const input = raw.spec224Input as Record<string, unknown>;
    if (
      Object.keys(input).sort().join(",") !== "inputDigest,inputSourceRef,totalBytes" ||
      typeof input.inputDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.inputDigest) ||
      !Number.isSafeInteger(input.totalBytes) || (input.totalBytes as number) < 1 || (input.totalBytes as number) > 2 * 1024 * 1024
    ) invalid("spec224Input is invalid");
    spec224Input = {
      inputSourceRef: requiredText(input.inputSourceRef, "spec224Input.inputSourceRef", 160),
      inputDigest: input.inputDigest,
      totalBytes: input.totalBytes as number,
    };
  }
  let spec224Execution: AgentTaskManifest["spec224Execution"];
  if (raw.spec224Execution !== undefined) {
    if (!raw.spec224Execution || Array.isArray(raw.spec224Execution) || typeof raw.spec224Execution !== "object") invalid("spec224Execution is invalid");
    const execution = raw.spec224Execution as Record<string, unknown>;
    if (Object.keys(execution).sort().join(",") !== "allowedWriteSet,mode,sourceFingerprint" || typeof execution.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(execution.sourceFingerprint) || !["prompt", "work_package"].includes(String(execution.mode)) || !Array.isArray(execution.allowedWriteSet) || execution.allowedWriteSet.length < 1 || execution.allowedWriteSet.length > 256) invalid("spec224Execution is invalid");
    const allowedWriteSet = execution.allowedWriteSet.map((value) => {
      if (typeof value !== "string" || value.length > 240 || value.startsWith("/") || value.includes("\\") || value.split("/").some(part => !part || part === "." || part === "..") || !/^[A-Za-z0-9*?._/-]+$/.test(value)) invalid("spec224Execution is invalid");
      return value;
    });
    if (new Set(allowedWriteSet).size !== allowedWriteSet.length) invalid("spec224Execution is invalid");
    spec224Execution = { sourceFingerprint: execution.sourceFingerprint, mode: execution.mode as "prompt" | "work_package", allowedWriteSet };
  }
  if (containsSecret(manifest))
    invalid("agent manifest cannot contain credentials");
  const policyBinding = raw.policyBinding === undefined
    ? undefined
    : validatePolicyBinding(raw.policyBinding);
  return {
    taskId,
    tenantId,
    actorId: raw.actorId as number,
    goalId,
    planId,
    planRevision: raw.planRevision as number,
    provider: raw.provider as AgentProvider,
    runtime: raw.runtime as AgentRuntime,
    workspaceId,
    ...(workPackageId ? { workPackageId } : {}),
    contextPackageIds,
    skillIds,
    mcpGrantIds,
    requestedCapabilities,
    ...(spec224Input ? { spec224Input } : {}),
    ...(spec224Execution ? { spec224Execution } : {}),
    ...(policyBinding ? { policyBinding } : {}),
  };
}

export function acceptAgentEvent(
  lastSequence: number,
  event: AgentEvent
): "accepted" | "duplicate" | "out_of_order" {
  if (
    !Number.isSafeInteger(lastSequence) ||
    lastSequence < 0 ||
    !event ||
    typeof event !== "object" ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence < 1 ||
    typeof event.eventId !== "string" ||
    !event.eventId.trim() ||
    event.eventId.length > 160 ||
    typeof event.taskId !== "string" ||
    !event.taskId.trim() ||
    event.taskId.length > 128 ||
    ![
      "started",
      "text",
      "tool_call",
      "approval_required",
      "completed",
      "failed",
      "cancelled",
    ].includes(event.kind) ||
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload) ||
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
