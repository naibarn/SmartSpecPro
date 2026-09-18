import { createHash, randomUUID } from "node:crypto";

export interface VideoEditorExecutionAdmissionInput {
  tenantId: string;
  projectId: number;
  revisionId: string;
  revisionNumber: number;
  idempotencyKey: string;
  operation: string;
  contractVersion: string;
  sourceFingerprints: string[];
  projectDocument: Record<string, unknown>;
  capabilityProfile: Record<string, unknown>;
  policy: Record<string, unknown>;
}

export interface VideoEditorExecutionSnapshot {
  snapshotId: string;
  tenantId: string;
  projectId: number;
  revisionId: string;
  revisionNumber: number;
  idempotencyKey: string;
  operation: string;
  contractVersion: string;
  sourceFingerprints: string[];
  projectDocument: Record<string, unknown>;
  capabilityProfile: Record<string, unknown>;
  policy: Record<string, unknown>;
  snapshotHash: string;
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_SOURCE =
  /^(?:sha256:[a-f0-9]{8,128}|managed:[A-Za-z0-9._:-]{1,160})$/i;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stable(item)])
  );
}

function rejectUnsafe(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    !serialized ||
    /(?:^|[\\/])(?:tmp|home|Users|var)(?:[\\/])|\.\.[\\/]|(?:api[_-]?key|secret|password|token)\s*:/i.test(
      serialized
    )
  ) {
    throw new Error("EDITORIAL_UNSAFE_INPUT");
  }
}

export async function buildVideoEditorExecutionSnapshot(
  input: VideoEditorExecutionAdmissionInput
): Promise<VideoEditorExecutionSnapshot> {
  if (
    !SAFE_ID.test(input.tenantId) ||
    !Number.isSafeInteger(input.projectId) ||
    input.projectId <= 0 ||
    !SAFE_ID.test(input.revisionId) ||
    !Number.isSafeInteger(input.revisionNumber) ||
    input.revisionNumber <= 0 ||
    !SAFE_ID.test(input.idempotencyKey) ||
    !SAFE_ID.test(input.contractVersion) ||
    !SAFE_ID.test(input.operation)
  ) {
    throw new Error("ADMISSION_INPUT_INVALID");
  }
  if (
    !Array.isArray(input.sourceFingerprints) ||
    input.sourceFingerprints.length === 0 ||
    input.sourceFingerprints.some(source => !SAFE_SOURCE.test(source))
  ) {
    throw new Error("SOURCE_REFERENCE_INVALID");
  }
  rejectUnsafe(input.projectDocument);
  rejectUnsafe(input.capabilityProfile);
  rejectUnsafe(input.policy);
  const base = {
    tenantId: input.tenantId,
    projectId: input.projectId,
    revisionId: input.revisionId,
    revisionNumber: input.revisionNumber,
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
    contractVersion: input.contractVersion,
    sourceFingerprints: [...input.sourceFingerprints].sort(),
    projectDocument: input.projectDocument,
    capabilityProfile: input.capabilityProfile,
    policy: input.policy,
  };
  const snapshotHash = createHash("sha256")
    .update(JSON.stringify(stable(base)), "utf8")
    .digest("hex");
  return { ...base, snapshotId: `snapshot-${randomUUID()}`, snapshotHash };
}

export type VideoEditorAdmissionFailureProjection =
  | {
      state: "blocked";
      reason:
        | "source_invalid"
        | "stale_revision"
        | "unsupported_capability"
        | "billing_failed";
    }
  | { state: "waiting_agent"; reason: "agent_unavailable" };

export function classifyVideoEditorAdmissionFailure(
  code: string
): VideoEditorAdmissionFailureProjection {
  switch (code) {
    case "SOURCE_REFERENCE_INVALID":
      return { state: "blocked", reason: "source_invalid" };
    case "STALE_REVISION":
      return { state: "blocked", reason: "stale_revision" };
    case "NO_ELIGIBLE_AGENT":
      return { state: "waiting_agent", reason: "agent_unavailable" };
    case "BILLING_RESERVATION_FAILED":
      return { state: "blocked", reason: "billing_failed" };
    default:
      return { state: "blocked", reason: "unsupported_capability" };
  }
}
