import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(),
    getResetTime: vi.fn(),
  },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(),
}));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<
    typeof import("../verticalDramaStoryBible")
  >("../verticalDramaStoryBible");
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});
// Phase 6 (`planning/vertical-drama-centralized-model-policy/plan.md`) —
// `resolveAdBannerPromptModel`'s non-capability-gated fallback now uses
// `resolveQualityLargeContextModelId` (was `resolveStoryBibleModel`).
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));
// Centralized per-series model policy resolver
// (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 3) — its
// own override/fallback contract is covered by
// `verticalDramaLlmModelPolicy.test.ts`; here it's mocked as a pure
// passthrough to `autoFallback` (the mocked `resolveQualityLargeContextModelId`
// above) so this file's pre-existing "no override configured" behavior/
// assertions are unaffected and no real DB access happens.
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));
vi.mock("../verticalDramaProductTieIn", async () => {
  const actual = await vi.importActual<
    typeof import("../verticalDramaProductTieIn")
  >("../verticalDramaProductTieIn");
  return {
    ...actual,
    resolveMarketplaceCaptureProductImageUrls: vi.fn(),
  };
});
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
}));
vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: vi.fn() },
}));
vi.mock("../modelRegistry", () => ({
  resolveVerticalDramaCapabilities: vi.fn(),
}));
vi.mock("../pricingCalculator", () => ({
  calculateCreditCost: vi.fn(),
}));

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateAdBannerPrompt,
  resolveAdBannerPromptModel,
  loadAdBannerPromptSystemPrompt,
  AD_BANNER_PROMPT_SYSTEM_PROMPT_FALLBACK,
  AdBannerRateLimitExceededError,
  VdAdBannerForbiddenClaimError,
  InsufficientCreditsError,
  VdSchemaValidationError,
  resolveAdBannerApprovalGate,
  resolveAdBannerProductReferenceImageUrls,
  resolveAdBannerImageModelPricing,
  submitAdBannerImageGeneration,
} from "../verticalDramaAdBanner";
import { executeWithFallback } from "../llmRouter";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "../skillFiles";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "../verticalDramaImproveScript";
import { resolveMarketplaceCaptureProductImageUrls } from "../verticalDramaProductTieIn";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { selectBestLlmModel } from "../intelligentModelSelector";
import { mediaGenerationService } from "../mediaGenerationService";
import { resolveVerticalDramaCapabilities } from "../modelRegistry";
import { calculateCreditCost } from "../pricingCalculator";
import {
  getAdBannerStylePreset,
  getAdBannerPlacementPreset,
} from "@shared/verticalDramaSeries/adBannerPresets";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockResolveQualityModel = vi.mocked(resolveQualityLargeContextModelId);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);
const mockResolveCaptureImages = vi.mocked(
  resolveMarketplaceCaptureProductImageUrls
);
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);
const mockGenerateImageAsync = vi.mocked(
  mediaGenerationService.generateImageAsync
);
const mockResolveCapabilities = vi.mocked(resolveVerticalDramaCapabilities);
const mockCalculateCreditCost = vi.mocked(calculateCreditCost);

