# Phase 4 TDD Matrix

| Requirement | Focused test | Expected result |
|---|---|---|
| Resource preflight has no side effects | Pure resource assessment test | Insufficient/stale/oom samples return `QUEUED_RESOURCE`; lease store is not called |
| One idempotent request | Admission service test | Repeated request key returns same canonical job and one admission event; changed definition conflicts |
| Event + job/outbox coupling | Injected transactional persistence adapter test | Queue row and `VERIFICATION_ADMISSION:QUEUED` event are committed together; exception rolls both back |
| Stale run owner | Admission service test | Revision/fencing mismatch returns `RUN_PROJECTION_STALE`/`RUN_FENCE_STALE`; enqueue is not called |
| Runtime missing | Admission service test | `NOT_CONFIGURED` event/status, no canonical job creation |
| Resource blocked | Admission service test | `QUEUED_RESOURCE` admission event, no job, unchanged phase and phaseAttempt |
| Worker registration | Static registry/type-list test | Fixed job type is in both default executor registry and PostgreSQL node worker set |
| Full never local | Existing runner test plus source boundary assertion | `full` remains `QUEUE_REQUIRED`; no child spawn |
| Worker resource loss | Executor contract test | `RESOURCE_BLOCKED` outcome is returned/recorded without reporter.fail or phaseAttempt change |
| Lease stale owner | Executor contract test | Lost/stale verification fence is not accepted as an outcome; only current owner may release |
| Missing runtime in worker | Executor contract test | `NOT_CONFIGURED` is explicit and no `PASSED` outcome is emitted |

Test-first order: add pure Node 22 `node:test` cases for the resource-only seam and admission orchestration; add/extend Vitest contract coverage for persistence/registry/executor where those imports require repository dependencies. No installation, full build, or full typecheck.

## Executed proof

- RED then GREEN: resource-assessment Node tests initially failed because `assess()` was missing; after implementation all resource-control cases pass.
- Passed: `node --experimental-strip-types --test apps/web/server/services/spec224VerificationResourceControl.node.test.mjs apps/web/scripts/spec224-verification-runner.test.mjs` (11/11), including fixed worker registration and safe job-envelope checks.
- Passed Node strip-types syntax checks for all touched TypeScript source/test files and `git diff --check`.
- Not run: Vitest persistence/router tests because this isolated worktree has no `vitest` or `drizzle-orm` dependencies; no dependency installation is allowed by the Phase 4 scope.
- Not proven: live transaction rollback, real outbox publication/consumption, worker-side resource sample/lease lifecycle, or execution with an actual workspace runtime.
