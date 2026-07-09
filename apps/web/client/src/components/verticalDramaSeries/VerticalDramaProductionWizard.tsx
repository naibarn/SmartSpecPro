/**
 * VerticalDramaProductionWizard (spec feature 131, §8.8 ·
 * section-12-production-wizard-guided-workflow — "Recommended
 * Implementation / Client" + "Component Map").
 *
 * Guided stepper rendered ABOVE the stage surface in
 * `VerticalDramaEpisodeWorkspace.tsx` behind `flags.productionWizard`
 * (`verticalDramaSeriesSeriesProductionWizard`) — this component only ever
 * renders when its caller already resolved wizard state
 * (`getEpisodeDetail.wizard`, via the shared pure resolver
 * `deriveVerticalDramaProductionWizardState`), so it never needs its own
 * flag check (mirrors `VerticalDramaBlendReportPanel`'s "caller decides"
 * convention).
 *
 * - Desktop/tablet (`sm:` and up): horizontal stepper row + one detail panel
 *   below it for the ACTIVE step (evidence, blocking reasons, the single
 *   primary CTA).
 * - Mobile (below `sm:`): vertical accordion — one item per step, the active
 *   step's item starts expanded and carries the same detail content.
 *
 * UX Rules (section-12): exactly one primary CTA at any time (only the
 * ACTIVE step ever renders one); paid actions (`creditSpending !== "none"`)
 * always show a credit-spend confirmation before dispatching; blocked steps
 * explain why in one sentence (mapped `VD_WIZARD_*` reason codes) and offer
 * their own repair CTA when repairable; per-shot/"repair" actions stay
 * visually secondary (outline, never the bold primary button style).
 *
 * Accessibility: every status is TEXT + ICON (never color-only); the stepper
 * is a set of real `<button>`s (keyboard reachable, `aria-current="step"` on
 * the active one); the mobile accordion is the standard Radix
 * `Accordion` (keyboard accessible by default); pending/running state is
 * announced via an `aria-live="polite"` region; the "running" spinner honors
 * `prefers-reduced-motion` via `motion-reduce:animate-none` (matches
 * `VerticalDramaEpisodeWorkspace.tsx`'s existing phase-progress convention).
 *
 * 2026-07-08 W9-B addition (owner directive, section-12 "Pass Semantics —
 * Content Completeness", spec §14.1 rule 6b) — two surfaces:
 *
 *  1. Per-shot dialogue viewer — when data is present, an expandable
 *     "บทพูดจริงรายช็อต" section shows the ACTUAL dialogue lines per shot
 *     (concrete evidence, not just a coverage-seconds number), addressing
 *     the owner's "show me the real dialogue, not just seconds" complaint.
 *     2026-07-08 W9-C wiring — the real source is the top-level
 *     `getEpisodeDetail.perShotDialoguePreview` field (server, W9-A's
 *     `buildPerShotDialoguePreview`/`resolveShotDialogueLines`), threaded
 *     in as this component's own `perShotDialoguePreview` prop (episode-
 *     wide, not per-step — the server computes exactly one array per
 *     episode). `StepDetail` uses the prop ONLY for the `episode_script`
 *     step (the one step this data concerns); `step.perShotDialoguePreview`
 *     (read via `readPerShotDialoguePreview` below) is kept as a fallback
 *     for forward-compat (e.g. a hand-built fixture, or a future per-step
 *     source) — the prop wins whenever it is defined. Every caller that
 *     never passes the prop falls through to that reader unchanged
 *     (byte-identical to before this wave).
 *  2. `step.passState === "incomplete"` / `status === "passed" &&
 *     passState === "failed"` (both landed for real, W9-A — see
 *     `hasContentCompletenessGap` below) — a step must not read as passed
 *     while any completeness criterion is unmet (spec rule 1); this renders
 *     a distinct non-passed state (own icon shape, own text) plus a
 *     headline listing which criteria are still unmet.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDashed,
  ListChecks,
  Loader2,
  Lock,
  MessageSquareText,
  MinusCircle,
  SkipForward,
  XCircle,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  VerticalDramaProductionWizardCriterion,
  VerticalDramaProductionWizardEvidenceRow,
  VerticalDramaProductionWizardPassState,
  VerticalDramaProductionWizardPrimaryAction,
  VerticalDramaProductionWizardStep,
  VerticalDramaProductionWizardStepId,
  VerticalDramaProductionWizardStepStatus,
} from "@shared/verticalDramaSeries/productionWizard";
import {
  vdCopy,
  vdCopyWithParams,
  vdWizardCriterionLabel,
  vdWizardCriterionStatusLabel,
  vdWizardEvidenceIdValue,
  vdWizardIncompleteHeadline,
  vdWizardLoopStateEvidence,
  vdWizardOutOfScopeLine,
  vdWizardPrimaryActionLabel,
  vdWizardReasonLabel,
  vdWizardScorecardOverallEvidence,
  vdWizardScriptCoverageEvidence,
  vdWizardStepDisplayStatusLabel,
  vdWizardStepLabel,
  type VdLocale,
} from "./verticalDramaWorkspaceCopy";

/* -------------------------------------------------------------------------- */
/* Content completeness (2026-07-08 W9-B) — forward-compat types + readers    */
/* -------------------------------------------------------------------------- */

