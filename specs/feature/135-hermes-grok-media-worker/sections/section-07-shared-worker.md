# Section 07 — Shared Server Hermes Worker Process

**Section id:** `section-07-shared-worker`
**Plan reference:** `claude-plan.md` §10 (with contract inputs from §3, §6, §7, §8, §9); `claude-plan-tdd.md` §10, §16 (fake-CLI e2e gate); `spec.md` §8, §13
**Depends on:** section-01 (shared contracts in `shared/hermesMedia.ts` + `shared/workerRuntime.ts`), section-04 (control-job contracts, stdout parsers, fake `hermes` CLI fixture), section-05 (scheduler/claim gating: `capabilityRequirementsJson`, required claim capability), section-06 (claim-time reference URL minting, refresh endpoint, artifact finalize path)
**Blocks:** section-12 (observability/hardening)
**Parallelizable with:** section-09
**Test command:** `pnpm --dir apps/web test` (run all new specs from `apps/web`)

---

## 1. Objective

Build the shared server Hermes worker: a standalone Node process (own systemd unit, own cgroup) that speaks the existing worker control plane over HTTP as an ordinary external worker and executes the two Hermes media job types plus the three Hermes connection-control job types by driving the pinned Hermes Agent CLI (`hermes-agent==0.18.2`). Also deliver the systemd unit file, the one-time pairing script, and an OFF-by-default dev-only in-web-process drainer.

**Non-negotiable process rule (spec §8.1):** this worker is NEVER part of `smartspec-web.service` and is NEVER imported by the web server. Rationale: the vertical-drama ffmpeg incident (web cgroup `MemoryHigh` throttle → D-state hangs). The only exception is the dev drainer (§9 below), which reuses `jobHandlers` behind a default-OFF flag and is documented dev-only.

---

## 2. Background context (read once, then implement)

### 2.1 Trust boundary and transport

The worker runs on the same host as the web app but gets **no implicit trust**. It authenticates with a worker bearer token (env `HERMES_WORKER_TOKEN`, provisioned via systemd `EnvironmentFile`) and talks the same HTTP control-plane endpoints the desktop Worker App (Rust) uses: register → heartbeat → claim → job events → artifact init/presigned-upload/complete → reference-URL refresh. Endpoint handlers live in `apps/web/server/routes/workerRuntime.ts` (section-06 added the reference-URL claim enrichment and `POST /api/worker-jobs/:jobId/references/urls`). Mirror the Rust client's payload shapes, including device-proof headers.

### 2.2 Contracts this section consumes (do not redefine)

From `apps/web/shared/workerRuntime.ts` (section-01):
- `HERMES_MEDIA_IMAGE_JOB_TYPE = "hermes_media_image_generate"`, `HERMES_MEDIA_VIDEO_JOB_TYPE = "hermes_media_video_generate"`
- `HERMES_CONNECTION_AUTH_JOB_TYPE`, `HERMES_CONNECTION_PROBE_JOB_TYPE`, `HERMES_CONNECTION_DISCONNECT_JOB_TYPE`
- `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY = "hermes_media"`, `HERMES_MEDIA_CAPABILITY_FAMILIES`

From `apps/web/shared/hermesMedia.ts` (section-01): `HermesMediaJobContract` (zod), `HermesConnectionCapabilityManifest`, `HERMES_MEDIA_ERROR_CODES` / `hermesErrorCopy`. Job `inputJson` carries references as `{ assetId, index, role, label, sha256 }` — **never URLs**; fresh presigned URLs arrive in the claim response (`referenceUrls: Array<{assetId, url, expiresAt}>`) and via the refresh endpoint.

From section-04: the three control-job handler behaviors (device-code stdout parser, auth-status parser, capability-probe → manifest parser) and the `hermes_device_code` event contract (`payloadJson: { verificationUrl, userCode, expiresAt }` — never logged). Section-07 wires those handlers into this worker's dispatch; the parsers themselves are section-04 code — import, don't duplicate.

