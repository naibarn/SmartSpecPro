# Section 02: Storyboard Review Persistence and Provenance

## Goal

Make Storyboard Review final composite state server-owned and identity-safe.
This fixes the recurring class of bugs where the UI opens the wrong product,
loses dragged MP4 assignments after refresh, or falls back to visually similar
projects.

## In Scope

- Scoped HyperFrames state under `reviewData.hyperframesFinalComposite`.
- exact MVP JSON subdocument keys: `schemaVersion`, `canonicalProductId`,
  `autoReviewRunId`, `storyboardReviewProjectId`, `revision`, `updatedAt`,
  `shotMediaAssignments`, `textVariables`, `creativePlanHash`, and latest
  render job refs.
- companion table or explicit-column promotion includes `createdAt`, `updatedAt`,
  and optional `deletedAt` lifecycle fields.
- Revision-based updates and conflict projection.
- Shot MP4 assignment persistence for drag/drop, replace, import, and manual
  selection.
- Canonical product/run/storyboard validation.
- Legacy/corrupt row audit and cleanup classification.
- Migration decision gate for optional companion table.

## Out of Scope

- Final render worker changes.
- Rich preview UI.
- Automatic repair by title, latest row, thumbnail, or visual similarity.

## Existing Files To Review

- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0169_media_studio_storyboard_reviews.sql`
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- canonical-link helpers such as `normalizeStoryboardReviewCanonicalLinks` and
  existing save paths such as `saveStoryboardReview`

## Test First

Add failing tests for:

- scoped update creates `reviewData.hyperframesFinalComposite`;
- update requires product id, run id, storyboard review id, tenant/user identity,
  and expected revision;
- product/run mismatch rejects the update;
- mixed Auto Review run ids reject the update;
- opened projects verify `reviewData.marketplaceContext.productId` and
  `marketplace_auto_review_runs.storyboardReviewId` against the requested
  product/run/storyboard id before enabling HyperFrames actions;
- shot assignment persists and reloads after refresh;
- render cannot start with unsaved or failed assignments;
- stale revision returns conflict;
- legacy audit classifies rows as valid, repairable, delete-only, or unknown;
- delete/archive cleanup never deletes finalized Library media.

## Implementation Notes

Use the existing canonical-link normalization before accepting HyperFrames state
updates. Do not store raw remote URLs as final source media. Imported URLs must
be staged or normalized to managed refs.

The persisted state must carry `marketplaceContext`, canonical product id, Auto
Review run id, Storyboard Review project id, and assignment refs from the first
Marketplace Auto Review handoff. It should never reconstruct identity from
project title, thumbnail, latest timestamp, or visually similar media.

If state is promoted to a companion table, preserve the spec key shapes
`(tenantId, userId, storyboardReviewProjectId, productId, runId)` and
`(userId, storyboardReviewProjectId, productId, autoReviewRunId)`.

If the JSON subdocument becomes too risky, promote to a companion table only
after dry-run SQL, backfill, dual-read, dual-write, cutover, rollback SQL, and
drift tests are written.

## Acceptance Criteria

- Refreshing Storyboard Review restores assigned MP4 clips and edited text.
- Wrong product/run rows fail closed with user-visible copy.
- No fallback path can switch the project by title or latest record.
- Conflicts are visible and non-destructive.
- Cleanup reports clearly list rows that should be recreated instead of
  repaired.

## Rollback Notes

Disable scoped mutation API and ignore `reviewData.hyperframesFinalComposite`.
Existing Storyboard Review data remains usable.
