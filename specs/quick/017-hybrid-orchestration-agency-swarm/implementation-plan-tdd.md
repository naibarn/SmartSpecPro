# TDD Plan

## Test-first targets

### 1) Router decision tests
Add or update tests so the routing layer can:
- detect hybrid-worthy requests
- choose a new hybrid route or strategy
- keep normal chat and plain swarm paths unchanged

Expected failing condition before implementation:
- hybrid requests still route only to agency/swarm or only to skill/chat

### 2) Hybrid plan contract tests
Add tests for the shared orchestration brief/plan shape:
- required fields are present
- workflow stages and swarm stages are distinguishable
- validation metadata is preserved

Expected failing condition before implementation:
- plan objects are incomplete or inconsistent between callers and consumers

### 3) Agency execution tests
Add backend tests to confirm:
- workflow remains the commit boundary
- swarm proposals cannot bypass approvals
- topology handling still supports existing agency graph modes

Expected failing condition before implementation:
- a swarm output is treated as final without a workflow gate

### 4) UI command tests
Add UI tests for:
- new hybrid command/button visibility
- preview modal or panel rendering
- approve / cancel actions

Expected failing condition before implementation:
- no UI surface exists for the hybrid orchestration command

### 5) Regression tests
Protect existing behavior:
- regular chat routing
- single-skill routing
- existing agency escalation
- existing agency review and social publishing flows

## Mocking / fixtures
- Mock the routing layer for hybrid decisions.
- Mock agency service responses for staged plan previews.
- Use small fixture plans with two or three stages only.

## Verification sequence
1. Write tests for the routing and plan contract first.
2. Implement shared plan types and coordinator logic.
3. Add backend handoff/approval behavior.
4. Add the UI command surface.
5. Run router, backend, and UI test subsets before broader regression checks.

