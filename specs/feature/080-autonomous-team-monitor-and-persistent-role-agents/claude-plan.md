# Feature 080 Implementation Plan

Date: 2026-04-10
Feature: Autonomous Team Monitor and Persistent Role Agents
Planning scope: implementation blueprint for the first production-grade persistent role layer above Feature 079 workpacks

## 1. Objective

Implement a persistent role operating layer that lets SmartAIHub run department-grade AI workers continuously through versioned role contracts, durable routine cycles, typed delegation, and a role-centric control room.

This layer should make the platform feel like an AI organization rather than a collection of bounded runs. It must sit above the existing team, room, monitoring, workpack, desktop-host, and worker-fabric substrates without replacing them. The main implementation job is to add the durable role model and operator experience that turns safe workpacks into persistent operational ownership.

## 2. Implementation principles

### 2.1 Reuse Feature 079 as the execution truth

Feature 080 should not invent a second executor. Routine work should resolve into approved Feature 079 workpacks, and all role autonomy must inherit workpack readiness, replay, incident, and rollout posture.

### 2.2 Treat persistence as queue-backed continuity

A persistent role is not one endless session. The implementation should represent continuity through:

- durable routine-cycle records
- durable queue items
- checkpoints
- lease-based ownership
- watchdog recovery
- safe resume

This is the only path to month-scale operation that survives restarts and multi-node deployments.

### 2.3 Keep authority envelopes explicit and reviewable

Every role contract must declare mission, KPI, autonomy, budget, connector scope, workpack-family eligibility, and escalation rules. Contract changes that widen authority must be versioned, reviewable, and audit-visible.

### 2.4 Make the monitor a projection, not a second ledger

The Autonomous Team Monitor should aggregate:

- role contracts and routines
- routine-cycle records
- checkpoints
- workpack telemetry
- exception bindings
- monitoring snapshots

It should not create a competing truth about execution that can drift from the underlying workpack and run records.

### 2.5 Keep humans on the boundary, not in the loop for every step

The feature should optimize for exception-first oversight. Operators should be pulled in for:

- contract expansion
- new grants
- repeated drift
- irreversible or regulated actions
- promotion and downgrade decisions

Routine happy-path work should remain automated.

### 2.6 Ship in slices that can be tested independently

This feature spans shared contracts, durable orchestration, workpack integration, monitoring, and UI. The plan should therefore break work into testable slices that can land without requiring one monolithic end-to-end delivery.

### 2.7 Prefer additive migration with explicit cutover

Feature 080 is being added to a codebase that already has team, room, and run concepts in production. The implementation should therefore prefer:

- additive schema changes
- explicit role-agent activation paths
- narrow bridges from existing team records
- clear tenant-scoped cutover rules
- reversible rollback when a tenant exits the pilot

The goal is to avoid long-lived dual truths between the current team stack and the new role-agent stack.

## 3. Target end-state in code

At the end of the first serious implementation wave, the repo should have:

- a shared role-agent contract model and lifecycle vocabulary
- dedicated persistence for role contracts, routines, routine cycles, checkpoints, handoffs, and role-level telemetry
- a durable scheduler and routine-cycle queue integrated with workpack execution
- role-to-workpack binding and resolution logic that respects Feature 079 rollout posture
- typed role messaging and delegation checks
- role-level learning, promotion, and maturity gates
- a role-centric monitor and detail views in the existing control plane
- an explicit coexistence path from current team records to role-agent activation without ambiguous ownership
- tests that validate contracts, queue behavior, authorization, aggregation, and UI rendering

## 4. Proposed architecture

### 4.1 Shared role contract model

Add new shared contracts in `apps/web/shared/` for:

- `role_blueprint`
- `role_agent`
- `role_contract`
- `role_workpack_binding`
- `role_routine`
- `role_routine_run`
- `role_checkpoint`
- `role_message`
- `role_handoff`
- `role_metric_snapshot`
- `role_exception_binding`
- `role_improvement_proposal`
- `role_promotion_gate`

The shared layer should define:

- role lifecycle states
- routine cycle states
- autonomy tiers
- delegation intent types
- checkpoint freshness states
- promotion outcomes
- health and incident posture enums

These contracts become the stable vocabulary across storage, APIs, monitoring, and UI.

### 4.2 Role persistence and projection model

Create dedicated persistence for:

- blueprint and contract versions
- routine definitions and workpack bindings
- routine-cycle queue items
- checkpoints
- typed messages and handoffs
- role-level metric and exception projections
- promotion and learning records

The persistence strategy should separate:

- immutable contract and binding history
- mutable current state projections
- append-only operational evidence

`role_routine_run` should become the canonical answer to "what is this role doing now?" rather than forcing operators to infer state from raw workpack runs or room logs.

This persistence layer also needs an explicit coexistence and migration posture:

- existing team records may reference activated role agents during the transition period, but the role-agent tables become the source of truth for activated persistent roles
- pilot tenants should opt into role-agent activation through explicit rollout or setup actions instead of silent backfill
- migration should prefer additive backfill and explicit role binding over long-lived dual writes
- any cutover from legacy team ownership to role-agent ownership must be tenant-scoped, auditable, and reversible
- rollback must be able to disable role-agent activation without corrupting legacy team, room, or workpack history

### 4.3 Routine scheduler, queue, and checkpoint substrate

Introduce a dedicated role-routine orchestration layer that is:

- durable
- lease-aware
- idempotent
- queue-backed
- safe for multi-node ownership

Each wake event should materialize a queue item, resolve a workpack target, and create a `role_routine_run` boundary before execution begins. Checkpoints should always point back to that routine cycle.

This section is where the feature becomes operationally real. Without it, everything else would still be a monitor over bounded runs.

### 4.4 Workpack resolution and execution inheritance

Role routines should not execute freeform. They must resolve into Feature 079 workpacks using explicit policies:

- pinned version
- benchmark track
- latest ready in family

Resolution logic should:

- inherit tenant rollout flags
- honor role contract ceilings
- respect current workpack readiness and incident state
- preserve rollback baselines
- attach selected workpack version and linked workpack run ids to routine-cycle records

### 4.5 Role communication and delegation model

Extend current room and run messaging into typed role communication.

The implementation should support:

- request
- handoff
- escalate
- dependency block
- status summary
- approval request
- shared finding

Actions may only execute when the delegation authorization matrix passes for:

- sender authority
- recipient contract
- approved workpack family
- connector scope ceiling
- side-effect ceiling
- attributable message provenance

This layer also needs an explicit data-visibility matrix separate from execution authority. Each role should see only the minimum memory, room, artifact, checkpoint, and exception context required for its routine ownership or delegated task.

### 4.6 Monitor aggregation and operator surfaces

Build the Autonomous Team Monitor as a role-centric projection over:

- current contract and routine posture
- active and recent `role_routine_run` records
- checkpoint freshness
- workpack outcome and incident summaries
- backlog and SLA health
- improvement queue and promotion gates

The UI should reuse the current monitor, room, and workpack control-plane patterns rather than inventing a parallel app shell.

Monitor-backed operator actions should resolve through a clear approval workflow matrix. Contract expansion review, safe resume review, promotion review, delegated approval requests, and high-risk exception remediation should each define approver scope, expiry, quorum expectations, and state fanout rules.

### 4.7 Memory, learning, and promotion logic

Add role-level memory and improvement handling that is compatible with current workpack and skill improvement paths.

This layer should support:

- role memory
- operational memory
- shared organizational memory
- role improvement proposals
- autonomy promotion and downgrade rules

Low-risk improvements may auto-apply only when workpack replay, benchmark, readiness, and authority-envelope checks still pass.

This layer must also separate hot operational context, archived context, retention windows, tenant purge behavior, and legal-hold or policy-retention overrides so long-lived role memory remains governable.

### 4.8 Scheduler capacity and SLO posture

The scheduler design should be implementation-locked enough that infra choices do not drift during build-out.

The plan should therefore require an explicit capacity and service-level table for at least:

- maximum active routine cycles per role and per tenant cohort
- expected wake latency targets
- checkpoint freshness targets
- heartbeat timeout and stale-lease thresholds
- queue backpressure behavior
- partitioning or shard strategy
- monitor refresh expectations for current-state views

Exact defaults may vary by role tier or tenant cohort, but these categories should be defined before implementation starts.

## 5. Implementation sections

## 5.1 Section A: Role contracts, bindings, and persistence

Create the shared role-agent contract model and dedicated persistence first.

This section should:

- add role-related shared types and zod schemas
- define lifecycle, autonomy, delegation, and health enums
- define data shapes for role-to-workpack bindings and rollback baselines
- add database entities for contracts, routines, routine-cycle projections, checkpoints, handoffs, and role metrics
- define the boundary between immutable contract history and mutable operational projections
- define the migration and coexistence strategy between legacy team ownership and activated role-agent ownership

This section also needs to lock the Feature 079 compatibility rule:

- workpacks remain reusable execution units and are referenced by role bindings rather than copied into role records

## 5.2 Section B: Routine scheduler, queue, and checkpoints

Implement the durable continuity substrate.

This section should:

- add queue-backed routine-cycle creation
- define idempotency keys for wake events
- define lease ownership and stale-claim recovery
- create checkpoint freshness and watchdog logic
- ensure every routine cycle is resumable and attributable after crash or deploy
- define the scheduler capacity and SLO envelope that implementation must satisfy

The output of this section should be a durable role-routine execution boundary, not yet the full operator UI.

## 5.3 Section C: Role-to-workpack resolution and execution inheritance

Integrate role routines with Feature 079 workpack families and rollout posture.

This work should:

- resolve workpack versions from role bindings
- fail closed when workpack readiness, incident, or rollout posture is not satisfied
- preserve linked workpack run ids and resolved version history
- inherit the lower of role autonomy and workpack autonomy posture
- keep version transitions auditable and reversible

This section must stay disciplined about using Feature 079 as the execution substrate instead of growing a new freeform planner.

## 5.4 Section D: Role monitor aggregation and control-plane backend

Add the backend services and router shapes that power the role-centric control room.

This section should implement:

- role roster summaries
- current routine-cycle projections
- checkpoint freshness summaries
- KPI and backlog rollups
- exception bindings
- workpack dependency posture
- pause, resume, quarantine, and org-slice stop controls
- approval workflow state transitions for safe resume, contract change review, promotion review, and delegated approval requests

This layer should aggregate existing monitoring and workpack evidence rather than duplicating it.

## 5.5 Section E: Typed communication, delegation, and exception ownership

Add the role messaging and delegation layer that turns rooms into durable operational collaboration.

This section should implement:

- typed role message contracts
- handoff records
- delegation authorization matrix evaluation
- role-aware exception ownership and escalation
- operator-visible provenance for delegated execution
- a role data-visibility matrix for memory, thread, artifact, checkpoint, and exception access

The main safety rule is that no action may cross policy boundaries just because it came from another AI role.

## 5.6 Section F: Memory, learning, and promotion gates

Add the role maturity layer above workpacks.

This section should:

- define role memory classes and provenance
- convert role outcomes into learning proposals
- integrate with current skill and workpack improvement mechanisms
- add role autonomy promotion and downgrade gates
- enforce that improvements cannot widen authority without review
- define retention, archival, legal-hold, and tenant-purge policy for long-lived role memory

The output should reduce human interventions over time without allowing silent self-expansion.

## 5.7 Section G: Role monitor UI and operator surfaces

Implement the first wave of persistent-role control-plane surfaces.

Recommended UI sequence:

1. Autonomous Team Monitor
2. Role Agent Detail
3. Mission Planner
4. Routine Scheduler
5. Internal Comms Stream
6. Improvement Queue and Shift Review panels

The UI should feel like an AI operations center while still leaning on existing workpack pages for replay, connector readiness, incidents, and ROI deep links.

## 5.8 Section H: Telemetry, rollout, incidents, and regression hardening

Integrate role-level telemetry and rollout controls with the current platform.

This section should implement:

- role-centric metrics and health snapshots
- autonomy gate evaluation from KPI, replay, exception, and checkpoint signals
- role-level incident and emergency-stop fanout into Feature 079 controls
- tenant- and org-slice rollout guards
- regression coverage for long-horizon continuity and fail-closed behavior

This section is where the product becomes safe to expand beyond a pilot.

## 6. Suggested file and module strategy

- Shared role contracts should live in `apps/web/shared/*` beside current team and workpack contract files.
- Durable role persistence and queue orchestration should live in dedicated server services rather than being embedded in router handlers.
- Role-monitor aggregation should sit close to monitoring and workpack service boundaries, but without mutating their ownership.
- UI work should extend current orchestrator and workpack control-plane areas rather than creating a separate frontend stack.

## 7. Rollout sequence

### Phase 1: Contract and continuity foundations

- shared role contracts
- persistent bindings
- routine queue and checkpoint substrate

### Phase 2: Workpack-backed role operation

- workpack resolution inheritance
- role-aware exceptions
- basic role monitor summaries

### Phase 3: Operator control room

- roster, detail, timeline, KPI, and pause/resume surfaces
- typed communication and handoff visibility

### Phase 4: Learning and guarded autonomy

- role promotion gates
- downgrade logic
- low-risk auto-improvement
- org-level incident and rollout hardening

## 8. Risks and mitigations

### 8.1 Boundary blur with Feature 079

Mitigation:

- keep workpack execution, replay, readiness, and incident truth in Feature 079
- make Feature 080 a persistent ownership layer above it

### 8.2 Scheduler over-promise

Mitigation:

- require durable queue items, leases, idempotency, and checkpoints in the first serious scheduler slice

### 8.3 Delegation abuse

Mitigation:

- enforce the delegation authorization matrix before any delegated work executes

### 8.4 Monitor drift

Mitigation:

- make `role_routine_run` and linked workpack runs the canonical execution projection instead of raw log scraping

### 8.5 Unsafe self-improvement

Mitigation:

- gate all role improvements behind workpack evidence, replay posture, and authority-envelope checks

## 9. Definition of done

This feature is complete for its first production-grade wave when:

- operators can configure role agents from profession-grade blueprints
- routines can wake durably and resolve into approved workpacks
- the monitor can show current role state, health, blockers, and recent outcomes from durable projections
- role-to-role communication and handoffs remain typed, attributable, and policy-safe
- crash or deploy recovery preserves role continuity through checkpoints
- autonomy expands or contracts only through evidence-backed gates that inherit Feature 079 posture
