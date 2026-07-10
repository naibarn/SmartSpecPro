/**
 * Vertical Drama Series — guided Production Wizard state resolver (spec
 * §8.8, §16.1, §13.1, §7.7.3, §17; section-12-production-wizard-guided-
 * workflow.md, added 2026-07-07/Wave-4B).
 *
 * Pure, deterministic, provider-free contract + resolver — no server/db
 * imports, safe for both client and server (mirrors `dialogueQuality.ts`).
 * `deriveVerticalDramaProductionWizardState` takes a plain, serializable
 * snapshot of an episode's already-computed state (artifact presence,
 * scorecard, loop state, dialogue-quality issues, etc. — every field is
 * something the CALLER already has or can cheaply derive from persisted
 * rows) and returns the wizard's step list, active step, and single primary
 * CTA. This module never touches a database, an LLM, or a run/repair
 * mutation — see section-12 "Recommended Implementation / Server" for how a
 * future router wave assembles the input and wires the CTAs to the shipped
 * `verticalDramaEpisodes` mutations.
 *
 * Required Steps (spec §8.8 order): series_setup -> episode_script ->
 * storyboard_shots -> script_qc -> start_frames -> dialogue_audio ->
 * dialogue_qc -> video_prompts -> shot_repair -> video_clips ->
 * final_episode.
 *
 * Documented interpretive decisions (section-12 leaves these open / the
 * fixed contract can't literally express them):
 *
 *  1. Status "locked" vs "blocked": every NAMED Main Flow Gate in
 *     section-12 ("must be locked until...") produces "locked" on the
 *     step it locks. "blocked" is reserved for `dialogue_qc`'s own status
 *     when the dialogue plan EXISTS but its deterministic QC contains
 *     error-severity issues (section-12: "dialogue QC has no blocking
 *     `error` issues") — a step whose artifact exists but fails
 *     evaluation, as opposed to a step whose prerequisite doesn't exist
 *     yet.
 *  2. Quality-loop escalation CTA: spec §16.1 says escalation "switches
 *     the CTA to manual repair," but section-12's fixed `primaryAction`
 *     union has no "manual repair" member. This resolver falls back to
 *     `run_quality_review` (re-review after the user manually edits the
 *     script/storyboard/tie-in placement out of band) — the loop itself is
 *     never re-offered once escalated or once `maxAutoImproveRounds` is 0.
 *  3. Arc re-plan is ADVISORY on `script_qc`: it is always included in
 *     `blockingReasons`/`evidence` when pending, but — unlike the
 *     scorecard-floor/loop-escalation/tie-in checks — it never by itself
 *     flips the step's `status` away from "passed". Its resolution lives on
 *     a different surface (the series Memory review page), not inside this
 *     episode's wizard, so there is no in-wizard primary action for it.
 *  4. (Superseded 2026-07-08, acceptance-review fix #6 — see
 *     `VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED`'s own doc comment.) Originally
 *     `VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR` doubled as the reason
 *     `start_frames` is locked when the script-quality scorecard has never
 *     been produced yet (Gate 0b locks on the scorecard not EXISTING, not
 *     only on failing it) — section-12's fixed 13-code list had no separate
 *     "not yet reviewed" code, so this read (misleadingly) as "floor not yet
 *     confirmed met" even though nothing had ever actually been reviewed.
 *     `computeStartFramesStep`'s fallback branch now emits the distinct
 *     `VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED` code instead in that specific
 *     case; `script_qc`'s own REAL reasons (an actual floor/loop/tie-in
 *     failure) still pass through unchanged.
 *  5. `VD_WIZARD_DIALOGUE_UNDERFILLED` is the single wizard-level code for
 *     ANY error-severity `dialogueQuality.ts` issue (episode underfill,
 *     duplicate lines, stage directions) — the fixed code list has one
 *     dialogue-blocking code; the precise underlying issue code stays
 *     available via the caller's own `episodeDialogueQuality.issues`.
 *  6. `VD_WIZARD_VIDEO_PROMPTS_STALE` covers BOTH "pack was never
 *     generated" and "pack exists but is stale" when locking `video_clips`
 *     — same one-code-covers-a-family reasoning as (5).
 *  7. Grandfathering (spec §17) is modeled as `gateExemptStepIds:
 *     VerticalDramaProductionWizardStepId[]`, not
 *     `VerticalDramaPipelineStage[]` as section-12's Recommended
 *     Implementation loosely suggests — `script_qc` and `dialogue_qc`, the
 *     two steps grandfathering exists FOR (the QualityLoopV2/TieInQc-gated
 *     ones), are QC layers, not members of `VerticalDramaPipelineStage` at
 *     all, so that type cannot name them. The wizard's own step-id union is
 *     the smallest type that can cover every step grandfathering needs.
 *  8. `flags.speechBudget` and `flags.productionWizard` are accepted for
 *     input-shape completeness (section-12 lists all five flags as
 *     resolver input) but are currently INERT — `productionWizard` gates
 *     whether the caller renders/uses this resolver's output at all
 *     (caller-side, per section-12's Recommended Implementation), and no
 *     bullet in section-12's gating rules ties a distinct behavior to
 *     `speechBudget` beyond what `episodeDialogueQuality`/coverage inputs
 *     already carry.
 *  9. `"running"` and `"skipped"` are valid `status` values (part of the
 *     pinned contract) that this resolver never produces from static
 *     snapshot input alone — this module has no notion of "a mutation is
 *     currently in flight" (that lives in the router/live-run layer) or of
 *     an episode explicitly opting a step out. Both remain available for a
 *     future caller to overlay onto this resolver's output.
 * 10. Criteria-transparency wave (2026-07-08, section-12-production-wizard
 *     owner-facing follow-up) — `criteria`/`passState`/`outOfScopeNotes` are
 *     ADDITIVE and OPTIONAL on `VerticalDramaProductionWizardStep` (never
 *     required) specifically so the small number of OTHER files across the
 *     codebase that hand-construct a `VerticalDramaProductionWizardStep`
 *     fixture directly (component tests outside this wave's file list) keep
 *     type-checking unchanged; the real resolver below always populates all
 *     three on every step it returns. `passState` is DERIVED, never set
 *     per-step by hand: `makeStep` computes it from `status` + `criteria`
 *     (mirrors how `repairable` is already auto-derived there) so the
 *     "passed but one non-blocking criterion reads false/null ->
 *     passed_with_warnings" rule holds everywhere by construction, not by
 *     per-step discipline. A criterion's `passed` is `false` for a
 *     definite/checkable "does X exist or hold" fact that is currently
 *     unmet, and `null` for a fact that cannot be evaluated yet because the
 *     artifact it measures does not exist (e.g. a quality floor when no
 *     scorecard has ever been produced) — this distinction is what lets a
 *     "ready"/never-attempted step stay `passState: "not_applicable"`
 *     (derived from `status` alone) rather than misreporting warnings.
 *     `episode_script`'s `coverage_at_least_minimum` /
 *     `coverage_in_recommended_band` criteria intentionally reuse ONLY
 *     `input.script.coverageStatus`/`coverageDetail` (the same single data
 *     source the pre-existing evidence row already reads) rather than
 *     cross-referencing the density meter's separately-computed, storyboard-
 *     duration-grounded band (`dialogueQuality.ts`'s
 *     `analyzeVerticalDramaEpisodeDialogueQuality`, surfaced instead via
 *     `input.episodeDialogueQuality` on `dialogue_qc`) — the two bands can
 *     legitimately disagree (script-generation-time default clip-duration
 *     profile vs. the real storyboard's shot durations), and reconciling
 *     them into one number is a separate, larger change outside "criteria
 *     from the existing inputs."
 * 11. Evidence-row localization (same wave) — every OTHER evidence row's
 *     `label`/`value` strings stay EXACTLY as they were (byte-identical;
 *     several existing tests assert on them verbatim) and a NEW, purely
 *     additive `evidenceId` (a machine id identifying this exact row+state)
 *     plus optional `detail` (pre-formatted numbers only, same "numbers
 *     only" rule as `criteria[].detail`) let a locale-aware caller render a
 *     fully localized row instead — same pattern as the Wave-7E
 *     `scriptCoverage` fix, generalized file-wide. `scorecardOverall` and
 *     `loopState` get their OWN dedicated structured fields rather than
 *     folding into the generic `evidenceId` scheme because they carry real
 *     numbers/an already-shared enum type (`VerticalDramaProductionWizard
 *     QualityLoopStatus`) worth keeping strongly typed.
 */

import type { VerticalDramaPipelineStage } from "./contracts";
import {
  evaluateScorecardAgainstPolicy,
  type VerticalDramaQualityLoopStatus,
  type VerticalDramaQualityPolicy,
  type VerticalDramaQualityScorecardDimensions,
} from "./qualityPolicy";
import type { VerticalDramaEpisodeDialogueQuality } from "./dialogueQuality";

/* -------------------------------------------------------------------------- */
/* Step id / status / primary action / credit-spend enums (section-12)        */
/* -------------------------------------------------------------------------- */

/** Fixed production order (spec §8.8). */
export const VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS = [
  "series_setup",
  "episode_script",
  "storyboard_shots",
  "script_qc",
  "start_frames",
  "dialogue_audio",
  "dialogue_qc",
  "video_prompts",
  "shot_repair",
  "video_clips",
  "final_episode",
] as const;

export type VerticalDramaProductionWizardStepId =
  (typeof VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS)[number];

export const VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_STATUSES = [
  "locked",
  "ready",
  "running",
  "passed",
  "needs_repair",
  "optional",
  "skipped",
  "blocked",
] as const;

export type VerticalDramaProductionWizardStepStatus =
  (typeof VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_STATUSES)[number];

export const VERTICAL_DRAMA_PRODUCTION_WIZARD_PRIMARY_ACTIONS = [
  "complete_series_setup",
  "generate_script",
  "run_quality_review",
  "run_quality_improve_loop",
  "generate_storyboard",
  "approve_start_frames",
  "generate_dialogue_plan",
  "repair_dialogue",
  "generate_video_prompts",
  "repair_shots",
  "generate_video_clips",
  "assemble_episode",
  "none",
] as const;

export type VerticalDramaProductionWizardPrimaryAction =
  (typeof VERTICAL_DRAMA_PRODUCTION_WIZARD_PRIMARY_ACTIONS)[number];

