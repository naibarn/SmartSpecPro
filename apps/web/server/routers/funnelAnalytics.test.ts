import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  buildScopeFilter,
  clampDateRange,
  bucketToSql,
  sanitizeEventProperties,
  MAX_RANGE_DAYS,
  STAGE_PRESETS,
  MAX_EXPORT_ROWS,
  DISALLOWED_PROPERTY_KEYS,
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

// ── Section 07: Security, RBAC, and Privacy Controls ──

describe("funnelAnalytics security controls", () => {
  describe("sanitizeEventProperties", () => {
    it("removes disallowed sensitive property keys", () => {
      const input = {
        userId: "user123",
        email: "user@example.com",
        password: "secret123",
        apiKey: "sk-xyz",
        deviceId: "device-abc",
        ipAddress: "192.168.1.1",
      };
      const result = sanitizeEventProperties(input);
      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("deviceId");
      expect(result).not.toHaveProperty("password");
      expect(result).not.toHaveProperty("apiKey");
      expect(result).not.toHaveProperty("email");
      expect(result).not.toHaveProperty("ipAddress");
    });

    it("handles null and undefined properties", () => {
      const input = { userId: "user123", email: null, custom: undefined };
      const result = sanitizeEventProperties(input);
      expect(result).toHaveProperty("userId");
      expect(result).not.toHaveProperty("email");
    });

    it("returns empty object for null input", () => {
      const result = sanitizeEventProperties(null);
      expect(result).toEqual({});
    });

    it("preserves allowed keys from whitelist", () => {
      const input = {
        userId: "user123",
        sessionId: "session-abc",
        eventType: "click",
        timestamp: "2026-01-01T00:00:00Z",
        email: "user@example.com",
      };
      const result = sanitizeEventProperties(input);
      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("sessionId");
      expect(result).toHaveProperty("eventType");
      expect(result).toHaveProperty("timestamp");
      expect(result).not.toHaveProperty("email");
    });
  });

  describe("DISALLOWED_PROPERTY_KEYS", () => {
    it("includes common PII fields", () => {
      expect(DISALLOWED_PROPERTY_KEYS).toContain("email");
      expect(DISALLOWED_PROPERTY_KEYS).toContain("phone");
      expect(DISALLOWED_PROPERTY_KEYS).toContain("ipAddress");
      expect(DISALLOWED_PROPERTY_KEYS).toContain("ip");
    });

    it("includes credential fields", () => {
      expect(DISALLOWED_PROPERTY_KEYS).toContain("password");
      expect(DISALLOWED_PROPERTY_KEYS).toContain("apiKey");
      expect(DISALLOWED_PROPERTY_KEYS).toContain("token");
      expect(DISALLOWED_PROPERTY_KEYS).toContain("secret");
    });
  });

  describe("MAX_EXPORT_ROWS", () => {
    it("is defined and reasonable for export limits", () => {
      expect(MAX_EXPORT_ROWS).toBeGreaterThan(0);
      expect(MAX_EXPORT_ROWS).toBeLessThanOrEqual(10000);
    });
  });

  describe("buildScopeFilter - fallback detection", () => {
    it("indicates fallback when ctxTenantId is null and registeredDomain is used", () => {
      const scope = buildScopeFilter({
        role: "admin",
        registeredDomain: "example.com",
        ctxTenantId: null,
      });
      // Fallback happened: tenantId was derived from registeredDomain
      expect(scope.tenantId).toBe("example.com");
    });

    it("indicates no fallback when ctxTenantId is provided", () => {
      const scope = buildScopeFilter({
        role: "admin",
        registeredDomain: "example.com",
        ctxTenantId: "tenant-explicit",
      });
      // No fallback: tenantId is the explicit ctx value
      expect(scope.tenantId).toBe("tenant-explicit");
    });
  });
});
