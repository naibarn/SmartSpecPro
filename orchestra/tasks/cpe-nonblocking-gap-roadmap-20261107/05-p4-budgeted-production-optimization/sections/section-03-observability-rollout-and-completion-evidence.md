# Section 03 — Observability, Rollout and Completion Evidence

## Requirement IDs

NB-01, NB-02, NB-03, NB-07, NB-08

## Objective

Close the project with reproducible proof that budget accounting is observable and that optional optimization cannot obstruct otherwise-authorized image/video production.

## Owned paths

Existing cost/credit read models, provider operation telemetry, canonical Spec/Handoff evidence, focused integration tests and user-facing status surfaces already owned by the relevant feature.

## Tasks

1. Verify cost estimates, reservations, settlements and reconciliation results are visible to the authorized tenant with stable operation/task identifiers and no cross-tenant data exposure.
2. Run the advisory/unavailable CPE matrix from P0–P4 against image, video and assembly eligibility; compare feature-off and feature-on outcomes.
3. Verify budget, authorization, tenant, provider capability, safety and cancellation remain effective hard controls.
4. Verify failures and degraded results are accurately labeled; do not report an optional suggestion as a successful paid operation or a budget rejection as a quality rejection.
5. Reconcile each existing canonical Spec/Quick Spec and update its owner handoff with verified source, focused proof, unresolved items and dependency status.
6. Roll out through existing flags and safe development checkpoints; do not deploy production or introduce a new approval state as part of this plan.

## Completion predicate

All non-blocking acceptance rows have direct source/test evidence, the critical CPE matrix passes, canonical handoffs identify remaining unrelated work accurately, and no advisory failure changes baseline generation eligibility.

## Prerequisites and fallback

Requires sections 01 and 02 plus P0–P3 acceptance evidence. Missing optional analytics or cost recommendations remain visible as unavailable; they never hold an authorized generation request.

## Focused tests and evidence

Run the final feature-off/on advisory matrix over image, video, audio and assembly, plus tenant-isolated cost read-model/API checks and hard-control negative cases. Record direct API/UI evidence for estimates, actuals, warnings, media access, partial/fallback labels and canonical handoff reconciliation at the integrated development SHA.

## Unresolved assumptions

Confirm existing feature flags, metrics and authenticated test environments are sufficient for a staged development rollout. Production deployment and any production-specific authority remain outside this plan; unavailable evidence stays explicitly pending rather than being inferred from local tests.
