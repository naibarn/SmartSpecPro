import { describe, expect, it } from "vitest";

import {
  normalizeSpec275FixtureEvidence,
  SPEC275_FIXTURE_FAILURE_CLASSES,
  type Spec275FixtureEvidenceInput,
} from "../spec275FixtureEvidenceIntake";

const NOW = "2026-10-08T10:00:00.000Z";
const SOURCE = "a".repeat(40);
const RECEIPT_DIGEST = "b".repeat(64);

function fixture(overrides: Partial<Spec275FixtureEvidenceInput> = {}): Spec275FixtureEvidenceInput {
  const result: Spec275FixtureEvidenceInput = {
    fixtureOnly: true,
    run: { runId: "run-fixture-1", phaseAttempt: 2, tenantId: "tenant-a", projectId: "project-a", sourceSha: SOURCE },
    event: {
      eventId: "event-3", runId: "run-fixture-1", sequence: 3, idempotencyKey: "failure:event-3",
      type: "VERIFICATION_OUTCOME", occurredAt: "2026-10-08T09:59:00.000Z",
      payload: {
        runId: "run-fixture-1", phaseAttempt: 2, eventSequence: 3,
        tenantId: "tenant-a", projectId: "project-a", sourceSha: SOURCE,
        uatRunId: "uat-1", attemptId: "attempt-2", receiptId: "spec271-receipt:fixture",
        receiptDigest: RECEIPT_DIGEST, failureClass: "VERIFICATION_FAILURE",
      },
    },
    receiptRef: {
      receiptId: "spec271-receipt:fixture", receiptDigest: RECEIPT_DIGEST,
      status: "OBJECT_PERSISTED_REVALIDATED", requirementId: "REQ-962CDCE30AEF",
      sourceSha: SOURCE, uatRunId: "uat-1", attemptId: "attempt-2", tenantId: "tenant-a", projectId: "project-a",
    },
    failureClass: "VERIFICATION_FAILURE",
    evidenceRefs: ["artifact:failure-assertion"],
    signature: "assertion:expected-failure",
    symptom: "Synthetic independent verification failure",
    detectedBy: "fixture-test",
    ...overrides,
  };
  if (!overrides.event) {
    return { ...result, event: { ...result.event, payload: { ...result.event.payload, failureClass: result.failureClass } } };
  }
  return result;
}

function normalize(input = fixture(), extra: Record<string, unknown> = {}) {
  return normalizeSpec275FixtureEvidence(input, {
    now: NOW,
    maxAgeMs: 120_000,
    expectedScope: { tenantId: "tenant-a", projectId: "project-a" },
    ...extra,
  });
}

