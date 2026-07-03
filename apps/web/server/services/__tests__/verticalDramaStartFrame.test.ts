import { describe, it, expect } from "vitest";
import {
  planContactSheetBatch,
  planSingleFramePerShot,
  planJobGroup,
  deterministic3x3Crop,
  fitCandidateTo916,
  classifyImageModel9x16,
  resolveImageModelsFromList,
  buildStartFramePlanOutputs,
  rejectCandidateWithoutDeletion,
  buildSupersedingCandidateVersion,
  buildCandidateLineage,
  applySelection,
  VERTICAL_DRAMA_DEFAULT_START_FRAME_MODE,
  VERTICAL_DRAMA_TARGET_ASPECT_VALUE,
  type PlanStartFramesInput,
  type VerticalDramaShotgridShot,
  type VerticalDramaCandidateVersion,
} from "../verticalDramaStartFrame";
import { getStaticFallbackModels, type ModelDefinition } from "../modelRegistry";
import {
  VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL,
  type VerticalDramaContactSheetAsset,
  type VerticalDramaSelectedStartFrame,
} from "@shared/verticalDramaSeries";

function shots(n = 9): VerticalDramaShotgridShot[] {
  return Array.from({ length: n }, (_v, i) => ({
    shotNumber: i + 1,
    imagePrompt: `prompt ${i + 1}`,
    negativePrompt: "blurry",
    continuityNotes: [`note ${i + 1}`],
    requiredCharacterRefs: ["char-a"],
    productReferenceAssetIds: [],
  }));
}

function baseInput(overrides: Partial<PlanStartFramesInput> = {}): PlanStartFramesInput {
  return {
    runId: "run1",
    episodeId: "ep1",
    mode: "contact_sheet_3x3_batch",
    selectedImageModelId: VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL,
    sheetCount: 3,
    shots: shots(),
    ...overrides,
  };
}

describe("default mode", () => {
  it("defaults to contact_sheet_3x3_batch", () => {
    expect(VERTICAL_DRAMA_DEFAULT_START_FRAME_MODE).toBe("contact_sheet_3x3_batch");
  });
});

describe("planContactSheetBatch", () => {
  it("plans 3 sheets -> 27 candidates", () => {
    const plan = planContactSheetBatch(baseInput({ sheetCount: 3 }));
    expect(plan.sheetCount).toBe(3);
    expect(plan.totalCandidateFrames).toBe(27);
    expect(plan.promptSets).toHaveLength(3);
    expect(plan.promptSets[0].perCellPrompts).toHaveLength(9);
    expect(plan.aspectRatio).toBe("9:16");
    expect(plan.promptVisibility).toBe("all_prompts_visible");
  });

  it("plans 6 sheets -> 54 candidates", () => {
    const plan = planContactSheetBatch(baseInput({ sheetCount: 6 }));
    expect(plan.sheetCount).toBe(6);
    expect(plan.totalCandidateFrames).toBe(54);
  });

  it("maps cells 1-9 to rows/cols deterministically", () => {
    const plan = planContactSheetBatch(baseInput({ sheetCount: 1 }));
    const cells = plan.promptSets[0].perCellPrompts;
    expect(cells[0]).toMatchObject({ shotNumber: 1, row: 1, col: 1 });
    expect(cells[4]).toMatchObject({ shotNumber: 5, row: 2, col: 2 });
    expect(cells[8]).toMatchObject({ shotNumber: 9, row: 3, col: 3 });
  });
});

describe("planSingleFramePerShot", () => {
  it("plans exactly 9 single-frame requests (one per shot, no cropping)", () => {
    const plan = planSingleFramePerShot(baseInput({ mode: "single_frame_per_shot" }));
    expect(plan.mode).toBe("single_frame_per_shot");
    expect(plan.requests).toHaveLength(9);
    const uniqueShots = new Set(plan.requests.map((r) => r.shotNumber));
    expect(uniqueShots.size).toBe(9);
    expect(plan.requests.every((r) => r.aspectRatio === "9:16")).toBe(true);
  });
});

describe("resolveImageModelsFromList", () => {
  it("lists every enabled image model and preselects google-banana-2-lite", () => {
    const models = getStaticFallbackModels();
    const res = resolveImageModelsFromList(models);
    expect(res.defaultModelId).toBe("google-banana-2-lite");
    const ids = res.models.map((m) => m.id);
    const enabledImageIds = models.filter((m) => m.type === "image" && m.isEnabled !== false).map((m) => m.id);
    expect(new Set(ids)).toEqual(new Set(enabledImageIds));
    expect(res.models.find((m) => m.id === "google-banana-2-lite")?.isDefault).toBe(true);
  });

  it("keeps incompatible image models listed with a machine-readable reason code", () => {
    const incompatible: ModelDefinition = {
      id: "img-no-916",
      type: "image",
      name: "No 9:16 model",
      provider: "test",
      description: "",
      aliases: [],
      creditCost: 10,
      aspectRatios: [], // no ratios, no sizes -> incompatible
      isEnabled: true,
    };
    const res = resolveImageModelsFromList([incompatible], "img-no-916");
    const m = res.models.find((x) => x.id === "img-no-916")!;
    expect(m.compatibility).toBe("incompatible");
    expect(m.reasonCode).toBe("no_9_16_support");
    expect(m.selectable).toBe(true); // stays visible/selectable
    expect(m.approveDisabled).toBe(true); // approve-to-generate disabled
  });

  it("annotates crop/pad/resize path for a non-9:16 raster model", () => {
    const square: ModelDefinition = {
      id: "img-square",
      type: "image",
      name: "Square",
      provider: "test",
      description: "",
      aliases: [],
      creditCost: 10,
      aspectRatios: ["1:1"],
      isEnabled: true,
    };
    const res = resolveImageModelsFromList([square], "img-square");
    const m = res.models[0];
    expect(m.compatibility).toBe("crop_pad_resize");
    expect(m.path).toBe("contact_sheet_crop_pad_resize");
    expect(m.reasonCode).toBeUndefined();
  });
});

