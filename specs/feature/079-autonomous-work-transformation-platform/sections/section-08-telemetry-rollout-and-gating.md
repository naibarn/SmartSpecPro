# Section 08: Telemetry, Rollout Controls, and Feature Gating

## Overview

This section adds the operational measurement and staged release controls for Feature 079. Its job is to make the workpack layer observable, measurable, and safely rollable without creating a second monitoring stack or letting rollout logic drift into the UI.

The implementation should turn the workpack lifecycle into stable telemetry signals, then use those signals together with trust, connector, replay, and promotion evidence to decide when a pack can move from draft to supervised use and from supervised use to autonomous rollout.

This section is the final system-safety layer in the feature. It must keep unknown, stale, tainted, or otherwise unvalidated states fail-closed.

## Dependencies

- `section-01-shared-contracts-and-persistence`
- `section-03-workpack-compiler-and-routing`
- `section-04-simulation-replay-and-exceptions`
- `section-05-connector-mapping-and-boundary-control`
- `section-06-learning-benchmarks-and-promotion`
- `section-07-control-plane-ui-surfaces`

## Blocks

- None

## Scope

Implement a telemetry and gating layer that:

- defines a shared workpack telemetry vocabulary for events, snapshots, readiness, and rollout phases
- records lifecycle and rollout events without mutating the core run ledger
- aggregates workpack metrics for completion, intervention, exception, throughput, cost, and promotion readiness
- evaluates rollout gates for supervised and autonomous use based on evidence, trust, tenant state, and rollout cohort state
- provides incident-containment controls for active, queued, and scheduled work
- exposes rollout and readiness summaries through monitoring and admin surfaces
- keeps the UI as a consumer of readiness state, not the source of truth

The section should not:

- invent a second observability platform
- derive rollout permission from a dashboard badge or client-only state
- silently widen tenant access or ignore trust-taint, connector drift, or stale promotion evidence
- promote a workpack based on metric trends alone
- duplicate the replay, exception, or benchmark logic owned by earlier sections
- absorb persistent role ownership or role-based scheduling semantics from Feature 080

## Files to Create or Modify

| File | Action | Purpose |
|---|---|---|
| `/home/dev/projects/SmartSpecPro/apps/web/shared/workpackTelemetry.ts` | Create | Shared telemetry vocabulary for workpack events, metric snapshots, readiness summaries, and rollout phases |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/__tests__/workpackTelemetry.test.ts` | Create | Shared schema and enum validation tests for telemetry and gating payloads |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/workpackTelemetryService.ts` | Create | Record workpack lifecycle events and aggregate metric snapshots for rollout and readiness views |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/workpackRolloutGateService.ts` | Create | Evaluate supervised and autonomous rollout eligibility using evidence, trust, and tenant gate state |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/workpackReadinessService.ts` | Create | Derive stable readiness summaries for monitoring, admin, and workpack surfaces |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/workpackIncidentControlService.ts` | Create | Apply kill-switch, quarantine, trigger-cancellation, and safe-resume actions for workpack rollout incidents |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/monitoringService.ts` | Modify | Accept workpack telemetry snapshots and expose them alongside existing monitoring data |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/monitoring.ts` | Modify | Add workpack telemetry, readiness, and rollout summary endpoints without duplicating monitoring semantics |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/adminOps.ts` | Modify | Surface workpack release health and rollout blockers in admin operations views |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/tenantFeatureFlags.ts` | Modify | Coordinate tenant-scoped rollout gating and staged enablement for workpack execution modes |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/OpsEarlyWarningPanel.tsx` | Modify | Show workpack rollout blockers, evidence gaps, and readiness regressions in admin ops |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx` | Modify | Display workpack rollout flags, cohort status, and staged enablement controls |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/__tests__/workpackRolloutPanels.test.tsx` | Create | Admin panel tests for rollout blockers, tenant flags, and readiness visibility |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/workpackTelemetryService.test.ts` | Create | Event capture and metric aggregation tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/workpackRolloutGateService.test.ts` | Create | Rollout gating and fail-closed eligibility tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/workpackReadinessService.test.ts` | Create | Readiness derivation and stable summary tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/workpackIncidentControlService.test.ts` | Create | Kill-switch, quarantine, and safe-resume tests for active and scheduled work |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/monitoring.workpack.test.ts` | Create | Monitoring router payload and authorization tests for workpack telemetry |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/tenantFeatureFlags.workpack.test.ts` | Create | Tenant feature-flag gating and staged rollout tests |

## Implementation Plan

