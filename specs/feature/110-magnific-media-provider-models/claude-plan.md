# Implementation Plan: Magnific Media Provider And Model Catalog Expansion

## 1. Objective

Implement first-class Magnific support inside SmartSpecPro's existing media stack.

The implementation adds:

- a new admin-manageable media provider: `magnific`
- seeded Magnific model catalog records with explicit endpoint metadata
- static fallback metadata for DB-unavailable paths
- Media Studio dynamic inputs for image, image-edit, reference/video, sync, and upscaler workflows
- Python submit/poll/runtime integration
- synchronous Remove Background handling
- platform re-hosting for every provider result URL
- credit reservation/refund behavior
- security and rollout gates for a high-cost external provider

The design must be additive. Existing Kie, fal.ai, BytePlus, WaveSpeed, ElevenLabs, UVoice, and KNPLabs behavior must remain unchanged except for regression tests that prove Magnific did not disturb them.

## 2. Existing Architecture To Preserve

SmartSpecPro's media system has four layers that must stay aligned:

1. Web/admin provider management:
   - `apps/web/server/routers/mediaProviders.ts`
   - `apps/web/scripts/seed-media-providers.ts`
   - shared helpers in `apps/web/server/services/mediaProviderUtils.ts`
2. Web model catalog and request shaping:
   - `apps/web/scripts/seed-media-models-*.ts`
   - `apps/web/server/services/modelRegistry.ts`
   - `apps/web/server/services/mediaGenerationService.ts`
   - `apps/web/server/routers/media.ts`
   - `apps/web/server/routers/mediaModels.ts`
3. Frontend dynamic inputs:
   - `apps/web/client/src/lib/mediaModelInputs.ts`
   - `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`
   - existing Media Studio picker controls
4. Python runtime and polling:
   - `python-backend/app/llm_proxy/gateway_unified.py`
   - `python-backend/app/llm_proxy/providers/`
   - `python-backend/app/tasks/media_tasks.py`

The closest precedent is WaveSpeed. Magnific should follow that pattern: strict provider identity normalization, relative-only endpoint config, static fallback model seeds, provider-specific Python client, gateway branch, polling recovery branch, and focused tests.

## 3. Canonical Contracts

### 3.1 Provider Identity

Use:

- canonical provider id: `magnific`
- display name: `Magnific`
- default base URL: `https://api.magnific.com`
- auth header: `x-magnific-api-key`
- supported media types: `image`, `video`
- aliases: `magnific_api`, `magnific-ai`, `magnific_ai`

Provider normalization must be implemented in both TypeScript and Python:

- TypeScript: shared provider helper in `mediaProviderUtils.ts`, then reused by media providers, media model routers, model registry, and media generation service.
- Python: `LLMGateway._normalize_provider_id()` and Magnific provider helpers.

### 3.2 Endpoint Metadata

Every Magnific model seed must use explicit endpoint metadata. The provider must not infer API paths from display names or categories.

Endpoint metadata shape:

```ts
type MagnificEndpointConfig = {
  submit: string;
  list?: string;
  status?: string;
};
```

Async records:

- `endpoint.submit` is the exact POST path.
- `endpoint.list` is the exact GET list path when available.
- `endpoint.status` is the exact status path template with `{taskId}`.
- `dispatchMode` is `async-polling`.

Sync records:

- `endpoint.submit` is required.
- `endpoint.list` and `endpoint.status` are omitted.
- `dispatchMode` is `sync`.

### 3.3 Model Families And Selectable Records

Concrete endpoint records are selectable. Family alias records may exist only for grouping or migration compatibility and must not be selectable.

Use these family rules:

- Kling 3 Pro/Standard: `modelFamily: "magnific/kling-v3"`
- Kling 3 Omni generation/reference variants: `modelFamily: "magnific/kling-v3-omni"`
- Kling 3 Motion Control Pro/Standard: `modelFamily: "magnific/kling-v3-motion-control"`
- Kling 2.6 Motion Control Pro/Standard: `modelFamily: "magnific/kling-v2-6"`
- Wan 2.7 text/image/reference variants: `modelFamily: "magnific/wan-v2-7"`
- Veo 3.1 text/image/reference and fast variants: `modelFamily: "magnific/veo-3-1"`
- Skin Enhancer Creative/Faithful/Flexible: `modelFamily: "magnific/skin-enhancer"`