function successResponse(
  payload: unknown,
  usage = { prompt_tokens: 100, completion_tokens: 50 }
) {
  return {
    type: "success" as const,
    response: {
      choices: [
        {
          message: { content: JSON.stringify(payload) },
          index: 0,
          finish_reason: "stop",
        },
      ],
      usage,
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

function validPromptOutput(overrides: Record<string, unknown> = {}) {
  return {
    imagePrompt:
      'A bold banner reading "ลดพิเศษ 30%" over a hero product shot.',
    negativePrompt: "blurry text, distorted logo",
    textInImage: ["ลดพิเศษ 30%"],
    compositionNotes:
      "Wide horizontal composition respecting the band guidance.",
    complianceNotes: "No forbidden claims used.",
    ...overrides,
  };
}

function baseParams(
  overrides: Partial<Parameters<typeof generateAdBannerPrompt>[0]> = {}
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 10,
    bannerId: "banner-1",
    product: {
      name: "Glow Serum",
      category: "cosmetics",
      copy: { headline: "ลดพิเศษ 30%" },
      forbiddenClaims: ["cures acne"],
    },
    stylePreset: getAdBannerStylePreset("bold_typography"),
    placement: getAdBannerPlacementPreset("bottom_band"),
    referenceImageUrls: [] as string[],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAllowed.mockReturnValue(true);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockCalculateCredits.mockReturnValue(5);
  mockDeductCredits.mockResolvedValue(undefined as any);
  mockResolveModel.mockResolvedValue("gpt-4o-mini");
  mockResolveQualityModel.mockResolvedValue("gpt-4o-mini");
  mockLoadEnabledLlmModelRows.mockResolvedValue([
    { modelId: "gpt-vision" } as any,
  ]);
  mockSelectBestLlmModel.mockReturnValue("gpt-vision");
  mockResolveSkillDirCandidates.mockReturnValue([
    "/fake/skills/vertical-drama-ad-banner-prompt",
  ]);
  mockResolveSkillManifestPath.mockReturnValue(
    "/fake/skills/vertical-drama-ad-banner-prompt/skill.md"
  );
  mockExistsSync.mockReturnValue(true as any);
  mockReadFileSync.mockReturnValue(
    "---\nname: test\n---\nSystem prompt body" as any
  );
  mockParseSkillFile.mockReturnValue({
    metadata: {} as any,
    content: "System prompt body",
  });
});

describe("loadAdBannerPromptSystemPrompt", () => {
  // NOTE: order matters here — `loadAdBannerPromptSystemPrompt` caches ONLY
  // on success (module-level `let`, not reset by `vi.clearAllMocks()`), so
  // the fallback (uncached) scenario must run BEFORE the success scenario
  // populates that cache, or it would short-circuit and never re-read.
  it("falls back to the inline constant when no skill dir has a manifest", () => {
    mockExistsSync.mockReturnValue(false as any);
    expect(loadAdBannerPromptSystemPrompt()).toBe(
      AD_BANNER_PROMPT_SYSTEM_PROMPT_FALLBACK
    );
  });

  it("reads the skill.md body when the skill file resolves", () => {
    expect(loadAdBannerPromptSystemPrompt()).toBe("System prompt body");
  });
});

describe("resolveAdBannerPromptModel", () => {
  it("requires vision + structured outputs when reference images are present", async () => {
    mockSelectBestLlmModel.mockReturnValue("gpt-vision");
    const result = await resolveAdBannerPromptModel(true, 1);
    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
      { supportsVision: true, supportsStructuredOutputs: true },
      expect.any(Array)
    );
    expect(result).toEqual({ model: "gpt-vision", hasVision: true });
  });

  it("only requires structured outputs when there are no reference images", async () => {
    mockSelectBestLlmModel.mockReturnValue("gpt-structured");
    const result = await resolveAdBannerPromptModel(false, 1);
    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
      { supportsStructuredOutputs: true },
      expect.any(Array)
    );
    expect(result).toEqual({ model: "gpt-structured", hasVision: false });
  });

  it("falls back to resolveQualityLargeContextModelId when no enabled model satisfies the requirement", async () => {
    mockSelectBestLlmModel.mockReturnValue(null);
    mockResolveQualityModel.mockResolvedValue("fallback-model");
    const result = await resolveAdBannerPromptModel(true, 1);
    expect(result).toEqual({ model: "fallback-model", hasVision: false });
  });

  it("falls back to resolveQualityLargeContextModelId when loadEnabledLlmModelRows throws", async () => {
    mockLoadEnabledLlmModelRows.mockRejectedValue(new Error("db down"));
    mockResolveQualityModel.mockResolvedValue("fallback-model");
    const result = await resolveAdBannerPromptModel(false, 1);
    expect(result).toEqual({ model: "fallback-model", hasVision: false });
  });
});

