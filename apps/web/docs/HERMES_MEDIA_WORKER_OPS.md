# Hermes Grok Media Worker — Operations Runbook

Feature 135 (`hermesMedia` / `hermes_media` namespace — unrelated to the
pre-existing agent-gateway Hermes lane documented in
`docs/help/en/hermes-workers.md`). This is the runbook for installing,
pairing, rotating, and operating the shared server-side Hermes worker unit
that generates images/video through a connected xAI Grok account via the
`hermes-agent` CLI.

Documentation only — no scripts are executed as part of authoring this file.

---

## 1. Unit install

The systemd unit ships in-repo at `docker/systemd/smartspec-hermes-worker.service`
(section 07). Installing/enabling it is a **deliberate, manual admin step** —
it is never auto-started by `./run-services.sh` or any other automation.

```bash
sudo cp docker/systemd/smartspec-hermes-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now smartspec-hermes-worker.service
```

Check status:

```bash
./run-services.sh status          # lists "Hermes Worker" under Application Services
systemctl status smartspec-hermes-worker.service
journalctl -u smartspec-hermes-worker.service -f
```

Stop / restart (never `kill`/`screen`/`nohup` — see root `CLAUDE.md`'s
service anti-patterns table):

```bash
sudo systemctl stop smartspec-hermes-worker.service
sudo systemctl restart smartspec-hermes-worker.service
```

## 2. Pairing (`scripts/pair-hermes-worker.ts`)

The shared worker authenticates to the control plane via a token file at
`/etc/smartspec/hermes-worker.env` (root-owned, mode **0600**), created by
the pairing script — **never** by hand-editing or copy-pasting credentials
into the repo, `.env`, or `system_settings`.

```bash
npx tsx scripts/pair-hermes-worker.ts \
  --tenant-id <tenant-id> \
  --base-url http://localhost:3000 \
  --display-name "Shared Hermes Worker"
```

What this does (section 07):

1. Mints a short-lived worker registration token and calls
   `POST /api/workers/register`.
2. Prints the worker id + token set **once** — copy these into
   `/etc/smartspec/hermes-worker.env` as `HERMES_WORKER_ID` and
   `HERMES_WORKER_TOKEN` (the refresh token). Nothing is written to the repo,
   the database, or `system_settings` by the script itself.
3. Writes the paired worker id into the `hermes_shared_worker_id` system
   setting (category `infrastructure`) — this is the **only** way the
   scheduler (`hermesMediaScheduler.ts`) and connect flow
   (`hermesConnectionService.ts`) discover the shared worker; it is never
   inferred from `runtimeType`.
4. Re-runs the local doctor gate (`provisionHermes`) so the capability
   advertised at registration time (`capabilitiesJson.hermesMedia`) reflects
   the actual pinned `hermes-agent` CLI version.

Set `/etc/smartspec/hermes-worker.env` permissions explicitly if they are
ever wrong:

```bash
sudo chmod 0600 /etc/smartspec/hermes-worker.env
sudo chown root:root /etc/smartspec/hermes-worker.env
```

### Rotation

Rotating the worker's long-lived refresh token is: re-run the pairing
script → swap the new credentials into
`/etc/smartspec/hermes-worker.env` → restart the unit. The pairing script
itself never restarts anything.

```bash
npx tsx scripts/pair-hermes-worker.ts --tenant-id <tenant-id> --base-url http://localhost:3000
sudo vi /etc/smartspec/hermes-worker.env   # swap HERMES_WORKER_ID / HERMES_WORKER_TOKEN
sudo systemctl restart smartspec-hermes-worker.service
```

The old token is revoked server-side per the standard worker-token rotation
rule (root CLAUDE.md service-file rule).

## 3. Kill-switch keys (`system_settings`, category `infrastructure`)

All keys are read through `getHermesWorkerSettings()`
(`server/services/hermesWorkerSettings.ts`, 30s TTL cache — call
`clearHermesWorkerSettingsCache()` after writing any of them via the admin
`systemSettings.updateSetting` mutation, which already does this):

| Key | Default | Purpose |
|---|---|---|
| `hermes_worker_enabled` | `false` | Global kill switch — master gate for the whole feature. |
| `hermes_worker_shared_pool_enabled` | `false` | Enables `server_shared` connections. |
| `hermes_worker_server_personal_enabled` | `false` | Enables `server_personal` connections. |
| `hermes_worker_private_enabled` | `false` | Enables `private_worker` connections. |
| `hermes_worker_video_enabled` | `false` | Enables video operations (image-only otherwise). |
| `hermes_shared_pool_fee_credits` | `0` | Platform fee (credits) charged per `server_shared` submit. |
| `hermes_max_running_per_connection` | `1` | Per-connection concurrency cap. |
| `hermes_max_concurrent_per_shared_worker` | `2` | Shared-worker-wide concurrency cap. |
| `hermes_max_queued_per_user` | `8` | Per-user queued-job cap (must stay ≥ 4 — the largest single-call admission batch; enforced at write time). |
| `hermes_max_queued_per_tenant_shared_pool` | `20` | Tenant-wide queued cap for `server_shared` connections. |
| `hermes_submit_window_per_user` | `10` | Sliding-window submissions per 10 minutes, per user. |
| `hermes_submit_window_per_tenant` | `60` | Sliding-window submissions per 10 minutes, per tenant (private workers exempt). |
| `hermes_worker_min_version` | `""` (no floor) | Minimum `hermes-agent` CLI version; below this, the worker is registered/heartbeat-demoted with `capabilitiesJson.hermesMedia.advertised = false` and `reason: "below_minimum_version:<v>"`. |
| `hermes_shared_worker_id` | `null` | The paired shared worker's id — set ONLY by `pair-hermes-worker.ts`. |
| `web_process_hermes_worker_enabled` | `false` | Dev-only in-process worker toggle (env fallback `SMARTSPEC_INLINE_HERMES_WORKER=true`) — never used in production. |

