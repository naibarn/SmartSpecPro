import { digestSpec224EvidenceManifest } from "./spec224VerificationProvenance";
import type { CanonicalProjectContextState } from "./canonicalProjectContextResolver";

export type Spec302ReceiptOperationCeiling =
  | "NONE"
  | "PROJECT_READ"
  | "PROJECT_WRITE";

/**
 * Allow-listed, already-canonicalized metadata for comparing an idempotent
 * replay. This contract does not issue, persist, validate, or authorize a
 * ProjectResolutionReceipt.
 */
export type Spec302ProjectResolutionReplayPayload = Readonly<{
  tenantId: string;
  principalId: string;
  appId: string | null;
  canonicalProjectId: string | null;
  sessionId: string | null;
  conversationId: string | null;
  noSessionSelection: boolean;
  resolutionState: CanonicalProjectContextState;
  provenance: string;
  resolverPolicyVersion: string;
  authorizationPolicyVersion: string;
  authorizationReference: string;
  operationCeiling: Spec302ReceiptOperationCeiling;
}>;

export type Spec302ProjectResolutionReplayCandidate = Readonly<{
  idempotencyKey: string;
  payload: Spec302ProjectResolutionReplayPayload;
}>;

export type Spec302ProjectResolutionReplayResult = Readonly<{
  outcome: "NEW_KEY" | "EXACT_REPLAY" | "IDEMPOTENCY_CONFLICT";
  /** Internal consistency digest only; it is guessable metadata, never a credential. */
  normalizedPayloadDigest: string;
}>;

const PROJECT_RESOLVED_STATES = new Set<CanonicalProjectContextState>([
  "RESOLVED_EXPLICIT",
  "RESOLVED_CONTEXTUAL",
  "RESOLVED_INFERRED",
]);

const RESOLUTION_STATES = new Set<CanonicalProjectContextState>([
  ...PROJECT_RESOLVED_STATES,
  "AMBIGUOUS",
  "UNRESOLVED",
  "NO_PROJECT",
  "SESSION_PENDING_SCOPE",
]);

const CANDIDATE_KEYS = ["idempotencyKey", "payload"] as const;
const PAYLOAD_KEYS = [
  "tenantId",
  "principalId",
  "appId",
  "canonicalProjectId",
  "sessionId",
  "conversationId",
  "noSessionSelection",
  "resolutionState",
  "provenance",
  "resolverPolicyVersion",
  "authorizationPolicyVersion",
  "authorizationReference",
  "operationCeiling",
] as const;

export class Spec302ReceiptReplayContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "Spec302ReceiptReplayContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function fail(code: string): never {
  throw new Spec302ReceiptReplayContractError(code);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): void {
  const ownKeys = Reflect.ownKeys(value);
  if (
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    ownKeys.some(key => typeof key !== "string")
  ) {
    fail("REPLAY_PAYLOAD_FIELDS_INVALID");
  }
  const actual = (ownKeys as string[]).sort();
  const allowed = [...expected].sort();
  if (
    actual.length !== allowed.length ||
    actual.some((key, index) => key !== allowed[index]) ||
    actual.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor || !descriptor.enumerable || !("value" in descriptor);
    })
  ) {
    fail("REPLAY_PAYLOAD_FIELDS_INVALID");
  }
}

function assertCanonicalString(
  value: unknown,
  code: string
): asserts value is string {
  if (typeof value !== "string" || !value || value.trim() !== value) fail(code);
}

function assertNullableCanonicalString(
  value: unknown,
  code: string
): asserts value is string | null {
  if (value === null) return;
  assertCanonicalString(value, code);
}

