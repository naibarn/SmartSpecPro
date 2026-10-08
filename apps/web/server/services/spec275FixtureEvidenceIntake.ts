import { createHash } from "node:crypto";

export const SPEC275_FIXTURE_FAILURE_CLASSES = [
  "MODEL_REASONING",
  "TOOL_RUNTIME",
  "POLICY_DENIAL",
  "RESOURCE_BLOCK",
  "EXTERNAL_WAIT",
  "VERIFICATION_FAILURE",
] as const;

export type Spec275FixtureFailureClass = (typeof SPEC275_FIXTURE_FAILURE_CLASSES)[number];
export type Spec275FixtureCategory =
  | "AGENT_REASONING_ERROR"
  | "TOOL_MISSING"
  | "PERMISSION_REQUIRED"
  | "RESOURCE_CONFLICT"
  | "EXTERNAL_DEPENDENCY"
  | "VERIFICATION_FAILURE"
  | "UNKNOWN";
type Spec275FixtureEventType = "EVIDENCE_RECORDED" | "PHASE_FAILED" | "VERIFICATION_OUTCOME" | "DEPENDENCY_WAIT_REGISTERED";

export type Spec275FixtureEvidenceInput = Readonly<{
  fixtureOnly: true;
  run: Readonly<{
    runId: string;
    phaseAttempt: number;
    tenantId: string;
    projectId: string;
    sourceSha: string;
  }>;
  event: Readonly<{
    eventId: string;
    runId: string;
    sequence: number;
    idempotencyKey: string;
    type: Spec275FixtureEventType;
    occurredAt: string;
    payload: Readonly<Record<string, unknown>>;
  }>;
  receiptRef: Readonly<{
    receiptId: string;
    receiptDigest: string;
    status: "VALIDATED_UNPERSISTED" | "OBJECT_PERSISTED_REVALIDATED" | "SYNTHETIC_FIXTURE";
    requirementId: string;
    sourceSha: string;
    uatRunId: string;
    attemptId: string;
    tenantId: string;
    projectId: string;
  }>;
  failureClass: Spec275FixtureFailureClass;
  evidenceRefs: readonly string[];
  signature: string;
  symptom: string;
  detectedBy: string;
  classificationEvidence?: Readonly<{ toolAbsenceProven?: boolean; policyDecisionRef?: string }>;
}>;

export type Spec275NormalizedFixtureObservation = Readonly<{
  fixtureOnly: true;
  productionEligible: false;
  autoPromotionAllowed: false;
  observation: Readonly<{
    failureId: string;
    run_id: string;
    stage: string;
    category: Spec275FixtureCategory;
    signature: string;
    symptom: string;
    evidence_refs: readonly string[];
    detected_by: string;
  }>;
  lineage: Readonly<{
    failureClass: Spec275FixtureFailureClass;
    sourceSha: string;
    requirementId: string;
    runId: string;
    phaseAttempt: number;
    tenantId: string;
    projectId: string;
    eventId: string;
    eventSequence: number;
    idempotencyKey: string;
    eventType: Spec275FixtureEventType;
    eventOccurredAt: string;
    receiptId: string;
    receiptDigest: string;
    receiptStatus: Spec275FixtureEvidenceInput["receiptRef"]["status"];
    uatRunId: string;
    attemptId: string;
    payloadDigest: string;
  }>;
}>;

export type Spec275FixtureIntakeResult =
  | Readonly<{ status: "NORMALIZED"; value: Spec275NormalizedFixtureObservation }>
  | Readonly<{ status: "IDEMPOTENT_REPLAY"; value: Spec275NormalizedFixtureObservation }>
  | Readonly<{ status: "QUARANTINED"; reason: "EVENT_CONFLICT" | "OUT_OF_ORDER"; value: Spec275NormalizedFixtureObservation }>
  | Readonly<{ status: "REJECTED"; reason: string }>;

const SOURCE_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const REQUIREMENT_ID = /^REQ-[A-F0-9]{12}$/;

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function categoryFor(input: Spec275FixtureEvidenceInput): Spec275FixtureCategory {
  switch (input.failureClass) {
    case "MODEL_REASONING": return input.event.type === "VERIFICATION_OUTCOME" || typeof input.event.payload.humanReviewRef === "string"
      ? "AGENT_REASONING_ERROR" : "UNKNOWN";
    case "TOOL_RUNTIME": return input.classificationEvidence?.toolAbsenceProven === true ? "TOOL_MISSING" : "UNKNOWN";
    case "POLICY_DENIAL": return input.classificationEvidence?.policyDecisionRef ? "PERMISSION_REQUIRED" : "UNKNOWN";
    case "RESOURCE_BLOCK": return "RESOURCE_CONFLICT";
    case "EXTERNAL_WAIT": return "EXTERNAL_DEPENDENCY";
    case "VERIFICATION_FAILURE": return "VERIFICATION_FAILURE";
  }
}

