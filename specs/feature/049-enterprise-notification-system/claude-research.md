# Research: Enterprise Notification System (Feature 049)

## Current State — Phases 1-3 Complete

### Database Schema

**File**: `apps/web/drizzle/schema.ts`

#### Enums
- `notificationTypeEnum`: `["scheduled_message", "follow_request", "alert", "system"]`
- `reminderPriorityEnum`: `["low", "normal", "high", "critical"]`
- `notificationSeverityEnum`: `["info", "warning", "error", "critical"]` (used by orchestrator)

#### userNotifications Table (Lines 3064-3132)
Columns: id (serial PK), userId (FK→users CASCADE), type (enum), title (varchar 255), content (text), conversationId (FK→conversations), scheduledMessageId (FK→scheduledMessages), priority (enum, default "normal"), isRead (boolean), isDismissed (boolean), relatedResourceType (varchar 50), relatedResourceId (varchar 200), actionUrl (text), actionLabel (varchar 100), metadata (jsonb), expiresAt (timestamptz), createdAt (timestamptz).

**Indexes**: `user_notifications_user_read` (userId, isRead, createdAt), `user_notifications_user_priority` (userId, isRead, priority), `user_notifications_resource` (relatedResourceType, relatedResourceId).

**Metadata JSONB type**: `{ eventId?, source?, errorDetails?: { errorCode?, errorMessage? }, metrics?: { durationMs?, costUsd?, itemCount? }, retryInfo?: { retryCount?, maxRetries?, nextRetryAt? }, relatedItems?: Record<string, string> }`

#### orchestratorNotifications Table (Lines 6456-6478)
Columns: id (uuid PK), tenantId (FK→tenants CASCADE), userId (FK→users), teamId (uuid), roomId (uuid), runId (uuid), notificationType (text), severity (enum notificationSeverityEnum, default "info"), title (varchar 255), body (text), actionUrl (text), isRead (boolean), isDismissed (boolean), createdAt (timestamptz), readAt (timestamptz).

**Indexes**: `orchestrator_notifications_user_unread_idx` (userId, isRead, createdAt), `orchestrator_notifications_tenant_created_idx` (tenantId, createdAt).

**Note**: Missing `(userId, createdAt DESC)` index needed for Phase 6 unified query.

### Notification Service

**File**: `apps/web/server/services/notificationService.ts` (262 lines)

**createNotification(params)** — Central creation function.

Parameters: db, userId, type, title, content, priority?, conversationId?, scheduledMessageId?, relatedResourceType?, relatedResourceId?, actionUrl?, actionLabel?, metadata?, expiresAt?

**Three-stage fire-and-forget**:
1. DB insert into userNotifications (returns notificationId)
2. Telegram enqueue (non-fatal if fails)
3. Redis publish to `notifications:user:{userId}` (non-fatal if fails)

**Security**:
- `sanitizeActionUrl()` — blocks javascript:, data:, vbscript:, blob: protocols; only allows relative paths (/) and https://
- `sanitizeMetadata()` — truncates errorMessage to 500 chars, source to 200 chars
- actionLabel truncated to 100 chars

**Call sites** (14 total): follows.ts, skills.ts, workflow.ts, agency.ts, feedback.ts, mediaJobs.ts, virtualAdmin/feedbackProcessor.ts, pendingApprovalAlert.ts

### Orchestrator Notification Service

**File**: `apps/web/server/services/orchestratorNotificationService.ts` (4.7 KB)

Functions: createNotification, markAsRead, dismissNotification, getUnreadNotifications, getNotifications. Publishes to orchestratorEventBus. Separate from userNotifications.

### SSE Implementation

**File**: `apps/web/server/routes/notificationStream.ts` (151 lines)

- **Endpoint**: `GET /api/notifications/stream`
- **Auth**: JWT via `sdk.authenticateRequest(req)`
- **Per-user cap**: 5 concurrent SSE connections (oldest closed when limit exceeded)
- **Redis sub**: Subscribes to `notifications:user:{userId}` channel
- **Re-serialization**: JSON.parse → JSON.stringify prevents SSE frame injection
- **Heartbeat**: 30s keep-alive comments
- **Events**: `connected`, `notification`, `heartbeat`, `error`
- **Headers**: `text/event-stream`, `X-Accel-Buffering: no`

### Admin Broadcast Endpoint

**File**: `apps/web/server/_core/index.ts` (Lines 758-845)

- **Endpoint**: `POST /api/internal/notifications/admin-broadcast`
- **Auth**: Internal bearer token (SMARTSPEC_WEB_GATEWAY_TOKEN)
- **Rate limit**: 20 requests per minute (sliding window)
- **Validation**: Strict Zod schema on metadata
- **Behavior**: Fetches all admin users, calls createNotification for each

### tRPC Router (Notification Endpoints)

**File**: `apps/web/server/routers/scheduledMessages.ts`

Queries:
- `getNotificationCount` — unread count
- `getUrgentReminders` — high/critical priority for modal display (limit 5)
- `getNotifications` — recent unread (limit 20, max 50)
- `getNotificationHistory` — paginated with filters (type, priority, readState, search, showDismissed)

Mutations:
- `dismissNotification` — sets isDismissed=true, isRead=true (ownership check)
- `markRead` — sets isRead=true (ownership check)
- `markAllRead` — bulk update all unread for user

### Frontend Components

**GlobalAlerts.tsx** (1,130 lines) — Three components:
1. `GlobalUrgentAlerts` — full-screen modal for urgent messages (polls 10s)
2. `GlobalUrgentReminders` — full-screen modal for high/critical notifications (polls 10s)
3. `GlobalNotificationBell` — bell icon, unread badge, dropdown (20 items), SSE connection, detail panel

