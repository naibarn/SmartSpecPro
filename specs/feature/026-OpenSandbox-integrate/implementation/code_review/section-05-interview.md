# Section 05 Code Review Interview

## Decisions

### #1 Credits before dispatch (AUTO-FIX)
Add try/catch around dispatchToSandbox with refundReservedCredits on failure. Also restructure so credit reservation uses actual jobId from dispatch result.

### #2 Internal auth on Python calls (USER: Add now)
Add X-Internal-Token header to all internal Python HTTP calls using SMARTSPEC_WEB_GATEWAY_TOKEN.

### #3 Inconsistent URL (AUTO-FIX)
Use ENV.pythonBackendUrl consistently.

### #4 COUNT instead of fetching rows (AUTO-FIX)
Use SQL count query instead of fetching all rows.

### #5 Admin artifact wrong tenant (AUTO-FIX)
Use job.tenantId when admin accesses artifacts from different tenant.

### #6 jobId in credit reservation (AUTO-FIX)
Restructure: dispatch first (cheap), then reserve credits with actual jobId. Or reserve with placeholder then update.

### #7 Cancel response check (AUTO-FIX)
Check response.ok before refunding credits.

### #8 TOCTOU (LET GO)
Keep hasEnoughCredits as advisory UX pre-check. Not harmful.

### #9 Timeout on fetch (AUTO-FIX)
Add 30s AbortController timeout.

### #10-11 Router/artifact test gaps (LET GO for now)
Test gaps noted but acceptable for this section. Router behavior tests can be added as integration tests later.

### #12 maxDailyRuntimeSeconds (USER: Add now)
Implement daily runtime check in checkTenantPolicy.