/** One dialogue line inside a `perShotDialoguePreview` shot entry.
 *  `speaker` is optional (matches the server's `buildPerShotDialoguePreview`
 *  return shape, `verticalDramaEpisodes.ts` — sourced from
 *  `ShotDialogueLine.characterKey`, itself optional) — a resolved line does
 *  not always have a known speaker key. */
export type VdWizardPerShotDialoguePreviewLine = {
  speaker?: string;
  line: string;
};

/**
 * One shot's entry in the wizard payload's (forthcoming) `perShotDialogue
 * Preview` array — task-pinned shape: `{shotNumber, lines, overLength,
 * silent}`. `unspeakableSymbols` is an ADDITIONAL forward-compat hook this
 * component watches for defensively (not part of the pinned shape) — see
 * `readPerShotDialoguePreview` below for why this component never derives
 * speakability itself.
 */
export type VdWizardPerShotDialoguePreviewShot = {
  shotNumber: number;
  lines: VdWizardPerShotDialoguePreviewLine[];
  overLength?: boolean;
  silent?: boolean;
  /** Optional forward-compat hook for a per-shot speakability flag (spec
   *  §14.1 rule 6b, `VD_DIALOGUE_UNSPEAKABLE_SYMBOLS`). Absent on every
   *  payload until the concurrent dialogue-quality wave wires a matching
   *  field through — this component never re-derives that rule itself
   *  (only the canonical `analyzeVerticalDramaLineSpeakability`,
   *  `dialogueQuality.ts`, is allowed to decide speakability; see that
   *  module's own "never re-declared locally" principle, spec §14.1
   *  intro). Read defensively (`false`/`undefined` -> no badge). */
  unspeakableSymbols?: boolean;
};

/**
 * Reads the wizard step's optional per-shot dialogue preview (owner
 * directive 2026-07-08, section-12 "Pass Semantics — Content Completeness")
 * — the FALLBACK path, consulted only when `StepDetail`'s own
 * `perShotDialoguePreview` prop is `undefined` (see this file's header
 * comment, W9-C). NOT part of the shared `VerticalDramaProductionWizardStep`
 * contract (`@shared/verticalDramaSeries/productionWizard`) — the real
 * server field (`getEpisodeDetail.perShotDialoguePreview`) is episode-wide,
 * not per-step, so it is threaded in as a prop instead of living on the
 * step. The intersection cast is safe because every field on
 * `VdWizardPerShotDialoguePreviewShot[]` here is read from an OPTIONAL
 * property — a `step` value that genuinely lacks it (every payload today)
 * structurally satisfies the cast target, so this returns `undefined`
 * (byte-identical) for every real payload, and picks it up automatically
 * the moment some future caller sets it directly on a step — no
 * coordinated release needed.
 */
function readPerShotDialoguePreview(
  step: VerticalDramaProductionWizardStep
): VdWizardPerShotDialoguePreviewShot[] | undefined {
  return (
    step as VerticalDramaProductionWizardStep & {
      perShotDialoguePreview?: VdWizardPerShotDialoguePreviewShot[];
    }
  ).perShotDialoguePreview;
}

/**
 * `true` for a "passed" step whose content-completeness override fired
 * (2026-07-08/W9-A, section-12 "Pass Semantics — Content Completeness",
 * `productionWizard.ts`'s `withCompletenessPassStateOverride`, module
 * header decision 12): either `passState === "incomplete"`
 * (`storyboard_shots` — its per-shot image/video prompts aren't all there
 * yet) or `status === "passed" && passState === "failed"`
 * (`episode_script`/`script_qc` — a new completeness criterion reads a
 * definite `false`). Both must render something other than a bare "passed"
 * per the owner's rule 1 ("a step may not show 'ผ่านแล้ว' while any
 * completeness criterion is unmet"). See `vdWizardStepDisplayStatusLabel`
 * (`verticalDramaWorkspaceCopy.ts`) for the matching TEXT-level handling —
 * this is the icon/tone counterpart, kept as one shared predicate so the
 * two files can never drift on which combination counts.
 */
function hasContentCompletenessGap(
  status: VerticalDramaProductionWizardStepStatus,
  passState: VerticalDramaProductionWizardPassState | undefined
): boolean {
  return (
    passState === "incomplete" ||
    (status === "passed" && passState === "failed")
  );
}

const STATUS_ICONS: Record<
  VerticalDramaProductionWizardStepStatus,
  typeof Circle
