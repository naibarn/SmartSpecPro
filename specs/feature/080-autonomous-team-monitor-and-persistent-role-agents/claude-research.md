# Feature 080 Research Notes

Date: 2026-04-10
Spec: `specs/feature/080-autonomous-team-monitor-and-persistent-role-agents/spec.md`
Research mode: codebase-only

## Research summary

Feature 080 fits the current SmartAIHub stack if it is implemented as a persistent operating layer on top of Feature 079 rather than a second execution system.

The codebase already has strong primitives for teams, rooms, runs, monitoring, workpack execution, and rollout gating. What is missing is the durable role layer that binds those primitives into:

- department-grade role contracts
- recurring routines with durable schedules and checkpoints
- role-level monitor projections
- typed delegation and exception ownership
- role maturity and autonomy gating

No external web research was required for this planning pass. The problem is primarily about aligning internal product surfaces, runtime boundaries, and durability expectations with the code that already exists in this repository.

## Relevant architecture and implementation touchpoints

### 1. Team substrate

- `apps/web/server/services/teamService.ts`
  - Teams already have member definitions, autonomy defaults, memory and artifact policy JSON, and lead-role semantics.
  - This is the most natural starting point for introducing role-agent contracts without discarding the existing team model.
- `apps/web/shared/teamBlueprints.ts`
  - The blueprint catalog exists, but it is still broad and skewed toward creative, research, and engineering scenarios.
  - Feature 080 should extend it into profession-grade operational blueprints instead of starting a new role-template stack somewhere else.

### 2. Room and communication substrate

- `apps/web/server/routers/teamRoom.ts`
  - Rooms already support create, get, viewer state, list, and message send flows with tenant checks and intent routing.
  - The message metadata pattern is a strong fit for typed role-to-role communication.
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
  - The UI already knows how to render actor-aware threads, work-item links, approval-oriented quick replies, and live updates.
  - This should evolve into typed internal comms streams and role-thread views instead of being replaced.

### 3. Run and continuity substrate

- `apps/web/server/routers/teamRun.ts`
  - Existing run controls already support start, pause, resume, advance, stop, and get flows.
  - This is evidence that run lifecycle control already exists, but Feature 080 must add durable routine cycles, checkpoints, watchdogs, and schedule wakes on top of it.
- `apps/web/server/services/monitoringService.ts`
  - Monitoring already captures snapshots, alerts, run activity, and stuck checks.
  - Feature 080 should aggregate role health from these signals plus Feature 079 workpack evidence rather than create a disconnected monitoring ledger.

### 4. Existing operator UI

- `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx`
  - There is already a live monitor shell for roster, timeline, status, and controls.
  - The component structure is a good substrate for a role-centric monitor even though the current vocabulary is run-centric.
- `apps/web/client/src/pages/Workpack*.tsx`
  - Feature 079 now provides workpack intake, detail, replay, connector, exception, and ROI surfaces.
  - Feature 080 should deep-link into these views rather than copy them into a new control plane.

### 5. Workpack substrate from Feature 079

- `apps/web/server/routers/workpack.ts`
  - Feature 079 now exposes workpack list/detail, clarification actions, simulate, replay, connector discovery and validation, start-run, scheduling, exception handling, learning, readiness, ROI, and incident controls.
  - This confirms that Feature 080 should inherit workpack execution and safety posture instead of inventing its own executor and rollout model.
- `apps/web/shared/featureFlags.ts`
  - Relevant flags already exist: `workpacksEnabled`, `workpackAutonomousPilot`, and `workpackOpsConsole`.
  - Role-agent autonomy must inherit these flags to avoid a parallel rollout taxonomy.

### 6. Improvement and runtime trust substrate

- `apps/web/server/services/skillStudioService.ts`
  - Existing improvement machinery can already synthesize or refine automation assets.
  - Role-level learning should reuse that pipeline rather than build a second improvement engine.
- `apps/web/server/services/skillUpgradeApplier.ts`
  - Compatibility, proposal, and apply logic already exists.
  - This is the right substrate for low-risk role improvements once role-level evidence gates are defined.
- `apps/tauri-shell/src-tauri/src/desktop_worker_fabric.rs`
  - The desktop worker fabric already models approval, identity, budget attribution, and token rotation.
  - This is the strongest managed path for role routines that require local execution without asking users to install external agent runtimes.

