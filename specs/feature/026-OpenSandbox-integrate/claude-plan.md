# Implementation Plan: OpenSandbox Integration for SmartSpecPro

## Overview

This plan describes how to integrate Alibaba OpenSandbox into SmartSpecPro as a secure execution substrate for risky workloads. The integration moves all untrusted code execution (subprocess calls, PTY shells, Docker commands, Python code execution, file parsing) out of core application services and into isolated Docker containers managed by OpenSandbox.

### Why This Matters

SmartSpecPro currently runs 6 categories of risky workloads directly in its application services:
1. FFmpeg media processing via `subprocess.run()`
2. Interactive PTY shell sessions via `subprocess.Popen`
3. Docker command execution via `asyncio.create_subprocess_exec`
4. Python skill execution via Node.js `child_process.spawn()`
5. Workflow code nodes via RestrictedPython
6. Document parsers with native libraries

These patterns create security risks (container escape, command injection), make multi-tenant isolation difficult, and tightly couple execution infrastructure to the application platform.

### Architecture Summary

```
SmartSpecPro Core                  OpenSandbox Execution Plane
┌─────────────────────┐           ┌──────────────────────────┐
│ Node.js/tRPC        │           │ OpenSandbox Server       │
│   (control plane)   │           │   (Docker bridge runtime)│
│                     │           │                          │
│ Python FastAPI      │──HTTPS──→│  ┌─────────────────────┐ │
│   (orchestrator)    │           │  │ sandbox-abc (ephemeral)│
│                     │           │  │ sandbox-def (ephemeral)│
│ Cloud Tasks + Celery│           │  └─────────────────────┘ │
│   (job queue)       │           └──────────────────────────┘
└─────────────────────┘
         │                                    │
         └──────── S3/R2 (artifacts) ─────────┘
```

Two deployment environments:
- **Localhost**: OpenSandbox runs as Docker service via `docker-compose.opensandbox.yml`
- **Production**: OpenSandbox runs on Hetzner Cloud Singapore (~$16/month), accessed via HTTPS from GCP Cloud Run

---

## Section 1: Foundation — Docker Setup and SDK Integration

### 1.1 Docker Compose for Localhost Sandbox

Create `docker-compose.opensandbox.yml` at the project root. This name avoids collision with the existing `docker/docker-compose.sandbox.yml` (which is for local dev infra). This file is separate from the existing `docker-compose.yml` and `docker-compose.media.yml` to avoid any conflicts.

**Trust boundary note**: The OpenSandbox server container requires Docker socket access to manage sandbox containers. The `:ro` mount flag on the socket does NOT prevent Docker API write operations — the server has full Docker control. The OpenSandbox server is a privileged infrastructure component and must be treated as trusted. It should never be exposed to untrusted users or networks directly.

The compose file defines:
- **opensandbox-server** service: The OpenSandbox API server container
  - Image: `registry.cn-hangzhou.aliyuncs.com/opensandbox/server:latest`
  - Port mapping: `127.0.0.1:8080:8080` (localhost only, not exposed externally)
  - Volume: Docker socket mounted read-only (`/var/run/docker.sock:/var/run/docker.sock:ro`)
  - Network: `opensandbox-network`
  - Resource limits: 2 CPUs, 2 GB memory for the server process itself

- **Two Docker networks**:
  - `opensandbox-network` (bridge, external): API access — Python backend connects here
  - `opensandbox-exec` (internal): Sandbox container execution — NO internet access, NO access to postgres/redis/host

The `internal: true` flag on `opensandbox-exec` is critical — it prevents sandbox containers from reaching the host network, which means they cannot access PostgreSQL (:5432), Redis (:6379), or any other local services.

### 1.2 Service Management Integration

Update `run-services.sh` to manage the OpenSandbox lifecycle:
- Add `sandbox-start` command: `docker compose -f docker-compose.opensandbox.yml up -d`
- Add `sandbox-stop` command: `docker compose -f docker-compose.opensandbox.yml down`
- Add `sandbox-status` command: Check container health
- Add to existing `start-all` and `stop-all` commands

### 1.3 Python OpenSandbox SDK Integration Module

Create `python-backend/app/integrations/opensandbox/` with 6 files:

**`config.py`** — Pydantic settings class loading from environment:
- `OPENSANDBOX_ENABLED` (bool, default False)
- `OPENSANDBOX_BASE_URL` (str, localhost: `http://localhost:8080`, prod: `https://sandbox.smartaihub.app`)
- `OPENSANDBOX_API_KEY` (str)
- `OPENSANDBOX_REQUEST_TIMEOUT_SECONDS` (int, default 30)
- `OPENSANDBOX_CREATE_TIMEOUT_SECONDS` (int, default 120)
- Other settings from spec section 18

