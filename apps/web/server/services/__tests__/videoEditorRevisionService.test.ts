import { describe, expect, it } from "vitest";
import { decideRevisionMutation, hashRevisionPayload } from "../videoEditorRevisionService";

describe("Feature 184 revision CAS", () => {
  it("applies at the expected revision and is stable for reordered objects", () => {
    const first = decideRevisionMutation({ expectedRevision: 0, currentRevision: 0, mutationId: "m1", payload: { b: 2, a: 1 }, receipts: [] });
    const secondHash = hashRevisionPayload({ a: 1, b: 2 });
    expect(first.kind).toBe("applied");
    expect(first.kind === "applied" ? first.receipt.payloadHash : "").toBe(secondHash);
  });

  it("returns conflict for stale tabs and duplicate for the same mutation", () => {
    const applied = decideRevisionMutation({ expectedRevision: 0, currentRevision: 0, mutationId: "m1", payload: { value: 1 }, receipts: [] });
    expect(decideRevisionMutation({ expectedRevision: 0, currentRevision: 1, mutationId: "m2", payload: { value: 2 }, receipts: [] })).toEqual({ kind: "conflict", currentRevision: 1 });
    expect(applied.kind).toBe("applied");
    if (applied.kind !== "applied") return;
    expect(decideRevisionMutation({ expectedRevision: 0, currentRevision: 1, mutationId: "m1", payload: { value: 1 }, receipts: [applied.receipt] })).toEqual({ kind: "duplicate", revision: 1, revisionId: applied.revisionId });
    expect(() => decideRevisionMutation({ expectedRevision: 0, currentRevision: 1, mutationId: "m1", payload: { value: 9 }, receipts: [applied.receipt] })).toThrow("REVISION_MUTATION_REUSED");
  });

  it("rejects invalid revision and mutation identifiers", () => {
    expect(() => decideRevisionMutation({ expectedRevision: -1, currentRevision: 0, mutationId: "m1", payload: {}, receipts: [] })).toThrow("REVISION_INVALID");
    expect(() => decideRevisionMutation({ expectedRevision: 0, currentRevision: 0, mutationId: "../m1", payload: {}, receipts: [] })).toThrow("REVISION_MUTATION_ID_INVALID");
  });
});
