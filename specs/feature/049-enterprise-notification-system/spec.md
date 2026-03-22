# Feature 049: Enterprise Notification System

## Problem Statement

SmartSpecPro's notification system was built incrementally and scores **29/84** on the enterprise notification scorecard. Users report:

1. **Clicking alerts yields no actionable context** — notifications show generic titles like "Media Job Completed" without job ID, duration, cost, error details, or direct links.
2. **No way to investigate past alerts** — only the last 20 unread items are visible in the dropdown. No search, filter, or history.
3. **Five disconnected notification subsystems** (Sonner toasts, `userNotifications` DB, `orchestratorNotifications` DB, Guardian in-memory alerts, Python monitoring logs) with no unified experience.
4. **Python backend alerts never reach users** — email, Slack, Discord, webhook delivery functions are TODO stubs.
5. **Polling-only updates** — 30-second polling interval means users miss time-sensitive alerts.
6. **Brittle action routing** — frontend uses `n.title?.includes("Media Job")` string matching to infer navigation links.

**Business impact:**
- Admins cannot respond to system incidents quickly (no real-time push, no severity filtering)
- Users waste time navigating manually after receiving vague notifications
- Python monitoring alerts (high error rate, slow API, revenue anomaly) are invisible to operations

## Current Architecture

### Data Flow (Before)

```
Backend Events                              Frontend
┌────────────────┐                    ┌──────────────────────┐
│ mediaJobs.ts   │──createNotif()───▶ │ userNotifications DB │
│ workflow.ts    │  (title + content  │ (7 fields only)      │
│ agency.ts      │   no metadata)     └──────────┬───────────┘
│ skills.ts      │                               │
│ feedback.ts    │                    Poll 30s    │
│ follows.ts     │                               ▼
│ scheduler.ts   │                    ┌──────────────────────┐
└────────────────┘                    │ GlobalNotificationBell│
                                      │ (string matching for │
Python Backend                        │  action links)       │
┌────────────────┐                    └──────────────────────┘
│ alerts.py      │──log only──▶ /dev/null (never reaches UI)
└────────────────┘

Sonner Toasts ──▶ transient (no history, no persistence)
Guardian Alerts ──▶ in-app + email/slack (incidentId not attached to notification)
Orchestrator Notifications ──▶ separate DB table (not shown in bell dropdown)
```

### Database Schema (Before)

```sql
-- userNotifications: 7 fields, no metadata
CREATE TABLE user_notifications (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id),
  type notification_type NOT NULL,      -- scheduled_message|follow_request|alert|system
  title VARCHAR(255) NOT NULL,
  content TEXT,
  "conversationId" INTEGER REFERENCES conversations(id),
  "scheduledMessageId" INTEGER REFERENCES scheduled_messages(id),
  priority reminder_priority DEFAULT 'normal',  -- low|normal|high|critical
  "isRead" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

### Enterprise Scorecard (Before: 29/84)

| Category | Score | Max | Key Gaps |
|----------|:-----:|:---:|----------|
| Content Quality | 8 | 21 | No source, no action links, no entity context |
| Lifecycle Management | 5 | 18 | Only read/unread; no dismiss, history, escalation |
| Categorization & Grouping | 3 | 12 | Type enum exists but no metadata schemas, no dedup |
| Enterprise Features | 6 | 18 | Bell + Telegram; no preferences, rules, bulk actions |
| Technical Implementation | 7 | 15 | 30s polling; no structured payload; no multi-tenant isolation |

## Scope & Constraints

### In Scope

**Phase 1 — Structured Metadata (COMPLETED)**
- Add `relatedResourceType`, `relatedResourceId`, `actionUrl`, `actionLabel`, `metadata` (JSONB), `isDismissed`, `expiresAt` to `userNotifications`
- Update all 14 notification creation call sites with rich metadata
- Replace frontend string matching with `actionUrl`-based routing
- Migration `0093_naive_namora.sql` applied

**Phase 2 — Enhanced UI (COMPLETED)**
- `NotificationDetailPanel` component showing full context, error details, metrics, source
- `/notifications` history page with search, type/priority/read filters, pagination
- `getNotificationHistory` tRPC endpoint with filters + pagination
- `dismissNotification` tRPC endpoint

**Phase 3 — Python Alerts + Real-time (COMPLETED)**
- Python `alerts.py`: Slack, Discord, webhook delivery via `httpx`
- New `IN_APP` channel forwarding to Node.js `/api/internal/notifications/admin-broadcast`
- Redis pub/sub for real-time notification push
- SSE endpoint `/api/notifications/stream`
- Frontend `EventSource` with polling fallback

**Phase 4 — Alert Deduplication & Grouping (NEW)**
- Group repeated alerts by `groupKey`
- Sliding window dedup (5-min default, configurable per category)
- UI expansion to see individual occurrences within a group

**Phase 5 — Notification Preferences & Rules (NEW)**
- Per-user notification preferences (opt-in/out per category + channel)
- Admin-configurable alert thresholds
- Escalation policies for unacknowledged critical alerts

**Phase 6 — Unified Notification Center (NEW)**
- Merge `orchestratorNotifications` into `userNotifications` with a compatibility layer
- Surface Guardian alert metadata (`incidentId`, `ruleId`, `sensorId`) in notification UI
- Admin notification management dashboard with analytics

**Phase 7 — Delivery Channels Expansion (NEW)**
- Email notifications with digest mode (hourly/daily batched)
- Webhook delivery for external integrations
- Notification templates with localization (EN/TH)

### Out of Scope
- Push notifications (mobile/desktop) — requires native app integration
- SMS delivery — cost/compliance considerations defer to future
- Custom notification sounds — desktop only, low priority
- Replacing Sonner toasts — they serve a different UX purpose (transient feedback)

## Technical Design

### Phase 4: Alert Deduplication & Grouping

**Problem:** Noisy events (e.g., 50 failed media jobs in 2 minutes) flood the notification list.

#### Schema Changes

```typescript
// Add to userNotifications
groupKey: varchar("groupKey", { length: 200 }),
occurrenceCount: integer("occurrenceCount").default(1).notNull(),
firstOccurredAt: timestamp("firstOccurredAt", { withTimezone: true }).defaultNow().notNull(),
lastOccurredAt: timestamp("lastOccurredAt", { withTimezone: true }).defaultNow().notNull(),
```

Index:
```sql
CREATE INDEX idx_notifications_group_key
  ON user_notifications("groupKey", "createdAt" DESC)
  WHERE "groupKey" IS NOT NULL;
