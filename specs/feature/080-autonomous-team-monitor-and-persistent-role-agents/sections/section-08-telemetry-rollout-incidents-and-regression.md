# Section 08 - Telemetry, Rollout, Incidents, and Regression

## Purpose

This section defines the role-level telemetry, rollout inheritance, incident fanout, and regression hardening needed to move Feature 080 from a promising monitor into a safe long-horizon autonomy layer.

The goal is to ensure that role-level autonomy expands only when KPI, replay, checkpoint, and incident posture justify it, and that emergency controls remain unified with Feature 079 rather than splitting safety state across two systems.

## Why this section comes last

- Telemetry and rollout rules only make sense after role contracts, routine cycles, workpack inheritance, communication, learning, and UI ownership are already defined.
- This section is responsible for hardening and safe expansion, not for inventing foundational role concepts.
- A late-stage regression matrix is required because the feature spans scheduler durability, role aggregation, delegation safety, and workpack inheritance all at once.

## Files in scope

- `apps/web/shared/roleTelemetry.ts` new shared telemetry and gate contract file
- `apps/web/server/services/roleTelemetryService.ts` new role-metrics aggregation service
- `apps/web/server/services/roleRolloutGateService.ts` new role-autonomy gate evaluator
- `apps/web/server/services/roleIncidentControlService.ts` new role-incident fanout service
- `apps/web/server/routers/monitoring.ts` where role metrics should join the existing monitoring surface
- `apps/web/server/routers/adminOps.ts` or equivalent admin router where role rollout controls should surface
- `apps/web/server/services/__tests__/roleTelemetryService.test.ts` new telemetry tests
- `apps/web/server/services/__tests__/roleRolloutGateService.test.ts` new gate tests
- `apps/web/server/services/__tests__/roleIncidentControlService.test.ts` new incident tests

## Role telemetry model

The role layer should expose metrics that help operators answer whether autonomy is improving or degrading.

At minimum, role telemetry should include:

- throughput
- intervention rate
- exception rate
- backlog age
- SLA hit rate
- quality score
- replay pass rate
- improvement velocity
- autonomy tier and promotion posture
- checkpoint freshness and recovery churn
- budget burn

Telemetry should support slicing by:

- role
- department
- routine
- workpack family
- runtime
- connector
- risk tier

This data should be a role-centric projection over routine-cycle and workpack evidence rather than a brand-new raw event stream.

## Rollout inheritance and autonomy gates

Feature 080 must not create a second rollout taxonomy.

Role autonomy should remain blocked or downgraded when:

- tenant workpack flags are off
- the selected workpack family is not readiness-approved
- the selected workpack is under incident stop or promotion freeze
- replay pass rate falls below threshold over the defined rolling window
- exception rate exceeds threshold over the defined rolling window
- KPI misses exceed the configured streak
- checkpoint freshness falls outside the role policy

Role rollout logic should preserve the gate categories defined in the spec:

- hard blocks
- downgrade triggers
- promotion minima

Thresholds may be tenant-configurable, but the categories should remain explicit and audit-visible by default.

This section should consume the evidence-backed promotion and downgrade outputs defined in Section 06 and expose them through telemetry, rollout posture, and admin controls. It should not invent a competing maturity scoring model.

## Incident fanout and emergency controls

Role-level emergency control should not fork away from Feature 079 safety state.

This section should define how:

- tenant stop
- org-slice stop
- role stop
- routine stop

fan into:

- routine-cycle quarantine
- checkpoint recovery review
- workpack incident controls
- promotion freeze
- operator alerts

If the system cannot explain how a role-level stop affected underlying workpack execution, the incident model is not yet safe enough.

## Regression matrix

This feature needs a deliberate regression matrix because failures can come from several layers at once.

The test matrix should cover:

- duplicate schedule wakes
- stale lease recovery
- checkpoint staleness
- workpack readiness downgrade
- workpack incident freeze
- typed delegation that exceeds policy ceilings
- role-level emergency stop during active routine execution
- safe resume after crash or deploy
- promotion and downgrade after rolling KPI regression
- monitor correctness after several linked routine cycles and workpack runs
- memory archival, purge, and rehydration correctness under long-lived operation
- role-visibility leakage attempts across routine, exception, and monitor surfaces

The rollout plan should assume these are normal failure modes to harden against, not rare edge cases.

## Ownership boundaries

This section owns:

- role-centric metrics and health snapshots
- role rollout gate evaluation
- role-level incident fanout into Feature 079 controls
- admin and monitoring integration for role posture
- regression hardening for long-horizon autonomy

This section does not own:

- workpack incident root truth
- workpack readiness scoring logic
- role-monitor page layout
- routine scheduler fundamentals

## Implementation guidance

1. Keep role telemetry as a projection over durable role and workpack evidence instead of a second event truth.
2. Express autonomy gates in product language that operators can understand and audit.
3. Make role-level emergency controls fan into Feature 079 incident systems rather than creating disconnected stop flags.
4. Treat long-horizon failures such as stale checkpoints, duplicate wakes, and regression drift as first-class regression cases.
5. Expose enough admin and monitoring surface area that operators can see why a role is blocked or downgraded without reading server logs.
6. Include archival, purge, and visibility-leakage regressions in the long-horizon safety suite rather than treating them as secondary privacy concerns.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: role telemetry snapshots calculate throughput, intervention rate, exception rate, backlog age, SLA hit rate, replay pass rate, improvement velocity, and autonomy posture correctly from routine-cycle and workpack evidence.
- Test: telemetry supports slicing by role, department, routine, workpack family, runtime, connector, and risk tier.
- Test: hard blocks, downgrade triggers, and promotion minima evaluate correctly against policy thresholds.
- Test: role autonomy downgrades automatically when underlying workpack rollout, readiness, replay, or incident posture degrades.
- Test: role-level emergency stop fans into routine-cycle quarantine and underlying workpack incident controls without splitting safety state.
- Test: safe resume remains blocked until required checkpoint and incident review conditions pass.
- Test: regression cases for duplicate wakes, stale checkpoints, incident freezes, and KPI deterioration remain visible in operator-facing summaries.
- Test: archived, expired, or purged context does not reappear in monitor summaries, delegated context, or resumed routine cycles unexpectedly.
- Test: visibility leakage attempts across role monitor and exception surfaces fail closed.

## Done when

This section is complete when the role layer can measure autonomy health credibly, inherit workpack rollout and incident posture safely, fan emergency controls through one safety model, and prove via regression coverage that long-horizon operation remains fail closed.
