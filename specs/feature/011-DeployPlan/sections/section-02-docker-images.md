Now I have all the context needed. Let me generate the section content.

# Section 2: Docker Images

## Overview

This section creates three production-ready Docker images for deployment to Google Cloud Run:

1. **node-api** -- Multi-stage image serving the React dashboard and Express/tRPC API from a single Node.js process.
2. **python-orchestrator** -- Multi-stage image running the FastAPI backend for LLM gateway, webhooks, media orchestration, and Cloud Tasks task handler endpoints.
3. **video-job-runner** -- Extends the python-orchestrator image with FFmpeg 7.1 and font packages for Cloud Run Job-based video rendering.

Additionally, this section adds health check endpoints (`/healthz`, `/readyz`) to the Node.js service, enhances the graceful shutdown handlers in both services, creates a root `.dockerignore`, and provides a `docker-compose.cloud-run-dev.yml` for local testing of the containerized stack.

## Dependencies

- **Section 01 (GCP Bootstrap):** Artifact Registry repository must exist before images can be pushed. Service accounts and Secret Manager secrets must be configured for the images to run in Cloud Run.

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/docker/Dockerfile.node-api` | Production Dockerfile for the Node.js web app |
| `/home/dev/projects/SmartSpecPro/docker/Dockerfile.python-orchestrator` | Production Dockerfile for the Python backend |
| `/home/dev/projects/SmartSpecPro/docker/Dockerfile.video-job-runner` | Dockerfile extending python-orchestrator with FFmpeg |
| `/home/dev/projects/SmartSpecPro/.dockerignore` | Root-level Docker ignore file |
| `/home/dev/projects/SmartSpecPro/docker-compose.cloud-run-dev.yml` | Local development compose file mirroring Cloud Run |
| `/home/dev/projects/SmartSpecPro/scripts/docker-build.sh` | Build script for all three images |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | Add `/healthz` and `/readyz` endpoints; enhance SIGTERM handler |
| `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` | Enhance lifespan shutdown with PostHog and Sentry flush |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/health.py` | Add lightweight `/health/live` alias for Cloud Run startup probe |

---

## Tests

Tests should be written first. The Docker image tests are primarily integration tests validated via shell scripts and build checks. The health check and graceful shutdown tests are unit/integration tests in the existing test frameworks.

### Node.js Health Check and Shutdown Tests (Vitest)

Create test file at `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/healthcheck.test.ts`:

```typescript
/**
 * Tests for Cloud Run health check endpoints (/healthz, /readyz)
 * and graceful shutdown behavior.
 */

import { describe, it, expect, vi } from "vitest";

describe("GET /healthz", () => {
  it("returns 200 with status ok when process is running");
  it("returns JSON body with status field");
});

describe("GET /readyz", () => {
  it("returns 200 when DB pool and Redis are reachable");
  it("returns 503 when DB connection fails");
  it("returns 503 when Redis connection fails");
  it("includes individual check results in response body");
});

describe("Graceful shutdown", () => {
  it("stops accepting new connections on SIGTERM");
  it("drains in-flight requests before exiting");
  it("closes Redis connections during shutdown");
  it("closes DB connection pool during shutdown");
  it("exits with code 0 within 30 seconds");
});
```

### Python Health Check Tests (pytest)

Create test file at `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cloud_health.py`:

```python
"""
Tests for Cloud Run health and readiness endpoints.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestCloudHealth:
    """Tests for /health (startup probe) and /ready (readiness probe)."""

    async def test_health_returns_200_when_app_running(self, client: AsyncClient):
        """GET /health returns 200 if FastAPI is serving."""
        ...

    async def test_ready_returns_200_when_db_and_redis_reachable(self, client: AsyncClient):
        """GET /health/ready returns 200 when dependencies are healthy."""
        ...

    async def test_ready_returns_503_when_db_unreachable(self, client: AsyncClient):
        """GET /health/ready returns 503 when DB connection fails."""
        ...


@pytest.mark.asyncio
class TestGracefulShutdown:
    """Tests for SIGTERM graceful shutdown behavior."""

    async def test_sigterm_flushes_sentry(self):
        """SIGTERM triggers sentry_sdk.flush() during shutdown."""
        ...

    async def test_sigterm_disposes_engine(self):
        """SIGTERM triggers engine.dispose() during shutdown."""
        ...

    async def test_sigterm_closes_redis(self):
        """SIGTERM triggers Redis connection close during shutdown."""
        ...
```

