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

## Checkpoint 4 — `TEAM_ROOM_PERSISTENT_MEMORY_FAIL_CLOSED`

- Source base: `c2dcab56648f1e9c8a7b662e465023bd861a7bd2`; integration candidate is refreshed onto current `origin/main` before promotion.
- Scope: disable automatic persistent entity capture, assistant episode writes, and rolling summaries from team-room messages; remove room/team/run scopes and room/team graph joins from prompt retrieval; filter promoted room-derived rules and scoped-memory projections using existing `memory_promotions` audit rows; monotonically retain `team_room` provenance when entity facts merge into an existing row.
- Ownership: isolated worktree and branch `codex/marathon-r2-spec302-context-policy-20261010`; no edits to the old dirty SPEC-269 worktree or its `scopedMemory.ts` / `promptComposer.ts` paths.
- Evidence: TDD RED reproduced existing automatic writes, summary reads, missing policy, provenance loss on entity merge, room/team graph-query expansion, and promoted room-rule leakage. An independent review then found the historical-promotion exclusion nested in one branch of a graph `OR`; it is now a top-level `AND`, with a SQL-shape regression proving it follows all graph match alternatives. Stored rows are preserved.
- Focused verification: 12 Vitest files / 135 tests passed from `apps/web` after the direct `buildChatContext` regression, promotion-audit exclusion, graph-OR correction, and run-scope filter; `git diff --check` passed. No full typecheck, broad build, deployment, or runtime acceptance was run.
- Residual: pre-existing entity rows that merged room-derived facts while retaining an older `auto`/null source cannot be identified from current row-level provenance. Durable room-to-project binding, message-level source provenance, App-switch isolation, production/runtime acceptance, and explicit manual scoped-memory API policy remain separate requirements. This checkpoint does not reopen or claim SPEC-224 dispatch.

## Checkpoint 5 — `TEAM_AGENT_RUNTIME_PROJECT_PROVIDER_BOUNDARY`

- PR #443 merged at `0379c7d66de00b5c43892358459c7c51357012ca` from source commit `1a056785eadea0b9a46487c97e51849d7d9a0f86`.
- The canonical TeamRoom project binding now crosses the AgentRuntime request contract and is revalidated against server authority before each JSON or streaming provider attempt. The legacy/shadow direct-provider fallback uses the same binding and fails closed on denial.
- Focused verification: 10 Vitest files / 189 tests and 71 Python AgentRuntime tests passed on the candidate tree; its tree hash matched the merged `origin/main` tree. No full build, deployment, direct T acceptance, or production dispatch is claimed.
- SPEC-269 remains partial. App-aware `MemoryContext`, `ProjectResolutionReceipt`, and direct T-01 through T-23 acceptance are not established. The dirty legacy SPEC-269 and SPEC-268 worktrees remain untouched; the old SPEC-269 delta is not reusable because it removes PR #426 authorization checks.
- SPEC-224 protected dispatch remains `DENY`; production deployment remains unauthorized.

## Next WorkUnit

Next WorkUnit: `SPEC269_APP_PROJECT_MEMORY_CONTEXT_BINDING_AND_T01_T23_ACCEPTANCE`.

Current state: no additional source WorkUnit in the inspected R2 candidate set is independently eligible. The TeamRoom and AgentRuntime project-provider boundary, Mini App route identity guard, and team-room persistent-memory fail-closed work are already integrated. SPEC-302/SPEC-304 identity/context paths remain shared/reserved; Feature 287 is blocked by its Factory-owned UI contract; Feature 014 still needs migration ownership; SPEC-038's remaining CMS KPIs require authoritative CMS records or external Rich Results evidence; and Feature 161 is Factory-reserved.

Do not repeat ownership recovery, provider-boundary wiring, route identity checks, or team-room memory-disable work. Resume only after the SPEC-302/SPEC-304 owners publish the canonical App identity and ProjectResolutionReceipt binding contract and release exact shared paths. Then implement from latest `origin/main`, add App/Project-bound runtime context without weakening project membership checks, and execute direct T-01 through T-23 acceptance. Keep team-room persistent memory disabled until provenance and isolation are accepted. Do not claim SPEC-269 completion, deployment, or SPEC-224 live dispatch.
