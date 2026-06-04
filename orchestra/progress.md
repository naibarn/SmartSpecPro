# Orchestra Progress

[COMPLETED] wave-1-backend-safety — Fixed Feature 119 worker/runtime API/Library finalize gaps.

[COMPLETED] wave-2-auto-handoff-ui — Product Detail is Auto-first while Standard Order remains available; Storyboard Review can create/resume HyperFrames preview from product/run context and saves only durable QA-passed outputs.

[COMPLETED] wave-3-review-convergence — Three review loops completed. Follow-up findings fixed during review: backend auto-queues HyperFrames preview after Storyboard Review evidence is ready, Marketplace Auto Review scheduler ignores HyperFrames outbox job types, and Library finalize no longer fabricates output hash/QA/runtime metadata.

## Verification

- `npm --prefix apps/web test -- --run server/jobs/__tests__/marketplaceAutoReviewJob.test.ts server/services/__tests__/hyperframesRenderService.test.ts server/services/__tests__/hyperframesLibraryFinalizeService.test.ts server/services/__tests__/hyperframesRuntimeApiService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx` — passed, 6 files / 18 tests.
- `npm --prefix apps/web run check` — passed.
- `npm --prefix apps/web run e2e:marketplace-hyperframes` — passed for the active fixture gate, 1 passed / 3 skipped by the existing Playwright spec.
- Placeholder scan for `hf_output_hash`, hard-coded runtime `qaStatus: "passed" as const`, and fabricated HyperFrames hash prefixes — clean outside test fixtures.

## Worktree Note

The repository was already heavily dirty before this Feature 119 remediation. The previous `orchestra/` session was archived under `orchestra/archive/2026-06-04T08-49-26Z/`. Current edits must stay scoped to Feature 119 runtime/UI/tests/docs and must not revert unrelated files.

## 2026-06-04 Follow-Up Remediation

[COMPLETED] product-detail-render-resume — Product Detail now resumes backend-queued HyperFrames render jobs from the active/listed Auto Review run metadata/result state and polls with both render job and run context.

[COMPLETED] mediastudio-handoff-contract — MediaStudio render-to-Library session helpers were centralized and Product Detail / Storyboard Review now upsert pending HyperFrames final-output sessions automatically, then remove them after Library save.

[COMPLETED] runtime-and-finalize-projection — Runtime-deferred worker errors map to transient failures before permanent QA/template policy matching, and Library finalize returns saved-to-library projections with library output refs, artifact refs, storage refs, and content hashes intact.

[COMPLETED] e2e-fixture-gate — Marketplace HyperFrames Playwright fixture gate no longer has skipped tests; Product Detail, Storyboard Review, and MediaStudio contracts are active fixture assertions.

### Verification

- `npm --prefix apps/web test -- --run server/services/__tests__/hyperframesRenderService.test.ts server/services/__tests__/hyperframesLibraryFinalizeService.test.ts client/src/lib/mediaStudioRenderLibrarySessions.test.ts` — passed, 3 files / 9 tests.
- `npm --prefix apps/web test -- --run server/jobs/__tests__/marketplaceAutoReviewJob.test.ts server/services/__tests__/marketplaceAutoReviewService.test.ts server/services/__tests__/hyperframesRenderService.test.ts server/services/__tests__/hyperframesLibraryFinalizeService.test.ts server/services/__tests__/hyperframesRuntimeApiService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx client/src/components/marketplaceCapture/__tests__/HyperframesStoryboardReviewPanel.test.tsx client/src/lib/mediaStudioRenderLibrarySessions.test.ts` — passed, 9 files / 139 tests.
- `npm --prefix apps/web run check` — passed.
- `npm --prefix apps/web run e2e:marketplace-hyperframes` — passed, 4 tests / 0 skipped.
- `npm --prefix apps/web run hyperframes:dependency-audit` — partial by design because HyperFrames runtime packages remain deferred.
- `npm --prefix apps/web run hyperframes:doctor` — runtime and Chrome unavailable/deferred; Node, FFmpeg/FFprobe, temp workspace, storage, and secret redaction checks passed.
- `git diff --check -- <touched Feature 119 files>` — passed.
