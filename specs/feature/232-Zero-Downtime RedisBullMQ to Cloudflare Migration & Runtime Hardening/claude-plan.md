# Implementation Plan — Spec 232 G2 Auth / Revocation Recovery

## 1. Purpose, scope and operating mode

This plan recovers the current G2 Auth/revocation state mismatch and defines the evidence gate for safely reopening Web/Backend traffic. It does not authorize or execute Production operations. The immediate recovery remains on the current PostgreSQL-backed authorization path; promoting authorization coordination to Cloudflare Durable Objects is a later G2 wave with its own plan and target proof.

Spec 232 owns G2 migration mechanics. Spec 245 coordinates the full-system migration and its already-existing R8 plan. Preserve all Spec 245 plan/TDD/section files and add only a small G2 crosswalk after this plan is self-reviewed.

**Hard operating rules:**

- Keep Web, Backend and Web watchdog masked until every Production reopen gate below is independently evidenced and the system owner explicitly approves the maintenance exit.
- Do not use the historical JTI counts as a current import quantity. Capture a new target-specific snapshot after all writers are demonstrably paused.
- Preserve every active revocation, including PostgreSQL-only digests. A SHA-256 JTI digest cannot be converted back into a raw Redis revocation key; Redis-only rollback is unsafe.
- Never print token identifiers, secret bytes, connection strings, or raw auth-state keys. Retain only aggregate counts, sanitized digests where necessary, secret version IDs/key IDs, service revisions, timestamps and evidence references.
- Keep Redis available for its unrelated Voice, Pub/Sub and G3–G6 responsibilities. This work is not a global Redis retirement.
- Do not rerun migrations 0345–0349 if current target evidence confirms they are already applied with matching hashes.

## 2. Current implementation and target boundary

### Existing runtime path

`apps/web/server/_core/revocation.ts` uses a PostgreSQL JTI digest store as runtime authority and fails closed on lookup/store errors. When `JTI_REDIS_ROLLBACK_MIRROR=enabled`, the temporary bridge writes Redis before PostgreSQL and checks PostgreSQL before Redis. This bridge supports forward recovery and narrowly scoped compatibility; it does not make Redis-only rollback safe while a PostgreSQL-only digest exists.

The gated migration scripts are dry-run by default:

- `apps/web/scripts/migrate-jti-revocations.ts` requires `JTI_REVOCATION_MAINTENANCE_CONFIRMED=1` and `AUTH_WRITERS_PAUSED=1` for `--apply`.
- `apps/web/scripts/migrate-auth-login-failure-counters.ts` requires `AUTH_STATE_MAINTENANCE_CONFIRMED=1` and `AUTH_WRITERS_PAUSED=1` for `--apply`.

The execution owner must verify the exact Production URL/target from the trusted operator context without printing credentials. No script may run `--apply` until Sections 1–4 are signed off.

### Explicit separation from future Durable Objects work

