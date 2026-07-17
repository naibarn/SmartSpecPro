# Hermes Grok Media Worker — Operations Runbook

Feature 135 (`hermesMedia` / `hermes_media` namespace — unrelated to the
pre-existing agent-gateway Hermes lane documented in
`docs/help/en/hermes-workers.md`). This is the runbook for installing,
pairing, rotating, and operating the shared server-side Hermes worker unit
that generates images/video through a connected xAI Grok account via the
`hermes-agent` CLI.

Documentation only — no scripts are executed as part of authoring this file.

---

## 1. Install the pinned `hermes-agent` CLI (do this BEFORE §2)

The systemd unit does **not** install the Hermes CLI. `provisionHermes()`
(`server/hermesWorker/hermesInstallation.ts`) only *verifies* an
already-installed binary — it runs `hermes --version`, the profile-isolation
probe, and the flag-composition probe (no `uv`/`pip` call anywhere in that
file). `main.ts` reads `HERMES_BINARY_PATH` and **defaults to the bare
string `"hermes"`**, i.e. it expects the binary to already be on `PATH`
(`server/hermesWorker/main.ts:22,88`). The unit's own `PATH=` environment
line (`docker/systemd/smartspec-hermes-worker.service:19`) does **not**
include any Python/venv `bin` directory, so an operator MUST install the CLI
and point `HERMES_BINARY_PATH` at it before the unit can pass its doctor
gate — this step is missing without it.

### 1.1 The pin

- Package: `hermes-agent==0.18.2` — this is the same version
  `HERMES_EXPECTED_VERSION` checks by default (`server/hermesWorker/main.ts:23,89`)
  and that `provisionHermes`'s `doctorOk` check requires the reported
  version to contain (`server/hermesWorker/hermesInstallation.ts:210-211`).
  It is also the version pinned in the section-07 spec's filesystem layout
  (`specs/feature/135-hermes-grok-media-worker/sections/section-07-shared-worker.md`
  §2.4: `hermes/ # pinned installation (uv venv, hermes-agent==0.18.2)`) and
  in the research doc (`specs/feature/135-hermes-grok-media-worker/claude-research.md`
  §B1/§B7).
- Python: `>=3.11,<3.14` (claude-research.md §B1).
- **Never run `hermes update`** and never track "latest" on this host.
  `hermes-agent` is 0.x with **no semver stability guarantee** and has
  shipped same-day patches (claude-research.md §B1) — an unpinned upgrade
  can silently change CLI flags/output shape that `hermesInstallation.ts`'s
  probes and `hermesInvocation.ts`'s parsers depend on.

### 1.2 Install into an isolated `uv` venv (project convention)

Install as the unit's own user (`User=dev` per
`docker/systemd/smartspec-hermes-worker.service:14`), under the same root
the spec's filesystem layout uses
(`/var/lib/smartspec-hermes-worker/`, sibling to the `profiles/` and `jobs/`
directories that `HERMES_HOME_ROOT`/`HERMES_WORKSPACE_ROOT` already default
to — §2.2 below):

```bash
sudo mkdir -p /var/lib/smartspec-hermes-worker/hermes
sudo chown dev:dev /var/lib/smartspec-hermes-worker/hermes
sudo -u dev uv venv --python 3.11 /var/lib/smartspec-hermes-worker/hermes
sudo -u dev uv pip install --python /var/lib/smartspec-hermes-worker/hermes/bin/python \
  "hermes-agent==0.18.2"
```

This produces `hermes` at
`/var/lib/smartspec-hermes-worker/hermes/bin/hermes`. Point the unit at it
via the *same* `EnvironmentFile=/etc/smartspec/hermes-worker.env` that
already carries `HERMES_WORKER_ID`/`HERMES_WORKER_TOKEN` (§3 below) —
**do not** rely on the unit's PATH:

```bash
# Append to /etc/smartspec/hermes-worker.env (root-owned, mode 0600)
HERMES_BINARY_PATH=/var/lib/smartspec-hermes-worker/hermes/bin/hermes
```

### 1.3 Verify

```bash
sudo -u dev /var/lib/smartspec-hermes-worker/hermes/bin/hermes --version
# must print a string containing 0.18.2
```

Only after this prints the pinned version does the doctor gate in
`provisionHermes` pass (`doctorOk`), which is the **only** condition under
which registration advertises `capabilitiesJson.hermesMedia` — see
`hermesInstallation.ts:192-197`'s doc comment ("registration advertises
`hermesMedia` capability only when this doctor pass succeeds").

