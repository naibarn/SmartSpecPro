/**
 * VerticalDramaStoryboardPanel (spec feature 131, section-01/section-06).
 *
 * Rich storyboard-list view of the `storyboard_shotgrid` stage's real,
 * LLM-generated 9-shot storyboard (`episode.storyboard`), joined by shot
 * number against `startFramePlan` (start-frame image + prompt) and
 * `motionPromptPack` (video-generation prompt per clip) — matches the
 * Storyboard Review page's per-shot card treatment (image, editable prompt,
 * repair/regenerate action) so the user sees this the moment
 * `storyboard_shotgrid` succeeds, without waiting for the rest of the
 * pipeline (start frames, motion prompts, video render, handoff project
 * creation) to finish. "Change image" opens the caller-provided
 * Media History/Library picker for that specific shot instead of requiring
 * a full regenerate.
 *
 * Covers the State Matrix (loading / empty / error / success) and
 * Accessibility Acceptance: warnings/labels are text-visible (never
 * color-only), the credit-confirm gate is keyboard reachable.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  Check,
  Clapperboard,
  Copy,
  Download,
  Expand,
  ImageOff,
  Loader2,
  Mic,
  Package,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageLightbox } from "@/components/chat/media/ImageLightbox";
import { splitImage } from "@/lib/imageGridSplitter";
import {
  readDroppedImageInput,
  readFileAsDataUrl,
  DROPPED_IMAGE_FILE_MAX_BYTES,
} from "@/components/media/ImageSourcePicker";
import { toast } from "sonner";
import ModelSelectorDialog, {
  formatMediaProviderDisplayName,
  type MediaModel,
} from "@/components/media/ModelSelectorDialog";
import { McpConnectionPicker } from "@/components/media/McpConnectionPicker";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
import {
  VERTICAL_DRAMA_DIALOGUE_LANGUAGES,
  VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES,
  VERTICAL_DRAMA_THAI_ACCENTS,
  VERTICAL_DRAMA_THAI_ACCENT_LABELS,
  VD_IMAGE_PROMPT_MAX,
  VD_VIDEO_PROMPT_MAX,
} from "@shared/verticalDramaSeries";
import { vdCopy, vdCopyWithCount, type VdLocale } from "./verticalDramaWorkspaceCopy";

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

/** Copy text to the clipboard, preferring the async Clipboard API with a
 *  `document.execCommand("copy")` fallback for browsers/contexts (e.g.
 *  non-HTTPS, older WebViews) where `navigator.clipboard` is unavailable or
 *  rejects (permissions). Used by the copy-prompt/copy-dialogue buttons
 *  (2026-07-07 upgrade). */
async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback below
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
const EMPTY_SHOT_NUMBER_SET: ReadonlySet<number> = new Set();
/** Client-side sanity cap for the "upload video file per shot" feature
 *  (2026-07-07 upgrade) — the actual server-side cap on
 *  `/api/media-jobs/upload` is 2GB (`MAX_UPLOAD_SIZE` in
 *  `server/routers/mediaJobs.ts`), but a single vertical-drama clip is a few
 *  seconds of 9:16 video, so 200MB is a generous, sensible ceiling that
 *  fails fast with a clear message instead of letting a wrong file (e.g. a
 *  whole raw-footage export) silently hang the upload. */
const VD_UPLOAD_VIDEO_FILE_MAX_BYTES = 200 * 1024 * 1024;

/** True for absolute http(s) URLs whose origin differs from this page's own
 *  origin — same-origin `/api/storage/...` paths (and any other relative
 *  path) never need proxying. Mirrors the private helper of the same name in
 *  `@/lib/imageGridSplitter.ts` (not exported from there, so duplicated here
 *  rather than reaching into that module's internals). */
function isCrossOriginMediaUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    const currentOrigin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    return !currentOrigin || parsed.origin !== currentOrigin;
  } catch {
    return false;
  }
}

/** Downloads a shot image or video-clip URL as a file, same blob-fetch +
 *  `<a download>` pattern as `ImageLightbox.handleDownload` — same-origin
 *  `/api/storage/...` URLs are fetched directly; external provider URLs are
 *  routed through `/api/media/image-proxy` first (works for both images and
 *  video byte streams — it is a generic pass-through proxy, not image-only
 *  despite the route name). Falls back to `window.open` if the fetch/blob
 *  path fails for any reason (e.g. a proxy/CORS edge case). */
