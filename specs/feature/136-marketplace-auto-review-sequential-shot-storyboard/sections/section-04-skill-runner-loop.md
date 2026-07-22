<!-- SECTION: section-04-skill-runner-loop -->

# Section 04 — Skill Runner + Loop Orchestration

| | |
|---|---|
| Section id | `section-04-skill-runner-loop` |
| Source plan | `../claude-plan.md` WS-4; tests from `../claude-plan-tdd.md` WS-4 |
| Spec authority | `../spec.md` v1.3.0 §9.4, §9.5, §9.7, §12.3, §12.5, §13.3, §14.3, §14.6, §15, §16, §19.2, §23.1 |
| Depends on | `section-02-reference-layer` (manifest shape + `referenceIndexMap.ts` validator), `section-03-skill-bundle` (skill on disk + schemas + frontmatter config) |
| Blocks | `section-05-evidence-plan-surface`, `section-06-sequential-pipeline` |
| Milestones | M1 = runner skeleton (steps 1–5 of §5.1 below, compiling + contract-tested); M2 = everything else in this section |
| Runtime / test command | TypeScript; `npm --prefix apps/web run test -- <files>` from repo root |

## 1. Objective

Build `productReviewSequentialStoryboardSkillRunner.ts`: the Tier-1 execution
engine that invokes the `product-review-sequential-storyboard` skill
(section-03) with a complete runtime contract, orchestrates up to 3
TS-driven review rounds with per-round persistence and mid-loop resume,
retains the best version, records candidates, runs a deterministic TS
preflight over the returned 9-shot pack, routes over-budget prompts through
the optimizer skill (never mechanical truncation), and degrades to
deterministic per-shot prompts when the skill fails structurally. The output
is a validated, quality-verified 9-shot pack produced inside the
`prompt_plan` stage. This section delivers the callable module + its SVC
helpers; persisting the full pack to `metadataJson.sequentialStoryboard.*`
is section-05 and wiring into the stage-advance flow is section-06.

## 2. Background context (read this before coding)

- `SVC` = `apps/web/server/services/marketplaceAutoReviewService.ts`
  (~27k lines). The run machine advances stages `product_preflight →
  production_project → concept_story → prompt_plan → image_generation →
  storyboard_review`; today `concept_story` and `prompt_plan` are both marked
  completed in the same advance step (SVC:18099-18153). The sequential loop
  runs logically "inside `prompt_plan`" — the runner must be a standalone
  async function that **section-05 calls** before `prompt_plan` completes
  (ownership assigned in cross-consistency review round 1 — section 05 owns
  the sequential `prompt_plan` orchestration: policy pre-computation →
  effects construction → runner invocation → persistence → stage close).
- Skill-first rule (binding, plan §3.3): creative judgment (what each round
  evaluates and rewrites, scoring, dialogue, prompt authoring) lives in the
  skill body Phases A–K (section-03). TypeScript validates ONLY
  machine-checkable facts and orchestrates durably/auditably.
- Mandatory in-skill QA (spec §9.7): the skill must return `loopReport`
  (with per-round candidate scores) and a passing `finalQc`. A bare final
  answer with no verification evidence is a contract violation the runner
  rejects. The TS deterministic preflight is a BACKSTOP, not the primary QA.
- The canonical runner shape to clone is
  `apps/web/server/services/productReferenceStoryboardSkillRunner.ts:1998-2079`
  (`runProductReferenceStoryboardPromptSkill`): sync → load → merged inputs →
  input-schema audit hard-fail before spend → policy → provider →
  `executeSharedSkillTextRuntime` with `legacyExecute` closure.
- Weak-model tolerance is a repo policy: never "fix" malformed skill JSON by
  switching models (cost policy, memory `project_vd_weak_model_json_class`);
  use lenient parsing + bounded retries instead.

### Verified code anchors (2026-07-21)

