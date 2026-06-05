[COMPLETE] wave-1-stale-queue-reconciliation - Fixed stale Media Studio generation queue tasks by enforcing active task age checks for tracked history entries and local queue entries.

## Fresh Start Notes
- SocratiCode active: yes, green index.
- Existing orchestra session without snapshot archived under `orchestra/archive/2026-06-04T23-54-57Z/`.
- Existing unrelated dirty work was present before this task and left untouched.

## Verification
- PASS: `cd apps/web && corepack pnpm test client/src/lib/mediaStudioGenerationQueue.test.ts`
- PASS: `cd apps/web && corepack pnpm check`
- Note: both commands warned that local Node is `v20.19.2`, while package engines require `>=20.20.0 <21 || >=22.22.0`.

## 2026-06-05 HyperFrames Production Polish

- Fixed user retry/cancel false-success races by throwing `CONFLICT` when the
  optimistic outbox mutation updates no rows.
- Added CLI rollout-gate route evidence freshness enforcement and direct script
  tests for fresh and stale seeded route evidence; manual seeded-route env flags
  no longer bypass missing or stale route evidence.
- Improved dense Video Editor toolbar/header/preview-control horizontal-scroll
  affordance while keeping route-level overflow evidence clean.
- Updated HyperFrames docs, runbook, and implementation summary with the route
  evidence freshness window.

## Verification

- PASS: `git diff --check`
- PASS: `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `npm --prefix apps/web run test -- server/services/__tests__/hyperframesRenderService.test.ts client/src/lib/marketplaceHyperframesUiState.test.ts client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx client/src/components/marketplaceCapture/__tests__/HyperframesStoryboardReviewPanel.test.tsx shared/hyperframes/__tests__/runtimeApiSchemas.test.ts server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts server/services/__tests__/hyperframesRuntimeApiService.test.ts server/services/__tests__/hyperframesProductionRolloutGate.test.ts scripts/__tests__/hyperframes-production-rollout-gate.test.ts` (9 files / 51 tests)
- PASS: `npm --prefix apps/web run e2e:marketplace-hyperframes`
- PASS: `npm --prefix apps/web run hyperframes:production-rollout-gate` remains
  blocked only by external package/runtime/golden readiness; seeded route
  evidence is fresh.
- PASS: `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=1 MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED=true npm --prefix apps/web run hyperframes:production-rollout-gate` includes
  `seeded_route_e2e_missing`, proving stale evidence is rejected even with the
  old manual env flag set.

## 2026-06-05 HyperFrames Review Remediation

- Fixed final/library output selection so snapshot refs cannot be selected for
  Library finalize idempotency, payload output URL, or Product Detail Open
  Output.
- Fixed Auto Storyboard Review blocked fallback UX so backend
  `use_standard_order` primary actions invoke Standard Order directly and do
  not duplicate the Standard button.
- Hardened production route evidence to require non-empty PNG screenshots.
- Added explicit labels for Video Editor mobile horizontal-scroll controls and
  route evidence assertions for missing interactive `aria-label` values.
- Corrected Feature 119 deep-implement config and current Orchestra plan
  artifacts.

## Verification

- PASS: `git diff --check`
- PASS: `npm --prefix apps/web run test -- client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx client/src/components/marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.test.tsx scripts/__tests__/hyperframes-production-rollout-gate.test.ts client/src/lib/mediaStudioRenderLibrarySessions.test.ts server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- PASS: `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `npm --prefix apps/web run e2e:marketplace-hyperframes`
- PASS: `npm --prefix apps/web run hyperframes:production-rollout-gate`
  remains blocked only by external package/runtime/golden readiness; seeded
  route evidence is fresh and screenshot-valid.
- PASS: `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=1 MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED=true npm --prefix apps/web run hyperframes:production-rollout-gate`
  includes `seeded_route_e2e_missing`.
- PASS: `npm --prefix apps/web run hyperframes:fixture-render`
- PASS: `npm --prefix apps/web run hyperframes:snapshot-test`

## 2026-06-05 HyperFrames Mobile Evidence Closure

- Fixed MediaStudio mobile tabs to use short automatic labels while preserving
  full accessible names for workspace and right-panel tabs.
- Hardened Marketplace HyperFrames E2E to require MediaStudio tab anchors,
  exact tab counts, visible-label fit, no `truncate` classes on visible labels,
  and full accessible names.
- Documented that Marketplace HyperFrames route evidence must be collected after
  rebuilding static assets and restarting any stale port 3000 server because
  `dev:no-watch` serves the built app asset.

## Verification

- PASS: `npm --prefix apps/web test -- client/src/i18n/__tests__/mediaStudioHyperframesKeys.test.ts client/src/components/media/LibrarySearchPanel.test.ts client/src/lib/documentManagementUi.test.ts client/src/lib/libraryUi.test.ts client/src/pages/MediaHistory.compile.test.tsx client/src/lib/videoEditorLibraryHandoff.test.ts`
- PASS: `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `npm --prefix apps/web run build`
- PASS: `npm --prefix apps/web run e2e:marketplace-hyperframes`
- PASS: `npm --prefix apps/web run hyperframes:dependency-audit`
- PASS: `npm --prefix apps/web run hyperframes:fixture-render`
- PASS: `npm --prefix apps/web run hyperframes:snapshot-test`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:doctor`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:production-rollout-gate` exits 1 as expected and remains blocked by external package/runtime/golden readiness.
- PASS: `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=1 MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED=true PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:production-rollout-gate` exits 1 and includes `seeded_route_e2e_missing`.

