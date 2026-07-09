# section-14-script-quality-qc-auto-improve

## Goal

Formalize the shipped episode quality-review loop (v1, Phase 3B of
`planning/vertical-drama-storyboard-complete/plan.md`) as spec contract and
extend it to v2: scorecard superset with intensity + continuity + tie-in
dimensions, deterministic density metrics unified into the report, a
per-tenant quality policy with pass floors, and a bounded auto-improve loop
(apply → re-review → repeat) with a regression guard and human escalation.
Implements spec §16.1 and the §13.1 loop wiring.

Problem being fixed (production feedback 2026-07-07): story intensity and QC
must improve together with dialogue density, and improvement after QC must be
automatic — but bounded, auditable, and never able to spend media credits or
silently replace a better version with a worse one.

## Depends On

- section-04-series-memory-and-episode-pipeline
- section-08-provider-qc-product-tie-in (tie-in report inputs, §13.1)
- section-13-story-dialogue-density-reform (deterministic density metrics)

> **Not this section (added 2026-07-09, task #29):** the
> `vertical-drama-season-dramaturgy-critic` skill and its
> `critiqueSeasonDrafts`/`applySeasonCritique` workflow (spec §6.8.2, §16.2)
> are a SEPARATE, on-demand, SEASON-granularity pass over deep story drafts
> (spec §8.2.3) — they never run inside this section's per-episode loop and
> do not change this section's behavior. Do not confuse the two when reading
> `server/services/verticalDramaStoryBible.ts`, which hosts both:
> `analyzeSeasonDramaturgy`/`VdDramaturgyFinding` belong to the season critic,
> not to this section's scorecard v2.

Feature flag: `verticalDramaSeriesQualityLoopV2` (requires
`verticalDramaSeriesSpeechBudget`). Default OFF; flags-off keeps shipped v1
behavior exactly (advisory scorecard, single manual apply + one auto
re-review).

## Shipped v1 Baseline (record — do not regress)

- Service `apps/web/server/services/verticalDramaEpisodeQualityReview.ts`:
  `runVerticalDramaEpisodeQualityReview` via skill
  `vertical-drama-episode-quality-review`; LLM-only; ~20-credit pre-check;
  payload guard 400k; always returns a full scorecard (never blocks by
  itself). NOTE: the file-header comment "NOT wired into any router yet" is
  stale — remove it in this section's work.
- Apply logic `apps/web/server/services/verticalDramaQualityReviewApply.ts`:
  `classifyQualityReviewIssueLocation` (`beat N` → `plan_episode_script`;
  `shot N`/unrecognized → `storyboard_shotgrid`),
  `groupQualityReviewIssuesByStage`,
  `composeQualityReviewRepairInstruction`,
  `QUALITY_REVIEW_APPLY_STAGE_ORDER` (script before storyboard).
- Router procedures (`apps/web/server/routers/verticalDramaEpisodes.ts`):
  `runEpisodeQualityReview` (supports `avoidPrevious`) and
  `applyQualityReviewSuggestions` → `verticalDramaEpisodePipeline.repairStage`
  per grouped stage, then one auto re-review persisted via
  `persistQualityReviewArtifact` (run/artifact ledger, stage tag
  `episode_quality_review`).
- Scorecard v1 keys: `reversal_count`, `reversal_sharpness` (1-5),
  `emotion_variety` (1-5), `dialogue_naturalness` (1-5 | null), `pacing`
  (1-5), `overall` (1-5); `issues[]` `{location, problem, suggested_fix}`.

## Files

Create:

- `apps/web/shared/verticalDramaSeries/qualityPolicy.ts` — `VerticalDramaQualityPolicy`, floor evaluation helpers, loop-state types
- `apps/web/server/services/verticalDramaQualityLoop.ts` — bounded loop orchestrator (round control, regression guard, escalation)
- `apps/web/server/services/__tests__/verticalDramaQualityLoop.test.ts`
- `apps/web/shared/verticalDramaSeries/__tests__/qualityPolicy.test.ts`

Modify:

- `apps/web/server/services/verticalDramaEpisodeQualityReview.ts` — scorecard v2 superset schema (`contract_version: 2`), deterministic-metrics injection into prompt + persisted report, stale header comment removal
- `apps/web/server/services/verticalDramaQualityReviewApply.ts` — third repair group `dialogue_audio_plan`; storyboard instruction composed from the CURRENT round's review (fixes the documented v1 limitation)
- `apps/web/server/routers/verticalDramaEpisodes.ts` — `applyQualityReviewSuggestions` gains loop mode (policy-driven rounds); `getEpisodeDetail` returns policy floors + loop state; expert-mode override recording
- `apps/web/skills/vertical-drama-episode-quality-review/` — SKILL.md + schemas superset for v2 dimensions and echoed deterministic metrics
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` — scorecard v2 panel: scores vs floors, density metrics, round history, escalation state
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts` — Thai copy for loop/escalation/override states
- Genre preset schema/seeds (`vertical_drama_genre_presets`) — optional embedded quality policy (preset-carriable floors)

## Contracts

```ts
type VerticalDramaQualityPolicy = {
  minOverall: number;                   // default 4 (of 5)
  minPerDimension: number;              // default 3 (of 5)
  tieInMinNaturalnessScore: number;     // default 70 (of 100, §13.1); regulated may only raise
  maxAutoImproveRounds: number;         // default 2, allowed 0-3; 0 = manual apply only
  autoRunReviewAfterStoryboard: boolean; // default true in guided mode — review scores script + storyboard together (§6.8.1)
  blockPaidGenerationBelowFloor: boolean; // default true guided, false expert
};

type VerticalDramaQualityLoopState = {
  episodeId: string;
  rounds: Array<{
    round: number;                      // 1-based
    reviewArtifactId: string;           // pre-round review
    stagesRepaired: VerticalDramaPipelineStage[]; // script/storyboard/dialogue subset
    reReviewArtifactId: string;
    overallBefore: number;
    overallAfter: number;
  }>;
  status: "idle" | "running" | "passed" | "escalated_max_rounds" | "escalated_regression";
  activeReviewArtifactId: string;       // best-scoring surviving review
};
```

Scorecard v2 (superset of v1, `contract_version: 2`): adds `hook_strength`
(1-5), `cliffhanger_strength` (1-5), `continuity_consistency` (1-5),
`tie_in_naturalness` (1-5 | null when tie-in disabled), and a
`density_metrics` block echoing the deterministic §7.7.1 computation
(`estimated_speech_seconds`, per-clip coverage summary, silent-gap count,
duplicate-line count, stage-direction count, reversal count from script
markers, max consecutive same-emotion shots).

Hard rules (spec §16.1):

1. Deterministic facts are computed in code and injected; the LLM never
   re-estimates them. One report carries both signal families (unifies the
   scorecard with `dialogueQuality.ts` output).
2. Loop round = review → group → repair → re-review, using the CANONICAL
   repair-group order declared in spec §16.1: `plan_episode_script` →
   `storyboard_shotgrid` → `dialogue_audio_plan` → `tie_in` (v1 shipped the
   first two; v2 adds dialogue third; the tie-in group is active only when
   `verticalDramaSeriesTieInQc` is on — §13.1/section-08). Rounds stop on:
   pass, `maxAutoImproveRounds`, or regression (re-review `overall` <
   pre-round `overall`). The review itself requires script + storyboard
   (§6.8.1), so the loop is reachable only from the storyboard onward, and
   its guided-mode gate holds the first PAID stage (start frames), never the
   storyboard.
3. Regression guard: on regression, the pre-round artifact version stays the
   active candidate (round repairs are superseded, never deleted) and status
   becomes `escalated_regression` with BOTH reports visible.
4. The loop is LLM-only (plan_only class). It can never trigger paid
   image/video/TTS calls; every LLM round is credit-checked and the full
   loop estimate (rounds × per-round) is shown before starting.
5. All rounds are append-only run artifacts + audit events (`repair` action
   per repaired stage).
6. Gate semantics: expert mode = advisory (v1 behavior; shipping below floor
   records an explicit override with user id + failing report id). Guided
   mode = below-floor blocks every paid wizard step downstream of the
   storyboard (start frames first, then video prompts / paid generation).
7. Policy storage: `VerticalDramaQualityPolicy` persists as a nullable
   `qualityPolicy` jsonb column on `vertical_drama_series` (null → tenant
   default → built-in defaults); a genre preset may carry a policy copy in
   `vertical_drama_genre_presets` that is stamped onto the series at
   create/apply time (section-02 pins the column contract).
7. Storyboard/dialogue repair instructions are composed from the CURRENT
   round's review, not the loop's first review.
8. v1 artifacts (`contract_version` absent/1) remain readable everywhere the
   v2 report is consumed.

## UI/UX Contract

### Target User / JTBD

- Role: creator deciding whether the episode is good enough to spend credits.
- Entry: scorecard panel in the episode workspace; wizard `script_qc` step.
- Success: one glance shows scores vs floors and density facts; one click
  runs the bounded improve loop; escalations explain themselves.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Scorecard panel v2 | `VerticalDramaStoryboardPanel.tsx` | scores vs floors, density metrics, round history, escalation banner |
| Loop CTA | scorecard panel / wizard step | "ปรับอัตโนมัติ (สูงสุด {n} รอบ)" with full-loop credit estimate |
| Override control | scorecard panel (expert mode) | explicit below-floor override with recorded confirmation |
| Preset policy | series settings / preset editor | optional policy floors carried by preset |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `verticalDramaQualityLoop` | server service | round control, regression guard, escalation | quality review service + apply grouping + repairStage |
| `VerticalDramaScorecardPanel` (v2 upgrade of shipped scorecard UI) | `VerticalDramaStoryboardPanel.tsx` | scores vs floors, density metrics, round history | scorecard v2 artifact + `VerticalDramaQualityPolicy` + loop state from `getEpisodeDetail` |
| `VerticalDramaQualityLoopProgress` | new UI component | per-round progress + escalation banners | loop state |
| Override confirm dialog | scorecard panel | recorded below-floor override | override mutation + audit |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | scorecard skeleton | UI test |
| no review yet | "ตรวจคุณภาพตอน" CTA, no fake scores | UI test |
| passed | green scores, floors met, wizard step passed | UI/service test |
| below floor (guided) | blocking banner + loop CTA as primary unblock | UI/service test |
| below floor (expert) | advisory banner + loop CTA + override control | UI test |
| loop running | per-round progress (round n/max, stage being repaired) | UI test |
| escalated_max_rounds | banner with best report kept + manual repair CTAs | UI/service test |
| escalated_regression | banner showing before/after scores, best version kept | UI/service test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | score chips wrap; round history collapses | screenshot |
| tablet 768x1024 | scorecard + density metrics two-column | screenshot |
| desktop 1440x900 | panel fits alongside shot grid | screenshot |

### Accessibility Acceptance

- Scores and floors are text-visible (never color-only); dimension names localized.
- Loop progress announced via live region; escalation banners are headings.
- Override requires an explicit labeled confirmation, keyboard reachable.

### Copy Contract

- "คะแนนรวม {x}/5 (เกณฑ์ {y})"
- "ปรับอัตโนมัติ (สูงสุด {n} รอบ, ~{c} เครดิต)"
- "รอบ {i}: แก้บท → แก้สตอรีบอร์ด → ตรวจใหม่"
- "คะแนนแย่ลง — คงเวอร์ชันที่ดีกว่าไว้ ต้องตรวจเอง"
- "ครบ {n} รอบแล้วยังไม่ถึงเกณฑ์ — ต้องตรวจเอง"
- "ยืนยันไปต่อทั้งที่ต่ำกว่าเกณฑ์ (บันทึกการอนุมัติ)"

### Browser Evidence Required

Capture: passed, below-floor guided (blocked), loop running, both escalation
states, expert override confirm.

## Tests First

- Test: scorecard v2 schema is a superset — v1 fixture artifacts parse; v2 requires the new dimensions; `tie_in_naturalness` null when tie-in disabled.
- Test: deterministic `density_metrics` are injected into the judge prompt and persisted verbatim; LLM-provided numbers for those fields are ignored/overwritten.
- Test: policy floors evaluate pass/fail (`minOverall`, `minPerDimension`, tie-in threshold); preset-carried policy overrides tenant default; regulated tie-in floor can only be raised.
- Test: loop runs review→repair→re-review rounds and stops on pass within `maxAutoImproveRounds`.
- Test: loop stops on regression, keeps the higher-scoring artifact active, supersedes (not deletes) the round's repairs, sets `escalated_regression`.
- Test: loop stops after max rounds, sets `escalated_max_rounds`, preserves every round's artifacts.
- Test: `maxAutoImproveRounds: 0` disables auto-loop (manual v1 apply still works).
- Test: dialogue issues classify to the third group and repair `dialogue_audio_plan` after storyboard; with `verticalDramaSeriesTieInQc` on, tie-in issues classify to the fourth group in the canonical order.
- Test: round 2's storyboard instruction is composed from round 2's review (not round 1's).
- Test: the loop never calls image/video/TTS paths (mock provider spy) and every round emits credit + audit records; full-loop estimate = rounds × per-round estimate.
- Test: guided mode blocks the paid start-frame step (and everything downstream) below floor; expert mode allows with recorded override (user id + report id + audit event).
- Test: the review/loop is not offered before the storyboard exists (review requires script + storyboard); the script→storyboard transition is gated only by the deterministic density check.
- Test: `qualityPolicy` resolution order — series column → tenant default → built-in defaults; preset-carried policy stamps the series at create/apply.
- Test: enabling `verticalDramaSeriesQualityLoopV2` mid-series does not invalidate previously completed stages (grandfathering, spec §17).
- Test: flag off — router behavior identical to shipped v1 (single apply + one auto re-review; no floors, no blocking).

## Implementation Tasks

1. Add `qualityPolicy.ts` (policy + floor evaluation + loop-state types).
2. Scorecard v2 superset in service + skill schemas; deterministic-metrics injection; remove stale header comment.
3. Extend apply grouping with `dialogue_audio_plan`; current-round instruction composition.
4. Build `verticalDramaQualityLoop.ts` orchestrator (rounds, regression guard, escalation, credit pre-estimate).
5. Router: loop mode on `applyQualityReviewSuggestions`, policy + loop state in `getEpisodeDetail`, override recording.
6. Preset-carried policy (schema + seed + settings UI hook).
7. Scorecard v2 panel + loop progress + escalation + override UI with Thai copy.
8. Tests per the list above; fixtures: below-floor episode, regression round, tie-in episode.

## Acceptance

- One click takes a below-floor episode through bounded auto-improvement to pass or a self-explaining escalation, with every round auditable.
- A worse rewrite never replaces a better version.
- Deterministic density facts and LLM judgments appear in ONE report.
- Guided mode cannot spend media credits below floor; expert overrides are recorded.
- Flags off = shipped v1, byte-compatible.

## Verification

```bash
cd apps/web && pnpm test -- verticalDramaQualityLoop
cd apps/web && pnpm test -- qualityPolicy
cd apps/web && pnpm test -- verticalDramaEpisodeQualityReview
cd apps/web && pnpm test -- verticalDramaQualityReviewApply
cd apps/web && pnpm check
```