describe("generateAdBannerPrompt", () => {
  it("happy path (no reference images): plain-text user content, deducts credits, checks rate limiter", async () => {
    mockExecute.mockResolvedValue(successResponse(validPromptOutput()));

    const result = await generateAdBannerPrompt(baseParams());

    expect(result.imagePrompt).toContain("ลดพิเศษ 30%");
    expect(result.usedVision).toBe(false);
    expect(result.creditsUsed).toBe(5);
    expect(mockIsAllowed).toHaveBeenCalledWith("user:1");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user"
    );
    expect(typeof userMessage.content).toBe("string");
  });

  it("happy path (with reference images): builds a vision content array with one image_url part per URL", async () => {
    mockSelectBestLlmModel.mockReturnValue("gpt-vision");
    mockExecute.mockResolvedValue(successResponse(validPromptOutput()));

    const result = await generateAdBannerPrompt(
      baseParams({
        referenceImageUrls: [
          "https://example.com/a.png",
          "https://example.com/b.png",
        ],
      })
    );

    expect(result.usedVision).toBe(true);
    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user"
    );
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content).toEqual([
      expect.objectContaining({ type: "text" }),
      expect.objectContaining({
        type: "image_url",
        image_url: { url: "https://example.com/a.png", detail: "high" },
      }),
      expect.objectContaining({
        type: "image_url",
        image_url: { url: "https://example.com/b.png", detail: "high" },
      }),
    ]);
  });

  it("never mentions the story-side product-lock instruction (this path is exempt by design)", async () => {
    mockExecute.mockResolvedValue(successResponse(validPromptOutput()));
    await generateAdBannerPrompt(baseParams());
    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user"
    );
    const text =
      typeof userMessage.content === "string"
        ? userMessage.content
        : JSON.stringify(userMessage.content);
    expect(text).not.toContain("PRODUCT LOCK");
    expect(text).toContain("This banner IS an advertisement");
  });

  it("throws AdBannerRateLimitExceededError before checking credits or calling the LLM", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(20_000);

    await expect(generateAdBannerPrompt(baseParams())).rejects.toThrow(
      AdBannerRateLimitExceededError
    );
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    await expect(generateAdBannerPrompt(baseParams())).rejects.toThrow(
      InsufficientCreditsError
    );
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("retries once on a schema validation failure, then succeeds", async () => {
    mockExecute
      .mockResolvedValueOnce(successResponse({ imagePrompt: "" })) // fails min(1) -> VdSchemaValidationError
      .mockResolvedValueOnce(successResponse(validPromptOutput()));

    const result = await generateAdBannerPrompt(baseParams());
    expect(result.imagePrompt).toContain("ลดพิเศษ 30%");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("throws VdSchemaValidationError when both attempts fail schema validation", async () => {
    mockExecute.mockResolvedValue(successResponse({ imagePrompt: "" }));
    await expect(generateAdBannerPrompt(baseParams())).rejects.toThrow(
      VdSchemaValidationError
    );
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdAdBannerForbiddenClaimError and does NOT deduct credits when the output contains a forbidden claim", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        validPromptOutput({ imagePrompt: "This product CURES acne overnight." })
      )
    );

    await expect(
      generateAdBannerPrompt(
        baseParams({
          product: { ...baseParams().product, forbiddenClaims: ["cures"] },
        })
      )
    ).rejects.toThrow(VdAdBannerForbiddenClaimError);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("also screens textInImage entries for forbidden claims", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        validPromptOutput({
          imagePrompt: "safe prompt",
          textInImage: ["Guaranteed results"],
        })
      )
    );

    await expect(
      generateAdBannerPrompt(
        baseParams({
          product: { ...baseParams().product, forbiddenClaims: ["guaranteed"] },
        })
      )
    ).rejects.toThrow(VdAdBannerForbiddenClaimError);
  });
});

describe("resolveAdBannerApprovalGate", () => {
  it("is true only when the category is regulated AND requireHumanApproval is true", () => {
    expect(resolveAdBannerApprovalGate("health", true)).toBe(true);
    expect(resolveAdBannerApprovalGate("health", false)).toBe(false);
    expect(resolveAdBannerApprovalGate(undefined, true)).toBe(false);
    expect(resolveAdBannerApprovalGate("none", true)).toBe(false);
  });
});

