# Alert & Notification System Audit

**Date**: 2026-03-19
**Scope**: Complete frontend + backend alert/notification/toast architecture
**Status**: GAPS IDENTIFIED — Alerts lack contextual detail & direct action links

---

## Executive Summary

SmartSpecPro has THREE distinct notification systems:

| System | UI Location | Data Model | Channels | Use Cases |
|--------|-------------|-----------|----------|-----------|
| **Sonner Toasts** | Top-right corner (transient) | In-memory (no DB) | Frontend only | Success, error, info messages |
| **User Notifications** | Notification bell dropdown | `userNotifications` DB table | In-app + Telegram | Scheduled alerts, feedback replies, skill events |
| **Orchestrator Notifications** | SSE + dropdown | `orchestratorNotifications` DB table | In-app + SSE | Team runs, room events (Feature 044) |
| **Guardian Alerts** | Admin dashboard | In-memory rules engine | In-app + Email + Slack | System health, incident detection |
| **Python Backend Alerts** | Logs only (TODO) | Structured logging | Log files (unimplemented) | Celery failures, provider health |

**Critical Gap**: When users click notifications, they see only **title + content**. No:
- Root cause context
- Actionable links (except hardcoded string matching)
- Related ticket/job IDs
- Timestamp of underlying event
- Retry information for failures
- Debug logs or error details

---

## 1. Frontend Alert/Notification System

### 1.1 Sonner Toast Library

**Location**: `apps/web/client/src/components/ui/sonner.tsx`

```typescript
// Simple re-export from @smartspec/ui
export * from "@smartspec/ui/src/components/ui/sonner";
```

**Library**: Sonner (React toast notifications)

**Characteristics**:
- Transient (auto-dismisses after 3-5s)
- No persistence — NOT stored in database
- No read/unread tracking
- No history available to user

**Usage Pattern** (across codebase):

```typescript
import { toast } from "sonner";

// Simple notification
toast.success("Item saved");

// With description
toast.warning("High latency detected", {
  description: "API response time > 2000ms",
  duration: 10000,
});

// With action button
toast.error("Media job failed", {
  description: "Image generation timeout after 30s",
  action: {
    label: "Retry",
    onClick: () => retryMediaGeneration(jobId),
  },
});
```

**Files Using Sonner** (150+ files):
- Most feature components emit toasts for user feedback
- Example: `apps/web/client/src/components/chat/ChatView.tsx` — chat sends/failures
- Example: `apps/web/client/src/pages/MediaStudio.tsx` — media task status
- Example: `apps/web/client/src/pages/AgencyBuilder.tsx` — save/validation

**Gaps**:
1. ❌ No persistent history — user can't review past toasts
2. ❌ No structured data — only free-form text
3. ❌ No auto-linking to related resources
4. ❌ No analytics on what toasts users see

---

### 1.2 GlobalAlerts Component — Notification Bell + Modals

**Location**: `apps/web/client/src/components/GlobalAlerts.tsx` (915 lines)

**Responsibilities**:
1. Render notification bell (top-right corner)
2. Show urgent messages as full-screen modals
3. Show scheduled reminders as full-screen modals
4. Poll for unread notification count (30s interval)
5. Display notification dropdown (20-item list, expandable)
6. Mark notifications as read
7. Smart action linking based on title pattern matching

**Three Sub-Components**:

#### A. `GlobalUrgentAlerts()`

Polls `trpc.follows.getUrgentMessages()` every 10s.

**Data returned**:
```typescript
{
  id: number;
  senderId: number;
  senderName: string;
  senderEmail: string;
  content: string;
}
```

**Behavior**:
- Shows latest urgent message as full-screen modal (z-index 9999)
- Red border, "Urgent" badge
- Two buttons: "Dismiss" or "Open Chat"
- Clicking "Open Chat" navigates to `/chat?dm=${senderId}`
- Additional messages show as toasts with "View" button

**Gap**: Modal shows only sender name + message content. No:
- Message timestamp
- Whether this is a reply
- Message thread context

---

#### B. `GlobalUrgentReminders()`

Polls `trpc.scheduledMessages.getUrgentReminders()` every 10s.

**Data returned**:
```typescript
{
  id: number;
  title: string;
  content: string;
  priority: "critical" | "high" | "normal" | "low";
  scheduledMessageId: number | null;
  conversationId?: number | null;
}
```

