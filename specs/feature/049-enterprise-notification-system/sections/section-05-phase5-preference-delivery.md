# Section 05: Phase 5 -- Preference-Aware Delivery Gate

## Overview

This section adds a preference-aware delivery gate to the existing `createNotification()` function in `apps/web/server/services/notificationService.ts`. When the `NOTIFICATION_PREFERENCES_ENABLED` feature flag is true, the service consults the `notificationPreferences` table (created in section-04) to determine which delivery channels are enabled for a given user and notification category. Notifications can be suppressed entirely based on mute windows or minimum severity thresholds. Escalated notifications (metadata `isEscalated: true`) bypass all preference checks and deliver on every available channel.

This section also introduces the `mapToCategory()` helper that maps a notification's `relatedResourceType` and `type` fields to one of the 10 preference categories, and a Redis-cached preference lookup with cache invalidation on upsert.

## Dependencies

| Section | What it provides | Required before this section? |
|---------|-----------------|-------------------------------|
| section-01-phase4-schema-migration | `userNotifications` table with groupKey/occurrenceCount columns, enum extension | Yes |
| section-02-phase4-dedup-service | Updated `createNotification()` with dedup logic, `CreateNotificationParams` additions | Yes |
| section-04-phase5-schema-preferences | `notificationPreferences` table, `alertRules` table, `escalationPolicies` table, preference/rule CRUD tRPC routers | Yes |
| section-13-feature-flags-i18n | `NOTIFICATION_PREFERENCES_ENABLED` feature flag in `featureFlags.ts` | Yes (flag must exist) |

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/web/server/services/notificationService.ts` | **Modify** -- add preference gate, mapToCategory, cached lookup |
| `apps/web/server/services/__tests__/notificationPreferenceDelivery.test.ts` | **Create** -- tests for preference-aware delivery |

## Tests (Write First)

**Test file:** `apps/web/server/services/__tests__/notificationPreferenceDelivery.test.ts`

### Mock Strategy

- Mock `apps/web/server/db.ts` so `getDb()` returns a controllable Drizzle instance with chainable `select`, `insert`, `update` methods.
- Mock `apps/web/server/services/redis.ts` so `getRedisClient()` returns a fake Redis client with `get`, `set`, `del`, and `publish` methods.
- Mock `apps/web/server/services/featureFlags.ts` to control the `NOTIFICATION_PREFERENCES_ENABLED` flag return value per test.
- Mock `apps/web/server/services/telegramService.ts` to capture Telegram enqueue calls.
- Import the `notificationPreferences` table from schema for verification.

### Test Stubs

```typescript
// apps/web/server/services/__tests__/notificationPreferenceDelivery.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(),
}));
vi.mock("../telegramService", () => ({
  enqueueTelegramNotification: vi.fn(),
}));

describe("mapToCategory", () => {
  it("maps relatedResourceType 'media_job' to category 'media_jobs'");
  it("maps relatedResourceType 'system_health' to category 'system_health'");
  it("maps relatedResourceType 'workflow' to category 'workflow'");
  it("maps relatedResourceType 'skill' to category 'skill'");
  it("maps relatedResourceType 'feedback' to category 'feedback'");
  it("maps relatedResourceType 'agency' to category 'agency'");
  it("maps relatedResourceType 'security' to category 'security'");
  it("maps type 'follow_request' to category 'follow'");
  it("maps type 'scheduled_message' to category 'scheduled'");
  it("returns 'business' as fallback for unknown combinations");
  it("prioritizes relatedResourceType over type when both are present");
});

