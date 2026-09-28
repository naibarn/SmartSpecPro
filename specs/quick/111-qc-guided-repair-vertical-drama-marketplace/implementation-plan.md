# Implementation plan

## Objective

Implement the approved repair lifecycle without broad refactoring:
`plan -> confirm -> bounded repair -> deterministic validation -> durable new
candidate -> fresh QC -> explicit selection` for Vertical Drama and Marketplace.

## Workstreams

### 1. Shared contracts and Skill boundaries

Extend Marketplace QC report/state/history with an additive deterministic repair
plan and repair lifecycle fields. Keep the existing Vertical plan contract but
make the repair operation consume server-derived plan data. Add or align repair
mode language/schema in both Skill mirrors. Add pure tests for plan derivation,
legacy parsing, bounded paths, and no-safe-plan behavior.

### 2. Vertical Drama

Refactor the QC service entry points so a user repair executes exactly one
revise call and one fresh evaluate call against a source ledger version. Add
repair operation metadata, parent version lineage, stale/fingerprint checks,
and a durable result that is selectable through the existing owner-scoped
candidate selection path. Keep the old active candidate when the repaired report
is not better or does not pass. Add the router/job wiring with idempotent
request handling and focused service/router regressions.

### 3. Marketplace

Persist baseline/evaluated candidate artifacts and references in Creative QC
state/history. Add a repair outbox operation and worker that validates the
source state, runs one revise plus one evaluate, and persists a non-active
candidate. Add owner-scoped selection of a passed repaired artifact; selection
advances the existing staged plan revision and invalidates downstream derived
media state. Preserve the existing approval gate and add service/router tests
for stale sources, product truth/shot contract rejection, no improvement, and
idempotency.

### 4. UI and regression proof

Add confirmation, progress, error, score comparison, changed-field/repair-plan,
and explicit selection states to both panels. Thread Marketplace repair and
selection callbacks through both review panel hosts and the surface. Preserve
advisory continuation for Vertical Drama and hard approval gating for
Marketplace. Add component tests for both Thai/English labels and disabled or
stale states.

## Security and data boundaries

- Every mutation reloads the source run/draft under tenant and user ownership.
- Client fingerprints are checked against stored content and report history.
- Idempotency includes operation and source fingerprint; duplicate delivery
  returns existing state without another credit reservation.
- JSON artifacts contain normalized draft/scorecard lineage only; no raw provider
  payload is persisted.
- Existing protected-field and product-truth validators remain fail-closed.

## Acceptance criteria

- Both panels show a real repair plan and require confirmation.
- Repair cannot run from a stale/mismatched candidate.
- Exactly one bounded repair and fresh QC evaluation occur per confirmed source.
- Old content remains recoverable and active until explicit selection.
- A non-passing or lower-quality result cannot replace active content.
- Vertical selected candidates remain usable under advisory QC policy.
- Marketplace approval remains impossible until the selected candidate's QC pass
  is durable and matches the run.
- Focused tests and `git diff --check` pass for changed surfaces.

## Verification

Run focused Vitest files after each workstream, then run the combined changed
surface suites, `git diff --check`, targeted TypeScript diagnostics, and a
read-only runtime/browser proof if the existing local app is available. Report
unrelated baseline diagnostics separately.
