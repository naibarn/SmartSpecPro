/**
 * VerticalDramaArcReplanCard (spec feature 131, §7.7.3 ·
 * section-13-story-dialogue-density-reform — "Component Map").
 *
 * Series detail Memory tab surface — mirrors
 * `VerticalDramaSeriesMemoryTab.tsx`'s existing "Retcon proposals" card
 * exactly (same query, same pending/resolved detection over the append-only
 * event log, same approve/reject/toast/loading conventions), but for
 * FORWARD-facing `arc_replan_proposal` memory events instead of backward
 * -facing `retcon_proposal` ones:
 *
 *  - `approveArcReplanProposal` appends a NEW `arc_replan_applied` event
 *    (a DIFFERENT memoryKind than the proposal itself — unlike retcon
 *    approval, which reuses `canonical_fact`/`retcon_proposal` conventions
 *    inline). "Resolved: approved" is detected via a later event whose
 *    payload carries `arcReplanApprovalOf === <this proposal's id>`.
 *  - `rejectArcReplanProposal` reuses the SAME `arc_replan_proposal`
 *    memoryKind for its rejection marker event (payload carries
 *    `arcReplanRejectionOf` instead of the proposal's own fields) — mirrors
 *    `rejectRetconProposal`'s own convention exactly. "Resolved: rejected"
 *    is detected the same way, via `arcReplanRejectionOf`.
 *
 * Self-contained: queries `listMemoryEvents` and `verticalDramaSeries.get`
 * itself (same query keys the Memory tab / series detail page already use,
 * so TanStack Query dedupes the network call — no prop drilling needed) and
 * owns its own approve/reject mutations.
 */

import { AlertTriangle, CheckCircle2, GitBranch, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  verticalDramaArcReplanProposalSchema,
  verticalDramaBreakdownVersionSchema,
  verticalDramaEpisodeBreakdownItemSchema,
} from "@shared/verticalDramaSeries/contentBudget";
import type { VerticalDramaMemoryKind } from "@shared/verticalDramaSeries";
import {
  arcDriftReasonLabel,
  pickCopy,
  tieInReplanMoveKickerText,
  verticalDramaCopy,
  type VerticalDramaLang,
} from "./verticalDramaCopy";

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for direct unit testing)                            */
/* -------------------------------------------------------------------------- */

const breakdownVersionsArraySchema = z.array(verticalDramaBreakdownVersionSchema);
const breakdownItemArraySchema = z.array(verticalDramaEpisodeBreakdownItemSchema);

export type VerticalDramaDisplayBreakdownItem = z.infer<typeof verticalDramaEpisodeBreakdownItemSchema>;

/**
 * Client-side mirror of the server's `getActiveBreakdown` read-path
 * (`server/services/verticalDramaStoryBible.ts` — a server-only file, not
 * importable from the client) — resolves the CURRENTLY ACTIVE episode
 * breakdown from a series' `bible` jsonb, for the "old plan" side of the
 * arc-replan diff. Uses the SAME canonical shared zod schemas the server
 * reads with (`@shared/verticalDramaSeries/contentBudget`), so tolerance for
 * legacy/malformed data stays identical. Never throws; returns `[]` for a
 * missing/malformed bible.
 */
export function getActiveBreakdownItemsForDisplay(
  bible: unknown,
): VerticalDramaDisplayBreakdownItem[] {
  const bibleRecord = (bible && typeof bible === "object" ? bible : {}) as Record<string, unknown>;

  const versionsParsed = breakdownVersionsArraySchema.safeParse(bibleRecord.breakdownVersions);
  const versions = versionsParsed.success ? versionsParsed.data : [];

  if (versions.length > 0) {
    const activeId =
      typeof bibleRecord.activeBreakdownVersionId === "string"
        ? bibleRecord.activeBreakdownVersionId
        : undefined;
    const active =
      (activeId && versions.find((v) => v.versionId === activeId)) || versions[versions.length - 1];
    return active.items;
  }

  const legacyParsed = breakdownItemArraySchema.safeParse(bibleRecord.episodeBreakdown);
  return legacyParsed.success ? legacyParsed.data : [];
}

/**
 * The zod-inferred parse result of a stored `arc_replan_proposal` event
 * payload. Deliberately NOT the hand-written `VerticalDramaArcReplanProposal`
 * TS type from `contentBudget.ts` (whose `proposedBreakdown` items require
 * `contentBudget`) — `verticalDramaArcReplanProposalSchema`'s own nested item
 * schema keeps `contentBudget` OPTIONAL (storage-tolerant), and this card
 * only ever reads `workingTitle`/`logline`/`keyBeats` from it, so the looser
 * parsed type is both more accurate and avoids an unsafe cast.
 */