describe("classifyImageModel9x16 reason codes", () => {
  const mk = (over: Partial<ModelDefinition>): ModelDefinition => ({
    id: "m",
    type: "image",
    name: "m",
    provider: "p",
    description: "",
    aliases: [],
    creditCost: 1,
    ...over,
  });

  it("direct when 9:16 present", () => {
    expect(classifyImageModel9x16(mk({ aspectRatios: ["9:16"] })).compatibility).toBe("direct");
  });
  it("crop_pad_resize_unavailable reason code", () => {
    const c = classifyImageModel9x16(mk({ aspectRatios: ["1:1"], configJson: { supportsCropPadResize: false } }));
    expect(c.reasonCode).toBe("crop_pad_resize_unavailable");
  });
  it("unsupported_output_dimensions reason code", () => {
    const c = classifyImageModel9x16(mk({ aspectRatios: ["1:1"], configJson: { fixedOutputDimensions: true } }));
    expect(c.reasonCode).toBe("unsupported_output_dimensions");
  });
});

describe("deterministic3x3Crop", () => {
  it("splits into 9 stable equal cells", () => {
    const a = deterministic3x3Crop(900, 1600);
    const b = deterministic3x3Crop(900, 1600);
    expect(a).toEqual(b); // deterministic
    expect(a).toHaveLength(9);
    expect(a[0].cropBox).toEqual({ x: 0, y: 0, width: 300, height: 533 });
    expect(a[8].cropBox).toEqual({ x: 600, y: 1066, width: 300, height: 533 });
  });
});

describe("fitCandidateTo916", () => {
  it("marks a 9:16 frame valid without change", () => {
    const r = fitCandidateTo916(300, 533);
    expect(r.valid).toBe(true);
    // 300/533 ~= 0.5628 within epsilon
    expect(["valid", "crop"]).toContain(r.operation);
  });
  it("center-crops a too-wide frame to 9:16", () => {
    const r = fitCandidateTo916(1000, 1000);
    expect(r.operation).toBe("crop");
    expect(r.valid).toBe(true);
    expect(r.box.width).toBe(Math.round(1000 * VERTICAL_DRAMA_TARGET_ASPECT_VALUE));
  });
  it("center-crops a too-tall frame to 9:16", () => {
    const r = fitCandidateTo916(300, 2000);
    expect(r.operation).toBe("crop");
    expect(r.box.height).toBe(Math.round(300 / VERTICAL_DRAMA_TARGET_ASPECT_VALUE));
  });
});

describe("buildStartFramePlanOutputs", () => {
  it("emits per-frame QC checklist, repair template, and video-input manifest for 9 frames", () => {
    const plan = planSingleFramePerShot(baseInput({ mode: "single_frame_per_shot" }));
    const out = buildStartFramePlanOutputs(plan.requests);
    expect(out.qcChecklists).toHaveLength(9);
    expect(out.repairTemplates).toHaveLength(9);
    expect(out.videoInputManifest).toHaveLength(9);
    // Checklist covers identity, aspect ratio, refs, continuity.
    expect(out.qcChecklists[0].items.map((i) => i.key)).toEqual([
      "identity_match",
      "aspect_ratio_9_16",
      "required_refs_present",
      "continuity_satisfied",
    ]);
    // Repair template carries an image prompt + negative-prompt scaffold.
    expect(out.repairTemplates[0].imagePrompt).toContain("prompt 1");
    expect(out.repairTemplates[0].negativePrompt).toContain("identity drift");
    expect(out.repairTemplates[0].repairAction).toBe("regenerate_start_frame");
    // Manifest maps each frame to a downstream role, linked to shot + promptSet.
    expect(out.videoInputManifest[0]).toMatchObject({ shotNumber: 1, selectedMediaAssetId: null });
    expect(out.videoInputManifest[8].role).toBe("first_frame_only");
  });
});

