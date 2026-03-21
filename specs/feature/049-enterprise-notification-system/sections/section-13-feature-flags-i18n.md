# Section 13: Feature Flags, i18n, Routes & Health Checks

## Section ID
`section-13-feature-flags-i18n`

## Overview

This section is a foundational section that adds: 6 notification feature flags to `featureFlags.ts`, notification-related i18n translations to `en.ts` and `th.ts`, menu entries for new admin/settings pages to `menu.ts`, route definitions in the app router, and notification system health checks. It is a prerequisite for all other sections and can be implemented in parallel with section-01 (schema migration).

**Dependencies**: None (first section, parallelizable with section-01).
**Blocks**: All other sections (they reference feature flags and i18n keys).

---

## Files to Modify

| File | Action |
|------|--------|
| `apps/web/shared/featureFlags.ts` | Add 6 new flags to interface, allowlist, and defaults |
| `apps/web/client/src/lib/i18n/locales/en.ts` | Add notification translation keys (EN) |
| `apps/web/client/src/lib/i18n/locales/th.ts` | Add notification translation keys (TH) |
| `packages/shared/src/constants/menu.ts` | Add 2 admin menu items |
| `apps/web/client/src/main.tsx` | Add 3 route definitions + lazy imports |

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/notificationHealthChecks.ts` | Health check probes for notification subsystem |
| `apps/web/shared/__tests__/notificationFeatureFlags.test.ts` | Feature flag tests |
| `apps/web/client/src/lib/i18n/__tests__/notificationTranslations.test.ts` | i18n completeness tests |
| `packages/shared/src/constants/__tests__/notificationMenu.test.ts` | Menu entry tests |

---

## TDD Tests

### Feature flag tests: `apps/web/shared/__tests__/notificationFeatureFlags.test.ts`

```
describe("Notification feature flags", () => {
  const NOTIFICATION_FLAGS = [
    "notificationDedupEnabled",
    "notificationPreferencesEnabled",
    "notificationEscalationEnabled",
    "notificationUnifiedCenter",
    "notificationEmailDelivery",
    "notificationWebhookDelivery",
  ];

  it("all 6 notification flags exist in FEATURE_FLAG_DEFAULTS")
  it("all 6 notification flags default to false")
  it("all 6 notification flags are in ALLOWED_FEATURE_FLAGS set")
})
```

### i18n tests: `apps/web/client/src/lib/i18n/__tests__/notificationTranslations.test.ts`

```
describe("Notification i18n translations", () => {
  const REQUIRED_KEYS = [
    "notifications.category.system_health",
    "notifications.category.media_jobs",
    "notifications.category.workflow",
    "notifications.category.skill",
    "notifications.category.feedback",
    "notifications.category.agency",
    "notifications.category.follow",
    "notifications.category.scheduled",
    "notifications.category.security",
    "notifications.category.business",
    "notifications.settings.title",
    "notifications.settings.inApp",
    "notifications.settings.email",
    "notifications.settings.telegram",
    "notifications.settings.minSeverity",
    "notifications.settings.mute",
    "notifications.settings.save",
    "notifications.alertRules.title",
    "notifications.alertRules.name",
    "notifications.alertRules.metric",
    "notifications.alertRules.operator",
    "notifications.alertRules.threshold",
    "notifications.alertRules.cooldown",
    "notifications.alertRules.enabled",
    "notifications.alertRules.create",
    "notifications.escalation.title",
    "notifications.escalation.triggerSeverity",
    "notifications.escalation.triggerMinutes",
    "notifications.escalation.target",
    "notifications.webhooks.title",
    "notifications.webhooks.name",
    "notifications.webhooks.url",
    "notifications.webhooks.secret",
    "notifications.webhooks.categories",
    "notifications.webhooks.test",
    "notifications.webhooks.create",
    "notifications.admin.title",
    "notifications.admin.total",
    "notifications.admin.unread",
    "notifications.admin.critical",
    "notifications.admin.today",
    "notifications.group.expand",
    "notifications.group.occurrences",
    "notifications.group.latest",
  ];

  it("all notification keys exist in EN locale with non-empty string values")
  it("all notification keys exist in TH locale with non-empty string values")
})
```

### Menu tests: `packages/shared/src/constants/__tests__/notificationMenu.test.ts`

```
describe("Notification menu entries", () => {
  it("has admin-notifications menu item at /admin/notifications with admin role")
  it("has admin-alert-rules menu item at /admin/alert-rules with admin role")
  it("admin-notifications requires feature notificationUnifiedCenter")
  it("admin-alert-rules requires feature notificationPreferencesEnabled")
})
```

---

## Implementation Details

### 1. Feature Flags (`apps/web/shared/featureFlags.ts`)

Add 6 flags to `TenantFeatureFlags` interface, `ALLOWED_FEATURE_FLAGS` Set, and `FEATURE_FLAG_DEFAULTS`. All default to `false`.

| Flag Key (camelCase) | Phase | Checked By |
|---|---|---|
| `notificationDedupEnabled` | 4 | `notificationService.ts` (section-02) |
| `notificationPreferencesEnabled` | 5 | `notificationService.ts` (section-05) |
| `notificationEscalationEnabled` | 5 | `escalationJob.ts` (section-06) |
| `notificationUnifiedCenter` | 6 | unified endpoints (section-08) |
| `notificationEmailDelivery` | 7 | email service (section-10) |
| `notificationWebhookDelivery` | 7 | webhook service (section-11) |

**Naming convention**: camelCase in TypeScript code. The plan references `SCREAMING_SNAKE_CASE` names — these map to camelCase in the actual code (e.g., `NOTIFICATION_DEDUP_ENABLED` → `notificationDedupEnabled`). All sections must use the camelCase form when checking flags at runtime.

### 2. i18n Translations

#### English (`apps/web/client/src/lib/i18n/locales/en.ts`)

Add a block with comment `// -- Notifications (Feature 049) --` containing 44 keys:

**Category labels (10)**:
- `"notifications.category.system_health": "System Health"`
- `"notifications.category.media_jobs": "Media Jobs"`
- `"notifications.category.workflow": "Workflows"`
- `"notifications.category.skill": "Skills"`
- `"notifications.category.feedback": "Feedback"`
- `"notifications.category.agency": "Agencies"`
- `"notifications.category.follow": "Follows"`
- `"notifications.category.scheduled": "Scheduled Messages"`
- `"notifications.category.security": "Security"`
- `"notifications.category.business": "Business"`

**Settings page (7)**: title, inApp, email, telegram, minSeverity, mute, save

**Alert rules (8)**: title, name, metric, operator, threshold, cooldown, enabled, create

**Escalation (4)**: title, triggerSeverity, triggerMinutes, target

**Webhooks (7)**: title, name, url, secret, categories, test, create

**Admin dashboard (5)**: title, total, unread, critical, today

**Group/dedup (3)**: expand, occurrences, latest

#### Thai (`apps/web/client/src/lib/i18n/locales/th.ts`)

Same 44 keys with Thai translations. Key examples:
- `"notifications.category.system_health": "สุขภาพระบบ"`
- `"notifications.settings.title": "การตั้งค่าการแจ้งเตือน"`
- `"notifications.alertRules.title": "กฎแจ้งเตือน"`
- `"notifications.escalation.title": "นโยบายการยกระดับ"`
- `"notifications.webhooks.title": "เว็บฮุก"`
- `"notifications.admin.title": "ศูนย์การแจ้งเตือน"`
- `"notifications.group.expand": "ขยายกลุ่ม"`
- `"notifications.group.latest": "ล่าสุด"`

### 3. Menu Entries (`packages/shared/src/constants/menu.ts`)

**Section-13 is the SOLE OWNER of all notification menu entries and route registrations. Sections 07 and 09 create only page components — they do NOT add menu/route entries.**

Add 2 items to `defaultMenuItems`:

```typescript
{
  id: 'admin-notifications',
  label: 'Notifications',
  labelTh: 'การแจ้งเตือน',
  icon: 'Bell',
  path: '/admin/notifications',
  platforms: ['web', 'desktop'],
  roles: ['admin'],
  group: 'admin',
  sortOrder: 21.85,
  requiresFeature: 'notificationUnifiedCenter',
},
{
  id: 'admin-alert-rules',
  label: 'Alert Rules',
  labelTh: 'กฎแจ้งเตือน',
  icon: 'BellRing',
  path: '/admin/alert-rules',
  platforms: ['web', 'desktop'],
  roles: ['admin'],
  group: 'admin',
  sortOrder: 21.9,
  requiresFeature: 'notificationPreferencesEnabled',
}
```

### 4. Route Definitions (`apps/web/client/src/main.tsx`)

Add lazy imports:
```typescript
const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
const AdminAlertRules = lazy(() => import("./pages/AdminAlertRules"));
```

Add routes in admin section:
```tsx
<Route path="/admin/notifications"><RequireAdmin><AdminNotifications /></RequireAdmin></Route>
<Route path="/admin/alert-rules"><RequireAdmin><AdminAlertRules /></RequireAdmin></Route>
```

The `/settings/notifications` tab is embedded within the existing Settings page (section-07 adds the tab to Settings.tsx) — no separate route needed.

### 5. Notification Health Checks

**File**: `apps/web/server/services/notificationHealthChecks.ts`

Three health check probes as specified in the original spec:

**5.1 Redis pub/sub round-trip probe**

```typescript
export async function checkRedisPubSubHealth(): Promise<{ healthy: boolean; latencyMs: number }>;
```