describe("resolveAdBannerProductReferenceImageUrls", () => {
  it("combines marketplace capture images with the series' own productImageUrl, capture first", async () => {
    mockResolveCaptureImages.mockResolvedValue(["https://cdn/capture-1.png"]);

    const urls = await resolveAdBannerProductReferenceImageUrls(
      {
        productImageUrl: "https://cdn/manual.png",
        marketplaceCaptureId: "cap-1",
      },
      { userId: 1, tenantId: "tenant-1" }
    );

    expect(mockResolveCaptureImages).toHaveBeenCalledWith("cap-1", {
      userId: 1,
      tenantId: "tenant-1",
    });
    expect(urls).toEqual([
      "https://cdn/capture-1.png",
      "https://cdn/manual.png",
    ]);
  });

  it("degrades to [] when there is no productImageUrl and no capture", async () => {
    mockResolveCaptureImages.mockResolvedValue([]);
    const urls = await resolveAdBannerProductReferenceImageUrls(null, {
      userId: 1,
      tenantId: "tenant-1",
    });
    expect(urls).toEqual([]);
  });
});

describe("resolveAdBannerImageModelPricing", () => {
  function selectChain(rows: unknown[]) {
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
    };
    return chain;
  }

  it("uses the DB row's pricing/capabilities when the model exists", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          modelType: "image",
          creditCost: 12,
          configJson: { a: 1 },
          aspectRatios: ["9:16"],
        },
      ])
    );
    mockCalculateCreditCost.mockReturnValue(12);
    mockResolveCapabilities.mockReturnValue({ maxReferenceImages: 3 } as any);

    const result = await resolveAdBannerImageModelPricing("some-model");

    expect(result).toEqual({
      modelId: "some-model",
      creditCost: 12,
      maxReferenceImages: 3,
    });
    expect(mockResolveCapabilities).toHaveBeenCalledWith("some-model", {
      type: "image",
      aspectRatios: ["9:16"],
      configJson: { a: 1 },
    });
  });

  it("falls back to a default pricing shape when the model row is missing", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    mockCalculateCreditCost.mockReturnValue(10);
    mockResolveCapabilities.mockReturnValue({ maxReferenceImages: 0 } as any);

    const result = await resolveAdBannerImageModelPricing("unknown-model");

    expect(result).toEqual({
      modelId: "unknown-model",
      creditCost: 10,
      maxReferenceImages: 0,
    });
    expect(mockCalculateCreditCost).toHaveBeenCalledWith(
      { creditCost: 10, configJson: null },
      { numImages: 1 }
    );
  });
});

describe("submitAdBannerImageGeneration", () => {
  it("trims referenceImageUrls to maxReferenceImages and tags series/banner provenance", async () => {
    mockGenerateImageAsync.mockResolvedValue({ id: "task-123" } as any);

    const result = await submitAdBannerImageGeneration({
      userId: 1,
      seriesId: 10,
      bannerId: "banner-1",
      prompt: "a banner prompt",
      modelId: "some-model",
      referenceImageUrls: ["u1", "u2", "u3"],
      maxReferenceImages: 2,
      userToken: "token",
    });

    expect(result).toEqual({ taskId: "task-123" });
    const callArgs = mockGenerateImageAsync.mock.calls[0][0];
    expect(callArgs.referenceImageUrls).toEqual(["u1", "u2"]);
    expect(callArgs.extraParams).toEqual({
      __vd_series_id: "10",
      __vd_ad_banner_id: "banner-1",
    });
    expect(mockGenerateImageAsync.mock.calls[0][1]).toBe("token");
  });

  it("omits referenceImageUrls entirely when maxReferenceImages is 0", async () => {
    mockGenerateImageAsync.mockResolvedValue({ id: "task-456" } as any);

    await submitAdBannerImageGeneration({
      userId: 1,
      seriesId: 10,
      bannerId: "banner-1",
      prompt: "a banner prompt",
      modelId: "some-model",
      referenceImageUrls: ["u1"],
      maxReferenceImages: 0,
      userToken: "token",
    });

    const callArgs = mockGenerateImageAsync.mock.calls[0][0];
    expect(callArgs.referenceImageUrls).toBeUndefined();
  });
});
