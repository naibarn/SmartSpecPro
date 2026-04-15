# Claude Research - 083-Agent-Registry-And-Organization-Model

## Research Decision (Step 6)

- Codebase research: Yes
- Web research: No
- Testing coverage analysis: Yes

Reasoning:
- The spec is tightly coupled to this repository's existing agent, delegation, and tenant-flag systems.
- The highest-risk work is integration and compatibility, not external platform selection.
- The repo already has a clear Vitest-based testing setup in `apps/web`, so the main planning risk is test placement and coverage, not test framework choice.

## Codebase Findings

### 1) The repo already has a partial role-agent governance model

- `apps/web/shared/roleAgentContracts.ts` already defines lifecycle states, autonomy tiers, contract versions, workpack bindings, checkpoints, delegation intents, approval types, and sensitive payload sanitization.
- `apps/web/server/services/roleConfigurationService.ts` and `apps/web/server/routers/roleMonitor.ts` already create and update role agents, contracts, workpack bindings, and routines.

Implication:
- Feature 083 should generalize the current role-agent model into a unified registry instead of creating a parallel governance system.

### 2) Runtime delegation already consumes capability profiles and scope definitions

- `apps/web/server/services/workerDelegationService.ts` already maps scope profiles to allowed routes, models, and knowledge capabilities.
- Delegated sessions already carry manifest-style data for workers, route families, MCP access, and knowledge permissions.

Implication:
- The registry should feed these runtime capability decisions, not bypass them.
- Registry selection can remain an explicit resolution step that produces a runtime manifest for the worker layer.

### 3) Tenant rollout gates already exist and can be extended

- `apps/web/server/routers/tenantFeatureFlags.ts` already enforces tenant-scoped rollout state and admin-only update paths.
- The existing feature-flag pattern is a good fit for staged registry adoption and phased exposure of new agent families.

Implication:
- The rollout layer should reuse tenant-scoped flag and permission patterns rather than introducing a separate rollout control mechanism.

### 4) The schema already has related but insufficient building blocks

- `apps/web/drizzle/schema.ts` already contains `agentTemplates` and `agentActivityEvents`.
- `agentTemplates` are template records, not governed executable versions.
- `agentActivityEvents` are append-only runtime telemetry, not a versioned registry with policy envelopes, rollout posture, or tenant targeting.
- `agentRunSummaries` is the closest existing shape for performance aggregation, but it is still run-level telemetry, not registry-level outcome memory.

Implication:
- Feature 083 needs new registry tables even though adjacent agent-like tables already exist.

### 5) Existing tests show the repo's preferred contract style

- `apps/web/shared/__tests__/roleAgentContracts.test.ts` uses schema parsing tests with concrete objects and fail-closed assertions.
- Service tests in `apps/web/server/services/__tests__` use Vitest with stubbed repositories and explicit behavior checks.
- Schema tests in `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts` validate required columns and enum values directly.

Implication:
- Tests for this feature should be contract-first, schema-first, and service-first, with explicit assertions around failed-closed behavior, tenant scoping, and version eligibility.

## Testing Context

- Framework: Vitest in `apps/web`
- Likely test locations:
  - `apps/web/shared/__tests__/`
  - `apps/web/server/services/__tests__/`
  - `apps/web/server/routers/__tests__/`
  - `apps/web/server/services/*.test.ts` for focused unit coverage
- Test command shape: `npm run -w @smartspec/web test`

## Research Summary

Feature 083 should be planned as an extension of the existing role-agent and delegated-worker architecture, not as a replacement. The registry should become the governed source of truth for agent identity, versioning, policy envelopes, rollout posture, and evidence-backed promotion, while still integrating with the current tenant-flag, role-monitor, and delegation services.
