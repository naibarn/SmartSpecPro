import { describe, expect, it } from "vitest";

import {
  EmergencyFinancialError,
  thbMajorToMinorUnits,
} from "../emergencyFinancialService";

describe("emergencyFinancialService", () => {
  it("converts exact THB decimals to minor units without floating point rounding", () => {
    expect(thbMajorToMinorUnits("125.50")).toBe(12_550);
    expect(thbMajorToMinorUnits("0.1")).toBe(10);
    expect(thbMajorToMinorUnits("90071992547410.00")).toBeNull();
  });

  it("rejects currency values that cannot be represented as exact satang", () => {
    expect(thbMajorToMinorUnits("1.001")).toBeNull();
    expect(thbMajorToMinorUnits("-1.00")).toBeNull();
    expect(thbMajorToMinorUnits("1e2")).toBeNull();
  });

  it("exposes stable domain error codes for a non-settled payment", () => {
    const error = new EmergencyFinancialError("PAYMENT_NOT_SETTLED");
    expect(error.code).toBe("PAYMENT_NOT_SETTLED");
    expect(error.name).toBe("EmergencyFinancialError");
  });

  it("rejects non-integer allocation amounts before any ledger write", async () => {
    await expect(import("../emergencyFinancialService").then(module => module.allocateEmergencySupportInTransaction({} as never, {
      tenantId: "tenant", poolRef: "pool", purposeCode: "food_water", restriction: "relief use only",
      amountMinorUnits: 10.5, actorUserId: 1, idempotencyKey: "request-123",
    }))).rejects.toMatchObject({ code: "ALLOCATION_AMOUNT_INVALID" });
  });
});
