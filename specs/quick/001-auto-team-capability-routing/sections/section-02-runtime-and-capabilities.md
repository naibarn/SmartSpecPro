# Section 02: Runtime And Capabilities

## Ownership

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/server/services/workOrchestratorSecurityPolicy.ts`
- `apps/web/server/services/orchestratorCapabilityCatalogService.ts`
- `apps/web/server/services/skillRegistry.ts`

## Goal

Make Auto Team execute the plan instead of stopping at a generic approval loop.

## Acceptance

- Selected capability wins over surface default when safe.
- Skills, agency, media, video, document management, and skill-creator fallback are represented in routing.
- Runtime dispatch policy exists for executable plan steps.
- Budget reservation counters are idempotent per step/attempt.
- Explicit human approval requirements are preserved.
- Safe Work Request fully-auto steps can run without manual approval caused only by default privileged-surface flags.

## Verification

- runEngine tests
- runtimeDispatchPolicy tests
- teamRunSkillExecutor unified wiring tests
