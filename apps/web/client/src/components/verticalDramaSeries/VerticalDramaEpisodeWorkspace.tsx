/**
 * VerticalDramaEpisodeWorkspace — the episode workspace (spec §04 UI/UX Contract,
 * extended per the Presentation-Builder-style redesign).
 *
 * Groups the 15 canonical `VerticalDramaPipelineStage` stages into ~4 labeled
 * phases and renders them as a grid of stage cards — every stage is always
 * clickable (not just the "current" one) so the user can inspect any finished,
 * failed, or pending stage's full detail at any time. The single primary
 * call-to-action for the current stage's `next_action` stays exactly as
 * before; the stage grid adds a separate, always-available "view detail"
 * surface underneath it, keyed by `focusedStage`.
 *
 * Handles the loading / empty (no episode → create CTA) / error / success and
 * completed (read-only historical) states. Running/timeline animation is
 * replaced by a static indicator under `prefers-reduced-motion`.
 *
 * Presentational + prop-driven so it is decoupled from router wiring: pass
 * stage state, runs, and memory in; wire the callbacks to the
 * `verticalDramaEpisodes` tRPC router at the call site.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
/**
 * Ad Banner Overlay — per-episode banner SELECTION (F131W, task #30-A2,
 * plan.md §6 episode side). `@shared/verticalDramaSeries/adBannerPresets` is
 * a pure, isomorphic (client+server) module (see its own header doc
 * comment) — safe as a normal static import, same as the A1 series-studio
 * component (`VerticalDramaAdBannerStudio.tsx`) already does. Only the
 * `VD_AD_BANNER_MAX_PER_SERIES` cap constant + the placement id TYPE are
 * needed here — placement/style NAMES are this file's own copy keys (see
 * `adBannerPlacementLabel` below), not `adBannerPresets.ts`'s `nameTh`
 * (which has no English counterpart, unlike the style presets).
 */
import {
  VD_AD_BANNER_MAX_PER_SERIES,
  type VdAdBannerPlacementId,
} from "@shared/verticalDramaSeries/adBannerPresets";
import {
  VD_PHASES,
  VD_FINAL_RENDER_SUBTITLE_PRESET_IDS,
  vdAdBannerExclusionReasonLabel,
  vdCopy,
  vdCopyWithParams,
  vdFinalRenderSubtitlePresetLabel,
  vdPhaseLabel,
  vdStageLabel,
  type VdFinalRenderSubtitlePresetValue,
  type VdLocale,
  type VdPhase,
} from "./verticalDramaWorkspaceCopy";
// Task #34 (Text Overlay Suite) — dedicated copy module, see that file's own
// header doc comment for why it is separate from `verticalDramaWorkspaceCopy.ts`.
import {
  vdTextOverlayCopy,
  vdTextOverlayCopyWithParams,
} from "./verticalDramaTextOverlayCopy";
import {
  VerticalDramaApprovalBar,
  type VerticalDramaApprovalBarState,
} from "./VerticalDramaApprovalBar";
import {
  VerticalDramaRunsList,
  type VerticalDramaRunRow,
} from "./VerticalDramaRunsList";
import {
  VerticalDramaMemoryTimeline,
  type VerticalDramaMemoryTimelineProps,
} from "./VerticalDramaMemoryTimeline";
import {
  VerticalDramaRunDetailView,
  type VdRunDetail,
  type VdRunSummary,
} from "./VerticalDramaRunDetailView";
import {
  VerticalDramaDialogueAudioPanel,
  type VerticalDramaDialogueAudioBatchData,
} from "./VerticalDramaDialogueAudioPanel";
import {
  VerticalDramaStoryboardPanel,
  type VerticalDramaAssetUrlMap,
  type VerticalDramaAvailableProductImageView,
  type VerticalDramaCapableModel,
  type VerticalDramaCharacterPortraitMap,
  type VerticalDramaClipDialogueLineView,
  type VerticalDramaCompiledVideoView,
  type VerticalDramaMotionPromptPackView,
  type VerticalDramaQualityLoopStateView,
  type VerticalDramaQualityPolicyView,
  type VerticalDramaQualityReviewView,
  type VerticalDramaShotProductTieInView,
  type VerticalDramaShotReferenceView,
  type VerticalDramaStartFramePlanView,
  type VerticalDramaStoryboardView,
} from "./VerticalDramaStoryboardPanel";
import type {
  VerticalDramaTieInReportView,
  VerticalDramaSeasonTieInPlacementView,
} from "./VerticalDramaTieInReportCard";
import type { VdWizardPerShotDialoguePreviewShot } from "./VerticalDramaProductionWizard";
import {
  VerticalDramaEpisodePlanPanel,
  type VerticalDramaEpisodePlanSummaryView,
} from "./VerticalDramaEpisodePlanPanel";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import type {
  RunResult,
  VerticalDramaPipelineStage,
} from "@shared/verticalDramaSeries";
import type { VerticalDramaProductionWizardState } from "@shared/verticalDramaSeries/productionWizard";

/** Data needed to render the generic "view this stage's runs" fallback panel. */
export interface VerticalDramaStageRunDetailData {
  runs: VdRunSummary[];
  detail: VdRunDetail | null;
  selectedRunId?: string;
  onSelectRun?: (runId: string) => void;
  loading?: boolean;
  error?: string | null;
}

/** Data needed to render the dialogue/audio stage's dedicated review panel. */
export interface VerticalDramaDialogueAudioPanelData {
  plan?: VerticalDramaDialogueAudioPlan | null;
  loading?: boolean;
  error?: string | null;
  onGenerate?: () => void;
  /** W12-B voice chain wave — whole-episode dialogue TTS batch. `undefined`
   *  when `verticalDramaSeriesVoiceChain` is off; threaded straight through
   *  to `VerticalDramaDialogueAudioPanel`'s own prop of the same name. */
  batch?: VerticalDramaDialogueAudioBatchData;
}

/**
 * Ad Banner Overlay — per-episode banner SELECTION (F131W, task #30-A2,
 * plan.md §2 "ชั้นการใช้" + §6 episode side). Mirrors the server's
 * `VdEpisodeAdBannerDesignSummary`/`VdEpisodeAdBannerPlan` shapes
 * (`server/routers/verticalDramaEpisodes.ts`) — kept as independent client
 * view types (this component never imports server code) rather than
 * importing them, same convention as every other `*View` type in this file.
 */
export interface VerticalDramaAdBannerDesignSummaryView {
  id: string;
  placementId: VdAdBannerPlacementId;
  status: "draft" | "prompt_ready" | "generating" | "ready" | "failed";
  imageUrl?: string;
  label: string;
  defaultTiming: {
    mode: "entire" | "window";
    startSec?: number;
    durationSec?: number;
  };
  excludedByApproval: boolean;
}

export interface VerticalDramaAdBannerTimingView {
  mode: "entire" | "window";
  startSec: number;
  durationSec: number;
}

export interface VerticalDramaAdBannerSelectionView {
  bannerId: string;
  timing?: VerticalDramaAdBannerTimingView;
}

export interface VerticalDramaAdBannerPlanView {
  enabled: boolean;
  selections: VerticalDramaAdBannerSelectionView[];
}

/** Data needed to render the "แบนเนอร์ในวิดีโอนี้" section. */
export interface VerticalDramaAdBannerPlanPanelData {
  designs: VerticalDramaAdBannerDesignSummaryView[];
  plan?: VerticalDramaAdBannerPlanView | null;
  saving?: boolean;
  error?: string | null;
  onSave?: (plan: VerticalDramaAdBannerPlanView) => void;
}

/**
 * Text Overlay Suite (F131AB, task #34, plan.md v2) — per-episode
 * `textOverlayPlan` client view types. Mirrors the server's
 * `VdTextOverlayPlan` (`@shared/verticalDramaSeries/textOverlay.ts`) field
 * for field, kept as independent client view types (same convention as
 * every other `*View` type in this file — this component never imports
 * server-owned routers, and `@shared/verticalDramaSeries/textOverlay.ts`
 * happens to be pure/isomorphic but the type is still re-declared here for
 * consistency with the file's own established posture).
 */
export interface VerticalDramaTextOverlayEndCardView {
  enabled: boolean;
  text?: string;
  source?: "auto" | "manual";
  durationSec: number;
  showFollowLine: boolean;
  styleVariant: "center_card" | "lower_band";
}

export interface VerticalDramaTextOverlayOpenerRecapView {
  enabled: boolean;
  text?: string;
  source?: "auto" | "manual";
  durationSec: number;
}

export interface VerticalDramaTextOverlayTitleBumperView {
  enabled: boolean;
  text?: string;
}

export interface VerticalDramaTextOverlayEpisodeIndicatorView {
  enabled: boolean;
  position: "top_right" | "top_left";
}

export interface VerticalDramaTextOverlayCharacterIntroCardsView {
  enabled: boolean;
}

export interface VerticalDramaTextOverlayCardView {
  id: string;
  kind: "time_setting" | "narrative_hook" | "custom";
  anchor: { shotNumber: number; offsetSec?: number };
  text: string;
  durationSec: number;
  styleVariant?: "time_setting" | "narrative_hook";
  enabled: boolean;
}

export interface VerticalDramaTextOverlayPlanView {
  endCard?: VerticalDramaTextOverlayEndCardView;
  openerRecap?: VerticalDramaTextOverlayOpenerRecapView;
  titleBumper?: VerticalDramaTextOverlayTitleBumperView;
  episodeIndicator?: VerticalDramaTextOverlayEpisodeIndicatorView;
  characterIntroCards?: VerticalDramaTextOverlayCharacterIntroCardsView;
  cards?: VerticalDramaTextOverlayCardView[];
}

/** `getEpisodeDetail.textOverlayPreview`'s client view — read-only
 *  auto-derived text/labels, used for "ที่มา"/auto-fill without a
 *  round-trip. */
export interface VerticalDramaTextOverlayPreviewView {
  endCard: { text: string; source: string };
  openerRecap: { text: string; source: string };
  titleBumper: { primary: string; secondary: string };
  episodeIndicator: { label: string };
  characterIntroCards: Array<{
    characterKey: string;
    shotNumber: number;
    name: string;
    role?: string;
  }>;
}

/** Data needed to render the "ข้อความบนวิดีโอ" section. */
export interface VerticalDramaTextOverlayPlanPanelData {
  plan?: VerticalDramaTextOverlayPlanView | null;
  preview?: VerticalDramaTextOverlayPreviewView | null;
  saving?: boolean;
  error?: string | null;
  onSave?: (plan: VerticalDramaTextOverlayPlanView) => void;
}

/**
 * Task #21 / W12.5 "Final Render Suite" phase B (2026-07-09) — the whole-
 * episode compiled video's dialogue-audio + subtitle OPTION VALUES. A single
 * controlled `{includeDialogueAudio, loudnessNormalize, subtitlePreset}`
 * object (not three separate value/onChange pairs) so the page-level caller
 * always has the full shape to merge straight into its `assembleEpisodeVideo`
 * mutate payload — same "one object in, one object out" convention as the
 * ad banner plan's `onSave` payload.
 */
export interface VerticalDramaFinalRenderOptionsView {
  includeDialogueAudio: boolean;
  loudnessNormalize: boolean;
  subtitlePreset: VdFinalRenderSubtitlePresetValue;
}

/** Mirrors `VdEpisodeAdBannerExclusion` (`server/routers/verticalDramaEpisodes.ts`) as this file's own independent client view type. */
export interface VerticalDramaFinalRenderExclusionView {
  bannerId: string;
  code: string;
}

/** `assembleEpisodeVideo`'s response, minus the fields the workspace already tracks elsewhere (`compiledVideo`/`jobId`/etc.). */
export interface VerticalDramaFinalRenderResultView {
  dialogueAudioSegmentsIncluded: number;
  subtitleLinesIncluded: number;
  excludedAdBanners?: VerticalDramaFinalRenderExclusionView[];
}

/** Data needed to render the "ตัวเลือกการเรนเดอร์วิดีโอ" section. */
export interface VerticalDramaFinalRenderOptionsPanelData {
  value?: VerticalDramaFinalRenderOptionsView | null;
  onChange?: (value: VerticalDramaFinalRenderOptionsView) => void;
  /** Durable (non-toast) proof of what the most recent successful `assembleEpisodeVideo` call actually included — same "durable card, not just a toast" convention as `scriptSummary`. `null`/absent before any render has completed this session. */
  lastResult?: VerticalDramaFinalRenderResultView | null;
}

