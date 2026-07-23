# Fix: Marketplace Auto-Review — optimizer strips MINOR SAFETY CLOTHING LOCK → terminal preflight fail

Date: 2026-07-22
Run evidence: `mar_829542bbba1282b35fcda87d09d5db47` (product `mp_fc2a8ff035302c2c9faf3bce8e349ae8`, sequential_shot_storyboard)

## Problem statement

`image_generation` terminal-fails with blocker `minor_safety_clothing_lock_missing` even though the
skill-authored pack contained the lock in ALL 9 shots (verified in DB `metadataJson`, 8,205–8,352
chars each, `has_marker: true`). Causal chain:

1. Pack prompts are over the 4,000-char sequential budget (loop selected `degraded` version).
2. Dispatch (`buildMarketplaceAutoReviewImagePromptForUnit`, non-grid branch,
   `marketplaceAutoReviewService.ts` ~10856) runs: build (locks ensured pre-optimizer) →
   **LLM optimizer** (`product-reference-storyboard-prompt-optimizer`, gpt-4.1-mini, 8352→2894) →
   preflight.
3. The optimizer skill's preserve list (skill.md:77-138) does NOT include
   `MINOR SAFETY CLOTHING LOCK` and even teaches "Shorten long global locks" → the literal marker
   is paraphrased away.
4. No deterministic re-append after the optimizer; fail-closed preflight
   (`validateMarketplaceAutoReviewImagePromptPreflight` ~9861) requires literal
   `/MINOR SAFETY CLOTHING LOCK/i` for child-related plans → throws
   `MarketplaceAutoReviewImagePromptPreflightError` → stage failed_terminal. Retry is
   deterministic-fail (pack persisted over budget → optimizer always runs → always strips).

Secondary gaps:
- `ensureMinorSafetyClothingLockInImagePrompt` budgets against the 3x3 constant (3800) even on the
  sequential path (budget 4000) and silently drops the lock for 9-`Frame N:` prompts when over
  budget (countPromptMatches >= MAX_SHOT_COUNT early-return).
- Grid branch has the same post-optimizer strip risk (relies on optimizer good behavior only).
- Non-grid branch has NO repair round and NO soft-proceed: any preflight blocker = run dies before
  Storyboard Review. (Post-generation QA already has repair rounds + accept-with-warnings handoff:
  `acceptImageQaWithWarningsAfterRepairBudgetExhausted` → human review. Pre-submit is the only
  dead-end.)

## User requirements (2026-07-22)

1. Fix completely in one round; quality gate must stay REAL (no rubber-stamping).
2. If preflight fails → repair round.
3. Regardless of repair outcome, images must reach Storyboard Review for human review —
   EXCEPT hard safety floors (child-safety lock, guardian/assembly evidence guard) which stay
   fail-closed.

## Changes (all in apps/web unless noted)

### A. server/services/marketplaceAutoReviewService.ts
A1. `ensureMinorSafetyClothingLockInImagePrompt(prompt, plan, maxChars?)` — optional budget param,
    default `MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS` (byte-identical for existing callers).
A2. `ensureMarketplaceAutoReviewEvidenceLocksInSequentialImagePrompt(..., maxChars?)` — thread
    budget to A1 (default sequential constant for guardian/demo appends unchanged); extend ForTest.
A3. New `sequentialEvidenceLockReserveChars(plan, guard)` — chars to reserve for locks that must
    survive optimization (full minor lock + guardian + demo when applicable) + ForTest export.
A4. Non-grid branch of `buildMarketplaceAutoReviewImagePromptForUnit...ForSubmit`:
    - compute `guard` + sequential budget once;
    - optimizer `maxOutputChars` = budget − reserve (min floor 1500) so re-append always fits;
    - NEW `finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizer(...)` (+ForTest):
      relock (role-aware) → targeted-repair directive → preflight → if failed:
      deterministic repair already applied → classify:
      HARD = [prompt_empty, minor_safety_clothing_lock_missing, guardian_directive_missing,
      assembly_demo_unverified, invalid_requested_shot_count] → throw (unchanged fail-closed);
      else SOFT-PROCEED: return status passed, blockers moved to warnings as
      `soft_blocker_<code>` + `prompt_preflight_soft_passed_after_repair`, audit
      `promptPreflightSoftPass` in skillRuntime → generation proceeds → vision-QA repair loop →
      Storyboard Review (human gate).
A5. Grid branch: after its optimizer, relock via A1 + audit flag
    `postOptimizerSafetyRelockApplied` (loop/advisory logic untouched).
A6. Grid optimizer wrapper `optimizeMarketplaceAutoReviewFinalImagePromptForProvider`: optional
    `maxOutputChars` (default 3800); grid call passes 3800 − minor-lock reserve when plan needs it.
A7. Degraded grid fallback path (~10764): relock after optimizer there too (advisory mode must not
    submit child-related prompts without the lock).

