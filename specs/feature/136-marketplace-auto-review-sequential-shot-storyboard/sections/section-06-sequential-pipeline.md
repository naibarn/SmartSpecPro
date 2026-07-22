# Section 06 — Sequential Unit Pipeline (9 image units, per-unit QA/repair, storyboard-review handoff)

- **Section id:** `section-06-sequential-pipeline`
- **Feature:** 136 — Marketplace Auto Review: Sequential Shot Storyboard
- **Sources:** `../claude-plan.md` WS-6, `../claude-plan-tdd.md` WS-6, `../spec.md` v1.3.0 §18 (authoritative), §19.2 (read surface), §25 (metrics ingredients only)
- **Depends on:** `section-01-flags-and-schemas` (strategy enum member + flag gating already merged), `section-02-reference-layer` (`approvedSequentialProductReferenceUrls` resolver, per-shot manifest, `referenceIndexMap.ts` validator), `section-04-skill-runner-loop` (produces the validated 9-shot pack), `section-05-evidence-plan-surface` (pack persisted at `metadataJson.sequentialStoryboard.*`)
- **Blocks:** `section-07-evidence-guard-shared`, `section-08-per-shot-regen`, `section-09-full-video`, `section-12-observability-gate`
- **Milestone:** M2 — sequential pipeline, internal tenant only
- **Test command:** `npm --prefix apps/web run test -- <files>` (Vitest, run for `apps/web`)

---

## 1. Objective

Make the `image_generation` and `storyboard_review` stages work end-to-end for `frameStrategy === "sequential_shot_storyboard"`:

1. `buildInitialImageUnits` returns **9 independent units** (`sequential-shot-01` … `sequential-shot-09`, role `sequential_shot_frame`).
2. The unit prompt dispatcher returns the **skill-authored** start-frame prompt for each shot (with `shotOverrides` precedence and targeted-repair concat).
3. Submission reuses the existing direct-media submit path with **multi-angle** `referenceImageUrls` + the section-02 manifest, `aspectRatio "9:16"`, `numImages 1`, and submit-time reference-index re-validation.
4. Per-unit vision QA flows through the **per-frame** QA path (grid QA never invoked); repair budget is per unit; optional `qualityMode` best-of-2 for units 1–2.
5. Stage gate: all 9 units pass, or accepted-with-warnings **only when zero publish-blocking codes** are present.
6. Handoff calls `createStoryboardReview` with the 9 unit URLs directly (`splitStoryboardGrid` skipped) and enriches clip metadata.
7. Per-unit resume after restart without resubmitting completed units.
8. Phase-2 metrics **ingredients** recorded (mode tag + per-unit outcomes) so section-12's recorder can aggregate a 3x3-vs-sequential baseline.

Everything in this section forks on `frameStrategy === "sequential_shot_storyboard"` inside existing functions. With both feature flags off no run can carry this strategy (section-01 gating), so the WS-1 snapshot suite must remain byte-identical — it is the regression tripwire for every edit here.

---

## 2. Background — how the engine works today

All work happens in `apps/web/server/services/marketplaceAutoReviewService.ts` ("SVC", ~27k lines). The run machine (Feature 118) advances stages `product_preflight → production_project → concept_story → prompt_plan → image_generation → storyboard_review`, persists all state in `marketplace_auto_review_runs.metadataJson` (JSONB), and resumes after restarts. No new stage keys, tables, or migrations.

Anchors verified 2026-07-21 (line numbers WILL drift — this file is edited by concurrent sessions; **always locate by symbol name, treat lines as hints**):