export type VerticalDramaArcReplanProposalParsed = z.infer<typeof verticalDramaArcReplanProposalSchema>;

export type VerticalDramaArcReplanResolution = "pending" | "approved" | "rejected";

/** {from, to} episode pair for a `VD_ARC_TIE_IN_DEFERRED` proposal's compact kicker/diff (task #31, spec §7.7.3). */
export interface VerticalDramaTieInReplanMove {
  fromEpisodeNumber: number;
  toEpisodeNumber: number;
}

/**
 * Derives the {from, to} episode pair for a `VD_ARC_TIE_IN_DEFERRED`
 * proposal (task #31, spec §7.7.3) — locates the `proposedBreakdown` item
 * whose `tieIn.source === "deferred"` (the TARGET, carrying
 * `movedFromEpisodeNumber`). Returns `null` for a malformed/legacy proposal
 * that carries this drift code but no such item — the caller falls back to
 * the generic drift kicker/diff instead of crashing (defensive, never
 * throws).
 */
export function describeTieInReplanMove(
  proposal: VerticalDramaArcReplanProposalParsed,
): VerticalDramaTieInReplanMove | null {
  const target = proposal.proposedBreakdown.find(
    (item) => item.tieIn?.source === "deferred" && item.tieIn.movedFromEpisodeNumber != null,
  );
  if (!target?.tieIn || target.tieIn.movedFromEpisodeNumber == null) return null;
  return { fromEpisodeNumber: target.tieIn.movedFromEpisodeNumber, toEpisodeNumber: target.episodeNumber };
}

/**
 * Resolution status for one `arc_replan_proposal` event, scanned against the
 * FULL event list (append-only outcome chain — mirrors the router's own
 * `findArcReplanDecision` helper exactly: approval is a later event with
 * `payload.arcReplanApprovalOf === proposalEventId`; rejection is a later
 * event with `payload.arcReplanRejectionOf === proposalEventId`).
 */
