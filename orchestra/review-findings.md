# Review Findings

## Round 1 - Findings Closed
- Scope reviewed: HyperFrames runtime finalize, Marketplace Capture render panel, Auto Storyboard Review plan CTA, production rollout route evidence, Video Editor mobile controls, implementation artifacts.
- Fixed: Library finalization now selects a durable final/library video output matched to a library-retained MP4/WebM artifact, so snapshot refs cannot hijack idempotency or output URL selection.
- Fixed: Product Detail render panel now opens the preferred final/library-ready output instead of blindly using `outputRefs[0]`.
- Fixed: blocked Auto plans whose backend primary action is `use_standard_order` now route the primary CTA to Standard Order and avoid duplicate Standard buttons.
- Fixed: rollout route evidence now requires screenshot files to be non-empty PNGs, not merely present on disk.
- Fixed: Video Editor mobile toolbar/preview controls now expose explicit labels for interactive horizontal-scroll controls, and e2e evidence asserts no interactive scrollable controls are missing `aria-label`.
- Fixed: Feature 119 deep-implement config now uses the repo's Node/Vitest test command instead of `uv run pytest`.
- Fixed: `orchestra/plan.md` now describes the active HyperFrames remediation task instead of an unrelated Media Studio queue task.

## Round 2 - Convergence Check
- Finding fixed in this round: route evidence overflow audit previously sliced the first 30 overflow elements before classifying interactive/non-interactive controls, which could hide later missing-label controls.
- Fix applied: the audit now classifies all overflow elements first, records full counts, and slices only the report arrays.
- Result: no new material findings after rerunning TypeScript, e2e, rollout gates, and screenshot/evidence sanity checks.

## Round 3 - Production Findings Remediation
- Finding fixed: rollout route evidence could pass with `screenshots: []` or with only one screenshot listed. The CLI gate now requires all five route screenshot names and validates each PNG.
- Finding fixed: `resume_auto_storyboard_review` could route through the create mutation. The plan now exposes `activeRunId`, Product Detail opens the existing run status panel without starting a duplicate, and the server start API returns the active run when called with a resume plan.
- Gates rerun: focused Vitest, TypeScript check, Marketplace HyperFrames e2e, production rollout gate, stale-evidence rollout gate, and an explicit no-screenshot temp-evidence rollout check.
- Result: no new material findings after rerunning the stale gates.

## Round 4 - Evidence Gate Hardening
- Finding fixed: the production rollout gate could pass route evidence with `overflowByRoute: {}`. The CLI gate now requires all five route overflow measurements: Product Detail, Storyboard Review, MediaStudio, Document Management, and Video Editor.
- Finding fixed: the rollout gate trusted report arrays without enforcing route-level count fields. The CLI gate now requires `overflowElementCount` and `scrollableInteractiveWithoutAriaLabelCount` to be exactly zero and requires the corresponding report arrays to be empty.
- Finding fixed: route-level e2e evidence only wrote overflow measurements for the three handoff routes. The route evidence now records overflow checks for all five required routes before the gate can pass.
- Finding fixed: the resume API fallback returned a synthetic active run with hard-coded `status: "running"`. It now loads the actual serialized active run and includes the current render projection when the run carries a HyperFrames render job id.
- Gates rerun: focused Vitest for the rollout gate and runtime API resume fallback, TypeScript check, explicit empty-overflow temp-evidence gate, Marketplace HyperFrames e2e, production rollout gate, and stale-evidence rollout gate.
- Result: no new material findings after rerunning the hardened route gates.

