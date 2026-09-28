import { describe, expect, it } from "vitest";
import { createEconomicCompatibilityAdapter } from "../economicCompatibilityAdapter";

describe("economicCompatibilityAdapter", () => {
  it("keeps feature-off behavior read-only", () => {
    const adapter = createEconomicCompatibilityAdapter({ enabled: false });
    expect(
      adapter.mapLegacyCreditTransaction({
        tenantId: "tenant-1",
        userId: 7,
        amount: 25,
        referenceId: "legacy-1",
      })
    ).toBeNull();
  });

  it("maps legacy facts without mutating or replacing the source transaction", () => {
    const source = {
      tenantId: "tenant-1",
      userId: 7,
      amount: 25,
      referenceId: "legacy-1",
    };
    const mapped = createEconomicCompatibilityAdapter({
      enabled: true,
    }).mapLegacyCreditTransaction(source);
    expect(mapped).toMatchObject({
      tenantId: "tenant-1",
      actorId: "7",
      amountMinorUnits: 25,
      currency: "USD",
      sourceReference: "legacy-1",
    });
    expect(source).toEqual({
      tenantId: "tenant-1",
      userId: 7,
      amount: 25,
      referenceId: "legacy-1",
    });
  });
});