SQLite-backed DO storage is transactional and strongly consistent within one object, but attached storage is private to each object. In-memory state can disappear on hibernation, eviction, or deployment. Therefore, the future G2 promotion must solve tenant/user/global revocation across multiple objects, durable restore, and fail-closed fresh PostgreSQL behavior; this plan does not claim those properties are implemented. See [official SQLite-backed DO storage docs](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) and [DO lifecycle docs](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

## 3. Execution roles and durable evidence

Assign named people, not only teams, to these roles before a Production window:

1. **System owner / incident commander:** approves maintenance, stop-writer fence, any guarded apply, and reopening.
2. **Production database operator:** proves target identity, migration state, backup/restore, and PostgreSQL scans.
3. **Redis/auth operator:** proves the correct token Redis endpoint/prefix and fresh scans for JTI, login lockout, device and pairing state.
4. **Application/release operator:** inventories all Web revisions and auth writers, verifies keyring parity and bridge configuration, runs smoke checks, and performs approved service operations.
5. **Independent reviewer:** checks redacted evidence and confirms each exit criterion without relying on the operator's assertion alone.

Store a timestamped evidence bundle outside public application paths. Each record includes environment label, target fingerprint with credentials excluded, exact code/deployment revision, command/script version, run timestamp, aggregate result, reviewer, approval, and a SHA-256 artifact checksum. Raw JTI/token values, auth keys, environment dumps and public copies of database backups are forbidden.

## 4. Ordered implementation waves

### Wave 0 — Re-establish target and all-writer inventory (read-only)

1. Confirm the Production host/DB/Redis identities through approved operator channels. Do not infer target identity from a local `.env` or a masked service.
2. Inventory every serving Web/backend instance, revision, replica, proxy/origin route, systemd unit, watchdog, auth-related Celery/worker/scheduler, and external token/device/pairing writer. Include Cloudflare routes, tunnels, load balancers, direct-origin paths, and any other origin reachable by clients.
3. Determine which exact code revision is served or was last served and whether it reads PG-only, PG+mirror, or any legacy Redis-only authorization path. Do not deploy or restart to discover this.
4. Record all consumers of Redis JTI/login/device/pairing namespaces separately from unrelated Redis consumers. Prove the maintenance fence will stop every G2 writer without stopping non-G2 Redis uses.
5. Output: reviewed inventory, target identities, writer/reader map, exact stop list, and unresolved external paths. Any unaccounted auth writer or origin keeps the gate blocked.

### Wave 1 — Durable backup and isolated restore proof

1. Select an owner-approved encrypted durable backup destination, key-retention owner, retention policy and recovery point; do not use the application media bucket unless its privacy/retention/restore properties are separately certified for database backup.
2. Capture a fresh backup only after confirming the Production target and approval. Verify artifact integrity and encryption metadata without disclosing key material.
3. Restore into an isolated database with no production credentials, network route, webhook, job worker or paid provider access. Verify application database identity, table set, required auth data, and migration hashes through 0349 if those migrations are confirmed present on Production.
4. Exercise the documented restore/recovery procedure and record duration, checksums, row-count/aggregate checks and reviewer sign-off. A file existing or a successful backup command alone is not a restore proof.
5. Output: private backup reference, isolated restore evidence, verified schema/migration state, recovery point, restore timing and approved recovery instructions. Failure leaves Production fenced and stops later waves.

PostgreSQL documents SQL dump, filesystem backup and continuous archiving/PITR as different approaches with different assumptions; the operator must select and validate the approved method rather than treating these as interchangeable: [PostgreSQL Backup and Restore](https://www.postgresql.org/docs/current/backup.html).

### Wave 2 — Maintenance and stop-writer fence

1. Announce an explicitly approved maintenance window and disable new login/token issue/revoke, refresh, device authorization, pairing and other G2 state writes at every entry point.
2. Stop/fence all identified background writers and consumers. Record service IDs, process/revision IDs and fencing time. Do not unmask/start the application during the fence.
3. Prove the fence from each instance/control surface and show no post-fence writes in the G2 namespaces. External origin or writer coverage that cannot be proven blocks continuation.
4. Preserve non-G2 services and Redis uses according to the approved change plan. Do not stop Redis globally.
5. Output: signed writer-fence attestation and a fixed fence timestamp. Any new G2 key/write after the fence invalidates previous scans; stop the newly identified writer and restart the snapshots.

### Wave 3 — Fresh G2 state snapshots and reconciliation dry-run

After Wave 2 only, capture coordinated read-only snapshots from the correct Production Redis and PostgreSQL targets:

1. **JTI revocations:** scan active Redis revoke keys with the exact literal prefix; compare digest/expiry against active PostgreSQL rows. Keep all PostgreSQL-only rows. Reject invalid identifiers or expiry ambiguity for human review. The old documented 272/1 counts are context only.
2. **Login counters/lockouts:** scan active, persistent, expired and malformed Redis values; compare against PostgreSQL without logging email/account IDs. Preserve active lockouts and persistent entries.
3. **Device grants:** inventory pending, consumed, expired and replayed grants. Do not erase active grants; wait for expiry/consumption or resolve through an approved owner action and rescan.
4. **Runner/Worker pairing:** inventory pending and active pairs, revocation/version state and key IDs. Do not discard active pairing state silently; hold new writes and wait for approved consumption/expiry unless a separately reviewed state-migration procedure is created. No JTI importer is evidence that these records were migrated.
5. Run the existing importers in dry-run mode against the confirmed targets. Verify no raw JTI, user identifier, connection URL or secret appears in output. Independently compare aggregate counts and digest-level equivalence.
6. Rehearse the race case in `smartspec_test`: add a synthetic JTI/lockout/device/pairing record after a preparation snapshot, then prove the post-fence final scan sees it. Never create synthetic records in Production.
7. Output: two-person reviewed per-family before-state and dry-run report, with unresolved/invalid row counts and a signed no-write statement. Any malformed/ambiguous state or nonzero unclassified record blocks apply.

### Wave 4 — Guarded import and stable post-import proof

1. Re-confirm approved backup/restore, active maintenance, system owner approval, target identity, complete writer fence and zero unclassified dry-run records.
2. Apply only the needed importer(s), using the existing guarded scripts and explicit flags. No DDL/schema change is expected; do not rerun 0345–0349.
3. Import active Redis-only JTI digests/expiries into PG idempotently. Preserve PG-only revocations. Re-read stored rows and verify expiry semantics. Never delete Redis revocations or overwrite longer/permanent PostgreSQL revocations with shorter Redis expiries.
4. Import eligible active login state while preserving persistent lockouts. The JTI and login importers do not migrate device grants or Runner/Worker pairing records. For those families, preserve and drain them through their normal consume/expiry/revocation lifecycle; if any cannot drain safely, stop and create a separately reviewed migration procedure with its own tests before changing those records.
5. Perform an independent second read-only scan after import and require zero active Redis-only JTIs, zero lost lockouts, and only understood/drained device/pairing state. Repeat the stable scan after the prescribed quiet interval while all writers remain fenced. The exact interval must be selected from measured propagation/scheduler behavior and recorded; do not invent it during execution.
6. On partial import, timeout or uncertain commit, keep maintenance active and rerun read-only comparison. Rely on idempotency/verification; never rerun blindly or remove data from either side.
7. Output: guarded apply audit, independent after-state comparison, zero unexplained discrepancies and reviewer sign-off.

### Wave 5 — Keyring, bridge and security validation while fenced

1. Provision `AUTH_SESSION_ENCRYPTION_KEYS_JSON` and `AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID` in the approved Secret Manager. Prove every intended Web instance has matching active key ID and overlapping keyring versions. Compare identifiers/version references only; never print bytes or secret-derived hashes.
2. Configure the temporary Redis-first JTI bridge on every instance only if the approved recovery design needs it. Verify code/config revision per instance and that a bridge write must succeed before revocation success; PostgreSQL remains first on reads and failures fail closed.
3. Run focused local and isolated integration checks first. In a non-production environment, prove: revoked/allowed/expired JTI behavior across independent instances; PostgreSQL unavailable fails closed; mirror write/read failure fails closed; a new revoke is written to both stores; PG-only state remains denied; login lockout/concurrent increments; device authorize/consume/replay/expiry; pairing decrypt/rotation across instances.
4. Recheck current source/config compatibility and confirm no legacy Redis-only authorization code can be activated as rollback. PostgreSQL-only digest makes Redis-only rollback unsafe.
5. Output: per-instance sanitized configuration evidence and test report. Any mismatch or unexpected allow keeps maintenance active.

### Wave 6 — Approved smoke, reopening and monitoring gate

All preceding waves must be signed off. While still fenced:

1. Run production smoke checks with synthetic operator-approved accounts only: allow a valid token, deny a revoked token, deny an expired/replayed device flow, verify active lockout behavior, and verify cross-instance pairing/session behavior. Confirm each auth store failure remains fail-closed.
2. Check all required health/readiness paths and actual caller-level G2 Redis telemetry. Verify correct deployed revisions, intended keyring/mirror flags, no config drift, no unaccounted origin or writer, and zero unresolved G2 state discrepancy.
3. A system owner and independent reviewer explicitly approve reopening. The plan's artifact status or a green local test does not substitute for this approval.
4. Only the approved release operator may unmask/start Backend, then Web, then watchdog in the reviewed dependency order, after proving public/origin traffic remains gated until both application health checks pass. Record exact commands, unit state, health status, service journal, and public/origin probes. If a unit fails readiness or any protected behavior fails, re-enter maintenance; do not remove masks or flags as an ad hoc retry.
5. Keep the temporary mirror only for its approved rollback window. Before disabling it, confirm PG authority is sufficient, no intended rollback relies on Redis-only state, all G2 Redis caller telemetry is understood, and any future revoke is preserved in PostgreSQL. Do not delete G2 Redis data as part of this plan.
6. Monitor authorization denials, store errors, mismatch counters and new G2 writes against explicit stop thresholds. If the approved thresholds are crossed, fence new auth operations and follow the forward recovery procedure; do not allow stale authorization or revert to Redis-only logic.
7. Output: approved maintenance exit, per-instance service and auth proof, monitoring window/owners, rollback/forward-recovery checkpoint and incident closure decision.

If any gate is missing, the correct outcome is `BLOCKED_SAFE`: keep services fenced and list the exact missing owner/evidence; do not produce instructions that mask the blocker.

## 5. Spec 245 reconciliation and deferred DO wave

After this Spec 232 plan passes self-review:

1. Preserve Spec 245 R8's existing `claude-plan.md`, TDD plan, research and four sections. Add a short crosswalk under its current recovery/planned maintenance material linking to this plan's waves and G2 exit evidence.
2. Reconcile wording where older Spec 245 snapshots describe G2 as blocked; retain their timestamps as history and append current evidence only after the authorized run. Never edit an old snapshot to make it look current.
3. Keep §118.2's allowed maintenance pause and §118.3 safety gates. Removing an elapsed-time delay does not waive backup, auth, data-integrity or explicit owner gates.
4. Do not mark Spec 245 implemented or production-certified when only G2 recovery is complete. G1 verification and unrelated G3–G6/deployment gates remain independently owned.
5. Open a separate future G2 DO promotion plan only after recovery completes. That plan must prove global/user/tenant revoke semantics across object shards, restart/hibernation recovery, cross-region enforcement, post-cutover monitoring and fail-closed behavior before any DO authority change.

## 6. Failure handling and rollback boundaries

| Failure | Required response |
|---|---|
| Production target or writer inventory uncertain | Stop; remain fenced; obtain owner/instance evidence. |
| Backup unavailable, untrusted, or restore fails | No reconciliation/apply; obtain approved durable destination and repeat restore proof. |
| A writer continues after fence or a new auth record appears | Fence it, invalidate old snapshots, recapture all affected families. |
| Import partially succeeds or reports timeout | Keep maintenance; inspect idempotently with fresh read-only comparisons. Do not blindly rerun or delete either side. |
| PostgreSQL-only JTI exists | Preserve it; treat Redis-only rollback as permanently unsafe unless raw token is recovered from a trusted source. |
| Keyring or instance parity fails | Do not start/reopen; fix secret distribution through the approved secret manager and retest every instance. |
| Any revoked/expired/replayed token is allowed, store outage allows access, or cross-instance check differs | Immediate no-go; keep/re-enter maintenance; preserve evidence; correct forward on PostgreSQL-backed authority. |
| Health or external-origin evidence fails after approved start | Fence affected route/service again under owner direction; preserve PG authority and auth state; avoid restarting unrelated Redis consumers. |

## 7. Capacity, security, data, and operational costs

- **Scale:** the planned scans/imports are bounded and batched; measure snapshot size and DB load in the isolated rehearsal. Do not create a single unbounded query/import that competes with user traffic.
- **Data model:** use existing migration 0345–0349 structures and importers; this plan proposes no new schema or second auth ledger.
- **Security:** all G2 writes require a verified maintenance fence. Fail closed on DB/Redis/mirror/DO uncertainty. Artifacts are redacted; backup encryption and secret separation are required.
- **Recovery:** keep the original sources until after repeated reconciliation and separate retention approval. This plan does not delete Redis keys or database rows.
- **Operations:** no new dependency is proposed. Production work requires coordinated DB, Redis, secret manager, systemd, origin/network and owner evidence; the local plan alone cannot clear these external gates.
- **Reversibility:** changes use additive PG upserts, preserved source state, reviewed service gates and forward recovery. Redis-only rollback is specifically excluded because it can lose PG-only revocations.

## 8. Verification boundaries

- **Plan evidence:** this document and its TDD/section artifacts are a proposed implementation sequence only.
- **Local proof:** focused unit/integration suites prove code contracts only; they do not certify Production target, credential parity, network containment, backup restorability or service reopening.
- **Production proof:** requires current target-specific read-only scans, approved isolated restore, signed writer fence, guarded apply audit, stable after-state scans, instance/keyring verification, security smoke checks, authorized reopen and fresh public/origin health evidence.
- No Production writes, importer apply, systemd action, Cloudflare change or paid-provider operation is authorized by this plan.
