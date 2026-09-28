# Section 06 — Controlled Reopen and Spec 245 Crosswalk

## Objective and boundary

Define the final evidence gate for reopening current PostgreSQL-backed G2 auth, and reconcile that result with the existing Spec 245 plan. This section does not authorize service unmasking, traffic restoration, secret changes, or live data mutation. Immediate G2 recovery and a later Durable Objects promotion are separate waves.

## Reopen gate

Sections 01–05 must each show current `PASS` for the same target, revision, maintenance window, and evidence packet. The packet must include target/writer inventory, encrypted backup and isolated restore, complete fence, fresh state snapshots, reconciliation, preserved PG-only revocations, device/pairing disposition, keyring/security checks, named owners, and independent review. Historical observations, local tests, and source inspection do not substitute.

Immediately before a proposed reopen, recheck masked/inactive status, target/revision, key IDs, writer fence, and read-only G2 state. Any drift, new write, changed target, or expired window invalidates the decision and returns to the earliest affected section.

The approved runbook and current topology determine the exact unit and traffic order. The plan in `claude-plan.md` requires public/origin traffic to remain gated until Backend and Web health checks pass, then approved service start order and watchdog handling. Use only owner-reviewed commands in the maintenance record; do not guess commands from historical screenshots. At each bounded stage, run synthetic auth checks before expanding traffic. Recheck valid/revoked/expired token behavior, lockout, session decrypt/cross-instance behavior, device/pairing replay protections, store-failure behavior, logs, and G2 Redis telemetry. Record post-reopen redacted snapshots and owner acceptance before closing maintenance.

Stop expansion and follow approved forward recovery if a revoked credential is accepted, a lockout/session/grant is weakened, a store outage allows access, an unexpected auth write occurs, key/revision drift appears, or an owner threshold is exceeded. Preserve reconciled PostgreSQL state and evidence; never roll back to Redis-only authority.

## Spec 245 crosswalk

Append a short dated crosswalk to `specs/feature/245-Full-System Cloudflare Migration Master Plan/claude-plan.md` (and link from its section index only if needed). Do not regenerate or overwrite its established R8 plan, TDD plan, research, or sections.

| Spec 232 output | Spec 245 use | Limit |
|---|---|---|
| Current target/writer inventory | Auth producer/consumer map and ownership | Refresh for each window |
| Backup and isolated restore | Prerequisite for later G2/data-plane mutation | Target/time-specific; not ongoing backup certification |
| Fenced snapshots and reconciliation | Immediate PostgreSQL-backed recovery evidence | Does not retire Redis or migrate G2 to DO |
| Keyring/security and reopen evidence | Safe current auth operation | Does not certify full Spec 245 or approve key rotation |
| Undrained device/pairing state | Explicit owned follow-up/blocker | Cannot be inferred from JTI/login success |

Preserve historical status snapshots, noting their original timestamps and any superseded evidence. Spec 245 remains incomplete until its unrelated G1/G3–G6, deployment, and target gates pass. Do not mark it implemented or production-certified after G2 recovery alone.

## Later Durable Objects wave

Plan it separately after immediate recovery and stable observation. It must independently prove object partitioning/global revoke semantics, persistence across hibernation/eviction/deploy, cross-region behavior, idempotency/expiry, restore/export, load/fault behavior, authority transfer, rollback, and authenticated provider evidence. It is not a condition to reopen the current PostgreSQL-backed G2 system and is not authorized by this recovery plan.

## Acceptance and external gates

Reopen readiness requires a coherent, signed evidence packet, a named system/service/security owner decision, owner-approved commands and thresholds, staged smoke/health results, and accepted post-reopen observation. Otherwise status remains `BLOCKED_SAFE` and services stay fenced. Production identity, access, approval, actual smoke evidence, and all Spec 245 target gates are external.

## Implementation evidence and disposition

- Sections 01–05 now contain the scoped repository work and section-level review records. Local checks establish code/document behavior only; they are not a single target-specific packet for one maintenance window and do not satisfy the reopen gate above.
- Focused local validation passed for the G2 snapshot/JTI importer, login counter importer/store, synthetic authorization-session crypto, revocation behavior, and Runner/Worker route suites. PostgreSQL integration tests were skipped because `RUN_DB_INTEGRATION_TESTS` was not enabled. The Runner control suite required a synthetic test-only `JWT_SECRET` and then passed.
- No production database was read or changed in this implementation run; no backup/restore, live writer fence, instance/key-ID inventory, secret-manager review, owner approval, service unmask, deployment, traffic reopen, or live smoke was performed.
- Decision: implementation work for the six repository sections is recorded, while the operational reopen decision remains `BLOCKED_SAFE`. Any new production attempt must restart with fresh Section 01 target/revision/window evidence and proceed in order.