> = {
  locked: Lock,
  ready: Circle,
  running: Loader2,
  passed: CheckCircle2,
  needs_repair: AlertTriangle,
  optional: MinusCircle,
  skipped: SkipForward,
  blocked: Ban,
};

/** Text/icon tone per status — `needs_repair`/`blocked` render amber (never
 *  a bold destructive red), per section-12's "repair steps keep secondary
 *  styling" rule. The STATUS TEXT itself (`vdWizardStepDisplayStatusLabel`,
 *  rendered alongside this tone everywhere it's used) is what actually
 *  communicates severity — this class only reinforces it, never replaces
 *  it. */
function statusToneClass(
  status: VerticalDramaProductionWizardStepStatus
): string {
  switch (status) {
    case "passed":
      return "text-emerald-600 dark:text-emerald-400";
    case "needs_repair":
    case "blocked":
      return "text-amber-700 dark:text-amber-400";
    case "running":
      return "text-primary";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Icon + tone for a step's status bubble/label, additionally recognizing
 * `passState: "passed_with_warnings"` (2026-07-08 criteria-transparency
 * wave) — renders a DISTINCT amber checkmark (still a check shape, so it
 * reads as "passed", but amber instead of emerald) rather than either the
 * plain emerald "passed" icon or an entirely different shape. The
 * accompanying TEXT (`vdWizardStepDisplayStatusLabel`) is what actually
 * distinguishes it from a clean pass — this only reinforces that, matching
 * `statusToneClass`'s own "never color-only" convention.
 *
 * 2026-07-08/W9-A additions recognize the two `hasContentCompletenessGap`
 * combinations with DIFFERENT icons (matching their different TEXT in
 * `vdWizardStepDisplayStatusLabel` — icon and text should never disagree
 * on how urgent something reads): `passState === "incomplete"` gets a
 * DASHED outline circle — a shape distinct from every other status icon,
 * signaling "still finishing up"; `status === "passed" && passState ===
 * "failed"` reuses the SAME `AlertTriangle` an actual `needs_repair` step
 * already shows, since its text also reuses that step's exact wording.
 */
function stepStatusIcon(
  status: VerticalDramaProductionWizardStepStatus,
  passState: VerticalDramaProductionWizardPassState | undefined
): typeof Circle {
  if (passState === "incomplete") return CircleDashed;
  if (status === "passed" && passState === "failed") return AlertTriangle;
  if (status === "passed" && passState === "passed_with_warnings") return CheckCircle2;
  return STATUS_ICONS[status];
}

function stepStatusToneClass(
  status: VerticalDramaProductionWizardStepStatus,
  passState: VerticalDramaProductionWizardPassState | undefined
): string {
  if (hasContentCompletenessGap(status, passState)) {
    return "text-amber-700 dark:text-amber-400";
  }
  if (status === "passed" && passState === "passed_with_warnings") {
    return "text-amber-700 dark:text-amber-400";
  }
  return statusToneClass(status);
}

export interface VerticalDramaProductionWizardProps {
  locale: VdLocale;
  activeStepId: VerticalDramaProductionWizardStepId;
  steps: VerticalDramaProductionWizardStep[];
  primaryCta: VerticalDramaProductionWizardPrimaryAction;
  /** Dispatches the primary CTA — the caller maps `primaryCta` to the real
   *  existing mutation handler (`runStage` / `regenerateStage` /
   *  `approveCheckpoint` / `runEpisodeQualityReview` /
   *  `applyQualityReviewSuggestions` / etc., section-12's fixed mapping). */
  onPrimaryAction?: () => void;
  primaryActionPending?: boolean;
  /** Precomputed dynamic label for `run_quality_improve_loop` (e.g.
   *  "ปรับอัตโนมัติ (สูงสุด 2 รอบ, ~40 เครดิต)") — this component has no
   *  knowledge of `VerticalDramaQualityPolicy`, so the caller formats it via
   *  `vdCopyWithParams(t.qualityLoopCtaTemplate, {...})` and passes the
   *  finished string. Falls back to the static per-action label when absent. */
  loopCtaLabel?: string;
  /** "ดูรายละเอียด" — every step renders this secondary link, scrolling/
   *  focusing the caller's relevant existing panel section. */
  onViewStepDetails?: (stepId: VerticalDramaProductionWizardStepId) => void;
  /**
   * `getEpisodeDetail`'s top-level `perShotDialoguePreview` (2026-07-08
   * W9-C wiring) — episode-wide, not per-step, since the server computes
   * exactly one array per episode. `StepDetail` uses this for the
   * `episode_script` step's dialogue-preview section ONLY, and only when
   * it is defined; `undefined` (wizard flag off, storyboard not ready yet,
   * or a caller that hasn't wired it) falls back to the per-step
   * `readPerShotDialoguePreview` reader (see this file's header comment).
   */
  perShotDialoguePreview?: VdWizardPerShotDialoguePreviewShot[] | null;
  /**
   * W11.6 "Story Lock" (`verticalDramaSeriesStoryLock`, added 2026-07-08) —
   * owner principle: the story is finalized on the series Overview.
   * Default false (byte-identical rendering to before this wave). When
   * true, `StepDetail` adds one muted informational line to the
   * `episode_script` and `script_qc` steps only — this component never
   * changes any step's criteria labels, gating, or CTA for this flag (the
   * resolver's own gating is untouched).
   */
  storyLockEnabled?: boolean;
  className?: string;
}

export function VerticalDramaProductionWizard({
  locale,
  activeStepId,
  steps,
  primaryCta,
  onPrimaryAction,
  primaryActionPending = false,
  loopCtaLabel,
  onViewStepDetails,
  perShotDialoguePreview,
  storyLockEnabled = false,
  className,
}: VerticalDramaProductionWizardProps) {
  const t = vdCopy(locale);
  const activeStep = useMemo(
    () => steps.find(s => s.stepId === activeStepId) ?? steps[0],
    [steps, activeStepId]
  );

  if (!activeStep) return null;

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border p-3",
        className
      )}
      aria-label={t.wizardStepperAriaLabel}
      data-testid="vd-production-wizard"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <ListChecks aria-hidden="true" className="h-4 w-4" />
        {t.wizardStepperAriaLabel}
      </div>

      {/* Live region — announces pending/running changes for AT users
          without relying on visual-only spinner motion. */}
      <div
        aria-live="polite"
        className="sr-only"
        data-testid="vd-wizard-live-region"
      >
        {primaryActionPending ? t.wizardStatusRunningLabel : ""}
      </div>

      {/* Mobile — vertical accordion (below `sm:`). */}
      <Accordion
        type="single"
        collapsible
        defaultValue={activeStepId}
        className="sm:hidden"
        data-testid="vd-wizard-accordion"
      >
        {steps.map(step => (
          <AccordionItem
            key={step.stepId}
            value={step.stepId}
            data-testid={`vd-wizard-accordion-item-${step.stepId}`}
          >
            <AccordionTrigger className="py-3 text-sm">
              <StepStatusLabel
                locale={locale}
                step={step}
                isActive={step.stepId === activeStepId}
              />
            </AccordionTrigger>
            <AccordionContent>
              <StepDetail
                locale={locale}
                step={step}
                isActive={step.stepId === activeStepId}
                primaryCta={primaryCta}
                onPrimaryAction={onPrimaryAction}
                primaryActionPending={primaryActionPending}
                loopCtaLabel={loopCtaLabel}
                onViewStepDetails={onViewStepDetails}
                perShotDialoguePreview={perShotDialoguePreview}
                storyLockEnabled={storyLockEnabled}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Tablet/desktop — horizontal stepper row + one active-step detail panel. */}
      <div className="hidden sm:block">
        <ol
          className="flex flex-wrap items-center gap-1"
          data-testid="vd-wizard-stepper"
        >
          {steps.map((step, i) => (
            <li key={step.stepId} className="flex items-center gap-1">
              <StepBubble
                locale={locale}
                step={step}
                isActive={step.stepId === activeStepId}
                onSelect={() => onViewStepDetails?.(step.stepId)}
              />
              {i < steps.length - 1 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
              ) : null}
            </li>
          ))}
        </ol>

        <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
          <StepDetail
            locale={locale}
            step={activeStep}
            isActive
            primaryCta={primaryCta}
            onPrimaryAction={onPrimaryAction}
            primaryActionPending={primaryActionPending}
            loopCtaLabel={loopCtaLabel}
            onViewStepDetails={onViewStepDetails}
            perShotDialoguePreview={perShotDialoguePreview}
            storyLockEnabled={storyLockEnabled}
          />
        </div>
      </div>
    </section>
  );
}

