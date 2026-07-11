import { describe, expect, it } from "vitest";
import {
  buildCreateCharacterVariantInput,
  buildCreateCharacterTwinInput,
  buildDetectCharacterVariantsSummaryMessage,
  buildPreviewCharacterPromptInput,
  resolveVdCharacterMutationErrorMessage,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";

/**
 * Coverage for W2 manual CRUD
 * (planning/vertical-drama-twin-variant-completeness/plan.md, Phase F6): the
 * "เพิ่มลุค"/"เพิ่มแฝด" dialogs' mutation-payload builders, the
 * `detectCharacterVariantsNow` success summary copy, and the shared
 * mutation-error message resolver (covers the `deleteCharacter`
 * PRECONDITION_FAILED Thai message passing straight through). A full render
 * test of this ~4700-line panel is impractical (see
 * `VerticalDramaCharacterStockPanel.referencePicker.test.ts` for the
 * established precedent of testing exported pure functions instead).
 */
describe("buildCreateCharacterVariantInput", () => {
  it("builds the minimal payload — trims the label, omits empty optional fields", () => {
    const result = buildCreateCharacterVariantInput({
      seriesId: "10",
      parentCharacterId: "1",
      variantLabel: "  ชุดทำงาน  ",
      variantType: "outfit",
      customDescription: "   ",
      referenceMediaAssetId: null,
    });
    expect(result).toEqual({
      seriesId: "10",
      parentCharacterId: "1",
      variantLabel: "ชุดทำงาน",
      variantType: "outfit",
    });
  });

  it("includes a trimmed customDescription when non-empty", () => {
    const result = buildCreateCharacterVariantInput({
      seriesId: "10",
      parentCharacterId: "1",
      variantLabel: "ชุดนอน",
      variantType: "age_stage",
      customDescription: "  วัยกลางคน ผมสั้นแซมสีเทา  ",
      referenceMediaAssetId: null,
    });
    expect(result.customDescription).toBe("วัยกลางคน ผมสั้นแซมสีเทา");
    expect(result.variantType).toBe("age_stage");
  });

  it("includes referenceMediaAssetId only when set (never an empty string)", () => {
    const withRef = buildCreateCharacterVariantInput({
      seriesId: "10",
      parentCharacterId: "1",
      variantLabel: "ชุดนักเรียน",
      variantType: "outfit",
      customDescription: "",
      referenceMediaAssetId: "media-42",
    });
    expect(withRef.referenceMediaAssetId).toBe("media-42");

    const withoutRef = buildCreateCharacterVariantInput({
      seriesId: "10",
      parentCharacterId: "1",
      variantLabel: "ชุดนักเรียน",
      variantType: "outfit",
      customDescription: "",
      referenceMediaAssetId: null,
    });
    expect(withoutRef.referenceMediaAssetId).toBeUndefined();
  });
});

describe("buildCreateCharacterTwinInput", () => {
  it("builds the minimal payload — trims name, omits empty role/description/reference", () => {
    const result = buildCreateCharacterTwinInput({
      seriesId: "10",
      sharesFaceWithCharacterId: "5",
      name: "  อากาศ  ",
      role: "   ",
      customDescription: "",
      referenceMediaAssetId: null,
    });
    expect(result).toEqual({
      seriesId: "10",
      sharesFaceWithCharacterId: "5",
      name: "อากาศ",
    });
  });

  it("includes trimmed role/customDescription/referenceMediaAssetId when provided", () => {
    const result = buildCreateCharacterTwinInput({
      seriesId: "10",
      sharesFaceWithCharacterId: "5",
      name: "อากาศ",
      role: "  น้องสาวฝาแฝด  ",
      customDescription: "  ทรงผมสั้นกว่า สไตล์ลำลอง  ",
      referenceMediaAssetId: "media-99",
    });
    expect(result).toEqual({
      seriesId: "10",
      sharesFaceWithCharacterId: "5",
      name: "อากาศ",
      role: "น้องสาวฝาแฝด",
      customDescription: "ทรงผมสั้นกว่า สไตล์ลำลอง",
      referenceMediaAssetId: "media-99",
    });
  });
});

describe("buildDetectCharacterVariantsSummaryMessage", () => {
  it("returns the 'nothing found' message (Thai) when all three counts are 0", () => {
    expect(
      buildDetectCharacterVariantsSummaryMessage("th", {
        variantsCreated: 0,
        variantsUpdated: 0,
        twinsCreated: 0,
      })
    ).toBe("ไม่พบ variant/แฝดใหม่จากเนื้อเรื่องปัจจุบัน");
  });

  it("returns the 'nothing found' message (English) when all three counts are 0", () => {
    expect(
      buildDetectCharacterVariantsSummaryMessage("en", {
        variantsCreated: 0,
        variantsUpdated: 0,
        twinsCreated: 0,
      })
    ).toBe("No new variants/twins found in the current story");
  });

  it("returns the counted summary (Thai) when any count is non-zero", () => {
    expect(
      buildDetectCharacterVariantsSummaryMessage("th", {
        variantsCreated: 2,
        variantsUpdated: 1,
        twinsCreated: 1,
      })
    ).toBe("สร้าง variant 2 รายการ, แฝด 1 รายการ, อัปเดต 1 รายการ");
  });

  it("returns the counted summary (English) when any count is non-zero", () => {
    expect(
      buildDetectCharacterVariantsSummaryMessage("en", {
        variantsCreated: 2,
        variantsUpdated: 1,
        twinsCreated: 1,
      })
    ).toBe("Created 2 variant(s), 1 twin(s), updated 1");
  });

  it("still returns the counted summary when only variantsUpdated is non-zero (no new rows created)", () => {
    expect(
      buildDetectCharacterVariantsSummaryMessage("th", {
        variantsCreated: 0,
        variantsUpdated: 3,
        twinsCreated: 0,
      })
    ).toBe("สร้าง variant 0 รายการ, แฝด 0 รายการ, อัปเดต 3 รายการ");
  });
});

describe("buildPreviewCharacterPromptInput", () => {
  it("omits customInstruction entirely when blank", () => {
    const result = buildPreviewCharacterPromptInput({
      seriesId: "10",
      characterId: "5",
      customInstruction: "",
    });
    expect(result).toEqual({ seriesId: "10", characterId: "5" });
    expect(result.customInstruction).toBeUndefined();
  });

  it("omits customInstruction when whitespace-only", () => {
    const result = buildPreviewCharacterPromptInput({
      seriesId: "10",
      characterId: "5",
      customInstruction: "   ",
    });
    expect(result).toEqual({ seriesId: "10", characterId: "5" });
  });

  it("includes a trimmed customInstruction when non-blank", () => {
    const result = buildPreviewCharacterPromptInput({
      seriesId: "10",
      characterId: "5",
      customInstruction: "  หน้าตรง ภาพเต็มตัว  ",
    });
    expect(result).toEqual({
      seriesId: "10",
      characterId: "5",
      customInstruction: "หน้าตรง ภาพเต็มตัว",
    });
  });
});

describe("resolveVdCharacterMutationErrorMessage", () => {
  it("passes the server's deleteCharacter PRECONDITION_FAILED Thai message straight through", () => {
    const message = resolveVdCharacterMutationErrorMessage(
      {
        message:
          "ต้องลบ variant/แฝดที่อ้างอิงตัวละครนี้ให้หมดก่อนจึงจะลบตัวละครนี้ได้",
      },
      "th"
    );
    expect(message).toBe(
      "ต้องลบ variant/แฝดที่อ้างอิงตัวละครนี้ให้หมดก่อนจึงจะลบตัวละครนี้ได้"
    );
  });

  it("passes through a detectCharacterVariantsNow PRECONDITION_FAILED message unmodified", () => {
    const message = resolveVdCharacterMutationErrorMessage(
      {
        message:
          "Generate deep story drafts first before detecting character variants/twins",
      },
      "en"
    );
    expect(message).toBe(
      "Generate deep story drafts first before detecting character variants/twins"
    );
  });

  it("falls back to the generic bilingual message when the error has no message", () => {
    expect(resolveVdCharacterMutationErrorMessage(undefined, "th")).toBe(
      "เกิดข้อผิดพลาด"
    );
    expect(resolveVdCharacterMutationErrorMessage(null, "en")).toBe(
      "Something went wrong"
    );
    expect(resolveVdCharacterMutationErrorMessage({}, "en")).toBe(
      "Something went wrong"
    );
  });
});
