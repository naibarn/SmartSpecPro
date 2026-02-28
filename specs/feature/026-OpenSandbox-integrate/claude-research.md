# Research Findings: OpenSandbox Integration

## Codebase Research

### Project Structure & Architecture

SmartSpecPro is a monorepo managed by Turborepo with pnpm workspaces:

```
SmartSpecPro/
├── apps/web/           # Main app: React frontend + Express/tRPC backend
│   ├── client/src/     # React 19, Vite 7, TailwindCSS 4, Radix UI
│   ├── server/         # Express 4, tRPC 11, Drizzle ORM
│   ├── drizzle/        # Schema + migrations
│   ├── shared/         # Shared types/contracts
│   └── skills/         # Skill definitions (skill.md + schemas)
├── python-backend/     # FastAPI, SQLAlchemy 2, Celery, LangChain/LangGraph
│   ├── app/
│   │   ├── video/      # FFmpeg media pipeline
│   │   ├── kilo/       # PTY shell manager
│   │   ├── services/   # Docker executor, various services
│   │   ├── orchestrator/ # Workflow engine with node executors
│   │   ├── tasks/      # Celery tasks
│   │   └── integrations/ # External service adapters
│   └── tests/
├── control-plane/      # Fastify management service (:7070)
├── packages/           # Shared packages (db, shared, skills, ui)
└── docker/             # Docker configs, systemd service files
```

### Execution Patterns (Integration Points)

#### 1. Skill Executor — Node.js `child_process.spawn()`
- **File**: `apps/web/server/services/skillExecutor.ts` (lines 518-638)
- **Pattern**: Spawns Python subprocess with 10-minute timeout
- **Protocol**: JSON via stdin/stdout — sends `{action, skillName, userMessage, context}`, receives `{result, error}`
- **Risk**: MEDIUM — user-controlled skill input flows to Python subprocess
- **Migration**: Route `executionMode: "media-generate"` and Python-script skills through sandbox

#### 2. FFmpeg Media Pipeline — Python `subprocess.run()`
- **File**: `python-backend/app/video/pipeline.py`
- **Pattern**: Direct subprocess.run() with list args (no shell=True), 1800s timeout
- **Safeguards**: Font whitelist, metachar filtering
- **Risk**: MEDIUM-HIGH — processes user-uploaded media files
- **Migration**: Phase 1 priority — replace subprocess with `sandbox.commands.run("ffmpeg ...")`

#### 3. Docker Executor — `asyncio.create_subprocess_exec`
- **File**: `python-backend/app/services/docker_executor.py`
- **Pattern**: Async subprocess with shlex.quote for arg sanitization
- **Risk**: HIGH — arbitrary command execution in Docker context
- **Migration**: Phase 1 — replace with OpenSandbox execution API

#### 4. PTY Shell Manager — `subprocess.Popen`
- **File**: `python-backend/app/kilo/pty_manager.py`
- **Pattern**: Popen for interactive PTY sessions, disallowed tokens validation
- **Risk**: HIGH — interactive shell access
- **Migration**: Phase 1 — replace with sandbox command streaming

#### 5. RestrictedPython Code Executor
- **File**: `python-backend/app/orchestrator/node_executors/data_executors/code_executor.py`
- **Pattern**: RestrictedPython with safe_builtins, signal-based timeout
- **Risk**: MEDIUM — restricted but escape vulnerabilities are known
- **Migration**: Phase 2 — replace with sandbox code interpreter

#### 6. Document Parsers
- **Files**: `pptx_importer.py`, `gslides_importer.py`, Excel/CSV executors
- **Pattern**: Library-based parsing with size limits (50MB for PPTX)
- **Risk**: LOW-MEDIUM — read-only with constraints
- **Migration**: Phase 3 — lower priority

### Database Schema (Drizzle ORM)

Key tables relevant to integration:
- **`skills`**: Has `executionMode` field (values: `llm-only`, `media-generate`), needs extension for sandbox modes
- **`tenants`**: Domain-based isolation with `tenantId` FK everywhere
- **`media_callback_events`**: Tracks async media job results — add sandbox_job_id
- **`presentation_conversion_records`**: Import tracking — add sandbox_job_id
- **`api_audit_events`**: Audit log — add sandbox correlation fields
- **`workflow_executions`**: Workflow runs — add sandbox_job_ids
- **`provider_usage_log`**: Cost tracking per LLM request — model for sandbox costs

