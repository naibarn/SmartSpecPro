# Section 02 — Persistence and Migration Invariants

## Source coverage

Feature 195 sections 11–13, 28–30, 118–130, 271, 275, 279 and all data governance/index/retention requirements.

## Deliverable

Verify and extend the existing Drizzle schema only where required for canonical attempts, dispatches, outbox, provider reservations, event ordering, unique idempotency and lease queries. Use additive migrations with explicit rollback and selected-database verification.

## Files

- Modify: `apps/web/drizzle/schema.ts` only for confirmed gaps
- Create/modify: next additive migration under `apps/web/drizzle/`
- Test: migration and schema contract tests plus `jobControlPlane` persistence tests

## TDD steps

1. Write tests that reject missing constraints/indexes and destructive migration statements.
2. Run them against the current schema/migration baseline and record exact failures.
3. Add the smallest schema/migration changes, preserving existing rows and nullable backfill rules.
4. Run focused tests and inspect generated SQL/diff.

## Completion gate

`worker_jobs.id` remains the canonical ID; no parallel `coding_agent_jobs`, MCP job or Runner job table is introduced.

## UI/UX Contract

### Target User / JTBD
N/A — persistence-only section; user state is projected by section-05.

### Existing Pattern Reference
N/A — no UI is created; existing job monitor remains the reference.

### Surface Inventory
N/A — no route/component changes.

### Component Map
N/A — repository/migration layer only.

### State Matrix
N/A — persistence invariants are verified by service tests.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — browser evidence is delegated to section-05.
