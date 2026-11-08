import { describe, expect, it } from "vitest";
import {
  resolveUniqueVisibleSpeakerCharacter,
  selectHighConfidenceVerticalDramaSpeakerSuggestions,
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
