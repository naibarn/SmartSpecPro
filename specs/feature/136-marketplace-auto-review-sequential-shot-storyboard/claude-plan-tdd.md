# TDD Plan — Feature 136 (mirrors claude-plan.md workstreams)

Conventions (from claude-research.md §6): Vitest, run
`npm --prefix apps/web run test -- <files>` from repo root; router tests stub
JWT via `vi.hoisted`; skill tests read REAL files from disk (no mocks —
`reviewerSkillsUpgrade.test.ts:6-70` pattern); service tests use exported
`…ForTest` helpers; tsc gate compares against the ~987-error baseline. Test
stubs below are prose — the implementer writes the actual test code FIRST,
then implements until green.

## WS-1: Flags and shared schema foundation

New: `apps/web/shared/__tests__/featureFlags.feature136.test.ts` (or extend
existing flag tests), `apps/web/server/services/__tests__/
marketplaceAutoReview.sequentialGate.test.ts`, snapshot suite
`marketplaceAutoReview.snapshots.test.ts`.

- Test: both new flag keys exist in interface, ALLOWED set, and DEFAULTS with
  default `false`.
- Test: tenantFeatureFlagGroups contains both entries with Thai labels.
- Test: autoPlan defaults/override schemas accept
  `sequential_shot_storyboard`; base value unchanged
  (`storyboard_3x3_split`); unknown strategy still rejected.
- Test: new override fields parse/normalize (bounds:
  sequentialImagePromptMaxChars 1000–4000 default 4000; free-text trimmed).
- Test: `resolveFrameStrategy("auto")` → `storyboard_3x3_split` (unchanged);
  `resolveFrameStrategy("sequential_shot_storyboard")` → passthrough.
- Test: start entry points throw typed FORBIDDEN with Thai copy when strategy
  sequential + `marketplaceSequentialStoryboard` false (both
  `startMarketplaceAutoReviewRun` and `startAutoStoryboardReviewForApi`).
- Test: plan service adds a blocker + omits sequential from defaults when
  override requests it with flag off.
- SNAPSHOT (both flags off): `getAutoStoryboardReviewPlan` output,
  `buildMarketplaceAutoReview3x3StoryboardPromptForTest`, and
  `buildShotFramePrompt` byte-identical to committed baselines for fixed
  fixtures.

## WS-2: Multi-angle reference layer

New: `apps/web/shared/marketplaceCapture/__tests__/referenceIndexMap.test.ts`,
service tests for the sequential resolver.

- Test: router zod accepts `productAngleImages` ≤8 with valid entries;
  rejects >8, bad angleLabel, missing url.
- Test: resolver ordering — primary first, angles in user order; dedupe by
  hash then URL.
- Test: reservation vs attachment — with cap 5 and (primary + guardian + env
  + 4 angles): guardian + env reserved, angles trimmed from END; attachment
  order is primary, angles, guardian, environment.
- Test: capacity fail-closed — required refs (primary+guardian) > model cap
  throws BEFORE any credit path; cap 0 model throws.
- Test: `package`/`parts_diagram` entries excluded from provider attachments,
  present in skill vision inputs, marked evidenceOnly in stored manifest.
- Test: 3x3 path untouched — `approvedProductReferenceUrls` still throws on
  supporting refs (existing behavior re-asserted).
- Test: `findReferenceIndexMappingMismatches` — explicit contradictory
  `@ImageN` role claim detected; silent prompt → no mismatch; multiple claims
  mixed; 1-based indexing.
- Test: runner enforcement — one corrective retry then throw; submit-time
  re-validation catches manifest drift between authoring and submission.

## WS-3: Skill bundle

New: `apps/web/server/services/__tests__/
productReviewSequentialStoryboardSkill.test.ts` (real files from disk).

- Test: `skill.md` and `SKILL.md` exist and are byte-identical.
- Test: frontmatter parses; `execution_mode: llm-only`; requirements
  `supportsVision` + `contextLength: 1000000`; `fallbackPolicy: error`;
  config has `loop_rounds: 3`, `candidate_count: 3`.
- Test: `schemas/input.schema.json` + `output.schema.json` + `ui.schema.json`
  parse as JSON Schema; input schema contains every §9.6 field; output schema
  matches the §19.2 `sequentialStoryboard` shape (spot-check shots[] required
  fields incl. `demonstration_type`, `depicts_minor`).
