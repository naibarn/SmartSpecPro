# Section 07 — Integration Verification and Handoff

## Scope

พิสูจน์ end-to-end flow และ cross-section contracts หลัง sections 01–06 เสร็จ โดยไม่แก้ production series และไม่กลบ baseline repository failures

## Owned files/modules

- focused integration tests for story bible/episode pipeline/routers
- component and Playwright evidence from Section 06
- migration/check reports and plan completion artifacts

## End-to-end scenarios

1. New series: full-story architect emits seed -> approved outline -> ledger planner -> versioned ledgers/slots -> bounded script prompt -> explicit episode actions -> memory observation -> deterministic reconcile -> semantic review -> evidence projection.
2. Semantic repair: reviewer rejects weak payoff/romance/power shift -> one targeted repair -> pass or user review; no cross-episode rewrite.
3. Legacy series 21: read-only audit -> future-horizon proposal -> user disposition/approval -> append-only future plan; episodes 1–25 unchanged.
4. Failure: stale version, unauthorized series, malformed model output, credit/rate-limit failure, locked episode; prior state remains intact.

For the new-series path, verify that the slot carries a validated duration profile/vector for 9 logical shots, speech budgets are derived per shot, and episode runtime is calculated from render mapping rather than a fixed 60/90-second assumption. Verify the legacy 60-second profile remains readable without becoming the canonical rule for new plans.
5. Flag matrix: off, plan-only, audit-only, enforced and kill switch.

## Cross-section consistency checks

- shared type names and status values match Section 01 everywhere
- seed fields in Section 02 are not mistaken for approved `storyControl`
- episode action names in Section 03 match reconciler input in Section 04
- legacy classification in Section 05 matches UI labels in Section 06
- read-only/event-log boundaries are preserved in router and component tests
- no two sections create the same source file or a second ledger namespace

## Test commands and proof

Use focused `npm test --workspace apps/web -- <paths>` commands for changed service/shared/component tests, targeted Playwright for the UI route, `git diff --check`, and scoped type diagnostics. Run broader checks only as time/risk permits; report unrelated baseline failures separately.

## Data safety proof

Use transaction/snapshot fixtures or a disposable test database for integration. Verify no production `vertical_drama_series`, episode, memory event or breakdown version changes during benchmark/audit tests. Verify append-only version behavior and stale-write rejection.

## Handoff acceptance

The implementation can be handed off only when:

- focused contract, planner, script, reconcile, legacy, auth and UI tests pass
- browser evidence exists or explicitly records unavailable/skipped checks
- current series 21 audit is read-only and future-only
- feature flags and kill switch are verified
- no unresolved cross-section interface mismatch remains
- implementation notes identify any repository-wide baseline failure without presenting it as a scoped pass

## UI/UX Contract

### Target User / JTBD
N/A — integration verification; UI behavior is verified by Section 06.

### Existing Pattern Reference
N/A — no new UI is designed here.

### Surface Inventory
N/A — no route/component ownership.

### Component Map
N/A — no browser component.

### State Matrix
N/A — integration states are covered by service/router tests.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — browser accessibility is covered by Section 06.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — consume Section 06 browser evidence artifact.
