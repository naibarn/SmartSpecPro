/**
 * Marketplace mandatory text-plan review gate (2026-07-23,
 * planning/marketplace-storyboard-text-gate, commit f997ba1a9). Every Auto
 * Review run now HOLDS after the text plan (`concept_story` +, for
 * sequential runs, the per-shot pack) is authored and BEFORE the
 * `image_generation` stage reserves any credit, until the user approves the
 * text or asks the AI to redraft it. Server contract:
 * `metadataJson.planReview = { required: true, status: "awaiting" |
 * "approved", heldAt?, approvedAt?, redraftCount, lastNotes }`
 * (`server/services/marketplaceAutoReviewService.ts`).
 *
 * Presentational component — props in, callbacks out, following the
 * `SequentialShotReviewSection` precedent: this file owns pure projection
 * helpers (exported for direct unit testing) that turn a run's raw
 * `metadataJson` into plain view-model props; `MarketplaceCaptureProductDetail.tsx`
 * calls those helpers and mounts this component, it never receives a raw
 * metadata blob itself. Renders `null` whenever `planReview` is absent or not
 * `{ required: true, status: "awaiting" }` — this is what makes the panel
 * self-disable for approved/older runs with zero page-level branching beyond
 * the caller's own guard (mirrors `SequentialShotReviewSection`'s
 * `shots.length === 0` self-disable).
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AUTO_STORYBOARD_QUALITY_MODE_ROUNDS,
  type AutoStoryboardQualityMode,
} from "./AutoStoryboardQualityModeControl";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

const REDRAFT_NOTES_MAX_CHARS = 2000;
// Display heuristic only (roughly 3-4 lines of product facts) — collapses
// the product-facts block so a long spec sheet does not push the approve /
// redraft actions far below the fold. Never hides content outright; the
// section always defaults OPEN (see `PlanReviewProductDetail` below) because
// this text is the primary thing the gate exists to have the user read.
const PRODUCT_DETAIL_COLLAPSE_THRESHOLD = 320;

/* -------------------------------------------------------------------------- */
/* Tolerant local helpers (every marketplaceCapture module keeps its own —    */
/* see `@/lib/marketplaceSequentialStoryboardUi.ts` for the same convention). */
/* -------------------------------------------------------------------------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickLabel(
  map: Record<string, string> | undefined,
  key: string
): string | null {
  if (!map || !key) return null;
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

/* -------------------------------------------------------------------------- */
/* View models                                                               */
/* -------------------------------------------------------------------------- */

export type AutoReviewPlanReviewStatus = "awaiting" | "approved" | string;

export interface AutoReviewPlanReviewState {
  required?: boolean;
  status?: AutoReviewPlanReviewStatus;
  heldAt?: string | null;
  approvedAt?: string | null;
  redraftCount?: number;
  lastNotes?: string | null;
}

export interface AutoReviewPlanReviewSettingRow {
  key: string;
  label: string;
  value: string;
}

export interface AutoReviewPlanReviewSequentialShotRow {
  shotId: number;
  purpose: string;
  visualSummary: string;
  dialogue: string;
  durationSeconds: number | null;
}

export interface AutoReviewPlanReviewCreditEstimate {
  typical: number;
  worst: number;
}

export interface AutoReviewPlanReviewPlanData {
  productDetail: string;
  storyboardGuide: string;
  voiceoverScript: string;
  sequentialShots: AutoReviewPlanReviewSequentialShotRow[];
  settings: AutoReviewPlanReviewSettingRow[];
  creditEstimate: AutoReviewPlanReviewCreditEstimate | null;
}

/**
 * `metadataJson.qualityMode` ("fast_draft" | "balanced" | "premium_strict_qa"
 * — `server/services/marketplaceAutoReviewService.ts`
 * `MarketplaceAutoReviewQualityModeInput`) 1:1 with this control's own enum
 * ("fast" | "balanced" | "high"), same mapping as
 * `toMarketplaceAutoReviewQualityMode()`'s inverse in
 * `server/services/hyperframesRuntimeApiService.ts`.
 */
