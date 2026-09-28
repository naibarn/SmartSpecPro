# Research: Feature 135 Hermes Grok Media Worker

Date: 2026-07-16
Sources: (A) codebase exploration (implementation-level code shapes), (B) web research on Hermes Agent CLI + xAI Grok Imagine (primary docs, cited), plus two earlier session explorations (worker fabric map; VD generation surface map) whose conclusions are baked into spec.md v1.4.

---

## Part A — Codebase: code shapes to imitate

**Naming-collision warning (critical):** the codebase ALREADY has Hermes plumbing for the *agent-gateway* lane (feature 081): `queueHermesWorkerJob` (workerSchedulerService.ts L2044, jobType `external_agent_task`, gated on tenant flag `hermesAgentRuntime`, requires `preferredWorkerId`), `HERMES_RUNTIME_TYPE = "hermes_agent_gateway"`, `evaluateHermesRolloutReadiness` (shared/featureFlags.ts L798). The new media feature must use distinct names (e.g. `queueHermesMediaJob`, flag `hermesMediaWorker`) and must not repurpose these.

Confirmed NOT existing yet (to build): `hermes_provider_connections` table, `hermesConnections` router, `HermesConnectionPicker.tsx`, `hermes_` taskId branch, hermes media enqueue fn, hermes in-server/shared worker, Worker App hermes runtime module, hermes media_models seed.

### A1. Enqueue pattern (template: `queueVerticalDramaFfmpegAssemblyJob`, workerSchedulerService.ts L1066)

```ts
export async function queueVerticalDramaFfmpegAssemblyJob(
  rawInput: QueueVerticalDramaFfmpegAssemblyJobInput,           // contract + {tenantId, requestedByUserId?, priority?, idempotencyKey?}
  deps: { repo?: WorkerSchedulerRepository } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }>
```
- Strips queue-only fields → `contractSchema.parse(corePayload)`; contract type frozen in `shared/workerRuntime.ts`.
- Idempotency: `rawInput.idempotencyKey ?? build...IdempotencyKey(input)` = `${JOB_TYPE}:${kind}:${ownerKey}:${suffix}:${sha256(payload).slice(0,32)}`; dedupe via `repo.findJobByIdempotencyKey(tenantId, key)` → `{created:false, job:existing}`.
- insertJob values of note: `runtimeType`, `requestedBySystemComponent`, `status:"queued"`, `statusReason`, `priority` (default 25), `resourceProfile`, `capabilityRequirementsJson: { capabilityFamilies:[...], preferredWorkerId }` (NEVER caller-overridable — anti-mis-claim), `inputJson` (parsed contract), `instructionsJson: { intent, requiredProgressStages:[...] }`, `timeoutSeconds`, `retryPolicyJson: {maxAttempts, backoffSeconds}`, `idempotencyKey`.
- `WorkerSchedulerRepository` = `{ findJobByIdempotencyKey, findWorkerById, insertJob, findActiveRemotionPreviewJobForUser }`; tests inject vi.fn() repo — no DB.
- **Billed variant template**: `queueDesktopVideoAssemblyJob` (~L871) — takes `reserveCredits?: typeof reserveWorkerJobCredits`, `getFeatureFlags?` in deps; checks kill-switch + tenant flag; writes `workerBilling` block into `instructionsJson`.
- Job polling/projection surface: `workerJobMonitorService.ts` — `listUserWorkerJobs` (L499) → `UserWorkerJobSummary[]`, `getUserWorkerJobDetail` (L526) → summary + `events: SafeWorkerJobEvent[]` + `outputs: SafeWorkerOutputRef[]`, `cancelQueuedUserWorkerJob` (L553); exposed via `routers/workerJobs.ts`.

### A2. In-server worker (template: `inlineRenderWorker.ts` + `renderWorkerSettings.ts`)