## Round 5 - Screenshot Decode And Per-Route UI Audit
- Finding fixed: the production rollout gate could pass signature-only fake PNG files. The CLI gate now parses PNG chunks, requires valid CRCs, requires IHDR/IDAT/IEND, validates screenshot width, and requires full-page screenshot height to be at least the viewport height.
- Finding fixed: route evidence only aggregated element-level overflow/a11y counts from the final route. The e2e route evidence now writes `overflowAuditByRoute` for Product Detail, Storyboard Review, MediaStudio, Document Management, and Video Editor, and the CLI gate requires the top-level counts to match the per-route aggregate.
- Finding fixed: Document Management scope tabs inside a horizontal tab row lacked explicit `aria-label` values. The shared `DocumentLibraryTabs` component now labels and exposes pressed state for those scope buttons.
- Gates rerun: rollout gate Vitest, TypeScript check, Marketplace HyperFrames e2e, production rollout gate, stale-evidence rollout gate, and an explicit signature-only fake-PNG temp-evidence gate.
- Result: seeded route evidence passes the hardened production gate; only external dependency/runtime/golden readiness blockers remain.

## Round 6 - Video Editor Handoff And Repair Contract Closure
- Finding fixed: route evidence linked to `/video-editor` without proving a finalized Library video opens on the timeline. The handoff now supports `/video-editor?libraryItemId=1`, fetches `library.getItem`, maps a ready video item into a normal Video Editor asset, and auto-adds `final.mp4` to the timeline while preserving manual Media Library/Standard Order flows.
- Finding fixed: `repairHyperframesRenderJob` parsed service output but the tRPC procedure missed the runtime output schema. The router now applies `RepairHyperframesRenderJobOutputSchema`, and the router contract test asserts the schema is wired.
- Finding fixed: Auto Storyboard Review summary exposed raw template ids to users. It now shows the auto-selected copy instead.
- Finding fixed: the Video Editor mobile header could expose a scrollable Projects button without an explicit accessible label after the auto-imported clip made the editor route part of required evidence. Header action buttons now include stable `aria-label` values.
- Gates rerun: focused Vitest, TypeScript check, Marketplace HyperFrames e2e, production rollout gate, stale-evidence rollout gate, and diff whitespace checks.
- Result: Video Editor route evidence now records `library.getItem`, `timelineClipCount: 1`, and `video clip: final.mp4`; no new material findings remain in scope.

## Round 7 - Production UI/UX Completion
- Finding fixed: Media History showed Library and Share actions but did not expose a user-facing Video Editor handoff for saved video Library items. Gallery, mobile list, table actions, and the detail dialog now expose "Open in Video Editor" for video tasks with a Library item and route to `/video-editor?libraryItemId=...`.
- Finding fixed: the Video Editor Library import was a one-shot guard that could mark an item as loaded before a successful timeline insert. The import state now distinguishes `loading` from `completed`, resets on invalid item, error, or cancelled in-flight work, and only marks completed after the clip is added to the timeline.
- Finding fixed: Product Detail showed full raw product JSON directly on the production-facing page. The payload is now hidden behind a collapsed Product diagnostics disclosure.
- Finding fixed: Storyboard Review's no-selection empty state consumed too much mobile vertical space. The empty state is now shorter on mobile while preserving desktop centering.
- Gates rerun: focused Vitest for Video Editor handoff and Media History helper, TypeScript check, Marketplace HyperFrames e2e from a fresh web server, production rollout gate, stale-evidence rollout gate, and diff whitespace checks.
- Result: Marketplace HyperFrames e2e passes 10/10 with refreshed route evidence; Video Editor route evidence records `library.getItem`, `timelineClipCount: 1`, and `video clip: final.mp4`.

## Round 8 - Production Gate Evidence Closure
- Finding fixed: `hyperframes:doctor` previously accepted any Node 20/22 runtime and reported fonts as `ok` without checking the environment. The doctor now enforces the SmartSpecPro engine range `>=20.20.0 <21 || >=22.22.0`, reports the required range, checks fontconfig plus Thai-capable render font visibility, and exits non-zero when the local smoke runtime is blocked.
- Finding fixed: Media History product/run-only route evidence was asserted in E2E but shared the same screenshot/audit key as source-filtered Media History. The route evidence now writes and gates a separate `mediaHistoryProductRun` audit and `route-media-history-product-run-390x844.png` screenshot.
- Finding fixed: closeout docs and review notes could imply production readiness had passed when the correct state was expected-blocked. Docs now separate passing smoke/test gates, including `hyperframes:doctor` returning `mvp_smoke_ready`, from the production rollout gate that should fail closed until external runtime proof is approved.
- Result: current route evidence has 7 authenticated routes, 7 validated screenshots, per-route overflow/a11y audits for all required surfaces, and production rollout remains blocked only by external dependency/runtime/golden readiness.

