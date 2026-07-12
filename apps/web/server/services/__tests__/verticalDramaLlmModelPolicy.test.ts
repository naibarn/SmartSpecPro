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
}));

vi.mock("../verticalDramaStoryBible", () => ({
  resolveStoryBibleModel: vi.fn(),
}));

import { db } from "../../db";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import { resolveVerticalDramaSeriesModel } from "../verticalDramaLlmModelPolicy";

const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockResolveStoryBibleModel = vi.mocked(resolveStoryBibleModel);

const ENABLED_ROWS = [
  { modelId: "auto-fallback-model", providerName: "test-provider" },
  { modelId: "override-model", providerName: "test-provider" },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.seriesRows = [];
  mockResolveStoryBibleModel.mockResolvedValue("gpt-4o-mini");
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

  it("falls back to autoFallback when the pinned override model has been disabled/removed from the catalog", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "no-longer-enabled" } }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ENABLED_ROWS);
    const autoFallback = vi.fn().mockResolvedValue("auto-fallback-model");

    const modelId = await resolveVerticalDramaSeriesModel(6, autoFallback);

    expect(modelId).toBe("auto-fallback-model");
    expect(autoFallback).toHaveBeenCalledTimes(1);
  });

  it("falls back to autoFallback when there is no override configured (llmModelPolicy null)", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: null }];
    const autoFallback = vi.fn().mockResolvedValue("auto-fallback-model");

    const modelId = await resolveVerticalDramaSeriesModel(6, autoFallback);

    expect(modelId).toBe("auto-fallback-model");
    expect(mockLoadEnabledLlmModelRows).not.toHaveBeenCalled();
    expect(autoFallback).toHaveBeenCalledTimes(1);
  });

  it("falls back to autoFallback when the series row itself is missing", async () => {
    hoisted.seriesRows = [];
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

  it("falls all the way back to resolveStoryBibleModel's last resort when autoFallback itself returns null", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: null }];
    const autoFallback = vi.fn().mockResolvedValue(null);

    const modelId = await resolveVerticalDramaSeriesModel(6, autoFallback);

    expect(modelId).toBe("gpt-4o-mini");
    expect(mockResolveStoryBibleModel).toHaveBeenCalledTimes(1);
  });
});
