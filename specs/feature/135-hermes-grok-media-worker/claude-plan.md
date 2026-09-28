# Implementation Plan: Feature 135 Hermes Grok Media Worker

Date: 2026-07-16
Inputs: `claude-spec.md` (synthesis), `spec.md` v1.4 (normative requirements), `claude-research.md` (code shapes + Hermes CLI facts), `claude-interview.md` (4 product decisions)
Scope: spec.md phases 1–4 (shared server worker + private Worker App worker, all 10 VD surfaces + 2 fail-closed remediations)

---

## 1. What we are building and why

SmartSpecPro generates images/videos today through two transports: the
`gateway_api` path (kie.ai/fal.ai etc., billed in platform credits) and the
`mcp` path (user-connected higgsfield/magnific accounts). This feature adds
a third transport, **`hermes_worker`**: jobs run on a worker machine that
drives the **Hermes Agent CLI** (pinned `hermes-agent==0.18.2`), which holds
an **xAI OAuth session** for a connected Grok account (SuperGrok / X
Premium+). Generation cost is paid by that Grok subscription, not platform
credits (except a small admin-configured platform fee on shared-pool jobs).

Two worker deployments ship together:

- **Shared server worker** — a new systemd unit `smartspec-hermes-worker.service`
  on the existing production host, hosting many isolated Grok connection
  profiles (admin-provided shared accounts AND users' personal accounts),
  protected by strict admission control so it can never degrade the web
  service.
- **Private worker** — a new Hermes runtime module inside the existing Tauri
  **Smart AI Hub Worker App** (`apps/worker-app`, currently render-only),
  bound to its owner: the Grok token never leaves the user's machine and
  only the owner's jobs are routed there. Windows first, then macOS.

Everything reuses the existing **worker fabric** (`workers`, `worker_jobs`,
`worker_heartbeats`, `worker_job_events`, `worker_artifacts`, the
`/api/workers/*` + `/api/worker-jobs/*` control plane, lease-based claim) —
no new queue infrastructure. The feature appears to users as new rows in the
normal media model picker ("Grok via Hermes"), integrated into **all ten**
Vertical Drama generation surfaces plus Media Studio.

**Critical namespace rule:** the codebase already contains an UNRELATED
Hermes lane for agent-gateway work (`queueHermesWorkerJob`, tenant flag
`hermesAgentRuntime`, jobType `external_agent_task`). Every new symbol in
this feature uses the `hermesMedia` / `hermes_media` namespace. Nothing from
the agent-gateway lane is modified or reused except the
`hermes_agent_gateway` runtime-type enum value (registered type of the new
shared worker).

---

## 2. Architecture overview

```text
Web client (model picker + HermesConnectionPicker + connect flow UI)
   │ tRPC
   ▼
apps/web server
   ├─ hermesConnections router ──► hermesConnectionService ──► hermes_provider_connections (new table)
   ├─ media.ts / VD transport helpers ──► transport === "hermes_worker"
   │      └─► hermesMediaScheduler (admission control → fee reserve → worker_jobs INSERT)
   ├─ mediaGenerationService.getTask("hermes_…") ──► hermesMediaAdapter (projection from worker_jobs)
   └─ /api/workers/* control plane (existing) + NEW reference-URL mint/refresh endpoint
   │
   │  claim / heartbeat / events / artifacts (existing HTTP contract, worker bearer token)
   ▼
┌───────────────────────────────┐   ┌───────────────────────────────────┐
│ Shared server worker          │   │ Worker App (apps/worker-app)      │
│ apps/web/server/hermesWorker/ │   │ NEW hermes runtime module (Rust)  │
│ own process via systemd unit  │   │ beside HyperFrames render          │
│ runtimeType hermes_agent_gw   │   │ runtimeType desktop_zeroclaw_mgd  │
└──────────────┬────────────────┘   └──────────────┬────────────────────┘
               └────────── Hermes CLI adapter ─────┘
                 pinned hermes-agent==0.18.2, per-connection profile,
                 `hermes -z` + toolsets image_gen|video_gen + file
                           │
                           ▼
                 xAI OAuth → Grok Imagine → outputs → artifact upload
                           → media_assets + library_items
```

Job identity: `worker_jobs.jobType ∈ {hermes_media_image_generate,
hermes_media_video_generate}` + required claim capability
`hermes_media` (remotion-precedent gating). `runtimeType` follows the
assigned worker, never the feature. Task polling: taskId
`hermes_<workerJobId>` handled by a new branch in
`mediaGenerationService.getTask`.

---

## 3. Shared constants and contracts (`apps/web/shared/`)

**File: `shared/workerRuntime.ts` (extend).** Add:

```ts
export const HERMES_MEDIA_IMAGE_JOB_TYPE = "hermes_media_image_generate";
export const HERMES_MEDIA_VIDEO_JOB_TYPE = "hermes_media_video_generate";
export const HERMES_CONNECTION_AUTH_JOB_TYPE = "hermes_connection_authorize";
export const HERMES_CONNECTION_PROBE_JOB_TYPE = "hermes_connection_probe";
export const HERMES_CONNECTION_DISCONNECT_JOB_TYPE = "hermes_connection_disconnect";
export const HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY = "hermes_media";
export const HERMES_MEDIA_CAPABILITY_FAMILIES = ["hermes-media-generation"];
```

**File: `shared/hermesMedia.ts` (new).** Owns the frozen job contracts and
error codes so web server, shared worker, and tests share one source:

```ts
export type HermesMediaOperation =
  | "image.generate" | "image.edit"
  | "video.generate" | "video.image_to_video" | "video.reference_to_video";

export interface HermesMediaJobContract {
  contractVersion: 1;
  operation: HermesMediaOperation;
  connectionId: string;
  prompt: string;
  settings: { model: string; aspectRatio?: string; resolution?: string;
              outputCount?: number; durationSeconds?: number | null };
  references: Array<{ assetId: string; index: number; role: string;
                      label: string; sha256: string }>;   // NO URLs (claim-time minting)
  entity?: { type: string; id: string; [k: string]: unknown };
  storage?: { libraryFolderId?: string };
  traceId: string;
}

export interface HermesConnectionCapabilityManifest { /* per spec §12.2:
  hermesVersion, probedAt, operations map {enabled, maxReferences?,
  maxOutputs?, reason?}, models {image[], video[]} */ }

export const HERMES_MEDIA_ERROR_CODES = [/* the 22 codes of spec §13.7 */] as const;
export type HermesMediaErrorCode = typeof HERMES_MEDIA_ERROR_CODES[number];
export function hermesErrorCopy(code: HermesMediaErrorCode): { th: string; en: string; retryable: boolean };
// Canonical error wire convention (client-safe, no trpc import): servers
// throw TRPCError with message = formatHermesErrorMessage(code, detail?)
// ("[HERMES_X] …" prefix — TRPCError.cause does not serialize to clients);
// the client parses it back with parseHermesErrorMessage.
export function formatHermesErrorMessage(code: HermesMediaErrorCode, detail?: string): string;
export function parseHermesErrorMessage(message: string): HermesMediaErrorCode | null;
```

**File: `shared/mediaModelTransport.ts` (extend).** Transport union becomes
`"mcp" | "gateway_api" | "hermes_worker"`. `resolveMediaModelTransportConfig`
reads `configJson.transport === "hermes_worker"` and returns
`{ transport: "hermes_worker", providerKey: "hermes-grok", providerModelId,
creditSource: "provider_account" }`. `server/services/mediaTransportResolver.ts`
gains the matching branch and the validation "hermesConnectionId requires
transport=hermes_worker" (mirror of the existing mcpConnectionId rule).

**File: `shared/featureFlags.ts` (extend).** New tenant flag
`hermesMediaWorker` (default false) in `ALLOWED_FEATURE_FLAGS` +
`FEATURE_FLAG_DEFAULTS`. Global admin toggles (system_settings, section 12):
`hermes_worker_enabled`, `hermes_worker_shared_pool_enabled`,
`hermes_worker_server_personal_enabled`, `hermes_worker_private_enabled`,
`hermes_worker_video_enabled`, plus limit overrides,
`hermes_shared_pool_fee_credits`, `hermes_worker_min_version` (minimum
supported Hermes CLI version across the fleet),
`hermes_shared_worker_id` (identity of the paired shared unit, written by
the pairing script), and `web_process_hermes_worker_enabled` (dev-only
in-web-process drainer, default OFF). All read through
`apps/web/server/services/hermesWorkerSettings.ts` (TTL-cache pattern from
`renderWorkerSettings.ts`) with cache-clear hooks in
`systemSettings.updateSetting`.

---

## 4. Database: `hermes_provider_connections`

**File: `apps/web/drizzle/schema.ts` (extend).** New table modeled on
`userMcpConnections` (research A3), camelCase columns per spec §10.1:
`id` (varchar 36 PK, gen_random_uuid), `tenantId`, `ownerUserId`, `scope`
(pgEnum `hermes_connection_scope`: server_shared | server_personal |
private_worker), `providerType` ("xai_grok"), `adapterType` ("hermes_cli"),
`authenticationType` ("oauth_device_code"), `status` (pgEnum
`hermes_connection_status`: pending | authorized | reauth_required |
entitlement_restricted | disconnected | error), `assignedWorkerId` (FK
workers, nullable), `profileReference`, `accountLabel`, `accountHint`,
`entitlementStatus`, `capabilitiesJson` (jsonb), `defaultForImage` /
`defaultForVideo` (partial-unique indexes copied from the MCP pattern:
`.on(tenantId, ownerUserId).where(sql\`default_for_image = true AND status IN
('authorized','reauth_required','entitlement_restricted')\`)`),
`dailyJobQuota` (int, null), `metadataJson` (jsonb: consent timestamp, last
error), timestamps (`createdAt`, `authorizedAt`, `lastProbeAt`,
`disconnectedAt`). Plain indexes on (tenantId, ownerUserId, status) and
(tenantId, scope, status). Types `HermesProviderConnection` /
`InsertHermesProviderConnection`.

**Forbidden by review checklist:** no token/secret/password/auth.json
columns of any kind.

**Migration:** run `pnpm db:push` immediately after the schema edit; verify
journal entry; row-count check not needed (new table). This is a purely
additive migration (rollback = flags off, table stays).

---

## 5. Connection service + tRPC router

**File: `apps/web/server/services/hermesConnectionService.ts` (new).**
Modeled on `mcpConnectionService`. Responsibilities and key signatures:

```ts
listHermesConnections(params: { tenantId: string; userId: number; assetType?: "image"|"video" }): Promise<SafeHermesConnection[]>
// personal + private rows owned by user; server_shared rows for the whole tenant.
// SafeHermesConnection = { id, scope, status, accountLabel, accountHint,
//   defaultForImage, defaultForVideo, capabilitySummary, assignedWorkerOnline: boolean, ... } — never tokens.
// This is ALSO the client's readiness source: the model picker derives
// "Grok via Hermes available/disabled(reason)" from listConnections plus a
// companion getAvailability query ({ flagsEnabled, videoEnabled }) exposed
// on the same router — no separate readiness service.

startConnect(params: { tenantId; userId; scope; workerId?; label?; consentAcknowledged: boolean }): Promise<{ connectionId }>
// validates scope flag + role (server_shared requires admin), requires consent,
// creates row status=pending, resolves target worker, enqueues
// HERMES_CONNECTION_AUTH_JOB_TYPE pinned to that worker.
// Target-worker resolution: server scopes read the shared unit's worker id
// from system_settings key `hermes_shared_worker_id` (written once by the
// pairing script — never guessed from runtimeType, which the unrelated
// agent-gateway lane also uses) and verify it online; private_worker uses
// params.workerId, which must be an online worker owned by the caller
// (auto-selected when they own exactly one).

getConnectStatus(params): Promise<{ status; verificationUrl?; userCode?; expiresAt?; errorCode? }>
// reads the auth job's worker_job_events for the device-code payload.

setDefault / disconnect / probe / adminSetQuota / adminDisable — per spec §12.0.
```

Ownership rules enforced in the service (tenantRequired + ownerUserId
match, admin-only mutations for server_shared), mirroring
`listMcpConnections`. On terminal auth-job success the service persists
`accountHint`, `capabilitiesJson`, `authorizedAt`, status `authorized`; on
xAI 403 during probe → `entitlement_restricted`.

**File: `apps/web/server/routers/hermesConnections.ts` (new).** Thin tRPC
wrapper (procedures per spec §12.0: listConnections, getConnection,
startConnect, getConnectStatus, setDefault, disconnect, probe, adminList,
adminSetQuota, adminDisable). Register as `hermesConnections` in
`routers.ts` next to `mcpConnections`. Zod input schemas; every procedure
`protectedProcedure` except admin* (`adminProcedure`).

---

## 6. Connection control jobs (OAuth device-code through the fabric)

Control jobs are ordinary `worker_jobs` rows (cpu_light, tight timeout,
1-concurrent-per-connection, exempt from the media rate limiter):

- **`hermes_connection_authorize`** — inputJson `{ connectionId,
  profileReference, timeoutSeconds }`. Worker-side handler creates the
  Hermes profile (`hermes profile create conn_<id>`), spawns
  `hermes -p conn_<id> auth add xai-oauth --no-browser`, parses stdout
  defensively for verification URL + user code (format undocumented — regex
  for URL + code-like token, raw line as fallback payload), posts them as a
  `worker_job_events` event `{ eventType: "hermes_device_code",
  payloadJson: { verificationUrl, userCode, expiresAt } }`, keeps the child
  alive while Hermes polls, and finishes the job on success (event
  `hermes_authorized` with accountHint parsed from `hermes auth status`) or
  timeout/denial (failureReason typed). Device-code payloads must never be
  written to worker logs.
- **`hermes_connection_probe`** — runs `hermes auth status xai-oauth`,
  `hermes tools` (post-auth, because media tools are credential-gated), and
  a flagged optional dry image generation; produces the
  `HermesConnectionCapabilityManifest` in outputJson. Runs after authorize,
  after worker upgrade, and on demand.
- **`hermes_connection_disconnect`** — `hermes auth logout xai-oauth` in the
  profile + secure profile directory removal; job completion marks the row
  disconnected.

Server side: a small `hermesConnectionJobs.ts` service owns
enqueue-and-track for these three types and the settlement logic that maps
job outcomes onto connection rows (called from a completion hook in the
worker-jobs monitor path, plus lazily on `getConnectStatus` reads).

---

## 7. Admission control + scheduler

**File: `apps/web/server/services/hermesMediaAdmission.ts` (new).**
Redis-backed limiter following the existing custom limiter family, exposing
one function the scheduler calls:

```ts
checkHermesMediaAdmission(params: { tenantId; userId; connection: HermesProviderConnection;
  operation; batchSize?: number }): Promise<{ ok: true } | { ok: false; code: HermesMediaErrorCode; retryAfterSeconds?: number }>
```

Enforces spec §9: per-connection running=1 (counted from worker_jobs),
queued-per-user (default 8), queued-per-tenant shared pool (20), sliding
submission windows (10/user, 60/tenant per 10 min), shared-connection
`dailyJobQuota`, and the **limit-coherence invariant** (config write path
rejects queued-cap < max batch size 4). All defaults readable via a new
`hermesWorkerSettings.ts` (TTL-cache pattern copied from
`renderWorkerSettings.ts`, category `infrastructure`, keys per section 3;
cache-clear + start/stop hooks added to `systemSettings.updateSetting` and
its delete path).

**File: `apps/web/server/services/hermesMediaScheduler.ts` (new).** The
single entry point every generation surface calls:

```ts
export async function queueHermesMediaJob(
  rawInput: HermesMediaJobContract & { tenantId; requestedByUserId; priority?; idempotencyKey? },
  deps: { repo?; admission?; reserveFee?; getFlags?; now? } = {},
): Promise<{ created: boolean; taskId: string; job: WorkerJobRecord }>
```

Flow (template: `queueVerticalDramaFfmpegAssemblyJob` + billed variant):
1. flags check (global + tenant `hermesMediaWorker` + per-scope flag) —
   fail closed with `HERMES_DISABLED`;
2. resolve + authorize connection (tenant/owner/scope; status must be
   `authorized`); **single-pass resolution** — no fallback between tiers;
   for shared-pool submissions with no explicit connection, pick the
   eligible server_shared connection with lowest queue depth and quota
   headroom;
3. assigned worker must be online per heartbeat (`HERMES_WORKER_UNAVAILABLE`);
4. `checkHermesMediaAdmission`;
5. **fee (interview decision):** iff scope === server_shared and
   `hermes_shared_pool_fee_credits` > 0 → `reserveWorkerJobCredits` and
   write the `workerBilling` block into instructionsJson; other scopes
   never bill;
6. contract parse (zod, in shared/hermesMedia.ts), reference-mapping
   validation (count vs effective capability, continuous indices, unique
   labels — VD surfaces additionally run their own mapping validator before
   calling here);
7. idempotencyKey `${jobType}:${connectionId}:${sha256(contract).slice(0,32)}`,
   dedupe via repo — **against non-terminal jobs only**: a matching
   completed/failed/canceled/expired job does not block a fresh submit
   (the new row gets an attempt-suffixed key), so legitimate retries of an
   identical prompt work while double-submits of an in-flight job still
   dedupe;
8. insertJob: `runtimeType` = assigned worker's registered type,
   `workerId` pinned for private scope (null/pool for server scopes but
   still connection-pinned via capabilityRequirementsJson),
   `capabilityRequirementsJson: { capabilityFamilies:
   HERMES_MEDIA_CAPABILITY_FAMILIES, requiredClaimCapability:
   HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY, connectionId, preferredWorkerId }`,
   `resourceProfile` network_heavy (image) / long_running (video),
   `timeoutSeconds` 600 image / 1800 video, `retryPolicyJson
   { maxAttempts: 2, backoffSeconds: 30 }`, `statusReason:
   "hermes_media_scheduler"`;
9. return `taskId = "hermes_" + job.id`.

**Claim gating (edit `workerRegistryService.ts`):** inside
`claimWorkerJob`'s candidate loop, add the hermes assertion following the
`remotion_render_video` precedent: any `hermes_media_*` or
`hermes_connection_*` candidate is skipped (`continue`) unless the claim
`capabilityHints` include `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY`; plus a
connection-affinity assertion (candidate's
`capabilityRequirementsJson.connectionId` must be hosted by this worker —
resolved via the connection row's assignedWorkerId) so a user with two
machines can never cross-claim. Private binding continues to ride the
existing `filterClaimableJobsForWorker` owner check + pinned workerId.

---

## 8. Task projection + credits (`hermesMediaAdapter`)

**File: `apps/web/server/services/hermesMediaAdapter.ts` (new).** Mirrors
`mcpMediaAdapter`'s public surface but stores NOTHING new — projections are
built from worker fabric tables:

```ts
export function isHermesMediaTaskId(taskId: string): boolean;           // "hermes_" prefix
export async function getHermesMediaTask(taskId: string, userId: number): Promise<MediaTask | null>;
// loads worker_jobs row (+ latest events + artifacts), enforces
// requestedByUserId === userId (tenant-scoped), maps to the MediaTask shape
// used by mcpMediaAdapter.rowToMediaTask: status mapping
// queued|claimed|preparing→"pending", running|uploading|publishing→"processing",
// completed→"completed" (resultUrl = signed URL of the registered media asset),
// failed|expired→"failed" (errorMessage from typed failureReason),
// canceled→"failed" with errorCode HERMES_JOB_CANCELLED.
export async function cancelHermesMediaTask(taskId, userId): Promise<void>; // delegates to cancelQueuedUserWorkerJob / cancel event
```

**Edit `mediaGenerationService.getTask` (~L2776):** add the `hermes_`
branch before the gateway fallback, exactly parallel to the `mcp_` branch
(requires numeric userId from auditContext; audit-logs transport
"hermes_worker").

**Edit `reconcileTaskCredits` (routers/media.ts L671):** early branch — for
`hermes_` tasks, reconcile ONLY the reserved fee via
`reconcileWorkerJobCredits`/`refundCredits` (failed/canceled before start →
full fee refund; completed → keep fee; no per-duration math ever). The
Redis idempotency key pattern is reused unchanged. `settlePortraitCandidate`
then works for hermes tasks with no further edits (it calls getTask +
reconcileTaskCredits generically — verify in tests).

**Stale-job glue:** no new reconciler. A small completion hook in
`workerJobMonitorService` (or a 60s sweep in
`apps/web/server/services/hermesConnectionJobs.ts`) finalizes fee
reconciliation and connection-status side effects (`reauth_required` on
auth failures, `entitlement_restricted` on xAI-403-classified failures)
when hermes jobs reach terminal states via lease expiry — mirroring
`startMcpStaleMediaTaskReconciler`'s bootstrap wiring in `_core/index.ts`.

**Library finalize (the publish step).** New
`apps/web/server/services/hermesMediaFinalizeService.ts` (model:
`hyperframesLibraryFinalizeService`), invoked from the artifact-complete
path in `workerRuntime.ts` when the completed artifact belongs to a
`hermes_media_*` job:

```ts
finalizeHermesMediaArtifact(params: { job: WorkerJobRecord; artifact: WorkerArtifactRecord }): Promise<{ mediaAssetId: string; libraryItemId: string }>
// server-side re-validation (mime/size/checksum against init metadata),
// creates the media_assets row (storageKey, checksum, dimensions from
// artifact metadataJson) + library_items row (target folder from the job
// contract's storage.libraryFolderId), sets worker_artifacts.publishedItemId,
// writes generation lineage into media_assets metadata (operation, prompt,
// model, referenceAssetIds, workerJobId, hermesVersion, connectionId),
// then transitions the job publishing → completed.
```

`getHermesMediaTask`'s completed-state `resultUrl` is the signed URL of
this registered asset — the projection never points at worker-local or
provider-hosted files.

---

## 9. Reference URL minting (claim-time) + refresh endpoint

**Edit `apps/web/server/routes/workerRuntime.ts`:**
- Claim response enrichment: when a claimed job's jobType is
  `hermes_media_*`, mint short-lived presigned GET URLs for each
  `references[].assetId` (via `storagePresignGet` over `media_assets`,
  re-verifying tenant + requester ownership at mint time) and attach them
  to the returned job payload as `referenceUrls: Array<{assetId, url,
  expiresAt}>` — inputJson in the DB never contains URLs.
- New route `POST /api/worker-jobs/:jobId/references/urls` —
  lease-token-authenticated (active lease required, same auth middleware as
  events/artifacts), re-mints the URL set mid-job for retries/long
  downloads. Worker verifies each downloaded file's sha256 against the
  contract before use.

---

## 10. Shared server worker process

**Directory: `apps/web/server/hermesWorker/` (new, own process — never
imported by the web server).** Entry `main.ts`, run by the systemd unit as
`npx tsx server/hermesWorker/main.ts` from the apps/web working directory
(same checkout, separate process = separate cgroup; imports only shared/
and its own modules plus the HTTP client — no db import; it talks HTTP like
any external worker so the trust boundary stays uniform).

Modules:

- `controlPlaneClient.ts` — typed HTTP client for register / heartbeat /
  claim / events / artifact init+complete / reference-URL refresh, worker
  bearer token from env (`HERMES_WORKER_TOKEN` via systemd EnvironmentFile),
  device-proof headers reusing the documented contract (mirror of the Rust
  client's payload shapes; registration payload advertises
  `runtimeType: "hermes_agent_gateway"`, `capabilitiesJson.hermesMedia`
  gated on doctor readiness, `maxConcurrentJobs`).
- `hermesInstallation.ts` — provision/verify the pinned Hermes install
  (uv-managed venv, `hermes-agent==0.18.2`, `hermes --version` check),
  HERMES_HOME root + native-profile management
  (`ensureProfile(connectionRef)`, `removeProfile`), plus the
  provisioning-time **profile-isolation verification** (create two probe
  profiles, confirm auth state does not leak between them; on failure fall
  back to per-connection HERMES_HOME dirs — both strategies behind one
  `ProfileStrategy` interface).
- `hermesInvocation.ts` — the CLI adapter: builds the prompt envelope
  (spec §13; deterministic, references listed in order with role/label,
  result-marker block demanded), spawns
  `hermes -p <profile> -z --provider xai-oauth --toolsets
  "image_gen"|"video_gen" --ignore-user-config <envelope>` via argv array
  with cwd = job workspace, env `NO_COLOR=1 PYTHONUNBUFFERED=1`, captures
  stdout/stderr separately, enforces soft/hard/inactivity timeouts,
  graceful-term→SIGKILL cancellation.
  **Security: the `file` toolset is NOT enabled by default** — the media
  tools materialize outputs to `$HERMES_HOME/cache/{images,videos}` and
  return `MEDIA:` tags on their own, so file access only widens the
  prompt-injection blast radius (a hostile prompt could otherwise read or
  write agent-chosen paths). A per-deployment config flag can re-enable it
  if a pinned version proves to need it.
  **Flag-composition fallback:** whether `-z` composes with
  `--provider/--toolsets/-p` exactly like `chat` is probed at provisioning
  (compatibility checklist); the adapter carries a `chat -q -Q` fallback
  command template selected by that probe result.
- `outputCollector.ts` — 4-signal collection in trust order: parse
  SMARTSPECPRO_RESULT marker → scan `./output` → parse `MEDIA:<url>` tags →
  scan `$HERMES_HOME/cache/{images,videos}` (mtime within job window);
  path-confinement checks; magic-byte + dimension validation for images,
  `ffprobe` stream/duration/codec sanity for video (audio stream
  allowed-but-optional); remote URLs downloaded into the workspace first.
- `jobHandlers.ts` — dispatch by jobType: the two media handlers
  (download refs → verify sha256 → invoke → collect → upload artifacts via
  init/presigned/complete with bounded retry + token-refresh-on-401, the
  same recovery the Rust client implements → post progress events for each
  stage) and the three connection-control handlers (section 6). Per-connection local file
  lock (1 concurrent) + global max concurrency (default 2, env override).
- `workspace.ts` — job dir lifecycle under
  `/var/lib/smartspec-hermes-worker/jobs/<jobId>/` with the retention rules
  (delete on verified completion; keep 72h on failure; 14-day log rotation;
  disk-pressure eviction; freeDiskBytes into heartbeats).
- `main.ts` — register → loop { heartbeat → claim (with
  `capabilityHints: [HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY]`) → run
  handler with active-heartbeat → settle }; watchdog timeouts; SIGTERM
  drains active jobs within TimeoutStopSec.

**Systemd unit `docker/systemd/smartspec-hermes-worker.service` (new):**
copied from the smartspec-web template — `PartOf=smartspec.target`,
`After=smartspec-web.service`, `EnvironmentFile=-/home/dev/projects/SmartSpecPro/apps/web/.env`
plus `EnvironmentFile=/etc/smartspec/hermes-worker.env` (0600, holds
`HERMES_WORKER_TOKEN`), `MemoryHigh=1024M MemoryMax=1536M CPUQuota=150%`,
`Restart=on-failure`, `KillMode=mixed`, `SyslogIdentifier=smartspec-hermes-worker`.
Token provisioning: admin pairs once via the existing worker
device-code/registration flow (a small `scripts/pair-hermes-worker.ts`
helper drives it), writes the env file, and records the paired worker id
into system_settings `hermes_shared_worker_id` (the discovery key
`startConnect`/scheduler use). Docs update in the unit-install
scripts (`run-services.sh` status listing).

**Optional dev mode:** an in-web-process drainer mirroring
`inlineRenderWorker` (flag `web_process_hermes_worker_enabled`, default
OFF, documented dev-only) so local development doesn't need systemd; it
reuses `jobHandlers` with a direct-DB claim shim.

---

## 11. Generation surface integration (media.ts + all VD surfaces)

**Transport helpers.** Generalize the two byte-equivalent VD helpers —
`resolveVdCharacterMcpTransportMetadata` (verticalDramaCharacters.ts:473,
also used by locations) and `resolveVdMcpTransportMetadata`
(verticalDramaEpisodes.ts:~2955) — into transport-neutral
`resolveVdMediaTransportDecision` returning a discriminated union:

```ts
type VdTransportDecision =
  | { kind: "gateway" }
  | { kind: "mcp"; transportMetadata: MediaTaskTransportMetadata }
  | { kind: "hermes"; connectionId: string };
```

Existing MCP/gateway behavior byte-identical (existing tests must pass
unchanged); the hermes arm resolves `hermesConnectionId` from input (or the
caller's default connection) and validates it. `media.ts`'s
`generateImageAsync`/`generateVideoAsync` get the same three-way branch;
the hermes arm calls `queueHermesMediaJob` and returns the standard async
task envelope with the `hermes_` taskId, so every existing polling client
works unchanged.

**Surfaces wired through the helpers (spec §11.5 table — each an acceptance
item):** generateCharacterImage, generateCharacterSheet,
generatePortraitCandidateBatch (per-candidate jobs, serial on one
connection, batch ≤ 4), generateLocationImage, generateStartFrameImage,
generateStartFrameAngleVariations, repairShotImage,
generateShotReferenceFrameImage, generateVideoClip, generateAdBannerImage.
Each resolver only needs: accept optional `hermesConnectionId` input,
call the generalized helper, and pass reference asset ids (they already
have them) — the VD reference-mapping validator
(`findCharacterImageIndexMappingMismatches` / `VdReferenceMappingError`)
keeps running before enqueue.

**Two fail-closed remediations (committed):**
- `resolveEpisodeVideoModel` (verticalDramaEpisodes.ts:~2887): remove the
  silent `DEFAULT_MODELS.video` fallback; throw BAD_REQUEST like
  `resolveEpisodeImageModelId`; fix its doc comment; audit call sites so
  the UI surfaces model selection instead.
- Ad banner (`verticalDramaAdBanner.ts:~581` + its router): route through
  the shared helper; replace the silent `DEFAULT_MODELS.image` fallback
  with a required-model BAD_REQUEST; add a model picker to the banner UI if
  absent.

**Video specifics:** Hermes-Grok video model rows registered so
`verticalDramaVideoPromptFormatter.detectProviderFamily` resolves family
`grok` (prompt style follows the model family, not the transport); the
existing `maxReferenceImages`-driven "identity before environment" trimming
enforces the single-start-frame constraint using the value derived from the
connection manifest (effective capability = min(model row, manifest)).

---

## 12. Model catalog + capability intersection

**Seed script `apps/web/scripts/seed-media-models-hermes-grok.ts` (new),**
upsert pattern from the MCP seed script. Rows (disabled by default):
`hermes-grok/grok-imagine-image`, `hermes-grok/grok-imagine-image-quality`
(image), `hermes-grok/grok-imagine-video` (video). Display names carry the
"Grok via Hermes" distinction (never bare "Grok Imagine" — that's the
kie.ai row's name). configJson:
`{ transport: "hermes_worker", hermes: { providerType: "xai_grok",
providerModelId }, generateType, supportsReferenceImages,
referenceImageLimit (image-edit 3; video 1), aspectRatios
["9:16","16:9","1:1"], durations, inputFields[...] }`.

**Effective capability helper** (in `shared/hermesMedia.ts`):
`effectiveHermesCapability(modelRow, manifest, operation)` → min/AND
composition used by both the submit-time validator and the client form.

---

## 13. Client (web)

- **`client/src/components/media/HermesConnectionPicker.tsx` (new):** copy
  of McpConnectionPicker's shape — props `{ value: string|null; onChange;
  assetType; }`, query `trpc.hermesConnections.listConnections`, filters
  status==="authorized" + asset capability, option value = connectionId
  (+ scope badge in the label: ส่วนกลาง/ส่วนตัวบนเซิร์ฟเวอร์/เครื่องของฉัน),
  auto-select single eligible, empty state links to the connect settings
  page, worker-offline rendered as disabled row with reason.
- **Connect flow UI:** new panel `client/src/components/settings/HermesConnectPanel.tsx`
  under Settings → AI Providers → "Grok via Hermes": connection list,
  Connect button → consent notice (one-time, Thai primary) → device-code
  screen (official-URL button, copyable code, countdown, live status via
  `getConnectStatus` polling), a private-worker selector when
  scope=private_worker (lists the caller's online Worker App workers,
  auto-selected when exactly one), reconnect/disconnect/probe actions,
  capability + entitlement status display, admin sub-panel for
  server_shared (create, quota, disable) reusing adminProcedures.
- **Model picker integration:** Hermes rows appear via the normal
  `media_models` list; a "Grok via Hermes" badge + disabled-with-reason
  states driven by a light readiness query (flags + user has authorized
  connection + worker online). The gating rule mirrors MCP's
  `imageModelUsesMcp`: `modelTransport === "hermes_worker"` ⇒ show
  HermesConnectionPicker, require a selection before generate enables.
- **VD panels (spec §11.5 client list):** CharacterStockPanel and
  LocationStockPanel add `hermesConnectionId` state persisted with the
  guarded `safeStorage` pattern under new keys; StoryboardPanel adds
  `hermesConnectionId` + `onHermesConnectionChange` to its controlled prop
  contract, threaded through EpisodeWorkspace from EpisodePage;
  EpisodePage's three-layer model memory (per-episode server persistence,
  per-series localStorage default, auto-hydration effect) treats Hermes
  model ids identically — hydration additionally requires an authorized
  connection, else leaves selection empty (buttons disabled, no fallback).
  ReferenceFrameDialog + angle-variation UI inherit parent selection
  (no code beyond prop threading).
- **Error rendering:** all 22 error codes render their Thai/English copy +
  retry affordances; queue/limit rejections show retry-after.

---

## 14. Worker App Hermes runtime module (phase 4, Rust + React)

Follow the HyperFrames runtime pattern exactly (research A5):

- **Runtime provisioning:** new runtime ids `hermes-windows-x64` /
  `hermes-macos-arm64` served by the existing runtime-manifest endpoint —
  the pack bundles a uv-managed Python 3.11 + pinned `hermes-agent==0.18.2`;
  a new `scripts/build-hermes-runtime-pack.ts` assembles the archive +
  sha256 + manifest entry per OS (phase-4 deliverable — packs don't build
  themselves);
  `worker_app_install_hermes_runtime` command mirrors
  `worker_app_install_runtime_pack` (manifest.allowed gate, sha256-verified
  archive, extract, doctor). Hermes doctor checks: python present, hermes
  --version matches pin, profile root writable.
- **Job handling:** new `hermes_executor.rs` — job_type consts for the two
  media types + three control types, `prepare_hermes_execution_plan` with
  runtime-ready guard, spawn/parse/collect logic mirroring the TS adapter
  (envelope, `-z`, 4-signal collection, ffprobe via the already-bundled
  ffmpeg), per-connection profile management under the app data dir
  (0700-equivalent ACLs, excluded from logs/crash reports). Dispatch arm in
  `worker_executor.rs`; loop untouched (it already claims with
  `capabilityHints` — extend hints with `hermes_media` when the doctor is
  ready). Registration `capabilitiesJson.hermesMedia = { capability,
  advertised, reason, hermesVersion }`.
- **Minimum-version enforcement (server side):** during registration and
  heartbeat processing in `workerRegistryService`, compare the advertised
  `capabilitiesJson.hermesMedia.hermesVersion` against the
  `hermes_worker_min_version` setting; below-minimum workers get
  `hermesMedia.advertised` forced false server-side (so claim gating never
  offers them hermes jobs) and a heartbeat warning that the app UI renders
  as "update required". Applies equally to the shared unit and Worker Apps.
- **Device-code UX:** the auth control job's device-code event already
  reaches the web UI; additionally the app's React view shows current
  hermes connection status + the device code when an auth job is active
  (read from executor state), re-auth prompts, and "update required" when
  the server's minimum-version check marks the worker degraded.
- **Owner binding:** relies on existing private-mode claim filtering +
  pinned workerId + the new connection-affinity assertion (section 7);
  the Rust side re-checks connectionId affinity before executing
  (defense in depth).
- **Concurrency:** 1 hermes job at a time, render jobs unaffected
  (separate slot accounting in the loop).

---

## 15. Observability, audit, admin

- Audit events (JSONL protocol, traceId end-to-end): connection
  connect/authorize/disconnect/revoke/entitlement-restricted; job
  submit/claim/complete/fail/cancel; admission rejections with code.
- `provider_usage_log` rows for completed jobs (provider "xai-hermes",
  cost method provider_account) + shared-connection daily counters backing
  quota checks.
- Worker admin surface (existing worker fleet pages): hermes workers show
  runtime readiness + hermes version; new admin panel section for
  connections per scope, quota consumption, kill-switch states —
  a minimal read-only view deliberately pulled forward from the spec's
  phase-5 "quotas dashboard" (shared-pool operation needs quota visibility
  from day one; the full dashboard stays phase 5). Mutations live only in
  the Settings connect panel (one-writer rule).
- RenderJobsPage (worker jobs monitor) lists hermes media jobs via the
  existing `workerJobs` router with no changes beyond jobType labels.

---

## 16. Delivery order (maps to spec phases; each step lands green)

1. **Shared contracts + schema** (sections 3–4) — constants, types, error
   copy, table + migration, flags. Pure additive; deployable dark.
2. **Connections vertical slice** (5–6) — service, router, control-job
   handlers stubbed against a fake CLI, connect UI panel; shared worker not
   yet required (handlers land with the worker in step 4 but the
   service/router/tests come first).
3. **Scheduler + adapter + claim gating + reference minting** (7–9) —
   enqueue path, getTask branch, reconcile branch, workerRuntime.ts routes;
   all testable with injected repos + fake worker.
4. **Shared server worker** (10) — process, adapter, systemd unit, pairing
   script; first real end-to-end text-to-image on server_personal +
   server_shared scopes.
5. **Surface integration, images** (11–13 image parts) — helper
   generalization, VD rows 1–8 + row 10 remediation, pickers/panels, model
   seeds. Phase-2 acceptance.
6. **Video** (11–13 video parts) — video jobs, `resolveEpisodeVideoModel`
   remediation, clip integration, formatter family. Phase-3 acceptance.
7. **Worker App module** (14) — Windows, then macOS; private scope
   end-to-end. Phase-4 acceptance.
8. **Hardening pass** (15) — admin dashboards, audit completeness, load
   test of admission control, token-leak grep in CI.

---

## 17. Risks and mitigations

- **Hermes CLI behavior drift / undocumented formats** (device-code stdout,
  exit codes, MEDIA tags): pin 0.18.2; every parse has a fallback signal;
  provisioning runs the compatibility checklist (spec §19); capability
  probe re-runs on upgrade. Version bumps are deliberate worker releases.
- **xAI entitlement 403 after successful OAuth** (documented): mandatory
  entitlement probe in connect flow; `entitlement_restricted` status +
  Thai/English copy; no auto-retry of permanent 403s.
- **Profile isolation assumption** (native profiles isolating auth.json):
  verified at provisioning with a two-profile probe; automatic fallback to
  per-connection HERMES_HOME behind the ProfileStrategy interface.
- **Host resource pressure** (same production host): dedicated cgroup
  limits sized below web's budget; concurrency 2; admission control caps
  queue depth; kill-switch flag; heartbeat freeDiskBytes + disk eviction.
- **Serial per-connection queues frustrating batch users:** honest
  queued/running UI states; batch cap 4; documented expectation.
- **Cross-lane confusion with agent-gateway Hermes:** namespace rule +
  a lint-style grep test asserting no new references to
  `queueHermesWorkerJob`/`hermesAgentRuntime` from media code.
