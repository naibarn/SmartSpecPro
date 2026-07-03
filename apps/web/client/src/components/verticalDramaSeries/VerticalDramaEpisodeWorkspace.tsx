/**
 * VerticalDramaEpisodeWorkspace — the episode workspace (spec §04 UI/UX Contract).
 *
 * Groups the 15 canonical `VerticalDramaPipelineStage` stages into ~4 labeled
 * phases with a phase-progress indicator, and surfaces exactly ONE primary
 * call-to-action derived from the current stage's `next_action`. Secondary
 * per-stage detail (and repair) is available on drill-down but never competes
 * with the single primary CTA.
 *
 * Handles the loading / empty (no episode → create CTA) / error / success and
 * completed (read-only historical) states. Running/timeline animation is
 * replaced by a static indicator under `prefers-reduced-motion`.
 *
 * Presentational + prop-driven so it is decoupled from router wiring: pass
 * stage state, runs, and memory in; wire the callbacks to the
 * `verticalDramaEpisodes` tRPC router at the call site.
 */

import { useMemo } from "react";
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
import type { RunResult, VerticalDramaPipelineStage } from "@shared/verticalDramaSeries";

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
  className,
}: VerticalDramaEpisodeWorkspaceProps) {
  const t = useMemo(() => vdCopy(locale), [locale]);
  const current = useMemo(() => findCurrentStage(stageStates), [stageStates]);

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

        {/* Per-stage drill-down (secondary; historical view when completed). */}
        <section className="rounded-lg border" aria-label="stages">
          {completed ? (
            <header className="border-b px-3 py-2 text-sm font-medium">
              {t.readOnlyCompleted}
            </header>
          ) : null}
          <ol className="divide-y">
            {VD_PHASES.flatMap((phase) => phase.stages).map((stage) => {
              const s = stageStatusFor(stageStates, stage);
              return (
                <li key={stage} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    className="text-left text-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onOpenStageDetail?.(stage)}
                    data-testid={`vd-stage-${stage}`}
                  >
                    {vdStageLabel(stage, locale)}
                  </button>
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
                    >
                      {s.status}
                    </Badge>
                    {!completed && s.status === "failed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onRepair?.(stage)}
                      >
                        {t.repair}
                      </Button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
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