Per-connection `dailyJobQuota` (nullable = unlimited) is set via
`hermesConnections.adminSetQuota` (admin-only), not a system setting.

## 4. Quota counter semantics

The daily per-connection quota is a Redis counter,
`hermes:quota:<connectionId>:<YYYY-MM-DD>` (UTC date, built by
`buildHermesQuotaKey()` in `hermesMediaAdmission.ts` — the **single**
canonical key shape; never invent a second one):

- **Read** by `checkHermesMediaAdmission` at submit time (admission never
  increments it).
- **Incremented** exactly once per completed job by
  `recordHermesUsage()` (`hermesMediaObservability.ts`), called from the
  `/api/worker-jobs/:jobId/artifacts/complete` dispatch (after finalize
  succeeds) and from the section-04/06 terminal-state sweep (lease-expiry
  completions the poll path never observed) — Redis-idempotent
  (`hermes:usage:recorded:<jobId>`, ~7d TTL) so double invocation across
  both call sites writes one increment.
- Failed/canceled/expired jobs never bump the counter — it counts completed
  generations only.
- Expiry: 48h from the last write (comfortably spans a UTC day boundary).

## 5. Audit-log queries (traceId-first, per root CLAUDE.md protocol)

Every hermes lifecycle event is a structured JSONL audit entry
(`logs/audit/audit-YYYY-MM-DD.jsonl`). Event types (section 12):

```
hermes_connection_connect_started
hermes_connection_authorized
hermes_connection_disconnected
hermes_connection_revoked
hermes_connection_entitlement_restricted
hermes_media_job_submitted
hermes_media_admission_rejected
hermes_media_usage_recorded
```

Plus the generic `worker_job_claimed` / `worker_job_completed` /
`worker_job_failed` / `worker_job_canceled` events, enriched with
`metadata.connectionId` + `metadata.traceId` for every `hermes_*` job type
(the enqueue-time traceId, persisted into `instructionsJson.traceId`,
threads through claim/terminal/usage emissions for the same job).

```bash
# Full trace for one job/submission
grep '"traceId":"<traceId>"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# All admission rejections today, by code
grep '"eventType":"hermes_media_admission_rejected"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl \
  | jq '.metadata.code' | sort | uniq -c

# Usage rows for a connection
psql "$DATABASE_URL" -c "
  SELECT \"traceId\", \"modelUsed\", \"creditsCharged\", \"createdAt\"
  FROM provider_usage_log
  JOIN llm_providers ON llm_providers.id = provider_usage_log.\"providerId\"
  WHERE llm_providers.\"providerName\" = 'xai-hermes'
  ORDER BY \"createdAt\" DESC LIMIT 50;
"
```

Audit metadata is **ids only** — never a prompt, a reference URL, a device
code, or more than 4 characters of any token (enforced by
`hermesTokenLeakGuard.test.ts`, section 12).

## 6. Phase-1 go-live flag-flip sequence (ordered checklist)

Rollback at any step = flip the same flags back off. Rollback is
**flags-only by design** — no code deploy needed to disable the feature.

1. **Pair the shared worker** — `pair-hermes-worker.ts` → env file +
   `hermes_shared_worker_id` setting (§2 above).
2. **Start the unit, verify heartbeat online** in the admin fleet panel
   (`/admin/monitoring` → worker fleet → hermes badge shows
   "Hermes media ready" with a version).
3. **Run `scripts/seed-media-models-hermes-grok.ts`** — rows land **disabled**
   (never auto-enabled).
4. **Flip the global kill switch** — `hermes_worker_enabled = true`.
5. **Flip the tenant flag** `hermesMediaWorker` for the pilot tenant only.
6. **Flip scope flag(s)** — `server_personal` first; `shared_pool` only
   after an admin `server_shared` connection already exists.
7. **Enable the two image model rows** (image.generate / image.edit).
8. **Connect one account, run one text-to-image smoke test** on
   https://smartaihub.app.
9. **Video flag + video model row** only at phase 3 — never earlier.

## 7. Web-health-under-load verification (spec §20 criterion)

Owns the acceptance criterion: *"the web service stays healthy under
saturated Hermes load."* Perform this **post-deploy**, not in CI:

Saturate the shared worker (submit jobs until per-worker concurrency +
queue caps are pinned — e.g. scripted submissions from 2 users) for
**≥15 minutes** while watching:

- (a) `smartspec-web.service` p95 latency on an *unrelated* endpoint and its
  journal error rate — must stay within the pre-test baseline **±10%**.
- (b) `systemctl show smartspec-hermes-worker -p MemoryCurrent` stays under
  the unit's `MemoryHigh` (1024M).
- (c) Zero D-state ffmpeg/hermes processes (`ps aux | awk '$8 ~ /D/'`); load
  average stays sane.

Record pass/fail in this file (append a dated entry below). Owner: the
deploying admin.

## 8. Phase 1–3 → phase 4 gate (Worker App)

Phase-4 (Worker App) work starts **only after all of**:

- The shared worker has run **≥7 days** in production.
- **≥50 completed** hermes jobs across **≥3 connections**.
- Connections cover **both** server scopes (`server_shared` AND
  `server_personal`).
- **Zero unresolved HIGH-severity incidents**.
- The load verification (§7 above) passed.

Sign-off: product owner records date + metrics below.

---

## Verification log (append-only)

| Date | Verifier | Result | Notes |
|---|---|---|---|
| _(none yet)_ | | | |
