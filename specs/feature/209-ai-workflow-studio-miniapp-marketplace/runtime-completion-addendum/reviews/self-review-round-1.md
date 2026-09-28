# Self-review round 1 — Spec 209 runtime completion plan

## Findings

| ID | Review question | Finding | Action |
|---|---|---|---|
| R1-01 | Does the plan reuse the canonical runtime? | Yes, but executor registration was implicit in Section 03 | Add explicit `jobExecutorRegistry`/contract registration and fail-closed behavior |
| R1-02 | Are partial modes bound to exact versions? | Yes through checkpoint/version/input fingerprint | Keep as a hard acceptance condition in Sections 01 and 04 |
| R1-03 | Are approval/retry/cancel/resume duplicated? | No; the plan reuses Job commands and projections | Keep and add explicit operator/user authorization tests |
| R1-04 | Are output/artifact claims safe? | Existing artifact service is named, but output-to-artifact mapping needs a durable schema contract | Add output manifest/artifact reference requirements to Section 06 |
| R1-05 | Does Marketplace visibility equal entitlement? | The plan explicitly separates them | Keep invocation-time recheck and add denied/expired test cases |
| R1-06 | Is UI scope mockup-led? | Yes; the same shell is preserved | Keep existing-pattern reuse/diverge record and viewport matrix |
| R1-07 | Does the plan update the parent Spec 209? | It creates a separate addendum but did not define parent-spec/release-doc synchronization | Add a final documentation sync gate in Section 08 |
| R1-08 | Is economic authority duplicated? | No; Spec 207 remains owner | Keep reconciliation-required state for ambiguous effects |
| R1-09 | Are browser claims separated from production proof? | Yes; local mocked browser evidence and real release evidence are separate | Keep explicit release gate wording |
| R1-10 | Can implementers work section by section? | Sections have dependencies, tests and acceptance | Add explicit section output contracts to the index |

## Scorecard

- Structural integrity: PASS after actions below.
- Completeness vs synthesized spec: PASS after actions below.
- Implementability: PASS; file ownership and existing reuse patterns are named.
- Internal consistency: PASS; canonical Job and Spec 207 authority are used in
  every dependent section.
- Edge cases: PASS after adding executor registration, artifact manifest and
  parent-spec synchronization.
