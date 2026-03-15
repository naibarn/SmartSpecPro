# Spec: Observability and Governance

## Goal

Add the control, safety, and telemetry layer required to ship unified Chat-to-Agency automation safely.

## In scope

- Tenant feature-flag strategy
- Approval boundaries and sensitive-action gating
- Audit trail for routing and execution decisions
- Failure states and operator debugging
- Metrics for escalation quality, destination correctness, and schedule reliability
- Cost and quota governance:
  - preflight estimates
  - credit reservation
  - spend caps
  - concurrency limits
  - runaway-job detection
  - auto-pause on budget exhaustion
- Governance over long-lived Automation Programs, not just one-shot subsystem runs

## Existing anchors

- Tenant feature flags
- Browser Session policy and approvals
- planner escalation flags
- alert and monitoring services

## Dependencies

- Consumes behavior from all earlier splits

## Provides

- Safe rollout boundary
- Operational insight
- Change control for increasingly autonomous execution

## Required output from deep plan

- A governance matrix covering Chat, Browser Session, Agency, Presentation, and Media execution paths
- Metrics and audit requirements at both Automation Program level and per-run level
- Budget-control rules for recurring jobs so high-frequency generation cannot silently consume unlimited credits
- Failure classification rules that distinguish routing error, composition error, destination error, schedule error, and execution error
- A post-launch quality evaluation loop for improving routing and automation accuracy over time
- Explicit evaluation data sources and review inputs for that quality loop

## Key decisions to make in deep plan

- Which telemetry is mandatory for rollout
- How approval policies differ between Browser Session and Agency execution
- Which capabilities remain tenant-gated or admin-gated initially
- What budget and concurrency controls are mandatory before enabling unattended recurring automation

## Quality evaluation loop

Deep plan should specify how the system measures and improves decision quality after rollout, including:

- routing precision and false-escalation rate
- destination correctness
- schedule success and duplicate-run rate
- user overrides as a quality signal
- operator review loops for misrouted or over-autonomous executions

Deep plan should also specify which data sources power evaluation, such as:

- offline benchmark or regression suites
- sampled human review of production traces
- user override and correction logs
- incident and failure postmortems
