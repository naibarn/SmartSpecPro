# Code Review - Section 03 (Library Domain Services)

## Scope Reviewed

- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/libraryService.test.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/routers/library.test.ts`
- `apps/web/server/routers.ts`

## Findings

1. `MEDIUM`: ACL bypass risk if tenant boundary checks are performed only at router layer.
- Mitigation applied: tenant boundary checks are enforced in service-level item lookups and ACL evaluation.

2. `LOW`: Duplicate source-link writes can create duplicate library items under retry/replay.
- Mitigation applied: pre-create source-link lookup returns existing item idempotently.

3. `LOW`: Metadata drift can fragment search/index behavior later.
- Mitigation applied: deterministic metadata normalization with tag dedupe.

## Test Coverage Added

- Service boundary + ACL tests (5)
- Router behavior tests (4)

## Residual Risks

- Router tests use mocked tRPC procedures; full middleware/auth integration path not covered here.
- Team-role ACL expansion (`tenant_role`) currently stored, but semantic group resolution remains future work.
