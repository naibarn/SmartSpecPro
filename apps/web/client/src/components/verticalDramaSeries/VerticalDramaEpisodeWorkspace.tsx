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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { VerticalDramaRunsList, type VerticalDramaRunRow } from "./VerticalDramaRunsList";
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
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import type { RunResult, VerticalDramaPipelineStage } from "@shared/verticalDramaSeries";

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
  stageStates?: Partial<Record<VerticalDramaPipelineStage, VerticalDramaStageState>>;
  /** Whether the episode is complete (renders the read-only historical view). */
  completed?: boolean;
  approvalBarState?: VerticalDramaApprovalBarState;
  rejectionReason?: string;
  runs?: VerticalDramaRunRow[];
  runsLoading?: boolean;
  memory?: Omit<VerticalDramaMemoryTimelineProps, "locale">;
  // Callbacks (wire to the verticalDramaEpisodes tRPC router at the call site).
  onCreateEpisode?: () => void;
  onPrimaryCta?: (action: { stage: VerticalDramaPipelineStage; nextAction: RunResult["next_action"] }) => void;
  onApprove?: (checkpointId?: string) => void;
  onReject?: (checkpointId?: string) => void;
  onRepair?: (stage: VerticalDramaPipelineStage) => void;
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
  className?: string;
}

function stageStatusFor(
  states: VerticalDramaEpisodeWorkspaceProps["stageStates"],
  stage: VerticalDramaPipelineStage,
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
  states: VerticalDramaEpisodeWorkspaceProps["stageStates"],
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
  states: VerticalDramaEpisodeWorkspaceProps["stageStates"],
): PhaseStatus {
  const stageStates = phase.stages.map((s) => stageStatusFor(states, s));
  if (stageStates.every((s) => s.status === "succeeded")) return "complete";
  if (stageStates.some((s) => s.status === "failed")) return "blocked";
  if (stageStates.some((s) => s.status === "approval_required")) return "waiting";
  if (stageStates.some((s) => s.status === "running" || s.status === "succeeded")) return "active";
  return "pending";
}

