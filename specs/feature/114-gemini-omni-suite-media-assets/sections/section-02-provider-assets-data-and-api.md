# Section 02: Provider Assets Data and API

## Goal

Persist Gemini Omni Character and Audio assets as first-class provider assets, not raw text IDs.

## What This Section Must Change

- Add `media_provider_assets` table.
- Add a provider asset service.
- Add routes/procedures for list, create, validate, and soft delete.
- Enforce tenant/user ownership.
- Support picker-friendly return records.
- Add idempotency support for asset creation retries.
- Add unique and picker-oriented indexes.
- Add owner/admin authorization for list, use, update, delete, restore, and purge.
- Add retention/restore/purge lifecycle fields compatible with existing media/library policy.

## Data Shape

Required fields:

- `tenantId`
- `ownerUserId`
- `provider`
- `capability`
- `assetType`
- `providerAssetId`
- `displayName`
- `status`
- `sourceLibraryItemId`
- `thumbnailUrl`
- `sourceUrl`
- `metadata`
- `clientRequestId` or equivalent idempotency key where appropriate
- `deletedBy`
- `purgedAt` if permanent purge is represented separately
- `deletedAt`
- timestamps

Indexes/constraints:

- unique tenant/provider/capability/provider asset ID
- index tenant/asset type/status for pickers
- index tenant/owner/status for private asset listing
- index deleted/retention fields for cleanup jobs

## Files Likely Touched

- `apps/web/drizzle/schema.ts`
- new Drizzle migration
- `apps/web/server/routers/media.ts` or a dedicated router
- new `apps/web/server/services/mediaProviderAssetsService.ts`
- optional admin/provider asset inspection surface
- server tests

## Tests

- list returns only current tenant assets
- validate accepts correct Gemini Omni asset capabilities
- validate rejects deleted/wrong-tenant/wrong-capability assets
- soft delete hides assets from normal picker responses
- create stores provider IDs and metadata
- repeated create retry does not duplicate assets
- provider metadata is redacted/safe to persist
- normal users cannot list/use/delete assets they do not own
- tenant/domain admins can inspect sanitized tenant assets when authorized
- restore and purge are authorized, idempotent, and audited
- soft-deleted assets are excluded from generation validation

## Completion Criteria

- UI can request saved Gemini Omni Character and Audio assets.
- Video generation can validate selected assets server-side before credit reservation.
- Asset records are safe for retries, tenant isolation, and future audit.
- Asset lifecycle is safe for delete/restore/purge and does not leak cross-tenant existence.
