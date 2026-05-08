# Section 01: Provider Foundation

## Goal

Add Magnific as a recognizable, admin-manageable media provider without enabling generation yet.

This section establishes the provider identity and shared validation contracts that later sections depend on.

## Files In Scope

- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/__tests__/seed-media-providers.test.ts`
- `python-backend/app/llm_proxy/gateway_unified.py`
- Python gateway/provider-normalization tests if an existing file is the local pattern

## Implementation Requirements

### 1. Canonical provider constants

Add TypeScript constants:

- `MAGNIFIC_PROVIDER = "magnific"`
- `MAGNIFIC_BASE_URL = "https://api.magnific.com"`
- `MAGNIFIC_DEFAULT_MODEL_ID = "magnific/mystic"`

Add provider alias support:

- `magnific`
- `magnific_api`
- `magnific-ai`
- `magnific_ai`

Update Python provider normalization so these aliases also resolve to `magnific`.

### 2. Base URL and endpoint validation

Add Magnific-specific or shared helpers that:

- require public HTTPS base URLs
- strip trailing slash
- reject local/private/internal hosts
- reject non-HTTP(S) protocols
- reject absolute URLs in model endpoint config
- reject endpoint path traversal and encoded traversal

Reuse existing public URL validation helpers where possible. If a new shared helper is introduced, cover existing providers with regression tests.

### 3. Provider template

Add a provider template in `mediaProviders.ts`:

- `providerName: "magnific"`
- `displayName: "Magnific"`
- `providerType: "multimodal"`
- `baseUrl: "https://api.magnific.com"`
- `defaultModel: "magnific/mystic"`
- `availableModels` from a Magnific helper

The template should describe Magnific as an image/video media provider, not as a generic chat or LLM provider.

### 4. Provider seed row

Update `seed-media-providers.ts` to include Magnific:

- disabled by default
- not primary
- priority after existing core providers
- no API key seeded
- available model list populated from the same helper used by templates

### 5. Connection test

Implement a Magnific-specific connection test:

- decrypt API key from provider row
- call a documented authenticated list/status endpoint such as `GET /v1/ai/mystic`
- send `x-magnific-api-key`
- require a valid authenticated response
- sanitize all response messages
- map `401`, `403`, `429`, timeout, and malformed body

Do not use generic `HEAD` reachability for Magnific.

## TDD First

Write tests before implementation:

- provider normalization maps all Magnific aliases to `magnific`
- existing provider normalization remains unchanged
- Magnific template is present and disabled by seed default
- Magnific connection test sends `x-magnific-api-key`
- invalid key and rate-limit responses are sanitized
- unsafe base URLs and endpoint paths are rejected

## Acceptance

This section is complete when Magnific appears as a disabled admin provider, can save encrypted keys through the existing router, and the connection test authenticates against Magnific without enabling any model execution.

## Implementation Status

Status: COMPLETE

Implemented files:

- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/__tests__/seed-media-providers.test.ts`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/tests/unit/services/test_gateway_fal_routing.py`

Implemented behavior:

- Added Magnific constants, provider alias normalization, public HTTPS base URL normalization, and provider `availableModels` helper.
- Added Magnific admin provider template and disabled seed provider row.
- Added authenticated Magnific connection test using `GET /v1/ai/mystic` with `x-magnific-api-key`.
- Added Python provider normalization for Magnific aliases.
- Added targeted tests for TypeScript helpers, provider template/connection test, provider seed row, and Python normalization.

Verification:

- `npm --prefix apps/web test -- server/services/mediaProviderUtils.test.ts` passed.
- `npm --prefix apps/web test -- server/routers/mediaProviders.test.ts` passed.
- `npm --prefix apps/web test -- scripts/__tests__/seed-media-providers.test.ts` passed.
- `npm --prefix apps/web run check` passed.
- `pytest python-backend/tests/unit/services/test_gateway_fal_routing.py -q` and `uv run pytest ...` could not run because `pytest` is not installed in this environment.

Security review:

- PASS. tRPC admin procedure boundaries are preserved, API keys are not exposed, and Magnific base URLs are public HTTPS validated before fetch.