- `runInlineRenderWorkerTick(deps)` (L180) — pure testable drain pass; deps `{ db?: Pick<typeof db,"select"|"update">, getEnabled?, runJob? }`.
- Claim = **direct DB, not HTTP**: SELECT queued by jobType ordered `priority DESC, createdAt ASC` → atomic `UPDATE ... WHERE id=? AND status='queued' RETURNING` (0 rows = lost race → continue). Terminal write guarded `WHERE status='running'` (never clobbers concurrent cancel).
- Concurrency via env `SMARTSPEC_INLINE_RENDER_CONCURRENCY` (default 1); `POLL_INTERVAL_MS=3000`; `startInlineRenderWorker()/stop...` idempotent; timer `.unref()`.
- Boot: `_core/index.ts` L1607-1618 — lazy import, flag check, try/catch so failure never blocks startup.
- Toggle: `renderWorkerSettings.ts` — TTL cache 30s (`cachedEnabled/cacheExpiresAt/refreshPromise` trio), `system_settings` category `infrastructure` key `web_process_render_worker_enabled`, env fallback, default OFF; `clearRenderWorkerSettingsCache()`.
- Hook: `routers/systemSettings.ts` `updateSetting` L818-832 matches category+key → clears cache + start/stop worker; parallel delete-path hook L751-767. **Add a matching block for the hermes worker toggle.**
- NOTE: spec 135 §8 requires the SHARED hermes worker as a separate systemd unit (not in-web-process). The inline pattern is still the template for the worker's internal tick/claim loop, run inside the new unit's process; an optional in-web-process mode mirrors inlineRenderWorker exactly (admin-flagged, default OFF, dev-only).

### A3. MCP connections (template for `hermes_provider_connections` + `hermesConnections` router + picker)

- Schema `userMcpConnections` (schema.ts L1633): id varchar(36) PK gen_random_uuid(), tenantId/ownerUserId cascade FKs, status varchar(32) default "connected", providerAccountLabel/Hash, tokenExpiresAt, defaultForImage/defaultForVideo booleans.
- **Partial unique default indexes (exact pattern to copy):**
```ts
uniqueIndex("user_mcp_connections_default_image_unique")
  .on(t.tenantId, t.ownerUserId, t.providerTemplateId)
  .where(sql`default_for_image = true AND status IN ('connected','requires_reauth','error')`)
```
- Router `mcpConnections.ts`: procedures listProviderTemplates, listConnections, startOAuth, completeOAuth, reconnect, disconnect, testConnection, updateDefaults, listShares, updateShare, listUsage (+admin getProviderConfig/saveProviderConfig). Tenant helper `tenantIdFromCtx(ctx) = String(ctx.tenantId ?? ctx.user.currentTenantId ?? null)`. Service `listMcpConnections` enforces `tenantRequired` + `ownerUserId=? AND revokedAt IS NULL`; shared visibility joins `mcpConnectionGroupShares`+`groupMembers`. Returns `SafeMcpConnection { id, providerKey, status, defaultForImage/Video, connectionScope:"personal"|"shared", sharedGroupId?, allowedAssetTypes? ... }`.
- Picker `McpConnectionPicker.tsx`: props `{ value, sharedGroupId?, onChange, onSharedGroupChange?, assetType, providerKey? }`; query `trpc.mcpConnections.listConnections.useQuery(undefined,{retry:false})`; filters status==="connected" + assetType; option value `` `${id}:${sharedGroupId ?? "personal"}` ``; auto-select when exactly 1; empty state links `/settings?tab=integrations`.

### A4. MCP media task projection (template for `hermesMediaAdapter` + `hermes_` getTask branch)

- `submitMcpMediaGeneration(request): Promise<MediaTask>` (mcpMediaAdapter.ts L921) — idempotency-locked; taskId `mcp_${sha256(tenantId:userId:idempotencyKey).slice(0,32)}` or `mcp_${randomUUID()}`.
- `getMcpMediaTask(taskId, userId)` (L1109) — memory map → DB `WHERE id=? AND userId=?` → `refreshMcpMediaTaskStatus(rowToMediaTask(row))`.
- `MediaTask` projection (rowToMediaTask L1452): `{ id, taskId?, userId, mediaType, status, model, prompt, parameters, resultUrl?, resultData, errorMessage?, creditsUsed:0, createdAt/startedAt/completedAt ISO }` — **`resultUrl` singular**; statuses `"processing"|"pending"|"submitted"|"completed"|"failed"|"requires_reauth"`.
- `mediaGenerationService.getTask` (L2776) branches `taskId.startsWith("mcp_")` → requires numeric userId from auditContext → `getMcpMediaTask`; else HTTP to media gateway. **Insert `hermes_` branch here.**
- Stale reconciler bootstrap pattern: `reconcileStaleMcpMediaTasks` (L1603) + `startMcpStaleMediaTaskReconciler`/`stop...` (L1649/1669) wired in `_core/index.ts`.
- `reconcileTaskCredits({task, userId})` (routers/media.ts L671) → `{adjusted, difference, action:"refund"|"charge"|"none"}`; Redis-idempotent `credit:reconciled:${task.id}` 24h; reads `__reserved_credits` from `parameters.extraParams`; failed → full refund; completed+actual_duration → delta charge/refund via `getModelWithPricing`. Called fire-and-forget (L3498).

