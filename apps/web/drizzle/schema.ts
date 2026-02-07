import { integer, pgEnum, pgTable, text, timestamp, varchar, json, boolean, numeric, serial, uniqueIndex, index } from "drizzle-orm/pg-core";

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
  currentTenantId: integer("currentTenantId").references(() => tenants.id),

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
  }>().default({}),

  // Recovery contacts
  backupEmail: varchar("backupEmail", { length: 320 }),
  backupEmailVerified: boolean("backupEmailVerified").default(false).notNull(),
  phone: varchar("phone", { length: 20 }),
  phoneVerified: boolean("phoneVerified").default(false).notNull(),

  // Two-Factor Authentication
  twoFactorEnabled: boolean("twoFactorEnabled").default(false).notNull(),
  twoFactorSecret: text("twoFactorSecret"), // encrypted TOTP secret (base32)
  recoveryCodes: json("recoveryCodes").$type<string[]>().default([]), // bcrypt-hashed one-time codes

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
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

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

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
  ownerId: integer("ownerId").references(() => users.id),

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
    type: "hero" | "features" | "testimonials" | "cta" | "content" | "gallery" | "pricing" | "faq" | "team" | "contact" | "custom";
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

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

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
    type: "code" | "markdown" | "image" | "video" | "pdf" | "file" | "slideshow" | "chart" | "table";
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

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

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
 * Skill Category Enum
 * Categorizes skills for filtering and organization
 */
export const skillCategoryEnum = pgEnum("skill_category", [
  "image_generation",      // Generate Images
  "video_generation",      // Generate Video
  "image_video_generation", // Generate both Image and Video
  "audio_generation",      // Generate Text To Speech
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

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type Skill = typeof skills.$inferSelect;
export type InsertSkill = typeof skills.$inferInsert;

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
});

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
