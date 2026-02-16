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
