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

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  VD_PHASES,
  vdCopy,
  vdPhaseLabel,
  vdStageLabel,
  type VdLocale,
  type VdPhase,
} from "./verticalDramaWorkspaceCopy";
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
import { VerticalDramaDialogueAudioPanel } from "./VerticalDramaDialogueAudioPanel";
import {
  VerticalDramaStoryboardPanel,
  type VerticalDramaAssetUrlMap,
  type VerticalDramaCapableModel,
  type VerticalDramaCharacterPortraitMap,
  type VerticalDramaClipDialogueLineView,
  type VerticalDramaMotionPromptPackView,
  type VerticalDramaQualityReviewView,
  type VerticalDramaShotReferenceView,
  type VerticalDramaStartFramePlanView,
  type VerticalDramaStoryboardView,
} from "./VerticalDramaStoryboardPanel";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import type {
  RunResult,
  VerticalDramaPipelineStage,
} from "@shared/verticalDramaSeries";

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
}

/** Data needed to render the storyboard_shotgrid stage's dedicated panel. */
export interface VerticalDramaStoryboardPanelData {
  storyboard?: VerticalDramaStoryboardView | null;
  startFramePlan?: VerticalDramaStartFramePlanView | null;
  motionPromptPack?: VerticalDramaMotionPromptPackView | null;
  assetUrls?: VerticalDramaAssetUrlMap;
  loading?: boolean;
  error?: string | null;
  generating?: boolean;
  /** Fired only after the user confirms the credit-spend warning. */
  onGenerateReal?: () => void;
  /** Opens the repair dialog for `video_motion_prompt_pack`, prefilled with the current prompt. */
  onEditVideoPrompt?: (shotNumber: number, currentPrompt: string) => void;
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
  onChangeCharacterReference?: (characterId: string) => void;
  onDropCharacterReference?: (characterId: string, url: string) => void;
  onDropStartFrame?: (shotNumber: number, url: string) => void;
  onGenerateAngleVariations?: (shotNumber: number) => void;
  generatingAngleVariationsForShot?: number | null;
  angleVariationGridUrlByShot?: Record<number, string>;
  onPickAngleVariationCandidate?: (shotNumber: number, candidateDataUrl: string) => void;
  onDismissAngleVariations?: (shotNumber: number) => void;
  onDeleteAngleVariationCandidate?: (shotNumber: number, originalIndex: number) => void;

  /* ---- Phase 1.3 — episode-level model selection ---- */
  imageModels?: VerticalDramaCapableModel[];
  videoModels?: VerticalDramaCapableModel[];
  selectedImageModelId?: string;
  selectedVideoModelId?: string;
  onSelectImageModel?: (modelId: string) => void;
  onSelectVideoModel?: (modelId: string) => void;
  modelsLoading?: boolean;

  /* ---- Phase 2.5 — per-shot reference strip ---- */
  shotReferencesByShot?: Record<number, VerticalDramaShotReferenceView[]>;
  onAddShotReference?: (
    shotNumber: number,
    payload: { url: string; source: VerticalDramaShotReferenceView["source"] }
  ) => void;
  onRemoveShotReference?: (shotNumber: number, referenceId: string) => void;
  addingShotReferenceForShot?: ReadonlySet<number>;

  /* ---- Phase 3.4 — dialogue box ---- */
  onSaveClipDialogue?: (
    clipNumber: number,
    dialogue: VerticalDramaClipDialogueLineView[]
  ) => void;
  savingDialogueForClip?: number | null;

  /* ---- Video clip generation (`generateVideoClip`) ---- */
  onGenerateVideoClip?: (clipNumber: number) => void;
  generatingVideoClipForClip?: ReadonlySet<number>;
  ttsFallbackByClip?: Record<number, boolean>;
  trimmedReferenceCountByClip?: Record<number, number>;