/** Data needed to render the storyboard_shotgrid stage's dedicated panel. */
export interface VerticalDramaStoryboardPanelData {
  /** Used only for download filenames (`series-{seriesId}-ep-{episodeNumber}-...`). */
  seriesId?: string;
  episodeNumber?: number;
  storyboard?: VerticalDramaStoryboardView | null;
  startFramePlan?: VerticalDramaStartFramePlanView | null;
  motionPromptPack?: VerticalDramaMotionPromptPackView | null;
  assetUrls?: VerticalDramaAssetUrlMap;
  loading?: boolean;
  error?: string | null;
  generating?: boolean;
  /** Fired only after the user confirms the credit-spend warning. */
  onGenerateReal?: () => void;
  /** Opens the repair dialog for `video_motion_prompt_pack`, prefilled with
   *  the current prompt. `clipNumber`/`subShotNumber` (2026-07-10 speaker-
   *  aware sub-shots) — mirrors `VerticalDramaStoryboardPanel`'s own prop of
   *  the same name. */
  onEditVideoPrompt?: (
    shotNumber: number,
    clipNumber: number,
    subShotNumber: number | undefined,
    currentPrompt: string
  ) => void;
  /** Opens the Media History/Library picker scoped to this shot's start frame. */
  onChangeStartFrame?: (shotNumber: number) => void;
  /** Runs `start_frame_render_plan` for real (mode "full", spends credits). */
  onGenerateStartFramePlan?: () => void;
  generatingStartFramePlan?: boolean;
  /** Opens the repair dialog for `start_frame_render_plan`, prefilled with the current image prompt. */
  onEditStartFramePrompt?: (shotNumber: number, currentPrompt: string) => void;
  /** Panel-level "generate video prompts" (2026-07-05 fix) — runs
   *  `dialogue_audio_plan` then `video_motion_prompt_pack` for real. */
  onGenerateVideoPromptPack?: () => void;
  generatingVideoPromptPack?: boolean;
  /** Renders a real AI image for this shot from its approved prompt. */
  onGenerateStartFrameImage?: (shotNumber: number) => void;
  /** Every shot number currently submitted/polling — a Set (not a single
   *  number) since "generate all shot images" submits every shot at once;
   *  each shot's own spinner is independent of the others. */
  generatingStartFrameImageForShot?: ReadonlySet<number>;
  /** Fires `onGenerateStartFrameImage` for every shot missing an approved
   *  image, concurrently (redesign, 2026-07-05) — not one-at-a-time. */
  onGenerateAllStartFrameImages?: (shotNumbers: number[]) => void;
  characterPortraits?: VerticalDramaCharacterPortraitMap;
  /** Product tie-in placement per shot (spec §13) — read-only chip indicator. */
  productTieInByShot?: Record<number, VerticalDramaShotProductTieInView>;
  /** Every product reference image available to pick from (2026-07-06 product-
   *  reference upgrade) — see `VerticalDramaStoryboardPanel`'s prop of the same name. */
  productImages?: VerticalDramaAvailableProductImageView[];
  productImagesLoading?: boolean;
  onSaveShotProductReferences?: (shotNumber: number, urls: string[]) => void;
  savingProductReferencesForShot?: number | null;
  onChangeCharacterReference?: (characterId: string) => void;
  onDropCharacterReference?: (characterId: string, url: string) => void;
  onDropStartFrame?: (shotNumber: number, url: string) => void;
  onGenerateAngleVariations?: (shotNumber: number) => void;
  generatingAngleVariationsForShot?: number | null;
  angleVariationGridUrlByShot?: Record<number, string>;
  onPickAngleVariationCandidate?: (
    shotNumber: number,
    candidateDataUrl: string
  ) => void;
  onDismissAngleVariations?: (shotNumber: number) => void;
  onDeleteAngleVariationCandidate?: (
    shotNumber: number,
    originalIndex: number
  ) => void;

  /* ---- Phase 1.3 — episode-level model selection ---- */
  imageModels?: VerticalDramaCapableModel[];
  videoModels?: VerticalDramaCapableModel[];
  selectedImageModelId?: string;
  selectedVideoModelId?: string;
  onSelectImageModel?: (modelId: string) => void;
  onSelectVideoModel?: (modelId: string) => void;
  modelsLoading?: boolean;
  /** Currently-selected MCP connection id (MCP-transport models — Higgsfield/
   *  Magnific etc., creditCost 0). Persisted by the caller (localStorage). */
  mcpConnectionId?: string | null;
  onSelectMcpConnection?: (connectionId: string | null) => void;

  /* ---- Resolution selector (storyboard-complete plan Phase 6.2) ---- */
  selectedImageResolution?: string;
  selectedVideoResolution?: string;
  onSelectImageResolution?: (resolution: string) => void;
  onSelectVideoResolution?: (resolution: string) => void;

  /* ---- Video-prompt language options (episode-level language plan) ---- */
  selectedPromptLanguage?: string;
  selectedDialogueLanguage?: string;
  onSelectPromptLanguage?: (language: string) => void;
  onSelectDialogueLanguage?: (language: string) => void;
  selectedThaiAccent?: string | null;
  onSelectThaiAccent?: (value: string) => void;

  /* ---- Native audio direction toggle (task #36, added 2026-07-09) ---- */
  nativeAudioEnabled?: boolean;
  onSelectNativeAudioEnabled?: (enabled: boolean) => void;

  /* ---- Phase 2.5 — per-shot reference strip ---- */
  shotReferencesByShot?: Record<number, VerticalDramaShotReferenceView[]>;
  onAddShotReference?: (
    shotNumber: number,
    payload: { url: string; source: VerticalDramaShotReferenceView["source"] }
  ) => void;
  onRemoveShotReference?: (shotNumber: number, referenceId: string) => void;
  addingShotReferenceForShot?: ReadonlySet<number>;
  onUseShotReferenceAsMain?: (shotNumber: number, mediaAssetId: string) => void;
  usingShotReferenceAsMainForShot?: number | null;

  /* ---- Phase 3.4 — dialogue box ---- */
  onSaveClipDialogue?: (
    clipNumber: number,
    dialogue: VerticalDramaClipDialogueLineView[]
  ) => void;
  savingDialogueForClip?: number | null;
  onRegenerateClipDialogue?: (shotNumber: number, instruction: string) => void;
  regeneratingDialogueForShot?: ReadonlySet<number>;

  /* ---- Video clip generation (`generateVideoClip`) ---- */
  onGenerateVideoClip?: (clipNumber: number) => void;
  generatingVideoClipForClip?: ReadonlySet<number>;
  ttsFallbackByClip?: Record<number, boolean>;
  trimmedReferenceCountByClip?: Record<number, number>;
  /** Upload video file per shot (2026-07-07 upgrade) — see the same-named
   *  prop on `VerticalDramaStoryboardPanel`. */
  onUploadVideoClip?: (
    clipNumber: number,
    file: File,
    sourceShotNumber: number
  ) => void;
  uploadingVideoClipForClip?: ReadonlySet<number>;

  /* ---- Phase 4.1/4.2 — one-click generate + inline prompt editing ---- */
  onSaveStartFramePrompt?: (shotNumber: number, prompt: string) => void;
  /** `clipNumber` (2026-07-10 speaker-aware sub-shots) — mirrors
   *  `VerticalDramaStoryboardPanel`'s own prop of the same name. */
  onSaveVideoPrompt?: (
    shotNumber: number,
    clipNumber: number,
    prompt: string
  ) => void;
  onGeneratePromptAndImage?: (
    shotNumber: number,
    mode: "single" | "angles"
  ) => void;
  generatingPromptAndImageForShot?: ReadonlySet<number>;

  /* ---- Phase 3B.5 — quality review card ---- */
  qualityReview?: VerticalDramaQualityReviewView | null;
  onRunQualityReview?: () => void;
  runningQualityReview?: boolean;
  onCopySuggestedFix?: (suggestedFix: string) => void;
  onApplyQualityReviewSuggestions?: () => void;
  applyingQualityReviewSuggestions?: boolean;
  onRequestAlternativeQualityReview?: () => void;
  requestingAlternativeQualityReview?: boolean;

  /* ---- Manual episode -> series memory summarization ---- */
  onSummarizeEpisodeToMemory?: (opts?: { force?: boolean }) => void;
  summarizingEpisodeToMemory?: boolean;
  episodeAlreadySummarizedToMemory?: boolean;

  /* ---- Phase 6.5 — image-to-image repair dialog ---- */
  onSubmitRepairImage?: (shotNumber: number, instruction: string) => void;
  repairImageSubmittingForShot?: number | null;
  repairImageResultByShot?: Record<
    number,
    { beforeUrl: string; afterUrl: string }
  >;
  repairImageErrorByShot?: Record<number, string>;
  onAcceptRepairImage?: (shotNumber: number) => void;
  onDiscardRepairImage?: (shotNumber: number) => void;
  repairImageDialogForShot?: number | null;
  onOpenRepairImageDialog?: (shotNumber: number) => void;
  onCloseRepairImageDialog?: () => void;

  /* ---- Phase 6.6 — per-shot video prompt generation ---- */
  onGenerateShotVideoPrompt?: (shotNumber: number) => void;
  generatingShotVideoPromptForShot?: ReadonlySet<number>;
  usedVisionByShot?: Record<number, boolean>;

  /* ---- Whole-episode compiled video (2026-07-06 download + assembly upgrade) ---- */
  compiledVideo?: VerticalDramaCompiledVideoView | null;
  onAssembleCompiledVideo?: (opts?: { allowPartial?: boolean }) => void;
  assemblingCompiledVideo?: boolean;
  totalClipCount?: number;
  readyClipNumbers?: number[];

  /* ---- Wave-5A (2026-07-07 production-grade upgrade) — density meter,
     scorecard v2, tie-in report. Mirrors the same-named
     `VerticalDramaStoryboardPanelProps` additions verbatim; see that file
     for full field documentation. ---- */
  speechBudgetEnabled?: boolean;
  onRepairWholeEpisodeScript?: () => void;
  qualityLoopV2Enabled?: boolean;
  tieInQcEnabled?: boolean;
  qualityPolicy?: VerticalDramaQualityPolicyView | null;
  qualityLoopState?: VerticalDramaQualityLoopStateView | null;
  onRunQualityImproveLoop?: () => void;
  runningQualityImproveLoop?: boolean;
  tieInEnabled?: boolean;
  tieInQualityReport?: VerticalDramaTieInReportView | null;
  onDeferTieIn?: () => void;
  deferringTieIn?: boolean;
  tieInDeferScheduleAtRisk?: boolean;
  /** `getEpisodeDetail.seasonTieInPlacement` (task #31, spec §7.7.2/§7.7.3) — season-plan status line, threaded straight through to `VerticalDramaStoryboardPanel`'s prop of the same name. */
  seasonTieInPlacement?: VerticalDramaSeasonTieInPlacementView | null;
}

/** Minimal per-stage state the workspace needs to render progress + CTA. */
export interface VerticalDramaStageState {
  stage: VerticalDramaPipelineStage;
  status: RunResult["status"];
  nextAction: RunResult["next_action"];
  artifactIds?: string[];
  warnings?: RunResult["warnings"];
  errors?: RunResult["errors"];
  /** The pending checkpoint id for this stage, when awaiting approval. */
  checkpointId?: string;
}

type PhaseStatus = "complete" | "active" | "blocked" | "waiting" | "pending";

export interface VerticalDramaEpisodeWorkspaceProps {
  locale?: VdLocale;
  loading?: boolean;
  /** Null when the series has no episode yet (empty state → create CTA). */
  episode?: {
    id: string;
    episodeNumber: number;
    title?: string | null;
    status: string;
  } | null;
  /** Per-stage state keyed by stage; missing stages are treated as pending. */
  stageStates?: Partial<
    Record<VerticalDramaPipelineStage, VerticalDramaStageState>
  >;
  /** Whether the episode is complete (renders the read-only historical view). */
  completed?: boolean;
  approvalBarState?: VerticalDramaApprovalBarState;
  rejectionReason?: string;
  runs?: VerticalDramaRunRow[];
  runsLoading?: boolean;
  memory?: Omit<VerticalDramaMemoryTimelineProps, "locale">;
  // Callbacks (wire to the verticalDramaEpisodes tRPC router at the call site).
  onCreateEpisode?: () => void;
  onPrimaryCta?: (action: {
    stage: VerticalDramaPipelineStage;
    nextAction: RunResult["next_action"];
  }) => void;
  onApprove?: (checkpointId?: string) => void;
  onReject?: (checkpointId?: string) => void;
  onRepair?: (stage: VerticalDramaPipelineStage) => void;
  /** Runs `plan_episode_script` for real (mode "full", spends credits) —
   *  distinct from `onPrimaryCta`, which only ever runs the free dry-run
   *  placeholder. Shown as a separate confirm-gated button (mirrors
   *  `VerticalDramaStoryboardPanel`'s "Generate real storyboard" pattern)
   *  whenever `plan_episode_script` is the current stage, so real content is
   *  reachable even after a placeholder run already succeeded/is pending
   *  approval — calling `runStage` again supersedes it with a fresh
   *  real-content run and a fresh pending checkpoint. */
  onGenerateRealScript?: () => void;
  generatingRealScript?: boolean;
  /** One-click redesign (2026-07-05): chains normalize → script → character
   *  sync → character-ref check → storyboard, auto-approving each mechanical
   *  checkpoint, so the episode's primary entry point is a single button
   *  instead of clicking through 5 individual stage+approve steps. Replaces
   *  the compact "next action" box + advanced pipeline grid as the default
   *  view whenever no storyboard shots exist yet. */
  onGenerateEpisodeStoryboard?: () => void;
  /** Non-null while the one-click chain is running; drives live per-stage
   *  progress text ("กำลังสร้างบท…"). */
  generatingEpisodeStage?: VerticalDramaPipelineStage | null;
  /** Set when the chain stopped early due to a failed stage. */
  generateEpisodeFailure?: {
    stage: VerticalDramaPipelineStage;
    message: string;
  } | null;
  /** Deletes this stage's prior run(s) (cascades checkpoints + artifacts)
   *  and immediately regenerates in "full" mode — distinct from `onRepair`,
   *  which never deletes. Shown in the focused-stage detail panel below,
   *  confirm-gated in the UI since it's destructive. */
  onRegenerateStage?: (stage: VerticalDramaPipelineStage) => void;
  /** Non-null while a regenerate call for this exact stage is in flight. */
  regeneratingStage?: VerticalDramaPipelineStage | null;
  onOpenRun?: (run: VerticalDramaRunRow) => void;
  onOpenStageDetail?: (stage: VerticalDramaPipelineStage) => void;
  /** Which stage's full detail is shown in the stage-grid detail panel below. */
  focusedStage?: VerticalDramaPipelineStage | null;
  /** Fired whenever the user clicks a stage card (any stage, any status). */
  onFocusStage?: (stage: VerticalDramaPipelineStage) => void;
  /** Generic "view this stage's runs/artifacts" data — used for every stage
   * except the ones with a dedicated panel below. */
  stageRunDetail?: VerticalDramaStageRunDetailData;
  /** Dedicated review panel data for the `dialogue_audio_plan` stage. */
  dialogueAudioPanel?: VerticalDramaDialogueAudioPanelData;
  /** Dedicated review panel data for the `storyboard_shotgrid` stage. */
  storyboardPanel?: VerticalDramaStoryboardPanelData;
  /** Durable proof that `plan_episode_script` produced real content — shown
   *  as a small always-visible card (not just a toast, which disappears) so
   *  the user has tangible confirmation independent of which stage is
   *  currently focused. Absent/null while still on the dry-run placeholder. */
  scriptSummary?: { episodeTitle: string; hook: string } | null;
  /** The episode's Storyboard Review project id, once created. Shown as an
   *  always-visible header shortcut — independent of `findCurrentStage`'s
   *  sequencing, so it stays reachable after `create_storyboard_review_project`
   *  succeeds and the "current" stage has already moved on to the next one. */
  storyboardReviewId?: string | null;
  onOpenStoryboardReview?: () => void;

