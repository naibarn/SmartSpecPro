# Section 04: Simulation, Replay, and Exceptions

## Overview

This section implements the safety layer that makes workpack promotion credible and debuggable.

It consumes the canonical workpack contracts from section 01 and the compiler/router output from section 03, then adds:

1. fixture-backed simulation
2. trace replay and expected-vs-actual comparison
3. drift and mismatch classification
4. a unified exception record path
5. replay-grade run ledger persistence for later promotion and debugging

The section must stay deterministic at the plan level. It should not add a new freeform agent planner, and it should not re-encode runtime behavior that already belongs to workflow, browser, hybrid, agency, or desktop execution paths.

## Files to create or modify

| File | Action | Purpose |
|---|---|---|
| `apps/web/server/services/workpackSimulationService.ts` | Create | Execute fixture-backed simulation against a compiled workpack plan and emit structured results |
| `apps/web/server/services/workpackReplayService.ts` | Create | Replay prior runs, compare expected vs actual steps, and classify divergence |
| `apps/web/server/services/workpackExceptionService.ts` | Create | Normalize exceptions into a single workpack exception model and persist them with run context |
| `apps/web/server/services/workpackLedgerService.ts` | Create | Persist replay-grade execution ledgers and step-level artifacts for simulation/replay/debugging |
| `apps/web/server/routers/workpack.ts` | Create | Expose simulation, replay, exception inbox, and ledger-related actions |
| `apps/web/server/services/__tests__/workpackSimulationService.test.ts` | Create | Simulation success/failure and fixture coverage |
| `apps/web/server/services/__tests__/workpackReplayService.test.ts` | Create | Expected-vs-actual diffing, drift classification, and replay behavior |
| `apps/web/server/services/__tests__/workpackExceptionService.test.ts` | Create | Unified exception normalization and fail-closed routing |
| `apps/web/server/services/__tests__/workpackLedgerService.test.ts` | Create | Ledger persistence shape, artifact capture, and replay-grade history |
| `apps/web/server/routers/__tests__/workpack.test.ts` | Create | Router wiring, authorization, and stable payload shapes |

## Implementation details

- Treat the compiled plan from section 03 as the simulation/replay input. Do not recompute execution routing inside this section.
- Use the shared ledger shape from section 01 as the source of truth for planned steps, actual steps, approvals, connector response summaries, side-effect classification, and artifact references.
- Persist each simulation and replay as a distinct run record, with enough detail to explain:
  - which planned step was attempted
  - what runtime path was selected
  - which approval or policy boundary intervened
  - what side effect was attempted
  - what evidence or artifact was produced
  - how the observed outcome differed from the expectation
- Keep simulation fixture-driven. A workpack should be able to run against masked or synthetic inputs before it is allowed to graduate to supervised or autonomous execution.
- Apply the data-governance rules from Section 01 before any fixture, artifact, or connector summary is persisted. Replay and simulation records should carry sensitivity, access-scope, retention, and de-identification metadata instead of assuming all evidence is equally shareable.
- Make replay comparison explicit and structured. The diff should distinguish at minimum between:
  - missing step
  - extra step
  - step order drift
  - output drift
  - approval drift
  - connector/auth mismatch
  - schema mismatch
  - browser/layout instability
  - policy-boundary violation
  - transient operational failure
- Reuse the existing browser policy and live-browser vocabulary where browser-heavy flows fail. Do not introduce a separate browser exception taxonomy for workpacks.
- Normalize exception records into one workpack exception model that always binds:
  - workpack id
  - workpack version
  - run id
  - simulation or replay id when available
  - reason code
  - risk class
  - drift or mismatch category
  - human next action
  - remediation or replay pointer
