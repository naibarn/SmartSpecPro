# Section 02 — worker, billing, and storage

## Ownership and targets

- Owner: main Codex.
- Files: `apps/web/server/services/marketplaceAutoReviewWorkerJob.ts`,
  `apps/web/server/services/marketplaceAutoReviewStagedCheckpointRouterService.ts`,
  `apps/web/server/services/marketplaceAutoReviewSocialPostImagesService.ts`,
  and focused service/worker tests.
- Do not edit the pre-existing dirty
  `apps/web/server/services/marketplaceAutoReviewService.ts` or
  `apps/web/server/jobs/marketplaceAutoReviewJob.ts`.

## Prerequisites

- Section 01 supplies the prompt runner and image-model resolver.
- The new operation must use the existing `worker_jobs` plus outbox path.

## Implementation

- Add the strict `staged_social_post_images_generation` worker input and
  dispatch. The protected mutation accepts reference indexes/model ID and
  enqueues a single operation with a stable idempotency key.
- Resolve all inputs from the owned run. Compute the caption/source/character/
  product/model fingerprint, compare it before paid work, and pass the three
  variants in a fixed order: caption source, selected character, selected
  product.
- Generate each prompt and image sequentially. Reserve the selected model's
  per-image credits before provider submission. Use deterministic keys for
  media reservation, task, and failure refund. Charge prompt usage separately
  from actual LLM token counts.
- Poll `mediaGenerationService` with an internal `media:generate` token and
  persist each completed provider result through
  `ensureMarketplaceAutoReviewTaskResultDurable` before recording success.
- Persist a safe `socialCaption.postImages` projection after each output.
  Continue other variants after an individual generation failure and preserve
  successful outputs. A retry with the same fingerprint reuses completed
  variants and only regenerates failed/missing ones.
- Include safe progress/stage information and sanitized error codes. The user
  projection must omit prompts, provider URLs, and internal error text.

## TDD and acceptance

- First test operation schema/dispatch, run authorization, stale fingerprint
  rejection, and that no paid dependency is called before validation.
- Test one reference per variant, model and ratio threading, per-output
  reservation/refund semantics, prompt actual usage, durable storage, partial
  failure, and a retry that does not regenerate or charge completed variants.
- Acceptance: three outputs persist independently; a run/reference mismatch
  queues no provider work; every paid call has an idempotent credit record.

## Slice contract

- Required checks: focused worker/router/service Vitest files; provider and LLM
  calls are mocked; no migration or live DB DDL is required.
- Merge readiness: complete with section 01; section 03 can then consume the
  projected state and mutation.
- Exposure/fallback: not reachable from UI until section 03. Missing/invalid
  refs/model fail before charging; provider failure refunds only that image;
  successful siblings remain available.
- Rollback: stop enqueueing the operation and ignore the optional metadata.
  Durable images remain normal tenant/run-scoped media retained by existing
  storage policy.

## UI/UX Contract

N/A for this section; UI is owned by section 03.
