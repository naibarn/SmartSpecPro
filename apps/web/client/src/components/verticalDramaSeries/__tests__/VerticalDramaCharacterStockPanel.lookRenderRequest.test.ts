import { describe, expect, it } from "vitest";
import { buildLookRenderRequestFields } from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";

/**
 * `planning/vd-look-image-not-replace-primary/plan.md` §4C — the per-look
 * "สร้างภาพใหม่ของลุคนี้" dialog: type a fresh brief, and choose whether the
 * render is conditioned on the base character's primary portrait or on the
 * look's own current image.
 *
 * Two contracts this builder must never break:
 *  - `characterId` is ALWAYS the look's own id, so the poll->link flow writes
 *    the result onto the look row and never onto the base character (the whole
 *    point of the fix).
 *  - Optional fields are OMITTED, never sent empty: an absent
 *    `referenceAssetLinkId` is what selects the server's own tier resolution,
 *    and an empty `customInstruction` would be a meaningless brief.
 */
describe("buildLookRenderRequestFields", () => {
  const base = {
    lookCharacterId: "112",
    primaryAssetLinkId: "link-primary",
    lookAssetLinkId: "link-look",
  };

  it("always targets the LOOK's own characterId", () => {
    const request = buildLookRenderRequestFields({
      ...base,
      instruction: "full body",
      referenceChoice: "primary",
    });

    expect(request.characterId).toBe("112");
  });

  it("'primary' pins the base character's portrait link", () => {
    expect(
      buildLookRenderRequestFields({
        ...base,
        instruction: "",
        referenceChoice: "primary",
      }).referenceAssetLinkId
    ).toBe("link-primary");
  });

  it("'look' pins the look's own portrait link", () => {
    expect(
      buildLookRenderRequestFields({
        ...base,
        instruction: "",
        referenceChoice: "look",
      }).referenceAssetLinkId
    ).toBe("link-look");
  });

  it("'auto' omits referenceAssetLinkId entirely (server-side tier resolution, today's behavior)", () => {
    const request = buildLookRenderRequestFields({
      ...base,
      instruction: "",
      referenceChoice: "auto",
    });

    expect(request).not.toHaveProperty("referenceAssetLinkId");
  });

  it("degrades to auto when the chosen reference has no asset link yet (a look with no image)", () => {
    const request = buildLookRenderRequestFields({
      ...base,
      lookAssetLinkId: null,
      instruction: "",
      referenceChoice: "look",
    });

    expect(request).not.toHaveProperty("referenceAssetLinkId");
  });

  it("trims the brief and sends it as customInstruction", () => {
    expect(
      buildLookRenderRequestFields({
        ...base,
        instruction: "  ภาพเต็มตัว กลางคืน  ",
        referenceChoice: "auto",
      }).customInstruction
    ).toBe("ภาพเต็มตัว กลางคืน");
  });

  it("omits customInstruction for a blank/whitespace brief", () => {
    expect(
      buildLookRenderRequestFields({
        ...base,
        instruction: "   ",
        referenceChoice: "auto",
      })
    ).not.toHaveProperty("customInstruction");
  });
});
