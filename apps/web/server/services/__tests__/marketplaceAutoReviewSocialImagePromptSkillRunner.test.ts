import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLMDynamic: vi.fn(),
  getSkillRunCreditCost: vi.fn(),
  executeVisionAwareJsonCallWithRetry: vi.fn(),
  getSkillByIdAsync: vi.fn(),
  syncSingleSkillIfChanged: vi.fn(),
  resolveSkillExecutionPolicy: vi.fn(),
  loadEnabledLlmModelRows: vi.fn(),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mocks.hasEnoughCredits,
  deductCredits: mocks.deductCredits,
  calculateCreditsForLLMDynamic: mocks.calculateCreditsForLLMDynamic,
}));
vi.mock("../skillRevenueBilling", () => ({
  getSkillRunCreditCost: mocks.getSkillRunCreditCost,
}));
vi.mock("../verticalDramaStoryBible", () => ({
  executeVisionAwareJsonCallWithRetry:
    mocks.executeVisionAwareJsonCallWithRetry,
}));
vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: mocks.getSkillByIdAsync,
  syncSingleSkillIfChanged: mocks.syncSingleSkillIfChanged,
}));
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: mocks.resolveSkillExecutionPolicy,
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: mocks.loadEnabledLlmModelRows,
}));

import { generateMarketplaceSocialImagePrompt } from "../marketplaceAutoReviewSocialImagePromptSkillRunner";

const skillDir = path.resolve(
  __dirname,
  "../../../skills/social-commerce-post-image-prompt"
);
const canonicalSkillPath = path.join(skillDir, "SKILL.md");
const runtimeSkillPath = path.join(skillDir, "skill.md");

describe("social commerce post image prompt skill", () => {
  it("defines the structured, reference-grounded prompt contract", () => {
    const skillExists = existsSync(canonicalSkillPath);
    expect(skillExists).toBe(true);
    if (!skillExists) return;

    const skill = readFileSync(canonicalSkillPath, "utf8");
    expect(skill).toContain("name: social-commerce-post-image-prompt");
    expect(skill).toContain('"imagePrompt"');
    expect(skill).toContain('"negativePrompt"');
    expect(skill).toContain("supplies every active reference image");
    expect(skill).toContain("preserve the exact product shape");
    expect(skill).toContain("preserve the referenced character identity");
    expect(skill).toContain("Product claims must come from");
    expect(readFileSync(runtimeSkillPath, "utf8")).toBe(skill);
  });
});

