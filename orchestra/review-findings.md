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
