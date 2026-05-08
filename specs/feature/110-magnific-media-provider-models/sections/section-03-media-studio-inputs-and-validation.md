# Section 03: Media Studio Inputs And Validation

## Goal

Make Magnific model controls render through the existing generic input system and enforce provider constraints on the server.

## Files In Scope

- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.test.tsx`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/mediaModels.ts`
- `apps/web/server/__tests__/media-ssrf-validation.test.ts`
- any shared validation helper introduced in sections 01/02

## Implementation Requirements

### 1. Input fields

Use `configJson.inputFields` for all Magnific controls. Prefer existing field types:

- `select`
- `text`
- `number`
- `boolean`
- `image_urls`
- `video_urls`
- `array`

Add parser support only if Magnific metadata exposes generic properties that the parser currently drops, such as min/max/step, mode visibility, allowed extensions, or helper text.

### 2. Reference pickers

Reference image/video fields must use existing upload/library picker flows. Do not ask users to enter raw JSON arrays.

Required picker-backed scenarios:

- Seedream edit reference images
- Nano Banana reference images
- Mystic style/structure references
- Kling/Wan/Veo reference-to-video inputs
- motion-control image + video references
- video upscaler source video

### 3. Server validation

Server-side validation must enforce:

- prompt and negative prompt maximum lengths
- required references by concrete model
- max reference image/video counts
- allowed durations, resolutions, aspect ratios
- seed numeric range
- 0-100 control ranges
- Change Camera angle/zoom ranges
- Remove Background image format/size contract when known
- `use_google_search_tool` only on Nano Banana models
- no user-supplied arbitrary `webhook_url`

### 4. Mystic LoRA mapping

Model input metadata can expose friendly LoRA selectors/text inputs, but request construction must map them to documented Magnific structures:

- `styling.styles[]`
- `styling.characters[]`
- prompt `@character` syntax where applicable

Phase one includes read-only LoRA discovery when `GET /v1/ai/loras` is available:

- fetch LoRA metadata server-side with Magnific auth
- cache it with a short TTL
- expose sanitized options to Media Studio through server-controlled metadata
- fall back to optional text inputs when discovery fails or the provider is unavailable
- never expose API keys, provider raw errors, or LoRA management actions

If the selected Mystic mode/reference combination would silently ignore LoRAs, show a readiness/help message or remove those controls for that combination.

## TDD First

Write tests:

- Magnific input fields parse with defaults and max item caps
- reference fields sync to existing reference image/video state
- invalid durations/resolutions/aspect ratios are rejected
- invalid URL hosts are rejected
- arbitrary `webhook_url` is ignored/rejected
- Mystic LoRA fields do not produce undocumented top-level payload fields
- LoRA discovery cache success/failure paths render safe selector or fallback controls
- existing provider input parsing tests still pass

## Acceptance

This section is complete when Media Studio can render Magnific controls from seed metadata and server validation rejects invalid or unsafe Magnific requests before any provider call.

## Implementation Status

Status: COMPLETE

Implemented files:

- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.test.tsx`
- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`

Implemented behavior:

- Preserved generic input metadata for `maxLength`, numeric `min/max/step`, and `allowedExtensions`.
- Applied numeric constraints in the existing generic model input panel.
- Added Magnific field metadata for negative prompts, Nano Banana Google Search, Change Camera controls, Image Expand controls, and reference media file hints.
- Added Magnific-aware server validation for required references, reference counts, unsafe reference URLs, resolutions, select options, numeric ranges, text length, Google Search model gating, and webhook/callback rejection.
- Preserved existing provider behavior for DB rows with `configJson: null`.

Verification:

- `npm --prefix apps/web test -- client/src/lib/mediaModelInputs.test.ts client/src/components/media/ModelInputFieldsPanel.test.tsx` passed.
- `npm --prefix apps/web test -- server/routers/__tests__/media.db-first.contract.test.ts` passed.
- Combined Section 02/03 targeted Vitest suite passed with 126 tests.
- `npm --prefix apps/web run check` passed.
- Targeted `git diff --check` passed.

Security review:

- PASS. The media generation router still requires authenticated users, rejects user-controlled Magnific webhook/callback fields, and validates reference media URLs before provider calls.

Deviations:

- Read-only Mystic LoRA provider discovery is deferred to later provider-client/runtime sections; Section 03 established safe metadata and validation groundwork but does not call Magnific APIs.