describe("marketplace social image prompt runner billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasEnoughCredits.mockResolvedValue(true);
    mocks.deductCredits.mockResolvedValue({ creditsUsed: 12 });
    mocks.calculateCreditsForLLMDynamic.mockResolvedValue(12);
    mocks.getSkillRunCreditCost.mockResolvedValue(2);
    mocks.syncSingleSkillIfChanged.mockResolvedValue({});
    mocks.getSkillByIdAsync.mockResolvedValue({
      id: "social-commerce-post-image-prompt",
    });
    mocks.resolveSkillExecutionPolicy.mockResolvedValue({
      modelId: "vision-model-a",
    });
    mocks.loadEnabledLlmModelRows.mockResolvedValue([
      {
        modelId: "vision-model-a",
        providerModelId: "provider/vision-model-a",
        supportsVision: true,
      },
    ]);
    mocks.executeVisionAwareJsonCallWithRetry.mockImplementation(
      async (input: any) => {
        input.onUsage(
          { usage: { prompt_tokens: 120, completion_tokens: 45 } },
          input.model,
          "openrouter"
        );
        return {
          data: {
            imagePrompt:
              "Portrait commercial photography, keep the product recognizable.",
            negativePrompt: "added text, watermark, collage",
          },
          response: { model: "vision-model-a" },
          providerName: "openrouter",
          usedVision: true,
        };
      }
    );
  });

  const input = {
    userId: 7,
    tenantId: "tenant-a",
    publicUrl: "https://smartaihub.app",
    runId: "mar_run_1",
    requestIdempotencyKey: "caption-v3",
    variant: "character_reference" as const,
    language: "th" as const,
    caption: "ครีมบำรุงผิวสำหรับทุกวัน",
    product: {
      productName: "Daily Cream",
      description: "Light moisturizer",
      specs: { size: "30 ml" },
    },
    sources: [
      {
        label: "Mali reference portrait",
        imageUrl: "https://media.example.test/character.jpg",
      },
      {
        label: "Ani reference portrait",
        imageUrl: "https://media.example.test/character-2.jpg",
      },
    ],
    aspectRatio: "4:5" as const,
  };

  it("sends all job references and the caption, then bills actual usage idempotently per variant", async () => {
    const result = await generateMarketplaceSocialImagePrompt(input);

    expect(result).toMatchObject({
      imagePrompt: expect.stringContaining("Portrait commercial photography"),
      negativePrompt: expect.stringContaining("watermark"),
      model: "vision-model-a",
      provider: "openrouter",
      creditsUsed: 12,
    });
    const call = mocks.executeVisionAwareJsonCallWithRetry.mock.calls[0][0];
    expect(call.images).toEqual([
      expect.objectContaining({ url: input.sources[0].imageUrl }),
      expect.objectContaining({ url: input.sources[1].imageUrl }),
    ]);
    expect(call.hasVision).toBe(true);
    expect(call.disableTextFallback).toBe(true);
    expect(call.disableProviderFallbacks).toBe(true);
    expect(call.userPromptText).toContain(input.caption);
    expect(call.userPromptText).toContain("Ani reference portrait");
    expect(call.userPromptText).toContain("character_reference");
    expect(call.userPromptText).toContain("4:5");
    expect(mocks.calculateCreditsForLLMDynamic).toHaveBeenCalledWith(
      120,
      45,
      "vision-model-a"
    );
    expect(mocks.deductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12,
        tenantId: "tenant-a",
        skillSlug: "social-commerce-post-image-prompt",
        sourceType: "skill",
        idempotencyKey: expect.stringContaining(
          "marketplace-auto-review-social-image:"
        ),
      })
    );
  });

  it("rejects a response without measured token usage instead of guessing a charge", async () => {
    mocks.executeVisionAwareJsonCallWithRetry.mockImplementationOnce(
      async () => ({
        data: {
          imagePrompt: "Portrait product scene.",
          negativePrompt: "text",
        },
        response: { model: "vision-model-a" },
        providerName: "openrouter",
        usedVision: true,
      })
    );

    await expect(generateMarketplaceSocialImagePrompt(input)).rejects.toThrow(
      "MARKETPLACE_SKILL_USAGE_REQUIRED:social-commerce-post-image-prompt"
    );
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it("bills usage from every same-provider schema-repair attempt", async () => {
    mocks.executeVisionAwareJsonCallWithRetry.mockImplementationOnce(
      async (call: any) => {
        call.onUsage(
          { usage: { prompt_tokens: 120, completion_tokens: 45 } },
          call.model,
          "openrouter"
        );
        call.onUsage(
          { usage: { prompt_tokens: 80, completion_tokens: 30 } },
          call.model,
          "openrouter"
        );
        return {
          data: {
            imagePrompt: "Portrait commercial photography.",
            negativePrompt: "added text, watermark",
          },
          response: { model: "vision-model-a" },
          providerName: "openrouter",
          usedVision: true,
        };
      }
    );

    await generateMarketplaceSocialImagePrompt(input);

    expect(mocks.calculateCreditsForLLMDynamic).toHaveBeenCalledWith(
      200,
      75,
      "vision-model-a"
    );
  });

  it("reports measured credits when a billed schema-repair call still fails", async () => {
    mocks.executeVisionAwareJsonCallWithRetry.mockImplementationOnce(
      async (call: any) => {
        call.onUsage(
          { usage: { prompt_tokens: 120, completion_tokens: 45 } },
          call.model,
          "openrouter"
        );
        throw new Error("Vision-aware response failed schema validation");
      }
    );

    await expect(
      generateMarketplaceSocialImagePrompt(input)
    ).rejects.toMatchObject({
      name: "MarketplaceSocialImagePromptFailure",
      message: "Vision-aware response failed schema validation",
      creditsUsed: 12,
    });
    expect(mocks.deductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12 })
    );
  });
});
