# Spec 046 — Virtual Admin Agent: Codebase Research

## Key Findings

### 1. Queue Health Monitor Pattern (reusable)
- **File:** `apps/web/server/services/queueHealthMonitor.ts`
- 60s interval via `setInterval`, in-memory state, auditLogger JSONL
- `QueueAlert` type: severity (warning/critical), type (backlog/growth/dead_consumer/spike)
- `QueueHealthStatus`: healthy flag, per-queue status, activeAlerts array, 60-check history
- **Reuse:** Wrap as sensor, add threshold evaluation → incidents

### 2. Notification Service (ready to use)
- **File:** `apps/web/server/services/notificationService.ts`
- `createNotification({ db, userId, type, title, content, priority })`
- Types: `alert`, `system`, `urgent_message` — all usable for guardian
- Priorities: `low`, `normal`, `high`, `critical`
- Fire-and-forget pattern: DB insert + async Telegram enqueue

### 3. Email Service
- **File:** `apps/web/server/services/emailService.ts`
- Reads SMTP config from `systemSettings` (category: "smtp", encrypted)
- Cache TTL: 60s
- Falls back to console if SMTP not configured

### 4. SSE Pattern (proven in production)
- **File:** `apps/web/server/routes/publicEventsApi.ts` + `routers/mediaJobs.ts`
- Redis pub/sub → SSE stream
- Heartbeat every 30s, max 60min connection
- Cleanup on disconnect (`req.on("close", cleanup)`)
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`

### 5. Background Job Pattern
- **File:** `apps/web/server/jobs/pendingApprovalAlert.ts`
- Pattern: `setTimeout` for initial delay → `setInterval` for repeat
- Graceful shutdown: `clearTimeout` + `clearInterval` on SIGTERM
- Registered in `server/_core/index.ts` startup sequence

### 6. Approval System UI
- **File:** `apps/web/client/src/pages/AdminApprovals.tsx`
- Tabbed interface (All, Skills, Agencies, Templates)
- 30s refresh, approve/reject mutations with reason dialog
- tRPC: `adminOps.pendingApprovalCounts`, `adminOps.pendingApprovalList`

### 7. tRPC Procedure Types
- **File:** `apps/web/server/_core/trpc.ts`
- `protectedProcedure` — requires authenticated user
- `adminProcedure` — requires role = admin
- `domainAdminProcedure` — requires role = admin or domain_admin
- Rate limiting: `createRateLimitMiddleware({ namespace, limit, windowMs })`

### 8. Database Enum Pattern
```typescript
export const notificationTypeEnum = pgEnum("notification_type",
  ["scheduled_message", "follow_request", "alert", "system", "direct_message", "urgent_message"]
);
export const reminderPriorityEnum = pgEnum("reminder_priority",
  ["low", "normal", "high", "critical"]
);
```

### 9. Server Startup Sequence
- **File:** `apps/web/server/_core/index.ts`
- Services initialized sequentially: skillRegistry → trashPurge → pendingApprovalAlert
- Queue monitor: async fire-and-forget via dynamic import
- SIGTERM handler: calls shutdown functions for all registered jobs

### 10. Admin Dashboard Existing Metrics
- **File:** `apps/web/server/routers/adminOps.ts`
- `trafficStats`, `apiHealth`, `jobsHealth`, `storageStats`, `securityStats`
- `pendingApprovalCounts`, `pendingApprovalList`
- Pattern: `domainAdminProcedure` for cross-tenant, `adminProcedure` for tenant-scoped

### 11. Testing Pattern (Vitest)
```typescript
import { describe, expect, it } from "vitest";
const caller = appRouter.createCaller(mockCtx);
const result = await caller.routerName.procedureName(input);
expect(result).toEqual(expected);
```

### 12. Audit Logger Usage
```typescript
auditLogger.log({
  traceId: `queue-health:${alert.queue}:${now.getTime()}`,
  eventType: "queue_health_alert",
  userId: 0,  // system
  requestPayload: { ... },
  responsePayload: { ... },
});
```

## Architecture Recommendations

### Guardian Service Registration
```typescript
// In server/_core/index.ts startup:
import("../services/virtualAdmin/scheduler").then(({ startGuardian }) => {
  startGuardian();
});

// SIGTERM:
process.on('SIGTERM', () => { stopGuardian(); });
```

### Real-time via Redis Pub/Sub + SSE
- Publish: `redis.publish("guardian:events", JSON.stringify(event))`
- Subscribe: SSE endpoint at `/api/virtual-admin/events`
- Reuse `publicEventsApi.ts` pattern with heartbeat + cleanup

### Notification Channel Selection
- Use existing `createNotification()` for in-app
- Use `emailService` for email alerts
- Use `builtin-slack-message` agency tool for Slack
- Telegram via `notification.ts` core module
