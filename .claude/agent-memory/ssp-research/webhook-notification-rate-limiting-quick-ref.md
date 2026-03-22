---
name: Webhook & Rate Limiting Quick Reference
description: Quick lookup for webhook UI integration, rate limiting implementation, and settings tab structure
type: reference
---

# Webhook & Rate Limiting Quick Reference

## Files at a Glance

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| `apps/web/client/src/components/settings/WebhookManagement.tsx` | User webhook CRUD UI | 469 | **COMPLETE but UNUSED** |
| `apps/web/client/src/components/admin/AdminWebhookManagement.tsx` | Admin webhook wrapper | 10 | COMPLETE |
| `apps/web/server/routers/notificationWebhooks.ts` | tRPC webhook router | 200+ | COMPLETE |
| `apps/web/server/services/notificationService.ts:createNotification()` | Notification creator | 276-596 | **NO RATE LIMITING** |
| `apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx` | Notification prefs UI | 501 | **MISSING webhook section** |
| `apps/web/client/src/pages/Settings.tsx` | Settings tab router | 1524 | Defined but webhooks not in tabs |
| `apps/web/server/services/rateLimiter.ts` | In-memory rate limiter | 100+ | AVAILABLE |
| `apps/web/server/services/redis.ts` | Redis client | 100+ | AVAILABLE |

## Critical Integration Gaps

### 1. Webhooks Not Visible in UI

**Current State:**
- WebhookManagement component exists and is fully functional
- NOT imported in NotificationPreferencesPanel
- NOT rendered anywhere in Settings UI
- No tab for webhooks in Settings.tsx

**Quick Fix (1-2 hours):**
```tsx
// Option A: Add webhooks tab
const tabs = [
  // ... existing tabs ...
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
];

// In content rendering:
{activeTab === 'webhooks' && <WebhookManagement scope="user" />}

// Option B: Embed in notifications tab
// In NotificationPreferencesPanel.tsx:
import { WebhookManagement } from './WebhookManagement';
// Add at end: <WebhookManagement scope="user" />
```

### 2. No Rate Limiting on createNotification()

**Current Risk:**
- Notification creation completely unthrottled
- Escalation/Guardian could trigger DOS via notification spam
- No limit on internal service notification creation

**Rate Limiter Available:**
```typescript
// From: apps/web/server/services/rateLimiter.ts
const limiter = createRateLimiter("notifications", {
  windowMs: 3600_000,    // 1 hour
  maxRequests: 1000,     // 1000 per hour per user
  blockDurationMs: 5000, // 5s block if exceeded
});

// Usage in createNotification():
if (!limiter.isAllowed(`user:${userId}`)) {
  return null; // or throw error
}
```

**Alternative: Redis-based:**
```typescript
// From: apps/web/server/services/redis.ts
const redis = getRedisClient();
const key = `notification:rate:${userId}`;
const count = await redis.incr(key);
if (count === 1) {
  await redis.expire(key, 3600); // 1 hour
}
if (count > 1000) {
  return null; // rate limited
}
```

## Settings Tab Structure

**Location:** `apps/web/client/src/pages/Settings.tsx`

**Tabs Array (line 567-578):**
```typescript
const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: Mail },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'preferences', label: 'Preferences', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },  // ← WebhookManagement NOT here
  { id: 'automation', label: 'Automation', icon: Bot },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'personas', label: 'Personas', icon: UserCog },
];
```

**Type Definition (line 69):**
```typescript
type SettingsTab = 'profile' | 'account' | 'security' | 'preferences' | 'notifications' | 'automation' | 'api' | 'billing' | 'integrations' | 'personas';
```

**Rendering Pattern (line 1524):**
```typescript
{activeTab === 'notifications' && <NotificationPreferencesPanel />}
```

## tRPC Procedures Available

**Router:** `apps/web/server/routers/notificationWebhooks.ts`

| Procedure | Input | Auth | Description |
|-----------|-------|------|-------------|
| `listWebhooks` | `{ scope: "user" \| "tenant" }` | protected | Returns webhooks, secrets stripped |
| `createWebhook` | name, url, secret, categories[], minSeverity | protected + admin for tenant | Encrypts secret, validates SSRF |
| `updateWebhook` | id, partial fields | protected + admin for tenant | Partial updates, secret optional |
| `deleteWebhook` | id | protected | Soft delete or hard delete TBD |
| `testWebhook` | id | protected | Sends test payload, returns statusCode |

**Feature Gate:** All require `await requireWebhookDeliveryEnabled(tenantId)`

## NotificationPreferencesPanel

**Location:** `apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx`

**What It Does (lines 148-501):**
- Renders 10 notification categories in a grid
- Toggles per category: inApp, email, telegram
- Minimum severity selector per category
- Mute/snooze controls with popover

**What's Missing:**
- WebhookManagement import/render
- Section heading (cut off at line 299)
- No webhook configuration visible to user

## createNotification() Function

**Location:** `apps/web/server/services/notificationService.ts` (lines 276-596)

**Current Logic:**
1. Load user preferences (with Redis cache)
2. Check mute status, severity threshold
3. Apply deduplication (groupKey-based)
4. Insert into `userNotifications` table
5. Enqueue Telegram delivery (fire-and-forget)
6. **← NO RATE LIMITING HERE**

**Where to Add Rate Limiting:**
```typescript
// Add after line 296 (start of function):
const cacheKey = `notification:rate:${userId}`;
const limiter = createRateLimiter("notifications", {...});
if (!limiter.isAllowed(cacheKey)) {
  console.log("Notification rate limited", { userId });
  return null; // Silently reject
}
```

## Key Integration Points

### 1. Feature Flag Check
- `requireWebhookDeliveryEnabled(ctx.tenantId)` blocks all webhook ops
- Set via `getTenantFeatureFlags()` in system settings
- UI has no visibility into flag state

### 2. Secret Encryption
- `encrypt(secret)` from `crypto.ts` (AES-256-GCM)
- Key: `process.env.LLM_ENCRYPTION_KEY`
- Stored as `secretEncrypted` in `notificationWebhooks` table

### 3. Webhook Categories
- Hardcoded in both UI and schema
- Must match between `WebhookManagement.tsx` and `notificationWebhooks.ts`
- Used by `mapToCategory()` in `notificationService.ts` to gate deliveries

### 4. Severity Filtering
- User preference: `minSeverity` per category
- Webhook filter: `minSeverity` (null = no filter, all severities)
- Logic: notification only delivered if priority >= minSeverity

## Implementation Checklist

### Add Webhooks Tab (2-3 hours)
- [ ] Add 'webhooks' to SettingsTab type (Settings.tsx:69)
- [ ] Add to tabs array (Settings.tsx:567-578)
- [ ] Add conditional render (Settings.tsx:~1525)
- [ ] Import Webhook icon from lucide-react
- [ ] Import WebhookManagement component
- [ ] Test in browser: Settings → Webhooks tab should show list
- [ ] Verify create/edit/delete work

### Add Rate Limiting (4-6 hours)
- [ ] Decide threshold: 1000/hour vs 10000/hour
- [ ] Choose implementation: in-memory vs Redis
- [ ] Add limiter creation in createNotification()
- [ ] Test with spam notification script
- [ ] Monitor audit logs for rate limit hits
- [ ] Document in help system

### Add Feature Gate UI (1-2 hours)
- [ ] Update NotificationPreferencesPanel to check flag
- [ ] Show "Feature disabled" message if webhooks unavailable
- [ ] Add similar check to WebhookManagement
- [ ] Add help text explaining feature gate