export const VERTICAL_DRAMA_PRODUCTION_WIZARD_CREDIT_SPENDING_CLASSES = [
  "none",
  "llm",
  "image",
  "video",
  "tts",
] as const;

export type VerticalDramaProductionWizardCreditSpending =
  (typeof VERTICAL_DRAMA_PRODUCTION_WIZARD_CREDIT_SPENDING_CLASSES)[number];

/** Stable blocking reason codes (section-12 "Server" — exact fixed list).
 *  `VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED` (2026-07-08 acceptance-review fix
 *  #6) is additive to that fixed list — see module header, decision 4, for
 *  why the ORIGINAL 13-code list overloaded
 *  `VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR` for this case, and why that read as
 *  misleading ("the score failed the floor") when script_qc has never even
 *  run once. */
export const VERTICAL_DRAMA_WIZARD_BLOCKING_REASON_CODES = [
  "VD_WIZARD_SCRIPT_MISSING",
  "VD_WIZARD_SCRIPT_UNDERFILLED",
  "VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR",
  "VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED",
  "VD_WIZARD_QUALITY_LOOP_ESCALATED",
  "VD_WIZARD_TIE_IN_BELOW_FLOOR",
  "VD_WIZARD_ARC_REPLAN_PENDING",
  "VD_WIZARD_STORYBOARD_MISSING",
  "VD_WIZARD_START_FRAMES_NOT_APPROVED",
  "VD_WIZARD_DIALOGUE_PLAN_MISSING",
  "VD_WIZARD_DIALOGUE_UNDERFILLED",
  "VD_WIZARD_VIDEO_PROMPTS_STALE",
  "VD_WIZARD_VIDEO_CLIPS_INCOMPLETE",
  "VD_WIZARD_ASSEMBLY_BLOCKED",
] as const;

export type VerticalDramaProductionWizardBlockingReasonCode =
  (typeof VERTICAL_DRAMA_WIZARD_BLOCKING_REASON_CODES)[number];

/* -------------------------------------------------------------------------- */
/* Step / state output contracts (section-12 "Shared Contracts")              */
/* -------------------------------------------------------------------------- */

export type VerticalDramaProductionWizardEvidenceSeverity =
  | "info"
  | "warning"
  | "error";

export type VerticalDramaProductionWizardEvidenceRow = {
  label: string;
  value: string;
  severity?: VerticalDramaProductionWizardEvidenceSeverity;
  /**
   * Wave-7E (2026-07-08 fix) — optional structured payload for ONLY the
   * `episode_script` step's speech-coverage evidence row, populated
   * whenever the caller supplied `input.script.coverageDetail` (i.e. the
   * speech-budget flag is on and a real `evaluateScriptSpeechCoverage`
   * result exists for this episode). This resolver has no locale awareness
   * (see module header) — `label`/`value` above stay this row's English
   * fallback text — so a locale-aware caller
   * (`VerticalDramaProductionWizard.tsx`) uses THIS structured data instead
   * to render a fully localized, numeric row and NEVER the raw
   * `ScriptSpeechCoverageStatus` string. `undefined` for every other
   * evidence row in this file (unchanged), and for this same row when
   * `coverageDetail` was absent (flags-off byte-identical path).
   */
  scriptCoverage?: {
    status: VerticalDramaProductionWizardScriptCoverageStatus;
    estimatedSpeechSeconds: number;
    targetSpeechSecondsMin: number;
    targetSpeechSecondsMax: number;
  };
  /** 2026-07-08 criteria-transparency wave — structured payload for ONLY
   *  `script_qc`'s "Scorecard overall" row (see module header, decision 11).
   *  `overall: null` means no scorecard has ever been produced yet (the
   *  pre-existing "Not reviewed" case). */
  scorecardOverall?: { overall: number | null; minOverall: number };
  /** Structured payload for ONLY `script_qc`'s "Auto-improve loop" row —
   *  the bare loop-status enum, reused verbatim from resolver input so a
   *  caller's copy map is the single source of truth for every state's
   *  text (including `"not_run"`). */
  loopState?: VerticalDramaProductionWizardQualityLoopStatus;
  /** Machine id for every OTHER evidence row in this file (module header,
   *  decision 11) — identifies this exact row+state so a locale-aware
   *  caller renders a fully localized `{label, value}` pair instead of the
   *  English fallback above. */
  evidenceId?: VerticalDramaProductionWizardEvidenceId;
  /** Pre-formatted NUMBERS only (e.g. `"4/9"`) — substituted into the
   *  localized value template for `evidenceId` when present. Same "numbers
   *  only, no English words" rule as `criteria[].detail`. */
  detail?: string;
};

/** Fixed vocabulary of every evidence row this resolver ever emits, EXCEPT
 *  the ones covered by a dedicated structured field (`scriptCoverage`,
 *  `scorecardOverall`, `loopState`) — module header, decision 11. */
export const VERTICAL_DRAMA_WIZARD_EVIDENCE_IDS = [
  "series_setup_complete",
  "series_setup_incomplete",
  "episode_script_needs_series_setup",
  "episode_script_not_started",
  // Acceptance-review fix #4 (2026-07-08, dormant leak) — one id per
  // `VerticalDramaProductionWizardScriptCoverageStatus` value for the
  // `episode_script` speech-coverage evidence row's FLAGS-OFF fallback
  // branch (`coverageDetail` absent) — before this fix that branch's `value`
  // was the raw, untranslated `coverageStatus` enum string itself (e.g.
  // "underfilled_warning"), with no `evidenceId` for a locale-aware caller
  // to render real text instead. Mirrors the existing one-id-per-state
  // convention already used for `video_prompts_stale`/`video_prompts_fresh`/
  // `video_prompts_not_generated` below, rather than a single id + enum
  // `detail` (`detail` is numbers-only everywhere in this file;
  // `coverageStatus` is not a number). See `computeEpisodeScriptStep`.
  "script_speech_coverage_in_range",
  "script_speech_coverage_underfilled_warning",
  "script_speech_coverage_underfilled_error",
  "script_speech_coverage_no_dialogue_data",
  "storyboard_needs_script_fix",
  "storyboard_needs_script",
  "storyboard_generated",
  "storyboard_not_generated",
  "script_qc_needs_storyboard",
  "tie_in_not_produced",
  "tie_in_naturalness_passed",
  "tie_in_naturalness_below_floor",
  "arc_replan_pending",
  "start_frames_needs_script_qc",
  "start_frames_approved_count",
  "dialogue_audio_needs_start_frames",
  "dialogue_audio_created",
  "dialogue_audio_not_created",
  "dialogue_qc_needs_dialogue_audio",
  "dialogue_qc_episode_coverage",
  "dialogue_qc_episode_coverage_unavailable",
  "dialogue_qc_blocking_count",
  "video_prompts_prerequisites_not_met",
  "video_prompts_not_generated",
  "video_prompts_stale",
  "video_prompts_fresh",
  "shot_repair_needs_storyboard",
  "shot_repair_count",
  "video_clips_needs_video_prompts",
  "video_clips_completed_count",
  "final_episode_needs_video_clips",
  "final_episode_durations_misaligned",
  "final_episode_audio_subtitle_unresolved",
  "final_episode_completed",
  "final_episode_ready_to_assemble",
] as const;

export type VerticalDramaProductionWizardEvidenceId =
  (typeof VERTICAL_DRAMA_WIZARD_EVIDENCE_IDS)[number];

/** Machine ids for the per-step pass/fail checklist (module header, decision
 *  10) — one flat union across every step, since a criterion's MEANING is
 *  always unambiguous from its id alone (never reused with a different
 *  meaning on a different step). */
export const VERTICAL_DRAMA_WIZARD_CRITERION_IDS = [
  "series_setup_complete",
  "script_exists",
  "coverage_at_least_minimum",
  "coverage_in_recommended_band",
  // Acceptance-review fix #1 (2026-07-08, HIGH false-positive) —
  // `episode_script` previously reported a clean "passed" checklist even
  // when the persisted script was missing its hook, cliffhanger, or every
  // structure beat. Evaluable as soon as the script itself exists (unlike
  // the 4 storyboard-dependent criteria below) — see `computeEpisodeScriptStep`.
  "story_structure_complete",
  // Added 2026-07-08/W9-A (section-12 "Pass Semantics — Content
  // Completeness") — episode_script's 4 content-completeness criteria,
  // evaluable only once the storyboard exists (`passed: null` before). See
  // `computeEpisodeScriptStep`.
  "dialogue_every_shot",
  "no_shot_over_length",
  "no_long_silence",
  "all_lines_speakable",
  "shots_9",
  "beats_mapped",
  // Added 2026-07-08/W9-A — storyboard_shots' 2 content-completeness
  // criteria (image/video prompt presence per shot). See
  // `computeStoryboardStep`.
  "image_prompts_all_shots",
  "video_prompts_all_shots",
  "scorecard_meets_floor",
  "loop_state",
  "tie_in_naturalness_floor",
  // Added 2026-07-08/W9-A — script_qc's content-completeness criterion. See
  // `computeScriptQcStep`.
  "no_unresolved_recommended_repairs",
  "start_frames_all_approved",
  "dialogue_plan_exists",
  "dialogue_no_blocking_issues",
  // Acceptance-review fix #3 (2026-07-08, MEDIUM) — non-blocking companion
  // to `dialogue_no_blocking_issues`: mirrors `episode_script`'s existing
  // "false never changes status, only passState" completeness pattern so a
  // dialogue plan with only WARNING-severity issues (no errors) reads
  // `passState: "passed_with_warnings"` instead of a clean "passed". See
  // `computeDialogueQcStep`.
  "dialogue_no_warning_issues",
  "video_prompts_exist",
  "video_prompts_not_stale",
  "video_clips_all_complete",
  "final_assembly_durations_aligned",
  "final_assembly_audio_subtitle_resolved",
  "final_assembly_completed",
] as const;

export type VerticalDramaProductionWizardCriterionId =
  (typeof VERTICAL_DRAMA_WIZARD_CRITERION_IDS)[number];

