# Orchestra Lifecycle — Spec 245 Full-System Migration

Goal: reconcile the current Spec 245, deep-plan all required work, implement every repository-local section, and report external production gates separately.
Scope/risk: project / critical.
Current stage: FINAL_VERIFY.
Resume from: external evidence gates only.
Stop reason: local work complete; full-system completion requires owner-backed inventory and current target/production evidence.
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY.

## Stage ledger

| Stage | Status | Evidence | Next action |
|---|---|---|---|
| PLANNING | COMPLETE | Existing deep-plan session validated complete 4/4; current §11 background-work change reconciled into plan/TDD/sections; self-review round 2 passed | None |
| TDD_DESIGN | COMPLETE | Section 01 added fail-closed reconciliation, symlink, source scan, trigger inventory, scheduler and secret-leak regression cases | None |
| IMPLEMENT | COMPLETE_LOCAL_EXTERNAL_GATES_OPEN | Implemented all safe repository-local changes identified for the four planned sections; no remote resources or database were mutated | Resume only when authoritative external evidence is available |
| VERIFY | COMPLETE_LOCAL_EXTERNAL_GATES_OPEN | Section 01 compiler 15 tests; Section 02 cache 26 tests; Section 03 Worker 24 tests; Section 04 Python 47 tests and canonical job/outbox service 54 tests. Scanner found 917 candidates; example-manifest verify reports 920 blockers. Final changed-code tests and `git diff --check` pass | No further local gate identified in this pass |
| DEBUG_FIX | COMPLETE_FOR_LOCAL_FINDINGS | Fixed Section 01 scanner coverage and Section 04 review findings; follow-up notes are recorded under `implementation/code_review/` | Reopen only if new evidence finds a regression |
| REVIEW | COMPLETE_LOCAL_WITH_EXTERNAL_LIMITS | Follow-up review found recovery lacked a canonical periodic caller and a bounded-batch fairness cursor; both fixed in the PostgreSQL-pull worker; three clean reviews followed | Do not claim global migration completion |
| FINAL_VERIFY | COMPLETE_LOCAL_EXTERNAL_GATES_OPEN | Focused tests pass; `git diff --check` passes; target and production gates remain blocked by absent evidence | Obtain current owner/target evidence before any cutover |

## Review convergence

- Round 1: traced Python dispatch → Node create/outbox contract → worker gate, claim reset → recovery, and poll retry → unified worker classification. Fixed false recovery-success reporting and moved periodic recovery into the PostgreSQL-pull worker.
- Round 2: reviewed bounded reconciliation fairness and retry behavior. Found that the 50-user scan could repeatedly select the same first batch; added an ordered cursor and a regression test.
- Round 3: rechecked cursor SQL, repeated-failure progression, worker-loop isolation, and hard-cutover retry path. No further local gap found; the Python suite passes 47 tests.
- Round 4: rechecked all modified call paths against the four section acceptance contracts and the review findings. No new local defect found; target evidence is not inferred from unit tests.
- Round 5: rechecked config/docs/proof counts, `.env` preservation, dirty-worktree scope, and post-fix verification freshness. No local changes required. Stop reason is `implemented_with_deferred_external_gaps`, not global migration complete.

## TDD / requirement matrix

| Requirement | Observable behavior | Test/evidence | Residual boundary |
|---|---|---|---|
| Five read-only compatibility compiler commands | Fixture input yields deterministic inventory, graph, placement, refactors, waves, redacted bindings, egress/filesystem/cron maps and report | `apps/web/scripts/__tests__/cloudflare-migration-compiler.test.ts` — 15 passed, including unsupported PostgreSQL session-feature scan; `inspect` and `verify` run against the example manifest | Does not prove all deployed callers or account/runtime facts were discovered |
| Unknown work fails closed | Unknown owners, unclassified triggers, duplicate scheduler/executor, unsupported package-only claim or missing `worker_jobs`/outbox-before-effect blocks full retirement | Same compiler test file; assert failed status and stable blocker codes for negative fixtures | Does not prove the inventory manifest is exhaustive without authentic host/runtime evidence |
| No code execution or secret leakage | Compiler does not run hooks/builds/probes, read secret values, or include them in any artifact | Same test file uses canary secret and malicious hook-shaped fixture; assert canary absent and no side-effect marker created | Static test does not prove production deployment credentials absent; runtime is not invoked |
| Search cache cutover contract | KV cache miss/error does not affect Responses API; tenant/user isolation holds; active KV never calls Redis | Existing Worker/cache/Responses tests and target evidence documented in Section 02 | Target route and beta hit/miss evidence must be fresh; prior evidence is dated |
| Redis G3/G4 safe ownership | Cross-process quotas remain atomic; stale lease owner cannot settle durable effects | Existing API quota and delegated-worker lease integration tests, plus focused semaphore contract tests | Local DB tests do not certify deployed migration/head or cutover |
| Redis G1/G2/G5/G6 per-family owner | Each family has one authoritative owner; revocation is fresh; callbacks/realtime and queue retry preserve canonical records | Spec 232 group-specific tests/runbooks and compiler fixture; enumerate concrete families during Section 03 review | Redis traffic closure, live target and cross-process operations need current environment evidence |
| Database/runtime/Debian retirement | All active schedules/callbacks/runtime/storage have destination; no old-host dependency remains | Read-only static inventory/route-graph tests locally; target journey, network-deny and power-off runbook evidence separately | No local test can prove host shutdown safety or production journey by itself |
| Python worker admission and media recovery | Hard cutover admits Python jobs only while the PostgreSQL-pull worker is enabled; unclaimed image rows can retry dispatch and retryable polls use canonical job retry | Python tests — 47 passed; service `jobControlPlane.test.ts` — 54 passed; positive worker startup, periodic recovery, batch cursor, and dispatch-failure recovery are covered | No authenticated end-to-end DB/Worker runtime or provider proof |