**Behavior**:
- Shows reminder with title + content in full-screen modal
- Priority affects border color + animation
- "Critical" priority: red border, pulsing animation, larger text
- "High" priority: orange border, normal animation
- Calls `trpc.scheduledMessages.markRead.mutate()` on dismiss
- Two buttons: "Dismiss" or "View Alerts"
- "View Alerts" navigates to `/chat?panel=schedule${alertId}` or conversation

**Gap**: Modal shows only reminder title + content. No:
- Schedule details (cron expression, next run time)
- Associated conversation context
- Notification history for this reminder

---

#### C. `GlobalNotificationBell()`

**Bell Display**:
- Shows unread count badge (red circle, top-right)
- Hidden if count = 0 (unless dropdown open)
- Click to toggle dropdown (z-index 9990)

**Dropdown UI** (360px wide, 480px max height):

```
┌─────────────────────────────────────────────┐
│ Notifications (5)  [Mark all read] [×]      │ ← Header
├─────────────────────────────────────────────┤
│                                             │
│ ●  Title                                5m  │ ← Unread dot (colored by priority)
│    Content preview (2-line max)...          │    Title + timestamp
│                                             │
│ ·  Title                                2h  │ ← Read (no dot)
│    Content preview...                       │
│                                             │
│ [Expand: ▼] [Mark read: ✓]                  │ ← Expand/action buttons
│                                             │
└─────────────────────────────────────────────┘
│ [View Scheduled Alerts →]                   │ ← Footer link
└─────────────────────────────────────────────┘
```

**Each Notification Item**:

```typescript
{
  id: number;
  type: "scheduled_message" | "follow_request" | "alert" | "system" | "direct_message" | "urgent_message";
  title: string;
  content?: string;
  priority: "low" | "normal" | "high" | "critical";
  isRead: boolean;
  createdAt: Date;
  conversationId?: number | null;
  scheduledMessageId?: number | null;
}
```

**Smart Action Links** (Lines 731-827 — HARDCODED STRING MATCHING):

```typescript
// Hack 1: Match title strings to infer action
if (n.title?.includes("Media Job")) {
  // Show "Open Media Studio →" button
}

if (n.title?.includes("credit") || n.title?.includes("Credit")) {
  // Show "Admin Settings →" button
}

if (n.title?.includes("latency") || n.title?.includes("API error")) {
  // Show "System Guardian →" button
}

if (n.title?.includes("Feedback") || n.title?.includes("feedback")) {
  // Try to extract ticket ID from content: /Ticket #(\d+)/
  // Show "View Feedback →" button
}
```

**Gaps**:
1. ❌ Action links are brittle — rely on exact string matching
2. ❌ No structured metadata to link notifications to related resources
3. ❌ No timestamp field shown in dropdown (only relative "5m ago")
4. ❌ No way to search/filter notifications
5. ❌ Expanded content truncated to 2 lines unless expanded
6. ❌ No "Show Details" panel with full context

---

## 2. Backend Notification Data Models

### 2.1 User Notifications Table

**Schema**: `apps/web/drizzle/schema.ts` lines 3059-3087

```typescript
export const userNotifications = pgTable("user_notifications", {
  id: serial("id").primaryKey(),

  userId: integer("userId").references(() => users.id).notNull(),

  type: notificationTypeEnum("type").notNull(),
  // Values: "scheduled_message" | "follow_request" | "alert" | "system" | "direct_message" | "urgent_message"

  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),

  // Foreign keys for linking
  conversationId: integer("conversationId").references(() => conversations.id, { onDelete: "set null" }),
  scheduledMessageId: integer("scheduledMessageId").references(() => scheduledMessages.id, { onDelete: "set null" }),

  // Priority determines full-screen modal display
  priority: reminderPriorityEnum("priority").default("normal").notNull(),
  // Values: "low" | "normal" | "high" | "critical"

  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("user_notifications_user_read").on(t.userId, t.isRead, t.createdAt),
  index("user_notifications_user_priority").on(t.userId, t.isRead, t.priority),
]);
```

**Missing Fields**:
- ❌ No `actionUrl` — hardcoded string matching in frontend instead
- ❌ No `relatedResourceId` or `relatedResourceType` — can't programmatically link
- ❌ No `eventId` — can't trace back to underlying event
- ❌ No `metadata` JSON field for error details, retry info, etc.
- ❌ No `dismissedAt` — only has `isRead`
- ❌ No `expiresAt` — notifications never auto-delete