export type VerticalDramaProductionWizardCriterion = {
  id: VerticalDramaProductionWizardCriterionId;
  /** `true` = satisfied. `false` = a checkable fact that is currently unmet
   *  (e.g. "does not exist yet"). `null` = not yet evaluable because the
   *  artifact this criterion measures does not exist yet (e.g. a quality
   *  floor before any scorecard has been produced) — see module header,
   *  decision 10. */
  passed: boolean | null;
  /** Pre-formatted NUMBERS only (e.g. `"3/4"`, `"36.8"`) — never English
   *  words/sentences; this resolver has no locale awareness (module
   *  header), so a caller maps `id` -> a localized label and substitutes
   *  this string as the numeric portion, same pattern as
   *  `VerticalDramaProductionWizardEvidenceRow.scriptCoverage`. */
  detail?: string;
};

/** Ids for the small set of "this step's criteria don't cover X — that
 *  happens at a LATER step" notes (module header, decision 10; spec owner
 *  confusions #1 and #3). */
export const VERTICAL_DRAMA_WIZARD_OUT_OF_SCOPE_NOTE_IDS = [
  "dialogue_later_step",
  "prompts_later_step",
] as const;

export type VerticalDramaProductionWizardOutOfScopeNoteId =
  (typeof VERTICAL_DRAMA_WIZARD_OUT_OF_SCOPE_NOTE_IDS)[number];

export type VerticalDramaProductionWizardOutOfScopeNote = {
  id: VerticalDramaProductionWizardOutOfScopeNoteId;
  /** Which step actually covers this — a caller renders this step's own
   *  canonical label (`vdWizardStepLabel`), never a second, separately-
   *  maintained step name. */
  laterStepId: VerticalDramaProductionWizardStepId;
};

/** A step's pass/fail bucket, derived from `status` + `criteria` (module
 *  header, decision 10) — deliberately NOT folded into `status` itself
 *  (the pinned 8-value `VerticalDramaProductionWizardStepStatus` union stays
 *  unchanged) since `passed_with_warnings` only ever REFINES a `"passed"`
 *  status, it never changes gating/CTA behavior. */
export const VERTICAL_DRAMA_PRODUCTION_WIZARD_PASS_STATES = [
  "not_applicable",
  "passed",
  "passed_with_warnings",
  /** Added 2026-07-08 (section-12 "Pass Semantics — Content Completeness")
   *  — the artifact EXISTS and its own base shape is fine, but a specific
   *  downstream-produced completeness fact is not true yet (e.g. a
   *  storyboard whose shots don't all have a video motion prompt yet). This
   *  is DELIBERATELY distinct from "failed": nothing is actually broken,
   *  the step is simply not finished end-to-end — see module header,
   *  decision 12. */
  "incomplete",
  "failed",
] as const;

export type VerticalDramaProductionWizardPassState =
  (typeof VERTICAL_DRAMA_PRODUCTION_WIZARD_PASS_STATES)[number];

export type VerticalDramaProductionWizardStep = {
  stepId: VerticalDramaProductionWizardStepId;
  status: VerticalDramaProductionWizardStepStatus;
  primaryAction: VerticalDramaProductionWizardPrimaryAction;
  sourceStages: VerticalDramaPipelineStage[];
  /** Stable codes — see `VERTICAL_DRAMA_WIZARD_BLOCKING_REASON_CODES`. Kept
   *  as `string[]` (not the narrower code union) to match section-12's
   *  pinned contract shape verbatim. */
  blockingReasons: string[];
  repairable: boolean;
  creditSpending: VerticalDramaProductionWizardCreditSpending;
  evidence: VerticalDramaProductionWizardEvidenceRow[];
  /** This step's pass/fail checklist (module header, decision 10). Optional
   *  ONLY for backward compatibility with hand-built fixtures elsewhere in
   *  the codebase — the real resolver below always populates this (`[]`
   *  when nothing has been evaluated yet, e.g. a step still locked on an
   *  earlier step's prerequisite). */
  criteria?: VerticalDramaProductionWizardCriterion[];
  /** Derived from `status` + `criteria` — see `derivePassState`. Optional
   *  for the same hand-built-fixture reason as `criteria`. */
  passState?: VerticalDramaProductionWizardPassState;
  /** "What this step's criteria deliberately do NOT cover, and which later
   *  step does" (module header, decision 10). Optional for the same
   *  hand-built-fixture reason as `criteria`; `[]` when this step has none. */
  outOfScopeNotes?: VerticalDramaProductionWizardOutOfScopeNote[];
};

export type VerticalDramaProductionWizardState = {
  activeStepId: VerticalDramaProductionWizardStepId;
  steps: VerticalDramaProductionWizardStep[];
  primaryCta: VerticalDramaProductionWizardPrimaryAction;
};

/* -------------------------------------------------------------------------- */
/* Resolver input contract                                                    */
/* -------------------------------------------------------------------------- */

/** Deterministic script density-coverage bucket (spec §7.7.1/§7.7.2). Only
 *  `"underfilled_error"` blocks `storyboard_shots` (Gate 0); `"underfilled_
 *  warning"` is advisory only. `"no_dialogue_data"` (2026-07-08 fix, spec
 *  §17 grandfathering) is ALSO advisory only — a legacy script with no
 *  beat-level dialogue data at all is never treated the same as a genuine
 *  `"underfilled_error"`, so it never locks `storyboard_shots` either; see
 *  `computeEpisodeScriptStep`. */
export type VerticalDramaProductionWizardScriptCoverageStatus =
  | "in_range"
  | "underfilled_warning"
  | "underfilled_error"
  | "no_dialogue_data";

/** `VerticalDramaQualityLoopState["status"]` plus `"not_run"` for an episode
 *  whose auto-improve loop has never executed — distinct from `"idle"`,
 *  which means the loop DID run (with `maxAutoImproveRounds: 0`) and simply
 *  evaluated the initial review against policy floors. */
export type VerticalDramaProductionWizardQualityLoopStatus =
  | VerticalDramaQualityLoopStatus
  | "not_run";

export type VerticalDramaProductionWizardTieInInput = {
  enabled: boolean;
  /** Absent/`undefined` = tie-in enabled but no report produced yet
   *  ("missing" — Gate 0b locks on this too, same as an explicit `false`). */
  reportPassed?: boolean;
};

export type VerticalDramaProductionWizardFlags = {
  speechBudget: boolean;
  qualityLoopV2: boolean;
  tieInQc: boolean;
  productionWizard: boolean;
  arcReplan: boolean;
};

/**
 * One storyboard shot's content-completeness facts (spec §14.1 rule 6b,
 * section-12 "Pass Semantics — Content Completeness", added 2026-07-08/W9-A)
 * — feeds `episode_script`'s 4 new criteria. Router-computed (never derived
 * by this module) by resolving the shot's dialogue via the SAME fallback
 * chain used everywhere else a shot's lines are resolved
 * (`resolveShotDialogueLines` in `verticalDramaEpisodes.ts`), then running
 * this module's OWN `estimateVerticalDramaDialogueSeconds` /
 * `analyzeVerticalDramaClipSilence` / `analyzeVerticalDramaLineSpeakability`
 * over the result — no second speech/silence/speakability model exists
 * anywhere in this wave.
 */
export type VerticalDramaWizardPerShotDialogueCompleteness = {
  shotNumber: number;
  /** At least one resolved dialogue line maps to this shot. */
  hasResolvedLine: boolean;
  /** This shot's total estimated speech seconds exceeds its own duration. */
  overLength: boolean;
  /** This shot's estimated continuous silence exceeds `MAX_CONTINUOUS_SILENCE_SECONDS` (only meaningful when the shot has dialogue at all). */
  silent: boolean;
  /** Every resolved line for this shot passes `analyzeVerticalDramaLineSpeakability` (vacuously `true` for a shot with zero lines — nothing to fail). */
  allLinesSpeakable: boolean;
};

/**
 * Plain, serializable snapshot the caller (a future router wave) assembles
 * from persisted episode artifacts/runs, the resolved quality policy, the
 * latest quality-review scorecard + loop state, the tie-in report, dialogue
 * quality analysis, and series-level arc-replan/feature-flag state. Every
 * field is documented at its declaration; see this module's header comment
 * for the interpretive decisions made where section-12 leaves a gap.
 */
