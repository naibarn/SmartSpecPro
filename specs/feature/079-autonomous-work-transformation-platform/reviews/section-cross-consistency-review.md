# Section Cross-Consistency Review

Date: 2026-04-10
Reviewed artifacts:

- `sections/section-01-shared-contracts-and-persistence.md`
- `sections/section-02-intake-and-playbook-drafting.md`
- `sections/section-03-workpack-compiler-and-routing.md`
- `sections/section-04-simulation-replay-and-exceptions.md`
- `sections/section-05-connector-mapping-and-boundary-control.md`
- `sections/section-06-learning-benchmarks-and-promotion.md`
- `sections/section-07-control-plane-ui-surfaces.md`
- `sections/section-08-telemetry-rollout-and-gating.md`

## Scorecard

- Interface matching: PASS after fixes
- Coverage against `claude-plan.md`: PASS
- Overlap risk: PASS after ownership cleanup
- Dependency ordering: PASS
- Self-containment: PASS

## Issues found and fixed

### 1. Missing lifecycle state for clarification flow

Problem:

- Section 02 introduced `clarification_needed`
- Section 01 did not define it in the canonical lifecycle vocabulary

Fix:

- added `clarification_needed` to `workpackLifecycleState` in Section 01

### 2. Router and monitoring ownership overlap

Problem:

- Section 06 and Section 08 both implied ownership of monitoring exposure for readiness

Fix:

- kept promotion and benchmark logic in Section 06
- made Section 08 the owner of monitoring and rollout-readiness exposure
- clarified in Section 06 that its readiness outputs are inputs for Section 08 rather than duplicated monitoring work

### 3. UI file ownership overlap

Problem:

- Section 07 and Section 08 both claimed `Dashboard.tsx`, `WorkpackSummaryHeader.tsx`, and `WorkpackMetricCards.tsx`

Fix:

- made Section 07 the owner of the main workpack-facing UI files
- updated Section 08 to own backend readiness payloads and admin-facing rollout surfaces instead of taking a second write scope on those UI files

## Dependency map check

The final dependency chain is now coherent:

1. Section 01 defines the shared vocabulary and persistence model.
2. Section 02 creates intake drafts on top of that vocabulary.
3. Section 03 compiles those drafts into execution plans.
4. Section 04 records simulation, replay, and exceptions from those plans.
5. Section 05 validates connector boundaries against the compiled plan.
6. Section 06 turns run evidence into learning and promotion decisions.
7. Section 07 renders operator-facing pages from the outputs above.
8. Section 08 adds telemetry, rollout gating, and admin visibility using the same vocabulary.

## Final judgment

The section package is implementation-safe.

The main remaining complexity is broad scope, not contradiction. An implementer can now work section by section without having to guess:

- which shared states are canonical
- which router owns which concern
- which UI section owns which files
- how replay, promotion, trust-taint, and rollout readiness relate to each other
