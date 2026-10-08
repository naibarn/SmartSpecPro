import { describe, expect, it } from "vitest";

import {
  EconomicReceiptSettlementError,
  planRunnerEconomicSettlement,
  type VerifiedRunnerAccountingEvidence,
} from "../economicReceiptSettlement";

const hold = {
  tenantId: "tenant-a",
  currency: "USD",
  amountMinorUnits: 500,
  capturedMinorUnits: 0,
  releasedMinorUnits: 0,
};

function journal(amount: number, reverse = false) {
  if (amount === 0) return [];
  return [
    {
      accountId: reverse ? "liability" : "reserve",
      tenantId: hold.tenantId,
      currency: hold.currency,
      debitMinorUnits: amount,
      creditMinorUnits: 0,
    },
    {
      accountId: reverse ? "reserve" : "liability",
      tenantId: hold.tenantId,
      currency: hold.currency,
      debitMinorUnits: 0,
      creditMinorUnits: amount,
    },
  ];
}

function metered(
  overrides: Partial<
    Extract<VerifiedRunnerAccountingEvidence, { kind: "provider_metered" }>
  > = {}
) {
  return {
    kind: "provider_metered" as const,
    policyVersion: "pricing-policy-v1",
    providerUsageRef: "usage:provider:123",
    usageDigest: "a".repeat(64),
    pricingPolicyRef: "pricing:codex:approved",
    verificationRef: "usage-verification:123",
    amountMinorUnits: 120,
    currency: "USD",
    captureJournalLines: journal(120, true),
    releaseJournalLines: journal(380, true),
    ...overrides,
  };
}

describe("receipt-backed Runner economic settlement planning", () => {
  it("captures only server-priced actual provider usage", () => {
    expect(planRunnerEconomicSettlement(hold, metered())).toEqual({
      capturedMinorUnits: 120,
      releasedMinorUnits: 380,
    });
  });

  it("releases the unused cap instead of capturing the full budget hold", () => {
    const plan = planRunnerEconomicSettlement(hold, metered());
    expect(plan.capturedMinorUnits).toBe(120);
    expect(plan.capturedMinorUnits).not.toBe(hold.amountMinorUnits);
    expect(plan.releasedMinorUnits).toBe(hold.amountMinorUnits - 120);
  });

  it("rejects provider usage evidence without a provenance reference", () => {
    expect(() =>
      planRunnerEconomicSettlement(hold, metered({ providerUsageRef: "" }))
    ).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("rejects provider usage evidence without a usage digest", () => {
    expect(() =>
      planRunnerEconomicSettlement(hold, metered({ usageDigest: "tokens=42" }))
    ).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("rejects provider usage evidence without an approved pricing policy", () => {
    expect(() =>
      planRunnerEconomicSettlement(hold, metered({ pricingPolicyRef: "" }))
    ).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("rejects a cost above the approved hold cap", () => {
    expect(() =>
      planRunnerEconomicSettlement(hold, metered({ amountMinorUnits: 501 }))
    ).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("caps a second capture to the current remaining hold and releases only its remainder", () => {
    const partiallyUsedHold = {
      ...hold,
      capturedMinorUnits: 100,
      releasedMinorUnits: 100,
    };
    const evidence = metered({
      amountMinorUnits: 250,
      captureJournalLines: journal(250, true),
      releaseJournalLines: journal(50, true),
    });

    expect(planRunnerEconomicSettlement(partiallyUsedHold, evidence)).toEqual({
      capturedMinorUnits: 250,
      releasedMinorUnits: 50,
    });
    expect(() => planRunnerEconomicSettlement(
      partiallyUsedHold,
      metered({
        amountMinorUnits: 301,
        captureJournalLines: journal(301, true),
        releaseJournalLines: [],
      })
    )).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("rejects a currency mismatch", () => {
    expect(() =>
      planRunnerEconomicSettlement(hold, metered({ currency: "EUR" }))
    ).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("rejects journal lines that do not equal the actual provider amount", () => {
    expect(() =>
      planRunnerEconomicSettlement(
        hold,
        metered({ captureJournalLines: journal(119, true) })
      )
    ).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("does not require a zero-value release journal when actual usage equals the cap", () => {
    expect(
      planRunnerEconomicSettlement(
        hold,
        metered({
          amountMinorUnits: 500,
          captureJournalLines: journal(500, true),
          releaseJournalLines: [],
        })
      )
    ).toEqual({ capturedMinorUnits: 500, releasedMinorUnits: 0 });
  });

  it("rejects unrelated release journal lines when the cap is fully captured", () => {
    expect(() =>
      planRunnerEconomicSettlement(
        hold,
        metered({
          amountMinorUnits: 500,
          captureJournalLines: journal(500, true),
          releaseJournalLines: journal(1, true),
        })
      )
    ).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("classifies approved subscription use without inventing a per-run charge", () => {
    const evidence: VerifiedRunnerAccountingEvidence = {
      kind: "approved_subscription",
      policyVersion: "subscription-policy-v1",
      subscriptionRef: "subscription:codex-team",
      accountingPolicyRef: "included-usage-policy-v1",
      usageRef: "subscription-usage:job-123",
      verificationRef: "subscription-entitlement-check:123",
      releaseJournalLines: journal(500, true),
    };
    expect(planRunnerEconomicSettlement(hold, evidence)).toEqual({
      capturedMinorUnits: 0,
      releasedMinorUnits: 500,
    });
  });

  it("requires explicit verified zero-charge policy evidence", () => {
    const evidence: VerifiedRunnerAccountingEvidence = {
      kind: "verified_zero_charge",
      policyVersion: "zero-charge-policy-v1",
      zeroChargePolicyRef: "policy:local-codex-no-provider-charge",
      verificationRef: "verified-zero:receipt-123",
      releaseJournalLines: journal(500, true),
    };
    expect(planRunnerEconomicSettlement(hold, evidence)).toEqual({
      capturedMinorUnits: 0,
      releasedMinorUnits: 500,
    });
  });

  it("rejects subscription classification without a usage accounting reference", () => {
    const evidence: VerifiedRunnerAccountingEvidence = {
      kind: "approved_subscription",
      policyVersion: "subscription-policy-v1",
      subscriptionRef: "subscription:codex-team",
      accountingPolicyRef: "included-usage-policy-v1",
      usageRef: "",
      verificationRef: "subscription-entitlement-check:123",
      releaseJournalLines: journal(500, true),
    };
    expect(() => planRunnerEconomicSettlement(hold, evidence)).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });

  it("refuses to produce a settlement plan for unknown or untrusted evidence", () => {
    expect(() =>
      planRunnerEconomicSettlement(hold, {
        kind: "unverified",
        reasonCode: "USAGE_EVIDENCE_MISSING",
      })
    ).toThrowError(
      new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID")
    );
  });
});
