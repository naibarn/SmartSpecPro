# Spec 245 — G1 Evidence & G2 Production Readiness Runbook

**Runbook state (2026-09-26): `G1=BLOCKED`, `G2=NOT_PRODUCTION_READY`.** This runbook is operational preparation only. No Production deployment, flag change, DDL, import, caller switch, or maintenance action was performed in this run. Existing Worker/KV resources are reused; do not create another namespace or binding.

## Evidence matrix

| Requirement | Status | Evidence / closure condition |
|---|---|---|
| Existing Worker and `SEARCH_RESULT_CACHE` target | PASS (last recorded Production evidence) | Deployment evidence names Worker `smartspec-cloudflare-runtime`, version `f6f0ba85-3d23-476e-b8af-55840609442d`, and existing KV binding. Re-query Cloudflare before a release. |
| Commit `7e9d8beb0` trace propagation and Worker KV outcome logs deployed | BLOCKED; last evidence says code-only | Last Production evidence explicitly records these changes as not deployed. This session has no `CLOUDFLARE_API_TOKEN`; Wrangler deployment query failed before returning a target version. |
| Commit `7e9d8beb0` request-scoped fault injection deployed | BLOCKED; last evidence says code-only | Do not set either fault flag before the normal code-only release and baseline probes pass. |
| Beta A/B normal Search miss then hit | BLOCKED | No authorized Browser storage states or Production URL/model variables are available. Run §1.2. |
| Web-to-Worker trace correlation and KV outcomes | BLOCKED | Once deployed, correlate each response `X-Trace-Id` with Web cache hit/miss and Worker `search_result_cache` get/put logs. Do not retain prompt or identity. |
| Tenant isolation | BLOCKED for live Beta check; prior synthetic probe PASS | Prior synthetic Production KV probe recorded tenant isolation pass; live Beta cross-tenant behavior and tenant mapping are not recorded. Run §1.3 using two authorized accounts in distinct tenants, if they are distinct. |
| Production Admin Cloudflare tab | BLOCKED | No authorized Admin Browser state. Run §1.2 and retain a redacted screenshot/evidence record. |
| Redis SearchResultCache caller telemetry = zero | BLOCKED | Zero old keys is not operation telemetry. Capture Redis command telemetry grouped by client/process/caller during both real Search tests. |
| Request-scoped KV failure fallback | BLOCKED | Run only after normal tests; requires the two short-lived flags and Admin session. Verify Web returns 200 and Worker trace says `injected_failure`, then turn off and verify both flags absent/false. |
| G2 migration source/schema review | PASS locally; Production recheck BLOCKED | Local 0345–0349 were executed in order in a disposable test schema transaction and rolled back. Last Production journal was at 0344 with 0345–0349 pending; rerun the read-only SQL below immediately before any approved maintenance. |
| Production backup restore | BLOCKED | No backup artifact/restore destination or restore drill evidence is available. Production DDL and import remain prohibited until an approved isolated restore drill passes. |
| JTI importer/state-change race | PASS local synthetic rescan; Production recheck BLOCKED | A new local test adds a JTI after the first snapshot and proves a fresh scan sees/imports its digest. Apply still requires writer-pause guards and re-scans current Redis. The earlier 275 and latest 273 counts are pre-maintenance snapshots, never import targets. |
| Active login lockout preservation | PASS locally; Production recheck BLOCKED | PostgreSQL integration covers 12 concurrent failures and a persistent lockout introduced after a modeled empty preparation snapshot. Latest old-Redis snapshot had zero; re-audit only after writers stop. |
| Pending Device Authorization / Runner/Worker Pairing | PASS local synthetic integration; Production recheck BLOCKED | Local integration creates a pending device grant after a modeled empty preparation scan, proves one-time consumption, and creates/rotates a paired session across instances. Prior/latest Redis snapshot had zero; pause issuance and re-scan after writers stop. |
| Pairing key separation and cross-instance compatibility | PASS locally; Production keyring BLOCKED | Local rotation integration passed with two keys/instances. Production secret-manager values and all-instance parity have not been verified. Never send key material in chat or logs. |
| Rollback after a new post-cutover revocation | PASS unit contract; Production simulation BLOCKED | Redis-first mirror order, fail-closed behavior and a new revocation surviving simulated Redis-only recovery are covered locally. Production mirror continuity and app rollback have not been tested. |
| Web TypeScript baseline comparison | FAIL typecheck; no migration regression found | Same `apps/web` `npm run typecheck` project config: 633 diagnostics in baseline and current tree, 633 matching file/line/column locations, no diagnostics in changed G1/G2 files. One pre-existing `AdminMonitoring.tsx:959` unresolved `ClipboardList` diagnostic changed code TS2552→TS2304 with identical location/symbol. Full typecheck remains failed. |
| G2 Production Ready | BLOCKED | Backup restore, production keyring parity, fresh post-pause Redis state, maintenance attestation, deploy/restart, cross-instance Production smoke, and caller-level Redis closure are outstanding. |

