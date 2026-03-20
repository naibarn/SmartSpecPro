# Section 04: Phase 5 Schema -- Notification Preferences, Alert Rules, and Escalation Policies

## Section ID
`section-04-phase5-schema-preferences`

## Goal
Create three new database tables (`notificationPreferences`, `alertRules`, `escalationPolicies`) in the Drizzle schema, generate and apply the migration, and add tRPC routers with full CRUD operations for all three tables. This section covers the **data layer only** -- preference-aware delivery logic is in section-05, the escalation job in section-06, and frontend pages in section-07.

## Dependencies
- **section-01-phase4-schema-migration** must be complete (the `reminderPriorityEnum` referenced by these tables already exists in `drizzle/schema.ts` at line 2937).
- No dependency on section-02 or section-03.

## Blocked By This Section
- **section-05-phase5-preference-delivery** -- reads from the tables created here.
- **section-06-phase5-escalation-job** -- queries `escalationPolicies` and `alertRules`.
- **section-07-phase5-frontend-settings** -- calls the tRPC routers created here.

---

## 1. Tests (TDD -- Write First)

All tests use Vitest. Test files go in `apps/web/server/routers/__tests__/`.

### 1.1 Schema Validation Tests

**File**: `apps/web/server/routers/__tests__/notificationPreferences.test.ts`

```
describe("notificationPreferences schema", () => {
  it("enforces unique constraint on (userId, category)")
  it("inserts a preference with all fields populated")
  it("accepts emailDigestFrequency values 'hourly' and 'daily'")
  it("rejects emailDigestFrequency values other than 'hourly' or 'daily' at Zod level")
  it("defaults inApp to true, email to false, telegram to false")
})
```

**File**: `apps/web/server/routers/__tests__/alertRules.test.ts`

```
describe("alertRules schema", () => {
  it("enforces operator allowlist at Zod validation level -- accepts gt, lt, gte, lte, eq")
  it("rejects non-allowlisted operators (!=, LIKE, >, <, eval, etc.) at Zod level")
  it("stores channels as JSON string array")
  it("defaults severity to 'high', isEnabled to true, cooldownMinutes to 10")
})

describe("escalationPolicies schema", () => {
  it("inserts an escalation policy with all required fields")
  it("defaults isEnabled to true")
})
```

### 1.2 tRPC Router Tests -- Notification Preferences

**File**: `apps/web/server/routers/__tests__/notificationPreferences.test.ts` (same file, additional describe blocks)

```
describe("notificationPreferencesRouter", () => {
  describe("getPreferences", () => {
    it("returns all preferences for the authenticated user")
    it("returns empty array when user has no preferences")
    it("does not return preferences belonging to other users")
  })

  describe("upsertPreference", () => {
    it("creates a new preference if none exists for the category")
    it("updates an existing preference for the same category")
    it("validates category is in the allowed list of 10 categories")
    it("rejects unknown category values")
    it("validates emailDigestHour is 0-23 when provided")
  })

  describe("snoozeCategory", () => {
    it("sets mutedUntil to the provided future timestamp")
    it("clears mutedUntil when called with null")
    it("rejects mutedUntil timestamps in the past")
  })
})
```

### 1.3 tRPC Router Tests -- Alert Rules

**File**: `apps/web/server/routers/__tests__/alertRules.test.ts` (same file, additional describe blocks)

```
describe("alertRulesRouter", () => {
  describe("listRules", () => {
    it("requires admin role -- rejects non-admin users")
    it("returns rules scoped to the current tenant only")
    it("supports pagination with limit and offset")
  })

  describe("createRule", () => {
    it("requires admin role")
    it("validates operator is in allowlist [gt, lt, gte, lte, eq]")
    it("rejects operator values not in allowlist")
    it("validates metricName is non-empty string")
    it("validates threshold is a finite number")
    it("validates windowMinutes is a positive integer")
    it("creates rule with correct tenantId from context")
  })

  describe("updateRule", () => {
    it("requires admin role")
    it("validates operator allowlist on update")
    it("rejects update for rule belonging to different tenant")
  })

  describe("deleteRule", () => {
    it("requires admin role")
    it("deletes only if rule belongs to current tenant")
    it("returns not found for non-existent rule ID")
  })

  describe("listEscalationPolicies", () => {
    it("requires admin role")
    it("returns policies scoped to current tenant")
  })

  describe("createEscalationPolicy", () => {
    it("requires admin role")
    it("creates policy with correct tenantId from context")
    it("validates triggerMinutes is a positive integer")
    it("requires at least one of escalateToRole or escalateToUserId")
  })

  describe("updateEscalationPolicy", () => {
    it("requires admin role and tenant match")
  })

  describe("deleteEscalationPolicy", () => {
    it("requires admin role and tenant match")
  })
})
```

