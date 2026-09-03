import { describe, expect, it } from "vitest";

import {
  buildCrossEpisodeWardrobeHandoff,
  findCrossEpisodeWardrobeMismatches,
  hasExplicitWardrobeChangeCue,
  renderCrossEpisodeWardrobeHandoff,
  type CrossEpisodeWardrobeCatalogEntry,
} from "../crossEpisodeWardrobeContinuity";

const catalog: CrossEpisodeWardrobeCatalogEntry[] = [
  {
    characterKey: "pim",
    familyKey: "pim",
    variantType: null,
    description: "base",
  },
  {
    characterKey: "pim-dress",
    familyKey: "pim",
    variantType: "outfit",
    variantLabel: "ชุดเดรส",
    description: "ชุดเดรส",
  },
  {
    characterKey: "pim-casual",
    familyKey: "pim",
    variantType: "outfit",
    variantLabel: "ชุดลำลอง",
    description: "ชุดลำลอง",
  },
  {
    characterKey: "pim-adult",
    familyKey: "pim",
    variantType: "age_stage",
    variantLabel: "วัยผู้ใหญ่",
    description: "วัยผู้ใหญ่",
  },
];

describe("cross-episode wardrobe continuity", () => {
  it("builds a handoff from the latest shot with a resolvable outfit", () => {
    const handoff = buildCrossEpisodeWardrobeHandoff({
      previousEpisode: {
        id: 249,
        episodeNumber: 11,
        storyboard: {
          shots: [
            { shot_number: 8, required_character_refs: ["pim-casual"] },
            { shot_number: 9, required_character_refs: ["pim-dress"] },
          ],
        },
      },
      catalog,
    });

    expect(handoff).toMatchObject({
      sourceEpisodeId: 249,
      sourceEpisodeNumber: 11,
      sourceShotNumber: 9,
      characterLooks: [
        { familyKey: "pim", lookKey: "pim-dress", wardrobe: "ชุดเดรส" },
      ],
    });
    expect(renderCrossEpisodeWardrobeHandoff(handoff)).toContain("pim-dress");
  });

  it("prefers an outfit variant when a shot also references the base character", () => {
    const handoff = buildCrossEpisodeWardrobeHandoff({
      previousEpisode: {
        id: 249,
        episodeNumber: 11,
        storyboard: {
          shots: [
            {
              shot_number: 9,
              required_character_refs: ["pim", "pim-dress"],
            },
          ],
        },
      },
      catalog,
    });

    expect(handoff?.characterLooks[0]?.lookKey).toBe("pim-dress");
  });

  it("does not carry a special tie-in episode into the parent series", () => {
    expect(
      buildCrossEpisodeWardrobeHandoff({
        previousEpisode: {
          id: 10,
          episodeNumber: 2,
          episodeKind: "special_tie_in",
          storyboard: {
            shots: [{ shot_number: 9, required_character_refs: ["pim-dress"] }],
          },
        },
        catalog,
      })
    ).toBeUndefined();
  });

  it("blocks a changed outfit until an explicit change cue appears", () => {
    const handoff = buildCrossEpisodeWardrobeHandoff({
      previousEpisode: {
        id: 249,
        episodeNumber: 11,
        storyboard: {
          shots: [{ shot_number: 9, required_character_refs: ["pim-dress"] }],
        },
      },
      catalog,
    });

    expect(
      findCrossEpisodeWardrobeMismatches({
        handoff,
        catalog,
        shots: [
          {
            shotNumber: 1,
            text: "พิมพ์ชนกนั่งอยู่ในรถ",
            characterKeys: ["pim-casual"],
          },
          {
            shotNumber: 2,
            text: "พิมพ์ชนกลงจากรถ",
            characterKeys: ["pim-dress"],
          },
        ],
      })
    ).toMatchObject([
      {
        shotNumber: 1,
        expectedLookKey: "pim-dress",
        actualLookKey: "pim-casual",
      },
    ]);

    expect(
      findCrossEpisodeWardrobeMismatches({
        handoff,
        catalog,
        shots: [
          {
            shotNumber: 1,
            text: "หลังจากเปลี่ยนชุด พิมพ์ชนกนั่งอยู่ในรถ",
            characterKeys: ["pim", "pim-casual"],
          },
          {
            shotNumber: 2,
            text: "พิมพ์ชนกลงจากรถ",
            characterKeys: ["pim-casual"],
          },
        ],
      })
    ).toEqual([]);
  });

  it("recognizes deliberate transitions but not a garment description alone", () => {
    expect(hasExplicitWardrobeChangeCue("พิมพ์ชนกในชุดลำลอง")).toBe(false);
    expect(
      hasExplicitWardrobeChangeCue("เธอเปลี่ยนเป็นชุดลำลองก่อนขึ้นรถ")
    ).toBe(true);
    expect(
      hasExplicitWardrobeChangeCue("the next day she changes into a new outfit")
    ).toBe(true);
  });

  it("uses scene context to stop carrying wardrobe across a new event, while preserving travel continuity", () => {
    const handoff = buildCrossEpisodeWardrobeHandoff({
      previousEpisode: {
        id: 249,
        episodeNumber: 11,
        storyboard: {
          shots: [
            {
              shot_number: 9,
              required_character_refs: ["pim-dress"],
              location: { key: "airport", name: "สนามบิน" },
              time_of_day: "morning",
              narrative_purpose: "ออกจากสนามบินเพื่อเดินทางต่อ",
            },
          ],
        },
      },
      catalog,
    });

    expect(handoff?.sourceContext).toMatchObject({
      locationKey: "airport",
      locationLabel: "สนามบิน",
      timeMarker: "morning",
    });

    expect(
      findCrossEpisodeWardrobeMismatches({
        handoff,
        catalog,
        shots: [
          {
            shotNumber: 1,
            text: "วันถัดไป พิมพ์ชนกเริ่มประชุมงานที่สำนักงานใหม่",
            characterKeys: ["pim-casual"],
            context: {
              locationKey: "office",
              locationLabel: "สำนักงานใหม่",
              timeMarker: "next day",
            },
          },
        ],
      })
    ).toEqual([]);

    expect(
      findCrossEpisodeWardrobeMismatches({
        handoff,
        catalog,
        shots: [
          {
            shotNumber: 1,
            text: "เธอออกจากสนามบินและขึ้นรถเพื่อเดินทางต่อ",
            characterKeys: ["pim-casual"],
            context: {
              locationKey: "car",
              locationLabel: "รถยนต์",
              timeMarker: "morning",
            },
          },
        ],
      })
    ).toMatchObject([
      {
        shotNumber: 1,
        expectedLookKey: "pim-dress",
        actualLookKey: "pim-casual",
      },
    ]);
  });
});