describe("preference-aware delivery in createNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when NOTIFICATION_PREFERENCES_ENABLED is false", () => {
    it("bypasses preference checks entirely and delivers normally");
  });

  describe("when NOTIFICATION_PREFERENCES_ENABLED is true", () => {
    it("delivers normally when user has preference with inApp=true");
    it("skips DB insert and returns null when user has preference with inApp=false");
    it("skips delivery entirely when mutedUntil is in the future");
    it("delivers normally when mutedUntil is in the past");
    it("skips delivery when minSeverity='high' and notification priority is 'normal'");
    it("delivers when minSeverity='high' and notification priority is 'critical'");
    it("delivers when minSeverity='high' and notification priority is 'high'");
    it("uses defaults (inApp=true) when no preference row exists for category");
    it("enqueues Telegram delivery when preference has telegram=true");
    it("skips Telegram when preference has telegram=false");
  });

  describe("escalation bypass", () => {
    it("bypasses preference checks when metadata.isEscalated is true");
    it("delivers on ALL channels when escalated regardless of user preferences");
    it("delivers even when category is muted if isEscalated is true");
    it("delivers even when minSeverity would filter if isEscalated is true");
  });

  describe("preference cache", () => {
    it("reads preference from Redis cache when available (within 60s TTL)");
    it("falls back to DB query when Redis cache misses");
    it("stores queried preference in Redis with 60s TTL after DB read");
    it("cache key follows pattern 'notification:prefs:{userId}:{category}'");
  });
});
```

### Severity Ordering

Tests must validate the severity comparison logic. The priority hierarchy for `minSeverity` filtering is: `critical > high > normal > low`. A notification with priority equal to or above the `minSeverity` threshold passes; one below is suppressed.

Define a numeric mapping used internally:

| Priority | Numeric value |
|----------|--------------|
| `low` | 0 |
| `normal` | 1 |
| `high` | 2 |
| `critical` | 3 |

## Implementation Guidance

### 1. Export and add `mapToCategory()` to `notificationService.ts`

This is a pure function with no side effects. It maps the notification's `relatedResourceType` (string or undefined) and `type` (NotificationType) to one of the 10 preference category strings.

**Signature:**

```typescript
export function mapToCategory(
  relatedResourceType?: string,
  type?: NotificationType
): string;
```

**Mapping rules** (evaluated in order, first match wins):

1. If `relatedResourceType` is `"system_health"` -> return `"system_health"`
2. If `relatedResourceType` is `"media_job"` -> return `"media_jobs"`
3. If `relatedResourceType` is `"workflow"` -> return `"workflow"`
4. If `relatedResourceType` is `"skill"` -> return `"skill"`
5. If `relatedResourceType` is `"feedback"` -> return `"feedback"`
6. If `relatedResourceType` is `"agency"` -> return `"agency"`
7. If `relatedResourceType` is `"security"` -> return `"security"`
8. If `type` is `"follow_request"` -> return `"follow"`
9. If `type` is `"scheduled_message"` -> return `"scheduled"`
10. Fallback -> return `"business"`

Export this function so downstream sections (06, 08) can reuse it.

### 2. Add `loadUserPreference()` -- Redis-cached preference lookup

**Signature:**

```typescript
async function loadUserPreference(
  db: DrizzleDB,
  userId: number,
  category: string
): Promise<UserPreference | null>;
```

**Where `UserPreference`** is a lightweight interface:

```typescript
interface UserPreference {
  inApp: boolean;
  email: boolean;
  telegram: boolean;
  minSeverity: ReminderPriority | null;
  mutedUntil: Date | null;
  emailDigestFrequency: string | null;
}
```

**Lookup flow:**

1. Build Redis key: `notification:prefs:${userId}:${category}`
2. Call `redis.get(key)`. If non-null, `JSON.parse()` the value and return it.
3. On cache miss, query `notificationPreferences` table: `SELECT * FROM notificationPreferences WHERE userId = :userId AND category = :category LIMIT 1`
4. If a row exists, map it to `UserPreference`, store in Redis via `redis.set(key, JSON.stringify(pref), "EX", 60)`, and return it.
5. If no row exists, return `null` (caller applies defaults).

**Cache invalidation:** Section-04 creates the `upsertPreference` tRPC mutation. That mutation must call `redis.del(`notification:prefs:${userId}:${category}`)` after the DB write. This is documented here but implemented in the router created by section-04. If section-04 has not yet wired the invalidation, this section should add a note in section-04's router file as a TODO comment.

### 3. Add `severityAtOrAbove()` helper

A small utility used by the preference gate:

```typescript
const SEVERITY_ORDER: Record<ReminderPriority, number> = {
  low: 0, normal: 1, high: 2, critical: 3,
};

