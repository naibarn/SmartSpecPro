import { serial, integer, text, timestamp, varchar, boolean, pgTable, pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared user table from SmartSpec Web.
 * This is the same table used by the main application.
 * Docker Status only needs to read user data for authentication.
 */
export const roleEnum = pgEnum("role", ["user", "admin", "domain_admin"]);
export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  password: text("password"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  credits: integer("credits").default(0).notNull(),
  plan: planEnum("plan").default("free").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
  registeredDomain: varchar("registeredDomain", { length: 255 }),
  currentTenantId: integer("currentTenantId"),
  isDisabled: boolean("isDisabled").default(false).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Webhook configurations for notifications
export const webhookTypeEnum = pgEnum("webhook_type", ["slack", "discord", "generic", "teams"]);

export const webhookConfigs = pgTable("webhook_configs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  type: webhookTypeEnum("type").default("generic").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  events: text("events").notNull(), // JSON string array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type InsertWebhookConfig = typeof webhookConfigs.$inferInsert;

// Email configurations for notifications
export const emailConfigs = pgTable("email_configs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  smtpHost: varchar("smtpHost", { length: 255 }).notNull(),
  smtpPort: integer("smtpPort").default(587).notNull(),
  smtpUser: varchar("smtpUser", { length: 255 }),
  smtpPass: varchar("smtpPass", { length: 255 }),
  fromEmail: varchar("fromEmail", { length: 320 }).notNull(),
  toEmails: text("toEmails").notNull(), // JSON string array
  enabled: boolean("enabled").default(true).notNull(),
  events: text("events").notNull(), // JSON string array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type EmailConfig = typeof emailConfigs.$inferSelect;
export type InsertEmailConfig = typeof emailConfigs.$inferInsert;

// Notification history
export const severityEnum = pgEnum("severity", ["info", "warning", "critical"]);

export const notificationHistory = pgTable("notification_history", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  severity: severityEnum("severity").default("info").notNull(),
  containerName: varchar("containerName", { length: 255 }),
  containerId: varchar("containerId", { length: 64 }),
  webhookResults: text("webhookResults"), // JSON string array
  emailResults: text("emailResults"), // JSON string array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = typeof notificationHistory.$inferInsert;