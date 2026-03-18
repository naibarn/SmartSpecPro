I now have all the context needed. Let me generate the section content.

# Section 05 -- Notification System and SSE Streaming

## Overview

This section implements two closely related subsystems:

1. **GuardianNotifier** -- a multi-channel notification dispatcher that routes guardian events (incidents, approvals, sensor alerts) to the correct delivery channels based on severity.
2. **Guardian SSE endpoint** -- a Server-Sent Events streaming endpoint that pushes real-time guardian events to connected admin browsers via Redis pub/sub.
3. **SystemHealthBanner** -- a global React component that shows a red banner when a CRITICAL incident is active.

Together these allow admins to receive real-time updates about system health through multiple channels (in-app notifications, email, Slack, Telegram, and live SSE streaming).

## Dependencies

- **Section 01 (Schema & System User)**: The `virtual_admin_incidents` and `virtual_admin_approvals` tables must exist. The system user (id -1) and its JWT must be available.
- **Section 03 (Rule Engine)**: The rule engine calls the notifier after creating incidents. The notifier receives incident data and severity from the rule engine.

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/virtualAdmin/notifier.ts` | Multi-channel notification dispatcher |
| `apps/web/server/routes/guardianSSE.ts` | Express SSE streaming endpoint |
| `apps/web/client/src/hooks/useGuardianEvents.ts` | React hook for consuming guardian SSE |
| `apps/web/client/src/components/guardian/SystemHealthBanner.tsx` | Global critical-incident banner |
| `apps/web/server/services/virtualAdmin/__tests__/notifier.test.ts` | Unit tests for notifier |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Register the guardian SSE route |
| `apps/web/client/src/App.tsx` | Mount `SystemHealthBanner` in the app layout |

---

## Tests (Write First)

All tests live in `apps/web/server/services/virtualAdmin/__tests__/notifier.test.ts`. They use Vitest with mock dependencies.

```typescript
// apps/web/server/services/virtualAdmin/__tests__/notifier.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("GuardianNotifier", () => {
  // --- Channel routing by severity ---
  it("info severity -> in-app only");
  it("warning severity -> in-app + email digest");
  it("error severity -> in-app + email immediate + slack");
  it("critical severity -> all channels including telegram");

  // --- Delivery ---
  it("calls createNotification for in-app");
  it("calls emailService for email");
  it("handles email delivery failure with retry");
  it("falls back to email when slack fails");
  it("falls back to in-app when all channels fail");

  // --- Rate limiting ---
  it("respects per-rule cooldown");
  it("respects max 20 emails/hour per tenant");
});
```

Additionally, SSE integration tests (these can be lighter/integration-style, testing the Express handler directly):

```typescript
// apps/web/server/routes/__tests__/guardianSSE.test.ts
import { describe, it } from "vitest";