### 1. Define the telemetry vocabulary first

Add a narrow shared contract layer for workpack observability before wiring any service logic.

The shared model should include:

- workpack event names for intake, clarification, simulation, execution, exception, promotion, rollback, and rollout transitions
- metric snapshot payloads for completion rate, intervention rate, exception rate, throughput, cost per completed item, estimated time saved, and promotion velocity
- rollout phase values for draft-only, supervised, autonomous-pilot, and autonomous-general release states
- readiness snapshot fields for evidence completeness, trust-taint status, connector health, exception burden, and rollout eligibility
- gate result values that distinguish ready, blocked, review_required, staged, and unknown states
- incident-control event and status values for pause, quarantine, cancel_requested, frozen, resumed, and safe-resume-required transitions

Keep the telemetry contract explicit and stable. If a field cannot be sourced from the current lifecycle, replay, connector, or promotion evidence, it should stay nullable or absent rather than being guessed in the client.

### 2. Capture telemetry from the existing lifecycle and monitoring sources

Implement a server-side telemetry service that consumes the signals already produced by earlier sections:

- workpack lifecycle state changes from intake, simulation, execution, exception, and promotion flows
- replay and exception evidence from Section 04
- connector validation outcomes from Section 05
- promotion readiness and benchmark evidence from Section 06
- run health and snapshot patterns already tracked by the monitoring service

The service should normalize these inputs into a single workpack telemetry stream and append point-in-time metric snapshots for the same workpack version. It should not rewrite source records or recalculate replay evidence.

Telemetry capture should focus on the lifecycle moments operators care about:

- draft created
- clarification requested
- simulation passed or failed
- supervised run started or blocked
- autonomous run started or blocked
- exception opened or resolved
- promotion candidate created
- promotion approved, reverted, or blocked
- rollout gate opened, narrowed, or closed

The telemetry service should keep event capture lightweight and deterministic so downstream monitoring and gating views can trust the summary shape.

### 3. Build rollout gating as a backend decision, not a UI condition

Implement a rollout gate service that decides whether a workpack may advance into supervised or autonomous use.

Gate evaluation should consider:

- the current workpack lifecycle and autonomy mode
- simulation and replay evidence completeness
- exception severity and recurrence
- connector validation freshness and block state
- promotion readiness state from Section 06
- trust-taint status and any local-only or manually overridden inputs
- tenant-scoped feature flag state and rollout cohort eligibility

The gate service must fail closed when the data is stale, incomplete, or internally inconsistent. Unknown states should not be treated as ready.

Recommended gate outputs include:

- `ready` when the workpack can proceed under the declared mode
- `staged` when the pack is approved for a narrower rollout cohort or pilot
- `blocked` when evidence, trust, or connector state prevents advancement
- `review_required` when the system needs an operator to confirm an unresolved boundary
- `unknown` when the service cannot determine the safe answer and must stop

Do not allow the UI to override these results. The client should only render what the gate service already decided.

### 4. Reuse tenant feature flags for staged enablement

Extend the existing tenant feature flag and admin operations patterns to control workpack rollout phases.

The implementation should support:

- tenant-scoped enablement for draft, supervised, and autonomous workpack modes
- staged rollout cohorts for controlled release
- explicit disablement paths for rollback or incident response
- operator-visible reasons when a tenant or rollout cohort is not eligible for a higher mode

Rollout controls should be additive to the current feature-flag system, not a new parallel policy engine.

If a tenant or rollout cohort is missing the required rollout flag, the service must keep the workpack constrained and surface the reason in the readiness summary.

### 5. Define incident response and kill-switch behavior

Feature gating must also control what happens after something goes wrong, not only before rollout begins.

Implement an incident-control service that can act at the:

- workpack version level
- rollout cohort level
- tenant level
- scheduled-trigger level
- active-run level

The service should support these actions:

- pause future dispatch for a target scope
- cancel queued work that has not started side effects
- quarantine matching runs so they cannot advance without operator review
- freeze promotion, benchmark publication, and autonomous widening while the incident is open
- revoke or invalidate pending approvals that were issued against now-stale evidence
- mark whether a run is safe to resume, must restart from a checkpoint, or must remain blocked

Incident controls must preserve auditability. Operators should be able to see what was stopped, why it was stopped, what remained in flight, and what evidence is required before safe resume.

### 6. Expose readiness summaries for monitoring and admin users

Build a readiness service that produces one stable summary object for the monitoring router, admin views, and workpack surfaces.

The summary should include:

