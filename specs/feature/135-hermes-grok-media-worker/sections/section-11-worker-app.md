# Section 11 — Worker App Hermes Runtime Module (private worker, Rust + React)

**Section id:** `section-11-worker-app`
**Plan reference:** `claude-plan.md` §14 (contract inputs from §3, §6, §7 claim gating, §9 reference URLs); `claude-plan-tdd.md` §14; `spec.md` §15, §16, §18
**Depends on:** section-04 (control-job handler state machines, stdout-parser test vectors, fake `hermes` CLI fixture, `hermes_device_code` event contract), section-05 (claim gating: required claim capability `hermes_media`, connection-affinity assertion, `capabilityRequirementsJson` shape), section-06 (claim-time `referenceUrls` enrichment + `POST /api/worker-jobs/:jobId/references/urls` refresh endpoint, server-side finalize)
**Blocks:** nothing (section-12 covers observability/docs)
**Parallelizable with:** section-10
**Test commands:** `cargo test` from `apps/worker-app/src-tauri` (Rust, in-file `#[cfg(test)]`), `pnpm --dir apps/web test` (server-side min-version enforcement + build-script tests)

---

## 1. Objective

Give the existing Tauri **Smart AI Hub Worker App** (`apps/worker-app`, today render-only) a Hermes runtime module so a user's own machine can execute `hermes_media_*` and `hermes_connection_*` jobs for their `private_worker`-scoped Grok connections. The Grok OAuth token never leaves the user's machine; only the owner's jobs are routed there. Windows ships first; the macOS runtime pack follows in the same feature (same code paths, second pack build).

Five deliverables:

1. **Rust runtime module** — `hermes_executor.rs` (job-type consts, execution plan, envelope/argv build, output collection, per-connection profile management) + dispatch arm in `worker_executor.rs` + claim-hint/slot changes in `worker_loop.rs` + registration advertisement in `control_plane.rs`.
2. **Runtime pack provisioning** — new runtime ids `hermes-windows-x64` / `hermes-macos-arm64` served by the existing runtime-manifest endpoint; `worker_app_install_hermes_runtime` Tauri command mirroring `worker_app_install_runtime_pack`; a Hermes doctor.
3. **Pack build script** — `apps/web/scripts/build-hermes-runtime-pack.ts` (packs do not build themselves).
4. **Server-side minimum-version enforcement** — registration/heartbeat processing in `workerRegistryService.ts` forces `hermesMedia.advertised = false` when the advertised Hermes version is below the `hermes_worker_min_version` setting; applies equally to the shared unit (section-07) and Worker Apps.
5. **React UI** — hermes connection status, active-job stage, device-code display during an auth control job, re-auth prompt, "update required" state, diagnostics export with tokens redacted.

---

## 2. Background context (read once, then implement)

### 2.1 Existing Worker App module map (research A5 — the pattern to copy)

| Module | Role / insertion point |
|---|---|
| `apps/worker-app/src-tauri/src/worker_executor.rs` | `HYPERFRAMES_JOB_TYPE` const (L9), `ClaimedWorkerJob` struct, `prepare_hyperframes_execution_plan` + runtime-ready guard, progress-stage consts, `validate_workspace_path` — add the hermes dispatch arm here, delegate to the new module |
| `apps/worker-app/src-tauri/src/worker_loop.rs` (~1970 ln) | poll loop: heartbeat → claim (`capability_hints` at ~L413) → execute with active-heartbeat → upload; extend hints + slot accounting |
| `apps/worker-app/src-tauri/src/worker_control_plane.rs` | HTTP client: `WorkerClaimRequest { maxJobs, capabilityHints }` (L76), 3-step artifact upload with 401-token-refresh retry — reuse unchanged for hermes artifacts; add the reference-URL refresh call |
| `apps/worker-app/src-tauri/src/control_plane.rs` | registration payload builder; `WORKER_RUNTIME_TYPE = "desktop_zeroclaw_managed"` (L11) — the Worker App keeps this type; hermes-ness is expressed only via jobType + claim capability |
| `apps/worker-app/src-tauri/src/runtime_manifest.rs` | `RuntimePackManifest`, `DoctorSummary { status: "ready"\|"degraded"\|"blocked", checks }`, installed-vs-bundled path resolution — copy the shape for the hermes pack |
| `apps/worker-app/src-tauri/src/commands.rs` | `worker_app_install_runtime_pack` (~L1342): `fetch_runtime_manifest(server_url, runtime_id, channel)` → `manifest.allowed` gate → download + sha256 verify → extract → doctor — mirror for hermes |
| `apps/worker-app/src/main.tsx` | flat single-file React UI polling `worker_app_get_executor_state`; `ExecutorState { status, logTail, ... }` — extend with hermes fields |

