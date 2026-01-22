import { integer, pgEnum, pgTable, text, timestamp, varchar, json, boolean, numeric, serial } from "drizzle-orm/pg-core";

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
export const contentTypeEnum = pgEnum("content_type", ["image", "video", "website"]);
export const aspectRatioEnum = pgEnum("aspect_ratio", ["1:1", "9:16", "16:9"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const entityTypeEnum = pgEnum("entity_type", ["user", "project", "preference", "technical"]);

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
 */
export const creditPackages = pgTable("credit_packages", {
  id: serial("id").primaryKey(),

  /** Package name */
  name: varchar("name", { length: 128 }).notNull(),

  /** Package description */
  description: text("description"),

  /** Number of credits in package */
  credits: integer("credits").notNull(),

  /** Price in USD (stored as numeric for precision) */
  priceUsd: numeric("priceUsd", { precision: 10, scale: 2 }).notNull(),

  /** Stripe Price ID for checkout */
  stripePriceId: varchar("stripePriceId", { length: 128 }),

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

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type LlmProvider = typeof llmProviders.$inferSelect;
export type InsertLlmProvider = typeof llmProviders.$inferInsert;

/**
 * Tenants table - White Label Multi-Tenant System
 * Each tenant represents a separate branded instance with its own domain
 */
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),

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

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

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

  /** Total credits used in this conversation */
  totalCreditsUsed: numeric("totalCreditsUsed", { precision: 12, scale: 4 }).default("0"),

  /** Total messages count */
  messageCount: integer("messageCount").default(0).notNull(),

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

  /** Confidence score (0-1) */
  confidence: numeric("confidence", { precision: 3, scale: 2 }).default("0.8"),

  /** Last time this memory was accessed */
  lastAccessedAt: timestamp("lastAccessedAt", { withTimezone: true }).defaultNow(),

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
