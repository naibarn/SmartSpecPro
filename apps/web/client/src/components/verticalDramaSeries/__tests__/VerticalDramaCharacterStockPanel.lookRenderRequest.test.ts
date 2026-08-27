import { describe, expect, it } from "vitest";
import {
  buildLookRenderRequestFields,
  fitCharacterLookInstruction,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";

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

  it("caps a generated long brief at the server's 500-character contract", () => {
    const longBrief =
      "Character identity: Pimpchanok, a young Thai woman with long dark hair. " +
      "Required look: elegant black evening gown with subtle jewelry. " +
      "Full-body cinematic portrait, realistic skin texture, natural anatomy, " +
      "soft practical night lighting, refined fabric detail, neutral expression, " +
      "clean background, no text, no watermark. " +
      "Additional continuity guidance that should not make the API reject the request.";
    const request = buildLookRenderRequestFields({
      ...base,
      instruction: longBrief.repeat(4),
      referenceChoice: "auto",
    });

    expect(request.customInstruction).toBeDefined();
    expect(request.customInstruction!.length).toBeLessThanOrEqual(500);
    expect(request.customInstruction).toContain("Character identity");
    expect(request.customInstruction).toContain("Required look");
  });

  it("returns a bounded prompt for the dialog prefill as well", () => {
    const result = fitCharacterLookInstruction("รายละเอียดภาพ. ".repeat(200));

    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(500);
    expect(result).toMatch(/…$/);
  });
});
