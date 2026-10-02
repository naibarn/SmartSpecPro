import { describe, expect, it } from "vitest";
import {
  canTransitionIncident,
  canTransitionNeed,
  canTransitionResponseTask,
  toPublicSituationProjection,
  transitionIncidentStatus,
  validateHazardType,
  validateProvenance,
  type SituationSource,
} from "@smartspec/shared/src/emergency";

const audit = {
  auditEventId: "audit-1",
  tenantId: "tenant-1",
  aggregateId: "incident-1",
  actorRef: "responder-1",
  reason: "Verified hazard changed",
  occurredAt: "2026-09-30T10:00:00.000Z",
  previousRevision: 4,
  previousEventHash: "a".repeat(64),
};

describe("Spec 260 shared safety contracts", () => {
  it("accepts versioned, extensible hazard codes and validates provenance bounds", () => {
    expect(validateHazardType({ category: "unknown-multi-hazard", code: "future-hazard-42", taxonomyVersion: "2026-09" })).toBe(true);
    expect(validateProvenance({
      sourceType: "person", sourceRef: "reporter-1", observedAt: "2026-09-30T09:59:00.000Z",
      receivedAt: "2026-09-30T10:00:00.000Z", freshness: "current", confidence: 0.8, evidenceRefs: [],
    })).toBe(true);
    expect(validateProvenance({
      sourceType: "person", sourceRef: "reporter-1", observedAt: "2026-09-30T10:01:00.000Z",
      receivedAt: "2026-09-30T10:00:00.000Z", freshness: "current", confidence: 1.2, evidenceRefs: [],
    })).toBe(false);
  });

  it("keeps incident, need, and task transitions independent", () => {
    expect(canTransitionIncident("ACTIVE", "STABILIZING")).toBe(true);
    expect(canTransitionIncident("CLOSED", "ACTIVE")).toBe(false);
    expect(canTransitionIncident("CLOSED", "REOPENED")).toBe(true);
    expect(canTransitionNeed("OPEN", "PARTIALLY_FULFILLED")).toBe(true);
    expect(canTransitionNeed("UNVERIFIED", "VERIFIED")).toBe(true);
    expect(canTransitionNeed("VERIFIED", "OPEN")).toBe(true);
    expect(canTransitionNeed("PARTIALLY_FULFILLED", "VERIFIED_FULFILLED")).toBe(false);
    expect(canTransitionResponseTask("ACCEPTED", "EN_ROUTE")).toBe(true);
    expect(canTransitionResponseTask("ACCEPTED", "COMPLETED")).toBe(true);
  });

  it("requires a valid transition and returns its append-audit event", () => {
    const result = transitionIncidentStatus("ACTIVE", "STABILIZING", audit, "b".repeat(64));
    expect(result.status).toBe("STABILIZING");
    expect(result.audit).toMatchObject({
      tenantId: "tenant-1", aggregateId: "incident-1", previousRevision: 4,
      nextRevision: 5, previousEventHash: "a".repeat(64), eventHash: "b".repeat(64),
    });
    expect(() => transitionIncidentStatus("CLOSED", "ACTIVE", audit, "b".repeat(64)))
      .toThrow("INCIDENT_TRANSITION_INVALID:CLOSED:ACTIVE");
    expect(() => transitionIncidentStatus("ACTIVE", "STABILIZING", { ...audit, reason: " " }, "b".repeat(64)))
      .toThrow("EMERGENCY_AUDIT_CONTEXT_INVALID");
  });

  it("projects only approved public fields and omits private identity, medical, and exact-location references", () => {
    const source: SituationSource = {
      publicRef: "public-1",
      hazard: { category: "natural", code: "flood", taxonomyVersion: "v1" },
      status: "active",
      publicSummary: "Flooding reported in the district",
      publicLocation: { precision: "district", publicLabel: "Central District" },
      exactLocation: { locationRef: "private-location-1", precision: "exact" },
      requesterRef: "person-1",
      medicalDetails: ["sensitive diagnosis"],
      updatedAt: "2026-09-30T10:00:00.000Z",
      provenance: {
        sourceType: "authority", sourceRef: "feed-1", observedAt: "2026-09-30T09:59:00.000Z",
        receivedAt: "2026-09-30T10:00:00.000Z", freshness: "current", confidence: 0.95, evidenceRefs: [],
      },
      verification: "corroborated",
    };
    const result = toPublicSituationProjection(source);
    expect(result.location).toEqual({ precision: "district", publicLabel: "Central District" });
    expect(JSON.stringify(result)).not.toMatch(/private-location-1|person-1|sensitive diagnosis/);
  });
});
