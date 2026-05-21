# Section 01 - Database Contracts

## Objective

Create the additive database model and shared validation contracts that every backend, web, and extension section will use.

## Scope

- Add marketplace capture tables to `apps/web/drizzle/schema.ts`.
- Add SQL migration `apps/web/drizzle/0176_marketplace_capture.sql`.
- Add shared Zod/type contracts in `apps/web/shared/marketplaceCapture.ts`.
- Add schema/contract tests.

## Implementation Notes

- Keep schema additive. Do not modify existing marketplace skill tables/routes.
- Use user and tenant columns on every persisted user-owned row.
- Prefer `varchar` + Zod validation for fast-evolving statuses. Use enums only if the team chooses stable DB-enforced states.
- Include idempotency fields for create draft, asset upload, analyze, and confirm.
- Include retention fields such as `rawEvidenceExpiresAt`, `deletedAt`, `deletedReason`, and `assetDeletedAt`.
- Include state-machine fields such as `analysisStatus`, `assetUploadStatus`, `lastTransitionAt`, `stateVersion`, and `errorCode`.
- Include optional variant/SKU JSON for marketplace options such as size, color, volume, bundle, selected variant price, and stock text.
- Include minimization metadata that records selected, discarded, redacted, cropped, and purge-eligible evidence groups.
- Include field-level provenance and user-edit metadata: original value, normalized value, corrected value, source asset/block IDs, confidence, edit timestamp, and edited-by user.
- Include capture payload schema version, LLM output schema version, adapter version, and parser heuristic version.
- Include migration dry-run/rollback notes with index and tenant-isolation verification queries.
- Include extension pairing/token metadata:
  - `marketplace_extension_pairing_codes`
  - `marketplace_extension_tokens`
  - `marketplace_capture_sessions`
  - `marketplace_capture_assets`
  - `marketplace_candidate_batches`
  - `marketplace_candidate_items`
  - `marketplace_products`
  - `marketplace_product_images`
  - `marketplace_product_price_snapshots`

## Tests First

- Test shared schema accepts a valid Shopee capture draft.
- Test shared schema rejects unsupported platform/page type/asset kind.
- Test limits reject oversized DOM text and too many selected images.
- Test migration or schema exports include all required tables and key indexes.
- Test illegal status transitions and stale `stateVersion` updates are rejected by shared validators.
- Test variant/SKU contract accepts valid option rows and rejects malformed option arrays.
- Test field provenance preserves DOM, LLM, and user-edited source metadata.
- Test migration verification queries cover key indexes and tenant/user scoped lookups.

## Acceptance Criteria

- `npm --prefix apps/web run check` succeeds.
- New contracts are importable by backend and web code.
- Migration is rollback-reviewed and does not drop or alter unrelated tables.
