# Section 02: Provider Assets Data and API

## Goal

Persist Gemini Omni Character and Audio assets as first-class provider assets, not raw text IDs.

Also persist Production Director runs and downstream projections as first-class records. Production planning, approval, verification, and output routing must not live only in browser state or opaque storyboard JSON.

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
- Add reconciliation state for provider-created assets that fail local persistence or need retry.
- Add paginated, searchable, filterable, stable-sorted asset list APIs.
- Add production persistence for:
  - production runs
  - production goal versions
  - planner outputs
  - plan verifier results
  - asset plans
  - approval events
  - downstream Storyboard Review / Video Edit projection mappings

## Data Shape

### Provider Assets

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
- `reconciliationStatus` or equivalent pending/orphan/quarantined marker
- `contractVersion` or equivalent schema version where useful for future migrations
- `deletedAt`
- timestamps

Indexes/constraints:

- unique tenant/provider/capability/provider asset ID
- index tenant/asset type/status for pickers
- index tenant/owner/status for private asset listing
- index deleted/retention fields for cleanup jobs
- index search/sort fields needed by asset picker and admin inspection

### Production Persistence

Recommended tables or equivalent normalized durable records:

- `media_production_runs`
- `media_production_goal_versions`
- `media_production_plan_versions`
- `media_production_plan_verifications`
- `media_production_asset_plans`
- `media_production_approvals`
- `media_production_output_projections`

Required `media_production_runs` fields:

- `tenantId`
- `ownerUserId`
- `productionRunId` or internal ID
- `status`
- `goalVersionId`
- `approvedPlanVersionId`
- `storyboardRunId`
- `finalProviderPlan`
- `qualityGateSummary`
- `budgetSummary`
- `contractVersion`
- timestamps

Required goal/plan version fields:

- `productionRunId`
- `version`
- `payload`
- `redactedPayload` or display-safe summary when raw payload retention is disabled
- `source`: user, template, planner, verifier, admin, system
- `changedFields`
- `inputHash`
- `outputHash`
- `evidenceRefs`
- `retentionExpiresAt`
- `createdBy`
- `createdAt`

Required verification fields:

- `productionRunId`
- `planVersionId`
- `verdict`
- `score`
- `blockingIssues`
- `warnings`
- `targetedRevisionMap`
- `creditRiskSummary`
- `approvalReadiness`
- `skillRunId` or execution reference when available
- `contractVersion`
- `inputSummary`
- `inputHash`
- `redactedPromptSummary`
- `tokenUsage`
- `creditCost`
- `retentionExpiresAt`
- timestamps

Required approval fields:

- `productionRunId`
- `planVersionId`
- `approvalStatus`
- `actorUserId`
- `actorRole`
- `acceptedWarnings`
- `overrideReason`
- `riskScore`
- `estimatedCredits`
- `policySnapshot`
- timestamps

Required output projection fields:

- `productionRunId`
- `storyboardRunId`
- `surface`: `storyboard_review` or `video_edit`
- `surfaceRecordId`
- `sourceOutputHash`
- `projectionVersion`
- `syncStatus`
- `lastSyncedAt`
- `lastError`
- timestamps

Indexes/constraints:

- unique production run per tenant/internal ID
- unique goal or plan version per run/version
- index tenant/owner/status for production run lists
- index run/status/updatedAt for resume and support views
- unique output projection per run/surface/source output hash where practical
- index projection surface/surfaceRecordId for reverse lookup from Storyboard Review or Video Edit

## Files Likely Touched

- `apps/web/drizzle/schema.ts`
- new Drizzle migration
- `apps/web/server/routers/media.ts` or a dedicated router
- new `apps/web/server/services/mediaProviderAssetsService.ts`
- new production run/plan persistence service
- new production output projection service
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
- provider-success/DB-failure path creates a reconciliation record without exposing duplicate assets
- reconciliation retry is idempotent and does not double-charge
- asset list pagination/search/filter/sort is deterministic
- selected asset validation returns a submission snapshot suitable for historical generation records
- production run creates durable goal version and status
- planner output creates a durable plan version with input/output hashes
- plan verifier result persists with verdict and targeted revision map
- production persistence stores redacted/display-safe summaries when raw payload retention is disabled
- production evidence refs point to normalized evidence records instead of raw marketplace DOM/OCR blobs by default
- retention cleanup can expire planner/verifier raw payloads while keeping audit-safe hashes, summaries, approvals, and output lineage
- approval event persists accepted warnings, actor, policy snapshot, risk score, and estimated credits
- output projection mapping is idempotent for Storyboard Review and Video Edit
- saved production run can be reopened without relying on local storage
- stale projection sync cannot overwrite newer Storyboard Review comments or Video Edit user edits

## Completion Criteria

- UI can request saved Gemini Omni Character and Audio assets.
- Production Director can resume planning, approval, generation, review, and output handoff from durable server state.
- Video generation can validate selected assets server-side before credit reservation.
- Asset records are safe for retries, tenant isolation, and future audit.
- Asset lifecycle is safe for delete/restore/purge and does not leak cross-tenant existence.
- Provider asset creation is resilient to split-brain external/local failures.
- Historical generation records can retain stable asset snapshots independent of later asset edits.