function toAutoStoryboardQualityMode(
  qualityMode: string
): AutoStoryboardQualityMode {
  if (qualityMode === "fast_draft") return "fast";
  if (qualityMode === "premium_strict_qa") return "high";
  return "balanced";
}

/**
 * Per-shot rows for the sequential (`sequential_shot_storyboard`) strategy's
 * TEXT-only review table — `shot_id`/`purpose`/`visual_summary`/`dialogue`/
 * `duration_seconds` from `metadataJson.sequentialStoryboard.shots`
 * (`SequentialStoryboardShot`,
 * `server/services/productReviewSequentialStoryboardSkillRunner.ts`).
 * Deliberately omits `start_frame_image_prompt`/`video_prompt` — those are a
 * separate, more technical review already available on the Storyboard
 * Review page; this gate is about the STORY, not the image/video prompt
 * engineering. Never throws on malformed/missing data — resolves to `[]`.
 */
export function buildAutoReviewPlanReviewSequentialShotRows(
  metadataJson: unknown
): AutoReviewPlanReviewSequentialShotRow[] {
  const sequential = asRecord(asRecord(metadataJson).sequentialStoryboard);
  const rawShots = Array.isArray(sequential.shots) ? sequential.shots : [];
  const rows: AutoReviewPlanReviewSequentialShotRow[] = [];
  for (const rawShot of rawShots) {
    if (!isPlainObject(rawShot)) continue;
    const shotId = Number(rawShot.shot_id);
    if (!Number.isFinite(shotId) || shotId <= 0) continue;
    const durationSeconds =
      typeof rawShot.duration_seconds === "number" &&
      Number.isFinite(rawShot.duration_seconds)
        ? rawShot.duration_seconds
        : null;
    rows.push({
      shotId,
      purpose: cleanText(rawShot.purpose),
      visualSummary: cleanText(rawShot.visual_summary),
      dialogue: cleanText(rawShot.dialogue),
      durationSeconds,
    });
  }
  return rows.sort((a, b) => a.shotId - b.shotId);
}

/**
 * `productDetail` / `storyboardGuide` / `voiceoverScript` from
 * `metadataJson.concept` (`AutoReviewPlan`,
 * `server/services/marketplaceAutoReviewService.ts`) — present for every
 * frame strategy (the base plan every strategy authors before frame-specific
 * rendering). Never throws — resolves every field to `""` when absent.
 */
export function buildAutoReviewPlanReviewPlanText(metadataJson: unknown): {
  productDetail: string;
  storyboardGuide: string;
  voiceoverScript: string;
} {
  const concept = asRecord(asRecord(metadataJson).concept);
  return {
    productDetail: cleanText(concept.productDetail),
    storyboardGuide: cleanText(concept.storyboardGuide),
    voiceoverScript: cleanText(concept.voiceoverScript),
  };
}

/**
 * First-pass / worst-case image job estimate for the confirm button, reusing
 * `imageJobsEstimatedWorstCase` copy + this codebase's own quality-mode
 * rounds mapping (`AUTO_STORYBOARD_QUALITY_MODE_ROUNDS`).
 *
 * Deliberately SEQUENTIAL-ONLY: for `sequential_shot_storyboard`, 1 image
 * job per authored shot is an unambiguous, already-established mapping (see
 * `hyperframesUiCopy.ts`'s `imageJobsEstimated` comment — "shown only when
 * creditEstimate.imageJobCount > 1 (sequential storyboard strategy)" — and
 * `shared/hyperframes/autoPlan.ts`'s `resolveHyperframesAutoPlanImageJobCount`,
 * which hardcodes the SAME strategy check). For `storyboard_3x3_split` (one
 * grid image regardless of shot count) and `video_shot_start_stop`
 * (documented in that same shared resolver as "actually submits
 * `shots.length × 2` jobs but that correction is deliberately deferred" —
 * i.e. this codebase has not itself committed to a correct multiplier),
 * there is no single correct N derivable from shot count alone without
 * inventing one — so this returns `null` and the caller omits the line
 * entirely, per the explicit "omit rather than invent" instruction.
 */