## Round 9 - Mobile Auto UX And Evidence Freshness Closure
- Finding fixed: MediaStudio mobile workspace and right-panel tabs could display truncated labels even though the auto HyperFrames flow should require minimal user adjustment. The route now uses short mobile labels with full accessible names and keeps Standard Order/normal MediaStudio tabs intact.
- Finding fixed: the E2E label-fit guard could pass with an empty locator and only checked the right-panel tabs. It now requires the workspace and sidebar tablists to exist, verifies tab counts, checks only visible labels for overflow/truncate classes, and asserts full accessible names remain available.
- Finding fixed: `dev:no-watch` serves static built assets, so local route evidence can accidentally reuse stale UI if the app is not rebuilt and the port 3000 server is not restarted. The runbook now requires build plus server restart before refreshing Marketplace HyperFrames route evidence.
- Result: refreshed MediaStudio mobile evidence shows `Prod`, `Shot`, `History/Library/Market` style short labels without ellipsis, route audit remains at 0 overflow and 0 missing scrollable interactive labels, and production rollout remains intentionally blocked by external dependency/runtime/golden readiness.

## Round 10 - Product Detail Auto-First And Router Coverage Closure
- Finding fixed: Product Detail mobile first viewport could still show product summary before the Auto Storyboard Review action. The Auto Storyboard Review plan, launch mode switch, render status, and primary CTA now render immediately after the route actions, before product summary, with an explicit first-action region for route evidence.
- Finding fixed: moving Auto first could make the Standard Order path feel secondary or lost. The original Standard Order/custom controls remain available as a separate section with the existing output, frame strategy, model, shot count, audio, overlay, anchor, and run status controls intact.
- Finding fixed: Storyboard Review-ready HyperFrames preview queueing lacked direct regression coverage. A new service test proves preview queue metadata/run updates when frame evidence exists and proves the run continues without queue/update when no Storyboard Review frame evidence exists.
- Finding fixed: the app router refactor touched broad routing surface without a focused compatibility guard. A new appRouter shape test asserts critical top-level routers plus Marketplace Capture standard/HyperFrames, auth, gallery, and AI procedures remain addressable.
- Gates run: focused Vitest for Marketplace Auto Review service, Marketplace Capture HyperFrames router, and appRouter shape; full TypeScript check; production web build; diff whitespace checks.
- Browser note: `PLAYWRIGHT_SKIP_WEB_SERVER=1 npm --prefix apps/web run e2e:marketplace-hyperframes` passed 9/10 and failed only on the newly-added first-action region because the existing port 3000 server was still serving the pre-patch Product Detail bundle. The server was intentionally not restarted or killed per the active port 3000 instruction.

