# Spec 245 — G1 Evidence & G2 Production Readiness Runbook

**Runbook state (2026-09-26): `G1=BLOCKED`, `G2=BLOCKED — AUTH HTTP MAINTENANCE ACTIVE; REVOCATIONS UNRECONCILED`.** Web and Python Backend systemd services plus the Web watchdog were stopped to fail closed while revocation safety is unproven. Direct ports 3000/8000 have no listeners; Nginx API probes return 502. No DDL, revocation import, caller switch, or Redis-wide shutdown was performed. Do not restart Web/Backend or enable the watchdog until the reconciliation and recovery gates below pass. Existing Worker/KV resources are reused; do not create another namespace or binding.

> **Urgent read-only recheck (2026-09-26 13:26 UTC):** Production PostgreSQL has migrations 0345–0349 and all four G2 tables. Redis has 272 active JTI revocations while PostgreSQL has 1 active row; all 272 Redis digests are absent from PostgreSQL and the PostgreSQL digest is absent from Redis. The inspected Web process has no `JTI_REDIS_ROLLBACK_MIRROR` or encryption keyring variables. The process started after current HEAD and runs from the repository checkout, but its release SHA is not exposed. This may be an active authorization gap because current code reads PostgreSQL only by default. Do not roll back to Redis-only code. No Production writes were made in this turn. Freeze G2 changes, verify every serving instance, restore-test an approved backup, then reconcile both stores during an approved Maintenance Window.

> **Emergency action (2026-09-26 14:35 UTC):** The active Web (`smartspec-web.service`), Python Backend (`smartspec-backend.service`) and Web watchdog were stopped after confirming the watchdog could restart Web. Both direct service ports then had no listener; localhost Nginx `/trpc/...` and `/api/...` probes returned 502. This closes HTTP paths on this inspected host, but does not prove every external replica/Cloudflare origin has been fenced. A fresh read-only digest comparison at `2026-09-26T14:35:50Z` found 270 active Redis-only JTI revocations and 1 PostgreSQL-only JTI revocation (0 overlap). No backup artifact or isolated restore evidence was found in the inspected backup paths, so no import was attempted. Keep HTTP Maintenance active; do not start either service or watchdog. Redis and PostgreSQL remain running for non-G2 groups and reconciliation preparation.

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
| G2 migration source/schema review | PASS; Production migrations applied | Latest read-only preflight found 310 journal rows through 0349 with exact local hash match, all four G2 tables present and zero lock waiters. Do not rerun DDL. |
| Production backup restore | BLOCKED | No backup artifact/restore destination or restore drill evidence is available. Production DDL and import remain prohibited until an approved isolated restore drill passes. |
| JTI importer/state-change race | PASS local synthetic rescan; Production reconciliation FAIL | Current read-only comparison found 272 active Redis digests missing from PostgreSQL and one active PostgreSQL digest missing from Redis. Import Redis-only JTIs into PostgreSQL after writer fencing. Keep the PostgreSQL-only digest in PostgreSQL; its raw JTI cannot be recovered from SHA-256. |
| Active login lockout preservation | PASS locally; Production recheck BLOCKED | PostgreSQL integration covers 12 concurrent failures and a persistent lockout introduced after a modeled empty preparation snapshot. Latest old-Redis snapshot had zero; re-audit only after writers stop. |
| Pending Device Authorization / Runner/Worker Pairing | PASS local synthetic integration; Production recheck BLOCKED | Local integration creates a pending device grant after a modeled empty preparation scan, proves one-time consumption, and creates/rotates a paired session across instances. Prior/latest Redis snapshot had zero; pause issuance and re-scan after writers stop. |
| Pairing key separation and cross-instance compatibility | PASS locally; Production keyring BLOCKED | Inspected Web environment lacks both keyring variables. Code requires a JSON object of IDs matching `[A-Za-z0-9_-]{1,32}` mapped to canonical Base64 keys decoding to exactly 32 bytes; active ID must exist in the map. Secret Manager and all-instance parity remain unverified. Never send key material in chat or logs. |
| Rollback after a new post-cutover revocation | PASS local forward-bridge contract; Redis-only rollback FAIL/unsafe | Local test covers future revocations only when Redis-first mirroring is enabled from the PG switch. Production has one PG-only digest and no mirror flag; raw JTI cannot be reversed from that digest, so never use Redis-only recovery for this state. Recover forward on PostgreSQL. |
| Web TypeScript baseline comparison | FAIL typecheck; no G1/G2 diagnostic | Clean baseline 7e9d8beb0 and clean HEAD d7214f968 each have 633 diagnostics. Seven old/new locations differ in jobControlPlane, Spec 224 and Spec 226 after intervening commits; no diagnostics are in G1/G2 files. The unchanged `AdminMonitoring.tsx:959` still has unresolved `ClipboardList` (TS2552 in stored baseline log, TS2304 in both current clean and prior HEAD logs). The code variation cause is not proven; the symbol is unresolved in all runs, so no release exception is approved. Dirty workspace reports 634 with new workflow edits. Full typecheck remains failed. |
| G2 Production Ready | BLOCKED — partial state mismatch | In addition to backup restore, keyring, maintenance and caller telemetry blockers, 272 Redis revocations are missing from PostgreSQL and one PostgreSQL revocation is missing from Redis. Redis-only rollback is unsafe. |