**`models.py`** — Pydantic models:
- `SandboxConfig` — Creation parameters (image, timeout, envs, resources)
- `SandboxStatus` — Status response (id, status, created_at, metadata)
- `CommandResult` — Execution result (exit_code, stdout, stderr)
- `FileEntry` — Filesystem listing entry
- `SandboxJobRequest` — Internal job request model
- `SandboxJobResponse` — Internal job response model

**New Python dependencies** (add to `python-backend/requirements.txt`):
- `pybreaker>=1.0.0` — Circuit breaker (more maintained than aiobreaker)
- `tenacity>=8.2.0` — Already exists, verify version
- `httpx>=0.27.0` — Already used, verify version
- Note: No official `opensandbox-sdk` pip package yet — the client is a custom HTTP wrapper

**`client.py`** — Low-level HTTP client wrapper:
- Uses shared `httpx.AsyncClient` with connection pooling (20 max connections, 10 keepalive)
- pybreaker circuit breaker (fail_max=5, timeout_duration=30s)
- tenacity retry decorator (3 attempts, exponential backoff 1-10s)
- Methods: `create_sandbox()`, `get_sandbox_status()`, `destroy_sandbox()`, `run_command()`, `write_file()`, `read_file()`, `list_files()`, `execute_code()`

**`lifecycle.py`** — High-level sandbox lifecycle management:
- `provision_sandbox(profile, job_id)` — Create sandbox from profile, poll until ready
- `destroy_sandbox(sandbox_id)` — Graceful shutdown with retry
- `get_or_create(job_id)` — Idempotent sandbox provisioning

**`execution.py`** — Task execution functions:
- `run_command(sandbox_id, command, timeout)` — Execute shell command
- `run_code(sandbox_id, code, language)` — Execute via code interpreter
- `run_with_streaming(sandbox_id, command)` — Stream stdout/stderr

**`files.py`** — Artifact staging and collection:
- `stage_inputs(sandbox_id, manifest)` — Upload input files from S3/R2 into sandbox
- `collect_outputs(sandbox_id, output_paths)` — Download outputs, upload to S3/R2
- `cleanup_sandbox_files(sandbox_id)` — Remove staged files

### 1.4 SandboxBackend Protocol

Define a Python protocol class that abstracts the sandbox backend. The same interface works for both localhost (`http://localhost:8080`) and Hetzner production (`https://sandbox.smartaihub.app`) — only the URL changes.

```python
class SandboxBackend(Protocol):
    async def create(self, config: SandboxConfig) -> str: ...
    async def execute(self, sandbox_id: str, command: str, timeout: int) -> CommandResult: ...
    async def write_file(self, sandbox_id: str, path: str, content: bytes) -> None: ...
    async def read_file(self, sandbox_id: str, path: str) -> bytes: ...
    async def destroy(self, sandbox_id: str) -> None: ...
```

### 1.5 MockSandboxBackend for Local Development

Create a `MockSandboxBackend` that implements the `SandboxBackend` protocol using subprocess (the legacy path) while still recording `sandbox_jobs` rows. This enables:
- Developing and testing the orchestration layer without running OpenSandbox Docker
- Unit testing the dispatch, policy, and audit logic
- CI/CD testing where Docker-in-Docker is unavailable

The mock backend executes commands via `subprocess.run()` (same as legacy), captures stdout/stderr, and writes sandbox_jobs records. It does NOT provide network isolation or resource limits — those are OpenSandbox-only features.

---

## Section 2: Database Schema and Migrations

### 2.1 New Tables (Drizzle ORM)

Add 4 new tables to `apps/web/drizzle/schema.ts`:

**`sandbox_profiles`** — Reusable runtime configurations:
- Fields: `id` (serial PK), `slug` (varchar 64, unique), `name`, `description`, `executionMode` (code/command/browser/file/media), `baseImage` (varchar 512), `entrypointTemplate`, `cpuLimit` (default '1000m'), `memoryLimitMb` (default 2048), `ephemeralDiskMb` (default 5120), `timeoutSeconds` (default 300), `networkDefaultAction` (deny/allow), `allowBrowser`, `allowCommand`, `allowCodeInterpreter`, `allowFileUpload`, `maxInputMb`, `maxOutputMb`, `isActive`, `version`, timestamps
- Use `pgTable` with camelCase column convention (matching existing schema)

