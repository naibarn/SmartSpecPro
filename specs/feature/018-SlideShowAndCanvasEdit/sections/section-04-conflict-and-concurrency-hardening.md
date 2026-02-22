# Section 04: Conflict and Concurrency Hardening

## Objective
Implement optimistic version checks and concurrency-safe behaviors so save/reorder conflicts are explicit, recoverable, and contract-stable.

## Dependencies
- `section-02-schema-and-persistence`
- `section-03-backend-api-and-services`

## Implementation Scope
- Require `expected_version` (or equivalent) on mutating presentation/slide endpoints.
- Return `409` contract containing latest versions, latest payload, reason code, and `conflict_schema_version`.
- Apply transactional concurrency handling for slide reorder and competing write operations.
- Ensure autosave and manual save share identical conflict semantics.

## Test-First Stubs (Write Before Implementation)
- Test: stale `expected_version` returns `409` with required conflict payload fields.
- Test: `conflict_schema_version` is present and stable for parser compatibility.
- Test: concurrent reorder requests preserve uniqueness and deterministic outcome.
- Test: autosave and manual save both trigger identical conflict path behavior.
- Test: overwrite action path only proceeds when client sends refreshed expected version.

## Implementation Tasks
1. Add version precondition validation middleware/service checks.
2. Implement conflict response builder and stable schema contract.
3. Integrate conflict handling into all write endpoints (metadata, slides, content, reorder).
4. Add concurrency-safe retry/error mapping where transaction conflicts occur.
5. Document conflict payload fields for frontend usage.

## Acceptance Criteria
- All write endpoints enforce optimistic concurrency.
- Conflict responses are deterministic and versioned.
- Reorder under concurrency does not corrupt ordering invariants.
- No silent overwrite path exists without explicit client intent.

## Risks and Mitigations
- Risk: hidden last-write-wins data loss.
- Mitigation: strict version checks and explicit conflict responses.

## Out of Scope
- UI rendering of conflict modal/actions (handled in frontend section).

## As-Built Implementation Notes

### Files Changed
- `apps/web/shared/presentation/constants.ts`
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/routers/presentation.test.ts`

### Delivered Behavior
- Added optimistic version preconditions on mutating presentation routes via required `expectedVersion` input fields.
- Added stable conflict contract schema:
  - `conflictSchemaVersion: "presentation_conflict_v1"`
  - reason codes: `DECK_VERSION_MISMATCH`, `SLIDE_VERSION_MISMATCH`
  - latest deck/slide snapshots and version numbers for recovery flows.
- Added deterministic `409` mapping (`TRPCError.code = "CONFLICT"`) for version mismatches.
- Applied identical stale-version conflict semantics for manual and autosave slide update paths (`saveMode` metadata is carried through conflict payload).

### Conflict Contract Notes for Frontend
- Conflict payload is attached to the thrown conflict error cause and includes:
  - `conflictSchemaVersion`
  - `reasonCode`
  - `expectedVersion`
  - latest resource versions and snapshots (`latestDeck`, `latestSlide` when applicable)
- Overwrite/retry path requires refreshed `expectedVersion` from the latest snapshot.

### Deviations from Plan
- Transaction-level CAS for every write path remains partial; section 04 enforces optimistic checks and deterministic conflict response contracts at service boundary.

### Tests Added/Updated
- `apps/web/server/services/presentationService.test.ts`
  - stale `expectedVersion` conflict payload shape includes stable schema version
- `apps/web/server/routers/presentation.test.ts`
  - stale version maps to `CONFLICT` with `presentation_conflict_v1` payload
  - manual/autosave stale-update paths both return identical conflict semantics