## 1. G1 Production execution

### 1.1 Controlled release, flags remain off

1. The release operator first obtains read-only Cloudflare deployment access and records the current Worker version/route/binding. Do not create a KV namespace or binding; use the existing `SEARCH_RESULT_CACHE` binding.
2. Review `git show --stat 7e9d8beb0` and the focused diff in `apps/cloudflare/src/index.ts`, `apps/cloudflare/src/contracts.ts`, `apps/web/server/services/cloudflareSearchResultCache.ts`, and `apps/web/server/_core/responsesRoutes.ts`.
3. Deploy Worker and Web code with `CLOUDFLARE_SEARCH_CACHE_FAULT_TEST_ENABLED` absent or `false`. This is a code release only; the fault path must remain inert.
4. Verify Worker `/healthz`, authenticated cache readiness, Web `/healthz`, provider selection and a synthetic put/get/TTL probe. Do not enable fault injection or alter `CLOUDFLARE_ACTIVATION`.
5. Record Worker version, Web revision/commit, deployment timestamp and health output. If any normal probe fails, stop and use the G1 cache-bypass recovery in `direct-cutover-plan.md`.

Latest check: Worker and Web `/healthz` return 200, but Wrangler deployment listing is blocked because `CLOUDFLARE_API_TOKEN` is unset. `smartspec-web.service` started at 20:06:32 +07 after HEAD `d7214f968` (19:46:25 +07); the exact loaded SHA is not exposed. Its environment lacks the Web fault flag, JTI rollback mirror and pairing keyring. Worker fault-flag state is unknown. No Beta/Admin storage states are available. A Web-only G1 release from this checkout is unsafe because G2 callers in the same Web source use PostgreSQL unconditionally and have no independent activation switch.

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

Run `ops/feature-232/g2-production-preflight.sql` using a read-only Production database role. The script begins `READ ONLY` and rolls back. Latest read-only result: migration index 333/tag 0349, 310 rows, latest hash matches local 0349, all four G2 tables present, `users.id` integer and no lock waiters. The previous 0344/absent-table expectation is superseded. Do not run a test migration or create a scratch schema in Production.

Local migration review: 0345 creates JTI digest/expiry table; 0346 creates one-time device authorization with FK to `users.id`; 0347 creates login counters with TTL; 0348 creates hashed lookup indexes and encrypted paired auth state; 0349 permits a null expiry for a persistent legacy lockout. Each transaction uses local 5-second lock and 60-second statement limits. Local disposable schema transaction was rolled back; this does not replace target revalidation.

### 2.2 Backup/restore evidence

The backup owner must create/identify an approved encrypted Production backup and restore it to a new isolated, access-controlled database with equivalent PostgreSQL major version/extensions. Do not restore over Production or developer `smartspec_test`; do not copy regulated Production data into an unapproved environment. Record backup ID/time, source DB identity (redacted), restore target identity, restore duration/result, migration journal head, row-count/reconciliation checks and operator. Keep files and connection strings out of logs.

For a PostgreSQL custom-format dump, the controlled drill should follow this shape with secret connection strings already injected by the approved secret manager (never shell history or chat):

```bash
set +x
pg_dump --format=custom --no-owner --no-acl --file="$APPROVED_BACKUP_FILE" "$PRODUCTION_DATABASE_URL"
pg_restore --no-owner --no-acl --exit-on-error --dbname="$ISOLATED_RESTORE_DATABASE_URL" "$APPROVED_BACKUP_FILE"
```

Use a newly provisioned empty restore target. Verify it is not the Production database before `pg_restore`. If the hosting provider supplies managed backups instead of `pg_dump`, perform its native restore into an isolated clone and capture the equivalent evidence. Latest host search found no backup artifact in the inspected backup/ops directories. Until an identified Production backup is restored into an isolated database and validated, G2 is not `PRODUCTION_READY`.

### 2.3 Secrets/keyring readiness

- Confirm `AUTH_SESSION_ENCRYPTION_KEYS_JSON` and `AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID` are provisioned in the Production secret manager, independently from `JWT_SECRET`.
- Code format is `AUTH_SESSION_ENCRYPTION_KEYS_JSON={"id":"<canonical-base64-32-byte-key>"}` with key IDs matching `[A-Za-z0-9_-]{1,32}` and `AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID` present in the map. Generate directly in Secret Manager. Confirm every Web instance/revision has the same active key ID and full overlapping keyring; compare key IDs and secret version identifiers only, never raw key bytes or hashes derived from secret material.
- Cross-instance decrypt/rotation integration passes locally. Production parity is BLOCKED until each instance's secret version/config revision is checked through an authorized control plane.
- Do not start G2-D deployment with missing keyring. Rotation uses `apps/web/scripts/rotate-ephemeral-auth-session-key.ts`; dry-run first, then guarded apply only after every instance has old+new keys.

