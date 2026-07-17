# 135 - Hermes Grok Media Worker (Shared Server + Private Desktop)

Version: 1.4
Date: 2026-07-16
Status: Proposed
Depends-on: 077-distributed-worker-fabric-completion, 081-hermes-agent-runtime-gateway-and-channel-interop, 093-hermes-capability-expansion, 121-mcp-connect-media-provider-sharing, 124-smart-ai-hub-worker-app
Related: 131-vertical-drama-series-storyboard-video-flow, 059-external-worker-provider-framework, 094-personal-worker-access-keys-permissions-quotas
Audience: Product, Runtime, Media, Web Control Plane, Worker App, Security, Admin, QA
Source reference: "SmartSpecPro – Hermes Grok Media Worker Development Specification v1.1" (external document, adapted — see `request.md`)

## Revision history

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-07-16 | Initial spec adapted from external Hermes/Grok worker document onto the SmartSpecPro worker fabric + media transport architecture |
| 1.1 | 2026-07-16 | Completeness pass: full Vertical Drama Series integration map (all ~10 generation resolvers across 4 routers, shared transport helpers, task polling/`media.getTask` compatibility, `hermes_` task-id scheme, client picker/remembered-model wiring, skill-first prompt + reference-mapping pipeline reuse, portrait-candidate batch behavior); credit reconcile compatibility; migration discipline; ad-banner gap flagged; expanded testing plan |
| 1.2 | 2026-07-16 | Close ALL remaining gaps: ad-banner promoted from follow-up into committed scope (transport branch + fail-closed guard, surface #10); named the new tRPC router `hermesConnections` + procedures; named connection control-job types (`hermes_connection_authorize` / `_probe` / `_disconnect`); effective-capability rule (model row ∩ connection manifest); cleaned `owner_user_id` semantics; phases/testing/acceptance updated accordingly |
| 1.3 | 2026-07-16 | Adversarial consistency pass: fixed queued-per-user cap (3) contradicting portrait batch size (4); reference URLs no longer embedded at enqueue (claim-time minting + refresh endpoint — fixes signed-URL expiry in serial queues and keeps URLs out of the DB); shared-pool connection selection timing defined (enqueue-time least-depth in V1); consolidated error-code table added (13.7); claim gating specified via the existing required-claim-capability precedent (`remotion_render_video` pattern in `workerRegistryService.claimWorkerJob`); xAI data-transfer consent added to connect flow + security; flags-only rollback note |
| 1.4 | 2026-07-16 | Independent review pass (codebase-verified): reconciled with the EXISTING kie.ai Grok Imagine models (two-Grok-paths positioning + picker naming rule); fixed `runtimeType` claim-compatibility (Worker App registers `desktop_zeroclaw_managed` — job runtimeType now follows the assigned worker; hermes-ness gated by jobType + claim capability); corrected row 9 resolver name to `resolveEpisodeVideoModel` and added its silent `DEFAULT_MODELS.video` fallback as the surface #9 remediation (ad-banner is not the only silent-fallback path); resolved round-robin vs least-depth contradiction; single-pass no-fallback connection resolution made explicit; `hermes_provider_connections` columns to camelCase per schema convention; shared-worker token provisioning; Worker App Hermes-runtime upgrade/version-skew rule; workspace/log retention; metrics sink named (audit-log events, no new metrics stack); phase 4 sequential-gating note |

---

## 1. Executive summary

This feature lets SmartSpecPro users generate **images and videos through a
Grok account subscription** (SuperGrok / X Premium+) by driving the
**Hermes Agent CLI** as a controlled worker process, and makes that path
available as **one more selectable option in the normal media model picker**
— sitting alongside gateway models (kie.ai / fal.ai / wavespeed) and MCP
connections, using the same `media_models` + transport mechanism.

Two deployment modes ship **together in this feature**:

1. **Shared Server Hermes Worker** — one Hermes installation on the main
   server (or a dedicated container), operated as a central worker shared by
   all users. Because it runs on shared infrastructure, it must enforce
   strict **concurrency caps, rate limits, queue depth limits, and process
   resource isolation** so that Hermes/ffmpeg-class workloads can never
   degrade the web server again (see the vertical-drama ffmpeg cgroup
   incident that motivated the render-jobs offload).

2. **Private Hermes Worker** — Hermes running on the user's own
   Windows/macOS machine, **integrated into the existing Smart AI Hub Worker
   App** (`apps/worker-app`, feature 124), which today only executes
   HyperFrames/render jobs. The Worker App gains a Hermes runtime module.
   A private worker is bound to its owner's account: only the owner's jobs
   are routed to it, and the Grok OAuth credential never leaves the owner's
   machine.

Both modes reuse the **existing worker fabric** — `workers`,
`worker_heartbeats`, `worker_jobs`, `worker_job_events`, `worker_artifacts`,
the `/api/workers/*` and `/api/worker-jobs/*` control-plane endpoints, and
the `hermes_agent_gateway` runtime type that already exists in
`worker_runtime_type` (feature 081). This feature adds **no new queue
infrastructure**; it adds new job types, a new media transport, a Grok
connection entity, and the Hermes CLI adapter.

Hard security rule carried over from the source document: **SmartSpecPro
never collects, transmits, logs, or stores the user's Grok/xAI password.**
Authentication is exclusively the xAI OAuth device-code flow rendered from
official xAI pages. SmartSpecPro stores only non-sensitive connection
metadata; OAuth tokens live only inside the Hermes profile on the worker
host (server worker) or the user's own machine (private worker).

---

## 2. Problem statement

- Users with SuperGrok / X Premium+ subscriptions want to spend their
  existing subscription entitlement on image/video generation instead of
  platform credits, similar to what MCP connections (feature 121) already
  allow for higgsfield/magnific accounts.
- **Grok Imagine is already reachable today** through the kie.ai
  `gateway_api` path (`modelRegistry.ts` ships enabled `grok-imagine`
  image and `grok-imagine-video-1-5-preview` video models, billed in
  platform credits). What does NOT exist is a way to spend the user's own
  Grok **subscription** on generation: xAI offers no per-account API-key
  path for subscription entitlements, so the practical lane is Hermes
  Agent's xAI OAuth device-code login — a CLI agent, not an HTTP media
  API. Driving it requires a worker process that can spawn Hermes
  non-interactively, parse results defensively, and collect files —
  exactly the shape of work the worker fabric was built for. Both Grok
  paths are kept side by side (section 3.1).
- Running such workloads inside `smartspec-web.service` is a proven failure
  mode (memory-cgroup throttling, D-state hangs, load 20+). The shared
  server worker must be a **separate process/unit** with its own resource
  budget, and its throughput must be explicitly bounded.
- The Smart AI Hub Worker App already gives users a trusted desktop agent
  for render jobs. Users who do not want their Grok account hosted on the
  shared server need a private lane where credentials and generation run on
  their own hardware.

---

## 3. Positioning against existing features

| Existing piece | What this feature does with it |
|---|---|
| Worker fabric (`worker_jobs`, `workers`, heartbeats, events, artifacts; `server/services/workerRegistryService.ts`, `server/routes/workerRuntime.ts`) | Reused as-is for queueing, claiming, progress, artifact upload. New `jobType` values only. |
| `hermes_agent_gateway` runtime type (feature 081) | Reused as the registered `runtimeType` of the **shared server Hermes worker**. The Worker App keeps its existing registered type `desktop_zeroclaw_managed` (`apps/worker-app/src-tauri/src/control_plane.rs:11`) — see the job `runtimeType` rule in section 10.2. |
| Existing kie.ai Grok Imagine models (`grok-imagine`, `grok-imagine-video-1-5-preview` in `modelRegistry.ts`, enabled) | Kept unchanged and offered side by side — see section 3.1 for the two-Grok-paths rule. |
| `shared/mediaModelTransport.ts` (`mcp` \| `gateway_api`) | Extended with a third transport: `hermes_worker`. |
| `media_models` table + `server/routers/mediaModels.ts` | Hermes-Grok models are normal `media_models` rows whose `configJson.transport === "hermes_worker"`. They appear in the standard model picker with capability-driven gating. |
| MCP connection pattern (`user_mcp_connections`, `McpConnectionPicker.tsx`, feature 121) | Followed as the UX and data-model template for Grok connections (new table, section 10), including default-connection semantics and share/personal scoping. |
| Smart AI Hub Worker App (`apps/worker-app`, feature 124) | Extended with a Hermes runtime module (bundled/downloaded Hermes runtime, readiness checks, job execution) next to the existing HyperFrames render runtime. |
| `server/services/workerSchedulerService.ts` | Extended with Hermes media job enqueue helpers (idempotency key pattern reused). |
| `server/services/workerBillingService.ts` (reserve/reconcile) | Reused for the optional platform service fee (section 14). |
| `server/services/inlineRenderWorker.ts` + `renderWorkerSettings.ts` | Pattern reference only. The shared Hermes worker is **not** an in-web-process drainer; it is a separate unit (section 8). |
| `media_assets`, `library_items`, `worker_artifacts.publishedItemId`, `server/storage.ts` presigned upload flow | Reused for output storage and Library registration. |

### 3.1 Two Grok paths — explicit product rule

After this feature ships, "Grok" exists in the catalog twice, on purpose:

| | Existing kie.ai path | New Hermes path |
|---|---|---|
| Model ids | `grok-imagine`, `grok-imagine-video-1-5-preview` | `hermes-grok/grok-imagine-*` |
| Transport | `gateway_api` | `hermes_worker` |
| Billing | platform credits | user's/tenant's Grok subscription (`provider_account`) + optional platform fee |
| Availability | any user with credits | users with an authorized Hermes connection |
| Latency/limits | kie.ai task queue | per-connection serial queue on a worker |

Rules:

- Neither path replaces the other; no automatic routing between them.
- **Picker naming must be unambiguous**: Hermes rows carry a distinct
  display name and badge — "Grok Imagine (บัญชี Grok ของคุณ / via
  Hermes)" — never a bare "Grok Imagine", which is the existing kie.ai
  model's display name.
