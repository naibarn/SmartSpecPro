/**
 * VerticalDramaDeepStoryDraftsPanel (W10-C, spec feature 131 §F131T —
 * "Deep story drafts").
 *
 * Series-detail Overview surface, rendered inside `StoryBibleOverviewCard`
 * (`VerticalDramaSeriesDetailPage.tsx`). Two independently-usable pieces:
 *
 *  - `VerticalDramaDeepStoryDraftsActions` — the CONSOLIDATED primary action
 *    (spec addendum, added 2026-07-08) for the whole "Full story" card: ONE
 *    button that replaces the old separate "Generate story"/"Regenerate"
 *    button AND this component's own former standalone "generate deep
 *    drafts" CTA — killing the "which button do I press?" confusion of
 *    having two competing actions once a plan already exists. Its label and
 *    the confirm dialog both depend on the caller-supplied `hasPlan`:
 *      - `hasPlan: false` (no story bible plan yet) — label reads "generate
 *        full story + detailed drafts"; confirming ALWAYS chains the legacy
 *        `generateStoryBible` mutation (via the caller-supplied
 *        `onGenerateStoryBible`) followed by `generateStoryBibleDeep`, since
 *        the latter requires an active breakdown to already exist
 *        server-side — there is nothing to "keep" yet, so the dialog shows
 *        no scope choice.
 *      - `hasPlan: true` (a plan already exists) — label reads "update
 *        detailed story"; the SAME confirm dialog additionally shows a scope
 *        `RadioGroup`: the default "keep the current plot" scope calls
 *        `generateStoryBibleDeep` only (the pre-consolidation behavior,
 *        unchanged), while "rewrite everything" scope runs the same
 *        two-phase chain as the no-plan case.
 *    A phase-1 (`generateStoryBible`) failure aborts the chain before phase 2
 *    ever runs — its error toast already comes from the caller's own
 *    `onError` handler. A phase-2 (`generateStoryBibleDeep`) failure is
 *    always safe to simply retry (fresh idempotency key + a new append-only
 *    breakdown version each time), surfaced via this component's own
 *    existing deep-draft error toast. Once some episodes ARE deep-drafted,
 *    the pre-existing summary banner + secondary "extend by 5 more episodes"
 *    action render alongside the primary button, unchanged.
 *    Owns `generateStoryBibleDeep`/`extendStoryDraftHorizon` and invalidates
 *    `verticalDramaSeries.get` on success; the `generateStoryBible` mutation
 *    itself stays owned by the caller (see `onGenerateStoryBible` doc below).
 *  - `VerticalDramaDeepStoryDraftEpisodeDetail` — a PURE, prop-driven,
 *    read-only per-episode addendum (completeness badges + an expandable
 *    9-shot/dialogue viewer + the cliffhanger line), rendered only when the
 *    given breakdown item actually carries `shotDrafts`. Reuses the wizard's
 *    own "ผู้พูด: ข้อความ" dialogue-line visual language
 *    (`VerticalDramaProductionWizard.tsx`'s `DialoguePreviewLineRow`) and the
 *    native `<details>/<summary>` disclosure pattern it established.
 *
 * PROGRESSIVE DISCLOSURE: gated on the `verticalDramaSeriesDeepStoryDrafts`
 * flag entirely by the CALLER (conditional mounting in
 * `VerticalDramaSeriesDetailPage.tsx`, not an internal `flagEnabled` prop) —
 * mutation-owning components in this family (`VerticalDramaArcReplanCard.tsx`)
 * are gated the same way, unlike the hook-free `VerticalDramaSubShotEditor.tsx`.
 * This guarantees flag-off rendering is byte-identical: neither component
 * ever mounts, so their own hooks never fire.
 *
 * Both breakdown-item readers below are a CLIENT-SIDE MIRROR of the server's
 * own tolerant readers (`readItemShotDrafts`/`readItemCliffhangerLine`/
 * `readItemDraftCompleteness` in `server/services/verticalDramaStoryBible.ts`
 * — a server-only file, not importable from the client) — same shape,
 * mirrors `VerticalDramaArcReplanCard.tsx`'s own
 * `getActiveBreakdownItemsForDisplay` doc comment for why this duplication
 * exists. The horizon/chunk-size constants mirror that same file's
 * `VD_DEEP_DRAFT_*` constants — DISPLAY MATH ONLY; the server independently
 * resolves the real horizon and charges credits per actual chunk call.
 *
 * PREMIUM MULTI-ROUND DRAFTS (W11-B, added 2026-07-08) — surfaces the W11-A
 * `mode: "standard" | "premium"` server pipeline:
 *  - `VerticalDramaDeepStoryDraftsActions`'s confirm dialog gains a quality
 *    `RadioGroup`, rendered UNCONDITIONALLY (debt-item-5, 2026-07-08 —
 *    previously nested inside the `hasPlan &&` slot the scope radio
 *    occupies, so it was never offered at the no-plan bootstrap even though
 *    `runChain` — the chain `hasPlan: false` always uses — already threads
 *    `mode` into `generateStoryBibleDeep`'s input exactly like
 *    `runDeepDraftOnly` does). Applies uniformly to both scope choices
 *    (keep/rewrite) when `hasPlan` is true. DEFAULTS TO "premium" (changed
 *    2026-07-13, production-grade full-story generation upgrade — was
 *    "standard") and resets to "premium" every time the dialog (re)opens,
 *    exactly like `scope` resets to "keep".
 *    The separate "extend by N more" CTA has no confirm dialog to host a
 *    RadioGroup in, so it gets its own small, ordinary (non-auto-resetting)
 *    "use premium" checkbox instead (owner-approved simplification;
 *    unaffected by the 2026-07-13 default change above — it still defaults
 *    unchecked/"standard").
 *    `mode` is now ALWAYS sent explicitly on the mutation input (changed
 *    2026-07-13 — previously omitted entirely for "standard" to match the
 *    router's own `mode.optional()` + `?? "standard"` default convention;
 *    now sent explicitly so the user's actual choice is unambiguous
 *    regardless of what the router's own default resolves to).
 *  - `VerticalDramaDeepStoryDraftEpisodeDetail` gains a per-episode
 *    scorecard header badge + expandable below-floor dimension rows, read
 *    from the (optional) `draftScorecard` field W11-A's premium pipeline
 *    stamps onto a breakdown item. Absent for every standard-mode/legacy
 *    item, so this block simply never renders for them.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { VERTICAL_DRAMA_SILENCE_INTENTS } from "@shared/verticalDramaSeries/contentBudget";
import { VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK } from "@shared/verticalDramaSeries/assembly";
import {
  analyzeVerticalDramaLineSpeakability,
  estimateVerticalDramaSpeechSeconds,
  targetVerticalDramaSpeechSeconds,
  type VerticalDramaLineSpeakabilityCleaned,
} from "@shared/verticalDramaSeries/dialogueQuality";
// Format profiles (task #23, added 2026-07-08) — pure display only: resolves
// the series' length tier from the planned episode count this panel already
// has (`targetEpisodeCount`), purely to show an informational chip in the
// generate confirm dialog. No new queries, no server round-trip.
import { resolveVerticalDramaFormatProfile } from "@shared/verticalDramaSeries/formatProfiles";
import type { VerticalDramaDisplayBreakdownItem } from "./VerticalDramaArcReplanCard";
import {
  deepStoryDraftsCallRoundsText,
  deepStoryDraftsCliffhangerText,
  deepStoryDraftsDialogueLineText,
  deepStoryDraftsExtendCtaText,
  deepStoryDraftsFormatProfileChipText,
  deepStoryDraftsGeneratedSuccessText,
  deepStoryDraftsHorizonCountText,
  deepStoryDraftsModePremiumHintText,
  deepStoryDraftsNewCharactersCreatedText,
  deepStoryDraftsNewLocationsCreatedText,
  deepStoryDraftsPartialWarningText,
  deepStoryDraftsScopeKeepHintText,
  deepStoryDraftsScorecardBelowFloorDimText,
  deepStoryDraftsScorecardOverallBadgeText,
  deepStoryDraftsShotCharacterChipText,
  deepStoryDraftsShotLocationText,
  deepStoryDraftsShotSummaryLabel,
  deepStoryDraftsSilenceIntentLabel,
  deepStoryDraftsSpeechSecondsBadgeText,
  deepStoryDraftsSummaryText,
  manualDialogueEditLineGroupLabel,
  manualDialogueEditLiveSpeechSecondsText,
  manualDialogueEditSavedSuccessText,
  manualDialogueEditSavedWithWarningsText,
  manualDialogueEditViolationLabel,
  PREMIUM_DRAFT_SCORE_DIMENSIONS,
  pickCopy,
  verticalDramaCopy,
  /** Async story jobs (#28, added 2026-07-08) — submit -> poll progress copy, shared by generate/extend/improve_script. */
  storyJobProgressText,
  type VerticalDramaLang,
  type VerticalDramaPremiumDraftScoreDimension,
} from "./verticalDramaCopy";
/**
 * Task #22 (season-level product tie-in draft awareness, added 2026-07-09) —
 * own STANDALONE copy module (same reason `verticalDramaAdBannerCopy.ts` is
 * standalone — see that file's own header doc comment). Only the toast-
 * summary functions are needed here; calling either with this component's
 * own `lang` (typed `VerticalDramaLang`, itself `"th" | "en"`) works without
 * a cast since both modules' lang types are structurally identical.
 */
import {
  tieInDraftFullyReconciledText,
  tieInDraftMismatchSummaryText,
} from "./verticalDramaTieInDraftCopy";
/**
 * "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) — pulled out to its own
 * file (unlike the removed `VerticalDramaSeasonCritiqueCard`, which lived
 * inline here) since it has real sub-structure (edit-toggle request box,
 * needs-review fail-closed state, per-episode comparison list). Imports
 * `pollVerticalDramaStoryJob`/`VerticalDramaStoryJobKind`/
 * `VerticalDramaStoryJobProgressLike` back FROM this file (a deliberate,
 * narrow circular import — safe here since `pollVerticalDramaStoryJob` is a
 * hoisted `function` declaration, not a `const`/class, so it is fully bound
 * before either module's top-level code ever calls it) rather than this file
 * importing the card in one direction and the card importing the poll helper
 * in the other via some third shared module — see that file's own header
 * doc comment.
 */
import { VerticalDramaImproveScriptCard } from "./VerticalDramaImproveScriptCard";

/* -------------------------------------------------------------------------- */
/* Async story jobs (#28, added 2026-07-08) — submit -> poll                  */
/*                                                                            */
/* Mirrors `VerticalDramaEpisodePage.tsx`'s `pollVideoClipTask` convention    */
/* EXACTLY: fixed-interval poll (no backoff), a bounded attempt count,        */
/* imperative `utils.*.fetch()` (not a `useQuery` subscription) so this can   */
/* run inside an event handler / resume effect without a per-poll re-render.  */
/* Shared by `VerticalDramaDeepStoryDraftsActions` (deep_generate/extend) and */
/* `VerticalDramaImproveScriptCard` (improve_script, its own file) — the poll */
/* loop itself is 100% kind-agnostic; callers branch on the polled record's   */
/* OWN `kind` (not the kind they expected to submit) before interpreting      */
/* `result`, so a cross-kind dedupe race (this series already has a DIFFERENT */
/* kind of story job in flight — `enqueueVerticalDramaStoryJob` returns that  */
/* job's `jobId` instead of rejecting) never misinterprets a foreign job's    */
/* result shape as its own.                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `"improve_script"` (added 2026-07-10) — the "ปรับปรุงบทละครให้มีความสมบูรณ์"
 * job kind `VerticalDramaImproveScriptCard` submits via `startImproveScript`
 * (replaces the removed `"critique" | "apply_critique" | "quality_loop"`
 * flow). Polled through the exact same `pollVerticalDramaStoryJob` loop as
 * every other kind below; only that card branches on it (see its own
 * `pollStoryJob`'s `onSucceeded`/`onFailed`).
 */
export type VerticalDramaStoryJobKind = "deep_generate" | "extend" | "improve_script";

