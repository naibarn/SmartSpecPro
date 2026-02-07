diff --git a/apps/web/drizzle/0013_apply_telegram_columns.sql b/apps/web/drizzle/0013_apply_telegram_columns.sql
new file mode 100644
index 0000000..7d0e6a8
--- /dev/null
+++ b/apps/web/drizzle/0013_apply_telegram_columns.sql
@@ -0,0 +1,69 @@
+-- Manual application of 0013 migration (Telegram columns + fixes)
+-- This script uses IF NOT EXISTS to avoid errors if columns already exist
+
+-- Create enum type if not exists (for priority columns)
+DO $$ BEGIN
+  CREATE TYPE reminder_priority AS ENUM('low', 'normal', 'high', 'critical');
+EXCEPTION
+  WHEN duplicate_object THEN null;
+END $$;
+
+-- Add columns to scheduled_messages if they don't exist
+DO $$ BEGIN
+  ALTER TABLE scheduled_messages ADD COLUMN "isSimpleReminder" boolean DEFAULT false NOT NULL;
+EXCEPTION
+  WHEN duplicate_column THEN null;
+END $$;
+
+DO $$ BEGIN
+  ALTER TABLE scheduled_messages ADD COLUMN "priority" reminder_priority DEFAULT 'normal' NOT NULL;
+EXCEPTION
+  WHEN duplicate_column THEN null;
+END $$;
+
+-- Add priority column to user_notifications if it doesn't exist
+DO $$ BEGIN
+  ALTER TABLE user_notifications ADD COLUMN "priority" reminder_priority DEFAULT 'normal' NOT NULL;
+EXCEPTION
+  WHEN duplicate_column THEN null;
+END $$;
+
+-- Add Telegram columns to users table
+DO $$ BEGIN
+  ALTER TABLE users ADD COLUMN "telegramChatId" varchar(64);
+EXCEPTION
+  WHEN duplicate_column THEN null;
+END $$;
+
+DO $$ BEGIN
+  ALTER TABLE users ADD COLUMN "telegramUsername" varchar(64);
+EXCEPTION
+  WHEN duplicate_column THEN null;
+END $$;
+
+DO $$ BEGIN
+  ALTER TABLE users ADD COLUMN "telegramVerified" boolean DEFAULT false NOT NULL;
+EXCEPTION
+  WHEN duplicate_column THEN null;
+END $$;
+
+DO $$ BEGIN
+  ALTER TABLE users ADD COLUMN "telegramVerifiedAt" timestamp with time zone;
+EXCEPTION
+  WHEN duplicate_column THEN null;
+END $$;
+
+-- Add passwordChangedAt column to users table (fix drift)
+DO $$ BEGIN
+  ALTER TABLE users ADD COLUMN "passwordChangedAt" timestamp with time zone;
+EXCEPTION
+  WHEN duplicate_column THEN null;
+END $$;
+
+-- Create indexes if they don't exist
+CREATE INDEX IF NOT EXISTS scheduled_message_logs_schedule_id ON scheduled_message_logs USING btree ("scheduledMessageId","executedAt");
+CREATE INDEX IF NOT EXISTS scheduled_messages_user_status ON scheduled_messages USING btree ("userId","status");
+CREATE INDEX IF NOT EXISTS scheduled_messages_user_created ON scheduled_messages USING btree ("userId","createdAt");
+CREATE INDEX IF NOT EXISTS scheduled_messages_status ON scheduled_messages USING btree ("status");
+CREATE INDEX IF NOT EXISTS user_notifications_user_read ON user_notifications USING btree ("userId","isRead","createdAt");
+CREATE INDEX IF NOT EXISTS user_notifications_user_priority ON user_notifications USING btree ("userId","isRead","priority");
diff --git a/apps/web/drizzle/0013_clear_victor_mancha.sql b/apps/web/drizzle/0013_clear_victor_mancha.sql
new file mode 100644
index 0000000..f543ea4
--- /dev/null
+++ b/apps/web/drizzle/0013_clear_victor_mancha.sql
@@ -0,0 +1,15 @@
+CREATE TYPE "public"."reminder_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
+ALTER TABLE "scheduled_messages" ADD COLUMN "isSimpleReminder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
+ALTER TABLE "scheduled_messages" ADD COLUMN "priority" "reminder_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
+ALTER TABLE "user_notifications" ADD COLUMN "priority" "reminder_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
+ALTER TABLE "users" ADD COLUMN "telegramChatId" varchar(64);--> statement-breakpoint
+ALTER TABLE "users" ADD COLUMN "telegramUsername" varchar(64);--> statement-breakpoint
+ALTER TABLE "users" ADD COLUMN "telegramVerified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
+ALTER TABLE "users" ADD COLUMN "telegramVerifiedAt" timestamp with time zone;--> statement-breakpoint
+ALTER TABLE "users" ADD COLUMN "passwordChangedAt" timestamp with time zone;--> statement-breakpoint
+CREATE INDEX "scheduled_message_logs_schedule_id" ON "scheduled_message_logs" USING btree ("scheduledMessageId","executedAt");--> statement-breakpoint
+CREATE INDEX "scheduled_messages_user_status" ON "scheduled_messages" USING btree ("userId","status");--> statement-breakpoint
+CREATE INDEX "scheduled_messages_user_created" ON "scheduled_messages" USING btree ("userId","createdAt");--> statement-breakpoint
+CREATE INDEX "scheduled_messages_status" ON "scheduled_messages" USING btree ("status");--> statement-breakpoint
+CREATE INDEX "user_notifications_user_read" ON "user_notifications" USING btree ("userId","isRead","createdAt");--> statement-breakpoint
+CREATE INDEX "user_notifications_user_priority" ON "user_notifications" USING btree ("userId","isRead","priority");
\ No newline at end of file
diff --git a/apps/web/drizzle/meta/_journal.json b/apps/web/drizzle/meta/_journal.json
index 56def99..bce6ca8 100644
--- a/apps/web/drizzle/meta/_journal.json
+++ b/apps/web/drizzle/meta/_journal.json
@@ -92,6 +92,13 @@
       "when": 1770535000000,
       "tag": "0012_add_reminder_priority",
       "breakpoints": true
