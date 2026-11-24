# Implementation plan

## Objective

Generate and display three portrait social-ad images alongside the existing
Marketplace Auto Review caption. Let the user select a separate image model,
character reference, and product reference. Use the saved caption source as
the first image reference. Keep prompt and image charges accurate across
provider failures and worker retries.

## Current-codebase fit

Extend the existing caption composer and staged checkpoint worker flow. Use
`worker_jobs` through `marketplaceAutoReviewWorkerJob.ts`, the app's skill
runtime for image prompts, `mediaGenerationService` for model generation, and
`marketplaceAutoReviewMediaAssetService` for durable outputs. Keep results in
the existing passthrough `stagedPipeline.socialCaption` JSON metadata. No new
database table, package, or deployment path is required.

## Implementation approach

1. Add a focused app skill for a social post image prompt. For each variant,
   call it with one owner-resolved reference image, the saved caption, product
   facts, and a variant role. Require structured JSON with image and negative
   prompts. Charge actual LLM usage separately per image prompt.
2. Use the existing `mediaModels.list({ type: "image" })` query for model
   options and filter to models that accept one reference and declare a
   portrait output ratio. Prefer 4:5; otherwise select a declared portrait
   ratio. Validate the chosen model and provider before queueing; never
   silently substitute another model.
3. Add `staged_social_post_images_generation` to the existing worker
   discriminated union and dispatcher. Validate the saved caption and its
   source/character/product fingerprints before any provider call. Generate
   three single-image outputs sequentially. Reserve image credits with a
   stable key per variant, refund only provider failures before completion,
   and copy completed results to managed storage through the existing
   Marketplace Auto Review durability service.
4. Persist progress/results per variant. Preserve successful images when a
   sibling fails. A new request with the same caption, references, and model
   reuses successful variant outputs and retries missing/failed variants; a
   changed fingerprint starts a fresh set.
5. Add model and reference selectors, the generate/retry action, three
   portrait previews, a keyboard-accessible lightbox gallery, and download
   buttons to `StagedSocialCaptionComposer`. Keep the image model state local
   to this composer and submit it only for social-image jobs.

## Data and interfaces

- Worker input: `runId`, persisted-caption fingerprint, image model ID, active
  character/product reference indexes, and request idempotency key.
- Output metadata: batch fingerprint, selected model and ratio, total credits,
  and exactly three variant records with status, managed URL, asset/task
  identity, and safe error code. Persist each completed or failed variant
  before moving to the next one.
- Client projection: caption/hashtags plus `postImages` statuses and safe URLs;
  no raw prompts, provider task URLs, tokens, or absolute filesystem paths.
- Model-list projection: model ID, display name, provider label, per-image
  credit cost, and chosen portrait ratio only.

## Risks and mitigations

- **Stale references/caption:** hash all source facts and recheck before
  provider calls; fail without reserving credits on mismatch.
- **Duplicate spends after retry:** use independent, deterministic idempotency
  keys for each prompt charge, media reservation, refund, and provider task.
- **Partial provider failure:** persist each variant immediately, continue the
  other variants, preserve successes, and let a later retry target missing
  variants.
- **Expired provider URLs:** use the existing managed-media durability helper
  before persisting an image as completed.
- **Unsafe source URLs or cross-tenant access:** accept reference indexes only;
  resolve URLs from the run's owner-scoped metadata and preserve existing
  tenant checks.
- **Incompatible model:** filter model options and validate provider setup,
  reference capability, and portrait ratio again server-side.
- **Unrelated dirty edits:** own only the clean caption component, worker
  contract/service, capture router, new app skill, focused tests, and new
  planning package. Avoid the dirty product-detail/service files.

## Acceptance criteria

- A user can select the social-image model independently of the start-frame
  model and generate three portrait images after the caption exists.
- Each image prompt receives the correct single reference plus the same saved
  caption/product facts: caption source, character reference, product
  reference.
- Every output is shown with the caption, opens in the lightbox, and downloads
  from durable managed storage.
- No job or charge is created if caption/reference/model validation fails.
- Actual prompt usage is charged once per variant; image cost is reserved once
  per output and refunded on pre-completion provider failure. Worker retries
  do not duplicate charges or completed images.
- Partial failures retain successful outputs and can be retried without
  regenerating or charging for the successful variants.
- The UI remains usable at mobile, tablet, and desktop widths and meets the
  accessibility contract in section 03.

## Verification and rollout

- Profile: `quick`, with focused Vitest files for the runner, staged worker
  operation, billing/persistence, and composer UI. Do not run repository-wide
  `npm run typecheck` locally.
- Use mocked LLM/provider responses in local tests. Live generation is a
  separate provider-backed check and is not a requirement for source
  integration.
- No feature flag is needed: the generate action is available only after a
  caption and compatible references/model are present.
- No schema migration. Rollback removes the new operation/UI path; stored
  `socialCaption.postImages` JSON remains safely ignored by old readers and
  durable media remains governed by existing retention.
- Do not deploy automatically. If a development preview is later requested,
  resolve `legacy-debian-dev` through `deployment-targets.json` first.
