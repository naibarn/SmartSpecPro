import { describe, expect, it } from "vitest";
import {
  buildCreateCharacterVariantInput,
  buildCreateCharacterTwinInput,
  buildDetectCharacterVariantsSummaryMessage,
  buildPortraitCandidateRetryPreviewInput,
  buildPreviewCharacterPromptInput,
  projectCastingReferenceAssetLinkIds,
  VD_PORTRAIT_CANDIDATE_COUNTS,
  decideVariantAutoGenerateImage,
  isFirstPortraitCandidateEligible,
  resolveCharacterReferenceDisclosureDefault,
  resolveCharacterLookDescription,
  resolveDirectCharacterImageInstruction,
  resolveLookRenderInstruction,
  resolvePortraitCandidateVisibility,
  resolvePortraitCandidateResultsPlacement,
  resolveCharacterRoleTierMismatchMessage,
  resolveCharacterCreditCapacityMessage,
  resolveVdCharacterMutationErrorMessage,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import {
  AGE_STAGE_VARIANT_REQUIRED_MARKER,
  parseAgeStageVariantRequiredMessage,
} from "@shared/verticalDramaSeries/ageStageVariant";
import type { VerticalDramaCharacterAsset } from "@shared/verticalDramaSeries/characterAssets";

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

  it("includes the optional first-portrait candidate count", () => {
    expect(
      buildPreviewCharacterPromptInput({
        seriesId: "10",
        characterId: "5",
        customInstruction: "",
        portraitCandidateCount: 5,
      })
    ).toEqual({ seriesId: "10", characterId: "5", portraitCandidateCount: 5 });
  });

  it("preserves the selected image model for candidate previews and retries", () => {
    expect(
      buildPortraitCandidateRetryPreviewInput({
        seriesId: "10",
        characterId: "5",
        selectedImageModelId: "gpt-image-2",
        customInstruction: "  natural daylight  ",
      })
    ).toEqual({
      seriesId: "10",
      characterId: "5",
      selectedImageModelId: "gpt-image-2",
      customInstruction: "natural daylight",
      portraitCandidateCount: 1,
    });
  });
});

describe("isFirstPortraitCandidateEligible", () => {
  const character = { characterId: "5", data: {} };

  it("allows a standalone character with no primary portrait", () => {
    expect(isFirstPortraitCandidateEligible(character, [])).toBe(true);
  });

  it("allows a legacy character with saved DNA but no primary portrait", () => {
    expect(
      isFirstPortraitCandidateEligible(
        { characterId: "5", data: { visualBible: { version: 1 } } },
        []
      )
    ).toBe(true);
  });

  it("rejects characters with a primary portrait or face-link relationship", () => {
    expect(
      isFirstPortraitCandidateEligible(character, [
        { characterId: "5", role: "primary_portrait" } as any,
      ])
    ).toBe(false);
    expect(
      isFirstPortraitCandidateEligible(
        { characterId: "5", parentCharacterId: "2", data: {} },
        []
      )
    ).toBe(false);
  });
});

