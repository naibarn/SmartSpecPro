# TDD Discipline

Use test-first or test-backed implementation for behavior changes that can
regress. This reference makes TDD strict where it matters without blocking
documentation-only or purely visual work.

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

1. Define the expected behavior in a test, scenario, or audit assertion.
2. Confirm the check fails or is currently absent.
3. Implement the minimum change.
4. Run the narrow check.
5. Refactor only after the check passes.

## Anti-Patterns

- Writing broad implementation first and adding a shallow test afterward.
- Skipping tests for routing/gate logic because the change is "just docs".
- Marking a behavior change complete with only structural validation.

