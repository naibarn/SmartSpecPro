# Section 06 - Confirm Retention Audit

## Objective

Persist final marketplace products only after user confirmation, then manage evidence retention and auditability.

## Scope

- `marketplaceProductService`
- `marketplaceCaptureRetentionService`
- confirm mutation/endpoint
- audit events

## Implementation Notes

- Confirm accepts user-corrected data from web preview, not raw LLM output.
- Confirm transaction creates:
  - product row
  - product image rows
  - price snapshot row
  - capture status update to `confirmed`
- Dedupe by user/tenant/platform/external product id/source URL.
- Confirm must be idempotent for retries.
- Retention service deletes stale raw evidence for unconfirmed drafts and can delete raw evidence for confirmed captures after policy window while preserving product records.
- Audit logs should include capture/product IDs, user/tenant, action, status, and safe metadata only.
- Delete draft should remove or tombstone raw evidence assets.
- Confirmed product delete/update behavior must be explicit:
  - product delete can retain safe audit metadata while deleting raw evidence
  - rescan creates a new capture and price snapshot rather than overwriting historical evidence
  - product detail shows whether evidence is retained or purged
- Add product export contract for confirmed product JSON plus an evidence manifest.
- Confirmed products should expose field provenance so audits can tell whether a value came from DOM, LLM, or user edit.

## Tests First

- Confirm creates product/images/snapshot transactionally.
- Confirm duplicate returns existing product.
- Cross-tenant confirm fails.
- Confirm fails for wrong status unless manual policy explicitly allows.
- Retention deletes stale raw assets and records deletion metadata.
- Audit logs do not include tokens or full raw DOM/screenshots.
- Product rescan creates a new capture/price snapshot.
- Retention purge leaves confirmed product data readable while raw evidence is removed.
- Product export contains product JSON and evidence manifest without leaking bearer tokens or raw deleted evidence.
- Field provenance read API reports source and user-edit lineage.

## Acceptance Criteria

- Product save requires explicit user confirmation.
- Product list/detail can read confirmed records.
- Stale evidence cleanup is implemented or safely disabled outside production only.
