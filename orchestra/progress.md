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

## Feature 120 Deep Plan Progress

[COMPLETE] deep-plan-session - Created file-based deep-plan config for Feature 120.
[COMPLETE] codebase-research - Used SocratiCode status/search plus targeted shell discovery for HyperFrames schemas, Storyboard Review storage, feature gates, render worker, output refs, Media History, and package scripts.
[COMPLETE] plan-files - Created Feature 120 research, implementation plan, TDD plan, section index, 9 implementation section plans, and self-review file.
[COMPLETE] plan-verification - Verified 15 markdown files, no trailing whitespace, 9 section manifest entries, no missing section files, and scoped git status.
[COMPLETE] deep-plan-section-check - `check-sections.py` returned complete, manifest_valid true, progress 9/9, and no warnings.
[COMPLETE] feature-120-spec-completeness-review - Compared Feature 120 spec to plan/TDD/sections and added missing coverage for evidence-bound copy, exact Thai fonts, accessibility/responsive evidence, audio license/SFX timing, Admin Tenant flags metadata, and open-question decision gates.
[COMPLETE] feature-120-traceability-hardening - Added traceability matrix and filled deeper gaps for social variants, artifact/output compatibility, HyperFrames data attributes, runtime version diagnostics, staged manifest validation, raw enum copy leakage, and retention skip rules.
[COMPLETE] feature-120-final-plan-review - Rechecked deep-plan coverage after hardening; tracked keyword gaps are closed, `check-sections.py` passes 9/9, and markdown has no trailing whitespace.
[COMPLETE] feature-120-acceptance-keyword-review - Compared all 46 acceptance criteria and spec keyword groups to plan artifacts; added explicit coverage for lifecycle, subtitle families, staged assets, QA artifacts, mandatory disclosure, repair actions, canaries, and candidate promotion.
[COMPLETE] feature-120-final-completeness-audit - Acceptance criteria coverage is clean, tracked spec keyword gaps are closed, section manifest is valid 9/9, and markdown whitespace check is clean.
[COMPLETE] feature-120-security-open-question-hardening - Added explicit plan coverage for tenant-authored HTML rejection, no manual audio JS, preview sandbox/trusted-player boundary, raw signed/private URL redaction, SFX starter pack/music generation decisions, and thumbnail policy.
[COMPLETE] feature-120-exact-symbol-id-hardening - Added exact starter preset id, exported contract/schema symbol, runtime readiness, provenance, and render credit idempotency coverage to close the remaining spec-to-plan ambiguity.
[COMPLETE] feature-120-exact-compatibility-name-hardening - Added exact Feature 119 contract/version, capability, flag, API, data-attribute, timeline, outbox, artifact, output, and Storyboard Review state field coverage to prevent naming drift during implementation.
[COMPLETE] feature-120-final-exact-term-hardening - Added remaining exact audio role, policy pack, native audio, runtime capability hash, style brief, platform profile, raw enum leakage, legacy shot start, and lifecycle timestamp coverage.
[COMPLETE] feature-120-release-gate-hardening - Added package-script availability, dependency-audit/doctor fail-closed behavior, and Feature 119 disabled-flag regression requirements to close rollout evidence gaps.
[COMPLETE] feature-120-open-question-decision-log - Added a decision-log artifact and rollout gate requirement so unresolved SFX, music, karaoke, producer, and Studio/player decisions cannot accidentally enable dependent capabilities.