Schema location: `apps/web/drizzle/schema.ts` (~2500 lines)
Migration journal: `apps/web/drizzle/meta/_journal.json`

### Queue Infrastructure

- **Cloud Tasks** (`apps/web/server/services/cloudTasks.ts`): Primary async dispatch for GCP
- **Celery** (`python-backend/app/core/celery_app.py`): 4 worker types:
  - `celery-media` (2 CPU, 3 GB)
  - `celery-video` (4 CPU, 8 GB)
  - `celery-import` (2 CPU, 3 GB)
  - `celery-beat` (scheduler)
- **BullMQ/Redis**: Used for Node.js side job orchestration
- Docker Compose config: `docker-compose.media.yml`

### Storage Abstraction

- **File**: `apps/web/server/storage.ts`
- **Providers**: S3 (AWS), R2 (Cloudflare), Local filesystem
- **Pattern**: Abstraction layer with `uploadFile()`, `getSignedUrl()`, `deleteFile()`
- **Key**: Sandbox artifacts should use the same storage abstraction
- **Signed URLs**: Already supports TTL-based signed URLs (used for media delivery)

### Service Management

- **systemd services**: `smartspec-backend.service`, `smartspec-web.service`
- **run-services.sh**: Manages lifecycle including Docker infra
- **Nginx**: Reverse proxy at :80/:443
- **Docker networks**: Currently `smartspec-network` for postgres, redis, celery

### Existing Patterns to Follow

1. **tRPC routers**: Type-safe RPC with Zod validation (`apps/web/server/routers/`)
2. **Drizzle migrations**: `pnpm db:push` for schema changes
3. **Celery tasks**: Decorated functions in `app/tasks/` with retry logic
4. **Audit logging**: JSONL files + database tables
5. **Feature flags**: Environment variable-based (`FEATURE_*` pattern)
6. **Pydantic models**: Used for request/response validation in Python
7. **httpx**: Async HTTP client in Python backend

## Testing

### TypeScript/JavaScript (Vitest)
- **Framework**: Vitest
- **Config**: `apps/web/vitest.config.ts`
- **Run**: `cd apps/web && pnpm test`
- **Coverage**: `pnpm test:coverage`
- **Patterns**: Standard describe/it blocks, mock utilities via vitest
- **Test location**: Co-located with source or in `__tests__/` directories

### Python (pytest)
- **Framework**: pytest with markers
- **Config**: `python-backend/pytest.ini` or `pyproject.toml`
- **Run**: `cd python-backend && pytest`
- **Coverage**: 80% minimum enforced
- **Markers**: `unit`, `integration`, `e2e`, `auth`, `credits`, `llm`
- **Fixtures**: In `conftest.py` files
- **Mocking**: `unittest.mock` / `pytest-mock`

---

## Web Research

### OpenSandbox Python SDK

**Source**: Official GitHub repository and documentation

#### Lifecycle API
```python
from opensandbox import Sandbox, SandboxConfig

config = SandboxConfig(
    image="custom-runner:latest",
    timeout=600,
    envs={"KEY": "value"},
    resources={"cpu": "2000m", "memory": "4Gi"},
)
sandbox = Sandbox.create(config)
# sandbox.id → unique identifier
# sandbox.status → "running" | "stopped" | etc.
sandbox.close()  # destroys sandbox
```

#### Command Execution
```python
result = sandbox.commands.run("python /app/script.py", timeout=300)
# result.exit_code → int
# result.stdout → str
# result.stderr → str
```

#### Filesystem API
```python
sandbox.filesystem.write("/workspace/input.json", json_bytes)
content = sandbox.filesystem.read("/workspace/output.json")
file_list = sandbox.filesystem.list("/workspace/")
```

#### Code Interpreter (Jupyter-based)
```python
result = sandbox.code_interpreter.execute("import pandas as pd; df = pd.read_csv('/workspace/data.csv'); print(df.shape)")
# result.output → execution output
# result.error → error if any
```

**Key findings:**
- Docker bridge runtime is production-ready; K8s runtime is roadmap only
- SDK supports Python, Java, TypeScript — Python SDK most mature
- Sandbox creation takes 2-10s depending on image pull status
- Supports custom Docker images (pre-bake dependencies for faster startup)
- Resources are configurable per sandbox (CPU, memory, disk)
- No built-in authentication — must implement API key auth at proxy level