## 1. G1 Production execution

### 1.1 Controlled release, flags remain off

1. The release operator first obtains read-only Cloudflare deployment access and records the current Worker version/route/binding. Do not create a KV namespace or binding; use the existing `SEARCH_RESULT_CACHE` binding.
2. Review `git show --stat 7e9d8beb0` and the focused diff in `apps/cloudflare/src/index.ts`, `apps/cloudflare/src/contracts.ts`, `apps/web/server/services/cloudflareSearchResultCache.ts`, and `apps/web/server/_core/responsesRoutes.ts`.
3. Deploy Worker and Web code with `CLOUDFLARE_SEARCH_CACHE_FAULT_TEST_ENABLED` absent or `false`. This is a code release only; the fault path must remain inert.
4. Verify Worker `/healthz`, authenticated cache readiness, Web `/healthz`, provider selection and a synthetic put/get/TTL probe. Do not enable fault injection or alter `CLOUDFLARE_ACTIVATION`.
5. Record Worker version, Web revision/commit, deployment timestamp and health output. If any normal probe fails, stop and use the G1 cache-bypass recovery in `direct-cutover-plan.md`.

The current Cloudflare deployment list could not be queried because Wrangler has no token. The public Worker `/healthz` returns 200, but that does not identify the deployed code version; the prior evidence says the trace/fault changes were not deployed. The Production Web `/healthz` returns 200, but the active `smartspec-web.service` process started at 16:58:34 +07, before the route/cache source modifications and commit `7e9d8beb0`, and has no recorded restart. The release is therefore prepared, not executed.

### 1.2 Authorized Browser states and normal tests

On an operator workstation that is authorized to sign into Production, create a private local directory and manually complete login in each launched browser. Do not put credentials in shell arguments, source files, chat, or repository files.

```bash
umask 077
SESSION_DIR="$(mktemp -d)"
chmod 700 "$SESSION_DIR"
npx playwright codegen --save-storage="$SESSION_DIR/beta-a.json" 'https://<production-host>/login'
npx playwright codegen --save-storage="$SESSION_DIR/beta-b.json" 'https://<production-host>/login'
npx playwright codegen --save-storage="$SESSION_DIR/admin.json" 'https://<production-host>/login'
chmod 600 "$SESSION_DIR"/*.json
```

For each run, the operator manually signs in as the named account, confirms the expected role/tenant, then closes the browser so Playwright writes the storage state. Keep the directory outside the repo; destroy it after the approved test window. Never attach these files to evidence.

Run the first three normal Specs before fault injection:

```bash
cd apps/web
export G1_PRODUCTION_BASE_URL='https://<production-host>'
export G1_RESPONSES_MODEL='<enabled-responses-model>'
export G1_BETA_A_STORAGE_STATE="$SESSION_DIR/beta-a.json"
export G1_BETA_B_STORAGE_STATE="$SESSION_DIR/beta-b.json"
export G1_ADMIN_STORAGE_STATE="$SESSION_DIR/admin.json"
export G1_EVIDENCE_OUTPUT_DIR="$SESSION_DIR/evidence"
npx playwright test tests/e2e/cloudflare-search-cache-production.spec.ts --project=chromium --workers=1 --grep 'Beta account|Admin Cloudflare'
```