**If you skip this step:** the unit still starts (it does not crash on a
missing binary at boot — the doctor probe just fails at first invocation),
but `doctorOk` stays `false`, `capabilitiesJson.hermesMedia.advertised`
stays `false`, and the control plane's admission/scheduler logic will never
hand this worker a `hermes_media_*` job (fail-closed by design, not a bug —
`hermesMediaScheduler.ts` and `checkHermesMediaAdmission` only route to
workers that advertised the capability). If jobs never dispatch after
pairing, this is the first thing to check — re-run §1.3's verify command
and re-pair (§3) if it was skipped or the binary moved.

### 1.4 Re-verify after any manual CLI change

Because `capabilitiesJson.hermesMedia` is only ever set at `register()` time
(a privileged, DB-backed action `main.ts` itself cannot perform — it has no
`db` import, see `main.ts:133-141`'s doc comment), re-run
`scripts/pair-hermes-worker.ts` (§3) any time you change
`HERMES_BINARY_PATH` or upgrade the pinned CLI, so the advertised capability
reflects the new binary's doctor result.

## 2. Unit install

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

### 2.1 Prerequisite

Complete §1 (install + verify the pinned `hermes-agent` CLI, and set
`HERMES_BINARY_PATH` in `/etc/smartspec/hermes-worker.env`) **before**
enabling this unit. `ExecStart` runs `server/hermesWorker/main.ts` directly
(`docker/systemd/smartspec-hermes-worker.service:28`), which calls
`provisionHermes` on every startup — with no CLI installed, the unit will
start (`Type=simple`, no pre-flight check) but stay perpetually
capability-degraded (§1.3).

### 2.2 Environment variables the unit reads

Every variable below is read in `server/hermesWorker/main.ts` (doc block at
lines 15-27, resolved at lines 83-95). All except the two "required" rows
have a hard-coded default and are safe to omit:

| Variable | Required? | Default | `main.ts` line |
|---|---|---|---|
| `HERMES_WORKER_TOKEN` | **Required** | none (throws at startup if unset) | L85 |
| `HERMES_WORKER_ID` | **Required** | none (throws at startup if unset) | L84 |
| `HERMES_WORKER_BASE_URL` | Optional | `http://localhost:3000` | L83 |
| `HERMES_HOME_ROOT` | Optional | `/var/lib/smartspec-hermes-worker/profiles` | L86 |
| `HERMES_WORKSPACE_ROOT` | Optional | `/var/lib/smartspec-hermes-worker/jobs` | L87 |
| `HERMES_BINARY_PATH` | Optional* | `"hermes"` (bare — must be on `PATH` if unset) | L88 |
| `HERMES_EXPECTED_VERSION` | Optional | `"0.18.2"` (doctor-gate version substring match) | L89 |
| `HERMES_MAX_CONCURRENT_JOBS` | Optional | `2` (global concurrent-job cap for this worker process) | L90 |
| `HERMES_ENABLE_FILE_TOOLSET` | Optional | off (must be the literal string `"true"` to enable) | L91 |
| `HERMES_MIN_FREE_DISK_BYTES` | Optional | `2 * 1024 * 1024 * 1024` (2 GiB — below this, the worker refuses new claims) | L92-95 |

\* `HERMES_BINARY_PATH` is optional *to the code* (it has a fallback), but
per §1 it is effectively required in any real deployment — the bare
`"hermes"` fallback only works if the CLI happens to already be on the
unit's `PATH`, which the shipped unit file does not provision.

`HERMES_WORKER_BASE_URL` is the control-plane base URL this specific worker
process calls at runtime — do not confuse it with `pair-hermes-worker.ts`'s
own `--base-url` flag (§3 below), which is a separate one-time argument to
the pairing script, not an env var the running worker reads.

## 3. Pairing (`scripts/pair-hermes-worker.ts`)

The shared worker authenticates to the control plane via a token file at
`/etc/smartspec/hermes-worker.env` (root-owned, mode **0600**), created by
the pairing script — **never** by hand-editing or copy-pasting credentials
into the repo, `.env`, or `system_settings`. (Per §1.2, this is also where
`HERMES_BINARY_PATH` should live once installed — the file accumulates both
the pairing script's output and the CLI install's path.)

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
   the actual pinned `hermes-agent` CLI version — this only produces a
   *true* result if §1 was completed first.

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

## 4. Kill-switch keys (`system_settings`, category `infrastructure`)

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

## 5. Quota counter semantics

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

## 6. Audit-log queries (traceId-first, per root CLAUDE.md protocol)

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

## 7. Phase-1 go-live flag-flip sequence (ordered checklist)

Rollback at any step = flip the same flags back off. Rollback is
**flags-only by design** — no code deploy needed to disable the feature.

Flip the flags from the admin UI, not raw SQL, whenever the UI path exists
(see box below) — for `web_process_hermes_worker_enabled` and every
`hermes_*` limit key this is **required**, not just preferred, because the
`systemSettings.updateSetting` mutation (`server/routers/systemSettings.ts`)
does three things a raw `UPDATE system_settings ...` bypasses entirely:

1. Clears the 30s `getHermesWorkerSettings()` TTL cache
   (`clearHermesWorkerSettingsCache()`, `systemSettings.ts:781-783,905-907`)
   — without this, a raw SQL write can silently not take effect for up to
   30 seconds, or (worse) look like it didn't take at all if you check
   too quickly.
2. Starts/stops the dev-only in-web Hermes drainer when
   `web_process_hermes_worker_enabled` flips (`systemSettings.ts:789-799,914-919`)
   — raw SQL never touches this side effect.
3. Runs `validateHermesLimitCoherence` before accepting a new
   `hermes_max_queued_per_user` value, rejecting one that would drop the
   cap below the largest single-call admission batch size
   (`systemSettings.ts:804-832`) — raw SQL has no such guard and can write
   an incoherent, self-deadlocking limit configuration straight to the
   table.

> **Where to flip them:** the tenant flag `hermesMediaWorker` (step 5 below)
> is intended to be flipped from the **Tenant Feature Flags** admin panel
> (`TenantFeatureFlagsPanel.tsx`, flag groups defined in
> `client/src/components/admin/tenantFeatureFlagGroups.ts`), and the
> `hermes_*` / `web_process_hermes_worker_enabled` `system_settings` keys
> from the **Infrastructure Settings** admin panel
> (`InfrastructureSettingsPanel.tsx`), next to its existing render-worker
> toggle. **As of this writing, `hermesMediaWorker` is registered in
> `shared/featureFlags.ts` and enforced everywhere it's checked
> (`hermesMediaScheduler.ts`, `mediaTransportResolver.ts`,
> `hermesConnectionService.ts`) but is not yet listed in
> `tenantFeatureFlagGroups.ts`'s flag groups, and `InfrastructureSettingsPanel.tsx`
> has no Hermes section yet (only the render-worker toggle it will sit
> beside).** Until those UI additions land, use the SQL fallback below —
> but treat it as temporary, and re-flip through the admin UI once it ships
> so the cache/drainer/coherence side effects above are exercised at least
> once for the values you're carrying forward.

```sql
-- SQL fallback ONLY, current until the admin UI panels above ship.
-- After any of these, an admin must still trigger a cache-clearing UI
-- action (e.g. open the relevant admin panel and re-save) or wait out the
-- 30s TTL — raw SQL alone does not invalidate the cache.
UPDATE system_settings SET value = 'true'
  WHERE category = 'infrastructure' AND key = 'hermes_worker_enabled';
```

1. **Pair the shared worker** — `pair-hermes-worker.ts` → env file +
   `hermes_shared_worker_id` setting (§3 above).
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

## 8. Web-health-under-load verification (spec §20 criterion)

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

## 9. Phase 1–3 → phase 4 gate (Worker App)

Phase-4 (Worker App) work starts **only after all of**:

- The shared worker has run **≥7 days** in production.
- **≥50 completed** hermes jobs across **≥3 connections**.
- Connections cover **both** server scopes (`server_shared` AND
  `server_personal`).
- **Zero unresolved HIGH-severity incidents**.
- The load verification (§8 above) passed.

Sign-off: product owner records date + metrics below.

## 10. Worker App runtime pack — build & serve (phase-4 prerequisite)

Gated behind §9's criteria — do not start this until the phase-4 gate is
signed off. Even after the gate passes, this is a **separate, additional**
manual step: nothing builds or publishes the Worker App's Hermes runtime
pack automatically, and without it the Worker App's "Install / update
Hermes runtime" button 404s on download and no private worker can ever run.

### 10.1 What the build script produces

`scripts/build-hermes-runtime-pack.ts` (section 11) assembles a per-OS
archive containing a `uv`-managed Python 3.11 runtime with the same pinned
`hermes-agent==0.18.2` installed, then computes its sha256 and writes a
`<archive>.manifest.json` sidecar next to it:

```bash
npx tsx scripts/build-hermes-runtime-pack.ts --os windows --version <x.y.z> \
  --output-dir client/public/releases/runtime
```

- `--os` is one of `windows` | `macos` (`HERMES_RUNTIME_IDS` in the script:
  `hermes-windows-x64` / `hermes-macos-arm64`).
- `--version` is the *pack's own* build version — independent of the pinned
  `hermes-agent` version, which stays `0.18.2` inside every pack
  (`HERMES_PINNED_VERSION`/`HERMES_AGENT_PIP_SPEC` in
  `scripts/build-hermes-runtime-pack.ts:37-38`).
- Output archive name:
  `smart-ai-hub-hermes-runtime-<runtimeId>-<version>.zip` (script line 190),
  with a same-named `.manifest.json` sidecar.
- The archive-assembly step itself (shelling out to `uv`, downloading
  Python, pip-installing, zipping) is **not** exercised by the test suite —
  it needs real network/tooling access and is documented in the script's
  own header as an operator-run, manual-verification step. Only the pure
  manifest-entry builder function is unit-tested.

### 10.2 Where the pack must be placed for the manifest endpoint to find it

`GET /api/workers/runtime-pack/manifest?runtimeId=hermes-windows-x64` (and
the `hermes-macos-arm64` id) is served by
`server/routes/workerRuntime.ts`'s `findLatestHermesRuntimePack` /
`defaultHermesManifestEntry`, which scans the release directories returned
by `getRuntimePackReleaseDirs()` — by default `client/public/releases/runtime`
(dev/build source), `dist/public/releases/runtime` (deployed build output),
or `public/releases/runtime`, plus any directory listed in the
`SMARTAIHUB_RUNTIME_RELEASES_DIR` env var (`workerRuntime.ts:355-375`). The
pack `.zip` and its `.manifest.json` sidecar must both be dropped into
whichever of those directories is actually served in the current
deployment (`dist/public/releases/runtime` for a production `pnpm build`
output, matching the same `output-dir` you pass to the build script above).

If no pack matching a given `runtimeId` is found there, the endpoint returns
a synthesized `defaultHermesManifestEntry(runtimeId)` — a valid-shaped but
`allowed: false` manifest with `denyReason: "<runtimeId> runtime pack has
not been published yet"` (`workerRuntime.ts:616-632`) — so the Worker App
sees a clean "not available yet" rather than a broken response, but the
install button still cannot succeed until a real pack is placed there.

### 10.3 The sha256 / `manifest.allowed` gate

- The manifest endpoint only serves an archive's real `archiveSha256` /
  `archiveSizeBytes` / a working `archiveUrl` when the sidecar manifest's
  `allowed` field is `true` (`workerRuntime.ts:787-809`); if `allowed` is
  `false` or the manifest is missing, the endpoint reports `allowed: false`
  regardless of what's on disk.
- The matching download route
  (`GET /api/workers/runtime-pack/download/:fileName`) enforces the same
  gate independently — it 409s with `runtime_pack_not_allowed` if the
  sidecar manifest isn't `allowed: true`, even if the file exists on disk
  (`workerRuntime.ts:876-880`).
- `buildHermesRuntimeManifestEntry` defaults `allowed` to `true` for
  `windows` and `false` for `macos` (`scripts/build-hermes-runtime-pack.ts:109`) —
  this is the code-level expression of "Windows ships first."

### 10.4 Windows ships first; macOS is registered but not buildable yet

The `hermes-macos-arm64` runtime id is already resolvable via the manifest
endpoint (`HERMES_RUNTIME_PACK_IDS` includes it,
`server/routes/workerRuntime.ts:108`) and will return a `defaultHermesManifestEntry`
with `allowed: false` until an actual macOS pack is built and placed per
§10.2 with `allowed: true` in its sidecar manifest. Do not manually flip
`allowed: true` on a macOS manifest for a pack you have not actually built
and verified end-to-end (installs, runs `hermes --version`, matches the
pin) — this is the same fail-closed pattern §1.3 relies on for the shared
worker.

---

## Verification log (append-only)

| Date | Verifier | Result | Notes |
|---|---|---|---|
| _(none yet)_ | | | |
