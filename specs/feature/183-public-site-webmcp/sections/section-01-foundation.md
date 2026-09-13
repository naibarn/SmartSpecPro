# Section 01 — Foundation, route policy and adapter

Dependencies: none

Read ../spec.md, ../route-matrix.md and ../tool-contracts.md.

## Ownership

App.tsx integration, proposed client/src/features/public-webmcp/{adapter,contracts,routePolicy,config}.ts and focused tests. Proposed paths are implementation targets, not existing artifacts. Shared App.tsx/contracts edits belong to section 01 integrator.

## Work

Audit endpoint anonymous visibility; define explicit projection fields and register/cleanup ownership. Implement native feature detection, default-off configuration, schema bounds and epoch cancellation.

## TDD

Adapter/policy tests including API absence, StrictMode, async unmount race, private route rejection and refresh disable. See ../implementation-plan-tdd.md for commands and fixture boundaries.

## Acceptance

No registrations outside allowlist, no throw without API, no global account data projection.

## Risk

Draft browser API changes and accidental access widening are release blockers. Revalidate current sources before edits. Preserve unrelated work; no production mutation or paid call.