The two Search requests per Beta account use the same unique prompt. For each account, verify in trace logs: first request has KV get `miss`, search result put `stored`; second request has KV get `hit`. Browser output records only account alias, trace ID, HTTP status and `web_search_call` presence. Do not infer Hit/Miss from HTTP 200 alone.

### 1.3 Tenant isolation, traces, Admin and Redis telemetry

- Link Browser `X-Trace-Id` to the Web log entry and Worker JSON log (`component=search_result_cache`, `operation=get|put`, `outcome=miss|hit|stored`). If the trace is missing on either side, fail the evidence item.
- Use authorized Beta identities in distinct tenants for the cross-tenant check. Reuse a synthetic tenant-scoped cache key created for the test, then prove the other tenant receives a miss/empty result. Do not use real customer search content as a sentinel. If both beta accounts share a tenant, keep the previous synthetic isolation test as separate evidence and report that live cross-tenant behavior remains blocked.
- In the authenticated Admin Cloudflare tab, capture a redacted screenshot showing the expected Worker and binding; exclude account identity and token/secret fields.
- Capture Redis command telemetry grouped by caller/process for the test window. A zero key count or aggregate Redis ops/sec is insufficient. Acceptance requires no SearchResultCache-originated Redis command correlated with either request.

### 1.4 Request-scoped fault injection and shutdown

Only after §1.2/§1.3 normal checks pass, and with the release operator authorized to make a temporary config revision:

1. Enable `CLOUDFLARE_SEARCH_CACHE_FAULT_TEST_ENABLED=true` on the Web and Worker. Do not change the KV namespace/binding or `CLOUDFLARE_ACTIVATION`.
2. Enable the local Playwright gate and run only the fault Spec:

```bash
export CLOUDFLARE_SEARCH_CACHE_FAULT_TEST_ENABLED=true
export G1_FAULT_INJECTION_ENABLED=true
npx playwright test tests/e2e/cloudflare-search-cache-production.spec.ts --project=chromium --workers=1 --grep 'request-scoped KV get failure'
```

3. Verify only that Admin-authenticated request returns normal Search success, Web treats KV failure as a miss, and Worker trace records `injected_failure` before any KV read. Normal requests must not carry the fault header.
4. Immediately deploy/revise both Web and Worker with the fault flag absent/false. Query both configuration surfaces read-only and record proof they are off. Unset local `G1_FAULT_INJECTION_ENABLED`.
5. Repeat one normal Beta miss/hit pair and health probes. Close G1 only when all rows above pass; otherwise retain `G1=BLOCKED` and list the missing evidence.

## 2. G2 Production preflight

### 2.1 Read-only database preflight

Run `ops/feature-232/g2-production-preflight.sql` using a read-only Production database role. The script begins `READ ONLY` and rolls back. Compare the migration row/hash to local journal index 328/tag 0344 and verify `users.id` remains integer. Confirm the four target tables are absent or match the expected schema, no lock waiters exist, and database name/server version are expected. Stop if any result differs from the reviewed target. Do not run a test migration or create a scratch schema in Production.

Local migration review: 0345 creates JTI digest/expiry table; 0346 creates one-time device authorization with FK to `users.id`; 0347 creates login counters with TTL; 0348 creates hashed lookup indexes and encrypted paired auth state; 0349 permits a null expiry for a persistent legacy lockout. Each transaction uses local 5-second lock and 60-second statement limits. Local disposable schema transaction was rolled back; this does not replace target revalidation.

### 2.2 Backup/restore evidence