```

#### Dedup Logic in `createNotification()`

```typescript
interface CreateNotificationParams {
  // ... existing fields ...
  groupKey?: string;          // e.g. "media_job_failure:user_123"
  dedupWindowMinutes?: number; // default 5
}

async function createNotification(params) {
  // If groupKey is set, check for existing notification in dedup window
  if (params.groupKey) {
    const cutoff = new Date(Date.now() - (params.dedupWindowMinutes ?? 5) * 60_000);
    const [existing] = await db
      .select()
      .from(userNotifications)
      .where(and(
        eq(userNotifications.userId, params.userId),
        eq(userNotifications.groupKey, params.groupKey),
        gt(userNotifications.lastOccurredAt, cutoff),
        eq(userNotifications.isDismissed, false),
      ))
      .orderBy(desc(userNotifications.lastOccurredAt))
      .limit(1);

    if (existing) {
      // Update existing notification instead of creating new
      await db.update(userNotifications)
        .set({
          occurrenceCount: sql`${userNotifications.occurrenceCount} + 1`,
          lastOccurredAt: new Date(),
          content: params.content, // Update with latest content
          metadata: params.metadata, // Update with latest metadata
          isRead: false, // Re-surface to unread
        })
        .where(eq(userNotifications.id, existing.id));

      return { notificationId: existing.id, deduplicated: true };
    }
  }

  // Otherwise create new notification (existing flow)
  // ... set groupKey, occurrenceCount=1, firstOccurredAt=now, lastOccurredAt=now
}
```

#### Group Keys by Category

| Notification Source | Group Key Pattern | Window |
|---|---|---|
| Media job failure (per user) | `media_job_failure:${userId}` | 10 min |
| Workflow publish request | `workflow_publish:${templateId}` | 60 min |
| LLM rate limit | `llm_rate_limit:${provider}` | 5 min |
| High error rate (Python) | `python_alert:high_error_rate` | 10 min |
| Slow response (Python) | `python_alert:slow_response_time` | 5 min |
| Feedback ticket | — (no dedup) | — |
| Follow request | — (no dedup) | — |

#### Frontend Grouping Display

```
┌─────────────────────────────────────────────┐
│ ●  Media Job Failed (×7)                5m  │  ← occurrence badge
│    Latest: job abc-123 timeout...           │
│    [Expand group ▼]                         │
│                                             │
│    ├── abc-123: timeout after 30s      5m   │  ← individual items
│    ├── def-456: quota exceeded         3m   │
│    └── ghi-789: invalid prompt         1m   │
└─────────────────────────────────────────────┘
```

#### API Changes

```typescript
// getNotificationHistory — add group expansion
getGroupOccurrences: protectedProcedure
  .input(z.object({
    groupKey: z.string(),
    limit: z.number().min(1).max(50).default(10),
  }))
  .query(async ({ ctx, input }) => {
    // Return individual occurrences for this group
    // from a separate occurrence log table or from audit logs
  }),