---

### 2.2 Scheduled Messages Table

**Schema**: `apps/web/drizzle/schema.ts` lines 2938-3007

```typescript
export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),

  userId: integer("userId").references(() => users.id).notNull(),

  prompt: varchar("prompt", { length: 5000 }).notNull(),
  cronExpression: varchar("cronExpression", { length: 100 }),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Bangkok").notNull(),
  scheduledAt: timestamp("scheduledAt", { withTimezone: true }),
  isRecurring: boolean("isRecurring").default(false).notNull(),

  priority: reminderPriorityEnum("priority").default("normal").notNull(),

  // Model + skill execution
  modelId: varchar("modelId", { length: 128 }),
  skillId: varchar("skillId", { length: 100 }),
  dynamicParams: json("dynamicParams").$type<Record<string, any>>(),

  // Notification settings
  emailNotify: boolean("emailNotify").default(true).notNull(),

  description: varchar("description", { length: 500 }),

  // Linking
  conversationId: integer("conversationId"),
  targetUserId: integer("targetUserId"), // For admin to schedule for users

  status: scheduledMessageStatusEnum("status").default("active"),
  // Values: "active" | "paused" | "failed" | "completed"

  bullmqJobId: varchar("bullmqJobId", { length: 100 }),
  lastError: text("lastError"),
  executionCount: integer("executionCount").default(0).notNull(),
  lastExecutedAt: timestamp("lastExecutedAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("scheduled_messages_user_status").on(t.userId, t.status),
  index("scheduled_messages_user_created").on(t.userId, t.createdAt),
  index("scheduled_messages_status").on(t.status),
]);
```

**Good**: Has `lastError` field for tracking failures
**Gap**: `lastError` is not exposed in notification UI

---

### 2.3 Orchestrator Notifications Table

**Schema** (inferred from code): `apps/web/drizzle/schema.ts`

```typescript
export const orchestratorNotifications = pgTable("orchestrator_notifications", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID

  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  userId: integer("userId").references(() => users.id).notNull(),

  // Linking to team features
  teamId?: varchar("teamId", { length: 36 }),
  roomId?: varchar("roomId", { length: 36 }),
  runId?: varchar("runId", { length: 36 }),

  notificationType: varchar("notificationType", { length: 128 }).notNull(),
  severity: varchar("severity", { length: 20 }).default("info").notNull(),
  // Values: "info" | "warning" | "error" | "critical"

  title: varchar("title", { length: 255 }).notNull(),
  body?: text("body"),
  actionUrl?: text("actionUrl"), // ← GOOD: Has action URL

  isRead: boolean("isRead").default(false).notNull(),
  isDismissed: boolean("isDismissed").default(false).notNull(),
  readAt?: timestamp("readAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
});
```

**Good**: Has `actionUrl` field
**Gap**: Not used in GlobalNotificationBell (only `userNotifications` displayed there)

---

## 3. Notification Generation Points

### 3.1 Places Notifications Are Created

**`createNotification()` called from** (`apps/web/server/services/notificationService.ts`):

1. **`apps/web/server/jobs/pendingApprovalAlert.ts`** (line 52)
   - Creates "Approval Pending" notification when workflow requires approval
   - No related resource ID attached

2. **`apps/web/server/routers/follows.ts`** (lines 90, 382)
   - Follow request accepted/rejected notifications
   - Links to conversation

3. **`apps/web/server/routers/mediaJobs.ts`** (lines 110, 135)
   - Media job completion (success/failure)
   - No job ID in notification title → hardcoded string matching

4. **`apps/web/server/routers/workflow.ts`** (lines 1769, 1842, 1889)
   - Workflow execution completed/failed
   - No workflow ID attached → string matching

5. **`apps/web/server/routers/feedback.ts`** (lines 249, 311)
   - New feedback ticket created
   - Tries to parse ticket ID from content via regex

6. **`apps/web/server/routers/skills.ts`** (lines 2225, 2283)
   - Skill approval notifications
   - No skill ID attached

7. **`apps/web/server/routers/agency.ts`** (lines 2633, 2696, 2735)
   - Agency publishing / approval notifications
   - No agency ID attached

