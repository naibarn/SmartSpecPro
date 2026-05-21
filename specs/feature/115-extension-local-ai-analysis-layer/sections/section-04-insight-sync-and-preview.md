# Section 04 - Insight Sync And Preview

Status: IMPLEMENTED

## Objective

Persist validated structured insights through the existing marketplace capture backend and show them in SmartSpecPro surfaces.

## Scope

- REST endpoint under `/api/marketplace-captures`
- optional tRPC reads/mutations in `marketplaceCapture`
- storage model for insight records
- typed insight lifecycle/read endpoints
- claim resolution/approval mutations
- capture preview/product detail UI
- storytelling handoff persistence/read contract for Feature 114
- auth, CORS, rate limit, and audit metadata

## Implementation Notes

- Prefer `POST /api/marketplace-captures/insights`.
- Require marketplace extension bearer auth and existing origin checks.
- Store structured insights separately from raw capture evidence.
- Decide implementation storage explicitly:
  - new normalized table for long-term insight history, or
  - versioned JSON on capture session as a short-term migration-light path.
- Store `idempotencyKey`, `schemaVersion`, `payloadHash`, `parentInsightIds`, insight status, and storytelling readiness.
- Add read queries by capture ID, product ID, and insight ID so Feature 114 can fetch a typed handoff.
- Add claim resolution mutations for approve, edit, remove, and request more evidence.
- Do not introduce `/api/extension/insights` unless it delegates to the same service and auth policy.
- Persist `MarketplaceStorytellingHandoff` as a first-class insight type or as a typed child record linked to the same capture/product so Feature 114 can query it without parsing generic JSON.
- Preview/product surfaces must show ProductBrief, ReviewInsight, TikTokShopTrendBrief, VideoBrief, and Storytelling readiness badges when present.
- Audit provider, insight type, capture ID, duration, and error code only.
- Do not audit product title, page text, comments, prompts, or model output.

## Tests First

- Insight sync rejects invalid provider/insight type/schema.
- Duplicate idempotency key returns the same insight record.
- Insight sync rejects missing or mismatched capture ownership.
- Raw capture is rejected unless user setting and feature flag allow it.
- Capture preview renders synced insight summary without unsafe HTML.
- Storytelling handoff sync rejects unsupported claims without evidence unless explicitly marked for user review.
- Feature 114 can read synced handoff by capture/product ID with tenant/user isolation.
- Claim approve/edit/remove changes readiness and preserves provenance.
- Existing `/api/marketplace-captures/captures` flow remains compatible.

## Acceptance Criteria

- Structured local insights can be reviewed in SmartSpecPro.
- Existing capture draft/upload/analyze endpoints are unchanged.
- Tenant/user isolation is enforced.
- Storytelling handoff is available to Media Studio without duplicating raw capture data.
- Claim review gives users a clear route from blocked storytelling back to capture/review/select-image.

## Implementation Result

- Added `marketplace_capture_insights` table in `apps/web/drizzle/schema.ts` and migration `apps/web/drizzle/0181_marketplace_capture_insights.sql`.
- Added `apps/web/server/services/marketplaceInsightService.ts` for idempotent insight sync, read-by-id, read-by-capture, read-by-product, claim resolution, and basic fallback storytelling handoff.
- Added REST routes under `/api/marketplace-captures` for insight sync/read/claim-resolution/storytelling-handoff.
- Added tRPC procedures under `marketplaceCapture` for web and Feature 114 consumers.
- Added `apps/web/client/src/pages/MarketplaceCaptureInsight.tsx` and route `/marketplace-capture/insights/:insightId` for preview and claim review.