## Gap ledger

| Gap | Earliest stage | Status | Action |
|---|---|---|---|
| G245-01: Spec §2.1 compatibility compiler absent | IMPLEMENT | FIXED_LOCAL | Read-only five-command compiler and deterministic artifact fixtures are implemented |
| G245-02: Full host/runtime ownership inventory is external | VERIFY | OPEN_EXTERNAL | Keep unknowns blocked; obtain fresh service/process/scheduler/deployment evidence |
| G245-03: Current Spec §11 trigger classes were not in the prior plan | PLANNING | FIXED | Integrated into plan, test plan, Sections 01/04 and review round 2 |
| G245-04: Existing dirty edits overlap job-control/media work | IMPLEMENT | GUARDED | Apply only requested recovery/admission changes and preserve unrelated hunks; no reset, stash, broad stage, commit, or push |
| G245-05: External Cloudflare/managed DB/Debian proof is not available in this task | VERIFY | OPEN_EXTERNAL | No deploy, credential mutation, database mutation, unmask/restart, or host power-off |
| G245-06: `verify` ignored unreconciled source signals | TDD_DESIGN | FIXED_LOCAL | Every finding blocks with source location until owner/evidence reconciliation |
| G245-07: scheduler ownership and business trigger inventory were not enforced | TDD_DESIGN | FIXED_LOCAL | Require inventory declaration, job trigger mapping and unique schedule ownership |
| G245-08: manifest and output paths could follow symlinks | TDD_DESIGN | FIXED_LOCAL | Manifest/output symlinks are rejected; scan gaps fail closed |
| G245-09: arbitrary free text could be emitted into artifacts | TDD_DESIGN | FIXED_LOCAL | Reject common secret-like values before artifact output |
| G245-10: static scan silently ignored missing/unreadable sources | VERIFY | FIXED_LOCAL | Root, directory, file, size, and symlink scan problems now block `verify` |
| G245-11: full owner/runtime inventory remains absent | VERIFY | OPEN_EXTERNAL | 917 source candidates remain unreconciled; obtain current owners and runtime/host evidence |
| G245-12: Hyperdrive-incompatible PostgreSQL session features were not in the source scan | VERIFY | FIXED_LOCAL_SCAN | Candidate scanner detects advisory locks and LISTEN/NOTIFY/UNLISTEN; all matches still require owner/runtime disposition |
| G245-13: Section 04 review found orphan dispatch, worker-flag mismatch, and Celery retry risks | DEBUG_FIX | FIXED_LOCAL | Added fail-closed Python dispatch flag guard, unclaimed-image recovery, canonical retry exception, and regression tests; target run remains external |

## Gap closure

- must_do_now: none; the in-scope review findings were fixed and retested.
- should_offer_next: none.
- safely_deferred: owner-backed inventory, current Cloudflare account/runtime evidence, real PostgreSQL/Hyperdrive compatibility and restore drills, live caller/scheduler closure, and Debian network-deny/power-off proof; these require external state and could be disruptive.
- no_action_needed: repository TypeScript typecheck was not run because `AGENTS.md` prohibits it under current memory constraints; no migration, deploy, service restart, `.env` edit, or external resource mutation was requested or performed.

## Safety boundaries

- Working tree was dirty before this task. Do not reset, stash, overwrite or broadly stage it. Use explicit paths and a temporary index for any section commit.
- Work on `main` is permitted by deep-implement's default policy; avoid changing user-owned paths and keep commits path-scoped.
- Do not run repository TypeScript typecheck. Run only focused implementation tests requested by the deep-implement TDD workflow.
- No production deployment, real DB migration/import, secret change, service unmask/restart, Redis deletion, or Debian retirement is authorized by the request.
- SocratiCode is unavailable; targeted shell discovery is the recorded fallback, and source scans remain partial evidence.

## Loop policy

- Iteration: 5/12; tool-call batches: count unknown; estimated cost: unknown under conservative budget; dispatch waves: 0/6; parallel writers: 0/2; repair rounds: 3/5; clean review rounds after fixes: 3/3 minimum.

## Completion invariants

- all mandatory local stages closed: true
- no open local must-do gap: true
- no stale required local gate: true
- review converged for local scope: true
- final local verification fresh: true
- full-system migration complete: false (external inventory, target, and host-retirement gates remain open)
- Stop only after local requested sections converge or an external-dependency/loop-policy boundary requires an explicit blocked outcome.
