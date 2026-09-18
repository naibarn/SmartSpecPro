# Spec 204 - Cloudflare Container Runtime Control Plane
## Unified Production Development Specification
**Spec ID:** 204
**Project:** SmartAIHub / SmartSpecPro  
**Status:** Proposed / Ready for implementation planning  
**Target:** Cloudflare-first production architecture  
**Primary goal:** Migrate appropriate Tauri + Sidecar workloads to Cloudflare Containers while retaining Local Runtime for GPU/device-specific work  
**Related:** Unified Job Control Plane, SmartAIHub Runner (Feature 205), Worker App / Desktop Runtime, Media Studio, Video Editor, Hermes Agents, Codex/Sandbox workloads

---

## 1. Executive Summary

SmartAIHub SHALL introduce a **Cloudflare Container Runtime Control Plane** that treats Cloudflare Containers as elastic compute workers behind the existing Unified Job Control Plane.

The design MUST NOT migrate the entire Tauri application into a container. Instead:

- Web UI remains on SmartAIHub.
- Cloudflare Workers / Durable Objects / Workflows provide control-plane orchestration.
- Existing Tauri sidecars are refactored into **runtime services** with clean APIs.
- CPU/Linux workloads move to Cloudflare Containers where appropriate.
- GPU, local-file, Windows/macOS, device, ComfyUI, local-model and desktop-automation workloads remain available through **SmartAIHub Local Runtime**.
- External image/video generation APIs (KIE, WaveSpeed, fal, etc.) SHOULD normally be called from Worker/Workflow directly, not through a Container.
- Long external provider waits MUST use webhook/callback first and polling fallback; Containers MUST NOT remain running only to wait for an external provider.

Cloudflare Containers are also a **`SHARED_CONTAINER_RUNNER` execution-node
profile** under Feature 205. Feature 204 owns the Cloudflare-specific
provisioning, pool, autoscaling, hard cost ceiling, image deployment and
container lifecycle. Feature 205 owns the Runner-compatible execution
entrypoint, process/workspace isolation, provider-neutral event/result contract
and runtime behavior inside an instance. Every Container Job is admitted,
leased, fenced and observed through the canonical `worker_jobs` plus outbox
control plane; a user MUST NOT control a Container directly or create a
container-local task ledger.

The shared Container profile uses the same Feature 205 snapshot vocabulary but
does not scan a host or discover arbitrary binaries at runtime. Each image
publishes only the tool/adapter families explicitly allowlisted in its pinned
manifest (which may include Codex, Claude Code, DeepSeek Harness, Google
Antigravity, Hermes or OpenClaw-compatible runtimes) plus its approved media,
browser or local-AI utilities. Feature 204 owns image/manifest deployment;
Feature 205 validates the in-container entrypoint and registers the bounded
redacted inventory. A shared image capability is never presented as a
per-user local-device tool.

Initial production policy SHALL favor **conservative queue-first operation** over aggressive autoscaling. For video rendering, one render Container should normally drain the queue; a second Container is opened only after sustained queue delay and a health check confirms the first worker is healthy.

---

# 2. Design Principles

## 2.1 Core principles

1. **Queue is normal, not failure.**
   - Render jobs are background jobs.
   - A user does not need every render to begin immediately.
   - Initial acceptable queue delay for video rendering: up to approximately **15 minutes** before burst scaling is considered.

2. **Scale only after proving the existing worker is healthy.**
   - A growing queue may mean capacity shortage.
   - It may also mean FFmpeg is stalled, a child process is stuck, an input is corrupt, network I/O is hanging, or a runtime has degraded.
   - Autoscaling MUST NOT hide runtime failures.

3. **Hard cost ceilings are mandatory.**
   - Every runtime type MUST have a Cloudflare deployment-level `max_instances` hard limit.
   - Application-level soft limits MUST be configurable from the Admin UI and MUST never exceed the deployment hard limit.

4. **Container filesystem is disposable.**
   - Container local disk is temporary.
   - Job inputs and outputs belong in R2 or another persistent store.
   - Source of truth for jobs, status, billing and leases remains outside the Container.

5. **One image must not contain everything.**
   - Separate runtime images by dependency family and security boundary.
   - Reuse a common base layer where useful.

6. **Shared Containers are allowed only for stateless queue workers.**
   - Hermes/Codex/session workspaces MUST be isolated.
   - Media utility workers MAY process jobs from multiple users sequentially if every job has an isolated workspace.

7. **No external waiting inside Containers.**
   - After submitting a provider job and persisting its provider task ID, a Container MAY stop.
   - Completion MUST resume through webhook, Workflow event, or fallback polling.

8. **UI-first operations.**
   - Routine tuning MUST be possible through SmartAIHub Admin UI.
   - Operators should not need to edit source code or Wrangler configuration for normal tuning.
   - Settings that require a Cloudflare deployment change MUST be clearly labeled as such.

---

# 3. Cloudflare Platform Assumptions

As of 2026-09, Cloudflare Containers support:

| Instance type | vCPU | Memory | Disk |
|---|---:|---:|---:|
| `lite` | 1/16 | 256 MiB | 2 GB |
| `basic` | 1/4 | 1 GiB | 4 GB |
| `standard-1` | 1/2 | 4 GiB | 8 GB |
| `standard-2` | 1 | 6 GiB | 12 GB |
| `standard-3` | 2 | 8 GiB | 16 GB |
| `standard-4` | 4 | 12 GiB | 20 GB |

Custom types may be used within current Cloudflare constraints. Container images must support `linux/amd64`. Image size must fit the selected instance disk. Current account image storage defaults to 50 GB total.

`max_instances` in Wrangler configuration is treated by this specification as the **Cloudflare hard safety cap**.

Cloudflare currently expects applications to control Container instance creation/routing; therefore SmartAIHub SHALL implement its own conservative Runtime Scheduler.

