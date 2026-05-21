# Final Completeness Review

## Scope

Reviewed Feature 115 for implementation readiness after the Prompt API support matrix and storytelling customer journey additions.

## Findings

### 1. Insight lifecycle needed to be queryable

The spec had a sync request but did not define how synced insights become durable records that web preview, Media Studio, and Feature 114 can query.

Auto-fix:

- Added `MarketplaceInsightStatus`.
- Added `MarketplaceInsightRecord`.
- Added recommended read endpoints by capture ID, product ID, and insight ID.
- Added idempotency, schema version, payload hash, parent insight IDs, and storytelling readiness metadata.

### 2. Blocked storytelling needed a user resolution path

The spec could block unsupported claims or image mismatch, but did not define what users do next.

Auto-fix:

- Added `MarketplaceClaimResolution`.
- Added approve/edit/remove/request-more-evidence decisions.
- Required provenance preservation for edited claims.
- Added claim review tests and acceptance criteria.

### 3. Customer-facing states needed standard names

Implementation could otherwise invent inconsistent UI states across extension, preview, and storytelling workspace.

Auto-fix:

- Added `capture_ready`, `local_ai_ready`, `fallback_ready`, `raw_capture_only`, `insight_ready`, `storytelling_ready`, `needs_claim_review`, and `storyboard_review_ready`.

### 4. End-to-end journey needed a non-technical checklist

Auto-fix:

- Added a complete user journey checklist from marketplace page to Storyboard Review, including return-to-capture when evidence is missing.

## Remaining Notes

- During implementation planning, decide whether insights get a dedicated table immediately or start as versioned JSON with a migration gate.
- If Feature 114 lands first, keep the handoff read API behind a feature flag until both sides agree on the final schema.