export interface VerticalDramaStoryJobProgressLike {
  /**
   * Feature 132 §5 (F132B, ledgers-and-story-state) — `"ledger"` is the new
   * `ledger_plan` job phase (runs after `"outline"`, before per-episode
   * `"draft"`ing) — see `services/verticalDramaStoryJobs.ts`'s
   * `VerticalDramaStoryJobProgressPhase` and `verticalDramaCopy.ts`'s
   * `storyJobProgressText` for the matching label branch.
   */
  phase: "outline" | "ledger" | "draft" | "review" | "fix" | "reading";
  chunkIndex?: number;
  chunkCount?: number;
  callsDone?: number;
  episodesDone?: number[];
  /**
   * Per-episode `improve_script` generation rewrite (2026-07-10) —
   * `episodeIndex` (1-based position of the CURRENT episode within this job)
   * and `episodeCount` (total drafted episodes in this job). Optional and
   * additive: absent for job kinds that don't process per-episode
   * (`deep_generate`/`extend`), and absent on an in-flight `improve_script`
   * job that was already running before this field was added — callers must
   * not assume presence, see `VerticalDramaImproveScriptCard.tsx`'s
   * `liveProgressText` fallback.
   */
  episodeIndex?: number;
  episodeCount?: number;
  /**
   * Retry-until-pass rewrite (2026-07-10) — `attemptIndex` (1-based current
   * retry attempt for the CURRENT episode) and `attemptCount` (total
   * attempts budgeted per episode,
   * `VD_IMPROVE_SCRIPT_MAX_ATTEMPTS_PER_EPISODE` = 3). Same additive-optional
   * pattern as `episodeIndex`/`episodeCount` above: absent for job kinds
   * that don't retry per-episode, and absent on an in-flight `improve_script`
   * job that was already running before this field was added — callers must
   * not assume presence, see `VerticalDramaImproveScriptCard.tsx`'s
   * `liveProgressText` fallback.
   */
  attemptIndex?: number;
  attemptCount?: number;
}

export interface VerticalDramaStoryJobStatusLike {
  kind: VerticalDramaStoryJobKind;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: VerticalDramaStoryJobProgressLike | null;
  result?: unknown;
  error?: string;
}

/** Default 2.5s interval — same cadence `pollVideoClipTask` uses. */
const STORY_JOB_POLL_INTERVAL_MS = 2500;
/**
 * 4320 attempts * 2.5s = 3 hours (raised from 30 minutes/720 attempts —
 * resilient-resume upgrade, 2026-07-14, see
 * `planning/vertical-drama-deep-story-resilient-resume/plan.md` item D) — now
 * matches `VerticalDramaImproveScriptCard.tsx`'s own `IMPROVE_SCRIPT_POLL_MAX_ATTEMPTS`
 * budget. The premium quality-loop (fan-out + LLM-judge + targeted-revise, now
 * the default mode for `deep_generate`/`extend`, see
 * `VerticalDramaDeepStoryDraftsActions`'s `mode` default below) budgets more
 * revise rounds (`VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS` 2 -> 4 server-side) and,
 * combined with the server-side incremental checkpoint + BullMQ auto-retry
 * (items A/C of the same plan), a run can legitimately span hours across
 * redeliveries/restarts without ever having actually failed. Applies to every
 * caller of `pollVerticalDramaStoryJob` that does not pass its own
 * `maxAttempts` (`deep_generate`/`extend` here AND the refresh-safe resume
 * effect below, which shares this same default) — `VerticalDramaImproveScriptCard.tsx`
 * passes its own explicit `maxAttempts` and is unaffected. Exhausting this
 * budget no longer means "stuck" — the job is very likely still running in
 * the background; `onTimeout` below reflects that with an info toast, not an
 * error one (the refresh-safe resume effect keeps re-attaching polling on
 * reload, and the server sends its own completion notification regardless).
 */
const STORY_JOB_POLL_MAX_ATTEMPTS = 4320;

export async function pollVerticalDramaStoryJob(args: {
  fetchStatus: () => Promise<VerticalDramaStoryJobStatusLike | null>;
  onProgress: (progress: VerticalDramaStoryJobProgressLike | null, kind: VerticalDramaStoryJobKind) => void;
  onSucceeded: (result: unknown, kind: VerticalDramaStoryJobKind) => void;
  onFailed: (error: string | undefined, kind: VerticalDramaStoryJobKind) => void;
  onTimeout: () => void;
  onNotFound?: () => void;
  intervalMs?: number;
  maxAttempts?: number;
}): Promise<void> {
  const intervalMs = args.intervalMs ?? STORY_JOB_POLL_INTERVAL_MS;
  const maxAttempts = args.maxAttempts ?? STORY_JOB_POLL_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const record = await args.fetchStatus();
    if (!record) {
      args.onNotFound?.();
      return;
    }
    if (record.status === "succeeded") {
      args.onSucceeded(record.result, record.kind);
      return;
    }
    if (record.status === "failed") {
      args.onFailed(record.error, record.kind);
      return;
    }
    args.onProgress(record.progress, record.kind);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  args.onTimeout();
}

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for direct unit testing)                            */
/* -------------------------------------------------------------------------- */

/** Every deep-drafted episode carries exactly this many numbered shots. */
const DEEP_DRAFT_SHOTS_PER_EPISODE = 9;

/** Mirror of the server's `VD_DEEP_DRAFT_EPISODES_PER_CALL` — display math only. */
export const DEEP_DRAFT_EPISODES_PER_CALL = 5;

/** Mirror of the server's `VD_DEEP_DRAFT_HORIZON_ALL_THRESHOLD` — display math only. */
const DEEP_DRAFT_HORIZON_ALL_THRESHOLD = 20;

/** Mirror of the server's `VD_DEEP_DRAFT_DEFAULT_HORIZON_FOR_LARGE_SERIES` — display math only. */
const DEEP_DRAFT_DEFAULT_HORIZON_FOR_LARGE_SERIES = 3;

/** Mirror of the server's `VD_DEEP_DRAFT_EXTEND_DEFAULT_EPISODES` — matches the "extend by 5" CTA copy. */
export const DEEP_DRAFT_EXTEND_DEFAULT_EPISODES = 5;

/**
 * Owner-reported fix (2026-07-08) — the extend CTA's label previously always
 * read a hardcoded "+5" regardless of how many episodes were actually left
 * (e.g. 9/10 drafted still showed "ขยายร่างอีก 5 ตอน" even though only 1
 * episode remained). This is the real number of episodes THIS extend click
 * will draft: `min(DEEP_DRAFT_EXTEND_DEFAULT_EPISODES, totalEpisodes -
 * horizonEndEpisode)`, never more than what's actually left. Display math
 * only — the mutation itself still sends the flat
 * `DEEP_DRAFT_EXTEND_DEFAULT_EPISODES` (the server already caps
 * `horizonEnd` at `totalEpisodes`, so the drafted outcome is identical
 * either way; only the label was wrong).
 */
export function computeDeepDraftExtendCount(totalEpisodes: number, horizonEndEpisode: number): number {
  return Math.max(0, Math.min(DEEP_DRAFT_EXTEND_DEFAULT_EPISODES, totalEpisodes - horizonEndEpisode));
}

const shotDialogueLineSchema = z
  .object({
    speaker: z.string().min(1),
    line: z.string().min(1),
    delivery: z.string().optional(),
  })
  .passthrough();

/** Task #22 (season-level product tie-in draft awareness, added 2026-07-09) — client-side mirror of the server's `shotDraftTieInSchema`. */
const shotDraftTieInSchema = z
  .object({
    has_product_moment: z.boolean(),
    benefit_line: z.string().optional(),
  })
  .passthrough();

/**
 * Production-grade full-story generation upgrade (2026-07-13, see
 * `planning/vertical-drama-full-story-production-grade/plan.md`'s "Data
 * contract") — client-side mirror of the server's per-shot `characters[]`
 * entry: `name`/`emotion` from the Character Bible, plus an optional
 * `emotion_after` when the shot shifts the character's emotion mid-shot.
 * `.passthrough()` (tolerant superset), same convention as every other
 * schema in this file.
 */
const shotDraftCharacterSchema = z
  .object({
    name: z.string().min(1),
    emotion: z.string().min(1),
    emotion_after: z.string().optional(),
  })
  .passthrough();

const shotDraftSchema = z
  .object({
    shot_number: z.number().int().min(1).max(DEEP_DRAFT_SHOTS_PER_EPISODE),
    summary: z.string().min(1),
    dialogue_lines: z.array(shotDialogueLineSchema).default([]),
    silence_intent: z.enum(VERTICAL_DRAMA_SILENCE_INTENTS).optional(),
    /** Task #22 — see `shotDraftTieInSchema`'s own doc comment. */
    tie_in: shotDraftTieInSchema.optional(),
    /**
     * Production-grade full-story generation upgrade (2026-07-13) —
     * required server-side for NEW generations (min 1 character per shot,
     * names from the Character Bible), but OPTIONAL here: drafts stored
     * before this field existed predate it entirely, and this schema is the
     * tolerant client-side READ path for both old and new data (see
     * `readDeepDraftShotDrafts`'s own doc comment on tolerant reads).
     */
    characters: z.array(shotDraftCharacterSchema).optional(),
    /**
     * Production-grade full-story generation upgrade (2026-07-13) — the
     * shot's location slug, matching either an existing
     * `vertical_drama_locations` row or one declared via this run's
     * `new_locations` (server-persisted; see `deepStoryDraftsNewLocationsCreatedText`
     * for how the client surfaces that count). Optional for the same
     * old-draft-tolerance reason as `characters` above.
     */
    location_key: z.string().optional(),
  })
  .passthrough();

const shotDraftArraySchema = z.array(shotDraftSchema).length(DEEP_DRAFT_SHOTS_PER_EPISODE);

const draftCompletenessSchema = z
  .object({
    dialogueEveryShot: z.boolean(),
    allSpeakable: z.boolean(),
    estimatedSpeechSeconds: z.number().nonnegative(),
    coverageStatus: z.enum(["ok", "warning", "error"]),
  })
  .passthrough();

/**
 * Client-side mirror of the server's `draftScorecardSchema`
 * (`verticalDramaStoryBible.ts`) — same shape (the 14
 * `PREMIUM_DRAFT_SCORE_DIMENSIONS`, each 1-5, plus `overall` 1-5 and
 * `judgedAtRound`), `.passthrough()` (tolerant superset). `shot_completeness`
 * and `dialogue_accessibility` are `.optional()` here so a legacy scorecard
 * persisted before the 2026-07-13 upgrade (which lacks them) still parses —
 * matching the server's own optional read of these two dimensions.
 */
const draftScorecardSchema = z
  .object({
    hook_strength: z.number().min(1).max(5),
    reversal_sharpness: z.number().min(1).max(5),
    emotion_variety: z.number().min(1).max(5),
    dialogue_naturalness: z.number().min(1).max(5),
    pacing: z.number().min(1).max(5),
    cliffhanger_strength: z.number().min(1).max(5),
    continuity_with_recap: z.number().min(1).max(5),
    season_cohesion: z.number().min(1).max(5),
    clarity: z.number().min(1).max(5).optional(),
    character_consistency: z.number().min(1).max(5).optional(),
    evidence_payoff: z.number().min(1).max(5).optional(),
    threat_escalation: z.number().min(1).max(5).optional(),
    shot_completeness: z.number().min(1).max(5).optional(),
    dialogue_accessibility: z.number().min(1).max(5).optional(),
    overall: z.number().min(1).max(5),
    judgedAtRound: z.number().int().nonnegative(),
  })
  .passthrough();

export type VerticalDramaDeepDraftShotDialogueLine = z.infer<typeof shotDialogueLineSchema>;
/** Production-grade full-story generation upgrade (2026-07-13) — see `shotDraftCharacterSchema`'s own doc comment. */
export type VerticalDramaDeepDraftShotCharacter = z.infer<typeof shotDraftCharacterSchema>;
export type VerticalDramaDeepDraftShotDraft = z.infer<typeof shotDraftSchema>;
export type VerticalDramaDeepDraftCompleteness = z.infer<typeof draftCompletenessSchema>;
export type VerticalDramaDeepDraftCoverageStatus = VerticalDramaDeepDraftCompleteness["coverageStatus"];
export type VerticalDramaDeepDraftScorecard = z.infer<typeof draftScorecardSchema>;

/** Mirror of the server's `VD_PREMIUM_DRAFT_MIN_OVERALL` — display math only (scorecard badge coloring floor). */
const PREMIUM_DRAFT_MIN_OVERALL = 4;
/** Mirror of the server's `VD_PREMIUM_DRAFT_MIN_DIMENSION` — display math only (badge coloring + below-floor filter). */
const PREMIUM_DRAFT_MIN_DIMENSION = 3;

/** Series `get`/`list` payload's `deepDraftSummary` (additive, `null` when no episode has drafts yet). */
export interface VerticalDramaDeepDraftSummary {
  horizonEndEpisode: number;
  episodesWithDrafts: number;
  totalEpisodes: number;
  /** Premium multi-round drafts (W11-A/W11-B) — present (`true`) ONLY when the active version's deep draft used `mode: "premium"`; never `false`, omitted otherwise. */
  premium?: true;
}

