/**
 * VerticalDramaMemoryTimeline — browsable append-only memory event timeline plus
 * the current compacted summary, and a first-class Retcon Proposal review card
 * (spec §04 Memory Event Timeline And Retcon Proposal Review §7.6).
 *
 * The timeline is read-only history (never edited/deleted in place). Retcon
 * proposals show proposed change + rationale with approve/reject affordances
 * wired to `approveRetconProposal` / `rejectRetconProposal`.
 */

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { vdCopy, type VdLocale } from "./verticalDramaWorkspaceCopy";
import {
  VERTICAL_DRAMA_MEMORY_KINDS,
  type VerticalDramaMemoryEvent,
  type VerticalDramaMemoryKind,
} from "@shared/verticalDramaSeries";

export type VerticalDramaRetconOutcome = "proposed" | "approved" | "rejected";
export type VerticalDramaRetconDecisionState = "idle" | "deciding" | "approved" | "rejected";

export interface VerticalDramaMemoryTimelineProps {
  locale?: VdLocale;
  events: VerticalDramaMemoryEvent[];
  compactedSummary?: string;
  loading?: boolean;
  kindFilter?: VerticalDramaMemoryKind | "all";
  episodeFilter?: number | null;
  onKindFilterChange?: (kind: VerticalDramaMemoryKind | "all") => void;
  onEpisodeFilterChange?: (episodeNumber: number | null) => void;
  /** Per-proposal decision state (keyed by memoryEventId). */
  retconDecisionState?: Record<string, VerticalDramaRetconDecisionState>;
  onApproveRetcon?: (proposalEventId: string) => void;
  onRejectRetcon?: (proposalEventId: string) => void;
  className?: string;
}

/** Derive a proposal's outcome from the append-only chain (never stored). */
function retconOutcome(
  proposal: VerticalDramaMemoryEvent,
  all: VerticalDramaMemoryEvent[],
): VerticalDramaRetconOutcome {
  for (const ev of all) {
    if (ev.payload?.retconApprovalOf === proposal.memoryEventId) return "approved";
    if (ev.payload?.retconRejectionOf === proposal.memoryEventId) return "rejected";
  }
  return "proposed";
}

function isRejectionMarker(ev: VerticalDramaMemoryEvent): boolean {
  return ev.memoryKind === "retcon_proposal" && ev.payload?.retconRejectionOf != null;
}

