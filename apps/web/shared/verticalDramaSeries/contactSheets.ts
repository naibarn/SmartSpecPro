/**
 * Vertical Drama Series — Contact-sheet start-frame generation & selection (spec §7.5).
 *
 * The MVP default start-frame mode is `contact_sheet_3x3_batch`: generate 3x3
 * contact sheets, crop each into 9 candidate frames, and let the user pick the
 * best frame per shot. Pure field-only contracts.
 */

/** Default image model for vertical-drama contact sheets (resolved via model registry). */
export const VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL = "google-banana-2-lite" as const;

export type VerticalDramaContactSheetBatchPlan = {
  mode: "contact_sheet_3x3_batch";
  selectedImageModelId: string; // default: google-banana-2-lite
  gridLayout: "3x3";
  shotsPerSheet: 9;
  sheetCount: number; // e.g. 3 or 6
  totalCandidateFrames: number; // sheetCount * 9
  aspectRatio: "9:16";
  promptVisibility: "all_prompts_visible";
  promptSets: Array<{
    promptSetId: string;
    sheetIndex: number;
    contactSheetPrompt: string;
    negativePrompt: string;
    perCellPrompts: Array<{
      shotNumber: number;
      cellIndex: number; // 1-9
      row: 1 | 2 | 3;
      col: 1 | 2 | 3;
      imagePrompt: string;
      continuityNotes: string[];
      requiredCharacterRefs: string[];
      productReferenceAssetIds: string[];
    }>;
  }>;
};

export type VerticalDramaContactSheetGenerationJobGroup = {
  jobGroupId: string;
  runId: string;
  episodeId: string;
  selectedImageModelId: string;
  sheetCount: number;
  parallelJobLimit: number;
  requestedAt: string;
  status:
    | "planned"
    | "approved"
    | "generating"
    | "cropping"
    | "ready_for_selection"
    | "failed"
    | "cancelled";
  contactSheetJobIds: string[];
  expectedCandidateFrameCount: number;
  completedCandidateFrameCount: number;
  creditEstimate: number;
};

export type VerticalDramaContactSheetAsset = {
  contactSheetId: string;
  runId: string;
  episodeId: string;
  promptSetId: string;
  imageModelId: string;
  fullSheetMediaAssetId: string;
  cropStatus: "pending" | "cropped" | "failed";
  croppedFrames: Array<{
    candidateFrameId: string;
    sourceContactSheetId: string;
    shotNumber: number;
    cellIndex: number;
    row: 1 | 2 | 3;
    col: 1 | 2 | 3;
    cropBox: { x: number; y: number; width: number; height: number };
    croppedMediaAssetId: string;
    promptSetId: string;
    imagePrompt: string;
    negativePrompt: string;
    qcStatus: "pending" | "passed" | "failed" | "needs_repair";
  }>;
};

export type VerticalDramaSelectedStartFrame = {
  shotNumber: number;
  selectedCandidateFrameId: string;
  selectedMediaAssetId: string;
  sourceContactSheetId: string;
  promptSetId: string;
  selectedByUserId: string;
  selectedAt: string;
  selectionReason?: string;
};
