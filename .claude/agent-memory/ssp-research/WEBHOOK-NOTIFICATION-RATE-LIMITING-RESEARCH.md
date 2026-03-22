---
name: Webhook Management UI and Rate Limiting Research
description: Current state of webhook management UI, notification creation rate limiting, and integration points
type: project
---

# Webhook Management UI & Notification Rate Limiting Research

**Research Date:** 2026-03-21

## Executive Summary

**Webhook Management UI:**
- User webhooks: Embedded in Settings → Notifications tab via `NotificationPreferencesPanel.tsx`
- Admin webhooks: Separate admin-only component at `AdminWebhookManagement.tsx`
- Component is feature-complete with create/update/delete/test operations
- **NOTE:** WebhookManagement is NOT currently rendered in NotificationPreferencesPanel — it exists but is unused

**Rate Limiting on createNotification():**
- No rate limiting currently exists on `createNotification()` function
- Rate limiting infrastructure exists for other services (API keys, media, drive access)
- Redis available for distributed rate limiting via `getRedisClient()`
- Simple in-memory Bottleneck/sliding window patterns used elsewhere

**Settings Page Tabs:**
- 10 tabs defined: profile, account, security, preferences, notifications, automation, api, billing, integrations, personas
- Notifications tab renders `NotificationPreferencesPanel` only (no webhook section visible)
- WebhookManagement component exists but is orphaned/not integrated

---

## Findings Detail

### 1. Webhook Management UI

#### Component Location & Structure

**User Webhooks Component:**
- File: `/apps/web/client/src/components/settings/WebhookManagement.tsx`
- Scope: Supports both `"user"` and `"tenant"` scopes
- Props: `scope?: "user" | "tenant"` (default: "user")

**Admin Webhooks Component:**
- File: `/apps/web/client/src/components/admin/AdminWebhookManagement.tsx`
- Simply wraps WebhookManagement with `scope="tenant"`
- Returns: `<WebhookManagement scope="tenant" />`

#### Current Implementation Details

**WebhookManagement Features (lines 86-366):**
- List webhooks with status badges (disabled, failure count)
- Create webhook via dialog (name, HTTPS URL, secret, categories, minSeverity)
- Edit webhook (name, URL, secret, filters)
- Delete webhook with confirmation dialog
- Test webhook with immediate response (statusCode, success/error)
- Categories hardcoded: `["system_health", "media_jobs", "workflow", "skill", "feedback", "agency", "follow", "scheduled", "security", "business"]`
- Min severity levels: `["low", "normal", "high", "critical"]` or null

**Form Component:**
- `WebhookForm()` (lines 368-468) handles input validation
- Secret generation via `generateSecret()` (lines 66-76) — 32 random chars
- UI shows category badges as clickable toggles
- Edit mode shows "(leave blank to keep)" for secret field

**tRPC Procedures Used (via WebhookManagement):**
1. `trpc.notificationWebhooks.listWebhooks.useQuery({ scope })`
2. `trpc.notificationWebhooks.createWebhook.useMutation()`
3. `trpc.notificationWebhooks.updateWebhook.useMutation()`
4. `trpc.notificationWebhooks.deleteWebhook.useMutation()`
5. `trpc.notificationWebhooks.testWebhook.useMutation()`

#### Router Implementation

**File:** `/apps/web/server/routers/notificationWebhooks.ts`

**Procedures:**
1. `listWebhooks` (line 98-135)
   - Input: `{ scope: "user" | "tenant" }`
   - Auth: Checks admin for "tenant" scope
   - Returns: Array with secrets stripped (only `hasSecret: true`)

2. `createWebhook` (line 137-150+)
   - Input: name, url, secret (min 16 chars), categories[], minSeverity
   - Validates webhook URL via `validateWebhookUrl()`
   - Encrypts secret via `encrypt()`
   - Scope enforcement: admin-only for "tenant"

3. `updateWebhook` (line 62-90)
   - Input: id, optional fields (name, url, secret, categories, minSeverity, isEnabled)
   - Partial updates supported

4. `testWebhook` (defined but payload not shown)
   - Calls `deliverWebhook()` from notificationWebhookService
   - Returns: `{ success: boolean, statusCode?: number, error?: string }`

5. `deleteWebhook` (defined but implementation not shown)

**Authentication/Authorization:**
- All protected procedures: `protectedProcedure` (user required)
- Admin procedures check: `ctx.user.role !== "admin" && ctx.user.role !== "system_agent"`
- Feature gate: `requireWebhookDeliveryEnabled(tenantId)` checks tenant flag before allowing ops

#### Where It's Rendered (Integration Gap)

**Settings.tsx Tabs:**
- Line 69: `type SettingsTab = 'profile' | 'account' | 'security' | 'preferences' | 'notifications' | ...`
- Line 572: Notifications tab exists in tab array
- Line 1524: `{activeTab === 'notifications' && <NotificationPreferencesPanel />}`

**NotificationPreferencesPanel.tsx:**
- Lines 148-501: Full component implementation
- Does NOT import or render `WebhookManagement`
- Renders: preference grid (10 categories × 4 channels + severity + mute)
- No webhook section visible

