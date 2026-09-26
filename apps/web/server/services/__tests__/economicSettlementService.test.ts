import { describe, expect, it } from "vitest";
import {
  EconomicSettlementError,
  settleEconomicReceipt,
  type EconomicSettlementRecord,
} from "../economicSettlementService";

const pending: EconomicSettlementRecord = {
  id: "settlement-1",
  tenantId: "tenant-1",
  holdId: "hold-1",
  idempotencyKey: "settle-1",
  status: "pending",
  capturedMinorUnits: 50,
  currency: "USD",
};

describe("economicSettlementService", () => {
  it("settles a verified receipt idempotently", () => {
    const settled = settleEconomicReceipt(pending, { receiptVerified: true });
    expect(settled).toMatchObject({ status: "settled", replayed: false });
    expect(
      settleEconomicReceipt(settled, { receiptVerified: true })
    ).toMatchObject({ status: "settled", replayed: true });
  });

  it("requires reconciliation for unknown external status", () => {
    expect(
      settleEconomicReceipt(pending, {
        receiptVerified: false,
        externalStatus: "unknown",
      })
    ).toMatchObject({ status: "reconciliation_required" });
  });

  it("rejects settlement after reversal", () => {
    expect(() =>
      settleEconomicReceipt(
        { ...pending, status: "reversed" },
        { receiptVerified: true }
      )
    ).toThrowError(new EconomicSettlementError("SETTLEMENT_TERMINAL"));
  });
});
