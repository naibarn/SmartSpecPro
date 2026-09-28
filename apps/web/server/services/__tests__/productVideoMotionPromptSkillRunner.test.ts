import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the runner's collaborators so no DB / network / real LLM is hit. ──
// The vision-fallback resilience helper itself
// (runProductReferenceStoryboardVisionLlmCallWithFallback) is imported REAL to
// prove the new runner reuses it rather than re-implementing the retry loop.
vi.mock("../skillRegistry", () => ({
  syncSingleSkillIfChanged: vi.fn(async () => ({ error: null })),
  getSkillByIdAsync: vi.fn(async () => ({
    id: "product-video-motion-prompt",
    slug: "product-video-motion-prompt",
    name: "Product Video Motion Prompt",
    skillContent: "MOTION PROMPT SKILL BODY RULES",
    systemPrompt: "MOTION PROMPT SKILL BODY RULES",
    executionPolicy: {
      mode: "requirements",
      requirements: { supportsVision: true },
      fallbackPolicy: "error",
    },
  })),
}));

vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn(async () => ({
    modelId: "vision-model-a",
    allowFreeModels: false,
    modelSource: "requirements_match",
  })),
}));

const executeWithFallbackMock = vi.fn(async () => ({
  type: "success" as const,
  providerId: 1,
  providerName: "test-provider",
  response: {
    choices: [
      {
        message: {
          content:
            "Beginning on the start keyframe, the model presses the pump so shampoo falls onto the open palm, then lathers it into soft foam through the hair, ending on a clear product showcase held toward camera.",
        },
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 60 },
  },
}));

vi.mock("../llmRouter", () => ({
  getProviderForModel: vi.fn(async () => ({
    providerId: 1,
    providerName: "test-provider",
  })),
  executeWithFallback: (...args: unknown[]) =>
    (executeWithFallbackMock as any)(...args),
}));

const deductCreditsMock = vi.fn(async () => ({}));
vi.mock("../creditService", () => ({
  calculateCreditsForLLM: vi.fn(() => 2),
  deductCredits: (...args: unknown[]) => (deductCreditsMock as any)(...args),
}));

vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => []),
}));

vi.mock("../intelligentModelSelector", () => ({
  selectLlmModelCandidates: vi.fn(() => ["vision-model-a"]),
}));

import {
  runProductVideoMotionPromptSkill,
  buildProductVideoMotionPromptUserPrompt,
} from "../productVideoMotionPromptSkillRunner";

const MOTION_TEXT_EN =
  "The model pumps the shampoo bottle, pours onto the palm, lathers into foam, then ends on a clear product showcase.";

describe("buildProductVideoMotionPromptUserPrompt (facts-only, absent ⇒ zero bytes)", () => {
  it("omits every absent field and includes only supplied facts", () => {
    const prompt = buildProductVideoMotionPromptUserPrompt({
      shotMovement: "slow push-in on the hero",
      startFrameUrl: "https://cdn/x.png",
    });
    expect(prompt).toContain("Planned shot movement: slow push-in on the hero");
    expect(prompt).toContain("start keyframe");
    expect(prompt).not.toContain("Product:");
    expect(prompt).not.toContain("Voiceover");
    expect(prompt).not.toContain("stop keyframe");
    expect(prompt).not.toContain("User motion direction");
  });

  it("renders the motion direction as a mandatory additional directive when present", () => {
    const prompt = buildProductVideoMotionPromptUserPrompt({
      shotMovement: "push-in",
      startFrameUrl: "https://cdn/x.png",
      stopFrameUrl: "https://cdn/y.png",
      shotOrder: 3,
      shotCount: 5,
      isLastShot: false,
      motionDirection: MOTION_TEXT_EN,
    });
    expect(prompt).toContain(
      "User motion direction (MANDATORY additional directive; map only this shot's slice of the sequence):"
    );
    expect(prompt).toContain(MOTION_TEXT_EN);
    expect(prompt).toContain("Shot position: 3 of 5");
    expect(prompt).toContain("stop keyframe");
  });
});

describe("runProductVideoMotionPromptSkill — success path", () => {
  beforeEach(() => {
    executeWithFallbackMock.mockClear();
    deductCreditsMock.mockClear();
  });

  it("builds the prompt from the skill LLM output and sends a vision (image) message", async () => {
    const result = await runProductVideoMotionPromptSkill({
      tenantId: "tenant-1",
      userId: 42,
      facts: {
        productName: "Silk Shampoo",
        shotMovement: "slow push-in",
        shotOrder: 1,
        shotCount: 3,
        durationSeconds: 5,
        startFrameUrl: "https://cdn/start.png",
        motionDirection: MOTION_TEXT_EN,
      },
      referenceImages: ["https://cdn/start.png", "https://cdn/product.png"],
      runId: "run-1",
      unitId: "unit-1",
      attempt: 1,
    });

    expect(result.prompt).toContain("start keyframe");
    expect(result.prompt).toContain("product showcase");
    expect(result.modelId).toBe("vision-model-a");
    expect(result.visionFallback).toBeNull();
    expect(deductCreditsMock).toHaveBeenCalledTimes(1);

    // Proves the reused vision helper dispatched an image_url part (vision).
    expect(executeWithFallbackMock).toHaveBeenCalled();
    const firstCallArgs = (executeWithFallbackMock.mock.calls[0] ?? []) as any[];
    const messages = firstCallArgs[0]?.messages ?? [];
    const userMessage = messages.find((m: any) => m.role === "user");
    const hasImagePart =
      Array.isArray(userMessage?.content) &&
      userMessage.content.some((part: any) => part?.type === "image_url");
    expect(hasImagePart).toBe(true);
  });
});
