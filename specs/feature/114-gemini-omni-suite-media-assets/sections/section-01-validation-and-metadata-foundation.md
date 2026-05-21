# Section 01: Validation and Metadata Foundation

## Goal

Create the shared contract that lets Gemini Omni express suite-managed provider fields without exposing raw inputs to normal users.

## What This Section Must Change

- Extend media model input metadata with:
  - `hidden`
  - `advancedOnly`
  - `managedBySuite`
  - `assetType`
  - `assetCapability`
  - `referenceUnitWeight`
  - `maxItems`
  - `providerPayloadKey`
- Add a Gemini Omni normalization/validation helper usable by client and server.
- Normalize duration, resolution, source-video presence, image references, character IDs, audio IDs, and unit totals.
- Return structured validation errors that can be shown before credits are reserved.
- Validate upload/source constraints before provider calls, including character reference image max 20 MB and supported media types.
- Preserve provider payload spelling for `video_list[].ends` while allowing UI/internal labels to use "end".
- Validate provider-fetchable media URLs with existing SSRF-safe public URL rules before any server-side fetch or provider submission.

## Files Likely Touched

- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/shared/mediaModelPricing.ts`
- new shared Gemini Omni validation helper under `apps/web/shared`
- existing media input/pricing tests

## Tests

- metadata parser accepts new additive fields
- parser remains backward compatible with existing configs
- validation accepts valid prompt-only, image, video, character, audio, and mixed cases
- validation rejects over-quota cases before generation
- validation rejects invalid upload size/type before provider calls
- validation rejects private, loopback, link-local, metadata-service, local/internal, and unsafe redirect media URLs
- pricing tier key includes source-video presence correctly

## Completion Criteria

- Shared helpers can compute Gemini Omni reference units and pricing inputs.
- No UI has to inspect raw provider field names to validate quota.
- Existing non-Gemini model input tests still pass.
- Provider payload normalization is explicit and covered by tests, including `video_list` trim fields.
