# Section 16 Code Review Interview

## Review Findings Triage

### Auto-fixed (no user input needed)

1. **HIGH: SSRF validation missing** → Added `isSsrfBlocked()` function checking blocked hosts and private IP ranges before `fetch()`. Returns 422 if blocked.

2. **HIGH: Tenant isolation in WHERE clause** → Moved `eq(agencyTools.tenantId, auth.tenantId)` into the DB query WHERE clause, eliminating info-leak timing window.

3. **HIGH: Header decryption failure** → Changed from silent ignore to `return 500 / tool_error` with message "Failed to decrypt tool authentication headers".

4. **MEDIUM: toggleToolExposure role guard** → Changed from `protectedProcedure` to `adminProcedure`. Only admins can expose tools as API endpoints.

5. **MEDIUM: Atomic UPDATE with tenant check** → Merged tenant check into UPDATE WHERE clause with `.returning()` to verify a row was affected. Eliminates TOCTOU race.

6. **LOW: Log Redis failures** → Added `console.warn` on Redis rate-limit failure. Returns conservative remaining=1.

7. **LOW: Error details leak in 502** → Removed `details: responseText.slice(0, 500)` from 502 response.

8. **LOW: Assert api_key mode** → Added `auth.mode !== "api_key"` check at top of both handlers. Only API key auth is valid for standalone tool API.

### Deferred to section-23

- **HIGH: AGENCY_TOOL_API_ENABLED tenant scoping** → Section-23 (Feature Flags Integration) handles registering all feature flags in TenantFeatureFlags and converting global flags to per-tenant. The global `getFeatureFlag()` will be replaced with `getTenantFeatureFlag()` there.

### Let go

- **MEDIUM: _emit_progress_sync fire-and-forget risk** → The `create_task()` approach is acceptable for progress events which are informational/best-effort. Missing a progress update doesn't affect correctness. Making `run_func` fully async would require changes across the agency-swarm adapter interface.

- **MEDIUM: Missing agencyToolExposure.test.ts** → The toggleToolExposure mutation is a simple admin CRUD operation tested through integration. Full tRPC procedure testing requires significant mock setup for the tRPC context. The admin guard is enforced by `adminProcedure` which is thoroughly tested elsewhere.

- **LOW: fal_ai files in diff** → Not staged in our commit; they were from a different branch.

## Tests Added After Review

- `rejects non-api_key auth mode` (execute endpoint)
- `blocks SSRF on tool endpoint URL`
- `returns 500 when header decryption fails`
- `rejects non-api_key auth` (openapi.json endpoint)

Total: 12 Vitest tests, 5 pytest tests.
