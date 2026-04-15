# Feature 080 TDD Plan

Date: 2026-04-10
Feature: Autonomous Team Monitor and Persistent Role Agents
Test baseline:

- Web app tests: `npm --workspace=@smartspec/web test`
- Web typecheck: `npm --workspace=@smartspec/web run typecheck -- --pretty false`
- Optional Rust tests when needed: `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml`

## 1. Objective

Write tests first for the persistent role layer so each implementation slice can land without destabilizing the existing team, room, monitoring, workpack, or desktop-host behavior.

## 2. Implementation principles

### 2.1 Reuse Feature 079 as the execution truth

- Test: role routines resolve only into approved Feature 079 workpack targets.
- Test: role autonomy downgrades or blocks when underlying workpack readiness, rollout, or incident posture blocks autonomous execution.

### 2.2 Treat persistence as queue-backed continuity

- Test: routine wakes materialize durable routine-cycle records rather than ephemeral in-memory state.
- Test: checkpoint freshness, lease ownership, and idempotency keys survive restart and duplicate trigger delivery.

### 2.3 Keep authority envelopes explicit and reviewable

- Test: role contracts reject malformed authority envelopes and unsupported autonomy tiers.
- Test: contract revisions that widen connector, budget, or side-effect authority require explicit review state.
- Test: reviewable contract changes preserve expiry, approver scope, and state fanout requirements.

### 2.4 Make the monitor a projection, not a second ledger

- Test: role monitor payloads derive current state from routine-cycle, checkpoint, and workpack evidence without inventing incompatible status vocabularies.
- Test: monitor summaries remain explainable through linked routine-cycle and workpack-run ids.
- Test: current-state summaries remain correct across migration bridges from legacy team records to activated role-agent records.

### 2.5 Keep humans on the boundary

- Test: happy-path role routines do not require unnecessary operator confirmation.
- Test: risky delegation, drift, checkpoint staleness, or authority expansion create explicit exception or review states.

### 2.6 Ship in slices that can be tested independently

- Test: shared contracts validate independently.
- Test: scheduler, aggregation, delegation, and UI behavior can each be exercised with focused tests.

### 2.7 Prefer additive migration with explicit cutover

- Test: tenants not enrolled in role-agent activation continue to use legacy team behavior without ambiguous dual ownership.
- Test: activated tenants resolve current ownership through one source of truth even when legacy team links still exist for compatibility.

## 3. Target end-state in code

- Test: shared role contracts round-trip through parser and validator logic.
- Test: routine-cycle services produce stable lifecycle transitions for queued, running, paused, quarantined, completed, and failed states.
- Test: role monitor UI surfaces render expected roster, detail, and control states.

## 4. Proposed architecture

### 4.1 Shared role contract model

- Test: all role-related schemas accept valid blueprint, contract, routine, checkpoint, handoff, and promotion payloads.
- Test: unknown lifecycle, delegation, or health values fail closed.
- Test: role-to-workpack binding schemas preserve resolution policy and rollback baseline metadata.

### 4.2 Role persistence and projection model

- Test: immutable contract history is stored separately from mutable operational projections.
- Test: `role_routine_run` records preserve resolved workpack version, trigger source, linked workpack run ids, and checkpoint pointer.
- Test: current role-state projections remain derivable after persistence round trips.
- Test: coexistence bridges between legacy team records and activated role-agent records remain tenant-scoped and reversible.
- Test: retention, purge, and archival operations do not corrupt immutable contract history.

### 4.3 Routine scheduler, queue, and checkpoint substrate

- Test: duplicate wake events coalesce through idempotency rules.
- Test: lease claiming prevents concurrent ownership of singleton routines.
- Test: stale claims are quarantined or recovered safely.
- Test: checkpoint writes always point to an active or last-completed routine cycle.
- Test: scheduler backpressure and capacity thresholds degrade gracefully instead of spawning unsafe overlapping work.
- Test: wake latency, checkpoint freshness, and stale-heartbeat thresholds are measurable against declared SLO categories.

### 4.4 Workpack resolution and execution inheritance

- Test: pinned-version, benchmark-track, and latest-ready resolution modes behave deterministically.
- Test: workpack resolution fails closed when rollout flags, readiness gates, or incident freezes block execution.
- Test: automatic version changes start a new routine-cycle boundary and preserve rollback targets.

### 4.5 Role communication and delegation model

- Test: typed role messages validate sender, recipient, related routine, and provenance.
- Test: delegated work cannot execute when connector scopes or side-effect ceilings exceed either role envelope.
- Test: failed delegation authorization produces role-aware exception or approval states instead of silent fallback.
- Test: data visibility rules prevent unrelated roles from reading restricted memory, thread, checkpoint, artifact, or exception detail.
- Test: delegated tasks expose only the minimum context required for the recipient to act safely.

### 4.6 Monitor aggregation and operator surfaces

- Test: role roster summaries include status, autonomy tier, KPI trend, backlog, exceptions, checkpoint freshness, and blockers.
- Test: role detail views expose linked routines, checkpoints, role memory posture, workpack dependencies, and learning items.
- Test: operator controls for pause, resume, quarantine, and org-slice stop emit the expected backend actions.
- Test: approval workflow states for safe resume, promotion review, and contract expansion surface the correct approver scope, expiry, and next actions.

### 4.7 Memory, learning, and promotion logic

