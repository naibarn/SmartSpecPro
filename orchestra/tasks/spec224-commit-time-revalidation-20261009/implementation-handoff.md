# SPEC224_COMMIT_TIME_CANONICAL_GRANT_REVALIDATION

## Decision

**GO** for in-transaction canonical row locking and Python validation before protected-start commit.

**NO-GO** for moving Node-to-Python HTTP validation outside the transaction. Python remains the only grant decision engine. Revalidating all approval, owner, audit, tenant, source, attempt, runner, capability, expiry, and revocation predicates in Node after an external call would duplicate authorization policy. Calling Python again inside the transaction would retain the same lock duration and would not solve the latency problem.

## Changes

- Node protected admission now requires a database transaction for production snapshot validation and locks tenant owner, ApprovalRequest, persisted ApprovalResponse rows, issuance AuditLog rows, and the owner user row before calling the existing Python validator. Existing job, attempt, source event, grant-fence, Runner, and capability locks remain in force.
- Python continues to own authorization decisions and now denies internally inconsistent persisted authority: wrong request state/type/requester/count/payload/action digest, missing owner-approved response, or missing/mismatched owner issuance audit.
- Test-only HTTP middleware can pause the real validator route using bounded task-local marker files, allowing separate PostgreSQL connections to race canonical mutations.
- Remote trust classes remain denied. No Runner/Rust paths or production authority were changed.

## Verification

Source base: `aae75ee4a18574fa67421a7688f28f7ce8adc715`.

Disposable PostgreSQL: `spec224-safe-b2c3d4e5|spec224_d385_test|spec224_d385_runtime|PostgreSQL 15.17`; internal Docker network, no published DB port, host proxy bound only to `127.0.0.1:55497`, runtime role is non-superuser. The SPEC-224 baseline migrations and two omitted `worker_job_events` columns were applied only to this task-owned disposable database.

- Real Node-to-Python HTTP/PostgreSQL concurrency: **1 passed**. During a 1.2-second validator delay, separate connections attempting to update `approval_requests.status`, `users.isDisabled`, and `tenants.ownerId` were observed waiting on PostgreSQL row locks. The actual Python route returned `VALID`; Node completed the local test admission. A controlled 6.5-second HTTP delay exceeded the validator timeout, produced `UNKNOWN`/fail-closed denial, and released the transaction-scoped grant fence.
- Protected-start PostgreSQL mutation race: **1 passed** with the validator held; approval and owner mutations waited until the start transaction committed.
- Python PostgreSQL approval/audit checks: **1 passed**. Rejected approval, missing owner response, and tampered issuance audit each denied; restored canonical records validated.
- Focused Node unit tests: **23 passed** across runtime admission, grant validator, and protected execution start.
- PR #404 disposable PostgreSQL shared-fence suite: **49 passed previously; reused, not repeated**.
- Python `py_compile`, Prettier check, and `git diff --check`: passed.
- Repository-wide typecheck/build: not run under the repository's memory policy.

## Lock ordering and remaining risk

Node and Python revocation acquire the same transaction-scoped grant advisory fence first. Node then locks job/tenant, attempt, Runner/capability, canonical grant evidence, and owner rows. Python revocation proceeds fence → tenant → ApprovalRequest. Grant issuance and normal approval decision/cancel/expiry writers lock tenant/request authority before creating/updating their dependent records. Source-attestation invalidation and grant-binding writers lock the worker job row already held by admission. Focused mutation tests observed no lock cycle.

The five-second validator timeout and its HTTP latency still occur while protected PostgreSQL locks are held. This change closes races among canonical mutable rows but does not reduce lock duration. Moving the HTTP call requires a future versioned proof contract plus a complete commit-time verifier that does not duplicate Python policy; neither is currently established.

## Canonical integration

- Worktree: `/home/dev/.cache/codex/worktrees/spec224-safe-postgres-admission-20261009`
- Branch: `codex/spec224-commit-time-revalidation-20261009`
- Source state: task changes are implementation-complete pending normal PR integration and canonical Handoff update.
- Next WorkUnit after integration: `SPEC224_VALIDATOR_LATENCY_REDUCTION_CONTRACT` — establish an authority-owned proof/revalidation contract that can safely move external I/O outside the protected transaction without a second authorization engine. Until such a contract is approved and implemented, retain the current fail-closed in-transaction validator.
