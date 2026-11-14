import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { trpc } from "@/lib/trpc";
import {
  loadStoredAutoStoryboardOverrides,
  persistStoredAutoReviewImageModel,
  persistStoredAutoReviewVideoModel,
  persistStoredStoryPlanningModel,
} from "@/lib/marketplaceCaptureAutoReviewPreferences";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { validateMarketplaceShotMediaFile } from "@/lib/marketplaceShotMediaUpload";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { MarketplaceDramaCharacterPickerDialog } from "./MarketplaceDramaCharacterPickerDialog";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { MarketplaceDraftQualityQcPanel } from "./MarketplaceDraftQualityQcPanel";
import {
  StagedStoryConceptPicker,
  type StagedStoryConceptOption,
} from "./StagedStoryConceptPicker";
import {
  StagedShotCharacterRow,
  buildStagedShotLookOptions,
} from "./StagedShotCharacterRow";
import {
  isMarketplaceCastLeadRole,
  MARKETPLACE_CHARACTER_CAST_MAX,
  MARKETPLACE_CHARACTER_CAST_MAX_LEADS,
  type MarketplaceCharacterCastRole,
} from "@shared/hyperframes/characterCast";

export type StagedCheckpoint = {
  checkpointId: string;
  kind: string;
  scope?: string;
  shotId: number | null;
  state: string;
  revision: number;
  contentHash: string;
  estimatedCredits: number | null;
  consumed?: boolean;
  approvedHash?: string | null;
  approvedByUserId?: number | null;
  approvedAt?: string | null;
  consumedAt?: string | null;
  rejectionReasonCode?: string | null;
  approvedModel?: string | null;
  approvedProvider?: string | null;
  approvedSafetyVerdict?: string | null;
  adherenceWarnings?: string[];
  consumedByOperationId?: string | null;
  approvedReferenceManifestHash?: string | null;
  // Story adherence QC (fail-open, informational only) — populated server-
  // side via `assessStagedPlanAdherence` and threaded through
  // `projectStagedCheckpoints`. Only ever present on the `kind ===
  // "story_plan"` checkpoint; absent/empty means no adherence concerns were
  // flagged. See ADHERENCE_WARNING_LABELS below for the code→Thai mapping.
};

export type ReferenceManifestItem = {
  index: number;
  url: string;
  role: string;
  label?: string;
  active: boolean;
  // Two-character-conversation additions (planning/marketplace-two-character-
  // conversation/plan.md §3.7/§3.8) — all additive/optional. Omitting every
  // field below keeps a run's behavior byte-identical to before this feature
  // existed; the backend derives `conversationMode` purely from how many
  // `role === "character"` entries exist (capped at 2), never from these
  // fields directly.
  /** Free-text display name for this character, used verbatim in dialogue.
   *  For an uploaded photo the user types this in; for a character sourced
   *  from a Vertical Drama series this always mirrors the series' own
   *  character name and is rendered read-only (VD is the source of truth). */
  characterName?: string;
  /** "host" = opens the scene / asks questions, "guest" = answers / reviews,
   *  "support" = in the frame to carry a story beat, never a third voice.
   *  Purely descriptive for the story planner's turn-taking — optional. */
  characterRole?: MarketplaceCharacterCastRole;
  /** Present only when this character was picked via the Vertical Drama
   *  character picker (marketplaceCapture.listDramaCharactersForPicker) —
   *  absent for a manually uploaded photo. This is the row actually RENDERED,
   *  i.e. the look's own row when a look was chosen. */
  vdCharacterId?: string;
  /** The look family's base character, so a per-shot look switcher can find
   *  the sibling looks (`planning/marketplace-four-character-cast/plan.md`). */
  vdBaseCharacterId?: string;
  /** The chosen look's own label, when this entry renders a variant. */
  variantLabel?: string;
  vdSeriesId?: string;
  /** Explicit minor grounding — `undefined` stays "not stated", which the
   *  server's guardian resolver treats conservatively. */
  depictsMinor?: boolean;
  /** Who this person IS (occupation / narrative role / description). Fed to
   *  the story planner as `StagedCastMember.descriptor` — without it the
   *  story is generic with a name attached. */
  descriptor?: string;
  /** Stable media asset id for the portrait actually used (base character or
   *  a specific "look"/variant) — resolved server-side to a real URL at
   *  generation time rather than trusting `url` (which may be a relative
   *  upload path) per the design doc's `portraitAssetId`-over-URL rule. */
  portraitAssetId?: string;
  ageRange?: string | null;
};

export type StagedReviewState = {
  metadataInitializationPending?: boolean;
  runStatus?: string;
  currentStage?: string;
  outputMode?: string;
  reviewTone?: string | null;
  storytellingStructure?: string | null;
  stateDigest: string;
  planRevision: number;
  planReview: { status: string; redraftCount?: number };
  creativeQc?: {
    required?: boolean;
    status?: string;
    report?: {
      overallScore?: number;
      pass?: boolean;
      status?: string;
      criticalFails?: Array<{ code?: string; explanation?: string }>;
      criteria?: Array<{
        criterionId?: string;
        rawScore?: number;
        weightedScore?: number;
        evidence?: string;
      }>;
      strengths?: string[];
      weaknesses?: string[];
      recommendations?: string[];
    } | null;
    history?: Array<{ round?: number; score?: number; kept?: boolean }>;
    progress?: { phase?: string; round?: number; maxRounds?: number } | null;
    maxImprovementRounds?: number;
    creditEstimate?: {
      estimatedCredits?: number;
      actualCredits?: number;
    } | null;
  } | null;
  workerOperations?: Array<{
    jobId: string;
    operation: string;
    status: string;
    shotId?: number | null;
    targetShotIds?: number[];
    targetStage?: "image" | "video" | null;
    targetPromptOnly?: boolean;
    stage?: string | null;
    progress?: number | null;
    createdAt?: string | null;
  }>;
  languagePlan?: {
    summaryLanguage: "th" | "en";
    dialogueLanguage: "th" | "en";
    promptLanguage: "th" | "en";
  };
  storyPlan?: {
    title?: string;
    storySummary?: string;
    source?: "llm_story_arc";
    conceptOptions?: StagedStoryConceptOption[];
    selectedConceptId?: string | null;
    expectedShotCount?: number | "auto";
    planRevision?: number;
  } | null;
  referenceManifest?: ReferenceManifestItem[];
  audioPlan?: {
    text?: string;
    language?: string;
    model?: string | null;
    provider?: string | null;
    estimatedCredits?: number;
  } | null;
  finalAssembly?: {
    contentHash?: string | null;
    shotCount?: number;
    hasAudio?: boolean;
    includeAudio?: boolean;
    shots?: Array<{ shotId: number }>;
  } | null;
  finalRender?: {
    settings: {
      subtitlePresetId: string;
      aiDisclosureEnabled?: boolean;
      overlayText: {
        content: string;
        position: OverlayAnchor;
        fontSizePx: number;
        color: string;
        fontWeight: "normal" | "bold";
        opacity: number;
      } | null;
      overlayImage: {
        url: string;
        position: OverlayAnchor;
        widthPercent: number;
        opacity: number;
        fit: "contain" | "cover";
      } | null;
    };
    engine?: string | null;
    jobId?: string | null;
    submittedAt?: number | null;
    outputUrl?: string | null;
    awaitingFinalization?: boolean;
    probe?: {
      durationSeconds?: number | null;
      width?: number | null;
      height?: number | null;
      sizeBytes?: number | null;
    } | null;
    clipCount?: number;
  } | null;
  shots: Array<{
    shotId: number;
    state?: string | null;
    title?: string | null;
    visualSummary?: string | null;
    storySummary: string;
    dialogue: string;
    imagePrompt?: string | null;
    videoPrompt?: string | null;
    imageArtifactUrl?: string | null;
    imageArtifactHash?: string | null;
    videoArtifactUrl?: string | null;
    videoArtifactHash?: string | null;
    imageTaskStatus?: string | null;
    videoTaskStatus?: string | null;
    /** Which cast members are in THIS shot — positional castIds
     *  (`cast-1`..`cast-4`) over the run's character manifest. Absent means
     *  "everyone", the legacy meaning
     *  (`planning/marketplace-four-character-cast/plan.md` §2). */
    castInShot?: string[] | null;
    /** Per-shot LOOK override, keyed by castId — swaps which image represents
     *  that person in this shot only. */
    castLooks?: Record<
      string,
      {
        url?: string;
        portraitAssetId?: string;
        vdCharacterId?: string;
        variantLabel?: string;
      }
    > | null;
    /** What each supporting character is doing here (§3). Display-only in the
     *  panel; authored by the story planner. */
    supportingBeats?: Array<{
      castId: string;
      action: string;
      line?: string;
    }> | null;
  }>;
  checkpoints: StagedCheckpoint[];
  correctionRequired?: {
    stageKey?: string;
    shotId?: number | null;
    reasonCode?: string;
    retryable?: boolean;
  } | null;
};

const TONE_LABELS: Record<string, string> = {
  irritated_problem: "หงุดหงิดกับปัญหา",
  funny_light: "ตลกขำเบา ๆ",
  warm_friendly: "จริงใจเป็นกันเอง",
  energetic_excited: "ตื่นเต้นพลังสูง",
  empathetic_soft: "อบอุ่นเห็นใจ",
  expert_confident: "ผู้เชี่ยวชาญมั่นใจ",
  straight_serious: "ตรงไปตรงมา จริงจัง",
};

// Example instructions offered as clickable chips in the "AI ปรับแต่งด้วย
// คำสั่งเพิ่มเติม" dialog — illustrative product-review shot adjustments,
// not an exhaustive list. Shared between the image and video prompt stages
// since both accept the same free-text `instruction` field server-side.
const AI_PROMPT_INSTRUCTION_EXAMPLES = [
  "เพิ่มเด็กอายุ 8 เดือนในฉาก",
  "เน้นมุมกล้องระยะใกล้ขึ้น",
  "แสดงความเสียหายของสินค้าให้ชัดเจนขึ้น",
  "เปลี่ยนสถานที่เป็นในครัว",
  "ให้ผู้แสดงยิ้มและดูมั่นใจมากขึ้น",
  "เพิ่มแสงธรรมชาติจากหน้าต่างในฉาก",
];
const AI_PROMPT_INSTRUCTION_MAX_CHARS = 2000;

// Story-plan adherence QC warning codes (see `adherenceWarnings` on
// `StagedCheckpoint` above) → short Thai explanations. Informational only —
// mirrors the fail-open intent of the backend's own QC pass.
const ADHERENCE_WARNING_LABELS: Record<string, string> = {
  staged_tone_not_adhered: "บทพูดอาจไม่สะท้อนโทนที่เลือกไว้ชัดเจนพอ",
  staged_structure_beat_missing: "บาง beat ของโครงสร้างเรื่องอาจไม่ครบถ้วน",
  staged_conversation_turns_missing: "บางช็อตอาจมีบทสนทนาสองคนไม่ครบ",
};

const STRUCTURE_LABELS: Record<string, string> = {
  hook_problem_insight_proof_cta: "Hook → Problem → Insight → Proof → CTA",
  hook_problem_emotion_insight_solution_result_cta:
    "Hook → Problem → Emotion → Insight → Solution → Result → CTA",
  product_review_situation_problem_try_result_fit:
    "Situation → Problem → Try → Result → Fit",
  before_after_bridge: "Before → After → Bridge",
  pas: "PAS (Problem → Agitate → Solution)",
  aida: "AIDA (Attention → Interest → Desire → Action)",
  relatable_story: "Relatable Story",
  problem_struggle_solution_transformation:
    "Problem → Struggle → Solution → Transformation",
};

export type StagedCheckpointEdit = {
  shotId?: number;
  storySummary?: string;
  dialogue?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  audioText?: string;
  audioLanguage?: string;
  finalShotOrder?: number[];
  includeAudio?: boolean;
};

export type StagedCheckpointRetry = {
  stage: "story" | "image" | "video" | "audio" | "final";
  shotId?: number;
  notes?: string;
  model?: string;
  selectedConcept?: StagedStoryConceptOption;
  // When true, the server both resets the checkpoint AND immediately
  // approves + resubmits generation in the same click — no separate
  // "confirm" step. Only set this for actions recovering/regenerating an
  // already-reviewed shot (stuck submission, regenerate an existing
  // result); omit it for flows that should let the user re-review the
  // prompt text before spending credits again (e.g. after a rejection).
  autoApprove?: boolean;
};

// A single shot+stage that still needs a first/replacement generation pass.
// Every non-story checkpoint kind now auto-approves at construction (see
// buildStagedCheckpoint's autoApprove param server-side), so "needs
// generating" is judged from the shot's own artifacts rather than from a
// checkpoint sitting in "awaiting" — that state is essentially never
// observed for these kinds anymore.
export type StagedBulkGenerateTarget = {
  shotId: number;
  stage: "image" | "video";
  model?: string;
  promptModel?: string;
  refreshPrompt?: boolean;
  promptOnly?: boolean;
  /** Recreate this shot's media from its saved prompt when an artifact exists. */
  replaceExisting?: boolean;
};

function checkpointLabel(checkpoint: StagedCheckpoint): string {
  if (checkpoint.kind === "story_plan") return "เนื้อเรื่อง";
  if (checkpoint.kind === "image_prompt")
    return `Prompt ภาพช็อตที่ ${checkpoint.shotId}`;
  if (checkpoint.kind === "image_result")
    return `ผลภาพช็อตที่ ${checkpoint.shotId}`;
  if (checkpoint.kind === "video_prompt")
    return `Prompt วิดีโอช็อตที่ ${checkpoint.shotId}`;
  if (checkpoint.kind === "video_result")
    return `ผลวิดีโอช็อตที่ ${checkpoint.shotId}`;
  if (checkpoint.kind === "audio_plan") return "เสียง / TTS";
  return "การประกอบขั้นสุดท้าย";
}

function expected(checkpoint: StagedCheckpoint, modelOverride?: string) {
  const model = modelOverride ?? checkpoint.approvedModel;
  const provider = checkpoint.approvedProvider;
  const safetyVerdict = checkpoint.approvedSafetyVerdict;
  const referenceManifestHash = checkpoint.approvedReferenceManifestHash;
  const estimatedCredits = checkpoint.estimatedCredits;
  if (
    !model ||
    !provider ||
    !safetyVerdict ||
    !referenceManifestHash ||
    estimatedCredits === null
  ) {
    throw new Error(
      `STAGED_CHECKPOINT_APPROVAL_DATA_INCOMPLETE:${checkpoint.checkpointId}`
    );
  }
  return {
    revision: checkpoint.revision,
    contentHash: checkpoint.contentHash,
    model,
    provider,
    safetyVerdict,
    referenceManifestHash,
    estimatedCredits,
  };
}

function isEditable(checkpoint: StagedCheckpoint | undefined) {
  return Boolean(
    checkpoint &&
    ["awaiting", "rejected", "approved"].includes(checkpoint.state)
  );
}

function isConsumed(checkpoint: StagedCheckpoint | undefined) {
  return Boolean(
    checkpoint?.consumed ||
    checkpoint?.consumedAt ||
    checkpoint?.consumedByOperationId
  );
}

function isRetryable(checkpoint: StagedCheckpoint | undefined) {
  return Boolean(checkpoint?.state === "rejected" || isConsumed(checkpoint));
}

function isRetryAvailable(checkpoint: StagedCheckpoint | undefined) {
  return Boolean(checkpoint?.state === "awaiting" || isRetryable(checkpoint));
}

export type OverlayAnchor =
  | "top_left"
  | "top_center"
  | "top_right"
  | "middle_left"
  | "middle_center"
  | "middle_right"
  | "bottom_left"
  | "bottom_center"
  | "bottom_right";

/** Ordered as a reading grid (row-major) so the dropdown mirrors the screen. */
const OVERLAY_ANCHOR_OPTIONS: Array<{ id: OverlayAnchor; label: string }> = [
  { id: "top_left", label: "บน–ซ้าย" },
  { id: "top_center", label: "บน–กลาง" },
  { id: "top_right", label: "บน–ขวา" },
  { id: "middle_left", label: "กลางจอ–ซ้าย" },
  { id: "middle_center", label: "กลางจอ–กลาง" },
  { id: "middle_right", label: "กลางจอ–ขวา" },
  { id: "bottom_left", label: "ล่าง–ซ้าย" },
  { id: "bottom_center", label: "ล่าง–กลาง" },
  { id: "bottom_right", label: "ล่าง–ขวา" },
];

/** Client-side cap for the render-overlay image upload. Kept in sync with
 *  the dedicated `express.json({ limit: "16mb" })` registered for
 *  `/trpc/marketplaceCapture.uploadStagedAutoReviewOverlayImage` in
 *  `server/_core/index.ts` (base64 inflates the raw bytes by ~4/3, so the
 *  route limit must stay comfortably above this cap). */
const OVERLAY_IMAGE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Fallback MIME for drags that report an empty `File.type` (some OS drags,
 *  notably `.svg` on Windows, omit it) — the server re-validates extension +
 *  magic bytes regardless, so guessing here only affects the upload label. */
function guessOverlayImageMimeFromName(name: string | undefined): string {
  const ext = (name || "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

/**
 * Pulls an image URL out of a non-file drag (an image dragged in from
 * another browser tab, or from one of the app's own galleries) so a drop
 * that carries no `File` can still fill the overlay-image URL field instead
 * of being silently ignored.
 */
function readDroppedOverlayImageUrl(
  dt: DataTransfer | null | undefined
): string | null {
  if (!dt) return null;
  const raw = (
    dt.getData?.("text/uri-list") ||
    dt.getData?.("text/plain") ||
    ""
  )
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith("#"));
  if (!raw) return null;
  if (/^data:image\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

const SUBTITLE_PRESET_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "classic_box", label: "กล่องคลาสสิก (อ่านง่ายที่สุด)" },
  { id: "minimal_shadow", label: "เรียบ มีเงา" },
  { id: "creator_pop", label: "ครีเอเตอร์ ป็อป" },
  { id: "karaoke_word", label: "คาราโอเกะ ไล่คำ" },
  { id: "highlight_bar", label: "แถบไฮไลต์" },
  { id: "lower_third", label: "แถบล่างจอ" },
  { id: "cinematic_wide", label: "ภาพยนตร์ จอกว้าง" },
  { id: "neon_glow", label: "นีออนเรืองแสง" },
  { id: "review_bubble", label: "บับเบิลรีวิว" },
  { id: "no_subtitle_style", label: "ไม่ใส่ซับไตเติล" },
];

function isTaskInFlight(status: string | null | undefined) {
  return ["pending", "processing", "submitted"].includes(String(status ?? ""));
}

function isTaskFailed(status: string | null | undefined) {
  return ["failed", "cancelled"].includes(String(status ?? ""));
}

function correctionSafeMessage(
  reasonCode: string | null | undefined,
  stageKey?: string | null
) {
  switch (reasonCode) {
    case "Desktop token identity mismatch":
      return "งานสร้างภาพก่อนหน้าไม่ผ่านการยืนยันตัวตนของ worker จึงยังไม่มีภาพ ระบบได้รับการแก้แล้ว กดสร้างภาพของช็อตที่ต้องการอีกครั้งได้";
    case "checkpoint_consumed":
      return "งานเบื้องหลังหยุดหลังรับขั้นตอนนี้ไปประมวลผล แต่ยังไม่มีผลลัพธ์กลับมา ลองส่งขั้นตอนนี้อีกครั้งได้";
    default:
      return `งานสร้าง${stageKey === "video_generation" ? "วิดีโอ" : stageKey === "audio_generation" ? "เสียง" : "ภาพ"}หยุดก่อนส่งผลลัพธ์กลับมา ลองส่งงานนี้อีกครั้งได้`;
  }
}

function isRunEditable(state: StagedReviewState) {
  return !["completed", "failed", "cancelled"].includes(
    String(state.runStatus ?? "")
  );
}

function checkpointStateLabel(state: string | undefined) {
  switch (state) {
    case "approved":
      return "ยืนยันแล้ว";
    case "rejected":
      return "รอแก้ไข";
    case "awaiting":
      return "รอตรวจ";
    case "consumed":
      return "ใช้แล้ว";
    case "superseded":
      return "แทนที่แล้ว";
    default:
      return "รอระบบ";
  }
}

function shotStateLabel(state: string | null | undefined) {
  switch (state) {
    case "image_prompt_awaiting":
      return "รอตรวจ Prompt ภาพ";
    case "image_generating":
      return "กำลังสร้างภาพ";
    case "image_result_awaiting":
      return "รอตรวจภาพ";
    case "video_prompt_awaiting":
      return "รอตรวจ Prompt วิดีโอ";
    case "video_generating":
      return "กำลังสร้างวิดีโอ";
    case "video_result_awaiting":
      return "รอตรวจวิดีโอ";
    case "story_awaiting":
      return "รอตรวจเนื้อเรื่อง";
    case "completed":
      return "พร้อมใช้งาน";
    default:
      return state ? state.replaceAll("_", " ") : "รอระบบเตรียมช็อต";
  }
}

function mediaTaskStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "pending":
    case "processing":
    case "submitted":
      return "กำลังประมวลผล";
    case "completed":
      return "สร้างเสร็จแล้ว";
    case "failed":
    case "cancelled":
      return "สร้างไม่สำเร็จ · กด retry ได้";
    default:
      return null;
  }
}

