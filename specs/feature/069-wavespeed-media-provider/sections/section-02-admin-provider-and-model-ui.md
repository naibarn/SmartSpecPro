# Section 02: Admin Provider and Model UI

## Goal

Expose WaveSpeed cleanly in the admin and user-facing web experience by:

- adding the provider template and connection test
- seeding the launch model metadata
- making Media Studio read and enforce the launch model’s input contract

This section assumes Section 01 already established canonical provider naming and static fallback behavior.

## Files in scope

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- the script or migration path used to seed media models

## Implementation requirements

### 1. Provider template

Add a `PROVIDER_TEMPLATES` entry for:

- `providerName: "wavespeed_ai"`
- `displayName: "WaveSpeedAI"`
- `providerType: "multimodal"`
- `baseUrl: "https://api.wavespeed.ai/api/v3"`

The template description should position WaveSpeed as a media-generation provider, not a generic LLM/chat provider.

### 2. Dedicated connection test

Implement a provider-specific health-check helper for WaveSpeed. It must:

- normalize the configured base URL using the Section 01 rule
- call `GET {normalizedBaseUrl}/balance`
- send `Authorization: Bearer <apiKey>`
- treat success only as:
  - HTTP `200`
  - valid JSON response
  - numeric `data.balance`

Expected failure handling:

- `401`: invalid or missing API key
- `403`: authenticated but not authorized for the resource/account
- `429`: rate-limited or temporarily throttled
- other non-2xx: generic API error that includes status code and a short response summary

Do not use the generic provider test path for WaveSpeed.

### 3. Launch-model seed contract

Seed the launch model `wavespeed-ai/cinematic-video-generator` with:

- display name `Seedance 2.0 Grade Cinematic Video Generator`
- provider `wavespeed_ai`
- type `video`
- durations `5`, `10`, `15`
- aspect ratios `16:9`, `9:16`, `4:3`, `3:4`
- credit tiers derived from the official published prices:
  - `5s = 800`
  - `10s = 1600`
  - `15s = 2400`

Required `configJson` keys:

- `apiPayloadFormat: "wavespeed"`
- `generateType: "text-to-video"`
- `providerModelId: "wavespeed-ai/cinematic-video-generator"`
- `apiEndpoint: "/wavespeed-ai/cinematic-video-generator"`
- `apiQueryEndpoint: "/predictions/{requestId}/result"`
- `apiConfig.provider: "wavespeed_ai"`
- `pricingFormula: "per_duration"`
- `pricingTiers`
- `nativeAudio: true`
- `useSyncMode: false`

Required `inputFields`:

- prompt field
- optional `image_urls` field synchronized from `reference_images`
- `aspect_ratio` select field
- `duration` select field

The image field must carry a shared hard-cap hint such as `maxItems: 4` so the client and server can derive the same rule.

The admin model path must also enforce endpoint metadata safety before save:

- `apiEndpoint` and `apiQueryEndpoint` must remain relative-only
- absolute URLs are invalid
- protocol-relative values are invalid
- traversal such as `..` is invalid
- only the allowlisted polling placeholder family is permitted

This should be enforced in server-side persistence logic even if the admin form continues to expose free-text inputs.

### 4. Media Studio behavior

Media Studio should treat the launch model as a normal video model while still allowing optional images.

Required behavior:

- prompt-only generation remains valid
- one to four images enables image-guided generation
- switching to the launch model with more than four selected images should immediately clamp or reject the extras
- model input parsing should preserve the image-cap metadata

Do not solve this with a WaveSpeed-only UI branch if the same behavior can be expressed through model metadata plus small helper logic.

### 5. Web-router validation

The launch model needs stricter validation than the current generic five-image video schemas. Implement model-aware validation so that:

- more than four reference images are rejected for the launch model
- unsupported aspect ratios are rejected for the launch model
- unsupported durations are rejected for the launch model
- other providers retain their current behavior
- absolute reference-image URLs are validated as public-safe before outbound provider use
- relative `/uploads/...` or equivalent tenant-local paths are resolved through the existing public-URL flow before outbound provider use

The validation should happen after the selected model is known, so the stricter WaveSpeed rules do not become a global regression.

## Tests to write first

- Vitest: `PROVIDER_TEMPLATES` contains the WaveSpeed entry.
- Vitest: the WaveSpeed connection helper calls `/balance` with bearer auth.
- Vitest: the helper accepts `200` with numeric `data.balance`.
- Vitest: the helper returns actionable failure messaging for `401`, `403`, and `429`.
- Vitest: media model create/update validation rejects unsafe `apiEndpoint` and `apiQueryEndpoint` values.
- Vitest: seeded model metadata includes all required runtime/pricing keys.
- Vitest: `mediaModelInputs.ts` recognizes WaveSpeed image support and preserves the four-image cap metadata.
- Vitest or jsdom test: Media Studio clamps or rejects the fifth image when the WaveSpeed model is selected.
- Vitest: web-router validation rejects invalid image count, aspect ratio, and duration for the launch model only.
- Vitest: web-router validation rejects unsafe absolute reference-image URLs while still allowing tenant-local relative paths.

## Acceptance criteria

- Admin users can create or seed a WaveSpeed provider from the UI.
- Admin connection testing uses the official balance endpoint and returns meaningful results.
- The launch model is represented with complete metadata for UI, pricing, and runtime layers.
- Media Studio supports both T2V and image-guided generation for the same model while enforcing the four-image cap.
- Unsafe editable endpoint metadata is rejected before persistence or execution.

## Implementation Notes

Implemented in:

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/__tests__/mediaModels.persistence.test.ts`
- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/scripts/seed-media-models-wavespeed.ts`
- `apps/web/package.json`

Deviation from plan: the launch model was seeded through a dedicated idempotent script plus `npm --workspace apps/web run seed:media:wavespeed` instead of a migration. This keeps the DB row aligned with the shared helper contract while matching the existing media seeding workflow.

## Tests

- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/routers/__tests__/mediaModels.persistence.test.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