describe("resolveVdCharacterMutationErrorMessage", () => {
  it("explains an authoritative child/support role mismatch in Thai", () => {
    const message = resolveVdCharacterMutationErrorMessage(
      {
        message:
          'Character portrait candidate batch response failed schema validation: portrait_candidate_batch.candidates.0.character_design_dna.role_tier: Reported role tier "support" does not match authoritative input tier "child".',
      },
      "th"
    );

    expect(message).toContain("บทบาทตัวละครไม่ตรงกัน");
    expect(message).toContain("เด็ก (child)");
    expect(message).toContain("ตัวประกอบ (support)");
    expect(message).toContain("ตรวจสอบ Role/อายุของตัวละคร");
    expect(message).not.toContain("schema validation");
  });

  it("keeps unrelated schema failures unchanged", () => {
    const message = resolveCharacterRoleTierMismatchMessage(
      {
        message:
          "Character visual bible response failed schema validation: characters is required",
      },
      "en"
    );
    expect(message).toBeNull();
  });

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

describe("age-stage variant recovery marker", () => {
  it("parses the requested age from the recoverable server message", () => {
    expect(
      parseAgeStageVariantRequiredMessage(
        `${AGE_STAGE_VARIANT_REQUIRED_MARKER} age=6`
      )
    ).toEqual({ age: 6 });
  });

  it("does not classify unrelated errors as age-stage recovery", () => {
    expect(
      parseAgeStageVariantRequiredMessage("image provider failed")
    ).toBeNull();
  });
});

describe("character reference disclosure default", () => {
  it("opens automatically when the character has no primary portrait", () => {
    expect(
      resolveCharacterReferenceDisclosureDefault({ hasPrimaryPortrait: false })
    ).toBe(true);
  });

  it("collapses automatically when the character already has a primary portrait", () => {
    expect(
      resolveCharacterReferenceDisclosureDefault({ hasPrimaryPortrait: true })
    ).toBe(false);
  });
});

/**
 * `planning/vd-character-look-one-step-flow/plan.md` (2026-07-17) — the
 * one-step "เพิ่มลุค" flow's shared guard: whether `createVariantMutation`'s
 * `onSuccess` (and the modal's own hint row) should auto-fire portrait
 * generation for the just-created look.
 */
describe("decideVariantAutoGenerateImage", () => {
  it("fires when the parent has a portrait, a model is selected, and no reference image was uploaded", () => {
    expect(
      decideVariantAutoGenerateImage({
        hasReferenceMediaAssetId: false,
        parentNeedsSetupReasons: ["missing_dna"],
        selectedImageModelId: "model-1",
      })
    ).toEqual({ fire: true });
  });

  it("does not fire when the user uploaded their own reference image", () => {
    expect(
      decideVariantAutoGenerateImage({
        hasReferenceMediaAssetId: true,
        parentNeedsSetupReasons: [],
        selectedImageModelId: "model-1",
      })
    ).toEqual({ fire: false, reason: "has_reference_image" });
  });

  it("does not fire when the parent has no portrait yet", () => {
    expect(
      decideVariantAutoGenerateImage({
        hasReferenceMediaAssetId: false,
        parentNeedsSetupReasons: ["missing_portrait"],
        selectedImageModelId: "model-1",
      })
    ).toEqual({ fire: false, reason: "missing_parent_portrait" });
  });

  it("does not fire when no image model is selected", () => {
    expect(
      decideVariantAutoGenerateImage({
        hasReferenceMediaAssetId: false,
        parentNeedsSetupReasons: [],
        selectedImageModelId: "",
      })
    ).toEqual({ fire: false, reason: "missing_model" });
  });

  it("treats undefined parentNeedsSetupReasons as having a portrait (no false 'missing' guess)", () => {
    expect(
      decideVariantAutoGenerateImage({
        hasReferenceMediaAssetId: false,
        parentNeedsSetupReasons: undefined,
        selectedImageModelId: "model-1",
      })
    ).toEqual({ fire: true });
  });

  it("checks reference image before parent portrait (upload always wins, regardless of other gaps)", () => {
    expect(
      decideVariantAutoGenerateImage({
        hasReferenceMediaAssetId: true,
        parentNeedsSetupReasons: ["missing_portrait"],
        selectedImageModelId: "",
      })
    ).toEqual({ fire: false, reason: "has_reference_image" });
  });
});

/**
 * `planning/vd-character-full-body-framing/plan.md` C1 — the look-image
 * generate paths (auto-fire on "เพิ่มลุค" submit, and the per-look chip
 * button) used to send NO `customInstruction` at all, so a user asking for
 * "ภาพเต็มตัว" had their text sit in panel state while every request went out
 * without it and every look came back half-body.
 */
describe("resolveDirectCharacterImageInstruction", () => {
  it("reads the character's own brief from the panel map", () => {
    expect(
      resolveDirectCharacterImageInstruction({
        characterId: "7",
        instructionByCharacter: { "7": "ภาพเต็มตัว ชุดสูทสีดำ" },
      })
    ).toBe("ภาพเต็มตัว ชุดสูทสีดำ");
  });

  it("prefers the explicit override — the dialog's brief for a character whose state is not committed yet", () => {
    expect(
      resolveDirectCharacterImageInstruction({
        characterId: "7",
        instructionByCharacter: { "7": "stale value" },
        override: "  ภาพเต็มตัว  ",
      })
    ).toBe("ภาพเต็มตัว");
  });

  it("returns undefined (never an empty string) when nothing was typed", () => {
    expect(
      resolveDirectCharacterImageInstruction({
        characterId: "7",
        instructionByCharacter: {},
      })
    ).toBeUndefined();
    expect(
      resolveDirectCharacterImageInstruction({
        characterId: "7",
        instructionByCharacter: { "7": "   " },
      })
    ).toBeUndefined();
    expect(
      resolveDirectCharacterImageInstruction({
        characterId: "7",
        instructionByCharacter: { "7": "kept" },
        override: "   ",
      })
    ).toBeUndefined();
  });

  it("does not leak another character's brief", () => {
    expect(
      resolveDirectCharacterImageInstruction({
        characterId: "8",
        instructionByCharacter: { "7": "ภาพเต็มตัว" },
      })
    ).toBeUndefined();
  });
});

describe("resolveLookRenderInstruction", () => {
  it("uses a persisted system look brief when no custom instruction exists", () => {
    expect(
      resolveLookRenderInstruction({
        characterId: "look-1",
        instructionByCharacter: {},
        lookImageBrief: "Preserve the same face; use a complete evening gown.",
      })
    ).toBe("Preserve the same face; use a complete evening gown.");
  });

  it("keeps the user's typed instruction authoritative", () => {
    expect(
      resolveLookRenderInstruction({
        characterId: "look-1",
        instructionByCharacter: { "look-1": "ชุดสีเขียวเข้ม" },
        lookImageBrief: "Use the system-generated brief.",
      })
    ).toBe("ชุดสีเขียวเข้ม");
  });
});

/**
 * `planning/vd-character-primary-portrait-control/plan.md` — a first-portrait
 * batch's unpicked faces are stored durably and used to render forever, so long
 * after the user chose one they kept appearing beside the winner and made
 * "which face IS this character?" hard to answer at a glance.
 */
describe("resolvePortraitCandidateVisibility", () => {
  const batch = [
    { assetLinkId: "1", status: "superseded" },
    { assetLinkId: "2", status: "selected" },
    { assetLinkId: "3", status: "completed" },
  ];

  it("collapses a resolved batch to the picked face", () => {
    const result = resolvePortraitCandidateVisibility({
      candidates: batch,
      expanded: false,
    });
    expect(result.isResolved).toBe(true);
    expect(result.visible.map(c => c.assetLinkId)).toEqual(["2"]);
    expect(result.hiddenCount).toBe(2);
  });

  it("shows everything once the user expands it", () => {
    const result = resolvePortraitCandidateVisibility({
      candidates: batch,
      expanded: true,
    });
    expect(result.visible).toHaveLength(3);
    expect(result.hiddenCount).toBe(0);
    expect(result.isResolved).toBe(true);
  });

  it("shows everything while the batch is still undecided — that is what the alternates are for", () => {
    const undecided = [
      { assetLinkId: "1", status: "completed" },
      { assetLinkId: "2", status: "completed" },
    ];
    const result = resolvePortraitCandidateVisibility({
      candidates: undecided,
      expanded: false,
    });
    expect(result.isResolved).toBe(false);
    expect(result.visible).toHaveLength(2);
    expect(result.hiddenCount).toBe(0);
  });

  it("handles an empty batch without claiming it is resolved", () => {
    const result = resolvePortraitCandidateVisibility({
      candidates: [],
      expanded: false,
    });
    expect(result.isResolved).toBe(false);
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(0);
  });
});

describe("resolveCharacterLookDescription", () => {
  it("prefers an explicit description over the image brief", () => {
    expect(
      resolveCharacterLookDescription({
        variantLabel: "ชุดราตรีสีดำ",
        data: {
          description: "เดรสกำมะหยี่สีดำพร้อมเครื่องประดับเงิน",
          lookImageBrief: "ภาพเต็มตัวในงานเลี้ยงกลางคืน",
        },
      })
    ).toBe("เดรสกำมะหยี่สีดำพร้อมเครื่องประดับเงิน");
  });

  it("falls back to the image brief when the generated description only repeats the label", () => {
    expect(
      resolveCharacterLookDescription({
        variantLabel: "ชุดลำลอง",
        data: {
          description: " ชุดลำลอง ",
          lookImageBrief: "เสื้อเชิ้ตสีฟ้าอ่อนกับกางเกงยีนส์ รองเท้าผ้าใบ",
        },
      })
    ).toBe("เสื้อเชิ้ตสีฟ้าอ่อนกับกางเกงยีนส์ รองเท้าผ้าใบ");
  });

  it("returns no detail for missing, blank, or duplicate values", () => {
    expect(
      resolveCharacterLookDescription({
        variantLabel: "ชุดนอน",
        data: { description: "ชุดนอน", lookImageBrief: "  " },
      })
    ).toBeUndefined();
    expect(resolveCharacterLookDescription({ data: null })).toBeUndefined();
  });
});