| Anchor | What it is |
|---|---|
| `productReferenceStoryboardSkillRunner.ts:33-37` | Skill-id constant + `PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS = 3800` naming precedent |
| `productReferenceStoryboardSkillRunner.ts:1998-2086` | Runner skeleton: `syncSingleSkillIfChanged` → `getSkillByIdAsync` → `buildSkillInputSchemaAudit` hard-fail (`:2054-2086`, throws BEFORE any provider/credit call) |
| `productReferenceStoryboardSkillRunner.ts:1755-1783` | `optimizeProductReferenceStoryboardPrompt(input)` — optimizer skill invocation to extend with `prompt_kind` |
| `services/skillExecutionPolicy.ts:19-47` | `resolveSkillExecutionPolicy({skill})` → `{modelId, allowFreeModels, preferredProviderId?, strictProviderPin?, modelSource}` |
| `services/agentRuntime/skillRuntimeOrchestrator.ts:101-139` | `ExecuteSharedSkillRuntimeInput` — required: `tenantId, userId, objective, entryPoint, modelConfig, skillSlugs, legacyExecute, activeTransform`; optional `systemPrompt, referenceImages, schemaHint, originSurface, runId` |
| SVC:11760-11836 | `legacyExecute` closure precedent: `executeWithFallback({..., strictProviderPin, disableProviderFallbacks: true, allowFreeModels})` + credits via `calculateCreditsForLLMDynamic`/`deductCredits` |
| `verticalDramaStoryBible.ts:1353` / `:970` / `:1268` | `executeJsonPlanningCallWithRetry` (schema-validated retry) / `extractJson` + jsonrepair / error classifier — lenient JSON machinery to reuse |
| `videoProjectQualityLoop.ts:59-66,121-130` | Injectable-effects loop orchestrator DI shape (`effects` parameter, pure orchestrator, no DB/LLM imports of its own) |
| SVC:1218, :9617-9697 | `MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS = 3` + bounded attempt loop with structured `retryHistory` + feedback re-injection |
| SVC:9501-9528 | Grid degraded-fallback advisory mode: preflight result decorated with warning `storyboard_prompt_degraded_fallback`, never throws, generation proceeds |
| SVC:8633-8655 | `validateMarketplaceAutoReviewImagePromptPreflight` — blocker-id conventions (`prompt_empty`, `prompt_too_long_for_image_provider`, `minor_safety_clothing_lock_missing`) |
| SVC:1535-1587 | `optimizeMarketplaceAutoReviewFinalImagePromptForProvider` — over-budget gate (`:1549`), audit reason `final_image_prompt_over_provider_budget` (`:1571`) |
| SVC:15196-15198 | `MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS` (=3800) and `MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS = 2000` |
| SVC:15353-15402 | `buildShotFramePrompt(plan, shot, role, overlayTextMode)` — deterministic per-shot prompt (fallback source; module-private, ends with `buildMinorSafetyClothingLock`) |
| SVC:17993-18005 | Voiceover rewrite hook (`rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill`) — reused UNTOUCHED; do not add a sequential variant |
| `shared/hyperframes/autoReviewCreativePresets.ts:311-341` | `buildAutoReviewCreativePresetDirective({selections, videoModel})` — compiled preset directive string |
| `shared/verticalDramaSeries/dialogueQuality.ts:91,113` | Thai speech estimator precedent: `THAI_CHARS_PER_SECOND = 17`, `estimateVerticalDramaSpeechSeconds` |
| `mediaGenerationService.ts:1401-1404` | `getReferenceImageLimitForModel` (provider caps; used by section-02 resolver) |

## 3. Deliverables

Create:

1. `apps/web/server/services/productReviewSequentialStoryboardSkillRunner.ts`
   — the runner module (skill invocation, loop orchestrator, deterministic
   preflight, score/retention logic, typed errors, exported constants).
2. `apps/web/server/services/__tests__/productReviewSequentialStoryboardSkillRunner.test.ts`
   — the WS-4 test suite (§4 below).

Modify (small, additive):

3. `apps/web/server/services/productReferenceStoryboardSkillRunner.ts` —
   extend `optimizeProductReferenceStoryboardPrompt` input with optional
   `prompt_kind?: "sequential_image" | "sequential_video"` threaded into the
   optimizer skill's user inputs (the optimizer skill schema update itself is
   part of this change; keep it backward-compatible — absent = legacy 3x3
   behavior, byte-identical output for existing callers).