/** Pure, fixture-only adapter. It never reads or writes runtime state and cannot promote learning. */
export function normalizeSpec275FixtureEvidence(input: Spec275FixtureEvidenceInput, options: {
  now: string;
  maxAgeMs: number;
  expectedScope: Readonly<{ tenantId: string; projectId: string }>;
  priorEventSequence?: number;
  prior?: readonly Spec275NormalizedFixtureObservation[];
}): Spec275FixtureIntakeResult {
  const reject = (reason: string): Spec275FixtureIntakeResult => ({ status: "REJECTED", reason });
  if (!input || input.fixtureOnly !== true) return reject("SYNTHETIC_FIXTURE_REQUIRED");
  const { run, event, receiptRef } = input;
  if (!run || !event || !receiptRef || !REQUIREMENT_ID.test(receiptRef.requirementId)) return reject("IDENTITY_REQUIRED");
  if (!SOURCE_SHA.test(run.sourceSha) || run.sourceSha !== receiptRef.sourceSha || run.sourceSha !== event.payload.sourceSha) return reject("SOURCE_SHA_MISMATCH");
  if (event.runId !== run.runId || event.payload.runId !== run.runId) return reject("RUN_ID_MISMATCH");
  if (!Number.isInteger(run.phaseAttempt) || run.phaseAttempt < 1 || event.payload.phaseAttempt !== run.phaseAttempt) return reject("ATTEMPT_MISMATCH");
  if (!Number.isInteger(event.sequence) || event.sequence < 1 || event.payload.eventSequence !== event.sequence) return reject("EVENT_SEQUENCE_INVALID");
  if (run.tenantId !== options.expectedScope.tenantId || receiptRef.tenantId !== run.tenantId || event.payload.tenantId !== run.tenantId) return reject("TENANT_SCOPE_MISMATCH");
  if (run.projectId !== options.expectedScope.projectId || receiptRef.projectId !== run.projectId || event.payload.projectId !== run.projectId) return reject("PROJECT_SCOPE_MISMATCH");
  if (receiptRef.uatRunId !== event.payload.uatRunId || receiptRef.attemptId !== event.payload.attemptId) return reject("RECEIPT_RUN_BINDING_MISMATCH");
  if (receiptRef.receiptId !== event.payload.receiptId || receiptRef.receiptDigest !== event.payload.receiptDigest) return reject("RECEIPT_EVENT_BINDING_MISMATCH");
  if (event.payload.failureClass !== input.failureClass) return reject("FAILURE_CLASS_MISMATCH");
  if (!receiptRef.receiptId.trim() || !DIGEST.test(receiptRef.receiptDigest)) return reject("RECEIPT_REFERENCE_INVALID");
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0 || input.evidenceRefs.some(ref => !ref.trim())) return reject("EVIDENCE_REQUIRED");
  if (!SPEC275_FIXTURE_FAILURE_CLASSES.includes(input.failureClass)) return reject("FAILURE_CLASS_INVALID");
  if (![event.eventId, event.idempotencyKey, input.signature, input.symptom, input.detectedBy].every(value => typeof value === "string" && value.trim())) return reject("OBSERVATION_FIELDS_REQUIRED");
  const eventTime = Date.parse(event.occurredAt);
  const now = Date.parse(options.now);
  if (!Number.isFinite(eventTime) || !Number.isFinite(now) || !Number.isFinite(options.maxAgeMs) || options.maxAgeMs < 0) return reject("FRESHNESS_POLICY_INVALID");
  if (eventTime > now || now - eventTime > options.maxAgeMs) return reject("EVIDENCE_STALE_OR_FUTURE");

  const payloadDigest = digest({ run, event, receiptRef, failureClass: input.failureClass, evidenceRefs: input.evidenceRefs, signature: input.signature, symptom: input.symptom, detectedBy: input.detectedBy, classificationEvidence: input.classificationEvidence });
  const failureId = `spec275-fixture:${digest({ idempotencyKey: event.idempotencyKey, receiptId: receiptRef.receiptId, failureClass: input.failureClass }).slice(0, 32)}`;
  const value: Spec275NormalizedFixtureObservation = {
    fixtureOnly: true,
    productionEligible: false,
    autoPromotionAllowed: false,
    observation: {
      failureId,
      run_id: run.runId,
      stage: event.type === "VERIFICATION_OUTCOME" ? "verification" : input.failureClass.toLowerCase(),
      category: categoryFor(input),
      signature: input.signature,
      symptom: input.symptom,
      evidence_refs: [...new Set([receiptRef.receiptId, ...input.evidenceRefs])].sort(),
      detected_by: input.detectedBy,
    },
    lineage: {
      failureClass: input.failureClass,
      sourceSha: run.sourceSha,
      requirementId: receiptRef.requirementId,
      runId: run.runId,
      phaseAttempt: run.phaseAttempt,
      tenantId: run.tenantId,
      projectId: run.projectId,
      eventId: event.eventId,
      eventSequence: event.sequence,
      idempotencyKey: event.idempotencyKey,
      eventType: event.type,
      eventOccurredAt: event.occurredAt,
      receiptId: receiptRef.receiptId,
      receiptDigest: receiptRef.receiptDigest,
      receiptStatus: receiptRef.status,
      uatRunId: receiptRef.uatRunId,
      attemptId: receiptRef.attemptId,
      payloadDigest,
    },
  };

  const prior = options.prior?.find(item => item.lineage.idempotencyKey === event.idempotencyKey);
  if (prior) return prior.lineage.receiptId === receiptRef.receiptId &&
    prior.lineage.failureClass === input.failureClass && prior.lineage.payloadDigest === payloadDigest
    ? { status: "IDEMPOTENT_REPLAY", value: prior }
    : { status: "QUARANTINED", reason: "EVENT_CONFLICT", value };
  if (options.priorEventSequence !== undefined && event.sequence <= options.priorEventSequence) {
    return { status: "QUARANTINED", reason: "OUT_OF_ORDER", value };
  }
  return { status: "NORMALIZED", value };
}
