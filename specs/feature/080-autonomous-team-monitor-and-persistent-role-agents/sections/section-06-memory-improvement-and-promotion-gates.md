# Section 06 - Memory, Improvement, and Promotion Gates

## Purpose

This section defines the role-level continuity, learning, and maturity model that lets persistent roles improve over time without silently widening authority or drifting away from safe workpack-backed execution.

The goal is to reduce human interventions over time through evidence-backed learning while preserving the fail-closed posture established in earlier sections.

## Why this section depends on earlier sections

- Role contracts and routine-cycle projections from Section 01 provide the stable identity and state model for role memory.
- Scheduler and checkpoints from Section 02 determine what operational continuity state must remain hot.
- Workpack inheritance from Section 03 provides the safe evidence substrate for replay, readiness, and benchmark gates.
- Communication and exception bindings from Section 05 provide the signals that show where role behavior is repeatedly blocked or degraded.

This section owns the role-level learning decisions and promotion or downgrade rules themselves. Later telemetry and rollout work should consume these outputs rather than redefining maturity logic independently.

## Files in scope

- `apps/web/server/services/roleMemoryService.ts` new role-memory service
- `apps/web/server/services/roleImprovementService.ts` new learning and proposal service
- `apps/web/server/services/rolePromotionGateService.ts` new promotion and downgrade gate evaluator
- `apps/web/shared/roleMemoryContracts.ts` new shared memory or learning contract file if needed
- `apps/web/server/services/__tests__/roleMemoryService.test.ts` new memory tests
- `apps/web/server/services/__tests__/roleImprovementService.test.ts` new learning tests
- `apps/web/server/services/__tests__/rolePromotionGateService.test.ts` new promotion-gate tests
- existing Feature 079 improvement services only where evidence-backed reuse is required

## Memory model

Role continuity should distinguish between several memory classes instead of storing everything in one blob.

At minimum, the system should model:

- role memory for durable preferences, known constraints, and recurring patterns
- operational memory for active queue state, current routine cycle, and immediate blockers
- shared organizational memory for reusable references across roles
- archived context for older material that should remain recoverable but not hot in every role context

Every memory item should preserve:

- provenance
- trust class
- retention tier
- redaction state where applicable
- related role, routine, or workpack reference

Operational memory should be safe-resume oriented, not a long transcript dump. Durable knowledge should remain distinct from temporary speculation or low-confidence observations.

## Retention, archival, and purge flow

Long-lived role memory should not remain in hot context forever by default.

This section should define:

- which memory classes remain hot versus archived
- when archived context may be rehydrated into hot context
- how retention expiry is enforced for operational versus historical material
- how tenant purge requests affect hot memory, archived memory, and derived summaries
- how legal-hold or regulated-retention overrides suspend purge
- how redacted or expired memory is prevented from reappearing through recovery, monitor summaries, or delegated task context

The product should preserve enough historical structure for audit and recovery while still allowing durable operational context to age out safely.

## Learning proposal model

Role improvement proposals should be generated from:

- successful routine cycles
- failed routine cycles
- repeated exception patterns
- KPI misses
- replay regressions
- checkpoint staleness or recovery churn

Proposal targets may include:

- workpack selection rules
- workpack version preferences
- prompts
- browser packs
- connector maps
- skill updates
- operator guidance
- policy thresholds where tenant policy explicitly allows tuning

Each proposal should preserve:

- evidence pointers
- risk class
- affected routines and roles
- expected benefit
- authority impact classification

## Promotion and downgrade gates

Role maturity should be governed by explicit gate categories rather than an informal confidence score.

At minimum, the gate evaluator should include:

- replay pass-rate thresholds
- exception-rate thresholds
- KPI miss streak thresholds
- checkpoint freshness thresholds
- active workpack incident and freeze state
- current workpack readiness posture
- authority-envelope delta detection

Outcomes should include:

- stay current
- promote one autonomy tier
- downgrade one autonomy tier
- freeze routine autonomy
- require human review

Any gate that depends on workpack evidence should consume Feature 079 truth instead of copying or re-scoring it locally.

## Auto-apply rules

Low-risk improvements may auto-apply only when:

- replay still passes
- benchmark posture does not regress
- workpack readiness remains valid
- tenant rollout posture allows the target autonomy
- connector scope, budget, and side-effect ceilings stay unchanged
- routine resolution policy and rollback baseline remain unchanged

Auto-apply must be blocked when:

- authority expands
- workpack family eligibility changes
- role contract envelope changes
- replay or benchmark evidence regresses
- the target role or routine is already under review, quarantine, or incident stop

## Integration with existing improvement substrate

Feature 080 should not invent a second patch pipeline.

Role-level learning should:

- reuse Feature 079 workpack learning and benchmark evidence where applicable
- reuse current skill maintenance and upgrade services for low-level automation improvements
- add the role-specific layer that decides whether those changes improve or degrade persistent role maturity

The role layer owns the maturity decision. It does not own the underlying workpack or skill execution truth.

## Implementation guidance

1. Keep role memory classes explicit so operator tooling can explain why some context stays hot and other context is archived.
2. Store evidence references rather than duplicating replay or benchmark payloads inside role proposals.
3. Make promotion and downgrade outcomes deterministic and audit-visible.
4. Ensure improvements can lower human intervention without changing mission, scope, or authority silently.
5. Keep role-level learning tightly coupled to routine and workpack evidence instead of using vague generic quality scores.
6. Keep archival and purge behavior explicit so month-scale role memory remains governable and explainable.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: role memory distinguishes durable role knowledge, operational state, shared memory, and archived context.
- Test: memory entries preserve provenance, trust class, retention tier, and related role or workpack context.
- Test: role improvement proposals can be generated from success, failure, repeated exception, KPI miss, and replay regression signals.
- Test: proposal payloads preserve risk class, evidence refs, and expected impact without copying raw sensitive payloads.
- Test: promotion and downgrade gates react correctly to replay pass-rate regressions, exception streaks, KPI miss streaks, checkpoint staleness, and workpack incident posture.
- Test: low-risk auto-apply is blocked when authority envelope, connector scope, budget, workpack family set, resolution policy, or rollback baseline would change.
- Test: role-level learning integrates with existing workpack and skill improvement paths without duplicating their underlying evidence truth.
- Test: archived memory can be rehydrated safely without bypassing trust-class and visibility rules.
- Test: retention expiry, tenant purge, and legal-hold behavior remain policy-correct for long-lived role memory and derived summaries.

## Done when

This section is complete when roles have a safe memory model, can generate evidence-backed improvements from persistent operation, and can only change autonomy posture through explicit gates that preserve workpack-backed safety.
