# Integration Notes: Opus Review Feedback

## Suggestions INTEGRATED

### 1. Multi-command sandbox session reuse (CRITICAL)
**Reviewer said**: `media_job_worker.py` has ~20 subprocess calls. Running separate sandbox per command is too slow.
**Integration**: Add "Sandbox Session Reuse" pattern to Section 5.1. A single sandbox is created at job start and reused for all commands within that job. The Celery worker keeps the sandbox alive across the full task lifecycle.

### 2. PTY migration scope reduction (CRITICAL)
**Reviewer said**: OpenSandbox `commands.run()` is batch execution, not interactive PTY. Fundamental mismatch.
**Integration**: Defer PTY migration to Phase 3+ with explicit research task to evaluate OpenSandbox WebSocket support. If no interactive mode available, redesign PTY as non-interactive command execution or keep legacy with enhanced security.

### 3. SQLAlchemy models for Python backend (CRITICAL)
**Reviewer said**: New tables in Drizzle ORM but Python uses SQLAlchemy. Need corresponding models.
**Integration**: Add to Section 2 — create SQLAlchemy model definitions for all 4 new tables in `python-backend/app/models/`. Drizzle migrations create the tables; Python accesses via SQLAlchemy.

### 4. Test strategy (HIGH)
**Reviewer said**: No test strategy at all.
**Integration**: Add testing requirements to each section. MockSandboxBackend for unit tests. Integration tests with mocked HTTP. TDD plan will cover this in detail.

### 5. Additional subprocess files (HIGH)
**Reviewer said**: `factory_orchestrator.py`, `presentation_render.py`, `media_pipeline.py`, `auth_generator.py` missed.
**Integration**: Add to migration scope. `presentation_render.py` and `media_pipeline.py` join Phase 2 (media). `factory_orchestrator.py` joins Phase 2. `auth_generator.py` evaluated — if it's OTP/TOTP generation, it stays in core (no user-controlled input); if it runs untrusted code, it migrates.

### 6. Completion notification mechanism (HIGH)
**Reviewer said**: How does Node.js learn about sandbox completion?
**Integration**: Add explicit polling mechanism — tRPC `getJobStatus` with client-side polling (2s interval for active jobs, 10s for queued). Future enhancement: SSE for real-time push.

### 7. Credit deduction integration (HIGH)
**Reviewer said**: No integration with existing credit system.
**Integration**: Add to Section 4.5 (cost estimator). Pre-check credits before dispatch. Deduct estimated credits upfront, reconcile with actual cost after completion.

### 8. Docker compose naming (MEDIUM)
**Reviewer said**: Naming conflict with `docker/docker-compose.sandbox.yml`.
**Integration**: Rename to `docker-compose.opensandbox.yml`.

### 9. Celery queue routing (MEDIUM)
**Reviewer said**: No queue definition for sandbox worker.
**Integration**: Add `celery-sandbox` queue to celery_app.py, docker-compose.media.yml, run-services.sh.

### 10. MockSandboxBackend (MEDIUM)
**Reviewer said**: Not every developer wants to run OpenSandbox locally.
**Integration**: Add `MockSandboxBackend` implementing `SandboxBackend` protocol using subprocess (legacy path) while recording sandbox_jobs rows.

### 11. New Python dependencies (MEDIUM)
**Reviewer said**: `aiobreaker` not in requirements.txt.
**Integration**: Add explicit dependency list to Section 1.3.

### 12. Docker socket trust boundary (MEDIUM)
**Reviewer said**: `:ro` doesn't prevent Docker API writes. OpenSandbox server is privileged.
**Integration**: Add explicit trust boundary documentation to Section 1.1.

### 13. Data retention policy (MEDIUM)
**Reviewer said**: No cleanup for sandbox_jobs and sandbox_artifacts.
**Integration**: Add retention policies — 30 days for jobs, 7 days for artifacts, S3 lifecycle rules.

### 14. Monitoring metrics (MEDIUM)
**Reviewer said**: No Prometheus/StatsD metrics.
**Integration**: Add specific metric names to Section 9.4.

## Suggestions NOT integrated

### 1. Input file scanning before sandbox dispatch
**Reviewer said**: Validate files for zip bombs, polyglot files, symlink attacks.
**Reason**: The sandbox IS the isolation boundary. Validating inside the sandbox defeats the purpose. Instead, enforce file size limits (which already exist) and let the sandbox contain any malicious payload. Over-validating inputs creates complexity without security benefit when the execution environment is already isolated.

### 2. Hetzner HA requirement before `required` mode
**Reviewer said**: Don't set `required` until second Hetzner node exists.
**Reason**: The cost/complexity of HA (2x servers, load balancer) is not justified at current scale. The rollback strategy (re-enable legacy subprocess paths via env var) provides adequate recovery. Core services remain unaffected when sandbox is down. The `required` mode gate already requires comprehensive testing.

### 3. Pre-warming sandbox pools
**Reviewer said**: Sandbox startup latency impacts chat UX.
**Reason**: Pre-warming adds operational complexity (keeping idle sandboxes, managing pool size). The simpler approach is sandbox session reuse (one sandbox per job) and pre-pulling Docker images. Cold start is only on first job per image; subsequent jobs reuse cached images. 2-3s overhead with progress indicators is acceptable for media/code tasks.
