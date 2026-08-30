import { beforeEach, describe, expect, it, vi } from "vitest";

const { deductCreditsForModel } = vi.hoisted(() => ({
  deductCreditsForModel: vi.fn(),
}));

vi.mock("../creditService", () => ({
  deductCreditsForModel,
}));

import { chargeVerticalDramaLlmCall } from "../verticalDramaLlmBilling";

describe("verticalDramaLlmBilling", () => {
  beforeEach(() => {
    deductCreditsForModel.mockClear();
  });

  it("writes one skill transaction with the actual model and repair metadata", async () => {
    deductCreditsForModel.mockResolvedValue({ creditsUsed: 7, wasFree: false });

    await expect(
      chargeVerticalDramaLlmCall({
        userId: 9,
        tenantId: "tenant-1",
        seriesId: 53,
        jobId: "job-1",
        runId: "run-1",
        attemptKey: "run-1:repair:1:episode:4",
        skillSlug: "vertical-drama-deep-story-draft",
        stage: "dialogue_repair",
        round: 1,
        attempt: 1,
        model: "openai/gpt-5.6-luna",
        provider: "openrouter",
        providerCallId: "call-1",
        inputTokens: 123,
        outputTokens: 456,
        scope: { episodeNumbers: [4] },
      }),
    ).resolves.toEqual({ creditsUsed: 7, wasFree: false });

    expect(deductCreditsForModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5.6-luna",
        skillSlug: "vertical-drama-deep-story-draft",
        idempotencyKey: "run-1:repair:1:episode:4",
        skillRunId: "run-1:repair:1:episode:4",
        metadata: expect.objectContaining({
          stage: "dialogue_repair",
          round: 1,
          attempt: 1,
          actualModel: "openai/gpt-5.6-luna",
        }),
      }),
    );
  });

  it("fails closed before calling the ledger when the skill slug is missing", async () => {
    await expect(
      chargeVerticalDramaLlmCall({
        userId: 9,
        runId: "run-1",
        attemptKey: "run-1:1",
        skillSlug: " ",
        stage: "draft",
        round: 0,
        attempt: 1,
        model: "openai/gpt-5.6-luna",
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).rejects.toThrow("Skill billing requires skillSlug");
    expect(deductCreditsForModel).not.toHaveBeenCalled();
  });
});