### Docker Image Build Tests (Shell Script)

Create test script at `/home/dev/projects/SmartSpecPro/scripts/test-docker-images.sh`:

```bash
#!/usr/bin/env bash
# Validates Docker images build correctly and meet Cloud Run requirements.
# Run from repository root: ./scripts/test-docker-images.sh

set -euo pipefail

PASS=0
FAIL=0

assert_eq() {
  # Compares actual vs expected, increments PASS/FAIL
  ...
}

# --- node-api image ---
echo "=== Testing node-api image ==="

# Test: Dockerfile builds successfully with production target
docker build -f docker/Dockerfile.node-api --target runner -t node-api:test .
assert_eq $? 0 "node-api builds successfully"

# Test: Built image starts and responds to GET /healthz with 200
# (start container, curl /healthz, check status code)

# Test: Static assets are served from /assets/

# --- python-orchestrator image ---
echo "=== Testing python-orchestrator image ==="

# Test: Dockerfile builds successfully
docker build -f docker/Dockerfile.python-orchestrator -t python-orchestrator:test .
assert_eq $? 0 "python-orchestrator builds successfully"

# Test: Built image starts and responds to GET /health with 200

# --- video-job-runner image ---
echo "=== Testing video-job-runner image ==="

# Test: Dockerfile builds successfully
docker build -f docker/Dockerfile.video-job-runner -t video-job-runner:test .
assert_eq $? 0 "video-job-runner builds successfully"

# Test: FFmpeg is available at expected version
docker run --rm video-job-runner:test ffmpeg -version | grep -q "ffmpeg version 7"
assert_eq $? 0 "FFmpeg 7.x is installed"

# Test: Fonts are installed and discoverable via fc-list
docker run --rm video-job-runner:test fc-list | grep -qi "dejavu"
assert_eq $? 0 "DejaVu fonts are installed"

echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] || exit 1
```

---

## Implementation Details

### 1. Root `.dockerignore`

Create `/home/dev/projects/SmartSpecPro/.dockerignore` to keep build context small. This file is critical because the Docker build context is the entire repository root (required for the monorepo structure).

Contents to include:

```
# Dependencies (will be installed inside container)
**/node_modules
**/__pycache__
**/.venv

# Version control
.git
.gitignore

# IDE and editor files
.vscode
.idea
*.swp
*.swo

# Python backend excluded from node-api builds (and vice versa)
# (handled by stage-specific COPY instructions, but reduces context transfer)

# Build artifacts and caches
.turbo
**/dist
**/.next
**/coverage
**/.pytest_cache
**/.mypy_cache
**/.ruff_cache
**/htmlcov

# Environment and secrets
**/.env
**/.env.*
!**/.env.example

# Database backups
.db-backups

# Documentation and planning
planning
specs
docs
*.md
!packages/skills/**/skill.md

# Temporary and test files
tmp-workspace
**/tmp
**/*.test.ts
**/*.test.py
**/tests

# Docker-specific
docker-compose*.yml
Dockerfile*

# Tauri desktop app (not needed for cloud)
apps/tauri-shell

# Misc
*.log
*.sql
```

### 2. Node.js API Dockerfile (`docker/Dockerfile.node-api`)

This is an evolution of the existing `/home/dev/projects/SmartSpecPro/apps/web/Dockerfile`. The key differences from the existing Dockerfile are:

- Build context is the repository root (not `apps/web/`)
- Includes `packages/ui/` in addition to the existing workspace packages
- Uses `pnpm` instead of `npm` for consistency with the web app's package manager
- Adds `/healthz` and `/readyz` endpoint support (implemented in the app code)
- Runs as non-root user
- Uses `tini` as init process for proper signal handling in containers

**Stage structure:**

1. **deps** -- Install all dependencies (including devDependencies for Vite build). Copy `package.json` files for root, `apps/web/`, `packages/shared/`, `packages/db/`, `packages/ui/`, `packages/skills/`. Run `pnpm install --frozen-lockfile` (or `npm ci` as fallback).