**SSE Frontend**: EventSource with `withCredentials: true`, invalidates TanStack Query cache on `notification` event. Falls back to polling (30s refetchInterval). Currently NO reconnection logic (spec notes this as a bug to fix).

**Notifications.tsx** (440 lines) — Full-page `/notifications` history:
- Pagination (20 items/page)
- Filters: type, priority, readState, search
- Detail panel showing metadata, error details, metrics
- Mark read, dismiss, action URL navigation

**Priority colors**: critical=#ef4444, high=#f59e0b, normal=#6b7280, low=#4b5563

**safeNavigate()** — blocks dangerous protocols before setLocation()

### Python Backend Alerts

**File**: `python-backend/app/monitoring/alerts.py`

IN_APP channel (Lines 329-394):
- Maps severity→priority (INFO→low, WARNING→normal, ERROR→high, CRITICAL→critical)
- Maps rule name→actionUrl (e.g., high_error_rate→/admin/system-guardian)
- POSTs to admin-broadcast endpoint with Bearer token
- Default rules: high_error_rate (>5%), slow_response_time (>2000ms), high_concurrent_load (>100), revenue_split_anomaly

### Feature Flags

**File**: `apps/web/shared/featureFlags.ts`

No notification-related feature flags currently exist. All notification features are always enabled.

### Guardian/Virtual Admin

**File**: `apps/web/server/services/virtualAdmin/feedbackProcessor.ts`

Creates notifications via `createNotification()` with metadata `{ source: "guardian", ...guardianFeedback.metadata }`. Currently does NOT include incidentId, ruleId, sensorId in structured metadata (spec identifies this as Phase 6 fix).

### Email Service

**File**: `apps/web/server/services/emailService.ts` (234 lines)

- Uses nodemailer with SMTP config from systemSettings table (encrypted)
- Functions: `sendVerificationEmail`, `sendPasswordResetEmail`, `testSmtpConnection`
- Config cached for 1 minute
- TLS 1.2 minimum
- **Note**: No generic `sendEmail()` helper — only verification/password reset templates

### BullMQ/Job Patterns

**Directory**: `apps/web/server/jobs/`

Current jobs use `setInterval` + `setTimeout` for scheduling (e.g., pendingApprovalAlert runs daily at 9 AM). Not using BullMQ for recurring jobs yet. BullMQ exists for task queues (media processing).

### Router Registration

**File**: `apps/web/server/routers.ts`

Pattern: Import router → add to `appRouter = router({ ... })`. Uses `protectedProcedure`, `adminProcedure`. New routers for Phases 5-7 need to be added here.

### i18n Patterns

**Files**: `apps/web/client/src/lib/i18n/locales/en.ts`, `th.ts`

Flat dot-notation keys (e.g., `"help.title": "Complete User Guide"`). Type-safe with `TranslationDictionary`. Supports EN and TH.

### Admin Page Patterns

Layout: max-width 1200px, Tabs (Radix), Card components, Lucide icons, Sonner toasts, React Hook Form + Zod validation.

### Existing Tests

**File**: `apps/web/server/services/notificationService.test.ts` (162 lines)

Uses Vitest with Drizzle mock chains. Tests createNotification with various params. Mocks telegramService and Redis. Pattern: chainable mock with `insert()→values()→returning()`.

### Existing Migration

**File**: `apps/web/drizzle/0093_naive_namora.sql` — Applied. Added Phase 1 columns (relatedResourceType, relatedResourceId, actionUrl, actionLabel, metadata, isDismissed, expiresAt) and resource index.

### Notification Type Enum Issue

The PostgreSQL enum `notification_type` has 4 values: `scheduled_message, follow_request, alert, system`. The TypeScript type also includes `direct_message` and `urgent_message` which will cause a runtime PostgreSQL check violation. Spec requires standalone `ALTER TYPE ADD VALUE` migration (cannot run inside transaction).

## Key Architectural Patterns

1. **Fire-and-forget**: DB insert always succeeds; Telegram/Redis delivery failures are logged but don't block
2. **Real-time + fallback**: SSE for instant updates, polling (30s) as fallback
3. **Priority-driven UX**: High/critical → full-screen modal; others → dropdown
4. **Structured linking**: actionUrl + relatedResourceType + relatedResourceId enable smart routing
5. **Three notification subsystems**: userNotifications (primary), orchestratorNotifications (team), Guardian (in-memory via feedbackProcessor)
6. **Security layers**: URL sanitization, metadata truncation, SSE connection cap, rate-limited admin-broadcast, internal token validation

## Testing Patterns

- **Framework**: Vitest (describe/it/expect/vi)
- **DB mocking**: Chainable Drizzle mock (`insert→values→returning`)
- **Service mocking**: `vi.mock("./service")` for external dependencies
- **Pattern**: Test fire-and-forget by verifying non-fatal failures don't propagate
- **Coverage**: 80% minimum enforced

## Gaps Identified for Phases 4-7

1. **No groupKey/dedup columns** on userNotifications
2. **No notificationOccurrences table** for group expansion
3. **No notification preferences table** (per-user channel/category settings)
4. **No alert rules table** (admin-configurable thresholds)
5. **No escalation policies table**
6. **No unified query layer** across userNotifications + orchestratorNotifications + Guardian
7. **No email delivery** for notifications (only verification/password reset emails exist)
8. **No webhook delivery** infrastructure
9. **No notification templates** with i18n
10. **No retention/cleanup job** for old notifications
11. **No feature flags** for gradual rollout of notification features
12. **Missing SSE reconnection logic** on frontend (onerror closes without retry)
13. **Missing orchestratorNotifications index** for userId+createdAt DESC
14. **Enum gap**: PostgreSQL notification_type missing direct_message and urgent_message values
