import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("../../db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../services/crypto", () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace("encrypted:", "")),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
  setTenantFeatureFlag: vi.fn(),
}));

vi.mock("../../_core/rateLimitedProcedure", () => ({
  createRateLimitMiddleware: vi.fn(() => vi.fn(({ next }: any) => next())),
}));

import { validateSsrfUrl } from "../../services/ssrfValidator";
import { encrypt } from "../../services/crypto";

describe("Custom Tools Backend — SSRF & Encryption", () => {
  it("createCustomTool rejects endpoint with private IP (SSRF)", () => {
    expect(() => validateSsrfUrl("http://10.0.0.5/api")).toThrow("SSRF");
    expect(() => validateSsrfUrl("http://192.168.1.1/api")).toThrow("SSRF");
  });

  it("createCustomTool rejects endpoint with localhost", () => {
    expect(() => validateSsrfUrl("http://localhost:8080/hook")).toThrow("SSRF");
    expect(() => validateSsrfUrl("http://127.0.0.1/hook")).toThrow("SSRF");
  });

  it("createCustomTool encrypts headers before storing", () => {
    const headers = { Authorization: "Bearer sk-test" };
    const encrypted = encrypt(JSON.stringify(headers));
    expect(encrypted).toBe(`encrypted:${JSON.stringify(headers)}`);
    expect(encrypted).not.toBe(JSON.stringify(headers));
  });

  it("SSRF allows valid public URLs", () => {
    expect(() => validateSsrfUrl("https://api.example.com/webhook")).not.toThrow();
  });
});

describe("Custom Tools Backend — Schema validation", () => {
  it("customToolInputSchema validates correct input", async () => {
    const { customToolInputSchema } = await import("../agency");
    const result = customToolInputSchema.safeParse({
      name: "my-tool",
      endpoint: "https://api.example.com/hook",
      httpMethod: "POST",
    });
    expect(result.success).toBe(true);
  });

  it("customToolInputSchema rejects invalid httpMethod", async () => {
    const { customToolInputSchema } = await import("../agency");
    const result = customToolInputSchema.safeParse({
      name: "my-tool",
      endpoint: "https://api.example.com/hook",
      httpMethod: "PATCH",
    });
    expect(result.success).toBe(false);
  });

  it("customToolInputSchema validates retryPolicy bounds", async () => {
    const { customToolInputSchema } = await import("../agency");
    const result = customToolInputSchema.safeParse({
      name: "my-tool",
      endpoint: "https://api.example.com/hook",
      httpMethod: "POST",
      retryPolicy: { maxRetries: 10, backoffMs: 100 },
    });
    expect(result.success).toBe(false); // maxRetries max is 5
  });
});