---

# 4. Target Architecture

```text
                         SmartAIHub Web UI
                                │
                                ▼
                        Cloudflare Worker API
                  Auth / Tenant / Credits / Policy
                                │
                                ▼
                    Unified Job Control Plane
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
          Workflows          Queues          Durable Objects
              │                                   │
              └─────────────────┬─────────────────┘
                                ▼
                         Runtime Scheduler
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
              ▼                 ▼                  ▼
       Cloudflare Runtime   Sandbox Runtime    Local Runtime
              │                                    │
   ┌──────────┼──────────┐                  ┌──────┼─────────┐
   ▼          ▼          ▼                  ▼      ▼         ▼
FFmpeg     Hermes      Python/Rust         GPU   ComfyUI   Local AI
Remotion   Document    CPU Tools                 FFmpeg-GPU
```

The Runtime Scheduler SHALL expose a provider-neutral interface:

```text
ExecutionRuntime
- submit(job)
- getStatus(job)
- cancel(job)
- heartbeat(job)
- reportProgress(job)
- streamLogs(job)
- getResult(job)
- drain(instance)
- stop(instance)
- destroy(instance)
```

Implementations:

- `CloudflareContainerRuntime`
- `CloudflareSandboxRuntime`
- `DesktopLocalRuntime`
- future runtime adapters

---

# 5. Runtime Target Selection

Every job SHALL declare runtime requirements rather than hard-code a specific execution backend.

Example:

```yaml
runtime_requirements:
  cpu_class: heavy
  vcpu_min: 2
  memory_min_mib: 4096
  disk_min_mb: 8000
  gpu: false
  filesystem: temporary
  internet: restricted
  isolation: job
  expected_duration_sec: 240
```

The Runtime Router SHALL select one of:

- `CLOUD_SHARED`
- `CLOUD_JOB_ISOLATED`
- `CLOUD_SESSION_ISOLATED`
- `SANDBOX`
- `LOCAL`
- `EXTERNAL_PROVIDER_NO_CONTAINER`

Admin MAY force a runtime target for testing, but `AUTO` MUST remain the default.

---

# 6. Container Types

## 6.1 Runtime taxonomy

SmartAIHub SHALL begin with the following Container classes. Do not create more types until telemetry demonstrates a need.

### A. `media-utils-runtime`

**Mode:** Shared stateless queue worker  
**Purpose:** Short, deterministic media utilities.

Typical jobs:

- FFprobe metadata
- thumbnail extraction
- audio metadata
- lightweight image conversion
- image resize
- waveform generation
- container/codec inspection
- subtitle format conversion
- short clip extraction

**Initial instance:** `standard-1` or `standard-2` after benchmark  
**Concurrency:** configurable; start at 2 lightweight jobs per instance  
**Queue scale threshold:** 1–3 minutes  
**Isolation:** per-job temporary directory

Image contents:

- FFmpeg + FFprobe
- small Rust or Python HTTP runtime service
- ImageMagick/libvips only if actually required
- CA certificates, curl, jq
- process supervisor/init (`tini` or equivalent)

Do NOT include:

- Chromium
- Hermes
- Codex
- large ML models
- ComfyUI

---

### B. `video-render-runtime`

**Mode:** Shared queue worker, one heavy render at a time  
**Purpose:** CPU FFmpeg rendering and AI-editor post processing.

Typical jobs:

- final video render
- timeline composition where FFmpeg is sufficient
- crop/reframe
- burned-in subtitle
- watermark
- audio mix / ducking / crossfade
- transition/filter graph
- rough-cut assembly
- final mux/export

**Initial instance:** `standard-4` for baseline benchmark  
**Alternative benchmark:** `standard-3`  
**Concurrency:** `1 heavy job/container`  
**Normal soft max:** `1`  
**Burst soft max:** `2`  
**Cloudflare hard max:** recommended initial `2` or `3`

**Initial scale-up philosophy:** queue-first conservative.

A single instance SHALL drain queued work continuously until the queue is empty. The system MUST NOT restart a Container between normal render jobs.

Image contents:

- pinned FFmpeg/FFprobe build
- required codecs only
- SmartAIHub render-runtime service
- fonts required for subtitle rendering
- deterministic font manifest/version
- optional small Python/Rust helper binaries
- `tini`

Do NOT put Remotion/Chromium in this image unless benchmark demonstrates a compelling reason. Keep Remotion separate because Chromium/Node materially enlarges the image and changes failure/resource characteristics.

---

### C. `remotion-render-runtime`

**Mode:** Shared queue worker OR job-isolated depending on stability benchmark  
**Purpose:** Remotion composition/rendering that genuinely requires Node/Chromium.

Typical jobs:

- React/Remotion compositions
- template-based motion graphics
- HTML/CSS scene rendering

**Initial instance:** `standard-4`  
**Concurrency:** 1 render/container initially  
**Normal soft max:** 0 or 1, on demand  
**Burst soft max:** 1–2 after production measurement

Image contents:

- pinned Node LTS
- pinned Remotion packages
- compatible Chromium/headless dependencies
- fonts
- FFmpeg if Remotion pipeline requires it
- SmartAIHub Remotion runtime API

This image MUST be separate from normal FFmpeg rendering.

---

### D. `document-runtime`

**Mode:** Shared stateless queue worker  
**Purpose:** CPU document transformation/parsing that cannot be handled efficiently in Worker runtime.

Typical jobs:

- PDF/document conversions
- archive handling
- office document transformations if a supported CLI is required
- text extraction requiring native libraries

**Initial instance:** `basic` or `standard-1`  
**Concurrency:** 2–4 lightweight jobs after benchmark

Do NOT use this Container for ordinary Worker-compatible JSON/text processing.

---

### E. `hermes-runtime`

**Mode:** Session-isolated  
**Purpose:** Hermes Agent execution.