```

---

### Phase 5: Notification Preferences & Rules

**Problem:** Users get all notifications regardless of relevance. Admins cannot configure alert thresholds.

#### Notification Preferences Table

```typescript
export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id, { onDelete: "cascade" }).notNull(),

  /** Category to configure */
  category: varchar("category", { length: 50 }).notNull(),
  // Values: "system_health", "media_jobs", "workflow", "skill", "feedback",
  //         "agency", "follow", "scheduled", "security", "business"

  /** Channel settings — which channels to deliver on */
  inApp: boolean("inApp").default(true).notNull(),
  email: boolean("email").default(false).notNull(),
  telegram: boolean("telegram").default(false).notNull(),

  /** Minimum severity to notify (null = all) */
  minSeverity: reminderPriorityEnum("minSeverity"),

  /** Muted until (for temporary snooze) */
  mutedUntil: timestamp("mutedUntil", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("notification_preferences_user_category").on(t.userId, t.category),
]);
```

#### Alert Rules Table (Admin-Configurable)

```typescript
export const alertRules = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),

  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  /** Condition: metric > threshold for N minutes */
  metricName: varchar("metricName", { length: 100 }).notNull(),
  // Values: "error_rate", "response_time_ms", "queue_depth",
  //         "credit_balance", "disk_usage", "concurrent_users"
  operator: varchar("operator", { length: 10 }).notNull(), // ">", "<", ">=", "<=", "=="
  threshold: doublePrecision("threshold").notNull(),
  windowMinutes: integer("windowMinutes").default(5).notNull(),

  /** Action */
  severity: reminderPriorityEnum("severity").default("high").notNull(),
  channels: jsonb("channels").$type<string[]>().default(["in_app"]).notNull(),
  // Values: ["in_app", "email", "slack", "telegram", "webhook"]

  /** Targeting */
  targetRole: varchar("targetRole", { length: 20 }), // null = all admins
  targetUserId: integer("targetUserId"),

  /** Cooldown */
  cooldownMinutes: integer("cooldownMinutes").default(10).notNull(),
  lastTriggeredAt: timestamp("lastTriggeredAt", { withTimezone: true }),

  isEnabled: boolean("isEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Escalation Policy

```typescript
export const escalationPolicies = pgTable("escalation_policies", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),

  name: varchar("name", { length: 100 }).notNull(),

  /** Trigger: if notification with this severity is unacknowledged for N minutes */
  triggerSeverity: reminderPriorityEnum("triggerSeverity").notNull(),
  triggerMinutes: integer("triggerMinutes").notNull(), // e.g., 15 = escalate after 15 min

  /** Escalation action */
  escalateToRole: varchar("escalateToRole", { length: 20 }), // "domain_admin"
  escalateToUserId: integer("escalateToUserId"),
  escalateChannels: jsonb("escalateChannels").$type<string[]>().default(["email", "in_app"]),
  escalateMessage: text("escalateMessage"),

  isEnabled: boolean("isEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Preference-Aware Delivery in `createNotification()`

```typescript
async function createNotification(params) {
  // 1. Determine category from relatedResourceType or type
  const category = mapToCategory(params.relatedResourceType, params.type);

  // 2. Check user preferences
  const prefs = await getUserNotificationPreferences(params.db, params.userId, category);

  // 3. Check if muted or below minimum severity
  if (prefs?.mutedUntil && prefs.mutedUntil > new Date()) return null;
  if (prefs?.minSeverity && severityRank(params.priority) < severityRank(prefs.minSeverity)) return null;

  // 4. Deliver to enabled channels
  if (prefs?.inApp !== false) {
    // Insert to DB (existing flow)
  }
  if (prefs?.email) {
    // Enqueue email delivery
  }
  if (prefs?.telegram) {
    // Enqueue Telegram delivery (existing flow)
  }
}
```

#### Frontend: Notification Preferences Page

```
/settings/notifications
┌─────────────────────────────────────────────────────────────┐
│ Notification Preferences                                     │
│                                                              │
│ Category          In-App    Email    Telegram    Min Level   │
│ ─────────────────────────────────────────────────────────── │
│ System Health      [✓]      [✓]      [ ]       High ▼      │
│ Media Jobs         [✓]      [ ]      [ ]       Normal ▼    │
│ Workflows          [✓]      [ ]      [ ]       Normal ▼    │
│ Skills             [✓]      [ ]      [ ]       All ▼       │
│ Feedback           [✓]      [✓]      [ ]       All ▼       │
│ Agency             [✓]      [ ]      [ ]       Normal ▼    │
│ Follows            [✓]      [ ]      [ ]       All ▼       │
│ Scheduled Alerts   [✓]      [✓]      [✓]       All ▼       │
│ Security           [✓]      [✓]      [✓]       All ▼       │
│                                                              │
│ [Save Preferences]                                           │
└─────────────────────────────────────────────────────────────┘
```

#### Admin: Alert Rules Management

```
/admin/alert-rules
┌────────────────────────────────────────────────────────────────────┐
│ Alert Rules                                               [+ New] │
│                                                                    │
│ Rule                 Metric            Threshold   Cooldown   On  │
│ ────────────────────────────────────────────────────────────────── │
│ High Error Rate      error_rate        > 5%        10 min    [✓] │
│ Slow Response        response_time     > 2000ms    5 min     [✓] │
│ Queue Backlog        queue_depth       > 500       15 min    [✓] │
│ Low Credits          credit_balance    < 100       60 min    [✓] │
│ Disk Usage           disk_usage_pct    > 90%       30 min    [ ] │
│                                                                    │
│ Escalation Policies                                       [+ New] │
│ ────────────────────────────────────────────────────────────────── │
│ Critical unacked     critical          15 min → domain_admin [✓] │
│ High unacked         high              60 min → email all    [✓] │
└────────────────────────────────────────────────────────────────────┘
```

---

### Phase 6: Unified Notification Center

**Problem:** 3 notification tables (`userNotifications`, `orchestratorNotifications`, Guardian in-memory) create a fragmented experience.

#### Strategy: Single Query Interface, Multiple Sources

Rather than migrating all data into one table (risky), create a **unified query layer** that reads from all sources:

```typescript
// server/services/unifiedNotificationService.ts

interface UnifiedNotification {
  id: string;             // "user:123" or "orch:abc-456"
  source: "user" | "orchestrator" | "guardian";
  userId: number;
  type: string;
  title: string;
  content?: string;
  priority: string;
  severity?: string;
  isRead: boolean;
  isDismissed: boolean;
  actionUrl?: string;
  actionLabel?: string;
  relatedResourceType?: string;
  relatedResourceId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

async function getUnifiedNotifications(
  db: DrizzleDB,
  userId: number,
  opts: {
    limit: number;
    offset: number;
    sources?: ("user" | "orchestrator" | "guardian")[];
    severity?: string;
    search?: string;
  }
): Promise<{ items: UnifiedNotification[]; total: number }> {
  // 1. Query userNotifications (primary)
  // 2. Query orchestratorNotifications (if user has team memberships)
  // 3. Merge, sort by createdAt DESC, apply pagination
  // 4. Return unified result
}
```

#### Guardian Metadata Forwarding

Currently, Guardian alerts insert into `userNotifications` but lose their rich metadata (`incidentId`, `ruleId`, `sensorId`, `actionTaken`). Fix by including these in the `metadata` JSONB:

```typescript
// In virtualAdmin/notifier.ts
await createNotification({
  db,
  userId: admin.id,
  type: "alert",
  title: `[${severity.toUpperCase()}] ${notification.title}`,
  content: notification.message,
  priority: severityToPriority(severity),
  relatedResourceType: "incident",
  relatedResourceId: String(notification.incidentId),
  actionUrl: `/admin/system-guardian?incident=${notification.incidentId}`,
  actionLabel: "View Incident",
  metadata: {
    source: `guardian.${notification.sensorId}`,
    eventId: String(notification.incidentId),
    relatedItems: {
      ruleId: notification.ruleId,
      sensorId: notification.sensorId,
      actionTaken: notification.actionTaken ?? "none",
    },
  },
});
```

#### Admin Notification Dashboard

```
/admin/notifications
┌────────────────────────────────────────────────────────────────────┐
│ Notification Center (Admin)                                        │
│                                                                    │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│ │ Total      │  │ Unread     │  │ Critical   │  │ Today      │  │
│ │    1,247   │  │    23      │  │    2       │  │    89      │  │
│ └────────────┘  └────────────┘  └────────────┘  └────────────┘  │
│                                                                    │
│ Source Breakdown          Severity Distribution                    │
│ ┌──────────────────┐     ┌──────────────────┐                    │
│ │ User Notifs  892 │     │ Critical    12   │                    │
│ │ Orchestrator 289 │     │ High        87   │                    │
│ │ Guardian      66 │     │ Normal     934   │                    │
│ └──────────────────┘     │ Low        214   │                    │
│                           └──────────────────┘                    │
│                                                                    │
│ [Filter: All Sources ▼] [Severity: All ▼] [Date: Last 7d ▼]     │
│                                                                    │
│ ────────────────────────────────────────────────────────────────── │
│ (Unified notification list with detail panel)                     │
└────────────────────────────────────────────────────────────────────┘
```

---

### Phase 7: Delivery Channels Expansion

#### Email Delivery

```typescript
// server/services/notificationEmailService.ts

interface EmailNotificationConfig {
  mode: "immediate" | "digest";
  digestFrequency?: "hourly" | "daily";  // for digest mode
  digestHour?: number;                    // 0-23, for daily digest
}

// Immediate: send email right away for high/critical
async function sendNotificationEmail(
  userId: number,
  notification: { title: string; content: string; actionUrl?: string; priority: string },
) {
  const user = await getUserById(userId);
  if (!user?.email) return;

  await emailService.send({
    to: user.email,
    subject: `[${notification.priority.toUpperCase()}] ${notification.title}`,
    template: "notification",
    variables: {
      title: notification.title,
      content: notification.content,
      actionUrl: notification.actionUrl
        ? `${ENV.publicUrl}${notification.actionUrl}`
        : undefined,
      priority: notification.priority,
      unsubscribeUrl: `${ENV.publicUrl}/settings/notifications`,
    },
  });
}

// Digest: batch low/normal notifications
// BullMQ recurring job runs at configured frequency
// Collects unread notifications since last digest, sends one email
async function sendNotificationDigest(userId: number) {
  const since = await getLastDigestTime(userId);
  const notifications = await getUnreadNotificationsSince(userId, since);
  if (notifications.length === 0) return;

  await emailService.send({
    to: user.email,
    subject: `SmartSpecPro: ${notifications.length} notification${notifications.length > 1 ? "s" : ""}`,
    template: "notification-digest",
    variables: {
      notifications: notifications.map(n => ({
        title: n.title,
        content: n.content?.slice(0, 200),
        priority: n.priority,
        actionUrl: n.actionUrl ? `${ENV.publicUrl}${n.actionUrl}` : undefined,
        time: n.createdAt,
      })),
      unsubscribeUrl: `${ENV.publicUrl}/settings/notifications`,
    },
  });
}
```

#### Webhook Delivery

```typescript
// server/services/notificationWebhookService.ts

// Admin configures webhook endpoints per tenant
export const notificationWebhooks = pgTable("notification_webhooks", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),

  name: varchar("name", { length: 100 }).notNull(),
  url: text("url").notNull(),
  secret: text("secret"),           // HMAC-SHA256 signing secret (encrypted)

  /** Filter: which categories/severities to forward */
  categories: jsonb("categories").$type<string[]>(),  // null = all
  minSeverity: reminderPriorityEnum("minSeverity"),    // null = all

  isEnabled: boolean("isEnabled").default(true).notNull(),
  lastDeliveredAt: timestamp("lastDeliveredAt", { withTimezone: true }),
  failureCount: integer("failureCount").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

// Webhook payload format
interface WebhookPayload {
  event: "notification.created";
  timestamp: string;  // ISO 8601
  notification: {
    id: number;
    type: string;
    title: string;
    content: string;
    priority: string;
    relatedResourceType?: string;
    relatedResourceId?: string;
    actionUrl?: string;
    metadata?: Record<string, any>;
    createdAt: string;
  };
}

// Delivery with retry
async function deliverWebhook(webhookId: number, payload: WebhookPayload) {
  // Sign payload with HMAC-SHA256
  // POST with 3 retries, exponential backoff (1s, 5s, 30s)
  // On 3 consecutive failures, disable webhook and notify admin
}
```

#### Notification Templates (i18n)

```typescript
// server/services/notificationTemplateService.ts

// Templates are stored as locale-keyed objects
const templates: Record<string, Record<string, { title: string; content: string }>> = {
  "media_job.completed": {
    en: {
      title: "Media Job Completed",
      content: "Your {mediaType} generation job completed in {duration}. Output: {outputInfo}.",
    },
    th: {
      title: "งาน Media เสร็จสมบูรณ์",
      content: "งานสร้าง {mediaType} ของคุณเสร็จใน {duration} ผลลัพธ์: {outputInfo}",
    },
  },
  "media_job.failed": {
    en: {
      title: "Media Job Failed",
      content: "Your {mediaType} job failed: {errorMessage}.",
    },
    th: {
      title: "งาน Media ล้มเหลว",
      content: "งานสร้าง {mediaType} ล้มเหลว: {errorMessage}",
    },
  },
  // ... more templates for each notification type
};

function renderNotification(
  templateKey: string,
  locale: string,
  variables: Record<string, string>,
): { title: string; content: string } {
  const tpl = templates[templateKey]?.[locale] ?? templates[templateKey]?.en;
  if (!tpl) return { title: templateKey, content: "" };

  return {
    title: tpl.title.replace(/\{(\w+)\}/g, (_, k) => variables[k] ?? `{${k}}`),
    content: tpl.content.replace(/\{(\w+)\}/g, (_, k) => variables[k] ?? `{${k}}`),
  };
}
```

---

## Security Hardening (MANDATORY)

All security fixes below were identified during audit and implemented in Phase 3.1. These constraints MUST be maintained across all future phases.

### S1: actionUrl Sanitization

`actionUrl` is stored as `text` and rendered in `onClick → setLocation()`. Malicious protocols must be blocked at every layer:

**Backend (`notificationService.ts`):**
```typescript
function sanitizeActionUrl(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const lower = url.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") ||
      lower.startsWith("vbscript:") || lower.startsWith("blob:")) {
    return undefined;
  }
  // Only relative paths (/...) and https:// URLs allowed
  if (url.startsWith("/") || lower.startsWith("https://")) return url.trim();
  return undefined;
}
```

**Frontend (`GlobalAlerts.tsx`, `Notifications.tsx`):**
```typescript
function safeNavigate(url: string, setLocation: (url: string) => void) {
  const lower = url.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") ||
      lower.startsWith("vbscript:") || lower.startsWith("blob:")) return;
  setLocation(url);
}
```

**Rule:** Every new `actionUrl` consumer MUST use `safeNavigate()`. Never render `actionUrl` as `<a href>`.

### S2: admin-broadcast Rate Limiting

The `/api/internal/notifications/admin-broadcast` endpoint is rate-limited to **20 requests per minute** using an in-process sliding window. This prevents a compromised Python backend from flooding admin notification inboxes.

### S3: Internal Token Validation

`verifyInternalBearerToken()` enforces `token.length >= 32` to prevent empty-string bypass when `SMARTSPEC_WEB_GATEWAY_TOKEN` is misconfigured. A startup assertion SHOULD fail fast if the token is missing or too short.

### S4: SSE Security

- **Connection cap:** Max 5 SSE connections per user. Oldest connection force-closed when limit reached. Prevents Redis subscriber leak from reconnection loops.
- **Message re-serialization:** All Redis pub/sub messages are `JSON.parse()` → `JSON.stringify()` before writing to SSE stream. Prevents SSE frame injection via embedded `\n\n`.
- **No userId in connected event:** Initial SSE event sends `{"status":"connected"}` only, not `{"userId":N}`.

### S5: Metadata Validation

The admin-broadcast endpoint validates `metadata` with a strict Zod schema before passing to `createNotification()`:
- `eventId`: max 100 chars
- `errorDetails.errorMessage`: max 500 chars (also truncated in `sanitizeMetadata()`)
- `source`: max 200 chars
- No extra keys allowed (`.strict()`)

### S6: Phase 4 — Dedup Concurrency Safety (MUST)

The SELECT-then-UPDATE dedup pattern has a race condition under concurrent load. **Phase 4 MUST use one of:**

**Option A (recommended): Unique partial index + ON CONFLICT**
```sql
CREATE UNIQUE INDEX idx_notif_dedup_active
  ON user_notifications("userId", "groupKey")
  WHERE "isDismissed" = false AND "groupKey" IS NOT NULL;