**`sandbox_jobs`** — Canonical execution records:
- Fields: `id` (varchar 36, UUID PK), `tenantId` (FK tenants), `userId` (FK users), `featureType` (chat/skill/workflow/library/media/presentation/connector), `featureRefId`, `executionMode`, `sandboxProfileId` (FK sandbox_profiles), `opensandboxId`, `status` (accepted/policy_resolved/queued/provisioning/staging_inputs/executing/collecting_outputs/persisting/completed/failed/timed_out/canceled), `statusReason`, `imageUri`, `inputManifestJson` (JSONB), `outputManifestJson` (JSONB), `stdoutExcerpt`, `stderrExcerpt`, `costEstimate`, `costActual`, `idempotencyKey`, `startedAt`, `finishedAt`, `expiresAt`, timestamps
- Indexes: idempotency (unique composite), tenant+status, opensandbox_id

**`sandbox_artifacts`** — Output files:
- Fields: `id` (serial PK), `sandboxJobId` (FK sandbox_jobs), `artifactType` (primary/log/screenshot/thumbnail/chunk/debug), `objectKey` (varchar 512), `mimeType`, `sizeBytes` (bigint), `sha256`, `isPrimary`, `metadataJson` (JSONB), `createdAt`
- Index: sandbox_job_id

**`tenant_sandbox_policies`** — Per-tenant limits:
- Fields: `id` (serial PK), `tenantId` (unique FK tenants), `defaultProfileId` (FK sandbox_profiles), `maxConcurrentSandboxes` (default 5), `maxDailyRuntimeSeconds` (default 36000), `maxSingleJobSeconds` (default 1800), `defaultNetworkAction`, `egressRulesJson` (JSONB), `allowedImagesJson` (JSONB), timestamps

### 2.2 Existing Table Extensions

Extend these existing tables with nullable columns:

- **`skills`**: Add `sandboxProfileSlug` (varchar 64), `requiresNetwork` (boolean), `requiresBrowser` (boolean), `maxRuntimeSeconds` (integer), `maxInputMb` (integer)
- **`media_callback_events`**: Add `sandboxJobId` (varchar 36)
- **`presentation_conversion_records`**: Add `sandboxJobId` (varchar 36)
- **`api_audit_events`**: Add `sandboxJobId` (varchar 36), `opensandboxId` (varchar 128)
- **`workflow_executions`**: Add `sandboxJobIds` (JSONB, default '[]')

### 2.3 Seed Data

Create a seed script for the 4 baseline sandbox profiles:
1. `code-default` — 1000m CPU, 2048 MB, 600s, network deny, code interpreter yes
2. `media-processing` — 2000m CPU, 4096 MB, 1800s, network deny, command yes, disk 10240 MB
3. `browser-default` — 2000m CPU, 4096 MB, 600s, network allow, browser yes
4. `file-parser` — 1000m CPU, 2048 MB, 300s, network deny, command yes

### 2.4 SQLAlchemy Models for Python Backend

The Python backend uses SQLAlchemy 2 (async) to access the same PostgreSQL database. Since Drizzle migrations create the tables, the Python backend needs corresponding SQLAlchemy model definitions.

Create `python-backend/app/models/sandbox.py` with:
- `SandboxProfile` — Maps to `sandbox_profiles` table
- `SandboxJob` — Maps to `sandbox_jobs` table
- `SandboxArtifact` — Maps to `sandbox_artifacts` table
- `TenantSandboxPolicy` — Maps to `tenant_sandbox_policies` table

Each model uses `mapped_column()` with SQLAlchemy 2.0 declarative syntax. Column names must match the Drizzle schema exactly (Drizzle uses camelCase → database columns are typically snake_case, but verify against the actual DDL).

Also create `python-backend/app/models/__init__.py` to export the new models and update the existing model registry.

### 2.5 Migration Execution

Follow the project's Database Safety Protocol:
1. Backup affected tables before migration
2. Run `cd apps/web && pnpm db:push`
3. Verify row counts and data integrity
4. New tables are empty so risk is LOW for creation
5. Existing table extensions are nullable columns — risk is LOW

---

## Section 3: Python Services Layer

### 3.1 Sandbox Dispatcher Service

Create `python-backend/app/services/sandbox_dispatcher.py`:

Responsible for:
- Classifying incoming workloads by feature type
- Selecting the appropriate sandbox profile
- Checking tenant policies (concurrency limits, daily runtime)
- Creating the `sandbox_jobs` database record
- Dispatching to the appropriate Celery worker

The dispatcher follows this flow:
1. Receive job request (feature_type, inputs, tenant_id, user_id)
2. Check `OPENSANDBOX_ENABLED` feature flag
3. If not enabled and `DISPATCH_MODE=optional`, fall back to legacy path
4. Resolve sandbox profile from `feature_type` → profile mapping
5. Check tenant sandbox policy (max concurrent, daily runtime)
6. If policy denied, return error immediately (no retry)
7. Create `sandbox_jobs` record with status `accepted`
8. Dispatch Celery task for async execution
9. Return job ID for status polling

