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
5. Persist a learning proposal lifecycle so generated proposals can be reviewed, accepted, scheduled, applied, rejected, expired, or superseded without losing evidence.

## Interfaces produced

- `orchestratorLearningService.evaluateRunForLearning(input)` returns workpack candidates and skill/workflow improvement proposals.
- Learning proposals include evidence refs, confidence, dedupe keys, governance action type, and recommended approval path.
- `orchestratorLearningService.transitionProposal(input)` moves proposals through the approved lifecycle with actor, reason, and evidence metadata.

## Interfaces consumed from earlier sections

- Section 04 provides plan-vs-actual traces, final artifacts, review outcomes, and exception signals.
- Section 02 and Section 06 provide governance for skill/workflow improvement actions.

## Implementation notes

- Prefer proposals and governed follow-up work over blind auto-application.
- Reuse existing workpack evidence packaging where possible.
- Keep `auto_apply_proposal` and publish/widen-visibility actions admin-only even when proposal generation becomes more automatic.
- Proposal lifecycle states are `generated`, `deduped`, `triaged`, `accepted`, `scheduled`, `applied`, `rejected`, `expired`, and `superseded`.
- `applied` is terminal for the proposal record but must link to the resulting workpack, workflow change, skill version, or maintenance task.
- `rejected`, `expired`, and `superseded` keep evidence refs for audit and future dedupe, but must not re-trigger automatic follow-up work.

## Tests to add first

- orchestrator learning service tests
- workpack bridge tests
- skill-improvement handoff tests
- proposal dedupe and confidence-threshold tests
- learning proposal lifecycle transition tests
- tests that rejected/expired/superseded proposals remain auditable but do not auto-reopen
- admin-only tests for auto-apply and publish/widen-visibility actions

## Done when

- Repeated successful Team paths can become governed workpack candidates.
- Skill/workflow improvement proposals carry enough evidence for review.
- No proposal is auto-applied or published without the proper action-specific gate.
- Proposal state transitions are stable, idempotent, and traceable to actor/reason/evidence.

## Risks

- too many noisy proposals
- weak mapping from Team evidence to reusable asset boundaries

## Mitigations

- require replay/readiness thresholds
- dedupe proposals by action type and evidence summary

## Implementation update

- 2026-04-22: added `apps/web/server/services/orchestratorLearningService.ts` to turn repeated Team outcomes into workpack candidates and governed skill/workflow improvement proposals.
- 2026-04-22: implemented lifecycle transitions for generated learning proposals so evidence survives dedupe, triage, acceptance, scheduling, application, rejection, expiry, and supersession.
- 2026-04-22: added focused coverage in `apps/web/server/services/__tests__/orchestratorLearningService.test.ts`.
