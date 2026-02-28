# Synthesized Specification: OpenSandbox Integration for SmartSpecPro

## 1. Problem Statement

SmartSpecPro currently executes risky workloads (subprocess calls, PTY shells, Docker commands, Python code execution, file parsing) directly within its core application services. This creates security risks, makes multi-tenant isolation difficult, and couples execution infrastructure to the application platform.

Six execution patterns have been identified as HIGH or MEDIUM risk:
1. FFmpeg subprocess (`subprocess.run()`) in video pipeline
2. PTY shell sessions (`subprocess.Popen`) in Kilo terminal
3. Docker executor (`asyncio.create_subprocess_exec`) for arbitrary commands
4. Python skill runner (Node.js `child_process.spawn()`) for skill execution
5. RestrictedPython code executor in workflow engine
6. Document parsers (PPTX, Excel) with native libraries

## 2. Solution

Integrate Alibaba OpenSandbox as a secure execution substrate. All risky workloads move from direct subprocess execution to isolated Docker containers managed by OpenSandbox. SmartSpecPro transitions from "executor" to "orchestrator + policy enforcer + artifact router."

### Key Architectural Decisions

1. **Docker bridge runtime** (not K8s) — OpenSandbox K8s runtime is upstream roadmap only
2. **Two-environment deployment**:
   - Localhost: `docker-compose.sandbox.yml` with separate Docker networks
   - Production: Hetzner Cloud CPX31 Singapore (~$16/month) + GCP Cloud Run
3. **Python backend as orchestrator** — all sandbox interaction goes through Python FastAPI
4. **Feature flag rollout** — `OPENSANDBOX_ENABLED` + `DISPATCH_MODE=optional|required`
5. **SandboxBackend protocol** — single abstraction works for both localhost and Hetzner
6. **No impact on GCP migration** — Hetzner is additive, not a replacement

## 3. Scope

### In Scope
- OpenSandbox SDK integration in Python backend
- Database schema for sandbox profiles, jobs, artifacts, tenant policies (4 new tables)
- Docker Compose configuration for localhost sandbox
- Migration of 6 risky execution patterns to sandbox
- Sandbox profile catalog (4 baseline profiles)
- tRPC router for sandbox job management
- Audit logging and cost attribution
- Hetzner server setup for production
- Admin UI for sandbox management
- Feature flag system for gradual rollout

### Out of Scope
- Kubernetes runtime (future, depends on upstream)
- Sandboxing safe operations (AST eval, Jinja2 sandbox, template rendering)
- Business CRUD operations (auth, settings, billing)
- Pure LLM text-only API calls
- Custom Helm charts

## 4. Technical Requirements

### 4.1 Python Backend (Orchestrator)

**New module**: `python-backend/app/integrations/opensandbox/`
- `client.py` — SDK wrapper with httpx connection pooling, aiobreaker circuit breaker, tenacity retry
- `models.py` — Pydantic models for sandbox requests/responses
- `lifecycle.py` — Create, monitor, destroy sandbox containers
- `execution.py` — Run commands, code, browser tasks
- `files.py` — Stage inputs, collect outputs via Filesystem API
- `config.py` — Configuration and connection settings

**New services**: `sandbox_dispatcher.py`, `sandbox_profiles.py`, `sandbox_artifacts.py`, `sandbox_audit.py`, `sandbox_costs.py`

**New Celery worker**: `sandbox_job_worker.py` — manages full sandbox job lifecycle

**Modified files**:
- `video/pipeline.py` — Replace subprocess with sandbox dispatch
- `kilo/pty_manager.py` — Replace PTY with sandbox commands
- `services/docker_executor.py` — Replace with sandbox execution
- `orchestrator/.../code_executor.py` — Replace RestrictedPython
- `tasks/media_job_worker.py` — Route through sandbox
- `tasks/presentation_import_tasks.py` — Route through sandbox

### 4.2 Node.js Backend (Control Plane)

**New tRPC router**: `apps/web/server/routers/sandbox.ts`
- `createJob`, `getJobStatus`, `cancelJob`, `getJobTranscript`, `listJobs`, `getProfiles`

**New services** in `apps/web/server/services/sandbox/`:
- `dispatchService.ts` — Route workload to sandbox
- `policyResolver.ts` — Resolve profile + network policy
- `statusProjection.ts` — Map sandbox state to user-friendly status
- `costEstimator.ts` — Estimate job cost
- `artifactAccess.ts` — Signed URL generation

