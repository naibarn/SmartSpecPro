# Alert/Notification System — Quick Reference

---

## Problem Statement

User reports: **"Clicking on alerts doesn't give me enough context to investigate."**

**Root Cause**: Notifications carry only `title` + `content`. Frontend uses brittle string matching to infer what action to show. Missing: job IDs, error details, metrics, retry info.

---

## Current Architecture (Quick View)

### Frontend Toast (Transient)
- **Library**: Sonner
- **File**: `apps/web/client/src/components/ui/sonner.tsx`
- **Duration**: Auto-dismiss after 3-5s
- **Storage**: None (not persisted)
- **Usage**: 150+ files
- **Problem**: No history, no structured data

### Frontend Notification Bell
- **File**: `apps/web/client/src/components/GlobalAlerts.tsx` (915 lines)
- **Components**:
  1. `GlobalUrgentAlerts()` — Full-screen modal for urgent messages
  2. `GlobalUrgentReminders()` — Full-screen modal for scheduled reminders
  3. `GlobalNotificationBell()` — Dropdown list (20 items, searchable)
- **Data**: `userNotifications` DB table
- **Polling**: 10s-30s intervals
- **Problem**: Hardcoded string matching for action links (lines 731-827)

### Database Tables
| Table | Purpose | Fields | Problem |
|-------|---------|--------|---------|
| `user_notifications` | In-app alerts | id, userId, type, title, content, priority, isRead | ❌ No metadata, actionUrl, resourceId |
| `scheduled_messages` | Persistent reminders | id, prompt, cronExpression, modelId, status, lastError | ✓ Has lastError, but not exposed in UI |
| `orchestratorNotifications` | Team events | id, tenantId, userId, severity, title, body, actionUrl | ✓ Has actionUrl, but separate from user_notifications |

### Backend Notification Creator
- **File**: `apps/web/server/services/notificationService.ts` (111 lines)
- **Function**: `createNotification(params)`
- **Called From**: 30+ locations (routers, jobs, services)
- **Problem**: Only inserts `userId, type, title, content, priority`

### Admin Monitoring
- **File**: `apps/web/server/routers/monitoring.ts`
- **Endpoints**: getRunEvents, getNotifications, markNotificationRead, dismissNotification
- **Problem**: Limited filtering/search

### Guardian Alerts
- **File**: `apps/web/server/services/virtualAdmin/notifier.ts`
- **Channels**: in-app, email, email_digest, slack, telegram
- **Cooldown**: 5 min per rule
- **Data**: Has incidentId, ruleId, sensorId (not exposed in UI)

### Python Backend Alerts
- **File**: `python-backend/app/monitoring/alerts.py` (346 lines)
- **Status**: ⚠️ **All delivery functions marked TODO**
- **Rules**: high_error_rate, slow_response_time, high_concurrent_load, revenue_anomaly, no_recent_purchases
- **Problem**: Alerts never reach users

---

## Hardcoded String Matching (Brittle)

**Location**: `apps/web/client/src/components/GlobalAlerts.tsx:731-827`

```typescript
// HACK 1: Match title strings
if (n.title?.includes("Media Job")) {
  // Show "Open Media Studio →"
}

// HACK 2: Match title + extract ID via regex
if (n.title?.includes("Feedback")) {
  const ticketMatch = n.content?.match(/Ticket #(\d+)/);
  const ticketId = ticketMatch?.[1];
  // Navigate to `/admin/feedback-hub?ticketId=${ticketId}`
}

// HACK 3: Match substring
if (n.title?.includes("latency") || n.title?.includes("API error")) {
  // Show "System Guardian →"
}
```

**Risk**: Any change to notification title in backend breaks the matching.

---

## Notification Creation Examples

### Example 1: Media Job Completion (Gap)

**Current Code** (`mediaJobs.ts:110`):
```typescript
await createNotification({
  db,
  userId: ctx.user.id,
  type: "alert",
  title: `Media Job Completed: ${mediaJob.jobId}`,
  content: `Your image generation job has completed.`,
  priority: "normal",
});
```

**Frontend sees**:
- Title: "Media Job Completed: abc-123"
- Content: "Your image generation job has completed."
- Action: String match → generic "Open Media Studio"

**User gets**:
- Generic page link, must manually find the job