4. `apps/web/server/services/marketplaceAutoReviewService.ts` — additive only:
   - new constant `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS = 4000`
     (beside :15196-15198);
   - a sequential-aware over-budget wrapper (sibling of
     `optimizeMarketplaceAutoReviewFinalImagePromptForProvider` :1535 or a
     parameterized extension) that takes the effective budget + `prompt_kind`
     and emits audit reason `final_image_prompt_over_provider_budget` /
     new `final_video_prompt_over_provider_budget`;
   - the degraded-fallback assembly helper (§5.10) with an exported
     `...ForTest` wrapper (convention: `buildMarketplaceAutoReview3x3StoryboardPromptForTest` SVC:15404).

Explicitly NOT in this section: stage wiring / `buildInitialImageUnits` fork
(section-06), full `metadataJson.sequentialStoryboard.*` persistence and plan
surface (section-05), guardian/assembly directive BUILDERS and QA fields
(section-07), UI (section-11).

## 4. TDD — write these tests FIRST

File: `apps/web/server/services/__tests__/productReviewSequentialStoryboardSkillRunner.test.ts`.
Vitest, run from repo root as `npm --prefix apps/web run test -- apps/web/server/services/__tests__/productReviewSequentialStoryboardSkillRunner.test.ts`
(vitest path relative to `apps/web` when invoked that way — follow neighboring
service tests). No real LLM calls: mock the registry pair
(`syncSingleSkillIfChanged`, `getSkillByIdAsync`) via `vi.mock` on
`../skillRegistry`, and inject fake loop effects (§5.5) for orchestration
tests. Pure functions (preflight, retention, estimator) are tested directly
on crafted fixtures. Prose stubs; write them as real failing tests first:

1. **Sync/load guards** — `syncSingleSkillIfChanged` returning `{error}` ⇒
   runner throws containing the skill id; `getSkillByIdAsync` returning
   `null` ⇒ throws "not found or not enabled".
2. **Input-schema audit hard-fails before spend** — audit `status: "failed"`
   ⇒ throw; assert the injected provider/skill-invocation effect and any
   credit function were NEVER called (spy call count 0).
3. **Runtime contract completeness** — build the contract for a fixture run
   and assert the string (or line array) contains: image budget (effective),
   video budget 2000, `shot_count` 9, max shot duration 10, every reference
   manifest entry (index/role/angleLabel incl. `evidenceOnly` entries),
   product-truth text, blocked claims + `forbiddenClaims`,
   `confirmedAttributes`, `childSubjectPolicy`, the compiled preset directive
   (`buildAutoReviewCreativePresetDirective` output), and the
   `motionDirection` DUAL-INJECTION instruction (must instruct the skill to
   inject it into BOTH the story plan AND every submitted video prompt's
   action/camera language — assert both phrases present).
4. **Loop bounds + per-round persistence + resume** — fake
   `invokeSkillRound` returning valid packs: assert ≤3 invocations; assert
   `persistRoundReport` was awaited for round N BEFORE round N+1's
   invocation (ordering via a call log); with
   `loadPersistedLoopState` returning rounds 1–2 already recorded, assert the
   runner resumes at round 3 (exactly one further invocation).
5. **Best-version retention** — round 2 total score lower than round 1 ⇒
   round 1's pack is the retained/selected version; a HIGHER-scoring round
   that violates a deterministic disqualifier (missing global-block marker /
   over-length prompt / <9 shots) is disqualified regardless of score.
6. **Candidates** — round output carrying candidate sets ⇒ recorded in
   `loopReport.round_N.candidates[]` with scores + selection rationale;
   count capped at the skill-config `candidate_count` (3).
7. **Bare-answer rejection** — a structurally valid pack MISSING `loopReport`
   or `finalQc` (or `finalQc` not passing) ⇒ rejected as a contract
   violation (counts as a failed attempt; after bounds ⇒ structural-failure
   path, not silent acceptance).
