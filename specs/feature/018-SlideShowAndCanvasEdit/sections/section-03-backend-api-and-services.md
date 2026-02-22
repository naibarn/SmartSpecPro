# Section 03: Backend API and Services

## Objective
Deliver core presentation backend behavior (CRUD, slide operations, asset operations, lifecycle actions) through router/service layers aligned with existing tenant and library authorization patterns.

## Dependencies
- `section-01-foundation-and-routing`
- `section-02-schema-and-persistence`

## Implementation Scope
- Implement presentation router endpoints for metadata CRUD.
- Implement slide operations: add, duplicate, delete, reorder, update metadata/content.
- Implement asset attach/list operations with limit/error semantics.
- Implement service-layer orchestration that reuses library authz/tenant resolution primitives.
- Ensure stable error-code catalog for limits, type guard failures, and validation issues.

## Test-First Stubs (Write Before Implementation)
- Test: create/get/update/delete endpoints enforce tenant/library permissions.
- Test: slide CRUD endpoints preserve slide_count and order guarantees.
- Test: limit violations return stable error codes/messages for slides/assets/size constraints.
- Test: asset attach/list operations reject cross-tenant access attempts.
- Test: lifecycle-restricted resources (deleted/archived) return expected deny behavior.

## Implementation Tasks
1. Implement router procedures and input validation schemas.
2. Implement service methods for deck/slide/asset operations using section-02 persistence helpers.
3. Wire lifecycle and permission checks via existing library service patterns.
4. Map service errors to published machine-readable API errors.
5. Add endpoint documentation notes for frontend integration.

## Acceptance Criteria
- Backend endpoints provide required MVP editing surface.
- Permission and tenant isolation behavior matches existing library conventions.
- Error contracts are deterministic for frontend handling.
- Existing library/media tests remain green.

## Risks and Mitigations
- Risk: unauthorized cross-tenant access through new endpoints.
- Mitigation: mandatory tenant resolution and ownership checks in router + service.

## Out of Scope
- Conflict UI handling in frontend.
- Export worker integration details.

## As-Built Implementation Notes

### Files Changed
- `apps/web/shared/presentation/constants.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/routers/presentation.test.ts`

### Delivered Behavior
- Expanded `presentation` router with backend editing surface:
  - deck: `getDeck`, `getDeckByLibraryItem`, `createDeck`, `updateDeck`, `deleteDeck`
  - slides: `listSlides`, `addSlide`, `duplicateSlide`, `updateSlide`, `deleteSlide`, `reorderSlides`
  - assets: `listAssets`, `attachAsset`, `detachAsset`
- Added `presentationService` orchestration layer to enforce:
  - tenant-scoped deck resolution and library item access checks
  - lifecycle deny behavior for archived/deleted resources
  - write-permission checks for mutating operations
  - deterministic server-side limits for slide count, asset count, and deck byte hard-limit
- Added stable backend error-code catalog extensions for section-03 limit/permission/lifecycle semantics.

### Endpoint Notes for Frontend Integration
- Mutating procedures now return deterministic tRPC error mapping:
  - `NOT_FOUND` for missing deck/slide/resource
  - `FORBIDDEN` for lifecycle/permission/feature-disabled paths
  - `BAD_REQUEST` for validation and limit violations
- Error messages include machine-readable presentation code prefixes (for deterministic client handling).

### Deviations from Plan
- Conflict payload contract (`expected_version`, `409`, `conflict_schema_version`) is deferred to section 04 as planned.

### Tests Added/Updated
- `apps/web/server/routers/presentation.test.ts`
  - actor/tenant forwarding for deck creation endpoint
  - tenant-context requirement on deck endpoints
  - lifecycle restriction mapping to forbidden errors
  - deterministic bad-request mapping for limit violations
- `apps/web/server/services/presentationService.test.ts`
  - lifecycle-restricted resource deny behavior
  - write-permission enforcement on create flow
  - slide-limit rejection path
  - cross-tenant asset attach rejection path