- Classify failures in a fail-closed way. Unknown states should become explicit exceptions instead of silent fallback, automatic promotion, or implicit retry.
- Replay must default to inspection-only behavior. It should compare evidence, reconstruct intent, and surface divergence without re-emitting live external side effects. Any live re-execution must happen through a fresh run path with current connector validation, fresh approvals, and a new idempotency decision.
- Keep the exception inbox and replay lab logic presentation-friendly by exposing compact summaries plus drill-down details. The router should return normalized records rather than raw internal service state.
- Use the ledger service to store the minimum replay-grade history needed for deterministic debugging. That history should be sufficient to reconstruct the intent path without duplicating the full runtime stack.
- Keep connector response summaries and artifact references version-scoped so later benchmark promotion can compare runs across workpack versions.
- If an incident control or kill-switch interrupts a workpack, persist that stop condition as explicit blocked or cancelled replay context rather than collapsing it into a generic failure.
- Where a run cannot be replayed faithfully because source fixtures, permissions, or connector state are missing, record that as an explicit replay failure with a remediation pointer rather than as a generic internal error.

## Tests to write first

- Fixture-backed simulation tests.
  - A valid compiled workpack plan with seeded fixtures produces a successful simulation result and a stable step summary.
  - A fixture with a blocked connector, missing permission, or failed browser step produces an explicit exception category rather than a silent partial success.
- Replay diff tests.
  - Expected and actual step sequences compare into deterministic diff output.
  - Step-order drift, output drift, and approval drift are classified separately.
  - Browser-heavy failures reuse existing browser-policy vocabulary in the exception output.
  - Inspection-only replay never triggers live write adapters or connector mutations.
- Exception normalization tests.
  - The service converts raw service/runtime failures into the unified workpack exception shape.
  - Unknown or unclassified failures fail closed and still produce a usable reason code and next-action pointer.
  - Exception records always carry workpack and run context.
- Ledger persistence tests.
  - Planned steps, actual steps, approvals, artifact references, and connector summaries survive a round trip through the ledger service.
  - Replay-grade records remain stable enough to explain a later simulated or real run.
  - Sensitive evidence is redacted or scope-limited according to the Section 01 governance contract before it is persisted or returned.
- Router tests.
  - Simulation, replay, and exception endpoints authorize correctly and return normalized payloads.
  - Error responses stay structured and do not leak raw internal stack traces.
  - Incident-interrupted runs return an explicit blocked or cancelled state with a remediation pointer.

## Dependencies

- **Upstream:**
  - Section 01 for shared workpack contracts, lifecycle vocabulary, replay-grade run ledger shape, and exception categories.
  - Section 03 for compiler output, runtime preference, fallback selection, and execution plan shape.
- **Downstream:**
  - Section 06 for learning and benchmark promotion, which consumes the simulation, replay, and exception evidence produced here.
  - Section 07 for operator-facing replay lab and exception inbox UI surfaces.
  - Section 08 for telemetry and promotion-readiness gating based on run outcomes and exception history.

## TDD expectations

- Write the tests before the implementation for each service slice, starting with ledger and replay because they define the debugging contract used by the rest of the section.
- Keep the service-level tests narrowly scoped with mocked compiler output, fixture inputs, and deterministic timestamps or ids where needed.
- Prefer unit tests for diffing, classification, and normalization logic. Add router tests only after the underlying services can be exercised directly.
- Make the simulation and replay tests assert on stable shapes, not incidental message strings, so later copy edits do not break the safety contract.
- Add coverage for the fail-closed path. A workpack that cannot be classified should still produce a structured exception and should not reach autonomous promotion.

## Implementation notes

- Simulation should be treated as a preflight execution mode, not as a separate runtime.
- Replay should be treated as an evidence-preserving inspection mode, not as a resubmission path.
- Exception handling should stay centralized so later sections can route every blocked or ambiguous workpack step into one consistent inbox.
- Keep the ledger schema intentionally strict. If a new side-effect or artifact field is needed later, add it deliberately rather than allowing the replay history to become a freeform blob.
- Preserve compatibility with existing workflow, browser, hybrid, agency, and desktop execution surfaces by referencing their outputs and policy signals instead of duplicating them.
- Unscrubbed fixtures may remain available for tenant-local debugging where policy allows, but they should stay blocked from benchmark publication and broader sharing until later sections clear them explicitly.
