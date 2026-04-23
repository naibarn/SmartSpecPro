import crypto from "crypto";

import type {
  PreflightApprovalBundle,
  PreflightApprovalBundleState,
  PreflightIdempotencyRecord,
} from "../../shared/workOrchestrator";

export interface TransitionPreflightBundleInput {
  bundle: PreflightApprovalBundle;
  toState: PreflightApprovalBundleState;
  event: string;
  actorUserId?: number | null;
  reasonCode: string;
  correlationId?: string;
  occurredAt?: Date | string;
}

export interface IdempotencyCheckInput {
  bundle: Pick<PreflightApprovalBundle, "idempotencyRecords">;
  operation: string;
  idempotencyKey: string;
  inputFingerprint: string;
}

export interface IdempotencyCheckResult {
  matched: boolean;
  conflict: boolean;
  record: PreflightIdempotencyRecord | null;
}

const ALLOWED_TRANSITIONS: Record<
  PreflightApprovalBundleState,
  readonly PreflightApprovalBundleState[]
> = {
  draft: ["previewed", "cancelled"],
  previewed: ["approved", "stale", "superseded", "cancelled"],
  approved: ["launching", "launch_blocked", "stale", "superseded", "cancelled"],
  stale: ["previewed", "cancelled"],
  launch_blocked: ["previewed", "approved", "cancelled"],
  launching: ["launched", "launch_blocked"],
  launched: [],
  cancelled: [],
  superseded: [],
};

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

function stableHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function assertPreflightTransition(
  fromState: PreflightApprovalBundleState,
  toState: PreflightApprovalBundleState,
): void {
  if (fromState === toState) {
    return;
  }
  if (!ALLOWED_TRANSITIONS[fromState].includes(toState)) {
    throw new Error(
      `PREVIEW_TRANSITION_INVALID:${fromState}->${toState}`,
    );
  }
}

export function transitionPreflightBundle(
  input: TransitionPreflightBundleInput,
): PreflightApprovalBundle {
  assertPreflightTransition(input.bundle.state, input.toState);

  const occurredAt = toIsoDate(input.occurredAt);
  const nextBundle: PreflightApprovalBundle = {
    ...input.bundle,
    state: input.toState,
    updatedAt: occurredAt,
    approvedAt:
      input.toState === "approved"
        ? occurredAt
        : input.bundle.approvedAt ?? null,
    approvedByUserId:
      input.toState === "approved"
        ? input.actorUserId ?? null
        : input.bundle.approvedByUserId ?? null,
    launchedAt:
      input.toState === "launched"
        ? occurredAt
        : input.bundle.launchedAt ?? null,
    stateTransitions: [
      ...input.bundle.stateTransitions,
      {
        event: input.event,
        fromState: input.bundle.state,
        toState: input.toState,
        actorUserId: input.actorUserId ?? null,
        reasonCode: input.reasonCode,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        occurredAt,
      },
    ],
  };

  return nextBundle;
}

export function checkIdempotency(
  input: IdempotencyCheckInput,
): IdempotencyCheckResult {
  const expectedFingerprint = stableHash(input.inputFingerprint);
  const record =
    input.bundle.idempotencyRecords.find(
      candidate =>
        candidate.operation === input.operation &&
        candidate.idempotencyKey === input.idempotencyKey,
    ) ?? null;

  if (!record) {
    return { matched: false, conflict: false, record: null };
  }

  return {
    matched: record.inputFingerprint === expectedFingerprint,
    conflict: record.inputFingerprint !== expectedFingerprint,
    record,
  };
}

export function appendIdempotencyRecord(input: {
  bundle: PreflightApprovalBundle;
  operation: string;
  idempotencyKey: string;
  inputFingerprint: string;
  result: Record<string, unknown>;
  createdAt?: Date | string;
}): PreflightApprovalBundle {
  const createdAt = toIsoDate(input.createdAt);
  return {
    ...input.bundle,
    updatedAt: createdAt,
    idempotencyRecords: [
      ...input.bundle.idempotencyRecords.filter(
        record =>
          !(
            record.operation === input.operation &&
            record.idempotencyKey === input.idempotencyKey
          ),
      ),
      {
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
        inputFingerprint: stableHash(input.inputFingerprint),
        createdAt,
        result: input.result,
      },
    ],
  };
}