8. **`apps/web/server/services/virtualAdmin/feedbackProcessor.ts`** (line 141)
   - Feedback rule violations
   - Guardian system

9. **`apps/web/server/services/scheduler.ts`** (lines 92, 236, 359, 565)
   - Scheduled message execution notifications
   - Links to conversation

---

### 3.2 Example: Media Job Notification

**Current Code** (`apps/web/server/routers/mediaJobs.ts:110-118`):

```typescript
const { createNotification } = await import("../services/notificationService");
await createNotification({
  db,
  userId: ctx.user.id,
  type: "alert",
  title: `Media Job Completed: ${mediaJob.jobId}`,
  content: `Your image generation job has completed. View results in Media Studio.`,
  priority: "normal",
  conversationId: undefined, // Oops — no direct link to job
});
```

**Frontend sees**:
- Title: `"Media Job Completed: abc-123-def"`
- Content: `"Your image generation job has completed. View results in Media Studio."`
- Action: Hardcoded string match → "Open Media Studio" link

**Problem**: User sees generic "Media Studio" link, must manually find their job.

**Better Would Be**:
```typescript
await createNotification({
  db,
  userId: ctx.user.id,
  type: "alert",
  title: `Media Job Completed`,
  content: `Image generation completed in 45s. Size: 1920x1080.`,
  priority: "normal",
  metadata: {
    relatedResourceType: "media_job",
    relatedResourceId: mediaJob.id,
    actionUrl: `/media-studio?jobId=${mediaJob.id}`,
    eventId: traceId, // For audit trail
    statistics: {
      duration: 45,
      outputSize: "1920x1080",
      costUsd: 0.08,
    },
  },
});
```

---

## 4. Admin Monitoring Alerts

### 4.1 Monitoring Router

**Location**: `apps/web/server/routers/monitoring.ts` (70 lines)

**Endpoints**:
1. `getRunEvents` — Get SSE events from orchestrator
2. `captureSnapshot` — Capture run state for debugging
3. `checkStuck` — Check if agent is stuck
4. `getNotifications` — Get orchestrator notifications
5. `markNotificationRead` — Mark as read
6. `dismissNotification` — Dismiss notification

**Gap**: No endpoints to:
- Query notification history
- Filter by severity
- Export notifications
- Manage notification rules
- Set cooldown/throttling

---

### 4.2 Guardian Alert System

**Location**: `apps/web/server/services/virtualAdmin/notifier.ts` (150+ lines)

**Severity Levels**:
```typescript
info      → in_app
warning   → in_app, email_digest
error     → in_app, email, slack
critical  → in_app, email, slack, telegram
```

**Channel Routing**:
- **in_app**: Inserts to `userNotifications` for admins
- **email**: Rate-limited (20 emails/hour per tenant)
- **slack**: Sends to webhook URL
- **telegram**: Via `telegramService`
- **email_digest**: Queued in Redis for batch processing

**Guardian Notification Fields** (lines 3-14):
```typescript
export interface GuardianNotification {
  tenantId?: string;
  incidentId: number;
  severity: IncidentSeverity;
  title: string;
  message: string;
  ruleId: string;
  sensorId: string;
  actionTaken?: string;
  requiresApproval?: boolean;
  approvalId?: number;
}
```

**Good**: Has `incidentId`, `ruleId`, `sensorId` for tracing
**Gap**: This detailed data is NOT displayed in notification UI

---

## 5. Python Backend Alerts (Unimplemented)

**Location**: `python-backend/app/monitoring/alerts.py` (346 lines)

**Alert Rules Defined**:
1. `high_error_rate` (> 5% errors)
2. `slow_response_time` (> 2000ms avg)
3. `high_concurrent_load` (> 100 concurrent)
4. `revenue_split_anomaly` (85/15 split validation)
5. `no_recent_purchases` (business monitoring)

**Status**: ⚠️ **NOT IMPLEMENTED**
- Logging to logs only
- Email sending: TODO (line 211)
- Slack sending: TODO (line 279)
- Discord: TODO (line 314)
- Webhook: TODO (line 333)

**Gap**: These alerts never reach users — they're just logged

---

## 6. Critical Gaps & Issues

### 6.1 Lack of Contextual Detail