**Current Gap:**
- WebhookManagement component exists and is fully functional
- NOT integrated into NotificationPreferencesPanel
- NOT visible in Settings → Notifications tab
- Admin version only referenced in imports but location unclear

---

### 2. Rate Limiting on createNotification()

#### Current State: NO RATE LIMITING

**Function:** `/apps/web/server/services/notificationService.ts` (line 276)

```typescript
async function createNotification(
  params: CreateNotificationParams
): Promise<{ notificationId: number; deduplicated: boolean; channels?: ChannelFlags } | null>
```

**Current Flow (lines 276-596):**
1. Loads user notification preferences (with Redis caching)
2. Checks mute status, severity threshold, channel availability
3. Applies deduplication logic (groupKey-based)
4. Inserts notification into `userNotifications` table
5. Enqueues Telegram delivery (fire-and-forget)
6. **NO rate limiting checks anywhere**

**Called From:**
- Multiple service files (search result shows 30+ grepped files)
- No validation that caller has rate limit budget
- Direct invocation without middleware protection

#### Rate Limiting Infrastructure Available

**1. Existing Rate Limiter Service:**
- File: `/apps/web/server/services/rateLimiter.ts`
- Pattern: In-memory sliding window with Bottleneck-like interface
- Config: `{ windowMs, maxRequests, blockDurationMs }`
- Methods: `isAllowed(key)`, `getRemaining(key)`, `getResetTime(key)`
- Used by: API key rate limiter, media generation, drive access

**Example Usage Pattern (from code):**
```typescript
const limiter = createRateLimiter("api-keys", {
  windowMs: 60_000,      // 1 minute
  maxRequests: 100,      // 100 requests per minute
  blockDurationMs: 10_000, // 10 second block after limit hit
});

if (!limiter.isAllowed(userId)) {
  throw new Error("Rate limited");
}
```

**2. Redis Client Available:**
- File: `/apps/web/server/services/redis.ts`
- Export: `getRedisClient(): Redis` (IORedis instance)
- Methods: `get()`, `set()`, `incr()`, `expire()`, etc.
- Already used in notificationService for preference caching (line 206-247)

**3. Other Rate Limiters in Codebase:**
- `apiKeyRateLimiter.ts` — API key usage tracking
- `googleDriveRateLimiter.ts` — Drive API quota limiting
- `oneDriveRateLimiter.ts` — OneDrive API quota limiting
- `llmRateLimiter.ts` — LLM provider request limiting

#### Where Rate Limiting Could Be Applied

**Option A: In createNotification() itself**
- Simplest: add check before preference loading
- Pros: Blocks spam at source
- Cons: Every notification creation call must provide userId + check

**Option B: In notification router/procedure**
- More typical pattern for public APIs
- Check in handler before calling service
- Allows different limits per endpoint

**Option C: In middleware**
- Express middleware at server level
- Would cover all notification creation endpoints
- Harder to distinguish notification types

**Current Usage Pattern (from NotificationPreferencesPanel):**
- Notifications NOT created via tRPC (read-only prefs)
- Created internally by services (media jobs, follow requests, etc.)
- No public API endpoint for user-initiated notifications

---

### 3. Settings Page Tab Structure

#### Tab Definition

**File:** `/apps/web/client/src/pages/Settings.tsx` (line 567-578)