- Capability data (e.g. video `maxReferenceImages: 1`, durations, aspect
  ratios) is maintained **independently per path**: the kie.ai rows keep
  their registry values; Hermes rows derive theirs from the connection
  capability manifest (section 12.2). They may drift as providers evolve;
  no code may assume the two stay identical.
- The existing `grok` provider family in
  `verticalDramaVideoPromptFormatter.ts` serves **both** paths (prompt
  style is a property of the Grok model family, not of the transport).

Non-goals inherited and confirmed:

- No direct frontend→xAI calls.
- No Grok password fields anywhere in SmartSpecPro.
- No browser automation that types credentials.
- No editing of Hermes token files by SmartSpecPro code.
- No bypassing xAI subscription limits or entitlement checks.
- No promise that every SuperGrok tier has OAuth API entitlement.
- No automatic cross-provider fallback (a Hermes job never silently becomes
  a kie.ai/fal.ai/MCP job).

---

## 4. Verified platform capabilities (must be re-probed at runtime)

At spec time:

- Hermes supports xAI OAuth device-code login for SuperGrok and X Premium+
  accounts, and stores/refreshes tokens on the host.
- Non-interactive execution exists via `hermes chat -q`.
- Toolsets: `image_gen` (`image_generate`) and `video_gen`
  (`video_generate`; disabled by default, enabled at provisioning).
- xAI image editing accepts up to **3** source images per request.
- xAI reference-to-video accepts up to **7** reference images, model/mode
  dependent; image-to-video uses exactly one start image; the two modes
  cannot be combined.
- Video generation is asynchronous and slower than image generation.

None of these may be hard-coded as permanently true. The worker must run a
**capability probe** at startup, after every Hermes upgrade, and after every
connection (re)authorization, and publish the result into the worker's
`capabilitiesJson` and the connection's capability manifest (section 12).

---

## 5. Product goals

### 5.1 Primary

- Grok image/video generation selectable from the standard media model
  picker (including inside Vertical Drama panels and Media Studio) as
  "Grok via Hermes" models.
- Both deployment modes working end-to-end: shared server worker and
  private Worker App worker.
- Supported operations at launch: text-to-image, single/multi-image edit
  (≤3 refs), text-to-video, image-to-video (1 start image).
  Reference-to-video (≤7 refs) only where the runtime capability probe
  confirms support; otherwise fail closed with a clear reason.
- Generated outputs land in SmartSpecPro storage and are registered as
  `media_assets` / `library_items` with full lineage, identical to other
  providers.
- Shared server worker cannot harm platform stability: bounded concurrency,
  bounded queue, rate limiting, separate systemd/container unit with
  resource limits, kill-switch.
- Private worker credentials never leave the user's machine; private
  workers only ever receive their owner's jobs.
- Retries, cancellation, stage progress, and failure diagnostics with
  Thai + English user-safe messages.

### 5.2 Secondary

- Connection model generic enough to add an xAI API-key adapter or other
  agent-CLI providers later without new queue or Library work.
- Extension point for future Hermes functions (research, TTS,
  transcription) as **disabled** capabilities — no visible unfinished UI.

---