## 2026-06-05 HyperFrames Finishable Evidence Lane

- Removed destructive port-3000 kill behavior from web dev scripts and moved
  Marketplace HyperFrames Playwright evidence to a configurable alternate port
  (`PLAYWRIGHT_E2E_PORT`, default 3017).
- Added Product Detail first-viewport ordering proof to route evidence and made
  the rollout gate require Auto Storyboard Review to appear before Product
  Summary while Standard Order remains visible in the first viewport.
- Split rollout-gate readiness output into `mvpSmokeReady` for local smoke route
  proof and `productionRuntimePrerequisitesReady` for producer Chrome/FFmpeg
  readiness.
- Updated runbook, feature docs, implementation summary, plan, and review notes
  to reflect the no-kill evidence lane and current production-blocked state.

## Verification

- PASS: focused Vitest for rollout gate, Marketplace Auto Review service,
  routers, Product Detail/Marketplace capture components, and UI state
  (8 files / 162 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run build`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes`
- PASS: Product Detail visual evidence shows Auto Storyboard Review and
  Standard Order before Product Summary; `route-evidence.json` records
  `autoFirstActionTop: 116` and `productSummaryTop: 1102`.
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:doctor`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:fixture-render`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:snapshot-test`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:production-rollout-gate` exits 1 as expected with `mvpSmokeReady: true`, no `seeded_route_e2e_missing`, and only external producer blockers.
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=1 MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED=true npm --prefix apps/web run hyperframes:production-rollout-gate` exits 1 and includes `seeded_route_e2e_missing`.

## 2026-06-05 HyperFrames Tenant Config Enablement

- Moved normal Marketplace HyperFrames rollout control from environment-file
  editing to the existing Admin Tenant Feature Flags UI.
- Added tenant flags for product-detail HyperFrames visibility, worker queueing,
  Library save, and delegated operator controls:
  `marketplaceHyperframesEnabled`, `marketplaceHyperframesWorkerEnabled`,
  `marketplaceHyperframesLibrarySaveEnabled`, and
  `marketplaceHyperframesOperatorEnabled`.
- Added the flags to Admin Tenant Feature Flags under `Media Production &
  HyperFrames`, kept the existing Standard Order/manual Marketplace Capture
  flow available, and kept HyperFrames disabled by default for every tenant.
- Updated runtime access checks across Product Detail auto-plan, HyperFrames API
  procedures, Storyboard Review auto-preview queueing, delegated operator
  procedures, and the render worker to read tenant flags. Environment values
  now act as global safety/runtime guards and legacy explicit-false kill
  switches, not the normal admin rollout mechanism.
- Hardened the render worker so `MARKETPLACE_HYPERFRAMES_DISABLED=true` and
  legacy `MARKETPLACE_HYPERFRAMES_ENABLED=false` stop worker execution before
  tenant flags are considered.
- Hardened tenant-config flag reads so internal overrides can further disable a
  path for tests or call-site context but cannot enable HyperFrames past tenant
  config or global safety kill switches.
- Updated dependency audit output, docs, runbook, and implementation summary so
  operators enable the feature through `Admin -> Tenants -> Edit Tenant ->
  Feature Flags -> Media Production & HyperFrames`.

## Verification

- PASS: SocratiCode status green, index and graph active.
- PASS: focused Vitest for tenant flags, Admin grouping, feature access, worker
  policy, dependency audit, auto-preview queueing, runtime API resume,
  Marketplace Capture operator/runtime API, and rollout script gates (9 files /
  165 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:dependency-audit`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH npm --prefix apps/web run hyperframes:doctor`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: focused Vitest for rollout gate script, dependency audit, tenant flags,
  and Admin grouping (4 files / 25 tests).

## 2026-06-05 HyperFrames Optional Auto Customization

- Added collapsed Advanced Auto controls on Product Detail for useful optional
  choices: platform format, quality, audio policy, text policy, shot count, and
  frame evidence strategy.
- Kept Auto one-click by default; no template or render-engine selector is
  exposed to normal users.
- Wired Product Detail plan query and start mutation through the same override
  payload so plan hash, displayed diff, and started run stay consistent.
- Added shared override normalization so only whitelisted safe Auto overrides
  affect defaults; unrelated or unsafe override keys are ignored.
- Preserved Standard Order controls and existing manual start behavior.

## Verification

- PASS: focused Vitest for shared auto plan overrides, runtime API schemas,
  Advanced overrides UI, Auto plan summary UI, runtime API service, and auto plan
  service (6 files / 27 tests).
- PASS: Marketplace Capture component suite, including Advanced overrides,
  launch mode, render panel, Storyboard Review panel, and operator diagnostics
  (6 files / 23 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`

## 2026-06-05 HyperFrames Advanced Auto Remediation

- Tightened runtime override schemas so only safe optional Auto fields are
  accepted by plan/start APIs.
- Made override normalization field-resilient: one invalid optional value no
  longer drops every valid override, while unknown unsafe keys remain ignored.
- Recomputed Auto credit estimates from effective override defaults so quality,
  shot count, frame strategy, and platform choices affect displayed cost.
- Added service coverage proving start mutation uses the effective plan defaults
  when optional overrides are supplied.
- Localized Advanced Auto labels/options for Thai UI and made `Use auto plan`
  appear immediately for local unsaved override changes.

## Verification

- PASS: focused Vitest for shared auto plan overrides, runtime schemas,
  Advanced overrides UI, Auto plan summary UI, runtime API service, auto plan
  service, and runtime API resume/start coverage (7 files / 33 tests).
- PASS: Marketplace Capture component suite with Advanced overrides and related
  HyperFrames panels (6 files / 25 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: `git diff --check`
- PASS: `git diff --cached --check`

## 2026-06-05 HyperFrames Summary Projection And Reset Guard Closure

- Kept sanitized `hyperframesAutoPreview` markers in Marketplace Auto Review
  summary projections so legacy metadata-only HyperFrames Auto runs can still
  be recognized by Product Detail auto-plan reads without exposing heavy
  metadata, raw HTML, or signed URLs.
- Added integration-style auto-plan coverage that exercises
  `getHyperframesAutoStoryboardReviewPlan` through a summarized active run
  carrying `metadataJson.hyperframesAutoPreview.renderJobId`.
- Tightened Product Detail reset-to-auto guarding so an empty override state
  does not count as ready while the displayed plan still has server override
  diff fields.
- Preserved initial no-plan loading behavior by only showing the
  override-refresh guard after a plan exists.

## Verification

- PASS: focused Vitest for auto plan service, summarized projection
  integration, Marketplace Auto Review serializer, Auto plan summary UI, and
  Advanced Auto UI (5 files / 140 tests).
- PASS: Marketplace Capture component suite (6 files / 27 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes` (12 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: `git diff --check`
- PASS: `git diff --cached --check`

## 2026-06-05 HyperFrames Summary Projection And Reset Race Closure

- Preserved sanitized `metadataJson.hyperframesAutoPreview` summary markers for
  Marketplace Auto Review run lists so Product Detail Auto plan detection can
  resume legacy HyperFrames Auto runs whose render job ID only lives in metadata.
- Added an auto-plan service projection regression test that exercises
  `getHyperframesAutoStoryboardReviewPlan` through the same summarized active-run
  shape used by Product Detail.
- Tightened the Advanced Auto reset guard so clearing overrides waits for a base
  plan whose `overrideDiff` is empty before allowing Start, preventing a stale
  override plan hash from being reused immediately after reset.

## Verification

- PASS: focused Vitest for auto-plan service, summarized projection integration,
  Marketplace Auto Review serializer, Auto plan summary UI, and Advanced
  overrides UI (5 files / 140 tests).
- PASS: Marketplace Capture component suite (6 files / 27 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes` (12 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: `git diff --check`
- PASS: `git diff --cached --check`

## 2026-06-05 HyperFrames Production Convergence Follow-up

- Updated docs, runbook, implementation summary, and spec UI-test contract so
  Advanced Auto optional controls consistently include image model alongside
  platform format, quality, audio policy, text policy, shot count, and frame
  evidence strategy.
- Broadened active HyperFrames Auto run detection for legacy data that carries
  `renderJobId` in run fields, metadata, or result payloads without an
  `hf-auto-start:` idempotency prefix.
- Added regression coverage proving legacy HyperFrames Auto runs resume while
  active Standard Order runs remain `active_standard_run` blockers.
- Added a screen-reader live status for Auto plan updates so the disabled
  updating CTA announces progress through `role="status"`.
- Added route-level E2E coverage proving an active Standard run is shown as a
  Standard blocker and does not call `startAutoStoryboardReview`.

## Verification

- PASS: focused Vitest for runtime schemas, shared auto plan, Advanced overrides
  UI, Auto plan summary UI, launch mode UI, auto plan service, and runtime API
  resume/start coverage (7 files / 32 tests).
- PASS: Marketplace Capture component suite (6 files / 27 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes` (12 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: `git diff --check`
- PASS: `git diff --cached --check`

## 2026-06-05 HyperFrames Advanced Auto Production Polish

- Localized Auto primary action labels in Product Detail so Thai UI no longer
  displays backend English labels for start/resume/use-standard actions.
- Added Advanced Auto local-dirty pending copy so a user sees that the auto plan
  is updating immediately after optional choices change.
- Made Advanced Auto diff field names user-facing instead of raw override keys.
- Wired `startAutoStoryboardReview.idempotencyKey` through router and runtime
  service into the Marketplace Auto Review run `idempotencyKey`; duplicate
  caller keys now return the existing same-product run instead of behaving like
  a dead contract.
- Added Product Detail E2E coverage for opening Advanced Auto, changing
  quality/shot/platform, resetting to Auto, starting with override payload, and
  preserving Standard Order visibility.

## Verification

- PASS: focused Vitest for runtime schemas, Advanced overrides UI, Auto plan
  summary UI, and runtime API resume/start idempotency coverage (4 files / 16
  tests).
- PASS: Marketplace Capture component suite (6 files / 25 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes` (11 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: `git diff --check`
- PASS: `git diff --cached --check`

## 2026-06-05 HyperFrames Advanced Auto Production Edge Closure

- Closed the override/start race by disabling the Auto primary CTA while the
  plan is refetching for local Advanced Auto overrides, and by guarding the
  start callback from firing with an old plan hash.
- Made runtime start idempotent across the active-run race: if a repeated start
  request has a stale old hash but the current plan points to an active
  same-product HyperFrames Auto run, the API returns that active run instead of
  failing stale-plan.
- Added a dedicated `active_standard_run` blocker so an active Standard Order
  run is no longer mislabeled as an Auto Storyboard Review resume.
- Kept `imageModel` as a useful Advanced Auto option and exposed it in the
  collapsed optional controls; selecting the current auto default now clears the
  local override instead of creating a false pending state.
- Localized plan-error actions and launch-mode accessible labels for Thai/English
  flows, and refreshed the route E2E mock so URL-encoded plan override requests
  behave like the real backend.

## Verification

- PASS: focused Vitest for runtime schemas, shared auto plan, Advanced overrides
  UI, Auto plan summary UI, launch mode UI, auto plan service, and runtime API
  resume/start coverage (7 files / 30 tests).
- PASS: Marketplace Capture component suite (6 files / 27 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes` (11 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: `git diff --check`
- PASS: `git diff --cached --check`

## 2026-06-05 HyperFrames Round 18 Findings Closure

- Added summary-safe `resultJson` serialization for Marketplace Auto Review
  summary responses. The projection preserves storyboard review IDs, frame URL
  lists, render job markers, Library/job IDs, and safe source/status fields while
  dropping raw HTML, signed URLs, storage keys, worker logs, output refs, and
  private package payloads.
- Tightened Advanced Auto field-level reset behavior so values that return to
  base auto defaults are pruned from local overrides instead of staying as false
  pending/reset state.
- Localized the Auto plan section `aria-label` through the HyperFrames UI copy
  map for Thai/English accessibility parity.
- Updated route E2E mock fidelity so Auto plan hashes are derived from parsed
  overrides, override diffs are represented, and the Product Detail route test
  proves the CTA stays disabled during override plan refresh before starting
  with the override-specific plan hash/idempotency key.

## Verification

- PASS: focused Vitest for Marketplace Auto Review serializer, Auto plan summary
  UI, and Advanced Auto UI (3 files / 134 tests).
- PASS: focused HyperFrames/Marketplace Capture suite (9 files / 158 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes` (12 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: `git diff --check`
- PASS: `git diff --cached --check`

## 2026-06-05 HyperFrames Production Hardening Closure

- Tightened Marketplace Auto Review user-visible URL policy so signed/private
  query markers, storage/private path markers, credentials, raw HTML, and worker
  log URL shapes are rejected by the shared output-link schema.
- Reused that URL policy in summary `resultJson` frame URL projection so legacy
  `frameUrls`, `startFrameUrls`, and `stopFrameUrls` keep only safe visible
  assets.
- Replaced raw `apiProjection.automation` pass-through with an allowlisted
  summary containing only safe statuses, IDs, counts, and policy labels needed
  by Product Detail chips.
- Moved base Auto override defaults into the shared HyperFrames auto-plan
  contract and wired Product Detail Advanced Auto plus route E2E mocks to the
  same source, preventing reset-to-auto drift when backend defaults change.
- Replaced route E2E override substring sniffing with structured JSON/query
  parsing validated by `HyperframesAutoPlanOverrideInputSchema`.

## Verification

- PASS: focused Vitest for contracts, shared auto plan, Marketplace Auto Review
  serializer, Auto plan summary UI, and Advanced Auto UI (5 files / 168 tests).
- PASS: focused HyperFrames/Marketplace Capture suite (12 files / 197 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes` (12 tests).
- PASS: `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true MARKETPLACE_HYPERFRAMES_CHROME_READY=true MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=999999999999 npm --prefix apps/web run hyperframes:production-rollout-gate`
- PASS: `git diff --check`
- PASS: `git diff --cached --check`
