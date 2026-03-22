# Feature 049: Enterprise Notification System — Complete Specification

## Overview

Upgrade SmartSpecPro's notification system from a basic alert mechanism (scorecard 29/84) to an enterprise-grade notification platform (target 79/84). Phases 1-3 (structured metadata, enhanced UI, Python alerts + SSE) are complete. This plan covers Phases 4-7: deduplication & grouping, notification preferences & rules, unified notification center, and delivery channels expansion.

## Current State (Phases 1-3 Complete)

### What Exists
- **userNotifications table** with structured metadata (JSONB), priority, resource linking, action URLs, expiration
- **orchestratorNotifications table** for team-scoped notifications (separate from userNotifications)
- **notificationService.ts** — central `createNotification()` with 3-stage fire-and-forget: DB insert → Telegram enqueue → Redis pub/sub
- **SSE endpoint** (`GET /api/notifications/stream`) with JWT auth, per-user cap (5 connections), Redis subscriber, message re-serialization
- **Admin broadcast** (`POST /api/internal/notifications/admin-broadcast`) — Python→Node.js alert forwarding, rate-limited 20/min
- **Frontend**: GlobalNotificationBell (dropdown + SSE), Notifications page (history + filters + search + detail panel)
- **Python alerts.py**: IN_APP channel forwarding to admin-broadcast endpoint
- **14 notification call sites** across follows, skills, workflow, agency, feedback, mediaJobs, virtualAdmin

### What's Missing (Phases 4-7)
1. No deduplication — repeated events (e.g., 50 media failures) flood notification list
2. No user preferences — all notifications delivered to all channels regardless of user settings
3. No alert rules — admin cannot configure metric-based alert thresholds
4. No escalation — critical unacknowledged alerts are not escalated
5. No unified view — 3 notification subsystems (userNotifications, orchestratorNotifications, Guardian) are fragmented
6. No email delivery for notifications (only verification/password reset emails exist)
7. No webhook delivery infrastructure
8. No notification templates with i18n
9. No retention/cleanup job
10. No feature flags for gradual rollout
11. SSE has no reconnection logic on frontend (onerror closes without retry)

## Stakeholder Decisions

- **Scale**: Medium volume (50-500 notifications/user/day). Dedup windows are meaningful. Cursor pagination deferred to Phase 6.
- **Scope**: All phases (4-7) planned as single implementation with feature-flagged rollout.
- **Escalation**: Critical escalations OVERRIDE user preferences — deliver on ALL available channels.
- **Webhooks**: Both tenant-wide (admin) AND per-user webhook endpoints supported.
- **Email digest**: Hourly + Daily frequencies only (no weekly).

## Phase 4: Alert Deduplication & Grouping

### Schema Changes
Add to `userNotifications`:
- `groupKey` (varchar 200, nullable) — dedup key (e.g., `"media_job_failure:user_123"`)
- `occurrenceCount` (integer, default 1) — how many events this notification represents
- `firstOccurredAt` (timestamptz, default now) — when the first event in this group happened
- `lastOccurredAt` (timestamptz, default now) — when the most recent event happened

New table `notificationOccurrences`:
- `id` (serial PK)
- `notificationId` (FK→userNotifications CASCADE)
- `content` (text) — snapshot of the individual occurrence
- `metadata` (jsonb) — per-occurrence metadata
- `occurredAt` (timestamptz, default now)
- Index on (notificationId, occurredAt DESC)

New index: unique partial index on (userId, groupKey) WHERE isDismissed=false AND groupKey IS NOT NULL — enables atomic ON CONFLICT dedup.

### Dedup Logic
When `groupKey` is provided to `createNotification()`:
1. Attempt INSERT with ON CONFLICT on the unique partial index
2. On conflict: increment occurrenceCount, update lastOccurredAt/content/metadata, set isRead=false
3. Also INSERT into notificationOccurrences with per-occurrence snapshot
4. Feature-flagged: `NOTIFICATION_DEDUP_ENABLED` (default false)

### Group Keys by Source
- Media job failure: `media_job_failure:${userId}` (10 min window)
- Workflow publish: `workflow_publish:${templateId}` (60 min)
- LLM rate limit: `llm_rate_limit:${provider}` (5 min)
- Python high error rate: `python_alert:high_error_rate` (10 min)
- Python slow response: `python_alert:slow_response_time` (5 min)
- Feedback/follow: no dedup

