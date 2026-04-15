# Feature 080 Synthesized Spec

Date: 2026-04-10
Source files:

- `specs/feature/080-autonomous-team-monitor-and-persistent-role-agents/spec.md`
- `specs/feature/080-autonomous-team-monitor-and-persistent-role-agents/claude-research.md`
- `specs/feature/080-autonomous-team-monitor-and-persistent-role-agents/claude-interview.md`

## 1. Build target

Implement the first production-grade persistent role layer for SmartAIHub.

Feature 079 already defines the reusable execution unit: the workpack.
Feature 080 must define the durable operating layer above it: role agents, routine ownership, long-horizon continuity, typed delegation, and the Autonomous Team Monitor.

The role layer must reuse existing team, room, run, monitoring, workpack, desktop-host, and worker-fabric surfaces rather than inventing a second autonomy stack.

## 2. Product outcome

The user should be able to:

1. activate department-grade AI roles from reusable blueprints
2. define a role contract with mission, KPI, budget, authority envelope, and allowed workpack families
3. assign recurring routines triggered by schedules or events
4. let those routines resolve into approved Feature 079 workpacks
5. observe current role state, queue health, checkpoints, KPI, and blockers in one control room
6. inspect typed role-to-role handoffs and approvals
7. recover roles safely after crash, deploy, or restart
8. improve mature roles through replay-backed and benchmark-backed gates

## 3. Locked product decisions

- `Role Agent` is the canonical persistent worker identity.
- `Workpack` remains the canonical execution unit.
- Persistence is logical continuity through schedules, queues, checkpoints, and recovery.
- Human oversight is exception-first and consequence-bound.
- Every role and routine must run inside an explicit authority envelope.
- Role-to-role communication must be typed, attributable, and policy-aware.
- Role autonomy inherits Feature 079 workpack rollout, readiness, and incident posture.
- Unknown, low-confidence, or unsafe states fail closed.
- The preferred runtime posture is SmartAIHub-managed and no-install.

## 4. Core implementation scope

### 4.1 Role contracts and blueprints

Build versioned role contracts and reusable blueprints that define:

- role purpose
- mission statement
- KPI and SLA categories
- approved workpack families
- routine-level autonomy
- connector scope ceilings
- budget and write ceilings
- escalation contacts and quiet windows

### 4.2 Routine scheduler and continuity layer

Build a durable routine-cycle model that supports:

- time-based wakes
- event wakes
- queue-backed execution
- idempotent trigger coalescing
- lease-based ownership
- durable checkpoints
- watchdog restart and quarantine

### 4.3 Role-to-workpack execution inheritance

Extend Feature 079 workpack usage so a role routine can:

- resolve a workpack version through a clear policy
- inherit rollout and readiness state
- block when workpack incidents or freezes exist
- preserve linked workpack run ids for explainability

### 4.4 Role monitor and control room

Add a role-centric control plane that shows:

- roster and autonomy tier
- mission and KPI health
- checkpoint freshness
- backlog and SLA posture
- exception bindings
- current routine cycle
- deep links into workpack replay, connector, readiness, and incident views

### 4.5 Typed delegation and exception ownership

Introduce typed role messages, handoffs, and delegation checks so cross-role execution is attributable and cannot smuggle authority across policy boundaries.

### 4.6 Memory, learning, and promotion

Add role-level operational memory, learning proposals, and promotion gates that consume replay, benchmark, and KPI evidence without replacing the existing skill and workpack improvement substrate.

## 5. Current-codebase fit requirements

The implementation must align with these current realities:

- `teamService.ts` already manages team membership, autonomy defaults, and policy envelopes
- `teamRoom.ts` and `TeamRoomView.tsx` already support actor-aware room threads and work-item-aware messaging
- `teamRun.ts` already exposes bounded run control semantics
- `RunMonitorPanel.tsx` and monitoring services already provide live monitoring shells
- Feature 079 already exposes workpack routing, scheduling, replay, readiness, incidents, and ROI surfaces
- tenant feature flags already expose the outer rollout boundary for workpack autonomy
- desktop worker fabric already provides a managed trust-aware runtime path for local execution

## 6. Explicit implementation constraints

- Do not create a second executor or second rollout taxonomy.
- Do not bypass Feature 079 safety, replay, readiness, or incident gates.
- Do not equate role labels with unrestricted authority.
- Do not require users to install extra external runtimes for the preferred path.
- Do not model persistence as one immortal thread or one endless process.
- Do not allow delegation to widen connector scope, side-effect class, or budget authority.

## 7. Recommended release order

1. Shared role contracts, bindings, and persistence model
2. Durable routine scheduler, queue, and checkpoint substrate
3. Role-to-workpack resolution and rollout inheritance
4. Role monitor aggregation and typed delegation flows
5. Operator-facing monitor and role detail surfaces
6. Learning, promotion, and long-horizon hardening

## 8. Acceptance signals

The first implementation wave should be considered successful when:

- operators can create persistent AI roles for at least a few operational departments
- routines can wake on schedule or event and resolve into approved workpacks
- the monitor can answer what each role is doing now without log archaeology
- crashes or deploys do not erase role continuity
- typed handoffs and exception ownership remain explainable and auditable
- autonomy expands only through workpack-backed evidence and policy-safe gates

## 9. Open implementation questions to carry into planning

- Should first-wave role persistence live directly on new tables or partially layer on top of existing team entities?
- Which scheduler backend should become the canonical durable lease owner first?
- Which default threshold values should ship for replay pass rate, exception rate, backlog age, and checkpoint freshness?
- How much role communication history should stay hot versus archived?
- Which role families should be included in the first production rollout beyond executive support, HR ops, sales ops, and storekeeping?
