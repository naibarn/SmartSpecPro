/**
 * VerticalDramaImproveScriptCard — "ปรับปรุงบทละครให้มีความสมบูรณ์" (added
 * 2026-07-10).
 *
 * Replaces the removed `VerticalDramaSeasonCritiqueCard` (a quality-model
 * picker + separate critique/apply/auto-loop flow) with ONE simpler, cheaper
 * flow: a free-text "what to improve" request box (seeded with a sensible
 * Thai default, user-editable) and a single CTA that sends the whole
 * drafted script through the `drama-script-evaluate-improve` skill
 * (server-side, see `server/services/verticalDramaImproveScript.ts`'s own
 * doc comment for the full design), then shows a left(original)/right
 * (improved) per-episode comparison before the user explicitly confirms or
 * discards the result. No model picker — the server auto-selects a
 * large-context model when nothing more specific is pinned.
 *
 * Pulled out to its OWN file (unlike the old card, which lived inline in
 * `VerticalDramaDeepStoryDraftsPanel.tsx`) since it has real sub-structure:
 * an edit-toggle request box, a fail-closed "needs review" state, and a
 * per-episode comparison list. Mounted unconditionally at the end of
 * `VerticalDramaDeepStoryDraftsActions` (same spot the old card occupied),
 * with the SAME `lang`/`seriesId`/`readOnly`/`hasDrafts` prop contract;
 * renders nothing (`null`) until `hasDrafts` is true, mirroring that
 * component's own `deepDraftSummary`-presence gate.
 *
 * Self-contained: queries its own `verticalDramaSeries.get` (same query key
 * `VerticalDramaSeriesDetailPage.tsx`/`VerticalDramaArcReplanCard.tsx`
 * already use, so TanStack Query dedupes this into one network request) for
 * the "original" side of the comparison, and owns `startImproveScript`/
 * `confirmImproveScript`/`discardImproveScript` itself.
 *
 * Async story jobs (#28) — submits via `startImproveScript` (returns
 * `{jobId, deduped}` immediately), then polls via the exact same
 * `pollVerticalDramaStoryJob` loop `VerticalDramaDeepStoryDraftsActions`
 * uses for `deep_generate`/`extend`, imported directly FROM that file (a
 * narrow, deliberate circular import — see that file's own import-block doc
 * comment for why this is safe: `pollVerticalDramaStoryJob` is a hoisted
 * `function` declaration, and the types are `import type`-only so they are
 * erased entirely at compile time).
 *
 * Fail-closed by design: when the job's verification gate finds a problem
 * (`result.needsReview === true`), this card shows ONLY a discard action —
 * never a confirm — alongside the reasons and a raw-text disclosure. Do not
 * add a bypass; a partial/unverified apply could corrupt the stored
 * breakdown (see the server service's own doc comment on the 9-shots-per-
 * episode invariant this gate protects).
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  formatStoryScriptEpisode,
  type StoryScriptEpisodeInput,
} from "@shared/verticalDramaSeries/storyScriptText";
import { getActiveBreakdownItemsForDisplay } from "./VerticalDramaArcReplanCard";
import {
  pollVerticalDramaStoryJob,
  readDeepDraftCliffhangerLine,
  readDeepDraftShotDrafts,
  type VerticalDramaStoryJobKind,
  type VerticalDramaStoryJobProgressLike,
} from "./VerticalDramaDeepStoryDraftsPanel";
import {
  IMPROVE_SCRIPT_DEFAULT_REQUEST_TEXT,
  improveScriptConfirmSuccessText,
  improveScriptEpisodeAttemptRoundProgressText,
  improveScriptEpisodeRoundProgressText,
  improveScriptPartialFailureEpisodeReasonText,
  improveScriptPartialFailureHeadingText,
  improveScriptRoundProgressText,
  pickCopy,
  verticalDramaCopy,
  type VerticalDramaLang,
} from "./verticalDramaCopy";

/** Server input's own `.max(4000)` on `userRevisionRequest` — mirrored here so the textarea can't even be typed past what the server would reject. */
const IMPROVE_SCRIPT_REQUEST_MAX_LENGTH = 4000;

