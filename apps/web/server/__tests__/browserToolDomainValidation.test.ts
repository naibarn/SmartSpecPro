/**
 * Tests for Node-side domain validation in browserTool.ts.
 * Validates that domain checks happen BEFORE credit deduction
 * to avoid wasting credits on invalid requests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the domain validation logic directly since we can't easily
// spin up the full Express router with all its dependencies.
// The validation function is extracted for testability.

import { validateBrowserDomains } from "../routes/browserTool";

describe("browserTool domain validation", () => {
  describe("validateBrowserDomains", () => {
    it("domain in tenant allowlist passes validation", () => {
      const result = validateBrowserDomains(
        [{ action: "navigate", url: "https://example.com/page" }],
        ["example.com"],
      );
      expect(result).toBeNull(); // null = no error
    });

    it("domain NOT in allowlist returns 403 error", () => {
      const result = validateBrowserDomains(
        [{ action: "navigate", url: "https://evil.com/hack" }],
        ["example.com"],
      );
      expect(result).not.toBeNull();
      expect(result!.code).toBe("DOMAIN_NOT_ALLOWED");
      expect(result!.status).toBe(403);
    });

    it("multiple URLs in actions, one invalid returns 403", () => {
      const result = validateBrowserDomains(
        [
          { action: "navigate", url: "https://example.com/page1" },
          { action: "navigate", url: "https://evil.com/hack" },
        ],
        ["example.com"],
      );
      expect(result).not.toBeNull();
      expect(result!.code).toBe("DOMAIN_NOT_ALLOWED");
      expect(result!.message).toContain("evil.com");
    });

    it("no allowed_domains configured blocks all domains", () => {
      const result = validateBrowserDomains(
        [{ action: "navigate", url: "https://example.com/page" }],
        [],
      );
      expect(result).not.toBeNull();
      expect(result!.code).toBe("DOMAIN_NOT_ALLOWED");
    });

    it("undefined allowed_domains blocks all domains", () => {
      const result = validateBrowserDomains(
        [{ action: "navigate", url: "https://example.com/page" }],
        undefined as any,
      );
      expect(result).not.toBeNull();
      expect(result!.code).toBe("DOMAIN_NOT_ALLOWED");
    });

    it("non-navigate actions are not checked", () => {
      const result = validateBrowserDomains(
        [
          { action: "click", selector: "#btn" },
          { action: "screenshot" },
        ],
        [], // empty allowlist
      );
      // No navigate actions = no domain check needed
      expect(result).toBeNull();
    });

    it("subdomain of allowed domain passes", () => {
      const result = validateBrowserDomains(
        [{ action: "navigate", url: "https://sub.example.com/page" }],
        ["example.com"],
      );
      expect(result).toBeNull();
    });

    it("invalid URL returns 400 error", () => {
      const result = validateBrowserDomains(
        [{ action: "navigate", url: "not-a-valid-url" }],
        ["example.com"],
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe(400);
    });

    it("case insensitive domain matching", () => {
      const result = validateBrowserDomains(
        [{ action: "navigate", url: "https://EXAMPLE.COM/page" }],
        ["example.com"],
      );
      expect(result).toBeNull();
    });
  });
});