8. **Deterministic preflight blockers** — one crafted fixture per blocker,
   each asserting exactly the expected id fires (table §5.7):
   `sequential_prompt_set_incomplete` (8 shots; also missing one video
   prompt), `prompt_too_long_for_image_provider` (image prompt over
   `min(4000, providerCap)` — include a case where a provider cap < 4000 is
   the binding limit), `prompt_too_long_for_video_provider` (video 2001
   chars), `video_global_block_missing`, `guardian_directive_missing`
   (childSubjectPolicy active + `depicts_minor` shot without guardian
   content), `assembly_demo_unverified` (assembly-staging prompt while
   `assembly_documented: false`), `price_claim_detected` (Thai pattern e.g.
   "ราคาถูกที่สุด"/"ลด 50%" AND a numeric "฿199" case),
   shot-over-10s, speech-estimate > duration (Thai ≈17 chars/s), mapping
   mismatch (contradictory `@ImageN` role claim vs manifest),
   `product_reference_model_conflict` (skill Phase A conflict signal).
   Clean fixture ⇒ zero blockers.
9. **Over-budget → optimizer** — image prompt over budget ⇒ optimizer effect
   invoked with `prompt_kind: "sequential_image"`; video over budget ⇒
   `"sequential_video"`; result revalidated (still-over-budget after bounded
   rewrites ⇒ hard blocker, never sliced). **Grep-guard**: read the runner
   source file from disk in the test and assert no `.slice(` /
   `compactImagePromptText(` call site targets a final prompt variable
   (pattern-based; pin allowed exceptions explicitly).
10. **Degraded fallback** — all bounded attempts fail structurally ⇒ result
    flagged degraded with 9 deterministic prompts derived from
    `buildShotFramePrompt` fixtures (via the exported SVC `...ForTest`
    helper), safety locks present in every prompt, audit effect received
    `sequential_prompt_degraded_fallback`, and NO throw (run continues).

Cross-cutting gates (assert once, keep green through later sections): tsc
(`npm --prefix apps/web run check`) introduces no NEW errors vs the ~987
baseline; WS-1 snapshot suite stays byte-identical (this section must not
touch any 3x3/start-stop code path).

## 5. Implementation guidance

### 5.1 Runner skeleton (clone `productReferenceStoryboardSkillRunner.ts:1998-2079`)

```ts
// apps/web/server/services/productReviewSequentialStoryboardSkillRunner.ts
export const PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID =
  "product-review-sequential-storyboard";

/** Effective image budget = min(overrideMaxChars ?? 4000, provider maxPromptLength). */
export function resolveSequentialImagePromptBudget(input: {
  overrideMaxChars?: number | null;   // sequentialImagePromptMaxChars (section-01, 1000–4000)
  providerMaxPromptLength?: number | null;
}): number;

/** One full Tier-1 orchestration: rounds + retention + preflight + optimizer.
 *  Called by section-05's orchestrator inside prompt_plan, BEFORE that stage
 *  completes. This module never reaches into the stage machine itself. */
export async function runProductReviewSequentialStoryboardSkillLoop(
  input: SequentialStoryboardSkillLoopInput,
  effects?: Partial<SequentialStoryboardLoopEffects>, // test seam; prod defaults built internally
): Promise<SequentialStoryboardSkillLoopResult>;
```

Steps per invocation (order is contractual):
1. `syncSingleSkillIfChanged(PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID)`
   → throw on `synced.error`.
2. `getSkillByIdAsync(id)` → throw "skill not found or not enabled" on null.
3. System prompt = `skill.systemPrompt ?? skill.skillContent` + runtime
   contract lines (§5.2). Category rule files are appended via the shared
   `appendProductReferenceStoryboardCategoryRules` (reuse — no duplication).
4. Input-schema audit (`buildSkillInputSchemaAudit` against the section-03
   `input.schema.json`) hard-fails BEFORE any provider or credit call
   (`:2054-2086` precedent — log + throw with blocker list).