### B. server/services/productReferenceStoryboardSkillRunner.ts
B1. Add unconditional runtime-contract line to the optimizer systemPrompt (mirrors the existing
    sequential_video verbatim-marker precedent): if source contains MINOR SAFETY CLOTHING LOCK /
    GUARDIAN PRESENCE LOCK / DEMONSTRATION EVIDENCE LOCK / CLAIM SAFETY EXCLUSIONS blocks, keep
    header + directive sentences verbatim; compress other sections first; never delete/reword.

### C. skills/product-reference-storyboard-prompt-optimizer/skill.md + SKILL.md (identical twins)
C1. Add the 4 safety/evidence lock headers to the preserve list; explicit rule: these blocks are
    verbatim-preserve, compress everything else first. Update final-skeleton line to note safety
    locks appear when present in source.

### D. Tests (vitest, apps/web)
- New `__tests__/marketplaceAutoReviewSequentialPreflightRelock.test.ts`:
  relock-after-optimizer passes preflight; hard floor still throws; soft-proceed converts
  non-safety blockers to warnings; reserve helper math; optimizer wrapper under-budget no-op pin.
- Extend `__tests__/productReferenceStoryboardSkills.test.ts`: optimizer skill.md contains the
  preserve rules; skill.md ≡ SKILL.md bytes.

## Risk assessment
- All new params optional with byte-identical defaults; 3x3 existing behavior pinned by defaults.
- Soft-proceed only for non-safety blockers; safety floors unchanged (fail-closed).
- Reserve shrinks optimizer target only for child-related plans (the class that currently fails).
- No DB changes. No frontend changes (warnings already rendered).

## Verification
1. Targeted vitest suites green (new + skills + evidenceGuard + skill runner suites).
2. `pnpm check`: no NEW type errors in touched files (repo has pre-existing baseline).
3. Restart smartspec-web; user retries the failed run from UI → images generate → Storyboard
   Review receives frames.

### E. Second-round gap found during implementation review (also fixed)

E1. The preflight demands the lock when the plan is child-related **OR** when the prompt itself
    carries a minor-safety signal (`textHasMinorSafetySignal`). The injector was plan-gated only,
    so a NON-child product whose storyboard puts a child in frame produced an unrepairable
    blocker — the same dead-end class. Added
    `ensureMinorSafetyClothingLockForPromptSignal` (+ForTest): plan-gated path first, then
    signal-driven injection using the same literal lock text; safety outranks the char budget.
    Applied at all three relock sites (sequential, non-grid, grid, degraded fallback).
E2. `ensureMinorSafetyClothingLockInImagePrompt` used to DROP the lock entirely for prompts with a
    complete 9-frame set that could not fit it (`return base`), which guarantees the fail-closed
    blocker downstream. Now returns the compact lock appended with all frames intact. This also
    turned a pre-existing red test green ("does not truncate storyboard frames when adding minor
    safety lock to a near-limit prompt").

## Verification results (2026-07-22)

- New suite `marketplaceAutoReviewSequentialPreflightRelock.test.ts`: **24/24 green**.
- Marketplace sweep (28 files, 707 tests): **703 passed, 3 failed, 1 skipped**.
  All 3 failures reproduce identically at HEAD in a clean worktree (pre-existing, fail-set
  identity confirmed):
  1. `marketplaceAutoReviewService.test.ts > preflights 3x3 prompts … Media Studio skill field contract`
  2. `marketplaceAutoReviewService.test.ts > keeps a full 9-shot … under the image provider limit`
     — both encode an older, larger prompt budget than the current 3800 constant, and exercise
     `prepareMarketplaceAutoReviewImagePrompt`, which is reachable ONLY from its ForTest wrapper
     (no production caller), so they are test-surface drift, not a live dead-end.
  3. `marketplaceAutoReview.snapshots.test.ts > getAutoStoryboardReviewPlan shape byte-identical`
  Baseline was 4 red in this area; one of them (the near-limit lock test) is now green.
- Typecheck: 46 pre-existing errors repo-wide, **0 in any touched file** (before and after).
- **Real-payload replay** of the failed run: the actual 2,894-char optimizer output captured in
  `marketplace_auto_review_stages.outputJson.promptSkillDebug.rawOutput` was replayed through the
  fixed dispatch tail — before: `failed / minor_safety_clothing_lock_missing`; after:
  `passed`, lock present, 3,500 chars ≤ 4,000 budget, reserve 606 → optimizer target 3,394.
- Skill reaches runtime: `loadPromptTemplate` finds no `prompts/` dir for the optimizer skill, so
  it falls back to `skill.skillContent` from the DB registry; the DB row now holds the updated
  body (6,357 chars = disk body exactly) including all four lock headers and the carve-out rule.
- Service restarted twice (after each edit round); `https://smartaihub.app/api/health` → 200.

## Status
- [x] Root cause proven from DB + audit + code
- [x] A1-A7 implemented
- [x] B1 implemented
- [x] C1 implemented (twins identical)
- [x] D tests written & green (24/24)
- [x] E1-E2 second-round gaps closed
- [x] Typecheck no new errors in touched files
- [x] Service restarted and healthy
- [ ] User retries the run from the UI → images generate → Storyboard Review (user action)