export function buildAutoReviewPlanReviewCreditEstimate(
  metadataJson: unknown,
  frameStrategy: unknown
): AutoReviewPlanReviewCreditEstimate | null {
  if (frameStrategy !== "sequential_shot_storyboard") return null;
  const typical =
    buildAutoReviewPlanReviewSequentialShotRows(metadataJson).length;
  if (typical <= 0) return null;
  const qualityMode = cleanText(asRecord(metadataJson).qualityMode);
  const rounds =
    AUTO_STORYBOARD_QUALITY_MODE_ROUNDS[
      toAutoStoryboardQualityMode(qualityMode)
    ];
  return { typical, worst: typical * rounds };
}

/**
 * The user's selected settings, side-by-side with the plan text so a
 * mismatch (wrong tone, wrong structure, ignored brief) is instantly
 * visible. Reads ONLY fields `startMarketplaceAutoReviewRun` actually
 * persists into `metadataJson` (grep-verified against
 * `server/services/marketplaceAutoReviewService.ts`'s `buildRunMetadata`) —
 * a row is included only when the underlying value is present AND
 * meaningfully non-default (e.g. `characterPresenceMode: "auto"` is the
 * default/no-preference state and is omitted, not fabricated as a row).
 * Never invents a value that is not actually in metadata.
 */