### A5. Worker App (apps/worker-app) — module map + Hermes runtime insertion points

| Module | Role |
|---|---|
| `commands.rs` (2672 ln) | all #[tauri::command]: settings, OAuth device-code connect, runtime install, worker loop start/stop, doctor |
| `control_plane.rs` | registration payload builder; `WORKER_RUNTIME_TYPE = "desktop_zeroclaw_managed"` (L11); routes `/api/workers/register`, `/heartbeat`, `/api/worker-jobs/claim` |
| `worker_control_plane.rs` | heartbeat/claim/job-event/artifact HTTP client; `WorkerClaimRequest {maxJobs, capabilityHints}`; 3-step artifact upload (init → presigned PUT → complete) with token-refresh retry |
| `worker_loop.rs` (1970 ln) | poll loop: heartbeat → claim (watchdog) → execute (active-heartbeat during run) → upload artifacts |
| `worker_executor.rs` | `HYPERFRAMES_JOB_TYPE="hyperframes_final_composite"`; dispatch guard on `job.job_type`; `prepare_hyperframes_execution_plan` + runtime-ready guard; progress stage consts |
| `runtime_manifest.rs` | `RuntimePackManifest`, `DoctorSummary {status:"ready"|"degraded"|"blocked", checks}`, installed-vs-bundled path resolution |
| `credentials.rs` | Ed25519 device-proof, token storage |
| `src/main.tsx` (React, single file) | flat state-driven UI polling `worker_app_get_executor_state`; `ExecutorState {status:"idle"|"polling"|"running"|"paused"|"error", logTail, ...}` |

- Runtime install pattern: `worker_app_install_runtime_pack` (commands.rs L1342) → `fetch_runtime_manifest(server_url, runtime_id, channel)` (runtime_id e.g. "hyperframes-windows-x64") → `manifest.allowed` gate → download `archive_url` + verify `archive_sha256` → extract → doctor. **Hermes module = new runtime_id ("hermes-windows-x64" etc.), new doctor, new job_type + prepare_*_execution_plan + dispatch arm, capabilitiesJson advertisement gated on doctor ready.**
- Registration `capabilitiesJson.hyperframes.{capability, advertised, reason}` gated on doctor status — copy shape for `capabilitiesJson.hermesMedia`.
- Rust tests: in-file `#[cfg(test)]` modules per file; fixtures build `ClaimedWorkerJob {job_type: ...}`.

### A6. Systemd unit template (`docker/systemd/smartspec-web.service`)

`[Unit]` After/Wants + PartOf=smartspec.target + StartLimit*; `[Service]` Type=simple, User=dev, WorkingDirectory, inline `Environment=` + `EnvironmentFile=-...apps/web/.env` (optional-`-` prefix), ExecStartPre port-free wait, ExecStart npx tsx, ExecStartPost healthcheck curl, **MemoryHigh/MemoryMax/MemorySwapMax, KillMode=mixed, TimeoutStopSec=15s**, Restart=on-failure + RestartSec/Steps/MaxDelaySec, SyslogIdentifier; `[Install] WantedBy=smartspec.target`. Service management via run-services.sh (`systemd_available`, orphan-process cleanup) + scripts/install-autostart-v2.sh.

### A7. Test conventions

- Vitest config `apps/web/vitest.config.ts`; service tests in `server/services/__tests__/*.test.ts`; router tests in `server/routers/__tests__/*.test.ts`.
- Scheduler tests: inject `repo` with vi.fn(), fixture factory `buildInput()`, assert on insertJob args — no DB.
- Inline worker test: fake in-memory worker_jobs table with real WHERE/ORDER-BY semantics; `vi.mock("drizzle-orm")` tags eq/and/asc/desc; `vi.mock("../../db")`; call `runInlineRenderWorkerTick({db,getEnabled,runJob})` directly.
- Existing fabric tests to extend: `workerSchedulerService.test.ts`, `inlineRenderWorker.test.ts`, `monitoring.workerFleet.test.ts`.
- Rust: `#[cfg(test)]` in-file, e.g. `worker_loop.rs` L1837 stale-lease test.

