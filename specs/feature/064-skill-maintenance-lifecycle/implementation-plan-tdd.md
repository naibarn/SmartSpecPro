# TDD Guidance: Feature 064 - Skill Maintenance Lifecycle

## Test-first order

1. Schema and data-model tests for maintenance tables.
2. Analyzer unit tests for recommendation generation and quality scoring.
3. Compatibility gate tests that prove breaking changes are blocked.
4. Router tests for analyze/list/detail/apply/dismiss procedures.
5. Admin UI tests for Analyze / View Advice / Apply Upgrade actions.
6. Scheduler tests for maintenance sweeps.
7. GenJS migration tests for bundle output, tooling metadata, and fixture verification.
8. Regression tests for orchestration config persistence and runtime previews.

## Core tests to cover

- analyzing a skill creates a recommendation record
- repeated analysis updates the queue without losing history
- required input-field removal is blocked by the compatibility gate
- required output-field removal is blocked by the compatibility gate
- low-risk docs/tests-only recommendations can be marked safe-to-apply
- Admin Skills table shows Analyze and View Advice actions
- Maintenance tab lists queued recommendations with filters
- apply flow records a maintenance run and updates status
- schedule runner scans multiple skills without applying breaking changes
- GenJS candidate analysis recommends migration only for suitable skills
- GenJS migration preview includes bundle files and fixture tests
- orchestration config edits persist and round-trip through the edit form

## Regression checks

- existing skill edit flow remains functional
- existing ISC proposal queue remains functional
- existing sandbox-command execution remains functional
- existing folder import / sync remains functional
- existing public and private visibility behavior remains functional

## Verification gates

For each implementation slice:

1. unit tests pass
2. route or UI integration tests pass
3. compatibility assertions pass
4. no unrelated Admin Skills flows regress
5. implementation review confirms no input/output contract drift for existing skills

## Slice-by-slice test mapping

### Slice 1

- schema definition tests for all new maintenance enums and tables
- migration file sanity check if the repo already validates migration inventory

### Slice 2

- analyzer unit tests for deterministic scoring
- compatibility snapshot hashing tests
- GenJS candidate detection tests

### Slice 3

- router tests for analyze/list/detail/dismiss
- permission tests for admin-only access

### Slice 4

- Admin Skills UI tests for action visibility
- queue rendering tests
- detail panel preview tests

### Slice 5

- apply runner tests for direct-apply vs proposal mode
- blocked compatibility tests
- verification-failure tests

### Slice 6

- schedule CRUD tests
- sweep runner tests
- reminder/backlog summary tests

### Slice 7

- GenJS migration planner tests
- bundle file inventory tests
- fixture generation tests
- tool/bootstrap expectation tests

### Slice 8

- orchestration config round-trip tests
- cross-slice regression tests
- final queue/apply lifecycle tests
