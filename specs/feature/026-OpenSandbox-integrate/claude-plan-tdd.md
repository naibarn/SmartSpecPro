# TDD Plan: OpenSandbox Integration

This document mirrors `claude-plan.md` sections and defines what tests to write BEFORE implementing each section.

## Testing Setup

### Python (pytest)
- Framework: pytest with async support (pytest-asyncio)
- Markers: `unit`, `integration`, `sandbox` (new marker)
- Fixtures: Mock httpx client, mock sandbox responses, test database session
- Coverage: 80% minimum enforced
- Run: `cd python-backend && pytest -m sandbox`

### TypeScript (Vitest)
- Framework: Vitest (existing)
- Patterns: Mock tRPC context, mock HTTP calls to Python backend
- Run: `cd apps/web && pnpm test`

---

## Section 1: Foundation — Docker Setup and SDK Integration

### 1.1 Docker Compose
- Test: `docker-compose.opensandbox.yml` validates with `docker compose config`
- Test: No port conflicts with existing services (check 8080 is only used by sandbox)
- Test: Network `opensandbox-exec` is internal (verify with `docker network inspect`)

### 1.3 Python OpenSandbox SDK Module

**config.py tests:**
- Test: Default settings load correctly when env vars not set
- Test: Settings override from environment variables
- Test: OPENSANDBOX_ENABLED=false disables all sandbox operations
- Test: Invalid URL raises validation error

**client.py tests:**
- Test: create_sandbox sends correct HTTP request to OpenSandbox API
- Test: Circuit breaker opens after 5 consecutive failures
- Test: Circuit breaker resets after timeout_duration
- Test: Retry logic retries on 429, 500, 503 status codes
- Test: Retry logic does NOT retry on 400, 403, 404
- Test: Connection pooling reuses connections (check httpx client config)
- Test: Request timeout is respected

**lifecycle.py tests:**
- Test: provision_sandbox creates sandbox and polls until ready
- Test: provision_sandbox fails after max poll attempts
- Test: destroy_sandbox handles already-destroyed sandbox gracefully
- Test: get_or_create returns existing sandbox for same job_id

**execution.py tests:**
- Test: run_command returns exit_code, stdout, stderr
- Test: run_command respects timeout
- Test: run_code sends code to interpreter endpoint
- Test: Command execution failure returns non-zero exit code

**files.py tests:**
- Test: stage_inputs uploads each file from manifest to sandbox
- Test: stage_inputs handles missing S3/R2 objects gracefully
- Test: collect_outputs downloads files and uploads to S3/R2
- Test: collect_outputs computes SHA-256 checksum correctly

### 1.4 SandboxBackend Protocol
- Test: Real client implements SandboxBackend protocol
- Test: MockSandboxBackend implements SandboxBackend protocol
- Test: MockSandboxBackend records sandbox_jobs rows

### 1.5 MockSandboxBackend
- Test: Mock backend executes commands via subprocess
- Test: Mock backend creates sandbox_jobs records
- Test: Mock backend captures stdout/stderr

---

## Section 2: Database Schema and Migrations

### 2.1-2.3 New Tables and Seed Data
- Test: Migration creates all 4 tables with correct columns
- Test: Seed script creates 4 baseline profiles
- Test: sandbox_profiles slug uniqueness enforced
- Test: sandbox_jobs idempotency index prevents duplicates
- Test: Foreign key constraints work (tenant_id, user_id, profile_id)
- Test: Default values populated correctly (e.g., status='accepted')

### 2.2 Existing Table Extensions
- Test: skills table has new sandbox columns (nullable, no migration error)
- Test: Existing skill rows unaffected after migration
- Test: New columns accept sandbox-related values

### 2.4 SQLAlchemy Models
- Test: SandboxProfile model maps to correct table and columns
- Test: SandboxJob model maps to correct table and columns
- Test: SandboxArtifact model maps to correct table and columns
- Test: TenantSandboxPolicy model maps to correct table and columns
- Test: CRUD operations work via async session