describe("SPEC-275 fixture evidence intake", () => {
  it("normalizes a valid fixture and preserves source/run/attempt/event/receipt lineage", () => {
    const result = normalize();
    expect(result.status).toBe("NORMALIZED");
    if (result.status !== "NORMALIZED") return;
    expect(result.value.lineage).toMatchObject({
      sourceSha: SOURCE, requirementId: "REQ-962CDCE30AEF", runId: "run-fixture-1", phaseAttempt: 2,
      eventId: "event-3", eventSequence: 3, receiptId: "spec271-receipt:fixture", receiptDigest: RECEIPT_DIGEST,
      uatRunId: "uat-1", attemptId: "attempt-2",
    });
    expect(result.value).toMatchObject({ fixtureOnly: true, productionEligible: false, autoPromotionAllowed: false });
  });

  it("keeps all six failure classes distinct", () => {
    expect(SPEC275_FIXTURE_FAILURE_CLASSES).toHaveLength(6);
    const values = SPEC275_FIXTURE_FAILURE_CLASSES.map(failureClass => normalize(fixture({ failureClass })));
    expect(values.every(value => value.status === "NORMALIZED")).toBe(true);
    expect(values.map(value => value.status === "NORMALIZED" && value.value.lineage.failureClass)).toEqual([...SPEC275_FIXTURE_FAILURE_CLASSES]);
  });

  it("maps classes conservatively and does not infer tool or policy authority", () => {
    const tool = normalize(fixture({ failureClass: "TOOL_RUNTIME" }));
    const policy = normalize(fixture({ failureClass: "POLICY_DENIAL" }));
    const provenTool = normalize(fixture({ failureClass: "TOOL_RUNTIME", classificationEvidence: { toolAbsenceProven: true } }));
    const approvedPolicy = normalize(fixture({ failureClass: "POLICY_DENIAL", classificationEvidence: { policyDecisionRef: "policy-decision:1" } }));
    expect(tool.status === "NORMALIZED" && tool.value.observation.category).toBe("UNKNOWN");
    expect(policy.status === "NORMALIZED" && policy.value.observation.category).toBe("UNKNOWN");
    expect(provenTool.status === "NORMALIZED" && provenTool.value.observation.category).toBe("TOOL_MISSING");
    expect(approvedPolicy.status === "NORMALIZED" && approvedPolicy.value.observation.category).toBe("PERMISSION_REQUIRED");
  });

  it("rejects source, run, attempt, tenant, and project mismatches", () => {
    expect(normalize(fixture({ run: { ...fixture().run, sourceSha: "c".repeat(40) } }))).toMatchObject({ status: "REJECTED", reason: "SOURCE_SHA_MISMATCH" });
    expect(normalize(fixture({ event: { ...fixture().event, runId: "other" } }))).toMatchObject({ status: "REJECTED", reason: "RUN_ID_MISMATCH" });
    expect(normalize(fixture({ event: { ...fixture().event, payload: { ...fixture().event.payload, phaseAttempt: 99 } } }))).toMatchObject({ status: "REJECTED", reason: "ATTEMPT_MISMATCH" });
    expect(normalize(fixture({ receiptRef: { ...fixture().receiptRef, tenantId: "tenant-b" } }))).toMatchObject({ status: "REJECTED", reason: "TENANT_SCOPE_MISMATCH" });
    expect(normalize(fixture(), { expectedScope: { tenantId: "tenant-a", projectId: "project-b" } })).toMatchObject({ status: "REJECTED", reason: "PROJECT_SCOPE_MISMATCH" });
  });

  it("rejects missing event sequence and receipt or classification lineage", () => {
    const base = fixture();
    expect(normalize(fixture({ event: { ...base.event, payload: { ...base.event.payload, eventSequence: undefined } } }))).toMatchObject({ status: "REJECTED", reason: "EVENT_SEQUENCE_INVALID" });
    expect(normalize(fixture({ event: { ...base.event, payload: { ...base.event.payload, receiptDigest: "c".repeat(64) } } }))).toMatchObject({ status: "REJECTED", reason: "RECEIPT_EVENT_BINDING_MISMATCH" });
    expect(normalize(fixture({ event: { ...base.event, payload: { ...base.event.payload, failureClass: "TOOL_RUNTIME" } } }))).toMatchObject({ status: "REJECTED", reason: "FAILURE_CLASS_MISMATCH" });
  });

  it("requires evidence and rejects missing or stale evidence", () => {
    expect(normalize(fixture({ evidenceRefs: [] }))).toMatchObject({ status: "REJECTED", reason: "EVIDENCE_REQUIRED" });
    expect(normalize(fixture({ event: { ...fixture().event, occurredAt: "2026-10-08T09:00:00.000Z" } }))).toMatchObject({ status: "REJECTED", reason: "EVIDENCE_STALE_OR_FUTURE" });
  });

  it("returns a deterministic idempotent replay for the same event payload", () => {
    const first = normalize();
    if (first.status !== "NORMALIZED") throw new Error("fixture should normalize");
    const replay = normalize(fixture(), { prior: [first.value] });
    expect(replay).toEqual({ status: "IDEMPOTENT_REPLAY", value: first.value });
    expect(normalize()).toEqual(first);
  });

  it("quarantines conflicting replay and out-of-order events", () => {
    const first = normalize();
    if (first.status !== "NORMALIZED") throw new Error("fixture should normalize");
    expect(normalize(fixture({ symptom: "different payload" }), { prior: [first.value] })).toMatchObject({ status: "QUARANTINED", reason: "EVENT_CONFLICT" });
    expect(normalize(fixture({ failureClass: "TOOL_RUNTIME" }), { prior: [first.value] })).toMatchObject({ status: "QUARANTINED", reason: "EVENT_CONFLICT" });
    expect(normalize(fixture(), { priorEventSequence: 3 })).toMatchObject({ status: "QUARANTINED", reason: "OUT_OF_ORDER" });
  });

  it("keeps persisted object status separate from acceptance", () => {
    const result = normalize();
    expect(result.status).toBe("NORMALIZED");
    if (result.status !== "NORMALIZED") return;
    expect(result.value.lineage.receiptStatus).toBe("OBJECT_PERSISTED_REVALIDATED");
    expect(result.value).not.toHaveProperty("accepted");
    expect(result.value.autoPromotionAllowed).toBe(false);
  });

  it("rejects a non-fixture input so this adapter cannot ingest production events", () => {
    expect(normalize(fixture({ fixtureOnly: false as true }))).toMatchObject({ status: "REJECTED", reason: "SYNTHETIC_FIXTURE_REQUIRED" });
  });
});