- Test (taught-not-wired guard): body contains markers for Phases A–K, the
  mandatory global video block template, guardian rules, assembly guard rules
  (`assembly_demo`), start-frame action rule, price ban; `references/`
  contains claim-safety.md, narrative-patterns.md, guardian-presence.md,
  demonstration-evidence.md with non-empty content.
- Test: registry sync picks the bundle up (parseSkillFile on real file →
  category maps through `mapCategoryToEnum`).

## WS-4: Skill runner + loop orchestration

New: `apps/web/server/services/__tests__/
productReviewSequentialStoryboardSkillRunner.test.ts`.

- Test: sync error → throw; skill missing/disabled → throw; input-schema
  audit hard-fails BEFORE any provider/credit call.
- Test: runtime contract includes budgets, manifest, product truth, blocked
  claims, confirmedAttributes, childSubjectPolicy, preset directive, and
  motionDirection dual-injection instruction.
- Test: loop runs ≤3 rounds; each round persisted (output + 8 scores) before
  next; mid-loop resume picks up at the recorded round.
- Test: best-version retention — later lower-scoring round does not replace;
  deterministic disqualifiers (missing global block / over-length / <9 shots)
  disqualify regardless of score.
- Test: candidates recorded in `loopReport.round_N.candidates[]`; count
  capped at `candidate_count`.
- Test: runner rejects a return lacking loopReport/finalQc evidence.
- Test: deterministic preflight blockers each fire on crafted fixtures:
  `sequential_prompt_set_incomplete`, image over effective budget
  (min(4000, provider cap)), video >2000, `video_global_block_missing`,
  `guardian_directive_missing` (policy active), `assembly_demo_unverified`,
  `price_claim_detected` (Thai + numeric patterns), shot >10s, speech
  estimate > duration, mapping mismatch, `product_reference_model_conflict`.
- Test: over-budget prompt → optimizer skill invoked with correct
  `prompt_kind`; revalidated; NO `slice()` call sites against final prompts
  (grep-guard test).
- Test: structural failure after bounds → deterministic fallback prompts via
  `buildShotFramePrompt` + safety locks + audit
  `sequential_prompt_degraded_fallback`; run continues.

## WS-5: Evidence persistence + plan surface

- Test: skill output persisted at `metadataJson.sequentialStoryboard.*` with
  evidenceProfile (`assembly_documented` present), claimWhitelist feeding
  `claimEvidenceMapping.blockedClaims`.
- Test: plan response includes optional `evidencePreview` +
  `referenceCapacity` ONLY when flag on + sequential; `.strict()` schema
  still parses for legacy clients (fields optional).
- Test: evidencePreview is deterministic text-only (fixture with title/
  description conflict → needsConfirmation entry; no LLM invoked — assert no
  gateway call).
- Test: `confirmedAttributes` upgrades a conflicting claim to user_confirmed;
  unresolved conflict absent from prompts/dialogue.

## WS-6: Sequential unit pipeline

- Test: `buildInitialImageUnits` returns 9 units with correct ids/roles for
  sequential; 3x3 path unchanged (1 grid unit).
- Test: unit dispatcher returns the shot's skill prompt; `shotOverrides` takes
  precedence; targeted-repair concat appended via existing appender.
- Test: submit payload carries multi-angle `referenceImageUrls` + manifest
  extraParams; aspectRatio 9:16; numImages 1.
- Test: per-unit attempt counting via `nextDirectAttempt` with
  `directImageTasks` fixtures; restart resumes only incomplete units.
- Test: per-frame QA envelope requests + parses the extended fields; grid QA
  NOT invoked for sequential units.
- Test: repair budget honored per unit (`maxRepairAttemptsPerUnit`);
  qualityMode high → best-of-2 for units 1–2 via score breakdown (winner
  recorded on unit; `applyBestImageAttemptSelection` NOT called).
- Test: stage gate — all 9 pass ⇒ storyboard_review; one unit with
  publish-blocking code ⇒ stage blocked even after repair budget; warnings-
  only codes ⇒ accepted-with-warnings.
- Test: `createStoryboardReview` receives 9 frame URLs; `splitStoryboardGrid`
  not called; clip metadata carries frameStrategy/depicts_minor/
  guardianRequired/demonstration_type.

## WS-7: Shared evidence-guard package

- Test: directive builders return "" when guard flag off / policy inactive;
  correct Thai/English directive text when active.
