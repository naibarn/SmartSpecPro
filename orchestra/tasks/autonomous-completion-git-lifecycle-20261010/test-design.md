# Focused verification design

| Scenario | Expected behavior | Evidence in this slice | Result |
|---|---|---|---|
| Exact same-repo PR bound to clean inactive trusted workspace | Enqueue existing `INTEGRATE_COMPLETED_WORK` with stable PR/head key | `workspaceAuthorityAuditJob.test.ts` | Pending; Vitest executable is absent in checkout |
| Active Runner session | Do not enqueue | Same focused test | Pending |
| Dirty task worktree | Do not enqueue | Same focused test | Pending |
| Draft PR | Do not enqueue | Same focused test | Pending |
| Fork PR | Do not enqueue | Same focused test | Pending |
| Stale/different PR head SHA | Do not enqueue | Same focused test | Pending |
| Worker crash / lease expiration / duplicate claim / restart | Existing SPEC-267 / Feature 186 claim, lease, CAS and fencing contracts remain the authority | Capability-aware claim tests and isolated DB integration are separate | Not live-tested; isolated DB URL not configured |
| CI skipped/failure | Safe action's required-check gate refuses merge; skipped is not pass | Existing `evaluateRequiredCheckGate` contract/tests | Pending in this environment |
| Merge conflict | Reconciler does not enqueue; conflict repair remains a gap | Existing mergeability gate | Blocked pending repair implementation |

## Resource admission

`pg_isready` reports a local PostgreSQL listener, but this session has no configured `DATABASE_URL` or isolated test database credentials. No database was created or mutated. `pnpm --dir apps/web exec vitest run server/services/__tests__/workerRegistryService.test.ts` could not start because `vitest` is not installed in the checkout. No dependency installation, repository-wide typecheck/build, or high-resource check was attempted.