| Symbol | Observed line | Role in this section |
|---|---|---|
| `MarketplaceAutoReviewFrameStrategy` union | SVC:123-125 | Gains `"sequential_shot_storyboard"` in section-01 |
| `DirectImageUnit` type (role union) | SVC:2110-2117 | Add role `"sequential_shot_frame"`; `DirectImageFrameRole` (SVC:2137) picks it up automatically via `Exclude<…, "storyboard_grid">` |
| `buildInitialImageUnits(plan, frameStrategy)` | SVC:8455-8476 | 3x3 → 1 grid unit; ELSE branch currently emits start/stop pairs. Sequential branch must be checked explicitly BEFORE the start/stop fallback |
| `buildImagePromptForUnit(plan, unit, overlayTextMode)` | SVC:8588-8624 | Unit prompt dispatcher; routes by `unit.role`; start/stop branch appends `\nTargeted repair: …` |
| `prepareMarketplaceAutoReviewImagePrompt` | SVC:9123-9150 | Wraps dispatcher + `validateMarketplaceAutoReviewImagePromptPreflight` (SVC:8633); test export `prepareMarketplaceAutoReviewImagePromptForTest` SVC:9974 |
| `scheduleImageAttempt` | SVC:18225 | Resolves references via `productReferenceStoryboardReferenceImageGroups(metadata, plan, 5)` (single product anchor — SVC:18258-18272), submits via `mediaGenerationService.generateImageAsync` (payload SVC:18584-18626: `aspectRatio "9:16"`, `resolution "2K"`, `numImages 1`, `referenceImageUrls`, `extraParams.referenceImageManifest/…RoleOrder/…RoleCounts`, per-unit `traceId`) |
| `nextDirectAttempt(refs, unitId)` / `DirectMediaTaskRef` | SVC:7735 / SVC:943-982 | Per-unit attempt counting; restart-safe resume via `latestTaskRefsByUnit` |
| `maxImageProviderSubmissionsForFrameStrategy` | SVC:8491-8498 | Already returns `POSITIVE_INFINITY` for non-3x3 — **no change**; per-unit budget governs |
| `effectiveQualityModePolicy(metadata)` | SVC:2578-2592 | `{maxRepairAttemptsPerUnit, visionQaModel}`; quality modes `fast_draft` / `balanced` / `premium_strict_qa` |
| QA dispatch loop | SVC:19597-19700 | `isStoryboardGridSplit` gates grid QA (`runStoryboardGridLayoutVisionQa` SVC:18937 — sequential must never reach it); per-shot loop selects `frameCandidates` by strategy (`usesStartStopFrames` ternary SVC:19635-19657) and calls `runShotFrameVisionQa` (SVC:19287); non-grid repair units built by `buildShotFrameRepairUnits` (SVC:19678-19685) |
| `imageUrlsFromDirectRefs` | SVC:18846-18879 | Maps completed refs → `metadata.storyboardFrameUrls[shotOrder-1]` by role; currently only `storyboard_frame` / `start_frame` / `stop_frame` |
| Grid-split site in reconcile | SVC:20059-20084 | Runs ONLY when `frameStrategy === "storyboard_3x3_split"` — sequential skips naturally |
| Accept-with-warnings flow | SVC:20190-20310 | `repairBudgetExhausted && storyboardFramesReady && minimumImageAttemptsReached && storyboardReviewHandoffAllowed`; hard block `publish_safety_hard_blocker_after_repair_budget_exhausted` when `imageReasonCodeBlocksPublishSafety` (SVC:1650 region) codes remain |
| `MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW = 3` | SVC:653, gate at SVC:20209-20211 | **Grid-specific candidate rule** (spec §18.2). `appendImageAttemptReview` (SVC:7225) writes ONE review per attempt wave, so a sequential run reaches count 1 — the gate must become strategy-aware (see 5.8) |
| `createStoryboardReview` | function SVC:21979; call sites SVC:17402 (manual select) and SVC:26318 (stage path) | NOTE: the plan's `:17402` anchor is a CALL SITE, not the function. Handoff reads `metadata.storyboardFrameUrls` via `buildStoryboardReviewOutput` (SVC:21692) → clips/tasks (`buildMarketplaceAutoReviewStoryboardReviewTasks`, SVC:22022) |
| `splitStoryboardGrid` | SVC:21243 | Must NOT be called for sequential (also guarded at SVC:17266-17278 by `storyboardGridUrl` presence, which sequential never sets) |
| `buildImageAttemptScoreBreakdown` / `applyBestImageAttemptSelection` | SVC:6885 / SVC:7085 | Score breakdown is reusable; `applyBestImageAttemptSelection` is **grid-specific — do NOT call it** for sequential |
| Repair directive machinery | SVC:1443 (`MARKETPLACE_AUTO_REVIEW_REPAIR_REASON_CODE_DIRECTIVES`), SVC:1479/1508 | Reused as-is for targeted repair concat |

