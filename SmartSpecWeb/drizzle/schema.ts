import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, decimal } from "drizzle-orm/mysql-core";

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
  
  /** User's credit balance (in smallest unit, e.g., 1 credit = 100 units for precision) */
  credits: int("credits").default(0).notNull(),
  
  /** User's subscription plan */
  plan: mysqlEnum("plan", ["free", "starter", "pro", "enterprise"]).default("free").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Credit transactions table - tracks all credit movements
 * Used for billing, usage tracking, and audit trail
 */
export const creditTransactions = mysqlTable("credit_transactions", {
  id: int("id").autoincrement().primaryKey(),
  
  /** User who owns this transaction */
  userId: int("userId").notNull().references(() => users.id),
  
  /** Amount of credits (positive for additions, negative for deductions) */
  amount: int("amount").notNull(),
  
  /** Transaction type */
  type: mysqlEnum("type", [
    "purchase",      // User bought credits
    "usage",         // Credits used for LLM/generation
    "bonus",         // Free credits (signup bonus, promo)
    "refund",        // Refunded credits
    "adjustment",    // Admin adjustment
    "subscription",  // Monthly subscription credits
  ]).notNull(),
  
  /** Human-readable description */
  description: varchar("description", { length: 512 }),
  
  /** Additional metadata (model used, tokens, cost, etc.) */
  metadata: json("metadata").$type<{
    model?: string;
    provider?: string;
    tokensUsed?: number;
    costUsd?: number;
    endpoint?: string;
    traceId?: string;
    [key: string]: any;
  }>(),
  
  /** Balance after this transaction */
  balanceAfter: int("balanceAfter").notNull(),
  
  /** Reference ID for external systems (e.g., Stripe payment ID) */
  referenceId: varchar("referenceId", { length: 128 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;

/**
 * Credit packages available for purchase
 */
export const creditPackages = mysqlTable("credit_packages", {
  id: int("id").autoincrement().primaryKey(),
  
  /** Package name */
  name: varchar("name", { length: 128 }).notNull(),
  
  /** Package description */
  description: text("description"),
  
  /** Number of credits in package */
  credits: int("credits").notNull(),
  
  /** Price in USD (stored as decimal for precision) */
  priceUsd: decimal("priceUsd", { precision: 10, scale: 2 }).notNull(),
  
  /** Stripe Price ID for checkout */
  stripePriceId: varchar("stripePriceId", { length: 128 }),
  
  /** Whether package is active/available */
  isActive: boolean("isActive").default(true).notNull(),
  
  /** Whether this is a featured/popular package */
  isFeatured: boolean("isFeatured").default(false).notNull(),
  
  /** Sort order for display */
  sortOrder: int("sortOrder").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CreditPackage = typeof creditPackages.$inferSelect;
export type InsertCreditPackage = typeof creditPackages.$inferInsert;

/**
 * Gallery items table - stores images, videos, and website demos
 * Supports 3 content types with different aspect ratios
 */
export const galleryItems = mysqlTable("gallery_items", {
  id: int("id").autoincrement().primaryKey(),
  
  /** Content type: image, video, or website */
  type: mysqlEnum("type", ["image", "video", "website"]).notNull(),
  
  /** Title of the gallery item */
  title: varchar("title", { length: 255 }).notNull(),
  
  /** Description of the item */
  description: text("description"),
  
  /** Aspect ratio: 1:1, 9:16, or 16:9 */
  aspectRatio: mysqlEnum("aspectRatio", ["1:1", "9:16", "16:9"]).notNull(),
  
  /** S3/R2 file key for the main content */
  fileKey: varchar("fileKey", { length: 512 }),
  
  /** Public URL for the main content */
  fileUrl: varchar("fileUrl", { length: 1024 }),
  
  /** S3/R2 file key for thumbnail */
  thumbnailKey: varchar("thumbnailKey", { length: 512 }),
  
  /** Public URL for thumbnail */
  thumbnailUrl: varchar("thumbnailUrl", { length: 1024 }),
  
  /** For videos: duration in format "M:SS" */
  duration: varchar("duration", { length: 10 }),
  
  /** For websites: demo URL (subdomain link) */
  demoUrl: varchar("demoUrl", { length: 512 }),
  
  /** Tags for filtering and SEO (stored as JSON array) */
  tags: json("tags").$type<string[]>(),
  
  /** View count */
  views: int("views").default(0).notNull(),
  
  /** Like count */
  likes: int("likes").default(0).notNull(),
  
  /** Download count (for images) */
  downloads: int("downloads").default(0).notNull(),
  
  /** Whether the item is published/visible */
  isPublished: boolean("isPublished").default(true).notNull(),
  
  /** Whether the item is featured */
  isFeatured: boolean("isFeatured").default(false).notNull(),
  
  /** Author/creator user ID */
  authorId: int("authorId").references(() => users.id),
  
  /** Author name (for display, can be custom) */
  authorName: varchar("authorName", { length: 255 }),
  
  /** Author avatar URL */
  authorAvatar: varchar("authorAvatar", { length: 512 }),
  
  /** Sort order for manual ordering */
  sortOrder: int("sortOrder").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GalleryItem = typeof galleryItems.$inferSelect;
export type InsertGalleryItem = typeof galleryItems.$inferInsert;