### 3.2 Sandbox Profile Service

Create `python-backend/app/services/sandbox_profiles.py`:

- Load profiles from database (cached, 60s TTL)
- Resolve profile by slug or by feature type
- Merge profile defaults with per-job overrides
- Validate resource limits against tenant policy

### 3.3 Sandbox Artifact Service

Create `python-backend/app/services/sandbox_artifacts.py`:

- Upload collected sandbox outputs to S3/R2
- Generate SHA-256 checksums for integrity
- Create `sandbox_artifacts` database records
- Generate signed URLs for artifact access (15-min TTL)
- Map artifact types (primary, log, screenshot, etc.)

### 3.4 Sandbox Audit Service

Create `python-backend/app/services/sandbox_audit.py`:

- Emit structured audit events to existing JSONL audit log
- Event types: `sandbox_job_accepted`, `sandbox_created`, `sandbox_executing`, `sandbox_completed`, `sandbox_failed`, `sandbox_deleted`
- Each event includes: `sandboxJobId`, `tenantId`, `userId`, `featureType`, `profileSlug`, timing data
- Cost attribution data emitted on completion

### 3.5 Sandbox Cost Service

Create `python-backend/app/services/sandbox_costs.py`:

- Calculate job cost = f(CPU-seconds, memory-GB-seconds, network-egress, storage-written)
- Update `sandbox_jobs.cost_actual` on completion
- Attribute to: tenant → feature → job
- Use existing `provider_usage_log` pattern for cost tracking

### 3.6 Celery Queue Routing

Add a new `celery-sandbox` queue:
- Update `python-backend/app/core/celery_app.py` — Add queue routing for sandbox tasks
- Update `docker-compose.media.yml` — Add `celery-sandbox` worker service (2 CPU, 4 GB)
- Update `run-services.sh` — Add sandbox worker startup/management

### 3.7 Sandbox Job Worker (Celery)

Create `python-backend/app/workers/sandbox_job_worker.py`:

This is the core execution task that manages the full sandbox lifecycle.

**Key pattern: Sandbox Session Reuse** — A single sandbox is created at job start and reused for ALL commands within that job. For media jobs that chain 10-20 FFmpeg invocations (e.g., `media_job_worker.py`), the sandbox persists across the entire task lifecycle. This avoids the catastrophic latency of creating/destroying a sandbox per command. Expected cost: ~3s one-time sandbox creation, then ~50ms per subsequent command.
1. Update job status: `policy_resolved` → `queued` → `provisioning`
2. Call `lifecycle.provision_sandbox()` with selected profile
3. Update status: `staging_inputs`
4. Call `files.stage_inputs()` to upload input files into sandbox
5. Update status: `executing`
6. Call `execution.run_command()` or `execution.run_code()` based on execution mode
7. Update status: `collecting_outputs`
8. Call `files.collect_outputs()` to download outputs and upload to S3/R2
9. Update status: `persisting`
10. Create artifact records, update job with output manifest
11. Update status: `completed` (or `failed`/`timed_out`)
12. Call `lifecycle.destroy_sandbox()` to clean up
13. Emit audit events throughout

Error handling:
- Transient failures (network, timeout): Retry via Celery retry mechanism (max 3)
- Policy denied: Fail immediately, no retry
- Sandbox creation failure: Retry 3 times, then fail
- Execution timeout: Collect partial outputs if available, mark as `timed_out`
- Sandbox destruction failure: Log warning, orphan reconciler will clean up

---

## Section 4: Node.js Sandbox Router and Services

### 4.1 tRPC Sandbox Router

Create `apps/web/server/routers/sandbox.ts`:

Procedures:
- `createJob` — Validate input, check RBAC, call Python backend to create sandbox job. Input: Zod schema with feature_type, execution_mode, input_files, profile_override. Returns: job_id.
- `getJobStatus` — Poll job status by job_id. Returns: status, progress, output_urls. Requires job ownership or admin.
- `cancelJob` — Cancel a running/queued job. Calls Python backend cancellation endpoint.
- `getJobTranscript` — Fetch execution logs (stdout/stderr excerpts). Admin or job owner only.
- `listJobs` — Admin job explorer with filters (tenant, status, feature_type, date range). Paginated.
- `getProfiles` — List available sandbox profiles. Returns: array of profile objects.

All procedures require authentication. Tenant isolation enforced via `tenantId` filter.

### 4.2 Dispatch Service