```
```typescript
await db.insert(userNotifications).values(values)
  .onConflictDoUpdate({
    target: [userNotifications.userId, userNotifications.groupKey],
    set: {
      occurrenceCount: sql`${userNotifications.occurrenceCount} + 1`,
      lastOccurredAt: new Date(),
      content: values.content,
      metadata: values.metadata,
      isRead: false,
    },
  });
```

**Option B: Redis distributed lock**
```typescript
const lockKey = `notif:dedup:${params.userId}:${params.groupKey}`;
const lock = await redis.set(lockKey, "1", "NX", "EX", dedupWindowSeconds);
// If lock acquired → SELECT existing, then UPDATE or INSERT
// If lock not acquired → wait and retry once
```

### S7: Phase 5 — Operator Allowlist (MUST)

`alertRules.operator` MUST use a TypeScript enum, never interpolated into expressions:
```typescript
const OPERATORS = ["gt", "lt", "gte", "lte", "eq"] as const;
type AlertOperator = typeof OPERATORS[number];

function evaluate(value: number, op: AlertOperator, threshold: number): boolean {
  switch (op) {
    case "gt": return value > threshold;
    case "lt": return value < threshold;
    case "gte": return value >= threshold;
    case "lte": return value <= threshold;
    case "eq": return value === threshold;
  }
}
```

### S8: Phase 6 — Tenant Isolation (MUST)

The unified query MUST include `AND tenantId = ctx.tenantId` in every subquery. Cross-tenant notification leakage is a data breach.

### S9: Phase 7 — Webhook Security (MUST)

- **Secret storage:** Column MUST be named `secretEncrypted` and use `encrypt()` from `crypto.ts` (AES-256-GCM via `LLM_ENCRYPTION_KEY`)
- **SSRF prevention:** Webhook URLs MUST be validated:
  ```typescript
  function isAllowedWebhookUrl(url: string): boolean {
    const parsed = new URL(url);
    if (!["https:"].includes(parsed.protocol)) return false;
    // Block private/loopback ranges after DNS resolution
    // 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
    return true;
  }
  ```
- **HMAC signing:** Use `crypto.createHmac("sha256", decryptedSecret).update(body).digest("hex")` in `X-Signature-256` header

---

## Data Privacy & GDPR Compliance

### PII Classification for `metadata` JSONB

| Field | PII Risk | Policy |
|-------|----------|--------|
| `eventId` | None | Retain with notification |
| `source` | None | Retain with notification |
| `errorDetails.errorCode` | None | Retain with notification |
| `errorDetails.errorMessage` | LOW — may contain user input | Truncate to 500 chars; auto-redact after 90 days |
| `metrics.*` | LOW — financial metrics | Scrub `revenue_*` fields before external logging |
| `retryInfo.*` | None | Retain with notification |
| `relatedItems.*` | MEDIUM — may contain names/IDs | Retain; purge on account deletion |

### Data Lifecycle

- **Account deletion:** `ON DELETE CASCADE` on `userId` foreign key handles row deletion. No additional action needed for `metadata` JSONB since the entire row is deleted.
- **Data export (GDPR Article 20):** Notifications SHOULD be included in user data export. Export endpoint: `GET /api/user/export` → includes `user_notifications` rows.
- **Right to erasure:** Covered by CASCADE deletion. No cross-reference cleanup needed since `relatedItems` contains only IDs, not PII-bearing content.

### Constraints for Callers

**NEVER store in `metadata`:**
- Email addresses, phone numbers, or full names
- API keys, tokens, or passwords (even partial)
- IP addresses or session IDs
- Full error stack traces containing file paths

**ALWAYS:**
- Use resource IDs (not names) in `relatedItems`
- Truncate user-generated content to 200 chars
- Prefer error codes over error messages where possible

---

## Retention Policy & Cleanup

### Retention SLA

| Notification Priority | Max Age | Max Per User |
|---|---|---|
| critical | 365 days | Unlimited |
| high | 180 days | 1000 |
| normal | 90 days | 500 |
| low | 30 days | 200 |

### Cleanup Job

```typescript
// server/jobs/notificationRetentionJob.ts
// BullMQ recurring job — runs daily at 03:00 UTC