2. **builder** -- Copy source code from all workspace packages. Run `cd apps/web && pnpm build` (Vite production build). This produces `apps/web/dist/` with the built server bundle and `apps/web/dist/public/` with the frontend assets.

3. **runner** (production) -- Based on `node:20-alpine`. Install `tini` for init process. Copy only: `apps/web/dist/`, `apps/web/drizzle/`, `apps/web/package.json`, production `node_modules`, and workspace `packages/`. Create non-root user. Set `NODE_ENV=production`. Entrypoint: `["tini", "--", "node", "dist/index.js"]`. Expose port 3000.

**Key configuration:**

```dockerfile
# The HEALTHCHECK instruction is for Docker, but Cloud Run ignores it.
# Cloud Run uses its own startup/liveness probes configured at deploy time.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
```

### 3. Python Orchestrator Dockerfile (`docker/Dockerfile.python-orchestrator`)

This evolves the existing `/home/dev/projects/SmartSpecPro/python-backend/Dockerfile`. Key differences:

- Uses `python:3.11-slim` (not Alpine, because many Python packages have C extensions that compile more reliably on Debian-based images)
- Removes Celery from the final image (Celery removal happens in Section 04, but the Dockerfile should not include `celery` in the entrypoint -- use uvicorn only)
- Removes `ffmpeg` from the base image (moved to video-job-runner only)
- Uses `uv` for fast dependency installation if available, falling back to `pip`

**Stage structure:**

1. **builder** -- Install build dependencies (`gcc`, `g++`, `libpq-dev`). Copy `requirements.txt`. Install Python dependencies to a virtual environment or user-local path.

2. **runtime** -- Based on `python:3.11-slim`. Install only runtime dependencies (`libpq5`, `curl`). Copy dependencies from builder stage. Copy application code (`python-backend/app/`, `python-backend/alembic/`, `python-backend/alembic.ini`). Create non-root user. Set `PYTHONUNBUFFERED=1`.

**Key configuration:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

Note the worker count is 2 (not 4 as in the existing Dockerfile). Cloud Run scales horizontally by adding instances, so each instance should have fewer workers to keep memory usage predictable.

### 4. Video Job Runner Dockerfile (`docker/Dockerfile.video-job-runner`)

This image extends the python-orchestrator image and adds FFmpeg and font packages. It runs as a Cloud Run Job (runs to completion, not a long-running server).

```dockerfile
FROM python-orchestrator:latest AS base

USER root

# Install FFmpeg 7.1 and font packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fontconfig \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

USER appuser

# No EXPOSE -- this is a Job, not a Service
# No HEALTHCHECK -- Jobs run to completion

# Entrypoint reads RENDER_SPEC_JSON env var or fetches from Cloud Storage
ENTRYPOINT ["python", "-m", "app.jobs.video_render"]
```

The actual `app/jobs/video_render.py` module is implemented in Section 11 (Video Pipeline). This Dockerfile just ensures the runtime environment has FFmpeg and fonts.

Note on FFmpeg version: Debian Bookworm (the base for `python:3.11-slim`) ships FFmpeg 5.x. To get FFmpeg 7.1, either:
- Use a static build from https://johnvansickle.com/ffmpeg/ (copy binary into image)
- Build from source (increases image size and build time)
- Accept FFmpeg 5.x from Debian repos (sufficient for the features used: concat, overlay, drawtext, amix)

The pragmatic approach for MVP is to use the Debian-packaged FFmpeg and pin via `ffmpeg=7:5.1.*` or similar. Document the version constraint and upgrade path.

### 5. Health Check Endpoints (Node.js)

Modify `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` to add two new endpoints before any middleware that requires authentication:

**`GET /healthz` (liveness/startup probe):**
- Returns `200 { "status": "ok" }` if the Express server is accepting requests.
- No dependency checks. This is purely "is the process alive?"
- Cloud Run uses this as the startup probe to detect cold-start readiness.

**`GET /readyz` (readiness probe):**
- Performs shallow checks of DB connection pool and Redis.
- DB check: Execute `SELECT 1` with a 2-second timeout.
- Redis check: Call `PING` with a 2-second timeout.
- Returns `200 { "status": "ready", "checks": { "db": "ok", "redis": "ok" } }` when both pass.
- Returns `503 { "status": "not_ready", "checks": { ... } }` if any check fails.
- Include individual check status in the response for debugging.

