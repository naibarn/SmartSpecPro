# Section 06: Import Conversion and Compatibility

## Objective
Provide safe read-only access for existing Office files and a one-time conversion path to editable internal presentation format.

## Dependencies
- `section-02-schema-and-persistence`
- `section-03-backend-api-and-services`

## Implementation Scope
- Implement read-only open path for existing ppt/pptx source items.
- Implement one-time conversion endpoint to internal presentation model.
- Add conversion idempotency key semantics and source-level locking.
- Persist conversion fidelity metadata and immutable source attachment linkage.
- Add explicit unsupported `.ppt` guidance behavior.

## Test-First Stubs (Write Before Implementation)
- Test: existing ppt/pptx item opens read-only without mutating source state.
- Test: repeated conversion requests with same idempotency context return one converted deck.
- Test: concurrent conversion attempts are serialized by source lock.
- Test: unsupported constructs surface `partial_fidelity` markers and warnings.
- Test: `.ppt` legacy files return explicit unsupported guidance contract.

## Implementation Tasks
1. Add compatibility route behavior for office source opens.
2. Add conversion service pipeline from source asset to internal slide payload.
3. Implement idempotency/locking persistence behavior.
4. Attach source fidelity metadata and conversion status fields.
5. Add conversion warning/error response catalog for frontend UX.

## Acceptance Criteria
- Read-only compatibility path preserves source file fidelity.
- One-time conversion is retry-safe and duplicate-safe.
- Partial fidelity is surfaced explicitly when applicable.
- `.ppt` unsupported path is clear and actionable.

## Risks and Mitigations
- Risk: duplicate converted decks from retries.
- Mitigation: idempotency keys + source lock + dedicated tests.

## Out of Scope
- Full-fidelity round-trip PowerPoint editing.
- Legacy `.ppt` conversion support.

## As-Built Implementation Notes

### Files Changed
- `apps/web/server/services/presentationCompatibilityService.ts`
- `apps/web/server/services/presentationCompatibilityService.test.ts`
- `apps/web/server/services/presentationPersistence.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/routers/presentation.test.ts`
- `apps/web/shared/presentation/constants.ts`
- `apps/web/shared/presentation/contracts.ts`

### Delivered Behavior
- Added compatibility endpoint behavior:
  - native presentation items open as editable
  - `.pptx` office items return read-only compatibility with conversion availability
  - `.ppt` office items return deterministic unsupported guidance
- Added conversion endpoint behavior with deterministic statuses:
  - `created`: first successful conversion for source
  - `existing`: existing converted deck reused (idempotent replay)
  - `locked`: concurrent conversion request serialized by source lock
  - `unsupported`: legacy `.ppt` guidance returned
- Added source attachment persistence for converted decks:
  - source linkage (`sourceLibraryItemId`)
  - source format
  - conversion status
  - partial fidelity flag and warning list
- Added shared schema-version constants/contracts for compatibility/conversion parser stability.

### Deviations from Plan
- Source conversion lock/idempotency cache is process-memory scoped in this section; durable cross-instance lock orchestration is deferred to later hardening/operations work.

### Tests Added/Updated
- `apps/web/server/services/presentationCompatibilityService.test.ts`
  - read-only pptx compatibility path
  - `.ppt` unsupported guidance path
  - idempotent conversion replay behavior
  - source-lock serialization behavior
  - partial-fidelity warning propagation
- `apps/web/server/routers/presentation.test.ts`
  - compatibility endpoint contract forwarding
  - conversion endpoint typed input forwarding and result shape