**Mapping:** one active Hermes agent/session -> one explicit Container ID  
**Initial instance:** `standard-2`; benchmark `standard-3` for heavier tooling  
**Persistence:** external; Container disk is disposable  
**Idle grace:** 10–20 minutes, configurable

When this runtime is selected as a shared execution node, its concrete
process/workspace and provider-neutral Runner contract come from Feature 205's
SHARED_CONTAINER_RUNNER profile. A Hermes session may receive explicit
Container affinity, but the Container remains a managed pool resource and must
not become a permanent per-user device or a second Job ledger. Feature 204
continues to own lifecycle, pool, cost and rollout decisions.

Image contents:

- Hermes Agent pinned version
- Python/runtime dependencies
- SmartAIHub Hermes adapter/bootstrap
- selected safe CLI tools
- `tini`

Persistent data MUST NOT depend on local `state.db` surviving Container sleep. SmartAIHub SHALL externalize durable session metadata, configuration, artifacts and long-lived memory.

Hermes runtime SHOULD access SmartAIHub tools through MCP/Core APIs rather than bundling every tool into the image.

---

### F. `code-sandbox-runtime`

**Mode:** Job-isolated / session-isolated  
**Purpose:** untrusted or semi-trusted code execution, temporary repository workspaces, build/test commands.

Preferred implementation SHOULD evaluate Cloudflare Sandbox before a generic Container because sandbox semantics match this workload.

If Containers are used:

- explicit instance ID per job/session
- no cross-user reuse
- strict egress policy
- strict resource/time limits
- destroy after job/session

**Initial instance:** `standard-1` / `standard-2`, selected per job

Image contents MAY include:

- git
- Node
- Python
- common build tools

Do NOT include production secrets in the image or environment.

---

### G. Optional future `cpu-ml-runtime`

Only introduce if SmartAIHub has CPU inference workloads that are proven practical within Cloudflare limits.

Do NOT move GPU-oriented workloads here.

Remain on Local Runtime for:

- ComfyUI
- CUDA FFmpeg
- local image/video generation models
- GPU ASR/TTS if acceleration is required
- Ollama/vLLM GPU workloads
- models requiring >12 GiB RAM or large persistent local model caches

---

# 7. Workloads That SHOULD NOT Use a Container

## 7.1 External async generation APIs

KIE, WaveSpeed, fal and similar HTTP providers SHOULD use:

```text
Worker / Workflow
      ↓
Submit provider job
      ↓
Persist provider_job_id
      ↓
WAITING_EXTERNAL
      ↓
Webhook callback
      │
      └─ callback overdue -> polling fallback
      ↓
Ingest output -> R2
```

A Container MAY be used for pre-processing or post-processing, but MUST NOT remain alive only to wait for a remote generation job.

## 7.2 Lightweight Cloudflare-native tasks

If a task can execute safely and efficiently in Worker runtime, avoid a Container.

---

# 8. Container Image Strategy

## 8.1 Common base image

Create a controlled base image:

```text
smartaihub/runtime-base:<version>
```

Recommended characteristics:

- Debian slim or another minimal glibc Linux base
- `linux/amd64`
- fixed digest/pinned base image
- CA certificates
- timezone data only if required
- curl/jq only where operationally useful
- non-root runtime user
- writable directories limited to `/tmp` and `/workspace`
- `tini`/init for child-process cleanup
- no application credentials
- no tenant/user configuration

Prefer multi-stage Docker builds.

## 8.2 Image naming

```text
registry.cloudflare.com/<account>/smartaihub-media-utils:<semver>-<gitsha>
registry.cloudflare.com/<account>/smartaihub-video-render:<semver>-<gitsha>
registry.cloudflare.com/<account>/smartaihub-remotion-render:<semver>-<gitsha>
registry.cloudflare.com/<account>/smartaihub-document:<semver>-<gitsha>
registry.cloudflare.com/<account>/smartaihub-hermes:<semver>-<gitsha>
registry.cloudflare.com/<account>/smartaihub-code-runtime:<semver>-<gitsha>
```

Never deploy production with mutable `latest` as the only traceable identifier.

## 8.3 Example base Dockerfile pattern

```dockerfile
FROM debian:bookworm-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 runtime
RUN mkdir -p /workspace /tmp/smartaihub \
 && chown -R runtime:runtime /workspace /tmp/smartaihub

USER runtime
WORKDIR /app

ENTRYPOINT ["/usr/bin/tini", "--"]
```

Actual base version/digest MUST be pinned by CI and periodically refreshed.

## 8.4 Example video-render image pattern

```dockerfile
FROM smartaihub/runtime-base:<PINNED> AS runtime

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fontconfig \
 && rm -rf /var/lib/apt/lists/*

COPY ./fonts /opt/smartaihub/fonts
COPY ./bin/render-runtime /app/render-runtime

RUN fc-cache -f
USER runtime

EXPOSE 8080
CMD ["/app/render-runtime", "--port", "8080"]
```

Production SHOULD pin the exact FFmpeg build/version rather than silently accepting distro package drift.

## 8.5 Example Hermes image pattern

```dockerfile
FROM smartaihub/runtime-base:<PINNED>

# Install pinned Python/runtime and pinned Hermes version.
# Copy only bootstrap/config templates; persistent user state is restored externally.

COPY ./bootstrap /app/bootstrap
EXPOSE 8642
CMD ["/app/bootstrap/start-hermes"]
```

## 8.6 Image build requirements

Every image MUST provide:

- `/health/live`
- `/health/ready`
- runtime version endpoint
- image version/git SHA in logs
- graceful SIGTERM handling
- child-process cleanup
- predictable exit codes
- structured JSON logs

Images SHOULD include an OCI label set:

```text
org.opencontainers.image.revision
org.opencontainers.image.version
org.opencontainers.image.created
smartaihub.runtime.type
smartaihub.runtime.api_version
```

---

# 9. Registry and Deployment Strategy

Cloudflare managed registry SHOULD be the preferred production registry unless another registry is required.

Benefits:

- integrated authentication
- image layers uploaded by Wrangler
- avoids external registry pull-rate/egress concerns

Supported workflow:

```text
GitHub
  ↓
CI test/build
  ↓
Build linux/amd64 image
  ↓
Security checks
  ↓
Push Cloudflare Registry
  ↓
Deploy staging Worker + Container config
  ↓
Smoke test
  ↓
Production rollout
```

Cloudflare deployment of Worker code and Container rollout is not fully transactional. Therefore production MUST have:

- staging environment
- smoke test of required ports
- image/version visibility in Admin UI
- rollback procedure
- previous image retained until rollout is confirmed

The Admin UI MUST distinguish:

- **Runtime settings**: change immediately without redeploy
- **Deployment settings**: require image/config deploy

Examples of deployment settings:

- Cloudflare `max_instances` hard cap
- instance type if implemented directly in Wrangler target
- image reference
- required ports
- container class binding

---

# 10. Wrangler / Deployment Hard Caps

Example production concept:

```jsonc
{
  "containers": [
    {
      "class_name": "VideoRenderContainer",
      "image": "registry.cloudflare.com/<ACCOUNT>/smartaihub-video-render:<PINNED>",
      "instance_type": "standard-4",
      "max_instances": 3
    }
  ]
}
```

`max_instances` MUST be treated as a last-line cost/safety limit, not normal autoscaling target.

Application UI defaults for the above could be:

```text
normal_soft_max = 1
burst_soft_max  = 2
cloudflare_hard_max = 3
```

The scheduler MUST enforce:

```text
active <= normal/burst soft policy <= cloudflare hard max
```

---

# 11. Video Render Queue Policy — Initial Production Defaults

This section is intentionally conservative.

## 11.1 Initial behavior

```text
Normal containers: 1
Burst containers: 2
Concurrency/container: 1 heavy render
Queue allowed: YES
Scale threshold: oldest queued job >= 15 minutes
```

A single render Container SHALL continuously drain queued render jobs.

The system SHOULD accept that users may wait several minutes for background rendering.

## 11.2 Scale-up decision

When oldest queued job reaches the configured threshold (default 15 minutes):

1. Check active Container health.
2. Check current render progress.
3. Check current job ETA.
4. Check whether no-progress/stall conditions exist.
5. Check queue backlog.
6. Check application burst soft max.
7. Check Cloudflare hard max.
8. Check hourly/daily cost circuit breaker.
9. Only then start one additional Container.

Pseudo logic:

```text
IF oldest_queue_age < scale_threshold:
    do nothing

IF oldest_queue_age >= scale_threshold:
    IF primary_worker_unhealthy_or_stalled:
        recover_worker_before_scaling
    ELSE IF active_instances < burst_soft_max
         AND cost_budget_ok
         AND queue_still_requires_capacity:
        start exactly +1 instance
```

Initial scale-up step MUST be `+1`, not a large burst.

## 11.3 Do not scale if existing worker is almost free

If the earliest healthy Container is expected to become available soon, the scheduler MAY continue waiting even after the 15-minute threshold.

Initial configurable rule:

```text
if earliest_available_eta <= 120 seconds:
    prefer_waiting = true
```

The Admin UI SHALL expose this as **“Prefer waiting if a worker will free within”**.

---

# 12. FFmpeg Progress and ETA

FFmpeg jobs MUST use machine-readable progress, e.g. `-progress pipe:1` or equivalent.

Capture at minimum:

- `frame`
- `fps`
- `out_time`
- `speed`
- bytes/output growth where available
- last progress timestamp

ETA formula after sufficient progress sample:

```text
remaining_video_time = duration - out_time
eta_seconds ≈ remaining_video_time / speed
```

The scheduler SHALL use:

1. historical estimate before render starts;
2. real FFmpeg progress/speed after warm-up.

Historical profiles SHOULD be keyed by:

- runtime image version
- instance type
- codec/encoder
- preset
- resolution
- fps
- filter profile
- subtitle burn-in yes/no
- overlay count / complexity bucket

Initial planning assumption for a 5-minute 1080x1920 CPU render MAY use a conservative 5–8 minute budget until real telemetry exists. This is a scheduling seed, not a performance guarantee.

---

# 13. Worker Health, Stall Detection and Runaway Protection

This is a mandatory requirement.

## 13.1 Separate liveness from progress

A Container may be alive while the job is stuck.

Track both:

```text
last_heartbeat_at
last_progress_at
```

Initial video-render defaults:

| Guard | Default |
|---|---:|
| runtime heartbeat | 30 sec |
| progress sample/report | 30–60 sec |
| suspect no progress | 180 sec |
| hard no progress | 300 sec |
| startup ready deadline | 60 sec |
| idle grace after queue empty | 180 sec |

These values MUST be editable in UI.

## 13.2 Recovery sequence

```text
No progress threshold exceeded
        ↓
mark SUSPECT
        ↓
collect process + FFmpeg state
        ↓
confirm no progress
        ↓
mark STALLED
        ↓
SIGTERM current job/process
        ↓
grace period
        ↓
force kill process if needed
        ↓
clean workspace
        ↓
retry job according to policy
        ↓
if runtime health uncertain -> DRAIN + recycle Container
```

Do not immediately create more Containers when the primary cause is a stuck worker.

## 13.3 Job hard runtime

Every job MUST have a maximum runtime.

Recommended initial render rule:

```text
hard_runtime = max(configured_floor, estimate * multiplier)
```

Suggested defaults:

- estimate multiplier: 3x
- minimum render hard timeout: 30 minutes
- default max render hard timeout: 60 minutes
- Admin may override for known long jobs

