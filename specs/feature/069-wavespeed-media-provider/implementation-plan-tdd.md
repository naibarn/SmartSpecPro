# TDD Plan

## Test-first order

1. Start with web-side normalization and template tests.
2. Add static registry tests for the new model id, fallback pricing tiers, and official metadata.
3. Add provider connection-test coverage for the exact WaveSpeed balance endpoint and error mapping.
4. Add seed-script idempotency checks.
5. Add Python gateway routing tests for the new provider.
6. Add provider adapter tests for submit, poll, validation, cleanup, and base-URL normalization.
7. Add recovery tests for unfinished jobs.

## Expected failing conditions

- `wavespeed_ai` is not recognized by provider normalizers.
- the admin provider template list does not include WaveSpeedAI.
- the static fallback registry cannot resolve `wavespeed-ai/cinematic-video-generator`.
- the Seedance model does not expose duration-based pricing tiers.
- the Seedance model allows more than 4 reference images or loses the prompt-only T2V path.
- the router falls back to a flat 5s cost for 10s or 15s requests when DB config is unavailable.
- the Python gateway falls through to the wrong provider branch.
- the provider connection test uses a generic reachability probe instead of `GET /balance`.
- the provider adapter accepts an invalid model id or leaks redirect-follow behavior.
- the provider adapter builds a malformed `/api/v3` URL from the configured base URL.
- the recovery loop cannot resume a WaveSpeed task after restart.

## Suggested coverage

Web:

- `mediaProviders` returns a WaveSpeedAI template with the official base URL
- `mediaProviders.testConnection` calls `GET /balance` and interprets `200`, `401`, `403`, and `429` correctly
- provider normalization collapses `wavespeed`, `wavespeedai`, and `wavespeed_ai` to the same canonical key
- the Seedance model is visible in the static fallback registry
- the model display name matches the official WaveSpeed page title
- static fallback metadata carries `pricingFormula: "per_duration"` and `pricingTiers`
- pricing tiers round-trip through the admin model editor and DB-first contract tests
- the UI soft-clamps reference images to 4 and the backend rejects >4 even if the client bypasses the UI

Python:

- the gateway routes a Seedance request to the WaveSpeed adapter when the provider or model id matches
- the gateway supports both prompt-only T2V and prompt-plus-images I2V request shapes for the same model
- the adapter accepts both `https://api.wavespeed.ai` and `https://api.wavespeed.ai/api/v3` as configured base URLs and normalizes them to the same request URLs
- the adapter validates model ids and keeps redirects disabled
- the adapter rejects oversized or malformed upstream responses
- the adapter maps `data.id`, `data.status`, `data.outputs`, and `data.error` into normalized internal task state
- the recovery loop re-polls an unfinished task and updates the result when available

## Mocking and fixtures

- mock the WaveSpeed HTTP client rather than calling the live API
- use DB-row fixtures for model/provider resolution where the route depends on catalog metadata
- keep the mock response payloads small so the response-size limits are exercised
- preserve the existing async test style already used by the repository
- include fixtures for both DB-present and DB-missing pricing paths so fallback pricing behavior is tested explicitly

## Regression checks

- rerun the existing media provider and media model tests after the new cases pass
- rerun the BytePlus, fal.ai, KNPLabs, Kie.ai, and UVoice gateway tests to prove nothing regressed
- rerun the admin model readiness tests to confirm provider normalization still works for old provider names
