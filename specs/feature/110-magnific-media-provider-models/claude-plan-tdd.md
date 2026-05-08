# TDD Plan: Magnific Media Provider And Model Catalog Expansion

This TDD plan mirrors `claude-plan.md`. Tests should be written before or alongside implementation, using the repository's existing Vitest and pytest patterns.

## 1. Objective

Prove that Magnific can be represented, configured, executed, polled, billed, and rolled out without regressing existing media providers.

## 2. Existing Architecture To Preserve

Web regression tests:

- Test: provider normalization for Kie, fal.ai, BytePlus, WaveSpeed, ElevenLabs, UVoice, and KNPLabs remains unchanged.
- Test: existing static fallback model lookups still resolve current providers.
- Test: adding Magnific does not make unknown media models silently route to Magnific.

Python regression tests:

- Test: existing `LLMGateway._normalize_provider_id()` mappings remain unchanged.
- Test: existing WaveSpeed, BytePlus, fal.ai, Kie, UVoice, ElevenLabs, and KNPLabs gateway routing remains unchanged.
- Test: existing media task recovery branches still run when Magnific metadata is absent.

## 3. Canonical Contracts

Web tests:

- Test: `normalizeMediaProviderName()` accepts `magnific`, `magnific_api`, `magnific-ai`, and `magnific_ai` as `magnific`.
- Test: Magnific base URL normalization rejects non-HTTPS, local, internal, metadata, and private hosts.
- Test: endpoint validation rejects absolute URLs and path traversal.
- Test: every Magnific seed has `endpoint.submit`, dispatch mode, output extractors, pricing status, and readiness metadata.
- Test: every Magnific seed has `pricingSource`, `pricingLastReviewedAt`, and the expected provisional credit conversion metadata.
- Test: all Veo 3.1 concrete records share `modelFamily: "magnific/veo-3-1"`.
- Test: family alias rows, if added, are not user-selectable.

Python tests:

- Test: provider id normalization accepts Magnific aliases.
- Test: Magnific endpoint registry rejects unknown model ids and absolute endpoint URLs.
- Test: status normalization maps `CREATED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED`, and `CANCELED`.

## 4. Web Provider And Catalog Work

Provider/template tests:

- Test: `PROVIDER_TEMPLATES` includes Magnific with default base URL and `multimodal` type.
- Test: seed provider script inserts Magnific disabled by default.
- Test: provider seed rerun skips or updates without overwriting encrypted keys.
- Test: connection test sends `x-magnific-api-key`.
- Test: connection test succeeds only for authenticated valid provider responses.
- Test: `401`, `403`, `429`, timeout, and malformed response return sanitized messages.

Model seed tests:

- Test: dry-run creates the expected count and model id list.
- Test: dry-run fails or reports a mismatch when generated concrete model ids differ from the fixed 34-record inventory.
- Test: each concrete endpoint variant is represented by a distinct selectable record.
- Test: rerun preserves admin-edited enabled state and pricing.
- Test: admin pricing overrides supersede seeded provisional pricing and preserve `pricingSource`.
- Test: video/upscaler rows are disabled/admin-only until readiness gates pass.
- Test: static fallback metadata includes provider, endpoint, pricing, input fields, and output extractors.

## 5. Frontend And Web Validation

Input parsing tests:

- Test: `image_urls`, `video_urls`, `array`, `select`, `number`, and `boolean` fields parse from Magnific config.
- Test: max item caps are preserved for reference images/videos.
- Test: Skin Enhancer mode-specific fields can be represented or split by concrete model rows.
- Test: Change Camera numeric controls preserve min/max metadata.
- Test: Video Upscaler Precision controls preserve `fps_boost` and `strength` relationship metadata.

Server validation tests:

- Test: invalid prompt lengths are rejected by model family.
- Test: too many reference images/videos are rejected.
- Test: invalid duration, resolution, aspect ratio, angle, zoom, and 0-100 controls are rejected.
- Test: `use_google_search_tool` is accepted only for Nano Banana models.
- Test: user-supplied `webhook_url` is rejected or ignored.
- Test: private/internal/reference URLs are rejected, including redirect-to-private cases.
- Test: Mystic LoRA controls do not produce undocumented top-level LoRA fields.
- Test: LoRA discovery calls authenticated server-side discovery when available, caches sanitized metadata, and falls back to optional text inputs when discovery fails.