describe("planJobGroup", () => {
  it("tracks parallelJobLimit, job ids, expected/completed counts, statuses", () => {
    const jg = planJobGroup({
      runId: "run1",
      episodeId: "ep1",
      selectedImageModelId: VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL,
      sheetCount: 3,
      parallelJobLimit: 2,
    });
    expect(jg.parallelJobLimit).toBe(2);
    expect(jg.contactSheetJobIds).toHaveLength(3);
    expect(jg.expectedCandidateFrameCount).toBe(27);
    expect(jg.completedCandidateFrameCount).toBe(0);
    expect(jg.status).toBe("planned"); // dry-run safe, no paid generation implied
  });
});

describe("repair-without-deletion + version lineage", () => {
  const sheet: VerticalDramaContactSheetAsset = {
    contactSheetId: "cs1",
    runId: "run1",
    episodeId: "ep1",
    promptSetId: "ps1",
    imageModelId: "google-banana-2-lite",
    fullSheetMediaAssetId: "ma-sheet-1",
    cropStatus: "cropped",
    croppedFrames: [
      { candidateFrameId: "cf1", sourceContactSheetId: "cs1", shotNumber: 1, cellIndex: 1, row: 1, col: 1, cropBox: { x: 0, y: 0, width: 300, height: 533 }, croppedMediaAssetId: "ma1", promptSetId: "ps1", imagePrompt: "p", negativePrompt: "n", qcStatus: "pending" },
      { candidateFrameId: "cf2", sourceContactSheetId: "cs1", shotNumber: 2, cellIndex: 2, row: 1, col: 2, cropBox: { x: 300, y: 0, width: 300, height: 533 }, croppedMediaAssetId: "ma2", promptSetId: "ps1", imagePrompt: "p", negativePrompt: "n", qcStatus: "pending" },
    ],
  };

  it("rejecting a candidate marks it needs_repair and preserves the sheet + siblings", () => {
    const { sheet: updated } = rejectCandidateWithoutDeletion(sheet, {
      candidateFrameId: "cf1",
      shotNumber: 1,
      reason: "identity drift",
      reasonCode: "identity_drift",
      rejectedByUserId: "42",
      rejectedAt: new Date().toISOString(),
    });
    expect(updated.fullSheetMediaAssetId).toBe("ma-sheet-1"); // preserved
    expect(updated.croppedFrames).toHaveLength(2); // sibling intact
    expect(updated.croppedFrames.find((f) => f.candidateFrameId === "cf1")!.qcStatus).toBe("needs_repair");
    expect(updated.croppedFrames.find((f) => f.candidateFrameId === "cf2")!.qcStatus).toBe("pending");
  });

  it("repair produces a superseding version recording lineage, marking prior superseded", () => {
    const prior: VerticalDramaCandidateVersion = {
      candidateFrameId: "cf1",
      shotNumber: 1,
      state: "active",
      mediaAssetId: "ma1",
      sourceArtifactIds: [],
      repairRequestIds: [],
      fullSheetMediaAssetId: "ma-sheet-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const { prior: superseded, next } = buildSupersedingCandidateVersion({
      prior,
      newCandidateFrameId: "cf1:v1",
      newMediaAssetId: "ma1b",
      repairRequestId: "rr1",
      repairArtifactId: "art1",
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(superseded.state).toBe("superseded");
    expect(next.state).toBe("active");
    expect(next.sourceArtifactIds).toContain("cf1"); // walks back to prior
    expect(next.repairRequestIds).toContain("rr1");
    expect(next.fullSheetMediaAssetId).toBe("ma-sheet-1"); // sheet never deleted
  });

  it("buildCandidateLineage orders original -> repaired for a shot", () => {
    const versions: VerticalDramaCandidateVersion[] = [
      { candidateFrameId: "cf1:v1", shotNumber: 1, state: "active", mediaAssetId: "mb", sourceArtifactIds: ["cf1", "art1"], repairRequestIds: ["rr1"], fullSheetMediaAssetId: "ma-sheet-1", createdAt: "2026-01-02T00:00:00.000Z" },
      { candidateFrameId: "cf1", shotNumber: 1, state: "superseded", mediaAssetId: "ma", sourceArtifactIds: [], repairRequestIds: [], fullSheetMediaAssetId: "ma-sheet-1", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    const lineage = buildCandidateLineage(1, versions);
    expect(lineage.map((v) => v.candidateFrameId)).toEqual(["cf1", "cf1:v1"]);
  });
});

describe("applySelection", () => {
  it("persists one selected candidate per shot and replaces on re-select", () => {
    const s1: VerticalDramaSelectedStartFrame = {
      shotNumber: 1,
      selectedCandidateFrameId: "cf1",
      selectedMediaAssetId: "ma1",
      sourceContactSheetId: "cs1",
      promptSetId: "ps1",
      selectedByUserId: "42",
      selectedAt: "2026-01-01T00:00:00.000Z",
    };
    const afterFirst = applySelection([], s1);
    expect(afterFirst).toHaveLength(1);
    const s1b = { ...s1, selectedCandidateFrameId: "cf1:v1", selectedMediaAssetId: "ma1b" };
    const afterReselect = applySelection(afterFirst, s1b);
    expect(afterReselect).toHaveLength(1); // still one per shot
    expect(afterReselect[0].selectedCandidateFrameId).toBe("cf1:v1");
  });
});