From section-05: jobs carry `capabilityRequirementsJson: { capabilityFamilies, requiredClaimCapability, connectionId, preferredWorkerId }`; the worker must send `capabilityHints: [HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY]` on claim or the server will never hand it a Hermes job. Registration payload advertises `runtimeType: "hermes_agent_gateway"`.

From section-06: after `complete` of the final artifact, the **server** runs `finalizeHermesMediaArtifact` (re-validation → `media_assets` + `library_items` → `publishing → completed`). The worker's job ends at verified artifact upload + final events; it never registers library rows itself.

### 2.3 Naming guard

The codebase already has an unrelated agent-gateway lane named `queueHermesWorkerJob` / `hermesAgentRuntime`. Nothing under `server/hermesWorker/` may import those symbols (section-01 ships a grep-style namespace-guard test; keep it green).

### 2.4 Filesystem layout (spec §8.2)

```text
/var/lib/smartspec-hermes-worker/
  hermes/                      # pinned installation (uv venv, hermes-agent==0.18.2)
  profiles/
    tenant_<tenantId>/
      conn_<connectionId>/
        home/.hermes/          # auth.json, config.yaml (0700, worker user only)
        locks/
        logs/
  jobs/
    <workerJobId>/
      input/  output/  manifest/  logs/  tmp/
```

Job workspaces never live inside profile directories; a job must never be able to read another connection's profile.

---

## 3. Files to create / modify

| Path | Action | Purpose |
|---|---|---|
| `apps/web/server/hermesWorker/main.ts` | create | Process entry: register → heartbeat/claim loop → settle; SIGTERM drain |
| `apps/web/server/hermesWorker/controlPlaneClient.ts` | create | Typed HTTP client for the worker control plane |
| `apps/web/server/hermesWorker/hermesInstallation.ts` | create | Pinned install provision/verify, `ProfileStrategy`, isolation probe, flag-composition probe |
| `apps/web/server/hermesWorker/hermesInvocation.ts` | create | Prompt envelope + CLI spawn adapter (argv arrays, timeouts, cancellation) |
| `apps/web/server/hermesWorker/outputCollector.ts` | create | 4-signal output collection + validation |
| `apps/web/server/hermesWorker/jobHandlers.ts` | create | Dispatch by jobType; media handlers + wiring of section-04 control handlers; concurrency locks |
| `apps/web/server/hermesWorker/workspace.ts` | create | Job dir lifecycle, retention, disk-pressure eviction, freeDiskBytes |
| `apps/web/server/hermesWorker/__tests__/*.test.ts` | create | Unit tests per module (see §5) |
| `apps/web/server/hermesWorker/__tests__/e2e.fakeCli.test.ts` | create | Fake-CLI end-to-end smoke |
| `docker/systemd/smartspec-hermes-worker.service` | create | Dedicated unit (own cgroup limits) |
| `apps/web/scripts/pair-hermes-worker.ts` | create | One-time admin pairing helper |
| `apps/web/server/services/hermesWorkerDevDrainer.ts` | create | Dev-only in-web drainer (flag-gated, default OFF) |
| `apps/web/server/_core/index.ts` | modify | Bootstrap the dev drainer behind `web_process_hermes_worker_enabled` |

The web server must not import anything from `server/hermesWorker/` except the dev drainer's import of `jobHandlers` (and that file must stay side-effect-free at import time).

---

## 4. Design constraints (security + robustness decisions already made)

