# Section 11: Phase 7 -- Webhook Delivery

**Status: IMPLEMENTED** (commit pending)

## Implementation Notes

- Schema uses `varchar(36)` for tenantId (matching `tenants.id` PK type), not `integer` as originally spec'd
- BullMQ uses `getRealtimeClient().duplicate()` pattern (matching escalation/digest jobs), not manual URL parsing
- Tenant resolution in `createNotification()` uses `users.currentTenantId` (with String conversion) since users table lacks a direct `tenantId` varchar column
- Feature flag gate deferred to section-13 as designed
- Migration file: `drizzle/0106_marvelous_puck.sql`
- 42 tests passing (33 service + 9 router)

## Overview

This section implements the full webhook delivery subsystem for the enterprise notification system. It covers the `notificationWebhooks` database table, the `notificationWebhookService.ts` service with HMAC-SHA256 signing, SSRF prevention, BullMQ-based delivery with retries and auto-disable, and the tRPC webhook CRUD router. It also adds webhook management UI surfaces to both user settings and admin pages.

Webhook delivery is fire-and-forget from the perspective of `createNotification()`. After a notification is persisted, matching webhooks are identified and delivery jobs are enqueued into BullMQ. Each delivery job resolves the target URL, validates against private IP ranges (SSRF prevention), computes an HMAC signature, and POSTs the notification payload. Failed deliveries are retried with exponential backoff, and webhooks that fail 3 consecutive times are automatically disabled with an admin notification.

## Dependencies

| Section | What it provides | Required before this section? |
|---------|-----------------|-------------------------------|
| section-01-phase4-schema-migration | `userNotifications` table with base columns, enum extension | Yes |
| section-04-phase5-schema-preferences | `notificationPreferences` table, `reminderPriorityEnum` usage | Yes |
| section-05-phase5-preference-delivery | Updated `createNotification()` with preference gate, `mapToCategory()` | Yes |
| section-12-phase7-templates-retention | `notificationTemplateService.ts` for rendering localized content in webhook payloads | Yes |
| section-13-feature-flags-i18n | `NOTIFICATION_WEBHOOK_DELIVERY` feature flag in `featureFlags.ts` | Yes (flag must exist) |

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/web/drizzle/schema.ts` | **Modify** -- add `notificationWebhooks` table definition |
| `apps/web/drizzle/XXXX_notification_webhooks.sql` | **Create** -- generated migration for the new table |
| `apps/web/server/services/notificationWebhookService.ts` | **Create** -- webhook delivery service (SSRF, HMAC, BullMQ) |
| `apps/web/server/services/__tests__/notificationWebhookService.test.ts` | **Create** -- tests for webhook service |
| `apps/web/server/routers/notificationWebhooks.ts` | **Create** -- tRPC CRUD router for webhooks |
| `apps/web/server/routers/__tests__/notificationWebhooks.test.ts` | **Create** -- tests for webhook router |
| `apps/web/server/routers.ts` | **Modify** -- register `notificationWebhooksRouter` |
| `apps/web/server/services/notificationService.ts` | **Modify** -- add webhook enqueue step after DB insert |
| `apps/web/client/src/components/settings/WebhookManagement.tsx` | **Create** -- user webhook management component |
| `apps/web/client/src/components/admin/AdminWebhookManagement.tsx` | **Create** -- admin tenant-wide webhook management component |

## Schema: notificationWebhooks Table

**File:** `apps/web/drizzle/schema.ts`

Add the following table definition after the existing notification-related tables:

```typescript
export const notificationWebhooks = pgTable("notification_webhooks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("userId").references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  url: text("url").notNull(),
  secretEncrypted: text("secretEncrypted").notNull(),
  categories: jsonb("categories").$type<string[] | null>(),
  minSeverity: reminderPriorityEnum("minSeverity"),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  lastDeliveredAt: timestamp("lastDeliveredAt", { withTimezone: true }),
  failureCount: integer("failureCount").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("notification_webhooks_tenant_idx").on(t.tenantId),
  index("notification_webhooks_user_idx").on(t.userId),
]);