/** Map a stage's next_action to the single primary CTA label. */
function ctaLabel(t: ReturnType<typeof vdCopy>, action: RunResult["next_action"]): string {
  switch (action) {
    case "approve":
      return t.approve;
    case "repair":
      return t.repair;
    case "open_storyboard_review":
      return t.openLedger;
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
  onOpenRun,
  onOpenStageDetail,
  focusedStage: focusedStageProp,
  onFocusStage,
  stageRunDetail,
  dialogueAudioPanel,
  className,
}: VerticalDramaEpisodeWorkspaceProps) {
  const t = useMemo(() => vdCopy(locale), [locale]);
  const current = useMemo(() => findCurrentStage(stageStates), [stageStates]);

  // Which stage's detail is shown in the grid's detail panel. Defaults to the
  // current actionable stage, but any card can move focus at any time.
  const [internalFocusedStage, setInternalFocusedStage] = useState<VerticalDramaPipelineStage | null>(
    current?.stage ?? null,
  );
  const focusedStage = focusedStageProp ?? internalFocusedStage;

  useEffect(() => {
    if (focusedStageProp === undefined && internalFocusedStage === null && current) {
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
      <div className={cn("space-y-4", className)} data-testid="vd-workspace-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Empty state — no episode yet.
  if (!episode) {
    return (
      <div
        className={cn("flex flex-col items-center gap-3 rounded-lg border border-dashed p-8", className)}
        data-testid="vd-workspace-empty"
      >
        <p className="text-sm text-muted-foreground">{t.noEpisode}</p>
        <Button type="button" onClick={onCreateEpisode} data-testid="vd-create-episode">
          {t.createEpisode}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn("grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]", className)}
      data-testid="vd-workspace"
    >
      <div className="space-y-4">
        {/* Phase progress indicator (reduced-motion safe: static bars, no pulse). */}
        <section aria-label={t.phaseProgress} className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">
              {episode.title || `Episode ${episode.episodeNumber}`}
            </h2>
            {completed ? <Badge variant="secondary">{t.readOnlyCompleted}</Badge> : null}
          </div>
          <ol className="flex flex-wrap gap-2">
            {VD_PHASES.map((phase) => {
              const status = phaseStatus(phase, stageStates);
              return (
                <li
                  key={phase.id}
                  className={cn(
                    "flex min-w-[120px] flex-1 flex-col gap-1 rounded-md border p-2 motion-reduce:animate-none",
                    status === "complete" && "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20",
                    status === "active" && "border-primary/50 bg-primary/5",
                    status === "waiting" && "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20",
                    status === "blocked" && "border-destructive/50 bg-destructive/5",
                  )}
                  data-phase={phase.id}
                  data-status={status}
                >
                  <span className="text-xs font-medium">{vdPhaseLabel(phase, locale)}</span>
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

        {/* Single primary CTA driven by the current stage's next_action. */}
        {!completed && current ? (
          <section className="rounded-lg border bg-card p-3" aria-label={t.nextAction}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs uppercase text-muted-foreground">{t.nextAction}</span>
              <Badge variant="outline">{vdStageLabel(current.stage, locale)}</Badge>
              {current.status === "failed" ? <Badge variant="destructive">{t.failed}</Badge> : null}
            </div>

            {current.nextAction === "approve" ? (
              <VerticalDramaApprovalBar
                locale={locale}
                state={approvalBarState}
                rejectionReason={rejectionReason}
                onApprove={() => onApprove?.(current.checkpointId)}
                onReject={() => onReject?.(current.checkpointId)}
                onRepair={() => onRepair?.(current.stage)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    onPrimaryCta?.({ stage: current.stage, nextAction: current.nextAction })
                  }
                  data-testid="vd-primary-cta"
                >
                  {ctaLabel(t, current.nextAction)}
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
                <span className="text-xs text-muted-foreground">{t.dryRunNote}</span>
              </div>
            )}

            {/* Error reason — text-visible for the failed/repair state. */}
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
        ) : null}

        {/* Stage-card grid — every stage is always clickable, grouped by phase. */}
        <section className="space-y-3" aria-label="stages">
          {completed ? (
            <div className="rounded-lg border px-3 py-2 text-sm font-medium">
              {t.readOnlyCompleted}
            </div>
          ) : null}
          {VD_PHASES.map((phase) => (
            <div key={phase.id} className="rounded-lg border p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {vdPhaseLabel(phase, locale)}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {phase.stages.map((stage) => {
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
                        isFocused ? "border-primary bg-primary/5" : "bg-card hover:bg-accent/50",
                      )}
                      data-testid={`vd-stage-${stage}`}
                    >
                      <span className="font-medium">{vdStageLabel(stage, locale)}</span>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onRepair?.(stage);
                            }}
                            onKeyDown={(e) => {
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

        {/* Focused-stage detail — always available, independent of the primary CTA above. */}
        {focusedStage ? (
          <section className="rounded-lg border p-3" aria-label={vdStageLabel(focusedStage, locale)}>
            <h3 className="mb-2 text-sm font-medium">{vdStageLabel(focusedStage, locale)}</h3>
            {focusedStage === "dialogue_audio_plan" ? (
              <VerticalDramaDialogueAudioPanel
                plan={dialogueAudioPanel?.plan}
                loading={dialogueAudioPanel?.loading}
                error={dialogueAudioPanel?.error}
                onGenerate={dialogueAudioPanel?.onGenerate}
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

      {/* Side panel: runs sub-list + memory timeline (each scrolls internally). */}
      <aside className="space-y-4">
        <VerticalDramaRunsList
          locale={locale}
          runs={runs}
          loading={runsLoading}
          onOpenRun={onOpenRun}
        />
        {memory ? <VerticalDramaMemoryTimeline locale={locale} {...memory} /> : null}
      </aside>
    </div>
  );
}

export default VerticalDramaEpisodeWorkspace;
