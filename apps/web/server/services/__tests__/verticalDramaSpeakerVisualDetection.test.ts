import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
  executeVisionAwareJsonCallWithRetry: vi.fn(),
  resolveVerticalDramaSeriesModel: vi.fn(),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mocks.hasEnoughCredits,
  deductCredits: mocks.deductCredits,
  calculateCreditsForLLM: mocks.calculateCreditsForLLM,
}));
vi.mock("../verticalDramaStoryBible", () => ({
  executeVisionAwareJsonCallWithRetry: mocks.executeVisionAwareJsonCallWithRetry,
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
  VdSchemaValidationError: class VdSchemaValidationError extends Error {},
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: mocks.resolveVerticalDramaSeriesModel,
}));
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));

import { detectVerticalDramaShotPeople } from "../verticalDramaSpeakerVisualDetection";

describe("vertical drama speaker visual detection billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasEnoughCredits.mockResolvedValue(true);
    mocks.deductCredits.mockResolvedValue(undefined);
    mocks.resolveVerticalDramaSeriesModel.mockResolvedValue("selected-vision-model");
    mocks.calculateCreditsForLLM.mockImplementation((prompt: number, completion: number) => prompt + completion);
  });

  const params = {
    userId: 7,
    tenantId: "tenant-a",
    seriesId: 22,
    episodeId: 33,
    shotNumber: 4,
    sourceMediaAssetId: "media-asset-9",
    imageUrl: "https://media.example.test/start-frame.jpg",
  };

  it("bills usage from every successful and schema-repair attempt under the skill slug", async () => {
    mocks.executeVisionAwareJsonCallWithRetry.mockImplementation(async (input: any) => {
      input.onUsage({ model: "vision-a", usage: { prompt_tokens: 10, completion_tokens: 2 } }, "selected-vision-model");
      input.onUsage({ model: "vision-b", usage: { prompt_tokens: 20, completion_tokens: 3 } }, "fallback-vision-model");
      return {
        data: {
          people: [{
            id: "person-1",
            bounding_box: { x: 0.1, y: 0.2, width: 0.3, height: 0.6 },
            appearance: "person in dark clothes at the rear",
            confidence: 0.9,
          }],
        },
        response: { model: "vision-b", usage: { prompt_tokens: 20, completion_tokens: 3 } },
        usedVision: true,
      };
    });

    const result = await detectVerticalDramaShotPeople(params);

    expect(result.people[0]).toMatchObject({ id: "person-1", boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.6 } });
    expect(result.creditsUsed).toBe(35);
    expect(mocks.deductCredits).toHaveBeenCalledWith(expect.objectContaining({
      amount: 35,
      skillSlug: "vertical-drama-speaker-visual-detection",
      sourceType: "skill",
      tenantId: "tenant-a",
      contextRef: {
        contextType: "series",
        sourceType: "vertical_drama_series",
        sourceId: "22",
      },
    }));
  });

  it("charges a text-only recovery before refusing to return ungrounded detections", async () => {
    mocks.executeVisionAwareJsonCallWithRetry.mockImplementation(async (input: any) => {
      input.onUsage({ model: "text-recovery", usage: { prompt_tokens: 8, completion_tokens: 2 } }, "selected-vision-model");
      return {
        data: { people: [] },
        response: { model: "text-recovery", usage: { prompt_tokens: 8, completion_tokens: 2 } },
        usedVision: false,
      };
    });

    await expect(detectVerticalDramaShotPeople(params)).rejects.toThrow("โมเดลที่รองรับ vision");
    expect(mocks.deductCredits).toHaveBeenCalledWith(expect.objectContaining({
      amount: 10,
      skillSlug: "vertical-drama-speaker-visual-detection",
    }));
  });
});