The backup owner must create/identify an approved encrypted Production backup and restore it to a new isolated, access-controlled database with equivalent PostgreSQL major version/extensions. Do not restore over Production or developer `smartspec_test`; do not copy regulated Production data into an unapproved environment. Record backup ID/time, source DB identity (redacted), restore target identity, restore duration/result, migration journal head, row-count/reconciliation checks and operator. Keep files and connection strings out of logs.

For a PostgreSQL custom-format dump, the controlled drill should follow this shape with secret connection strings already injected by the approved secret manager (never shell history or chat):

```bash
set +x
pg_dump --format=custom --no-owner --no-acl --file="$APPROVED_BACKUP_FILE" "$PRODUCTION_DATABASE_URL"
pg_restore --no-owner --no-acl --exit-on-error --dbname="$ISOLATED_RESTORE_DATABASE_URL" "$APPROVED_BACKUP_FILE"
```

Use a newly provisioned empty restore target. Verify it is not the Production database before `pg_restore`. If the hosting provider supplies managed backups instead of `pg_dump`, perform its native restore into an isolated clone and capture the equivalent evidence. Until an actual restore drill succeeds, G2 is not `PRODUCTION_READY`.

### 2.3 Secrets/keyring readiness

- Confirm `AUTH_SESSION_ENCRYPTION_KEYS_JSON` and `AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID` are provisioned in the Production secret manager, independently from `JWT_SECRET`.
- Confirm every Web instance/revision has the same active key ID and full overlapping keyring; compare key IDs and secret version identifiers only, never raw key bytes or hashes derived from secret material.
- Cross-instance decrypt/rotation integration passes locally. Production parity is BLOCKED until each instance's secret version/config revision is checked through an authorized control plane.
- Do not start G2-D deployment with missing keyring. Rotation uses `apps/web/scripts/rotate-ephemeral-auth-session-key.ts`; dry-run first, then guarded apply only after every instance has old+new keys.

### 2.4 Fresh state scans and controlled data-change simulation

Earlier counts 275 and the latest pre-maintenance count 273 active JTIs with zero other-state counts are snapshots only. Never pass them as an import count or skip a final scan.

Before Maintenance, run read-only dry-runs and retain aggregate outputs. During the approved Maintenance, stop all token issue/revoke, login, device authorization, Runner and Worker pairing writers and background processes. Then rerun the Redis audit and JTI/login importer dry-runs. Discard earlier snapshots. Any new JTI/lockout/device/pairing key after the writer fence means the fence is incomplete: identify and stop that writer, then rescan. Do not import while writers are active.

The cutover rehearsal in `smartspec_test` must include a synthetic revocation added after the initial JTI snapshot, and prove the final dry-run sees/imports it; a persistent active login lockout added after the initial counter snapshot and preserved through final import; a device grant and pairing session issued after the initial empty-state scan that keep the drain gate closed until they expire or are explicitly consumed; and a JTI revoked after PG authority switches that remains revoked when simulated Redis-only code is restored. Never create these test records in Production.

Existing local coverage: 12 concurrent login increments/two PG clients, persistent counter import, late JTI rescan, one-time device authorization/replay, pairing cross-instance lookup/key rotation, and JTI fail-closed/mirror ordering. The post-cutover JTI rollback scenario passes a local unit test. These are isolated local tests only; the final Production rescan/import and post-pause state drain remain blocked until Maintenance.

## 3. Controlled G2 maintenance runbook (not authorized/executed)

Enter this sequence only after G2 preflight is `PASS`, Production rights are present, backup restore proof is attached, keyring parity is verified and the Maintenance Window is explicitly confirmed by the system owner.

