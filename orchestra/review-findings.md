# Review Findings

## Round 1 - Backend Runtime Review
- Completeness: Fix covers both observed failure modes: exhausted image repair no longer loops when frames and minimum attempts exist, and background/outbox advances no longer recursively enqueue unique `advance_run` jobs.
- Security: No auth, tenant access, schema, secret, or external provider contract changes.
- Quality: Added focused regression tests for whole-storyboard product mismatch handoff and scheduler outbox policy.
- Impact ripple: `marketplaceAutoReviewService` is used by the job, router, HyperFrames plan/runtime services, and tests. Focused service tests and TypeScript check passed.
- Residual risk: Existing production queued outbox rows remain in DB until cleaned by an explicit operator action after deploy.

CONVERGENCE:
- Rounds run: 1
- Clean rounds: 1
- Stop reason: criteria passed for scoped medium-risk backend fix
- Stale gates rerun after last change: focused Vitest, TypeScript check

## Round 2 - 3x3 Prompt Contract Review
- Completeness: Root cause for intermittent non-3x3 images was not missing UI defaults. Read-only DB evidence showed `frameStrategy=storyboard_3x3_split`, `unitId=storyboard-grid-image`, and skill input `layoutPreset=canvas_9_16_grid_3x3_frame_9_16_exact`. The failure was final prompt enforcement: runtime-backed prompt contract gaps were warnings, so provider submission could proceed while the prompt omitted hard layout wording.
- Fix: Core visual layout fragments for storyboard-grid prompts are now hard blockers: single 9:16 canvas, exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, no collage/masonry layout, and no separators/dividers.
- Quality: Added regression coverage for a skill-generated prompt with valid runtime audit but missing hard 3x3 layout instructions.
- Verification: Focused Marketplace Auto Review Vitest and TypeScript check passed after the prompt guard change.

## Round 3 - Runtime Timeline And Status Review
- Finding: The expensive/slow part was not provider image generation. For run `mar_f7666678bf3b1fb8add90bbaa479d8b4`, image attempts completed around 08:26, 08:28, and 08:30 UTC, but the run remained in `image_generation` until 11:52 UTC because repair-budget handoff and recursive advance processing kept reconciling the same stage.
- Finding: Status visibility was also misleading. `marketplace_auto_review_stage_attempts` had 2,698 `running` rows for the same stage, and `marketplace_auto_review_stages.image_generation` had `status=completed_with_warnings` without `completedAt`.
- Fix: Non-terminal stage-attempt snapshots now use a stable `stage:active` key, and `completed_with_warnings` sets `completedAt` like completed stages.
- Production cleanup: The completed run's stale running stage attempts were cancelled as stale read-model rows, and `image_generation.completedAt` was backfilled from the completed run timestamp.

## Round 4 - Intermittent Preflight Root Cause Review
- Finding: The root cause was still upstream skill output completeness. `productReferenceStoryboardSkillRunner` required Frame 1-9, product verify, and camera blocks, but did not require the same hard 9:16/3x3 layout anchors that `marketplaceAutoReviewService` preflight required. The service then used `ensureStoryboardGridContractLockInImagePrompt` to patch missing anchors after the skill returned, which hid the source defect and made failures depend on output length/retry behavior.
- Fix: Removed the service-level storyboard-grid contract-lock patch from provider-submit preparation. The runner now rejects outputs missing `one single 9:16 image`, exact frame count, vertical frame count, equal rows/columns, no-collage, and no-separator anchors before returning a prompt. Service preflight now treats runtime generation/layout/aspect mismatches, schema audit failure, fallback use, missing Frame N labels, and missing global labels as blockers.
- Contract sync: Updated `product-reference-storyboard` and `product-reference-storyboard-prompt-optimizer` skill contracts and mirrors so the generated/optimized prompt is instructed to preserve the exact anchors that validators enforce.
- Quality: Added regression tests proving runtime audit no longer masks missing grid phrases and incomplete frame coverage no longer downgrades to warnings.
- Verification: Focused Vitest passed for Marketplace Auto Review and product-reference storyboard skills; TypeScript check passed.
- Convergence: Targeted diff review plus grep found no remaining `STORYBOARD GRID CONTRACT LOCK`, `storyboardContractLock`, or `ensureStoryboardGridContractLock` usage in the service/test path. No material follow-up findings.

## Round 5 - Soft Quality Gate Review
- Product decision update: Exact 9:16/3x3/frame/product-lock prompt gaps are quality warnings, not permanent blockers. The workflow should generate image attempts so users can select, repair, or manually edit images instead of stopping with no output.
- Fix: `productReferenceStoryboardSkillRunner` now records contract/completeness issues as `completenessWarnings` and logs `output_contract_warning` without throwing `ProductReferenceStoryboardSkillIncompleteOutputError` for non-empty prompt quality gaps. `marketplaceAutoReviewService` keeps skill-runtime prompt quality issues in `warnings` so provider submission can continue.
- Still blocking: technical/safety failures that make generation unsafe or unusable remain blockers, including empty/over-limit prompt paths, minor safety clothing lock misses, invalid shot count, and uploaded character reference age-role mismatch.
- Skill accuracy: Updated `product-reference-storyboard` and optimizer contracts to preserve/copy the exact first storyboard-grid contract line instead of paraphrasing the anchors.
- Verification: Focused Vitest passed for Marketplace Auto Review and product-reference storyboard skills; TypeScript check passed; `git diff --check` passed; skill `SKILL.md` mirrors match `skill.md`.

## Round 6 - Product Detail Status Freshness Review
- Finding: The status-stuck-until-F5 symptom was reproducible as a frontend data freshness gap. `listAutoReviewRuns` polling stopped when the current cache had no active run, and state-changing mutations invalidated `{ productId, limit: 8 }` while the visible Product Detail query can be `{ productId, limit: 3, summary: true }`.
- Finding: The regular Auto Review start path set `pendingAutoReviewAction` before mutation but did not clear it on the start mutation itself, so the UI could keep a transient waiting/starting state after the request had already settled.
- Fix: Product Detail now polls active Auto Review runs every 5s, polls newly-started run materialization every 3s, uses a 5s stale window for run lists, refetches on mount/reconnect/focus, invalidates all `listAutoReviewRuns` variants after run state changes, and clears `pendingAutoReviewAction` on start mutation settlement.
- Quality: Added a regression test that failed before the patch and now asserts the polling/start-wait contract, broad invalidation, and transient start-action cleanup.
- Verification: Focused Vitest passed; full web TypeScript check passed; targeted Marketplace HyperFrames Playwright route test passed; `git diff --check` passed for touched files.
- Convergence: Targeted review found no remaining exact `{ productId, limit: 8 }` invalidations for `listAutoReviewRuns` in Product Detail and no SocratiCode-reported downstream callers for the changed page file.
