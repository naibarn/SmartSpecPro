# Orchestra Decisions Log

## 2026-03-25T06:55:00Z — Security Gate Findings Applied
Risk: MEDIUM/LOW
Mode: smart_auto

### M01 MEDIUM — FIXED
`getChecks.since`: changed `z.string().optional()` → `z.string().datetime().optional()`
File: apps/web/server/routers/monitoring.ts:119

### M02 LOW — FIXED  
`getAlerts.severity`: changed `z.string().optional()` → `z.enum(["info","warning","error","critical"]).optional()`
Files: apps/web/server/routers/monitoring.ts:134, apps/web/client/src/pages/AdminMonitoring.tsx:366

### M03 LOW — FIXED
`details` payload: added `.refine(v => JSON.stringify(v).length <= 32_768)` size guard
File: apps/web/server/routes/internalMetrics.ts:34

### M04 LOW — ACCEPTED BY DESIGN
`getRunEvents`/`captureSnapshot`/`checkStuck` remain on `protectedProcedure` (not adminProcedure).
Reason: These are pre-existing procedures for users viewing their own agent run data.
The 5 new system-monitoring procedures are correctly on adminProcedure.

### M05 LOW — FIXED
Added in-process rate limiter: max 10 req/min on /api/internal/metrics/push.
Verified: req 11+ returns 429.
File: apps/web/server/routes/internalMetrics.ts