export type NotificationWebhook = typeof notificationWebhooks.$inferSelect;
export type InsertNotificationWebhook = typeof notificationWebhooks.$inferInsert;
```

Key design points:

- `userId` is nullable. When null, the webhook is tenant-wide (admin-configured, fires for all users in the tenant). When set, it is user-specific.
- `secretEncrypted` stores the HMAC signing secret encrypted via `encrypt()` from `apps/web/server/services/crypto.ts` (AES-256-GCM, format `iv:authTag:ciphertext`). The raw secret is never stored or returned in API responses.
- `categories` is a nullable JSONB string array. Null means the webhook fires for all notification categories. When set, it acts as a filter (e.g., `["system_health", "media_jobs"]`).
- `minSeverity` uses the existing `reminderPriorityEnum` (`low`, `normal`, `high`, `critical`). Null means no severity filter.
- `failureCount` tracks consecutive delivery failures. At 3 failures, the webhook is auto-disabled.

After editing `schema.ts`, run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push` to generate and apply the migration.

## Tests (Write First)

### Webhook Service Tests

**Test file:** `apps/web/server/services/__tests__/notificationWebhookService.test.ts`

#### Mock Strategy

- Mock `apps/web/server/services/crypto.ts` to control `encrypt()` and `decrypt()` return values.
- Mock `node:dns/promises` to control IP resolution for SSRF tests.
- Mock BullMQ `Queue` to capture enqueued jobs without a real Redis connection.
- Mock the `fetch` global (or `undici`) to capture outgoing HTTP requests during delivery.
- Mock `apps/web/server/services/notificationService.ts` `createNotification` to verify admin alert on auto-disable.
- Use in-memory mock DB (chainable Drizzle pattern) for `notificationWebhooks` queries.

#### Test Stubs

```typescript
// apps/web/server/services/__tests__/notificationWebhookService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/crypto", () => ({
  encrypt: vi.fn((s: string) => `encrypted:${s}`),
  decrypt: vi.fn((s: string) => s.replace("encrypted:", "")),
}));

describe("SSRF Prevention - validateWebhookUrl", () => {
  it("rejects http:// URLs (only HTTPS allowed)");
  it("rejects URLs resolving to 127.0.0.0/8 (loopback)");
  it("rejects URLs resolving to 10.0.0.0/8 (private)");
  it("rejects URLs resolving to 172.16.0.0/12 (private)");
  it("rejects URLs resolving to 192.168.0.0/16 (private)");
  it("rejects URLs resolving to 169.254.0.0/16 (link-local)");
  it("accepts URLs resolving to public IP addresses");
  it("rejects URLs with no hostname");
  it("rejects URLs where DNS resolution fails");
});

describe("HMAC Signing - computeSignature", () => {
  it("computes HMAC-SHA256 over JSON body string");
  it("returns hex-encoded signature string");
  it("produces consistent signature for same body and secret");
  it("produces different signatures for different secrets");
});

describe("Webhook Delivery - deliverWebhook", () => {
  it("sends POST with correct payload format: { event, timestamp, notification }");
  it("includes X-Signature-256 header with HMAC signature");
  it("includes Content-Type: application/json header");
  it("performs DNS rebind check at delivery time (not just creation)");
  it("rejects delivery if resolved IP is private at delivery time");
  it("resets failureCount to 0 on successful delivery");
  it("updates lastDeliveredAt on successful delivery");
  it("increments failureCount on delivery failure");
  it("auto-disables webhook (isEnabled=false) after 3 consecutive failures");
  it("creates admin notification when webhook is auto-disabled");
});

describe("Webhook Matching - findMatchingWebhooks", () => {
  it("returns tenant-wide webhooks (userId=null) for any user in tenant");
  it("returns user-specific webhooks only for that user");
  it("filters by categories when categories is not null");
  it("returns webhook when categories is null (matches all)");
  it("filters by minSeverity (skips lower priority notifications)");
  it("excludes disabled webhooks (isEnabled=false)");
});

describe("BullMQ Job Enqueue - enqueueWebhookDelivery", () => {
  it("enqueues one BullMQ job per matching webhook");
  it("job data includes webhookId, notificationPayload, attemptNumber");
  it("job has retry configuration: 3 attempts, exponential backoff");
  it("enqueue failure does not throw (fire-and-forget)");
});
```

### Webhook Router Tests

**Test file:** `apps/web/server/routers/__tests__/notificationWebhooks.test.ts`

#### Mock Strategy

- Mock `notificationWebhookService` functions.
- Mock the tRPC context with `userId`, `tenantId`, `role` fields.
- Use `createCallerFactory` pattern from existing router tests.

#### Test Stubs

