import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
const { mockResolveVerticalDramaSeriesModel } = vi.hoisted(() => ({
  mockResolveVerticalDramaSeriesModel: vi.fn(),
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: mockResolveVerticalDramaSeriesModel,
}));
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});

import { generateNextEpisodesViaLlm } from "../verticalDramaEpisodeContinuation";
import { createUniformVerticalDramaDurationPlan } from "@shared/verticalDramaSeries/durationProfiles";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import {
  resolveStoryBibleModel,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../verticalDramaStoryBible";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);

function baseParams(overrides: Partial<Parameters<typeof generateNextEpisodesViaLlm>[0]> = {}) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    title: "My Series",
    locale: "en" as const,
    genre: "romance",
    tone: "dramatic",
    bible: { mainPlot: "plot" },
    existingEpisodes: [{ episodeNumber: 1, title: "Ep1", logline: "l1", keyBeats: ["b1"] }],
    nextEpisodeNumber: 2,
    count: 2,
    ...overrides,
  };
}

function successResponse(episodes: unknown[]) {
  return {
    type: "success" as const,
    response: {
      choices: [
        {
          message: { content: JSON.stringify({ episodes }) },
          index: 0,
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

function validEpisode(num: number) {
  return {
    episodeNumber: num,
    workingTitle: `Episode ${num}`,
    logline: `Logline ${num}`,
    keyBeats: ["beat 1", "beat 2"],
  };
}

describe("generateNextEpisodesViaLlm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveVerticalDramaSeriesModel.mockResolvedValue("gpt-4o-mini");
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(5);
    mockDeductCredits.mockResolvedValue(undefined as any);
  });

  it("happy path: valid LLM response projects generated episodes, deducts credits once", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse([validEpisode(2), validEpisode(3)]));

    const result = await generateNextEpisodesViaLlm(baseParams());

    expect(result.generated).toHaveLength(2);
    expect(result.generated[0].episodeNumber).toBe(2);
    expect(result.generated[1].episodeNumber).toBe(3);
    expect(result.creditsUsed).toBe(5);
    expect(result.model).toBe("gpt-4o-mini");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        tenantId: "tenant-1",
        amount: 5,
        sourceType: "skill",
        metadata: expect.objectContaining({ seriesId: 42, feature: "vertical_drama_series" }),
      }),
    );
  });

  it("threads the bounded story-control seed and nine-shot profile into continuation prompts", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse([validEpisode(2), validEpisode(3)]));

    await generateNextEpisodesViaLlm(
      baseParams({
        storyControlSeed: {
          contractVersion: 1,
          premiseAnchor: "A mystery paid for with trust",
          canonicalCharacterKeys: ["aria"],
          threadCandidates: [],
          romancePhaseSkeleton: [],
          advantageIntent: [],
        },
        durationPlan: createUniformVerticalDramaDurationPlan(10),
      }),
    );

    const callArgs = mockExecute.mock.calls[0][0];
    const userMessage = callArgs.messages.find((message: { role: string }) => message.role === "user");
    expect(userMessage.content).toContain("mystery paid for with trust");
    expect(userMessage.content).toContain("durations 10, 10, 10");
    expect(userMessage.content).toContain("derived runtime 90 seconds");
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateNextEpisodesViaLlm(baseParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output and does not deduct credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse([{ episodeNumber: 2 }])); // missing required fields

    await expect(generateNextEpisodesViaLlm(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("treats a short batch (fewer than requested count) as an all-or-nothing validation failure", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse([validEpisode(2)])); // only 1, requested 2

    await expect(generateNextEpisodesViaLlm(baseParams({ count: 2 }))).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws a generic error when the LLM router does not return a successful response", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue({ type: "error", error: "provider down" } as any);

    await expect(generateNextEpisodesViaLlm(baseParams())).rejects.toThrow(/LLM request failed/);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
