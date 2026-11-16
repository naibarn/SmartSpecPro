# Section 03 — Core API and LIVE Integration

## Deliverable

Authenticated workspace-scoped Harness catalog and execution data in the existing R03 LIVE Mission Control, with exact Task Control deep links and separate Demo fixtures.

## Scope

- Platform contracts, repository, Hono authenticated routes and route tests.
- Existing `MissionControlLivePage` and exact Task Control link/return context.

## Prerequisites

- Section 02 authorized SQL read functions.

## Evidence / remaining gaps

- Versioned Core catalog contract, authenticated workspace-scoped Hono API, and separate LIVE Mission Control catalog projection are implemented and covered by platform tests/typechecks.
- No client-provided identity is authority; no lifecycle mutation is added. Genuine instance/execution data remains pending until a separately scoped Modular Runner is available.
