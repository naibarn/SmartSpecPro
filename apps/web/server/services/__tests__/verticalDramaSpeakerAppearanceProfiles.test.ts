import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLMDynamic: vi.fn(),
  getSkillRunCreditCost: vi.fn(),
}));

vi.mock("../creditService", () => ({
  calculateCreditsForLLMDynamic: mocks.calculateCreditsForLLMDynamic,
  deductCredits: mocks.deductCredits,
  hasEnoughCredits: mocks.hasEnoughCredits,
}));
vi.mock("../skillRevenueBilling", () => ({
  getSkillRunCreditCost: mocks.getSkillRunCreditCost,
}));
vi.mock("../verticalDramaStoryBible", () => ({
  executeVisionAwareJsonCallWithRetry: mocks.execute,
}));
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(async () => "test-vision-model"),
}));

import {
  analyzeVerticalDramaEpisodeAppearanceProfiles,
  createVerticalDramaSpeakerAppearanceFingerprint,
  verticalDramaEpisodeAppearanceProfileOutputSchema,
} from "../verticalDramaSpeakerAppearanceProfiles";

describe("vertical drama episode appearance profile fingerprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasEnoughCredits.mockResolvedValue(true);
    mocks.deductCredits.mockResolvedValue({ creditsUsed: 2 });
    mocks.getSkillRunCreditCost.mockResolvedValue(2);
    mocks.calculateCreditsForLLMDynamic.mockResolvedValue(4);
  });

  it("is stable when frame and roster inputs arrive in a different order", () => {
    const first = createVerticalDramaSpeakerAppearanceFingerprint({
      frames: [
        {
          shotNumber: 2,
          sourceMediaAssetId: "asset-2",
          characterKeys: ["uncle", "young-woman"],
        },
        {
          shotNumber: 1,
          sourceMediaAssetId: "asset-1",
          characterKeys: ["uncle"],
        },
      ],
      characters: [
        {
          id: 2,
          characterKey: "uncle",
          name: "ลุงชาญ",
          visualIdentityNotes: "older man, gray hair",
        },
        {
          id: 1,
          characterKey: "young-woman",
          name: "พิมพ์ชนก",
          visualIdentityNotes: "young woman",
        },
      ],
    });
    const reordered = createVerticalDramaSpeakerAppearanceFingerprint({
      frames: [
        {
          shotNumber: 1,
          sourceMediaAssetId: "asset-1",
          characterKeys: ["uncle", "uncle"],
        },
        {
          shotNumber: 2,
          sourceMediaAssetId: "asset-2",
          characterKeys: ["young-woman", "uncle"],
        },
      ],
      characters: [
        {
          id: 1,
          characterKey: "young-woman",
          name: "พิมพ์ชนก",
          visualIdentityNotes: "young woman",
        },
        {
          id: 2,
          characterKey: "uncle",
          name: "ลุงชาญ",
          visualIdentityNotes: "older man, gray hair",
        },
      ],
    });

    expect(reordered).toBe(first);
  });

  it("invalidates the saved profile when an approved image or appearance reference changes", () => {
    const base = {
      frames: [
        {
          shotNumber: 1,
          sourceMediaAssetId: "asset-1",
          characterKeys: ["character-a"],
        },
      ],
      characters: [
        {
          id: 1,
          characterKey: "character-a",
          name: "Character A",
          visualIdentityNotes: "older man, gray hair",
        },
      ],
    };
    const fingerprint = createVerticalDramaSpeakerAppearanceFingerprint(base);

    expect(
      createVerticalDramaSpeakerAppearanceFingerprint({
        ...base,
        frames: [{ ...base.frames[0], sourceMediaAssetId: "asset-2" }],
      })
    ).not.toBe(fingerprint);
    expect(
      createVerticalDramaSpeakerAppearanceFingerprint({
        ...base,
        characters: [
          {
            ...base.characters[0],
            visualIdentityNotes: "young woman, long dark hair",
          },
        ],
      })
    ).not.toBe(fingerprint);
  });

  it("normalizes observed model variants without weakening character-key validation", () => {
    const parsed = verticalDramaEpisodeAppearanceProfileOutputSchema.parse({
      frames: [
        {
          shot_number: 1,
          characters: [
            {
              character_key: "dynamic-character-7",
              description: "older man with gray hair and beige shirt",
              position: "viewer-right",
              confidence: "high",
            },
          ],
        },
      ],
      episode_cues: {
        "dynamic-character-7": "older man with gray hair",
      },
      provider_debug: "ignored during normalization",
    });

    expect(parsed).toEqual({
      frames: [
        {
          shot_number: 1,
          characters: [
            {
              character_key: "dynamic-character-7",
              visible: true,
              appearance:
                "older man with gray hair and beige shirt; position: viewer-right",
              confidence: 0.5,
            },
          ],
        },
      ],
      profiles: [
        {
          character_key: "dynamic-character-7",
          general_appearance: "older man with gray hair",
        },
      ],
    });
  });

  it("accepts character-keyed observations and derives profiles when the model omits them", () => {
    const parsed = verticalDramaEpisodeAppearanceProfileOutputSchema.parse({
      frames: {
        "2": {
          characters: {
            "dynamic-character-7": {
              appearance: "young woman in a dark navy dress",
              position: "viewer-left",
              confidence: "92%",
            },
          },
        },
      },
      episode_cues: ["recurring navy wardrobe"],
    });

    expect(parsed.frames).toEqual([
      {
        shot_number: 2,
        characters: [
          {
            character_key: "dynamic-character-7",
            visible: true,
            appearance:
              "young woman in a dark navy dress; position: viewer-left",
            confidence: 0.92,
          },
        ],
      },
    ]);
    expect(parsed.profiles).toEqual([]);
  });

  it("builds reusable appearance observations from all analyzed frames using dynamic character keys", async () => {
    mocks.execute.mockImplementation(
      async (args: {
        onUsage?: (response: unknown, requestedModel: string) => void;
        schema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: unknown } };
      }) => {
        args.onUsage?.(
          {
            model: "test-vision-model",
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          },
          "test-vision-model"
        );
        const rawData = {
          frames: [
            {
              shot_number: 1,
              characters: [
                {
                  character_key: "dynamic-character-7",
                  visible: true,
                  appearance:
                    "young woman with long dark hair in a navy dress",
                  confidence: 0.94,
                },
              ],
            },
            {
              shot_number: 2,
              characters: [
                {
                  character_key: "dynamic-character-7",
                  visible: true,
                  appearance:
                    "young woman with long dark hair, still wearing navy",
                  confidence: 0.91,
                },
              ],
            },
          ],
          profiles: [
            {
              character_key: "dynamic-character-7",
              general_appearance:
                "young woman, long dark hair, recurring navy clothing",
            },
          ],
        };
        const parsed = args.schema?.safeParse(rawData);
        if (!parsed?.success) throw parsed?.error ?? new Error("schema required");
        return {
          usedVision: true,
          response: { model: "test-vision-model" },
          data: parsed.data,
        };
      }
    );

    const result = await analyzeVerticalDramaEpisodeAppearanceProfiles({
      userId: 11,
      tenantId: "tenant-a",
      seriesId: 5,
      episodeId: 9,
      fingerprint: "episode-fingerprint",
      frames: [1, 2].map(shotNumber => ({
        shotNumber,
        sourceMediaAssetId: `asset-${shotNumber}`,
        imageUrl: `https://media.example/${shotNumber}`,
        characters: [
          {
            characterKey: "dynamic-character-7",
            characterName: "Character from this episode",
          },
        ],
      })),
    });

    expect(result.complete).toBe(true);
    expect(result.creditsUsed).toBe(2);
    expect(result.analyzedShotNumbers).toEqual([1, 2]);
    expect(result.profiles).toEqual([
      {
        characterKey: "dynamic-character-7",
        characterName: "Character from this episode",
        generalAppearance:
          "young woman, long dark hair, recurring navy clothing",
        examples: [
          {
            shotNumber: 1,
            appearance: "young woman with long dark hair in a navy dress",
            confidence: 0.94,
          },
          {
            shotNumber: 2,
            appearance: "young woman with long dark hair, still wearing navy",
            confidence: 0.91,
          },
        ],
      },
    ]);
    expect(mocks.getSkillRunCreditCost).toHaveBeenCalledWith({
      skillSlug: "vertical-drama-speaker-visual-attribution",
      tenantId: "tenant-a",
    });
    expect(mocks.hasEnoughCredits).toHaveBeenCalledWith(11, 2);
    expect(mocks.deductCredits).toHaveBeenCalledOnce();
    expect(mocks.deductCredits).toHaveBeenCalledWith(expect.objectContaining({
      amount: 4,
      skillSlug: "vertical-drama-speaker-visual-attribution",
      sourceType: "skill",
    }));
  });

  it("settles every profile batch separately and totals the actual skill charges", async () => {
    mocks.execute.mockImplementation(async (args: any) => {
      args.onUsage?.(
        { model: "test-vision-model", usage: { prompt_tokens: 100, completion_tokens: 50 } },
        "test-vision-model"
      );
      const frames = (args.images as Array<{ label: string }>).map(image => {
        const shotNumber = Number(image.label.match(/SHOT (\d+)/)?.[1]);
        return {
          shot_number: shotNumber,
          characters: [
            {
              character_key: "character-a",
              visible: true,
              appearance: `person in shot ${shotNumber}`,
              confidence: 0.9,
            },
          ],
        };
      });
      const parsed = args.schema.safeParse({
        frames,
        profiles: [
          { character_key: "character-a", general_appearance: "same person" },
        ],
      });
      if (!parsed.success) throw parsed.error;
      return { usedVision: true, data: parsed.data };
    });

    const result = await analyzeVerticalDramaEpisodeAppearanceProfiles({
      userId: 11,
      tenantId: "tenant-a",
      seriesId: 5,
      episodeId: 9,
      fingerprint: "seven-shot-fingerprint",
      frames: Array.from({ length: 7 }, (_, index) => ({
        shotNumber: index + 1,
        sourceMediaAssetId: `asset-${index + 1}`,
        imageUrl: `https://media.example/${index + 1}`,
        characters: [
          { characterKey: "character-a", characterName: "Character A" },
        ],
      })),
    });

    expect(result.complete).toBe(true);
    expect(result.creditsUsed).toBe(4);
    expect(result.analyzedShotNumbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(mocks.getSkillRunCreditCost).toHaveBeenCalledOnce();
    expect(mocks.hasEnoughCredits).toHaveBeenCalledTimes(2);
    expect(mocks.hasEnoughCredits).toHaveBeenNthCalledWith(1, 11, 2);
    expect(mocks.hasEnoughCredits).toHaveBeenNthCalledWith(2, 11, 2);
    expect(mocks.deductCredits).toHaveBeenCalledTimes(2);
    expect(mocks.deductCredits).toHaveBeenNthCalledWith(1, expect.objectContaining({
      amount: 4,
      idempotencyKey: expect.stringContaining(":0:"),
      skillSlug: "vertical-drama-speaker-visual-attribution",
    }));
    expect(mocks.deductCredits).toHaveBeenNthCalledWith(2, expect.objectContaining({
      amount: 4,
      idempotencyKey: expect.stringContaining(":6:"),
      skillSlug: "vertical-drama-speaker-visual-attribution",
    }));
  });

  it("does not call the profile model when the configured skill price is unaffordable", async () => {
    mocks.hasEnoughCredits.mockResolvedValue(false);

    const result = await analyzeVerticalDramaEpisodeAppearanceProfiles({
      userId: 11,
      tenantId: "tenant-a",
      seriesId: 5,
      episodeId: 9,
      fingerprint: "unaffordable-fingerprint",
      frames: [
        {
          shotNumber: 1,
          sourceMediaAssetId: "asset-1",
          imageUrl: "https://media.example/1",
          characters: [
            { characterKey: "character-a", characterName: "Character A" },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      complete: false,
      issue: "insufficient_credits",
      creditsUsed: 0,
    });
    expect(mocks.hasEnoughCredits).toHaveBeenCalledWith(11, 2);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });
});