function StepStatusLabel({
  locale,
  step,
  isActive,
}: {
  locale: VdLocale;
  step: VerticalDramaProductionWizardStep;
  isActive: boolean;
}) {
  const t = vdCopy(locale);
  const Icon = stepStatusIcon(step.status, step.passState);
  return (
    <span className="flex flex-1 items-center gap-2 text-left">
      <Icon
        aria-hidden="true"
        className={cn(
          "h-4 w-4 shrink-0",
          stepStatusToneClass(step.status, step.passState),
          step.status === "running" && "animate-spin motion-reduce:animate-none"
        )}
      />
      <span className="min-w-0 flex-1 truncate font-medium">
        {vdWizardStepLabel(step.stepId, locale)}
      </span>
      {isActive ? (
        <Badge variant="default" className="shrink-0 text-[10px]">
          {t.wizardNextUpLabel}
        </Badge>
      ) : null}
      <span
        className={cn(
          "shrink-0 text-[10px] font-medium uppercase tracking-wide",
          stepStatusToneClass(step.status, step.passState)
        )}
      >
        {vdWizardStepDisplayStatusLabel(step.status, step.passState, locale)}
      </span>
    </span>
  );
}

/**
 * Desktop stepper bubble — the ENTIRE bubble is the "ดูรายละเอียด" target for
 * every step (not just the active one), since `StepDetail`'s own explicit
 * "ดูรายละเอียด" button only exists inside the currently-active step's detail
 * panel. On mobile, the equivalent per-step reach is the accordion trigger
 * itself: Radix `Accordion` (without `forceMount`) does not mount a
 * collapsed item's content at all, so a non-expanded step's own
 * "ดูรายละเอียด" button is not in the DOM until the user taps to expand it —
 * a standard, acceptable accordion interaction (expand, then view detail),
 * not a bug.
 */
