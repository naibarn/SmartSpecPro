# SPEC224 Commit-Time Revalidation Test Design

| Requirement | Observable behavior | Test level/location | RED evidence | Residual boundary |
|---|---|---|---|---|
| Approval, owner, issuer audit, and tenant canonical rows stay stable through protected start | Real mutation transactions block while Node waits on the validator and can proceed only after the admission transaction finishes | PostgreSQL integrations in `spec224ProtectedExecutionStartPostgres.integration.test.ts` and `spec224RecoveryGrantValidatorPostgres.integration.test.ts` | No separate pre-change test run was captured; the current tests observe waiters in `pg_stat_activity` while validation is paused | Does not prove production DB URL parity; deployment config must bind web and Python to the same canonical database |
| Python remains the single grant/approval decision authority | Invalid persisted approval state, missing approval response, or tampered issuance audit returns a stable deny result | Python PostgreSQL integration in `test_spec224_recovery_grant_postgres.py` | No separate pre-change test run was captured; the test now mutates each persisted record and checks its deny result | Does not enable remote source trust or live dispatch |
| Existing revoke race stays serialized | A Python revoke waits on the same grant advisory key, and a revoke committed first is observed as denied | Existing process-level PostgreSQL suite plus the row-mutation race | PR #404 already established shared-key cross-process wait | Grant fence does not serialize independent identity/tenant mutations; row locks cover those during the protected transaction |
| External HTTP remains bounded and fail-closed | Actual Node-to-Python HTTP timeout returns UNKNOWN/DENY and releases locks after timeout | Real HTTP/PostgreSQL test in `spec224RecoveryGrantValidatorPostgres.integration.test.ts` | PR #404 established the previous timeout behavior; this work re-runs the path with controlled HTTP delay and concurrent authority mutations | Five-second validator latency remains inside the protected transaction |

## Evidence captured

- Disposable PostgreSQL identity: `spec224-safe-b2c3d4e5|spec224_d385_test|spec224_d385_runtime|PostgreSQL 15.17`, isolated internal Docker network, no published DB port, host proxy only on `127.0.0.1:55497`, non-superuser test role. The repository's SPEC-224 baseline migrations were applied to this cluster; two omitted event columns from the checked-in modern schema were added only to this disposable database.
- Actual Node-to-Python HTTP/PostgreSQL test: **1 passed**. A 1.2 second real validator delay held separate PostgreSQL updates to `approval_requests`, `users.isDisabled`, and `tenants.ownerId` until admission completed. Python returned `VALID`; Node recorded it and allowed the existing local development path. A 6.5 second real delay exceeded the validator timeout, returned an unavailable denial, and released the advisory fence.
- Protected-start PostgreSQL lock test: **1 passed**. With the validator paused, independent approval and owner writers were observed waiting until the protected-start transaction committed.
- Python grant/approval/audit PostgreSQL test: **1 passed**. Rejected request, deleted owner approval response, and tampered issuance audit each failed closed; restored canonical records validated again.
- Focused Node unit checks: **23 passed** across runtime admission, grant validator, and protected execution start.
- PR #404's 49-test disposable PostgreSQL fence evidence is reused; the prior full set was not repeated.

## Focused security review passes

1. Confirmed Node holds the shared grant advisory fence before loading and locking protected state.
2. Confirmed worker job and current attempt rows are locked before validation, preserving lease and fencing predicates.
3. Confirmed source attestation invalidation, grant binding, and attestation writers lock the same worker job row.
4. Confirmed runner session and capability snapshot rows use shared locks and remain bound to the active revision.
5. Confirmed tenant owner identity is locked and independently mutated during the real HTTP test.
6. Confirmed the owner user row is locked and disable mutation waits during the real HTTP test.
7. Confirmed ApprovalRequest state and grant JSON are locked; decision, cancel, cleanup, issue, and revoke writer lock ordering was traced.
8. Confirmed existing ApprovalResponse rows and issuance AuditLog rows are included in the Node lock set; supported insert paths serialize on parent approval/tenant authority rows.
9. Confirmed Python checks persisted request type/status/requester/count/payload/action digest and requires the owner's approved response.
10. Confirmed Python checks the independent issuance audit actor, role, tenant, scope digest, and event digest in addition to the embedded audit chain.
11. Confirmed validator timeout remains fail-closed, records UNKNOWN, and releases the transaction-scoped advisory fence.
12. Confirmed the mock-validator protected-start test and real HTTP validator test are reported separately; neither is live Runner dispatch evidence.
13. Confirmed remote source trust classes remain denied and no Runner/Rust files changed.
14. Reviewed transaction ordering against grant revocation: both sides acquire the grant fence before tenant/request rows, avoiding the former cross-service TOCTOU race.