---

## 2. Schema Definitions

**File to modify**: `apps/web/drizzle/schema.ts`

Add the three new tables immediately after the `userNotifications` table and its type exports (after line ~3132). All tables use camelCase column naming consistent with the existing schema.

### 2.1 Notification Category Constants

Define a constant array for the 10 valid notification categories. This is used by both the schema (documentation) and Zod validation (enforcement).

```
NOTIFICATION_CATEGORIES = [
  "system_health", "media_jobs", "workflow", "skill",
  "feedback", "agency", "follow", "scheduled",
  "security", "business"
] as const
```

Export this from schema.ts so routers can import it for Zod validation.

### 2.2 Table: `notificationPreferences`

SQL table name: `notification_preferences`

| Column | Drizzle Type | Constraints |
|--------|-------------|-------------|
| `id` | `serial("id").primaryKey()` | PK |
| `userId` | `integer("userId").references(() => users.id, { onDelete: "cascade" }).notNull()` | FK |
| `category` | `varchar("category", { length: 50 }).notNull()` | One of 10 categories |
| `inApp` | `boolean("inApp").default(true).notNull()` | |
| `email` | `boolean("email").default(false).notNull()` | |
| `telegram` | `boolean("telegram").default(false).notNull()` | |
| `minSeverity` | `reminderPriorityEnum("minSeverity")` | Nullable -- null means all |
| `mutedUntil` | `timestamp("mutedUntil", { withTimezone: true })` | Nullable |
| `emailDigestFrequency` | `varchar("emailDigestFrequency", { length: 10 })` | Nullable -- "hourly" or "daily" |
| `emailDigestHour` | `integer("emailDigestHour")` | Nullable -- 0-23 for daily digest |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` | |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` | |

**Indexes**:
- `uniqueIndex("notification_preferences_user_category").on(t.userId, t.category)`

**Type exports**:
- `NotificationPreference = typeof notificationPreferences.$inferSelect`
- `InsertNotificationPreference = typeof notificationPreferences.$inferInsert`

### 2.3 Table: `alertRules`

SQL table name: `alert_rules`

| Column | Drizzle Type | Constraints |
|--------|-------------|-------------|
| `id` | `serial("id").primaryKey()` | PK |
| `tenantId` | `integer("tenantId").references(() => tenants.id, { onDelete: "cascade" }).notNull()` | FK, tenant isolation |
| `name` | `varchar("name", { length: 100 }).notNull()` | |
| `description` | `text("description")` | Nullable |
| `metricName` | `varchar("metricName", { length: 100 }).notNull()` | |
| `operator` | `varchar("operator", { length: 10 }).notNull()` | Validated: gt, lt, gte, lte, eq |
| `threshold` | `doublePrecision("threshold").notNull()` | |
| `windowMinutes` | `integer("windowMinutes").default(5).notNull()` | |
| `severity` | `reminderPriorityEnum("severity").default("high").notNull()` | |
| `channels` | `jsonb("channels").$type<string[]>().default(["in_app"]).notNull()` | |
| `targetRole` | `varchar("targetRole", { length: 20 })` | Nullable |
| `targetUserId` | `integer("targetUserId")` | Nullable |
| `cooldownMinutes` | `integer("cooldownMinutes").default(10).notNull()` | |
| `lastTriggeredAt` | `timestamp("lastTriggeredAt", { withTimezone: true })` | Nullable |
| `isEnabled` | `boolean("isEnabled").default(true).notNull()` | |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` | |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` | |

**Indexes**:
- `index("alert_rules_tenant_enabled").on(t.tenantId, t.isEnabled)`

**Security (S7)**: The `operator` column stores symbolic names only (`gt`, `lt`, `gte`, `lte`, `eq`). The Zod input schema for `createRule` and `updateRule` must use `z.enum(["gt", "lt", "gte", "lte", "eq"])`. Evaluation in the escalation job (section-06) uses a TypeScript switch statement -- never `eval()` or string interpolation.

**Type exports**:
- `AlertRule = typeof alertRules.$inferSelect`
- `InsertAlertRule = typeof alertRules.$inferInsert`

### 2.4 Table: `escalationPolicies`

SQL table name: `escalation_policies`

