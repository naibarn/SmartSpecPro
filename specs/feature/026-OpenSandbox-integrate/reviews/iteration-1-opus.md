# Opus Review

**Model:** claude-opus-4
**Generated:** 2026-02-26T15:00:00Z

---

## 1. Completeness -- Coverage of Spec Requirements

### 1.1 Well-covered areas

The plan covers all major spec requirements including the 4 new database tables, the 6 workload migration targets, the Python SDK module structure, the tRPC sandbox router, the Hetzner production setup, the admin UI, and the feature flag rollout strategy. The phased approach matches the spec's 8-phase timeline.

### 1.2 Missing or underspecified areas

**A. The `factory_orchestrator.py` subprocess call is not addressed.** Additional subprocess.run() at line 29 with 30-minute timeout. Should be explicitly included or excluded.

**B. The `media_job_worker.py` has ~20 distinct subprocess calls.** The plan mentions "Route through sandbox" but does not describe how to handle a single Celery task chaining 5-10 sequential FFmpeg invocations. Running each as a separate sandbox create-execute-destroy cycle would be catastrophically slow. Strategy needed: either keep a single sandbox alive for the duration of a complex media job and run multiple commands sequentially, or refactor the pipeline. This is the single most important gap.

**C. `presentation_render.py` subprocess calls at lines 397 and 475 (Playwright/FFmpeg)** — not mentioned.

**D. `media_pipeline.py` (separate from `pipeline.py`)** has subprocess calls at lines 236, 252, 266 — not mentioned.

**E. `auth_generator.py` subprocess call at line 485** — not mentioned.

**F. No mention of how Python backend communicates back to Node.js after sandbox completion.** Polling mechanism (interval, long-poll, WebSocket) never specified.

**G. No credit deduction integration.** How sandbox costs integrate with existing credit system (`creditService.ts`, `deductCredits()`).

## 2. Feasibility -- Technical Soundness

### 2.1 Docker socket mounting
`:ro` flag does NOT prevent write operations through Docker API — socket is Unix socket and API calls are read-write. OpenSandbox server is a privileged component — must be acknowledged.

### 2.2 Network isolation refinement
OpenSandbox server may not need to be on `opensandbox-exec` — it tells Docker to attach new containers there. Verify with actual SDK.

### 2.3 `aiobreaker` not in requirements.txt
Need to add dependency. Alternative: `pybreaker`.

### 2.4 Docker compose naming conflict
Existing `docker/docker-compose.sandbox.yml` has different content. Recommend `docker-compose.opensandbox.yml`.

### 2.5 PTY migration complexity — HIGH RISK
OpenSandbox `commands.run()` is batch execution, not interactive PTY. Fundamental mismatch with real-time bidirectional I/O, terminal resize, ANSI escape sequences. Either OpenSandbox supports WebSocket terminals, PTY must be redesigned as non-interactive, or migration deferred.

### 2.6 Sandbox startup latency impact
2-10s creation time per sandbox. Chat flow currently has near-zero latency. Need pre-warming, session reuse, or pool strategy.

### 2.7 executionMode enum migration risk
Existing rows with `llm-only` and `media-generate` need backward compatibility. Every query filtering by these values must be updated.

## 3. Risks Not Addressed

### 3.1 Hetzner 0.5TB traffic limit
Need traffic estimation and alert thresholds.

### 3.2 Single-region failure mode
Unclear when `optional` → `required` transition is safe without HA.

### 3.3 No data cleanup policy
`sandbox_jobs` and `sandbox_artifacts` will accumulate. Need retention/TTL.

### 3.4 No test strategy at all
No unit, integration, or E2E tests mentioned. 80% Python coverage enforced.

### 3.5 Python backend needs SQLAlchemy models
New tables defined in Drizzle ORM but Python uses SQLAlchemy. Need corresponding models.

## 4. Implementation Ordering

- Sections 5-7 can only be tested on localhost until Section 8 (Hetzner) — should note production verification.
- Section 2 should include SQLAlchemy models since Section 3 depends on them.
- Admin UI sub-sections can be built incrementally.

## 5. Specific Suggestions

1. Add "Sandbox Session Reuse" strategy for multi-command jobs
2. Add MockSandboxBackend for development without OpenSandbox
3. Specify Python-to-Node.js completion notification mechanism
4. Rename compose file to avoid conflict
5. Add explicit dependency list for new Python packages
6. Address all missed subprocess-calling files
7. Add monitoring metrics (Prometheus/StatsD)
8. Add Celery queue routing for sandbox worker

## 6. Security

- Hetzner API key storage mechanism unspecified
- Sandbox escape via Docker socket misconfiguration
- No input sanitization before sandbox dispatch

## Summary Assessment

**CRITICAL gaps (must address before implementation):**
1. `media_job_worker.py` multi-command strategy
2. PTY interactive session incompatibility
3. Missing SQLAlchemy models for Python backend

**HIGH gaps:**
4. No test strategy
5. Several subprocess files missed

**MEDIUM gaps:**
6. Celery queue routing
7. Docker compose naming
8. Sandbox startup latency / pre-warming

Recommendation: Address items 1-3 before beginning implementation. Items 4-8 can be resolved during implementation.