export type DeriveVerticalDramaProductionWizardStateInput = {
  /** Step 1 — series has title, premise, episode count, genre preset, and
   *  required characters (spec §8.8 Required Steps row 1). */
  seriesSetup: { complete: boolean };

  /** Step 2 — `plan_episode_script` presence + density coverage (§7.7.2). */
  script: {
    exists: boolean;
    coverageStatus: VerticalDramaProductionWizardScriptCoverageStatus;
    /**
     * Wave-7E (2026-07-08 fix) — the real coverage numbers, populated ONLY
     * when the caller actually ran `evaluateScriptSpeechCoverage` (i.e.
     * `flags.speechBudget` is on AND the script exists). `undefined`
     * otherwise (flag off, or the pre-Wave-7D placeholder `"in_range"`
     * default) — `computeEpisodeScriptStep` keeps today's EXACT
     * byte-identical evidence output in that case (spec §7.7's flags-off
     * requirement) instead of rendering these numbers.
     */
    coverageDetail?: {
      estimatedSpeechSeconds: number;
      targetSpeechSecondsMin: number;
      targetSpeechSecondsMax: number;
    };
    /**
     * Added 2026-07-08/W9-A (spec §14.1 rule 6b, section-12 "Pass Semantics")
     * — per-shot content-completeness facts feeding the 4 new criteria
     * (`dialogue_every_shot`/`no_shot_over_length`/`no_long_silence`/
     * `all_lines_speakable`). `null`/`undefined` when the storyboard does
     * not exist yet OR the caller has not been updated to supply this —
     * "evaluable once storyboard exists" (section-12); both read as "not
     * yet evaluable" (`passed: null` on every one of the 4 criteria), same
     * optional/backward-compatible convention as `coverageDetail` above.
     * Once the storyboard exists AND the caller supplies this, it is one
     * entry per storyboard shot (never `undefined`-per-shot), even a shot
     * with zero resolved lines.
     */
    perShotCompleteness?: VerticalDramaWizardPerShotDialogueCompleteness[] | null;
    /**
     * Acceptance-review fix #1 (2026-07-08, HIGH false-positive) —
     * `script.hook` non-empty AND `script.cliffhanger` non-empty AND
     * `script.structure.beats` present with `length > 0`, computed by the
     * caller (`buildProductionWizardInput`, thread convention same as
     * `perShotCompleteness` above) straight off the persisted script record
     * — this module never reads raw script JSON itself. Unlike
     * `perShotCompleteness`, this is evaluable as soon as the script itself
     * exists (never gated on the storyboard existing, and never
     * flag-dependent) — hook/cliffhanger/beats are all part of the script
     * artifact itself. `undefined` reads as "not yet evaluable"
     * (`passed: null`), same backward-compatible convention as every other
     * optional field on this type — never a false claim of failure for a
     * caller that has not been updated to supply it yet.
     */
    structureComplete?: boolean;
  };

  /** Step 3 — `storyboard_shotgrid` presence. `shotCount`/`beatsMapped`
   *  (2026-07-08 criteria-transparency wave) are OPTIONAL, caller-computed
   *  facts feeding the `shots_9`/`beats_mapped` criteria (module header,
   *  decision 10) — `undefined` (caller not yet updated) reads as "not yet
   *  evaluable" (`passed: null`), never as a false claim either way.
   *  `imagePromptsAllShots`/`videoPromptsAllShots` (2026-07-08/W9-A, spec
   *  section-12 "Pass Semantics") are the same optional/`undefined`-is-
   *  "not yet evaluable" convention, feeding the new
   *  `image_prompts_all_shots`/`video_prompts_all_shots` criteria. */
  storyboard: {
    exists: boolean;
    shotCount?: number;
    beatsMapped?: boolean;
    imagePromptsAllShots?: boolean;
    videoPromptsAllShots?: boolean;
  };

  /** Step 4 — script-quality QC gate (spec §16.1, §13.1). */
  scriptQc: {
    /** Latest persisted scorecard's numeric dimensions, or `null` if no
     *  review has ever run for this episode. */
    latestScorecard: VerticalDramaQualityScorecardDimensions | null;
    /** Already-resolved policy (series -> tenant -> defaults merge — see
     *  `qualityPolicy.ts`'s `resolveQualityPolicy`). */
    policy: VerticalDramaQualityPolicy;
    loopStatus: VerticalDramaProductionWizardQualityLoopStatus;
    tieIn: VerticalDramaProductionWizardTieInInput;
    /**
     * Added 2026-07-08/W9-A (section-12 "Pass Semantics" script-QC
     * checklist: "score meets floor AND no unresolved recommended repairs")
     * — best-effort signal that the LATEST review still carries outstanding
     * recommended-repair items. `null` when no review has ever run
     * (nothing to check yet, matches `latestScorecard: null`'s convention).
     * Derivation is intentionally best-effort: there is no explicit
     * per-repair resolved/dismissed/superseded tracking anywhere in the
     * system yet, so the router reads this straight off the latest
     * review's own `issues[]` (`issues.length > 0`) — a later review
     * supersedes an earlier one by construction, so whatever the LATEST
     * review still lists is, by definition, unresolved as of now. See
     * `verticalDramaEpisodes.ts`'s `buildProductionWizardInput` doc
     * comment for the exact computation. Optional/`undefined` (same as
     * `null`) for backward compatibility with callers that have not been
     * updated to supply it yet.
     */
    hasUnresolvedRecommendedRepairs?: boolean | null;
  };

  /** Step 5 — approved main start frame per required shot. */
  startFrames: { requiredShots: number; approvedShots: number };

  /** Step 6 — `dialogue_audio_plan` presence. */
  dialogueAudio: { exists: boolean };

  /** Step 7 input — whole-episode + per-clip dialogue quality (spec
   *  §7.7.1/§14.1), reusing `dialogueQuality.ts`'s own analyzer OUTPUT
   *  shape verbatim (this module never recomputes it). `null` when the
   *  dialogue plan does not exist yet (nothing to analyze). */
  episodeDialogueQuality: VerticalDramaEpisodeDialogueQuality | null;

  /** Step 8 — `video_motion_prompt_pack` presence + staleness. `stale` is
   *  CALLER-COMPUTED (this resolver reflects staleness, it never derives it
   *  — see section-12's Stale Propagation table for the mutation-time
   *  cascade that sets it). */
  videoPrompts: { exists: boolean; stale: boolean };

  /** Step 9 — count of shots/clips/frames/dialogue lines currently flagged
   *  for spot repair (caller-aggregated from QC/staleness signals across
   *  the other steps). */
  shotRepair: { failingTargetCount: number };

  /** Step 10 — required vs. completed video clips. */
  clips: { required: number; completed: number };

  /** Step 11 — assembly readiness (spec Gate 3: clips complete + durations
   *  aligned + audio/subtitle strategy resolved). `completed` is true once
   *  `assemble_episode_manifest` + `summarize_episode_to_series_memory`
   *  have both run for this episode. */
  assembly: {
    completed: boolean;
    durationsAligned: boolean;
    audioSubtitleResolved: boolean;
  };

  /** Unresolved `arc_replan_proposal` affecting this episode (spec §7.7.3).
   *  Advisory on `script_qc` — see this module's header comment, decision
   *  3. */
  arcReplanPending: boolean;

  flags: VerticalDramaProductionWizardFlags;

  /**
   * Wizard step ids whose underlying artifact/checkpoint was already
   * complete/approved BEFORE the relevant gate flag(s) were enabled for
   * this series (spec §17 grandfathering rule). Every step named here is
   * force-resolved to `status: "passed"` with empty `blockingReasons`,
   * regardless of what the rest of `input` would otherwise compute for it
   * — an exempt stage never gets a NEW blocking reason from a newly
   * enabled gate. Callers must only include a step id here when its
   * underlying artifact genuinely already exists/was approved; this
   * resolver trusts the input completely and never re-derives exemption
   * from other fields. See this module's header comment, decision 7, for
   * why this is keyed by wizard step id rather than
   * `VerticalDramaPipelineStage`.
   */
  gateExemptStepIds: VerticalDramaProductionWizardStepId[];
};

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Shared `repairable` rule: a step is repairable once an artifact exists
 *  for it to act on — whether that artifact currently passes ("passed",
 *  view/edit + regenerate always available per spec's "custom work never
 *  forces a restart") or is failing ("needs_repair"/"blocked"). Steps that
 *  are "locked"/"ready"/"optional"/"skipped" have nothing yet to repair. */
function defaultRepairable(status: VerticalDramaProductionWizardStepStatus): boolean {
  return status === "needs_repair" || status === "blocked" || status === "passed";
}

/** Derives `passState` from `status` + `criteria` (module header, decision
 *  10) — the ONE place this rule is implemented, so every step gets it by
 *  construction via `makeStep` below rather than by per-step discipline.
 *  A non-"passed"/"needs_repair"/"blocked" status (locked/ready/running/
 *  optional/skipped) has nothing evaluable yet, regardless of `criteria`. */
function derivePassState(
  status: VerticalDramaProductionWizardStepStatus,
  criteria: readonly VerticalDramaProductionWizardCriterion[],
): VerticalDramaProductionWizardPassState {
  if (status === "needs_repair" || status === "blocked") return "failed";
  if (status !== "passed") return "not_applicable";
  return criteria.some(c => c.passed !== true) ? "passed_with_warnings" : "passed";
}

/**
 * 2026-07-08/W9-A (spec §14.1 rule 6b, section-12 "Pass Semantics — Content
 * Completeness") — module header, decision 12.
 *
 * Three steps (`episode_script`, `storyboard_shots`, `script_qc`) each gained
 * one or more new completeness criteria whose FACT can only be known once a
 * LATER pipeline stage has produced something (a storyboard's per-shot
 * dialogue resolution, a video-prompt pack, a fresh quality review). The
 * owner's directive is unambiguous that a step must never DISPLAY "passed"
 * while such a criterion reads false — but section-12's own separate,
 * explicit constraint for this exact wave ("CTA ordering/locks unchanged —
 * pipeline order intact; only pass display semantics change") rules out
 * ever touching a step's `status` for this reason: `computeStoryboardStep`,
 * `computeScriptQcStep`, and `computeStartFramesStep` all gate purely on the
 * PRECEDING step's `status === "passed"`, so flipping e.g. `episode_script`
 * back to `"needs_repair"` once new post-storyboard facts come in would
 * RE-LOCK `storyboard_shots` (and everything after it) even though the
 * storyboard, start frames, dialogue plan, and video clips may already be
 * long since approved — a destructive, unintended cascade section-12 never
 * asks for (contrast with the EXISTING `underfilled_error` branch, which
 * legitimately blocks `status` because it fires BEFORE the storyboard is
 * ever generated, so there is nothing downstream to retroactively lock).
 *
 * This function is the ONE place that reconciles both requirements: it
 * ALWAYS leaves `status`/`primaryAction`/`blockingReasons` exactly as the
 * step's own gate logic already computed them (zero behavior change for
 * every existing gate/lock/CTA), and ONLY overrides `passState` — to
 * `"failed"` (reusing the SAME token an actual `needs_repair`/`blocked`
 * status already produces, since a hard completeness failure reads exactly
 * as urgent to a user) for `episode_script`/`script_qc`, or `"incomplete"`
 * (a softer, new, "still finishing up" token — see the passState union's own
 * doc comment) for `storyboard_shots`, per each step's own wording in
 * section-12. Only ever fires while `status === "passed"` — a step already
 * "needs_repair"/"blocked" already reads `passState: "failed"` from
 * `derivePassState` above, so this never needs to (and never does) touch
 * those. `overrideWhen` is `true` only when at least one of the NEW
 * completeness criteria reads a DEFINITE `false` (never merely `null` —
 * `null` keeps the pre-existing `passed_with_warnings`/`passed` outcome,
 * matching every other "not yet evaluable" criterion in this file).
 */
function withCompletenessPassStateOverride(
  step: VerticalDramaProductionWizardStep,
  overrideWhen: boolean,
  overrideTo: Extract<VerticalDramaProductionWizardPassState, "failed" | "incomplete">,
): VerticalDramaProductionWizardStep {
  if (step.status !== "passed" || !overrideWhen) return step;
  return { ...step, passState: overrideTo };
}

/** Builds a step, auto-computing `repairable` from `status` (unless the
 *  caller explicitly overrides it — used only by `series_setup`, which has
 *  no repair concept at all, see the Repair Model table in section-12) and
 *  `passState` from `status` + `criteria` (always auto-derived — module
 *  header, decision 10). `criteria`/`outOfScopeNotes` default to `[]` when
 *  the caller omits them (e.g. every "locked because an EARLIER step's
 *  prerequisite isn't met yet" branch, which has nothing of its OWN to
 *  evaluate). */
function makeStep(
  step: Omit<VerticalDramaProductionWizardStep, "repairable" | "passState"> & {
    repairable?: boolean;
  },
): VerticalDramaProductionWizardStep {
  const { repairable, criteria, outOfScopeNotes, ...rest } = step;
  const resolvedCriteria = criteria ?? [];
  return {
    ...rest,
    criteria: resolvedCriteria,
    outOfScopeNotes: outOfScopeNotes ?? [],
    repairable: repairable ?? defaultRepairable(step.status),
    passState: derivePassState(step.status, resolvedCriteria),
  };
}

function clampForGrandfathering(
  step: VerticalDramaProductionWizardStep,
  gateExemptStepIds: readonly VerticalDramaProductionWizardStepId[],
): VerticalDramaProductionWizardStep {
  if (step.status === "passed") return step;
  if (!gateExemptStepIds.includes(step.stepId)) return step;
  // Grandfathering is an explicit "treat as fully satisfied, do not
  // relitigate old work" override — forces a CLEAN "passed", never
  // "passed_with_warnings", even though the step's own (pre-exemption)
  // criteria may still read false/null underneath.
  return {
    ...step,
    status: "passed",
    primaryAction: "none",
    blockingReasons: [],
    passState: "passed",
  };
}

/* -------------------------------------------------------------------------- */
/* Per-step resolvers (spec §8.8 Required Steps + Gating Rules)               */
/* -------------------------------------------------------------------------- */

function computeSeriesSetupStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
): VerticalDramaProductionWizardStep {
  const complete = input.seriesSetup.complete;
  return makeStep({
    stepId: "series_setup",
    status: complete ? "passed" : "ready",
    primaryAction: complete ? "none" : "complete_series_setup",
    sourceStages: ["normalize_series_input"],
    blockingReasons: [],
    // No repair concept applies to series setup (section-12's Repair Model
    // table has no "series setup repair" row) — always false, regardless
    // of status.
    repairable: false,
    creditSpending: "none",
    evidence: [
      {
        label: "Series setup",
        value: complete ? "Complete" : "Incomplete",
        severity: complete ? undefined : "warning",
        evidenceId: complete ? "series_setup_complete" : "series_setup_incomplete",
      },
    ],
    criteria: [{ id: "series_setup_complete", passed: complete }],
  });
}