## Gates Run After Fixes
- PASS: `git diff --check`
- PASS: `git diff --cached --check`
- PASS: `npm --prefix apps/web run test -- scripts/__tests__/hyperframes-production-rollout-gate.test.ts server/services/__tests__/hyperframesRuntimeApiResume.test.ts server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- PASS: `npm --prefix apps/web run test -- client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx client/src/components/marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.test.tsx scripts/__tests__/hyperframes-production-rollout-gate.test.ts client/src/lib/mediaStudioRenderLibrarySessions.test.ts server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- PASS: `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- PASS: `npm --prefix apps/web run e2e:marketplace-hyperframes`
- PASS: `npm --prefix apps/web run hyperframes:production-rollout-gate` verified fresh seeded route evidence; production remains blocked only by external package/runtime/golden readiness.
- PASS: `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=1 MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED=true npm --prefix apps/web run hyperframes:production-rollout-gate` includes `seeded_route_e2e_missing`.
- PASS: explicit temp evidence with `overflowByRoute: {}` is blocked with `seeded_route_e2e_missing`.
- PASS: explicit temp evidence with signature-only fake PNG screenshots is blocked with `seeded_route_e2e_missing`.
- PASS: `npm --prefix apps/web run hyperframes:fixture-render`
- PASS: `npm --prefix apps/web run hyperframes:snapshot-test`
- PASS: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 corepack pnpm exec vitest run client/src/lib/videoEditorLibraryHandoff.test.ts client/src/components/marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.test.tsx scripts/__tests__/hyperframes-production-rollout-gate.test.ts server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts`
- PASS: `NODE_OPTIONS=--max-old-space-size=8192 corepack pnpm check`
- PASS: `corepack pnpm e2e:marketplace-hyperframes`
- PASS: `corepack pnpm hyperframes:production-rollout-gate` verified fresh seeded route evidence; production remains blocked only by external package/runtime/golden readiness.
- PASS: `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=1 MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED=true corepack pnpm hyperframes:production-rollout-gate` includes `seeded_route_e2e_missing`.
- PASS: `corepack pnpm exec vitest run client/src/lib/videoEditorLibraryHandoff.test.ts client/src/pages/MediaHistory.compile.test.tsx`
- PASS: `NODE_OPTIONS=--max-old-space-size=8192 corepack pnpm check`
- PASS: `corepack pnpm e2e:marketplace-hyperframes` after forcing a fresh dev server instead of reusing a stale no-watch server.
- PASS: `corepack pnpm hyperframes:production-rollout-gate` verified fresh route evidence; production remains blocked only by external package/runtime/golden readiness.
- PASS: `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=1 MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED=true corepack pnpm hyperframes:production-rollout-gate` includes `seeded_route_e2e_missing`.

## Evidence Notes
- Route evidence generated at `2026-06-05T06:26:24.039Z`.
- Route screenshots: 7/7 files pass PNG signature, chunk, CRC, IDAT/IEND, width, and minimum viewport-height validation.
- Route evidence: 0 console errors, 0 page errors, 0 non-intentional overflow elements.
- Route overflow keys present: Product Detail, Storyboard Review, MediaStudio, Media History source context, Media History product/run context, Document Management, and Video Editor.
- Per-route element audit keys present: Product Detail, Storyboard Review, MediaStudio, Media History source context, Media History product/run context, Document Management, and Video Editor.
- Document Management evidence: 4 interactive horizontal-scroll controls, 0 missing `aria-label`.
- Video Editor evidence: 16 interactive horizontal-scroll controls, 0 missing `aria-label`; route debug records `timelineClipCount: 1` and `video clip: final.mp4`.

## Residual External Blockers
- Production producer runtime still intentionally blocks install/readiness until dependency package approval, pinned versions, license/provenance/native postinstall review, worker image/font/Chrome/FFmpeg readiness, and golden snapshots are completed.

## Round 11 - Finishable Evidence Lane Closure
- Finding fixed: Product Detail route evidence could still pass without proving
  the Auto Storyboard Review first action appears before Product Summary in the
  first mobile viewport. The route E2E now records
  `productDetailFirstViewport`, and the rollout gate rejects missing, offscreen,
  or inverted Product Detail ordering proof.
- Finding fixed: local evidence refreshes were still coupled to destructive
  port 3000 behavior. Dev scripts no longer kill port 3000, Playwright defaults
  to a configurable alternate port (`PLAYWRIGHT_E2E_PORT`, default 3017), and
  docs/runbook describe the no-kill lane plus `PLAYWRIGHT_BASE_URL` override.
- Finding fixed: `mvpSmokeReady` could be confused with production Chrome/FFmpeg
  readiness. The rollout gate now reports `mvpSmokeReady` for bundle plus fresh
  seeded-route smoke proof, and `productionRuntimePrerequisitesReady` for
  separate Chrome/FFmpeg producer prerequisites.
- Visual evidence: `route-product-detail-390x844.png` now shows Auto Storyboard
  Review and Standard Order before Product Summary. JSON proof records
  `autoFirstActionTop: 116`, `autoCtaTop: 506`, `standardModeTop: 296`, and
  `productSummaryTop: 1102` in an 844px viewport.