function checkpointStateClass(state: string) {
  switch (state) {
    case "approved":
    case "consumed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "rejected":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "awaiting":
      return "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

type WorkflowStep = {
  id: string;
  label: string;
  description: string;
  status: "done" | "current" | "needs_review" | "locked" | "skipped";
  completed: number;
  total: number;
};

function buildWorkflowSteps(state: StagedReviewState): WorkflowStep[] {
  const checkpoints = state.checkpoints.filter(
    checkpoint => checkpoint.state !== "superseded"
  );
  const shotsTotal = Math.max(state.shots.length, 1);
  const makeStep = (input: {
    id: string;
    label: string;
    description: string;
    kind: string;
    total?: number;
    skipped?: boolean;
  }): WorkflowStep => {
    if (input.skipped) {
      return { ...input, status: "skipped", completed: 0, total: 0 };
    }
    const total = input.total ?? 1;
    const relevant = checkpoints.filter(
      checkpoint => checkpoint.kind === input.kind
    );
    const approved = relevant.filter(
      checkpoint =>
        checkpoint.state === "approved" || checkpoint.state === "consumed"
    ).length;
    const hasRejected = relevant.some(
      checkpoint => checkpoint.state === "rejected"
    );
    const hasAwaiting = relevant.some(
      checkpoint => checkpoint.state === "awaiting"
    );
    const status = hasRejected
      ? "needs_review"
      : approved >= total
        ? "done"
        : hasAwaiting
          ? "current"
          : "locked";
    return { ...input, status, completed: Math.min(approved, total), total };
  };
  return [
    makeStep({
      id: "story",
      label: "เนื้อเรื่อง",
      description: "ตรวจ Story Arc และบทพูด",
      kind: "story_plan",
    }),
    makeStep({
      id: "image-prompt",
      label: "Prompt ภาพ",
      description: "ยืนยัน Prompt ก่อนสร้างภาพ",
      kind: "image_prompt",
      total: shotsTotal,
    }),
    makeStep({
      id: "image-result",
      label: "Storyboard Review / ผลภาพ",
      description: "ตรวจและรับรองภาพแต่ละช็อตก่อนสร้างวิดีโอ",
      kind: "image_result",
      total: shotsTotal,
    }),
    makeStep({
      id: "video-prompt",
      label: "Prompt วิดีโอ",
      description: "ยืนยัน Prompt ก่อนสร้างวิดีโอ",
      kind: "video_prompt",
      total: shotsTotal,
    }),
    makeStep({
      id: "video-result",
      label: "ผลวิดีโอ",
      description: "รับรองวิดีโอแต่ละช็อตก่อนทำงานเสียง",
      kind: "video_result",
      total: shotsTotal,
      skipped: state.outputMode === "storyboard_images",
    }),
    makeStep({
      id: "audio",
      label: "เสียง",
      description: "ตรวจข้อความและแผน TTS",
      kind: "audio_plan",
      skipped: !state.audioPlan,
    }),
    makeStep({
      id: "final",
      label: "ประกอบ",
      description: "ตรวจลำดับและยืนยัน output",
      kind: "final_assembly",
    }),
  ];
}

export function StagedCheckpointReviewPanel(props: {
  runId: string;
  state: StagedReviewState | null | undefined;
  loading?: boolean;
  error?: string | null;
  notice?: string | null;
  pending?: boolean;
  pendingAction?: string | null;
  onRefresh: () => void;
  onStartCreativeQc?: (maxImprovementRounds: number) => void;
  creativeQcStarting?: boolean;
  creativeQcError?: string | null;
  onRepairCreativeQc?: () => void;
  onSelectCreativeQcRepair?: () => void;
  creativeQcRepairing?: boolean;
  creativeQcRepairError?: string | null;
  onApprove: (input: {
    checkpoint: StagedCheckpoint;
    expected: ReturnType<typeof expected>;
  }) => void;
  onReject: (checkpoint: StagedCheckpoint) => void;
  onEdit: (input: StagedCheckpointEdit) => void;
  onGeneratePrompt: (input: {
    shotId: number;
    stage: "image" | "video";
    model?: string;
    // Optional free-text instruction from the "AI ปรับแต่งด้วยคำสั่งเพิ่มเติม"
    // dialog — threaded straight through to the backend mutation's own
    // `instruction` field (server/routers/marketplaceCapture.ts). Omitted
    // (not just empty-string) for the plain regenerate button so existing
    // no-instruction call sites are byte-identical to before this field
    // existed.
    instruction?: string;
  }) => void;
  // Optional one-shot convenience action. Bulk generation uses the same
  // worker-backed target contract, while each shot still exposes the three
  // independent prompt, edit, and media actions below.
  onGenerateAndDispatch: (input: {
    shotId: number;
    stage: "image" | "video";
    model?: string;
    replaceExisting?: boolean;
  }) => void;
  onRetry: (input: StagedCheckpointRetry) => void;
  // Fires once with the full target list (not once per shot). The server
  // admits one durable Worker Job, which processes the batch and validates
  // the latest target state before dispatching paid media work.
  onBulkGenerate?: (targets: StagedBulkGenerateTarget[]) => void;
  onLanguagePlanChange?: (plan: {
    summaryLanguage: "th" | "en";
    dialogueLanguage: "th" | "en";
    promptLanguage: "th" | "en";
  }) => void;
  onUpdateReferenceManifest?: (manifest: ReferenceManifestItem[]) => void;
  /** Persist ONE shot's cast presence and/or look overrides
   *  (`planning/marketplace-four-character-cast/plan.md` §6). Absent = the
   *  per-shot row renders read-only, which is also what keeps every existing
   *  mount of this panel working unchanged. */
  onUpdateShotCast?: (input: {
    shotId: number;
    castInShot?: string[];
    castLooks?: Record<
      string,
      { url: string; vdCharacterId?: string; variantLabel?: string }
    >;
  }) => void;
  onSaveRenderSettings?: (settings: {
    subtitlePresetId?: string;
    aiDisclosureEnabled?: boolean;
    overlayText?: NonNullable<
      NonNullable<StagedReviewState["finalRender"]>["settings"]
    >["overlayText"];
    overlayImage?: NonNullable<
      NonNullable<StagedReviewState["finalRender"]>["settings"]
    >["overlayImage"];
  }) => void;
  onSubmitFinalRender?: () => void;
  /** Uploads an overlay image and resolves to its storage URL. */
  onUploadOverlayImage?: (file: {
    fileName: string;
    fileType: string;
    fileBase64: string;
  }) => Promise<string>;
  // Manual drag-and-drop / tap-to-browse replacement of a shot's image or
  // video slot with a local file — works whether the slot is empty or
  // already holds an AI-generated result (a successful upload simply
  // replaces imageArtifactUrl/videoArtifactUrl server-side, indistinguishable
  // from a generated result afterward). The Panel does its own client-side
  // type/size validation (see validateMarketplaceShotMediaFile) BEFORE
  // calling this — an invalid file never reaches this handler. See
  // StagedCheckpointReviewSurface for the FileReader→base64→mutation
  // implementation.
  onUploadShotMedia: (input: {
    shotId: number;
    stage: "image" | "video";
    file: File;
  }) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [failedMediaUrls, setFailedMediaUrls] = useState<
    Record<string, boolean>
  >({});
  const [redraftNotes, setRedraftNotes] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () =>
      loadStoredAutoStoryboardOverrides().storyPlanningModel ?? "__automatic__"
  );
  const changeSelectedModel = (model: string) => {
    setSelectedModel(model);
    persistStoredStoryPlanningModel(model);
  };
  const [finalOrderDraft, setFinalOrderDraft] = useState("");
  const [includeAudioDraft, setIncludeAudioDraft] = useState<boolean | null>(
    null
  );
  // Render-settings drafts. `null` means "not touched in this session" so the
  // server value keeps showing through until the user actually edits a field
  // (same convention as `includeAudioDraft` above).
  const [subtitlePresetDraft, setSubtitlePresetDraft] = useState<string | null>(
    null
  );
  const [overlayTextDraft, setOverlayTextDraft] = useState<string | null>(null);
  const [overlayTextPositionDraft, setOverlayTextPositionDraft] =
    useState<OverlayAnchor | null>(null);
  const [overlayTextWeightDraft, setOverlayTextWeightDraft] = useState<
    "normal" | "bold" | null
  >(null);
  const [overlayTextOpacityDraft, setOverlayTextOpacityDraft] = useState<
    number | null
  >(null);
  const [overlayTextSizeDraft, setOverlayTextSizeDraft] = useState<
    number | null
  >(null);
  const [overlayTextColorDraft, setOverlayTextColorDraft] = useState<
    string | null
  >(null);
  const [overlayImageUrlDraft, setOverlayImageUrlDraft] = useState<
    string | null
  >(null);
  const [overlayImagePositionDraft, setOverlayImagePositionDraft] =
    useState<OverlayAnchor | null>(null);
  const [overlayImageOpacityDraft, setOverlayImageOpacityDraft] = useState<
    number | null
  >(null);
  const [overlayImageFitDraft, setOverlayImageFitDraft] = useState<
    "contain" | "cover" | null
  >(null);
  const [aiDisclosureDraft, setAiDisclosureDraft] = useState<boolean | null>(
    null
  );
  const [overlayUploadBusy, setOverlayUploadBusy] = useState(false);
  const [overlayUploadError, setOverlayUploadError] = useState<string | null>(
    null
  );
  const [overlayDragActive, setOverlayDragActive] = useState(false);
  const [overlayImageWidthDraft, setOverlayImageWidthDraft] = useState<
    number | null
  >(null);
  const [aiInstructionDialog, setAiInstructionDialog] = useState<{
    shotId: number;
    stage: "image" | "video";
  } | null>(null);
  const [aiInstructionText, setAiInstructionText] = useState("");
  const [generationConfirmation, setGenerationConfirmation] = useState<{
    id: string;
    title: string;
    description: string;
    callback: () => void;
    onCancel?: () => void;
  } | null>(null);
  const [locallyLockedGenerationActions, setLocallyLockedGenerationActions] =
    useState<Set<string>>(() => new Set());
  const confirmedGenerationActionIdsRef = useRef(new Set<string>());
  const generationActionLockTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );
  const releaseGenerationActionLock = useCallback((id: string) => {
    confirmedGenerationActionIdsRef.current.delete(id);
    const timer = generationActionLockTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    generationActionLockTimersRef.current.delete(id);
    setLocallyLockedGenerationActions(current => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    for (const id of confirmedGenerationActionIdsRef.current) {
      const mutationStarted =
        props.pendingAction === id ||
        (props.pendingAction === "generate-prompt" &&
          id.startsWith("generate-prompt-")) ||
        (props.pendingAction === "bulk-generate" && id.startsWith("bulk-"));
      if (mutationStarted) releaseGenerationActionLock(id);
    }
  }, [props.pendingAction, releaseGenerationActionLock]);
  useEffect(
    () => () => {
      for (const timer of generationActionLockTimersRef.current.values()) {
        clearTimeout(timer);
      }
      generationActionLockTimersRef.current.clear();
      confirmedGenerationActionIdsRef.current.clear();
    },
    []
  );
  const [isDraggingChar, setIsDraggingChar] = useState(false);
  const [isDraggingProd, setIsDraggingProd] = useState(false);

  // Per-shot, per-stage manual media upload (drag-and-drop onto the
  // image/video slot, or the always-visible "📤 อัปโหลดไฟล์แทน" tap-to-browse
  // fallback for tablets). Keyed by `${stage}:${shotId}` so shot 3's image
  // upload never blocks or visually affects shot 5's video slot, and the
  // SAME shot's image/video slots stay fully independent of each other.
  // `uploadingShotMediaRef` mirrors `uploadingShotMedia` synchronously (the
  // same double-tracking pattern as VerticalDramaStoryboardPanel's
  // `droppingStartFrameShotsRef`) so a second drop on a slot already
  // mid-upload is ignored even within the same tick, before the state
  // update triggering the re-render has flushed.
  const [uploadingShotMedia, setUploadingShotMedia] = useState<Set<string>>(
    new Set()
  );
  const uploadingShotMediaRef = useRef<Set<string>>(new Set());
  const [dragOverShotMediaKey, setDragOverShotMediaKey] = useState<
    string | null
  >(null);
  const [shotMediaUploadErrors, setShotMediaUploadErrors] = useState<
    Record<string, string>
  >({});
  const imageFileInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const videoFileInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  function shotMediaKey(shotId: number, stage: "image" | "video") {
    return `${stage}:${shotId}`;
  }

  async function handleShotMediaFile(
    shotId: number,
    stage: "image" | "video",
    file: File
  ) {
    const key = shotMediaKey(shotId, stage);
    const validationMessage = validateMarketplaceShotMediaFile(file, stage);
    if (validationMessage) {
      setShotMediaUploadErrors(prev => ({ ...prev, [key]: validationMessage }));
      return;
    }
    if (uploadingShotMediaRef.current.has(key)) return;
    uploadingShotMediaRef.current.add(key);
    setUploadingShotMedia(new Set(uploadingShotMediaRef.current));
    setShotMediaUploadErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      await props.onUploadShotMedia({ shotId, stage, file });
    } catch (error) {
      setShotMediaUploadErrors(prev => ({
        ...prev,
        [key]:
          error instanceof Error
            ? error.message
            : "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      }));
    } finally {
      uploadingShotMediaRef.current.delete(key);
      setUploadingShotMedia(new Set(uploadingShotMediaRef.current));
    }
  }

  // Owned locally (not derived fresh from props every render) so that a
  // quick run of checkbox clicks always builds on the latest in-progress
  // selection instead of racing the server round-trip: without this, a
  // second toggle fired before the first mutation's refetch lands would
  // recompute its update from the pre-first-toggle manifest and silently
  // undo it once both settle. Seeded once from the server on first load
  // (or when switching to a different run); local state is authoritative
  // after that, with each edit still persisted via onUpdateReferenceManifest.
  const [manifestOverride, setManifestOverride] = useState<
    ReferenceManifestItem[] | null
  >(null);
  const seededRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    // `state` is still undefined on the very first render (the query hasn't
    // resolved yet) — wait for it, otherwise this locks in an empty seed for
    // `props.runId` and, since the guard below only re-seeds on a runId
    // change, never picks up the real manifest once the query actually loads.
    if (!props.state) return;
    if (seededRunIdRef.current === props.runId) return;
    seededRunIdRef.current = props.runId;
    setManifestOverride(
      Array.isArray(props.state.referenceManifest)
        ? props.state.referenceManifest
        : []
    );
  }, [props.runId, props.state]);

  const rawManifest: ReferenceManifestItem[] = manifestOverride ?? [];

  const characterManifest = useMemo(
    () => rawManifest.filter(item => item.role === "character"),
    [rawManifest]
  );
  const productManifest = useMemo(
    () => rawManifest.filter(item => item.role !== "character"),
    [rawManifest]
  );
  // Two-character-conversation cap (planning/marketplace-two-character-
  // conversation/plan.md §3.8): the backend derives `conversationMode` from
  // `cast.length >= 2` off exactly these `role === "character"` manifest
  // entries (capped at the first 2) — so the UI's own cap/badge must read
  // the SAME `characterManifest.length`, uploaded or Vertical-Drama-picked,
  // never a separately-tracked "active" flag (character cards have no
  // active/inactive toggle, unlike product images).
  // Roster widened to `MARKETPLACE_CHARACTER_CAST_MAX`
  // (`planning/marketplace-four-character-cast/plan.md` P1).
  const characterManifestCapReached =
    characterManifest.length >= MARKETPLACE_CHARACTER_CAST_MAX;
  // The conversation badge tracks the SPEAKING LEADS, mirroring the server's
  // `resolveStagedConversationMode` — a host plus two supporting characters is
  // still a solo narration with three people in frame, not a conversation.
  const leadCharacterCount = characterManifest.filter(item =>
    isMarketplaceCastLeadRole(item.characterRole)
  ).length;
  // Characters with no explicit role yet are still implicitly leads (the
  // server's role assigner fills host/guest positionally), so an untouched
  // 2-character run keeps reading as a conversation exactly as before.
  const unassignedCharacterCount = characterManifest.filter(
    item => !item.characterRole
  ).length;
  const conversationModeActive =
    Math.min(
      MARKETPLACE_CHARACTER_CAST_MAX_LEADS,
      leadCharacterCount + unassignedCharacterCount
    ) >= 2;
  // Two characters explicitly sharing one LEAD role is very likely an accident
  // (informational nudge only, never blocking). `support` is not a lead, so
  // any number of supporting characters is fine.
  const duplicateLeadRole = (["host", "guest"] as const).some(
    role =>
      characterManifest.filter(item => item.characterRole === role).length > 1
  );
  const supportCharacterCount = characterManifest.filter(
    item => item.characterRole === "support"
  ).length;

  /* Per-shot cast row (`planning/marketplace-four-character-cast/plan.md` §6).
     `castId`s are POSITIONAL over the character manifest — the same rule
     `deriveStagedCastFromManifest` uses server-side, which is the contract
     that lets a shot's cast list address roster members at all. */
  const shotCastRoster = useMemo(
    () =>
      characterManifest.map((item, index) => ({
        castId: `cast-${index + 1}`,
        name: item.characterName || item.label || `ตัวละครที่ ${index + 1}`,
        url: item.url,
        characterRole: item.characterRole,
        vdCharacterId: item.vdCharacterId,
        vdBaseCharacterId: item.vdBaseCharacterId,
        variantLabel: item.variantLabel,
      })),
    [characterManifest]
  );
  /** Every VD character row for the series(es) this run's cast came from,
   *  keyed by row id — the look families the per-shot switcher offers.
   *  Uploaded characters simply have no entry, so their shirt button hides. */
  const castSeriesId = characterManifest.find(
    item => item.vdSeriesId
  )?.vdSeriesId;
  const dramaLookQuery =
    trpc.marketplaceCapture.listDramaCharactersForPicker.useQuery(
      { seriesId: castSeriesId ?? "" },
      { enabled: Boolean(castSeriesId), staleTime: 60_000 }
    );
  const dramaLookSourcesByCharacterId = useMemo(() => {
    const map: Record<
      string,
      {
        characterId: string;
        parentCharacterId?: string | null;
        name?: string;
        variantLabel?: string | null;
        portraitUrl?: string | null;
      }
    > = {};
    const characters =
      (dramaLookQuery.data as { characters?: Array<any> } | undefined)
        ?.characters ?? [];
    for (const character of characters) {
      map[String(character.characterId)] = {
        characterId: String(character.characterId),
        parentCharacterId: null,
        name: character.name,
        portraitUrl: character.portraitUrl,
      };
      for (const look of character.looks ?? []) {
        map[String(look.characterId)] = {
          characterId: String(look.characterId),
          parentCharacterId: String(character.characterId),
          name: character.name,
          variantLabel: look.variantLabel,
          portraitUrl: look.portraitUrl,
        };
      }
    }
    return map;
  }, [dramaLookQuery.data]);

  const [savingShotCastForShot, setSavingShotCastForShot] = useState<
    number | null
  >(null);
  const handleChangeShotCastInShot = (shotId: number, castIds: string[]) => {
    if (!props.onUpdateShotCast) return;
    setSavingShotCastForShot(shotId);
    try {
      props.onUpdateShotCast({ shotId, castInShot: castIds });
    } finally {
      setSavingShotCastForShot(null);
    }
  };
  const handleChangeShotCastLook = (
    shotId: number,
    castId: string,
    look: { url: string; vdCharacterId: string; variantLabel?: string } | null
  ) => {
    if (!props.onUpdateShotCast) return;
    // `props.state` is nullable (the panel also renders a loading/error
    // shell), so this must not assume it exists — the row is only visible
    // when shots are present, but a stale click during a refetch would
    // otherwise throw.
    const shot = props.state?.shots?.find(item => item.shotId === shotId);
    const nextLooks: Record<
      string,
      { url: string; vdCharacterId?: string; variantLabel?: string }
    > = { ...((shot?.castLooks as any) ?? {}) };
    if (look) {
      nextLooks[castId] = look;
    } else {
      // Picking the base look CLEARS the override rather than storing the base
      // url, so the shot follows the roster again if the roster image changes.
      delete nextLooks[castId];
    }
    setSavingShotCastForShot(shotId);
    try {
      props.onUpdateShotCast({ shotId, castLooks: nextLooks });
    } finally {
      setSavingShotCastForShot(null);
    }
  };

  // One-shot toast the moment the active character count crosses into "2"
  // (conversation mode) — fires on the actual 0/1 → 2 transition only, never
  // on initial load of an already-2-character run and never repeatedly on
  // re-renders. `manifestOverride === null` means the server seed hasn't
  // landed yet; both refs are primed (without toasting) the first time it
  // does, and again whenever `props.runId` changes so switching to a
  // different already-saved run never fires a false "just added" toast.
  const previousCharacterCountRef = useRef<number | null>(null);
  const previousRunIdForToastRef = useRef<string | null>(null);
  useEffect(() => {
    if (manifestOverride === null) return;
    const current = characterManifest.length;
    const runChanged = previousRunIdForToastRef.current !== props.runId;
    if (
      !runChanged &&
      previousCharacterCountRef.current !== null &&
      previousCharacterCountRef.current < 2 &&
      current >= 2
    ) {
      toast.success(
        "เพิ่ม 2 ตัวละครแล้ว — ระบบจะสร้างบทสนทนา 2 คนโดยอัตโนมัติ"
      );
    }
    previousCharacterCountRef.current = current;
    previousRunIdForToastRef.current = props.runId;
  }, [characterManifest.length, manifestOverride, props.runId]);

  const applyManifestUpdate = (
    updater: (current: ReferenceManifestItem[]) => ReferenceManifestItem[]
  ) => {
    setManifestOverride(current => {
      const next = updater(current ?? []);
      if (next === current) return current;
      props.onUpdateReferenceManifest?.(next);
      return next;
    });
  };

  const handleFileInputs = (
    files: FileList | null,
    type: "character" | "product"
  ) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    let readCount = 0;
    const newItems: ReferenceManifestItem[] = [];

    fileList.forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          newItems.push({
            index: newItems.length + 1,
            url: dataUrl,
            role: type === "character" ? "character" : "product_angle",
            label:
              type === "character"
                ? file.name.replace(/\.[^/.]+$/, "")
                : `ภาพสินค้า (${file.name.slice(0, 15)})`,
            active: true,
          });
        }
        readCount++;
        if (readCount === fileList.length && newItems.length > 0) {
          applyManifestUpdate(current => {
            // Defense-in-depth cap enforcement (mirrors the disabled
            // dropzone in the JSX below): even if a drop/select slips
            // through while the UI hasn't yet re-rendered as disabled,
            // never let uploads push past the roster cap.
            let itemsToAdd = newItems;
            if (type === "character") {
              const existingCharacterCount = current.filter(
                item => item.role === "character"
              ).length;
              const remaining = Math.max(
                0,
                MARKETPLACE_CHARACTER_CAST_MAX - existingCharacterCount
              );
              if (newItems.length > remaining) {
                toast.error(
                  `เลือกตัวละครได้สูงสุด ${MARKETPLACE_CHARACTER_CAST_MAX} คน`
                );
                return current;
              }
              itemsToAdd = newItems;
            }
            return [...current, ...itemsToAdd].map((item, idx) => ({
              ...item,
              index: idx + 1,
            }));
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const updateCharacterManifestItem = (
    url: string,
    patch: Partial<
      Pick<
        ReferenceManifestItem,
        "characterName" | "characterRole" | "depictsMinor"
      >
    >
  ) => {
    applyManifestUpdate(current =>
      current.map(item => (item.url === url ? { ...item, ...patch } : item))
    );
  };

  /**
   * Swap a roster character's LOOK for the whole run
   * (`planning/marketplace-four-character-cast/plan.md`).
   *
   * Rewrites the entry's `url` + look identity in place. `portraitAssetId` is
   * cleared because it pointed at the PREVIOUS look's asset — leaving it would
   * let the server resolve the old outfit back (portraitAssetId wins over
   * `url` at generation time). Position in the manifest is preserved, so every
   * positional `castId` keeps addressing the same person.
   */
  const updateCharacterManifestLook = (
    url: string,
    look: { url: string; vdCharacterId: string; variantLabel?: string }
  ) => {
    applyManifestUpdate(current =>
      current.map(item =>
        item.url === url
          ? {
              ...item,
              url: look.url,
              vdCharacterId: look.vdCharacterId,
              variantLabel: look.variantLabel,
              portraitAssetId: undefined,
            }
          : item
      )
    );
  };

  // Vertical Drama character picker (planning/marketplace-two-character-
  // conversation/plan.md §3.7) — entry point hidden entirely when the
  // `verticalDramaSeries` tenant flag is off (this is an opt-in extra;
  // uploading photos must keep working regardless of the flag or of any
  // error querying it — `useTenantFeatureFlag` already fails closed to
  // `FEATURE_FLAG_DEFAULTS` on a query error, matching that hook's own
  // documented behavior).
  const verticalDramaSeriesEnabled = useTenantFeatureFlag(
    "verticalDramaSeries"
  );
  const [dramaPickerOpen, setDramaPickerOpen] = useState(false);
  // Resolves a picked character's `vdSeriesId` back to a human series title
  // for the "จาก {series}" badge — kept alive whenever the flag is on (not
  // just while the picker dialog is open) so the badge still renders
  // correctly after a page reload re-seeds the manifest from the server.
  const dramaSeriesListQuery = trpc.verticalDramaSeries.list.useQuery(
    undefined,
    { enabled: verticalDramaSeriesEnabled, staleTime: 60_000 }
  );
  const dramaSeriesTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const series of dramaSeriesListQuery.data?.series ?? []) {
      map.set(series.id, series.title);
    }
    return map;
  }, [dramaSeriesListQuery.data]);

  const addDramaCharacters = (items: ReferenceManifestItem[]) => {
    if (items.length === 0) return;
    applyManifestUpdate(current => {
      const existingCharacterCount = current.filter(
        item => item.role === "character"
      ).length;
      const remaining = Math.max(
        0,
        MARKETPLACE_CHARACTER_CAST_MAX - existingCharacterCount
      );
      if (items.length > remaining) {
        toast.error(
          `เลือกตัวละครได้สูงสุด ${MARKETPLACE_CHARACTER_CAST_MAX} คน`
        );
        return current;
      }
      const itemsToAdd = items;
      return [...current, ...itemsToAdd].map((item, idx) => ({
        ...item,
        index: idx + 1,
      }));
    });
  };

  const toggleReferenceItemActive = (url: string) => {
    applyManifestUpdate(current =>
      current.map(item =>
        item.url === url ? { ...item, active: !(item.active !== false) } : item
      )
    );
  };

  const removeReferenceItem = (url: string) => {
    applyManifestUpdate(current =>
      current
        .filter(item => item.url !== url)
        .map((item, idx) => ({ ...item, index: idx + 1 }))
    );
  };

  const planningModelsQuery =
    trpc.marketplaceCapture.listQualityPlanningModels.useQuery(undefined, {
      staleTime: 1000 * 60 * 5,
    });
  const planningModels = planningModelsQuery.data ?? [];

  const imageModelsQuery = trpc.media.getModels.useQuery(
    { type: "image" },
    { staleTime: 1000 * 60 * 5 }
  );
  const videoModelsQuery = trpc.media.getModels.useQuery(
    { type: "video" },
    { staleTime: 1000 * 60 * 5 }
  );

  const imageModels = imageModelsQuery.data?.models ?? [];
  const videoModels = videoModelsQuery.data?.models ?? [];

  const [selectedImageModel, setSelectedImageModel] = useState<string>(
    () => loadStoredAutoStoryboardOverrides().imageModel ?? ""
  );
  const [selectedVideoModel, setSelectedVideoModel] = useState<string>(
    () => loadStoredAutoStoryboardOverrides().videoModel ?? ""
  );
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxType, setLightboxType] = useState<"image" | "video">("image");

  useEffect(() => {
    if (!imageModelsQuery.data) return;
    const available = new Set(imageModels.map(model => model.id));
    if (selectedImageModel) return;
    const configuredDefault = String(
      (imageModelsQuery.data as any)?.defaults?.image ?? ""
    ).trim();
    if (configuredDefault && available.has(configuredDefault)) {
      setSelectedImageModel(configuredDefault);
      persistStoredAutoReviewImageModel(configuredDefault);
    }
  }, [imageModelsQuery.data, selectedImageModel, imageModels]);

  useEffect(() => {
    if (!videoModelsQuery.data) return;
    const available = new Set(videoModels.map(model => model.id));
    if (selectedVideoModel) return;
    const configuredDefault = String(
      (videoModelsQuery.data as any)?.defaults?.video ?? ""
    ).trim();
    if (configuredDefault && available.has(configuredDefault)) {
      setSelectedVideoModel(configuredDefault);
      persistStoredAutoReviewVideoModel(configuredDefault);
    }
  }, [videoModelsQuery.data, selectedVideoModel, videoModels]);

  const changeSelectedImageModel = (model: string) => {
    setSelectedImageModel(model);
    persistStoredAutoReviewImageModel(model);
  };
  const changeSelectedVideoModel = (model: string) => {
    setSelectedVideoModel(model);
    persistStoredAutoReviewVideoModel(model);
  };
  const selectedImageModelAvailable = imageModels.some(
    model => model.id === selectedImageModel
  );
  const selectedVideoModelAvailable = videoModels.some(
    model => model.id === selectedVideoModel
  );

  useEffect(() => {
    setDrafts({});
    setRedraftNotes("");
    setFinalOrderDraft("");
    setIncludeAudioDraft(null);
  }, [props.state?.stateDigest]);
  const activeCheckpointByKey = useMemo(() => {
    const map = new Map<string, StagedCheckpoint>();
    for (const checkpoint of props.state?.checkpoints ?? []) {
      if (checkpoint.state !== "superseded")
        map.set(`${checkpoint.kind}:${checkpoint.shotId ?? "run"}`, checkpoint);
    }
    return map;
  }, [props.state?.checkpoints]);
  const runCheckpoint = (kind: string) =>
    activeCheckpointByKey.get(`${kind}:run`);
  const latestStoryCheckpoint = (props.state?.checkpoints ?? [])
    .filter(
      checkpoint =>
        checkpoint.kind === "story_plan" && checkpoint.state !== "superseded"
    )
    .reduce<StagedCheckpoint | null>(
      (latest, checkpoint) =>
        !latest || checkpoint.revision > latest.revision ? checkpoint : latest,
      null
    );
  const storyCheckpoint: StagedCheckpoint | null =
    latestStoryCheckpoint ??
    (props.state?.storyPlan
      ? {
          checkpointId: `story-plan:${props.runId || "run"}:r${props.state.planRevision || 1}`,
          kind: "story_plan",
          shotId: null,
          state:
            props.state.planReview?.status === "approved"
              ? "approved"
              : "awaiting",
          revision: props.state.planRevision || 1,
          contentHash:
            (props.state.storyPlan as any).storyPlanHash || "synthetic",
          estimatedCredits: 0,
          consumed: props.state.planReview?.status === "approved",
        }
      : null);
  const conceptSelectionPending = Boolean(
    props.state?.storyPlan?.conceptOptions?.length &&
      !props.state.storyPlan.selectedConceptId
  );
  const storyPlanApproved = storyCheckpoint
    ? storyCheckpoint.state === "approved"
    : props.state?.planReview?.status === "approved";
  const storyEditAvailable =
    Boolean(props.state && isRunEditable(props.state)) &&
    props.state?.metadataInitializationPending !== true &&
    Boolean(storyCheckpoint && storyCheckpoint.state !== "superseded");
  const audioCheckpoint = runCheckpoint("audio_plan");
  const finalCheckpoint = runCheckpoint("final_assembly");
  const finalRenderSettings = props.state?.finalRender?.settings ?? null;
  const renderJobId = props.state?.finalRender?.jobId ?? null;
  const renderShotCount = props.state?.shots.length ?? 0;
  const renderReadyShotIds = (props.state?.shots ?? [])
    .filter(shot => {
      const videoHash = shot.videoArtifactHash?.trim();
      const latestVideoCheckpoint = (props.state?.checkpoints ?? [])
        .filter(
          checkpoint =>
            checkpoint.kind === "video_result" &&
            checkpoint.shotId === shot.shotId &&
            checkpoint.state !== "superseded"
        )
        .sort((left, right) => right.revision - left.revision)[0];
      return Boolean(
        shot.videoArtifactUrl?.trim() &&
          videoHash &&
          latestVideoCheckpoint?.state === "approved" &&
          latestVideoCheckpoint.contentHash === videoHash
      );
    })
    .map(shot => shot.shotId);
  const renderReadyShotCount = renderReadyShotIds.length;
  const canSubmitFinalRender =
    renderShotCount > 0 &&
    renderReadyShotCount === renderShotCount;
  const missingRenderShotIds = (props.state?.shots ?? [])
    .filter(shot => !shot.videoArtifactUrl?.trim())
    .map(shot => shot.shotId);
  const unapprovedRenderShotIds = (props.state?.shots ?? [])
    .filter(shot => {
      return Boolean(
        shot.videoArtifactUrl?.trim() &&
          !renderReadyShotIds.includes(shot.shotId)
      );
    })
    .map(shot => shot.shotId);
  // Settings are frozen while a render job is referenced: the worker already
  // holds a frozen copy of the template. A completed result can be rendered
  // again with the same settings; an active job is reused to prevent duplicate
  // submissions.
  const renderSettingsLocked = Boolean(renderJobId);
  const effectiveAiDisclosure =
    aiDisclosureDraft ?? finalRenderSettings?.aiDisclosureEnabled ?? false;
  const finalVideoUrl = props.state?.finalRender?.outputUrl ?? null;
  const finalVideoProbe = props.state?.finalRender?.probe ?? null;
  const effectiveSubtitlePreset =
    subtitlePresetDraft ??
    finalRenderSettings?.subtitlePresetId ??
    "classic_box";
  const effectiveOverlayText =
    overlayTextDraft ?? finalRenderSettings?.overlayText?.content ?? "";
  const effectiveOverlayTextPosition =
    overlayTextPositionDraft ??
    finalRenderSettings?.overlayText?.position ??
    "top";
  const effectiveOverlayTextSize =
    overlayTextSizeDraft ?? finalRenderSettings?.overlayText?.fontSizePx ?? 56;
  const effectiveOverlayTextColor =
    overlayTextColorDraft ??
    finalRenderSettings?.overlayText?.color ??
    "#ffffff";
  const effectiveOverlayImageUrl =
    overlayImageUrlDraft ?? finalRenderSettings?.overlayImage?.url ?? "";
  const effectiveOverlayImagePosition =
    overlayImagePositionDraft ??
    finalRenderSettings?.overlayImage?.position ??
    "bottom_right";
  const effectiveOverlayImageWidth =
    overlayImageWidthDraft ??
    finalRenderSettings?.overlayImage?.widthPercent ??
    22;
  const effectiveOverlayTextWeight =
    overlayTextWeightDraft ??
    finalRenderSettings?.overlayText?.fontWeight ??
    "bold";
  const effectiveOverlayTextOpacity =
    overlayTextOpacityDraft ?? finalRenderSettings?.overlayText?.opacity ?? 1;
  const effectiveOverlayImageOpacity =
    overlayImageOpacityDraft ?? finalRenderSettings?.overlayImage?.opacity ?? 1;
  const effectiveOverlayImageFit =
    overlayImageFitDraft ?? finalRenderSettings?.overlayImage?.fit ?? "contain";
  const handleOverlayImageFile = async (file: File | null | undefined) => {
    if (!file) return;
    setOverlayUploadError(null);
    // Some OS drags report an empty `type` (notably `.svg` on Windows), so
    // fall back to the extension rather than rejecting a legitimate image
    // outright — the server re-validates extension + magic bytes either way.
    const looksLikeImage =
      file.type.toLowerCase().startsWith("image/") ||
      (!file.type && /\.(png|jpe?g|webp|svg)$/i.test(file.name || ""));
    if (!looksLikeImage) {
      setOverlayUploadError("ไฟล์ต้องเป็นรูปภาพ (PNG / JPG / WebP / SVG)");
      return;
    }
    if (file.size > OVERLAY_IMAGE_MAX_UPLOAD_BYTES) {
      setOverlayUploadError("ไฟล์ใหญ่เกิน 10MB");
      return;
    }
    setOverlayUploadBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read_failed"));
        reader.readAsDataURL(file);
      });
      if (!props.onUploadOverlayImage) throw new Error("อัปโหลดยังใช้ไม่ได้");
      const url = await props.onUploadOverlayImage({
        fileName: file.name || "overlay.png",
        fileType: file.type || guessOverlayImageMimeFromName(file.name),
        fileBase64: base64,
      });
      // Land the storage URL in the form but do NOT auto-save: the user still
      // presses "บันทึกการตั้งค่า render", so an accidental drop is
      // recoverable and the save stays one explicit action.
      setOverlayImageUrlDraft(url);
    } catch (error) {
      setOverlayUploadError(
        error instanceof Error && error.message
          ? `อัปโหลดไม่สำเร็จ: ${error.message}`
          : "อัปโหลดไม่สำเร็จ"
      );
    } finally {
      setOverlayUploadBusy(false);
    }
  };

  const handleOverlayImageDragOver = (
    event: React.DragEvent<HTMLDivElement>
  ) => {
    if (renderSettingsLocked || overlayUploadBusy) return;
    // Cancelling BOTH dragenter and dragover is what makes this element a
    // real drop target; without it the browser keeps its default handler and
    // opens the dropped file instead (navigating away from the review page).
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setOverlayDragActive(true);
  };

  const handleOverlayImageDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (renderSettingsLocked || overlayUploadBusy) return;
    event.preventDefault();
    event.stopPropagation();
    setOverlayDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void handleOverlayImageFile(file);
      return;
    }
    const droppedUrl = readDroppedOverlayImageUrl(event.dataTransfer);
    if (droppedUrl) {
      setOverlayUploadError(null);
      // URL-only drop: same "fill the field, don't auto-save" rule as an
      // uploaded file above.
      setOverlayImageUrlDraft(droppedUrl);
      return;
    }
    setOverlayUploadError(
      "ไม่พบไฟล์รูปในสิ่งที่ลากมา — ลากไฟล์จากเครื่อง หรือกดเลือกไฟล์"
    );
  };

  const finalOrder =
    props.state?.finalAssembly?.shots?.map(shot => shot.shotId) ?? [];
  const effectiveFinalOrder = finalOrderDraft || finalOrder.join(",");
  const effectiveIncludeAudio =
    includeAudioDraft ?? props.state?.finalAssembly?.includeAudio ?? true;
  const finalOrderValues = effectiveFinalOrder
    .split(",")
    .map(value => Number(value.trim()))
    .filter(Number.isInteger);
  // Marketplace flexible-shots-and-creation-casting (planning/marketplace-
  // flexible-shots-and-creation-casting/plan.md, W3) — the staged pipeline's
  // shot count is now variable (7-30), never a hardcoded 9. Validate against
  // the ACTUAL number of shots on this run instead.
  const expectedFinalShotCount = props.state?.shots?.length ?? 9;
  const finalOrderIsValid =
    finalOrderValues.length === expectedFinalShotCount &&
    new Set(finalOrderValues).size === expectedFinalShotCount &&
    finalOrderValues.every(
      shotId => shotId >= 1 && shotId <= expectedFinalShotCount
    );
  const workflowSteps = props.state ? buildWorkflowSteps(props.state) : [];
  const completedWorkflowSteps = workflowSteps.filter(
    step => step.status === "done" || step.status === "skipped"
  ).length;
  const currentWorkflowStep =
    workflowSteps.find(
      step => step.status === "current" || step.status === "needs_review"
    ) ?? workflowSteps.find(step => step.status === "locked");
  const promptModel =
    selectedModel === "__automatic__" ? undefined : selectedModel;
  const bulkImagePromptTargets = useMemo<StagedBulkGenerateTarget[]>(() => {
    if (!props.state || !isRunEditable(props.state)) return [];
    return props.state.shots.map(shot => ({
      shotId: shot.shotId,
      stage: "image" as const,
      promptModel,
      refreshPrompt: true,
      promptOnly: true,
    }));
  }, [props.state?.shots, props.state?.runStatus, promptModel]);
  const bulkImageGenerationTargets = useMemo<StagedBulkGenerateTarget[]>(() => {
    if (!props.state || !isRunEditable(props.state)) return [];
    return props.state.shots.map(shot => ({
      shotId: shot.shotId,
      stage: "image" as const,
      model: selectedImageModel,
      replaceExisting: true,
    }));
  }, [props.state?.shots, props.state?.runStatus, selectedImageModel]);
  const bulkVideoPromptTargets = useMemo<StagedBulkGenerateTarget[]>(() => {
    if (!props.state || !isRunEditable(props.state)) return [];
    return props.state.shots.map(shot => ({
      shotId: shot.shotId,
      stage: "video" as const,
      promptModel,
      refreshPrompt: true,
      promptOnly: true,
    }));
  }, [props.state?.shots, props.state?.runStatus, promptModel]);
  const bulkImageGenerationHasInFlight =
    props.state?.shots.some(
      shot =>
        isTaskInFlight(shot.imageTaskStatus) ||
        isTaskInFlight(shot.videoTaskStatus)
    ) ?? false;
  const videoPromptShotsWithoutApprovedImage =
    props.state?.shots.filter(
      shot =>
        !shot.imageArtifactHash ||
        !shot.imageArtifactUrl ||
        !props.state?.checkpoints.some(
          checkpoint =>
            checkpoint.shotId === shot.shotId &&
            checkpoint.kind === "image_result" &&
            checkpoint.state === "approved" &&
            checkpoint.contentHash === shot.imageArtifactHash
        )
    ).length ?? 0;
  const activeWorkerStatuses = [
    "pending",
    "queued",
    "leased",
    "claimed",
    "preparing",
    "running",
    "waiting_external",
    "retry_scheduled",
  ];
  const storyRedraftOperations =
    props.state?.workerOperations?.filter(
      job => job.operation === "staged_story_redraft"
    ) ?? [];
  const activeStoryRedraft = storyRedraftOperations.find(job =>
    activeWorkerStatuses.includes(job.status)
  );
  const latestStoryRedraft = activeStoryRedraft ?? storyRedraftOperations[0];
  const expectedStoryShotCount =
    props.state?.storyPlan?.expectedShotCount ?? 9;
  const generatedStoryShotCount = props.state?.shots.length ?? 0;
  const storyShotCountComplete =
    typeof expectedStoryShotCount === "number"
      ? generatedStoryShotCount === expectedStoryShotCount
      : generatedStoryShotCount >= 7 && generatedStoryShotCount <= 30;
  const storyGenerationStatus =
    props.pendingAction === "retry-story" || activeStoryRedraft
      ? "generating"
      : props.state?.storyPlan?.selectedConceptId && storyShotCountComplete
        ? "complete"
        : latestStoryRedraft?.status === "failed" ||
            (props.state?.storyPlan?.selectedConceptId && !storyShotCountComplete)
          ? "failed"
          : "idle";
  const bulkVideoPromptWillSupersedeMedia = bulkVideoPromptTargets.some(
    target => {
      const shot = props.state?.shots.find(
        item => item.shotId === target.shotId
      );
      return (
        isTaskInFlight(shot?.imageTaskStatus) ||
        isTaskInFlight(shot?.videoTaskStatus)
      );
    }
  );
  const bulkVideoGenerationTargets = useMemo<StagedBulkGenerateTarget[]>(() => {
    if (!props.state || !isRunEditable(props.state)) return [];
    return props.state.shots.map(shot => ({
      shotId: shot.shotId,
      stage: "video" as const,
      model: selectedVideoModel,
      replaceExisting: true,
    }));
  }, [props.state?.shots, props.state?.runStatus, selectedVideoModel]);
  const videoGenerationShotsNotReady =
    props.state?.shots.filter(
      shot =>
        !shot.imageArtifactHash ||
        !shot.imageArtifactUrl ||
        !props.state?.checkpoints.some(
          checkpoint =>
            checkpoint.shotId === shot.shotId &&
            checkpoint.kind === "image_result" &&
            checkpoint.state === "approved" &&
            checkpoint.contentHash === shot.imageArtifactHash
        ) ||
        !shot.videoPrompt?.trim() ||
        !props.state?.checkpoints.some(
          checkpoint =>
            checkpoint.shotId === shot.shotId &&
            checkpoint.kind === "video_prompt" &&
            checkpoint.state === "approved"
        )
    ).length ?? 0;
  const isShotPromptPipelineBusy = (shotId: number) =>
    props.state?.workerOperations?.some(job => {
      if (!activeWorkerStatuses.includes(job.status)) return false;
      if (
        job.operation === "staged_prompt_generation" ||
        job.operation === "sequential_shot_prompt_generation"
      ) {
        return job.shotId === shotId;
      }
      return (
        job.operation === "staged_bulk_generation" &&
        job.targetShotIds?.includes(shotId) === true
      );
    }) ?? false;

  if (!props.state && !props.loading && !props.error) return null;

  // Single source of truth for "is THIS exact button the one currently
  // running" — used for BOTH the disabled state and the "กำลังดำเนินการ…"
  // label so the two can never drift apart (a button that reads "running"
  // but is clickable, or vice versa, is exactly how the dead-button incident
  // stayed invisible). `props.pendingAction` is either an exact button id
  // (the generate-and-dispatch chain reports its precise key) or a coarse
  // mutation category, hence the prefix matches.
  const isThisActionRunning = (id: string): boolean =>
    props.pendingAction === id ||
    (props.pendingAction === "approve" && id.startsWith("approve-")) ||
    (props.pendingAction === "accept-image" &&
      id.startsWith("approve-image-result")) ||
    (props.pendingAction === "reject" && id.startsWith("reject-")) ||
    (props.pendingAction === "edit-shot" && id.startsWith("edit-")) ||
    (props.pendingAction === "generate-prompt" &&
      id.startsWith("generate-prompt-")) ||
    // The retry mutation reports an exact `dispatch-${stage}-${shotId}` while
    // it has variables. If variables are unavailable, keep legacy retry
    // controls local; never treat a coarse retry flag as all shots being busy.
    (props.pendingAction === "retry-shot" && id.startsWith("retry-")) ||
    (props.pendingAction === "retry-audio" && id.startsWith("retry-audio"));
  const isLocallyLockedGenerationAction = (id: string): boolean =>
    locallyLockedGenerationActions.has(id) ||
    (id.startsWith("bulk-") &&
      Array.from(locallyLockedGenerationActions).some(lockedId =>
        lockedId.startsWith("bulk-")
      ));

  const action = (
    id: string,
    label: string,
    callback: () => void,
    className = "rounded border px-3 py-2 text-sm",
    // Optional gating for server-projected prerequisites plus a title/aria
    // hint. Paid image/video dispatch prerequisites are checked again by the
    // server before a worker job is admitted.
    options?: {
      disabled?: boolean;
      title?: string;
      confirmation?: {
        title: string;
        description: string;
      };
    }
  ) => (
    // Field incident 2026-07-30 (run mar_341efe636f0e6d11fc938a37dd4b19a1,
    // shots 2/3 — "กดสร้างภาพแล้วเงียบ"): this used to be
    // `disabled={props.pending || options?.disabled}`. `props.pending` is a
    // SINGLE panel-wide flag raised by ANY in-flight mutation, so one slow
    // action disabled all ~50 buttons across all 9 shots at once. Worse, the
    // Surface's shared `onSuccess` does `await stateQuery.refetch()`, and
    // react-query keeps a mutation `isPending` until its onSuccess promise
    // settles — so the flag stayed raised even AFTER the freshly-authored
    // prompt had already rendered. The user saw the new prompt, clicked
    // "สร้างภาพ", and nothing happened, with no error: a dead button.
    //
    // Now only the ONE button that is actually running is disabled (exact id
    // match, same predicate that renders the "กำลังดำเนินการ…" label), so a
    // slow prompt-authoring call on shot 3 can never block shot 5 — or shot
    // 3's own next step. Cross-action safety is enforced server-side, where
    // it belongs: every mutation carries an idempotency key and an expected
    // state digest, so a genuinely conflicting concurrent write is rejected
    // with a visible error instead of being silently pre-empted in the UI.
    // Per the user's explicit requirement: "ใช้งานได้อิสระ ไม่โดน block ไม่ว่า
    // กรณีใด ๆ สามารถกดสร้าง prompt กดสร้างภาพได้ทุกช็อต ทุก project".
    //
    // disabled:opacity-90 (not -50) is kept: these solid-colored buttons sit
    // on tinted violet-50/60 and sky-50/60 section backgrounds, and
    // compositing a semi-transparent layer over those non-white ancestors
    // pulls foreground and background toward the same color — at opacity-50
    // white-on-violet-600 dropped from ~5.7:1 to ~2.3:1, under WCAG AA's
    // 4.5:1. opacity-90 stays above 4.5:1 while still visibly dimming.
    <button
      type="button"
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-700 disabled:cursor-not-allowed disabled:opacity-90 ${
        id.startsWith("dispatch-image-")
          ? "min-h-11 border border-violet-800 bg-violet-700 text-white hover:bg-violet-800 focus-visible:ring-violet-700 disabled:border-violet-300 disabled:bg-violet-200 disabled:text-violet-950 disabled:opacity-100"
          : ""
      }`}
      disabled={
        isThisActionRunning(id) ||
        isLocallyLockedGenerationAction(id) ||
        options?.disabled
      }
      aria-label={label}
      aria-busy={
        isThisActionRunning(id) ||
        isLocallyLockedGenerationAction(id) ||
        undefined
      }
      title={options?.title}
      onClick={() => {
        if (!options?.confirmation) {
          callback();
          return;
        }
        if (
          isThisActionRunning(id) ||
          isLocallyLockedGenerationAction(id) ||
          confirmedGenerationActionIdsRef.current.has(id) ||
          options.disabled
        ) {
          return;
        }
        setGenerationConfirmation({
          id,
          title: options.confirmation.title,
          description: options.confirmation.description,
          callback,
        });
      }}
    >
      {isThisActionRunning(id)
        ? "กำลังดำเนินการ…"
        : isLocallyLockedGenerationAction(id)
          ? "กำลังส่งงาน…"
          : label}
    </button>
  );
  const activeWorkerOperation = props.state?.workerOperations?.find(job =>
    [
      "pending",
      "queued",
      "leased",
      "claimed",
      "preparing",
      "running",
      "waiting_external",
      "retry_scheduled",
    ].includes(job.status)
  );
  const imagePromptWorkerOperations =
    props.state?.workerOperations?.filter(job =>
      [
        "advance_run",
        "staged_prompt_generation",
        "sequential_shot_prompt_generation",
      ].includes(job.operation)
    ) ?? [];
  const activeImagePromptWorkerOperation = imagePromptWorkerOperations.find(
    job =>
      [
        "pending",
        "queued",
        "leased",
        "claimed",
        "preparing",
        "running",
        "waiting_external",
        "retry_scheduled",
      ].includes(job.status)
  );
  const latestImagePromptWorkerOperation = imagePromptWorkerOperations[0];
  const failedImagePromptWorkerOperation =
    !activeImagePromptWorkerOperation &&
    latestImagePromptWorkerOperation?.status === "failed"
      ? latestImagePromptWorkerOperation
      : null;
  const imagePromptShotsCompleted =
    props.state?.shots.filter(shot => Boolean(shot.imagePrompt?.trim()))
      .length ?? 0;
  const imagePromptShotsExpected = props.state?.shots.length ?? 9;
  const activeBulkGeneration =
    props.state?.workerOperations?.some(
      job =>
        job.operation === "staged_bulk_generation" &&
        [
          "pending",
          "queued",
          "leased",
          "claimed",
          "preparing",
          "running",
          "waiting_external",
          "retry_scheduled",
        ].includes(job.status)
    ) ?? false;
  const latestWorkerOperation = props.state?.workerOperations?.[0];
  const failedWorkerOperation =
    !activeWorkerOperation && latestWorkerOperation?.status === "failed"
      ? latestWorkerOperation
      : null;
  const workerOperationLabels: Record<string, string> = {
    initialize_run: "เริ่มสร้างรีวิว",
    initialize_staged_metadata: "กู้คืนแนวเรื่องรีวิว",
    advance_run: "ตรวจและส่งขั้นตอน Auto Review ต่อ",
    draft_quality_qc: "ตรวจคุณภาพเนื้อหา",
    staged_story_redraft: "ร่างแนวเรื่องใหม่",
    plan_redraft: "ร่างแนวเรื่องใหม่",
    staged_prompt_generation: "สร้าง Prompt รายช็อต",
    sequential_shot_prompt_generation: "สร้าง Prompt รายช็อต",
    sequential_shot_regeneration: "สร้างภาพรายช็อต",
    sequential_image_edit_reconciliation: "ตรวจผลภาพที่สร้าง",
    staged_bulk_generation: "เตรียม Prompt สำหรับสร้างสื่อทุกช็อต",
  };

  return (
    <>
      <section
        className="mt-4 rounded-lg border border-violet-200 bg-violet-50/60 p-4"
        aria-labelledby={`staged-checkpoint-title-${props.runId}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
              Staged Auto Review Workbench
            </p>
            <h3
              id={`staged-checkpoint-title-${props.runId}`}
              className="mt-1 text-base font-semibold text-slate-950"
            >
              ตรวจทีละขั้นก่อนใช้เครดิต
            </h3>
            <p className="mt-1 text-sm text-slate-700">
              ตรวจเนื้อเรื่อง → ตรวจ Prompt ภาพ → Storyboard Review / ผลภาพ →
              ยืนยัน Prompt วิดีโอ → ตรวจผลวิดีโอ → ตรวจเสียง →
              ตรวจและยืนยันการประกอบ
            </p>
            <p className="mt-2 text-xs text-violet-700">
              ทุกช็อตแยกกัน: แก้ Prompt หรือ retry เฉพาะช็อตได้
              เครดิตภาพ/วิดีโอจะใช้เฉพาะตอนกดยืนยันสร้าง ส่วนการสร้าง Prompt
              อาจใช้เครดิต LLM แยกตาม policy
            </p>
            {props.state?.languagePlan && props.onLanguagePlanChange ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 md:grid-cols-3">
                {(
                  [
                    ["summaryLanguage", "ภาษาเรื่องย่อ"],
                    ["dialogueLanguage", "ภาษาบทพูด"],
                    ["promptLanguage", "ภาษา Prompt ภาพ/วิดีโอ"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="space-y-1 text-xs font-medium text-sky-950"
                  >
                    <span>{label}</span>
                    <select
                      value={props.state?.languagePlan?.[key] ?? "th"}
                      onChange={event =>
                        props.onLanguagePlanChange!({
                          ...props.state?.languagePlan!,
                          [key]: event.target.value as "th" | "en",
                        })
                      }
                      className="min-h-9 w-full rounded border border-sky-200 bg-white px-2 text-sm text-slate-900"
                      data-testid={`staged-language-${key}`}
                    >
                      <option value="th">ไทย</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          {props.state?.shots.length ? (
            <a
              href="#staged-auto-review-shot-list"
              className="inline-flex min-h-9 items-center rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
            >
              ดูข้อมูล {props.state.shots.length} ช็อต
            </a>
          ) : null}
          {action("refresh", "รีเฟรชสถานะ", props.onRefresh)}
        </div>
            {props.state?.outputMode === "full_video" ? (
              <Banner
                className="mb-4"
                data-testid="staged-final-render-action"
                aria-label="รวมทุกช็อตเป็นวิดีโอเดียว"
            status={
              finalVideoUrl
                ? "success"
                : canSubmitFinalRender
                  ? "info"
                  : "warning"
                }
                elevation="low"
                collapsible={false}
                title={
                  finalVideoUrl
                    ? "วิดีโอรวมเสร็จแล้ว"
                    : `รวม ${renderShotCount} ช็อตเป็นวิดีโอเดียว`
                }
                description={
                  <>
                    ต่อคลิปตามลำดับช็อต แล้วส่งให้ Worker App ตัดต่อด้วย Remotion
                    <br />
                    วิดีโอที่ตรวจรับแล้ว {renderReadyShotCount}/{renderShotCount} ช็อต
                    {missingRenderShotIds.length > 0
                      ? ` · ยังไม่มีช็อต ${missingRenderShotIds.join(", ")}`
                      : ""}
                    {unapprovedRenderShotIds.length > 0
                      ? ` · ยังตรวจรับช็อต ${unapprovedRenderShotIds.join(", ")}`
                      : ""}
                  </>
                }
                endContent={
                  finalVideoUrl ? (
                    <Button
                      label="สั่งรวมวิดีโอใหม่"
                      variant="primary"
                      size="lg"
                      isLoading={isThisActionRunning("submit-final-render")}
                      isDisabled={!canSubmitFinalRender}
                      onClick={() => props.onSubmitFinalRender?.()}
                    />
                  ) : (
                    <Button
                      label={
                        renderJobId
                          ? "ตรวจสอบงานรวมวิดีโอ"
                          : canSubmitFinalRender
                            ? `รวม ${renderShotCount} ช็อตเป็นวิดีโอเดียว`
                            : `รอวิดีโอครบ ${renderShotCount} ช็อต`
                      }
                      variant="primary"
                      size="lg"
                      isLoading={isThisActionRunning("submit-final-render")}
                      isDisabled={!renderJobId && !canSubmitFinalRender}
                      onClick={() => props.onSubmitFinalRender?.()}
                    />
                  )
                }
              >
                {finalVideoUrl ? (
                  <figure className="m-0 space-y-2 p-4" aria-label="วิดีโอรวม">
                    {props.state?.finalRender?.awaitingFinalization ? (
                      <figcaption className="text-xs text-amber-800">
                        ไฟล์เล่นและดาวน์โหลดได้แล้ว ระบบกำลังตรวจขั้นตอนบันทึกเข้า Library
                      </figcaption>
                    ) : null}
                    {failedMediaUrls[finalVideoUrl] ? (
                      <p
                        className="flex min-h-32 w-full max-w-xs items-center justify-center rounded border border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs leading-5 text-amber-800"
                        role="alert"
                      >
                        ไฟล์วิดีโอผลลัพธ์หมดอายุหรือเปิดไม่ได้แล้ว
                      </p>
                    ) : (
                      <video
                        id={`staged-final-video-${props.runId}`}
                        data-testid="staged-final-render-video"
                        key={finalVideoUrl}
                        className="block aspect-[9/16] max-h-[70vh] w-full max-w-xs rounded border border-emerald-200 bg-black object-contain"
                        src={finalVideoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        onError={() =>
                          setFailedMediaUrls(current => ({
                            ...current,
                            [finalVideoUrl]: true,
                          }))
                        }
                      />
                    )}
                    <figcaption className="flex flex-wrap items-center gap-3 text-xs text-emerald-950">
                      <a
                        className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
                        href={finalVideoUrl}
                        download={`marketplace-review-${props.runId}.mp4`}
                      >
                        ดาวน์โหลดวิดีโอรวม
                      </a>
                      <span>
                        {[
                          finalVideoProbe?.width && finalVideoProbe?.height
                            ? `${finalVideoProbe.width}×${finalVideoProbe.height}`
                            : null,
                          finalVideoProbe?.durationSeconds
                            ? `${Math.round(finalVideoProbe.durationSeconds)} วินาที`
                            : null,
                          finalVideoProbe?.sizeBytes
                            ? `${(finalVideoProbe.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                            : null,
                          renderJobId ? `job ${renderJobId}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </figcaption>
                  </figure>
                ) : renderJobId ? (
                  <p className="px-4 pb-3 text-sm text-slate-700" role="status">
                    ส่งงานแล้ว · job {renderJobId} กำลังรอหรือกำลัง render ใน Worker App
                  </p>
                ) : null}
              </Banner>
            ) : null}
        {props.loading ? (
          <p className="mt-3 text-sm text-slate-600" role="status">
            กำลังโหลด checkpoint…
          </p>
        ) : null}
        {props.error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {props.error}
          </p>
        ) : null}
        {props.notice ? (
          <p className="mt-3 text-sm text-sky-800" role="status">
            {props.notice}
          </p>
        ) : null}
        {activeWorkerOperation ? (
          <p className="mt-3 text-sm text-sky-800" role="status">
            {workerOperationLabels[activeWorkerOperation.operation] ??
              "งาน Auto Review"}{" "}
            กำลังทำงานเบื้องหลัง
            {activeWorkerOperation.status === "queued" ||
            activeWorkerOperation.status === "pending"
              ? " (รอคิว Worker)"
              : ""}
            {activeWorkerOperation.progress !== null &&
            activeWorkerOperation.progress !== undefined
              ? ` · ${Math.round(activeWorkerOperation.progress)}%`
              : ""}
          </p>
        ) : failedWorkerOperation ? (
          <p className="mt-3 text-sm text-amber-800" role="status">
            {workerOperationLabels[failedWorkerOperation.operation] ??
              "งาน Auto Review"}{" "}
            ทำงานไม่สำเร็จใน Worker — กดสั่งรายการเดิมอีกครั้งเพื่อ retry
          </p>
        ) : null}
        {props.state?.creativeQc && props.onStartCreativeQc ? (
          <MarketplaceDraftQualityQcPanel
            state={props.state.creativeQc as any}
            onStart={props.onStartCreativeQc}
            onRepair={props.onRepairCreativeQc}
            onSelectRepair={props.onSelectCreativeQcRepair}
            starting={props.creativeQcStarting}
            repairing={props.creativeQcRepairing}
            error={props.creativeQcError ?? props.creativeQcRepairError}
            locale={props.state.languagePlan?.summaryLanguage ?? "th"}
          />
        ) : null}
        {props.state ? (
          <>

            <div
              className="mt-4 rounded-xl border border-slate-200 bg-slate-950 p-3 text-white shadow-sm"
              aria-label="ความคืบหน้า checkpoint"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-300">
                    Checkpoint progress
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {currentWorkflowStep
                      ? `ถัดไป: ${currentWorkflowStep.label}`
                      : "ตรวจครบทุกขั้นตอนแล้ว"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-300">
                    {completedWorkflowSteps}/{workflowSteps.length} ขั้นตอนผ่าน
                  </p>
                </div>
              </div>
              <div
                className="mt-3 grid grid-flow-col auto-cols-[minmax(8.25rem,1fr)] gap-2 overflow-x-auto pb-1"
                role="list"
                aria-label="ลำดับ checkpoint"
              >
                {workflowSteps.map(step => (
                  <div
                    key={step.id}
                    role="listitem"
                    className={`rounded-lg border px-3 py-2 ${step.status === "current" ? "border-violet-300 bg-violet-500/20" : step.status === "needs_review" ? "border-amber-300 bg-amber-500/20" : "border-white/10 bg-white/[0.05]"}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-white">
                        {step.label}
                      </span>
                      <span
                        className={`rounded-full border px-1.5 py-0.5 ${checkpointStateClass(step.status === "done" ? "approved" : step.status === "needs_review" ? "rejected" : step.status === "current" ? "awaiting" : "pending")}`}
                      >
                        {step.status === "done"
                          ? "ผ่าน"
                          : step.status === "needs_review"
                            ? "แก้ไข"
                            : step.status === "current"
                              ? "รอตรวจ"
                              : step.status === "skipped"
                                ? "ข้าม"
                                : "รอคิว"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-300">
                      {step.description}
                    </p>
                    {step.total > 1 ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {step.completed}/{step.total} ช็อต
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {props.state.finalRender ? (
              <div className="mt-3 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  รวมทุกช็อตเป็นวิดีโอเดียว
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  ระบบจะต่อวิดีโอตามลำดับช็อต แล้วส่งงานให้ Worker App
                  รวมเป็นไฟล์เดียวด้วย Remotion วิดีโอจะปรากฏที่หน้านี้เมื่อทำเสร็จ
                </p>

                <label className="mt-3 block text-xs font-medium text-slate-700">
                  สไตล์ซับไตเติล
                  <select
                    className="mt-1 w-full rounded border p-2 text-sm"
                    value={effectiveSubtitlePreset}
                    onChange={event =>
                      setSubtitlePresetDraft(event.target.value)
                    }
                    disabled={renderSettingsLocked}
                  >
                    {SUBTITLE_PRESET_OPTIONS.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 rounded border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-800">
                    ข้อความบนวิดีโอ (CSS overlay)
                  </p>
                  <label className="mt-2 block text-xs font-medium text-slate-700">
                    ข้อความ — เว้นว่างไว้ = ไม่ใส่ข้อความ
                    <input
                      className="mt-1 w-full rounded border p-2 text-sm"
                      value={effectiveOverlayText}
                      placeholder="เช่น ลดพิเศษวันนี้เท่านั้น"
                      onChange={event =>
                        setOverlayTextDraft(event.target.value)
                      }
                      disabled={renderSettingsLocked}
                    />
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="block text-xs text-slate-700">
                      ตำแหน่งบนจอ
                      <select
                        className="mt-1 w-full rounded border p-2 text-sm"
                        value={effectiveOverlayTextPosition}
                        onChange={event =>
                          setOverlayTextPositionDraft(
                            event.target.value as OverlayAnchor
                          )
                        }
                        disabled={renderSettingsLocked}
                      >
                        {OVERLAY_ANCHOR_OPTIONS.map(option => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-700">
                      ขนาดตัวอักษร (px)
                      <input
                        type="number"
                        min={12}
                        max={200}
                        className="mt-1 w-full rounded border p-2 text-sm"
                        value={effectiveOverlayTextSize}
                        onChange={event =>
                          setOverlayTextSizeDraft(Number(event.target.value))
                        }
                        disabled={renderSettingsLocked}
                      />
                    </label>
                    <label className="block text-xs text-slate-700">
                      สีตัวอักษร
                      <input
                        type="color"
                        className="mt-1 h-9 w-full rounded border p-1"
                        value={effectiveOverlayTextColor}
                        onChange={event =>
                          setOverlayTextColorDraft(event.target.value)
                        }
                        disabled={renderSettingsLocked}
                      />
                    </label>
                    <label className="block text-xs text-slate-700">
                      ความหนา
                      <select
                        className="mt-1 w-full rounded border p-2 text-sm"
                        value={effectiveOverlayTextWeight}
                        onChange={event =>
                          setOverlayTextWeightDraft(
                            event.target.value as "normal" | "bold"
                          )
                        }
                        disabled={renderSettingsLocked}
                      >
                        <option value="bold">หนา</option>
                        <option value="normal">ปกติ</option>
                      </select>
                    </label>
                    <label className="block text-xs text-slate-700">
                      ความทึบ {Math.round(effectiveOverlayTextOpacity * 100)}%
                      <input
                        type="range"
                        min={5}
                        max={100}
                        step={5}
                        className="mt-1 w-full"
                        value={Math.round(effectiveOverlayTextOpacity * 100)}
                        onChange={event =>
                          setOverlayTextOpacityDraft(
                            Number(event.target.value) / 100
                          )
                        }
                        disabled={renderSettingsLocked}
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    ข้อความจะแสดงตลอดคลิป กินพื้นที่แถบสูง 14% ของจอ
                    เว้นขอบปลอดภัย 4% — ถ้าเลือกซ้าย/ขวา ข้อความจะชิดด้านนั้นและ
                    กว้าง 46% ของจอ ถ้าเลือกกลางจะกว้างเต็มพื้นที่ปลอดภัย
                  </p>
                </div>

                {/* Drag-and-drop upload. The drop handlers sit on THIS wrapper,
                  not on the dashed hint alone, so dropping anywhere in the
                  overlay-image field (hint strip, URL input, preview) is
                  accepted — users aiming at the URL box and missing it would
                  otherwise fall through to the browser, which navigates away
                  from the review page. `dragenter` + `dropEffect` are both
                  required for Chrome to treat the element as a real drop
                  target. The drop only fills the URL field — saving stays an
                  explicit action, so a mis-drop is recoverable. */}
                <div
                  className={`mt-3 rounded border p-3 ${
                    overlayDragActive
                      ? "border-sky-500 bg-sky-100"
                      : "border-slate-200 bg-white"
                  }`}
                  onDragEnter={handleOverlayImageDragOver}
                  onDragOver={handleOverlayImageDragOver}
                  onDragLeave={event => {
                    const next = event.relatedTarget as Node | null;
                    if (next && event.currentTarget.contains(next)) return;
                    setOverlayDragActive(false);
                  }}
                  onDrop={handleOverlayImageDrop}
                  data-testid="staged-overlay-image-dropzone"
                >
                  <p className="text-xs font-semibold text-slate-800">
                    ภาพซ้อนบนวิดีโอ (โลโก้ / ตราสินค้า / กรอบ)
                  </p>
                  <p
                    className="mt-1 text-[11px] text-slate-500"
                    data-testid="staged-overlay-image-dropzone-hint"
                  >
                    {overlayDragActive
                      ? "วางไฟล์ที่นี่เพื่ออัปโหลด"
                      : "ลากไฟล์จากเครื่องมาวางในกรอบนี้ได้เลย (อัปโหลดอัตโนมัติ) หรือกดเลือกไฟล์ · รองรับ PNG / JPG / WebP / SVG · ไม่เกิน 10MB · แนะนำ PNG พื้นหลังโปร่งใส ความละเอียดอย่างน้อย 512px ด้านกว้าง"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="text-xs"
                      disabled={renderSettingsLocked || overlayUploadBusy}
                      onChange={event =>
                        void handleOverlayImageFile(event.target.files?.[0])
                      }
                    />
                    {overlayUploadBusy ? (
                      <span className="text-xs text-sky-900" role="status">
                        กำลังอัปโหลด…
                      </span>
                    ) : null}
                    {effectiveOverlayImageUrl.trim() ? (
                      <button
                        type="button"
                        className="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700"
                        disabled={renderSettingsLocked}
                        onClick={() => setOverlayImageUrlDraft("")}
                      >
                        เอาภาพซ้อนออก
                      </button>
                    ) : null}
                  </div>
                  {overlayUploadError ? (
                    <p className="mt-2 text-xs text-red-700" role="alert">
                      {overlayUploadError}
                    </p>
                  ) : null}
                  <label className="mt-2 block text-xs text-slate-700">
                    หรือวาง URL ของภาพ — เว้นว่างไว้ = ไม่ใส่ภาพซ้อน
                    <input
                      className="mt-1 w-full rounded border p-2 text-sm"
                      value={effectiveOverlayImageUrl}
                      placeholder="https://…/logo.png"
                      onChange={event =>
                        setOverlayImageUrlDraft(event.target.value)
                      }
                      disabled={renderSettingsLocked}
                      data-testid="staged-overlay-image-url"
                    />
                  </label>
                  {effectiveOverlayImageUrl.trim() ? (
                    <div className="mt-2 flex items-start gap-3">
                      <AuthenticatedMediaImage
                        src={effectiveOverlayImageUrl}
                        alt="ตัวอย่างภาพซ้อน"
                        className="h-16 w-16 rounded border border-slate-300 bg-slate-100 object-contain"
                        style={{ opacity: effectiveOverlayImageOpacity }}
                      />
                      <p className="text-[11px] text-slate-500">
                        ตัวอย่างภาพและความทึบที่เลือก (ตำแหน่งจริงจะอยู่ที่{" "}
                        {OVERLAY_ANCHOR_OPTIONS.find(
                          option => option.id === effectiveOverlayImagePosition
                        )?.label ?? effectiveOverlayImagePosition}
                        )
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block text-xs text-slate-700">
                      ตำแหน่งบนจอ
                      <select
                        className="mt-1 w-full rounded border p-2 text-sm"
                        value={effectiveOverlayImagePosition}
                        onChange={event =>
                          setOverlayImagePositionDraft(
                            event.target.value as OverlayAnchor
                          )
                        }
                        disabled={renderSettingsLocked}
                      >
                        {OVERLAY_ANCHOR_OPTIONS.map(option => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-700">
                      ขนาด {effectiveOverlayImageWidth}% ของความกว้างจอ
                      <input
                        type="range"
                        min={5}
                        max={60}
                        step={1}
                        className="mt-1 w-full"
                        value={effectiveOverlayImageWidth}
                        onChange={event =>
                          setOverlayImageWidthDraft(Number(event.target.value))
                        }
                        disabled={renderSettingsLocked}
                      />
                    </label>
                    <label className="block text-xs text-slate-700">
                      การจัดวางในกรอบ
                      <select
                        className="mt-1 w-full rounded border p-2 text-sm"
                        value={effectiveOverlayImageFit}
                        onChange={event =>
                          setOverlayImageFitDraft(
                            event.target.value as "contain" | "cover"
                          )
                        }
                        disabled={renderSettingsLocked}
                      >
                        <option value="contain">
                          พอดีกรอบ ไม่ตัดขอบ (แนะนำ)
                        </option>
                        <option value="cover">เต็มกรอบ ตัดขอบส่วนเกิน</option>
                      </select>
                    </label>
                    <label className="block text-xs text-slate-700">
                      ความทึบ {Math.round(effectiveOverlayImageOpacity * 100)}%
                      <input
                        type="range"
                        min={5}
                        max={100}
                        step={5}
                        className="mt-1 w-full"
                        value={Math.round(effectiveOverlayImageOpacity * 100)}
                        onChange={event =>
                          setOverlayImageOpacityDraft(
                            Number(event.target.value) / 100
                          )
                        }
                        disabled={renderSettingsLocked}
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    กรอบภาพเป็นสี่เหลี่ยมจัตุรัสตามสัดส่วนจอ 9:16 — ขนาด{" "}
                    {effectiveOverlayImageWidth}% ของความกว้าง (=
                    {Math.round((effectiveOverlayImageWidth / 100) * 1080)}px
                    จาก 1080px) และเว้นขอบปลอดภัย 4% ทุกด้าน
                  </p>
                </div>

                <div className="mt-3 rounded border border-slate-200 bg-white p-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={effectiveAiDisclosure}
                      onChange={event =>
                        setAiDisclosureDraft(event.target.checked)
                      }
                      disabled={renderSettingsLocked}
                    />
                    <span>
                      <span className="font-medium text-slate-900">
                        ใส่ข้อความเปิดเผยว่าสร้างด้วย AI ลงบนวิดีโอ
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-600">
                        ปิดไว้เป็นค่าเริ่มต้น — TikTok / Reels มีป้าย
                        &quot;สร้างด้วย AI&quot; ของแพลตฟอร์มอยู่แล้ว
                        แต่ป้ายนั้นจะขึ้นก็ต่อเมื่อ
                        <strong> คุณติ๊กเองตอนอัปโหลด</strong>{" "}
                        ถ้าเปิดตัวเลือกนี้ ระบบจะเผาข้อความลงวิดีโอถาวร
                        (ลบไม่ได้ภายหลัง) ที่แถบล่างตลอดคลิป
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {action(
                    "save-render-settings",
                    "บันทึกการตั้งค่า render",
                    () =>
                      props.onSaveRenderSettings?.({
                        subtitlePresetId: effectiveSubtitlePreset,
                        aiDisclosureEnabled: effectiveAiDisclosure,
                        overlayText: effectiveOverlayText.trim()
                          ? {
                              content: effectiveOverlayText.trim(),
                              position:
                                effectiveOverlayTextPosition === "top"
                                  ? "top_center"
                                  : effectiveOverlayTextPosition,
                              fontSizePx: effectiveOverlayTextSize,
                              color: effectiveOverlayTextColor,
                              fontWeight: effectiveOverlayTextWeight,
                              opacity: effectiveOverlayTextOpacity,
                            }
                          : null,
                        overlayImage: effectiveOverlayImageUrl.trim()
                          ? {
                              url: effectiveOverlayImageUrl.trim(),
                              position: effectiveOverlayImagePosition,
                              widthPercent: effectiveOverlayImageWidth,
                              opacity: effectiveOverlayImageOpacity,
                              fit: effectiveOverlayImageFit,
                            }
                          : null,
                      }),
                    "rounded border border-slate-400 px-3 py-2 text-sm text-slate-800",
                    { disabled: renderSettingsLocked }
                  )}
                  <span className="text-xs text-slate-600">
                    สั่งรวมวิดีโอได้จากปุ่มด้านบน
                  </span>
                </div>
                {missingRenderShotIds.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-800" role="status">
                    ยังไม่มีวิดีโอช็อต {missingRenderShotIds.join(", ")}
                  </p>
                ) : unapprovedRenderShotIds.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-800" role="status">
                    ยังตรวจรับวิดีโอช็อต {unapprovedRenderShotIds.join(", ")}
                  </p>
                ) : null}

              </div>
            ) : null}
            {props.state.correctionRequired ? (
              <div
                className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                role="status"
                aria-live="polite"
              >
                <p className="font-medium">ขั้นตอนต้องตรวจแก้ก่อนทำงานต่อ</p>
                <p className="mt-1">
                  {correctionSafeMessage(
                    props.state.correctionRequired.reasonCode,
                    props.state.correctionRequired.stageKey
                  )}
                </p>
                {props.state.correctionRequired.stageKey === "audio_generation"
                  ? action("retry-audio", "ลองแผนเสียงใหม่", () =>
                      props.onRetry({ stage: "audio" })
                    )
                  : null}
                {props.state.correctionRequired.shotId &&
                (props.state.correctionRequired.stageKey ===
                  "image_generation" ||
                  props.state.correctionRequired.stageKey ===
                    "video_generation")
                  ? action(
                      "retry-provider-shot",
                      `ลองช็อตที่ ${props.state.correctionRequired.shotId} ใหม่`,
                      () =>
                        props.onRetry({
                          shotId: props.state!.correctionRequired!.shotId!,
                          stage:
                            props.state!.correctionRequired!.stageKey ===
                            "image_generation"
                              ? "image"
                              : "video",
                          autoApprove: true,
                        })
                    )
                  : null}
              </div>
            ) : null}

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <span>
                    ⚙️ เลือกโมเดล AI ในการประมวลผล (AI Model Selection)
                  </span>
                </h4>
                <span className="text-[11px] text-slate-500 font-normal">
                  สแกนโมเดลสดจากระบบแบบไดนามิก ·
                  เลือกเปลี่ยนโมเดลสร้างภาพและวิดีโอได้ตลอดเวลา
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <span>🤖 โมเดล LLM ร่างเรื่อง</span>
                  </label>
                  <select
                    aria-label="โมเดล LLM ร่างเรื่อง"
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-violet-500 focus:outline-none"
                    value={selectedModel}
                    onChange={event => changeSelectedModel(event.target.value)}
                    disabled={props.pending || planningModelsQuery.isLoading}
                  >
                    <option value="__automatic__">
                      อัตโนมัติ (เลือกโมเดลที่ดีที่สุด)
                    </option>
                    {planningModels.map(model => (
                      <option key={model.modelId} value={model.modelId}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <span>🎨 โมเดล AI สร้างภาพ</span>
                  </label>
                  <select
                    aria-label="โมเดล AI สร้างภาพ"
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-violet-500 focus:outline-none"
                    value={selectedImageModel}
                    onChange={event =>
                      changeSelectedImageModel(event.target.value)
                    }
                    disabled={props.pending || imageModelsQuery.isLoading}
                  >
                    <option value="">เลือกโมเดลภาพ</option>
                    {imageModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}{" "}
                        {model.creditCost
                          ? `(~${model.creditCost} เครดิต)`
                          : ""}{" "}
                        [{model.provider}]
                      </option>
                    ))}
                  </select>
                  {!selectedImageModelAvailable ? (
                    <p className="mt-1 text-xs text-rose-700" role="status">
                      {selectedImageModel
                        ? "โมเดลภาพที่บันทึกไว้ไม่มีในรายการปัจจุบัน กรุณาเลือกโมเดลใหม่"
                        : "เลือกโมเดลภาพก่อนส่งงาน ระบบจะไม่เลือกโมเดลอื่นแทนให้อัตโนมัติ"}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <span>🎬 โมเดล AI สร้างวิดีโอ</span>
                  </label>
                  <select
                    aria-label="โมเดล AI สร้างวิดีโอ"
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-violet-500 focus:outline-none"
                    value={selectedVideoModel}
                    onChange={event =>
                      changeSelectedVideoModel(event.target.value)
                    }
                    disabled={props.pending || videoModelsQuery.isLoading}
                  >
                    <option value="">เลือกโมเดลวิดีโอ</option>
                    {videoModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}{" "}
                        {model.creditCost
                          ? `(~${model.creditCost} เครดิต)`
                          : ""}{" "}
                        [{model.provider}]
                      </option>
                    ))}
                  </select>
                  {!selectedVideoModelAvailable ? (
                    <p className="mt-1 text-xs text-rose-700" role="status">
                      {selectedVideoModel
                        ? "โมเดลวิดีโอที่บันทึกไว้ไม่มีในรายการปัจจุบัน กรุณาเลือกโมเดลใหม่"
                        : "เลือกโมเดลวิดีโอก่อนส่งงาน ระบบจะไม่เลือกโมเดลอื่นแทนให้อัตโนมัติ"}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* 🎭 🛍️ Character & Product Reference Image Management */}
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {/* Section 1: Character Reference Images */}
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3.5 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-violet-900 flex items-center gap-1.5">
                    <span>🎭 ภาพตัวละครอ้างอิง (Character Assets)</span>
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-violet-700 font-medium">
                      {characterManifest.length} ภาพแนบ
                    </span>
                    {/* Conversation-mode badge — informational only, derived
                      client-side from the SPEAKING LEADS, matching the
                      backend's `resolveStagedConversationMode`. Supporting
                      characters add people to the frame without turning a
                      solo narration into a conversation. */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        conversationModeActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {conversationModeActive
                        ? "👥 โหมดสนทนา 2 คน"
                        : "🎤 พูดคนเดียว"}
                    </span>
                    {supportCharacterCount > 0 ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                        + ตัวประกอบ {supportCharacterCount}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal">
                  แนบภาพตัวละคร (เด็ก, ผู้ใหญ่, พรีเซนเตอร์) ได้สูงสุด{" "}
                  {MARKETPLACE_CHARACTER_CAST_MAX} คน (เลือกจาก Drama Series
                  ผสมกับที่อัปโหลดเองได้ นับรวมกัน) — 2 คนแรกเป็นผู้พูดหลัก
                  ส่วนที่เหลือตั้งเป็น "ตัวประกอบ"
                  ซึ่งจะปรากฏเฉพาะช็อตที่มีบทบาทช่วยเล่าเรื่อง
                </p>

                {/* Character Images Grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {characterManifest.map((item, idx) => {
                    const isFromDrama = Boolean(item.vdCharacterId);
                    const dramaSeriesTitle = item.vdSeriesId
                      ? dramaSeriesTitleById.get(item.vdSeriesId)
                      : undefined;
                    return (
                      <div
                        key={`char-${idx}`}
                        className="relative group rounded-lg border border-violet-200 bg-white p-1.5 shadow-2xs"
                      >
                        <AuthenticatedMediaImage
                          src={item.url}
                          alt={
                            item.characterName ||
                            item.label ||
                            `Character ${idx + 1}`
                          }
                          className="h-24 w-full rounded object-cover"
                        />
                        <div className="mt-1 space-y-1">
                          {isFromDrama ? (
                            <div className="flex items-center justify-between gap-1">
                              <span className="flex min-w-0 max-w-[78%] items-center gap-1">
                                <span
                                  aria-hidden="true"
                                  className="shrink-0 text-[10px]"
                                >
                                  🔒
                                </span>
                                <span
                                  className="truncate text-[10px] font-semibold text-slate-700"
                                  title="ชื่อมาจาก Vertical Drama series — แก้ไขไม่ได้ที่นี่"
                                >
                                  {item.characterName ||
                                    item.label ||
                                    `ตัวละครที่ ${idx + 1}`}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => removeReferenceItem(item.url)}
                                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-slate-600 hover:text-rose-600 transition"
                                title="ลบภาพตัวละคร"
                                aria-label="ลบภาพตัวละคร"
                              >
                                🗑️
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                // Falls back to the legacy `label` (usually the
                                // uploaded file name) so a manifest item that
                                // predates this feature — or one added via the
                                // dropzone, which still only sets `label` —
                                // shows something meaningful immediately
                                // instead of an empty box; the user can still
                                // clear/retype it.
                                value={item.characterName ?? item.label ?? ""}
                                onChange={event =>
                                  updateCharacterManifestItem(item.url, {
                                    characterName: event.target.value,
                                  })
                                }
                                placeholder="เช่น ไอริณ, กันต์"
                                maxLength={120}
                                className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-800 focus:border-violet-400 focus:outline-none"
                                aria-label={`ชื่อตัวละครที่ ${idx + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeReferenceItem(item.url)}
                                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-slate-600 hover:text-rose-600 transition"
                                title="ลบภาพตัวละคร"
                                aria-label="ลบภาพตัวละคร"
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                          {!isFromDrama &&
                          conversationModeActive &&
                          (item.characterName ?? item.label ?? "").trim() ===
                            "" ? (
                            <p className="text-[9px] text-amber-700">
                              ⚠️ ยังไม่ได้ตั้งชื่อ — ระบบจะเรียกว่า &quot;Person{" "}
                              {idx + 1}&quot; ในบทพูด
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            {isFromDrama ? (
                              <span className="truncate max-w-[58%] rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-medium text-violet-800">
                                จาก {dramaSeriesTitle || "Vertical Drama"}
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-600">
                                อัปโหลดเอง
                              </span>
                            )}
                            <select
                              value={item.characterRole ?? ""}
                              onChange={event =>
                                updateCharacterManifestItem(item.url, {
                                  characterRole:
                                    event.target.value === ""
                                      ? undefined
                                      : (event.target
                                          .value as MarketplaceCharacterCastRole),
                                })
                              }
                              className="min-w-0 max-w-[60%] shrink rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] text-slate-700"
                              aria-label={`บทบาทของตัวละครที่ ${idx + 1}`}
                              data-testid={`staged-roster-role-${idx + 1}`}
                            >
                              <option value="">บทบาท…</option>
                              <option value="host">เปิดเรื่อง/ถาม</option>
                              <option value="guest">ตอบ/รีวิว</option>
                              <option value="support">ตัวประกอบ</option>
                            </select>
                          </div>
                          {/* Run-level LOOK selector — changes which outfit this
                            character wears for the WHOLE run
                            (`planning/marketplace-four-character-cast/plan.md`).
                            The picker only offered looks at add time, and the
                            shot-card switcher only overrides one shot, so
                            there was no way to change a character's default
                            look after adding them. Hidden for uploaded photos,
                            which have no look family. */}
                          <div className="flex items-center justify-end">
                            {(() => {
                              const options = buildStagedShotLookOptions({
                                member: {
                                  castId: `cast-${idx + 1}`,
                                  name: item.characterName || item.label || "",
                                  url: item.url,
                                  vdCharacterId: item.vdCharacterId,
                                },
                                lookSourcesByCharacterId:
                                  dramaLookSourcesByCharacterId,
                              });
                              // A VD character with NO looks yet used to render
                              // nothing at all, which is indistinguishable from
                              // "the feature is broken" — say so instead, and
                              // point at where looks are made.
                              if (options.length === 0) {
                                if (!isFromDrama) return null;
                                return (
                                  <span
                                    className="truncate rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] text-slate-500"
                                    title="ตัวละครนี้ยังไม่มีลุคอื่นในซีรีย์ — สร้างลุคได้ที่หน้า Drama Series > ตัวละคร > เพิ่มลุค"
                                    data-testid={`staged-roster-look-empty-${idx + 1}`}
                                  >
                                    👕 ยังไม่มีลุคอื่น
                                  </span>
                                );
                              }
                              return (
                                <select
                                  value={item.vdCharacterId ?? ""}
                                  onChange={event => {
                                    const chosen = options.find(
                                      option =>
                                        option.characterId ===
                                        event.target.value
                                    );
                                    if (!chosen?.portraitUrl) return;
                                    updateCharacterManifestLook(item.url, {
                                      url: chosen.portraitUrl,
                                      vdCharacterId: chosen.characterId,
                                      variantLabel: chosen.isBase
                                        ? undefined
                                        : chosen.label,
                                    });
                                  }}
                                  className="min-w-0 max-w-full shrink rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[9px] text-violet-800"
                                  aria-label={`ลุคของ ${item.characterName || item.label || `ตัวละครที่ ${idx + 1}`}`}
                                  data-testid={`staged-roster-look-${idx + 1}`}
                                >
                                  {options.map(option => (
                                    <option
                                      key={option.key}
                                      value={option.characterId}
                                    >
                                      {option.isBase
                                        ? "👕 ลุคหลัก"
                                        : `👕 ${option.label}`}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()}
                          </div>
                          {/* Explicit minor grounding
                            (`project_marketplace_minor_safety_qa_grounding`):
                            silence downstream reads as "a minor may be
                            present" and can block a whole run's images, so
                            this has to be statable rather than inferred from
                            the photo. */}
                          <label className="flex items-center gap-1 text-[9px] text-slate-600">
                            <input
                              type="checkbox"
                              checked={item.depictsMinor === true}
                              onChange={event =>
                                updateCharacterManifestItem(item.url, {
                                  depictsMinor: event.target.checked
                                    ? true
                                    : false,
                                })
                              }
                              aria-label={`${item.characterName || item.label || `ตัวละครที่ ${idx + 1}`} เป็นเด็ก/เยาวชน`}
                              data-testid={`staged-roster-minor-${idx + 1}`}
                            />
                            เป็นเด็ก/เยาวชน
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {characterManifestCapReached ? (
                  <p
                    role="status"
                    aria-live="polite"
                    className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"
                  >
                    ตัวละครครบ {MARKETPLACE_CHARACTER_CAST_MAX} คนแล้ว —
                    ลบตัวใดตัวหนึ่งก่อนเพิ่มตัวใหม่
                  </p>
                ) : null}

                {/* The story was authored from the cast that existed when the run
                  started, so a change here does NOT rewrite it by itself
                  (`planning/marketplace-four-character-cast/plan.md`). Saying
                  so at the point of edit is what stops a user from paying for
                  images built on a story that never met the new character. */}
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800">
                  ⚠️ แก้ไขตัวละคร/บทบาท/ลุคหลังจากนี้
                  เนื้อเรื่องเดิมจะยังไม่เปลี่ยนตาม — ต้องกด
                  "ร่างเนื้อเรื่องใหม่ (ใช้ LLM)"
                  ในส่วนเนื้อเรื่องเพื่อให้บททุกช็อตรู้จักตัวละครชุดใหม่
                  (การแก้ตัวละครจะล้างการเลือกตัวละครรายช็อตที่ตั้งไว้ด้วย)
                </p>

                {duplicateLeadRole ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                    มีตัวละครมากกว่าหนึ่งคนถือบทบาทหลักเดียวกัน — ควรมี host 1
                    คนและ guest 1 คน ส่วนคนอื่นตั้งเป็น "ตัวประกอบ"
                  </p>
                ) : null}

                {/* Dropzone & Upload Button for Character */}
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    if (!characterManifestCapReached) setIsDraggingChar(true);
                  }}
                  onDragLeave={e => {
                    e.preventDefault();
                    setIsDraggingChar(false);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDraggingChar(false);
                    if (characterManifestCapReached) return;
                    handleFileInputs(e.dataTransfer.files, "character");
                  }}
                  aria-disabled={characterManifestCapReached}
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-500 has-[:focus-visible]:ring-offset-2 ${
                    characterManifestCapReached
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60"
                      : isDraggingChar
                        ? "cursor-pointer border-violet-600 bg-violet-100/80"
                        : "cursor-pointer border-violet-300 bg-white hover:border-violet-400"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={characterManifestCapReached}
                    aria-label="อัปโหลดภาพตัวละคร"
                    className="absolute inset-0 opacity-0 disabled:cursor-not-allowed cursor-pointer"
                    onChange={e =>
                      handleFileInputs(e.target.files, "character")
                    }
                  />
                  <span className="text-lg">🎭 ➕</span>
                  <p className="mt-1 text-xs font-semibold text-violet-800">
                    ลากภาพตัวละครมาวางที่นี่ หรือคลิกเพื่อเพิ่ม
                  </p>
                  <p className="text-[10px] text-slate-500">
                    รองรับไฟล์ PNG, JPG, WebP จากคอมพิวเตอร์
                  </p>
                </div>

                {verticalDramaSeriesEnabled ? (
                  <button
                    type="button"
                    onClick={() => setDramaPickerOpen(true)}
                    disabled={characterManifestCapReached}
                    className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-800 shadow-2xs transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    🎬 เลือกจาก Drama Series
                  </button>
                ) : null}
              </div>

              {/* Section 2: Product Reference Images */}
              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3.5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-sky-100 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
                    <span>🛍️ ภาพสินค้าอ้างอิง (Product Reference Images)</span>
                  </h4>
                  <span className="text-[11px] text-sky-700 font-medium">
                    {productManifest.filter(p => p.active !== false).length}/
                    {productManifest.length} ภาพถูกแนบ
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal">
                  เลือกหรือติ๊กภาพสินค้าที่จะส่งไปสร้างภาพ
                  (สามารถติ๊กเลือกเฉพาะภาพที่ต้องการเพื่อป้องกัน AI สับสน)
                </p>

                {/* Product Images Grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {productManifest.map((item, idx) => (
                    <div
                      key={`prod-${idx}`}
                      className={`relative group rounded-lg border p-1.5 transition shadow-2xs ${
                        item.active !== false
                          ? "border-sky-300 bg-white"
                          : "border-slate-200 bg-slate-100 opacity-60"
                      }`}
                    >
                      <AuthenticatedMediaImage
                        src={item.url}
                        alt={item.label || `Product ${idx + 1}`}
                        className="h-24 w-full rounded object-cover"
                      />
                      <div className="mt-1.5 space-y-1">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold text-slate-800">
                          <input
                            type="checkbox"
                            checked={item.active !== false}
                            onChange={() => toggleReferenceItemActive(item.url)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          <span className="truncate">
                            {item.label || `ภาพสินค้าที่ ${idx + 1}`}
                          </span>
                        </label>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-slate-500">
                            {item.active !== false
                              ? "☑️ พร้อมส่ง AI"
                              : "⏹️ ปิดใช้งาน"}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeReferenceItem(item.url)}
                            className="text-slate-600 hover:text-rose-600 transition p-0.5"
                            title="ลบภาพสินค้า"
                            aria-label="ลบภาพสินค้า"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Dropzone & Upload Button for Product */}
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDraggingProd(true);
                  }}
                  onDragLeave={e => {
                    e.preventDefault();
                    setIsDraggingProd(false);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDraggingProd(false);
                    handleFileInputs(e.dataTransfer.files, "product");
                  }}
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 text-center transition cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 has-[:focus-visible]:ring-offset-2 ${
                    isDraggingProd
                      ? "border-sky-600 bg-sky-100/80"
                      : "border-sky-300 bg-white hover:border-sky-400"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    aria-label="อัปโหลดภาพสินค้า"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => handleFileInputs(e.target.files, "product")}
                  />
                  <span className="text-lg">🛍️ ➕</span>
                  <p className="mt-1 text-xs font-semibold text-sky-800">
                    ลากภาพสินค้ามาวางที่นี่ หรือคลิกเพื่อเพิ่ม
                  </p>
                  <p className="text-[10px] text-slate-500">
                    รองรับไฟล์ PNG, JPG, WebP จากคอมพิวเตอร์
                  </p>
                </div>
              </div>
            </div>

            {verticalDramaSeriesEnabled ? (
              <MarketplaceDramaCharacterPickerDialog
                open={dramaPickerOpen}
                onOpenChange={setDramaPickerOpen}
                maxSelectable={Math.max(
                  0,
                  MARKETPLACE_CHARACTER_CAST_MAX - characterManifest.length
                )}
                existingRoles={characterManifest
                  .map(item => item.characterRole)
                  .filter(
                    (role): role is MarketplaceCharacterCastRole => !!role
                  )}
                onConfirm={addDramaCharacters}
              />
            ) : null}

            <div className="mt-3 rounded-md border border-violet-100 bg-white p-3">
              <p className="font-medium text-slate-900">
                {props.state.storyPlan?.title || "Story Arc"}
              </p>
              {props.state.reviewTone || props.state.storytellingStructure ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-950">
                  <span className="font-semibold text-sky-800">
                    การตั้งค่าเรื่องที่เลือกไว้:
                  </span>
                  {props.state.storytellingStructure ? (
                    <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1 text-slate-800 border border-sky-300 shadow-2xs">
                      📐 โครงสร้าง:{" "}
                      <strong className="ml-1 text-sky-900">
                        {STRUCTURE_LABELS[props.state.storytellingStructure] ??
                          props.state.storytellingStructure}
                      </strong>
                    </span>
                  ) : null}
                  {props.state.reviewTone ? (
                    <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1 text-slate-800 border border-sky-300 shadow-2xs">
                      🎭 อารมณ์/โทน:{" "}
                      <strong className="ml-1 text-sky-900">
                        {TONE_LABELS[props.state.reviewTone] ??
                          props.state.reviewTone}
                      </strong>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {storyCheckpoint?.adherenceWarnings &&
              storyCheckpoint.adherenceWarnings.length > 0 ? (
                <div
                  className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900"
                  role="status"
                  aria-live="polite"
                >
                  <p className="font-medium">
                    ข้อสังเกตเกี่ยวกับความสอดคล้องของเนื้อเรื่อง
                    (ไม่บล็อกการทำงาน)
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {storyCheckpoint.adherenceWarnings.map(code => (
                      <li key={code}>
                        {ADHERENCE_WARNING_LABELS[code] ?? code}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {storyCheckpoint?.state === "awaiting" &&
              props.state.storyPlan?.conceptOptions?.length ? (
                <StagedStoryConceptPicker
                  options={props.state.storyPlan.conceptOptions}
                  selectedConceptId={
                    props.state.storyPlan.selectedConceptId ?? null
                  }
                  planRevision={props.state.storyPlan.planRevision ?? 0}
                  expectedShotCount={expectedStoryShotCount}
                  generatedShotCount={generatedStoryShotCount}
                  generationStatus={storyGenerationStatus}
                  disabled={!storyEditAvailable || props.pending}
                  onApply={selectedConcept =>
                    props.onRetry({
                      stage: "story",
                      selectedConcept,
                      model: selectedModel,
                    })
                  }
                />
              ) : null}
              {props.state.storyPlan?.conceptOptions?.length &&
              !props.state.storyPlan.selectedConceptId ? (
                <p className="mt-3 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
                  เลือกแนวคิดด้านบนก่อน ระบบจึงจะร่างช็อตและบทพูดให้ตรวจ
                </p>
              ) : null}
              <div hidden={conceptSelectionPending}>
                <label className="mt-2 block text-sm font-medium text-slate-800">
                เรื่องย่อ
                <textarea
                  className="mt-1 min-h-20 w-full rounded border p-2 text-sm font-normal"
                  value={
                    drafts["story:summary"] ??
                    props.state.storyPlan?.storySummary ??
                    ""
                  }
                  onChange={event =>
                    setDrafts(prev => ({
                      ...prev,
                      "story:summary": event.target.value,
                    }))
                  }
                  disabled={!storyEditAvailable || props.pending}
                />
                </label>
              {storyCheckpoint?.state === "awaiting" ? (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3.5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-amber-900">
                        ✨ เนื้อเรื่องฉบับที่ {storyCheckpoint.revision}{" "}
                        รอยืนยัน
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800">
                        {imagePromptShotsCompleted > 0
                          ? `มี Prompt ภาพแล้ว ${imagePromptShotsCompleted}/${imagePromptShotsExpected} ช็อต — ส่งสร้างภาพจาก Prompt ที่บันทึกไว้ได้เลย ไม่ต้องยืนยันซ้ำ ปุ่มนี้ใช้ยืนยันเนื้อเรื่องเมื่อต้องการสร้าง Prompt ใหม่`
                          : `กดยืนยันเพื่ออนุมัติเนื้อเรื่องฉบับนี้และเริ่มสร้าง Prompt ภาพของทุกช็อตได้เลย`}{" "}
                        การตรวจ QC เป็นทางเลือกและข้ามได้
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {/* Compact repeat of the Character Assets section's own
                        "โหมดสนทนา 2 คน" / "พูดคนเดียว" badge, placed right
                        next to the credit-spending approve action so it's
                        the last thing the user sees before committing
                        credits (it's DOM-distant from the badge above). */}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          conversationModeActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {conversationModeActive ? "👥 2 คน" : "🎤 เดี่ยว"}
                      </span>
                      {action(
                        "approve-story",
                        imagePromptShotsCompleted > 0
                          ? "✅ ยืนยันเนื้อเรื่องฉบับล่าสุด"
                          : "✅ ยืนยันเนื้อเรื่อง (เริ่มสร้าง Prompt ภาพ)",
                        () =>
                          props.onApprove({
                            checkpoint: storyCheckpoint,
                            expected: expected(storyCheckpoint),
                          }),
                        "rounded-md bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition",
                        {
                          disabled:
                            props.state.metadataInitializationPending === true,
                          title:
                            props.state.metadataInitializationPending === true
                              ? "กำลังเตรียมแผนเนื้อเรื่องใน Worker"
                              : undefined,
                        }
                      )}
                    </div>
                  </div>
                </div>
              ) : storyCheckpoint?.state === "approved" ||
                props.state.planReview?.status === "approved" ? (
                <Banner
                  status={
                    imagePromptShotsCompleted >= imagePromptShotsExpected
                      ? "success"
                      : failedImagePromptWorkerOperation
                        ? "error"
                        : "info"
                  }
                  title={
                    imagePromptShotsCompleted >= imagePromptShotsExpected
                      ? `ยืนยันเนื้อเรื่องแล้ว — สร้าง Prompt ภาพครบ ${imagePromptShotsCompleted}/${imagePromptShotsExpected} ช็อต`
                      : failedImagePromptWorkerOperation
                        ? `สร้าง Prompt ภาพไม่สำเร็จ (${imagePromptShotsCompleted}/${imagePromptShotsExpected} ช็อต)`
                        : activeImagePromptWorkerOperation?.status ===
                              "queued" ||
                            activeImagePromptWorkerOperation?.status ===
                              "pending" ||
                            activeImagePromptWorkerOperation?.status ===
                              "retry_scheduled"
                          ? `ส่งงานสร้าง Prompt ภาพ ${imagePromptShotsExpected} ช็อตเข้าคิว Worker แล้ว — กำลังรอเริ่มทำงาน (${imagePromptShotsCompleted}/${imagePromptShotsExpected} เสร็จ)`
                          : activeImagePromptWorkerOperation
                            ? `Worker กำลังสร้าง Prompt ภาพ (${imagePromptShotsCompleted}/${imagePromptShotsExpected} ช็อตเสร็จ)`
                            : `ยืนยันเนื้อเรื่องแล้ว — กำลังตรวจสอบคิวสร้าง Prompt ภาพ (${imagePromptShotsCompleted}/${imagePromptShotsExpected} ช็อต)`
                  }
                  description={
                    imagePromptShotsCompleted >= imagePromptShotsExpected
                      ? "ตรวจแก้ Prompt ภาพของแต่ละช็อตได้ด้านล่าง"
                      : failedImagePromptWorkerOperation
                        ? "ลองสร้าง Prompt ใหม่หรือ retry งานเดิมได้"
                        : `สถานะอัปเดตอัตโนมัติทุก 4 วินาที ไม่ต้อง refresh${
                            activeImagePromptWorkerOperation?.progress !==
                              null &&
                            activeImagePromptWorkerOperation?.progress !==
                              undefined
                              ? ` · ความคืบหน้า ${Math.round(activeImagePromptWorkerOperation.progress)}%`
                              : ""
                          }`
                  }
                  data-testid="story-image-prompt-status"
                />
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {storyEditAvailable &&
                (drafts["story:summary"] ??
                  props.state.storyPlan?.storySummary ??
                  "") !== (props.state.storyPlan?.storySummary ?? "")
                  ? action(
                      "edit-story",
                      "บันทึกเรื่องย่อ",
                      () =>
                        props.onEdit({ storySummary: drafts["story:summary"] }),
                      "rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                    )
                  : null}
                {storyCheckpoint && storyCheckpoint.state === "awaiting"
                  ? action(
                      "reject-story",
                      "ขอแก้เนื้อเรื่อง",
                      () => props.onReject(storyCheckpoint),
                      "rounded border border-amber-700 px-3 py-2 text-sm text-amber-800",
                      {
                        disabled: !storyEditAvailable,
                      }
                    )
                  : null}
                {storyEditAvailable
                  ? action(
                      "retry-story",
                      "ร่างเนื้อเรื่องใหม่ (ใช้ LLM)",
                      () =>
                        props.onRetry({
                          stage: "story",
                          notes: redraftNotes.trim(),
                          model: selectedModel,
                        }),
                      "rounded bg-amber-800 px-3 py-2 text-xs font-medium text-white hover:bg-amber-900 shadow-2xs"
                  )
                  : null}
                </div>
              {storyCheckpoint && storyCheckpoint.state === "awaiting" ? (
                <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700">
                      🤖 เลือกโมเดล LLM สำหรับร่างเรื่อง:
                    </label>
                    <select
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-2xs focus:border-amber-500 focus:outline-none max-w-xs"
                      value={selectedModel}
                      onChange={event =>
                        changeSelectedModel(event.target.value)
                      }
                      disabled={props.pending || planningModelsQuery.isLoading}
                    >
                      <option value="__automatic__">
                        อัตโนมัติ (เลือกโมเดลที่ดีที่สุดให้อัตโนมัติ)
                      </option>
                      {planningModels.map(model => (
                        <option key={model.modelId} value={model.modelId}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="block text-xs text-slate-600">
                    หมายเหตุเพิ่มเติมสำหรับร่างใหม่ (ถ้ามี)
                    <textarea
                      className="mt-1 min-h-12 w-full rounded border border-slate-300 bg-white p-2 text-xs text-slate-800"
                      placeholder="เช่น ขอเน้นวัสดุเด็กปลอดภัย ปราศจากสารพิษ..."
                      value={redraftNotes}
                      onChange={event => setRedraftNotes(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              </div>
            </div>

            {props.state.audioPlan ? (
              <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
                <p className="font-medium text-slate-900">แผนเสียง</p>
                <textarea
                  className="mt-2 min-h-20 w-full rounded border p-2"
                  value={
                    drafts["audio:text"] ?? props.state.audioPlan.text ?? ""
                  }
                  onChange={event =>
                    setDrafts(prev => ({
                      ...prev,
                      "audio:text": event.target.value,
                    }))
                  }
                  disabled={!isEditable(audioCheckpoint) || props.pending}
                />
                <p className="mt-1 text-xs text-slate-500">
                  ภาษา {props.state.audioPlan.language || "th"} ·{" "}
                  {props.state.audioPlan.model || "ไม่ระบุโมเดล"} · ~
                  {props.state.audioPlan.estimatedCredits ?? 0} เครดิต
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {/* audio_plan now auto-approves at construction — no
                    approve click left to trigger; reject stays available. */}
                  {audioCheckpoint && audioCheckpoint.state === "awaiting"
                    ? action("reject-audio", "ขอแก้แผนเสียง", () =>
                        props.onReject(audioCheckpoint)
                      )
                    : null}
                  {audioCheckpoint &&
                  isEditable(audioCheckpoint) &&
                  (drafts["audio:text"] ?? props.state.audioPlan.text ?? "") !==
                    (props.state.audioPlan.text ?? "")
                    ? action(
                        "edit-audio",
                        "บันทึกแผนเสียง",
                        () => props.onEdit({ audioText: drafts["audio:text"] }),
                        "rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                      )
                    : null}
                  {isRetryAvailable(audioCheckpoint)
                    ? action("retry-audio-plan", "สร้างแผนเสียงใหม่", () =>
                        props.onRetry({ stage: "audio" })
                      )
                    : null}
                </div>
              </div>
            ) : null}

            {props.state.finalAssembly ? (
              <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
                <p className="font-medium text-slate-900">
                  การประกอบขั้นสุดท้าย
                </p>
                <p className="mt-1 text-slate-700">
                  {props.state.finalAssembly.shotCount ?? 0} ช็อต ·{" "}
                  {props.state.finalAssembly.hasAudio
                    ? "มีเสียง"
                    : "ไม่มีเสียงแยก"}
                </p>
                <label className="mt-2 block text-xs font-medium text-slate-700">
                  ลำดับช็อต (เช่น 1,2,3)
                  <input
                    className="mt-1 w-full rounded border p-2 text-sm"
                    value={effectiveFinalOrder}
                    onChange={event => setFinalOrderDraft(event.target.value)}
                    disabled={!isEditable(finalCheckpoint) || props.pending}
                  />
                </label>
                {finalOrderDraft && !finalOrderIsValid ? (
                  <p className="mt-1 text-xs text-amber-700" role="alert">
                    ลำดับต้องมีช็อต 1–{expectedFinalShotCount}{" "}
                    ครบทุกหมายเลขและห้ามซ้ำ
                  </p>
                ) : null}
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={effectiveIncludeAudio}
                    onChange={event =>
                      setIncludeAudioDraft(event.target.checked)
                    }
                    disabled={!isEditable(finalCheckpoint) || props.pending}
                  />{" "}
                  ใช้เสียงประกอบใน final assembly
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {/* final_assembly now auto-approves at construction — no
                    approve click left to trigger; reject stays available. */}
                  {finalCheckpoint && finalCheckpoint.state === "awaiting"
                    ? action("reject-final", "ขอแก้การประกอบ", () =>
                        props.onReject(finalCheckpoint)
                      )
                    : null}
                  {finalCheckpoint &&
                  isEditable(finalCheckpoint) &&
                  finalOrderIsValid &&
                  (finalOrderDraft || includeAudioDraft !== null)
                    ? action(
                        "edit-final",
                        "บันทึกการประกอบ",
                        () =>
                          props.onEdit({
                            finalShotOrder: finalOrderValues,
                            includeAudio: effectiveIncludeAudio,
                          }),
                        "rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                      )
                    : null}
                  {isRetryAvailable(finalCheckpoint)
                    ? action("retry-final", "สร้าง preview การประกอบใหม่", () =>
                        props.onRetry({ stage: "final" })
                      )
                    : null}
                </div>
              </div>
            ) : null}

            <section
              className="mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3"
              aria-label="สร้างงานทุกช็อต"
            >
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-violet-950">
                  สร้างงานทุกช็อต
                </h3>
                <p className="mt-0.5 text-xs text-violet-800">
                  เลือกงานชุดที่จะทำกับช็อตทั้งหมด
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                  {bulkImagePromptTargets.length > 0 && props.onBulkGenerate
                    ? action(
                        "bulk-image-prompt-generate",
                        `สร้าง Prompt ภาพทุกช็อต (${bulkImagePromptTargets.length})`,
                        () => props.onBulkGenerate!(bulkImagePromptTargets),
                        "rounded-lg bg-violet-600 hover:bg-violet-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition",
                        {
                          disabled:
                            activeBulkGeneration ||
                            Boolean(activeImagePromptWorkerOperation) ||
                            !storyPlanApproved,
                          confirmation: {
                            title: "ยืนยันสร้าง Prompt ภาพทุกช็อต",
                            description: `ระบบจะสร้าง Prompt ภาพครบ ${bulkImagePromptTargets.length} ช็อตใน Worker งานเดียว โดยใช้เนื้อเรื่องล่าสุดที่ยืนยันแล้ว`,
                          },
                          title: activeBulkGeneration
                            ? "กำลังทำงานชุดนี้ใน Worker"
                            : !storyPlanApproved
                              ? "ยืนยันเนื้อเรื่องก่อนสร้าง Prompt ภาพ"
                              : "สร้าง Prompt ภาพครบทุกช็อตใน Worker งานเดียว",
                        }
                      )
                    : null}
                  {bulkImageGenerationTargets.length > 0 && props.onBulkGenerate
                    ? action(
                        "bulk-image-generation",
                        `สร้างภาพทุกช็อต (${bulkImageGenerationTargets.length})`,
                        () => props.onBulkGenerate!(bulkImageGenerationTargets),
                        "rounded-lg border border-violet-300 bg-white px-3.5 py-1.5 text-xs font-bold text-violet-800 shadow-xs transition",
                        {
                          disabled:
                            activeBulkGeneration ||
                            bulkImageGenerationHasInFlight ||
                            !storyPlanApproved ||
                            props.state!.shots.some(
                              shot =>
                                !shot.imagePrompt?.trim() ||
                                !props.state!.checkpoints.some(
                                  checkpoint =>
                                    checkpoint.shotId === shot.shotId &&
                                    checkpoint.kind === "image_prompt" &&
                                    checkpoint.state === "approved"
                                )
                            ),
                          confirmation: {
                            title: "ยืนยันสร้างภาพทุกช็อต",
                            description: `ส่งสร้างภาพครบ ${bulkImageGenerationTargets.length} ช็อตจาก Prompt ที่บันทึกไว้เข้า Worker งานเดียว ผลภาพเดิมจะถูกแทนที่ และอาจใช้เครดิตตามโมเดลที่เลือก`,
                          },
                          title: !storyPlanApproved
                            ? "ยืนยันเนื้อเรื่องก่อนสร้างภาพ"
                            : bulkImageGenerationHasInFlight
                              ? "รอให้งานภาพหรือวิดีโอที่กำลังทำอยู่เสร็จก่อน"
                              : "สร้างภาพจาก Prompt ที่บันทึกไว้ครบทุกช็อต",
                        }
                      )
                    : null}
                  {bulkVideoPromptTargets.length > 0 && props.onBulkGenerate
                    ? action(
                        "bulk-video-prompt-generate",
                        `สร้าง Prompt วิดีโอทุกช็อต (${bulkVideoPromptTargets.length})`,
                        () => props.onBulkGenerate!(bulkVideoPromptTargets),
                        "rounded-lg border border-sky-400 bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-sky-100 shadow-xs transition",
                        {
                          disabled:
                            activeBulkGeneration ||
                            Boolean(activeImagePromptWorkerOperation) ||
                            videoPromptShotsWithoutApprovedImage > 0,
                          confirmation: {
                            title: "ยืนยันสร้าง Prompt วิดีโอทุกช็อต",
                            description: `ระบบจะส่งงานสร้าง Prompt วิดีโอจำนวน ${bulkVideoPromptTargets.length} ช็อตเข้า Worker Jobs และอาจใช้เครดิตตามโมเดลที่เลือก${bulkVideoPromptWillSupersedeMedia ? " มีบางช็อตกำลังเรนเดอร์อยู่ ผล render เดิมอาจยังทำต่อและอาจมีค่าใช้จ่าย แต่ระบบจะไม่ผูกผลนั้นกับ Prompt ใหม่" : ""}`,
                          },
                          title: activeBulkGeneration
                            ? "กำลังเตรียมงานชุดนี้ใน Worker"
                            : videoPromptShotsWithoutApprovedImage > 0
                              ? `ต้องสร้างและอนุมัติภาพก่อน (${videoPromptShotsWithoutApprovedImage} ช็อต)`
                              : "สร้างหรือซ่อม Prompt วิดีโอทุกช็อต โดยไม่สร้างวิดีโอและไม่ใช้เครดิตสื่อ",
                        }
                      )
                    : null}
                  {bulkVideoGenerationTargets.length > 0 && props.onBulkGenerate
                    ? action(
                        "bulk-video-generation",
                        `สร้างวิดีโอทุกช็อต (${bulkVideoGenerationTargets.length})`,
                        () => props.onBulkGenerate!(bulkVideoGenerationTargets),
                        "rounded-lg bg-sky-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-sky-800",
                        {
                          disabled:
                            activeBulkGeneration ||
                            videoGenerationShotsNotReady > 0,
                          confirmation: {
                            title: "ยืนยันสร้างวิดีโอทุกช็อต",
                            description: `ส่งสร้างวิดีโอครบ ${bulkVideoGenerationTargets.length} ช็อตจาก Prompt ที่บันทึกไว้เข้า Worker งานเดียว ผลวิดีโอเดิมจะถูกแทนที่ และอาจใช้เครดิตตามโมเดลที่เลือก`,
                          },
                          title: activeBulkGeneration
                            ? "กำลังทำงานชุดนี้ใน Worker"
                            : videoGenerationShotsNotReady > 0
                              ? `ต้องมีภาพที่อนุมัติและ Prompt วิดีโอครบก่อน (${videoGenerationShotsNotReady} ช็อต)`
                              : "สร้างวิดีโอจาก Prompt ที่บันทึกไว้ครบทุกช็อต",
                        }
                      )
                    : null}
              </div>
            </section>

            <div
              id="staged-auto-review-shot-list"
              className="mt-3 space-y-3 scroll-mt-4"
            >
              {conceptSelectionPending
                ? null
                : props.state.shots.map(shot => {
                const imageCheckpoint = activeCheckpointByKey.get(
                  `image_prompt:${shot.shotId}`
                );
                const imageResultCheckpoint = activeCheckpointByKey.get(
                  `image_result:${shot.shotId}`
                );
                const imageCorrection = props.state.correctionRequired;
                const imageCorrectionApplies =
                  imageCorrection?.stageKey === "image_generation" &&
                  (!imageCorrection.shotId ||
                    imageCorrection.shotId === shot.shotId);
                const videoCheckpoint = activeCheckpointByKey.get(
                  `video_prompt:${shot.shotId}`
                );
                const videoResultCheckpoint = activeCheckpointByKey.get(
                  `video_result:${shot.shotId}`
                );
                const storySummaryKey = `story:${shot.shotId}:summary`;
                const dialogueKey = `story:${shot.shotId}:dialogue`;
                const imageDraftKey = `image:${shot.shotId}`;
                const videoDraftKey = `video:${shot.shotId}`;
                const imageMediaKey = shotMediaKey(shot.shotId, "image");
                const videoMediaKey = shotMediaKey(shot.shotId, "video");
                const imageMediaDragOver =
                  dragOverShotMediaKey === imageMediaKey;
                const videoMediaDragOver =
                  dragOverShotMediaKey === videoMediaKey;
                const imageMediaUploading =
                  uploadingShotMedia.has(imageMediaKey);
                const videoMediaUploading =
                  uploadingShotMedia.has(videoMediaKey);
                const imageMediaUploadError =
                  shotMediaUploadErrors[imageMediaKey];
                const videoMediaUploadError =
                  shotMediaUploadErrors[videoMediaKey];
                const shotHasInFlightMedia =
                  isTaskInFlight(shot.imageTaskStatus) ||
                  isTaskInFlight(shot.videoTaskStatus);
                const promptReplacementWarning = shotHasInFlightMedia
                  ? " งาน render เดิมของช็อตนี้อาจยังทำต่อและอาจมีค่าใช้จ่าย แต่ระบบจะไม่ผูกผลนั้นกับ Prompt ใหม่"
                  : "";
                const storyEditable = storyEditAvailable;
                const shotPromptWorkerOperation =
                  props.state?.workerOperations?.find(
                    job =>
                      activeWorkerStatuses.includes(job.status) &&
                      (((job.operation === "staged_prompt_generation" ||
                        job.operation ===
                          "sequential_shot_prompt_generation") &&
                        job.shotId === shot.shotId) ||
                        (job.operation === "staged_bulk_generation" &&
                          job.targetShotIds?.includes(shot.shotId) === true))
                  ) ?? null;
                const shotVideoPromptWorkerOperation =
                  props.state?.workerOperations?.find(
                    job =>
                      activeWorkerStatuses.includes(job.status) &&
                      (((job.operation === "staged_prompt_generation" ||
                        job.operation ===
                          "sequential_shot_prompt_generation") &&
                        job.shotId === shot.shotId &&
                        job.targetStage === "video") ||
                        (job.operation === "staged_bulk_generation" &&
                          job.targetStage === "video" &&
                          job.targetPromptOnly === true &&
                          job.targetShotIds?.includes(shot.shotId) === true))
                  ) ?? null;
                const shotImageMediaWorkerOperation =
                  props.state?.workerOperations?.find(
                    job =>
                      job.operation === "staged_bulk_generation" &&
                      job.targetStage === "image" &&
                      job.targetPromptOnly !== true &&
                      job.targetShotIds?.includes(shot.shotId) === true
                  ) ?? null;
                return (
                  <article
                    key={shot.shotId}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">
                          Shot {String(shot.shotId).padStart(2, "0")}
                        </p>
                        <h4 className="mt-1 font-semibold text-slate-900">
                          {shot.title || `ช็อตที่ ${shot.shotId}`}
                        </h4>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {shotStateLabel(shot.state)}
                      </span>
                      {shotPromptWorkerOperation ? (
                        <span
                          className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800"
                          role="status"
                        >
                          {shotPromptWorkerOperation.operation ===
                          "staged_bulk_generation"
                            ? shotPromptWorkerOperation.targetStage === "image"
                              ? "สร้างภาพ"
                              : shotPromptWorkerOperation.targetStage ===
                                  "video"
                                ? shotPromptWorkerOperation.targetPromptOnly
                                  ? "Prompt วิดีโอ"
                                  : "สร้างวิดีโอ"
                                : "สร้าง Prompt และสื่อ"
                            : shotPromptWorkerOperation.targetStage === "image"
                              ? "Prompt ภาพ"
                              : shotPromptWorkerOperation.targetStage ===
                                  "video"
                                ? "Prompt วิดีโอ"
                                : "Prompt"}{" "}
                          {shotPromptWorkerOperation.status === "queued" ||
                          shotPromptWorkerOperation.status === "pending" ||
                          shotPromptWorkerOperation.status === "retry_scheduled"
                            ? "รอคิว Worker"
                            : "กำลังทำงานใน Worker"}
                          {shotPromptWorkerOperation.progress !== null &&
                          shotPromptWorkerOperation.progress !== undefined
                            ? ` · ${Math.round(shotPromptWorkerOperation.progress)}%`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                    {shot.visualSummary ? (
                      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                        {shot.visualSummary}
                      </p>
                    ) : null}
                    {/* Per-shot cast + look switching
                      (`planning/marketplace-four-character-cast/plan.md` §6),
                      mirroring the Vertical Drama storyboard shot card. */}
                    <StagedShotCharacterRow
                      shotId={shot.shotId}
                      roster={shotCastRoster}
                      castInShot={shot.castInShot}
                      castLooks={shot.castLooks}
                      supportingBeats={shot.supportingBeats}
                      lookSourcesByCharacterId={dramaLookSourcesByCharacterId}
                      readOnly={!props.onUpdateShotCast}
                      saving={savingShotCastForShot === shot.shotId}
                      onChangeCastInShot={handleChangeShotCastInShot}
                      onChangeCastLook={handleChangeShotCastLook}
                    />
                    {storyEditable ? (
                      <>
                        <label className="mt-2 block text-sm font-medium text-slate-800">
                          เรื่องราวช็อต
                          <textarea
                            className="mt-1 min-h-16 w-full rounded border p-2 text-sm font-normal"
                            value={drafts[storySummaryKey] ?? shot.storySummary}
                            onChange={event =>
                              setDrafts(prev => ({
                                ...prev,
                                [storySummaryKey]: event.target.value,
                              }))
                            }
                            disabled={props.pending}
                          />
                        </label>
                        <label className="mt-2 block text-sm font-medium text-slate-800">
                          บทพูด
                          <textarea
                            className="mt-1 min-h-12 w-full rounded border p-2 text-sm font-normal"
                            value={drafts[dialogueKey] ?? shot.dialogue}
                            onChange={event =>
                              setDrafts(prev => ({
                                ...prev,
                                [dialogueKey]: event.target.value,
                              }))
                            }
                            disabled={props.pending}
                          />
                        </label>
                        {(drafts[storySummaryKey] ?? shot.storySummary) !==
                          shot.storySummary ||
                        (drafts[dialogueKey] ?? shot.dialogue) !== shot.dialogue
                          ? action(
                              `edit-story-shot-${shot.shotId}`,
                              `บันทึกเรื่องและบทพูดช็อตที่ ${shot.shotId}`,
                              () =>
                                props.onEdit({
                                  shotId: shot.shotId,
                                  storySummary: drafts[storySummaryKey],
                                  dialogue: drafts[dialogueKey],
                                }),
                              "mt-2 rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                            )
                          : null}
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-slate-700">
                          {shot.storySummary}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          <span className="font-medium">บทพูด:</span>{" "}
                          {shot.dialogue}
                        </p>
                      </>
                    )}
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <label className="block text-sm font-medium text-slate-800">
                        <span className="flex items-center justify-between gap-2">
                          <span>Prompt ภาพ</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            {imageCheckpoint
                              ? checkpointStateLabel(imageCheckpoint.state)
                              : "รอสร้างหลังยืนยันเนื้อเรื่อง"}
                          </span>
                        </span>
                        <textarea
                          className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 p-3 text-xs font-normal outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
                          placeholder="ระบบจะแสดง Prompt ภาพของช็อตนี้เมื่อเนื้อเรื่องผ่านการยืนยัน"
                          value={
                            drafts[imageDraftKey] ?? shot.imagePrompt ?? ""
                          }
                          aria-label={`Prompt ภาพช็อตที่ ${shot.shotId}`}
                          onChange={event =>
                            setDrafts(prev => ({
                              ...prev,
                              [imageDraftKey]: event.target.value,
                            }))
                          }
                          disabled={
                            Boolean(
                              imageCheckpoint && !isEditable(imageCheckpoint)
                            ) || props.pending
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-800">
                        <span className="flex items-center justify-between gap-2">
                          <span>Prompt วิดีโอ</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            {videoCheckpoint
                              ? checkpointStateLabel(videoCheckpoint.state)
                              : "รอรับรองภาพก่อน"}
                          </span>
                        </span>
                        <textarea
                          className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 p-3 text-xs font-normal outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
                          placeholder="ระบบจะแสดง Prompt วิดีโอหลังรับรองภาพของช็อตนี้"
                          value={
                            drafts[videoDraftKey] ?? shot.videoPrompt ?? ""
                          }
                          aria-label={`Prompt วิดีโอช็อตที่ ${shot.shotId}`}
                          onChange={event =>
                            setDrafts(prev => ({
                              ...prev,
                              [videoDraftKey]: event.target.value,
                            }))
                          }
                          disabled={
                            Boolean(
                              videoCheckpoint && !isEditable(videoCheckpoint)
                            ) || props.pending
                          }
                        />
                      </label>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div
                        className={`overflow-hidden rounded-xl border bg-slate-50 transition-colors ${
                          imageMediaDragOver
                            ? "border-violet-500 ring-2 ring-violet-400/50"
                            : "border-slate-200"
                        }`}
                        onDragOver={event => {
                          event.preventDefault();
                          setDragOverShotMediaKey(imageMediaKey);
                        }}
                        onDragLeave={() =>
                          setDragOverShotMediaKey(current =>
                            current === imageMediaKey ? null : current
                          )
                        }
                        onDrop={event => {
                          event.preventDefault();
                          setDragOverShotMediaKey(current =>
                            current === imageMediaKey ? null : current
                          );
                          const file = event.dataTransfer.files?.[0];
                          if (file)
                            void handleShotMediaFile(
                              shot.shotId,
                              "image",
                              file
                            );
                        }}
                        data-testid={`staged-shot-image-drop-${shot.shotId}`}
                        aria-busy={imageMediaUploading}
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                          <span>ภาพ / เฟรมอ้างอิง</span>
                          <span className="flex items-center gap-2">
                            <span className="font-normal text-slate-500">
                              {mediaTaskStatusLabel(shot.imageTaskStatus) ||
                                (shot.imageArtifactUrl
                                  ? "มีผลลัพธ์"
                                  : "ยังไม่มีภาพ")}
                            </span>
                            <button
                              type="button"
                              id={`upload-image-${shot.shotId}`}
                              onClick={() =>
                                imageFileInputRefs.current
                                  .get(shot.shotId)
                                  ?.click()
                              }
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 cursor-pointer"
                              title={`อัปโหลดไฟล์แทนที่ภาพช็อตที่ ${shot.shotId}`}
                              aria-label={`อัปโหลดไฟล์แทนที่ภาพช็อตที่ ${shot.shotId}`}
                            >
                              📤 อัปโหลดไฟล์แทน
                            </button>
                            <input
                              ref={el => {
                                if (el)
                                  imageFileInputRefs.current.set(
                                    shot.shotId,
                                    el
                                  );
                              }}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              data-testid={`staged-shot-image-file-input-${shot.shotId}`}
                              onChange={event => {
                                const file = event.target.files?.[0] ?? null;
                                event.target.value = "";
                                if (file)
                                  void handleShotMediaFile(
                                    shot.shotId,
                                    "image",
                                    file
                                  );
                              }}
                            />
                          </span>
                        </div>
                        <div className="relative">
                          {shot.imageArtifactUrl &&
                          !failedMediaUrls[shot.imageArtifactUrl] ? (
                            <div className="group relative">
                              <AuthenticatedMediaImage
                                src={shot.imageArtifactUrl}
                                alt={`ผลภาพช็อตที่ ${shot.shotId}`}
                                className="aspect-[9/16] max-h-[22rem] w-full object-contain cursor-zoom-in"
                                onError={() =>
                                  setFailedMediaUrls(current => ({
                                    ...current,
                                    [shot.imageArtifactUrl!]: true,
                                  }))
                                }
                                onClick={() => {
                                  setLightboxUrl(shot.imageArtifactUrl!);
                                  setLightboxType("image");
                                }}
                              />
                              {!isTaskInFlight(shot.imageTaskStatus) && (
                                <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3">
                                  <div className="flex gap-2 flex-wrap justify-center">
                                    <button
                                      id={`fullscreen-image-${shot.shotId}`}
                                      onClick={() => {
                                        setLightboxUrl(shot.imageArtifactUrl!);
                                        setLightboxType("image");
                                      }}
                                      className="rounded-lg bg-white/90 hover:bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-lg transition flex items-center gap-1 cursor-pointer"
                                      title="ขยายภาพเต็มจอ"
                                    >
                                      🔍 ขยายภาพ
                                    </button>
                                    <a
                                      id={`download-image-${shot.shotId}`}
                                      href={shot.imageArtifactUrl}
                                      download={`shot-${shot.shotId}-image.jpg`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-lg bg-white/90 hover:bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-lg transition flex items-center gap-1 cursor-pointer no-underline"
                                      title="ดาวน์โหลดภาพ"
                                    >
                                      ⬇️ ดาวน์โหลด
                                    </a>
                                    {action(
                                      `dispatch-image-${shot.shotId}`,
                                      "🔄 สร้างใหม่",
                                      () =>
                                        props.onGenerateAndDispatch({
                                          shotId: shot.shotId,
                                          stage: "image",
                                          model: selectedImageModel,
                                          replaceExisting: true,
                                        }),
                                      "rounded-lg bg-white/90 hover:bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-lg transition flex items-center gap-1.5 cursor-pointer",
                                      {
                                        disabled: !selectedImageModelAvailable,
                                        confirmation: {
                                          title: `ยืนยันสร้างภาพช็อตที่ ${shot.shotId} ใหม่`,
                                          description: `ระบบจะส่งงานสร้างภาพช็อตที่ ${shot.shotId} ใหม่เข้า Worker Jobs โดยใช้โมเดล ${selectedImageModel} และอาจใช้เครดิต`,
                                        },
                                        title: "สร้างภาพใหม่",
                                      }
                                    )}
                                  </div>
                                </div>
                              )}
                              {isTaskInFlight(shot.imageTaskStatus) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                  <span className="text-white text-xs font-medium animate-pulse">
                                    ⏳ กำลังสร้างใหม่...
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex min-h-48 flex-col items-center justify-center p-5 text-center text-xs leading-5 text-slate-600 bg-violet-50/50 space-y-3">
                              {shot.imageArtifactUrl &&
                              failedMediaUrls[shot.imageArtifactUrl] ? (
                                <p className="text-amber-700 font-medium">
                                  ไฟล์ภาพเดิมหมดอายุหรือเปิดไม่ได้แล้ว
                                  กรุณาสร้างใหม่หรืออัปโหลดภาพแทน
                                </p>
                              ) : isTaskInFlight(shot.imageTaskStatus) ? (
                                <div className="flex items-center gap-2 font-medium text-violet-700 animate-pulse">
                                  <span>
                                    ⏳ กำลังประมวลผลสร้างภาพด้วย AI...
                                  </span>
                                </div>
                              ) : shotImageMediaWorkerOperation &&
                                [
                                  "pending",
                                  "queued",
                                  "leased",
                                  "claimed",
                                  "preparing",
                                  "running",
                                  "waiting_external",
                                  "retry_scheduled",
                                ].includes(
                                  shotImageMediaWorkerOperation.status
                                ) ? (
                                <p
                                  className="font-medium text-violet-800"
                                  role="status"
                                >
                                  {shotImageMediaWorkerOperation.status ===
                                    "queued" ||
                                  shotImageMediaWorkerOperation.status ===
                                    "pending"
                                    ? "ส่งงานสร้างภาพแล้ว — รอคิว Worker"
                                    : "Worker กำลังสร้างภาพช็อตนี้"}
                                </p>
                              ) : shotImageMediaWorkerOperation?.status ===
                                "failed" ? (
                                <p
                                  className="font-medium text-red-700"
                                  role="alert"
                                >
                                  งานสร้างภาพใน Worker ไม่สำเร็จ
                                  กดสร้างภาพอีกครั้งเพื่อส่งงานใหม่
                                </p>
                              ) : imageCheckpoint && imageCorrectionApplies ? (
                                <p
                                  className="text-amber-800 font-medium"
                                  role="status"
                                >
                                  {correctionSafeMessage(
                                    imageCorrection?.reasonCode
                                  )}
                                </p>
                              ) : imageCheckpoint &&
                                isTaskFailed(shot.imageTaskStatus) ? (
                                <p
                                  className="text-amber-800 font-medium"
                                  role="status"
                                >
                                  งานสร้างภาพช็อตนี้ไม่สำเร็จ
                                  กดปุ่มสร้างภาพด้านล่างเพื่อส่งใหม่
                                </p>
                              ) : imageCheckpoint ? (
                                <p className="text-violet-900 font-medium">
                                  Prompt พร้อมแล้ว
                                  กดปุ่มสร้างภาพด้านล่างเพื่อส่งงานเข้า Worker
                                  และรอผลที่นี่
                                </p>
                              ) : (
                                <>
                                  <p className="text-slate-600 text-xs">
                                    ภาพของช็อตนี้จะแสดงที่นี่หลังจากกดยืนยันสร้างภาพ
                                  </p>
                                  <p className="text-slate-600 text-[11px]">
                                    หรือลากไฟล์ภาพมาวางที่นี่ / กด "📤
                                    อัปโหลดไฟล์แทน" เพื่อใช้ภาพของคุณเอง
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                          {imageMediaDragOver && !imageMediaUploading ? (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-violet-900/70 p-4 text-center">
                              <p className="text-sm font-semibold text-white">
                                ลากไฟล์ภาพมาวางที่นี่ เพื่อแทนที่
                              </p>
                            </div>
                          ) : null}
                          {imageMediaUploading ? (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
                              <span className="text-xs font-medium text-white animate-pulse">
                                📤 กำลังอัปโหลด...
                              </span>
                            </div>
                          ) : null}
                        </div>
                        {imageMediaUploadError ? (
                          <p
                            className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                            role="alert"
                          >
                            {imageMediaUploadError}
                          </p>
                        ) : null}
                      </div>
                      <div
                        className={`overflow-hidden rounded-xl border bg-slate-50 transition-colors ${
                          videoMediaDragOver
                            ? "border-sky-500 ring-2 ring-sky-400/50"
                            : "border-slate-200"
                        }`}
                        onDragOver={event => {
                          event.preventDefault();
                          setDragOverShotMediaKey(videoMediaKey);
                        }}
                        onDragLeave={() =>
                          setDragOverShotMediaKey(current =>
                            current === videoMediaKey ? null : current
                          )
                        }
                        onDrop={event => {
                          event.preventDefault();
                          setDragOverShotMediaKey(current =>
                            current === videoMediaKey ? null : current
                          );
                          const file = event.dataTransfer.files?.[0];
                          if (file)
                            void handleShotMediaFile(
                              shot.shotId,
                              "video",
                              file
                            );
                        }}
                        data-testid={`staged-shot-video-drop-${shot.shotId}`}
                        aria-busy={videoMediaUploading}
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                          <span>วิดีโอรายช็อต</span>
                          <span className="flex items-center gap-2">
                            <span className="font-normal text-slate-500">
                              {shotVideoPromptWorkerOperation
                                ? "กำลังสร้าง Prompt วิดีโอ (ยังไม่ render)"
                                : mediaTaskStatusLabel(shot.videoTaskStatus) ||
                                  (shot.videoArtifactUrl
                                    ? "มีผลลัพธ์"
                                    : "ยังไม่มีวิดีโอ")}
                            </span>
                            <button
                              type="button"
                              id={`upload-video-${shot.shotId}`}
                              onClick={() =>
                                videoFileInputRefs.current
                                  .get(shot.shotId)
                                  ?.click()
                              }
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 cursor-pointer"
                              title={`อัปโหลดไฟล์แทนที่วิดีโอช็อตที่ ${shot.shotId}`}
                              aria-label={`อัปโหลดไฟล์แทนที่วิดีโอช็อตที่ ${shot.shotId}`}
                            >
                              📤 อัปโหลดไฟล์แทน
                            </button>
                            <input
                              ref={el => {
                                if (el)
                                  videoFileInputRefs.current.set(
                                    shot.shotId,
                                    el
                                  );
                              }}
                              type="file"
                              accept="video/*"
                              className="hidden"
                              data-testid={`staged-shot-video-file-input-${shot.shotId}`}
                              onChange={event => {
                                const file = event.target.files?.[0] ?? null;
                                event.target.value = "";
                                if (file)
                                  void handleShotMediaFile(
                                    shot.shotId,
                                    "video",
                                    file
                                  );
                              }}
                            />
                          </span>
                        </div>
                        <div className="relative">
                          {shot.videoArtifactUrl &&
                          !failedMediaUrls[shot.videoArtifactUrl] ? (
                            <div className="group relative">
                              <video
                                className="aspect-[9/16] max-h-[22rem] w-full object-contain"
                                controls
                                preload="metadata"
                                src={shot.videoArtifactUrl}
                                onError={() =>
                                  setFailedMediaUrls(current => ({
                                    ...current,
                                    [shot.videoArtifactUrl!]: true,
                                  }))
                                }
                                aria-label={`ผลวิดีโอช็อตที่ ${shot.shotId}`}
                              />
                              {!isTaskInFlight(shot.videoTaskStatus) && (
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                  <button
                                    id={`fullscreen-video-${shot.shotId}`}
                                    onClick={() => {
                                      setLightboxUrl(shot.videoArtifactUrl!);
                                      setLightboxType("video");
                                    }}
                                    className="rounded-lg bg-white/90 hover:bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 shadow-lg transition flex items-center gap-1 cursor-pointer"
                                    title="ขยายวิดีโอ"
                                  >
                                    🔍 ขยาย
                                  </button>
                                  <a
                                    id={`download-video-${shot.shotId}`}
                                    href={shot.videoArtifactUrl}
                                    download={`shot-${shot.shotId}-video.mp4`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg bg-white/90 hover:bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 shadow-lg transition flex items-center gap-1 cursor-pointer no-underline"
                                    title="ดาวน์โหลดวิดีโอ"
                                  >
                                    ⬇️ ดาวน์โหลด
                                  </a>
                                  <button
                                    id={`regen-video-${shot.shotId}`}
                                    disabled={
                                      !selectedVideoModelAvailable ||
                                      props.pending
                                    }
                                    onClick={() =>
                                      props.onRetry({
                                        shotId: shot.shotId,
                                        stage: "video",
                                        model: selectedVideoModel,
                                        autoApprove: true,
                                      })
                                    }
                                    className="rounded-lg bg-white/90 hover:bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                                    title="สร้างวิดีโอใหม่"
                                  >
                                    🔄 สร้างใหม่
                                  </button>
                                </div>
                              )}
                              {isTaskInFlight(shot.videoTaskStatus) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                  <span className="text-white text-xs font-medium animate-pulse">
                                    🎬 กำลังสร้างใหม่...
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex min-h-48 flex-col items-center justify-center p-5 text-center text-xs leading-5 text-slate-600 bg-sky-50/50 space-y-3">
                              {shot.videoArtifactUrl &&
                              failedMediaUrls[shot.videoArtifactUrl] ? (
                                <p className="text-amber-700 font-medium">
                                  ไฟล์วิดีโอเดิมหมดอายุหรือเปิดไม่ได้แล้ว
                                  กรุณาสร้างใหม่หรืออัปโหลดวิดีโอแทน
                                </p>
                              ) : shotVideoPromptWorkerOperation ? (
                                <div
                                  className="space-y-1 font-medium text-sky-700"
                                  role="status"
                                >
                                  <p className="animate-pulse">
                                    ✍️ กำลังสร้าง Prompt วิดีโอใน Worker —
                                    งานนี้ยังไม่ส่ง render
                                  </p>
                                  {isTaskInFlight(shot.videoTaskStatus) ? (
                                    <p className="text-[11px] font-normal text-amber-700">
                                      มีงาน render
                                      วิดีโอเดิมที่ส่งไว้ก่อนหน้านี้กำลังทำงานอยู่
                                    </p>
                                  ) : null}
                                </div>
                              ) : isTaskInFlight(shot.videoTaskStatus) ? (
                                <div className="flex items-center gap-2 font-medium text-sky-700 animate-pulse">
                                  <span>🎬 กำลังเรนเดอร์วิดีโอด้วย AI...</span>
                                </div>
                              ) : videoCheckpoint ? (
                                // Checkpoint is approved/consumed but advance
                                // failed. No button here anymore — mirrors the
                                // same fix on the image side above (this used to
                                // duplicate the one action-bar button below the
                                // video); just point down to it.
                                <p className="text-amber-700 font-medium">
                                  ระบบส่งงานสร้างวิดีโอค้างอยู่ — กดปุ่ม
                                  "สร้างวิดีโอช็อตที่ {shot.shotId}"
                                  ด้านล่างเพื่อสั่งใหม่
                                </p>
                              ) : (
                                <>
                                  <p className="text-slate-600 text-xs">
                                    วิดีโอของช็อตนี้จะแสดงที่นี่หลังจากยืนยัน
                                    Prompt วิดีโอ
                                  </p>
                                  <p className="text-slate-600 text-[11px]">
                                    หรือลากไฟล์วิดีโอมาวางที่นี่ / กด "📤
                                    อัปโหลดไฟล์แทน" เพื่อใช้วิดีโอของคุณเอง
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                          {videoMediaDragOver && !videoMediaUploading ? (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-sky-900/70 p-4 text-center">
                              <p className="text-sm font-semibold text-white">
                                ลากไฟล์วิดีโอมาวางที่นี่ เพื่อแทนที่
                              </p>
                            </div>
                          ) : null}
                          {videoMediaUploading ? (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
                              <span className="text-xs font-medium text-white animate-pulse">
                                📤 กำลังอัปโหลด...
                              </span>
                            </div>
                          ) : null}
                        </div>
                        {videoMediaUploadError ? (
                          <p
                            className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                            role="alert"
                          >
                            {videoMediaUploadError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      {[
                        imageCheckpoint,
                        imageResultCheckpoint,
                        videoCheckpoint,
                        videoResultCheckpoint,
                      ]
                        .filter(Boolean)
                        .map(checkpoint => (
                          <span
                            key={checkpoint!.checkpointId}
                            className="rounded bg-slate-100 px-2 py-1"
                          >
                            {checkpointLabel(checkpoint!)}: {checkpoint!.state}
                            {checkpoint!.estimatedCredits
                              ? ` · ~${checkpoint!.estimatedCredits} เครดิต`
                              : ""}
                          </span>
                        ))}
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <section
                        className="rounded-xl border border-violet-200 bg-violet-50/60 p-3"
                        aria-label={`การทำงานภาพช็อตที่ ${shot.shotId}`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-700">
                          1 · Prompt ภาพ → ภาพ / เฟรมอ้างอิง
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          เลือกเอง: สร้าง Prompt → ปรับปรุงตามต้องการ →
                          กดสร้างภาพเพื่อใช้เครดิต
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {/* Prompt authoring is available even when a legacy
                            run has no prompt checkpoint yet. */}
                          {action(
                            `generate-prompt-image-${shot.shotId}`,
                            `สร้าง Prompt ภาพช็อตที่ ${shot.shotId}`,
                            () =>
                              props.onGeneratePrompt({
                                shotId: shot.shotId,
                                stage: "image",
                                ...(promptModel ? { model: promptModel } : {}),
                              }),
                            "rounded border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-800",
                            {
                              // Prompt authoring is independent of an already
                              // running media render; the replacement detaches
                              // that render from this shot to prevent stale media
                              // from being attached to the new prompt.
                              disabled: isShotPromptPipelineBusy(shot.shotId),
                              confirmation: {
                                title: `ยืนยันสร้าง Prompt ภาพช็อตที่ ${shot.shotId}`,
                                description: `ระบบจะส่งการสร้าง Prompt ภาพช็อตที่ ${shot.shotId} เข้า Worker Jobs โดยใช้โมเดล ${promptModel ?? "อัตโนมัติ"}${promptReplacementWarning}`,
                              },
                              title: isShotPromptPipelineBusy(shot.shotId)
                                ? "Prompt ของช็อตนี้กำลังรอหรือทำงานใน Worker"
                                : undefined,
                            }
                          )}
                          {/* Step 2/3 — same AI-instruction dialog as before
                            (mechanics/data-testids unchanged), relabeled per
                            the user's requested wording. */}
                          {action(
                            `ai-instruction-image-${shot.shotId}`,
                            `ปรับปรุง Prompt ภาพช็อตที่ ${shot.shotId} ด้วยคำสั่ง`,
                            () => {
                              setAiInstructionText("");
                              setAiInstructionDialog({
                                shotId: shot.shotId,
                                stage: "image",
                              });
                            },
                            "rounded border border-dashed border-purple-400 bg-purple-100 px-3 py-2 text-sm text-purple-800",
                            {
                              disabled: isShotPromptPipelineBusy(shot.shotId),
                            }
                          )}
                          {/* Dispatch the saved prompt through the dedicated
                            Worker Jobs operation. This is shot-scoped, so a
                            queued image never blocks sibling shots. */}
                          {action(
                            `dispatch-image-${shot.shotId}`,
                            `สร้างภาพช็อตที่ ${shot.shotId}`,
                            () =>
                              props.onGenerateAndDispatch({
                                shotId: shot.shotId,
                                stage: "image",
                                model: selectedImageModel,
                                replaceExisting: true,
                              }),
                            "rounded-lg px-3.5 py-2 text-sm font-semibold shadow-xs transition",
                            {
                              disabled:
                                !selectedImageModelAvailable ||
                                !shot.imagePrompt?.trim() ||
                                isTaskInFlight(shot.imageTaskStatus) ||
                                isTaskInFlight(shot.videoTaskStatus) ||
                                isShotPromptPipelineBusy(shot.shotId),
                              confirmation: {
                                title: `ยืนยันสร้างภาพช็อตที่ ${shot.shotId}`,
                                description: `ระบบจะส่งงานสร้างภาพช็อตที่ ${shot.shotId} เข้า Worker Jobs โดยใช้โมเดล ${selectedImageModel} และอาจใช้เครดิต`,
                              },
                              title: !shot.imagePrompt?.trim()
                                ? "สร้าง Prompt ภาพก่อน"
                                : !selectedImageModelAvailable
                                  ? "เลือกโมเดลภาพที่มีอยู่ก่อนส่งงาน"
                                  : isTaskInFlight(shot.imageTaskStatus) ||
                                        isTaskInFlight(shot.videoTaskStatus)
                                      ? "รอให้งานของช็อตนี้เสร็จก่อน"
                                      : undefined,
                            }
                          )}
                          {/* image_prompt now auto-approves at construction —
                            no approve click left to trigger; reject stays. */}
                          {imageCheckpoint?.state === "awaiting"
                            ? action(
                                `reject-image-${shot.shotId}`,
                                `ขอแก้ Prompt ภาพช็อตที่ ${shot.shotId}`,
                                () => props.onReject(imageCheckpoint)
                              )
                            : null}
                          {(!imageCheckpoint || isEditable(imageCheckpoint)) &&
                          (drafts[imageDraftKey] ?? shot.imagePrompt ?? "") !==
                            (shot.imagePrompt ?? "")
                            ? action(
                                `edit-image-${shot.shotId}`,
                                `บันทึก Prompt ภาพช็อตที่ ${shot.shotId}`,
                                () =>
                                  props.onEdit({
                                    shotId: shot.shotId,
                                    imagePrompt: drafts[imageDraftKey],
                                  }),
                                "rounded border border-slate-700 px-3 py-2 text-sm"
                              )
                            : null}
                          {/* image_result now auto-approves at construction —
                            no approve click left to trigger; reject stays. */}
                          {imageResultCheckpoint?.state === "awaiting"
                            ? action(
                                `reject-image-result-${shot.shotId}`,
                                `ปฏิเสธผลภาพช็อตที่ ${shot.shotId}`,
                                () => props.onReject(imageResultCheckpoint)
                              )
                            : null}
                        </div>
                      </section>
                      <section
                        className="rounded-xl border border-sky-200 bg-sky-50/60 p-3"
                        aria-label={`การทำงานวิดีโอช็อตที่ ${shot.shotId}`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
                          2 · Prompt วิดีโอ → วิดีโอรายช็อต
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          สร้าง Prompt โดยตรวจจับคนจากภาพที่อนุมัติแล้ว →
                          ปรับปรุงตามต้องการ →
                          กดสร้างวิดีโอแยกต่างหากเพื่อใช้เครดิต
                        </p>
                        {!shot.imageArtifactHash ||
                        !shot.imageArtifactUrl ||
                        imageResultCheckpoint?.state !== "approved" ||
                        imageResultCheckpoint?.contentHash !==
                          shot.imageArtifactHash ? (
                          <p className="mt-2 text-xs font-medium text-amber-800" role="status">
                            ขั้นตอนถัดไป: สร้างภาพช็อตนี้และรอให้ระบบอนุมัติ
                            เพื่อให้ AI ตรวจตำแหน่งคนและจับคู่กับบทพูดได้
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {/* Split back out into 3 explicit steps, mirroring
                            the image section above — same user directive. */}
                          {action(
                            `generate-prompt-video-${shot.shotId}`,
                            `สร้าง Prompt วิดีโอช็อตที่ ${shot.shotId}`,
                            () =>
                              props.onGeneratePrompt({
                                shotId: shot.shotId,
                                stage: "video",
                                ...(promptModel ? { model: promptModel } : {}),
                              }),
                          "rounded border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-800",
                          {
                            disabled:
                              isShotPromptPipelineBusy(shot.shotId) ||
                              !shot.imageArtifactHash ||
                              !shot.imageArtifactUrl ||
                              imageResultCheckpoint?.state !== "approved" ||
                              imageResultCheckpoint?.contentHash !==
                                shot.imageArtifactHash,
                              confirmation: {
                                title: `ยืนยันสร้าง Prompt วิดีโอช็อตที่ ${shot.shotId}`,
                                description: `ระบบจะส่งการสร้าง Prompt วิดีโอช็อตที่ ${shot.shotId} เข้า Worker Jobs โดยใช้โมเดล ${promptModel ?? "อัตโนมัติ"}${promptReplacementWarning}`,
                              },
                              title: isShotPromptPipelineBusy(shot.shotId)
                                ? "Prompt ของช็อตนี้กำลังรอหรือทำงานใน Worker"
                                : !shot.imageArtifactHash ||
                                    !shot.imageArtifactUrl ||
                                    imageResultCheckpoint?.state !== "approved" ||
                                    imageResultCheckpoint?.contentHash !==
                                      shot.imageArtifactHash
                                  ? "ต้องสร้างและอนุมัติภาพช็อตนี้ก่อน เพื่อให้ระบบตรวจจับคนและจับคู่ผู้พูด"
                                  : shotHasInFlightMedia
                                    ? "สร้าง Prompt แยกได้ทันที; ผล render เดิมจะไม่ผูกกับ Prompt ใหม่"
                                    : undefined,
                            }
                          )}
                          {/* Step 2/3 — existing AI-instruction dialog,
                            relabeled per the user's requested wording. */}
                          {action(
                            `ai-instruction-video-${shot.shotId}`,
                            `ปรับปรุง Prompt วิดีโอช็อตที่ ${shot.shotId} ด้วยคำสั่ง`,
                            () => {
                              setAiInstructionText("");
                              setAiInstructionDialog({
                                shotId: shot.shotId,
                                stage: "video",
                              });
                            },
                            "rounded border border-dashed border-purple-400 bg-purple-100 px-3 py-2 text-sm text-purple-800",
                            {
                              disabled: isShotPromptPipelineBusy(shot.shotId),
                            }
                          )}
                          {/* Video rendering consumes the approved image and saved
                            video prompt; it remains a separate explicit action. */}
                          {action(
                            `dispatch-video-${shot.shotId}`,
                            `สร้างวิดีโอช็อตที่ ${shot.shotId}`,
                            () =>
                              props.onGenerateAndDispatch({
                                shotId: shot.shotId,
                                stage: "video",
                                model: selectedVideoModel,
                                replaceExisting: true,
                              }),
                            "rounded-lg bg-sky-700 hover:bg-sky-800 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition",
                            {
                              disabled:
                                !selectedVideoModelAvailable ||
                                !shot.videoPrompt?.trim() ||
                                !shot.imageArtifactHash ||
                                imageResultCheckpoint?.state !== "approved" ||
                                isTaskInFlight(shot.imageTaskStatus) ||
                                isTaskInFlight(shot.videoTaskStatus) ||
                                isShotPromptPipelineBusy(shot.shotId),
                              confirmation: {
                                title: `ยืนยันสร้างวิดีโอช็อตที่ ${shot.shotId}`,
                                description: `ระบบจะส่งงานสร้างวิดีโอช็อตที่ ${shot.shotId} เข้า Worker Jobs โดยใช้โมเดล ${selectedVideoModel} และอาจใช้เครดิต`,
                              },
                              title: !shot.videoPrompt?.trim()
                                ? "สร้าง Prompt วิดีโอก่อน"
                                : !selectedVideoModelAvailable
                                  ? "เลือกโมเดลวิดีโอที่มีอยู่ก่อนส่งงาน"
                                  : !shot.imageArtifactHash ||
                                        imageResultCheckpoint?.state !==
                                          "approved"
                                      ? "ต้องสร้างและอนุมัติภาพของช็อตนี้ก่อน"
                                      : isTaskInFlight(shot.imageTaskStatus) ||
                                          isTaskInFlight(shot.videoTaskStatus)
                                        ? "รอให้งานวิดีโอของช็อตนี้เสร็จก่อน"
                                        : undefined,
                            }
                          )}
                          {/* video_prompt now auto-approves at construction —
                            no approve click left to trigger; reject stays. */}
                          {videoCheckpoint?.state === "awaiting"
                            ? action(
                                `reject-video-${shot.shotId}`,
                                `ขอแก้ Prompt วิดีโอช็อตที่ ${shot.shotId}`,
                                () => props.onReject(videoCheckpoint)
                              )
                            : null}
                          {(!videoCheckpoint || isEditable(videoCheckpoint)) &&
                          (drafts[videoDraftKey] ?? shot.videoPrompt ?? "") !==
                            (shot.videoPrompt ?? "")
                            ? action(
                                `edit-video-${shot.shotId}`,
                                `บันทึก Prompt วิดีโอช็อตที่ ${shot.shotId}`,
                                () =>
                                  props.onEdit({
                                    shotId: shot.shotId,
                                    videoPrompt: drafts[videoDraftKey],
                                  }),
                                "rounded border border-slate-700 px-3 py-2 text-sm"
                              )
                            : null}
                          {/* video_result now auto-approves at construction —
                            no approve click left to trigger; reject stays. */}
                          {videoResultCheckpoint?.state === "awaiting"
                            ? action(
                                `reject-video-result-${shot.shotId}`,
                                `ปฏิเสธผลวิดีโอช็อตที่ ${shot.shotId}`,
                                () => props.onReject(videoResultCheckpoint)
                              )
                            : null}
                        </div>
                      </section>
                    </div>
                  </article>
                );
                  })}
            </div>
          </>
        ) : null}
      </section>

      {/* ── Lightbox Modal ────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          id="staged-lightbox-overlay"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="ดูภาพเต็มจอ"
          onKeyDown={e => {
            if (e.key === "Escape") setLightboxUrl(null);
          }}
          tabIndex={-1}
        >
          <div
            className="relative flex flex-col items-center max-h-screen max-w-[90vw] gap-3"
            onClick={e => e.stopPropagation()}
          >
            {/* Top action bar */}
            <div className="flex items-center gap-2">
              <a
                href={lightboxUrl}
                download={
                  lightboxType === "image" ? "shot-image.jpg" : "shot-video.mp4"
                }
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-lg hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer no-underline"
                onClick={e => e.stopPropagation()}
              >
                ⬇️ ดาวน์โหลด
              </a>
              <button
                id="lightbox-close"
                className="rounded-lg bg-white/20 hover:bg-white/40 px-4 py-2 text-sm font-bold text-white shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                onClick={() => setLightboxUrl(null)}
                aria-label="ปิด"
              >
                ✕ ปิด
              </button>
            </div>

            {/* Media */}
            {lightboxType === "image" ? (
              <AuthenticatedMediaImage
                src={lightboxUrl}
                alt="ภาพขนาดเต็ม"
                className="max-h-[82vh] max-w-[88vw] rounded-xl shadow-2xl object-contain"
              />
            ) : (
              <video
                src={lightboxUrl}
                controls
                autoPlay
                className="max-h-[82vh] max-w-[88vw] rounded-xl shadow-2xl object-contain"
              />
            )}
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(generationConfirmation)}
        onOpenChange={open => {
          if (!open && generationConfirmation) {
            const canceledConfirmation = generationConfirmation;
            setGenerationConfirmation(null);
            canceledConfirmation.onCancel?.();
          }
        }}
      >
        <DialogContent
          aria-describedby="staged-generation-confirmation-desc"
          data-testid="staged-generation-confirmation-dialog"
        >
          <DialogHeader>
            <DialogTitle>{generationConfirmation?.title}</DialogTitle>
            <DialogDescription id="staged-generation-confirmation-desc">
              {generationConfirmation?.description}{" "}
              ยืนยันแล้วระบบจะส่งงานเข้าคิวเบื้องหลัง
              และป้องกันการส่งคำสั่งเดิมซ้ำระหว่างเริ่มทำงาน
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              data-testid="staged-generation-confirm-cancel"
              onClick={() => {
                if (!generationConfirmation) return;
                const canceledConfirmation = generationConfirmation;
                setGenerationConfirmation(null);
                canceledConfirmation.onCancel?.();
              }}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="min-h-11 rounded bg-sky-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-700 disabled:opacity-100"
              data-testid="staged-generation-confirm-submit"
              disabled={!generationConfirmation}
              onClick={() => {
                if (!generationConfirmation) return;
                const confirmedAction = generationConfirmation;
                if (
                  confirmedGenerationActionIdsRef.current.has(
                    confirmedAction.id
                  )
                ) {
                  return;
                }
                confirmedGenerationActionIdsRef.current.add(confirmedAction.id);
                setLocallyLockedGenerationActions(current =>
                  new Set(current).add(confirmedAction.id)
                );
                generationActionLockTimersRef.current.set(
                  confirmedAction.id,
                  setTimeout(
                    () => releaseGenerationActionLock(confirmedAction.id),
                    10_000
                  )
                );
                setGenerationConfirmation(null);
                try {
                  confirmedAction.callback();
                } catch (error) {
                  releaseGenerationActionLock(confirmedAction.id);
                  throw error;
                }
              }}
            >
              ยืนยันและส่งเข้าคิว
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI ปรับแต่งด้วยคำสั่งเพิ่มเติม ──────────────────────────────────
        Per-shot free-text instruction that threads into the NEXT image/video
        prompt regeneration for that specific shot only (backend field:
        generateStagedAutoReviewShotPrompt's `instruction`,
        server/routers/marketplaceCapture.ts). One shared dialog instance
        keyed by aiInstructionDialog rather than one per shot, so up to 9
        shots don't each mount their own DOM subtree. */}
      <Dialog
        open={Boolean(aiInstructionDialog)}
        onOpenChange={open => {
          if (!open) setAiInstructionDialog(null);
        }}
      >
        <DialogContent aria-describedby="staged-ai-instruction-desc">
          <DialogHeader>
            <DialogTitle>
              {aiInstructionDialog?.stage === "video"
                ? `AI ปรับแต่ง Prompt วิดีโอช็อตที่ ${aiInstructionDialog?.shotId} ด้วยคำสั่งเพิ่มเติม`
                : `AI ปรับแต่ง Prompt ภาพช็อตที่ ${aiInstructionDialog?.shotId} ด้วยคำสั่งเพิ่มเติม`}
            </DialogTitle>
            <DialogDescription id="staged-ai-instruction-desc">
              บอกสิ่งที่ต้องการเพิ่มหรือแก้ในช็อตนี้ — AI
              จะนำคำสั่งนี้ไปใช้ตอนสร้าง Prompt รอบถัดไปของช็อตนี้เท่านั้น
              ไม่แก้เรื่องย่อของช็อต
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                placeholder="เช่น มีเด็กชาวไทยอายุ 8 เดือนในฉาก"
                value={aiInstructionText}
                onChange={event => setAiInstructionText(event.target.value)}
                aria-label="คำสั่งเพิ่มเติมสำหรับ AI"
                data-testid="staged-ai-instruction-textarea"
                autoFocus
              />
              <div className="flex justify-end">
                <span
                  className={`text-[11px] tabular-nums ${
                    aiInstructionText.length > AI_PROMPT_INSTRUCTION_MAX_CHARS
                      ? "font-medium text-red-600"
                      : "text-slate-500"
                  }`}
                >
                  {aiInstructionText.length.toLocaleString()} /{" "}
                  {AI_PROMPT_INSTRUCTION_MAX_CHARS.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500">
                ตัวอย่าง (คลิกเพื่อใส่)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {AI_PROMPT_INSTRUCTION_EXAMPLES.map((example, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() =>
                      setAiInstructionText(prev => {
                        const trimmed = prev.trimEnd();
                        return trimmed ? `${trimmed} ${example}` : example;
                      })
                    }
                    className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-purple-300 bg-purple-50 px-2.5 py-1 text-left text-[11px] leading-snug text-purple-700 transition-colors hover:border-purple-400 hover:bg-purple-100"
                    data-testid={`staged-ai-instruction-example-${index}`}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              onClick={() => setAiInstructionDialog(null)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="rounded bg-purple-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-90"
              disabled={
                !aiInstructionText.trim() ||
                aiInstructionText.length > AI_PROMPT_INSTRUCTION_MAX_CHARS ||
                Boolean(props.pending)
              }
              data-testid="staged-ai-instruction-submit"
              onClick={() => {
                if (!aiInstructionDialog || !aiInstructionText.trim()) return;
                const nextPrompt = {
                  shotId: aiInstructionDialog.shotId,
                  stage: aiInstructionDialog.stage,
                  ...(promptModel ? { model: promptModel } : {}),
                  instruction: aiInstructionText.trim(),
                };
                const returnToInstructionDialog = aiInstructionDialog;
                setAiInstructionDialog(null);
                setGenerationConfirmation({
                  id: `generate-prompt-${nextPrompt.stage}-${nextPrompt.shotId}`,
                  title: `ยืนยันสร้าง Prompt ${nextPrompt.stage === "image" ? "ภาพ" : "วิดีโอ"}ช็อตที่ ${nextPrompt.shotId}`,
                  description: `ระบบจะส่งการสร้าง Prompt ช็อตที่ ${nextPrompt.shotId} พร้อมคำสั่งเพิ่มเติมเข้า Worker Jobs โดยใช้โมเดล ${promptModel ?? "อัตโนมัติ"}`,
                  callback: () => {
                    props.onGeneratePrompt(nextPrompt);
                    setAiInstructionText("");
                  },
                  onCancel: () =>
                    setAiInstructionDialog(returnToInstructionDialog),
                });
              }}
            >
              สร้าง Prompt ใหม่ตามคำสั่ง
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
