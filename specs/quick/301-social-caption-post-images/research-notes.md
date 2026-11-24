# Research notes

## Baseline and workspace

- Canonical preflight: `BASELINE_READY`; local `main` and fetched canonical
  `main` are both `373d937ab125f29437d9eedfe86d3bfa3c0de45b`.
- The checkout has many pre-existing dirty paths, including
  `MarketplaceCaptureProductDetail.tsx`, `marketplaceAutoReviewService.ts`,
  worker and storyboard files, generated reports, and `apps/web/.local` /
  `apps/web/.skillpack`. Preserve them. The caption composer, staged checkpoint
  router service, worker input service, and `marketplaceCapture` router are
  currently clean.
- The related quick plan 300 is a separate, already-integrated worker-jobs
  work unit with an open live-proof handoff. This request is a new output
  capability; do not rewrite that handoff or replay its recorded jobs.

## Existing product flow

- `apps/web/client/src/components/marketplaceCapture/StagedSocialCaptionComposer.tsx`
  already selects a product or shot image, submits a caption request, displays
  the caption/hashtags, and refreshes after the request.
- `apps/web/client/src/components/marketplaceCapture/StagedCheckpointReviewPanel.tsx`
  mounts the composer and projects worker-operation labels.
- `apps/web/server/routers/marketplaceCapture.ts` exposes the protected caption
  mutation.
- `apps/web/server/services/marketplaceAutoReviewStagedCheckpointRouterService.ts`
  owns staged run access, source resolution, canonical worker-job enqueue,
  caption generation, and transactional persistence into the passthrough
  `stagedPipeline` metadata.
- `apps/web/server/services/marketplaceAutoReviewWorkerJob.ts` owns the
  discriminated operation contract and dispatch for staged operations.
- `apps/web/server/services/marketplaceAutoReviewSocialCaptionSkillRunner.ts`
  loads `social-commerce-caption`, requires a vision-capable prompt model, and
  charges actual LLM token usage with an idempotency key.

## Image model, provider, credit, and storage patterns

- `trpc.mediaModels.list({ type: "image" })` returns enabled image models with
  pricing, declared aspect ratios, and normalized capabilities.
- `resolveEnabledMediaModelSelection` can require a configured provider and
  reject substitution; `resolveAdBannerImageModelPricing` provides fixed
  per-image cost and reference-image capacity.
- `verticalDramaBookCoverService.ts` demonstrates internal media tokens,
  `mediaGenerationService.generateImageAsync`, per-output credit reservations,
  failure refunds, and provider-task polling.
- `marketplaceAutoReviewMediaAssetService.ts` copies completed Marketplace Auto
  Review provider outputs into durable managed storage. Tag generated tasks
  with `__auto_review_run_id` and a safe `__unit_id` so the existing durability
  path can own them.
- `StagedSequentialStoryboardMetadataV1Schema` passes through extra fields and
  `stagedPipeline` is already stored in its JSON metadata. No schema migration
  is needed. `stagedMetadataStateDigest` intentionally covers plan state, so
  image generation must validate an explicit saved-caption/source fingerprint.

## UI pattern and design-system discovery

- Existing pattern: keep the interaction in
  `StagedSocialCaptionComposer`; the existing `useLightbox` / `LightboxGallery`
  pattern supports accessible gallery navigation.
- `npm run astryx -- build "Caption card with three vertical social ad images, image model selector, progress and lightbox download"`
  returned `Lightbox`, `useLightbox`, and `LightboxGallery` as relevant UI
  primitives. The component docs were read before implementation.
- Reuse the current caption card and Astryx components; do not modify the
  already-dirty product-detail page to mount a second copy.
- The app-level `social-commerce-caption` skill exists only under
  `apps/web/skills/`; it is not listed in the root `skills/mirrored-skills.txt`.
  It only returns caption/hashtags. `vertical-drama-ad-banner-prompt` targets
  composited video overlays and is not a fit for standalone social posts, so a
  focused app skill is appropriate.

## Security and correctness notes

- Resolve the run and all three reference URLs from owner-scoped persisted
  metadata. Never accept arbitrary image URLs from the browser.
- Hash the saved caption, source image, selected character, selected product,
  and model into a batch fingerprint. Reject stale jobs before any paid call.
- Reserve image-model credits per output with stable idempotency keys. Refund
  an output only if its provider generation fails; retain its charge when the
  provider completed and the output is durable, even if a later unrelated
  output fails.
- Charge each prompt-generation LLM call using reported token usage and a
  per-output idempotency key. Never run live provider calls as a local test.
- Keep raw provider diagnostics and generated prompts out of customer-facing
  errors and the simple caption projection.

## Focused test surfaces

- Prompt runner tests: skill loading, exact output contract, image inputs,
  usage-required billing, and duplicate-charge idempotency.
- Worker/router tests: model compatibility, stale caption/reference handling,
  owner scope, queue operation schema, three references, durable output
  persistence, per-image refunds, partial failure, and retry reuse.
- Component tests: separate model selection, disabled/empty/loading/error/
  partial/success states, lightbox triggers, and download actions.
- UI browser evidence follows `skills/orchestra/references/ui-browser-verification.md`;
  provider-backed generation remains a separate authorized UAT.