### Docker Network Isolation Patterns

**Sources**: Docker official documentation, security best practices

#### Internal Networks
```yaml
networks:
  sandbox-exec:
    internal: true  # No internet access, no host access
```

- `internal: true` prevents containers from reaching the default bridge and external networks
- Sandbox containers on `sandbox-exec` cannot reach postgres, redis, or the host
- OpenSandbox server needs to be on BOTH networks (API access + container management)

#### Egress Control
- Docker's built-in `internal` flag provides basic isolation
- For fine-grained egress control, use iptables rules or a proxy sidecar
- gVisor (`--runtime=runsc`) provides kernel-level isolation if needed later
- Firecracker micro-VMs provide strongest isolation but require more setup

#### Network Topology
```
opensandbox-network (bridge, external)
  └── opensandbox-server (API endpoint, needs Docker socket)
        │
        └── creates containers on:
            opensandbox-exec (internal, isolated)
              ├── sandbox-abc (ephemeral, no internet)
              └── sandbox-def (ephemeral, no internet)
```

### FastAPI Circuit Breaker Patterns

**Sources**: Python resilience libraries documentation

#### aiobreaker (Async Circuit Breaker)
```python
from aiobreaker import CircuitBreaker

sandbox_breaker = CircuitBreaker(
    fail_max=5,
    timeout_duration=timedelta(seconds=30),
    exclude=[PolicyDeniedError],  # Don't trip on policy errors
)

@sandbox_breaker
async def create_sandbox(config: SandboxConfig) -> Sandbox:
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{base_url}/sandboxes", json=config.dict())
        response.raise_for_status()
        return Sandbox.from_response(response.json())
```

#### tenacity (Retry with Backoff)
```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
)
async def stage_file(sandbox_id: str, path: str, content: bytes):
    ...
```

#### httpx Connection Pooling
```python
# Shared client with connection pool for OpenSandbox API
sandbox_client = httpx.AsyncClient(
    base_url=settings.OPENSANDBOX_BASE_URL,
    timeout=httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=5.0),
    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
    headers={"Authorization": f"Bearer {settings.OPENSANDBOX_API_KEY}"},
)
```

**Recommendation**: Combine aiobreaker + tenacity + httpx pooling:
- Circuit breaker prevents cascade failures when OpenSandbox is down
- Retry with exponential backoff handles transient network errors
- Connection pooling reduces latency for high-throughput sandbox creation

### Hetzner Cloud Singapore

**Sources**: Hetzner Cloud documentation, pricing pages

#### CPX31 Specifications
- 4 vCPU (AMD EPYC, shared)
- 8 GB RAM
- 160 GB NVMe disk
- 20 TB traffic (EU/US) / **0.5 TB traffic (Singapore)** — overage EUR 7.40/TB
- Price: ~$16/month (EUR 14.49)
- Location: `sgp1` (Singapore)

#### Firewall Configuration
- Hetzner Cloud Firewall API for programmatic rule management
- Can restrict inbound to GCP Cloud Run egress IP ranges only
- SSH access from admin IPs only
- All other traffic blocked by default

#### TLS Setup
- Let's Encrypt with certbot for auto-renewal
- Domain: `sandbox.smartaihub.app` → Hetzner IP
- Nginx or Caddy as reverse proxy on the Hetzner server

#### GCP Connectivity
- Both in Singapore region → 1-5ms RTT
- Communication via public internet (HTTPS)
- No VPN/VPC peering needed (simple enough for initial deployment)
- Artifact transfer via Cloudflare R2 signed URLs (accessible from both)

#### Cost Analysis
| Item | Monthly Cost |
|------|-------------|
| CPX31 server | ~$16 |
| Traffic (0.5 TB included) | $0 (if under limit) |
| Traffic overage | EUR 7.40/TB |
| DNS (Cloudflare) | $0 |
| TLS (Let's Encrypt) | $0 |
| **Total baseline** | **~$16/month** |

vs. GCE equivalent (e2-standard-4): ~$70-100/month

#### Risks
1. **Singapore 0.5TB traffic limit** — monitor closely; large artifact transfers could exceed
2. **Single point of failure** — no HA; mitigated by circuit breaker + retry + core services unaffected
3. **No managed Kubernetes** — fine for Docker bridge runtime; reevaluate if K8s needed
4. **Hetzner DDoS protection** — basic included; may need additional for production