## 6. Python Runtime Work

Provider client tests:

- Test: submit methods use `x-magnific-api-key`.
- Test: image submit response normalizes `data.task_id` and `data.status`.
- Test: Mystic completed status extracts `data.generated[]`.
- Test: Remove Background sync response extracts and re-hosts `url`, `high_resolution`, and `preview`.
- Test: Veo submit payload includes prompt, negative prompt, duration, resolution, aspect ratio, generate audio, and seed when provided.
- Test: Video Upscaler Precision payload includes video, resolution, fps boost, sharpen, smart grain, and strength.
- Test: unknown completed output shapes fail closed with sanitized diagnostics.
- Test: provider HTTP errors are classified as retryable or terminal without leaking raw prompt/signed URL data.

Gateway tests:

- Test: image Magnific model ids route to Magnific.
- Test: video and video-upscaler Magnific model ids route to Magnific.
- Test: Remove Background returns a completed response and does not schedule long polling unless audit policy requires it.
- Test: missing provider config returns a setup error and preserves/refunds credits.
- Test: persistence audit proves existing task/result metadata can store provider task id, endpoint metadata, pricing snapshot, and sanitized submission data, or migration tests cover the new fields.
- Test: retry after provider task id persistence resumes polling instead of submitting a duplicate provider job.

## 7. Asset Handling, Security, And Billing

Security tests:

- Test: source image/video/reference URL validation rejects loopback, private, link-local, metadata service, `.local`, `.internal`, and `host.docker.internal`.
- Test: redirect chains are validated before result download.
- Test: signed URL query strings and API keys are absent from logs.
- Test: provider-hosted result URLs are not returned in final user-visible payloads.

Billing tests:

- Test: flat image pricing reserves expected credits.
- Test: duration/resolution video pricing reserves from requested controls.
- Test: Video Upscaler Precision uses a resolution/frame estimate matrix.
- Test: provider failure refunds.
- Test: timeout refunds.
- Test: re-hosting failure refunds.
- Test: actual output metadata can reduce cost and refund over-reservation.
- Test: no auto-overcharge occurs above the reserved amount.
- Test: repeated terminal failure handling does not refund twice.

## 8. Delivery Sequence

Section-level TDD order:

1. Write normalization, seed metadata, and provider template tests.
2. Write model seed and static fallback tests.
3. Write dynamic input and server validation tests.
4. Write provider client submit/status/result extraction tests.
5. Write gateway routing tests.
6. Write polling/recovery tests.
7. Write billing/security/rollout regression tests.

## 9. Verification Strategy

Expected commands:

- `npm --prefix apps/web run check`
- `npm --prefix apps/web test -- server/routers/mediaProviders.test.ts`
- `npm --prefix apps/web test -- server/services/mediaProviderUtils.test.ts`
- `npm --prefix apps/web test -- server/services/mediaGenerationService.test.ts`
- `npm --prefix apps/web test -- client/src/lib/mediaModelInputs.test.ts`
- `npm --prefix apps/web exec tsx scripts/seed-media-models-magnific.ts --dry-run`
- `pytest python-backend/tests/unit/llm_proxy/test_magnific_provider.py -v`
- `pytest python-backend/tests/unit/llm_proxy/test_gateway_unified_magnific.py -v`
- `pytest python-backend/tests/tasks/test_media_tasks_magnific.py -v`
- `pytest python-backend/tests/unit/services/test_magnific_ssrf.py -v`

## 10. Rollout And Rollback

Release-gate tests:

- Test: provider disabled state prevents new submissions.
- Test: disabling all Magnific model rows removes them from regular-user selection.
- Test: in-flight rollback terminal reason `provider_disabled_rollback` refunds credits.
- Test: rollback-stop observability records provider task id and notes external cancellation is unsupported unless verified.
- Test: admin-visible readiness diagnostics report missing API key, provider disabled, model disabled, provisional pricing, and last connection test state.
