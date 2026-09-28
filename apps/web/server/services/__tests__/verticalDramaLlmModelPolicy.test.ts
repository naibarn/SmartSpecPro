/**
 * Coverage for `verticalDramaLlmModelPolicy.ts`'s
 * `resolveVerticalDramaSeriesModel` — the single centralized resolver every
 * Vertical Drama LLM call site routes through
 * (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 1).
 *
 * Mocking convention mirrors `verticalDramaImproveScript.test.ts`: `../../db`
 * is a minimal table-aware `vi.fn()` stub, `../enabledLlmModels` is mocked as
 * a black box (its own filter/sort behavior is covered by its own test
 * suite), and `../verticalDramaStoryBible`'s `resolveStoryBibleModel` is
 * mocked directly (rather than left real) so the "everything failed" last-
 * resort path is deterministic and doesn't depend on that file's own DB
 * access.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  seriesRows: [] as unknown[],
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.from = () => builder;
      builder.where = () => builder;
      builder.limit = () => builder;
      builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        try {
          resolve(hoisted.seriesRows);
        } catch (err) {
          reject?.(err);
        }
      };
      return builder;
    }),
  },
}));

vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
  resolveRoutableLlmModelIdFromRows: vi.fn(),
}));

vi.mock("../verticalDramaImproveScript", () => ({
  selectRecommendedQualityLargeContextEligibleModels: vi.fn((rows: unknown[]) => rows),
}));

vi.mock("../verticalDramaStoryBible", () => ({
  resolveStoryBibleModel: vi.fn(),
}));

import { db } from "../../db";
import {
  loadEnabledLlmModelRows,
  resolveRoutableLlmModelIdFromRows,
} from "../enabledLlmModels";
import { selectRecommendedQualityLargeContextEligibleModels } from "../verticalDramaImproveScript";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import {
  assertVerticalDramaRecommendedDraftModel,
  resolveVerticalDramaRecommendedDraftModel,
  resolveVerticalDramaPromptExpansionModel,
  resolveVerticalDramaSeriesModel,
} from "../verticalDramaLlmModelPolicy";

const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockResolveRoutableLlmModelIdFromRows = vi.mocked(resolveRoutableLlmModelIdFromRows);
const mockResolveStoryBibleModel = vi.mocked(resolveStoryBibleModel);
const mockSelectRecommendedQualityLargeContextEligibleModels = vi.mocked(selectRecommendedQualityLargeContextEligibleModels);

const ENABLED_ROWS = [
  { modelId: "auto-fallback-model", providerName: "test-provider" },
  { modelId: "override-model", providerName: "test-provider" },
] as never;

const PROMPT_EXPANSION_ROWS = [
  {
    modelId: "openai/gpt-5.4-nano",
    providerId: 1,
    isRecommended: false,
    contextLength: 400_000,
  },
  {
    modelId: "openai/gpt-5.6-luna",
    providerId: 1,
    isRecommended: true,
    contextLength: 1_050_000,
  },
  {
    modelId: "manual-only-model",
    providerId: 1,
    isRecommended: true,
    catalogEligibility: "manual-only",
  },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.seriesRows = [];
  mockResolveStoryBibleModel.mockResolvedValue("active-story-bible-model");
  mockResolveRoutableLlmModelIdFromRows.mockImplementation(({ rows, preferredModelIds }) => {
    const preferred = preferredModelIds?.find((modelId) =>
      rows.some((row) => row.modelId === modelId),
    );
    return preferred ?? null;
  });
  mockSelectRecommendedQualityLargeContextEligibleModels.mockImplementation(rows => rows as never);
});

describe("resolveVerticalDramaSeriesModel", () => {
  it("returns the override when defaultModelId is set and still enabled — autoFallback is never called", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "override-model" } }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ENABLED_ROWS);
    const autoFallback = vi.fn().mockResolvedValue("auto-fallback-model");

    const modelId = await resolveVerticalDramaSeriesModel(6, autoFallback);

    expect(modelId).toBe("override-model");
    expect(autoFallback).not.toHaveBeenCalled();
  });

  it("fails closed when the pinned override model has been disabled/removed from the catalog", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "no-longer-enabled" } }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ENABLED_ROWS);
    const autoFallback = vi.fn().mockResolvedValue("auto-fallback-model");

    await expect(resolveVerticalDramaSeriesModel(6, autoFallback)).rejects.toThrow(
      "no-longer-enabled",
    );
    expect(autoFallback).not.toHaveBeenCalled();
  });

  it("fails closed when the pinned model is enabled but every mapped provider is in health cooldown", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "override-model" } }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ENABLED_ROWS);
    mockResolveRoutableLlmModelIdFromRows.mockImplementation(({ preferredModelIds }) =>
      preferredModelIds?.[0] === "override-model" ? null : "auto-fallback-model",
    );
    const autoFallback = vi.fn().mockResolvedValue("auto-fallback-model");

    await expect(resolveVerticalDramaSeriesModel(6, autoFallback)).rejects.toThrow(
      "override-model",
    );
    expect(autoFallback).not.toHaveBeenCalled();
  });

  it("falls back to autoFallback when there is no override configured (llmModelPolicy null)", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: null }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ENABLED_ROWS);
    const autoFallback = vi.fn().mockResolvedValue("auto-fallback-model");

    const modelId = await resolveVerticalDramaSeriesModel(6, autoFallback);

    expect(modelId).toBe("auto-fallback-model");
    expect(mockLoadEnabledLlmModelRows).toHaveBeenCalledWith();
    expect(autoFallback).toHaveBeenCalledTimes(1);
  });

  it("falls back to autoFallback when the series row itself is missing", async () => {
    hoisted.seriesRows = [];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ENABLED_ROWS);
    const autoFallback = vi.fn().mockResolvedValue("auto-fallback-model");

    const modelId = await resolveVerticalDramaSeriesModel(999, autoFallback);

    expect(modelId).toBe("auto-fallback-model");
    expect(autoFallback).toHaveBeenCalledTimes(1);
  });

  it("never throws and falls back to autoFallback when the DB read itself fails", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "override-model" } }];
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("connection reset");
    });
    const autoFallback = vi.fn().mockResolvedValue("auto-fallback-model");

    const modelId = await resolveVerticalDramaSeriesModel(6, autoFallback);

    expect(modelId).toBe("auto-fallback-model");
    expect(autoFallback).toHaveBeenCalledTimes(1);
  });

  it("fails closed when automatic selection has no routable recommended model", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: null }];
    const autoFallback = vi.fn().mockResolvedValue(null);

    await expect(resolveVerticalDramaSeriesModel(6, autoFallback)).rejects.toThrow(
      "No active Vertical Drama LLM model is currently routable",
    );
    expect(mockResolveStoryBibleModel).not.toHaveBeenCalled();
  });
});

describe("resolveVerticalDramaPromptExpansionModel", () => {
  it("uses the persisted series pin exactly and never consults automatic selection", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "openai/gpt-5.4-nano" } }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(PROMPT_EXPANSION_ROWS);

    await expect(resolveVerticalDramaPromptExpansionModel({ seriesId: 53 }))
      .resolves.toBe("openai/gpt-5.4-nano");
    expect(mockSelectRecommendedQualityLargeContextEligibleModels).not.toHaveBeenCalled();
  });

  it("fails closed when the explicit model is unavailable instead of switching models", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "retired-model" } }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(PROMPT_EXPANSION_ROWS);
    mockResolveRoutableLlmModelIdFromRows.mockReturnValue(null);

    await expect(resolveVerticalDramaPromptExpansionModel({ seriesId: 53 }))
      .rejects.toThrow("retired-model");
    expect(mockSelectRecommendedQualityLargeContextEligibleModels).not.toHaveBeenCalled();
  });

  it("honors an explicitly selected enabled manual-only model exactly", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue(PROMPT_EXPANSION_ROWS);

    await expect(resolveVerticalDramaPromptExpansionModel({
      requestedModelId: "manual-only-model",
    })).resolves.toBe("manual-only-model");
    expect(mockSelectRecommendedQualityLargeContextEligibleModels).not.toHaveBeenCalled();
  });

  it("uses only the recommended quality set for automatic selection", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: null }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(PROMPT_EXPANSION_ROWS);

    await expect(resolveVerticalDramaPromptExpansionModel({ seriesId: 53 }))
      .resolves.toBe("openai/gpt-5.6-luna");
  });

  it("honors a pre-create wizard model selection without a persisted series", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue(PROMPT_EXPANSION_ROWS);

    await expect(resolveVerticalDramaPromptExpansionModel({
      requestedModelId: "openai/gpt-5.6-luna",
    })).resolves.toBe("openai/gpt-5.6-luna");
    expect(mockSelectRecommendedQualityLargeContextEligibleModels).not.toHaveBeenCalled();
  });
});

describe("resolveVerticalDramaRecommendedDraftModel", () => {
  it("selects only the admin-recommended quality model and excludes gpt-5.4-nano", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      {
        modelId: "openai/gpt-5.4-nano",
        isRecommended: false,
        contextLength: 400_000,
        supportsThinking: true,
        supportsStructuredOutputs: true,
        isFree: false,
        priority: 0,
      },
      {
        modelId: "openai/gpt-5.6-luna",
        isRecommended: true,
        contextLength: 1_050_000,
        supportsThinking: true,
        supportsStructuredOutputs: true,
        isFree: false,
        priority: 4,
      },
    ] as never);

    await expect(resolveVerticalDramaRecommendedDraftModel()).resolves.toBe(
      "openai/gpt-5.6-luna",
    );
  });

  it("fails closed when no active recommended Draft model exists", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      {
        modelId: "openai/gpt-5.4-nano",
        isRecommended: false,
        contextLength: 400_000,
        supportsThinking: true,
        supportsStructuredOutputs: true,
        isFree: false,
        priority: 0,
      },
    ] as never);

    await expect(resolveVerticalDramaRecommendedDraftModel()).rejects.toThrow(
      /No admin-recommended Vertical Drama Draft LLM/,
    );
  });

  it("rejects a queued model after it leaves the recommendation set", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      {
        modelId: "openai/gpt-5.6-luna",
        isRecommended: false,
        contextLength: 1_050_000,
        supportsThinking: true,
        supportsStructuredOutputs: true,
        isFree: false,
        priority: 4,
      },
    ] as never);

    await expect(
      assertVerticalDramaRecommendedDraftModel("openai/gpt-5.6-luna"),
    ).rejects.toThrow(/not in the active LLM Recommend set/);
  });
});
