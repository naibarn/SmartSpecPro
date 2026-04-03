# TDD Plan: WaveSpeed Media Provider and Cinematic Video Generator

This document mirrors `claude-plan.md` and defines the tests that should exist before or alongside implementation. Test descriptions are intentionally lightweight so implementation can follow the repo’s existing Vitest and pytest patterns.

## 1. Objective

Write tests that prove:

- WaveSpeed can be represented as a provider and seeded model in the existing admin system.
- The launch model behaves correctly in Media Studio and the web router.
- Python runtime submit/poll behavior matches the official WaveSpeed contract.
- Pricing remains correct in DB-first and static-fallback paths.

## 2. Existing architecture to preserve

### Web test stubs

- Test: provider normalization accepts `wavespeed_ai`, `wavespeed-ai`, and `wavespeed ai` where relevant.
- Test: existing provider normalization for `kie_ai`, `uvoice`, `byteplus_modelark`, and `knplabai` remains unchanged.
- Test: static model lookup still resolves existing providers after adding WaveSpeed metadata.

### Python test stubs

- Test: existing provider-specific task-state helpers continue to behave unchanged.
- Test: adding WaveSpeed normalization does not change current provider routing for Kie, BytePlus, or UVoice.

## 3. High-level design

### 3.1 Provider foundation and static fallback metadata

- Vitest: `PROVIDER_TEMPLATES` includes a `wavespeed_ai` entry with the official base URL.
- Vitest: static model registries expose `wavespeed-ai/cinematic-video-generator` with the expected provider id and durations.
- Vitest: DB-miss pricing lookup still returns fallback `configJson.pricingFormula` and `configJson.pricingTiers` for the launch model.
- Vitest: `calculateCreditCost()` returns `800`, `1600`, and `2400` for `5`, `10`, and `15` duration selections when fallback metadata is used.

### 3.2 Admin provider + model seeding contract

- Vitest: WaveSpeed connection helper calls `GET {baseUrl}/balance`.
- Vitest: connection helper sends `Authorization: Bearer ...`.
- Vitest: `200` with numeric `data.balance` is treated as success.
- Vitest: `401`, `403`, and `429` produce explicit admin-facing failure messages.
- Vitest: media model persistence rejects absolute `apiEndpoint` / `apiQueryEndpoint` values for WaveSpeed metadata.
- Vitest: media model persistence rejects protocol-relative endpoint values and path traversal segments.
- Vitest or script-level test: seeded model config includes:
  - `apiPayloadFormat`
  - `apiEndpoint`
  - `apiQueryEndpoint`
  - `providerModelId`
  - `apiConfig.provider`
  - `pricingFormula`
  - `pricingTiers`

### 3.3 Media Studio and web-router validation

- Vitest: `mediaModelInputs.ts` recognizes WaveSpeed as supporting reference images because of its `image_urls` field.
- Vitest: model input parsing preserves the model-level image cap metadata.
- Vitest/jsdom: Media Studio soft-clamps or rejects additional images when the selected model allows only four.
- Vitest: the web router rejects more than four reference images for the launch model.
- Vitest: the web router rejects unsupported aspect ratios and unsupported durations for the launch model.
- Vitest: the internal media router rejects absolute reference-image URLs that fail SSRF/public-host validation.
- Vitest: relative `/uploads/...` style references are still accepted and resolved through the existing public-URL path.
- Vitest: other providers that currently allow five images remain unaffected.

### 3.4 Python runtime submit/poll adapter and recovery contract

- Pytest: base URL normalization appends `/api/v3` only when needed.
- Pytest: submit request uses the normalized root plus `/wavespeed-ai/cinematic-video-generator`.
- Pytest: request payload maps:
  - `prompt -> prompt`
  - `referenceImageUrls -> images`
  - `aspectRatio -> aspect_ratio`
  - `duration -> duration`
- Pytest: poll request uses `/predictions/{requestId}/result`.
- Pytest: response mapping stores provider task id from `data.id`.
- Pytest: `created` and `processing` normalize to internal processing.
- Pytest: `completed` with `data.outputs[0]` normalizes to success and extracts the final media URL.
- Pytest: `failed` or terminal `data.error` normalizes to failure.
- Pytest: recovery payload stores the expected `submission.*` keys including `used_sync_mode = false`.
- Pytest: `submission.request_summary` contains only sanitized whitelist fields and excludes prompt text, secrets, and raw URLs.
- Pytest: provider result URLs are validated before persistence; private/internal URLs fail safely.
- Pytest: `429`, timeout, and transient `5xx` poll failures back off and retry instead of failing immediately.
- Pytest: polling eventually fails with a deterministic timeout after the configured max lifetime.
- Pytest: successful completion stores `result_data.actual_duration = requested_duration` when upstream does not provide a better authoritative value.

## 4. File-level implementation guidance

### 4.1 TypeScript web/admin layer

- Add or extend tests near:
  - `apps/web/server/routers/mediaProviders.test.ts`
  - `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
  - model-registry or pricing tests where fallback behavior is already asserted

### 4.2 TypeScript client layer

- Add or extend tests near:
  - `apps/web/client/src/lib/mediaModelInputs.test.ts`
  - a Media Studio interaction test if the repo already has a suitable pattern, otherwise keep the client verification focused on helper-level parsing and clamping logic

### 4.3 Python runtime layer

- Add or extend pytest coverage in the media gateway / media task test areas.
- Prefer provider-adapter tests that mock HTTP responses rather than full end-to-end external API calls.

## 5. Deterministic decisions that implementers should not re-open

- Test the canonical provider key `wavespeed_ai`.
- Treat the seeded API root as `https://api.wavespeed.ai/api/v3`.
- Test only async submit/poll behavior; do not add sync-mode tests.
- Treat `data.outputs[0]` as the primary final media URL.
- Treat native audio as part of the video output, not a separate artifact.

## 6. Edge cases to cover explicitly

- Test: service root `https://api.wavespeed.ai` normalizes to the same effective endpoint as `https://api.wavespeed.ai/api/v3`.
- Test: a completed response without `data.outputs[0]` is surfaced as provider failure.
- Test: unknown non-empty intermediate status remains non-terminal.
- Test: fallback pricing still works when the DB row is absent.
- Test: the WaveSpeed-specific four-image limit does not break other providers’ higher limits.
- Test: unsafe editable endpoint metadata is rejected before save.
- Test: a completed response with a private/internal result URL is surfaced as provider failure.

## 7. Delivery sequence

Recommended order for test-first work:

1. Provider template + health-check tests
2. Static model + pricing fallback tests
3. Media Studio / web-router validation tests
4. Python submit/poll and recovery tests

## 8. Verification strategy

- Run targeted Vitest suites for provider, media router, model-input, and pricing behavior.
- Run targeted pytest suites for media task and gateway behavior.
- After targeted tests pass, run a broader sanity slice for adjacent media-provider tests to catch regressions.

## 9. Implementation completion standard

The implementation is ready when:

- all new WaveSpeed tests pass
- no existing provider/media tests regress
- the tests prove that admin setup, user input handling, runtime execution, and fallback pricing are all aligned