### 2.4 Fresh state scans and controlled data-change simulation

The latest pre-maintenance snapshot at 13:47 UTC was 272 active Redis JTIs versus 1 active PostgreSQL row; a digest-only comparison found 272 Redis-only and 1 PostgreSQL-only. Earlier counts 275 and 273 are stale. None of these snapshots is a maintenance-fenced import count.

Before Maintenance, run read-only dry-runs and retain aggregate outputs. During the approved Maintenance, stop all token issue/revoke, login, device authorization, Runner and Worker pairing writers and background processes. Then rerun the Redis audit and JTI/login importer dry-runs. Discard earlier snapshots. Any new JTI/lockout/device/pairing key after the writer fence means the fence is incomplete: identify and stop that writer, then rescan. Do not import while writers are active.

The cutover rehearsal in `smartspec_test` must include a synthetic revocation added after the initial JTI snapshot and prove the final dry-run sees/imports it; a persistent active login lockout added after the initial counter snapshot and preserved through final import; a device grant and pairing session issued after the initial empty-state scan that keep the drain gate closed until they expire or are explicitly consumed; and a JTI revoked after PG authority switches that remains revoked when the Redis-first bridge was enabled before that revoke. This verifies future bridge continuity only; it does not permit Redis-only rollback while any PG-only revocation exists. Never create these test records in Production.

Existing local coverage: 12 concurrent login increments/two PG clients, persistent counter import, late JTI rescan, one-time device authorization/replay, pairing cross-instance lookup/key rotation, and JTI fail-closed/mirror ordering. The post-cutover JTI rollback scenario passes a local unit test. These are isolated local tests only; the final Production rescan/import and post-pause state drain remain blocked until Maintenance.

## 3. Controlled G2 maintenance runbook (not authorized/executed)

Enter this sequence only after G2 preflight is `PASS`, Production rights are present, backup restore proof is attached, keyring parity is verified and the Maintenance Window is explicitly confirmed by the system owner.

1. **Preflight:** announce pause; record all Web revisions/instances and auth background processes (host scan saw one `smartspec-web.service`, plus active Node worker, Python backend, Celery and Hermes services; this does not prove there are no other Web replicas behind the load balancer); verify Production DB target and migration head read-only; check backup/restore evidence; check Redis source and URLs without printing credentials; verify all-instance keyring IDs; capture starting health and caller telemetry.
2. **Maintenance entry / Stop Writers:** block new login/token issue/revoke/device/pairing operations; stop every relevant writer and background consumer; confirm all instances report the maintenance state. Keep non-auth service state as approved. Do not stop Redis globally.
3. **Backup verification:** restore a Production backup into an isolated database and verify it includes the currently applied 0349 schema and a consistent data snapshot before revocation reconciliation. The backup need not predate 0345–0349 because those migrations are already applied. If restore evidence is missing, remain in Maintenance and do not reconcile data.
4. **Migration:** current read-only evidence shows 0345–0349 are already applied and hash-matched. Do not rerun DDL. Verify no pending migration on the approved target and record who applied these migrations and when.
5. **Dry-run and Reconcile:** after Stop Writers, capture fresh Redis/PostgreSQL snapshots. Import every active Redis revocation into PostgreSQL; the current snapshot found 272 missing rows. Keep any PostgreSQL-only revocation in PostgreSQL. A JTI digest cannot be reversed into the raw Redis key, so Redis-only rollback is permanently unsafe unless the original JTI is recovered from an independently trusted source. Use guarded commands only after backup, Maintenance and owner gates pass. Require zero Redis-only digests in a second stable scan.
6. **Drain pending auth state:** wait for active device grants and pairing states to expire/be consumed; run the state audit again and require zero old pending state. Do not silently discard a newly observed active pairing grant.
7. **Deploy:** set the separate keyring and `JTI_REDIS_ROLLBACK_MIRROR=enabled` on every Web instance before reopening auth. This protects future PostgreSQL revocations in an explicitly tested compatibility path, but does not make Redis-only code a safe rollback because the existing PostgreSQL-only digest has no raw JTI. Keep PostgreSQL-backed authorization as the recovery direction. Keep `CLOUDFLARE_ACTIVATION=disabled` and Redis online for Voice, Pub/Sub and G3–G6.
8. **Smoke/reconciliation:** test JTI allow/deny/expiry across two instances; DB failure is fail-closed; prove the Redis-first bridge mirrors a new revoke before PostgreSQL acknowledges it; active login lockout/clear/concurrent increments; device authorize/consume/replay/expiry; Runner/Worker pairing decrypt/rotate across instances. Keep PostgreSQL-backed recovery and query caller-level telemetry while still paused.
9. **Recovery gate:** on any failure, keep Maintenance. Keep PostgreSQL-backed code and the Redis-first mirror; re-run the Redis-to-PostgreSQL importer and reconciliation. Do not restore Redis-only authorization: PostgreSQL stores only a one-way digest, and the current PostgreSQL-only revocation cannot be recreated as a Redis key from that digest. Recover forward using PostgreSQL. Never erase revocations from either store or allow a revoked token.
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