async function cleanupExpiredNotifications(db: DrizzleDB) {
  // 1. Delete notifications past their expiresAt
  await db.delete(userNotifications)
    .where(and(
      isNotNull(userNotifications.expiresAt),
      lt(userNotifications.expiresAt, new Date()),
    ));

  // 2. Delete by age per priority
  const retentionDays = { critical: 365, high: 180, normal: 90, low: 30 };
  for (const [priority, days] of Object.entries(retentionDays)) {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    await db.delete(userNotifications)
      .where(and(
        eq(userNotifications.priority, priority),
        lt(userNotifications.createdAt, cutoff),
      ));
  }

  // 3. Per-user row cap — keep newest N per priority
  // (Run as separate SQL to avoid N+1)
}
```

### Dismissed Notification Behavior

- Dismissed notifications are **hidden from default views** (`showDismissed: false` default)
- Dismissed notifications are still **searchable** via history page with `showDismissed: true`
- Dismissed notifications follow the same retention policy — they are NOT exempt from cleanup

---

## Observability

### Metrics (Prometheus-style counters)

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `notification_created_total` | Counter | `type`, `priority`, `source` | Volume tracking |
| `notification_channel_delivery_total` | Counter | `channel`, `status` | Per-channel success/failure rate |
| `notification_channel_failure_total` | Counter | `channel` | Alerting on delivery failures |
| `notification_delivery_lag_ms` | Histogram | `channel` | SSE/Telegram/email delivery latency |
| `notification_sse_connections` | Gauge | — | Active SSE connection count |
| `notification_dedup_hits_total` | Counter | — | How often dedup prevented a new notification |
| `notification_cleanup_rows_deleted` | Counter | `priority` | Retention job effectiveness |

### Structured Logging

All notification events MUST use structured logger (`logger.info` / `logger.warn`):

```typescript
logger.info("notification_created", {
  notificationId, userId, type, priority,
  relatedResourceType, groupKey,
  deduplicated: false,
  channel: "in_app",
});