---

## Section 3: Python Services Layer

### 3.1 Sandbox Dispatcher
- Test: Dispatcher routes sandbox workload to Celery when enabled
- Test: Dispatcher falls back to legacy when OPENSANDBOX_ENABLED=false
- Test: Dispatcher falls back to legacy when DISPATCH_MODE=optional and sandbox unavailable
- Test: Dispatcher rejects when tenant exceeds max_concurrent limit
- Test: Dispatcher rejects when tenant exceeds daily_runtime limit
- Test: Dispatcher creates sandbox_jobs record with status 'accepted'
- Test: Dispatcher returns job_id for polling

### 3.2 Sandbox Profile Service
- Test: Profile loaded by slug
- Test: Profile loaded by feature_type mapping
- Test: Profile cache refreshes after 60s
- Test: Per-job overrides merged with profile defaults
- Test: Resource limits validated against tenant policy

### 3.3 Sandbox Artifact Service
- Test: Upload output to S3/R2 with correct object key
- Test: SHA-256 checksum computed and stored
- Test: sandbox_artifacts record created
- Test: Signed URL generated with 15-min TTL
- Test: Tenant isolation — cannot access other tenant's artifacts

### 3.4 Sandbox Audit Service
- Test: Audit event emitted for each lifecycle stage
- Test: Event includes sandboxJobId, tenantId, userId
- Test: Events written to JSONL audit log

### 3.5 Sandbox Cost Service
- Test: Cost calculated from CPU-seconds + memory-GB-seconds
- Test: sandbox_jobs.cost_actual updated on completion
- Test: Cost attributed to correct tenant and feature

### 3.6 Celery Queue Routing
- Test: Sandbox tasks routed to celery-sandbox queue
- Test: Existing media/video/import queues unaffected

### 3.7 Sandbox Job Worker
- Test: Worker progresses through all status states (accepted → completed)
- Test: Worker creates sandbox, stages inputs, executes, collects outputs
- Test: Worker destroys sandbox on completion
- Test: Worker destroys sandbox on failure (cleanup)
- Test: Worker retries on transient sandbox creation failure (max 3)
- Test: Worker does NOT retry on policy denied
- Test: Worker marks job as timed_out when timeout exceeded
- Test: Worker handles sandbox session reuse (multiple commands in same sandbox)
- Test: Worker collects partial outputs on timeout

---

## Section 4: Node.js Sandbox Router and Services

### 4.1 tRPC Sandbox Router
- Test: createJob validates input schema (Zod)
- Test: createJob requires authentication
- Test: createJob enforces tenant isolation
- Test: getJobStatus returns correct status for owned job
- Test: getJobStatus returns 403 for other tenant's job (unless admin)
- Test: cancelJob calls Python backend cancellation
- Test: listJobs filters by tenant (non-admin)
- Test: listJobs returns all tenants (admin only)

### 4.2 Dispatch Service
- Test: Dispatch routes sandbox-* execution modes to sandbox path
- Test: Dispatch routes core-text to legacy path
- Test: Dispatch falls back to legacy when sandbox disabled
- Test: Dispatch sends correct request to Python backend

### 4.3 Policy Resolver
- Test: Resolves profile for given feature type
- Test: Checks tenant concurrent limit
- Test: Checks tenant daily runtime limit
- Test: Returns merged configuration

### 4.4 Status Projection
- Test: Maps each internal state to correct user-friendly label
- Test: Handles unknown state gracefully

### 4.5 Cost Estimator and Credit Integration
- Test: Estimates cost from profile defaults
- Test: Pre-checks hasEnoughCredits before dispatch
- Test: Deducts estimated credits on dispatch
- Test: Reconciles credits on completion (refund overage)
- Test: Refunds credits on failure

### 4.6 Job Completion Notification
- Test: getJobStatus returns refreshed status on each poll
- Test: Polling interval configuration respected by client

