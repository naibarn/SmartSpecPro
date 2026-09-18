import { describe, expect, it, vi } from "vitest";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../feature186VerticalDramaJobAdapter", () => ({ createFeature186VerticalDramaJob: enqueue }));

import { enqueueCompositionScanJob, isCompositionEvidencePromotable, validateCompositionScanInput } from "../compositionScanJob";

const base = {
  jobId: "job-1",
  tenantId: "tenant-1",
  sourceFingerprint: "source-a",
  markRevision: 1,
  policyFingerprint: "policy-a",
  capabilityProfileFingerprint: "cap-a",
  analysisMode: "full_scan" as const,
  trimRange: { startMs: 0, endMs: 10000 },
  aspectProfile: "9:16",
  durationMs: 10000,
};

describe("Feature 191 canonical scan boundary", () => {
  it("validates and creates through Feature 186", async () => {
    validateCompositionScanInput(base);
    await enqueueCompositionScanJob({ ...base, evidenceRef: "evidence-a" });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ jobType: "video.composition_scan", executionClass: "long" }));
    const firstKey = enqueue.mock.calls.at(-1)?.[0]?.idempotencyKey;
    await enqueueCompositionScanJob({ ...base, jobId: "job-2", evidenceRef: "evidence-a" });
    const secondKey = enqueue.mock.calls.at(-1)?.[0]?.idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(secondKey).not.toBe(firstKey);
  });

  it("rejects invalid duration and mode", () => {
    expect(() => validateCompositionScanInput({ ...base, durationMs: 0 })).toThrow("COMPOSITION_SCAN_DURATION_INVALID");
    expect(() => validateCompositionScanInput({ ...base, analysisMode: "bad" as never })).toThrow("COMPOSITION_SCAN_MODE_INVALID");
    expect(() => validateCompositionScanInput({ ...base, trimRange: { startMs: 100, endMs: 100 } })).toThrow("COMPOSITION_SCAN_TRIM_RANGE_INVALID");
  });

  it("does not treat degraded analysis as promotable evidence", () => {
    expect(isCompositionEvidencePromotable({ status: "degraded", evidenceRef: "evidence-a" })).toBe(false);
    expect(isCompositionEvidencePromotable({ status: "available", evidenceRef: "evidence-a" })).toBe(true);
  });
});