function StepBubble({
  locale,
  step,
  isActive,
  onSelect,
}: {
  locale: VdLocale;
  step: VerticalDramaProductionWizardStep;
  isActive: boolean;
  onSelect: () => void;
}) {
  const t = vdCopy(locale);
  const Icon = stepStatusIcon(step.status, step.passState);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "step" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-accent/50"
      )}
      data-testid={`vd-wizard-step-${step.stepId}`}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "h-4 w-4",
          stepStatusToneClass(step.status, step.passState),
          step.status === "running" && "animate-spin motion-reduce:animate-none"
        )}
      />
      <span className="max-w-[92px] truncate text-[11px] font-medium">
        {vdWizardStepLabel(step.stepId, locale)}
      </span>
      <span
        className={cn(
          "text-[9px] uppercase tracking-wide",
          stepStatusToneClass(step.status, step.passState)
        )}
      >
        {vdWizardStepDisplayStatusLabel(step.status, step.passState, locale)}
      </span>
      {isActive ? <span className="sr-only">{t.wizardNextUpLabel}</span> : null}
    </button>
  );
}

const CREDIT_SPENDING_LABEL_KEYS = new Set(["llm", "image", "video", "tts"]);

function StepDetail({
  locale,
  step,
  isActive,
  primaryCta,
  onPrimaryAction,
  primaryActionPending,
  loopCtaLabel,
  onViewStepDetails,
  perShotDialoguePreview,
  storyLockEnabled = false,
}: {
  locale: VdLocale;
  step: VerticalDramaProductionWizardStep;
  isActive: boolean;
  primaryCta: VerticalDramaProductionWizardPrimaryAction;
  onPrimaryAction?: () => void;
  primaryActionPending: boolean;
  loopCtaLabel?: string;
  onViewStepDetails?: (stepId: VerticalDramaProductionWizardStepId) => void;
  /** Episode-wide dialogue preview (2026-07-08 W9-C, see this file's header
   *  comment) — used only for the `episode_script` step; `undefined` falls
   *  back to `readPerShotDialoguePreview(step)`. */
  perShotDialoguePreview?: VdWizardPerShotDialoguePreviewShot[] | null;
  /** W11.6 "Story Lock" — see `VerticalDramaProductionWizardProps.storyLockEnabled`'s doc comment. */
  storyLockEnabled?: boolean;
}) {
  const t = vdCopy(locale);
  const [confirmingPaid, setConfirmingPaid] = useState(false);

  // `isActive` alone is authoritative — the resolver guarantees
  // `primaryCta === activeStep.primaryAction` (see
  // `deriveVerticalDramaProductionWizardState`'s `active` computation), so
  // this never depends on comparing action strings across steps (which could
  // theoretically collide if two steps ever computed the same action).
  const showPrimaryCta = isActive && step.primaryAction !== "none";
  const isPaid = step.creditSpending !== "none";
  const ctaLabel =
    step.primaryAction === "run_quality_improve_loop" && loopCtaLabel
      ? loopCtaLabel
      : vdWizardPrimaryActionLabel(step.primaryAction, locale);
  const isLocked = step.status === "locked";
  // 2026-07-08/W9-C — the `episode_script` step's viewer prefers the real,
  // episode-wide `perShotDialoguePreview` prop (see this file's header
  // comment); every other step, and `episode_script` itself when the prop
  // is `undefined` (caller hasn't wired it, wizard flag off, or storyboard
  // not ready yet), falls back to `readPerShotDialoguePreview(step)` — which
  // still reads `undefined` for every real payload today (byte-identical).
  const dialoguePreview =
    step.stepId === "episode_script" && perShotDialoguePreview !== undefined
      ? perShotDialoguePreview
      : readPerShotDialoguePreview(step);
  const incompleteHeadlineText = hasContentCompletenessGap(
    step.status,
    step.passState
  )
    ? vdWizardIncompleteHeadline(step.criteria ?? [], locale)
    : null;

  function handlePrimaryClick() {
    if (isPaid && !confirmingPaid) {
      setConfirmingPaid(true);
      return;
    }
    setConfirmingPaid(false);
    onPrimaryAction?.();
  }

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`vd-wizard-detail-${step.stepId}`}
    >
      {incompleteHeadlineText ? (
        <p
          className="flex items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-400"
          data-testid={`vd-wizard-incomplete-headline-${step.stepId}`}
        >
          <CircleDashed
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          {incompleteHeadlineText}
        </p>
      ) : null}

      {/* W11.6 "Story Lock" — one muted informational line, script/quality
          steps only; criteria labels/gating/CTA are unchanged. */}
      {storyLockEnabled &&
      (step.stepId === "episode_script" || step.stepId === "script_qc") ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`vd-wizard-story-lock-note-${step.stepId}`}
        >
          {t.wizardStoryLockNote}
        </p>
      ) : null}

      {step.blockingReasons.length > 0 ? (
        <div
          className="flex flex-col gap-1"
          data-testid={`vd-wizard-blocking-reasons-${step.stepId}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t.wizardBlockingReasonsTitle}
          </p>
          <ul className="list-inside list-disc text-xs text-amber-800 dark:text-amber-400">
            {step.blockingReasons.map(code => (
              <li key={code}>{vdWizardReasonLabel(code, locale)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {step.criteria && step.criteria.length > 0 ? (
        <div
          className="flex flex-col gap-1"
          data-testid={`vd-wizard-criteria-${step.stepId}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t.wizardCriteriaTitle}
          </p>
          <ul className="grid gap-1">
            {step.criteria.map(criterion => (
              <CriterionRow key={criterion.id} criterion={criterion} locale={locale} />
            ))}
          </ul>
        </div>
      ) : null}

      {step.evidence.length > 0 ? (
        <div
          className="flex flex-col gap-1"
          data-testid={`vd-wizard-evidence-${step.stepId}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t.wizardEvidenceTitle}
          </p>
          <ul className="grid gap-1">
            {step.evidence.map((row, i) => (
              <EvidenceRow key={i} row={row} locale={locale} />
            ))}
          </ul>
        </div>
      ) : null}

      {step.outOfScopeNotes && step.outOfScopeNotes.length > 0 ? (
        <div
          className="flex flex-col gap-0.5"
          data-testid={`vd-wizard-out-of-scope-${step.stepId}`}
        >
          {step.outOfScopeNotes.map(note => (
            <p key={note.id} className="text-[11px] italic text-muted-foreground">
              {vdWizardOutOfScopeLine(note, locale)}
            </p>
          ))}
        </div>
      ) : null}

      {dialoguePreview && dialoguePreview.length > 0 ? (
        <details
          className="rounded-md border p-2 text-xs [&_summary::-webkit-details-marker]:hidden"
          data-testid={`vd-wizard-dialogue-preview-${step.stepId}`}
        >
          <summary className="flex cursor-pointer items-center gap-1.5 py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            <MessageSquareText
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0"
            />
            {t.wizardDialoguePreviewTitle}
          </summary>
          <ul
            className="mt-2 grid gap-2"
            data-testid={`vd-wizard-dialogue-preview-shots-${step.stepId}`}
          >
            {dialoguePreview.map(shot => (
              <DialoguePreviewShotRow
                key={shot.shotNumber}
                shot={shot}
                locale={locale}
              />
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {isPaid && CREDIT_SPENDING_LABEL_KEYS.has(step.creditSpending) ? (
          <Badge
            variant="outline"
            className="text-[10px]"
            data-testid={`vd-wizard-credit-chip-${step.stepId}`}
          >
            {t.wizardCreditChipLabel}
          </Badge>
        ) : null}
        {onViewStepDetails ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => onViewStepDetails(step.stepId)}
            data-testid={`vd-wizard-view-details-${step.stepId}`}
          >
            {t.wizardViewDetails}
          </Button>
        ) : null}
      </div>

      {showPrimaryCta ? (
        <div className="flex flex-col gap-2">
          <AlertDialog open={confirmingPaid} onOpenChange={setConfirmingPaid}>
            <AlertDialogContent data-testid="vd-wizard-paid-confirm">
              <AlertDialogHeader>
                <AlertDialogTitle>{t.wizardPaidConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block">{t.wizardPaidConfirmNote}</span>
                  <span className="mt-1 block font-medium text-foreground">
                    {ctaLabel}
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={primaryActionPending}>
                  {t.cancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handlePrimaryClick}
                  disabled={primaryActionPending}
                  data-testid="vd-wizard-paid-confirm-submit"
                >
                  {primaryActionPending ? (
                    <Loader2
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    />
                  ) : null}
                  {t.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <PrimaryCtaButton
            locale={locale}
            label={ctaLabel}
            pending={primaryActionPending}
            disabled={isLocked}
            disabledReason={
              isLocked && step.blockingReasons.length > 0
                ? step.blockingReasons
                    .map(code => vdWizardReasonLabel(code, locale))
                    .join(" ")
                : undefined
            }
            onClick={handlePrimaryClick}
            stepId={step.stepId}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One shot's row inside the "บทพูดจริงรายช็อต" (actual dialogue per shot)
 * expandable section (2026-07-08 W9-B, owner directive) — header "ช็อต N"
 * (reuses the density meter's own `densityShotLabelTemplate`, spec's "same
 * phrase reads identically across surfaces" convention) plus badges, then
 * the VERBATIM lines. Badge order left-to-right is not itself a priority
 * ranking (all three can show together, unlike the density meter's single-
 * badge chip) — each is an independent, concrete fact about this shot.
 */
function DialoguePreviewShotRow({
  shot,
  locale,
}: {
  shot: VdWizardPerShotDialoguePreviewShot;
  locale: VdLocale;
}) {
  const t = vdCopy(locale);
  // Belt-and-suspenders (module header, `VdWizardPerShotDialoguePreviewShot`
  // doc comment): trust the explicit `silent` flag when present, but an
  // objectively empty `lines` array reads as "no dialogue" regardless, so a
  // fixture/payload that leaves `silent` unset never silently renders an
  // empty list with no explanation.
  const noDialogue = shot.silent === true || shot.lines.length === 0;
  return (
    <li
      className="rounded border border-border/60 p-2"
      data-testid={`vd-wizard-dialogue-preview-shot-${shot.shotNumber}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">
          {vdCopyWithParams(t.densityShotLabelTemplate, { n: shot.shotNumber })}
        </span>
        {noDialogue ? (
          <Badge
            variant="outline"
            className="text-[10px] text-amber-700 dark:text-amber-400"
            data-testid={`vd-wizard-dialogue-preview-badge-no-dialogue-${shot.shotNumber}`}
          >
            {t.wizardDialoguePreviewNoDialogueBadge}
          </Badge>
        ) : null}
        {shot.overLength ? (
          <Badge
            variant="outline"
            className="text-[10px] text-destructive"
            data-testid={`vd-wizard-dialogue-preview-badge-over-length-${shot.shotNumber}`}
          >
            {t.wizardDialoguePreviewOverLengthBadge}
          </Badge>
        ) : null}
        {shot.unspeakableSymbols ? (
          <Badge
            variant="outline"
            className="text-[10px] text-amber-700 dark:text-amber-400"
            data-testid={`vd-wizard-dialogue-preview-badge-unspeakable-${shot.shotNumber}`}
          >
            {t.densityUnspeakableSymbolsBadge}
          </Badge>
        ) : null}
      </div>
      {noDialogue ? (
        <p className="mt-1 italic text-muted-foreground">
          {t.wizardDialoguePreviewNoLinesPlaceholder}
        </p>
      ) : (
        <ul className="mt-1 grid gap-1">
          {shot.lines.map((line, i) => (
            <DialoguePreviewLineRow
              key={i}
              // `speaker` is optional on the real payload (a resolved line
              // does not always have a known character key) — "—" matches
              // the same unresolved-speaker placeholder already used for
              // dialogue lines elsewhere (`VerticalDramaStoryboardPanel.tsx`,
              // `portrait?.name ?? line.characterKey ?? "—"`).
              speaker={line.speaker ?? "—"}
              line={line.line}
              locale={locale}
              testId={`vd-wizard-dialogue-preview-line-${shot.shotNumber}-${i}`}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A line's text past this length gets truncated (2 lines via `line-clamp-2`)
 *  with a "แสดงทั้งหมด/ย่อ" toggle — long dialogue lines are real in vertical
 *  drama scripts and must not blow out the step-detail panel's layout. */
const DIALOGUE_PREVIEW_LINE_TRUNCATE_LENGTH = 140;

/**
 * Renders one "ผู้พูด: ข้อความ" line VERBATIM (normal reading text, no
 * monospace) — the owner's core ask for this wave: concrete dialogue
 * evidence, not just a seconds total. Keyboard-accessible expand/collapse
 * via a native `<button aria-expanded>` (no extra JS framework needed).
 */
function DialoguePreviewLineRow({
  speaker,
  line,
  locale,
  testId,
}: {
  speaker: string;
  line: string;
  locale: VdLocale;
  testId: string;
}) {
  const t = vdCopy(locale);
  const [expanded, setExpanded] = useState(false);
  const text = vdCopyWithParams(t.wizardDialoguePreviewLineTemplate, {
    speaker,
    line,
  });
  const isLong = text.length > DIALOGUE_PREVIEW_LINE_TRUNCATE_LENGTH;
  return (
    <li className="leading-relaxed" data-testid={testId}>
      <span className={cn(!expanded && isLong && "line-clamp-2")}>{text}</span>
      {isLong ? (
        <button
          type="button"
          className="ml-1 text-[10px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          data-testid={`${testId}-toggle`}
        >
          {expanded
            ? t.wizardDialoguePreviewShowLess
            : t.wizardDialoguePreviewShowMore}
        </button>
      ) : null}
    </li>
  );
}

function EvidenceRow({
  row,
  locale,
}: {
  row: VerticalDramaProductionWizardEvidenceRow;
  locale: VdLocale;
}) {
  const toneClass =
    row.severity === "error"
      ? "text-destructive"
      : row.severity === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";
  // Severity as an ICON too (not color-only) — error/warning/default(info)
  // each get a visually distinct shape, mirroring TieInReportCard's
  // ViolationRow "ok ? CheckCircle2 : AlertTriangle" convention.
  const Icon =
    row.severity === "error"
      ? AlertTriangle
      : row.severity === "warning"
        ? Circle
        : CheckCircle2;
  // Wave-7E (2026-07-08 fix) — the `episode_script` step's speech-coverage
  // row carries a structured `scriptCoverage` payload when real numbers are
  // available; render a fully localized, numeric label/value from it
  // instead of this row's English `label`/raw-enum `value` fallback.
  // 2026-07-08 criteria-transparency wave — generalizes the SAME pattern
  // file-wide: `scorecardOverall`/`loopState` (dedicated structured fields)
  // and `evidenceId` (the generic fallback covering every OTHER row) each
  // render a fully localized `{label, value}` pair instead of English
  // fallback text/raw enum passthroughs. A row with none of these (legacy
  // hand-built fixtures) renders exactly as before.
  const { label, value } = row.scriptCoverage
    ? vdWizardScriptCoverageEvidence(row.scriptCoverage, locale)
    : row.scorecardOverall
      ? vdWizardScorecardOverallEvidence(row.scorecardOverall, locale)
      : row.loopState
        ? vdWizardLoopStateEvidence(row.loopState, locale)
        : row.evidenceId
          ? vdWizardEvidenceIdValue(row.evidenceId, row.detail, locale)
          : row;
  return (
    <li
      className={cn(
        "flex items-baseline justify-between gap-2 text-xs",
        toneClass
      )}
    >
      <span className="flex min-w-0 items-center gap-1 truncate">
        <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <span className="shrink-0 font-medium">{value}</span>
    </li>
  );
}

/**
 * One line of a step's "เกณฑ์ของขั้นนี้" (this step's criteria) checklist
 * (2026-07-08 criteria-transparency wave, spec owner confusion #2 — "no
 * step exposes its pass criteria"). `criterion.passed` drives BOTH an icon
 * shape (✓/⚠/✗) AND an explicit text badge (never color/icon-only, mirrors
 * `EvidenceRow`'s own severity convention) — the left side names WHAT is
 * checked (`vdWizardCriterionLabel`), the right side shows whether it
 * passed plus any pre-formatted number (`criterion.detail`).
 */
function CriterionRow({
  criterion,
  locale,
}: {
  criterion: VerticalDramaProductionWizardCriterion;
  locale: VdLocale;
}) {
  const toneClass =
    criterion.passed === true
      ? "text-emerald-600 dark:text-emerald-400"
      : criterion.passed === false
        ? "text-destructive"
        : "text-amber-700 dark:text-amber-400";
  const Icon =
    criterion.passed === true ? CheckCircle2 : criterion.passed === false ? XCircle : AlertTriangle;
  const statusText = vdWizardCriterionStatusLabel(criterion.passed, locale);
  return (
    <li
      className={cn("flex items-baseline justify-between gap-2 text-xs", toneClass)}
      data-testid={`vd-wizard-criterion-${criterion.id}`}
    >
      <span className="flex min-w-0 items-center gap-1 truncate">
        <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 truncate">{vdWizardCriterionLabel(criterion.id, locale)}</span>
      </span>
      <span className="shrink-0 text-right font-medium">
        {criterion.detail ? `${statusText} (${criterion.detail})` : statusText}
      </span>
    </li>
  );
}

/** The single primary CTA button — when `disabled` (locked step reached via
 *  "ดูรายละเอียด" navigation, not the active step in the normal flow), it
 *  stays focusable (`aria-disabled`, not the native `disabled` attribute) so
 *  a keyboard/AT user can still reach it and hear WHY via the tooltip,
 *  rather than the button silently dropping out of the tab order. */
function PrimaryCtaButton({
  locale,
  label,
  pending,
  disabled,
  disabledReason,
  onClick,
  stepId,
}: {
  locale: VdLocale;
  label: string;
  pending: boolean;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
  stepId: VerticalDramaProductionWizardStepId;
}) {
  const t = vdCopy(locale);
  const button = (
    <Button
      type="button"
      className="w-full max-w-full gap-1.5 whitespace-normal text-center sm:w-fit"
      aria-disabled={disabled || pending}
      onClick={() => {
        if (disabled || pending) return;
        onClick();
      }}
      data-testid={`vd-wizard-primary-cta-${stepId}`}
    >
      {pending ? (
        <Loader2
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
        />
      ) : null}
      {pending ? t.wizardStatusRunningLabel : label}
    </Button>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }
  return button;
}

export default VerticalDramaProductionWizard;
