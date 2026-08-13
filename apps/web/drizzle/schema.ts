import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  json,
  jsonb,
  boolean,
  numeric,
  serial,
  uniqueIndex,
  index,
  foreignKey,
  bigint,
  bigserial,
  check,
  doublePrecision,
  real,
  type AnyPgColumn,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  LocalAiConversationOverride,
  LocalAiSyncedPreferences,
  MessageRuntimeMetadata,
  TeamRoomMessageMetadata,
} from "../../../packages/local-ai-core/src/index";
import type {
  AutoTeamCapabilityFamily,
  AutoTeamFinalResultStatus,
  AutoTeamMediaType,
  AutoTeamRouteClass,
  AutoTeamStageStatus,
  AutoTeamStageType,
} from "../shared/autoTeamExecution";
import type { HermesConnectionCapabilityManifest } from "../shared/hermesMedia";

/**
 * pgvector custom column type for 1536-dimension embeddings (OpenAI text-embedding-3-small).
 * Defined early so both agency and scoped memory tables can reuse it.
 */
const vector1536 = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    return typeof value === "string" ? JSON.parse(value) : (value as number[]);
  },
});

/**
 * Enums
 */
export const roleEnum = pgEnum("role", [
  "user",
  "admin",
  "domain_admin",
  "system_agent",
]);
export const inviteCodeTypeEnum = pgEnum("invite_code_type", ["admin", "user"]);
export const planEnum = pgEnum("plan", [
  "free",
  "starter",
  "pro",
  "enterprise",
]);
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
export const packageTypeEnum = pgEnum("package_type", [
  "one_time",
  "subscription",
  "agency",
]);

// Billing period for subscription packages
export const billingPeriodEnum = pgEnum("billing_period", [
  "monthly",
  "quarterly",
  "semi_annual",
  "yearly",
]);
export const contentTypeEnum = pgEnum("content_type", [
  "image",
  "video",
  "website",
]);
export const aspectRatioEnum = pgEnum("aspect_ratio", ["1:1", "9:16", "16:9"]);
export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
]);
export const entityTypeEnum = pgEnum("entity_type", [
  "user",
  "project",
  "preference",
  "technical",
  "decision",
  "plan",
  "architecture",
  "component",
  "task",
  "code_knowledge",
  "rule",
  "fact",
  "goal",
  "insight",
  "context",
  "relationship",
  "process",
  "constraint",
  "reference",
  "note",
  "checklist",
  "artifact_note",
  "handoff_note",
  "episode",
]);

// API style for different LLM provider endpoints (OpenCode Zen uses different endpoints per model family)
export const apiStyleEnum = pgEnum("api_style", [
  "chat-completions",
  "responses",
  "messages",
  "gemini",
]);

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
  "private", // Only owner + assigned groups can use
  "pending_approval", // Owner requested public, awaiting admin approval
  "public", // Admin approved, visible to all tenant users
  "rejected", // Admin rejected public request
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
export const mediaCallbackEventStatusEnum = pgEnum(
  "media_callback_event_status",
  ["pending", "processing", "retry_pending", "completed", "failed"]
);

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

export const liveBrowserSourceTypeEnum = pgEnum("live_browser_source_type", [
  "automation",
  "workflow",
  "agency",
]);

export const liveBrowserSessionStatusEnum = pgEnum(
  "live_browser_session_status",
  [
    "created",
    "provisioning",
    "ready",
    "agent_running",
    "waiting_for_human",
    "human_controlling",
    "waiting_for_runtime_recovery",
    "failed_recovery_required",
    "completed",
    "cancelled",
    "failed",
    "expired",
  ]
);

export const liveBrowserControlModeEnum = pgEnum("live_browser_control_mode", [
  "observe",
  "approve_only",
  "takeover",
  "agent_control",
]);

export const liveBrowserAssistRequestTypeEnum = pgEnum(
  "live_browser_assist_request_type",
  ["decision", "field_input", "review_page", "takeover_required"]
);

export const liveBrowserActorTypeEnum = pgEnum("live_browser_actor_type", [
  "agent",
  "user",
  "system",
  "policy",
]);

export const liveBrowserEventTypeEnum = pgEnum("live_browser_event_type", [
  "session_created",
  "session_state_changed",
  "stream_ready",
  "frame_updated",
  "url_changed",
  "command_queued",
  "command_started",
  "command_completed",
  "command_failed",
  "assist_requested",
  "assist_resolved",
  "approval_requested",
  "approval_resolved",
  "takeover_started",
  "takeover_lease_expiring",
  "takeover_ended",
  "incident",
  "agent_started",
  "agent_resumed",
  "navigation_completed",
  "session_completed",
  "session_failed",
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
  "worker_runtime",
  "widget_chat",
  "webhook_chat",
  "webhook_trigger",
  // Public API (feature 043)
  "api_skill",
  "api_agency",
  "api_job",
  "api_media",
  "api_presentation",
  "api_video_project",
  "api_chat",
  "api_mcp",
  "voice_agent",
]);

export const voiceAgentProviderEnum = pgEnum("voice_agent_provider", [
  "elevenlabs",
]);
export const voiceAgentSurfaceEnum = pgEnum("voice_agent_surface", [
  "chat",
  "work_os",
  "team_room",
  "agency",
]);
export const voiceAgentConnectionTypeEnum = pgEnum(
  "voice_agent_connection_type",
  ["webrtc_token", "websocket_signed_url", "server_relay"]
);
export const voiceAgentSessionStatusEnum = pgEnum(
  "voice_agent_session_status",
  ["created", "connecting", "active", "ended", "failed", "cancelled"]
);
export const voiceAgentBillingStatusEnum = pgEnum(
  "voice_agent_billing_status",
  ["reserved", "settled", "released", "failed"]
);
export const voiceAgentEventSourceEnum = pgEnum("voice_agent_event_source", [
  "user",
  "agent",
  "tool",
  "system",
]);
export const voiceAgentRedactionStatusEnum = pgEnum(
  "voice_agent_redaction_status",
  ["not_required", "redacted", "failed"]
);
export const voiceAgentToolCallStatusEnum = pgEnum(
  "voice_agent_tool_call_status",
  ["received", "denied", "queued", "running", "completed", "failed"]
);

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
  "code",
  "command",
  "browser",
  "file",
  "media",
]);

export const sandboxJobStatusEnum = pgEnum("sandbox_job_status", [
  "accepted",
  "policy_resolved",
  "queued",
  "provisioning",
  "staging_inputs",
  "executing",
  "collecting_outputs",
  "persisting",
  "completed",
  "failed",
  "timed_out",
  "canceled",
]);

export const sandboxArtifactTypeEnum = pgEnum("sandbox_artifact_type", [
  "primary",
  "log",
  "screenshot",
  "thumbnail",
  "chunk",
  "debug",
]);

export const sandboxNetworkActionEnum = pgEnum("sandbox_network_action", [
  "deny",
  "allow",
]);

export const sandboxFeatureTypeEnum = pgEnum("sandbox_feature_type", [
  "chat",
  "skill",
  "workflow",
  "library",
  "media",
  "presentation",
  "connector",
  "agency",
]);

export const desktopDeviceHealthStatusEnum = pgEnum(
  "desktop_device_health_status",
  ["online", "offline", "unhealthy", "disabled"]
);

export const marketplacePlatformEnum = pgEnum("marketplace_platform", [
  "shopee",
  "tiktok_shop",
]);

export const marketplacePageTypeEnum = pgEnum("marketplace_page_type", [
  "product",
  "category",
  "search",
  "shop",
  "unknown",
]);

export const marketplaceCaptureStatusEnum = pgEnum(
  "marketplace_capture_status",
  [
    "captured",
    "uploading_assets",
    "analyzing",
    "analyzed",
    "confirmed",
    "failed",
    "discarded",
  ]
);

export const marketplaceAssetKindEnum = pgEnum("marketplace_asset_kind", [
  "screenshot",
  "main_image",
  "description_image",
  "review_image",
  "html_snapshot",
  "raw_payload",
  "category_grid_screenshot",
]);

export const marketplaceProductImageTypeEnum = pgEnum(
  "marketplace_product_image_type",
  ["main", "description", "review", "related_excluded"]
);

export const marketplacePairingStatusEnum = pgEnum(
  "marketplace_pairing_status",
  ["active", "revoked", "expired"]
);

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
  currentTenantId: integer("currentTenantId").references(
    (): AnyPgColumn => tenants.id
  ),

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
  userPreferences: json("userPreferences")
    .$type<{
      translationLanguage?: string;
      translationModel?: string;
      privateVault?: {
        enabled?: boolean;
        pinHash?: string;
        pinVersion?: number;
        pinUpdatedAt?: string;
      };
      safetyProfile?: {
        dateOfBirth?: string;
        dateOfBirthUpdatedAt?: string;
        dateOfBirthChangeCount?: number;
        countryOfResidence?: string;
        countryOfResidenceUpdatedAt?: string;
        countryOfResidenceChangeCount?: number;
        jurisdictionPresetId?: string;
        profileVersion?: number;
        completedAt?: string;
      };
      securityPin?: {
        enabled?: boolean;
        pinHash?: string;
        pinVersion?: number;
        pinUpdatedAt?: string;
        failedAttempts?: number;
        lockedUntil?: string;
      };
      telegramNotifyLevel?: "all" | "high_critical" | "critical_only" | "off";
      telegramDeliveryFailing?: boolean;
      automationPolicy?: {
        enabled?: boolean;
        modeCap?:
          | "observe"
          | "read_only"
          | "draft"
          | "commit"
          | "expanded"
          | null;
        allowedDomainsSubset?: string[];
        blockedTransfers?: Array<
          "download" | "upload" | "clipboard" | "external_send"
        >;
        requireApprovalForActionClasses?: Array<
          "read" | "draft" | "commit" | "restricted"
        >;
        approvalTtlSecondsCap?: number | null;
        preferredVisionModel?: string | null;
        notifyOnApprovalRequests?: boolean;
        notifyOnPolicyIncidents?: boolean;
      };
      localAi?: LocalAiSyncedPreferences;
    }>()
    .default({}),

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
  defaultPersonaId: varchar("defaultPersonaId", { length: 36 }).references(
    (): AnyPgColumn => personaTemplates.id,
    { onDelete: "set null" }
  ),

  /** Whether this is a system/virtual user (not a human login) */
  isSystemUser: boolean("isSystemUser").default(false),

  /** PDPA/GDPR voice consent: NULL = not consented, timestamp = when consent was given */
  voiceConsentGrantedAt: timestamp("voiceConsentGrantedAt", {
    withTimezone: true,
  }),

  /** Invite code used during registration */
  referredByInviteCodeId: integer("referredByInviteCodeId").references(
    (): AnyPgColumn => inviteCodes.id,
    { onDelete: "set null" }
  ),

  /** Reason for account disable (null = not disabled or no specific reason) */
  disabledReason: varchar("disabledReason", { length: 64 }),

  /** Last time user consumed credits (for inactivity detection) */
  lastCreditUsedAt: timestamp("lastCreditUsedAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true })
    .defaultNow()
    .notNull(),
  passwordChangedAt: timestamp("passwordChangedAt", { withTimezone: true }),
}, t => [
  uniqueIndex("users_email_lower_trim_unique")
    .on(sql`lower(btrim(${t.email}))`)
    .where(sql`${t.email} IS NOT NULL`),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Credit transactions table - tracks all credit movements
 * Used for billing, usage tracking, and audit trail
 */
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: serial("id").primaryKey(),

    /** User who owns this transaction */
    userId: integer("userId")
      .notNull()
      .references(() => users.id),

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
    conversationId: integer("conversationId").references(
      () => conversations.id,
      { onDelete: "set null" }
    ),

    /** Skill slug used for this transaction (nullable) */
    skillSlug: varchar("skillSlug", { length: 128 }),

    /** Source type categorizing what generated this transaction */
    sourceType: creditSourceTypeEnum("sourceType"),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("credit_transactions_idempotency_key_unique")
      .on(t.idempotencyKey)
      .where(sql`"idempotencyKey" IS NOT NULL`),
    index("credit_transactions_type_created_idx").on(t.type, t.createdAt),
    index("credit_transactions_trace_id_idx").on(t.traceId),
    index("credit_transactions_conversation_id_idx").on(t.conversationId),
    index("credit_transactions_source_type_idx").on(t.sourceType),
  ]
);

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
  tenantId: integer("tenantId").references(() => tenants.id, {
    onDelete: "cascade",
  }),

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
  availableModels: json("availableModels").$type<
    Array<{
      id: string;
      name: string;
      contextLength?: number;
      createdAt?: number;
      pricing?: { input: number; output: number };
      apiStyle?: "chat-completions" | "responses" | "messages" | "gemini";
      ownedBy?: string;
      surface?:
        | "chat"
        | "embedding"
        | "parse"
        | "guardrail"
        | "reward"
        | "translation"
        | "multimodal"
        | "other";
      executionMode?: "public" | "internal-only" | "deferred";
      autoSelectionEligible?: boolean;
      embeddingDimension?: number;
      supportsVision?: boolean;
      supportsThinking?: boolean;
      supportsWebSearch?: boolean;
      supportsFunctionTools?: boolean;
      supportsStructuredOutputs?: boolean;
      supportsJsonMode?: boolean;
      supportsStrictToolSchema?: boolean;
      supportsCodeExecution?: boolean;
      supportsComputerUse?: boolean;
      supportsBackground?: boolean;
      supportsResponses?: boolean;
      config?: {
        requestBodyFormat?:
          | "responses"
          | "anthropic-messages"
          | "openai-chat-completions";
        apiEndpoint?: string;
        apiEndpointTemplate?: string;
        authStrategy?: "provider-default";
        supportsStreaming?: boolean;
        inputFields?: Array<{
          key: string;
          label: string;
          type:
            | "boolean"
            | "number"
            | "text"
            | "select"
            | "json"
            | "messages"
            | "input"
            | "tools";
          required?: boolean;
          documented?: boolean;
          default?: string | number | boolean;
          options?: Array<{ value: string; label: string }>;
          description?: string;
        }>;
        passthroughFields?: string[];
        conflicts?: Array<{ type: "xor"; fields: string[] }>;
      };
    }>
  >(),

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
  providerType: varchar("providerType", { length: 32 })
    .default("primary")
    .notNull(),

  /** Health status managed by circuit breaker, persisted for dashboard and startup seeding */
  healthStatus: varchar("healthStatus", { length: 32 })
    .default("healthy")
    .notNull(),

  /** Last time health was evaluated */
  lastHealthCheck: timestamp("lastHealthCheck", { withTimezone: true }),

  /** Rolling failure count */
  failureCount: integer("failureCount").default(0).notNull(),

  /** Rolling success count */
  successCount: integer("successCount").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type LlmProvider = typeof llmProviders.$inferSelect;
export type InsertLlmProvider = typeof llmProviders.$inferInsert;

/**
 * Model-to-provider mapping
 * Maps which providers offer which models, replacing the availableModels JSON approach
 */
export const modelProviderMap = pgTable(
  "model_provider_map",
  {
    id: serial("id").primaryKey(),

    /** Canonical model identifier used internally by frontend/routing */
    modelId: varchar("modelId", { length: 128 }).notNull(),

    /** Foreign key to llm_providers */
    providerId: integer("providerId")
      .notNull()
      .references(() => llmProviders.id),

    /** Human-readable display name */
    modelName: varchar("modelName", { length: 128 }).notNull(),

    /** Provider-specific model string sent in API requests */
    providerModelId: varchar("providerModelId", { length: 256 }).notNull(),

    /** Historical modelId aliases preserved when duplicate upstream mappings are consolidated */
    legacyModelAliases: jsonb("legacyModelAliases")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),

    /** Cost per 1M input tokens (0 for free) */
    pricingInput: numeric("pricingInput", { precision: 12, scale: 8 })
      .default("0")
      .notNull(),

    /** Cost per 1M output tokens (0 for free) */
    pricingOutput: numeric("pricingOutput", { precision: 12, scale: 8 })
      .default("0")
      .notNull(),

    /** Whether this model is free to use */
    isFree: boolean("isFree").default(false).notNull(),

    /** Maximum context window size */
    contextLength: integer("contextLength"),

    // ── Capability metadata (for planner-based model selection) ──

    /** Supports OpenAI Responses API */
    supportsResponses: boolean("supportsResponses").default(false),

    /** Supports strict schema-constrained final responses */
    supportsStructuredOutputs: boolean("supportsStructuredOutputs").default(
      false
    ),

    /** Supports valid JSON mode without strict schema adherence */
    supportsJsonMode: boolean("supportsJsonMode").default(false),

    /** Supports strict schema validation for tool/function arguments */
    supportsStrictToolSchema: boolean("supportsStrictToolSchema").default(
      false
    ),

    /** Supports built-in web search */
    supportsWebSearch: boolean("supportsWebSearch").default(false),

    /** Supports function/tool calling */
    supportsFunctionTools: boolean("supportsFunctionTools").default(false),

    /** Supports code execution sandbox */
    supportsCodeExecution: boolean("supportsCodeExecution").default(false),

    /** Supports computer use / browser automation */
    supportsComputerUse: boolean("supportsComputerUse").default(false),

    /** Supports background/async processing */
    supportsBackground: boolean("supportsBackground").default(false),

    /** Supports vision / image input */
    supportsVision: boolean("supportsVision").default(false),

    /** Supports thinking/reasoning mode (chain-of-thought) */
    supportsThinking: boolean("supportsThinking").default(false),

    /** Whether priority was manually set by admin (locks against auto-reassignment) */
    priorityLocked: boolean("priorityLocked").default(false),

    /**
     * Admin-curated quality flag: this model has been vetted as genuinely
     * strong for complex/quality-critical work. Skills opt in via
     * execution_policy.requirements.recommendedOnly — selection then draws
     * ONLY from this set (still admin-enabled, still ranked by priority).
     * Capability flags describe what a model CAN do; this flag records the
     * human judgment that it does it WELL.
     */
    isRecommended: boolean("isRecommended").default(false).notNull(),

    /**
     * Quality circuit breaker for the recommended set: MODEL-ATTRIBUTABLE
     * skill-output failures (contract violations / quality disqualifiers —
     * never transport, ledger, or provider-balance errors) accumulate as
     * strikes inside a sliding window; crossing the threshold auto-revokes
     * isRecommended (never the last member of the set) and records why.
     * Re-recommendation is a deliberate human action in the admin UI.
     */
    recommendedStrikeCount: integer("recommendedStrikeCount").default(0).notNull(),
    recommendedStrikeWindowStartedAt: timestamp("recommendedStrikeWindowStartedAt", { withTimezone: true }),
    recommendedAutoRevokedAt: timestamp("recommendedAutoRevokedAt", { withTimezone: true }),
    recommendedAutoRevokedReason: text("recommendedAutoRevokedReason"),

    /** Whether this mapping is active */
    isEnabled: boolean("isEnabled").default(true).notNull(),

    /** Lower = higher priority within this provider */
    priority: integer("priority").default(0).notNull(),

    /** API style for endpoint routing (only used for providers like OpenCode Zen with multiple endpoints) */
    apiStyle: apiStyleEnum("apiStyle").default("chat-completions").notNull(),
  },
  t => [
    uniqueIndex("model_provider_map_unique").on(t.modelId, t.providerId),
    uniqueIndex("model_provider_map_provider_model_unique").on(
      t.providerId,
      t.providerModelId
    ),
  ]
);

export type ModelProviderMap = typeof modelProviderMap.$inferSelect;
export type InsertModelProviderMap = typeof modelProviderMap.$inferInsert;

/**
 * Provider usage log
 * Per-request tracking for dashboards and cost reconciliation
 */
export const providerUsageLog = pgTable(
  "provider_usage_log",
  {
    id: serial("id").primaryKey(),

    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    providerId: integer("providerId")
      .notNull()
      .references(() => llmProviders.id),
    modelUsed: varchar("modelUsed", { length: 128 }).notNull(),
    inputTokens: integer("inputTokens").default(0).notNull(),
    outputTokens: integer("outputTokens").default(0).notNull(),

    /** Provider-reported or calculated cost */
    costUsd: numeric("costUsd", { precision: 12, scale: 8 })
      .default("0")
      .notNull(),

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
    fallbackFromProviderId: integer("fallbackFromProviderId").references(
      () => llmProviders.id
    ),

    /** API key that triggered this LLM usage (nullable) */
    apiKeyId: varchar("apiKeyId", { length: 36 }),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("provider_usage_log_user_created").on(t.userId, t.createdAt),
    index("provider_usage_log_provider_created").on(t.providerId, t.createdAt),
    index("provider_usage_log_trace_id").on(t.traceId),
  ]
);

export type ProviderUsageLog = typeof providerUsageLog.$inferSelect;
export type InsertProviderUsageLog = typeof providerUsageLog.$inferInsert;

/**
 * API audit events
 * Structured logging for media/skill/LLM requests with trace correlation
 */
export const apiAuditEvents = pgTable(
  "api_audit_events",
  {
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

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("api_audit_events_trace_id").on(t.traceId),
    index("api_audit_events_user_created").on(t.userId, t.createdAt),
    index("api_audit_events_type_created").on(t.eventType, t.createdAt),
  ]
);

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
  defaultPersonaId: varchar("defaultPersonaId", { length: 36 }).references(
    (): AnyPgColumn => personaTemplates.id,
    { onDelete: "set null" }
  ),

  /** Feature flags for this tenant */
  featureFlags: json("featureFlags").$type<Record<string, boolean>>(),

  /** Tenant status (from Python backend) */
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),

  /** Tenant plan (from Python backend) */
  plan: varchar("plan", { length: 20 }).notNull().default("FREE"),

  /** Created at (snake_case, from Python backend) */
  created_at: timestamp("created_at").defaultNow().notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

export const desktopDevices = pgTable(
  "desktop_devices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references((): AnyPgColumn => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    displayName: varchar("displayName", { length: 255 }).notNull(),
    machineName: varchar("machineName", { length: 255 }),
    healthStatus: desktopDeviceHealthStatusEnum("healthStatus")
      .notNull()
      .default("offline"),
    workerProjectionEnabled: boolean("workerProjectionEnabled")
      .notNull()
      .default(false),
    projectedWorkerRuntimeType: varchar("projectedWorkerRuntimeType", {
      length: 64,
    }),
    platform: jsonb("platform")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    capabilitiesJson: jsonb("capabilitiesJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    healthSummaryJson: jsonb("healthSummaryJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    localRootsJson: jsonb("localRootsJson")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    packageCachePathsJson: jsonb("packageCachePathsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    packageSyncStateJson: jsonb("packageSyncStateJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    pendingActionsJson: jsonb("pendingActionsJson")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    currentWorkspaceProfileJson: jsonb("currentWorkspaceProfileJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastRunSummaryJson: jsonb("lastRunSummaryJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    accessState: varchar("accessState", { length: 32 })
      .notNull()
      .default("active"),
    policyOverridesJson: jsonb("policyOverridesJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    policyCursor: varchar("policyCursor", { length: 128 }),
    policyVersion: varchar("policyVersion", { length: 128 }),
    policyExpiresAt: timestamp("policyExpiresAt", { withTimezone: true }),
    warningFlagsJson: jsonb("warningFlagsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    enrolledAt: timestamp("enrolledAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }),
    disabledAt: timestamp("disabledAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => ({
    tenantDeviceIdx: index("desktop_devices_tenant_id_idx").on(t.tenantId),
    tenantUserIdx: index("desktop_devices_tenant_user_idx").on(
      t.tenantId,
      t.userId
    ),
  })
);

export type DesktopDevice = typeof desktopDevices.$inferSelect;
export type InsertDesktopDevice = typeof desktopDevices.$inferInsert;

/**
 * User Groups - Custom groups for file sharing and collaboration
 */
export const userGroups = pgTable(
  "user_groups",
  {
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
    settings: json("settings")
      .$type<{
        visibility: "private" | "public";
        joinPolicy: "invite_only" | "request_to_join" | "open";
      }>()
      .notNull()
      .default(
        sql`'{"visibility":"private","joinPolicy":"invite_only"}'::json`
      ),
    memberCount: integer("member_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  t => [
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
  ]
);

export type UserGroup = typeof userGroups.$inferSelect;
export type InsertUserGroup = typeof userGroups.$inferInsert;

/**
 * Group Members - User membership in groups
 */
export const groupMembers = pgTable(
  "group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => userGroups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("member"), // "admin" | "member"
    addedBy: integer("added_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 32 }).notNull().default("active"), // "active" | "pending" | "removed"
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  t => [
    // One membership per user per group
    uniqueIndex("group_members_group_user_unique").on(t.groupId, t.userId),

    // Partial indexes for active memberships only (huge performance gain)
    index("group_members_group_active_idx")
      .on(t.groupId)
      .where(sql`status = 'active'`),
    index("group_members_user_active_idx")
      .on(t.userId)
      .where(sql`status = 'active'`),
  ]
);

export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = typeof groupMembers.$inferInsert;

/**
 * MCP Connect provider templates, user connections, sharing policy, schema cache, usage audit, and shared video approvals.
 */
export const mcpProviderTemplates = pgTable(
  "mcp_provider_templates",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    providerKey: varchar("provider_key", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    mcpUrl: text("mcp_url").notNull(),
    authType: varchar("auth_type", { length: 32 }).notNull().default("oauth"),
    allowedAssetTypes: jsonb("allowed_asset_types")
      .$type<Array<"image" | "video">>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    expectedToolHints: jsonb("expected_tool_hints")
      .$type<Record<string, string[]>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    isEnabled: boolean("is_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex("mcp_provider_templates_provider_key_unique").on(t.providerKey),
    uniqueIndex("mcp_provider_templates_mcp_url_unique").on(t.mcpUrl),
    index("mcp_provider_templates_enabled_idx").on(t.isEnabled),
  ]
);

export const userMcpConnections = pgTable(
  "user_mcp_connections",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerTemplateId: varchar("provider_template_id", { length: 36 })
      .notNull()
      .references(() => mcpProviderTemplates.id, { onDelete: "restrict" }),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("connected"),
    encryptedTokenRef: text("encrypted_token_ref"),
    encryptionKeyVersion: varchar("encryption_key_version", { length: 64 }),
    providerAccountLabel: text("provider_account_label"),
    providerAccountHash: varchar("provider_account_hash", { length: 128 }),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: jsonb("scopes").$type<string[]>(),
    lastErrorCode: varchar("last_error_code", { length: 128 }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastHealthCheckAt: timestamp("last_health_check_at", {
      withTimezone: true,
    }),
    lastToolDiscoveryAt: timestamp("last_tool_discovery_at", {
      withTimezone: true,
    }),
    defaultForImage: boolean("default_for_image").notNull().default(false),
    defaultForVideo: boolean("default_for_video").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  t => [
    index("user_mcp_connections_tenant_owner_status_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.status
    ),
    index("user_mcp_connections_tenant_provider_status_idx").on(
      t.tenantId,
      t.providerTemplateId,
      t.status
    ),
    index("user_mcp_connections_provider_account_hash_idx").on(
      t.tenantId,
      t.providerTemplateId,
      t.providerAccountHash
    ),
    index("user_mcp_connections_token_expires_at_idx").on(t.tokenExpiresAt),
    uniqueIndex("user_mcp_connections_default_image_unique")
      .on(t.tenantId, t.ownerUserId, t.providerTemplateId)
      .where(
        sql`default_for_image = true AND status IN ('connected', 'requires_reauth', 'error')`
      ),
    uniqueIndex("user_mcp_connections_default_video_unique")
      .on(t.tenantId, t.ownerUserId, t.providerTemplateId)
      .where(
        sql`default_for_video = true AND status IN ('connected', 'requires_reauth', 'error')`
      ),
  ]
);

export const mcpConnectionGroupShares = pgTable(
  "mcp_connection_group_shares",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectionId: varchar("connection_id", { length: 36 })
      .notNull()
      .references(() => userMcpConnections.id, { onDelete: "restrict" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => userGroups.id, { onDelete: "restrict" }),
    enabled: boolean("enabled").notNull().default(true),
    allowedAssetTypes: jsonb("allowed_asset_types")
      .$type<Array<"image" | "video">>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    allowedTools: jsonb("allowed_tools").$type<string[]>(),
    allowedModels: jsonb("allowed_models").$type<string[]>(),
    dailyUseLimit: integer("daily_use_limit"),
    concurrencyLimit: integer("concurrency_limit"),
    requiresVideoApproval: boolean("requires_video_approval")
      .notNull()
      .default(true),
    dailyWindowTimezone: varchar("daily_window_timezone", { length: 64 }),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  t => [
    uniqueIndex("mcp_connection_group_shares_active_unique")
      .on(t.tenantId, t.connectionId, t.groupId)
      .where(sql`deleted_at IS NULL`),
    index("mcp_connection_group_shares_group_enabled_idx").on(
      t.tenantId,
      t.groupId,
      t.enabled
    ),
    index("mcp_connection_group_shares_connection_enabled_idx").on(
      t.tenantId,
      t.connectionId,
      t.enabled
    ),
  ]
);

export const mcpToolSchemaCache = pgTable(
  "mcp_tool_schema_cache",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    providerTemplateId: varchar("provider_template_id", { length: 36 })
      .notNull()
      .references(() => mcpProviderTemplates.id, { onDelete: "cascade" }),
    connectionId: varchar("connection_id", { length: 36 }).references(
      () => userMcpConnections.id,
      { onDelete: "cascade" }
    ),
    toolName: varchar("tool_name", { length: 128 }).notNull(),
    schemaHash: varchar("schema_hash", { length: 128 }).notNull(),
    inputSchema: jsonb("input_schema")
      .$type<Record<string, unknown>>()
      .notNull(),
    safeProjection: jsonb("safe_projection")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    index("mcp_tool_schema_cache_provider_tool_idx").on(
      t.tenantId,
      t.providerTemplateId,
      t.toolName
    ),
    index("mcp_tool_schema_cache_connection_tool_idx").on(
      t.tenantId,
      t.connectionId,
      t.toolName
    ),
    index("mcp_tool_schema_cache_expires_at_idx").on(t.expiresAt),
    index("mcp_tool_schema_cache_schema_hash_idx").on(t.schemaHash),
  ]
);

export const mcpConnectionUsageEvents = pgTable(
  "mcp_connection_usage_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectionId: varchar("connection_id", { length: 36 }).references(
      () => userMcpConnections.id,
      { onDelete: "restrict" }
    ),
    ownerUserId: integer("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    groupId: integer("group_id").references(() => userGroups.id, {
      onDelete: "set null",
    }),
    mediaTaskId: varchar("media_task_id", { length: 128 }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    assetType: varchar("asset_type", { length: 32 }),
    providerKey: varchar("provider_key", { length: 64 }),
    status: varchar("status", { length: 32 }),
    redactedSummary: jsonb("redacted_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    schemaHash: varchar("schema_hash", { length: 128 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    index("mcp_connection_usage_events_connection_date_idx").on(
      t.tenantId,
      t.connectionId,
      t.occurredAt
    ),
    index("mcp_connection_usage_events_owner_date_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.occurredAt
    ),
    index("mcp_connection_usage_events_actor_date_idx").on(
      t.tenantId,
      t.actorUserId,
      t.occurredAt
    ),
    index("mcp_connection_usage_events_group_date_idx").on(
      t.tenantId,
      t.groupId,
      t.occurredAt
    ),
    index("mcp_connection_usage_events_media_task_idx").on(
      t.tenantId,
      t.mediaTaskId
    ),
  ]
);

export const mcpSharedVideoApprovals = pgTable(
  "mcp_shared_video_approvals",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectionId: varchar("connection_id", { length: 36 })
      .notNull()
      .references(() => userMcpConnections.id, { onDelete: "restrict" }),
    shareId: varchar("share_id", { length: 36 })
      .notNull()
      .references(() => mcpConnectionGroupShares.id, { onDelete: "restrict" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => userGroups.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assetType: varchar("asset_type", { length: 32 }).notNull().default("video"),
    promptHash: varchar("prompt_hash", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 128 }).notNull(),
    redactedRequestSummary: jsonb("redacted_request_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedByMediaTaskId: varchar("consumed_by_media_task_id", {
      length: 128,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  t => [
    index("mcp_shared_video_approvals_pending_expiry_idx").on(
      t.tenantId,
      t.status,
      t.expiresAt
    ),
    uniqueIndex("mcp_shared_video_approvals_consumed_task_unique")
      .on(t.consumedByMediaTaskId)
      .where(sql`consumed_by_media_task_id IS NOT NULL`),
  ]
);

export const mcpMediaTasks = pgTable(
  "mcp_media_tasks",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: varchar("connection_id", { length: 36 }).references(
      () => userMcpConnections.id,
      { onDelete: "set null" }
    ),
    shareId: varchar("share_id", { length: 36 }).references(
      () => mcpConnectionGroupShares.id,
      { onDelete: "set null" }
    ),
    providerTaskId: varchar("provider_task_id", { length: 128 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    mediaType: varchar("media_type", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("processing"),
    model: varchar("model", { length: 255 }).notNull(),
    prompt: text("prompt").notNull(),
    parameters: jsonb("parameters")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    resultData: jsonb("result_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    index("mcp_media_tasks_tenant_user_created_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
    index("mcp_media_tasks_status_idx").on(t.tenantId, t.status, t.updatedAt),
    index("mcp_media_tasks_connection_idx").on(
      t.tenantId,
      t.connectionId,
      t.createdAt
    ),
    uniqueIndex("mcp_media_tasks_idempotency_unique")
      .on(t.tenantId, t.userId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
  ]
);

export type McpProviderTemplate = typeof mcpProviderTemplates.$inferSelect;
export type InsertMcpProviderTemplate =
  typeof mcpProviderTemplates.$inferInsert;
export type UserMcpConnection = typeof userMcpConnections.$inferSelect;
export type InsertUserMcpConnection = typeof userMcpConnections.$inferInsert;
export type McpConnectionGroupShare =
  typeof mcpConnectionGroupShares.$inferSelect;
export type InsertMcpConnectionGroupShare =
  typeof mcpConnectionGroupShares.$inferInsert;
export type McpToolSchemaCache = typeof mcpToolSchemaCache.$inferSelect;
export type InsertMcpToolSchemaCache = typeof mcpToolSchemaCache.$inferInsert;
export type McpConnectionUsageEvent =
  typeof mcpConnectionUsageEvents.$inferSelect;
export type InsertMcpConnectionUsageEvent =
  typeof mcpConnectionUsageEvents.$inferInsert;
export type McpSharedVideoApproval =
  typeof mcpSharedVideoApprovals.$inferSelect;
export type InsertMcpSharedVideoApproval =
  typeof mcpSharedVideoApprovals.$inferInsert;
export type McpMediaTask = typeof mcpMediaTasks.$inferSelect;
export type InsertMcpMediaTask = typeof mcpMediaTasks.$inferInsert;

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
  tenantId: integer("tenantId")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
  tenantId: integer("tenantId")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  /** Page identifier (e.g., "home", "about", "features", "pricing") */
  pageKey: varchar("pageKey", { length: 64 }).notNull(),

  /** Page title */
  title: varchar("title", { length: 255 }).notNull(),

  /** Page slug for URL */
  slug: varchar("slug", { length: 255 }).notNull(),

  /** Page content (HTML or Markdown) */
  content: text("content"),

  /** Structured content sections (JSON) */
  sections: json("sections").$type<
    Array<{
      id: string;
      type:
        | "hero"
        | "features"
        | "testimonials"
        | "cta"
        | "content"
        | "gallery"
        | "pricing"
        | "faq"
        | "team"
        | "contact"
        | "custom"
        | "stats"
        | "process";
      title?: string;
      subtitle?: string;
      content?: string;
      image?: string;
      buttons?: Array<{ text: string; link: string; style?: string }>;
      items?: Array<any>;
      settings?: Record<string, any>;
    }>
  >(),

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type TenantPage = typeof tenantPages.$inferSelect;
export type InsertTenantPage = typeof tenantPages.$inferInsert;

/**
 * Chat Conversations - Multi-chat support with settings
 * Each conversation belongs to a user and can have custom settings
 */
export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),

    /** User who owns this conversation */
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Conversation title (auto-generated or user-set) */
    title: varchar("title", { length: 255 }).notNull().default("New Chat"),

    /** LLM model to use for this conversation */
    model: varchar("model", { length: 100 }).default("gpt-4o-mini"),

    /** Temperature setting (0-2) */
    temperature: numeric("temperature", { precision: 3, scale: 2 }).default(
      "0.7"
    ),

    /** Custom system prompt */
    systemPrompt: text("systemPrompt"),

    /** Skill settings for this conversation */
    skillSettings: json("skillSettings")
      .$type<{
        autoDetect: boolean;
        enabledSkills: string[];
        detectionMode: "ask" | "auto" | "explicit";
        llmSelection?: {
          mode: "explicit" | "auto-global" | "auto-provider";
          modelId?: string | null;
          providerId?: number | null;
          providerName?: string | null;
          lastResolvedModelId?: string | null;
          lastResolvedProviderId?: number | null;
          lastResolvedProviderName?: string | null;
          lastResolvedRouteFamily?:
            | "chat-completions"
            | "messages"
            | "responses"
            | "unknown"
            | null;
          updatedAt?: string | null;
        };
        localAiConversation?: LocalAiConversationOverride;
      }>()
      .default({ autoDetect: true, enabledSkills: [], detectionMode: "auto" }),

    /** Whether conversation is archived */
    isArchived: boolean("isArchived").default(false).notNull(),

    /** Whether conversation is pinned */
    isPinned: boolean("isPinned").default(false).notNull(),

    /** Soft-delete: when moved to trash (auto-purged after 30 days) */
    trashedAt: timestamp("trashedAt"),

    /** Total credits used in this conversation */
    totalCreditsUsed: numeric("totalCreditsUsed", {
      precision: 12,
      scale: 4,
    }).default("0"),

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
    defaultChannelPolicy: varchar("defaultChannelPolicy", {
      length: 20,
    }).default("allow_attach"),

    /** Tenant this conversation belongs to (for multi-tenant isolation) */
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),

    /** AI persona used for this conversation */
    personaId: varchar("personaId", { length: 36 }).references(
      (): AnyPgColumn => personaTemplates.id,
      { onDelete: "set null" }
    ),

    /** Origin: 'web', 'api', 'widget' */
    source: varchar("source", { length: 20 }).default("web"),
    /** API key that created this conversation (nullable, no FK) */
    apiKeyId: varchar("apiKeyId", { length: 36 }),
    /** Auto-expire API-created conversations */
    expiresAt: timestamp("expiresAt", { withTimezone: true }),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("idx_conversations_tenant").on(t.tenantId)]
);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Chat Messages - Individual messages within a conversation
 * Supports multi-modal content (text, images, videos) and artifacts
 */
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),

    /** Conversation this message belongs to */
    conversationId: integer("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),

    /** Message role: user, assistant, or system */
    role: messageRoleEnum("role").notNull(),

    /** Message content (text) */
    content: text("content").notNull(),

    /** Input tokens used */
    inputTokens: integer("inputTokens").default(0),

    /** Output tokens used */
    outputTokens: integer("outputTokens").default(0),

    /** Credits used for this message */
    creditsUsed: numeric("creditsUsed", { precision: 10, scale: 4 }).default(
      "0"
    ),

    /** Model used for this message */
    modelUsed: varchar("modelUsed", { length: 100 }),

    /** Attachments (images, files uploaded by user) */
    attachments: json("attachments")
      .$type<
        Array<{
          type: "image" | "file" | "audio" | "video";
          url: string;
          key?: string;
          name?: string;
          size?: number;
          mimeType?: string;
          thumbnail?: string;
          assetId?: number;
        }>
      >()
      .default([]),

    /** Artifacts extracted from response (code, markdown, media) */
    artifacts: json("artifacts")
      .$type<
        Array<{
          id: string;
          type:
            | "code"
            | "markdown"
            | "image"
            | "video"
            | "pdf"
            | "file"
            | "slideshow"
            | "chart"
            | "table"
            | "mermaid"
            | "svg"
            | "react"
            | "html";
          title?: string;
          content: string | string[];
          language?: string;
          metadata?: Record<string, any>;
        }>
      >()
      .default([]),

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

    /** Authoritative runtime disclosure for reload-safe chat badges */
    runtimeMetadata: jsonb(
      "runtimeMetadata"
    ).$type<MessageRuntimeMetadata | null>(),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("messages_created_at_idx").on(t.createdAt),
    index("messages_conversation_created_idx").on(
      t.conversationId,
      t.createdAt
    ),
    index("idx_messages_traceid").on(t.traceId),
  ]
);

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Conversation Summaries - LLM-generated summaries for memory management
 * Used to compress old messages while retaining context
 */
export const conversationSummaries = pgTable("conversation_summaries", {
  id: serial("id").primaryKey(),

  /** Conversation this summary belongs to */
  conversationId: integer("conversationId")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),

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

  /** Number of risky segments skipped during smart summarization */
  skippedRiskyCount: integer("skippedRiskyCount").default(0),

  /** IDs of extracted facts that contributed to the summary */
  extractedFactIds: text("extractedFactIds").array(),

  /** Whether this summary was generated from a preserved archive */
  hasRawArchive: boolean("hasRawArchive").default(false),

  /** Classification metadata for smart summarization */
  classificationStats: jsonb("classificationStats"),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type InsertConversationSummary =
  typeof conversationSummaries.$inferInsert;

/**
 * Message Chunks - Conversation segments prepared for vector + keyword retrieval
 * Stored separately from messages so async embedding and search can run safely.
 */
export const messageChunks = pgTable(
  "message_chunks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: integer("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageRangeStart: integer("messageRangeStart").notNull(),
    messageRangeEnd: integer("messageRangeEnd").notNull(),
    chunkIndex: integer("chunkIndex").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("tokenCount").notNull(),
    embedding: vector1536("embedding"),
    projectId: varchar("projectId", { length: 100 }),
    personaId: varchar("personaId", { length: 36 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("message_chunks_conv_chunk_idx").on(
      t.conversationId,
      t.chunkIndex
    ),
    index("message_chunks_tenant_user_idx").on(t.tenantId, t.userId),
    index("message_chunks_created_idx").on(t.createdAt),
    index("message_chunks_tenant_project_idx").on(t.tenantId, t.projectId),
  ]
);

export type MessageChunk = typeof messageChunks.$inferSelect;
export type InsertMessageChunk = typeof messageChunks.$inferInsert;

/**
 * Memory Archive Metadata - File-backed chat archives for raw conversation preservation.
 */
export const memoryArchiveMetadata = pgTable(
  "memory_archive_metadata",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: integer("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    archiveDate: varchar("archiveDate", { length: 10 }).notNull(),
    filePath: text("filePath").notNull(),
    messageCount: integer("messageCount").default(0),
    fileSizeBytes: integer("fileSizeBytes").default(0),
    encryptionVersion: integer("encryptionVersion").default(1),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("memory_archive_conv_date_idx").on(
      t.conversationId,
      t.archiveDate
    ),
  ]
);

export type MemoryArchiveMetadata = typeof memoryArchiveMetadata.$inferSelect;
export type InsertMemoryArchiveMetadata =
  typeof memoryArchiveMetadata.$inferInsert;

/**
 * Entity Memories - Long-term facts about users, projects, and preferences
 * Persists across conversations and provides personalized context
 */
export const entityMemories = pgTable(
  "entity_memories",
  {
    id: serial("id").primaryKey(),

    /** User this memory belongs to */
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Persona scope for this memory; null means shared/legacy memory */
    personaId: varchar("personaId", { length: 36 }).references(
      () => personaTemplates.id,
      { onDelete: "set null" }
    ),

    /** Type of entity: user, project, preference, technical */
    entityType: entityTypeEnum("entityType").notNull(),

    /** Name of the entity (e.g., "SmartSpecPro", "coding style") */
    entityName: varchar("entityName", { length: 255 }).notNull(),

    /** Facts about the entity (JSON array of strings) */
    facts: json("facts").$type<string[]>().notNull().default([]),

    /** Source conversation ID (where fact was learned) */
    sourceConversationId: integer("sourceConversationId").references(
      () => conversations.id,
      { onDelete: "set null" }
    ),

    /** Project scope — null means global (user-level) memory */
    projectId: varchar("projectId", { length: 100 }),

    /** Confidence score (0-1) */
    confidence: numeric("confidence", { precision: 3, scale: 2 }).default(
      "0.8"
    ),

    /** Last time this memory was accessed */
    lastAccessedAt: timestamp("lastAccessedAt", {
      withTimezone: true,
    }).defaultNow(),

    /** Importance score (1-10) */
    importance: integer("importance").default(5),

    /** Source: 'auto', 'manual', 'suggested' */
    source: varchar("source", { length: 20 }).default("auto"),

    /** Number of times this memory was reinforced */
    reinforcementCount: integer("reinforcementCount").default(1),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("entity_memories_user_persona_idx").on(t.userId, t.personaId)]
);

export type EntityMemory = typeof entityMemories.$inferSelect;
export type InsertEntityMemory = typeof entityMemories.$inferInsert;

/**
 * Skill Preferences - Per-conversation skill settings
 * Allows users to enable/disable specific skills for each conversation
 */
export const skillPreferences = pgTable("skill_preferences", {
  id: serial("id").primaryKey(),

  /** Conversation this preference belongs to */
  conversationId: integer("conversationId")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),

  /** Skill identifier */
  skillId: varchar("skillId", { length: 100 }).notNull(),

  /** Whether skill is enabled */
  enabled: boolean("enabled").default(true).notNull(),

  /** Priority for skill detection (higher = checked first) */
  priority: integer("priority").default(0).notNull(),

  /** Custom settings for this skill */
  customSettings: json("customSettings").$type<Record<string, any>>(),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SkillPreference = typeof skillPreferences.$inferSelect;
export type InsertSkillPreference = typeof skillPreferences.$inferInsert;

/**
 * Media Provider Type Enum
 * Defines the types of media that each provider can generate
 */
export const mediaProviderTypeEnum = pgEnum("media_provider_type", [
  "image",
  "video",
  "audio",
  "multimodal",
]);

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
  providerType: mediaProviderTypeEnum("providerType")
    .notNull()
    .default("multimodal"),

  /** API base URL */
  baseUrl: varchar("baseUrl", { length: 512 }),

  /** Callback URL for async operations (e.g., Kie.ai task completion webhook) */
  callbackUrl: varchar("callbackUrl", { length: 512 }),

  /** Encrypted API key (stored securely) */
  apiKeyEncrypted: text("apiKeyEncrypted"),

  /** Whether API key is set (without exposing the key) */
  hasApiKey: boolean("hasApiKey").default(false).notNull(),

  /** Available models/services (JSON array) */
  availableModels: json("availableModels").$type<
    Array<{
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
    }>
  >(),

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type MediaProvider = typeof mediaProviders.$inferSelect;
export type InsertMediaProvider = typeof mediaProviders.$inferInsert;

/**
 * Voice Agent Configs - Tenant-scoped mapping to provider-hosted realtime agents.
 * Kept separate from one-shot media models.
 */
export const voiceAgentConfigs = pgTable(
  "voice_agent_configs",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: voiceAgentProviderEnum("provider")
      .notNull()
      .default("elevenlabs"),
    externalAgentId: varchar("external_agent_id", { length: 128 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    description: text("description"),
    credentialProviderName: varchar("credential_provider_name", { length: 64 })
      .notNull()
      .default("elevenlabs"),
    branchId: varchar("branch_id", { length: 128 }),
    environment: varchar("environment", { length: 64 }),
    defaultLanguage: varchar("default_language", { length: 16 }),
    serverLocation: varchar("server_location", { length: 32 })
      .default("us")
      .notNull(),
    retentionPolicy: varchar("retention_policy", { length: 32 })
      .default("default")
      .notNull(),
    allowedSurfaces: json("allowed_surfaces")
      .$type<Array<"chat" | "work_os" | "team_room" | "agency">>()
      .notNull()
      .default(["chat"]),
    allowedTools: json("allowed_tools")
      .$type<string[]>()
      .notNull()
      .default(["chat.create_message"]),
    configJson: json("config_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    isEnabled: boolean("is_enabled").default(false).notNull(),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestResult: json("last_test_result").$type<{
      success: boolean;
      message: string;
      latencyMs?: number;
      providerConversationId?: string;
    }>(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("voice_agent_configs_tenant_provider_agent_unique").on(
      t.tenantId,
      t.provider,
      t.externalAgentId
    ),
    index("voice_agent_configs_tenant_enabled_idx").on(t.tenantId, t.isEnabled),
    index("voice_agent_configs_provider_idx").on(t.provider),
  ]
);

export type VoiceAgentConfig = typeof voiceAgentConfigs.$inferSelect;
export type InsertVoiceAgentConfig = typeof voiceAgentConfigs.$inferInsert;

/**
 * Voice Agent Sessions - SmartSpec-owned session lifecycle and billing state.
 */
export const voiceAgentSessions = pgTable(
  "voice_agent_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    configId: integer("config_id")
      .notNull()
      .references(() => voiceAgentConfigs.id, { onDelete: "restrict" }),
    provider: voiceAgentProviderEnum("provider")
      .notNull()
      .default("elevenlabs"),
    providerConversationId: varchar("provider_conversation_id", {
      length: 128,
    }),
    surface: voiceAgentSurfaceEnum("surface").notNull().default("chat"),
    connectionType: voiceAgentConnectionTypeEnum("connection_type")
      .notNull()
      .default("webrtc_token"),
    connectionExpiresAt: timestamp("connection_expires_at", {
      withTimezone: true,
    }),
    status: voiceAgentSessionStatusEnum("status").notNull().default("created"),
    billingStatus: voiceAgentBillingStatusEnum("billing_status")
      .notNull()
      .default("reserved"),
    creditReservationTransactionId: integer(
      "credit_reservation_transaction_id"
    ).references(() => creditTransactions.id, { onDelete: "set null" }),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    providerDurationSeconds: integer("provider_duration_seconds"),
    providerCostCents: integer("provider_cost_cents"),
    transcriptPending: boolean("transcript_pending").default(false).notNull(),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    metadataJson: json("metadata_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("voice_agent_sessions_user_idempotency_unique").on(
      t.tenantId,
      t.userId,
      t.idempotencyKey
    ),
    uniqueIndex("voice_agent_sessions_provider_conversation_unique")
      .on(t.tenantId, t.providerConversationId)
      .where(sql`provider_conversation_id IS NOT NULL`),
    index("voice_agent_sessions_tenant_user_created_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
    index("voice_agent_sessions_tenant_conversation_created_idx").on(
      t.tenantId,
      t.conversationId,
      t.createdAt
    ),
    index("voice_agent_sessions_status_idx").on(t.status),
  ]
);

export type VoiceAgentSession = typeof voiceAgentSessions.$inferSelect;
export type InsertVoiceAgentSession = typeof voiceAgentSessions.$inferInsert;

/**
 * Voice Agent Events - Normalized SDK, webhook, and provider events.
 */
export const voiceAgentEvents = pgTable(
  "voice_agent_events",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => voiceAgentSessions.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    providerEventId: varchar("provider_event_id", { length: 160 }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    source: voiceAgentEventSourceEnum("source").notNull().default("system"),
    sequence: integer("sequence").notNull(),
    text: text("text"),
    payloadJson: json("payload_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    redactionStatus: voiceAgentRedactionStatusEnum("redaction_status")
      .notNull()
      .default("not_required"),
    conversationMessageId: integer("conversation_message_id").references(
      () => messages.id,
      { onDelete: "set null" }
    ),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("voice_agent_events_session_sequence_unique").on(
      t.sessionId,
      t.sequence
    ),
    uniqueIndex("voice_agent_events_provider_event_unique")
      .on(t.sessionId, t.providerEventId)
      .where(sql`provider_event_id IS NOT NULL`),
    index("voice_agent_events_tenant_received_idx").on(
      t.tenantId,
      t.receivedAt
    ),
    index("voice_agent_events_session_received_idx").on(
      t.sessionId,
      t.receivedAt
    ),
  ]
);

export type VoiceAgentEvent = typeof voiceAgentEvents.$inferSelect;
export type InsertVoiceAgentEvent = typeof voiceAgentEvents.$inferInsert;

/**
 * Voice Agent Tool Calls - Durable idempotent tool bridge ledger.
 */
export const voiceAgentToolCalls = pgTable(
  "voice_agent_tool_calls",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => voiceAgentSessions.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    providerToolCallId: varchar("provider_tool_call_id", { length: 160 }),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    toolName: varchar("tool_name", { length: 128 }).notNull(),
    status: voiceAgentToolCallStatusEnum("status")
      .notNull()
      .default("received"),
    inputJson: json("input_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    outputJson: json("output_json").$type<Record<string, any>>(),
    policyDecisionJson: json("policy_decision_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("voice_agent_tool_calls_session_idempotency_unique").on(
      t.sessionId,
      t.idempotencyKey
    ),
    uniqueIndex("voice_agent_tool_calls_provider_tool_unique")
      .on(t.sessionId, t.providerToolCallId)
      .where(sql`provider_tool_call_id IS NOT NULL`),
    index("voice_agent_tool_calls_tenant_tool_started_idx").on(
      t.tenantId,
      t.toolName,
      t.startedAt
    ),
    index("voice_agent_tool_calls_status_idx").on(t.status),
  ]
);

export type VoiceAgentToolCall = typeof voiceAgentToolCalls.$inferSelect;
export type InsertVoiceAgentToolCall = typeof voiceAgentToolCalls.$inferInsert;

/**
 * Media Model Type Enum
 * Defines what type of media this model generates
 */
export const mediaModelTypeEnum = pgEnum("media_model_type", [
  "image",
  "video",
  "audio",
]);

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type MediaModel = typeof mediaModels.$inferSelect;
export type InsertMediaModel = typeof mediaModels.$inferInsert;

/**
 * Durable callback event log for media provider webhooks.
 * Enables idempotent processing and retry scheduling.
 */
export const mediaCallbackEvents = pgTable(
  "media_callback_events",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).references(
      () => tenants.id,
      { onDelete: "cascade" }
    ),
    providerName: varchar("provider_name", { length: 64 })
      .notNull()
      .default("kie_ai"),
    providerTaskId: varchar("provider_task_id", { length: 128 }),
    eventFingerprint: varchar("event_fingerprint", { length: 64 })
      .notNull()
      .unique(),
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

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("media_callback_events_provider_task_idx").on(t.providerTaskId),
    index("media_callback_events_status_retry_idx").on(t.status, t.nextRetryAt),
    index("media_callback_events_provider_status_idx").on(
      t.providerTaskId,
      t.status
    ),
    index("media_callback_events_tenant_status_retry_idx").on(
      t.tenantId,
      t.status,
      t.nextRetryAt
    ),
  ]
);

export type MediaCallbackEvent = typeof mediaCallbackEvents.$inferSelect;
export type InsertMediaCallbackEvent = typeof mediaCallbackEvents.$inferInsert;

/**
 * Media callback dead-letter entries for terminal callback processing failures.
 */
export const mediaCallbackDlq = pgTable(
  "media_callback_dlq",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").references(() => mediaCallbackEvents.id, {
      onDelete: "set null",
    }),
    tenantId: varchar("tenant_id", { length: 36 }).references(
      () => tenants.id,
      { onDelete: "cascade" }
    ),
    providerName: varchar("provider_name", { length: 64 })
      .notNull()
      .default("kie_ai"),
    providerTaskId: varchar("provider_task_id", { length: 128 }),
    eventFingerprint: varchar("event_fingerprint", { length: 64 }).notNull(),
    payload: json("payload").$type<Record<string, any>>().notNull().default({}),
    errorMessage: text("error_message").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    status: mediaCallbackDlqStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  t => [
    index("media_callback_dlq_event_idx").on(t.eventId),
    index("media_callback_dlq_provider_task_idx").on(t.providerTaskId),
    index("media_callback_dlq_status_idx").on(t.status),
    index("media_callback_dlq_tenant_status_idx").on(t.tenantId, t.status),
  ]
);

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
export const libraryContextPackStatusEnum = pgEnum(
  "library_context_pack_status",
  ["draft", "active", "archived"]
);
export const libraryContextPackSourceModeEnum = pgEnum(
  "library_context_pack_source_mode",
  ["manual", "view_backed", "snapshot"]
);
export const libraryContextPackMemberModeEnum = pgEnum(
  "library_context_pack_member_mode",
  ["include", "exclude", "pin"]
);
export const libraryContextPackRuntimeTierEnum = pgEnum(
  "library_context_pack_runtime_tier",
  ["durable_memory", "retrieved_evidence"]
);
export const libraryContextPackReadinessStatusEnum = pgEnum(
  "library_context_pack_readiness_status",
  ["draft", "review_pending", "trusted", "stale"]
);
export const libraryContextPackRelationPolicyEnum = pgEnum(
  "library_context_pack_relation_policy",
  ["none", "manual_only", "one_hop_gated"]
);
export const libraryKnowledgeRelationKindEnum = pgEnum(
  "library_knowledge_relation_kind",
  ["wikilink", "markdown"]
);
export const libraryKnowledgeResolutionStatusEnum = pgEnum(
  "library_knowledge_resolution_status",
  ["resolved", "ambiguous", "unresolved", "forbidden"]
);
export const libraryKnowledgeMatchedByEnum = pgEnum(
  "library_knowledge_matched_by",
  ["logical_path", "title", "alias"]
);
export const libraryKnowledgeBackfillRunStatusEnum = pgEnum(
  "library_knowledge_backfill_run_status",
  ["queued", "running", "completed", "failed", "cancelled"]
);
export const librarySavedViewVisibilityEnum = pgEnum(
  "library_saved_view_visibility",
  ["private", "team"]
);
export const librarySavedViewScopeEnum = pgEnum("library_saved_view_scope", [
  "all",
  "my_library",
  "private_vault",
  "shared_with_me",
  "shared_groups",
]);

export const financeTransactionTypeEnum = pgEnum("finance_transaction_type", [
  "income",
  "expense",
  "transfer",
]);

export const financeTransactionStatusEnum = pgEnum(
  "finance_transaction_status",
  ["draft", "confirmed", "voided"]
);

export const financeDraftStatusEnum = pgEnum("finance_draft_status", [
  "draft",
  "confirmed",
  "expired",
  "cancelled",
]);

export const financeRecurringRuleStatusEnum = pgEnum(
  "finance_recurring_rule_status",
  ["active", "paused", "ended"]
);

export const financeSourceEnum = pgEnum("finance_source", [
  "chat_text",
  "ocr_document",
  "import",
  "api",
  "recurring_rule",
]);

export const financeDocumentRoleEnum = pgEnum("finance_document_role", [
  "receipt",
  "transfer_slip",
  "invoice",
  "statement",
  "supporting",
]);

export const financePaymentInstitutionKindEnum = pgEnum(
  "finance_payment_institution_kind",
  ["bank", "issuer", "other"]
);

export const financePaymentInstrumentKindEnum = pgEnum(
  "finance_payment_instrument_kind",
  ["bank_account", "credit_card", "cash", "unknown"]
);

export const financePaymentDirectionEnum = pgEnum("finance_payment_direction", [
  "outbound",
  "inbound",
  "both",
  "unknown",
]);

export const libraryItems = pgTable(
  "library_items",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // null = root-level; non-null = inside a folder (itemType="folder")
    parentId: integer("parent_id").references(
      (): AnyPgColumn => libraryItems.id,
      { onDelete: "cascade" }
    ),
    itemType: varchar("item_type", { length: 32 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    projectId: varchar("project_id", { length: 100 }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    status: libraryItemStatusEnum("status").notNull().default("ready"),
    visibility: libraryVisibilityEnum("visibility")
      .notNull()
      .default("private"),
    metadata: json("metadata")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    sourceUrl: text("source_url"),
    thumbnailUrl: text("thumbnail_url"),
    // Denormalized scope cache for vector DB filtering
    allowedScopes: text("allowed_scopes")
      .array()
      .default(sql`'{}'`),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    // Track who deleted the file (for trash UI)
    deletedBy: integer("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_items_id_tenant_unique").on(t.id, t.tenantId),
    index("library_items_tenant_visibility_status_idx").on(
      t.tenantId,
      t.visibility,
      t.status
    ),
    index("library_items_tenant_owner_status_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.status
    ),
    index("library_items_tenant_project_idx").on(t.tenantId, t.projectId),
    index("library_items_tenant_owner_project_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.projectId
    ),
    index("library_items_source_item_type_idx").on(t.source, t.itemType),
    index("library_items_deleted_at_idx").on(t.deletedAt),
    index("library_items_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
    index("library_items_parent_id_idx").on(t.parentId),
  ]
);

export type LibraryItem = typeof libraryItems.$inferSelect;
export type InsertLibraryItem = typeof libraryItems.$inferInsert;

export const libraryLinks = pgTable(
  "library_links",
  {
    id: serial("id").primaryKey(),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    linkType: varchar("link_type", { length: 64 }).notNull(),
    linkId: varchar("link_id", { length: 128 }).notNull(),
    providerTaskId: varchar("provider_task_id", { length: 128 }),
    tenantId: varchar("tenant_id", { length: 36 }).references(
      () => tenants.id,
      { onDelete: "cascade" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_links_source_tenant_unique").on(
      t.linkType,
      t.linkId,
      t.tenantId
    ),
    index("library_links_item_type_idx").on(t.libraryItemId, t.linkType),
    index("library_links_provider_task_idx").on(t.providerTaskId),
  ]
);

export type LibraryLink = typeof libraryLinks.$inferSelect;
export type InsertLibraryLink = typeof libraryLinks.$inferInsert;

export const libraryChunks = pgTable(
  "library_chunks",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentType: varchar("content_type", { length: 32 })
      .notNull()
      .default("text"),
    tokenCount: integer("token_count"),
    vectorRefId: varchar("vector_ref_id", { length: 128 }),
    vectorIndexName: varchar("vector_index_name", { length: 128 }),
    metadata: json("metadata")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    // Denormalized scope cache — mirrors parent item's allowed_scopes
    allowedScopes: text("allowed_scopes")
      .array()
      .default(sql`'{}'`),
    // Parent-child chunk support for RAG
    isParent: boolean("is_parent").default(false).notNull(),
    parentChunkId: text("parent_chunk_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_chunks_item_chunk_index_unique").on(
      t.libraryItemId,
      t.chunkIndex
    ),
    index("library_chunks_tenant_content_type_idx").on(
      t.tenantId,
      t.contentType
    ),
    index("library_chunks_tenant_project_idx").on(t.tenantId, t.projectId),
    index("library_chunks_vector_ref_idx").on(t.vectorRefId),
    index("library_chunks_vector_index_name_idx").on(t.vectorIndexName),
    index("library_chunks_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
    index("library_chunks_parent_chunk_idx").on(t.parentChunkId),
  ]
);

export type LibraryChunk = typeof libraryChunks.$inferSelect;
export type InsertLibraryChunk = typeof libraryChunks.$inferInsert;

export const libraryContentVersions = pgTable(
  "library_content_versions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    content: text("content").notNull(),
    contentType: varchar("content_type", { length: 32 })
      .notNull()
      .default("markdown_source"),
    contentSizeBytes: integer("content_size_bytes").notNull(),
    changeDescription: text("change_description"),
    // S3/storage key of archived file for binary file versions (null for markdown versions)
    snapshotObjectKey: varchar("snapshot_object_key", { length: 512 }),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_versions_item_version_unique").on(
      t.libraryItemId,
      t.versionNumber
    ),
    index("library_versions_item_created_idx").on(t.libraryItemId, t.createdAt),
    index("library_versions_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("library_versions_hash_idx").on(t.contentHash),
  ]
);

export type LibraryContentVersion = typeof libraryContentVersions.$inferSelect;
export type InsertLibraryContentVersion =
  typeof libraryContentVersions.$inferInsert;

export const libraryPermissions = pgTable(
  "library_permissions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: varchar("subject_id", { length: 64 }).notNull(),
    permissionLevel: varchar("permission_level", { length: 32 })
      .notNull()
      .default("read"),
    grantedByUserId: integer("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_permissions_subject_unique").on(
      t.libraryItemId,
      t.subjectType,
      t.subjectId
    ),
    index("library_permissions_tenant_subject_idx").on(
      t.tenantId,
      t.subjectType,
      t.subjectId
    ),

    // Optimize group permission lookups
    index("library_permissions_group_idx")
      .on(t.subjectId, t.subjectType)
      .where(sql`subject_type = 'group'`),
  ]
);

export type LibraryPermission = typeof libraryPermissions.$inferSelect;
export type InsertLibraryPermission = typeof libraryPermissions.$inferInsert;

export const libraryPublicShareLinks = pgTable(
  "library_public_share_links",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    tokenEncrypted: text("token_encrypted").notNull(),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_public_share_links_token_hash_unique").on(t.tokenHash),
    index("library_public_share_links_tenant_item_idx").on(
      t.tenantId,
      t.libraryItemId
    ),
    index("library_public_share_links_tenant_token_idx").on(
      t.tenantId,
      t.tokenHash
    ),
    index("library_public_share_links_item_active_idx").on(
      t.libraryItemId,
      t.revokedAt,
      t.expiresAt
    ),
  ]
);

export type LibraryPublicShareLink =
  typeof libraryPublicShareLinks.$inferSelect;
export type InsertLibraryPublicShareLink =
  typeof libraryPublicShareLinks.$inferInsert;

export const libraryIndexJobs = pgTable(
  "library_index_jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }),
    jobType: varchar("job_type", { length: 64 }).notNull(),
    payloadVersion: varchar("payload_version", { length: 16 })
      .notNull()
      .default("v2"),
    payloadJson: json("payload_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    source: varchar("source", { length: 255 }),
    sourceMetadataJson: json("source_metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dedupeKey: varchar("dedupe_key", { length: 255 }),
    status: libraryIndexJobStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    knowledgeRefreshReason: varchar("knowledge_refresh_reason", { length: 64 }),
    knowledgeRefreshStatus: varchar("knowledge_refresh_status", { length: 32 }),
    knowledgeRefreshAttemptCount: integer("knowledge_refresh_attempt_count")
      .notNull()
      .default(0),
    knowledgeRefreshRequestedAt: timestamp("knowledge_refresh_requested_at", {
      withTimezone: true,
    }),
    knowledgeRefreshCompletedAt: timestamp("knowledge_refresh_completed_at", {
      withTimezone: true,
    }),
    knowledgeRefreshError: text("knowledge_refresh_error"),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("library_index_jobs_tenant_status_run_at_idx").on(
      t.tenantId,
      t.status,
      t.runAt
    ),
    index("library_index_jobs_tenant_project_idx").on(t.tenantId, t.projectId),
    index("library_index_jobs_status_retry_idx").on(t.status, t.nextRetryAt),
    index("library_index_jobs_item_status_idx").on(t.libraryItemId, t.status),
    index("library_index_jobs_knowledge_refresh_idx").on(
      t.tenantId,
      t.knowledgeRefreshStatus,
      t.knowledgeRefreshRequestedAt
    ),
  ]
);

export type LibraryIndexJob = typeof libraryIndexJobs.$inferSelect;
export type InsertLibraryIndexJob = typeof libraryIndexJobs.$inferInsert;

export const librarySavedViews = pgTable(
  "library_saved_views",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    managingGroupId: integer("managing_group_id").references(
      () => userGroups.id,
      { onDelete: "set null" }
    ),
    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    visibilityMode: librarySavedViewVisibilityEnum("visibility_mode")
      .notNull()
      .default("private"),
    scopeMode: librarySavedViewScopeEnum("scope_mode").notNull().default("all"),
    queryDefinition: json("query_definition")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    presentationDefinition: json("presentation_definition")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_saved_views_tenant_slug_unique").on(
      t.tenantId,
      t.slug
    ),
    index("library_saved_views_tenant_owner_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.updatedAt
    ),
    index("library_saved_views_tenant_visibility_idx").on(
      t.tenantId,
      t.visibilityMode,
      t.updatedAt
    ),
  ]
);

export type LibrarySavedView = typeof librarySavedViews.$inferSelect;
export type InsertLibrarySavedView = typeof librarySavedViews.$inferInsert;

export const libraryContextPacks = pgTable(
  "library_context_packs",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    managingGroupId: integer("managing_group_id").references(
      () => userGroups.id,
      { onDelete: "set null" }
    ),
    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    status: libraryContextPackStatusEnum("status").notNull().default("draft"),
    sourceMode: libraryContextPackSourceModeEnum("source_mode").notNull(),
    savedViewId: integer("saved_view_id").references(
      () => librarySavedViews.id,
      { onDelete: "set null" }
    ),
    relationExpansionPolicy: libraryContextPackRelationPolicyEnum(
      "relation_expansion_policy"
    )
      .notNull()
      .default("none"),
    defaultRuntimeTier: libraryContextPackRuntimeTierEnum(
      "default_runtime_tier"
    )
      .notNull()
      .default("retrieved_evidence"),
    budgetProfile: varchar("budget_profile", { length: 32 })
      .notNull()
      .default("retrieval"),
    maxNoteCount: integer("max_note_count"),
    maxTokenHint: integer("max_token_hint"),
    freshnessExpectation: varchar("freshness_expectation", { length: 32 }),
    readinessStatus: libraryContextPackReadinessStatusEnum("readiness_status")
      .notNull()
      .default("draft"),
    approvedForAgents: boolean("approved_for_agents").notNull().default(false),
    submittedForReviewAt: timestamp("submitted_for_review_at", {
      withTimezone: true,
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    reviewerUserId: integer("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastSourceMutationAt: timestamp("last_source_mutation_at", {
      withTimezone: true,
    }),
    freshUntil: timestamp("fresh_until", { withTimezone: true }),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_context_packs_tenant_slug_unique").on(
      t.tenantId,
      t.slug
    ),
    index("library_context_packs_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.updatedAt
    ),
    index("library_context_packs_tenant_owner_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.updatedAt
    ),
    index("library_context_packs_tenant_readiness_idx").on(
      t.tenantId,
      t.readinessStatus,
      t.approvedForAgents
    ),
    index("library_context_packs_saved_view_idx").on(t.savedViewId),
  ]
);

export type LibraryContextPack = typeof libraryContextPacks.$inferSelect;
export type InsertLibraryContextPack = typeof libraryContextPacks.$inferInsert;

export const libraryContextPackReviewEvents = pgTable(
  "library_context_pack_review_events",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contextPackId: integer("context_pack_id")
      .notNull()
      .references(() => libraryContextPacks.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    previousReadinessStatus: libraryContextPackReadinessStatusEnum(
      "previous_readiness_status"
    ),
    nextReadinessStatus: libraryContextPackReadinessStatusEnum(
      "next_readiness_status"
    ),
    previousApprovedForAgents: boolean("previous_approved_for_agents")
      .notNull()
      .default(false),
    nextApprovedForAgents: boolean("next_approved_for_agents")
      .notNull()
      .default(false),
    reason: text("reason"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("library_context_pack_review_events_pack_idx").on(
      t.contextPackId,
      t.createdAt
    ),
    index("library_context_pack_review_events_tenant_idx").on(
      t.tenantId,
      t.createdAt
    ),
  ]
);

export type LibraryContextPackReviewEvent =
  typeof libraryContextPackReviewEvents.$inferSelect;
export type InsertLibraryContextPackReviewEvent =
  typeof libraryContextPackReviewEvents.$inferInsert;

export const libraryContextPackMembers = pgTable(
  "library_context_pack_members",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contextPackId: integer("context_pack_id")
      .notNull()
      .references(() => libraryContextPacks.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    memberMode: libraryContextPackMemberModeEnum("member_mode").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    rationale: text("rationale"),
    snapshotMetadata: json("snapshot_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("library_context_pack_members_unique").on(
      t.contextPackId,
      t.libraryItemId,
      t.memberMode
    ),
    index("library_context_pack_members_pack_idx").on(
      t.contextPackId,
      t.memberMode,
      t.orderIndex
    ),
    index("library_context_pack_members_item_idx").on(
      t.libraryItemId,
      t.memberMode
    ),
    index("library_context_pack_members_tenant_idx").on(
      t.tenantId,
      t.contextPackId
    ),
  ]
);

export type LibraryContextPackMember =
  typeof libraryContextPackMembers.$inferSelect;
export type InsertLibraryContextPackMember =
  typeof libraryContextPackMembers.$inferInsert;

export const libraryKnowledgeNotes = pgTable(
  "library_knowledge_notes",
  {
    libraryItemId: integer("library_item_id")
      .primaryKey()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    logicalPath: varchar("logical_path", { length: 512 }),
    normalizedTitle: varchar("normalized_title", { length: 512 }).notNull(),
    aliases: json("aliases").$type<string[]>().notNull().default([]),
    tags: json("tags").$type<string[]>().notNull().default([]),
    properties: json("properties")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    headings: json("headings")
      .$type<
        Array<{
          depth: number;
          text: string;
          slug: string;
        }>
      >()
      .notNull()
      .default([]),
    diagnostics: json("diagnostics")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    contentFingerprint: varchar("content_fingerprint", { length: 128 }),
    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
    }).notNull(),
    lastExtractedAt: timestamp("last_extracted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastVisibilityRefreshAt: timestamp("last_visibility_refresh_at", {
      withTimezone: true,
    }),
    lastBackfilledAt: timestamp("last_backfilled_at", { withTimezone: true }),
    isStale: boolean("is_stale").notNull().default(false),
    staleReason: varchar("stale_reason", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("library_knowledge_notes_tenant_logical_path_idx").on(
      t.tenantId,
      t.logicalPath
    ),
    index("library_knowledge_notes_tenant_title_idx").on(
      t.tenantId,
      t.normalizedTitle
    ),
    index("library_knowledge_notes_tenant_stale_idx").on(
      t.tenantId,
      t.isStale,
      t.updatedAt
    ),
  ]
);

export type LibraryKnowledgeNote = typeof libraryKnowledgeNotes.$inferSelect;
export type InsertLibraryKnowledgeNote =
  typeof libraryKnowledgeNotes.$inferInsert;

export const libraryKnowledgeRelations = pgTable(
  "library_knowledge_relations",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceLibraryItemId: integer("source_library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    targetLibraryItemId: integer("target_library_item_id").references(
      () => libraryItems.id,
      {
        onDelete: "cascade",
      }
    ),
    relationKind: libraryKnowledgeRelationKindEnum("relation_kind").notNull(),
    rawReference: text("raw_reference").notNull(),
    displayText: text("display_text"),
    targetPath: varchar("target_path", { length: 512 }),
    targetHeading: varchar("target_heading", { length: 255 }),
    resolutionStatus:
      libraryKnowledgeResolutionStatusEnum("resolution_status").notNull(),
    matchedBy: libraryKnowledgeMatchedByEnum("matched_by"),
    matchedValue: varchar("matched_value", { length: 512 }),
    candidateLibraryItemIds: json("candidate_library_item_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    diagnostics: json("diagnostics")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    extractedAt: timestamp("extracted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("library_knowledge_relations_source_idx").on(
      t.sourceLibraryItemId,
      t.relationKind
    ),
    index("library_knowledge_relations_target_idx").on(
      t.targetLibraryItemId,
      t.resolutionStatus
    ),
    index("library_knowledge_relations_tenant_status_idx").on(
      t.tenantId,
      t.resolutionStatus,
      t.updatedAt
    ),
  ]
);

export type LibraryKnowledgeRelation =
  typeof libraryKnowledgeRelations.$inferSelect;
export type InsertLibraryKnowledgeRelation =
  typeof libraryKnowledgeRelations.$inferInsert;

export const libraryKnowledgeBackfillRuns = pgTable(
  "library_knowledge_backfill_runs",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestedByUserId: integer("requested_by_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    status: libraryKnowledgeBackfillRunStatusEnum("status")
      .notNull()
      .default("queued"),
    totalNotes: integer("total_notes").notNull().default(0),
    processedNotes: integer("processed_notes").notNull().default(0),
    successfulNotes: integer("successful_notes").notNull().default(0),
    failedNotes: integer("failed_notes").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    lastCursorLibraryItemId: integer("last_cursor_library_item_id"),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("library_knowledge_backfill_runs_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.updatedAt
    ),
    index("library_knowledge_backfill_runs_tenant_started_idx").on(
      t.tenantId,
      t.startedAt
    ),
  ]
);

export type LibraryKnowledgeBackfillRun =
  typeof libraryKnowledgeBackfillRuns.$inferSelect;
export type InsertLibraryKnowledgeBackfillRun =
  typeof libraryKnowledgeBackfillRuns.$inferInsert;

export const libraryKnowledgeTelemetryEvents = pgTable(
  "library_knowledge_telemetry_events",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    surface: varchar("surface", { length: 64 }),
    status: varchar("status", { length: 64 }),
    sampleCount: integer("sample_count").notNull().default(1),
    metricJson: json("metric_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("library_knowledge_telemetry_events_tenant_created_idx").on(
      t.tenantId,
      t.createdAt
    ),
    index("library_knowledge_telemetry_events_tenant_type_created_idx").on(
      t.tenantId,
      t.eventType,
      t.createdAt
    ),
    index("library_knowledge_telemetry_events_tenant_surface_created_idx").on(
      t.tenantId,
      t.surface,
      t.createdAt
    ),
  ]
);

export type LibraryKnowledgeTelemetryEvent =
  typeof libraryKnowledgeTelemetryEvents.$inferSelect;
export type InsertLibraryKnowledgeTelemetryEvent =
  typeof libraryKnowledgeTelemetryEvents.$inferInsert;

export const libraryKnowledgeTelemetryRollups = pgTable(
  "library_knowledge_telemetry_rollups",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    surface: varchar("surface", { length: 64 }),
    status: varchar("status", { length: 64 }),
    sampleCount: integer("sample_count").notNull().default(0),
    metricJson: json("metric_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("library_knowledge_telemetry_rollups_tenant_window_idx").on(
      t.tenantId,
      t.windowStart,
      t.windowEnd
    ),
    index("library_knowledge_telemetry_rollups_tenant_type_idx").on(
      t.tenantId,
      t.eventType,
      t.windowStart
    ),
  ]
);

export type LibraryKnowledgeTelemetryRollup =
  typeof libraryKnowledgeTelemetryRollups.$inferSelect;
export type InsertLibraryKnowledgeTelemetryRollup =
  typeof libraryKnowledgeTelemetryRollups.$inferInsert;

export const libraryKnowledgeReleaseGateOverrides = pgTable(
  "library_knowledge_release_gate_overrides",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).references(
      () => tenants.id,
      { onDelete: "cascade" }
    ),
    scopeType: varchar("scope_type", { length: 16 }).notNull(),
    scopeId: varchar("scope_id", { length: 64 }),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByUserId: integer("approved_by_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    overrideMode: varchar("override_mode", { length: 32 })
      .notNull()
      .default("standard"),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalReason: text("approval_reason"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedByUserId: integer("rejected_by_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    rejectedReason: text("rejected_reason"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: integer("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("library_knowledge_release_gate_overrides_tenant_active_idx").on(
      t.tenantId,
      t.status,
      t.expiresAt
    ),
    index("library_knowledge_release_gate_overrides_scope_idx").on(
      t.scopeType,
      t.scopeId,
      t.status,
      t.expiresAt
    ),
  ]
);

export type LibraryKnowledgeReleaseGateOverrideRow =
  typeof libraryKnowledgeReleaseGateOverrides.$inferSelect;
export type InsertLibraryKnowledgeReleaseGateOverrideRow =
  typeof libraryKnowledgeReleaseGateOverrides.$inferInsert;

export const financeCounterparties = pgTable(
  "finance_counterparties",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    normalizedName: varchar("normalized_name", { length: 512 }).notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_counterparties_tenant_normalized_unique").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId,
      t.normalizedName
    ),
    index("finance_counterparties_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_counterparties_tenant_usage_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.usageCount
    ),
    index("finance_counterparties_last_seen_idx").on(t.tenantId, t.lastSeenAt),
    index("finance_counterparties_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
  ]
);

export type FinanceCounterparty = typeof financeCounterparties.$inferSelect;
export type InsertFinanceCounterparty =
  typeof financeCounterparties.$inferInsert;

export const financeCounterpartyAliases = pgTable(
  "finance_counterparty_aliases",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    counterpartyId: integer("counterparty_id")
      .notNull()
      .references(() => financeCounterparties.id, { onDelete: "cascade" }),
    aliasName: text("alias_name").notNull(),
    normalizedAlias: varchar("normalized_alias", { length: 512 }).notNull(),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_counterparty_aliases_tenant_normalized_unique").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId,
      t.normalizedAlias
    ),
    index("finance_counterparty_aliases_counterparty_idx").on(t.counterpartyId),
    index("finance_counterparty_aliases_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_counterparty_aliases_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
  ]
);

export type FinanceCounterpartyAlias =
  typeof financeCounterpartyAliases.$inferSelect;
export type InsertFinanceCounterpartyAlias =
  typeof financeCounterpartyAliases.$inferInsert;

export const financePaymentInstitutions = pgTable(
  "finance_payment_institutions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: financePaymentInstitutionKindEnum("kind").notNull().default("bank"),
    displayName: text("display_name").notNull(),
    normalizedName: varchar("normalized_name", { length: 512 }).notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_payment_institutions_tenant_normalized_unique").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId,
      t.kind,
      t.normalizedName
    ),
    index("finance_payment_institutions_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_payment_institutions_tenant_usage_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.usageCount
    ),
    index("finance_payment_institutions_last_seen_idx").on(
      t.tenantId,
      t.lastSeenAt
    ),
    index("finance_payment_institutions_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
  ]
);

export type FinancePaymentInstitution =
  typeof financePaymentInstitutions.$inferSelect;
export type InsertFinancePaymentInstitution =
  typeof financePaymentInstitutions.$inferInsert;

export const financePaymentInstitutionAliases = pgTable(
  "finance_payment_institution_aliases",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    paymentInstitutionId: integer("payment_institution_id")
      .notNull()
      .references(() => financePaymentInstitutions.id, { onDelete: "cascade" }),
    aliasName: text("alias_name").notNull(),
    normalizedAlias: varchar("normalized_alias", { length: 512 }).notNull(),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex(
      "finance_payment_institution_aliases_tenant_normalized_unique"
    ).on(t.tenantId, t.projectId, t.ownerUserId, t.normalizedAlias),
    index("finance_payment_institution_aliases_payment_institution_idx").on(
      t.paymentInstitutionId
    ),
    index("finance_payment_institution_aliases_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_payment_institution_aliases_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
  ]
);

export type FinancePaymentInstitutionAlias =
  typeof financePaymentInstitutionAliases.$inferSelect;
export type InsertFinancePaymentInstitutionAlias =
  typeof financePaymentInstitutionAliases.$inferInsert;

export const financePaymentAccounts = pgTable(
  "finance_payment_accounts",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    paymentInstitutionId: integer("payment_institution_id")
      .notNull()
      .references(() => financePaymentInstitutions.id, { onDelete: "cascade" }),
    kind: financePaymentInstrumentKindEnum("kind").notNull(),
    nickname: text("nickname").notNull(),
    normalizedNickname: varchar("normalized_nickname", {
      length: 512,
    }).notNull(),
    last4: varchar("last4", { length: 4 }),
    maskedIdentifier: text("masked_identifier"),
    usageCount: integer("usage_count").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    isPrimary: boolean("is_primary").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_payment_accounts_tenant_unique").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId,
      t.paymentInstitutionId,
      t.kind,
      t.normalizedNickname
    ),
    index("finance_payment_accounts_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_payment_accounts_payment_institution_idx").on(
      t.paymentInstitutionId
    ),
    index("finance_payment_accounts_last_seen_idx").on(
      t.tenantId,
      t.lastSeenAt
    ),
    index("finance_payment_accounts_usage_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.usageCount
    ),
    index("finance_payment_accounts_primary_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.isPrimary
    ),
    index("finance_payment_accounts_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
  ]
);

export type FinancePaymentAccount = typeof financePaymentAccounts.$inferSelect;
export type InsertFinancePaymentAccount =
  typeof financePaymentAccounts.$inferInsert;

export const financePaymentAccountAliases = pgTable(
  "finance_payment_account_aliases",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    paymentAccountId: integer("payment_account_id")
      .notNull()
      .references(() => financePaymentAccounts.id, { onDelete: "cascade" }),
    aliasName: text("alias_name").notNull(),
    normalizedAlias: varchar("normalized_alias", { length: 512 }).notNull(),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_payment_account_aliases_tenant_normalized_unique").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId,
      t.normalizedAlias
    ),
    index("finance_payment_account_aliases_payment_account_idx").on(
      t.paymentAccountId
    ),
    index("finance_payment_account_aliases_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_payment_account_aliases_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
  ]
);

export type FinancePaymentAccountAlias =
  typeof financePaymentAccountAliases.$inferSelect;
export type InsertFinancePaymentAccountAlias =
  typeof financePaymentAccountAliases.$inferInsert;

export const financeRecurringRules = pgTable(
  "finance_recurring_rules",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: financeTransactionTypeEnum("type").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("THB"),
    categoryCode: varchar("category_code", { length: 64 }).notNull(),
    counterpartyId: integer("counterparty_id").references(
      () => financeCounterparties.id,
      { onDelete: "set null" }
    ),
    counterpartyName: text("counterparty_name"),
    merchantName: text("merchant_name"),
    note: text("note"),
    rrule: text("rrule").notNull(),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("Asia/Bangkok"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    runCount: integer("run_count").notNull().default(0),
    autoConfirm: boolean("auto_confirm").notNull().default(false),
    status: financeRecurringRuleStatusEnum("status")
      .notNull()
      .default("active"),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    sourceHash: varchar("source_hash", { length: 64 }),
    sourceMessageId: integer("source_message_id").references(
      () => messages.id,
      { onDelete: "set null" }
    ),
    sourceLibraryItemId: integer("source_library_item_id").references(
      () => libraryItems.id,
      { onDelete: "set null" }
    ),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_recurring_rules_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("finance_recurring_rules_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_recurring_rules_tenant_status_next_run_idx").on(
      t.tenantId,
      t.status,
      t.nextRunAt
    ),
    index("finance_recurring_rules_source_hash_idx").on(t.sourceHash),
    index("finance_recurring_rules_counterparty_idx").on(t.counterpartyId),
    index("finance_recurring_rules_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
    index("finance_recurring_rules_source_message_idx").on(t.sourceMessageId),
    index("finance_recurring_rules_source_library_item_idx").on(
      t.sourceLibraryItemId
    ),
    check(
      "finance_recurring_rules_amount_minor_positive",
      sql`${t.amountMinor} > 0`
    ),
  ]
);

export type FinanceRecurringRule = typeof financeRecurringRules.$inferSelect;
export type InsertFinanceRecurringRule =
  typeof financeRecurringRules.$inferInsert;

export const financeDrafts = pgTable(
  "finance_drafts",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: financeTransactionTypeEnum("type").notNull(),
    status: financeDraftStatusEnum("status").notNull().default("draft"),
    source: financeSourceEnum("source").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    sourceHash: varchar("source_hash", { length: 64 }),
    semanticFingerprint: varchar("semantic_fingerprint", { length: 64 }),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    missingFields: text("missing_fields")
      .array()
      .notNull()
      .default(sql`'{}'`),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    needsClarification: boolean("needs_clarification").notNull().default(false),
    clarificationPrompt: text("clarification_prompt"),
    sourceMessageId: integer("source_message_id").references(
      () => messages.id,
      { onDelete: "set null" }
    ),
    sourceLibraryItemId: integer("source_library_item_id").references(
      () => libraryItems.id,
      { onDelete: "set null" }
    ),
    recurringRuleId: integer("recurring_rule_id").references(
      () => financeRecurringRules.id,
      { onDelete: "set null" }
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_drafts_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("finance_drafts_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_drafts_tenant_status_created_idx").on(
      t.tenantId,
      t.status,
      t.createdAt
    ),
    index("finance_drafts_source_hash_idx").on(t.sourceHash),
    index("finance_drafts_semantic_fingerprint_idx").on(t.semanticFingerprint),
    index("finance_drafts_source_message_idx").on(t.sourceMessageId),
    index("finance_drafts_source_library_item_idx").on(t.sourceLibraryItemId),
    index("finance_drafts_recurring_rule_idx").on(t.recurringRuleId),
    index("finance_drafts_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
    index("finance_drafts_expires_at_idx").on(t.expiresAt),
  ]
);

export type FinanceDraft = typeof financeDrafts.$inferSelect;
export type InsertFinanceDraft = typeof financeDrafts.$inferInsert;

export const financeTransactions = pgTable(
  "finance_transactions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: financeTransactionTypeEnum("type").notNull(),
    status: financeTransactionStatusEnum("status").notNull().default("draft"),
    source: financeSourceEnum("source").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("THB"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    categoryCode: varchar("category_code", { length: 64 }).notNull(),
    counterpartyId: integer("counterparty_id").references(
      () => financeCounterparties.id,
      { onDelete: "set null" }
    ),
    counterpartyName: text("counterparty_name"),
    merchantName: text("merchant_name"),
    note: text("note"),
    slipReference: text("slip_reference"),
    merchantId: text("merchant_id"),
    paymentFeeMinor: integer("payment_fee_minor"),
    paymentSourceAccountId: integer("payment_source_account_id").references(
      () => financePaymentAccounts.id,
      { onDelete: "set null" }
    ),
    paymentDestinationAccountId: integer(
      "payment_destination_account_id"
    ).references(() => financePaymentAccounts.id, { onDelete: "set null" }),
    paymentSourceName: text("payment_source_name"),
    paymentDestinationName: text("payment_destination_name"),
    paymentMethodKind: financePaymentInstrumentKindEnum("payment_method_kind")
      .notNull()
      .default("unknown"),
    paymentDirection: financePaymentDirectionEnum("payment_direction")
      .notNull()
      .default("unknown"),
    paymentInstrumentConfidence: numeric("payment_instrument_confidence", {
      precision: 3,
      scale: 2,
    }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    sourceHash: varchar("source_hash", { length: 64 }),
    semanticFingerprint: varchar("semantic_fingerprint", { length: 64 }),
    confirmedFromDraftId: integer("confirmed_from_draft_id").references(
      () => financeDrafts.id,
      { onDelete: "set null" }
    ),
    recurringRuleId: integer("recurring_rule_id").references(
      () => financeRecurringRules.id,
      { onDelete: "set null" }
    ),
    sourceMessageId: integer("source_message_id").references(
      () => messages.id,
      { onDelete: "set null" }
    ),
    sourceLibraryItemId: integer("source_library_item_id").references(
      () => libraryItems.id,
      { onDelete: "set null" }
    ),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByUserId: integer("confirmed_by_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: integer("voided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    voidReason: text("void_reason"),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_transactions_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    uniqueIndex("finance_transactions_confirmed_from_draft_unique")
      .on(t.confirmedFromDraftId)
      .where(sql`"confirmed_from_draft_id" IS NOT NULL`),
    index("finance_transactions_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_transactions_tenant_status_occurred_idx").on(
      t.tenantId,
      t.status,
      t.occurredAt
    ),
    index("finance_transactions_source_hash_idx").on(t.sourceHash),
    index("finance_transactions_semantic_fingerprint_idx").on(
      t.semanticFingerprint
    ),
    index("finance_transactions_source_message_idx").on(t.sourceMessageId),
    index("finance_transactions_source_library_item_idx").on(
      t.sourceLibraryItemId
    ),
    index("finance_transactions_recurring_rule_idx").on(t.recurringRuleId),
    index("finance_transactions_counterparty_idx").on(t.counterpartyId),
    index("finance_transactions_payment_source_account_idx").on(
      t.paymentSourceAccountId
    ),
    index("finance_transactions_payment_destination_account_idx").on(
      t.paymentDestinationAccountId
    ),
    index("finance_transactions_payment_method_kind_idx").on(
      t.paymentMethodKind
    ),
    index("finance_transactions_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
    index("finance_transactions_owner_voided_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.voidedAt
    ),
    check(
      "finance_transactions_amount_minor_positive",
      sql`${t.amountMinor} > 0`
    ),
  ]
);

export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type InsertFinanceTransaction = typeof financeTransactions.$inferInsert;

export const documentExtractions = pgTable(
  "document_extractions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    financeDraftId: integer("finance_draft_id").references(
      () => financeDrafts.id,
      { onDelete: "set null" }
    ),
    source: financeSourceEnum("source").notNull().default("ocr_document"),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    sourceHash: varchar("source_hash", { length: 64 }),
    ocrProvider: varchar("ocr_provider", { length: 64 }).notNull(),
    ocrText: text("ocr_text").notNull(),
    ocrJson: jsonb("ocr_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    extractedJson: jsonb("extracted_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    confidenceJson: jsonb("confidence_json")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    pageCount: integer("page_count").notNull().default(1),
    sourceMessageId: integer("source_message_id").references(
      () => messages.id,
      { onDelete: "set null" }
    ),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("document_extractions_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("document_extractions_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("document_extractions_library_item_idx").on(t.libraryItemId),
    index("document_extractions_finance_draft_idx").on(t.financeDraftId),
    index("document_extractions_source_hash_idx").on(t.sourceHash),
    index("document_extractions_source_message_idx").on(t.sourceMessageId),
    index("document_extractions_file_hash_idx").on(t.fileHash),
    index("document_extractions_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
    check("document_extractions_page_count_positive", sql`${t.pageCount} > 0`),
  ]
);

export type DocumentExtraction = typeof documentExtractions.$inferSelect;
export type InsertDocumentExtraction = typeof documentExtractions.$inferInsert;

export const financeTransactionDocuments = pgTable(
  "finance_transaction_documents",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => financeTransactions.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    sourceExtractionId: integer("source_extraction_id").references(
      () => documentExtractions.id,
      { onDelete: "set null" }
    ),
    role: financeDocumentRoleEnum("role").notNull().default("supporting"),
    note: text("note"),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("finance_transaction_documents_link_unique").on(
      t.transactionId,
      t.libraryItemId,
      t.role
    ),
    index("finance_transaction_documents_tenant_project_owner_idx").on(
      t.tenantId,
      t.projectId,
      t.ownerUserId
    ),
    index("finance_transaction_documents_transaction_idx").on(t.transactionId),
    index("finance_transaction_documents_library_item_idx").on(t.libraryItemId),
    index("finance_transaction_documents_source_extraction_idx").on(
      t.sourceExtractionId
    ),
    index("finance_transaction_documents_allowed_scopes_gin_idx").using(
      "gin",
      t.allowedScopes
    ),
  ]
);

export type FinanceTransactionDocument =
  typeof financeTransactionDocuments.$inferSelect;
export type InsertFinanceTransactionDocument =
  typeof financeTransactionDocuments.$inferInsert;

// ============================================================
// Presentation Editing Tables
// ============================================================

// Audio track shapes stored in JSON columns.
// Zod validation is in shared/presentation/contracts.ts (Section 02).
export type SlideAudioTrackJson = {
  libraryItemId: number;
  volume: number; // 0.0 – 1.0
  startAtMs: number; // default 0
  endAtMs: number | null; // null = play to natural end
};

export type DeckAudioTrackJson = {
  libraryItemId: number;
  volume: number; // 0.0 – 1.0
  startAtMs?: number; // default 0
  endAtMs?: number | null; // null = play to natural end
  loop: boolean;
  fadeOutMs: number | null;
};

export const presentationDecks = pgTable(
  "presentation_decks",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    slideCount: integer("slide_count").notNull().default(0),
    totalAssetBytes: integer("total_asset_bytes").notNull().default(0),
    projectAudioTrack: json(
      "project_audio_track"
    ).$type<DeckAudioTrackJson | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("presentation_decks_library_item_unique").on(t.libraryItemId),
    uniqueIndex("presentation_decks_id_tenant_unique").on(t.id, t.tenantId),
    index("presentation_decks_tenant_idx").on(t.tenantId),
    index("presentation_decks_tenant_updated_idx").on(t.tenantId, t.updatedAt),
  ]
);

export type PresentationDeck = typeof presentationDecks.$inferSelect;
export type InsertPresentationDeck = typeof presentationDecks.$inferInsert;

export const presentationSlides = pgTable(
  "presentation_slides",
  {
    id: serial("id").primaryKey(),
    deckId: integer("deck_id")
      .notNull()
      .references(() => presentationDecks.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    version: integer("version").notNull().default(1),
    title: varchar("title", { length: 255 }).notNull().default("Slide"),
    slideContent: json("slide_content")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    audioTrack: json("audio_track").$type<SlideAudioTrackJson | null>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("presentation_slides_deck_order_unique").on(
      t.deckId,
      t.orderIndex
    ),
    uniqueIndex("presentation_slides_deck_id_unique").on(t.deckId, t.id),
    index("presentation_slides_deck_idx").on(t.deckId),
    index("presentation_slides_deck_updated_idx").on(t.deckId, t.updatedAt),
  ]
);

export type PresentationSlide = typeof presentationSlides.$inferSelect;
export type InsertPresentationSlide = typeof presentationSlides.$inferInsert;

export const presentationAssetLinks = pgTable(
  "presentation_asset_links",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    deckId: integer("deck_id")
      .notNull()
      .references(() => presentationDecks.id, { onDelete: "cascade" }),
    slideId: integer("slide_id").references(() => presentationSlides.id, {
      onDelete: "set null",
    }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    byteSize: integer("byte_size").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("presentation_asset_links_unique").on(
      t.deckId,
      t.slideId,
      t.libraryItemId
    ),
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
  ]
);

export type PresentationAssetLink = typeof presentationAssetLinks.$inferSelect;
export type InsertPresentationAssetLink =
  typeof presentationAssetLinks.$inferInsert;

export const presentationSourceAttachments = pgTable(
  "presentation_source_attachments",
  {
    id: serial("id").primaryKey(),
    deckId: integer("deck_id")
      .notNull()
      .references(() => presentationDecks.id, { onDelete: "cascade" }),
    sourceLibraryItemId: integer("source_library_item_id").references(
      () => libraryItems.id,
      { onDelete: "set null" }
    ),
    sourceFormat: varchar("source_format", { length: 16 }).notNull(),
    conversionStatus: varchar("conversion_status", { length: 32 })
      .notNull()
      .default("pending"),
    partialFidelity: boolean("partial_fidelity").notNull().default(false),
    fidelityWarnings: json("fidelity_warnings")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("presentation_source_attachments_deck_unique").on(t.deckId),
    index("presentation_source_attachments_source_item_idx").on(
      t.sourceLibraryItemId
    ),
  ]
);

export type PresentationSourceAttachment =
  typeof presentationSourceAttachments.$inferSelect;
export type InsertPresentationSourceAttachment =
  typeof presentationSourceAttachments.$inferInsert;

export const presentationConversionRecords = pgTable(
  "presentation_conversion_records",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    // Nullable: no source library item for Google Slides imports
    sourceItemId: integer("source_item_id").references(() => libraryItems.id, {
      onDelete: "cascade",
    }),

    sourceFormat: varchar("source_format", { length: 16 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),

    // Nullable: set by callback handler after deck creation completes
    deckLibraryItemId: integer("deck_library_item_id").references(
      () => libraryItems.id,
      { onDelete: "cascade" }
    ),

    // Nullable: set by callback handler after deck creation completes
    deckId: integer("deck_id").references(() => presentationDecks.id, {
      onDelete: "cascade",
    }),

    // job lifecycle tracking
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    // Values: "queued" | "processing" | "done" | "failed" | "cancelled"

    progress: integer("progress").notNull().default(0),
    // Values: 0–100

    // required so the callback handler can construct a PresentationActor
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // stores Google Slides URL when sourceFormat is "google_slides"
    slidesUrl: varchar("slides_url", { length: 2048 }),

    partialFidelity: boolean("partial_fidelity").notNull().default(false),
    fidelityWarnings: json("fidelity_warnings")
      .$type<string[]>()
      .notNull()
      .default([]),

    // Nullable: set by callback handler when job fails (surfaces failure reason to frontend)
    error: text("error"),

    /** Associated sandbox job ID (if conversion ran in sandbox) */
    sandboxJobId: varchar("sandbox_job_id", { length: 36 }),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    // Partial unique index: restricts uniqueness only for PPTX imports that have a real sourceItemId.
    // PostgreSQL allows multiple NULLs in a unique index, so a plain index on
    // (tenantId, sourceItemId) would permit any number of Google Slides rows
    // (all with sourceItemId=NULL). The partial index restricts uniqueness only
    // for PPTX imports that have a real sourceItemId.
    uniqueIndex("presentation_conversion_records_source_unique")
      .on(t.tenantId, t.sourceItemId)
      .where(sql`${t.sourceItemId} IS NOT NULL`),

    // Idempotency lookup index
    index("presentation_conversion_records_idempotency_idx").on(
      t.tenantId,
      t.sourceItemId,
      t.idempotencyKey
    ),

    index("presentation_conversion_records_expires_at_idx").on(t.expiresAt),

    // lookup by userId for ownership queries
    index("presentation_conversion_records_user_idx").on(t.userId),
  ]
);

export type PresentationConversionRecord =
  typeof presentationConversionRecords.$inferSelect;
export type InsertPresentationConversionRecord =
  typeof presentationConversionRecords.$inferInsert;

export const presentationConversionLocks = pgTable(
  "presentation_conversion_locks",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceItemId: integer("source_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    lockToken: varchar("lock_token", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("presentation_conversion_locks_source_unique").on(
      t.tenantId,
      t.sourceItemId
    ),
    index("presentation_conversion_locks_expires_at_idx").on(t.expiresAt),
  ]
);

export type PresentationConversionLock =
  typeof presentationConversionLocks.$inferSelect;
export type InsertPresentationConversionLock =
  typeof presentationConversionLocks.$inferInsert;

// ============================================================
// Presentation Export Jobs
// ============================================================

export const presentationExports = pgTable(
  "presentation_exports",
  {
    id: serial("id").primaryKey(),

    // FK to deck — cascade delete (export history gone when deck is deleted)
    deckId: integer("deck_id")
      .notNull()
      .references(() => presentationDecks.id, { onDelete: "cascade" }),

    // FK to user — set null (preserve export audit trail if user is deleted)
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    tenantId: varchar("tenant_id", { length: 36 }).notNull(),

    // Export parameters
    format: varchar("format", { length: 16 }).notNull(), // png | jpg | pdf | mp4
    quality: varchar("quality", { length: 12 }), // draft | standard | high
    width: integer("width").notNull().default(1920),
    height: integer("height").notNull().default(1080),
    fps: integer("fps"), // MP4 only; default 30 in Python task

    // Job lifecycle
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    // queued | processing | done | error | cancelled
    progressPct: integer("progress_pct").notNull().default(0), // 0 – 100
    stage: varchar("stage", { length: 64 }), // e.g. "rendering", "encoding", "uploading"
    errorMessage: text("error_message"),

    // Output
    outputUrl: text("output_url"), // 24-hour presigned S3/R2 download URL
    outputStorageKey: text("output_storage_key"), // raw S3 key; used to re-presign if expired
    outputBytes: bigint("output_bytes", { mode: "number" }),

    // Celery bridge
    celeryTaskId: varchar("celery_task_id", { length: 255 }),

    // Deduplication (unique constraint enforced below)
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("presentation_exports_idempotency_key_unique").on(
      t.idempotencyKey
    ),
    index("presentation_exports_deck_idx").on(t.deckId),
    index("presentation_exports_user_idx").on(t.userId),
    index("presentation_exports_tenant_idx").on(t.tenantId),
    index("presentation_exports_celery_task_idx").on(t.celeryTaskId),
    index("presentation_exports_tenant_status_idx").on(t.tenantId, t.status),
  ]
);

export type PresentationExport = typeof presentationExports.$inferSelect;
export type InsertPresentationExport = typeof presentationExports.$inferInsert;

// ============================================================
// Google Drive Integration Tables
// ============================================================

/**
 * Stores per-user Google Drive sync configuration and webhook channel tracking.
 * One row per user per tenant.
 */
export const googleDriveSyncState = pgTable(
  "google_drive_sync_state",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("gdrive_sync_tenant_user_unique").on(t.tenantId, t.userId),
    index("gdrive_sync_channel_id_idx").on(t.channelId),
  ]
);

export type GoogleDriveSyncState = typeof googleDriveSyncState.$inferSelect;
export type InsertGoogleDriveSyncState =
  typeof googleDriveSyncState.$inferInsert;

/**
 * Tracks active editing sessions where a library file has been uploaded
 * to Google Drive for editing in Google Docs/Sheets.
 */
export const googleDriveEditSessions = pgTable(
  "google_drive_edit_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    driveFileId: varchar("drive_file_id", { length: 128 }).notNull(),
    editUrl: text("edit_url").notNull(),
    originalSourceUrl: text("original_source_url"),
    status: editSessionStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("gdrive_edit_tenant_user_status_idx").on(
      t.tenantId,
      t.userId,
      t.status
    ),
    index("gdrive_edit_library_item_idx").on(t.libraryItemId),
    index("gdrive_edit_expires_at_idx").on(t.expiresAt),
  ]
);

export type GoogleDriveEditSession =
  typeof googleDriveEditSessions.$inferSelect;
export type InsertGoogleDriveEditSession =
  typeof googleDriveEditSessions.$inferInsert;

// ============================================================
// OneDrive (Microsoft Graph) Integration Tables
// ============================================================

/**
 * Stores per-user OneDrive sync configuration and subscription tracking.
 * One row per user per tenant. Mirrors google_drive_sync_state but uses
 * Microsoft Graph delta queries + subscriptions instead of Google's
 * Changes API + webhook channels.
 */
export const onedriveSyncState = pgTable(
  "onedrive_sync_state",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    indexingMode: indexingModeEnum("indexing_mode").notNull().default("none"),
    folderSelections: jsonb("folder_selections").$type<string[]>().default([]),
    fileTypeFilter: jsonb("file_type_filter").$type<string[]>().default([]),
    maxFileSizeBytes: integer("max_file_size_bytes").default(52428800),
    deltaLink: text("delta_link"),
    subscriptionId: varchar("subscription_id", { length: 128 }),
    subscriptionExpiry: timestamp("subscription_expiry", {
      withTimezone: true,
    }),
    filesTotal: integer("files_total").default(0),
    filesProcessed: integer("files_processed").default(0),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    autoSyncEnabled: boolean("auto_sync_enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("onedrive_sync_tenant_user_unique").on(t.tenantId, t.userId),
    index("onedrive_sync_subscription_id_idx").on(t.subscriptionId),
  ]
);

export type OnedriveSyncState = typeof onedriveSyncState.$inferSelect;
export type InsertOnedriveSyncState = typeof onedriveSyncState.$inferInsert;

/**
 * Tracks active editing sessions where a library file has been uploaded
 * to OneDrive for editing in Office Online (Word/Excel/PowerPoint).
 */
export const onedriveEditSessions = pgTable(
  "onedrive_edit_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    driveItemId: varchar("drive_item_id", { length: 256 }).notNull(),
    editUrl: text("edit_url").notNull(),
    originalSourceUrl: text("original_source_url"),
    status: editSessionStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("onedrive_edit_tenant_user_status_idx").on(
      t.tenantId,
      t.userId,
      t.status
    ),
    index("onedrive_edit_library_item_idx").on(t.libraryItemId),
    index("onedrive_edit_expires_at_idx").on(t.expiresAt),
  ]
);

export type OnedriveEditSession = typeof onedriveEditSessions.$inferSelect;
export type InsertOnedriveEditSession =
  typeof onedriveEditSessions.$inferInsert;

/**
 * Per-user monthly credit budget limits.
 * Applies to ALL credit-consuming operations system-wide.
 */
export const userCreditBudgets = pgTable(
  "user_credit_budgets",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    monthlyLimit: integer("monthly_limit").notNull(),
    creditsUsedThisMonth: integer("credits_used_this_month")
      .notNull()
      .default(0),
    budgetMonthKey: varchar("budget_month_key", { length: 7 }).notNull(),
    alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
    alertSent: boolean("alert_sent").notNull().default(false),
    hardCapReached: boolean("hard_cap_reached").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("user_credit_budgets_tenant_user_unique").on(
      t.tenantId,
      t.userId
    ),
  ]
);

export type UserCreditBudget = typeof userCreditBudgets.$inferSelect;
export type InsertUserCreditBudget = typeof userCreditBudgets.$inferInsert;

/**
 * Skill Category Enum
 * Categorizes skills for filtering and organization
 */
export const skillCategoryEnum = pgEnum("skill_category", [
  "image_generation", // Generate Images
  "image_prompt_generation", // Create prompts for image generation
  "video_generation", // Generate Video
  "video_prompt_generation", // Create prompts for video generation
  "image_video_generation", // Generate both Image and Video
  "audio_generation", // Generate Text To Speech
  "audio_prompt_generation", // Create prompts for audio generation
  "article_generation", // Generate source articles / presentation drafts
  "product_review", // Product review generation (household, beauty, fashion, etc.)
  "sound_effects", // Generate Sound Effects
  "prompt_enhancement", // Enhance prompts
  "code_assistant", // Code help
  "document_analysis", // Document processing
  "web_search", // Web search
  "data_analysis", // Data analysis
  "translation", // Translation
  "summarization", // Summarization
  "chat_assistant", // General chat
  "automation", // Workflow automation
  "other", // Other
]);

export const skillMaintenanceRecommendationStatusEnum = pgEnum(
  "skill_maintenance_recommendation_status",
  ["pending_review", "approved", "dismissed", "applied", "blocked", "failed"]
);

export const skillMaintenanceRiskLevelEnum = pgEnum(
  "skill_maintenance_risk_level",
  ["low", "medium", "high", "critical"]
);

export const skillMaintenanceRunTypeEnum = pgEnum(
  "skill_maintenance_run_type",
  ["analysis", "apply", "sweep", "verify"]
);

export const skillMaintenanceRunStatusEnum = pgEnum(
  "skill_maintenance_run_status",
  ["queued", "running", "completed", "failed", "blocked", "canceled"]
);

export const skillMaintenanceCompatibilityStatusEnum = pgEnum(
  "skill_maintenance_compatibility_status",
  ["unknown", "compatible", "warning", "blocked"]
);

export const skillMaintenanceScheduleStatusEnum = pgEnum(
  "skill_maintenance_schedule_status",
  ["active", "paused", "disabled"]
);

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
  triggerPatterns: json("triggerPatterns")
    .$type<
      Array<
        | string
        | {
            pattern: string;
            chainTo?: string | null;
            label?: string;
          }
      >
    >()
    .default([]),

  /** Whether skill is enabled globally */
  isEnabled: boolean("isEnabled").default(true).notNull(),

  /** Whether skill is enabled by default for new conversations */
  enabledByDefault: boolean("enabledByDefault").default(true).notNull(),

  /** Whether skill is visible by default for new users (admin-controlled) */
  visibleByDefault: boolean("visibleByDefault").default(true).notNull(),

  /** Credit cost multiplier (1.0 = standard rate) */
  creditMultiplier: numeric("creditMultiplier", {
    precision: 5,
    scale: 2,
  }).default("1.0"),

  /** Priority for detection (higher = checked first) */
  priority: integer("priority").default(50).notNull(),

  /** Available models for this skill (if media-related) */
  availableModels: json("availableModels").$type<string[]>(),

  /** Default model for this skill */
  defaultModel: varchar("defaultModel", { length: 128 }),

  /** Canonical routed LLM model id for text-generation skills */
  llmModelId: varchar("llmModelId", { length: 128 }),

  /** Preferred provider pin for this skill (optional) */
  preferredProviderId: integer("preferredProviderId").references(
    () => llmProviders.id
  ),

  /** Enforce provider pin without fallback when true */
  strictProviderPin: boolean("strictProviderPin").default(false).notNull(),

  /** Execution mode: llm-only (text response), media-generate (LLM→prompt→media API) */
  executionMode: varchar("executionMode", { length: 50 })
    .default("llm-only")
    .notNull(),

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
    pythonEntry?: string; // python/tool.py
    jsEntry?: string; // js/index.js
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

  /** Capability-first execution policy (parsed from skill.md frontmatter) */
  executionPolicyJson: json("executionPolicyJson").$type<{
    mode?: "requirements" | "fixed" | "hybrid";
    requirements?: Record<string, boolean | number>;
    fixedModel?: string;
    allowConversationOverride?: boolean;
    preferredStrategy?: string;
    preferredProfiles?: string[];
    allowedFallbackProfiles?: string[];
    disallowedModels?: string[];
    budgetClass?: string;
    overrideableByTenant?: boolean;
    fallbackPolicy?: string;
  }>(),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Skill = typeof skills.$inferSelect;
export type InsertSkill = typeof skills.$inferInsert;

export const skillMaintenanceSchedules = pgTable(
  "skill_maintenance_schedules",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: skillMaintenanceScheduleStatusEnum("status")
      .notNull()
      .default("active"),
    cronExpression: varchar("cronExpression", { length: 128 }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    scopeType: varchar("scopeType", { length: 50 })
      .notNull()
      .default("all_skills"),
    scopeJson: jsonb("scopeJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    policyJson: jsonb("policyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdBy: integer("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    lastRunAt: timestamp("lastRunAt", { withTimezone: true }),
    nextRunAt: timestamp("nextRunAt", { withTimezone: true }),
    runningAt: timestamp("runningAt", { withTimezone: true }),
    lockToken: varchar("lockToken", { length: 80 }),
    lockExpiresAt: timestamp("lockExpiresAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("skill_maintenance_schedules_status_next_run_idx").on(
      t.status,
      t.nextRunAt
    ),
    index("skill_maintenance_schedules_tenant_status_idx").on(
      t.tenantId,
      t.status
    ),
    index("skill_maintenance_schedules_lock_expiry_idx").on(
      t.status,
      t.lockExpiresAt
    ),
  ]
);

export type SkillMaintenanceSchedule =
  typeof skillMaintenanceSchedules.$inferSelect;
export type InsertSkillMaintenanceSchedule =
  typeof skillMaintenanceSchedules.$inferInsert;

export const skillImprovementRecommendations = pgTable(
  "skill_improvement_recommendations",
  {
    id: serial("id").primaryKey(),
    skillId: integer("skillId")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    scheduleId: integer("scheduleId").references(
      () => skillMaintenanceSchedules.id,
      { onDelete: "set null" }
    ),
    recommendationType: varchar("recommendationType", {
      length: 100,
    }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    rationale: text("rationale"),
    status: skillMaintenanceRecommendationStatusEnum("status")
      .notNull()
      .default("pending_review"),
    riskLevel: skillMaintenanceRiskLevelEnum("riskLevel")
      .notNull()
      .default("medium"),
    compatibilityStatus: skillMaintenanceCompatibilityStatusEnum(
      "compatibilityStatus"
    )
      .notNull()
      .default("unknown"),
    qualityScore: integer("qualityScore"),
    confidenceScore: integer("confidenceScore"),
    currentRuntime: varchar("currentRuntime", { length: 64 }),
    proposedRuntime: varchar("proposedRuntime", { length: 64 }),
    proposedAction: varchar("proposedAction", { length: 100 }),
    isAutoApplySafe: boolean("isAutoApplySafe").notNull().default(false),
    isGenjsCandidate: boolean("isGenjsCandidate").notNull().default(false),
    recommendationJson: jsonb("recommendationJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    contractDeltaJson: jsonb("contractDeltaJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    analyzedAt: timestamp("analyzedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewedAt", { withTimezone: true }),
    reviewedBy: integer("reviewedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approvedAt", { withTimezone: true }),
    approvedBy: integer("approvedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    dismissedAt: timestamp("dismissedAt", { withTimezone: true }),
    dismissedBy: integer("dismissedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    appliedAt: timestamp("appliedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("skill_improvement_recommendations_skill_status_idx").on(
      t.skillId,
      t.status
    ),
    index("skill_improvement_recommendations_status_risk_idx").on(
      t.status,
      t.riskLevel
    ),
    index("skill_improvement_recommendations_schedule_idx").on(
      t.scheduleId,
      t.status
    ),
  ]
);

export type SkillImprovementRecommendation =
  typeof skillImprovementRecommendations.$inferSelect;
export type InsertSkillImprovementRecommendation =
  typeof skillImprovementRecommendations.$inferInsert;

export const skillImprovementRuns = pgTable(
  "skill_improvement_runs",
  {
    id: serial("id").primaryKey(),
    skillId: integer("skillId").references(() => skills.id, {
      onDelete: "cascade",
    }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    scheduleId: integer("scheduleId").references(
      () => skillMaintenanceSchedules.id,
      { onDelete: "set null" }
    ),
    recommendationId: integer("recommendationId").references(
      () => skillImprovementRecommendations.id,
      { onDelete: "set null" }
    ),
    runType: skillMaintenanceRunTypeEnum("runType").notNull(),
    status: skillMaintenanceRunStatusEnum("status").notNull().default("queued"),
    triggerSource: varchar("triggerSource", { length: 50 })
      .notNull()
      .default("manual"),
    requestedBy: integer("requestedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    summary: text("summary"),
    errorMessage: text("errorMessage"),
    scopeJson: jsonb("scopeJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    logsJson: jsonb("logsJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    metricsJson: jsonb("metricsJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    verificationJson: jsonb("verificationJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    diffSummaryJson: jsonb("diffSummaryJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    endedAt: timestamp("endedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("skill_improvement_runs_skill_created_idx").on(
      t.skillId,
      t.createdAt
    ),
    index("skill_improvement_runs_schedule_created_idx").on(
      t.scheduleId,
      t.createdAt
    ),
    index("skill_improvement_runs_recommendation_created_idx").on(
      t.recommendationId,
      t.createdAt
    ),
    index("skill_improvement_runs_status_created_idx").on(
      t.status,
      t.createdAt
    ),
  ]
);

export type SkillImprovementRun = typeof skillImprovementRuns.$inferSelect;
export type InsertSkillImprovementRun =
  typeof skillImprovementRuns.$inferInsert;

export const skillContractSnapshots = pgTable(
  "skill_contract_snapshots",
  {
    id: serial("id").primaryKey(),
    skillId: integer("skillId")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    recommendationId: integer("recommendationId").references(
      () => skillImprovementRecommendations.id,
      { onDelete: "set null" }
    ),
    runId: integer("runId").references(() => skillImprovementRuns.id, {
      onDelete: "set null",
    }),
    snapshotType: varchar("snapshotType", { length: 50 })
      .notNull()
      .default("baseline"),
    executionMode: varchar("executionMode", { length: 50 }),
    runtimeProfile: varchar("runtimeProfile", { length: 64 }),
    manifestPath: varchar("manifestPath", { length: 512 }),
    manifestHash: varchar("manifestHash", { length: 64 }),
    inputSchemaHash: varchar("inputSchemaHash", { length: 64 }),
    outputSchemaHash: varchar("outputSchemaHash", { length: 64 }),
    fixtureHash: varchar("fixtureHash", { length: 64 }),
    testsHash: varchar("testsHash", { length: 64 }),
    contractHash: varchar("contractHash", { length: 64 }),
    schemaSummaryJson: jsonb("schemaSummaryJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sampleInputsJson: jsonb("sampleInputsJson")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    sampleOutputsJson: jsonb("sampleOutputsJson")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    compatibilityNotesJson: jsonb("compatibilityNotesJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    snapshotJson: jsonb("snapshotJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    capturedAt: timestamp("capturedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("skill_contract_snapshots_skill_captured_idx").on(
      t.skillId,
      t.capturedAt
    ),
    index("skill_contract_snapshots_recommendation_idx").on(t.recommendationId),
    index("skill_contract_snapshots_run_idx").on(t.runId),
    index("skill_contract_snapshots_contract_hash_idx").on(t.contractHash),
  ]
);

export type SkillContractSnapshot = typeof skillContractSnapshots.$inferSelect;
export type InsertSkillContractSnapshot =
  typeof skillContractSnapshots.$inferInsert;

/**
 * Skill Permissions — controls which groups can use a private skill
 * Simplified model: only group-based access (no per-user or role subjects)
 */
export const skillPermissions = pgTable(
  "skill_permissions",
  {
    id: serial("id").primaryKey(),
    skillId: integer("skillId")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    groupId: integer("groupId")
      .notNull()
      .references(() => userGroups.id, { onDelete: "cascade" }),
    grantedByUserId: integer("grantedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("skill_permissions_unique").on(t.skillId, t.groupId),
    index("skill_permissions_group_idx").on(t.groupId),
  ]
);

export type SkillPermission = typeof skillPermissions.$inferSelect;
export type InsertSkillPermission = typeof skillPermissions.$inferInsert;

/**
 * Skill Likes — per-user like tracking for marketplace
 */
export const skillLikes = pgTable(
  "skill_likes",
  {
    id: serial("id").primaryKey(),
    skillId: integer("skillId")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [uniqueIndex("skill_likes_unique").on(t.skillId, t.userId)]
);

export type SkillLike = typeof skillLikes.$inferSelect;

/**
 * Skill Comments — flat comments for marketplace skill pages
 */
export const skillComments = pgTable("skill_comments", {
  id: serial("id").primaryKey(),
  skillId: integer("skillId")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SkillComment = typeof skillComments.$inferSelect;

/**
 * User Skill Visibility — per-user skill visibility preferences
 * Controls which skills appear in a user's chat panel and slash commands
 */
export const userSkillVisibility = pgTable(
  "user_skill_visibility",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: integer("skillId")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    visible: boolean("visible").default(true).notNull(),
    autoTriggerEnabled: boolean("autoTriggerEnabled").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [uniqueIndex("user_skill_visibility_unique").on(t.userId, t.skillId)]
);

export type UserSkillVisibility = typeof userSkillVisibility.$inferSelect;
export type InsertUserSkillVisibility = typeof userSkillVisibility.$inferInsert;

/**
 * Storage Provider Type Enum
 * Defines the type of object storage provider
 */
export const storageProviderTypeEnum = pgEnum("storage_provider_type", [
  "r2",
  "s3",
  "local",
]);

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type StorageSettings = typeof storageSettings.$inferSelect;
export type InsertStorageSettings = typeof storageSettings.$inferInsert;

export const desktopInstallerReleases = pgTable(
  "desktop_installer_releases",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 64 }).notNull(),
    platform: text("platform").notNull(),
    channel: text("channel").notNull().default("stable"),
    installerFormat: text("installerFormat").notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    contentType: varchar("contentType", { length: 255 })
      .notNull()
      .default("application/octet-stream"),
    storageKey: text("storageKey").notNull(),
    fileSizeBytes: bigint("fileSizeBytes", { mode: "number" }).notNull(),
    fileSha256: varchar("fileSha256", { length: 64 }).notNull(),
    releaseNotes: text("releaseNotes"),
    isPublished: boolean("isPublished").notNull().default(true),
    publishedAt: timestamp("publishedAt", { withTimezone: true }),
    uploadedBy: integer("uploadedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploadedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_desktop_installer_releases_platform_published").on(
      t.platform,
      t.isPublished,
      t.publishedAt
    ),
    index("idx_desktop_installer_releases_version").on(t.version),
    uniqueIndex("desktop_installer_releases_storage_key_unique").on(
      t.storageKey
    ),
  ]
);

export type DesktopInstallerRelease =
  typeof desktopInstallerReleases.$inferSelect;
export type InsertDesktopInstallerRelease =
  typeof desktopInstallerReleases.$inferInsert;

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SystemSettings = typeof systemSettings.$inferSelect;
export type InsertSystemSettings = typeof systemSettings.$inferInsert;

export const workpackRecordTypeEnum = pgEnum("workpack_record_type", [
  "case_source",
  "playbook",
  "workpack",
  "workpack_version",
  "workpack_run",
  "simulation_run",
  "workpack_exception",
  "benchmark_pack",
  "promotion_record",
  "improvement_proposal",
  "telemetry_event",
  "metric_snapshot",
  "incident_record",
  "schedule_record",
]);

export const workpackRecords = pgTable(
  "workpack_records",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recordType: workpackRecordTypeEnum("recordType").notNull(),
    recordId: varchar("recordId", { length: 128 }).notNull(),
    workpackId: varchar("workpackId", { length: 128 }),
    sortTimestamp: timestamp("sortTimestamp", { withTimezone: true }),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("workpack_records_tenant_type_record_unique").on(
      t.tenantId,
      t.recordType,
      t.recordId
    ),
    index("workpack_records_type_record_idx").on(t.recordType, t.recordId),
    index("workpack_records_tenant_type_idx").on(t.tenantId, t.recordType),
    index("workpack_records_tenant_workpack_idx").on(t.tenantId, t.workpackId),
    index("workpack_records_tenant_type_sort_idx").on(
      t.tenantId,
      t.recordType,
      t.sortTimestamp
    ),
  ]
);

export type WorkpackRecord = typeof workpackRecords.$inferSelect;
export type InsertWorkpackRecord = typeof workpackRecords.$inferInsert;

export const roleRecordTypeEnum = pgEnum("role_record_type", [
  "role_blueprint",
  "role_agent",
  "role_contract",
  "role_workpack_binding",
  "role_routine",
  "role_routine_run",
  "role_checkpoint",
  "role_message",
  "role_handoff",
  "role_metric_snapshot",
  "role_exception_binding",
  "role_improvement_proposal",
  "role_promotion_gate",
  "role_telemetry_event",
  "role_incident_record",
  "role_routine_queue_item",
  "role_approval_request",
  "role_memory_item",
]);

export const roleRecords = pgTable(
  "role_records",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recordType: roleRecordTypeEnum("recordType").notNull(),
    recordId: varchar("recordId", { length: 128 }).notNull(),
    roleId: varchar("roleId", { length: 128 }),
    routineId: varchar("routineId", { length: 128 }),
    routineRunId: varchar("routineRunId", { length: 128 }),
    sortTimestamp: timestamp("sortTimestamp", { withTimezone: true }),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("role_records_tenant_type_record_unique").on(
      t.tenantId,
      t.recordType,
      t.recordId
    ),
    index("role_records_type_record_idx").on(t.recordType, t.recordId),
    index("role_records_tenant_type_idx").on(t.tenantId, t.recordType),
    index("role_records_tenant_role_idx").on(t.tenantId, t.roleId),
    index("role_records_tenant_routine_idx").on(t.tenantId, t.routineId),
    index("role_records_tenant_routine_run_idx").on(t.tenantId, t.routineRunId),
    index("role_records_tenant_type_sort_idx").on(
      t.tenantId,
      t.recordType,
      t.sortTimestamp
    ),
  ]
);

export type RoleRecord = typeof roleRecords.$inferSelect;
export type InsertRoleRecord = typeof roleRecords.$inferInsert;

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
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
    onDelete: "cascade",
  }),

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
  customFields: json("customFields").$type<
    Array<{
      label: string;
      value: string;
    }>
  >(),

  /** Is this config active */
  isActive: boolean("isActive").default(true),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type InvoiceConfig = typeof invoiceConfig.$inferSelect;
export type InsertInvoiceConfig = typeof invoiceConfig.$inferInsert;

// ============================================================
// Billing Domain — Feature 066
// ============================================================

export const billingSubscriptionStatusEnum = pgEnum(
  "billing_subscription_status",
  ["pending_migration", "active", "past_due", "downgraded_to_free", "canceled"]
);

export const billingSubscriptionSourceEnum = pgEnum(
  "billing_subscription_source",
  ["legacy_backfill", "beam_manual_invoice", "admin_created"]
);

export const invoiceStreamEnum = pgEnum("invoice_stream", [
  "domestic",
  "international",
]);
export const invoiceTypeEnum = pgEnum("invoice_type", [
  "subscription_renewal",
  "topup",
  "manual",
  "replacement",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "payment_pending",
  "paid",
  "expired",
  "canceled",
  "canceled_overdue",
  "replaced",
]);
export const documentLanguageEnum = pgEnum("document_language", [
  "th",
  "en",
  "bilingual",
]);
export const invoiceDocumentRenderReasonEnum = pgEnum(
  "invoice_document_render_reason",
  [
    "initial_issue",
    "sync_header",
    "language_variant",
    "reissue_render",
    "manual_regeneration",
  ]
);
export const renderedByTypeEnum = pgEnum("rendered_by_type", [
  "system",
  "admin",
  "user",
]);
export const paymentProviderEnum = pgEnum("payment_provider", ["beam"]);
export const providerPaymentTypeEnum = pgEnum("provider_payment_type", [
  "charge",
  "payment_link",
]);
export const paymentMethodTypeEnum = pgEnum("payment_method_type", ["card"]);
export const billingPaymentMethodStatusEnum = pgEnum(
  "billing_payment_method_status",
  [
    "active",
    "requires_verification",
    "expired",
    "revoked",
    "provider_unavailable",
  ]
);
export const renewalModeEnum = pgEnum("renewal_mode", [
  "manual_invoice",
  "auto_charge",
]);
export const renewalAttemptStatusEnum = pgEnum("renewal_attempt_status", [
  "scheduled",
  "charge_in_progress",
  "retry_scheduled",
  "grace_period_active",
  "requires_new_card",
  "manual_fallback_active",
  "paused_dunning",
  "settled",
  "terminal_failure",
  "manual_review_required",
]);
export const declineCategoryEnum = pgEnum("decline_category", [
  "soft_decline",
  "hard_decline",
  "provider_unknown",
  "manual_review_required",
]);
export const paymentMethodSetupSessionStatusEnum = pgEnum(
  "payment_method_setup_session_status",
  ["pending", "confirmed", "abandoned", "failed"]
);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending_provider_creation",
  "payment_pending",
  "provider_pending_unknown",
  "reconciliation_required",
  "paid",
  "paid_unapplied",
  "paid_recovered",
  "grant_pending_recovery",
  "downgraded_pending_reversal",
  "manual_review_required",
  "expired",
  "expired_internal",
  "canceled",
  "canceled_overdue",
]);
export const paymentReconciliationStatusEnum = pgEnum(
  "payment_reconciliation_status",
  [
    "not_required",
    "pending",
    "in_progress",
    "fixed",
    "manual_review_required",
    "failed",
  ]
);
export const paymentBusinessEffectStatusEnum = pgEnum(
  "payment_business_effect_status",
  ["not_started", "pending", "applied", "reversed", "failed"]
);
export const amountMatchStatusEnum = pgEnum("amount_match_status", [
  "unknown",
  "matched",
  "underpaid",
  "overpaid",
  "currency_mismatch",
  "mismatch",
]);
export const paymentAttemptStatusEnum = pgEnum("payment_attempt_status", [
  "pending_provider_creation",
  "provider_pending_unknown",
  "active",
  "paid",
  "expired",
  "expired_internal",
  "canceled",
  "canceled_overdue",
  "reconciliation_required",
]);
export const webhookProcessingStatusEnum = pgEnum("webhook_processing_status", [
  "pending",
  "processed",
  "ignored_duplicate",
  "schema_invalid",
  "manual_review_required",
  "failed",
]);
export const reconciliationEntityTypeEnum = pgEnum(
  "reconciliation_entity_type",
  ["payment", "invoice", "subscription"]
);
export const reconciliationTriggerTypeEnum = pgEnum(
  "reconciliation_trigger_type",
  ["webhook", "schedule", "admin", "support_case"]
);
export const reconciliationResultEnum = pgEnum("reconciliation_result", [
  "no_change",
  "fixed",
  "manual_review_required",
  "failed",
]);
export const supportRecoveryCaseStatusEnum = pgEnum(
  "support_recovery_case_status",
  ["open", "in_progress", "waiting_for_customer", "resolved", "closed"]
);
export const supportRecoveryIssueTypeEnum = pgEnum(
  "support_recovery_issue_type",
  [
    "payment_not_applied",
    "wrong_downgrade",
    "amount_mismatch",
    "missing_document",
    "duplicate_charge_review",
    "other",
  ]
);
export const supportRecoveryResolutionTypeEnum = pgEnum(
  "support_recovery_resolution_type",
  [
    "reconciled",
    "manual_mark_paid",
    "reverse_downgrade",
    "invoice_reopened",
    "invoice_replaced",
    "not_billable",
    "other",
  ]
);
export const billingMigrationRunStatusEnum = pgEnum(
  "billing_migration_run_status",
  ["pending", "running", "completed", "completed_with_warnings", "failed"]
);
export const billingEffectTypeEnum = pgEnum("billing_effect_type", [
  "grant_credits",
  "renew_subscription",
  "downgrade_subscription",
  "reverse_downgrade",
]);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planCode: varchar("planCode", { length: 64 }).notNull(),
    status: billingSubscriptionStatusEnum("status")
      .notNull()
      .default("pending_migration"),
    source: billingSubscriptionSourceEnum("source")
      .notNull()
      .default("legacy_backfill"),
    billingPeriod: billingPeriodEnum("billingPeriod")
      .notNull()
      .default("monthly"),
    renewalMode: renewalModeEnum("renewalMode")
      .notNull()
      .default("manual_invoice"),
    defaultPaymentMethodId: integer("defaultPaymentMethodId").references(
      () => billingPaymentMethods.id,
      { onDelete: "set null" }
    ),
    autoRenewEnabled: boolean("autoRenewEnabled").notNull().default(false),
    billingAnchorAt: timestamp("billingAnchorAt", { withTimezone: true }),
    currentPeriodStart: timestamp("currentPeriodStart", { withTimezone: true }),
    currentPeriodEnd: timestamp("currentPeriodEnd", { withTimezone: true }),
    nextInvoiceAt: timestamp("nextInvoiceAt", { withTimezone: true }),
    nextRetryAt: timestamp("nextRetryAt", { withTimezone: true }),
    graceEndsAt: timestamp("graceEndsAt", { withTimezone: true }),
    legacyPlanSnapshot: json("legacyPlanSnapshot").$type<Record<string, any>>(),
    migratedFromUserPlan: boolean("migratedFromUserPlan")
      .notNull()
      .default(false),
    migrationRunId: integer("migrationRunId"),
    downgradedAt: timestamp("downgradedAt", { withTimezone: true }),
    downgradeReason: varchar("downgradeReason", { length: 128 }),
    lastRecoveryActionAt: timestamp("lastRecoveryActionAt", {
      withTimezone: true,
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("billing_subscriptions_user_idx").on(t.userId),
    index("billing_subscriptions_tenant_status_idx").on(t.tenantId, t.status),
  ]
);

export type BillingSubscription = typeof billingSubscriptions.$inferSelect;
export type InsertBillingSubscription =
  typeof billingSubscriptions.$inferInsert;

export const subscriptionPaymentSettings = pgTable(
  "subscription_payment_settings",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscriptionId")
      .notNull()
      .references(() => billingSubscriptions.id, { onDelete: "cascade" }),
    renewalMode: renewalModeEnum("renewalMode")
      .notNull()
      .default("manual_invoice"),
    defaultPaymentMethodId: integer("defaultPaymentMethodId").references(
      () => billingPaymentMethods.id,
      { onDelete: "set null" }
    ),
    retryPolicyJson: json("retryPolicyJson").$type<Record<string, any>>(),
    dunningPolicyJson: json("dunningPolicyJson").$type<Record<string, any>>(),
    autoRenewEnabled: boolean("autoRenewEnabled").notNull().default(false),
    consentWithdrawnAt: timestamp("consentWithdrawnAt", { withTimezone: true }),
    rolloutCohort: varchar("rolloutCohort", { length: 128 }),
    updatedBy: integer("updatedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("subscription_payment_settings_subscription_unique").on(
      t.subscriptionId
    ),
    index("subscription_payment_settings_default_method_idx").on(
      t.defaultPaymentMethodId
    ),
  ]
);

export type SubscriptionPaymentSettings =
  typeof subscriptionPaymentSettings.$inferSelect;
export type InsertSubscriptionPaymentSettings =
  typeof subscriptionPaymentSettings.$inferInsert;

export const paymentMethodAuditLogs = pgTable(
  "payment_method_audit_logs",
  {
    id: serial("id").primaryKey(),
    paymentMethodId: integer("paymentMethodId")
      .notNull()
      .references(() => billingPaymentMethods.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 128 }).notNull(),
    actorType: renderedByTypeEnum("actorType").notNull(),
    actorId: integer("actorId"),
    reason: text("reason"),
    beforeJson: json("beforeJson").$type<Record<string, any>>(),
    afterJson: json("afterJson").$type<Record<string, any>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("payment_method_audit_logs_method_idx").on(
      t.paymentMethodId,
      t.createdAt
    ),
  ]
);

export type PaymentMethodAuditLog = typeof paymentMethodAuditLogs.$inferSelect;
export type InsertPaymentMethodAuditLog =
  typeof paymentMethodAuditLogs.$inferInsert;

export const paymentMethodSetupSessions = pgTable(
  "payment_method_setup_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    provider: paymentProviderEnum("provider").notNull().default("beam"),
    setupSessionId: varchar("setupSessionId", { length: 128 }).notNull(),
    status: paymentMethodSetupSessionStatusEnum("status")
      .notNull()
      .default("pending"),
    returnUrl: varchar("returnUrl", { length: 2048 }),
    providerCustomerId: varchar("providerCustomerId", { length: 128 }),
    providerPaymentMethodId: varchar("providerPaymentMethodId", {
      length: 128,
    }),
    payloadJson: json("payloadJson").$type<Record<string, any>>(),
    errorMessage: text("errorMessage"),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    confirmedAt: timestamp("confirmedAt", { withTimezone: true }),
    abandonedAt: timestamp("abandonedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("payment_method_setup_sessions_setup_unique").on(
      t.provider,
      t.setupSessionId
    ),
    index("payment_method_setup_sessions_user_idx").on(
      t.userId,
      t.status,
      t.createdAt
    ),
  ]
);

export type PaymentMethodSetupSession =
  typeof paymentMethodSetupSessions.$inferSelect;
export type InsertPaymentMethodSetupSession =
  typeof paymentMethodSetupSessions.$inferInsert;

export const billingMigrationRuns = pgTable("billing_migration_runs", {
  id: serial("id").primaryKey(),
  status: billingMigrationRunStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("startedAt", { withTimezone: true }),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  cutoverReadyAt: timestamp("cutoverReadyAt", { withTimezone: true }),
  totalCandidates: integer("totalCandidates").notNull().default(0),
  migratedCount: integer("migratedCount").notNull().default(0),
  skippedCount: integer("skippedCount").notNull().default(0),
  ambiguousCount: integer("ambiguousCount").notNull().default(0),
  reportJson: json("reportJson").$type<Record<string, any>>(),
  notes: text("notes"),
  createdBy: integer("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BillingMigrationRun = typeof billingMigrationRuns.$inferSelect;
export type InsertBillingMigrationRun =
  typeof billingMigrationRuns.$inferInsert;

export const billingProfiles = pgTable(
  "billing_profiles",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    legalNameTh: varchar("legalNameTh", { length: 256 }),
    legalNameEn: varchar("legalNameEn", { length: 256 }),
    taxId: varchar("taxId", { length: 64 }),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 256 }),
    addressLine1: varchar("addressLine1", { length: 256 }),
    addressLine2: varchar("addressLine2", { length: 256 }),
    subdistrict: varchar("subdistrict", { length: 128 }),
    district: varchar("district", { length: 128 }),
    province: varchar("province", { length: 128 }),
    postalCode: varchar("postalCode", { length: 32 }),
    country: varchar("country", { length: 128 }),
    contactName: varchar("contactName", { length: 256 }),
    invoiceNote: text("invoiceNote"),
    updatedBy: integer("updatedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("billing_profiles_user_unique").on(t.userId),
    index("billing_profiles_tenant_idx").on(t.tenantId),
  ]
);

export type BillingProfile = typeof billingProfiles.$inferSelect;
export type InsertBillingProfile = typeof billingProfiles.$inferInsert;

export const sellerProfiles = pgTable(
  "seller_profiles",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    entityNameTh: varchar("entityNameTh", { length: 256 }),
    entityNameEn: varchar("entityNameEn", { length: 256 }),
    taxId: varchar("taxId", { length: 64 }),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 256 }),
    addressLine1: varchar("addressLine1", { length: 256 }),
    addressLine2: varchar("addressLine2", { length: 256 }),
    subdistrict: varchar("subdistrict", { length: 128 }),
    district: varchar("district", { length: 128 }),
    province: varchar("province", { length: 128 }),
    postalCode: varchar("postalCode", { length: 32 }),
    country: varchar("country", { length: 128 }),
    signerName: varchar("signerName", { length: 256 }),
    signerTitle: varchar("signerTitle", { length: 256 }),
    branchType: varchar("branchType", { length: 64 }),
    footerNoteTh: text("footerNoteTh"),
    footerNoteEn: text("footerNoteEn"),
    autoGeneratedDocumentNoteTh: text("autoGeneratedDocumentNoteTh"),
    autoGeneratedDocumentNoteEn: text("autoGeneratedDocumentNoteEn"),
    logoUrl: varchar("logoUrl", { length: 512 }),
    revision: integer("revision").notNull().default(1),
    updatedBy: integer("updatedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("seller_profiles_tenant_unique")
      .on(t.tenantId)
      .where(sql`"tenantId" IS NOT NULL`),
  ]
);

export type SellerProfile = typeof sellerProfiles.$inferSelect;
export type InsertSellerProfile = typeof sellerProfiles.$inferInsert;

export const sellerProfileRevisions = pgTable(
  "seller_profile_revisions",
  {
    id: serial("id").primaryKey(),
    sellerProfileId: integer("sellerProfileId")
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    revision: integer("revision").notNull(),
    snapshotJson: json("snapshotJson").$type<Record<string, any>>().notNull(),
    diffJson: json("diffJson").$type<Record<string, any>>(),
    updatedBy: integer("updatedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("seller_profile_revisions_profile_idx").on(
      t.sellerProfileId,
      t.revision
    ),
  ]
);

export type SellerProfileRevision = typeof sellerProfileRevisions.$inferSelect;
export type InsertSellerProfileRevision =
  typeof sellerProfileRevisions.$inferInsert;

export const billingPaymentMethods = pgTable(
  "billing_payment_methods",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum("provider").notNull().default("beam"),
    providerCustomerId: varchar("providerCustomerId", { length: 128 }),
    providerPaymentMethodId: varchar("providerPaymentMethodId", {
      length: 128,
    }).notNull(),
    methodType: paymentMethodTypeEnum("methodType").notNull().default("card"),
    brand: varchar("brand", { length: 64 }),
    last4: varchar("last4", { length: 8 }),
    expMonth: integer("expMonth"),
    expYear: integer("expYear"),
    cardholderName: varchar("cardholderName", { length: 256 }),
    isDefault: boolean("isDefault").notNull().default(false),
    status: billingPaymentMethodStatusEnum("status")
      .notNull()
      .default("active"),
    autoRenewEligible: boolean("autoRenewEligible").notNull().default(false),
    consentVersion: varchar("consentVersion", { length: 128 }),
    consentedAt: timestamp("consentedAt", { withTimezone: true }),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    metadataJson: json("metadataJson").$type<Record<string, any>>(),
    consentSnapshotJson: json("consentSnapshotJson").$type<
      Record<string, any>
    >(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("billing_payment_methods_provider_ref_unique").on(
      t.provider,
      t.providerCustomerId,
      t.providerPaymentMethodId
    ),
    uniqueIndex("billing_payment_methods_default_scope_unique")
      .on(t.userId, t.tenantId, t.provider)
      .where(
        sql`"isDefault" = true AND "status" IN ('active', 'requires_verification')`
      ),
    index("billing_payment_methods_user_idx").on(t.userId, t.createdAt),
    index("billing_payment_methods_tenant_idx").on(t.tenantId, t.userId),
  ]
);

export type BillingPaymentMethod = typeof billingPaymentMethods.$inferSelect;
export type InsertBillingPaymentMethod =
  typeof billingPaymentMethods.$inferInsert;

export const taxPolicies = pgTable(
  "tax_policies",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    stream: invoiceStreamEnum("stream").notNull(),
    taxName: varchar("taxName", { length: 128 }).notNull(),
    taxRatePercent: numeric("taxRatePercent", { precision: 7, scale: 4 })
      .notNull()
      .default("0"),
    isEnabled: boolean("isEnabled").notNull().default(false),
    effectiveFrom: timestamp("effectiveFrom", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effectiveTo", { withTimezone: true }),
    roundingPolicy: varchar("roundingPolicy", { length: 64 })
      .notNull()
      .default("half_up_2dp"),
    createdBy: integer("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("tax_policies_stream_effective_idx").on(t.stream, t.effectiveFrom),
    index("tax_policies_tenant_stream_idx").on(t.tenantId, t.stream),
  ]
);

export type TaxPolicy = typeof taxPolicies.$inferSelect;
export type InsertTaxPolicy = typeof taxPolicies.$inferInsert;

export const documentNumberSequences = pgTable(
  "document_number_sequences",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    stream: invoiceStreamEnum("stream").notNull(),
    documentType: varchar("documentType", { length: 32 })
      .notNull()
      .default("invoice"),
    prefix: varchar("prefix", { length: 64 }).notNull(),
    yearMode: varchar("yearMode", { length: 32 })
      .notNull()
      .default("gregorian"),
    currentRunningNo: integer("currentRunningNo").notNull().default(0),
    isActive: boolean("isActive").notNull().default(true),
    updatedBy: integer("updatedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("document_number_sequences_scope_unique").on(
      t.tenantId,
      t.stream,
      t.documentType,
      t.prefix
    ),
  ]
);

export type DocumentNumberSequence =
  typeof documentNumberSequences.$inferSelect;
export type InsertDocumentNumberSequence =
  typeof documentNumberSequences.$inferInsert;

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    invoiceNumber: varchar("invoiceNumber", { length: 64 }),
    invoiceStream: invoiceStreamEnum("invoiceStream").notNull(),
    taxPolicyId: integer("taxPolicyId").references(() => taxPolicies.id, {
      onDelete: "set null",
    }),
    invoiceType: invoiceTypeEnum("invoiceType").notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscriptionId").references(
      () => billingSubscriptions.id,
      { onDelete: "set null" }
    ),
    orderId: varchar("orderId", { length: 128 }),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    currency: varchar("currency", { length: 16 }).notNull().default("THB"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    taxAmount: numeric("taxAmount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    totalAmount: numeric("totalAmount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    issuedAt: timestamp("issuedAt", { withTimezone: true }),
    dueAt: timestamp("dueAt", { withTimezone: true }),
    paidAt: timestamp("paidAt", { withTimezone: true }),
    canceledAt: timestamp("canceledAt", { withTimezone: true }),
    cancelReason: varchar("cancelReason", { length: 128 }),
    headerVersion: integer("headerVersion").notNull().default(1),
    sellerSnapshotJson: json("sellerSnapshotJson").$type<Record<string, any>>(),
    buyerSnapshotJson: json("buyerSnapshotJson").$type<Record<string, any>>(),
    totalsSnapshotJson: json("totalsSnapshotJson").$type<Record<string, any>>(),
    defaultDocumentLanguage: documentLanguageEnum("defaultDocumentLanguage")
      .notNull()
      .default("th"),
    replacedByInvoiceId: integer("replacedByInvoiceId"),
    supersedesInvoiceId: integer("supersedesInvoiceId"),
    billingCycleStart: timestamp("billingCycleStart", { withTimezone: true }),
    billingCycleEnd: timestamp("billingCycleEnd", { withTimezone: true }),
    documentAccessScope: varchar("documentAccessScope", { length: 32 })
      .notNull()
      .default("owner_or_admin"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("invoices_invoice_number_unique")
      .on(t.invoiceNumber)
      .where(sql`"invoiceNumber" IS NOT NULL`),
    uniqueIndex("invoices_subscription_cycle_unique")
      .on(
        t.subscriptionId,
        t.billingCycleStart,
        t.billingCycleEnd,
        t.invoiceType
      )
      .where(
        sql`"subscriptionId" IS NOT NULL AND "supersedesInvoiceId" IS NULL`
      ),
    index("invoices_user_status_idx").on(t.userId, t.status),
    index("invoices_tenant_status_idx").on(t.tenantId, t.status),
    index("invoices_subscription_idx").on(t.subscriptionId),
  ]
);

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoiceId")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  itemType: varchar("itemType", { length: 64 }).notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 })
    .notNull()
    .default("1"),
  unitPrice: numeric("unitPrice", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  metadataJson: json("metadataJson").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

export const invoiceDocuments = pgTable(
  "invoice_documents",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoiceId")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    documentLanguage: documentLanguageEnum("documentLanguage").notNull(),
    documentVersion: integer("documentVersion").notNull().default(1),
    templateVersion: varchar("templateVersion", { length: 64 }),
    pdfFileUrl: varchar("pdfFileUrl", { length: 1024 }),
    renderReason: invoiceDocumentRenderReasonEnum("renderReason").notNull(),
    renderedByType: renderedByTypeEnum("renderedByType")
      .notNull()
      .default("system"),
    renderedById: integer("renderedById"),
    isLatestForLanguage: boolean("isLatestForLanguage").notNull().default(true),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("invoice_documents_invoice_language_idx").on(
      t.invoiceId,
      t.documentLanguage
    ),
  ]
);

export type InvoiceDocument = typeof invoiceDocuments.$inferSelect;
export type InsertInvoiceDocument = typeof invoiceDocuments.$inferInsert;

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoiceId")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    paymentMethodId: integer("paymentMethodId").references(
      () => billingPaymentMethods.id,
      { onDelete: "set null" }
    ),
    provider: paymentProviderEnum("provider").notNull().default("beam"),
    providerPaymentType: providerPaymentTypeEnum("providerPaymentType")
      .notNull()
      .default("charge"),
    providerPaymentId: varchar("providerPaymentId", { length: 128 }),
    providerReferenceId: varchar("providerReferenceId", { length: 128 }),
    status: paymentStatusEnum("status")
      .notNull()
      .default("pending_provider_creation"),
    amount: numeric("amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    currency: varchar("currency", { length: 16 }).notNull().default("THB"),
    offSession: boolean("offSession").notNull().default(false),
    declineCode: varchar("declineCode", { length: 128 }),
    declineCategory: declineCategoryEnum("declineCategory"),
    expectedAmount: numeric("expectedAmount", { precision: 12, scale: 2 }),
    expectedCurrency: varchar("expectedCurrency", { length: 16 }),
    settledAmount: numeric("settledAmount", { precision: 12, scale: 2 }),
    settledCurrency: varchar("settledCurrency", { length: 16 }),
    amountMatchStatus: amountMatchStatusEnum("amountMatchStatus")
      .notNull()
      .default("unknown"),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    paidAt: timestamp("paidAt", { withTimezone: true }),
    rawResponseJson: json("rawResponseJson").$type<Record<string, any>>(),
    reconciliationStatus: paymentReconciliationStatusEnum(
      "reconciliationStatus"
    )
      .notNull()
      .default("not_required"),
    lastReconciledAt: timestamp("lastReconciledAt", { withTimezone: true }),
    providerStatusLastSeen: varchar("providerStatusLastSeen", { length: 64 }),
    providerEventLastSeenId: varchar("providerEventLastSeenId", {
      length: 128,
    }),
    businessEffectStatus: paymentBusinessEffectStatusEnum(
      "businessEffectStatus"
    )
      .notNull()
      .default("not_started"),
    manualRecoveryRequired: boolean("manualRecoveryRequired")
      .notNull()
      .default(false),
    manualRecoveryResolvedAt: timestamp("manualRecoveryResolvedAt", {
      withTimezone: true,
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("payments_provider_payment_id_unique")
      .on(t.providerPaymentId)
      .where(sql`"providerPaymentId" IS NOT NULL`),
    uniqueIndex("payments_invoice_active_unique")
      .on(t.invoiceId)
      .where(
        sql`"status" IN ('pending_provider_creation', 'payment_pending', 'provider_pending_unknown', 'reconciliation_required', 'manual_review_required')`
      ),
    index("payments_invoice_status_idx").on(t.invoiceId, t.status),
  ]
);

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("paymentId")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    attemptNo: integer("attemptNo").notNull(),
    status: paymentAttemptStatusEnum("status")
      .notNull()
      .default("pending_provider_creation"),
    providerPaymentId: varchar("providerPaymentId", { length: 128 }),
    providerReferenceId: varchar("providerReferenceId", { length: 128 }),
    expectedAmount: numeric("expectedAmount", { precision: 12, scale: 2 }),
    expectedCurrency: varchar("expectedCurrency", { length: 16 }),
    settledAmount: numeric("settledAmount", { precision: 12, scale: 2 }),
    settledCurrency: varchar("settledCurrency", { length: 16 }),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    providerPayloadJson: json("providerPayloadJson").$type<
      Record<string, any>
    >(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("payment_attempts_payment_attempt_no_unique").on(
      t.paymentId,
      t.attemptNo
    ),
  ]
);

export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type InsertPaymentAttempt = typeof paymentAttempts.$inferInsert;

export const renewalAttempts = pgTable(
  "renewal_attempts",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscriptionId")
      .notNull()
      .references(() => billingSubscriptions.id, { onDelete: "cascade" }),
    invoiceId: integer("invoiceId").references(() => invoices.id, {
      onDelete: "cascade",
    }),
    cycleKey: varchar("cycleKey", { length: 128 }).notNull(),
    renewalModeSnapshot: renewalModeEnum("renewalModeSnapshot")
      .notNull()
      .default("manual_invoice"),
    paymentMethodId: integer("paymentMethodId").references(
      () => billingPaymentMethods.id,
      { onDelete: "set null" }
    ),
    attemptNo: integer("attemptNo").notNull().default(1),
    status: renewalAttemptStatusEnum("status").notNull().default("scheduled"),
    retryClassification: varchar("retryClassification", { length: 64 }),
    scheduledAt: timestamp("scheduledAt", { withTimezone: true }),
    executedAt: timestamp("executedAt", { withTimezone: true }),
    failureCode: varchar("failureCode", { length: 128 }),
    failureMessage: text("failureMessage"),
    nextRetryAt: timestamp("nextRetryAt", { withTimezone: true }),
    finalOutcome: varchar("finalOutcome", { length: 128 }),
    metadataJson: json("metadataJson").$type<Record<string, any>>(),
    supersededByAttemptId: integer("supersededByAttemptId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("renewal_attempts_subscription_cycle_attempt_unique").on(
      t.subscriptionId,
      t.cycleKey,
      t.attemptNo
    ),
    uniqueIndex("renewal_attempts_active_cycle_unique")
      .on(t.subscriptionId, t.cycleKey)
      .where(
        sql`"status" IN ('scheduled', 'charge_in_progress', 'retry_scheduled', 'grace_period_active', 'paused_dunning', 'manual_review_required')`
      ),
    index("renewal_attempts_invoice_idx").on(t.invoiceId),
    index("renewal_attempts_payment_method_idx").on(t.paymentMethodId),
  ]
);

export type RenewalAttempt = typeof renewalAttempts.$inferSelect;
export type InsertRenewalAttempt = typeof renewalAttempts.$inferInsert;

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    provider: paymentProviderEnum("provider").notNull().default("beam"),
    invoiceId: integer("invoiceId").references(() => invoices.id, {
      onDelete: "cascade",
    }),
    paymentId: integer("paymentId").references(() => payments.id, {
      onDelete: "cascade",
    }),
    eventType: varchar("eventType", { length: 128 }).notNull(),
    eventId: varchar("eventId", { length: 128 }),
    signatureValid: boolean("signatureValid").notNull().default(false),
    payloadJson: json("payloadJson").$type<Record<string, any>>(),
    processingStatus: webhookProcessingStatusEnum("processingStatus")
      .notNull()
      .default("pending"),
    processedAt: timestamp("processedAt", { withTimezone: true }),
    errorMessage: text("errorMessage"),
    validatedSecretVersion: varchar("validatedSecretVersion", { length: 64 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("webhook_events_provider_event_unique")
      .on(t.provider, t.eventId)
      .where(sql`"eventId" IS NOT NULL`),
  ]
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

export const invoiceAuditLogs = pgTable(
  "invoice_audit_logs",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoiceId")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 128 }).notNull(),
    actorType: renderedByTypeEnum("actorType").notNull(),
    actorId: integer("actorId"),
    reason: text("reason"),
    beforeJson: json("beforeJson").$type<Record<string, any>>(),
    afterJson: json("afterJson").$type<Record<string, any>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("invoice_audit_logs_invoice_idx").on(t.invoiceId, t.createdAt)]
);

export type InvoiceAuditLog = typeof invoiceAuditLogs.$inferSelect;
export type InsertInvoiceAuditLog = typeof invoiceAuditLogs.$inferInsert;

export const notificationDispatches = pgTable(
  "notification_dispatches",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").references(() => users.id, {
      onDelete: "set null",
    }),
    invoiceId: integer("invoiceId").references(() => invoices.id, {
      onDelete: "cascade",
    }),
    renewalAttemptId: integer("renewalAttemptId").references(
      () => renewalAttempts.id,
      { onDelete: "set null" }
    ),
    notificationType: varchar("notificationType", { length: 64 }).notNull(),
    channel: varchar("channel", { length: 32 }).notNull(),
    dedupeKey: varchar("dedupeKey", { length: 256 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    sentAt: timestamp("sentAt", { withTimezone: true }),
    suppressedReason: varchar("suppressedReason", { length: 256 }),
    metadataJson: json("metadataJson").$type<Record<string, any>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("notification_dispatches_dedupe_unique").on(t.dedupeKey),
    index("notification_dispatches_invoice_idx").on(
      t.invoiceId,
      t.notificationType
    ),
  ]
);

export type NotificationDispatch = typeof notificationDispatches.$inferSelect;
export type InsertNotificationDispatch =
  typeof notificationDispatches.$inferInsert;

export const billingEffects = pgTable(
  "billing_effects",
  {
    id: serial("id").primaryKey(),
    effectKey: varchar("effectKey", { length: 256 }).notNull(),
    effectType: billingEffectTypeEnum("effectType").notNull(),
    invoiceId: integer("invoiceId").references(() => invoices.id, {
      onDelete: "cascade",
    }),
    paymentId: integer("paymentId").references(() => payments.id, {
      onDelete: "cascade",
    }),
    subscriptionId: integer("subscriptionId").references(
      () => billingSubscriptions.id,
      { onDelete: "cascade" }
    ),
    metadataJson: json("metadataJson").$type<Record<string, any>>(),
    appliedAt: timestamp("appliedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [uniqueIndex("billing_effects_effect_key_unique").on(t.effectKey)]
);

export type BillingEffect = typeof billingEffects.$inferSelect;
export type InsertBillingEffect = typeof billingEffects.$inferInsert;

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: serial("id").primaryKey(),
    entityType: reconciliationEntityTypeEnum("entityType").notNull(),
    entityId: integer("entityId").notNull(),
    renewalAttemptId: integer("renewalAttemptId").references(
      () => renewalAttempts.id,
      { onDelete: "set null" }
    ),
    triggerType: reconciliationTriggerTypeEnum("triggerType").notNull(),
    result: reconciliationResultEnum("result").notNull(),
    beforeJson: json("beforeJson").$type<Record<string, any>>(),
    afterJson: json("afterJson").$type<Record<string, any>>(),
    notes: text("notes"),
    createdBy: integer("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("reconciliation_runs_entity_idx").on(
      t.entityType,
      t.entityId,
      t.createdAt
    ),
  ]
);

export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type InsertReconciliationRun = typeof reconciliationRuns.$inferInsert;

export const supportRecoveryCases = pgTable(
  "support_recovery_cases",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    userId: integer("userId").references(() => users.id, {
      onDelete: "set null",
    }),
    invoiceId: integer("invoiceId").references(() => invoices.id, {
      onDelete: "cascade",
    }),
    paymentId: integer("paymentId").references(() => payments.id, {
      onDelete: "cascade",
    }),
    status: supportRecoveryCaseStatusEnum("status").notNull().default("open"),
    issueType: supportRecoveryIssueTypeEnum("issueType").notNull(),
    customerReportedAt: timestamp("customerReportedAt", { withTimezone: true }),
    assignedAdminId: integer("assignedAdminId").references(() => users.id, {
      onDelete: "set null",
    }),
    resolutionType: supportRecoveryResolutionTypeEnum("resolutionType"),
    resolutionNote: text("resolutionNote"),
    evidenceJson: json("evidenceJson").$type<Record<string, any>>(),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("support_recovery_cases_invoice_idx").on(t.invoiceId, t.status),
    index("support_recovery_cases_payment_idx").on(t.paymentId, t.status),
  ]
);

export type SupportRecoveryCase = typeof supportRecoveryCases.$inferSelect;
export type InsertSupportRecoveryCase =
  typeof supportRecoveryCases.$inferInsert;

/**
 * Blog Posts - Multi-tenant blog system
 * Each tenant has its own blog posts with full CRUD support
 */
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),

  /** Tenant this post belongs to */
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

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

  /** Library attachment IDs from the article composer */
  mediaAttachments: json("mediaAttachments").$type<number[]>(),

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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

// ============================================================
// Content Composer Drafts — Feature 063
// ============================================================

export const contentComposerDrafts = pgTable(
  "content_composer_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull().default(""),
    executionSource: varchar("executionSource", { length: 20 }),
    skillId: varchar("skillId", { length: 255 }),
    agencyId: varchar("agencyId", { length: 255 }),
    articleBody: text("articleBody"),
    requiresWebSearch: boolean("requiresWebSearch").notNull().default(false),
    requiresThinking: boolean("requiresThinking").notNull().default(false),
    attachmentIds: json("attachmentIds")
      .$type<number[]>()
      .notNull()
      .default([]),
    destinationKind: varchar("destinationKind", { length: 20 }),
    docsSubKind: varchar("docsSubKind", { length: 20 }),
    docsTargetId: integer("docsTargetId"),
    blogTargetId: integer("blogTargetId"),
    socialPlatform: varchar("socialPlatform", { length: 50 }),
    socialTargetId: integer("socialTargetId"),
    socialCaption: text("socialCaption"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    errorMessage: text("errorMessage"),
    publishedAt: timestamp("publishedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("ccd_tenant_user_status_idx").on(t.tenantId, t.userId, t.status),
    index("ccd_tenant_updated_at_idx").on(t.tenantId, t.updatedAt),
  ]
);

export type ContentComposerDraft = typeof contentComposerDrafts.$inferSelect;
export type InsertContentComposerDraft =
  typeof contentComposerDrafts.$inferInsert;

// ============================================================
// Chat Alert — Scheduled Messages System
// ============================================================

export const scheduleStatusEnum = pgEnum("schedule_status", [
  "active",
  "paused",
  "completed",
  "failed",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "scheduled_message",
  "follow_request",
  "alert",
  "system",
]);
export const reminderPriorityEnum = pgEnum("reminder_priority", [
  "low",
  "normal",
  "high",
  "critical",
]);
export const followStatusEnum = pgEnum("follow_status", ["active", "blocked"]);

/**
 * Scheduled Messages — recurring or one-time scheduled chat prompts
 */
export const scheduledMessages = pgTable(
  "scheduled_messages",
  {
    id: serial("id").primaryKey(),

    /** Owner who created the schedule */
    userId: integer("userId")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    /** Conversation to post into (null = create new) */
    conversationId: integer("conversationId").references(
      () => conversations.id,
      { onDelete: "set null" }
    ),

    /** Target user to send to (null = self) */
    targetUserId: integer("targetUserId").references(() => users.id, {
      onDelete: "cascade",
    }),

    /** The prompt to send to the LLM */
    prompt: text("prompt").notNull(),

    /** Cron expression for recurring (e.g. "0 8 * * *") */
    cronExpression: varchar("cronExpression", { length: 100 }),

    /** User's timezone (e.g. "Asia/Bangkok") */
    timezone: varchar("timezone", { length: 64 })
      .default("Asia/Bangkok")
      .notNull(),

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

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("scheduled_messages_user_status").on(t.userId, t.status),
    index("scheduled_messages_user_created").on(t.userId, t.createdAt),
    index("scheduled_messages_status").on(t.status),
  ]
);

export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = typeof scheduledMessages.$inferInsert;

/**
 * Scheduled Message Logs — execution history
 */
export const scheduledMessageLogs = pgTable(
  "scheduled_message_logs",
  {
    id: serial("id").primaryKey(),

    scheduledMessageId: integer("scheduledMessageId")
      .references(() => scheduledMessages.id, { onDelete: "cascade" })
      .notNull(),

    executedAt: timestamp("executedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),

    /** LLM response content */
    responseContent: text("responseContent"),

    /** Credits consumed */
    creditsUsed: numeric("creditsUsed", { precision: 10, scale: 4 }).default(
      "0"
    ),

    /** Success or failure */
    status: varchar("status", { length: 20 }).default("success").notNull(),

    /** Error message if failed */
    error: text("error"),
  },
  t => [
    index("scheduled_message_logs_schedule_id").on(
      t.scheduledMessageId,
      t.executedAt
    ),
  ]
);

export type ScheduledMessageLog = typeof scheduledMessageLogs.$inferSelect;
export type InsertScheduledMessageLog =
  typeof scheduledMessageLogs.$inferInsert;

/**
 * User Follows — follow relationships between users
 */
export const userFollows = pgTable("user_follows", {
  id: serial("id").primaryKey(),

  followerId: integer("followerId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  followingId: integer("followingId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),

  status: followStatusEnum("status").default("active").notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type UserFollow = typeof userFollows.$inferSelect;
export type InsertUserFollow = typeof userFollows.$inferInsert;

/**
 * User Notifications — in-app notification center
 */
export const userNotifications = pgTable(
  "user_notifications",
  {
    id: serial("id").primaryKey(),

    userId: integer("userId")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    type: notificationTypeEnum("type").notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    content: text("content"),

    /** Link to related conversation */
    conversationId: integer("conversationId").references(
      () => conversations.id,
      { onDelete: "set null" }
    ),

    /** Link to related schedule */
    scheduledMessageId: integer("scheduledMessageId").references(
      () => scheduledMessages.id,
      { onDelete: "set null" }
    ),

    /** Priority — high/critical triggers full-screen modal */
    priority: reminderPriorityEnum("priority").default("normal").notNull(),

    isRead: boolean("isRead").default(false).notNull(),

    /** Structured resource linking — e.g. "media_job", "workflow", "skill", "feedback", "agency", "approval" */
    relatedResourceType: varchar("relatedResourceType", { length: 50 }),

    /** ID of the related resource for direct navigation */
    relatedResourceId: varchar("relatedResourceId", { length: 200 }),

    /** Direct action URL — overrides legacy string matching */
    actionUrl: text("actionUrl"),

    /** Action button label */
    actionLabel: varchar("actionLabel", { length: 100 }),

    /** Structured metadata: error details, metrics, retry info, related items */
    metadata: jsonb("metadata").$type<{
      eventId?: string;
      source?: string;
      errorDetails?: {
        errorCode?: string;
        errorMessage?: string;
      };
      metrics?: {
        durationMs?: number;
        costUsd?: number;
        itemCount?: number;
      };
      retryInfo?: {
        retryCount?: number;
        maxRetries?: number;
        nextRetryAt?: string;
      };
      relatedItems?: Record<string, string>;
    }>(),

    /** Separate from isRead — user explicitly dismissed */
    isDismissed: boolean("isDismissed").default(false).notNull(),

    /** Auto-cleanup after this timestamp */
    expiresAt: timestamp("expiresAt", { withTimezone: true }),

    /** Dedup identifier, e.g. "media_job_failure:user_123" */
    groupKey: varchar("groupKey", { length: 200 }),

    /** Number of events this notification represents */
    occurrenceCount: integer("occurrenceCount").default(1).notNull(),

    /** When first event in group occurred */
    firstOccurredAt: timestamp("firstOccurredAt", { withTimezone: true })
      .defaultNow()
      .notNull(),

    /** When most recent event occurred */
    lastOccurredAt: timestamp("lastOccurredAt", { withTimezone: true })
      .defaultNow()
      .notNull(),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("user_notifications_user_read").on(t.userId, t.isRead, t.createdAt),
    index("user_notifications_user_priority").on(
      t.userId,
      t.isRead,
      t.priority
    ),
    index("user_notifications_resource").on(
      t.relatedResourceType,
      t.relatedResourceId
    ),
    uniqueIndex("idx_notif_dedup_active")
      .on(t.userId, t.groupKey)
      .where(sql`"isDismissed" = false AND "groupKey" IS NOT NULL`),
  ]
);

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

/**
 * Notification Occurrences — individual events grouped under a deduped notification
 */
export const notificationOccurrences = pgTable(
  "notification_occurrences",
  {
    id: serial("id").primaryKey(),
    notificationId: integer("notificationId")
      .references(() => userNotifications.id, { onDelete: "cascade" })
      .notNull(),
    content: text("content"),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurredAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_notif_occurrences_notif_time").on(
      t.notificationId,
      t.occurredAt
    ),
  ]
);

export type NotificationOccurrence =
  typeof notificationOccurrences.$inferSelect;
export type InsertNotificationOccurrence =
  typeof notificationOccurrences.$inferInsert;

/**
 * Valid notification categories for preference management
 */
export const NOTIFICATION_CATEGORIES = [
  "system_health",
  "media_jobs",
  "workflow",
  "skill",
  "feedback",
  "agency",
  "follow",
  "scheduled",
  "security",
  "business",
] as const;

/**
 * Notification Preferences — per-user, per-category delivery settings
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    inApp: boolean("inApp").default(true).notNull(),
    email: boolean("email").default(false).notNull(),
    telegram: boolean("telegram").default(false).notNull(),
    minSeverity: reminderPriorityEnum("minSeverity"),
    mutedUntil: timestamp("mutedUntil", { withTimezone: true }),
    emailDigestFrequency: varchar("emailDigestFrequency", { length: 10 }),
    emailDigestHour: integer("emailDigestHour"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("notification_preferences_user_category").on(
      t.userId,
      t.category
    ),
  ]
);

export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference =
  typeof notificationPreferences.$inferInsert;

/**
 * Alert Rules — tenant-scoped metric thresholds that trigger notifications
 */
export const alertRules = pgTable(
  "alert_rules",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    metricName: varchar("metricName", { length: 100 }).notNull(),
    operator: varchar("operator", { length: 10 }).notNull(),
    threshold: doublePrecision("threshold").notNull(),
    windowMinutes: integer("windowMinutes").default(5).notNull(),
    severity: reminderPriorityEnum("severity").default("high").notNull(),
    channels: jsonb("channels").$type<string[]>().default(["in_app"]).notNull(),
    targetRole: varchar("targetRole", { length: 20 }),
    targetUserId: integer("targetUserId"),
    cooldownMinutes: integer("cooldownMinutes").default(10).notNull(),
    lastTriggeredAt: timestamp("lastTriggeredAt", { withTimezone: true }),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("alert_rules_tenant_enabled").on(t.tenantId, t.isEnabled)]
);

export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = typeof alertRules.$inferInsert;

/**
 * Notification Webhooks — configurable HTTP endpoints for notification delivery
 */
export const notificationWebhooks = pgTable(
  "notification_webhooks",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("userId").references(() => users.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 100 }).notNull(),
    url: text("url").notNull(),
    secretEncrypted: text("secretEncrypted").notNull(),
    categories: jsonb("categories").$type<string[] | null>(),
    minSeverity: reminderPriorityEnum("minSeverity"),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    lastDeliveredAt: timestamp("lastDeliveredAt", { withTimezone: true }),
    failureCount: integer("failureCount").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("notification_webhooks_tenant_idx").on(t.tenantId),
    index("notification_webhooks_user_idx").on(t.userId),
  ]
);

export type NotificationWebhook = typeof notificationWebhooks.$inferSelect;
export type InsertNotificationWebhook =
  typeof notificationWebhooks.$inferInsert;

/**
 * Escalation Policies — define escalation paths for unresolved notifications
 */
export const escalationPolicies = pgTable(
  "escalation_policies",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    triggerSeverity: reminderPriorityEnum("triggerSeverity").notNull(),
    triggerMinutes: integer("triggerMinutes").notNull(),
    escalateToRole: varchar("escalateToRole", { length: 20 }),
    escalateToUserId: integer("escalateToUserId"),
    escalateChannels: jsonb("escalateChannels").$type<string[]>().notNull(),
    escalateMessage: text("escalateMessage"),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("escalation_policies_tenant_enabled").on(t.tenantId, t.isEnabled)]
);

export type EscalationPolicy = typeof escalationPolicies.$inferSelect;
export type InsertEscalationPolicy = typeof escalationPolicies.$inferInsert;

/**
 * Direct Messages — user-to-user messaging
 * Follow: max 10 messages, Friend (mutual follow): unlimited
 */
export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),

  senderId: integer("senderId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  receiverId: integer("receiverId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),

  content: text("content").notNull(),

  /** Urgent messages show as pop-up alerts */
  isUrgent: boolean("isUrgent").default(false).notNull(),

  isRead: boolean("isRead").default(false).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = typeof directMessages.$inferInsert;

// ==================== Account Security ====================

/** Logs every registration attempt for duplicate detection */
export const registrationEvents = pgTable(
  "registration_events",
  {
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
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("registration_events_created_user_idx").on(t.createdAt, t.userId)]
);

/** Links browser fingerprint hashes to users */
export const deviceFingerprints = pgTable("device_fingerprints", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fingerprintHash: varchar("fingerprintHash", { length: 64 }).notNull(),
  firstSeenAt: timestamp("firstSeenAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Menu config — admin overrides per menu item, platform, and tenant
export const menuConfig = pgTable(
  "menu_config",
  {
    id: serial("id").primaryKey(),
    menuItemId: varchar("menu_item_id", { length: 50 }).notNull(),
    platform: varchar("platform", { length: 10 }).notNull().default("web"),
    visible: boolean("visible").default(true).notNull(),
    customLabel: varchar("custom_label", { length: 100 }),
    customIcon: varchar("custom_icon", { length: 50 }),
    sortOrder: integer("sort_order"),
    tenantId: integer("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex("menu_config_unique").on(
      table.menuItemId,
      table.platform,
      table.tenantId
    ),
  ]
);

export type MenuConfig = typeof menuConfig.$inferSelect;
export type InsertMenuConfig = typeof menuConfig.$inferInsert;

// Video Editor Projects — persistent project storage with auto-save
export const videoEditorProjects = pgTable(
  "video_editor_projects",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    projectData: json("projectData").notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    duration: numeric("duration", { precision: 10, scale: 2 }).default("0"),
    resolution: varchar("resolution", { length: 20 }),
    trackCount: integer("trackCount").default(4),
    clipCount: integer("clipCount").default(0),
    version: varchar("version", { length: 10 }).default("1.0"),
    isAutoSave: boolean("isAutoSave").default(false).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("video_editor_projects_user_idx").on(t.userId),
    index("video_editor_projects_updated_idx").on(t.updatedAt),
  ]
);

export type VideoEditorProject = typeof videoEditorProjects.$inferSelect;
export type InsertVideoEditorProject = typeof videoEditorProjects.$inferInsert;

// Media Studio Storyboard Review Projects — persistent pre-edit review workspaces
export const mediaStudioStoryboardReviews = pgTable(
  "media_studio_storyboard_reviews",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    reviewData: json("reviewData").notNull(),
    status: varchar("status", { length: 24 }).default("active").notNull(),
    videoEditorProjectId: integer("videoEditorProjectId").references(
      () => videoEditorProjects.id,
      { onDelete: "set null" }
    ),
    clipCount: integer("clipCount").default(0),
    completedClipCount: integer("completedClipCount").default(0),
    thumbnailUrl: text("thumbnailUrl"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("media_studio_storyboard_reviews_user_idx").on(t.userId),
    index("media_studio_storyboard_reviews_updated_idx").on(t.updatedAt),
    index("media_studio_storyboard_reviews_status_idx").on(t.status),
  ]
);

export type MediaStudioStoryboardReview =
  typeof mediaStudioStoryboardReviews.$inferSelect;
export type InsertMediaStudioStoryboardReview =
  typeof mediaStudioStoryboardReviews.$inferInsert;

// Media Studio Production Director — durable planning and output state.
export const mediaProductionRuns = pgTable(
  "media_production_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    status: varchar("status", { length: 40 }).default("goal_draft").notNull(),
    goalVersion: integer("goalVersion").default(1).notNull(),
    planVersion: integer("planVersion").default(0).notNull(),
    goal: jsonb("goal").$type<Record<string, any>>().default({}).notNull(),
    productionBible: jsonb("productionBible")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    assetPlan: jsonb("assetPlan")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    qualityGateSummary: jsonb("qualityGateSummary")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    budgetSummary: jsonb("budgetSummary")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    contractVersion: varchar("contractVersion", { length: 32 })
      .default("1.0.0")
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("media_production_runs_identity_unique").on(
      t.tenantId,
      t.productionRunId
    ),
    index("media_production_runs_user_status_idx").on(
      t.userId,
      t.status,
      t.updatedAt
    ),
  ]
);

export type MediaProductionRun = typeof mediaProductionRuns.$inferSelect;
export type InsertMediaProductionRun = typeof mediaProductionRuns.$inferInsert;

export const mediaProductionSpaces = pgTable(
  "media_production_spaces",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    version: integer("version").notNull(),
    space: jsonb("space").$type<Record<string, any>>().default({}).notNull(),
    changeKind: varchar("changeKind", { length: 40 })
      .default("space")
      .notNull(),
    changedFields: jsonb("changedFields")
      .$type<string[]>()
      .default([])
      .notNull(),
    spaceHash: varchar("spaceHash", { length: 128 }).notNull(),
    status: varchar("status", { length: 40 }).default("goal_draft").notNull(),
    archivedAt: timestamp("archivedAt", { withTimezone: true }),
    deletedAt: timestamp("deletedAt", { withTimezone: true }),
    contractVersion: varchar("contractVersion", { length: 32 })
      .default("1.0.0")
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("media_production_spaces_unique").on(
      t.tenantId,
      t.productionRunId,
      t.version
    ),
    index("media_production_spaces_run_idx").on(
      t.tenantId,
      t.productionRunId,
      t.createdAt
    ),
    index("media_production_spaces_user_status_idx").on(
      t.userId,
      t.status,
      t.updatedAt
    ),
  ]
);

export type MediaProductionSpace = typeof mediaProductionSpaces.$inferSelect;
export type InsertMediaProductionSpace =
  typeof mediaProductionSpaces.$inferInsert;

export const mediaProductionGoalVersions = pgTable(
  "media_production_goal_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    version: integer("version").notNull(),
    goal: jsonb("goal").$type<Record<string, any>>().default({}).notNull(),
    changedFields: jsonb("changedFields")
      .$type<string[]>()
      .default([])
      .notNull(),
    inputHash: varchar("inputHash", { length: 128 }),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    contractVersion: varchar("contractVersion", { length: 32 })
      .default("1.0.0")
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("media_production_goal_versions_unique").on(
      t.tenantId,
      t.productionRunId,
      t.version
    ),
    index("media_production_goal_versions_run_idx").on(
      t.tenantId,
      t.productionRunId,
      t.createdAt
    ),
  ]
);

export type MediaProductionGoalVersion =
  typeof mediaProductionGoalVersions.$inferSelect;
export type InsertMediaProductionGoalVersion =
  typeof mediaProductionGoalVersions.$inferInsert;

export const mediaProductionPlanVersions = pgTable(
  "media_production_plan_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    goalVersion: integer("goalVersion").default(1).notNull(),
    version: integer("version").notNull(),
    plannerSkillId: varchar("plannerSkillId", { length: 128 })
      .default("media-production-storyboard-planner")
      .notNull(),
    plannerSkillVersion: varchar("plannerSkillVersion", { length: 32 }),
    plan: jsonb("plan").$type<Record<string, any>>().default({}).notNull(),
    inputHash: varchar("inputHash", { length: 128 }),
    outputHash: varchar("outputHash", { length: 128 }),
    status: varchar("status", { length: 32 }).default("draft").notNull(),
    contractVersion: varchar("contractVersion", { length: 32 })
      .default("1.0.0")
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("media_production_plan_versions_unique").on(
      t.tenantId,
      t.productionRunId,
      t.version
    ),
    index("media_production_plan_versions_run_idx").on(
      t.tenantId,
      t.productionRunId,
      t.createdAt
    ),
  ]
);

export type MediaProductionPlanVersion =
  typeof mediaProductionPlanVersions.$inferSelect;
export type InsertMediaProductionPlanVersion =
  typeof mediaProductionPlanVersions.$inferInsert;

export const mediaProductionPlanVerifications = pgTable(
  "media_production_plan_verifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    planVersion: integer("planVersion").notNull(),
    verifierSkillId: varchar("verifierSkillId", { length: 128 })
      .default("media-production-plan-verifier")
      .notNull(),
    verifierSkillVersion: varchar("verifierSkillVersion", { length: 32 }),
    verdict: varchar("verdict", { length: 32 }).notNull(),
    score: integer("score").default(0).notNull(),
    verification: jsonb("verification")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    blockingIssues: jsonb("blockingIssues")
      .$type<Array<Record<string, any>>>()
      .default([])
      .notNull(),
    warnings: jsonb("warnings")
      .$type<Array<Record<string, any>>>()
      .default([])
      .notNull(),
    missingDecisions: jsonb("missingDecisions")
      .$type<string[]>()
      .default([])
      .notNull(),
    recommendedRevisions: jsonb("recommendedRevisions")
      .$type<Array<Record<string, any>>>()
      .default([])
      .notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    contractVersion: varchar("contractVersion", { length: 32 })
      .default("1.0.0")
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("media_production_plan_verifications_run_idx").on(
      t.tenantId,
      t.productionRunId,
      t.planVersion,
      t.createdAt
    ),
  ]
);

export type MediaProductionPlanVerification =
  typeof mediaProductionPlanVerifications.$inferSelect;
export type InsertMediaProductionPlanVerification =
  typeof mediaProductionPlanVerifications.$inferInsert;

export const mediaProductionAssetPlans = pgTable(
  "media_production_asset_plans",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    planVersion: integer("planVersion").notNull(),
    assetPlan: jsonb("assetPlan")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    readiness: jsonb("readiness")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    status: varchar("status", { length: 32 }).default("planned").notNull(),
    contractVersion: varchar("contractVersion", { length: 32 })
      .default("1.0.0")
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("media_production_asset_plans_unique").on(
      t.tenantId,
      t.productionRunId,
      t.planVersion
    ),
  ]
);

export type MediaProductionAssetPlan =
  typeof mediaProductionAssetPlans.$inferSelect;
export type InsertMediaProductionAssetPlan =
  typeof mediaProductionAssetPlans.$inferInsert;

export const mediaProductionApprovals = pgTable(
  "media_production_approvals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    planVersion: integer("planVersion").notNull(),
    approvalType: varchar("approvalType", { length: 40 })
      .default("plan")
      .notNull(),
    status: varchar("status", { length: 32 }).default("approved").notNull(),
    acceptedWarnings: jsonb("acceptedWarnings")
      .$type<string[]>()
      .default([])
      .notNull(),
    lockedTargets: jsonb("lockedTargets")
      .$type<string[]>()
      .default([])
      .notNull(),
    notes: text("notes"),
    policySnapshot: jsonb("policySnapshot")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    budgetSnapshot: jsonb("budgetSnapshot")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("media_production_approvals_run_idx").on(
      t.tenantId,
      t.productionRunId,
      t.planVersion,
      t.createdAt
    ),
  ]
);

export type MediaProductionApproval =
  typeof mediaProductionApprovals.$inferSelect;
export type InsertMediaProductionApproval =
  typeof mediaProductionApprovals.$inferInsert;

export const mediaProductionOutputProjections = pgTable(
  "media_production_output_projections",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    storyboardRunId: varchar("storyboardRunId", { length: 128 }),
    surface: varchar("surface", { length: 40 }).notNull(),
    surfaceRecordId: varchar("surfaceRecordId", { length: 128 }),
    projectionVersion: integer("projectionVersion").default(1).notNull(),
    sourceOutputHash: varchar("sourceOutputHash", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    lastSyncedAt: timestamp("lastSyncedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("media_production_output_projection_unique").on(
      t.tenantId,
      t.productionRunId,
      t.surface,
      t.sourceOutputHash
    ),
  ]
);

export type MediaProductionOutputProjection =
  typeof mediaProductionOutputProjections.$inferSelect;
export type InsertMediaProductionOutputProjection =
  typeof mediaProductionOutputProjections.$inferInsert;

// Email verification tokens for signup flow
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  channel: varchar("channel", { length: 20 }).default("email").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  usedAt: timestamp("usedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Workflows — User's active workflow drafts
 * Separate from templates. Users edit workflows, then optionally save as template.
 */
export const workflows = pgTable(
  "workflows",
  {
    id: serial("id").primaryKey(),

    /** Workflow name */
    name: varchar("name", { length: 255 }).notNull(),

    /** Workflow description */
    description: text("description"),

    /** Default LLM model to use for this workflow */
    defaultModel: varchar("defaultModel", { length: 255 }),

    /** ReactFlow state: {nodes: [], edges: [], viewport: {}} */
    workflowJson: json("workflowJson")
      .$type<{
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
      }>()
      .notNull(),

    /** Owner user */
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Tenant for multi-tenant isolation */
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),

    /** Current workflow state */
    status: workflowStatusEnum("status").default("draft").notNull(),

    /** Last compilation timestamp */
    lastCompiledAt: timestamp("lastCompiledAt", { withTimezone: true }),

    /** Schema version for forward compatibility */
    schemaVersion: varchar("schemaVersion", { length: 10 })
      .default("1.0")
      .notNull(),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("workflows_user_idx").on(t.userId),
    index("workflows_tenant_idx").on(t.tenantId),
    index("workflows_status_idx").on(t.status),
  ]
);

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
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
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

  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type TemplateCategory = typeof templateCategories.$inferSelect;
export type InsertTemplateCategory = typeof templateCategories.$inferInsert;

/**
 * Workflow Templates — Marketplace
 * Public templates visible to all, private templates scoped to tenant
 */
export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: serial("id").primaryKey(),

    /** Template name */
    name: varchar("name", { length: 255 }).notNull(),

    /** Template description */
    description: text("description"),

    /** Validated ReactFlow state (same structure as workflows.workflowJson) */
    workflowJson: json("workflowJson")
      .$type<{
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
      }>()
      .notNull(),

    /** Template author */
    authorId: integer("authorId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Tenant (null for public templates) */
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),

    /** Category */
    categoryId: integer("categoryId").references(() => templateCategories.id, {
      onDelete: "set null",
    }),

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
    approvedBy: integer("approvedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    /** When admin approved the publish request */
    approvedAt: timestamp("approvedAt", { withTimezone: true }),
    /** Reason for rejection (shown to creator) */
    rejectionReason: text("rejectionReason"),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("workflow_templates_author_idx").on(t.authorId),
    index("workflow_templates_tenant_idx").on(t.tenantId),
    index("workflow_templates_category_idx").on(t.categoryId),
    index("workflow_templates_status_idx").on(t.status),
    // GIN indexes added in migration SQL (can't express in Drizzle directly)
  ]
);

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = typeof workflowTemplates.$inferInsert;

/**
 * Template Ratings — User feedback
 */
export const templateRatings = pgTable(
  "template_ratings",
  {
    id: serial("id").primaryKey(),

    /** Template being rated */
    templateId: integer("templateId")
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),

    /** User who rated */
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Rating value (1-5) */
    rating: integer("rating").notNull(),

    /** Optional review text */
    review: text("review"),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("template_ratings_unique").on(t.templateId, t.userId),
    index("template_ratings_template_idx").on(t.templateId),
  ]
);

export type TemplateRating = typeof templateRatings.$inferSelect;
export type InsertTemplateRating = typeof templateRatings.$inferInsert;

/**
 * Workflow Schedules — Cron-based workflow triggers
 */
export const workflowSchedules = pgTable(
  "workflow_schedules",
  {
    id: serial("id").primaryKey(),

    /** Workflow to execute */
    workflowId: integer("workflowId")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),

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

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("workflow_schedules_workflow_idx").on(t.workflowId),
    index("workflow_schedules_next_run_idx").on(t.nextRun),
    index("workflow_schedules_active_idx").on(t.isActive),
  ]
);

export type WorkflowSchedule = typeof workflowSchedules.$inferSelect;
export type InsertWorkflowSchedule = typeof workflowSchedules.$inferInsert;

/**
 * Webhook Calls — Webhook trigger history
 */
export const webhookCalls = pgTable(
  "webhook_calls",
  {
    id: serial("id").primaryKey(),

    /** Workflow that was triggered */
    workflowId: integer("workflowId")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),

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

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("webhook_calls_workflow_node_idx").on(t.workflowId, t.nodeId),
    index("webhook_calls_execution_idx").on(t.executionId),
    index("webhook_calls_created_idx").on(t.createdAt),
  ]
);

export type WebhookCall = typeof webhookCalls.$inferSelect;
export type InsertWebhookCall = typeof webhookCalls.$inferInsert;

/**
 * Workflow Event Subscriptions — Event-driven workflow triggers
 */
export const workflowEventSubscriptions = pgTable(
  "workflow_event_subscriptions",
  {
    id: serial("id").primaryKey(),

    /** Workflow to execute when event occurs */
    workflowId: integer("workflowId")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),

    /** Event trigger node ID */
    nodeId: varchar("nodeId", { length: 36 }).notNull(),

    /** Event type to listen for (e.g., "user.created", "skill.completed") */
    eventType: varchar("eventType", { length: 100 }).notNull(),

    /** Optional filter conditions (JSON) */
    filterConditions: json("filterConditions").$type<Record<string, any>>(),

    /** Whether subscription is active */
    isActive: boolean("isActive").default(true).notNull(),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("workflow_event_subscriptions_workflow_idx").on(t.workflowId),
    index("workflow_event_subscriptions_event_type_idx").on(t.eventType),
    index("workflow_event_subscriptions_active_idx").on(t.isActive),
  ]
);

export type WorkflowEventSubscription =
  typeof workflowEventSubscriptions.$inferSelect;
export type InsertWorkflowEventSubscription =
  typeof workflowEventSubscriptions.$inferInsert;

/**
 * Workflow Executions — Individual workflow run tracking (Section 13)
 * Each row represents one execution of a workflow (manual, scheduled, webhook, etc.)
 *
 * NOTE: LangGraph checkpoint tables (checkpoints, checkpoint_blobs, checkpoint_writes,
 * checkpoint_migrations) are auto-created by AsyncPostgresSaver.setup() in the Python backend.
 * Those tables are NOT managed by Drizzle. Do not add them here.
 */
export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: serial("id").primaryKey(),

    /** Workflow definition that was executed */
    workflowId: integer("workflowId")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),

    /** Tenant for multi-tenant isolation */
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** User who triggered the execution */
    userId: integer("userId")
      .notNull()
      .references(() => users.id),

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

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("workflow_executions_workflow_idx").on(t.workflowId),
    index("workflow_executions_tenant_idx").on(t.tenantId),
    index("workflow_executions_user_idx").on(t.userId),
    index("workflow_executions_status_idx").on(t.status),
    index("workflow_executions_thread_idx").on(t.threadId),
    index("workflow_executions_created_idx").on(t.createdAt),
  ]
);

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertWorkflowExecution = typeof workflowExecutions.$inferInsert;

/**
 * Workflow Dead Letter Queue — Failed items for reprocessing (Section 13)
 * Items land here after exhausting retry attempts. Admins can inspect and reprocess.
 */
export const workflowDeadLetterQueue = pgTable(
  "workflow_dead_letter_queue",
  {
    id: serial("id").primaryKey(),

    /** Workflow that generated this failure */
    workflowId: integer("workflowId")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),

    /** Execution run where the failure occurred */
    executionId: integer("executionId").references(
      () => workflowExecutions.id,
      { onDelete: "set null" }
    ),

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
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** When the item was reprocessed (null if not yet) */
    reprocessedAt: timestamp("reprocessedAt", { withTimezone: true }),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("dlq_workflow_idx").on(t.workflowId),
    index("dlq_execution_idx").on(t.executionId),
    index("dlq_status_idx").on(t.status),
    index("dlq_tenant_idx").on(t.tenantId),
    index("dlq_created_idx").on(t.createdAt),
  ]
);

export type WorkflowDeadLetterQueueItem =
  typeof workflowDeadLetterQueue.$inferSelect;
export type InsertWorkflowDeadLetterQueueItem =
  typeof workflowDeadLetterQueue.$inferInsert;

/**
 * Workflow Cache Metadata — Cache statistics and observability (Section 13)
 * Actual cached values live in Redis. This table tracks hit/miss rates per cache key
 * for monitoring, tuning TTLs, and identifying high-value cache entries.
 */
export const workflowCacheMetadata = pgTable(
  "workflow_cache_metadata",
  {
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
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("cache_metadata_node_type_idx").on(t.nodeType),
    index("cache_metadata_tenant_idx").on(t.tenantId),
    index("cache_metadata_last_hit_idx").on(t.lastHitAt),
  ]
);

export type WorkflowCacheMetadata = typeof workflowCacheMetadata.$inferSelect;
export type InsertWorkflowCacheMetadata =
  typeof workflowCacheMetadata.$inferInsert;

/**
 * Workflow Audit Events — Structured execution audit trail (Section 13)
 * Records who did what, when, with what data for governance and debugging.
 * Complements existing providerUsageLog (LLM-specific) and apiAuditEvents (media-specific).
 */
export const workflowAuditEvents = pgTable(
  "workflow_audit_events",
  {
    id: serial("id").primaryKey(),

    /** Workflow definition */
    workflowId: integer("workflowId")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),

    /** Execution run (null for workflow-level events like deploy/publish) */
    executionId: integer("executionId").references(
      () => workflowExecutions.id,
      { onDelete: "set null" }
    ),

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
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Trace ID for correlation with providerUsageLog and external systems */
    traceId: varchar("traceId", { length: 64 }),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("audit_events_workflow_idx").on(t.workflowId),
    index("audit_events_execution_idx").on(t.executionId),
    index("audit_events_event_type_idx").on(t.eventType),
    index("audit_events_tenant_idx").on(t.tenantId),
    index("audit_events_actor_idx").on(t.actorId),
    index("audit_events_trace_idx").on(t.traceId),
    index("audit_events_created_idx").on(t.createdAt),
  ]
);

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
export const workflowSecrets = pgTable(
  "workflow_secrets",
  {
    id: serial("id").primaryKey(),

    /** Tenant that owns this secret */
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Human-readable secret name (unique per tenant, e.g., "stripe_api_key", "github_token") */
    name: varchar("name", { length: 255 }).notNull(),

    /** AES-256-GCM encrypted value (format: "iv:authTag:ciphertext" hex) */
    encryptedValue: text("encryptedValue").notNull(),

    /** Vault backend used for this secret ("internal" = AES-256-GCM, future: "hashicorp", "aws_sm") */
    vaultBackend: varchar("vaultBackend", { length: 50 })
      .default("internal")
      .notNull(),

    /** Optional description of what this secret is for */
    description: text("description"),

    /** User who created this secret */
    createdBy: integer("createdBy").references(() => users.id),

    /** User who last updated this secret */
    updatedBy: integer("updatedBy").references(() => users.id),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("workflow_secrets_tenant_name_unique").on(t.tenantId, t.name),
    index("workflow_secrets_tenant_idx").on(t.tenantId),
  ]
);

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
export const workflowPolicyRules = pgTable(
  "workflow_policy_rules",
  {
    id: serial("id").primaryKey(),

    /** Tenant that owns this rule */
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

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

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("policy_rules_tenant_idx").on(t.tenantId),
    index("policy_rules_type_idx").on(t.ruleType),
    index("policy_rules_enabled_idx").on(t.enabled),
    index("policy_rules_priority_idx").on(t.priority),
  ]
);

export type WorkflowPolicyRule = typeof workflowPolicyRules.$inferSelect;
export type InsertWorkflowPolicyRule = typeof workflowPolicyRules.$inferInsert;

export const tenantBrowserPolicyConfig = pgTable(
  "tenant_browser_policy_config",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
    enforcementMode: varchar("enforcementMode", { length: 32 })
      .default("observe")
      .notNull(),
    defaultApprovalTtlSeconds: integer("defaultApprovalTtlSeconds")
      .default(300)
      .notNull(),
    reviewCadenceDays: integer("reviewCadenceDays").default(90).notNull(),
    killSwitchEnabled: boolean("killSwitchEnabled").default(false).notNull(),
    requireTamperEvidence: boolean("requireTamperEvidence")
      .default(true)
      .notNull(),
    evidenceRetentionDays: integer("evidenceRetentionDays")
      .default(365)
      .notNull(),
    allowedDomains: jsonb("allowedDomains")
      .$type<string[]>()
      .default([])
      .notNull(),
    visionModel: varchar("visionModel", { length: 100 })
      .default("gpt-4o")
      .notNull(),
    seededDefault: boolean("seededDefault").default(false).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("tenant_browser_policy_config_tenant_idx").on(t.tenantId),
    check(
      "tenant_browser_policy_config_ttl_bounds",
      sql`${t.defaultApprovalTtlSeconds} >= 60 AND ${t.defaultApprovalTtlSeconds} <= 900`
    ),
  ]
);

export type TenantBrowserPolicyConfig =
  typeof tenantBrowserPolicyConfig.$inferSelect;
export type InsertTenantBrowserPolicyConfig =
  typeof tenantBrowserPolicyConfig.$inferInsert;

export const tenantBrowserPolicyRules = pgTable(
  "tenant_browser_policy_rules",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    priority: integer("priority").default(100).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    description: text("description"),
    match: jsonb("match")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    thresholds: jsonb("thresholds")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    decision: browserPolicyDecisionEnum("decision").notNull(),
    reasonCode: varchar("reasonCode", { length: 100 }).notNull(),
    actionClass: browserActionClassEnum("actionClass"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("tenant_browser_policy_rules_tenant_idx").on(t.tenantId),
    index("tenant_browser_policy_rules_priority_idx").on(
      t.tenantId,
      t.priority
    ),
    index("tenant_browser_policy_rules_enabled_idx").on(t.tenantId, t.enabled),
  ]
);

export type TenantBrowserPolicyRule =
  typeof tenantBrowserPolicyRules.$inferSelect;
export type InsertTenantBrowserPolicyRule =
  typeof tenantBrowserPolicyRules.$inferInsert;

export const browserWorkflowEntitlements = pgTable(
  "browser_workflow_entitlements",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workflowId: integer("workflowId")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    workflowName: varchar("workflowName", { length: 255 }).notNull(),
    businessOwner: varchar("businessOwner", { length: 255 }),
    technicalOwner: varchar("technicalOwner", { length: 255 }),
    riskRating: varchar("riskRating", { length: 32 })
      .default("medium")
      .notNull(),
    allowedCapabilities: jsonb("allowedCapabilities")
      .$type<string[]>()
      .default([])
      .notNull(),
    forbiddenCapabilities: jsonb("forbiddenCapabilities")
      .$type<string[]>()
      .default([])
      .notNull(),
    allowedDataClasses: jsonb("allowedDataClasses")
      .$type<string[]>()
      .default(["public", "internal"])
      .notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    reviewCadenceDays: integer("reviewCadenceDays").default(90).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("uq_browser_workflow_entitlements_tenant_workflow").on(
      t.tenantId,
      t.workflowId
    ),
    index("browser_workflow_entitlements_tenant_idx").on(t.tenantId),
    index("browser_workflow_entitlements_workflow_idx").on(t.workflowId),
  ]
);

export type BrowserWorkflowEntitlement =
  typeof browserWorkflowEntitlements.$inferSelect;
export type InsertBrowserWorkflowEntitlement =
  typeof browserWorkflowEntitlements.$inferInsert;

export const browserPolicyDecisions = pgTable(
  "browser_policy_decisions",
  {
    id: serial("id").primaryKey(),
    traceId: varchar("traceId", { length: 64 }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
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
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    previousEventHash: varchar("previousEventHash", { length: 128 }),
    eventHash: varchar("eventHash", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("browser_policy_decisions_event_hash_uq").on(t.eventHash),
    index("browser_policy_decisions_tenant_created_idx").on(
      t.tenantId,
      t.createdAt
    ),
    index("browser_policy_decisions_trace_idx").on(t.traceId),
    index("browser_policy_decisions_execution_idx").on(t.executionId),
    index("browser_policy_decisions_decision_idx").on(t.decision, t.createdAt),
  ]
);

export type BrowserPolicyDecisionRecord =
  typeof browserPolicyDecisions.$inferSelect;
export type InsertBrowserPolicyDecisionRecord =
  typeof browserPolicyDecisions.$inferInsert;

export const liveBrowserSessions = pgTable(
  "live_browser_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: liveBrowserSourceTypeEnum("sourceType").notNull(),
    sourceId: varchar("sourceId", { length: 128 }),
    status: liveBrowserSessionStatusEnum("status").default("created").notNull(),
    controlMode: liveBrowserControlModeEnum("controlMode")
      .default("observe")
      .notNull(),
    sessionVersion: integer("sessionVersion").default(1).notNull(),
    controllerActorType: liveBrowserActorTypeEnum("controllerActorType"),
    controllerActorId: varchar("controllerActorId", { length: 64 }),
    controllerConnectionId: varchar("controllerConnectionId", { length: 128 }),
    controllerLeaseExpiresAt: timestamp("controllerLeaseExpiresAt", {
      withTimezone: true,
    }),
    runtimeOwnerId: varchar("runtimeOwnerId", { length: 128 }),
    runtimeOwnerClaimedAt: timestamp("runtimeOwnerClaimedAt", {
      withTimezone: true,
    }),
    pauseReason: varchar("pauseReason", { length: 128 }),
    pendingAssistRequestId: varchar("pendingAssistRequestId", { length: 64 }),
    pendingApprovalRequestId: varchar("pendingApprovalRequestId", {
      length: 64,
    }),
    policyContextJson: jsonb("policyContextJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    browserContextRef: jsonb("browserContextRef")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    streamRef: jsonb("streamRef")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    activeTabCount: integer("activeTabCount").default(1).notNull(),
    startedAt: timestamp("startedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActivityAt: timestamp("lastActivityAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("endedAt", { withTimezone: true }),
    endReason: varchar("endReason", { length: 128 }),
  },
  t => [
    index("live_browser_sessions_tenant_status_idx").on(t.tenantId, t.status),
    index("live_browser_sessions_user_activity_idx").on(
      t.userId,
      t.lastActivityAt
    ),
    index("live_browser_sessions_runtime_owner_idx").on(
      t.runtimeOwnerId,
      t.runtimeOwnerClaimedAt
    ),
  ]
);

export type LiveBrowserSessionRecord = typeof liveBrowserSessions.$inferSelect;
export type InsertLiveBrowserSessionRecord =
  typeof liveBrowserSessions.$inferInsert;

export const liveBrowserIdempotencyKeys = pgTable(
  "live_browser_idempotency_keys",
  {
    id: serial("id").primaryKey(),
    sessionId: varchar("sessionId", { length: 64 })
      .notNull()
      .references(() => liveBrowserSessions.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    commandType: varchar("commandType", { length: 64 }).notNull(),
    responseJson: jsonb("responseJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  },
  t => [
    uniqueIndex("uq_live_browser_idempotency_keys_session_key").on(
      t.sessionId,
      t.idempotencyKey
    ),
    index("live_browser_idempotency_keys_expires_idx").on(t.expiresAt),
  ]
);

export type LiveBrowserIdempotencyKeyRecord =
  typeof liveBrowserIdempotencyKeys.$inferSelect;
export type InsertLiveBrowserIdempotencyKeyRecord =
  typeof liveBrowserIdempotencyKeys.$inferInsert;

export const liveBrowserEvents = pgTable(
  "live_browser_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sessionId: varchar("sessionId", { length: 64 })
      .notNull()
      .references(() => liveBrowserSessions.id, { onDelete: "cascade" }),
    sessionVersionAt: integer("sessionVersionAt").notNull(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventType: liveBrowserEventTypeEnum("eventType").notNull(),
    actorType: liveBrowserActorTypeEnum("actorType").notNull(),
    actorId: varchar("actorId", { length: 64 }),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    screenshotRef: varchar("screenshotRef", { length: 255 }),
    cursor: varchar("cursor", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("uq_live_browser_events_session_cursor").on(
      t.sessionId,
      t.cursor
    ),
    index("live_browser_events_session_created_idx").on(
      t.sessionId,
      t.createdAt
    ),
    index("live_browser_events_session_version_idx").on(
      t.sessionId,
      t.sessionVersionAt
    ),
  ]
);

export type LiveBrowserEventRecord = typeof liveBrowserEvents.$inferSelect;
export type InsertLiveBrowserEventRecord =
  typeof liveBrowserEvents.$inferInsert;

export const liveBrowserAssistRequests = pgTable(
  "live_browser_assist_requests",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sessionId: varchar("sessionId", { length: 64 })
      .notNull()
      .references(() => liveBrowserSessions.id, { onDelete: "cascade" }),
    sessionVersionAt: integer("sessionVersionAt").notNull(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestType: liveBrowserAssistRequestTypeEnum("requestType").notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    prompt: text("prompt").notNull(),
    contextJson: jsonb("contextJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    responseJson: jsonb("responseJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    resolvedSessionVersionAt: integer("resolvedSessionVersionAt"),
    requestedAt: timestamp("requestedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
  },
  t => [
    index("live_browser_assist_requests_session_status_idx").on(
      t.sessionId,
      t.status
    ),
    index("live_browser_assist_requests_session_requested_idx").on(
      t.sessionId,
      t.requestedAt
    ),
  ]
);

export type LiveBrowserAssistRequestRecord =
  typeof liveBrowserAssistRequests.$inferSelect;
export type InsertLiveBrowserAssistRequestRecord =
  typeof liveBrowserAssistRequests.$inferInsert;

export const liveBrowserControlTransfers = pgTable(
  "live_browser_control_transfers",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sessionId: varchar("sessionId", { length: 64 })
      .notNull()
      .references(() => liveBrowserSessions.id, { onDelete: "cascade" }),
    sessionVersionAt: integer("sessionVersionAt").notNull(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fromActorType: liveBrowserActorTypeEnum("fromActorType").notNull(),
    fromActorId: varchar("fromActorId", { length: 64 }),
    toActorType: liveBrowserActorTypeEnum("toActorType").notNull(),
    toActorId: varchar("toActorId", { length: 64 }),
    reason: varchar("reason", { length: 128 }).notNull(),
    policyCheckHash: varchar("policyCheckHash", { length: 128 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("live_browser_control_transfers_session_created_idx").on(
      t.sessionId,
      t.createdAt
    ),
  ]
);

export type LiveBrowserControlTransferRecord =
  typeof liveBrowserControlTransfers.$inferSelect;
export type InsertLiveBrowserControlTransferRecord =
  typeof liveBrowserControlTransfers.$inferInsert;

// Cloud Task Events — Tracks Cloud Tasks execution for observability and DLQ
export const cloudTaskEvents = pgTable(
  "cloud_task_events",
  {
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

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
  },
  t => [
    index("cloud_task_events_task_id_idx").on(t.taskId),
    index("cloud_task_events_status_idx").on(t.status),
    index("cloud_task_events_queue_name_idx").on(t.queueName),
    index("cloud_task_events_job_id_idx").on(t.jobId),
  ]
);

export type CloudTaskEvent = typeof cloudTaskEvents.$inferSelect;
export type InsertCloudTaskEvent = typeof cloudTaskEvents.$inferInsert;

/**
 * Scheduled Job Runs — Tracks execution history of Celery Beat scheduled tasks.
 * Enables admin monitoring of what ran, when, success/failure, and duration.
 */
export const scheduledJobRuns = pgTable(
  "scheduled_job_runs",
  {
    id: serial("id").primaryKey(),
    /** Celery task name (e.g., "agency.purge_expired_memories") */
    taskName: varchar("taskName", { length: 200 }).notNull(),
    /** Celery task ID (unique per execution) */
    taskId: varchar("taskId", { length: 100 }),
    /** Status: started, success, failure, timeout */
    status: varchar("status", { length: 20 }).notNull(),
    /** When execution started */
    startedAt: timestamp("startedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** When execution completed (null if still running) */
    completedAt: timestamp("completedAt", { withTimezone: true }),
    /** Duration in milliseconds */
    durationMs: integer("durationMs"),
    /** Return value or result summary (JSON string, truncated) */
    result: text("result"),
    /** Error message if failed */
    errorMessage: text("errorMessage"),
    /** Retry attempt number (0 = first attempt) */
    retryCount: integer("retryCount").default(0),
  },
  t => [
    index("scheduled_job_runs_task_idx").on(t.taskName, t.startedAt),
    index("scheduled_job_runs_status_idx").on(t.status, t.startedAt),
  ]
);

export type ScheduledJobRun = typeof scheduledJobRuns.$inferSelect;
export type InsertScheduledJobRun = typeof scheduledJobRuns.$inferInsert;

// Funnel Events — Canonical milestone analytics stream
export const funnelEvents = pgTable(
  "funnel_events",
  {
    id: serial("id").primaryKey(),

    /** Tenant scope for analytics isolation and query performance */
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Domain scope for domain-admin fallback and attribution compatibility */
    domain: varchar("domain", { length: 255 }),

    /** User scope for first-event semantics and per-user drilldown */
    userId: integer("userId").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Canonical milestone event name */
    eventName: varchar("eventName", { length: 128 }).notNull(),

    /** Canonical UTC timestamp used for all aggregations */
    eventTime: timestamp("eventTime", { withTimezone: true }).notNull(),

    /** Deterministic dedup key used for insert-once contract */
    eventKey: varchar("eventKey", { length: 255 }).notNull(),

    /** Flexible metadata payload for drilldown and export */
    properties: jsonb("properties")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("funnel_events_event_key_unique").on(t.eventKey),
    index("funnel_events_tenant_event_time_idx").on(t.tenantId, t.eventTime),
    index("funnel_events_domain_event_time_idx").on(t.domain, t.eventTime),
    index("funnel_events_name_event_time_idx").on(t.eventName, t.eventTime),
    index("funnel_events_user_name_time_idx").on(
      t.userId,
      t.eventName,
      t.eventTime
    ),
  ]
);

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
export const funnelBackfillRuns = pgTable(
  "funnel_backfill_runs",
  {
    id: serial("id").primaryKey(),

    /** Unique run identifier for idempotent resume */
    runId: varchar("runId", { length: 64 }).notNull().unique(),

    /** Optional tenant filter (null = all tenants) */
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),

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
    totalRecordsProcessed: integer("totalRecordsProcessed")
      .notNull()
      .default(0),
    totalEventsInserted: integer("totalEventsInserted").notNull().default(0),

    /** Reconciliation gate results */
    reconciliationStatus: reconciliationStatusEnum("reconciliationStatus")
      .notNull()
      .default("pending"),
    reconciliationReport: jsonb("reconciliationReport").$type<
      Record<string, unknown>
    >(),

    /** Operator action timestamps */
    startedAt: timestamp("startedAt", { withTimezone: true }).notNull(),
    pausedAt: timestamp("pausedAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    abortedAt: timestamp("abortedAt", { withTimezone: true }),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("funnel_backfill_runs_status_idx").on(t.status),
    index("funnel_backfill_runs_tenant_idx").on(t.tenantId),
  ]
);

export type FunnelBackfillRun = typeof funnelBackfillRuns.$inferSelect;
export type InsertFunnelBackfillRun = typeof funnelBackfillRuns.$inferInsert;

/**
 * Funnel Backfill Checkpoints
 * Stores resumable position markers within a backfill run
 */
export const funnelBackfillCheckpoints = pgTable(
  "funnel_backfill_checkpoints",
  {
    id: serial("id").primaryKey(),

    /** Reference to parent run */
    runId: varchar("runId", { length: 64 })
      .notNull()
      .references(() => funnelBackfillRuns.runId, { onDelete: "cascade" }),

    /** Flexible position marker (e.g., {date: "2024-01-15", batch: 5}) */
    checkpointPosition: jsonb("checkpointPosition")
      .$type<Record<string, unknown>>()
      .notNull(),

    /** Progress at this checkpoint */
    recordsProcessed: integer("recordsProcessed").notNull(),
    eventsInserted: integer("eventsInserted").notNull(),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("funnel_backfill_checkpoints_run_idx").on(t.runId)]
);

export type FunnelBackfillCheckpoint =
  typeof funnelBackfillCheckpoints.$inferSelect;
export type InsertFunnelBackfillCheckpoint =
  typeof funnelBackfillCheckpoints.$inferInsert;

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
  networkDefaultAction: sandboxNetworkActionEnum("networkDefaultAction")
    .default("deny")
    .notNull(),
  allowBrowser: boolean("allowBrowser").default(false).notNull(),
  allowCommand: boolean("allowCommand").default(false).notNull(),
  allowCodeInterpreter: boolean("allowCodeInterpreter")
    .default(false)
    .notNull(),
  allowFileUpload: boolean("allowFileUpload").default(true).notNull(),
  maxInputMb: integer("maxInputMb").default(50),
  maxOutputMb: integer("maxOutputMb").default(100),
  isActive: boolean("isActive").default(true).notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SandboxProfile = typeof sandboxProfiles.$inferSelect;
export type InsertSandboxProfile = typeof sandboxProfiles.$inferInsert;

/**
 * Sandbox Jobs -- Canonical execution records for sandbox operations.
 * Tracks lifecycle from acceptance through execution to completion/failure.
 */
export const sandboxJobs = pgTable(
  "sandbox_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    featureType: sandboxFeatureTypeEnum("featureType").notNull(),
    featureRefId: varchar("featureRefId", { length: 128 }),
    executionMode: sandboxExecutionModeEnum("executionMode").notNull(),
    sandboxProfileId: integer("sandboxProfileId").references(
      () => sandboxProfiles.id
    ),
    opensandboxId: varchar("opensandboxId", { length: 128 }),
    status: sandboxJobStatusEnum("status").default("accepted").notNull(),
    statusReason: text("statusReason"),
    imageUri: varchar("imageUri", { length: 512 }),
    inputManifestJson:
      jsonb("inputManifestJson").$type<Record<string, unknown>>(),
    outputManifestJson:
      jsonb("outputManifestJson").$type<Record<string, unknown>>(),
    stdoutExcerpt: text("stdoutExcerpt"),
    stderrExcerpt: text("stderrExcerpt"),
    costEstimate: numeric("costEstimate", { precision: 12, scale: 4 }),
    costActual: numeric("costActual", { precision: 12, scale: 4 }),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    finishedAt: timestamp("finishedAt", { withTimezone: true }),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("sandbox_jobs_idempotency_idx")
      .on(t.tenantId, t.featureType, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    index("sandbox_jobs_tenant_status_idx").on(t.tenantId, t.status),
    index("sandbox_jobs_opensandbox_id_idx").on(t.opensandboxId),
    index("sandbox_jobs_user_idx").on(t.userId),
    index("sandbox_jobs_created_idx").on(t.createdAt),
    index("sandbox_jobs_expires_idx").on(t.expiresAt),
  ]
);

export type SandboxJob = typeof sandboxJobs.$inferSelect;
export type InsertSandboxJob = typeof sandboxJobs.$inferInsert;

/**
 * Sandbox Artifacts -- Output files produced by sandbox jobs.
 * Tracks S3/R2 object keys, types, sizes, and checksums.
 */
export const sandboxArtifacts = pgTable(
  "sandbox_artifacts",
  {
    id: serial("id").primaryKey(),
    sandboxJobId: varchar("sandboxJobId", { length: 36 })
      .notNull()
      .references(() => sandboxJobs.id, { onDelete: "cascade" }),
    artifactType: sandboxArtifactTypeEnum("artifactType").notNull(),
    objectKey: varchar("objectKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }),
    sizeBytes: bigint("sizeBytes", { mode: "number" }),
    sha256: varchar("sha256", { length: 64 }),
    isPrimary: boolean("isPrimary").default(false).notNull(),
    metadataJson: jsonb("metadataJson").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("sandbox_artifacts_job_idx").on(t.sandboxJobId),
    index("sandbox_artifacts_type_idx").on(t.artifactType),
  ]
);

export type SandboxArtifact = typeof sandboxArtifacts.$inferSelect;
export type InsertSandboxArtifact = typeof sandboxArtifacts.$inferInsert;

/**
 * Tenant Sandbox Policies -- Per-tenant sandbox usage limits and configuration.
 * One policy per tenant controlling concurrency, runtime, network, and image access.
 */
export const tenantSandboxPolicies = pgTable("tenant_sandbox_policies", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),
  defaultProfileId: integer("defaultProfileId").references(
    () => sandboxProfiles.id
  ),
  maxConcurrentSandboxes: integer("maxConcurrentSandboxes")
    .default(5)
    .notNull(),
  maxDailyRuntimeSeconds: integer("maxDailyRuntimeSeconds")
    .default(36000)
    .notNull(),
  maxSingleJobSeconds: integer("maxSingleJobSeconds").default(1800).notNull(),
  defaultNetworkAction: sandboxNetworkActionEnum("defaultNetworkAction"),
  egressRulesJson:
    jsonb("egressRulesJson").$type<Array<{ host: string; port?: number }>>(),
  allowedImagesJson: jsonb("allowedImagesJson").$type<string[]>(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type TenantSandboxPolicy = typeof tenantSandboxPolicies.$inferSelect;
export type InsertTenantSandboxPolicy =
  typeof tenantSandboxPolicies.$inferInsert;

// ==========================================
// Section 027: Agency-Swarm Integration
// ==========================================

/**
 * Agencies -- Multi-agent orchestration units.
 * Each agency contains a team of AI agents with directional communication flows.
 */
export const agencies = pgTable(
  "agencies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceTemplateId: varchar("sourceTemplateId", { length: 36 }).references(
      (): AnyPgColumn => agencyTemplates.id,
      { onDelete: "set null" }
    ),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    systemPrompt: text("systemPrompt"),
    creditMultiplier: numeric("creditMultiplier", {
      precision: 5,
      scale: 2,
    }).default("1.00"),
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
    visibility: varchar("visibility", { length: 20 })
      .default("private")
      .notNull(),
    /** Pre-generated SVG topology diagram for marketplace preview */
    previewSvg: text("previewSvg"),
    /** Generated phrases used by chat trigger detection */
    triggerPhrases: jsonb("triggerPhrases").$type<string[]>(),
    /** When the creator requested public publishing */
    requestedPublishAt: timestamp("requestedPublishAt", { withTimezone: true }),
    /** Admin who approved/rejected the publish request */
    approvedBy: integer("approvedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    /** When admin approved the publish request */
    approvedAt: timestamp("approvedAt", { withTimezone: true }),
    /** Reason for rejection (shown to creator) */
    rejectionReason: text("rejectionReason"),
    /** User-defined objective for this agency — used by improvement loop to evaluate results */
    objective: text("objective"),
    sharedInstructions: text("sharedInstructions"),
    userContext: jsonb("userContext").$type<Record<string, unknown>>(),
    conversationStarters: jsonb("conversationStarters").$type<string[]>(),
    topology: varchar("topology", { length: 30 }).default("custom").notNull(),
    documentVersion: integer("documentVersion").default(1).notNull(),
    defaultEngine: varchar("defaultEngine", { length: 30 })
      .default("agency_swarm")
      .notNull(),
    compileMode: varchar("compileMode", { length: 30 })
      .default("legacy_agency")
      .notNull(),
    compatibilityMode: varchar("compatibilityMode", { length: 50 })
      .default("preserve_agency_swarm")
      .notNull(),
    cacheConversationStarters: boolean("cacheConversationStarters")
      .default(false)
      .notNull(),
    createdBy: integer("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("agencies_tenant_slug_idx").on(t.tenantId, t.slug),
    index("agencies_tenant_idx").on(t.tenantId),
    index("agencies_created_by_idx").on(t.createdBy),
  ]
);

export type Agency = typeof agencies.$inferSelect;
export type InsertAgency = typeof agencies.$inferInsert;

/**
 * Agency Permissions — controls which groups can access a shared agency.
 * Mirrors the skillPermissions pattern.
 */
export const agencyPermissions = pgTable(
  "agency_permissions",
  {
    id: serial("id").primaryKey(),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    groupId: integer("groupId")
      .notNull()
      .references(() => userGroups.id, { onDelete: "cascade" }),
    grantedByUserId: integer("grantedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("agency_permissions_unique").on(t.agencyId, t.groupId),
    index("agency_permissions_group_idx").on(t.groupId),
    index("agency_permissions_agency_idx").on(t.agencyId),
  ]
);

export type AgencyPermission = typeof agencyPermissions.$inferSelect;
export type InsertAgencyPermission = typeof agencyPermissions.$inferInsert;

/**
 * Agency Run Feedback — User ratings and feedback after each agency run.
 * Powers the continuous improvement loop.
 */
export const agencyRunFeedback = pgTable(
  "agency_run_feedback",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    runId: varchar("runId", { length: 36 }).notNull(),
    conversationId: varchar("conversationId", { length: 36 }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 1-5 star rating */
    rating: integer("rating").notNull(),
    /** What matched expectations */
    whatWorked: text("whatWorked"),
    /** What didn't match expectations */
    whatDidntWork: text("whatDidntWork"),
    /** Specific improvement requests */
    improvementRequests: text("improvementRequests"),
    /** LLM-generated analysis of this feedback + suggestions */
    advisorAnalysis: jsonb("advisorAnalysis").$type<{
      suggestions: Array<{
        category: string;
        suggestion: string;
        priority: string;
        autoApplyable: boolean;
      }>;
      objectiveAlignment: number;
      analyzedAt: string;
    }>(),
    /** Whether advisor suggestions have been applied */
    suggestionsApplied: boolean("suggestionsApplied").default(false),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("agency_run_feedback_unique").on(t.runId, t.userId),
    index("agency_run_feedback_agency_idx").on(t.agencyId, t.createdAt),
  ]
);

export type AgencyRunFeedback = typeof agencyRunFeedback.$inferSelect;
export type InsertAgencyRunFeedback = typeof agencyRunFeedback.$inferInsert;

/**
 * Agency Improvement History — Tracks every improvement applied to an agency.
 * Provides audit trail for the continuous improvement loop.
 */
export const agencyImprovementHistory = pgTable(
  "agency_improvement_history",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** What triggered this improvement */
    triggerType: varchar("triggerType", { length: 30 }).notNull(),
    /** Source reference (feedbackId, health_monitor, etc.) */
    triggerRef: varchar("triggerRef", { length: 100 }),
    /** What was changed */
    changeType: varchar("changeType", { length: 30 }).notNull(),
    /** Which node was affected (null = agency-level) */
    agentNodeId: text("agentNodeId"),
    /** Description of the change */
    description: text("description").notNull(),
    /** Previous value (for rollback) */
    previousValue: text("previousValue"),
    /** New value */
    newValue: text("newValue"),
    /** Who approved (null = auto-applied) */
    approvedBy: integer("approvedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("agency_improvement_agency_idx").on(t.agencyId, t.createdAt)]
);

export type AgencyImprovementHistory =
  typeof agencyImprovementHistory.$inferSelect;
export type InsertAgencyImprovementHistory =
  typeof agencyImprovementHistory.$inferInsert;

/**
 * Agency Agents -- Individual AI agents within an agency.
 * Each agent has its own model, instructions, and tool set.
 */
export const agencyAgents = pgTable(
  "agency_agents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    instructions: text("instructions"),
    model: varchar("model", { length: 100 }),
    modelSettings: json("modelSettings").$type<{
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      reasoningEffort?: "minimal" | "low" | "medium" | "high";
    }>(),
    /** Capability-based model selection requirements (null = use manual model field) */
    modelRequirements: json("modelRequirements").$type<{
      supportsVision?: boolean;
      supportsThinking?: boolean;
      supportsFunctionTools?: boolean;
      supportsStructuredOutputs?: boolean;
      supportsJsonMode?: boolean;
      supportsStrictToolSchema?: boolean;
      supportsWebSearch?: boolean;
      supportsCodeExecution?: boolean;
      supportsComputerUse?: boolean;
      contextLength?: number;
      strategy?: "cheapest" | "balanced" | "best";
    }>(),
    isEntryPoint: boolean("isEntryPoint").default(false).notNull(),
    isOptional: boolean("isOptional").default(false).notNull(),
    position: json("position").$type<{ x: number; y: number }>(),
    subgraphId: varchar("subgraphId", { length: 100 }),
    engineHint: varchar("engineHint", { length: 30 }),
    runtimeConfig: jsonb("runtimeConfig").$type<Record<string, unknown>>(),
    nodeType: varchar("nodeType", { length: 30 }).default("agent").notNull(),
    nodeConfig: json("nodeConfig").$type<{
      // supervisor
      maxRounds?: number;
      routingStrategy?: "llm" | "round_robin" | "broadcast";
      // router
      routingMode?: "keyword" | "regex" | "llm_classify";
      routes?: Array<{
        condition: string;
        targetNodeId: string;
        label?: string;
      }>;
      defaultTargetNodeId?: string;
      // aggregator
      aggregationMode?:
        | "first_wins"
        | "majority_vote"
        | "llm_merge"
        | "concatenate";
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
      // conditional_branch (section-17)
      evaluationMode?: "rule_based" | "llm_classify" | "context_check";
      branches?: Array<{
        condition: string;
        operator?: string;
        value?: string;
        targetNodeId: string;
        label?: string;
      }>;
      // defaultTargetNodeId — reused from router (above) for conditional_branch fallback
      llmClassifyPrompt?: string;
      contextKey?: string;
      // parallel_fan_out (section-18)
      parallelBranches?: Array<{ targetNodeId: string; label?: string }>;
      mergeStrategy?:
        | "wait_all"
        | "first_complete"
        | "majority"
        | "custom_prompt";
      mergePrompt?: string;
      maxConcurrent?: number;
      branchTimeout?: number;
      continueOnError?: boolean;
      // loop_retry (section-19)
      loopTargetNodeId?: string;
      maxIterations?: number;
      exitCondition?:
        | "max_iterations"
        | "rule_based"
        | "llm_evaluate"
        | "context_check";
      exitRule?: { contextKey: string; operator: string; value: string };
      feedbackTemplate?: string;
      loopTimeout?: number;
      creditCap?: number;
      // skill_discovery (section-20)
      confidenceThreshold?: number;
      maxResults?: number;
      skillCategory?: string;
      // error_handler (section-21)
      errorStrategy?: "retry" | "fallback" | "skip" | "terminate";
      watchedNodeIds?: string[];
      maxRetries?: number;
      fallbackNodeId?: string;
      skipMessage?: string;
      retryBackoffMs?: number;
      // data_transform (section-21)
      transformMode?: "jsonpath" | "template" | "filter";
      jsonpathExpression?: string;
      templateString?: string;
      filterCondition?: string;
      outputContextKey?: string;
    }>(),
    outputSchema: jsonb("outputSchema").$type<Record<string, unknown>>(),
    examples:
      jsonb("examples").$type<Array<{ role: string; content: string }[]>>(),
    mcpServers:
      jsonb("mcpServers").$type<Array<{ url: string; name?: string }>>(),
    mcpServerTokensEncrypted: text("mcpServerTokensEncrypted"),
    parallelToolCalls: boolean("parallelToolCalls").default(true).notNull(),
    maxTurns: integer("maxTurns").default(25).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agency_agents_agency_idx").on(t.agencyId),
    uniqueIndex("agency_agents_agency_name_idx").on(t.agencyId, t.name),
  ]
);

export type AgencyAgent = typeof agencyAgents.$inferSelect;
export type InsertAgencyAgent = typeof agencyAgents.$inferInsert;

/**
 * Agency Subgraphs -- Hybrid document containers for mixed-engine execution groups.
 */
export const agencySubgraphs = pgTable(
  "agency_subgraphs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    subgraphKey: varchar("subgraphKey", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    engine: varchar("engine", { length: 30 }).default("agency_swarm").notNull(),
    entryNodeIds: jsonb("entryNodeIds")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    exitNodeIds: jsonb("exitNodeIds")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    nodeIds: jsonb("nodeIds")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    boundaryPolicy: jsonb("boundaryPolicy").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agency_subgraphs_agency_idx").on(t.agencyId),
    uniqueIndex("agency_subgraphs_agency_key_idx").on(
      t.agencyId,
      t.subgraphKey
    ),
  ]
);

export type AgencySubgraph = typeof agencySubgraphs.$inferSelect;
export type InsertAgencySubgraph = typeof agencySubgraphs.$inferInsert;

/**
 * Agency Templates -- Pre-configured multi-agent orchestration templates
 * (e.g. "SEO Team", "Software Development Agency")
 */
export const agencyTemplates = pgTable(
  "agency_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    systemPrompt: text("systemPrompt"),
    category: varchar("category", { length: 64 }).notNull(), // e.g. "Marketing", "Development"
    isActive: boolean("isActive").default(true).notNull(),
    /** Tenant that owns this template (F04 security requirement) */
    tenantId: varchar("tenantId", { length: 36 }).references(
      (): AnyPgColumn => tenants.id,
      { onDelete: "cascade" }
    ),
    /** User who created this template */
    createdBy: integer("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Original agency this template was derived from */
    sourceAgencyId: varchar("sourceAgencyId", { length: 36 }).references(
      (): AnyPgColumn => agencies.id,
      { onDelete: "set null" }
    ),
    /** Template status: draft (needs approval for public), approved, rejected */
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    /** Portable agent definitions (array indices instead of UUIDs) */
    agentDefinitions: jsonb("agentDefinitions").$type<
      Array<{
        name: string;
        nodeType: string;
        instructions?: string;
        modelRequirements?: Record<string, unknown>;
        nodeConfig?: Record<string, unknown>;
        toolIds?: string[];
        isEntryPoint?: boolean;
        relativePosition?: { x: number; y: number };
      }>
    >(),
    /** Portable communication flows (array indices instead of UUIDs) */
    communicationFlows: jsonb("communicationFlows").$type<
      Array<{
        fromIndex: number;
        toIndex: number;
        flowType: string;
        flowConfig?: Record<string, unknown>;
      }>
    >(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agency_templates_tenant_idx").on(t.tenantId),
    index("agency_templates_created_by_idx").on(t.createdBy),
  ]
);

export type AgencyTemplate = typeof agencyTemplates.$inferSelect;
export type InsertAgencyTemplate = typeof agencyTemplates.$inferInsert;

/**
 * Agent Templates -- Pre-configured individual roles
 * (e.g. "CEO", "Copywriter", "Data Analyst")
 *
 * Can be linked to a specific agency_template, or act as a standalone draggable node.
 */
export const agentTemplates = pgTable(
  "agent_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    agencyTemplateId: varchar("agencyTemplateId", { length: 36 }).references(
      () => agencyTemplates.id,
      { onDelete: "cascade" }
    ),
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
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agent_templates_agency_tmpl_idx").on(t.agencyTemplateId),
    index("agent_templates_category_idx").on(t.category),
  ]
);

export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type InsertAgentTemplate = typeof agentTemplates.$inferInsert;

/**
 * Agency Tools -- Tool definitions available to agency agents.
 */
export const agencyTools = pgTable(
  "agency_tools",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    toolType: varchar("toolType", { length: 20 }).notNull(),
    config: json("config").$type<Record<string, unknown>>(),
    riskLevel: varchar("riskLevel", { length: 10 }).default("low").notNull(),
    requiresApproval: boolean("requiresApproval").default(false).notNull(),
    inputSchema: jsonb("inputSchema").$type<Record<string, unknown>>(),
    outputSchema: jsonb("outputSchema").$type<Record<string, unknown>>(),
    httpMethod: varchar("httpMethod", { length: 10 }),
    headersEncrypted: text("headersEncrypted"),
    retryPolicy: jsonb("retryPolicy").$type<{
      maxRetries?: number;
      backoffMs?: number;
    }>(),
    icon: varchar("icon", { length: 50 }),
    category: varchar("category", { length: 50 }),
    version: integer("version").default(1).notNull(),
    isExposedAsApi: boolean("isExposedAsApi").default(false).notNull(),
    strictSchema: boolean("strictSchema").default(false).notNull(),
    oneCallAtATime: boolean("oneCallAtATime").default(false).notNull(),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agency_tools_tenant_idx").on(t.tenantId),
    uniqueIndex("agency_tools_tenant_name_idx").on(t.tenantId, t.name),
  ]
);

export type AgencyTool = typeof agencyTools.$inferSelect;
export type InsertAgencyTool = typeof agencyTools.$inferInsert;

/**
 * Agency Agent Tools -- Junction table linking agents to their assigned tools.
 */
export const agencyAgentTools = pgTable(
  "agency_agent_tools",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    agentId: varchar("agentId", { length: 36 })
      .notNull()
      .references(() => agencyAgents.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("agency_agent_tools_agent_tool_idx").on(t.agentId, t.toolId),
    index("agency_agent_tools_tool_idx").on(t.toolId),
  ]
);

export type AgencyAgentTool = typeof agencyAgentTools.$inferSelect;
export type InsertAgencyAgentTool = typeof agencyAgentTools.$inferInsert;

/**
 * Agency Communication Flows -- Directional communication links between agents.
 */
export const agencyCommunicationFlows = pgTable(
  "agency_communication_flows",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    fromAgentId: varchar("fromAgentId", { length: 36 })
      .notNull()
      .references(() => agencyAgents.id, { onDelete: "cascade" }),
    toAgentId: varchar("toAgentId", { length: 36 })
      .notNull()
      .references(() => agencyAgents.id, { onDelete: "cascade" }),
    flowType: varchar("flowType", { length: 20 })
      .default("delegation")
      .notNull(),
    flowConfig: jsonb("flowConfig").$type<{
      contextFields?: string[];
      requireSummary?: boolean;
      maxRoundTrips?: number;
      timeout?: number;
    }>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agency_comm_flows_agency_idx").on(t.agencyId),
    uniqueIndex("agency_comm_flows_unique_idx").on(
      t.agencyId,
      t.fromAgentId,
      t.toAgentId
    ),
  ]
);

export type AgencyCommunicationFlow =
  typeof agencyCommunicationFlows.$inferSelect;
export type InsertAgencyCommunicationFlow =
  typeof agencyCommunicationFlows.$inferInsert;

/**
 * Agency Conversations -- Chat sessions between a user and an agency.
 */
export const agencyConversations = pgTable(
  "agency_conversations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 })
      .default("New Agency Chat")
      .notNull(),
    totalCreditsUsed: numeric("totalCreditsUsed", {
      precision: 12,
      scale: 4,
    }).default("0"),
    messageCount: integer("messageCount").default(0).notNull(),
    isArchived: boolean("isArchived").default(false).notNull(),
    /** Origin: 'web', 'api', 'widget' */
    source: varchar("source", { length: 20 }).default("web"),
    /** API key that created this conversation */
    apiKeyId: varchar("apiKeyId", { length: 36 }),
    /** Auto-expire API-created conversations */
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agency_conversations_agency_user_idx").on(t.agencyId, t.userId),
    index("agency_conversations_user_idx").on(t.userId),
  ]
);

export type AgencyConversation = typeof agencyConversations.$inferSelect;
export type InsertAgencyConversation = typeof agencyConversations.$inferInsert;

/**
 * Agency Run Artifacts -- run-scoped preview and commit tracking for structured outputs.
 *
 * `runId` points at the Python-owned `agency_runs` table, so it is intentionally
 * stored without a database foreign key in Drizzle.
 */
export const agencyRunArtifacts = pgTable(
  "agency_run_artifacts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("runId", { length: 36 }).notNull(),
    conversationId: varchar("conversationId", { length: 36 })
      .notNull()
      .references(() => agencyConversations.id, { onDelete: "cascade" }),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    artifactType: varchar("artifactType", { length: 50 }).notNull(),
    intent: varchar("intent", { length: 50 }).notNull(),
    state: varchar("state", { length: 32 })
      .notNull()
      .default("preview_generated"),
    summary: text("summary"),
    payloadJson: json("payloadJson").$type<Record<string, unknown>>(),
    payloadStorageKey: varchar("payloadStorageKey", { length: 255 }),
    provenanceJson: json("provenanceJson").$type<Record<string, unknown>[]>(),
    commitStatus: varchar("commitStatus", { length: 32 })
      .notNull()
      .default("not_committed"),
    commitToken: varchar("commitToken", { length: 64 }).notNull(),
    targetType: varchar("targetType", { length: 64 }),
    targetId: varchar("targetId", { length: 128 }),
    committedAt: timestamp("committedAt", { withTimezone: true }),
    expiredAt: timestamp("expiredAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("agency_run_artifacts_commit_token_idx").on(t.commitToken),
    index("agency_run_artifacts_run_idx").on(t.runId),
    index("agency_run_artifacts_conversation_idx").on(t.conversationId),
    index("agency_run_artifacts_tenant_idx").on(t.tenantId),
  ]
);

export type AgencyRunArtifact = typeof agencyRunArtifacts.$inferSelect;
export type InsertAgencyRunArtifact = typeof agencyRunArtifacts.$inferInsert;

/**
 * Agency Versions -- Immutable snapshots of an agency graph for version history.
 * Max 50 versions per agency (oldest pruned on insert).
 */
export const agencyVersions = pgTable(
  "agency_versions",
  {
    id: serial("id").primaryKey(),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    versionNumber: integer("versionNumber").notNull(),
    snapshotJson: json("snapshotJson")
      .$type<Record<string, unknown>>()
      .notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    changeDescription: text("changeDescription"),
    createdByUserId: integer("createdByUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("av_agency_version_unique").on(t.agencyId, t.versionNumber),
    index("av_agency_created_idx").on(t.agencyId, t.createdAt),
  ]
);

export type AgencyVersion = typeof agencyVersions.$inferSelect;
export type InsertAgencyVersion = typeof agencyVersions.$inferInsert;

/**
 * Agency Agent Memories — Long-term learnings extracted from agent runs.
 * Scoped per-user: each user's memories are isolated.
 * Used by Level 3 autonomous agents to improve over time.
 */
export const agencyAgentMemories = pgTable(
  "agency_agent_memories",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentNodeId: text("agentNodeId").notNull(),
    memoryType: text("memoryType").notNull(),
    content: text("content").notNull(),
    contentHash: text("contentHash").notNull(),
    sourceRunId: text("sourceRunId"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).default(
      "1.000"
    ),
    useCount: integer("useCount").default(0).notNull(),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    embedding: vector1536("embedding"),
  },
  t => [
    index("agent_memories_tenant_idx").on(t.tenantId),
    index("agent_memories_agency_idx").on(t.agencyId),
    index("agent_memories_user_idx").on(t.userId),
    index("agent_memories_lookup_idx").on(
      t.tenantId,
      t.agencyId,
      t.agentNodeId,
      t.userId,
      t.isActive
    ),
    uniqueIndex("agent_memories_content_hash_idx").on(
      t.tenantId,
      t.agencyId,
      t.agentNodeId,
      t.userId,
      t.contentHash
    ),
  ]
);

export type AgencyAgentMemory = typeof agencyAgentMemories.$inferSelect;
export type InsertAgencyAgentMemory = typeof agencyAgentMemories.$inferInsert;

/**
 * Agency Memory Chunks — Raw agent output chunks stored for Level 2 fallback retrieval.
 * These rows are short-lived and are cleaned up by a TTL purge job.
 */
export const agencyMemoryChunks = pgTable(
  "agency_memory_chunks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentNodeId: text("agentNodeId").notNull(),
    runId: text("runId").notNull(),
    sourceNodeId: text("sourceNodeId").notNull(),
    chunkIndex: integer("chunkIndex").notNull(),
    content: text("content").notNull(),
    embedding: vector1536("embedding"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  },
  t => [
    index("memory_chunks_scope_idx").on(
      t.tenantId,
      t.agencyId,
      t.agentNodeId,
      t.userId
    ),
    index("memory_chunks_expires_idx").on(t.expiresAt),
    index("memory_chunks_run_idx").on(t.runId, t.sourceNodeId),
  ]
);

export type AgencyMemoryChunk = typeof agencyMemoryChunks.$inferSelect;
export type InsertAgencyMemoryChunk = typeof agencyMemoryChunks.$inferInsert;

/**
 * Agency Guardrails — input/output validation rules for agency agents.
 */
export const agencyGuardrails = pgTable(
  "agency_guardrails",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 10 }).notNull(),
    mode: varchar("mode", { length: 10 }).notNull(),
    strategy: varchar("strategy", { length: 30 }).notNull(),
    config: jsonb("config"),
    validationAttempts: integer("validationAttempts").default(1).notNull(),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agency_guardrails_tenant_idx").on(t.tenantId),
    index("agency_guardrails_agency_idx").on(t.agencyId),
    index("agency_guardrails_agency_enabled_idx").on(t.agencyId, t.isEnabled),
  ]
);

export type AgencyGuardrail = typeof agencyGuardrails.$inferSelect;
export type InsertAgencyGuardrail = typeof agencyGuardrails.$inferInsert;

/**
 * Agency Agent Guardrails — junction table linking agents to guardrails.
 */
export const agencyAgentGuardrails = pgTable(
  "agency_agent_guardrails",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    agentId: varchar("agentId", { length: 36 })
      .notNull()
      .references(() => agencyAgents.id, { onDelete: "cascade" }),
    guardrailId: varchar("guardrailId", { length: 36 })
      .notNull()
      .references(() => agencyGuardrails.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("agency_agent_guardrails_unique").on(t.agentId, t.guardrailId),
  ]
);

export type AgencyAgentGuardrail = typeof agencyAgentGuardrails.$inferSelect;
export type InsertAgencyAgentGuardrail =
  typeof agencyAgentGuardrails.$inferInsert;

/**
 * Agency Shared Tools — tools shared across all agents in an agency.
 * toolId is varchar(100) with no FK to allow both builtin string IDs and UUIDs.
 */
export const agencySharedTools = pgTable(
  "agency_shared_tools",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    toolId: varchar("toolId", { length: 100 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [uniqueIndex("agency_shared_tools_unique").on(t.agencyId, t.toolId)]
);

export type AgencySharedTool = typeof agencySharedTools.$inferSelect;
export type InsertAgencySharedTool = typeof agencySharedTools.$inferInsert;

/**
 * Agency Run Traces — structured execution traces for observability.
 * runId and agencyId are intentionally NOT foreign keys (Python-owned, audit persistence).
 */
export const agencyRunTraces = pgTable(
  "agency_run_traces",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    runId: varchar("runId", { length: 36 }).notNull(),
    agencyId: varchar("agencyId", { length: 36 }).notNull(),
    createdBy: integer("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    trace: jsonb("trace").notNull(),
    durationMs: integer("durationMs"),
    totalTokens: integer("totalTokens"),
    totalCost: numeric("totalCost", { precision: 10, scale: 6 }),
    status: varchar("status", { length: 20 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agency_run_traces_tenant_idx").on(t.tenantId),
    index("agency_run_traces_run_idx").on(t.runId),
    index("agency_run_traces_agency_idx").on(t.agencyId),
    index("agency_run_traces_created_idx").on(t.createdAt),
  ]
);

export type AgencyRunTrace = typeof agencyRunTraces.$inferSelect;
export type InsertAgencyRunTrace = typeof agencyRunTraces.$inferInsert;

// ─── Chat Bridge Tables ─────────────────────────────────────────────────────

/**
 * Telegram Connections -- Links a SmartSpecPro user to a Telegram account.
 * Replaces the user-level telegramChatId/telegramVerified fields with a
 * proper connection model supporting multiple bots and conversation binding.
 */
export const telegramConnections = pgTable(
  "telegram_connections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    telegramUserId: varchar("telegramUserId", { length: 64 }).notNull(),
    telegramChatId: varchar("telegramChatId", { length: 64 }).notNull(),
    telegramUsername: varchar("telegramUsername", { length: 64 }),
    botId: varchar("botId", { length: 64 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    activeChannelId: varchar("activeChannelId", { length: 36 }),
    linkedAt: timestamp("linkedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    linkedBy: varchar("linkedBy", { length: 20 }).notNull(),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    revokedBy: varchar("revokedBy", { length: 36 }),
    lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
  },
  t => [
    uniqueIndex("telegram_connections_bot_user_unique").on(
      t.botId,
      t.telegramUserId
    ),
    index("telegram_connections_tenant_user_idx").on(t.tenantId, t.userId),
    index("telegram_connections_chat_id_idx").on(t.telegramChatId),
  ]
);

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
export const conversationChannels = pgTable(
  "conversation_channels",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    chatConversationId: integer("chatConversationId").references(
      () => conversations.id,
      { onDelete: "cascade" }
    ),
    agencyConversationId: varchar("agencyConversationId", {
      length: 36,
    }).references(() => agencyConversations.id, { onDelete: "cascade" }),
    conversationType: varchar("conversationType", { length: 20 }).notNull(),
    channelType: varchar("channelType", { length: 20 }).notNull(),
    channelRefId: varchar("channelRefId", { length: 64 }),
    connectionId: varchar("connectionId", { length: 36 }),
    isPrimary: boolean("isPrimary").default(false).notNull(),
    syncMode: varchar("syncMode", { length: 20 }).notNull().default("two_way"),
    state: varchar("state", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("conversation_channels_chat_unique")
      .on(t.chatConversationId, t.channelType, t.channelRefId)
      .where(sql`"chatConversationId" IS NOT NULL`),
    uniqueIndex("conversation_channels_agency_unique")
      .on(t.agencyConversationId, t.channelType, t.channelRefId)
      .where(sql`"agencyConversationId" IS NOT NULL`),
    index("conversation_channels_tenant_type_idx").on(
      t.tenantId,
      t.channelType
    ),
    check(
      "conversation_channels_one_conv_check",
      sql`
    ("conversationType" = 'chat' AND "chatConversationId" IS NOT NULL AND "agencyConversationId" IS NULL)
    OR
    ("conversationType" = 'agency' AND "agencyConversationId" IS NOT NULL AND "chatConversationId" IS NULL)
  `
    ),
  ]
);

export type ConversationChannel = typeof conversationChannels.$inferSelect;
export type InsertConversationChannel =
  typeof conversationChannels.$inferInsert;

/**
 * Channel Messages -- Per-channel delivery tracking for outbound messages.
 *
 * messageId is stored as text because it may reference messages.id (integer)
 * or agency_messages.id (bigint). No FK constraint since it spans two tables.
 * messageType determines which source table to query.
 */
export const channelMessages = pgTable(
  "channel_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationChannelId: varchar("conversationChannelId", { length: 36 })
      .notNull()
      .references(() => conversationChannels.id, { onDelete: "cascade" }),
    messageId: text("messageId").notNull(),
    messageType: varchar("messageType", { length: 20 }).notNull(),
    channelType: varchar("channelType", { length: 20 }).notNull(),
    externalMessageId: varchar("externalMessageId", { length: 64 }),
    externalChatId: varchar("externalChatId", { length: 64 }),
    deliveryStatus: varchar("deliveryStatus", { length: 20 })
      .notNull()
      .default("pending"),
    attemptCount: integer("attemptCount").notNull().default(0),
    lastAttemptAt: timestamp("lastAttemptAt", { withTimezone: true }),
    deliveredAt: timestamp("deliveredAt", { withTimezone: true }),
    failureCode: varchar("failureCode", { length: 50 }),
    failureReason: text("failureReason"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
  },
  t => [
    uniqueIndex("channel_messages_external_unique").on(
      t.channelType,
      t.externalChatId,
      t.externalMessageId
    ),
    index("channel_messages_channel_msg_idx").on(
      t.conversationChannelId,
      t.messageId
    ),
  ]
);

export type ChannelMessage = typeof channelMessages.$inferSelect;
export type InsertChannelMessage = typeof channelMessages.$inferInsert;

/**
 * Telegram Link Tokens -- Auditable deep-link tokens for connecting
 * Telegram accounts and optionally binding to specific conversations.
 *
 * Uses the same split-ID pattern as conversation_channels for conversation FKs.
 */
export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetChatConversationId: integer("targetChatConversationId").references(
      () => conversations.id
    ),
    targetAgencyConversationId: varchar("targetAgencyConversationId", {
      length: 36,
    }).references(() => agencyConversations.id),
    targetConversationType: varchar("targetConversationType", { length: 20 }),
    purpose: varchar("purpose", { length: 20 }).notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    usedAt: timestamp("usedAt", { withTimezone: true }),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: integer("createdBy"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
  },
  t => [
    uniqueIndex("telegram_link_tokens_hash_unique").on(t.tokenHash),
    index("telegram_link_tokens_tenant_user_purpose_idx").on(
      t.tenantId,
      t.userId,
      t.purpose
    ),
  ]
);

export type TelegramLinkToken = typeof telegramLinkTokens.$inferSelect;
export type InsertTelegramLinkToken = typeof telegramLinkTokens.$inferInsert;

/**
 * Telegram Updates -- Webhook update deduplication and audit log.
 * Stores every inbound Telegram Update ID for dedupe and troubleshooting.
 */
export const telegramUpdates = pgTable(
  "telegram_updates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    botId: varchar("botId", { length: 64 }).notNull(),
    updateId: bigint("updateId", { mode: "bigint" }).notNull(),
    telegramChatId: varchar("telegramChatId", { length: 64 }),
    receivedAt: timestamp("receivedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processedAt", { withTimezone: true }),
    processingStatus: varchar("processingStatus", { length: 20 })
      .notNull()
      .default("accepted"),
    errorCode: varchar("errorCode", { length: 50 }),
    errorReason: text("errorReason"),
  },
  t => [
    uniqueIndex("telegram_updates_bot_update_unique").on(t.botId, t.updateId),
  ]
);

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
export const creatorSettlements = pgTable(
  "creator_settlements",
  {
    id: serial("id").primaryKey(),

    /** The run that triggered this settlement */
    runId: varchar("runId", { length: 36 }).notNull(),

    /** Entity type: agency, workflow, or skill */
    entityType: varchar("entityType", { length: 20 }).notNull(),

    /** Entity ID (agency.id, workflow.id, or skill.id) */
    entityId: varchar("entityId", { length: 36 }).notNull(),

    /** Runner (user who paid the fee) */
    runnerId: integer("runnerId")
      .notNull()
      .references(() => users.id),

    /** Creator (user who receives the payout) */
    creatorId: integer("creatorId")
      .notNull()
      .references(() => users.id),

    /** Tenant context */
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id),

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
    debitTransactionId: integer("debitTransactionId").references(
      () => creditTransactions.id
    ),

    /** Transaction ID for the creator's credit */
    creditTransactionId: integer("creditTransactionId").references(
      () => creditTransactions.id
    ),

    /** Settlement status */
    status: settlementStatusEnum("status").default("completed").notNull(),

    /** Idempotency key to prevent double settlement */
    idempotencyKey: varchar("idempotencyKey", { length: 256 }),

    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("creator_settlements_idempotency_key_unique")
      .on(t.idempotencyKey)
      .where(sql`"idempotencyKey" IS NOT NULL`),
    index("creator_settlements_creator_idx").on(t.creatorId),
    index("creator_settlements_runner_idx").on(t.runnerId),
    index("creator_settlements_entity_idx").on(t.entityType, t.entityId),
    index("creator_settlements_run_idx").on(t.runId),
    index("creator_settlements_tenant_idx").on(t.tenantId),
  ]
);

export type CreatorSettlement = typeof creatorSettlements.$inferSelect;
export type InsertCreatorSettlement = typeof creatorSettlements.$inferInsert;

// ==========================================
// ClawFeature: Persona Templates
// ==========================================

/**
 * Persona Templates -- AI persona definitions for customizing chat behavior.
 * Scope hierarchy: platform > tenant > user (4-level resolution chain).
 */
export const personaTemplates = pgTable(
  "persona_templates",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    userId: integer("userId").references(() => users.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    assistantNickname: text("assistantNickname"),
    assistantGender: text("assistantGender").default("neutral"),
    workingHours: jsonb("workingHours").$type<
      | {
          timezone: string;
          days: Partial<
            Record<
              | "monday"
              | "tuesday"
              | "wednesday"
              | "thursday"
              | "friday"
              | "saturday"
              | "sunday",
              { startTime: string; endTime: string }
            >
          >;
        }
      | {
          startTime: string;
          endTime: string;
          timezone: string;
        }
    >(),
    sourceTemplateIds: text("sourceTemplateIds")
      .array()
      .default(sql`'{}'`)
      .notNull(),
    sourceTemplateLabels: text("sourceTemplateLabels")
      .array()
      .default(sql`'{}'`)
      .notNull(),
    sourceTemplateCategories: text("sourceTemplateCategories")
      .array()
      .default(sql`'{}'`)
      .notNull(),
    systemPromptPrefix: text("systemPromptPrefix").notNull(),
    tone: text("tone"),
    language: text("language").default("auto"),
    responseStyle: jsonb("responseStyle").default({}),
    restrictions: text("restrictions")
      .array()
      .default(sql`'{}'`),
    scope: text("scope").notNull(),
    isDefault: boolean("isDefault").default(false),
    provisionedByBlueprintId: varchar("provisionedByBlueprintId", {
      length: 120,
    }),
    provisionedByBlueprintMemberId: varchar("provisionedByBlueprintMemberId", {
      length: 120,
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("persona_templates_tenant_scope_idx").on(t.tenantId, t.scope),
    index("persona_templates_user_idx").on(t.userId),
    index("persona_templates_source_template_ids_idx").using(
      "gin",
      t.sourceTemplateIds
    ),
    index("persona_templates_blueprint_origin_idx").on(
      t.provisionedByBlueprintId,
      t.provisionedByBlueprintMemberId
    ),
    check(
      "persona_templates_assistant_gender_check",
      sql`"assistantGender" IN ('female','male','neutral') OR "assistantGender" IS NULL`
    ),
    check(
      "persona_templates_tone_check",
      sql`"tone" IN ('formal','casual','friendly','technical','creative') OR "tone" IS NULL`
    ),
    check(
      "persona_templates_scope_check",
      sql`"scope" IN ('platform','tenant','user')`
    ),
  ]
);

export type PersonaTemplate = typeof personaTemplates.$inferSelect;
export type InsertPersonaTemplate = typeof personaTemplates.$inferInsert;

// ==========================================
// ClawFeature: Channel Infrastructure
// ==========================================

/**
 * Channel Connections -- Generalizes telegramConnections to support
 * multiple channel types (Telegram, WhatsApp, LINE, Slack, Discord).
 */
export const channelConnections = pgTable(
  "channel_connections",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelType: text("channelType").notNull(),
    externalUserId: text("externalUserId").notNull(),
    externalChatId: text("externalChatId"),
    connectionConfig: jsonb("connectionConfig").default({}),
    status: text("status").notNull().default("pending"),
    activeChannelId: varchar("activeChannelId", { length: 36 }),
    linkedAt: timestamp("linkedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    linkedBy: varchar("linkedBy", { length: 20 }),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    revokedBy: varchar("revokedBy", { length: 36 }),
  },
  t => [
    uniqueIndex("channel_connections_tenant_type_user_unique").on(
      t.tenantId,
      t.channelType,
      t.externalUserId
    ),
    index("channel_connections_tenant_type_status_idx").on(
      t.tenantId,
      t.channelType,
      t.status
    ),
    index("channel_connections_tenant_user_idx").on(t.tenantId, t.userId),
    check(
      "channel_connections_type_check",
      sql`"channelType" IN ('telegram','whatsapp','line','slack','discord')`
    ),
    check(
      "channel_connections_status_check",
      sql`"status" IN ('active','revoked','pending','blocked')`
    ),
  ]
);

export type ChannelConnection = typeof channelConnections.$inferSelect;
export type InsertChannelConnection = typeof channelConnections.$inferInsert;

/**
 * Channel Credentials -- Admin-configured per-tenant channel secrets
 * (bot tokens, API keys, webhook secrets). Encrypted via crypto.ts.
 */
export const channelCredentials = pgTable(
  "channel_credentials",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channelType: text("channelType").notNull(),
    credentialsEncrypted: text("credentialsEncrypted").notNull(),
    webhookUrl: text("webhookUrl"),
    webhookSecretEncrypted: text("webhookSecretEncrypted"),
    isActive: boolean("isActive").default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("channel_credentials_tenant_type_unique").on(
      t.tenantId,
      t.channelType
    ),
    check(
      "channel_credentials_type_check",
      sql`"channelType" IN ('telegram','whatsapp','line','slack','discord')`
    ),
  ]
);

export type ChannelCredential = typeof channelCredentials.$inferSelect;
export type InsertChannelCredential = typeof channelCredentials.$inferInsert;

// ==========================================
// ClawFeature: Chat Widget & Artifacts
// ==========================================

/**
 * Chat Widgets -- Embeddable chat widget configurations per tenant.
 */
export const chatWidgets = pgTable(
  "chat_widgets",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetType: text("targetType"),
    targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(
      () => agencies.id,
      { onDelete: "set null" }
    ),
    defaultPersonaId: varchar("defaultPersonaId", { length: 36 }).references(
      () => personaTemplates.id,
      { onDelete: "set null" }
    ),
    theme: jsonb("theme"),
    allowedOrigins: text("allowedOrigins")
      .array()
      .default(sql`'{}'`),
    rateLimitPerMinute: integer("rateLimitPerMinute").default(10),
    maxConversationLength: integer("maxConversationLength").default(100),
    requireEmail: boolean("requireEmail").default(false),
    creditSource: text("creditSource"),
    monthlyCreditBudget: integer("monthlyCreditBudget"),
    maxCreditsPerVisitorSession: integer("maxCreditsPerVisitorSession").default(
      50
    ),
    maxCreditsPerVisitorDay: integer("maxCreditsPerVisitorDay").default(100),
    isActive: boolean("isActive").default(true),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("chat_widgets_tenant_active_idx").on(t.tenantId, t.isActive),
    check(
      "chat_widgets_target_type_check",
      sql`"targetType" IN ('chat','agency') OR "targetType" IS NULL`
    ),
    check(
      "chat_widgets_credit_source_check",
      sql`"creditSource" IN ('tenant','visitor') OR "creditSource" IS NULL`
    ),
  ]
);

export type ChatWidget = typeof chatWidgets.$inferSelect;
export type InsertChatWidget = typeof chatWidgets.$inferInsert;

/**
 * Conversation Artifacts -- Versioned AI-generated artifacts
 * (code, charts, tables, React components, HTML) stored per conversation.
 */
export const conversationArtifacts = pgTable(
  "conversation_artifacts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    conversationId: integer("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: integer("messageId")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    artifactType: text("artifactType").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    language: text("language"),
    version: integer("version").default(1),
    parentArtifactId: varchar("parentArtifactId", { length: 36 }).references(
      (): AnyPgColumn => conversationArtifacts.id,
      { onDelete: "set null" }
    ),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("conversation_artifacts_conversation_idx").on(t.conversationId),
    index("conversation_artifacts_message_idx").on(t.messageId),
    check(
      "conversation_artifacts_type_check",
      sql`"artifactType" IN ('code','react','chart','table','mermaid','html','markdown','svg')`
    ),
  ]
);

export type ConversationArtifact = typeof conversationArtifacts.$inferSelect;
export type InsertConversationArtifact =
  typeof conversationArtifacts.$inferInsert;

// ==========================================
// ClawFeature: Webhooks & Routing
// ==========================================

/**
 * Webhook Triggers -- Inbound webhook endpoints for external integrations.
 * Auth secrets are AES-256-GCM encrypted via crypto.ts.
 */
export const webhookTriggers = pgTable(
  "webhook_triggers",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    authType: text("authType").notNull().default("token"),
    authSecretEncrypted: text("authSecretEncrypted").notNull(),
    targetType: text("targetType").notNull(),
    targetConversationId: integer("targetConversationId").references(
      () => conversations.id,
      { onDelete: "set null" }
    ),
    targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(
      () => agencies.id,
      { onDelete: "set null" }
    ),
    targetWorkflowId: integer("targetWorkflowId").references(
      () => workflows.id,
      { onDelete: "set null" }
    ),
    payloadTemplate: jsonb("payloadTemplate").default({}),
    rateLimitPerMinute: integer("rateLimitPerMinute").default(10),
    monthlyTriggerBudget: integer("monthlyTriggerBudget"),
    isActive: boolean("isActive").default(true),
    totalTriggers: integer("totalTriggers").default(0),
    lastTriggeredAt: timestamp("lastTriggeredAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("webhook_triggers_tenant_active_idx").on(t.tenantId, t.isActive),
    check(
      "webhook_triggers_auth_type_check",
      sql`"authType" IN ('token','hmac_sha256')`
    ),
    check(
      "webhook_triggers_target_type_check",
      sql`"targetType" IN ('chat','agency','workflow')`
    ),
  ]
);

export type WebhookTrigger = typeof webhookTriggers.$inferSelect;
export type InsertWebhookTrigger = typeof webhookTriggers.$inferInsert;

/**
 * Webhook Trigger Logs -- Append-heavy log of webhook invocations.
 */
export const webhookTriggerLogs = pgTable(
  "webhook_trigger_logs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    triggerId: varchar("triggerId", { length: 36 })
      .notNull()
      .references(() => webhookTriggers.id, { onDelete: "cascade" }),
    requestMethod: text("requestMethod"),
    requestHeadersSafe: jsonb("requestHeadersSafe"),
    requestBodyHash: varchar("requestBodyHash", { length: 64 }),
    requestBodySize: integer("requestBodySize"),
    extractedVariables: jsonb("extractedVariables"),
    sourceIpMasked: text("sourceIpMasked"),
    status: text("status").notNull(),
    targetExecutionId: text("targetExecutionId"),
    creditsConsumed: numeric("creditsConsumed", {
      precision: 12,
      scale: 4,
    }).default("0"),
    errorMessage: text("errorMessage"),
    processingTimeMs: integer("processingTimeMs"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("webhook_trigger_logs_trigger_created_idx").on(
      t.triggerId,
      t.createdAt
    ),
    check(
      "webhook_trigger_logs_status_check",
      sql`"status" IN ('success','auth_failed','rate_limited','target_error','credit_insufficient')`
    ),
  ]
);

export type WebhookTriggerLog = typeof webhookTriggerLogs.$inferSelect;
export type InsertWebhookTriggerLog = typeof webhookTriggerLogs.$inferInsert;

/**
 * Channel Routing Rules -- Priority-ordered rules for routing inbound
 * channel messages to agencies, conversations, or workflows.
 */
export const channelRoutingRules = pgTable(
  "channel_routing_rules",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priority: integer("priority").default(50),
    isActive: boolean("isActive").default(true),
    conditions: jsonb("conditions").notNull(),
    targetType: text("targetType").notNull(),
    targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(
      () => agencies.id,
      { onDelete: "set null" }
    ),
    targetPersonaId: varchar("targetPersonaId", { length: 36 }).references(
      () => personaTemplates.id,
      { onDelete: "set null" }
    ),
    targetWorkflowId: integer("targetWorkflowId").references(
      () => workflows.id,
      { onDelete: "set null" }
    ),
    totalMatches: integer("totalMatches").default(0),
    lastMatchedAt: timestamp("lastMatchedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("channel_routing_rules_tenant_active_priority_idx").on(
      t.tenantId,
      t.isActive,
      t.priority
    ),
    check(
      "channel_routing_rules_target_type_check",
      sql`"targetType" IN ('agency','chat','workflow')`
    ),
  ]
);

export type ChannelRoutingRule = typeof channelRoutingRules.$inferSelect;
export type InsertChannelRoutingRule = typeof channelRoutingRules.$inferInsert;

// ── Automation Copilot ────────────────────────────────────────────────

export const automationTemplates = pgTable(
  "automation_templates",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    intent: jsonb("intent").notNull(),
    scripts: jsonb("scripts").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    isPublic: boolean("is_public").default(false).notNull(),
    usageCount: integer("usage_count").default(0).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("automation_templates_tenant_idx").on(t.tenantId),
    index("automation_templates_public_usage_idx").on(t.isPublic, t.usageCount),
  ]
);

export type AutomationTemplate = typeof automationTemplates.$inferSelect;
export type InsertAutomationTemplate = typeof automationTemplates.$inferInsert;

// ── Task Execution Intelligence (Spec 037 §03) ────────────────────────

export const taskRunStatusEnum = pgEnum("task_run_status", [
  "planned",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const stepAttemptStatusEnum = pgEnum("step_attempt_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const taskRuns = pgTable(
  "task_runs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),
    taskType: varchar("taskType", { length: 32 }).notNull(),
    sourceType: varchar("sourceType", { length: 32 }).notNull(),
    status: taskRunStatusEnum("status").notNull().default("planned"),
    /** Immutable plan JSON — frozen at creation, never modified */
    planJson: jsonb("planJson").notNull(),
    skillSlug: varchar("skillSlug", { length: 100 }),
    conversationId: integer("conversationId"),
    totalCreditsUsed: integer("totalCreditsUsed").default(0),
    /** Artifact routing metadata */
    artifactIntent: varchar("artifactIntent", { length: 32 }),
    executionRoute: varchar("executionRoute", { length: 32 }),
    routeReason: text("routeReason"),
    /** Trace ID for correlation with provider_usage_log */
    traceId: varchar("traceId", { length: 64 }),
    /** Linked artifact references */
    presentationDeckId: integer("presentationDeckId"),
    artifactMessageId: integer("artifactMessageId"),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("task_runs_user_idx").on(t.userId),
    index("task_runs_tenant_idx").on(t.tenantId),
    index("task_runs_status_idx").on(t.status),
    index("task_runs_created_idx").on(t.createdAt),
  ]
);

export type TaskRun = typeof taskRuns.$inferSelect;
export type InsertTaskRun = typeof taskRuns.$inferInsert;

export const taskStepAttempts = pgTable(
  "task_step_attempts",
  {
    id: serial("id").primaryKey(),
    taskRunId: integer("taskRunId")
      .notNull()
      .references(() => taskRuns.id, { onDelete: "cascade" }),
    attemptIndex: integer("attemptIndex").notNull().default(0),
    /** Resolved model snapshot — frozen at attempt start */
    resolvedModelSnapshot: jsonb("resolvedModelSnapshot"),
    effectiveModel: varchar("effectiveModel", { length: 128 }),
    provider: varchar("provider", { length: 128 }),
    strategy: varchar("strategy", { length: 32 }),
    inputTokens: integer("inputTokens").default(0),
    outputTokens: integer("outputTokens").default(0),
    creditsUsed: integer("creditsUsed").default(0),
    costUsd: numeric("costUsd", { precision: 12, scale: 8 }).default("0"),
    durationMs: integer("durationMs"),
    status: stepAttemptStatusEnum("status").notNull().default("pending"),
    fallbackReason: text("fallbackReason"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("task_step_attempts_run_idx").on(t.taskRunId),
    index("task_step_attempts_model_idx").on(t.effectiveModel),
  ]
);

// ── Spec 038: Content Artifacts (Citation-Gated Quality) ──────────────

export const contentArtifactStatusEnum = pgEnum("content_artifact_status", [
  "active",
  "stale",
  "archived",
]);

export const contentArtifacts = pgTable(
  "content_artifacts",
  {
    id: serial("id").primaryKey(),
    tenantId: text("tenantId").notNull(),
    userId: integer("userId").notNull(),
    skillSlug: text("skillSlug").notNull(),
    outputFormat: text("outputFormat").notNull(),
    contentJson: jsonb("contentJson"),
    qualityScore: jsonb("qualityScore"),
    lastVerifiedAt: timestamp("lastVerifiedAt", { withTimezone: true }),
    refreshCadenceDays: integer("refreshCadenceDays").default(30),
    nextRefreshAt: timestamp("nextRefreshAt", { withTimezone: true }),
    status: contentArtifactStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("content_artifacts_tenant_idx").on(t.tenantId),
    index("content_artifacts_status_idx").on(t.status),
    index("content_artifacts_next_refresh_idx").on(t.nextRefreshAt),
  ]
);

// ============================================================
// Spec 035: Content Automation Engine — Level 3 Schema (Phase 2 forward-design)
// Tables created in Phase 1 for schema readiness; not yet referenced
// by application code. Will be activated in Phase 2.
// ============================================================

export const contentSpecStatusEnum = pgEnum("content_spec_status", [
  "active",
  "paused",
  "archived",
]);

export const contentAutomationRunStatusEnum = pgEnum(
  "content_automation_run_status",
  ["pending", "running", "completed", "failed", "export_failed"]
);

/**
 * Content Specs — Level 3 Content Automation Engine definitions.
 * One row per user-defined automation spec (recurring or one-time).
 */
export const contentSpecs = pgTable(
  "content_specs",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    specData: jsonb("spec_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: contentSpecStatusEnum("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    nextRun: timestamp("next_run", { withTimezone: true }),
    lastRun: timestamp("last_run", { withTimezone: true }),
    totalRuns: integer("total_runs").notNull().default(0),
    totalItemsCreated: integer("total_items_created").notNull().default(0),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    dailyCreditLimit: integer("daily_credit_limit"),
    monthlyCreditLimit: integer("monthly_credit_limit"),
    creditsUsedToday: integer("credits_used_today").notNull().default(0),
    creditsUsedMonth: integer("credits_used_month").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("content_specs_status_next_run_idx").on(t.status, t.nextRun),
    index("content_specs_tenant_idx").on(t.tenantId),
    index("content_specs_user_idx").on(t.userId),
  ]
);

export type ContentSpec = typeof contentSpecs.$inferSelect;
export type InsertContentSpec = typeof contentSpecs.$inferInsert;

/**
 * Content Automation Runs — execution history for each fired content spec.
 */
export const contentAutomationRuns = pgTable(
  "content_automation_runs",
  {
    id: serial("id").primaryKey(),
    specId: integer("spec_id")
      .notNull()
      .references(() => contentSpecs.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    scheduleItemIndex: integer("schedule_item_index").notNull().default(0),
    status: contentAutomationRunStatusEnum("status")
      .notNull()
      .default("pending"),
    topicsResolved: jsonb("topics_resolved").$type<string[]>().default([]),
    itemsRequested: integer("items_requested").notNull().default(0),
    itemsCompleted: integer("items_completed").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    outputArtifacts: jsonb("output_artifacts")
      .$type<Array<{ deck_id: number; topic: string; slide_count: number }>>()
      .default([]),
    exportUrls: jsonb("export_urls")
      .$type<Array<{ deck_id: number; url: string; format: string }>>()
      .default([]),
    itemErrors: jsonb("item_errors")
      .$type<Array<{ topic: string; error: string; index: number }>>()
      .default([]),
    creditsUsed: numeric("credits_used", { precision: 10, scale: 4 }).default(
      "0"
    ),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("content_automation_runs_spec_created_idx").on(t.specId, t.createdAt),
    index("content_automation_runs_tenant_idx").on(t.tenantId),
    index("content_automation_runs_created_at_idx").on(t.createdAt),
    index("content_automation_runs_status_idx").on(t.status),
  ]
);

export type ContentAutomationRun = typeof contentAutomationRuns.$inferSelect;
export type InsertContentAutomationRun =
  typeof contentAutomationRuns.$inferInsert;

/**
 * Auto Draft Schedules — recurring or one-time auto-draft schedules managed by the Content Automation Engine.
 */
export const autoDraftSchedules = pgTable(
  "auto_draft_schedules",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 128 }).notNull(),
    userId: integer("userId")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    topicTemplate: text("topicTemplate").notNull(),
    scheduleType: varchar("scheduleType", { length: 20 }).notNull(),
    cronExpression: varchar("cronExpression", { length: 100 }),
    runAt: timestamp("runAt", { withTimezone: true }),
    timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
    draftParams: jsonb("draftParams")
      .$type<Record<string, unknown>>()
      .notNull(),
    notifyEmail: boolean("notifyEmail").default(true).notNull(),
    notifyWebhookUrl: text("notifyWebhookUrl"),
    webhookSecretEncrypted: text("webhookSecretEncrypted"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    nextRun: timestamp("nextRun", { withTimezone: true }),
    lastRun: timestamp("lastRun", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("auto_draft_schedules_status_next_run_idx").on(
      table.status,
      table.nextRun
    ),
    index("auto_draft_schedules_tenant_idx").on(table.tenantId),
    index("auto_draft_schedules_user_idx").on(table.userId),
  ]
);

export type AutoDraftSchedule = typeof autoDraftSchedules.$inferSelect;
export type InsertAutoDraftSchedule = typeof autoDraftSchedules.$inferInsert;

// ─── Public API Tables (Feature 043) ────────────────────────────────────────

/**
 * API Keys — central registry for public API authentication.
 * Keys use sk-ssp_ prefix and HMAC-SHA256 hashing with server pepper.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 100 }).notNull(),
    keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
    keyHash: varchar("keyHash", { length: 128 }).notNull(),
    scopes: json("scopes").$type<string[]>().notNull(),
    rateLimit: integer("rateLimit").default(60).notNull(),
    creditLimit: integer("creditLimit"),
    // Request-count quotas per time window (null = unlimited)
    quotaHourly: integer("quotaHourly"),
    quotaDaily: integer("quotaDaily"),
    quotaWeekly: integer("quotaWeekly"),
    quotaMonthly: integer("quotaMonthly"),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
    isActive: boolean("isActive").default(true).notNull(),
    // Admin-managed temporary suspension (separate from permanent revocation)
    isSuspended: boolean("isSuspended").default(false).notNull(),
    suspendedReason: varchar("suspendedReason", { length: 500 }),
    suspendedAt: timestamp("suspendedAt", { withTimezone: true }),
    suspendedBy: integer("suspendedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("api_keys_key_hash_idx").on(t.keyHash),
    index("api_keys_tenant_idx").on(t.tenantId),
    index("api_keys_user_idx").on(t.userId),
  ]
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

/**
 * Public API Audit Log — log table for all API key requests.
 * Separate from apiAuditEvents (media/skill/LLM structured logging).
 * No foreign keys — should not cascade when keys are revoked.
 * 90-day retention enforced by cleanup job.
 */
export const publicApiAuditLog = pgTable(
  "public_api_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId").notNull(),
    apiKeyId: varchar("apiKeyId", { length: 36 }),
    traceId: varchar("traceId", { length: 36 }),
    method: varchar("method", { length: 10 }).notNull(),
    path: varchar("path", { length: 255 }).notNull(),
    statusCode: integer("statusCode"),
    creditsUsed: integer("creditsUsed").default(0),
    latencyMs: integer("latencyMs"),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("userAgent"),
    requestMeta: json("requestMeta").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("public_api_audit_log_tenant_created_idx").on(
      t.tenantId,
      t.createdAt
    ),
    index("public_api_audit_log_api_key_idx").on(t.apiKeyId),
    index("public_api_audit_log_trace_idx").on(t.traceId),
  ]
);

export type PublicApiAuditLogEntry = typeof publicApiAuditLog.$inferSelect;
export type InsertPublicApiAuditLogEntry =
  typeof publicApiAuditLog.$inferInsert;

/**
 * API Webhook Endpoints — outbound webhook registrations.
 */
export const apiWebhookEndpoints = pgTable(
  "api_webhook_endpoints",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    apiKeyId: varchar("apiKeyId", { length: 36 }).references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    url: varchar("url", { length: 2048 }).notNull(),
    secretEncrypted: text("secretEncrypted").notNull(),
    events: json("events").$type<string[]>().notNull(),
    retryPolicy: varchar("retryPolicy", { length: 20 })
      .default("exponential")
      .notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    lastDeliveredAt: timestamp("lastDeliveredAt", { withTimezone: true }),
    failureCount: integer("failureCount").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("api_webhook_endpoints_tenant_idx").on(t.tenantId),
    index("api_webhook_endpoints_api_key_idx").on(t.apiKeyId),
  ]
);

export type ApiWebhookEndpoint = typeof apiWebhookEndpoints.$inferSelect;
export type InsertApiWebhookEndpoint = typeof apiWebhookEndpoints.$inferInsert;

/**
 * API Webhook Deliveries — delivery log with retry tracking.
 */
export const apiWebhookDeliveries = pgTable("api_webhook_deliveries", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  webhookEndpointId: varchar("webhookEndpointId", { length: 36 })
    .notNull()
    .references(() => apiWebhookEndpoints.id, { onDelete: "cascade" }),
  eventType: varchar("eventType", { length: 50 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  statusCode: integer("statusCode"),
  attempt: integer("attempt").default(1).notNull(),
  deliveredAt: timestamp("deliveredAt", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ApiWebhookDelivery = typeof apiWebhookDeliveries.$inferSelect;
export type InsertApiWebhookDelivery = typeof apiWebhookDeliveries.$inferInsert;

/**
 * Automation Jobs — async job queue records for the Job Automation API.
 */
export const automationJobs = pgTable(
  "automation_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    apiKeyId: varchar("apiKeyId", { length: 36 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    params: json("params").$type<Record<string, unknown>>(),
    result: json("result").$type<Record<string, unknown>>(),
    error: json("error").$type<Record<string, unknown>>(),
    progress: integer("progress").default(0).notNull(),
    creditsReserved: integer("creditsReserved").default(0).notNull(),
    creditsUsed: integer("creditsUsed").default(0).notNull(),
    callbackUrl: varchar("callbackUrl", { length: 2048 }),
    callbackSecretEncrypted: text("callbackSecretEncrypted"),
    parentJobId: varchar("parentJobId", { length: 36 }),
    stepIndex: integer("stepIndex"),
    traceId: varchar("traceId", { length: 36 }),
    idempotencyKey: varchar("idempotencyKey", { length: 64 }),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
  },
  t => [
    index("automation_jobs_tenant_status_idx").on(t.tenantId, t.status),
    index("automation_jobs_api_key_idx").on(t.apiKeyId),
    uniqueIndex("automation_jobs_idempotency_idx").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("automation_jobs_parent_idx").on(t.parentJobId),
  ]
);

export type AutomationJob = typeof automationJobs.$inferSelect;
export type InsertAutomationJob = typeof automationJobs.$inferInsert;

// =============================================================================
// Feature 044: Multimodal Chat Memory
// =============================================================================

/**
 * pgvector custom column type for 768-dimension embeddings (Gemini text-embedding-004).
 */
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    return typeof value === "string" ? JSON.parse(value) : (value as number[]);
  },
});

/**
 * media_assets — canonical registry for all uploaded images (and other media) tied to chat messages.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: varchar("projectId", { length: 100 }),
    conversationId: integer("conversationId").references(
      () => conversations.id,
      { onDelete: "set null" }
    ),
    messageId: integer("messageId").references(() => messages.id, {
      onDelete: "set null",
    }),
    sourceType: varchar("sourceType", { length: 32 }).default(
      "chat_attachment"
    ),
    status: varchar("status", { length: 32 }).default("pending"),
    storageKey: text("storageKey").notNull(),
    originalUrl: text("originalUrl"),
    thumbnailUrl: text("thumbnailUrl"),
    mimeType: varchar("mimeType", { length: 100 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    fileSize: bigint("fileSize", { mode: "number" }),
    checksumSha256: varchar("checksumSha256", { length: 64 }),
    perceptualHash: varchar("perceptualHash", { length: 128 }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  t => [
    index("media_assets_user_idx").on(t.userId),
    index("media_assets_conversation_idx").on(t.conversationId),
    index("media_assets_tenant_project_idx").on(t.tenantId, t.projectId),
    index("media_assets_tenant_user_idx").on(t.tenantId, t.userId),
    index("media_assets_checksum_idx").on(t.checksumSha256),
  ]
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type InsertMediaAsset = typeof mediaAssets.$inferInsert;

/**
 * media_provider_assets — reusable provider-side assets such as Gemini Omni
 * character IDs and audio IDs. These IDs are not media task IDs.
 */
export const mediaProviderAssets = pgTable(
  "media_provider_assets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    capability: varchar("capability", { length: 80 }).notNull(),
    assetType: varchar("assetType", { length: 40 }).notNull(),
    providerAssetId: varchar("providerAssetId", { length: 256 }).notNull(),
    displayName: varchar("displayName", { length: 256 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    clientRequestId: varchar("clientRequestId", { length: 128 }),
    sourceMediaAssetId: bigint("sourceMediaAssetId", {
      mode: "number",
    }).references(() => mediaAssets.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
    assetSnapshot: jsonb("assetSnapshot")
      .$type<Record<string, any>>()
      .default({}),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
    deletedAt: timestamp("deletedAt", { withTimezone: true }),
    purgeAfter: timestamp("purgeAfter", { withTimezone: true }),
    reconciliationStatus: varchar("reconciliationStatus", { length: 32 }),
    reconciliationReason: varchar("reconciliationReason", { length: 128 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("media_provider_assets_tenant_user_idx").on(t.tenantId, t.userId),
    index("media_provider_assets_capability_status_idx").on(
      t.capability,
      t.status
    ),
    index("media_provider_assets_provider_asset_idx").on(
      t.provider,
      t.providerAssetId
    ),
    uniqueIndex("media_provider_assets_provider_unique").on(
      t.tenantId,
      t.provider,
      t.capability,
      t.providerAssetId
    ),
    uniqueIndex("media_provider_assets_request_unique").on(
      t.tenantId,
      t.provider,
      t.capability,
      t.clientRequestId
    ),
  ]
);

export type MediaProviderAsset = typeof mediaProviderAssets.$inferSelect;
export type InsertMediaProviderAsset = typeof mediaProviderAssets.$inferInsert;

/**
 * media_asset_analysis — vision enrichment results from Gemini Flash structured output.
 */
export const mediaAssetAnalysis = pgTable(
  "media_asset_analysis",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    mediaAssetId: bigint("mediaAssetId", { mode: "number" })
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }),
    model: varchar("model", { length: 128 }),
    shortCaption: text("shortCaption"),
    detailedCaption: text("detailedCaption"),
    ocrText: text("ocrText"),
    objects: jsonb("objects"),
    styles: jsonb("styles"),
    materials: jsonb("materials"),
    colors: jsonb("colors"),
    rooms: jsonb("rooms"),
    architectureTags: jsonb("architectureTags"),
    aestheticScore: numeric("aestheticScore", { precision: 4, scale: 3 }),
    safetyLabels: jsonb("safetyLabels"),
    extractedJson: jsonb("extractedJson"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  },
  t => [index("media_asset_analysis_asset_idx").on(t.mediaAssetId)]
);

export type MediaAssetAnalysis = typeof mediaAssetAnalysis.$inferSelect;
export type InsertMediaAssetAnalysis = typeof mediaAssetAnalysis.$inferInsert;

/**
 * multimodal_memory_items — retrievable memory entries bridging images and text.
 */
export const multimodalMemoryItems = pgTable(
  "multimodal_memory_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: varchar("projectId", { length: 100 }),
    conversationId: integer("conversationId").references(
      () => conversations.id,
      { onDelete: "set null" }
    ),
    messageId: integer("messageId"),
    mediaAssetId: bigint("mediaAssetId", { mode: "number" }).references(
      () => mediaAssets.id,
      { onDelete: "cascade" }
    ),
    memoryKind: varchar("memoryKind", { length: 32 }),
    title: text("title"),
    summary: text("summary"),
    searchableText: text("searchableText").notNull(),
    sourceRole: varchar("sourceRole", { length: 16 }),
    salience: numeric("salience").default("0.500"),
    confidence: numeric("confidence").default("0.800"),
    lastAccessedAt: timestamp("lastAccessedAt", { withTimezone: true }),
    accessCount: integer("accessCount").default(0),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  t => [
    index("multimodal_memory_items_user_project_idx").on(t.userId, t.projectId),
    index("multimodal_memory_items_conversation_idx").on(t.conversationId),
    index("multimodal_memory_items_asset_idx").on(t.mediaAssetId),
  ]
);

export type MultimodalMemoryItem = typeof multimodalMemoryItems.$inferSelect;
export type InsertMultimodalMemoryItem =
  typeof multimodalMemoryItems.$inferInsert;

/**
 * multimodal_memory_vectors — pgvector embeddings for multimodal retrieval.
 * HNSW index on embedding: CREATE INDEX CONCURRENTLY after backfill
 * CREATE INDEX multimodal_memory_vectors_embedding_idx
 *   ON multimodal_memory_vectors USING hnsw (embedding vector_cosine_ops)
 *   WITH (m = 16, ef_construction = 128);
 */
export const multimodalMemoryVectors = pgTable(
  "multimodal_memory_vectors",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    memoryItemId: bigint("memoryItemId", { mode: "number" })
      .notNull()
      .references(() => multimodalMemoryItems.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    model: varchar("model", { length: 128 }),
    modality: varchar("modality", { length: 16 }),
    embedding: vector("embedding").notNull(),
    embeddingVersion: varchar("embeddingVersion", { length: 32 }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  },
  t => [index("multimodal_memory_vectors_item_idx").on(t.memoryItemId)]
);

export type MultimodalMemoryVector =
  typeof multimodalMemoryVectors.$inferSelect;
export type InsertMultimodalMemoryVector =
  typeof multimodalMemoryVectors.$inferInsert;

/**
 * conversation_visual_state — per-conversation working set tracking which images are active/recent.
 */
export const conversationVisualState = pgTable("conversation_visual_state", {
  conversationId: integer("conversationId")
    .primaryKey()
    .references(() => conversations.id, { onDelete: "cascade" }),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  recentAssetIds: jsonb("recentAssetIds").default([]),
  activeAssetIds: jsonb("activeAssetIds").default([]),
  comparedAssetIds: jsonb("comparedAssetIds").default([]),
  namedSets: jsonb("namedSets").default({}),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});

export type ConversationVisualState =
  typeof conversationVisualState.$inferSelect;
export type InsertConversationVisualState =
  typeof conversationVisualState.$inferInsert;

/**
 * multimodal_memory_links — directed relationships between memory items.
 */
export const multimodalMemoryLinks = pgTable(
  "multimodal_memory_links",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fromMemoryItemId: bigint("fromMemoryItemId", { mode: "number" })
      .notNull()
      .references(() => multimodalMemoryItems.id, { onDelete: "cascade" }),
    toMemoryItemId: bigint("toMemoryItemId", { mode: "number" })
      .notNull()
      .references(() => multimodalMemoryItems.id, { onDelete: "cascade" }),
    relationType: varchar("relationType", { length: 32 }),
    weight: numeric("weight").default("1.000"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  },
  t => [
    index("multimodal_memory_links_from_idx").on(t.fromMemoryItemId),
    index("multimodal_memory_links_to_idx").on(t.toMemoryItemId),
    uniqueIndex("multimodal_memory_links_unique_idx").on(
      t.fromMemoryItemId,
      t.toMemoryItemId,
      t.relationType
    ),
  ]
);

export type MultimodalMemoryLink = typeof multimodalMemoryLinks.$inferSelect;
export type InsertMultimodalMemoryLink =
  typeof multimodalMemoryLinks.$inferInsert;

// ==========================================
// Virtual AI Office Orchestrator — Core Identity
// ==========================================

export const orchestratorViewModeEnum = pgEnum("orchestrator_view_mode", [
  "transparent",
  "milestone",
  "summary",
]);
export const orchestratorAutonomyLevelEnum = pgEnum(
  "orchestrator_autonomy_level",
  ["manual", "guided", "autonomous"]
);
export const assistantTeamStatusEnum = pgEnum("assistant_team_status", [
  "active",
  "archived",
  "draft",
]);
export const modelSelectionPolicyEnum = pgEnum("model_selection_policy", [
  "fixed",
  "cost_optimized",
  "quality_optimized",
  "auto",
]);

/**
 * user_orchestrator_profiles — per-user orchestration preferences.
 * One row per user storing view mode, autonomy level, and approval policies.
 */
export const userOrchestratorProfiles = pgTable(
  "user_orchestrator_profiles",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    defaultPersonaId: varchar("defaultPersonaId", { length: 36 }).references(
      () => personaTemplates.id,
      { onDelete: "set null" }
    ),
    orchestratorDisplayName: varchar("orchestratorDisplayName", {
      length: 255,
    }),
    preferredViewMode:
      orchestratorViewModeEnum("preferredViewMode").default("transparent"),
    preferredAutonomyLevel: orchestratorAutonomyLevelEnum(
      "preferredAutonomyLevel"
    ).default("guided"),
    preferredSummaryStyle: varchar("preferredSummaryStyle", { length: 50 }),
    defaultApprovalPolicy: jsonb("defaultApprovalPolicy"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [uniqueIndex("user_orchestrator_profiles_user_idx").on(t.userId)]
);

export type UserOrchestratorProfile =
  typeof userOrchestratorProfiles.$inferSelect;
export type InsertUserOrchestratorProfile =
  typeof userOrchestratorProfiles.$inferInsert;

/**
 * assistant_teams — product-facing team definition.
 * Each team wraps exactly one agency and provides orchestration-level config.
 */
export const assistantTeams = pgTable(
  "assistant_teams",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: integer("ownerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agencyId: varchar("agencyId", { length: 36 })
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    teamPersonaOverlay: jsonb("teamPersonaOverlay"),
    defaultViewMode:
      orchestratorViewModeEnum("defaultViewMode").default("transparent"),
    defaultSummaryMode: varchar("defaultSummaryMode", { length: 50 }),
    defaultAutonomyLevel: orchestratorAutonomyLevelEnum(
      "defaultAutonomyLevel"
    ).default("guided"),
    defaultModelId: varchar("defaultModelId", { length: 100 }),
    modelBudgetPolicy: jsonb("modelBudgetPolicy"),
    memoryPolicyJson: jsonb("memoryPolicyJson"),
    artifactPolicyJson: jsonb("artifactPolicyJson"),
    status: assistantTeamStatusEnum("status").default("active"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("assistant_teams_tenant_idx").on(t.tenantId),
    index("assistant_teams_owner_idx").on(t.ownerUserId),
    index("assistant_teams_agency_idx").on(t.agencyId),
  ]
);

export type AssistantTeam = typeof assistantTeams.$inferSelect;
export type InsertAssistantTeam = typeof assistantTeams.$inferInsert;

export const teamMemberKindEnum = pgEnum("team_member_kind", [
  "assistant",
  "human",
  "external_connector",
]);

export const teamMemberRoleEnum = pgEnum("team_member_role", [
  "orchestrator",
  "researcher",
  "reviewer",
  "publisher",
  "specialist",
]);

export const workerRuntimeTypeEnum = pgEnum("worker_runtime_type", [
  "openclaw_gateway",
  "desktop_zeroclaw_managed",
  "nemoclaw_sandbox",
  "hiclaw_cluster",
  "hermes_agent_gateway",
]);

export const workerStatusEnum = pgEnum("worker_status", [
  "online",
  "offline",
  "unhealthy",
  "disabled",
  "draining",
]);

export const workerJobStatusEnum = pgEnum("worker_job_status", [
  "queued",
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
  "completed",
  "failed",
  "canceled",
  "expired",
]);

export const workerModeEnum = pgEnum("worker_mode", [
  "per_user",
  "shared_department",
  "dedicated_gpu",
  "external_runtime",
]);

export const workerRuntimeModeEnum = pgEnum("worker_runtime_mode", [
  "native_constrained",
  "wsl2_managed",
  "docker_isolated",
  "external_managed",
]);

export const workerFileScopeModeEnum = pgEnum("worker_file_scope_mode", [
  "workspace_scoped",
  "team_drive",
  "full_machine",
]);

export const workerResourceProfileEnum = pgEnum("worker_resource_profile", [
  "cpu_light",
  "cpu_heavy",
  "gpu_required",
  "large_disk_temp",
  "network_heavy",
  "long_running",
  "sandbox_required",
  "human_observable",
]);

export const workerPolicies = pgTable(
  "worker_policies",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    runtimeType: workerRuntimeTypeEnum("runtimeType").notNull(),
    rulesJson: jsonb("rulesJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("worker_policies_tenant_name_unique").on(t.tenantId, t.name),
    index("worker_policies_runtime_type_idx").on(t.tenantId, t.runtimeType),
  ]
);

export type WorkerPolicy = typeof workerPolicies.$inferSelect;
export type InsertWorkerPolicy = typeof workerPolicies.$inferInsert;

export const runtimeProfiles = pgTable(
  "runtime_profiles",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runtimeType: workerRuntimeTypeEnum("runtimeType").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    profileJson: jsonb("profileJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("runtime_profiles_runtime_type_name_unique").on(
      t.runtimeType,
      t.name
    ),
  ]
);

export type RuntimeProfile = typeof runtimeProfiles.$inferSelect;
export type InsertRuntimeProfile = typeof runtimeProfiles.$inferInsert;

export const workers = pgTable(
  "workers",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "set null" }
    ),
    runtimeType: workerRuntimeTypeEnum("runtimeType").notNull(),
    workerMode: workerModeEnum("workerMode")
      .notNull()
      .default("external_runtime"),
    machineId: varchar("machineId", { length: 255 }),
    machineName: varchar("machineName", { length: 255 }),
    displayName: varchar("displayName", { length: 255 }).notNull(),
    status: workerStatusEnum("status").notNull().default("offline"),
    runtimeVersion: varchar("runtimeVersion", { length: 100 }).notNull(),
    runtimeMode: workerRuntimeModeEnum("runtimeMode")
      .notNull()
      .default("external_managed"),
    runtimeProfileId: varchar("runtimeProfileId", { length: 36 }).references(
      () => runtimeProfiles.id,
      { onDelete: "set null" }
    ),
    policyProfileId: varchar("policyProfileId", { length: 36 }).references(
      () => workerPolicies.id,
      { onDelete: "set null" }
    ),
    externalReference: varchar("externalReference", { length: 255 }).notNull(),
    dashboardUrl: text("dashboardUrl"),
    capabilitiesJson: jsonb("capabilitiesJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    hardwareJson: jsonb("hardwareJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    healthSummaryJson: jsonb("healthSummaryJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    warningFlagsJson: jsonb("warningFlagsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    fileScopeMode: workerFileScopeModeEnum("fileScopeMode")
      .notNull()
      .default("workspace_scoped"),
    lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }),
    registeredByUserId: integer("registeredByUserId").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("workers_tenant_external_reference_unique").on(
      t.tenantId,
      t.externalReference
    ),
    index("workers_tenant_status_idx").on(t.tenantId, t.status),
    index("workers_runtime_type_status_idx").on(t.runtimeType, t.status),
    index("workers_team_status_idx").on(t.teamId, t.status),
  ]
);

export type Worker = typeof workers.$inferSelect;
export type InsertWorker = typeof workers.$inferInsert;

export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workerId: varchar("workerId", { length: 36 })
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    runtimeType: workerRuntimeTypeEnum("runtimeType").notNull(),
    status: workerStatusEnum("status").notNull(),
    metricsJson: jsonb("metricsJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    warningsJson: jsonb("warningsJson").$type<string[]>().notNull().default([]),
    currentJobCount: integer("currentJobCount").notNull().default(0),
    queueDepth: integer("queueDepth").notNull().default(0),
    freeDiskBytes: bigint("freeDiskBytes", { mode: "number" }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("worker_heartbeats_worker_created_idx").on(t.workerId, t.createdAt),
    index("worker_heartbeats_status_created_idx").on(t.status, t.createdAt),
  ]
);

export type WorkerHeartbeat = typeof workerHeartbeats.$inferSelect;
export type InsertWorkerHeartbeat = typeof workerHeartbeats.$inferInsert;

export const workerJobs = pgTable(
  "worker_jobs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "set null" }
    ),
    workerId: varchar("workerId", { length: 36 }).references(() => workers.id, {
      onDelete: "set null",
    }),
    runtimeType: workerRuntimeTypeEnum("runtimeType").notNull(),
    workflowRunId: varchar("workflowRunId", { length: 36 }),
    requestedByUserId: integer("requestedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    requestedByPersonaId: varchar("requestedByPersonaId", { length: 36 }),
    requestedBySystemComponent: varchar("requestedBySystemComponent", {
      length: 100,
    }),
    jobType: varchar("jobType", { length: 100 }).notNull(),
    status: workerJobStatusEnum("status").notNull().default("queued"),
    statusReason: text("statusReason"),
    priority: integer("priority").notNull().default(0),
    resourceProfile: workerResourceProfileEnum("resourceProfile")
      .notNull()
      .default("cpu_light"),
    capabilityRequirementsJson: jsonb("capabilityRequirementsJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    inputJson: jsonb("inputJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    instructionsJson: jsonb("instructionsJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    outputJson: jsonb("outputJson").$type<Record<string, unknown>>(),
    failureReason: text("failureReason"),
    timeoutSeconds: integer("timeoutSeconds").notNull().default(3600),
    retryPolicyJson: jsonb("retryPolicyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }),
    leaseOwnerToken: varchar("leaseOwnerToken", { length: 128 }),
    leaseExpiresAt: timestamp("leaseExpiresAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    finishedAt: timestamp("finishedAt", { withTimezone: true }),
  },
  t => [
    uniqueIndex("worker_jobs_tenant_idempotency_key_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("worker_jobs_tenant_status_priority_idx").on(
      t.tenantId,
      t.status,
      t.priority
    ),
    index("worker_jobs_worker_status_idx").on(t.workerId, t.status),
    index("worker_jobs_lease_expires_idx").on(t.leaseExpiresAt),
  ]
);

export type WorkerJob = typeof workerJobs.$inferSelect;
export type InsertWorkerJob = typeof workerJobs.$inferInsert;

/**
 * Feature 135 — Hermes Grok media worker connections (spec §10.1, §12.2).
 * Records connection identity, scope, status, worker assignment, capability
 * manifest, defaults, and quota metadata. NEVER stores a token or secret —
 * tokens live only inside the Hermes CLI profile on the worker host.
 */
export const hermesConnectionScopeEnum = pgEnum("hermes_connection_scope", [
  "server_shared",
  "server_personal",
  "private_worker",
]);
export const hermesConnectionStatusEnum = pgEnum("hermes_connection_status", [
  "pending",
  "authorized",
  "reauth_required",
  "entitlement_restricted",
  "disconnected",
  "error",
]);

export const hermesProviderConnections = pgTable(
  "hermes_provider_connections",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: integer("ownerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: hermesConnectionScopeEnum("scope").notNull(),
    providerType: varchar("providerType", { length: 64 })
      .notNull()
      .default("xai_grok"),
    adapterType: varchar("adapterType", { length: 64 })
      .notNull()
      .default("hermes_cli"),
    authenticationType: varchar("authenticationType", { length: 64 })
      .notNull()
      .default("oauth_device_code"),
    status: hermesConnectionStatusEnum("status").notNull().default("pending"),
    assignedWorkerId: varchar("assignedWorkerId", { length: 36 }).references(
      () => workers.id,
      { onDelete: "set null" }
    ),
    profileReference: varchar("profileReference", { length: 255 }).notNull(),
    accountLabel: varchar("accountLabel", { length: 120 }),
    accountHint: varchar("accountHint", { length: 120 }),
    entitlementStatus: varchar("entitlementStatus", { length: 64 }),
    capabilitiesJson: jsonb("capabilitiesJson").$type<HermesConnectionCapabilityManifest>(),
    defaultForImage: boolean("defaultForImage").notNull().default(false),
    defaultForVideo: boolean("defaultForVideo").notNull().default(false),
    dailyJobQuota: integer("dailyJobQuota"),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    authorizedAt: timestamp("authorizedAt", { withTimezone: true }),
    lastProbeAt: timestamp("lastProbeAt", { withTimezone: true }),
    disconnectedAt: timestamp("disconnectedAt", { withTimezone: true }),
  },
  t => [
    index("hermes_provider_connections_tenant_owner_status_idx").on(
      t.tenantId,
      t.ownerUserId,
      t.status
    ),
    index("hermes_provider_connections_tenant_scope_status_idx").on(
      t.tenantId,
      t.scope,
      t.status
    ),
    uniqueIndex("hermes_provider_connections_default_image_unique")
      .on(t.tenantId, t.ownerUserId)
      .where(
        sql`"defaultForImage" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted')`
      ),
    uniqueIndex("hermes_provider_connections_default_video_unique")
      .on(t.tenantId, t.ownerUserId)
      .where(
        sql`"defaultForVideo" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted')`
      ),
  ]
);

export type HermesProviderConnection = typeof hermesProviderConnections.$inferSelect;
export type InsertHermesProviderConnection = typeof hermesProviderConnections.$inferInsert;

export const workerJobEvents = pgTable(
  "worker_job_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workerJobId: varchar("workerJobId", { length: 36 })
      .notNull()
      .references(() => workerJobs.id, { onDelete: "cascade" }),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("worker_job_events_job_created_idx").on(t.workerJobId, t.createdAt),
    index("worker_job_events_type_created_idx").on(t.eventType, t.createdAt),
  ]
);

export type WorkerJobEvent = typeof workerJobEvents.$inferSelect;
export type InsertWorkerJobEvent = typeof workerJobEvents.$inferInsert;

export const workerArtifacts = pgTable(
  "worker_artifacts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workerJobId: varchar("workerJobId", { length: 36 })
      .notNull()
      .references(() => workerJobs.id, { onDelete: "cascade" }),
    artifactType: varchar("artifactType", { length: 100 }).notNull(),
    storageRef: varchar("storageRef", { length: 512 }).notNull(),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    publishedItemId: integer("publishedItemId").references(
      () => libraryItems.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("worker_artifacts_job_storage_ref_unique").on(
      t.workerJobId,
      t.storageRef
    ),
    index("worker_artifacts_job_type_idx").on(t.workerJobId, t.artifactType),
    index("worker_artifacts_published_item_idx").on(t.publishedItemId),
  ]
);

export type WorkerArtifact = typeof workerArtifacts.$inferSelect;
export type InsertWorkerArtifact = typeof workerArtifacts.$inferInsert;

export const workerDelegatedSessions = pgTable(
  "worker_delegated_sessions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "set null" }
    ),
    workerId: varchar("workerId", { length: 36 })
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    workerJobId: varchar("workerJobId", { length: 36 })
      .notNull()
      .references(() => workerJobs.id, { onDelete: "cascade" }),
    actingUserId: integer("actingUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ownerUserId: integer("ownerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runtimeType: workerRuntimeTypeEnum("runtimeType").notNull(),
    scopeProfile: varchar("scopeProfile", { length: 100 }).notNull(),
    grantedScopesJson: jsonb("grantedScopesJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    manifestJson: jsonb("manifestJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    leaseOwnerToken: varchar("leaseOwnerToken", { length: 128 }).notNull(),
    tokenJti: varchar("tokenJti", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("worker_delegated_sessions_token_jti_unique").on(t.tokenJti),
    index("worker_delegated_sessions_job_idx").on(t.workerJobId, t.expiresAt),
    index("worker_delegated_sessions_worker_idx").on(t.workerId, t.expiresAt),
    index("worker_delegated_sessions_owner_idx").on(t.ownerUserId, t.expiresAt),
  ]
);

export type WorkerDelegatedSession =
  typeof workerDelegatedSessions.$inferSelect;
export type InsertWorkerDelegatedSession =
  typeof workerDelegatedSessions.$inferInsert;

export const workerJobGrants = pgTable(
  "worker_job_grants",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workerJobId: varchar("workerJobId", { length: 36 })
      .notNull()
      .references(() => workerJobs.id, { onDelete: "cascade" }),
    delegatedSessionId: varchar("delegatedSessionId", {
      length: 36,
    }).references(() => workerDelegatedSessions.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    grantType: varchar("grantType", { length: 64 }).notNull(),
    resourceId: varchar("resourceId", { length: 255 }),
    resourceScopeJson: jsonb("resourceScopeJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("worker_job_grants_job_type_idx").on(t.workerJobId, t.grantType),
    index("worker_job_grants_session_type_idx").on(
      t.delegatedSessionId,
      t.grantType
    ),
    index("worker_job_grants_resource_idx").on(t.grantType, t.resourceId),
  ]
);

export type WorkerJobGrant = typeof workerJobGrants.$inferSelect;
export type InsertWorkerJobGrant = typeof workerJobGrants.$inferInsert;

/**
 * assistant_profiles — per-member assistant identity.
 * Wraps one agency_agent + one persona_template, providing orchestration persona.
 *
 * NOTE: The partial unique index for isLead (one lead per team) must be applied
 * via raw SQL migration since Drizzle doesn't support partial unique indexes.
 */
export const assistantProfiles = pgTable(
  "assistant_profiles",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 })
      .notNull()
      .references(() => assistantTeams.id, { onDelete: "cascade" }),
    memberKind: teamMemberKindEnum("memberKind").notNull().default("assistant"),
    agencyAgentId: varchar("agencyAgentId", { length: 36 }).references(
      () => agencyAgents.id,
      { onDelete: "cascade" }
    ),
    personaId: varchar("personaId", { length: 36 }).references(
      () => personaTemplates.id,
      { onDelete: "set null" }
    ),
    humanUserId: integer("humanUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    externalRef: varchar("externalRef", { length: 255 }),
    externalWorkerId: varchar("externalWorkerId", { length: 36 }).references(
      () => workers.id,
      { onDelete: "set null" }
    ),
    externalConfigJson: jsonb("externalConfigJson"),
    displayName: varchar("displayName", { length: 255 }),
    nickname: varchar("nickname", { length: 100 }),
    roleTitle: varchar("roleTitle", { length: 100 }),
    memberRole: teamMemberRoleEnum("memberRole")
      .default("specialist")
      .notNull(),
    genderStyle: varchar("genderStyle", { length: 20 }),
    specialtyTags: text("specialtyTags").array(),
    preferredModelId: varchar("preferredModelId", { length: 100 }),
    modelSelectionPolicy: modelSelectionPolicyEnum(
      "modelSelectionPolicy"
    ).default("auto"),
    toolPolicyJson: jsonb("toolPolicyJson"),
    approvalPolicyJson: jsonb("approvalPolicyJson"),
    memoryPolicyJson: jsonb("memoryPolicyJson"),
    visibilityPolicyJson: jsonb("visibilityPolicyJson"),
    preferredLanguage: varchar("preferredLanguage", { length: 10 }),
    sortOrder: integer("sortOrder").default(0).notNull(),
    isLead: boolean("isLead").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("assistant_profiles_team_idx").on(t.teamId),
    index("assistant_profiles_agent_idx").on(t.agencyAgentId),
    index("assistant_profiles_persona_idx").on(t.personaId),
    index("assistant_profiles_member_kind_idx").on(t.teamId, t.memberKind),
    index("assistant_profiles_member_role_idx").on(t.teamId, t.memberRole),
    index("assistant_profiles_human_user_idx").on(t.humanUserId),
    index("assistant_profiles_external_worker_idx").on(t.externalWorkerId),
  ]
);

export type AssistantProfile = typeof assistantProfiles.$inferSelect;
export type InsertAssistantProfile = typeof assistantProfiles.$inferInsert;

/**
 * assistant_team_templates — reusable team presets.
 * tenantId=null + isSystem=true means platform-wide template.
 */
export const assistantTeamTemplates = pgTable(
  "assistant_team_templates",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    teamConfigJson: jsonb("teamConfigJson"),
    memberTemplateJson: jsonb("memberTemplateJson"),
    defaultDiscussionMode: varchar("defaultDiscussionMode", { length: 50 }),
    isSystem: boolean("isSystem").default(false).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("assistant_team_templates_tenant_idx").on(t.tenantId)]
);

export type AssistantTeamTemplate = typeof assistantTeamTemplates.$inferSelect;
export type InsertAssistantTeamTemplate =
  typeof assistantTeamTemplates.$inferInsert;

// ─── Virtual Admin (System Guardian) ────────────────────────────────────────

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "info",
  "warning",
  "error",
  "critical",
]);
export const incidentStatusEnum = pgEnum("incident_status", [
  "open",
  "acknowledged",
  "resolved",
  "expired",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
  "execution_failed",
]);
export const ticketTypeEnum = pgEnum("ticket_type", [
  "bug",
  "feature_request",
  "observation",
  "question",
]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "new",
  "triaged",
  "in_progress",
  "deferred",
  "resolved",
  "duplicate",
  "closed",
]);
export const ticketResolutionEnum = pgEnum("ticket_resolution", [
  "fixed",
  "wont_fix",
  "duplicate",
  "cannot_reproduce",
  "planned",
  "by_design",
]);

export const virtualAdminIncidents = pgTable(
  "virtual_admin_incidents",
  {
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
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("va_incidents_tenant_idx").on(t.tenantId),
    index("va_incidents_status_idx").on(t.status),
    index("va_incidents_severity_idx").on(t.severity),
    index("va_incidents_sensor_idx").on(t.sensorId),
  ]
);

export type VirtualAdminIncident = typeof virtualAdminIncidents.$inferSelect;
export type InsertVirtualAdminIncident =
  typeof virtualAdminIncidents.$inferInsert;

export const virtualAdminApprovals = pgTable("virtual_admin_approvals", {
  id: serial("id").primaryKey(),
  incidentId: integer("incidentId")
    .notNull()
    .references(() => virtualAdminIncidents.id),
  actionType: varchar("actionType", { length: 64 }).notNull(),
  actionParamsJson: json("actionParamsJson"),
  status: approvalStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requestedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  decidedAt: timestamp("decidedAt", { withTimezone: true }),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  decidedBy: integer("decidedBy").references(() => users.id),
  decisionComment: text("decisionComment"),
});

export type VirtualAdminApproval = typeof virtualAdminApprovals.$inferSelect;
export type InsertVirtualAdminApproval =
  typeof virtualAdminApprovals.$inferInsert;

export const virtualAdminSensorConfig = pgTable("virtual_admin_sensor_config", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id),
  sensorId: varchar("sensorId", { length: 64 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  intervalMs: integer("intervalMs"),
  thresholdsJson: json("thresholdsJson"),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type VirtualAdminSensorConfig =
  typeof virtualAdminSensorConfig.$inferSelect;

export const feedbackTickets = pgTable(
  "feedback_tickets",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),
    submittedBy: integer("submittedBy").references(() => users.id),
    submittedByType: varchar("submittedByType", { length: 16 }).notNull(),
    ticketType: ticketTypeEnum("ticketType").notNull(),
    priority: reminderPriorityEnum("priority").default("normal").notNull(),
    severity: varchar("severity", { length: 16 }),
    category: varchar("category", { length: 64 }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    stepsToReproduce: text("stepsToReproduce"),
    expectedBehavior: text("expectedBehavior"),
    actualBehavior: text("actualBehavior"),
    contextJson: json("contextJson"),
    autoCategory: varchar("autoCategory", { length: 64 }),
    autoPriority: varchar("autoPriority", { length: 16 }),
    autoSummary: text("autoSummary"),
    duplicateOf: integer("duplicateOf").references(
      (): AnyPgColumn => feedbackTickets.id
    ),
    relatedIncidentId: integer("relatedIncidentId").references(
      () => virtualAdminIncidents.id
    ),
    status: ticketStatusEnum("status").default("new").notNull(),
    assignedTo: integer("assignedTo").references(() => users.id),
    adminResponse: text("adminResponse"),
    resolutionNotes: text("resolutionNotes"),
    resolutionType: ticketResolutionEnum("resolutionType"),
    plannedVersion: varchar("plannedVersion", { length: 32 }),
    planningDocUrl: varchar("planningDocUrl", { length: 500 }),
    devBranch: varchar("devBranch", { length: 100 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    triagedAt: timestamp("triagedAt", { withTimezone: true }),
    respondedAt: timestamp("respondedAt", { withTimezone: true }),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
    closedAt: timestamp("closedAt", { withTimezone: true }),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("ft_tenant_status_idx").on(t.tenantId, t.status),
    index("ft_submitted_by_idx").on(t.submittedBy),
  ]
);

export type FeedbackTicket = typeof feedbackTickets.$inferSelect;
export type InsertFeedbackTicket = typeof feedbackTickets.$inferInsert;

export const feedbackTicketComments = pgTable("feedback_ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticketId")
    .notNull()
    .references(() => feedbackTickets.id, { onDelete: "cascade" }),
  authorId: integer("authorId").references(() => users.id),
  authorType: varchar("authorType", { length: 16 }).notNull(),
  content: text("content").notNull(),
  isInternal: boolean("isInternal").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type FeedbackTicketComment = typeof feedbackTicketComments.$inferSelect;

export const feedbackTicketAttachments = pgTable(
  "feedback_ticket_attachments",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticketId")
      .notNull()
      .references(() => feedbackTickets.id, { onDelete: "cascade" }),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    fileUrl: varchar("fileUrl", { length: 500 }).notNull(),
    fileSize: integer("fileSize"),
    mimeType: varchar("mimeType", { length: 100 }),
    uploadedBy: integer("uploadedBy").references(() => users.id),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);

export type FeedbackTicketAttachment =
  typeof feedbackTicketAttachments.$inferSelect;

// ==========================================
// Virtual AI Office Orchestrator — Rooms, Runs, Monitoring (Section 02)
// ==========================================

export const teamRoomTypeEnum = pgEnum("team_room_type", [
  "direct",
  "team",
  "auto_team",
  "job_review",
]);
export const teamRoomStatusEnum = pgEnum("team_room_status", [
  "active",
  "archived",
  "paused",
]);
export const roomParticipantTypeEnum = pgEnum("room_participant_type", [
  "user",
  "assistant",
  "observer",
]);
export const roomMessageSenderTypeEnum = pgEnum("room_message_sender_type", [
  "user",
  "assistant",
  "system",
]);
export const roomMessageRecipientTypeEnum = pgEnum(
  "room_message_recipient_type",
  ["all", "assistant", "subgroup", "user"]
);
export const roomMessageTurnTypeEnum = pgEnum("room_message_turn_type", [
  "discussion",
  "handoff",
  "review",
  "decision",
  "execution_update",
  "summary",
]);
export const roomMessageVisibilityEnum = pgEnum("room_message_visibility", [
  "transparent",
  "milestone",
  "summary_only",
  "private_internal",
]);
export const teamRunStatusEnum = pgEnum("team_run_status", [
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "stopped",
]);
export const teamRunExecutionModeEnum = pgEnum("team_run_execution_mode", [
  "team_chat",
  "auto_team",
  "review",
]);
export const workItemStatusEnum = pgEnum("work_item_status", [
  "planned",
  "in_progress",
  "in_review",
  "needs_revision",
  "awaiting_approval",
  "completed",
  "failed",
  "blocked",
  "cancelled",
  "superseded",
]);
export const workItemPriorityEnum = pgEnum("work_item_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);
export const workItemRiskClassEnum = pgEnum("work_item_risk_class", [
  "low",
  "medium",
  "high",
  "critical",
]);
export const workItemApprovalStateEnum = pgEnum("work_item_approval_state", [
  "not_required",
  "pending",
  "approved",
  "rejected",
]);
export const workOsStateEnum = pgEnum("work_os_state", [
  "new",
  "triaged",
  "planned",
  "in_progress",
  "waiting_for_approval",
  "waiting_for_input",
  "blocked",
  "escalated",
  "completed",
  "cancelled",
  "failed",
]);
export const workOsAssignmentTypeEnum = pgEnum("work_os_assignment_type", [
  "human",
  "queue",
  "role",
  "hybrid",
]);
export const workAutomationModeEnum = pgEnum("work_automation_mode", [
  "manual_assist",
  "semi_auto",
  "fully_auto",
]);
export const workAutomationRunStatusEnum = pgEnum(
  "work_automation_run_status",
  [
    "pending",
    "running",
    "waiting_for_input",
    "waiting_for_approval",
    "paused",
    "completed",
    "failed",
    "cancelled",
  ]
);
export const workAutomationStepStatusEnum = pgEnum(
  "work_automation_step_status",
  [
    "planned",
    "running",
    "needs_input",
    "awaiting_approval",
    "blocked",
    "succeeded",
    "failed",
    "skipped",
    "cancelled",
  ]
);
export const workAutomationCheckpointApprovalStateEnum = pgEnum(
  "work_automation_checkpoint_approval_state",
  ["pending", "approved", "rejected", "not_required"]
);
export const workAutomationCheckpointStatusEnum = pgEnum(
  "work_automation_checkpoint_status",
  ["open", "approved", "rejected", "resumed", "cancelled"]
);
export const workAutomationSurfaceEnum = pgEnum("work_automation_surface", [
  "manual",
  "work_os",
  "skill",
  "agency",
  "browser",
  "document_management",
  "media_studio",
  "video_editor",
]);
export const workAutomationRiskTierEnum = pgEnum("work_automation_risk_tier", [
  "low",
  "medium",
  "high",
  "critical",
]);
export const workOsSlaBreachStateEnum = pgEnum("work_os_sla_breach_state", [
  "none",
  "at_risk",
  "breached",
  "resolved",
]);
export const workOsApprovalStatusEnum = pgEnum("work_os_approval_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const workOsExceptionStatusEnum = pgEnum("work_os_exception_status", [
  "open",
  "paused",
  "downgraded",
  "resolved",
]);
export const agentEventCategoryEnum = pgEnum("agent_event_category", [
  "status_change",
  "communication",
  "tool_use",
  "memory_op",
  "artifact_op",
  "handoff",
  "approval",
  "error",
]);
export const notificationSeverityEnum = pgEnum("notification_severity", [
  "info",
  "warning",
  "error",
  "critical",
]);

/**
 * team_rooms — durable room abstraction for team conversations.
 */
export const teamRooms = pgTable(
  "team_rooms",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 })
      .notNull()
      .references(() => assistantTeams.id, { onDelete: "cascade" }),
    orchestratorUserId: integer("orchestratorUserId")
      .notNull()
      .references(() => users.id),
    backingAgencyConversationId: varchar("backingAgencyConversationId", {
      length: 36,
    }).references(() => agencyConversations.id, { onDelete: "set null" }),
    roomType: teamRoomTypeEnum("roomType").notNull(),
    title: varchar("title", { length: 255 }),
    goalPrompt: text("goalPrompt"),
    language: text("language").notNull().default("en"),
    projectId: integer("projectId"),
    viewMode: varchar("viewMode", { length: 30 }).default("transparent"),
    summaryMode: varchar("summaryMode", { length: 30 }),
    autonomyLevel: varchar("autonomyLevel", { length: 30 }),
    status: teamRoomStatusEnum("status").notNull().default("active"),
    lastRunId: varchar("lastRunId", { length: 36 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("team_rooms_tenant_team_idx").on(t.tenantId, t.teamId),
    index("team_rooms_orchestrator_idx").on(t.orchestratorUserId),
  ]
);

export type TeamRoom = typeof teamRooms.$inferSelect;
export type InsertTeamRoom = typeof teamRooms.$inferInsert;

/**
 * team_room_participants — explicit participant roster per room.
 * Partial unique indexes prevent same user/assistant from joining twice.
 */
export const teamRoomParticipants = pgTable(
  "team_room_participants",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    roomId: varchar("roomId", { length: 36 })
      .notNull()
      .references(() => teamRooms.id, { onDelete: "cascade" }),
    participantType: roomParticipantTypeEnum("participantType").notNull(),
    participantUserId: integer("participantUserId").references(() => users.id),
    participantAssistantId: varchar("participantAssistantId", {
      length: 36,
    }).references(() => assistantProfiles.id),
    participantLabel: varchar("participantLabel", { length: 255 }),
    roleInRoom: varchar("roleInRoom", { length: 100 }),
    isMuted: boolean("isMuted").default(false).notNull(),
    canWriteSharedMemory: boolean("canWriteSharedMemory")
      .default(true)
      .notNull(),
    lastViewedAt: timestamp("lastViewedAt", { withTimezone: true }),
    joinedAt: timestamp("joinedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("team_room_participants_room_idx").on(t.roomId)]
);

export type TeamRoomParticipant = typeof teamRoomParticipants.$inferSelect;
export type InsertTeamRoomParticipant =
  typeof teamRoomParticipants.$inferInsert;

/**
 * team_room_messages — multi-party message store.
 * senderAssistantId required when senderType=assistant (enforced at app level).
 */
export const teamRoomMessages = pgTable(
  "team_room_messages",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    roomId: varchar("roomId", { length: 36 })
      .notNull()
      .references(() => teamRooms.id, { onDelete: "cascade" }),
    runId: varchar("runId", { length: 36 }),
    senderType: roomMessageSenderTypeEnum("senderType").notNull(),
    senderUserId: integer("senderUserId").references(() => users.id),
    senderAssistantId: varchar("senderAssistantId", { length: 36 }).references(
      () => assistantProfiles.id
    ),
    recipientType: roomMessageRecipientTypeEnum("recipientType")
      .notNull()
      .default("all"),
    recipientAssistantId: varchar("recipientAssistantId", { length: 36 }),
    recipientGroupJson: jsonb("recipientGroupJson"),
    turnType: roomMessageTurnTypeEnum("turnType")
      .notNull()
      .default("discussion"),
    visibility: roomMessageVisibilityEnum("visibility")
      .notNull()
      .default("transparent"),
    content: text("content").notNull(),
    summaryContent: text("summaryContent"),
    artifactRefsJson: jsonb("artifactRefsJson"),
    memoryRefsJson: jsonb("memoryRefsJson"),
    metadataJson: jsonb("metadataJson").$type<TeamRoomMessageMetadata | null>(),
    tokenUsageJson: jsonb("tokenUsageJson").$type<{
      inputTokens?: number;
      outputTokens?: number;
      model?: string;
    }>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("team_room_messages_room_created_idx").on(t.roomId, t.createdAt),
    index("team_room_messages_run_created_idx").on(t.runId, t.createdAt),
  ]
);

export type TeamRoomMessage = typeof teamRoomMessages.$inferSelect;
export type InsertTeamRoomMessage = typeof teamRoomMessages.$inferInsert;

/**
 * team_runs — one orchestrated work session inside a room.
 */
export interface StopPolicy {
  maxRounds: number;
  maxDurationMinutes: number;
  maxBudgetCredits: number;
  stopOnConsensus: boolean;
  stopOnArtifactReady: boolean;
  stopOnLeadSummary: boolean;
  requireFinalSummary: boolean;
  idleTimeoutSeconds: number;
}

export interface BudgetSnapshot {
  totalCreditsUsed: number;
  toolCallsUsed?: number;
  mediaJobsUsed?: number;
  workflowRunsUsed?: number;
  agencyRunsUsed?: number;
  appliedReservationKeys?: string[];
  runtimePolicyMissingCount?: number;
  perAgent: Record<
    string,
    {
      creditsUsed: number;
      inputTokens: number;
      outputTokens: number;
      turnCount: number;
    }
  >;
}

export const teamRuns = pgTable(
  "team_runs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    roomId: varchar("roomId", { length: 36 })
      .notNull()
      .references(() => teamRooms.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 })
      .notNull()
      .references(() => assistantTeams.id),
    backingAgencyRunId: varchar("backingAgencyRunId", { length: 36 }),
    initiatedByUserId: integer("initiatedByUserId")
      .notNull()
      .references(() => users.id),
    executionMode: teamRunExecutionModeEnum("executionMode").notNull(),
    objective: text("objective"),
    constraintsJson: jsonb("constraintsJson"),
    status: teamRunStatusEnum("status").notNull().default("queued"),
    activeAssistantId: varchar("activeAssistantId", { length: 36 }),
    stopPolicyJson: jsonb("stopPolicyJson").$type<StopPolicy>(),
    approvalPolicyJson: jsonb("approvalPolicyJson"),
    budgetSnapshotJson: jsonb("budgetSnapshotJson").$type<BudgetSnapshot>(),
    summaryArtifactId: varchar("summaryArtifactId", { length: 36 }),
    stopReason: text("stopReason"),
    runtimeEngine: varchar("runtimeEngine", { length: 32 }),
    runtimeMode: varchar("runtimeMode", { length: 32 }),
    runtimeSdkVersion: varchar("runtimeSdkVersion", { length: 32 }),
    runtimeAdapterVersion: varchar("runtimeAdapterVersion", { length: 32 }),
    runtimeTraceId: varchar("runtimeTraceId", { length: 255 }),
    runtimeGatewayRouteId: varchar("runtimeGatewayRouteId", { length: 255 }),
    runtimeFrozenAt: timestamp("runtimeFrozenAt", { withTimezone: true }),
    runtimeTerminalReason: varchar("runtimeTerminalReason", { length: 120 }),
    runtimeCurrentStepKey: varchar("runtimeCurrentStepKey", { length: 180 }),
    runtimeApprovalState: varchar("runtimeApprovalState", { length: 64 }),
    runtimeStateJson:
      jsonb("runtimeStateJson").$type<Record<string, unknown>>(),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    endedAt: timestamp("endedAt", { withTimezone: true }),
  },
  t => [
    index("team_runs_room_status_idx").on(t.roomId, t.status),
    index("team_runs_team_status_idx").on(t.teamId, t.status),
    index("team_runs_initiated_by_idx").on(t.initiatedByUserId),
  ]
);

export type TeamRun = typeof teamRuns.$inferSelect;
export type InsertTeamRun = typeof teamRuns.$inferInsert;

/**
 * agent_runtime_traces — generic redacted runtime archive for Chat, Team, Responses, and shared skill callers.
 */
export const agentRuntimeTraces = pgTable(
  "agent_runtime_traces",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    surface: varchar("surface", { length: 32 }).notNull(),
    roomId: varchar("roomId", { length: 36 }),
    runId: varchar("runId", { length: 36 }),
    messageId: varchar("messageId", { length: 36 }),
    stepKey: varchar("stepKey", { length: 180 }),
    attemptId: varchar("attemptId", { length: 120 }),
    traceId: varchar("traceId", { length: 255 }).notNull(),
    eventId: varchar("eventId", { length: 255 }).notNull(),
    sequence: integer("sequence").notNull(),
    eventName: varchar("eventName", { length: 160 }).notNull(),
    sourceComponent: varchar("sourceComponent", { length: 120 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    summary: text("summary"),
    redactedMetadataJson: jsonb("redactedMetadataJson")
      .notNull()
      .default(sql`'{}'::jsonb`),
    runtimeSdkVersion: varchar("runtimeSdkVersion", { length: 32 }),
    runtimeAdapterVersion: varchar("runtimeAdapterVersion", { length: 32 }),
    modelId: varchar("modelId", { length: 180 }),
    providerId: varchar("providerId", { length: 120 }),
    gatewayRouteId: varchar("gatewayRouteId", { length: 255 }),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("agent_runtime_traces_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    uniqueIndex("agent_runtime_traces_tenant_run_sequence_unique").on(
      t.tenantId,
      t.runId,
      t.sequence
    ),
    index("agent_runtime_traces_tenant_trace_idx").on(t.tenantId, t.traceId),
    index("agent_runtime_traces_tenant_event_idx").on(
      t.tenantId,
      t.eventName,
      t.createdAt
    ),
  ]
);

export type AgentRuntimeTrace = typeof agentRuntimeTraces.$inferSelect;
export type InsertAgentRuntimeTrace = typeof agentRuntimeTraces.$inferInsert;

/**
 * agent_runtime_checkpoints — generic pause/resume snapshots for Chat, Responses, and shared-skill runtime.
 */
export const agentRuntimeCheckpoints = pgTable(
  "agent_runtime_checkpoints",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    surface: varchar("surface", { length: 32 }).notNull(),
    roomId: varchar("roomId", { length: 36 }),
    runId: varchar("runId", { length: 36 }),
    messageId: varchar("messageId", { length: 36 }),
    stepKey: varchar("stepKey", { length: 180 }),
    attemptId: varchar("attemptId", { length: 120 }),
    checkpointId: varchar("checkpointId", { length: 255 }).notNull(),
    checkpointStatus: varchar("checkpointStatus", { length: 32 }).notNull(),
    approvalState: varchar("approvalState", { length: 64 }),
    resumeCursor: text("resumeCursor"),
    snapshotJson: jsonb("snapshotJson")
      .notNull()
      .default(sql`'{}'::jsonb`),
    detailJson: jsonb("detailJson")
      .notNull()
      .default(sql`'{}'::jsonb`),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    requestedBy: varchar("requestedBy", { length: 120 }),
    approvedBy: varchar("approvedBy", { length: 120 }),
    rejectedBy: varchar("rejectedBy", { length: 120 }),
    resumedBy: varchar("resumedBy", { length: 120 }),
    requestedAt: timestamp("requestedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    approvedAt: timestamp("approvedAt", { withTimezone: true }),
    rejectedAt: timestamp("rejectedAt", { withTimezone: true }),
    resumedAt: timestamp("resumedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("agent_runtime_checkpoints_tenant_checkpoint_unique").on(
      t.tenantId,
      t.checkpointId
    ),
    uniqueIndex("agent_runtime_checkpoints_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("agent_runtime_checkpoints_tenant_run_step_idx").on(
      t.tenantId,
      t.runId,
      t.stepKey
    ),
    index("agent_runtime_checkpoints_tenant_status_updated_idx").on(
      t.tenantId,
      t.checkpointStatus,
      t.updatedAt
    ),
  ]
);

export type AgentRuntimeCheckpointRow =
  typeof agentRuntimeCheckpoints.$inferSelect;
export type InsertAgentRuntimeCheckpointRow =
  typeof agentRuntimeCheckpoints.$inferInsert;

/**
 * team_work_items — durable work objects for orchestrated routines and revisions.
 */
export const teamWorkItems = pgTable(
  "team_work_items",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 })
      .notNull()
      .references(() => assistantTeams.id, { onDelete: "cascade" }),
    roomId: varchar("roomId", { length: 36 })
      .notNull()
      .references(() => teamRooms.id, { onDelete: "cascade" }),
    runId: varchar("runId", { length: 36 }).references(() => teamRuns.id, {
      onDelete: "set null",
    }),
    routineId: varchar("routineId", { length: 36 }),
    sourceType: varchar("sourceType", { length: 50 })
      .notNull()
      .default("manual"),
    sourceRef: varchar("sourceRef", { length: 255 }),
    title: varchar("title", { length: 500 }).notNull(),
    objective: text("objective"),
    status: workItemStatusEnum("status").notNull().default("planned"),
    revisionVersion: integer("revisionVersion").notNull().default(1),
    threadRootMessageId: varchar("threadRootMessageId", { length: 36 }),
    activeDraftArtifactId: varchar("activeDraftArtifactId", { length: 36 }),
    priority: workItemPriorityEnum("priority").notNull().default("normal"),
    riskClass: workItemRiskClassEnum("riskClass").notNull().default("medium"),
    assignedMemberId: varchar("assignedMemberId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    reviewerMemberId: varchar("reviewerMemberId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    approverMemberId: varchar("approverMemberId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    lockOwnerMemberId: varchar("lockOwnerMemberId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    lockExpiresAt: timestamp("lockExpiresAt", { withTimezone: true }),
    parentWorkItemId: varchar("parentWorkItemId", { length: 36 }),
    supersededByWorkItemId: varchar("supersededByWorkItemId", { length: 36 }),
    artifactRefsJson: jsonb("artifactRefsJson"),
    approvalState: workItemApprovalStateEnum("approvalState")
      .notNull()
      .default("pending"),
    carryOverReason: text("carryOverReason"),
    dueAt: timestamp("dueAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("team_work_items_team_status_idx").on(
      t.teamId,
      t.status,
      t.updatedAt
    ),
    index("team_work_items_room_created_idx").on(t.roomId, t.createdAt),
    index("team_work_items_parent_idx").on(t.parentWorkItemId),
    index("team_work_items_assigned_status_idx").on(
      t.assignedMemberId,
      t.status
    ),
  ]
);

export type TeamWorkItem = typeof teamWorkItems.$inferSelect;
export type InsertTeamWorkItem = typeof teamWorkItems.$inferInsert;

/**
 * work_item_events — immutable audit trail for revisions, review, approval, and locking.
 */
export const workItemEvents = pgTable(
  "work_item_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workItemId: varchar("workItemId", { length: 36 })
      .notNull()
      .references(() => teamWorkItems.id, { onDelete: "cascade" }),
    roomId: varchar("roomId", { length: 36 })
      .notNull()
      .references(() => teamRooms.id, { onDelete: "cascade" }),
    runId: varchar("runId", { length: 36 }).references(() => teamRuns.id, {
      onDelete: "set null",
    }),
    actorAssistantId: varchar("actorAssistantId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    actorUserId: integer("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: varchar("eventType", { length: 50 }).notNull(),
    fromStatus: workItemStatusEnum("fromStatus"),
    toStatus: workItemStatusEnum("toStatus"),
    revisionVersion: integer("revisionVersion"),
    detailJson: jsonb("detailJson"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_item_events_work_item_created_idx").on(
      t.workItemId,
      t.createdAt
    ),
    index("work_item_events_room_created_idx").on(t.roomId, t.createdAt),
  ]
);

export type WorkItemEvent = typeof workItemEvents.$inferSelect;
export type InsertWorkItemEvent = typeof workItemEvents.$inferInsert;

/**
 * work_requests — initial intake records for business work.
 */
export const workRequests = pgTable(
  "work_requests",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: integer("projectId"),
    sourceType: varchar("sourceType", { length: 50 }).notNull(),
    sourceRef: varchar("sourceRef", { length: 255 }),
    requesterType: workOsAssignmentTypeEnum("requesterType")
      .notNull()
      .default("human"),
    requesterId: varchar("requesterId", { length: 36 }),
    workType: varchar("workType", { length: 100 }),
    businessDomain: varchar("businessDomain", { length: 100 }),
    urgency: varchar("urgency", { length: 30 }).notNull().default("normal"),
    riskLevel: varchar("riskLevel", { length: 30 }).notNull().default("medium"),
    classificationConfidence: doublePrecision("classificationConfidence"),
    defaultOwnerType: workOsAssignmentTypeEnum("defaultOwnerType"),
    defaultOwnerId: varchar("defaultOwnerId", { length: 36 }),
    defaultQueueId: varchar("defaultQueueId", { length: 36 }),
    title: varchar("title", { length: 500 }).notNull(),
    objective: text("objective"),
    currentState: workOsStateEnum("currentState").notNull().default("new"),
    linkedConversationIdsJson: jsonb("linkedConversationIdsJson").$type<
      string[]
    >(),
    linkedWorkpackRunIdsJson: jsonb("linkedWorkpackRunIdsJson").$type<
      string[]
    >(),
    linkedRoleRoutineRunIdsJson: jsonb("linkedRoleRoutineRunIdsJson").$type<
      string[]
    >(),
    linkedCaseId: varchar("linkedCaseId", { length: 36 }),
    idempotencyKey: varchar("idempotencyKey", { length: 180 }),
    idempotencyFingerprint: varchar("idempotencyFingerprint", { length: 64 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_requests_tenant_state_idx").on(
      t.tenantId,
      t.currentState,
      t.createdAt
    ),
    index("work_requests_tenant_source_idx").on(
      t.tenantId,
      t.sourceType,
      t.createdAt
    ),
    uniqueIndex("work_requests_tenant_idempotency_unique")
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`"idempotencyKey" IS NOT NULL`),
  ]
);

export type WorkRequest = typeof workRequests.$inferSelect;
export type InsertWorkRequest = typeof workRequests.$inferInsert;

/**
 * work_cases — durable business context spanning one or more tasks or runs.
 */
export const workCases = pgTable(
  "work_cases",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: integer("projectId"),
    requestId: varchar("requestId", { length: 36 })
      .notNull()
      .references(() => workRequests.id, { onDelete: "cascade" }),
    primaryTaskId: varchar("primaryTaskId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    title: varchar("title", { length: 500 }).notNull(),
    summary: text("summary"),
    ownerType: workOsAssignmentTypeEnum("ownerType"),
    ownerId: varchar("ownerId", { length: 36 }),
    priority: workItemPriorityEnum("priority").notNull().default("normal"),
    riskLevel: varchar("riskLevel", { length: 30 }).notNull().default("medium"),
    dataClassification: varchar("dataClassification", { length: 30 })
      .notNull()
      .default("internal"),
    currentState: workOsStateEnum("currentState").notNull().default("new"),
    automationRunId: varchar("automationRunId", { length: 36 }),
    automationMode: workAutomationModeEnum("automationMode")
      .notNull()
      .default("manual_assist"),
    automationTemplateKey: varchar("automationTemplateKey", { length: 120 }),
    automationTemplateFamily: varchar("automationTemplateFamily", {
      length: 120,
    })
      .notNull()
      .default("content-production"),
    automationTemplateSource: varchar("automationTemplateSource", {
      length: 120,
    })
      .notNull()
      .default("case_intake"),
    automationPolicyJson: jsonb("automationPolicyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    automationStepId: varchar("automationStepId", { length: 36 }),
    automationCheckpointId: varchar("automationCheckpointId", { length: 36 }),
    automationDisposition: varchar("automationDisposition", { length: 120 }),
    automationSummary: text("automationSummary"),
    automationUpdatedAt: timestamp("automationUpdatedAt", {
      withTimezone: true,
    }),
    linkedConversationIdsJson: jsonb("linkedConversationIdsJson").$type<
      string[]
    >(),
    linkedWorkpackRunIdsJson: jsonb("linkedWorkpackRunIdsJson").$type<
      string[]
    >(),
    linkedRoleRoutineRunIdsJson: jsonb("linkedRoleRoutineRunIdsJson").$type<
      string[]
    >(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_cases_tenant_state_idx").on(
      t.tenantId,
      t.currentState,
      t.updatedAt
    ),
    index("work_cases_request_idx").on(t.requestId),
    index("work_cases_primary_task_idx").on(t.primaryTaskId),
  ]
);

export type WorkCase = typeof workCases.$inferSelect;
export type InsertWorkCase = typeof workCases.$inferInsert;

/**
 * work_assignments — immutable ownership history for work cases and tasks.
 */
export const workAssignments = pgTable(
  "work_assignments",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    taskId: varchar("taskId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    previousOwnerType: workOsAssignmentTypeEnum("previousOwnerType"),
    previousOwnerId: varchar("previousOwnerId", { length: 36 }),
    ownerType: workOsAssignmentTypeEnum("ownerType").notNull(),
    ownerId: varchar("ownerId", { length: 36 }),
    assignmentSource: varchar("assignmentSource", { length: 50 })
      .notNull()
      .default("manual"),
    reason: text("reason"),
    actorAssistantId: varchar("actorAssistantId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    actorUserId: integer("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_assignments_case_created_idx").on(t.caseId, t.createdAt),
    index("work_assignments_tenant_owner_idx").on(
      t.tenantId,
      t.ownerType,
      t.ownerId
    ),
    index("work_assignments_task_idx").on(t.taskId),
  ]
);

export type WorkAssignment = typeof workAssignments.$inferSelect;
export type InsertWorkAssignment = typeof workAssignments.$inferInsert;

/**
 * work_approvals — work-scoped approval checkpoints.
 */
export const workApprovals = pgTable(
  "work_approvals",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    taskId: varchar("taskId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    approvalTransportId: varchar("approvalTransportId", { length: 36 }),
    approvalStatus: workOsApprovalStatusEnum("approvalStatus")
      .notNull()
      .default("pending"),
    approverType: workOsAssignmentTypeEnum("approverType").default("human"),
    approverId: varchar("approverId", { length: 36 }),
    comment: text("comment"),
    metadataJson: jsonb("metadataJson"),
    requestedAt: timestamp("requestedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("respondedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_approvals_case_status_idx").on(
      t.caseId,
      t.approvalStatus,
      t.createdAt
    ),
    index("work_approvals_task_idx").on(t.taskId),
  ]
);

export type WorkApproval = typeof workApprovals.$inferSelect;
export type InsertWorkApproval = typeof workApprovals.$inferInsert;

/**
 * work_exceptions — escalated policy, availability, or SLA tripwires.
 */
export const workExceptions = pgTable(
  "work_exceptions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    taskId: varchar("taskId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    exceptionType: varchar("exceptionType", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 30 }).notNull().default("medium"),
    status: workOsExceptionStatusEnum("status").notNull().default("open"),
    reason: text("reason"),
    ownerType: workOsAssignmentTypeEnum("ownerType"),
    ownerId: varchar("ownerId", { length: 36 }),
    metadataJson: jsonb("metadataJson"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_exceptions_case_status_idx").on(
      t.caseId,
      t.status,
      t.createdAt
    ),
    index("work_exceptions_task_idx").on(t.taskId),
  ]
);

export type WorkException = typeof workExceptions.$inferSelect;
export type InsertWorkException = typeof workExceptions.$inferInsert;

/**
 * work_outcomes — explicit business results for completed work.
 */
export const workOutcomes = pgTable(
  "work_outcomes",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    taskId: varchar("taskId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    disposition: varchar("disposition", { length: 100 }).notNull(),
    resolutionCode: varchar("resolutionCode", { length: 100 }),
    customerImpact: varchar("customerImpact", { length: 100 }),
    reviewerResult: varchar("reviewerResult", { length: 100 }),
    followUpRequired: boolean("followUpRequired").default(false).notNull(),
    summary: text("summary"),
    metadataJson: jsonb("metadataJson"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_outcomes_case_created_idx").on(t.caseId, t.createdAt),
    index("work_outcomes_task_idx").on(t.taskId),
  ]
);

export type WorkOutcome = typeof workOutcomes.$inferSelect;
export type InsertWorkOutcome = typeof workOutcomes.$inferInsert;

/**
 * work_sla — explicit SLA envelope for routable work.
 */
export const workSlas = pgTable(
  "work_slas",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    taskId: varchar("taskId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    policyId: varchar("policyId", { length: 36 }),
    dueAt: timestamp("dueAt", { withTimezone: true }),
    serviceWindowStartAt: timestamp("serviceWindowStartAt", {
      withTimezone: true,
    }),
    serviceWindowEndAt: timestamp("serviceWindowEndAt", { withTimezone: true }),
    urgency: varchar("urgency", { length: 30 }).notNull().default("normal"),
    breachState: workOsSlaBreachStateEnum("breachState")
      .notNull()
      .default("none"),
    breachedAt: timestamp("breachedAt", { withTimezone: true }),
    escalatedAt: timestamp("escalatedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_slas_case_due_idx").on(t.caseId, t.dueAt),
    index("work_slas_task_idx").on(t.taskId),
  ]
);

export type WorkSla = typeof workSlas.$inferSelect;
export type InsertWorkSla = typeof workSlas.$inferInsert;

/**
 * work_os_events — append-only event log for request/case/task/approval/exception/outcome transitions.
 */
export const workOsEvents = pgTable(
  "work_os_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 }).references(() => workCases.id, {
      onDelete: "cascade",
    }),
    taskId: varchar("taskId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    actorAssistantId: varchar("actorAssistantId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    actorUserId: integer("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    fromState: workOsStateEnum("fromState"),
    toState: workOsStateEnum("toState"),
    detailJson: jsonb("detailJson"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_os_events_case_created_idx").on(t.caseId, t.createdAt),
    index("work_os_events_request_created_idx").on(t.requestId, t.createdAt),
    index("work_os_events_task_created_idx").on(t.taskId, t.createdAt),
  ]
);

export type WorkOsEvent = typeof workOsEvents.$inferSelect;
export type InsertWorkOsEvent = typeof workOsEvents.$inferInsert;

/**
 * work_automation_runs — canonical run envelopes for Work OS automation cases.
 */
export const workAutomationRuns = pgTable(
  "work_automation_runs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    taskId: varchar("taskId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    templateKey: varchar("templateKey", { length: 120 }).notNull(),
    templateVersion: varchar("templateVersion", { length: 50 }),
    templateFamily: varchar("templateFamily", { length: 120 })
      .notNull()
      .default("content-production"),
    templateSource: varchar("templateSource", { length: 120 })
      .notNull()
      .default("case_intake"),
    title: varchar("title", { length: 500 }).notNull(),
    objective: text("objective"),
    currentMode: workAutomationModeEnum("currentMode")
      .notNull()
      .default("manual_assist"),
    status: workAutomationRunStatusEnum("status").notNull().default("pending"),
    currentStepId: varchar("currentStepId", { length: 36 }),
    currentCheckpointId: varchar("currentCheckpointId", { length: 36 }),
    finalDisposition: varchar("finalDisposition", { length: 120 }),
    finalDispositionReason: text("finalDispositionReason"),
    resumeCursor: text("resumeCursor"),
    policyJson: jsonb("policyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByAssistantId: varchar("createdByAssistantId", {
      length: 36,
    }).references(() => assistantProfiles.id, { onDelete: "set null" }),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_automation_runs_case_idx").on(t.caseId, t.createdAt),
    index("work_automation_runs_tenant_idx").on(t.tenantId),
    index("work_automation_runs_status_idx").on(t.status),
    index("work_automation_runs_mode_idx").on(t.currentMode, t.updatedAt),
    uniqueIndex("work_automation_runs_case_active_unique")
      .on(t.tenantId, t.caseId)
      .where(
        sql`"status" IN ('pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused')`
      ),
  ]
);

export type WorkAutomationRun = typeof workAutomationRuns.$inferSelect;
export type InsertWorkAutomationRun = typeof workAutomationRuns.$inferInsert;

/**
 * work_automation_run_steps — ordered, queryable step history for a run.
 */
export const workAutomationRunSteps = pgTable(
  "work_automation_run_steps",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => workAutomationRuns.id, { onDelete: "cascade" }),
    stepKey: varchar("stepKey", { length: 120 }).notNull(),
    stepIndex: integer("stepIndex").notNull().default(0),
    title: varchar("title", { length: 500 }).notNull(),
    status: workAutomationStepStatusEnum("status").notNull().default("planned"),
    riskTier: workAutomationRiskTierEnum("riskTier")
      .notNull()
      .default("medium"),
    surface: workAutomationSurfaceEnum("surface").notNull().default("manual"),
    inputRefsJson: jsonb("inputRefsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    outputRefsJson: jsonb("outputRefsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    retryCount: integer("retryCount").notNull().default(0),
    idempotencyKey: varchar("idempotencyKey", { length: 180 }),
    summary: text("summary"),
    detailJson: jsonb("detailJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    actorUserId: integer("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    actorAssistantId: varchar("actorAssistantId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_automation_run_steps_run_idx").on(
      t.runId,
      t.stepIndex,
      t.createdAt
    ),
    index("work_automation_run_steps_case_idx").on(t.caseId, t.createdAt),
    index("work_automation_run_steps_tenant_idx").on(t.tenantId),
    index("work_automation_run_steps_step_key_idx").on(t.runId, t.stepKey),
    uniqueIndex("work_automation_run_steps_tenant_run_step_idempotency_unique")
      .on(t.tenantId, t.runId, t.stepKey, t.idempotencyKey)
      .where(sql`"idempotencyKey" IS NOT NULL`),
  ]
);

export type WorkAutomationRunStep = typeof workAutomationRunSteps.$inferSelect;
export type InsertWorkAutomationRunStep =
  typeof workAutomationRunSteps.$inferInsert;

/**
 * work_automation_browser_task_claims — durable claim/outbox state for browser automation tasks.
 */
export const workAutomationBrowserTaskClaims = pgTable(
  "work_automation_browser_task_claims",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => workAutomationRuns.id, { onDelete: "cascade" }),
    stepId: varchar("stepId", { length: 36 }).references(
      () => workAutomationRunSteps.id,
      { onDelete: "set null" }
    ),
    stepKey: varchar("stepKey", { length: 120 }).notNull(),
    stepIndex: integer("stepIndex").notNull().default(0),
    title: varchar("title", { length: 500 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 180 }),
    claimToken: varchar("claimToken", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("claimed"),
    taskId: varchar("taskId", { length: 200 }),
    executionId: varchar("executionId", { length: 200 }),
    reservationId: varchar("reservationId", { length: 120 }),
    inputRefsJson: jsonb("inputRefsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    outputRefsJson: jsonb("outputRefsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    detailJson: jsonb("detailJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    errorMessage: text("errorMessage"),
    claimedAt: timestamp("claimedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    dispatchedAt: timestamp("dispatchedAt", { withTimezone: true }),
    lastPolledAt: timestamp("lastPolledAt", { withTimezone: true }),
    nextPollAt: timestamp("nextPollAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    pollCount: integer("pollCount").notNull().default(0),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByAssistantId: varchar("createdByAssistantId", {
      length: 36,
    }).references(() => assistantProfiles.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex(
      "work_automation_browser_task_claims_tenant_run_step_idempotency_unique"
    )
      .on(t.tenantId, t.runId, t.stepKey, t.idempotencyKey)
      .where(sql`"idempotencyKey" IS NOT NULL`),
    uniqueIndex("work_automation_browser_task_claims_tenant_task_unique")
      .on(t.tenantId, t.taskId)
      .where(sql`"taskId" IS NOT NULL`),
    index("work_automation_browser_task_claims_tenant_status_poll_idx").on(
      t.tenantId,
      t.status,
      t.nextPollAt
    ),
    index("work_automation_browser_task_claims_run_idx").on(
      t.runId,
      t.createdAt
    ),
    index("work_automation_browser_task_claims_case_idx").on(
      t.caseId,
      t.createdAt
    ),
  ]
);

export type WorkAutomationBrowserTaskClaim =
  typeof workAutomationBrowserTaskClaims.$inferSelect;
export type InsertWorkAutomationBrowserTaskClaim =
  typeof workAutomationBrowserTaskClaims.$inferInsert;

/**
 * work_automation_run_checkpoints — approval and resume snapshots for automation runs.
 */
export const workAutomationRunCheckpoints = pgTable(
  "work_automation_run_checkpoints",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => workAutomationRuns.id, { onDelete: "cascade" }),
    stepId: varchar("stepId", { length: 36 }).references(
      () => workAutomationRunSteps.id,
      { onDelete: "set null" }
    ),
    stepKey: varchar("stepKey", { length: 120 }),
    checkpointKey: varchar("checkpointKey", { length: 120 }).notNull(),
    resumeCursor: text("resumeCursor").notNull(),
    approvalState: workAutomationCheckpointApprovalStateEnum("approvalState")
      .notNull()
      .default("pending"),
    checkpointStatus: workAutomationCheckpointStatusEnum("checkpointStatus")
      .notNull()
      .default("open"),
    editSnapshotRefsJson: jsonb("editSnapshotRefsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    snapshotJson: jsonb("snapshotJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    detailJson: jsonb("detailJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    requestedByUserId: integer("requestedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByUserId: integer("approvedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    actorAssistantId: varchar("actorAssistantId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    requestedAt: timestamp("requestedAt", { withTimezone: true }),
    approvedAt: timestamp("approvedAt", { withTimezone: true }),
    resumedAt: timestamp("resumedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_automation_run_checkpoints_run_idx").on(t.runId, t.createdAt),
    index("work_automation_run_checkpoints_case_idx").on(t.caseId, t.createdAt),
    index("work_automation_run_checkpoints_tenant_idx").on(t.tenantId),
    index("work_automation_run_checkpoints_status_idx").on(
      t.checkpointStatus,
      t.approvalState
    ),
  ]
);

export type WorkAutomationRunCheckpoint =
  typeof workAutomationRunCheckpoints.$inferSelect;
export type InsertWorkAutomationRunCheckpoint =
  typeof workAutomationRunCheckpoints.$inferInsert;

/**
 * work_automation_run_events — append-only audit trail for mode changes and automation lifecycle events.
 */
export const workAutomationRunEvents = pgTable(
  "work_automation_run_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestId: varchar("requestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "cascade" }
    ),
    caseId: varchar("caseId", { length: 36 })
      .notNull()
      .references(() => workCases.id, { onDelete: "cascade" }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => workAutomationRuns.id, { onDelete: "cascade" }),
    stepId: varchar("stepId", { length: 36 }).references(
      () => workAutomationRunSteps.id,
      { onDelete: "set null" }
    ),
    checkpointId: varchar("checkpointId", { length: 36 }).references(
      () => workAutomationRunCheckpoints.id,
      { onDelete: "set null" }
    ),
    eventType: varchar("eventType", { length: 120 }).notNull(),
    fromMode: workAutomationModeEnum("fromMode"),
    toMode: workAutomationModeEnum("toMode"),
    status: workAutomationRunStatusEnum("status"),
    detailJson: jsonb("detailJson")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    actorUserId: integer("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    actorAssistantId: varchar("actorAssistantId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("work_automation_run_events_run_idx").on(t.runId, t.createdAt),
    index("work_automation_run_events_case_idx").on(t.caseId, t.createdAt),
    index("work_automation_run_events_tenant_idx").on(t.tenantId),
    index("work_automation_run_events_event_idx").on(t.eventType, t.createdAt),
  ]
);

export type WorkAutomationRunEvent =
  typeof workAutomationRunEvents.$inferSelect;
export type InsertWorkAutomationRunEvent =
  typeof workAutomationRunEvents.$inferInsert;

/**
 * auto_team_route_decisions — canonical route classification and policy snapshot for an Auto-Team run.
 */
export const autoTeamRouteDecisions = pgTable(
  "auto_team_route_decisions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "cascade" }
    ),
    roomId: varchar("roomId", { length: 36 }).references(() => teamRooms.id, {
      onDelete: "cascade",
    }),
    runId: varchar("runId", { length: 36 }).references(() => teamRuns.id, {
      onDelete: "cascade",
    }),
    workRequestId: varchar("workRequestId", { length: 36 }).references(
      () => workRequests.id,
      { onDelete: "set null" }
    ),
    workCaseId: varchar("workCaseId", { length: 36 }).references(
      () => workCases.id,
      { onDelete: "set null" }
    ),
    routeClass: varchar("routeClass", { length: 64 })
      .$type<AutoTeamRouteClass>()
      .notNull(),
    routeConfidence: real("routeConfidence"),
    allowedCapabilityFamiliesJson: jsonb("allowedCapabilityFamiliesJson")
      .$type<AutoTeamCapabilityFamily[]>()
      .notNull()
      .default([]),
    selectedPolicyJson:
      jsonb("selectedPolicyJson").$type<Record<string, unknown>>(),
    selectedOrchestratorPersonaId: varchar("selectedOrchestratorPersonaId", {
      length: 36,
    }).references(() => assistantProfiles.id, { onDelete: "set null" }),
    language: varchar("language", { length: 8 })
      .$type<"en" | "th">()
      .notNull()
      .default("en"),
    decisionReason: text("decisionReason"),
    source: varchar("source", { length: 64 })
      .notNull()
      .default("auto_team_route_policy"),
    blockedReason: text("blockedReason"),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("auto_team_route_decisions_tenant_run_idempotency_unique").on(
      t.tenantId,
      t.runId,
      t.idempotencyKey
    ),
    index("auto_team_route_decisions_tenant_room_idx").on(
      t.tenantId,
      t.roomId,
      t.createdAt
    ),
    index("auto_team_route_decisions_tenant_request_idx").on(
      t.tenantId,
      t.workRequestId,
      t.createdAt
    ),
    index("auto_team_route_decisions_tenant_route_idx").on(
      t.tenantId,
      t.routeClass,
      t.createdAt
    ),
  ]
);

export type AutoTeamRouteDecisionRow =
  typeof autoTeamRouteDecisions.$inferSelect;
export type InsertAutoTeamRouteDecisionRow =
  typeof autoTeamRouteDecisions.$inferInsert;

/**
 * auto_team_execution_stages — durable, ordered stage history for an Auto-Team run.
 */
export const autoTeamExecutionStages = pgTable(
  "auto_team_execution_stages",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "cascade" }
    ),
    roomId: varchar("roomId", { length: 36 }).references(() => teamRooms.id, {
      onDelete: "cascade",
    }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => teamRuns.id, { onDelete: "cascade" }),
    routeDecisionId: varchar("routeDecisionId", { length: 36 }).references(
      () => autoTeamRouteDecisions.id,
      { onDelete: "cascade" }
    ),
    workItemId: varchar("workItemId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    planStepKey: varchar("planStepKey", { length: 120 }).notNull(),
    stageType: varchar("stageType", { length: 64 })
      .$type<AutoTeamStageType>()
      .notNull(),
    status: varchar("status", { length: 32 })
      .$type<AutoTeamStageStatus>()
      .notNull()
      .default("queued"),
    assignedPersonaId: varchar("assignedPersonaId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    expectedCapabilityFamily: varchar("expectedCapabilityFamily", {
      length: 64,
    }).$type<AutoTeamCapabilityFamily>(),
    selectedSkillId: varchar("selectedSkillId", { length: 180 }),
    selectedProvider: varchar("selectedProvider", { length: 120 }),
    inputArtifactRefsJson: jsonb("inputArtifactRefsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    outputArtifactRefsJson: jsonb("outputArtifactRefsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    jobRefIdsJson: jsonb("jobRefIdsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    attempt: integer("attempt").notNull().default(1),
    maxAttempts: integer("maxAttempts").notNull().default(3),
    claimToken: varchar("claimToken", { length: 128 }),
    claimExpiresAt: timestamp("claimExpiresAt", { withTimezone: true }),
    claimedBy: varchar("claimedBy", { length: 180 }),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    deadlineAt: timestamp("deadlineAt", { withTimezone: true }),
    blockedReason: text("blockedReason"),
    errorCode: varchar("errorCode", { length: 120 }),
    errorMessage: text("errorMessage"),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("auto_team_execution_stages_tenant_run_step_attempt_unique").on(
      t.tenantId,
      t.runId,
      t.planStepKey,
      t.attempt
    ),
    uniqueIndex("auto_team_execution_stages_tenant_run_idempotency_unique").on(
      t.tenantId,
      t.runId,
      t.idempotencyKey
    ),
    index("auto_team_execution_stages_tenant_run_status_idx").on(
      t.tenantId,
      t.runId,
      t.status
    ),
    index("auto_team_execution_stages_tenant_room_idx").on(
      t.tenantId,
      t.roomId,
      t.updatedAt
    ),
    index("auto_team_execution_stages_tenant_work_item_idx").on(
      t.tenantId,
      t.workItemId
    ),
    index("auto_team_execution_stages_tenant_route_decision_idx").on(
      t.tenantId,
      t.routeDecisionId
    ),
  ]
);

export type AutoTeamExecutionStageRow =
  typeof autoTeamExecutionStages.$inferSelect;
export type InsertAutoTeamExecutionStageRow =
  typeof autoTeamExecutionStages.$inferInsert;

/**
 * auto_team_media_job_refs — provider task references for media execution.
 */
export const autoTeamMediaJobRefs = pgTable(
  "auto_team_media_job_refs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "cascade" }
    ),
    roomId: varchar("roomId", { length: 36 }).references(() => teamRooms.id, {
      onDelete: "cascade",
    }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => teamRuns.id, { onDelete: "cascade" }),
    stageId: varchar("stageId", { length: 36 }).references(
      () => autoTeamExecutionStages.id,
      { onDelete: "cascade" }
    ),
    workItemId: varchar("workItemId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    mediaType: varchar("mediaType", { length: 16 })
      .$type<AutoTeamMediaType>()
      .notNull(),
    provider: varchar("provider", { length: 120 }).notNull(),
    model: varchar("model", { length: 180 }).notNull(),
    providerTaskId: varchar("providerTaskId", { length: 255 }),
    providerStatus: varchar("providerStatus", { length: 64 })
      .notNull()
      .default("queued"),
    submittedPromptArtifactRef: varchar("submittedPromptArtifactRef", {
      length: 255,
    }),
    resultArtifactRefsJson: jsonb("resultArtifactRefsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    providerRequestHash: varchar("providerRequestHash", { length: 128 }),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    lastPolledAt: timestamp("lastPolledAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    failedAt: timestamp("failedAt", { withTimezone: true }),
    errorCode: varchar("errorCode", { length: 120 }),
    errorMessage: text("errorMessage"),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("auto_team_media_job_refs_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("auto_team_media_job_refs_provider_task_idx").on(
      t.tenantId,
      t.provider,
      t.providerTaskId
    ),
    index("auto_team_media_job_refs_run_status_idx").on(
      t.tenantId,
      t.runId,
      t.providerStatus
    ),
    index("auto_team_media_job_refs_stage_idx").on(t.tenantId, t.stageId),
    index("auto_team_media_job_refs_work_item_idx").on(
      t.tenantId,
      t.workItemId
    ),
  ]
);

export type AutoTeamMediaJobRefRow = typeof autoTeamMediaJobRefs.$inferSelect;
export type InsertAutoTeamMediaJobRefRow =
  typeof autoTeamMediaJobRefs.$inferInsert;

/**
 * auto_team_review_records — reviewer scores and repair instructions.
 */
export const autoTeamReviewRecords = pgTable(
  "auto_team_review_records",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "cascade" }
    ),
    roomId: varchar("roomId", { length: 36 }).references(() => teamRooms.id, {
      onDelete: "cascade",
    }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => teamRuns.id, { onDelete: "cascade" }),
    stageId: varchar("stageId", { length: 36 }).references(
      () => autoTeamExecutionStages.id,
      { onDelete: "cascade" }
    ),
    workItemId: varchar("workItemId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    reviewerPersonaId: varchar("reviewerPersonaId", { length: 36 }).references(
      () => assistantProfiles.id,
      { onDelete: "set null" }
    ),
    reviewType: varchar("reviewType", { length: 120 }).notNull(),
    score: doublePrecision("score").notNull().default(0),
    passThreshold: doublePrecision("passThreshold").notNull().default(0),
    passed: boolean("passed").notNull().default(false),
    reviewedArtifactRefsJson: jsonb("reviewedArtifactRefsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    reviewedJobRefIdsJson: jsonb("reviewedJobRefIdsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    comments: text("comments"),
    repairInstructions: text("repairInstructions"),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex(
      "auto_team_review_records_tenant_run_review_idempotency_unique"
    ).on(t.tenantId, t.runId, t.reviewType, t.idempotencyKey),
    index("auto_team_review_records_tenant_run_passed_idx").on(
      t.tenantId,
      t.runId,
      t.passed
    ),
    index("auto_team_review_records_tenant_stage_idx").on(
      t.tenantId,
      t.stageId
    ),
  ]
);

export type AutoTeamReviewRecordRow = typeof autoTeamReviewRecords.$inferSelect;
export type InsertAutoTeamReviewRecordRow =
  typeof autoTeamReviewRecords.$inferInsert;

/**
 * auto_team_final_results — route completion and finalization evidence.
 */
export const autoTeamFinalResults = pgTable(
  "auto_team_final_results",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "cascade" }
    ),
    roomId: varchar("roomId", { length: 36 }).references(() => teamRooms.id, {
      onDelete: "cascade",
    }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => teamRuns.id, { onDelete: "cascade" }),
    routeDecisionId: varchar("routeDecisionId", { length: 36 }).references(
      () => autoTeamRouteDecisions.id,
      { onDelete: "cascade" }
    ),
    status: varchar("status", { length: 64 })
      .$type<AutoTeamFinalResultStatus>()
      .notNull()
      .default("legacy_unverified"),
    finalArtifactRefsJson: jsonb("finalArtifactRefsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    mediaJobRefIdsJson: jsonb("mediaJobRefIdsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    reviewRecordRefIdsJson: jsonb("reviewRecordRefIdsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    humanApprovalStatus: varchar("humanApprovalStatus", { length: 32 })
      .$type<"pending" | "approved" | "rejected" | "not_required">()
      .notNull()
      .default("not_required"),
    summary: text("summary"),
    failureReason: text("failureReason"),
    blockedReason: text("blockedReason"),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("auto_team_final_results_tenant_run_idempotency_unique").on(
      t.tenantId,
      t.runId,
      t.idempotencyKey
    ),
    index("auto_team_final_results_tenant_route_decision_idx").on(
      t.tenantId,
      t.routeDecisionId
    ),
    index("auto_team_final_results_tenant_run_status_idx").on(
      t.tenantId,
      t.runId,
      t.status
    ),
  ]
);

export type AutoTeamFinalResultRow = typeof autoTeamFinalResults.$inferSelect;
export type InsertAutoTeamFinalResultRow =
  typeof autoTeamFinalResults.$inferInsert;

/**
 * auto_team_trace_events — append-only durable trace log for Auto-Team runs.
 */
export const autoTeamTraceEvents = pgTable(
  "auto_team_trace_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "cascade" }
    ),
    roomId: varchar("roomId", { length: 36 }).references(() => teamRooms.id, {
      onDelete: "cascade",
    }),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => teamRuns.id, { onDelete: "cascade" }),
    stageId: varchar("stageId", { length: 36 }).references(
      () => autoTeamExecutionStages.id,
      { onDelete: "cascade" }
    ),
    workItemId: varchar("workItemId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    traceEventId: varchar("traceEventId", { length: 120 }).notNull(),
    sequence: integer("sequence").notNull(),
    eventName: varchar("eventName", { length: 160 }).notNull(),
    sourceComponent: varchar("sourceComponent", { length: 120 }).notNull(),
    severity: varchar("severity", { length: 16 })
      .$type<"debug" | "info" | "warn" | "error">()
      .notNull()
      .default("info"),
    summary: text("summary"),
    redactedMetadataJson: jsonb("redactedMetadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("auto_team_trace_events_tenant_run_sequence_unique").on(
      t.tenantId,
      t.runId,
      t.sequence
    ),
    uniqueIndex("auto_team_trace_events_tenant_run_idempotency_unique").on(
      t.tenantId,
      t.runId,
      t.idempotencyKey
    ),
    index("auto_team_trace_events_tenant_event_idx").on(
      t.tenantId,
      t.eventName,
      t.createdAt
    ),
    index("auto_team_trace_events_tenant_trace_idx").on(
      t.tenantId,
      t.traceEventId
    ),
  ]
);

export type AutoTeamTraceEventRow = typeof autoTeamTraceEvents.$inferSelect;
export type InsertAutoTeamTraceEventRow =
  typeof autoTeamTraceEvents.$inferInsert;

/**
 * auto_team_artifact_refs — canonical evidence handles for prompt/storyboard/media/review/final assets.
 */
export const autoTeamArtifactRefs = pgTable(
  "auto_team_artifact_refs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }).references(
      () => assistantTeams.id,
      { onDelete: "cascade" }
    ),
    roomId: varchar("roomId", { length: 36 }).references(() => teamRooms.id, {
      onDelete: "cascade",
    }),
    runId: varchar("runId", { length: 36 }).references(() => teamRuns.id, {
      onDelete: "cascade",
    }),
    stageId: varchar("stageId", { length: 36 }).references(
      () => autoTeamExecutionStages.id,
      { onDelete: "cascade" }
    ),
    workItemId: varchar("workItemId", { length: 36 }).references(
      () => teamWorkItems.id,
      { onDelete: "set null" }
    ),
    artifactType: varchar("artifactType", { length: 120 }).notNull(),
    artifactRole: varchar("artifactRole", { length: 64 }).notNull(),
    storageRef: text("storageRef"),
    externalRef: text("externalRef"),
    contentHash: varchar("contentHash", { length: 128 }),
    visibility: varchar("visibility", { length: 32 })
      .notNull()
      .default("tenant"),
    retentionPolicyJson: jsonb("retentionPolicyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    safetyStatus: varchar("safetyStatus", { length: 32 })
      .notNull()
      .default("unknown"),
    source: varchar("source", { length: 120 }),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("auto_team_artifact_refs_tenant_run_idempotency_unique").on(
      t.tenantId,
      t.runId,
      t.idempotencyKey
    ),
    index("auto_team_artifact_refs_tenant_type_idx").on(
      t.tenantId,
      t.artifactType,
      t.createdAt
    ),
    index("auto_team_artifact_refs_tenant_stage_idx").on(t.tenantId, t.stageId),
    index("auto_team_artifact_refs_tenant_visibility_idx").on(
      t.tenantId,
      t.visibility
    ),
  ]
);

export type AutoTeamArtifactRefRow = typeof autoTeamArtifactRefs.$inferSelect;
export type InsertAutoTeamArtifactRefRow =
  typeof autoTeamArtifactRefs.$inferInsert;

/**
 * agent_activity_events — append-only event log for monitoring.
 * No updatedAt by design. No FKs for write performance.
 */
export const agentActivityEvents = pgTable(
  "agent_activity_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    teamId: varchar("teamId", { length: 36 }).notNull(),
    roomId: varchar("roomId", { length: 36 }).notNull(),
    runId: varchar("runId", { length: 36 }).notNull(),
    assistantId: varchar("assistantId", { length: 36 }),
    eventType: text("eventType").notNull(),
    eventCategory: agentEventCategoryEnum("eventCategory").notNull(),
    visibility: roomMessageVisibilityEnum("visibility")
      .notNull()
      .default("transparent"),
    summary: text("summary"),
    detailJson: jsonb("detailJson"),
    tokenUsageSnapshot: integer("tokenUsageSnapshot"),
    costSnapshot: numeric("costSnapshot", { precision: 12, scale: 4 }),
    durationMs: integer("durationMs"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agent_activity_events_run_created_idx").on(t.runId, t.createdAt),
    index("agent_activity_events_assistant_created_idx").on(
      t.assistantId,
      t.createdAt
    ),
  ]
);

export type AgentActivityEvent = typeof agentActivityEvents.$inferSelect;
export type InsertAgentActivityEvent = typeof agentActivityEvents.$inferInsert;

/**
 * agent_run_summaries — per-agent performance summary computed when a run completes.
 */
export const agentRunSummaries = pgTable(
  "agent_run_summaries",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => teamRuns.id, { onDelete: "cascade" }),
    assistantId: varchar("assistantId", { length: 36 })
      .notNull()
      .references(() => assistantProfiles.id),
    turnCount: integer("turnCount").default(0).notNull(),
    totalInputTokens: integer("totalInputTokens").default(0).notNull(),
    totalOutputTokens: integer("totalOutputTokens").default(0).notNull(),
    totalCostCredits: numeric("totalCostCredits", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    toolCallCount: integer("toolCallCount").default(0).notNull(),
    toolSuccessCount: integer("toolSuccessCount").default(0).notNull(),
    toolFailureCount: integer("toolFailureCount").default(0).notNull(),
    memoriesRead: integer("memoriesRead").default(0).notNull(),
    memoriesWritten: integer("memoriesWritten").default(0).notNull(),
    memoriesPromoted: integer("memoriesPromoted").default(0).notNull(),
    artifactsCreated: integer("artifactsCreated").default(0).notNull(),
    handoffsSent: integer("handoffsSent").default(0).notNull(),
    handoffsReceived: integer("handoffsReceived").default(0).notNull(),
    errorCount: integer("errorCount").default(0).notNull(),
    activeDurationMs: integer("activeDurationMs").default(0).notNull(),
    waitDurationMs: integer("waitDurationMs").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("agent_run_summaries_run_idx").on(t.runId)]
);

export type AgentRunSummary = typeof agentRunSummaries.$inferSelect;
export type InsertAgentRunSummary = typeof agentRunSummaries.$inferInsert;

export const agentRegistryRegistries = pgTable(
  "agent_registry_registries",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    registryKey: varchar("registryKey", { length: 180 }).notNull(),
    agentKind: varchar("agentKind", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").default(""),
    owningTeamId: varchar("owningTeamId", { length: 36 }),
    owningUserId: integer("owningUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    currentStableVersionId: varchar("currentStableVersionId", { length: 36 }),
    currentLatestVersionId: varchar("currentLatestVersionId", { length: 36 }),
    rolloutState: varchar("rolloutState", { length: 32 })
      .notNull()
      .default("draft"),
    modelFamilies: jsonb("modelFamilies")
      .$type<string[]>()
      .notNull()
      .default([]),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agent_registry_registries_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("agent_registry_registries_tenant_key_idx").on(
      t.tenantId,
      t.registryKey
    ),
  ]
);

export type AgentRegistryRegistry = typeof agentRegistryRegistries.$inferSelect;
export type InsertAgentRegistryRegistry =
  typeof agentRegistryRegistries.$inferInsert;

export const agentRegistryVersions = pgTable(
  "agent_registry_versions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    registryId: varchar("registryId", { length: 36 })
      .notNull()
      .references(() => agentRegistryRegistries.id, { onDelete: "cascade" }),
    versionNumber: integer("versionNumber").notNull(),
    versionStatus: varchar("versionStatus", { length: 32 })
      .notNull()
      .default("draft"),
    rolloutState: varchar("rolloutState", { length: 32 })
      .notNull()
      .default("draft"),
    previousVersionId: varchar("previousVersionId", { length: 36 }),
    isStable: boolean("isStable").notNull().default(false),
    reviewRequired: boolean("reviewRequired").notNull().default(false),
    publishedAt: timestamp("publishedAt", { withTimezone: true }),
    frozenAt: timestamp("frozenAt", { withTimezone: true }),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agent_registry_versions_registry_idx").on(
      t.registryId,
      t.versionNumber
    ),
    index("agent_registry_versions_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("agent_registry_versions_unique_version_idx").on(
      t.registryId,
      t.versionNumber
    ),
  ]
);

export type AgentRegistryVersion = typeof agentRegistryVersions.$inferSelect;
export type InsertAgentRegistryVersion =
  typeof agentRegistryVersions.$inferInsert;

export const agentRegistryPolicyBindings = pgTable(
  "agent_registry_policy_bindings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    registryId: varchar("registryId", { length: 36 })
      .notNull()
      .references(() => agentRegistryRegistries.id, { onDelete: "cascade" }),
    versionId: varchar("versionId", { length: 36 })
      .notNull()
      .references(() => agentRegistryVersions.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    supportedWorkDomains: jsonb("supportedWorkDomains")
      .$type<string[]>()
      .notNull()
      .default([]),
    supportedToolClasses: jsonb("supportedToolClasses")
      .$type<string[]>()
      .notNull()
      .default([]),
    disallowedActionClasses: jsonb("disallowedActionClasses")
      .$type<string[]>()
      .notNull()
      .default([]),
    memoryScopeJson: jsonb("memoryScopeJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    budgetPolicyJson: jsonb("budgetPolicyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    escalationPolicyJson: jsonb("escalationPolicyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    approvalRequirementsJson: jsonb("approvalRequirementsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    modelCompatibilityJson: jsonb("modelCompatibilityJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    evaluationTargetsJson: jsonb("evaluationTargetsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    outcomeMemoryHook: varchar("outcomeMemoryHook", { length: 180 }).notNull(),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agent_registry_policy_bindings_registry_idx").on(t.registryId),
    index("agent_registry_policy_bindings_version_idx").on(t.versionId),
  ]
);

export type AgentRegistryPolicyBinding =
  typeof agentRegistryPolicyBindings.$inferSelect;
export type InsertAgentRegistryPolicyBinding =
  typeof agentRegistryPolicyBindings.$inferInsert;

export const agentRegistryRolloutBindings = pgTable(
  "agent_registry_rollout_bindings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    registryId: varchar("registryId", { length: 36 })
      .notNull()
      .references(() => agentRegistryRegistries.id, { onDelete: "cascade" }),
    versionId: varchar("versionId", { length: 36 })
      .notNull()
      .references(() => agentRegistryVersions.id, { onDelete: "cascade" }),
    tenantTargetId: varchar("tenantTargetId", { length: 36 }),
    teamTargetId: varchar("teamTargetId", { length: 36 }),
    queueTargetId: varchar("queueTargetId", { length: 36 }),
    workpackFamily: varchar("workpackFamily", { length: 120 }),
    environment: varchar("environment", { length: 64 }),
    shadowPercent: integer("shadowPercent").notNull().default(0),
    canaryPercent: integer("canaryPercent").notNull().default(0),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agent_registry_rollout_bindings_registry_idx").on(t.registryId),
    index("agent_registry_rollout_bindings_version_idx").on(t.versionId),
  ]
);

export type AgentRegistryRolloutBinding =
  typeof agentRegistryRolloutBindings.$inferSelect;
export type InsertAgentRegistryRolloutBinding =
  typeof agentRegistryRolloutBindings.$inferInsert;

export const agentRegistryPromotionReviews = pgTable(
  "agent_registry_promotion_reviews",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    registryId: varchar("registryId", { length: 36 })
      .notNull()
      .references(() => agentRegistryRegistries.id, { onDelete: "cascade" }),
    proposedVersionId: varchar("proposedVersionId", { length: 36 })
      .notNull()
      .references(() => agentRegistryVersions.id, { onDelete: "cascade" }),
    baselineVersionId: varchar("baselineVersionId", { length: 36 }),
    decision: varchar("decision", { length: 32 }).notNull(),
    reason: text("reason").notNull(),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agent_registry_promotion_reviews_registry_idx").on(
      t.registryId,
      t.createdAt
    ),
  ]
);

export type AgentRegistryPromotionReview =
  typeof agentRegistryPromotionReviews.$inferSelect;
export type InsertAgentRegistryPromotionReview =
  typeof agentRegistryPromotionReviews.$inferInsert;

export const agentRegistryOutcomeMemory = pgTable(
  "agent_registry_outcome_memory",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    registryId: varchar("registryId", { length: 36 })
      .notNull()
      .references(() => agentRegistryRegistries.id, { onDelete: "cascade" }),
    versionId: varchar("versionId", { length: 36 })
      .notNull()
      .references(() => agentRegistryVersions.id, { onDelete: "cascade" }),
    workloadClass: varchar("workloadClass", { length: 120 }).notNull(),
    selectedModelFamily: varchar("selectedModelFamily", { length: 120 }),
    outcome: varchar("outcome", { length: 32 }).notNull(),
    failureMode: varchar("failureMode", { length: 180 }),
    operatorEditsJson: jsonb("operatorEditsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    improvementNotes: text("improvementNotes").notNull().default(""),
    redactionState: varchar("redactionState", { length: 32 })
      .notNull()
      .default("redacted"),
    retentionTier: varchar("retentionTier", { length: 32 })
      .notNull()
      .default("standard"),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("agent_registry_outcome_memory_registry_idx").on(
      t.registryId,
      t.workloadClass,
      t.createdAt
    ),
    index("agent_registry_outcome_memory_version_idx").on(
      t.versionId,
      t.createdAt
    ),
  ]
);

export type AgentRegistryOutcomeMemory =
  typeof agentRegistryOutcomeMemory.$inferSelect;
export type InsertAgentRegistryOutcomeMemory =
  typeof agentRegistryOutcomeMemory.$inferInsert;

/**
 * run_snapshots — periodic state captures during active runs.
 */
export const runSnapshots = pgTable(
  "run_snapshots",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => teamRuns.id, { onDelete: "cascade" }),
    capturedAt: timestamp("capturedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    activeAssistantId: varchar("activeAssistantId", { length: 36 }),
    agentStatusesJson: jsonb("agentStatusesJson"),
    tokenUsageJson: jsonb("tokenUsageJson"),
    costJson: jsonb("costJson"),
    artifactCountJson: jsonb("artifactCountJson"),
    pendingApprovalsCount: integer("pendingApprovalsCount")
      .default(0)
      .notNull(),
  },
  t => [index("run_snapshots_run_captured_idx").on(t.runId, t.capturedAt)]
);

export type RunSnapshot = typeof runSnapshots.$inferSelect;
export type InsertRunSnapshot = typeof runSnapshots.$inferInsert;

/**
 * orchestrator_notifications — persistent notification records.
 */
export const orchestratorNotifications = pgTable(
  "orchestrator_notifications",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    teamId: varchar("teamId", { length: 36 }),
    roomId: varchar("roomId", { length: 36 }),
    runId: varchar("runId", { length: 36 }),
    notificationType: text("notificationType").notNull(),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    actionUrl: text("actionUrl"),
    isRead: boolean("isRead").default(false).notNull(),
    isDismissed: boolean("isDismissed").default(false).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("readAt", { withTimezone: true }),
  },
  t => [
    index("orchestrator_notifications_user_unread_idx").on(
      t.userId,
      t.isRead,
      t.createdAt
    ),
    index("orchestrator_notifications_tenant_created_idx").on(
      t.tenantId,
      t.createdAt
    ),
    index("idx_orch_notif_user_created").on(t.userId, t.createdAt),
  ]
);

export type OrchestratorNotification =
  typeof orchestratorNotifications.$inferSelect;
export type InsertOrchestratorNotification =
  typeof orchestratorNotifications.$inferInsert;

// ==========================================
// Virtual AI Office Orchestrator — Scoped Memory (Section 03)
// ==========================================

export const memoryOwnerTypeEnum = pgEnum("memory_owner_type", [
  "user",
  "agent",
  "team",
  "room",
  "project",
  "run",
]);
export const memoryKindEnum = pgEnum("memory_kind", [
  "fact",
  "rule",
  "preference",
  "decision",
  "note",
  "checklist",
  "artifact_note",
  "handoff_note",
  "episode",
]);
export const memoryVisibilityEnum = pgEnum("memory_visibility", [
  "private",
  "shared_team",
  "shared_room",
  "shared_project",
]);
export const memorySourceTypeEnum = pgEnum("memory_source_type", [
  "auto",
  "manual",
  "promoted",
]);

/**
 * scoped_memories — hierarchical memory store with scope isolation.
 * Supports keyword + vector (hybrid) retrieval via pgvector.
 */
export const scopedMemories = pgTable(
  "scoped_memories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    ownerType: memoryOwnerTypeEnum("ownerType").notNull(),
    ownerId: text("ownerId").notNull(),
    memoryKind: memoryKindEnum("memoryKind").notNull(),
    visibility: memoryVisibilityEnum("visibility").notNull().default("private"),
    sourceType: memorySourceTypeEnum("sourceType").notNull().default("auto"),
    sourceUserId: integer("sourceUserId"),
    sourceAssistantId: text("sourceAssistantId"),
    sourceRoomId: text("sourceRoomId"),
    projectId: varchar("projectId", { length: 100 }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    summary: text("summary"),
    tags: text("tags").array(),
    metadataJson: jsonb("metadataJson"),
    embedding: vector1536("embedding"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).default(
      "0.80"
    ),
    importance: integer("importance").default(5),
    reinforcementCount: integer("reinforcementCount").default(0),
    lastAccessedAt: timestamp("lastAccessedAt", { withTimezone: true }),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("scoped_memories_owner_created_idx").on(
      t.ownerType,
      t.ownerId,
      t.createdAt
    ),
    index("scoped_memories_tenant_kind_idx").on(t.tenantId, t.memoryKind),
  ]
);

export type ScopedMemory = typeof scopedMemories.$inferSelect;
export type InsertScopedMemory = typeof scopedMemories.$inferInsert;

/**
 * memory_promotions — audit trail for scope promotions.
 */
export const memoryPromotions = pgTable(
  "memory_promotions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    memoryId: text("memoryId")
      .notNull()
      .references(() => scopedMemories.id, { onDelete: "cascade" }),
    fromOwnerType: memoryOwnerTypeEnum("fromOwnerType").notNull(),
    fromOwnerId: text("fromOwnerId").notNull(),
    toOwnerType: memoryOwnerTypeEnum("toOwnerType").notNull(),
    toOwnerId: text("toOwnerId").notNull(),
    promotedByUserId: integer("promotedByUserId"),
    promotedByAssistantId: text("promotedByAssistantId"),
    reason: text("reason"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("memory_promotions_memory_idx").on(t.memoryId)]
);

export type MemoryPromotion = typeof memoryPromotions.$inferSelect;
export type InsertMemoryPromotion = typeof memoryPromotions.$inferInsert;

// ==========================================
// Virtual AI Office Orchestrator — Inter-Agent Communication (Section 09)
// ==========================================

export const interAgentChannelEnum = pgEnum("inter_agent_channel", [
  "system_broadcast",
  "system_control",
  "team_escalation",
  "system_direct",
  "system_context",
]);
export const interAgentSourceTypeEnum = pgEnum("inter_agent_source_type", [
  "team",
  "system",
  "external",
]);
export const interAgentTargetTypeEnum = pgEnum("inter_agent_target_type", [
  "room",
  "run",
  "team",
  "user",
  "all_active_runs",
]);
export const interAgentPriorityEnum = pgEnum("inter_agent_priority", [
  "low",
  "normal",
  "high",
  "critical",
]);
export const interAgentStatusEnum = pgEnum("inter_agent_status", [
  "delivered",
  "acknowledged",
]);
export const resourceStatusEnum = pgEnum("resource_status", [
  "healthy",
  "degraded",
  "down",
  "critical",
]);

/**
 * inter_agent_messages — messages between system agents and team agents.
 */
export const interAgentMessages = pgTable(
  "inter_agent_messages",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    channel: interAgentChannelEnum("channel").notNull(),
    sourceAgentType: interAgentSourceTypeEnum("sourceAgentType").notNull(),
    sourceAgentId: varchar("sourceAgentId", { length: 100 }).notNull(),
    targetType: interAgentTargetTypeEnum("targetType").notNull(),
    targetId: varchar("targetId", { length: 100 }),
    priority: interAgentPriorityEnum("priority").notNull().default("normal"),
    messageType: varchar("messageType", { length: 64 }).notNull(),
    payload: jsonb("payload"),
    displayMessage: text("displayMessage"),
    actionRequired: boolean("actionRequired").default(false).notNull(),
    status: interAgentStatusEnum("status").notNull().default("delivered"),
    acknowledgedAt: timestamp("acknowledgedAt", { withTimezone: true }),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    relatedIncidentId: integer("relatedIncidentId"),
    relatedRunId: varchar("relatedRunId", { length: 36 }),
    relatedRoomId: varchar("relatedRoomId", { length: 36 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("inter_agent_messages_target_created_idx").on(
      t.targetType,
      t.targetId,
      t.createdAt
    ),
    index("inter_agent_messages_incident_idx").on(t.relatedIncidentId),
    index("inter_agent_messages_run_idx").on(t.relatedRunId),
  ]
);

export type InterAgentMessage = typeof interAgentMessages.$inferSelect;
export type InsertInterAgentMessage = typeof interAgentMessages.$inferInsert;

/**
 * system_resource_state — current health status of system resources.
 */
export const systemResourceState = pgTable("system_resource_state", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }),
  resourceType: varchar("resourceType", { length: 32 }).notNull(),
  status: resourceStatusEnum("status").notNull(),
  stateJson: jsonb("stateJson"),
  updatedBy: varchar("updatedBy", { length: 64 }),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SystemResourceState = typeof systemResourceState.$inferSelect;
export type InsertSystemResourceState = typeof systemResourceState.$inferInsert;

// ==========================================
// Virtual AI Office Orchestrator — Automation Handoffs & External Intake (Section 16)
// ==========================================

export const handoffStatusEnum = pgEnum("handoff_status", [
  "pending",
  "approved",
  "rejected",
  "executing",
  "completed",
  "failed",
]);
export const handoffApprovalStateEnum = pgEnum("handoff_approval_state", [
  "not_required",
  "pending",
  "approved",
  "rejected",
]);
export const externalTaskStatusEnum = pgEnum("external_task_status", [
  "received",
  "awaiting_review",
  "approved",
  "rejected",
  "materialized",
  "failed",
]);
export const trustTierEnum = pgEnum("trust_tier", [
  "untrusted",
  "basic",
  "verified",
  "privileged",
]);

/**
 * automation_handoffs — cross-surface actions initiated by team agents.
 */
export const automationHandoffs = pgTable(
  "automation_handoffs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    teamId: varchar("teamId", { length: 36 }).notNull(),
    roomId: varchar("roomId", { length: 36 }).notNull(),
    runId: varchar("runId", { length: 36 }).notNull(),
    assistantId: varchar("assistantId", { length: 36 }).notNull(),
    destinationType: varchar("destinationType", { length: 50 }).notNull(),
    destinationId: varchar("destinationId", { length: 100 }),
    idempotencyKey: varchar("idempotencyKey", { length: 64 })
      .notNull()
      .default(sql`gen_random_uuid()::text`),
    dispatchTokenHash: varchar("dispatchTokenHash", { length: 64 }),
    callbackNonce: varchar("callbackNonce", { length: 64 }),
    callbackDeadlineAt: timestamp("callbackDeadlineAt", { withTimezone: true }),
    attemptCount: integer("attemptCount").notNull().default(0),
    lastAttemptAt: timestamp("lastAttemptAt", { withTimezone: true }),
    status: handoffStatusEnum("status").notNull().default("pending"),
    approvalState: handoffApprovalStateEnum("approvalState")
      .notNull()
      .default("pending"),
    requestPayloadJson: jsonb("requestPayloadJson"),
    resultPayloadJson: jsonb("resultPayloadJson"),
    approvedByUserId: integer("approvedByUserId"),
    errorDetail: text("errorDetail"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("automation_handoffs_run_idx").on(t.runId),
    index("automation_handoffs_team_idx").on(t.teamId),
    uniqueIndex("automation_handoffs_run_idempotency_idx").on(
      t.runId,
      t.idempotencyKey
    ),
  ]
);

export type AutomationHandoff = typeof automationHandoffs.$inferSelect;
export type InsertAutomationHandoff = typeof automationHandoffs.$inferInsert;

/**
 * external_task_sources — registered external systems that can submit tasks.
 */
export const externalTaskSources = pgTable(
  "external_task_sources",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    sourceType: varchar("sourceType", { length: 50 }).notNull(),
    trustTier: trustTierEnum("trustTier").notNull().default("untrusted"),
    configJson: jsonb("configJson"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("external_task_sources_tenant_idx").on(t.tenantId)]
);

export type ExternalTaskSource = typeof externalTaskSources.$inferSelect;

/**
 * external_task_inbox — incoming tasks from external systems.
 */
export const externalTaskInbox = pgTable(
  "external_task_inbox",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    sourceId: varchar("sourceId", { length: 36 })
      .notNull()
      .references(() => externalTaskSources.id),
    targetTeamId: varchar("targetTeamId", { length: 36 }),
    status: externalTaskStatusEnum("status").notNull().default("received"),
    priority: varchar("priority", { length: 20 }).default("normal"),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    payloadJson: jsonb("payloadJson"),
    materializedRoomId: varchar("materializedRoomId", { length: 36 }),
    materializedRunId: varchar("materializedRunId", { length: 36 }),
    reviewedByUserId: integer("reviewedByUserId"),
    errorDetail: text("errorDetail"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("external_task_inbox_tenant_status_idx").on(t.tenantId, t.status),
    index("external_task_inbox_source_idx").on(t.sourceId),
  ]
);

export type ExternalTaskInboxItem = typeof externalTaskInbox.$inferSelect;
export type InsertExternalTaskInboxItem = typeof externalTaskInbox.$inferInsert;

// ==================== Invite Code System ====================

/** Invite codes for controlled registration (admin-managed and user referral codes) */
export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: serial("id").primaryKey(),
    /** The invite code string (auto-generated or custom) */
    code: varchar("code", { length: 32 }).notNull().unique(),
    /** Display label for admin codes (e.g. "โค้ด Facebook", "โค้ด Event") */
    label: varchar("label", { length: 128 }),
    /** Code type: admin-created or user-referral */
    type: inviteCodeTypeEnum("type").notNull(),
    /** Tenant this code belongs to (null = legacy/global) */
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    /** User who owns/created this code */
    ownerId: integer("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Bonus credits given to the new user who registers with this code */
    bonusCreditsForNewUser: integer("bonusCreditsForNewUser")
      .default(0)
      .notNull(),
    /** Bonus credits given to the code owner when someone uses it (user referral) */
    bonusCreditsForOwner: integer("bonusCreditsForOwner").default(0).notNull(),
    /** Max number of times this code can be used (null = unlimited) */
    maxUses: integer("maxUses"),
    /** Current number of times this code has been used */
    currentUses: integer("currentUses").default(0).notNull(),
    /** Expiration date (null = never expires) */
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    /** Whether this code is currently active */
    isActive: boolean("isActive").default(true).notNull(),
    /** Admin description/notes */
    description: text("description"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("invite_codes_owner_idx").on(t.ownerId),
    index("invite_codes_type_active_idx").on(t.type, t.isActive),
    index("invite_codes_tenant_idx").on(t.tenantId),
  ]
);

export type InviteCode = typeof inviteCodes.$inferSelect;
export type InsertInviteCode = typeof inviteCodes.$inferInsert;

/** Tracks each use of an invite code */
export const inviteCodeUsage = pgTable(
  "invite_code_usage",
  {
    id: serial("id").primaryKey(),
    /** The invite code that was used */
    inviteCodeId: integer("inviteCodeId")
      .notNull()
      .references(() => inviteCodes.id, { onDelete: "cascade" }),
    /** The user who registered using this code */
    registeredUserId: integer("registeredUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Credits given to the registered user */
    creditsGivenToUser: integer("creditsGivenToUser").default(0).notNull(),
    /** Credits given to the code owner */
    creditsGivenToOwner: integer("creditsGivenToOwner").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("invite_code_usage_code_idx").on(t.inviteCodeId),
    index("invite_code_usage_user_idx").on(t.registeredUserId),
    uniqueIndex("invite_code_usage_code_user_unique").on(
      t.inviteCodeId,
      t.registeredUserId
    ),
  ]
);

/**
 * User LLM API Keys — encrypted storage for user-provided LLM provider keys.
 * Keys are encrypted with AES-256-GCM via crypto.ts (same as llmProviders.apiKeyEncrypted).
 * One key per provider per user, enforced by unique index.
 */
export const userLlmApiKeys = pgTable(
  "user_llm_api_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }),
    provider: varchar("provider", { length: 50 }).notNull(),
    apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
    keyHint: varchar("keyHint", { length: 8 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("user_llm_api_keys_user_provider_idx").on(t.userId, t.provider),
    index("user_llm_api_keys_user_idx").on(t.userId),
  ]
);

export type UserLlmApiKey = typeof userLlmApiKeys.$inferSelect;
export type InsertUserLlmApiKey = typeof userLlmApiKeys.$inferInsert;

// ==================== MCP Server Registry ====================

/**
 * MCP Server Registry — centralized management of MCP servers per tenant.
 * Replaces per-agent JSONB (agencyAgents.mcpServers) with normalized tables.
 * OAuth tokens stored in dedicated encrypted columns (not JSONB).
 */
export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    transportType: varchar("transport_type", { length: 20 })
      .notNull()
      .default("http"),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").notNull().default({}),
    // OAuth tokens in dedicated encrypted columns (CLAUDE.md encryption rules)
    oauthClientId: text("oauth_client_id"),
    oauthClientSecretEncrypted: text("oauth_client_secret_encrypted"),
    oauthAccessTokenEncrypted: text("oauth_access_token_encrypted"),
    oauthRefreshTokenEncrypted: text("oauth_refresh_token_encrypted"),
    oauthTokenExpiresAt: timestamp("oauth_token_expires_at", {
      withTimezone: true,
    }),
    // Non-secret OAuth metadata only
    oauthConfig: jsonb("oauth_config"),
    capabilities: jsonb("capabilities").default({ tools: true }),
    toolNamePrefix: boolean("tool_name_prefix").default(true),
    maxToolsExposed: integer("max_tools_exposed").default(50),
    timeoutSeconds: integer("timeout_seconds").default(30),
    endpointPath: varchar("endpoint_path", { length: 100 }).default("/rpc"),
    riskLevel: varchar("risk_level", { length: 10 }).notNull().default("high"),
    dataClassification: varchar("data_classification", { length: 20 }).default(
      "internal"
    ),
    configHash: varchar("config_hash", { length: 64 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: integer("approved_by").references(() => users.id),
    creditPerCall: numeric("credit_per_call", {
      precision: 10,
      scale: 2,
    }).default("1.0"),
    lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
    healthStatus: varchar("health_status", { length: 20 }).default("unknown"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer("created_by").references(() => users.id),
  },
  t => [
    uniqueIndex("mcp_servers_tenant_slug_unique").on(t.tenantId, t.slug),
    index("ix_mcp_servers_tenant").on(t.tenantId),
    index("ix_mcp_servers_enabled").on(t.tenantId, t.enabled),
  ]
);

export type McpServer = typeof mcpServers.$inferSelect;
export type InsertMcpServer = typeof mcpServers.$inferInsert;

/**
 * MCP Server Assignments — links MCP servers to tenants, agencies, or agents.
 * Supports scoped tool filtering (enable/disable specific tools per assignment).
 */
export const mcpServerAssignments = pgTable(
  "mcp_server_assignments",
  {
    id: serial("id").primaryKey(),
    mcpServerId: integer("mcp_server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 10 }).notNull(),
    targetId: varchar("target_id", { length: 36 }).notNull(),
    enabledToolNames: text("enabled_tool_names").array(),
    disabledToolNames: text("disabled_tool_names").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex("mcp_assignments_server_target_unique").on(
      t.mcpServerId,
      t.targetType,
      t.targetId
    ),
    index("ix_mcp_assignments_target").on(t.targetType, t.targetId),
  ]
);

export type McpServerAssignment = typeof mcpServerAssignments.$inferSelect;
export type InsertMcpServerAssignment =
  typeof mcpServerAssignments.$inferInsert;

// ==================== Social Channels ====================

export const uploadPostConnections = pgTable(
  "upload_post_connections",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
    apiKeyFingerprint: varchar("apiKeyFingerprint", { length: 128 }).notNull(),
    apiKeyHint: varchar("apiKeyHint", { length: 12 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    healthStatus: varchar("healthStatus", { length: 20 })
      .notNull()
      .default("unknown"),
    disclosureAcceptedAt: timestamp("disclosureAcceptedAt", {
      withTimezone: true,
    }),
    disclosurePolicyVersion: varchar("disclosurePolicyVersion", { length: 32 }),
    consentAcknowledgedByUserId: integer(
      "consentAcknowledgedByUserId"
    ).references(() => users.id, { onDelete: "set null" }),
    handshakeNonce: varchar("handshakeNonce", { length: 255 }),
    handshakeNonceExpiresAt: timestamp("handshakeNonceExpiresAt", {
      withTimezone: true,
    }),
    lastVerifiedAt: timestamp("lastVerifiedAt", { withTimezone: true }),
    lastHealthCheckAt: timestamp("lastHealthCheckAt", { withTimezone: true }),
    quotaRemaining: integer("quotaRemaining"),
    quotaLimit: integer("quotaLimit"),
    quotaResetAt: timestamp("quotaResetAt", { withTimezone: true }),
    queueSettings: jsonb("queueSettings").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_upload_post_connections_tenant").on(t.tenantId),
    index("idx_upload_post_connections_user").on(t.userId),
    index("idx_upload_post_connections_status").on(t.status),
    uniqueIndex("idx_upload_post_connections_fingerprint").on(
      t.tenantId,
      t.apiKeyFingerprint
    ),
  ]
);

export type UploadPostConnection = typeof uploadPostConnections.$inferSelect;
export type InsertUploadPostConnection =
  typeof uploadPostConnections.$inferInsert;

export const uploadPostProfiles = pgTable(
  "upload_post_profiles",
  {
    id: serial("id").primaryKey(),
    connectionId: integer("connectionId")
      .notNull()
      .references(() => uploadPostConnections.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(),
    platformPageId: varchar("platformPageId", { length: 255 }).notNull(),
    displayName: varchar("displayName", { length: 500 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_upload_post_profiles_tenant").on(t.tenantId),
    index("idx_upload_post_profiles_connection").on(t.connectionId),
    index("idx_upload_post_profiles_user").on(t.userId),
    uniqueIndex("idx_upload_post_profiles_unique").on(
      t.connectionId,
      t.platform,
      t.platformPageId
    ),
  ]
);

export type UploadPostProfile = typeof uploadPostProfiles.$inferSelect;
export type InsertUploadPostProfile = typeof uploadPostProfiles.$inferInsert;

export const uploadPostJobs = pgTable(
  "upload_post_jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: integer("connectionId")
      .notNull()
      .references(() => uploadPostConnections.id, { onDelete: "cascade" }),
    profileId: integer("profileId").references(() => uploadPostProfiles.id, {
      onDelete: "set null",
    }),
    platform: varchar("platform", { length: 50 }).notNull(),
    queueKey: varchar("queueKey", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    contentText: text("contentText"),
    contentLink: text("contentLink"),
    mediaRefs: jsonb("mediaRefs").$type<string[]>(),
    scheduledAt: timestamp("scheduledAt", { withTimezone: true }),
    publishedAt: timestamp("publishedAt", { withTimezone: true }),
    providerJobId: varchar("providerJobId", { length: 255 }),
    platformResults: jsonb("platformResults").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    metadataClearedAt: timestamp("metadataClearedAt", { withTimezone: true }),
    errorMessage: text("errorMessage"),
    lastSyncedAt: timestamp("lastSyncedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_upload_post_jobs_tenant_status").on(t.tenantId, t.status),
    index("idx_upload_post_jobs_connection_status").on(
      t.connectionId,
      t.status
    ),
    index("idx_upload_post_jobs_tenant_scheduled").on(
      t.tenantId,
      t.scheduledAt
    ),
    uniqueIndex("idx_upload_post_jobs_queue_key").on(t.tenantId, t.queueKey),
  ]
);

export type UploadPostJob = typeof uploadPostJobs.$inferSelect;
export type InsertUploadPostJob = typeof uploadPostJobs.$inferInsert;

export const socialProviderConnections = pgTable(
  "social_provider_connections",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    providerUserId: varchar("providerUserId", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    grantedScopes: json("grantedScopes").$type<string[]>(),
    encryptedAccessToken: text("encryptedAccessToken"),
    encryptedRefreshToken: text("encryptedRefreshToken"),
    tokenExpiresAt: timestamp("tokenExpiresAt", { withTimezone: true }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_social_provider_connections_tenant").on(t.tenantId),
    index("idx_social_provider_connections_user").on(t.userId),
  ]
);

export type SocialProviderConnection =
  typeof socialProviderConnections.$inferSelect;
export type InsertSocialProviderConnection =
  typeof socialProviderConnections.$inferInsert;

export const socialPages = pgTable(
  "social_pages",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectionId: integer("connectionId")
      .notNull()
      .references(() => socialProviderConnections.id, { onDelete: "cascade" }),
    providerPageId: varchar("providerPageId", { length: 255 }).notNull(),
    pageName: varchar("pageName", { length: 500 }),
    pageCategory: varchar("pageCategory", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    encryptedPageAccessToken: text("encryptedPageAccessToken"),
    tokenExpiresAt: timestamp("tokenExpiresAt", { withTimezone: true }),
    selectedForInbox: boolean("selectedForInbox").notNull().default(true),
    selectedForPublishing: boolean("selectedForPublishing")
      .notNull()
      .default(true),
    selectedForModeration: boolean("selectedForModeration")
      .notNull()
      .default(false),
    aiActionMode: varchar("aiActionMode", { length: 20 })
      .notNull()
      .default("draft_only"),
    autoSendConfidenceThreshold: doublePrecision("autoSendConfidenceThreshold")
      .notNull()
      .default(0.95),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_social_pages_tenant").on(t.tenantId),
    index("idx_social_pages_connection").on(t.connectionId),
  ]
);

export type SocialPage = typeof socialPages.$inferSelect;
export type InsertSocialPage = typeof socialPages.$inferInsert;

export const socialWebhookSubscriptions = pgTable(
  "social_webhook_subscriptions",
  {
    id: serial("id").primaryKey(),
    pageId: integer("pageId")
      .notNull()
      .references(() => socialPages.id, { onDelete: "cascade" }),
    subscriptionStatus: varchar("subscriptionStatus", { length: 20 })
      .notNull()
      .default("pending"),
    subscribedFields: json("subscribedFields").$type<string[]>(),
    lastVerifiedAt: timestamp("lastVerifiedAt", { withTimezone: true }),
    lastDeliveryAt: timestamp("lastDeliveryAt", { withTimezone: true }),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);

export type SocialWebhookSubscription =
  typeof socialWebhookSubscriptions.$inferSelect;
export type InsertSocialWebhookSubscription =
  typeof socialWebhookSubscriptions.$inferInsert;

export const socialConversations = pgTable(
  "social_conversations",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    pageId: integer("pageId")
      .notNull()
      .references(() => socialPages.id, { onDelete: "cascade" }),
    providerConversationId: varchar("providerConversationId", { length: 255 }),
    channelType: varchar("channelType", { length: 50 })
      .notNull()
      .default("messenger"),
    customerExternalId: varchar("customerExternalId", {
      length: 255,
    }).notNull(),
    customerDisplayName: varchar("customerDisplayName", { length: 500 }),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    assignedToUserId: integer("assignedToUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    priority: integer("priority").notNull().default(0),
    lastMessageAt: timestamp("lastMessageAt", { withTimezone: true }),
    lastInboundAt: timestamp("lastInboundAt", { withTimezone: true }),
    lastOutboundAt: timestamp("lastOutboundAt", { withTimezone: true }),
    unreadCount: integer("unreadCount").notNull().default(0),
    labels: json("labels").$type<string[]>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("idx_social_conversations_page_customer").on(
      t.pageId,
      t.customerExternalId
    ),
    index("idx_social_conversations_tenant_page").on(t.tenantId, t.pageId),
    index("idx_social_conversations_status_last_msg").on(
      t.status,
      t.lastMessageAt
    ),
    index("idx_social_conversations_tenant_status").on(t.tenantId, t.status),
  ]
);

export type SocialConversation = typeof socialConversations.$inferSelect;
export type InsertSocialConversation = typeof socialConversations.$inferInsert;

export const socialMessages = pgTable(
  "social_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: integer("conversationId")
      .notNull()
      .references(() => socialConversations.id, { onDelete: "cascade" }),
    pageId: integer("pageId")
      .notNull()
      .references(() => socialPages.id, { onDelete: "cascade" }),
    providerMessageId: varchar("providerMessageId", { length: 255 }),
    direction: varchar("direction", { length: 10 }).notNull(),
    senderType: varchar("senderType", { length: 20 }).notNull(),
    senderExternalId: varchar("senderExternalId", { length: 255 }),
    senderUserId: integer("senderUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    messageType: varchar("messageType", { length: 30 })
      .notNull()
      .default("text"),
    body: text("body"),
    payload: json("payload").$type<Record<string, unknown>>(),
    deliveryStatus: varchar("deliveryStatus", { length: 20 })
      .notNull()
      .default("sent"),
    errorMessage: text("errorMessage"),
    sentAt: timestamp("sentAt", { withTimezone: true }),
    receivedAt: timestamp("receivedAt", { withTimezone: true }),
    workflowTriggerStatus: varchar("workflowTriggerStatus", { length: 20 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_social_messages_conversation_created").on(
      t.conversationId,
      t.createdAt
    ),
    uniqueIndex("idx_social_messages_provider_msg_id").on(t.providerMessageId),
  ]
);

export type SocialMessage = typeof socialMessages.$inferSelect;
export type InsertSocialMessage = typeof socialMessages.$inferInsert;

export const socialPosts = pgTable(
  "social_posts",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    pageId: integer("pageId")
      .notNull()
      .references(() => socialPages.id, { onDelete: "cascade" }),
    providerPostId: varchar("providerPostId", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    contentText: text("contentText"),
    contentLink: text("contentLink"),
    mediaRefs: json("mediaRefs").$type<string[]>(),
    scheduledAt: timestamp("scheduledAt", { withTimezone: true }),
    publishedAt: timestamp("publishedAt", { withTimezone: true }),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByUserId: integer("approvedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    errorMessage: text("errorMessage"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_social_posts_tenant_status").on(t.tenantId, t.status),
    index("idx_social_posts_page_scheduled").on(t.pageId, t.scheduledAt),
  ]
);

export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = typeof socialPosts.$inferInsert;

export const socialComments = pgTable(
  "social_comments",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    pageId: integer("pageId")
      .notNull()
      .references(() => socialPages.id, { onDelete: "cascade" }),
    providerCommentId: varchar("providerCommentId", { length: 255 }),
    providerObjectId: varchar("providerObjectId", { length: 255 }),
    parentCommentId: integer("parentCommentId").references(
      (): AnyPgColumn => socialComments.id,
      { onDelete: "set null" }
    ),
    authorExternalId: varchar("authorExternalId", { length: 255 }),
    authorDisplayName: varchar("authorDisplayName", { length: 500 }),
    body: text("body"),
    status: varchar("status", { length: 20 }).notNull().default("visible"),
    lastAction: varchar("lastAction", { length: 20 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_social_comments_page_created").on(t.pageId, t.createdAt),
    uniqueIndex("idx_social_comments_provider_id").on(t.providerCommentId),
  ]
);

export type SocialComment = typeof socialComments.$inferSelect;
export type InsertSocialComment = typeof socialComments.$inferInsert;

export const socialCommentActions = pgTable("social_comment_actions", {
  id: serial("id").primaryKey(),
  commentId: integer("commentId")
    .notNull()
    .references(() => socialComments.id, { onDelete: "cascade" }),
  actionType: varchar("actionType", { length: 20 }).notNull(),
  performedByUserId: integer("performedByUserId").references(() => users.id, {
    onDelete: "set null",
  }),
  performedBySystem: boolean("performedBySystem").notNull().default(false),
  providerResult: json("providerResult").$type<Record<string, unknown>>(),
  status: varchar("status", { length: 20 }).notNull().default("completed"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SocialCommentAction = typeof socialCommentActions.$inferSelect;
export type InsertSocialCommentAction =
  typeof socialCommentActions.$inferInsert;

export const socialAutomationRules = pgTable(
  "social_automation_rules",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    pageId: integer("pageId").references(() => socialPages.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    isEnabled: boolean("isEnabled").notNull().default(false),
    triggerType: varchar("triggerType", { length: 50 }).notNull(),
    conditions: json("conditions").$type<Record<string, unknown>>(),
    actionMode: varchar("actionMode", { length: 20 })
      .notNull()
      .default("draft_only"),
    policyConfig: json("policyConfig").$type<Record<string, unknown>>(),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("idx_social_automation_rules_tenant").on(t.tenantId)]
);

export type SocialAutomationRule = typeof socialAutomationRules.$inferSelect;
export type InsertSocialAutomationRule =
  typeof socialAutomationRules.$inferInsert;

export const socialHumanApprovals = pgTable(
  "social_human_approvals",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    pageId: integer("pageId")
      .notNull()
      .references(() => socialPages.id, { onDelete: "cascade" }),
    entityType: varchar("entityType", { length: 50 }).notNull(),
    entityId: integer("entityId").notNull(),
    proposedContent: text("proposedContent"),
    confidence: doublePrecision("confidence"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    requestedBySystem: boolean("requestedBySystem").notNull().default(true),
    reviewedByUserId: integer("reviewedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    decisionNote: text("decisionNote"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_social_human_approvals_tenant_status").on(
      t.tenantId,
      t.status,
      t.createdAt
    ),
  ]
);

export type SocialHumanApproval = typeof socialHumanApprovals.$inferSelect;
export type InsertSocialHumanApproval =
  typeof socialHumanApprovals.$inferInsert;

export const socialWebhookEventsRaw = pgTable(
  "social_webhook_events_raw",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }),
    provider: varchar("provider", { length: 50 }).notNull(),
    pageId: integer("pageId"),
    deliveryId: varchar("deliveryId", { length: 255 }).notNull(),
    eventType: varchar("eventType", { length: 100 }),
    payload: json("payload").$type<Record<string, unknown>>(),
    headers: json("headers").$type<Record<string, string>>(),
    receivedAt: timestamp("receivedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processingStatus: varchar("processingStatus", { length: 20 })
      .notNull()
      .default("pending"),
    errorMessage: text("errorMessage"),
  },
  t => [
    index("idx_social_webhook_events_raw_status").on(
      t.processingStatus,
      t.receivedAt
    ),
    uniqueIndex("idx_social_webhook_events_raw_provider_delivery").on(
      t.provider,
      t.deliveryId
    ),
  ]
);

export type SocialWebhookEventRaw = typeof socialWebhookEventsRaw.$inferSelect;
export type InsertSocialWebhookEventRaw =
  typeof socialWebhookEventsRaw.$inferInsert;

// ---------------------------------------------------------------------------
// Monitoring System Tables
// ---------------------------------------------------------------------------

export const monitoringChecks = pgTable(
  "monitoring_checks",
  {
    id: serial("id").primaryKey(),
    checkType: text("checkType").notNull(), // "health_check" | "crash_monitor" | "celery_health_monitor" | "memory_check"
    status: text("status").notNull(), // "ok" | "warning" | "critical" | "error"
    details: json("details").$type<Record<string, unknown>>(),
    alertSent: boolean("alertSent").notNull().default(false),
    alertChannel: text("alertChannel"), // "slack" | "discord" | "webhook" | "log" | null
    source: text("source").notNull(), // "cron_script" | "celery_task" | "guardian"
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_monitoring_checks_check_type").on(t.checkType),
    index("idx_monitoring_checks_status").on(t.status),
    index("idx_monitoring_checks_created_at").on(t.createdAt),
  ]
);

export type MonitoringCheck = typeof monitoringChecks.$inferSelect;
export type InsertMonitoringCheck = typeof monitoringChecks.$inferInsert;

export const monitoringAlerts = pgTable(
  "monitoring_alerts",
  {
    id: serial("id").primaryKey(),
    severity: text("severity").notNull(), // "info" | "warning" | "error" | "critical"
    title: text("title").notNull(),
    message: text("message").notNull(),
    channel: text("channel").notNull(), // "slack" | "discord" | "webhook" | "log"
    acknowledged: boolean("acknowledged").notNull().default(false),
    acknowledgedBy: integer("acknowledgedBy"), // plain int, no FK
    acknowledgedAt: timestamp("acknowledgedAt", { withTimezone: true }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_monitoring_alerts_severity").on(t.severity),
    index("idx_monitoring_alerts_acknowledged").on(t.acknowledged),
    index("idx_monitoring_alerts_created_at").on(t.createdAt),
  ]
);

export type MonitoringAlert = typeof monitoringAlerts.$inferSelect;
export type InsertMonitoringAlert = typeof monitoringAlerts.$inferInsert;

export const systemMetricsHistory = pgTable(
  "system_metrics_history",
  {
    id: serial("id").primaryKey(),
    memoryUsedMb: integer("memoryUsedMb").notNull(),
    memoryTotalMb: integer("memoryTotalMb").notNull(),
    memoryPercent: real("memoryPercent").notNull(),
    cpuPercent: real("cpuPercent"),
    diskUsedGb: real("diskUsedGb"),
    diskTotalGb: real("diskTotalGb"),
    serviceStatuses: json("serviceStatuses").$type<Record<string, string>>(),
    processRestartCounts: json("processRestartCounts").$type<
      Record<string, number>
    >(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("idx_system_metrics_history_created_at").on(t.createdAt)]
);

export type SystemMetricsHistory = typeof systemMetricsHistory.$inferSelect;
export type InsertSystemMetricsHistory =
  typeof systemMetricsHistory.$inferInsert;

// ---------------------------------------------------------------------------
// Marketplace Capture Tables
// ---------------------------------------------------------------------------

export const marketplaceExtensionPairings = pgTable(
  "marketplace_extension_pairings",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    extensionId: varchar("extensionId", { length: 160 }),
    origin: text("origin"),
    deviceIdHash: varchar("deviceIdHash", { length: 64 }),
    tokenJti: varchar("tokenJti", { length: 128 }),
    status: marketplacePairingStatusEnum("status").notNull().default("active"),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_marketplace_extension_pairings_user").on(t.userId, t.createdAt),
    index("idx_marketplace_extension_pairings_status").on(
      t.status,
      t.expiresAt
    ),
    index("idx_marketplace_extension_pairings_device").on(
      t.deviceIdHash,
      t.status
    ),
  ]
);

export const marketplaceCaptureSessions = pgTable(
  "marketplace_capture_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    platform: marketplacePlatformEnum("platform").notNull(),
    pageType: marketplacePageTypeEnum("pageType").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    affiliateUrl: text("affiliateUrl"),
    pageTitle: text("pageTitle"),
    externalProductId: varchar("externalProductId", { length: 128 }),
    externalShopId: varchar("externalShopId", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull().default("captured"),
    rawDomText: text("rawDomText"),
    rawPayloadJson: jsonb("rawPayloadJson").$type<Record<string, unknown>>(),
    htmlBlocksJson: jsonb("htmlBlocksJson").$type<unknown[]>(),
    imageCandidatesJson: jsonb("imageCandidatesJson").$type<unknown[]>(),
    llmResultJson: jsonb("llmResultJson").$type<Record<string, unknown>>(),
    normalizedResultJson: jsonb("normalizedResultJson").$type<
      Record<string, unknown>
    >(),
    confidenceJson: jsonb("confidenceJson").$type<Record<string, unknown>>(),
    validationWarningsJson: jsonb("validationWarningsJson").$type<unknown[]>(),
    categoryContextJson: jsonb("categoryContextJson").$type<
      Record<string, unknown>
    >(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_marketplace_capture_sessions_user").on(t.userId, t.createdAt),
    index("idx_marketplace_capture_sessions_platform_product").on(
      t.platform,
      t.externalProductId
    ),
    index("idx_marketplace_capture_sessions_tenant").on(
      t.tenantId,
      t.createdAt
    ),
    uniqueIndex("idx_marketplace_capture_sessions_user_source_unique")
      .on(t.userId, t.platform, t.externalProductId, t.sourceUrl)
      .where(
        sql`"externalProductId" IS NOT NULL AND "status" NOT IN ('confirmed', 'discarded')`
      ),
    uniqueIndex("idx_marketplace_capture_sessions_user_product_pair_unique")
      .on(t.userId, t.platform, t.externalShopId, t.externalProductId)
      .where(
        sql`"externalShopId" IS NOT NULL AND "externalProductId" IS NOT NULL AND "status" NOT IN ('confirmed', 'discarded')`
      ),
  ]
);

export const marketplaceCaptureAssets = pgTable(
  "marketplace_capture_assets",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    captureId: varchar("captureId", { length: 64 })
      .notNull()
      .references(() => marketplaceCaptureSessions.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    kind: marketplaceAssetKindEnum("kind").notNull(),
    section: varchar("section", { length: 64 }),
    storageKey: text("storageKey").notNull(),
    url: text("url").notNull(),
    sourceUrl: text("sourceUrl"),
    contentType: varchar("contentType", { length: 128 }),
    byteSize: integer("byteSize"),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sortOrder").default(0),
    metadataJson: jsonb("metadataJson").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_marketplace_capture_assets_capture").on(
      t.captureId,
      t.sortOrder
    ),
    index("idx_marketplace_capture_assets_user").on(t.userId, t.createdAt),
    check(
      "marketplace_capture_assets_byte_size_positive",
      sql`${t.byteSize} IS NULL OR ${t.byteSize} >= 0`
    ),
    check(
      "marketplace_capture_assets_dimensions_positive",
      sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`
    ),
  ]
);

export const marketplaceCandidateBatches = pgTable(
  "marketplace_candidate_batches",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    platform: marketplacePlatformEnum("platform").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    categoryName: text("categoryName"),
    sortMode: varchar("sortMode", { length: 100 }),
    filtersJson: jsonb("filtersJson").$type<Record<string, unknown>>(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_marketplace_candidate_batches_user").on(t.userId, t.createdAt),
    check(
      "marketplace_candidate_batches_count_nonnegative",
      sql`${t.count} >= 0`
    ),
  ]
);

export const marketplaceCandidateItems = pgTable(
  "marketplace_candidate_items",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    batchId: varchar("batchId", { length: 64 })
      .notNull()
      .references(() => marketplaceCandidateBatches.id, {
        onDelete: "cascade",
      }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: marketplacePlatformEnum("platform").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    affiliateUrl: text("affiliateUrl"),
    externalProductId: varchar("externalProductId", { length: 128 }),
    externalShopId: varchar("externalShopId", { length: 128 }),
    title: text("title").notNull(),
    priceText: varchar("priceText", { length: 128 }),
    soldCountText: varchar("soldCountText", { length: 128 }),
    discountText: varchar("discountText", { length: 64 }),
    imageUrl: text("imageUrl"),
    badgesJson: jsonb("badgesJson").$type<string[]>(),
    score: integer("score").notNull().default(0),
    scoreReasonsJson: jsonb("scoreReasonsJson").$type<string[]>(),
    position: integer("position").default(0),
    rawJson: jsonb("rawJson").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_marketplace_candidate_items_batch").on(t.batchId, t.score),
    index("idx_marketplace_candidate_items_user").on(t.userId, t.createdAt),
    check(
      "marketplace_candidate_items_score_bounds",
      sql`${t.score} >= 0 AND ${t.score} <= 100`
    ),
  ]
);

export const marketplaceProducts = pgTable(
  "marketplace_products",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    captureId: varchar("captureId", { length: 64 }).references(
      () => marketplaceCaptureSessions.id,
      { onDelete: "set null" }
    ),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    platform: marketplacePlatformEnum("platform").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    affiliateUrl: text("affiliateUrl"),
    externalProductId: varchar("externalProductId", { length: 128 }),
    externalShopId: varchar("externalShopId", { length: 128 }),
    productName: text("productName").notNull(),
    brand: text("brand"),
    shopName: text("shopName"),
    isMall: boolean("isMall"),
    priceCurrent: numeric("priceCurrent", { precision: 12, scale: 2 }),
    priceOriginal: numeric("priceOriginal", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 16 }).default("THB"),
    discountText: varchar("discountText", { length: 64 }),
    commissionRatePercent: numeric("commissionRatePercent", {
      precision: 5,
      scale: 2,
    }),
    productCategory: varchar("productCategory", { length: 64 }),
    ratingScore: numeric("ratingScore", { precision: 4, scale: 2 }),
    reviewCountText: varchar("reviewCountText", { length: 128 }),
    soldCountText: varchar("soldCountText", { length: 128 }),
    soldCountNormalized: integer("soldCountNormalized"),
    descriptionText: text("descriptionText"),
    descriptionJson: jsonb("descriptionJson").$type<Record<string, unknown>>(),
    specsJson: jsonb("specsJson").$type<Record<string, unknown>>(),
    platformRawJson: jsonb("platformRawJson").$type<Record<string, unknown>>(),
    coverImageAssetId: varchar("coverImageAssetId", { length: 64 }).references(
      () => marketplaceCaptureAssets.id,
      { onDelete: "set null" }
    ),
    status: varchar("status", { length: 32 }).default("active"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_marketplace_products_user").on(t.userId, t.createdAt),
    index("idx_marketplace_products_platform_product").on(
      t.platform,
      t.externalProductId
    ),
    index("idx_marketplace_products_tenant").on(t.tenantId, t.createdAt),
    uniqueIndex("idx_marketplace_products_user_product_unique")
      .on(t.userId, t.platform, t.externalProductId)
      .where(sql`"externalProductId" IS NOT NULL`),
    uniqueIndex("idx_marketplace_products_user_product_pair_unique")
      .on(t.userId, t.platform, t.externalShopId, t.externalProductId)
      .where(
        sql`"externalShopId" IS NOT NULL AND "externalProductId" IS NOT NULL`
      ),
    check(
      "marketplace_products_price_nonnegative",
      sql`(${t.priceCurrent} IS NULL OR ${t.priceCurrent} >= 0) AND (${t.priceOriginal} IS NULL OR ${t.priceOriginal} >= 0)`
    ),
    check(
      "marketplace_products_commission_rate_bounds",
      sql`${t.commissionRatePercent} IS NULL OR (${t.commissionRatePercent} >= 0 AND ${t.commissionRatePercent} <= 100)`
    ),
    check(
      "marketplace_products_rating_bounds",
      sql`${t.ratingScore} IS NULL OR (${t.ratingScore} >= 0 AND ${t.ratingScore} <= 5)`
    ),
    check(
      "marketplace_products_sold_count_nonnegative",
      sql`${t.soldCountNormalized} IS NULL OR ${t.soldCountNormalized} >= 0`
    ),
  ]
);

export const marketplaceProductImages = pgTable(
  "marketplace_product_images",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    productId: varchar("productId", { length: 64 })
      .notNull()
      .references(() => marketplaceProducts.id, { onDelete: "cascade" }),
    captureAssetId: varchar("captureAssetId", { length: 64 }).references(
      () => marketplaceCaptureAssets.id,
      { onDelete: "set null" }
    ),
    type: marketplaceProductImageTypeEnum("type").notNull(),
    url: text("url").notNull(),
    storageKey: text("storageKey"),
    originalSourceUrl: text("originalSourceUrl"),
    sortOrder: integer("sortOrder").default(0),
    width: integer("width"),
    height: integer("height"),
    metadataJson: jsonb("metadataJson").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_marketplace_product_images_product").on(
      t.productId,
      t.sortOrder
    ),
    check(
      "marketplace_product_images_dimensions_positive",
      sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`
    ),
  ]
);

export const marketplaceProductPriceSnapshots = pgTable(
  "marketplace_product_price_snapshots",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    productId: varchar("productId", { length: 64 })
      .notNull()
      .references(() => marketplaceProducts.id, { onDelete: "cascade" }),
    captureId: varchar("captureId", { length: 64 }).references(
      () => marketplaceCaptureSessions.id,
      { onDelete: "set null" }
    ),
    capturedByUserId: integer("capturedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    priceCurrent: numeric("priceCurrent", { precision: 12, scale: 2 }),
    priceOriginal: numeric("priceOriginal", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 16 }).default("THB"),
    discountText: varchar("discountText", { length: 64 }),
    commissionRatePercent: numeric("commissionRatePercent", {
      precision: 5,
      scale: 2,
    }),
    ratingScore: numeric("ratingScore", { precision: 4, scale: 2 }),
    reviewCountText: varchar("reviewCountText", { length: 128 }),
    reviewCountNormalized: integer("reviewCountNormalized"),
    soldCountText: varchar("soldCountText", { length: 128 }),
    soldCountNormalized: integer("soldCountNormalized"),
    capturedAt: timestamp("capturedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("idx_marketplace_product_price_snapshots_product").on(
      t.productId,
      t.capturedAt
    ),
    index("idx_marketplace_product_price_snapshots_user").on(
      t.capturedByUserId,
      t.capturedAt
    ),
    check(
      "marketplace_price_snapshots_price_nonnegative",
      sql`(${t.priceCurrent} IS NULL OR ${t.priceCurrent} >= 0) AND (${t.priceOriginal} IS NULL OR ${t.priceOriginal} >= 0)`
    ),
    check(
      "marketplace_price_snapshots_commission_rate_bounds",
      sql`${t.commissionRatePercent} IS NULL OR (${t.commissionRatePercent} >= 0 AND ${t.commissionRatePercent} <= 100)`
    ),
    check(
      "marketplace_price_snapshots_sold_count_nonnegative",
      sql`${t.soldCountNormalized} IS NULL OR ${t.soldCountNormalized} >= 0`
    ),
    check(
      "marketplace_price_snapshots_review_count_nonnegative",
      sql`${t.reviewCountNormalized} IS NULL OR ${t.reviewCountNormalized} >= 0`
    ),
    check(
      "marketplace_price_snapshots_rating_bounds",
      sql`${t.ratingScore} IS NULL OR (${t.ratingScore} >= 0 AND ${t.ratingScore} <= 5)`
    ),
  ]
);

export const marketplaceProductGroupShares = pgTable(
  "marketplace_product_group_shares",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    productId: varchar("productId", { length: 64 })
      .notNull()
      .references(() => marketplaceProducts.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    groupId: integer("groupId")
      .notNull()
      .references(() => userGroups.id, { onDelete: "cascade" }),
    sharedByUserId: integer("sharedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: marketplacePlatformEnum("platform").notNull(),
    permission: varchar("permission", { length: 32 })
      .notNull()
      .default("read_update"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("idx_marketplace_product_group_shares_unique").on(
      t.productId,
      t.groupId
    ),
    index("idx_marketplace_product_group_shares_group").on(
      t.tenantId,
      t.groupId,
      t.platform
    ),
    index("idx_marketplace_product_group_shares_product").on(t.productId),
  ]
);

export const marketplaceProductAffiliateLinks = pgTable(
  "marketplace_product_affiliate_links",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    productId: varchar("productId", { length: 64 })
      .notNull()
      .references(() => marketplaceProducts.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    affiliateUrl: text("affiliateUrl"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("idx_marketplace_product_affiliate_links_unique").on(
      t.productId,
      t.userId
    ),
    index("idx_marketplace_product_affiliate_links_user").on(
      t.userId,
      t.updatedAt
    ),
  ]
);

export const marketplaceCaptureInsights = pgTable(
  "marketplace_capture_insights",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, {
      onDelete: "set null",
    }),
    captureId: varchar("captureId", { length: 64 }).references(
      () => marketplaceCaptureSessions.id,
      { onDelete: "cascade" }
    ),
    productId: varchar("productId", { length: 64 }).references(
      () => marketplaceProducts.id,
      { onDelete: "set null" }
    ),
    platform: marketplacePlatformEnum("platform").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    insightType: varchar("insightType", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ready"),
    schemaVersion: varchar("schemaVersion", { length: 16 })
      .notNull()
      .default("1.0"),
    payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull(),
    semanticKey: varchar("semanticKey", { length: 160 }),
    parentInsightIdsJson: jsonb("parentInsightIdsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, unknown>>()
      .notNull(),
    rawCaptureJson: jsonb("rawCaptureJson").$type<Record<string, unknown>>(),
    rawCaptureIncluded: boolean("rawCaptureIncluded").notNull().default(false),
    storytellingReadiness: varchar("storytellingReadiness", { length: 64 }),
    claimResolutionsJson: jsonb("claimResolutionsJson")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    extensionVersion: varchar("extensionVersion", { length: 80 }),
    insightCreatedAt: timestamp("insightCreatedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("idx_marketplace_capture_insights_idempotency").on(
      t.userId,
      sql`COALESCE(${t.tenantId}, 'personal')`,
      t.idempotencyKey
    ),
    uniqueIndex("idx_marketplace_capture_insights_semantic")
      .on(t.userId, sql`COALESCE(${t.tenantId}, 'personal')`, t.semanticKey)
      .where(sql`${t.semanticKey} IS NOT NULL`),
    index("idx_marketplace_capture_insights_capture").on(
      t.captureId,
      t.createdAt
    ),
    index("idx_marketplace_capture_insights_product").on(
      t.productId,
      t.createdAt
    ),
    index("idx_marketplace_capture_insights_user").on(t.userId, t.createdAt),
    index("idx_marketplace_capture_insights_readiness").on(
      t.userId,
      t.storytellingReadiness
    ),
  ]
);

export const marketplaceAutoReviewRuns = pgTable(
  "marketplace_auto_review_runs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: varchar("productId", { length: 64 })
      .notNull()
      .references(() => marketplaceProducts.id, { onDelete: "cascade" }),
    productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
    outputMode: varchar("outputMode", { length: 32 }).notNull(),
    frameStrategy: varchar("frameStrategy", { length: 40 }).notNull(),
    status: varchar("status", { length: 32 }).default("queued").notNull(),
    currentStage: varchar("currentStage", { length: 64 })
      .default("queued")
      .notNull(),
    stageIndex: integer("stageIndex").default(0).notNull(),
    stageCount: integer("stageCount").default(0).notNull(),
    selectedConceptId: varchar("selectedConceptId", { length: 128 }),
    storyboardReviewId: varchar("storyboardReviewId", { length: 128 }),
    videoEditorProjectId: varchar("videoEditorProjectId", { length: 128 }),
    renderJobId: varchar("renderJobId", { length: 128 }),
    resultLibraryItemId: integer("resultLibraryItemId"),
    resultJson: jsonb("resultJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    errorMessage: text("errorMessage"),
    idempotencyKey: varchar("idempotencyKey", { length: 192 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
  },
  t => [
    uniqueIndex("marketplace_auto_review_runs_idempotency_unique").on(
      t.userId,
      t.idempotencyKey
    ),
    index("marketplace_auto_review_runs_user_product_status_idx").on(
      t.userId,
      t.productId,
      t.status,
      t.updatedAt
    ),
    index("marketplace_auto_review_runs_product_idx").on(
      t.productId,
      t.createdAt
    ),
    index("marketplace_auto_review_runs_user_status_idx").on(
      t.userId,
      t.status,
      t.updatedAt
    ),
    index("marketplace_auto_review_runs_production_idx").on(t.productionRunId),
  ]
);

export const marketplaceAutoReviewStages = pgTable(
  "marketplace_auto_review_stages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: varchar("runId", { length: 64 })
      .notNull()
      .references(() => marketplaceAutoReviewRuns.id, { onDelete: "cascade" }),
    stageKey: varchar("stageKey", { length: 64 }).notNull(),
    stageOrder: integer("stageOrder").notNull(),
    status: varchar("status", { length: 32 }).default("queued").notNull(),
    providerTaskIdsJson: jsonb("providerTaskIdsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    outputJson: jsonb("outputJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_auto_review_stages_unique").on(
      t.runId,
      t.stageKey
    ),
    index("marketplace_auto_review_stages_run_idx").on(t.runId, t.stageOrder),
  ]
);

export const marketplaceAutoReviewRunLeases = pgTable(
  "marketplace_auto_review_run_leases",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    runId: varchar("runId", { length: 64 })
      .notNull()
      .references(() => marketplaceAutoReviewRuns.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stageKey: varchar("stageKey", { length: 64 }).notNull(),
    ownerToken: varchar("ownerToken", { length: 256 }).notNull(),
    schedulerSource: varchar("schedulerSource", { length: 128 }),
    status: varchar("status", { length: 32 }).default("claimed").notNull(),
    claimedAt: timestamp("claimedAt", { withTimezone: true }).notNull(),
    heartbeatAt: timestamp("heartbeatAt", { withTimezone: true }),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    releasedAt: timestamp("releasedAt", { withTimezone: true }),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("marketplace_auto_review_run_leases_run_idx").on(
      t.runId,
      t.expiresAt
    ),
    index("marketplace_auto_review_run_leases_owner_idx").on(t.ownerToken),
    index("marketplace_auto_review_run_leases_status_idx").on(
      t.status,
      t.expiresAt
    ),
  ]
);

export const marketplaceAutoReviewStageAttempts = pgTable(
  "marketplace_auto_review_stage_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: varchar("runId", { length: 64 })
      .notNull()
      .references(() => marketplaceAutoReviewRuns.id, { onDelete: "cascade" }),
    stageKey: varchar("stageKey", { length: 64 }).notNull(),
    attemptKey: varchar("attemptKey", { length: 192 }).notNull(),
    attemptNumber: integer("attemptNumber").default(1).notNull(),
    status: varchar("status", { length: 40 }).default("running").notNull(),
    reasonCode: varchar("reasonCode", { length: 160 }),
    providerTaskRefsJson: jsonb("providerTaskRefsJson")
      .$type<Record<string, any>[]>()
      .default([])
      .notNull(),
    creditRefsJson: jsonb("creditRefsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    repairDecisionJson: jsonb("repairDecisionJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    artifactRefsJson: jsonb("artifactRefsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    evidenceJson: jsonb("evidenceJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    startedAt: timestamp("startedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_auto_review_stage_attempts_key_unique").on(
      t.runId,
      t.attemptKey
    ),
    index("marketplace_auto_review_stage_attempts_stage_idx").on(
      t.runId,
      t.stageKey,
      t.updatedAt
    ),
    index("marketplace_auto_review_stage_attempts_status_idx").on(
      t.status,
      t.updatedAt
    ),
  ]
);

export const marketplaceAutoReviewProviderEvents = pgTable(
  "marketplace_auto_review_provider_events",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    runId: varchar("runId", { length: 64 })
      .notNull()
      .references(() => marketplaceAutoReviewRuns.id, { onDelete: "cascade" }),
    stageKey: varchar("stageKey", { length: 64 }).notNull(),
    providerName: varchar("providerName", { length: 128 }),
    providerTaskId: varchar("providerTaskId", { length: 256 }).notNull(),
    mediaTaskId: varchar("mediaTaskId", { length: 128 }),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    signatureStatus: varchar("signatureStatus", { length: 40 })
      .default("internal_snapshot")
      .notNull(),
    replayKey: varchar("replayKey", { length: 256 }).notNull(),
    resultUrl: text("resultUrl"),
    creditRef: varchar("creditRef", { length: 256 }),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    receivedAt: timestamp("receivedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_auto_review_provider_events_replay_unique").on(
      t.replayKey
    ),
    index("marketplace_auto_review_provider_events_run_idx").on(
      t.runId,
      t.stageKey,
      t.receivedAt
    ),
    index("marketplace_auto_review_provider_events_task_idx").on(
      t.providerTaskId
    ),
    index("marketplace_auto_review_provider_events_status_idx").on(
      t.status,
      t.receivedAt
    ),
  ]
);

export const marketplaceAutoReviewOutboxJobs = pgTable(
  "marketplace_auto_review_outbox_jobs",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    runId: varchar("runId", { length: 64 })
      .notNull()
      .references(() => marketplaceAutoReviewRuns.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobType: varchar("jobType", { length: 80 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 256 }).notNull(),
    status: varchar("status", { length: 40 }).default("queued").notNull(),
    priority: integer("priority").default(100).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("maxAttempts").default(3).notNull(),
    lockedBy: varchar("lockedBy", { length: 160 }),
    lockedUntil: timestamp("lockedUntil", { withTimezone: true }),
    scheduledAt: timestamp("scheduledAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_auto_review_outbox_jobs_idempotency_unique").on(
      t.idempotencyKey
    ),
    index("marketplace_auto_review_outbox_jobs_ready_idx").on(
      t.status,
      t.scheduledAt,
      t.priority
    ),
    index("marketplace_auto_review_outbox_jobs_run_idx").on(
      t.runId,
      t.createdAt
    ),
    index("marketplace_auto_review_outbox_jobs_lock_idx").on(t.lockedUntil),
  ]
);

export const storyboardPreviewMatchCaptureJobs = pgTable(
  "storyboard_preview_match_capture_jobs",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: varchar("productId", { length: 64 }).notNull(),
    runId: varchar("runId", { length: 64 })
      .notNull()
      .references(() => marketplaceAutoReviewRuns.id, { onDelete: "cascade" }),
    storyboardReviewId: varchar("storyboardReviewId", {
      length: 128,
    }).notNull(),
    engine: varchar("engine", { length: 80 })
      .notNull()
      .default("preview_match_browser_capture"),
    quality: varchar("quality", { length: 24 }).notNull().default("standard"),
    status: varchar("status", { length: 40 }).notNull().default("queued"),
    stage: varchar("stage", { length: 80 }),
    progressPercent: integer("progressPercent").notNull().default(0),
    failureCode: varchar("failureCode", { length: 120 }),
    safeMessage: text("safeMessage"),
    safeDiagnosticsJson: jsonb("safeDiagnosticsJson")
      .$type<string[]>()
      .notNull()
      .default([]),
    idempotencyKey: varchar("idempotencyKey", { length: 256 }).notNull(),
    previewCompositionHash: varchar("previewCompositionHash", {
      length: 160,
    }).notNull(),
    timelineHash: varchar("timelineHash", { length: 160 }).notNull(),
    finalCompositeConfigHash: varchar("finalCompositeConfigHash", {
      length: 160,
    }).notNull(),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    outputJson: jsonb("outputJson")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    evidenceJson: jsonb("evidenceJson")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    billingJson: jsonb("billingJson")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    activeAttemptId: varchar("activeAttemptId", { length: 128 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    cancelledAt: timestamp("cancelledAt", { withTimezone: true }),
  },
  t => [
    uniqueIndex("storyboard_preview_match_capture_jobs_tenant_idem_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("storyboard_preview_match_capture_jobs_lookup_idx").on(
      t.tenantId,
      t.productId,
      t.runId,
      t.storyboardReviewId,
      t.createdAt
    ),
    index("storyboard_preview_match_capture_jobs_status_idx").on(
      t.tenantId,
      t.status,
      t.createdAt
    ),
  ]
);

export const storyboardPreviewMatchCaptureAttempts = pgTable(
  "storyboard_preview_match_capture_attempts",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    captureJobId: varchar("captureJobId", { length: 128 })
      .notNull()
      .references(() => storyboardPreviewMatchCaptureJobs.id, {
        onDelete: "cascade",
      }),
    attemptNumber: integer("attemptNumber").notNull().default(1),
    status: varchar("status", { length: 40 }).notNull().default("active"),
    stage: varchar("stage", { length: 80 }),
    failureCode: varchar("failureCode", { length: 120 }),
    routeTokenHash: varchar("routeTokenHash", { length: 160 }),
    assetManifestJson: jsonb("assetManifestJson")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    workspaceJson: jsonb("workspaceJson")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    outputJson: jsonb("outputJson")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    evidenceJson: jsonb("evidenceJson")
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    startedAt: timestamp("startedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    staleAt: timestamp("staleAt", { withTimezone: true }),
    cancelledAt: timestamp("cancelledAt", { withTimezone: true }),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("storyboard_preview_match_capture_attempts_job_idx").on(
      t.captureJobId,
      t.attemptNumber
    ),
    index("storyboard_preview_match_capture_attempts_stale_idx").on(
      t.captureJobId,
      t.staleAt,
      t.cancelledAt
    ),
  ]
);

export const marketplaceAutoReviewArtifacts = pgTable(
  "marketplace_auto_review_artifacts",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    runId: varchar("runId", { length: 64 })
      .notNull()
      .references(() => marketplaceAutoReviewRuns.id, { onDelete: "cascade" }),
    stageKey: varchar("stageKey", { length: 64 }).notNull(),
    artifactKind: varchar("artifactKind", { length: 100 }).notNull(),
    storageKey: text("storageKey").notNull(),
    storageUrl: text("storageUrl"),
    contentHash: varchar("contentHash", { length: 128 }).notNull(),
    mimeType: varchar("mimeType", { length: 160 }).notNull(),
    sizeBytes: integer("sizeBytes"),
    status: varchar("status", { length: 40 }).default("ready").notNull(),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, any>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_auto_review_artifacts_hash_unique").on(
      t.runId,
      t.artifactKind,
      t.contentHash
    ),
    index("marketplace_auto_review_artifacts_run_idx").on(
      t.runId,
      t.stageKey,
      t.artifactKind
    ),
    index("marketplace_auto_review_artifacts_status_idx").on(
      t.status,
      t.createdAt
    ),
  ]
);

export const marketplaceUserShareSettings = pgTable(
  "marketplace_user_share_settings",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    platform: marketplacePlatformEnum("platform").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    groupIdsJson: jsonb("groupIdsJson").$type<number[]>().notNull().default([]),
    permission: varchar("permission", { length: 32 })
      .notNull()
      .default("read_update"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("idx_marketplace_user_share_settings_unique").on(
      t.userId,
      t.tenantId,
      t.platform
    ),
    index("idx_marketplace_user_share_settings_user").on(t.userId, t.tenantId),
  ]
);

// ---------------------------------------------------------------------------
// Marketplace Intelligence Connector Tables
// ---------------------------------------------------------------------------

export const marketplaceConnectorGrants = pgTable(
  "marketplace_connector_grants",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    status: varchar("status", { length: 40 })
      .default("not_connected")
      .notNull(),
    grantHash: varchar("grantHash", { length: 128 }),
    authorizationAttemptHash: varchar("authorizationAttemptHash", {
      length: 128,
    }),
    scopesJson: jsonb("scopesJson").$type<string[]>().default([]).notNull(),
    providerAccountLabel: text("providerAccountLabel"),
    defaultRegion: varchar("defaultRegion", { length: 10 })
      .default("TH")
      .notNull(),
    defaultLocale: varchar("defaultLocale", { length: 20 })
      .default("th-TH")
      .notNull(),
    defaultResultLimit: integer("defaultResultLimit").default(10).notNull(),
    preferredSourceMode: varchar("preferredSourceMode", { length: 40 })
      .default("recorded_mcp_sample")
      .notNull(),
    lastStatusRefreshAt: timestamp("lastStatusRefreshAt", {
      withTimezone: true,
    }),
    lastProbeAt: timestamp("lastProbeAt", { withTimezone: true }),
    lastMarketplaceCaptureEnrichmentAt: timestamp(
      "lastMarketplaceCaptureEnrichmentAt",
      { withTimezone: true }
    ),
    startedAt: timestamp("startedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_connector_grants_user_provider_unique").on(
      t.tenantId,
      t.userId,
      t.provider
    ),
    index("marketplace_connector_grants_status_idx").on(
      t.tenantId,
      t.provider,
      t.status,
      t.expiresAt
    ),
    index("marketplace_connector_grants_user_idx").on(t.userId, t.updatedAt),
  ]
);

export const marketplaceConnectorGrantEvents = pgTable(
  "marketplace_connector_grant_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    grantId: varchar("grantId", { length: 64 })
      .notNull()
      .references(() => marketplaceConnectorGrants.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    safeMessage: text("safeMessage"),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("marketplace_connector_grant_events_grant_idx").on(
      t.grantId,
      t.createdAt
    ),
    index("marketplace_connector_grant_events_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
  ]
);

export const marketplaceConnectorFieldSamples = pgTable(
  "marketplace_connector_field_samples",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    sourceMode: varchar("sourceMode", { length: 40 }).notNull(),
    keyword: varchar("keyword", { length: 160 }).notNull(),
    region: varchar("region", { length: 10 }).notNull(),
    locale: varchar("locale", { length: 20 }).notNull(),
    capabilityVersion: varchar("capabilityVersion", { length: 120 }).notNull(),
    payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
    shapeHash: varchar("shapeHash", { length: 128 }).notNull(),
    fieldCoverageJson: jsonb("fieldCoverageJson")
      .$type<unknown[]>()
      .default([])
      .notNull(),
    capabilitySummaryJson: jsonb("capabilitySummaryJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    redactionState: varchar("redactionState", { length: 40 })
      .default("raw_not_stored")
      .notNull(),
    rawPayloadExpiresAt: timestamp("rawPayloadExpiresAt", {
      withTimezone: true,
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_connector_field_samples_payload_unique").on(
      t.tenantId,
      t.userId,
      t.provider,
      t.payloadHash
    ),
    index("marketplace_connector_field_samples_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
    index("marketplace_connector_field_samples_keyword_idx").on(
      t.provider,
      t.keyword,
      t.createdAt
    ),
  ]
);

export const marketplaceSearchSnapshots = pgTable(
  "marketplace_search_snapshots",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    sourceMode: varchar("sourceMode", { length: 40 }).notNull(),
    keyword: varchar("keyword", { length: 160 }).notNull(),
    region: varchar("region", { length: 10 }).notNull(),
    locale: varchar("locale", { length: 20 }).notNull(),
    status: varchar("status", { length: 40 }).default("ready").notNull(),
    capabilityVersion: varchar("capabilityVersion", { length: 120 }).notNull(),
    itemCount: integer("itemCount").default(0).notNull(),
    fieldCoveragePercent: integer("fieldCoveragePercent").default(0).notNull(),
    unknownFieldCount: integer("unknownFieldCount").default(0).notNull(),
    metricsJson: jsonb("metricsJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 192 }).notNull(),
    sourceCapturedAt: timestamp("sourceCapturedAt", { withTimezone: true }),
    capturedAt: timestamp("capturedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    rawPayloadRedactedAt: timestamp("rawPayloadRedactedAt", {
      withTimezone: true,
    }),
    rawPayloadExpiresAt: timestamp("rawPayloadExpiresAt", {
      withTimezone: true,
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_search_snapshots_idempotency_unique").on(
      t.tenantId,
      t.userId,
      t.provider,
      t.idempotencyKey
    ),
    index("marketplace_search_snapshots_user_idx").on(
      t.tenantId,
      t.userId,
      t.capturedAt
    ),
    index("marketplace_search_snapshots_keyword_idx").on(
      t.provider,
      t.region,
      t.keyword,
      t.capturedAt
    ),
    index("marketplace_search_snapshots_source_idx").on(
      t.sourceMode,
      t.status,
      t.capturedAt
    ),
  ]
);

export const marketplaceSearchSnapshotItems = pgTable(
  "marketplace_search_snapshot_items",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    snapshotId: varchar("snapshotId", { length: 64 })
      .notNull()
      .references(() => marketplaceSearchSnapshots.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    rank: integer("rank").notNull(),
    title: text("title").notNull(),
    sellerName: text("sellerName"),
    brand: text("brand"),
    price: numeric("price", { precision: 14, scale: 2 }),
    originalPrice: numeric("originalPrice", { precision: 14, scale: 2 }),
    discount: integer("discount"),
    monthlySoldCount: integer("monthlySoldCount"),
    historicalSoldCount: integer("historicalSoldCount"),
    rating: numeric("rating", { precision: 6, scale: 4 }),
    reviewCount: integer("reviewCount"),
    shopeeVerified: boolean("shopeeVerified").default(false).notNull(),
    estimatedDeliveryTimeText: text("estimatedDeliveryTimeText"),
    image: text("image"),
    externalProductId: varchar("externalProductId", { length: 128 }),
    externalShopId: varchar("externalShopId", { length: 128 }),
    externalModelId: varchar("externalModelId", { length: 128 }),
    itemType: varchar("itemType", { length: 80 }),
    matchedKeywordsJson: jsonb("matchedKeywordsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    normalizedJson: jsonb("normalizedJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    rawDiagnosticJson: jsonb("rawDiagnosticJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_search_snapshot_items_rank_unique").on(
      t.snapshotId,
      t.rank
    ),
    index("marketplace_search_snapshot_items_snapshot_idx").on(
      t.snapshotId,
      t.rank
    ),
    index("marketplace_search_snapshot_items_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
    index("marketplace_search_snapshot_items_external_idx").on(
      t.provider,
      t.externalShopId,
      t.externalProductId,
      t.externalModelId
    ),
    check(
      "marketplace_search_snapshot_items_rank_positive",
      sql`${t.rank} > 0`
    ),
  ]
);

export const marketplaceSearchSnapshotProductLinks = pgTable(
  "marketplace_search_snapshot_product_links",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    snapshotId: varchar("snapshotId", { length: 64 })
      .notNull()
      .references(() => marketplaceSearchSnapshots.id, { onDelete: "cascade" }),
    snapshotItemId: varchar("snapshotItemId", { length: 80 })
      .notNull()
      .references(() => marketplaceSearchSnapshotItems.id, {
        onDelete: "cascade",
      }),
    productId: varchar("productId", { length: 64 }).references(
      () => marketplaceProducts.id,
      { onDelete: "set null" }
    ),
    candidateItemId: varchar("candidateItemId", { length: 64 }).references(
      () => marketplaceCandidateItems.id,
      { onDelete: "set null" }
    ),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    linkBasis: varchar("linkBasis", { length: 80 }).notNull(),
    reviewState: varchar("reviewState", { length: 40 })
      .default("needs_review")
      .notNull(),
    evidenceJson: jsonb("evidenceJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_snapshot_product_links_unique").on(
      t.snapshotItemId,
      t.productId,
      t.candidateItemId
    ),
    index("marketplace_snapshot_product_links_snapshot_idx").on(
      t.snapshotId,
      t.reviewState
    ),
    index("marketplace_snapshot_product_links_product_idx").on(
      t.productId,
      t.createdAt
    ),
    index("marketplace_snapshot_product_links_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
  ]
);

export const marketplaceProductMetricConnectorSnapshots = pgTable(
  "marketplace_product_metric_connector_snapshots",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    productId: varchar("productId", { length: 64 })
      .notNull()
      .references(() => marketplaceProducts.id, { onDelete: "cascade" }),
    snapshotId: varchar("snapshotId", { length: 64 })
      .notNull()
      .references(() => marketplaceSearchSnapshots.id, { onDelete: "cascade" }),
    snapshotItemId: varchar("snapshotItemId", { length: 80 })
      .notNull()
      .references(() => marketplaceSearchSnapshotItems.id, {
        onDelete: "cascade",
      }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    capturedAt: timestamp("capturedAt", { withTimezone: true }).notNull(),
    price: numeric("price", { precision: 14, scale: 2 }),
    monthlySoldCount: integer("monthlySoldCount"),
    historicalSoldCount: integer("historicalSoldCount"),
    rating: numeric("rating", { precision: 6, scale: 4 }),
    reviewCount: integer("reviewCount"),
    rank: integer("rank"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    provenanceJson: jsonb("provenanceJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_product_metric_connector_unique").on(
      t.productId,
      t.snapshotItemId
    ),
    index("marketplace_product_metric_connector_product_idx").on(
      t.productId,
      t.capturedAt
    ),
    index("marketplace_product_metric_connector_user_idx").on(
      t.tenantId,
      t.userId,
      t.capturedAt
    ),
  ]
);

export const marketplaceKeywordDiscoveries = pgTable(
  "marketplace_keyword_discoveries",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    snapshotId: varchar("snapshotId", { length: 64 })
      .notNull()
      .references(() => marketplaceSearchSnapshots.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    keyword: varchar("keyword", { length: 160 }).notNull(),
    status: varchar("status", { length: 40 }).default("ready").notNull(),
    opportunitiesJson: jsonb("opportunitiesJson")
      .$type<unknown[]>()
      .default([])
      .notNull(),
    summaryJson: jsonb("summaryJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    capturedAt: timestamp("capturedAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_keyword_discoveries_snapshot_unique").on(
      t.snapshotId,
      t.userId
    ),
    index("marketplace_keyword_discoveries_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
    index("marketplace_keyword_discoveries_keyword_idx").on(
      t.provider,
      t.keyword,
      t.createdAt
    ),
  ]
);

export const marketplaceKeywordDiscoveryClusters = pgTable(
  "marketplace_keyword_discovery_clusters",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    discoveryId: varchar("discoveryId", { length: 64 })
      .notNull()
      .references(() => marketplaceKeywordDiscoveries.id, {
        onDelete: "cascade",
      }),
    snapshotId: varchar("snapshotId", { length: 64 })
      .notNull()
      .references(() => marketplaceSearchSnapshots.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clusterType: varchar("clusterType", { length: 60 })
      .default("brand_family")
      .notNull(),
    label: text("label").notNull(),
    rank: integer("rank").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 })
      .default("0.7000")
      .notNull(),
    representativeSnapshotItemIdsJson: jsonb(
      "representativeSnapshotItemIdsJson"
    )
      .$type<string[]>()
      .default([])
      .notNull(),
    evidenceJson: jsonb("evidenceJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    metricsJson: jsonb("metricsJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_keyword_discovery_clusters_rank_unique").on(
      t.discoveryId,
      t.rank,
      t.label
    ),
    index("marketplace_keyword_discovery_clusters_discovery_idx").on(
      t.discoveryId,
      t.rank
    ),
    index("marketplace_keyword_discovery_clusters_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
  ]
);

export const marketplaceSearchReports = pgTable(
  "marketplace_search_reports",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    reportType: varchar("reportType", { length: 80 }).notNull(),
    status: varchar("status", { length: 40 }).default("ready").notNull(),
    title: text("title").notNull(),
    latestSnapshotId: varchar("latestSnapshotId", { length: 64 })
      .notNull()
      .references(() => marketplaceSearchSnapshots.id, { onDelete: "cascade" }),
    baselineSnapshotId: varchar("baselineSnapshotId", {
      length: 64,
    }).references(() => marketplaceSearchSnapshots.id, {
      onDelete: "set null",
    }),
    intermediateSnapshotIdsJson: jsonb("intermediateSnapshotIdsJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    aspectRatio: varchar("aspectRatio", { length: 12 })
      .default("1:1")
      .notNull(),
    imageModel: varchar("imageModel", { length: 80 })
      .default("gpt-image-2")
      .notNull(),
    payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
    reportJson: jsonb("reportJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    promptPayloadJson: jsonb("promptPayloadJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    sourceSummaryJson: jsonb("sourceSummaryJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_search_reports_payload_unique").on(
      t.tenantId,
      t.userId,
      t.reportType,
      t.payloadHash
    ),
    index("marketplace_search_reports_snapshot_idx").on(
      t.latestSnapshotId,
      t.createdAt
    ),
    index("marketplace_search_reports_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
  ]
);

export const marketplaceSearchReportExports = pgTable(
  "marketplace_search_report_exports",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    reportId: varchar("reportId", { length: 64 })
      .notNull()
      .references(() => marketplaceSearchReports.id, { onDelete: "cascade" }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exportType: varchar("exportType", { length: 40 }).notNull(),
    templateKey: varchar("templateKey", { length: 120 }).notNull(),
    aspectRatio: varchar("aspectRatio", { length: 12 }).notNull(),
    status: varchar("status", { length: 40 }).default("queued").notNull(),
    providerModel: varchar("providerModel", { length: 80 })
      .default("gpt-image-2")
      .notNull(),
    promptHash: varchar("promptHash", { length: 128 }).notNull(),
    payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
    storageKey: text("storageKey"),
    storageUrl: text("storageUrl"),
    sourceSummaryJson: jsonb("sourceSummaryJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    errorMessage: text("errorMessage"),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_search_report_exports_payload_unique").on(
      t.reportId,
      t.exportType,
      t.payloadHash
    ),
    index("marketplace_search_report_exports_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
    index("marketplace_search_report_exports_status_idx").on(
      t.status,
      t.createdAt
    ),
  ]
);

export const marketplaceIntelligenceWatchlists = pgTable(
  "marketplace_intelligence_watchlists",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    keyword: varchar("keyword", { length: 160 }).notNull(),
    region: varchar("region", { length: 10 }).default("TH").notNull(),
    cadence: varchar("cadence", { length: 40 }).default("daily").notNull(),
    status: varchar("status", { length: 40 }).default("active").notNull(),
    alertRulesJson: jsonb("alertRulesJson")
      .$type<string[]>()
      .default([])
      .notNull(),
    lastSnapshotId: varchar("lastSnapshotId", { length: 64 }).references(
      () => marketplaceSearchSnapshots.id,
      { onDelete: "set null" }
    ),
    lastRunAt: timestamp("lastRunAt", { withTimezone: true }),
    nextRunAt: timestamp("nextRunAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("marketplace_intelligence_watchlists_unique").on(
      t.tenantId,
      t.userId,
      t.provider,
      t.keyword,
      t.region
    ),
    index("marketplace_intelligence_watchlists_user_idx").on(
      t.tenantId,
      t.userId,
      t.status,
      t.createdAt
    ),
    index("marketplace_intelligence_watchlists_due_idx").on(
      t.status,
      t.nextRunAt
    ),
  ]
);

export const marketplaceIntelligenceWatchlistEvents = pgTable(
  "marketplace_intelligence_watchlist_events",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    watchlistId: varchar("watchlistId", { length: 64 })
      .notNull()
      .references(() => marketplaceIntelligenceWatchlists.id, {
        onDelete: "cascade",
      }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    severity: varchar("severity", { length: 40 }).default("info").notNull(),
    baselineSnapshotId: varchar("baselineSnapshotId", {
      length: 64,
    }).references(() => marketplaceSearchSnapshots.id, {
      onDelete: "set null",
    }),
    latestSnapshotId: varchar("latestSnapshotId", { length: 64 }).references(
      () => marketplaceSearchSnapshots.id,
      { onDelete: "set null" }
    ),
    summary: text("summary").notNull(),
    evidenceJson: jsonb("evidenceJson")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("marketplace_watchlist_events_watchlist_idx").on(
      t.watchlistId,
      t.createdAt
    ),
    index("marketplace_watchlist_events_user_idx").on(
      t.tenantId,
      t.userId,
      t.createdAt
    ),
  ]
);

export type MarketplaceExtensionPairing =
  typeof marketplaceExtensionPairings.$inferSelect;
export type InsertMarketplaceExtensionPairing =
  typeof marketplaceExtensionPairings.$inferInsert;
export type MarketplaceCaptureSession =
  typeof marketplaceCaptureSessions.$inferSelect;
export type InsertMarketplaceCaptureSession =
  typeof marketplaceCaptureSessions.$inferInsert;
export type MarketplaceCaptureAsset =
  typeof marketplaceCaptureAssets.$inferSelect;
export type InsertMarketplaceCaptureAsset =
  typeof marketplaceCaptureAssets.$inferInsert;
export type MarketplaceProduct = typeof marketplaceProducts.$inferSelect;
export type InsertMarketplaceProduct = typeof marketplaceProducts.$inferInsert;
export type MarketplaceProductImage =
  typeof marketplaceProductImages.$inferSelect;
export type InsertMarketplaceProductImage =
  typeof marketplaceProductImages.$inferInsert;
export type MarketplaceProductGroupShare =
  typeof marketplaceProductGroupShares.$inferSelect;
export type InsertMarketplaceProductGroupShare =
  typeof marketplaceProductGroupShares.$inferInsert;
export type MarketplaceCaptureInsight =
  typeof marketplaceCaptureInsights.$inferSelect;
export type InsertMarketplaceCaptureInsight =
  typeof marketplaceCaptureInsights.$inferInsert;
export type MarketplaceAutoReviewRun =
  typeof marketplaceAutoReviewRuns.$inferSelect;
export type InsertMarketplaceAutoReviewRun =
  typeof marketplaceAutoReviewRuns.$inferInsert;
export type MarketplaceAutoReviewStage =
  typeof marketplaceAutoReviewStages.$inferSelect;
export type InsertMarketplaceAutoReviewStage =
  typeof marketplaceAutoReviewStages.$inferInsert;
export type MarketplaceAutoReviewRunLease =
  typeof marketplaceAutoReviewRunLeases.$inferSelect;
export type InsertMarketplaceAutoReviewRunLease =
  typeof marketplaceAutoReviewRunLeases.$inferInsert;
export type MarketplaceAutoReviewStageAttempt =
  typeof marketplaceAutoReviewStageAttempts.$inferSelect;
export type InsertMarketplaceAutoReviewStageAttempt =
  typeof marketplaceAutoReviewStageAttempts.$inferInsert;
export type MarketplaceAutoReviewProviderEvent =
  typeof marketplaceAutoReviewProviderEvents.$inferSelect;
export type InsertMarketplaceAutoReviewProviderEvent =
  typeof marketplaceAutoReviewProviderEvents.$inferInsert;
export type MarketplaceAutoReviewOutboxJob =
  typeof marketplaceAutoReviewOutboxJobs.$inferSelect;
export type InsertMarketplaceAutoReviewOutboxJob =
  typeof marketplaceAutoReviewOutboxJobs.$inferInsert;
export type StoryboardPreviewMatchCaptureJob =
  typeof storyboardPreviewMatchCaptureJobs.$inferSelect;
export type InsertStoryboardPreviewMatchCaptureJob =
  typeof storyboardPreviewMatchCaptureJobs.$inferInsert;
export type StoryboardPreviewMatchCaptureAttempt =
  typeof storyboardPreviewMatchCaptureAttempts.$inferSelect;
export type InsertStoryboardPreviewMatchCaptureAttempt =
  typeof storyboardPreviewMatchCaptureAttempts.$inferInsert;
export type MarketplaceAutoReviewArtifact =
  typeof marketplaceAutoReviewArtifacts.$inferSelect;
export type InsertMarketplaceAutoReviewArtifact =
  typeof marketplaceAutoReviewArtifacts.$inferInsert;
export type MarketplaceUserShareSetting =
  typeof marketplaceUserShareSettings.$inferSelect;
export type InsertMarketplaceUserShareSetting =
  typeof marketplaceUserShareSettings.$inferInsert;
export type MarketplaceConnectorGrant =
  typeof marketplaceConnectorGrants.$inferSelect;
export type InsertMarketplaceConnectorGrant =
  typeof marketplaceConnectorGrants.$inferInsert;
export type MarketplaceSearchSnapshot =
  typeof marketplaceSearchSnapshots.$inferSelect;
export type InsertMarketplaceSearchSnapshot =
  typeof marketplaceSearchSnapshots.$inferInsert;
export type MarketplaceSearchSnapshotItem =
  typeof marketplaceSearchSnapshotItems.$inferSelect;
export type InsertMarketplaceSearchSnapshotItem =
  typeof marketplaceSearchSnapshotItems.$inferInsert;
export type MarketplaceKeywordDiscoveryRecord =
  typeof marketplaceKeywordDiscoveries.$inferSelect;
export type InsertMarketplaceKeywordDiscoveryRecord =
  typeof marketplaceKeywordDiscoveries.$inferInsert;
export type MarketplaceSearchReport =
  typeof marketplaceSearchReports.$inferSelect;
export type InsertMarketplaceSearchReport =
  typeof marketplaceSearchReports.$inferInsert;
export type MarketplaceIntelligenceWatchlistRecord =
  typeof marketplaceIntelligenceWatchlists.$inferSelect;
export type InsertMarketplaceIntelligenceWatchlistRecord =
  typeof marketplaceIntelligenceWatchlists.$inferInsert;

/* ==========================================================================
 * Vertical Drama Series (Feature 131) — persistence tables.
 *
 * Durable first-class series/episode/run state (spec §7). JSONB is used for
 * fast-evolving, guide-compatible stage payloads (snake_case-preserving).
 * Media references are stored as media_assets IDs, never provider URLs.
 * Every durable row carries tenantId + userId ownership; run-scoped rows carry
 * seriesId/episodeId/runId. See apps/web/shared/verticalDramaSeries/* for the
 * matching TypeScript contracts.
 * ======================================================================== */

/** Series project — canonical owner of bible, memory, characters, and policy (spec §7.2). */
export const verticalDramaSeries = pgTable(
  "vertical_drama_series",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    locale: varchar("locale", { length: 8 }).default("th").notNull(),
    aspectRatio: varchar("aspectRatio", { length: 8 })
      .default("9:16")
      .notNull(),
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    targetEpisodeCount: integer("targetEpisodeCount").default(10).notNull(),
    defaultEpisodeDurationSeconds: integer("defaultEpisodeDurationSeconds")
      .default(60)
      .notNull(),
    genre: varchar("genre", { length: 100 }),
    tone: varchar("tone", { length: 100 }),
    targetAudience: varchar("targetAudience", { length: 100 }),
    agePolicyId: varchar("agePolicyId", { length: 64 }),
    /** VerticalDramaSeriesBible */
    bible: jsonb("bible"),
    /** VerticalDramaSeriesMemory (compact projection persisted on the series row) */
    memory: jsonb("memory"),
    /** VerticalDramaProductTieInConfig */
    productTieIn: jsonb("productTieIn"),
    /** VerticalDramaSeriesPolicy */
    policy: jsonb("policy"),
    /** VerticalDramaQualityPolicy (spec 131 §16.1) — null → tenant default → built-in defaults */
    qualityPolicy: jsonb("qualityPolicy"),
    /**
     * VerticalDramaSeriesLlmModelPolicy (manual LLM model override for the
     * "generate start-frame render plan" / "generate storyboard" pipeline
     * stages, added 2026-07-11 — see
     * `/home/dev/.claude/plans/polished-toasting-gadget.md`). Nullable JSONB,
     * additive; absent/null field(s) mean "automatic" (the stage's own
     * quality/large-context model selector picks the model). See
     * `@shared/verticalDramaSeries/contracts.ts` for the field shape and
     * `server/services/verticalDramaImproveScript.ts`'s
     * `resolveStartFramePlanModel`/`resolveStoryboardModel` for the
     * resolution logic.
     */
    llmModelPolicy: jsonb("llmModelPolicy"),
    /** VerticalDramaSeriesTrailerState (series-level narrated trailer, Bible tab) */
    trailer: jsonb("trailer"),
    /**
     * Text Overlay Suite (task #34, F131AB) — series-level branding WATERMARK
     * (`VdSeriesWatermarkConfig`, `@shared/verticalDramaSeries/textOverlay.ts`):
     * enabled/type(text|image)/text/imageUrl/position/opacity/scalePct/marginPx.
     * Nullable JSONB, additive; same "hand-authored migration, schema.ts
     * catches up separately" convention as this table's sibling `trailer`
     * column — see `manual_vertical_drama_series_watermark.sql` for the
     * idempotent `ADD COLUMN IF NOT EXISTS` record. Zero data-loss: nullable
     * ADD COLUMN, existing rows get `watermark = NULL` (client/server treat
     * NULL as "no watermark configured"). Read/written via
     * `updateSeriesWatermark` (flag-gated on
     * `verticalDramaSeriesTextOverlaySuite`, F131AB).
     */
    watermark: jsonb("watermark"),
    /**
     * Production Episodes (Phase D′-1,
     * planning/vertical-drama-production-episodes/plan.md) — durable status
     * for this series' Production Episode GROUPS
     * (`VerticalDramaProductionEpisodesManifest`,
     * `@shared/verticalDramaSeries/assembly.ts`). MODEL: a Sub-Episode
     * (today's `vertical_drama_episodes` row, ~9 shots, spec's "ตอน") is
     * compiled into one short video via `assembleEpisodeVideo`
     * (`vertical_drama_episodes.assemblyManifest.compiledVideo.videoUrl`); a
     * Production Episode concatenates `groupSize` (5 or 10) CONSECUTIVE
     * Sub-Episodes' own compiled videos into ONE 4-10 minute video — the
     * actual publishable unit. Nullable JSONB, additive; same "hand-authored
     * migration, schema.ts catches up separately" convention as this table's
     * sibling `watermark`/`trailer` columns above — this table lineage's
     * `drizzle-kit generate`/`migrate` has a documented pre-existing
     * meta-journal collision (see those columns' own doc comments), so a
     * manual `ADD COLUMN IF NOT EXISTS` migration may be required if
     * `pnpm db:push` fails for this column. Zero data-loss: nullable ADD
     * COLUMN, existing rows get `productionEpisodesManifest = NULL`
     * (client/server treat NULL as "no Production Episodes assembled yet").
     * Read/written via `assembleProductionEpisodesForSeries`
     * (`server/services/verticalDramaProductionEpisodeAssembly.ts`), exposed
     * via `verticalDramaSeries.assembleProductionEpisodes` / `.get`.
     */
    productionEpisodesManifest: jsonb("productionEpisodesManifest"),
    /**
     * Season/special-edition lineage (`planning/vd-series-memory-and-lineage/
     * plan.md` Stage 2.1) — 4 additive, nullable columns, hand-applied via
     * `manual_vertical_drama_series_lineage.sql` (drizzle-kit generate is
     * blocked for this table lineage by the same pre-existing meta-journal
     * collision documented on this table's sibling `trailer`/`watermark`/
     * `productionEpisodesManifest` columns above). Zero data-loss: nullable
     * ADD COLUMN, existing rows get all four new columns = NULL.
     *
     * NULL semantics (deliberate — do NOT backfill an `'original'` sentinel):
     * `createMode` NULL = an ORIGINAL series (every row that existed before
     * this feature). "Original mode is unchanged" is therefore a STRUCTURAL
     * guarantee, matching this table's convention for every prior additive
     * column. Non-NULL `createMode` values: `"sequel"` | `"special_edition"`.
     * `parentSeriesId` NULL = not derived from another series. `seasonNumber`
     * NULL = not part of a numbered season lineage. `lineage` NULL = no
     * lineage payload (carry-over decisions the user approved,
     * special-edition source config, and a `parentTitle`/`parentEpisodeCount`
     * snapshot so a child's badge survives parent deletion — see
     * `@shared/verticalDramaSeries/lineage.ts` for the
     * `VerticalDramaSeriesLineage` shape).
     *
     * `parentSeriesId` uses `ON DELETE SET NULL` — a DELIBERATE divergence
     * from this table's sibling self-FKs on `verticalDramaCharacters`
     * (`parentCharacterId`/`sharesFaceWithCharacterId`, bare `REFERENCES`).
     * Deleting season 1 must NOT cascade-delete season 2: the child degrades
     * to an orphan that still renders its badge from
     * `lineage->>'parentTitle'`. Read via `loadOwnedSeries`
     * (`server/routers/verticalDramaSeries.ts`) and
     * `loadLineageContext`/cloned via `cloneSeriesCastForLineage`
     * (`server/services/verticalDramaSeriesLineage.ts` /
     * `verticalDramaSeriesClone.ts`).
     */
    parentSeriesId: bigint("parentSeriesId", { mode: "number" }).references(
      (): AnyPgColumn => verticalDramaSeries.id,
      { onDelete: "set null" }
    ),
    createMode: varchar("createMode", { length: 24 }),
    seasonNumber: integer("seasonNumber"),
    /** `VerticalDramaSeriesLineage` (`@shared/verticalDramaSeries/lineage.ts`) — see doc comment above. */
    lineage: jsonb("lineage"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_series_list_idx").on(t.tenantId, t.userId, t.updatedAt),
    index("vds_series_status_idx").on(t.tenantId, t.status),
    /**
     * Lists a parent's children ("ภาค 2 / ภาคพิเศษ ของเรื่องนี้") without a
     * sequential scan, tenant-scoped to match `vds_series_list_idx`'s
     * leading column. Matches `manual_vertical_drama_series_lineage.sql`'s
     * hand-applied index exactly.
     */
    index("vds_series_parent_idx").on(t.tenantId, t.parentSeriesId),
  ]
);

export type VerticalDramaSeriesRow = typeof verticalDramaSeries.$inferSelect;
export type InsertVerticalDramaSeriesRow =
  typeof verticalDramaSeries.$inferInsert;

/** Series characters — character stock with identity lock and reference assets (spec §7.2/§7.3). */
export const verticalDramaCharacters = pgTable(
  "vertical_drama_characters",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    /** Stable app-level character key (VerticalDramaCharacter.characterId). */
    characterKey: varchar("characterKey", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 100 }),
    /** Canonical story role; legacy `role` remains the occupation/status compatibility field. */
    narrativeRole: varchar("narrativeRole", { length: 32 }),
    /** Detailed visual-design tier shared with the Character Visual Bible V2 contract. */
    roleTier: varchar("roleTier", { length: 48 }),
    occupation: varchar("occupation", { length: 160 }),
    roleVisualIntent: jsonb("roleVisualIntent"),
    roleProvenance: varchar("roleProvenance", { length: 24 }),
    roleReviewStatus: varchar("roleReviewStatus", { length: 32 }),
    /** Full VerticalDramaCharacter payload (identityLock, wardrobeRules, currentState, ...). */
    data: jsonb("data"),
    /**
     * VerticalDramaCharacterVoiceConfig (W12) — this character's locked voice
     * casting (`@shared/verticalDramaSeries/voiceCasting`), or NULL when the
     * character has not been cast yet. Nullable JSONB, additive; column was
     * already applied directly to the database ahead of this type (verified via
     * `\d vertical_drama_characters` — see `manual_vertical_drama_character_voice_config.sql`
     * for the idempotent `ADD COLUMN IF NOT EXISTS` record), same "hand-authored
     * migration, schema.ts catches up separately" convention already used for
     * this table's sibling `manual_vertical_drama_*.sql` files (drizzle-kit
     * generate/migrate is blocked for this table lineage by a pre-existing
     * meta-journal collision — see those files' own doc comments). Read/written
     * via `verticalDramaCharacters.setCharacterVoiceConfig`
     * (flag-gated on `verticalDramaSeriesVoiceChain`, W12-A).
     */
    voiceConfig: jsonb("voiceConfig"),
    /**
     * Character variant/twin relationships (planning/vertical-drama-character-variants/plan.md
     * Phase A). These support 3 relationships:
     * - `parentCharacterId`+`variantLabel`+`variantType` — this row is a
     *   variant of another character row (same person): `variantType:
     *   "outfit"` = same age/face, different look; `variantType:
     *   "age_stage"` = same identity, different life-stage appearance
     *   (loose face reference, not locked).
     * - `sharesFaceWithCharacterId` — this row is a DIFFERENT person (e.g. a
     *   twin) whose face reference should be resolved from another
     *   character row.
     * All four columns nullable/additive; `null` = a standalone character or
     * a parent itself. Hand-applied via
     * `manual_vertical_drama_character_variant_columns.sql` — same "hand-
     * authored migration, schema.ts catches up separately" convention as
     * this table's sibling `voiceConfig` column (drizzle-kit generate is
     * blocked for this table lineage by the pre-existing meta-journal
     * collision documented on that column and its sibling
     * `manual_vertical_drama_*.sql` files).
     */
    parentCharacterId: bigint("parentCharacterId", {
      mode: "number",
    }).references((): AnyPgColumn => verticalDramaCharacters.id),
    variantLabel: varchar("variantLabel", { length: 64 }),
    /** "outfit" | "age_stage" | null — plain varchar, matches this table's `role` column style. */
    variantType: varchar("variantType", { length: 16 }),
    sharesFaceWithCharacterId: bigint("sharesFaceWithCharacterId", {
      mode: "number",
    }).references((): AnyPgColumn => verticalDramaCharacters.id),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_character_lookup_idx").on(
      t.tenantId,
      t.seriesId,
      t.characterKey
    ),
    uniqueIndex("vds_character_key_unique").on(t.seriesId, t.characterKey),
  ]
);

export type VerticalDramaCharacterRow =
  typeof verticalDramaCharacters.$inferSelect;
export type InsertVerticalDramaCharacterRow =
  typeof verticalDramaCharacters.$inferInsert;

/** Character/product asset links to canonical media_assets (spec §7.1). */
export const verticalDramaCharacterAssets = pgTable(
  "vertical_drama_character_assets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    characterId: bigint("characterId", { mode: "number" }).references(
      () => verticalDramaCharacters.id,
      { onDelete: "cascade" }
    ),
    /** Canonical asset registry reference — never a provider URL. */
    mediaAssetId: bigint("mediaAssetId", { mode: "number" }).references(
      () => mediaAssets.id,
      { onDelete: "set null" }
    ),
    assetType: varchar("assetType", { length: 40 }).notNull(),
    role: varchar("role", { length: 40 }),
    approved: boolean("approved").default(false).notNull(),
    containsHumanFace: boolean("containsHumanFace"),
    qcStatus: varchar("qcStatus", { length: 20 }).default("pending").notNull(),
    checksumSha256: varchar("checksumSha256", { length: 64 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_char_asset_series_idx").on(t.tenantId, t.seriesId),
    index("vds_char_asset_character_idx").on(t.seriesId, t.characterId),
    index("vds_char_asset_media_idx").on(t.mediaAssetId),
  ]
);

export type VerticalDramaCharacterAssetRow =
  typeof verticalDramaCharacterAssets.$inferSelect;
export type InsertVerticalDramaCharacterAssetRow =
  typeof verticalDramaCharacterAssets.$inferInsert;

/**
 * Character name aliases — canonical identity resolution
 * (`planning/vd-character-identity-repair/plan.md` Phase 2.2). Each row
 * records one spelling/short-form/romanization/nickname that resolves to
 * exactly one `verticalDramaCharacters` row within a series (e.g. `คิริน`,
 * `Kirin`, `คีริน` all resolving to the same `คิริน วัฒนเมธา` row).
 *
 * `normalizedAlias` is written in the `normalizeStoryCharacterName()` form
 * (`server/services/verticalDramaCharacterRosterAutoRegister.ts`:
 * `.trim().toLowerCase().replace(/\s+/g, " ")`) — this table does not
 * reimplement that normalizer; callers must apply it before insert/lookup.
 *
 * UNIQUE `(seriesId, normalizedAlias)` is the DB-level guarantee that one
 * spelling resolves to exactly one character — the guard that
 * `(seriesId, characterKey)` was never able to provide for Thai names,
 * because `slugifyForCharacterKey` strips all non-`[a-z0-9]` characters and
 * every Thai name collapses to the same `"character"` fallback (plan
 * root-cause #7).
 *
 * Hand-authored via `manual_vertical_drama_character_aliases.sql` — same
 * "hand-authored migration, schema.ts catches up separately" convention as
 * this table's sibling `verticalDramaCharacters` / `verticalDramaCharacterAssets`
 * columns (drizzle-kit generate is blocked for this table lineage by the
 * pre-existing meta-journal collision documented on those columns).
 */
export const verticalDramaCharacterAliases = pgTable(
  "vertical_drama_character_aliases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    characterId: bigint("characterId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaCharacters.id, { onDelete: "cascade" }),
    /** Display form as written (e.g. "คิริน", "Kirin"). */
    alias: varchar("alias", { length: 255 }).notNull(),
    /** The `normalizeStoryCharacterName()` form of `alias` — see doc comment above. */
    normalizedAlias: varchar("normalizedAlias", { length: 255 }).notNull(),
    /** "bible_declared" | "merge_recorded" | "user_added" */
    source: varchar("source", { length: 24 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("vds_character_alias_unique").on(
      t.seriesId,
      t.normalizedAlias
    ),
    index("vds_character_alias_lookup_idx").on(
      t.tenantId,
      t.seriesId,
      t.characterId
    ),
  ]
);

export type VerticalDramaCharacterAliasRow =
  typeof verticalDramaCharacterAliases.$inferSelect;
export type InsertVerticalDramaCharacterAliasRow =
  typeof verticalDramaCharacterAliases.$inferInsert;

/**
 * Series locations — location/environment roster for the "Location Visual
 * Bible" feature (`planning/polished-toasting-gadget.md` Phase 2). Mirrors
 * `verticalDramaCharacters`, deliberately simpler: no variant/twin/voice
 * columns — a location doesn't need identity-lock-across-angles the way a
 * character face does. `data` carries `{ description, aggregatedFacts?:
 * string[] }` — the free-form description plus the aggregated
 * dialogue/action/props facts (from the shots grouped under this location)
 * that `vertical-drama-location-visual-bible` grounds its
 * `establishing_plate_prompt` in.
 */
export const verticalDramaLocations = pgTable(
  "vertical_drama_locations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    /** Stable app-level location key (mirrors `distinct_locations[].location_key` — see `verticalDramaStoryboardGeneration.ts`'s `distinctLocationSchema`). */
    locationKey: varchar("locationKey", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    data: jsonb("data"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_location_lookup_idx").on(
      t.tenantId,
      t.seriesId,
      t.locationKey
    ),
    uniqueIndex("vds_location_key_unique").on(t.seriesId, t.locationKey),
  ]
);

export type VerticalDramaLocationRow =
  typeof verticalDramaLocations.$inferSelect;
export type InsertVerticalDramaLocationRow =
  typeof verticalDramaLocations.$inferInsert;

/** Location asset links to canonical media_assets — mirrors `verticalDramaCharacterAssets` (spec §7.1-style asset ledger, applied to locations). */
export const verticalDramaLocationAssets = pgTable(
  "vertical_drama_location_assets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    locationId: bigint("locationId", { mode: "number" }).references(
      () => verticalDramaLocations.id,
      { onDelete: "cascade" }
    ),
    /** Canonical asset registry reference — never a provider URL. */
    mediaAssetId: bigint("mediaAssetId", { mode: "number" }).references(
      () => mediaAssets.id,
      { onDelete: "set null" }
    ),
    /** "location_reference" */
    assetType: varchar("assetType", { length: 40 }).notNull(),
    /** "establishing_plate" */
    role: varchar("role", { length: 40 }),
    approved: boolean("approved").default(false).notNull(),
    qcStatus: varchar("qcStatus", { length: 20 }).default("pending").notNull(),
    checksumSha256: varchar("checksumSha256", { length: 64 }),
    /** { state, source, ... } */
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_location_asset_series_idx").on(t.tenantId, t.seriesId),
    index("vds_location_asset_location_idx").on(t.seriesId, t.locationId),
    index("vds_location_asset_media_idx").on(t.mediaAssetId),
  ]
);

export type VerticalDramaLocationAssetRow =
  typeof verticalDramaLocationAssets.$inferSelect;
export type InsertVerticalDramaLocationAssetRow =
  typeof verticalDramaLocationAssets.$inferInsert;

/** Episodes — per-episode plan, manifests, and status (spec §7.3). */
export const verticalDramaEpisodes = pgTable(
  "vertical_drama_episodes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    episodeNumber: integer("episodeNumber").notNull(),
    title: varchar("title", { length: 255 }),
    status: varchar("status", { length: 30 }).default("draft").notNull(),
    targetDurationSeconds: integer("targetDurationSeconds")
      .default(60)
      .notNull(),
    durationProfileId: varchar("durationProfileId", { length: 64 })
      .default("vertical_drama_60s_9_frames_8_clips")
      .notNull(),
    /** Guide-compatible stage payloads (typed projections in shared contracts). */
    script: jsonb("script"),
    storyboard: jsonb("storyboard"),
    startFramePlan: jsonb("startFramePlan"),
    dialogueAudioPlan: jsonb("dialogueAudioPlan"),
    motionPromptPack: jsonb("motionPromptPack"),
    assemblyManifest: jsonb("assemblyManifest"),
    /** Backlink to the Storyboard Review project (media_studio_storyboard_reviews). */
    storyboardReviewId: varchar("storyboardReviewId", { length: 64 }),
    /**
     * Ad Banner Overlay (F131W, #30-A2) — this EPISODE's selection of the
     * series' `productTieIn.adBanners[]` designs to composite into THIS
     * episode's video, with optional per-selection timing overrides
     * (`VdEpisodeAdBannerPlan` — `@shared`-free, router-local type in
     * `verticalDramaEpisodes.ts`, since `shared/verticalDramaSeries/
     * adBannerPresets.ts` is owned by the A1 series-studio wave and only
     * defines the SERIES-level design shape, not this per-episode usage
     * shape). Nullable JSONB, additive; same "hand-authored migration,
     * schema.ts catches up separately" convention as this table's sibling
     * `voiceConfig` column on `vertical_drama_characters` — see
     * `manual_vertical_drama_episode_ad_banner_plan.sql` for the idempotent
     * `ADD COLUMN IF NOT EXISTS` record. Zero data-loss: nullable ADD COLUMN,
     * existing rows get `adBannerPlan = NULL` (client/server treat NULL as "no
     * banners selected for this episode yet"). Read/written via
     * `updateEpisodeAdBannerPlan` (flag-gated on `verticalDramaSeriesAdBannerOverlay`, F131W).
     */
    adBannerPlan: jsonb("adBannerPlan"),
    /**
     * Text Overlay Suite (task #34, F131AB) — this EPISODE's text-overlay
     * plan (`VdTextOverlayPlan`, `@shared/verticalDramaSeries/textOverlay.ts`):
     * endCard/openerRecap/titleBumper/episodeIndicator/characterIntroCards/
     * cards[]. Nullable JSONB, additive; same "hand-authored migration,
     * schema.ts catches up separately" convention as this table's sibling
     * `adBannerPlan` column — see
     * `manual_vertical_drama_episode_text_overlay_plan.sql` for the
     * idempotent `ADD COLUMN IF NOT EXISTS` record. Zero data-loss: nullable
     * ADD COLUMN, existing rows get `textOverlayPlan = NULL` (client/server
     * treat NULL as "no text overlay plan configured yet" — every kind
     * defaults to disabled). Read/written via `updateEpisodeTextOverlayPlan`
     * (flag-gated on `verticalDramaSeriesTextOverlaySuite`, F131AB).
     */
    textOverlayPlan: jsonb("textOverlayPlan"),
    /**
     * Episode cover image state (Vertical Drama episode cover generation).
     * Nullable/additive JSONB; persisted task, asset, and prompt provenance
     * are kept separate from Start Frame and compiled-video state. The
     * hand-authored migration is `manual_vertical_drama_episode_cover_image.sql`
     * because this table lineage uses manual migrations around the existing
     * drizzle meta-journal collision.
     */
    coverImage: jsonb("coverImage"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("vds_episode_number_unique").on(
      t.tenantId,
      t.seriesId,
      t.episodeNumber
    ),
    index("vds_episode_status_idx").on(t.tenantId, t.seriesId, t.status),
  ]
);

export type VerticalDramaEpisodeRow = typeof verticalDramaEpisodes.$inferSelect;
export type InsertVerticalDramaEpisodeRow =
  typeof verticalDramaEpisodes.$inferInsert;

/**
 * Read-only series share links (Collab-lite L1, task #32, F131AA,
 * planning/vertical-drama-share-links/plan.md) — an owner-created, expiring
 * URL that lets anyone with the link view a whitelisted, read-only story
 * projection of the series (no account/login). Brand-new table — see
 * `manual_vertical_drama_series_share_links.sql` for the idempotent
 * `CREATE TABLE IF NOT EXISTS` record (same "hand-authored migration,
 * schema.ts catches up separately" convention as this table's sibling
 * `manual_vertical_drama_*.sql` files — drizzle-kit generate/migrate is
 * blocked for this table lineage by the same pre-existing meta-journal
 * collision documented there).
 *
 * `tokenHash` stores ONLY a SHA-256 hex digest of the raw share token
 * (`crypto.randomBytes(32)` -> base64url) — the raw token is NEVER
 * persisted; it is returned exactly once in the create-mutation response.
 * See `server/services/verticalDramaShareLinks.ts` for token generation,
 * hashing, expiry/revocation checks, and the whitelist projection DTO
 * served by the public `verticalDramaShare.getSharedSeries` procedure.
 *
 * `seriesId` is `bigint` (not `integer`) to match `verticalDramaSeries.id`'s
 * actual `bigserial` column type. `tenantId` deliberately has NO `.references()`
 * FK constraint, matching every sibling `vertical_drama_*` table's own
 * `tenantId` column (see `verticalDramaSeries`/`verticalDramaEpisodes` above).
 */
export const verticalDramaSeriesShareLinks = pgTable(
  "vertical_drama_series_share_links",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    createdByUserId: integer("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 hex digest of the raw token — 64 hex chars, never the raw token itself. */
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    /** Reserved for future non-"series_read" scopes; only "series_read" is issued today. */
    scope: varchar("scope", { length: 30 }).default("series_read").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastAccessedAt: timestamp("lastAccessedAt", { withTimezone: true }),
    accessCount: integer("accessCount").default(0).notNull(),
  },
  t => [
    uniqueIndex("vds_share_links_token_hash_unique").on(t.tokenHash),
    // Owner-side listing/cap-counting: `WHERE seriesId = ? AND revokedAt IS
    // NULL AND expiresAt > now()`.
    index("vds_share_links_series_idx").on(
      t.seriesId,
      t.revokedAt,
      t.expiresAt
    ),
  ]
);

export type VerticalDramaSeriesShareLinkRow =
  typeof verticalDramaSeriesShareLinks.$inferSelect;
export type InsertVerticalDramaSeriesShareLinkRow =
  typeof verticalDramaSeriesShareLinks.$inferInsert;

/**
 * Per-shot reference image set (storyboard-complete plan, Phase 2). Each of
 * the 9 storyboard shots has exactly one primary start frame today
 * (`episodes.startFramePlan.frames[i].approvedMediaAssetId`) — this table
 * stores ADDITIONAL reference images for that shot (from 3x3 grid cuts,
 * generation history, the media library, or direct upload) that are sent as
 * `reference_images` to video generation alongside the approved start frame.
 * `role` distinguishes an explicit start-frame duplicate link (rare — mirrors
 * the primary frame into this table for a uniform reference list) from the
 * common `reference` case. Always references a canonical `media_assets` row,
 * never a provider URL.
 */
export const verticalDramaShotReferences = pgTable(
  "vertical_drama_shot_references",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    episodeId: bigint("episodeId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaEpisodes.id, { onDelete: "cascade" }),
    shotNumber: integer("shotNumber").notNull(),
    /** Canonical asset registry reference — never a provider URL. Always required (a reference row without an asset is meaningless). */
    mediaAssetId: bigint("mediaAssetId", { mode: "number" })
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).default("reference").notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_shot_ref_lookup_idx").on(
      t.tenantId,
      t.seriesId,
      t.episodeId,
      t.shotNumber
    ),
    uniqueIndex("vds_shot_ref_unique").on(
      t.episodeId,
      t.shotNumber,
      t.mediaAssetId
    ),
  ]
);

export type VerticalDramaShotReferenceRow =
  typeof verticalDramaShotReferences.$inferSelect;
export type InsertVerticalDramaShotReferenceRow =
  typeof verticalDramaShotReferences.$inferInsert;

/** Episode stage runs — resumable per-stage execution state (spec §11.4/§11.5). */
export const verticalDramaEpisodeRuns = pgTable(
  "vertical_drama_episode_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    episodeId: bigint("episodeId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaEpisodes.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 48 }).notNull(),
    runMode: varchar("runMode", { length: 20 }).default("dry_run").notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    nextAction: varchar("nextAction", { length: 32 }).default("none").notNull(),
    /** string[] of run_artifact IDs emitted by this stage. */
    artifactIds: jsonb("artifactIds"),
    warnings: jsonb("warnings"),
    errors: jsonb("errors"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_run_episode_idx").on(t.tenantId, t.seriesId, t.episodeId),
    index("vds_run_stage_idx").on(t.tenantId, t.seriesId, t.episodeId, t.stage),
  ]
);

export type VerticalDramaEpisodeRunRow =
  typeof verticalDramaEpisodeRuns.$inferSelect;
export type InsertVerticalDramaEpisodeRunRow =
  typeof verticalDramaEpisodeRuns.$inferInsert;

/** Durable run artifacts — the inspectable artifact ledger (spec §7.3). */
export const verticalDramaRunArtifacts = pgTable(
  "vertical_drama_run_artifacts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    episodeId: bigint("episodeId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaEpisodes.id, { onDelete: "cascade" }),
    runId: bigint("runId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaEpisodeRuns.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 40 }).notNull(),
    storageKey: text("storageKey"),
    jsonPayload: jsonb("jsonPayload"),
    /** number[] of media_assets IDs linked to this artifact. */
    mediaAssetIds: jsonb("mediaAssetIds"),
    checksumSha256: varchar("checksumSha256", { length: 64 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_artifact_lookup_idx").on(
      t.tenantId,
      t.seriesId,
      t.episodeId,
      t.runId,
      t.stage
    ),
  ]
);

export type VerticalDramaRunArtifactRow =
  typeof verticalDramaRunArtifacts.$inferSelect;
export type InsertVerticalDramaRunArtifactRow =
  typeof verticalDramaRunArtifacts.$inferInsert;

/** Approval checkpoints — durable per-stage approval artifacts (spec §11.2). */
export const verticalDramaApprovalCheckpoints = pgTable(
  "vertical_drama_approval_checkpoints",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    episodeId: bigint("episodeId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaEpisodes.id, { onDelete: "cascade" }),
    runId: bigint("runId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaEpisodeRuns.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 48 }).notNull(),
    state: varchar("state", { length: 20 }).default("pending").notNull(),
    approvedByUserId: integer("approvedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectedByUserId: integer("rejectedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    /** string[] — source artifacts under review (never overwritten on repair). */
    sourceArtifactIds: jsonb("sourceArtifactIds"),
    repairRequestIds: jsonb("repairRequestIds"),
    notes: text("notes"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_checkpoint_episode_idx").on(t.tenantId, t.seriesId, t.episodeId),
    index("vds_checkpoint_lookup_idx").on(
      t.tenantId,
      t.seriesId,
      t.episodeId,
      t.runId,
      t.stage
    ),
  ]
);

export type VerticalDramaApprovalCheckpointRow =
  typeof verticalDramaApprovalCheckpoints.$inferSelect;
export type InsertVerticalDramaApprovalCheckpointRow =
  typeof verticalDramaApprovalCheckpoints.$inferInsert;

/** Append-only memory events — never mutated in place; retcons append (spec §7.6). */
export const verticalDramaMemoryEvents = pgTable(
  "vertical_drama_memory_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    episodeId: bigint("episodeId", { mode: "number" }).references(
      () => verticalDramaEpisodes.id,
      { onDelete: "set null" }
    ),
    runId: bigint("runId", { mode: "number" }).references(
      () => verticalDramaEpisodeRuns.id,
      { onDelete: "set null" }
    ),
    memoryKind: varchar("memoryKind", { length: 40 }).notNull(),
    payload: jsonb("payload").notNull(),
    summaryText: text("summaryText"),
    /** string[] of memory event IDs this event supersedes (retcon proposals). */
    supersedesEventIds: jsonb("supersedesEventIds"),
    approved: boolean("approved"),
    approvedByUserId: integer("approvedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_memory_event_retrieval_idx").on(
      t.tenantId,
      t.seriesId,
      t.memoryKind,
      t.createdAt
    ),
  ]
);

export type VerticalDramaMemoryEventRow =
  typeof verticalDramaMemoryEvents.$inferSelect;
export type InsertVerticalDramaMemoryEventRow =
  typeof verticalDramaMemoryEvents.$inferInsert;

/** Compact memory snapshots — rolling summary distinct from append-only events (spec §7.6). */
export const verticalDramaMemorySnapshots = pgTable(
  "vertical_drama_memory_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    compactedMemoryText: text("compactedMemoryText"),
    /** Full VerticalDramaSeriesMemory projection at snapshot time. */
    memory: jsonb("memory"),
    checksumSha256: varchar("checksumSha256", { length: 64 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_memory_snapshot_idx").on(t.tenantId, t.seriesId, t.updatedAt),
  ]
);

export type VerticalDramaMemorySnapshotRow =
  typeof verticalDramaMemorySnapshots.$inferSelect;
export type InsertVerticalDramaMemorySnapshotRow =
  typeof verticalDramaMemorySnapshots.$inferInsert;

/** QC reports — searchable by run/stage, not hidden inside opaque artifacts (spec §16). */
export const verticalDramaQcReports = pgTable(
  "vertical_drama_qc_reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: bigint("seriesId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaSeries.id, { onDelete: "cascade" }),
    episodeId: bigint("episodeId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaEpisodes.id, { onDelete: "cascade" }),
    runId: bigint("runId", { mode: "number" })
      .notNull()
      .references(() => verticalDramaEpisodeRuns.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 40 }).notNull(),
    passed: boolean("passed").default(false).notNull(),
    score: real("score").default(0).notNull(),
    issues: jsonb("issues"),
    recommendedRepairs: jsonb("recommendedRepairs"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_qc_lookup_idx").on(
      t.tenantId,
      t.seriesId,
      t.episodeId,
      t.runId,
      t.stage
    ),
  ]
);

export type VerticalDramaQcReportRow =
  typeof verticalDramaQcReports.$inferSelect;
export type InsertVerticalDramaQcReportRow =
  typeof verticalDramaQcReports.$inferInsert;

/**
 * Genre presets for the Create-Series Wizard (spec feature 131 UI addendum,
 * ownership added in section-11-user-and-admin-preset-ownership).
 * Pre-filled genre, plot, logline, characters, and visual bible so a series
 * can start from a rich template instead of a blank form. `charactersJson` is
 * an array of `{ name, role, description }`.
 *
 * Ownership: `scope: "global"` presets (`tenantId`/`userId` NULL) are visible
 * to every user — this is the seeded catalog plus anything an admin chose to
 * publish. `scope: "private"` presets are visible only to the owning
 * `tenantId`+`userId` — a user's own "Save as preset" on their series.
 */
export const verticalDramaGenrePresets = pgTable(
  "vertical_drama_genre_presets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    title: varchar("title", { length: 150 }).notNull(),
    category: varchar("category", { length: 60 }).notNull(),
    locale: varchar("locale", { length: 8 }).default("th").notNull(),
    logline: text("logline").notNull(),
    mainPlot: text("mainPlot").notNull(),
    seasonArc: text("seasonArc").notNull(),
    tone: varchar("tone", { length: 100 }).notNull(),
    cliffhangerStyle: varchar("cliffhangerStyle", { length: 150 }).notNull(),
    charactersJson: jsonb("charactersJson").notNull(),
    visualBible: text("visualBible").notNull(),
    /** VerticalDramaPresetVisualIdentity (spec 131 §8.2.2) — structured look that flows to prompts */
    visualIdentityJson: jsonb("visualIdentityJson"),
    sortOrder: integer("sortOrder").default(0).notNull(),
    scope: varchar("scope", { length: 20 }).default("global").notNull(),
    tenantId: varchar("tenantId", { length: 36 }),
    userId: integer("userId").references(() => users.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vds_genre_presets_locale_idx").on(t.locale, t.sortOrder),
    index("vds_genre_presets_owner_idx").on(t.tenantId, t.userId, t.scope),
  ]
);

export type VerticalDramaGenrePresetRow =
  typeof verticalDramaGenrePresets.$inferSelect;
export type InsertVerticalDramaGenrePresetRow =
  typeof verticalDramaGenrePresets.$inferInsert;

/**
 * Durable pre-create draft ledger. The ledger is intentionally independent of
 * a series row because it exists before the creator applies the draft.
 * `currentJson` is the recoverable structured snapshot; every change is also
 * retained in `verticalDramaDraftVersions` and mirrored to immutable storage.
 */
export const verticalDramaDraftLedgers = pgTable(
  "vertical_drama_draft_ledgers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** Human-facing stable job number; the UUID remains the API identity. */
    jobCode: bigint("jobCode", { mode: "number" })
      .notNull()
      .default(sql`nextval('vertical_drama_draft_job_code_seq')`),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    draftSessionId: varchar("draftSessionId", { length: 120 }).notNull(),
    jobStatus: varchar("jobStatus", { length: 32 })
      .notNull()
      .default("queued"),
    /** Server-approved input snapshot needed to restore a selected job. */
    requestJson: jsonb("requestJson").notNull().default({}),
    compositionJobId: varchar("compositionJobId", { length: 36 }),
    qcRunId: varchar("qcRunId", { length: 36 }),
    lastError: text("lastError"),
    lastQcScore: integer("lastQcScore"),
    lastQcPassed: boolean("lastQcPassed"),
    archivedAt: timestamp("archivedAt", { withTimezone: true }),
    currentVersion: integer("currentVersion").notNull().default(0),
    currentStage: varchar("currentStage", { length: 40 }).notNull().default("created"),
    currentJson: jsonb("currentJson").notNull().default({}),
    currentMarkdownKey: text("currentMarkdownKey"),
    currentJsonKey: text("currentJsonKey"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("vdd_ledger_owner_session_idx").on(t.tenantId, t.userId, t.draftSessionId),
    index("vdd_ledger_owner_updated_idx").on(t.tenantId, t.userId, t.updatedAt),
  ],
);

export type VerticalDramaDraftLedgerRow =
  typeof verticalDramaDraftLedgers.$inferSelect;
export type InsertVerticalDramaDraftLedgerRow =
  typeof verticalDramaDraftLedgers.$inferInsert;

/** Immutable snapshots. There is deliberately no update/delete path. */
export const verticalDramaDraftVersions = pgTable(
  "vertical_drama_draft_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    draftId: varchar("draftId", { length: 36 })
      .notNull()
      .references(() => verticalDramaDraftLedgers.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    stage: varchar("stage", { length: 40 }).notNull(),
    contentJson: jsonb("contentJson").notNull(),
    markdown: text("markdown").notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    jsonStorageKey: text("jsonStorageKey").notNull(),
    markdownStorageKey: text("markdownStorageKey").notNull(),
    parentVersion: integer("parentVersion"),
    jobId: varchar("jobId", { length: 36 }),
    runId: varchar("runId", { length: 36 }),
    changedPaths: jsonb("changedPaths").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("vdd_versions_draft_version_idx").on(t.draftId, t.version),
    index("vdd_versions_draft_created_idx").on(t.draftId, t.createdAt),
    index("vdd_versions_hash_idx").on(t.contentHash),
  ],
);

export type VerticalDramaDraftVersionRow =
  typeof verticalDramaDraftVersions.$inferSelect;
export type InsertVerticalDramaDraftVersionRow =
  typeof verticalDramaDraftVersions.$inferInsert;

/**
 * Video Intelligence Platform (feature 133, section-05-db-tables-brand-kit)
 * — mirrors `drizzle/manual_video_intelligence_tables.sql` exactly (that
 * migration was hand-authored and applied directly via psql because
 * `drizzle-kit generate` is blocked by the pre-existing meta-journal
 * collision documented there; these `pgTable` definitions were the missing
 * ORM-side counterpart — the tables already exist in the database).
 * `brand_kits` is declared first so `video_projects.brandKitId` can
 * reference it.
 */
export const brandKits = pgTable(
  "brand_kits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    logoAssetId: bigint("logoAssetId", { mode: "number" }).references(
      () => mediaAssets.id,
      { onDelete: "set null" },
    ),
    colors: jsonb("colors").$type<Record<string, unknown>>(),
    fonts: jsonb("fonts").$type<Record<string, unknown>>(),
    captionPresetId: varchar("captionPresetId", { length: 64 }),
    locks: jsonb("locks").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [index("brand_kits_tenant_user_idx").on(t.tenantId, t.userId)],
);

export type BrandKitRow = typeof brandKits.$inferSelect;
export type InsertBrandKitRow = typeof brandKits.$inferInsert;

export const videoProjects = pgTable(
  "video_projects",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studioType: varchar("studioType", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("brief"),
    automationMode: varchar("automationMode", { length: 10 })
      .notNull()
      .default("guided"),
    brief: jsonb("brief").$type<Record<string, unknown>>(),
    document: jsonb("document").$type<Record<string, unknown>>(),
    revision: integer("revision").notNull().default(1),
    brandKitId: bigint("brandKitId", { mode: "number" }).references(
      () => brandKits.id,
      { onDelete: "set null" },
    ),
    sourceRefs: jsonb("sourceRefs").$type<Record<string, unknown>>(),
    qaLedger: jsonb("qaLedger").$type<Record<string, unknown>>(),
    renderJobId: varchar("renderJobId", { length: 36 }),
    previewJobId: varchar("previewJobId", { length: 36 }),
    resultLibraryItemId: integer("resultLibraryItemId").references(
      () => libraryItems.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("video_projects_tenant_user_status_idx").on(
      t.tenantId,
      t.userId,
      t.status,
    ),
    index("video_projects_tenant_studio_idx").on(t.tenantId, t.studioType),
  ],
);

export type VideoProjectRow = typeof videoProjects.$inferSelect;
export type InsertVideoProjectRow = typeof videoProjects.$inferInsert;

export const videoProjectRevisions = pgTable(
  "video_project_revisions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    projectId: bigint("projectId", { mode: "number" })
      .notNull()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    document: jsonb("document").$type<Record<string, unknown>>().notNull(),
    createdBy: integer("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: varchar("reason", { length: 200 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("video_project_revisions_project_revision_unique").on(
      t.projectId,
      t.revision,
    ),
  ],
);

export type VideoProjectRevisionRow =
  typeof videoProjectRevisions.$inferSelect;
export type InsertVideoProjectRevisionRow =
  typeof videoProjectRevisions.$inferInsert;
