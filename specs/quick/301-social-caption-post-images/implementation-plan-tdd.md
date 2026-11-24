# TDD guidance

All implementation slices use RED → GREEN → REFACTOR with focused Vitest
files. Write each test before its production implementation and confirm it
fails for the missing behavior. Never call a real image or LLM provider from a
local test.

## Section 01 — prompt skill and image model eligibility

- Test that the prompt runner loads the social-post image skill and passes the
  caption, product facts, variant role, and exactly one matching vision image.
- Test structured prompt validation, usage-required behavior, and a stable
  per-variant credit idempotency key.
- Test that model eligibility excludes models with no reference-image support
  or portrait ratio. Test the 4:5 preference and portrait fallback. Verify the
  worker revalidates disabled/unconfigured model selection.
- RED expectation: tests fail because the skill, runner, and model projection
  are not implemented.

## Section 02 — worker, billing, and durable persistence

- Test the worker input schema and dispatcher for the new operation.
- Test owner-scoped caption/reference resolution and rejection of stale
  caption, shot, character, and product fingerprints before any paid call.
- Test three prompt/image calls with the selected model and one correct
  reference per variant; persist each completed managed URL immediately.
- Test actual prompt usage charges, per-output media reservations, provider
  failure refunds, provider-completed charge retention, and idempotency on
  retries.
- Test partial failure preserves completed variants, and a retry regenerates
  only missing/failed variants when the fingerprint is unchanged.
- RED expectation: schema rejects the operation and staged state has no image
  generation behavior.

## Section 03 — caption card UI

- Component tests cover separate image-model state, required source selectors,
  pre-submit validation, progress, partial failure/retry, success gallery,
  caption association, lightbox selection, and download behavior.
- Test that changing the image model does not alter the start-frame selection.
- RED expectation: there is no image model selector, generate action, image
  gallery, lightbox, or download control.

## Focused commands

```bash
pnpm --filter @smartspec/web exec vitest run \
  server/services/__tests__/marketplaceAutoReviewSocialImagePromptSkillRunner.test.ts \
  server/services/__tests__/marketplaceAutoReviewSocialPostImageService.test.ts \
  server/services/__tests__/marketplaceAutoReviewWorkerJob.socialPostImages.test.ts \
  client/src/components/marketplaceCapture/__tests__/StagedSocialCaptionComposer.socialImages.test.tsx
```

Add/remove paths to match the final module layout. Run no full TypeScript
typecheck in this shared local session.
