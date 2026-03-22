# TDD Plan: Enterprise Notification System (Phases 4-7)

Testing framework: **Vitest** (TypeScript). Existing patterns: chainable Drizzle ORM mocks, `vi.mock()` for services, `describe/it/expect`. Coverage: 80% minimum.

---

## 4. Phase 4: Alert Deduplication & Grouping

### 4.2 Schema Changes
- Test: notificationOccurrences table insert with FK to userNotifications
- Test: CASCADE delete removes occurrences when parent notification deleted

### 4.3 Dedup Logic in createNotification()
- Test: createNotification with groupKey inserts new notification when no existing group (occurrenceCount=1)
- Test: createNotification with same groupKey within window updates existing (occurrenceCount incremented, lastOccurredAt updated, isRead reset to false)
- Test: createNotification with same groupKey after dismiss creates new notification (dismissed group does not block)
- Test: createNotification with null groupKey bypasses dedup entirely (existing behavior preserved)
- Test: createNotification with groupKey when NOTIFICATION_DEDUP_ENABLED=false bypasses dedup
- Test: occurrence snapshot inserted into notificationOccurrences on dedup hit
- Test: concurrent createNotification with same groupKey does not create duplicates (ON CONFLICT atomic)

### 4.3.1 Python Backend Update
- Test: admin-broadcast endpoint accepts optional groupKey field
- Test: admin-broadcast passes groupKey through to createNotification

### 4.4 New tRPC Endpoint
- Test: getGroupOccurrences returns occurrences for notification owned by current user
- Test: getGroupOccurrences rejects request for notification owned by different user
- Test: getGroupOccurrences returns empty array for notification with no occurrences
- Test: getGroupOccurrences respects limit parameter (max 50)

### 4.5 Frontend Changes
- Test: GlobalNotificationBell renders occurrence badge (×N) when occurrenceCount > 1
- Test: GroupExpansion component calls getGroupOccurrences and renders sub-items
- Test: SSE reconnection attempts exponential backoff (1s, 2s, 4s...)
- Test: SSE falls back to polling after MAX_RECONNECT attempts

### 4.6 Feature Flag
- Test: NOTIFICATION_DEDUP_ENABLED exists in featureFlags.ts with default false

---

## 5. Phase 5: Notification Preferences & Rules

### 5.1 Schema: Notification Preferences
- Test: notificationPreferences table unique constraint on (userId, category)
- Test: insert preference with all fields populated
- Test: emailDigestFrequency accepts "hourly" and "daily" values

### 5.2 Schema: Alert Rules
- Test: alertRules table enforces operator allowlist at Zod validation level
- Test: alertRules channels field stores JSON string array

### 5.3 Schema: Escalation Policies
- Test: escalationPolicies insert with all required fields

### 5.4 Preference-Aware Delivery
- Test: createNotification with preference inApp=true delivers normally
- Test: createNotification with preference inApp=false skips DB insert (returns null)
- Test: createNotification with mutedUntil in future skips delivery
- Test: createNotification with mutedUntil in past delivers normally
- Test: createNotification with minSeverity="high" skips "normal" priority notification
- Test: createNotification with minSeverity="high" delivers "critical" notification
- Test: createNotification with isEscalated=true in metadata bypasses ALL preference checks
- Test: createNotification with no preferences row uses defaults (inApp=true)
- Test: preference cache invalidated after upsertPreference mutation

### 5.5 Category Mapping
- Test: mapToCategory("media_job", any) returns "media_jobs"
- Test: mapToCategory(null, "follow_request") returns "follow"
- Test: mapToCategory(null, "system") returns "business" (fallback)

### 5.6 tRPC Routers
- Test: getPreferences returns all preferences for authenticated user
- Test: upsertPreference creates new preference if not exists
- Test: upsertPreference updates existing preference for same category
- Test: snoozeCategory sets mutedUntil to future timestamp
- Test: listRules requires admin role
- Test: createRule validates operator is in allowlist (rejects "!=", "LIKE", etc.)
- Test: createRule validates metricName, threshold, windowMinutes
- Test: deleteRule requires admin role and tenant match

### 5.7 Escalation Job
- Test: escalation job creates notification for target when critical alert unacknowledged > triggerMinutes
- Test: escalation job skips already-escalated notifications (metadata.isEscalated=true)
- Test: escalation job respects isEnabled=false on policy
- Test: escalation notification has isEscalated=true in metadata
- Test: escalation job marks original notification metadata with escalatedAt