| Column | Drizzle Type | Constraints |
|--------|-------------|-------------|
| `id` | `serial("id").primaryKey()` | PK |
| `tenantId` | `integer("tenantId").references(() => tenants.id, { onDelete: "cascade" }).notNull()` | FK |
| `name` | `varchar("name", { length: 100 }).notNull()` | |
| `triggerSeverity` | `reminderPriorityEnum("triggerSeverity").notNull()` | |
| `triggerMinutes` | `integer("triggerMinutes").notNull()` | |
| `escalateToRole` | `varchar("escalateToRole", { length: 20 })` | Nullable |
| `escalateToUserId` | `integer("escalateToUserId")` | Nullable |
| `escalateChannels` | `jsonb("escalateChannels").$type<string[]>().notNull()` | |
| `escalateMessage` | `text("escalateMessage")` | Nullable |
| `isEnabled` | `boolean("isEnabled").default(true).notNull()` | |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` | |

**Indexes**:
- `index("escalation_policies_tenant_enabled").on(t.tenantId, t.isEnabled)`

**Type exports**:
- `EscalationPolicy = typeof escalationPolicies.$inferSelect`
- `InsertEscalationPolicy = typeof escalationPolicies.$inferInsert`

---

## 3. Migration

After adding the three tables to `apps/web/drizzle/schema.ts`, run:

```
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push
```

This generates a migration SQL file (e.g., `drizzle/XXXX_preferences_rules.sql`) containing:
- `CREATE TABLE notification_preferences` with the unique index
- `CREATE TABLE alert_rules` with the tenant-enabled index
- `CREATE TABLE escalation_policies` with the tenant-enabled index

Verify after migration:
- All three tables exist in PostgreSQL
- Unique index on `notification_preferences(userId, category)` is present
- Row counts for all existing tables are unchanged (additive-only migration)

---

## 4. tRPC Router: Notification Preferences

**New file**: `apps/web/server/routers/notificationPreferences.ts`

### Zod Schemas

Define input schemas:

- `categorySchema`: `z.enum(NOTIFICATION_CATEGORIES)` -- enforces the 10 valid categories
- `upsertPreferenceInput`: object with `category` (required), `inApp` (boolean optional), `email` (boolean optional), `telegram` (boolean optional), `minSeverity` (enum optional, nullable), `mutedUntil` (string datetime optional, nullable), `emailDigestFrequency` (enum "hourly"/"daily" optional, nullable), `emailDigestHour` (number 0-23 optional, nullable)
- `snoozeCategoryInput`: object with `category` (required), `mutedUntil` (string datetime, nullable)

### Procedures

**`getPreferences`** -- `protectedProcedure.query`
- Query: `SELECT * FROM notification_preferences WHERE userId = ctx.user.id`
- Returns: array of `NotificationPreference`

**`upsertPreference`** -- `protectedProcedure.input(upsertPreferenceInput).mutation`
- Uses Drizzle `onConflictDoUpdate` targeting the unique index `(userId, category)`
- On conflict: update all channel/severity/mute/digest fields, set `updatedAt = now()`
- **After DB write**: invalidate the Redis preference cache by calling `redis.del(`notification:prefs:${ctx.user.id}:${input.category}`)` (section-05 caches preferences with 60s TTL under this key pattern). This ensures preference changes take effect immediately.
- Returns: the upserted row

**`snoozeCategory`** -- `protectedProcedure.input(snoozeCategoryInput).mutation`
- Validates `mutedUntil` is in the future (if not null)
- Updates `mutedUntil` on the existing preference row for `(userId, category)`
- If no preference row exists, creates one with defaults + the mute timestamp
- Returns: the updated row

---

## 5. tRPC Router: Alert Rules and Escalation Policies

**New file**: `apps/web/server/routers/alertRules.ts`

### Zod Schemas

- `operatorSchema`: `z.enum(["gt", "lt", "gte", "lte", "eq"])` -- **S7 security constraint**
- `createRuleInput`: object with `name` (string 1-100), `description` (string optional), `metricName` (string 1-100), `operator` (operatorSchema), `threshold` (number finite), `windowMinutes` (integer positive, default 5), `severity` (enum optional, default "high"), `channels` (string array, default ["in_app"]), `targetRole` (string optional), `targetUserId` (integer optional), `cooldownMinutes` (integer positive, default 10), `isEnabled` (boolean, default true)
- `updateRuleInput`: `createRuleInput.partial()` plus `id` (number required)
- `createEscalationPolicyInput`: object with `name` (string 1-100), `triggerSeverity` (enum), `triggerMinutes` (integer positive), `escalateToRole` (string optional), `escalateToUserId` (integer optional), `escalateChannels` (string array), `escalateMessage` (string optional), `isEnabled` (boolean, default true). Apply `.refine()` to require at least one of `escalateToRole` or `escalateToUserId`.
- `updateEscalationPolicyInput`: partial plus `id` (number required), same refine

### Procedures -- Alert Rules

All procedures use `adminProcedure` (requires admin role).

**`listRules`** -- `adminProcedure.input(paginationInput).query`
- Query: `SELECT * FROM alert_rules WHERE tenantId = ctx.tenantId ORDER BY createdAt DESC LIMIT input.limit OFFSET input.offset`
- Returns: `{ rules: AlertRule[], total: number }`

**`createRule`** -- `adminProcedure.input(createRuleInput).mutation`
- Insert with `tenantId = ctx.tenantId`
- Returns: the created rule

**`updateRule`** -- `adminProcedure.input(updateRuleInput).mutation`
- Update WHERE `id = input.id AND tenantId = ctx.tenantId`
- Throw `NOT_FOUND` if no rows affected (tenant isolation)
- Returns: the updated rule

**`deleteRule`** -- `adminProcedure.input(z.object({ id: z.number() })).mutation`
- Delete WHERE `id = input.id AND tenantId = ctx.tenantId`
- Throw `NOT_FOUND` if no rows affected

### Procedures -- Escalation Policies

**`listEscalationPolicies`** -- `adminProcedure.input(paginationInput).query`
- Scoped to `tenantId = ctx.tenantId`

**`createEscalationPolicy`** -- `adminProcedure.input(createEscalationPolicyInput).mutation`
- Insert with `tenantId = ctx.tenantId`

**`updateEscalationPolicy`** -- `adminProcedure.input(updateEscalationPolicyInput).mutation`
- Tenant-scoped update, throw `NOT_FOUND` on mismatch

**`deleteEscalationPolicy`** -- `adminProcedure.input(z.object({ id: z.number() })).mutation`
- Tenant-scoped delete

---

## 6. Router Registration

**File to modify**: `apps/web/server/routers.ts`

Add two import lines (near existing router imports around lines 88-91):

```typescript
import { notificationPreferencesRouter } from "./routers/notificationPreferences";
import { alertRulesRouter } from "./routers/alertRules";
```

Register in the `appRouter` call (near the `scheduledMessages` entry around line 1474):

```typescript
notificationPreferences: notificationPreferencesRouter,
alertRules: alertRulesRouter,
```

---

## 7. Shared Constants

**File to modify**: `apps/web/shared/featureFlags.ts`

The feature flags for Phase 5 (`NOTIFICATION_PREFERENCES_ENABLED`, `NOTIFICATION_ESCALATION_ENABLED`) are added by section-13 (feature-flags-i18n). This section does NOT add feature flags -- it creates only the data layer. The routers defined here are always accessible to authenticated/admin users; the feature flags gate the delivery logic in section-05 and the escalation job in section-06.

---

## 8. Key Implementation Notes

### Tenant Isolation
- `alertRules` and `escalationPolicies` are tenant-scoped. Every query MUST include `tenantId = ctx.tenantId`.
- `notificationPreferences` are user-scoped. Every query MUST include `userId = ctx.user.id`.
- The `ctx.tenantId` value comes from the authenticated user's tenant association in the tRPC context.

### Operator Security (S7)
- The `operator` column accepts only `gt`, `lt`, `gte`, `lte`, `eq`.
- Zod `z.enum()` enforces this at the API boundary.
- The database column is `varchar(10)` -- no DB-level enum needed since Zod is the enforcement layer.
- Never use `eval()`, `new Function()`, or template literal interpolation with operator values.

### Drizzle ORM Patterns
- Use `onConflictDoUpdate` for the upsert pattern in `notificationPreferences`.
- Use `doublePrecision` for the threshold column (Drizzle maps to PostgreSQL `double precision`).
- Use `jsonb().$type<string[]>()` for the channels/escalateChannels columns with a TypeScript type hint.

### Testing Approach
- Mock the Drizzle `db` object using the existing chainable mock pattern found in `apps/web/server/routers/__tests__/persona.test.ts` and similar files.
- For admin procedures, the test context must include `user.role = "admin"` and `tenantId`.
- For protected procedures, the test context must include `user.id`.
- Validate Zod schemas directly (import the schema, call `.safeParse()`) for input validation tests.

---

## 9. File Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/drizzle/schema.ts` | Modify | Add `notificationPreferences`, `alertRules`, `escalationPolicies` tables + type exports + `NOTIFICATION_CATEGORIES` constant |
| `apps/web/drizzle/XXXX_preferences_rules.sql` | Create (generated) | Migration for the 3 new tables |
| `apps/web/server/routers/notificationPreferences.ts` | Create | tRPC router: getPreferences, upsertPreference, snoozeCategory |
| `apps/web/server/routers/alertRules.ts` | Create | tRPC router: CRUD for alert rules + escalation policies |
| `apps/web/server/routers.ts` | Modify | Import and register both new routers |
| `apps/web/server/routers/__tests__/notificationPreferences.test.ts` | Create | Tests for preferences schema + router |
| `apps/web/server/routers/__tests__/alertRules.test.ts` | Create | Tests for alert rules + escalation policies schema + router |