export function buildAutoReviewPlanReviewSettingRows(
  metadataJson: unknown,
  frameStrategy: unknown,
  outputMode: unknown,
  locale?: MarketplaceHyperframesUiLocale | string
): AutoReviewPlanReviewSettingRow[] {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const metadata = asRecord(metadataJson);
  const referenceAnchors = asRecord(metadata.referenceAnchors);
  const sequentialUserInputs = asRecord(
    asRecord(metadata.sequentialStoryboard).userInputs
  );
  const rows: AutoReviewPlanReviewSettingRow[] = [];

  const outputModeText = cleanText(outputMode);
  const outputModeLabel = pickLabel(
    copy.planReviewOutputModeLabels,
    outputModeText
  );
  if (outputModeLabel) {
    rows.push({
      key: "outputMode",
      label: copy.planReviewOutputModeRowLabel,
      value: outputModeLabel,
    });
  }

  const frameStrategyText = cleanText(frameStrategy);
  const frameStrategyLabel = pickLabel(
    copy.frameStrategyLabels,
    frameStrategyText
  );
  if (frameStrategyLabel) {
    rows.push({
      key: "frameStrategy",
      label: copy.planReviewFrameStrategyRowLabel,
      value: frameStrategyLabel,
    });
  }

  const reviewTone = cleanText(referenceAnchors.reviewTone);
  const reviewToneLabel = pickLabel(
    copy.planReviewReviewToneLabels,
    reviewTone
  );
  if (reviewToneLabel) {
    rows.push({
      key: "reviewTone",
      label: copy.planReviewReviewToneRowLabel,
      value: reviewToneLabel,
    });
  }

  const storytellingStructure = cleanText(
    referenceAnchors.storytellingStructure
  );
  const storytellingStructureLabel = pickLabel(
    copy.planReviewStorytellingStructureLabels,
    storytellingStructure
  );
  if (storytellingStructureLabel) {
    rows.push({
      key: "storytellingStructure",
      label: copy.planReviewStorytellingStructureRowLabel,
      value: storytellingStructureLabel,
    });
  }

  const qualityMode = cleanText(metadata.qualityMode);
  if (qualityMode) {
    const mode = toAutoStoryboardQualityMode(qualityMode);
    rows.push({
      key: "qualityMode",
      label: copy.qualityModeControlLabel,
      value: `${copy.qualityModeControlOptions[mode]} (${copy.qualityModeControlRounds(
        AUTO_STORYBOARD_QUALITY_MODE_ROUNDS[mode]
      )})`,
    });
  }

  const creativeBrief = cleanText(metadata.creativeBrief);
  if (creativeBrief) {
    rows.push({
      key: "creativeBrief",
      label: copy.planReviewCreativeBriefLabel,
      value: creativeBrief,
    });
  }

  const motionDirection = cleanText(metadata.motionDirection);
  if (motionDirection) {
    rows.push({
      key: "motionDirection",
      label: copy.planReviewMotionDirectionLabel,
      value: motionDirection,
    });
  }

  // "auto" is the default/no-preference state (server:
  // `normalizeMarketplaceAutoReviewCharacterPresenceMode`) — omitted rather
  // than shown as a no-op row.
  const characterPresenceMode = cleanText(metadata.characterPresenceMode);
  const characterPresenceLabel =
    characterPresenceMode && characterPresenceMode !== "auto"
      ? pickLabel(copy.planReviewCharacterPresenceLabels, characterPresenceMode)
      : null;
  if (characterPresenceLabel) {
    rows.push({
      key: "characterPresenceMode",
      label: copy.planReviewCharacterPresenceRowLabel,
      value: characterPresenceLabel,
    });
  }

  const targetAudience = cleanText(sequentialUserInputs.targetAudience);
  if (targetAudience) {
    rows.push({
      key: "targetAudience",
      label: copy.targetAudienceLabel,
      value: targetAudience,
    });
  }

  const userRequirements = cleanText(sequentialUserInputs.userRequirements);
  if (userRequirements) {
    rows.push({
      key: "userRequirements",
      label: copy.userRequirementsLabel,
      value: userRequirements,
    });
  }

  const forbiddenClaims = Array.isArray(sequentialUserInputs.forbiddenClaims)
    ? sequentialUserInputs.forbiddenClaims.map(cleanText).filter(Boolean)
    : [];
  if (forbiddenClaims.length > 0) {
    rows.push({
      key: "forbiddenClaims",
      label: copy.forbiddenClaimsLabel,
      value: forbiddenClaims.join(", "),
    });
  }

  const confirmedAttributes = asRecord(
    sequentialUserInputs.confirmedAttributes
  );
  const confirmedAttributeEntries = Object.entries(confirmedAttributes)
    .map(([attribute, claim]) => `${attribute}: ${cleanText(claim)}`.trim())
    .filter(entry => !entry.endsWith(":"));
  if (confirmedAttributeEntries.length > 0) {
    rows.push({
      key: "confirmedAttributes",
      label: copy.confirmedAttributesLabel,
      value: confirmedAttributeEntries.join(" · "),
    });
  }

  const requestedShotCount = Number(metadata.requestedShotCount);
  if (Number.isFinite(requestedShotCount) && requestedShotCount > 0) {
    rows.push({
      key: "requestedShotCount",
      label: copy.planReviewShotCountRowLabel,
      value: String(requestedShotCount),
    });
  }

  const overlayTextMode = cleanText(metadata.overlayTextMode);
  const overlayTextModeLabel = pickLabel(
    copy.planReviewOverlayTextModeLabels,
    overlayTextMode
  );
  if (overlayTextModeLabel) {
    rows.push({
      key: "overlayTextMode",
      label: copy.planReviewOverlayTextRowLabel,
      value: overlayTextModeLabel,
    });
  }

  const resolvedAudioStrategy = cleanText(metadata.resolvedAudioStrategy);
  const resolvedAudioStrategyLabel = pickLabel(
    copy.planReviewResolvedAudioStrategyLabels,
    resolvedAudioStrategy
  );
  if (resolvedAudioStrategyLabel) {
    rows.push({
      key: "resolvedAudioStrategy",
      label: copy.planReviewAudioStrategyRowLabel,
      value: resolvedAudioStrategyLabel,
    });
  }

  const speechLanguage = cleanText(metadata.speechLanguage);
  if (speechLanguage) {
    rows.push({
      key: "speechLanguage",
      label: copy.planReviewSpeechLanguageRowLabel,
      value: speechLanguage.toUpperCase(),
    });
  }

  return rows;
}

/**
 * One-call convenience bundling every projector above — the shape
 * `MarketplaceCaptureProductDetail.tsx` builds from the FULL
 * (`includeHeavyMetadata`) `getAutoReviewRun` response (the polled
 * `listAutoReviewRuns` summary payload omits `concept` /
 * `sequentialStoryboard.shots`) and passes into this panel's `plan` prop.
 */