5. `resolveSkillExecutionPolicy({skill})` → model; provider via the shipped
   marketplace pattern: `executeWithFallback` inside a `legacyExecute`
   closure with `strictProviderPin: policy.strictProviderPin`,
   `disableProviderFallbacks: true`, `allowFreeModels: policy.allowFreeModels`
   (SVC:11760-11775), wrapped by `executeSharedSkillTextRuntime` with
   `skillSlugs: [id]`, `entryPoint`/`originSurface` for marketplace capture,
   `runId`, and a `schemaHint` naming the sequential output schema.
6. Vision inputs: attach the product reference images (primary + angles,
   INCLUDING `evidenceOnly` package/parts_diagram entries — they are skill
   vision inputs even though they are never provider attachments; see
   section-02) as `referenceImages`. Required for Phase A visual verification
   and the image-over-text policy.
7. Credits: reuse the `calculateCreditsForLLMDynamic` + `deductCredits`
   pattern inside `legacyExecute` (SVC:11799-11836).

### 5.2 Runtime contract (appended to the skill body per invocation)

Deterministic, enumerable lines — every item testable by string containment:
image budget (effective, §5.1), video budget (2000), `shot_count: 9`,
`max_shot_duration_seconds: 10`, reference manifest entries (index → role →
angleLabel, evidence-only flags) from the section-02 resolver output, product
truth block, blocked claims (existing `claimEvidenceMapping.blockedClaims` ∪
`forbiddenClaims` override), `confirmedAttributes`, `childSubjectPolicy`
(computed in TS; the computation itself ships with section-05 — this runner
treats it as an input field and passes it through), `target_audience`,
`user_requirements`, resolved `audio_strategy`, platform `9:16`, the compiled
preset directive from `buildAutoReviewCreativePresetDirective`
(`autoReviewCreativePresets.ts:311`), `reviewTone` / `videoStructureMode`,
and `motionDirection` with the explicit DUAL-INJECTION instruction (spec
§14.6): the skill must fold it into the story plan AND into every submitted
video prompt's action/camera language (subject to round-2 feasibility
simplification). Rule text/judgment stays in the skill body — the contract
carries facts and budgets only.

### 5.3 Structured output parsing (lenient, weak-model tolerant)

Parse via the shared machinery: `executeJsonPlanningCallWithRetry`
(`verticalDramaStoryBible.ts:1353`) with the §19.2-shaped zod schema (built
in this module; keep enums lenient — accept unions/synonyms at parse, e.g.
`demonstration_type`, `claim_trace[].support`, and normalize downstream), or
`extractJson` + jsonrepair (`:970`) inside the runtime call when the retry
helper does not fit the `legacyExecute` seam. Classifier `:1268` decides
retryable vs terminal. Do NOT change the model to fix malformed JSON.

### 5.4 Skill config

Read `config.media_studio.marketplace_auto_review_sequential_storyboard`
from the skill frontmatter (section-03): `loop_rounds` (cap 3),
`candidate_count` (cap 3), `min_prompt_score_to_pass` (early-exit quality
bar; normalize round totals to 0–100 when comparing against it). Missing
config ⇒ safe defaults (3/3/88). Never let config raise the caps above 3.

### 5.5 Loop orchestration (TS, injectable effects)

Follow the `videoProjectQualityLoop.ts:59-66` DI shape — a pure orchestrator
whose side effects are injected (prod defaults wired in the same file):

```ts
export type SequentialStoryboardLoopEffects = {
  invokeSkillRound(args: {
    round: 1 | 2 | 3;
    roundContract: string;            // §16.1/16.2/16.3 focus + deterministic feedback
    retained: SequentialStoryboardPack | null;
  }): Promise<SequentialStoryboardRoundOutput>;
  persistRoundReport(round: number, report: LoopRoundReport): Promise<void>; // → metadataJson.sequentialStoryboard.loopReport.round_N
  loadPersistedLoopState(): Promise<PersistedLoopState | null>;              // mid-loop resume
  optimizeFinalPrompt(args: { prompt: string; promptKind: "sequential_image" | "sequential_video"; maxChars: number }): Promise<{ prompt: string; audit: Record<string, unknown> | null }>;
  emitAudit(event: string, payload: Record<string, unknown>): Promise<void> | void;
};
```