```typescript
const tabs: Array<{ id: SettingsTab; label: string; icon: any }> = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: Mail },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'preferences', label: 'Preferences', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
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

#### Tab Rendering

**Navigation (lines 637-650):**
- Horizontal scroll on mobile, vertical on desktop
- Highlight active tab with gradient background
- Click updates `activeTab` state

**Content Dispatch (lines 670-1524):**
- Each tab has `{activeTab === 'tabId' && <Component />}` conditional
- Notifications tab (line 1524): `<NotificationPreferencesPanel />`

#### Tab Contents

| Tab | Component | Content |
|-----|-----------|---------|
| profile | Inline | Name, email, upload photo |
| account | Inline | Account type, language, timezone |
| security | TwoFactorSection() | 2FA setup/disable, recovery codes |
| preferences | Inline | Color scheme, timezone, display options |
| **notifications** | **NotificationPreferencesPanel** | **Preference grid only** |
| automation | UserAutomationPreferencesPanel | Automation triggers, schedule |
| api | UserAPIKeysPanel | Create/revoke API keys |
| billing | BudgetPanel | Budget limits, usage tracking |
| integrations | GoogleDrivePanel, OneDrivePanel | OAuth connections |
| personas | PersonasPanel | Persona creation/management |

---

## Risks & Gaps

### Webhook Management Integration Gap

1. **Component Exists But Unused**
   - WebhookManagement is feature-complete
   - Never rendered in NotificationPreferencesPanel
   - No visible path for users to manage webhooks in Settings
   - Admin version references only in admin module, exact location unclear

2. **Missing Feature Gate UI**
   - Webhooks require feature flag check (`requireWebhookDeliveryEnabled`)
   - No UI indication if feature is disabled
   - Users would see nothing vs "feature not available"

3. **Scope Handling**
   - User webhooks: via user ID isolation
   - Tenant webhooks: admin-only, requires admin check
   - UI layer doesn't prevent user from accessing admin panel code

### Rate Limiting Gaps

1. **Notification Spam Vulnerability**
   - No limit on notification creation rate per user
   - Escalation job could generate many notifications
   - Guardian could trigger hundreds in cascade
   - No daily/hourly budget per user

2. **Silent Failures**
   - Telegram delivery is fire-and-forget (doesn't fail createNotification)
   - Rate limiting on Telegram send would be silently logged
   - No user feedback if delivery rate-limited

3. **Infrastructure Mismatch**
   - Existing pattern uses in-memory limiter (not Redis)
   - In-memory doesn't share across server instances
   - Monolithic server works; multi-instance deployment breaks

### NotificationPreferencesPanel Issues

1. **Incomplete Implementation**
   - Panel title missing (lines 295-299 cut off)
   - Only renders preference grid
   - No section heading visible in output

2. **Feature Flag Logic**
   - `useNotificationPreferencesEnabled()` queries `/api/tenant/current`
   - Defaults to true if flag missing
   - Formal flag not yet added to TenantFeatureFlags (per comment line 128-130)

---

## Options for Implementation

### Option 1: Add Webhooks Tab to Settings

**Scope:**
- Create new `webhooks` tab in Settings.tsx
- Import WebhookManagement in Settings.tsx
- Render in conditional: `{activeTab === 'webhooks' && <WebhookManagement scope="user" />}`
- Add icon and label to tabs array

**Effort:** 2-3 hours
**Risk:** None (component already tested)
**Benefit:** Users can manage webhooks without admin access

### Option 2: Embed Webhooks in Notifications Tab

**Scope:**
- Import WebhookManagement in NotificationPreferencesPanel
- Add section below preference grid
- Pass `scope="user"` prop

**Effort:** 1-2 hours
**Risk:** Notifications tab becomes crowded
**Benefit:** Related features grouped together

### Option 3: Add Rate Limiting to createNotification()

**Scope:**
- Define limiter config (e.g., 1000 notifs/hour per user)
- Check `limiter.isAllowed(userId)` before preferences check
- Return null or throw error if rate limited
- Log rate limit hits for monitoring

**Effort:** 2-4 hours (depends on Redis vs in-memory choice)
**Risk:** May break internal services if limits too strict
**Benefit:** Blocks notification spam at source

### Option 4: Add Webhook Delivery Rate Limiting

**Scope:**
- Implement exponential backoff for webhook failures
- Track delivery attempts per webhook
- Auto-disable after N consecutive failures (already in schema: `failureCount`, `isEnabled`)
- Limit concurrent deliveries to N per second

**Effort:** 4-6 hours (backoff + concurrency control)
**Risk:** Requires Telegram/external API testing
**Benefit:** Prevents webhook hammer attacks

---

## Key Files Summary

| File | Lines | Purpose |
|------|-------|---------|
| `WebhookManagement.tsx` | 1-469 | User/tenant webhook CRUD UI |
| `AdminWebhookManagement.tsx` | 1-10 | Admin wrapper (scope="tenant") |
| `notificationWebhooks.ts` (router) | 1-200+ | tRPC procedures for webhook ops |
| `notificationService.ts` | 276-596 | Notification creation logic (no rate limiting) |
| `NotificationPreferencesPanel.tsx` | 148-501 | Preference grid UI (no webhook section) |
| `Settings.tsx` | 67-1524 | Tab routing (notifications tab exists) |
| `rateLimiter.ts` | 1-100+ | In-memory sliding window limiter |
| `redis.ts` | 1-100+ | IORedis singleton client |

---

## Recommendations

### Immediate (High Priority)

1. **Add Webhooks Tab to Settings**
   - Makes WebhookManagement accessible to users
   - 2-3 hour task, no risk
   - Unblocks webhook delivery feature

2. **Add Feature Gate UI**
   - Show message if `notificationWebhookDelivery` flag disabled
   - Matches existing pattern in other panels

### Medium Priority

3. **Add Notification Creation Rate Limiting**
   - Prevent spam/DOS via notification API
   - Use Redis limiter (shared across instances)
   - 4-6 hours including testing

4. **Document Webhook Categories**
   - Help section explaining each category
   - When to use severity filters vs categories

### Low Priority

5. **Webhook Delivery Hardening**
   - Exponential backoff for failures
   - Circuit breaker per webhook
   - 6-8 hours, lower priority

---

## Next Steps for Implementation

1. Read `/apps/web/server/services/notificationWebhookService.ts` for full webhook delivery logic
2. Check `drizzle/schema.ts` for `notificationWebhooks` table design (constraints, indexes)
3. Verify `getTenantFeatureFlags()` return type to understand feature flag structure
4. Test WebhookManagement component in admin panel (if deployed)
5. Plan rate limit thresholds with product/security team
