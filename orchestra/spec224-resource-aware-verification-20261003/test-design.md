# Test Design — Resource-Aware Verification

## Contract under test

Deterministic classification/admission/evidence logic, with durable PostgreSQL lease persistence for repository-wide FULL exclusion and durable Spec 224 event persistence for admission/outcome facts. Actual long-running work remains owned by canonical worker jobs.

## Cases

1. Exit code 137, `SIGKILL`, V8 heap exhaustion, or kernel OOM evidence classify as `RESOURCE_BLOCKED`; output alone without a resource marker remains a normal failure.
2. A concurrent race to acquire FULL verification admits exactly one owner.
3. An unexpired lease denies a second FULL acquisition; an expired lease is reclaimable only by incrementing fencing generation.
4. A stale owner cannot heartbeat or release a reclaimed lease.
5. Quick/package/integration scoped checks are admitted independently of the FULL singleton lease, subject to their own resource headroom.
6. Baseline-reference failures classify as `BASELINE_FAILED`; candidate failures classify as `CODE_FAILED`; neither is conflated with OOM.
7. Evidence bundle schema requires repository identity/revision, selected profile, exact command and scope, timestamps, exit/signal, result classification, and observed resource data; it excludes secret material.

## Test execution budget

Run the new control test, existing DevelopmentRun persistence test and migration test only if Vitest is already available. Do not install dependencies or invoke repository-wide typecheck/build under current resource policy.

## Execution result

- Test-first files were authored before implementation.
- Attempted focused command: `pnpm --filter @smartspec/web exec vitest run server/services/__tests__/spec224VerificationResourceControl.test.ts server/services/__tests__/spec224DevelopmentRunPersistence.test.ts drizzle/__tests__/spec224VerificationResourceLeaseMigration.test.ts`.
- Result: `TEST_ENV_UNAVAILABLE`; `vitest` is absent from this isolated worktree. No test pass is claimed. JSON/DDL/schema cross-checks and `git diff --check` passed.