function VerticalDramaRetconProposalCard({
  locale,
  proposal,
  outcome,
  decisionState,
  onApprove,
  onReject,
}: {
  locale: VdLocale;
  proposal: VerticalDramaMemoryEvent;
  outcome: VerticalDramaRetconOutcome;
  decisionState: VerticalDramaRetconDecisionState;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const t = vdCopy(locale);
  const busy = decisionState === "deciding";
  const contradicted = String(proposal.payload?.contradictedFact ?? "");
  const proposed = String(proposal.payload?.proposedFact ?? proposal.summaryText ?? "");
  const rationale = String(proposal.payload?.rationale ?? "");

  return (
    <div
      className="rounded-lg border border-primary/40 bg-primary/5 p-3"
      data-testid={`vd-retcon-${proposal.memoryEventId}`}
      data-outcome={outcome}
    >
      <div className="mb-2 flex items-center justify-between">
        <Badge variant="outline">{t.retconProposal}</Badge>
        <Badge
          variant={
            outcome === "approved" ? "secondary" : outcome === "rejected" ? "destructive" : "default"
          }
        >
          {outcome}
        </Badge>
      </div>
      <dl className="space-y-1 text-sm">
        <div>
          <dt className="inline font-medium">{t.proposedChange}: </dt>
          <dd className="inline">
            {contradicted ? <s className="text-muted-foreground">{contradicted}</s> : null}{" "}
            <span className="font-medium">{proposed}</span>
          </dd>
        </div>
        {rationale ? (
          <div>
            <dt className="inline font-medium">{t.rationale}: </dt>
            <dd className="inline text-muted-foreground">{rationale}</dd>
          </div>
        ) : null}
      </dl>
      {outcome === "proposed" ? (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onApprove?.(proposal.memoryEventId)}
            disabled={busy}
            aria-busy={busy}
            data-testid={`vd-retcon-approve-${proposal.memoryEventId}`}
          >
            {t.approve}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onReject?.(proposal.memoryEventId)}
            disabled={busy}
            data-testid={`vd-retcon-reject-${proposal.memoryEventId}`}
          >
            {t.reject}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function VerticalDramaMemoryTimeline({
  locale = "en",
  events,
  compactedSummary,
  loading = false,
  kindFilter = "all",
  episodeFilter = null,
  onKindFilterChange,
  onEpisodeFilterChange,
  retconDecisionState = {},
  onApproveRetcon,
  onRejectRetcon,
  className,
}: VerticalDramaMemoryTimelineProps) {
  const t = useMemo(() => vdCopy(locale), [locale]);

  // Pending proposals (not yet approved/rejected) surface in the review area.
  const pendingProposals = useMemo(
    () =>
      events.filter(
        (ev) =>
          ev.memoryKind === "retcon_proposal" &&
          !isRejectionMarker(ev) &&
          retconOutcome(ev, events) === "proposed",
      ),
    [events],
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Current compacted summary — labeled as the derived current view. */}
      <section className="rounded-lg border bg-card p-3" aria-label={t.currentSummary}>
        <h3 className="mb-1 text-sm font-medium">{t.currentSummary}</h3>
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {compactedSummary?.trim() || "—"}
          </p>
        )}
      </section>

      {/* Retcon Proposal review surface. */}
      <section aria-label={t.retconProposal} className="space-y-2">
        {loading ? (
          <Skeleton className="h-24 w-full" data-testid="vd-retcon-loading" />
        ) : pendingProposals.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="vd-retcon-none">
            {t.noRetcon}
          </p>
        ) : (
          pendingProposals.map((p) => (
            <VerticalDramaRetconProposalCard
              key={p.memoryEventId}
              locale={locale}
              proposal={p}
              outcome={retconOutcome(p, events)}
              decisionState={retconDecisionState[p.memoryEventId] ?? "idle"}
              onApprove={onApproveRetcon}
              onReject={onRejectRetcon}
            />
          ))
        )}
      </section>

      {/* Filters + append-only event timeline. */}
      <section aria-label={t.memoryTimeline} className="rounded-lg border">
        <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <span className="text-sm font-medium">{t.memoryTimeline}</span>
          <label className="ml-auto text-xs text-muted-foreground">
            {t.filterKind}
            <select
              className="ml-1 rounded border bg-background px-1 py-0.5 text-xs"
              value={kindFilter}
              onChange={(e) =>
                onKindFilterChange?.(e.target.value as VerticalDramaMemoryKind | "all")
              }
              data-testid="vd-memory-kind-filter"
            >
              <option value="all">{t.all}</option>
              {VERTICAL_DRAMA_MEMORY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t.filterEpisode}
            <input
              type="number"
              min={1}
              className="ml-1 w-16 rounded border bg-background px-1 py-0.5 text-xs"
              value={episodeFilter ?? ""}
              onChange={(e) =>
                onEpisodeFilterChange?.(e.target.value ? Number(e.target.value) : null)
              }
              data-testid="vd-memory-episode-filter"
            />
          </label>
        </header>

        {loading ? (
          <div className="space-y-2 p-3" data-testid="vd-memory-loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground" data-testid="vd-memory-empty">
            {t.noMemory}
          </p>
        ) : (
          <ScrollArea className="max-h-96">
            <ol className="divide-y">
              {events.map((ev) => (
                <li
                  key={ev.memoryEventId}
                  className="flex flex-col gap-0.5 px-3 py-2"
                  data-testid={`vd-memory-event-${ev.memoryEventId}`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {ev.memoryKind}
                    </Badge>
                    {ev.episodeId ? (
                      <span className="text-[10px] text-muted-foreground">
                        ep {String(ev.payload?.episodeNumber ?? ev.episodeId)}
                      </span>
                    ) : null}
                    <time className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(ev.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-sm">
                    {ev.summaryText ?? JSON.stringify(ev.payload)}
                  </p>
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </section>
    </div>
  );
}

export default VerticalDramaMemoryTimeline;