Mechanics (spec §16.4):
- Up to 3 rounds inside `prompt_plan`; each round = ONE skill invocation
  carrying the prior retained output + that round's review contract
  (round 1 evidence/category §16.1, round 2 narrative/continuity/feasibility
  §16.2, round 3 compliance/provider-readiness/compression §16.3). What each
  round evaluates/rewrites is defined by skill body Phases H–J — the runner
  only frames the round and appends deterministic feedback (preflight
  blockers from the previous round's pack, mapping mismatches, over-budget
  facts), mirroring the feedback-reinjection shape of SVC:9617-9697.
- Round output + the 8 dimension scores are persisted via
  `persistRoundReport` BEFORE the next round starts. On entry the runner
  calls `loadPersistedLoopState` and resumes at the first unrecorded round
  (restart-safe; rounds already paid for are never re-run). Section-05 owns
  the concrete metadata read/write wiring; ship prod default effects here
  that accept the run-metadata accessors as constructor args so section-05/06
  can bind them.
- Early exit: stop when the retained version passes all deterministic checks
  and its normalized total ≥ `min_prompt_score_to_pass`.

### 5.6 Scores, best-version retention, candidates

- Score dimensions (0–10 each, skill judgment; TS records + compares totals
  ONLY): `evidence_accuracy`, `product_consistency`, `narrative_quality`,
  `dialogue_continuity`, `visual_feasibility`, `compliance_safety`,
  `prompt_completeness`, `length_compliance`.
- Best-version retention: keep the highest-total VALID version. A later round
  never replaces the retained one when its total is lower OR it trips a
  deterministic disqualifier (all TS-checkable): <9 shots, missing either
  prompt, missing global-block marker, any over-length prompt, a
  `claim_trace[].support` value outside the allowed confidence levels /
  whitelist, broken machine-checkable continuity (e.g. shot ids not 1..9
  contiguous). Record disqualification reasons in the round report.
- Candidates: within a round the skill may return up to `candidate_count`
  candidate sets; persist counts, per-candidate scores, and the skill's
  selection rationale in `loopReport.round_N.candidates[]` (auditable
  selection, spec §9.7/§16.4). Truncate extra candidates (record that fact),
  never invoke extra generations for them.

### 5.7 Deterministic preflight (TS backstop, after the final round — and as per-round feedback)

Pure exported function, fixture-testable without any mock:

```ts
export function validateSequentialStoryboardPackPreflight(input: {
  pack: SequentialStoryboardPack;
  imageBudget: number;                 // resolveSequentialImagePromptBudget(...)
  manifest: ReferenceIndexEntry[];     // section-02
  childSubjectPolicy: ChildSubjectPolicyInput;
  assemblyDocumented: boolean;         // pack.evidenceProfile.assembly_documented
}): { blockers: string[]; warnings: string[]; perShot: Record<number, string[]> };
```