| Alert Type | Current Info | Missing |
|------------|--------------|---------|
| Media Job | "Completed" | Job ID, duration, output size, cost, error details |
| Workflow | "Completed" | Workflow ID, execution time, output summary, failure reason |
| Skill | "Approved" | Skill ID, version, change summary |
| Approval | "Pending" | Request ID, deadline, approver list |
| Error | Generic text | Stack trace snippet, error code, recovery steps |

### 6.2 Brittle String Matching

Frontend hardcodes title patterns:
- `n.title?.includes("Media Job")` — breaks if title format changes
- `n.title?.includes("latency")` — false positives
- Regex parsing of ticket ID from content: `n.content?.match(/Ticket #(\d+)/)`

**Risk**: Changing a notification title in backend silently breaks frontend action links.

### 6.3 No Structured Metadata

Notifications should carry:
- `relatedResourceType` (media_job, workflow, skill, feedback, approval, etc.)
- `relatedResourceId` (UUID/ID of related resource)
- `actionUrl` (where to navigate to fix/view)
- `metadata` JSON with:
  - Error details / stack trace
  - Retry count / retry strategy
  - Cost/duration metrics
  - Related items (parent workflow, team, room, etc.)
- `eventId` (for tracing back to audit log)

### 6.4 No History or Search

Users can only see:
- **Last 20 notifications** (dropdown list)
- **Unread only** (no way to see all)
- **Can't search** by keyword, date, type
- **Can't filter** by severity, source

### 6.5 Smart Action Links Are Wrong

**Current**:
```typescript
if (n.type === "alert" && n.title?.includes("Media Job")) {
  // Show "Open Media Studio" — generic dashboard
}
```

**Should Be**:
```typescript
if (n.relatedResourceType === "media_job") {
  // Show "View Job Details" → `/media-studio?jobId=${n.relatedResourceId}`
}
```

### 6.6 No Real-Time Sync for Toast Dismissal

If user dismisses a toast while backend is still processing:
- No cancellation of the underlying operation
- Notification might still arrive in notification bell later
- Confusing UX: user thinks action cancelled but it continues

### 6.7 Python Alerts Never Reach Users

`python-backend/app/monitoring/alerts.py`:
- All "Send email/Slack/Discord" functions are TODO
- Alerts only go to logs
- System health issues never surface to admins

---

## 7. Data Flow Diagram

```
┌────────────────────────────────────────────────────────────┐
│                    USER ACTIONS                            │
└────────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
    ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
    │ Chat        │  │ Media Job   │  │ Workflow     │
    │ Skill       │  │ Execution   │  │ Execution    │
    │ Approval    │  │             │  │              │
    └─────────────┘  └─────────────┘  └──────────────┘
           │                │                │
           └────────────────┼────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │  createNotification()      │
              │  (notificationService.ts) │
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │  INSERT user_notifications│
              │  (DB table)               │
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │  enqueueTelegramNotif()    │
              │  (fire-and-forget)        │
              └─────────────┬──────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
    ┌─────────┐      ┌──────────────┐    ┌──────────┐
    │ Telegram│      │ Frontend Poll│    │ In-App   │
    │ Service │      │ (30s)        │    │ Dropdown │
    └─────────┘      └──────────────┘    └──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ GlobalNotificationBell │
                 │ (renders dropdown)    │
                 └────────────────────────┘
```

---

## 8. Recommendations

### Phase 1 (High Priority) — Add Structured Metadata

**Changes to `userNotifications` table**:

```typescript
export const userNotifications = pgTable("user_notifications", {
  // ... existing fields ...

  // NEW: Structured resource linking
  relatedResourceType: varchar("relatedResourceType", { length: 50 }),
  // Values: "media_job" | "workflow" | "skill" | "feedback" | "approval" | "team_run" | "room" | etc.

  relatedResourceId: varchar("relatedResourceId", { length: 100 }),

  // NEW: Direct action URL (overrides string matching)
  actionUrl: text("actionUrl"),

  // NEW: Structured metadata (error, metrics, retry info)
  metadata: jsonb("metadata").$type<{
    eventId?: string;  // For audit trail
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
    };
  }>(),

  // NEW: Explicit dismissal (separate from read)
  isDismissed: boolean("isDismissed").default(false).notNull(),
  dismissedAt: timestamp("dismissedAt"),

  // NEW: Expiration for auto-cleanup
  expiresAt: timestamp("expiresAt"), // Default: createdAt + 90 days
});
```