### 5.8-5.9 Frontend
- Test: NotificationPreferences page renders grid with all categories
- Test: toggle change calls upsertPreference mutation
- Test: AdminAlertRules page renders rule list and create form
- Test: operator dropdown only shows allowlisted values

---

## 6. Phase 6: Unified Notification Center

### 6.1 Unified Query Service
- Test: getUnifiedNotifications returns items from both userNotifications and orchestratorNotifications
- Test: unified result is sorted by createdAt DESC across sources
- Test: unified items have correct source field ("user" or "orchestrator")
- Test: unified IDs use correct prefix format ("user:123", "orch:abc-456")
- Test: pagination returns correct hasMore flag
- Test: tenant isolation — query with tenantId A does not return tenantId B orchestrator notifications
- Test: Redis count cache is populated after first query
- Test: Redis count cache is used on subsequent queries within TTL

### 6.3 Guardian Metadata Enrichment
- Test: Guardian notification includes incidentId in metadata.eventId
- Test: Guardian notification includes ruleId and sensorId in metadata.relatedItems
- Test: Guardian notification sets relatedResourceType="incident"
- Test: Guardian notification sets actionUrl with incidentId parameter

### 6.4 tRPC Endpoints
- Test: getUnifiedNotifications requires admin role
- Test: getUnifiedStats returns correct aggregated counts
- Test: source filter restricts results to specified sources
- Test: severity filter restricts results

### 6.5 Frontend
- Test: AdminNotifications page renders stat cards with correct counts
- Test: source filter dropdown updates query

---

## 7. Phase 7: Delivery Channels Expansion

### 7.1 Email Delivery Service
- Test: sendNotificationEmail sends email via nodemailer for high priority notification
- Test: sendNotificationEmail uses template service for localized content
- Test: sendNotificationEmail includes unsubscribe link in template
- Test: sendNotificationEmail does nothing if user has no email address
- Test: sendNotificationDigest collects unread notifications since last digest
- Test: sendNotificationDigest sends nothing if zero unread

### 7.2 Email Digest Job
- Test: digest job processes users with email=true preferences
- Test: digest job skips "daily" users when current hour != digestHour
- Test: digest job sends for "daily" users when current hour == digestHour
- Test: digest job updates last digest time in Redis after send

### 7.3 Webhook Delivery
- Test: webhook delivery sends POST with correct payload format
- Test: webhook delivery computes HMAC-SHA256 signature in X-Signature-256 header
- Test: webhook delivery retries on failure (up to 3 times)
- Test: webhook auto-disables after 3 consecutive failures
- Test: webhook auto-disable creates admin notification
- Test: SSRF prevention rejects http:// URLs (only HTTPS allowed)
- Test: SSRF prevention rejects private IP ranges (127.0.0.0/8, 10.0.0.0/8, etc.)
- Test: DNS rebind check at delivery time (not just creation)
- Test: webhook matching respects categories filter (null = all)
- Test: webhook matching respects minSeverity filter
- Test: tenant-wide webhook (userId=null) fires for any user in tenant
- Test: user-specific webhook fires only for that user

### 7.4 Notification Template Service
- Test: renderNotification with "en" locale returns English template
- Test: renderNotification with "th" locale returns Thai template
- Test: renderNotification with unknown locale falls back to English
- Test: renderNotification with unknown template key returns key as title
- Test: variable interpolation replaces {variableName} with provided values
- Test: missing variables render as literal {variableName}

### 7.5 Notification Retention Job
- Test: retention job deletes notifications past expiresAt
- Test: retention job deletes "low" priority notifications older than 30 days
- Test: retention job deletes "normal" priority older than 90 days
- Test: retention job does NOT delete "critical" notifications within 365 days
- Test: per-user row cap keeps newest N per priority
- Test: occurrences cascade-deleted with parent

### 7.6 tRPC Router: Webhooks
- Test: createWebhook validates URL is HTTPS
- Test: createWebhook rejects private IP ranges
- Test: createWebhook encrypts secret before storage
- Test: listWebhooks returns only current user's webhooks (for user scope)
- Test: listWebhooks returns tenant webhooks for admin
- Test: testWebhook sends test payload and returns success/failure

### 7.7-7.8 Frontend & i18n
- Test: webhook management table renders user's webhooks
- Test: create webhook form validates URL field
- Test: notification translations exist for all category labels in EN and TH
