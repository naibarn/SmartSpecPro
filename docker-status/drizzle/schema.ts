import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Webhook configurations for notifications
export const webhookConfigs = mysqlTable("webhook_configs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  type: mysqlEnum("type", ["slack", "discord", "generic", "teams"]).default("generic").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  events: text("events").notNull(), // JSON string array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type InsertWebhookConfig = typeof webhookConfigs.$inferInsert;

// Email configurations for notifications
export const emailConfigs = mysqlTable("email_configs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  smtpHost: varchar("smtpHost", { length: 255 }).notNull(),
  smtpPort: int("smtpPort").default(587).notNull(),
  smtpUser: varchar("smtpUser", { length: 255 }),
  smtpPass: varchar("smtpPass", { length: 255 }),
  fromEmail: varchar("fromEmail", { length: 320 }).notNull(),
  toEmails: text("toEmails").notNull(), // JSON string array
  enabled: boolean("enabled").default(true).notNull(),
  events: text("events").notNull(), // JSON string array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailConfig = typeof emailConfigs.$inferSelect;
export type InsertEmailConfig = typeof emailConfigs.$inferInsert;

// Notification history
export const notificationHistory = mysqlTable("notification_history", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("info").notNull(),
  containerName: varchar("containerName", { length: 255 }),
  containerId: varchar("containerId", { length: 64 }),
  webhookResults: text("webhookResults"), // JSON string array
  emailResults: text("emailResults"), // JSON string array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = typeof notificationHistory.$inferInsert;