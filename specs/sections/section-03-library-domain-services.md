# Section 03 - Library Domain Services

## Objective

Implement domain-level library services for CRUD, ACL, metadata normalization, and source-link validation.

## Implemented Scope

- Added `libraryService` with tenant-scoped domain operations:
  - create/get/update/soft-delete item
  - share permission upsert
- Added ACL helpers for read/manage decisions with explicit tenant boundary checks.
- Added metadata normalization utility for consistent persistence shape.
- Added source-link idempotency handling during create to prevent duplicate item creation.
- Added new tRPC `libraryRouter` and wired it into `appRouter`.

## Actual Files Added

- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/libraryService.test.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/routers/library.test.ts`
- `specs/reviews/section-03-review.md`
- `specs/reviews/section-03-interview.md`

## Actual Files Modified

- `apps/web/server/routers.ts`

## Key Implementation Notes

1. Tenant-scoped CRUD enforcement:
- Service-level lookup always includes `library_items.tenant_id` filter.
- Soft delete and updates require manage rights and never cross tenant boundaries.

2. ACL model behavior:
- `public` and `team` visibility are readable for in-tenant actors.
- `private` visibility requires owner/admin or explicit `library_permissions` grant.
- Manage actions require owner/admin or `write|owner` permission grants.

3. Source-link idempotency:
- `createLibraryItem` checks existing `(link_type, link_id)` link first.
- If existing link resolves to same tenant item, returns idempotent existing item.
- If link belongs to different tenant, request is rejected.

4. Metadata normalization:
- Trims strings, removes null/undefined fields, normalizes/deduplicates `tags`.
- Keeps deterministic key processing to reduce shape drift in persisted JSON metadata.

## Tests Added (TDD)

Service tests:
- `normalizeLibraryMetadata` consistency
- ACL unauthorized read rejection
- duplicate source-link idempotency
- tenant boundary retrieval guard
- unauthorized update guard

Router tests:
- actor context propagation into service call
- missing-tenant rejection
- `getItem` not-found handling
- `shareItem` success path

Run command used:
- `npm run -w @smartspec/web test -- server/services/libraryService.test.ts server/routers/library.test.ts`

Result:
- 9 passed

## Deviations from Initial Plan

1. Section implemented as tRPC router + domain service in Node runtime only.
- Rationale: aligns with plan runtime split where API/domain writes live in web runtime; Python service integration remains for later sections.

## Remaining Follow-ups

- Add integration tests hitting `libraryRouter` via authenticated caller + real DB fixtures.
- Extend ACL subject resolution for group/team role grants when tenant role model is finalized.