Create `apps/web/server/services/sandbox/dispatchService.ts`:

- Called by existing routers (chat, skills, media, library) when workload requires sandbox
- Determines if sandbox dispatch is needed based on `executionMode` and feature flags
- Creates internal execution request and sends to Python backend via HTTP
- Returns job ID for polling

Decision logic:
```
if !OPENSANDBOX_ENABLED → legacy path
if executionMode in ['core-text', 'llm-only'] → legacy path
if executionMode in ['sandbox-code', 'sandbox-command', 'sandbox-browser', 'sandbox-file', 'sandbox-media', 'media-generate'] → sandbox path
```

### 4.3 Policy Resolver

Create `apps/web/server/services/sandbox/policyResolver.ts`:

- Resolve sandbox profile for a given feature type and tenant
- Check tenant sandbox policy limits (concurrent, daily runtime)
- Return resolved configuration (profile + tenant overrides + network policy)

### 4.4 Status Projection

Create `apps/web/server/services/sandbox/statusProjection.ts`:

Map internal sandbox states to user-friendly labels:
- accepted/policy_resolved/queued → "Queued"
- provisioning/staging_inputs → "Preparing secure workspace"
- executing → "Running securely"
- collecting_outputs/persisting → "Collecting results"
- completed → "Completed"
- failed → "Failed"
- timed_out → "Timed out"
- canceled → "Canceled"

### 4.5 Cost Estimator and Credit Integration

Create `apps/web/server/services/sandbox/costEstimator.ts`:

- Estimate job cost before execution based on profile defaults
- Used for UI display ("Estimated cost: X credits")
- Actual cost calculated by Python backend after execution

**Credit integration with existing system** (`creditService.ts`, `deductCredits()`):
1. Before sandbox dispatch: Check `hasEnoughCredits()` for estimated cost
2. On dispatch: Reserve (deduct) estimated credits upfront
3. On completion: Reconcile — refund overage or charge additional based on actual cost
4. On failure: Refund reserved credits (minus minimum processing fee if applicable)

### 4.6 Job Completion Notification

How the Node.js tRPC layer learns about sandbox job completion:

**Primary mechanism**: Client-side polling via `getJobStatus` tRPC query
- Active jobs: Poll every 2 seconds
- Queued jobs: Poll every 10 seconds
- TanStack Query with `refetchInterval` based on job status
- Job status includes `progress` field for intermediate updates

**Future enhancement**: SSE (Server-Sent Events) for real-time push notifications. Not in initial scope — polling is simpler and sufficient for current scale.

### 4.7 Artifact Access

Create `apps/web/server/services/sandbox/artifactAccess.ts`:

- Generate signed URLs for sandbox artifacts
- Route through existing storage abstraction (`apps/web/server/storage.ts`)
- TTL: 15 minutes (configurable)
- Enforce tenant isolation (can only access own artifacts)

---

## Section 5: High-Risk Workload Migration

### 5.1 FFmpeg Media Pipeline Migration

**File**: `python-backend/app/video/pipeline.py`

Current pattern: `subprocess.run(["ffmpeg", ...], timeout=1800)`

Migration approach:
1. Create a `SandboxMediaRunner` class that wraps the existing pipeline logic
2. When `OPENSANDBOX_ENABLED=true`: Stage input media files into sandbox, run FFmpeg via `sandbox.commands.run()`, collect output files
3. When `OPENSANDBOX_ENABLED=false`: Legacy subprocess path (unchanged)
4. The feature flag check happens at the pipeline entry point, not deep in the call chain
5. Sandbox uses `media-processing` profile (2 CPU, 4 GB, 30 min timeout)

Key considerations:
- **Multi-command session reuse**: `media_job_worker.py` chains ~20 subprocess calls per task. A single sandbox is created at task start and reused for all FFmpeg invocations within that task. The sandbox persists until the entire Celery task completes.
- FFmpeg commands must be translated from subprocess args to shell command strings
- Font files need to be staged into sandbox if subtitle burn-in is used
- Output file paths collected via filesystem.list() + filesystem.read()

**Additional media files to migrate** (same approach — sandbox session reuse):
- `python-backend/app/services/media_pipeline.py` — subprocess calls at lines 236, 252, 266
- `python-backend/app/tasks/presentation_render.py` — Playwright/FFmpeg subprocess at lines 397, 475
- `python-backend/app/orchestrator/factory_orchestrator.py` — subprocess.run() at line 29

### 5.2 PTY Shell Session Migration — DEFERRED

**File**: `python-backend/app/kilo/pty_manager.py`

Current pattern: `subprocess.Popen` with real-time bidirectional I/O, terminal resize (`TIOCSWINSZ`), subscriber pattern for streaming, `select()` loop with non-blocking I/O.