  /* ---- Production Wizard (section-12, 2026-07-07 production-grade
     upgrade). `wizard`/`productionWizardEnabled` mirror
     `getEpisodeDetail.wizard` / `detail.flags.productionWizard` verbatim —
     feature-detected on the PAYLOAD, never by importing server flag logic.
     `seriesId` (distinct from `storyboardPanel.seriesId`, which is used only
     for download filenames) keys the "Advanced stages" disclosure's
     localStorage-persisted open state. `wizard`/`perShotDialoguePreview`
     themselves are no longer rendered (planning/`polished-toasting-gadget.md`
     Part A2 removed the `VerticalDramaProductionWizard` mount in favor of
     `episodePlan` below) — kept here only so `productionWizardEnabled`'s
     "Advanced stages" disclosure gate stays wired exactly as before; the
     page may still pass them harmlessly. ---- */
  wizard?: VerticalDramaProductionWizardState | null;
  productionWizardEnabled?: boolean;
  seriesId?: string;
  /** `getEpisodeDetail`'s top-level `perShotDialoguePreview` (2026-07-08
   *  W9-C wiring) — no longer consumed (only fed the now-removed
   *  `VerticalDramaProductionWizard` mount, see `wizard` above). */
  perShotDialoguePreview?: VdWizardPerShotDialoguePreviewShot[] | null;
  /** Part A2 (planning/`polished-toasting-gadget.md`) — `getEpisodeDetail`'s
   *  top-level `episodePlan` (ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง), read
   *  straight from the series bible's active breakdown item for this
   *  episode. Rendered UNCONDITIONALLY (no flag gate, unlike the wizard
   *  above) via `VerticalDramaEpisodePlanPanel` — pure read-only reference
   *  data. `null`/`undefined` both render that panel's own empty state. */
  episodePlan?: VerticalDramaEpisodePlanSummaryView | null;

  /* ---- Task #26 (data sanity — episode number beyond the planned season
     size, e.g. episode 11 while the plan only covers 10) —
     `getEpisodeBreakdownStatus`'s result (a STANDALONE query, deliberately
     kept off `getEpisodeDetail` — see that new procedure's doc comment).
     `undefined`/`"matched"`/`"no_plan"` (query not loaded yet / within plan
     / legacy series with no plan at all) render nothing — only
     `"beyond_plan"` shows the compact warning banner below. ---- */
  breakdownStatus?: "matched" | "beyond_plan" | "no_plan";
  /** Only meaningful when `breakdownStatus === "beyond_plan"` — the season plan's episode count, interpolated into the banner title. */
  plannedEpisodeCount?: number;
  /** `${verticalDramaRoutes.seriesDetail(seriesId)}?tab=overview` — built by the page (same convention as `dialogueAudioPanel.castingTabHref`), so this component stays decoupled from route construction. */
  seasonPlanTabHref?: string;

  /* ---- Ad Banner Overlay — per-episode banner selection (F131W, task
     #30-A2, plan.md §6 episode side). Feature-detected on the PAYLOAD
     (`adBannerOverlayEnabled`, mirroring `detail.flags.adBannerOverlay`
     verbatim), never by importing server flag logic — same convention as
     `productionWizardEnabled`/`wizard` above. Flag-off (the default):
     nothing renders here at all. ---- */
  adBannerOverlayEnabled?: boolean;
  adBannerPlanPanel?: VerticalDramaAdBannerPlanPanelData;

  /* ---- Text Overlay Suite (F131AB, task #34, plan.md v2). Feature-detected
     on the PAYLOAD (`textOverlaySuiteEnabled`, mirroring
     `detail.flags.textOverlaySuite` verbatim), same convention as
     `adBannerOverlayEnabled` above. Flag-off (the default): nothing renders
     here at all. `characterIntroFrames` is the episode's own
     `startFramePlan.frames` projection (shotNumber +
     requiredCharacterRefs), threaded through so the section can render a
     "pick a shot" dropdown for mid-episode cards without a separate query. ---- */
  textOverlaySuiteEnabled?: boolean;
  textOverlayPlanPanel?: VerticalDramaTextOverlayPlanPanelData;
  textOverlayShotNumbers?: number[];

  /* ---- Task #21 / W12.5 "Final Render Suite" phase B (2026-07-09) —
     dialogue-audio + subtitle options for the whole-episode compiled video.
     `voiceChainEnabled` mirrors `adBannerOverlayEnabled`'s own "feature-
     detected on a boolean prop from the page" convention — gates ONLY the
     dialogue-audio checkbox (+ its nested loudness sub-checkbox); the
     subtitle preset picker always renders whenever this section renders at
     all (subtitles are derived from the episode's SCRIPT text, not from any
     generated audio — see `assembleEpisodeVideo`'s own doc comment,
     `server/routers/verticalDramaEpisodes.ts`). The page already resolves
     this exact value as `voiceChainFlagEnabled`
     (`VerticalDramaEpisodePage.tsx`'s `resolveVoiceChainFlagEnabled`). ---- */
  voiceChainEnabled?: boolean;
  finalRenderOptionsPanel?: VerticalDramaFinalRenderOptionsPanelData;

  className?: string;
}

function stageStatusFor(
  states: VerticalDramaEpisodeWorkspaceProps["stageStates"],
  stage: VerticalDramaPipelineStage
): VerticalDramaStageState {
  return (
    states?.[stage] ?? {
      stage,
      status: "queued",
      nextAction: "resume_next_stage",
    }
  );
}

/** The current stage = first stage not yet succeeded (drives the single CTA). */
function findCurrentStage(
  states: VerticalDramaEpisodeWorkspaceProps["stageStates"]
): VerticalDramaStageState | null {
  for (const phase of VD_PHASES) {
    for (const stage of phase.stages) {
      const s = stageStatusFor(states, stage);
      if (s.status !== "succeeded") return s;
    }
  }
  return null;
}

function phaseStatus(
  phase: VdPhase,
  states: VerticalDramaEpisodeWorkspaceProps["stageStates"]
): PhaseStatus {
  const stageStates = phase.stages.map(s => stageStatusFor(states, s));
  if (stageStates.every(s => s.status === "succeeded")) return "complete";
  if (stageStates.some(s => s.status === "failed")) return "blocked";
  if (stageStates.some(s => s.status === "approval_required")) return "waiting";
  if (stageStates.some(s => s.status === "running" || s.status === "succeeded"))
    return "active";
  return "pending";
}

/**
 * Stages covered by the one-click "generate episode" orchestration
 * (`handleGenerateEpisodeStoryboard` in `VerticalDramaEpisodePage.tsx`) —
 * while the episode is at any of these stages and has no storyboard shots
 * yet, show the single entry card instead of the per-stage compact box.
 * Stages after `storyboard_shotgrid` keep the existing stage-by-stage flow
 * (agreed scope boundary — not touched in this redesign pass).
 */
const SETUP_STAGES = new Set<VerticalDramaPipelineStage>([
  "normalize_series_input",
  "plan_episode_script",
  "update_character_visual_bible",
  "generate_or_import_character_refs",
  "storyboard_shotgrid",
]);

/** Map a stage's next_action to the single primary CTA label. */
function ctaLabel(
  t: ReturnType<typeof vdCopy>,
  action: RunResult["next_action"]
): string {
  switch (action) {
    case "approve":
      return t.approve;
    case "repair":
      return t.repair;
    case "open_storyboard_review":
      return t.openStoryboardReview;
    case "wait_for_provider":
      return t.running;
    case "resume_next_stage":
    case "none":
    default:
      return t.runDryRun;
  }
}

