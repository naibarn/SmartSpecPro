# Section 03 - Output Validation And Local Cache

Status: IMPLEMENTED

## Objective

Validate, cache, and display local AI results safely before sync.

## Scope

- output schemas for ProductBrief, ReviewInsight, TikTokShopTrendBrief, CombinedOpportunityBrief, VideoBrief
- prompt builders
- structured generation wrapper
- local cache records in `chrome.storage.local`

## Implementation Notes

- Prefer Zod unless bundle impact forces a smaller validator.
- Prompt builders must be local templates only.
- Prompt payload target is under 25,000 characters.
- Request Thai output only as best effort; schema validation must not depend on Thai quality.
- Treat unsupported language or option errors as provider errors and fall back according to the provider decision matrix.
- Validate evidence IDs against sanitized evidence.
- Strip or reject unknown top-level fields consistently.
- Cache key: `platform + url + normalizedPayloadHash + analysisType + schemaVersion`.
- Store `rawText` only when debug setting is enabled.
- Invalid JSON gets one repair attempt only, then fallback.
- Cache must record provider and capability state so unsupported-device results do not masquerade as local AI outputs.

## Tests First

- Valid ProductBrief/ReviewInsight/TikTokShopTrendBrief/VideoBrief pass.
- Confidence outside 0..1 fails.
- Video scenes with overlapping or out-of-duration times fail.
- Unknown evidence IDs fail when evidence is provided.
- Local cache returns unchanged results and supports re-analyze.
- Unsupported language/option error falls back without caching a failed local result as success.
- Raw capture-only mode creates no local insight cache entry.

## Acceptance Criteria

- Local AI output never reaches UI/sync without validation.
- Failed local analysis preserves existing capture state.
- Cached records do not include raw HTML or prompt text.

## Implementation Result

- Added ProductBrief validator/normalizer, prompt builder, Prompt API structured generation wrapper, deterministic fallback ProductBrief, VideoBrief builder, and StorytellingHandoff builder in `apps/extension/src/shared/localAi.ts`.
- Added `chrome.storage.local` cache in `apps/extension/src/panel/App.tsx`, keyed by platform/source URL/payload hash/insight type/schema version.
- Raw model text is not cached or synced by default.
- Invalid Prompt API generation falls back to deterministic/server-path-compatible insight generation when fallback is enabled.
