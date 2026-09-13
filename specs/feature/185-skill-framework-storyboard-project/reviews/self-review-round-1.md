# Plan self-review — Phase A, round 1

## Scorecard

| category | result | evidence |
|---|---|---|
| Structural integrity | PASS | Plan has objective, contracts, baseline, ownership, persistence, services, UI, tests, rollout, dependency order, and definition of done. |
| Completeness vs synthesized spec | PASS | Covers 2–12 shots, fixed 10 sec, three story types, dynamic schemas, Cute Child v3 normalization, 0–5 managed refs, conditional quality, canonical request preservation, images/video prompts, Characters parity, revisions, interop, billing, security, and rollout. |
| Implementability | PASS after fixes | Added exact candidate files, section ownership, tRPC procedure surface, project/run return contract, stage order, persistence fields, and test boundaries. |
| Internal consistency | PASS after fixes | Standardized `ImageGenerationCore`, one job-level credit confirmation, project-first lifecycle, `projection_pending`, and complete `generation_request` preservation. |
| Edge cases | PASS | Covers invalid schemas/models/refs, worker restart, duplicate delivery, cancellation, partial shot failure, projection failure, conflicts, source deletion, cross-skill mismatch, and dirty worktree. |

**Initial score:** 23/25.
**Final score:** 25/25 after auto-fixes below.

## Findings and fixes

1. **[MUST_FIX] Naming precision:** The plan used both “Image Core” and the spec's `ImageGenerationCore`. Updated the stage and billing sections to use `ImageGenerationCore` and explicitly require prompt equality.
2. **[MUST_FIX] API implementability:** The plan described routers generally but did not enumerate the required project/run procedures or return shape. Added the complete tRPC procedure surface and `{ projectId, runId, status, normalizedSnapshot }` contract.
3. **[MUST_FIX] UI integration ownership:** The proposed file table said “translations” without paths. Added Thai/English locale glob paths and router tests.
4. **[MUST_FIX] Projection failure:** The plan referenced idempotent projection but did not expose the terminal recovery state in the plan. Added `projection_pending`, `rebuildReviewProjection`, and no-success-until-readable behavior.
5. **[NICE_TO_HAVE] Worker implementation file:** The exact worker entrypoint may vary by current queue/runtime. Kept this as a bounded implementation discovery task because existing worker paths are split across worker jobs, scheduler, and feature-specific executors; the plan requires matching the current convention before editing.

## Phase B adversarial pre-check

- A hostile reviewer cannot silently turn the new flow into a manual six-shot flow because exact N, project/run persistence, and current task projection are explicit.
- A provider adapter cannot silently rebuild the canonical prompt because original/effective request fields and equality tests are explicit.
- A character import cannot overwrite a Drama character because snapshot lineage, revision, owner adapters, and conflict resolution are explicit.
- A schema mismatch cannot become a visible selectable skill because registry validation is a prerequisite to listing.
- A projection failure cannot be reported as a completed run because `projection_pending` and rebuild behavior are explicit.
- The only remaining implementation discovery is selecting the existing queue executor file; it is not a product or safety ambiguity and is bounded to the orchestration section.
