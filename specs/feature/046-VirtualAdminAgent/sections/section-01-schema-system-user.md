I now have all the context needed. Let me produce the section content.

# Section 01: Database Schema and System User

## Overview

This section implements the **foundation layer** for the Virtual Admin Agent (System Guardian). It covers:

1. Six new database tables and associated enums for incidents, approvals, sensor config, and the feedback system
2. A reserved system user (`id: -1`) with a `system_agent` role
3. JWT generation for the system user (in-memory only, never persisted)
4. Auth middleware updates to recognize `system_agent` role
5. An `isSystemUser` column on the `users` table

All other sections depend on this one being implemented first.

---

## Tests (Write First)

Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/__tests__/systemUser.test.ts`

Follow the existing test pattern from `apps/web/server/auth.logout.test.ts` -- use `appRouter.createCaller(ctx)` with a mock `TrpcContext`.

```typescript
// systemUser.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("SystemUser", () => {
  it("creates system user with id -1 if not exists");
  it("does not duplicate system user on second call");
  it("generates valid JWT with system_agent role");
  it("JWT includes userId -1 and no tenantId");
  it("system user cannot login via auth.login procedure");
});
```

### Test guidance

- **"creates system user with id -1 if not exists"**: Call the `ensureSystemUser()` function. Mock the DB layer (`db.select().from(users).where(eq(users.id, -1))`) to return empty array. Verify it calls `db.insert(users).values(...)` with `id: -1`, `email: "system-agent@internal"`, `role: "system_agent"`, `isSystemUser: true`.

- **"does not duplicate system user on second call"**: Mock the DB select to return an existing system user row. Verify `db.insert` is NOT called.

- **"generates valid JWT with system_agent role"**: Call `getSystemUserToken()`. Decode the returned JWT (using `jose.jwtVerify`) and assert the payload contains `userId: -1` and `role: "system_agent"`. Assert expiration is approximately 365 days from now.

- **"JWT includes userId -1 and no tenantId"**: Verify the JWT payload has `userId: -1` and that `tenantId` is either absent or null.

- **"system user cannot login via auth.login procedure"**: Create a mock context with system user credentials. Call `auth.login` and expect it to reject (e.g., throw UNAUTHORIZED or return error), since system users have no valid `openId` / password for normal auth.

---

## Implementation Details

### 1. New Enums

Add the following `pgEnum` definitions to `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, near the top of the file alongside existing enums (after the existing enum block around lines 7-109):

```typescript
// Virtual Admin enums
export const incidentSeverityEnum = pgEnum("incident_severity", ["info", "warning", "error", "critical"]);
export const incidentStatusEnum = pgEnum("incident_status", ["open", "acknowledged", "resolved", "expired"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "expired", "execution_failed"]);
export const ticketTypeEnum = pgEnum("ticket_type", ["bug", "feature_request", "observation", "question"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["new", "triaged", "in_progress", "deferred", "resolved", "duplicate", "closed"]);
export const ticketResolutionEnum = pgEnum("ticket_resolution", ["fixed", "wont_fix", "duplicate", "cannot_reproduce", "planned", "by_design"]);
```

### 2. Users Table Changes

Two changes to the existing `users` table at line 275 of `schema.ts`:

**a) Add `isSystemUser` column:**

```typescript
/** Whether this is a system/virtual user (not a human login) */
isSystemUser: boolean("isSystemUser").default(false),
```

This is a nullable boolean defaulting to false. Safe additive migration -- no data loss risk.

**b) Add `system_agent` to `roleEnum`:**

The `roleEnum` at line 7 currently contains `["user", "admin", "domain_admin"]`. Drizzle cannot alter existing enums via `db:push`. This requires a raw SQL migration:

```sql
ALTER TYPE role ADD VALUE IF NOT EXISTS 'system_agent';
```

Run this via `psql "$DATABASE_URL"` BEFORE running `pnpm db:push`. Alternatively, update the enum definition in schema.ts to include `"system_agent"`:

```typescript
export const roleEnum = pgEnum("role", ["user", "admin", "domain_admin", "system_agent"]);
```

Then generate the migration. If Drizzle's generated SQL does not include the ALTER TYPE, apply it manually.

### 3. New Tables

Add these six table definitions at the end of `schema.ts` (after the last existing table definition, currently around line 3400+).

**Table: `virtual_admin_incidents`**

```typescript
export const virtualAdminIncidents = pgTable("virtual_admin_incidents", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),
  sensorId: varchar("sensorId", { length: 64 }).notNull(),
  ruleId: varchar("ruleId", { length: 64 }).notNull(),
  severity: incidentSeverityEnum("severity").notNull(),
  status: incidentStatusEnum("status").default("open").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  metricsJson: json("metricsJson"),
  actionTaken: varchar("actionTaken", { length: 64 }),
  actionResult: text("actionResult"),
  resolvedBy: integer("resolvedBy").references(() => users.id),
  resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("va_incidents_tenant_idx").on(t.tenantId),
  index("va_incidents_status_idx").on(t.status),
  index("va_incidents_severity_idx").on(t.severity),
  index("va_incidents_sensor_idx").on(t.sensorId),
]);
```

**Table: `virtual_admin_approvals`**

```typescript
export const virtualAdminApprovals = pgTable("virtual_admin_approvals", {
  id: serial("id").primaryKey(),
  incidentId: integer("incidentId").notNull().references(() => virtualAdminIncidents.id),
  actionType: varchar("actionType", { length: 64 }).notNull(),
  actionParamsJson: json("actionParamsJson"),
  status: approvalStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requestedAt", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decidedAt", { withTimezone: true }),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  decidedBy: integer("decidedBy").references(() => users.id),
  decisionComment: text("decisionComment"),
});
```

**Table: `virtual_admin_sensor_config`**

```typescript
export const virtualAdminSensorConfig = pgTable("virtual_admin_sensor_config", {
  id: varchar("id", { length: 64 }).primaryKey(), // compound: {tenantId}:{sensorId}
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id),
  sensorId: varchar("sensorId", { length: 64 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  intervalMs: integer("intervalMs"),
  thresholdsJson: json("thresholdsJson"),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});
```

**Table: `feedback_tickets`**

```typescript
export const feedbackTickets = pgTable("feedback_tickets", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),
  submittedBy: integer("submittedBy").references(() => users.id),
  submittedByType: varchar("submittedByType", { length: 16 }).notNull(), // human | virtual_agent | system_guardian
  ticketType: ticketTypeEnum("ticketType").notNull(),
  priority: reminderPriorityEnum("priority").default("normal").notNull(),
  severity: varchar("severity", { length: 16 }),
  category: varchar("category", { length: 64 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  stepsToReproduce: text("stepsToReproduce"),
  expectedBehavior: text("expectedBehavior"),
  actualBehavior: text("actualBehavior"),
  contextJson: json("contextJson"), // page URL, browser, error stack
  autoCategory: varchar("autoCategory", { length: 64 }),
  autoPriority: varchar("autoPriority", { length: 16 }),
  autoSummary: text("autoSummary"),
  duplicateOf: integer("duplicateOf").references((): AnyPgColumn => feedbackTickets.id),
  relatedIncidentId: integer("relatedIncidentId").references(() => virtualAdminIncidents.id),
  status: ticketStatusEnum("status").default("new").notNull(),
  assignedTo: integer("assignedTo").references(() => users.id),
  adminResponse: text("adminResponse"),
  resolutionNotes: text("resolutionNotes"),
  resolutionType: ticketResolutionEnum("resolutionType"),
  plannedVersion: varchar("plannedVersion", { length: 32 }),
  planningDocUrl: varchar("planningDocUrl", { length: 500 }),
  devBranch: varchar("devBranch", { length: 100 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  triagedAt: timestamp("triagedAt", { withTimezone: true }),
  respondedAt: timestamp("respondedAt", { withTimezone: true }),
  resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
  closedAt: timestamp("closedAt", { withTimezone: true }),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});
```