export function resolveArcReplanStatus(
  proposalEventId: string,
  events: Array<{ payload: Record<string, unknown> }>,
): VerticalDramaArcReplanResolution {
  for (const ev of events) {
    if (ev.payload?.arcReplanApprovalOf === proposalEventId) return "approved";
    if (ev.payload?.arcReplanRejectionOf === proposalEventId) return "rejected";
  }
  return "pending";
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface VerticalDramaMemoryEventRow {
  memoryEventId: string;
  seriesId: string;
  episodeId?: string;
  runId?: string;
  memoryKind: VerticalDramaMemoryKind;
  payload: Record<string, unknown>;
  summaryText?: string;
  approved?: boolean;
  createdAt: string;
}

export interface VerticalDramaArcReplanCardProps {
  lang: VerticalDramaLang;
  seriesId: string;
  readOnly: boolean;
}

export function VerticalDramaArcReplanCard({ lang, seriesId, readOnly }: VerticalDramaArcReplanCardProps) {
  const utils = trpc.useUtils();

  // Same query key `VerticalDramaSeriesMemoryTab.tsx` already uses — TanStack
  // Query dedupes this into a single network request.
  const memoryQuery = trpc.verticalDramaEpisodes.listMemoryEvents.useQuery(
    { seriesId, limit: 200 },
    { enabled: Boolean(seriesId), staleTime: 15_000 },
  );
  // Same query key `VerticalDramaSeriesDetailPage.tsx` already uses — read
  // ONLY for the "old plan" side of the breakdown diff below.
  const seriesQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 30_000 },
  );

  const invalidateEvents = () =>
    void utils.verticalDramaEpisodes.listMemoryEvents.invalidate({ seriesId });

  const approveMutation = trpc.verticalDramaSeries.approveArcReplanProposal.useMutation({
    onSuccess: () => {
      toast.success(pickCopy(lang, verticalDramaCopy.arcReplanApproveSuccess));
      invalidateEvents();
      // Approval appends a new breakdown version and moves the active
      // pointer on the series bible — refresh it so the Overview/Bible tabs
      // don't keep showing the superseded plan.
      void utils.verticalDramaSeries.get.invalidate({ seriesId });
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.arcReplanApproveError));
    },
  });

  const rejectMutation = trpc.verticalDramaSeries.rejectArcReplanProposal.useMutation({
    onSuccess: () => {
      toast.success(pickCopy(lang, verticalDramaCopy.arcReplanRejectSuccess));
      invalidateEvents();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.arcReplanRejectError));
    },
  });

  if (memoryQuery.isLoading) {
    return <Skeleton className="h-32 w-full" aria-busy="true" />;
  }

  if (memoryQuery.isError) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {lang === "th" ? "โหลดข้อเสนอปรับแผนซีซั่นไม่สำเร็จ" : "Failed to load arc re-plan proposals"}
        </CardContent>
      </Card>
    );
  }

  const events = (memoryQuery.data?.events ?? []) as VerticalDramaMemoryEventRow[];
  // A genuine proposal — as opposed to a rejection-marker event that reuses
  // the same "arc_replan_proposal" memoryKind (mirrors the retcon pattern in
  // VerticalDramaSeriesMemoryTab.tsx exactly).
  const proposalEvents = events.filter(
    (ev) => ev.memoryKind === "arc_replan_proposal" && !("arcReplanRejectionOf" in ev.payload),
  );

  const activeBreakdown = getActiveBreakdownItemsForDisplay(
    (seriesQuery.data?.series as { bible?: unknown } | undefined)?.bible,
  );
  const oldByEpisode = new Map(activeBreakdown.map((item) => [item.episodeNumber, item]));

  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-sm font-semibold leading-none">
          <GitBranch className="h-4 w-4" aria-hidden="true" />
          {pickCopy(lang, verticalDramaCopy.arcReplanCardTitle)}
        </h3>
      </CardHeader>
      <CardContent>
        {proposalEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{pickCopy(lang, verticalDramaCopy.arcReplanEmpty)}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {proposalEvents.map((ev) => {
              const parsed = verticalDramaArcReplanProposalSchema.safeParse(ev.payload);
              if (!parsed.success) return null;
              const proposal = parsed.data;
              const status = resolveArcReplanStatus(ev.memoryEventId, events);
              const isMutating =
                (approveMutation.isPending &&
                  approveMutation.variables?.proposalEventId === ev.memoryEventId) ||
                (rejectMutation.isPending &&
                  rejectMutation.variables?.proposalEventId === ev.memoryEventId);

              return (
                <ArcReplanProposalItem
                  key={ev.memoryEventId}
                  lang={lang}
                  proposal={proposal}
                  status={status}
                  createdAt={ev.createdAt}
                  oldByEpisode={oldByEpisode}
                  oldPlanLoading={seriesQuery.isLoading}
                  readOnly={readOnly}
                  isMutating={isMutating}
                  onApprove={() => approveMutation.mutate({ seriesId, proposalEventId: ev.memoryEventId })}
                  onReject={() => rejectMutation.mutate({ seriesId, proposalEventId: ev.memoryEventId })}
                />
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function ArcReplanProposalItem({
  lang,
  proposal,
  status,
  createdAt,
  oldByEpisode,
  oldPlanLoading,
  readOnly,
  isMutating,
  onApprove,
  onReject,
}: {
  lang: VerticalDramaLang;
  proposal: VerticalDramaArcReplanProposalParsed;
  status: VerticalDramaArcReplanResolution;
  createdAt: string;
  oldByEpisode: Map<number, VerticalDramaDisplayBreakdownItem>;
  oldPlanLoading: boolean;
  readOnly: boolean;
  isMutating: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  // Task #31 (spec §7.7.3, added 2026-07-09) — a proposal deliberately
  // triggered by `deferEpisodeTieIn` (not a detected drift) gets a compact
  // "product moved" kicker/diff instead of the generic drift kicker + full
  // old/new breakdown diff below; every OTHER field on this proposal type
  // is guard-enforced identical to the active version
  // (`findArcReplanTieInGuardViolations`), so the full diff would show
  // nothing but noise. `tieInMove` is `null` for a malformed/legacy
  // proposal — falls back to the generic rendering below.
  const isTieInDeferred = proposal.driftReasons.includes("VD_ARC_TIE_IN_DEFERRED");
  const tieInMove = isTieInDeferred ? describeTieInReplanMove(proposal) : null;

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tieInMove
              ? tieInReplanMoveKickerText(lang, tieInMove.fromEpisodeNumber, tieInMove.toEpisodeNumber)
              : pickCopy(lang, verticalDramaCopy.arcReplanKicker)}
          </p>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {pickCopy(lang, verticalDramaCopy.arcReplanTriggeredBy)} {proposal.triggeredByEpisodeNumber}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <ArcReplanStatusBadge lang={lang} status={status} />
          {status === "pending" && !readOnly && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="gap-1" disabled={isMutating} onClick={onApprove}>
                {isMutating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {pickCopy(lang, verticalDramaCopy.arcReplanApprove)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-destructive"
                disabled={isMutating}
                onClick={onReject}
              >
                {isMutating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {pickCopy(lang, verticalDramaCopy.arcReplanReject)}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {pickCopy(lang, verticalDramaCopy.arcReplanDriftReasonsLabel)}
        </p>
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {proposal.driftReasons.map((code) => (
            <li key={code}>{arcDriftReasonLabel(lang, code)}</li>
          ))}
        </ul>
      </div>

      {proposal.rationale?.trim() && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {pickCopy(lang, verticalDramaCopy.arcReplanRationaleLabel)}
          </p>
          <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{proposal.rationale}</p>
        </div>
      )}

      <div className="mt-3 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {pickCopy(lang, verticalDramaCopy.arcReplanAffectedEpisodesLabel)} (
          {proposal.affectedEpisodeNumbers.join(", ")})
        </p>
        {tieInMove ? (
          <ul className="rounded-md border text-xs" data-testid="vd-arc-replan-tie-in-diff">
            <li className="flex items-center justify-between gap-2 border-b p-2.5 last:border-b-0">
              <span>{lang === "th" ? `ตอนย่อยที่ ${tieInMove.fromEpisodeNumber}` : `Sub-episode ${tieInMove.fromEpisodeNumber}`}</span>
              <span className="text-muted-foreground">
                {pickCopy(lang, verticalDramaCopy.arcReplanTieInLosesPlacement)}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2 p-2.5">
              <span>{lang === "th" ? `ตอนย่อยที่ ${tieInMove.toEpisodeNumber}` : `Sub-episode ${tieInMove.toEpisodeNumber}`}</span>
              <span className="text-emerald-700 dark:text-emerald-400">
                {pickCopy(lang, verticalDramaCopy.arcReplanTieInGainsPlacement)}
              </span>
            </li>
          </ul>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {proposal.affectedEpisodeNumbers.map((episodeNumber) => (
              <BreakdownDiffRow
                key={episodeNumber}
                lang={lang}
                episodeNumber={episodeNumber}
                oldItem={oldByEpisode.get(episodeNumber)}
                oldLoading={oldPlanLoading}
                newItem={proposal.proposedBreakdown.find((item) => item.episodeNumber === episodeNumber)}
              />
            ))}
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {new Date(createdAt).toLocaleString(lang === "th" ? "th-TH" : "en-US")}
      </p>
    </li>
  );
}

function ArcReplanStatusBadge({
  lang,
  status,
}: {
  lang: VerticalDramaLang;
  status: VerticalDramaArcReplanResolution;
}) {
  if (status === "approved") {
    return (
      <Badge variant="secondary" className="shrink-0 text-[10px]">
        {pickCopy(lang, verticalDramaCopy.arcReplanApprovedBadge)}
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {pickCopy(lang, verticalDramaCopy.arcReplanRejectedBadge)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 text-[10px]">
      {pickCopy(lang, verticalDramaCopy.arcReplanPendingBadge)}
    </Badge>
  );
}

interface BreakdownDiffItemLike {
  workingTitle: string;
  logline: string;
  keyBeats: string[];
}

/** One episode's old-vs-new comparison — stacks on mobile, side-by-side from `sm:` up. */
function BreakdownDiffRow({
  lang,
  episodeNumber,
  oldItem,
  oldLoading,
  newItem,
}: {
  lang: VerticalDramaLang;
  episodeNumber: number;
  oldItem?: BreakdownDiffItemLike;
  oldLoading: boolean;
  newItem?: BreakdownDiffItemLike;
}) {
  const th = lang === "th";
  return (
    <div className="border-b p-2.5 last:border-b-0">
      <p className="mb-1.5 text-xs font-semibold">{th ? `ตอนย่อยที่ ${episodeNumber}` : `Sub-episode ${episodeNumber}`}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <BreakdownDiffSide
          label={pickCopy(lang, verticalDramaCopy.arcReplanOldPlanLabel)}
          item={oldItem}
          loading={oldLoading}
          emptyText={pickCopy(lang, verticalDramaCopy.arcReplanNoOldPlan)}
        />
        <BreakdownDiffSide label={pickCopy(lang, verticalDramaCopy.arcReplanNewPlanLabel)} item={newItem} />
      </div>
    </div>
  );
}

function BreakdownDiffSide({
  label,
  item,
  loading,
  emptyText,
}: {
  label: string;
  item?: BreakdownDiffItemLike;
  loading?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="rounded-md bg-muted/30 p-2" role="group" aria-label={label}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : item ? (
        <>
          <p className="break-words text-xs font-medium">{item.workingTitle}</p>
          <p className="text-xs text-muted-foreground">{item.logline}</p>
          <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
            {item.keyBeats.map((beat, i) => (
              <li key={i}>{beat}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">{emptyText ?? "-"}</p>
      )}
    </div>
  );
}