**Status: DEFERRED to Phase 3+**

The OpenSandbox `commands.run()` API is a batch execution model — it runs a command and returns `(exit_code, stdout, stderr)`. This is fundamentally incompatible with the interactive PTY model which requires real-time bidirectional I/O, ANSI escape sequences, and terminal resize events.

Migration prerequisites:
1. Research if OpenSandbox supports WebSocket-based terminal sessions
2. If yes: Implement PTY-over-WebSocket adapter
3. If no: Redesign PTY as non-interactive batch command execution, or keep legacy with enhanced security (tighter disallowed token validation, resource limits via cgroups)

In the interim, PTY sessions continue using the existing Popen approach with existing security controls. This is acceptable because PTY access is admin-restricted and requires explicit user authentication.

### 5.3 Docker Executor Migration

**File**: `python-backend/app/services/docker_executor.py`

Current pattern: `asyncio.create_subprocess_exec` with shlex.quote

Migration approach:
1. Replace direct subprocess execution with sandbox command dispatch
2. The docker_executor currently handles arbitrary commands — sandbox provides stronger isolation
3. Sandbox uses `code-default` or `media-processing` profile based on command type
4. Remove direct Docker socket access from this service

---

## Section 6: Skill and Workflow Migration

### 6.1 Skill Execution Mode Extension

**File**: `apps/web/drizzle/schema.ts` (skills table)

Extend the `executionMode` enum:
- `core-text` (renamed from `llm-only`, backward compatible)
- `sandbox-code` (Python/Node execution in sandbox)
- `sandbox-command` (shell commands in sandbox)
- `sandbox-browser` (browser automation in sandbox)
- `sandbox-file` (file processing in sandbox)
- `sandbox-media` (renamed from `media-generate`, backward compatible)

Add backward compatibility mapping in the skill executor:
- `llm-only` → `core-text` (handled in core, unchanged)
- `media-generate` → `sandbox-media` (routed to sandbox when enabled)

### 6.2 Skill Executor Modification

**File**: `apps/web/server/services/skillExecutor.ts`

Current: Lines 518-638 spawn Python subprocess via `child_process.spawn()`

After:
1. Check `executionMode` — if `core-text`, continue with existing LLM path
2. If `sandbox-*`, dispatch to sandbox via `dispatchService.ts`
3. The existing JSON stdin/stdout protocol gets replaced with sandbox job polling
4. Skill input/output format remains the same from the chat UI perspective

### 6.3 Workflow Code Node Migration

**File**: `python-backend/app/orchestrator/node_executors/data_executors/code_executor.py`

Current: RestrictedPython with `safe_builtins` and `signal.alarm()` timeout

Migration:
1. Replace RestrictedPython `exec()` with `sandbox.code_interpreter.execute()`
2. Sandbox uses `code-default` profile with code interpreter enabled
3. Dependencies available in sandbox (pandas, numpy, etc.) via pre-baked image
4. Timeout handled by sandbox TTL instead of signal.alarm()
5. Keep RestrictedPython as fallback when `OPENSANDBOX_ENABLED=false`

### 6.4 Workflow HTTP Node (External)

External HTTP requests from workflow nodes route through sandbox for egress control:
1. Sandbox uses `browser-default` profile with network allowlist
2. Per-job egress rules from tenant sandbox policy
3. Internal HTTP nodes (to trusted APIs) stay in core

---

## Section 7: Existing Router Modifications

### 7.1 Chat Router

**File**: `apps/web/server/routers/chat.ts`

Add sandbox dispatch path:
1. When a skill with `sandbox-*` execution mode is detected, create sandbox job
2. Add polling mechanism for sandbox job status
3. Stream intermediate status updates to chat UI ("Preparing secure workspace...", "Running securely...")
4. On completion, retrieve artifacts and include in chat response

### 7.2 Skills Router

**File**: `apps/web/server/routers/skills.ts`

Add sandbox-aware skill listing:
1. Return `sandboxRequired` flag for each skill
2. Include `sandboxProfileSlug` in skill metadata
3. Skills with sandbox execution show sandbox status indicator in UI

### 7.3 Media Router

**File**: `apps/web/server/routers/media.ts`

Route media jobs through sandbox:
1. Check if media job type requires sandbox (FFmpeg, image processing)
2. If yes, create sandbox job instead of dispatching directly to Celery media worker
3. Maintain existing polling/callback mechanism — just change the backend dispatch

### 7.4 Library Router

**File**: `apps/web/server/routers/library.ts`