### A8. Feature flags — two mechanisms

1. **Tenant flags** (`tenants.featureFlags` JSON): defined in `shared/featureFlags.ts` (`ALLOWED_FEATURE_FLAGS`, `FEATURE_FLAG_DEFAULTS`), read via `getTenantFeatureFlags(tenantId)`; existing `hermesAgentRuntime` flag lives here (agent gateway — do not reuse). New tenant flag: `hermesMediaWorker` (+ per-scope flags per spec §18).
2. **Global admin toggles** (`system_settings` + TTL cache): `renderWorkerSettings.ts` template; hook in `systemSettings.updateSetting`.

### A9. media_models seeding

- Seed scripts per provider family: `apps/web/scripts/seed-media-models-*.ts`; upsert `ON CONFLICT ("modelId") DO UPDATE` preserving `isEnabled`. New: `seed-media-models-hermes-grok.ts`.
- MCP row configJson template (`buildMcpMediaModelConfigJson`, seed-media-models-mcp-providers.ts L1907): `{ transport:"mcp", provider, providerModelId, generateType, supportsReferenceImages, referenceInputs, referenceImageLimit, mcp:{providerKey, providerModelId, toolName, argumentShape, defaultParams}, inputFields:[...] }`. Hermes rows: `transport:"hermes_worker"` + `hermes:{...}` block.
- Transport resolution today: `server/services/mediaTransportResolver.ts` returns `{transport:"mcp"}` (L121) vs `{transport:"gateway_api"}` (L64), enforces `mcpConnectionId requires transport=mcp` (L61); plus `shared/mediaModelTransport.ts` `resolveMediaModelTransportConfig`. Both gain the third value.

---

## Part B — Web research: Hermes Agent CLI + xAI Grok Imagine

### B1. Install + pinning
- PyPI package `hermes-agent`, latest **0.18.2** (2026-07-08); pin exact (`pip install hermes-agent==0.18.2` / uv). Python **>=3.11,<3.14**. Installers: install.sh (Linux/macOS/WSL2), install.ps1 (Windows). OS: Linux/macOS/Windows(+WSL2)/Termux. `hermes update` self-upgrades — do NOT use in production workers (pin instead). Release cadence 1–2 weeks, 0.x = no semver stability; same-day patches common. [pypi.org/project/hermes-agent; hermes-agent.nousresearch.com/docs/getting-started/installation]

### B2. xAI OAuth
- `hermes auth add xai-oauth [--no-browser]` → prints verification URL + user code, polls until approved (short expiry). Token at `~/.hermes/auth.json`, auto-refresh (proactive + on-401); invalid refresh → re-auth. Logout: `hermes auth logout xai-oauth`; also `hermes auth list` / `hermes auth status <provider>`. Eligible: SuperGrok or X Premium+; docs explicitly warn some tiers get 403 on API use after successful login (fallback = XAI_API_KEY, out of V1 scope). Device-code output format is UNDOCUMENTED — parse defensively. [docs/guides/xai-grok-oauth]

### B3. Non-interactive CLI
- One-shot: `hermes chat -q "..."`; **script-pure: `hermes -z "..."`** — "single prompt in, final response text out, nothing else on stdout or stderr" (prefer for the adapter). Flags: `--provider`, `-m/--model`, `-t/--toolsets csv` (comma, no spaces), `-Q/--quiet`, `--ignore-user-config`, `--safe-mode`. No global JSON output mode → rely on our SMARTSPECPRO_RESULT markers + filesystem scan. Exit codes for chat undocumented → treat exit code as advisory only. Config `~/.hermes/config.yaml` (`hermes config show|path|edit`).
- **Isolation (confirms spec §8.2 options): `HERMES_HOME` env var overrides `~/.hermes`; NATIVE PROFILES: `hermes profile create <name> [--clone]`, `hermes profile use <name>`, per-run `hermes -p <name> ...`; profile homes at `~/.hermes/profiles/<name>`.** Model override env `HERMES_INFERENCE_MODEL`. [reference/cli-commands; user-guide/cli]