| Blocker id | Fires when | Status |
|---|---|---|
| `sequential_prompt_set_incomplete` | <9 shots, or any shot missing `start_frame_image_prompt` or `video_prompt` | NEW (spec §23.1-3) |
| `prompt_empty` | any final prompt empty after cleaning | existing id, reuse (SVC:8645) |
| `prompt_too_long_for_image_provider` | image prompt > effective budget | existing id, reuse (SVC:8647) |
| `prompt_too_long_for_video_provider` | video prompt > `MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS` (2000) | NEW, follows existing naming |
| `video_global_block_missing` | mandatory §14.2 global-block marker absent from a video prompt (marker-based check; the marker string is authored by the skill body per section-03 — pin ONE stable marker substring shared by skill template and this check) | NEW (spec §23.1-6) |
| `guardian_directive_missing` | `childSubjectPolicy` active AND a `depicts_minor`/`guardian_required` shot's prompts lack guardian content (marker/pattern on skill-authored prompts; independent of section-07's shared builders) | NEW (spec §23.1-7) |
| `assembly_demo_unverified` | a prompt/dialogue stages assembly, disassembly, or internal components while `assembly_documented` is false | NEW (spec §23.1-15) |
| `price_claim_detected` | Thai + numeric price patterns (ราคา/บาท/฿/ลด %/โปร/ส่งฟรี families) in dialogue or either prompt — detection deterministic, rewrite is always the skill's job (spec §12.5) | NEW (spec §23.1-8) |
| `shot_duration_exceeds_max` | `duration_seconds` > 10 (or < 3) | NEW (spec §23.1-9) |
| `dialogue_exceeds_shot_duration` | Thai speech estimate > `duration_seconds`; estimator = facts-only Thai ≈17 chars/s heuristic cloned from `dialogueQuality.ts:91,113` (do not import VD internals — copy the tiny estimator with attribution comment) | NEW (spec §12.3) |
| `reference_index_mapping_mismatch` | `findReferenceIndexMappingMismatches(prompt, manifest)` non-empty for any prompt (section-02 validator) | NEW; enforcement = ONE corrective retry through the skill, then THROW — never persist a contradictory prompt (VD precedent) |
| `product_reference_model_conflict` | `pack.evidenceProfile.product_reference_model_conflict` is non-null (Phase A found the attached references depict DIFFERENT product models), unresolved by role assignment/confirmation — hard fail until the user resolves (spec §23.1-12). The field is REQUIRED-nullable in section 03's output schema; an ABSENT key is itself a schema violation (`sequential_prompt_set_incomplete`), because silence must never be read as "checked and clean" | NEW |
| `minor_safety_clothing_lock_missing` | minor-safety lock required but absent (reuse the SVC:8650-8655 check family) | existing id, reuse |

Keep ids stable and snake_case; they surface verbatim in section-08's edit
rejection and section-11's per-shot error UI. Warnings (never block) follow
spec §23.2.

### 5.8 Over-budget prompts → optimizer skill (no mechanical truncation)

- Gate exactly like SVC:1549: only when the FINAL prompt exceeds its budget.
- Invoke `product-reference-storyboard-prompt-optimizer` through the extended
  `optimizeProductReferenceStoryboardPrompt` with
  `prompt_kind: "sequential_image" | "sequential_video"` and
  `maxOutputChars` = the relevant budget; the optimizer prompt must preserve
  the §13.1/§14.1 mandatory sets (that instruction lives in the optimizer
  skill; this section only threads the flag).
- Audit reasons: `final_image_prompt_over_provider_budget` (existing string)
  / `final_video_prompt_over_provider_budget` (new).
- Revalidate (§5.7) after every rewrite; bounded attempts (reuse the
  `MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS = 3` shape);
  still over ⇒ hard failure blocker per spec §23.1-4/5. NEVER `slice()` a
  final prompt; `compactImagePromptText` stays sub-block-only.

### 5.9 Contract rejection (bare answers)

A returned pack missing `loopReport` evidence or a passing `finalQc` is a
contract violation (spec §9.7): treat as a failed attempt with corrective
feedback ("return loop evidence"), retry within bounds, and count toward the
structural-failure budget. The runner NEVER forwards an unverified pack.

### 5.10 Degraded deterministic fallback (fail-open at run level)

When structural failure survives the bounded attempts (malformed JSON every
round, contract rejection every round, terminal runtime error): do NOT kill
the run. The SVC-side helper (this section) builds a degraded pack — 9
per-shot prompts from the deterministic `AutoReviewPlan` via
`buildShotFramePrompt(plan, shot, "start", overlayTextMode)` (SVC:15353,
module-private → helper lives in SVC beside the grid fallback :9501-9528)
plus product-lock, guardian, and layout-lock lines and every safety lock.
Degraded packs skip claims/dialogue enrichment; money-path and safety
validators stay fail-closed. Emit audit warning
`sequential_prompt_degraded_fallback` (mirror of
`storyboard_prompt_degraded_fallback`, advisory mode — decorate warnings,
never throw). The runner signals this with a typed error
(`SequentialStoryboardStructuralError` carrying `retryHistory`) that the SVC
integration catches; export the fallback assembly as a `...ForTest` helper.