This resolves the original spec inconsistency where Veo sometimes used separate family ids per mode.

### 3.4 Readiness And Enablement

The Magnific provider row is disabled by default.

For model rows:

- seed records as admin-visible
- set `pricingStatus: "estimated"`
- set `pricingSource: "magnific-docs-or-admin"`
- set `pricingLastReviewedAt`
- preserve admin-edited `enabled`, pricing, and tenant policy overrides on rerun
- keep expensive video and video-upscaler rows disabled for regular users until staging smoke tests pass
- include `readinessReason` for any disabled or provisional row

## 4. Web Provider And Catalog Work

### 4.1 Shared Magnific Helpers

Add Magnific constants and helper functions in `apps/web/server/services/mediaProviderUtils.ts`.

Required helpers:

- canonical provider id and default base URL
- provider alias normalization
- base URL normalization that requires public HTTPS and strips trailing slash
- relative endpoint path validation
- model seed builder returning all Magnific model seed definitions
- provider `availableModels` builder for Admin Media Providers
- output extractor defaults by result type
- input field builders for repeated field sets such as prompt, negative prompt, image references, video references, duration, resolution, aspect ratio, seed, and numeric controls

Keep these helpers additive. Do not change WaveSpeed or ElevenLabs exports except to share generic validation only when tests prove no behavior drift.

### 4.2 Provider Template And Seed Row

Update:

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/scripts/seed-media-providers.ts`
- related tests

Provider template must include:

- `providerName: "magnific"`
- `displayName: "Magnific"`
- `providerType: "multimodal"`
- `baseUrl: "https://api.magnific.com"`
- default model such as `magnific/mystic`
- `availableModels` from the Magnific seed helper
- disabled default state

Connection testing must:

- decrypt the stored API key
- call an authenticated Magnific endpoint
- send `x-magnific-api-key`
- treat success only as a valid authenticated response
- map `401`, `403`, `429`, timeout, and unexpected response bodies to sanitized admin messages

Preferred probes:

- `GET /v1/ai/mystic`
- or `GET /v1/ai/image-upscaler-precision`
- or another documented authenticated list endpoint

The test must never report success from unauthenticated CORS/preflight or generic reachability.

### 4.3 Model Seed Script

Create `apps/web/scripts/seed-media-models-magnific.ts`.

The seed script must:

- build concrete model records from shared Magnific seed helpers
- support dry-run mode
- insert missing records by stable `modelId`
- update provider/model metadata on rerun
- preserve admin-edited `enabled`, pricing, and tenant policy fields
- preserve manually edited provider policy overrides
- mark provisional pricing explicitly
- print a summary by family, dispatch mode, readiness, and enabled default

Expected model record groups:

- image generation
- image edit/enhancement
- sync Remove Background
- video generation and reference-to-video
- video motion-control
- video upscaler

The seed script must also carry an exact expected inventory of concrete selectable model ids. Dry-run and test output must compare generated ids to this inventory so a partial seed cannot pass accidentally. The required phase-one count is 34 concrete records:

- image/image-edit/sync records: `magnific/mystic`, `magnific/seedream-v5-lite`, `magnific/seedream-v5-lite-edit`, `magnific/nano-banana-pro`, `magnific/nano-banana-pro-flash`, `magnific/z-image-turbo`, `magnific/upscaler-creative`, `magnific/relight`, `magnific/style-transfer`, `magnific/remove-background`, `magnific/image-expand`, `magnific/skin-enhancer-creative`, `magnific/skin-enhancer-faithful`, `magnific/skin-enhancer-flexible`, `magnific/change-camera`
- video records: `magnific/kling-v3-pro`, `magnific/kling-v3-standard`, `magnific/kling-v3-omni-pro`, `magnific/kling-v3-omni-standard`, `magnific/kling-v3-omni-reference-pro`, `magnific/kling-v3-omni-reference-standard`, `magnific/kling-v3-motion-control-pro`, `magnific/kling-v3-motion-control-standard`, `magnific/kling-v2-6-motion-control-pro`, `magnific/kling-v2-6-motion-control-standard`, `magnific/wan-v2-7-text-to-video`, `magnific/wan-v2-7-image-to-video`, `magnific/wan-v2-7-reference-to-video`, `magnific/veo-3-1-text-to-video`, `magnific/veo-3-1-text-to-video-fast`, `magnific/veo-3-1-image-to-video`, `magnific/veo-3-1-image-to-video-fast`, `magnific/veo-3-1-reference-to-video`, `magnific/video-upscaler-precision`

Pricing metadata must preserve provenance:

- `pricingStatus: "estimated"`
- `pricingSource: "magnific-docs-or-admin"`
- `pricingLastReviewedAt`
- default provisional conversion `creditCost = ceil(providerPriceUsdOrEur * 1000)` with a minimum of 1 credit
- duration/resolution/frame-sensitive pricing matrices in `configJson.pricing`
- admin-edited pricing always overrides seeded provisional pricing

### 4.4 Static Fallback Metadata

Update:

- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`

