# Section 02 — Ledger Persistence

**Objective:** Persist tenant-scoped economic intent, budget/hold, account,
journal and reconciliation records with balance and idempotency constraints.

**Files:** modify `apps/web/drizzle/schema.ts`; add the next forward-only
migration under `apps/web/drizzle/`; add schema/migration tests; create
`economicLedgerService.ts` with a transaction boundary.

**Tests first:** required columns/indexes/unique keys; unbalanced journal
rejection; cross-tenant reference rejection; duplicate idempotency; append-only
correction/reversal; migration ordering and rollback documentation.

**Implementation contract:** journal writes are atomic, balanced and immutable;
all records carry tenant scope and correlation; correction uses reversal or
adjustment rather than update/delete. Do not replace legacy Credits tables.

**Acceptance:** schema tests and migration checks pass against the repository's
existing Drizzle conventions; no destructive SQL is added.

## UI/UX Contract

### Target User / JTBD
N/A; persistence is not directly user-facing.
### Surface Inventory
N/A; no browser surface changes.
### Component Map
N/A; data is consumed by projections.
### State Matrix
N/A; callers receive explicit ledger/reconciliation states.
### Responsive Matrix
N/A; no layout changes.
### Accessibility Acceptance
N/A; no interactive element.
### Copy Contract
Status/reason codes are localizable downstream.
### Browser Evidence Required
N/A for backend-only work.
