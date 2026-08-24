import { describe, expect, it } from "vitest";
import {
  buildSkillRevenueAllocations,
  calculateSkillRevenueCharge,
  normalizeSkillRevenuePricing,
  resolveSkillRevenueReportTenantScope,
} from "../skillRevenueBilling";

describe("skill fixed-credit revenue contract", () => {
  it("forces tenant admins to the active tenant and never accepts a client scope", () => {
    expect(resolveSkillRevenueReportTenantScope({ role: "domain_admin", tenantId: "tenant-a", currentTenantId: "tenant-b" })).toBe("tenant-a");
    expect(resolveSkillRevenueReportTenantScope({ role: "domain_admin", currentTenantId: "tenant-b" })).toBe("tenant-b");
    expect(resolveSkillRevenueReportTenantScope({ role: "domain_admin" })).toBeNull();
    expect(resolveSkillRevenueReportTenantScope({ role: "admin", tenantId: "tenant-a" })).toBeNull();
  });

  it("uses the approved default split", () => {
    expect(normalizeSkillRevenuePricing({})).toEqual({
      tenantCreditCost: 2,
      skillOwnerCreditCost: 0,
      totalCredits: 2,
    });
  });

  it("keeps an explicitly configured split and total deterministic", () => {
    expect(normalizeSkillRevenuePricing({
      tenantCreditCost: 3,
      skillOwnerCreditCost: 4,
    })).toEqual({
      tenantCreditCost: 3,
      skillOwnerCreditCost: 4,
      totalCredits: 7,
    });
  });

  it("rejects fractional and negative credit prices", () => {
    expect(() => normalizeSkillRevenuePricing({ tenantCreditCost: 1.5 })).toThrow();
    expect(() => normalizeSkillRevenuePricing({ skillOwnerCreditCost: -1 })).toThrow();
  });

  it("combines both shares when one user owns the tenant and skill", () => {
    expect(Array.from(buildSkillRevenueAllocations({
      tenantOwnerId: 7,
      skillOwnerId: 7,
      tenantCredits: 2,
      skillOwnerCredits: 5,
    }).entries())).toEqual([[7, 7]]);
  });

  it("keeps separate recipients and omits zero-value shares", () => {
    expect(Array.from(buildSkillRevenueAllocations({
      tenantOwnerId: 7,
      skillOwnerId: 9,
      tenantCredits: 2,
      skillOwnerCredits: 0,
    }).entries())).toEqual([[7, 2]]);
  });

  it("caps the configured price at measured work credits", () => {
    expect(calculateSkillRevenueCharge({
      tenantCreditCost: 8,
      skillOwnerCreditCost: 4,
      totalCredits: 12,
    }, 5)).toEqual({
      tenantCreditCost: 4,
      skillOwnerCreditCost: 1,
      totalCredits: 5,
      configuredTotalCredits: 12,
      actualWorkCredits: 5,
      chargedTotalCredits: 5,
      capApplied: true,
      pricingSource: "skill_config",
    });
  });

  it("keeps the configured price when measured work is at least the cap", () => {
    expect(calculateSkillRevenueCharge({
      tenantCreditCost: 2,
      skillOwnerCreditCost: 2,
      totalCredits: 4,
    }, 9)).toMatchObject({
      tenantCreditCost: 2,
      skillOwnerCreditCost: 2,
      totalCredits: 4,
      chargedTotalCredits: 4,
      capApplied: false,
    });
  });

  it("allows a zero-work result without creating a charge", () => {
    expect(calculateSkillRevenueCharge({
      tenantCreditCost: 2,
      skillOwnerCreditCost: 0,
      totalCredits: 2,
    }, 0).totalCredits).toBe(0);
  });

  it("rejects fractional or negative measured work", () => {
    expect(() => calculateSkillRevenueCharge({ tenantCreditCost: 2, skillOwnerCreditCost: 0, totalCredits: 2 }, 1.5)).toThrow();
    expect(() => calculateSkillRevenueCharge({ tenantCreditCost: 2, skillOwnerCreditCost: 0, totalCredits: 2 }, -1)).toThrow();
  });
});