logger.warn("notification_delivery_failed", {
  notificationId, channel: "telegram",
  error: err.message, // Never log full stack
});
```

### Health Checks

- **Redis pub/sub round-trip:** Periodic probe that publishes a test message to `notifications:health` and verifies receipt within 5 seconds
- **admin-broadcast endpoint:** Alert if non-2xx response rate > 10% in 5 minutes
- **SSE connection count:** Alert if > 500 concurrent connections (resource pressure)

---

## Notification Type Enum Migration (MUST before Phase 4)

The PostgreSQL `notification_type` enum currently has 4 values:
```sql
-- Current: scheduled_message, follow_request, alert, system
```

The `notificationService.ts` TypeScript type includes `direct_message` and `urgent_message` which will cause a **runtime PostgreSQL check violation** if used. Before Phase 4:

```sql
-- Must run OUTSIDE a transaction block (PostgreSQL restriction)
ALTER TYPE notification_type ADD VALUE 'direct_message';
ALTER TYPE notification_type ADD VALUE 'urgent_message';
```

This requires a standalone migration file, not a `drizzle-kit generate` output, because `ALTER TYPE ADD VALUE` cannot run inside a transaction.

---

## Occurrence History Data Model (MUST for Phase 4)

Phase 4 `getGroupOccurrences` needs a data store for individual occurrences within a group. **Decision: Option A — Lightweight occurrence log table.**

```typescript
export const notificationOccurrences = pgTable("notification_occurrences", {
  id: serial("id").primaryKey(),
  /** The grouped notification this occurrence belongs to */
  notificationId: integer("notificationId")
    .references(() => userNotifications.id, { onDelete: "cascade" }).notNull(),
  /** Snapshot of the individual occurrence content */
  content: text("content"),
  metadata: jsonb("metadata").$type<NotificationMetadata>(),
  occurredAt: timestamp("occurredAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_notif_occurrences_parent").on(t.notificationId, t.occurredAt.desc()),
]);
```

**Write path:** When dedup increments `occurrenceCount`, also insert into `notificationOccurrences` with the per-occurrence `content` and `metadata`.

**Read path:** `getGroupOccurrences` queries this table by `notificationId`, ordered by `occurredAt DESC`, limited to 50.

**Retention:** Occurrences follow the parent notification's retention. CASCADE delete handles cleanup.

---

## Feature Flags (MUST define before Phase 4)

All new behaviors MUST be gated behind feature flags in `apps/web/shared/featureFlags.ts`:

| Flag Name | Default | Phase | Controls |
|---|---|---|---|
| `NOTIFICATION_DEDUP_ENABLED` | `false` | 4 | groupKey-based deduplication |
| `NOTIFICATION_PREFERENCES_ENABLED` | `false` | 5 | Per-user preference gating |
| `NOTIFICATION_ESCALATION_ENABLED` | `false` | 5 | Escalation policy enforcement |
| `NOTIFICATION_UNIFIED_CENTER` | `false` | 6 | Unified query across all sources |
| `NOTIFICATION_EMAIL_DELIVERY` | `false` | 7 | Email channel delivery |
| `NOTIFICATION_WEBHOOK_DELIVERY` | `false` | 7 | Webhook channel delivery |

**Rollout strategy:**
1. Deploy code with flag `false` (no behavior change)
2. Enable flag for internal/admin users first
3. Monitor metrics for 24 hours
4. Enable for all users

---

## Dead Letter Queue & Delivery Reliability

### Channel Reliability Classification

| Channel | Reliability | Strategy |
|---|---|---|
| Database (in_app) | At-least-once | Primary write — if this fails, the notification is lost |
| Redis pub/sub (SSE) | At-most-once | Fire-and-forget — SSE is real-time convenience, not persistence |
| Telegram | At-most-once | Fire-and-forget — enqueue failure logged, not retried |
| Email (Phase 7) | At-least-once | BullMQ job with 3 retries, exponential backoff |
| Webhook (Phase 7) | At-least-once | BullMQ job with 3 retries; auto-disable after 3 consecutive failures |

### BullMQ DLQ for Email/Webhook (Phase 7)

```typescript
const notificationDeliveryQueue = new Queue("notification-delivery", {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }, // Keep failed jobs for investigation
  },
});

