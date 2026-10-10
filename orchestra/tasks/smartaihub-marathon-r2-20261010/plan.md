# SmartAIHub Marathon R2 — Provider Boundary Checkpoint

## Classification

- Scope: medium, cross-file execution path.
- Risk: high; project/tenant authorization reaches external provider dispatch.
- Canonical base: `36fe5811a65b9c5a705f9ded6152607069077de4` (`origin/main`, 2026-10-10 refresh).
- Worktree: `/home/dev/worktrees/marathon-spec268-project-memory-isolation-20261010`.

## Recovery decision

The old SPEC-269 worktree is dirty at `08426194c743381a20ee45b46c6741a9d2eb9af0`, but the workspace registry reports zero active sessions, no owner session/PID/lease, and no active process using that path. Its two-file delta removes the post-assembly authorization revalidation and project-scoped rule filtering already merged in PR #426. Preserve the old worktree unchanged; do not cherry-pick or merge that delta. Continue from current `origin/main` under a new task branch.

## WorkUnit: PROVIDER_BOUNDARY_REVALIDATION

- Owner: conductor.
- Objective: revalidate the existing server-captured team-room binding at each actual LLM provider attempt and before direct media-provider dispatch; authorization-check failure must abort without fallback or dispatch.
- Authority: `teamProjectProviderAuthorization.ts` remains the sole project/team/room authority. No client-provided IDs authorize context. Chat project memory remains global-only unless a verified binding exists. Team-room persistent memory stays disabled pending source provenance.
- Paths: `unifiedOrchestrator.ts`, `executors/types.ts`, `executors/{textSkillExecutor,videoExecutor,imageExecutor,audioExecutor}.ts`, `skillModelFallback.ts`, `llmRouter.ts`, focused tests.
- Completion predicate: a revoked/mismatched room binding prevents all downstream provider calls; valid binding is checked per provider attempt, including fallback; existing non-team requests retain behavior.
- Residual boundary: PostgreSQL revalidation and a remote provider request cannot be atomic. The guard narrows the race to the interval between the final authoritative read and provider acceptance; no atomicity claim is made.

## Parallel wave

- Conductor owns runtime implementation files listed above.
- `provider_dispatch_guard_tests` owns only `apps/web/server/services/__tests__/llmRouter.providerAuthorization.test.ts`.
- Shared interface and test boundary are in `orchestra/contracts.md`.
- Dependency: test agent consumes the interface below; its new file does not overlap conductor source ownership.

## Checkpoint 1 — `PROVIDER_BOUNDARY_REVALIDATION`

- Integrated by PR #432 at `b3d676f22abde85c510e452b3156ce23a0c75d49`.
- Focused verification: 9 files / 214 tests passed on the branch candidate before merge; no provider, deployment, or atomic revocation claim.
- Team-room project context remains subject to the final-DB-read-to-remote-acceptance race. Standard Chat entity-memory context remains global-only without a verified project; team-room persistent memory remains disabled pending provenance.

## Checkpoint 2 — `CHAT_ENTITY_MEMORY_PROVENANCE_GUARD`

- PR #434 merged at `dc73feffcb6c6420dfc73f0178b48213fbd83b74`.
- `promptComposer.ts` now uses the existing project-aware entity-memory resolver and defers scoped entity context until its final canonical membership revalidation. Conversation project reassignment is denied so existing history is not reclassified; use a new conversation to change project context.
- Four focused suites passed: 78 tests. Preview build was skipped; no deployment/runtime acceptance is claimed.
- Updated SPEC-304 handoff state from the already integrated PR #433 checkpoint in the same PR.

## Checkpoint 3 — `CANONICAL_ENTITY_MEMORY_SCOPE`

- PR #436 merged at `224fa6cd8ce122ee178f3a6040c32269f0f814a0`.
- Legacy or unregistered room project IDs cannot widen entity-memory retrieval; only canonical project identity plus active membership allows project-scoped entity memory. The shared helper retains its existing global-only mode.
- Four focused suites passed: 79 tests on tree `341200801fce5a69d7a838069d9d6c08a9e95ee1`, identical to the merge tree. Preview build was skipped.
- Canonical SPEC-268 handoff records `REQ-CF6F62069953` as partial; project/segment source provenance, historical retargeted conversation state, App-switch isolation, and full runtime acceptance remain open.

## WorkUnit: `MINI_APP_ROUTE_IDENTITY_GUARD`

- Base: `b3d676f22abde85c510e452b3156ce23a0c75d49`.
- Scope: only render the Research Notes and Project Wiki reference runtimes for their canonical App IDs; unknown active App identities show an unsupported-runtime error rather than silently rendering Research Notes.
- Paths: `apps/web/client/src/pages/MiniAppRoute.tsx` and `apps/web/client/src/pages/__tests__/MiniAppRoute.test.tsx`.
- Evidence: route tests cover both supported App identities and an unrelated active App ID; Research Notes/Project Wiki page behavior remains covered by their focused page suites.
- Residual: this does not implement arbitrary App runtime hosting, migration 0392, deployment, or UAT.

## Next WorkUnit

Next WorkUnit: `SPEC268_TEAM_ROOM_CANONICAL_PROJECT_BINDING`. Continue with the existing SPEC-302 identity/migration authority; keep team-room persistent memory disabled until source provenance and isolation are verified. Preserve the old dirty SPEC-269 worktree and do not recover its unsafe two-file delta. After a safe SPEC-268 checkpoint, select the next independent functional slice from current SPEC-303/304/240/287 ownership without repeating broad discovery.
