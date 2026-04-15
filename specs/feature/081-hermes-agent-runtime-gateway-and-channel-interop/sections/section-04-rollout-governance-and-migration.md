# Section 04: Rollout, Governance, and Migration

## Ownership

This section owns rollout gates, user/admin guidance, and the OpenClaw-to-Hermes positioning needed to ship Hermes without undermining the current runtime family story.

## Target files and modules

- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/docs/help/en/hermes-workers.md`
- `apps/web/docs/help/th/hermes-workers.md`
- `specs/feature/README.md`

## Scope

- add Hermes runtime rollout gates
- keep dispatch narrower than registration during the early phase
- define the staged readiness model for registration, owner-bound dispatch, delegated MCP, and channel-companion behavior
- document operator policy for exceptional non-loopback Hermes API endpoints
- document when users should choose Hermes vs OpenClaw vs Desktop Host
- document the OpenClaw-to-Hermes onboarding lane and its limits

## Implementation notes

- registration, binding, delegated MCP, and channel companion behavior should not all turn on at the same time
- treat `hermesAgentRuntime` as the parent gate and document narrower readiness gates or policy checks beneath it so rollout stage intent stays machine-checkable
- help docs should explain the truthful boundary:
  - Hermes is external and user-owned
  - OpenClaw remains the current stable external delegated worker path
  - Desktop Host remains the managed local runtime path
- onboarding should mention Hermes upstream migration from OpenClaw, but SmartSpecPro should not over-promise automated import of upstream state into SmartSpecPro objects
- operator guidance should explain that public remote Hermes endpoints are denied by default and require an explicit audited exception path with rollback instructions

## TDD expectations

- add feature-flag tests before scheduler or fleet behavior changes
- add fail-closed tests for disabled Hermes rollout states
- add doc smoke coverage if the repo already validates worker help routes
- add rollout-stage tests that keep registration, dispatch, delegated MCP, and channel companion exposure separated
- add admin-policy tests for denied-by-default remote endpoint posture and explicit exception handling

## Acceptance checks

- Hermes runtime paths stay disabled when the feature flag is off
- admin and user docs distinguish Hermes clearly from OpenClaw and Desktop Host
- rollout posture can enable registration before dispatch and dispatch before channel companion behavior
- operator-facing docs explain when, why, and how a remote-endpoint policy exception may be granted and audited

## Risks and coordination notes

- the main rollout risk is user confusion, not just code failure
- messaging and migration language must stay precise so Hermes is presented as an addition to the runtime ecosystem, not a silent replacement plan
- the main governance risk is collapsing multiple rollout stages into one broad toggle and accidentally exposing a wider Hermes surface than intended
