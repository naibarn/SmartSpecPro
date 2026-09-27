import { describe, expect, it } from "vitest";

import {
  EconomicProvisioningError,
  authorizeEconomicProvisioning,
  deriveEconomicOwnerRef,
  normalizeEconomicProvisioningMoney,
} from "../economicProvisioningService";

describe("canonical economic provisioning contracts", () => {
  it("requires an authenticated admin actor and tenant scope", () => {
    expect(() => authorizeEconomicProvisioning({ tenantId: "tenant-a", actorId: 7, role: "user" }))
      .toThrowError(EconomicProvisioningError);
    expect(() => authorizeEconomicProvisioning({ tenantId: "", actorId: 7, role: "admin" }))
      .toThrowError("ECONOMIC_PROVISIONING_SCOPE_REQUIRED");
    expect(authorizeEconomicProvisioning({ tenantId: "tenant-a", actorId: 7, role: "admin" }))
      .toEqual({ tenantId: "tenant-a", actorId: "7", actorType: "admin", policyVersion: "economic-provisioning-admin-v1" });
  });

  it("derives owner references from authenticated context, never a client owner id", () => {
    expect(deriveEconomicOwnerRef({ tenantId: "tenant-a", actorId: 7 }, "tenant")).toBe("tenant:tenant-a");
    expect(deriveEconomicOwnerRef({ tenantId: "tenant-a", actorId: 7 }, "user")).toBe("user:7");
    expect(() => deriveEconomicOwnerRef({ tenantId: "tenant-a", actorId: 7 }, "platform" as never))
      .toThrow("ECONOMIC_PROVISIONING_OWNER_INVALID");
  });

  it("normalizes and validates exact minor-unit money without floating point", () => {
    expect(normalizeEconomicProvisioningMoney({ currency: "usd", limitMinorUnits: 1500 }))
      .toEqual({ currency: "USD", limitMinorUnits: 1500 });
    expect(() => normalizeEconomicProvisioningMoney({ currency: "US", limitMinorUnits: 100 }))
      .toThrow("ECONOMIC_PROVISIONING_MONEY_INVALID");
    expect(() => normalizeEconomicProvisioningMoney({ currency: "USD", limitMinorUnits: 1.5 }))
      .toThrow("ECONOMIC_PROVISIONING_MONEY_INVALID");
  });
});