## 6. High-level architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│ Web client                                                         │
│  Model picker (media_models incl. transport=hermes_worker)         │
│  HermesConnectionPicker (mirrors McpConnectionPicker)              │
│  Grok connect flow (OAuth device-code UI)   Job monitor (reuse)    │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ tRPC (media.ts / verticalDramaEpisodes.ts)
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│ apps/web server                                                    │
│  resolveMediaModelTransportConfig → transport === "hermes_worker"  │
│  → hermesMediaScheduler (new, wraps workerSchedulerService)        │
│  → INSERT worker_jobs (jobType=hermes_media_*, runtimeType=        │
│     <assigned worker's registered type>, capabilityReqs, idem.)    │
│  Admission control: per-connection semaphore, per-user rate limit, │
│  queue-depth cap, credit/fee reservation                           │
└──────────────┬───────────────────────────────┬─────────────────────┘
   claim/heartbeat/events/artifacts (existing /api/workers/*,
   /api/worker-jobs/* control plane, bearer + device proof)
               │                               │
               ▼                               ▼
┌───────────────────────────┐   ┌────────────────────────────────────┐
│ Shared Server Hermes      │   │ Smart AI Hub Worker App            │
│ Worker (new unit:         │   │ (apps/worker-app, Tauri)           │
│ smartspec-hermes-worker)  │   │  existing: HyperFrames render      │
│  workerMode: shared pool  │   │  NEW: Hermes runtime module        │
│  N isolated Grok profiles │   │  workerMode: private owner         │
│  concurrency + rate guard │   │  1..N owner Grok profiles (local)  │
└──────────┬────────────────┘   └──────────────┬─────────────────────┘
           │  spawn per job                    │  spawn per job
           ▼                                   ▼
   hermes chat --toolsets image_gen|video_gen -q "<envelope>"
           │  (isolated HOME/profile per Grok connection)
           ▼
   xAI Grok OAuth → Grok Imagine (image/video)
           │
           ▼
   outputs in job workspace → validate → presigned upload
   (/api/worker-jobs/:id/artifacts/*) → media_assets / library_items
```

### 6.1 Source of truth

SmartSpecPro owns users, tenants, connections, jobs, queue state, assets,
Library, routing policy, audit, and lineage. Hermes owns only xAI OAuth
token handling/refresh inside its profile and Grok tool invocation. Hermes
is never the system of record.

### 6.2 Cardinality

```text
1 SmartSpecPro deployment
 ├── 1 Shared Server Hermes Worker unit (V1: exactly one; N later)
 │     └── 1 Hermes installation → 0..N isolated Grok connection profiles
 └── 0..N Smart AI Hub Worker Apps (one per user machine)
       └── 1 Hermes installation → owner's Grok connection profile(s)

1 Grok connection profile == exactly 1 Grok account
1 user may own 0..N Grok connections
```

One Hermes installation per worker host. Never one installation per user;
never one shared `auth.json` for everyone.

---

## 7. Deployment modes and connection scopes

### 7.1 Connection scopes

| Scope | Hosted on | Grok account owner | Who can generate with it | V1 |
|---|---|---|---|---|
| `server_shared` | Shared server worker | Admin/tenant-managed account | All users in the tenant (policy + quota controlled) | ✅ |
| `server_personal` | Shared server worker | Individual user | Owner only (optionally group-shared, following `mcp_connection_group_shares` semantics) | ✅ |
| `private_worker` | User's Worker App machine | Individual user | Owner only, and only via that machine's worker | ✅ |

Notes:

- `server_shared` is what makes the "worker กลางใช้ร่วมกันทุกคน" case real:
  admins connect one or more platform-owned Grok accounts on the server
  worker; every user may route jobs through them subject to fairness quotas
  (section 9). Multiple shared accounts form a pool the scheduler
  distributes jobs across, one running job per account at a time — the
  selection algorithm is defined once, in section 9 (enqueue-time
  least-queue-depth).
- `server_personal` lets a user host their own Grok account on the server
  worker (they trust the platform host with the token). Feature-flagged
  independently so operators can disable it.
- `private_worker` connections are invisible to other users and are never
  schedulable by anyone but the owner. The OAuth token exists only on the
  owner's machine.

### 7.2 Worker assignment

- Sticky assignment: a connection is bound to exactly one worker
  (`assignedWorkerId`). Tokens never migrate automatically.
- Private connections are implicitly bound to the owner's Worker App
  worker row (reusing `workers.registeredByUserId` + private owner mode
  from feature 124).
- If the assigned worker is offline, jobs for that connection are rejected
  at submit time with `HERMES_WORKER_UNAVAILABLE` (fail closed — do not
  queue indefinitely; the model picker should already show the option as
  unavailable).

### 7.3 Job routing decision

At submit time the server resolves, in order:

1. The selected model's transport must be `hermes_worker`.
2. The user's selected Grok connection (explicit picker value, else the
   user's default Hermes connection, else tenant `server_shared` pool if
   permitted). No implicit fallback from a personal/private connection to
   the shared pool — the user must see which account pays. **Resolution
   is a single pass**: the else-chain applies only when the earlier tier
   is *not configured*. Once a connection is identified, any later
   failure (offline worker, admission control, quota) fails the submit
   with that tier's typed error — it never retries into the next tier.
3. The connection's assigned worker must be `online` per heartbeat.
4. Admission control (section 9) must pass.
5. The `worker_jobs` row is inserted targeting that worker
   (`workerId` pinned for private; pool-claimable for shared).

---

## 8. Shared Server Hermes Worker

### 8.1 Process model — mandatory isolation

- New systemd unit `smartspec-hermes-worker.service` (source in
  `docker/systemd/`), or an equivalent dedicated container. It is **never**
  part of `smartspec-web.service` and never an in-web-process drainer.
  Rationale: the vertical-drama ffmpeg incident (web cgroup MemoryHigh
  throttle → D-state hangs). The unit gets its own `MemoryHigh`/`MemoryMax`,
  `CPUQuota`, `TasksMax`, and `Restart=on-failure`.
- The worker process is a Node (or Python) service that speaks the existing
  worker control plane as an ordinary external worker: register → heartbeat
  → claim → events → artifacts. It authenticates with a worker bearer token
  exactly like the Worker App; running on the same host grants no implicit
  trust.
- **Token provisioning**: the unit's bearer token is created once by an
  admin through the existing worker registration/pairing flow (the same
  device-code `WorkerConnectSession` pairing the Worker App uses, run via
  an admin CLI/page), then stored in a root-owned systemd
  `EnvironmentFile` (mode 0600) referenced by the unit. Rotation =
  re-pair + swap the EnvironmentFile + restart the unit; the old token is
  revoked server-side. The token never lives in the repo, images, or
  `system_settings`.
- Hermes is installed once inside the unit's filesystem scope, pinned to a
  tested version (section 19).

### 8.2 Profile isolation layout

```text
/var/lib/smartspec-hermes-worker/
  hermes/                      # pinned installation
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

- Profile activation: isolated `HOME` (+ `HERMES_HOME` when supported by
  the pinned version). Named-profile CLI flags may be adopted only after
  the pinned version is verified — never assumed.
- A job workspace must never live inside any profile directory; a job must
  never be able to read another connection's profile (path checks +
  filesystem permissions).
- Disconnect = `hermes` logout for that profile + secure removal of the
  profile directory.
- **Workspace + log retention** (consistent with existing platform
  retention conventions): a job workspace is deleted as soon as artifact
  upload is verified for completed jobs, and kept 72 hours for
  failed/cancelled jobs (diagnostics), then deleted. Worker-local
  `logs/` (sanitized) rotate with a 14-day cap. A disk-pressure guard
  evicts oldest terminal-job workspaces first and is reflected in
  heartbeat `freeDiskBytes`. The same rules apply to the Worker App's
  local job workspaces.

### 8.3 What the shared worker enforces locally (defense in depth)

Server-side admission control (section 9) is authoritative, but the worker
re-enforces locally:

- max concurrent Hermes child processes (config, default 2);
- exactly 1 concurrent job per Grok connection profile (local file lock);
- per-process rlimits / kill on runaway CPU or memory;
- no-output inactivity timeout and hard wall-clock timeout per job;
- workspace disk quota; refuse claims when free disk is below threshold
  (already reported via heartbeat `freeDiskBytes`).

---

## 9. Concurrency, rate limiting, and server-protection (authoritative, server-side)

All limits are enforced **at enqueue time in apps/web** (fail fast with a
user-visible error) and re-checked at claim time. Redis-backed, following
the existing custom limiter patterns (`server/services/rateLimiter.ts`
family — no new library).

| Limit | Default | Scope |
|---|---|---|
| Concurrent running jobs per Grok connection | 1 | all operations combined |
| Concurrent running Hermes jobs per shared worker | 2 | worker |
| Queued (not yet running) Hermes jobs per user | 8 | user |
| Queued Hermes jobs per tenant on the shared pool | 20 | tenant |
| Job submissions per user | 10 / 10 min sliding | user |
| Job submissions per tenant (shared pool) | 60 / 10 min sliding | tenant |
| `server_shared` account daily job quota | admin-set per connection | connection |

- All defaults are admin-configurable via `system_settings`
  (pattern: `renderWorkerSettings.ts` TTL-cached reads + cache clear hook).
- Limit-coherence rule: the queued-per-user cap must always be ≥ the
  largest single multi-job submission (portrait candidate batch, capped at
  4 per section 11.5) — a full batch counts each candidate individually
  against the queued cap and must be admittable in one submit. Admin
  validation rejects configurations that violate this invariant.
- Shared-pool connection selection happens **at enqueue time** in V1: the
  scheduler picks the eligible `server_shared` connection with the lowest
  current queue depth (its daily quota not exhausted) and pins the job to
  that `connectionId`. Claim-time (dispatch-time) rebalancing across pool
  accounts is a later optimization, noted here so V1's occasional
  imbalance is understood and accepted.
- Exceeding a limit returns a typed error (`HERMES_RATE_LIMITED`,
  `HERMES_QUEUE_FULL`, `HERMES_CONNECTION_BUSY`) with Thai/English copy and
  a retry-after hint. Jobs are **not** silently absorbed into an unbounded
  queue.
- Fairness on the shared pool: FIFO within priority, plus a per-user
  in-flight cap so one user cannot occupy every shared account
  simultaneously (reuses the queue-fairness intent from feature 124).
- Kill-switch: admin flag `hermes_worker_enabled` (global) +
  `hermes_worker_shared_pool_enabled`. When off, submit fails closed and
  the model option renders as disabled with a reason — consistent with the
  project convention that generation never silently falls back to a
  different model/provider.
- Private workers are exempt from tenant-shared-pool limits but keep the
  per-connection concurrency of 1 and the per-user submission limiter (to
  protect the control plane itself).

---

## 10. Data model

### 10.1 New table: `hermes_provider_connections`

Modeled on `user_mcp_connections` (feature 121), kept provider-generic.
Columns follow the project's camelCase convention (same family as
`workerJobs.requestedByUserId`, `userMcpConnections.tokenExpiresAt`):

```text
id                    uuid pk
tenantId              → tenants
ownerUserId           → users (always set: the connecting user, or the
                        creating admin for server_shared; visibility and
                        schedulability are driven by `scope`, not by nullness)
scope                 enum: server_shared | server_personal | private_worker
providerType          varchar(64)   -- "xai_grok" (V1 only value)
adapterType           varchar(64)   -- "hermes_cli" (V1 only value)
authenticationType    varchar(64)   -- "oauth_device_code"
status                enum: pending | authorized | reauth_required |
                            entitlement_restricted | disconnected | error
assignedWorkerId      → workers (nullable until first registration)
profileReference      varchar(255)  -- opaque profile dir key; NEVER a client-supplied path
accountLabel          varchar(120)  -- user-defined display name
accountHint           varchar(120)  -- non-sensitive hint (masked handle/email)
entitlementStatus     varchar(64)
capabilitiesJson      jsonb         -- capability manifest (section 12.2)
defaultForImage       boolean       -- partial-unique per user, like MCP defaults
defaultForVideo       boolean
dailyJobQuota         integer null  -- server_shared fairness quota
metadataJson          jsonb
createdAt / authorizedAt / lastProbeAt / disconnectedAt
```

Forbidden columns (must never exist): password, access token, refresh
token, `auth.json` payloads, cookies, device-code secrets. Tokens exist
only inside the Hermes profile on the worker host.

Group sharing of `server_personal` connections follows the
`mcp_connection_group_shares` pattern (optional, flagged; may land in a
follow-up migration within this feature).

### 10.2 Jobs: reuse `worker_jobs` — no new job table

New `jobType` constants in `shared/workerRuntime.ts`:

```text
# generation jobs
HERMES_MEDIA_IMAGE_JOB_TYPE       = "hermes_media_image_generate"
HERMES_MEDIA_VIDEO_JOB_TYPE       = "hermes_media_video_generate"

# connection control jobs (short-lived, routed to the connection's worker)
HERMES_CONNECTION_AUTH_JOB_TYPE       = "hermes_connection_authorize"
HERMES_CONNECTION_PROBE_JOB_TYPE      = "hermes_connection_probe"
HERMES_CONNECTION_DISCONNECT_JOB_TYPE = "hermes_connection_disconnect"
```

Control jobs reuse the same claim/events plumbing as generation jobs
(device-code payloads travel as `worker_job_events`, never through logs),
carry `resourceProfile: cpu_light`, tight timeouts (OAuth job ≤ the
device-code expiry), and are exempt from the media-generation rate
limiter but capped at 1 concurrent control job per connection.

- `runtimeType` — **follows the assigned worker, not the feature**. The
  fabric's claim query filters candidates by the claiming worker's
  registered runtime type (`listClaimableJobs(tenantId,
  auth.runtimeType, …)`), and the Worker App registers as
  `desktop_zeroclaw_managed` (`WORKER_RUNTIME_TYPE`,
  `apps/worker-app/src-tauri/src/control_plane.rs:11`) while the shared
  server unit registers as `hermes_agent_gateway`. Enqueuing every Hermes
  job as `hermes_agent_gateway` would therefore make private jobs
  **invisible to the Worker App**. Rule: the scheduler stamps
  `runtimeType` = the connection's assigned worker's registered type
  (private → `desktop_zeroclaw_managed`, shared → `hermes_agent_gateway`);
  "this is a Hermes job" is expressed by `jobType` + the required claim
  capability below, never by `runtimeType`.
- `resourceProfile`: `network_heavy` (image), `long_running` (video).
- `capabilityRequirementsJson`: `{ hermesMedia: true, operation, connectionId }`
  so only Hermes-capable workers (and for private scope, only the pinned
  worker) can claim.
- Claim gating follows the **existing required-claim-capability
  precedent** already implemented for `remotion_render_video` in
  `workerRegistryService.claimWorkerJob` (defense-in-depth assertion that
  `continue`s past non-matching candidates): define
  `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY` and require it in the worker's
  `capabilityHints` before any `hermes_media_*` job can be claimed. This
  layers on top of the fabric's existing filters that this feature reuses
  unchanged: `listClaimableJobs(tenantId, runtimeType, …, capabilityHints)`
  and `filterClaimableJobsForWorker` sharing-mode checks (private workers
  only see their owner's jobs via `requestedByUserId`). Private-scope
  Hermes jobs are additionally pinned by `workerId` at enqueue, giving a
  triple filter: pinned worker + owner match + claim capability — a user
  with two machines can therefore host different connections on each
  without cross-claiming.
- `inputJson` carries the normalized media job contract (section 13).
- `idempotencyKey`: `${jobType}:${connectionId}:${requestHash}` following
  the `workerSchedulerService.ts` pattern.
- Progress via `worker_job_events`; outputs via `worker_artifacts` with
  `publishedItemId → library_items.id`.

### 10.3 Lineage

Reuse `media_assets` (+ `worker_artifacts.metadataJson`) for lineage:
operation, prompt, model, aspect ratio, duration, reference asset ids,
`workerJobId`, hermes version, worker version, connection id. Same trace
discipline as the audit-log protocol (traceId propagated end to end).

### 10.4 Models: rows in `media_models`

Seeded rows (admin-manageable, disabled by default until rollout):

```text
modelId: "hermes-grok/grok-imagine-image"          modelType: image
modelId: "hermes-grok/grok-imagine-image-quality"  modelType: image
modelId: "hermes-grok/grok-imagine-video"          modelType: video
```

`configJson`:

```json
{
  "transport": "hermes_worker",
  "hermes": { "providerType": "xai_grok", "operationDefaults": { "aspectRatios": ["1:1", "9:16", "16:9"] } },
  "creditSource": "provider_account"
}
```

The slash-delimited `provider/model` id convention matches the MCP model id
convention (`resolveMcpRouteFromModelId`), keeping picker/routing code
uniform.

---

## 11. Transport integration (how the option appears next to normal models and MCP)

### 11.1 `shared/mediaModelTransport.ts`

Extend the transport union:

```text
transport: "mcp" | "gateway_api" | "hermes_worker"
```

`resolveMediaModelTransportConfig` returns for Hermes rows:
`{ transport: "hermes_worker", providerKey: "hermes-grok", providerModelId,
creditSource: "provider_account" }`.

### 11.2 Routing branch

The transport decision is made in a small number of shared helpers, and the
`hermes_worker` arm must be added **at the helper level, not per resolver**,
so every generation surface (including all Vertical Drama surfaces, section
11.5) inherits it:

1. `server/routers/media.ts` — `generateImageAsync` (L~2885) and
   `generateVideoAsync` (L~3143): the existing binary branch
   `shouldUseMcpTransport ? submitMcpMediaGeneration(...) :
   mediaGenerationService...` becomes three-way.
2. `resolveVdCharacterMcpTransportMetadata`
   (`server/routers/verticalDramaCharacters.ts:473`, exported; reused
   verbatim by `verticalDramaLocations.ts`) — the transport helper for all
   character/location image generation.
3. `resolveVdMcpTransportMetadata`
   (`server/routers/verticalDramaEpisodes.ts:~2955`, kept byte-equivalent
   to #2 by convention) — the transport helper for all episode/storyboard
   image + video generation.

These VD helpers currently resolve MCP metadata or return `null`
(gateway). They gain a third outcome: a `hermesTransportMetadata` result
that short-circuits the resolver into the Hermes scheduler instead of
`generateImageAsync`/`generateVideoAsync`. They should be renamed (or
wrapped) to transport-neutral names (e.g.
`resolveVdMediaTransportMetadata`) as part of this feature; the rename is
mechanical and must keep the two copies equivalent.

The `hermes_worker` arm calls a new
`server/services/hermesMediaScheduler.ts`:

1. resolve + authorize the Grok connection (tenant + ownership + scope);
2. run admission control (section 9);
3. reserve platform fee credits if configured (section 14) via
   `workerBillingService.reserveWorkerJobCredits`;
4. build the normalized job contract and insert the `worker_jobs` row;
5. return an async task projection **with a `hermes_`-prefixed taskId**
   compatible with the existing polling contract (section 11.6), so all
   existing polling UI (media history, VD workspace, portrait-candidate
   settlement, RenderJobsPage) works unchanged.

Consistent with the model-selection guard convention: if the request
carries no explicitly selected model, the resolver **throws BAD_REQUEST**
— no silent default to a Hermes model and no silent fallback away from
one.

### 11.3 Client

- Model picker (`ModelSelectorDialog.tsx`, VD panels, Media Studio): Hermes
  models render in the standard list with a "Grok via Hermes" badge and a
  connection-state indicator; unavailable states (no connection, worker
  offline, flag off, entitlement restricted) render disabled with a reason,
  mirroring `getProviderReadiness` gating.
- New `HermesConnectionPicker.tsx` mirroring `McpConnectionPicker.tsx`:
  lists the user's authorized connections filtered by asset type, value
  shape `${connectionId}:${scope}`, honors per-user defaults.
- Capability-driven form: reference limits, video modes, aspect ratios,
  and durations come from the connection's capability manifest — never
  hard-coded in the client.

### 11.4 Video mode selector (explicit, never inferred)

```text
Text to Video | Animate Start Image (1 ref) | Reference Images to Video (1–7 refs, capability-gated)
```

If the probe reports reference-to-video unsupported, the third mode is
visible-disabled with the reason; extra references are rejected at submit,
never silently dropped.

### 11.5 Vertical Drama Series integration — complete surface map (REQUIRED)

Hermes-Grok must be usable from **every existing image/video generation
surface in the Drama Series pages**, not only start-frame + clip. Because
all of these resolvers route through the two shared VD transport helpers
(section 11.2) plus `mediaGenerationService`, the helper-level integration
covers them — but each surface below is an explicit acceptance item and
must be verified individually.

Server resolvers in scope (rows 1–8 keep their existing fail-closed
"no model selected → BAD_REQUEST" guards; a Hermes model id satisfies the
guard exactly like a gateway/MCP id; rows 9–10 have fail-closed
**remediation items** below):

| # | Resolver | Router | Generates | Model source |
|---|---|---|---|---|
| 1 | `generateCharacterImage` (~L2497) | `verticalDramaCharacters.ts` | character portrait (identity-locked) | `selectedImageModelId` (required) |
| 2 | `generateCharacterSheet` (~L2873) | `verticalDramaCharacters.ts` | DNA / Design-Bible sheets (14 `sheetType`s: turnaround, expression_12, color_palette, …) | `selectedImageModelId` (required) |
| 3 | `generatePortraitCandidateBatch` (~L989) | `verticalDramaCharacters.ts` | portrait candidate batch (N independent image tasks, idempotency `${batchId}:${candidateId}`) | `resolveCharacterImageModelId` |
| 4 | `generateLocationImage` (~L509) | `verticalDramaLocations.ts` | location stock image (+ location visual bible) | `selectedImageModelId` (required) |
| 5 | `generateStartFrameImage` (~L9430) | `verticalDramaEpisodes.ts` | storyboard start-frame image | `resolveEpisodeImageModelId(plan)` (per-episode persisted) |
| 6 | `generateStartFrameAngleVariations` (~L10006) | `verticalDramaEpisodes.ts` | angle-variation frames from approved start frame | `resolveEpisodeImageModelId` |
| 7 | `repairShotImage` (~L10482) | `verticalDramaEpisodes.ts` | shot start-frame repair/re-render | `resolveEpisodeImageModelId` |
| 8 | `generateShotReferenceFrameImage` (~L12431) | `verticalDramaEpisodes.ts` | shot reference frame (character-ref frame) | `resolveEpisodeImageModelId` |
| 9 | `generateVideoClip` (~L10914) | `verticalDramaEpisodes.ts` | shot video clip (start frame + ordered reference set) | `resolveEpisodeVideoModel` (~L2887, per-episode persisted `selectedVideoModelId`) — **fail-closed remediation below** |
| 10 | `generateAdBannerImage` (~L6679 → `verticalDramaAdBanner.ts:~581`) | `verticalDramaSeries.ts` | ad-banner / thumbnail image | `banner.generation.modelId` — **fail-closed remediation below** |

Surface #9 remediation — video model resolver (committed in this
feature): `resolveEpisodeVideoModel` (`verticalDramaEpisodes.ts:~2887`)
contains a silent fallback to `DEFAULT_MODELS.video` when no video model
is selected or the selected model is disabled — despite its own doc
comment claiming fail-closed symmetry with `resolveEpisodeImageModelId`
(which really does throw BAD_REQUEST). This feature makes
`resolveEpisodeVideoModel` throw BAD_REQUEST like its image counterpart;
any call site relying on the fallback must surface model-selection UI
instead. Without this fix, a user who picked a Hermes video model that
later gets disabled would be **silently billed platform credits on the
default gateway model** — the exact bug class the fail-closed policy
exists to prevent.

Surface #10 remediation — ad banner (committed in this feature, not a
follow-up): `generateAdBannerImage` is today the only VD generator with
**no transport branch at all** (gateway-only) and it also has a silent
`DEFAULT_MODELS.image` fallback. As part of phase 2 this feature must:

1. route the ad-banner service through the shared VD transport helper so
   it supports `gateway_api`, `mcp`, and `hermes_worker` uniformly;
2. replace the silent `DEFAULT_MODELS.image` fallback with the same
   BAD_REQUEST fail-closed guard the other nine surfaces already have
   (`resolveCharacterImageModelId`-equivalent), plus the corresponding
   model picker in the ad-banner UI if one is missing;
3. cover both behaviors in tests (guard rejects empty model; Hermes model
   routes to the scheduler).

This is deliberately scoped in rather than deferred: shipping a new
transport while leaving one surface silently falling back would recreate
the exact bug class the fail-closed policy exists to prevent.

Out of scope (flagged, not silently included):

- Trailer/season assembly (`generateTrailer`, `assembleSeasonVideos`) are
  ffmpeg assembly jobs, not model generation — untouched.
- Audio generation paths (voice previews, native clip audio) — untouched
  in V1 (`audio.*` operations stay disabled capabilities). Note: Grok
  video output may itself carry a native audio track; output validation
  (section 16 of the source doc → section 13.4 here) treats an audio
  stream as allowed-but-optional for video artifacts.

Client wiring in scope:

- **`VerticalDramaCharacterStockPanel.tsx`** — owns `selectedImageModelId`
  state + `mcpConnectionId`, persists to localStorage
  (`VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY`), gates `McpConnectionPicker`
  behind `imageModelUsesMcp`. Add the parallel `imageModelUsesHermes` gate
  + `HermesConnectionPicker` + `hermesConnectionId`, persisted with the
  same guarded-`safeStorage` pattern (QuotaExceeded-safe, state-first).
- **`VerticalDramaLocationStockPanel.tsx`** — same pattern with its own
  `VD_LOCATION_IMAGE_MODEL_STORAGE_KEY`.
- **`VerticalDramaStoryboardPanel.tsx`** — controlled component: model ids
  and connection id arrive as props (`selectedImageModelId`,
  `selectedVideoModelId`, `mcpConnectionId`, `onSelect*`). Add
  `hermesConnectionId` + change handler to the prop contract, threaded
  through **`VerticalDramaEpisodeWorkspace.tsx`** from
  **`VerticalDramaEpisodePage.tsx`** (the state owner).
- **`VerticalDramaEpisodePage.tsx`** — three-layer model selection must
  treat Hermes models identically:
  1. per-episode server persistence via `setEpisodeModelSelection`
     (~L9166) — a Hermes `modelId` is valid there
     (`assertModelSelectable` passes for enabled Hermes rows);
  2. per-series remembered default in localStorage
     (`readStoredSeriesModelDefault`/`storeSeriesModelDefault`,
     `vdModelStorageKey(seriesId, kind)`);
  3. the new-episode auto-hydration effect (~L1806) — hydrates a
     remembered Hermes model only when the row is still enabled **and**
     the user still has an authorized connection; otherwise leaves the
     selection empty (generate buttons disabled) rather than falling back.
- **`VerticalDramaReferenceFrameDialog.tsx`** and the inline
  angle-variation UI inherit the parent's selection — no separate picker;
  they work once the storyboard panel props carry Hermes state.
- **`VerticalDramaCharacterReferencePanel.tsx`** — asset picker only, no
  model generation; unchanged.

Prompt + reference pipeline reuse (Hermes consumes, never forks):

- Prompts stay **skill-first**: start-frame prompts from
  `skills/vertical-drama-shot-start-frame-prompt` via
  `verticalDramaStartFrameGeneration.ts` (grounded in
  `canonicalShotSummary`), video prompts via
  `generateShotVideoPrompt` → `verticalDramaVideoPromptFormatter.ts`.
  The formatter already has a `grok` provider family
  (`detectProviderFamily`, ~L117/275) — Hermes-Grok model ids must be
  registered so they resolve to family `grok`, reusing the existing Grok
  prompt variant. No new prompt logic in the worker; the worker envelope
  wraps the already-authored prompt.
- **Reference-mapping validation stays server-side and authoritative**:
  the existing `findCharacterImageIndexMappingMismatches` /
  `VdReferenceMappingError` (`VD_REFERENCE_MAPPING_MISMATCH`,
  one deterministic corrective retry, never persist a contradictory
  prompt) runs before enqueue for VD-originated Hermes jobs. The worker's
  own mapping check (section 13.2) is a second, defense-in-depth layer.
- **Video clip reference assembly order is reused as-is**
  (`generateVideoClip` ~L11094–11210): start frame at index 0, then
  speaker-switch portraits, manual shot references, auto-attached
  required-character portraits, location last — with the existing
  "identity before environment" trimming against the model's
  `maxReferenceImages`. The codebase already encodes that Grok video
  models take **one start frame only** (`maxReferenceImages: 1` gate at
  ~L11124–11131); Hermes-Grok video rows must declare
  `maxReferenceImages` from the connection's capability manifest
  (`video.image_to_video.maxReferences`, and the ref2v value only when
  probed as supported) so this existing trimming logic — not new code —
  enforces the limit.
- `requiredCharacterRefs` ordering truth and the "Image-N = <name>"
  labeling convention (`shared/verticalDramaSeries/contactSheets.ts`)
  carry into the job contract's `references[]` unchanged.

Portrait candidate batches on Hermes: batch submit creates N independent
jobs sharing one connection; with per-connection concurrency 1 they
**execute serially**. The batch UI must show queued-vs-running per
candidate honestly (states already exist), and batch size guidance for
Hermes connections may be capped (default max 4) to keep wall-clock
reasonable. Candidate settlement and credit recovery flow through the
standard polling contract below.

### 11.6 Task polling and reconciliation compatibility (REQUIRED)

VD clients learn about completion by polling `trpc.media.getTask({taskId})`
(`mediaGenerationService.getTask`, ~L2776), which currently branches:
`mcp_`-prefixed → `mcp_media_tasks`; otherwise → external media gateway
HTTP. Hermes integrates as a third branch:

- Hermes submissions return taskId `hermes_<workerJobId>`.
- `getTask` maps `hermes_`-prefixed ids to a projection built from
  `worker_jobs` + latest `worker_job_events` + `worker_artifacts`
  (status mapping per section 13.5; completed → asset URLs from the
  registered `media_assets`/`library_items`). Ownership check: requester
  must match `worker_jobs.requestedByUserId` (tenant-scoped).
- `settlePortraitCandidate` (`verticalDramaCharacters.ts:~1209`) and its
  `reconcileTaskCredits` call must handle `hermes_` tasks: terminal
  failure/cancel refunds the reserved platform fee (if any) via
  `workerBillingService.reconcileWorkerJobCredits`; generation cost itself
  is on the Grok subscription (`provider_account`), so there is no
  per-generation credit to refund beyond the fee.
- Background stale-task recovery: MCP has
  `reconcileStaleMcpMediaTasks`; the worker fabric already has lease
  expiry + `workerJobMonitorService`. This feature adds the small missing
  glue: when the monitor expires/fails a Hermes media job, the task
  projection reflects it and fee reconciliation runs — so stuck Hermes
  generations recover with the same UX as the portrait-candidate stuck-task
  recovery (terminal state + refund + retry affordance), without a new
  reconciler service.

---

## 12. Grok connection lifecycle (OAuth device-code)

### 12.0 API surface: new tRPC router `hermesConnections`

New router `server/routers/hermesConnections.ts` (registered in the app
router; all procedures `protectedProcedure`, tenant-scoped, ownership
enforced server-side):

```text
listConnections({ assetType? })        → connections visible to the caller
                                         (own personal/private + tenant shared),
                                         with status + capability summary
getConnection({ connectionId })        → detail incl. capability manifest
startConnect({ scope, workerId?, label? }) → creates row (pending) + enqueues
                                         hermes_connection_authorize; returns id
getConnectStatus({ connectionId })     → verification URL, user code, expiry,
                                         live status (polled by the connect UI)
setDefault({ connectionId, assetType }) → per-user default image/video connection
disconnect({ connectionId })           → enqueues hermes_connection_disconnect,
                                         marks row disconnected on completion
probe({ connectionId })                → enqueues hermes_connection_probe
                                         (re-runs capability manifest)
adminList / adminSetQuota / adminDisable → admin-only management of
                                         server_shared connections + quotas
```

The client `HermesConnectionPicker` consumes `listConnections` exactly the
way `McpConnectionPicker` consumes `mcpConnections.listConnections`.
Private-scope connect is **initiated from the web UI** (or a web view the
Worker App opens): `startConnect` enqueues the
`hermes_connection_authorize` control job, which the owner's Worker App
claims over the normal worker control plane and executes locally —
device-code details flow back as `worker_job_events` and the web UI's
`getConnectStatus` renders them. The Worker App itself talks only the
worker control plane (bearer token + device proof); it never gets a
user-session bypass API, and no tRPC user credentials live in the app.

### 12.1 Connect flow

1. User (or admin, for `server_shared`) opens Settings → AI Providers →
   "Grok via Hermes" (or the Worker App's Hermes tab for private scope) and
   clicks **Connect Grok account**.
2. Server creates a `hermes_provider_connections` row (`pending`) and
   enqueues a control job to the target worker (private scope: the user's
   Worker App handles it locally and reports through the same contract).
3. Worker runs `hermes auth add xai-oauth --no-browser` inside a freshly
   created isolated profile, parses verification URL + user code + expiry,
   and posts them as a `worker_job_events` payload (auth artifacts are
   **not** logged verbatim anywhere else).
4. Web UI shows: "Open official xAI login page" button, copyable code,
   expiry countdown, live status. Thai instruction copy included. No
   credential inputs exist in our UI. The connect screen also shows a
   one-time **data-transfer consent notice**: prompts and reference images
   for jobs routed through this connection are sent to xAI under the
   connected Grok account and are subject to xAI's terms — the user (or
   admin, for `server_shared`) acknowledges this before authorization
   proceeds; the acknowledgement timestamp is stored in `metadataJson`.
5. Hermes polls; on success the worker runs `hermes doctor` + a dry
   capability probe (cheap image call optional/flagged), writes the
   capability manifest, and the connection becomes `authorized`.
6. Failure/timeout → `error` with a typed reason; user may retry.

### 12.2 Capability manifest (stored in `capabilitiesJson`)

```json
{
  "hermesVersion": "x.y.z",
  "probedAt": "...",
  "operations": {
    "image.generate": { "enabled": true, "maxOutputs": 4 },
    "image.edit": { "enabled": true, "maxReferences": 3 },
    "video.generate": { "enabled": true },
    "video.image_to_video": { "enabled": true, "maxReferences": 1 },
    "video.reference_to_video": { "enabled": false, "reason": "unsupported_by_pinned_hermes" }
  },
  "models": { "image": ["grok-imagine-image", "grok-imagine-image-quality"], "video": ["grok-imagine-video"] }
}
```

Re-probed after upgrade, reconnect, and on a slow schedule; the UI and the
submit-time validator both consume it.

**Effective capability rule (global model row vs per-connection
manifest):** `media_models` rows are global, but real limits are
per-connection (different Hermes versions on different workers, different
entitlements). At submit time the validator uses the **intersection**:

```text
effectiveLimit(op, field) = min(mediaModels row declaration,
                                connection.capabilitiesJson[op][field])
operation enabled          = model row enabled AND manifest op.enabled
```

The client form uses the selected connection's manifest for reference
limits, modes, and durations; the model row supplies defaults only when
the manifest has no opinion. A model row must never widen what the
manifest reports (e.g. `maxReferenceImages` on the Hermes-Grok video row
never exceeds the manifest's `video.image_to_video.maxReferences`). This
is the same value VD's existing reference-trimming logic reads (section
11.5), so trimming stays correct per connection.

### 12.3 Entitlement handling

OAuth success ≠ inference entitlement. On a persistent 403 from xAI:

- connection → `entitlement_restricted`; no automatic retries of a
  permanent 403;
- UI message (Thai primary): "เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI
  ยังไม่อนุญาตให้บัญชีนี้ใช้การสร้างสื่อผ่าน OAuth API
  กรุณาตรวจสอบระดับสมาชิก" + English equivalent;
- reconnect allowed after subscription changes.

### 12.4 Disconnect / revocation

Disconnect triggers worker-side `hermes` logout + secure profile removal,
then marks the row `disconnected`. xAI-side revocation detected via 401
after refresh → `reauth_required`. Audit events for connect, authorize,
disconnect, revoke.

---

## 13. Job contract and Hermes CLI adapter

### 13.1 Normalized job input (`worker_jobs.inputJson`)

```json
{
  "contractVersion": 1,
  "operation": "image.edit",
  "connectionId": "…",
  "prompt": "<sanitized user prompt>",
  "settings": { "model": "grok-imagine-image-quality", "aspectRatio": "9:16", "resolution": "2K", "outputCount": 1, "durationSeconds": null },
  "references": [
    { "assetId": "…", "index": 1, "role": "character", "label": "Image 1 = Irin", "sha256": "…" }
  ],
  "entity": { "type": "vertical_drama_shot", "id": "…", "seriesId": "…", "episodeId": "…" },
  "storage": { "libraryFolderId": "…" },
  "traceId": "…"
}
```

Operations (provider-neutral taxonomy, only these enabled in V1):
`image.generate`, `image.edit` (1–3 refs), `video.generate`,
`video.image_to_video` (exactly 1 ref), `video.reference_to_video`
(1–7 refs, capability-gated).

**Reference URL minting rule (claim-time, not enqueue-time):**
`inputJson` deliberately carries only `assetId` + `sha256` per reference —
**never a presigned URL**. Jobs can sit queued for many minutes behind the
per-connection serial queue, so an enqueue-time signed URL could expire
before the worker claims the job; persisting URLs in `worker_jobs` rows
would also leak fetchable links into the DB. Instead:

- the claim response enriches the job payload with fresh short-lived
  presigned GET URLs (`storagePresignGet` over `media_assets`, ownership
  re-verified against the job's tenant/requester at mint time);
- a refresh endpoint `POST /api/worker-jobs/:jobId/references/urls`
  (lease-token authenticated, active lease required) lets the worker
  re-mint URLs mid-job — needed for retries and multi-reference downloads
  that outlive the first URLs' TTL;
- the worker verifies each downloaded file's `sha256` against the contract
  value, so a re-minted URL can never silently substitute different
  content.

### 13.2 Reference validation (before spawn, fail closed)

- count within operation + capability limits; indices continuous;
- MIME/magic-byte check, dimension and size limits, sha256 verify;
- no two labels claim the same index; role labels required for multi-ref;
- conflicting mapping fails the job **before** generation (identity-swap
  protection).

### 13.3 Invocation

```bash
HOME=<profile-home> [HERMES_HOME=<profile>/.hermes] \
NO_COLOR=1 PYTHONUNBUFFERED=1 \
hermes chat --provider xai-oauth --toolsets "image_gen,file" -q "<envelope>"
# video jobs: --toolsets "video_gen,file"
```

- args passed as an argv array — no shell interpolation, control chars
  stripped from the prompt;
- cwd = the job workspace; tool allowlist limited to `image_gen|video_gen`
  + `file`; `terminal`/browser/computer-use toolsets are never enabled on
  media workers;
- deterministic prompt envelope (job id, operation, output dir, ordered
  reference list with roles/labels, "do not reorder/substitute references",
  user prompt, and a required machine-readable result block:
  `SMARTSPECPRO_RESULT_BEGIN {json} SMARTSPECPRO_RESULT_END`).

### 13.4 Output collection (defensive — Hermes is an agent, not an RPC)

1. capture stdout/stderr separately; stream sanitized progress lines as
   `worker_job_events`;
2. parse the result block strictly; if absent/invalid, fall back to
   scanning `./output` in the workspace;
3. reject any path outside the job workspace; validate magic bytes,
   dimensions (image) and `ffprobe` stream/duration/codec sanity (video);
4. if Hermes returns hosted URLs, download them immediately into the
   workspace, then treat as local outputs;
5. upload via existing `init-upload` presigned flow → `complete` →
   `worker_artifacts` → server-side verification → `media_assets` +
   `library_items` registration → job `completed`.

### 13.5 State mapping

The doc's fine-grained states map onto existing `worker_job_status`
(`queued → claimed → preparing → running → uploading → publishing →
completed | failed | canceled | expired`), with sub-stage detail carried in
`worker_job_events` (`downloading_references`, `starting_hermes`,
`generating`, `collecting_output`, `validating_output`,
`registering_library`). Stage-based progress percentages are estimates and
labeled as such in the UI.

### 13.6 Timeouts and retries

Configurable defaults: image soft/hard 5/10 min; video soft/hard 15/30 min;
reference download 2 min/file; no-output inactivity 5 min; OAuth session
10 min. Retryable: transient network, 429, 5xx, interrupted-before-accept,
upload/callback failures (via `retryPolicyJson`, backoff + jitter).
Non-retryable: 401-after-refresh, 403 entitlement, unsupported operation,
reference-limit/mapping errors, policy rejection, cancel. Before a
generation retry the worker checks the workspace for a completed first
attempt to avoid double quota burn. Cancellation kills the local Hermes
process (graceful term → grace period → SIGKILL); UI explains provider-side
work may finish anyway, and a post-cancel result is never auto-published.

### 13.7 Error codes (consolidated)

Every user-visible failure carries a typed code with: internal diagnostic
message, user-safe Thai message, user-safe English message, retryability
flag, and recommended action. Canonical list (extends the platform error
convention; codes surface through both tRPC errors and the task
projection's `errorCode`):

| Code | Retryable | Meaning / action |
|---|---|---|
| `HERMES_DISABLED` | no | feature flag off — option hidden/disabled |
| `HERMES_CONNECTION_REQUIRED` | no | Hermes model selected but user has no authorized connection for this asset type → connect flow CTA |
| `HERMES_CONNECTION_BUSY` | yes (auto-queue refused) | per-connection concurrency/queue slot unavailable right now |
| `HERMES_WORKER_UNAVAILABLE` | user action | assigned worker offline (private: start Worker App; shared: ops alert) |
| `HERMES_RATE_LIMITED` | yes, after retry-after | per-user/tenant submission limiter tripped |
| `HERMES_QUEUE_FULL` | yes, later | queued-jobs cap reached (user or tenant scope) |
| `HERMES_QUOTA_EXHAUSTED` | no (until reset) | `server_shared` connection daily quota spent |
| `HERMES_OAUTH_SESSION_EXPIRED` | user action | device-code expired before sign-in — restart connect |
| `HERMES_OAUTH_DENIED` | user action | user declined authorization on xAI |
| `HERMES_REAUTH_REQUIRED` | user action | token revoked / refresh failed — reconnect |
| `HERMES_ENTITLEMENT_RESTRICTED` | no | OAuth ok but xAI 403 on generation (section 12.3 copy) |
| `HERMES_OPERATION_UNSUPPORTED` | no | operation/mode not in effective capability (e.g. ref2v unsupported) |
| `HERMES_REFERENCE_LIMIT_EXCEEDED` | no | more references than effective `maxReferences` |
| `HERMES_REFERENCE_MAPPING_CONFLICT` | no | mapping validator rejection (VD surfaces reuse `VD_REFERENCE_MAPPING_MISMATCH` semantics) |
| `HERMES_REFERENCE_DOWNLOAD_FAILED` | yes | reference fetch/sha256 failure on worker |
| `HERMES_PROCESS_FAILED` | yes (bounded) | Hermes child exited abnormally |
| `HERMES_TIMEOUT` | yes (bounded) | soft/hard/inactivity timeout hit |
| `HERMES_RESULT_INVALID` | yes (bounded) | result block unparseable AND output scan empty/invalid |
| `HERMES_OUTPUT_INVALID` | no | produced file failed magic-byte/ffprobe validation |
| `HERMES_UPLOAD_FAILED` | yes | artifact upload to storage failed |
| `HERMES_LIBRARY_REGISTRATION_FAILED` | yes | asset/library registration failed after upload |
| `HERMES_JOB_CANCELLED` | no | user/watchdog cancellation |

Thai copy is first-class (not an afterthought translation) and follows the
existing VD error-copy tone; both languages live with the code definitions
so every surface renders them consistently.

---

## 14. Credits and billing

- `creditSource: "provider_account"` — generation cost is borne by the
  user's/tenant's Grok subscription, mirroring MCP provider-account
  semantics.
- Optional platform **service fee** per Hermes job (admin-configured,
  default 0): reserved at enqueue and reconciled at completion via
  `workerBillingService.reserveWorkerJobCredits` /
  `reconcileWorkerJobCredits`; refunded on failure/cancel before
  generation started (same reconciler cascade discipline as portrait
  candidate recovery).
- Usage recorded in `provider_usage_log` (provider `xai-hermes`,
  costUsd unknown → method `provider_account`) and a per-connection usage
  counter for the `server_shared` daily quota.
- `reconcileTaskCredits` (used by VD candidate settlement) must recognize
  `hermes_` task ids and reconcile only the platform fee — see section
  11.6. It must never attempt gateway-style per-generation credit math on
  a `provider_account` job.

---

## 15. Smart AI Hub Worker App integration (private mode)

Extends feature 124's app (`apps/worker-app`) — separate build, so this
ships as a Worker App release alongside the web release:

- **Hermes runtime module** beside the HyperFrames runtime: bundled or
  in-app-downloaded pinned Hermes runtime (user never installs Python/CLI
  manually), per-OS install layout (Windows first, macOS in the same
  feature), readiness check before the worker advertises
  `hermesMedia: true` in `capabilitiesJson`.
- **Runtime upgrades + version skew**: the pinned Hermes version ships
  with (and only with) Worker App releases — no independent self-updating
  Hermes. Because private workers upgrade at different times, version
  skew across the fleet is normal and is handled by design, not by
  synchronization: each connection's capability manifest is re-probed on
  app upgrade and admission control always evaluates against **that
  connection's own manifest** (section 12.2 intersection rule). The
  worker advertises its Hermes version in `capabilitiesJson`; the server
  enforces an admin-configurable minimum supported version — a worker
  below it is marked degraded, is offered no Hermes jobs, and the app UI
  shows an "update required" state.
- **Local profile storage** under the app's data dir
  (`%APPDATA%`/`~/Library/Application Support`), 0700-equivalent ACLs,
  one profile per connection, held out of app logs and crash reports.
- **Connect flow in the app**: the device-code UI can render in the Worker
  App window and/or the web settings page (both consume the same
  connection status API). Tokens never transit the server.
- **Job execution**: same claim/heartbeat/events/artifacts client the
  render path already uses (`worker_control_plane.rs`), new job handlers
  for the two Hermes job types; concurrent-with-render policy: default 1
  Hermes job at a time, render jobs unaffected.
- **Owner binding**: the server only offers `hermes_media_*` jobs whose
  `connectionId` belongs to the worker's registered owner; the worker
  additionally refuses claims for foreign connections (defense in depth).
- **UI**: connection status, current job + stage, last error, Hermes
  version, re-auth prompt when `reauth_required`, diagnostics export with
  tokens redacted.

---

## 16. Security requirements

- No Grok password anywhere; OAuth device-code only, on official xAI pages.
- Tokens: worker-host only, profile-scoped, never in DB/API
  responses/frontend storage/logs/backups; ≤4 chars of any token may
  appear in diagnostics.
- Frontend never submits profile paths, worker ids (except picker of own
  connections), CLI args, or tokens — only `connectionId`; the server
  re-resolves ownership on every hop (submit + claim).
- Job workspace confinement, path-traversal rejection, malicious-filename
  handling, MIME spoof detection, upload scanning hook (reuse
  `uploadContentSafety` gate).
- Worker control-plane auth unchanged (bearer + device proof); the shared
  server worker gets no host-locality privileges.
- Tool allowlist locked to media toolsets; a compromise of the prompt
  cannot reach a shell (envelope treats user text as data; injection
  attempts cannot change toolset or working directory).
- Prohibited designs (acceptance-blocking): global shared `auth.json`;
  implicit cross-user account sharing; client-mapped profile selection;
  job workspaces inside profile dirs; per-user duplicate Hermes installs.
- Audit events: connect/authorize/disconnect/revoke, job submit/claim/
  complete/fail, entitlement failures — via the standard JSONL audit log
  with traceId, respecting prompt-privacy settings.
- Data egress transparency: prompts and reference images leave the
  platform to xAI when a Hermes connection is used. This is disclosed at
  connect time (section 12.1 consent notice); `server_shared` usage means
  all pool users' content transits the admin-connected account — the admin
  UI must state this plainly when creating a shared connection.

---

## 17. Observability

- Metrics: worker online, spawn/failure counts, oauth connects,
  reauth-required, entitlement 403s, jobs by type/status, job duration,
  queue wait, rate-limit rejections, queue-full rejections, upload bytes,
  validation failures, library registration failures.
  **Sink (V1): the existing observability stack, no new metrics system** —
  counters/timings are emitted as JSONL audit-log event types (the
  standard audit protocol) plus `worker_job_events` rows; connection-level
  usage lands in `provider_usage_log` and the per-connection quota
  counters. Admin dashboards read these stores. A Prometheus-style
  exporter is explicitly out of scope.
- Structured logs with worker_id, job_id, tenant/user/connection ids,
  operation, stage, sanitized message.
- Trace: web API → worker_jobs → worker → hermes child → upload → library,
  linked by traceId (queryable through the existing audit-log protocol).
- Admin dashboard additions on the existing worker admin surface: Hermes
  workers, connections per scope, quota consumption, kill-switch state.

---

## 18. Feature flags and rollout

| Flag | Default | Gates |
|---|---|---|
| `hermes_worker_enabled` | off | everything (models hidden when off) |
| `hermes_worker_shared_pool_enabled` | off | `server_shared` scope |
| `hermes_worker_server_personal_enabled` | off | `server_personal` scope |
| `hermes_worker_private_enabled` | off | Worker App module + `private_worker` scope |
| `hermes_worker_video_enabled` | off | video job types |
| `hermes_worker_reference_to_video_enabled` | off | ref2v mode (also capability-gated) |

All fail closed: flag off ⇒ option disabled with reason, submit rejected.

Rollback: turning the flags off fully reverts user-visible behavior — no
migration rollback is ever needed (`hermes_provider_connections` and the
new jobType/transport values are purely additive; existing MCP/gateway
paths are untouched by the transport-helper generalization, which must be
verified by the existing MCP/gateway test suites passing unchanged).
In-flight Hermes jobs at flag-off time run to completion or are cancelled
by admin via the standard worker-jobs admin surface.

### Phases

1. **Foundation** — schema (`hermes_provider_connections`) **with the full
   Drizzle migration cycle run immediately** (`pnpm db:push` + journal
   verified, per the Database Safety Protocol); transport union +
   VD transport-helper generalization; `hermesMediaScheduler` + admission
   control; `media.getTask` `hermes_` branch + monitor/fee-reconcile glue
   (section 11.6); shared worker unit; OAuth connect flow; capability
   probe; text-to-image; Library registration; admin management UI for
   `server_shared` connections.
2. **Image surfaces** — 1–3 ref edit + mapping validation; **all VD image
   surfaces from the section 11.5 table (rows 1–8 and 10)**: character
   portrait, character sheets, portrait candidate batch (serial-queue UX),
   location image, start-frame, angle variations, shot repair, reference
   frame, **and the ad-banner remediation (transport branch + fail-closed
   guard, surface #10)**; VD panel picker wiring
   (`HermesConnectionPicker`, localStorage keys, per-episode persistence,
   auto-hydration).
3. **Video** — text-to-video, image-to-video, long-job UX, ffprobe
   validation; **VD `generateVideoClip` integration** including
   `maxReferenceImages`-driven reference trimming, `grok`
   prompt-formatter family mapping, and the **`resolveEpisodeVideoModel`
   fail-closed remediation (surface #9)**.
4. **Private worker** — Worker App Hermes module (Windows → macOS),
   private scope end-to-end across the same VD surfaces.
5. **Reference-to-video + hardening** — capability-gated ref2v (≤7),
   quotas dashboard, canary Hermes upgrades, group sharing of
   `server_personal` connections.

Phases 1–4 are the committed scope of "this iteration" per the product
requirement (both deployment modes working); phase 5 items may trail.
Scope-risk note: phase 4 is a cross-platform desktop deliverable and is
deliberately **sequentially gated** — it starts only after phases 1–3 have
been validated on the shared server worker in production, it ships as an
independent Worker App release, and it hides behind its own flag
(`hermes_worker_private_enabled`). If phase 4 slips, phases 1–3 still
deliver a complete shared-mode product; the private mode remains committed
but its timeline must not block enabling the shared mode.

---

## 19. Hermes version policy

Pin an exact tested Hermes version per worker release. Upgrade procedure:
candidate image/bundle → compatibility tests (OAuth login, `chat -q`,
toolset names, image/video backends, multi-image behavior, result parsing,
logout/refresh) → publish capability diffs → canary one worker → gradual
rollout. Never auto-track "latest" in production. CLI flag/profile-option
availability is validated at provisioning, not assumed from docs.

---

## 20. Testing plan

- **Unit**: envelope builder; result-block parser (valid/absent/malformed/
  multiple); path confinement; reference ordering + limit + mapping-conflict
  validation; MIME/magic validation; error classification + retryability;
  admission-control limiter math incl. the limit-coherence invariant
  (queued cap ≥ max batch size); idempotency-key derivation; transport
  resolution (`hermes_worker` rows, fail-closed on missing model);
  capability-manifest gating + effective-capability intersection;
  error-code classification table (retryability per section 13.7).
- **Integration** (Hermes mocked with a fake CLI binary): enqueue→claim→
  events→artifact→library happy path for each operation; OAuth device-code
  session lifecycle incl. timeout and revocation; 403 entitlement path;
  cancel mid-run; worker restart mid-job (lease expiry + requeue);
  private-scope owner binding (foreign worker cannot claim); rate-limit and
  queue-full rejections; credit fee reserve/reconcile/refund;
  `media.getTask` with `hermes_` ids (ownership, status mapping, completed
  asset URLs); claim-time reference URL minting + mid-job refresh endpoint
  (expired-URL retry path, sha256 mismatch rejection); claim gating —
  worker without `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY` never claims a
  `hermes_media_*` job (remotion-precedent assertion); full portrait batch
  (4 candidates) admits under default limits in one submit.
- **VD integration** (per section 11.5, each surface): a Hermes model id
  passes each resolver's fail-closed guard and routes to the scheduler via
  the shared transport helpers (both copies); portrait-candidate batch on
  one connection runs serially and `settlePortraitCandidate` settles
  `hermes_` tasks incl. stuck-task recovery + fee refund; VD
  reference-mapping validator rejects a conflicting mapping **before**
  enqueue; `generateVideoClip` trims references to the Hermes model's
  `maxReferenceImages` (Grok = 1 start frame) using the existing trimming
  path; video prompt formatter resolves Hermes-Grok ids to family `grok`;
  per-series remembered Hermes model auto-hydrates on a new episode only
  while the model is enabled and a connection is authorized; storyboard
  panel prop threading (`hermesConnectionId`) through EpisodeWorkspace;
  fail-closed remediations: `resolveEpisodeVideoModel` with empty/disabled
  selection → BAD_REQUEST (no silent `DEFAULT_MODELS.video` fallback) and
  ad-banner with empty model → BAD_REQUEST (no silent
  `DEFAULT_MODELS.image` fallback), with a Hermes/MCP model id routing
  through the shared transport helper in both; effective-capability
  intersection: a connection whose manifest reports a lower
  `maxReferences` than the model row wins at submit time; picker shows the
  kie.ai Grok models and Hermes-Grok models as distinct, unambiguous
  entries.
- **Security**: path traversal via result block; prompt injection
  attempting toolset/dir escape; malicious filename; oversized/fake-MIME
  reference; token leakage grep over logs/API payloads; cross-user
  connection access attempts; signed-URL expiry.
- **Worker App**: runtime install/readiness, local profile ACLs, claim
  filtering, re-auth UX.

### Acceptance criteria

- A user can connect a Grok account entirely through SmartSpecPro UI (or
  Worker App for private scope); no password ever enters the platform.
- "Grok via Hermes" models appear in the normal media model picker
  alongside gateway and MCP models, correctly gated by connection state,
  worker status, flags, and capability manifest.
- Image generation and 3-reference image edit complete and appear in
  Library with correct lineage and preserved reference order.
- Video generation and image-to-video complete via both a shared server
  worker and a private Worker App worker.
- **Every Drama Series generation surface in the section 11.5 table works
  with a Hermes model end-to-end** (character portrait, character sheet,
  portrait candidate batch, location image, start-frame, angle variations,
  shot repair, reference frame, video clip, ad banner), with existing
  polling, stuck-task recovery, and per-episode/per-series model memory
  behaving identically to MCP models.
- Both silent-fallback paths are removed — ad-banner
  (`DEFAULT_MODELS.image`) and `resolveEpisodeVideoModel`
  (`DEFAULT_MODELS.video`); every VD generation surface fails closed on an
  empty or disabled model selection — zero silent-fallback paths remain in
  Drama Series.
- "Grok Imagine" (kie.ai, platform credits) and "Grok via Hermes" (user
  subscription) are visually and textually distinguishable at every model
  picker, and jobs never route between the two paths automatically.
- Shared-pool limits demonstrably reject excess load with typed errors;
  the web service stays healthy under saturated Hermes load (worker unit
  isolation verified).
- Private jobs are only ever claimed by the owner's worker.
- Unsupported reference-to-video is visibly blocked, never silently
  degraded.
- 403 entitlement is explained in Thai + English; permanent 403 is not
  retried.
- No OAuth token appears in DB, logs, API responses, or frontend storage.

---

## 21. Key implementation decision (carried from source doc, adapted)

Hermes is a **controlled worker child process**, never the system of
record. SmartSpecPro owns UX, configuration, job state, queue, media
inputs, storage, Library, permissions, lineage, and audit. Hermes owns xAI
OAuth token handling/refresh and Grok tool execution inside its profile.
The `hermes_worker` transport + normalized job contract mean the adapter
can later be swapped (e.g. official xAI API-key provider) without touching
the picker, queue, Library, or job schemas.

---

## 22. Source references

1. Hermes Agent — xAI Grok OAuth: https://hermes-agent.nousresearch.com/docs/guides/xai-grok-oauth
2. Hermes Agent — CLI: https://hermes-agent.nousresearch.com/docs/user-guide/cli
3. Hermes Agent — Toolsets: https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference
4. xAI — Multi-Image Editing: https://docs.x.ai/developers/model-capabilities/images/multi-image-editing
5. xAI — Reference-to-Video: https://docs.x.ai/developers/model-capabilities/video/reference-to-video
6. xAI — Image-to-Video: https://docs.x.ai/developers/model-capabilities/video/image-to-video
7. xAI — Video Generation: https://docs.x.ai/developers/model-capabilities/video/generation
8. External source document: "SmartSpecPro – Hermes Grok Media Worker Development Specification v1.1" (2026-07-16), adapted per `request.md`
