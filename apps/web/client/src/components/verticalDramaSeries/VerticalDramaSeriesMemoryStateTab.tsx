/**
 * VerticalDramaSeriesMemoryStateTab — Series Memory tab (Stage 1.4,
 * `planning/vd-series-memory-and-lineage/plan.md`).
 *
 * Renders + edits `VdSeriesMemory` (`@shared/verticalDramaSeries/seriesMemoryState`)
 * via `trpc.verticalDramaSeries.getSeriesMemory` / `.updateSeriesMemory`. This
 * is a DIFFERENT surface from the pre-existing `VerticalDramaSeriesMemoryTab.tsx`
 * (spec feature 131's read-only durable append-only event-log tab,
 * `listMemoryEvents`) — see that file's own header + `seriesMemoryState.ts`'s
 * header doc comment for why the two memory concepts are kept separate.
 *
 * Modeled on `VerticalDramaLocationStockPanel.tsx` / `VerticalDramaProductTieInTab.tsx`
 * for the loading/empty/error skeleton, `{ lang, seriesId, readOnly }` prop
 * contract, and query/mutation/`toast`/`utils.invalidate()` conventions — this
 * tab does NOT reuse their image-model-picker machinery (out of scope here).
 *
 * GRANULARITY (mirrors `updateSeriesMemory`'s own doc comment on the server):
 * the ONLY editable unit is one whole `VdEpisodeMemory` record. There is no
 * surgical "edit just one relationship"/"edit just one thread" server
 * operation, so relationship/thread card "Edit" affordances below all funnel
 * into the SAME `<EpisodeMemoryEditorDialog>`, opened at the episode number
 * that record logically belongs to (`sinceEpisode` / `openedEpisode`),
 * client-side-seeded with that one row already present so the user doesn't
 * have to re-type it — the round trip to the server is still always "read
 * (or start blank), mutate locally, send the WHOLE episode object back."
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CircleHelp,
  EyeOff,
  Link2,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  ScrollText,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type {
  VdEpisodeMemory,
  VdOpenThread,
  VdRelationshipDisclosure,
  VdRelationshipState,
  VdSeriesMemory,
  VdThreadClass,
} from "@shared/verticalDramaSeries/seriesMemoryState";
import type {
  VdThreadClosureAnnotation,
  VdThreadClosureDisposition,
} from "@shared/verticalDramaSeries/closureAssurance";
import {
  formatVerticalDramaDurationPlan,
  type VerticalDramaDurationPlan,
} from "@shared/verticalDramaSeries/durationProfiles";
import type { VerticalDramaStoryControlSeed } from "@shared/verticalDramaSeries/storyControl";
import type {
  VerticalDramaStoryControlAudit,
  VerticalDramaStoryControlAuditThread,
} from "@shared/verticalDramaSeries/storyContinuity";
import {
  coverageHeadlineText,
  coverageSecondaryText,
  disclosureCopy,
  pickCopy,
  storyControlAuditReasonText,
  storyControlAuditStatusText,
  threadClassCopy,
  userEditedBadgeText,
  userEditedConsequenceText,
  verticalDramaSeriesMemoryCopy as copy,
  type VdSeriesMemoryLang,
} from "./verticalDramaSeriesMemoryCopy";

export interface VerticalDramaSeriesMemoryStateTabProps {
  lang: VdSeriesMemoryLang;
  seriesId: string;
  readOnly: boolean;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers — exported for direct unit testing (same convention as        */
/* `VerticalDramaSeriesDetailPage.tsx`'s `resolveInitialSeriesTab`).           */
/* -------------------------------------------------------------------------- */

const DISCLOSURE_ORDER: VdRelationshipDisclosure[] = [
  "public",
  "known_to_some",
  "undeclared",
  "secret",
];

const THREAD_CLASSES: VdThreadClass[] = [
  "plot",
  "domestic",
  "career",
  "financial",
  "health",
  "relationship",
];

const THREAD_RESOLUTION_COPY = {
  this_episode: { th: "ตอนนี้", en: "this episode" },
  future_episode: {
    th: "ตอนถัดไปที่วางแผนไว้",
    en: "a planned future episode",
  },
  season: { th: "ภายในซีซัน", en: "within the season" },
} as const;

const STORY_CONTROL_AUDIT_STATUS_ORDER = [
  "registered",
  "open",
  "overdue",
  "resolved",
  "needs_review",
  "legacy_unknown",
  "missing_opening",
] as const;

function StoryControlAuditSummary({
  lang,
  audit,
}: {
  lang: VdSeriesMemoryLang;
  audit: VerticalDramaStoryControlAudit | null | undefined;
}) {
  if (!audit || audit.threads.length === 0) return null;
  return (
    <div
      className="flex flex-wrap gap-2 text-xs"
      data-testid="vd-memory-story-control-audit-summary"
    >
      {STORY_CONTROL_AUDIT_STATUS_ORDER.map(status => {
        const count = audit.counts[status];
        if (count === 0) return null;
        return (
          <Badge
            key={status}
            variant={
              status === "overdue" ||
              status === "needs_review" ||
              status === "missing_opening"
                ? "destructive"
                : status === "resolved"
                  ? "secondary"
                  : "outline"
            }
          >
            {storyControlAuditStatusText(lang, status)}: {count}
          </Badge>
        );
      })}
    </div>
  );
}