### API Changes
- New `getGroupOccurrences` query: returns individual occurrences for a group by notificationId
- Existing `getNotifications`/`getNotificationHistory` unchanged (grouped notifications just have occurrenceCount > 1)

### Frontend Changes
- Occurrence badge (×N) on grouped notifications in bell dropdown and history page
- Expandable group view showing individual occurrences
- Group expansion calls `getGroupOccurrences`

### SSE Reconnection Fix
- Add exponential backoff reconnection (max 5 attempts, 1s → 30s delay)
- After max attempts, fall back to polling-only

### Enum Migration
- Standalone migration: `ALTER TYPE notification_type ADD VALUE 'direct_message'; ALTER TYPE notification_type ADD VALUE 'urgent_message';`
- Must run outside transaction block (PostgreSQL restriction)

## Phase 5: Notification Preferences & Rules

### Notification Preferences Table
- `id` (serial PK), `userId` (FK→users CASCADE)
- `category` (varchar 50) — system_health, media_jobs, workflow, skill, feedback, agency, follow, scheduled, security, business
- `inApp` (boolean, default true), `email` (boolean, default false), `telegram` (boolean, default false)
- `minSeverity` (enum reminderPriority, nullable — null means all)
- `mutedUntil` (timestamptz, nullable — for snooze)
- Unique index on (userId, category)

### Alert Rules Table (Admin)
- `id` (serial PK), `tenantId` (FK→tenants)
- `name`, `description`, `metricName`, `operator` (allowlisted: gt, lt, gte, lte, eq), `threshold`, `windowMinutes`
- `severity` (enum), `channels` (jsonb string array)
- `targetRole`, `targetUserId` — targeting
- `cooldownMinutes`, `lastTriggeredAt` — prevent spam
- `isEnabled`, timestamps

### Escalation Policies Table
- `id` (serial PK), `tenantId` (FK→tenants)
- `name`, `triggerSeverity` (enum), `triggerMinutes`
- `escalateToRole`, `escalateToUserId`, `escalateChannels` (jsonb), `escalateMessage`
- `isEnabled`, timestamps

### Preference-Aware Delivery
In `createNotification()`:
1. Map resource type/notification type → category
2. Load user preferences for that category
3. Check mute (mutedUntil) and minimum severity
4. Deliver to enabled channels only
5. **Exception**: Escalated notifications BYPASS preferences — deliver on ALL channels

### Escalation Job
BullMQ recurring job (every 5 minutes):
1. Query enabled escalation policies
2. For each policy: find unacknowledged notifications matching triggerSeverity older than triggerMinutes
3. Create escalation notification to target (role or user)
4. Mark original notification as escalated

### Feature Flags
- `NOTIFICATION_PREFERENCES_ENABLED` (default false) — gates preference checks
- `NOTIFICATION_ESCALATION_ENABLED` (default false) — gates escalation job

### Frontend
- `/settings/notifications` — per-category preference grid (inApp, email, telegram, minSeverity, mute)
- `/admin/alert-rules` — CRUD for alert rules + escalation policies

## Phase 6: Unified Notification Center

### Unified Query Layer
`unifiedNotificationService.ts` — reads from userNotifications + orchestratorNotifications, merges and sorts by createdAt DESC.

Interface: `UnifiedNotification` with `source` field ("user" | "orchestrator" | "guardian").
- ID format: `"user:123"` or `"orch:abc-456"`
- Query each source independently with LIMIT N+1, merge in-memory
- Cache unified count in Redis (60s TTL)

### Guardian Metadata Forwarding
Update `virtualAdmin/feedbackProcessor.ts` to include incidentId, ruleId, sensorId, actionTaken in notification metadata.

### Missing Index
Add `idx_orch_notif_user_created` on orchestratorNotifications(userId, createdAt DESC).

### Admin Dashboard
`/admin/notifications` page:
- Stat cards: total, unread, critical, today
- Source breakdown chart
- Severity distribution chart
- Unified list with source/severity/date filters
- Detail panel

### Feature Flag
- `NOTIFICATION_UNIFIED_CENTER` (default false)

## Phase 7: Delivery Channels Expansion

