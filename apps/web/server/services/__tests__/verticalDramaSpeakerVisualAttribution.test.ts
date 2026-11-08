import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateCreditsForLLMDynamic: vi.fn(),
  deductCredits: vi.fn(),
  hasEnoughCredits: vi.fn(),
  getSkillRunCreditCost: vi.fn(),
  execute: vi.fn(),
  resolveModel: vi.fn(),
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
  resolveVerticalDramaSeriesModel: mocks.resolveModel,
}));

import {
  parseVerticalDramaSpeakerAttributionOutput,
  resolveUniqueVisibleSpeakerCharacter,
  selectHighConfidenceVerticalDramaSpeakerSuggestions,
  suggestVerticalDramaShotSpeakerMappings,
} from "../verticalDramaSpeakerVisualAttribution";
import type { VerticalDramaDetectedShotPerson } from "@shared/verticalDramaSeries/speakerVisualBinding";

const people: VerticalDramaDetectedShotPerson[] = [
  {
    id: "person-1",
    boundingBox: { x: 0.1, y: 0.1, width: 0.3, height: 0.7 },
    appearance: "หญิงสาวด้านซ้าย",
    confidence: 0.92,
  },
  {
    id: "person-2",
    boundingBox: { x: 0.55, y: 0.1, width: 0.3, height: 0.7 },
    appearance: "ชายสูงวัยด้านขวา",
    confidence: 0.9,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calculateCreditsForLLMDynamic.mockResolvedValue(9);
  mocks.deductCredits.mockResolvedValue({ creditsUsed: 2 });
  mocks.hasEnoughCredits.mockResolvedValue(true);
  mocks.getSkillRunCreditCost.mockResolvedValue(2);
  mocks.resolveModel.mockResolvedValue("test-vision-model");
});

describe("vertical drama speaker attribution billing", () => {
  const speakerWithProfile = {
    speakerLabel: "พิมพ์ชนก",
    characterKey: "character-1",
    characterName: "พิมพ์ชนก",
    generalAppearance: "young woman with long dark hair",
    appearanceExamples: [
      { shotNumber: 3, appearance: "young woman in navy", confidence: 0.9 },
    ],
  };

  it("checks the configured skill price and reports the settled credit charge", async () => {
    mocks.execute.mockImplementation(async (input: any) => {
      input.onUsage(
        { model: "provider/test-model", usage: { prompt_tokens: 7, completion_tokens: 2 } },
        "test-vision-model"
      );
      return {
        usedVision: false,
        data: {
          speakers: [
            {
              speaker_label: "พิมพ์ชนก",
              candidates: [
                {
                  person_id: "person-1",
                  identity_confidence: 0.99,
                  evidence: "Matching dark hair and navy clothing.",
                },
              ],
            },
          ],
        },
      };
    });

    const result = await suggestVerticalDramaShotSpeakerMappings({
      userId: 7,
      tenantId: "tenant-a",
      seriesId: 22,
      episodeId: 33,
      shotNumber: 4,
      sourceMediaAssetId: "media-asset-9",
      people,
      speakers: [speakerWithProfile],
    });

    expect(result.creditsUsed).toBe(2);
    expect(result.suggestions).toEqual([
      { speakerLabel: "พิมพ์ชนก", personId: "person-1", confidence: 0.99 },
    ]);
    expect(mocks.getSkillRunCreditCost).toHaveBeenCalledWith({
      skillSlug: "vertical-drama-speaker-visual-attribution",
      tenantId: "tenant-a",
    });
    expect(mocks.hasEnoughCredits).toHaveBeenCalledWith(7, 2);
    expect(mocks.calculateCreditsForLLMDynamic).toHaveBeenCalledWith(
      7,
      2,
      "provider/test-model"
    );
    expect(mocks.deductCredits).toHaveBeenCalledWith(expect.objectContaining({
      amount: 9,
      skillSlug: "vertical-drama-speaker-visual-attribution",
      sourceType: "skill",
    }));
  });

  it("does not call the attribution model when the configured skill cost is unaffordable", async () => {
    mocks.hasEnoughCredits.mockResolvedValue(false);

    const result = await suggestVerticalDramaShotSpeakerMappings({
      userId: 7,
      tenantId: "tenant-a",
      seriesId: 22,
      episodeId: 33,
      shotNumber: 4,
      sourceMediaAssetId: "media-asset-9",
      people,
      speakers: [speakerWithProfile],
    });

    expect(result).toMatchObject({
      suggestions: [],
      creditsUsed: 0,
      issue: "insufficient_credits",
    });
    expect(mocks.hasEnoughCredits).toHaveBeenCalledWith(7, 2);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });
});

describe("resolveUniqueVisibleSpeakerCharacter", () => {
  it("disambiguates duplicate roster names using the character key visible in this shot", () => {
    const sameNameCandidates = [
      { characterKey: "character", name: "พิมพ์ชนก" },
      { characterKey: "character-variant", name: "พิมพ์ชนก" },
      { characterKey: "character-look-workwear", name: "พิมพ์ชนก" },
    ];

    expect(
      resolveUniqueVisibleSpeakerCharacter(
        sameNameCandidates,
        new Set(["character-variant", "character-7-look-casual_home"])
      )
    ).toEqual(sameNameCandidates[1]);
  });

  it("keeps same-name ambiguity manual when multiple candidates are visible", () => {
    expect(
      resolveUniqueVisibleSpeakerCharacter(
        [
          { characterKey: "variant-a", name: "พิมพ์ชนก" },
          { characterKey: "variant-b", name: "พิมพ์ชนก" },
        ],
        new Set(["variant-a", "variant-b"])
      )
    ).toBeUndefined();
  });
});

