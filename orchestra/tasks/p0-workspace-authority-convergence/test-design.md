# P0 Workspace Authority and Convergence — Test Design

| Requirement | Observable behavior | Level / test location | RED evidence | GREEN evidence | Residual boundary |
|---|---|---|---|---|---|
| Explicit workspace roles and single canonical authority | Unknown paths/branches never gain authority; duplicate canonical assignments reject | Unit, `scripts/development-lifecycle/test_workspace_authority.py` | New resolver import/API absent | Focused unittest command | Local registry does not prove cross-host replication |
| Stable identity and path reuse | Same Git worktree retains ID; a recreated worktree gets a new generation/ID | Git contract fixture, same test file | Registry has no generation model | Remove/re-add fixture and assert identity changes | Filesystem inode reuse needs a durable gitdir identity token |
| Session ownership is separate from Git state | Dirty file with dead/expired owner is stale; clean worktree with live lease is active | Unit/process contract | No common owner resolver | PID/start-time/lease tests | External-host liveness requires authoritative lease heartbeat |
| Dirty work preservation | Staged, unstaged, deleted, untracked and symlink paths are copied and hashed; source status/content is unchanged | Git contract fixture | No recovery snapshot API | Snapshot verification in temp recovery root | Ignored runtime artifacts are not captured by default |
| Canonical convergence | Clean registered workspace fast-forwards to exact integrated SHA; wrong authority/ref/dirty/unique commit blocks | Git contract fixture | Current code syncs only invoking checkout and requires current branch | Exact branch, HEAD and dirty assertions | GitHub auth/branch protection are not proven by local fixture |
| Ref race and resume | Canonical advances during sync; no stale completion receipt is emitted; retry/reconcile is idempotent | Concurrency/contract test | No canonical generation binding | Two revision fixture and repeated operation | Cross-process tests cover local SQLite, not network filesystems |
| Worktree retirement safety | Dry-run is default; live owner, dirty delta, unique commit, unknown role or no recovery proof prevents removal; safe retirement repeats idempotently | Git contract fixture | No shared retirement policy | Candidate matrix tests | Does not invoke Codex/Claude production process managers |
| Development completion contract | `COMPLETED` requires integration, fresh canonical evidence, workspace convergence and lifecycle retirement receipts | Unit, `apps/web/server/services/__tests__/spec224FinalVerify.test.ts` and `developmentLifecycleContracts.test.ts` | Existing final-evidence-only path can complete | Missing/stale receipt rejection and valid receipt acceptance | Does not prove external runner actually performed the transition unless signed receipt is verified |
| Skill integration and installed parity | Orchestra, lifecycle, session-finish, integration-controller, and canonical-checkout-sync reference one resolver and never independently infer authority | Contract tests + `bash skills/audit-skills.sh` | Existing docs disagree on alternate canonical workspace | Static routing assertions and runtime sync | Skill docs do not prove UI/remote runtime consumes resolver |
| SPEC ownership boundaries | SPEC-293 owns authority; SPEC-294 projects; SPEC-295 consumes source receipt | Static spec contract checks | SPEC-293 §32 denies local lifecycle ownership | Cross-reference/negative owner assertions | Product UI/deployment behavior remains staged |
| 30 supplied regression scenarios | All 30 scenario IDs are present, classified as executable local simulation or external contract boundary, and required repeated race/idempotency scenarios execute more than once | Scenario matrix fixture + unittest | No workspace-authority matrix exists | Matrix validator and named behavior tests | Cloudflare/DB/desktop-host scenarios remain simulations until their runtime adapters exist |

## Focused commands

- `python3 -B -m unittest scripts.development-lifecycle.test_workspace_authority scripts.development-lifecycle.test_canonical_source -q`
- `pnpm exec vitest run apps/web/server/services/__tests__/spec224FinalVerify.test.ts apps/web/server/services/__tests__/developmentLifecycleContracts.test.ts`
- `python3 -B -m unittest discover -s scripts/development-lifecycle -p 'test_*.py' -q`
- `python3 skills/runtime_sync.py verify`
- `bash skills/audit-skills.sh`
- `git diff --check`
