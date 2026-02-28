# SmartSpecPro + OpenSandbox Integration Specification

Version: 1.1
Date: 2026-02-26
Status: Proposed — Adapted to Current Codebase
Based on: Original OpenSandbox Day-0 Spec (external)
See also: [GCP Impact Analysis](gcp-impact-analysis.md)

---

## 1. Executive Summary

This specification defines how to integrate [Alibaba OpenSandbox](https://github.com/alibaba/OpenSandbox) into SmartSpecPro as a secure execution substrate for risky workloads. The goal is to move all untrusted code execution, file processing, and browser automation out of the core application services and into isolated sandbox containers.

### Key Principles

- SmartSpecPro remains the product platform (UI, API, auth, billing, orchestration)
- OpenSandbox becomes the execution plane for risky operations
- Python backend transitions from "executor" to "orchestrator + policy enforcer + artifact router"
- Node.js API submits jobs through a sandbox job contract instead of running code directly
- Migration is phased — highest-risk paths first, not a big-bang rewrite

### Deployment Strategy (Two Environments)

| Environment | OpenSandbox Location | How |
|-------------|---------------------|-----|
| **Localhost (dev)** | Docker on same host | `docker-compose.sandbox.yml` — separate network, no port conflicts |
| **Production (GCP)** | Hetzner Cloud Singapore | Dedicated server with Docker, connected via HTTPS |

- **Localhost**: OpenSandbox runs as a Docker service alongside existing infra (postgres, redis, celery). Uses a separate Docker network (`opensandbox-network` + `opensandbox-exec`) to avoid conflicts.
- **Production**: GCP Cloud Run handles core services. Hetzner CPX31 (4 vCPU, 8 GB, ~$16/month) runs OpenSandbox. Python orchestrator on Cloud Run calls OpenSandbox API on Hetzner via HTTPS. Latency: 1-5ms (both in Singapore).
- **GCP migration (011-DeployPlan) is NOT affected** — Hetzner is additive, not a replacement.
- Backend abstraction (`SandboxBackend` protocol) ensures the same code works with either localhost or Hetzner by changing only the URL.

### Why NOT GCE or GKE?

| Option | Cost | Complexity | Verdict |
|--------|------|-----------|---------|
| GCE VM (GCP) | $70-100/mo | Low | Too expensive for same capability |
| GKE cluster | $170-370/mo | High | Overkill, rewrites GCP plan |
| **Hetzner Cloud** | **$16/mo** | **Low** | **Best cost/capability ratio** |
| Cloud Run Jobs only | $0 extra | Low | No egress control, no code interpreter |

---

## 2. Codebase Alignment Analysis

### 2.1 What Already Exists

| Component | Current State | Files |
|-----------|---------------|-------|
| **FFmpeg subprocess** | Direct `subprocess.run()` with list args, timeouts, font whitelist | `python-backend/app/video/pipeline.py` |
| **PTY shell sessions** | `subprocess.Popen` with token validation | `python-backend/app/kilo/pty_manager.py` |
| **Docker executor** | `asyncio.create_subprocess_exec` with shlex.quote | `python-backend/app/services/docker_executor.py` |
| **Python skill runner** | Node.js `spawn()` with 10min timeout | `apps/web/server/services/skillExecutor.ts:518-638` |
| **RestrictedPython** | Workflow code execution with safe_builtins | `python-backend/app/orchestrator/node_executors/data_executors/code_executor.py` |
| **AST expression eval** | Whitelist-based AST validation | `python-backend/app/orchestrator/node_executors/loop_executor.py` |
| **PPTX parser** | python-pptx with 50MB limit | `python-backend/app/services/pptx_importer.py` |
| **Google Slides import** | REST API with SSRF protection | `python-backend/app/services/gslides_importer.py` |
| **Excel/CSV parsers** | openpyxl/csv with size limits | `python-backend/app/orchestrator/node_executors/data_executors/` |
| **Jinja2 sandbox** | SandboxedEnvironment | `python-backend/app/orchestrator/node_executors/data_executors/template_engine_executor.py` |
| **Docker socket** | Direct daemon access for status dashboard | `docker-status/server/dockerSocket.ts` |
| **Celery workers** | 4 worker types: media, video, import, beat | `docker-compose.media.yml` |
| **Cloud Tasks** | GCP queue for async jobs | `apps/web/server/services/cloudTasks.ts` |
| **Skill system** | `executionMode`: llm-only / media-generate | `apps/web/drizzle/schema.ts:2159` |
| **Multi-tenant** | Domain-based with tenantId FK everywhere | `apps/web/drizzle/schema.ts:636` |
| **Audit logging** | JSONL files + `api_audit_events` + `provider_usage_log` | `apps/web/server/services/auditLogger.ts` |
| **Object storage** | S3/R2/Local abstraction | `apps/web/server/storage.ts` |

### 2.2 Risk Classification of Current Execution Patterns

| Component | Risk Level | Priority for Sandbox Migration |
|-----------|-----------|-------------------------------|
| Kilo PTY shell | **HIGH** | Phase 1 (immediate) |
| Docker executor | **HIGH** | Phase 1 (immediate) |
| FFmpeg media pipeline | **MEDIUM-HIGH** | Phase 1 (immediate) |
| Python skill runner (Node spawn) | **MEDIUM** | Phase 2 |
| RestrictedPython code executor | **MEDIUM** | Phase 2 |
| PPTX/document parsers | **LOW-MEDIUM** | Phase 3 |
| Template engines (Jinja2/Mustache) | **LOW** | Phase 4 (optional) |
| AST expression evaluator | **LOW** | Not needed (already safe) |

### 2.3 What the Original Spec Gets Wrong

| Original Assumption | Reality | Adaptation |
|---------------------|---------|------------|
| Kubernetes runtime from day-0 | K8s runtime is upstream roadmap only | Use Docker bridge runtime |
| Dedicated K8s node pools | Single server with systemd | Docker containers on same host |
| BullMQ as primary queue | Cloud Tasks (GCP) is primary, Celery for media | Keep Cloud Tasks + Celery, add sandbox dispatch |
| No existing sandboxing | RestrictedPython + AST eval already exist | Replace with stronger OpenSandbox isolation |
| Control Plane is new | Control Plane exists at :7070 (Fastify) | Extend existing control plane |
| ChromaDB not mentioned | ChromaDB exists for vector search | Keep ChromaDB outside sandbox |
| All file parsing must be sandboxed | PPTX/Excel parsers are read-only with size limits | Low priority, migrate when convenient |
| Workflow = whole-graph sandbox bundle | Workflow engine uses LangGraph + RestrictedPython | Migrate code nodes only, not entire graph |
| 8 sandbox profiles needed day-0 | 3-4 execution patterns exist | Start with 4 profiles |

---

## 3. Design Goals

1. Use OpenSandbox as the execution boundary for HIGH and MEDIUM-risk workloads
2. Eliminate direct subprocess execution in production core services
3. Support multi-tenant isolation, auditability, quota, and cost attribution
4. Keep the system deployable on the current single-server architecture
5. Provide a single `SandboxJob` contract for all sandboxed workloads
6. Separate control plane, data plane, and execution plane
7. Enable future Kubernetes migration without architecture changes

## 4. Non-Goals

1. Moving business CRUD (auth, settings, billing) into sandbox
2. Sandboxing pure LLM text-only API calls (no code/file/tool execution)
3. Requiring SmartSpecPro to run "inside" a sandbox
4. Building custom Helm charts (upstream doesn't support K8s yet)
5. Replacing the existing Cloud Tasks / Celery queue infrastructure
6. Sandboxing safe operations (AST eval, Jinja2 SandboxedEnvironment, template rendering)

---

## 5. Workload Classification Matrix

### 5.1 Golden Rule

**Every workload that involves untrusted code execution, shell commands, file parsing with native libraries, or browser automation MUST run in OpenSandbox.**

### 5.2 Classification

| Workload Type | Execution Plane | Current File | Reason |
|---------------|-----------------|--------------|--------|
| Chat text-only answer | Core services | `chat.ts` | No untrusted execution |
| Skill: text/LLM-only | Core services | `skillExecutor.ts` | Text prompt only |
| Skill: Python script execution | **OpenSandbox** | `skillExecutor.ts:518` | Untrusted code via `spawn()` |
| Skill: media-generate with file input | **OpenSandbox** | `skillExecutor.ts` | User file + tool execution |
| PTY shell sessions | **OpenSandbox** | `pty_manager.py` | Interactive shell |
| Docker executor commands | **OpenSandbox** | `docker_executor.py` | Arbitrary command execution |
| FFmpeg media processing | **OpenSandbox** | `video/pipeline.py` | subprocess + user files |
| Workflow: code node | **OpenSandbox** | `code_executor.py` | RestrictedPython escape risk |
| Workflow: HTTP node (external) | **OpenSandbox** | Workflow engine | Egress control needed |
| Workflow: template node | Core services | `template_engine_executor.py` | Jinja2 sandbox sufficient |
| Workflow: expression eval | Core services | `loop_executor.py` | AST whitelist sufficient |
| PPTX import/parsing | **OpenSandbox** (Phase 3) | `pptx_importer.py` | Parser risk (low priority) |
| Google Slides import | Core services | `gslides_importer.py` | REST API only, no parsing |
| Excel/CSV parsing | Core services (Phase 3 optional) | `excel_parser_executor.py` | data_only=True, low risk |
| Document OCR/text extraction | **OpenSandbox** | Future | Parser risk |
| Presentation export/render | **OpenSandbox** | Future | Rendering + native libs |
| Connector file fetch + parse | **OpenSandbox** | `googleDrive.ts`, `oneDrive.ts` | External file processing |
| Admin analytics query | Core services | `adminOps.ts` | DB read only |
| Vector embedding API call | Core services | ChromaDB integration | Network call only |
| Admin repair/backfill jobs | **OpenSandbox** | Future | Bulk file processing |

### 5.3 Architectural Default

When in doubt: "must run in OpenSandbox" — then whitelist back to core services with justification.

---

## 6. Target Architecture

### 6.0 Localhost (Development)

```
  smartspec-network (existing)          opensandbox-network (NEW)
  +---------------------------------+   +---------------------------+
  | postgres :5432                  |   | opensandbox-server :8080  |
  | redis :6379                     |   +-------------+-------------+
  | chromadb :8001                  |                 |
  | celery-media (2CPU/3GB)         |                 | Docker API
  | celery-video (4CPU/8GB)         |                 v
  | celery-import (2CPU/3GB)        |   opensandbox-exec (internal)
  | flower :5555                    |   +---------------------------+
  +----------------+----------------+   | sandbox-abc (ephemeral)   |
                   |                    | sandbox-def (ephemeral)   |
     host.docker.internal               | (NO access to postgres,  |
                   |                    |  redis, or host network)  |
  +----------------+----------------+   +---------------------------+
  | systemd services                |
  | smartspec-backend :8000 --------+---> http://localhost:8080
  | smartspec-web :3000             |     (OpenSandbox API)
  | nginx :80/:443                  |
  +----------------------------------+
```

### 6.0.1 Production (GCP + Hetzner)

```
  GCP Cloud Run (asia-southeast1)      Hetzner Cloud (Singapore)
  +----------------------------------+  +----------------------------+
  | node-api (Cloud Run Service)     |  | OpenSandbox Server :8080   |
  | python-orchestrator  ─── HTTPS ──+──> (Docker bridge runtime)    |
  | video-job-runner (Cloud Run Job) |  |                            |
  +----------------------------------+  | sandbox-abc (ephemeral)    |
  | Cloud Tasks (6 queues)           |  | sandbox-def (ephemeral)    |
  | Cloud Scheduler (12 jobs)        |  +----------------------------+
  | Secret Manager                   |       |
  +----------------------------------+       | upload/download
                                             v
  Cloudflare R2 (object storage)    <--------+
  (accessible from both GCP and Hetzner)
```

**Key differences**:
- Localhost: OpenSandbox at `http://localhost:8080` (same machine)
- Production: OpenSandbox at `https://sandbox.smartaihub.app` (Hetzner, ~1-5ms from GCP)
- Same `SandboxBackend` code — only URL changes via environment variable

### 6.1 Layering

| Layer | Components | Responsibility |
|-------|-----------|----------------|
| **Control** | Web App + Control Plane + policy data | Auth, routing, policy, tenant settings |
| **Orchestration** | Python backend + Celery + Cloud Tasks | Workload classification, sandbox dispatch, artifact routing |
| **Execution** | OpenSandbox server + sandbox containers | Isolated code/file/browser execution |
| **Data** | PostgreSQL + Redis + S3/R2 + ChromaDB | Persistence, cache, object storage, vectors |
| **Observability** | JSONL audit + api_audit_events + provider_usage_log | Logging, metrics, cost tracking |

### 6.2 Isolation Policy

- Web app and Python orchestrator never execute risky jobs directly
- Every risky job has a `sandbox_job_id`, `sandbox_id`, `tenant_id`, `profile_slug`
- Each sandbox has TTL, CPU/memory quota, egress policy
- Sandbox artifacts persist to object storage (S3/R2)
- Core services read artifacts via signed URLs, never via shared volumes

---

## 7. Execution Model

### 7.1 Canonical Flow

```
1. User triggers feature in SmartSpecPro
2. Node API validates request, checks RBAC, checks tenant policy
3. Node API creates internal execution request → sends to Python Orchestrator
4. Python Orchestrator classifies workload, selects sandbox profile
5. Python Orchestrator calls OpenSandbox Lifecycle API → creates sandbox
6. Orchestrator stages input files + context into sandbox via Filesystem API
7. Orchestrator runs command/code/browser task via Execution API
8. Results (stdout, stderr, files, screenshots) collected + uploaded to S3/R2
9. Orchestrator records metadata, status, cost, audit log
10. Node API polls job status → delivers results to UI
11. Sandbox destroyed on completion (or TTL expiry)
```

### 7.2 OpenSandbox API Usage

Based on actual upstream API (not assumptions):

```python
from opensandbox import Sandbox, SandboxConfig

# Create sandbox
config = SandboxConfig(
    image="registry/sandbox-code-runner:1.0.0",
    timeout=1800,  # 30 min TTL
    envs={"JOB_ID": "sj_123", "TENANT_ID": "t_123"},
    resources={"cpu": "2000m", "memory": "4Gi"},
)
sandbox = Sandbox.create(config)

# Stage files
sandbox.filesystem.write("/workspace/input.pdf", file_bytes)

# Execute
result = sandbox.commands.run("python /app/process.py", timeout=600)

# Collect output
output = sandbox.filesystem.read("/workspace/output.json")

# Destroy
sandbox.close()
```

### 7.3 No Direct Execution Rule (Production)

The following patterns MUST be eliminated in production:

| Current Pattern | File | Migration Target |
|----------------|------|-----------------|
| `subprocess.run(["ffmpeg", ...])` | `video/pipeline.py` | `sandbox.commands.run("ffmpeg ...")` |
| `subprocess.Popen` (PTY) | `pty_manager.py` | `sandbox.commands.run()` with streaming |
| `asyncio.create_subprocess_exec` | `docker_executor.py` | `sandbox.commands.run()` |
| `spawn(pythonBin, [scriptPath])` | `skillExecutor.ts:559` | Sandbox job dispatch via Python |
| `exec(byte_code, safe_env)` | `code_executor.py` | `sandbox.code_interpreter.execute()` |

---

## 8. Integration by Product Area

### 8.1 AI Chat with Skills

**Current**: `skillExecutor.ts` spawns Python via `child_process.spawn()` or calls Python backend HTTP.

**After**: Chat router classifies skill as text-only or sandboxed. Sandboxed skills dispatch through `SandboxJob`.

**Files to modify**:
- `apps/web/server/services/skillExecutor.ts` — Add sandbox dispatch path
- `apps/web/server/routers/skills.ts` — Add execution mode routing
- `apps/web/server/routers/chat.ts` — Add sandbox job status polling

**New files**:
- `apps/web/server/services/sandbox/skillDispatch.ts`
- `python-backend/app/services/sandbox_skill_runner.py`

**Rules**:
- `executionMode: "llm-only"` → core path (unchanged)
- `executionMode: "media-generate"` or skill with Python script → sandbox path
- Memory update happens after output is sanitized

### 8.2 Skill Marketplace

**Current**: Skills declare `executionMode` as `llm-only` or `media-generate`.

**After**: Extend `executionMode` enum with sandbox-specific values.

**New values for `skills.executionMode`**:
- `core-text` (renamed from `llm-only`)
- `sandbox-code` (Python/Node execution)
- `sandbox-command` (shell commands)
- `sandbox-browser` (browser automation)
- `sandbox-file` (file processing)
- `sandbox-media` (media processing — renamed from `media-generate`)

**Backward compatibility**: `llm-only` maps to `core-text`, `media-generate` maps to `sandbox-media`.

**New schema fields on `skills` table**:
- `sandboxProfileSlug` (varchar 64, nullable) — References sandbox profile
- `requiresNetwork` (boolean, default false)
- `requiresBrowser` (boolean, default false)
- `maxRuntimeSeconds` (integer, default 300)
- `maxInputMb` (integer, default 50)

### 8.3 Virtual Workflow Automation

**Current**: LangGraph + RestrictedPython + AST evaluation.

**After**: Code nodes and HTTP nodes execute in sandbox. Template/expression nodes stay in core.

**Migration approach**: Node-level sandbox dispatch, NOT whole-graph bundle.

**Rationale**: The workflow engine already has well-separated node executors. Migrating individual node types is simpler and more testable than bundling the entire graph.

| Node Type | Execution | Reason |
|-----------|-----------|--------|
| Code node | **Sandbox** | Replace RestrictedPython with real isolation |
| HTTP node (external) | **Sandbox** | Egress control |
| HTTP node (internal) | Core | Trusted internal API |
| Template node | Core | Jinja2 sandbox sufficient |
| Expression/Loop node | Core | AST whitelist sufficient |
| Browser node | **Sandbox** | Browser isolation |
| File transform node | **Sandbox** | File processing |

### 8.4 Document Management + RAG

**Current**: PPTX parser uses python-pptx (read-only, 50MB limit). Google Slides uses REST API.

**After**: File parsing with native libraries moves to sandbox. REST API calls stay in core.

**Phase 3 migration** (lower priority since current parsers are read-only with size limits):
- PPTX text/image extraction → sandbox
- Future PDF/DOCX parsing → sandbox from day-1
- OCR → sandbox
- Chunking from parsed content → can stay in core

**Core path** (unchanged):
- File metadata storage
- Permission checks
- Vector embedding API calls (after sanitize)
- ChromaDB writes

### 8.5 Presentation Studio

**Current**: Import via Celery task (`presentation_import_tasks.py`), export not yet sandboxed.

**After**: Import and export pipelines run in sandbox containers.

- Slide import → sandbox (parsing user files)
- Asset normalization → sandbox (image/media processing)
- Export/render → sandbox (native rendering libs)
- Thumbnail generation → sandbox
- Visual metadata CRUD → core (unchanged)

### 8.6 Media Studio

**Current**: FFmpeg subprocess in Celery worker with font whitelist and metachar filtering.

**After**: All FFmpeg operations run in sandbox containers.

**Phase 1 migration** (highest priority due to subprocess risk):
- FFmpeg trimming/muxing/concat → sandbox
- Image normalization/resize → sandbox
- Waveform extraction → sandbox
- Subtitle burn-in → sandbox

**Core path** (unchanged):
- External model API invocation (text prompt → provider API)
- Media job status tracking
- Callback handling

### 8.7 Connectors (Google Drive / OneDrive)

**Current**: Token refresh and file listing in core. File download via REST API.

**After**: Split into two phases per job:
1. **Control step** (core): Schedule, token refresh, cursor bookkeeping
2. **File fetch + parse** (sandbox): Download, unpack, parse, convert, sanitize

---

## 9. New Components

### 9.1 Node.js (apps/web) Additions

**New router**: `apps/web/server/routers/sandbox.ts`
- `createJob` — Submit execution request
- `getJobStatus` — Poll job status
- `cancelJob` — Cancel running job
- `getJobTranscript` — Fetch execution logs
- `listJobs` — Admin job explorer
- `getProfiles` — List available sandbox profiles

**New services**:
- `apps/web/server/services/sandbox/dispatchService.ts` — Route workload to sandbox
- `apps/web/server/services/sandbox/policyResolver.ts` — Resolve profile + network policy
- `apps/web/server/services/sandbox/statusProjection.ts` — Map sandbox state to user-friendly status
- `apps/web/server/services/sandbox/costEstimator.ts` — Estimate job cost
- `apps/web/server/services/sandbox/artifactAccess.ts` — Signed URL generation for outputs

**Modified routers** (add sandbox dispatch):
- `chat.ts`
- `skills.ts`
- `media.ts`
- `library.ts`

### 9.2 Python Backend Additions

**New integration module**: `python-backend/app/integrations/opensandbox/`
- `client.py` — OpenSandbox SDK wrapper with retry logic
- `models.py` — Pydantic models for sandbox requests/responses
- `lifecycle.py` — Create, monitor, destroy sandboxes
- `execution.py` — Run commands, code, browser tasks
- `files.py` — Stage inputs, collect outputs
- `config.py` — Configuration and connection settings

**New services**:
- `python-backend/app/services/sandbox_dispatcher.py` — Classify workload, select profile, dispatch
- `python-backend/app/services/sandbox_profiles.py` — Profile catalog management
- `python-backend/app/services/sandbox_artifacts.py` — S3/R2 artifact upload/download
- `python-backend/app/services/sandbox_audit.py` — Audit event emission
- `python-backend/app/services/sandbox_costs.py` — Cost calculation per job

**New worker**:
- `python-backend/app/workers/sandbox_job_worker.py` — Celery task for sandbox job lifecycle

**Modified areas**:
- `python-backend/app/video/pipeline.py` — Replace subprocess with sandbox dispatch
- `python-backend/app/kilo/pty_manager.py` — Replace PTY with sandbox commands
- `python-backend/app/services/docker_executor.py` — Replace with sandbox execution
- `python-backend/app/orchestrator/node_executors/data_executors/code_executor.py` — Replace RestrictedPython
- `python-backend/app/tasks/media_job_worker.py` — Route through sandbox
- `python-backend/app/tasks/presentation_import_tasks.py` — Route through sandbox

---

## 10. Data Model Changes

### 10.1 New Tables

#### `sandbox_profiles`

Reusable runtime configurations. Start with 4 profiles, expand as needed.

```sql
CREATE TABLE sandbox_profiles (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  execution_mode VARCHAR(50) NOT NULL,  -- code, command, browser, file, media
  base_image VARCHAR(512) NOT NULL,
  entrypoint_template TEXT,
  cpu_limit VARCHAR(16) DEFAULT '1000m',
  memory_limit_mb INTEGER DEFAULT 2048,
  ephemeral_disk_mb INTEGER DEFAULT 5120,
  timeout_seconds INTEGER DEFAULT 300,
  network_default_action VARCHAR(8) DEFAULT 'deny',  -- deny | allow
  allow_browser BOOLEAN DEFAULT FALSE,
  allow_command BOOLEAN DEFAULT TRUE,
  allow_code_interpreter BOOLEAN DEFAULT FALSE,
  allow_file_upload BOOLEAN DEFAULT TRUE,
  max_input_mb INTEGER DEFAULT 50,
  max_output_mb INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `sandbox_jobs`

Canonical record of each sandboxed execution.

```sql
CREATE TABLE sandbox_jobs (
  id VARCHAR(36) PRIMARY KEY,  -- uuid
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  feature_type VARCHAR(32) NOT NULL,  -- chat, skill, workflow, library, media, presentation, connector
  feature_ref_id VARCHAR(128),  -- FK to originating feature record
  execution_mode VARCHAR(50) NOT NULL,
  sandbox_profile_id INTEGER REFERENCES sandbox_profiles(id),
  opensandbox_id VARCHAR(128),  -- ID from OpenSandbox API
  status VARCHAR(32) NOT NULL DEFAULT 'accepted',
  status_reason TEXT,
  image_uri VARCHAR(512),
  input_manifest_json JSONB,
  output_manifest_json JSONB,
  stdout_excerpt TEXT,
  stderr_excerpt TEXT,
  cost_estimate NUMERIC(12,4),
  cost_actual NUMERIC(12,4),
  idempotency_key VARCHAR(128),
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sandbox_jobs_idempotency
  ON sandbox_jobs(tenant_id, feature_type, feature_ref_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_sandbox_jobs_tenant_status ON sandbox_jobs(tenant_id, status);
CREATE INDEX idx_sandbox_jobs_opensandbox_id ON sandbox_jobs(opensandbox_id);
```

#### `sandbox_artifacts`

```sql
CREATE TABLE sandbox_artifacts (
  id SERIAL PRIMARY KEY,
  sandbox_job_id VARCHAR(36) NOT NULL REFERENCES sandbox_jobs(id),
  artifact_type VARCHAR(32) NOT NULL,  -- primary, log, screenshot, thumbnail, chunk, debug
  object_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128),
  size_bytes BIGINT,
  sha256 VARCHAR(64),
  is_primary BOOLEAN DEFAULT FALSE,
  metadata_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sandbox_artifacts_job ON sandbox_artifacts(sandbox_job_id);
```

#### `tenant_sandbox_policies`

```sql
CREATE TABLE tenant_sandbox_policies (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(36) UNIQUE NOT NULL REFERENCES tenants(id),
  default_profile_id INTEGER REFERENCES sandbox_profiles(id),
  max_concurrent_sandboxes INTEGER DEFAULT 5,
  max_daily_runtime_seconds INTEGER DEFAULT 36000,  -- 10 hours
  max_single_job_seconds INTEGER DEFAULT 1800,  -- 30 min
  default_network_action VARCHAR(8) DEFAULT 'deny',
  egress_rules_json JSONB DEFAULT '[]',
  allowed_images_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 10.2 Existing Tables to Extend

```sql
-- skills table: add sandbox fields
ALTER TABLE skills ADD COLUMN sandbox_profile_slug VARCHAR(64);
ALTER TABLE skills ADD COLUMN requires_network BOOLEAN DEFAULT FALSE;
ALTER TABLE skills ADD COLUMN requires_browser BOOLEAN DEFAULT FALSE;
ALTER TABLE skills ADD COLUMN max_runtime_seconds INTEGER DEFAULT 300;
ALTER TABLE skills ADD COLUMN max_input_mb INTEGER DEFAULT 50;

-- media_callback_events: add sandbox job reference
ALTER TABLE media_callback_events ADD COLUMN sandbox_job_id VARCHAR(36);

-- presentation_conversion_records: add sandbox job reference
ALTER TABLE presentation_conversion_records ADD COLUMN sandbox_job_id VARCHAR(36);

-- api_audit_events: add sandbox correlation
ALTER TABLE api_audit_events ADD COLUMN sandbox_job_id VARCHAR(36);
ALTER TABLE api_audit_events ADD COLUMN opensandbox_id VARCHAR(128);

-- workflow_executions: add sandbox tracking
ALTER TABLE workflow_executions ADD COLUMN sandbox_job_ids JSONB DEFAULT '[]';
```

---

## 11. Sandbox Profiles (Day-0 Catalog)

Start with 4 profiles. Expand only when a new workload type requires different resource/policy configuration.

### `code-default`

For skill Python execution, workflow code nodes.

| Setting | Value |
|---------|-------|
| CPU | 1000m |
| Memory | 2048 MB |
| Timeout | 600s (10 min) |
| Network | deny (default) |
| Browser | No |
| Code interpreter | Yes |
| Max input | 50 MB |

### `media-processing`

For FFmpeg, image processing, presentation rendering.

| Setting | Value |
|---------|-------|
| CPU | 2000m |
| Memory | 4096 MB |
| Disk | 10240 MB |
| Timeout | 1800s (30 min) |
| Network | deny (default) |
| Browser | No |
| Command | Yes |
| Max input | 200 MB |

### `browser-default`

For browser automation, web scraping, GUI agents.

| Setting | Value |
|---------|-------|
| CPU | 2000m |
| Memory | 4096 MB |
| Timeout | 600s (10 min) |
| Network | allow (egress allowlist per job) |
| Browser | Yes (Chromium/Playwright) |
| Max input | 20 MB |

### `file-parser`

For document parsing, OCR, format conversion.

| Setting | Value |
|---------|-------|
| CPU | 1000m |
| Memory | 2048 MB |
| Timeout | 300s (5 min) |
| Network | deny |
| Browser | No |
| Command | Yes |
| Max input | 100 MB |

---

## 12. Network Security Model

### 12.1 Default: Deny All Egress

Every sandbox profile starts with `network_default_action = deny`.

### 12.2 Egress Allowlist (Per Profile / Per Job)

Allowlist entries are merged in order (most restrictive wins):

1. Global platform deny rules (always applied)
2. Profile baseline rules
3. Tenant policy rules
4. Per-job explicit rules

### 12.3 Domain Classes

| Class | Examples | Used By |
|-------|----------|---------|
| `internal-platform` | S3/R2 endpoints, internal APIs | All profiles |
| `provider-api` | OpenAI, Anthropic, Google APIs | Skills that need LLM |
| `connector-saas` | Google Drive, Microsoft Graph | Connector ingestion |
| `public-web` | Any internet domain | Browser profiles only |
| `package-registry` | PyPI, npm (if install needed) | Code profiles with install |

### 12.4 Hard Deny (Global)

Always blocked regardless of profile:
- Cloud metadata services (169.254.169.254, etc.)
- Docker/Kubernetes control sockets
- Internal admin endpoints
- Private CIDRs (unless explicit internal service allowlist)

---

## 13. Identity and Secret Handling

### 13.1 SmartSpecPro ↔ OpenSandbox Auth

- Use `OPENSANDBOX_API_KEY` for lifecycle API authentication
- Key stored in `.env` (encrypted at rest per existing convention)
- Support key rotation with overlap window

### 13.2 In-Sandbox Secret Policy

**NEVER inject tenant secrets into sandbox as raw environment variables.**

Instead:
1. Prefer short-lived scoped tokens (generated per job, expire with sandbox)
2. Prefer signed S3/R2 URLs for file access (TTL 15 min)
3. Only inject feature-scoped tokens, never platform master keys
4. Redact secret values from stdout/stderr before persistence

### 13.3 Connector Credentials

- Stored encrypted in core services (existing `crypto.ts` AES-256-GCM)
- Sandbox receives short-lived access token or pre-signed download URLs
- Sandbox cannot access refresh tokens

---

## 14. Queueing and Job Lifecycle

### 14.1 Job States

```
accepted → policy_resolved → queued → provisioning → staging_inputs
  → executing → collecting_outputs → persisting → completed
                                                 → failed
                                                 → timed_out
                                                 → canceled
```

### 14.2 Queue Integration

- **Cloud Tasks** dispatches sandbox jobs (existing queue infra)
- **Celery** workers act as sandbox orchestrators (new `sandbox_job_worker` task)
- **Redis** stores real-time job status for polling

### 14.3 Retry Policy

| Scenario | Retry? | Max Attempts |
|----------|--------|-------------|
| Sandbox create transient failure | Yes | 3 |
| Input staging network failure | Yes | 3 |
| Artifact upload transient failure | Yes | 3 |
| Sandbox not ready within window | Yes | 2 |
| Parser crash on malformed file | No | — |
| Policy denied | No | — |
| Hard timeout exceeded | No | — |
| Forbidden network target | No | — |

### 14.4 Idempotency

- Web submit carries idempotency key
- Orchestrator deduplicates by `(tenant_id, feature_type, feature_ref_id, idempotency_key)`
- Repeated retries do not create duplicate sandboxes

---

## 15. Storage and Artifact Model

### 15.1 Input Model

1. Orchestrator stages input files from S3/R2 into sandbox via Filesystem API
2. Uses manifest: `{objectKey, mountPath}` pairs
3. No shared persistent volumes between app and sandbox

### 15.2 Output Model

1. Sandbox writes outputs to local filesystem
2. Orchestrator collects outputs via Filesystem API
3. Orchestrator uploads to S3/R2
4. Core services persist metadata + checksum
5. Sandbox local files destroyed when sandbox expires

### 15.3 Artifact Types

- `primary` — Main result (JSON, rendered file, etc.)
- `log` — stdout/stderr capture
- `screenshot` — Browser screenshots
- `thumbnail` — Generated thumbnails
- `chunk` — Extracted text chunks (for RAG)
- `debug` — Debug package (admin only)

---

## 16. Observability and Audit

### 16.1 Metrics (Extend Existing)

Add to existing `api_audit_events` and `provider_usage_log`:

- Sandbox create latency
- Sandbox execution duration
- Failure rate by profile/tenant/feature
- Timeout rate
- Concurrent sandboxes count
- Egress deny events
- Cost per job/tenant/feature

### 16.2 Audit Events

Every sandbox job emits events to existing JSONL audit log:

```jsonl
{"eventType": "sandbox_job_accepted", "sandboxJobId": "sj_123", "tenantId": "t_123", ...}
{"eventType": "sandbox_created", "sandboxJobId": "sj_123", "opensandboxId": "os_456", ...}
{"eventType": "sandbox_executing", "sandboxJobId": "sj_123", ...}
{"eventType": "sandbox_completed", "sandboxJobId": "sj_123", "runtimeMs": 4523, ...}
{"eventType": "sandbox_deleted", "sandboxJobId": "sj_123", ...}
```

### 16.3 Cost Attribution

Cost per job = f(CPU-seconds, memory-GB-seconds, network-egress, storage-written)

Attributed to: tenant → package → feature → job

---

## 17. User-Visible Status Mapping

Users see product status, not infrastructure status:

| Internal State | User-Visible |
|---------------|--------------|
| accepted, policy_resolved, queued | Queued |
| provisioning, staging_inputs | Preparing secure workspace |
| executing | Running securely |
| collecting_outputs, persisting | Collecting results |
| completed | Completed |
| failed | Failed |
| timed_out | Timed out |
| canceled | Canceled |

---

## 18. Configuration

### 18.1 New Environment Variables (apps/web/.env)

```bash
OPENSANDBOX_ENABLED=false          # Feature flag for gradual rollout
OPENSANDBOX_DISPATCH_MODE=optional  # optional | required (required = no fallback)
SANDBOX_DEFAULT_PROFILE=code-default
SANDBOX_REQUIRE_FOR_SKILLS=false    # Set true after Phase 3
SANDBOX_REQUIRE_FOR_MEDIA=false     # Set true after Phase 2
```

### 18.2 New Environment Variables (python-backend/.env — Localhost)

```bash
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

### 18.3 New Environment Variables (python-backend — Production via GCP Secret Manager)

```bash
OPENSANDBOX_ENABLED=true
OPENSANDBOX_BASE_URL=https://sandbox.smartaihub.app  # Hetzner Singapore
OPENSANDBOX_API_KEY=<stored-in-secret-manager>
OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=30
OPENSANDBOX_CREATE_TIMEOUT_SECONDS=120
OPENSANDBOX_READY_POLL_INTERVAL_MS=2000
SANDBOX_ARTIFACT_BUCKET=smartspec-sandbox-artifacts
SANDBOX_SIGNED_URL_TTL_SECONDS=900
SANDBOX_DEFAULT_NETWORK_ACTION=deny
SANDBOX_MAX_CONCURRENT_GLOBAL=20
SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT=5
```

### 18.4 New Environment Variables (Hetzner — OpenSandbox Server)

```bash
OPENSANDBOX_API_KEY=<same-key-as-production>
OPENSANDBOX_RUNTIME=docker
OPENSANDBOX_DOCKER_NETWORK=sandbox-exec
OPENSANDBOX_DEFAULT_TIMEOUT=600
OPENSANDBOX_MAX_SANDBOXES=20
LOG_LEVEL=info
```

---

## 19. Implementation Phases

### Phase 1: Foundation + Localhost Setup (Week 1-2)

**Environment: Localhost only**

**Deliverables:**
1. Create `docker-compose.sandbox.yml` with OpenSandbox server
2. Create isolated Docker networks (`opensandbox-network`, `opensandbox-exec`)
3. Create Python adapter (`app/integrations/opensandbox/`) with `SandboxBackend` protocol
4. DB migrations: `sandbox_profiles`, `sandbox_jobs`, `sandbox_artifacts`, `tenant_sandbox_policies`
5. Seed 4 baseline sandbox profiles
6. Add `OPENSANDBOX_*` env vars to `python-backend/.env`
7. Update `run-services.sh` to manage OpenSandbox lifecycle
8. Pre-pull sandbox base images

**Acceptance:**
- `docker compose -f docker-compose.sandbox.yml up -d` starts OpenSandbox
- No port conflicts with existing services (uses :8080)
- No network conflicts (separate Docker network)
- `SandboxBackend` protocol can create/run/destroy sandbox jobs
- Existing services unaffected

### Phase 2: High-Risk Migration on Localhost (Week 3-4)

**Environment: Localhost only**

**Deliverables:**
1. Migrate FFmpeg media pipeline → sandbox (`video/pipeline.py`)
2. Migrate PTY shell sessions → sandbox (`pty_manager.py`)
3. Migrate Docker executor → sandbox (`docker_executor.py`)
4. Feature flag `OPENSANDBOX_ENABLED=true` with `DISPATCH_MODE=optional`
5. Dual-path: sandbox dispatch with legacy fallback

**Acceptance:**
- FFmpeg/PTY/Docker operations execute in isolated sandbox containers
- Legacy path still works when `OPENSANDBOX_ENABLED=false`
- No subprocess calls in migrated paths when sandbox is enabled
- Existing tests pass with both paths

### Phase 3: Skill + Workflow Migration (Week 5-6)

**Environment: Localhost only**

**Deliverables:**
1. Extend `skills` table with sandbox fields (Drizzle migration)
2. Migrate Python skill runner (Node `spawn()` → sandbox dispatch via Python)
3. Migrate workflow code nodes (RestrictedPython → sandbox code interpreter)
4. Create `apps/web/server/routers/sandbox.ts` for job management
5. Add sandbox job status polling to chat UI

**Acceptance:**
- Skills with `executionMode: sandbox-*` run in sandbox
- Workflow code nodes use sandbox code interpreter
- Chat UI shows sandbox job progress

### Phase 4: Hetzner Production Setup (Week 7-8)

**Environment: Hetzner Cloud Singapore**

**Parallel with GCP migration (011-DeployPlan) — no conflicts**

**Deliverables:**
1. Provision Hetzner CPX31 (4 vCPU, 8 GB, Singapore)
2. Run `scripts/setup-hetzner-sandbox.sh` (Docker + OpenSandbox + firewall)
3. Configure TLS via Let's Encrypt (domain: `sandbox.smartaihub.app`)
4. Configure firewall: allow only GCP Cloud Run egress IPs
5. Add `OPENSANDBOX_API_KEY` to GCP Secret Manager
6. Update Python orchestrator: `OPENSANDBOX_BASE_URL=https://sandbox.smartaihub.app`
7. Test GCP Cloud Run → Hetzner connectivity
8. Verify artifact flow: Cloud Run → R2 → Hetzner → R2 → Cloud Run

**Acceptance:**
- Python orchestrator on Cloud Run can create/run sandbox jobs on Hetzner
- Latency < 10ms for API calls (both in Singapore)
- File transfer via R2 signed URLs works from both sides
- Firewall blocks all non-GCP traffic
- TLS certificate valid and auto-renewing

### Phase 5: File Processing + Connectors (Week 9-10)

**Environment: Both localhost and Hetzner**

**Deliverables:**
1. Migrate PPTX import to sandbox
2. Migrate presentation export to sandbox
3. Migrate connector file processing (Google Drive / OneDrive) to sandbox
4. Add `file-parser` profile with appropriate resource limits

**Acceptance:**
- Document parsing runs in isolated sandbox containers
- Connector ingestion separates control (core) from parse (sandbox)

### Phase 6: Admin Tooling + Observability (Week 11-12)

**Deliverables:**
1. Sandbox job explorer (admin UI page)
2. Tenant sandbox policy management (admin UI)
3. Cost analytics for sandbox usage
4. Egress deny event reports
5. Reconciliation workers: orphan sandbox cleanup, stuck job detection
6. Hetzner health monitoring (uptime check + alert)

**Acceptance:**
- Admin can view/manage sandbox jobs, profiles, policies
- Cost attribution works per tenant/feature
- Alert fires within 1 min if Hetzner is unreachable

### Phase 7: Production Hardening (Week 13-14)

**Deliverables:**
1. Set `OPENSANDBOX_DISPATCH_MODE=required`
2. Remove legacy subprocess execution paths
3. Remove docker.sock access from status dashboard
4. Set all `SANDBOX_REQUIRE_FOR_*=true`
5. Chaos testing (kill OpenSandbox mid-execution, R2 outage, network flap)
6. Load testing (concurrent sandbox creation under tenant burst)

**Acceptance:**
- Zero legacy execution fallback paths in production
- All risky jobs have `sandbox_jobs` records
- System recovers gracefully from Hetzner/sandbox failures
- Core services (chat, LLM, CRUD) unaffected when sandbox is down

### Phase 8: Scale + Kubernetes (Future)

**Preconditions:**
- OpenSandbox upstream ships stable Kubernetes runtime
- Monthly sandbox cost justifies K8s operational overhead
- Scale exceeds Hetzner single-server capacity

**Options when the time comes:**
- Hetzner dedicated server (bare metal, more power, same price range)
- GKE with OpenSandbox K8s runtime
- Multiple Hetzner servers with load balancer

---

## 20. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Hetzner outage** | Sandbox jobs fail; core services unaffected | Health check + alert; retry via Cloud Tasks; core LLM/CRUD continues |
| **GCP ↔ Hetzner network disruption** | Sandbox dispatch times out | 30s timeout + 3 retries; jobs queued in Cloud Tasks |
| **Hetzner Docker daemon crash** | All sandbox jobs fail | systemd auto-restart; remote monitoring; manual SSH fallback |
| Sandbox cold start latency | Slower UX for first execution | Pre-warm hot profiles; async UX with progress indicators |
| OpenSandbox API breaking change | Adapter needs update | Pin image version; test in staging first |
| Sandbox container escape | Hetzner host compromised | Separate server; no credentials stored on Hetzner; firewall; regular patching |
| Localhost resource contention | Dev machine overloaded | CPU/memory limits in docker-compose.sandbox.yml; max 10 concurrent |
| Artifact storage growth | Cost increase | TTL-based cleanup, artifact class retention tiers |
| Teams bypass sandbox for speed | Security regression | Feature flags set to `required`; code review guardrails |
| Egress allowlist too broad | Data exfiltration risk | Default deny; explicit per-job allowlists; audit all egress |
| Hetzner cost creep | Budget overrun | Max concurrent limits; monitoring; CPX31 is only $16/mo baseline |

---

## 21. Launch Readiness Gate

Do NOT go-live (set `required` mode) until ALL of these pass:

1. All HIGH-risk features execute via `sandbox_jobs`
2. Default deny egress verified in all profiles
3. No production service calls subprocess directly
4. Image allowlist enforced
5. Orphan sandbox reconciler active
6. Cost tracking functional
7. Per-tenant quota enforcement tested
8. Rollback plan tested (can disable sandbox and revert to legacy paths temporarily)
9. Smoke tests pass with multi-tenant scenarios

---

## 22. Rollback Strategy

**Phase 1-4** (feature flags = `optional`): Legacy paths still active. Set `OPENSANDBOX_ENABLED=false` to disable.

**Phase 5** (feature flags = `required`): No legacy fallback. Rollback options:
- Disable specific feature types (e.g., browser workflows) while keeping others
- Switch profile version back
- Block specific image family
- Reduce tenant concurrency to zero temporarily
- **Emergency only**: Re-enable legacy subprocess paths via environment variable override

---

## 23. Success Criteria

The integration succeeds when:

1. Every risky workload in SmartSpecPro has an execution record in `sandbox_jobs`
2. No production code path runs user-controlled subprocess on core services
3. Tenants can be individually limited on domain access, runtime, and concurrency
4. Admins can trace any execution fully (who, what, where, when, cost)
5. Feature teams add new skills/workflows by reusing the profile catalog — no custom infra needed
6. System handles sandbox failures gracefully without data loss

---

## 24. References

1. [OpenSandbox GitHub (Alibaba)](https://github.com/alibaba/OpenSandbox)
2. [OpenSandbox Architecture Doc](https://github.com/alibaba/OpenSandbox/blob/main/docs/architecture.md)
3. [OpenSandbox Server README](https://github.com/alibaba/OpenSandbox/blob/main/server/README.md)
4. [OpenSandbox Egress Component](https://github.com/alibaba/OpenSandbox/blob/main/components/egress/README.md)
5. [OpenSandbox Ingress Component](https://github.com/alibaba/OpenSandbox/blob/main/components/ingress/README.md)
6. SmartSpecPro CLAUDE.md (project conventions)
7. SmartSpecPro `apps/web/drizzle/schema.ts` (current database schema)
8. SmartSpecPro `python-backend/app/video/pipeline.py` (current FFmpeg execution)
9. SmartSpecPro `apps/web/server/services/skillExecutor.ts` (current skill execution)
