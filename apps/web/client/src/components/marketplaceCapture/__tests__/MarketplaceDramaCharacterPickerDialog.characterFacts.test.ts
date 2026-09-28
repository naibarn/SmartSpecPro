import { describe, expect, it } from "vitest";

import {
  buildDramaCharacterDescriptor,
  inferDepictsMinorFromAgeRange,
} from "../MarketplaceDramaCharacterPickerDialog";
import {
  MARKETPLACE_CHARACTER_DESCRIPTOR_MAX,
  MarketplaceCharacterCastEntrySchema,
} from "@shared/hyperframes/characterCast";

/**
 * `planning/marketplace-four-character-cast/plan.md` — the two facts the picker
 * used to fetch and then throw away.
 *
 * The story planner only ever received a NAME, a role and an age range, so a
 * flight-operations coordinator and a barista produced the same generic review
 * script with a different name on it. `descriptor` is what makes the story
 * relate to the character; `depictsMinor` is what keeps the child scenario out
 * of a metadata-asserted minor-safety block.
 */
describe("buildDramaCharacterDescriptor", () => {
  it("joins the character facts the series already holds, PERSONALITY first", () => {
    expect(
      buildDramaCharacterDescriptor({
        occupation: "ผู้ประสานงานศูนย์ควบคุมการบิน",
        narrativeRole: "co_protagonist",
        role: "Flight Operations Control Coordinator",
        description: "ละเอียดรอบคอบ ตัดสินใจเร็วภายใต้ความกดดัน",
      })
    ).toBe(
      "ละเอียดรอบคอบ ตัดสินใจเร็วภายใต้ความกดดัน — ผู้ประสานงานศูนย์ควบคุมการบิน — co_protagonist — Flight Operations Control Coordinator"
    );
  });

  /* The picker's `description` is itself a join of
     `Description | Personality | Backstory | Identity lock | Wardrobe rules`,
     so on a fully-profiled character it is by far the longest part. Ordering
     it last meant the clamp deleted exactly the personality the planner needs
     and kept only job titles. */
  it("keeps the personality when the profile is long enough to hit the clamp", () => {
    const personality =
      "Description: ใจเย็นแต่เด็ดขาด | Personality: " + "ก".repeat(500);
    const result = buildDramaCharacterDescriptor({
      occupation: "ผู้ประสานงานศูนย์ควบคุมการบิน",
      narrativeRole: "co_protagonist",
      role: "Flight Operations Control Coordinator",
      description: personality,
    })!;
    expect(result.startsWith("Description: ใจเย็นแต่เด็ดขาด")).toBe(true);
    expect(result).toContain("Personality:");
    expect(result.length).toBeLessThanOrEqual(900);
  });

  it("drops blanks and de-duplicates repeated facts", () => {
    expect(
      buildDramaCharacterDescriptor({
        occupation: "บาริสต้า",
        narrativeRole: null,
        role: "บาริสต้า",
        description: "   ",
      })
    ).toBe("บาริสต้า");
  });

  it("returns undefined when the series knows nothing — never an empty string", () => {
    expect(
      buildDramaCharacterDescriptor({
        occupation: null,
        narrativeRole: null,
        role: null,
        description: "",
      })
    ).toBeUndefined();
  });

  it("clamps to the shared schema ceiling", () => {
    const long = buildDramaCharacterDescriptor({ description: "ก".repeat(2000) });
    expect(long!.length).toBeLessThanOrEqual(
      MARKETPLACE_CHARACTER_DESCRIPTOR_MAX
    );
    // Whatever the ceiling is, the value must still satisfy the wire schema.
    expect(
      MarketplaceCharacterCastEntrySchema.safeParse({
        characterName: "x",
        url: "https://cdn.test/x.png",
        descriptor: long,
      }).success
    ).toBe(true);
  });
});

describe("inferDepictsMinorFromAgeRange", () => {
  it("reads an explicit child word in Thai or English", () => {
    expect(inferDepictsMinorFromAgeRange("เด็ก 8 ขวบ")).toBe(true);
    expect(inferDepictsMinorFromAgeRange("child")).toBe(true);
    expect(inferDepictsMinorFromAgeRange("วัยรุ่น")).toBe(true);
  });

  it("reads a numeric age on either side of 18", () => {
    expect(inferDepictsMinorFromAgeRange("อายุ 12 ปี")).toBe(true);
    expect(inferDepictsMinorFromAgeRange("6-9")).toBe(true);
    expect(inferDepictsMinorFromAgeRange("28")).toBe(false);
  });

  it("reads adult phrasings", () => {
    expect(inferDepictsMinorFromAgeRange("late 20s")).toBe(false);
    expect(inferDepictsMinorFromAgeRange("วัยทำงาน")).toBe(false);
  });

  it("returns UNDEFINED when it cannot tell — silence must stay distinguishable from 'adult'", () => {
    expect(inferDepictsMinorFromAgeRange(null)).toBeUndefined();
    expect(inferDepictsMinorFromAgeRange("")).toBeUndefined();
    expect(inferDepictsMinorFromAgeRange("   ")).toBeUndefined();
    expect(inferDepictsMinorFromAgeRange("ไม่ระบุ")).toBeUndefined();
  });
});
