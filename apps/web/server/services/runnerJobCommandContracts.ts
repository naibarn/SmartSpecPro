import {
  RUNNER_JOB_COMMAND_CONTRACT_VERSION,
  normalizeControlPlaneOrigin,
  type RunnerJobCommand,
  type RunnerJobReceipt,
  type RunnerJobReceiptEventType,
} from "./runnerContracts";

export type RunnerExecutionEligibility = {
  runnerId: string;
  tenantId: string;
  trustState: "pending" | "trusted" | "revoked" | "quarantined";
  status: "offline" | "online" | "degraded" | "revoked";
  activeSessionId: string | null;
  revokedAt: string | null;
};

export type RunnerExecutionCapability = {
  runnerSessionId?: string | null;
  tenantId?: string | null;
  capabilitySnapshotId?: string | null;
  controlPlaneOrigin?: string | null;
  revision: string;
  observedAt: string;
  expiresAt: string;
  browserReady: boolean;
  /** Adapter ids that passed an authenticated, bounded Runner probe. */
  externalAgentAdapters?: string[];
  authorizationEvidenceRef?: string;
};

export type RunnerReceiptState = {
  lastSequence: number;
  terminal: boolean;
  lastEventId?: string;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SECRET_KEYS = new Set([
  "accessToken",
  "apiKey",
  "authorization",
  "credential",
  "password",
  "privateKey",
  "refreshToken",
  "secret",
  "token",
]);

function text(value: unknown, field: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(`RUNNER_COMMAND_${field.toUpperCase()}_INVALID`);
  return value.trim();
}

function id(value: unknown, field: string): string {
  const normalized = text(value, field);
  if (!ID.test(normalized)) throw new Error(`RUNNER_COMMAND_${field.toUpperCase()}_INVALID`);
  return normalized;
}

function safePayload(value: unknown, path = "payload", depth = 0): void {
  if (depth > 6) throw new Error("RUNNER_COMMAND_PAYLOAD_TOO_DEEP");
  if (typeof value === "string") {
    if (value.length > 8_000) throw new Error("RUNNER_COMMAND_PAYLOAD_TOO_LARGE");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 64) throw new Error("RUNNER_COMMAND_PAYLOAD_TOO_LARGE");
    value.forEach((child, index) => safePayload(child, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) throw new Error("RUNNER_COMMAND_SECRET_FIELD");
    safePayload(child, `${path}.${key}`, depth + 1);
  }
}

export function validateRunnerJobCommand(raw: RunnerJobCommand): RunnerJobCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("RUNNER_COMMAND_INVALID");
  if (raw.contractVersion !== RUNNER_JOB_COMMAND_CONTRACT_VERSION)
    throw new Error("RUNNER_COMMAND_CONTRACT_UNSUPPORTED");
  if (raw.commandType !== "execute" && raw.commandType !== "cancel")
    throw new Error("RUNNER_COMMAND_TYPE_INVALID");
  for (const [value, field] of [
    [raw.commandId, "command_id"],
    [raw.jobId, "job_id"],
    [raw.leaseId, "lease_id"],
    [raw.tenantId, "tenant_id"],
    [raw.runnerId, "runner_id"],
    [raw.runnerSessionId, "runner_session_id"],
    [raw.capabilitySnapshotId, "capability_snapshot_id"],
    [raw.capabilitySnapshotRevision, "capability_snapshot_revision"],
    [raw.adapterId, "adapter_id"],
    [raw.idempotencyKey, "idempotency_key"],
    [raw.authorizationGrantRef, "authorization_grant_ref"],
    [raw.inputRef, "input_ref"],
  ] as const) id(value, field);
  const controlPlaneOrigin = (() => {
    try {
      return normalizeControlPlaneOrigin(raw.controlPlaneOrigin);
    } catch {
      throw new Error("RUNNER_CONTROL_PLANE_ORIGIN_INVALID");
    }
  })();
  if (!Number.isSafeInteger(raw.attempt) || raw.attempt < 1)
    throw new Error("RUNNER_COMMAND_ATTEMPT_INVALID");
  if (!Number.isSafeInteger(raw.fencingToken) || raw.fencingToken < 1)
    throw new Error("RUNNER_COMMAND_FENCE_INVALID");
  if (raw.executionKind !== "computer_use.browser" && raw.executionKind !== "external_agent_task")
    throw new Error("RUNNER_COMMAND_EXECUTION_KIND_UNSUPPORTED");
  if (
    (raw.executionKind === "computer_use.browser" && raw.adapterId !== "browser.v1")
    || (raw.executionKind === "external_agent_task" && !["codex.v1", "claude.v1"].includes(raw.adapterId))
  ) throw new Error("RUNNER_COMMAND_ADAPTER_UNSUPPORTED");
  if (raw.userId !== undefined && (!Number.isSafeInteger(raw.userId) || raw.userId <= 0))
    throw new Error("RUNNER_COMMAND_USER_INVALID");
  const deadline = Date.parse(raw.deadline);
  if (!Number.isFinite(deadline)) throw new Error("RUNNER_COMMAND_DEADLINE_INVALID");
  if (!raw.payload || typeof raw.payload !== "object" || Array.isArray(raw.payload))
    throw new Error("RUNNER_COMMAND_PAYLOAD_INVALID");
  safePayload(raw.payload);
  return structuredClone({ ...raw, controlPlaneOrigin });
}