// Failed jobs visible in admin queue dashboard at /admin/queues
```

### Graceful Degradation

- **Redis down:** SSE connections fail gracefully. Polling remains active (30s interval). Notification creation still works (DB insert).
- **Telegram unavailable:** Logged as warning. No retry. User sees notification in-app.
- **Email service down (Phase 7):** BullMQ retries 3 times. After exhaustion, job moves to failed state. Admin alerted via in-app notification.
- **All channels down except DB:** Notifications still persist in database. User sees them on next page load via polling.

---

## Phase 6: Unified Query Performance Budget

### Expected Volumes

| Source | Rows/user (est.) | Index Required |
|---|---|---|
| `userNotifications` | 50-500 active | `(userId, createdAt DESC)` — exists |
| `orchestratorNotifications` | 10-200 per team run | `(userId, createdAt DESC)` — MUST add |
| Guardian (materialized) | 0-50 active | N/A — in-memory or cached |

### Query Strategy

- Use **cursor-based pagination** (not LIMIT/OFFSET) for the unified result to avoid counting across all sources
- Query each source independently with `LIMIT N+1` (to detect hasMore), merge in-memory, take top N
- Cache unified count per user in Redis with 60s TTL (avoid 3 COUNT queries per page load)

### Index Requirements (MUST add before Phase 6)

```sql
-- orchestratorNotifications: currently missing user+time index
CREATE INDEX idx_orch_notif_user_created
  ON orchestrator_notifications("userId", "createdAt" DESC);
```

---

## SSE Reconnection & Polling Fallback (SHOULD fix)

Current issue: when SSE `onerror` fires, the EventSource is closed and not reopened. The polling fallback only polls `getNotificationCount` (30s), not `getNotifications`.

**Fix for Phase 4:**
```typescript
useEffect(() => {
  let es: EventSource | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 5;

  function connect() {
    es = new EventSource("/api/notifications/stream", { withCredentials: true });
    es.addEventListener("notification", () => {
      utils.scheduledMessages.getNotificationCount.invalidate();
      if (showDropdown) utils.scheduledMessages.getNotifications.invalidate();
    });
    es.addEventListener("connected", () => { reconnectAttempts = 0; });
    es.onerror = () => {
      es?.close();
      if (reconnectAttempts < MAX_RECONNECT) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000);
        reconnectTimer = setTimeout(connect, delay);
        reconnectAttempts++;
      }
      // After MAX_RECONNECT, fall through to polling-only
    };
  }
  connect();

  return () => {
    es?.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}, []);
