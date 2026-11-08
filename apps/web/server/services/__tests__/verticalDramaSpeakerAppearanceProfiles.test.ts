import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));

vi.mock("../creditService", () => ({
  calculateCreditsForLLM: mocks.calculateCreditsForLLM,
  deductCredits: mocks.deductCredits,
  hasEnoughCredits: mocks.hasEnoughCredits,
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
} from "../verticalDramaSpeakerAppearanceProfiles";

describe("vertical drama episode appearance profile fingerprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasEnoughCredits.mockResolvedValue(true);
    mocks.deductCredits.mockResolvedValue(undefined);
    mocks.calculateCreditsForLLM.mockReturnValue(1);
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

  it("builds reusable appearance observations from all analyzed frames using dynamic character keys", async () => {
    mocks.execute.mockImplementation(
      async (args: {
        onUsage?: (response: unknown, requestedModel: string) => void;
      }) => {
        args.onUsage?.(
          {
            model: "test-vision-model",
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          },
          "test-vision-model"
        );
        return {
          usedVision: true,
          response: { model: "test-vision-model" },
          data: {
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
          },
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
    expect(mocks.deductCredits).toHaveBeenCalledOnce();
  });
});