- Gates rerun: focused Vitest (8 files / 162 tests), TypeScript check,
  production web build, Marketplace HyperFrames E2E on port 3017, doctor,
  fixture-render, snapshot-test, production rollout gate, stale-evidence
  rollout gate, and diff whitespace checks.
- Current result: MVP smoke/evidence lane is complete and reproducible without
  touching port 3000. Production rollout remains intentionally blocked only by
  external package, supply-chain, worker-image, font, Chrome, FFmpeg, and golden
  snapshot approvals.

## Round 12 - Tenant Config Enablement Closure
- Finding fixed: normal Marketplace HyperFrames rollout still depended on
  environment edits even though SmartSpecPro already has an Admin Tenant Feature
  Flags control plane. The shared flag contract now includes four
  tenant-scoped HyperFrames flags, all default off and visible in Admin Tenant
  Feature Flags under `Media Production & HyperFrames`.
- Finding fixed: runtime gates could diverge between Product Detail, preview
  queueing, runtime API, delegated operator controls, and the render worker.
  Those paths now resolve tenant feature access through tenant config; env vars
  remain only global safety/runtime guards or explicit-false legacy kill
  switches.
- Finding fixed: the render worker respected the worker-specific env kill
  switch but not the global HyperFrames disabled flags. Worker execution now
  stops on `MARKETPLACE_HYPERFRAMES_DISABLED=true` and legacy
  `MARKETPLACE_HYPERFRAMES_ENABLED=false` before tenant queue flags are read.
- Finding fixed: internal feature-flag overrides could theoretically enable
  access past tenant config/global kill switches. Overrides now only reduce the
  computed tenant-config access; they cannot bypass disabled tenant flags or
  global safety kills.
- Finding fixed: the Admin Feature Flags grouping test exposed existing Gemini
  Omni flags that were not categorized. A Gemini Omni group was added so the
  Admin UI coverage test now proves every declared tenant flag is grouped.
- Finding fixed: dependency audit script output still inferred default-off from
  `MARKETPLACE_HYPERFRAMES_ENABLED`. The CLI audit now always reports tenant
  flags default off and documents Admin Tenant Feature Flags as the rollout
  path.
- Gates rerun: focused Vitest (9 files / 165 tests), TypeScript check,
  dependency audit, doctor, production rollout gate with complete evidence env,
  and focused rollout/dependency/Admin flag tests (4 files / 25 tests).
- Result: HyperFrames can now be enabled by admins from Tenant config without
  editing environment files, while the original Standard Order path remains
  intact and HyperFrames still fails closed for disabled tenants.

## Round 13 - Advanced Auto Override Closure

- Finding fixed: runtime plan/start schemas accepted arbitrary override records.
  They now accept only whitelisted optional Auto controls: platform preset,
  quality, audio policy, text policy, shot count, frame strategy, and image
  model.
- Finding fixed: invalid optional override fields could drop otherwise valid
  fields during normalization. Normalization now parses each field
  independently, keeps valid values, ignores unsafe unknown keys, and leaves
  template/render-engine control backend-managed.
- Finding fixed: Auto plan estimates did not reflect optional advanced choices.
  The auto plan service now builds credit estimates from effective defaults,
  including platform, quality, shot count, and frame strategy complexity.
- Finding fixed: service coverage did not prove start uses override-derived plan
  defaults. Runtime resume/start tests now assert start mutation calls the
  existing Standard Auto Review starter with effective plan defaults.
- Finding fixed: Advanced Auto UI used English labels in Thai flows and only
  exposed reset after server diff state. The component now localizes option
  labels and exposes `Use auto plan` immediately when local optional overrides
  are active.
- Finding fixed: final UI polish found Thai option text and label letter
  spacing that did not match production UI guidance. Advanced Auto labels now
  avoid custom letter spacing, use localized accessible labels, and localize the
  high-quality/vertical format choices in Thai.