### Phase 2 (Medium Priority) — Enhanced Notification UI

**GlobalNotificationBell improvements**:

1. **Detailed View Panel**: Click notification → side panel shows:
   - Full title + content
   - Related resource link (Media Studio job, Workflow execution, etc.)
   - Error details (if applicable)
   - Metrics (duration, cost, item count)
   - Retry information
   - Created time (absolute + relative)
   - Links to related items (parent workflow, team, etc.)

2. **Smart Action Routing**:
   ```typescript
   const actionMapping = {
     media_job: (id) => `/media-studio?jobId=${id}`,
     workflow: (id) => `/workflows?id=${id}`,
     skill: (id) => `/admin/skills?id=${id}`,
     feedback: (id) => `/admin/feedback-hub?ticketId=${id}`,
     approval: (id) => `/approvals?id=${id}`,
     team_run: (id, tenantId) => `/team/${tenantId}/runs/${id}`,
   };
   ```

3. **Search + Filter**:
   - Search by keyword, resource ID, date range
   - Filter by type, severity, read status
   - Sort by date, priority, unread-first

4. **Notification History**:
   - Link to full notification log page
   - Export as CSV/JSON

### Phase 3 (Future) — Python Backend Alerts

**Implement alert delivery**:
- Complete email sending in `alerts.py`
- Complete Slack/Discord webhook integration
- Route Python alerts → in-app notifications
- Add alert preference page (which alerts to opt-in)

---

## 9. Risk Assessment

### Current Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Action link breaks when title format changes | HIGH | MEDIUM | Add structured metadata now |
| User misses critical alert in dropdown | MEDIUM | HIGH | Implement unread badge on bell |
| Alert context lost after dismissal | HIGH | MEDIUM | Store metadata, allow re-opening dismissed |
| Multiple notifications for same failure | HIGH | MEDIUM | Add deduplication logic in createNotification |
| No way to trace alert back to audit log | HIGH | LOW | Add eventId field, link to audit search |

---

## 10. File Reference

### Frontend
- `apps/web/client/src/components/GlobalAlerts.tsx` (915 lines) — Toast + modal system
- `apps/web/client/src/components/ui/sonner.tsx` — Sonner library export
- `apps/web/client/src/hooks/use-toast.ts` — Toast hook

### Backend
- `apps/web/server/services/notificationService.ts` (111 lines) — Notification creator
- `apps/web/server/services/orchestratorNotificationService.ts` (160+ lines) — Team notifications
- `apps/web/server/services/virtualAdmin/notifier.ts` (150+ lines) — Guardian alerts
- `apps/web/server/_core/notification.ts` (115 lines) — Notification payload validator
- `apps/web/server/routers/monitoring.ts` (70 lines) — Admin monitoring API
- `apps/web/server/routers/scheduledMessages.ts` (600+ lines) — Scheduled alert CRUD
- `apps/web/drizzle/schema.ts` lines 3059-3087 — `userNotifications` table
- `apps/web/drizzle/schema.ts` lines 2938-3007 — `scheduledMessages` table
- `apps/web/drizzle/schema.ts` (grep `orchestratorNotifications`) — Team notifications

### Python Backend
- `python-backend/app/monitoring/alerts.py` (346 lines) — Alert rules engine (unimplemented delivery)
- `python-backend/app/services/generation/key_notifications.py` — Generation alerts

### Creation Points
- `apps/web/server/jobs/pendingApprovalAlert.ts`
- `apps/web/server/routers/follows.ts`
- `apps/web/server/routers/mediaJobs.ts`
- `apps/web/server/routers/workflow.ts`
- `apps/web/server/routers/feedback.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/server/routers/agency.ts`
- `apps/web/server/services/scheduler.ts`

---

## 11. Summary

SmartSpecPro has a working alert system, but **alerts lack the detailed context needed for investigation**. Users see generic messages like "Media Job Completed" without knowing which job, what went wrong (if it failed), how long it took, or cost. The frontend relies on brittle string matching instead of structured resource linking.

**Quick Win**: Add `relatedResourceType`, `relatedResourceId`, `actionUrl`, and `metadata` fields to `userNotifications`. Update all `createNotification()` calls to fill these fields. Update GlobalNotificationBell to use `actionUrl` instead of string matching.

**Long-term**: Implement notification details panel, search/filter, and history. Complete Python alert delivery.