1. **Preflight:** announce pause; record all Web revisions/instances and auth background processes; verify Production DB target and migration head read-only; check backup/restore evidence; check Redis source and URLs without printing credentials; verify all-instance keyring IDs; capture starting health and caller telemetry.
2. **Maintenance entry / Stop Writers:** block new login/token issue/revoke/device/pairing operations; stop every relevant writer and background consumer; confirm all instances report the maintenance state. Keep non-auth service state as approved. Do not stop Redis globally.
3. **Backup verification:** repeat metadata/restore-ID checks and confirm the verified backup restore point predates migration. If the backup has changed or restore evidence is missing, remain before DDL.
4. **Migration:** with database identity independently verified, run `cd apps/web && npm run db:migrate`. This command is mutating; it must not be run from this environment until the above gates and owner approval are recorded. On any lock/timeout/schema mismatch, stop; confirm transaction/journal rollback before deciding recovery.
5. **Dry-run and Import:** run JTI and login-counter dry-runs after Stop Writers; verify counts/state, no malformed IDs, current active lockouts and expired keys. Import with the guarded commands below only after owner sign-off. Verify every active digest/expiry and lockout was reconciled. Re-scan Redis; do not expect the earlier 275 count.
6. **Drain pending auth state:** wait for active device grants and pairing states to expire/be consumed; run the state audit again and require zero old pending state. Do not silently discard a newly observed active pairing grant.
7. **Deploy:** set the separate keyring and `JTI_REDIS_ROLLBACK_MIRROR=enabled` on all Web instances; deploy/restart all instances while auth remains paused. Keep `CLOUDFLARE_ACTIVATION=disabled` and Redis online for Voice, Pub/Sub and G3–G6.
8. **Smoke/reconciliation:** test JTI allow/deny/expiry across two instances; DB failure is fail-closed; token revoked after PG switch is still visible to Redis rollback code; active login lockout/clear/concurrent increments; device authorize/consume/replay/expiry; Runner/Worker pairing decrypt/rotate across instances. Query caller-level telemetry and reconcile counts while still paused.
9. **Recovery gate:** on any failure, keep Maintenance. Keep PG code and Redis-first mirror active; re-run importer/reconciliation. Redis-only code is allowed only if mirror continuity is proven from the PG cutover point and every active PG revoke reconciles to Redis. Never erase PG revocations or allow a revoked token. If continuity cannot be proven, recover forward with PG-backed code.
10. **Reopen:** only after every smoke/reconciliation passes, disable temporary mirror if rollback window is closed, verify all G2 Redis caller counters are zero, verify flags/secrets/config are in intended state, then reopen auth traffic. Keep Redis for Voice/Pub/Sub/G3–G6.

Guarded import commands (run only inside the approved Maintenance Window):

```bash
cd apps/web
AUTH_WRITERS_PAUSED=1 JTI_REVOCATION_MAINTENANCE_CONFIRMED=1 npx tsx scripts/migrate-jti-revocations.ts --apply
AUTH_WRITERS_PAUSED=1 AUTH_STATE_MAINTENANCE_CONFIRMED=1 npx tsx scripts/migrate-auth-login-failure-counters.ts --apply
AUTH_SESSION_KEY_ROTATION_CONFIRMED=1 npx tsx scripts/rotate-ephemeral-auth-session-key.ts --apply
```

First run both importers without `--apply`. `--apply` bypasses no owner or backup gate; the environment guards are not proof that writers really stopped.

## 4. Remaining Redis callers and held settings

- **G2 old Production callers:** JTI revocation, login-failure counters, Device Authorization and Runner/Worker pairing remain active in the currently deployed Production revision until G2 deploy and caller telemetry prove closure. The current code in this checkout uses PostgreSQL for these responsibilities.
- **Voice / Spec 237/242:** websocket tickets, active voice session ownership and consent-revocation Pub/Sub remain on Redis pending their separate contract/DO decision.
- **G3:** distributed/API-key rate limits, quota/idempotency policy and transactional decisions remain under inventory.
- **G4:** Redis locks, leases and semaphores remain until resource mapping/fencing acceptance passes.
- **G5:** Pub/Sub/realtime producers and subscribers remain.
- **G6:** BullMQ/Celery queues, schedulers and job metadata remain until canonical `worker_jobs` + outbox transports are verified per family.
- Keep `CLOUDFLARE_ACTIVATION=disabled`; do not create Cloudflare job authority or change `worker_jobs`/outbox contracts.