### Email Delivery
- Extend existing `emailService.ts` with generic `sendNotificationEmail()` function
- Immediate mode: high/critical notifications sent right away (if user opted in)
- Digest mode: BullMQ hourly job batches low/normal notifications since last digest
- Digest frequencies: hourly, daily (check configured digestHour before sending)
- Templates with unsubscribe link to `/settings/notifications`

### Webhook Delivery
`notificationWebhooks` table:
- `id`, `tenantId` (FK), `userId` (FK, nullable — null = tenant-wide)
- `name`, `url`, `secretEncrypted` (AES-256-GCM via crypto.ts)
- `categories` (jsonb string array, null = all), `minSeverity`
- `isEnabled`, `lastDeliveredAt`, `failureCount`
- Timestamps

Delivery:
- HMAC-SHA256 signing in `X-Signature-256` header
- BullMQ job with 3 retries (exponential backoff: 5s, 25s, 125s)
- Auto-disable after 3 consecutive failures; notify admin
- SSRF prevention: only HTTPS, block private/loopback ranges

Scope: both tenant-wide (admin) and per-user (user settings) webhooks.

### Notification Templates (i18n)
- Template service with locale-keyed objects (en, th)
- Variable interpolation: `{mediaType}`, `{duration}`, `{errorMessage}`, etc.
- Fallback to English if locale missing
- Templates for all notification categories

### Feature Flags
- `NOTIFICATION_EMAIL_DELIVERY` (default false)
- `NOTIFICATION_WEBHOOK_DELIVERY` (default false)

## Cross-Cutting Concerns

### Retention & Cleanup
BullMQ daily job (03:00 UTC):
1. Delete expired notifications (expiresAt < now)
2. Delete by age: critical=365d, high=180d, normal=90d, low=30d
3. Per-user row cap per priority
4. Occurrences cascade-deleted with parent notification

### Security Requirements (Maintained from Phases 1-3)
- S1: actionUrl sanitization (block dangerous protocols) — every new consumer must use safeNavigate()
- S2: admin-broadcast rate limiting (20/min)
- S3: Internal token validation (length >= 32)
- S4: SSE connection cap (5/user), message re-serialization
- S5: Metadata strict Zod validation
- S6: Dedup concurrency safety via unique partial index + ON CONFLICT
- S7: Operator allowlist (TypeScript enum, never string interpolation)
- S8: Tenant isolation (tenantId in every unified query)
- S9: Webhook secret encryption + SSRF prevention + HMAC signing

### Observability
Prometheus-style counters: notification_created_total, notification_channel_delivery_total, notification_dedup_hits_total, notification_cleanup_rows_deleted. Structured logging for all notification events.

### Data Privacy
- Metadata JSONB: no PII (emails, phones, API keys, IPs, stack traces)
- errorMessage truncated to 500 chars, auto-redact after 90 days
- Account deletion: CASCADE handles row cleanup
- GDPR export: include notifications in user data export

### Feature Flag Rollout Strategy
1. Deploy with flags false (no behavior change)
2. Enable for admin users first
3. Monitor 24 hours
4. Enable for all users

## Files Affected (Summary)

- **Schema**: `drizzle/schema.ts` — 4 new tables, columns on userNotifications
- **Migrations**: 4+ new SQL files
- **Services**: notificationService.ts (dedup + preferences), unifiedNotificationService.ts (new), notificationEmailService.ts (new), notificationWebhookService.ts (new), notificationTemplateService.ts (new)
- **Routers**: notificationPreferences.ts (new), alertRules.ts (new), notificationWebhooks.ts (new), scheduledMessages.ts (update)
- **Jobs**: escalationJob.ts (new), notificationDigestJob.ts (new), notificationRetentionJob.ts (new)
- **Frontend**: NotificationPreferences page, AdminAlertRules page, AdminNotifications page, GlobalAlerts.tsx updates, Notifications.tsx updates
- **Feature flags**: featureFlags.ts — 6 new flags
- **i18n**: en.ts, th.ts — notification translations
- **Python**: alerts.py updates for new metadata format

## Dependencies
No new packages required. Uses existing: drizzle-orm, ioredis, bullmq, @smartspec/ui, sonner, jose, nodemailer, httpx (Python).