- Publish a test message to `notifications:health` channel
- Subscribe and wait for receipt with 5-second timeout
- Return `{ healthy: true, latencyMs }` on success
- Return `{ healthy: false, latencyMs: -1 }` on timeout
- Log `logger.warn("notification_health_check_failed", { probe: "redis_pubsub" })` on failure

**5.2 Admin-broadcast endpoint monitoring**

```typescript
export async function checkAdminBroadcastHealth(): Promise<{ healthy: boolean; errorRate: number }>;
```

- Track non-2xx response rate over a 5-minute sliding window using an in-memory counter
- Alert (return `healthy: false`) if error rate > 10% over the window
- Integration: increment counters in the admin-broadcast endpoint handler

**5.3 SSE connection count gauge**

```typescript
export async function getSSEConnectionCount(): Promise<number>;
```

- Export `getActiveSSEConnectionCount()` from `notificationStream.ts` (reads the `activeSubscribers` Map size)
- Alert threshold: > 500 concurrent connections
- Expose via existing monitoring tRPC endpoint or `/api/health` route

**Registration**: Add a `checkNotificationHealth()` function that runs all 3 probes and returns a combined status. Register in the existing health check system or expose via `monitoring.ts` router.

---

## Rollout Strategy

1. Deploy with all 6 flags `false` (no behavior change)
2. Enable `notificationDedupEnabled` for admin users first → monitor 24h
3. Enable `notificationPreferencesEnabled` + `notificationEscalationEnabled` together
4. Enable `notificationUnifiedCenter` after unified query verified
5. Enable `notificationEmailDelivery` + `notificationWebhookDelivery` last (external side-effects)
6. After stability, enable all flags for all users

Flags stored in `tenants.featureFlags` JSON column. Admin toggles via `/admin/settings`.

---

## Cross-References

All 12 other sections reference this section for:
- Feature flag names (camelCase form)
- i18n translation keys
- Route paths for navigation
- Menu entries for admin sidebar

---

## Verification Checklist

1. All 6 feature flags exist in `featureFlags.ts` with default `false`
2. All 44 i18n keys exist in both `en.ts` and `th.ts`
3. Both menu entries visible in admin sidebar when flags enabled
4. Routes render correct lazy-loaded pages
5. Health check probes return meaningful results
6. TypeScript compiles: `cd apps/web && pnpm check`

---

## Implementation Notes (Actual vs Planned)

### Deviations from Plan

1. **Routes in App.tsx, not main.tsx**: Route definitions for `/admin/notifications` and `/admin/alert-rules` were added in `App.tsx` (the project's actual route file) by prior sections 09 and 07. Section-13 did not need to add them again. `main.tsx` handles only app bootstrapping (Sentry, tRPC client, QueryClient).

2. **Feature flags partially pre-existing**: `notificationUnifiedCenter` (F23) and `notificationEmailDelivery` (F24) were already added by prior sections (08 and 10 respectively). Section-13 added the 4 remaining flags: `notificationDedupEnabled`, `notificationPreferencesEnabled`, `notificationEscalationEnabled`, `notificationWebhookDelivery`.

3. **Menu entry partially pre-existing**: `admin-notifications` was already added by prior section 09. Section-13 added only `admin-alert-rules`.

4. **Menu test location**: Test placed at `apps/web/shared/__tests__/notificationMenu.test.ts` (not `packages/shared/src/constants/__tests__/`) because the vitest config only covers `shared/**/*.test.ts` within apps/web. Imports from `@smartspec/shared`.

### Code Review Fixes Applied

- Wired `checkNotificationHealth()` into `monitoring.ts` tRPC router as `notificationHealth` admin procedure
- Wired `recordBroadcastRequest()` into admin-broadcast handler success/error paths in `server/_core/index.ts`
- Added race guard (`resolved` flag) in Redis pub/sub health probe to prevent double-resolve
- Added comment documenting per-worker limitation of broadcast error rate counter

### Files Created

- `apps/web/server/services/notificationHealthChecks.ts`
- `apps/web/shared/__tests__/notificationFeatureFlags.test.ts`
- `apps/web/shared/__tests__/notificationMenu.test.ts`
- `apps/web/client/src/lib/i18n/__tests__/notificationTranslations.test.ts`

### Files Modified

- `apps/web/shared/featureFlags.ts` — 4 new flags added
- `packages/shared/src/constants/menu.ts` — `admin-alert-rules` entry added
- `apps/web/client/src/lib/i18n/locales/en.ts` — 44 notification keys
- `apps/web/client/src/lib/i18n/locales/th.ts` — 44 notification keys
- `apps/web/server/routes/notificationStream.ts` — `getActiveSSEConnectionCount()` export
- `apps/web/server/routers/monitoring.ts` — `notificationHealth` procedure
- `apps/web/server/_core/index.ts` — `recordBroadcastRequest()` calls

### Tests

- 9 tests across 3 files, all passing
  - 3 feature flag tests
  - 2 i18n completeness tests (EN + TH)
  - 4 menu entry tests