- Gates rerun: focused Vitest (7 files / 33 tests), Marketplace Capture
  component suite (6 files / 25 tests), TypeScript check, Marketplace
  HyperFrames route E2E on port 3017 (10 tests), production rollout gate with
  fresh route evidence, `git diff --check`, and `git diff --cached --check`.
- Result: Advanced Auto remains optional and resettable, Auto stays one-click by
  default, unsafe customization remains blocked by contract, and Standard Order
  remains on the existing flow.

## Round 14 - Advanced Auto Production Polish Closure

- Finding fixed: Auto primary action labels still came from backend English
  strings on Thai Product Detail. The summary component now maps action IDs to
  locale copy for start, resume, Standard fallback, and blocker review.
- Finding fixed: Advanced Auto local changes could briefly show "no overrides"
  while the server plan was refetching. The advanced component now shows a
  pending auto-plan update state and names the locally changed fields.
- Finding fixed: route-level coverage did not exercise the Advanced Auto user
  workflow. Marketplace HyperFrames E2E now opens Advanced Auto, changes useful
  options, resets to Auto, starts with overrides, verifies idempotency payload,
  and keeps Standard Order visible.
- Finding fixed: `startAutoStoryboardReview.idempotencyKey` was accepted by the
  schema but not used. The router/service now pass it through, and the
  Marketplace Auto Review run service stores it as the run idempotency key and
  returns the existing same-product run on duplicate caller keys.
- Gates rerun: focused Vitest (4 files / 16 tests), Marketplace Capture
  component suite (6 files / 25 tests), TypeScript check, Marketplace
  HyperFrames route E2E on port 3017 (11 tests), production rollout gate,
  `git diff --check`, and `git diff --cached --check`.
- Result: all findings from the latest review are closed with fresh
  verification; Auto remains auto-first, Advanced remains optional, and Standard
  Order remains preserved.

## Round 15 - Production Edge Closure

- Finding fixed: Advanced Auto could send a stale `expectedPlanHash` if the user
  changed optional overrides and clicked Start before the plan refetch completed.
  Product Detail now disables the Auto CTA with localized updating copy until
  the plan defaults match the latest local overrides, and the start callback
  refuses to mutate while that guard is active.
- Finding fixed: a retry could fail stale-plan after an active run was created
  between the original plan read and the repeated start request. Runtime start
  now returns the active same-product HyperFrames Auto run when the current plan
  is in resume state, even if the caller hash is from the previous start plan.
- Finding fixed: any active Marketplace Auto Review run could be labeled as
  `resume_auto_storyboard_review`. The auto-plan service now treats only
  `hf-auto-start:` idempotency-key runs as HyperFrames Auto resume candidates;
  active Standard Order runs produce an `active_standard_run` blocker and keep
  Standard Order as the safe action.
- Finding fixed: `imageModel` was allowed by the public Auto override contract
  but not exposed in Advanced Auto UI. The collapsed optional controls now
  include localized image-model selection, and choosing the current default
  clears the local override.
- Finding fixed: Product Detail Auto plan error actions and launch-mode
  accessible labels still had hard-coded English. These now come from the
  HyperFrames UI copy map, with E2E selectors updated for Thai/English.
- Gates rerun: focused Vitest (7 files / 30 tests), Marketplace Capture
  component suite (6 files / 27 tests), TypeScript check, Marketplace
  HyperFrames route E2E on port 3017 (11 tests), production rollout gate,
  `git diff --check`, and `git diff --cached --check`.
- Result: the five production review findings are closed. Auto remains
  auto-first, Advanced remains optional, retries are safer, active Standard runs
  are no longer mislabeled as Auto resume, and localized UI coverage is current.

## Round 16 - Production Convergence Follow-up Closure

- Finding fixed: docs and implementation summary listed Advanced Auto optional
  controls but omitted image model. The user docs, runbook rollout check,
  implementation summary, and spec UI-test contract now consistently include
  image model with the other optional Advanced Auto controls.
- Finding fixed: active HyperFrames Auto detection depended only on the new
  `hf-auto-start:` idempotency prefix. The auto-plan service now also recognizes
  legacy HyperFrames Auto runs from `renderJobId`, metadata
  `hyperframesAutoPreview.renderJobId`, result
  `hyperframesAutoPreview.renderJobId`, result `hyperframesRenderJobId`, and
  result `render.renderJobId`.
