# P0 — Non-Blocking CPE Foundation

## Goal

Prove and enforce that optional cinematic planning and QA cannot reduce the existing eligibility to create an image or video. Establish an evidence-backed baseline before extending P1–P4.

## Scope

Include canonical SPEC/requirement reconciliation; a taxonomy separating advisory quality from hard safety, ownership, budget, provider-capability, cancellation, and verified-artifact controls; bounded diagnostics/fallback contracts; failure-injection tests; and stage-state compatibility review.

Exclude new rendering/provider/job systems, weakening hard controls, quality-based rejection, mandatory review/wait states, and production deployment.

Reconcile Feature 157's generic `provider_ready`, `awaiting_action`, production-QC and final-gate language against the newer critical CPE policy. Any interpretation that lets subjective CPE findings block normal image/video generation must be narrowed before implementation. Preserve all existing hard controls.

## User-Facing Behavior

With CPE disabled or unavailable, users retain the same storyboard, image/video controls, approvals, cancellation, and asset access as before. Failures in optional CPE steps appear as useful advisory diagnostics while the existing workflow continues.

## Technical Constraints

- First inspect `apps/web/server/services/verticalDramaEpisodePipeline.ts`, especially `generateRealStoryboard` and `generateRealStartFramePlan`.
- Reuse current run warnings/artifacts, QC and provider gate conventions, media asset ownership, and stable idempotency contracts.
- Preserve `verticalDramaQc.stageBlocksPaidGeneration` as a hard-control boundary; only severity `blocking` may block paid generation, and only for actual hard conditions.
- All new long-running work must enter `worker_jobs` plus outbox.
- Map requirements to existing canonical Feature work, especially 137/138/149/150/155/157/167/170/173/175 and Quick 167/186/191/298. Do not create a new SPEC ID in this split.

## Dependencies

None. This phase defines the fallback, state, and test contract used by every later phase.

## Outputs

1. A requirement-to-source-to-test reconciliation with canonical handoff disposition.
2. A shared optional-enhancement contract and bounded failure policy, added only where existing contracts do not already express them.
3. A feature-off and fault-injection regression harness covering planning, image/video eligibility, approvals, assets, and paid-work checks.

## Edge Cases

- The optional planner returns syntactically valid but stale data for a changed storyboard revision.
- Enhancement timeout happens after an existing storyboard was already persisted.
- A user cancels or explicitly rejects a plan while an optional job is still running.
- The optional provider is unavailable while the configured baseline provider remains usable.
- A media job has an unknown terminal outcome; do not retry or charge again until reconciled.

## Error Handling

Record sanitized reason, step, revision, and correlation identifier; discard only invalid optional changes; continue with the existing persisted contracts. A hard authorization, ownership, safety, insufficient-credit, cancellation, or artifact-verification failure stays hard. No unbounded retry, new wait, or failed stage solely from CPE.

## Testing Expectations

Test CPE off, missing service, timeout, malformed output, stale revision, judge/provider error, and recovery. Compare baseline and CPE-failure generation eligibility and request contracts. Assert no extra paid operation, duplicate credit charge, asset mutation, approval/wait state, or cancellation override. Include focused UI/API tests for existing visible controls.