These endpoints must be registered early in the middleware stack (before auth, CSRF, and tenant middleware) so they always respond even during partial startup. Place them immediately after the JSON body parser and security headers:

```typescript
// Register health checks BEFORE auth middleware
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/readyz", async (_req, res) => {
  // Implementation: check DB and Redis with short timeouts
  // Return 200 or 503 based on results
});
```

### 6. Health Check Endpoints (Python)

The Python backend already has comprehensive health endpoints at `/health` (registered in `app/api/health.py`). For Cloud Run compatibility:

- **`GET /health`** -- Already exists and checks DB, Redis, and LLM proxy. Cloud Run startup probe should use this.
- **`GET /health/ready`** -- Already exists at `/health/ready` (readiness check).
- **`GET /health/live`** -- Already exists at `/health/live` (liveness check, always returns 200).

No new endpoints are needed for the Python service. The existing health infrastructure is already Cloud Run-compatible.

### 7. Graceful Shutdown Enhancement (Node.js)

The existing SIGTERM handler at `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` (lines 554-560) only shuts down workers and the audit logger. Enhance it to perform a complete graceful shutdown:

```typescript
process.on("SIGTERM", async () => {
  console.log("[Shutdown] SIGTERM received, starting graceful shutdown...");

  // 1. Stop accepting new connections
  server.close(() => {
    console.log("[Shutdown] HTTP server closed");
  });

  // 2. Flush audit logs
  await auditLogger.shutdown().catch(() => {});

  // 3. Shut down background workers
  await shutdownGDriveCleanupWorker().catch(() => {});
  await shutdownTrashPurgeWorker().catch(() => {});
  await shutdownTelegramWorker().catch(() => {});

  // 4. Flush PostHog event batch (if initialized)
  // posthog.shutdown() -- added in Section 14

  // 5. Flush Sentry events (if initialized)
  // Sentry.close(2000) -- added in Section 13

  // 6. Close Redis connections
  // Disconnect all IORedis clients

  // 7. Close DB connection pool
  // pool.end() or drizzle connection cleanup

  console.log("[Shutdown] Graceful shutdown complete");
  process.exit(0);
});
```

Steps 4-7 have placeholder comments because the PostHog SDK (Section 14), Sentry SDK (Section 13), and Redis client refactoring (Section 10) are implemented in their respective sections. The shutdown handler should be structured now so those sections can add their cleanup calls.

Set Cloud Run `--termination-grace-period=30` at deploy time (Section 17 CI/CD handles this).

### 8. Graceful Shutdown Enhancement (Python)

The existing lifespan manager in `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` (lines 147-171) already handles:
- Checkpointer cleanup
- Redis connection close
- Database connection close

FastAPI/uvicorn automatically handles request draining on SIGTERM. The lifespan `yield` point is where shutdown begins, and the cleanup code after `yield` runs during shutdown.

Add placeholders for PostHog and Sentry flush (to be filled by their respective sections):

```python
# In the lifespan function, after yield:

# Flush PostHog events (Section 14)
# try:
#     posthog.shutdown()
# except Exception:
#     pass

# Flush Sentry events (Section 13)
# try:
#     sentry_sdk.flush(timeout=2.0)
# except Exception:
#     pass
```

### 9. Build Script (`scripts/docker-build.sh`)

Create a convenience script for building all three images locally or in CI:

```bash
#!/usr/bin/env bash
# Build all Docker images for Cloud Run deployment.
# Usage: ./scripts/docker-build.sh [--push] [--tag TAG]
#
# Options:
#   --push    Push to Artifact Registry after building
#   --tag     Image tag (default: latest)

set -euo pipefail

TAG="${TAG:-latest}"
REGISTRY="${GCP_ARTIFACT_REGISTRY:-}"
PUSH=false

# Parse arguments...

# Build node-api
docker build \
  -f docker/Dockerfile.node-api \
  --target runner \
  -t "node-api:${TAG}" \
  .

# Build python-orchestrator
docker build \
  -f docker/Dockerfile.python-orchestrator \
  -t "python-orchestrator:${TAG}" \
  python-backend/

# Build video-job-runner (depends on python-orchestrator)
docker build \
  -f docker/Dockerfile.video-job-runner \
  --build-arg "BASE_IMAGE=python-orchestrator:${TAG}" \
  -t "video-job-runner:${TAG}" \
  python-backend/

# Optionally push to Artifact Registry
if [ "$PUSH" = true ] && [ -n "$REGISTRY" ]; then
  for img in node-api python-orchestrator video-job-runner; do
    docker tag "${img}:${TAG}" "${REGISTRY}/${img}:${TAG}"
    docker push "${REGISTRY}/${img}:${TAG}"
  done
fi
```