### 5.11 Voiceover

The unconditional concept_story voiceover rewrite hook (SVC:17993-18005) is
reused UNTOUCHED. Do not call it from the runner and do not add a
sequential-specific audio pass.

## 6. Interfaces exposed to later sections (do not rename without updating them)

- `runProductReviewSequentialStoryboardSkillLoop(input, effects?)` →
  `{ pack, loopReport, selectedVersion, degraded: boolean, preflight, retryHistory }`
  — section-05 calls it inside `prompt_plan` and persists `pack` +
  `loopReport` at `metadataJson.sequentialStoryboard.*` (§19.2 shape).
- `validateSequentialStoryboardPackPreflight(...)` — reused by section-08
  (edited-prompt revalidation, blocker-id rejection) and section-06 (submit
  gate).
- `resolveSequentialImagePromptBudget(...)` — section-06 (submit),
  section-08, section-11 (char counters).
- `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS` (SVC) and
  `PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID` (runner).
- Blocker-id strings of §5.7 (stable contract for sections 06/08/11/12).
- **Named exports other sections import (cross-section decision, review round 1) — these MUST be exported from this module, never re-typed elsewhere:**
  - `SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER` — the single frozen literal
    `"Use @Image1 as the absolute product identity reference"` (authored in
    section 03's skill body, §10 marker table). Consumed by section 09's video
    preflight and section 12's gate evaluator. One constant = the skill body
    and every checker drift together or not at all.
  - `detectSequentialPromptPriceClaims(text)` — the deterministic Thai+numeric
    price backstop used by §5.7. Section 09 imports the SAME function for the
    video preflight; a re-implementation would let a price token pass one
    surface and fail the other.
  - `resolveSequentialImagePromptBudget` (already listed above) and the
    optimizer `prompt_kind` union `"sequential_image" | "sequential_video"` —
    section 09 passes `"sequential_video"` through the same extended optimizer
    entry point.
  - `refreshSequentialShotPromptWithSkill` is ADDED to this module by section
    08 (single-shot refresh, no loop). Keep the full-loop code paths and the
    single-shot path sharing one runtime-contract builder.
- Audit event names `sequential_prompt_degraded_fallback` and the per-round
  event payloads feed section-12's recorder (`sequential_skill_plan_round`).

## 7. Invariants and guardrails

1. **Flags-off isolation**: this module is dead code unless a run's
   `frameStrategy` is `sequential_shot_storyboard` (FORBIDDEN-gated at start
   by section-01). No edit here may alter any 3x3/start-stop code path — the
   WS-1 snapshot suite is the tripwire and must stay byte-identical.
2. **Skill-first**: no creative thresholds, narrative rules, or wording
   judgments in TS. TS = budgets, counts, markers, regex backstops, ordering.
3. **No model switching** to fix weak-model JSON (cost policy).
4. **No mechanical truncation** of final prompts, ever (grep-guard test).
5. **Spend safety**: input-schema audit precedes any provider/credit call;
   per-round persistence precedes the next round's spend; resume never
   re-runs a persisted round.
6. **Fail-closed where it matters**: mapping mismatch after corrective retry
   throws; safety/money validators stay hard even in degraded mode.
7. Additive-only edits to SVC; keep the diff small (27k-line file, concurrent
   sessions — verify via isolated copies per repo memory).

## 8. Verification

1. New test file green:
   `npm --prefix apps/web run test -- server/services/__tests__/productReviewSequentialStoryboardSkillRunner.test.ts`
   (from `apps/web`; adjust invocation to match neighboring suites).
2. WS-1 snapshot suite still byte-identical; existing
   `marketplaceAutoReviewService.test.ts` and
   `productReferenceStoryboard*` suites unaffected.
3. `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
   — no NEW errors vs the ~987-error baseline.
4. Grep-guard passes: no `.slice(`/`compactImagePromptText(` against final
   prompts in the new runner module.
5. Optimizer extension is backward-compatible: existing 3x3 optimizer calls
   produce identical inputs when `prompt_kind` is absent.