# Orchestra Plan

## Task
Diagnose and fix Marketplace Auto Storyboard Review jobs that never finish after image QA repair and cannot resume to Storyboard Review.

## Classification
- scope: medium
- risk: medium
- affected_domains: web backend job runtime, Marketplace Auto Review service, HyperFrames/Storyboard Review handoff, tests
- estimated_file_count: 2
- chosen_route: direct-inline-waves
- task_summary: Find the true root cause for a stuck production auto-review run and apply the smallest backend state-machine fix.
- bug_route: true
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Activation
- Explicit skill: orchestra.
- Additional applicable skill family: rescue-style production incident triage, used inline for read-only diagnosis.
- SocratiCode status: active, green index, used before targeted shell reads.

## Root Cause Summary
- Product `mp_b98391b821d7a3e76d38f414d8b2a00f` has run `mar_f7666678bf3b1fb8add90bbaa479d8b4`.
- The run has 9 storyboard frames and three completed image provider attempts, but every attempt is marked `repair_required` with whole-storyboard product fidelity failure.
- Existing code required three completed attempts before Storyboard Review, but the repair-budget path skipped whole-storyboard product mismatch and kept the stage in `repairing`.
- `scheduleImageAttempt()` skipped exhausted repair units without clearing `pendingImageRepairUnits` or moving to a terminal handoff/blocker state.
- Each background/outbox advance call also persisted a new unique `advance_run` outbox job, causing recursive queue amplification.

## Impact Preflight
- Directly changed files:
  - `/home/dev/projects/SmartSpecPro/apps/web/server/services/marketplaceAutoReviewService.ts`
  - `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`
- Dependent files/tests:
  - `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/marketplaceAutoReviewJob.ts`
  - `/home/dev/projects/SmartSpecPro/apps/web/server/routers/marketplaceCapture.ts`
  - `/home/dev/projects/SmartSpecPro/apps/web/server/services/hyperframesAutoPlanService.ts`
  - `/home/dev/projects/SmartSpecPro/apps/web/server/services/hyperframesRuntimeApiService.ts`
- Risk-sensitive surfaces:
  - Background job lifecycle and provider-spend retry control.
  - No auth, tenant isolation, schema, or external provider API changes.

## Wave Plan
- Wave 1: Diagnose production run state and code paths.
- Wave 2: Patch state-machine handoff after exhausted image repair and stop recursive advance outbox persistence for background schedulers.
- Wave 3: Run focused service tests and TypeScript check.