```

---

## Risk Assessment

| Phase | Change | Risk | Mitigation |
|-------|--------|------|-----------|
| 4 | Add groupKey + dedup fields | LOW | Nullable columns, no data loss |
| 4 | Dedup logic in createNotification | MEDIUM | Feature-flagged; groupKey=null disables |
| 5 | New preferences + alertRules tables | LOW | New tables, no existing data affected |
| 5 | Preference-gated delivery | MEDIUM | Default: all channels enabled; preferences only restrict |
| 5 | Escalation background job | LOW | BullMQ recurring job, isolated |
| 6 | Unified query across 3 tables | MEDIUM | Read-only merge; no schema migration |
| 6 | Guardian metadata forwarding | LOW | Additive change to existing calls |
| 7 | Email delivery | LOW | Opt-in only; existing emailService used |
| 7 | Webhook delivery | MEDIUM | HMAC signing required; auto-disable on failure |
| 7 | i18n templates | LOW | Fallback to English if locale missing |

## Verification Plan

### Phase 4 Tests
- [ ] Repeated `createNotification` with same `groupKey` within 5 min → single notification with occurrenceCount > 1
- [ ] After dedup window expires → new notification created
- [ ] `isDismissed=true` resets dedup (new notification created)
- [ ] Frontend shows "(×N)" badge for grouped notifications
- [ ] Group expansion shows individual occurrences
- [ ] Notifications without `groupKey` behave as before (no dedup)

### Phase 5 Tests
- [ ] User disables email for "media_jobs" → no email sent for media notifications
- [ ] User sets minSeverity=high → normal/low notifications not delivered
- [ ] User snoozes category for 1 hour → notifications resume after expiry
- [ ] Admin creates alert rule: error_rate > 5% → notification fires when threshold crossed
- [ ] Cooldown prevents duplicate rule firings within window
- [ ] Escalation: critical alert unacknowledged for 15 min → domain_admin notified

### Phase 6 Tests
- [ ] `/admin/notifications` shows items from all 3 sources
- [ ] Unified search works across sources
- [ ] Guardian notifications show `incidentId` and `ruleId` in detail panel
- [ ] Orchestrator notifications show `teamId` and `runId` context
- [ ] Dashboard counters match actual notification counts

### Phase 7 Tests
- [ ] Email sent immediately for critical/high notifications (if user opted in)
- [ ] Digest email batches low/normal notifications at configured frequency
- [ ] Webhook receives signed payload; signature verifiable with shared secret
- [ ] Webhook auto-disabled after 3 consecutive failures; admin notified
- [ ] Thai locale renders correctly for all template keys
- [ ] Missing locale falls back to English

## Files Affected

### Phase 4 (5 files)
- `apps/web/drizzle/schema.ts` — Add groupKey, occurrenceCount, firstOccurredAt, lastOccurredAt
- `apps/web/server/services/notificationService.ts` — Dedup logic
- `apps/web/server/routers/scheduledMessages.ts` — getGroupOccurrences endpoint
- `apps/web/client/src/components/GlobalAlerts.tsx` — Group badge + expansion
- `apps/web/client/src/pages/Notifications.tsx` — Group display

### Phase 5 (8+ files)
- `apps/web/drizzle/schema.ts` — notificationPreferences, alertRules, escalationPolicies tables
- `apps/web/server/routers/notificationPreferences.ts` — New CRUD router
- `apps/web/server/routers/alertRules.ts` — New admin router
- `apps/web/server/services/notificationService.ts` — Preference-gated delivery
- `apps/web/server/jobs/escalationJob.ts` — BullMQ job for escalation checks
- `apps/web/client/src/pages/NotificationPreferences.tsx` — User preferences page
- `apps/web/client/src/pages/AdminAlertRules.tsx` — Admin rules management
- `apps/web/server/routers.ts` — Register new routers

### Phase 6 (6 files)
- `apps/web/server/services/unifiedNotificationService.ts` — New unified query layer
- `apps/web/server/services/virtualAdmin/notifier.ts` — Add metadata to Guardian notifications
- `apps/web/server/routers/monitoring.ts` — Unified dashboard endpoints
- `apps/web/client/src/pages/AdminNotifications.tsx` — Admin dashboard
- `apps/web/client/src/components/GlobalAlerts.tsx` — Unified source display
- `apps/web/client/src/pages/Notifications.tsx` — Source filter

### Phase 7 (8+ files)
- `apps/web/server/services/notificationEmailService.ts` — Email delivery + digest
- `apps/web/server/services/notificationWebhookService.ts` — Webhook delivery
- `apps/web/server/services/notificationTemplateService.ts` — i18n templates
- `apps/web/drizzle/schema.ts` — notificationWebhooks table
- `apps/web/server/routers/notificationWebhooks.ts` — Webhook CRUD
- `apps/web/server/jobs/notificationDigestJob.ts` — BullMQ digest job
- `apps/web/client/src/lib/i18n/locales/en.ts` — Notification translations
- `apps/web/client/src/lib/i18n/locales/th.ts` — Notification translations (Thai)

## Dependencies

### Existing (No New Packages)
- `drizzle-orm` + `drizzle-kit` — Schema + migrations
- `ioredis` — Redis pub/sub for SSE
- `bullmq` — Background jobs (escalation, digest)
- `@smartspec/ui` — Radix UI components
- `sonner` — Toast notifications
- `jose` — JWT verification for SSE auth
- `httpx` (Python) — Slack/Discord/webhook delivery

### Environment Variables
- `SLACK_WEBHOOK_URL` — Slack incoming webhook (optional)
- `DISCORD_WEBHOOK_URL` — Discord webhook (optional)
- `ALERT_WEBHOOK_URL` — Generic alert webhook (optional)
- `SMARTSPEC_WEB_GATEWAY_TOKEN` — Internal service-to-service auth (existing)

## Estimated Complexity

| Phase | Effort | Files | Priority | Status |
|-------|--------|:-----:|----------|--------|
| 1: Structured Metadata | Small | 12 | P0 Critical | COMPLETED |
| 2: Enhanced UI | Medium | 5 | P0 Critical | COMPLETED |
| 3: Python Alerts + SSE | Medium | 6 | P1 High | COMPLETED |
| 4: Dedup & Grouping | Small-Medium | 5 | P1 High | Planned |
| 5: Preferences & Rules | Medium-Large | 8+ | P2 Medium | Planned |
| 6: Unified Center | Medium | 6 | P2 Medium | Planned |
| 7: Delivery Channels | Medium | 8+ | P3 Low | Planned |

### Target Scorecard After All Phases

| Category | Before | After Phase 3 | After All Phases | Max |
|----------|:------:|:----:|:---:|:---:|
| Content Quality | 8 | 17 | 20 | 21 |
| Lifecycle Management | 5 | 10 | 17 | 18 |
| Categorization & Grouping | 3 | 5 | 11 | 12 |
| Enterprise Features | 6 | 9 | 17 | 18 |
| Technical Implementation | 7 | 12 | 14 | 15 |
| **Total** | **29** | **53** | **79** | **84** |
| **Rating** | MVP | Functional | **Enterprise-grade** | — |

## Architecture After All Phases

```
                    ┌──────────────────────────────────────┐
                    │         Notification Sources          │
                    └──────────────────────────────────────┘
                    │           │            │             │
              ┌─────▼───┐ ┌────▼────┐ ┌─────▼───┐ ┌──────▼──────┐
              │ Backend │ │ Python  │ │Guardian │ │Orchestrator │
              │ Routers │ │ Alerts  │ │ Notifier│ │  Events     │
              └────┬────┘ └────┬────┘ └────┬────┘ └──────┬──────┘
                   │           │            │             │
                   └───────────┼────────────┼─────────────┘
                               ▼
              ┌────────────────────────────────────────────┐
              │       createNotification() — Central       │
              │                                            │
              │  ┌─────────┐  ┌──────────┐  ┌──────────┐ │
              │  │ Dedup   │  │Preference│  │ Template │ │
              │  │ Engine  │  │  Gate    │  │ Renderer │ │
              │  └────┬────┘  └────┬─────┘  └────┬─────┘ │
              └───────┼───────────┼──────────────┼────────┘
                      │           │              │
        ┌─────────────┼───────────┼──────────────┼──────────┐
        ▼             ▼           ▼              ▼          ▼
  ┌──────────┐ ┌───────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐
  │ Database │ │Redis Pub/ │ │Telegram│ │  Email   │ │Webhook  │
  │ (persist)│ │Sub (SSE)  │ │Service │ │(+digest) │ │(+HMAC)  │
  └────┬─────┘ └─────┬─────┘ └────────┘ └──────────┘ └─────────┘
       │             │
       ▼             ▼
  ┌──────────────────────────────────────────┐
  │         Frontend Notification UI          │
  │                                          │
  │  ┌──────────┐  ┌────────────────────┐   │
  │  │ Bell +   │  │ /notifications     │   │
  │  │ Dropdown │  │ History + Search   │   │
  │  │ + Detail │  │ + Filters          │   │
  │  │ Panel    │  │ + Detail Panel     │   │
  │  └──────────┘  └────────────────────┘   │
  │                                          │
  │  ┌──────────────────────────────────┐   │
  │  │ /settings/notifications          │   │
  │  │ Preferences per category+channel │   │
  │  └──────────────────────────────────┘   │
  │                                          │
  │  ┌──────────────────────────────────┐   │
  │  │ /admin/notifications             │   │
  │  │ Unified center + analytics       │   │
  │  └──────────────────────────────────┘   │
  │                                          │
  │  ┌──────────────────────────────────┐   │
  │  │ /admin/alert-rules               │   │
  │  │ Threshold rules + escalation     │   │
  │  └──────────────────────────────────┘   │
  │                                          │
  │  EventSource (SSE) ◄── Redis pub/sub    │
  │  Polling (30s fallback)                  │
  └──────────────────────────────────────────┘
```