export function VerticalDramaEpisodeWorkspace({
  locale = "en",
  loading = false,
  episode,
  stageStates,
  completed = false,
  approvalBarState = "idle",
  rejectionReason,
  runs = [],
  runsLoading = false,
  memory,
  onCreateEpisode,
  onPrimaryCta,
  onApprove,
  onReject,
  onRepair,
  onGenerateRealScript,
  generatingRealScript = false,
  onGenerateEpisodeStoryboard,
  generatingEpisodeStage = null,
  generateEpisodeFailure = null,
  onRegenerateStage,
  regeneratingStage = null,
  onOpenRun,
  onOpenStageDetail,
  focusedStage: focusedStageProp,
  onFocusStage,
  stageRunDetail,
  dialogueAudioPanel,
  storyboardPanel,
  scriptSummary,
  storyboardReviewId,
  onOpenStoryboardReview,
  wizard = null,
  productionWizardEnabled = false,
  seriesId,
  perShotDialoguePreview,
  episodePlan = null,
  breakdownStatus,
  plannedEpisodeCount,
  seasonPlanTabHref,
  adBannerOverlayEnabled = false,
  adBannerPlanPanel,
  textOverlaySuiteEnabled = false,
  textOverlayPlanPanel,
  textOverlayShotNumbers,
  voiceChainEnabled = false,
  finalRenderOptionsPanel,
  className,
}: VerticalDramaEpisodeWorkspaceProps) {
  const t = useMemo(() => vdCopy(locale), [locale]);
  const current = useMemo(() => findCurrentStage(stageStates), [stageStates]);

  // Which stage's detail is shown in the grid's detail panel. Defaults to the
  // current actionable stage, but any card can move focus at any time.
  const [internalFocusedStage, setInternalFocusedStage] =
    useState<VerticalDramaPipelineStage | null>(current?.stage ?? null);
  const focusedStage = focusedStageProp ?? internalFocusedStage;
  /**
   * `plan_episode_script` had a dedicated confirm-gated "generate real X"
   * button in the compact "ขั้นตอนถัดไป" box, but `storyboard_shotgrid` and
   * `start_frame_render_plan` did not — their ONLY real-generation entry
   * point was buried in the "ขั้นสูง" advanced section's focused-stage
   * detail panel, or (for storyboard) only appeared once shots already
   * existed. Until then, the compact box's primary CTA for these stages
   * only ever ran the free dry-run placeholder, so a brand-new episode's
   * storyboard could never actually be generated for real from the natural
   * top-level flow — exactly the "created a new storyboard, no shots showed
   * up" bug report. Generalizes the same dedicated-button treatment to all
   * three stages, reusing the handlers already threaded down via
   * `storyboardPanel`/`onGenerateRealScript`.
   */
  const [confirmingRealGenerationStage, setConfirmingRealGenerationStage] =
    useState<VerticalDramaPipelineStage | null>(null);
  const realGenerationByStage: Partial<
    Record<
      VerticalDramaPipelineStage,
      { onGenerate: () => void; generating: boolean; testId: string }
    >
  > = {
    plan_episode_script: onGenerateRealScript
      ? {
          onGenerate: onGenerateRealScript,
          generating: generatingRealScript,
          testId: "script",
        }
      : undefined,
    storyboard_shotgrid: storyboardPanel?.onGenerateReal
      ? {
          onGenerate: storyboardPanel.onGenerateReal,
          generating: Boolean(storyboardPanel.generating),
          testId: "storyboard",
        }
      : undefined,
    start_frame_render_plan: storyboardPanel?.onGenerateStartFramePlan
      ? {
          onGenerate: storyboardPanel.onGenerateStartFramePlan,
          generating: Boolean(storyboardPanel.generatingStartFramePlan),
          testId: "start-frame-plan",
        }
      : undefined,
  };
  const [confirmingRegenerateStage, setConfirmingRegenerateStage] =
    useState<VerticalDramaPipelineStage | null>(null);
  const [confirmingGenerateEpisode, setConfirmingGenerateEpisode] =
    useState(false);

  useEffect(() => {
    if (
      focusedStageProp === undefined &&
      internalFocusedStage === null &&
      current
    ) {
      setInternalFocusedStage(current.stage);
    }
    // Only auto-focus once on first successful load; the user drives it after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function handleFocusStage(stage: VerticalDramaPipelineStage) {
    setInternalFocusedStage(stage);
    onFocusStage?.(stage);
    onOpenStageDetail?.(stage);
  }

  /**
   * Production Wizard (section-12) — "Advanced stages" disclosure open state,
   * default collapsed, persisted in localStorage per series (UX Rules: the
   * wizard state must survive refresh; the same applies to whether the user
   * had this section open). Read on mount/`seriesId` change rather than a
   * lazy `useState` initializer, since `seriesId` can arrive after the first
   * render (async episode-detail fetch upstream of this presentational
   * component).
   */
  const advancedStagesStorageKey = seriesId
    ? `vd-advanced-stages-open:${seriesId}`
    : null;
  const [advancedStagesOpen, setAdvancedStagesOpen] = useState(false);
  useEffect(() => {
    if (
      !productionWizardEnabled ||
      !advancedStagesStorageKey ||
      typeof window === "undefined"
    )
      return;
    setAdvancedStagesOpen(
      window.localStorage.getItem(advancedStagesStorageKey) === "true"
    );
  }, [productionWizardEnabled, advancedStagesStorageKey]);

  function handleAdvancedStagesOpenChange(next: boolean) {
    setAdvancedStagesOpen(next);
    if (advancedStagesStorageKey && typeof window !== "undefined") {
      window.localStorage.setItem(advancedStagesStorageKey, String(next));
    }
  }

  // Loading state.
  if (loading) {
    return (
      <div
        className={cn("space-y-4", className)}
        data-testid="vd-workspace-loading"
      >
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Empty state — no episode yet.
  if (!episode) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border border-dashed p-8",
          className
        )}
        data-testid="vd-workspace-empty"
      >
        <p className="text-sm text-muted-foreground">{t.noEpisode}</p>
        <Button
          type="button"
          onClick={onCreateEpisode}
          data-testid="vd-create-episode"
        >
          {t.createEpisode}
        </Button>
      </div>
    );
  }

  const hasStoryboardShots =
    (storyboardPanel?.storyboard?.shots?.length ?? 0) > 0;

  return (
    <div className={cn("space-y-4", className)} data-testid="vd-workspace">
      {/* Compact header — episode title + the two things always worth a
          direct shortcut (open the full review project; read-only badge).
          No phase-progress bars here anymore (moved into the advanced
          section below) — they conveyed "queued" for stages the user can't
          act on yet and added no value to the primary view. */}
      <section className="flex items-center justify-between rounded-lg border p-3">
        <h2 className="text-sm font-medium">
          {episode.title || `Episode ${episode.episodeNumber}`}
        </h2>
        <div className="flex items-center gap-2">
          {storyboardReviewId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenStoryboardReview}
              data-testid="vd-open-storyboard-review"
            >
              {t.openStoryboardReview}
            </Button>
          ) : null}
          {completed ? (
            <Badge variant="secondary">{t.readOnlyCompleted}</Badge>
          ) : null}
        </div>
      </section>

      {/* Task #26 (data sanity — episode number beyond the planned season
          size) — compact, always-visible warning when `getEpisodeBreakdown
          Status` reports this episode as `"beyond_plan"`. Mirrors
          `VerticalDramaDialogueAudioPanel`'s missing-casting banner exactly
          (same amber box + Link-to-series-tab shape). Renders nothing for
          `"matched"`/`"no_plan"` (grandfathered legacy series) or while the
          query hasn't resolved yet — placed above the Production Wizard so
          it is visible regardless of that flag. */}
      {breakdownStatus === "beyond_plan" ? (
        <div
          className="flex flex-col gap-1 rounded-md border border-amber-400/50 bg-amber-50 p-2.5 text-xs dark:bg-amber-950/30"
          data-testid="vd-episode-beyond-plan-banner"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0"
            />
            {vdCopyWithParams(t.episodeBeyondPlanTitle, {
              count: plannedEpisodeCount ?? 0,
            })}
          </p>
          <p className="text-muted-foreground">{t.episodeBeyondPlanBody}</p>
          {seasonPlanTabHref ? (
            <Link
              href={seasonPlanTabHref}
              className="w-fit font-medium text-primary underline-offset-2 hover:underline"
              data-testid="vd-episode-beyond-plan-link"
            >
              {t.episodeBeyondPlanLink}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Episode Plan panel (planning/`polished-toasting-gadget.md` Part
          A2) — replaces the Production Wizard mount above the stage
          surface. Read-only, rendered UNCONDITIONALLY (no
          `productionWizardEnabled` gate — this is plain reference data, not
          a wizard/flag-gated feature). */}
      <VerticalDramaEpisodePlanPanel lang={locale} episodePlan={episodePlan} />

      <AdvancedStagesDisclosure
        enabled={productionWizardEnabled}
        open={advancedStagesOpen}
        onOpenChange={handleAdvancedStagesOpenChange}
        locale={locale}
      >
        {scriptSummary ? (
          <section
            className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/20"
            aria-label="script"
            data-testid="vd-script-summary"
          >
            <p className="font-medium">{scriptSummary.episodeTitle}</p>
            <p className="text-muted-foreground">{scriptSummary.hook}</p>
          </section>
        ) : null}
      </AdvancedStagesDisclosure>

      {/* Primary content: the shot list once a storyboard exists (matches
        the Storyboard Review page's shot-list UX so this page and that one
        feel like the same product) — otherwise a single compact
        action row for whatever stage is next (script/characters/storyboard
        generation), no stage-card grid clutter.

        2026-07-08 meta/shot-grid disclosure split: `VerticalDramaStoryboardPanel`
        now renders OUTSIDE `AdvancedStagesDisclosure` — it handles its OWN
        internal meta-section disclosure (`productionWizardEnabled`/
        `advancedMetaOpen`, kept in sync with the SAME toggle/localStorage
        state below) so the per-shot production grid stays always visible,
        exactly as when the wizard flag is off. */}
      {hasStoryboardShots ? (
        <VerticalDramaStoryboardPanel
          locale={locale}
          seriesId={storyboardPanel?.seriesId}
          episodeNumber={storyboardPanel?.episodeNumber}
          storyboard={storyboardPanel?.storyboard}
          startFramePlan={storyboardPanel?.startFramePlan}
          motionPromptPack={storyboardPanel?.motionPromptPack}
          assetUrls={storyboardPanel?.assetUrls}
          loading={storyboardPanel?.loading}
          error={storyboardPanel?.error}
          generating={storyboardPanel?.generating}
          onGenerateReal={storyboardPanel?.onGenerateReal}
          onEditVideoPrompt={storyboardPanel?.onEditVideoPrompt}
          onChangeStartFrame={storyboardPanel?.onChangeStartFrame}
          onGenerateStartFramePlan={storyboardPanel?.onGenerateStartFramePlan}
          generatingStartFramePlan={storyboardPanel?.generatingStartFramePlan}
          onEditStartFramePrompt={storyboardPanel?.onEditStartFramePrompt}
          onGenerateVideoPromptPack={storyboardPanel?.onGenerateVideoPromptPack}
          generatingVideoPromptPack={storyboardPanel?.generatingVideoPromptPack}
          onGenerateStartFrameImage={storyboardPanel?.onGenerateStartFrameImage}
          generatingStartFrameImageForShot={
            storyboardPanel?.generatingStartFrameImageForShot
          }
          onGenerateAllStartFrameImages={
            storyboardPanel?.onGenerateAllStartFrameImages
          }
          characterPortraits={storyboardPanel?.characterPortraits}
          productTieInByShot={storyboardPanel?.productTieInByShot}
          productImages={storyboardPanel?.productImages}
          productImagesLoading={storyboardPanel?.productImagesLoading}
          onSaveShotProductReferences={
            storyboardPanel?.onSaveShotProductReferences
          }
          savingProductReferencesForShot={
            storyboardPanel?.savingProductReferencesForShot
          }
          onChangeCharacterReference={
            storyboardPanel?.onChangeCharacterReference
          }
          onDropCharacterReference={storyboardPanel?.onDropCharacterReference}
          onDropStartFrame={storyboardPanel?.onDropStartFrame}
          onGenerateAngleVariations={storyboardPanel?.onGenerateAngleVariations}
          generatingAngleVariationsForShot={
            storyboardPanel?.generatingAngleVariationsForShot
          }
          angleVariationGridUrlByShot={
            storyboardPanel?.angleVariationGridUrlByShot
          }
          onPickAngleVariationCandidate={
            storyboardPanel?.onPickAngleVariationCandidate
          }
          onDismissAngleVariations={storyboardPanel?.onDismissAngleVariations}
          onDeleteAngleVariationCandidate={
            storyboardPanel?.onDeleteAngleVariationCandidate
          }
          imageModels={storyboardPanel?.imageModels}
          videoModels={storyboardPanel?.videoModels}
          selectedImageModelId={storyboardPanel?.selectedImageModelId}
          selectedVideoModelId={storyboardPanel?.selectedVideoModelId}
          onSelectImageModel={storyboardPanel?.onSelectImageModel}
          onSelectVideoModel={storyboardPanel?.onSelectVideoModel}
          modelsLoading={storyboardPanel?.modelsLoading}
          mcpConnectionId={storyboardPanel?.mcpConnectionId}
          onSelectMcpConnection={storyboardPanel?.onSelectMcpConnection}
          selectedImageResolution={storyboardPanel?.selectedImageResolution}
          selectedVideoResolution={storyboardPanel?.selectedVideoResolution}
          onSelectImageResolution={storyboardPanel?.onSelectImageResolution}
          onSelectVideoResolution={storyboardPanel?.onSelectVideoResolution}
          selectedPromptLanguage={storyboardPanel?.selectedPromptLanguage}
          selectedDialogueLanguage={storyboardPanel?.selectedDialogueLanguage}
          onSelectPromptLanguage={storyboardPanel?.onSelectPromptLanguage}
          onSelectDialogueLanguage={storyboardPanel?.onSelectDialogueLanguage}
          selectedThaiAccent={storyboardPanel?.selectedThaiAccent}
          onSelectThaiAccent={storyboardPanel?.onSelectThaiAccent}
          nativeAudioEnabled={storyboardPanel?.nativeAudioEnabled}
          onSelectNativeAudioEnabled={
            storyboardPanel?.onSelectNativeAudioEnabled
          }
          shotReferencesByShot={storyboardPanel?.shotReferencesByShot}
          onAddShotReference={storyboardPanel?.onAddShotReference}
          onRemoveShotReference={storyboardPanel?.onRemoveShotReference}
          addingShotReferenceForShot={
            storyboardPanel?.addingShotReferenceForShot
          }
          onUseShotReferenceAsMain={storyboardPanel?.onUseShotReferenceAsMain}
          usingShotReferenceAsMainForShot={
            storyboardPanel?.usingShotReferenceAsMainForShot
          }
          onSaveClipDialogue={storyboardPanel?.onSaveClipDialogue}
          savingDialogueForClip={storyboardPanel?.savingDialogueForClip}
          onRegenerateClipDialogue={storyboardPanel?.onRegenerateClipDialogue}
          regeneratingDialogueForShot={
            storyboardPanel?.regeneratingDialogueForShot
          }
          onGenerateVideoClip={storyboardPanel?.onGenerateVideoClip}
          generatingVideoClipForClip={
            storyboardPanel?.generatingVideoClipForClip
          }
          ttsFallbackByClip={storyboardPanel?.ttsFallbackByClip}
          trimmedReferenceCountByClip={
            storyboardPanel?.trimmedReferenceCountByClip
          }
          onUploadVideoClip={storyboardPanel?.onUploadVideoClip}
          uploadingVideoClipForClip={storyboardPanel?.uploadingVideoClipForClip}
          onSaveStartFramePrompt={storyboardPanel?.onSaveStartFramePrompt}
          onSaveVideoPrompt={storyboardPanel?.onSaveVideoPrompt}
          onGeneratePromptAndImage={storyboardPanel?.onGeneratePromptAndImage}
          generatingPromptAndImageForShot={
            storyboardPanel?.generatingPromptAndImageForShot
          }
          qualityReview={storyboardPanel?.qualityReview}
          onRunQualityReview={storyboardPanel?.onRunQualityReview}
          runningQualityReview={storyboardPanel?.runningQualityReview}
          onCopySuggestedFix={storyboardPanel?.onCopySuggestedFix}
          onApplyQualityReviewSuggestions={
            storyboardPanel?.onApplyQualityReviewSuggestions
          }
          applyingQualityReviewSuggestions={
            storyboardPanel?.applyingQualityReviewSuggestions
          }
          onRequestAlternativeQualityReview={
            storyboardPanel?.onRequestAlternativeQualityReview
          }
          requestingAlternativeQualityReview={
            storyboardPanel?.requestingAlternativeQualityReview
          }
          onSummarizeEpisodeToMemory={
            storyboardPanel?.onSummarizeEpisodeToMemory
          }
          summarizingEpisodeToMemory={
            storyboardPanel?.summarizingEpisodeToMemory
          }
          episodeAlreadySummarizedToMemory={
            storyboardPanel?.episodeAlreadySummarizedToMemory
          }
          onSubmitRepairImage={storyboardPanel?.onSubmitRepairImage}
          repairImageSubmittingForShot={
            storyboardPanel?.repairImageSubmittingForShot
          }
          repairImageResultByShot={storyboardPanel?.repairImageResultByShot}
          repairImageErrorByShot={storyboardPanel?.repairImageErrorByShot}
          onAcceptRepairImage={storyboardPanel?.onAcceptRepairImage}
          onDiscardRepairImage={storyboardPanel?.onDiscardRepairImage}
          repairImageDialogForShot={storyboardPanel?.repairImageDialogForShot}
          onOpenRepairImageDialog={storyboardPanel?.onOpenRepairImageDialog}
          onCloseRepairImageDialog={storyboardPanel?.onCloseRepairImageDialog}
          onGenerateShotVideoPrompt={storyboardPanel?.onGenerateShotVideoPrompt}
          generatingShotVideoPromptForShot={
            storyboardPanel?.generatingShotVideoPromptForShot
          }
          usedVisionByShot={storyboardPanel?.usedVisionByShot}
          compiledVideo={storyboardPanel?.compiledVideo}
          onAssembleCompiledVideo={storyboardPanel?.onAssembleCompiledVideo}
          assemblingCompiledVideo={storyboardPanel?.assemblingCompiledVideo}
          totalClipCount={storyboardPanel?.totalClipCount}
          readyClipNumbers={storyboardPanel?.readyClipNumbers}
          speechBudgetEnabled={storyboardPanel?.speechBudgetEnabled}
          onRepairWholeEpisodeScript={
            storyboardPanel?.onRepairWholeEpisodeScript
          }
          qualityLoopV2Enabled={storyboardPanel?.qualityLoopV2Enabled}
          tieInQcEnabled={storyboardPanel?.tieInQcEnabled}
          qualityPolicy={storyboardPanel?.qualityPolicy}
          qualityLoopState={storyboardPanel?.qualityLoopState}
          onRunQualityImproveLoop={storyboardPanel?.onRunQualityImproveLoop}
          runningQualityImproveLoop={storyboardPanel?.runningQualityImproveLoop}
          tieInEnabled={storyboardPanel?.tieInEnabled}
          tieInQualityReport={storyboardPanel?.tieInQualityReport}
          onDeferTieIn={storyboardPanel?.onDeferTieIn}
          deferringTieIn={storyboardPanel?.deferringTieIn}
          tieInDeferScheduleAtRisk={storyboardPanel?.tieInDeferScheduleAtRisk}
          seasonTieInPlacement={storyboardPanel?.seasonTieInPlacement}
          productionWizardEnabled={productionWizardEnabled}
          advancedMetaOpen={advancedStagesOpen}
        />
      ) : null}

      {/* Task #21 / W12.5 "Final Render Suite" phase B (2026-07-09) — dialogue-
          audio + subtitle options for the SAME `assembleEpisodeVideo` call the
          storyboard panel's own "Assemble full episode video" button above
          triggers. Same `hasStoryboardShots` gate as the ad banner section
          right below: nothing to render options FOR until a storyboard/clips
          exist. Rendered BEFORE the ad banner section so the assembly-related
          controls read top-to-bottom in the order they affect the same
          render. */}
      {hasStoryboardShots ? (
        <VerticalDramaFinalRenderOptionsSection
          locale={locale}
          voiceChainEnabled={voiceChainEnabled}
          value={finalRenderOptionsPanel?.value}
          onChange={finalRenderOptionsPanel?.onChange}
          lastResult={finalRenderOptionsPanel?.lastResult}
          adBannerDesigns={adBannerPlanPanel?.designs}
        />
      ) : null}

      {/* Ad Banner Overlay (F131W, task #30-A2, plan.md §6) — near the
          assembly controls above (same `hasStoryboardShots` gate: nothing to
          composite banners onto until a storyboard/clips exist). */}
      {hasStoryboardShots && adBannerOverlayEnabled ? (
        <VerticalDramaAdBannerPlanSection
          locale={locale}
          designs={adBannerPlanPanel?.designs ?? []}
          plan={adBannerPlanPanel?.plan ?? null}
          saving={adBannerPlanPanel?.saving}
          error={adBannerPlanPanel?.error}
          onSave={adBannerPlanPanel?.onSave}
        />
      ) : null}

      {/* Text Overlay Suite (F131AB, task #34, plan.md v2) — near the ad
          banner section above (same `hasStoryboardShots` gate: nothing to
          anchor mid-episode cards to until a storyboard/clips exist). */}
      {hasStoryboardShots && textOverlaySuiteEnabled ? (
        <VerticalDramaTextOverlayPlanSection
          locale={locale}
          plan={textOverlayPlanPanel?.plan ?? null}
          preview={textOverlayPlanPanel?.preview ?? null}
          shotNumbers={textOverlayShotNumbers ?? []}
          saving={textOverlayPlanPanel?.saving}
          error={textOverlayPlanPanel?.error}
          onSave={textOverlayPlanPanel?.onSave}
        />
      ) : null}

      <AdvancedStagesDisclosure
        enabled={productionWizardEnabled}
        open={advancedStagesOpen}
        onOpenChange={handleAdvancedStagesOpenChange}
        locale={locale}
        hideTrigger
      >
        {!hasStoryboardShots ? (
          !completed && current && SETUP_STAGES.has(current.stage) ? (
            <section
              className="rounded-lg border bg-card p-4"
              aria-label={t.generateEpisode}
            >
              {episode?.title ? (
                <h2 className="mb-1 text-sm font-medium">{episode.title}</h2>
              ) : null}
              <p className="mb-3 text-sm text-muted-foreground">
                {t.generateEpisodeExplain}
              </p>
              {generateEpisodeFailure ? (
                <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium text-destructive">
                    {t.generateEpisodeFailedAt}{" "}
                    {vdStageLabel(generateEpisodeFailure.stage, locale)}
                  </p>
                  <p className="text-muted-foreground">
                    {generateEpisodeFailure.message}
                  </p>
                </div>
              ) : null}
              {generatingEpisodeStage ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                  {t.generateEpisodeProgress}{" "}
                  {vdStageLabel(generatingEpisodeStage, locale)}…
                </div>
              ) : confirmingGenerateEpisode ? (
                <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                  <p className="font-medium">
                    {t.generateRealScriptConfirmWarning}
                  </p>
                  <p className="text-muted-foreground">
                    {t.generateEpisodeConfirmNote}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmingGenerateEpisode(false)}
                    >
                      {t.cancel}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setConfirmingGenerateEpisode(false);
                        onGenerateEpisodeStoryboard?.();
                      }}
                      data-testid="vd-confirm-generate-episode"
                    >
                      {t.generateEpisodeConfirmButton}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => setConfirmingGenerateEpisode(true)}
                  data-testid="vd-generate-episode"
                >
                  {generateEpisodeFailure
                    ? t.generateEpisodeRetry
                    : t.generateEpisode}
                </Button>
              )}
            </section>
          ) : !completed && current ? (
            <section
              className="rounded-lg border bg-card p-3"
              aria-label={t.nextAction}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs uppercase text-muted-foreground">
                  {t.nextAction}
                </span>
                <Badge variant="outline">
                  {vdStageLabel(current.stage, locale)}
                </Badge>
                {current.status === "failed" ? (
                  <Badge variant="destructive">{t.failed}</Badge>
                ) : null}
              </div>

              {(() => {
                const action = realGenerationByStage[current.stage];
                if (!action) return null;
                const stageLabel = vdStageLabel(current.stage, locale);
                const generateLabel =
                  locale === "th"
                    ? `สร้าง${stageLabel}จริง (มีค่าใช้จ่าย)`
                    : `Generate real ${stageLabel} (paid)`;
                return (
                  <div className="mb-3">
                    {confirmingRealGenerationStage === current.stage ? (
                      <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                        <p className="font-medium">
                          {t.generateRealScriptConfirmWarning}
                        </p>
                        <p className="text-muted-foreground">
                          {t.generateRealScriptConfirmNote}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setConfirmingRealGenerationStage(null)
                            }
                            disabled={action.generating}
                          >
                            {t.cancel}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setConfirmingRealGenerationStage(null);
                              action.onGenerate();
                            }}
                            disabled={action.generating}
                            data-testid={`vd-confirm-generate-real-${action.testId}`}
                          >
                            {action.generating
                              ? t.generatingRealScript
                              : generateLabel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirmingRealGenerationStage(current.stage)
                        }
                        disabled={action.generating}
                        data-testid={`vd-generate-real-${action.testId}`}
                      >
                        {action.generating
                          ? t.generatingRealScript
                          : generateLabel}
                      </Button>
                    )}
                  </div>
                );
              })()}

              {current.nextAction === "approve" ? (
                <VerticalDramaApprovalBar
                  locale={locale}
                  state={approvalBarState}
                  rejectionReason={rejectionReason}
                  onApprove={() => onApprove?.(current.checkpointId)}
                  onReject={() => onReject?.(current.checkpointId)}
                  onRepair={() => onRepair?.(current.stage)}
                />
              ) : realGenerationByStage[current.stage] ? (
                // This stage already has its own dedicated "generate real X"
                // action rendered above — showing the generic "รันแบบทดสอบ" (test
                // run) button here too was confusing (two buttons, only one of
                // which actually does anything useful), and is exactly what
                // prompted the "makes me click a test step first" complaint.
                // Only keep a repair affordance for the failed case.
                current.status === "failed" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onRepair?.(current.stage)}
                    data-testid="vd-cta-repair"
                  >
                    {t.repair}
                  </Button>
                ) : null
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      onPrimaryCta?.({
                        stage: current.stage,
                        nextAction: current.nextAction,
                      })
                    }
                    data-testid="vd-primary-cta"
                  >
                    {current.stage === "update_character_visual_bible" ||
                    current.stage === "generate_or_import_character_refs"
                      ? t.syncCharacterData
                      : ctaLabel(t, current.nextAction)}
                  </Button>
                  {current.status === "failed" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onRepair?.(current.stage)}
                      data-testid="vd-cta-repair"
                    >
                      {t.repair}
                    </Button>
                  ) : null}
                  {/* "Free, no paid generation" is only true of the actual
                  dry-run placeholder path — `update_character_visual_bible`
                  and `generate_or_import_character_refs` both always run a
                  real (free) sync now, so the dry-run note would be
                  misleading there (see decisions.md). */}
                  {current.stage !== "update_character_visual_bible" &&
                  current.stage !== "generate_or_import_character_refs" ? (
                    <span className="text-xs text-muted-foreground">
                      {t.dryRunNote}
                    </span>
                  ) : null}
                </div>
              )}

              {current.errors && current.errors.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {current.errors.map((e, i) => (
                    <li key={i} className="text-xs text-destructive">
                      [{e.code}] {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : completed ? (
            <div className="rounded-lg border px-3 py-2 text-sm font-medium">
              {t.readOnlyCompleted}
            </div>
          ) : null
        ) : null}

        {/* Everything else (per-stage grid, run ledger, memory timeline) still
          exists — approval/repair on stages the compact view above doesn't
          cover, and debugging a specific past run, both still need it — but
          it's demoted to an explicitly-opened "advanced" section instead of
          always-visible clutter. Collapsed by default. */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/50"
              data-testid="vd-advanced-toggle"
            >
              <span>{t.advancedPipelineDetail}</span>
              <ChevronDown
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                {/* Phase progress indicator (reduced-motion safe: static bars, no pulse). */}
                <section
                  aria-label={t.phaseProgress}
                  className="rounded-lg border p-3"
                >
                  <ol className="flex flex-wrap gap-2">
                    {VD_PHASES.map(phase => {
                      const status = phaseStatus(phase, stageStates);
                      return (
                        <li
                          key={phase.id}
                          className={cn(
                            "flex min-w-[120px] flex-1 flex-col gap-1 rounded-md border p-2 motion-reduce:animate-none",
                            status === "complete" &&
                              "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20",
                            status === "active" &&
                              "border-primary/50 bg-primary/5",
                            status === "waiting" &&
                              "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20",
                            status === "blocked" &&
                              "border-destructive/50 bg-destructive/5"
                          )}
                          data-phase={phase.id}
                          data-status={status}
                        >
                          <span className="text-xs font-medium">
                            {vdPhaseLabel(phase, locale)}
                          </span>
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {status === "complete"
                              ? t.completed
                              : status === "waiting"
                                ? t.waitingForApproval
                                : status === "blocked"
                                  ? t.failed
                                  : status === "active"
                                    ? t.running
                                    : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </section>

                {/* Stage-card grid — every stage is always clickable, grouped by phase. */}
                <section className="space-y-3" aria-label="stages">
                  {VD_PHASES.map(phase => (
                    <div key={phase.id} className="rounded-lg border p-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                        {vdPhaseLabel(phase, locale)}
                      </h3>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {phase.stages.map(stage => {
                          const s = stageStatusFor(stageStates, stage);
                          const isFocused = stage === focusedStage;
                          return (
                            <button
                              key={stage}
                              type="button"
                              onClick={() => handleFocusStage(stage)}
                              aria-current={isFocused ? "true" : undefined}
                              className={cn(
                                "flex flex-col gap-1.5 rounded-md border p-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isFocused
                                  ? "border-primary bg-primary/5"
                                  : "bg-card hover:bg-accent/50"
                              )}
                              data-testid={`vd-stage-${stage}`}
                            >
                              <span className="font-medium">
                                {vdStageLabel(stage, locale)}
                              </span>
                              <span className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    s.status === "failed"
                                      ? "destructive"
                                      : s.status === "succeeded"
                                        ? "secondary"
                                        : s.status === "approval_required"
                                          ? "outline"
                                          : "default"
                                  }
                                  className="text-[10px]"
                                >
                                  {s.status}
                                </Badge>
                                {!completed && s.status === "failed" ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    className="text-xs text-muted-foreground underline hover:text-foreground"
                                    onClick={e => {
                                      e.stopPropagation();
                                      onRepair?.(stage);
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation();
                                        onRepair?.(stage);
                                      }
                                    }}
                                  >
                                    {t.repair}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>

                {/* Focused-stage detail — independent of the primary CTA above. */}
                {focusedStage ? (
                  <section
                    className="rounded-lg border p-3"
                    aria-label={vdStageLabel(focusedStage, locale)}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium">
                        {vdStageLabel(focusedStage, locale)}
                      </h3>
                      {stageStatusFor(stageStates, focusedStage).status !==
                        "queued" && onRegenerateStage ? (
                        confirmingRegenerateStage === focusedStage ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">
                              {t.regenerateConfirm}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => setConfirmingRegenerateStage(null)}
                              disabled={regeneratingStage === focusedStage}
                            >
                              {t.cancel}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                setConfirmingRegenerateStage(null);
                                onRegenerateStage(focusedStage);
                              }}
                              disabled={regeneratingStage === focusedStage}
                              data-testid="vd-confirm-regenerate-stage"
                            >
                              {regeneratingStage === focusedStage ? (
                                <>
                                  <Loader2
                                    aria-hidden="true"
                                    className="h-3 w-3 animate-spin"
                                  />
                                  {t.regenerating}
                                </>
                              ) : (
                                t.regenerateConfirmButton
                              )}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setConfirmingRegenerateStage(focusedStage)
                            }
                            data-testid="vd-regenerate-stage"
                          >
                            <RotateCcw aria-hidden="true" className="h-3 w-3" />
                            {t.regenerateStage}
                          </Button>
                        )
                      ) : null}
                    </div>
                    {focusedStage === "dialogue_audio_plan" ? (
                      <VerticalDramaDialogueAudioPanel
                        locale={locale}
                        plan={dialogueAudioPanel?.plan}
                        loading={dialogueAudioPanel?.loading}
                        error={dialogueAudioPanel?.error}
                        onGenerate={dialogueAudioPanel?.onGenerate}
                        batch={dialogueAudioPanel?.batch}
                      />
                    ) : focusedStage === "storyboard_shotgrid" &&
                      !hasStoryboardShots ? (
                      <VerticalDramaStoryboardPanel
                        locale={locale}
                        storyboard={storyboardPanel?.storyboard}
                        startFramePlan={storyboardPanel?.startFramePlan}
                        motionPromptPack={storyboardPanel?.motionPromptPack}
                        assetUrls={storyboardPanel?.assetUrls}
                        loading={storyboardPanel?.loading}
                        error={storyboardPanel?.error}
                        generating={storyboardPanel?.generating}
                        onGenerateReal={storyboardPanel?.onGenerateReal}
                        onEditVideoPrompt={storyboardPanel?.onEditVideoPrompt}
                        onChangeStartFrame={storyboardPanel?.onChangeStartFrame}
                        productTieInByShot={storyboardPanel?.productTieInByShot}
                        productImages={storyboardPanel?.productImages}
                        productImagesLoading={
                          storyboardPanel?.productImagesLoading
                        }
                        onSaveShotProductReferences={
                          storyboardPanel?.onSaveShotProductReferences
                        }
                        savingProductReferencesForShot={
                          storyboardPanel?.savingProductReferencesForShot
                        }
                        imageModels={storyboardPanel?.imageModels}
                        videoModels={storyboardPanel?.videoModels}
                        selectedImageModelId={
                          storyboardPanel?.selectedImageModelId
                        }
                        selectedVideoModelId={
                          storyboardPanel?.selectedVideoModelId
                        }
                        onSelectImageModel={storyboardPanel?.onSelectImageModel}
                        onSelectVideoModel={storyboardPanel?.onSelectVideoModel}
                        modelsLoading={storyboardPanel?.modelsLoading}
                        mcpConnectionId={storyboardPanel?.mcpConnectionId}
                        onSelectMcpConnection={
                          storyboardPanel?.onSelectMcpConnection
                        }
                        qualityReview={storyboardPanel?.qualityReview}
                        onRunQualityReview={storyboardPanel?.onRunQualityReview}
                        runningQualityReview={
                          storyboardPanel?.runningQualityReview
                        }
                        onCopySuggestedFix={storyboardPanel?.onCopySuggestedFix}
                        onApplyQualityReviewSuggestions={
                          storyboardPanel?.onApplyQualityReviewSuggestions
                        }
                        applyingQualityReviewSuggestions={
                          storyboardPanel?.applyingQualityReviewSuggestions
                        }
                        onRequestAlternativeQualityReview={
                          storyboardPanel?.onRequestAlternativeQualityReview
                        }
                        requestingAlternativeQualityReview={
                          storyboardPanel?.requestingAlternativeQualityReview
                        }
                        onSummarizeEpisodeToMemory={
                          storyboardPanel?.onSummarizeEpisodeToMemory
                        }
                        summarizingEpisodeToMemory={
                          storyboardPanel?.summarizingEpisodeToMemory
                        }
                        episodeAlreadySummarizedToMemory={
                          storyboardPanel?.episodeAlreadySummarizedToMemory
                        }
                        speechBudgetEnabled={
                          storyboardPanel?.speechBudgetEnabled
                        }
                        onRepairWholeEpisodeScript={
                          storyboardPanel?.onRepairWholeEpisodeScript
                        }
                        qualityLoopV2Enabled={
                          storyboardPanel?.qualityLoopV2Enabled
                        }
                        tieInQcEnabled={storyboardPanel?.tieInQcEnabled}
                        qualityPolicy={storyboardPanel?.qualityPolicy}
                        qualityLoopState={storyboardPanel?.qualityLoopState}
                        onRunQualityImproveLoop={
                          storyboardPanel?.onRunQualityImproveLoop
                        }
                        runningQualityImproveLoop={
                          storyboardPanel?.runningQualityImproveLoop
                        }
                        tieInEnabled={storyboardPanel?.tieInEnabled}
                        tieInQualityReport={storyboardPanel?.tieInQualityReport}
                        onDeferTieIn={storyboardPanel?.onDeferTieIn}
                        deferringTieIn={storyboardPanel?.deferringTieIn}
                        tieInDeferScheduleAtRisk={
                          storyboardPanel?.tieInDeferScheduleAtRisk
                        }
                        seasonTieInPlacement={
                          storyboardPanel?.seasonTieInPlacement
                        }
                      />
                    ) : (
                      <VerticalDramaRunDetailView
                        locale={locale}
                        runs={stageRunDetail?.runs ?? []}
                        detail={stageRunDetail?.detail ?? null}
                        selectedRunId={stageRunDetail?.selectedRunId}
                        onSelectRun={stageRunDetail?.onSelectRun}
                        loading={stageRunDetail?.loading}
                        error={stageRunDetail?.error}
                      />
                    )}
                  </section>
                ) : null}
              </div>

              <aside className="space-y-4">
                <VerticalDramaRunsList
                  locale={locale}
                  runs={runs}
                  loading={runsLoading}
                  onOpenRun={onOpenRun}
                />
                {memory ? (
                  <VerticalDramaMemoryTimeline locale={locale} {...memory} />
                ) : null}
              </aside>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </AdvancedStagesDisclosure>
    </div>
  );
}

/**
 * "Advanced stages" (ขั้นสูง) disclosure (section-12 Rollout step 4) — wraps
 * the workspace's existing primary-content + advanced-pipeline-detail block
 * (everything from `scriptSummary` through the pre-existing
 * `advancedPipelineDetail` collapsible) once `flags.productionWizard` is on,
 * so the newly-primary wizard above does not have to visually compete with
 * the full expert surface. `enabled={false}` (the default — flag off)
 * returns `children` completely unwrapped, so flags-off markup is BYTE-
 * IDENTICAL to before this component existed — no extra DOM node, no extra
 * className, nothing.
 *
 * `hideTrigger` (2026-07-08 meta/shot-grid disclosure split) — renders a
 * SECOND, trigger-less content region bound to the SAME `open` boolean/
 * `vd-advanced-stages-toggle` button rendered by the FIRST (default)
 * instance elsewhere in the tree, so the per-shot production grid
 * (`VerticalDramaStoryboardPanel`, always visible, rendered BETWEEN the two
 * instances) never has to sit inside either region while everything that
 * still SHOULD collapse together (the pre-existing `advancedPipelineDetail`
 * block) keeps doing so, driven by one single visible toggle.
 */
function AdvancedStagesDisclosure({
  enabled,
  open,
  onOpenChange,
  locale,
  hideTrigger = false,
  children,
}: {
  enabled: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  locale: VdLocale;
  hideTrigger?: boolean;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;

  if (hideTrigger) {
    return (
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleContent className="space-y-4 pt-3">
          {children}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  const t = vdCopy(locale);
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/50"
          data-testid="vd-advanced-stages-toggle"
        >
          <span>{t.wizardAdvancedStagesDisclosure}</span>
          <ChevronDown
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* -------------------------------------------------------------------------- */
/* Ad Banner Overlay — per-episode banner selection (F131W, task #30-A2)      */
/* -------------------------------------------------------------------------- */

/** English label for a placement id — `adBannerPresets.ts`'s placement presets only carry a Thai `nameTh` (no English counterpart, unlike the style presets), so this file owns both languages via its own copy keys instead of mixing two i18n sources for one label. */
function adBannerPlacementLabel(
  placementId: VdAdBannerPlacementId,
  t: ReturnType<typeof vdCopy>
): string {
  switch (placementId) {
    case "bottom_band":
      return t.adBannerPlacementBottomBand;
    case "side_vertical":
      return t.adBannerPlacementSideVertical;
    case "fullscreen":
      return t.adBannerPlacementFullscreen;
    default:
      return placementId;
  }
}

/** Seed a fresh draft timing from a design's own `defaultTiming` — same "explicit timing, else the design's defaultTiming" resolution order the server's `resolveEpisodeAdBannerEffectiveWindow` uses, just always producing CONCRETE numbers (this editor never leaves `startSec`/`durationSec` undefined, even for `"entire"` mode, where they are simply ignored by the server). */
function defaultAdBannerDraftTiming(
  design: VerticalDramaAdBannerDesignSummaryView
): VerticalDramaAdBannerTimingView {
  const timing = design.defaultTiming;
  return {
    mode: timing?.mode ?? "entire",
    startSec: timing?.startSec ?? 0,
    durationSec: timing?.durationSec ?? 3,
  };
}

/**
 * Client-side mirror of the server's `validateEpisodeAdBannerPlan`
 * (`server/routers/verticalDramaEpisodes.ts`) — same two checks the server
 * treats as hard errors (≤`VD_AD_BANNER_MAX_PER_SERIES` selections, no
 * overlapping fullscreen selections), duplicated rather than imported (this
 * component never imports server code). Deliberately does NOT duplicate the
 * unknown-design/not-ready checks — this editor only ever lets the user pick
 * from the `designs` list it was given, so those states are unreachable from
 * the UI itself. Pure — returns user-facing message strings, already
 * localized via `t`.
 */
function validateAdBannerSelectionsClientSide(
  selections: VerticalDramaAdBannerSelectionView[],
  designs: VerticalDramaAdBannerDesignSummaryView[],
  t: ReturnType<typeof vdCopy>
): string[] {
  const messages: string[] = [];
  if (selections.length > VD_AD_BANNER_MAX_PER_SERIES) {
    messages.push(
      vdCopyWithParams(t.adBannerTooManyError, {
        n: VD_AD_BANNER_MAX_PER_SERIES,
      })
    );
  }

  const designsById = new Map(designs.map(d => [d.id, d]));
  const fullscreenWindows: Array<{ startSec: number; endSec: number }> = [];
  for (const selection of selections) {
    const design = designsById.get(selection.bannerId);
    if (!design || design.placementId !== "fullscreen") continue;
    const timing = selection.timing ?? defaultAdBannerDraftTiming(design);
    fullscreenWindows.push(
      timing.mode === "window"
        ? {
            startSec: timing.startSec,
            endSec: timing.startSec + timing.durationSec,
          }
        : { startSec: 0, endSec: Number.POSITIVE_INFINITY }
    );
  }
  outer: for (let i = 0; i < fullscreenWindows.length; i += 1) {
    for (let j = i + 1; j < fullscreenWindows.length; j += 1) {
      const a = fullscreenWindows[i]!;
      const b = fullscreenWindows[j]!;
      if (a.startSec < b.endSec && b.startSec < a.endSec) {
        messages.push(t.adBannerFullscreenOverlapError);
        break outer; // one message is enough for this compact UI
      }
    }
  }
  return messages;
}

/**
 * The "แบนเนอร์ในวิดีโอนี้" section (plan.md §6 episode side) — lets the user
 * pick which of the series' READY banner designs appear in this episode's
 * video, with an optional per-selection timing override. Local draft state
 * (seeded from `plan`, re-seeded whenever `plan` itself changes — e.g. after
 * a successful save + `getEpisodeDetail` refetch, or navigating to a
 * different episode) with an explicit "บันทึกแบนเนอร์" save button, rather
 * than saving on every checkbox/input change — this mutation is a full
 * read-validate-write round trip, not a cheap per-keystroke autosave.
 */
function VerticalDramaAdBannerPlanSection({
  locale,
  designs,
  plan,
  saving = false,
  error = null,
  onSave,
}: {
  locale: VdLocale;
  designs: VerticalDramaAdBannerDesignSummaryView[];
  plan: VerticalDramaAdBannerPlanView | null;
  saving?: boolean;
  error?: string | null;
  onSave?: (plan: VerticalDramaAdBannerPlanView) => void;
}) {
  const t = useMemo(() => vdCopy(locale), [locale]);
  const readyDesigns = useMemo(
    () => designs.filter(d => d.status === "ready" && d.imageUrl),
    [designs]
  );

  const [enabled, setEnabled] = useState(plan?.enabled ?? false);
  const [selections, setSelections] = useState<
    VerticalDramaAdBannerSelectionView[]
  >(plan?.selections ?? []);

  useEffect(() => {
    setEnabled(plan?.enabled ?? false);
    setSelections(plan?.selections ?? []);
  }, [plan]);

  function toggleDesign(
    design: VerticalDramaAdBannerDesignSummaryView,
    checked: boolean
  ) {
    setSelections(prev => {
      if (checked) {
        if (prev.some(s => s.bannerId === design.id)) return prev;
        return [
          ...prev,
          { bannerId: design.id, timing: defaultAdBannerDraftTiming(design) },
        ];
      }
      return prev.filter(s => s.bannerId !== design.id);
    });
  }

  function updateTiming(
    bannerId: string,
    patch: Partial<VerticalDramaAdBannerTimingView>
  ) {
    setSelections(prev =>
      prev.map(s =>
        s.bannerId === bannerId
          ? {
              ...s,
              timing: {
                ...(s.timing ?? {
                  mode: "entire",
                  startSec: 0,
                  durationSec: 3,
                }),
                ...patch,
              },
            }
          : s
      )
    );
  }

  const validationMessages = useMemo(
    () => validateAdBannerSelectionsClientSide(selections, readyDesigns, t),
    [selections, readyDesigns, t]
  );
  const hasBlockingIssue = validationMessages.length > 0;

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-3"
      aria-label={t.adBannerSectionTitle}
      data-testid="vd-ad-banner-plan-section"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t.adBannerSectionTitle}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t.adBannerEnableLabel}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={next => setEnabled(Boolean(next))}
            data-testid="vd-ad-banner-enabled-toggle"
          />
        </div>
      </div>

      {enabled ? (
        readyDesigns.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.adBannerNoDesigns}</p>
        ) : (
          <div className="space-y-2">
            {readyDesigns.map(design => {
              const selection = selections.find(s => s.bannerId === design.id);
              const selected = Boolean(selection);
              const disabled = design.excludedByApproval;
              const timing =
                selection?.timing ?? defaultAdBannerDraftTiming(design);
              return (
                <div
                  key={design.id}
                  className="flex flex-col gap-2 rounded-md border p-2"
                  data-testid={`vd-ad-banner-row-${design.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selected}
                      disabled={disabled}
                      onCheckedChange={checked =>
                        toggleDesign(design, Boolean(checked))
                      }
                      data-testid={`vd-ad-banner-checkbox-${design.id}`}
                    />
                    {design.imageUrl ? (
                      <img
                        src={design.imageUrl}
                        alt={design.label}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : null}
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">
                        {design.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {adBannerPlacementLabel(design.placementId, t)}
                      </span>
                    </div>
                    {disabled ? (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {t.adBannerApprovalRequiredBadge}
                      </Badge>
                    ) : null}
                  </div>

                  {selected && !disabled ? (
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          timing.mode === "entire" ? "default" : "outline"
                        }
                        onClick={() =>
                          updateTiming(design.id, { mode: "entire" })
                        }
                        data-testid={`vd-ad-banner-mode-entire-${design.id}`}
                      >
                        {t.adBannerTimingEntire}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          timing.mode === "window" ? "default" : "outline"
                        }
                        onClick={() =>
                          updateTiming(design.id, { mode: "window" })
                        }
                        data-testid={`vd-ad-banner-mode-window-${design.id}`}
                      >
                        {t.adBannerTimingWindow}
                      </Button>
                      {timing.mode === "window" ? (
                        <>
                          <label className="flex items-center gap-1 text-[11px]">
                            {t.adBannerStartSecLabel}
                            <Input
                              type="number"
                              min={0}
                              className="h-7 w-16"
                              value={timing.startSec}
                              onChange={e =>
                                updateTiming(design.id, {
                                  startSec: Number(e.target.value),
                                })
                              }
                              data-testid={`vd-ad-banner-start-${design.id}`}
                            />
                          </label>
                          <label className="flex items-center gap-1 text-[11px]">
                            {t.adBannerDurationSecLabel}
                            <Input
                              type="number"
                              min={0.1}
                              step={0.1}
                              className="h-7 w-16"
                              value={timing.durationSec}
                              onChange={e =>
                                updateTiming(design.id, {
                                  durationSec: Number(e.target.value),
                                })
                              }
                              data-testid={`vd-ad-banner-duration-${design.id}`}
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {validationMessages.length > 0 ? (
        <ul
          className="space-y-0.5 text-xs text-destructive"
          data-testid="vd-ad-banner-validation-errors"
        >
          {validationMessages.map(message => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p
          className="text-xs text-destructive"
          data-testid="vd-ad-banner-save-error"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={saving || hasBlockingIssue}
        onClick={() =>
          onSave?.({
            enabled,
            selections: selections.filter(s =>
              readyDesigns.some(d => d.id === s.bannerId)
            ),
          })
        }
        data-testid="vd-ad-banner-save"
      >
        {saving ? t.adBannerSaving : t.adBannerSave}
      </Button>
    </section>
  );
}

/** Maps a `textOverlayPreview` auto-derivation source id to its Thai/English
 *  copy label — shared by every "ที่มา" badge in the section below. */
function textOverlaySourceLabel(
  source: string | undefined,
  t: ReturnType<typeof vdTextOverlayCopy>
): string {
  switch (source) {
    case "cliffhanger":
      return t.sourceCliffhanger;
    case "hook":
      return t.sourceHook;
    case "summary":
      return t.sourceSummary;
    case "none":
      return t.sourceNone;
    case "manual":
      return t.sourceManual;
    default:
      return t.sourceFallback;
  }
}

/**
 * Text Overlay Suite (F131AB, task #34, plan.md v2) — the "ข้อความบนวิดีโอ"
 * section: per-kind toggles + auto-fill/manual editors for end card/opener
 * recap, an optional title-bumper text override, an episode-indicator
 * position picker, a read-only character-intro-card preview, a mid-episode
 * card list editor, and a rendered-text preview block. Same LOCAL-draft +
 * explicit-Save convention as `VerticalDramaAdBannerPlanSection` (draft
 * state seeded from `plan`, re-synced via `useEffect` whenever a fresh
 * `plan` arrives from the server, saved wholesale via `onSave`).
 *
 * Client-side validation here is a best-effort PREVIEW only (duration
 * bounds via `<Input min/max>`, a total-card-count guard) — the server's
 * `validateTextOverlayPlan` (`updateEpisodeTextOverlayPlan`) is the single
 * source of truth and is re-run on every save; its `warnings`/error message
 * surface through the `error` prop exactly like the ad banner section.
 */
function VerticalDramaTextOverlayPlanSection({
  locale,
  plan,
  preview,
  shotNumbers,
  saving = false,
  error = null,
  onSave,
}: {
  locale: VdLocale;
  plan: VerticalDramaTextOverlayPlanView | null;
  preview: VerticalDramaTextOverlayPreviewView | null;
  shotNumbers: number[];
  saving?: boolean;
  error?: string | null;
  onSave?: (plan: VerticalDramaTextOverlayPlanView) => void;
}) {
  const t = useMemo(() => vdTextOverlayCopy(locale), [locale]);

  const [draft, setDraft] = useState<VerticalDramaTextOverlayPlanView>(
    plan ?? {}
  );
  useEffect(() => {
    setDraft(plan ?? {});
  }, [plan]);

  function patchEndCard(patch: Partial<VerticalDramaTextOverlayEndCardView>) {
    setDraft(prev => ({
      ...prev,
      endCard: {
        enabled: prev.endCard?.enabled ?? false,
        durationSec: prev.endCard?.durationSec ?? 3,
        showFollowLine: prev.endCard?.showFollowLine ?? true,
        styleVariant: prev.endCard?.styleVariant ?? "center_card",
        text: prev.endCard?.text,
        source: prev.endCard?.source,
        ...patch,
      },
    }));
  }

  function patchOpenerRecap(
    patch: Partial<VerticalDramaTextOverlayOpenerRecapView>
  ) {
    setDraft(prev => ({
      ...prev,
      openerRecap: {
        enabled: prev.openerRecap?.enabled ?? false,
        durationSec: prev.openerRecap?.durationSec ?? 4,
        text: prev.openerRecap?.text,
        source: prev.openerRecap?.source,
        ...patch,
      },
    }));
  }

  function patchTitleBumper(
    patch: Partial<VerticalDramaTextOverlayTitleBumperView>
  ) {
    setDraft(prev => ({
      ...prev,
      titleBumper: {
        enabled: prev.titleBumper?.enabled ?? false,
        text: prev.titleBumper?.text,
        ...patch,
      },
    }));
  }

  function patchEpisodeIndicator(
    patch: Partial<VerticalDramaTextOverlayEpisodeIndicatorView>
  ) {
    setDraft(prev => ({
      ...prev,
      episodeIndicator: {
        enabled: prev.episodeIndicator?.enabled ?? false,
        position: prev.episodeIndicator?.position ?? "top_right",
        ...patch,
      },
    }));
  }

  function setCharacterIntroEnabled(enabled: boolean) {
    setDraft(prev => ({ ...prev, characterIntroCards: { enabled } }));
  }

  function addCard() {
    setDraft(prev => ({
      ...prev,
      cards: [
        ...(prev.cards ?? []),
        {
          id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: "time_setting",
          anchor: { shotNumber: shotNumbers[0] ?? 1, offsetSec: 0 },
          text: "",
          durationSec: 2.5,
          enabled: true,
        },
      ],
    }));
  }

  function updateCard(
    id: string,
    patch: Partial<VerticalDramaTextOverlayCardView>
  ) {
    setDraft(prev => ({
      ...prev,
      cards: (prev.cards ?? []).map(c =>
        c.id === id ? { ...c, ...patch } : c
      ),
    }));
  }

  function updateCardAnchor(
    id: string,
    patch: Partial<VerticalDramaTextOverlayCardView["anchor"]>
  ) {
    setDraft(prev => ({
      ...prev,
      cards: (prev.cards ?? []).map(c =>
        c.id === id ? { ...c, anchor: { ...c.anchor, ...patch } } : c
      ),
    }));
  }

  function removeCard(id: string) {
    setDraft(prev => ({
      ...prev,
      cards: (prev.cards ?? []).filter(c => c.id !== id),
    }));
  }

  const cards = draft.cards ?? [];
  const tooManyCards = cards.length > 24;

  const previewLines = useMemo(() => {
    const lines: string[] = [];
    if (draft.endCard?.enabled) {
      const text = draft.endCard.text?.trim() || preview?.endCard.text || "";
      if (text) lines.push(`${t.endCardTitle}: ${text}`);
    }
    if (draft.openerRecap?.enabled) {
      const text =
        draft.openerRecap.text?.trim() || preview?.openerRecap.text || "";
      if (text) lines.push(`${t.openerRecapTitle}: ${text}`);
    }
    if (draft.titleBumper?.enabled) {
      const secondary =
        draft.titleBumper.text?.trim() ||
        preview?.titleBumper.secondary ||
        "";
      lines.push(
        `${t.titleBumperTitle}: ${preview?.titleBumper.primary ?? ""} / ${secondary}`
      );
    }
    if (draft.episodeIndicator?.enabled) {
      lines.push(
        `${t.episodeIndicatorTitle}: ${preview?.episodeIndicator.label ?? ""}`
      );
    }
    if (draft.characterIntroCards?.enabled) {
      for (const card of preview?.characterIntroCards ?? []) {
        lines.push(
          `${t.characterIntroTitle}: ${card.name}${card.role ? ` (${card.role})` : ""} — ${vdTextOverlayCopyWithParams(t.characterIntroShotLabel, { shot: card.shotNumber })}`
        );
      }
    }
    for (const card of cards) {
      if (!card.enabled || !card.text.trim()) continue;
      lines.push(
        `${vdTextOverlayCopyWithParams(t.characterIntroShotLabel, { shot: card.anchor.shotNumber })}: ${card.text}`
      );
    }
    return lines;
  }, [draft, preview, cards, t]);

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-3"
      aria-label={t.sectionTitle}
      data-testid="vd-text-overlay-section"
    >
      <div>
        <h3 className="text-sm font-medium">{t.sectionTitle}</h3>
        <p className="text-xs text-muted-foreground">
          {t.sectionDescription}
        </p>
      </div>

      {/* End card */}
      <div
        className="space-y-2 rounded-md border p-2"
        data-testid="vd-text-overlay-end-card"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t.endCardTitle}</span>
          <Switch
            checked={draft.endCard?.enabled ?? false}
            onCheckedChange={next => patchEndCard({ enabled: Boolean(next) })}
            data-testid="vd-text-overlay-end-card-toggle"
          />
        </div>
        {draft.endCard?.enabled ? (
          <div className="space-y-2 pl-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {t.sourceLabel}:{" "}
                {draft.endCard.text?.trim()
                  ? t.sourceManual
                  : textOverlaySourceLabel(preview?.endCard.source, t)}
              </Badge>
              {draft.endCard.text?.trim() ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patchEndCard({ text: undefined, source: "auto" })
                  }
                  data-testid="vd-text-overlay-end-card-revert"
                >
                  {t.revertToAutoButton}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patchEndCard({
                      text: preview?.endCard.text ?? "",
                      source: "manual",
                    })
                  }
                  data-testid="vd-text-overlay-end-card-autofill"
                >
                  {t.autoFillButton}
                </Button>
              )}
            </div>
            <Textarea
              value={draft.endCard.text ?? ""}
              placeholder={preview?.endCard.text || t.endCardTextPlaceholder}
              onChange={e =>
                patchEndCard({
                  text: e.target.value,
                  source: e.target.value.trim() ? "manual" : "auto",
                })
              }
              rows={2}
              data-testid="vd-text-overlay-end-card-text"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-[11px]">
                {t.endCardDurationLabel}
                <Input
                  type="number"
                  min={2}
                  max={5}
                  step={0.1}
                  className="h-7 w-16"
                  value={draft.endCard.durationSec}
                  onChange={e =>
                    patchEndCard({ durationSec: Number(e.target.value) })
                  }
                  data-testid="vd-text-overlay-end-card-duration"
                />
              </label>
              <label className="flex items-center gap-1 text-[11px]">
                <Checkbox
                  checked={draft.endCard.showFollowLine}
                  onCheckedChange={checked =>
                    patchEndCard({ showFollowLine: Boolean(checked) })
                  }
                  data-testid="vd-text-overlay-end-card-follow-line"
                />
                {t.endCardShowFollowLineLabel}
              </label>
              <label className="flex items-center gap-1 text-[11px]">
                {t.endCardStyleVariantLabel}
                <Select
                  value={draft.endCard.styleVariant}
                  onValueChange={v =>
                    patchEndCard({
                      styleVariant: v as "center_card" | "lower_band",
                    })
                  }
                >
                  <SelectTrigger
                    className="h-7 w-32"
                    data-testid="vd-text-overlay-end-card-style"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center_card">
                      {t.endCardStyleCenterCard}
                    </SelectItem>
                    <SelectItem value="lower_band">
                      {t.endCardStyleLowerBand}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>
        ) : null}
      </div>

      {/* Opener recap */}
      <div
        className="space-y-2 rounded-md border p-2"
        data-testid="vd-text-overlay-opener-recap"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t.openerRecapTitle}</span>
          <Switch
            checked={draft.openerRecap?.enabled ?? false}
            onCheckedChange={next =>
              patchOpenerRecap({ enabled: Boolean(next) })
            }
            data-testid="vd-text-overlay-opener-recap-toggle"
          />
        </div>
        {draft.openerRecap?.enabled ? (
          <div className="space-y-2 pl-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {t.sourceLabel}:{" "}
                {draft.openerRecap.text?.trim()
                  ? t.sourceManual
                  : textOverlaySourceLabel(preview?.openerRecap.source, t)}
              </Badge>
              {draft.openerRecap.text?.trim() ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patchOpenerRecap({ text: undefined, source: "auto" })
                  }
                  data-testid="vd-text-overlay-opener-recap-revert"
                >
                  {t.revertToAutoButton}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patchOpenerRecap({
                      text: preview?.openerRecap.text ?? "",
                      source: "manual",
                    })
                  }
                  data-testid="vd-text-overlay-opener-recap-autofill"
                >
                  {t.autoFillButton}
                </Button>
              )}
            </div>
            <Textarea
              value={draft.openerRecap.text ?? ""}
              placeholder={
                preview?.openerRecap.text || t.openerRecapTextPlaceholder
              }
              onChange={e =>
                patchOpenerRecap({
                  text: e.target.value,
                  source: e.target.value.trim() ? "manual" : "auto",
                })
              }
              rows={2}
              data-testid="vd-text-overlay-opener-recap-text"
            />
            <label className="flex items-center gap-1 text-[11px]">
              {t.openerRecapDurationLabel}
              <Input
                type="number"
                min={3}
                max={5}
                step={0.1}
                className="h-7 w-16"
                value={draft.openerRecap.durationSec}
                onChange={e =>
                  patchOpenerRecap({ durationSec: Number(e.target.value) })
                }
                data-testid="vd-text-overlay-opener-recap-duration"
              />
            </label>
          </div>
        ) : null}
      </div>

      {/* Title bumper */}
      <div
        className="space-y-2 rounded-md border p-2"
        data-testid="vd-text-overlay-title-bumper"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t.titleBumperTitle}</span>
          <Switch
            checked={draft.titleBumper?.enabled ?? false}
            onCheckedChange={next =>
              patchTitleBumper({ enabled: Boolean(next) })
            }
            data-testid="vd-text-overlay-title-bumper-toggle"
          />
        </div>
        {draft.titleBumper?.enabled ? (
          <div className="space-y-2 pl-1">
            <Input
              value={draft.titleBumper.text ?? ""}
              placeholder={t.titleBumperTextLabel}
              onChange={e => patchTitleBumper({ text: e.target.value })}
              data-testid="vd-text-overlay-title-bumper-text"
            />
            <p className="text-[11px] text-muted-foreground">
              {vdTextOverlayCopyWithParams(t.titleBumperPreviewTemplate, {
                primary: preview?.titleBumper.primary ?? "",
                secondary:
                  draft.titleBumper.text?.trim() ||
                  preview?.titleBumper.secondary ||
                  "",
              })}
            </p>
          </div>
        ) : null}
      </div>

      {/* Episode indicator */}
      <div
        className="space-y-2 rounded-md border p-2"
        data-testid="vd-text-overlay-episode-indicator"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">
            {t.episodeIndicatorTitle}
          </span>
          <Switch
            checked={draft.episodeIndicator?.enabled ?? false}
            onCheckedChange={next =>
              patchEpisodeIndicator({ enabled: Boolean(next) })
            }
            data-testid="vd-text-overlay-episode-indicator-toggle"
          />
        </div>
        {draft.episodeIndicator?.enabled ? (
          <div className="space-y-2 pl-1">
            <label className="flex items-center gap-1 text-[11px]">
              {t.episodeIndicatorPositionLabel}
              <Select
                value={draft.episodeIndicator.position}
                onValueChange={v =>
                  patchEpisodeIndicator({
                    position: v as "top_right" | "top_left",
                  })
                }
              >
                <SelectTrigger
                  className="h-7 w-32"
                  data-testid="vd-text-overlay-episode-indicator-position"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top_right">
                    {t.episodeIndicatorPositionTopRight}
                  </SelectItem>
                  <SelectItem value="top_left">
                    {t.episodeIndicatorPositionTopLeft}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <p className="text-[11px] text-muted-foreground">
              {vdTextOverlayCopyWithParams(
                t.episodeIndicatorPreviewTemplate,
                { label: preview?.episodeIndicator.label ?? "" }
              )}
            </p>
          </div>
        ) : null}
      </div>

      {/* Character intro cards */}
      <div
        className="space-y-2 rounded-md border p-2"
        data-testid="vd-text-overlay-character-intro"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t.characterIntroTitle}</span>
          <Switch
            checked={draft.characterIntroCards?.enabled ?? false}
            onCheckedChange={next => setCharacterIntroEnabled(Boolean(next))}
            data-testid="vd-text-overlay-character-intro-toggle"
          />
        </div>
        {draft.characterIntroCards?.enabled ? (
          <div className="pl-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              {t.characterIntroPreviewTitle}
            </p>
            {(preview?.characterIntroCards ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {t.characterIntroPreviewEmpty}
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {preview?.characterIntroCards.map(card => (
                  <li key={card.characterKey}>
                    {card.name}
                    {card.role ? ` — ${card.role}` : ""} (
                    {vdTextOverlayCopyWithParams(t.characterIntroShotLabel, {
                      shot: card.shotNumber,
                    })}
                    )
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {/* Mid-episode cards */}
      <div
        className="space-y-2 rounded-md border p-2"
        data-testid="vd-text-overlay-cards"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-medium">{t.cardsTitle}</span>
            <p className="text-[11px] text-muted-foreground">
              {t.cardsDescription}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addCard}
            data-testid="vd-text-overlay-card-add"
          >
            {t.cardsAddButton}
          </Button>
        </div>

        {cards.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {t.cardsEmptyState}
          </p>
        ) : (
          <div className="space-y-2">
            {cards.map(card => (
              <div
                key={card.id}
                className="space-y-2 rounded-md border p-2"
                data-testid={`vd-text-overlay-card-${card.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    checked={card.enabled}
                    onCheckedChange={checked =>
                      updateCard(card.id, { enabled: Boolean(checked) })
                    }
                    data-testid={`vd-text-overlay-card-enabled-${card.id}`}
                  />
                  <Select
                    value={card.kind}
                    onValueChange={v =>
                      updateCard(card.id, {
                        kind: v as "time_setting" | "narrative_hook" | "custom",
                      })
                    }
                  >
                    <SelectTrigger
                      className="h-7 w-36"
                      data-testid={`vd-text-overlay-card-kind-${card.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_setting">
                        {t.cardKindTimeSetting}
                      </SelectItem>
                      <SelectItem value="narrative_hook">
                        {t.cardKindNarrativeHook}
                      </SelectItem>
                      <SelectItem value="custom">
                        {t.cardKindCustom}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-[11px]">
                    {t.cardAnchorShotLabel}
                    {shotNumbers.length > 0 ? (
                      <Select
                        value={String(card.anchor.shotNumber)}
                        onValueChange={v =>
                          updateCardAnchor(card.id, { shotNumber: Number(v) })
                        }
                      >
                        <SelectTrigger
                          className="h-7 w-20"
                          data-testid={`vd-text-overlay-card-shot-${card.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {shotNumbers.map(shot => (
                            <SelectItem key={shot} value={String(shot)}>
                              {shot}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="number"
                        min={1}
                        className="h-7 w-16"
                        value={card.anchor.shotNumber}
                        onChange={e =>
                          updateCardAnchor(card.id, {
                            shotNumber: Number(e.target.value),
                          })
                        }
                        data-testid={`vd-text-overlay-card-shot-${card.id}`}
                      />
                    )}
                  </label>
                  <label className="flex items-center gap-1 text-[11px]">
                    {t.cardAnchorOffsetLabel}
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      step={0.1}
                      className="h-7 w-16"
                      value={card.anchor.offsetSec ?? 0}
                      onChange={e =>
                        updateCardAnchor(card.id, {
                          offsetSec: Number(e.target.value),
                        })
                      }
                      data-testid={`vd-text-overlay-card-offset-${card.id}`}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[11px]">
                    {t.cardDurationLabel}
                    <Input
                      type="number"
                      min={1.5}
                      max={5}
                      step={0.1}
                      className="h-7 w-16"
                      value={card.durationSec}
                      onChange={e =>
                        updateCard(card.id, {
                          durationSec: Number(e.target.value),
                        })
                      }
                      data-testid={`vd-text-overlay-card-duration-${card.id}`}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => removeCard(card.id)}
                    data-testid={`vd-text-overlay-card-remove-${card.id}`}
                  >
                    {t.cardRemoveButton}
                  </Button>
                </div>
                <Input
                  value={card.text}
                  placeholder={t.cardTextPlaceholder}
                  onChange={e =>
                    updateCard(card.id, { text: e.target.value })
                  }
                  data-testid={`vd-text-overlay-card-text-${card.id}`}
                />
              </div>
            ))}
          </div>
        )}
        {tooManyCards ? (
          <p
            className="text-xs text-destructive"
            data-testid="vd-text-overlay-cards-too-many"
          >
            {vdTextOverlayCopyWithParams(t.cardTooManyTotalError, { n: 24 })}
          </p>
        ) : null}
      </div>

      {/* Preview */}
      <div
        className="rounded-md border bg-muted/30 p-2"
        data-testid="vd-text-overlay-preview"
      >
        <h4 className="text-xs font-medium">{t.previewTitle}</h4>
        {previewLines.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {t.previewEmpty}
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            {previewLines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p
          className="text-xs text-destructive"
          data-testid="vd-text-overlay-save-error"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={saving || tooManyCards}
        onClick={() => onSave?.(draft)}
        data-testid="vd-text-overlay-save"
      >
        {saving ? t.saving : t.saveButton}
      </Button>
    </section>
  );
}

/**
 * Task #21 / W12.5 "Final Render Suite" phase B (2026-07-09) — dialogue-
 * audio + subtitle options for the whole-episode compiled video. This
 * section only owns the OPTION VALUES (a single controlled `value`/`onChange`
 * object, mirroring the ad banner section's `onSave` payload-shape
 * convention just without a separate draft/save step, since these are plain
 * flags with no per-item list) and the read-only "last render result"
 * summary — the actual "Assemble full episode video" button lives in
 * `VerticalDramaStoryboardPanel.tsx` (a sibling file, not touched by this
 * wave); the page-level caller merges this section's current `value` into
 * its `assembleEpisodeVideo` mutate payload whenever that button fires (see
 * `VerticalDramaEpisodePage.tsx`'s `handleAssembleCompiledVideo`).
 *
 * `voiceChainEnabled` gates ONLY the dialogue-audio checkbox (+ nested
 * loudness sub-checkbox) — same "feature-detected prop, off -> that part
 * renders nothing" convention as `adBannerOverlayEnabled`. The subtitle
 * preset picker is ALWAYS visible whenever this section renders at all:
 * subtitles are derived from the episode's SCRIPT text, not from any
 * generated audio (see `assembleEpisodeVideo`'s own doc comment,
 * `server/routers/verticalDramaEpisodes.ts`).
 */
function VerticalDramaFinalRenderOptionsSection({
  locale,
  voiceChainEnabled = false,
  value,
  onChange,
  lastResult,
  adBannerDesigns = [],
}: {
  locale: VdLocale;
  voiceChainEnabled?: boolean;
  value?: VerticalDramaFinalRenderOptionsView | null;
  onChange?: (value: VerticalDramaFinalRenderOptionsView) => void;
  lastResult?: VerticalDramaFinalRenderResultView | null;
  adBannerDesigns?: VerticalDramaAdBannerDesignSummaryView[];
}) {
  const t = useMemo(() => vdCopy(locale), [locale]);
  const includeDialogueAudio = value?.includeDialogueAudio ?? false;
  const loudnessNormalize = value?.loudnessNormalize ?? false;
  const subtitlePreset = value?.subtitlePreset ?? "classic_box";

  function emit(patch: Partial<VerticalDramaFinalRenderOptionsView>) {
    onChange?.({
      includeDialogueAudio,
      loudnessNormalize,
      subtitlePreset,
      ...patch,
    });
  }

  const excludedAdBanners = lastResult?.excludedAdBanners ?? [];

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-3"
      aria-label={t.finalRenderOptionsTitle}
      data-testid="vd-final-render-options-section"
    >
      <h3 className="text-sm font-medium">{t.finalRenderOptionsTitle}</h3>

      {voiceChainEnabled ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="vd-final-render-include-audio"
              checked={includeDialogueAudio}
              onCheckedChange={checked =>
                emit({ includeDialogueAudio: Boolean(checked) })
              }
              data-testid="vd-final-render-include-audio"
            />
            <label htmlFor="vd-final-render-include-audio" className="text-sm">
              {t.finalRenderIncludeDialogueAudioLabel}
            </label>
          </div>
          <div className="flex items-center gap-2 pl-6">
            <Checkbox
              id="vd-final-render-loudness-normalize"
              checked={loudnessNormalize}
              disabled={!includeDialogueAudio}
              onCheckedChange={checked =>
                emit({ loudnessNormalize: Boolean(checked) })
              }
              data-testid="vd-final-render-loudness-normalize"
            />
            <label
              htmlFor="vd-final-render-loudness-normalize"
              className="text-sm text-muted-foreground"
            >
              {t.finalRenderLoudnessNormalizeLabel}
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="vd-final-render-subtitle-preset"
          className="text-xs font-medium text-muted-foreground"
        >
          {t.finalRenderSubtitlePresetLabel}
        </label>
        <Select
          value={subtitlePreset}
          onValueChange={v =>
            emit({ subtitlePreset: v as VdFinalRenderSubtitlePresetValue })
          }
        >
          <SelectTrigger
            id="vd-final-render-subtitle-preset"
            data-testid="vd-final-render-subtitle-preset"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t.finalRenderSubtitlePresetNone}</SelectItem>
            {VD_FINAL_RENDER_SUBTITLE_PRESET_IDS.map(id => (
              <SelectItem key={id} value={id}>
                {vdFinalRenderSubtitlePresetLabel(id, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {lastResult ? (
        <div
          className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs"
          data-testid="vd-final-render-result"
        >
          <p className="font-medium">{t.finalRenderResultTitle}</p>
          <p data-testid="vd-final-render-result-subtitle-lines">
            {vdCopyWithParams(t.finalRenderResultSubtitleLinesTemplate, {
              n: lastResult.subtitleLinesIncluded,
            })}
          </p>
          <p data-testid="vd-final-render-result-audio-segments">
            {vdCopyWithParams(t.finalRenderResultAudioSegmentsTemplate, {
              n: lastResult.dialogueAudioSegmentsIncluded,
            })}
          </p>
          {excludedAdBanners.length > 0 ? (
            <div data-testid="vd-final-render-excluded-banners">
              <p className="font-medium text-destructive">
                {t.finalRenderResultExcludedBannersTitle}
              </p>
              <ul className="list-disc pl-4">
                {excludedAdBanners.map(exclusion => {
                  const label =
                    adBannerDesigns.find(d => d.id === exclusion.bannerId)
                      ?.label ?? exclusion.bannerId;
                  const reason = vdAdBannerExclusionReasonLabel(
                    exclusion.code,
                    locale
                  );
                  return (
                    <li key={exclusion.bannerId}>
                      {label} — {reason}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default VerticalDramaEpisodeWorkspace;