## 13.4 Container recycling

Initial video-render recycle policy:

- max jobs before recycle: 30
- max lifetime: 4–6 hours
- recycle on OOM
- recycle after repeated child-process failures
- recycle after stuck-job recovery if cleanup confidence is low

Recycling SHALL use `DRAINING` first:

```text
RUNNING -> DRAINING -> finish current job -> no new jobs -> stop -> replacement as needed
```

---

# 14. Cost Circuit Breakers

Each runtime type SHALL support:

```text
soft_max_instances
cloudflare_hard_max_instances
max_container_starts_per_window
max_active_runtime_minutes_per_hour
max_estimated_cost_per_hour
max_estimated_cost_per_day
max_single_container_age
max_single_job_runtime
```

Recommended initial Video Render safety values:

```text
normal_soft_max = 1
burst_soft_max = 2
cloudflare_hard_max = 3 (or 2 for the most conservative launch)
max_starts_per_10m = 2
max_container_age = 6h
```

When a cost guard is hit:

- DO NOT start another Container.
- Keep new jobs queued.
- Show an Admin alert.
- Continue healthy active jobs.
- Do not terminate a healthy active user job solely because the burst budget was reached unless an explicit emergency budget policy requires it.

---

# 15. Container Lifecycle State Machine

Use explicit instance states:

```text
STOPPED
  ↓
STARTING
  ↓
READY
  ↓
BUSY
  ↓
DRAINING
  ↓
IDLE_GRACE
  ↓
STOPPING
  ↓
STOPPED
```

Abnormal states:

```text
SUSPECT
STALLED
ERROR
OOM
RECYCLE_REQUIRED
```

State transitions MUST be written to `worker_job_events` / runtime events for auditability.

---

# 16. Per-Job Workspace Isolation

Shared queue workers MAY process different users sequentially, but filesystem isolation is mandatory.

Example:

```text
/workspace/jobs/<job_id>/input/
/workspace/jobs/<job_id>/work/
/workspace/jobs/<job_id>/output/
```

Rules:

1. Workspace path is generated from internal job ID, never raw user input.
2. Download only objects authorized for that job.
3. Output is uploaded to R2 before job is marked completed.
4. Job workspace is deleted after successful upload/finalization.
5. Cleanup is retried after failed jobs.
6. Startup routine removes stale workspaces not associated with valid active leases.
7. No user A workspace may be visible to user B job logic.

---

# 17. Persistence and R2

Container local disk MUST NOT be the source of truth.

Persistent responsibilities:

| Data | Storage |
|---|---|
| source media | R2 |
| render output | R2 |
| temporary provider URL | job metadata only |
| job state | PostgreSQL/D1 according to Core architecture |
| job events | Unified Job Control Plane |
| container runtime coordination | Durable Object / job DB |
| Hermes durable data | external platform storage |
| logs/metrics | Observability / Analytics / optional R2 archive |

Containers MAY access Cloudflare bindings through Worker outbound handlers. Prefer scoped handlers rather than embedding broad Cloudflare API credentials into Containers.

---

# 18. Network and Secret Security

Default policy for sensitive runtime types:

- `enableInternet = false` where practical.
- allow only required hosts.
- inject third-party credentials in Worker outbound handlers when feasible.
- never bake API keys in images.
- never expose tenant secrets to shared stateless runtime unless unavoidable and scoped to one request.
- Hermes and code runtime require stricter egress policy than media rendering.

Outbound policy SHOULD be configurable per runtime profile but changes affecting security MUST require elevated Admin permission.

---

# 19. Unified Job Control Plane Integration

Extend existing `worker_jobs` rather than creating another independent job system.

Recommended fields (adapt naming to existing schema):

```text
runtime_target
runtime_type
runtime_profile_id
container_instance_id
runtime_image_version
runtime_state
runtime_started_at
runtime_finished_at
runtime_heartbeat_at
job_progress_at
progress_percent
estimated_runtime_sec
estimated_remaining_sec
queue_entered_at
queue_started_at
external_provider_job_id
cost_reservation_id
retry_count
stall_count
```

Container runtime events SHOULD include:

```text
CONTAINER_START_REQUESTED
CONTAINER_STARTED
CONTAINER_READY
JOB_ASSIGNED
JOB_STARTED
JOB_PROGRESS
JOB_COMPLETED
JOB_FAILED
JOB_STALLED
JOB_RETRYING
CONTAINER_DRAINING
CONTAINER_STOPPED
CONTAINER_DESTROYED
CONTAINER_OOM
COST_GUARD_TRIGGERED
SCALE_UP_REQUESTED
SCALE_UP_SKIPPED
```

---

# 20. Credits and Runtime Metering

Container migration MUST integrate with SmartAIHub credits using:

```text
RESERVE -> METER -> SETTLE -> RECONCILE
```

Do not bill users directly for platform idle grace.

For a job:

```text
User Charge
= provider/API cost
+ billable active runtime
+ storage/network policy charge
+ skill/service fee
```

The platform SHOULD absorb ordinary idle grace as infrastructure overhead.

Record runtime usage per job, then reconcile aggregated estimates with Cloudflare usage analytics.

UI SHALL show both:

- user-facing estimated/final credits
- operator-facing infrastructure estimate

---

# 21. Admin UI — Information Architecture

Create a new Admin module:

```text
Admin
└── Runtime & Containers
    ├── Overview
    ├── Runtime Types
    ├── Queue & Scaling
    ├── Health & Watchdog
    ├── Cost Guards
    ├── Images & Deployments
    ├── Active Instances
    ├── Job History
    └── Recommendations
```

Do NOT bury these settings inside generic Worker settings.

---

# 22. Admin UI — Overview

Overview cards:

```text
Active Containers
Busy / Idle / Draining
Queued Jobs
Oldest Queue Age
P50/P95 Queue Wait
P50/P95 Render Time
Stalled Jobs (24h)
Container Restarts (24h)
Estimated Runtime Cost Today
Cost Guard Status
```

Runtime table example:

| Runtime | Active | Busy | Queue | Oldest wait | Soft max | Hard max | Health |
|---|---:|---:|---:|---:|---:|---:|---|
| Video Render | 1 | 1 | 2 | 04:20 | 1 / burst 2 | 3 | Healthy |
| Media Utils | 0 | 0 | 0 | — | 2 | 4 | Idle |
| Hermes | 2 | 1 | — | — | session | 10 | Healthy |

---

# 23. Admin UI — Runtime Type Editor

Each runtime type screen MUST show:

### Identity

- Runtime Name
- Runtime Key
- Mode: Shared Stateless / Job Isolated / Session Isolated
- Current image/version
- Current instance type
- Cloudflare hard max

### Queue policy

- concurrency per Container
- normal soft max
- burst soft max
- queue scale threshold
- “prefer waiting if worker frees within”
- scale-up step
- idle grace

### Watchdog policy

- heartbeat interval
- progress interval
- suspect no-progress time
- hard no-progress time
- startup ready deadline
- job hard timeout
- max jobs per Container
- max Container age

### Cost policy

- max starts/window
- hourly estimated cost limit
- daily estimated cost limit
- behavior when budget limit is reached

### Security

- internet enabled
- allowlist profile
- outbound credential proxy enabled
- workspace cleanup policy

---

# 24. UI Guidance Requirements

Every tunable field MUST include four pieces of guidance:

1. **What this setting does**
2. **Recommended value/range**
3. **Trade-off**
4. **Current recommendation from telemetry**

Example UI:

```text
Scale when oldest job waits
[ 15 ] minutes

Recommended initial value: 15 minutes
Suggested range: 5–30 minutes

What it does:
A second render Container is not considered until the oldest queued
render has waited this long.

Lower value:
+ faster queue processing
- more Container starts and higher operational complexity

Higher value:
+ lower cost / simpler operation
- users may wait longer

Current recommendation:
Keep 15 minutes.
Reason: P95 queue wait is 3m 42s and only 0.8% of jobs exceed 10 minutes.
```

No critical numeric field should be presented without contextual guidance.

---

# 25. Recommendation Engine

The UI SHALL include an advisor that starts with static recommendations and later learns from telemetry.

## 25.1 Initial recommendations

Video Render:

```text
normal soft max: 1
burst soft max: 2
scale threshold: 15 min
prefer waiting if free within: 2 min
idle grace: 3 min
concurrency: 1
heartbeat: 30 sec
suspect no progress: 3 min
hard no progress: 5 min
max jobs/container: 30
max age: 6h
```

## 25.2 Data-driven suggestions

Do not recommend changes until a minimum sample size exists, e.g. 100 completed jobs for that runtime/image/instance profile.

Examples:

### Keep one worker

If:

- P95 queue wait < 5 min
- <1% jobs exceed 15 min
- render worker utilization is moderate

Recommend:

```text
Keep normal max = 1.
No scaling change needed.
```

### Consider earlier burst

If:

- healthy jobs repeatedly wait >15 min
- stalled-job rate is low
- burst worker would materially lower wait

Suggest:

```text
Consider lowering scale threshold from 15m to 10m.
```

Do not auto-apply without Admin action.

### Suspect health issue instead of capacity

If:

- queue grows
- active job has stale progress

Show:

```text
Do not scale yet.
Active render appears stalled; investigate/recycle worker first.
```

### Cost warning

If:

- additional scaling is projected to cross daily cost guard

Show:

```text
Keep jobs queued. Starting another Container would exceed today's configured runtime budget.
```

---

# 26. “Apply Recommended” UI

For safe runtime settings, provide:

```text
[Apply Recommended Values]
```

Before applying, show a diff:

```text
Scale threshold       10m -> 15m
Idle grace             5m -> 3m
Burst soft max           3 -> 2
```

Settings requiring deployment MUST show:

```text
Deployment required
```

and MUST NOT pretend they are active before deployment succeeds.

---

# 27. UI — Active Container Detail

Clicking a Container MUST show:

```text
Container ID
Runtime type
Image version
Instance type
Started at
Age
State
Current job
Current user/tenant (authorized Admin only)
CPU/runtime estimate
Memory allocation
Disk allocation
Last heartbeat
Last progress
FFmpeg speed
ETA
Jobs completed since start
Failure count
Queue assignments
```

Actions:

```text
[Drain]
[Stop Gracefully]
[Force Destroy]
[Open Logs]
[Inspect Current Job]
```

`Force Destroy` MUST require confirmation.

---

# 28. UI — Queue Detail

Render Queue MUST display:

```text
Position
Job ID
User/Tenant
Media duration
Resolution
Submitted at
Wait time
Estimated render time
Priority
Assigned Container
Status
```

User-facing UI SHOULD expose simpler information:

```text
Queued
2 jobs ahead
Estimated start: ~4 minutes
```

Avoid promising exact times until sufficient historical accuracy exists.

---

# 29. Operational Alerts

Generate Admin alerts for:

- oldest queue age above threshold
- no-progress job
- repeated job retry
- repeated OOM
- Container age > policy
- hard max reached
- cost guard reached
- image start failure
- health port not ready
- image rollout failure
- webhook overdue spikes
- provider polling recovery spikes

Alert severity SHOULD distinguish:

```text
INFO
WATCH
WARNING
CRITICAL
```

---

# 30. Container Start / Stop Behavior

Use required ports / readiness checks before assigning work.

Container start flow:

```text
START_REQUESTED
  ↓
startAndWaitForPorts()
  ↓
/health/ready passes
  ↓
READY
  ↓
assign job
```