describe("GuardianSSE", () => {
  it("returns correct SSE headers");
  it("sends heartbeat every 30s");
  it("broadcasts incident created event");
  it("broadcasts approval decided event");
  it("cleans up on client disconnect");
  it("requires admin authentication");
});
```

### Test Strategy Details

**Notifier tests** mock all external dependencies:
- Mock `createNotification` from `apps/web/server/services/notificationService.ts` to verify in-app delivery calls
- Mock a `sendGuardianEmail` helper (wraps the existing nodemailer-based email service) to verify email calls
- Mock Slack webhook HTTP call (a simple `fetch` POST to the webhook URL from `VIRTUAL_ADMIN_SLACK_WEBHOOK`)
- Mock Telegram delivery (reuse existing `enqueueTelegramNotification`)
- Mock Redis `getCacheClient()` for rate-limit counters (email hourly limit tracking)

**SSE tests** create a minimal Express app with the guardian SSE route mounted, then use supertest or a raw HTTP client to verify:
- Response headers include `Content-Type: text/event-stream`
- Heartbeat comments arrive on schedule
- Publishing a message to the Redis `guardian:events` channel results in an SSE event on the response stream
- Unauthenticated requests are rejected

---

## Implementation Details

### 1. GuardianNotifier (`apps/web/server/services/virtualAdmin/notifier.ts`)

This module exports a `GuardianNotifier` class (or a set of functions) responsible for dispatching notifications across multiple channels based on incident severity.

#### Channel Routing Table

| Severity | In-App | Email | Slack | Telegram |
|----------|--------|-------|-------|----------|
| info | Yes | No | No | No |
| warning | Yes | Digest (batched) | No | No |
| error | Yes | Immediate | Yes | No |
| critical | Yes | Immediate | Yes | Yes |

#### Key Design Decisions

**In-app notifications**: Call the existing `createNotification()` function from `apps/web/server/services/notificationService.ts`. The function accepts `db`, `userId`, `type`, `title`, `content`, `priority`. For guardian notifications, the `type` should be `"alert"` or `"system"`, and `userId` should be all admin users for the affected tenant.

To find admin users for a tenant, query: `SELECT id FROM users WHERE tenantId = ? AND role IN ('admin', 'domain_admin')`.

**Email delivery**: The existing `emailService.ts` only has `sendVerificationEmail` and `sendPasswordResetEmail`. The notifier needs a new generic `sendGuardianAlertEmail` helper function within `notifier.ts` itself (or a small helper module). This helper:
- Calls `getSmtpConfig()` pattern from emailService (or import a shared transporter creator)
- Formats an HTML email with incident title, severity badge, message, and a link to the guardian dashboard
- For "digest" mode (warning severity): accumulate notifications in a Redis list (`guardian:email-digest:{tenantId}`) and flush every hour via a scheduled job (can be handled by the scheduler in section 10, or a simple `setInterval`)
- For "immediate" mode (error/critical): send right away

**Rate limiting emails**: Track email count per tenant per hour using Redis: `INCR guardian:email-count:{tenantId}` with `EXPIRE 3600`. If count exceeds 20, skip email delivery and log a warning. The in-app notification still goes through.

**Slack delivery**: If `VIRTUAL_ADMIN_SLACK_WEBHOOK` environment variable is set, POST a JSON payload to the webhook URL. The payload should use Slack Block Kit format with:
- A header block with severity emoji and incident title
- A section block with the incident message
- A context block with timestamp and sensor ID

Use the existing `SlackAdapter` from `apps/web/server/services/channelAdapters/slack.ts` if the tenant has a Slack integration configured, or fall back to the raw webhook URL from the environment variable.

**Telegram delivery**: Reuse the existing `enqueueTelegramNotification` from `apps/web/server/services/telegramService.ts`. Send to all admin users who have linked Telegram.

**Fallback chain**: If a higher-priority channel fails (e.g., Slack webhook returns non-200), fall back to the next channel. The chain is: Slack -> Email -> In-app. In-app is the final fallback and should never fail (it is a DB insert). Each failure is logged but does not block other channels.

**Redis pub/sub for SSE**: After dispatching all channel notifications, the notifier also publishes the event to the Redis `guardian:events` channel so that any connected SSE clients receive a real-time push. Use `getRealtimeClient().publish("guardian:events", JSON.stringify(eventPayload))`.

#### Notifier Interface

```typescript
interface GuardianNotification {
  tenantId: string;
  incidentId: number;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  message: string;
  ruleId: string;
  sensorId: string;
  actionTaken?: string;
  requiresApproval?: boolean;
  approvalId?: number;
}

/**
 * Dispatch a guardian notification to all configured channels
 * based on the severity routing table.
 */
async function dispatchNotification(
  db: DrizzleDB,
  notification: GuardianNotification
): Promise<void>;
```

#### SSE Event Publishing

The notifier publishes structured events to Redis for SSE consumption. Event types:

```typescript
type GuardianEventType =
  | "incident.created"
  | "incident.updated"
  | "incident.resolved"
  | "approval.requested"
  | "approval.decided"
  | "sensor.alert"
  | "feedback.new";

interface GuardianSSEEvent {
  type: GuardianEventType;
  tenantId: string;
  data: Record<string, unknown>;
  timestamp: string; // ISO 8601
}
```

Publish to Redis channel `guardian:events` (global) so the SSE endpoint can filter by tenant.

---

### 2. Guardian SSE Endpoint (`apps/web/server/routes/guardianSSE.ts`)

This is an Express route handler that streams Server-Sent Events to admin clients. It follows the exact same pattern as the existing `publicEventsApi.ts` at `apps/web/server/routes/publicEventsApi.ts`.

#### Endpoint

`GET /api/virtual-admin/events`

#### Authentication

Must verify the requesting user is an admin (role `admin` or `domain_admin`). Use the existing session cookie / JWT auth middleware. Extract `tenantId` from the authenticated user context.

#### Implementation Pattern

Follow the existing SSE pattern from `publicEventsApi.ts`:

1. Set SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
2. Call `res.flushHeaders()`
3. Create a dedicated Redis subscriber via `getRealtimeClient().duplicate()`
4. Subscribe to Redis channel `guardian:events`
5. On message: parse JSON, check if `tenantId` matches the authenticated user (or if user is `domain_admin`, allow all tenants), then write SSE event to response
6. Heartbeat every 30 seconds: `res.write(": heartbeat\n\n")`
7. Max connection duration: 60 minutes, then send `event: close` and end
8. On client disconnect (`req.on("close")`): unsubscribe, quit subscriber, clear timers

#### SSE Event Format

```
event: incident.created
data: {"incidentId":42,"severity":"critical","title":"Celery worker down","tenantId":"abc"}