export function assertRunnerExecutionEligibility(input: {
  command: RunnerJobCommand;
  runner: RunnerExecutionEligibility;
  capability: RunnerExecutionCapability;
  now: Date;
}): void {
  const command = validateRunnerJobCommand(input.command);
  const { runner, capability } = input;
  if (runner.runnerId !== command.runnerId) throw new Error("RUNNER_ID_MISMATCH");
  if (runner.tenantId !== command.tenantId) throw new Error("RUNNER_TENANT_MISMATCH");
  if (runner.trustState !== "trusted" || runner.status !== "online" || runner.revokedAt)
    throw new Error("RUNNER_NOT_ELIGIBLE");
  if (runner.activeSessionId !== command.runnerSessionId) throw new Error("RUNNER_SESSION_STALE");
  if (capability.tenantId !== command.tenantId) throw new Error("RUNNER_CAPABILITY_TENANT_MISMATCH");
  if (capability.runnerSessionId !== command.runnerSessionId)
    throw new Error("RUNNER_CAPABILITY_SESSION_MISMATCH");
  if (capability.capabilitySnapshotId !== command.capabilitySnapshotId)
    throw new Error("RUNNER_CAPABILITY_SNAPSHOT_MISMATCH");
  if (!capability.controlPlaneOrigin || capability.controlPlaneOrigin !== command.controlPlaneOrigin)
    throw new Error("RUNNER_CONTROL_PLANE_MISMATCH");
  if (capability.revision !== command.capabilitySnapshotRevision)
    throw new Error("RUNNER_CAPABILITY_REVISION_MISMATCH");
  if (command.executionKind === "computer_use.browser") {
    if (!capability.browserReady) throw new Error("RUNNER_BROWSER_NOT_READY");
  } else if (!capability.externalAgentAdapters?.includes(command.adapterId)) {
    throw new Error("RUNNER_EXTERNAL_AGENT_NOT_READY");
  }
  if (capability.authorizationEvidenceRef !== command.authorizationGrantRef)
    throw new Error("RUNNER_AUTHORIZATION_GRANT_MISMATCH");
  if (Date.parse(capability.expiresAt) <= input.now.getTime())
    throw new Error("RUNNER_CAPABILITY_STALE");
  if (Date.parse(command.deadline) <= input.now.getTime())
    throw new Error("RUNNER_COMMAND_DEADLINE_EXPIRED");
}

export function acceptRunnerJobReceipt(
  state: RunnerReceiptState,
  receipt: RunnerJobReceipt,
): "accepted" | "duplicate" | "out_of_order" | "late" {
  if (state.terminal) return "late";
  if (receipt.sequence < state.lastSequence) return "out_of_order";
  if (receipt.sequence === state.lastSequence) {
    return state.lastEventId === receipt.eventId ? "duplicate" : "out_of_order";
  }
  state.lastSequence = receipt.sequence;
  state.lastEventId = receipt.eventId;
  if (["EXECUTION_COMPLETED", "EXECUTION_FAILED", "CANCEL_ACKNOWLEDGED", "UNKNOWN_OUTCOME"].includes(receipt.eventType)) {
    state.terminal = true;
  }
  return "accepted";
}

/** Semantic Computer Use receipts carry execution evidence only. The durable
 * job may become terminal only after the independent Spec 208 verifier passes.
 */
export function shouldDeferRunnerExecutionCompletion(receipt: RunnerJobReceipt): boolean {
  return receipt.eventType === "EXECUTION_COMPLETED"
    && receipt.payload?.requiresIndependentVerification === true;
}

export function validateRunnerJobReceipt(raw: RunnerJobReceipt): RunnerJobReceipt {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("RUNNER_RECEIPT_INVALID");
  for (const [value, field] of [
    [raw.eventId, "event_id"],
    [raw.commandId, "command_id"],
    [raw.jobId, "job_id"],
    [raw.runnerId, "runner_id"],
    [raw.runnerSessionId, "runner_session_id"],
  ] as const) id(value, field);
  const events: RunnerJobReceiptEventType[] = [
    "COMMAND_RECEIVED",
    "COMMAND_ACCEPTED",
    "EXECUTION_STARTED",
    "PROGRESS",
    "EVIDENCE_CREATED",
    "EXECUTION_COMPLETED",
    "COMMAND_REJECTED",
    "EXECUTION_FAILED",
    "CANCEL_ACKNOWLEDGED",
    "UNKNOWN_OUTCOME",
  ];
  if (!events.includes(raw.eventType)) throw new Error("RUNNER_RECEIPT_EVENT_INVALID");
  if (!Number.isSafeInteger(raw.sequence) || raw.sequence < 1)
    throw new Error("RUNNER_RECEIPT_SEQUENCE_INVALID");
  if (!Number.isFinite(Date.parse(raw.observedAt))) throw new Error("RUNNER_RECEIPT_TIMESTAMP_INVALID");
  if (raw.resultRef !== undefined) id(raw.resultRef, "result_ref");
  if (raw.evidenceRefs !== undefined) {
    if (!Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.length > 64)
      throw new Error("RUNNER_RECEIPT_EVIDENCE_INVALID");
    raw.evidenceRefs.forEach((ref, index) => id(ref, `evidence_ref_${index}`));
  }
  if (raw.payload !== undefined) safePayload(raw.payload);
  return structuredClone(raw);
}
