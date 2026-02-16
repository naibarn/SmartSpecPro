import { describe, expect, it } from "vitest";

import {
  buildScopeFilter,
  clampDateRange,
  bucketToSql,
  MAX_RANGE_DAYS,
  STAGE_PRESETS,
  type FunnelScope,
} from "./funnelAnalytics";

describe("funnelAnalytics helpers", () => {
  describe("buildScopeFilter", () => {
    it("returns tenantId scope for admin role", () => {
      const scope = buildScopeFilter({
        role: "admin",
        registeredDomain: "example.com",
        ctxTenantId: "tenant-01",
      });
      expect(scope).toEqual<FunnelScope>({
        tenantId: "tenant-01",
        domain: null,
      });
    });

    it("returns domain-scoped filter for domain_admin role", () => {
      const scope = buildScopeFilter({
        role: "domain_admin",
        registeredDomain: "corp.io",
        ctxTenantId: "tenant-02",
      });
      expect(scope).toEqual<FunnelScope>({
        tenantId: "tenant-02",
        domain: "corp.io",
      });
    });

    it("falls back to registeredDomain as tenantId when ctxTenantId is missing", () => {
      const scope = buildScopeFilter({
        role: "admin",
        registeredDomain: "example.com",
        ctxTenantId: null,
      });
      expect(scope).toEqual<FunnelScope>({
        tenantId: "example.com",
        domain: null,
      });
    });

    it("throws when both ctxTenantId and registeredDomain are missing", () => {
      expect(() =>
        buildScopeFilter({
          role: "admin",
          registeredDomain: null,
          ctxTenantId: null,
        }),
      ).toThrow("Unable to determine tenant scope");
    });
  });

  describe("clampDateRange", () => {
    it("returns input range when within bounds", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-15");
      const result = clampDateRange(from, to);
      expect(result.from).toEqual(from);
      expect(result.to).toEqual(to);
      expect(result.clamped).toBe(false);
    });

    it("clamps range that exceeds MAX_RANGE_DAYS", () => {
      const from = new Date("2025-01-01");
      const to = new Date("2026-02-16");
      const result = clampDateRange(from, to);
      expect(result.clamped).toBe(true);
      const diffMs =
        result.to.getTime() - result.from.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeLessThanOrEqual(MAX_RANGE_DAYS);
    });

    it("swaps from/to when from > to", () => {
      const from = new Date("2026-02-15");
      const to = new Date("2026-01-01");
      const result = clampDateRange(from, to);
      expect(result.from.getTime()).toBeLessThan(
        result.to.getTime(),
      );
    });
  });

  describe("bucketToSql", () => {
    it("returns day truncation for 'day' bucket", () => {
      const result = bucketToSql("day");
      expect(result).toContain("date_trunc");
      expect(result).toContain("day");
      expect(result).toContain("UTC");
    });

    it("returns week truncation for 'week' bucket", () => {
      const result = bucketToSql("week");
      expect(result).toContain("date_trunc");
      expect(result).toContain("week");
      expect(result).toContain("UTC");
    });

    it("returns month truncation for 'month' bucket", () => {
      const result = bucketToSql("month");
      expect(result).toContain("date_trunc");
      expect(result).toContain("month");
      expect(result).toContain("UTC");
    });

    it("defaults to day for unknown input", () => {
      const result = bucketToSql("invalid" as any);
      expect(result).toContain("day");
    });
  });

  describe("STAGE_PRESETS", () => {
    it("maps acquisition to signup and verification events", () => {
      expect(STAGE_PRESETS.acquisition).toContain("signup_completed");
      expect(STAGE_PRESETS.acquisition).toContain("email_verified");
    });

    it("maps activation to first-use events", () => {
      expect(STAGE_PRESETS.activation).toContain("first_conversation");
      expect(STAGE_PRESETS.activation).toContain("first_llm_request");
    });

    it("maps revenue to purchase and subscription events", () => {
      expect(STAGE_PRESETS.revenue).toContain("purchase_completed");
      expect(STAGE_PRESETS.revenue).toContain("subscription_started");
    });
  });
});