export function buildAutoReviewPlanReviewPlanData(
  metadataJson: unknown,
  frameStrategy: unknown,
  outputMode: unknown,
  locale?: MarketplaceHyperframesUiLocale | string
): AutoReviewPlanReviewPlanData {
  const planText = buildAutoReviewPlanReviewPlanText(metadataJson);
  return {
    ...planText,
    sequentialShots: buildAutoReviewPlanReviewSequentialShotRows(metadataJson),
    settings: buildAutoReviewPlanReviewSettingRows(
      metadataJson,
      frameStrategy,
      outputMode,
      locale
    ),
    creditEstimate: buildAutoReviewPlanReviewCreditEstimate(
      metadataJson,
      frameStrategy
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                 */
/* -------------------------------------------------------------------------- */

export interface AutoReviewPlanReviewPanelProps {
  /** `metadataJson.planReview` (or `undefined`/`null` on older runs). */
  planReview: AutoReviewPlanReviewState | null | undefined;
  /**
   * Heavy plan content, only available once the caller's separate
   * `getAutoReviewRun` (full-metadata) fetch resolves. `null` means "not
   * loaded yet" — renders a loading state (or the error state below), NOT
   * "nothing to show" (the gate itself is already known from `planReview`).
   */
  plan: AutoReviewPlanReviewPlanData | null;
  planLoadError?: string | null;
  onRetryLoadPlan?: () => void;
  onApprove: () => void;
  approving?: boolean;
  approveError?: string | null;
  onRequestRedraft: (notes: string) => void;
  redrafting?: boolean;
  redraftError?: string | null;
  /** Reuses the page's EXISTING `cancelAutoReviewRun` mutation/button — this
   *  panel never defines a second cancel flow. */
  onCancelRun: () => void;
  cancelling?: boolean;
  locale?: MarketplaceHyperframesUiLocale | string;
}

function PlanReviewProductDetail({
  productDetail,
  title,
  showMoreLabel,
  showLessLabel,
}: {
  productDetail: string;
  title: string;
  showMoreLabel: string;
  showLessLabel: string;
}) {
  const isLong = productDetail.length > PRODUCT_DETAIL_COLLAPSE_THRESHOLD;
  // Defaults OPEN even when long — this text is the primary thing the gate
  // exists to have the user read; the toggle is for tidiness afterwards, not
  // to hide it by default.
  const [open, setOpen] = useState(true);

  if (!isLong) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
          {productDetail}
        </p>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            {open ? showLessLabel : showMoreLabel}
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
          {productDetail}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AutoReviewPlanReviewPanel({
  planReview,
  plan,
  planLoadError,
  onRetryLoadPlan,
  onApprove,
  approving,
  approveError,
  onRequestRedraft,
  redrafting,
  redraftError,
  onCancelRun,
  cancelling,
  locale,
}: AutoReviewPlanReviewPanelProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const [redraftOpen, setRedraftOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const previousRedraftCountRef = useRef(planReview?.redraftCount ?? 0);

  // A successful redraft increments `redraftCount` in the persisted
  // metadata — close the notes box and clear the buffer only on that signal
  // (never on a failed attempt, so the user's typed notes survive an error,
  // matching `SequentialShotEditorCard`'s "retain what the user typed" rule).
  useEffect(() => {
    const current = planReview?.redraftCount ?? 0;
    if (current !== previousRedraftCountRef.current) {
      previousRedraftCountRef.current = current;
      setRedraftOpen(false);
      setNotes("");
    }
  }, [planReview?.redraftCount]);

  const isAwaiting =
    planReview?.required === true && planReview?.status === "awaiting";
  if (!isAwaiting) return null;

  const busy = Boolean(approving) || Boolean(redrafting);
  const hasSequentialShots = (plan?.sequentialShots.length ?? 0) > 0;
  const hasPlanText = Boolean(
    plan &&
    (plan.productDetail ||
      plan.storyboardGuide ||
      plan.voiceoverScript ||
      hasSequentialShots)
  );

  return (
    <div
      data-testid="auto-review-plan-review-panel"
      className="space-y-4 rounded-lg border-2 border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-950/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {copy.planReviewTitle}
          </h3>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            {copy.planReviewExplainer}
          </p>
        </div>
        {planReview &&
        planReview.redraftCount &&
        planReview.redraftCount > 0 ? (
          <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100">
            {copy.planReviewDraftBadge(planReview.redraftCount + 1)}
          </span>
        ) : null}
      </div>

      {!plan ? (
        planLoadError ? (
          <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p>{copy.planReviewLoadError}</p>
            <p className="text-xs">{planLoadError}</p>
            {onRetryLoadPlan ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRetryLoadPlan}
              >
                {copy.planReviewRetry}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.planReviewLoading}
          </div>
        )
      ) : (
        <>
          {plan.settings.length > 0 ? (
            <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {copy.planReviewSettingsTitle}
              </p>
              <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {plan.settings.map(row => (
                  <div key={row.key} className="min-w-0">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">
                      {row.label}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm font-medium text-slate-900 dark:text-slate-100">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {!hasPlanText ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {copy.planReviewNoPlanTextFallback}
            </p>
          ) : (
            <>
              {plan.productDetail ? (
                <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <PlanReviewProductDetail
                    productDetail={plan.productDetail}
                    title={copy.planReviewProductDetailTitle}
                    showMoreLabel={copy.planReviewShowMore}
                    showLessLabel={copy.planReviewShowLess}
                  />
                </div>
              ) : null}

              {hasSequentialShots ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {copy.planReviewShotsTableTitle}
                  </p>
                  <ol className="space-y-2">
                    {plan.sequentialShots.map(shot => (
                      <li
                        key={shot.shotId}
                        data-testid={`plan-review-shot-${shot.shotId}`}
                        className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {copy.planReviewShotLabel(shot.shotId)}
                          </span>
                          {shot.durationSeconds != null ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {copy.planReviewShotDurationLabel(
                                shot.durationSeconds
                              )}
                            </span>
                          ) : null}
                        </div>
                        {shot.purpose ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold">
                              {copy.planReviewShotPurposeLabel}:
                            </span>{" "}
                            {shot.purpose}
                          </p>
                        ) : null}
                        {shot.visualSummary ? (
                          <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              {copy.planReviewShotVisualSummaryLabel}:
                            </span>{" "}
                            {shot.visualSummary}
                          </p>
                        ) : null}
                        {shot.dialogue ? (
                          <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              {copy.planReviewShotDialogueLabel}:
                            </span>{" "}
                            {shot.dialogue}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <>
                  {plan.storyboardGuide ? (
                    <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {copy.planReviewStoryboardGuideTitle}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
                        {plan.storyboardGuide}
                      </p>
                    </div>
                  ) : null}
                  {plan.voiceoverScript ? (
                    <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {copy.planReviewVoiceoverScriptTitle}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
                        {plan.voiceoverScript}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
        </>
      )}

      {approveError ? (
        <p className="text-sm text-red-700 dark:text-red-300">{approveError}</p>
      ) : null}
      {redraftError ? (
        <p className="text-sm text-red-700 dark:text-red-300">{redraftError}</p>
      ) : null}

      {redraftOpen ? (
        <div className="space-y-2 rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {copy.planReviewRedraftNotesLabel}
            </span>
            <Textarea
              aria-label={copy.planReviewRedraftNotesLabel}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder={copy.planReviewRedraftNotesPlaceholder}
              maxLength={REDRAFT_NOTES_MAX_CHARS}
              className="min-h-20"
              disabled={busy}
            />
            <span className="block text-right text-xs text-slate-400">
              {copy.promptCharCount(notes.length, REDRAFT_NOTES_MAX_CHARS)}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => onRequestRedraft(notes.trim())}
            >
              {redrafting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {copy.planReviewRedraftSubmit}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setRedraftOpen(false)}
            >
              {copy.planReviewRedraftCancel}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={onApprove}>
          {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {copy.planReviewApprove}
        </Button>
        {!redraftOpen ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setRedraftOpen(true)}
          >
            {copy.planReviewRequestRedraft}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
          disabled={cancelling}
          onClick={onCancelRun}
        >
          {copy.planReviewCancelRun}
        </Button>
      </div>

      {plan?.creditEstimate ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {copy.imageJobsEstimatedWorstCase(
            plan.creditEstimate.typical,
            plan.creditEstimate.worst
          )}
        </p>
      ) : null}
    </div>
  );
}