Fallback metadata must include the same routing, pricing, inputFields, dispatch, endpoint, output extractor, and readiness fields needed by runtime and UI. DB miss must not make Magnific requests fall through to Kie or lose pricing reservations.

## 5. Frontend And Web Validation

### 5.1 Dynamic Inputs

Reuse the existing `configJson.inputFields` pipeline. Only extend it when Magnific needs a generic field behavior that existing providers can also safely use.

Likely needed checks:

- `image_urls` max item caps and required states
- `video_urls` max item caps and required states
- array fields for multi-shot, multi-prompt, elements, or mixed references
- mode-specific visibility metadata for Skin Enhancer and other variants when represented as one visible family
- numeric slider/stepper metadata for angles, zoom, strength, sharpening, smart grain, and directional expand fields

Prefer concrete model records for endpoint/pricing variants instead of complex UI mode switching.

### 5.2 Server-Side Validation

Web-side validation must reject invalid user-controlled inputs before provider submission. Do not rely on frontend constraints alone.

Validation should cover:

- prompt/negative prompt lengths
- required image/video/reference inputs by model
- max reference image/video counts
- duration, resolution, aspect ratio, seed, angle, zoom, and 0-100 control ranges
- file format and size limits where known
- `use_google_search_tool` only on Nano Banana models
- arbitrary `webhook_url` rejection/downscoping
- public HTTPS URL validation and redirect safety for provider-facing URLs

### 5.3 Mystic LoRA UX

Expose Mystic LoRA controls only through documented payload mappings:

- `styling.styles[]`
- `styling.characters[]`
- prompt `@character` syntax where appropriate

Do not send undocumented top-level `style_lora_id` or `character_lora_id`.

If `structure_reference`, `style_reference`, or a LoRA-incompatible Mystic model is selected, the UI/server must warn or disable LoRA controls because Magnific may silently ignore them.

Phase one includes read-only LoRA discovery when the authenticated `GET /v1/ai/loras` endpoint is available. The implementation must cache LoRA metadata server-side with a short TTL, expose discovered entries through server-controlled UI metadata, sanitize provider discovery errors, and fall back to optional text inputs when discovery is unavailable. Do not add LoRA create/update/delete or training UI.

## 6. Python Runtime Work

### 6.1 Magnific Provider Client

Create `python-backend/app/llm_proxy/providers/magnific_provider.py`.

The provider client should expose:

```python
class MagnificProvider:
    async def generate_image(self, model_id: str, payload: dict) -> dict: ...
    async def edit_image(self, model_id: str, payload: dict) -> dict: ...
    async def generate_video(self, model_id: str, payload: dict) -> dict: ...
    async def upscale_video(self, model_id: str, payload: dict) -> dict: ...
    async def remove_background(self, payload: dict) -> dict: ...
    async def get_task_status(self, model_id: str, task_id: str, media_type: str) -> dict: ...
    async def aclose(self) -> None: ...
```

The provider owns:

- base URL normalization
- `x-magnific-api-key` auth header
- timeout configuration
- endpoint registry lookup
- payload construction from normalized request fields
- response normalization
- status mapping
- output extraction
- sanitized error messages
- retryable vs terminal error classification

It must not:

- log API keys
- log signed URLs or base64 media inputs
- expose raw provider bodies to users
- build paths from display names
- follow redirects blindly for provider-facing input validation

### 6.2 Gateway Routing

Update `python-backend/app/llm_proxy/gateway_unified.py`.

Before adding gateway submit paths, perform a persistence audit for media task/result storage:

- confirm whether existing JSON/result fields can store `provider_task_id`, provider id, provider model id, endpoint metadata, dispatch mode, reserved credits, pricing snapshot, normalized pricing inputs, and sanitized submission metadata
- if existing fields are sufficient, add recovery tests proving the metadata survives worker restart and DB reload paths
- if a migration is required, add a dedicated migration subsection with rollback, data compatibility, and backfill/default behavior before runtime submit code lands

Required behavior:

- resolve `magnific` from explicit provider hints, DB model rows, static fallback metadata, and Magnific model id prefixes
- route image generation/edit/enhancement models to the Magnific image/edit path
- route video generation and video-upscaler models to the Magnific video path
- route Remove Background through a sync path that completes in one request lifecycle when possible
- return normalized responses compatible with existing media tasks
- persist provider task id for async submissions
- include enough sanitized submission metadata for recovery
- make retry/replay behavior idempotent: once a provider task id is persisted, retry paths must resume polling instead of submitting a duplicate provider job

### 6.3 Polling And Recovery

Update `python-backend/app/tasks/media_tasks.py`.

Polling must:

- identify Magnific tasks from `result_data.submission.provider == "magnific"` or model id/provider metadata
- rebuild the Magnific provider client from admin provider config
- call the model-specific `endpoint.status`
- map statuses:
  - `CREATED` -> queued
  - `IN_PROGRESS` -> processing
  - `COMPLETED` -> completed
  - `FAILED` -> failed
  - `CANCELLED` / `CANCELED` -> failed
- honor `Retry-After` for 429/5xx where present
- apply bounded backoff by task type
- fail and refund on timeout
- download/re-host outputs before marking completed

Remove Background must not enter long-running polling unless the existing media task audit model requires a short-lived internal task record.

## 7. Asset Handling, Security, And Billing

### 7.1 Input Asset Normalization

Before submit:

- convert uploads/library assets to provider-accessible public HTTPS URLs or documented base64 payloads
- scope signed URLs narrowly and keep them short-lived
- validate provider-facing URLs after redirect resolution
- reject private, loopback, link-local, metadata-service, internal, `host.docker.internal`, `.local`, and `.internal` hosts
- enforce documented size/type limits where possible

### 7.2 Result Re-Hosting

After completion:

- download provider result URLs immediately
- validate content type and size
- store results in platform storage
- return only platform-hosted URLs in user-visible payloads
- preserve secondary output URLs only after re-hosting and only in non-sensitive metadata

Remove Background URLs expire quickly and must be downloaded within the sync request lifecycle.

### 7.3 Billing

Billing must:

- pre-reserve credits before provider submission
- store `reservedCredits`, `pricingSnapshot`, and normalized pricing inputs
- recompute actual cost after completion if output duration/resolution is known
- refund over-reservation
- refund provider failure, timeout, validation failure after reservation, and re-host failure
- never auto-charge more than reserved without a separate audited path
- make terminal refund handling idempotent so repeated failure handlers cannot refund twice

Video/upscaler pricing must be conservative while Magnific official pricing is provisional or admin-supplied.

### 7.4 Observability

Add structured logs and metrics for:

- provider submit
- provider poll
- completion
- failure
- timeout
- re-hosting success/failure
- refund
- connection test

Logs must include provider id, model id, provider task id where available, sanitized terminal reason, and timing. Logs must not include secrets, signed URLs, or base64 payloads.

## 8. Delivery Sequence

Implement in this order:

1. Provider constants, normalization, endpoint validation, and seed builders.
2. Provider template, seed provider row, and connection test.
3. Model seed script and static fallback metadata.
4. Frontend/server dynamic input and validation support.
5. Python Magnific provider client.
6. Python gateway routing for image/edit/video/upscaler/sync flows.
7. Celery polling/recovery and result re-hosting.
8. Billing/refund, observability, and rollout diagnostics.
9. Regression and release gates.

This order keeps representation and pricing stable before runtime execution is introduced.

## 9. Verification Strategy

Web checks:

- provider template includes Magnific
- seed provider script includes Magnific disabled by default
- connection test sends `x-magnific-api-key`
- model seed dry-run prints all expected concrete records
- seed rerun preserves admin overrides
- static fallback metadata resolves Magnific provider and pricing
- Media Studio input parsing supports required Magnific field shapes
- invalid references/durations/resolutions/counts are rejected
- existing providers still normalize and price correctly

Python checks:

- Magnific provider builds exact endpoint URLs from registry entries
- auth header is correct
- submit and status response normalization handles representative image, sync, video, and upscaler shapes
- unknown completed result shapes fail closed
- private/reference URLs are rejected
- gateway routes Magnific model ids to Magnific
- polling status mapping, retry-after, timeout, and refund behavior are covered
- re-hosting is required before completion

Release gates:

- `npm --prefix apps/web run check`
- targeted Vitest provider/model/input/pricing tests
- targeted pytest provider/gateway/media task tests
- seed dry-run
- staging smoke test with one image model, Remove Background, one video model, and Video Upscaler Precision if quota allows
- confirm no provider-hosted URLs in user-visible final responses

## 10. Rollout And Rollback

Rollout:

1. Merge code with provider disabled.
2. Run provider and model seed scripts.
3. Configure encrypted API key in Admin Media Providers.
4. Run authenticated connection test.
5. Enable one low-cost image model for admins.
6. Verify submit, poll, re-host, billing, media history, and refund behavior.
7. Enable image/edit/sync models.
8. Enable video models with conservative concurrency caps.
9. Enable video upscaler last.

Rollback:

1. Disable Magnific provider.
2. Disable all `provider = 'magnific'` media models.
3. Stop scheduling new submissions.
4. Let in-flight tasks finish unless cost containment requires stopping.
5. If immediate stop is required, mark in-flight tasks failed with refund and terminal reason `provider_disabled_rollback`.
6. Keep seeded rows for audit and future re-enable.

Unless Magnific cancellation support is verified in official docs during implementation, rollback must assume already-submitted external jobs cannot be cancelled. Local disable/refund actions stop SmartSpecPro delivery and protect users, but provider-side sunk cost may still need finance/support reconciliation. Emit rollback-stop observability with provider task id and sanitized terminal reason for that reconciliation.

## 11. Plan Self-Review Result

Plan self-review round 1:

- Structural Integrity: PASS. Components and file locations are explicit.
- Completeness vs Spec: PASS. Provider, catalog, UI, Python runtime, polling, security, billing, rollout, and verification are covered.
- Implementability: PASS. The implementation order and contracts are concrete without including full code.
- Internal Consistency: PASS. Provider id, model family rules, readiness defaults, and webhook scope are consistent.
- Edge Cases: PASS. External failure, sync temporary URLs, SSRF, timeout, retry-after, refund, and result extraction failures are covered.

Self-review required no structural rewrite beyond normalizing Veo family and Mystic LoRA contract. A later plan-completeness review was integrated before implementation to add schema/persistence audit, exact model inventory, pricing provenance, LoRA discovery scope, retry idempotency, rollback cost containment, and smoke-test prerequisites.