/**
 * Whole-block realignment (2026-07-10): improve now runs ONE whole-season
 * pass (the skill's intended design — the validated real-data run finished a
 * 6-episode season in a single LLM round), followed by bounded per-episode
 * straggler retries only for episodes that come back malformed. Worst case is
 * the whole-block continuation loop (`VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS`)
 * plus, for every drafted episode, `VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS ×
 * straggler-rounds` — still far under the prior per-episode-retry worst case,
 * so the generous 180-minute (3hr) ceiling stays ample. Kept at 180 min per
 * the earlier explicit instruction to leave a wide margin for slow LLM calls.
 * At the shared helper's 2500ms interval: 180 * 60 * 1000 / 2500 = 4320.
 */
const IMPROVE_SCRIPT_POLL_MAX_ATTEMPTS = 4320;

/**
 * Client-local mirror of `RunImproveScriptJobResult`
 * (`server/services/verticalDramaImproveScript.ts`, a server-only file, not
 * importable from the client) — only the fields this card actually reads.
 * `improvedItems` stays `unknown[]` (not a stricter breakdown-item type):
 * each entry is read the SAME tolerant way `VerticalDramaDeepStoryDraftEpisodeDetail`
 * already reads any breakdown item (`readDeepDraftShotDrafts`/
 * `readDeepDraftCliffhangerLine`), via `toStoryScriptEpisodeInput` below.
 *
 * Per-episode generation rewrite (2026-07-10): `improvedItems` is no longer
 * nullable — `[]` when nothing succeeded (see `needsReview`), otherwise a
 * SUBSET of `expectedEpisodeNumbers` (episodes that failed verification keep
 * their original content and are surfaced separately via
 * `partialFailureEpisodeNumbers`/`perEpisodeWarnings`, not omitted silently).
 */
export interface VerticalDramaImproveScriptJobResultLike {
  scoreSummary: string;
  expectedEpisodeNumbers: number[];
  needsReview: boolean;
  needsReviewReasons: string[];
  improvedItems: unknown[];
  /** Episode numbers that failed verification and kept their original content — non-blocking (the rest of the job can still be confirmed). */
  partialFailureEpisodeNumbers: number[];
  /** Per-episode failure detail for the episodes listed in `partialFailureEpisodeNumbers`, rendered under the non-blocking warning. */
  perEpisodeWarnings: Array<{ episodeNumber: number; reasons: string[] }>;
  rawText: string;
}

/**
 * Tolerant mapping of an arbitrary breakdown-item-shaped value (either the
 * currently ACTIVE breakdown item — `VerticalDramaDisplayBreakdownItem` from
 * `getActiveBreakdownItemsForDisplay` — or one entry of the job result's
 * `improvedItems`) onto the shared `StoryScriptEpisodeInput` shape, so BOTH
 * comparison sides render through the exact same `formatStoryScriptEpisode`
 * for visual consistency. Returns `null` when `item` has no usable
 * `episodeNumber` — never throws.
 */
export function toStoryScriptEpisodeInput(item: unknown): StoryScriptEpisodeInput | null {
  if (!item || typeof item !== "object") return null;
  const episodeNumberRaw = (item as { episodeNumber?: unknown }).episodeNumber;
  const episodeNumber = typeof episodeNumberRaw === "number" ? episodeNumberRaw : NaN;
  if (!Number.isFinite(episodeNumber)) return null;
  const workingTitleRaw = (item as { workingTitle?: unknown }).workingTitle;
  const loglineRaw = (item as { logline?: unknown }).logline;
  const keyBeatsRaw = (item as { keyBeats?: unknown }).keyBeats;
  return {
    episodeNumber,
    workingTitle: typeof workingTitleRaw === "string" ? workingTitleRaw : "",
    logline: typeof loglineRaw === "string" ? loglineRaw : "",
    keyBeats: Array.isArray(keyBeatsRaw) ? keyBeatsRaw.filter((b): b is string => typeof b === "string") : [],
    shotDrafts: readDeepDraftShotDrafts(item),
    cliffhangerLine: readDeepDraftCliffhangerLine(item),
  };
}

export interface VerticalDramaImproveScriptCardProps {
  lang: VerticalDramaLang;
  seriesId: string;
  readOnly: boolean;
  /** Visibility gate — mirrors the caller's own `Boolean(deepDraftSummary)` ("visible when drafts exist"). Same prop the removed card used. */
  hasDrafts: boolean;
}