```typescript
// apps/web/server/routers/__tests__/notificationWebhooks.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("notificationWebhooksRouter", () => {
  describe("createWebhook", () => {
    it("validates URL is HTTPS");
    it("rejects URLs that resolve to private IP ranges");
    it("encrypts the secret before storing");
    it("sets tenantId from context");
    it("sets userId from context for user-scoped webhooks");
    it("sets userId=null for admin tenant-wide webhooks");
    it("returns created webhook without secretEncrypted field");
  });

  describe("listWebhooks", () => {
    it("returns only current user's webhooks for protectedProcedure");
    it("returns all tenant webhooks for adminProcedure");
    it("never returns secretEncrypted in response");
  });

  describe("updateWebhook", () => {
    it("validates URL is HTTPS if URL is being updated");
    it("re-encrypts secret if secret is being updated");
    it("rejects update to webhook owned by different user");
    it("allows admin to update tenant-wide webhooks");
  });

  describe("deleteWebhook", () => {
    it("deletes webhook owned by current user");
    it("rejects delete for webhook owned by different user");
    it("allows admin to delete tenant-wide webhooks");
  });

  describe("testWebhook", () => {
    it("sends test payload to webhook URL");
    it("returns success status on 2xx response");
    it("returns failure status with error message on non-2xx");
    it("validates SSRF before sending test");
  });
});
```

## Implementation Guidance

### SSRF Prevention Module

**File:** `apps/web/server/services/notificationWebhookService.ts`

Export a `validateWebhookUrl(url: string): Promise<void>` function that:

1. Parses the URL and verifies the protocol is `https:`.
2. Extracts the hostname.
3. Resolves the hostname to IP addresses using `dns.promises.resolve4()` and optionally `dns.promises.resolve6()`.
4. Checks each resolved IP against private/reserved ranges:
   - `127.0.0.0/8` (loopback)
   - `10.0.0.0/8` (private)
   - `172.16.0.0/12` (private)
   - `192.168.0.0/16` (private)
   - `169.254.0.0/16` (link-local)
   - `0.0.0.0/8` (unspecified)
   - `::1` (IPv6 loopback)
   - `fc00::/7` (IPv6 ULA)
5. Throws an error with a descriptive message if validation fails.

The IP-checking helper should be a pure function `isPrivateIp(ip: string): boolean` that can be tested independently.

This validation runs at two points:
- **Creation time** (in the tRPC `createWebhook` procedure) to reject obviously bad URLs.
- **Delivery time** (in the `deliverWebhook` function) to prevent DNS rebinding attacks where a URL resolves to a public IP at creation but a private IP at delivery.

### HMAC-SHA256 Signing

Export a `computeSignature(body: string, secret: string): string` function that:

1. Creates an HMAC using `crypto.createHmac("sha256", secret)`.
2. Updates with the body string (the JSON-serialized notification payload).
3. Returns the hex digest.

The signature is sent in the `X-Signature-256` header with the format `sha256={hexDigest}`.

### Webhook Delivery

Export a `deliverWebhook(webhookId: number, payload: WebhookPayload): Promise<void>` function that:

1. Loads the webhook row from `notificationWebhooks` by ID.
2. Calls `validateWebhookUrl(webhook.url)` (DNS rebind check).
3. Decrypts the signing secret using `decrypt()` from `crypto.ts`.
4. Serializes the payload as JSON.
5. Computes the HMAC signature over the JSON body.
6. Sends a POST request with:
   - `Content-Type: application/json`
   - `X-Signature-256: sha256={signature}`
   - `User-Agent: SmartSpecPro-Webhook/1.0`
   - Body: the serialized JSON payload
   - Timeout: 10 seconds
7. On success (2xx): resets `failureCount` to 0, updates `lastDeliveredAt`.
8. On failure (non-2xx, timeout, network error): increments `failureCount`.
9. If `failureCount` reaches 3: sets `isEnabled = false` and creates an in-app admin notification via `createNotification()` with `relatedResourceType: "webhook"`, `priority: "high"`, and actionUrl pointing to the webhook settings page.

### Webhook Payload Format

```typescript
interface WebhookPayload {
  event: "notification.created";
  timestamp: string; // ISO 8601
  notification: {
    id: number;
    type: string;
    title: string;
    content: string | null;
    priority: string;
    relatedResourceType: string | null;
    relatedResourceId: string | null;
    actionUrl: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string; // ISO 8601
  };
}
```

### Webhook Matching

Export a `findMatchingWebhooks(tenantId: number, userId: number, category: string, priority: string): Promise<NotificationWebhook[]>` function that:

1. Queries `notificationWebhooks` WHERE:
   - `tenantId = tenantId` AND `isEnabled = true`
   - AND either `userId IS NULL` (tenant-wide) OR `userId = userId` (user-specific)
2. Filters in-memory by `categories` (null matches all, otherwise check array inclusion).
3. Filters in-memory by `minSeverity` using the priority ordering: `low < normal < high < critical`. A webhook with `minSeverity = "high"` skips notifications with priority `low` or `normal`.

Priority ordering constant:

```typescript
const PRIORITY_ORDER: Record<string, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};
```

### BullMQ Job Configuration

Create a `webhookDeliveryQueue` using BullMQ `Queue` with name `"webhook-delivery"`. Each delivery job contains:

```typescript
{
  webhookId: number;
  payload: WebhookPayload;
}
```

Job options:

```typescript
{
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000, // 5s, 25s, 125s
  },
  removeOnComplete: { age: 86400 }, // 24 hours
  removeOnFail: { age: 604800 },    // 7 days
}
```

Create a BullMQ `Worker` that processes jobs by calling `deliverWebhook(job.data.webhookId, job.data.payload)`.

The worker should be initialized in `apps/web/server/jobs/notificationJobs.ts` (created in section-06) alongside the escalation and digest workers.

### Integration with createNotification()

**File:** `apps/web/server/services/notificationService.ts`

After the existing fire-and-forget steps (DB insert, Telegram enqueue, Redis pub/sub), add a webhook enqueue step:

1. Check `NOTIFICATION_WEBHOOK_DELIVERY` feature flag.
2. If enabled, call `findMatchingWebhooks(tenantId, userId, category, priority)` where `category` comes from the `mapToCategory()` helper (section-05) and `tenantId` is resolved from the user's context.
3. For each matching webhook, call `enqueueWebhookDelivery(webhookId, payload)`.
4. Wrap in try/catch -- webhook enqueue failures must not propagate. Log errors with `logger.error("webhook_enqueue_failed", { webhookId, error })`.

This follows the same fire-and-forget pattern as the existing Telegram enqueue step.

### tRPC Router

**File:** `apps/web/server/routers/notificationWebhooks.ts`

Define `notificationWebhooksRouter` using `router({...})` with these procedures:

#### listWebhooks (protectedProcedure)

Input: `{ scope: "user" | "tenant" }` (tenant scope requires admin role check).

For `scope: "user"`: query WHERE `userId = ctx.userId`.
For `scope: "tenant"`: verify `ctx.role` is admin, query WHERE `tenantId = ctx.tenantId AND userId IS NULL`.

Strip `secretEncrypted` from all returned rows. Return `{ ...webhook, hasSecret: true }` instead.

#### createWebhook (protectedProcedure)

Input Zod schema:

```typescript
z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(2000),
  secret: z.string().min(16).max(256),
  categories: z.array(z.string()).nullable().optional(),
  minSeverity: z.enum(["low", "normal", "high", "critical"]).nullable().optional(),
  scope: z.enum(["user", "tenant"]),
})
```

Steps:
1. If `scope === "tenant"`, verify admin role.
2. Call `validateWebhookUrl(input.url)` -- throws on SSRF violation.
3. Encrypt the secret: `encrypt(input.secret)`.
4. Insert into `notificationWebhooks` with `userId = scope === "user" ? ctx.userId : null`.
5. Return the created webhook (without `secretEncrypted`).

#### updateWebhook (protectedProcedure)

Input: `{ id: number, name?: string, url?: string, secret?: string, categories?: string[] | null, minSeverity?: string | null, isEnabled?: boolean }`.

Steps:
1. Load webhook by ID.
2. Ownership check: if webhook has `userId`, verify it matches `ctx.userId`. If `userId` is null, verify admin role.
3. If `url` is provided, call `validateWebhookUrl(url)`.
4. If `secret` is provided, encrypt it.
5. Update fields that are provided. Reset `failureCount` to 0 if `isEnabled` is being set to true (re-enable).

#### deleteWebhook (protectedProcedure)

Input: `{ id: number }`.

Steps:
1. Load webhook by ID.
2. Ownership check (same as updateWebhook).
3. Delete the row.

#### testWebhook (protectedProcedure)

Input: `{ id: number }`.

