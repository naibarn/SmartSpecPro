# Section 15 Code Review Interview

## Auto-fixes Applied

### Fix 1: Alert endpoint authentication (CRITICAL #1)
- **Decision:** Add internal token check (X-Proxy-Token)
- **Source:** User chose "Add internal token check"
- **Applied:** Added `_verify_internal_token()` function that checks `X-Proxy-Token` header against `SMARTSPEC_PROXY_TOKEN` setting. Returns 403 if invalid.

### Fix 2: SQL column name mismatch (CRITICAL #2)
- **Decision:** Auto-fix (obvious bug)
- **Applied:** Changed `"createdAt"` to `"created_at"` in `media_callback_events` raw SQL query. The table uses snake_case column names per Drizzle schema.

### Fix 3: Use domainAdminProcedure (CRITICAL #3)
- **Decision:** Auto-fix (plan requirement)
- **Applied:** Changed all 6 tRPC procedures from `adminProcedure` to `domainAdminProcedure` to allow both `admin` and `domain_admin` roles access.

### Fix 4: Error rate filter 5xx only (IMPORTANT #7)
- **Decision:** Auto-fix (matches plan requirement)
- **Applied:** Changed `FILTER (WHERE "statusCode" >= 400)` to `>= 500` in both summary and per-provider apiHealth queries.

### Fix 5: datetime.utcnow deprecation (IMPORTANT #8)
- **Decision:** Auto-fix (deprecated API)
- **Applied:** Replaced all `datetime.utcnow()` calls with `datetime.now(timezone.utc)`.

## Items Let Go

- #4: Storage pagination cap at 3 pages (acceptable for dashboard, not billing)
- #5: Missing alert thresholds (auth_failure_rate, queue_backlog - can add incrementally)
- #6: Missing indexes (tables already have status/createdAt indexes from earlier sections)
- #9: Missing login success/failure counts (no auth event log table exists yet)
- #10: No route redirect (component-level guard follows existing admin page pattern)
- #11-12: Shallow tests (adequate for router structure validation)
- #13: Redis SCAN bounded at 500 keys (sufficient for current scale)
- #14-16: Column qualification, naming deviations (non-blocking)
- #17-20: Suggestions (dynamic imports, charts, type refinements - future improvements)