**Should be**:
```typescript
await createNotification({
  db,
  userId: ctx.user.id,
  type: "alert",
  title: "Image Generation Complete",
  content: "1920x1080 image generated in 45s",
  priority: "normal",
  relatedResourceType: "media_job",
  relatedResourceId: mediaJob.id,
  actionUrl: `/media-studio?jobId=${mediaJob.id}`,
  metadata: {
    duration: 45,
    outputSize: "1920x1080",
    costUsd: 0.08,
    eventId: traceId,
  },
});
```

### Example 2: Workflow Failure (Gap)

**Current Code** (`workflow.ts:1889`):
```typescript
await createNotification({
  db,
  userId: ctx.user.id,
  type: "alert",
  title: "Workflow execution failed",
  content: error.message,
  priority: "high",
});
```

**Problem**:
- No workflow ID
- No step that failed
- No error code
- Frontend can't link to workflow

### Example 3: Feedback Reply (Works via regex)

**Current Code** (`feedback.ts:249`):
```typescript
await createNotification({
  db,
  userId: userId,
  type: "scheduled_message",
  title: "Reply on feedback: Ticket #123",
  content: "Admin replied to your feedback",
  priority: "normal",
});
```

**Frontend parsing** (lines 788-806):
```typescript
const ticketMatch = n.content?.match(/Ticket #(\d+)/);
// Fragile! Depends on exact format
```

### Example 4: Guardian Incident (Detailed but unused)

**Current Code** (`virtualAdmin/notifier.ts:89-112`):
```typescript
await db.insert(userNotifications).values({
  userId: admin.id,
  type: "system",
  title: `[${n.severity.toUpperCase()}] ${n.title}`,
  content: n.message,
  priority: n.severity === "critical" ? "high" : "normal",
  // Missing: incidentId, ruleId, sensorId, actionUrl
});
```

**Guardian has this data** (notifier.ts:3-14):
```typescript
export interface GuardianNotification {
  tenantId?: string;
  incidentId: number;        // ← Not stored
  severity: IncidentSeverity;
  title: string;
  message: string;
  ruleId: string;            // ← Not stored
  sensorId: string;          // ← Not stored
  actionTaken?: string;      // ← Not stored
}
```

**But doesn't attach to notification**: User sees generic alert, can't navigate to incident details.

---

## Proposed Schema Change

### Current `userNotifications` Table
```typescript
export const userNotifications = pgTable("user_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id).notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  conversationId: integer("conversationId").references(() => conversations.id),
  scheduledMessageId: integer("scheduledMessageId").references(() => scheduledMessages.id),
  priority: reminderPriorityEnum("priority").default("normal").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

### Proposed Changes (ADD 4 NEW FIELDS)

```typescript
export const userNotifications = pgTable("user_notifications", {
  // ... existing fields ...

  // 1. Structured resource linking
  relatedResourceType: varchar("relatedResourceType", { length: 50 }),
  // Example values: "media_job", "workflow", "skill", "feedback", "approval", "team_run", "incident"

  relatedResourceId: varchar("relatedResourceId", { length: 100 }),
  // Example: mediaJob.id, workflow.id, feedback.id, etc.

  // 2. Direct action URL (replaces string matching)
  actionUrl: text("actionUrl"),
  // Example: "/media-studio?jobId=abc-123" or "/workflows?id=xyz"

  // 3. Structured metadata
  metadata: jsonb("metadata").$type<{
    eventId?: string;
    errorDetails?: {
      errorCode?: string;
      errorMessage?: string;
      stackTrace?: string;
    };
    metrics?: {
      duration?: number;  // ms
      costUsd?: number;
      itemCount?: number;
    };
    retryInfo?: {
      retryCount: number;
      maxRetries: number;
      nextRetryAt?: string;
    };
    relatedItems?: {
      parentWorkflowId?: string;
      teamId?: string;
      roomId?: string;
      incidentId?: string;
      ruleId?: string;
    };
  }>(),

  // Already exists but separate: isDismissed
  // Should add: dismissedAt timestamp
});
```

---

## Fix Implementation Plan

### Phase 1: Schema & Creation (2-3 hours)

**Step 1**: Add 4 fields to schema
- `relatedResourceType` varchar(50)
- `relatedResourceId` varchar(100)
- `actionUrl` text
- `metadata` jsonb
- Run `pnpm db:push`

**Step 2**: Update 30+ `createNotification()` calls

Find all calls:
```bash
grep -r "await createNotification" apps/web/server/
```

Update each:
```typescript
// BEFORE
await createNotification({
  db,
  userId: ctx.user.id,
  type: "alert",
  title: "Media Job Completed: " + jobId,
  content: "Your job is done",
});

