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

## Next WorkUnit

After this checkpoint, continue with an independent functional slice selected from current SPEC-303/304/240/287 ownership and authority. Do not reopen broad discovery or re-enable unproven team-room project memory.