Input data (written by sections 04/05, read here):

- `metadataJson.sequentialStoryboard.shots[i]` — per spec §19.2: `shot_id` (1-based, aligned with `plan.shots[i].order`), `start_frame_image_prompt`, `video_prompt`, `dialogue`, `visual_summary`, `transition_from_previous`, `demonstration_type`, `depicts_minor`, `guardian_required`, `claim_trace`, `qc`.
- `metadataJson.sequentialStoryboard.shotOverrides[shotId]` — string-keyed (`"3"`), fields `dialogue` / `start_frame_image_prompt` / `video_prompt` / `editedAt`. Written by section-08's editor, but precedence must be honored here from day one.
- `metadataJson.sequentialStoryboard.referenceManifest` — section-02's variable-length manifest `{index, role, angleLabel?, url, evidenceOnly?}`.

---

## 3. Scope boundaries

**In scope:** the eight items in §1, all inside SVC plus one new test file.

**Out of scope (do not implement here):**

- Guardian/assembly QA JSON fields (`adultGuardianPresent`, `framesMissingGuardian`, `assemblyContentDetected`), the fail-closed normalizer rule, publish-block set addition, and repair directives — **section-07**. This section only reuses the existing per-frame QA fields (`productMatchesReference`, `continuityMatchesShot`) and existing reason codes (`product_reference_mismatch`, `storyboard_continuity_mismatch`) plus existing minor-safety publish-block codes.
- `regenerateAutoReviewSequentialShot` mutation and edit preflight — **section-08** (this section must leave the single-unit machinery reusable for it).
- Video stages — **section-09**.
- Named audit event schemas and the per-mode metrics recorder/aggregator — **section-12**. This section only lands the raw ingredients (see 5.10).
- The multi-angle resolver, capacity assertions, and `findReferenceIndexMappingMismatches` themselves — **section-02** (consumed here).
- Skill invocation / loop / deterministic preflight of the pack — **section-04** owns the runner module, **section-05 owns the `prompt_plan` call site** that invokes it and persists the result (cross-consistency review round 1). This section starts at `image_generation` and trusts the persisted pack; a missing prompt at dispatch time is state corruption and fails loud.

---

## 4. Tests first (write these before touching SVC)

New file: `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialPipeline.test.ts`

Conventions: Vitest; service tests exercise exported `…ForTest` helpers (existing pattern throughout SVC — see SVC:9878-10830 exports); no DB — pure fixtures. Deep async paths (submit payload, reconcile gate) are tested either through small new `…ForTest` extractions (preferred, matches repo convention) or `vi.mock` capture of `mediaGenerationService.generateImageAsync`.

Shared fixtures (module-local helpers in the test file — stubs, implementer fills in):

```ts
/** AutoReviewPlan with exactly 9 shots (order 1..9, stable ids). */
function buildSequentialPlanFixture(): AutoReviewPlan;

/** RunMetadata with a complete spec-§19.2 sequentialStoryboard pack:
 *  9 shots with distinct start_frame_image_prompt values, shotOverrides
 *  empty by default, referenceManifest with primary + 3 angles
 *  (one evidenceOnly parts_diagram entry), frameStrategy metadata. */
function buildSequentialMetadataFixture(overrides?: Partial<RunMetadata>): RunMetadata;

/** DirectMediaTaskRef fixtures: completed / pending / failed per unit. */
function buildDirectImageTaskRefFixture(unitId: string, overrides?: Partial<DirectMediaTaskRef>): DirectMediaTaskRef;
```