// AFTER
await createNotification({
  db,
  userId: ctx.user.id,
  type: "alert",
  title: "Image Generation Complete",
  content: `Generated ${width}x${height} in ${duration}s. Cost: $${cost}`,
  priority: "normal",
  relatedResourceType: "media_job",
  relatedResourceId: jobId,
  actionUrl: `/media-studio?jobId=${jobId}`,
  metadata: {
    duration,
    costUsd: cost,
    outputSize: `${width}x${height}`,
    eventId: traceId,
  },
});
```

**Files to update**:
- `routers/mediaJobs.ts` (2 calls)
- `routers/workflow.ts` (3 calls)
- `routers/feedback.ts` (2 calls)
- `routers/skills.ts` (2 calls)
- `routers/agency.ts` (3 calls)
- `routers/follows.ts` (2 calls)
- `services/scheduler.ts` (4 calls)
- `services/virtualAdmin/feedbackProcessor.ts` (1 call)
- `jobs/pendingApprovalAlert.ts` (1 call)

### Phase 2: Frontend (1-2 hours)

**Remove hardcoded string matching**:
```typescript
// OLD: lines 731-827
if (n.title?.includes("Media Job")) { ... }
if (n.title?.includes("credit")) { ... }
// ... DELETE THESE

// NEW: Use relatedResourceType
if (n.relatedResourceType === "media_job" && n.actionUrl) {
  <button onClick={() => setLocation(n.actionUrl)}>
    View Job Details →
  </button>
}

if (n.relatedResourceType === "feedback" && n.actionUrl) {
  <button onClick={() => setLocation(n.actionUrl)}>
    View Ticket →
  </button>
}
```

**Add Details Panel**:
- Click notification → side panel opens
- Shows metadata, error details, related items
- Shows retry button if applicable

### Phase 3: Search & History (2-4 hours)

**Add tRPC endpoint**:
```typescript
getNotificationHistory: protectedProcedure
  .input(z.object({
    limit: z.number().max(100).default(50),
    offset: z.number().default(0),
    filter: z.object({
      type: z.string().optional(),
      resourceType: z.string().optional(),
      priority: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
    }).optional(),
  }))
  .query(async ({ ctx, input }) => {
    // Query user_notifications with filters
    // Return { notifications: [...], total: number }
  }),
```

**Add History Page**:
- `/notifications/history`
- Search by keyword, date, type
- Filter by priority, resource type
- Sort by date, priority
- Export to CSV

---

## Testing Checklist

- [ ] Schema migration runs successfully
- [ ] No data loss in user_notifications table
- [ ] All createNotification() calls updated
- [ ] Notification UI uses actionUrl instead of string matching
- [ ] Test notification for each resourceType (media_job, workflow, feedback, etc.)
- [ ] Click action button → navigates to correct page
- [ ] Metadata displays in details panel
- [ ] Retry button works (if applicable)
- [ ] Search/filter works on history page

---

## Files Summary

### Read-only files (understand flow)
- `apps/web/client/src/components/GlobalAlerts.tsx` (915 lines) — hardcoded matching
- `apps/web/server/services/notificationService.ts` (111 lines) — creator
- `apps/web/drizzle/schema.ts:3059-3087` — userNotifications table

### Files to modify
- `apps/web/drizzle/schema.ts` — ADD 4 fields to userNotifications
- `apps/web/server/services/notificationService.ts` — Update createNotification signature
- `apps/web/server/routers/*.ts` — 30+ calls to createNotification()
- `apps/web/client/src/components/GlobalAlerts.tsx:731-827` — Replace hardcoded matching

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Migration breaks existing notifications | Old notifications will have NULL metadata — frontend handles gracefully |
| Some createNotification calls missed | Grep search finds them all. Add unit test that all calls pass relatedResourceType |
| Action URL format differs by resource type | Map resourceType → URL pattern. Test each type before merge |
| Users confused by new UI | Add "?" help icon explaining metadata sections |