## Codebase conventions and constraints

### Extend existing surfaces instead of forking them

The repository consistently prefers:

- shared contracts in `apps/web/shared`
- orchestration in `apps/web/server/services`
- thin routers in `apps/web/server/routers`
- control-plane UI under `apps/web/client/src`

Feature 080 should follow that pattern. The monitor should be a role-centric projection over existing team, run, monitoring, and workpack data, not a sidecar application.

### Trust and rollout should remain inherited

The strongest safety pattern in the current codebase is explicit, fail-closed gating backed by enums, schemas, flags, and tenant checks.

Feature 080 should preserve that posture by:

- inheriting Feature 079 workpack readiness and incident state
- using tenant feature flags as the outer rollout envelope
- preserving existing browser and desktop trust semantics
- keeping role contracts versioned and auditable

### Long-running autonomy must be queue-backed

The repository already has background job and schedule idioms, but month-scale role continuity is not yet a first-class concept.

That means Feature 080 needs:

- durable routine-cycle records
- durable queue items
- explicit checkpoint freshness rules
- safe lease or claim semantics
- idempotent wake handling

Without those pieces, the role monitor would look plausible but would not actually support reliable persistent operation.

## Likely implementation touchpoints for Feature 080

The most likely first-wave touched areas are:

- `apps/web/shared/teamBlueprints.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/workpackContracts.ts`
- new shared role-agent contract files in `apps/web/shared/*`
- `apps/web/server/services/teamService.ts`
- new role-monitor, role-routine, checkpoint, delegation, and promotion services in `apps/web/server/services/*`
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/routers/monitoring.ts`
- Feature 079 workpack services and router endpoints where role-level ownership, delegation, or rollout inheritance must be surfaced
- `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- new role-monitor pages in `apps/web/client/src/pages/*`

## Key risks discovered in research

### 1. Second-executor risk

If Feature 080 introduces a new freeform execution substrate for routines instead of resolving into Feature 079 workpacks and current runtime families, it will fragment safety, rollout, and monitoring.

### 2. Projection drift risk

If the monitor becomes a new ledger instead of a projection over role, routine, checkpoint, and workpack evidence, operators will not be able to trust what "current role state" means.

### 3. Scheduler ambiguity risk

Role persistence is not the same as an immortal process. If scheduling, queueing, lease ownership, and idempotency stay vague, the feature will over-promise month-scale continuity without delivering it safely.

### 4. Authority-smuggling risk

Role-to-role delegation is powerful, but it also creates the biggest policy-smuggling risk in the whole feature. The implementation must treat typed messages, connector scopes, side-effect ceilings, and workpack-family eligibility as one authorization matrix.

### 5. Boundary blur risk with Feature 079

Feature 080 should not own case ingestion, workpack simulation, benchmark publication, or connector readiness on its own. It should consume those workpack surfaces and add the persistent operating layer above them.

## Testing baseline

### Primary web app test stack

- App package: `apps/web/package.json`
- Test runner: `vitest`
- Main test command: `npm --workspace=@smartspec/web test`
- Typecheck command: `npm --workspace=@smartspec/web run typecheck -- --pretty false`

### Existing test patterns

- Shared contracts: `apps/web/shared/__tests__/*`
- Server routers and services: `apps/web/server/**/*test.ts`
- Client pages and components: `apps/web/client/src/**/*test.tsx`
- Existing workpack, monitoring, room, and orchestrator tests already show the repo's preferred mocking and state-shaping style.

### Testing implication for Feature 080

A safe implementation plan should define targeted tests for:

- shared role contracts and enums
- scheduler, checkpoint, and queue behavior
- role-to-workpack resolution and rollout inheritance
- delegation authorization and exception handling
- role monitor aggregation payloads
- UI rendering for role roster, detail, monitor panes, and operator actions

## Planning conclusions

Feature 080 is feasible in this repository if it is planned as:

1. a persistent role layer above Feature 079 workpacks
2. a queue-backed and checkpoint-backed continuity model
3. a role monitor that aggregates existing run and workpack evidence
4. a typed delegation model with fail-closed authorization
5. a staged rollout where operational roles graduate from supervised to autonomous only through evidence-backed gates

The plan should stay disciplined about one rule above all others:

Feature 080 owns persistent role operation, not a brand-new executor.