### 4.7 Artifact Access
- Test: Generates signed URL for artifact
- Test: Enforces tenant isolation
- Test: TTL is configurable

---

## Section 5: High-Risk Workload Migration

### 5.1 FFmpeg Media Pipeline
- Test: FFmpeg command executes in sandbox when enabled
- Test: FFmpeg command uses legacy subprocess when disabled
- Test: Input media files staged into sandbox correctly
- Test: Output files collected from sandbox and uploaded to S3/R2
- Test: Multi-command job reuses same sandbox (no recreation per command)
- Test: Font files staged for subtitle burn-in
- Test: Sandbox uses media-processing profile

### 5.2 PTY Shell (DEFERRED)
- No tests needed for sandbox migration (deferred)
- Test: Existing PTY tests continue to pass (regression)

### 5.3 Docker Executor
- Test: Commands execute in sandbox when enabled
- Test: Commands use legacy path when disabled
- Test: Sandbox uses code-default profile

### 5.4 Additional Media Files
- Test: media_pipeline.py subprocess calls route through sandbox
- Test: presentation_render.py subprocess calls route through sandbox
- Test: factory_orchestrator.py subprocess calls route through sandbox

---

## Section 6: Skill and Workflow Migration

### 6.1 Skill Execution Mode Extension
- Test: New execution modes accepted by schema (sandbox-code, sandbox-command, etc.)
- Test: Backward compatibility — llm-only maps to core-text
- Test: Backward compatibility — media-generate maps to sandbox-media
- Test: Existing skills with old values continue to work

### 6.2 Skill Executor Modification
- Test: Skills with core-text use existing LLM path
- Test: Skills with sandbox-* dispatch to sandbox
- Test: Skill input/output format unchanged for chat UI

### 6.3 Workflow Code Node
- Test: Code node executes in sandbox when enabled
- Test: Code node uses RestrictedPython when disabled
- Test: Sandbox uses code-default profile with code interpreter
- Test: Dependencies available in sandbox (pandas, numpy)

### 6.4 Workflow HTTP Node
- Test: External HTTP requests route through sandbox
- Test: Egress allowlist enforced
- Test: Internal HTTP nodes stay in core

---

## Section 7: Existing Router Modifications

### 7.1 Chat Router
- Test: Sandbox skill triggers sandbox job creation
- Test: Status updates stream to chat UI
- Test: Artifacts included in chat response on completion

### 7.2 Skills Router
- Test: Skills list includes sandboxRequired flag
- Test: Skills with sandbox execution show sandbox metadata

### 7.3 Media Router
- Test: Media jobs requiring sandbox dispatch through sandbox
- Test: Non-sandbox media jobs use existing path

### 7.4 Library Router
- Test: PPTX/PDF upload triggers sandbox parsing
- Test: Plain text/JSON/CSV stays in core

---

## Section 8: Hetzner Production Setup

### 8.1-8.5 Server and Connectivity
- Test: Health check endpoint responds with 200
- Test: TLS certificate valid
- Test: Firewall blocks non-GCP IPs
- Test: Python orchestrator can create sandbox on Hetzner
- Test: Artifact transfer via R2 signed URLs works
- Test: Latency < 10ms for API calls

---

## Section 9: Admin UI and Observability

### 9.1-9.4 Admin Pages
- Test: Sandbox job explorer renders with mock data
- Test: Job detail view shows status timeline
- Test: Cancel button calls cancelJob procedure
- Test: Profile management CRUD works
- Test: Tenant policy management works
- Test: Cost analytics displays correct totals

### 9.5-9.7 Data Retention, Metrics, Reconciliation
- Test: Retention cleanup task deletes jobs older than 30 days
- Test: Retention cleanup task deletes artifacts older than 7 days
- Test: Orphan sandbox cleanup destroys sandboxes without active jobs
- Test: Stuck job detection marks expired jobs as failed
