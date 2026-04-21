# Section 05 - Learning Loop, Workpacks, and Skill Maintenance

## Goal

Turn repeated Team outcomes into governed reusable assets.

## Ownership boundaries

- workpack candidate generation from Team runs
- skill/workflow maintenance proposal generation
- improvement handoff packaging

## Current touchpoints

- `apps/web/server/services/workpackLearningService.ts`
- `apps/web/server/services/workpackCompilerService.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`

## Deliverables

1. Add `orchestratorLearningService` that reads Team outcomes and emits:
   - workpack candidates
   - skill improvement proposals
   - workflow refinement proposals
2. Reuse workpack readiness/replay thresholds to decide when a path is stable enough for reuse.
3. Feed improvement briefs into existing Skill Studio flows.
4. Route `skill_studio` follow-up actions through the same action-specific governance model used by preflight planning.

## Implementation notes

- Prefer proposals and governed follow-up work over blind auto-application.
- Reuse existing workpack evidence packaging where possible.
- Keep `auto_apply_proposal` and publish/widen-visibility actions admin-only even when proposal generation becomes more automatic.

## Tests to add first

- orchestrator learning service tests
- workpack bridge tests
- skill-improvement handoff tests

## Risks

- too many noisy proposals
- weak mapping from Team evidence to reusable asset boundaries

## Mitigations

- require replay/readiness thresholds
- dedupe proposals by action type and evidence summary
