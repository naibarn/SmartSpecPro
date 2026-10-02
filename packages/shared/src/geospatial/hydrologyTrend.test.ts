import { describe, expect, it } from "vitest";
import { calculateHydroTrend } from "./hydrologyTrend";

const policy = { revision: "gauge-threshold-r1", minSamples: 2, windowSeconds: 3600, staleAfterSeconds: 900, stableDelta: 0.1, slightDelta: 0.5, rapidDelta: 1 };
const now = "2026-10-01T01:00:00.000Z";

describe("observed hydrology trend", () => {
  it("computes a deterministic observation-only delta under an explicit policy revision", () => {
    const result = calculateHydroTrend([
      { observedAt: "2026-10-01T00:15:00.000Z", value: 1, quality: "valid", freshness: "current", unit: "m" },
      { observedAt: "2026-10-01T00:45:00.000Z", value: 2.5, quality: "valid", freshness: "current", unit: "m" },
    ], policy, now);
    expect(result).toMatchObject({ label: "RAPIDLY_RISING", delta: 1.5, policyRevision: policy.revision, sampleCount: 2 });
  });
  it("returns UNKNOWN for stale, incomplete, mixed-unit, or future-only inputs", () => {
    const sample = { observedAt: "2026-10-01T00:15:00.000Z", value: 1, quality: "valid" as const, freshness: "current" as const, unit: "m" };
    expect(calculateHydroTrend([sample], policy, now)).toMatchObject({ label: "UNKNOWN", reason: "INSUFFICIENT_CURRENT_SAMPLES" });
    expect(calculateHydroTrend([sample, { ...sample, observedAt: "2026-10-01T00:45:00.000Z", freshness: "stale" }], policy, now)).toMatchObject({ label: "UNKNOWN", reason: "INSUFFICIENT_CURRENT_SAMPLES" });
    expect(calculateHydroTrend([sample, { ...sample, observedAt: "2026-10-01T00:45:00.000Z", unit: "cm" }], policy, now)).toMatchObject({ label: "UNKNOWN", reason: "INCOMPARABLE_UNITS" });
    expect(calculateHydroTrend([{ ...sample, observedAt: "2026-10-01T02:00:00.000Z" }, { ...sample, observedAt: "2026-10-01T02:01:00.000Z" }], policy, now)).toMatchObject({ label: "UNKNOWN", reason: "INSUFFICIENT_CURRENT_SAMPLES" });
  });
  it("distinguishes slight, sustained and rapid rise/fall bands", () => {
    const sample = { observedAt: "2026-10-01T00:15:00.000Z", value: 1, quality: "valid" as const, freshness: "current" as const, unit: "m" };
    const trend = (delta: number) => calculateHydroTrend([sample, { ...sample, observedAt: "2026-10-01T00:45:00.000Z", value: 1 + delta }], policy, now).label;
    expect(trend(0.3)).toBe("SLIGHTLY_RISING");
    expect(trend(0.7)).toBe("RISING");
    expect(trend(1.2)).toBe("RAPIDLY_RISING");
    expect(trend(-0.3)).toBe("SLIGHTLY_FALLING");
    expect(trend(-0.7)).toBe("FALLING");
    expect(trend(-1.2)).toBe("RAPIDLY_FALLING");
  });
});
