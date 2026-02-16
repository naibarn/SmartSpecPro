# Section 04: pgvector Migration and Tenant RLS

## Objective
Implement safe pgvector rollout on the primary database with explicit migration verification, strict tenant RLS enforcement, and rollback-ready controls.

## Scope
- Add `vector` extension and required vector tables/indexes.
- Define tenant RLS policies with deny-by-default posture.
- Provide migration verification checks and preflight gates.
- Implement rollback procedure and restore verification for migration failures.
- Preserve non-destructive expand->migrate/backfill->contract sequencing.

## Out of Scope
- Campaign backfill orchestration (Section 05).
- Switch readiness/cutover policy (Section 06).

## Dependencies
- section-01-provider-abstraction-foundation

## Implementation Tasks
1. Author additive migration scripts for extension/table/index creation with idempotent guards.
2. Add tenant RLS policies for select/insert/update/delete and verify policy scope.
3. Implement preflight checks for extension privileges and capacity headroom requirements.
4. Add migration verification script(s) for object existence and policy behavior.
5. Define rollback migration path and verification checklist for restoration.
6. Document operational constraints (index build windows, lock sensitivity, ownership).

## TDD-First Test Stubs
- Migration creates extension/tables/indexes when prerequisites are met.
- Migration fails fast and clearly when privilege requirements are missing.
- RLS allow-case passes for same-tenant operations.
- RLS deny-case blocks cross-tenant read/write/update/delete.
- Rollback script restores expected pre-migration schema state.
- Verification suite detects missing objects or policy drift.

## Risk Controls
- Treat DB impact as high-risk and require backup snapshot before migration execution.
- Keep schema changes additive until downstream backfill/cutover gates pass.
- Validate RLS deny cases before any production read-provider cutover.

## Done Criteria
- pgvector schema objects and RLS policies exist and verify cleanly.
- Migration/rollback checks are automated and repeatable.
- Tenant isolation negative tests pass at DB boundary.

## As-Built (2026-02-16)

### Actual files changed
- `python-backend/migrations/006_pgvector_tenant_rls.py`
- `python-backend/tests/unit/migrations/test_pgvector_tenant_rls_migration.py`
- `apps/web/server/__tests__/migrationOrdering.test.ts`

### Deviations from plan
- Verification and RLS allow/deny coverage are implemented as deterministic query templates and unit-level snapshot validation rather than live Postgres integration execution in CI.
- Migration orchestration continues using repository migration scripts (not Alembic revision graph) to stay consistent with existing migration workflow.
- Extension rollback is explicit opt-in (`--drop-extension`) to avoid destructive impact when shared by other features.

### Tests added/updated
- Added: `python-backend/tests/unit/migrations/test_pgvector_tenant_rls_migration.py`
  - extension/table/index/RLS SQL generation coverage
  - preflight privilege and capacity failure behavior
  - verification drift detection for missing indexes/policies
  - rollback SQL coverage and RLS validation query templates
- Updated: `apps/web/server/__tests__/migrationOrdering.test.ts`
  - migration ordering now expects `006_pgvector_tenant_rls.py` as latest Python migration
  - asserts migration contains pgvector + RLS contract markers

### Known follow-ups
- Run migration verification against a live Postgres environment with pgvector installed to execute allow/deny RLS queries end-to-end.
- Wire migration preflight/verification helpers into deployment automation so failures block rollout before cutover.