Note: The `priority` column reuses the existing `reminderPriorityEnum` (defined at line 2919 of schema.ts) which already has values `["low", "normal", "high", "critical"]`.

**Table: `feedback_ticket_comments`**

```typescript
export const feedbackTicketComments = pgTable("feedback_ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticketId").notNull().references(() => feedbackTickets.id, { onDelete: "cascade" }),
  authorId: integer("authorId").references(() => users.id),
  authorType: varchar("authorType", { length: 16 }).notNull(), // human | virtual_agent | system_guardian
  content: text("content").notNull(),
  isInternal: boolean("isInternal").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

**Table: `feedback_ticket_attachments`**

```typescript
export const feedbackTicketAttachments = pgTable("feedback_ticket_attachments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticketId").notNull().references(() => feedbackTickets.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 500 }).notNull(),
  fileSize: integer("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  uploadedBy: integer("uploadedBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

Export inferred types for each new table:

```typescript
export type VirtualAdminIncident = typeof virtualAdminIncidents.$inferSelect;
export type InsertVirtualAdminIncident = typeof virtualAdminIncidents.$inferInsert;
export type VirtualAdminApproval = typeof virtualAdminApprovals.$inferSelect;
export type InsertVirtualAdminApproval = typeof virtualAdminApprovals.$inferInsert;
export type VirtualAdminSensorConfig = typeof virtualAdminSensorConfig.$inferSelect;
export type FeedbackTicket = typeof feedbackTickets.$inferSelect;
export type InsertFeedbackTicket = typeof feedbackTickets.$inferInsert;
export type FeedbackTicketComment = typeof feedbackTicketComments.$inferSelect;
export type FeedbackTicketAttachment = typeof feedbackTicketAttachments.$inferSelect;
```

### 4. System User Service

Create file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/systemUser.ts`

This module exports two main functions:

**`ensureSystemUser(db): Promise<void>`** -- Called once at server startup. Checks if a user with `id: -1` exists. If not, inserts one with:
- `id`: -1
- `openId`: `"system-guardian-internal"` (unique, never used for login)
- `email`: `"system-agent@internal"`
- `name`: `"System Guardian"`
- `role`: `"system_agent"`
- `isSystemUser`: true
- `loginMethod`: `"system"` (prevents normal auth flow from matching)

If the user already exists, do nothing (idempotent).

**`getSystemUserToken(): Promise<string>`** -- Generates a JWT for the system user using the existing `jose` library (`SignJWT`). The token:
- Has `userId: -1`, `role: "system_agent"`, `tenantId: null`
- Expires in 365 days
- Is stored in a module-level variable (cached in memory)
- Is regenerated if expired or not yet created
- Uses the same `JWT_SECRET` env var as the rest of the app

The JWT payload structure differs from normal user JWTs (which use `openId`, `appId`, `name`). The system user JWT uses a custom payload with `userId` and `role` fields. The auth middleware must be updated to recognize this format.

### 5. Auth Middleware Updates

File: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/trpc.ts`

The current `adminProcedure` at line 32 checks `ctx.user.role !== 'admin'`. It needs to also accept `system_agent`:

```typescript
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'system_agent')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
```

Similarly update `rateLimitedAdminProcedure` (line 68) to accept `system_agent`.

The `domainAdminProcedure` (line 80) and `rateLimitedDomainAdminProcedure` (line 99) should also accept `system_agent`.

**Context authentication** in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/context.ts` and `/home/dev/projects/SmartSpecPro/apps/web/server/_core/sdk.ts`: The `authenticateRequest` flow verifies JWTs by looking up `openId` in the users table. For the system user JWT (which has a custom payload), the `sdk.authenticateRequest` function needs a check: if the JWT payload contains `userId: -1` and `role: "system_agent"`, look up the user by `id` instead of `openId`.

### 6. Shared Types

Create file: `/home/dev/projects/SmartSpecPro/apps/web/shared/virtualAdmin/types.ts`

Export shared TypeScript types used by both client and server:

```typescript
/** System user constants */
export const SYSTEM_USER_ID = -1;
export const SYSTEM_USER_EMAIL = "system-agent@internal";

/** Severity and status types (mirror DB enums for client-side use) */
export type IncidentSeverity = "info" | "warning" | "error" | "critical";
export type IncidentStatus = "open" | "acknowledged" | "resolved" | "expired";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "execution_failed";
export type TicketType = "bug" | "feature_request" | "observation" | "question";
export type TicketStatus = "new" | "triaged" | "in_progress" | "deferred" | "resolved" | "duplicate" | "closed";
export type TicketResolution = "fixed" | "wont_fix" | "duplicate" | "cannot_reproduce" | "planned" | "by_design";
```

### 7. Types File for Server

Create file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/types.ts`

Export server-side interfaces used by the sensor framework, rule engine, and actuators. Stub the key interfaces:

```typescript
export interface SensorReading {
  sensorId: string;
  timestamp: Date;
  status: "healthy" | "degraded" | "critical" | "unknown";
  metrics: Record<string, number | string>;
  message: string;
  tenantId?: string;
}

export interface IncidentRule { /* ... defined in section-03 */ }
export interface ActionPlan { /* ... defined in section-03 */ }
```

Only define the types needed by systemUser.ts itself in this section. Other sections will extend this file.

---

## Migration Steps

Follow the Database Safety Protocol from CLAUDE.md:

1. **Backup the users table** before migration (the only existing table being modified):
   ```bash
   mkdir -p /home/dev/projects/SmartSpecPro/.db-backups
   pg_dump "$DATABASE_URL" --data-only --table=users \
     --file="/home/dev/projects/SmartSpecPro/.db-backups/users_$(date +%Y%m%d_%H%M%S).sql"
   psql "$DATABASE_URL" -c "SELECT count(*) FROM users;"
   ```

2. **Add the `system_agent` enum value** (must happen before `db:push`):
   ```bash
   psql "$DATABASE_URL" -c "ALTER TYPE role ADD VALUE IF NOT EXISTS 'system_agent';"
   ```

3. **Run the migration**:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push
   ```

4. **Verify**:
   ```bash
   psql "$DATABASE_URL" -c "SELECT count(*) FROM users;"
   psql "$DATABASE_URL" -c "\d virtual_admin_incidents"
   psql "$DATABASE_URL" -c "\d feedback_tickets"
   ```

---

## Files Created/Modified Summary

| File | Action |
|------|--------|
| `apps/web/drizzle/schema.ts` | Modified -- add 6 enums, 6 tables, `isSystemUser` column, update `roleEnum` |
| `apps/web/server/services/virtualAdmin/systemUser.ts` | Created -- `ensureSystemUser()`, `getSystemUserToken()` |
| `apps/web/server/services/virtualAdmin/types.ts` | Created -- server-side type stubs |
| `apps/web/shared/virtualAdmin/types.ts` | Created -- shared constants and type aliases |
| `apps/web/server/_core/trpc.ts` | Modified -- `adminProcedure`, `domainAdminProcedure` accept `system_agent` |
| `apps/web/server/_core/sdk.ts` | Modified -- `authenticateRequest` handles system user JWT format |
| `apps/web/server/services/virtualAdmin/__tests__/systemUser.test.ts` | Created -- 5 test stubs |

---

## Dependencies

This section has **no dependencies** on other sections. It is the foundation that all other sections (02 through 10) build upon.

---

## Security Considerations

- The system user JWT is generated in-memory only and never written to disk or database
- The `system_agent` role grants admin-level read access but write access is restricted to guardian-specific tables (enforced in the tRPC routers created in later sections)
- The system user has `loginMethod: "system"` which prevents it from being used in the normal login flow
- The `isSystemUser` flag provides an additional check beyond role for identifying virtual users