/** Acceptance-review fix #4 (2026-07-08, dormant leak) — one evidenceId per
 *  `VerticalDramaProductionWizardScriptCoverageStatus`, for the
 *  `episode_script` speech-coverage row's flags-off (`coverageDetail`
 *  absent) fallback branch. See `computeEpisodeScriptStep` and the
 *  `VERTICAL_DRAMA_WIZARD_EVIDENCE_IDS` doc comment above for why this is
 *  one id per state rather than a single id + enum `detail`. */
const SCRIPT_SPEECH_COVERAGE_STATUS_EVIDENCE_IDS: Record<
  VerticalDramaProductionWizardScriptCoverageStatus,
  VerticalDramaProductionWizardEvidenceId
> = {
  in_range: "script_speech_coverage_in_range",
  underfilled_warning: "script_speech_coverage_underfilled_warning",
  underfilled_error: "script_speech_coverage_underfilled_error",
  no_dialogue_data: "script_speech_coverage_no_dialogue_data",
};

function computeEpisodeScriptStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  seriesSetupStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = ["plan_episode_script"];

  if (seriesSetupStep.status !== "passed") {
    return makeStep({
      stepId: "episode_script",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      // No section-12 reason code exists for "series setup incomplete" —
      // the fixed 13-code list starts at script/storyboard concerns.
      blockingReasons: [],
      creditSpending: "llm",
      evidence: [
        {
          label: "Series setup",
          value: "Required first",
          severity: "warning",
          evidenceId: "episode_script_needs_series_setup",
        },
      ],
    });
  }

  const { exists, coverageStatus, coverageDetail, perShotCompleteness, structureComplete } =
    input.script;

  if (!exists) {
    return makeStep({
      stepId: "episode_script",
      status: "ready",
      primaryAction: "generate_script",
      sourceStages,
      blockingReasons: [],
      creditSpending: "llm",
      evidence: [
        { label: "Script", value: "Not started", evidenceId: "episode_script_not_started" },
      ],
      criteria: [{ id: "script_exists", passed: false }],
    });
  }

  // Only a genuine `underfilled_error` locks/needs-repair — `no_dialogue_data`
  // (2026-07-08 fix, spec §17 grandfathering) is intentionally NOT treated
  // as an error here: a legacy script with no beat-level dialogue data at
  // all must stay "passed" (never locking storyboard_shots downstream), it
  // just gets a warning-severity evidence row below instead of a numeric one.
  const underfilledError = coverageStatus === "underfilled_error";
  const underfilledWarning = coverageStatus === "underfilled_warning";

  // 2026-07-08 fix — `coverageDetail` (real numbers) is only ever populated
  // when the caller ran a live `evaluateScriptSpeechCoverage`. When absent,
  // this row stays EXACTLY the pre-Wave-7E fallback (`value: coverageStatus`
  // — flags-off byte-identical). When present, `value` becomes a numeric,
  // non-enum fallback string, and the structured `scriptCoverage` payload
  // lets a locale-aware caller render a fully localized row instead.
  const evidence: VerticalDramaProductionWizardEvidenceRow[] = coverageDetail
    ? [
        {
          label: "Speech coverage",
          value: `${coverageDetail.estimatedSpeechSeconds.toFixed(1)}s / target ${coverageDetail.targetSpeechSecondsMin.toFixed(1)}-${coverageDetail.targetSpeechSecondsMax.toFixed(1)}s`,
          severity:
            underfilledError
              ? "error"
              : underfilledWarning || coverageStatus === "no_dialogue_data"
                ? "warning"
                : undefined,
          scriptCoverage: {
            status: coverageStatus,
            estimatedSpeechSeconds: coverageDetail.estimatedSpeechSeconds,
            targetSpeechSecondsMin: coverageDetail.targetSpeechSecondsMin,
            targetSpeechSecondsMax: coverageDetail.targetSpeechSecondsMax,
          },
        },
      ]
    : [
        {
          label: "Speech coverage",
          value: coverageStatus,
          severity: underfilledError ? "error" : underfilledWarning ? "warning" : undefined,
          // Acceptance-review fix #4 (2026-07-08, dormant leak) — `label`/
          // `value` above stay EXACTLY the pre-Wave-7E fallback (flags-off
          // byte-identical, spec §7.7's requirement) for a caller that has
          // not localized this row; `evidenceId` is purely ADDITIVE so a
          // locale-aware caller (`VerticalDramaProductionWizard.tsx`, via
          // the SAME generic `evidenceId` dispatch every other row already
          // uses) renders real Thai/English text instead of this raw
          // `coverageStatus` enum string. This is a deliberate, documented
          // contract update: before this fix, a caller with no OTHER
          // structured field to key off (no `coverageDetail` -> no
          // `scriptCoverage`) had nothing but the raw enum to render.
          evidenceId: SCRIPT_SPEECH_COVERAGE_STATUS_EVIDENCE_IDS[coverageStatus],
        },
      ];

  // Criteria (2026-07-08 criteria-transparency wave, module header decision
  // 10) — derived from `coverageStatus` ALONE so they stay populated even
  // when `coverageDetail` is absent (speechBudget flag off); `detail`
  // (numbers only) is added on top whenever the real numbers exist.
  // `no_dialogue_data` reads `null` on both (nothing measurable at all —
  // never a false claim of failure, matching this step's own grandfathering
  // treatment of that status).
  const noDialogueData = coverageStatus === "no_dialogue_data";
  const coverageAtLeastMinimumPassed = noDialogueData ? null : !underfilledError;
  const coverageInBandPassed = noDialogueData ? null : coverageStatus === "in_range";
  const criteria: VerticalDramaProductionWizardCriterion[] = [
    { id: "script_exists", passed: true },
    {
      id: "coverage_at_least_minimum",
      passed: coverageAtLeastMinimumPassed,
      detail: coverageDetail ? coverageDetail.estimatedSpeechSeconds.toFixed(1) : undefined,
    },
    {
      id: "coverage_in_recommended_band",
      passed: coverageInBandPassed,
      detail: coverageDetail
        ? `${coverageDetail.estimatedSpeechSeconds.toFixed(1)}/${coverageDetail.targetSpeechSecondsMin.toFixed(0)}-${coverageDetail.targetSpeechSecondsMax.toFixed(0)}`
        : undefined,
    },
    // Acceptance-review fix #1 (2026-07-08, HIGH false-positive) —
    // `structureComplete` (router-computed, see this field's own doc
    // comment) is evaluable as soon as the script exists, same timing as
    // the 3 criteria above (never gated on the storyboard, unlike the 4
    // content-completeness criteria below). `undefined` (caller not yet
    // updated) reads as "not yet evaluable" (`passed: null`), never a false
    // claim of failure — same optional-field convention as everywhere else
    // in this file.
    {
      id: "story_structure_complete",
      passed: structureComplete ?? null,
    },
  ];

  // Content-completeness criteria (2026-07-08/W9-A, spec §14.1 rule 6b,
  // section-12 "Pass Semantics") — `null` (not evaluable) until the
  // storyboard exists and the router has resolved per-shot dialogue;
  // `detail` is the passing-shot count over the total, matching
  // `start_frames_all_approved`'s "N/total" convention. See module header,
  // decision 12, for why a `false` value here NEVER changes `status` below
  // (only the final `passState` override does).
  const totalShots = perShotCompleteness?.length ?? 0;
  const countWhere = (predicate: (s: VerticalDramaWizardPerShotDialogueCompleteness) => boolean) =>
    perShotCompleteness?.filter(predicate).length ?? 0;
  const dialogueEveryShotPassed =
    perShotCompleteness == null ? null : perShotCompleteness.every(s => s.hasResolvedLine);
  const noShotOverLengthPassed =
    perShotCompleteness == null ? null : perShotCompleteness.every(s => !s.overLength);
  const noLongSilencePassed =
    perShotCompleteness == null ? null : perShotCompleteness.every(s => !s.silent);
  const allLinesSpeakablePassed =
    perShotCompleteness == null ? null : perShotCompleteness.every(s => s.allLinesSpeakable);
  criteria.push(
    {
      id: "dialogue_every_shot",
      passed: dialogueEveryShotPassed,
      detail: perShotCompleteness ? `${countWhere(s => s.hasResolvedLine)}/${totalShots}` : undefined,
    },
    {
      id: "no_shot_over_length",
      passed: noShotOverLengthPassed,
      detail: perShotCompleteness ? `${countWhere(s => !s.overLength)}/${totalShots}` : undefined,
    },
    {
      id: "no_long_silence",
      passed: noLongSilencePassed,
      detail: perShotCompleteness ? `${countWhere(s => !s.silent)}/${totalShots}` : undefined,
    },
    {
      id: "all_lines_speakable",
      passed: allLinesSpeakablePassed,
      detail: perShotCompleteness ? `${countWhere(s => s.allLinesSpeakable)}/${totalShots}` : undefined,
    },
  );
  const anyCompletenessCriterionFalse = [
    dialogueEveryShotPassed,
    noShotOverLengthPassed,
    noLongSilencePassed,
    allLinesSpeakablePassed,
    // Acceptance-review fix #1 — a definite `false` here (script missing
    // its hook/cliffhanger/beats) must ALSO flip `passState` to "failed",
    // same as every other episode_script completeness fact; `status` stays
    // untouched (still "passed", repairable via the existing script repair
    // CTA — module header, decision 12).
    structureComplete ?? null,
  ].some(passed => passed === false);

  const step = makeStep({
    stepId: "episode_script",
    status: underfilledError ? "needs_repair" : "passed",
    primaryAction: underfilledError ? "generate_script" : "none",
    sourceStages,
    blockingReasons: underfilledError ? ["VD_WIZARD_SCRIPT_UNDERFILLED"] : [],
    creditSpending: "llm",
    evidence,
    criteria,
    // Owner confusion #1 ("script passed, so what about dialogue?") — the
    // per-shot dialogue lines this step's criteria never check belong to
    // the LATER dialogue_audio step.
    outOfScopeNotes: [{ id: "dialogue_later_step", laterStepId: "dialogue_audio" }],
  });
  return withCompletenessPassStateOverride(step, anyCompletenessCriterionFalse, "failed");
}