function severityAtOrAbove(
  actual: ReminderPriority,
  threshold: ReminderPriority
): boolean;
```

Returns `true` if `actual >= threshold` in the numeric ordering. Used to check `minSeverity`.

### 4. Modify `createNotification()` -- insert preference gate

The preference gate is inserted **before** the existing DB insert step (step 1 in the current code). The gate determines whether to proceed with insertion and which channels to activate.

**Modified flow:**

```
createNotification(params):
  // --- NEW: Preference gate (only when NOTIFICATION_PREFERENCES_ENABLED) ---
  1a. Check isEscalated = params.metadata?.isEscalated === true
  1b. If not escalated AND flag is enabled:
      - category = mapToCategory(relatedResourceType, type)
      - pref = await loadUserPreference(db, userId, category)
      - If pref is not null:
          - If pref.mutedUntil && pref.mutedUntil > now: return null
          - If pref.minSeverity && !severityAtOrAbove(priority, pref.minSeverity): return null
          - If pref.inApp === false: return null
      - If pref is null: use defaults (inApp=true, email=false, telegram=false)
  1c. Determine channel flags:
      - If escalated: inApp=true, email=true, telegram=true (all channels)
      - Else if pref exists: use pref.inApp, pref.email, pref.telegram
      - Else: inApp=true, email=false, telegram=false

  // --- EXISTING: DB insert (only if inApp is true) ---
  2. Insert into userNotifications (existing dedup logic from section-02 applies)

  // --- MODIFIED: Telegram delivery (conditional on telegram channel flag) ---
  3. If telegram channel flag is true: enqueue Telegram notification
     Else: skip Telegram enqueue

  // --- EXISTING: Redis pub/sub SSE ---
  4. Publish to Redis for SSE (always, for real-time UI updates)

  // --- NEW: Email channel flag stored for downstream use ---
  5. Return { notificationId, channels: { inApp, email, telegram } }
```

**Return type change:** The current return type is `Promise<{ notificationId: number }>`. After this modification, it becomes `Promise<{ notificationId: number; channels?: { inApp: boolean; email: boolean; telegram: boolean } } | null>`. Returning `null` means the notification was suppressed by preferences. Existing callers that do not inspect the return value are unaffected. Section-10 (email delivery) and section-11 (webhook delivery) will use the `channels` field.

**Important**: The `channels` object is informational for downstream delivery services. The DB insert and SSE publish always happen when `inApp` is true. Email and webhook delivery are handled by their respective sections (10, 11) by checking the `channels` return or re-evaluating preferences.

### 5. Add `ResourceType` extension

The existing `ResourceType` union type in `notificationService.ts` does not include `"system_health"` or `"security"`. Add these two values:

```typescript
type ResourceType =
  | "media_job"
  | "workflow"
  | "skill"
  | "feedback"
  | "agency"
  | "approval"
  | "team_run"
  | "room"
  | "user"
  | "conversation"
  | "scheduled_message"
  | "system_health"   // NEW
  | "security"        // NEW
  | "incident";       // NEW (for Phase 6 Guardian enrichment)
