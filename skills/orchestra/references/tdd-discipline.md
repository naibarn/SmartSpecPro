# TDD Discipline

Use test-first or test-backed implementation for behavior changes that can
regress. This reference makes TDD strict where it matters without blocking
documentation-only or purely visual work.

## Test Design Before Implementation

Before implementation begins, create a requirement-to-test matrix for every
behavior-changing task. The matrix belongs in the active plan or its linked
`orchestra/test-design.md` artifact and must contain, for each requirement:

- the observable behavior and source requirement
- the test level: unit, contract, integration, E2E, or manual/runtime proof
- the exact test file/assertion and command that will provide evidence
- the expected RED failure before implementation
- the residual proof boundary: what this test cannot establish

The designer must consider the applicable paths below before choosing tests:

- happy path and representative real input
- invalid input, boundary values, and malformed state
- error, timeout, retry, and recovery behavior
- authorization, tenant isolation, and data ownership
- state transitions, idempotency, and concurrency/race behavior
- persistence, queue/outbox, external-provider, and process-restart boundaries
- events, logs, metrics, and user-visible error evidence

Do not use a coverage percentage as a substitute for this matrix. A test that
only asserts an internal call, mocks away the behavior under test, has no
meaningful assertion, or covers only the happy path of a failure-prone feature
does not satisfy the contract.

## Strict TDD Required

Use red-green-refactor when changing:

- routing decisions
- security gates
- tenant isolation or auth behavior
- data transformations
- orchestration behavior
- skill behavior tests
- bug fixes with a reproducible failure

## Test-Backed Acceptable

Test-backed implementation is acceptable for:

- documentation references
- agent prompt definitions
- visual polish where behavior is manually verified
- skill registry updates covered by `skills/audit-skills.sh`

## Workflow

1. Define the expected behavior in the requirement-to-test matrix.
2. Write the smallest failing test, scenario, or audit assertion.
3. Confirm the check fails or is currently absent and save the decisive RED evidence.
4. Implement the minimum change.
5. Run the narrow check and record the GREEN evidence.
6. Review test adequacy against the matrix before broadening the gate set.
7. Refactor only after the check passes; rerun every stale gate after review fixes.

## Test Design Gate

The conductor must block implementation when a behavior-changing task has no
test design, no failure-proof path, or no declared reason why a requested
runtime/browser/provider proof is unavailable. Documentation-only and purely
visual tasks may use the test-backed or manual-proof paths above, but the
exception and its residual risk must be recorded.

## Anti-Patterns

- Writing broad implementation first and adding a shallow test afterward.
- Skipping tests for routing/gate logic because the change is "just docs".
- Marking a behavior change complete with only structural validation.
