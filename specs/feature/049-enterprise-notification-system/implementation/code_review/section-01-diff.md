diff --git a/apps/web/drizzle/0102_notification_type_enum_extension.sql b/apps/web/drizzle/0102_notification_type_enum_extension.sql
new file mode 100644
index 00000000..eb0043b1
--- /dev/null
+++ b/apps/web/drizzle/0102_notification_type_enum_extension.sql
@@ -0,0 +1,4 @@
+-- This migration MUST run outside a transaction.
+-- drizzle-kit cannot generate ALTER TYPE ADD VALUE; applied manually.
+ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'direct_message';
+ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'urgent_message';
diff --git a/apps/web/drizzle/0102_slim_red_wolf.sql b/apps/web/drizzle/0102_slim_red_wolf.sql
new file mode 100644
index 00000000..b00db120
--- /dev/null
+++ b/apps/web/drizzle/0102_slim_red_wolf.sql
@@ -0,0 +1,15 @@
+CREATE TABLE "notification_occurrences" (
+	"id" serial PRIMARY KEY NOT NULL,
+	"notificationId" integer NOT NULL,
+	"content" text,
+	"metadata" jsonb,
+	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+ALTER TABLE "user_notifications" ADD COLUMN "groupKey" varchar(200);--> statement-breakpoint
+ALTER TABLE "user_notifications" ADD COLUMN "occurrenceCount" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
+ALTER TABLE "user_notifications" ADD COLUMN "firstOccurredAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
+ALTER TABLE "user_notifications" ADD COLUMN "lastOccurredAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
+ALTER TABLE "notification_occurrences" ADD CONSTRAINT "notification_occurrences_notificationId_user_notifications_id_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."user_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+CREATE INDEX "idx_notif_occurrences_notif_time" ON "notification_occurrences" USING btree ("notificationId","occurredAt");--> statement-breakpoint
+CREATE UNIQUE INDEX "idx_notif_dedup_active" ON "user_notifications" USING btree ("userId","groupKey") WHERE "isDismissed" = false AND "groupKey" IS NOT NULL;
\ No newline at end of file
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index ddcf218c..7d5a3624 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -3121,16 +3121,47 @@ export const userNotifications = pgTable("user_notifications", {
   /** Auto-cleanup after this timestamp */
   expiresAt: timestamp("expiresAt", { withTimezone: true }),
 
+  /** Dedup identifier, e.g. "media_job_failure:user_123" */
+  groupKey: varchar("groupKey", { length: 200 }),
+
+  /** Number of events this notification represents */
+  occurrenceCount: integer("occurrenceCount").default(1).notNull(),
+
+  /** When first event in group occurred */
+  firstOccurredAt: timestamp("firstOccurredAt", { withTimezone: true }).defaultNow().notNull(),
+
+  /** When most recent event occurred */
+  lastOccurredAt: timestamp("lastOccurredAt", { withTimezone: true }).defaultNow().notNull(),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
   index("user_notifications_user_read").on(t.userId, t.isRead, t.createdAt),
   index("user_notifications_user_priority").on(t.userId, t.isRead, t.priority),
   index("user_notifications_resource").on(t.relatedResourceType, t.relatedResourceId),
+  uniqueIndex("idx_notif_dedup_active")
+    .on(t.userId, t.groupKey)
+    .where(sql`"isDismissed" = false AND "groupKey" IS NOT NULL`),
 ]);
 
 export type UserNotification = typeof userNotifications.$inferSelect;
 export type InsertUserNotification = typeof userNotifications.$inferInsert;
 
+/**
+ * Notification Occurrences — individual events grouped under a deduped notification
+ */
+export const notificationOccurrences = pgTable("notification_occurrences", {
+  id: serial("id").primaryKey(),
+  notificationId: integer("notificationId").references(() => userNotifications.id, { onDelete: "cascade" }).notNull(),
+  content: text("content"),
+  metadata: jsonb("metadata"),
+  occurredAt: timestamp("occurredAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("idx_notif_occurrences_notif_time").on(t.notificationId, t.occurredAt),
+]);
+
+export type NotificationOccurrence = typeof notificationOccurrences.$inferSelect;
+export type InsertNotificationOccurrence = typeof notificationOccurrences.$inferInsert;
+
 /**
  * Direct Messages — user-to-user messaging
  * Follow: max 10 messages, Friend (mutual follow): unlimited
diff --git a/apps/web/server/services/__tests__/notificationSchema.test.ts b/apps/web/server/services/__tests__/notificationSchema.test.ts
new file mode 100644
index 00000000..4a663797
--- /dev/null
+++ b/apps/web/server/services/__tests__/notificationSchema.test.ts
@@ -0,0 +1,108 @@
+import { describe, it, expect } from "vitest";
+import {
+  userNotifications,
+  notificationOccurrences,
+} from "../../../drizzle/schema";
+import type {
+  NotificationOccurrence,
+  InsertNotificationOccurrence,
+} from "../../../drizzle/schema";
+import { getTableColumns } from "drizzle-orm";
+import { getTableConfig } from "drizzle-orm/pg-core";
+
+describe("userNotifications schema — dedup columns", () => {
+  const columns = getTableColumns(userNotifications);
+
+  it("includes groupKey column (nullable varchar 200)", () => {
+    expect(columns.groupKey).toBeDefined();
+    expect(columns.groupKey.dataType).toBe("string");
+    expect(columns.groupKey.notNull).toBe(false);
+  });
+
+  it("includes occurrenceCount column (integer, default 1, not null)", () => {
+    expect(columns.occurrenceCount).toBeDefined();
+    expect(columns.occurrenceCount.dataType).toBe("number");
+    expect(columns.occurrenceCount.notNull).toBe(true);
+    expect(columns.occurrenceCount.hasDefault).toBe(true);
+  });
+
+  it("includes firstOccurredAt column (timestamptz, default now, not null)", () => {
+    expect(columns.firstOccurredAt).toBeDefined();
+    expect(columns.firstOccurredAt.dataType).toBe("date");
+    expect(columns.firstOccurredAt.notNull).toBe(true);
+    expect(columns.firstOccurredAt.hasDefault).toBe(true);
+  });
+
+  it("includes lastOccurredAt column (timestamptz, default now, not null)", () => {
+    expect(columns.lastOccurredAt).toBeDefined();
+    expect(columns.lastOccurredAt.dataType).toBe("date");
+    expect(columns.lastOccurredAt.notNull).toBe(true);
+    expect(columns.lastOccurredAt.hasDefault).toBe(true);
+  });
+});
+
+describe("notificationOccurrences table schema", () => {
+  const columns = getTableColumns(notificationOccurrences);
+
+  it("has id column (serial primary key)", () => {
+    expect(columns.id).toBeDefined();
+    expect(columns.id.dataType).toBe("number");
+    expect(columns.id.notNull).toBe(true);
+    expect(columns.id.primary).toBe(true);
+  });
+
+  it("has notificationId column (integer, not null)", () => {
+    expect(columns.notificationId).toBeDefined();
+    expect(columns.notificationId.dataType).toBe("number");
+    expect(columns.notificationId.notNull).toBe(true);
+  });
+
+  it("has content column (text, nullable)", () => {
+    expect(columns.content).toBeDefined();
+    expect(columns.content.dataType).toBe("string");
+    expect(columns.content.notNull).toBe(false);
+  });
+
+  it("has metadata column (jsonb, nullable)", () => {
+    expect(columns.metadata).toBeDefined();
+    expect(columns.metadata.dataType).toBe("json");
+    expect(columns.metadata.notNull).toBe(false);
+  });
+
+  it("has occurredAt column (timestamptz, default now, not null)", () => {
+    expect(columns.occurredAt).toBeDefined();
+    expect(columns.occurredAt.dataType).toBe("date");
+    expect(columns.occurredAt.notNull).toBe(true);
+    expect(columns.occurredAt.hasDefault).toBe(true);
+  });
+
+  it("exports NotificationOccurrence and InsertNotificationOccurrence types", () => {
+    // Type-level assertions — if these compile, the types exist
+    const _select: NotificationOccurrence = {} as NotificationOccurrence;
+    const _insert: InsertNotificationOccurrence =
+      {} as InsertNotificationOccurrence;
+    expect(_select).toBeDefined();
+    expect(_insert).toBeDefined();
+  });
+});
+
+describe("userNotifications dedup index", () => {
+  it("has unique partial index idx_notif_dedup_active on (userId, groupKey)", () => {
+    const config = getTableConfig(userNotifications);
+    const dedupIndex = config.indexes.find(
+      (i) => i.config.name === "idx_notif_dedup_active",
+    );
+    expect(dedupIndex).toBeDefined();
+    expect(dedupIndex!.config.unique).toBe(true);
+  });
+});
+
+describe("notificationOccurrences indexes", () => {
+  it("has index on (notificationId, occurredAt)", () => {
+    const config = getTableConfig(notificationOccurrences);
+    const timeIndex = config.indexes.find(
+      (i) => i.config.name === "idx_notif_occurrences_notif_time",
+    );
+    expect(timeIndex).toBeDefined();
+  });
+});