Registration `capabilitiesJson.hyperframes.{capability, advertised, reason}` is gated on doctor status — copy that shape for `capabilitiesJson.hermesMedia` and add `hermesVersion`.

### 2.2 Contracts consumed (do not redefine)

- Job types (section-01, `apps/web/shared/workerRuntime.ts`): `hermes_media_image_generate`, `hermes_media_video_generate`, `hermes_connection_authorize`, `hermes_connection_probe`, `hermes_connection_disconnect`; required claim capability string `hermes_media`. Rust mirrors these as `&str` consts in `hermes_executor.rs` (frozen strings — add a cross-language string-equality test comment referencing the TS constants).
- Job `inputJson` carries references as `{ assetId, index, role, label, sha256 }` — **never URLs**. Fresh presigned URLs arrive on the claim response as `referenceUrls: [{assetId, url, expiresAt}]`; mid-job re-mint via `POST /api/worker-jobs/:jobId/references/urls` (lease-authenticated, section-06). The worker verifies each download's sha256 against the contract before use.
- Progress-event sequence (must match section-05's `instructionsJson.requiredProgressStages` and section-07's TS worker): `downloading_references → starting_hermes → generating → collecting_output → validating_output → uploading`.
- Control-job behavior (section-04): device-code payload travels ONLY as the `hermes_device_code` worker-job event `{ verificationUrl, userCode, expiresAt }` (or raw fallback) — never in logs; success posts `hermes_authorized` with `accountHint`. The Rust handlers port the section-04 state machines against the **same fake-CLI fixture** (`apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/hermes.mjs` — node-builtins-only, spawnable by absolute path from `cargo test`; reuse its `scenario.ts` field vocabulary via a scenario JSON file, do not fork the fixture).
- Invocation shape (section-07 §4, identical here): `hermes -p conn_<connectionId> -z --provider xai-oauth --toolsets "image_gen"|"video_gen" --ignore-user-config <envelope>`, argv array (no shell), env `NO_COLOR=1 PYTHONUNBUFFERED=1` + profile `HOME`/`HERMES_HOME`; **`file` toolset never enabled by default**; deterministic prompt envelope with the `SMARTSPECPRO_RESULT_BEGIN/END` marker demand; 4-signal output collection trust order (marker → `./output` scan → `MEDIA:` tags → cache scan bounded by job time window) with path confinement, image magic-byte + dimension checks, video sanity via the **already-bundled ffprobe** from the render runtime pack.
- Owner binding (spec §15): server-side = existing private-mode claim filtering + pinned `workerId` + section-05's connection-affinity assertion. The Rust side adds defense-in-depth: re-check that the claimed job's `capabilityRequirementsJson.connectionId` is hosted locally before executing.

### 2.3 Version-skew policy (spec §15)

The pinned Hermes version (`hermes-agent==0.18.2`) ships only inside runtime packs tied to Worker App releases — no self-updating Hermes. Skew across the fleet is normal: the worker advertises its Hermes version in `capabilitiesJson.hermesMedia.hermesVersion`; the **server** enforces `hermes_worker_min_version` (system_settings, read via `hermesWorkerSettings.ts` from section-01). Below-minimum ⇒ `advertised` forced false server-side (claim gating then never offers hermes jobs) + a heartbeat-response warning the app renders as "update required". On runtime-pack upgrade, connections hosted on this worker need a capability re-probe — surface a "re-probe recommended" state; the probe itself is the section-04 control job triggered from the web settings panel (section-10) or app UI button.

### 2.4 Local profile storage (spec §15/§16)

