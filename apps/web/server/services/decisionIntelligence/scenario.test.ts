import { describe, expect, it } from "vitest";
import { calculateScenario } from "./scenario";

const evidenceRef = "evidence-1";

describe("calculateScenario", () => {
  it("derives versioned, unit-explicit cash metrics without claiming a sale", () => {
    const result = calculateScenario({
      calculationVersion: "scenario-financial-v1",
      scenarioId: "subdivide-base",
      currencyCode: "THB",
      horizon: { value: 18, unit: "month" },
      assumptions: [{
        id: "occupancy", label: "Planned occupancy", value: 0.8, unit: "ratio",
        basis: "user_stated", material: true,
      }],
      oneTimeCosts: [{ id: "site-prep", label: "Site preparation", amount: 1_200_000, currencyCode: "THB", basis: "observed", evidenceRefs: [evidenceRef], sourceDate: "2026-09-01" }],
      recurringCosts: [{ id: "holding", label: "Holding cost", amount: 10_000, currencyCode: "THB", period: "month", basis: "observed", evidenceRefs: ["evidence-2"], sourceDate: "2026-09-01" }],
      revenues: [{ id: "forecast-revenue", label: "Illustrative revenue", amount: 100_000, currencyCode: "THB", period: "month", basis: "estimated", estimationMethod: "scenario-input-v1", evidenceRefs: ["evidence-3"] }],
    });

    expect(result).toMatchObject({
      calculationVersion: "scenario-financial-v1",
      scenarioId: "subdivide-base",
      unit: { currencyCode: "THB", horizon: { value: 18, unit: "month" } },
      totals: {
        oneTimeCosts: 1_200_000,
        recurringCostsForHorizon: 180_000,
        revenueForHorizon: 1_800_000,
        totalProjectCost: 1_380_000,
        netCashFlow: 420_000,
        breakEvenRevenue: 1_380_000,
        roi: 0.304348,
        monthlyNetCashFlow: 90_000,
        paybackMonths: 13.333333,
      },
      readiness: {
        status: "partial",
        verificationLabel: "informational_estimate",
        criticalMissing: [],
      },
    });
    expect(result.assumptionDisclosures).toEqual([{
      id: "occupancy", basis: "user_stated", material: true, unit: "ratio", evidenceRefs: [],
    }]);
    expect(result.inputDisclosures.find(item => item.id === "forecast-revenue")).toMatchObject({
      kind: "revenue", basis: "estimated", value: 100_000, low: 100_000, high: 100_000,
      currencyCode: "THB", period: "month", evidenceRefs: ["evidence-3"], estimationMethod: "scenario-input-v1",
    });
    expect(result).not.toHaveProperty("saleLikely");
  });

  it("blocks a regulated calculation until its jurisdiction and professional verification are explicit", () => {
    const result = calculateScenario({
      calculationVersion: "scenario-financial-v1",
      scenarioId: "regulated-estimate",
      currencyCode: "THB",
      horizon: { value: 1, unit: "year" },
      regulatedContext: true,
      assumptions: [],
      oneTimeCosts: [],
      recurringCosts: [],
      revenues: [],
    });

    expect(result.readiness).toEqual({
      status: "blocked",
      verificationLabel: "informational_estimate",
      criticalMissing: ["jurisdiction", "server_verified_professional_receipt"],
    });
  });

  it("rejects mixed currencies, unknown estimate methods, and malformed units instead of converting or inferring them", () => {
    const input = {
      calculationVersion: "scenario-financial-v1",
      scenarioId: "invalid-input",
      currencyCode: "THB",
      horizon: { value: 12, unit: "month" as const },
      assumptions: [],
      oneTimeCosts: [],
      recurringCosts: [],
      revenues: [],
    };
    expect(() => calculateScenario({ ...input, oneTimeCosts: [{ id: "usd-cost", label: "USD cost", amount: 1, currencyCode: "USD", basis: "observed", evidenceRefs: [evidenceRef], sourceDate: "2026-09-01" }] })).toThrow("SCENARIO_UNIT_INVALID");
    expect(() => calculateScenario({ ...input, revenues: [{ id: "estimate", label: "Estimate", amount: 1, currencyCode: "THB", period: "month", basis: "estimated", evidenceRefs: [evidenceRef] }] })).toThrow("SCENARIO_INPUT_INVALID");
    expect(() => calculateScenario({ ...input, horizon: { value: 12, unit: "week" as never } })).toThrow("SCENARIO_UNIT_INVALID");
    expect(() => calculateScenario({ ...input, regulatedContext: "yes" as never })).toThrow("SCENARIO_INPUT_INVALID");
  });

  it("keeps a non-positive monthly result from being presented as a payback period", () => {
    const result = calculateScenario({
      calculationVersion: "scenario-financial-v1",
      scenarioId: "downside-case",
      currencyCode: "THB",
      horizon: { value: 12, unit: "month" },
      assumptions: [],
      oneTimeCosts: [{ id: "setup", label: "Setup", amount: 120, currencyCode: "THB", basis: "observed", evidenceRefs: [evidenceRef], sourceDate: "2026-09-01" }],
      recurringCosts: [{ id: "operating", label: "Operating", amount: 20, currencyCode: "THB", period: "month", basis: "observed", evidenceRefs: [evidenceRef], sourceDate: "2026-09-01" }],
      revenues: [{ id: "revenue", label: "Revenue", amount: 10, currencyCode: "THB", period: "month", basis: "observed", evidenceRefs: [evidenceRef], sourceDate: "2026-09-01" }],
    });

    expect(result.totals).toMatchObject({ monthlyNetCashFlow: -10 });
    expect(result.totals.paybackMonths).toBeUndefined();
  });

  it("propagates input intervals into a conservative net cash-flow range", () => {
    const result = calculateScenario({
      calculationVersion: "scenario-financial-v1", scenarioId: "uncertain-case", currencyCode: "THB",
      horizon: { value: 18, unit: "month" }, assumptions: [],
      oneTimeCosts: [{ id: "setup", label: "Setup", amount: 1_200_000, low: 1_100_000, high: 1_300_000, currencyCode: "THB", basis: "observed", evidenceRefs: [evidenceRef], sourceDate: "2026-09-01" }],
      recurringCosts: [{ id: "holding", label: "Holding", amount: 10_000, low: 8_000, high: 12_000, currencyCode: "THB", period: "month", basis: "observed", evidenceRefs: [evidenceRef], sourceDate: "2026-09-01" }],
      revenues: [{ id: "revenue", label: "Revenue", amount: 100_000, low: 80_000, high: 120_000, currencyCode: "THB", period: "month", basis: "estimated", estimationMethod: "range-v1", evidenceRefs: [evidenceRef] }],
    });
    expect(result.totals.netCashFlowRange).toEqual({ low: -76_000, high: 916_000 });
    expect(result.limitations).toContain("uncertainty_interval_propagated");
    expect(result.readiness.status).toBe("partial");
  });

  it("never labels a caller-supplied verification claim as official or ready", () => {
    const result = calculateScenario({
      calculationVersion: "scenario-financial-v1", scenarioId: "unverified-regulated", currencyCode: "THB",
      horizon: { value: 1, unit: "year" }, assumptions: [], oneTimeCosts: [], recurringCosts: [], revenues: [],
      regulatedContext: true,
      jurisdiction: { code: "TH-10", ruleSetVersion: "land-rule-v1", sourceDate: "2026-09-01" },
      professionalVerification: { kind: "official_government_value", reference: "claimed-ref", verifiedAt: "2026-09-01T00:00:00.000Z" },
    });
    expect(result.readiness).toEqual({ status: "blocked", verificationLabel: "informational_estimate", criticalMissing: ["server_verified_professional_receipt"] });
    expect(result.limitations).toContain("professional_verification_claim_not_authoritatively_resolved");
  });

  it("rejects aggregate values beyond deterministic six-decimal output precision", () => {
    const input = {
      calculationVersion: "scenario-financial-v1", scenarioId: "overflow", currencyCode: "THB",
      horizon: { value: 1, unit: "month" as const }, assumptions: [], recurringCosts: [], revenues: [],
      oneTimeCosts: Array.from({ length: 200 }, (_, index) => ({ id: `cost-${index}`, label: "Large cost", amount: 1_000_000_000_000, currencyCode: "THB", basis: "observed" as const, evidenceRefs: [evidenceRef], sourceDate: "2026-09-01" })),
    };
    expect(() => calculateScenario(input)).toThrow("SCENARIO_NUMERICAL_RANGE_EXCEEDED");
  });
});