- Finding fixed: route E2E did not prove active Standard Order remains Standard
  when Auto is enabled. A new Product Detail route test now renders an
  `active_standard_run` blocker, clicks the Standard fallback, and verifies no
  `startAutoStoryboardReview` call is made.
- Finding fixed: the Auto plan update state was only visible button text. The
  plan summary now emits a polite screen-reader status while the Auto plan is
  updating, and component coverage asserts it.
- Gates rerun: focused Vitest (7 files / 32 tests), Marketplace Capture
  component suite (6 files / 27 tests), TypeScript check, Marketplace
  HyperFrames route E2E on port 3017 (12 tests), production rollout gate,
  `git diff --check`, and `git diff --cached --check`.
- Result: the latest convergence findings are closed. Auto remains one-click by
  default, Standard Order remains independently usable, legacy Auto runs resume
  safely, and the user-facing docs match the shipped UI.

## Round 17 - Summary Projection And Reset Guard Closure

- Finding fixed: live Product Detail auto-plan reads could miss legacy Auto runs
  that stored HyperFrames render state only in
  `metadataJson.hyperframesAutoPreview` because summary serialization stripped
  that field. Summary metadata now keeps a sanitized preview marker
  (`renderJobId`, `status`, `queuedAt`) and still omits raw/private render data.
- Finding fixed: tests did not cover the real summarized-run path. Added
  `hyperframesAutoPlanServiceProjection.test.ts` to exercise
  `getHyperframesAutoStoryboardReviewPlan` through
  `listMarketplaceAutoReviewRuns(summary: true)`.
- Finding fixed: resetting Advanced Auto to the base plan could briefly allow
  Start against a stale override plan. Product Detail now treats empty overrides
  as ready only when the current plan has no override diff.
- Gates rerun: focused Vitest (5 files / 140 tests), Marketplace Capture
  component suite (6 files / 27 tests), TypeScript check, Marketplace
  HyperFrames route E2E on port 3017 (12 tests), production rollout gate,
  `git diff --check`, and `git diff --cached --check`.
- Result: all three latest review findings are closed. Legacy metadata-only
  Auto runs are visible to the live auto-plan path, reset-to-auto is safer, and
  no port-3000 process was touched.

## Round 18 - Production Completeness Review

- Finding: summarized Marketplace Auto Review runs now sanitize
  `metadataJson.hyperframesAutoPreview`, but the summary serializer still spreads
  the original run before overriding metadata and therefore keeps the original
  `resultJson` payload. Current HyperFrames paths mostly store safe IDs and
  normal output URLs there, but legacy or edge payloads can still carry
  `result.render` / `hyperframesAutoPreview` objects with raw HTML, signed URLs,
  private storage keys, or worker details. Recommended fix: add a summary-safe
  `resultJson` projection that preserves only storyboard IDs, frame URL lists
  needed by current UI, render job IDs, Library IDs, and safe media-history
  source markers; add regression coverage that `includeHeavyMetadata: false`
  omits private result payloads across the full serialized object.
- Finding: the route E2E mock keeps `planHash: "hf_plan_route"` even when
  Advanced Auto overrides change the returned defaults. This proves payload
  plumbing, but it does not prove the real stale-plan guard, override refetch
  guard, or idempotency key update behavior. Recommended fix: derive the mocked
  plan hash from the parsed overrides and assert the Start CTA stays disabled
  until the override-specific plan has loaded, then starts with the updated hash.
- Finding: Advanced Auto clears a local field when the selected value matches
  the current effective plan defaults. After a server plan already reflects an
  override, selecting the base auto default value can leave a semantically empty
  local override active and show pending/reset UI even though the server diff is
  empty. Recommended fix: normalize/prune local overrides against the base auto
  defaults or clear local keys when the server `overrideDiff.fields` no longer
  contains them; add component and route coverage for field-level return-to-auto
  without pressing global reset.
