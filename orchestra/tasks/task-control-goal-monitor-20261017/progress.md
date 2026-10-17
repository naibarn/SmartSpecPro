# Mission progress

Base inspected: `f3a533fdf782ef0af140fda9420178083f399cd2`; refreshed `origin/main` is `5b132da110b7d0b06202fdc5cf1b601d8c568304` and must be reconciled before promotion. Owned worktree: `/mnt/SmartSpecDev/task-worktrees/task-control-goal-monitor-20261017`. Shared primary checkout remains untouched.

## Work units

| Work unit | Status | Verified completion | Remaining work / dependency | Evidence | Next autonomous action |
|---|---|---|---|---|---|
| Ownership and SPEC contracts | PARTIAL | Read current ownership and preserved unresolved status; additive amendments recorded for 196/277/294/088; ledgers and generated index reconciled | SPEC-224/186/269 runtime links remain unchanged; confirm generated source evidence after rebasing | `python -m tools.spec_handoff index --check`; scoped validation `valid=true`, `completion_eligible=false` | Reconcile with fetched `origin/main`; revalidate source digests |
| Goal and usage reducers | IMPLEMENTED / TESTED | Weighted baseline projection, verified/live gates; empty observations stay unknown; dedupe source-linked replay, persisted correction count/history, cached subset, cumulative baseline, overlap unknown, credential redaction | No authoritative Goal baseline store/provenance source exists, so production goal percentages remain BASELINE_MISSING; helper receipts unlinked | Reducer and read-model fixtures | Keep Goal status unknown until a trusted source is connected |
| Authenticated read API | PARTIAL | Protected workerJobs reads, tenant/owner and admin fleet scope, signed filter-bound expiring cursor, bounded Project/SPEC usage union, replay/correction/reservation dedupe, cap handling, empty usage unknown; router and service tests | DB-backed authorization/cursor acceptance, pagination snapshot determinism, mutable history consistency, universal cross-surface projection token, all-history Goal union | 7 focused Vitest files / 56 tests pass; esbuild syntax pass | Add DB-backed auth and coherent projection-token tests; retain scopeBinding UNVERIFIED |
| Task Control UI | PARTIAL | Task/goal/model/usage/runner inspector, scope filters, bounded rollup, stale/unknown/attention/recovery; Chat panel deep-links to same read API by conversation ID | Desktop/tablet/mobile browser verification; actual Chat summary parity; visual accessibility acceptance | 7 focused Vitest files / 56 tests; Astryx kit/docs inspected; esbuild pass | Run responsive authenticated browser verification when a usable authorized environment exists |
| Agent Monitor | PARTIAL | Runner fleet from existing `runnerNodes.list`; runner-to-task hierarchy only where a job session binds the runner; task inspector, timeline, retry eligibility, human attention | Agent/session topology, multi-hop activity/history, and recovery analytics remain partial | UI test asserts runner inventory, snapshot expiry, and observed task edge | Extend topology only from existing bound agent/session/workspace evidence; do not infer edges |
| Integration and live acceptance | BLOCKED / OPEN | Partial PR #1001 is open; no live claims | Required GitHub `Mocked SPEC-308 browser simulation` failed at unrelated sign-in hint visibility assertion; authenticated live read path has no configured DB/UAT env values in this session | Run 38988051046 failed one existing `spec-308-route-surfaces` assertion (`.assistant-chat-onboarding-hint` expected hidden); progressive integration gate passed. JWT_SECRET, DATABASE_URL, SMARTSPEC_UAT_* unset | Continue independent implementation; after next push inspect/retry required check, do not change unrelated auth UI without causal evidence; live acceptance resumes when authorized DB/UAT environment exists |

## Verification and constraints

- Focused test command: `pnpm --filter @smartspec/web exec vitest run shared/taskGoalProgress.test.ts shared/taskUsageEvidence.test.ts client/src/pages/TaskObservabilityMonitor.test.tsx server/services/__tests__/spec224CodexBudgetAdmission.integration.test.ts --reporter=dot --maxWorkers=1 --no-file-parallelism` — 27 passed.
- Scoped esbuild syntax and `git diff --check` passed.
- Full `npm run typecheck` was not run per repository RAM policy. A prior selected-file `tsc` traversed broad imports and was stopped before it became a repository-wide workload; this is not a typecheck pass.
- `spec_handoff index --check` passed. Scoped validation reports valid with unresolved/open requirements. Global validation still has the unrelated pre-existing SPEC-014 source-evidence SHA mismatch.
- SPEC-224 execution behavior and Luna/Sol routing were not modified. No deployment, runtime migration, new scheduler, or auto-resume claim.

## Resume

1. Preserve this worktree and inspect `implementation/HANDOFF.md` plus GitHub state.
2. Reconcile current `origin/main` (`5b132da110b7d0b06202fdc5cf1b601d8c568304`) before creating a candidate commit.
3. Continue Project/SPEC aggregation and API contract tests; then authenticated UI and topology verification.
4. Final acceptance remains open until all required criteria pass or a genuine external authority blocker is recorded with a resumable handoff.
