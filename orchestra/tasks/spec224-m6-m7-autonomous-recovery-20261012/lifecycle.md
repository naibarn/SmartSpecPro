# Task Lifecycle — SPEC-224 M6/M7 Recovery

Goal: achieve real SPEC-224 Mini App Factory M6/M7 acceptance; continue from the prior Linux packaging checkpoint, repair only proven engineering defects, and preserve exact unblock predicates.

Scope/risk: medium / medium. This continuation corrects a false-negative release workflow test and updates task-local execution evidence. No runtime behavior, schema, production/staging, tenant data, or live Runner execution changed.

Current stage: VERIFY
Resume from: VERIFY
Stop reason: latest-source audits and focused tests are complete; real M6/M7 acceptance waits on missing non-production authority. Exact-SHA CI has unrelated TypeScript errors, and the Runner release CI stopped at one Linux namespace test failure before build.

| Stage | Status | Evidence / next action |
|---|---|---|
| Planning | COMPLETE | Inspected current `origin/main` at `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc`, Runner diagnostics, Factory runtime, SPEC-224 handoff, SPEC-278 source and release packaging. |
| TDD/Test Design | COMPLETE | `test-design.md`; baseline inspection recorded missing workflow packaging and installer behavior before implementation. |
| Implement | COMPLETE | Updated Linux release package, rollback-safe optional helper installation, packaging contract test, installer test, docs, matrix and handoff. |
| Verify | IN_PROGRESS | Focused Vitest: 8 files / 48 tests pass at task commit `6d5db053…`. Previous exact-SHA shared-host build is RESOURCE_BLOCKED. Current CI at `d0b558f7…` has unrelated `turbo_build` failures; Runner CI stops before build on one Linux namespace test. |
| Debug/Fix | IN_PROGRESS | Corrected stale archive-command assertion in `runnerReleaseWorkflow.test.ts`; no runtime policy change. External non-production authority remains missing. |
| Review | COMPLETE | Focused source review and integration-controller preflight passed; PR #836 merged normally with no bypass. |
| Final Verify | IN_PROGRESS | Focused tests pass on latest task commit; normal PR gate and current main CI remain pending/failed as recorded. Mission-level M6/M7 acceptance remains externally gated. |

## Latest-source continuation evidence — base `d0b558f7b1e511bbb866b35bae7f3880b742277c`; task commit `6d5db0533ea55ad81457cd88c8a177a14ac238af`

- Runner status re-observed 2026-10-12T01:16:53.712Z: 0/11 ready. `status`/`doctor`/`capabilities` perform discovery only and report `state: ready` regardless of tool readiness. `rescan` performs bounded probes and publishes to control plane.
- Runner service inactive; process had no `SAH_RUNNER_*` settings. Stored home connection points to production and its token expired 2026-10-09T08:15:53Z. No network action was taken. No authorized non-production enrollment or valid grant was found.
- Admission implementation deliberately requires canonical grant validation plus bound local non-production source evidence, or a production remote trust verifier. The verifier contract has no production caller. This is an authority gap, not permission to weaken fail-closed checks.
- Focused tests on the task commit: 8 files / 48 tests passed after correcting one stale assertion in `runnerReleaseWorkflow.test.ts`; dependencies were installed only in the isolated task worktree.
- Current main CI run 38191643238 on `d0b558f7…`: `turbo_build` failed on TypeScript errors in unchanged, unrelated files; Python and SmartSpecWeb jobs remained in progress at this checkpoint. Earlier run 38191201225 on `94eedf0a…` also failed `turbo_build` and Python while SmartSpecWeb continued. Runner release run 38191565929: crate tests reported 188 pass / 1 fail in Linux `moli_isolation` namespace setup; build did not start, publish skipped. Keep this independent issue open without bypassing the test.
- No disposable Postgres exists on the approved SPEC-224 port 55493. Shared persistent local Postgres on 5432 was not used. No live Factory run, grant, approval, app runtime, or browser UAT was attempted.

## Gap ledger

- `GAP-03` — `RESOURCE_BLOCKED`, MEDIUM, OPEN. Condition: canonical web build for integrated SHA `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc` did not start because the user slice had less than 512 MiB swap headroom; exit 137 was classified `RESOURCE_BLOCKED`. Evidence: canonical build result `.../5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc-3049295e-e03b-49c5-b69a-3a3dcb95f6b8.json`. Owner: CI/dedicated build runner. Action: run exact-SHA build in CI/dedicated capacity or after a fresh resource observation. Prohibited retry: same shared-host build without changed capacity. Resume: VERIFY.
- `GAP-01` — `VERIFY_ONLY`, MEDIUM, OPEN. Condition: focused Vitest is green locally, but the corrected false-negative assertion is not yet integrated. Evidence: 8 focused files / 48 tests passed at the latest-source worktree. Owner: current task. Action: promote the one-line test correction with the updated execution handoff; verify PR gate. Resume: CANONICALIZE.
- `GAP-02` — `BLOCKED_TRUE_EXTERNAL`, OPEN. Condition: no authorized non-production Runner/session, fresh tenant-scoped capability snapshot, exact source/workspace + DevelopmentRun/job/attempt binding, canonical protected-dispatch grant, required approval/budget authority, or isolated app-schema database. Existing stored Runner connection is production-bound and expired. Evidence and exact predicate: `capability-matrix.json` and fresh audit in `handoff.md`. Owner: SPEC-224/workspace-authority maintainer and authenticated tenant owner. Action: provide only the minimum scoped non-production authority listed in the handoff; then continue real M6/M7 without changing admission policy.
- `GAP-04` — `VERIFY_ONLY`, OPEN. Condition: CI for exact main SHA found unrelated TypeScript failures; Runner release workflow stopped at one Linux namespace test failure before build. Owner: CI / Runner maintainers. Action: classify and repair on current canonical source; do not bypass the security test. These failures do not establish Factory admission denial.

## Completion invariants

- PR #836 merged normally at `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc`; `progressive_integration_gate` passed.
- Scoped installer lifecycle test fresh: true.
- Release workflow contract unit test fresh: true, 3 tests pass after assertion correction; full focused web suite 48/48 passes on task commit `6d5db053…`.
- No unresolved conflict, damaged patch, or secret observed: true.
- Post-integration canonical build at `5f5154a...`: RESOURCE_BLOCKED (exit 137, <512 MiB swap headroom, web build not started); no retry on the same host. Current exact-SHA main CI has unrelated `turbo_build` type failures; hosted Runner crate test has one Linux namespace test failure and no binary build.
- Canonical user workspace: dirty at `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`; convergence pending and untouched.
- Real M6 acceptance: false.
- Real M7 acceptance: false.
- Browser UAT and final verification: false.
- M8 deferred: true.
- Overall mission complete: false.