/** Gate 0 (section-12): storyboard locked until script exists and is not
 *  `underfilled_error` — deterministic only, no storyboard/scorecard
 *  needed. */
function computeStoryboardStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  episodeScriptStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = ["storyboard_shotgrid"];

  if (episodeScriptStep.status !== "passed") {
    const reasons =
      episodeScriptStep.blockingReasons.length > 0
        ? episodeScriptStep.blockingReasons
        : input.script.exists
          ? [] // locked only because series_setup itself is incomplete
          : ["VD_WIZARD_SCRIPT_MISSING"];

    return makeStep({
      stepId: "storyboard_shots",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: reasons,
      creditSpending: "llm",
      evidence: [
        {
          label: "Episode script",
          value: input.script.exists ? "Underfilled" : "Missing",
          severity: "error",
          evidenceId: input.script.exists ? "storyboard_needs_script_fix" : "storyboard_needs_script",
        },
      ],
    });
  }

  const { exists, shotCount, beatsMapped, imagePromptsAllShots, videoPromptsAllShots } =
    input.storyboard;

  // Criteria (module header, decision 10) — `false` when the storyboard
  // does not exist at all (a definite "0 shots, not 9" fact); `null` when
  // it exists but the caller has not yet supplied the newer optional facts
  // (never a false claim of failure either way). `beats_mapped` uses each
  // shot's own `narrative_purpose` (required, non-empty per the
  // `vertical-drama-storyboard-shotgrid` skill's own output schema) as the
  // honest, already-validated proxy for "this shot was actually derived
  // from the script's beats" — see `buildProductionWizardInput`'s doc
  // comment (`verticalDramaEpisodes.ts`) for exactly how it is computed.
  // `image_prompts_all_shots`/`video_prompts_all_shots` (2026-07-08/W9-A,
  // spec section-12 "Pass Semantics") follow the exact same `!exists ->
  // false` convention as `shots_9`/`beats_mapped` above — these now COUNT
  // toward this step's own pass/fail checklist (the `prompts_later_step`
  // out-of-scope note below stays, purely to keep pointing the user at
  // WHICH later step produces the missing prompts; module header, decision
  // 12, covers why a `false` value here changes `passState`, never `status`).
  const criteria: VerticalDramaProductionWizardCriterion[] = [
    {
      id: "shots_9",
      passed: !exists ? false : shotCount === undefined ? null : shotCount === 9,
      detail: exists && shotCount !== undefined ? String(shotCount) : undefined,
    },
    {
      id: "beats_mapped",
      passed: !exists ? false : (beatsMapped ?? null),
    },
    {
      id: "image_prompts_all_shots",
      passed: !exists ? false : (imagePromptsAllShots ?? null),
    },
    {
      id: "video_prompts_all_shots",
      passed: !exists ? false : (videoPromptsAllShots ?? null),
    },
  ];
  const promptsIncomplete = imagePromptsAllShots === false || videoPromptsAllShots === false;

  const step = makeStep({
    stepId: "storyboard_shots",
    status: exists ? "passed" : "ready",
    primaryAction: exists ? "none" : "generate_storyboard",
    sourceStages,
    blockingReasons: [],
    creditSpending: "llm",
    evidence: [
      {
        label: "Storyboard",
        value: exists ? "9 shots generated" : "Not generated",
        evidenceId: exists ? "storyboard_generated" : "storyboard_not_generated",
      },
    ],
    criteria,
    // Owner confusion #3 ("storyboard passed but prompt isn't there yet") —
    // this step never GENERATES video prompts OR per-shot dialogue; both
    // are produced at their own later steps. (2026-07-08/W9-A: this step's
    // OWN criteria now count whether those prompts already exist — see
    // `image_prompts_all_shots`/`video_prompts_all_shots` above — this note
    // only ever pointed at where they get PRODUCED, which is unchanged.)
    outOfScopeNotes: exists
      ? [
          { id: "prompts_later_step", laterStepId: "video_prompts" },
          { id: "dialogue_later_step", laterStepId: "dialogue_audio" },
        ]
      : [],
  });
  return withCompletenessPassStateOverride(step, promptsIncomplete, "incomplete");
}

/** Script Quality QC Gate (section-12, spec §16.1/§13.1/§7.7.3): locked
 *  until storyboard exists (the review skill scores script + storyboard
 *  together, §6.8.1); once unlocked, "passed" requires the scorecard to
 *  meet policy floors (or the loop to have passed) AND — when tie-in QC is
 *  enabled — the tie-in naturalness report to pass. Arc re-plan is
 *  advisory only (see module header, decision 3). */
function computeScriptQcStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  storyboardStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = [
    "plan_episode_script",
    "storyboard_shotgrid",
  ];

  if (storyboardStep.status !== "passed") {
    return makeStep({
      stepId: "script_qc",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: ["VD_WIZARD_STORYBOARD_MISSING"],
      creditSpending: "llm",
      evidence: [
        {
          label: "Storyboard",
          value: "Required before quality review",
          severity: "warning",
          evidenceId: "script_qc_needs_storyboard",
        },
      ],
    });
  }

  const { latestScorecard, policy, loopStatus, tieIn, hasUnresolvedRecommendedRepairs } =
    input.scriptQc;
  const { qualityLoopV2, tieInQc, arcReplan } = input.flags;

  // Legacy v1 fallback (spec §17): with qualityLoopV2 off, the review stays
  // purely advisory and never blocks the wizard — "the shipped v1 quality
  // loop ... behave[s] exactly as today." No criteria either — v1 never
  // evaluates a pass/fail gate at all (module header, decision 10).
  if (!qualityLoopV2) {
    return makeStep({
      stepId: "script_qc",
      status: "passed",
      primaryAction: "none",
      sourceStages,
      blockingReasons: [],
      creditSpending: "llm",
      evidence: [
        {
          label: "Scorecard overall",
          value: latestScorecard ? `${latestScorecard.overall} / ${policy.minOverall}` : "Not reviewed",
          scorecardOverall: { overall: latestScorecard?.overall ?? null, minOverall: policy.minOverall },
        },
      ],
    });
  }

  const scorecardEvaluation = latestScorecard
    ? evaluateScorecardAgainstPolicy(latestScorecard, policy)
    : null;
  const scorecardFailing = scorecardEvaluation !== null && !scorecardEvaluation.passed;
  const escalated = loopStatus === "escalated_max_rounds" || loopStatus === "escalated_regression";
  const tieInFailing = tieInQc && tieIn.enabled && tieIn.reportPassed !== true;
  const arcReplanPendingActive = arcReplan && input.arcReplanPending;

  const reasons: string[] = [];
  if (scorecardFailing) reasons.push("VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR");
  if (escalated) reasons.push("VD_WIZARD_QUALITY_LOOP_ESCALATED");
  if (tieInFailing) reasons.push("VD_WIZARD_TIE_IN_BELOW_FLOOR");
  if (arcReplanPendingActive) reasons.push("VD_WIZARD_ARC_REPLAN_PENDING");

  const hardFailing = scorecardFailing || escalated || tieInFailing;

  const evidence: VerticalDramaProductionWizardEvidenceRow[] = [
    {
      label: "Scorecard overall",
      value: latestScorecard ? `${latestScorecard.overall} / ${policy.minOverall}` : "Not reviewed",
      severity: scorecardFailing ? "error" : undefined,
      scorecardOverall: { overall: latestScorecard?.overall ?? null, minOverall: policy.minOverall },
    },
    {
      label: "Auto-improve loop",
      value: loopStatus,
      severity: escalated ? "error" : undefined,
      loopState: loopStatus,
    },
  ];
  if (tieInQc && tieIn.enabled) {
    evidence.push({
      label: "Tie-in naturalness",
      value:
        tieIn.reportPassed === undefined ? "Not produced" : tieIn.reportPassed ? "Passed" : "Below floor",
      severity: tieIn.reportPassed === true ? undefined : tieIn.reportPassed === false ? "error" : "warning",
      evidenceId:
        tieIn.reportPassed === undefined
          ? "tie_in_not_produced"
          : tieIn.reportPassed
            ? "tie_in_naturalness_passed"
            : "tie_in_naturalness_below_floor",
    });
  }
  if (arcReplanPendingActive) {
    evidence.push({
      label: "Arc re-plan",
      value: "Pending review",
      severity: "warning",
      evidenceId: "arc_replan_pending",
    });
  }

  let status: VerticalDramaProductionWizardStepStatus;
  let primaryAction: VerticalDramaProductionWizardPrimaryAction;

  if (hardFailing) {
    status = "needs_repair";
    if (escalated) {
      // See module header, decision 2 — no "manual repair" action exists.
      primaryAction = "run_quality_review";
    } else if (policy.maxAutoImproveRounds > 0) {
      primaryAction = "run_quality_improve_loop";
    } else {
      // maxAutoImproveRounds === 0 ("manual apply only", spec §16.1).
      primaryAction = "run_quality_review";
    }
  } else if (latestScorecard === null) {
    status = "ready";
    primaryAction = "run_quality_review";
  } else {
    status = "passed";
    primaryAction = "none";
  }

  // Criteria (module header, decision 10; the exact `scorecard_meets_floor`
  // (3/4 -> false) example this wave was scoped against) — `null` only
  // while a scorecard has genuinely never been produced, matching this
  // step's own "ready" branch above. `loop_state` reads `true` for every
  // NON-escalated status (including `"not_run"`) — a loop that never ran is
  // not itself a problem, only escalation is.
  const criteria: VerticalDramaProductionWizardCriterion[] = [
    {
      id: "scorecard_meets_floor",
      passed: latestScorecard === null ? null : !scorecardFailing,
      detail: latestScorecard ? `${latestScorecard.overall}/${policy.minOverall}` : undefined,
    },
    { id: "loop_state", passed: !escalated },
    // Content-completeness criterion (2026-07-08/W9-A, section-12 "Pass
    // Semantics" script-QC checklist: "score meets floor AND no unresolved
    // recommended repairs"). `null` only while no review has ever run,
    // matching `scorecard_meets_floor`'s own convention.
    {
      id: "no_unresolved_recommended_repairs",
      passed:
        hasUnresolvedRecommendedRepairs == null ? null : !hasUnresolvedRecommendedRepairs,
    },
  ];
  if (tieInQc && tieIn.enabled) {
    criteria.push({
      id: "tie_in_naturalness_floor",
      passed: tieIn.reportPassed === undefined ? null : tieIn.reportPassed,
    });
  }

  const step = makeStep({
    stepId: "script_qc",
    status,
    primaryAction,
    sourceStages,
    blockingReasons: reasons,
    creditSpending: "llm",
    evidence,
    criteria,
  });
  // Module header, decision 12 — a hard "yes, the latest review still lists
  // unresolved repairs" fact must never show as a clean "passed" checklist,
  // but (same reasoning as episode_script/storyboard_shots) must never BY
  // ITSELF re-lock `start_frames` (Gate 0b keys on `status === "passed"`,
  // and this is a display-only refinement, not a new hard gate — see
  // section-12's "CTA ordering/locks unchanged" constraint for this wave).
  return withCompletenessPassStateOverride(
    step,
    hasUnresolvedRecommendedRepairs === true,
    "failed",
  );
}

/** Gate 0b (section-12): the first PAID stage locked until script_qc
 *  passes. */
function computeStartFramesStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  scriptQcStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = [
    "start_frame_render_plan",
    "render_or_import_start_frames",
    "approve_start_frames",
  ];

  if (scriptQcStep.status !== "passed") {
    // Acceptance-review fix #6 (2026-07-08, LOW) — see module header,
    // decision 4: when script_qc has no reasons of its OWN (a genuine
    // "never reviewed yet" state, not a reviewed-and-failed one), the
    // distinct `VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED` fallback code avoids
    // misleadingly implying a review already ran and failed the floor.
    // script_qc's own REAL reasons (an actual floor/loop/tie-in failure)
    // still pass through unchanged.
    const reasons =
      scriptQcStep.blockingReasons.length > 0
        ? scriptQcStep.blockingReasons
        : ["VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED"];

    return makeStep({
      stepId: "start_frames",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: reasons,
      creditSpending: "image",
      evidence: [
        {
          label: "Script quality QC",
          value: "Not passed yet",
          severity: "warning",
          evidenceId: "start_frames_needs_script_qc",
        },
      ],
    });
  }

  const { requiredShots, approvedShots } = input.startFrames;
  const complete = requiredShots > 0 && approvedShots >= requiredShots;

  return makeStep({
    stepId: "start_frames",
    status: complete ? "passed" : "ready",
    primaryAction: complete ? "none" : "approve_start_frames",
    sourceStages,
    blockingReasons: [],
    creditSpending: "image",
    evidence: [
      {
        label: "Approved start frames",
        value: `${approvedShots}/${requiredShots}`,
        severity: complete ? undefined : "warning",
        evidenceId: "start_frames_approved_count",
        detail: `${approvedShots}/${requiredShots}`,
      },
    ],
    criteria: [
      {
        id: "start_frames_all_approved",
        passed: complete,
        detail: `${approvedShots}/${requiredShots}`,
      },
    ],
  });
}

function computeDialogueAudioStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  startFramesStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = ["dialogue_audio_plan"];

  if (startFramesStep.status !== "passed") {
    return makeStep({
      stepId: "dialogue_audio",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: ["VD_WIZARD_START_FRAMES_NOT_APPROVED"],
      creditSpending: "tts",
      evidence: [
        {
          label: "Start frames",
          value: "Not fully approved yet",
          severity: "warning",
          evidenceId: "dialogue_audio_needs_start_frames",
        },
      ],
    });
  }

  const exists = input.dialogueAudio.exists;
  return makeStep({
    stepId: "dialogue_audio",
    status: exists ? "passed" : "ready",
    primaryAction: exists ? "none" : "generate_dialogue_plan",
    sourceStages,
    blockingReasons: [],
    creditSpending: "tts",
    evidence: [
      {
        label: "Dialogue plan",
        value: exists ? "Created" : "Not created",
        evidenceId: exists ? "dialogue_audio_created" : "dialogue_audio_not_created",
      },
    ],
    criteria: [{ id: "dialogue_plan_exists", passed: exists }],
  });
}

/** Dialogue & Density QC Gate (section-12, spec §7.7/§14.1) — reuses
 *  `dialogueQuality.ts`'s issue severities verbatim; never re-derives a
 *  threshold locally. */
function computeDialogueQcStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  dialogueAudioStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = ["dialogue_audio_plan"];

  if (dialogueAudioStep.status !== "passed") {
    return makeStep({
      stepId: "dialogue_qc",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: ["VD_WIZARD_DIALOGUE_PLAN_MISSING"],
      creditSpending: "none",
      evidence: [
        {
          label: "Dialogue plan",
          value: "Required first",
          severity: "warning",
          evidenceId: "dialogue_qc_needs_dialogue_audio",
        },
      ],
    });
  }

  const quality = input.episodeDialogueQuality;
  const blockingIssues = quality?.issues.filter(issue => issue.severity === "error") ?? [];
  const warningIssues = quality?.issues.filter(issue => issue.severity === "warning") ?? [];
  const hasBlocking = blockingIssues.length > 0;

  const evidence: VerticalDramaProductionWizardEvidenceRow[] = [
    {
      label: "Episode speech coverage",
      value: quality
        ? `${quality.totalSpeechSeconds.toFixed(1)}s / target ${quality.targetSpeechSeconds.toFixed(1)}s`
        : "N/A",
      severity: hasBlocking ? "error" : warningIssues.length > 0 ? "warning" : undefined,
      evidenceId: quality ? "dialogue_qc_episode_coverage" : "dialogue_qc_episode_coverage_unavailable",
      detail: quality
        ? `${quality.totalSpeechSeconds.toFixed(1)}/${quality.targetSpeechSeconds.toFixed(1)}`
        : undefined,
    },
  ];
  if (hasBlocking) {
    evidence.push({
      label: "Blocking dialogue issues",
      value: String(blockingIssues.length),
      severity: "error",
      evidenceId: "dialogue_qc_blocking_count",
      detail: String(blockingIssues.length),
    });
  }

  return makeStep({
    stepId: "dialogue_qc",
    status: hasBlocking ? "blocked" : "passed",
    primaryAction: hasBlocking ? "repair_dialogue" : "none",
    sourceStages,
    // See module header, decision 5.
    blockingReasons: hasBlocking ? ["VD_WIZARD_DIALOGUE_UNDERFILLED"] : [],
    creditSpending: "none",
    evidence,
    criteria: [
      {
        id: "dialogue_no_blocking_issues",
        passed: !hasBlocking,
        detail: hasBlocking ? String(blockingIssues.length) : undefined,
      },
      // Acceptance-review fix #3 (2026-07-08, MEDIUM) — non-blocking
      // companion criterion (mirrors `episode_script`'s existing
      // "false/null never changes status, only passState" pattern): a
      // dialogue plan with zero blocking (error-severity) issues but ONE OR
      // MORE warning-severity issues previously still read a clean "passed"
      // checklist (`derivePassState` only ever saw the single
      // `dialogue_no_blocking_issues` criterion, which reads `true`
      // whenever nothing is BLOCKING, regardless of warnings). This
      // criterion reading `false` makes `derivePassState` correctly yield
      // "passed_with_warnings" instead — `status`/`blockingReasons`/
      // `primaryAction` above are untouched either way.
      {
        id: "dialogue_no_warning_issues",
        passed: warningIssues.length === 0,
        detail: warningIssues.length > 0 ? String(warningIssues.length) : undefined,
      },
    ],
  });
}

/** Gate 1 (section-12): storyboard + approved frames + dialogue plan +
 *  passing dialogue QC, all required. */
function computeVideoPromptsStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  storyboardStep: VerticalDramaProductionWizardStep,
  startFramesStep: VerticalDramaProductionWizardStep,
  dialogueAudioStep: VerticalDramaProductionWizardStep,
  dialogueQcStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = ["video_motion_prompt_pack"];

  const reasons: string[] = [];
  if (storyboardStep.status !== "passed") reasons.push("VD_WIZARD_STORYBOARD_MISSING");
  if (startFramesStep.status !== "passed") reasons.push("VD_WIZARD_START_FRAMES_NOT_APPROVED");
  if (dialogueAudioStep.status !== "passed") reasons.push("VD_WIZARD_DIALOGUE_PLAN_MISSING");
  if (dialogueQcStep.status === "blocked") reasons.push("VD_WIZARD_DIALOGUE_UNDERFILLED");

  if (reasons.length > 0) {
    return makeStep({
      stepId: "video_prompts",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: reasons,
      creditSpending: "llm",
      evidence: [
        {
          label: "Video prompts",
          value: "Prerequisites not met",
          severity: "warning",
          evidenceId: "video_prompts_prerequisites_not_met",
        },
      ],
    });
  }

  const { exists, stale } = input.videoPrompts;
  const status: VerticalDramaProductionWizardStepStatus = !exists
    ? "ready"
    : stale
      ? "needs_repair"
      : "passed";

  return makeStep({
    stepId: "video_prompts",
    status,
    primaryAction: status === "passed" ? "none" : "generate_video_prompts",
    sourceStages,
    blockingReasons: [],
    creditSpending: "llm",
    evidence: [
      {
        label: "Video prompt pack",
        value: !exists ? "Not generated" : stale ? "Stale" : "Fresh",
        severity: stale ? "warning" : undefined,
        evidenceId: !exists
          ? "video_prompts_not_generated"
          : stale
            ? "video_prompts_stale"
            : "video_prompts_fresh",
      },
    ],
    criteria: [
      { id: "video_prompts_exist", passed: exists },
      { id: "video_prompts_not_stale", passed: exists ? !stale : null },
    ],
  });
}

/** Step 9 — always secondary/optional (section-12: "Per-shot actions are
 *  always secondary"). Never becomes the wizard's primary CTA — see the
 *  `activeStepId` scan in `deriveVerticalDramaProductionWizardState`. No
 *  `criteria` (module header, decision 10) — this is a live repair counter,
 *  not a pass/fail gate. */
function computeShotRepairStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  storyboardStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  if (storyboardStep.status !== "passed") {
    return makeStep({
      stepId: "shot_repair",
      status: "locked",
      primaryAction: "none",
      sourceStages: [],
      blockingReasons: [],
      creditSpending: "llm",
      evidence: [
        {
          label: "Storyboard",
          value: "Required first",
          severity: "warning",
          evidenceId: "shot_repair_needs_storyboard",
        },
      ],
    });
  }

  const { failingTargetCount } = input.shotRepair;
  const needsRepair = failingTargetCount > 0;

  return makeStep({
    stepId: "shot_repair",
    status: needsRepair ? "needs_repair" : "optional",
    primaryAction: needsRepair ? "repair_shots" : "none",
    // No fixed pipeline-stage set — repair targets vary per shot/clip.
    sourceStages: [],
    blockingReasons: [],
    creditSpending: "llm",
    evidence: [
      {
        label: "Shots needing repair",
        value: String(failingTargetCount),
        evidenceId: "shot_repair_count",
        detail: String(failingTargetCount),
      },
    ],
  });
}

/** Gate 2 (section-12): video prompt pack must exist, every clip must have
 *  a prompt, and the pack must not be stale. */
function computeVideoClipsStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  videoPromptsStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = ["render_or_import_video_clips"];

  if (videoPromptsStep.status !== "passed") {
    // See module header, decision 6.
    return makeStep({
      stepId: "video_clips",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: ["VD_WIZARD_VIDEO_PROMPTS_STALE"],
      creditSpending: "video",
      evidence: [
        {
          label: "Video prompts",
          value: "Not ready",
          severity: "warning",
          evidenceId: "video_clips_needs_video_prompts",
        },
      ],
    });
  }

  const { required, completed } = input.clips;
  const complete = required > 0 && completed >= required;

  return makeStep({
    stepId: "video_clips",
    status: complete ? "passed" : "ready",
    primaryAction: complete ? "none" : "generate_video_clips",
    sourceStages,
    blockingReasons: [],
    creditSpending: "video",
    evidence: [
      {
        label: "Clips completed",
        value: `${completed}/${required}`,
        severity: complete ? undefined : "warning",
        evidenceId: "video_clips_completed_count",
        detail: `${completed}/${required}`,
      },
    ],
    criteria: [
      { id: "video_clips_all_complete", passed: complete, detail: `${completed}/${required}` },
    ],
  });
}

/** Gate 3 (section-12): every required clip complete, durations aligned
 *  with the duration profile, and audio/subtitle strategy resolved. */
function computeFinalEpisodeStep(
  input: DeriveVerticalDramaProductionWizardStateInput,
  videoClipsStep: VerticalDramaProductionWizardStep,
): VerticalDramaProductionWizardStep {
  const sourceStages: VerticalDramaPipelineStage[] = [
    "assemble_episode_manifest",
    "summarize_episode_to_series_memory",
  ];

  if (videoClipsStep.status !== "passed") {
    return makeStep({
      stepId: "final_episode",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: ["VD_WIZARD_VIDEO_CLIPS_INCOMPLETE"],
      creditSpending: "llm",
      evidence: [
        {
          label: "Video clips",
          value: "Not complete",
          severity: "warning",
          evidenceId: "final_episode_needs_video_clips",
        },
      ],
    });
  }

  const { completed, durationsAligned, audioSubtitleResolved } = input.assembly;

  if (!durationsAligned || !audioSubtitleResolved) {
    return makeStep({
      stepId: "final_episode",
      status: "locked",
      primaryAction: "none",
      sourceStages,
      blockingReasons: ["VD_WIZARD_ASSEMBLY_BLOCKED"],
      creditSpending: "llm",
      evidence: [
        {
          label: "Assembly readiness",
          value: !durationsAligned
            ? "Clip durations do not match the duration profile"
            : "Audio/subtitle strategy unresolved",
          severity: "error",
          evidenceId: !durationsAligned
            ? "final_episode_durations_misaligned"
            : "final_episode_audio_subtitle_unresolved",
        },
      ],
      // This branch is THIS step's own criteria failing (not an earlier
      // step's prerequisite, unlike the "video clips not complete" branch
      // above) — populated despite `status: "locked"` so the checklist
      // still explains exactly which of the two facts is unmet.
      criteria: [
        { id: "final_assembly_durations_aligned", passed: durationsAligned },
        { id: "final_assembly_audio_subtitle_resolved", passed: audioSubtitleResolved },
      ],
    });
  }

  return makeStep({
    stepId: "final_episode",
    status: completed ? "passed" : "ready",
    primaryAction: completed ? "none" : "assemble_episode",
    sourceStages,
    blockingReasons: [],
    creditSpending: "llm",
    evidence: [
      {
        label: "Assembly",
        value: completed ? "Completed" : "Ready to assemble",
        evidenceId: completed ? "final_episode_completed" : "final_episode_ready_to_assemble",
      },
    ],
    criteria: [
      { id: "final_assembly_durations_aligned", passed: true },
      { id: "final_assembly_audio_subtitle_resolved", passed: true },
      { id: "final_assembly_completed", passed: completed },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Orchestrator                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Derives the Production Wizard's full step list, active step, and single
 * primary CTA from a plain snapshot (section-12 "Recommended
 * Implementation / Shared Contracts"). Pure and deterministic — identical
 * input always yields identical output; no I/O of any kind.
 */
export function deriveVerticalDramaProductionWizardState(
  input: DeriveVerticalDramaProductionWizardStateInput,
): VerticalDramaProductionWizardState {
  const exempt = input.gateExemptStepIds;

  const seriesSetupStep = clampForGrandfathering(computeSeriesSetupStep(input), exempt);
  const episodeScriptStep = clampForGrandfathering(
    computeEpisodeScriptStep(input, seriesSetupStep),
    exempt,
  );
  const storyboardStep = clampForGrandfathering(
    computeStoryboardStep(input, episodeScriptStep),
    exempt,
  );
  const scriptQcStep = clampForGrandfathering(computeScriptQcStep(input, storyboardStep), exempt);
  const startFramesStep = clampForGrandfathering(
    computeStartFramesStep(input, scriptQcStep),
    exempt,
  );
  const dialogueAudioStep = clampForGrandfathering(
    computeDialogueAudioStep(input, startFramesStep),
    exempt,
  );
  const dialogueQcStep = clampForGrandfathering(
    computeDialogueQcStep(input, dialogueAudioStep),
    exempt,
  );
  const videoPromptsStep = clampForGrandfathering(
    computeVideoPromptsStep(
      input,
      storyboardStep,
      startFramesStep,
      dialogueAudioStep,
      dialogueQcStep,
    ),
    exempt,
  );
  const shotRepairStep = clampForGrandfathering(
    computeShotRepairStep(input, storyboardStep),
    exempt,
  );
  const videoClipsStep = clampForGrandfathering(
    computeVideoClipsStep(input, videoPromptsStep),
    exempt,
  );
  const finalEpisodeStep = clampForGrandfathering(
    computeFinalEpisodeStep(input, videoClipsStep),
    exempt,
  );

  const steps: VerticalDramaProductionWizardStep[] = [
    seriesSetupStep,
    episodeScriptStep,
    storyboardStep,
    scriptQcStep,
    startFramesStep,
    dialogueAudioStep,
    dialogueQcStep,
    videoPromptsStep,
    shotRepairStep,
    videoClipsStep,
    finalEpisodeStep,
  ];

  // shot_repair (step 9) is deliberately excluded from primary-CTA
  // consideration — always secondary, even while "needs_repair" (see
  // `computeShotRepairStep`'s doc comment). When every OTHER step has
  // reached a terminal, non-actionable state ("passed"/"optional"/
  // "skipped"), the episode is fully produced — fall back to
  // `final_episode` with its own (by then "passed") primary action
  // ("none").
  const active =
    steps.find(
      step =>
        step.stepId !== "shot_repair" &&
        step.status !== "passed" &&
        step.status !== "optional" &&
        step.status !== "skipped",
    ) ?? finalEpisodeStep;

  return {
    activeStepId: active.stepId,
    steps,
    primaryCta: active.primaryAction,
  };
}