Graceful stop:

```text
DRAIN
  ↓
no active job
  ↓
stop() / SIGTERM
  ↓
flush logs + release lease
  ↓
STOPPED
```

Force destruction is last resort for stuck processes.

---

# 31. External Generation Callback Policy

Provider adapter standard:

```yaml
completion:
  primary: webhook
  fallback: polling

watchdog:
  callback_grace_sec: provider_specific

polling:
  backoff: exponential
  max_interval_sec: provider_specific

idempotency:
  key: provider_job_id
```

Job state:

```text
SUBMITTING
→ PROVIDER_PROCESSING
→ WAITING_CALLBACK
→ CALLBACK_OVERDUE (if needed)
→ POLLING_FALLBACK
→ RESULT_READY
→ INGESTING
→ COMPLETED
```

`WAITING_CALLBACK` MUST NOT be interpreted as a stuck worker job.

---

# 32. Runtime API Contract

Every SmartAIHub-built runtime image SHOULD implement a common service contract.

Minimum endpoints:

```text
GET  /health/live
GET  /health/ready
GET  /runtime/info
POST /jobs/claim-or-start
GET  /jobs/{id}/status
POST /jobs/{id}/cancel
POST /runtime/drain
```

The exact claim mechanism MAY be push-based from the Job Control Plane or pull/lease-based, but only one mechanism should be authoritative.

For Render Runtime, strongly prefer explicit job assignment from the control plane to avoid duplicate claims.

---

# 33. Suggested Data Models

## `runtime_profiles`

```text
id
runtime_key
mode
instance_type
image_ref
image_version
normal_soft_max
burst_soft_max
cloudflare_hard_max
concurrency_per_instance
scale_threshold_sec
prefer_wait_eta_sec
idle_grace_sec
heartbeat_interval_sec
progress_interval_sec
suspect_no_progress_sec
hard_no_progress_sec
startup_deadline_sec
job_timeout_floor_sec
job_timeout_multiplier
max_jobs_per_instance
max_instance_age_sec
max_starts_per_window
max_cost_per_hour
max_cost_per_day
enabled
updated_by
updated_at
```

## `runtime_instances`

```text
id
runtime_profile_id
cloudflare_container_id
state
image_version
instance_type
started_at
last_heartbeat_at
last_progress_at
current_job_id
jobs_completed
failures
stall_count
drain_requested_at
stop_reason
stopped_at
```

## `runtime_performance_profiles`

```text
runtime_key
image_version
instance_type
workload_signature
sample_count
p50_runtime_sec
p95_runtime_sec
p50_speed
p95_queue_wait_sec
updated_at
```

## `runtime_policy_recommendations`

```text
id
runtime_profile_id
setting_key
current_value
recommended_value
confidence
reason
sample_window
created_at
accepted_at
rejected_at
```

---

# 34. Audit Requirements

All Admin setting changes MUST create an audit event containing:

- actor
- timestamp
- setting
- previous value
- new value
- reason/comment if supplied
- recommendation ID if applied from Advisor
- whether deployment was required
- deployment result

---

# 35. Migration from Tauri + Sidecars

## Phase 1 — Inventory

Classify every current sidecar/function:

```text
WORKER_NATIVE
CLOUD_CONTAINER
CLOUD_SANDBOX
LOCAL_RUNTIME
EXTERNAL_PROVIDER
```

Do not migrate by technology name alone. Decide by resource and security requirements.

## Phase 2 — Remove Tauri coupling

Sidecar logic MUST stop depending directly on Tauri commands/events.

Convert:

```text
Tauri invoke -> sidecar function
```

into:

```text
Runtime API / Job Contract -> runtime implementation
```

The same service logic should be runnable:

- locally in Docker
- in Cloudflare Container
- optionally from Desktop Local Runtime adapter

## Phase 3 — Media Utils

Migrate lowest-risk stateless tools first:

- FFprobe
- metadata
- thumbnail
- simple conversions

## Phase 4 — Video Render

Migrate FFmpeg render with:

- progress telemetry
- queue draining
- conservative scaling
- full watchdog
- cost guard

Keep existing Desktop render path as fallback until cloud render is stable.

## Phase 5 — Remotion

Move only after dedicated image benchmark/stability tests.

## Phase 6 — Hermes

Deploy session-isolated Hermes runtime after persistent state and secrets are externalized.

## Phase 7 — Retire redundant Desktop sidecars

Do not remove local runtime features required for GPU/device/local-file use cases.

---

# 36. CI/CD Requirements

For each image:

1. build `linux/amd64`
2. run unit tests
3. run runtime contract tests
4. run image vulnerability scan
5. record SBOM if available
6. verify no secrets in layers
7. smoke start locally
8. verify health endpoints
9. push immutable tag
10. deploy staging
11. run representative job
12. verify progress + graceful termination
13. deploy production
14. monitor rollout

No production deployment from an unpinned developer-local `latest` image.

---

# 37. Benchmark Plan

Before production defaults are finalized, benchmark at minimum:

## Video Render

Instance types:

- `standard-3`
- `standard-4`

Workloads:

- 30 sec Reel, 1080x1920
- 60 sec Reel, 1080x1920
- 3 min video, 1080x1920
- 5 min video, 1080x1920

Profiles:

- simple transcode
- subtitles + watermark
- crop/reframe + subtitles
- transitions + overlays + audio mix

Record:

- startup ready time
- render wall time
- FFmpeg average speed
- peak RSS
- disk peak
- output size
- estimated Cloudflare cost
- failure rate

Choose instance based on **cost per completed render + operational latency**, not price per second alone.

---

# 38. Initial Recommended Production Configuration

## Video Render