- Finding: the Auto plan summary section still has a hard-coded English
  `aria-label`. It does not break visible Thai UI or axe, but it should use the
  same locale copy map for accessibility parity.
- Gates rerun: focused Vitest (5 files / 140 tests), Marketplace Capture
  component suite (6 files / 27 tests), TypeScript check, Marketplace
  HyperFrames route E2E on port 3017 (12 tests), production rollout gate,
  `git diff --check`, and `git diff --cached --check`.
- Result: implementation is broadly complete and production-gated for the
  current slice. Remaining items are hardening/polish issues around result
  payload redaction, test fidelity for override plan hashes, field-level
  Advanced Auto reset UX, and localized accessibility copy.

## Round 19 - Round 18 Findings Fixed

- Finding fixed: summary responses no longer keep full `resultJson` when
  `includeHeavyMetadata: false`. `serializeRun` now emits a summary-safe
  `resultJson` projection that preserves only current UI needs and redacts raw
  HTML, signed URLs, private storage keys, worker logs, output refs, and private
  package payloads. Regression coverage checks the full serialized object for
  private result markers.
- Finding fixed: route E2E no longer uses a constant Auto plan hash for all
  overrides. The mock now derives `planHash` and `overrideDiff` from parsed
  overrides, delays override-plan responses in the Advanced Auto route test, and
  asserts the Auto CTA is disabled before starting with the override-specific
  `expectedPlanHash` and `hf-auto-start:` idempotency key.
- Finding fixed: field-level return-to-auto no longer leaves semantically empty
  local overrides active. Advanced Auto prunes base auto default values, clears
  stale local defaults, and has component plus route coverage for returning a
  single field to the base auto value without pressing global reset.
- Finding fixed: Auto plan summary accessibility label now uses the localized
  HyperFrames UI copy map, with Thai coverage.
- Gates rerun: focused Vitest (3 files / 134 tests), focused
  HyperFrames/Marketplace Capture suite (9 files / 158 tests), TypeScript
  check, Marketplace HyperFrames route E2E on port 3017 (12 tests), production
  rollout gate, `git diff --check`, and `git diff --cached --check`.
- Result: all Round 18 review findings are closed. Auto remains auto-first,
  Standard Order remains preserved, summary payloads are safer, and route
  evidence now exercises override-specific plan hashes.

## Round 20 - Production Hardening Findings Fixed

- Finding fixed: user-visible Marketplace Auto Review output links no longer
  accept signed/private HTTPS URLs just because the scheme is HTTPS. The shared
  URL predicate now rejects credentials, signed query markers, private/storage
  path markers, raw HTML, and worker-log URL shapes; timeline output links and
  summary result frame URL projection use the same predicate.
- Finding fixed: `apiProjection.automation` no longer passes raw automation
  metadata through to Product Detail. It now exposes only safe allowlisted
  statuses, audit IDs, counts, and policy labels needed by the UI chips, with
  regression coverage for private tokens, provider payloads, signed URLs,
  storage keys, and worker logs.
- Finding fixed: base Auto override defaults are no longer duplicated between
  backend, Advanced Auto UI, and route E2E mocks. The shared HyperFrames
  auto-plan contract exports the base override value map, and a contract test
  proves it stays in sync with `buildDefaultHyperframesAutoPlanDefaults`.
- Finding fixed: route E2E override parsing no longer relies on request-body
  substring sniffing. It now parses JSON/query fragments from the tRPC request
  shape and validates recognized override fields through
  `HyperframesAutoPlanOverrideInputSchema`.
- Gates rerun: focused Vitest (5 files / 168 tests), focused
  HyperFrames/Marketplace Capture suite (12 files / 197 tests), TypeScript
  check, Marketplace HyperFrames route E2E on port 3017 (12 tests), production
  rollout gate, `git diff --check`, and `git diff --cached --check`.
- Result: the latest production hardening findings are closed. Summary payloads,
  timeline links, automation chips, reset-to-auto behavior, and route evidence
  now share safer contracts while preserving the Auto-first and Standard Order
  dual-path UX.
