import { describe, expect, it } from "vitest";
import {
  OrchestraAssuranceRequestSchema,
  canonicalJson,
  composeCharacterIdentity,
  detectPlanCycle,
  validateEvidenceBundle,
  validateProviderPromptLength,
  validateSideEffectAuthorization,
} from "../orchestraSchemas";

const base = {
  contractVersion: 1,
  contractId: "contract-1",
  attemptId: "attempt-1",
  taskKind: "video_prompt" as const,
  evidencePolicy: {
    requiredPurposes: ["scene"],
    requireVisionFor: ["video_prompt"],
    allowTextOnlyFallback: false,
    maxEvidenceItems: 4,
    minQualityScore: 0.7,
  },
  evidence: [
    {
      ref: "img-1",
      purpose: "scene",
      qualityScore: 0.9,
      readable: true,
      resolution: "high" as const,
      visibleFaces: 2,
      unresolvedPeople: 0,
      trusted: true,
    },
  ],
  outputContract: {
    schemaRef: "video.prompt",
    requiredFields: ["prompt"],
    maxChars: 4096,
  },
  providerProfile: {
    providerId: "kie",
    modelId: "grok",
    maxPromptChars: 4096,
    supportsVision: true,
    supportsStructuredOutput: false,
    supportsLipSync: true,
    supportsMultiLocation: true,
  },
  budget: {
    maxTurns: 8,
    maxToolCalls: 16,
    maxParallelAgents: 3,
    maxPlanDepth: 4,
    maxWallClockSeconds: 180,
    maxInputTokens: 32000,
    maxOutputTokens: 8000,
    maxRepairAttempts: 2,
    estimatedCost: 0,
  },
  rulePackIds: [],
  sideEffectPolicy: "read_only" as const,
  repairAttempts: 0,
};

describe("orchestra assurance contract", () => {
  it("accepts a vision-grounded request and rejects unknown task kinds", () => {
    expect(OrchestraAssuranceRequestSchema.parse(base).taskKind).toBe(
      "video_prompt"
    );
    expect(() =>
      OrchestraAssuranceRequestSchema.parse({ ...base, taskKind: "unknown" })
    ).toThrow();
  });

  it("uses a custom identity description instead of a positional cue", () => {
    expect(
      composeCharacterIdentity(
        "ไอริณ",
        "ผู้หญิงที่ใส่ผ้ากันเปื้อน",
        "viewer-left"
      )
    ).toBe("ไอริณ (ผู้หญิงที่ใส่ผ้ากันเปื้อน)");
    expect(composeCharacterIdentity("ไอริณ", "", "viewer-left")).toBe(
      "ไอริณ (viewer-left)"
    );
  });

  it("blocks ambiguous evidence and oversized provider prompts", () => {
    expect(
      validateEvidenceBundle({
        ...base,
        evidence: [{ ...base.evidence[0], unresolvedPeople: 1 }],
      })
    ).toMatchObject({ code: "evidence_extra_people_unresolved" });
    expect(
      validateProviderPromptLength(base.providerProfile!, "x".repeat(4097))
        ?.code
    ).toBe("provider_budget_exceeded");
    expect(
      validateProviderPromptLength(base.providerProfile!, "x".repeat(4096))
    ).toBeNull();
  });

  it("detects cycles and binds side-effect authorization", () => {
    expect(
      detectPlanCycle([
        { id: "a", dependsOn: ["b"] },
        { id: "b", dependsOn: ["a"] },
      ])
    ).toBe(true);
    const auth = {
      tokenId: "tok",
      tenantId: "tenant",
      contractHash: "a".repeat(64),
      outputHash: "b".repeat(64),
      policyHash: "c".repeat(64),
      allowedEffects: ["provider.submit"],
      expiresAt: "2099-01-01T00:00:00+00:00",
      nonce: "nonce",
    };
    expect(validateSideEffectAuthorization(auth, auth)).toBeNull();
    expect(
      validateSideEffectAuthorization(auth, {
        ...auth,
        policyHash: "d".repeat(64),
      })?.code
    ).toBe("side_effect_unauthorized");
  });

  it("serializes objects with sorted keys for cross-language hashing", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});