### T1 — unit construction

- `buildMarketplaceAutoReviewInitialImageUnitsForTest(plan, "sequential_shot_storyboard")` returns exactly 9 units, `unitId` `"sequential-shot-01"` … `"sequential-shot-09"` (zero-padded, ascending by `shot.order`), `role === "sequential_shot_frame"`, each carrying `shotId`/`shotOrder` matching the plan shot.
- `"storyboard_3x3_split"` still returns `[{unitId: "storyboard-grid-image", role: "storyboard_grid"}]` and `"video_shot_start_stop"` still returns 18 start/stop units — byte-identical behavior (also covered by the WS-1 snapshot suite).

### T2 — prompt dispatch and overrides

Via `prepareMarketplaceAutoReviewImagePromptForTest` (extended input, see 5.3):

- Sequential unit N returns exactly `sequentialStoryboard.shots[N-1].start_frame_image_prompt` (no deterministic re-wrapping, no text-policy blocks appended).
- When `shotOverrides["3"].start_frame_image_prompt` is set, unit 3 uses the override; other units unaffected.
- A unit with `repairInstruction`/`repairReasonCodes` gets the targeted-repair tail appended via the existing appender (assert the `Targeted repair:`/directive marker appears exactly once — idempotent, `ensureTargetedRepairDirectiveInImagePromptForTest` precedent).
- Missing prompt (empty pack entry, no override) → throws (fail-loud; message names the unit).

### T3 — submission payload

- Sequential submit resolves `referenceImageUrls` through the section-02 resolver (primary + angles order, evidence-only entries excluded) and passes the manifest via `extraParams.referenceImageManifest` (+ `referenceImageRoleOrder`, `referenceImageRoleCounts` derived from it); `aspectRatio "9:16"`, `numImages 1`.
- Submit-time mapping re-validation: a persisted prompt containing a contradictory explicit `@ImageN` role claim vs the live manifest → submission throws (fail-closed) and no provider call happens (`generateImageAsync` mock not invoked).
- 3x3 submit path untouched: grid strategy still resolves via `productReferenceStoryboardReferenceImageGroups(…, 5)`.

### T4 — per-unit attempts and resume

- `nextDirectAttempt` with `directImageTasks` fixtures counts per `unitId` (unit 05's failure does not raise unit 06's attempt number).
- Restart resume: with units 01–04 `completed` and 05–09 absent/pending, the scheduling pass submits only 05–09; completed refs untouched (assert by ref identity / attempt counters).

### T5 — result-URL mapping

- `imageUrlsFromDirectRefs` (new `…ForTest` export) maps a completed `sequential_shot_frame` ref with `shotOrder: k` to `storyboardFrameUrls[k-1]`; grid strategy behavior unchanged.

### T6 — QA routing