describe("selectHighConfidenceVerticalDramaSpeakerSuggestions", () => {
  it("selects a strong, unambiguous person match using dynamic speaker labels", () => {
    const suggestions = selectHighConfidenceVerticalDramaSpeakerSuggestions({
      speakers: [{ speakerLabel: "พิมพ์ชนก" }],
      people,
      output: {
        speakers: [
          {
            speaker_label: "พิมพ์ชนก",
            candidates: [
              {
                person_id: "person-1",
                identity_confidence: 0.96,
                evidence: "Visible face matches the supplied portrait.",
              },
              {
                person_id: "person-2",
                identity_confidence: 0.3,
                evidence: "Does not match portrait.",
              },
              {
                person_id: "person-1",
                identity_confidence: 0.94,
                evidence: "Duplicate lower-ranked result for the same person.",
              },
            ],
          },
        ],
      },
    });

    expect(suggestions).toEqual([
      { speakerLabel: "พิมพ์ชนก", personId: "person-1", confidence: 0.96 },
    ]);
  });

  it("abstains on low confidence, a close alternative, or an unknown detected person", () => {
    const suggestions = selectHighConfidenceVerticalDramaSpeakerSuggestions({
      speakers: [
        { speakerLabel: "Low confidence" },
        { speakerLabel: "Ambiguous" },
        { speakerLabel: "Unknown person" },
      ],
      people,
      output: {
        speakers: [
          {
            speaker_label: "Low confidence",
            candidates: [
              {
              person_id: "person-1",
              identity_confidence: 0.89,
              evidence: "",
              },
            ],
          },
          {
            speaker_label: "Ambiguous",
            candidates: [
              {
              person_id: "person-1",
              identity_confidence: 0.95,
              evidence: "",
              },
              {
              person_id: "person-2",
              identity_confidence: 0.93,
              evidence: "",
              },
            ],
          },
          {
            speaker_label: "Unknown person",
            candidates: [
              {
              person_id: "not-detected",
              identity_confidence: 0.99,
              evidence: "",
              },
            ],
          },
        ],
      },
    });

    expect(suggestions).toEqual([]);
  });

  it("never assigns the same detected person to multiple speakers", () => {
    const suggestions = selectHighConfidenceVerticalDramaSpeakerSuggestions({
      speakers: [{ speakerLabel: "Speaker A" }, { speakerLabel: "Speaker B" }],
      people,
      output: {
        speakers: [
          {
            speaker_label: "Speaker A",
            candidates: [
              {
              person_id: "person-1",
              identity_confidence: 0.97,
              evidence: "",
              },
            ],
          },
          {
            speaker_label: "Speaker B",
            candidates: [
              {
              person_id: "person-1",
              identity_confidence: 0.93,
              evidence: "",
              },
            ],
          },
        ],
      },
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      speakerLabel: "Speaker A",
      personId: "person-1",
    });
  });
});

describe("parseVerticalDramaSpeakerAttributionOutput", () => {
  const expectedSpeakers = [
    { speakerLabel: "พิมพ์ชนก" },
    { speakerLabel: "ลุงชาญ" },
  ];

  const modelSpeakerEntries = [
    {
      speaker_label: "พิมพ์ชนก",
      candidates: [{ person_id: "person-1", confidence: 0.99 }],
    },
    {
      speaker_label: "ลุงชาญ",
      candidates: [{ person_id: "person-2", confidence: 0.99 }],
    },
  ];

  it.each([
    ["a top-level array", modelSpeakerEntries],
    ["speaker_matches", { speaker_matches: modelSpeakerEntries }],
    [
      "speaker_identity_matches",
      { speaker_identity_matches: modelSpeakerEntries },
    ],
    ["speaker_candidates", { speaker_candidates: modelSpeakerEntries }],
  ])("normalizes %s and returns both clear matches", (_shape, response) => {
    const output = parseVerticalDramaSpeakerAttributionOutput(response);
    const suggestions = selectHighConfidenceVerticalDramaSpeakerSuggestions({
      speakers: expectedSpeakers,
      people,
      output,
    });

    expect(suggestions).toEqual([
      { speakerLabel: "พิมพ์ชนก", personId: "person-1", confidence: 0.99 },
      { speakerLabel: "ลุงชาญ", personId: "person-2", confidence: 0.99 },
    ]);
  });

  it("normalizes a standalone speaker object and preserves strict confidence validation", () => {
    expect(
      parseVerticalDramaSpeakerAttributionOutput({
        speaker_label: "พิมพ์ชนก",
        candidates: [{ person_id: "person-1", confidence: 0.99 }],
      })
    ).toEqual({
      speakers: [
        {
          speaker_label: "พิมพ์ชนก",
          candidates: [
            {
              person_id: "person-1",
              identity_confidence: 0.99,
              evidence: "",
            },
          ],
        },
      ],
    });

    expect(() =>
      parseVerticalDramaSpeakerAttributionOutput({
        speaker_matches: [
          {
            speaker_label: "พิมพ์ชนก",
            candidates: [{ person_id: "person-1", confidence: "high" }],
          },
        ],
      })
    ).toThrow();
  });
});
