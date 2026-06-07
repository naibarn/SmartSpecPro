[COMPLETE] wave-1-diagnosis - Read-only DB and code inspection found a non-converging image QA repair state plus recursive advance outbox amplification.
[COMPLETE] wave-2-implementation - Patched exhausted repair handoff to Storyboard Review warnings and prevented background scheduler/outbox self-enqueue.
[COMPLETE] wave-3-verification - Focused Vitest and TypeScript check passed.
[COMPLETE] wave-4-3x3-diagnosis - Verified recent runs start with `storyboard_3x3_split` and call the product-reference-storyboard skill, but production prompt audit showed the final provider prompt could pass with runtime warnings while missing hard 3x3 layout phrases (`exactly 3 equal-height rows`, `no separator lines`).
[COMPLETE] wave-5-3x3-guard - Hardened storyboard-grid prompt preflight so provider submission blocks/retries when the final prompt drops core 3x3 layout instructions even if skill runtime audit proves the input preset was correct.
[COMPLETE] wave-6-timeline-rca - Audited the production run end-to-end: provider images completed in minutes, but image generation stayed in repair/advance reconciliation for hours with 2,698 running stage-attempt snapshots and no `completedAt` on `completed_with_warnings`.
[COMPLETE] wave-7-status-ledger-fix - Patched stage completion timestamps for `completed_with_warnings`, stabilized non-terminal stage-attempt keys to `stage:active`, and cleaned the completed production run's stale attempt ledger/status read-model.
[COMPLETE] wave-8-retention-cleanup - Added best-effort operational runtime cleanup on new run start for terminal runs older than 3 days, limited to leases, stage attempts, provider events, and outbox jobs.
[COMPLETE] wave-9-parallel-auto-unblock - Changed compliance review from hard blocker to warning, kept active run metadata without forcing resume, removed same-product active-run dedupe in start, and added migration 0200 to drop the active unique index so parallel Marketplace Auto Review runs can coexist.

## Verification
- PASS: `npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReviewService.test.ts`
- PASS: `npm --prefix apps/web run check`
- PASS: `npm --prefix apps/web run test -- server/services/__tests__/hyperframesFeatureAccessService.test.ts server/services/__tests__/hyperframesAutoPlanService.test.ts server/services/__tests__/hyperframesAutoPlanServiceProjection.test.ts server/services/__tests__/hyperframesRuntimeApiResume.test.ts server/services/__tests__/marketplaceAutoReviewService.test.ts shared/__tests__/marketplaceAutoReviewContracts.test.ts`
- PASS: `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