/**
 * Tolerant read of a breakdown item's `shotDrafts` — returns `null` when
 * absent or malformed (a legacy item, or one this run's horizon never
 * covered), never throws. Client-side mirror of the server's
 * `readItemShotDrafts` (see module header).
 */
export function readDeepDraftShotDrafts(item: unknown): VerticalDramaDeepDraftShotDraft[] | null {
  const raw = (item as { shotDrafts?: unknown } | null | undefined)?.shotDrafts;
  if (raw === undefined || raw === null) return null;
  const parsed = shotDraftArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Tolerant read of a breakdown item's `cliffhanger_line`. Mirrors the server's `readItemCliffhangerLine`. */
export function readDeepDraftCliffhangerLine(item: unknown): string | undefined {
  const raw = (item as { cliffhanger_line?: unknown } | null | undefined)?.cliffhanger_line;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

/** Tolerant read of a breakdown item's `draftCompleteness`. Mirrors the server's `readItemDraftCompleteness`. */
export function readDeepDraftCompleteness(item: unknown): VerticalDramaDeepDraftCompleteness | null {
  const raw = (item as { draftCompleteness?: unknown } | null | undefined)?.draftCompleteness;
  if (raw === undefined || raw === null) return null;
  const parsed = draftCompletenessSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Tolerant read of a breakdown item's `draftScorecard` (W11-A premium
 * multi-round drafts) — returns `null` when absent or malformed, never
 * throws. Client-side mirror of the server's `readItemDraftScorecard`.
 */
export function readDeepDraftScorecard(item: unknown): VerticalDramaDeepDraftScorecard | null {
  const raw = (item as { draftScorecard?: unknown } | null | undefined)?.draftScorecard;
  if (raw === undefined || raw === null) return null;
  const parsed = draftScorecardSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/* -------------------------------------------------------------------------- */
/* Manual dialogue edits (W10.5, added 2026-07-08) — inline per-shot editor   */
/* inside `VerticalDramaDeepStoryDraftEpisodeDetail`, wired to the shipped     */
/* `updateEpisodeDraftDialogue` mutation. Pure helpers first (exported for     */
/* direct unit testing, mirroring this file's own convention), the editor's    */
/* presentational sub-component + the mutation-owning parent further below.    */
/* -------------------------------------------------------------------------- */

/** Mirrors the server's `VD_MANUAL_DIALOGUE_EDIT_MAX_LINES`/`updateEpisodeDraftDialogueInput`'s `lines.max(8)` — a literal, not an import, since `verticalDramaStoryBible.ts` is a server-only file (not importable from the client). */
export const MANUAL_DIALOGUE_EDIT_MAX_LINES = 8;
/** Mirrors the server's `VD_MANUAL_DIALOGUE_EDIT_SPEAKER_MAX_LENGTH` — soft `maxLength` guardrail on the speaker input (the server independently enforces the same limit). */
const MANUAL_DIALOGUE_EDIT_SPEAKER_MAX_LENGTH = 60;
/** Mirrors the server's `VD_MANUAL_DIALOGUE_EDIT_LINE_MAX_LENGTH`. */
const MANUAL_DIALOGUE_EDIT_LINE_MAX_LENGTH = 300;
/** Mirrors the server's `VD_MANUAL_DIALOGUE_EDIT_DELIVERY_MAX_LENGTH`. */
const MANUAL_DIALOGUE_EDIT_DELIVERY_MAX_LENGTH = 120;

const manualDialogueEditStampSchema = z
  .object({
    shotNumbers: z.array(z.number().int().min(1).max(DEEP_DRAFT_SHOTS_PER_EPISODE)),
  })
  .passthrough();

/**
 * Tolerant read of a breakdown item's `manualDialogueEdit.shotNumbers` (W10.5)
 * — mirrors `readDeepDraftScorecard`/`readDeepDraftCompleteness`'s "never
 * throw" shape, returning `[]` (rather than `null`) since every call site
 * only ever needs `.includes(shotNumber)` for the "แก้แล้ว" badge. Client-side
 * mirror of the server's `readItemManualDialogueEdit`.
 */
export function readDeepDraftManualDialogueEditShotNumbers(item: unknown): number[] {
  const raw = (item as { manualDialogueEdit?: unknown } | null | undefined)?.manualDialogueEdit;
  if (raw === undefined || raw === null) return [];
  const parsed = manualDialogueEditStampSchema.safeParse(raw);
  return parsed.success ? parsed.data.shotNumbers : [];
}

/**
 * Tolerant read of a breakdown item's `manualSummaryEdit.shotNumbers` (added
 * 2026-07-22) — same "never throw", `[]`-fallback shape as
 * `readDeepDraftManualDialogueEditShotNumbers` immediately above, over the
 * sibling `manualSummaryEdit` stamp field the server writes whenever the
 * combined `updateEpisodeDraftShot` mutation's `summary` was included (same
 * `{ shotNumbers, ... }` shape, so this intentionally reuses
 * `manualDialogueEditStampSchema` rather than duplicating an identical zod
 * object). Client-side mirror of the server's `readItemManualSummaryEdit`.
 * Unioned with `readDeepDraftManualDialogueEditShotNumbers`'s own result into
 * the single "แก้ไขแล้ว" edited badge (see `isEdited` below) — the badge does
 * not distinguish which field(s) were edited.
 */
export function readDeepDraftManualSummaryEditShotNumbers(item: unknown): number[] {
  const raw = (item as { manualSummaryEdit?: unknown } | null | undefined)?.manualSummaryEdit;
  if (raw === undefined || raw === null) return [];
  const parsed = manualDialogueEditStampSchema.safeParse(raw);
  return parsed.success ? parsed.data.shotNumbers : [];
}

/**
 * Per-shot duration for the live speech-seconds chip — derived the SAME way
 * the read-only completeness badge's own source data does server-side
 * (`computeDraftCompleteness` in `verticalDramaStoryBible.ts`, a server-only
 * file): index into the canonical 60s/9-shot
 * `VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.shotDurationsSeconds` fallback
 * profile by `shotNumber`, clamped to the array's bounds. Never a second
 * duration model — this IS the one the badge's own numbers already trace
 * back to.
 */
export function resolveManualDialogueEditShotDurationSeconds(shotNumber: number): number {
  const durations = VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.shotDurationsSeconds;
  const index = Math.min(Math.max(shotNumber - 1, 0), durations.length - 1);
  return durations[index] ?? 0;
}

/**
 * "ok"/"warning"/"error" classification for the live, unsaved per-shot
 * speech-seconds chip — reuses the SAME `VerticalDramaDeepDraftCoverageStatus`
 * 3-state + `COVERAGE_TEXT_CLASSES`/`COVERAGE_ICON`/`deepStoryDraftsCoverage*`
 * copy the read-only completeness badge below already defines (never a
 * second color/copy system): `live >= target` reads "on target" (matches the
 * "ครอบคลุมตามเป้า" copy literally), `live` at least half of `target` reads
 * "below target", anything less reads "well below target". `targetSeconds
 * <= 0` (a malformed/zero shot duration) always reads "ok" — nothing to
 * fall short of.
 */
export function classifyManualDialogueEditLiveSpeechCoverage(
  liveSeconds: number,
  targetSeconds: number,
): VerticalDramaDeepDraftCoverageStatus {
  if (targetSeconds <= 0) return "ok";
  const ratio = liveSeconds / targetSeconds;
  if (ratio >= 1) return "ok";
  if (ratio >= 0.5) return "warning";
  return "error";
}

/** One editable dialogue line row's LIVE (not-yet-saved) draft state — plain strings so a mid-edit blank speaker/delivery is representable (the mutation input below omits either when blank, matching the server's own optional-field convention). */
export type ManualDialogueEditDraftLine = {
  speaker: string;
  line: string;
  delivery: string;
};

/** `updateEpisodeDraftDialogue`'s per-line mutation input shape — a client-local mirror of the router's `updateEpisodeDraftDialogueLineInput` (a server-only file's zod schema, not importable from the client). */
export type ManualDialogueEditLineInput = {
  speaker?: string;
  line: string;
  delivery?: string;
};

/** Seeds a shot's stored `dialogue_lines` into editable draft-line rows (blank speaker/delivery become `""`, never `undefined`, so every field is always a controlled input value). */
export function toManualDialogueEditDraftLines(
  lines: VerticalDramaDeepDraftShotDialogueLine[],
): ManualDialogueEditDraftLine[] {
  return lines.map((line) => ({
    speaker: line.speaker ?? "",
    line: line.line,
    delivery: line.delivery ?? "",
  }));
}

/** Trims a draft row into the mutation's per-line input shape — a blank (post-trim) speaker/delivery is omitted entirely rather than sent as `""`, matching the server's own optional-field convention. */
export function toManualDialogueEditLineInput(row: ManualDialogueEditDraftLine): ManualDialogueEditLineInput {
  const speaker = row.speaker.trim();
  const line = row.line.trim();
  const delivery = row.delivery.trim();
  return {
    ...(speaker ? { speaker } : {}),
    line,
    ...(delivery ? { delivery } : {}),
  };
}

/**
 * True when `current` draft lines differ from `original` in any way that
 * would produce a different `updateEpisodeDraftShot` `lines` payload —
 * compares the same trimmed/normalized shape `toManualDialogueEditLineInput`
 * produces (so a trailing-whitespace-only edit doesn't count as "changed"),
 * plus row count (added/removed rows). Used by the combined shot editor
 * (Save-button disable + payload build) to decide whether `lines` should be
 * included in the mutation at all (2026-07-22, combined summary+dialogue
 * editor).
 */
export function manualShotEditLinesChanged(
  current: ManualDialogueEditDraftLine[],
  original: ManualDialogueEditDraftLine[],
): boolean {
  if (current.length !== original.length) return true;
  return (
    JSON.stringify(current.map(toManualDialogueEditLineInput)) !==
    JSON.stringify(original.map(toManualDialogueEditLineInput))
  );
}

/**
 * Default deep-draft horizon for DISPLAY purposes only — large-series no-op
 * fix (2026-07-14, see
 * `planning/vertical-drama-deep-draft-update-all-noop/plan.md`): the primary
 * CTA now always passes `horizonEpisodes: totalEpisodes` (see
 * `runDeepDraftOnly`/`runChain` below), so it drafts ALL episodes regardless
 * of series size — this preview must mirror that, always returning
 * `safeTotalEpisodes` with no large-series cap. (Previously capped at
 * `DEEP_DRAFT_DEFAULT_HORIZON_FOR_LARGE_SERIES` for series above
 * `DEEP_DRAFT_HORIZON_ALL_THRESHOLD`, which made this preview — and the real
 * mutation, before this fix — silently stop at 3 episodes forever on large
 * series.) The real horizon is still resolved and enforced server-side; this
 * is only used to preview "how many episodes will be drafted" in the confirm
 * dialog before the mutation is sent.
 */
export function computeDeepDraftDisplayHorizon(totalEpisodes: number): number {
  return Math.max(0, Math.floor(totalEpisodes || 0));
}

/** `ceil(horizonEpisodes / DEEP_DRAFT_EPISODES_PER_CALL)` — display math only. */
export function computeDeepDraftCallRounds(horizonEpisodes: number): number {
  if (horizonEpisodes <= 0) return 0;
  return Math.ceil(horizonEpisodes / DEEP_DRAFT_EPISODES_PER_CALL);
}

/** Total episodes actually drafted in ONE run — the correct "{n}" for the success toast (not the cumulative `horizonEndEpisode`). */
export function sumDeepDraftChunkSizes(chunkSizes: number[] | null | undefined): number {
  if (!chunkSizes || chunkSizes.length === 0) return 0;
  return chunkSizes.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
}

/**
 * Production-grade full-story generation upgrade (2026-07-13) — tolerant
 * read of a `generateStoryBibleDeep`/`extendStoryDraftHorizon` job result's
 * new-location count, appended to the success toast via
 * `deepStoryDraftsNewLocationsCreatedText`. The backend persists a chunk's
 * `new_locations` (this run's Data Contract, see
 * `planning/vertical-drama-full-story-production-grade/plan.md`) into
 * `vertical_drama_locations` via `verticalDramaLocationReconciliation.ts`'s
 * `createdLocations`/`reusedLocations` upsert shape. The job result exposes
 * this as a numeric `createdLocationCount` (the server's
 * `GenerateStoryBibleDeepResult`/job-result field); this reads it
 * defensively and also tolerates a legacy `createdLocations` array shape, so
 * an older/not-yet-updated result simply has neither field and this returns
 * `0` (never throws, never a hard failure) — mirrors this file's own
 * "never throw" tolerant-read convention (`readDeepDraftShotDrafts` et al.).
 */
export function resolveDeepDraftCreatedLocationsCount(result: unknown): number {
  const record = result as
    | { createdLocationCount?: unknown; createdLocations?: unknown }
    | null
    | undefined;
  const count = record?.createdLocationCount;
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    return Math.floor(count);
  }
  const raw = record?.createdLocations;
  return Array.isArray(raw) ? raw.length : 0;
}

/**
 * Set B (`vd-stuck-generation-and-lost-characters` plan, 2026-07-16) —
 * tolerant read of a `generateStoryBibleDeep`/`extendStoryDraftHorizon` job
 * result's `createdCharacters: { count, names }` field (server's
 * `VdDeepDraftCreatedCharactersSummary`, `verticalDramaSeries.ts`) — the
 * story-introduced dialogue speakers/shot characters
 * `ensureRosterCharactersFromStory` auto-registered this run, each landing
 * with `needsSetup: true` (no DNA/portrait yet). Mirrors
 * `resolveDeepDraftCreatedLocationsCount`'s own "never throw" tolerant-read
 * convention — an older/not-yet-updated result simply has no
 * `createdCharacters` field and this returns `{ count: 0, names: [] }`
 * rather than throwing.
 */
export function resolveDeepDraftCreatedCharactersSummary(
  result: unknown
): { count: number; names: string[] } {
  const record = result as
    | { createdCharacters?: { count?: unknown; names?: unknown } }
    | null
    | undefined;
  const raw = record?.createdCharacters;
  const count =
    typeof raw?.count === "number" && Number.isFinite(raw.count) && raw.count > 0
      ? Math.floor(raw.count)
      : 0;
  const names = Array.isArray(raw?.names)
    ? raw.names.filter((n): n is string => typeof n === "string")
    : [];
  return { count, names };
}

/**
 * Mirror of the server's `estimatePremiumDeepDraftCalls`
 * (`chunkCount*10+2` — `verticalDramaStoryBible.ts`) — DISPLAY MATH ONLY; the
 * server independently deducts real credits per actual call made
 * (`deductPremiumCall`), never from this estimate. Kept in sync with the
 * server's `4/chunk -> 10/chunk` bump (production-grade full-story
 * generation, 2026-07-13) so the pre-check estimate shown here never
 * under-states what the server's `hasEnoughCredits` gate actually requires.
 */
export function computePremiumDeepDraftCallEstimate(chunkCount: number): number {
  return Math.max(0, chunkCount) * 10 + 2;
}

/**
 * Every dimension scoring below `VD_PREMIUM_DRAFT_MIN_DIMENSION` (mirrors
 * the server's per-dimension half of `meetsPremiumDraftFloor`), in canonical
 * `PREMIUM_DRAFT_SCORE_DIMENSIONS` order — the "จุดที่ยังต่ำ" rows source.
 */
export function selectBelowFloorPremiumDimensions(
  scorecard: VerticalDramaDeepDraftScorecard,
): Array<{ dimension: VerticalDramaPremiumDraftScoreDimension; score: number }> {
  // A dimension absent from a legacy scorecard (the six added after the
  // original 8 are `.optional()` in `draftScorecardSchema`) is simply not
  // judged below-floor — never crash on `undefined < n`, never surface a
  // phantom "0" row.
  const below: Array<{
    dimension: VerticalDramaPremiumDraftScoreDimension;
    score: number;
  }> = [];
  for (const dimension of PREMIUM_DRAFT_SCORE_DIMENSIONS) {
    const score = scorecard[dimension];
    if (typeof score === "number" && score < PREMIUM_DRAFT_MIN_DIMENSION) {
      below.push({ dimension, score });
    }
  }
  return below;
}

/**
 * `"ok" | "warning" | "error"` classification for the scorecard header
 * badge — reuses the SAME 3-state palette `COVERAGE_TEXT_CLASSES`/
 * `COVERAGE_ICON` already define below (emerald/amber/destructive,
 * text+icon always accompanies color, never color-only): `overall >= 4` is
 * "ok", `3` up to `3.9` is "warning", below `3` is "error" (owner-approved
 * coloring — mirrors the server's `VD_PREMIUM_DRAFT_MIN_OVERALL`/
 * `VD_PREMIUM_DRAFT_MIN_DIMENSION` floors).
 */
export function classifyPremiumOverallScore(overall: number): VerticalDramaDeepDraftCoverageStatus {
  if (overall >= PREMIUM_DRAFT_MIN_OVERALL) return "ok";
  if (overall >= PREMIUM_DRAFT_MIN_DIMENSION) return "warning";
  return "error";
}

/**
 * Shared card treatment for BOTH confirm-dialog radio groups (scope + mode)
 * — owner-reported fix (2026-07-08, screenshot review): the previous
 * per-item markup left each `RadioGroupItem` looking inconsistent (one
 * option read as square/checkbox-like, the other circular) with a nearly
 * invisible selected state and no visible selection on open. Every option
 * now shares ONE card: the whole card is clickable (native `<label
 * htmlFor>` activation of the `RadioGroupItem` button — a button is a
 * labelable element), a strong `border-primary`/`bg-primary/5` + bold-title
 * treatment while selected, a plain bordered/hoverable card otherwise, and a
 * focus-visible ring around the WHOLE card (not just the small indicator)
 * via `has-[:focus-visible]` — mirrors the same "ring wrapper around a
 * focusable control" convention `packages/ui/input-group.tsx` already uses.
 */
function DeepDraftRadioCard({
  id,
  value,
  checked,
  ariaLabel,
  title,
  hint,
}: {
  id: string;
  value: string;
  checked: boolean;
  ariaLabel: string;
  title: string;
  hint: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg p-3 text-sm transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
        checked
          ? "border-2 border-primary bg-primary/5"
          : "border border-border bg-background hover:bg-accent/50"
      )}
    >
      <RadioGroupItem
        value={value}
        id={id}
        aria-label={ariaLabel}
        className="size-4 shrink-0"
      />
      <span className="grid gap-0.5">
        <span className={cn(checked && "font-medium")}>{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* VerticalDramaDeepStoryDraftsActions — consolidated primary action,        */
/* confirm dialog + scope choice, and the unchanged extend CTA               */
/* -------------------------------------------------------------------------- */

/**
 * Scope choice inside the confirm dialog — only ever read when `hasPlan` is
 * true (see `VerticalDramaDeepStoryDraftsActionsProps.hasPlan` doc). When no
 * plan exists yet there is nothing to "keep", so the chain always runs.
 */
type VerticalDramaDeepDraftScope = "keep" | "rewrite";

/**
 * Quality-mode choice (W11-B) inside the confirm dialog — client-local
 * mirror of the server's `VerticalDramaDeepStoryDraftMode` (W11-A
 * `routers/verticalDramaSeries.ts`). Rendered unconditionally (debt-item-5,
 * 2026-07-08 — see module header doc comment), applies uniformly whether or
 * not `hasPlan` is true, and — when it IS true — uniformly to both `scope`
 * values too; resets to `"standard"` every time the dialog (re)opens, same
 * as `scope`.
 */
type VerticalDramaDeepStoryDraftMode = "standard" | "premium";

/**
 * Which half of the client-side `generateStoryBible` → `generateStoryBibleDeep`
 * chain is currently in flight — drives the outer primary button's progress
 * copy. `null` outside a chained run, including the single-call "keep" scope
 * path (which reads `generateMutation.isPending` directly instead).
 */
type VerticalDramaDeepDraftChainPhase = "story" | "deep" | null;

export interface VerticalDramaDeepStoryDraftsActionsProps {
  lang: VerticalDramaLang;
  seriesId: string;
  readOnly: boolean;
  targetEpisodeCount?: number | null;
  deepDraftSummary?: VerticalDramaDeepDraftSummary | null;
  /**
   * Whether a story bible/episode-breakdown plan already exists
   * (`StoryBibleOverviewCard`'s `hasStory`). Controls the primary button's
   * label ("generate full + detailed" vs "update detailed"), whether the
   * confirm dialog shows the scope `RadioGroup`, and whether confirming runs
   * the deep-draft call alone or the full two-phase chain. `false` always
   * chains — `generateStoryBibleDeep` requires an active breakdown to
   * already exist server-side, so there is nothing to draft yet on its own.
   */
  hasPlan: boolean;
  /**
   * Runs the legacy `generateStoryBible` mutation to completion — resolves
   * on success, throws on failure. Owned by the caller
   * (`StoryBibleOverviewCard`) since it already owns that mutation plus its
   * "materialize the plan into real episode rows" + credits-used toast side
   * effects; this component only needs to know when phase 1 has settled so
   * it can sequence its own `generateStoryBibleDeep` call after it. The
   * caller's own `onError` handler already surfaces the phase-1 error toast,
   * so this component does not need the rejection reason.
   */
  onGenerateStoryBible: () => Promise<void>;
  /**
   * Feature 132 §4.4 (F132A) — the series' active "โจทย์เรื่องที่อยากได้"
   * (`series.bible.userPremise`), sourced by the parent
   * (`VerticalDramaSeriesDetailPage.tsx`). Display-only here: renders a
   * collapsed/truncated read-only preview + an edit-affordance link to
   * series settings, ahead of the primary generate/update action, only when
   * non-empty. Undefined/empty renders nothing.
   */
  userPremise?: string;
  /**
   * Edit-affordance callback for the premise preview above — navigates to
   * series settings (this component builds no new settings UI itself).
   * Omitted/undefined simply renders the preview without a clickable link.
   */
  onEditPremiseClick?: () => void;
  /**
   * Whether this series is a lineage series — a sequel or special edition
   * (`createMode === "sequel" | "special_edition"`, equivalently
   * `parentSeriesId != null`) — sourced by the parent
   * (`VerticalDramaSeriesDetailPage.tsx`) from the `get` query's raw row.
   * Drives ONLY the extend flow's `extendPremium` checkbox initial value —
   * mirrors the server's own sequel-aware default in
   * `extendStoryDraftHorizon` (`routers/verticalDramaSeries.ts`), so the
   * checkbox reflects what actually runs instead of always starting
   * unchecked while the server silently defaults to premium underneath it.
   * Optional, defaults to `false` — every other call site (and the
   * `hasPlan={false}` "no plan yet" call site, which never renders the
   * extend control at all) is unaffected.
   */
  isLineageSeries?: boolean;
}

export function VerticalDramaDeepStoryDraftsActions({
  lang,
  seriesId,
  readOnly,
  targetEpisodeCount,
  deepDraftSummary,
  hasPlan,
  onGenerateStoryBible,
  userPremise,
  onEditPremiseClick,
  isLineageSeries = false,
}: VerticalDramaDeepStoryDraftsActionsProps) {
  const utils = trpc.useUtils();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scope, setScope] = useState<VerticalDramaDeepDraftScope>("keep");
  // Production-grade full-story generation upgrade (2026-07-13) — defaults
  // to "premium" (was "standard"): the quality-loop pipeline (fan-out +
  // LLM-judge + targeted-revise) is now the recommended default for this
  // CTA; the user can still switch back to "standard" in the mode picker
  // below. Resets to "premium" every time the dialog (re)opens, same as
  // `scope` resets to "keep" — see `openConfirmDialog`.
  const [mode, setMode] = useState<VerticalDramaDeepStoryDraftMode>("premium");
  // Extend has no confirm dialog to reset on (re)open, so this is an
  // ordinary, non-auto-resetting checkbox — see module header doc comment.
  // Initial value mirrors the server's own sequel-aware default
  // (`extendStoryDraftHorizon`'s `input.mode ?? (row.parentSeriesId != null
  // ? "premium" : "standard")`) via `isLineageSeries` — see that prop's doc
  // comment. Once mounted the user's own toggling always wins; this only
  // sets what the checkbox shows the FIRST time.
  const [extendPremium, setExtendPremium] = useState(isLineageSeries);
  const [chainPhase, setChainPhase] = useState<VerticalDramaDeepDraftChainPhase>(null);
  // Transient — `partial` is only ever returned once, from the mutation
  // response itself; it is never persisted server-side. `null` clears the
  // banner once a later (non-partial) run completes.
  const [partialHorizonEndEpisode, setPartialHorizonEndEpisode] = useState<number | null>(null);

  const invalidateSeries = () => void utils.verticalDramaSeries.get.invalidate({ seriesId });

  /**
   * Async story jobs (#28, added 2026-07-08) — `generateStoryBibleDeep`/
   * `extendStoryDraftHorizon` now enqueue and return `{ jobId, deduped }`
   * immediately; `storyJobPoll` tracks the in-flight poll (jobId/kind/latest
   * progress) for THIS component's own submissions AND a resumed job picked
   * up on mount. `storyJobPollInFlightRef` guards against a double poll loop
   * (double-click, or a resume racing a fresh submit) — mirrors
   * `VerticalDramaEpisodePage.tsx`'s `videoClipPollInFlightRef` convention.
   */
  const [storyJobPoll, setStoryJobPoll] = useState<{
    jobId: string;
    kind: VerticalDramaStoryJobKind;
    progress: VerticalDramaStoryJobProgressLike | null;
  } | null>(null);
  const storyJobPollInFlightRef = useRef(false);
  const resumedStoryJobRef = useRef(false);

  const generateMutation = trpc.verticalDramaSeries.generateStoryBibleDeep.useMutation({
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.deepStoryDraftsGenerateError));
    },
  });

  const extendMutation = trpc.verticalDramaSeries.extendStoryDraftHorizon.useMutation({
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.deepStoryDraftsExtendError));
    },
  });

  /**
   * Refresh-safe resume (#28) — on mount (and whenever the series' active
   * story job changes), picks up any `deep_generate`/`extend` job still
   * queued/running for this series and resumes polling it, disabling the
   * primary CTA with progress shown. An `improve_script` job belongs to
   * `VerticalDramaImproveScriptCard` instead (it runs its own identical
   * resume effect) — this component only cares about its OWN two kinds,
   * even though the pointer is per-series (see
   * `enqueueVerticalDramaStoryJob`'s cross-kind dedupe doc comment).
   */
  const activeStoryJobQuery = trpc.verticalDramaSeries.getActiveStoryJob.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 15_000 },
  );

  async function pollStoryJob(jobId: string, submittedKind: VerticalDramaStoryJobKind) {
    if (storyJobPollInFlightRef.current) return;
    storyJobPollInFlightRef.current = true;
    setStoryJobPoll({ jobId, kind: submittedKind, progress: null });
    try {
      await pollVerticalDramaStoryJob({
        fetchStatus: () => utils.verticalDramaSeries.getStoryJobStatus.fetch({ seriesId, jobId }),
        onProgress: (progress, kind) => setStoryJobPoll({ jobId, kind, progress }),
        onSucceeded: (result, kind) => {
          if (kind !== "deep_generate" && kind !== "extend") {
            // Cross-kind dedupe race (see module header doc comment) — this
            // series' active job turned out to be a critique/apply job, not
            // ours. Never misinterpret its result shape as our own.
            invalidateSeries();
            return;
          }
          const data = result as {
            partial: boolean;
            horizonEndEpisode: number;
            chunkSizes: number[];
            /** Task #22 — see `GenerateStoryBibleDeepResult.tieInMismatchCount`'s own doc comment; `undefined` when tie-in draft awareness was not active this run. */
            tieInMismatchCount?: number;
            /** Production-grade full-story generation upgrade (2026-07-13) — see `resolveDeepDraftCreatedLocationsCount`'s own doc comment; read defensively via that helper, never accessed directly. */
            createdLocationCount?: unknown;
            /** Set B (`vd-stuck-generation-and-lost-characters` plan) — see `resolveDeepDraftCreatedCharactersSummary`'s own doc comment; read defensively via that helper, never accessed directly. */
            createdCharacters?: unknown;
          };
          toast.success(deepStoryDraftsGeneratedSuccessText(lang, sumDeepDraftChunkSizes(data.chunkSizes)));
          // Task #22 — appended ONLY when this run actually threaded tie-in
          // draft awareness (bootstrap gate on + series tie-in enabled).
          if (data.tieInMismatchCount !== undefined) {
            if (data.tieInMismatchCount > 0) {
              toast.warning(tieInDraftMismatchSummaryText(lang, data.tieInMismatchCount));
            } else {
              toast.info(tieInDraftFullyReconciledText(lang));
            }
          }
          // Production-grade full-story generation upgrade (2026-07-13) —
          // appended ONLY when this run's chunk(s) actually declared new
          // locations that got persisted into Tab ฉาก; silently skipped
          // (never a falsy "0 ฉาก" toast) otherwise, including on a backend
          // build that doesn't expose `createdLocations` on the result yet.
          const createdLocationsCount = resolveDeepDraftCreatedLocationsCount(data);
          if (createdLocationsCount > 0) {
            toast.info(deepStoryDraftsNewLocationsCreatedText(lang, createdLocationsCount));
          }
          // Set B (`vd-stuck-generation-and-lost-characters` plan) — a
          // SEPARATE toast.info call, composing with (never overwriting)
          // the locations toast above: both can fire in the same run since
          // a chunk can introduce new locations AND new dialogue-speaker
          // characters at once. Silently skipped (never a falsy "0 ตัว"
          // toast) when nothing was auto-registered this run.
          const createdCharactersSummary =
            resolveDeepDraftCreatedCharactersSummary(data);
          if (createdCharactersSummary.count > 0) {
            toast.info(
              deepStoryDraftsNewCharactersCreatedText(
                lang,
                createdCharactersSummary.count,
                createdCharactersSummary.names
              )
            );
          }
          setPartialHorizonEndEpisode(data.partial ? data.horizonEndEpisode : null);
          invalidateSeries();
        },
        onFailed: (error, kind) => {
          const fallback =
            kind === "extend" ? verticalDramaCopy.deepStoryDraftsExtendError : verticalDramaCopy.deepStoryDraftsGenerateError;
          toast.error(error || pickCopy(lang, fallback));
        },
        // Resilient-resume upgrade (see `STORY_JOB_POLL_MAX_ATTEMPTS`'s doc
        // comment above) — exhausting the poll budget is NOT a failure, the
        // job is almost certainly still running server-side. Info tone, not
        // error: the refresh-safe resume effect re-attaches on reload and
        // the server's own completion notification still fires.
        onTimeout: () => toast.info(pickCopy(lang, verticalDramaCopy.storyJobStillRunningBackground)),
        onNotFound: () => toast.error(pickCopy(lang, verticalDramaCopy.storyJobTimeoutError)),
      });
    } finally {
      storyJobPollInFlightRef.current = false;
      setStoryJobPoll(null);
    }
  }

  useEffect(() => {
    const active = activeStoryJobQuery.data;
    if (!active) return;
    if (active.kind !== "deep_generate" && active.kind !== "extend") return;
    if (resumedStoryJobRef.current || storyJobPollInFlightRef.current) return;
    resumedStoryJobRef.current = true;
    void pollStoryJob(active.jobId, active.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoryJobQuery.data]);

  const totalEpisodes = targetEpisodeCount ?? 0;
  const isChaining = chainPhase !== null;
  const isPollingThisCard = storyJobPoll !== null;
  const isMutating = generateMutation.isPending || extendMutation.isPending || isChaining || isPollingThisCard;

  /**
   * Deep-draft phase only — the pre-consolidation behavior, still used as-is
   * for the "keep the plot" scope. `mode` is now ALWAYS sent explicitly
   * (production-grade full-story generation upgrade, 2026-07-13) rather than
   * omitted for "standard" — the picker's default flipped to "premium" (see
   * the `mode` state doc comment above), and sending the user's actual
   * choice explicitly keeps this call correct regardless of what the
   * router's own omitted-`mode` default resolves to server-side.
   *
   * Async story jobs (#28) — awaits the FULL submit -> poll -> terminal
   * lifecycle (not just the enqueue round-trip), so `isMutating`/the button
   * spinner stay accurate for as long as the real generation is running.
   */
  const runDeepDraftOnly = async () => {
    try {
      // Large-series no-op fix (2026-07-14, see
      // `planning/vertical-drama-deep-draft-update-all-noop/plan.md`) —
      // always request the FULL horizon (`totalEpisodes`), not the server's
      // large-series default of 3, so this CTA actually drafts every
      // Sub-episode instead of silently capping at 3 forever. Omitted when
      // `totalEpisodes` isn't known yet (0), matching the router's own
      // `horizonEpisodes.optional()` fallback.
      const res = await generateMutation.mutateAsync({
        seriesId,
        idempotencyKey: crypto.randomUUID(),
        mode,
        ...(totalEpisodes > 0 ? { horizonEpisodes: totalEpisodes } : {}),
      });
      if (!res.jobId) {
        // `alreadyComplete` — every requested episode already has a
        // detailed draft, so the server enqueued nothing. Nothing to poll.
        toast.info(pickCopy(lang, verticalDramaCopy.deepStoryDraftsAlreadyCompleteInfo));
        invalidateSeries();
        return;
      }
      await pollStoryJob(res.jobId, "deep_generate");
    } catch {
      // Enqueue-level error toast already shown by generateMutation's own onError.
    }
  };

  /**
   * Client-side two-phase chain: `generateStoryBible` (rewrites the plot)
   * then, on success, `generateStoryBibleDeep` (drafts shot-level detail for
   * the fresh plot) — used whenever `hasPlan` is false, and for the "rewrite
   * everything" scope when a plan already exists. A phase-1 failure aborts
   * before phase 2 ever runs (its error toast already fires from the
   * caller's own `onError`); a phase-2 failure is always safe to simply
   * retry, surfaced via this component's own existing deep-draft error toast.
   * `mode` (W11-B) threads the same way as `runDeepDraftOnly` above —
   * including for `hasPlan: false`, now that the picker is offered at
   * bootstrap too (debt-item-5, 2026-07-08); ALWAYS sent explicitly
   * (production-grade full-story generation upgrade, 2026-07-13 — see
   * `runDeepDraftOnly`'s own doc comment on why it's no longer omitted for
   * "standard").
   */
  const runChain = async () => {
    setChainPhase("story");
    try {
      await onGenerateStoryBible();
    } catch {
      setChainPhase(null);
      return;
    }
    setChainPhase("deep");
    try {
      // Large-series no-op fix (2026-07-14, see
      // `planning/vertical-drama-deep-draft-update-all-noop/plan.md`) — same
      // full-horizon request as `runDeepDraftOnly` above, so the "rewrite
      // everything" chain also drafts every Sub-episode instead of capping
      // at 3 on large series.
      const res = await generateMutation.mutateAsync({
        seriesId,
        idempotencyKey: crypto.randomUUID(),
        mode,
        ...(totalEpisodes > 0 ? { horizonEpisodes: totalEpisodes } : {}),
      });
      if (!res.jobId) {
        // `alreadyComplete` — nothing left to draft (see `runDeepDraftOnly`).
        toast.info(pickCopy(lang, verticalDramaCopy.deepStoryDraftsAlreadyCompleteInfo));
        invalidateSeries();
        return;
      }
      await pollStoryJob(res.jobId, "deep_generate");
    } catch {
      // Error toast already shown by generateMutation's own onError, or by pollStoryJob's onFailed.
    } finally {
      setChainPhase(null);
    }
  };

  const handleConfirmSubmit = () => {
    if (!hasPlan || scope === "rewrite") {
      void runChain();
    } else {
      runDeepDraftOnly();
    }
  };

  const openConfirmDialog = () => {
    setScope("keep");
    // Production-grade full-story generation upgrade (2026-07-13) — premium
    // (quality-loop) is now the default, see the `mode` state doc comment.
    setMode("premium");
    setConfirmOpen(true);
  };

  const horizon = computeDeepDraftDisplayHorizon(totalEpisodes);
  const rounds = computeDeepDraftCallRounds(horizon);
  // W11-B — `rounds` is already the chunk count the premium estimate needs.
  const premiumCallEstimate = computePremiumDeepDraftCallEstimate(rounds);

  // Format profiles (task #23) — pure display, resolved client-side from the
  // planned count this panel already has; the confirm dialog shows an
  // informational chip only for a short/ultra-short season (never for a
  // standard-length one).
  const formatProfile = resolveVerticalDramaFormatProfile(totalEpisodes);
  const showFormatProfileChip = formatProfile.tier !== "standard";

  const primaryLabel = hasPlan
    ? pickCopy(lang, verticalDramaCopy.deepStoryDraftsUpdateCta)
    : pickCopy(lang, verticalDramaCopy.deepStoryDraftsGenerateFullCta);

  // Async story jobs (#28) — once a job for THIS card (`deep_generate`/
  // `extend`) is polling, live phase/round progress replaces the static
  // "generating..."/"extending..." fallback text below.
  const thisCardProgress =
    storyJobPoll && (storyJobPoll.kind === "deep_generate" || storyJobPoll.kind === "extend")
      ? storyJobPoll.progress
      : undefined;
  const liveStoryJobProgressText = isPollingThisCard ? storyJobProgressText(lang, thisCardProgress) : null;

  const primaryProgressLabel = isChaining
    ? chainPhase === "story"
      ? pickCopy(lang, verticalDramaCopy.deepStoryDraftsChainStoryProgress)
      : liveStoryJobProgressText ?? pickCopy(lang, verticalDramaCopy.deepStoryDraftsChainDeepProgress)
    : liveStoryJobProgressText ?? pickCopy(lang, verticalDramaCopy.deepStoryDraftsGeneratingProgress);

  const canExtend = Boolean(
    deepDraftSummary && deepDraftSummary.horizonEndEpisode < deepDraftSummary.totalEpisodes,
  );

  const partialBanner =
    partialHorizonEndEpisode != null ? (
      <p
        className="flex items-start gap-1.5 rounded-md border border-amber-400/60 bg-amber-50 p-2 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400"
        data-testid="vd-deep-story-drafts-partial-banner"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {deepStoryDraftsPartialWarningText(lang, partialHorizonEndEpisode)}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-2" data-testid="vd-deep-story-drafts-actions">
      {partialBanner}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="vd-deep-story-drafts-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{pickCopy(lang, verticalDramaCopy.deepStoryDraftsConfirmTitle)}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1.5">
              <span className="block">{deepStoryDraftsHorizonCountText(lang, horizon)}</span>
              <span className="block">{deepStoryDraftsCallRoundsText(lang, rounds)}</span>
              <span className="block">
                {pickCopy(lang, verticalDramaCopy.deepStoryDraftsConfirmCreditsWarning)}
              </span>
              {showFormatProfileChip && (
                <span className="block">
                  <Badge
                    variant="outline"
                    className="w-full whitespace-normal text-left font-normal"
                    data-testid="vd-deep-story-drafts-format-profile-chip"
                  >
                    {deepStoryDraftsFormatProfileChipText(lang, formatProfile)}
                  </Badge>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {hasPlan && (
            <div
              className="grid gap-2 py-1"
              data-testid="vd-deep-story-drafts-scope"
            >
              <RadioGroup
                value={scope}
                onValueChange={value =>
                  setScope(value as VerticalDramaDeepDraftScope)
                }
                aria-label={pickCopy(
                  lang,
                  verticalDramaCopy.deepStoryDraftsScopeGroupLabel
                )}
                className="gap-2"
              >
                <DeepDraftRadioCard
                  id="vd-deep-draft-scope-keep"
                  value="keep"
                  checked={scope === "keep"}
                  ariaLabel={pickCopy(
                    lang,
                    verticalDramaCopy.deepStoryDraftsScopeKeepLabel
                  )}
                  title={pickCopy(
                    lang,
                    verticalDramaCopy.deepStoryDraftsScopeKeepLabel
                  )}
                  hint={deepStoryDraftsScopeKeepHintText(lang, totalEpisodes)}
                />
                <DeepDraftRadioCard
                  id="vd-deep-draft-scope-rewrite"
                  value="rewrite"
                  checked={scope === "rewrite"}
                  ariaLabel={pickCopy(
                    lang,
                    verticalDramaCopy.deepStoryDraftsScopeRewriteLabel
                  )}
                  title={pickCopy(
                    lang,
                    verticalDramaCopy.deepStoryDraftsScopeRewriteLabel
                  )}
                  hint={pickCopy(
                    lang,
                    verticalDramaCopy.deepStoryDraftsScopeRewriteHint
                  )}
                />
              </RadioGroup>
            </div>
          )}

          {/*
            Premium multi-round drafts (W11-B) — quality-mode picker, added
            to the slot the consolidation wave (W12) reserved here. Applies
            uniformly regardless of `hasPlan` (debt-item-5, 2026-07-08 —
            previously nested inside the `hasPlan &&` block above, so it was
            never offered at the no-plan bootstrap even though `runChain`
            (used for `hasPlan: false`) already threads `mode` into
            `generateStoryBibleDeep`'s input exactly like `runDeepDraftOnly`
            does — see both functions' own doc comments). When `hasPlan` is
            true this also applies uniformly to both scope choices above
            (keep/rewrite), same as before.
          */}
          <div
            className="grid gap-2 py-1"
            data-testid="vd-deep-story-drafts-mode"
          >
            <RadioGroup
              value={mode}
              onValueChange={value =>
                setMode(value as VerticalDramaDeepStoryDraftMode)
              }
              aria-label={pickCopy(
                lang,
                verticalDramaCopy.deepStoryDraftsModeGroupLabel
              )}
              className="gap-2"
            >
              <DeepDraftRadioCard
                id="vd-deep-draft-mode-standard"
                value="standard"
                checked={mode === "standard"}
                ariaLabel={pickCopy(
                  lang,
                  verticalDramaCopy.deepStoryDraftsModeStandardLabel
                )}
                title={pickCopy(
                  lang,
                  verticalDramaCopy.deepStoryDraftsModeStandardLabel
                )}
                hint={pickCopy(
                  lang,
                  verticalDramaCopy.deepStoryDraftsModeStandardHint
                )}
              />
              <DeepDraftRadioCard
                id="vd-deep-draft-mode-premium"
                value="premium"
                checked={mode === "premium"}
                ariaLabel={pickCopy(
                  lang,
                  verticalDramaCopy.deepStoryDraftsModePremiumLabel
                )}
                title={pickCopy(
                  lang,
                  verticalDramaCopy.deepStoryDraftsModePremiumLabel
                )}
                hint={deepStoryDraftsModePremiumHintText(
                  lang,
                  premiumCallEstimate
                )}
              />
            </RadioGroup>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>
              {pickCopy(lang, verticalDramaCopy.deepStoryDraftsConfirmCancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSubmit}
              disabled={isMutating}
              data-testid="vd-deep-story-drafts-confirm-submit"
            >
              {isMutating ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : null}
              {pickCopy(lang, verticalDramaCopy.deepStoryDraftsConfirmSubmit)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {userPremise && userPremise.trim().length > 0 && (
        <div
          className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs"
          data-testid="vd-deep-story-drafts-premise-preview"
        >
          <p className="font-medium text-muted-foreground">
            {pickCopy(lang, verticalDramaCopy.deepStoryDraftsPremisePreviewLabel)}
          </p>
          <p className="mt-1 line-clamp-2 text-foreground">{userPremise}</p>
          {onEditPremiseClick && (
            <button
              type="button"
              onClick={onEditPremiseClick}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              {pickCopy(lang, verticalDramaCopy.deepStoryDraftsPremiseEditLinkLabel)}
            </button>
          )}
        </div>
      )}

      {!readOnly && (
        <Button
          type="button"
          className="w-fit gap-2"
          disabled={isMutating}
          onClick={openConfirmDialog}
          data-testid="vd-deep-story-drafts-primary-cta"
        >
          {isMutating ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Layers className="h-4 w-4" aria-hidden="true" />
          )}
          {isMutating ? primaryProgressLabel : primaryLabel}
        </Button>
      )}
      {/* Async story jobs (#28) — a11y live region so screen readers announce phase/round changes without needing to refocus the button. */}
      {liveStoryJobProgressText && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground"
          data-testid="vd-deep-story-drafts-progress"
        >
          {liveStoryJobProgressText}
        </p>
      )}

      {hasPlan && deepDraftSummary && (
        <p className="text-xs text-muted-foreground" data-testid="vd-deep-story-drafts-summary">
          {deepStoryDraftsSummaryText(lang, deepDraftSummary)}
        </p>
      )}
      {hasPlan && deepDraftSummary && !readOnly && canExtend && (
        <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-2"
            disabled={isMutating}
            onClick={async () => {
              try {
                const { jobId } = await extendMutation.mutateAsync({
                  seriesId,
                  additionalEpisodes: DEEP_DRAFT_EXTEND_DEFAULT_EPISODES,
                  idempotencyKey: crypto.randomUUID(),
                  // Always sent explicitly (was previously omitted when
                  // unchecked) — the server defaults an OMITTED mode to
                  // "premium" for a lineage series (sequel/special edition;
                  // see `extendStoryDraftHorizon`'s doc comment), so leaving
                  // this out when unchecked silently ran premium anyway and
                  // gave the user no way to force "standard" on a sequel.
                  mode: extendPremium ? "premium" : "standard",
                });
                await pollStoryJob(jobId, "extend");
              } catch {
                // Enqueue-level error toast already shown by extendMutation's own onError.
              }
            }}
            data-testid="vd-deep-story-drafts-extend-cta"
          >
            {extendMutation.isPending || storyJobPoll?.kind === "extend" ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Layers className="h-4 w-4" aria-hidden="true" />
            )}
            {extendMutation.isPending || storyJobPoll?.kind === "extend"
              ? pickCopy(lang, verticalDramaCopy.deepStoryDraftsExtending)
              : deepStoryDraftsExtendCtaText(
                  lang,
                  computeDeepDraftExtendCount(
                    deepDraftSummary.totalEpisodes,
                    deepDraftSummary.horizonEndEpisode
                  )
                )}
          </Button>
          {/*
            Premium multi-round drafts (W11-B) — extend has no confirm
            dialog to host the mode RadioGroup, so it gets its own small
            checkbox instead (owner-approved simplification). Deliberately
            does NOT auto-reset after firing — see the `extendPremium` state
            doc comment above.
          */}
          <label
            htmlFor="vd-deep-draft-extend-premium"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Checkbox
              id="vd-deep-draft-extend-premium"
              checked={extendPremium}
              onCheckedChange={(checked) => setExtendPremium(checked === true)}
              disabled={isMutating}
              data-testid="vd-deep-story-drafts-extend-premium-checkbox"
            />
            {pickCopy(lang, verticalDramaCopy.deepStoryDraftsExtendPremiumCheckboxLabel)}
          </label>
        </div>
        {/*
          Sequel-aware default (client fix mirroring the server's own
          `extendStoryDraftHorizon` sequel-aware `mode` default) — for a
          lineage series only, explain WHY premium is preselected so the
          checkbox isn't just an unexplained toggle. Non-lineage series never
          render this line (checkbox starts unchecked there, same as before).
        */}
        {isLineageSeries && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="vd-deep-story-drafts-extend-premium-lineage-hint"
          >
            {pickCopy(
              lang,
              verticalDramaCopy.deepStoryDraftsExtendPremiumLineageHint
            )}
          </p>
        )}
        </div>
      )}

      <VerticalDramaImproveScriptCard
        lang={lang}
        seriesId={seriesId}
        readOnly={readOnly}
        hasDrafts={Boolean(deepDraftSummary)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* VerticalDramaDeepStoryDraftEpisodeDetail — badges + shot viewer            */
/* -------------------------------------------------------------------------- */

const COVERAGE_TEXT_CLASSES: Record<VerticalDramaDeepDraftCoverageStatus, string> = {
  ok: "border-emerald-400/50 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-400/60 text-amber-700 dark:text-amber-400",
  error: "border-destructive/50 text-destructive",
};

const COVERAGE_ICON: Record<VerticalDramaDeepDraftCoverageStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const COVERAGE_STATUS_COPY_KEY = {
  ok: "deepStoryDraftsCoverageOk",
  warning: "deepStoryDraftsCoverageWarning",
  error: "deepStoryDraftsCoverageError",
} as const satisfies Record<VerticalDramaDeepDraftCoverageStatus, keyof typeof verticalDramaCopy>;

/** Mirrors the server's `updateEpisodeDraftShotInput`'s `summary.max(600)` — soft `maxLength` guardrail (the server independently enforces the same limit). */
const MANUAL_SHOT_EDIT_SUMMARY_MAX_LENGTH = 600;

/**
 * Manual shot edits (W10.5, extended 2026-07-22 to also cover `summary`) —
 * the inline per-shot editor form, rendered INSTEAD OF the read-only
 * summary+dialogue/silence-intent view for whichever ONE shot is currently
 * being edited (at most one per episode at a time — see
 * `VerticalDramaDeepStoryDraftEpisodeDetail`'s `editingShotNumber` state).
 * ONE combined form edits both the shot's `summary` (top textarea) and its
 * `dialogue_lines` (rows below) with a single Save — a wrong summary and a
 * wrong dialogue line usually need fixing together, so this is deliberately
 * not two separate editors. Purely presentational — the parent owns every
 * piece of state and the mutation itself, so this component has no hooks of
 * its own (a plain function call like `analyzeVerticalDramaLineSpeakability`
 * below is not a hook and carries no ordering constraint).
 */
function ManualDialogueEditShotForm({
  lang,
  episodeNumber,
  shotNumber,
  summaryValue,
  originalSummary,
  lines,
  originalLines,
  episodeAlreadyCreated,
  isSaving,
  onChangeSummary,
  onChangeLine,
  onAddLine,
  onRemoveLine,
  onApplyCleaned,
  onCancel,
  onSave,
}: {
  lang: VerticalDramaLang;
  episodeNumber: number;
  shotNumber: number;
  summaryValue: string;
  originalSummary: string;
  lines: ManualDialogueEditDraftLine[];
  originalLines: ManualDialogueEditDraftLine[];
  episodeAlreadyCreated: boolean;
  isSaving: boolean;
  onChangeSummary: (value: string) => void;
  onChangeLine: (index: number, patch: Partial<ManualDialogueEditDraftLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
  onApplyCleaned: (index: number, cleaned: VerticalDramaLineSpeakabilityCleaned) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const targetSeconds = targetVerticalDramaSpeechSeconds(
    resolveManualDialogueEditShotDurationSeconds(shotNumber),
  );
  const liveSeconds = lines.reduce((sum, row) => sum + estimateVerticalDramaSpeechSeconds(row.line), 0);
  const liveStatus = classifyManualDialogueEditLiveSpeechCoverage(liveSeconds, targetSeconds);
  const LiveIcon = COVERAGE_ICON[liveStatus];
  const hasEmptyLine = lines.some((row) => row.line.trim().length === 0);
  const atMaxLines = lines.length >= MANUAL_DIALOGUE_EDIT_MAX_LINES;
  const trimmedSummary = summaryValue.trim();
  const summaryEmpty = trimmedSummary.length === 0;
  const summaryChanged = trimmedSummary !== originalSummary.trim();
  const linesChanged = manualShotEditLinesChanged(lines, originalLines);
  const hasChanges = summaryChanged || linesChanged;
  const summaryInputId = `vd-manual-edit-${episodeNumber}-${shotNumber}-summary`;

  return (
    <div
      className="mt-1 grid gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
      data-testid={`vd-deep-story-draft-edit-form-${episodeNumber}-${shotNumber}`}
    >
      {episodeAlreadyCreated && (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`vd-deep-story-draft-edit-already-created-${episodeNumber}-${shotNumber}`}
        >
          {pickCopy(lang, verticalDramaCopy.manualDialogueEditAlreadyCreatedHint)}
        </p>
      )}

      <div className="grid gap-1">
        <Label htmlFor={summaryInputId} className="sr-only">
          {pickCopy(lang, verticalDramaCopy.manualSummaryEditLabel)}
        </Label>
        <Textarea
          id={summaryInputId}
          value={summaryValue}
          maxLength={MANUAL_SHOT_EDIT_SUMMARY_MAX_LENGTH}
          onChange={(e) => onChangeSummary(e.target.value)}
          className="min-h-[2.5rem] text-xs"
          data-testid={`vd-deep-story-draft-edit-summary-input-${episodeNumber}-${shotNumber}`}
        />
        {summaryEmpty && (
          <p className="text-[10px] text-destructive">
            {pickCopy(lang, verticalDramaCopy.manualSummaryEditRequired)}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        {lines.map((row, index) => {
          const speak = analyzeVerticalDramaLineSpeakability({ speaker: row.speaker, line: row.line });
          const speakerId = `vd-manual-edit-${episodeNumber}-${shotNumber}-${index}-speaker`;
          const lineId = `vd-manual-edit-${episodeNumber}-${shotNumber}-${index}-line`;
          const deliveryId = `vd-manual-edit-${episodeNumber}-${shotNumber}-${index}-delivery`;
          return (
            <div
              key={index}
              role="group"
              aria-label={manualDialogueEditLineGroupLabel(lang, index + 1)}
              className="grid gap-1 rounded border border-border/40 p-1.5"
              data-testid={`vd-deep-story-draft-edit-line-${episodeNumber}-${shotNumber}-${index}`}
            >
              <div className="flex items-start gap-1.5">
                <div className="grid flex-1 gap-1">
                  <Label htmlFor={speakerId} className="sr-only">
                    {pickCopy(lang, verticalDramaCopy.manualDialogueEditSpeakerLabel)}
                  </Label>
                  <Input
                    id={speakerId}
                    value={row.speaker}
                    placeholder={pickCopy(lang, verticalDramaCopy.manualDialogueEditSpeakerLabel)}
                    maxLength={MANUAL_DIALOGUE_EDIT_SPEAKER_MAX_LENGTH}
                    onChange={(e) => onChangeLine(index, { speaker: e.target.value })}
                    className="h-7 text-xs"
                    data-testid={`vd-deep-story-draft-edit-speaker-${episodeNumber}-${shotNumber}-${index}`}
                  />
                  <Label htmlFor={lineId} className="sr-only">
                    {pickCopy(lang, verticalDramaCopy.manualDialogueEditLineLabel)}
                  </Label>
                  <Textarea
                    id={lineId}
                    value={row.line}
                    maxLength={MANUAL_DIALOGUE_EDIT_LINE_MAX_LENGTH}
                    onChange={(e) => onChangeLine(index, { line: e.target.value })}
                    className={cn(
                      "min-h-[2.25rem] text-xs",
                      !speak.speakable && "border-amber-400 focus-visible:ring-amber-400/50",
                    )}
                    data-testid={`vd-deep-story-draft-edit-line-input-${episodeNumber}-${shotNumber}-${index}`}
                  />
                  {row.line.trim().length === 0 && (
                    <p className="text-[10px] text-destructive">
                      {pickCopy(lang, verticalDramaCopy.manualDialogueEditLineRequired)}
                    </p>
                  )}
                  <Label htmlFor={deliveryId} className="sr-only">
                    {pickCopy(lang, verticalDramaCopy.manualDialogueEditDeliveryPlaceholder)}
                  </Label>
                  <Input
                    id={deliveryId}
                    value={row.delivery}
                    placeholder={pickCopy(lang, verticalDramaCopy.manualDialogueEditDeliveryPlaceholder)}
                    maxLength={MANUAL_DIALOGUE_EDIT_DELIVERY_MAX_LENGTH}
                    onChange={(e) => onChangeLine(index, { delivery: e.target.value })}
                    className="h-7 text-xs"
                    data-testid={`vd-deep-story-draft-edit-delivery-${episodeNumber}-${shotNumber}-${index}`}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={pickCopy(lang, verticalDramaCopy.manualDialogueEditRemoveLine)}
                  onClick={() => onRemoveLine(index)}
                  data-testid={`vd-deep-story-draft-edit-remove-line-${episodeNumber}-${shotNumber}-${index}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
              {!speak.speakable && (
                <p
                  className="flex flex-wrap items-center gap-1 rounded border border-amber-400/60 bg-amber-50 p-1 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400"
                  data-testid={`vd-deep-story-draft-edit-violation-${episodeNumber}-${shotNumber}-${index}`}
                >
                  <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
                  <span>
                    {speak.violations.map((v) => manualDialogueEditViolationLabel(lang, v.kind)).join(", ")}
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    className="ml-auto h-auto shrink-0 p-0 text-[10px] text-amber-700 dark:text-amber-400"
                    onClick={() => onApplyCleaned(index, speak.cleaned)}
                    data-testid={`vd-deep-story-draft-edit-apply-cleaned-${episodeNumber}-${shotNumber}-${index}`}
                  >
                    {pickCopy(lang, verticalDramaCopy.manualDialogueEditApplyCleaned)}
                  </Button>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={atMaxLines}
            onClick={onAddLine}
            className="gap-1"
            data-testid={`vd-deep-story-draft-edit-add-line-${episodeNumber}-${shotNumber}`}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {pickCopy(lang, verticalDramaCopy.manualDialogueEditAddLine)}
          </Button>
          {atMaxLines && (
            <span className="text-[10px] text-muted-foreground">
              {pickCopy(lang, verticalDramaCopy.manualDialogueEditMaxLinesReached)}
            </span>
          )}
        </div>
        <p
          className={cn("flex items-center gap-1 text-[11px]", COVERAGE_TEXT_CLASSES[liveStatus])}
          data-testid={`vd-deep-story-draft-edit-live-seconds-${episodeNumber}-${shotNumber}`}
        >
          <LiveIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
          {manualDialogueEditLiveSpeechSecondsText(lang, liveSeconds, targetSeconds)}
          {" · "}
          {pickCopy(lang, verticalDramaCopy[COVERAGE_STATUS_COPY_KEY[liveStatus]])}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isSaving}
          onClick={onCancel}
          data-testid={`vd-deep-story-draft-edit-cancel-${episodeNumber}-${shotNumber}`}
        >
          {pickCopy(lang, verticalDramaCopy.manualDialogueEditCancel)}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isSaving || hasEmptyLine || summaryEmpty || !hasChanges}
          onClick={onSave}
          className="gap-1.5"
          data-testid={`vd-deep-story-draft-edit-save-${episodeNumber}-${shotNumber}`}
        >
          {isSaving && (
            <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          {isSaving
            ? pickCopy(lang, verticalDramaCopy.manualDialogueEditSaving)
            : pickCopy(lang, verticalDramaCopy.manualDialogueEditSave)}
        </Button>
      </div>
    </div>
  );
}

export interface VerticalDramaDeepStoryDraftEpisodeDetailProps {
  lang: VerticalDramaLang;
  seriesId: string;
  episodeNumber: number;
  /** The active breakdown item for this episode number, if any — see `getActiveBreakdownItemsForDisplay`. */
  item?: VerticalDramaDisplayBreakdownItem;
  /** Hides the "แก้ช็อตนี้" edit affordance (an archived/read-only series) — mirrors every sibling mutation-owning component's own `readOnly` prop in this file. */
  readOnly?: boolean;
  /**
   * Whether a REAL episode row already exists for this `episodeNumber`
   * (the Episodes tab) — drives the muted "already created" info line shown
   * while editing one of its shots (W10.5). Threaded down from
   * `VerticalDramaSeriesDetailPage.tsx`'s own `episodes` list, the same data
   * source the Overview card's existing "ดูตอนจริงที่สร้างแล้ว..." link uses.
   */
  episodeAlreadyCreated?: boolean;
}

/**
 * Read-only per-episode addendum — renders NOTHING when `item` has no
 * `shotDrafts` (an episode outside the drafted horizon, or before any deep
 * draft has run at all), satisfying "only when item.shotDrafts present".
 *
 * Manual dialogue + shot-summary edits (W10.5; extended 2026-07-22) — every
 * hook below runs UNCONDITIONALLY on every render (before the `!shotDrafts`
 * early return), satisfying React's rules of hooks regardless of whether
 * this instance ever actually renders the shot list;
 * `readDeepDraftShotDrafts`/`readDeepDraftManualDialogueEditShotNumbers` etc.
 * below are plain function calls, not hooks, so their placement relative to
 * the early return carries no such constraint.
 *
 * ONE combined editor per shot (2026-07-22) — a wrong summary and a wrong
 * dialogue line usually need fixing together, so `editingShotNumber` gates a
 * SINGLE form (`ManualDialogueEditShotForm`) that edits both the shot's
 * `summary` and its `dialogue_lines`, saved together via one
 * `updateEpisodeDraftShot` call that sends only the field(s) that actually
 * changed (never both if only one differs) — see `handleSave` below.
 */
export function VerticalDramaDeepStoryDraftEpisodeDetail({
  lang,
  seriesId,
  episodeNumber,
  item,
  readOnly = false,
  episodeAlreadyCreated = false,
}: VerticalDramaDeepStoryDraftEpisodeDetailProps) {
  const utils = trpc.useUtils();
  const [editingShotNumber, setEditingShotNumber] = useState<number | null>(null);
  const [draftLines, setDraftLines] = useState<ManualDialogueEditDraftLine[]>([]);
  const [summaryDraft, setSummaryDraft] = useState<string>("");

  /**
   * Combined shot editor mutation (renamed from `updateEpisodeDraftDialogue`
   * 2026-07-22 to `updateEpisodeDraftShot` — now accepts optional
   * `summary`/`lines`, at least one required). onSuccess/onError bodies are
   * reused VERBATIM from the pre-rename dialogue-only mutation (same
   * `silenceIntentRemoved`/`speakabilityWarnings` toast handling), plus one
   * additional invalidation: `verticalDramaEpisodes.getEpisodeDetail` (the
   * shot-splitting page reads the same active breakdown version, so a
   * summary edit here must be visible there too — mirrors
   * `updateEpisodeDraftSynopsis`'s own dual invalidation in
   * `VerticalDramaSeriesDetailPage.tsx`'s `StoryBibleOverviewCard`).
   */
  const editMutation = trpc.verticalDramaSeries.updateEpisodeDraftShot.useMutation({
    onSuccess: (
      data: { silenceIntentRemoved: boolean; speakabilityWarnings: unknown[] },
      variables: { shotNumber: number },
    ) => {
      void utils.verticalDramaSeries.get.invalidate({ seriesId });
      void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      toast.success(manualDialogueEditSavedSuccessText(lang, variables.shotNumber));
      if (data.silenceIntentRemoved) {
        toast.info(pickCopy(lang, verticalDramaCopy.manualDialogueEditSilenceRemovedInfo));
      }
      if (data.speakabilityWarnings.length > 0) {
        toast.warning(manualDialogueEditSavedWithWarningsText(lang, data.speakabilityWarnings.length));
      }
      setEditingShotNumber(null);
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.manualDialogueEditSaveError));
    },
  });

  const handleOpenEdit = (shot: VerticalDramaDeepDraftShotDraft) => {
    setEditingShotNumber(shot.shot_number);
    setSummaryDraft(shot.summary);
    setDraftLines(toManualDialogueEditDraftLines(shot.dialogue_lines));
  };
  const handleCancelEdit = () => setEditingShotNumber(null);
  const handleChangeSummary = (value: string) => setSummaryDraft(value);
  const handleChangeLine = (index: number, patch: Partial<ManualDialogueEditDraftLine>) => {
    setDraftLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const handleAddLine = () => {
    setDraftLines((prev) =>
      prev.length >= MANUAL_DIALOGUE_EDIT_MAX_LINES ? prev : [...prev, { speaker: "", line: "", delivery: "" }],
    );
  };
  const handleRemoveLine = (index: number) => {
    setDraftLines((prev) => prev.filter((_, i) => i !== index));
  };
  const handleApplyCleaned = (index: number, cleaned: VerticalDramaLineSpeakabilityCleaned) => {
    setDraftLines((prev) =>
      prev.map((row, i) =>
        i === index
          ? { speaker: cleaned.speaker ?? "", line: cleaned.line, delivery: cleaned.delivery ?? row.delivery }
          : row,
      ),
    );
  };
  /**
   * Builds `updateEpisodeDraftShot`'s payload from the LIVE shot draft
   * (`shot`, the still-current server value for this shot number) vs the
   * in-progress edit state — including ONLY the field(s) that actually
   * changed. A no-op save (nothing changed) never fires the mutation (the
   * form's own Save button is already disabled in that case; this is a
   * defensive second guard).
   */
  const handleSave = (shot: VerticalDramaDeepDraftShotDraft) => {
    const trimmedSummary = summaryDraft.trim();
    const summaryChanged = trimmedSummary !== shot.summary.trim();
    const linesChanged = manualShotEditLinesChanged(
      draftLines,
      toManualDialogueEditDraftLines(shot.dialogue_lines),
    );
    if (!summaryChanged && !linesChanged) return;
    editMutation.mutate({
      seriesId,
      episodeNumber,
      shotNumber: shot.shot_number,
      ...(summaryChanged ? { summary: trimmedSummary } : {}),
      ...(linesChanged ? { lines: draftLines.map(toManualDialogueEditLineInput) } : {}),
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const shotDrafts = readDeepDraftShotDrafts(item);
  if (!shotDrafts) return null;

  const manualEditShotNumbers = readDeepDraftManualDialogueEditShotNumbers(item);
  const manualSummaryEditShotNumbers = readDeepDraftManualSummaryEditShotNumbers(item);
  const completeness = readDeepDraftCompleteness(item);
  const cliffhangerLine = readDeepDraftCliffhangerLine(item);
  const CoverageIcon = completeness ? COVERAGE_ICON[completeness.coverageStatus] : null;

  // Premium multi-round drafts (W11-B) — `draftScorecard` is only present
  // when this episode was drafted with `mode: "premium"` (W11-A); absent for
  // every standard-mode/legacy item, so this block simply never renders then.
  const scorecard = readDeepDraftScorecard(item);
  const belowFloorDims = scorecard ? selectBelowFloorPremiumDimensions(scorecard) : [];
  const OverallIcon = scorecard ? COVERAGE_ICON[classifyPremiumOverallScore(scorecard.overall)] : null;

  return (
    <div className="mt-2 flex flex-col gap-2" data-testid={`vd-deep-story-draft-episode-${episodeNumber}`}>
      {scorecard && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          data-testid={`vd-deep-story-draft-scorecard-${episodeNumber}`}
        >
          <Badge
            variant="outline"
            className={cn("gap-1 text-[10px]", COVERAGE_TEXT_CLASSES[classifyPremiumOverallScore(scorecard.overall)])}
            data-testid={`vd-deep-story-draft-scorecard-badge-${episodeNumber}`}
          >
            {OverallIcon && <OverallIcon aria-hidden="true" className="h-3 w-3 shrink-0" />}
            {deepStoryDraftsScorecardOverallBadgeText(lang, scorecard.overall)}
          </Badge>
          {belowFloorDims.length > 0 && (
            <details
              className="text-[10px] text-muted-foreground"
              data-testid={`vd-deep-story-draft-scorecard-below-floor-${episodeNumber}`}
            >
              <summary className="cursor-pointer underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                {pickCopy(lang, verticalDramaCopy.deepStoryDraftsScorecardBelowFloorToggle)}
              </summary>
              <ul className="mt-1 grid gap-0.5">
                {belowFloorDims.map(({ dimension, score }) => (
                  <li
                    key={dimension}
                    data-testid={`vd-deep-story-draft-scorecard-dim-${episodeNumber}-${dimension}`}
                  >
                    {deepStoryDraftsScorecardBelowFloorDimText(lang, dimension, score)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {completeness && (
        <div
          role="group"
          aria-label={pickCopy(lang, verticalDramaCopy.deepStoryDraftsCompletenessGroupLabel)}
          className="flex flex-wrap items-center gap-1.5"
        >
          {completeness.dialogueEveryShot && (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-400/50 text-[10px] text-emerald-600 dark:text-emerald-400"
              data-testid={`vd-deep-story-draft-badge-dialogue-complete-${episodeNumber}`}
            >
              {pickCopy(lang, verticalDramaCopy.deepStoryDraftsDialogueCompleteBadge)}
            </Badge>
          )}
          {completeness.allSpeakable && (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-400/50 text-[10px] text-emerald-600 dark:text-emerald-400"
              data-testid={`vd-deep-story-draft-badge-speakable-${episodeNumber}`}
            >
              {pickCopy(lang, verticalDramaCopy.deepStoryDraftsSpeakableBadge)}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn("gap-1 text-[10px]", COVERAGE_TEXT_CLASSES[completeness.coverageStatus])}
            data-testid={`vd-deep-story-draft-badge-coverage-${episodeNumber}`}
          >
            {CoverageIcon && <CoverageIcon aria-hidden="true" className="h-3 w-3 shrink-0" />}
            {deepStoryDraftsSpeechSecondsBadgeText(lang, completeness.estimatedSpeechSeconds)}
            {" · "}
            {pickCopy(lang, verticalDramaCopy[COVERAGE_STATUS_COPY_KEY[completeness.coverageStatus]])}
          </Badge>
        </div>
      )}

      <details
        className="rounded-md border p-2 text-xs [&_summary::-webkit-details-marker]:hidden"
        data-testid={`vd-deep-story-draft-shot-viewer-${episodeNumber}`}
      >
        <summary className="flex cursor-pointer items-center gap-1.5 py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          <Film aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {pickCopy(lang, verticalDramaCopy.deepStoryDraftsShotViewerToggle)}
        </summary>
        <ol className="mt-2 grid gap-2">
          {shotDrafts.map((shot) => {
            const isEditingThisShot = editingShotNumber === shot.shot_number;
            const isEdited =
              manualEditShotNumbers.includes(shot.shot_number) ||
              manualSummaryEditShotNumbers.includes(shot.shot_number);
            return (
              <li
                key={shot.shot_number}
                className="rounded border border-border/60 p-2"
                data-testid={`vd-deep-story-draft-shot-${episodeNumber}-${shot.shot_number}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="font-medium">
                    {deepStoryDraftsShotSummaryLabel(lang, shot.shot_number, shot.summary)}
                  </p>
                  {isEdited && (
                    <Badge
                      variant="secondary"
                      className="gap-1 text-[10px]"
                      data-testid={`vd-deep-story-draft-edited-badge-${episodeNumber}-${shot.shot_number}`}
                    >
                      <Pencil aria-hidden="true" className="h-3 w-3 shrink-0" />
                      {pickCopy(lang, verticalDramaCopy.manualDialogueEditEditedBadge)}
                    </Badge>
                  )}
                </div>

                {/*
                  Production-grade full-story generation upgrade
                  (2026-07-13) — per-shot location + character/emotion
                  preview. Rendered regardless of `isEditingThisShot` (unlike
                  the silence-intent/dialogue-lines block below) since these
                  are read-only context the user may still want visible while
                  editing dialogue. Both fields are OPTIONAL — absent for
                  drafts generated before this field existed, in which case
                  neither block renders (no empty chrome).
                */}
                {shot.location_key && (
                  <p
                    className="mt-0.5 text-[11px] text-muted-foreground"
                    data-testid={`vd-deep-story-draft-shot-location-${episodeNumber}-${shot.shot_number}`}
                  >
                    {deepStoryDraftsShotLocationText(lang, shot.location_key)}
                  </p>
                )}
                {shot.characters && shot.characters.length > 0 && (
                  <div
                    role="group"
                    aria-label={pickCopy(lang, verticalDramaCopy.deepStoryDraftsShotCharactersGroupLabel)}
                    className="mt-1 flex flex-wrap gap-1"
                    data-testid={`vd-deep-story-draft-shot-characters-${episodeNumber}-${shot.shot_number}`}
                  >
                    {shot.characters.map((character, i) => (
                      <Badge
                        key={`${character.name}-${i}`}
                        variant="outline"
                        className="text-[10px]"
                        data-testid={`vd-deep-story-draft-shot-character-${episodeNumber}-${shot.shot_number}-${i}`}
                      >
                        {deepStoryDraftsShotCharacterChipText(
                          lang,
                          character.name,
                          character.emotion,
                          character.emotion_after,
                        )}
                      </Badge>
                    ))}
                  </div>
                )}

                {isEditingThisShot ? (
                  <ManualDialogueEditShotForm
                    lang={lang}
                    episodeNumber={episodeNumber}
                    shotNumber={shot.shot_number}
                    summaryValue={summaryDraft}
                    originalSummary={shot.summary}
                    lines={draftLines}
                    originalLines={toManualDialogueEditDraftLines(shot.dialogue_lines)}
                    episodeAlreadyCreated={episodeAlreadyCreated}
                    isSaving={editMutation.isPending}
                    onChangeSummary={handleChangeSummary}
                    onChangeLine={handleChangeLine}
                    onAddLine={handleAddLine}
                    onRemoveLine={handleRemoveLine}
                    onApplyCleaned={handleApplyCleaned}
                    onCancel={handleCancelEdit}
                    onSave={() => handleSave(shot)}
                  />
                ) : (
                  <>
                    {shot.silence_intent && (
                      <p className="mt-0.5 italic text-muted-foreground">
                        {deepStoryDraftsSilenceIntentLabel(lang, shot.silence_intent)}
                      </p>
                    )}
                    {shot.dialogue_lines.length > 0 && (
                      <ul className="mt-1 grid gap-0.5">
                        {shot.dialogue_lines.map((line, i) => (
                          <li key={i} className="leading-relaxed">
                            {deepStoryDraftsDialogueLineText(lang, line.speaker, line.line)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-6 gap-1 px-1.5 text-[11px]"
                        onClick={() => handleOpenEdit(shot)}
                        data-testid={`vd-deep-story-draft-edit-cta-${episodeNumber}-${shot.shot_number}`}
                      >
                        <Pencil aria-hidden="true" className="h-3 w-3 shrink-0" />
                        {pickCopy(lang, verticalDramaCopy.manualDialogueEditCta)}
                      </Button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </details>

      {cliffhangerLine && (
        <p className="text-xs text-muted-foreground" data-testid={`vd-deep-story-draft-cliffhanger-${episodeNumber}`}>
          {deepStoryDraftsCliffhangerText(lang, cliffhangerLine)}
        </p>
      )}
    </div>
  );
}