function StoryControlAuditOrphanList({
  lang,
  threads,
}: {
  lang: VdSeriesMemoryLang;
  threads: VerticalDramaStoryControlAuditThread[];
}) {
  if (threads.length === 0) return null;
  return (
    <div
      className="space-y-2"
      data-testid="vd-memory-story-control-audit-orphans"
    >
      <p className="text-xs font-medium">
        {pickCopy(lang, copy.controlPlaneAuditUnregistered)}
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {threads.map(thread => (
          <li
            key={thread.threadId}
            className="rounded-md border border-dashed p-2.5 text-xs"
            data-testid={`vd-memory-story-control-audit-thread-${thread.threadId}`}
          >
            <p className="font-medium">{thread.label}</p>
            <p className="mt-1 break-all font-mono text-muted-foreground">
              {thread.threadId}
            </p>
            <p className="mt-1 text-muted-foreground">
              {pickCopy(lang, copy.controlPlaneAuditStatus)}:{" "}
              {storyControlAuditStatusText(lang, thread.status)}
            </p>
            {thread.resolvedEpisode != null && (
              <p className="mt-1 text-muted-foreground">
                {pickCopy(lang, copy.threadResolvedAtLabel)}{" "}
                {thread.resolvedEpisode}
              </p>
            )}
            <p className="mt-1 text-muted-foreground">
              {pickCopy(lang, copy.controlPlaneAuditReason)}:{" "}
              {storyControlAuditReasonText(lang, thread.status)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A series is "thin" (the escape hatch this tab exists for) when fewer
 *  episodes have a real script than the series' planned length. Guards
 *  against `targetEpisodeCount` being null/0 (never divides, never warns on
 *  a series that hasn't set a target yet). */
export function isThinSeasonCoverage(coverage: {
  targetEpisodeCount: number | null | undefined;
  episodesWithRealScript: number;
}): boolean {
  const target = coverage.targetEpisodeCount;
  return (
    typeof target === "number" &&
    target > 0 &&
    coverage.episodesWithRealScript < target
  );
}

/** A brand-new, empty episode record for `episodeNumber` — the shape
 *  `updateSeriesMemory`'s `upsertEpisode` accepts, matching `VdEpisodeMemory`
 *  field-for-field. */
export function blankEpisodeMemory(episodeNumber: number): VdEpisodeMemory {
  return {
    episodeNumber,
    recap: "",
    canonicalFacts: [],
    threadsOpened: [],
    threadsResolved: [],
    relationshipChanges: [],
    knowledgeChanges: [],
  };
}

/** Order-insensitive pair identity — mirrors `seriesMemoryState.ts`'s own
 *  unexported `pairKey` so a relationship card's "Edit" seed can recognize
 *  "this pair already has a row in the target episode" regardless of tuple
 *  order. */
function relationshipPairKey(pair: readonly [string, string]): string {
  return [...pair].sort().join(String.fromCharCode(0));
}

/** Deterministic, human-legible thread id from a description — a starting
 *  point the user can still edit (this feature's whole point is "custom ได้
 *  จริง"), not a hidden/opaque id. Falls back to `"thread"` + a numeric
 *  suffix on collision against `existingIds`. */
export function slugifyThreadId(
  description: string,
  existingIds: ReadonlySet<string>
): string {
  const base =
    description
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9฀-๿]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 60) || "thread";
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export type VdResolvedThreadHistory = {
  threadId: string;
  description: string;
  threadClass: VdThreadClass;
  openedEpisode: number | null;
  resolvedEpisode: number;
  source: "matched" | "missing_opening";
};

/** Reconstructs the audit trail from the episode-level source of truth.
 *  The materialized currentState intentionally contains open threads only;
 *  this helper keeps resolved history visible without changing the persisted
 *  memory contract. Re-opening the same threadId creates a new lifecycle. */
export function deriveResolvedThreadHistory(
  episodes: VdEpisodeMemory[]
): VdResolvedThreadHistory[] {
  const openThreads = new Map<string, VdOpenThread>();
  const history: VdResolvedThreadHistory[] = [];
  const sortedEpisodes = [...episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );

  for (const episode of sortedEpisodes) {
    for (const thread of episode.threadsOpened ?? []) {
      if (
        !thread ||
        typeof thread.threadId !== "string" ||
        !thread.threadId.trim()
      ) {
        continue;
      }
      openThreads.set(thread.threadId, thread);
    }

    for (const threadId of episode.threadsResolved ?? []) {
      if (typeof threadId !== "string" || !threadId.trim()) continue;
      const opening = openThreads.get(threadId);
      history.push({
        threadId,
        description: opening?.description ?? threadId,
        threadClass: opening?.threadClass ?? "plot",
        openedEpisode: opening?.openedEpisode ?? null,
        resolvedEpisode: episode.episodeNumber,
        source: opening ? "matched" : "missing_opening",
      });
      openThreads.delete(threadId);
    }
  }

  return history.sort(
    (a, b) =>
      a.resolvedEpisode - b.resolvedEpisode ||
      a.threadId.localeCompare(b.threadId)
  );
}

function groupThreadsByClass(
  threads: VdOpenThread[]
): Record<VdThreadClass, VdOpenThread[]> {
  const grouped = {
    plot: [],
    domestic: [],
    career: [],
    financial: [],
    health: [],
    relationship: [],
  } as Record<VdThreadClass, VdOpenThread[]>;
  for (const thread of threads) {
    (grouped[thread.threadClass] ??= []).push(thread);
  }
  return grouped;
}

/** Seed a target episode record so a relationship card's "Edit" always has
 *  something to show, even for an episode with no stored record yet (the
 *  thin-season case) — inserts/replaces the one row matching this pair. */
export function seedEpisodeWithRelationship(
  episode: VdEpisodeMemory,
  relationship: VdRelationshipState
): VdEpisodeMemory {
  const key = relationshipPairKey(relationship.pair);
  const withoutPair = episode.relationshipChanges.filter(
    row => relationshipPairKey(row.pair) !== key
  );
  return { ...episode, relationshipChanges: [...withoutPair, relationship] };
}

/** Seed a target episode record's `threadsResolved` with one thread id
 *  pre-checked — used by the open-thread card's "Mark resolved" action. */
export function seedEpisodeWithThreadResolved(
  episode: VdEpisodeMemory,
  threadId: string
): VdEpisodeMemory {
  if (episode.threadsResolved.includes(threadId)) return episode;
  return {
    ...episode,
    threadsResolved: [...episode.threadsResolved, threadId],
  };
}

export function seedEpisodeWithThreadClosure(
  episode: VdEpisodeMemory,
  closure: VdThreadClosureAnnotation
): VdEpisodeMemory {
  return {
    ...episode,
    threadClosures: [
      ...(episode.threadClosures ?? []).filter(
        item => item.threadId !== closure.threadId
      ),
      closure,
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Disclosure badge — the axis this feature exists to make unmistakable.      */
/* -------------------------------------------------------------------------- */

const DISCLOSURE_ICON: Record<VdRelationshipDisclosure, typeof Megaphone> = {
  public: Megaphone,
  known_to_some: Users,
  undeclared: CircleHelp,
  secret: EyeOff,
};

const DISCLOSURE_BADGE_CLASSNAME: Record<VdRelationshipDisclosure, string> = {
  public:
    "border-emerald-500/60 text-emerald-700 bg-emerald-500/10 dark:text-emerald-400",
  known_to_some:
    "border-amber-500/60 text-amber-700 bg-amber-500/10 dark:text-amber-400",
  undeclared:
    "border-slate-400/60 text-slate-600 bg-slate-500/10 dark:text-slate-300",
  secret: "",
};

/**
 * Exported (Stage 2.6, `planning/vd-series-memory-and-lineage/plan.md`) so
 * `CreateSeriesWizard.tsx`'s sequel carry-over grid can render the SAME
 * disclosure visual language (icon/color/label) instead of inventing a
 * second dialect — see that file's carry-over relationship cards.
 */
export function DisclosureBadge({
  disclosure,
  lang,
}: {
  disclosure: VdRelationshipDisclosure;
  lang: VdSeriesMemoryLang;
}) {
  const Icon = DISCLOSURE_ICON[disclosure];
  const meta = disclosureCopy[disclosure];
  return (
    <Badge
      variant={disclosure === "secret" ? "destructive" : "outline"}
      className={cn("gap-1", DISCLOSURE_BADGE_CLASSNAME[disclosure])}
      data-testid={`vd-memory-disclosure-${disclosure}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {pickCopy(lang, meta.label)}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

type DialogRequest =
  | { kind: "edit"; episode: VdEpisodeMemory }
  | { kind: "create"; episode: VdEpisodeMemory };

export function VerticalDramaSeriesMemoryStateTab({
  lang,
  seriesId,
  readOnly,
}: VerticalDramaSeriesMemoryStateTabProps) {
  const utils = trpc.useUtils();
  const memoryQuery = trpc.verticalDramaSeries.getSeriesMemory.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 15_000 }
  );

  const invalidate = () =>
    void utils.verticalDramaSeries.getSeriesMemory.invalidate({ seriesId });

  const updateMutation =
    trpc.verticalDramaSeries.updateSeriesMemory.useMutation({
      onSuccess: (_data, variables) => {
        toast.success(
          pickCopy(
            lang,
            variables.edit.kind === "removeEpisode"
              ? copy.removeSucceeded
              : copy.saveSucceeded
          )
        );
        setDialogRequest(null);
        invalidate();
      },
      onError: (err: { message?: string }) => {
        toast.error(err?.message || pickCopy(lang, copy.saveFailed));
      },
    });

  const [dialogRequest, setDialogRequest] = useState<DialogRequest | null>(
    null
  );
  const [threadClassFilter, setThreadClassFilter] = useState<
    VdThreadClass | "all"
  >("all");

  const memory = memoryQuery.data?.memory;
  const coverage = memoryQuery.data?.coverage;
  const durationPlan = memoryQuery.data?.durationPlan as
    | VerticalDramaDurationPlan
    | null
    | undefined;
  const storyControlSeed = memoryQuery.data?.storyControlSeed as
    | VerticalDramaStoryControlSeed
    | null
    | undefined;
  const storyControlAudit = memoryQuery.data?.storyControlAudit;
  const closureAudit = memoryQuery.data?.closureAudit ?? [];

  const seededThreadIds = useMemo(
    () =>
      new Set(
        storyControlSeed?.threadCandidates.map(thread => thread.threadId) ?? []
      ),
    [storyControlSeed]
  );

  const auditedOrphanThreads = useMemo(
    () =>
      (storyControlAudit?.threads ?? []).filter(
        thread => !seededThreadIds.has(thread.threadId)
      ),
    [seededThreadIds, storyControlAudit]
  );

  const groupedOpenThreads = useMemo(
    () => groupThreadsByClass(memory?.currentState.openThreads ?? []),
    [memory]
  );

  const resolvedThreadHistory = useMemo(
    () => deriveResolvedThreadHistory(memory?.episodes ?? []),
    [memory]
  );

  const resolvedThreadById = useMemo(() => {
    const map = new Map<string, VdResolvedThreadHistory>();
    for (const thread of resolvedThreadHistory) {
      map.set(thread.threadId, thread);
    }
    return map;
  }, [resolvedThreadHistory]);

  const auditedThreadById = useMemo(
    () =>
      new Map(
        (storyControlAudit?.threads ?? []).map(thread => [
          thread.threadId,
          thread,
        ])
      ),
    [storyControlAudit]
  );

  const episodesByNumber = useMemo(() => {
    const map = new Map<number, VdEpisodeMemory>();
    for (const episode of memory?.episodes ?? [])
      map.set(episode.episodeNumber, episode);
    return map;
  }, [memory]);

  const timelineEpisodeNumbers = useMemo(() => {
    const numbers = new Set<number>(episodesByNumber.keys());
    const target = coverage?.targetEpisodeCount ?? 0;
    if (typeof target === "number") {
      for (let n = 1; n <= target; n += 1) numbers.add(n);
    }
    return [...numbers].sort((a, b) => a - b);
  }, [episodesByNumber, coverage]);

  const existingThreadIds = useMemo(
    () =>
      new Set(
        memory?.episodes.flatMap(ep => ep.threadsOpened.map(t => t.threadId)) ??
          []
      ),
    [memory]
  );

  if (memoryQuery.isLoading) {
    return (
      <div
        className="grid gap-4"
        aria-busy="true"
        data-testid="vd-series-memory-loading"
      >
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (memoryQuery.isError || !memory || !coverage) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {pickCopy(lang, copy.loadFailed)}
        </CardContent>
      </Card>
    );
  }

  const thin = isThinSeasonCoverage(coverage);
  const isEmpty = memory.episodes.length === 0;

  const saving = updateMutation.isPending;

  const openEditDialogForEpisode = (
    episodeNumber: number,
    seed?: (ep: VdEpisodeMemory) => VdEpisodeMemory
  ) => {
    const existing = episodesByNumber.get(episodeNumber);
    const base = existing ?? blankEpisodeMemory(episodeNumber);
    const seeded = seed ? seed(base) : base;
    setDialogRequest({ kind: existing ? "edit" : "create", episode: seeded });
  };

  const handleSave = (episode: VdEpisodeMemory) => {
    updateMutation.mutate({
      seriesId,
      edit: { kind: "upsertEpisode", episode },
    });
  };

  // Plain `window.confirm` (not the app's themed `useConfirm()`) — that hook
  // throws when rendered outside a mounted `<ConfirmProvider>` (confirmed
  // against `ToolPicker.tsx`'s own test, which fails the same way), so it
  // would make this tab's tests fragile to how a HOST page wraps it. A
  // native confirm is a reasonable, dependency-free choice for a single
  // destructive action gated behind an explicit button click.
  const handleRemove = (episodeNumber: number) => {
    if (!window.confirm(pickCopy(lang, copy.removeEpisodeConfirm))) return;
    updateMutation.mutate({
      seriesId,
      edit: { kind: "removeEpisode", episodeNumber },
    });
  };

  return (
    <div className="grid gap-4" data-testid="vd-series-memory-tab">
      {readOnly && (
        <Badge variant="outline" className="w-fit">
          {pickCopy(lang, copy.readOnly)}
        </Badge>
      )}

      {memory.userEdited && (
        <Badge
          variant="secondary"
          className="w-fit gap-1"
          data-testid="vd-memory-user-edited-badge"
        >
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          {userEditedBadgeText(lang)}
        </Badge>
      )}

      {/* Coverage — the thin-season escape hatch's warning surface. */}
      <Alert
        variant={thin ? "destructive" : "default"}
        data-testid="vd-memory-coverage-alert"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>
          {thin
            ? coverageHeadlineText(
                lang,
                coverage.episodesWithRealScript,
                coverage.targetEpisodeCount ?? 0
              )
            : pickCopy(lang, {
                th: "ความครอบคลุมของความจำ",
                en: "Memory coverage",
              })}
        </AlertTitle>
        <AlertDescription data-testid="vd-memory-coverage-secondary">
          {coverageSecondaryText(
            lang,
            coverage.episodesWithMemory,
            coverage.targetEpisodeCount ?? 0,
            coverage.episodesWithMemoryAndRealScript
          )}
        </AlertDescription>
      </Alert>

      <Card data-testid="vd-memory-story-control">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, copy.controlPlaneTitle)}
          </CardTitle>
          <Badge variant={storyControlSeed ? "secondary" : "outline"}>
            {storyControlSeed
              ? pickCopy(lang, {
                  th: "มี seed ที่ตรวจแล้ว",
                  en: "Seed available",
                })
              : pickCopy(lang, { th: "ยังไม่มี", en: "Pending" })}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {!storyControlSeed ? (
            <>
              <p className="text-sm text-muted-foreground">
                {pickCopy(lang, copy.controlPlaneEmpty)}
              </p>
              <StoryControlAuditSummary lang={lang} audit={storyControlAudit} />
              <StoryControlAuditOrphanList
                lang={lang}
                threads={auditedOrphanThreads}
              />
            </>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-medium">
                  {pickCopy(lang, copy.controlPlanePremise)}:
                </span>{" "}
                {storyControlSeed.premiseAnchor}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">
                  {pickCopy(lang, copy.controlPlaneCast)}:{" "}
                  {storyControlSeed.canonicalCharacterKeys.length}
                </Badge>
                <Badge variant="outline">
                  {pickCopy(lang, copy.controlPlaneThreadIds)}:{" "}
                  {storyControlSeed.threadCandidates.length}
                </Badge>
                <Badge variant="outline">
                  {pickCopy(lang, copy.controlPlaneRomance)}:{" "}
                  {storyControlSeed.romancePhaseSkeleton.length}
                </Badge>
                <Badge variant="outline">
                  {pickCopy(lang, copy.controlPlaneAdvantage)}:{" "}
                  {storyControlSeed.advantageIntent.length}
                </Badge>
              </div>

              <StoryControlAuditSummary lang={lang} audit={storyControlAudit} />
              <StoryControlAuditOrphanList
                lang={lang}
                threads={auditedOrphanThreads}
              />

              {storyControlSeed.threadCandidates.length > 0 && (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {storyControlSeed.threadCandidates.map(thread => (
                    <li
                      key={thread.threadId}
                      className="rounded-md border p-2.5 text-xs"
                    >
                      <p className="font-medium">{thread.label}</p>
                      <p className="mt-1 break-all font-mono text-muted-foreground">
                        {thread.threadId}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {thread.scope} ·{" "}
                        {pickCopy(lang, copy.controlPlaneThreadWindow)}{" "}
                        {thread.plantEpisode}–{thread.payoffWindow.endEpisode}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {pickCopy(lang, copy.controlPlaneThreadStatus)}:{" "}
                        {thread.status} ·{" "}
                        {pickCopy(lang, copy.controlPlaneThreadOwners)}:{" "}
                        {thread.ownerCharacters.join(", ")}
                      </p>
                      <p
                        className="mt-1 text-muted-foreground"
                        data-testid={`vd-memory-control-thread-status-${thread.threadId}`}
                      >
                        <span className="font-medium text-foreground">
                          {pickCopy(lang, copy.controlPlaneAuditStatus)}:
                        </span>{" "}
                        {auditedThreadById.get(thread.threadId)
                          ? storyControlAuditStatusText(
                              lang,
                              auditedThreadById.get(thread.threadId)!.status
                            )
                          : resolvedThreadById.get(thread.threadId)
                            ? `${pickCopy(lang, copy.threadResolvedAtLabel)} ${resolvedThreadById.get(thread.threadId)?.resolvedEpisode}`
                            : pickCopy(
                                lang,
                                copy.controlPlaneThreadNotResolved
                              )}
                      </p>
                      {(auditedThreadById.get(thread.threadId)
                        ?.resolvedEpisode ??
                        resolvedThreadById.get(thread.threadId)
                          ?.resolvedEpisode) != null && (
                        <p
                          className="mt-1 text-muted-foreground"
                          data-testid={`vd-memory-control-thread-resolved-episode-${thread.threadId}`}
                        >
                          {pickCopy(lang, copy.threadResolvedAtLabel)}{" "}
                          {auditedThreadById.get(thread.threadId)
                            ?.resolvedEpisode ??
                            resolvedThreadById.get(thread.threadId)
                              ?.resolvedEpisode}
                        </p>
                      )}
                      {auditedThreadById.get(thread.threadId) && (
                        <p className="mt-1 text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {pickCopy(lang, copy.controlPlaneAuditReason)}:
                          </span>{" "}
                          {storyControlAuditReasonText(
                            lang,
                            auditedThreadById.get(thread.threadId)!.status
                          )}
                        </p>
                      )}
                      <p className="mt-1 text-muted-foreground">
                        {pickCopy(lang, copy.controlPlaneThreadEvidence)}:{" "}
                        {thread.expectedEvidence.join(" · ")}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {pickCopy(lang, copy.controlPlaneThreadCost)}:{" "}
                        {thread.resolutionCost}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {(storyControlSeed.romancePhaseSkeleton.length > 0 ||
                storyControlSeed.advantageIntent.length > 0) && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {storyControlSeed.romancePhaseSkeleton.length > 0 && (
                    <div className="rounded-md border p-2.5 text-xs">
                      <p className="font-medium">
                        {pickCopy(lang, copy.controlPlaneRomance)}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {storyControlSeed.romancePhaseSkeleton
                          .map(beat => {
                            const pair = beat.pair
                              ? ` · ${beat.pair.join(" × ")}`
                              : "";
                            return `${beat.phase} (${beat.episodeWindow.startEpisode}-${beat.episodeWindow.endEpisode})${pair}: ${beat.purpose}`;
                          })
                          .join(" · ")}
                      </p>
                    </div>
                  )}
                  {storyControlSeed.advantageIntent.length > 0 && (
                    <div className="rounded-md border p-2.5 text-xs">
                      <p className="font-medium">
                        {pickCopy(lang, copy.controlPlaneAdvantage)}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {storyControlSeed.advantageIntent
                          .map(
                            beat =>
                              `${beat.episodeNumber}: ${beat.advantagedSide} · ${beat.cost} · ${pickCopy(lang, copy.controlPlaneOpponentResponse)}: ${beat.opponentResponse}`
                          )
                          .join(" · ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card data-testid="vd-memory-closure-audit">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, {
              th: "QC ปมและการปิดปม",
              en: "Thread closure QC",
            })}
          </CardTitle>
          <Badge
            variant={
              closureAudit.some(item => item.severity === "blocking")
                ? "destructive"
                : "outline"
            }
          >
            {closureAudit.filter(item => item.severity === "blocking").length}{" "}
            {pickCopy(lang, { th: "ต้องซ่อม", en: "need repair" })}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {pickCopy(lang, {
              th: "ปมที่ตั้งใจเปิดหรือเก็บไว้เป็นเซอร์ไพรส์จะไม่ถูกนับเป็นข้อผิดพลาด ระบบจะแจ้งเฉพาะปมที่ควรปิดแต่ไม่มีหลักฐานรองรับ",
              en: "Intentional, surprise, and future threads are not defects. Only required payoffs without evidence are blocking.",
            })}
          </p>
          {closureAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, {
                th: "ยังไม่มีข้อมูลปมสำหรับตรวจสอบ",
                en: "No thread data to audit yet.",
              })}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {closureAudit.map(item => {
                const label: Record<
                  VdThreadClosureDisposition,
                  { th: string; en: string }
                > = {
                  explicit_payoff: { th: "ปิดชัดเจน", en: "Explicit payoff" },
                  implicit_payoff: { th: "ปิดกลมกลืน", en: "Implicit payoff" },
                  expected_continuation: {
                    th: "รอตอนถัดไป",
                    en: "Expected continuation",
                  },
                  intentional_open: {
                    th: "ตั้งใจเปิด",
                    en: "Intentional open",
                  },
                  surprise_payoff: {
                    th: "ปมเซอร์ไพรส์",
                    en: "Surprise payoff",
                  },
                  needs_repair: { th: "ต้องซ่อม", en: "Needs repair" },
                };
                const episodeNumber =
                  memory.episodes.find(ep =>
                    ep.threadsOpened.some(
                      thread => thread.threadId === item.threadId
                    )
                  )?.episodeNumber ?? 1;
                return (
                  <li
                    key={item.threadId}
                    className="rounded-md border p-2.5 text-sm"
                    data-testid={`vd-memory-closure-${item.threadId}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p>{item.description}</p>
                      <Badge
                        variant={
                          item.severity === "blocking"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {pickCopy(lang, label[item.disposition])}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.rationale}
                    </p>
                    {item.evidenceEpisodeNumbers.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {pickCopy(lang, {
                          th: "หลักฐานตอน",
                          en: "Evidence episodes",
                        })}
                        : {item.evidenceEpisodeNumbers.join(", ")}
                      </p>
                    )}
                    {!readOnly && item.disposition === "needs_repair" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 gap-1"
                        onClick={() => openEditDialogForEpisode(episodeNumber)}
                        data-testid={`vd-memory-closure-repair-${item.threadId}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        {pickCopy(lang, {
                          th: "แก้ไขตอนที่เปิดปม",
                          en: "Edit opening episode",
                        })}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card data-testid="vd-memory-duration-plan">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, {
              th: "โครงสร้างความยาวตอน",
              en: "Episode duration structure",
            })}
          </CardTitle>
          <Badge
            variant={
              durationPlan?.status === "active" ? "secondary" : "outline"
            }
          >
            {durationPlan?.status === "active"
              ? pickCopy(lang, { th: "กำลังใช้งาน", en: "Active" })
              : durationPlan?.status === "legacy_compat"
                ? pickCopy(lang, { th: "รูปแบบเดิม", en: "Legacy" })
                : pickCopy(lang, { th: "รอกำหนด", en: "Pending" })}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <p
            className="text-sm font-medium"
            data-testid="vd-memory-duration-plan-value"
          >
            {formatVerticalDramaDurationPlan(durationPlan, lang)}
          </p>
          <p className="text-xs text-muted-foreground">
            {durationPlan?.status === "legacy_compat"
              ? pickCopy(lang, {
                  th: "ตอนเก่าคงค่าเดิมทั้งหมด โปรไฟล์นี้ใช้เป็นข้อมูลอ้างอิงเท่านั้น",
                  en: "Existing episodes keep their original timing; this profile is read-only compatibility information.",
                })
              : pickCopy(lang, {
                  th: "ระบบคิดจาก 9 ช็อตเชิงตรรกะและ duration ต่อช็อต ไม่รับค่าความยาวต่อตอนแบบเดิม",
                  en: "Runtime is derived from nine logical shots and per-shot durations; the old fixed per-episode input is not used.",
                })}
          </p>
        </CardContent>
      </Card>

      {/* Compact summary — "read this and understand the whole story". */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, copy.compactSummaryTitle)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className="whitespace-pre-wrap text-sm"
            data-testid="vd-memory-compact-summary"
          >
            {memory.compactSummary.trim() ||
              pickCopy(lang, copy.compactSummaryEmpty)}
          </p>
        </CardContent>
      </Card>

      {isEmpty && (
        <Card className="border-dashed" data-testid="vd-memory-empty-state">
          <CardHeader>
            <CardTitle className="text-base">
              {pickCopy(lang, copy.emptyStateTitle)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, copy.emptyStateBody)}
            </p>
            {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => openEditDialogForEpisode(1)}
                data-testid="vd-memory-add-first-episode"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {pickCopy(lang, copy.addEpisodeRecord)}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Relationship cards. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, copy.relationshipsTitle)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memory.currentState.relationships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, copy.relationshipsEmpty)}
            </p>
          ) : (
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              data-testid="vd-memory-relationship-list"
            >
              {memory.currentState.relationships.map(relationship => (
                <li
                  key={relationshipPairKey(relationship.pair)}
                  className="rounded-md border p-3 text-sm"
                  data-testid={`vd-memory-relationship-${relationshipPairKey(relationship.pair)}`}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <p className="font-medium">
                      {relationship.pair[0]} ↔ {relationship.pair[1]}
                    </p>
                    <DisclosureBadge
                      disclosure={relationship.disclosure}
                      lang={lang}
                    />
                  </div>
                  <p className="text-muted-foreground">{relationship.status}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pickCopy(
                      lang,
                      disclosureCopy[relationship.disclosure].caption
                    )}
                  </p>
                  <p className="mt-2 text-xs">
                    <span className="font-medium">
                      {pickCopy(lang, copy.knownByLabel)}:
                    </span>{" "}
                    {relationship.knownBy.length > 0
                      ? relationship.knownBy.join(", ")
                      : pickCopy(lang, copy.knownByNone)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pickCopy(lang, copy.sinceEpisodeLabel)}{" "}
                    {relationship.sinceEpisode}
                  </p>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 gap-1"
                      onClick={() =>
                        openEditDialogForEpisode(
                          relationship.sinceEpisode,
                          ep => seedEpisodeWithRelationship(ep, relationship)
                        )
                      }
                      data-testid={`vd-memory-relationship-edit-${relationshipPairKey(relationship.pair)}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      {pickCopy(lang, copy.editRelationship)}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Resolved-thread audit history — derived from episode records so a
          resolved thread never becomes invisible after leaving openThreads. */}
      <Card data-testid="vd-memory-resolved-thread-history">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, copy.resolvedThreadsTitle)}
          </CardTitle>
          <Badge variant="outline">
            {resolvedThreadHistory.length}{" "}
            {pickCopy(lang, copy.resolvedThreadsCount)}
          </Badge>
        </CardHeader>
        <CardContent>
          {resolvedThreadHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, copy.resolvedThreadsEmpty)}
            </p>
          ) : (
            <ul
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              data-testid="vd-memory-resolved-thread-list"
            >
              {resolvedThreadHistory.map(thread => (
                <li
                  key={`${thread.threadId}-${thread.resolvedEpisode}`}
                  className="rounded-md border p-2.5 text-sm"
                  data-testid={`vd-memory-resolved-thread-${thread.threadId}-${thread.resolvedEpisode}`}
                >
                  <p>{thread.description}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {pickCopy(lang, copy.threadIdDisplayLabel)}:
                    </span>{" "}
                    <code className="font-mono">{thread.threadId}</code>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {thread.openedEpisode == null
                      ? pickCopy(lang, copy.threadResolutionSourceMissing)
                      : `${pickCopy(lang, copy.threadOpenedAtLabel)} ${thread.openedEpisode} · `}
                    {pickCopy(lang, copy.threadResolvedAtLabel)}{" "}
                    {thread.resolvedEpisode}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Open threads, grouped/filterable by threadClass. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, copy.openThreadsTitle)}
          </CardTitle>
          <Badge variant="outline">
            {memory.currentState.openThreads.length}{" "}
            {pickCopy(lang, copy.openThreadsCount)}
          </Badge>
          <Select
            value={threadClassFilter}
            onValueChange={value =>
              setThreadClassFilter(value as VdThreadClass | "all")
            }
          >
            <SelectTrigger
              className="w-44"
              data-testid="vd-memory-thread-class-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {pickCopy(lang, copy.threadClassFilterAll)}
              </SelectItem>
              {THREAD_CLASSES.map(cls => (
                <SelectItem key={cls} value={cls}>
                  {pickCopy(lang, threadClassCopy[cls])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {memory.currentState.openThreads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, copy.openThreadsEmpty)}
            </p>
          ) : (
            <div className="grid gap-4" data-testid="vd-memory-thread-list">
              {(threadClassFilter === "all"
                ? THREAD_CLASSES
                : [threadClassFilter]
              ).map(cls => {
                const threads = groupedOpenThreads[cls];
                if (!threads || threads.length === 0) return null;
                return (
                  <div key={cls}>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {pickCopy(lang, threadClassCopy[cls])}
                    </p>
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {threads.map(thread => (
                        <li
                          key={thread.threadId}
                          className="rounded-md border p-2.5 text-sm"
                          data-testid={`vd-memory-thread-${thread.threadId}`}
                        >
                          <p>{thread.description}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {pickCopy(lang, copy.threadOpenedAtLabel)}{" "}
                            {thread.openedEpisode}
                          </p>
                          <p
                            className="mt-1 break-all text-xs text-muted-foreground"
                            data-testid={`vd-memory-thread-id-${thread.threadId}`}
                          >
                            <span className="font-medium text-foreground">
                              {pickCopy(lang, copy.threadIdDisplayLabel)}:
                            </span>{" "}
                            <code className="font-mono">{thread.threadId}</code>
                          </p>
                          {thread.expectedResolution && (
                            <p
                              className="mt-1 text-xs text-muted-foreground"
                              data-testid={`vd-memory-thread-resolution-${thread.threadId}`}
                            >
                              <span className="font-medium text-foreground">
                                {pickCopy(
                                  lang,
                                  copy.threadResolutionTargetLabel
                                )}
                                :
                              </span>{" "}
                              {pickCopy(
                                lang,
                                THREAD_RESOLUTION_COPY[
                                  thread.expectedResolution
                                ]
                              )}
                              {thread.expectedResolutionEpisode != null && (
                                <>
                                  {" · "}
                                  {pickCopy(
                                    lang,
                                    copy.threadResolutionEpisodeLabel
                                  )}{" "}
                                  {thread.expectedResolutionEpisode}
                                </>
                              )}
                            </p>
                          )}
                          {!readOnly && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() =>
                                  openEditDialogForEpisode(thread.openedEpisode)
                                }
                                data-testid={`vd-memory-thread-edit-${thread.threadId}`}
                              >
                                <Pencil
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                {pickCopy(lang, copy.editThread)}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() =>
                                  openEditDialogForEpisode(
                                    Math.max(
                                      memory.lastFoldedEpisode,
                                      thread.openedEpisode
                                    ),
                                    ep =>
                                      seedEpisodeWithThreadResolved(
                                        ep,
                                        thread.threadId
                                      )
                                  )
                                }
                                data-testid={`vd-memory-thread-resolve-${thread.threadId}`}
                              >
                                {pickCopy(lang, copy.markResolved)}
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Episode timeline. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, copy.episodeTimelineTitle)}
          </CardTitle>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                const next = timelineEpisodeNumbers.length
                  ? Math.max(...timelineEpisodeNumbers) + 1
                  : 1;
                openEditDialogForEpisode(next);
              }}
              data-testid="vd-memory-add-episode-record"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {pickCopy(lang, copy.addEpisodeRecord)}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {timelineEpisodeNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, copy.episodeTimelineEmpty)}
            </p>
          ) : (
            <Accordion
              type="multiple"
              className="w-full"
              data-testid="vd-memory-episode-timeline"
            >
              {timelineEpisodeNumbers.map(episodeNumber => {
                const episode = episodesByNumber.get(episodeNumber);
                return (
                  <AccordionItem
                    key={episodeNumber}
                    value={String(episodeNumber)}
                  >
                    <AccordionTrigger
                      data-testid={`vd-memory-episode-trigger-${episodeNumber}`}
                    >
                      <div className="flex flex-1 items-center justify-between gap-2 pr-2 text-left">
                        <span>
                          {pickCopy(lang, copy.episodeLabel)} {episodeNumber}
                        </span>
                        {!episode && (
                          <Badge variant="outline" className="text-xs">
                            {pickCopy(lang, copy.noRecordForEpisode)}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      {episode ? (
                        <>
                          <p className="whitespace-pre-wrap text-sm">
                            {episode.recap}
                          </p>
                          {episode.canonicalFacts.length > 0 && (
                            <ul className="list-disc pl-4 text-xs text-muted-foreground">
                              {episode.canonicalFacts.map((fact, i) => (
                                <li key={i}>{fact}</li>
                              ))}
                            </ul>
                          )}
                          {!readOnly && (
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() =>
                                  openEditDialogForEpisode(episodeNumber)
                                }
                                data-testid={`vd-memory-episode-edit-${episodeNumber}`}
                              >
                                <Pencil
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                {pickCopy(lang, copy.editEpisodeRecord)}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-destructive"
                                onClick={() => handleRemove(episodeNumber)}
                                data-testid={`vd-memory-episode-remove-${episodeNumber}`}
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                {pickCopy(lang, copy.removeEpisodeRecord)}
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            {pickCopy(lang, copy.noRecordForEpisode)}
                          </p>
                          {!readOnly && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() =>
                                openEditDialogForEpisode(episodeNumber)
                              }
                              data-testid={`vd-memory-episode-write-${episodeNumber}`}
                            >
                              <Plus
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              {pickCopy(lang, copy.writeRecordForEpisode)}
                            </Button>
                          )}
                        </>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {dialogRequest && (
        <EpisodeMemoryEditorDialog
          key={`${dialogRequest.kind}-${dialogRequest.episode.episodeNumber}`}
          lang={lang}
          initialEpisode={dialogRequest.episode}
          isNew={dialogRequest.kind === "create"}
          seriesUserEdited={Boolean(memory.userEdited)}
          openThreads={memory.currentState.openThreads}
          existingThreadIds={existingThreadIds}
          saving={saving}
          onCancel={() => setDialogRequest(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Episode editor dialog — the single vehicle for every write in this tab.    */
/* -------------------------------------------------------------------------- */

function EpisodeMemoryEditorDialog({
  lang,
  initialEpisode,
  isNew,
  seriesUserEdited,
  openThreads,
  existingThreadIds,
  saving,
  onCancel,
  onSave,
}: {
  lang: VdSeriesMemoryLang;
  initialEpisode: VdEpisodeMemory;
  isNew: boolean;
  seriesUserEdited: boolean;
  openThreads: VdOpenThread[];
  existingThreadIds: ReadonlySet<string>;
  saving: boolean;
  onCancel: () => void;
  onSave: (episode: VdEpisodeMemory) => void;
}) {
  const [draft, setDraft] = useState<VdEpisodeMemory>(initialEpisode);

  const resolvableThreads = useMemo(() => {
    const map = new Map<string, string>();
    for (const thread of openThreads)
      map.set(thread.threadId, thread.description);
    for (const opened of draft.threadsOpened) {
      if (!map.has(opened.threadId))
        map.set(opened.threadId, opened.description);
    }
    return [...map.entries()];
  }, [openThreads, draft.threadsOpened]);

  const canSave = draft.recap.trim().length > 0;

  return (
    <Dialog open onOpenChange={open => !open && onCancel()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pickCopy(lang, copy.episodeLabel)} {draft.episodeNumber}
          </DialogTitle>
          <DialogDescription>
            {userEditedConsequenceText(lang, seriesUserEdited)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="vd-memory-recap">
              {pickCopy(lang, copy.recapLabel)}
            </Label>
            <Textarea
              id="vd-memory-recap"
              rows={4}
              maxLength={4000}
              value={draft.recap}
              placeholder={pickCopy(lang, copy.recapPlaceholder)}
              onChange={e => setDraft({ ...draft, recap: e.target.value })}
              data-testid="vd-memory-dialog-recap"
            />
            <p className="text-xs text-muted-foreground">
              {draft.recap.length}/4000
            </p>
          </div>

          <Separator />

          <StringListField
            label={pickCopy(lang, copy.canonicalFactsLabel)}
            addLabel={pickCopy(lang, copy.addFact)}
            items={draft.canonicalFacts}
            onChange={items => setDraft({ ...draft, canonicalFacts: items })}
            testIdPrefix="vd-memory-facts"
          />

          <Separator />

          <div className="space-y-2">
            <Label>{pickCopy(lang, copy.threadsOpenedLabel)}</Label>
            <ArrayField
              items={draft.threadsOpened}
              onChange={items => setDraft({ ...draft, threadsOpened: items })}
              newItem={(): VdOpenThread => ({
                threadId: slugifyThreadId("", existingThreadIds),
                description: "",
                threadClass: "plot",
                openedEpisode: draft.episodeNumber,
              })}
              addLabel={pickCopy(lang, copy.addThreadOpened)}
              testIdPrefix="vd-memory-threads-opened"
              renderRow={(item, _index, update) => (
                <>
                  <Input
                    value={item.description}
                    placeholder={pickCopy(
                      lang,
                      copy.threadDescriptionPlaceholder
                    )}
                    onChange={e => update({ description: e.target.value })}
                    data-testid="vd-memory-thread-opened-description"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={item.threadClass}
                      onValueChange={value =>
                        update({ threadClass: value as VdThreadClass })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {THREAD_CLASSES.map(cls => (
                          <SelectItem key={cls} value={cls}>
                            {pickCopy(lang, threadClassCopy[cls])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={item.closureIntent ?? "payoff_required"}
                      onValueChange={value =>
                        update({
                          closureIntent: value as VdOpenThread["closureIntent"],
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-48"
                        data-testid="vd-memory-thread-closure-intent"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="payoff_required">
                          {pickCopy(lang, {
                            th: "ต้องมี payoff",
                            en: "Payoff required",
                          })}
                        </SelectItem>
                        <SelectItem value="background_close_ok">
                          {pickCopy(lang, {
                            th: "ปิดกลมกลืนได้",
                            en: "Background close",
                          })}
                        </SelectItem>
                        <SelectItem value="intentional_open">
                          {pickCopy(lang, {
                            th: "ตั้งใจเปิด",
                            en: "Intentional open",
                          })}
                        </SelectItem>
                        <SelectItem value="surprise_payoff">
                          {pickCopy(lang, {
                            th: "ปมเซอร์ไพรส์",
                            en: "Surprise payoff",
                          })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-44"
                      value={item.threadId}
                      title={pickCopy(lang, copy.threadIdLabel)}
                      onChange={e => update({ threadId: e.target.value })}
                      data-testid="vd-memory-thread-opened-id"
                    />
                  </div>
                </>
              )}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{pickCopy(lang, copy.threadsResolvedLabel)}</Label>
            {resolvableThreads.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {pickCopy(lang, copy.threadsResolvedEmpty)}
              </p>
            ) : (
              <div className="grid gap-1.5">
                {resolvableThreads.map(([threadId, description]) => (
                  <label
                    key={threadId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={draft.threadsResolved.includes(threadId)}
                      onChange={e =>
                        setDraft({
                          ...draft,
                          threadsResolved: e.target.checked
                            ? [...draft.threadsResolved, threadId]
                            : draft.threadsResolved.filter(
                                id => id !== threadId
                              ),
                        })
                      }
                      data-testid={`vd-memory-thread-resolve-checkbox-${threadId}`}
                    />
                    {description || threadId}
                  </label>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{pickCopy(lang, copy.relationshipChangesLabel)}</Label>
            <ArrayField
              items={draft.relationshipChanges}
              onChange={items =>
                setDraft({ ...draft, relationshipChanges: items })
              }
              newItem={() => ({
                pair: ["", ""] as [string, string],
                status: "",
                disclosure: "undeclared" as VdRelationshipDisclosure,
                knownBy: [],
                sinceEpisode: draft.episodeNumber,
              })}
              addLabel={pickCopy(lang, copy.addRelationshipChange)}
              testIdPrefix="vd-memory-relationship-changes"
              renderRow={(item, _index, update) => (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="w-40"
                      value={item.pair[0]}
                      placeholder={pickCopy(lang, copy.characterKeyA)}
                      onChange={e =>
                        update({ pair: [e.target.value, item.pair[1]] })
                      }
                      data-testid="vd-memory-relationship-pair-a"
                    />
                    <Input
                      className="w-40"
                      value={item.pair[1]}
                      placeholder={pickCopy(lang, copy.characterKeyB)}
                      onChange={e =>
                        update({ pair: [item.pair[0], e.target.value] })
                      }
                      data-testid="vd-memory-relationship-pair-b"
                    />
                  </div>
                  <Input
                    value={item.status}
                    placeholder={pickCopy(lang, copy.statusPlaceholder)}
                    onChange={e => update({ status: e.target.value })}
                    data-testid="vd-memory-relationship-status"
                  />
                  <div className="flex flex-wrap gap-1.5" role="radiogroup">
                    {DISCLOSURE_ORDER.map(option => {
                      const Icon = DISCLOSURE_ICON[option];
                      const selected = item.disclosure === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => update({ disclosure: option })}
                          className={cn(
                            "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                            selected
                              ? DISCLOSURE_BADGE_CLASSNAME[option] ||
                                  "border-destructive bg-destructive/10 text-destructive"
                              : "border-muted text-muted-foreground"
                          )}
                          aria-pressed={selected}
                          data-testid={`vd-memory-relationship-disclosure-option-${option}`}
                        >
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {pickCopy(lang, disclosureCopy[option].label)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pickCopy(lang, disclosureCopy[item.disclosure].caption)}
                  </p>
                  <StringListField
                    label={pickCopy(lang, copy.knownByEditLabel)}
                    addLabel="+"
                    items={item.knownBy}
                    onChange={items => update({ knownBy: items })}
                    testIdPrefix="vd-memory-relationship-known-by"
                    compact
                  />
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">
                      {pickCopy(lang, copy.sinceEpisodeLabel)}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      value={item.sinceEpisode}
                      onChange={e =>
                        update({ sinceEpisode: Number(e.target.value) || 1 })
                      }
                      data-testid="vd-memory-relationship-since-episode"
                    />
                  </div>
                </>
              )}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{pickCopy(lang, copy.knowledgeChangesLabel)}</Label>
            <ArrayField
              items={draft.knowledgeChanges}
              onChange={items =>
                setDraft({ ...draft, knowledgeChanges: items })
              }
              newItem={() => ({ characterKey: "", learned: "" })}
              addLabel={pickCopy(lang, copy.addKnowledgeChange)}
              testIdPrefix="vd-memory-knowledge-changes"
              renderRow={(item, _index, update) => (
                <>
                  <Input
                    value={item.characterKey}
                    placeholder={pickCopy(lang, copy.characterKeyLabel)}
                    onChange={e => update({ characterKey: e.target.value })}
                    data-testid="vd-memory-knowledge-character-key"
                  />
                  <Input
                    value={item.learned}
                    placeholder={pickCopy(lang, copy.learnedLabel)}
                    onChange={e => update({ learned: e.target.value })}
                    data-testid="vd-memory-knowledge-learned"
                  />
                </>
              )}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            {pickCopy(lang, copy.cancel)}
          </Button>
          <Button
            disabled={!canSave || saving}
            onClick={() =>
              onSave({
                ...draft,
                canonicalFacts: draft.canonicalFacts.filter(
                  f => f.trim().length > 0
                ),
                threadsOpened: draft.threadsOpened.filter(
                  t => t.description.trim().length > 0
                ),
                relationshipChanges: draft.relationshipChanges.filter(
                  r =>
                    r.pair[0].trim().length > 0 &&
                    r.pair[1].trim().length > 0 &&
                    r.status.trim().length > 0
                ),
                knowledgeChanges: draft.knowledgeChanges.filter(
                  k =>
                    k.characterKey.trim().length > 0 &&
                    k.learned.trim().length > 0
                ),
              })
            }
            data-testid="vd-memory-dialog-save"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              pickCopy(lang, copy.save)
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Generic small array/list editors shared by every section above.           */
/* -------------------------------------------------------------------------- */

function StringListField({
  label,
  addLabel,
  items,
  onChange,
  testIdPrefix,
  compact,
}: {
  label: string;
  addLabel: string;
  items: string[];
  onChange: (items: string[]) => void;
  testIdPrefix: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {!compact && <Label className="text-xs">{label}</Label>}
      <div className="grid gap-1.5" data-testid={`${testIdPrefix}-list`}>
        {items.map((value, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              value={value}
              onChange={e => {
                const next = items.slice();
                next[index] = e.target.value;
                onChange(next);
              }}
              data-testid={`${testIdPrefix}-item-${index}`}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              data-testid={`${testIdPrefix}-remove-${index}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1"
        onClick={() => onChange([...items, ""])}
        data-testid={`${testIdPrefix}-add`}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}

function ArrayField<T>({
  items,
  onChange,
  renderRow,
  newItem,
  addLabel,
  testIdPrefix,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  renderRow: (
    item: T,
    index: number,
    update: (patch: Partial<T>) => void
  ) => React.ReactNode;
  newItem: () => T;
  addLabel: string;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-list`}>
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start gap-2 rounded-md border p-2"
          data-testid={`${testIdPrefix}-row-${index}`}
        >
          <div className="grid flex-1 gap-2">
            {renderRow(item, index, patch => {
              const next = items.slice();
              next[index] = { ...item, ...patch };
              onChange(next);
            })}
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            data-testid={`${testIdPrefix}-remove-${index}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => onChange([...items, newItem()])}
        data-testid={`${testIdPrefix}-add`}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}
