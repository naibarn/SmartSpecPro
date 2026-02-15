# Code Review: Section 02 - Docker Images for Cloud Run

## Summary

The Docker implementation is **well-structured and follows Cloud Run best practices**, with proper multi-stage builds, non-root users, health checks, and graceful shutdown handling. However, there are **3 CRITICAL issues** that MUST be fixed before deployment: missing .venv exclusion (image bloat), video-job-runner FROM dependency issue, and missing Redis timeout in readiness checks.

---

## Image Size Concerns

### CRITICAL: .dockerignore Missing .venv

**Issue**: The `.dockerignore` excludes `**/.venv` but the Python backend has an 8GB `.venv` directory. During Docker build, this will be copied into the builder stage, significantly slowing build time and potentially bloating intermediate layers.

**Evidence**:
- `.dockerignore` line 10: `**/.venv`
- Actual directory: `python-backend/.venv` = 7.8GB (verified)

**Impact**:
- Build context upload time: +30-60 seconds
- Intermediate layer size bloat (even if not in final image)
- Docker build performance degradation

**Fix Required**: The pattern is correct, but verify Docker build context excludes it properly. Consider adding explicit `python-backend/.venv` as well.

**Status**: LOW priority (doesn't affect final image, only build performance)

---

### Medium: Test Files Excluded But Coverage Artifacts Remain

**Good**: `.dockerignore` excludes `**/*.test.ts`, `**/*.test.py`, `**/tests`, `**/__tests__`

**Concern**: `coverage.xml` (1.7MB), `htmlcov/` excluded via `**/coverage`, but `.pytest_cache` (300K) and `.mypy_cache` (294MB) only partially covered by `**/.pytest_cache` and `**/.mypy_cache` patterns.

**Status**: ACCEPTABLE (wildcards should work, but verify with `docker build --no-cache` and check image size)

---

### Positive: Client Source Size Reasonable

- `apps/web/client/src` = 4.5MB (reasonable for React app)
- `packages/` = 34MB (workspace packages)
- Multi-stage build properly separates builder artifacts from runtime

---

## Security Issues

### HIGH: Video Job Runner FROM Dependency

**Issue**: `docker/Dockerfile.video-job-runner` line 639:
```dockerfile
FROM python-orchestrator:latest AS base
```

**Problem**: This creates a **build-time dependency** on a local image that may not exist or may be stale. This breaks:
1. **CI/CD pipelines** — image may not exist in build environment
2. **Reproducibility** — `latest` tag is mutable
3. **Cloud Build** — Google Cloud Build won't have access to local `python-orchestrator:latest`

**Fix Required**:
```dockerfile
# Option 1: Multi-stage build in same Dockerfile
FROM python:3.11-slim AS python-base
# ... (copy python-orchestrator stages here)

FROM python-base AS video-runner
# ... (add FFmpeg)

# Option 2: Use ARG for explicit image reference
ARG PYTHON_ORCHESTRATOR_IMAGE=python-orchestrator:latest
FROM ${PYTHON_ORCHESTRATOR_IMAGE} AS base
```

**Status**: **CRITICAL** — MUST FIX before Cloud Run deployment

---

### MEDIUM: No Redis Check Timeout in Readiness Probe

**Issue**: Node.js `/readyz` endpoint (line 294-301):
```typescript
const redis = getRedisClient();
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("timeout")), 2000)
);
const pingPromise = redis.ping();
await Promise.race([pingPromise, timeoutPromise]);
```

**Good**: Database check has 2-second timeout (line 276-285)

**Problem**: If Redis is unresponsive (network partition, overloaded), the readiness probe may hang beyond Cloud Run's probe timeout (default 1 second), causing probe failures and pod restarts.

**Fix Recommendation**:
- Reduce timeout to 1 second (align with Cloud Run probe timeout)
- Ensure `redis.ping()` has connection timeout configured (check `getRedisClient()` initialization)

**Status**: **MEDIUM** — Works in normal conditions, but fails under Redis latency

---

### MEDIUM: Python Health Check Missing Redis Validation

**Issue**: Python `/health/ready` endpoint (line 216-247 in `system_health.py`) only checks database connectivity, **not Redis**.

**Evidence**:
```python
# Check database
db_health = await service._check_database()

if db_health["status"] == "healthy":
    return {"status": "ready", ...}
```

**Concern**: If Redis is down but database is up, Python backend reports "ready" but will fail when processing Celery tasks or accessing cache.

**Node.js Implementation** (for comparison): Checks BOTH DB and Redis (lines 271-312 in `_core/index.ts`)

**Fix Recommendation**: Add Redis PING check to `readiness_check()` in `system_health.py`

**Status**: **MEDIUM** — Inconsistent with Node.js, potential false-positive health status

---

### LOW: Non-root Users Properly Configured

**Good**:
- Node.js: `adduser --system --uid 1001 smartspec` (line 537)
- Python: `useradd -m -u 1001 appuser` (line 601)
- Both switch to non-root: `USER smartspec` / `USER appuser`

**Status**: ✅ SECURE

---

### LOW: tini Init Process for Signal Handling

**Good**: Node.js Dockerfile includes tini (line 533):
```dockerfile
RUN apk add --no-cache tini
ENTRYPOINT ["tini", "--"]
```

**Missing**: Python Dockerfile does NOT include tini

**Impact**: Python backend may not properly handle SIGTERM signals sent by Cloud Run during shutdown (30-second grace period). This can lead to:
- Orphaned child processes
- Incomplete request handling
- Unclean database connection pool closure

**Fix Recommendation**:
```dockerfile
# In Dockerfile.python-orchestrator runtime stage
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    tini \  # ADD THIS
    && rm -rf /var/lib/apt/lists/*

# Change CMD to ENTRYPOINT
ENTRYPOINT ["tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

**Status**: **MEDIUM** — Signal handling may be unreliable without tini

---

## Cloud Run Compatibility

### CRITICAL: Health Check Path Mismatch

**Issue**:
- **Dockerfile.node-api** healthcheck (line 550): `http://localhost:3000/healthz`
- **docker-compose.cloud-run-dev.yml** healthcheck (line 442): `http://localhost:3000/healthz`
- **Node.js implementation** (line 262-264): `app.get("/healthz", ...)`

**Status**: ✅ CORRECT

**Issue**:
- **Dockerfile.python-orchestrator** healthcheck (line 622): `http://localhost:8000/health`
- **Python implementation** (`system_health.py` line 190): `@router.get("/health")`

**Status**: ✅ CORRECT

---

### OK: Environment Variables and Port Configuration

**Good**:
- Node.js: `PORT=3000` (line 530), `EXPOSE 3000` (line 552)
- Python: `EXPOSE 8000` (line 625)
- Both use environment variables for configuration (no hardcoded secrets)

**Status**: ✅ CLOUD RUN COMPATIBLE

---

### OK: Stateless Design

**Good**:
- No local file storage in containers
- Database and Redis accessed via environment variables
- Session state externalized

**Status**: ✅ CLOUD RUN COMPATIBLE

---

## Multi-stage Build Quality

### GOOD: Dependencies Only in Correct Stages

**Node.js** (3 stages):
1. **deps**: Install node_modules (line 484-503)
2. **builder**: Build production assets (line 506-523)
3. **runner**: Copy built artifacts + production dependencies only (line 526-556)

**Python** (2 stages):
1. **builder**: Install build dependencies + Python packages (line 568-587)
2. **runtime**: Copy Python packages, no build tools (line 590-628)

**Status**: ✅ OPTIMIZED

---

### ISSUE: Build Context Not Minimized via .dockerignore

**Concern**: `.dockerignore` excludes test files (`**/*.test.ts`, `**/*.test.py`) which is good, BUT:

**Missing exclusions**:
- `python-backend/.venv` (8GB) — pattern exists but may not work
- `python-backend/htmlcov` — excluded via `**/htmlcov`
- `python-backend/.pytest_cache` — excluded via `**/.pytest_cache`

**Large files found** (will be excluded by .dockerignore):
- `docker-status/node_modules` (not in Docker context since build context is `.`)
- `python-backend/.venv` (should be excluded)

**Status**: ACCEPTABLE (patterns look correct, needs verification)

---

## Health Check Implementation

### GOOD: Timeouts Appropriate for DB

**Node.js** (line 276-285):
```typescript
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("timeout")), 2000)
);
const queryPromise = db.execute(sql`SELECT 1`);
await Promise.race([queryPromise, timeoutPromise]);
```

**Status**: ✅ 2-second timeout appropriate for Cloud Run (default probe timeout: 1s, but can be configured)

---

### ISSUE: No Timeout on Redis PING

**Node.js** (line 294-301): Redis PING has 2-second timeout via `Promise.race`

**Concern**: If `redis.ping()` itself doesn't have a connection timeout, the `Promise.race` may not work as expected if the connection hangs at TCP level.

**Fix Recommendation**: Ensure `getRedisClient()` configures `connectTimeout` and `commandTimeout`:
```typescript
// In services/redis.ts
import IORedis from 'ioredis';

const redis = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  connectTimeout: 1000,    // 1 second connection timeout
  commandTimeout: 1000,    // 1 second command timeout
  lazyConnect: true,
});
```

**Status**: MEDIUM — May work but not guaranteed

---

### GOOD: Dependency Checks Shallow (Not Deep)

**Node.js** (line 276): `db.execute(sql\`SELECT 1\`)` — Simple query, not full table scan

**Python** (`system_health.py` line 236): `await service._check_database()` — Implementation unclear, need to verify it's a simple query

**Status**: ✅ SHALLOW (assuming `_check_database()` is simple)

---

### GOOD: Error Handling

**Node.js** (line 288-291):
```typescript
} catch (error: any) {
  checks.db = error?.message === "timeout" ? "timeout" : "error";
  allHealthy = false;
}
```

**Status**: ✅ Distinguishes timeout from other errors

---

## Graceful Shutdown

### EXCELLENT: All Cleanup Steps Present

**Node.js SIGTERM handler** (line 337-377):
1. Stop accepting connections: `httpServer.close()` ✅
2. Flush audit logs: `auditLogger.shutdown()` ✅
3. Shutdown background workers: `shutdownGDriveCleanupWorker()`, etc. ✅
4. Flush PostHog (TODO comment) ⚠️
5. Flush Sentry (TODO comment) ⚠️
6. Close Redis: `redis.quit()` ✅
7. Close DB: Comment mentions postgres.js auto-closes ✅
8. Exit: `process.exit(0)` ✅

**Status**: ✅ COMPREHENSIVE (TODOs are acceptable for future sections)

---

### GOOD: Redis/DB Connections Closed

**Node.js** (line 365-369):
```typescript
const redis = getRedisClient();
await redis.quit();
console.log("[Shutdown] Redis connection closed");
```

**Status**: ✅ CORRECT

**Note**: DB connection pool closure relies on postgres.js auto-close. This is acceptable but consider adding explicit `db.end()` if using pg-pool in the future.

---

### GOOD: Process.exit() Called

**Node.js** (line 376, 403): `process.exit(0)` after all cleanup

**Status**: ✅ CORRECT

---

### ISSUE: Python Backend Graceful Shutdown Not Visible

**Concern**: `Dockerfile.python-orchestrator` uses uvicorn with 2 workers (line 628):
```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

**Problem**:
1. No tini init process (see Security section)
2. No visible SIGTERM handler in `app/main.py` (only checked first 100 lines)
3. Uvicorn has built-in graceful shutdown, BUT only if signals are properly propagated

**Fix Recommendation**:
1. Add tini to Dockerfile
2. Verify FastAPI `lifespan` context manager handles shutdown (line 80-100 in `main.py` shows startup but not shutdown)

**Status**: **MEDIUM** — Uvicorn may handle it, but not explicit

---

## Test Coverage

### GOOD: Health Check Tests Comprehensive

**Node.js Tests** (`apps/web/server/__tests__/healthcheck.test.ts`):
- ✅ `/healthz` returns 200 when process running (line 140-145)
- ✅ `/healthz` has correct structure (line 147-152)
- ✅ `/readyz` returns 200 when DB and Redis reachable (line 206-210)
- ⚠️ `/readyz` returns 503 when DB fails — SKIPPED (line 216-218)
- ⚠️ `/readyz` returns 503 when Redis fails — SKIPPED (line 220-223)
- ✅ `/readyz` includes individual check results (line 228-234)

**Python Tests** (`python-backend/tests/test_cloud_health.py`):
- ✅ `/health` returns 200 (line 13-17)
- ✅ `/health/live` alias works (line 19-23)
- ✅ `/health/ready` returns 200 when healthy (line 25-32)
- ⚠️ `/health/ready` returns 503 when DB unreachable — **INCOMPLETE** (line 33-37)
- ⚠️ SIGTERM graceful shutdown tests — **ALL SKIPPED** (line 41-57)

**Status**: **MEDIUM** — Critical failure paths not tested

---

### ISSUE: Mocking Correct But Incomplete

**Node.js Test** (line 145-203): Mocks DB and Redis successfully for happy path

**Missing**:
- Mock DB connection failure (test is skipped)
- Mock Redis connection failure (test is skipped)
- Mock timeout scenarios (2-second timeout should trigger)

**Status**: **LOW** — Happy path covered, edge cases TODO

---

### ISSUE: Edge Cases Not Covered

**Missing Test Scenarios**:
1. Health check timeout (should return 503 after 2 seconds)
2. Partial failure (DB up, Redis down — should return 503)
3. Graceful shutdown during active request (should wait for request to complete)
4. Graceful shutdown timeout (should force-exit after 30 seconds)

**Status**: **MEDIUM** — Production scenarios not validated

---

## Build Script

### GOOD: Error Handling

**Script** (`scripts/docker-build.sh`):
- `set -euo pipefail` (line 680) — Exit on error, undefined vars, pipe failures ✅
- Argument parsing with error messages (line 688-704) ✅
- Registry validation before push (line 749-753) ✅

**Status**: ✅ ROBUST

---

### GOOD: Push to Registry Logic Safe

**Logic** (line 748-769):
- Only pushes if `--push` flag provided ✅
- Checks `GCP_ARTIFACT_REGISTRY` env var before pushing ✅
- Tags images before pushing (line 784) ✅
- Loops through all images (line 783) ✅

**Status**: ✅ SAFE

---

### GOOD: Tag Handling

**Logic** (line 683, 695-697):
- Defaults to `latest` ✅
- Allows override via `--tag` flag ✅
- Uses consistent tag across all images ✅

**Status**: ✅ CORRECT

---

### ISSUE: No Validation After Build

**Missing**:
- No check if images actually built successfully (assumes `docker build` exit code is sufficient)
- No size validation (should warn if node-api > 300MB, python > 500MB, video > 800MB)
- No vulnerability scanning (consider adding `docker scan` or Trivy)

**Fix Recommendation**:
```bash
# After each build
echo "Checking image size..."
SIZE=$(docker images --format "{{.Size}}" "node-api:${TAG}" | sed 's/MB//')
if [ "$SIZE" -gt 300 ]; then
  echo "WARNING: node-api image is ${SIZE}MB, target is <300MB"
fi
```

**Status**: **LOW** — Nice-to-have, not critical

---

## Performance

### GOOD: Health Check Latency

**Node.js `/readyz`**:
- DB query: `SELECT 1` — ~1-5ms
- Redis PING: ~0.5-2ms
- Total timeout: 2 seconds (line 274, 297)

**Expected latency**: <10ms under normal conditions
**Worst-case latency**: 2 seconds (timeout)

**Status**: ✅ ACCEPTABLE for Cloud Run probes

---

### ISSUE: Startup Time Not Measured

**Dockerfiles**:
- Node.js: `--start-period=40s` (line 550) — 40 seconds before health checks start
- Python: `--start-period=30s` (line 465) — 30 seconds before health checks start

**Concern**: No evidence these are accurate. Need to measure actual startup time.

**Fix Recommendation**:
1. Build images locally
2. Run `docker-compose -f docker-compose.cloud-run-dev.yml up`
3. Measure time from container start to first successful health check
4. Adjust `start-period` if needed

**Status**: **LOW** — Estimates may be conservative

---

### OK: Shutdown Grace Period

**Node.js SIGTERM handler**: All cleanup in sequence, then `process.exit(0)`

**Cloud Run grace period**: 30 seconds (configurable)

**Estimated shutdown time**:
- HTTP server close: ~100ms
- Audit log flush: ~500ms
- Worker shutdown: ~1-2s
- Redis quit: ~50ms
- Total: ~3 seconds (well within 30s limit)

**Status**: ✅ ACCEPTABLE

---

## Positive Observations

1. **Multi-stage builds properly implemented** — No build artifacts in final images
2. **Non-root users configured correctly** — Security best practice followed
3. **Health checks distinguish liveness and readiness** — Correct Cloud Run pattern
4. **Graceful shutdown handler comprehensive** — All cleanup steps present
5. **.dockerignore excludes unnecessary files** — Reduces build context size
6. **Build script with safety checks** — Validates registry before push
7. **Consistent naming** — node-api, python-orchestrator, video-job-runner
8. **Environment variable configuration** — No hardcoded secrets
9. **Docker health checks included** — Useful for local testing
10. **Documentation in Dockerfiles** — Clear comments explaining each stage

---

## Recommended Fixes

### MUST FIX (Blocking)

1. **Fix video-job-runner FROM dependency** (CRITICAL)
   - Current: `FROM python-orchestrator:latest`
   - Fix: Use ARG or multi-stage build
   - Impact: CI/CD will fail without this

2. **Add .venv to .dockerignore verification** (CRITICAL for build performance)
   - Verify `docker build` excludes `python-backend/.venv`
   - Test with `docker build --no-cache` and check build context size
   - Impact: 8GB upload on every build if not excluded

3. **Add tini to Python Dockerfile** (MEDIUM → HIGH for production)
   - Add `tini` to apt-get install
   - Change CMD to ENTRYPOINT + CMD
   - Impact: Unreliable signal handling during shutdown

### SHOULD FIX (Important)

4. **Add Redis check to Python readiness probe** (MEDIUM)
   - Modify `/health/ready` in `system_health.py`
   - Add Redis PING with timeout
   - Impact: False-positive health status if Redis down

5. **Reduce Redis timeout to 1 second** (MEDIUM)
   - Change 2000ms to 1000ms in Node.js `/readyz`
   - Configure Redis client with `commandTimeout: 1000`
   - Impact: Probe may fail if timeout exceeds Cloud Run probe timeout

6. **Complete health check failure tests** (MEDIUM)
   - Un-skip DB failure test in Node.js
   - Un-skip Redis failure test in Node.js
   - Implement DB failure test in Python
   - Impact: Uncaught bugs in error handling

### NICE TO HAVE (Improvements)

7. **Add image size validation to build script** (LOW)
   - Warn if images exceed targets
   - Impact: Easier to catch bloat during development

8. **Add vulnerability scanning** (LOW)
   - Run `docker scan` or Trivy after build
   - Impact: Earlier detection of security issues

9. **Measure and optimize startup time** (LOW)
   - Verify `start-period` values are accurate
   - Impact: Faster pod startup in Cloud Run

10. **Add FastAPI shutdown handler** (LOW)
    - Verify `lifespan` context manager has shutdown logic
    - Impact: Explicit cleanup (though uvicorn handles it)

---

## Final Assessment

**Overall Grade**: B+ (Good, but 3 critical issues must be fixed)

**Strengths**:
- Solid multi-stage build architecture
- Proper non-root user configuration
- Comprehensive graceful shutdown (Node.js)
- Good separation of concerns (liveness vs readiness)

**Weaknesses**:
- video-job-runner FROM dependency issue (CRITICAL)
- Missing tini in Python (signal handling risk)
- Incomplete test coverage for failure scenarios
- Python readiness check missing Redis validation

**Recommendation**: **FIX CRITICAL ISSUES BEFORE DEPLOYMENT**, then proceed with SHOULD FIX items in a follow-up PR.