- workpack id and current version
- rollout phase
- promotion state
- readiness status
- evidence completeness
- exception severity and recent trend
- trust-taint or blocked markers
- connector health and freshness
- last rollout decision and its reason code
- next safe action or operator follow-up pointer

This summary should be the single source of truth for all release-readiness surfaces. UI code should not recompute readiness from raw telemetry or infer an allow/deny decision on its own.

### 7. Wire telemetry into existing monitoring and admin routes

Extend the existing `monitoring.ts`, `adminOps.ts`, and `tenantFeatureFlags.ts` routers so operators can inspect workpack release health alongside the platform's existing operational views.

The router layer should expose:

- recent workpack telemetry snapshots
- rollout readiness summaries
- gate decisions and reason codes
- tenant rollout state and cohort assignment
- blocked-state explanations for supervised and autonomous rollout

Keep the handlers thin. They should fetch the service output and return stable payloads, not re-implement gating rules or aggregate metrics in the router itself.

### 8. Feed readiness data into existing section-07 workpack surfaces and admin views

This section should provide stable backend payloads for the dashboard card, workpack header, and metric-card components already planned in Section 07, but it should not take separate ownership of those UI files.

UI expectations for those payloads remain:

- healthy states are compact and readable
- blocked or tainted states are visually distinct and explicit
- unknown states do not get styled as safe
- the user can click through to the monitoring or admin surface for detail

In this section, the owned client changes should stay focused on admin and operations visibility. The main workpack-facing pages and summary components remain Section 07's write scope.

### 9. Keep rollout telemetry aligned with promotion and exception evidence

Telemetry in this section should preserve the same vocabulary used by earlier sections:

- replay-grade evidence from Section 04
- connector boundary posture from Section 05
- promotion readiness from Section 06
- operator-facing lifecycle surfaces from Section 07

The section should not invent conflicting names for the same state. If a workpack is blocked for trust-taint, connector drift, or incomplete replay evidence, the telemetry and rollout surfaces should say so using the same stable labels everywhere.

## TDD Expectations

Write tests before implementation lands for the following behaviors:

- shared telemetry schemas accept valid event, snapshot, readiness, and rollout payloads
- invalid or incomplete rollout payloads are rejected
- telemetry capture records workpack lifecycle events without mutating the source run ledger
- metric snapshots preserve completion, intervention, exception, throughput, cost, and time-saved fields through validation
- rollout gating blocks unknown, stale, tainted, or evidence-poor workpacks
- supervised and autonomous enablement respect tenant feature flags and staged rollout cohorts
- incident controls pause or quarantine active runs, cancel queued or scheduled work, and freeze promotion consistently
- readiness summaries remain stable across repeated reads for the same evidence set
- monitoring and admin routers return normalized telemetry, readiness, and gate payloads
- admin and monitoring-facing UI slices render healthy, blocked, tainted, and unknown states distinctly
- client code does not infer rollout eligibility from presentation state alone

Prefer focused service and router tests with mocked lifecycle inputs and deterministic timestamps over broad end-to-end rollout tests. Client tests should verify the shape, labels, and blocked-state copy for the compact readiness surfaces.

## Acceptance Criteria

This section is complete when:

- workpack telemetry is captured consistently across lifecycle, replay, connector, and promotion flows
- rollout readiness can be queried from backend services without reconstructing business logic in the client
- tenant-scoped feature flags can stage or block supervised and autonomous rollout safely
- incident controls can pause, quarantine, and safely resume active or scheduled work without losing operator context
- the monitoring and admin surfaces expose clear rollout blockers, readiness state, and next actions
- dashboard and workpack UI can consume readiness outputs from this section without hidden client-only rollout logic
- unknown or drifted rollout inputs fail closed instead of silently enabling broader autonomy

## Coordination Notes

- Section 01 owns the canonical workpack lifecycle and persistence vocabulary; this section adds telemetry and rollout overlays, not new core identity.
- Section 04 owns replay and exception evidence; this section consumes that evidence for readiness and gating.
- Section 05 owns connector validation; unresolved connector drift should remain a rollout blocker here.
- Section 06 owns promotion state and benchmark evidence; this section treats those outputs as gate inputs.
- Section 07 owns the main workpack control-plane surfaces, including dashboard and workpack summary components; this section feeds those surfaces with readiness and rollout-state data.
- Feature 080 owns persistent role-agent assignment and role-based scheduling. Feature 079 rollout logic stays tenant- and cohort-based.
- Preserve compatibility with the existing monitoring, admin, and tenant feature-flag patterns instead of introducing a separate release-control stack.
