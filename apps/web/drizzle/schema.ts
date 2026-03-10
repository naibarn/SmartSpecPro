import { integer, pgEnum, pgTable, text, timestamp, varchar, json, jsonb, boolean, numeric, serial, uniqueIndex, index, foreignKey, bigint, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Enums
 */
export const roleEnum = pgEnum("role", ["user", "admin", "domain_admin"]);
export const planEnum = pgEnum("plan", ["free", "starter", "pro", "enterprise"]);
export const transactionTypeEnum = pgEnum("transaction_type", [
  "purchase",
  "usage",
  "bonus",
  "refund",
  "adjustment",
  "subscription",
  "creator_fee",
]);

// Package type: one-time purchase or subscription
export const packageTypeEnum = pgEnum("package_type", ["one_time", "subscription", "agency"]);

// Billing period for subscription packages
export const billingPeriodEnum = pgEnum("billing_period", ["monthly", "quarterly", "semi_annual", "yearly"]);
export const contentTypeEnum = pgEnum("content_type", ["image", "video", "website"]);
export const aspectRatioEnum = pgEnum("aspect_ratio", ["1:1", "9:16", "16:9"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const entityTypeEnum = pgEnum("entity_type", ["user", "project", "preference", "technical", "decision", "plan", "architecture", "component", "task", "code_knowledge", "rule"]);

// API style for different LLM provider endpoints (OpenCode Zen uses different endpoints per model family)
export const apiStyleEnum = pgEnum("api_style", ["chat-completions", "responses", "messages", "gemini"]);

// Workflow status enum
export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft",
  "compiled",
  "running",
  "completed",
  "failed",
]);

// Template status enum
export const templateStatusEnum = pgEnum("template_status", [
  "draft",
  "pending_review",
  "published",
  "archived",
  "rejected",
]);

// Skill visibility enum
export const skillVisibilityEnum = pgEnum("skill_visibility", [
  "private",          // Only owner + assigned groups can use
  "pending_approval", // Owner requested public, awaiting admin approval
  "public",           // Admin approved, visible to all tenant users
  "rejected",         // Admin rejected public request
]);

// Workflow execution status enum (Section 13)
export const workflowExecutionStatusEnum = pgEnum("workflow_execution_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

// DLQ item status enum (Section 13)
export const dlqItemStatusEnum = pgEnum("dlq_item_status", [
  "pending",
  "reprocessing",
  "resolved",
  "discarded",
]);

// Media callback reliability enums (Section 01)
export const mediaCallbackEventStatusEnum = pgEnum("media_callback_event_status", [
  "pending",
  "processing",
  "retry_pending",
  "completed",
  "failed",
]);

export const mediaCallbackDlqStatusEnum = pgEnum("media_callback_dlq_status", [
  "pending",
  "reprocessed",
  "discarded",
]);

// Policy action enum (Section 13)
export const policyActionEnum = pgEnum("policy_action", [
  "allow",
  "deny",
  "require_approval",
]);

export const browserPolicyDecisionEnum = pgEnum("browser_policy_decision", [
  "allow",
  "allow_with_redaction",
  "require_approval",
  "deny",
  "escalate_for_review",
]);

export const browserActionClassEnum = pgEnum("browser_action_class", [
  "read",
  "draft",
  "commit",
  "restricted",
]);

export const browserPageSensitivityEnum = pgEnum("browser_page_sensitivity", [
  "none",
  "auth",
  "financial",
  "admin",
  "sensitive_data",
  "communication",
  "code",
]);

// Credit source type enum — categorizes what generated a credit transaction
export const creditSourceTypeEnum = pgEnum("credit_source_type", [
  "chat",
  "skill",
  "media_image",
  "media_video",
  "media_audio",
  "indexing",
  "rag",
  "stt",
  "translation",
  "brainstorm",
  "scheduler",
  "admin",
  "agency",
  "creator_revenue",
  "other",
  // ClawFeature additions
  "tts",
  "browser_automation",
  "widget_chat",
  "webhook_chat",
  "webhook_trigger",
]);

// Settlement status for creator revenue sharing
export const settlementStatusEnum = pgEnum("settlement_status", [
  "completed",
  "partial",
  "skipped",
]);

// Google Drive indexing mode enum
export const indexingModeEnum = pgEnum("indexing_mode", [
  "none",
  "selected_folders",
  "all_except",
  "all",
]);

// Google Drive edit session status enum
export const editSessionStatusEnum = pgEnum("edit_session_status", [
  "active",
  "saved_back",
  "discarded",
  "expired",
]);

// OpenSandbox enums
export const sandboxExecutionModeEnum = pgEnum("sandbox_execution_mode", [
  "code", "command", "browser", "file", "media",
]);

export const sandboxJobStatusEnum = pgEnum("sandbox_job_status", [
  "accepted", "policy_resolved", "queued", "provisioning",
  "staging_inputs", "executing", "collecting_outputs", "persisting",
  "completed", "failed", "timed_out", "canceled",
]);

export const sandboxArtifactTypeEnum = pgEnum("sandbox_artifact_type", [
  "primary", "log", "screenshot", "thumbnail", "chunk", "debug",
]);

export const sandboxNetworkActionEnum = pgEnum("sandbox_network_action", [
  "deny", "allow",
]);

export const sandboxFeatureTypeEnum = pgEnum("sandbox_feature_type", [
  "chat", "skill", "workflow", "library", "media", "presentation", "connector", "agency",
]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Password hash for local login (optional, null for OAuth-only users) */
  password: text("password"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),

  /** Domain where user registered (locked, only admin can change) */
  registeredDomain: varchar("registeredDomain", { length: 255 }),

  /** Current tenant ID (for quick access) */
  currentTenantId: integer("currentTenantId").references((): AnyPgColumn => tenants.id),

  /** User's credit balance (in smallest unit, e.g., 1 credit = 100 units for precision) */
  credits: integer("credits").default(0).notNull(),

  /** User's subscription plan */
  plan: planEnum("plan").default("free").notNull(),

  /** Whether user account is disabled (can be managed by domain admin) */
  isDisabled: boolean("isDisabled").default(false).notNull(),

  /** Normalized email for duplicate detection (Gmail dots stripped, + aliases removed) */
  normalizedEmail: varchar("normalizedEmail", { length: 320 }),

  /** Trust score 0-100, calculated at registration (100 = fully trusted) */
  trustScore: integer("trustScore").default(100),

  /** IP address used during registration */
  registrationIp: varchar("registrationIp", { length: 45 }),

  /** User preferences (translation language, translation model, etc.) */
  userPreferences: json("userPreferences").$type<{
    translationLanguage?: string;
    translationModel?: string;
    telegramNotifyLevel?: "all" | "high_critical" | "critical_only" | "off";
    telegramDeliveryFailing?: boolean;
  }>().default({}),

  // Recovery contacts
  backupEmail: varchar("backupEmail", { length: 320 }),
  backupEmailVerified: boolean("backupEmailVerified").default(false).notNull(),
  phone: varchar("phone", { length: 20 }),
  phoneVerified: boolean("phoneVerified").default(false).notNull(),

  // Telegram account linking
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  telegramVerified: boolean("telegramVerified").default(false).notNull(),
  telegramVerifiedAt: timestamp("telegramVerifiedAt", { withTimezone: true }),

  // Two-Factor Authentication
  twoFactorEnabled: boolean("twoFactorEnabled").default(false).notNull(),
  twoFactorSecret: text("twoFactorSecret"), // encrypted TOTP secret (base32)
  recoveryCodes: json("recoveryCodes").$type<string[]>().default([]), // bcrypt-hashed one-time codes

  /** Default AI persona for this user */
  defaultPersonaId: varchar("defaultPersonaId", { length: 36 })
    .references((): AnyPgColumn => personaTemplates.id, { onDelete: "set null" }),

  /** PDPA/GDPR voice consent: NULL = not consented, timestamp = when consent was given */
  voiceConsentGrantedAt: timestamp("voiceConsentGrantedAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
  passwordChangedAt: timestamp("passwordChangedAt", { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Credit transactions table - tracks all credit movements
 * Used for billing, usage tracking, and audit trail
 */
export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),

  /** User who owns this transaction */
  userId: integer("userId").notNull().references(() => users.id),

  /** Amount of credits (positive for additions, negative for deductions) */
  amount: integer("amount").notNull(),

  /** Transaction type */
  type: transactionTypeEnum("type").notNull(),

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
  balanceAfter: integer("balanceAfter").notNull(),

  /** Reference ID for external systems (e.g., Stripe payment ID) */
  referenceId: varchar("referenceId", { length: 128 }),

  /** Idempotency key to prevent duplicate charges for the same operation */
  idempotencyKey: varchar("idempotencyKey", { length: 256 }),

  /** Trace ID linking to providerUsageLog and apiAuditEvents for audit trail */
  traceId: varchar("traceId", { length: 32 }),

  /** Conversation this transaction belongs to (nullable — not all transactions come from conversations) */
  conversationId: integer("conversationId").references(() => conversations.id, { onDelete: "set null" }),

  /** Skill slug used for this transaction (nullable) */
  skillSlug: varchar("skillSlug", { length: 128 }),

  /** Source type categorizing what generated this transaction */
  sourceType: creditSourceTypeEnum("sourceType"),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("credit_transactions_idempotency_key_unique")
    .on(t.idempotencyKey)
    .where(sql`"idempotencyKey" IS NOT NULL`),
  index("credit_transactions_type_created_idx").on(t.type, t.createdAt),
  index("credit_transactions_trace_id_idx").on(t.traceId),
  index("credit_transactions_conversation_id_idx").on(t.conversationId),
  index("credit_transactions_source_type_idx").on(t.sourceType),
]);

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;

/**
 * Credit packages available for purchase
 * Supports both one-time purchases and subscription plans with multiple billing periods
 */
export const creditPackages = pgTable("credit_packages", {
  id: serial("id").primaryKey(),

  /** Package name */
  name: varchar("name", { length: 128 }).notNull(),

  /** Package description */
  description: text("description"),

  /** Number of credits in package (for one-time) or monthly credits (for subscription) */
  credits: integer("credits").notNull(),

  /** Price in USD (stored as numeric for precision) - base monthly price for subscriptions */
  priceUsd: numeric("priceUsd", { precision: 10, scale: 2 }).notNull(),

  /** Package type: one_time or subscription */
  packageType: packageTypeEnum("packageType").default("one_time").notNull(),

  /** Billing period for subscription packages (null for one-time) */
  billingPeriod: billingPeriodEnum("billingPeriod"),

  /** Discount percentage for non-monthly billing (e.g., 5 for quarterly, 7 for semi-annual, 10 for yearly) */
  discountPercent: integer("discountPercent").default(0),

  /** Stripe Price ID for checkout (monthly for subscriptions) */
  stripePriceId: varchar("stripePriceId", { length: 128 }),

  /** Stripe Product ID (for managing multiple prices per product) */
  stripeProductId: varchar("stripeProductId", { length: 128 }),

  /** Stripe Price IDs for different billing periods (JSON object) */
  stripePriceIds: json("stripePriceIds").$type<{
    monthly?: string;
    quarterly?: string;
    semi_annual?: string;
    yearly?: string;
  }>(),

  /** Whether package is active/available */
  isActive: boolean("isActive").default(true).notNull(),

  /** Whether this is a featured/popular package */
  isFeatured: boolean("isFeatured").default(false).notNull(),

  /** Sort order for display */
  sortOrder: integer("sortOrder").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type CreditPackage = typeof creditPackages.$inferSelect;
export type InsertCreditPackage = typeof creditPackages.$inferInsert;

/**
 * Gallery items table - stores images, videos, and website demos
 * Supports 3 content types with different aspect ratios
 */
export const galleryItems = pgTable("gallery_items", {
  id: serial("id").primaryKey(),

  /** Tenant ID - for multi-tenant isolation */
  tenantId: integer("tenantId").references(() => tenants.id, { onDelete: "cascade" }),

  /** Content type: image, video, or website */
  type: contentTypeEnum("type").notNull(),

  /** Title of the gallery item */
  title: varchar("title", { length: 255 }).notNull(),

  /** Description of the item */
  description: text("description"),

  /** Aspect ratio: 1:1, 9:16, or 16:9 */
  aspectRatio: aspectRatioEnum("aspectRatio").notNull(),

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

  /** AI model used to generate this content */
  model: varchar("model", { length: 128 }),

  /** View count */
  views: integer("views").default(0).notNull(),

  /** Like count */
  likes: integer("likes").default(0).notNull(),

  /** Download count (for images) */
  downloads: integer("downloads").default(0).notNull(),

  /** Whether the item is published/visible */
  isPublished: boolean("isPublished").default(true).notNull(),

  /** Whether the item is featured */
  isFeatured: boolean("isFeatured").default(false).notNull(),

  /** Author/creator user ID */
  authorId: integer("authorId").references(() => users.id),

  /** Author name (for display, can be custom) */
  authorName: varchar("authorName", { length: 255 }),

  /** Author avatar URL */
  authorAvatar: varchar("authorAvatar", { length: 512 }),

  /** Sort order for manual ordering */
  sortOrder: integer("sortOrder").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type GalleryItem = typeof galleryItems.$inferSelect;
export type InsertGalleryItem = typeof galleryItems.$inferInsert;


/**
 * LLM Provider configurations
 * Stores API keys and settings for various LLM providers
 */
export const llmProviders = pgTable("llm_providers", {
  id: serial("id").primaryKey(),

  /** Provider identifier (e.g., openai, anthropic, groq) */
  providerName: varchar("providerName", { length: 64 }).notNull().unique(),

  /** Display name for UI */
  displayName: varchar("displayName", { length: 128 }).notNull(),

  /** Provider description */
  description: text("description"),

  /** API base URL */
  baseUrl: varchar("baseUrl", { length: 512 }),

  /** Encrypted API key (stored securely) */
  apiKeyEncrypted: text("apiKeyEncrypted"),

  /** Whether API key is set (without exposing the key) */
  hasApiKey: boolean("hasApiKey").default(false).notNull(),

  /** Default model for this provider */
  defaultModel: varchar("defaultModel", { length: 128 }),

  /** Available models (JSON array) */
  availableModels: json("availableModels").$type<Array<{
    id: string;
    name: string;
    contextLength?: number;
    pricing?: { input: number; output: number };
  }>>(),

  /** Additional configuration */
  configJson: json("configJson").$type<{
    maxTokens?: number;
    temperature?: number;
    supportsVision?: boolean;
    supportsStreaming?: boolean;
    supportsTools?: boolean;
    headers?: Record<string, string>;
    [key: string]: any;
  }>(),

  /** Whether provider is enabled */
  isEnabled: boolean("isEnabled").default(false).notNull(),

  /** Sort order for display */
  sortOrder: integer("sortOrder").default(0).notNull(),

  /** Provider classification: 'primary', 'secondary', 'fallback' */
  providerType: varchar("providerType", { length: 32 }).default("primary").notNull(),

  /** Health status managed by circuit breaker, persisted for dashboard and startup seeding */
  healthStatus: varchar("healthStatus", { length: 32 }).default("healthy").notNull(),

  /** Last time health was evaluated */
  lastHealthCheck: timestamp("lastHealthCheck", { withTimezone: true }),

  /** Rolling failure count */
  failureCount: integer("failureCount").default(0).notNull(),

  /** Rolling success count */
  successCount: integer("successCount").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type LlmProvider = typeof llmProviders.$inferSelect;
export type InsertLlmProvider = typeof llmProviders.$inferInsert;

/**
 * Model-to-provider mapping
 * Maps which providers offer which models, replacing the availableModels JSON approach
 */
export const modelProviderMap = pgTable("model_provider_map", {
  id: serial("id").primaryKey(),

  /** Canonical model identifier used internally by frontend/routing */
  modelId: varchar("modelId", { length: 128 }).notNull(),

  /** Foreign key to llm_providers */
  providerId: integer("providerId").notNull().references(() => llmProviders.id),

  /** Human-readable display name */
  modelName: varchar("modelName", { length: 128 }).notNull(),

  /** Provider-specific model string sent in API requests */
  providerModelId: varchar("providerModelId", { length: 256 }).notNull(),

  /** Cost per 1M input tokens (0 for free) */
  pricingInput: numeric("pricingInput", { precision: 12, scale: 8 }).default("0").notNull(),

  /** Cost per 1M output tokens (0 for free) */
  pricingOutput: numeric("pricingOutput", { precision: 12, scale: 8 }).default("0").notNull(),

  /** Whether this model is free to use */
  isFree: boolean("isFree").default(false).notNull(),

  /** Maximum context window size */
  contextLength: integer("contextLength"),

  /** Whether this mapping is active */
  isEnabled: boolean("isEnabled").default(true).notNull(),

  /** Lower = higher priority within this provider */
  priority: integer("priority").default(0).notNull(),

  /** API style for endpoint routing (only used for providers like OpenCode Zen with multiple endpoints) */
  apiStyle: apiStyleEnum("apiStyle").default("chat-completions").notNull(),
}, (t) => [
  uniqueIndex("model_provider_map_unique").on(t.modelId, t.providerId),
]);

export type ModelProviderMap = typeof modelProviderMap.$inferSelect;
export type InsertModelProviderMap = typeof modelProviderMap.$inferInsert;

/**
 * Provider usage log
 * Per-request tracking for dashboards and cost reconciliation
 */
export const providerUsageLog = pgTable("provider_usage_log", {
  id: serial("id").primaryKey(),

  userId: integer("userId").notNull().references(() => users.id),
  providerId: integer("providerId").notNull().references(() => llmProviders.id),
  modelUsed: varchar("modelUsed", { length: 128 }).notNull(),
  inputTokens: integer("inputTokens").default(0).notNull(),
  outputTokens: integer("outputTokens").default(0).notNull(),

  /** Provider-reported or calculated cost */
  costUsd: numeric("costUsd", { precision: 12, scale: 8 }).default("0").notNull(),

  creditsCharged: integer("creditsCharged").default(0).notNull(),
  responseTimeMs: integer("responseTimeMs"),
  statusCode: integer("statusCode"),

  /** Error classification: 'rate_limit', 'timeout', 'server_error' */
  errorType: varchar("errorType", { length: 64 }),

  /** Audit trace correlation */
  traceId: varchar("traceId", { length: 32 }),
  errorMessage: text("errorMessage"),
  requestType: varchar("requestType", { length: 32 }),

  wasFallback: boolean("wasFallback").default(false).notNull(),
  fallbackFromProviderId: integer("fallbackFromProviderId").references(() => llmProviders.id),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("provider_usage_log_user_created").on(t.userId, t.createdAt),
  index("provider_usage_log_provider_created").on(t.providerId, t.createdAt),
  index("provider_usage_log_trace_id").on(t.traceId),
]);

export type ProviderUsageLog = typeof providerUsageLog.$inferSelect;
export type InsertProviderUsageLog = typeof providerUsageLog.$inferInsert;

/**
 * API audit events
 * Structured logging for media/skill/LLM requests with trace correlation
 */
export const apiAuditEvents = pgTable("api_audit_events", {
  id: serial("id").primaryKey(),
  traceId: varchar("traceId", { length: 32 }).notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  userId: integer("userId").references(() => users.id),
  endpoint: varchar("endpoint", { length: 512 }),
  model: varchar("model", { length: 128 }),
  provider: varchar("provider", { length: 64 }),
  statusCode: integer("statusCode"),
  errorMessage: text("errorMessage"),
  responseTimeMs: integer("responseTimeMs"),
  creditsCharged: integer("creditsCharged").default(0),
  costUsd: numeric("costUsd", { precision: 12, scale: 8 }),
  skillSlug: varchar("skillSlug", { length: 100 }),
  mediaType: varchar("mediaType", { length: 20 }),
  mediaTaskId: varchar("mediaTaskId", { length: 128 }),
  metadata: json("metadata"),

  /** Associated sandbox job ID */
  sandboxJobId: varchar("sandboxJobId", { length: 36 }),
  /** OpenSandbox container ID for correlation */
  opensandboxId: varchar("opensandboxId", { length: 128 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("api_audit_events_trace_id").on(t.traceId),
  index("api_audit_events_user_created").on(t.userId, t.createdAt),
  index("api_audit_events_type_created").on(t.eventType, t.createdAt),
]);

export type ApiAuditEvent = typeof apiAuditEvents.$inferSelect;
export type InsertApiAuditEvent = typeof apiAuditEvents.$inferInsert;

/**
 * Routing rules
 * Admin-configured routing preferences per model pattern
 */
export const routingRules = pgTable("routing_rules", {
  id: serial("id").primaryKey(),

  /** Glob-style pattern: "*", "kimi-*", or exact model ID */
  modelPattern: varchar("modelPattern", { length: 128 }).notNull(),

  /** Routing strategy: 'cost', 'quality', 'priority' */
  routingMode: varchar("routingMode", { length: 32 }).notNull(),

  /** Array of provider IDs for priority mode */
  providerOrder: json("providerOrder").$type<number[]>(),

  /** Maximum fallback attempts */
  maxFallbacks: integer("maxFallbacks").default(3).notNull(),

  /** Whether this rule is active */
  isActive: boolean("isActive").default(true).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type RoutingRule = typeof routingRules.$inferSelect;
export type InsertRoutingRule = typeof routingRules.$inferInsert;

/**
 * Tenants table - White Label Multi-Tenant System
 * Each tenant represents a separate branded instance with its own domain
 */
export const tenants = pgTable("tenants", {
  /** Tenant ID (e.g., "tenant-abc123") */
  id: varchar("id", { length: 36 }).primaryKey(),

  /** Unique slug for URL routing (e.g., "smartspec", "acme-corp") */
  slug: varchar("slug", { length: 64 }).notNull().unique(),

  /** Tenant display name */
  name: varchar("name", { length: 255 }).notNull(),

  /** Primary domain for this tenant (e.g., "smartspec.ai", "acme.com") */
  primaryDomain: varchar("primaryDomain", { length: 255 }).unique(),

  /** Additional domains (JSON array) for multi-domain support */
  domains: json("domains").$type<string[]>(),

  /** Tenant logo URL */
  logoUrl: varchar("logoUrl", { length: 512 }),

  /** Website logo URL (larger logo for public pages header/footer) */
  websiteLogoUrl: varchar("websiteLogoUrl", { length: 512 }),

  /** Favicon URL */
  faviconUrl: varchar("faviconUrl", { length: 512 }),

  /** Whether tenant is active */
  isActive: boolean("isActive").default(true).notNull(),

  /** SEO Configuration for this tenant */
  seoConfig: json("seoConfig").$type<{
    // Traditional SEO
    defaultTitle?: string;
    defaultDescription?: string;
    defaultKeywords?: string[];
    ogImage?: string;
    twitterCard?: "summary" | "summary_large_image" | "app" | "player";

    // AI/LLM SEO (AIO - AI-Optimized)
    aiContext?: string; // Natural language context for LLMs
    aiKeyFacts?: string[]; // Key facts in conversational format
    structuredData?: Record<string, any>; // Schema.org markup

    // GEO SEO
    geoTargeting?: {
      country?: string;
      region?: string;
      city?: string;
      language?: string;
      coordinates?: { lat: number; lng: number };
    };
  }>(),

  /** Theme configuration (colors, fonts, layout) */
  themeConfig: json("themeConfig").$type<{
    // Brand Colors
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;

    // Typography
    fontFamily?: string;
    headingFont?: string;

    // Layout
    layout?: "modern" | "classic" | "minimal" | "creative";
    headerStyle?: "transparent" | "solid" | "blur";
    footerStyle?: "minimal" | "detailed" | "hidden";

    // Components
    buttonStyle?: "rounded" | "square" | "pill";
    cardStyle?: "elevated" | "flat" | "outlined";

    // Custom CSS
    customCss?: string;
  }>(),

  /** Contact information */
  contactInfo: json("contactInfo").$type<{
    email?: string;
    phone?: string;
    address?: string;
    socialLinks?: {
      facebook?: string;
      twitter?: string;
      linkedin?: string;
      instagram?: string;
      youtube?: string;
    };
  }>(),

  /** Settings and feature flags */
  settings: json("settings").$type<{
    // Features
    enableBlog?: boolean;
    enableGallery?: boolean;
    enableEcommerce?: boolean;
    enableBooking?: boolean;

    // Analytics
    googleAnalyticsId?: string;
    facebookPixelId?: string;

    // Integrations
    stripePublicKey?: string;
    mailchimpApiKey?: string;

    // Custom
    [key: string]: any;
  }>(),

  /** Owner/Admin user ID */
  ownerId: integer("ownerId").references((): AnyPgColumn => users.id),

  /** Default AI persona for this tenant */
  defaultPersonaId: varchar("defaultPersonaId", { length: 36 })
    .references((): AnyPgColumn => personaTemplates.id, { onDelete: "set null" }),

  /** Feature flags for this tenant */
  featureFlags: json("featureFlags").$type<Record<string, boolean>>(),

  /** Tenant status (from Python backend) */
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),

  /** Tenant plan (from Python backend) */
  plan: varchar("plan", { length: 20 }).notNull().default("FREE"),

  /** Created at (snake_case, from Python backend) */
  created_at: timestamp("created_at").defaultNow().notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/**
 * User Groups - Custom groups for file sharing and collaboration
 */
export const userGroups = pgTable("user_groups", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  iconUrl: text("icon_url"),
  settings: json("settings").$type<{
    visibility: "private" | "public";
    joinPolicy: "invite_only" | "request_to_join" | "open";
  }>().notNull().default(sql`'{"visibility":"private","joinPolicy":"invite_only"}'::json`),
  memberCount: integer("member_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  // Partial unique index - allows recreating deleted group names (namespace collision fix)
  uniqueIndex("user_groups_tenant_name_unique")
    .on(t.tenantId, t.name)
    .where(sql`deleted_at IS NULL`),

  // Partial indexes for soft-delete performance
  index("user_groups_tenant_idx")
    .on(t.tenantId)
    .where(sql`deleted_at IS NULL`),
  index("user_groups_owner_idx")
    .on(t.ownerId)
    .where(sql`deleted_at IS NULL`),
  index("user_groups_visibility_idx")
    .on(t.tenantId, sql`(settings->>'visibility')`)
    .where(sql`deleted_at IS NULL`),
]);

export type UserGroup = typeof userGroups.$inferSelect;
export type InsertUserGroup = typeof userGroups.$inferInsert;

/**
 * Group Members - User membership in groups
 */
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => userGroups.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 32 }).notNull().default("member"), // "admin" | "member"
  addedBy: integer("added_by").references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 32 }).notNull().default("active"), // "active" | "pending" | "removed"
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (t) => [
  // One membership per user per group
  uniqueIndex("group_members_group_user_unique").on(t.groupId, t.userId),

  // Partial indexes for active memberships only (huge performance gain)
  index("group_members_group_active_idx")
    .on(t.groupId)
    .where(sql`status = 'active'`),
  index("group_members_user_active_idx")
    .on(t.userId)
    .where(sql`status = 'active'`),
]);

export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = typeof groupMembers.$inferInsert;

/**
 * Theme configuration type (shared between tenants and presets)
 */
export type ThemeConfig = {
  // Brand Colors
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;

  // Typography
  fontFamily?: string;
  headingFont?: string;

  // Layout
  layout?: "modern" | "classic" | "minimal" | "creative";
  headerStyle?: "transparent" | "solid" | "blur";
  footerStyle?: "minimal" | "detailed" | "hidden";

  // Components
  buttonStyle?: "rounded" | "square" | "pill";
  cardStyle?: "elevated" | "flat" | "outlined";

  // Custom CSS
  customCss?: string;
};

/**
 * Theme Presets - Pre-built themes for domain admins to select
 * Provides quick styling options without manual configuration
 */
export const themePresets = pgTable("theme_presets", {
  id: serial("id").primaryKey(),

  /** Unique identifier for the theme preset */
  name: varchar("name", { length: 128 }).notNull().unique(),

  /** Display name shown in UI */
  displayName: varchar("displayName", { length: 255 }).notNull(),

  /** Description of the theme style */
  description: text("description"),

  /** Preview image URL for the theme */
  previewImageUrl: varchar("previewImageUrl", { length: 512 }),

  /** Theme configuration (colors, layout, etc.) */
  themeConfig: json("themeConfig").$type<ThemeConfig>().notNull(),

  /** Whether this preset is available for selection */
  isActive: boolean("isActive").default(true).notNull(),

  /** Whether this is the default theme for new tenants */
  isDefault: boolean("isDefault").default(false).notNull(),

  /** Sort order for display */
  sortOrder: integer("sortOrder").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ThemePreset = typeof themePresets.$inferSelect;
export type InsertThemePreset = typeof themePresets.$inferInsert;

/**
 * SEO Metadata - AI-Optimized SEO for pages and content
 * Supports traditional SEO, AIO (AI-Optimized), and GEO targeting
 */
export const seoMetadata = pgTable("seo_metadata", {
  id: serial("id").primaryKey(),

  /** Tenant this SEO metadata belongs to */
  tenantId: integer("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Path or entity this metadata applies to (e.g., "/", "/about", "gallery:123") */
  path: varchar("path", { length: 512 }).notNull(),

  /** Page title (Traditional SEO) */
  title: varchar("title", { length: 255 }).notNull(),

  /** Meta description (Traditional SEO) */
  description: text("description"),

  /** Keywords (Traditional SEO) */
  keywords: json("keywords").$type<string[]>(),

  /** Canonical URL */
  canonicalUrl: varchar("canonicalUrl", { length: 512 }),

  /** Open Graph metadata */
  ogMetadata: json("ogMetadata").$type<{
    title?: string;
    description?: string;
    image?: string;
    type?: string;
    url?: string;
    siteName?: string;
  }>(),

  /** Twitter Card metadata */
  twitterMetadata: json("twitterMetadata").$type<{
    card?: "summary" | "summary_large_image" | "app" | "player";
    title?: string;
    description?: string;
    image?: string;
    site?: string;
    creator?: string;
  }>(),

  /** AI-Optimized Content (AIO) - Natural language for LLMs */
  aiContent: json("aiContent").$type<{
    // Natural language context that helps LLMs understand the page
    context: string;

    // Key facts in conversational format (for featured snippets)
    keyFacts: string[];

    // FAQ format (helps with voice search and LLM responses)
    faqs?: Array<{ question: string; answer: string }>;

    // Entity information (helps LLMs understand relationships)
    entities?: Array<{
      name: string;
      type: string; // Person, Organization, Product, etc.
      description: string;
      sameAs?: string[]; // URLs to other representations
    }>;

    // Step-by-step guides (for how-to queries)
    howTo?: Array<{ step: number; instruction: string; tip?: string }>;
  }>(),

  /** Structured Data (Schema.org) for rich snippets */
  structuredData: json("structuredData").$type<Record<string, any>>(),

  /** GEO targeting information */
  geoData: json("geoData").$type<{
    targetCountries?: string[]; // ISO country codes
    targetRegions?: string[];
    targetCities?: string[];
    language?: string; // ISO language code
    coordinates?: { lat: number; lng: number };
    radius?: number; // in kilometers
    localBusinessInfo?: {
      name: string;
      address: string;
      phone: string;
      hours?: string;
      priceRange?: string;
    };
  }>(),

  /** Content quality signals for LLMs */
  qualitySignals: json("qualitySignals").$type<{
    authorName?: string;
    authorExpertise?: string;
    publishedDate?: string;
    lastModifiedDate?: string;
    contentDepth?: "brief" | "moderate" | "comprehensive";
    sourceCredibility?: "high" | "medium" | "low";
    citations?: string[]; // References to sources
  }>(),

  /** Whether this metadata is active */
  isActive: boolean("isActive").default(true).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type SeoMetadata = typeof seoMetadata.$inferSelect;
export type InsertSeoMetadata = typeof seoMetadata.$inferInsert;

/**
 * Tenant Pages - Domain-specific page content
 * Each tenant can have completely different content for each page
 */
export const tenantPages = pgTable("tenant_pages", {
  id: serial("id").primaryKey(),

  /** Tenant this page belongs to */
  tenantId: integer("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Page identifier (e.g., "home", "about", "features", "pricing") */
  pageKey: varchar("pageKey", { length: 64 }).notNull(),

  /** Page title */
  title: varchar("title", { length: 255 }).notNull(),

  /** Page slug for URL */
  slug: varchar("slug", { length: 255 }).notNull(),

  /** Page content (HTML or Markdown) */
  content: text("content"),

  /** Structured content sections (JSON) */
  sections: json("sections").$type<Array<{
    id: string;
    type: "hero" | "features" | "testimonials" | "cta" | "content" | "gallery" | "pricing" | "faq" | "team" | "contact" | "custom" | "stats" | "process";
    title?: string;
    subtitle?: string;
    content?: string;
    image?: string;
    buttons?: Array<{ text: string; link: string; style?: string }>;
    items?: Array<any>;
    settings?: Record<string, any>;
  }>>(),

  /** Page metadata */
  metadata: json("metadata").$type<{
    description?: string;
    keywords?: string[];
    author?: string;
    ogImage?: string;
    customMeta?: Record<string, string>;
  }>(),

  /** Whether page is published */
  isPublished: boolean("isPublished").default(false).notNull(),

  /** Sort order for menu */
  sortOrder: integer("sortOrder").default(0).notNull(),

  /** Show in navigation menu */
  showInMenu: boolean("showInMenu").default(true).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TenantPage = typeof tenantPages.$inferSelect;
export type InsertTenantPage = typeof tenantPages.$inferInsert;

/**
 * Chat Conversations - Multi-chat support with settings
 * Each conversation belongs to a user and can have custom settings
 */
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),

  /** User who owns this conversation */
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Conversation title (auto-generated or user-set) */
  title: varchar("title", { length: 255 }).notNull().default("New Chat"),

  /** LLM model to use for this conversation */
  model: varchar("model", { length: 100 }).default("gpt-4o-mini"),

  /** Temperature setting (0-2) */
  temperature: numeric("temperature", { precision: 3, scale: 2 }).default("0.7"),

  /** Custom system prompt */
  systemPrompt: text("systemPrompt"),

  /** Skill settings for this conversation */
  skillSettings: json("skillSettings").$type<{
    autoDetect: boolean;
    enabledSkills: string[];
    detectionMode: "ask" | "auto" | "explicit";
  }>().default({ autoDetect: true, enabledSkills: [], detectionMode: "auto" }),

  /** Whether conversation is archived */
  isArchived: boolean("isArchived").default(false).notNull(),

  /** Whether conversation is pinned */
  isPinned: boolean("isPinned").default(false).notNull(),

  /** Soft-delete: when moved to trash (auto-purged after 30 days) */
  trashedAt: timestamp("trashedAt"),

  /** Total credits used in this conversation */
  totalCreditsUsed: numeric("totalCreditsUsed", { precision: 12, scale: 4 }).default("0"),

  /** Total messages count */
  messageCount: integer("messageCount").default(0).notNull(),

  /** Project ID for cross-session memory linking */
  projectId: varchar("project_id", { length: 100 }),

  /** Memory mode: full | no_long | off */
  memoryMode: varchar("memory_mode", { length: 20 }).default("full"),

  /** Brainstorm partner model (Model B) */
  brainstormPartnerModel: varchar("brainstormPartnerModel", { length: 100 }),

  /** Brainstorm max rounds per session */
  brainstormMaxRounds: integer("brainstormMaxRounds").default(3),

  /** Default policy for attaching external channels to this conversation */
  defaultChannelPolicy: varchar("defaultChannelPolicy", { length: 20 }).default("allow_attach"),

  /** Tenant this conversation belongs to (for multi-tenant isolation) */
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),

  /** AI persona used for this conversation */
  personaId: varchar("personaId", { length: 36 }).references((): AnyPgColumn => personaTemplates.id, { onDelete: "set null" }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_conversations_tenant").on(t.tenantId),
]);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Chat Messages - Individual messages within a conversation
 * Supports multi-modal content (text, images, videos) and artifacts
 */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),

  /** Conversation this message belongs to */
  conversationId: integer("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),

  /** Message role: user, assistant, or system */
  role: messageRoleEnum("role").notNull(),

  /** Message content (text) */
  content: text("content").notNull(),

  /** Input tokens used */
  inputTokens: integer("inputTokens").default(0),

  /** Output tokens used */
  outputTokens: integer("outputTokens").default(0),

  /** Credits used for this message */
  creditsUsed: numeric("creditsUsed", { precision: 10, scale: 4 }).default("0"),

  /** Model used for this message */
  modelUsed: varchar("modelUsed", { length: 100 }),

  /** Attachments (images, files uploaded by user) */
  attachments: json("attachments").$type<Array<{
    type: "image" | "file" | "audio" | "video";
    url: string;
    key?: string;
    name?: string;
    size?: number;
    mimeType?: string;
    thumbnail?: string;
  }>>().default([]),

  /** Artifacts extracted from response (code, markdown, media) */
  artifacts: json("artifacts").$type<Array<{
    id: string;
    type: "code" | "markdown" | "image" | "video" | "pdf" | "file" | "slideshow" | "chart" | "table" | "mermaid" | "svg" | "react" | "html";
    title?: string;
    content: string | string[];
    language?: string;
    metadata?: Record<string, any>;
  }>>().default([]),

  /** Skill that was used (if any) */
  skillUsed: varchar("skillUsed", { length: 100 }),

  /** Arguments passed to the skill */
  skillArgs: json("skillArgs").$type<Record<string, any>>(),

  /** Error if message generation failed */
  error: text("error"),

  /** Whether message was regenerated */
  isRegenerated: boolean("isRegenerated").default(false),

  /** Parent message ID (for regenerated messages) */
  parentMessageId: integer("parentMessageId"),

  /** Channel that originated this message (web, telegram, system) */
  sourceChannel: varchar("sourceChannel", { length: 20 }),

  /** Connection ID for the originating channel (FK to telegram_connections) */
  sourceConnectionId: varchar("sourceConnectionId", { length: 36 }),

  /** External platform message ID (e.g., Telegram message_id) */
  externalSourceId: varchar("externalSourceId", { length: 64 }),

  /** Trace ID for cost correlation with providerUsageLog */
  traceId: varchar("traceId", { length: 32 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("messages_created_at_idx").on(t.createdAt),
  index("idx_messages_traceid").on(t.traceId),
]);

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Conversation Summaries - LLM-generated summaries for memory management
 * Used to compress old messages while retaining context
 */
export const conversationSummaries = pgTable("conversation_summaries", {
  id: serial("id").primaryKey(),

  /** Conversation this summary belongs to */
  conversationId: integer("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),

  /** The generated summary text */
  summary: text("summary").notNull(),

  /** Starting message ID that was summarized */
  messageRangeStart: integer("messageRangeStart").notNull(),

  /** Ending message ID that was summarized */
  messageRangeEnd: integer("messageRangeEnd").notNull(),

  /** Number of messages summarized */
  messageCount: integer("messageCount").notNull(),

  /** Tokens used to generate summary */
  tokensUsed: integer("tokensUsed"),

  /** Project ID for cross-session summary sharing */
  projectId: varchar("project_id", { length: 100 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type InsertConversationSummary = typeof conversationSummaries.$inferInsert;

/**
 * Entity Memories - Long-term facts about users, projects, and preferences
 * Persists across conversations and provides personalized context
 */
export const entityMemories = pgTable("entity_memories", {
  id: serial("id").primaryKey(),

  /** User this memory belongs to */
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Type of entity: user, project, preference, technical */
  entityType: entityTypeEnum("entityType").notNull(),

  /** Name of the entity (e.g., "SmartSpecPro", "coding style") */
  entityName: varchar("entityName", { length: 255 }).notNull(),

  /** Facts about the entity (JSON array of strings) */
  facts: json("facts").$type<string[]>().notNull().default([]),

  /** Source conversation ID (where fact was learned) */
  sourceConversationId: integer("sourceConversationId").references(() => conversations.id, { onDelete: "set null" }),

  /** Project scope — null means global (user-level) memory */
  projectId: varchar("projectId", { length: 100 }),

  /** Confidence score (0-1) */
  confidence: numeric("confidence", { precision: 3, scale: 2 }).default("0.8"),

  /** Last time this memory was accessed */
  lastAccessedAt: timestamp("lastAccessedAt", { withTimezone: true }).defaultNow(),

  /** Importance score (1-10) */
  importance: integer("importance").default(5),

  /** Source: 'auto', 'manual', 'suggested' */
  source: varchar("source", { length: 20 }).default("auto"),

  /** Number of times this memory was reinforced */
  reinforcementCount: integer("reinforcementCount").default(1),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type EntityMemory = typeof entityMemories.$inferSelect;
export type InsertEntityMemory = typeof entityMemories.$inferInsert;

/**
 * Skill Preferences - Per-conversation skill settings
 * Allows users to enable/disable specific skills for each conversation
 */
export const skillPreferences = pgTable("skill_preferences", {
  id: serial("id").primaryKey(),

  /** Conversation this preference belongs to */
  conversationId: integer("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),

  /** Skill identifier */
  skillId: varchar("skillId", { length: 100 }).notNull(),

  /** Whether skill is enabled */
  enabled: boolean("enabled").default(true).notNull(),

  /** Priority for skill detection (higher = checked first) */
  priority: integer("priority").default(0).notNull(),

  /** Custom settings for this skill */
  customSettings: json("customSettings").$type<Record<string, any>>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type SkillPreference = typeof skillPreferences.$inferSelect;
export type InsertSkillPreference = typeof skillPreferences.$inferInsert;

/**
 * Media Provider Type Enum
 * Defines the types of media that each provider can generate
 */
export const mediaProviderTypeEnum = pgEnum("media_provider_type", ["image", "video", "audio", "multimodal"]);

/**
 * Media Providers - Configuration for media generation services
 * Stores API keys and settings for providers like Kie AI, fal.ai, etc.
 */
export const mediaProviders = pgTable("media_providers", {
  id: serial("id").primaryKey(),

  /** Provider identifier (e.g., kie_ai, fal_ai, replicate) */
  providerName: varchar("providerName", { length: 64 }).notNull().unique(),

  /** Display name for UI */
  displayName: varchar("displayName", { length: 128 }).notNull(),

  /** Provider description */
  description: text("description"),

  /** Type of media this provider handles */
  providerType: mediaProviderTypeEnum("providerType").notNull().default("multimodal"),

  /** API base URL */
  baseUrl: varchar("baseUrl", { length: 512 }),

  /** Callback URL for async operations (e.g., Kie.ai task completion webhook) */
  callbackUrl: varchar("callbackUrl", { length: 512 }),

  /** Encrypted API key (stored securely) */
  apiKeyEncrypted: text("apiKeyEncrypted"),

  /** Whether API key is set (without exposing the key) */
  hasApiKey: boolean("hasApiKey").default(false).notNull(),

  /** Available models/services (JSON array) */
  availableModels: json("availableModels").$type<Array<{
    id: string;
    name: string;
    type: "image" | "video" | "audio";
    description?: string;
    pricing?: {
      perGeneration?: number;
      perSecond?: number;
      perMinute?: number;
    };
    config?: {
      maxDuration?: number;
      maxResolution?: string;
      supportedFormats?: string[];
    };
  }>>(),

  /** Default model for this provider */
  defaultModel: varchar("defaultModel", { length: 128 }),

  /** Additional configuration */
  configJson: json("configJson").$type<{
    timeout?: number;
    maxRetries?: number;
    webhookUrl?: string;
    headers?: Record<string, string>;
    rateLimit?: {
      requestsPerMinute?: number;
      requestsPerDay?: number;
    };
    [key: string]: any;
  }>(),

  /** Whether provider is enabled */
  isEnabled: boolean("isEnabled").default(false).notNull(),

  /** Whether this is the primary provider for its type */
  isPrimary: boolean("isPrimary").default(false).notNull(),

  /** Priority order (lower = higher priority, used for failover) */
  priority: integer("priority").default(0).notNull(),

  /** Sort order for display */
  sortOrder: integer("sortOrder").default(0).notNull(),

  /** Last successful connection test */
  lastTestedAt: timestamp("lastTestedAt", { withTimezone: true }),

  /** Last test result */
  lastTestResult: json("lastTestResult").$type<{
    success: boolean;
    message: string;
    latencyMs?: number;
    balance?: number;
  }>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type MediaProvider = typeof mediaProviders.$inferSelect;
export type InsertMediaProvider = typeof mediaProviders.$inferInsert;

/**
 * Media Model Type Enum
 * Defines what type of media this model generates
 */
export const mediaModelTypeEnum = pgEnum("media_model_type", ["image", "video", "audio"]);

/**
 * Media Models - Configuration for AI generation models
 * Centralized registry of all available models (Nano Banana Pro, Flux, Veo, etc.)
 */
export const mediaModels = pgTable("media_models", {
  id: serial("id").primaryKey(),

  /** Model identifier (e.g., google-nano-banana-pro, flux-2.0) */
  modelId: varchar("modelId", { length: 128 }).notNull().unique(),

  /** Display name for UI */
  name: varchar("name", { length: 128 }).notNull(),

  /** Model description */
  description: text("description"),

  /** Type of media this model generates */
  modelType: mediaModelTypeEnum("modelType").notNull(),

  /** Provider name (e.g., kie.ai, fal.ai) */
  provider: varchar("provider", { length: 64 }).notNull(),

  /** Aliases for natural language detection (JSON array) */
  aliases: json("aliases").$type<string[]>().default([]),

  /** Credit cost per generation */
  creditCost: integer("creditCost").notNull().default(10),

  /** Supported aspect ratios (JSON array) */
  aspectRatios: json("aspectRatios").$type<string[]>(),

  /** Supported sizes (JSON array) */
  sizes: json("sizes").$type<string[]>(),

  /** Supported durations for video (JSON array of numbers) */
  durations: json("durations").$type<number[]>(),

  /** Supported voices for audio (JSON array) */
  voices: json("voices").$type<string[]>(),

  /** Additional configuration */
  configJson: json("configJson").$type<Record<string, any>>(),

  /** Whether model is enabled */
  isEnabled: boolean("isEnabled").default(true).notNull(),

  /** Priority for selection (lower = higher priority) */
  priority: integer("priority").default(99).notNull(),

  /** Sort order for display */
  sortOrder: integer("sortOrder").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type MediaModel = typeof mediaModels.$inferSelect;
export type InsertMediaModel = typeof mediaModels.$inferInsert;

/**
 * Durable callback event log for media provider webhooks.
 * Enables idempotent processing and retry scheduling.
 */
export const mediaCallbackEvents = pgTable("media_callback_events", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
  providerName: varchar("provider_name", { length: 64 }).notNull().default("kie_ai"),
  providerTaskId: varchar("provider_task_id", { length: 128 }),
  eventFingerprint: varchar("event_fingerprint", { length: 64 }).notNull().unique(),
  payload: json("payload").$type<Record<string, any>>().notNull().default({}),
  normalizedStatus: varchar("normalized_status", { length: 32 }),
  resultUrl: text("result_url"),
  errorMessage: text("error_message"),
  status: mediaCallbackEventStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),

  /** Associated sandbox job ID (if media was processed in sandbox) */
  sandboxJobId: varchar("sandbox_job_id", { length: 36 }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("media_callback_events_provider_task_idx").on(t.providerTaskId),
  index("media_callback_events_status_retry_idx").on(t.status, t.nextRetryAt),
  index("media_callback_events_provider_status_idx").on(t.providerTaskId, t.status),
  index("media_callback_events_tenant_status_retry_idx").on(t.tenantId, t.status, t.nextRetryAt),
]);

export type MediaCallbackEvent = typeof mediaCallbackEvents.$inferSelect;
export type InsertMediaCallbackEvent = typeof mediaCallbackEvents.$inferInsert;

/**
 * Media callback dead-letter entries for terminal callback processing failures.
 */
export const mediaCallbackDlq = pgTable("media_callback_dlq", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => mediaCallbackEvents.id, { onDelete: "set null" }),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
  providerName: varchar("provider_name", { length: 64 }).notNull().default("kie_ai"),
  providerTaskId: varchar("provider_task_id", { length: 128 }),
  eventFingerprint: varchar("event_fingerprint", { length: 64 }).notNull(),
  payload: json("payload").$type<Record<string, any>>().notNull().default({}),
  errorMessage: text("error_message").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  status: mediaCallbackDlqStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("media_callback_dlq_event_idx").on(t.eventId),
  index("media_callback_dlq_provider_task_idx").on(t.providerTaskId),
  index("media_callback_dlq_status_idx").on(t.status),
  index("media_callback_dlq_tenant_status_idx").on(t.tenantId, t.status),
]);

export type MediaCallbackDlqItem = typeof mediaCallbackDlq.$inferSelect;
export type InsertMediaCallbackDlqItem = typeof mediaCallbackDlq.$inferInsert;

/**
 * Unified library schema (Section 02)
 * Shared for media/document assets and RAG indexing lifecycle.
 */
export const libraryItemStatusEnum = pgEnum("library_item_status", [
  "draft",
  "ready",
  "indexing",
  "archived",
  "failed",
]);

export const libraryVisibilityEnum = pgEnum("library_visibility", [
  "private",
  "team",
  "public",
]);

export const libraryIndexJobStatusEnum = pgEnum("library_index_job_status", [
  "pending",
  "processing",
  "retry_pending",
  "completed",
  "failed",
]);

export const libraryItems = pgTable("library_items", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // null = root-level; non-null = inside a folder (itemType="folder")
  parentId: integer("parent_id").references((): AnyPgColumn => libraryItems.id, { onDelete: "cascade" }),
  itemType: varchar("item_type", { length: 32 }).notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: libraryItemStatusEnum("status").notNull().default("ready"),
  visibility: libraryVisibilityEnum("visibility").notNull().default("private"),
  metadata: json("metadata").$type<Record<string, any>>().notNull().default({}),
  sourceUrl: text("source_url"),
  thumbnailUrl: text("thumbnail_url"),
  // Denormalized scope cache for vector DB filtering
  allowedScopes: text("allowed_scopes").array().default(sql`'{}'`),

  deletedAt: timestamp("deleted_at", { withTimezone: true }),

  // Track who deleted the file (for trash UI)
  deletedBy: integer("deleted_by").references(() => users.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("library_items_id_tenant_unique").on(t.id, t.tenantId),
  index("library_items_tenant_visibility_status_idx").on(t.tenantId, t.visibility, t.status),
  index("library_items_tenant_owner_status_idx").on(t.tenantId, t.ownerUserId, t.status),
  index("library_items_source_item_type_idx").on(t.source, t.itemType),
  index("library_items_deleted_at_idx").on(t.deletedAt),
  index("library_items_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
  index("library_items_parent_id_idx").on(t.parentId),
]);

export type LibraryItem = typeof libraryItems.$inferSelect;
export type InsertLibraryItem = typeof libraryItems.$inferInsert;

export const libraryLinks = pgTable("library_links", {
  id: serial("id").primaryKey(),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  linkType: varchar("link_type", { length: 64 }).notNull(),
  linkId: varchar("link_id", { length: 128 }).notNull(),
  providerTaskId: varchar("provider_task_id", { length: 128 }),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("library_links_source_tenant_unique").on(t.linkType, t.linkId, t.tenantId),
  index("library_links_item_type_idx").on(t.libraryItemId, t.linkType),
  index("library_links_provider_task_idx").on(t.providerTaskId),
]);

export type LibraryLink = typeof libraryLinks.$inferSelect;
export type InsertLibraryLink = typeof libraryLinks.$inferInsert;

export const libraryChunks = pgTable("library_chunks", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  contentType: varchar("content_type", { length: 32 }).notNull().default("text"),
  tokenCount: integer("token_count"),
  vectorRefId: varchar("vector_ref_id", { length: 128 }),
  metadata: json("metadata").$type<Record<string, any>>().notNull().default({}),
  // Denormalized scope cache — mirrors parent item's allowed_scopes
  allowedScopes: text("allowed_scopes").array().default(sql`'{}'`),
  // Parent-child chunk support for RAG
  isParent: boolean("is_parent").default(false).notNull(),
  parentChunkId: text("parent_chunk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("library_chunks_item_chunk_index_unique").on(t.libraryItemId, t.chunkIndex),
  index("library_chunks_tenant_content_type_idx").on(t.tenantId, t.contentType),
  index("library_chunks_vector_ref_idx").on(t.vectorRefId),
  index("library_chunks_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
  index("library_chunks_parent_chunk_idx").on(t.parentChunkId),
]);

export type LibraryChunk = typeof libraryChunks.$inferSelect;
export type InsertLibraryChunk = typeof libraryChunks.$inferInsert;

export const libraryContentVersions = pgTable("library_content_versions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  content: text("content").notNull(),
  contentType: varchar("content_type", { length: 32 }).notNull().default("markdown_source"),
  contentSizeBytes: integer("content_size_bytes").notNull(),
  changeDescription: text("change_description"),
  // S3/storage key of archived file for binary file versions (null for markdown versions)
  snapshotObjectKey: varchar("snapshot_object_key", { length: 512 }),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("library_versions_item_version_unique").on(t.libraryItemId, t.versionNumber),
  index("library_versions_item_created_idx").on(t.libraryItemId, t.createdAt),
  index("library_versions_tenant_created_idx").on(t.tenantId, t.createdAt),
  index("library_versions_hash_idx").on(t.contentHash),
]);

export type LibraryContentVersion = typeof libraryContentVersions.$inferSelect;
export type InsertLibraryContentVersion = typeof libraryContentVersions.$inferInsert;

export const libraryPermissions = pgTable("library_permissions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  subjectType: varchar("subject_type", { length: 32 }).notNull(),
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  permissionLevel: varchar("permission_level", { length: 32 }).notNull().default("read"),
  grantedByUserId: integer("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("library_permissions_subject_unique").on(t.libraryItemId, t.subjectType, t.subjectId),
  index("library_permissions_tenant_subject_idx").on(t.tenantId, t.subjectType, t.subjectId),

  // Optimize group permission lookups
  index("library_permissions_group_idx")
    .on(t.subjectId, t.subjectType)
    .where(sql`subject_type = 'group'`),
]);

export type LibraryPermission = typeof libraryPermissions.$inferSelect;
export type InsertLibraryPermission = typeof libraryPermissions.$inferInsert;

export const libraryIndexJobs = pgTable("library_index_jobs", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  jobType: varchar("job_type", { length: 64 }).notNull(),
  status: libraryIndexJobStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("library_index_jobs_tenant_status_run_at_idx").on(t.tenantId, t.status, t.runAt),
  index("library_index_jobs_status_retry_idx").on(t.status, t.nextRetryAt),
  index("library_index_jobs_item_status_idx").on(t.libraryItemId, t.status),
]);

export type LibraryIndexJob = typeof libraryIndexJobs.$inferSelect;
export type InsertLibraryIndexJob = typeof libraryIndexJobs.$inferInsert;

// ============================================================
// Presentation Editing Tables
// ============================================================

// Audio track shapes stored in JSON columns.
// Zod validation is in shared/presentation/contracts.ts (Section 02).
export type SlideAudioTrackJson = {
  libraryItemId: number;
  volume: number;       // 0.0 – 1.0
  startAtMs: number;    // default 0
  endAtMs: number | null; // null = play to natural end
};

export type DeckAudioTrackJson = {
  libraryItemId: number;
  volume: number;       // 0.0 – 1.0
  startAtMs?: number;   // default 0
  endAtMs?: number | null; // null = play to natural end
  loop: boolean;
  fadeOutMs: number | null;
};

export const presentationDecks = pgTable("presentation_decks", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  slideCount: integer("slide_count").notNull().default(0),
  totalAssetBytes: integer("total_asset_bytes").notNull().default(0),
  projectAudioTrack: json("project_audio_track").$type<DeckAudioTrackJson | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("presentation_decks_library_item_unique").on(t.libraryItemId),
  uniqueIndex("presentation_decks_id_tenant_unique").on(t.id, t.tenantId),
  index("presentation_decks_tenant_idx").on(t.tenantId),
  index("presentation_decks_tenant_updated_idx").on(t.tenantId, t.updatedAt),
]);

export type PresentationDeck = typeof presentationDecks.$inferSelect;
export type InsertPresentationDeck = typeof presentationDecks.$inferInsert;

export const presentationSlides = pgTable("presentation_slides", {
  id: serial("id").primaryKey(),
  deckId: integer("deck_id").notNull().references(() => presentationDecks.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
  version: integer("version").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull().default("Slide"),
  slideContent: json("slide_content").$type<Record<string, any>>().notNull().default({}),
  audioTrack: json("audio_track").$type<SlideAudioTrackJson | null>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("presentation_slides_deck_order_unique").on(t.deckId, t.orderIndex),
  uniqueIndex("presentation_slides_deck_id_unique").on(t.deckId, t.id),
  index("presentation_slides_deck_idx").on(t.deckId),
  index("presentation_slides_deck_updated_idx").on(t.deckId, t.updatedAt),
]);

export type PresentationSlide = typeof presentationSlides.$inferSelect;
export type InsertPresentationSlide = typeof presentationSlides.$inferInsert;

export const presentationAssetLinks = pgTable("presentation_asset_links", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  deckId: integer("deck_id").notNull().references(() => presentationDecks.id, { onDelete: "cascade" }),
  slideId: integer("slide_id").references(() => presentationSlides.id, { onDelete: "set null" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  byteSize: integer("byte_size").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("presentation_asset_links_unique").on(t.deckId, t.slideId, t.libraryItemId),
  index("presentation_asset_links_deck_idx").on(t.deckId),
  index("presentation_asset_links_slide_idx").on(t.slideId),
  foreignKey({
    name: "presentation_asset_links_deck_tenant_fk",
    columns: [t.deckId, t.tenantId],
    foreignColumns: [presentationDecks.id, presentationDecks.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    name: "presentation_asset_links_library_item_tenant_fk",
    columns: [t.libraryItemId, t.tenantId],
    foreignColumns: [libraryItems.id, libraryItems.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    name: "presentation_asset_links_slide_deck_fk",
    columns: [t.deckId, t.slideId],
    foreignColumns: [presentationSlides.deckId, presentationSlides.id],
  }),
]);

export type PresentationAssetLink = typeof presentationAssetLinks.$inferSelect;
export type InsertPresentationAssetLink = typeof presentationAssetLinks.$inferInsert;

export const presentationSourceAttachments = pgTable("presentation_source_attachments", {
  id: serial("id").primaryKey(),
  deckId: integer("deck_id").notNull().references(() => presentationDecks.id, { onDelete: "cascade" }),
  sourceLibraryItemId: integer("source_library_item_id").references(() => libraryItems.id, { onDelete: "set null" }),
  sourceFormat: varchar("source_format", { length: 16 }).notNull(),
  conversionStatus: varchar("conversion_status", { length: 32 }).notNull().default("pending"),
  partialFidelity: boolean("partial_fidelity").notNull().default(false),
  fidelityWarnings: json("fidelity_warnings").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("presentation_source_attachments_deck_unique").on(t.deckId),
  index("presentation_source_attachments_source_item_idx").on(t.sourceLibraryItemId),
]);

export type PresentationSourceAttachment = typeof presentationSourceAttachments.$inferSelect;
export type InsertPresentationSourceAttachment = typeof presentationSourceAttachments.$inferInsert;

export const presentationConversionRecords = pgTable("presentation_conversion_records", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Nullable: no source library item for Google Slides imports
  sourceItemId: integer("source_item_id").references(() => libraryItems.id, { onDelete: "cascade" }),

  sourceFormat: varchar("source_format", { length: 16 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),

  // Nullable: set by callback handler after deck creation completes
  deckLibraryItemId: integer("deck_library_item_id").references(() => libraryItems.id, { onDelete: "cascade" }),

  // Nullable: set by callback handler after deck creation completes
  deckId: integer("deck_id").references(() => presentationDecks.id, { onDelete: "cascade" }),

  // job lifecycle tracking
  status: varchar("status", { length: 16 }).notNull().default("queued"),
  // Values: "queued" | "processing" | "done" | "failed" | "cancelled"

  progress: integer("progress").notNull().default(0),
  // Values: 0–100

  // required so the callback handler can construct a PresentationActor
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // stores Google Slides URL when sourceFormat is "google_slides"
  slidesUrl: varchar("slides_url", { length: 2048 }),

  partialFidelity: boolean("partial_fidelity").notNull().default(false),
  fidelityWarnings: json("fidelity_warnings").$type<string[]>().notNull().default([]),

  // Nullable: set by callback handler when job fails (surfaces failure reason to frontend)
  error: text("error"),

  /** Associated sandbox job ID (if conversion ran in sandbox) */
  sandboxJobId: varchar("sandbox_job_id", { length: 36 }),

  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Partial unique index: restricts uniqueness only for PPTX imports that have a real sourceItemId.
  // PostgreSQL allows multiple NULLs in a unique index, so a plain index on
  // (tenantId, sourceItemId) would permit any number of Google Slides rows
  // (all with sourceItemId=NULL). The partial index restricts uniqueness only
  // for PPTX imports that have a real sourceItemId.
  uniqueIndex("presentation_conversion_records_source_unique")
    .on(t.tenantId, t.sourceItemId)
    .where(sql`${t.sourceItemId} IS NOT NULL`),

  // Idempotency lookup index
  index("presentation_conversion_records_idempotency_idx").on(t.tenantId, t.sourceItemId, t.idempotencyKey),

  index("presentation_conversion_records_expires_at_idx").on(t.expiresAt),

  // lookup by userId for ownership queries
  index("presentation_conversion_records_user_idx").on(t.userId),
]);

export type PresentationConversionRecord = typeof presentationConversionRecords.$inferSelect;
export type InsertPresentationConversionRecord = typeof presentationConversionRecords.$inferInsert;

export const presentationConversionLocks = pgTable("presentation_conversion_locks", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  sourceItemId: integer("source_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  lockToken: varchar("lock_token", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("presentation_conversion_locks_source_unique").on(t.tenantId, t.sourceItemId),
  index("presentation_conversion_locks_expires_at_idx").on(t.expiresAt),
]);

export type PresentationConversionLock = typeof presentationConversionLocks.$inferSelect;
export type InsertPresentationConversionLock = typeof presentationConversionLocks.$inferInsert;

// ============================================================
// Presentation Export Jobs
// ============================================================

export const presentationExports = pgTable("presentation_exports", {
  id: serial("id").primaryKey(),

  // FK to deck — cascade delete (export history gone when deck is deleted)
  deckId: integer("deck_id")
    .notNull()
    .references(() => presentationDecks.id, { onDelete: "cascade" }),

  // FK to user — set null (preserve export audit trail if user is deleted)
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),

  tenantId: varchar("tenant_id", { length: 36 }).notNull(),

  // Export parameters
  format: varchar("format", { length: 16 }).notNull(),         // png | jpg | pdf | mp4
  quality: varchar("quality", { length: 12 }),                 // draft | standard | high
  width: integer("width").notNull().default(1920),
  height: integer("height").notNull().default(1080),
  fps: integer("fps"),                                         // MP4 only; default 30 in Python task

  // Job lifecycle
  status: varchar("status", { length: 16 }).notNull().default("queued"),
  // queued | processing | done | error | cancelled
  progressPct: integer("progress_pct").notNull().default(0),   // 0 – 100
  stage: varchar("stage", { length: 64 }),                     // e.g. "rendering", "encoding", "uploading"
  errorMessage: text("error_message"),

  // Output
  outputUrl: text("output_url"),                               // 24-hour presigned S3/R2 download URL
  outputStorageKey: text("output_storage_key"),                // raw S3 key; used to re-presign if expired
  outputBytes: bigint("output_bytes", { mode: "number" }),

  // Celery bridge
  celeryTaskId: varchar("celery_task_id", { length: 255 }),

  // Deduplication (unique constraint enforced below)
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("presentation_exports_idempotency_key_unique").on(t.idempotencyKey),
  index("presentation_exports_deck_idx").on(t.deckId),
  index("presentation_exports_user_idx").on(t.userId),
  index("presentation_exports_tenant_idx").on(t.tenantId),
  index("presentation_exports_celery_task_idx").on(t.celeryTaskId),
  index("presentation_exports_tenant_status_idx").on(t.tenantId, t.status),
]);

export type PresentationExport = typeof presentationExports.$inferSelect;
export type InsertPresentationExport = typeof presentationExports.$inferInsert;

// ============================================================
// Google Drive Integration Tables
// ============================================================

/**
 * Stores per-user Google Drive sync configuration and webhook channel tracking.
 * One row per user per tenant.
 */
export const googleDriveSyncState = pgTable("google_drive_sync_state", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  indexingMode: indexingModeEnum("indexing_mode").notNull().default("none"),
  folderSelections: jsonb("folder_selections").$type<string[]>().default([]),
  fileTypeFilter: jsonb("file_type_filter").$type<string[]>().default([]),
  maxFileSizeBytes: integer("max_file_size_bytes").default(52428800),
  channelId: varchar("channel_id", { length: 128 }),
  resourceId: varchar("resource_id", { length: 128 }),
  channelTokenHash: varchar("channel_token_hash", { length: 128 }),
  channelExpiry: timestamp("channel_expiry", { withTimezone: true }),
  pageToken: text("page_token"),
  filesTotal: integer("files_total").default(0),
  filesProcessed: integer("files_processed").default(0),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  autoSyncEnabled: boolean("auto_sync_enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("gdrive_sync_tenant_user_unique").on(t.tenantId, t.userId),
  index("gdrive_sync_channel_id_idx").on(t.channelId),
]);

export type GoogleDriveSyncState = typeof googleDriveSyncState.$inferSelect;
export type InsertGoogleDriveSyncState = typeof googleDriveSyncState.$inferInsert;

/**
 * Tracks active editing sessions where a library file has been uploaded
 * to Google Drive for editing in Google Docs/Sheets.
 */
export const googleDriveEditSessions = pgTable("google_drive_edit_sessions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  driveFileId: varchar("drive_file_id", { length: 128 }).notNull(),
  editUrl: text("edit_url").notNull(),
  originalSourceUrl: text("original_source_url"),
  status: editSessionStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("gdrive_edit_tenant_user_status_idx").on(t.tenantId, t.userId, t.status),
  index("gdrive_edit_library_item_idx").on(t.libraryItemId),
  index("gdrive_edit_expires_at_idx").on(t.expiresAt),
]);

export type GoogleDriveEditSession = typeof googleDriveEditSessions.$inferSelect;
export type InsertGoogleDriveEditSession = typeof googleDriveEditSessions.$inferInsert;

// ============================================================
// OneDrive (Microsoft Graph) Integration Tables
// ============================================================

/**
 * Stores per-user OneDrive sync configuration and subscription tracking.
 * One row per user per tenant. Mirrors google_drive_sync_state but uses
 * Microsoft Graph delta queries + subscriptions instead of Google's
 * Changes API + webhook channels.
 */
export const onedriveSyncState = pgTable("onedrive_sync_state", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  indexingMode: indexingModeEnum("indexing_mode").notNull().default("none"),
  folderSelections: jsonb("folder_selections").$type<string[]>().default([]),
  fileTypeFilter: jsonb("file_type_filter").$type<string[]>().default([]),
  maxFileSizeBytes: integer("max_file_size_bytes").default(52428800),
  deltaLink: text("delta_link"),
  subscriptionId: varchar("subscription_id", { length: 128 }),
  subscriptionExpiry: timestamp("subscription_expiry", { withTimezone: true }),
  filesTotal: integer("files_total").default(0),
  filesProcessed: integer("files_processed").default(0),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  autoSyncEnabled: boolean("auto_sync_enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("onedrive_sync_tenant_user_unique").on(t.tenantId, t.userId),
  index("onedrive_sync_subscription_id_idx").on(t.subscriptionId),
]);

export type OnedriveSyncState = typeof onedriveSyncState.$inferSelect;
export type InsertOnedriveSyncState = typeof onedriveSyncState.$inferInsert;

/**
 * Tracks active editing sessions where a library file has been uploaded
 * to OneDrive for editing in Office Online (Word/Excel/PowerPoint).
 */
export const onedriveEditSessions = pgTable("onedrive_edit_sessions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  driveItemId: varchar("drive_item_id", { length: 256 }).notNull(),
  editUrl: text("edit_url").notNull(),
  originalSourceUrl: text("original_source_url"),
  status: editSessionStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("onedrive_edit_tenant_user_status_idx").on(t.tenantId, t.userId, t.status),
  index("onedrive_edit_library_item_idx").on(t.libraryItemId),
  index("onedrive_edit_expires_at_idx").on(t.expiresAt),
]);

export type OnedriveEditSession = typeof onedriveEditSessions.$inferSelect;
export type InsertOnedriveEditSession = typeof onedriveEditSessions.$inferInsert;

/**
 * Per-user monthly credit budget limits.
 * Applies to ALL credit-consuming operations system-wide.
 */
export const userCreditBudgets = pgTable("user_credit_budgets", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  monthlyLimit: integer("monthly_limit").notNull(),
  creditsUsedThisMonth: integer("credits_used_this_month").notNull().default(0),
  budgetMonthKey: varchar("budget_month_key", { length: 7 }).notNull(),
  alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
  alertSent: boolean("alert_sent").notNull().default(false),
  hardCapReached: boolean("hard_cap_reached").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_credit_budgets_tenant_user_unique").on(t.tenantId, t.userId),
]);

export type UserCreditBudget = typeof userCreditBudgets.$inferSelect;
export type InsertUserCreditBudget = typeof userCreditBudgets.$inferInsert;

/**
 * Skill Category Enum
 * Categorizes skills for filtering and organization
 */
export const skillCategoryEnum = pgEnum("skill_category", [
  "image_generation",      // Generate Images
  "image_prompt_generation", // Create prompts for image generation
  "video_generation",      // Generate Video
  "video_prompt_generation", // Create prompts for video generation
  "image_video_generation", // Generate both Image and Video
  "audio_generation",      // Generate Text To Speech
  "article_generation",    // Generate source articles / presentation drafts
  "sound_effects",         // Generate Sound Effects
  "prompt_enhancement",    // Enhance prompts
  "code_assistant",        // Code help
  "document_analysis",     // Document processing
  "web_search",            // Web search
  "data_analysis",         // Data analysis
  "translation",           // Translation
  "summarization",         // Summarization
  "chat_assistant",        // General chat
  "automation",            // Workflow automation
  "other",                 // Other
]);

/**
 * Skill Repositories - External Git repos containing skill collections
 * Admin can add repos, fetch/upgrade skills from them
 */
export const skillRepositories = pgTable("skill_repositories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  gitUrl: varchar("git_url", { length: 500 }).notNull(),
  branch: varchar("branch", { length: 100 }).default("main"),
  formatType: varchar("format_type", { length: 50 }).default("auto"),
  skillsSubdir: varchar("skills_subdir", { length: 200 }).default("skills"),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  lastCommitHash: varchar("last_commit_hash", { length: 64 }),
  skillCount: integer("skill_count").default(0),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export type SkillRepository = typeof skillRepositories.$inferSelect;
export type InsertSkillRepository = typeof skillRepositories.$inferInsert;

/**
 * Skills - Centralized skill registry for Claude/OpenCode compatibility
 * Each skill maps to a folder structure: skills/<skill_slug>/
 * Contains skill.md, python/, js/, tests/ directories
 */
export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),

  /** Unique identifier/slug (folder name, e.g., "create-image-prompt") */
  slug: varchar("slug", { length: 100 }).notNull().unique(),

  /** Display name */
  name: varchar("name", { length: 255 }).notNull(),

  /** Detailed description */
  description: text("description"),

  /** Skill category for filtering */
  category: skillCategoryEnum("category").notNull().default("other"),

  /** Version string (semantic versioning) */
  version: varchar("version", { length: 20 }).default("1.0.0"),

  /** Author name or email */
  author: varchar("author", { length: 255 }),

  /** Icon identifier (lucide icon name) */
  icon: varchar("icon", { length: 50 }).default("sparkles"),

  /** Tags for additional filtering (JSON array) */
  tags: json("tags").$type<string[]>().default([]),

  /** Folder path relative to skills/ directory */
  folderPath: varchar("folderPath", { length: 512 }),

  /** Whether skill can auto-trigger on intent detection */
  isAutoTrigger: boolean("isAutoTrigger").default(false).notNull(),

  /** Regex patterns for auto-detection
   * Supports two formats:
   * 1. Legacy: string[] - array of pattern strings
   * 2. New: PatternRule[] - array of objects with pattern, chainTo, label
   * Both can be mixed in the same array for backward compatibility
   */
  triggerPatterns: json("triggerPatterns").$type<Array<string | {
    pattern: string;
    chainTo?: string | null;
    label?: string;
  }>>().default([]),

  /** Whether skill is enabled globally */
  isEnabled: boolean("isEnabled").default(true).notNull(),

  /** Whether skill is enabled by default for new conversations */
  enabledByDefault: boolean("enabledByDefault").default(true).notNull(),

  /** Whether skill is visible by default for new users (admin-controlled) */
  visibleByDefault: boolean("visibleByDefault").default(true).notNull(),

  /** Credit cost multiplier (1.0 = standard rate) */
  creditMultiplier: numeric("creditMultiplier", { precision: 5, scale: 2 }).default("1.0"),

  /** Priority for detection (higher = checked first) */
  priority: integer("priority").default(50).notNull(),

  /** Available models for this skill (if media-related) */
  availableModels: json("availableModels").$type<string[]>(),

  /** Default model for this skill */
  defaultModel: varchar("defaultModel", { length: 128 }),

  /** Canonical routed LLM model id for text-generation skills */
  llmModelId: varchar("llmModelId", { length: 128 }),

  /** Preferred provider pin for this skill (optional) */
  preferredProviderId: integer("preferredProviderId").references(() => llmProviders.id),

  /** Enforce provider pin without fallback when true */
  strictProviderPin: boolean("strictProviderPin").default(false).notNull(),

  /** Execution mode: llm-only (text response), media-generate (LLM→prompt→media API) */
  executionMode: varchar("executionMode", { length: 50 }).default("llm-only").notNull(),

  /** Chain to another skill after this skill completes (skill slug) */
  chainTo: varchar("chainTo", { length: 100 }),

  /** System prompt override (optional) */
  systemPrompt: text("systemPrompt"),

  /** Skill content/instructions from skill.md (cached) */
  skillContent: text("skillContent"),

  /** Public-facing marketplace documentation (curated, safe to display) */
  marketplaceContent: text("marketplaceContent"),

  /** Knowledgebase content (for imported Custom GPTs) */
  knowledgebase: text("knowledgebase"),

  /** Additional configuration */
  configJson: json("configJson").$type<{
    requiresExplicit?: boolean;
    maxInputLength?: number;
    maxOutputLength?: number;
    supportedLanguages?: string[];
    pythonEntry?: string;  // python/tool.py
    jsEntry?: string;      // js/index.js
    [key: string]: any;
  }>(),

  /** Import source (manual, folder, zip, custom-gpt) */
  importSource: varchar("importSource", { length: 50 }).default("manual"),

  /** Original ZIP file path (if imported from ZIP) */
  importedFromZip: varchar("importedFromZip", { length: 512 }),

  /** Repository that this skill was fetched from */
  repositoryId: integer("repositoryId").references(() => skillRepositories.id),

  /** Original folder name in the repository (e.g. "react-developer") */
  repositorySlug: varchar("repositorySlug", { length: 200 }),

  /** MD5 hash of skill.md content for sync/upgrade detection */
  contentHash: varchar("contentHash", { length: 64 }),

  /** User who created/imported this skill */
  createdBy: integer("createdBy").references(() => users.id),

  /** Tenant that owns this skill */
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),

  /** Skill visibility: private, pending_approval, public, rejected */
  visibility: skillVisibilityEnum("visibility").default("private").notNull(),

  /** Admin who approved the skill for public visibility */
  approvedBy: integer("approvedBy").references(() => users.id),

  /** When the skill was approved */
  approvedAt: timestamp("approvedAt", { withTimezone: true }),

  /** Reason for rejection (if visibility = 'rejected') */
  rejectionReason: text("rejectionReason"),

  /** When an admin set this skill to pending_approval (for admin review queue ordering) */
  requestedPublishAt: timestamp("requestedPublishAt", { withTimezone: true }),

  /** Sandbox profile slug for skills that require sandbox execution */
  sandboxProfileSlug: varchar("sandboxProfileSlug", { length: 64 }),
  /** Whether this skill needs network access in sandbox */
  requiresNetwork: boolean("requiresNetwork"),
  /** Whether this skill needs browser automation in sandbox */
  requiresBrowser: boolean("requiresBrowser"),
  /** Maximum runtime for this skill in seconds (overrides profile default) */
  maxRuntimeSeconds: integer("maxRuntimeSeconds"),
  /** Maximum input file size in MB (overrides profile default) */
  maxInputMb: integer("maxInputMb"),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type Skill = typeof skills.$inferSelect;
export type InsertSkill = typeof skills.$inferInsert;

/**
 * Skill Permissions — controls which groups can use a private skill
 * Simplified model: only group-based access (no per-user or role subjects)
 */
export const skillPermissions = pgTable("skill_permissions", {
  id: serial("id").primaryKey(),
  skillId: integer("skillId").notNull().references(() => skills.id, { onDelete: "cascade" }),
  groupId: integer("groupId").notNull().references(() => userGroups.id, { onDelete: "cascade" }),
  grantedByUserId: integer("grantedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("skill_permissions_unique").on(t.skillId, t.groupId),
  index("skill_permissions_group_idx").on(t.groupId),
]);

export type SkillPermission = typeof skillPermissions.$inferSelect;
export type InsertSkillPermission = typeof skillPermissions.$inferInsert;

/**
 * Skill Likes — per-user like tracking for marketplace
 */
export const skillLikes = pgTable("skill_likes", {
  id: serial("id").primaryKey(),
  skillId: integer("skillId").notNull().references(() => skills.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("skill_likes_unique").on(t.skillId, t.userId),
]);

export type SkillLike = typeof skillLikes.$inferSelect;

/**
 * Skill Comments — flat comments for marketplace skill pages
 */
export const skillComments = pgTable("skill_comments", {
  id: serial("id").primaryKey(),
  skillId: integer("skillId").notNull().references(() => skills.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type SkillComment = typeof skillComments.$inferSelect;

/**
 * User Skill Visibility — per-user skill visibility preferences
 * Controls which skills appear in a user's chat panel and slash commands
 */
export const userSkillVisibility = pgTable("user_skill_visibility", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillId: integer("skillId").notNull().references(() => skills.id, { onDelete: "cascade" }),
  visible: boolean("visible").default(true).notNull(),
  autoTriggerEnabled: boolean("autoTriggerEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_skill_visibility_unique").on(t.userId, t.skillId),
]);

export type UserSkillVisibility = typeof userSkillVisibility.$inferSelect;
export type InsertUserSkillVisibility = typeof userSkillVisibility.$inferInsert;

/**
 * Storage Provider Type Enum
 * Defines the type of object storage provider
 */
export const storageProviderTypeEnum = pgEnum("storage_provider_type", ["r2", "s3", "local"]);

/**
 * Storage Settings - Configuration for S3-compatible object storage (R2, S3, etc.)
 * Used for storing reference images, generated media, and other files
 * that need to be publicly accessible (e.g., for Kie.ai to download reference images)
 */
export const storageSettings = pgTable("storage_settings", {
  id: serial("id").primaryKey(),

  /** Setting name/identifier (e.g., "primary", "backup", "development") */
  name: varchar("name", { length: 64 }).notNull().unique(),

  /** Display name for UI */
  displayName: varchar("displayName", { length: 128 }).notNull(),

  /** Description of this storage configuration */
  description: text("description"),

  /** Storage provider type */
  providerType: storageProviderTypeEnum("providerType").notNull().default("r2"),

  /** S3 Endpoint URL (e.g., https://xxx.r2.cloudflarestorage.com) */
  endpoint: varchar("endpoint", { length: 512 }),

  /** S3 Region (e.g., auto for R2, us-east-1 for S3) */
  region: varchar("region", { length: 64 }).default("auto"),

  /** Bucket name */
  bucket: varchar("bucket", { length: 128 }),

  /** Access Key ID (encrypted) */
  accessKeyIdEncrypted: text("accessKeyIdEncrypted"),

  /** Secret Access Key (encrypted) */
  secretAccessKeyEncrypted: text("secretAccessKeyEncrypted"),

  /** Whether credentials are configured */
  hasCredentials: boolean("hasCredentials").default(false).notNull(),

  /** Public URL prefix for serving files (e.g., https://cdn.example.com or R2 public URL) */
  publicUrlPrefix: varchar("publicUrlPrefix", { length: 512 }),

  /** Development Tunnel URL (e.g., cloudflared tunnel URL for local development) */
  devTunnelUrl: varchar("devTunnelUrl", { length: 512 }),

  /** Path prefix for uploaded files (e.g., "uploads/" or "media/") */
  pathPrefix: varchar("pathPrefix", { length: 128 }).default("uploads/"),

  /** Whether this is the active/primary storage */
  isActive: boolean("isActive").default(false).notNull(),

  /** Additional configuration */
  configJson: json("configJson").$type<{
    /** Whether to use path-style URLs (required for some S3-compatible services) */
    forcePathStyle?: boolean;
    /** Custom headers for requests */
    customHeaders?: Record<string, string>;
    /** Lifecycle rules (e.g., auto-delete after X days) */
    lifecycleDays?: number;
    /** Max file size in MB */
    maxFileSizeMb?: number;
    /** Allowed MIME types */
    allowedMimeTypes?: string[];
    [key: string]: any;
  }>(),

  /** Last successful connection test */
  lastTestedAt: timestamp("lastTestedAt", { withTimezone: true }),

  /** Last test result */
  lastTestResult: json("lastTestResult").$type<{
    success: boolean;
    message: string;
    latencyMs?: number;
  }>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type StorageSettings = typeof storageSettings.$inferSelect;
export type InsertStorageSettings = typeof storageSettings.$inferInsert;

// ============================================================
// System Settings - Platform-wide configuration
// ============================================================

/**
 * System Settings - Stores platform-wide configuration
 * Used for Stripe settings, Invoice settings, etc.
 */
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),

  /** Setting category (stripe, invoice, email, etc.) */
  category: varchar("category", { length: 64 }).notNull(),

  /** Setting key within the category */
  key: varchar("key", { length: 128 }).notNull(),

  /** Setting value (JSON for complex values, string for simple) */
  value: text("value"),

  /** JSON value for complex settings */
  valueJson: json("valueJson").$type<Record<string, any>>(),

  /** Is this setting sensitive (should be masked in UI) */
  isSensitive: boolean("isSensitive").default(false),

  /** Description of this setting */
  description: text("description"),

  /** Last updated by user ID */
  updatedBy: integer("updatedBy"),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type SystemSettings = typeof systemSettings.$inferSelect;
export type InsertSystemSettings = typeof systemSettings.$inferInsert;

// ============================================================
// Invoice Configuration - Per-tenant or global invoice settings
// ============================================================

/**
 * Invoice Configuration - Customizable invoice headers
 * Supports both global defaults and per-tenant (White Label) customization
 */
export const invoiceConfig = pgTable("invoice_config", {
  id: serial("id").primaryKey(),

  /** Tenant ID (null for global default) */
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),

  /** Company name on invoice */
  companyName: varchar("companyName", { length: 256 }),

  /** Company address lines */
  addressLine1: varchar("addressLine1", { length: 256 }),
  addressLine2: varchar("addressLine2", { length: 256 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 128 }),
  postalCode: varchar("postalCode", { length: 32 }),
  country: varchar("country", { length: 128 }),

  /** Tax ID / VAT number */
  taxId: varchar("taxId", { length: 64 }),

  /** Company email */
  email: varchar("email", { length: 256 }),

  /** Company phone */
  phone: varchar("phone", { length: 64 }),

  /** Company website */
  website: varchar("website", { length: 256 }),

  /** Logo URL for invoice header */
  logoUrl: varchar("logoUrl", { length: 512 }),

  /** Invoice footer text */
  footerText: text("footerText"),

  /** Invoice terms and conditions */
  termsText: text("termsText"),

  /** Bank details for wire transfer */
  bankDetails: json("bankDetails").$type<{
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    routingNumber?: string;
    swiftCode?: string;
    iban?: string;
  }>(),

  /** Additional custom fields */
  customFields: json("customFields").$type<Array<{
    label: string;
    value: string;
  }>>(),

  /** Is this config active */
  isActive: boolean("isActive").default(true),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type InvoiceConfig = typeof invoiceConfig.$inferSelect;
export type InsertInvoiceConfig = typeof invoiceConfig.$inferInsert;

/**
 * Blog Posts - Multi-tenant blog system
 * Each tenant has its own blog posts with full CRUD support
 */
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),

  /** Tenant this post belongs to */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** URL-friendly slug */
  slug: varchar("slug", { length: 255 }).notNull(),

  /** Post title */
  title: varchar("title", { length: 500 }).notNull(),

  /** Short excerpt/summary */
  excerpt: text("excerpt"),

  /** Full post content (HTML) */
  content: text("content"),

  /** Cover image URL */
  coverImage: varchar("coverImage", { length: 1024 }),

  /** Author name */
  author: varchar("author", { length: 255 }),

  /** Author avatar URL */
  authorAvatar: varchar("authorAvatar", { length: 1024 }),

  /** Category */
  category: varchar("category", { length: 100 }),

  /** Tags (JSON array) */
  tags: json("tags").$type<string[]>(),

  /** Estimated read time e.g. "5 min read" */
  readTime: varchar("readTime", { length: 50 }),

  /** Whether post is published */
  isPublished: boolean("isPublished").default(false).notNull(),

  /** Whether post is featured */
  isFeatured: boolean("isFeatured").default(false).notNull(),

  /** SEO metadata */
  metaDescription: text("metaDescription"),
  metaKeywords: varchar("metaKeywords", { length: 500 }),

  /** Publish date (can be set to future for scheduling) */
  publishedAt: timestamp("publishedAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

// ============================================================
// Chat Alert — Scheduled Messages System
// ============================================================

export const scheduleStatusEnum = pgEnum("schedule_status", ["active", "paused", "completed", "failed"]);
export const notificationTypeEnum = pgEnum("notification_type", ["scheduled_message", "follow_request", "alert", "system"]);
export const reminderPriorityEnum = pgEnum("reminder_priority", ["low", "normal", "high", "critical"]);
export const followStatusEnum = pgEnum("follow_status", ["active", "blocked"]);

/**
 * Scheduled Messages — recurring or one-time scheduled chat prompts
 */
export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),

  /** Owner who created the schedule */
  userId: integer("userId").references(() => users.id, { onDelete: "cascade" }).notNull(),

  /** Conversation to post into (null = create new) */
  conversationId: integer("conversationId").references(() => conversations.id, { onDelete: "set null" }),

  /** Target user to send to (null = self) */
  targetUserId: integer("targetUserId").references(() => users.id, { onDelete: "cascade" }),

  /** The prompt to send to the LLM */
  prompt: text("prompt").notNull(),

  /** Cron expression for recurring (e.g. "0 8 * * *") */
  cronExpression: varchar("cronExpression", { length: 100 }),

  /** User's timezone (e.g. "Asia/Bangkok") */
  timezone: varchar("timezone", { length: 64 }).default("Asia/Bangkok").notNull(),

  /** For one-time schedules */
  scheduledAt: timestamp("scheduledAt", { withTimezone: true }),

  /** Recurring or one-time */
  isRecurring: boolean("isRecurring").default(false).notNull(),

  /** Current status */
  status: scheduleStatusEnum("status").default("active").notNull(),

  /** LLM model to use */
  modelId: varchar("modelId", { length: 128 }),

  /** Dynamic parameters required to execute the assigned skill */
  dynamicParams: json("dynamicParams").$type<Record<string, any>>(),

  /** Associated skill */
  skillId: varchar("skillId", { length: 100 }).default("chat-alert"),

  /** Simple reminder — skip LLM, just show prompt as-is (0 credits) */
  isSimpleReminder: boolean("isSimpleReminder").default(false).notNull(),

  /** Priority level — critical shows full-screen modal */
  priority: reminderPriorityEnum("priority").default("normal").notNull(),

  /** Send email notification on execution */
  emailNotify: boolean("emailNotify").default(true).notNull(),

  /** Human-readable description of the schedule */
  description: text("description"),

  /** Last execution time */
  lastRunAt: timestamp("lastRunAt", { withTimezone: true }),

  /** Next planned execution */
  nextRunAt: timestamp("nextRunAt", { withTimezone: true }),

  /** BullMQ job ID for cancellation */
  bullmqJobId: varchar("bullmqJobId", { length: 255 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("scheduled_messages_user_status").on(t.userId, t.status),
  index("scheduled_messages_user_created").on(t.userId, t.createdAt),
  index("scheduled_messages_status").on(t.status),
]);

export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = typeof scheduledMessages.$inferInsert;

/**
 * Scheduled Message Logs — execution history
 */
export const scheduledMessageLogs = pgTable("scheduled_message_logs", {
  id: serial("id").primaryKey(),

  scheduledMessageId: integer("scheduledMessageId")
    .references(() => scheduledMessages.id, { onDelete: "cascade" })
    .notNull(),

  executedAt: timestamp("executedAt", { withTimezone: true }).defaultNow().notNull(),

  /** LLM response content */
  responseContent: text("responseContent"),

  /** Credits consumed */
  creditsUsed: numeric("creditsUsed", { precision: 10, scale: 4 }).default("0"),

  /** Success or failure */
  status: varchar("status", { length: 20 }).default("success").notNull(),

  /** Error message if failed */
  error: text("error"),
}, (t) => [
  index("scheduled_message_logs_schedule_id").on(t.scheduledMessageId, t.executedAt),
]);

export type ScheduledMessageLog = typeof scheduledMessageLogs.$inferSelect;
export type InsertScheduledMessageLog = typeof scheduledMessageLogs.$inferInsert;

/**
 * User Follows — follow relationships between users
 */
export const userFollows = pgTable("user_follows", {
  id: serial("id").primaryKey(),

  followerId: integer("followerId").references(() => users.id, { onDelete: "cascade" }).notNull(),
  followingId: integer("followingId").references(() => users.id, { onDelete: "cascade" }).notNull(),

  status: followStatusEnum("status").default("active").notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type UserFollow = typeof userFollows.$inferSelect;
export type InsertUserFollow = typeof userFollows.$inferInsert;

/**
 * User Notifications — in-app notification center
 */
export const userNotifications = pgTable("user_notifications", {
  id: serial("id").primaryKey(),

  userId: integer("userId").references(() => users.id, { onDelete: "cascade" }).notNull(),

  type: notificationTypeEnum("type").notNull(),

  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),

  /** Link to related conversation */
  conversationId: integer("conversationId").references(() => conversations.id, { onDelete: "set null" }),

  /** Link to related schedule */
  scheduledMessageId: integer("scheduledMessageId").references(() => scheduledMessages.id, { onDelete: "set null" }),

  /** Priority — high/critical triggers full-screen modal */
  priority: reminderPriorityEnum("priority").default("normal").notNull(),

  isRead: boolean("isRead").default(false).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("user_notifications_user_read").on(t.userId, t.isRead, t.createdAt),
  index("user_notifications_user_priority").on(t.userId, t.isRead, t.priority),
]);

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

/**
 * Direct Messages — user-to-user messaging
 * Follow: max 10 messages, Friend (mutual follow): unlimited
 */
export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),

  senderId: integer("senderId").references(() => users.id, { onDelete: "cascade" }).notNull(),
  receiverId: integer("receiverId").references(() => users.id, { onDelete: "cascade" }).notNull(),

  content: text("content").notNull(),

  /** Urgent messages show as pop-up alerts */
  isUrgent: boolean("isUrgent").default(false).notNull(),

  isRead: boolean("isRead").default(false).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = typeof directMessages.$inferInsert;

// ==================== Account Security ====================

/** Logs every registration attempt for duplicate detection */
export const registrationEvents = pgTable("registration_events", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id),
  email: varchar("email", { length: 320 }).notNull(),
  normalizedEmail: varchar("normalizedEmail", { length: 320 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
  fingerprintHash: varchar("fingerprintHash", { length: 64 }),
  userAgent: text("userAgent"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  trustScore: integer("trustScore"),
  outcome: varchar("outcome", { length: 20 }).notNull(), // allowed, flagged, blocked
  metadata: json("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("registration_events_created_user_idx").on(t.createdAt, t.userId),
]);

/** Links browser fingerprint hashes to users */
export const deviceFingerprints = pgTable("device_fingerprints", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fingerprintHash: varchar("fingerprintHash", { length: 64 }).notNull(),
  firstSeenAt: timestamp("firstSeenAt", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }).defaultNow().notNull(),
  seenCount: integer("seenCount").default(1).notNull(),
});

/** Admin-managed blocklist for emails, IPs, fingerprints */
export const blockedPatterns = pgTable("blocked_patterns", {
  id: serial("id").primaryKey(),
  patternType: varchar("patternType", { length: 20 }).notNull(), // email_domain, email, ip, fingerprint
  pattern: varchar("pattern", { length: 320 }).notNull(),
  reason: text("reason"),
  createdBy: integer("createdBy").references(() => users.id),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

// Menu config — admin overrides per menu item, platform, and tenant
export const menuConfig = pgTable("menu_config", {
  id: serial("id").primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 50 }).notNull(),
  platform: varchar("platform", { length: 10 }).notNull().default("web"),
  visible: boolean("visible").default(true).notNull(),
  customLabel: varchar("custom_label", { length: 100 }),
  customIcon: varchar("custom_icon", { length: 50 }),
  sortOrder: integer("sort_order"),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("menu_config_unique").on(table.menuItemId, table.platform, table.tenantId),
]);

export type MenuConfig = typeof menuConfig.$inferSelect;
export type InsertMenuConfig = typeof menuConfig.$inferInsert;

// Video Editor Projects — persistent project storage with auto-save
export const videoEditorProjects = pgTable("video_editor_projects", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }).notNull(),
  projectData: json("projectData").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  duration: numeric("duration", { precision: 10, scale: 2 }).default("0"),
  resolution: varchar("resolution", { length: 20 }),
  trackCount: integer("trackCount").default(4),
  clipCount: integer("clipCount").default(0),
  version: varchar("version", { length: 10 }).default("1.0"),
  isAutoSave: boolean("isAutoSave").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("video_editor_projects_user_idx").on(t.userId),
  index("video_editor_projects_updated_idx").on(t.updatedAt),
]);

export type VideoEditorProject = typeof videoEditorProjects.$inferSelect;
export type InsertVideoEditorProject = typeof videoEditorProjects.$inferInsert;

// Email verification tokens for signup flow
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  channel: varchar("channel", { length: 20 }).default("email").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  usedAt: timestamp("usedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Workflows — User's active workflow drafts
 * Separate from templates. Users edit workflows, then optionally save as template.
 */
export const workflows = pgTable("workflows", {
  id: serial("id").primaryKey(),

  /** Workflow name */
  name: varchar("name", { length: 255 }).notNull(),

  /** Workflow description */
  description: text("description"),

  /** Default LLM model to use for this workflow */
  defaultModel: varchar("defaultModel", { length: 255 }),

  /** ReactFlow state: {nodes: [], edges: [], viewport: {}} */
  workflowJson: json("workflowJson").$type<{
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, any>;
      parentId?: string; // For loop groups
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
      type?: string;
    }>;
    viewport?: { x: number; y: number; zoom: number };
  }>().notNull(),

  /** Owner user */
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Tenant for multi-tenant isolation */
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),

  /** Current workflow state */
  status: workflowStatusEnum("status").default("draft").notNull(),

  /** Last compilation timestamp */
  lastCompiledAt: timestamp("lastCompiledAt", { withTimezone: true }),

  /** Schema version for forward compatibility */
  schemaVersion: varchar("schemaVersion", { length: 10 }).default("1.0").notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("workflows_user_idx").on(t.userId),
  index("workflows_tenant_idx").on(t.tenantId),
  index("workflows_status_idx").on(t.status),
]);

export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = typeof workflows.$inferInsert;

/**
 * Workflow Versions — Snapshot history for every saved workflow.
 * Auto-created on every workflow.save (with SHA-256 deduplication).
 * Allows users to preview and restore previous states.
 * Max 50 versions per workflow (oldest pruned automatically).
 */
export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflowId")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    versionNumber: integer("versionNumber").notNull(),
    workflowJson: json("workflowJson")
      .$type<{ nodes: any[]; edges: any[]; viewport?: any }>()
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    defaultModel: varchar("defaultModel", { length: 255 }),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    changeDescription: text("changeDescription"),
    createdByUserId: integer("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("wv_workflow_version_unique").on(t.workflowId, t.versionNumber),
    index("wv_workflow_created_idx").on(t.workflowId, t.createdAt),
    index("wv_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("wv_content_hash_idx").on(t.contentHash),
  ]
);

export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type InsertWorkflowVersion = typeof workflowVersions.$inferInsert;

/**
 * Template Categories — Hierarchical organization
 */
export const templateCategories = pgTable("template_categories", {
  id: serial("id").primaryKey(),

  /** Category name */
  name: varchar("name", { length: 100 }).notNull(),

  /** URL-safe slug */
  slug: varchar("slug", { length: 100 }).notNull().unique(),

  /** Parent category (null for root categories) */
  parentId: integer("parentId").references((): any => templateCategories.id),

  /** Display order */
  sortOrder: integer("sortOrder").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TemplateCategory = typeof templateCategories.$inferSelect;
export type InsertTemplateCategory = typeof templateCategories.$inferInsert;

/**
 * Workflow Templates — Marketplace
 * Public templates visible to all, private templates scoped to tenant
 */
export const workflowTemplates = pgTable("workflow_templates", {
  id: serial("id").primaryKey(),

  /** Template name */
  name: varchar("name", { length: 255 }).notNull(),

  /** Template description */
  description: text("description"),

  /** Validated ReactFlow state (same structure as workflows.workflowJson) */
  workflowJson: json("workflowJson").$type<{
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, any>;
      parentId?: string;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
      type?: string;
    }>;
    viewport?: { x: number; y: number; zoom: number };
  }>().notNull(),

  /** Template author */
  authorId: integer("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Tenant (null for public templates) */
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),

  /** Category */
  categoryId: integer("categoryId").references(() => templateCategories.id, { onDelete: "set null" }),

  /** Tags for filtering */
  tags: json("tags").$type<string[]>().default([]),

  /** Public visibility */
  isPublic: boolean("isPublic").default(false).notNull(),

  /** Featured on marketplace */
  isFeatured: boolean("isFeatured").default(false).notNull(),

  /** Publication status */
  status: templateStatusEnum("status").default("draft").notNull(),

  /** Download counter */
  downloadCount: integer("downloadCount").default(0).notNull(),

  /** Version string */
  version: varchar("version", { length: 20 }).default("1.0").notNull(),

  /** Full-text search vector (auto-generated from name + description) */
  searchVector: text("searchVector"), // tsvector in migration SQL

  // --- Feature 017: Gallery columns ---

  /** Pre-generated SVG topology diagram (generated at seed time by workflowSvgGenerator) */
  previewSvg: text("previewSvg"),

  /** Industry/sector tags for gallery filtering (e.g. ["E-commerce", "Retail"]) */
  industry: json("industry").$type<string[]>(),

  /** Number of nodes in the workflow (computed from workflowJson.nodes.length at seed time) */
  stepCount: integer("stepCount"),

  /** Rough setup effort in minutes (provided in template JSON, displayed in Gallery) */
  estimatedSetupMinutes: integer("estimatedSetupMinutes"),

  /**
   * Stable slug identifier for idempotent upserts (e.g. "tpl-001").
   * Used as the ON CONFLICT target in the seeder script.
   * Must be unique across all templates.
   */
  templateKey: varchar("templateKey", { length: 50 }).unique(),

  /** When the creator requested gallery publishing */
  requestedPublishAt: timestamp("requestedPublishAt", { withTimezone: true }),
  /** Admin who approved/rejected the publish request */
  approvedBy: integer("approvedBy").references(() => users.id, { onDelete: "set null" }),
  /** When admin approved the publish request */
  approvedAt: timestamp("approvedAt", { withTimezone: true }),
  /** Reason for rejection (shown to creator) */
  rejectionReason: text("rejectionReason"),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("workflow_templates_author_idx").on(t.authorId),
  index("workflow_templates_tenant_idx").on(t.tenantId),
  index("workflow_templates_category_idx").on(t.categoryId),
  index("workflow_templates_status_idx").on(t.status),
  // GIN indexes added in migration SQL (can't express in Drizzle directly)
]);

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = typeof workflowTemplates.$inferInsert;

/**
 * Template Ratings — User feedback
 */
export const templateRatings = pgTable("template_ratings", {
  id: serial("id").primaryKey(),

  /** Template being rated */
  templateId: integer("templateId").notNull().references(() => workflowTemplates.id, { onDelete: "cascade" }),

  /** User who rated */
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Rating value (1-5) */
  rating: integer("rating").notNull(),

  /** Optional review text */
  review: text("review"),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("template_ratings_unique").on(t.templateId, t.userId),
  index("template_ratings_template_idx").on(t.templateId),
]);

export type TemplateRating = typeof templateRatings.$inferSelect;
export type InsertTemplateRating = typeof templateRatings.$inferInsert;

/**
 * Workflow Schedules — Cron-based workflow triggers
 */
export const workflowSchedules = pgTable("workflow_schedules", {
  id: serial("id").primaryKey(),

  /** Workflow to execute */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Trigger node ID within the workflow */
  nodeId: varchar("nodeId", { length: 36 }).notNull(),

  /** Cron expression (e.g., "0 9 * * 1" for Monday 9am) */
  cronExpression: varchar("cronExpression", { length: 100 }).notNull(),

  /** IANA timezone (e.g., "Asia/Bangkok", "UTC") */
  timezone: varchar("timezone", { length: 50 }).default("UTC").notNull(),

  /** Last execution timestamp */
  lastRun: timestamp("lastRun", { withTimezone: true }),

  /** Next scheduled execution timestamp */
  nextRun: timestamp("nextRun", { withTimezone: true }).notNull(),

  /** Whether schedule is active */
  isActive: boolean("isActive").default(true).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("workflow_schedules_workflow_idx").on(t.workflowId),
  index("workflow_schedules_next_run_idx").on(t.nextRun),
  index("workflow_schedules_active_idx").on(t.isActive),
]);

export type WorkflowSchedule = typeof workflowSchedules.$inferSelect;
export type InsertWorkflowSchedule = typeof workflowSchedules.$inferInsert;

/**
 * Webhook Calls — Webhook trigger history
 */
export const webhookCalls = pgTable("webhook_calls", {
  id: serial("id").primaryKey(),

  /** Workflow that was triggered */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Webhook trigger node ID */
  nodeId: varchar("nodeId", { length: 36 }).notNull(),

  /** HTTP method used */
  requestMethod: varchar("requestMethod", { length: 10 }),

  /** Request body (JSON) */
  requestBody: json("requestBody").$type<Record<string, any>>(),

  /** Request headers (JSON) */
  requestHeaders: json("requestHeaders").$type<Record<string, any>>(),

  /** Workflow execution ID (if triggered successfully) */
  executionId: varchar("executionId", { length: 36 }),

  /** Trigger status */
  status: varchar("status", { length: 20 }),

  /** Response sent back to caller */
  response: json("response").$type<Record<string, any>>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("webhook_calls_workflow_node_idx").on(t.workflowId, t.nodeId),
  index("webhook_calls_execution_idx").on(t.executionId),
  index("webhook_calls_created_idx").on(t.createdAt),
]);

export type WebhookCall = typeof webhookCalls.$inferSelect;
export type InsertWebhookCall = typeof webhookCalls.$inferInsert;

/**
 * Workflow Event Subscriptions — Event-driven workflow triggers
 */
export const workflowEventSubscriptions = pgTable("workflow_event_subscriptions", {
  id: serial("id").primaryKey(),

  /** Workflow to execute when event occurs */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Event trigger node ID */
  nodeId: varchar("nodeId", { length: 36 }).notNull(),

  /** Event type to listen for (e.g., "user.created", "skill.completed") */
  eventType: varchar("eventType", { length: 100 }).notNull(),

  /** Optional filter conditions (JSON) */
  filterConditions: json("filterConditions").$type<Record<string, any>>(),

  /** Whether subscription is active */
  isActive: boolean("isActive").default(true).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("workflow_event_subscriptions_workflow_idx").on(t.workflowId),
  index("workflow_event_subscriptions_event_type_idx").on(t.eventType),
  index("workflow_event_subscriptions_active_idx").on(t.isActive),
]);

export type WorkflowEventSubscription = typeof workflowEventSubscriptions.$inferSelect;
export type InsertWorkflowEventSubscription = typeof workflowEventSubscriptions.$inferInsert;

/**
 * Workflow Executions — Individual workflow run tracking (Section 13)
 * Each row represents one execution of a workflow (manual, scheduled, webhook, etc.)
 *
 * NOTE: LangGraph checkpoint tables (checkpoints, checkpoint_blobs, checkpoint_writes,
 * checkpoint_migrations) are auto-created by AsyncPostgresSaver.setup() in the Python backend.
 * Those tables are NOT managed by Drizzle. Do not add them here.
 */
export const workflowExecutions = pgTable("workflow_executions", {
  id: serial("id").primaryKey(),

  /** Workflow definition that was executed */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Tenant for multi-tenant isolation */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** User who triggered the execution */
  userId: integer("userId").notNull().references(() => users.id),

  /** Execution status */
  status: workflowExecutionStatusEnum("status").default("pending").notNull(),

  /** Input data provided to the workflow trigger */
  inputData: json("inputData").$type<Record<string, any>>(),

  /** Final output data from the workflow (null if still running or failed) */
  outputData: json("outputData").$type<Record<string, any>>(),

  /** When execution started (null if still pending) */
  startedAt: timestamp("startedAt", { withTimezone: true }),

  /** When execution completed/failed/cancelled */
  completedAt: timestamp("completedAt", { withTimezone: true }),

  /** Error message if execution failed */
  error: text("error"),

  /** Number of nodes executed in this run */
  nodeCount: integer("nodeCount").default(0).notNull(),

  /** Total credits consumed by this execution */
  creditsUsed: integer("creditsUsed").default(0).notNull(),

  /** LangGraph thread ID for checkpoint correlation (format: "{tenantId}:{executionId}") */
  threadId: varchar("threadId", { length: 128 }),

  /** Trigger type that started this execution */
  triggerType: varchar("triggerType", { length: 50 }),

  /** Sandbox job IDs used during this workflow execution */
  sandboxJobIds: jsonb("sandboxJobIds").$type<string[]>().default([]),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("workflow_executions_workflow_idx").on(t.workflowId),
  index("workflow_executions_tenant_idx").on(t.tenantId),
  index("workflow_executions_user_idx").on(t.userId),
  index("workflow_executions_status_idx").on(t.status),
  index("workflow_executions_thread_idx").on(t.threadId),
  index("workflow_executions_created_idx").on(t.createdAt),
]);

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertWorkflowExecution = typeof workflowExecutions.$inferInsert;

/**
 * Workflow Dead Letter Queue — Failed items for reprocessing (Section 13)
 * Items land here after exhausting retry attempts. Admins can inspect and reprocess.
 */
export const workflowDeadLetterQueue = pgTable("workflow_dead_letter_queue", {
  id: serial("id").primaryKey(),

  /** Workflow that generated this failure */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Execution run where the failure occurred */
  executionId: integer("executionId").references(() => workflowExecutions.id, { onDelete: "set null" }),

  /** Node that failed */
  nodeId: varchar("nodeId", { length: 36 }).notNull(),

  /** Node type for display/filtering */
  nodeType: varchar("nodeType", { length: 100 }),

  /** Input data that caused the failure */
  inputData: json("inputData").$type<Record<string, any>>().notNull(),

  /** Error message from the last failure */
  error: text("error").notNull(),

  /** Full error stack trace (for debugging) */
  stackTrace: text("stackTrace"),

  /** Number of retry attempts before DLQ */
  retryCount: integer("retryCount").default(0).notNull(),

  /** DLQ item status */
  status: dlqItemStatusEnum("status").default("pending").notNull(),

  /** Tenant isolation */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** When the item was reprocessed (null if not yet) */
  reprocessedAt: timestamp("reprocessedAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("dlq_workflow_idx").on(t.workflowId),
  index("dlq_execution_idx").on(t.executionId),
  index("dlq_status_idx").on(t.status),
  index("dlq_tenant_idx").on(t.tenantId),
  index("dlq_created_idx").on(t.createdAt),
]);

export type WorkflowDeadLetterQueueItem = typeof workflowDeadLetterQueue.$inferSelect;
export type InsertWorkflowDeadLetterQueueItem = typeof workflowDeadLetterQueue.$inferInsert;

/**
 * Workflow Cache Metadata — Cache statistics and observability (Section 13)
 * Actual cached values live in Redis. This table tracks hit/miss rates per cache key
 * for monitoring, tuning TTLs, and identifying high-value cache entries.
 */
export const workflowCacheMetadata = pgTable("workflow_cache_metadata", {
  id: serial("id").primaryKey(),

  /** SHA-256 cache key */
  cacheKey: varchar("cacheKey", { length: 64 }).notNull().unique(),

  /** Node type that produced this cache entry (e.g., "http_request", "llm_call") */
  nodeType: varchar("nodeType", { length: 100 }).notNull(),

  /** Number of cache hits */
  hitCount: integer("hitCount").default(0).notNull(),

  /** Last time the cache was hit */
  lastHitAt: timestamp("lastHitAt", { withTimezone: true }),

  /** TTL in seconds configured for this cache entry */
  ttlSeconds: integer("ttlSeconds").notNull(),

  /** Size of cached value in bytes (for capacity planning) */
  valueSizeBytes: integer("valueSizeBytes"),

  /** Tenant isolation (null for shared/global cache entries) */
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("cache_metadata_node_type_idx").on(t.nodeType),
  index("cache_metadata_tenant_idx").on(t.tenantId),
  index("cache_metadata_last_hit_idx").on(t.lastHitAt),
]);

export type WorkflowCacheMetadata = typeof workflowCacheMetadata.$inferSelect;
export type InsertWorkflowCacheMetadata = typeof workflowCacheMetadata.$inferInsert;

/**
 * Workflow Audit Events — Structured execution audit trail (Section 13)
 * Records who did what, when, with what data for governance and debugging.
 * Complements existing providerUsageLog (LLM-specific) and apiAuditEvents (media-specific).
 */
export const workflowAuditEvents = pgTable("workflow_audit_events", {
  id: serial("id").primaryKey(),

  /** Workflow definition */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Execution run (null for workflow-level events like deploy/publish) */
  executionId: integer("executionId").references(() => workflowExecutions.id, { onDelete: "set null" }),

  /** Node that generated the event (null for workflow-level events) */
  nodeId: varchar("nodeId", { length: 36 }),

  /** Event type (e.g., "node_start", "node_complete", "node_error", "approval_granted",
   *  "approval_rejected", "secret_accessed", "policy_checked", "execution_start",
   *  "execution_complete") */
  eventType: varchar("eventType", { length: 50 }).notNull(),

  /** Actor: user who triggered/approved/performed the action */
  actorId: integer("actorId").references(() => users.id),

  /** Event payload (structured JSON with event-type-specific fields) */
  data: json("data").$type<Record<string, any>>(),

  /** Tenant isolation */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Trace ID for correlation with providerUsageLog and external systems */
  traceId: varchar("traceId", { length: 64 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("audit_events_workflow_idx").on(t.workflowId),
  index("audit_events_execution_idx").on(t.executionId),
  index("audit_events_event_type_idx").on(t.eventType),
  index("audit_events_tenant_idx").on(t.tenantId),
  index("audit_events_actor_idx").on(t.actorId),
  index("audit_events_trace_idx").on(t.traceId),
  index("audit_events_created_idx").on(t.createdAt),
]);

export type WorkflowAuditEvent = typeof workflowAuditEvents.$inferSelect;
export type InsertWorkflowAuditEvent = typeof workflowAuditEvents.$inferInsert;

/**
 * Workflow Secrets — Encrypted credential vault (Section 13)
 * Stores encrypted API keys, tokens, and passwords for use by workflow nodes.
 * Values are encrypted with AES-256-GCM using LLM_ENCRYPTION_KEY (same key as crypto.ts).
 *
 * SECURITY: Never log or expose decrypted values. Secret access is recorded in
 * workflow_audit_events with eventType "secret_accessed".
 */
export const workflowSecrets = pgTable("workflow_secrets", {
  id: serial("id").primaryKey(),

  /** Tenant that owns this secret */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Human-readable secret name (unique per tenant, e.g., "stripe_api_key", "github_token") */
  name: varchar("name", { length: 255 }).notNull(),

  /** AES-256-GCM encrypted value (format: "iv:authTag:ciphertext" hex) */
  encryptedValue: text("encryptedValue").notNull(),

  /** Vault backend used for this secret ("internal" = AES-256-GCM, future: "hashicorp", "aws_sm") */
  vaultBackend: varchar("vaultBackend", { length: 50 }).default("internal").notNull(),

  /** Optional description of what this secret is for */
  description: text("description"),

  /** User who created this secret */
  createdBy: integer("createdBy").references(() => users.id),

  /** User who last updated this secret */
  updatedBy: integer("updatedBy").references(() => users.id),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("workflow_secrets_tenant_name_unique").on(t.tenantId, t.name),
  index("workflow_secrets_tenant_idx").on(t.tenantId),
]);

export type WorkflowSecret = typeof workflowSecrets.$inferSelect;
export type InsertWorkflowSecret = typeof workflowSecrets.$inferInsert;

/**
 * Workflow Policy Rules — Tenant-configurable governance policies (Section 13)
 * Phase 2 placeholder: Schema defined now to avoid migration during Phase 2.
 * Used by the Policy Gate node to enforce rules like:
 *   - Budget caps per workflow/user
 *   - Tool/API allowlists
 *   - PII redaction requirements
 *   - Required approval for destructive actions
 */
export const workflowPolicyRules = pgTable("workflow_policy_rules", {
  id: serial("id").primaryKey(),

  /** Tenant that owns this rule */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Rule type (e.g., "budget_cap", "tool_allowlist", "pii_redaction", "action_approval") */
  ruleType: varchar("ruleType", { length: 100 }).notNull(),

  /** Condition expression (JSON) that triggers this rule */
  condition: json("condition").$type<Record<string, any>>().notNull(),

  /** Action to take when condition matches */
  action: policyActionEnum("action").notNull(),

  /** Priority (lower number = higher priority, evaluated in order) */
  priority: integer("priority").default(100).notNull(),

  /** Whether this rule is active */
  enabled: boolean("enabled").default(true).notNull(),

  /** Optional human-readable description of what this rule does */
  description: text("description"),

  /** Optional: restrict rule to specific workflow IDs (null = all workflows) */
  workflowIds: json("workflowIds").$type<number[]>(),

  /** User who created this rule */
  createdBy: integer("createdBy").references(() => users.id),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("policy_rules_tenant_idx").on(t.tenantId),
  index("policy_rules_type_idx").on(t.ruleType),
  index("policy_rules_enabled_idx").on(t.enabled),
  index("policy_rules_priority_idx").on(t.priority),
]);

export type WorkflowPolicyRule = typeof workflowPolicyRules.$inferSelect;
export type InsertWorkflowPolicyRule = typeof workflowPolicyRules.$inferInsert;

export const tenantBrowserPolicyConfig = pgTable("tenant_browser_policy_config", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").default(true).notNull(),
  enforcementMode: varchar("enforcementMode", { length: 32 }).default("observe").notNull(),
  defaultApprovalTtlSeconds: integer("defaultApprovalTtlSeconds").default(300).notNull(),
  reviewCadenceDays: integer("reviewCadenceDays").default(90).notNull(),
  killSwitchEnabled: boolean("killSwitchEnabled").default(false).notNull(),
  requireTamperEvidence: boolean("requireTamperEvidence").default(true).notNull(),
  evidenceRetentionDays: integer("evidenceRetentionDays").default(365).notNull(),
  allowedDomains: jsonb("allowedDomains").$type<string[]>().default([]).notNull(),
  visionModel: varchar("visionModel", { length: 100 }).default("gpt-4o").notNull(),
  seededDefault: boolean("seededDefault").default(false).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("tenant_browser_policy_config_tenant_idx").on(t.tenantId),
  check("tenant_browser_policy_config_ttl_bounds", sql`${t.defaultApprovalTtlSeconds} >= 60 AND ${t.defaultApprovalTtlSeconds} <= 900`),
]);

export type TenantBrowserPolicyConfig = typeof tenantBrowserPolicyConfig.$inferSelect;
export type InsertTenantBrowserPolicyConfig = typeof tenantBrowserPolicyConfig.$inferInsert;

export const tenantBrowserPolicyRules = pgTable("tenant_browser_policy_rules", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  priority: integer("priority").default(100).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  description: text("description"),
  match: jsonb("match").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  thresholds: jsonb("thresholds").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  decision: browserPolicyDecisionEnum("decision").notNull(),
  reasonCode: varchar("reasonCode", { length: 100 }).notNull(),
  actionClass: browserActionClassEnum("actionClass"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("tenant_browser_policy_rules_tenant_idx").on(t.tenantId),
  index("tenant_browser_policy_rules_priority_idx").on(t.tenantId, t.priority),
  index("tenant_browser_policy_rules_enabled_idx").on(t.tenantId, t.enabled),
]);

export type TenantBrowserPolicyRule = typeof tenantBrowserPolicyRules.$inferSelect;
export type InsertTenantBrowserPolicyRule = typeof tenantBrowserPolicyRules.$inferInsert;

export const browserWorkflowEntitlements = pgTable("browser_workflow_entitlements", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  workflowName: varchar("workflowName", { length: 255 }).notNull(),
  businessOwner: varchar("businessOwner", { length: 255 }),
  technicalOwner: varchar("technicalOwner", { length: 255 }),
  riskRating: varchar("riskRating", { length: 32 }).default("medium").notNull(),
  allowedCapabilities: jsonb("allowedCapabilities").$type<string[]>().default([]).notNull(),
  forbiddenCapabilities: jsonb("forbiddenCapabilities").$type<string[]>().default([]).notNull(),
  allowedDataClasses: jsonb("allowedDataClasses").$type<string[]>().default(["public", "internal"]).notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }),
  reviewCadenceDays: integer("reviewCadenceDays").default(90).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_browser_workflow_entitlements_tenant_workflow").on(t.tenantId, t.workflowId),
  index("browser_workflow_entitlements_tenant_idx").on(t.tenantId),
  index("browser_workflow_entitlements_workflow_idx").on(t.workflowId),
]);

export type BrowserWorkflowEntitlement = typeof browserWorkflowEntitlements.$inferSelect;
export type InsertBrowserWorkflowEntitlement = typeof browserWorkflowEntitlements.$inferInsert;

export const browserPolicyDecisions = pgTable("browser_policy_decisions", {
  id: serial("id").primaryKey(),
  traceId: varchar("traceId", { length: 64 }),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").references(() => users.id),
  workflowId: integer("workflowId"),
  executionId: varchar("executionId", { length: 128 }),
  actionType: varchar("actionType", { length: 64 }).notNull(),
  actionClass: browserActionClassEnum("actionClass").notNull(),
  pageSensitivity: browserPageSensitivityEnum("pageSensitivity").notNull(),
  decision: browserPolicyDecisionEnum("decision").notNull(),
  reasonCodes: jsonb("reasonCodes").$type<string[]>().default([]).notNull(),
  approvalState: varchar("approvalState", { length: 32 }).notNull(),
  outcome: varchar("outcome", { length: 16 }).notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  previousEventHash: varchar("previousEventHash", { length: 128 }),
  eventHash: varchar("eventHash", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("browser_policy_decisions_event_hash_uq").on(t.eventHash),
  index("browser_policy_decisions_tenant_created_idx").on(t.tenantId, t.createdAt),
  index("browser_policy_decisions_trace_idx").on(t.traceId),
  index("browser_policy_decisions_execution_idx").on(t.executionId),
  index("browser_policy_decisions_decision_idx").on(t.decision, t.createdAt),
]);

export type BrowserPolicyDecisionRecord = typeof browserPolicyDecisions.$inferSelect;
export type InsertBrowserPolicyDecisionRecord = typeof browserPolicyDecisions.$inferInsert;

// Cloud Task Events — Tracks Cloud Tasks execution for observability and DLQ
export const cloudTaskEvents = pgTable("cloud_task_events", {
  id: serial("id").primaryKey(),

  /** Cloud Tasks task ID (from X-CloudTasks-TaskName header) */
  taskId: varchar("taskId", { length: 512 }).notNull(),

  /** Queue name (e.g., 'media-jobs', 'video-jobs-short') */
  queueName: varchar("queueName", { length: 128 }).notNull(),

  /** Application-level job ID (links to media_tasks or other job tables) */
  jobId: varchar("jobId", { length: 128 }),

  /** Task status: queued, processing, completed, failed, dead_letter */
  status: varchar("status", { length: 32 }).notNull().default("queued"),

  /** Number of retry attempts (from X-CloudTasks-TaskRetryCount) */
  attemptCount: integer("attemptCount").default(0).notNull(),

  /** Task payload (JSON body sent to the handler) */
  payload: json("payload").$type<Record<string, unknown>>(),

  /** Error message on failure */
  errorMessage: text("errorMessage"),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true }),
}, (t) => [
  index("cloud_task_events_task_id_idx").on(t.taskId),
  index("cloud_task_events_status_idx").on(t.status),
  index("cloud_task_events_queue_name_idx").on(t.queueName),
  index("cloud_task_events_job_id_idx").on(t.jobId),
]);

export type CloudTaskEvent = typeof cloudTaskEvents.$inferSelect;
export type InsertCloudTaskEvent = typeof cloudTaskEvents.$inferInsert;

// Funnel Events — Canonical milestone analytics stream
export const funnelEvents = pgTable("funnel_events", {
  id: serial("id").primaryKey(),

  /** Tenant scope for analytics isolation and query performance */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Domain scope for domain-admin fallback and attribution compatibility */
  domain: varchar("domain", { length: 255 }),

  /** User scope for first-event semantics and per-user drilldown */
  userId: integer("userId").references(() => users.id, { onDelete: "set null" }),

  /** Canonical milestone event name */
  eventName: varchar("eventName", { length: 128 }).notNull(),

  /** Canonical UTC timestamp used for all aggregations */
  eventTime: timestamp("eventTime", { withTimezone: true }).notNull(),

  /** Deterministic dedup key used for insert-once contract */
  eventKey: varchar("eventKey", { length: 255 }).notNull(),

  /** Flexible metadata payload for drilldown and export */
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("funnel_events_event_key_unique").on(t.eventKey),
  index("funnel_events_tenant_event_time_idx").on(t.tenantId, t.eventTime),
  index("funnel_events_domain_event_time_idx").on(t.domain, t.eventTime),
  index("funnel_events_name_event_time_idx").on(t.eventName, t.eventTime),
  index("funnel_events_user_name_time_idx").on(t.userId, t.eventName, t.eventTime),
]);

export type FunnelEvent = typeof funnelEvents.$inferSelect;
export type InsertFunnelEvent = typeof funnelEvents.$inferInsert;

/**
 * Funnel Backfill Run Status
 */
export const backfillRunStatusEnum = pgEnum("backfill_run_status", [
  "running",
  "paused",
  "aborted",
  "completed",
  "failed",
]);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "pending",
  "passed",
  "failed",
]);

/**
 * Funnel Backfill Runs
 * Tracks historical milestone backfill execution with operational controls
 */
export const funnelBackfillRuns = pgTable("funnel_backfill_runs", {
  id: serial("id").primaryKey(),

  /** Unique run identifier for idempotent resume */
  runId: varchar("runId", { length: 64 }).notNull().unique(),

  /** Optional tenant filter (null = all tenants) */
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),

  /** Current execution status */
  status: backfillRunStatusEnum("status").notNull().default("running"),

  /** Date range to backfill (inclusive) */
  startDate: timestamp("startDate", { withTimezone: true }).notNull(),
  endDate: timestamp("endDate", { withTimezone: true }).notNull(),

  /** Source filter: which data source to backfill from */
  sourceFilter: varchar("sourceFilter", { length: 128 }),

  /** Batch size for controlled processing */
  batchSize: integer("batchSize").notNull().default(1000),

  /** Dry-run mode: compute counts without persisting */
  dryRun: boolean("dryRun").notNull().default(false),

  /** Progress counters */
  totalRecordsProcessed: integer("totalRecordsProcessed").notNull().default(0),
  totalEventsInserted: integer("totalEventsInserted").notNull().default(0),

  /** Reconciliation gate results */
  reconciliationStatus: reconciliationStatusEnum("reconciliationStatus").notNull().default("pending"),
  reconciliationReport: jsonb("reconciliationReport").$type<Record<string, unknown>>(),

  /** Operator action timestamps */
  startedAt: timestamp("startedAt", { withTimezone: true }).notNull(),
  pausedAt: timestamp("pausedAt", { withTimezone: true }),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  abortedAt: timestamp("abortedAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("funnel_backfill_runs_status_idx").on(t.status),
  index("funnel_backfill_runs_tenant_idx").on(t.tenantId),
]);

export type FunnelBackfillRun = typeof funnelBackfillRuns.$inferSelect;
export type InsertFunnelBackfillRun = typeof funnelBackfillRuns.$inferInsert;

/**
 * Funnel Backfill Checkpoints
 * Stores resumable position markers within a backfill run
 */
export const funnelBackfillCheckpoints = pgTable("funnel_backfill_checkpoints", {
  id: serial("id").primaryKey(),

  /** Reference to parent run */
  runId: varchar("runId", { length: 64 }).notNull().references(() => funnelBackfillRuns.runId, { onDelete: "cascade" }),

  /** Flexible position marker (e.g., {date: "2024-01-15", batch: 5}) */
  checkpointPosition: jsonb("checkpointPosition").$type<Record<string, unknown>>().notNull(),

  /** Progress at this checkpoint */
  recordsProcessed: integer("recordsProcessed").notNull(),
  eventsInserted: integer("eventsInserted").notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("funnel_backfill_checkpoints_run_idx").on(t.runId),
]);

export type FunnelBackfillCheckpoint = typeof funnelBackfillCheckpoints.$inferSelect;
export type InsertFunnelBackfillCheckpoint = typeof funnelBackfillCheckpoints.$inferInsert;

// ============================================================
// OpenSandbox Tables
// ============================================================

/**
 * Sandbox Profiles -- Reusable runtime configurations for sandbox containers.
 * Each profile defines resource limits, execution mode, and security policies.
 */
export const sandboxProfiles = pgTable("sandbox_profiles", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  executionMode: sandboxExecutionModeEnum("executionMode").notNull(),
  baseImage: varchar("baseImage", { length: 512 }).notNull(),
  entrypointTemplate: text("entrypointTemplate"),
  cpuLimit: varchar("cpuLimit", { length: 16 }).default("1000m").notNull(),
  memoryLimitMb: integer("memoryLimitMb").default(2048).notNull(),
  ephemeralDiskMb: integer("ephemeralDiskMb").default(5120).notNull(),
  timeoutSeconds: integer("timeoutSeconds").default(300).notNull(),
  networkDefaultAction: sandboxNetworkActionEnum("networkDefaultAction").default("deny").notNull(),
  allowBrowser: boolean("allowBrowser").default(false).notNull(),
  allowCommand: boolean("allowCommand").default(false).notNull(),
  allowCodeInterpreter: boolean("allowCodeInterpreter").default(false).notNull(),
  allowFileUpload: boolean("allowFileUpload").default(true).notNull(),
  maxInputMb: integer("maxInputMb").default(50),
  maxOutputMb: integer("maxOutputMb").default(100),
  isActive: boolean("isActive").default(true).notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type SandboxProfile = typeof sandboxProfiles.$inferSelect;
export type InsertSandboxProfile = typeof sandboxProfiles.$inferInsert;

/**
 * Sandbox Jobs -- Canonical execution records for sandbox operations.
 * Tracks lifecycle from acceptance through execution to completion/failure.
 */
export const sandboxJobs = pgTable("sandbox_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id),
  featureType: sandboxFeatureTypeEnum("featureType").notNull(),
  featureRefId: varchar("featureRefId", { length: 128 }),
  executionMode: sandboxExecutionModeEnum("executionMode").notNull(),
  sandboxProfileId: integer("sandboxProfileId").references(() => sandboxProfiles.id),
  opensandboxId: varchar("opensandboxId", { length: 128 }),
  status: sandboxJobStatusEnum("status").default("accepted").notNull(),
  statusReason: text("statusReason"),
  imageUri: varchar("imageUri", { length: 512 }),
  inputManifestJson: jsonb("inputManifestJson").$type<Record<string, unknown>>(),
  outputManifestJson: jsonb("outputManifestJson").$type<Record<string, unknown>>(),
  stdoutExcerpt: text("stdoutExcerpt"),
  stderrExcerpt: text("stderrExcerpt"),
  costEstimate: numeric("costEstimate", { precision: 12, scale: 4 }),
  costActual: numeric("costActual", { precision: 12, scale: 4 }),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  startedAt: timestamp("startedAt", { withTimezone: true }),
  finishedAt: timestamp("finishedAt", { withTimezone: true }),
  expiresAt: timestamp("expiresAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("sandbox_jobs_idempotency_idx")
    .on(t.tenantId, t.featureType, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} IS NOT NULL`),
  index("sandbox_jobs_tenant_status_idx").on(t.tenantId, t.status),
  index("sandbox_jobs_opensandbox_id_idx").on(t.opensandboxId),
  index("sandbox_jobs_user_idx").on(t.userId),
  index("sandbox_jobs_created_idx").on(t.createdAt),
  index("sandbox_jobs_expires_idx").on(t.expiresAt),
]);

export type SandboxJob = typeof sandboxJobs.$inferSelect;
export type InsertSandboxJob = typeof sandboxJobs.$inferInsert;

/**
 * Sandbox Artifacts -- Output files produced by sandbox jobs.
 * Tracks S3/R2 object keys, types, sizes, and checksums.
 */
export const sandboxArtifacts = pgTable("sandbox_artifacts", {
  id: serial("id").primaryKey(),
  sandboxJobId: varchar("sandboxJobId", { length: 36 }).notNull().references(() => sandboxJobs.id, { onDelete: "cascade" }),
  artifactType: sandboxArtifactTypeEnum("artifactType").notNull(),
  objectKey: varchar("objectKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  sizeBytes: bigint("sizeBytes", { mode: "number" }),
  sha256: varchar("sha256", { length: 64 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  metadataJson: jsonb("metadataJson").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sandbox_artifacts_job_idx").on(t.sandboxJobId),
  index("sandbox_artifacts_type_idx").on(t.artifactType),
]);

export type SandboxArtifact = typeof sandboxArtifacts.$inferSelect;
export type InsertSandboxArtifact = typeof sandboxArtifacts.$inferInsert;

/**
 * Tenant Sandbox Policies -- Per-tenant sandbox usage limits and configuration.
 * One policy per tenant controlling concurrency, runtime, network, and image access.
 */
export const tenantSandboxPolicies = pgTable("tenant_sandbox_policies", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  defaultProfileId: integer("defaultProfileId").references(() => sandboxProfiles.id),
  maxConcurrentSandboxes: integer("maxConcurrentSandboxes").default(5).notNull(),
  maxDailyRuntimeSeconds: integer("maxDailyRuntimeSeconds").default(36000).notNull(),
  maxSingleJobSeconds: integer("maxSingleJobSeconds").default(1800).notNull(),
  defaultNetworkAction: sandboxNetworkActionEnum("defaultNetworkAction"),
  egressRulesJson: jsonb("egressRulesJson").$type<Array<{ host: string; port?: number }>>(),
  allowedImagesJson: jsonb("allowedImagesJson").$type<string[]>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TenantSandboxPolicy = typeof tenantSandboxPolicies.$inferSelect;
export type InsertTenantSandboxPolicy = typeof tenantSandboxPolicies.$inferInsert;

// ==========================================
// Section 027: Agency-Swarm Integration
// ==========================================

/**
 * Agencies -- Multi-agent orchestration units.
 * Each agency contains a team of AI agents with directional communication flows.
 */
export const agencies = pgTable("agencies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: text("systemPrompt"),
  creditMultiplier: numeric("creditMultiplier", { precision: 5, scale: 2 }).default("1.00"),
  /** Creator fee in credits charged to runner on successful run completion (0 = no fee) */
  creatorFeeCredits: integer("creatorFeeCredits").default(0).notNull(),
  /** Platform share percentage of creator fee (default 20% — creator gets 80%) */
  platformSharePct: integer("platformSharePct").default(20).notNull(),
  /** Default LLM model for new agents & fallback when agent model is unset */
  defaultModel: varchar("defaultModel", { length: 100 }),
  maxAgents: integer("maxAgents").default(10),
  maxRunTimeSeconds: integer("maxRunTimeSeconds").default(600),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  isFallbackSafe: boolean("isFallbackSafe").default(false).notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),
  /** Visibility: private (owner only), shared (specific groups), public (all tenant users) */
  visibility: varchar("visibility", { length: 20 }).default("private").notNull(),
  /** Pre-generated SVG topology diagram for marketplace preview */
  previewSvg: text("previewSvg"),
  /** When the creator requested public publishing */
  requestedPublishAt: timestamp("requestedPublishAt", { withTimezone: true }),
  /** Admin who approved/rejected the publish request */
  approvedBy: integer("approvedBy").references(() => users.id, { onDelete: "set null" }),
  /** When admin approved the publish request */
  approvedAt: timestamp("approvedAt", { withTimezone: true }),
  /** Reason for rejection (shown to creator) */
  rejectionReason: text("rejectionReason"),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("agencies_tenant_slug_idx").on(t.tenantId, t.slug),
  index("agencies_tenant_idx").on(t.tenantId),
  index("agencies_created_by_idx").on(t.createdBy),
]);

export type Agency = typeof agencies.$inferSelect;
export type InsertAgency = typeof agencies.$inferInsert;

/**
 * Agency Permissions — controls which groups can access a shared agency.
 * Mirrors the skillPermissions pattern.
 */
export const agencyPermissions = pgTable("agency_permissions", {
  id: serial("id").primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),
  groupId: integer("groupId").notNull()
    .references(() => userGroups.id, { onDelete: "cascade" }),
  grantedByUserId: integer("grantedByUserId")
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("agency_permissions_unique").on(t.agencyId, t.groupId),
  index("agency_permissions_group_idx").on(t.groupId),
  index("agency_permissions_agency_idx").on(t.agencyId),
]);

export type AgencyPermission = typeof agencyPermissions.$inferSelect;
export type InsertAgencyPermission = typeof agencyPermissions.$inferInsert;

/**
 * Agency Agents -- Individual AI agents within an agency.
 * Each agent has its own model, instructions, and tool set.
 */
export const agencyAgents = pgTable("agency_agents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  instructions: text("instructions"),
  model: varchar("model", { length: 100 }),
  modelSettings: json("modelSettings").$type<{
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
  }>(),
  isEntryPoint: boolean("isEntryPoint").default(false).notNull(),
  isOptional: boolean("isOptional").default(false).notNull(),
  position: json("position").$type<{ x: number; y: number }>(),
  nodeType: varchar("nodeType", { length: 30 }).default("agent").notNull(),
  nodeConfig: json("nodeConfig").$type<{
    // supervisor
    maxRounds?: number;
    routingStrategy?: "llm" | "round_robin" | "broadcast";
    // router
    routingMode?: "keyword" | "regex" | "llm_classify";
    routes?: Array<{ condition: string; targetNodeId: string; label?: string }>;
    defaultTargetNodeId?: string;
    // aggregator
    aggregationMode?: "first_wins" | "majority_vote" | "llm_merge" | "concatenate";
    minResponses?: number;
    mergeInstructions?: string;
    // knowledge_base (node-level)
    collectionId?: string;
    topK?: number;
    searchMode?: "hybrid" | "vector" | "keyword";
    scoreThreshold?: number;
    outputFormat?: "formatted_context" | "documents_array" | "first_only";
    // agent/supervisor — attached knowledge base documents
    knowledgeBase?: {
      documentIds?: string[];
      searchMode?: "hybrid" | "vector" | "keyword";
      topK?: number;
      scoreThreshold?: number;
      maxContextTokens?: number;
    };
    // skill_call
    skillId?: string;
    skillSlug?: string;
    inputMapping?: Record<string, string>;
    passInputThrough?: boolean;
    // human_approval
    approvalMessage?: string;
    approvers?: string[];
    timeoutHours?: number;
    onTimeout?: "auto_approve" | "auto_reject" | "escalate";
    requireAllApprovers?: boolean;
  }>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_agents_agency_idx").on(t.agencyId),
  uniqueIndex("agency_agents_agency_name_idx").on(t.agencyId, t.name),
]);

export type AgencyAgent = typeof agencyAgents.$inferSelect;
export type InsertAgencyAgent = typeof agencyAgents.$inferInsert;

/**
 * Agency Templates -- Pre-configured multi-agent orchestration templates
 * (e.g. "SEO Team", "Software Development Agency")
 */
export const agencyTemplates = pgTable("agency_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: text("systemPrompt"),
  category: varchar("category", { length: 64 }).notNull(), // e.g. "Marketing", "Development"
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type AgencyTemplate = typeof agencyTemplates.$inferSelect;
export type InsertAgencyTemplate = typeof agencyTemplates.$inferInsert;

/**
 * Agent Templates -- Pre-configured individual roles
 * (e.g. "CEO", "Copywriter", "Data Analyst")
 * 
 * Can be linked to a specific agency_template, or act as a standalone draggable node.
 */
export const agentTemplates = pgTable("agent_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agencyTemplateId: varchar("agencyTemplateId", { length: 36 }).references(() => agencyTemplates.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(), // Job title "CEO"
  description: text("description"),
  instructions: text("instructions"),
  category: varchar("category", { length: 64 }).notNull(), // Sidebar category
  icon: varchar("icon", { length: 64 }).default("bot"),
  defaultModel: varchar("defaultModel", { length: 100 }),
  isEntryPoint: boolean("isEntryPoint").default(false).notNull(),
  position: json("position").$type<{ x: number; y: number }>(),
  defaultTools: json("defaultTools").$type<string[]>(), // slugs of tools to auto-attach
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agent_templates_agency_tmpl_idx").on(t.agencyTemplateId),
  index("agent_templates_category_idx").on(t.category),
]);

export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type InsertAgentTemplate = typeof agentTemplates.$inferInsert;

/**
 * Agency Tools -- Tool definitions available to agency agents.
 */
export const agencyTools = pgTable("agency_tools", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  toolType: varchar("toolType", { length: 20 }).notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  riskLevel: varchar("riskLevel", { length: 10 }).default("low").notNull(),
  requiresApproval: boolean("requiresApproval").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_tools_tenant_idx").on(t.tenantId),
  uniqueIndex("agency_tools_tenant_name_idx").on(t.tenantId, t.name),
]);

export type AgencyTool = typeof agencyTools.$inferSelect;
export type InsertAgencyTool = typeof agencyTools.$inferInsert;

/**
 * Agency Agent Tools -- Junction table linking agents to their assigned tools.
 */
export const agencyAgentTools = pgTable("agency_agent_tools", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agentId: varchar("agentId", { length: 36 }).notNull().references(() => agencyAgents.id, { onDelete: "cascade" }),
  toolId: varchar("toolId", { length: 100 }).notNull(),
  toolConfig: json("toolConfig").$type<{
    // rag
    collectionId?: string;
    topK?: number;
    // skill_executor
    skillId?: string;
    skillSlug?: string;
    // http
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    // email
    toTemplate?: string;
    subjectTemplate?: string;
    // webhook
    webhookUrl?: string;
    // slack
    channelId?: string;
    // document search
    collectionIds?: string[];
  }>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("agency_agent_tools_agent_tool_idx").on(t.agentId, t.toolId),
  index("agency_agent_tools_tool_idx").on(t.toolId),
]);

export type AgencyAgentTool = typeof agencyAgentTools.$inferSelect;
export type InsertAgencyAgentTool = typeof agencyAgentTools.$inferInsert;

/**
 * Agency Communication Flows -- Directional communication links between agents.
 */
export const agencyCommunicationFlows = pgTable("agency_communication_flows", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
  fromAgentId: varchar("fromAgentId", { length: 36 }).notNull().references(() => agencyAgents.id, { onDelete: "cascade" }),
  toAgentId: varchar("toAgentId", { length: 36 }).notNull().references(() => agencyAgents.id, { onDelete: "cascade" }),
  flowType: varchar("flowType", { length: 20 }).default("delegation").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_comm_flows_agency_idx").on(t.agencyId),
  uniqueIndex("agency_comm_flows_unique_idx").on(t.agencyId, t.fromAgentId, t.toAgentId),
]);

export type AgencyCommunicationFlow = typeof agencyCommunicationFlows.$inferSelect;
export type InsertAgencyCommunicationFlow = typeof agencyCommunicationFlows.$inferInsert;

/**
 * Agency Conversations -- Chat sessions between a user and an agency.
 */
export const agencyConversations = pgTable("agency_conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).default("New Agency Chat").notNull(),
  totalCreditsUsed: numeric("totalCreditsUsed", { precision: 12, scale: 4 }).default("0"),
  messageCount: integer("messageCount").default(0).notNull(),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_conversations_agency_user_idx").on(t.agencyId, t.userId),
  index("agency_conversations_user_idx").on(t.userId),
]);

export type AgencyConversation = typeof agencyConversations.$inferSelect;
export type InsertAgencyConversation = typeof agencyConversations.$inferInsert;

/**
 * Agency Versions -- Immutable snapshots of an agency graph for version history.
 * Max 50 versions per agency (oldest pruned on insert).
 */
export const agencyVersions = pgTable("agency_versions", {
  id: serial("id").primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
  versionNumber: integer("versionNumber").notNull(),
  snapshotJson: json("snapshotJson").$type<{ nodes: unknown[]; edges: unknown[]; name: string }>().notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  changeDescription: text("changeDescription"),
  createdByUserId: integer("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("av_agency_version_unique").on(t.agencyId, t.versionNumber),
  index("av_agency_created_idx").on(t.agencyId, t.createdAt),
]);

export type AgencyVersion = typeof agencyVersions.$inferSelect;
export type InsertAgencyVersion = typeof agencyVersions.$inferInsert;

// ─── Chat Bridge Tables ─────────────────────────────────────────────────────

/**
 * Telegram Connections -- Links a SmartSpecPro user to a Telegram account.
 * Replaces the user-level telegramChatId/telegramVerified fields with a
 * proper connection model supporting multiple bots and conversation binding.
 */
export const telegramConnections = pgTable("telegram_connections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  telegramUserId: varchar("telegramUserId", { length: 64 }).notNull(),
  telegramChatId: varchar("telegramChatId", { length: 64 }).notNull(),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  botId: varchar("botId", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  activeChannelId: varchar("activeChannelId", { length: 36 }),
  linkedAt: timestamp("linkedAt", { withTimezone: true }).defaultNow().notNull(),
  linkedBy: varchar("linkedBy", { length: 20 }).notNull(),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  revokedBy: varchar("revokedBy", { length: 36 }),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("telegram_connections_bot_user_unique").on(t.botId, t.telegramUserId),
  index("telegram_connections_tenant_user_idx").on(t.tenantId, t.userId),
  index("telegram_connections_chat_id_idx").on(t.telegramChatId),
]);

export type TelegramConnection = typeof telegramConnections.$inferSelect;
export type InsertTelegramConnection = typeof telegramConnections.$inferInsert;

/**
 * Conversation Channels -- Maps conversations (chat or agency) to external
 * channel bindings (Telegram, future: LINE, WhatsApp).
 *
 * Uses split FK columns because conversations.id is integer and
 * agencyConversations.id is varchar(36). A CHECK constraint ensures
 * exactly one is set, determined by conversationType.
 */
export const conversationChannels = pgTable("conversation_channels", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  chatConversationId: integer("chatConversationId").references(() => conversations.id, { onDelete: "cascade" }),
  agencyConversationId: varchar("agencyConversationId", { length: 36 }).references(() => agencyConversations.id, { onDelete: "cascade" }),
  conversationType: varchar("conversationType", { length: 20 }).notNull(),
  channelType: varchar("channelType", { length: 20 }).notNull(),
  channelRefId: varchar("channelRefId", { length: 64 }),
  connectionId: varchar("connectionId", { length: 36 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  syncMode: varchar("syncMode", { length: 20 }).notNull().default("two_way"),
  state: varchar("state", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("conversation_channels_chat_unique")
    .on(t.chatConversationId, t.channelType, t.channelRefId)
    .where(sql`"chatConversationId" IS NOT NULL`),
  uniqueIndex("conversation_channels_agency_unique")
    .on(t.agencyConversationId, t.channelType, t.channelRefId)
    .where(sql`"agencyConversationId" IS NOT NULL`),
  index("conversation_channels_tenant_type_idx").on(t.tenantId, t.channelType),
  check("conversation_channels_one_conv_check", sql`
    ("conversationType" = 'chat' AND "chatConversationId" IS NOT NULL AND "agencyConversationId" IS NULL)
    OR
    ("conversationType" = 'agency' AND "agencyConversationId" IS NOT NULL AND "chatConversationId" IS NULL)
  `),
]);

export type ConversationChannel = typeof conversationChannels.$inferSelect;
export type InsertConversationChannel = typeof conversationChannels.$inferInsert;

/**
 * Channel Messages -- Per-channel delivery tracking for outbound messages.
 *
 * messageId is stored as text because it may reference messages.id (integer)
 * or agency_messages.id (bigint). No FK constraint since it spans two tables.
 * messageType determines which source table to query.
 */
export const channelMessages = pgTable("channel_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  conversationChannelId: varchar("conversationChannelId", { length: 36 }).notNull().references(() => conversationChannels.id, { onDelete: "cascade" }),
  messageId: text("messageId").notNull(),
  messageType: varchar("messageType", { length: 20 }).notNull(),
  channelType: varchar("channelType", { length: 20 }).notNull(),
  externalMessageId: varchar("externalMessageId", { length: 64 }),
  externalChatId: varchar("externalChatId", { length: 64 }),
  deliveryStatus: varchar("deliveryStatus", { length: 20 }).notNull().default("pending"),
  attemptCount: integer("attemptCount").notNull().default(0),
  lastAttemptAt: timestamp("lastAttemptAt", { withTimezone: true }),
  deliveredAt: timestamp("deliveredAt", { withTimezone: true }),
  failureCode: varchar("failureCode", { length: 50 }),
  failureReason: text("failureReason"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("channel_messages_external_unique")
    .on(t.channelType, t.externalChatId, t.externalMessageId),
  index("channel_messages_channel_msg_idx")
    .on(t.conversationChannelId, t.messageId),
]);

export type ChannelMessage = typeof channelMessages.$inferSelect;
export type InsertChannelMessage = typeof channelMessages.$inferInsert;

/**
 * Telegram Link Tokens -- Auditable deep-link tokens for connecting
 * Telegram accounts and optionally binding to specific conversations.
 *
 * Uses the same split-ID pattern as conversation_channels for conversation FKs.
 */
export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetChatConversationId: integer("targetChatConversationId").references(() => conversations.id),
  targetAgencyConversationId: varchar("targetAgencyConversationId", { length: 36 }).references(() => agencyConversations.id),
  targetConversationType: varchar("targetConversationType", { length: 20 }),
  purpose: varchar("purpose", { length: 20 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  usedAt: timestamp("usedAt", { withTimezone: true }),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("createdBy"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("telegram_link_tokens_hash_unique").on(t.tokenHash),
  index("telegram_link_tokens_tenant_user_purpose_idx").on(t.tenantId, t.userId, t.purpose),
]);

export type TelegramLinkToken = typeof telegramLinkTokens.$inferSelect;
export type InsertTelegramLinkToken = typeof telegramLinkTokens.$inferInsert;

/**
 * Telegram Updates -- Webhook update deduplication and audit log.
 * Stores every inbound Telegram Update ID for dedupe and troubleshooting.
 */
export const telegramUpdates = pgTable("telegram_updates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  botId: varchar("botId", { length: 64 }).notNull(),
  updateId: bigint("updateId", { mode: "bigint" }).notNull(),
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  receivedAt: timestamp("receivedAt", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true }),
  processingStatus: varchar("processingStatus", { length: 20 }).notNull().default("accepted"),
  errorCode: varchar("errorCode", { length: 50 }),
  errorReason: text("errorReason"),
}, (t) => [
  uniqueIndex("telegram_updates_bot_update_unique").on(t.botId, t.updateId),
]);

export type TelegramUpdate = typeof telegramUpdates.$inferSelect;
export type InsertTelegramUpdate = typeof telegramUpdates.$inferInsert;

// ==========================================
// Creator Revenue Sharing
// ==========================================

/**
 * Creator Settlements -- Revenue sharing ledger.
 * Tracks every creator fee charged when someone runs another user's agency/workflow/skill.
 * Fee is split between creator (80% default) and platform (20% default).
 */
export const creatorSettlements = pgTable("creator_settlements", {
  id: serial("id").primaryKey(),

  /** The run that triggered this settlement */
  runId: varchar("runId", { length: 36 }).notNull(),

  /** Entity type: agency, workflow, or skill */
  entityType: varchar("entityType", { length: 20 }).notNull(),

  /** Entity ID (agency.id, workflow.id, or skill.id) */
  entityId: varchar("entityId", { length: 36 }).notNull(),

  /** Runner (user who paid the fee) */
  runnerId: integer("runnerId").notNull().references(() => users.id),

  /** Creator (user who receives the payout) */
  creatorId: integer("creatorId").notNull().references(() => users.id),

  /** Tenant context */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id),

  /** Total fee configured on the entity */
  totalFee: integer("totalFee").notNull(),

  /** Actual amount charged (may be less if runner had insufficient credits) */
  actualCharged: integer("actualCharged").notNull(),

  /** Creator's share (actualCharged * (100 - platformSharePct) / 100) */
  creatorShare: integer("creatorShare").notNull(),

  /** Platform's share (actualCharged - creatorShare) */
  platformShare: integer("platformShare").notNull(),

  /** Platform share percentage at time of settlement (snapshot for audit) */
  platformSharePct: integer("platformSharePct").notNull(),

  /** Transaction ID for the runner's deduction */
  debitTransactionId: integer("debitTransactionId").references(() => creditTransactions.id),

  /** Transaction ID for the creator's credit */
  creditTransactionId: integer("creditTransactionId").references(() => creditTransactions.id),

  /** Settlement status */
  status: settlementStatusEnum("status").default("completed").notNull(),

  /** Idempotency key to prevent double settlement */
  idempotencyKey: varchar("idempotencyKey", { length: 256 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("creator_settlements_idempotency_key_unique")
    .on(t.idempotencyKey)
    .where(sql`"idempotencyKey" IS NOT NULL`),
  index("creator_settlements_creator_idx").on(t.creatorId),
  index("creator_settlements_runner_idx").on(t.runnerId),
  index("creator_settlements_entity_idx").on(t.entityType, t.entityId),
  index("creator_settlements_run_idx").on(t.runId),
  index("creator_settlements_tenant_idx").on(t.tenantId),
]);

export type CreatorSettlement = typeof creatorSettlements.$inferSelect;
export type InsertCreatorSettlement = typeof creatorSettlements.$inferInsert;

// ==========================================
// ClawFeature: Persona Templates
// ==========================================

/**
 * Persona Templates -- AI persona definitions for customizing chat behavior.
 * Scope hierarchy: platform > tenant > user (4-level resolution chain).
 */
export const personaTemplates = pgTable("persona_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  systemPromptPrefix: text("systemPromptPrefix").notNull(),
  tone: text("tone"),
  language: text("language").default("auto"),
  responseStyle: jsonb("responseStyle").default({}),
  restrictions: text("restrictions").array().default(sql`'{}'`),
  scope: text("scope").notNull(),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("persona_templates_tenant_scope_idx").on(t.tenantId, t.scope),
  index("persona_templates_user_idx").on(t.userId),
  check("persona_templates_tone_check", sql`"tone" IN ('formal','casual','friendly','technical','creative') OR "tone" IS NULL`),
  check("persona_templates_scope_check", sql`"scope" IN ('platform','tenant','user')`),
]);

export type PersonaTemplate = typeof personaTemplates.$inferSelect;
export type InsertPersonaTemplate = typeof personaTemplates.$inferInsert;

// ==========================================
// ClawFeature: Channel Infrastructure
// ==========================================

/**
 * Channel Connections -- Generalizes telegramConnections to support
 * multiple channel types (Telegram, WhatsApp, LINE, Slack, Discord).
 */
export const channelConnections = pgTable("channel_connections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelType: text("channelType").notNull(),
  externalUserId: text("externalUserId").notNull(),
  externalChatId: text("externalChatId"),
  connectionConfig: jsonb("connectionConfig").default({}),
  status: text("status").notNull().default("pending"),
  activeChannelId: varchar("activeChannelId", { length: 36 }),
  linkedAt: timestamp("linkedAt", { withTimezone: true }).defaultNow().notNull(),
  linkedBy: varchar("linkedBy", { length: 20 }),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  revokedBy: varchar("revokedBy", { length: 36 }),
}, (t) => [
  uniqueIndex("channel_connections_tenant_type_user_unique").on(t.tenantId, t.channelType, t.externalUserId),
  index("channel_connections_tenant_type_status_idx").on(t.tenantId, t.channelType, t.status),
  index("channel_connections_tenant_user_idx").on(t.tenantId, t.userId),
  check("channel_connections_type_check", sql`"channelType" IN ('telegram','whatsapp','line','slack','discord')`),
  check("channel_connections_status_check", sql`"status" IN ('active','revoked','pending','blocked')`),
]);

export type ChannelConnection = typeof channelConnections.$inferSelect;
export type InsertChannelConnection = typeof channelConnections.$inferInsert;

/**
 * Channel Credentials -- Admin-configured per-tenant channel secrets
 * (bot tokens, API keys, webhook secrets). Encrypted via crypto.ts.
 */
export const channelCredentials = pgTable("channel_credentials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  channelType: text("channelType").notNull(),
  credentialsEncrypted: text("credentialsEncrypted").notNull(),
  webhookUrl: text("webhookUrl"),
  webhookSecretEncrypted: text("webhookSecretEncrypted"),
  isActive: boolean("isActive").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("channel_credentials_tenant_type_unique").on(t.tenantId, t.channelType),
  check("channel_credentials_type_check", sql`"channelType" IN ('telegram','whatsapp','line','slack','discord')`),
]);

export type ChannelCredential = typeof channelCredentials.$inferSelect;
export type InsertChannelCredential = typeof channelCredentials.$inferInsert;

// ==========================================
// ClawFeature: Chat Widget & Artifacts
// ==========================================

/**
 * Chat Widgets -- Embeddable chat widget configurations per tenant.
 */
export const chatWidgets = pgTable("chat_widgets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetType: text("targetType"),
  targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(() => agencies.id, { onDelete: "set null" }),
  defaultPersonaId: varchar("defaultPersonaId", { length: 36 }).references(() => personaTemplates.id, { onDelete: "set null" }),
  theme: jsonb("theme"),
  allowedOrigins: text("allowedOrigins").array().default(sql`'{}'`),
  rateLimitPerMinute: integer("rateLimitPerMinute").default(10),
  maxConversationLength: integer("maxConversationLength").default(100),
  requireEmail: boolean("requireEmail").default(false),
  creditSource: text("creditSource"),
  monthlyCreditBudget: integer("monthlyCreditBudget"),
  maxCreditsPerVisitorSession: integer("maxCreditsPerVisitorSession").default(50),
  maxCreditsPerVisitorDay: integer("maxCreditsPerVisitorDay").default(100),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("chat_widgets_tenant_active_idx").on(t.tenantId, t.isActive),
  check("chat_widgets_target_type_check", sql`"targetType" IN ('chat','agency') OR "targetType" IS NULL`),
  check("chat_widgets_credit_source_check", sql`"creditSource" IN ('tenant','visitor') OR "creditSource" IS NULL`),
]);

export type ChatWidget = typeof chatWidgets.$inferSelect;
export type InsertChatWidget = typeof chatWidgets.$inferInsert;

/**
 * Conversation Artifacts -- Versioned AI-generated artifacts
 * (code, charts, tables, React components, HTML) stored per conversation.
 */
export const conversationArtifacts = pgTable("conversation_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: integer("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  messageId: integer("messageId").notNull().references(() => messages.id, { onDelete: "cascade" }),
  artifactType: text("artifactType").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  language: text("language"),
  version: integer("version").default(1),
  parentArtifactId: varchar("parentArtifactId", { length: 36 })
    .references((): AnyPgColumn => conversationArtifacts.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("conversation_artifacts_conversation_idx").on(t.conversationId),
  index("conversation_artifacts_message_idx").on(t.messageId),
  check("conversation_artifacts_type_check", sql`"artifactType" IN ('code','react','chart','table','mermaid','html','markdown','svg')`),
]);

export type ConversationArtifact = typeof conversationArtifacts.$inferSelect;
export type InsertConversationArtifact = typeof conversationArtifacts.$inferInsert;

// ==========================================
// ClawFeature: Webhooks & Routing
// ==========================================

/**
 * Webhook Triggers -- Inbound webhook endpoints for external integrations.
 * Auth secrets are AES-256-GCM encrypted via crypto.ts.
 */
export const webhookTriggers = pgTable("webhook_triggers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  authType: text("authType").notNull().default("token"),
  authSecretEncrypted: text("authSecretEncrypted").notNull(),
  targetType: text("targetType").notNull(),
  targetConversationId: integer("targetConversationId").references(() => conversations.id, { onDelete: "set null" }),
  targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(() => agencies.id, { onDelete: "set null" }),
  targetWorkflowId: integer("targetWorkflowId").references(() => workflows.id, { onDelete: "set null" }),
  payloadTemplate: jsonb("payloadTemplate").default({}),
  rateLimitPerMinute: integer("rateLimitPerMinute").default(10),
  monthlyTriggerBudget: integer("monthlyTriggerBudget"),
  isActive: boolean("isActive").default(true),
  totalTriggers: integer("totalTriggers").default(0),
  lastTriggeredAt: timestamp("lastTriggeredAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("webhook_triggers_tenant_active_idx").on(t.tenantId, t.isActive),
  check("webhook_triggers_auth_type_check", sql`"authType" IN ('token','hmac_sha256')`),
  check("webhook_triggers_target_type_check", sql`"targetType" IN ('chat','agency','workflow')`),
]);

export type WebhookTrigger = typeof webhookTriggers.$inferSelect;
export type InsertWebhookTrigger = typeof webhookTriggers.$inferInsert;

/**
 * Webhook Trigger Logs -- Append-heavy log of webhook invocations.
 */
export const webhookTriggerLogs = pgTable("webhook_trigger_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  triggerId: varchar("triggerId", { length: 36 }).notNull().references(() => webhookTriggers.id, { onDelete: "cascade" }),
  requestMethod: text("requestMethod"),
  requestHeadersSafe: jsonb("requestHeadersSafe"),
  requestBodyHash: varchar("requestBodyHash", { length: 64 }),
  requestBodySize: integer("requestBodySize"),
  extractedVariables: jsonb("extractedVariables"),
  sourceIpMasked: text("sourceIpMasked"),
  status: text("status").notNull(),
  targetExecutionId: text("targetExecutionId"),
  creditsConsumed: numeric("creditsConsumed", { precision: 12, scale: 4 }).default("0"),
  errorMessage: text("errorMessage"),
  processingTimeMs: integer("processingTimeMs"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("webhook_trigger_logs_trigger_created_idx").on(t.triggerId, t.createdAt),
  check("webhook_trigger_logs_status_check", sql`"status" IN ('success','auth_failed','rate_limited','target_error','credit_insufficient')`),
]);

export type WebhookTriggerLog = typeof webhookTriggerLogs.$inferSelect;
export type InsertWebhookTriggerLog = typeof webhookTriggerLogs.$inferInsert;

/**
 * Channel Routing Rules -- Priority-ordered rules for routing inbound
 * channel messages to agencies, conversations, or workflows.
 */
export const channelRoutingRules = pgTable("channel_routing_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  priority: integer("priority").default(50),
  isActive: boolean("isActive").default(true),
  conditions: jsonb("conditions").notNull(),
  targetType: text("targetType").notNull(),
  targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(() => agencies.id, { onDelete: "set null" }),
  targetPersonaId: varchar("targetPersonaId", { length: 36 }).references(() => personaTemplates.id, { onDelete: "set null" }),
  targetWorkflowId: integer("targetWorkflowId").references(() => workflows.id, { onDelete: "set null" }),
  totalMatches: integer("totalMatches").default(0),
  lastMatchedAt: timestamp("lastMatchedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("channel_routing_rules_tenant_active_priority_idx").on(t.tenantId, t.isActive, t.priority),
  check("channel_routing_rules_target_type_check", sql`"targetType" IN ('agency','chat','workflow')`),
])

export type ChannelRoutingRule = typeof channelRoutingRules.$inferSelect;
export type InsertChannelRoutingRule = typeof channelRoutingRules.$inferInsert;

// ── Automation Copilot ────────────────────────────────────────────────

export const automationTemplates = pgTable("automation_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  intent: jsonb("intent").notNull(),
  scripts: jsonb("scripts").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  isPublic: boolean("is_public").default(false).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("automation_templates_tenant_idx").on(t.tenantId),
  index("automation_templates_public_usage_idx").on(t.isPublic, t.usageCount),
]);

export type AutomationTemplate = typeof automationTemplates.$inferSelect;
export type InsertAutomationTemplate = typeof automationTemplates.$inferInsert;