function validateCandidate(
  candidate: Spec302ProjectResolutionReplayCandidate
): Spec302ProjectResolutionReplayPayload {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return fail("REPLAY_CANDIDATE_INVALID");
  }
  assertExactKeys(candidate as Record<string, unknown>, CANDIDATE_KEYS);
  assertCanonicalString(candidate.idempotencyKey, "IDEMPOTENCY_KEY_INVALID");

  const payload = candidate.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fail("REPLAY_PAYLOAD_INVALID");
  }
  assertExactKeys(payload as Record<string, unknown>, PAYLOAD_KEYS);
  assertCanonicalString(payload.tenantId, "TENANT_ID_INVALID");
  assertCanonicalString(payload.principalId, "PRINCIPAL_ID_INVALID");
  assertNullableCanonicalString(payload.appId, "APP_ID_INVALID");
  assertNullableCanonicalString(
    payload.canonicalProjectId,
    "PROJECT_ID_INVALID"
  );
  assertNullableCanonicalString(payload.sessionId, "SESSION_ID_INVALID");
  assertNullableCanonicalString(
    payload.conversationId,
    "CONVERSATION_ID_INVALID"
  );
  assertCanonicalString(payload.provenance, "PROVENANCE_INVALID");
  assertCanonicalString(
    payload.resolverPolicyVersion,
    "RESOLVER_POLICY_VERSION_INVALID"
  );
  assertCanonicalString(
    payload.authorizationPolicyVersion,
    "AUTHORIZATION_POLICY_VERSION_INVALID"
  );
  assertCanonicalString(
    payload.authorizationReference,
    "AUTHORIZATION_REFERENCE_INVALID"
  );

  if (!RESOLUTION_STATES.has(payload.resolutionState)) {
    fail("RESOLUTION_STATE_INVALID");
  }
  const resolved = PROJECT_RESOLVED_STATES.has(payload.resolutionState);
  if (resolved !== Boolean(payload.canonicalProjectId)) {
    fail("PROJECT_DESTINATION_STATE_MISMATCH");
  }
  if (typeof payload.noSessionSelection !== "boolean") {
    fail("SESSION_BINDING_INVALID");
  }
  const hasInvocationBinding = Boolean(
    payload.sessionId || payload.conversationId
  );
  if (
    (payload.noSessionSelection &&
      (hasInvocationBinding ||
        payload.resolutionState !== "RESOLVED_EXPLICIT")) ||
    (!payload.noSessionSelection && !hasInvocationBinding)
  ) {
    fail("SESSION_BINDING_INVALID");
  }
  if (
    payload.operationCeiling !== "NONE" &&
    payload.operationCeiling !== "PROJECT_READ" &&
    payload.operationCeiling !== "PROJECT_WRITE"
  ) {
    fail("OPERATION_CEILING_INVALID");
  }
  if (payload.operationCeiling !== "NONE" && (!resolved || !payload.appId)) {
    fail("OPERATION_CEILING_SCOPE_INVALID");
  }

  return payload;
}

/** Stable metadata-only digest; callers must canonicalize identity values first. */
export function digestSpec302ProjectResolutionReplayPayload(
  payload: Spec302ProjectResolutionReplayPayload
): string {
  const validated = validateCandidate({
    idempotencyKey: "digest-only",
    payload,
  });
  return digestSpec224EvidenceManifest(validated);
}

/**
 * Compare idempotency intent only. EXACT_REPLAY does not return or validate a
 * receipt and cannot grant access; eventual operations still require durable
 * storage and a fresh authorization check.
 */
export function compareSpec302ProjectResolutionReplay(
  existing: Spec302ProjectResolutionReplayCandidate,
  candidate: Spec302ProjectResolutionReplayCandidate
): Spec302ProjectResolutionReplayResult {
  const existingPayload = validateCandidate(existing);
  const candidatePayload = validateCandidate(candidate);
  const normalizedPayloadDigest =
    digestSpec224EvidenceManifest(candidatePayload);

  if (existing.idempotencyKey !== candidate.idempotencyKey) {
    return { outcome: "NEW_KEY", normalizedPayloadDigest };
  }

  return {
    outcome:
      digestSpec224EvidenceManifest(existingPayload) === normalizedPayloadDigest
        ? "EXACT_REPLAY"
        : "IDEMPOTENCY_CONFLICT",
    normalizedPayloadDigest,
  };
}
