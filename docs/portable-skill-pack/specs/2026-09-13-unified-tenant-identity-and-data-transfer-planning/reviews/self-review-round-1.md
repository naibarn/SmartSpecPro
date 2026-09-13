# Adversarial self-review — round 1

## Findings and fixes

1. **Transfer destination was initially underspecified.** A same-tenant transfer needs both a source user and target user, not only source/target tenant fields. Fixed by adding `sourceUserId` and `targetUserId` to the coordination model, preview/approval contracts, authorization rules, UI JTBD, and handler ownership behavior.
2. **The existing audit logger is asynchronous.** It cannot alone prove a transactionally committed security event for a tenant move. Fixed by requiring immutable database-backed `tenant_identity_events` with an idempotency key; JSONL audit emission is secondary.
3. **Credit reset could be interpreted as direct balance mutation.** Fixed by requiring the existing credit/ledger boundary to record the zeroing reason while preserving all prior transactions.
4. **Transfer-domain operation states could become a second job lifecycle.** Fixed by explicitly mapping operation projection states to canonical `worker_jobs` outcomes and prohibiting a second lease/retry/status source.
5. **Queue cancellation could be counted as successful data transfer.** Fixed by requiring a `queue_cancelled` item disposition, separate summary count, retained canonical job history, and no copied active execution.
6. **Tenant Admin scope was vague.** Fixed by naming the current `domain_admin` role as the initial Tenant Admin boundary and requiring same-tenant source/target users.
7. **UI/API artifacts had implementation ambiguity.** Fixed by selecting `TenantDataTransfer.tsx`, `components/tenant-transfer/`, `tenantDataTransfer` router procedures, and migration `0306_feature_186_tenant_identity_and_transfer.sql`.

## Adversarial checks

- Hostname cannot override authenticated tenant: covered by resolver, protected-route, and UI tests.
- Invalid supplied invite cannot silently fall back: covered in both registration modes and OAuth parity.
- System Admin move cannot accidentally transfer or restore credits: covered by transaction and UI warning requirements.
- Active provider work cannot be duplicated or guessed lost: covered by blocking/ambiguity evidence and Feature 186 reconciliation requirements.
- Duplicate approval/resume/item execution cannot repeat side effects: covered by operation/item idempotency and destination-marker requirements.
- Unsupported job-linked resource types cannot disappear silently: covered by handler registry and preview unsupported report.
- Partial batch commit can resume: covered by checkpoint, item states, and skip-transferred rules.
- Cross-origin SSO cannot become open redirect/token leakage: covered by exact allowlist, PKCE/state/nonce, one-time consumption, and redaction requirements.

## Remaining review result

No unresolved high-confidence implementation gap remains. The plan is ready for TDD mirroring and section splitting. Deployment/provider account validation remains an explicit later gate, not a planning blocker.