- Test: role memory distinguishes durable knowledge from temporary operational state.
- Test: role improvement proposals cannot auto-apply when replay, benchmark, or authority-envelope conditions fail.
- Test: promotion and downgrade gates react to checkpoint staleness, exception streaks, KPI misses, and replay pass-rate regressions.
- Test: archived memory can be rehydrated safely without bypassing trust-class and visibility limits.
- Test: purge, retention expiry, and legal-hold behavior follow policy without leaking deleted or expired context back into hot memory.

## 5. Implementation sections

## 5.1 Section A: Role contracts, bindings, and persistence

- Test: shared role contracts validate expected payloads.
- Test: malformed role bindings or missing rollback baselines are rejected.
- Test: persistence records preserve immutable contract history and mutable role projections separately.
- Test: migration bridges from legacy team ownership to role-agent ownership remain tenant-scoped, explicit, and reversible.

## 5.2 Section B: Routine scheduler, queue, and checkpoints

- Test: schedules and events create durable queue items with deterministic idempotency keys.
- Test: singletons do not overlap, and partitioned routines respect partition keys.
- Test: checkpoints remain resumable after restart and stale-cycle recovery.
- Test: declared scheduler capacity ceilings and wake-latency categories produce predictable backpressure behavior.

## 5.3 Section C: Role-to-workpack resolution and execution inheritance

- Test: role routines inherit tenant workpack rollout posture correctly.
- Test: resolved workpack versions respect contract ceilings and readiness state.
- Test: linked workpack runs remain visible from role-routine records.

## 5.4 Section D: Role monitor aggregation and control-plane backend

- Test: monitor aggregation returns stable role roster, detail, and activity shapes.
- Test: pause, resume, quarantine, and stop controls affect the correct role, routine, or org slice.
- Test: current-state queries can answer what a role is doing now without raw log reconstruction.
- Test: approval workflows for contract changes, safe resume, promotion review, and delegated approvals preserve expiry, approver scope, and state fanout.

## 5.5 Section E: Typed communication, delegation, and exception ownership

- Test: typed communication items preserve sender, recipient, provenance, due state, and related work references.
- Test: handoff records track responsibility transfer and outcome state.
- Test: delegated work that violates policy ceilings opens exceptions instead of executing.
- Test: role data-visibility rules prevent over-sharing of room threads, memory, artifacts, checkpoints, and exception detail.

## 5.6 Section F: Memory, learning, and promotion gates

- Test: role memory respects provenance and trust class.
- Test: learning proposals reuse existing workpack and skill improvement pathways where appropriate.
- Test: promotion and downgrade gates are evidence-backed and reversible.
- Test: archival, retention expiry, tenant purge, and legal-hold behavior remain policy-correct for long-lived role memory.

## 5.7 Section G: Role monitor UI and operator surfaces

- Test: Autonomous Team Monitor renders roster, mission, queue, and exception surfaces.
- Test: Role Agent Detail renders contract, routine bindings, checkpoints, KPI, and deep links into workpack surfaces.
- Test: Mission Planner and Routine Scheduler views render editable control states without losing fail-closed posture.

## 5.8 Section H: Telemetry, rollout, incidents, and regression hardening

- Test: role-level metrics slice by role, department, routine, workpack family, runtime, connector, and risk tier.
- Test: role-level emergency stop reuses underlying workpack incident controls.
- Test: long-horizon continuity failures, duplicate wakes, and rollout downgrades remain visible and safe.

## 6. Suggested file and module strategy

- Test: new shared modules follow current shared test conventions.
- Test: new server routers and services follow existing Vitest router/service patterns.
- Test: UI components use current React and jsdom test patterns.
- Test: any Rust change is accompanied by focused cargo tests only when desktop-host runtime behavior changes.

## 7. Rollout sequence

### Phase 1: Contract and continuity foundations

- Test: role contracts and routine-cycle records work before any autonomous monitor or learning flow is enabled.

### Phase 2: Workpack-backed role operation

- Test: role routines can resolve and launch approved workpacks safely before deeper UI rollout.

### Phase 3: Operator control room

- Test: operators can inspect and control role posture without hidden state.

### Phase 4: Learning and guarded autonomy

- Test: low-risk improvements and autonomy promotion remain blocked until evidence gates pass.

## 8. Risks and mitigations

### 8.1 Boundary blur with Feature 079

- Test: role-layer additions do not duplicate workpack readiness, replay, or incident truth.

### 8.2 Scheduler over-promise

- Test: queue, lease, checkpoint, and watchdog behavior works under duplicate wakes and restart scenarios.
- Test: scheduler behavior stays predictable at declared capacity boundaries and under backpressure.

### 8.3 Delegation abuse

- Test: policy-smuggling attempts through typed handoffs fail closed.
- Test: data-visibility leakage attempts across roles fail closed even when execution delegation is allowed.

### 8.4 Monitor drift

- Test: role monitor state can always be traced to durable role and workpack records.

### 8.5 Unsafe self-improvement

- Test: role improvement proposals cannot widen authority or silently alter resolution policy without review.

### 8.6 Retention and archival drift

- Test: expired, archived, or purged role context does not reappear in hot memory, monitor summaries, or delegated context unexpectedly.

## 9. Definition of done

- Test: all new role contracts, lifecycle services, monitor payloads, and UI surfaces have matching targeted coverage.
- Test: current team, room, monitoring, and workpack behavior remains green after Feature 080 additions.
- Test: a representative operational role can run recurring work through workpacks with checkpoint-backed continuity and exception-first oversight.