- For a sequential run, the QA loop builds frame candidates `{role: "sequential_shot_frame", url: metadata.storyboardFrameUrls[index]}` and calls `runShotFrameVisionQa` per shot; `runStoryboardGridLayoutVisionQa` is NOT invoked (spy/assert via mock or `…ForTest` seam).
- The per-frame QA prompt for sequential contains the sequential continuity criteria (references the shot's `visual_summary` / `transition_from_previous`) and the multi-angle fidelity criterion ("must match every attached product reference angle"); for 3x3/start-stop runs those lines are absent (diff against baseline prompt text).
- Failing QA reuses existing codes: fixture verdict with `continuityMatchesShot: false` folds to `storyboard_continuity_mismatch`; `productMatchesReference: false` folds to `product_reference_mismatch` (via `normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest`).

### T7 — repair budget and best-of-2

- Repair units for a failing sequential shot come from `buildShotFrameRepairUnits` with `expectedFrameRoles: ["sequential_shot_frame"]`; per-unit budget = `effectiveQualityModePolicy(metadata).maxRepairAttemptsPerUnit` (use `effectiveQualityModePolicyForTest`).
- `qualityMode: "premium_strict_qa"` (the "high" tier): units 01 and 02 schedule a second attempt, both scored via `buildImageAttemptScoreBreakdown`, winner recorded on the unit and its URL lands in `storyboardFrameUrls[index]`; `applyBestImageAttemptSelection` is NOT called (spy); units 03–09 stay single-attempt. Balanced/fast modes: single attempt everywhere.

### T8 — stage gate

- All 9 units pass → image_generation completes and the run advances toward `storyboard_review`.
- One unit carrying a publish-blocking code (use an existing minor-safety code, e.g. `minor_safety_child_clothing_unverified`) after repair-budget exhaustion → stage hard-blocks (`publish_safety_hard_blocker_after_repair_budget_exhausted` path); accept-with-warnings refuses it.
- Warnings-only codes after budget exhaustion → accepted-with-warnings and handoff proceeds.
- Strategy-aware minimum-attempts: the grid-only `MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW` gate does not block a sequential run whose per-unit budgets are exhausted (extend `hasMarketplaceAutoReviewMinimumImageAttemptsForTest` with the strategy input; assert grid behavior unchanged).

### T9 — handoff

- `createStoryboardReview` receives 9 frame URLs in shot order (via `buildStoryboardReviewOutput` on a metadata fixture with `storyboardFrameUrls` filled); `splitStoryboardGrid` NOT called (no `storyboardGridUrl` ever set for sequential — assert absent).
- Clip/task metadata carries `frameStrategy: "sequential_shot_storyboard"`, per-shot `depicts_minor`, `guardianRequired`, `demonstration_type`, and a claim-trace summary sourced from `sequentialStoryboard.shots[i]`.

### T10 — metrics ingredients (Phase-2 hooks)

- `imageAttemptReviews[]` entries produced for a sequential run carry `frameStrategy` and a per-unit outcome summary (unitId, verdict, reasonCodes, repair count, qualityScore) sufficient for section-12's recorder; grid entries gain the same `frameStrategy` tag without any other shape change.

### Tripwire

- Re-run the WS-1 snapshot suite (`marketplaceAutoReview.snapshots.test.ts`) after every SVC edit in this section — byte-identical output required for 3x3 and start_stop with both flags off.

---

## 5. Implementation guidance

All edits in `apps/web/server/services/marketplaceAutoReviewService.ts` unless noted. Keep every fork an explicit `frameStrategy === "sequential_shot_storyboard"` equality check; never invert existing conditions (snapshot safety).

### 5.1 Role/type extension

- Extend `DirectImageUnit["role"]` (SVC:2110-2117) with `"sequential_shot_frame"`. `DirectImageFrameRole` (SVC:2137) inherits it automatically.

### 5.2 `buildInitialImageUnits` fork (SVC:8455)

Insert a sequential branch BEFORE the start/stop fallback:

```ts
if (frameStrategy === "sequential_shot_storyboard") {
  // 9 units from plan.shots, ascending by order:
  // { unitId: `sequential-shot-${String(shot.order).padStart(2, "0")}`,
  //   role: "sequential_shot_frame", shotId: shot.id, shotOrder: shot.order }
}
```

`shotForUnit` (SVC:8527) then resolves shots without change. Add test export `buildMarketplaceAutoReviewInitialImageUnitsForTest`.

**This section OWNS the unit-id scheme (cross-section decision, review round 1).** The id must come from ONE builder, not an inline template literal: make `directImageUnitIdForFrameRole` (SVC:10040 region) sequential-aware so it emits `sequential-shot-0N` for `role: "sequential_shot_frame"`, and have `buildInitialImageUnits` call it. Section 08's per-shot regeneration re-derives the unit id for a single shot and depends on this single source — a second inline scheme would silently break per-unit attempt counting (`nextDirectAttempt` keys on `unitId`) and let a regeneration resubmit the wrong unit. Add a test asserting the builder and `buildInitialImageUnits` agree for all 9 shots.

### 5.3 Prompt dispatcher branch (SVC:8588) + metadata threading

- The sequential prompt lives in run metadata, not the plan, so thread `metadata?: RunMetadata` (optional, additive) through `buildImagePromptForUnit` and its wrapper `prepareMarketplaceAutoReviewImagePrompt` (SVC:9123). Update call sites (observed SVC:9131, :9456, :9556 and the submit-side prepare at `prepareMarketplaceAutoReviewImagePromptForSubmit` SVC:18408 region) to pass metadata where available; absent metadata + sequential unit → throw.
- Branch behavior for `unit.role === "sequential_shot_frame"`:
  1. Resolve shot number from `unit.shotOrder`; select prompt = `shotOverrides[String(shotNumber)]?.start_frame_image_prompt` (trimmed, non-empty) else `sequentialStoryboard.shots[shotNumber-1].start_frame_image_prompt`.
  2. Neither present → throw `Missing sequential shot prompt for unit <unitId>` (prompt_plan guarantees the pack; fail loud, run stays resumable).
  3. Append targeted repair exactly like the start/stop branch (SVC:8615-8623) using the existing builder/appender (SVC:1479/1508) — idempotent.
  4. Do NOT wrap with deterministic text-policy/reference sections — the skill-authored prompt is self-contained (skill-first rule); safety locks were already baked in by section-04's preflight, and `validateMarketplaceAutoReviewImagePromptPreflight` still runs on the result.
- Preflight: ensure `validateMarketplaceAutoReviewImagePromptPreflight` (SVC:8633) treats the new role — length checked against the effective sequential budget from section-04 (`min(sequentialImagePromptMaxChars, provider maxPromptLength)`, constant `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS = 4000`), not the 3x3 constant. Reuse existing blocker ids (`prompt_empty`, `prompt_too_long_for_image_provider`).

### 5.4 Submission fork inside `scheduleImageAttempt` (SVC:18225)

- When the run is sequential, replace the reference resolution block (SVC:18258-18272) with the section-02 resolver:
  - `referenceImageUrls` = `approvedSequentialProductReferenceUrls(metadata, plan, getSequentialReferenceImageModelCap(imageModel))` — ordering/dedupe/reservation/trim and capacity fail-closed all live in section-02; this section only calls it. (Note: `getReferenceImageLimitForModel` in `mediaGenerationService.ts` is module-private; section-02 exports the SVC-local cap helper.)
  - `extraParams.referenceImageManifest` = the persisted `sequentialStoryboard.referenceManifest` (evidence-only entries excluded from `referenceImageUrls` but the manifest passed intact per section-02's contract); derive `referenceImageRoleOrder`/`referenceImageRoleCounts` from it exactly as today (SVC:18607-18615).
- Submit-time mapping re-validation (VD pattern, spec §8.5): before `generateImageAsync`, run `findReferenceIndexMappingMismatches(prompt, manifestEntries)` from `apps/web/shared/marketplaceCapture/referenceIndexMap.ts`; any mismatch → throw (never silently rewrite; no provider call, no credit intent finalization).
- Everything else in the payload stays identical (`aspectRatio "9:16"`, `resolution "2K"`, `numImages 1`, `__unit_id`/`__unit_role`/`__repair_attempt`, per-unit `traceId` — SVC:18584-18626). Grid and start/stop submits must remain byte-identical.

### 5.5 Per-unit attempts and resume (mostly reuse)

- `nextDirectAttempt` (SVC:7735), `latestTaskRefsByUnit`, `DirectMediaTaskRef` records, and `maxImageProviderSubmissionsForFrameStrategy` (already `POSITIVE_INFINITY` for non-3x3, SVC:8491-8498) need **no changes** — write the T4 tests to lock the behavior for the new unit ids.
- `imageRepairUnitsForFrameStrategy` (SVC:8478) already passes all repair units through for non-grid — no change.

### 5.6 Result-URL mapping (SVC:18846)

- In `imageUrlsFromDirectRefs`, map `ref.role === "sequential_shot_frame"` into `storyboardFrameUrls[shotOrder-1]` (same override-allowed branch as `storyboard_frame`, SVC:18867-18868). Add `…ForTest` export.
- The grid-split block in reconcile (SVC:20059-20084) is already strategy-gated — sequential skips it with no edit; never set `metadata.storyboardGridUrl` for sequential.

### 5.7 QA fork (SVC:19597-19700 and `runShotFrameVisionQa` SVC:19287)

- In the per-shot QA loop, extend the strategy ternary (SVC:19635-19657): sequential → `expectedFrameRoles = ["sequential_shot_frame"]`, `frameCandidates = [{role: "sequential_shot_frame", url: metadata.storyboardFrameUrls[index]}]`. Grid QA remains gated on `isStoryboardGridSplit` — sequential never reaches it.
- Extend the QA prompt assembly in `runShotFrameVisionQa` (Thai prose lines near SVC:19358-19379) with sequential-conditional criteria, reading the shot contract from `metadata.sequentialStoryboard.shots[index]`:
  - Story continuity vs the sequential shot contract (`visual_summary`, `transition_from_previous`, dialogue beat) — failure folds to the existing `storyboard_continuity_mismatch` via `continuityMatchesShot`.
  - Multi-angle product fidelity — the depicted product must match EVERY attached product reference angle; any-angle mismatch folds to the existing `product_reference_mismatch` via `productMatchesReference`.
- **No new JSON schema fields or normalizer codes in this section** — the schema-string additions (`adultGuardianPresent`, `assemblyContentDetected`, …) and the fail-closed guardian rule are section-07. Keep the insertion points clean so section-07's additions are one-line list extensions.
- Repair units flow through `buildShotFrameRepairUnits` (SVC:19678-19685) unchanged apart from the new role value.

### 5.8 Stage gate (SVC:20190-20310)

- Publish-block enforcement already exists: `imageReasonCodeBlocksPublishSafety` codes force the hard-block path after budget exhaustion (SVC:20299-20307). Sequential inherits it; T8 locks it. (Section-07 later adds `guardian_presence_missing` to the set — no work here.)
- **Partial-failure credit semantics are inherited, not re-implemented.** When the stage hard-blocks at unit 7 of 9, the 6 completed image tasks stay charged and the failed/abandoned ones follow the shipped per-task reserve → reconcile → refund path in `mediaGenerationService` (spec §22: "actual generation spend is unchanged mechanically"). Do NOT add sequential-specific refund logic, and do NOT batch-reserve for all 9 units up front — per-unit reservation is what makes a partial failure cost only what it generated. Add one test asserting a mid-stage hard block leaves completed units' credit refs untouched.
- **Required change:** `minimumImageAttemptsReached` (SVC:20209-20211) implements the grid-specific ≥3-candidates rule (spec §18.2 explicitly scopes it to grid mode; `appendImageAttemptReview` writes one review per attempt wave, so a sequential run would deadlock at count 1). Make it strategy-aware:

```ts
const minimumImageAttemptsReached =
  frameStrategy === "storyboard_3x3_split"
    ? completedImageAttemptCount >= MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW
    : true; // sequential + start_stop: per-unit repair budget governs
```

  Extend `hasMarketplaceAutoReviewMinimumImageAttemptsForTest` (SVC:10716) with the strategy argument; keep grid semantics identical. Also verify `imageRepairBudgetExhaustedAllowsStoryboardReviewHandoff` (SVC:10364) and `hasCompleteFrameSet` selection (SVC:20185-20199 — sequential falls into the `storyboardFrameUrls` arm) behave for 9 sequential frames; adjust only if a grid assumption surfaces, with a test first.

### 5.9 Best-of-2 for `qualityMode: premium_strict_qa` (units 1–2 only)

- Gate on the highest quality tier (`metadata.qualityMode === "premium_strict_qa"`; confirm via `buildMarketplaceAutoReviewQualityModePolicy` SVC:2521-2576).
- For `sequential-shot-01` and `sequential-shot-02`: schedule a second provider attempt even when the first passed QA; score both completed attempts with `buildImageAttemptScoreBreakdown` (SVC:6885); persist the winner in metadata (suggested: `metadata.sequentialStoryboard.unitCandidateSelections[unitId] = { selectedAttempt, scores, decidedAt }` — additive JSONB, resume-safe) and place the winning URL in `storyboardFrameUrls[index]`.
- Do NOT call `applyBestImageAttemptSelection` (SVC:7085) — grid-specific. Units 03–09 always single-attempt + repairs.

### 5.10 Handoff + metrics ingredients

- Handoff: no changes to `createStoryboardReview` (SVC:21979) plumbing itself — `buildStoryboardReviewOutput` (SVC:21692) already consumes `metadata.storyboardFrameUrls`. Add sequential clip-metadata enrichment where clips/tasks are assembled (`buildStoryboardReviewOutput` / `buildMarketplaceAutoReviewStoryboardReviewTasks` SVC:22022): per-clip `frameStrategy`, `depictsMinor`, `guardianRequired`, `demonstrationType`, `claimTraceSummary` (short string list from `claim_trace[].text` + `support`) sourced from `sequentialStoryboard.shots[index]`. Additive fields only; downstream Storyboard Review surfaces are untouched.
- Metrics ingredients (Phase-2 landing per interview Q2; recorder itself is section-12): tag every `imageAttemptReviews[]` entry with `frameStrategy` (both modes) and, for sequential, include a per-unit outcome array `{unitId, verdict, reasonCodes, repairAttempts, qualityScore}` in the review record built by `appendImageAttemptReview` (SVC:7225). Reuse existing `console.warn("[marketplaceAutoReview] …")` structured-log style at accept/block decision points; formal audit event names (`sequential_*`) come in section-12.

---

## 6. Files touched

| File | Change |
|---|---|
| `apps/web/server/services/marketplaceAutoReviewService.ts` | All forks in §5; new test exports: `buildMarketplaceAutoReviewInitialImageUnitsForTest`, `marketplaceAutoReviewImageUrlsFromDirectRefsForTest`, extended `prepareMarketplaceAutoReviewImagePromptForTest` (metadata input), extended `hasMarketplaceAutoReviewMinimumImageAttemptsForTest` (strategy input) |
| `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialPipeline.test.ts` | New — tests T1–T10 |
| `apps/web/shared/marketplaceCapture/referenceIndexMap.ts` | Read-only dependency (section-02) — imported for submit-time re-validation |
| `apps/web/server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` | Read-only tripwire (section-01) — must stay green, no edits |

No DB migration; all new state is additive JSONB inside `metadataJson` (Database Safety Protocol: Low risk, no DDL).

---

## 7. Verification checklist

1. New suite green: `npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReview.sequentialPipeline.test.ts` (run for `apps/web`; worktrees need `node_modules` symlinked from the main checkout).
2. WS-1 snapshot suite byte-identical (3x3 + start_stop, both flags off).
3. Existing service suite green: `server/services/__tests__/marketplaceAutoReviewService.test.ts`.
4. tsc gate: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — no NEW errors vs the ~987-error baseline.
5. Grep guard: no `splitStoryboardGrid` call reachable from a sequential code path; no `applyBestImageAttemptSelection` call from the sequential best-of-2 path; no `.slice(` applied to a final sequential prompt.
6. Manual trace (internal tenant, flag on): one sequential run produces 9 provider tasks with multi-angle `referenceImageUrls` + manifest in the JSONL audit log (`media_request` events carry `__unit_id: sequential-shot-0N` and per-unit `traceId`), 9 per-frame QA envelopes, zero grid-QA events, and a Storyboard Review with 9 clips carrying the enriched metadata.
