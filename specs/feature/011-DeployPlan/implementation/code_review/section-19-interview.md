# Section 19 Code Review Interview

## Auto-fixes (applied without asking)

1. **Fix cookie name**: `SMARTSPEC_SESSIONID` → `app_session_id` (verified in shared/const.ts)
2. **Fix tRPC paths**: `/api/auth/login` → `/trpc/login`, `/api/trpc/jobs.create` → `/trpc/mediaJobs.submitJob`, etc.
3. **Fix tRPC wire format**: Body must be `{"json": {...}}` for tRPC v11
4. **Add Origin header**: Required by CSRF middleware for all POST requests to /trpc
5. **Replace `dashboard.getStats`**: Use `me` query (verified exists as publicProcedure)
6. **Fix setup script**: `/api/auth/signup` → `/trpc/register` with tRPC body format
7. **Add `set -e` to monitor-db-connections.sh**
8. **Add smoke test step to GHA workflow**
9. **Fix Scenario 3 GHA condition**: Include in 'all' runs (with note about 60min duration)

## User decisions

### Rate limiting strategy
**Decision**: Pre-authenticate in k6 `setup()`, share session cookies across VUs
- Login all test users once during setup phase (sequential, before timer starts)
- Pass array of session cookies to VU default function
- Each VU picks its session from the array by VU number
- This avoids 5 req/min login rate limit during actual test

### Cleanup FK tables
**Decision**: Add all FK-referencing tables without ON DELETE CASCADE
- Tables to add: `provider_usage_log`, `workflow_executions`
- Tables to SET NULL: `api_audit_events`, `registration_events` (nullable userId)
- Tables with ON DELETE CASCADE are auto-handled when users are deleted