Add sandbox dispatch for file parsing:
1. Document upload triggers sandbox parsing when file type requires it
2. PPTX, PDF, DOCX parsing → sandbox `file-parser` profile
3. Plain text, JSON, CSV → stay in core (low risk)

---

## Section 8: Hetzner Production Setup

### 8.1 Server Provisioning

Hetzner CPX31 specifications:
- 4 shared vCPU (AMD EPYC)
- 8 GB RAM
- 160 GB NVMe SSD
- Location: Singapore (sgp1)
- Cost: ~$16/month

### 8.2 Setup Script

Create `scripts/setup-hetzner-sandbox.sh`:

The script performs:
1. System update and Docker installation
2. OpenSandbox server container deployment
3. Docker network creation (`sandbox-exec` internal)
4. Nginx reverse proxy with TLS (Let's Encrypt, domain: `sandbox.smartaihub.app`)
5. Firewall configuration: allow only GCP Cloud Run egress IPs + admin SSH IPs
6. systemd service for OpenSandbox auto-start
7. Health check endpoint setup
8. Log rotation configuration

### 8.3 Security Hardening

- SSH key-only access (disable password auth)
- UFW/iptables firewall: deny all, allow GCP IPs + admin SSH
- TLS termination at Nginx
- API key validation at Nginx level (`X-API-Key` header check)
- No tenant secrets stored on Hetzner
- Docker socket restricted to opensandbox-server container
- Regular security updates via unattended-upgrades

### 8.4 Monitoring

- Health check endpoint: `https://sandbox.smartaihub.app/health`
- Uptime monitoring from GCP (Cloud Monitoring or external)
- Alert if health check fails for >1 minute
- Docker daemon health monitoring
- Disk usage alerts (>80% threshold)

### 8.5 Connectivity Verification

Test matrix:
1. Python orchestrator on Cloud Run → OpenSandbox API on Hetzner (HTTPS)
2. Sandbox on Hetzner → R2 signed URLs (artifact upload/download)
3. Node.js on Cloud Run → R2 signed URLs (artifact delivery to client)
4. Latency < 10ms for API calls
5. File transfer throughput adequate for media files

---

## Section 9: Admin UI and Observability

### 9.1 Sandbox Job Explorer (Admin Page)

New admin page at `/admin/sandbox`:
- Table listing all sandbox jobs with filters (tenant, status, feature_type, date range)
- Job detail view showing: status timeline, input/output manifests, stdout/stderr, cost, audit trail
- Cancel button for running jobs
- Retry button for failed jobs

### 9.2 Sandbox Profile Management (Admin Panel)

Admin settings panel for sandbox profiles:
- CRUD for sandbox profiles (add, edit, deactivate)
- Profile resource configuration (CPU, memory, disk, timeout, network)
- Default profile per feature type

### 9.3 Tenant Sandbox Policy Management

Admin settings per tenant:
- Max concurrent sandboxes
- Max daily runtime
- Max single job runtime
- Default network action
- Egress allowlist rules
- Allowed Docker images

### 9.4 Cost Analytics

Extend existing usage analytics:
- Sandbox cost per tenant/feature/time period
- Cost breakdown by resource type (CPU, memory, storage, network)
- Cost trends and alerts

### 9.5 Data Retention Policies

Align with existing project retention patterns (7-day media, 12-day Celery):
- `sandbox_jobs`: Retain 30 days, then archive to cold storage or delete
- `sandbox_artifacts` S3/R2 objects: 7-day TTL via S3 lifecycle rules (primary outputs), 3-day for debug artifacts
- `sandbox_artifacts` DB rows: Retain with jobs (30 days)
- Log artifacts (stdout/stderr): 7 days
- Implement via Celery beat task (matching existing `cleanup_expired_media` pattern)

### 9.6 Monitoring Metrics

Key metrics to track (extend existing observability):
- `sandbox_jobs_total` — Counter by status and feature_type
- `sandbox_creation_duration_seconds` — Histogram
- `sandbox_execution_duration_seconds` — Histogram by profile
- `sandbox_concurrent_active` — Gauge
- `sandbox_artifacts_size_bytes` — Histogram
- `sandbox_circuit_breaker_state` — Gauge (open/closed/half-open)
- `sandbox_hetzner_health` — Gauge (1=healthy, 0=unhealthy)

Emit via existing structured logging pattern (JSONL audit events + `provider_usage_log`).

### 9.7 Reconciliation Workers

Background workers for system health:
- **Orphan sandbox cleanup**: Detect sandboxes without active jobs, destroy after TTL
- **Stuck job detection**: Jobs in non-terminal status past timeout, mark as failed
- **Hetzner health monitor**: Periodic health check with alerting

---

## Section 10: Environment Configuration

### 10.1 Web App Environment Variables

Add to `apps/web/.env`:
```
OPENSANDBOX_ENABLED=false
OPENSANDBOX_DISPATCH_MODE=optional
SANDBOX_DEFAULT_PROFILE=code-default
SANDBOX_REQUIRE_FOR_SKILLS=false
SANDBOX_REQUIRE_FOR_MEDIA=false
```

### 10.2 Python Backend — Localhost

Add to `python-backend/.env`:
```
OPENSANDBOX_ENABLED=true
OPENSANDBOX_BASE_URL=http://localhost:8080
OPENSANDBOX_API_KEY=dev-sandbox-key-change-me
OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=30
OPENSANDBOX_CREATE_TIMEOUT_SECONDS=120
OPENSANDBOX_READY_POLL_INTERVAL_MS=2000
SANDBOX_ARTIFACT_BUCKET=smartspec-sandbox-artifacts
SANDBOX_SIGNED_URL_TTL_SECONDS=900
SANDBOX_DEFAULT_NETWORK_ACTION=deny
SANDBOX_MAX_CONCURRENT_GLOBAL=10
SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT=3
```

### 10.3 Python Backend — Production (GCP Secret Manager)

Same variables as localhost but with production values:
- `OPENSANDBOX_BASE_URL=https://sandbox.smartaihub.app`
- `OPENSANDBOX_API_KEY=<stored-in-secret-manager>`
- `SANDBOX_MAX_CONCURRENT_GLOBAL=20`
- `SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT=5`

### 10.4 Hetzner Server

OpenSandbox server configuration:
- `OPENSANDBOX_API_KEY=<same-key-as-production>`
- `OPENSANDBOX_RUNTIME=docker`
- `OPENSANDBOX_DOCKER_NETWORK=sandbox-exec`
- `OPENSANDBOX_DEFAULT_TIMEOUT=600`
- `OPENSANDBOX_MAX_SANDBOXES=20`

---

## Section 11: Feature Flag and Rollout Strategy

### 11.1 Feature Flags

Two-level feature flag system:
1. **Global**: `OPENSANDBOX_ENABLED` — master switch for the entire sandbox system
2. **Per-feature**: `SANDBOX_REQUIRE_FOR_SKILLS`, `SANDBOX_REQUIRE_FOR_MEDIA` — per-feature enforcement

### 11.2 Dispatch Modes

- `optional` — Try sandbox, fall back to legacy if unavailable or disabled
- `required` — Sandbox only, fail if unavailable (production hardening phase)

### 11.3 Rollout Sequence

1. Phase 1-2: `OPENSANDBOX_ENABLED=true`, `DISPATCH_MODE=optional` — dual path
2. Phase 3-6: Gradually enable per-feature flags
3. Phase 7: Set `DISPATCH_MODE=required` for all features — no legacy fallback
4. Remove legacy execution paths (dead code cleanup)

---

## Section 12: Production Hardening and Launch

### 12.1 Launch Readiness Gate

ALL must pass before setting `required` mode:
1. All HIGH-risk features execute via `sandbox_jobs`
2. Default deny egress verified in all profiles
3. No production service calls subprocess directly
4. Image allowlist enforced
5. Orphan sandbox reconciler active
6. Cost tracking functional
7. Per-tenant quota enforcement tested
8. Rollback plan tested

### 12.2 Chaos Testing

Test scenarios:
- Kill OpenSandbox mid-execution
- R2 outage during artifact transfer
- Network flap between GCP and Hetzner
- Concurrent sandbox burst exceeding limits
- Hetzner server restart

### 12.3 Rollback Strategy

Phase 1-4 (feature flags = optional):
- Set `OPENSANDBOX_ENABLED=false` → immediate fallback to legacy

Phase 5+ (feature flags = required):
- Disable specific feature types while keeping others
- Switch profile version back
- Reduce tenant concurrency to zero temporarily
- Emergency: Re-enable legacy subprocess paths via env var override

---

## Cross-Cutting Concerns

### Error Handling

All sandbox operations follow the existing project error pattern:
- Structured error types with error codes
- Audit trail for all failures
- User-friendly error messages via status projection
- Admin-visible error details with stack traces

### Logging

Extend existing JSONL audit logging:
- Every sandbox lifecycle event logged
- Correlation via `sandboxJobId` across all systems
- Cost attribution logged on completion
- Egress deny events logged

### Security

- Network isolation via Docker internal networks
- No tenant secrets in sandbox environment
- Signed URLs for all file access
- API key rotation support
- Hetzner firewall restricts access to GCP IPs only
- SHA-256 checksums for artifact integrity