Steps:
1. Load webhook by ID with ownership check.
2. Call `validateWebhookUrl(webhook.url)` (re-validate in case DNS changed).
3. Send a test payload: `{ event: "webhook.test", timestamp: new Date().toISOString(), notification: { id: 0, type: "system", title: "Test webhook", content: "This is a test delivery from SmartSpecPro.", priority: "normal", ... } }`.
4. Return `{ success: boolean, statusCode?: number, error?: string }`.

### Router Registration

**File:** `apps/web/server/routers.ts`

Add import and register:

```typescript
import { notificationWebhooksRouter } from "./routers/notificationWebhooks";

// In the appRouter definition:
notificationWebhooks: notificationWebhooksRouter,
```

### Frontend: User Webhook Management

**File:** `apps/web/client/src/components/settings/WebhookManagement.tsx`

This component is embedded in the `/settings/notifications` page (created in section-07) as a collapsible section below the preference grid.

UI elements:
- Table showing user's webhooks: name, URL (truncated), categories (badges), status (enabled/disabled), last delivered, failure count.
- "Add Webhook" button opening a dialog/modal with form fields: name, URL (HTTPS only), secret (password input with generate button), categories (multi-select), min severity (dropdown).
- Row actions: Edit, Test (calls `testWebhook`), Delete (with confirmation).
- Test result shown as a toast (Sonner) -- success or failure with status code.
- TanStack Query hooks: `trpc.notificationWebhooks.listWebhooks.useQuery({ scope: "user" })`.

### Frontend: Admin Webhook Management

**File:** `apps/web/client/src/components/admin/AdminWebhookManagement.tsx`

This component is embedded in the `/admin/alert-rules` page (created in section-07) as an additional tab "Webhooks".

Same UI pattern as the user component but with `scope: "tenant"`. Shows tenant-wide webhooks. Admin can also see webhooks that have been auto-disabled (highlighted in red with failure count).

### Security Checklist (S9)

| Requirement | Implementation | Verification |
|-------------|---------------|--------------|
| Webhook secrets encrypted at rest | `encrypt()` from `crypto.ts` (AES-256-GCM) | Test: `createWebhook` calls `encrypt`; DB column never stores plaintext |
| SSRF prevention at creation | `validateWebhookUrl()` blocks http://, private IPs | Test: rejects `http://`, `https://127.0.0.1`, `https://10.x.x.x`, etc. |
| SSRF prevention at delivery (DNS rebind) | `validateWebhookUrl()` called again before POST | Test: mock DNS to return private IP at delivery time |
| HMAC signing | `X-Signature-256: sha256={hmac}` header on every delivery | Test: verify header present and value matches expected HMAC |
| Auto-disable on failure | `failureCount >= 3` sets `isEnabled = false` | Test: 3 failed deliveries disables webhook |
| Admin notification on auto-disable | `createNotification()` called for admin | Test: verify notification created with webhook resource type |
| Secret never returned in API | `secretEncrypted` stripped from all list/get responses | Test: response objects lack `secretEncrypted` |
| Ownership isolation | User can only CRUD their own webhooks; admin for tenant-wide | Test: cross-user access returns 403 |

### Observability

- **Structured log on delivery success:** `logger.info("webhook_delivered", { webhookId, notificationId, statusCode, durationMs })`
- **Structured log on delivery failure:** `logger.warn("webhook_delivery_failed", { webhookId, notificationId, statusCode, error, failureCount })`
- **Structured log on auto-disable:** `logger.error("webhook_auto_disabled", { webhookId, tenantId, failureCount })`
- **Counter:** `notification_channel_delivery_total` with labels `channel: "webhook"`, `status: "success" | "failure"`
- **Counter:** `notification_channel_failure_total` with label `channel: "webhook"`
- **Histogram:** `notification_delivery_lag_ms` with label `channel: "webhook"` (time from enqueue to delivery completion)

### Feature Flag

The `notificationWebhookDelivery` flag (defined in section-13) gates:
1. The webhook enqueue step in `createNotification()`.
2. When false, the webhook CRUD router still functions (admins can configure webhooks before enabling delivery), but no deliveries are actually dispatched.

### Dead Letter Queue / Failed Job Monitoring

BullMQ is configured with `removeOnFail: { age: 604800 }` (7-day retention for failed delivery jobs). Failed webhook jobs are visible at `/admin/queues` (existing admin queue dashboard). After 3 consecutive failures, the webhook is auto-disabled and an admin notification is created — failed jobs remain in the queue for investigation.

Admin can re-enable a disabled webhook via the webhook management UI (section-07's admin tab or user settings). Re-enabling resets `failureCount` to 0.