async function downloadStoryboardMediaUrl(
  url: string,
  filename: string,
): Promise<void> {
  const fetchUrl = isCrossOriginMediaUrl(url)
    ? `/api/media/image-proxy?url=${encodeURIComponent(url)}`
    : url;
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`download fetch failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
/** Mirrors `VD_PRODUCT_REFERENCE_IMAGE_CAP` (`server/services/verticalDramaProductTieIn.ts`)
 *  — duplicated here (not imported) since that module lives under
 *  `server/services/`, not `@shared/`, matching this file's existing
 *  `productTieInByShot` client-side re-derivation convention. Shown only as a
 *  UI hint in the product-image picker; the server enforces the actual cap
 *  when it merges/trims reference images at generation time. */
const VD_PRODUCT_REFERENCE_IMAGE_CAP = 3;

/** `mediaModels.list`'s vertical-drama capability badges (Phase 0.1/0.4) —
 *  not part of the generic `MediaModel` shape (used by every other model
 *  picker in the app), so intersected in locally rather than widening the
 *  shared type for one feature. */
export type VerticalDramaCapableModel = MediaModel & {
  modelType?: string;
  supportsStartFrame?: boolean;
  maxReferenceImages?: number;
  nativeAudioDialogue?: boolean;
  verticalDramaReady?: boolean;
  /** Dynamic selectable output resolutions/sizes for this model (Phase 6.2),
   *  mirroring `mediaModels.list`'s `resolutionOptions` — `undefined`/empty
   *  means the model has no resolution signal, so no dropdown is shown. */
  resolutionOptions?: Array<{ value: string; label: string; creditCost?: number }>;
};

/** A single shot's reference-image strip entry (Phase 2.5) — mirrors
 *  `listShotReferences`'s `VerticalDramaShotReferenceContract`
 *  (`server/services/verticalDramaShotReferences.ts`). */
export interface VerticalDramaShotReferenceView {
  referenceId: string;
  mediaAssetId: string;
  role?: "start_frame" | "reference";
  source: "generated" | "grid_cut" | "history" | "library" | "upload" | "previous_main";
  sortOrder: number;
  thumbnailUrl?: string | null;
}

/** A single clip's dialogue line (Phase 3.1/3.4) — mirrors
 *  `VerticalDramaMotionPromptClipDialogueLine`
 *  (`shared/verticalDramaSeries/contracts.ts`), synced automatically from
 *  `dialogueAudioPlan` onto `motionPromptPack.clips[j].dialogue`. */
export interface VerticalDramaClipDialogueLineView {
  characterKey?: string;
  lineTh: string;
  emotion?: string;
  delivery?: {
    tone?: string;
    pace?: string;
    pauses?: string;
    texture?: string;
  };
  subtext?: string;
}

/** Episode quality-review scorecard (Phase 3B.5) — mirrors
 *  `episodeQualityReviewOutputSchema` in
 *  `server/services/verticalDramaEpisodeQualityReview.ts`, returned by
 *  `runEpisodeQualityReview` and `getEpisodeDetail.qualityReview`. */
export interface VerticalDramaQualityReviewView {
  episode_title?: string;
  scorecard: {
    reversal_count: number;
    reversal_sharpness: number;
    emotion_variety: number;
    dialogue_naturalness: number | null;
    pacing: number;
    overall: number;
  };
  summary?: string;
  issues: Array<{ location: string; problem: string; suggested_fix: string }>;
}

interface StoryboardShotView {
  shot_number?: number;
  visual_description?: string;
  action?: string;
  camera?: {
    shot_type?: string;
    angle?: string;
    movement?: string;
  };
  characters?: string[];
  required_character_refs?: string[];
  duration_seconds?: number;
}

export interface VerticalDramaStoryboardView {
  storyboard_summary?: {
    episode_title?: string;
    core_emotion?: string;
    visual_promise?: string;
  };
  canonical_style_bible?: {
    overall_style?: string;
  };
  shots?: StoryboardShotView[];
}

/** Persisted 3x3 multi-angle grid state for a shot (2026-07-05 persistence
 *  fix) — the source grid image is already a completed, server-side media
 *  task; this record just remembers which grid to re-split on reload and
 *  which of its 9 tiles the user already deleted, so a reload doesn't wipe
 *  the remaining candidates. Written onto `startFramePlan.frames[i]` via the
 *  existing free `updateEpisodeDraft` JSONB-patch flow — no new server
 *  procedure needed (that field is an open `z.record` passthrough). */
export interface VerticalDramaAngleGridView {
  /** Present only while the grid render is still in-flight (2026-07-06
   *  orphaned-task fix) — persisted at submit time so a reload/navigation
   *  before the client poll observes completion can resume tracking this
   *  task instead of losing it forever. `imageUrl` is absent until the
   *  resumed (or live) poll observes completion. */
  pendingTaskId?: string;
  imageUrl?: string;
  mediaTaskId?: string;
  /** Original 0..8 tile indexes (row-major, matching `splitImage`'s output
   *  order) the user has deleted from the picker — excluded on every
   *  re-hydration from `imageUrl`. */
  dismissedIndexes?: number[];
}

export interface VerticalDramaStartFramePlanFrame {
  shotNumber: number;
  imagePrompt: string;
  negativePrompt?: string;
  requiredCharacterRefs?: string[];
  productReferenceAssetIds?: string[];
  approvedMediaAssetId?: string;
  angleGrid?: VerticalDramaAngleGridView;
}

export interface VerticalDramaStartFramePlanView {
  mode?: string;
  selectedImageModelId?: string;
  frames?: VerticalDramaStartFramePlanFrame[];
}

/**
 * One shot's product tie-in placement (spec §13), keyed by shot number and
 * passed down by the caller (derived from `episode.script.product_tie_in_plan`
 * via `extractShotProductPlacements` + the series' `productTieIn.productName`
 * — see `verticalDramaProductTieIn.ts` on the server). Read-only indicator:
 * shows which shots carry the product placement, so the user can see at a
 * glance where the tie-in lives without opening the script/prompt text.
 */
export interface VerticalDramaShotProductTieInView {
  productName?: string;
  placementStyle?: "hero_prop" | "background" | "in_use_moment";
  benefitTalkingPoint?: string;
  /**
   * Additive (2026-07-06 Thai ad-compliance upgrade) — the category-mandated
   * disclosure line for this shot's clip, when present (e.g.
   * "อ่านคำเตือนในฉลากก่อนบริโภค" for อาหารเสริม). Shown in the chip's
   * tooltip so the disclosure requirement is visible without opening the
   * clip's full prompt/dialogue.
   */
  requiredDisclosure?: string;
}

/**
 * One available product reference image the picker can offer (2026-07-06
 * product-reference upgrade) — mirrors
 * `VerticalDramaAvailableProductImage` (`server/services/verticalDramaProductTieIn.ts`),
 * returned by `verticalDramaSeries.listProductImages`.
 */
export interface VerticalDramaAvailableProductImageView {
  url: string;
  source: "capture" | "direct";
  label?: string;
}

export interface VerticalDramaMotionPromptClipView {
  clipNumber: number;
  sourceShotNumbers?: number[];
  prompt: string;
  negativeMotionPrompt?: string;
  startFrameAssetId?: string;
  endFrameAssetId?: string;
  durationSeconds?: number;
  parentShotNumber?: number;
  subShotNumber?: number;
  /** Per-clip Thai dialogue lines (Phase 3.1), synced automatically from
   *  `dialogueAudioPlan` — absent/empty on silent clips or older rows. */
  dialogue?: VerticalDramaClipDialogueLineView[];
  /** Durable paid video-render result for this clip (2026-07-06 fix) — see
   *  `VerticalDramaMotionPromptPack["clips"][number]["videoTask"]` in
   *  `@shared/verticalDramaSeries/contracts.ts`. */
  videoTask?: {
    pendingTaskId?: string;
    videoUrl?: string;
    mediaTaskId?: string;
    /** See `VerticalDramaMotionPromptPack["clips"][number]["videoTask"].source`
     *  in `@shared/verticalDramaSeries/contracts.ts` — additive. */
    source?: "generated" | "upload";
  };
}

export interface VerticalDramaMotionPromptPackView {
  selectedVideoModelId?: string;
  /** The language the video-clip prompt TEXT is written in (episode-level language plan) — defaults to "en" when absent. */
  promptLanguage?: string;
  /** The language the character(s) SPEAK in the video (episode-level language plan) — defaults to "th" when absent. */
  dialogueLanguage?: string;
  /** Thai regional speech accent — only meaningful when `dialogueLanguage` is "th" (or absent, which defaults to Thai). */
  thaiAccent?: string;
  motionMode?: string;
  clips?: VerticalDramaMotionPromptClipView[];
}

export type VerticalDramaAssetUrlMap = Record<
  string,
  { url: string; thumbnailUrl: string | null }
>;

export type VerticalDramaCharacterPortraitMap = Record<
  string,
  { characterId: string; name: string; portraitUrl: string | null }
>;

interface VerticalDramaStoryboardPanelProps {
  locale?: Lang;
  /** Used only to build download filenames (`series-{seriesId}-ep-{episodeNumber}-...`)
   *  — not sent to any mutation from this panel. */
  seriesId?: string;
  episodeNumber?: number;
  storyboard?: VerticalDramaStoryboardView | null;
  startFramePlan?: VerticalDramaStartFramePlanView | null;
  motionPromptPack?: VerticalDramaMotionPromptPackView | null;
  assetUrls?: VerticalDramaAssetUrlMap;
  /** Every series character's current approved portrait, keyed by character
   *  key — joined per-shot against `shot.required_character_refs` so each
   *  shot card shows exactly the character(s) it needs (never all of them),
   *  as the concrete identity-lock reference the generation call will use. */
  characterPortraits?: VerticalDramaCharacterPortraitMap;
  /** Product tie-in placement per shot (spec §13), keyed by shot number —
   *  shows a read-only product chip next to the character chips on shots
   *  that carry a placement. Absent/empty when tie-in is disabled or no
   *  placement exists for this episode. */
  productTieInByShot?: Record<number, VerticalDramaShotProductTieInView>;
  /** Every product reference image available to pick from (2026-07-06 product-
   *  reference upgrade) — the series' full Marketplace Capture image set plus
   *  its direct product image URL, from `verticalDramaSeries.listProductImages`.
   *  Passed once for the whole panel (not per-shot); the picker dialog is the
   *  only place this list is shown. */
  productImages?: VerticalDramaAvailableProductImageView[];
  /** True while `listProductImages` is loading — shown inside the picker dialog. */
  productImagesLoading?: boolean;
  /** Persist a shot's user-chosen product reference image URL(s) — sets
   *  `productReferenceAssetIds` (and `productRefsCustomized: true`, even for an
   *  explicit empty selection) via the free `updateEpisodeDraft` JSONB-patch
   *  flow. Future generations for that shot use exactly this set, and the
   *  pipeline's auto-resolution never overwrites it again. */
  onSaveShotProductReferences?: (shotNumber: number, urls: string[]) => void;
  savingProductReferencesForShot?: number | null;
  loading?: boolean;
  error?: string | null;
  /** True while the real-generation mutation is in flight. */
  generating?: boolean;
  /** Called only after the user confirms the credit-spend warning. */
  onGenerateReal?: () => void;
  /** Opens the repair dialog for `video_motion_prompt_pack`, prefilled with the current prompt as an editable template. */
  onEditVideoPrompt?: (shotNumber: number, currentPrompt: string) => void;
  /** Opens the Media History/Library picker scoped to this shot's start frame. */
  onChangeStartFrame?: (shotNumber: number) => void;
  /** Opens the Media History/Library picker scoped to a specific character's global portrait (updates that character everywhere, not just this shot). */
  onChangeCharacterReference?: (characterId: string) => void;
  /** Dragging an image (Library/History/grid-cutter tile, same unified drag contract used across the app) directly onto a shot's character chip replaces that character's reference image immediately — no need to open the swap panel first. */
  onDropCharacterReference?: (characterId: string, url: string) => void;
  /** Dragging an image directly onto a shot's start-frame slot replaces it immediately, same as `onDropCharacterReference`. */
  onDropStartFrame?: (shotNumber: number, url: string) => void;
  /** Runs `start_frame_render_plan` for real (mode "full", spends credits) — generates every shot's image prompt at once. Shown only while no plan exists yet. */
  onGenerateStartFramePlan?: () => void;
  generatingStartFramePlan?: boolean;
  /** Opens the repair dialog for `start_frame_render_plan`, prefilled with the current image prompt as an editable template. */
  onEditStartFramePrompt?: (shotNumber: number, currentPrompt: string) => void;
  /** Panel-level "generate video prompts" (2026-07-05 fix) — runs
   *  `dialogue_audio_plan` then `video_motion_prompt_pack` for real (mode
   *  "full", spends credits), populating every clip's "พรอมต์วิดีโอ" box and
   *  dialogue lines at once. Mirrors `onGenerateStartFramePlan`. Shown only
   *  while a storyboard exists (the panel itself only renders once shots
   *  exist, so no extra gating needed here beyond the prop being present). */
  onGenerateVideoPromptPack?: () => void;
  generatingVideoPromptPack?: boolean;
  /** Renders a real AI image for this shot from its approved prompt (spends credits). */
  onGenerateStartFrameImage?: (shotNumber: number) => void;
  /** Every shot number currently rendering — a Set since "generate all" can
   *  have several shots in flight at once, each independent of the others. */
  generatingStartFrameImageForShot?: ReadonlySet<number>;
  /** Fires `onGenerateStartFrameImage` for every shot missing an approved
   *  image, concurrently — not one-at-a-time. */
  onGenerateAllStartFrameImages?: (shotNumbers: number[]) => void;
  /** Submits a 3x3 multi-angle-variations grid render for this shot; resolves to a 9-candidate picker (see `onPickAngleVariationCandidate`). */
  onGenerateAngleVariations?: (shotNumber: number) => void;
  generatingAngleVariationsForShot?: number | null;
  /** The completed grid image URL to split into 9 candidates client-side, keyed by shot number — cleared once the user picks or dismisses. */
  angleVariationGridUrlByShot?: Record<number, string>;
  /** User picked one of the 9 split candidates (as a data URL) for this shot.
   *  Async (upload -> resolve -> setApprovedStartFrameAsset on the caller's
   *  side) — the picker only clears once this resolves; callers MUST await
   *  the swap and reject/throw on failure so the picker can stay open. */
  onPickAngleVariationCandidate?: (
    shotNumber: number,
    candidateDataUrl: string
  ) => void | Promise<void>;
  /** Dismisses (closes) the whole picker for this shot — clears the
   *  persisted `angleGrid` on the frame (free `updateEpisodeDraft` patch) in
   *  addition to the local candidate list, so the picker stays gone after a
   *  reload too. */
  onDismissAngleVariations?: (shotNumber: number) => void;
  /** A single tile was removed from the picker (per-tile "x") — persists the
   *  tile's ORIGINAL 0..8 index into `angleGrid.dismissedIndexes` (free,
   *  `updateEpisodeDraft`) so it stays removed across reloads, distinct from
   *  `onDismissAngleVariations` which clears the entire picker. */
  onDeleteAngleVariationCandidate?: (shotNumber: number, originalIndex: number) => void;

  /* ---- Phase 1.3 — episode-level model selection ---- */
  /** Vertical-drama-ready image models for the header's image-model selector. */
  imageModels?: VerticalDramaCapableModel[];
  /** Vertical-drama-ready video models for the header's video-model selector. */
  videoModels?: VerticalDramaCapableModel[];
  selectedImageModelId?: string;
  selectedVideoModelId?: string;
  /** Fired when the user picks a different image/video model — the caller
   *  wires this to `setEpisodeModelSelection` + persists the choice as the
   *  per-series default in localStorage. */
  onSelectImageModel?: (modelId: string) => void;
  onSelectVideoModel?: (modelId: string) => void;
  modelsLoading?: boolean;
  /** Currently-selected MCP connection id (Higgsfield/Magnific etc. — any
   *  model whose `configJson` transport resolves to `"mcp"`, creditCost 0).
   *  Persisted by the caller (localStorage), shared with Media Studio's own
   *  key where possible so a connection picked there carries over here. */
  mcpConnectionId?: string | null;
  onSelectMcpConnection?: (connectionId: string | null) => void;

  /* ---- Resolution selector (storyboard-complete plan Phase 6.2) ----
   *  Shown only when the currently-selected image/video model has
   *  `resolutionOptions` — persisted by the caller per series+model
   *  (localStorage) and passed into every generate call for that media
   *  type. */
  selectedImageResolution?: string;
  selectedVideoResolution?: string;
  onSelectImageResolution?: (resolution: string) => void;
  onSelectVideoResolution?: (resolution: string) => void;

  /* ---- Video-prompt language options (episode-level language plan) ----
   *  Two independent selects next to the video model selector:
   *  `promptLanguage` (the language the video-clip PROMPT TEXT itself is
   *  written in — default "en") and `dialogueLanguage` (the language the
   *  characters SPEAK in the video — default "th"). Persisted via
   *  `setEpisodeVideoPromptLanguage`; only affects FUTURE prompt generations
   *  (same note pattern as `modelChangeNote`). */
  selectedPromptLanguage?: string;
  selectedDialogueLanguage?: string;
  onSelectPromptLanguage?: (language: string) => void;
  onSelectDialogueLanguage?: (language: string) => void;
  /** Thai regional speech accent — refines `dialogueLanguage` when it is
   *  (or defaults to) `"th"`. Shown only alongside the dialogue-language
   *  select, and only while the dialogue language is Thai. Persisted via
   *  the same `setEpisodeVideoPromptLanguage` mutation as `dialogueLanguage`. */
  selectedThaiAccent?: string | null;
  onSelectThaiAccent?: (value: string) => void;

  /* ---- Phase 2.5 — per-shot reference strip ---- */
  /** `listShotReferences` result, keyed by shot number (Phase 2/D contract). */
  shotReferencesByShot?: Record<number, VerticalDramaShotReferenceView[]>;
  /** Adds a reference to a shot from any resolved source (grid cutter tile,
   *  history/library drop, or an uploaded file) — caller resolves to a
   *  `media_assets.id` first, same two-step pattern used everywhere else. */
  onAddShotReference?: (
    shotNumber: number,
    payload: { url: string; source: VerticalDramaShotReferenceView["source"] }
  ) => void;
  onRemoveShotReference?: (shotNumber: number, referenceId: string) => void;
  addingShotReferenceForShot?: ReadonlySet<number>;
  /** Promotes a reference-strip image to be the shot's main (approved
   *  start-frame) image (main-image-swap-history upgrade) — calls the same
   *  `setApprovedStartFrameAsset` flow every other swap path uses; the
   *  server auto-demotes the previous main image into the reference strip
   *  and removes this asset's own reference row, so the cycle is reversible
   *  without any extra client bookkeeping. */
  onUseShotReferenceAsMain?: (shotNumber: number, mediaAssetId: string) => void;
  /** Non-null while a `onUseShotReferenceAsMain` promotion is in flight for
   *  this shot, so the strip can show a spinner and disable other actions. */
  usingShotReferenceAsMainForShot?: number | null;

  /* ---- Phase 3.4 — dialogue box ---- */
  /** Saves an edited dialogue line for a clip (free — routed through the
   *  existing `updateEpisodeDraft` flow, same as prompt edits). */
  onSaveClipDialogue?: (
    clipNumber: number,
    dialogue: VerticalDramaClipDialogueLineView[]
  ) => void;
  savingDialogueForClip?: number | null;

  /* ---- Video clip generation (`generateVideoClip`) ---- */
  /** Submits `generateVideoClip` for real (spends credits) — async
   *  submit+poll, same convention as `onGenerateStartFrameImage`. */
  onGenerateVideoClip?: (clipNumber: number) => void;
  generatingVideoClipForClip?: ReadonlySet<number>;
  /** Authoritative per-model "speaks natively vs. separate TTS" flag,
   *  returned by `generateVideoClip`'s response (`ttsFallback`) — more
   *  accurate than deriving it from the selected model's static
   *  `nativeAudioDialogue` capability alone, since some models fall back to
   *  TTS even when nominally native-audio-capable. Keyed by clip number;
   *  falls back to the static model capability when a clip hasn't been
   *  generated yet. */
  ttsFallbackByClip?: Record<number, boolean>;
  /** Non-zero once a `generateVideoClip` response reports reference images
   *  beyond the model's limit were trimmed before submission — shown as a
   *  small notice on that clip. */
  trimmedReferenceCountByClip?: Record<number, number>;
  /**
   * Upload video file per shot (2026-07-07 upgrade) — for users who
   * generated the clip EXTERNALLY (took the main image + prompt elsewhere)
   * and want to place the resulting video file as this shot's clip video.
   * The caller uploads via the existing large-file multipart route
   * (`/api/media-jobs/upload`, same one `WebAssetResolver` uses — NOT
   * `ai.upload`'s base64/tRPC path, which is bounded by the 10MB JSON body
   * limit) and persists `{ videoUrl, source: "upload" }` onto the clip's
   * `videoTask` via the existing free `persistVideoTask`/`updateEpisodeDraft`
   * flow. `clipNumber` is `clip.clipNumber` when a matching clip already
   * exists for this shot, or `shotNumber` itself when it doesn't yet (2026-
   * 07-07 fix — button is now shown on every shot); `sourceShotNumber` is
   * always passed so the caller can create a minimal
   * `{clipNumber, sourceShotNumbers: [sourceShotNumber]}` clip entry when
   * none exists yet, same convention as `generateShotVideoPrompt`'s
   * server-side "no matching clip" branch. */
  onUploadVideoClip?: (clipNumber: number, file: File, sourceShotNumber: number) => void;
  /** Non-null while an upload+persist is in flight for this clip. */
  uploadingVideoClipForClip?: ReadonlySet<number>;

  /* ---- Phase 4.1/4.2 — one-click generate + inline prompt editing ---- */
  /** Saves an edited image prompt for free (no LLM call) — distinct from
   *  `onEditStartFramePrompt`, which opens the paid AI-repair dialog. */
  onSaveStartFramePrompt?: (shotNumber: number, prompt: string) => void;
  /** Saves an edited video prompt for free — distinct from `onEditVideoPrompt`. */
  onSaveVideoPrompt?: (shotNumber: number, prompt: string) => void;
  /** One-click "generate prompt + image" (2026-07-05 redesign): the caller
   *  ensures an image prompt exists automatically (LLM-generated, no
   *  mandatory free-text typing from the user — see
   *  `VerticalDramaEpisodePage.handleGeneratePromptAndImage`), then submits
   *  either a single image or a 3x3 multi-angle grid depending on `mode`.
   *  Fired only after the user picks a mode in this panel's mode-choice
   *  dialog. */
  onGeneratePromptAndImage?: (
    shotNumber: number,
    mode: "single" | "angles"
  ) => void;
  generatingPromptAndImageForShot?: ReadonlySet<number>;

  /* ---- Phase 3B.5 — quality review card ---- */
  qualityReview?: VerticalDramaQualityReviewView | null;
  onRunQualityReview?: () => void;
  runningQualityReview?: boolean;
  /** Copies a suggested fix so the user can paste it into the repair dialog. */
  onCopySuggestedFix?: (suggestedFix: string) => void;

  /* ---- Manual episode -> series memory summarization ---- */
  /** Submits `summarizeEpisodeToMemory`. `force` re-summarizes an episode
   *  that was already summarized (appends a fresh set of memory events —
   *  the prior events are kept, never mutated/deleted). */
  onSummarizeEpisodeToMemory?: (opts?: { force?: boolean }) => void;
  summarizingEpisodeToMemory?: boolean;
  /** True once this episode has a manually-summarized memory event on record. */
  episodeAlreadySummarizedToMemory?: boolean;

  /* ---- Phase 6.5 — image-to-image repair dialog ---- */
  /** Submits `repairShotImage` for a shot that already has an approved
   *  image — async submit only; the caller polls and resolves the result
   *  URL, then calls back into `onRepairImageResult` (success) or leaves the
   *  dialog to show the error via `repairImageError`. */
  onSubmitRepairImage?: (shotNumber: number, instruction: string) => void;
  /** Non-null while a `repairShotImage` submit+poll is in flight for this shot. */
  repairImageSubmittingForShot?: number | null;
  /** The resolved BEFORE/AFTER pair once the repair task completes, keyed by
   *  shot number — cleared once the user picks "use new" or "keep old". */
  repairImageResultByShot?: Record<number, { beforeUrl: string; afterUrl: string }>;
  /** Readable error message for the most recent repair attempt on this shot
   *  (e.g. the PRECONDITION_FAILED "model doesn't support this" message). */
  repairImageErrorByShot?: Record<number, string>;
  /** User confirmed "ใช้ภาพใหม่" — caller resolves the AFTER url to a media
   *  asset and calls `setApprovedStartFrameAsset`. */
  onAcceptRepairImage?: (shotNumber: number) => void;
  /** User confirmed "เก็บภาพเดิม" — caller just clears local repair state;
   *  the generated image remains in history, untouched. */
  onDiscardRepairImage?: (shotNumber: number) => void;
  /** Opens/closes the repair dialog for a shot (caller owns which shot is open). */
  repairImageDialogForShot?: number | null;
  onOpenRepairImageDialog?: (shotNumber: number) => void;
  onCloseRepairImageDialog?: () => void;

  /* ---- Phase 6.6 — per-shot video prompt generation ---- */
  /** Submits `generateShotVideoPrompt` for one shot (synchronous LLM call,
   *  no polling) — disabled when the shot has no approved image yet. */
  onGenerateShotVideoPrompt?: (shotNumber: number) => void;
  generatingShotVideoPromptForShot?: ReadonlySet<number>;
  /** True once the most recent `generateShotVideoPrompt` response for this
   *  shot reported `usedVision: true` — shown as a small note next to the
   *  video prompt box. */
  usedVisionByShot?: Record<number, boolean>;

  /* ---- Whole-episode compiled video (2026-07-06 download + assembly
     upgrade) — `verticalDramaEpisodes.assembleEpisodeVideo` concatenates
     every completed clip into one mp4, shown as a dedicated card at the
     bottom of the shot list (a whole-episode artifact, not a per-shot one). */
  /** Current persisted status, read from `episode.assemblyManifest.compiledVideo` —
   *  `undefined`/absent means "never assembled yet." */
  compiledVideo?: VerticalDramaCompiledVideoView | null;
  /** Submits `assembleEpisodeVideo`. `allowPartial` mirrors the mutation's
   *  own input — omit/false to require every clip complete first. */
  onAssembleCompiledVideo?: (opts?: { allowPartial?: boolean }) => void;
  /** True while the submit mutation itself is in flight (distinct from the
   *  server-side job, which is reflected by `compiledVideo.status`). */
  assemblingCompiledVideo?: boolean;
  /** Every clip number 1..N that this episode's motion prompt pack defines,
   *  used to compute the "{ready}/{total} clips" hint and the missing-clip
   *  list — independent of `compiledVideo` itself. */
  totalClipCount?: number;
  /** Clip numbers that already have a completed `videoTask.videoUrl`. */
  readyClipNumbers?: number[];

  className?: string;
}

/** Client-facing view of `VerticalDramaCompiledVideoState`
 *  (`@shared/verticalDramaSeries`) — re-declared locally (not imported) so
 *  this presentational panel stays decoupled from the shared package import,
 *  matching every other `*View` type in this file. Field-for-field identical. */
export interface VerticalDramaCompiledVideoView {
  pendingJobId?: string;
  videoUrl?: string;
  durationSeconds?: number;
  shotCount?: number;
  assembledAt?: string;
  status?: "pending" | "completed" | "failed";
  error?: string;
}

export function VerticalDramaStoryboardPanel({
  locale = "th",
  seriesId,
  episodeNumber,
  storyboard,
  startFramePlan,
  motionPromptPack,
  assetUrls = {},
  characterPortraits = {},
  productTieInByShot = {},
  productImages = [],
  productImagesLoading = false,
  onSaveShotProductReferences,
  savingProductReferencesForShot = null,
  loading = false,
  error = null,
  generating = false,
  onGenerateReal,
  onEditVideoPrompt,
  onChangeStartFrame,
  onChangeCharacterReference,
  onDropCharacterReference,
  onDropStartFrame,
  onGenerateStartFramePlan,
  generatingStartFramePlan = false,
  onEditStartFramePrompt,
  onGenerateVideoPromptPack,
  generatingVideoPromptPack = false,
  onGenerateStartFrameImage,
  generatingStartFrameImageForShot = EMPTY_SHOT_NUMBER_SET,
  onGenerateAllStartFrameImages,
  onGenerateAngleVariations,
  generatingAngleVariationsForShot = null,
  angleVariationGridUrlByShot = {},
  onPickAngleVariationCandidate,
  onDismissAngleVariations,
  onDeleteAngleVariationCandidate,
  imageModels = [],
  videoModels = [],
  selectedImageModelId = "",
  selectedVideoModelId = "",
  onSelectImageModel,
  onSelectVideoModel,
  modelsLoading = false,
  mcpConnectionId = null,
  onSelectMcpConnection,
  selectedImageResolution = "",
  selectedVideoResolution = "",
  onSelectImageResolution,
  onSelectVideoResolution,
  selectedPromptLanguage = "",
  selectedDialogueLanguage = "",
  onSelectPromptLanguage,
  onSelectDialogueLanguage,
  selectedThaiAccent = null,
  onSelectThaiAccent,
  shotReferencesByShot = {},
  onAddShotReference,
  onRemoveShotReference,
  addingShotReferenceForShot = EMPTY_SHOT_NUMBER_SET,
  onUseShotReferenceAsMain,
  usingShotReferenceAsMainForShot = null,
  onSaveClipDialogue,
  savingDialogueForClip = null,
  onGenerateVideoClip,
  generatingVideoClipForClip = EMPTY_SHOT_NUMBER_SET,
  ttsFallbackByClip = {},
  trimmedReferenceCountByClip = {},
  onUploadVideoClip,
  uploadingVideoClipForClip = EMPTY_SHOT_NUMBER_SET,
  onSaveStartFramePrompt,
  onSaveVideoPrompt,
  onGeneratePromptAndImage,
  generatingPromptAndImageForShot = EMPTY_SHOT_NUMBER_SET,
  qualityReview = null,
  onRunQualityReview,
  runningQualityReview = false,
  onCopySuggestedFix,
  onSummarizeEpisodeToMemory,
  summarizingEpisodeToMemory = false,
  episodeAlreadySummarizedToMemory = false,
  onSubmitRepairImage,
  repairImageSubmittingForShot = null,
  repairImageResultByShot = {},
  repairImageErrorByShot = {},
  onAcceptRepairImage,
  onDiscardRepairImage,
  repairImageDialogForShot = null,
  onOpenRepairImageDialog,
  onCloseRepairImageDialog,
  onGenerateShotVideoPrompt,
  generatingShotVideoPromptForShot = EMPTY_SHOT_NUMBER_SET,
  usedVisionByShot = {},
  compiledVideo = null,
  onAssembleCompiledVideo,
  assemblingCompiledVideo = false,
  totalClipCount = 0,
  readyClipNumbers = [],
  className,
}: VerticalDramaStoryboardPanelProps) {
  const t2 = vdCopy(locale as VdLocale);

  /**
   * Reads a drag-and-drop payload that may be a real OS file (dropped
   * straight from the user's computer) or the codebase's own unified URL
   * drag contract, and resolves it to a single URL string every existing
   * `onDrop*`/`onAdd*` callback below already knows how to handle (a
   * `data:` URL for a real file — the exact same shape the grid cutter's
   * tiles already produce and that `handleAddShotReference` /
   * `handleDropStartFrame` / `handleDropCharacterReference` on the page
   * already upload via `ai.upload` before resolving+linking). Shows the
   * unsupported-type / too-large toasts itself so every call site stays a
   * one-liner. Returns `null` (after toasting, if there was an error) when
   * nothing usable was dropped.
   */
  async function resolveDroppedImageInputToUrl(
    event: React.DragEvent,
  ): Promise<string | null> {
    const { input, error } = readDroppedImageInput(event);
    if (error) {
      if (error.kind === "unsupported-file-type") {
        toast.error(t2.unsupportedImageFileType);
      } else {
        toast.error(
          vdCopyWithCount(
            t2.imageFileTooLarge,
            Math.round(error.maxBytes / (1024 * 1024)),
          ),
        );
      }
      return null;
    }
    if (!input) return null;
    if (input.kind === "url") return input.url;
    return readFileAsDataUrl(input.file);
  }

  const selectedImageModel = imageModels.find(m => m.modelId === selectedImageModelId);
  const selectedVideoModel = videoModels.find(m => m.modelId === selectedVideoModelId);
  const selectedImageModelTransport = resolveMediaModelTransportConfig({
    provider: selectedImageModel?.provider,
    modelId: selectedImageModel?.modelId ?? selectedImageModelId,
    configJson: selectedImageModel?.configJson,
  });
  const selectedVideoModelTransport = resolveMediaModelTransportConfig({
    provider: selectedVideoModel?.provider,
    modelId: selectedVideoModel?.modelId ?? selectedVideoModelId,
    configJson: selectedVideoModel?.configJson,
  });
  const imageModelUsesMcp =
    Boolean(selectedImageModelId) && selectedImageModelTransport.transport === "mcp";
  const videoModelUsesMcp =
    Boolean(selectedVideoModelId) && selectedVideoModelTransport.transport === "mcp";
  const anyModelUsesMcp = imageModelUsesMcp || videoModelUsesMcp;
  const mcpNeededForLabel = [
    imageModelUsesMcp ? (selectedImageModel?.name ?? t2.imageModel) : null,
    videoModelUsesMcp ? (selectedVideoModel?.name ?? t2.videoModel) : null,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" · ");
  const mcpProviderKey =
    (imageModelUsesMcp ? selectedImageModelTransport.providerKey : undefined) ??
    (videoModelUsesMcp ? selectedVideoModelTransport.providerKey : undefined);
  const [confirming, setConfirming] = useState(false);
  /** Confirm-gate for "re-assemble" (destructive overwrite of the existing
   *  compiled video) — mirrors `confirmingRegenerateVideoForClip`'s
   *  convention. `false` shows the plain button; a distinct "allowPartial"
   *  variant isn't needed here since re-assembly only fires once a completed
   *  compiled video already exists (implying every clip was ready last time). */
  const [confirmingReassembleCompiledVideo, setConfirmingReassembleCompiledVideo] =
    useState(false);
  const [confirmingStartFramePlan, setConfirmingStartFramePlan] = useState(false);
  const [confirmingVideoPromptPack, setConfirmingVideoPromptPack] = useState(false);
  const [choosingGenerateModeForShot, setChoosingGenerateModeForShot] = useState<number | null>(null);
  const [confirmingImageForShot, setConfirmingImageForShot] = useState<number | null>(null);
  const [confirmingAngleVariationsForShot, setConfirmingAngleVariationsForShot] = useState<number | null>(null);
  const [confirmingGenerateAllImages, setConfirmingGenerateAllImages] = useState(false);
  const [lightboxShot, setLightboxShot] = useState<number | null>(null);
  const [lightboxCharacterId, setLightboxCharacterId] = useState<string | null>(null);
  /** Character id currently resolving a dropped/uploaded file at ANY of this
   *  panel's character-reference drop targets (review portrait chip or the
   *  per-shot character chip) — drives the busy spinner overlay while
   *  `readFileAsDataUrl` + the page's own upload/resolve/link chain runs. */
  const [droppingCharacterReferenceFor, setDroppingCharacterReferenceFor] =
    useState<string | null>(null);
  /** Shot number currently resolving a dropped/uploaded file directly onto
   *  its start-frame image slot. */
  const [droppingStartFrameForShot, setDroppingStartFrameForShot] =
    useState<number | null>(null);
  const [lightboxProductImageUrl, setLightboxProductImageUrl] = useState<string | null>(null);
  /** Shot number currently showing the "เปลี่ยนภาพสินค้า" picker dialog
   *  (2026-07-06 product-reference upgrade) — the draft selection lives
   *  locally until the user saves. */
  const [productImagePickerForShot, setProductImagePickerForShot] = useState<number | null>(null);
  const [productImagePickerDraft, setProductImagePickerDraft] = useState<string[]>([]);
  /** Each surviving tile's data URL AND its ORIGINAL 0..8 position in the
   *  3x3 grid (row-major, matching `splitImage`'s output order) — the
   *  original index is what gets persisted into `angleGrid.dismissedIndexes`
   *  on per-tile delete, so a later re-hydration (page reload) knows exactly
   *  which of the 9 tiles to exclude, independent of how many tiles have
   *  already been removed from THIS list. */
  const [angleCandidatesByShot, setAngleCandidatesByShot] = useState<
    Record<number, Array<{ dataUrl: string; originalIndex: number }>>
  >({});
  const [splittingShot, setSplittingShot] = useState<number | null>(null);
  /** Shots with a `splitImage()` call currently in flight (2026-07-05 fix —
   *  "3x3 grid completed but the picker never appeared, buttons stuck
   *  spinning"). Guarding re-entrancy with ONLY the `splittingShot`/
   *  `angleCandidatesByShot` React state (as both effects below used to do)
   *  is unsafe: `angleVariationGridUrlByShot` can change reference across
   *  renders (e.g. right after the page's `persistAngleGrid` effect writes
   *  the grid onto `startFramePlan` and the resulting refetch re-renders
   *  this panel) BEFORE the `setSplittingShot(shotNumber)` state update from
   *  the first call has committed — so the effect can re-run and read a
   *  stale `splittingShot === null` closure, firing a SECOND concurrent
   *  `splitImage()` for the same shot. Whichever call's promise resolves
   *  last silently overwrites `angleCandidatesByShot`, and if that second
   *  (redundant) call fails, the picker flips to the "split failed" state
   *  even though the first call already had valid tiles — a plain `Set`
   *  ref is synchronous (no commit-timing race) so it closes this window. */
  const splitInFlightShotsRef = useRef<Set<number>>(new Set());
  /** Shot numbers already hydrated (or attempted) from a persisted
   *  `angleGrid` on mount/reload — prevents re-splitting on every render and
   *  prevents a freshly-dismissed-all shot (which clears `angleGrid` server
   *  side) from being re-hydrated from stale query cache during the same
   *  session. */
  const hydratedAngleGridShotsRef = useRef<Set<number>>(new Set());
  const [angleGridHydrationErrorShots, setAngleGridHydrationErrorShots] = useState<
    ReadonlySet<number>
  >(EMPTY_SHOT_NUMBER_SET);
  /** Checked candidates in the multi-angle picker, per shot — indexes into
   *  `angleCandidatesByShot[shotNumber]`. Lets the user add several of the
   *  9 split tiles as references in one action, distinct from clicking a
   *  tile's image (which fullscreen-previews it) or its own "use as start
   *  frame" affordance. */
  const [selectedAngleCandidateIndexesByShot, setSelectedAngleCandidateIndexesByShot] = useState<
    Record<number, Set<number>>
  >({});
  /** Shots currently awaiting `onPickAngleVariationCandidate` to finish
   *  (upload -> resolve -> setApprovedStartFrameAsset on the page side).
   *  2026-07-07 fix: the picker used to close optimistically the instant
   *  "ใช้เป็นภาพเริ่มต้น" was clicked, before that async chain even started —
   *  if the chain failed (upload error, resolve error, etc.) the user was
   *  left with no picker AND no updated start frame, with only an easy-to-
   *  miss toast as a clue. Now the picker stays open (button shows a
   *  spinner) until the pick actually resolves, and only clears on success. */
  const [applyingAngleCandidateForShot, setApplyingAngleCandidateForShot] = useState<
    ReadonlySet<number>
  >(EMPTY_SHOT_NUMBER_SET);
  /** Fullscreen preview target for a single angle-candidate tile, via the
   *  same `ImageLightbox` used everywhere else in this panel. */
  const [lightboxAngleCandidate, setLightboxAngleCandidate] = useState<
    { shotNumber: number; index: number } | null
  >(null);
  const [isImageModelDialogOpen, setIsImageModelDialogOpen] = useState(false);
  const [isVideoModelDialogOpen, setIsVideoModelDialogOpen] = useState(false);
  const [editingImagePromptForShot, setEditingImagePromptForShot] = useState<number | null>(null);
  const [editingImagePromptDraft, setEditingImagePromptDraft] = useState("");
  const [editingVideoPromptForShot, setEditingVideoPromptForShot] = useState<number | null>(null);
  const [editingVideoPromptDraft, setEditingVideoPromptDraft] = useState("");
  const [editingDialogueForClip, setEditingDialogueForClip] = useState<number | null>(null);
  const [editingDialogueDraft, setEditingDialogueDraft] = useState<
    VerticalDramaClipDialogueLineView[]
  >([]);
  const [confirmingRemoveReference, setConfirmingRemoveReference] = useState<
    { shotNumber: number; referenceId: string } | null
  >(null);
  const [referenceDragOverShot, setReferenceDragOverShot] = useState<number | null>(null);
  const [qualityIssuesExpanded, setQualityIssuesExpanded] = useState(false);
  /** Completed video-clip player (2026-07-06 fix) — inline "regenerate"
   *  confirm (same convention as `confirmingImageForShot`) and the clip
   *  number currently shown in the full-screen video dialog. */
  const [confirmingRegenerateVideoForClip, setConfirmingRegenerateVideoForClip] =
    useState<number | null>(null);
  const [fullScreenVideoClip, setFullScreenVideoClip] = useState<number | null>(null);
  /** Repair-image dialog (Phase 6.5) instruction draft, keyed by shot so
   *  switching shots (closing one dialog, opening another) never leaks the
   *  previous shot's typed text. */
  const [repairImageInstructionByShot, setRepairImageInstructionByShot] = useState<
    Record<number, string>
  >({});

  // Split a completed multi-angle grid image into 9 candidates client-side
  // (reuses the same `imageGridSplitter` tool the character-reference
  // grid-cutter already uses) as soon as its URL shows up.
  useEffect(() => {
    for (const [shotKey, gridUrl] of Object.entries(angleVariationGridUrlByShot)) {
      const shotNumber = Number(shotKey);
      if (angleCandidatesByShot[shotNumber]) continue;
      if (splitInFlightShotsRef.current.has(shotNumber)) continue;
      splitInFlightShotsRef.current.add(shotNumber);
      setSplittingShot(shotNumber);
      splitImage(gridUrl, 3, 3, "image/jpeg", 0.92)
        .then(results => {
          setAngleCandidatesByShot(prev => ({
            ...prev,
            [shotNumber]: results.map(r => ({ dataUrl: r.dataUrl, originalIndex: r.index })),
          }));
        })
        .catch(() => {
          setAngleCandidatesByShot(prev => ({ ...prev, [shotNumber]: [] }));
        })
        .finally(() => {
          splitInFlightShotsRef.current.delete(shotNumber);
          setSplittingShot(current => (current === shotNumber ? null : current));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angleVariationGridUrlByShot]);

  // Restore the multi-angle picker from a PERSISTED grid (`frame.angleGrid`)
  // on load/reload — fixes the "Ctrl+Shift+R wipes the 9 tiles" bug report.
  // The source 3x3 image itself is already durable (a completed media task),
  // so this just re-splits it client-side and excludes whatever tiles the
  // user already deleted (`dismissedIndexes`), same as the live-generation
  // effect above but reading from `startFramePlan` instead of the
  // in-flight-generation prop. Skips any shot the live-generation effect (or
  // this effect) has already produced/attempted, and skips shots the user
  // has since dismissed entirely in this session (no `angleGrid` left).
  useEffect(() => {
    for (const frame of startFramePlan?.frames ?? []) {
      const shotNumber = frame.shotNumber;
      const angleGrid = frame.angleGrid;
      if (!angleGrid?.imageUrl) continue;
      if (hydratedAngleGridShotsRef.current.has(shotNumber)) continue;
      if (angleCandidatesByShot[shotNumber]) continue;
      if (angleVariationGridUrlByShot[shotNumber]) continue; // live-generation effect owns this one
      if (splitInFlightShotsRef.current.has(shotNumber)) continue;
      hydratedAngleGridShotsRef.current.add(shotNumber);
      splitInFlightShotsRef.current.add(shotNumber);
      const dismissed = new Set(angleGrid.dismissedIndexes ?? []);
      setSplittingShot(shotNumber);
      splitImage(angleGrid.imageUrl, 3, 3, "image/jpeg", 0.92)
        .then(results => {
          setAngleCandidatesByShot(prev => ({
            ...prev,
            [shotNumber]: results
              .filter(r => !dismissed.has(r.index))
              .map(r => ({ dataUrl: r.dataUrl, originalIndex: r.index })),
          }));
        })
        .catch(() => {
          // Failure here means the grid can't be re-split (e.g. transient
          // network error) — do NOT crash or silently drop the shot; show a
          // retry line in the picker's place instead (see render below).
          setAngleGridHydrationErrorShots(prev => new Set(prev).add(shotNumber));
        })
        .finally(() => {
          splitInFlightShotsRef.current.delete(shotNumber);
          setSplittingShot(current => (current === shotNumber ? null : current));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFramePlan?.frames]);

  if (loading) {
    return (
      <section
        aria-label="Storyboard"
        aria-busy="true"
        className={cn(
          "rounded-lg border border-border p-4 text-sm text-muted-foreground",
          className
        )}
      >
        <p>{t(locale, "กำลังโหลดสตอรีบอร์ด…", "Loading storyboard…")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label="Storyboard"
        className={cn(
          "rounded-lg border border-destructive/50 p-4 text-sm",
          className
        )}
      >
        <p className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t(locale, "สตอรีบอร์ดผิดพลาด: ", "Storyboard error: ")}{error}</span>
        </p>
      </section>
    );
  }

  const shots = storyboard?.shots ?? [];

  if (shots.length === 0) {
    return (
      <section
        aria-label="Storyboard"
        className={cn(
          "rounded-lg border border-dashed border-border p-4 text-sm",
          className
        )}
      >
        <p className="text-muted-foreground">
          {storyboard
            ? t(locale, "สตอรีบอร์ดยังไม่มี shot (dry-run placeholder)", "Storyboard has no shots yet (dry-run placeholder).")
            : t(locale, "ยังไม่มีสตอรีบอร์ด", "No storyboard yet.")}
        </p>
        {onGenerateReal && (
          <div className="mt-3 flex flex-col items-start gap-2">
            {confirming ? (
              <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 dark:bg-amber-950/30">
                <p className="font-medium">
                  {t(locale, "การทำงานนี้ใช้ AI จริงและใช้เครดิต", "This uses real AI generation and spends credits.")}
                </p>
                <p className="text-muted-foreground">
                  {t(
                    locale,
                    "ดำเนินการต่อเฉพาะเมื่อต้องการสตอรีบอร์ด 9 ช็อตจริง ไม่ใช่ placeholder ฟรี",
                    "Continue only if you want the actual 9-shot storyboard, not the free placeholder."
                  )}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted"
                    disabled={generating}
                  >
                    {t(locale, "ยกเลิก", "Cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      onGenerateReal();
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    disabled={generating}
                    data-testid="vd-storyboard-confirm-generate"
                  >
                    {generating ? (
                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    {t(locale, "สร้างสตอรีบอร์ดจริง", "Generate real storyboard")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={generating}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                data-testid="vd-storyboard-generate-real"
              >
                {generating ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {t(locale, "สร้างสตอรีบอร์ดจริง", "Generate real storyboard")}
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  const summary = storyboard?.storyboard_summary;
  const frameByShot = new Map<number, VerticalDramaStartFramePlanFrame>();
  for (const frame of startFramePlan?.frames ?? []) {
    if (typeof frame?.shotNumber === "number") frameByShot.set(frame.shotNumber, frame);
  }
  const clipByShot = new Map<number, VerticalDramaMotionPromptClipView>();
  for (const clip of motionPromptPack?.clips ?? []) {
    const shotNumbers =
      clip.sourceShotNumbers && clip.sourceShotNumbers.length > 0
        ? clip.sourceShotNumbers
        : clip.parentShotNumber != null
          ? [clip.parentShotNumber]
          : [];
    for (const shotNumber of shotNumbers) {
      if (!clipByShot.has(shotNumber)) clipByShot.set(shotNumber, clip);
    }
  }

  // Every character used in ANY shot, for the review strip — a single at-a-
  // glance summary distinct from the per-shot chips (which show only that
  // shot's characters). Deduplicated by character key.
  const reviewCharacterKeys = new Set<string>();
  for (const shot of shots) {
    const keys = shot.required_character_refs?.length
      ? shot.required_character_refs
      : (shot.characters ?? []);
    for (const key of keys) reviewCharacterKeys.add(key);
  }
  const reviewCharacters = Array.from(reviewCharacterKeys)
    .map(key => characterPortraits[key])
    .filter((p): p is VerticalDramaCharacterPortraitMap[string] => Boolean(p));

  // Shots with no approved image yet — what "generate all shot images" (bulk
  // redesign, 2026-07-05) actually submits. Shots that already have an
  // approved image are left alone (no accidental re-charge/overwrite).
  const shotsNeedingImages = shots
    .map((shot, i) => shot.shot_number ?? i + 1)
    .filter(shotNumber => {
      const frame = frameByShot.get(shotNumber);
      const assetId = frame?.approvedMediaAssetId;
      return Boolean(frame?.imagePrompt) && !(assetId && assetUrls[assetId]);
    });

  return (
    <section
      aria-label="Storyboard"
      className={cn("flex flex-col gap-4 rounded-lg border border-border p-4 text-sm", className)}
    >
      <header className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Clapperboard aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t(locale, `สตอรีบอร์ด — ${shots.length} ช็อต`, `Storyboard — ${shots.length} shots`)}</span>
        </h3>
        {summary?.core_emotion || summary?.visual_promise ? (
          <p className="text-muted-foreground">
            {summary?.core_emotion ? (
              <>
                <span className="font-medium text-foreground">
                  {t(locale, "อารมณ์หลัก: ", "Core emotion: ")}
                </span>
                {summary.core_emotion}
                {summary?.visual_promise ? " — " : ""}
              </>
            ) : null}
            {summary?.visual_promise}
          </p>
        ) : null}
        {storyboard?.canonical_style_bible?.overall_style ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{t(locale, "สไตล์: ", "Style: ")}</span>
            {storyboard.canonical_style_bible.overall_style}
          </p>
        ) : null}
      </header>

      {/* Episode-level model selection (Phase 1.3) — a single control per
          episode, deliberately NOT per-shot/per-clip (2026-07-05 product
          decision). Changing a model here only affects the NEXT generation;
          already-made images/clips are untouched (see `modelChangeNote`). */}
      {onSelectImageModel || onSelectVideoModel ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {onSelectImageModel ? (
              <ModelPickerButton
                label={t2.imageModel}
                model={selectedImageModel}
                mcpFree={imageModelUsesMcp}
                mcpFreeLabel={t2.capabilityMcpFree}
                onClick={() => setIsImageModelDialogOpen(true)}
                locale={locale}
                testId="vd-storyboard-select-image-model"
              />
            ) : null}
            {onSelectVideoModel ? (
              <ModelPickerButton
                label={t2.videoModel}
                model={selectedVideoModel}
                mcpFree={videoModelUsesMcp}
                mcpFreeLabel={t2.capabilityMcpFree}
                onClick={() => setIsVideoModelDialogOpen(true)}
                locale={locale}
                testId="vd-storyboard-select-video-model"
              />
            ) : null}

            {/* Resolution selectors (storyboard-complete plan Phase 6.2) —
                one compact dropdown per media type, shown only when the
                currently-selected model actually has `resolutionOptions`
                (dynamic, read from the model's real catalog metadata — never
                a hardcoded list). */}
            {onSelectImageResolution && selectedImageModel?.resolutionOptions?.length ? (
              <ResolutionSelect
                label={t2.resolutionLabel}
                autoLabel={t2.resolutionAuto}
                options={selectedImageModel.resolutionOptions}
                value={selectedImageResolution}
                onChange={onSelectImageResolution}
                creditSuffix={t2.capabilityCreditCost}
                testId="vd-storyboard-select-image-resolution"
              />
            ) : null}
            {onSelectVideoResolution && selectedVideoModel?.resolutionOptions?.length ? (
              <ResolutionSelect
                label={t2.resolutionLabel}
                autoLabel={t2.resolutionAuto}
                options={selectedVideoModel.resolutionOptions}
                value={selectedVideoResolution}
                onChange={onSelectVideoResolution}
                creditSuffix={t2.capabilityCreditCost}
                testId="vd-storyboard-select-video-resolution"
              />
            ) : null}

            {/* Video-prompt language options (episode-level language plan) —
                two independent selects: the language the PROMPT TEXT is
                written in, and the language the characters SPEAK. Shown
                whenever the caller wires the callbacks (mirrors every other
                selector in this header). */}
            {onSelectPromptLanguage ? (
              <LanguageSelect
                label={t2.promptLanguageLabel}
                value={selectedPromptLanguage || "en"}
                onChange={onSelectPromptLanguage}
                options={[
                  { value: "en", label: t2.promptLanguageEn },
                  { value: "th", label: t2.promptLanguageTh },
                  { value: "zh", label: t2.promptLanguageZh },
                  { value: "ja", label: t2.promptLanguageJa },
                  { value: "ko", label: t2.promptLanguageKo },
                ]}
                testId="vd-storyboard-select-prompt-language"
              />
            ) : null}
            {onSelectDialogueLanguage ? (
              <LanguageSelect
                label={t2.dialogueLanguageLabel}
                value={selectedDialogueLanguage || "th"}
                onChange={onSelectDialogueLanguage}
                options={VERTICAL_DRAMA_DIALOGUE_LANGUAGES.map(code => ({
                  value: code,
                  label: VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES[code],
                }))}
                testId="vd-storyboard-select-dialogue-language"
              />
            ) : null}
            {onSelectDialogueLanguage &&
            onSelectThaiAccent &&
            (selectedDialogueLanguage || "th") === "th" ? (
              <LanguageSelect
                label={t2.thaiAccentLabel}
                value={selectedThaiAccent || "standard_central_thai"}
                onChange={onSelectThaiAccent}
                options={VERTICAL_DRAMA_THAI_ACCENTS.map(code => ({
                  value: code,
                  label: VERTICAL_DRAMA_THAI_ACCENT_LABELS[code][locale as VdLocale],
                }))}
                testId="vd-storyboard-select-thai-accent"
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t2.modelChangeNote}</p>

          {/* MCP connection row (Higgsfield/Magnific etc. — creditCost 0,
              routed through the caller's own MCP provider account instead of
              SmartSpec credits). Shown only when the currently-selected
              image OR video model resolves to MCP transport
              (`resolveMediaModelTransportConfig`, same detection Media
              Studio uses). Persisted by the caller (localStorage). */}
          {anyModelUsesMcp && onSelectMcpConnection ? (
            <div className="space-y-1 border-t border-border/60 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t2.mcpConnectionLabel}
                </span>
                {mcpNeededForLabel ? (
                  <Badge variant="outline" className="px-1 py-0 text-[9px]">
                    {vdCopyWithCount(t2.mcpConnectionNeededFor, mcpNeededForLabel)}
                  </Badge>
                ) : null}
              </div>
              <McpConnectionPicker
                value={mcpConnectionId}
                onChange={onSelectMcpConnection}
                assetType={imageModelUsesMcp ? "image" : "video"}
                providerKey={mcpProviderKey}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {onSelectImageModel ? (
        <ModelSelectorDialog
          open={isImageModelDialogOpen}
          onOpenChange={setIsImageModelDialogOpen}
          models={imageModels}
          selectedModelId={selectedImageModelId}
          onSelect={onSelectImageModel}
          mediaType="image"
          isLoading={modelsLoading}
        />
      ) : null}
      {onSelectVideoModel ? (
        <ModelSelectorDialog
          open={isVideoModelDialogOpen}
          onOpenChange={setIsVideoModelDialogOpen}
          models={videoModels}
          selectedModelId={selectedVideoModelId}
          onSelect={onSelectVideoModel}
          mediaType="video"
          isLoading={modelsLoading}
        />
      ) : null}

      {/* Episode quality-review scorecard (Phase 3B.5) — cheap LLM-only
          check meant to run BEFORE the user spends credits on image/video
          generation for this episode. Never blocks — the user decides. */}
      {onRunQualityReview || qualityReview ? (
        <QualityReviewCard
          locale={locale}
          t={t2}
          review={qualityReview}
          onRun={onRunQualityReview}
          running={runningQualityReview}
          expanded={qualityIssuesExpanded}
          onToggleExpanded={() => setQualityIssuesExpanded(v => !v)}
          onCopySuggestedFix={onCopySuggestedFix}
        />
      ) : null}

      {/* Manual episode -> series memory summarization — makes the fully-
          wired series-memory pipeline (planner skill -> 8 event kinds ->
          memory bundle -> next-episode script) reachable without running the
          full pipeline tail. The user's click IS the approval. */}
      {onSummarizeEpisodeToMemory ? (
        <SummarizeMemoryCard
          locale={locale}
          t={t2}
          disabled={!storyboard}
          running={summarizingEpisodeToMemory}
          alreadySummarized={episodeAlreadySummarizedToMemory}
          onRun={() => onSummarizeEpisodeToMemory()}
          onReSummarize={() => onSummarizeEpisodeToMemory({ force: true })}
        />
      ) : null}

      {reviewCharacters.length > 0 ? (
        <div
          className="flex flex-wrap gap-3 rounded-md border border-border bg-muted/30 p-3"
          aria-label={t(locale, "ตรวจสอบภาพตัวละคร", "Character review")}
        >
          {reviewCharacters.map(portrait => (
            <div
              key={portrait.characterId}
              className="flex w-32 flex-col items-center gap-1.5 text-center"
              data-testid={`vd-storyboard-character-review-${portrait.characterId}`}
            >
              <button
                type="button"
                disabled={droppingCharacterReferenceFor === portrait.characterId}
                className="group relative h-20 w-20 overflow-hidden rounded-full border-2 border-border bg-background data-[dragover=true]:ring-2 data-[dragover=true]:ring-primary"
                onClick={() => {
                  if (portrait.portraitUrl) setLightboxCharacterId(portrait.characterId);
                }}
                onDragOver={e => {
                  if (onDropCharacterReference) e.preventDefault();
                }}
                onDrop={e => {
                  if (!onDropCharacterReference) return;
                  e.preventDefault();
                  void (async () => {
                    setDroppingCharacterReferenceFor(portrait.characterId);
                    try {
                      const url = await resolveDroppedImageInputToUrl(e);
                      if (url) onDropCharacterReference(portrait.characterId, url);
                    } finally {
                      setDroppingCharacterReferenceFor(current =>
                        current === portrait.characterId ? null : current
                      );
                    }
                  })();
                }}
                title={t(locale, "กดขยายภาพ หรือลากภาพมาวางแทน", "Click to enlarge, or drop an image here to replace")}
              >
                {droppingCharacterReferenceFor === portrait.characterId ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                    <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-white" />
                  </div>
                ) : null}
                {portrait.portraitUrl ? (
                  <img
                    src={portrait.portraitUrl}
                    alt={portrait.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-muted text-2xl text-muted-foreground">
                    ?
                  </span>
                )}
              </button>
              <span className="truncate text-xs font-medium">{portrait.name}</span>
              {portrait.portraitUrl ? (
                onChangeCharacterReference ? (
                  <button
                    type="button"
                    className="text-[11px] text-primary underline underline-offset-2 hover:text-primary/80"
                    onClick={() => onChangeCharacterReference(portrait.characterId)}
                    data-testid={`vd-storyboard-character-review-switch-${portrait.characterId}`}
                  >
                    {t(locale, "สลับภาพ", "Switch image")}
                  </button>
                ) : null
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                  <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
                  {t(locale, "ยังไม่มีภาพอ้างอิง", "No reference yet")}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {onGenerateAllStartFrameImages && shotsNeedingImages.length > 0 ? (
        <div>
          {confirmingGenerateAllImages ? (
            <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="font-medium">
                {t(locale, "ใช้ AI จริง มีค่าใช้จ่าย", "Uses real AI, spends credits.")}
              </p>
              <p className="text-muted-foreground">
                {t(
                  locale,
                  `จะสร้างภาพ ${shotsNeedingImages.length} ช็อตพร้อมกัน (แบบ async ภาพไหนเสร็จก่อนแสดงก่อน)`,
                  `Generates ${shotsNeedingImages.length} shots at once (async — each shows as soon as it's ready).`
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingGenerateAllImages(false)}>
                  {t(locale, "ยกเลิก", "Cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirmingGenerateAllImages(false);
                    onGenerateAllStartFrameImages(shotsNeedingImages);
                  }}
                  data-testid="vd-storyboard-confirm-generate-all-images"
                >
                  {t(locale, "สร้างเลย", "Generate")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setConfirmingGenerateAllImages(true)}
              data-testid="vd-storyboard-generate-all-images"
            >
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              {t(
                locale,
                `สร้างภาพทุกช็อต (${shotsNeedingImages.length} ช็อต, มีค่าใช้จ่าย)`,
                `Generate all shot images (${shotsNeedingImages.length} shots, paid)`
              )}
            </Button>
          )}
        </div>
      ) : null}

      {!startFramePlan?.frames?.length && onGenerateStartFramePlan ? (
        <div>
          {confirmingStartFramePlan ? (
            <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="font-medium">
                {t(locale, "การทำงานนี้ใช้ AI จริงและใช้เครดิต", "This uses real AI generation and spends credits.")}
              </p>
              <p className="text-muted-foreground">
                {t(
                  locale,
                  "ดำเนินการต่อเฉพาะเมื่อต้องการ prompt ภาพเริ่มต้นจริงของทุกช็อต",
                  "Continue only if you want real start-frame image prompts for every shot."
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingStartFramePlan(false)} disabled={generatingStartFramePlan}>
                  {t(locale, "ยกเลิก", "Cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirmingStartFramePlan(false);
                    onGenerateStartFramePlan();
                  }}
                  disabled={generatingStartFramePlan}
                  data-testid="vd-confirm-generate-start-frame-plan"
                >
                  {generatingStartFramePlan
                    ? t(locale, "กำลังสร้าง…", "Generating…")
                    : t(locale, "สร้าง prompt ภาพเริ่มต้น (มีค่าใช้จ่าย)", "Generate start-frame prompts (paid)")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmingStartFramePlan(true)}
              disabled={generatingStartFramePlan}
              data-testid="vd-generate-start-frame-plan"
            >
              {generatingStartFramePlan
                ? t(locale, "กำลังสร้าง…", "Generating…")
                : t(locale, "สร้าง prompt ภาพเริ่มต้น (มีค่าใช้จ่าย)", "Generate start-frame prompts (paid)")}
            </Button>
          )}
        </div>
      ) : null}

      {onGenerateVideoPromptPack ? (
        <div>
          {confirmingVideoPromptPack ? (
            <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="font-medium">
                {t(locale, "การทำงานนี้ใช้ AI จริงและใช้เครดิต", "This uses real AI generation and spends credits.")}
              </p>
              <p className="text-muted-foreground">{t2.generateVideoPromptPackConfirmNote}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmingVideoPromptPack(false)}
                  disabled={generatingVideoPromptPack}
                >
                  {t(locale, "ยกเลิก", "Cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirmingVideoPromptPack(false);
                    onGenerateVideoPromptPack();
                  }}
                  disabled={generatingVideoPromptPack}
                  data-testid="vd-confirm-generate-video-prompt-pack"
                >
                  {generatingVideoPromptPack
                    ? t2.generatingVideoPromptPack
                    : t2.generateVideoPromptPackWholeEpisode}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setConfirmingVideoPromptPack(true)}
              disabled={generatingVideoPromptPack}
              data-testid="vd-generate-video-prompt-pack"
            >
              {generatingVideoPromptPack ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {generatingVideoPromptPack
                ? t2.generatingVideoPromptPack
                : t2.generateVideoPromptPackWholeEpisode}
            </Button>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {shots.map((shot, i) => {
          const shotNumber = shot.shot_number ?? i + 1;
          const frame = frameByShot.get(shotNumber);
          const clip = clipByShot.get(shotNumber);
          const assetId = frame?.approvedMediaAssetId;
          const asset = assetId ? assetUrls[assetId] : undefined;

          return (
            <div
              key={shotNumber}
              className="flex flex-col gap-3 rounded-md border border-border p-3"
              data-testid={`vd-storyboard-shot-${shotNumber}`}
            >
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-40">
                <div
                  className={cn(
                    "relative aspect-[9/16] w-full overflow-hidden rounded-md border border-border bg-muted",
                    (asset?.thumbnailUrl || asset?.url) && "cursor-zoom-in"
                  )}
                  onClick={() => {
                    if (asset?.url) setLightboxShot(shotNumber);
                  }}
                  role={asset?.url ? "button" : undefined}
                  tabIndex={asset?.url ? 0 : undefined}
                  onKeyDown={e => {
                    if (asset?.url && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setLightboxShot(shotNumber);
                    }
                  }}
                  onDragOver={e => {
                    if (onDropStartFrame) e.preventDefault();
                  }}
                  onDrop={e => {
                    if (!onDropStartFrame) return;
                    e.preventDefault();
                    void (async () => {
                      setDroppingStartFrameForShot(shotNumber);
                      try {
                        const url = await resolveDroppedImageInputToUrl(e);
                        if (url) onDropStartFrame(shotNumber, url);
                      } finally {
                        setDroppingStartFrameForShot(current =>
                          current === shotNumber ? null : current
                        );
                      }
                    })();
                  }}
                >
                  {droppingStartFrameForShot === shotNumber ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-white" />
                    </div>
                  ) : null}
                  {asset?.thumbnailUrl || asset?.url ? (
                    <>
                      <img
                        src={asset.thumbnailUrl ?? asset.url}
                        alt={t(locale, `เฟรมเริ่มต้น ช็อต ${shotNumber}`, `Start frame, shot ${shotNumber}`)}
                        className="h-full w-full object-cover"
                      />
                      {asset.url ? (
                        <button
                          type="button"
                          className="absolute top-1 right-1 rounded bg-black/50 p-1 hover:bg-black/70"
                          title={t2.download}
                          aria-label={t2.download}
                          onClick={e => {
                            e.stopPropagation();
                            const filename =
                              seriesId != null
                                ? `series-${seriesId}-ep-${episodeNumber ?? 0}-shot-${shotNumber}.png`
                                : `shot-${shotNumber}.png`;
                            void downloadStoryboardMediaUrl(asset.url!, filename);
                          }}
                          data-testid={`vd-storyboard-download-image-${shotNumber}`}
                        >
                          <Download aria-hidden="true" className="h-3 w-3 text-white" />
                        </button>
                      ) : null}
                      <div className="absolute bottom-1 right-1 rounded bg-black/50 p-1">
                        <Expand aria-hidden="true" className="h-3 w-3 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <ImageOff aria-hidden="true" className="h-5 w-5" />
                      <span className="px-1 text-center text-[11px]">
                        {t(locale, "ยังไม่มีภาพ", "No image yet")}
                      </span>
                    </div>
                  )}
                </div>
                {onChangeStartFrame ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => onChangeStartFrame(shotNumber)}
                    data-testid={`vd-storyboard-change-image-${shotNumber}`}
                  >
                    {t(locale, "เปลี่ยนภาพ", "Change image")}
                  </Button>
                ) : null}
                {/* Image-to-image repair (Phase 6.5) — only shown once this
                    shot has an approved, resolvable image (nothing to repair
                    otherwise). */}
                {onOpenRepairImageDialog && asset?.url ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full gap-1 text-xs"
                    onClick={() => onOpenRepairImageDialog(shotNumber)}
                    data-testid={`vd-storyboard-repair-image-${shotNumber}`}
                  >
                    <Wand2 aria-hidden="true" className="h-3 w-3" />
                    {t2.repairImage}
                  </Button>
                ) : null}
                {onGeneratePromptAndImage ? (
                  choosingGenerateModeForShot === shotNumber ? (
                    <div className="flex flex-col gap-1.5 rounded-md border border-primary/40 bg-primary/5 p-2 text-[11px]">
                      <p className="font-medium">{t2.chooseGenerateMode}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-auto w-full flex-col items-start gap-0 whitespace-normal px-2 py-1.5 text-left text-[11px]"
                        onClick={() => {
                          setChoosingGenerateModeForShot(null);
                          onGeneratePromptAndImage(shotNumber, "single");
                        }}
                        data-testid={`vd-storyboard-generate-mode-single-${shotNumber}`}
                      >
                        <span className="font-medium">{t2.generateModeSingle}</span>
                        <span className="text-muted-foreground">{t2.generateModeSingleHint}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-auto w-full flex-col items-start gap-0 whitespace-normal px-2 py-1.5 text-left text-[11px]"
                        onClick={() => {
                          setChoosingGenerateModeForShot(null);
                          onGeneratePromptAndImage(shotNumber, "angles");
                        }}
                        data-testid={`vd-storyboard-generate-mode-angles-${shotNumber}`}
                      >
                        <span className="font-medium">{t2.generateModeAngles}</span>
                        <span className="text-muted-foreground">{t2.generateModeAnglesHint}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setChoosingGenerateModeForShot(null)}
                      >
                        {t(locale, "ยกเลิก", "Cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full gap-1 text-xs"
                      variant={frame?.imagePrompt ? "outline" : "default"}
                      onClick={() => setChoosingGenerateModeForShot(shotNumber)}
                      disabled={generatingPromptAndImageForShot.has(shotNumber)}
                      data-testid={`vd-storyboard-one-click-generate-${shotNumber}`}
                    >
                      {generatingPromptAndImageForShot.has(shotNumber) ? (
                        <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles aria-hidden="true" className="h-3 w-3" />
                      )}
                      {generatingPromptAndImageForShot.has(shotNumber)
                        ? t2.generatingPromptAndImage
                        : t2.generatePromptAndImage}
                    </Button>
                  )
                ) : null}
                {onGenerateStartFrameImage && frame?.imagePrompt ? (
                  confirmingImageForShot === shotNumber ? (
                    <div className="rounded-md border border-amber-400/50 bg-amber-50 p-2 text-[11px] dark:bg-amber-950/30">
                      <p className="font-medium">
                        {t(locale, "ใช้ AI จริง มีค่าใช้จ่าย", "Uses real AI, spends credits.")}
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setConfirmingImageForShot(null)}
                          disabled={generatingStartFrameImageForShot.has(shotNumber)}
                        >
                          {t(locale, "ยกเลิก", "Cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            setConfirmingImageForShot(null);
                            onGenerateStartFrameImage(shotNumber);
                          }}
                          disabled={generatingStartFrameImageForShot.has(shotNumber)}
                          data-testid={`vd-confirm-generate-image-${shotNumber}`}
                        >
                          {generatingStartFrameImageForShot.has(shotNumber) ? (
                            <>
                              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                              {t(locale, "กำลังสร้าง…", "Generating…")}
                            </>
                          ) : (
                            t(locale, "ยืนยัน", "Confirm")
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full gap-1 text-xs"
                      onClick={() => setConfirmingImageForShot(shotNumber)}
                      disabled={generatingStartFrameImageForShot.has(shotNumber)}
                      data-testid={`vd-generate-image-${shotNumber}`}
                    >
                      {generatingStartFrameImageForShot.has(shotNumber) ? (
                        <>
                          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                          {t(locale, "กำลังสร้าง…", "Generating…")}
                        </>
                      ) : (
                        <>
                          <Sparkles aria-hidden="true" className="h-3 w-3" />
                          {t(locale, "สร้างภาพ (AI)", "Generate image (AI)")}
                        </>
                      )}
                    </Button>
                  )
                ) : null}
                {onGenerateAngleVariations && frame?.imagePrompt ? (
                  confirmingAngleVariationsForShot === shotNumber ? (
                    <div className="rounded-md border border-amber-400/50 bg-amber-50 p-2 text-[11px] dark:bg-amber-950/30">
                      <p className="font-medium">
                        {t(
                          locale,
                          "สร้างภาพเดียว 9 มุมกล้อง ใช้ AI จริง มีค่าใช้จ่ายสูงกว่าปกติ",
                          "One image with 9 camera angles — uses real AI, costs more than a single render."
                        )}
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setConfirmingAngleVariationsForShot(null)}
                          disabled={generatingAngleVariationsForShot === shotNumber}
                        >
                          {t(locale, "ยกเลิก", "Cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            setConfirmingAngleVariationsForShot(null);
                            onGenerateAngleVariations(shotNumber);
                          }}
                          disabled={generatingAngleVariationsForShot === shotNumber}
                          data-testid={`vd-confirm-generate-angles-${shotNumber}`}
                        >
                          {generatingAngleVariationsForShot === shotNumber
                            ? t(locale, "กำลังสร้าง…", "Generating…")
                            : t(locale, "ยืนยัน", "Confirm")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full gap-1 text-xs"
                      onClick={() => setConfirmingAngleVariationsForShot(shotNumber)}
                      disabled={
                        generatingAngleVariationsForShot === shotNumber || splittingShot === shotNumber
                      }
                      data-testid={`vd-generate-angles-${shotNumber}`}
                    >
                      <Sparkles aria-hidden="true" className="h-3 w-3" />
                      {generatingAngleVariationsForShot === shotNumber
                        ? t(locale, "กำลังสร้าง…", "Generating…")
                        : splittingShot === shotNumber
                          ? t(locale, "กำลังตัดภาพ…", "Splitting…")
                          : t(locale, "สร้างหลายมุมกล้อง (3x3)", "Generate multi-angle (3x3)")}
                    </Button>
                  )
                ) : null}

                {/* Reference strip (Phase 2.5) — additional images sent
                    alongside the approved start frame to video generation,
                    distinct from the single "start frame" slot above. */}
                {onAddShotReference || onRemoveShotReference ? (
                  <ShotReferenceStrip
                    locale={locale}
                    t={t2}
                    shotNumber={shotNumber}
                    references={shotReferencesByShot[shotNumber] ?? []}
                    maxReferenceImages={
                      videoModels.find(m => m.modelId === selectedVideoModelId)
                        ?.maxReferenceImages
                    }
                    adding={addingShotReferenceForShot.has(shotNumber)}
                    dragOver={referenceDragOverShot === shotNumber}
                    onDragOverChange={over =>
                      setReferenceDragOverShot(over ? shotNumber : null)
                    }
                    onAdd={payload => onAddShotReference?.(shotNumber, payload)}
                    onRequestRemove={referenceId =>
                      setConfirmingRemoveReference({ shotNumber, referenceId })
                    }
                    onUseAsMain={
                      onUseShotReferenceAsMain
                        ? mediaAssetId => onUseShotReferenceAsMain(shotNumber, mediaAssetId)
                        : undefined
                    }
                    usingAsMain={usingShotReferenceAsMainForShot === shotNumber}
                  />
                ) : null}

                {/* Upload video file per shot (2026-07-07 upgrade, fixed
                    2026-07-07: previously only rendered when a
                    `motionPromptPack` clip already existed for this shot, so
                    shot 2+ silently had no upload option until a video
                    prompt had been generated at least once). Shown on EVERY
                    shot now — when no clip exists yet, `onUploadVideoClip`
                    is called with `shotNumber` itself as the target clip
                    number, and the page-level handler creates a minimal
                    `{clipNumber, sourceShotNumbers: [shotNumber]}` clip
                    entry through the same `persistVideoTask`/
                    `updateEpisodeDraft` convention `generateShotVideoPrompt`
                    (router) already uses for this exact "no matching clip
                    yet" case. Hidden while a video is already
                    rendering/uploading for this clip. */}
                {onUploadVideoClip ? (
                  <label
                    className={cn(
                      "flex h-7 w-fit cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2 text-[11px] text-muted-foreground hover:border-primary hover:text-primary",
                      uploadingVideoClipForClip.has(clip?.clipNumber ?? shotNumber) &&
                        "pointer-events-none opacity-60"
                    )}
                    data-testid={`vd-storyboard-upload-video-${shotNumber}`}
                  >
                    {uploadingVideoClipForClip.has(clip?.clipNumber ?? shotNumber) ? (
                      <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload aria-hidden="true" className="h-3 w-3" />
                    )}
                    {uploadingVideoClipForClip.has(clip?.clipNumber ?? shotNumber)
                      ? t2.uploadingVideoClip
                      : t2.uploadVideoClip}
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/*"
                      className="hidden"
                      disabled={uploadingVideoClipForClip.has(clip?.clipNumber ?? shotNumber)}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (!file.type.startsWith("video/")) {
                          toast.error(t2.unsupportedVideoFileType);
                          return;
                        }
                        if (file.size > VD_UPLOAD_VIDEO_FILE_MAX_BYTES) {
                          toast.error(
                            vdCopyWithCount(
                              t2.videoFileTooLarge,
                              Math.round(VD_UPLOAD_VIDEO_FILE_MAX_BYTES / (1024 * 1024)),
                            ),
                          );
                          return;
                        }
                        onUploadVideoClip(clip?.clipNumber ?? shotNumber, file, shotNumber);
                      }}
                    />
                  </label>
                ) : null}

                {/* Completed video-clip player (relocated 2026-07-06 — moved
                    from the right column to sit directly under this shot's
                    start-frame/reference column, so image + video for a shot
                    live in one place). Only the RESULT display moved here;
                    the "Generate video (paid)" button and the trimmed-
                    reference notice stay in the right column next to the
                    video prompt, since they belong with the prompt editor. */}
                {clip?.videoTask?.videoUrl ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="relative w-full overflow-hidden rounded-md border border-border bg-black">
                      <video
                        src={clip.videoTask.videoUrl}
                        poster={asset?.url || asset?.thumbnailUrl || undefined}
                        controls
                        playsInline
                        preload="metadata"
                        className="aspect-[9/16] w-full bg-black"
                        data-testid={`vd-storyboard-video-player-${clip.clipNumber}`}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {clip.durationSeconds ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                          {clip.durationSeconds}
                          {t2.videoClipDurationLabel}
                        </Badge>
                      ) : null}
                      {clip.videoTask.source === "upload" ? (
                        <Badge
                          variant="outline"
                          className="gap-1 px-1.5 py-0 text-[9px]"
                          data-testid={`vd-storyboard-video-source-upload-${clip.clipNumber}`}
                        >
                          <Upload aria-hidden="true" className="h-2.5 w-2.5" />
                          {t2.videoClipSourceUpload}
                        </Badge>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-1.5 text-[10px]"
                        onClick={() => setFullScreenVideoClip(clip.clipNumber)}
                        data-testid={`vd-storyboard-video-open-full-${clip.clipNumber}`}
                      >
                        <Expand aria-hidden="true" className="h-3 w-3" />
                        {t2.videoClipOpenFull}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-1.5 text-[10px]"
                        onClick={() => {
                          const filename =
                            seriesId != null
                              ? `series-${seriesId}-ep-${episodeNumber ?? 0}-clip-${clip.clipNumber}.mp4`
                              : `clip-${clip.clipNumber}.mp4`;
                          void downloadStoryboardMediaUrl(clip.videoTask!.videoUrl!, filename);
                        }}
                        data-testid={`vd-storyboard-video-download-${clip.clipNumber}`}
                      >
                        <Download aria-hidden="true" className="h-3 w-3" />
                        {t2.download}
                      </Button>
                    </div>
                    {confirmingRegenerateVideoForClip === clip.clipNumber ? (
                      <div className="rounded-md border border-amber-400/50 bg-amber-50 p-2 text-[11px] dark:bg-amber-950/30">
                        <p className="font-medium">
                          {t(locale, "ใช้ AI จริง มีค่าใช้จ่าย", "Uses real AI, spends credits.")}
                        </p>
                        <div className="mt-1.5 flex gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => setConfirmingRegenerateVideoForClip(null)}
                            disabled={generatingVideoClipForClip.has(clip.clipNumber)}
                          >
                            {t(locale, "ยกเลิก", "Cancel")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => {
                              setConfirmingRegenerateVideoForClip(null);
                              onGenerateVideoClip?.(clip.clipNumber);
                            }}
                            disabled={generatingVideoClipForClip.has(clip.clipNumber)}
                            data-testid={`vd-confirm-regenerate-video-${clip.clipNumber}`}
                          >
                            {generatingVideoClipForClip.has(clip.clipNumber) ? (
                              <>
                                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                                {t2.videoClipGenerating}
                              </>
                            ) : (
                              t(locale, "ยืนยัน", "Confirm")
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit gap-1.5 text-xs"
                        onClick={() => setConfirmingRegenerateVideoForClip(clip.clipNumber)}
                        disabled={
                          !clip.prompt?.trim() ||
                          generatingVideoClipForClip.has(clip.clipNumber)
                        }
                        data-testid={`vd-storyboard-regenerate-video-${clip.clipNumber}`}
                      >
                        {generatingVideoClipForClip.has(clip.clipNumber) ? (
                          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles aria-hidden="true" className="h-3 w-3" />
                        )}
                        {t2.videoClipRegenerate}
                      </Button>
                    )}
                  </div>
                ) : onGenerateVideoClip && clip && generatingVideoClipForClip.has(clip.clipNumber) ? (
                  <div className="relative w-full overflow-hidden rounded-md border border-dashed border-border bg-muted/30">
                    <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                      <span className="px-1 text-center text-[11px]">
                        {t2.videoClipGenerating}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {t(locale, `ช็อต ${shotNumber}`, `Shot ${shotNumber}`)}
                  </span>
                  {shot.duration_seconds ? (
                    <span className="text-xs text-muted-foreground">{shot.duration_seconds}s</span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {shot.visual_description || shot.action || "—"}
                </p>
                {shot.camera?.shot_type ? (
                  <p className="text-xs text-muted-foreground">
                    {[shot.camera.shot_type, shot.camera.angle, shot.camera.movement]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {(() => {
                  // `required_character_refs` is the identity-lock key list
                  // generation actually uses — prefer it over `characters`
                  // (a looser display list) so what's shown here always
                  // matches what the render call will reference. Only the
                  // character(s) THIS shot needs, never the full roster.
                  const keys =
                    shot.required_character_refs?.length
                      ? shot.required_character_refs
                      : shot.characters ?? [];
                  if (keys.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <Users aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                      {keys.map(key => {
                        const portrait = characterPortraits[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            className="group relative flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-0.5 pr-2 text-xs hover:bg-muted disabled:cursor-default disabled:opacity-100 data-[dragover=true]:ring-2 data-[dragover=true]:ring-primary"
                            onClick={() =>
                              portrait?.characterId &&
                              onChangeCharacterReference?.(portrait.characterId)
                            }
                            disabled={
                              !portrait ||
                              !onChangeCharacterReference ||
                              droppingCharacterReferenceFor === portrait?.characterId
                            }
                            title={
                              onChangeCharacterReference
                                ? t(locale, "เปลี่ยนภาพอ้างอิงตัวละครนี้ (หรือลากภาพมาวางที่นี่)", "Change this character's reference image (or drop an image here)")
                                : undefined
                            }
                            onDragOver={e => {
                              if (portrait?.characterId && onDropCharacterReference) e.preventDefault();
                            }}
                            onDrop={e => {
                              if (!portrait?.characterId || !onDropCharacterReference) return;
                              e.preventDefault();
                              const characterId = portrait.characterId;
                              void (async () => {
                                setDroppingCharacterReferenceFor(characterId);
                                try {
                                  const url = await resolveDroppedImageInputToUrl(e);
                                  if (url) onDropCharacterReference(characterId, url);
                                } finally {
                                  setDroppingCharacterReferenceFor(current =>
                                    current === characterId ? null : current
                                  );
                                }
                              })();
                            }}
                            data-testid={`vd-storyboard-character-chip-${shotNumber}-${key}`}
                          >
                            {droppingCharacterReferenceFor === portrait?.characterId ? (
                              <span className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/50">
                                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin text-white" />
                              </span>
                            ) : null}
                            {portrait?.portraitUrl ? (
                              <img
                                src={portrait.portraitUrl}
                                alt={portrait.name}
                                className="h-5 w-5 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">
                                ?
                              </span>
                            )}
                            <span>{portrait?.name ?? key}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {(() => {
                  // Product tie-in chip (spec §13 + 2026-07-06 product-
                  // reference upgrade) — now a first-class image chip like
                  // the character chips above: shows the actual product
                  // reference thumbnail (first selected ref, falling back to
                  // the first available image), a lightbox on click, and a
                  // "เปลี่ยนภาพสินค้า" affordance so the user can choose which
                  // product image(s) generation actually uses for this shot.
                  // Shown whenever the shot carries a tie-in placement OR
                  // already has product reference URLs, so the picker/change
                  // action stays reachable even if the read-only placement
                  // metadata is momentarily absent.
                  const tieIn = productTieInByShot[shotNumber];
                  const shotProductRefUrls = frame?.productReferenceAssetIds ?? [];
                  if (!tieIn && shotProductRefUrls.length === 0) return null;
                  const thumbnailUrl = shotProductRefUrls[0] ?? productImages[0]?.url;
                  const extraCount = Math.max(0, shotProductRefUrls.length - 1);
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <Package aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                      <span
                        className="group flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-400/10 py-0.5 pl-0.5 pr-2 text-xs text-amber-700 dark:text-amber-400"
                        title={
                          [
                            tieIn?.benefitTalkingPoint ??
                              t(locale, "สินค้าผูกเรื่องปรากฏในช็อตนี้", "Product tie-in appears in this shot"),
                            tieIn?.requiredDisclosure
                              ? `${t(locale, "คำเตือนบังคับ", "Required disclosure")}: ${tieIn.requiredDisclosure}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join("\n")
                        }
                        data-testid={`vd-storyboard-product-tie-in-chip-${shotNumber}`}
                      >
                        <button
                          type="button"
                          className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full disabled:cursor-default"
                          onClick={() => thumbnailUrl && setLightboxProductImageUrl(thumbnailUrl)}
                          disabled={!thumbnailUrl}
                          title={
                            thumbnailUrl
                              ? t(locale, "ดูภาพสินค้าอ้างอิง", "View product reference image")
                              : undefined
                          }
                        >
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={tieIn?.productName ?? t(locale, "สินค้า", "Product")}
                              className="h-5 w-5 rounded-full object-cover"
                            />
                          ) : (
                            <Package aria-hidden="true" className="h-4 w-4" />
                          )}
                          {extraCount > 0 ? (
                            <span
                              className="absolute -bottom-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-semibold leading-none text-white"
                              data-testid={`vd-storyboard-product-tie-in-chip-${shotNumber}-extra-count`}
                            >
                              {vdCopyWithCount(t2.productImageMultipleBadge, extraCount)}
                            </span>
                          ) : null}
                        </button>
                        {tieIn?.productName ??
                          t(locale, "สินค้าผูกเรื่อง", "Tied-in product")}
                        {tieIn?.placementStyle ? (
                          <Badge variant="outline" className="px-1 py-0 text-[9px]">
                            {tieIn.placementStyle === "hero_prop"
                              ? t(locale, "อุปกรณ์หลัก", "hero prop")
                              : tieIn.placementStyle === "background"
                                ? t(locale, "พื้นหลัง", "background")
                                : t(locale, "กำลังใช้งาน", "in use")}
                          </Badge>
                        ) : null}
                        {onSaveShotProductReferences ? (
                          <button
                            type="button"
                            className="ml-0.5 text-[10px] font-medium underline decoration-dotted underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300"
                            onClick={() => {
                              setProductImagePickerDraft(shotProductRefUrls);
                              setProductImagePickerForShot(shotNumber);
                            }}
                            data-testid={`vd-storyboard-change-product-image-${shotNumber}`}
                          >
                            {t2.changeProductImage}
                          </button>
                        ) : null}
                      </span>
                    </div>
                  );
                })()}

                {frame || onEditStartFramePrompt ? (
                  <InlineEditablePromptBox
                    locale={locale}
                    t={t2}
                    title={t(locale, "พรอมต์ภาพเริ่มต้น", "Start-frame image prompt")}
                    prompt={frame?.imagePrompt ?? ""}
                    emptyLabel={t(locale, "ยังไม่มีพรอมต์ภาพ", "No image prompt yet.")}
                    isEditing={editingImagePromptForShot === shotNumber}
                    draft={editingImagePromptDraft}
                    onStartEdit={() => {
                      setEditingImagePromptForShot(shotNumber);
                      setEditingImagePromptDraft(frame?.imagePrompt ?? "");
                    }}
                    onDraftChange={setEditingImagePromptDraft}
                    onSave={() => {
                      onSaveStartFramePrompt?.(shotNumber, editingImagePromptDraft);
                      setEditingImagePromptForShot(null);
                    }}
                    onCancelEdit={() => setEditingImagePromptForShot(null)}
                    canSaveFree={Boolean(onSaveStartFramePrompt)}
                    onAiAdjust={
                      onEditStartFramePrompt
                        ? () => onEditStartFramePrompt(shotNumber, frame?.imagePrompt ?? "")
                        : undefined
                    }
                    testIdPrefix={`vd-storyboard-image-prompt-${shotNumber}`}
                    maxChars={VD_IMAGE_PROMPT_MAX}
                  />
                ) : null}

                <InlineEditablePromptBox
                  locale={locale}
                  t={t2}
                  title={t(locale, "พรอมต์วิดีโอ", "Video prompt")}
                  prompt={clip?.prompt ?? ""}
                  emptyLabel={t(locale, "ยังไม่มีพรอมต์วิดีโอ", "No video prompt yet.")}
                  isEditing={editingVideoPromptForShot === shotNumber}
                  draft={editingVideoPromptDraft}
                  onStartEdit={() => {
                    setEditingVideoPromptForShot(shotNumber);
                    setEditingVideoPromptDraft(clip?.prompt ?? "");
                  }}
                  onDraftChange={setEditingVideoPromptDraft}
                  onSave={() => {
                    onSaveVideoPrompt?.(shotNumber, editingVideoPromptDraft);
                    setEditingVideoPromptForShot(null);
                  }}
                  onCancelEdit={() => setEditingVideoPromptForShot(null)}
                  canSaveFree={Boolean(onSaveVideoPrompt)}
                  onAiAdjust={
                    onEditVideoPrompt
                      ? () => onEditVideoPrompt(shotNumber, clip?.prompt ?? "")
                      : undefined
                  }
                  testIdPrefix={`vd-storyboard-video-prompt-${shotNumber}`}
                  maxChars={VD_VIDEO_PROMPT_MAX}
                />

                {/* Per-shot video prompt generation (Phase 6.6) — the LLM
                    analyzes the shot's ACTUAL approved image (image-grounded,
                    not just character/description text), so this is disabled
                    until an approved image exists. Repeatable: changing the
                    image and clicking again regenerates the prompt from the
                    new image. */}
                {onGenerateShotVideoPrompt ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-fit gap-1.5 text-xs"
                      onClick={() => onGenerateShotVideoPrompt(shotNumber)}
                      disabled={
                        !asset?.url || generatingShotVideoPromptForShot.has(shotNumber)
                      }
                      title={!asset?.url ? t2.generateShotVideoPromptNeedsImage : undefined}
                      data-testid={`vd-storyboard-generate-shot-video-prompt-${shotNumber}`}
                    >
                      {generatingShotVideoPromptForShot.has(shotNumber) ? (
                        <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles aria-hidden="true" className="h-3 w-3" />
                      )}
                      {generatingShotVideoPromptForShot.has(shotNumber)
                        ? t2.generatingShotVideoPrompt
                        : t2.generateShotVideoPrompt}
                    </Button>
                    {!asset?.url ? (
                      <span className="text-[10px] text-muted-foreground">
                        {t2.generateShotVideoPromptNeedsImage}
                      </span>
                    ) : usedVisionByShot[shotNumber] ? (
                      <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[9px]">
                        <Sparkles aria-hidden="true" className="h-2.5 w-2.5" />
                        {t2.usedVisionNote}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}

                {/* Dialogue box (Phase 3.4) — surfaces `clip.dialogue[]`,
                    synced automatically from `dialogueAudioPlan` onto the
                    motion prompt pack when it's generated. */}
                {clip ? (
                  <ClipDialogueBox
                    locale={locale}
                    t={t2}
                    clip={clip}
                    characterPortraits={characterPortraits}
                    nativeAudio={
                      // `ttsFallbackByClip` (from `generateVideoClip`'s
                      // response) is authoritative once this clip has been
                      // generated at least once — some models fall back to
                      // TTS even when nominally native-audio-capable. Before
                      // that, fall back to the selected model's static
                      // capability as a best-effort preview.
                      clip.clipNumber in ttsFallbackByClip
                        ? !ttsFallbackByClip[clip.clipNumber]
                        : Boolean(
                            videoModels.find(m => m.modelId === selectedVideoModelId)
                              ?.nativeAudioDialogue
                          )
                    }
                    isEditing={editingDialogueForClip === clip.clipNumber}
                    draft={editingDialogueDraft}
                    saving={savingDialogueForClip === clip.clipNumber}
                    onStartEdit={() => {
                      setEditingDialogueForClip(clip.clipNumber);
                      setEditingDialogueDraft(clip.dialogue ?? []);
                    }}
                    onDraftChange={setEditingDialogueDraft}
                    onSave={() => {
                      onSaveClipDialogue?.(clip.clipNumber, editingDialogueDraft);
                      setEditingDialogueForClip(null);
                    }}
                    onCancelEdit={() => setEditingDialogueForClip(null)}
                    canEdit={Boolean(onSaveClipDialogue)}
                  />
                ) : null}

                {/* Video clip generation (`generateVideoClip`) — async
                    submit + poll, same convention as start-frame image
                    generation. The RESULT display (player, duration badge,
                    full-screen, regenerate) lives in the left column next to
                    the start frame (relocated 2026-07-06); this button only
                    submits a new render when none exists yet. */}
                {clip && onGenerateVideoClip ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    {!clip.videoTask?.videoUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit gap-1.5 text-xs"
                        onClick={() => onGenerateVideoClip(clip.clipNumber)}
                        disabled={
                          !clip.prompt?.trim() ||
                          generatingVideoClipForClip.has(clip.clipNumber)
                        }
                        data-testid={`vd-storyboard-generate-video-${clip.clipNumber}`}
                      >
                        {generatingVideoClipForClip.has(clip.clipNumber) ? (
                          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles aria-hidden="true" className="h-3 w-3" />
                        )}
                        {generatingVideoClipForClip.has(clip.clipNumber)
                          ? t2.videoClipGenerating
                          : t(locale, "สร้างวิดีโอ (มีค่าใช้จ่าย)", "Generate video (paid)")}
                      </Button>
                    ) : null}
                    {(trimmedReferenceCountByClip[clip.clipNumber] ?? 0) > 0 ? (
                      <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
                        {t(
                          locale,
                          `ภาพอ้างอิงเกินขีดจำกัดของโมเดล ${trimmedReferenceCountByClip[clip.clipNumber]} ภาพถูกตัดออกก่อนส่ง`,
                          `${trimmedReferenceCountByClip[clip.clipNumber]} reference image(s) exceeded the model limit and were not sent`
                        )}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

              {angleCandidatesByShot[shotNumber] || angleGridHydrationErrorShots.has(shotNumber) ? (
                <div className="flex w-full flex-col gap-2.5 rounded-lg border border-border bg-gradient-to-b from-muted/40 to-muted/10 p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex flex-col leading-tight">
                        <span className="text-xs font-semibold">
                          {t2.pickBestAngleTitle}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {t(locale, `ช็อต ${shotNumber}`, `Shot ${shotNumber}`)}
                          {angleCandidatesByShot[shotNumber]
                            ? ` · ${vdCopyWithCount(t2.angleTileCount, angleCandidatesByShot[shotNumber].length)}`
                            : ""}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => {
                        setAngleCandidatesByShot(prev => {
                          const next = { ...prev };
                          delete next[shotNumber];
                          return next;
                        });
                        setSelectedAngleCandidateIndexesByShot(prev => {
                          const next = { ...prev };
                          delete next[shotNumber];
                          return next;
                        });
                        setAngleGridHydrationErrorShots(prev => {
                          if (!prev.has(shotNumber)) return prev;
                          const next = new Set(prev);
                          next.delete(shotNumber);
                          return next;
                        });
                        hydratedAngleGridShotsRef.current.delete(shotNumber);
                        onDismissAngleVariations?.(shotNumber);
                      }}
                      data-testid={`vd-angle-candidates-dismiss-${shotNumber}`}
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                      {t(locale, "ปิด", "Dismiss")}
                    </Button>
                  </div>

                  {angleGridHydrationErrorShots.has(shotNumber) && !angleCandidatesByShot[shotNumber] ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        {t(locale, "โหลดภาพเดิมไม่สำเร็จ ลองใหม่อีกครั้ง", "Couldn't reload the saved grid — try again.")}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          setAngleGridHydrationErrorShots(prev => {
                            const next = new Set(prev);
                            next.delete(shotNumber);
                            return next;
                          });
                          hydratedAngleGridShotsRef.current.delete(shotNumber);
                        }}
                        data-testid={`vd-angle-candidates-retry-hydrate-${shotNumber}`}
                      >
                        {t(locale, "ลองอีกครั้ง", "Retry")}
                      </Button>
                    </div>
                  ) : angleCandidatesByShot[shotNumber]?.length === 0 ? (
                    <p className="text-xs text-destructive">
                      {t(locale, "ตัดภาพไม่สำเร็จ ลองใหม่อีกครั้ง", "Failed to split the image — try again.")}
                    </p>
                  ) : (
                    <>
                      {/* Sticky so the pick/reference actions stay reachable
                          without scrolling past all 9 tiles (small-screen
                          feedback: tiles used to render near full-width,
                          forcing endless scrolling to reach these actions). */}
                      <div className="sticky top-0 z-10 -mx-3 -mt-2 flex flex-wrap items-center gap-1.5 border-b border-border/60 bg-muted/95 px-3 pb-2 pt-2 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-7 gap-1 px-2.5 text-xs shadow-sm"
                          disabled={
                            (selectedAngleCandidateIndexesByShot[shotNumber]?.size ?? 0) !== 1 ||
                            applyingAngleCandidateForShot.has(shotNumber)
                          }
                          onClick={() => {
                            const list = angleCandidatesByShot[shotNumber] ?? [];
                            const selected = selectedAngleCandidateIndexesByShot[shotNumber];
                            const onlyIndex = selected && selected.size === 1 ? [...selected][0] : undefined;
                            const dataUrl = onlyIndex != null ? list[onlyIndex]?.dataUrl : undefined;
                            if (!dataUrl) return;
                            // 2026-07-07 fix: swap FIRST, clear the picker
                            // only on success — previously the picker was
                            // cleared synchronously here regardless of
                            // whether the (unawaited) async swap succeeded,
                            // so a failed upload/resolve/set left the user
                            // with no picker AND no updated start frame.
                            setApplyingAngleCandidateForShot(prev => {
                              const next = new Set(prev);
                              next.add(shotNumber);
                              return next;
                            });
                            void Promise.resolve(
                              onPickAngleVariationCandidate?.(shotNumber, dataUrl)
                            )
                              .then(() => {
                                setAngleCandidatesByShot(prev => {
                                  const next = { ...prev };
                                  delete next[shotNumber];
                                  return next;
                                });
                                setSelectedAngleCandidateIndexesByShot(prev => {
                                  const next = { ...prev };
                                  delete next[shotNumber];
                                  return next;
                                });
                              })
                              .catch(() => {
                                // Swap failed — leave the picker + selection
                                // intact so the user can retry; the caller's
                                // own catch handler is responsible for
                                // surfacing an error toast.
                              })
                              .finally(() => {
                                setApplyingAngleCandidateForShot(prev => {
                                  if (!prev.has(shotNumber)) return prev;
                                  const next = new Set(prev);
                                  next.delete(shotNumber);
                                  return next;
                                });
                              });
                          }}
                          data-testid={`vd-angle-candidate-use-as-start-frame-${shotNumber}`}
                        >
                          {applyingAngleCandidateForShot.has(shotNumber) ? (
                            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check aria-hidden="true" className="h-3 w-3" />
                          )}
                          {t2.useAsStartFrame}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2.5 text-xs"
                          disabled={
                            !onAddShotReference ||
                            (selectedAngleCandidateIndexesByShot[shotNumber]?.size ?? 0) === 0
                          }
                          onClick={() => {
                            const list = angleCandidatesByShot[shotNumber] ?? [];
                            const selected = selectedAngleCandidateIndexesByShot[shotNumber];
                            if (!selected || selected.size === 0) return;
                            for (const idx of selected) {
                              const dataUrl = list[idx]?.dataUrl;
                              if (dataUrl) {
                                onAddShotReference?.(shotNumber, { url: dataUrl, source: "grid_cut" });
                              }
                            }
                            setSelectedAngleCandidateIndexesByShot(prev => {
                              const next = { ...prev };
                              delete next[shotNumber];
                              return next;
                            });
                          }}
                          data-testid={`vd-angle-candidate-add-as-references-${shotNumber}`}
                        >
                          <Users aria-hidden="true" className="h-3 w-3" />
                          {vdCopyWithCount(
                            t2.addAsReferences,
                            selectedAngleCandidateIndexesByShot[shotNumber]?.size ?? 0
                          )}
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-0.5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-9">
                        {(angleCandidatesByShot[shotNumber] ?? []).map(({ dataUrl, originalIndex }, idx) => {
                          const isSelected =
                            selectedAngleCandidateIndexesByShot[shotNumber]?.has(idx) ?? false;
                          return (
                            <div
                              key={originalIndex}
                              className={cn(
                                "group relative mx-auto aspect-[9/16] w-full max-w-[6rem] overflow-hidden rounded-md border shadow-sm transition-shadow",
                                isSelected
                                  ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                                  : "border-border hover:shadow-md hover:ring-2 hover:ring-primary/40"
                              )}
                            >
                              <button
                                type="button"
                                className="block h-full w-full"
                                onClick={() =>
                                  setLightboxAngleCandidate({ shotNumber, index: idx })
                                }
                                aria-label={t(
                                  locale,
                                  `ดูมุมกล้อง ${originalIndex + 1} แบบเต็มจอ`,
                                  `View angle ${originalIndex + 1} fullscreen`
                                )}
                                data-testid={`vd-angle-candidate-${shotNumber}-${originalIndex}`}
                              >
                                <img
                                  src={dataUrl}
                                  alt={`Angle ${originalIndex + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                              {/* Angle index chip — always visible (not
                                  hover-only) so the user can reference "มุม 3"
                                  etc. without hovering every tile. */}
                              <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white">
                                {t(locale, `มุม ${originalIndex + 1}`, `Angle ${originalIndex + 1}`)}
                              </span>
                              {isSelected ? (
                                <span className="pointer-events-none absolute inset-0 bg-primary/10" />
                              ) : null}
                              {/* Hit areas widened to the 40px tablet-tap
                                  minimum (2026-07-07 fix) — the visible
                                  circle stays small (h-4 w-4) for the dense
                                  9-tile grid, but the button itself is at
                                  least 40x40 via padding + negative margins
                                  so a fingertip on a tablet can actually
                                  land on it without missing. */}
                              <button
                                type="button"
                                className={cn(
                                  "absolute -left-1.5 -top-1.5 flex h-10 w-10 items-center justify-center rounded-full"
                                )}
                                onClick={() =>
                                  setSelectedAngleCandidateIndexesByShot(prev => {
                                    const current = new Set(prev[shotNumber] ?? []);
                                    if (current.has(idx)) {
                                      current.delete(idx);
                                    } else {
                                      current.add(idx);
                                    }
                                    return { ...prev, [shotNumber]: current };
                                  })
                                }
                                aria-label={t(
                                  locale,
                                  `เลือกมุมกล้อง ${originalIndex + 1}`,
                                  `Select angle ${originalIndex + 1}`
                                )}
                                aria-pressed={isSelected}
                                data-testid={`vd-angle-candidate-select-${shotNumber}-${originalIndex}`}
                              >
                                <span
                                  className={cn(
                                    "flex h-4 w-4 items-center justify-center rounded-full border",
                                    isSelected
                                      ? "border-primary-foreground bg-primary text-primary-foreground"
                                      : "border-white/70 bg-black/40 text-white/90"
                                  )}
                                >
                                  {isSelected ? <Check aria-hidden="true" className="h-2.5 w-2.5" /> : null}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="absolute -right-1.5 -top-1.5 flex h-10 w-10 items-center justify-center rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                                onClick={() => {
                                  setAngleCandidatesByShot(prev => {
                                    const list = prev[shotNumber] ?? [];
                                    return {
                                      ...prev,
                                      [shotNumber]: list.filter((_, i) => i !== idx),
                                    };
                                  });
                                  setSelectedAngleCandidateIndexesByShot(prev => {
                                    const current = prev[shotNumber];
                                    if (!current || current.size === 0) return prev;
                                    const next = new Set<number>();
                                    for (const selectedIdx of current) {
                                      if (selectedIdx === idx) continue;
                                      next.add(selectedIdx > idx ? selectedIdx - 1 : selectedIdx);
                                    }
                                    return { ...prev, [shotNumber]: next };
                                  });
                                  // Persist the deletion so it survives a
                                  // reload — keyed by the tile's ORIGINAL
                                  // 0..8 grid position, not its position in
                                  // this already-filtered list.
                                  onDeleteAngleVariationCandidate?.(shotNumber, originalIndex);
                                }}
                                aria-label={t(
                                  locale,
                                  `ลบมุมกล้อง ${originalIndex + 1} ออกจากตัวเลือก`,
                                  `Remove angle ${originalIndex + 1} from candidates`
                                )}
                                data-testid={`vd-angle-candidate-remove-${shotNumber}-${originalIndex}`}
                              >
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white">
                                  <X aria-hidden="true" className="h-2.5 w-2.5" />
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {/* Image-to-image repair dialog (Phase 6.5) */}
              {repairImageDialogForShot === shotNumber ? (
                <RepairImageDialog
                  locale={locale}
                  t={t2}
                  shotNumber={shotNumber}
                  beforeUrl={asset?.url}
                  instruction={repairImageInstructionByShot[shotNumber] ?? ""}
                  onInstructionChange={value =>
                    setRepairImageInstructionByShot(prev => ({ ...prev, [shotNumber]: value }))
                  }
                  submitting={repairImageSubmittingForShot === shotNumber}
                  result={repairImageResultByShot[shotNumber]}
                  error={repairImageErrorByShot[shotNumber]}
                  onSubmit={() =>
                    onSubmitRepairImage?.(
                      shotNumber,
                      (repairImageInstructionByShot[shotNumber] ?? "").trim()
                    )
                  }
                  onAccept={() => {
                    onAcceptRepairImage?.(shotNumber);
                    setRepairImageInstructionByShot(prev => {
                      const next = { ...prev };
                      delete next[shotNumber];
                      return next;
                    });
                  }}
                  onDiscard={() => {
                    onDiscardRepairImage?.(shotNumber);
                    setRepairImageInstructionByShot(prev => {
                      const next = { ...prev };
                      delete next[shotNumber];
                      return next;
                    });
                  }}
                  onClose={() => onCloseRepairImageDialog?.()}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Whole-episode compiled video (2026-07-06 download + assembly
          upgrade) — a whole-episode artifact, so it sits BELOW the per-shot
          list rather than inside any one shot's card. Idle / processing /
          done / failed states, matching the state-matrix in the task packet. */}
      {onAssembleCompiledVideo ? (
        <div
          className="mt-4 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
          data-testid="vd-compiled-video-card"
        >
          <p className="text-sm font-medium">{t2.compiledVideoTitle}</p>

          {compiledVideo?.status === "completed" && compiledVideo.videoUrl ? (
            <div className="flex flex-col gap-2">
              <div className="w-56 max-w-full overflow-hidden rounded-md border border-border bg-black">
                <video
                  src={compiledVideo.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-[9/16] w-full bg-black"
                  data-testid="vd-compiled-video-player"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {compiledVideo.durationSeconds ? (
                  <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                    {compiledVideo.durationSeconds}
                    {t2.compiledVideoDurationLabel}
                  </Badge>
                ) : null}
                {typeof compiledVideo.shotCount === "number" &&
                totalClipCount > 0 &&
                compiledVideo.shotCount < totalClipCount ? (
                  <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                    {vdCopyWithCount(t2.compiledVideoPartialBadge, compiledVideo.shotCount)}
                  </Badge>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-1.5 text-[10px]"
                  onClick={() => {
                    const filename =
                      seriesId != null
                        ? `series-${seriesId}-ep-${episodeNumber ?? 0}-full.mp4`
                        : "compiled-episode.mp4";
                    void downloadStoryboardMediaUrl(compiledVideo.videoUrl!, filename);
                  }}
                  data-testid="vd-compiled-video-download"
                >
                  <Download aria-hidden="true" className="h-3 w-3" />
                  {t2.download}
                </Button>
              </div>
              {confirmingReassembleCompiledVideo ? (
                <div className="rounded-md border border-amber-400/50 bg-amber-50 p-2 text-[11px] dark:bg-amber-950/30">
                  <p className="font-medium">{t2.compiledVideoReassembleConfirm}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setConfirmingReassembleCompiledVideo(false)}
                      disabled={assemblingCompiledVideo}
                    >
                      {t(locale, "ยกเลิก", "Cancel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => {
                        setConfirmingReassembleCompiledVideo(false);
                        onAssembleCompiledVideo();
                      }}
                      disabled={assemblingCompiledVideo}
                      data-testid="vd-compiled-video-confirm-reassemble"
                    >
                      {t(locale, "ยืนยัน", "Confirm")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-fit gap-1 px-1.5 text-[10px] text-muted-foreground"
                  onClick={() => setConfirmingReassembleCompiledVideo(true)}
                  disabled={assemblingCompiledVideo}
                  data-testid="vd-compiled-video-reassemble"
                >
                  {t2.compiledVideoReassemble}
                </Button>
              )}
            </div>
          ) : compiledVideo?.status === "pending" || compiledVideo?.pendingJobId ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {t2.compiledVideoProcessing}
            </div>
          ) : compiledVideo?.status === "failed" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-destructive">
                {t2.compiledVideoFailed}
                {compiledVideo.error ? `: ${compiledVideo.error}` : ""}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit gap-1.5"
                onClick={() => onAssembleCompiledVideo()}
                disabled={assemblingCompiledVideo}
                data-testid="vd-compiled-video-retry"
              >
                {assemblingCompiledVideo ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t2.compiledVideoRetry}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {t2.compiledVideoReadyHint
                  .replace("{ready}", String(readyClipNumbers.length))
                  .replace("{total}", String(totalClipCount))}
              </p>
              {(() => {
                const missing =
                  totalClipCount > 0
                    ? Array.from({ length: totalClipCount }, (_, i) => i + 1).filter(
                        n => !readyClipNumbers.includes(n)
                      )
                    : [];
                if (missing.length === 0) return null;
                return (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {t2.compiledVideoMissingWarning.replace("{list}", missing.join(", "))}
                  </p>
                );
              })()}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onAssembleCompiledVideo()}
                  disabled={
                    assemblingCompiledVideo || readyClipNumbers.length === 0
                  }
                  data-testid="vd-compiled-video-assemble"
                >
                  {assemblingCompiledVideo ? (
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Clapperboard aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {t2.compiledVideoAssemble}
                </Button>
                {totalClipCount > 0 && readyClipNumbers.length > 0 && readyClipNumbers.length < totalClipCount ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => onAssembleCompiledVideo({ allowPartial: true })}
                    disabled={assemblingCompiledVideo}
                    data-testid="vd-compiled-video-assemble-partial"
                  >
                    {t2.compiledVideoAssemblePartial}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {lightboxShot != null ? (
        <ImageLightbox
          images={(() => {
            const frame = frameByShot.get(lightboxShot);
            const asset = frame?.approvedMediaAssetId ? assetUrls[frame.approvedMediaAssetId] : undefined;
            const filename =
              seriesId != null
                ? `series-${seriesId}-ep-${episodeNumber ?? 0}-shot-${lightboxShot}.png`
                : `shot-${lightboxShot}.png`;
            return asset?.url ? [{ src: asset.url, alt: filename }] : [];
          })()}
          open={lightboxShot != null}
          onClose={() => setLightboxShot(null)}
        />
      ) : null}

      {/* Full-screen video-clip player (2026-07-06 fix) — `ImageLightbox`
          doesn't support video, so this is a minimal dedicated overlay
          matching its visual convention (fixed inset, dark backdrop,
          click-outside/Escape to close). */}
      {fullScreenVideoClip != null
        ? (() => {
            const clip = (motionPromptPack?.clips ?? []).find(
              c => c.clipNumber === fullScreenVideoClip
            );
            const videoUrl = clip?.videoTask?.videoUrl;
            if (!videoUrl) return null;
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                onClick={() => setFullScreenVideoClip(null)}
                role="dialog"
                aria-modal="true"
              >
                <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                    onClick={e => {
                      e.stopPropagation();
                      const filename =
                        seriesId != null
                          ? `series-${seriesId}-ep-${episodeNumber ?? 0}-clip-${fullScreenVideoClip}.mp4`
                          : `clip-${fullScreenVideoClip}.mp4`;
                      void downloadStoryboardMediaUrl(videoUrl, filename);
                    }}
                    title={t2.download}
                    aria-label={t2.download}
                  >
                    <Download aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                    onClick={() => setFullScreenVideoClip(null)}
                    aria-label={t(locale, "ปิด", "Close")}
                  >
                    <X aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[90vh] max-w-[90vw] aspect-[9/16]"
                  onClick={e => e.stopPropagation()}
                  data-testid={`vd-storyboard-video-fullscreen-${fullScreenVideoClip}`}
                />
              </div>
            );
          })()
        : null}

      {lightboxCharacterId != null ? (
        <ImageLightbox
          images={(() => {
            const portrait = reviewCharacters.find(p => p.characterId === lightboxCharacterId);
            const namePart = (portrait?.name || lightboxCharacterId || "character")
              .replace(/[^\w\-]+/g, "-")
              .replace(/-+/g, "-")
              .replace(/^-|-$/g, "");
            const filename =
              seriesId != null
                ? `series-${seriesId}-character-${namePart}.png`
                : `character-${namePart}.png`;
            return portrait?.portraitUrl ? [{ src: portrait.portraitUrl, alt: filename }] : [];
          })()}
          open={lightboxCharacterId != null}
          onClose={() => setLightboxCharacterId(null)}
        />
      ) : null}

      {lightboxAngleCandidate != null ? (
        <ImageLightbox
          images={(angleCandidatesByShot[lightboxAngleCandidate.shotNumber] ?? []).map(
            ({ dataUrl, originalIndex }) => {
              const filename =
                seriesId != null
                  ? `series-${seriesId}-ep-${episodeNumber ?? 0}-shot-${lightboxAngleCandidate.shotNumber}-angle-${originalIndex + 1}.png`
                  : `shot-${lightboxAngleCandidate.shotNumber}-angle-${originalIndex + 1}.png`;
              return { src: dataUrl, alt: filename };
            }
          )}
          initialIndex={lightboxAngleCandidate.index}
          open={lightboxAngleCandidate != null}
          onClose={() => setLightboxAngleCandidate(null)}
        />
      ) : null}

      {lightboxProductImageUrl != null ? (
        <ImageLightbox
          images={[
            {
              src: lightboxProductImageUrl,
              alt:
                seriesId != null
                  ? `series-${seriesId}-product-reference.png`
                  : "product-reference.png",
            },
          ]}
          open={lightboxProductImageUrl != null}
          onClose={() => setLightboxProductImageUrl(null)}
        />
      ) : null}

      {productImagePickerForShot != null ? (
        <ProductImagePickerDialog
          locale={locale}
          t={t2}
          shotNumber={productImagePickerForShot}
          images={productImages}
          imagesLoading={productImagesLoading}
          selectedUrls={productImagePickerDraft}
          onToggle={url =>
            setProductImagePickerDraft(prev =>
              prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
            )
          }
          maxProductImages={VD_PRODUCT_REFERENCE_IMAGE_CAP}
          totalReferenceBudget={
            imageModels.find(m => m.modelId === selectedImageModelId)?.maxReferenceImages
          }
          saving={savingProductReferencesForShot === productImagePickerForShot}
          onSave={() => {
            onSaveShotProductReferences?.(productImagePickerForShot, productImagePickerDraft);
            setProductImagePickerForShot(null);
          }}
          onClose={() => setProductImagePickerForShot(null)}
        />
      ) : null}

      {/* Confirm-before-delete for a shot reference (Phase 2.5) — text-visible,
          keyboard reachable, matches the other confirm-gates in this panel. */}
      {confirmingRemoveReference ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmingRemoveReference(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-medium">{t2.removeReference}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t2.removeReferenceConfirm}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmingRemoveReference(null)}
              >
                {t(locale, "ยกเลิก", "Cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => {
                  onRemoveShotReference?.(
                    confirmingRemoveReference.shotNumber,
                    confirmingRemoveReference.referenceId
                  );
                  setConfirmingRemoveReference(null);
                }}
                data-testid="vd-storyboard-confirm-remove-reference"
              >
                {t(locale, "ลบ", "Remove")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

/** Compact model-picker button used by the header's image/video selectors —
 *  shows the currently-selected model's name + capability badges, opens the
 *  shared `ModelSelectorDialog` on click. */
function ModelPickerButton({
  label,
  model,
  mcpFree = false,
  mcpFreeLabel,
  onClick,
  locale,
  testId,
}: {
  label: string;
  model?: VerticalDramaCapableModel;
  /** True when this model resolves to MCP transport (creditCost 0 — routed
   *  through the user's own provider account instead of SmartSpec credits). */
  mcpFree?: boolean;
  mcpFreeLabel?: string;
  onClick: () => void;
  locale: Lang;
  testId: string;
}) {
  const t2 = vdCopy(locale as VdLocale);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-md border border-border bg-background px-3 py-2 text-left hover:border-primary/60 hover:bg-muted/40"
      data-testid={testId}
    >
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">
        {model ? model.name : t2.chooseModel}
      </span>
      {model ? (
        <span className="flex flex-wrap gap-1">
          {model.supportsStartFrame ? (
            <Badge variant="outline" className="gap-0.5 px-1 py-0 text-[9px]">
              {t2.capabilityStartFrame}
            </Badge>
          ) : null}
          {model.nativeAudioDialogue ? (
            <Badge variant="outline" className="gap-0.5 px-1 py-0 text-[9px]">
              <Mic aria-hidden="true" className="h-2.5 w-2.5" />
              {t2.capabilityNativeAudio}
            </Badge>
          ) : null}
          {model.maxReferenceImages ? (
            <Badge variant="outline" className="px-1 py-0 text-[9px]">
              {vdCopyWithCount(t2.capabilityMaxRefs, model.maxReferenceImages)}
            </Badge>
          ) : null}
          {mcpFree ? (
            <Badge
              variant="secondary"
              className="gap-0.5 border-indigo-200 bg-indigo-50 px-1 py-0 text-[9px] text-indigo-700"
            >
              {mcpFreeLabel}
            </Badge>
          ) : model.creditCost != null ? (
            <Badge variant="secondary" className="px-1 py-0 text-[9px]">
              {vdCopyWithCount(t2.capabilityCreditCost, model.creditCost)}
            </Badge>
          ) : null}
          {model.providerName || model.provider ? (
            <Badge variant="outline" className="px-1 py-0 text-[9px]">
              {formatMediaProviderDisplayName(model.providerName ?? model.provider)}
            </Badge>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

/** Compact resolution/size dropdown (Phase 6.2) — options come straight from
 *  the selected model's `resolutionOptions` (dynamic per-model, from
 *  `mediaModels.list`), so a model with no such metadata never renders this
 *  at all (checked by the caller before mounting). An empty `value` means
 *  "use the model's default" (no `resolution` sent to the generate call). */
function ResolutionSelect({
  label,
  autoLabel,
  options,
  value,
  onChange,
  creditSuffix,
  testId,
}: {
  label: string;
  autoLabel: string;
  options: Array<{ value: string; label: string; creditCost?: number }>;
  value: string;
  onChange: (value: string) => void;
  creditSuffix: string;
  testId: string;
}) {
  return (
    <label className="flex flex-col items-start gap-1 rounded-md border border-border bg-background px-3 py-2 text-left">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <select
        className="bg-transparent text-xs font-medium outline-none"
        value={value}
        onChange={e => onChange(e.target.value)}
        data-testid={testId}
      >
        <option value="">{autoLabel}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {opt.creditCost != null ? ` — ${vdCopyWithCount(creditSuffix, opt.creditCost)}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Compact language selector (video-prompt language options) — same visual pattern as `ResolutionSelect`, minus the credit suffix (language choice never changes cost). */
function LanguageSelect({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  testId: string;
}) {
  return (
    <label className="flex flex-col items-start gap-1 rounded-md border border-border bg-background px-3 py-2 text-left">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <select
        className="bg-transparent text-xs font-medium outline-none"
        value={value}
        onChange={e => onChange(e.target.value)}
        data-testid={testId}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Compact episode quality-review scorecard (Phase 3B.5). */
function QualityReviewCard({
  locale,
  t: t2,
  review,
  onRun,
  running,
  expanded,
  onToggleExpanded,
  onCopySuggestedFix,
}: {
  locale: Lang;
  t: ReturnType<typeof vdCopy>;
  review?: VerticalDramaQualityReviewView | null;
  onRun?: () => void;
  running?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onCopySuggestedFix?: (suggestedFix: string) => void;
}) {
  const scoreColor = (score: number) =>
    score >= 4
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 3
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";

  const dimensions: Array<{ label: string; value: number | null }> = review
    ? [
        { label: t2.qualityReversalSharpness, value: review.scorecard.reversal_sharpness },
        { label: t2.qualityEmotionVariety, value: review.scorecard.emotion_variety },
        { label: t2.qualityDialogueNaturalness, value: review.scorecard.dialogue_naturalness },
        { label: t2.qualityPacing, value: review.scorecard.pacing },
      ]
    : [];

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Award aria-hidden="true" className="h-4 w-4 text-purple-500" />
          {t2.qualityReview}
        </div>
        {onRun ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onRun}
            disabled={running}
            data-testid="vd-storyboard-run-quality-review"
          >
            {running ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {running ? t2.runningQualityReview : t2.runQualityReview}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t2.qualityReviewCostNote}</p>

      {review ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t2.qualityOverall}</span>
              <span className={cn("text-sm font-semibold", scoreColor(review.scorecard.overall))}>
                {review.scorecard.overall}/5
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t2.qualityReversalCount}</span>
              <span className="text-sm font-semibold">{review.scorecard.reversal_count}</span>
            </div>
            {dimensions.map(dim =>
              dim.value != null ? (
                <div key={dim.label} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{dim.label}</span>
                  <span className={cn("text-sm font-semibold", scoreColor(dim.value))}>
                    {dim.value}/5
                  </span>
                </div>
              ) : null
            )}
          </div>
          {review.summary ? (
            <p className="text-xs text-muted-foreground">{review.summary}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 w-fit gap-1 px-2 text-xs"
            onClick={onToggleExpanded}
            data-testid="vd-storyboard-toggle-quality-issues"
          >
            {t2.qualityIssues} ({review.issues.length})
          </Button>
          {expanded ? (
            review.issues.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t2.qualityNoIssues}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {review.issues.map((issue, idx) => (
                  <li
                    key={idx}
                    className="rounded-md border border-border bg-background p-2 text-xs"
                  >
                    <p className="font-medium">{issue.location}</p>
                    <p className="text-muted-foreground">{issue.problem}</p>
                    <div className="mt-1 flex items-start justify-between gap-2">
                      <p className="text-foreground">{issue.suggested_fix}</p>
                      {onCopySuggestedFix ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 gap-1 px-1.5 text-[11px]"
                          onClick={() => onCopySuggestedFix(issue.suggested_fix)}
                        >
                          <Copy aria-hidden="true" className="h-3 w-3" />
                          {t2.copySuggestedFix}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Manual episode -> series memory summarization card. Reachable episode-level
 * action so the fully-wired series-memory pipeline (planner skill -> 8 event
 * kinds appended on approval -> memory bundle -> next-episode script) actually
 * gets used, without requiring the user to run the full pipeline tail.
 */
function SummarizeMemoryCard({
  locale,
  t: t2,
  disabled,
  running,
  alreadySummarized,
  onRun,
  onReSummarize,
}: {
  locale: Lang;
  t: ReturnType<typeof vdCopy>;
  disabled?: boolean;
  running?: boolean;
  alreadySummarized?: boolean;
  onRun: () => void;
  onReSummarize: () => void;
}) {
  const [confirmingReSummarize, setConfirmingReSummarize] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles aria-hidden="true" className="h-4 w-4 text-purple-500" />
          {t2.summarizeMemory}
        </div>
        {!alreadySummarized || confirmingReSummarize ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onRun}
            disabled={disabled || running}
            title={disabled ? t2.summarizeMemoryNeedsScript : undefined}
            data-testid="vd-storyboard-summarize-memory"
          >
            {running ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {running ? t2.summarizeMemoryRunning : t2.summarizeMemoryButton}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t2.summarizeMemoryCostNote}</p>
      {disabled ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t2.summarizeMemoryNeedsScript}
        </p>
      ) : null}

      {alreadySummarized && !confirmingReSummarize ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-emerald-500/10 p-2">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            {t2.summarizeMemoryAlready}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => setConfirmingReSummarize(true)}
            disabled={disabled || running}
            data-testid="vd-storyboard-resummarize-memory"
          >
            {t2.summarizeMemoryReSummarize}
          </Button>
        </div>
      ) : null}

      {confirmingReSummarize ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <p>{t2.summarizeMemoryReSummarizeConfirm}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmingReSummarize(false)}
              disabled={running}
            >
              {locale === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setConfirmingReSummarize(false);
                onReSummarize();
              }}
              disabled={running}
              data-testid="vd-storyboard-resummarize-memory-confirm"
            >
              {t2.summarizeMemoryReSummarize}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Inline-editable prompt box: click "Edit" to open a Textarea, "Save" persists
 *  for free (routed through `updateEpisodeDraft`); a separate, clearly-labeled
 *  "AI adjust (paid)" button opens the existing repair dialog for an LLM-driven
 *  regenerate. Phase 4.1/4.2. */
function InlineEditablePromptBox({
  locale,
  t: t2,
  title,
  prompt,
  emptyLabel,
  isEditing,
  draft,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancelEdit,
  canSaveFree,
  onAiAdjust,
  testIdPrefix,
  maxChars,
}: {
  locale: Lang;
  t: ReturnType<typeof vdCopy>;
  title: string;
  prompt: string;
  emptyLabel: string;
  isEditing: boolean;
  draft: string;
  onStartEdit: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  canSaveFree: boolean;
  onAiAdjust?: () => void;
  testIdPrefix: string;
  /**
   * Hard QC cap for this prompt kind (`VD_IMAGE_PROMPT_MAX` /
   * `VD_VIDEO_PROMPT_MAX`) — shown as an `n / max` counter, warn-colored when
   * over. This is a WARN-ONLY hint: saving free edits over the cap is still
   * allowed (the server refines the prompt at generation time via
   * `verticalDramaPromptQc.ts`), never blocked here.
   */
  maxChars: number;
}) {
  const liveLength = isEditing ? draft.length : prompt.length;
  const isOverLimit = liveLength > maxChars;
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex flex-col gap-1 rounded-md bg-muted/50 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <div className="flex items-center gap-1">
          {!isEditing && prompt ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={async () => {
                const ok = await copyTextToClipboard(prompt);
                if (ok) {
                  setCopied(true);
                  toast.success(t2.copiedPrompt);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
              data-testid={`${testIdPrefix}-copy`}
            >
              {copied ? (
                <Check aria-hidden="true" className="h-3 w-3" />
              ) : (
                <Copy aria-hidden="true" className="h-3 w-3" />
              )}
              {t2.copyPrompt}
            </Button>
          ) : null}
          {!isEditing && canSaveFree ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={onStartEdit}
              data-testid={`${testIdPrefix}-edit-inline`}
            >
              <Pencil aria-hidden="true" className="h-3 w-3" />
              {t(locale, "แก้ไข", "Edit")}
            </Button>
          ) : null}
          {!isEditing && onAiAdjust ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs text-purple-600 dark:text-purple-400"
              onClick={onAiAdjust}
              data-testid={`${testIdPrefix}-ai-adjust`}
            >
              <Sparkles aria-hidden="true" className="h-3 w-3" />
              {t2.aiAdjustPaid}
            </Button>
          ) : null}
        </div>
      </div>
      {isEditing ? (
        <div className="flex flex-col gap-1.5">
          <Textarea
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            rows={4}
            className="text-xs"
            autoFocus
            data-testid={`${testIdPrefix}-textarea`}
          />
          <div className="flex items-center justify-between gap-1.5">
            <span
              className={cn(
                "text-[11px] tabular-nums",
                isOverLimit ? "font-medium text-destructive" : "text-muted-foreground",
              )}
              data-testid={`${testIdPrefix}-char-counter`}
            >
              {liveLength.toLocaleString()} / {maxChars.toLocaleString()}
            </span>
            <div className="flex justify-end gap-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={onCancelEdit}>
                {t(locale, "ยกเลิก", "Cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                onClick={onSave}
                data-testid={`${testIdPrefix}-save`}
              >
                <Check aria-hidden="true" className="h-3 w-3" />
                {t2.savePromptFree}
              </Button>
            </div>
          </div>
          {isOverLimit ? (
            <p className="text-[11px] text-destructive">{t2.promptOverLimitHint}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">{prompt || emptyLabel}</p>
          {prompt ? (
            <span
              className={cn(
                "text-[11px] tabular-nums",
                isOverLimit ? "font-medium text-destructive" : "text-muted-foreground",
              )}
              data-testid={`${testIdPrefix}-char-counter`}
            >
              {liveLength.toLocaleString()} / {maxChars.toLocaleString()}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Per-shot reference-image strip (Phase 2.5): thumbnails below the shot's
 *  main image, a drop zone accepting the unified drag contract, per-item
 *  delete (confirm gated by the caller), and a warning once the count
 *  reaches the selected video model's `maxReferenceImages`. */
function ShotReferenceStrip({
  locale,
  t: t2,
  shotNumber,
  references,
  maxReferenceImages,
  adding,
  dragOver,
  onDragOverChange,
  onAdd,
  onRequestRemove,
  onUseAsMain,
  usingAsMain = false,
}: {
  locale: Lang;
  t: ReturnType<typeof vdCopy>;
  shotNumber: number;
  references: VerticalDramaShotReferenceView[];
  maxReferenceImages?: number;
  adding: boolean;
  dragOver: boolean;
  onDragOverChange: (over: boolean) => void;
  onAdd: (payload: { url: string; source: VerticalDramaShotReferenceView["source"] }) => void;
  onRequestRemove: (referenceId: string) => void;
  onUseAsMain?: (mediaAssetId: string) => void;
  usingAsMain?: boolean;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const atLimit = maxReferenceImages != null && references.length >= maxReferenceImages;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{t2.references}</span>
      <div
        onDragOver={e => {
          e.preventDefault();
          onDragOverChange(true);
        }}
        onDragLeave={() => onDragOverChange(false)}
        onDrop={e => {
          e.preventDefault();
          onDragOverChange(false);
          const { input, error } = readDroppedImageInput(e);
          if (error) {
            if (error.kind === "unsupported-file-type") {
              toast.error(t2.unsupportedImageFileType);
            } else {
              toast.error(
                vdCopyWithCount(
                  t2.imageFileTooLarge,
                  Math.round(error.maxBytes / (1024 * 1024)),
                ),
              );
            }
            return;
          }
          if (!input) return;
          if (input.kind === "url") {
            onAdd({ url: input.url, source: "library" });
          } else {
            void readFileAsDataUrl(input.file).then(url =>
              onAdd({ url, source: "upload" })
            );
          }
        }}
        className={cn(
          "flex min-h-[2.75rem] flex-wrap items-center gap-1 rounded-md border border-dashed p-1",
          dragOver ? "border-primary bg-primary/5" : "border-border"
        )}
        data-testid={`vd-storyboard-reference-strip-${shotNumber}`}
      >
        {references.length === 0 && !adding ? (
          <span className="px-1 text-[10px] text-muted-foreground">
            {t2.dropReferenceHint}
          </span>
        ) : null}
        {references.map((ref, idx) => (
          <div
            key={ref.referenceId}
            className="group relative h-9 w-9 shrink-0 overflow-hidden rounded border border-border"
          >
            <button
              type="button"
              className="block h-full w-full"
              onClick={() => setLightboxIndex(idx)}
              data-testid={`vd-storyboard-reference-${shotNumber}-${ref.referenceId}`}
            >
              {ref.thumbnailUrl ? (
                <img src={ref.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-[8px] text-muted-foreground">
                  {t2.references}
                </div>
              )}
            </button>
            <button
              type="button"
              className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-white opacity-0 group-hover:opacity-100"
              onClick={() => onRequestRemove(ref.referenceId)}
              aria-label={t2.removeReference}
              title={t2.removeReference}
              data-testid={`vd-storyboard-remove-reference-${shotNumber}-${ref.referenceId}`}
            >
              <Trash2 aria-hidden="true" className="h-2.5 w-2.5" />
            </button>
            {onUseAsMain ? (
              <button
                type="button"
                // Always-visible on touch (no hover state on touch devices),
                // hidden until hover on pointer/mouse — same convention as
                // the delete X above, plus a min 40px effective tap target
                // via the padding trick (visual icon stays small at h-4/w-4
                // but the touch target is comfortably larger via `p-1.5`
                // negative-margin offset) to match the app's touch-target
                // convention without inflating the visual thumbnail chrome.
                className="absolute bottom-0 left-0 flex h-4 w-4 items-center justify-center rounded-tr bg-black/60 text-white opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={() => onUseAsMain(ref.mediaAssetId)}
                disabled={usingAsMain}
                aria-label={t2.useReferenceAsMain}
                title={t2.useReferenceAsMain}
                data-testid={`vd-storyboard-use-reference-as-main-${shotNumber}-${ref.referenceId}`}
              >
                {usingAsMain ? (
                  <Loader2 aria-hidden="true" className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Check aria-hidden="true" className="h-2.5 w-2.5" />
                )}
              </button>
            ) : null}
          </div>
        ))}
        {adding ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-dashed border-border">
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          </div>
        ) : (
          <label
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
            title={t2.uploadReferenceImage}
            aria-label={t2.uploadReferenceImage}
            data-testid={`vd-storyboard-upload-reference-${shotNumber}`}
          >
            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  toast.error(t2.unsupportedImageFileType);
                  return;
                }
                if (file.size > DROPPED_IMAGE_FILE_MAX_BYTES) {
                  toast.error(
                    vdCopyWithCount(
                      t2.imageFileTooLarge,
                      Math.round(DROPPED_IMAGE_FILE_MAX_BYTES / (1024 * 1024)),
                    ),
                  );
                  return;
                }
                void readFileAsDataUrl(file).then(url =>
                  onAdd({ url, source: "upload" })
                );
              }}
            />
          </label>
        )}
      </div>
      {atLimit ? (
        <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
          {vdCopyWithCount(t2.referenceLimitWarning, maxReferenceImages ?? 0)}
        </p>
      ) : null}
      {lightboxIndex != null ? (
        <ImageLightbox
          images={references
            .filter(r => r.thumbnailUrl)
            .map(r => ({ src: r.thumbnailUrl as string, alt: t2.references }))}
          initialIndex={lightboxIndex}
          open={lightboxIndex != null}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}

/** Per-clip dialogue box (Phase 3.4): shows character + Thai line + emotion,
 *  inline-editable, and marks whether the selected video model speaks the
 *  lines natively or routes them to a separate TTS pass. */
function ClipDialogueBox({
  locale,
  t: t2,
  clip,
  characterPortraits,
  nativeAudio,
  isEditing,
  draft,
  saving,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancelEdit,
  canEdit,
}: {
  locale: Lang;
  t: ReturnType<typeof vdCopy>;
  clip: VerticalDramaMotionPromptClipView;
  characterPortraits: VerticalDramaCharacterPortraitMap;
  nativeAudio: boolean;
  isEditing: boolean;
  draft: VerticalDramaClipDialogueLineView[];
  saving: boolean;
  onStartEdit: () => void;
  onDraftChange: (lines: VerticalDramaClipDialogueLineView[]) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  canEdit: boolean;
}) {
  const lines = isEditing ? draft : clip.dialogue ?? [];
  const updateLine = (
    index: number,
    patch: Partial<VerticalDramaClipDialogueLineView>
  ) => {
    onDraftChange(draft.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };
  const [dialogueCopied, setDialogueCopied] = useState(false);
  const compiledDialogueText = lines
    .map(line => {
      const portrait = line.characterKey ? characterPortraits[line.characterKey] : undefined;
      const speaker = portrait?.name ?? line.characterKey ?? "—";
      return `${speaker}: ${line.lineTh}`;
    })
    .join("\n");

  return (
    <div className="mt-1 flex flex-col gap-1.5 rounded-md bg-muted/50 p-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">{t2.dialogueLines}</span>
          <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[9px]">
            {nativeAudio ? (
              <Mic aria-hidden="true" className="h-2.5 w-2.5" />
            ) : null}
            {nativeAudio ? t2.dialogueSpeaksNatively : t2.dialogueSeparateTts}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {!isEditing && lines.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={async () => {
                const ok = await copyTextToClipboard(compiledDialogueText);
                if (ok) {
                  setDialogueCopied(true);
                  toast.success(t2.copiedDialogue);
                  setTimeout(() => setDialogueCopied(false), 1500);
                }
              }}
              data-testid={`vd-storyboard-dialogue-copy-${clip.clipNumber}`}
            >
              {dialogueCopied ? (
                <Check aria-hidden="true" className="h-3 w-3" />
              ) : (
                <Copy aria-hidden="true" className="h-3 w-3" />
              )}
              {t2.copyDialogue}
            </Button>
          ) : null}
          {canEdit && !isEditing ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={onStartEdit}
              data-testid={`vd-storyboard-dialogue-edit-${clip.clipNumber}`}
            >
              <Pencil aria-hidden="true" className="h-3 w-3" />
              {t2.editDialogue}
            </Button>
          ) : null}
        </div>
      </div>

      {lines.length === 0 && !isEditing ? (
        <p className="text-xs text-muted-foreground">{t2.noDialogueLines}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lines.map((line, idx) => {
            const portrait = line.characterKey
              ? characterPortraits[line.characterKey]
              : undefined;
            return (
              <li key={idx} className="rounded border border-border bg-background p-1.5">
                {isEditing ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{portrait?.name ?? line.characterKey ?? "—"}</span>
                    </div>
                    <Textarea
                      value={line.lineTh}
                      onChange={e => updateLine(idx, { lineTh: e.target.value })}
                      rows={2}
                      className="text-xs"
                    />
                    <input
                      type="text"
                      value={line.emotion ?? ""}
                      onChange={e => updateLine(idx, { emotion: e.target.value })}
                      placeholder={t2.emotionLabel}
                      className="rounded border border-border px-2 py-1 text-[11px]"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                      <span>{portrait?.name ?? line.characterKey ?? "—"}</span>
                      {line.emotion ? (
                        <Badge variant="outline" className="px-1 py-0 text-[9px]">
                          {t2.emotionLabel}: {line.emotion}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-foreground">{line.lineTh}</p>
                    {line.delivery?.tone || line.delivery?.pace ? (
                      <p className="text-[10px] text-muted-foreground">
                        {t2.deliveryLabel}:{" "}
                        {[line.delivery?.tone, line.delivery?.pace]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isEditing ? (
        <div className="flex justify-end gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={onCancelEdit}>
            {t(locale, "ยกเลิก", "Cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1"
            onClick={onSave}
            disabled={saving}
            data-testid={`vd-storyboard-dialogue-save-${clip.clipNumber}`}
          >
            {saving ? (
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="h-3 w-3" />
            )}
            {t2.saveDialogue}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * ProductImagePickerDialog (2026-07-06 product-reference upgrade) — lets the
 * user VIEW every available product reference image for the series (its full
 * Marketplace Capture image set + direct product image URL) and CHOOSE which
 * one(s) generation actually uses for this specific shot, instead of the
 * pipeline silently auto-resolving them. Multi-select grid, currently-used
 * images pre-checked (via `selectedUrls`, seeded by the caller from
 * `frame.productReferenceAssetIds`). Saving persists
 * `productReferenceAssetIds` + `productRefsCustomized: true` on the frame (via
 * `updateEpisodeDraft`, free) — even an explicit empty selection is saved,
 * which is what marks the shot as "customized" so the pipeline's
 * auto-resolution never refills it again. Follows the same fixed-overlay
 * `role="alertdialog"` pattern the panel's other dialogs use (no new Dialog
 * primitive introduced).
 */
function ProductImagePickerDialog({
  locale,
  t: t2,
  shotNumber,
  images,
  imagesLoading,
  selectedUrls,
  onToggle,
  maxProductImages,
  totalReferenceBudget,
  saving,
  onSave,
  onClose,
}: {
  locale: Lang;
  t: ReturnType<typeof vdCopy>;
  shotNumber: number;
  images: VerticalDramaAvailableProductImageView[];
  imagesLoading: boolean;
  selectedUrls: string[];
  onToggle: (url: string) => void;
  maxProductImages: number;
  totalReferenceBudget?: number;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t2.productImagePickerTitle}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={e => e.stopPropagation()}
        data-testid={`vd-storyboard-product-image-picker-${shotNumber}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Package aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t2.productImagePickerTitle}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={onClose}
            aria-label={t(locale, "ปิด", "Close")}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {vdCopyWithCount(t2.productImagePickerCapHint, maxProductImages)}
          {totalReferenceBudget != null
            ? ` · ${vdCopyWithCount(t2.productImagePickerBudgetHint, totalReferenceBudget)}`
            : ""}
        </p>

        {imagesLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t(locale, "กำลังโหลดภาพ…", "Loading images…")}
          </div>
        ) : images.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {t2.productImagePickerNoImages}
          </p>
        ) : (
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {images.map(img => {
              const selected = selectedUrls.includes(img.url);
              return (
                <button
                  key={img.url}
                  type="button"
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-md border-2",
                    selected ? "border-primary ring-2 ring-primary" : "border-border"
                  )}
                  onClick={() => onToggle(img.url)}
                  data-testid={`vd-storyboard-product-image-option-${shotNumber}-${img.url}`}
                  aria-pressed={selected}
                >
                  <img src={img.url} alt={img.label ?? ""} className="h-full w-full object-cover" />
                  {selected ? (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {vdCopyWithCount(t2.productImagePickerSelectedCount, selectedUrls.length)}
          </span>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={saving}
            data-testid={`vd-storyboard-product-image-picker-save-${shotNumber}`}
          >
            {saving ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t2.productImagePickerSave
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Image-to-image repair dialog (Phase 6.5) — shows the current approved
 *  image + an instruction textarea + cost display, submits `repairShotImage`
 *  (async submit + poll, owned by the caller), then shows a BEFORE/AFTER
 *  comparison once the result resolves, with explicit "use new" / "keep old"
 *  actions. Follows the same fixed-overlay `role="alertdialog"` pattern the
 *  panel's other confirm dialogs use (no new Dialog primitive introduced). */
function RepairImageDialog({
  locale,
  t: t2,
  shotNumber,
  beforeUrl,
  instruction,
  onInstructionChange,
  submitting,
  result,
  error,
  onSubmit,
  onAccept,
  onDiscard,
  onClose,
}: {
  locale: Lang;
  t: ReturnType<typeof vdCopy>;
  shotNumber: number;
  beforeUrl?: string;
  instruction: string;
  onInstructionChange: (value: string) => void;
  submitting: boolean;
  result?: { beforeUrl: string; afterUrl: string };
  error?: string;
  onSubmit: () => void;
  onAccept: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t2.repairImageDialogTitle}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={e => e.stopPropagation()}
        data-testid={`vd-storyboard-repair-image-dialog-${shotNumber}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Wand2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t2.repairImageDialogTitle}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={onClose}
            aria-label={t(locale, "ปิด", "Close")}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>

        {result ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t2.repairImageBefore}
                </span>
                <div className="aspect-[9/16] w-full overflow-hidden rounded-md border border-border bg-muted">
                  <img src={result.beforeUrl} alt={t2.repairImageBefore} className="h-full w-full object-cover" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t2.repairImageAfter}
                </span>
                <div className="aspect-[9/16] w-full overflow-hidden rounded-md border border-primary/50 bg-muted">
                  <img src={result.afterUrl} alt={t2.repairImageAfter} className="h-full w-full object-cover" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDiscard}
                data-testid={`vd-storyboard-repair-image-keep-old-${shotNumber}`}
              >
                {t2.repairImageKeepOld}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onAccept}
                data-testid={`vd-storyboard-repair-image-use-new-${shotNumber}`}
              >
                <Check aria-hidden="true" className="h-3 w-3" />
                {t2.repairImageUseNew}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {beforeUrl ? (
              <div className="mx-auto aspect-[9/16] w-32 overflow-hidden rounded-md border border-border bg-muted">
                <img src={beforeUrl} alt={t2.repairImageBefore} className="h-full w-full object-cover" />
              </div>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">{t2.repairImageInstructionLabel}</span>
              <Textarea
                value={instruction}
                onChange={e => onInstructionChange(e.target.value)}
                rows={3}
                placeholder={t2.repairImageInstructionPlaceholder}
                className="text-xs"
                autoFocus
                disabled={submitting}
                data-testid={`vd-storyboard-repair-image-textarea-${shotNumber}`}
              />
            </label>
            {error ? (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            ) : null}
            {submitting ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                {t2.repairImageWorking}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={submitting}>
                {t(locale, "ยกเลิก", "Cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                onClick={onSubmit}
                disabled={submitting || instruction.trim().length === 0}
                data-testid={`vd-storyboard-repair-image-submit-${shotNumber}`}
              >
                {submitting ? (
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 aria-hidden="true" className="h-3 w-3" />
                )}
                {submitting ? t2.repairImageSubmitting : t2.repairImageSubmit}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VerticalDramaStoryboardPanel;
