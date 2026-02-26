# Section 05 Code Review: Node.js Sandbox Router and Services

## Critical Issues

### 1. Credits Deducted Before Dispatch -- No Rollback on Dispatch Failure (HIGH - Financial)
Credits are reserved BEFORE `dispatchToSandbox` call. If dispatch throws (Python backend down, network error), credits are deducted but never refunded. No try/catch around dispatch for rollback.

### 2. No Authentication on Internal Python Backend Calls (HIGH - Security)
Cancel endpoint and dispatch both send requests to Python backend without any auth header. Internal service-to-service calls should include shared secret.

### 3. Inconsistent Backend URL Resolution (MEDIUM)
`cancelJob` uses `process.env.PYTHON_BACKEND_URL` directly, while `dispatchService` uses `ENV.pythonBackendUrl`. Should be consistent.

### 4. `checkTenantPolicy` Fetches ALL Active Rows Instead of COUNT (MEDIUM - Performance)
Fetches all active job rows into memory instead of using COUNT query.

### 5. Admin Artifact Bypass Uses Wrong Tenant Context (MEDIUM)
Admin querying job from different tenant: `getJobArtifactUrls` uses `ctx.tenantId` (admin's) not `job.tenantId`.

### 6. `jobId` Used in Credit Reservation Is Not the Real Job ID (MEDIUM - Data Integrity)
Credit reservation uses `idempotencyKey` or synthetic `pre-${Date.now()}` instead of actual job ID from dispatch result.

### 7. `cancelJob` Does Not Check Python Backend Response (MEDIUM)
Cancel request fire-and-forgets without checking response.ok. Refunds credits even if cancel actually failed.

### 8. TOCTOU Race on `hasEnoughCredits` (LOW)
`deductCredits` already uses atomic SQL. The `hasEnoughCredits` pre-check is redundant.

### 9. No Timeout on Python Backend HTTP Calls (MEDIUM - Reliability)
No AbortController timeout on fetch calls. Hung Python backend = hung tRPC handler.

## Test Coverage Gaps

### 10. Router Tests Superficial
Only 1 test checking procedure names exist. No behavioral tests for handlers.

### 11. `getJobArtifactUrls` Untested
No tests for the multi-artifact function.

### 12. `maxDailyRuntimeSeconds` Not Implemented
Plan specifies checking both limits but only concurrent limit is implemented.