- Test: childSubjectPolicy — mother_baby category + depicts_minor shot ⇒
  active; adult-only plan ⇒ inactive; text-signal trigger.
- Test: injections present in `build3x3StoryboardPrompt`,
  `buildShotFramePrompt`, 3x3 skill runtime_contract, sequential contract
  when guard on; absent when off.
- DIFF-SHAPE SNAPSHOT: guard flag alone ⇒ 3x3 prompt differs from baseline
  ONLY by the enumerated directive lines (claim whitelist/conflict exclusion
  lines included in the enumeration).
- Test: QA normalizer FAIL-CLOSED — `minorPresent true` +
  `adultGuardianPresent` missing/false ⇒ verdict repair +
  `guardian_presence_missing`; `adultGuardianPresent true` ⇒ pass.
- Test: `assemblyContentDetected true` + `assembly_documented false` ⇒
  repair + `assembly_content_unverified`; documented ⇒ pass.
- Test: `guardian_presence_missing` in publish-blocking set;
  accept-with-warnings refuses it; assembly code fails the unit after budget
  (not publish-safety class).
- Test: repair directive registry contains both new entries with expected
  instruction text.
- Test: grid QA schema string + per-frame QA schema string both contain the
  new fields when guard on.

## WS-8: Per-shot regeneration + edits

New: router test in `apps/web/server/routers/__tests__/` (vi.hoisted JWT).

- Test: zod accepts runId + shotId 1–9; rejects shotId 0/10/non-int.
- Test: regen re-runs exactly one unit; other 8 unit records untouched
  (attempt counters unchanged).
- Test: single-shot refresh does NOT re-run the 3-round loop.
- Test: edited prompt saved to `shotOverrides[shotId]`; failing edit rejected
  with specific blocker id + Thai message; passing edit used at regeneration;
  mapping re-validated at submit.

## WS-9: Full-video per-shot

- Test: video prompt preflight — global-block marker, ≤2000, price backstop
  per prompt before any video job.
- Test: attachment — approved frame at `referenceImageUrls[0]`; budget fill
  order guardian → primary → angles with trim; grok (cap 1) gets ONLY the
  start frame; reference-mode semantics `single_storyboard_frame`.
- Test: per-shot duration passed where supported; blocker when selected video
  model lacks start-frame support.
- Test: audio strategies unchanged (native embeds dialogue; separate TTS
  keeps prompts visual-only) — re-assert via existing storyboardPromptAudio
  test patterns.

## WS-10: Credits and estimates

- Test: estimate inputs include imageJobCount 9 (sequential) vs 1 (grid);
  complexity multiplier = quality × (shots/9) × 1.10 for sequential (2-dp
  rounding), start_stop still 1.15; grid unchanged.

## WS-11: UI

New: component tests under `client/src/components/marketplaceCapture/
__tests__/` (extract cards where jsdom-mountability requires — hermes panel
precedent).

- Test: strategy option rendered only when flag on; Thai label/description.
- Test: capacity meter text with n/modelCap; trim warning chip lists trimmed
  angles; evidence-only labels for package/parts_diagram.
- Test: guardian notice renders only when childSubjectPolicy active; no
  opt-out control exists; presence label generalized for sequential.
- Test: evidence review — confirm/reject actions produce
  `confirmedAttributes`; forbidden-words field produces `forbiddenClaims`;
  new targetAudience/userRequirements fields wire to overrides.
- Test: per-shot card shows char counts, claim sources, QC, guardian badge,
  demonstration_type; edit-save surfaces preflight blocker message; loop
  report renders rounds + selected version.

## WS-12: Observability + GA-gate plumbing

- Test: audit events emitted with expected shapes (round event with scores;
  degraded fallback; over-budget rewrite with prompt_kind; angle-trim).
- Test: metrics recorder aggregates per-mode mismatch/repair/publish-block/
  qualityScore from `imageAttemptReviews[]` fixtures for BOTH strategies.
- REAL-LLM GATE (CI-tagged, manual pre-GA): children's-desk-chair fixture
  (4 angles + adult ref) → 9 frames, guardian in every minor frame, no price
  tokens, budgets + global block ×9; furniture fixture WITHOUT assembly docs
  → zero assembly content, pivot beats present.

## Cross-cutting gates

- tsc: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run
  check` — no NEW errors vs baseline.
- Full suite green: WS-1 snapshots stay byte-identical through every later
  WS (regression tripwire).
