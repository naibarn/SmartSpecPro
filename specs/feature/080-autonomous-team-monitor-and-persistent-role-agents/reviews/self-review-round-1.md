# Self Review Round 1

Date: 2026-04-10
Mode: adversarial self-review
Artifact reviewed: `claude-plan.md`

## Findings

### 1. The plan originally left current role state too implicit

The first draft talked about persistent monitoring, but it did not make one projection object clearly authoritative for "what this role is doing now."

Applied fix:

- made `role_routine_run` the canonical routine-cycle projection
- clarified that checkpoints must point back to active or last-completed routine cycles
- updated the plan so the monitor is built over role projections rather than raw log inference

### 2. Scheduler durability needed stronger language

The initial draft referenced schedules and checkpoints, but it was still too easy for an implementer to interpret persistence as a glorified timer plus status cache.

Applied fix:

- strengthened the scheduler section around durable queue items, lease ownership, idempotency, and watchdog recovery
- clarified that month-scale continuity must come from queue-backed routine cycles rather than one immortal process

### 3. Feature 079 inheritance needed to be more explicit

The first draft said Feature 080 reused workpacks, but it did not lock the rule tightly enough that role autonomy inherits workpack rollout, readiness, and incident posture.

Applied fix:

- made Feature 079 workpacks the explicit execution truth for role routines
- clarified that role resolution and autonomy always inherit the lower and safer posture
- kept workpack incidents, replay, readiness, and rollout as authoritative in Feature 079

### 4. Delegation safety needed a stronger ownership boundary

The original draft acknowledged policy-smuggling risk, but it did not clearly assign ownership of typed communication, delegation authorization, and role-aware exception binding.

Applied fix:

- carved out a dedicated implementation section for typed communication, delegation, and exception ownership
- clarified that freeform discussion cannot trigger execution on its own
- required the full delegation authorization matrix before delegated work can run

## Regression check

Checked the modified plan against:

- `claude-spec.md`
- `claude-interview.md`
- `claude-research.md`
- `claude-plan-tdd.md`

Result:

- no contradiction with Feature 079 ownership
- no contradiction with current codebase fit discovered in research
- TDD plan mirrors the stronger scheduler, projection, inheritance, and delegation decisions
