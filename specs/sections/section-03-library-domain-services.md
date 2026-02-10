# Section 03 - Library Domain Services

## Objective

Implement domain-level library services for CRUD, ACL, metadata normalization, and source-link validation.

## Scope

- Library item creation/retrieval/update/delete service methods.
- ACL and visibility enforcement helpers.
- Source-link creation and duplicate handling.
- Validation and normalization of metadata payloads.

## Primary Files

- `apps/web/server/services/` (new `libraryService` and ACL helpers)
- `apps/web/server/routers/` (library route wiring)
- `apps/web/drizzle/schema.ts` (type alignment)

## Implementation Steps

1. Introduce library service module with tenant-scoped CRUD operations.
2. Implement visibility and permission checks (`private|team|public`).
3. Implement source link attach logic for media task and future document links.
4. Add idempotency behavior for repeated add-to-library requests.
5. Return normalized domain DTOs used by API layer and UI consumers.

## Test-First Checklist

- Test: CRUD operations enforce tenant ownership boundaries.
- Test: ACL evaluator rejects unauthorized read/share/update actions.
- Test: duplicate source link attempts are safely idempotent.
- Test: metadata normalization yields consistent persisted shapes.

## Verification

- Run targeted service and router tests in `apps/web`.

## Exit Criteria

- Library domain service is stable, tenant-safe, and ready for API consumption.
