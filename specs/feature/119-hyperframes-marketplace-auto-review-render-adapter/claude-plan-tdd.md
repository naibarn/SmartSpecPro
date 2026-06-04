# TDD Plan: Feature 119 HyperFrames Marketplace Auto Review Render Adapter

Write tests before implementation in each section. Use existing Vitest and Playwright patterns in `apps/web`.

## Section 01: Contracts and Runtime Schemas

- `apps/web/shared/hyperframes/__tests__/contracts.test.ts`: valid composition, provenance, launch mode, and render projections parse.
- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`: schemas reject missing identity, invalid mode, stale hashes, unsupported output mode, and mismatched idempotency keys.
- `apps/web/shared/hyperframes/__tests__/autoPlan.test.ts`: auto plan contract resolves defaults and does not rewrite Standard Order.
- `apps/web/shared/hyperframes/__tests__/featureAccess.test.ts`: hidden, disabled, enabled, blocked, and operator states parse.
- `apps/web/shared/hyperframes/__tests__/statusCopy.test.ts`: every render status and blocker has English/Thai copy coverage or copy IDs.
- Test `HyperframesChargeSummary`, `HyperframesPollingGuidance`, and
  `HyperframesRepairAction` parse valid cases, reject invalid combinations, and
  remain importable by server and client code without HyperFrames runtime imports.
- Test composition modes parse for `storyboard_motion_preview`, `product_card_explainer`, `captioned_final_composite`, and `template_qa_snapshot`.
- Test platform presets parse with versioned `generic_vertical_9_16`, `tiktok_reels_shorts_9_16`, `instagram_feed_square_1_1`, and `youtube_landscape_16_9` profiles.

## Section 02: Auto Plan and Feature Access

- `apps/web/server/services/__tests__/hyperframesAutoPlanService.test.ts`: resolves launch mode, output, frame/audio strategy, render engine, template, platform, text policy, selected assets, blockers, and primary action.
- Test reset-to-auto availability when user overrides create blockers.
- Test regulated/high-risk category requires human review before auto queue when compliance plan blocks.
- `apps/web/server/services/__tests__/hyperframesFeatureAccessService.test.ts`: permission, worker, credit, quota, Library save, template, tenant allowlist, and operator capability cases.
- Test Standard Order remains available when HyperFrames is disabled, enabled, blocked, or worker-unavailable.
- Test cost classes, estimate formula inputs, deterministic `estimatedCredits`, MVP quota limits, free-preview policy, separate credit refs, and `hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}` idempotency.

## Section 03: Template Registry and Composition Builder

- `apps/web/server/services/__tests__/hyperframesTemplateRegistry.test.ts`: rejects disabled/unapproved templates and returns default template per mode/profile.
- `apps/web/server/services/__tests__/hyperframesCompositionService.test.ts`: builds deterministic composition input from fixture run state.
- Test composition hash changes when product truth, template version, platform profile, subtitles/audio, compliance, or staged asset manifest changes.
- `apps/web/server/services/__tests__/hyperframesCompositionSanitizer.test.ts`: all product/user text is escaped and raw marketplace HTML is not executable input.
- Test Product Card Explainer requires evidence-backed copy, CTA, and disclosure policy before final output.
- Test Captioned Final Composite requires generated clips, transcript/subtitle/audio sync refs, final QA, and provenance before Library save.
- Test Template QA Snapshot produces deterministic snapshot inputs without creating durable Library media.
- Test built-in template IDs, scene requirements, lifecycle states, version bump rule, approval gates, emergency disable, and historical Library preservation.

## Section 04: Asset Staging, Security, and QA

- `apps/web/server/services/__tests__/hyperframesAssetStagingService.test.ts`: stages allowed assets and rejects private URLs, malformed URLs, `javascript:`, `file:`, and metadata-service URLs.
- `apps/web/server/services/__tests__/hyperframesQaService.test.ts`: blocks blank frames, unplayable MP4, subtitle clipping, missing disclosure, stale input hash, and final QA failures.
- `apps/web/server/services/__tests__/hyperframesSecurity.test.ts`: tenant isolation, XSS, SSRF, raw URL redaction, signed URL redaction, and log safety.
- Test worker/browser isolation assumptions: staged-only asset reads, no session cookies, no localStorage/API access from composition preview, tenant-scoped temp dirs, cleanup, and capped media limits.

## Section 05: Render Worker and Runtime State

- `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`: idempotent job creation, status mapping, retry classification, cancellation projection, and safe diagnostics.
- `apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts`: transient retries, permanent no-retry, dead-letter, stale-lock recovery, replay checks, and cancellation.
- Test outbox payload uses HyperFrames job types, payload hash fields, and idempotency key format from the spec.
- Test artifact rows use HyperFrames artifact kinds, content hashes, retention class, and sanitized log metadata.
- Test `saved_to_library` maps to open-Library next action after finalize metadata is linked.
- Test tenant/run scoped storage paths and reject broad filesystem paths or cross-tenant output keys.
- Test migration decision checkpoint blocks dedicated HyperFrames tables unless a
  decision note covers dry-run SQL, rollback SQL, backfill, dual-read, cutover
  flag, cleanup proof, and old/new ledger tests.
- Test safe auto-repair recommendations for stale input hash, missing snapshot,
  retryable worker/dependency/storage failure, and minor layout warning; verify
  disabled template, compliance blocker, tenant mismatch, and missing evidence do
  not expose repair actions.
- Fixture-render smoke test: doctor, lint, snapshot, inspect, and render produce expected artifacts when dependencies are available.

## Section 06: Runtime API and Router Integration

- `apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts`: procedures validate inputs, enforce auth/tenant, and return sanitized projections.
- Test `getAutoStoryboardReviewPlan` is page-load safe and does not mutate run state.
- Test `startAutoStoryboardReview` starts/resumes Auto mode and queues eligible preview after storyboard readiness.
- Test existing `startAutoReview` still starts Standard Order `storyboard_images` and `full_video`.
- Test save-to-Library duplicate returns existing item and does not double-charge.
- Test start/preview/save responses include explicit `creditEstimate`,
  `quotaDecision`, or `noChargeReason`.
- Test polling guidance uses 5-15s normal intervals, backs off to max 30s, and
  stops on terminal statuses without client-side status inference.

## Section 07: Product Detail Dual-Mode UI

- `apps/web/client/src/components/marketplaceCapture/__tests__/MarketplaceAutoReviewLaunchModeSwitch.test.tsx`: Auto and Standard modes are both reachable, keyboard-accessible, and state-preserving.
- `apps/web/client/src/components/marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.test.tsx`: Auto plan defaults, blockers, warnings, reset-to-auto, and primary action render correctly.
- `apps/web/client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx`: loading, running, failed, completed, cancel, retry, and save states render from projections.
- `apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.hyperframes.test.tsx`: Auto first viewport, Standard controls visible/discoverable, reset-to-auto, blockers, progress, output links.
- Test HyperFrames disabled preserves current Standard Order behavior.
- Test HyperFrames enabled does not remove Standard Order controls.
- Test mobile layout has no horizontal overflow.

## Section 08: Storyboard Review and MediaStudio Handoff UI

- `apps/web/client/src/pages/__tests__/StoryboardReviewPage.hyperframes.test.tsx`: review/result-first layout, auto preview status, snapshot comparison, manual render only retry/fallback.
- `apps/web/client/src/pages/__tests__/MediaStudio.hyperframesRenderSession.test.tsx`: pending HyperFrames render-to-library session resumes and saves with fallback metadata after reload.
- Test Video Shot and existing Storyboard Review compound render paths still work when HyperFrames is unavailable.
- Test duplicate Library save is prevented in UI and finalized idempotently by server.
- Test Storyboard Review prioritizes safe auto-repair over manual customization
  for stale hash, missing snapshot, retryable worker error, and minor layout warning.

## Section 09: Library, Media History, and Video Editor Finalize

- `apps/web/server/services/__tests__/hyperframesLibraryFinalizeService.test.ts`: Library idempotency key, metadata, duplicate save, stale hash refusal, final QA gate, and tenant isolation.
- Test required key format: `hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}`.
- Test duplicate save refreshes metadata only when composition input hash, composition HTML hash, output hash, template ref, platform preset, tenant/user/run ownership, and QA state match.
- Test Library/Media History can find finalized HyperFrames video by product/run/source metadata.
- Test preview-only expired artifacts do not appear as playable Library cards.
- Test Video Editor opens completed HyperFrames MP4 as normal media.

## Section 10: Observability, Retention, and Operator Controls

- `apps/web/server/services/__tests__/hyperframesOperatorService.test.ts`: inspect, replay, cancel, template disable/enable, dry-run purge permission checks, and audit events.
- `apps/web/server/services/__tests__/hyperframesRetentionService.test.ts`: preview, review, Library, audit retention, and dry-run purge.
- Test exact retention defaults for every HyperFrames artifact kind and purge skip rules for Library-owned, active, locked, and retry-grace artifacts.
- Test correlation fields are copied from request to outbox, worker, artifact, credit, timeline, Library, and audit metadata.
- Test diagnostics redact signed URLs, local paths, stack traces, and secrets.

## Section 11: Fixtures, E2E, and Release Gates

- `apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts`: Product Detail Auto ready, disabled, blocked, Standard preserved, running render, completed output, and Library save.
- E2E Storyboard Review: preview/result-first panel, snapshot comparison, retry/fallback manual render.
- E2E MediaStudio/Library: reload session resume, duplicate save prevention, Library discovery, and Video Editor open.
- Browser evidence across 360x800, 390x844, 768x1024, 1024x768, and 1440x900.
- Accessibility/axe checks where current Playwright patterns support them.
- Fixture tests cover product categories, regulated/high-risk claims, Thai text stress, media aspect/quality, subtitle/audio drift, platform profiles, failure/recovery, and shared/group permission cases.
- Release command tests or scripts cover `hyperframes:dependency-audit`, `hyperframes:doctor`, `hyperframes:fixture-render`, and `hyperframes:snapshot-test`.

## Section 12: Dependency Rollout and Documentation

- `apps/web/server/services/__tests__/hyperframesDependencyAudit.test.ts`: pinned versions, license/provenance metadata, native/postinstall review placeholders, and flags default off.
- `hyperframes-doctor` command test/fixture checks Node, browser/headless runtime, FFmpeg/FFprobe, fonts, storage, temp workspace, and HyperFrames availability.
- Preflight tests prove dependency audit, doctor, runtime mode decision, and
  worker/container readiness pass or explicitly block Section 05 runtime execution
  before any HyperFrames package is installed or executed.
- Rollout tests verify flags stop new jobs, keep Standard Order available, and preserve completed Library items.
- Docs/runbook review covers flags, worker operation, retention, operator controls, troubleshooting, and rollback.
- MVP policy tests/checks cover 7-day preview retention, quota-first billing, internal-only composition source, 9:16 first rollout, built-in templates only, burn-in subtitles first, and high-risk category review before auto queue.

## Final Gates

- Focused shared/server/client tests for all changed files.
- TypeScript check for source changes.
- Playwright e2e for Product Detail, Storyboard Review, MediaStudio, Library, and Video Editor desktop/mobile.
- Security gate when new tRPC procedures and asset staging are implemented.
- Dependency/doctor gate before installing or enabling HyperFrames runtime packages.
