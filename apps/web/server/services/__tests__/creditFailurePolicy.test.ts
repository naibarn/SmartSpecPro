import { describe, expect, it } from "vitest";
import {
  CREDIT_THRESHOLDS,
  classifyCreditFailure,
} from "../creditFailurePolicy";

describe("creditFailurePolicy", () => {
  it("keeps ordinary LLM user-credit failures user-only", () => {
    expect(classifyCreditFailure({
      errorMessage: "Insufficient credits. Required: 3000",
      path: "chat.complete",
      context: { source: "user", modelKind: "llm" },
    })).toMatchObject({ route: "user_purchase", adminPriority: null, threshold: CREDIT_THRESHOLDS.llm });
  });

  it("escalates an LLM request above 3000 credits", () => {
    expect(classifyCreditFailure({
      errorMessage: "Insufficient credits. Required: 3001",
      path: "verticalDramaSeries.startDraftQualityQc",
      context: { source: "user", modelKind: "llm" },
    })).toMatchObject({ route: "admin_suspicious", adminPriority: "high", requestedCredits: 3001 });
  });

  it("allows explicit media requests through 10000 credits", () => {
    expect(classifyCreditFailure({
      errorMessage: "Insufficient credits. Required: 10000",
      path: "media.generateVideo",
      context: { source: "user", modelKind: "media" },
    }).route).toBe("user_purchase");
  });

  it("uses the conservative unknown threshold", () => {
    expect(classifyCreditFailure({
      errorMessage: "Insufficient credits. Required: 3001",
      path: "unknown.procedure",
    }).route).toBe("admin_suspicious");
  });

  it("extracts amounts written before the word required", () => {
    expect(classifyCreditFailure({
      errorMessage: "Insufficient credits (3001 required)",
    }).route).toBe("admin_suspicious");
  });

  it("always escalates provider account credit failures critically", () => {
    expect(classifyCreditFailure({
      errorMessage: "OpenRouter account balance is insufficient",
      context: { source: "provider", provider: "openrouter" },
    })).toMatchObject({ route: "admin_provider", adminPriority: "critical", provider: "openrouter" });
  });

  it("does not classify unrelated errors as credit failures", () => {
    expect(classifyCreditFailure({ errorMessage: "Provider timed out" }).route).toBe("none");
  });
});
