# Section 19 Code Review

## Critical Issues

1. **WRONG API ENDPOINTS** - All k6 scripts use REST-style paths (`/api/auth/login`, `/api/trpc/jobs.create`) but the app uses tRPC at `/trpc/`. Login is `/trpc/login`, job creation is `/trpc/mediaJobs.submitJob`, etc.
2. **WRONG SESSION COOKIE NAME** - Scripts use `SMARTSPEC_SESSIONID` but actual cookie is `app_session_id`
3. **MISSING CSRF HEADERS** - Server checks Origin header on POST requests; k6 scripts don't set it
4. **TRPC WIRE FORMAT** - tRPC v11 uses `{"0":{"json":{...}}}` body format, not plain JSON

## High Issues

5. Rate limiting (5 req/min login, 3 req/min signup per IP) will block most VU logins
6. Cleanup script misses FK tables beyond sessions/jobs/credit_transactions
7. Test passwords hardcoded in committed shell script

## Medium Issues

8. Login per iteration is wasteful - should use k6 setup() lifecycle
9. Scenario 3 excluded from 'all' in GHA (intentional for 60-min duration)
10. Metrics files write to cwd, not load-tests/ directory
11. No smoke test step in GHA workflow
12. monitor-db-connections.sh missing `set -e`

## Good Improvements Over Plan

- Scenario selector in GHA workflow
- Better error handling in k6 (null checks, try/catch)
- Added custom metrics (jobs_queued, job_submit_duration)
- mktemp + trap for temp file cleanup
- Transaction-wrapped cleanup SQL