### B4. Toolsets + media tools
- `image_gen` → `image_generate`; `video_gen` → `video_generate`; `file` toolset = read_file/write_file/patch/search_files. Both media toolsets **opt-in** AND **capability-gated** (tools only appear when backend credentials configured — probe must authorize first or it false-negatives). Video backends are plugins (`plugins.enabled` + `hermes tools` to inspect): xAI Grok-Imagine, FAL Veo 3.1, Pixverse v6, Kling O3. Image backends incl. xAI Grok Imagine editing via `grok-imagine-image-quality` under xai-oauth.
- `video_generate` params: prompt, image_url (omit = t2v), reference_image_urls, duration, aspect_ratio, resolution, negative_prompt, audio, seed, model. `image_generate`: prompt, image_url (edit), reference_image_urls (backend-dependent), aspect landscape|square|portrait; config `image_gen.model`, `use_gateway`.
- **Output materialization: tools return HTTP URL or absolute path; base64 saved to `$HERMES_HOME/cache/images/` and `/cache/videos/`; results surfaced as `MEDIA:<url>` tags; hosted URLs materialized to local cache.** → adapter must scan BOTH the job workspace AND the profile cache dirs, and parse MEDIA: tags, in addition to our result-marker block. [reference/toolsets-reference; developer-guide/image-gen-provider-plugin; video-gen-provider-plugin; user-guide/features/image-generation]

### B5. xAI Grok Imagine constraints (as of 2026-07)
- Multi-image edit: **≤3 source images**, model `grok-imagine-image-quality`, output aspect defaults to first input. [docs.x.ai multi-image-editing]
- Reference-to-video: model `grok-imagine-video` only (NOT v1.5); ≤7 refs per third-party sources (primary docs show 3 in examples, no explicit cap) → runtime probe; ≤10s with refs.
- Image-to-video: single start image; 1080p is i2v-only on v1.5.
- Duration: API range 1–15s; editing output ≤8.7s. Aspect: 1:1, 16:9(default), 9:16, 4:3, 3:4, 3:2, 2:3. Resolutions 480p(default)/720p/1080p. Async API `request_id` + poll (`pending|done|expired|failed`). Pricing: video $0.050/s, v1.5 $0.080/s; 10 rps. Native audio: likely (v1.5 lip-sync per secondary sources) but UNVERIFIED in primary docs → probe; treat audio stream as allowed-but-optional (matches spec §11.5 note).

### B6. Runtime-probe items (feed capability probe design — spec §12.2)
1. Device-code stdout format of `auth add xai-oauth --no-browser`.
2. Exit-code semantics of `hermes -z` / `chat -q`.
3. Exact stdout media result format (`MEDIA:<url>` tags) + cache paths.
4. Whether xai-oauth subscription actually authorizes image_generate/video_generate (tier 403 risk).
5. ref2v max refs (7?) and i2v single-start-frame — verify live.
6. Native audio in video output + Hermes `audio` param semantics.
7. Duration ceilings per model/mode.
8. Grok model IDs exposed inside Hermes' xAI video plugin (`hermes tools` after auth).
9. Capability-gating: configure credentials BEFORE checking tool availability.

### B7. Decisions this research locks in for the plan
- Pin `hermes-agent==0.18.2` (venv-per-installation via uv, Python 3.11).
- Prefer **native Hermes profiles** (`-p <connection-profile-name>` with profile homes under an isolated `HERMES_HOME` root) as the primary isolation strategy; `HOME`/`HERMES_HOME` env isolation as fallback — matching spec §8.2's "verify before assuming flags" rule, now verified.
- Prefer `hermes -z` over `chat -q` for the adapter (cleaner stdout), keep `-q` as fallback.
- Output collection must scan workspace + `$HERMES_HOME/cache/{images,videos}` + parse `MEDIA:` tags + our result-marker block (4 signals, in that trust order: marker → workspace → MEDIA tags → cache).
- Entitlement probe (`XAI_ENTITLEMENT_RESTRICTED` path) is mandatory in the connect flow — the 403-after-login case is documented as real.

---

## Testing context (existing setup)

- apps/web: **Vitest** (`pnpm test` / `pnpm test:coverage`), config `apps/web/vitest.config.ts`; conventions in Part A7.
- python-backend: pytest (80% coverage enforced) — not expected to change in this feature (no Python surface).
- apps/worker-app: Rust `cargo test`, in-file `#[cfg(test)]`; React UI has no test harness today (flat main.tsx).
- Worktree caveat (from project memory): worktrees lack node_modules — symlink from main checkout; run vitest from apps/web, not root.