One profile per connection under the app data dir (`%APPDATA%\...\hermes-profiles\conn_<connectionId>\` / `~/Library/Application Support/...`), 0700-equivalent ACLs (Windows: restrict to current user via the platform API the credentials module already uses), excluded from `logTail`, crash reports, and the diagnostics export (token-like strings masked to ≤4 chars). Job workspaces must never live inside profile directories. Prohibited: global shared `auth.json`, client-mapped profile selection.

---

## 3. Files to create / modify

| Path | Action | Purpose |
|---|---|---|
| `apps/worker-app/src-tauri/src/hermes_executor.rs` | create | Job-type consts, `HermesExecutionPlan`, `prepare_hermes_execution_plan`, envelope/argv builders, output collector, control-handler ports, affinity re-check, profile paths |
| `apps/worker-app/src-tauri/src/hermes_runtime.rs` | create | Hermes pack manifest type, install-layout resolution, `hermes_doctor()` → `DoctorSummary` |
| `apps/worker-app/src-tauri/src/worker_executor.rs` | modify | Dispatch arm for the 5 hermes job types (guarded on doctor ready), delegating to `hermes_executor` |
| `apps/worker-app/src-tauri/src/worker_loop.rs` | modify | Claim `capability_hints` include `hermes_media` iff advertised; separate hermes slot (1) vs render slots |
| `apps/worker-app/src-tauri/src/control_plane.rs` | modify | Registration payload: `capabilitiesJson.hermesMedia = { capability, advertised, reason, hermesVersion }` gated on doctor |
| `apps/worker-app/src-tauri/src/worker_control_plane.rs` | modify | Add `refresh_reference_urls(job_id)` client call; parse `referenceUrls` from the claim response |
| `apps/worker-app/src-tauri/src/commands.rs` | modify | `worker_app_install_hermes_runtime` + `worker_app_hermes_doctor` commands; executor-state extension |
| `apps/worker-app/src-tauri/src/lib.rs` / `main.rs` | modify | Register module + commands |
| `apps/worker-app/src/main.tsx` | modify | Hermes status card: doctor state, connection status, device code, re-auth prompt, update-required banner |
| `apps/web/scripts/build-hermes-runtime-pack.ts` | create | Assembles per-OS archive (uv-managed Python 3.11 + `hermes-agent==0.18.2`) + sha256 + manifest entry |
| `apps/web/server/routes/workerRuntime.ts` (or wherever the runtime-manifest endpoint lives) | modify | Serve `hermes-windows-x64` / `hermes-macos-arm64` manifest entries |
| `apps/web/server/services/workerRegistryService.ts` | modify | Min-version enforcement in registration + heartbeat processing |
| `apps/web/server/services/__tests__/workerRegistryService.hermesMinVersion.test.ts` | create | Vitest for the enforcement |

---

## 4. TDD — write these tests first

### 4.1 Rust — in-file `#[cfg(test)]` (run `cargo test` from `apps/worker-app/src-tauri`)

In `hermes_runtime.rs`:
- **Doctor readiness:** `hermes_doctor` reports `ready` only when all three checks pass — python binary present, `hermes --version` output matches the pinned `0.18.2`, profile root writable. Version mismatch ⇒ `degraded` with a reason mentioning the expected pin; missing pack ⇒ `blocked`. Use temp dirs + a stub `hermes` script (or the fake-CLI fixture with a `--version` scenario).
- Manifest `allowed: false` ⇒ doctor blocked (mirror of the hyperframes manifest gate test).

In `hermes_executor.rs`:
- **Dispatch guard:** `prepare_hermes_execution_plan` returns an error for hermes job types when the doctor is not ready; unknown job types are untouched (existing hyperframes dispatch unchanged — extend the existing dispatch test with a hermes `ClaimedWorkerJob` fixture).
- **Argv safety:** plan argv never contains `file` in `--toolsets`; a prompt containing shell metacharacters remains one argv element; `--ignore-user-config` always present; `image_gen` vs `video_gen` selected by jobType; an adversarial prompt containing `--toolsets file` / `cd /` leaves the argv's toolset/cwd elements byte-identical.
- **Envelope determinism:** fixed contract ⇒ byte-identical envelope (assert equality across two builds; keep the format aligned with section-07's TS snapshot — same field order).
- **Affinity re-check:** a claimed job whose `capabilityRequirementsJson.connectionId` has no local profile/hosted-connection entry is refused before spawn (typed failure, job failed with a reason the server settlement maps — never silently executed).
- **Output collection trust order:** marker block wins over workspace files; path-confinement rejects `..`/absolute escapes (reuse `validate_workspace_path`); corrupt image (magic bytes) and ffprobe-failing video ⇒ `HERMES_OUTPUT_INVALID` failure reason string.
- **Reference download:** sha256 mismatch ⇒ `HERMES_REFERENCE_DOWNLOAD_FAILED`; expired URL triggers one refresh-then-retry (injected client trait/stub); a reference passing sha256 but failing magic-byte/dimension/size validation ⇒ typed pre-spawn rejection (mirror of section-07's rule — reuse the output validators on inbound references).
- **Control handlers (port of section-04 vectors):** authorize posts `hermes_device_code` exactly once and never writes the code/URL into the executor log tail; probe manifest gates operations on `hermes tools` output; disconnect runs logout before profile removal and reports removal failure. Reuse the fake-CLI fixture scenarios (spawn `node <abs path>/hermes.mjs` with `FAKE_HERMES_SCENARIO_FILE`).
- **Profile paths:** profile dir strictly under the hermes-profiles root; `remove` refuses paths outside it.
- **Full-flow integration test (owns spec §20 "video … via a private Worker
  App worker"):** one `#[cfg(test)]` (or `tests/`) case driving
  `hermes_executor`'s complete media flow against the shared fake-CLI
  fixture with BOTH an image scenario and a **video scenario** (stubbed
  ffprobe): claimed-job fixture (with `referenceUrls`) → reference download
  + sha256 verify → spawn → collect (marker/MEDIA/cache signals) →
  validate → artifact upload calls (stubbed client trait) → progress-event
  sequence asserted in order. Mirrors section-07's `e2e.fakeCli.test.ts` so
  the two workers provably implement the same contract.

In `worker_loop.rs` / `control_plane.rs`:
- **Claim hints:** `capability_hints` include `"hermes_media"` only when `hermesMedia.advertised` is true (doctor-gated); render hint unaffected.
- **Slot accounting:** with 1 hermes job running, a render job can still be claimed and vice versa; a second hermes job is never claimed concurrently (default 1).
- **Registration payload:** `capabilitiesJson.hermesMedia` present with `{ capability, advertised, reason, hermesVersion }`; `advertised: false` + reason when doctor degraded (mirror the existing hyperframes gating test).

### 4.2 Vitest — server side (`pnpm --dir apps/web test`)

`workerRegistryService.hermesMinVersion.test.ts`:
- Registration with `hermesMedia.hermesVersion` below `hermes_worker_min_version` (stubbed settings) ⇒ stored capabilities have `advertised: false` + a `reason` naming the minimum; at-or-above ⇒ preserved as sent.
- Heartbeat processing applies the same rule (a worker registered before an admin raised the minimum gets demoted on next heartbeat) and the heartbeat response carries an `updateRequired`-style warning field.
- Applies regardless of runtimeType (fixture for `desktop_zeroclaw_managed` AND `hermes_agent_gateway` — the shared unit is not exempt).
- Missing/absent `hermesMedia` block ⇒ untouched (no crash, no synthesized capability); semver-ish comparison handles `0.18.2` vs `0.18.10` correctly.

Build script test (light): `build-hermes-runtime-pack.ts` manifest-entry builder produces `{ runtimeId, version, archiveSha256, allowed }` for both OS ids; unknown OS rejected. Do not test archive assembly end-to-end.

---

## 5. Implementation guidance

### 5.1 `hermes_runtime.rs` + install command

Copy the hyperframes shapes: a `HermesRuntimeManifest` (version, pinned hermes version, python relative path, sha256/checksum file, `allowed`), installed-vs-bundled resolution under the app data dir (`hermes-runtime/`), and:

```rust
pub fn hermes_doctor(app_data_dir: &Path) -> DoctorSummary; // checks: python present, `hermes --version` == pin, profile root writable
pub const HERMES_RUNTIME_ID_WINDOWS: &str = "hermes-windows-x64";
pub const HERMES_RUNTIME_ID_MACOS: &str = "hermes-macos-arm64";
```

`worker_app_install_hermes_runtime` (commands.rs) mirrors `worker_app_install_runtime_pack` step-for-step: fetch manifest by runtime id + channel → `manifest.allowed` gate → download → sha256 verify → extract → run doctor → persist doctor result into executor state. After a successful install/upgrade, flag hosted connections as "re-probe recommended".

### 5.2 `hermes_executor.rs`

```rust
pub const HERMES_MEDIA_IMAGE_JOB_TYPE: &str = "hermes_media_image_generate";
pub const HERMES_MEDIA_VIDEO_JOB_TYPE: &str = "hermes_media_video_generate";
// + the three hermes_connection_* consts and HERMES_MEDIA_CLAIM_CAPABILITY = "hermes_media"

pub struct HermesExecutionPlan { /* argv, cwd (job workspace), env, profile dir, timeouts, expected kind/count */ }
pub fn prepare_hermes_execution_plan(job: &ClaimedWorkerJob, doctor: &DoctorSummary, profiles: &HermesProfileStore) -> Result<HermesExecutionPlan, String>;
pub fn build_hermes_prompt_envelope(contract: &HermesMediaJobContract, workspace: &Path) -> String; // deterministic, matches TS format
pub fn collect_hermes_outputs(/* invocation result, workspace, cache dirs, job window, expected */) -> Result<Vec<CollectedOutput>, HermesFailure>; // 4-signal trust order
pub fn verify_connection_affinity(job: &ClaimedWorkerJob, profiles: &HermesProfileStore) -> Result<String /* connectionId */, String>;
```

Media flow mirrors section-07's `jobHandlers` exactly (same progress events, same failure-reason strings so section-04/06 settlement maps them identically): affinity check → workspace create → `downloading_references` (sha256 verify, refresh-on-expiry) → `starting_hermes` → spawn (timeouts: image 5/10 min soft/hard, video 15/30, inactivity 5; before a retry, check the workspace for a completed first attempt) → `generating` → `collecting_output` → `validating_output` (ffprobe from the render pack's sidecar root) → `uploading` via the existing 3-step artifact client. Control jobs port the section-04 state machines; the device code goes into executor state (for the UI) and the `hermes_device_code` event — never `logTail`.

### 5.3 Dispatch, claim hints, slots

- `worker_executor.rs`: extend the jobType dispatch with the five hermes types; doctor-not-ready ⇒ refuse at prepare time (job should not have been offered — fail typed, don't panic).
- `worker_loop.rs`: hints = existing render hints + `"hermes_media"` when advertised; track hermes-active separately from render-active so `maxJobs`/claim requests keep render capacity independent (1 hermes max).
- `control_plane.rs`: registration `capabilitiesJson.hermesMedia = { capability: "hermes-media-generation", advertised: bool, reason: Option<String>, hermesVersion: Option<String> }`.

### 5.4 Server-side min-version enforcement (`workerRegistryService.ts`)

At the two ingestion points (register + heartbeat), if `capabilitiesJson.hermesMedia?.hermesVersion` exists: compare against `hermes_worker_min_version` (via `getHermesWorkerSettings`, TTL-cached; absent setting ⇒ no enforcement). Below minimum ⇒ persist `advertised: false` + `reason` and include a warning in the heartbeat response payload. Pure helper (e.g. `enforceHermesMinVersion(capabilities, minVersion)`) exported for the vitest; comparison must be numeric-segment-wise, not lexicographic. Do not touch section-05's claim assertions — they already read `advertised`/hints.

### 5.5 Pack build script + manifest serving

`apps/web/scripts/build-hermes-runtime-pack.ts`: for a target OS, assemble uv-managed Python 3.11 + `hermes-agent==0.18.2` into an archive, compute sha256, emit the manifest entry JSON. Windows pack is the phase-4 gate; the macOS entry can exist `allowed: false` until built. Add the two runtime ids to the server's runtime-manifest source so `fetch_runtime_manifest` resolves them.

### 5.6 React UI (`apps/worker-app/src/main.tsx`)

Extend the polled executor state with `hermes: { doctor, hermesVersion, updateRequired, connections: [{ connectionId, status, accountHint }], activeAuth?: { verificationUrl, userCode, expiresAt } }`. Render: runtime install/doctor card (install button when pack missing), connection status list, device-code panel while an auth job is active (official-URL button + copyable code + countdown), re-auth prompt on `reauth_required`, "update required" banner from the heartbeat warning. No test harness exists for this file today — keep logic in Rust/state, UI dumb.

---

## 6. Acceptance checklist

- [ ] All §4.1 Rust tests written first and green (`cargo test` in `apps/worker-app/src-tauri`); existing hyperframes tests unchanged.
- [ ] §4.2 vitest suites green; full `pnpm --dir apps/web test` + typecheck green (no regressions in section-05 claim tests).
- [ ] Doctor-gated advertisement: `hermesMedia.advertised` true only when python + pinned version + writable profile root all pass; claim hints follow it.
- [ ] Affinity defense-in-depth: foreign `connectionId` refused Rust-side even if offered.
- [ ] Below-minimum workers (any runtimeType) are never offered hermes jobs and see "update required".
- [ ] `file` toolset absent from default argv; envelope/argv/collection behavior matches the TS worker (shared fake-CLI scenarios pass on both).
- [ ] No device code, auth.json content, or >4 chars of any token in `logTail`, crash reports, or diagnostics export.
- [ ] 1 hermes job max; render throughput unaffected.
- [ ] Windows pack builds via the script and installs through `worker_app_install_hermes_runtime`; macOS id registered (pack may follow).

## 7. Out of scope (owned elsewhere)

- Scheduler, admission, server claim gating internals → section-05. Task projection/finalize/reference-URL endpoints → section-06. Shared server worker + systemd unit → section-07. Web connect/device-code UI → section-10. Audit events, admin fleet panels, token-leak CI grep → section-12.
---

## IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. cargo 117/117 (93 lib + 10 + 14 integration, incl.
full-flow image+video against the shared fake-CLI fixture, stable across
~18 consecutive runs); vitest 205/205 across 16 files; cargo check clean;
typecheck baseline unchanged.

Two review rounds found 6 BLOCKERs total — all fixed and verified on disk:

Round 1: the loop hardcoded `advertised=false` and never called the hermes
executor (private worker could never receive or run a job); the runtime-pack
download route rejected hermes filenames (runtime could never install).

Round 2 (things reported "fixed" that were not actually wired):
- **A** — `worker_app_start_connect_session` still called the OLD
  `build_registration_payload` (defaulting to `not_installed()`), and the
  heartbeat carried no `hermesMedia` → server-side capability was permanently
  advertised:false and `enforceHermesMinVersion` a no-op. Now the real
  `HermesRegistrationInfo` (shared `compute_hermes_doctor_and_version`) flows
  at the real call site, the heartbeat carries `hermesMedia`, and
  `recordWorkerHeartbeat` promotes the fresh block before enforcement.
- **B** — `spawn_hermes_process` never called `.env_clear()`; Rust Command
  inherits the whole parent env, handing the Tauri app's environment to a
  prompt-injectable agent. Now env_clear + allow-list at every spawn site.
- **C** — control jobs (`auth add/status/logout` — the token writers) never
  set `HERMES_HOME` and discarded the profile handle → they ran against the
  user's real HOME, defeating per-connection isolation. Now every control
  spawn resolves the profile's HERMES_HOME.

Plus: unified the dual HERMES_HOME (`profile_dir()` now = `base/home`, the
dir ensure_profile creates and hardens); genuine slot independence (render
and hermes gated by separate atomics, jobs spawned not awaited inline, with
terminal-error shutdown preserved via a shared slot); soft/inactivity
timeouts enforced (inactivity resets on stdout OR stderr); assetId validated
before any fetch (path traversal); probe/disconnect gained the affinity
re-check (authorize exempt by design).

Bonus production bug found while hardening tests: `spawn_hermes_process`
drained stdout before joining the reader thread, losing output from
fast-exiting children under scheduling contention. Fixed.

Known limitation: `ExecutorState`'s "current job" UI fields remain
single-slot (last-writer-wins display); claiming/execution independence is
real, only the display is simplified.

Review trail: `../implementation/code_review/section-11-{diff,review,interview}.md`.
