/**
 * Self-healing capability-flag breaker for model_provider_map.supportsVision
 * (2026-07-24). Pure matcher tests + DB-less no-op safety envelope, mirroring
 * recommendedModelQualityBreaker.test.ts's own convention.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

import {
  MODEL_VISION_CAPABILITY_MIN_POOL,
  isDefinitiveVisionCapabilityError,
  recordModelVisionCapabilityFailure,
} from "../modelVisionCapabilityBreaker";

describe("isDefinitiveVisionCapabilityError — definitive-only matcher", () => {
  it("matches the confirmed OpenRouter capability string", () => {
    expect(
      isDefinitiveVisionCapabilityError("No endpoints found that support image input")
    ).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(
      isDefinitiveVisionCapabilityError("NO ENDPOINTS FOUND THAT SUPPORT IMAGE INPUT")
    ).toBe(true);
  });

  it("matches when wrapped in a caller-added prefix", () => {
    expect(
      isDefinitiveVisionCapabilityError(
        "product-review-sequential-storyboard LLM call failed: No endpoints found that support image input"
      )
    ).toBe(true);
  });

  it("rejects a rate-limit error", () => {
    expect(isDefinitiveVisionCapabilityError("Rate limited (429): please try again later")).toBe(
      false
    );
  });

  it("rejects a timeout error", () => {
    expect(isDefinitiveVisionCapabilityError("Request timed out after 30000ms")).toBe(false);
  });

  it("rejects an insufficient-balance error", () => {
    expect(
      isDefinitiveVisionCapabilityError("Insufficient balance in provider account")
    ).toBe(false);
  });

  it("rejects a transient 503/gateway error", () => {
    expect(
      isDefinitiveVisionCapabilityError("503 Service Temporarily Unavailable (upstream gateway)")
    ).toBe(false);
  });

  it("rejects an unrelated auth error", () => {
    expect(isDefinitiveVisionCapabilityError("Invalid API key")).toBe(false);
  });

  it("stays conservative: never trusts the capability phrase if an ambiguous signal is ALSO present", () => {
    expect(
      isDefinitiveVisionCapabilityError(
        "No endpoints found that support image input (rate limited, try again)"
      )
    ).toBe(false);
  });

  it("rejects null/undefined/empty", () => {
    expect(isDefinitiveVisionCapabilityError(null)).toBe(false);
    expect(isDefinitiveVisionCapabilityError(undefined)).toBe(false);
    expect(isDefinitiveVisionCapabilityError("")).toBe(false);
    expect(isDefinitiveVisionCapabilityError("   ")).toBe(false);
  });
});

describe("recordModelVisionCapabilityFailure — safety envelope", () => {
  it("no-ops without a db and never throws", async () => {
    const result = await recordModelVisionCapabilityFailure({
      modelId: "deepseek/deepseek-v4-flash",
      errorMessage: "No endpoints found that support image input",
      runId: "mar_x",
    });
    expect(result).toEqual({ recorded: false, cleared: false });
  });

  it("no-ops on an empty model id", async () => {
    const result = await recordModelVisionCapabilityFailure({
      modelId: "",
      errorMessage: "No endpoints found that support image input",
    });
    expect(result).toEqual({ recorded: false, cleared: false });
  });

  it("no-ops on a non-definitive (ambiguous) error, even with a real model id", async () => {
    const result = await recordModelVisionCapabilityFailure({
      modelId: "deepseek/deepseek-v4-flash",
      errorMessage: "Rate limited (429)",
    });
    expect(result).toEqual({ recorded: false, cleared: false });
  });

  it("exposes a min-pool guard of 1 (never empties the vision pool)", () => {
    expect(MODEL_VISION_CAPABILITY_MIN_POOL).toBe(1);
  });
});
