# Feature 049: Enterprise Notification System — Usage Guide

## Overview

The enterprise notification system adds deduplication, user preferences, escalation policies, multi-channel delivery (email, webhook), a unified admin dashboard, and health monitoring to SmartSpecPro's existing notification infrastructure.

## Feature Flags

All features are gated behind tenant-scoped feature flags. Enable them incrementally via `/admin/settings`:

| Flag | Controls | Recommended Rollout Order |
|------|----------|--------------------------|
| `notificationDedupEnabled` | Notification grouping & dedup | 1st — monitor 24h |
| `notificationPreferencesEnabled` | Per-category user preferences | 2nd (with escalation) |
| `notificationEscalationEnabled` | Escalation policies for critical alerts | 2nd (with preferences) |
| `notificationUnifiedCenter` | Admin notification dashboard | 3rd — after unified query verified |
| `notificationEmailDelivery` | Email delivery channel | 4th (external side-effects) |
| `notificationWebhookDelivery` | Webhook delivery channel | 4th (external side-effects) |

## Key Endpoints

### tRPC Procedures

| Procedure | Auth | Description |
|-----------|------|-------------|
| `monitoring.getNotifications` | user | Get user's notifications |
| `monitoring.markNotificationRead` | user | Mark notification as read |
| `monitoring.dismissNotification` | user | Dismiss notification |
| `monitoring.getUnifiedNotifications` | admin | Query unified notifications (all sources) |
| `monitoring.getUnifiedStats` | admin | Dashboard statistics |
| `monitoring.notificationHealth` | admin | Health check probe results |
| `notificationPreferences.get` | user | Get user's notification preferences |
| `notificationPreferences.upsert` | user | Save notification preferences |
| `alertRules.*` | admin | CRUD for alert rules |
| `escalationPolicies.*` | admin | CRUD for escalation policies |
| `notificationWebhooks.*` | admin | CRUD for notification webhooks |

### HTTP Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/internal/notifications/admin-broadcast` | Bearer token | Python backend → Node.js admin broadcast |
| GET | `/api/notifications/stream` | JWT cookie | SSE real-time notification stream |

## Admin Pages

| Page | Path | Feature Flag |
|------|------|-------------|
| Notification Center | `/admin/notifications` | `notificationUnifiedCenter` |
| Alert Rules | `/admin/alert-rules` | `notificationPreferencesEnabled` |

## User Settings

The notification preferences tab is embedded in `/settings` (no separate route). Users can configure:
- Per-category channel toggles (in-app, email, telegram)
- Minimum severity threshold per category
- Category mute

## Background Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Escalation check | Every 5 min (BullMQ) | Escalate unacknowledged critical notifications |
| Email digest | Hourly (BullMQ) | Batch non-critical email notifications |
| Retention cleanup | Daily 03:00 UTC (BullMQ) | Age-based + per-user-cap notification cleanup |

## Health Checks

Access via `trpc.monitoring.notificationHealth`:

```json
{
  "healthy": true,
  "probes": {
    "redisPubSub": { "healthy": true, "latencyMs": 3 },
    "adminBroadcast": { "healthy": true, "errorRate": 0 },
    "sseConnections": { "count": 12, "healthy": true }
  }
}
```

Alert thresholds:
- Redis pub/sub: 5s timeout
- Admin broadcast: >10% error rate over 5-minute window
- SSE connections: >500 concurrent

## Database Tables

| Table | Purpose |
|-------|---------|
| `userNotifications` | Core notification storage (extended with dedup columns) |
| `notificationOccurrences` | Dedup occurrence snapshots |
| `notificationPreferences` | Per-user per-category delivery preferences |
| `alertRules` | Admin-defined metric alert rules |
| `escalationPolicies` | Escalation targets and timing |
| `notificationWebhooks` | Webhook endpoint configurations |

## i18n

44 translation keys available in both English (`en.ts`) and Thai (`th.ts`) under the `notifications.*` namespace:
- `notifications.category.*` — 10 category labels
- `notifications.settings.*` — 7 preference UI labels
- `notifications.alertRules.*` — 8 alert rule labels
- `notifications.escalation.*` — 4 escalation labels
- `notifications.webhooks.*` — 7 webhook labels
- `notifications.admin.*` — 5 admin dashboard labels
- `notifications.group.*` — 3 dedup group labels

## Key Source Files

| Component | File |
|-----------|------|
| Feature flags | `apps/web/shared/featureFlags.ts` |
| Notification service | `apps/web/server/services/notificationService.ts` |
| Unified query | `apps/web/server/services/unifiedNotificationService.ts` |
| Email delivery | `apps/web/server/services/notificationEmailService.ts` |
| Webhook delivery | `apps/web/server/services/notificationWebhookService.ts` |
| Health checks | `apps/web/server/services/notificationHealthChecks.ts` |
| SSE stream | `apps/web/server/routes/notificationStream.ts` |
| Escalation job | `apps/web/server/jobs/escalationJob.ts` |
| Template service | `apps/web/server/services/notificationTemplateService.ts` |
| Retention job | `apps/web/server/services/notificationRetentionJob.ts` |
| Monitoring router | `apps/web/server/routers/monitoring.ts` |
| Admin dashboard page | `apps/web/client/src/pages/AdminNotifications.tsx` |
| Alert rules page | `apps/web/client/src/pages/AdminAlertRules.tsx` |
| Menu entries | `packages/shared/src/constants/menu.ts` |
