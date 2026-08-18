import { describe, expect, it } from "vitest";
import { assertOrchestraFinalGate } from "../orchestraFinalGate";

const result = {
  executionId: "exec",
  attemptId: "attempt",
  state: "provider_ready" as const,
  contractHash: "a".repeat(64),
  findings: [],
};

describe("orchestra final gate", () => {
  it("blocks an oversized Kie/Grok prompt before provider submission", () => {
    expect(() =>
      assertOrchestraFinalGate({
        tenantId: "tenant",
        contractHash: "a".repeat(64),
        outputHash: "b".repeat(64),
        policyHash: "c".repeat(64),
        result,
        prompt: "x".repeat(4097),
        providerProfile: {
          providerId: "kie",
          modelId: "grok",
          maxPromptChars: 4096,
          supportsVision: true,
          supportsStructuredOutput: false,
          supportsLipSync: true,
          supportsMultiLocation: true,
        },
        requiresSideEffect: false,
      })
    ).toThrow(/provider_budget_exceeded/);
  });

  it("requires a matching authorization for a paid side effect", () => {
    expect(() =>
      assertOrchestraFinalGate({
        tenantId: "tenant",
        contractHash: "a".repeat(64),
        outputHash: "b".repeat(64),
        policyHash: "c".repeat(64),
        result,
        requiresSideEffect: true,
      })
    ).toThrow(/side_effect_unauthorized/);
  });
});