export function VerticalDramaImproveScriptCard({
  lang,
  seriesId,
  readOnly,
  hasDrafts,
}: VerticalDramaImproveScriptCardProps) {
  const utils = trpc.useUtils();

  // Same query key `VerticalDramaSeriesDetailPage.tsx`/`VerticalDramaArcReplanCard.tsx`
  // already use — TanStack Query dedupes this into a single network request.
  // `enabled: hasDrafts` — nothing to improve/show until a draft exists.
  const seriesQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId) && hasDrafts, staleTime: 15_000 },
  );

  const invalidateSeries = () => void utils.verticalDramaSeries.get.invalidate({ seriesId });

  /** The "what to improve" free-text request — edit-toggle pattern copied from `ManualDialogueEditShotForm`'s `isEditingThisShot` (this file's own sibling panel component): read-only text + pencil button -> editable textarea with Save/Cancel. */
  const [requestText, setRequestText] = useState(IMPROVE_SCRIPT_DEFAULT_REQUEST_TEXT);
  const [isEditingRequest, setIsEditingRequest] = useState(false);
  const [draftRequestText, setDraftRequestText] = useState(requestText);

  const startOpenEdit = () => {
    setDraftRequestText(requestText);
    setIsEditingRequest(true);
  };
  const cancelEdit = () => setIsEditingRequest(false);
  const saveEdit = () => {
    const trimmed = draftRequestText.trim();
    setRequestText(trimmed.length > 0 ? trimmed : IMPROVE_SCRIPT_DEFAULT_REQUEST_TEXT);
    setIsEditingRequest(false);
  };

  /**
   * Async story jobs (#28) — same submit -> poll pattern as
   * `VerticalDramaDeepStoryDraftsActions` (see its own `storyJobPoll` doc
   * comment); `startImproveScript` enqueues and returns `{jobId, deduped}`
   * immediately.
   */
  const [storyJobPoll, setStoryJobPoll] = useState<{
    jobId: string;
    progress: VerticalDramaStoryJobProgressLike | null;
  } | null>(null);
  const storyJobPollInFlightRef = useRef(false);
  const resumedStoryJobRef = useRef(false);

  /** The succeeded job's own id (needed by `confirmImproveScript`/`discardImproveScript`) alongside its result — `storyJobPoll` itself is cleared back to `null` once polling settles, so the id must be captured separately. */
  const [result, setResult] = useState<{ jobId: string; data: VerticalDramaImproveScriptJobResultLike } | null>(
    null,
  );

  const startMutation = trpc.verticalDramaSeries.startImproveScript.useMutation({
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.improveScriptError));
    },
  });

  const confirmMutation = trpc.verticalDramaSeries.confirmImproveScript.useMutation({
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.improveScriptConfirmError));
    },
  });

  const discardMutation = trpc.verticalDramaSeries.discardImproveScript.useMutation({
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.improveScriptDiscardError));
    },
  });

  /** Same query key `VerticalDramaDeepStoryDraftsActions` already uses — TanStack dedupes into ONE network request regardless of which component mounted first. */
  const activeStoryJobQuery = trpc.verticalDramaSeries.getActiveStoryJob.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId) && hasDrafts, staleTime: 15_000 },
  );

  async function pollStoryJob(jobId: string) {
    if (storyJobPollInFlightRef.current) return;
    storyJobPollInFlightRef.current = true;
    setStoryJobPoll({ jobId, progress: null });
    try {
      await pollVerticalDramaStoryJob({
        // `improve_script` now runs one full generation pass PER drafted
        // episode (was: one pass for the whole season) — a real 6-episode
        // run observed 2026-07-10 took ~11.5 minutes end-to-end (one
        // episode alone took ~2m49s after a provider 502 triggered a
        // fallback retry). The shared poll helper's default budget
        // (2500ms × 240 attempts = 10 minutes) was sized for the OLD
        // single-pass architecture and is too short here — the backend job
        // kept running and succeeded, but the frontend gave up first and
        // silently reset, discarding a fully successful result the user
        // never saw. Override to a per-episode-aware budget: up to
        // IMPROVE_SCRIPT_POLL_MAX_ATTEMPTS attempts, sized for a
        // worst-case ~6 min/episode (accounting for provider fallback
        // retries) across up to 6 drafted episodes, plus margin.
        maxAttempts: IMPROVE_SCRIPT_POLL_MAX_ATTEMPTS,
        fetchStatus: () => utils.verticalDramaSeries.getStoryJobStatus.fetch({ seriesId, jobId }),
        onProgress: (progress) => setStoryJobPoll({ jobId, progress }),
        onSucceeded: (data, kind: VerticalDramaStoryJobKind) => {
          if (kind !== "improve_script") {
            // Cross-kind dedupe race (see `VerticalDramaDeepStoryDraftsPanel.tsx`'s
            // own module header doc comment) — this series' active job
            // turned out to be a deep_generate/extend job, not ours. Never
            // misinterpret its result shape as our own.
            invalidateSeries();
            return;
          }
          setResult({ jobId, data: data as VerticalDramaImproveScriptJobResultLike });
        },
        onFailed: (error) => {
          toast.error(error || pickCopy(lang, verticalDramaCopy.improveScriptError));
        },
        onTimeout: () => toast.error(pickCopy(lang, verticalDramaCopy.storyJobTimeoutError)),
        onNotFound: () => toast.error(pickCopy(lang, verticalDramaCopy.storyJobTimeoutError)),
      });
    } finally {
      storyJobPollInFlightRef.current = false;
      setStoryJobPoll(null);
    }
  }

  /** Refresh-safe resume (#28) — mirrors `VerticalDramaDeepStoryDraftsActions`'s own resume effect, filtered to this card's one kind. */
  useEffect(() => {
    const active = activeStoryJobQuery.data;
    if (!active) return;
    if (active.kind !== "improve_script") return;
    if (resumedStoryJobRef.current || storyJobPollInFlightRef.current) return;
    resumedStoryJobRef.current = true;
    void pollStoryJob(active.jobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoryJobQuery.data]);

  if (!hasDrafts) return null;

  const isPolling = storyJobPoll !== null;
  const isSubmitting = startMutation.isPending || isPolling;

  const liveProgressText = isPolling
    ? storyJobPoll?.progress?.episodeIndex != null &&
      storyJobPoll?.progress?.episodeCount != null &&
      storyJobPoll?.progress?.attemptIndex != null &&
      storyJobPoll?.progress?.attemptCount != null &&
      storyJobPoll?.progress?.chunkIndex != null &&
      storyJobPoll?.progress?.chunkCount != null
      ? improveScriptEpisodeAttemptRoundProgressText(
          lang,
          storyJobPoll.progress.episodeIndex,
          storyJobPoll.progress.episodeCount,
          storyJobPoll.progress.attemptIndex,
          storyJobPoll.progress.attemptCount,
          storyJobPoll.progress.chunkIndex,
          storyJobPoll.progress.chunkCount,
        )
      : storyJobPoll?.progress?.episodeIndex != null &&
        storyJobPoll?.progress?.episodeCount != null &&
        storyJobPoll?.progress?.chunkIndex != null &&
        storyJobPoll?.progress?.chunkCount != null
        ? improveScriptEpisodeRoundProgressText(
            lang,
            storyJobPoll.progress.episodeIndex,
            storyJobPoll.progress.episodeCount,
            storyJobPoll.progress.chunkIndex,
            storyJobPoll.progress.chunkCount,
          )
        : storyJobPoll?.progress?.chunkIndex != null && storyJobPoll?.progress?.chunkCount != null
          ? improveScriptRoundProgressText(lang, storyJobPoll.progress.chunkIndex, storyJobPoll.progress.chunkCount)
          : pickCopy(lang, verticalDramaCopy.storyJobQueued)
    : null;

  const handleStart = async () => {
    try {
      const { jobId } = await startMutation.mutateAsync({
        seriesId,
        userRevisionRequest: requestText,
        idempotencyKey: crypto.randomUUID(),
      });
      await pollStoryJob(jobId);
    } catch {
      // Enqueue-level error toast already shown by startMutation's own onError.
    }
  };

  const handleConfirm = async () => {
    if (!result) return;
    try {
      const { updatedEpisodeNumbers } = await confirmMutation.mutateAsync({ seriesId, jobId: result.jobId });
      toast.success(improveScriptConfirmSuccessText(lang, updatedEpisodeNumbers.length));
      invalidateSeries();
      setResult(null);
    } catch {
      // Error toast already shown by confirmMutation's own onError.
    }
  };

  const handleDiscard = async () => {
    if (!result) return;
    try {
      await discardMutation.mutateAsync({ seriesId, jobId: result.jobId });
    } catch {
      // Error toast already shown by discardMutation's own onError.
    } finally {
      setResult(null);
    }
  };

  const activeBreakdown = getActiveBreakdownItemsForDisplay(
    (seriesQuery.data as { series?: { bible?: unknown } } | undefined)?.series?.bible,
  );
  const oldByEpisode = new Map(
    activeBreakdown.map((item) => [item.episodeNumber, toStoryScriptEpisodeInput(item)] as const),
  );
  const newByEpisode = new Map(
    (result?.data.improvedItems ?? []).map((item) => {
      const mapped = toStoryScriptEpisodeInput(item);
      return [mapped?.episodeNumber ?? -1, mapped] as const;
    }),
  );
  /**
   * Per-episode generation rewrite (2026-07-10) — `improvedItems` can now be
   * a SUBSET of `expectedEpisodeNumbers` (episodes that failed verification
   * keep their original content and are surfaced separately via the
   * partial-failure warning below, not as an empty diff row here). Iterate
   * the episode numbers actually present in `improvedItems` itself — each
   * entry carries its own `episodeNumber` — rather than assuming
   * `expectedEpisodeNumbers` alignment.
   */
  const improvedEpisodeNumbers = Array.from(newByEpisode.keys())
    .filter((episodeNumber) => episodeNumber !== -1)
    .sort((a, b) => a - b);

  return (
    <div className="grid gap-2 border-t border-border/60 pt-2" data-testid="vd-improve-script-card">
      <div className="grid gap-1.5" data-testid="vd-improve-script-request">
        <p className="text-xs font-medium text-muted-foreground">
          {pickCopy(lang, verticalDramaCopy.improveScriptRequestLabel)}
        </p>
        {isEditingRequest ? (
          <div className="grid gap-2">
            <Textarea
              value={draftRequestText}
              onChange={(e) => setDraftRequestText(e.target.value)}
              maxLength={IMPROVE_SCRIPT_REQUEST_MAX_LENGTH}
              className="min-h-[5rem] text-xs"
              data-testid="vd-improve-script-request-textarea"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
                data-testid="vd-improve-script-request-cancel"
              >
                {pickCopy(lang, verticalDramaCopy.improveScriptCancelCta)}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveEdit}
                data-testid="vd-improve-script-request-save"
              >
                {pickCopy(lang, verticalDramaCopy.improveScriptSaveCta)}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-muted/30 p-2">
            <p className="whitespace-pre-wrap text-xs text-muted-foreground" data-testid="vd-improve-script-request-text">
              {requestText}
            </p>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={pickCopy(lang, verticalDramaCopy.improveScriptEditCta)}
                onClick={startOpenEdit}
                data-testid="vd-improve-script-request-edit"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>

      {!readOnly && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-fit gap-2"
          disabled={isSubmitting || isEditingRequest || requestText.trim().length === 0}
          onClick={handleStart}
          data-testid="vd-improve-script-cta"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : null}
          {isSubmitting ? liveProgressText ?? pickCopy(lang, verticalDramaCopy.improveScriptRunning) : pickCopy(lang, verticalDramaCopy.improveScriptCta)}
        </Button>
      )}

      {liveProgressText && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground"
          data-testid="vd-improve-script-progress"
        >
          {liveProgressText}
        </p>
      )}

      {result && (
        <div className="grid gap-2 rounded-md border border-border/60 p-3" data-testid="vd-improve-script-result">
          {result.data.needsReview ? (
            <div
              className="grid gap-2 rounded-md border border-amber-400/60 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400"
              data-testid="vd-improve-script-needs-review"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                {pickCopy(lang, verticalDramaCopy.improveScriptNeedsReviewHeading)}
              </p>
              <ul className="list-inside list-disc" data-testid="vd-improve-script-needs-review-reasons">
                {result.data.needsReviewReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              <details data-testid="vd-improve-script-raw-text-toggle">
                <summary className="cursor-pointer underline-offset-2 hover:underline">
                  {pickCopy(lang, verticalDramaCopy.improveScriptRawTextToggle)}
                </summary>
                <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-[11px] text-foreground">
                  {result.data.rawText}
                </pre>
              </details>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={discardMutation.isPending}
                onClick={handleDiscard}
                data-testid="vd-improve-script-discard-cta"
              >
                {discardMutation.isPending && (
                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                )}
                {pickCopy(lang, verticalDramaCopy.improveScriptDiscardCta)}
              </Button>
            </div>
          ) : (
            <div className="grid gap-2" data-testid="vd-improve-script-comparison">
              {result.data.partialFailureEpisodeNumbers.length > 0 && (
                <div
                  className="grid gap-2 rounded-md border border-amber-400/60 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400"
                  data-testid="vd-improve-script-partial-failure-warning"
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    {improveScriptPartialFailureHeadingText(lang, result.data.partialFailureEpisodeNumbers.length)}
                  </p>
                  <ul className="list-inside list-disc" data-testid="vd-improve-script-partial-failure-reasons">
                    {result.data.perEpisodeWarnings.map((warning) => (
                      <li key={warning.episodeNumber}>
                        {improveScriptPartialFailureEpisodeReasonText(lang, warning.episodeNumber, warning.reasons)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.data.scoreSummary.trim().length > 0 && (
                <p className="text-xs text-muted-foreground" data-testid="vd-improve-script-score-summary">
                  <span className="font-medium">
                    {pickCopy(lang, verticalDramaCopy.improveScriptScoreSummaryLabel)}:
                  </span>{" "}
                  {result.data.scoreSummary}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={confirmMutation.isPending || discardMutation.isPending}
                  onClick={handleConfirm}
                  data-testid="vd-improve-script-confirm-cta"
                >
                  {confirmMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  )}
                  {pickCopy(lang, verticalDramaCopy.improveScriptConfirmCta)}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={confirmMutation.isPending || discardMutation.isPending}
                  onClick={handleDiscard}
                  data-testid="vd-improve-script-discard-cta"
                >
                  {discardMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  )}
                  {pickCopy(lang, verticalDramaCopy.improveScriptDiscardCta)}
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-md border">
                {improvedEpisodeNumbers.map((episodeNumber) => (
                  <ImproveScriptDiffRow
                    key={episodeNumber}
                    lang={lang}
                    episodeNumber={episodeNumber}
                    oldInput={oldByEpisode.get(episodeNumber) ?? undefined}
                    newInput={newByEpisode.get(episodeNumber) ?? undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components — two-column old/new comparison, structural pattern copied  */
/* from `VerticalDramaArcReplanCard.tsx`'s own `BreakdownDiffRow`/            */
/* `BreakdownDiffSide` (same `grid-cols-1 sm:grid-cols-2` layout), extended   */
/* with the full rendered script text (via `formatStoryScriptEpisode`)       */
/* instead of just title/logline/keyBeats.                                   */
/* -------------------------------------------------------------------------- */

function ImproveScriptDiffRow({
  lang,
  episodeNumber,
  oldInput,
  newInput,
}: {
  lang: VerticalDramaLang;
  episodeNumber: number;
  oldInput?: StoryScriptEpisodeInput | null;
  newInput?: StoryScriptEpisodeInput | null;
}) {
  return (
    <div className="border-b p-2.5 last:border-b-0" data-testid={`vd-improve-script-diff-row-${episodeNumber}`}>
      <p className="mb-1.5 text-xs font-semibold">
        {lang === "th" ? `ตอนที่ ${episodeNumber}` : `Episode ${episodeNumber}`}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ImproveScriptDiffSide
          lang={lang}
          label={pickCopy(lang, verticalDramaCopy.arcReplanOldPlanLabel)}
          input={oldInput}
        />
        <ImproveScriptDiffSide
          lang={lang}
          label={pickCopy(lang, verticalDramaCopy.arcReplanNewPlanLabel)}
          input={newInput}
        />
      </div>
    </div>
  );
}

function ImproveScriptDiffSide({
  lang,
  label,
  input,
}: {
  lang: VerticalDramaLang;
  label: string;
  input?: StoryScriptEpisodeInput | null;
}) {
  return (
    <div className="rounded-md bg-muted/30 p-2" role="group" aria-label={label}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {input ? (
        <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
          {formatStoryScriptEpisode(lang, input)}
        </pre>
      ) : (
        <p className="text-xs italic text-muted-foreground">-</p>
      )}
    </div>
  );
}