event: approval.requested
data: {"approvalId":7,"actionType":"restart_celery_worker","incidentId":42}
```

#### Route Registration

In `apps/web/server/_core/index.ts`, import and register the route. It should be placed among the other REST/SSE endpoint registrations (around line 455-460), NOT under the `/v1` public API prefix since this is an internal admin endpoint:

```typescript
import { createGuardianSSERouter } from "../routes/guardianSSE";
// ...
app.use("/api/virtual-admin/events", createGuardianSSERouter());
```

The route factory function returns an Express `Router` with a single `GET /` handler.

---

### 3. Frontend: `useGuardianEvents` Hook (`apps/web/client/src/hooks/useGuardianEvents.ts`)

A React hook that manages an `EventSource` connection to `/api/virtual-admin/events`. It follows the pattern established by `useSSEWorkflowStream.ts` at `apps/web/client/src/hooks/useSSEWorkflowStream.ts`.

#### Behavior

- Opens an `EventSource` connection when the hook mounts (only if user is admin)
- Listens for named events (`incident.created`, `approval.requested`, etc.)
- On receiving an event, invalidates the relevant TanStack Query caches so dashboard components re-fetch:
  - `incident.created` / `incident.updated` / `incident.resolved` -> invalidate `["guardian", "incidents"]`
  - `approval.requested` / `approval.decided` -> invalidate `["guardian", "approvals"]`
  - `sensor.alert` -> invalidate `["guardian", "sensors"]`
  - `feedback.new` -> invalidate `["feedback", "tickets"]`
- Provides a `latestCriticalIncident` state value for use by `SystemHealthBanner`
- Auto-reconnects on disconnect with exponential backoff
- Cleans up EventSource on unmount

#### Interface

```typescript
interface UseGuardianEventsReturn {
  isConnected: boolean;
  latestCriticalIncident: { id: number; title: string; message: string } | null;
  disconnect: () => void;
}

function useGuardianEvents(enabled?: boolean): UseGuardianEventsReturn;
```

---

### 4. SystemHealthBanner (`apps/web/client/src/components/guardian/SystemHealthBanner.tsx`)

A global banner component that renders at the top of the page when a CRITICAL-severity incident is currently active.

#### Behavior

- Consumes `latestCriticalIncident` from `useGuardianEvents()`
- Renders a red/destructive banner bar with the incident title and a "View Details" link to the guardian dashboard
- Auto-dismisses (hides) when the incident is resolved (SSE pushes `incident.resolved` event)
- Only visible to users with admin or domain_admin role
- Uses Framer Motion for slide-in/slide-out animation
- Renders `null` when no critical incident is active

#### Mounting

Add `<SystemHealthBanner />` to the app layout in `apps/web/client/src/App.tsx`, inside the authenticated layout wrapper, above the main content area. It should be conditionally rendered based on user role.

---

### 5. Per-Rule Cooldown for Notifications

The notifier must respect per-rule notification cooldowns to avoid flooding admins. Use Redis to track last notification time per rule:

- Key: `guardian:notify-cooldown:{ruleId}:{tenantId}`
- Value: timestamp of last notification
- TTL: the rule's `cooldownMs` value

Before dispatching, check if the cooldown key exists. If it does and has not expired, skip the notification (but still publish to SSE for dashboard updates). This is separate from the incident cooldown in the rule engine -- this specifically prevents duplicate notifications for the same rule firing repeatedly.

---

### 6. Email Digest Mechanism

For warning-severity notifications, rather than sending individual emails, batch them:

- On each warning notification, push the notification data to a Redis list: `RPUSH guardian:email-digest:{tenantId} <json>`
- A periodic flush (every 60 minutes, driven by `setInterval` in the notifier module or by the scheduler from section 10) reads all items from the list with `LRANGE` + `DEL`, formats them into a single digest email, and sends it
- If the list is empty at flush time, no email is sent
- The digest email groups notifications by sensor and includes a count of occurrences

---

## Configuration

The notifier reads these settings:

| Setting | Source | Default |
|---------|--------|---------|
| `VIRTUAL_ADMIN_SLACK_WEBHOOK` | Environment variable | Not set (Slack disabled) |
| `VIRTUAL_ADMIN_NOTIFICATIONS` | Per-tenant system_settings | `true` |
| Slack channel integration | Tenant's Slack adapter config | Not set |
| SMTP config | system_settings (category: "smtp") | Falls back to console log |
| Email rate limit | Hardcoded | 20 emails/hour/tenant |
| Heartbeat interval | Hardcoded | 30 seconds |
| Max SSE connection | Hardcoded | 60 minutes |

---

## Error Handling

- **Notification channel failure**: Log the error, continue with next channel. Never let a channel failure prevent other channels from firing.
- **Redis pub/sub failure**: Log error. SSE clients will not receive the event but in-app notifications still work (they are DB-based).
- **SSE client disconnect**: Clean up subscriber connection immediately. Do not leak Redis connections.
- **Email service not configured**: Skip email silently (log at debug level). This is expected in development environments.
- **All channels fail**: Log a critical-level error. The incident still exists in the database for dashboard viewing.

---

## Audit Events

The notifier should log these audit events (using the existing audit logger pattern):

- `guardian_notification_sent` -- channel, severity, tenantId, incidentId
- `guardian_notification_failed` -- channel, error message, tenantId, incidentId

These are logged to the JSONL audit file, not to the database, to avoid write amplification during incident storms.