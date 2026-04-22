# Claude Research

## Research Decision

Codebase research is required because Feature 105 is a composition feature over an existing monorepo. Web research is not required for this resume pass because the planning directory already contains a detailed architecture spec and local research notes, and this pass resumes at TDD planning rather than redefining external provider contracts.

## Codebase Findings

### Work OS Intake And Launch

- `apps/web/server/routers/workOs.ts` is the main API boundary for Work Request creation, automation launch, preflight preview, step routing, and Work OS diagnostics.
- `apps/web/server/services/workOsService.ts` owns Work OS request/case/task projections and should remain the canonical service boundary for request and case data.
- `apps/web/server/services/workAutomationFabricService.ts` owns automation run and step persistence.
- `apps/web/server/services/workAutomationPolicyService.ts` currently resolves launch policy and surface allowlists; Feature 105 should treat it as an input to richer orchestrator planning rather than replacing it immediately.
- `apps/web/client/src/pages/WorkRequest.tsx` and `apps/web/client/src/pages/MyRequests.tsx` are the main user-facing Work OS surfaces that need preflight visibility.

### Team Orchestration

- `apps/web/server/services/runEngine.ts` starts and advances Team runs.
- `apps/web/server/services/teamRunSkillExecutor.ts` resolves runtime execution for Team steps and currently remains a key routing point for skill and surface dispatch.
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx` and `AutoTeamLedgerPanel.tsx` already expose run state and diagnostics.
- Feature 105 should make Team kickoff plan-first, while preserving legacy plan-absent fallback for direct Team room creation.

### Context And Knowledge

- `apps/web/server/services/contextPackBuilder.ts`, `libraryContextPackService.ts`, and `agentRuntime/requestBuilder.ts` already model governed runtime context.
- Existing request building already strips suspicious plan-context keys such as secrets, tokens, passwords, direct queries, and connector credentials.
- Private-vault unlock state is modeled and must remain explicit across preview, approval snapshot, and dispatch.
- Feature 105 should avoid broad implicit memory expansion. Every upstream source included in a compiled brief should have a source ref, trust state, freshness state, and omission/inclusion diagnostics.

### Capability Surfaces

- Skill manifests, agency, workflow, media, video, document management, browser, and workpack systems already exist in the codebase.
- `apps/web/shared/workOrchestrator.ts` now provides the first shared contract layer for orchestrator surfaces, capability catalog entries, contract compatibility, execution budgets, team resolution, compiled briefs, and approval bundles.
- Work OS persisted automation surfaces currently stop at `video_editor`; `workflow` and `skill_studio` should remain planner-visible but compatibility-blocked until shared/router/persistence contracts are migrated end to end.

### Security And Governance

- `preflightAccessPolicyService` provides requester-safe vs admin-diagnostic preview modes.
- `preflightRevisionService` provides deterministic fingerprinting for request title, objective, linked sources, selected sources, policy inputs, and explicit team selection.
- `teamResolutionPolicyService` provides deterministic team precedence and fail-closed behavior.
- Remaining security work should add approval source snapshots, budget envelope enforcement, privileged-surface dispatch gates, telemetry, and Work OS timeline/Team ledger diagnostics.

## Testing

The `apps/web` package uses Vitest.

- Package scripts:
  - `npm run check` and `npm run typecheck` run `tsc --noEmit`.
  - `npm test` runs `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 vitest run`.
  - Focused tests can be run with `npm exec -- vitest run <files>`.
- Server tests use `vitest` with `describe`, `it`, `expect`, and `vi` mocks.
- Client tests use Testing Library through `apps/web/client/src/test-setup.ts`.
- Existing focused tests for the first Feature 105 slice:
  - `apps/web/shared/__tests__/workOrchestrator.test.ts`
  - `apps/web/server/services/__tests__/preflightRevisionService.test.ts`
  - `apps/web/server/services/__tests__/preflightAccessPolicyService.test.ts`
  - `apps/web/server/services/__tests__/teamResolutionPolicyService.test.ts`
  - `apps/web/server/routers/__tests__/workOs.test.ts`

## Planning Implications

- Start with shared contracts and backend policy services before UI.
- Keep Work Request review-first; request creation must not auto-run.
- Make preflight preview useful to requesters without leaking privileged diagnostic details.
- Keep runtime dispatch fail-closed for stale previews, missing team resolution, missing approval snapshots, budget overrun, and contract-incompatible surfaces.
- Add UI only after API contracts stabilize.