**Modified routers**: `chat.ts`, `skills.ts`, `media.ts`, `library.ts`

### 4.3 Database Schema

**4 new tables**:
1. `sandbox_profiles` — Reusable runtime configurations (slug, image, CPU/memory/disk limits, network policy, timeout)
2. `sandbox_jobs` — Canonical execution records (tenant_id, user_id, feature_type, opensandbox_id, status, cost)
3. `sandbox_artifacts` — Output files (object_key, mime_type, sha256, is_primary)
4. `tenant_sandbox_policies` — Per-tenant limits (max_concurrent, daily_runtime, egress_rules)

**Extended tables**: skills (sandbox fields), media_callback_events, presentation_conversion_records, api_audit_events, workflow_executions

### 4.4 Docker Configuration

**New file**: `docker-compose.sandbox.yml`
- OpenSandbox server container on port 8080
- Two Docker networks: `opensandbox-network` (bridge) + `opensandbox-exec` (internal)
- Volume mount: Docker socket (read-only) for container management
- Resource limits for the server container

### 4.5 Hetzner Production Setup

- CPX31 (4 vCPU, 8 GB, Singapore) — ~$16/month
- Docker + OpenSandbox installation script
- TLS via Let's Encrypt (domain: `sandbox.smartaihub.app`)
- Firewall: allow only GCP Cloud Run egress IPs
- Monitoring: health check + alerting

### 4.6 Sandbox Profiles (Day-0)

| Profile | CPU | Memory | Timeout | Network | Use Case |
|---------|-----|--------|---------|---------|----------|
| code-default | 1000m | 2 GB | 600s | deny | Skill Python, workflow code nodes |
| media-processing | 2000m | 4 GB | 1800s | deny | FFmpeg, image processing, rendering |
| browser-default | 2000m | 4 GB | 600s | allow (allowlist) | Browser automation, web scraping |
| file-parser | 1000m | 2 GB | 300s | deny | Document parsing, OCR, format conversion |

## 5. Security Requirements

1. **Network isolation**: Default deny all egress; explicit allowlist per profile/job
2. **Hard deny list**: Cloud metadata (169.254.169.254), Docker/K8s sockets, private CIDRs
3. **Secret handling**: Never inject tenant secrets as raw env vars; use short-lived scoped tokens and signed URLs
4. **Artifact integrity**: SHA-256 checksums for all sandbox outputs
5. **Audit trail**: Every sandbox job gets full lifecycle events in JSONL audit log
6. **Tenant isolation**: Per-tenant sandbox policies, quotas, and egress rules
7. **Hetzner hardening**: Firewall, TLS, no credentials stored on Hetzner, SSH key-only access

## 6. Resilience Requirements

1. **Circuit breaker**: aiobreaker on sandbox API calls (fail_max=5, timeout=30s)
2. **Retry**: tenacity with exponential backoff (3 attempts, 1-10s wait)
3. **Connection pooling**: httpx with 20 max connections, 10 keepalive
4. **Graceful degradation**: Core services (chat, LLM, CRUD) always work; sandbox failures only affect sandboxed workloads
5. **Job idempotency**: Deduplicate by (tenant_id, feature_type, feature_ref_id, idempotency_key)
6. **Orphan cleanup**: Reconciliation worker detects stuck/abandoned sandboxes

## 7. Implementation Phases

| Phase | Scope | Environment | Duration |
|-------|-------|-------------|----------|
| 1 | Foundation + localhost Docker setup | Localhost | Week 1-2 |
| 2 | High-risk migration (FFmpeg, PTY, Docker executor) | Localhost | Week 3-4 |
| 3 | Skill + workflow migration | Localhost | Week 5-6 |
| 4 | Hetzner production setup | Hetzner | Week 7-8 |
| 5 | File processing + connectors | Both | Week 9-10 |
| 6 | Admin tooling + observability | Both | Week 11-12 |
| 7 | Production hardening | Both | Week 13-14 |
| 8 | Scale + K8s (future) | TBD | When needed |

## 8. Success Criteria

1. Every risky workload has an execution record in `sandbox_jobs`
2. No production code path runs user-controlled subprocess on core services
3. Tenants can be individually limited on domain access, runtime, and concurrency
4. Admins can trace any execution fully (who, what, where, when, cost)
5. Feature teams add new skills/workflows by reusing the profile catalog
6. System handles sandbox failures gracefully without data loss
7. Core services remain operational when sandbox is unavailable