+    },
+    {
+      "idx": 13,
+      "version": "7",
+      "when": 1770487506778,
+      "tag": "0013_clear_victor_mancha",
+      "breakpoints": true
     }
   ]
 }
\ No newline at end of file
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 8218820..9575011 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -75,6 +75,8 @@ export const users = pgTable("users", {
   userPreferences: json("userPreferences").$type<{
     translationLanguage?: string;
     translationModel?: string;
+    telegramNotifyLevel?: "all" | "high_critical" | "critical_only" | "off";
+    telegramDeliveryFailing?: boolean;
   }>().default({}),
 
   // Recovery contacts
@@ -83,6 +85,12 @@ export const users = pgTable("users", {
   phone: varchar("phone", { length: 20 }),
   phoneVerified: boolean("phoneVerified").default(false).notNull(),
 
+  // Telegram account linking
+  telegramChatId: varchar("telegramChatId", { length: 64 }),
+  telegramUsername: varchar("telegramUsername", { length: 64 }),
+  telegramVerified: boolean("telegramVerified").default(false).notNull(),
+  telegramVerifiedAt: timestamp("telegramVerifiedAt", { withTimezone: true }),
+
   // Two-Factor Authentication
   twoFactorEnabled: boolean("twoFactorEnabled").default(false).notNull(),
   twoFactorSecret: text("twoFactorSecret"), // encrypted TOTP secret (base32)
@@ -91,6 +99,7 @@ export const users = pgTable("users", {
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
   lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
+  passwordChangedAt: timestamp("passwordChangedAt", { withTimezone: true }),
 });
 
 export type User = typeof users.$inferSelect;
diff --git a/apps/web/scripts/apply-migration-0013.ts b/apps/web/scripts/apply-migration-0013.ts
new file mode 100755
index 0000000..506375a
--- /dev/null
+++ b/apps/web/scripts/apply-migration-0013.ts
@@ -0,0 +1,74 @@
+#!/usr/bin/env tsx
+/**
+ * Manually apply migration 0013 (Telegram columns)
+ * This script uses IF NOT EXISTS logic to safely apply the migration
+ * even if some columns already exist in the database.
+ */
+
+import { drizzle } from "drizzle-orm/postgres-js";
+import postgres from "postgres";
+import * as fs from "fs";
+import * as path from "path";
+import { fileURLToPath } from "url";
+
+const __filename = fileURLToPath(import.meta.url);
+const __dirname = path.dirname(__filename);
+
+const connectionString = process.env.DATABASE_URL;
+if (!connectionString) {
+  console.error("DATABASE_URL environment variable is not set");
+  process.exit(1);
+}
+
+const sql = postgres(connectionString, { max: 1 });
+const db = drizzle(sql);
+
+async function applyMigration() {
+  const migrationPath = path.join(__dirname, "../drizzle/0013_apply_telegram_columns.sql");
+  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
+
+  console.log("Applying migration 0013 (Telegram columns + fixes)...");
+
+  try {
+    await sql.begin(async (tx) => {
+      await tx.unsafe(migrationSQL);
+    });
+    console.log("✓ Migration applied successfully");
+
+    // Verify Telegram columns were added
+    const result = await sql`
+      SELECT column_name
+      FROM information_schema.columns
+      WHERE table_name = 'users'
+      AND column_name LIKE 'telegram%'
+      ORDER BY column_name;
+    `;
+
+    console.log("\n✓ Telegram columns in users table:");
+    result.forEach((row: any) => console.log(`  - ${row.column_name}`));
+
+    // Verify passwordChangedAt was added
+    const passwordCol = await sql`
+      SELECT column_name
+      FROM information_schema.columns
+      WHERE table_name = 'users'
+      AND column_name = 'passwordChangedAt';
+    `;
+
+    if (passwordCol.length > 0) {
+      console.log("\n✓ passwordChangedAt column exists (drift fixed)");
+    }
+
+    // Row count check
+    const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM users;`;
+    console.log(`\n✓ Users table has ${count} rows (verify this matches pre-migration count)`);
+
+  } catch (error) {
+    console.error("✗ Migration failed:", error);
+    process.exit(1);
+  } finally {
+    await sql.end();
+  }
+}
+
+applyMigration();
diff --git a/apps/web/server/routers/systemSettings.ts b/apps/web/server/routers/systemSettings.ts
index ec10bca..6363962 100644
--- a/apps/web/server/routers/systemSettings.ts
+++ b/apps/web/server/routers/systemSettings.ts
@@ -14,7 +14,7 @@ import { encrypt, decrypt } from "../services/crypto";
 // System Settings Router
 // ============================================================
 
-const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai"]);
+const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram"]);
 
 const stripeSettingsSchema = z.object({
   secretKey: z.string().optional(),