### 10. Local Cloud Run Dev Compose (`docker-compose.cloud-run-dev.yml`)

Create `/home/dev/projects/SmartSpecPro/docker-compose.cloud-run-dev.yml` to allow developers to test the containerized services locally before deploying. This is separate from the existing `docker-compose.dev.yml`.

```yaml
# docker-compose.cloud-run-dev.yml
# Mirrors the Cloud Run production setup locally.
# Usage: docker compose -f docker-compose.cloud-run-dev.yml up
#
# Prerequisites: infrastructure services running via docker-compose.infra.yml

services:
  node-api:
    build:
      context: .
      dockerfile: docker/Dockerfile.node-api
      target: runner
    ports:
      - "3000:3000"
    env_file:
      - apps/web/.env
    environment:
      - NODE_ENV=production
      - PORT=3000
    depends_on:
      python-orchestrator:
        condition: service_healthy
    networks:
      - smartspec-network

  python-orchestrator:
    build:
      context: python-backend
      dockerfile: ../docker/Dockerfile.python-orchestrator
    ports:
      - "8000:8000"
    env_file:
      - python-backend/.env
    environment:
      - ENVIRONMENT=development
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      start_period: 30s
      retries: 3
    networks:
      - smartspec-network

networks:
  smartspec-network:
    external: true
```

---

## Image Size Targets

Keep final images lean for fast Cloud Run cold starts:

| Image | Target Size | Key Strategies |
|-------|-------------|----------------|
| node-api | < 300 MB | Multi-stage, production deps only, Alpine base |
| python-orchestrator | < 500 MB | Multi-stage, no FFmpeg, slim base |
| video-job-runner | < 800 MB | FFmpeg + fonts add ~300 MB to orchestrator base |

Measure actual sizes after build with `docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"` and optimize if significantly over target.

---

## Cloud Run Configuration (Reference)

These settings are applied at deploy time (Section 17 CI/CD) but documented here for Dockerfile awareness:

**node-api (Cloud Run Service):**
- `--port 3000`
- `--startup-probe-http-get-path /healthz`
- `--liveness-probe-http-get-path /healthz`
- `--termination-grace-period 30`
- `--cpu 1 --memory 512Mi`
- `--min-instances 0 --max-instances 5`
- `--concurrency 80`

**python-orchestrator (Cloud Run Service):**
- `--port 8000`
- `--startup-probe-http-get-path /health/live`
- `--liveness-probe-http-get-path /health/live`
- `--termination-grace-period 30`
- `--cpu 1 --memory 1Gi`
- `--min-instances 0 --max-instances 3`
- `--concurrency 40`
- `--timeout 1800` (30 min for Cloud Tasks media processing handlers)

**video-job-runner (Cloud Run Job):**
- No port, no probes (runs to completion)
- Short: `--cpu 2 --memory 8Gi`
- Long: `--cpu 4 --memory 16Gi`
- `--max-retries 2`
- `--task-timeout 3600` (1 hour max)

---

## Verification Checklist

After implementation, verify:

1. All three images build successfully from the repository root
2. `node-api` starts and `GET /healthz` returns 200
3. `node-api` `GET /readyz` returns 200 when DB and Redis are available
4. `python-orchestrator` starts and `GET /health` returns 200
5. `python-orchestrator` `GET /health/ready` returns 200 when DB is available
6. `video-job-runner` has `ffmpeg` available and fonts installed (`fc-list`)
7. SIGTERM causes both services to shut down gracefully (exit 0, no connection leaks)
8. `docker-compose.cloud-run-dev.yml` brings up both services and they can communicate
9. Image sizes are within targets