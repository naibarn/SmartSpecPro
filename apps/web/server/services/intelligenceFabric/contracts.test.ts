import { describe, expect, it } from "vitest";
import { parseEvidenceItem, validateEvidenceLineageGraph, type EvidenceItem } from "./contracts";

const evidence: EvidenceItem = {
  contractVersion: "spec266-evidence-v1",
  id: "evidence-01",
  authorizationScope: "PUBLIC",
  evidenceClass: "observation",
  temporal: { observedAt: "2026-10-01T00:00:00.000Z", fetchedAt: "2026-10-01T00:01:00.000Z" },
  verificationState: "unverified",
  lineageRefs: ["capture-01", "source-01"],
};

describe("parseEvidenceItem", () => {
  it("accepts a bounded versioned evidence reference", () => {
    expect(parseEvidenceItem(evidence)).toEqual({ ok: true, value: evidence });
  });

  it("rejects unknown evidence contract versions", () => {
    expect(parseEvidenceItem({ ...evidence, contractVersion: "spec266-evidence-v99" })).toMatchObject({
      ok: false,
      code: "EVIDENCE_CONTRACT_INVALID",
    });
  });

  it("requires explicit public or tenant scope", () => {
    const { authorizationScope: _scope, ...withoutScope } = evidence;
    expect(parseEvidenceItem(withoutScope)).toMatchObject({ ok: false, code: "EVIDENCE_SCOPE_INVALID" });
  });

  it("rejects an inverted effective-time interval", () => {
    expect(parseEvidenceItem({
      ...evidence,
      temporal: { effectiveFrom: "2026-10-02T00:00:00.000Z", effectiveUntil: "2026-10-01T00:00:00.000Z" },
    })).toMatchObject({ ok: false, code: "EVIDENCE_CONTRACT_INVALID" });
  });

  it("requires rights, methodology and parent evidence for derived, forecast and model claims", () => {
    for (const evidenceClass of ["derived", "forecast", "model_estimate"] as const) {
      expect(parseEvidenceItem({ ...evidence, evidenceClass })).toMatchObject({ ok: false, code: "EVIDENCE_CONTRACT_INVALID" });
      expect(parseEvidenceItem({ ...evidence, evidenceClass, rightsPolicyRef: "rights-1", methodologyRef: "method-v1", lineageRefs: ["parent-1"] }))
        .toMatchObject({ ok: true, value: { evidenceClass, rightsPolicyRef: "rights-1", methodologyRef: "method-v1", lineageRefs: ["parent-1"] } });
    }
  });

  it("requires a tenant id for tenant scope and rejects cross-scope payloads", () => {
    expect(parseEvidenceItem({ ...evidence, authorizationScope: "TENANT" })).toMatchObject({ ok: false, code: "EVIDENCE_SCOPE_INVALID" });
    expect(parseEvidenceItem({ ...evidence, tenantId: "tenant-01" })).toMatchObject({ ok: false, code: "EVIDENCE_SCOPE_INVALID" });
  });

  it("rejects credentials and unbounded lineage metadata", () => {
    expect(parseEvidenceItem({ ...evidence, apiKey: "secret" })).toMatchObject({ ok: false, code: "EVIDENCE_UNKNOWN_FIELD" });
    expect(parseEvidenceItem({ ...evidence, lineageRefs: Array.from({ length: 129 }, (_, index) => `ref-${index}`) })).toMatchObject({ ok: false, code: "EVIDENCE_CONTRACT_INVALID" });
  });

  it("rejects self-referential evidence lineage", () => {
    expect(parseEvidenceItem({ ...evidence, lineageRefs: ["evidence-01"] })).toMatchObject({ ok: false, code: "EVIDENCE_CONTRACT_INVALID" });
  });

  it("rejects sparse evidence lineage arrays and sparse graph closures", () => {
    const sparseLineage = new Array(2);
    sparseLineage[0] = "capture-01";
    const sparseGraph = new Array(2);
    sparseGraph[0] = evidence;
    expect(parseEvidenceItem({ ...evidence, lineageRefs: sparseLineage })).toMatchObject({ ok: false, code: "EVIDENCE_CONTRACT_INVALID" });
    expect(validateEvidenceLineageGraph(sparseGraph)).toEqual({ ok: false, code: "EVIDENCE_LINEAGE_GRAPH_INVALID" });
  });

  it("detects cycles across a loaded evidence lineage graph", () => {
    const first = { ...evidence, id: "evidence-a", lineageRefs: ["evidence-b"] };
    const second = { ...evidence, id: "evidence-b", lineageRefs: ["evidence-a"] };
    expect(validateEvidenceLineageGraph([first, second])).toEqual({ ok: false, code: "EVIDENCE_LINEAGE_CYCLE" });
    expect(validateEvidenceLineageGraph([first, { ...second, lineageRefs: ["source-01"] }])).toEqual({ ok: true });
  });

  it("keeps distinct evidence and verification classifications", () => {
    expect(parseEvidenceItem({ ...evidence, evidenceClass: "official_warning", verificationState: "community_supported" })).toMatchObject({
      ok: true,
      value: { evidenceClass: "official_warning", verificationState: "community_supported" },
    });
  });

  it("returns an immutable detached temporal and lineage snapshot", () => {
    const mutableInput = {
      ...evidence,
      temporal: { observedAt: "2026-10-01T00:00:00.000Z", effectiveFrom: "2026-10-01T00:00:00.000Z" },
      lineageRefs: ["capture-01"],
    };
    const parsed = parseEvidenceItem(mutableInput);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    mutableInput.temporal.observedAt = "2026-10-02T00:00:00.000Z";
    mutableInput.lineageRefs[0] = "changed";
    expect(parsed.value.temporal.observedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(parsed.value.lineageRefs).toEqual(["capture-01"]);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.temporal)).toBe(true);
    expect(Object.isFrozen(parsed.value.lineageRefs)).toBe(true);
  });
});