1. **Invocation shape (plan §10 — supersedes spec §13.3's toolset list):**
   `hermes -p conn_<connectionId> -z --provider xai-oauth --toolsets "image_gen"` (or `"video_gen"`) `--ignore-user-config <envelope>` — spawned via argv array (no shell), cwd = job workspace, env `NO_COLOR=1 PYTHONUNBUFFERED=1` plus profile `HOME`/`HERMES_HOME`.
2. **`file` toolset is NOT enabled by default.** The media tools materialize outputs to `$HERMES_HOME/cache/{images,videos}` and emit `MEDIA:` tags on their own; enabling `file` only widens the prompt-injection blast radius. A per-deployment config flag may re-enable it if the pinned version proves to need it.
3. **Flag-composition fallback:** whether `-z` composes with `--provider/--toolsets/-p` is probed once at provisioning time; the adapter carries a `chat -q -Q`-style fallback command template selected by the stored probe result. Never assume undocumented flag behavior.
4. **Prompt envelope is deterministic** (spec §13.3): job id, operation, output dir, ordered reference list with roles/labels, an explicit "do not reorder/substitute references" instruction, sanitized user prompt (control chars stripped), and a demanded machine-readable result block `SMARTSPECPRO_RESULT_BEGIN {json} SMARTSPECPRO_RESULT_END`.
5. **Output collection trust order (4 signals):** parse result-marker block → scan `./output` in the workspace → parse `MEDIA:<url>` tags (download into workspace first) → scan `$HERMES_HOME/cache/{images,videos}` bounded by the job time window (mtime). Path-confinement checks reject anything outside workspace/cache. Validate images by magic bytes + dimensions, videos by `ffprobe` stream/duration/codec sanity (audio stream allowed-but-optional).
6. **Timeout defaults (spec §13.6, configurable):** image soft/hard 5/10 min; video 15/30 min; reference download 2 min/file; no-output inactivity 5 min. Cancellation: graceful term → grace period → SIGKILL. Before a generation retry, check the workspace for a completed first attempt (avoid double quota burn).
7. **Local defense in depth (spec §8.3):** global max concurrent Hermes children (default 2, env override), exactly 1 concurrent job per connection (local file lock under the profile's `locks/`), refuse claims below a free-disk threshold, per-process runaway kill.
8. **Secrets:** device codes and `auth.json` contents never reach logs or events other than the dedicated `hermes_device_code` event payload; diagnostics mask token-like strings to ≤4 chars (section-12 adds the CI grep test — write code that passes it now).

---

## 5. TDD — write these tests first

Conventions: Vitest, run from `apps/web`. Every module takes injected deps (spawn function, fs root, clock, fetch/client) so unit tests use no real network, DB, or `/var/lib` paths — use `mkdtemp` roots. Reuse the **fake `hermes` CLI fixture created in section-04** (a small script emitting configurable stdout / writing configurable output files; import it from wherever section-04 placed it — do not create a second fixture).

### 5.1 `__tests__/hermesInvocation.test.ts`
- Envelope is deterministic for a fixed contract → snapshot test.
- Argv safety: a prompt containing `"; rm -rf /` remains a single argv element; no shell is ever involved (assert on the injected spawn spy's args).
- `--toolsets` never includes `file` by default; includes it only when the deployment config flag is set.
- Fallback command template is selected when the stored composition-probe result reports `-z` incompatibility.
- Inactivity timeout and hard wall-clock timeout kill the child (fake clock + fake child process).
- Cancellation escalates SIGTERM → (grace elapses) → SIGKILL.
- Adversarial prompt cannot alter argv structure: a prompt literally containing `--toolsets file`, `cd /`, or `--ignore-user-config /etc` leaves the built argv's toolset/cwd/config elements byte-identical (the payload stays inside the single envelope element).

### 5.2 `__tests__/outputCollector.test.ts`
- Trust order: a valid `SMARTSPECPRO_RESULT` block wins even when `./output` also has files; block absent → workspace scan; then `MEDIA:` tag parse; then cache scan bounded by the job time window (files with mtime outside the window ignored).
- Path confinement: `../escape`, absolute paths outside workspace/cache, and symlinks out of the roots are rejected.
- Corrupt image (magic-byte mismatch) and truncated video (stubbed `ffprobe` failure) → typed `HERMES_OUTPUT_INVALID`.
- Malicious filenames from workspace/cache scans (null bytes, control chars, Windows reserved device names, overlong names) are rejected or sanitized before use in storage keys/artifact names — at least one adversarial-filename case tested.
- Remote `MEDIA:` URL is downloaded into the workspace before validation (injected fetch).

### 5.3 `__tests__/profileStrategy.test.ts` (for `hermesInstallation.ts`)
- Native-profile strategy selected when the isolation probe passes (two probe profiles do not share auth state).
- Fallback per-connection `HERMES_HOME` strategy selected when the probe fails.
- Both strategies produce profile paths strictly under the HERMES_HOME root (no traversal); `removeProfile` refuses paths outside the root.
- Workspace/profile disjointness (prohibited-design guard): workspace and profile roots are structurally disjoint, and output-collection path confinement rejects a path resolving under ANY connection's profile directory — including a different connection's.

### 5.4 `__tests__/jobHandlers.test.ts`
- Media handler posts the progress-event sequence in order: `downloading_references → starting_hermes → generating → collecting_output → validating_output → uploading` (assert via injected controlPlaneClient spy).
- Reference downloads verify sha256 against the contract; mismatch fails with `HERMES_REFERENCE_DOWNLOAD_FAILED`; expired URL triggers the refresh endpoint then retries.
- **Reference format validation pre-spawn (spec §13.2 — not just outputs):** a downloaded reference that passes sha256 but fails magic-byte/dimension/size checks (reuse the same validators `outputCollector` applies to outputs) → typed `HERMES_REFERENCE_INVALID`-class rejection BEFORE Hermes is spawned; corrupt-but-checksummed stored assets never reach the CLI.
- Artifact upload retries once on 401 after token refresh (same recovery the Rust client implements); bounded retry otherwise.
- Per-connection lock serializes two jobs for one connection while jobs on different connections run in parallel up to global max (default 2).
- Dispatch table routes the three `hermes_connection_*` job types to the section-04 handlers (spy-level assertion only — behavior is tested in section-04).
- **Non-retryable classification is terminal:** a handler failure classified
  as a non-retryable code (per `hermesErrorCopy(code).retryable === false`,
  e.g. entitlement-403, `HERMES_OUTPUT_INVALID`) is reported as an explicit
  failure event with `failureReason: formatHermesErrorMessage(code)` and the
  job ends `failed` — it is NEVER retried in-handler nor left to lease
  expiry. Clarifying rule (test both sides): `retryPolicyJson.maxAttempts`
  governs only lease-expiry recovery (worker died mid-job); explicit
  worker-reported failures are always terminal on the fabric, and transient
  retries (reference download, artifact upload) happen INSIDE the handler
  before any failure is reported. This owns the spec §20 criterion
  "permanent 403 is not retried".

### 5.5 `__tests__/workspace.test.ts`
- Completed workspace deleted immediately after verified upload.
- Failed workspace retained, then evicted after 72h (injected clock).
- Log rotation caps at 14 days.
- Disk-pressure eviction removes oldest terminal-job workspaces first; active workspaces never evicted.
- `freeDiskBytes` computed and exposed for heartbeats.

### 5.6 `__tests__/controlPlaneClient.test.ts`
- Registration payload advertises `runtimeType: "hermes_agent_gateway"` and `capabilitiesJson.hermesMedia` **only when doctor readiness passed**; `maxConcurrentJobs` included.
- Heartbeat carries `freeDiskBytes`.
- Claim request includes `capabilityHints: [HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY]`.
- 401 on any call triggers one token-refresh-and-retry, then surfaces a typed error.

### 5.7 `__tests__/e2e.fakeCli.test.ts` (delivery-gate smoke, TDD §16)
Full loop with the fake CLI and an in-memory/stubbed control plane, **two scenarios**: (a) image — fake CLI writes an output image; (b) **video** — fake CLI writes an output video (stubbed ffprobe validates stream/duration), owning the spec §20 criterion "video generation completes via a shared server worker". Each: enqueue (fixture job row) → claim → progress events → collect/validate → artifact init/upload/complete → (stubbed) finalize → projected task reaches `completed`. Runs in CI; no real Hermes, network, or DB.

---

## 6. Implementation guidance per module

Keep every module dependency-injected and side-effect-free at import time. Stub-level sketches only — do not treat these as full implementations.

### 6.1 `controlPlaneClient.ts`
```ts
export interface HermesControlPlaneClient {
  register(input: RegisterInput): Promise<RegisterResult>;
  heartbeat(input: { freeDiskBytes: number; activeJobIds: string[] }): Promise<void>;
  claim(input: { capabilityHints: string[] }): Promise<ClaimedJob | null>; // ClaimedJob includes referenceUrls
  postEvent(jobId: string, event: { eventType: string; payloadJson?: unknown }): Promise<void>;
  initArtifact(...): Promise<PresignedUpload>; completeArtifact(...): Promise<void>;
  refreshReferenceUrls(jobId: string): Promise<Array<{ assetId: string; url: string; expiresAt: string }>>;
}
export function createControlPlaneClient(cfg: { baseUrl: string; token: string; fetchImpl?: typeof fetch }): HermesControlPlaneClient;
```
Bearer token from `HERMES_WORKER_TOKEN`; device-proof headers per the documented worker contract. Mirror the Rust client's JSON shapes exactly (read `apps/web/server/routes/workerRuntime.ts` for the authoritative server side).

### 6.2 `hermesInstallation.ts`
```ts
export interface ProfileStrategy {
  kind: "native_profile" | "per_connection_home";
  ensureProfile(ref: { tenantId: string; connectionId: string }): Promise<ProfileHandle>; // { profileArg?/env, homeDir, locksDir }
  removeProfile(ref): Promise<void>; // secure removal, confined to root
}
export async function provisionHermes(cfg): Promise<{ version: string; doctorOk: boolean; strategy: ProfileStrategy; invocationTemplate: "print_mode" | "chat_fallback" }>;
```
Provisioning: uv-managed venv, `hermes-agent==0.18.2`, `hermes --version` check; run the **profile-isolation probe** (create two probe profiles, confirm auth state does not leak) and the **flag-composition probe** (does `-z` compose with `--provider/--toolsets/-p`); persist both results for the adapter. Registration advertises `hermesMedia` capability only when this doctor pass succeeds.

### 6.3 `hermesInvocation.ts`
```ts
export function buildPromptEnvelope(contract: HermesMediaJobContract, workspace: JobWorkspace): string; // deterministic, spec §13.3
export function buildArgv(params: { profile: ProfileHandle; operation: HermesMediaOperation; template: "print_mode" | "chat_fallback"; enableFileToolset: boolean; envelope: string }): string[];
export async function runHermes(params: { argv; cwd; env; timeouts: { softMs; hardMs; inactivityMs }; onStdoutLine; signal }): Promise<InvocationResult>; // stdout/stderr captured separately
```
Spawn via injected `spawn`; sanitize prompt (strip control chars) before envelope construction; timeout enforcement with injected timers; cancellation = SIGTERM → grace → SIGKILL.

### 6.4 `outputCollector.ts`
```ts
export async function collectOutputs(params: { invocation: InvocationResult; workspace: JobWorkspace; cacheDirs: string[]; jobWindow: { startedAt: Date; endedAt: Date }; expected: { kind: "image" | "video"; count: number }; fetchImpl?; ffprobeImpl?; }): Promise<CollectedOutput[] /* throws typed HERMES_RESULT_INVALID / HERMES_OUTPUT_INVALID */>;
```
Implement the 4-signal trust order and all validation rules from §4.5. Keep `ffprobe` behind an injectable function for tests.

### 6.5 `jobHandlers.ts`
```ts
export function createJobHandlers(deps: { client: HermesControlPlaneClient; installation; workspace; invocation; collector; locks; config }): { handle(job: ClaimedJob): Promise<void> };
```
Media flow per job: workspace create → post `downloading_references` → download + sha256-verify each reference (refresh URLs on expiry) → `starting_hermes` → acquire per-connection file lock → invoke → `generating` (stream sanitized progress lines as events) → `collecting_output` → `validating_output` → `uploading` → artifact init/presigned PUT/complete with bounded retry + 401-token-refresh → release lock → workspace settle. Control jobs dispatch to section-04 handlers with the profile strategy injected. Global concurrency default 2 (env override); refuse work when free disk below threshold.

### 6.6 `workspace.ts`
```ts
export function createWorkspaceManager(cfg: { root: string; clock?: () => Date }): {
  create(jobId: string): Promise<JobWorkspace>;            // input/ output/ manifest/ logs/ tmp/
  settleCompleted(jobId): Promise<void>;                    // delete after verified upload
  settleFailed(jobId): Promise<void>;                       // retain 72h
  sweep(): Promise<void>;                                   // 72h eviction + 14-day log rotation + disk-pressure eviction (oldest terminal first)
  freeDiskBytes(): Promise<number>;
};
```

### 6.7 `main.ts`
Register (with doctor-gated capabilities) → loop `{ heartbeat → claim(capabilityHints) → handle with active-heartbeat keepalive → settle }`; watchdog timeouts around handlers; SIGTERM drains active jobs within the unit's `TimeoutStopSec`. Entry command: `npx tsx server/hermesWorker/main.ts` from the `apps/web` working directory. `main.ts` imports only `shared/`, its sibling modules, and the HTTP client — **no `db` import anywhere in the directory**.

---

## 7. Systemd unit — `docker/systemd/smartspec-hermes-worker.service`

Copy the `docker/systemd/smartspec-web.service` template and adjust:
- `PartOf=smartspec.target`, `After=smartspec-web.service`
- `WorkingDirectory=/home/dev/projects/SmartSpecPro/apps/web`, `ExecStart` runs `npx tsx server/hermesWorker/main.ts`
- `EnvironmentFile=-/home/dev/projects/SmartSpecPro/apps/web/.env` **plus** `EnvironmentFile=/etc/smartspec/hermes-worker.env` (root-owned, mode 0600, holds `HERMES_WORKER_TOKEN`)
- `MemoryHigh=1024M`, `MemoryMax=1536M`, `CPUQuota=150%`, `TasksMax` set, `Restart=on-failure`, `KillMode=mixed`, `SyslogIdentifier=smartspec-hermes-worker`

Install/enable steps and the `run-services.sh` status-listing doc update are recorded here but exercised in section-12. Follow the CLAUDE.md service-file rule: source of truth is `docker/systemd/`, copied to `/etc/systemd/system/` + `daemon-reload` at install time.

## 8. Pairing script — `apps/web/scripts/pair-hermes-worker.ts`

Small admin CLI that drives the existing worker device-code/registration pairing flow (same `WorkerConnectSession` mechanism the Worker App uses):
1. Runs the pairing exchange and obtains the worker bearer token + worker id.
2. Prints the token once for the admin to place into `/etc/smartspec/hermes-worker.env` (never writes it into the repo, DB, or `system_settings`).
3. Writes the paired worker id into `system_settings` key `hermes_shared_worker_id` — the discovery key `startConnect` (section-03) and the scheduler (section-05) read; never guessed from `runtimeType`.

Rotation = re-pair + swap the env file + restart the unit (old token revoked server-side). Add a unit test only for the argument parsing / settings-write call (injected settings service); do not test the live pairing exchange.

## 9. Dev-only in-web drainer — `apps/web/server/services/hermesWorkerDevDrainer.ts`

Mirror `apps/web/server/services/inlineRenderWorker.ts`: a tick loop behind system-settings flag `web_process_hermes_worker_enabled` (default OFF, read through `hermesWorkerSettings.ts` from section-01), bootstrap-wired in `apps/web/server/_core/index.ts` next to the inline render worker. It reuses `createJobHandlers` with a direct-DB claim shim instead of the HTTP client. Document dev-only in a file-top comment; production stays on the systemd unit.

Runtime toggle hook: in `apps/web/server/routers/systemSettings.ts` `updateSetting`, beside section-01's cache-clear block, add the start/stop dispatch for this flag — mirror of the existing `web_process_render_worker_enabled` block (~L818-832: lazy import → clear cache → `startHermesWorkerDevDrainer()` / `stopHermesWorkerDevDrainer()` per the new value), plus the delete-path stop (env-default fallback). Without this, flipping the flag requires a web restart — the render-worker precedent exists precisely to avoid that.

Test: flag OFF → no ticks; flag ON → claims and delegates to handlers (fake in-memory worker_jobs table pattern from `inlineRenderWorker.test.ts`); updateSetting hook starts/stops the drainer (mirror the existing render-worker hook test if one exists, else assert via injected start/stop spies).

---

## 9a. IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. 115 tests across 12 files (invocation 13, collector 15,
profileStrategy 14, jobHandlers 13, workspace 6, controlPlaneClient 6, e2e
2 [image+video vs the real fake-CLI child], devDrainer 4, pairing 5 +
section-04 files + guard); hermes regression 403/29 files; typecheck
baseline unchanged.

Review found 3 BLOCKERs — all fixed:

1. **Secret leak into the Hermes child**: all spawn sites spread
   `{...process.env}`, handing DATABASE_URL/JWT_SECRET/LLM_ENCRYPTION_KEY/
   HERMES_WORKER_TOKEN to a CLI agent running attacker-influenceable
   prompts. FIXED: `buildHermesChildEnv()` allow-list (PATH, HOME,
   HERMES_HOME overlay, NO_COLOR, PYTHONUNBUFFERED) at every spawn site
   (media + control + probes) + leak tests. The control path also gained
   the HERMES_HOME isolation it was silently missing.
2. **4th trust signal (cache scan) structurally dead**: assertConfined
   checked forbiddenRoots before allowedRoots while cacheDirs live under
   the job's own profile home (nested in profileRoot) → every cache
   candidate rejected. FIXED: allowedRoots first; forbiddenRoots only
   guards paths outside allowed roots (i.e. other connections' profiles).
3. **Presigned PUT result discarded**: fetch doesn't throw on 4xx/5xx, so
   a failed upload still called completeArtifact → job "completed" with no
   bytes. FIXED: ok-check + bounded retry + HERMES_UPLOAD_FAILED.

Plus: structured logger wired into main.ts + createJobHandlers (job-level
failures were silently no-op'ing through NOOP_LOGGER); claim gated on
activeCount() < maxConcurrent (was out-claiming its own cap → lease
expiry/duplicate work); pre-spawn reference-format failure now
HERMES_OUTPUT_INVALID (non-retryable — was reusing the retryable download
code for a permanent condition); connectionLocks pruned; leftover-output
guard validates before trusting.

Deviations (accepted with verified rationale):
- **main.ts does not re-register.** Registration needs a registration-JWT
  the worker can't mint without a db import or the signing secret — both
  contradict fix 1. The REAL doctor probe moved into
  `pair-hermes-worker.ts` (the privileged, DB-capable actor), whose
  registration payload now carries actual doctorOk/hermesVersion.
  Heartbeat `runtimeMetadataJson` carries doctor/version for
  observability only — verified it merges into
  `capabilitiesJson.runtimeMetadata`, NOT the `.hermesMedia` block the
  admission gate reads, so it cannot silently drive gating.
- e2e harness prepends the fixture's `generate` dispatch token via the
  injected spawnImpl (fixture file unmodified).
- Dev drainer's completeArtifact records the row but doesn't persist bytes
  (dev-only, default OFF; documented in-file).
- No isolated systemSettings router test (no precedent for that
  2440-line router); coverage via the drainer's start/stop tests.

Review trail: `../implementation/code_review/section-07-{diff,review,interview}.md`.

## 10. Acceptance checklist

- [ ] All §5 tests written first and passing; full `pnpm --dir apps/web test` green; typecheck green.
- [ ] Fake-CLI e2e smoke passes without network/DB/real Hermes.
- [ ] No file under `server/hermesWorker/` imports `db`, `queueHermesWorkerJob`, or `hermesAgentRuntime` (section-01 namespace-guard test still green).
- [ ] `file` toolset absent from default argv; enableable only via deployment config.
- [ ] No device code, auth.json content, or >4 chars of any token appears in logs, events (other than `hermes_device_code` payload), or errors.
- [ ] Workspace retention: completed deleted, failed kept 72h, logs rotated 14d, disk-pressure eviction oldest-terminal-first, `freeDiskBytes` in heartbeats.
- [ ] Unit file present in `docker/systemd/`; pairing script writes `hermes_shared_worker_id`; dev drainer default OFF.