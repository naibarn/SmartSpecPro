/**
 * Tests for Responses API audit events and store=false enforcement.
 *
 * Tests:
 * - store=true in request body -> overridden to false
 * - store field absent -> defaults to false
 * - sanitizeToolOutputForLLM strips HTML
 */

// ── Env stubs (MUST be before any imports) ──────────────────
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-key-at-least-32-chars-long!!";
process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token-value";
process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID = "99";

import { describe, it, expect, vi } from "vitest";

// Mock authz to prevent tokens.ts from crashing
vi.mock("../_core/authz", () => ({
  authorizeRequest: vi.fn().mockResolvedValue({ ok: true, userId: 42 }),
}));

import { sanitizeResponsesBody, sanitizeToolOutputForLLM } from "../_core/responsesRoutes";

describe("sanitizeResponsesBody — store=false enforcement", () => {
  const validBase = {
    model: "gpt-4o",
    input: [{ role: "user", content: "hello" }],
  };

  it("overrides store=true to false", () => {
    const result = sanitizeResponsesBody({ ...validBase, store: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.store).toBe(false);
    }
  });

  it("overrides store as string 'true' to false", () => {
    const result = sanitizeResponsesBody({ ...validBase, store: "true" as any });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.store).toBe(false);
    }
  });

  it("defaults store to false when absent", () => {
    const result = sanitizeResponsesBody({ ...validBase });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.store).toBe(false);
    }
  });

  it("rejects missing model", () => {
    const result = sanitizeResponsesBody({ input: [{ role: "user", content: "hi" }] });
    expect(result.ok).toBe(false);
  });

  it("rejects missing input", () => {
    const result = sanitizeResponsesBody({ model: "gpt-4o" });
    expect(result.ok).toBe(false);
  });
});

describe("sanitizeToolOutputForLLM — HTML stripping", () => {
  it("strips script tags and content", () => {
    const input = "Hello <script>alert('xss')</script> World";
    const result = sanitizeToolOutputForLLM(input);
    expect(result).not.toContain("<script>");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("strips iframe tags", () => {
    const input = '<iframe src="evil.com"></iframe> Safe';
    const result = sanitizeToolOutputForLLM(input);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("Safe");
  });

  it("strips event handler attributes", () => {
    const input = '<img onerror="evil()" src="x"> text';
    const result = sanitizeToolOutputForLLM(input);
    expect(result).not.toContain("onerror");
  });

  it("preserves plain text", () => {
    const input = "Just plain text with no HTML";
    const result = sanitizeToolOutputForLLM(input);
    expect(result).toBe(input);
  });

  it("truncates extremely long output", () => {
    const input = "A".repeat(60_000);
    const result = sanitizeToolOutputForLLM(input);
    expect(result.length).toBeLessThanOrEqual(50_001);
  });

  it("handles empty string", () => {
    expect(sanitizeToolOutputForLLM("")).toBe("");
  });
});