  /* ---- Phase 4.1/4.2 — one-click generate + inline prompt editing ---- */
  onSaveStartFramePrompt?: (shotNumber: number, prompt: string) => void;
  onSaveVideoPrompt?: (shotNumber: number, prompt: string) => void;
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
  generateEpisodeFailure?: { stage: VerticalDramaPipelineStage; message: string } | null;
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
  const [confirmingGenerateEpisode, setConfirmingGenerateEpisode] = useState(false);

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

  const hasStoryboardShots = (storyboardPanel?.storyboard?.shots?.length ?? 0) > 0;

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

      {/* Primary content: the shot list once a storyboard exists (matches
          the Storyboard Review page's shot-list UX so this page and that one
          feel like the same product) — otherwise a single compact
          action row for whatever stage is next (script/characters/storyboard
          generation), no stage-card grid clutter. */}
      {hasStoryboardShots ? (
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
          onGenerateStartFramePlan={storyboardPanel?.onGenerateStartFramePlan}
          generatingStartFramePlan={storyboardPanel?.generatingStartFramePlan}
          onEditStartFramePrompt={storyboardPanel?.onEditStartFramePrompt}
          onGenerateVideoPromptPack={storyboardPanel?.onGenerateVideoPromptPack}
          generatingVideoPromptPack={storyboardPanel?.generatingVideoPromptPack}
          onGenerateStartFrameImage={storyboardPanel?.onGenerateStartFrameImage}
          generatingStartFrameImageForShot={storyboardPanel?.generatingStartFrameImageForShot}
          onGenerateAllStartFrameImages={storyboardPanel?.onGenerateAllStartFrameImages}
          characterPortraits={storyboardPanel?.characterPortraits}
          onChangeCharacterReference={storyboardPanel?.onChangeCharacterReference}
          onDropCharacterReference={storyboardPanel?.onDropCharacterReference}
          onDropStartFrame={storyboardPanel?.onDropStartFrame}
          onGenerateAngleVariations={storyboardPanel?.onGenerateAngleVariations}
          generatingAngleVariationsForShot={storyboardPanel?.generatingAngleVariationsForShot}
          angleVariationGridUrlByShot={storyboardPanel?.angleVariationGridUrlByShot}
          onPickAngleVariationCandidate={storyboardPanel?.onPickAngleVariationCandidate}
          onDismissAngleVariations={storyboardPanel?.onDismissAngleVariations}
          onDeleteAngleVariationCandidate={storyboardPanel?.onDeleteAngleVariationCandidate}
          imageModels={storyboardPanel?.imageModels}
          videoModels={storyboardPanel?.videoModels}
          selectedImageModelId={storyboardPanel?.selectedImageModelId}
          selectedVideoModelId={storyboardPanel?.selectedVideoModelId}
          onSelectImageModel={storyboardPanel?.onSelectImageModel}
          onSelectVideoModel={storyboardPanel?.onSelectVideoModel}
          modelsLoading={storyboardPanel?.modelsLoading}
          shotReferencesByShot={storyboardPanel?.shotReferencesByShot}
          onAddShotReference={storyboardPanel?.onAddShotReference}
          onRemoveShotReference={storyboardPanel?.onRemoveShotReference}
          addingShotReferenceForShot={storyboardPanel?.addingShotReferenceForShot}
          onSaveClipDialogue={storyboardPanel?.onSaveClipDialogue}
          savingDialogueForClip={storyboardPanel?.savingDialogueForClip}
          onGenerateVideoClip={storyboardPanel?.onGenerateVideoClip}
          generatingVideoClipForClip={storyboardPanel?.generatingVideoClipForClip}
          ttsFallbackByClip={storyboardPanel?.ttsFallbackByClip}
          trimmedReferenceCountByClip={storyboardPanel?.trimmedReferenceCountByClip}
          onSaveStartFramePrompt={storyboardPanel?.onSaveStartFramePrompt}
          onSaveVideoPrompt={storyboardPanel?.onSaveVideoPrompt}
          onGeneratePromptAndImage={storyboardPanel?.onGeneratePromptAndImage}
          generatingPromptAndImageForShot={storyboardPanel?.generatingPromptAndImageForShot}
          qualityReview={storyboardPanel?.qualityReview}
          onRunQualityReview={storyboardPanel?.onRunQualityReview}
          runningQualityReview={storyboardPanel?.runningQualityReview}
          onCopySuggestedFix={storyboardPanel?.onCopySuggestedFix}
        />
      ) : !completed && current && SETUP_STAGES.has(current.stage) ? (
        <section className="rounded-lg border bg-card p-4" aria-label={t.generateEpisode}>
          {episode?.title ? (
            <h2 className="mb-1 text-sm font-medium">{episode.title}</h2>
          ) : null}
          <p className="mb-3 text-sm text-muted-foreground">{t.generateEpisodeExplain}</p>
          {generateEpisodeFailure ? (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">
                {t.generateEpisodeFailedAt} {vdStageLabel(generateEpisodeFailure.stage, locale)}
              </p>
              <p className="text-muted-foreground">{generateEpisodeFailure.message}</p>
            </div>
          ) : null}
          {generatingEpisodeStage ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {t.generateEpisodeProgress} {vdStageLabel(generatingEpisodeStage, locale)}…
            </div>
          ) : confirmingGenerateEpisode ? (
            <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="font-medium">{t.generateRealScriptConfirmWarning}</p>
              <p className="text-muted-foreground">{t.generateEpisodeConfirmNote}</p>
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
              {generateEpisodeFailure ? t.generateEpisodeRetry : t.generateEpisode}
            </Button>
          )}
        </section>
      ) : !completed && current ? (
        <section className="rounded-lg border bg-card p-3" aria-label={t.nextAction}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs uppercase text-muted-foreground">{t.nextAction}</span>
            <Badge variant="outline">{vdStageLabel(current.stage, locale)}</Badge>
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
                    <p className="font-medium">{t.generateRealScriptConfirmWarning}</p>
                    <p className="text-muted-foreground">{t.generateRealScriptConfirmNote}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingRealGenerationStage(null)}
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
                        {action.generating ? t.generatingRealScript : generateLabel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmingRealGenerationStage(current.stage)}
                    disabled={action.generating}
                    data-testid={`vd-generate-real-${action.testId}`}
                  >
                    {action.generating ? t.generatingRealScript : generateLabel}
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
                <span className="text-xs text-muted-foreground">{t.dryRunNote}</span>
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
              <section aria-label={t.phaseProgress} className="rounded-lg border p-3">
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
                          status === "active" && "border-primary/50 bg-primary/5",
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
                                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
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
                          onClick={() => setConfirmingRegenerateStage(focusedStage)}
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
                      plan={dialogueAudioPanel?.plan}
                      loading={dialogueAudioPanel?.loading}
                      error={dialogueAudioPanel?.error}
                      onGenerate={dialogueAudioPanel?.onGenerate}
                    />
                  ) : focusedStage === "storyboard_shotgrid" && !hasStoryboardShots ? (
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
                      imageModels={storyboardPanel?.imageModels}
                      videoModels={storyboardPanel?.videoModels}
                      selectedImageModelId={storyboardPanel?.selectedImageModelId}
                      selectedVideoModelId={storyboardPanel?.selectedVideoModelId}
                      onSelectImageModel={storyboardPanel?.onSelectImageModel}
                      onSelectVideoModel={storyboardPanel?.onSelectVideoModel}
                      modelsLoading={storyboardPanel?.modelsLoading}
                      qualityReview={storyboardPanel?.qualityReview}
                      onRunQualityReview={storyboardPanel?.onRunQualityReview}
                      runningQualityReview={storyboardPanel?.runningQualityReview}
                      onCopySuggestedFix={storyboardPanel?.onCopySuggestedFix}
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
    </div>
  );
}

export default VerticalDramaEpisodeWorkspace;
