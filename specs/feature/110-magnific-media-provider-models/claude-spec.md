# Synthesized Specification: Magnific Media Provider And Model Catalog Expansion

Date: 2026-05-06
Status: Ready for implementation planning
Source: `spec.md`, codebase research, official Magnific docs, and planning auto-decisions.

## Objective

Add Magnific as a first-class SmartSpecPro media provider and seed Magnific image, image-edit/enhancement, video generation, and video upscaler models into the existing media provider architecture.

The feature must support:

- encrypted Magnific API key storage
- authenticated admin connection testing
- DB seed data and static fallback metadata
- model-specific Media Studio input fields from `configJson.inputFields`
- Python runtime submit/poll execution
- sync Remove Background execution
- result URL download and platform re-hosting
- credit reservation/refund
- SSRF and secret leakage protection
- conservative rollout and rollback

## In Scope

Provider:

- canonical provider id `magnific`
- aliases `magnific_api`, `magnific-ai`, `magnific_ai`
- base URL `https://api.magnific.com`
- auth header `x-magnific-api-key`
- provider template, seed row, encrypted key storage, and connection test

Model catalog:

- Mystic
- Seedream 5 Lite and Seedream 5 Lite Edit
- Nano Banana Pro and Nano Banana Pro Flash
- Z-Image Turbo
- image upscaler creative, relight, style transfer
- Remove Background
- Image Expand through Seedream 4.5
- Skin Enhancer Creative/Faithful/Flexible
- Change Camera
- Kling 3, Kling 3 Omni, Kling motion-control variants
- Kling 2.6 motion-control variants
- Wan 2.7 text/image/reference-to-video variants
- Veo 3.1 text/image/reference-to-video variants
- Video Upscaler Precision

Runtime:

- Magnific Python provider client
- gateway routing by provider/model id
- async status polling with bounded backoff
- synchronous Remove Background flow
- re-hosting before user-visible delivery
- sanitized provider errors

Security:

- public HTTPS validation for every user-supplied media URL
- redirect-chain validation for provider result downloads
- no raw API keys, signed URLs, base64 inputs, or provider-hosted result URLs in user-visible payloads or ordinary logs
- arbitrary user `webhook_url` blocked

Billing:

- provisional editable pricing
- reservation before provider submit
- refund on validation failure after reservation, provider failure, timeout, or re-host failure
- no automatic overcharge above reservation without a separate audited charge path

## Out of Scope

- Magnific Apps API
- stock content, icons, classifier, improve-prompt, image-to-prompt, lip-sync, audio APIs, MCP, x402 payments
- inbound Magnific webhook support in phase one
- LoRA training or LoRA create/update/delete UI
- replacing existing provider integrations
- exposing Magnific API keys or raw provider URLs to browsers

## Normalized Model Contract

Every Magnific seed record must include:

- `modelId`
- `provider: "magnific"`
- `modelFamily`
- `endpoint.submit`
- `endpoint.list` when async/listable
- `endpoint.status` when async
- `dispatchMode: "async-polling" | "sync"`
- `resultType: "image" | "video" | "image-set"`
- `outputExtractors`
- `inputFields`
- `validation`
- `pricing`
- `pricingStatus: "estimated"`
- `pricingSource`
- `pricingLastReviewedAt`
- `readiness`
- `readinessReason` when provisional, disabled, or contract-unverified
- `enabledDefault`

Concrete endpoint records are selectable. Family alias records may exist only for grouping or migration compatibility and must not be selectable for generation.

Veo normalization:

- all Veo 3.1 concrete records use `modelFamily: "magnific/veo-3-1"`
- concrete model ids distinguish mode and speed:
  - `magnific/veo-3-1-text-to-video`
  - `magnific/veo-3-1-text-to-video-fast`
  - `magnific/veo-3-1-image-to-video`
  - `magnific/veo-3-1-image-to-video-fast`
  - `magnific/veo-3-1-reference-to-video`

Mystic LoRA normalization:

- Product-facing LoRA controls map to documented Magnific payload structures: `styling.styles[]`, `styling.characters[]`, and prompt `@character` syntax.
- The provider must not send undocumented top-level `style_lora_id` or `character_lora_id` fields.
- UI/server validation must explain or prevent combinations where Magnific silently ignores LoRAs.
- Phase one includes read-only LoRA discovery when the authenticated `GET /v1/ai/loras` endpoint is available. Cache discovered LoRA metadata server-side with a short TTL, expose it through admin/server-controlled UI metadata, and fall back to optional text inputs when discovery fails. Do not implement LoRA create/update/delete or training.

Pricing provenance:

- Seeded provisional pricing must include `pricingStatus: "estimated"`, `pricingSource: "magnific-docs-or-admin"`, and `pricingLastReviewedAt`.
- Default provisional conversion is `creditCost = ceil(providerPriceUsdOrEur * 1000)` with a minimum of 1 credit.
- Duration, resolution, and frame-sensitive models use a pricing matrix in `configJson.pricing`.
- Admin-edited pricing always overrides seeded provisional values.

Persistence and idempotency:

- Before gateway and polling implementation, audit existing media task/result persistence and document whether current JSON metadata fields can store provider task id, endpoint metadata, reserved credits, pricing snapshots, and sanitized submission metadata.
- If current fields are sufficient, add recovery tests proving this metadata survives worker restart paths.
- If current fields are insufficient, add a migration with rollback/data compatibility tests before runtime integration.
- Retry paths must not duplicate provider submits after a provider task id is persisted, and terminal failure/refund handling must be idempotent.

Enabled default:

- The provider seed row is disabled by default.
- Model rows are seeded as admin-visible.
- Expensive video/upscaler models are disabled for regular users until staging smoke tests pass.
- All provisional pricing rows must remain admin-editable.

## Acceptance Criteria

1. Admin Media Providers includes Magnific with encrypted API-key storage.
2. Magnific connection test uses authenticated Magnific API calls and never treats unauthenticated reachability as success.
3. Magnific seed script creates concrete records for all required phase-one models.
3a. Seed dry-run asserts the exact expected concrete model id inventory and count.
4. Seed script reruns preserve admin-edited enabled state, pricing, and tenant policy overrides.
5. Static fallback metadata exists for Magnific models when DB reads fail.
6. Media Studio renders Magnific model-specific fields through `configJson.inputFields`.
7. Reference image/video controls use existing pickers, not raw JSON.
8. Python provider submits with `x-magnific-api-key`.
9. Async submissions persist `provider_task_id`, model id, endpoint metadata, and sanitized status metadata.
10. Polling maps Magnific statuses to internal queued/processing/completed/failed states.
11. Remove Background completes synchronously and re-hosts temporary URLs immediately.
12. Completed image/video/upscaler URLs are re-hosted before being returned to users.
13. Provider-hosted URLs are not exposed in user-visible final payloads.
14. Failed provider responses produce sanitized errors.
15. SSRF tests cover image, video, reference image/video, style/structure reference, and webhook-related fields.
16. Credit reservation/refund and no-overcharge rules are covered by tests.
16a. Duplicate-submit and duplicate-refund retry scenarios are covered by tests.
17. Rollout begins with provider disabled, then admin-only smoke testing, then staged enablement.
18. Existing media provider tests still pass for Kie, fal.ai, BytePlus, WaveSpeed, ElevenLabs, UVoice, and KNPLabs.