```

### 6. Update `NotificationMetadata` interface

Add the `isEscalated` field used by the escalation bypass:

```typescript
interface NotificationMetadata {
  eventId?: string;
  source?: string;
  isEscalated?: boolean;        // NEW: set by escalation job (section-06)
  escalatedAt?: string;         // NEW: ISO timestamp when escalated
  escalatedTo?: string;         // NEW: target user/role identifier
  errorDetails?: { ... };
  metrics?: { ... };
  retryInfo?: { ... };
  relatedItems?: Record<string, string>;
}
```

## Security Considerations

- **Preference lookup is user-scoped**: `loadUserPreference` always filters by `userId` -- a user cannot read another user's preferences through this path.
- **Escalation bypass is metadata-driven**: Only code paths that set `metadata.isEscalated = true` trigger the bypass. The escalation job (section-06) is the only authorized source. The metadata field is validated by the existing `sanitizeMetadata()` function and the Zod schema on the admin-broadcast endpoint.
- **Redis cache keys are user-scoped**: Key format `notification:prefs:{userId}:{category}` prevents cross-user cache pollution.
- **No eval or dynamic code**: The `mapToCategory()` function uses a static switch/if-else chain. The `severityAtOrAbove()` function uses a numeric lookup table. Neither constructs queries from user input.

## Observability

Add structured logging at each decision point:

- `logger.info("notification_preference_check", { userId, category, result: "delivered" | "muted" | "severity_filtered" | "channel_disabled" | "escalation_bypass" })`
- `logger.info("notification_preference_cache_hit", { userId, category })` on Redis cache hit
- `logger.info("notification_preference_cache_miss", { userId, category })` on cache miss + DB query

Use the existing `console.error` pattern for non-fatal failures (e.g., Redis unavailable during preference lookup -- fall through to defaults).

## Integration Points

- **Section-06 (Escalation Job)** creates notifications with `metadata.isEscalated = true`, which triggers the bypass logic defined here.
- **Section-07 (Frontend Settings)** calls the `upsertPreference` mutation from section-04, which must invalidate the Redis cache key used by `loadUserPreference()`.
- **Section-10 (Email Delivery)** reads the `channels.email` flag from the `createNotification()` return value to decide whether to send email.
- **Section-11 (Webhook Delivery)** hooks into the delivery pipeline after the DB insert, using the same preference-resolved channel flags.
- **Section-08 (Unified Query)** may reuse `mapToCategory()` for category-based filtering in the admin dashboard.

## Verification Checklist

1. All tests in `notificationPreferenceDelivery.test.ts` pass.
2. Existing notification tests (`notificationService.test.ts`) still pass -- the preference gate is no-op when the flag is false.
3. `mapToCategory()` is exported and covers all 10 categories plus the business fallback.
4. `loadUserPreference()` reads from Redis first, falls back to DB, and writes cache with 60s TTL.
5. Escalated notifications bypass mute, minSeverity, and channel preferences.
6. The `ResourceType` and `NotificationMetadata` types include the new fields.
7. TypeScript compiles without errors: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`

## Implementation Notes (Post-Build)

**Files modified:**
- `apps/web/server/services/notificationService.ts` — Added `mapToCategory()`, `severityAtOrAbove()`, `loadUserPreference()`, preference gate in `createNotification()`, escalation bypass, extended `ResourceType` and `NotificationMetadata` types
- `apps/web/server/routers/notificationPreferences.ts` — Added Redis cache invalidation to `snoozeCategory` mutation (was missing, caught in code review)

**Files created:**
- `apps/web/server/services/__tests__/notificationPreferenceDelivery.test.ts` — 30 tests

**Deviations from plan:**
- Feature flag uses `process.env.NOTIFICATION_PREFERENCES_ENABLED` instead of `featureFlags.ts` integration — section-13 will wire this properly. Env var is the correct interim approach.
- `sanitizeMetadata()` now strips `isEscalated`/`escalatedAt`/`escalatedTo` fields to prevent untrusted callers from triggering escalation bypass. The escalation job (section-06) reads raw metadata before sanitization.
- `snoozeCategory` mutation was missing Redis cache invalidation — added during code review to match `upsertPreference` pattern.
- Observability log for "delivered" split into `"delivered"` (pref exists) and `"default_delivered"` (no pref row).

**Test results:** 30/30 new tests pass, 21/21 existing notification tests pass (no regressions).