```yaml
runtime: video-render
instance_type: standard-4
mode: shared_queue_worker
concurrency_per_instance: 1

scaling:
  normal_soft_max: 1
  burst_soft_max: 2
  cloudflare_hard_max: 3
  oldest_queue_scale_threshold: 15m
  prefer_wait_if_free_within: 2m
  scale_step: 1

idle:
  grace: 3m

watchdog:
  heartbeat: 30s
  progress_report: 30s
  suspect_no_progress: 3m
  hard_no_progress: 5m
  startup_deadline: 60s

recycle:
  max_jobs: 30
  max_age: 6h

cost_guard:
  max_starts_per_10m: 2
  hourly_budget: admin_configured
  daily_budget: admin_configured
```

For an even safer launch, set `cloudflare_hard_max = 2`.

## Media Utils

```yaml
instance_type: standard-1
normal_soft_max: 1
burst_soft_max: 2
cloudflare_hard_max: 4
concurrency_per_instance: 2
scale_threshold: 2m
idle_grace: 2m
```

## Hermes

```yaml
instance_type: standard-2
mode: session_isolated
idle_grace: 15m
cloudflare_hard_max: admin_capacity_plan
```

---

# 39. Acceptance Criteria

Implementation is accepted only when all are true:

### Runtime

- [ ] Cloud runtime can start/stop Containers through the control plane.
- [ ] Jobs are not bound directly to Tauri.
- [ ] Video Render drains multiple queued jobs sequentially.
- [ ] Separate users never share job workspaces.
- [ ] Outputs persist to R2 before completion.

### Scaling

- [ ] Render queue does not automatically spawn a Container per job.
- [ ] Default render operation uses one Container.
- [ ] Second render Container is considered only after configured sustained queue wait.
- [ ] Scheduler checks worker health before scaling.
- [ ] Application soft max and Cloudflare hard max are both enforced.

### Reliability

- [ ] Heartbeat and progress are independent.
- [ ] No-progress stalls are detected.
- [ ] Stalled FFmpeg process can be stopped/retried.
- [ ] Container can drain and recycle safely.
- [ ] Maximum job runtime is enforced.
- [ ] Maximum Container age is enforced.

### Cost Safety

- [ ] Hard max instances configured at Cloudflare deployment layer.
- [ ] UI soft limits cannot exceed hard max.
- [ ] Hourly/daily cost guards exist.
- [ ] Budget guard prevents new scale-up.
- [ ] Runtime costs can be reconciled per job/profile.

### UI

- [ ] Runtime Overview exists.
- [ ] Admin can tune routine scaling/watchdog values without source changes.
- [ ] Every tuning field includes explanation, recommended range and trade-off.
- [ ] UI provides telemetry-based recommendation after adequate samples.
- [ ] “Apply Recommended” shows a diff before applying.
- [ ] Deployment-required settings are clearly distinguished.
- [ ] Active Container detail supports drain/stop/destroy/log inspection.

### Images/Deployment

- [ ] Images are separated by runtime type.
- [ ] Images are `linux/amd64`.
- [ ] Immutable image versions are recorded.
- [ ] No secrets are baked into image layers.
- [ ] Health/readiness endpoints exist.
- [ ] Staging deployment and rollback path exist.

---

# 40. Explicit Non-Goals

This feature does NOT:

- replace Local Runtime for GPU workloads;
- guarantee zero queue wait;
- create Kubernetes-like aggressive autoscaling;
- keep Containers alive while external AI providers generate media;
- store durable user data on Container filesystem;
- combine Hermes, Remotion, FFmpeg, Chromium and every sidecar into one giant image;
- remove the existing Desktop/Worker render path until Cloud Runtime is proven stable.

---

# 41. Implementation Order

Recommended engineering order:

```text
1. Runtime Profile + Runtime Instance data model
2. Admin Runtime UI shell
3. Cloudflare Container adapter
4. Container lifecycle + hard/soft cap enforcement
5. Common runtime service contract
6. media-utils image
7. video-render image
8. FFmpeg progress + ETA
9. conservative render queue draining
10. watchdog + stall recovery
11. cost guards
12. recommendations UI
13. performance history/advisor
14. Remotion image
15. Hermes isolated runtime
16. code/sandbox runtime
17. retire redundant Tauri sidecars gradually
```

---

# 42. Source References / Platform Facts

Verify these references again during implementation because Cloudflare Containers are evolving rapidly:

- Cloudflare Containers overview: https://developers.cloudflare.com/containers/
- Architecture/lifecycle: https://developers.cloudflare.com/containers/concepts/architecture/
- Limits and instance types: https://developers.cloudflare.com/containers/platform/limits/
- Pricing: https://developers.cloudflare.com/containers/platform/pricing/
- Scaling and routing: https://developers.cloudflare.com/containers/configuration/scaling-and-routing/
- Container class / lifecycle API: https://developers.cloudflare.com/containers/reference/container-class/
- Image management: https://developers.cloudflare.com/containers/guides/image-management/
- Deploy Containers: https://developers.cloudflare.com/containers/guides/deploy/
- Worker/Binding connections: https://developers.cloudflare.com/containers/configuration/workers-connections/
- Outbound traffic/security: https://developers.cloudflare.com/containers/guides/outbound-traffic/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/

---

# 43. Final Architectural Decision

SmartAIHub SHALL treat Cloudflare Containers as **controlled runtime workers**, not as permanent servers.

The initial operating philosophy is deliberately conservative:

> **One healthy render Container is preferred. Let it drain the queue. A queue wait of several minutes is acceptable. If the oldest queued render reaches roughly 15 minutes, inspect worker health first; only if the worker is healthy and capacity is genuinely insufficient should the system start one additional Container. Hard instance caps, runtime timeouts, no-progress watchdogs, recycling and cost circuit breakers are mandatory.**

This approach keeps the early system easy to understand, inexpensive to operate, easier to debug, and resistant to runaway Container costs while still allowing controlled scale-out when real usage eventually requires it.
