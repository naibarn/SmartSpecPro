/**
 * System Settings tRPC Router
 * Admin-only routes for managing platform configuration (Stripe, Invoice, etc.)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, domainAdminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { systemSettings, invoiceConfig, tenants } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";
import {
  isValidGoogleRedirectUri,
  validateGoogleOAuthFormat,
} from "../services/googleOAuthValidation";
import { signBearerToken } from "../_core/tokens";
import { loadTenantAutomationPolicyStatus, updateTenantAutomationPolicySettings } from "../services/browserPolicySettingsBridge";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import {
  getDesktopReleaseConfig,
  updateDesktopReleaseConfig,
} from "../services/desktopReleaseSettings";
import { clearDocumentOcrSettingsCache, getDocumentOcrSettings } from "../services/documentOcrSettings";
import { clearFinanceSlipMappingPresetCache } from "../services/financeSlipPresetSettings";
import { clearPinnedMerchantPresetCache } from "../services/financeMerchantPresetSettings";
import {
  HERMES_WORKER_FULL_ENABLEMENT_PRESET,
  HERMES_WORKER_SAFE_ENABLEMENT_PRESET,
  HERMES_WORKER_SETTINGS_KEYS,
  getHermesWorkerSettings,
} from "../services/hermesWorkerSettings";
import { validateHermesLimitCoherence } from "../services/hermesMediaAdmission";
import { DOCUMENT_OCR_PROVIDER_IDS } from "../../shared/documentOcrRouting";
import {
  browserPolicyConfigSchema,
  browserPolicyUserCustomizationSchema,
} from "../../shared/browserPolicy";

// ============================================================
// System Settings Router
// ============================================================

const settingCategorySchema = z.enum([
  "stripe",
  "invoice",
  "email",
  "general",
  "oauth",
  "meta_channels",
  "ai",
  "telegram",
  "vectordb",
  "credit_pricing",
  "infrastructure",
  "tenant_automation",
  "desktop_release",
  "document_ocr",
  "finance",
  "marketplace_capture",
]);

const desktopReleaseSettingsUpdateSchema = z.object({
  githubRepository: z.string().trim().min(1).max(256),
  githubWorkflow: z.string().trim().min(1).max(256),
  githubRef: z.string().trim().min(1).max(256),
  webUrl: z.string().trim().min(1).max(2048),
  githubToken: z.string().trim().max(4096).optional(),
});

const documentOcrTestConnectionSchema = z.object({
  providerId: z.enum([
    DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15,
    DOCUMENT_OCR_PROVIDER_IDS.landingAiAde,
    DOCUMENT_OCR_PROVIDER_IDS.googleAiVision,
  ]),
  apiKey: z.string().trim().max(8192).optional(),
});

type DocumentOcrTestConnectionResult = {
  success: boolean;
  providerId: string;
  message: string;
  elapsedMs?: number | null;
  rateLimitNote?: string | null;
};

const stripeSettingsSchema = z.object({
  secretKey: z.string().optional(),
  publishableKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  currency: z.string().default("usd"),
  // Price IDs for subscription plans (legacy, now stored in packages)
  priceIds: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

const tenantIdInputSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .pipe(z.string().min(1));

const invoiceConfigSchema = z.object({
  tenantId: tenantIdInputSchema.optional().nullable(),
  companyName: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  taxId: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  logoUrl: z.string().optional(),
  footerText: z.string().optional(),
  termsText: z.string().optional(),
  bankDetails: z.object({
    bankName: z.string().optional(),
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
    swiftCode: z.string().optional(),
    iban: z.string().optional(),
  }).optional(),
  customFields: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
  isActive: z.boolean().default(true),
});

const PY_TIMEOUT_MS = 10_000;

async function readPythonErrorDetail(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
  } catch {
    // fall through to raw text
  }
  return raw;
}

function createAdminBearerToken(userId: number): string {
  return signBearerToken(
    {
      sub: String(userId),
      type: "access",
      scopes: ["admin:*"],
    },
    "5m",
  );
}

async function fetchPythonAdminJson<T>(params: {
  path: string;
  userId: number;
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<T> {
  const runtime = await getAppRuntimeConfig();
  const token = createAdminBearerToken(params.userId);
  const response = await fetch(`${runtime.pythonBackendUrl}${params.path}`, {
    method: params.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(params.headers ?? {}),
    },
    signal: AbortSignal.timeout(PY_TIMEOUT_MS),
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });

  if (!response.ok) {
    const detail = await readPythonErrorDetail(response);
    throw new Error(detail || `python_admin_request_failed:${response.status}`);
  }

  return ( await response.json()) as T;
}

async function assertVectorDbConfigEditAllowedOrThrow(params: {
  userId: number;
  tenantId?: string | null;
  emergency?: boolean;
}): Promise<void> {
  const runtime = await getAppRuntimeConfig();
  const token = createAdminBearerToken(params.userId);
  const response = await fetch(`${runtime.pythonBackendUrl}/api/admin/vectordb/provider-switch/assert-config-edit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(PY_TIMEOUT_MS),
    body: JSON.stringify({
      tenant_id: params.tenantId ?? null,
      emergency: params.emergency ?? false,
    }),
  });

  if (response.ok) {
    return;
  }

  const detail = await readPythonErrorDetail(response);
  if (response.status === 409) {
    throw new Error(detail || "cutover_non_emergency_edit_blocked");
  }
  throw new Error(detail || `vectordb_cutover_guard_failed:${response.status}`);
}

async function resolveTenantAutomationPolicyTenantId(params: {
  user: {
    role: string;
    registeredDomain?: string | null;
    currentTenantId?: string | number | null;
  };
  ctxTenantId?: string | null;
  requestedTenantId?: string | null;
}): Promise<string> {
  const requestedTenantId = params.requestedTenantId?.trim() || null;
  if (params.user.role === "admin") {
    const tenantId = requestedTenantId ?? params.ctxTenantId ?? String(params.user.currentTenantId ?? "").trim();
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
    }
    return tenantId;
  }

  const registeredDomain = params.user.registeredDomain?.trim();
  if (!registeredDomain) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "domain_admin must have a registeredDomain to manage tenant automation policy",
    });
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }

  if (requestedTenantId) {
    const [targetTenant] = await db
      .select({ id: tenants.id, primaryDomain: tenants.primaryDomain })
      .from(tenants)
      .where(eq(tenants.id, requestedTenantId))
      .limit(1);

    if (!targetTenant || targetTenant.primaryDomain !== registeredDomain) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "domain_admin can only manage automation policy for their own tenant",
      });
    }
    return targetTenant.id;
  }

  const [ownTenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.primaryDomain, registeredDomain))
    .limit(1);
  if (!ownTenant) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tenant found for your registered domain",
    });
  }
  return ownTenant.id;
}

async function upsertSystemSetting(params: {
  category: string;
  key: string;
  value: string;
  sensitive: boolean;
  userId?: number;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const storedValue = params.sensitive ? encrypt(params.value) : params.value;
  const existing = await db
    .select()
    .from(systemSettings)
    .where(and(
      eq(systemSettings.category, params.category as any),
      eq(systemSettings.key, params.key),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(systemSettings)
      .set({
        value: storedValue,
        isSensitive: params.sensitive,
        description: params.description ?? existing[0].description,
        updatedBy: params.userId,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, existing[0].id));
  } else {
    await db.insert(systemSettings).values({
      category: params.category,
      key: params.key,
      value: storedValue,
      isSensitive: params.sensitive,
      description: params.description,
      updatedBy: params.userId,
    });
  }
}

export const systemSettingsRouter = router({
  // ============================================================
  // Stripe Settings
  // ============================================================

  /**
   * Get Stripe settings (masked sensitive values)
   */
  getStripeSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "stripe"));

    const result: Record<string, string | undefined> = {
      secretKey: undefined,
      publishableKey: undefined,
      webhookSecret: undefined,
      currency: "usd",
    };

    for (const setting of settings) {
      if (setting.key === "secretKey" && setting.value) {
        // Mask secret key - never reveal any part of the actual key
        result.secretKey = "sk_" + "*".repeat(24);
        result.secretKeyConfigured = "true";
      } else if (setting.key === "publishableKey") {
        result.publishableKey = setting.value || undefined;
      } else if (setting.key === "webhookSecret" && setting.value) {
        result.webhookSecret = "whsec_" + "*".repeat(20);
        result.webhookSecretConfigured = "true";
      } else if (setting.key === "currency") {
        result.currency = setting.value || "usd";
      }
    }

    return result;
  }),

  /**
   * Update Stripe settings
   */
  updateStripeSettings: adminProcedure
    .input(stripeSettingsSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updates = [
        { key: "secretKey", value: input.secretKey, sensitive: true },
        { key: "publishableKey", value: input.publishableKey, sensitive: false },
        { key: "webhookSecret", value: input.webhookSecret, sensitive: true },
        { key: "currency", value: input.currency, sensitive: false },
      ];

      for (const update of updates) {
        if (update.value !== undefined) {
          // Encrypt sensitive values before storage
          const storedValue = update.sensitive ? encrypt(update.value) : update.value;

          // Check if setting exists
          const existing = await db
            .select()
            .from(systemSettings)
            .where(and(
              eq(systemSettings.category, "stripe"),
              eq(systemSettings.key, update.key)
            ))
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(systemSettings)
              .set({
                value: storedValue,
                isSensitive: update.sensitive,
                updatedBy: ctx.user?.id,
                updatedAt: new Date(),
              })
              .where(eq(systemSettings.id, existing[0].id));
          } else {
            await db.insert(systemSettings).values({
              category: "stripe",
              key: update.key,
              value: storedValue,
              isSensitive: update.sensitive,
              description: `Stripe ${update.key}`,
              updatedBy: ctx.user?.id,
            });
          }
        }
      }

      return { success: true };
    }),

  /**
   * Test Stripe connection
   */
  testStripeConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get the secret key from settings
    const secretKeySetting = await db
      .select()
      .from(systemSettings)
      .where(and(
        eq(systemSettings.category, "stripe"),
        eq(systemSettings.key, "secretKey")
      ))
      .limit(1);

    if (!secretKeySetting.length || !secretKeySetting[0].value) {
      return { success: false, message: "Stripe secret key not configured" };
    }

    try {
      // Dynamic import to avoid issues if stripe is not installed
      const stripe = await import("stripe");
      const decryptedKey = decrypt(secretKeySetting[0].value || "");
      if (!decryptedKey) {
        return { success: false, message: "Failed to decrypt Stripe key" };
      }
      const stripeClient = new stripe.default(decryptedKey);

      // Try to fetch account info to verify the key
      const account = await stripeClient.accounts.retrieve();

      return {
        success: true,
        message: `Connected to Stripe account: ${account.business_profile?.name || account.id}`,
        accountId: account.id,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Failed to connect to Stripe",
      };
    }
  }),

  // ============================================================
  // Invoice Configuration
  // ============================================================

  /**
   * Get global invoice configuration
   */
  getGlobalInvoiceConfig: domainAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [config] = await db
      .select()
      .from(invoiceConfig)
      .where(isNull(invoiceConfig.tenantId))
      .limit(1);

    return config || null;
  }),

  /**
   * Get invoice configuration for a specific tenant
   */
  getTenantInvoiceConfig: domainAdminProcedure
    .input(z.object({ tenantId: tenantIdInputSchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [config] = await db
        .select()
        .from(invoiceConfig)
        .where(eq(invoiceConfig.tenantId, input.tenantId))
        .limit(1);

      return config || null;
    }),

  /**
   * List all invoice configurations
   */
  listInvoiceConfigs: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const configs = await db
      .select({
        config: invoiceConfig,
        tenant: {
          id: tenants.id,
          name: tenants.name,
          domain: tenants.primaryDomain,
        },
      })
      .from(invoiceConfig)
      .leftJoin(tenants, eq(invoiceConfig.tenantId, tenants.id));

    return configs.map((row) => ({
      ...row.config,
      tenant: row.tenant,
    }));
  }),

  /**
   * Create or update invoice configuration
   */
  upsertInvoiceConfig: domainAdminProcedure
    .input(invoiceConfigSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const normalizedInput = {
        ...input,
        tenantId: input.tenantId ?? null,
      };

      const whereClause = normalizedInput.tenantId
        ? eq(invoiceConfig.tenantId, normalizedInput.tenantId)
        : isNull(invoiceConfig.tenantId);

      const existing = await db
        .select()
        .from(invoiceConfig)
        .where(whereClause)
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(invoiceConfig)
          .set({
            ...normalizedInput,
            updatedAt: new Date(),
          })
          .where(eq(invoiceConfig.id, existing[0].id));

        return { success: true, id: existing[0].id, updated: true };
      } else {
        const [result] = await db.insert(invoiceConfig).values(normalizedInput).returning();
        return { success: true, id: result.id, updated: false };
      }
    }),

  /**
   * Delete invoice configuration
   */
  deleteInvoiceConfig: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(invoiceConfig).where(eq(invoiceConfig.id, input.id));
      return { success: true };
    }),

  /**
   * List all tenants (for admin tenant selector)
   */
  listTenants: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db.select({ id: tenants.id, name: tenants.name, domain: tenants.primaryDomain }).from(tenants);
  }),

  // ============================================================
  // General Settings
  // ============================================================

  /**
   * Get a setting by category and key
   */
  getSetting: adminProcedure
    .input(z.object({
      category: settingCategorySchema,
      key: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [setting] = await db
        .select()
        .from(systemSettings)
        .where(and(
          eq(systemSettings.category, input.category),
          eq(systemSettings.key, input.key)
        ))
        .limit(1);

      if (!setting) return null;

      // Mask sensitive values
      if (setting.isSensitive && setting.value) {
        return {
          ...setting,
          value: "***configured***",
          isConfigured: true,
        };
      }

      return setting;
    }),

  /**
   * Get all settings for a category
   */
  getSettingsByCategory: adminProcedure
    .input(z.object({ category: settingCategorySchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const settings = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.category, input.category));

      // Mask sensitive values
      return settings.map((s) => ({
        ...s,
        value: s.isSensitive && s.value ? "***configured***" : s.value,
        isConfigured: s.isSensitive && s.value ? true : undefined,
      }));
    }),

  getDesktopReleaseSettings: adminProcedure.query(async () => {
    const config = await getDesktopReleaseConfig();
    return {
      githubRepository: config.githubRepository,
      githubRepositorySource: config.githubRepositorySource,
      githubWorkflow: config.githubWorkflow,
      githubWorkflowSource: config.githubWorkflowSource,
      githubRef: config.githubRef,
      githubRefSource: config.githubRefSource,
      webUrl: config.webUrl,
      webUrlSource: config.webUrlSource,
      githubTokenConfigured: config.githubTokenConfigured,
      githubTokenSource: config.githubTokenSource,
    };
  }),

  getTenantAutomationPolicyStatus: domainAdminProcedure
    .input(z.object({ tenantId: tenantIdInputSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = await resolveTenantAutomationPolicyTenantId({
        user: ctx.user!,
        ctxTenantId: ctx.tenantId ?? null,
        requestedTenantId: input?.tenantId ?? null,
      });
      return loadTenantAutomationPolicyStatus(tenantId);
    }),

  updateTenantAutomationPolicySettings: domainAdminProcedure
    .input(z.object({
      tenantId: tenantIdInputSchema.optional(),
      enabled: browserPolicyConfigSchema.shape.enabled,
      enforcementMode: browserPolicyConfigSchema.shape.enforcementMode,
      defaultApprovalTtlSeconds: browserPolicyConfigSchema.shape.defaultApprovalTtlSeconds,
      reviewCadenceDays: browserPolicyConfigSchema.shape.reviewCadenceDays,
      killSwitchEnabled: browserPolicyConfigSchema.shape.killSwitchEnabled,
      requireTamperEvidence: browserPolicyConfigSchema.shape.requireTamperEvidence,
      evidenceRetentionDays: browserPolicyConfigSchema.shape.evidenceRetentionDays,
      allowedDomains: browserPolicyConfigSchema.shape.allowedDomains,
      visionModel: browserPolicyConfigSchema.shape.visionModel,
      userCustomization: browserPolicyUserCustomizationSchema.optional(),
      allowedVisionModels: z.array(z.string().min(1)).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = await resolveTenantAutomationPolicyTenantId({
        user: ctx.user!,
        ctxTenantId: ctx.tenantId ?? null,
        requestedTenantId: input.tenantId ?? null,
      });
      const {
        tenantId: _tenantId,
        userCustomization,
        allowedVisionModels,
        ...config
      } = input;

      return updateTenantAutomationPolicySettings({
        tenantId,
        userId: ctx.user?.id ?? null,
        config,
        userCustomization,
        allowedVisionModels,
      });
    }),

  /**
   * Update a setting
   */
  updateSetting: adminProcedure
    .input(z.object({
      category: settingCategorySchema,
      key: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
      value: z.string().optional(),
      valueJson: z.record(z.any()).optional(),
      isSensitive: z.boolean().optional(),
      description: z.string().optional(),
      clear: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (input.clear) {
        const existing = await db
          .select()
          .from(systemSettings)
          .where(and(
            eq(systemSettings.category, input.category),
            eq(systemSettings.key, input.key)
          ))
          .limit(1);

        if (existing.length > 0) {
          await db.delete(systemSettings).where(eq(systemSettings.id, existing[0].id));
        }

        if (input.category === "document_ocr") {
          clearDocumentOcrSettingsCache();
        }

        if (input.category === "finance") {
          clearFinanceSlipMappingPresetCache();
          clearPinnedMerchantPresetCache();
        }

        // Clearing the toggle falls back to the env default (OFF unless
        // `SMARTSPEC_INLINE_RENDER_WORKER=true`) — stop the in-server worker
        // to match, mirroring the update-path hook below.
        if (input.category === "infrastructure" && input.key === "web_process_render_worker_enabled") {
          const { clearRenderWorkerSettingsCache, getWebProcessRenderWorkerEnabled } = await import(
            "../services/renderWorkerSettings"
          );
          clearRenderWorkerSettingsCache();
          const { startInlineRenderWorker, stopInlineRenderWorker } = await import(
            "../services/inlineRenderWorker"
          );
          if (await getWebProcessRenderWorkerEnabled()) {
            startInlineRenderWorker();
          } else {
            stopInlineRenderWorker();
          }
        }

        // Feature 135 — Hermes Grok media worker admin settings live under
        // `category: "infrastructure"` with a `hermes_`/`web_process_hermes_worker_enabled`
        // key prefix. Clearing a row falls back to its documented default —
        // clear the TTL cache so the next read picks that up immediately.
        // Start/stop of an in-web drainer for `web_process_hermes_worker_enabled`
        // is section 07's concern; only the cache clear happens here.
        if (
          input.category === "infrastructure"
          && (input.key.startsWith("hermes_") || input.key === "web_process_hermes_worker_enabled")
        ) {
          const { clearHermesWorkerSettingsCache } = await import("../services/hermesWorkerSettings");
          clearHermesWorkerSettingsCache();
        }

        // Feature 135 section 07 — clearing the toggle falls back to the
        // env default (OFF unless `SMARTSPEC_INLINE_HERMES_WORKER=true`) —
        // stop the DEV-ONLY in-web drainer to match, mirroring the
        // render-worker clear-path hook above.
        if (input.category === "infrastructure" && input.key === "web_process_hermes_worker_enabled") {
          const { getHermesWorkerSettings } = await import("../services/hermesWorkerSettings");
          const { startHermesWorkerDevDrainer, stopHermesWorkerDevDrainer } = await import(
            "../services/hermesWorkerDevDrainer"
          );
          if ((await getHermesWorkerSettings()).webProcessWorkerEnabled) {
            startHermesWorkerDevDrainer();
          } else {
            stopHermesWorkerDevDrainer();
          }
        }

        return { success: true };
      }

      // Feature 135 section-05 — limit-coherence invariant (spec §9): reject
      // a `hermes_max_queued_per_user` write that would drop the cap below
      // the max single-call admission batch size (portrait candidates,
      // `HERMES_MAX_ADMISSION_BATCH_SIZE`) — such a value would make that
      // batch permanently un-admittable. Tightly scoped to this one key so
      // every other setting write is unaffected.
      if (
        input.category === "infrastructure"
        && input.key === HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerUser
        && input.value !== undefined
      ) {
        const parsedMaxQueuedPerUser = Number.parseInt(input.value, 10);
        const currentSettings = await getHermesWorkerSettings();
        const coherence = validateHermesLimitCoherence({
          maxRunningPerConnection: currentSettings.maxRunningPerConnection,
          maxQueuedPerUser: Number.isFinite(parsedMaxQueuedPerUser)
            ? parsedMaxQueuedPerUser
            : currentSettings.maxQueuedPerUser,
          maxQueuedPerTenantSharedPool: currentSettings.maxQueuedPerTenantSharedPool,
          submitWindowPerUser: currentSettings.submitWindowPerUser,
          submitWindowPerTenant: currentSettings.submitWindowPerTenant,
        });
        if (!coherence.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: coherence.reason ?? "Invalid Hermes admission limit configuration",
          });
        }
      }

      const storedValue = input.isSensitive && input.value !== undefined
        ? encrypt(input.value)
        : input.value;

      const existing = await db
        .select()
        .from(systemSettings)
        .where(and(
          eq(systemSettings.category, input.category),
          eq(systemSettings.key, input.key)
        ))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(systemSettings)
          .set({
            value: storedValue,
            valueJson: input.valueJson,
            isSensitive: input.isSensitive ?? existing[0].isSensitive,
            description: input.description ?? existing[0].description,
            updatedBy: ctx.user?.id,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, existing[0].id));
      } else {
        await db.insert(systemSettings).values({
          category: input.category,
          key: input.key,
          value: storedValue,
          valueJson: input.valueJson,
          isSensitive: input.isSensitive ?? false,
          description: input.description,
          updatedBy: ctx.user?.id,
        });
      }

      if (input.category === "document_ocr") {
        clearDocumentOcrSettingsCache();
      }

      if (input.category === "finance") {
        clearFinanceSlipMappingPresetCache();
        clearPinnedMerchantPresetCache();
      }

      // Vertical Drama Render Queue plan §4.4 — live start/stop of the
      // in-server ffmpeg render worker when the admin flips the toggle.
      // Lazy `await import(...)` for cross-service wiring.
      if (input.category === "infrastructure" && input.key === "web_process_render_worker_enabled") {
        const { clearRenderWorkerSettingsCache } = await import("../services/renderWorkerSettings");
        clearRenderWorkerSettingsCache();
        const { startInlineRenderWorker, stopInlineRenderWorker } = await import(
          "../services/inlineRenderWorker"
        );
        if (input.value === "true") {
          startInlineRenderWorker();
        } else {
          stopInlineRenderWorker();
        }
      }

      // Feature 135 — Hermes Grok media worker admin settings. Lazy
      // `await import(...)` for cross-service wiring (see memory note:
      // lazy-import chain convention). Only clears the TTL cache — the
      // in-web drainer start/stop for `web_process_hermes_worker_enabled`
      // is section 07's concern.
      if (
        input.category === "infrastructure"
        && (input.key.startsWith("hermes_") || input.key === "web_process_hermes_worker_enabled")
      ) {
        const { clearHermesWorkerSettingsCache } = await import("../services/hermesWorkerSettings");
        clearHermesWorkerSettingsCache();
      }

      // Feature 135 section 07 — live start/stop of the DEV-ONLY in-web
      // Hermes drainer when the admin flips this specific toggle. Mirrors
      // the `web_process_render_worker_enabled` block above exactly.
      // Production never runs this drainer regardless (see spec §8.1) —
      // this only affects local/dev usage of the flag.
      if (input.category === "infrastructure" && input.key === "web_process_hermes_worker_enabled") {
        const { startHermesWorkerDevDrainer, stopHermesWorkerDevDrainer } = await import(
          "../services/hermesWorkerDevDrainer"
        );
        if (input.value === "true") {
          startHermesWorkerDevDrainer();
        } else {
          stopHermesWorkerDevDrainer();
        }
      }

      return { success: true };
    }),

  /**
   * Apply the supported Grok via Hermes private-worker configuration as one
   * transaction. This is intentionally separate from the expert per-setting
   * mutation so the primary UI switch cannot leave a partially enabled
   * control plane after a mid-sequence failure.
   */
  applyHermesSafePreset: adminProcedure
    .input(z.object({
      enabled: z.boolean(),
      mode: z.enum(["private_only", "all"]).optional().default("private_only"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (input.enabled && input.mode === "all") {
        if (!ctx.tenantId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Tenant context is required to enable the shared Hermes worker",
          });
        }
        const { getHermesAvailability } = await import("../services/hermesConnectionService");
        const availability = await getHermesAvailability({ tenantId: ctx.tenantId });
        if (!availability.tenantEnabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Hermes Media Worker is not enabled for this tenant",
          });
        }
        if (!availability.serverWorker.ready) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Shared Hermes worker is not ready (${availability.serverWorker.reason ?? "unknown"})`,
          });
        }
      }

      const entries = input.enabled
        ? Object.entries(
          input.mode === "all"
            ? HERMES_WORKER_FULL_ENABLEMENT_PRESET
            : HERMES_WORKER_SAFE_ENABLEMENT_PRESET,
        )
        : [[HERMES_WORKER_SETTINGS_KEYS.enabled, "false"] as const];

      await db.transaction(async (tx) => {
        for (const [key, value] of entries) {
          const existing = await tx
            .select({ id: systemSettings.id })
            .from(systemSettings)
            .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, key)))
            .limit(1);

          const description =
            key === HERMES_WORKER_SETTINGS_KEYS.enabled
              ? "Feature 135 — Grok via Hermes platform enablement"
              : input.mode === "all"
                ? "Feature 135 — managed by the verified full three-mode preset"
                : "Feature 135 — managed by the safe private-worker preset";

          if (existing.length > 0) {
            await tx
              .update(systemSettings)
              .set({
                value,
                description,
                updatedBy: ctx.user?.id,
                updatedAt: new Date(),
              })
              .where(eq(systemSettings.id, existing[0].id));
          } else {
            await tx.insert(systemSettings).values({
              category: "infrastructure",
              key,
              value,
              description,
              updatedBy: ctx.user?.id,
            });
          }
        }
      });

      const { clearHermesWorkerSettingsCache } = await import("../services/hermesWorkerSettings");
      clearHermesWorkerSettingsCache();

      // The safe preset always keeps the development-only web drainer off.
      if (input.enabled) {
        const { stopHermesWorkerDevDrainer } = await import("../services/hermesWorkerDevDrainer");
        stopHermesWorkerDevDrainer();
      }

      return {
        success: true,
        enabled: input.enabled,
        mode: input.mode,
        appliedKeys: entries.map(([key]) => key),
      };
    }),

  updateDesktopReleaseSettings: adminProcedure
    .input(desktopReleaseSettingsUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      const config = await updateDesktopReleaseConfig(input, ctx.user?.id);
      return {
        success: true,
        settings: {
          githubRepository: config.githubRepository,
          githubRepositorySource: config.githubRepositorySource,
          githubWorkflow: config.githubWorkflow,
          githubWorkflowSource: config.githubWorkflowSource,
          githubRef: config.githubRef,
          githubRefSource: config.githubRefSource,
          webUrl: config.webUrl,
          webUrlSource: config.webUrlSource,
          githubTokenConfigured: config.githubTokenConfigured,
          githubTokenSource: config.githubTokenSource,
        },
      };
    }),

  getGoogleAiSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "multimodal_embedding" as any));

    let configured = false;
    let source: "db" | "none" = "none";

    for (const setting of settings) {
      if ((setting.key === "google_api_key" || setting.key === "gemini_api_key") && setting.value) {
        configured = true;
        source = "db";
        break;
      }
    }

    return {
      apiKeyConfigured: configured,
      source,
    };
  }),

  updateGoogleAiSettings: adminProcedure
    .input(z.object({
      apiKey: z.string().min(1).max(512).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!input.apiKey?.trim()) {
        return { success: true, preservedExisting: true };
      }

      await upsertSystemSetting({
        category: "multimodal_embedding",
        key: "google_api_key",
        value: input.apiKey.trim(),
        sensitive: true,
        userId: ctx.user?.id,
        description: "Google AI Studio API key for OCR and real-world vision enrichment",
      });
      clearDocumentOcrSettingsCache();

      return { success: true, preservedExisting: false };
    }),

  testGoogleAiConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { success: false, message: "Database not available" };

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "multimodal_embedding" as any));

    let encryptedKey = "";
    for (const setting of settings) {
      if ((setting.key === "google_api_key" || setting.key === "gemini_api_key") && setting.value) {
        encryptedKey = setting.value;
        break;
      }
    }

    const apiKey = encryptedKey ? decrypt(encryptedKey) : "";
    if (!apiKey) {
      return {
        success: false,
        message: "Google AI API key is not configured in Admin Settings",
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          if (response.status === 400 || response.status === 401 || response.status === 403) {
            return { success: false, message: "Google AI API key is invalid or does not have access to Gemini APIs" };
          }
          return { success: false, message: `Google AI endpoint error (${response.status})` };
        }
      } finally {
        clearTimeout(timeout);
      }

      return {
        success: true,
        message: "Google AI API key is configured and Gemini endpoints are reachable",
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Cannot reach Google AI endpoints: ${error.message}`,
      };
    }
  }),

  testDocumentOcrConnection: adminProcedure
    .input(documentOcrTestConnectionSchema)
    .mutation(async ({ input, ctx }) => {
      const currentSettings = await getDocumentOcrSettings();
      const apiKey = input.apiKey?.trim() || (
        input.providerId === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15
          ? currentSettings.typhoonOcrApiKey
          : input.providerId === DOCUMENT_OCR_PROVIDER_IDS.landingAiAde
            ? currentSettings.landingAiApiKey
            : currentSettings.googleAiApiKey
      );

      if (!apiKey) {
        const result: DocumentOcrTestConnectionResult = {
          success: false,
          providerId: input.providerId,
          message: input.providerId === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15
            ? "Typhoon OCR API key is not configured"
            : input.providerId === DOCUMENT_OCR_PROVIDER_IDS.landingAiAde
              ? "LandingAI ADE API key is not configured"
              : "Google AI OCR key is not configured",
        };
        return result;
      }

      try {
        const response = await fetchPythonAdminJson<{
          success: boolean;
          provider_id: string;
          message: string;
          ocr_text?: string | null;
          elapsed_ms?: number | null;
          rate_limit_notice?: string | null;
        }>({
          path: "/api/internal/library/document-ocr/test-connection",
          userId: ctx.user.id,
          method: "POST",
          body: {
            provider_id: input.providerId,
            ...(input.providerId === DOCUMENT_OCR_PROVIDER_IDS.googleAiVision && input.apiKey?.trim()
              ? { api_key: input.apiKey.trim() }
              : {}),
          },
          headers: input.providerId === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15
            ? { "x-typhoon-ocr-api-key": apiKey }
            : input.providerId === DOCUMENT_OCR_PROVIDER_IDS.landingAiAde
              ? { "x-landingai-ade-api-key": apiKey }
              : undefined,
        });

        const result: DocumentOcrTestConnectionResult = {
          success: response.success,
          providerId: response.provider_id,
          message: response.message,
          elapsedMs: response.elapsed_ms ?? null,
          rateLimitNote: response.rate_limit_notice ?? null,
        };
        return result;
      } catch (error: any) {
        const result: DocumentOcrTestConnectionResult = {
          success: false,
          providerId: input.providerId,
          message: `Document OCR test failed: ${error.message}`,
        };
        return result;
      }
    }),

  // ============================================================
  // User-level API Keys (Context7, etc.)
  // ============================================================

  /**
   * Get user's Context7 API key (masked)
   */
  getContext7Key: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { configured: false, maskedKey: "" };

      const userId = ctx.user?.id;
      if (!userId) return { configured: false, maskedKey: "" };

      const result = await db
        .select()
        .from(systemSettings)
        .where(and(
          eq(systemSettings.category, "context7"),
          eq(systemSettings.key, `api_key_user_${userId}`)
        ))
        .limit(1);

      if (result.length > 0 && result[0].value) {
        // Decrypt the stored key for masking display
        const { decrypt } = await import("../services/crypto");
        const val = decrypt(result[0].value) || result[0].value;
        const masked = val.length > 8
          ? val.substring(0, 4) + "••••••••" + val.substring(val.length - 4)
          : "••••••••";
        return { configured: true, maskedKey: masked };
      }

      return { configured: false, maskedKey: "" };
    }),

  /**
   * Save user's Context7 API key
   */
  saveContext7Key: protectedProcedure
    .input(z.object({
      apiKey: z.string().min(1).max(256),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.user?.id;
      if (!userId) throw new Error("User not found");

      const settingKey = `api_key_user_${userId}`;

      const existing = await db
        .select()
        .from(systemSettings)
        .where(and(
          eq(systemSettings.category, "context7"),
          eq(systemSettings.key, settingKey)
        ))
        .limit(1);

      // Encrypt the API key before storage
      const { encrypt } = await import("../services/crypto");
      const encryptedKey = encrypt(input.apiKey);

      if (existing.length > 0) {
        await db
          .update(systemSettings)
          .set({
            value: encryptedKey,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, existing[0].id));
      } else {
        await db.insert(systemSettings).values({
          category: "context7",
          key: settingKey,
          value: encryptedKey,
          isSensitive: true,
          description: "Context7 API Key (per-user)",
          updatedBy: userId,
        });
      }

      return { success: true };
    }),

  /**
   * Delete user's Context7 API key
   */
  deleteContext7Key: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.user?.id;
      if (!userId) throw new Error("User not found");

      await db
        .delete(systemSettings)
        .where(and(
          eq(systemSettings.category, "context7"),
          eq(systemSettings.key, `api_key_user_${userId}`)
        ));

      return { success: true };
    }),

  // ============================================================
  // OAuth Settings
  // ============================================================

  /**
   * Get OAuth settings (masked sensitive values)
   */
  getOAuthSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [ settings, metaChannelSettings, runtimeConfig] = await Promise.all([ db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "oauth")),
      db.select().from(systemSettings).where(eq(systemSettings.category, "meta_channels")),
      getAppRuntimeConfig(),
    ]);
    const publicBaseUrl = (
      runtimeConfig.publicUrl ||
      runtimeConfig.appPublicUrl ||
      runtimeConfig.appUrl ||
      "http://localhost:3000"
    ).replace(/\/+$/, "");

    const result: Record<string, string | boolean | undefined> = {
      googleClientId: undefined,
      googleClientSecret: undefined,
      googleClientSecretConfigured: false,
      googleRedirectUri: undefined,
      googleDriveRedirectUri: undefined,
      githubClientId: undefined,
      githubClientSecret: undefined,
      githubClientSecretConfigured: false,
      githubRedirectUri: undefined,
      microsoftClientId: undefined,
      microsoftClientSecret: undefined,
      microsoftClientSecretConfigured: false,
      microsoftOneDriveRedirectUri: undefined,
      metaAppId: undefined,
      metaAppSecret: undefined,
      metaAppSecretConfigured: false,
      metaRedirectUri: `${publicBaseUrl}/auth/callback/meta`,
      metaGraphApiVersion: "v25.0",
      metaWebhookVerifyToken: undefined,
      metaWebhookVerifyTokenConfigured: false,
      metaWebhookCallbackUrl: `${publicBaseUrl}/api/webhooks/meta`,
    };

    for (const setting of settings) {
      if (setting.key === "googleClientId") {
        result.googleClientId = setting.value || undefined;
      } else if (setting.key === "googleClientSecret" && setting.value) {
        result.googleClientSecret = "****" + "*".repeat(20);
        result.googleClientSecretConfigured = true;
      } else if (setting.key === "googleRedirectUri") {
        result.googleRedirectUri = setting.value || undefined;
      } else if (setting.key === "googleDriveRedirectUri") {
        result.googleDriveRedirectUri = setting.value || undefined;
      } else if (setting.key === "githubClientId") {
        result.githubClientId = setting.value || undefined;
      } else if (setting.key === "githubClientSecret" && setting.value) {
        result.githubClientSecret = "****" + "*".repeat(20);
        result.githubClientSecretConfigured = true;
      } else if (setting.key === "githubRedirectUri") {
        result.githubRedirectUri = setting.value || undefined;
      } else if (setting.key === "microsoftClientId") {
        result.microsoftClientId = setting.value || undefined;
      } else if (setting.key === "microsoftClientSecret" && setting.value) {
        result.microsoftClientSecret = "****" + "*".repeat(20);
        result.microsoftClientSecretConfigured = true;
      } else if (setting.key === "microsoftOneDriveRedirectUri") {
        result.microsoftOneDriveRedirectUri = setting.value || undefined;
      } else if (setting.key === "metaAppId") {
        result.metaAppId = setting.value || undefined;
      } else if (setting.key === "metaAppSecret" && setting.value) {
        result.metaAppSecret = "****" + "*".repeat(20);
        result.metaAppSecretConfigured = true;
      } else if (setting.key === "metaRedirectUri") {
        result.metaRedirectUri = setting.value || undefined;
      } else if (setting.key === "metaGraphApiVersion") {
        result.metaGraphApiVersion = setting.value || "v25.0";
      }
    }

    for (const setting of metaChannelSettings) {
      if ((setting.key === "webhook_verify_token" || setting.key === "verify_token") && setting.value) {
        result.metaWebhookVerifyToken = "****" + "*".repeat(20);
        result.metaWebhookVerifyTokenConfigured = true;
      }
      if ((setting.key === "app_secret" || setting.key === "webhook_app_secret") && setting.value) {
        result.metaAppSecretConfigured = true;
      }
    }

    return result;
  }),

  /**
   * Update OAuth settings
   */
  updateOAuthSettings: adminProcedure
    .input(z.object({
      googleClientId: z.string().optional(),
      googleClientSecret: z.string().optional(),
      googleRedirectUri: z.string().refine(
        value => isValidGoogleRedirectUri(value, "/auth/callback/google"),
        "Google login redirect URI must use /auth/callback/google",
      ).optional(),
      googleDriveRedirectUri: z.string().refine(
        value => isValidGoogleRedirectUri(value, "/auth/callback/google-drive"),
        "Google Drive redirect URI must use /auth/callback/google-drive",
      ).optional(),
      githubClientId: z.string().optional(),
      githubClientSecret: z.string().optional(),
      githubRedirectUri: z.string().optional(),
      microsoftClientId: z.string().optional(),
      microsoftClientSecret: z.string().optional(),
      microsoftOneDriveRedirectUri: z.string().optional(),
        metaAppId: z.string().trim().max(256).optional(),
        metaAppSecret: z.string().trim().max(4096).optional(),
        metaRedirectUri: z.string().trim().url().max(2048).optional(),
        metaGraphApiVersion: z
          .string()
          .trim()
          .regex(/^v\d+\.\d+$/, "Use a version such as v25.0")
          .optional(),
        metaWebhookVerifyToken: z.string().trim().max(4096).optional(),
      }),)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updates = [
        { key: "googleClientId", value: input.googleClientId, sensitive: false },
        { key: "googleClientSecret", value: input.googleClientSecret, sensitive: true },
        { key: "googleRedirectUri", value: input.googleRedirectUri, sensitive: false },
        { key: "googleDriveRedirectUri", value: input.googleDriveRedirectUri, sensitive: false },
        { key: "githubClientId", value: input.githubClientId, sensitive: false },
        { key: "githubClientSecret", value: input.githubClientSecret, sensitive: true },
        { key: "githubRedirectUri", value: input.githubRedirectUri, sensitive: false },
        { key: "microsoftClientId", value: input.microsoftClientId, sensitive: false },
        { key: "microsoftClientSecret", value: input.microsoftClientSecret, sensitive: true },
        { key: "microsoftOneDriveRedirectUri", value: input.microsoftOneDriveRedirectUri, sensitive: false,
        },
        { key: "metaAppId", value: input.metaAppId, sensitive: false },
        { key: "metaAppSecret", value: input.metaAppSecret, sensitive: true },
        {
          key: "metaRedirectUri",
          value: input.metaRedirectUri,
          sensitive: false,
        },
        {
          key: "metaGraphApiVersion",
          value: input.metaGraphApiVersion,
          sensitive: false, },
      ];

      for (const update of updates) {
        const shouldPreserveSensitiveValue = update.sensitive && update.value?.trim() === "";
        if (update.value !== undefined && !shouldPreserveSensitiveValue) {
          const storedValue = update.sensitive ? encrypt(update.value) : update.value;

          const existing = await db
            .select()
            .from(systemSettings)
            .where(and(
              eq(systemSettings.category, "oauth"),
              eq(systemSettings.key, update.key)
            ))
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(systemSettings)
              .set({
                value: storedValue,
                isSensitive: update.sensitive,
                updatedBy: ctx.user?.id,
                updatedAt: new Date(),
              })
              .where(eq(systemSettings.id, existing[0].id));
          } else {
            await db.insert(systemSettings).values({
              category: "oauth",
              key: update.key,
              value: storedValue,
              isSensitive: update.sensitive,
              description: `OAuth ${update.key}`,
              updatedBy: ctx.user?.id,
            });
          }
        }
      }

      const metaChannelUpdates = [
        { key: "app_secret", value: input.metaAppSecret },
        { key: "webhook_verify_token", value: input.metaWebhookVerifyToken },
      ];

      for (const update of metaChannelUpdates) {
        if (update.value === undefined || update.value.trim() === "") continue;

        const existing = await db
          .select()
          .from(systemSettings)
          .where(and(eq(systemSettings.category, "meta_channels"), eq(systemSettings.key, update.key)))
          .limit(1);
        const storedValue = encrypt(update.value);

        if (existing.length > 0) {
          await db
            .update(systemSettings)
            .set({
              value: storedValue,
              isSensitive: true,
              updatedBy: ctx.user?.id,
              updatedAt: new Date(),
            })
            .where(eq(systemSettings.id, existing[0].id));
        } else {
          await db.insert(systemSettings).values({
            category: "meta_channels",
            key: update.key,
            value: storedValue,
            isSensitive: true,
            description: `Meta Channels ${update.key}`,
            updatedBy: ctx.user?.id,
          });
        }
      }

      return { success: true };
    }),

  /**
   * Get decrypted OAuth config (internal API for python-backend)
   * Protected by admin procedure
   */
  getOAuthConfigDecrypted: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "oauth"));

    const result: Record<string, string | boolean> = {};

    for (const setting of settings) {
      if (setting.value) {
        if (setting.isSensitive) {
          // Never return decrypted secrets over tRPC — only confirm configured
          result[setting.key] = "configured";
        } else {
          result[setting.key] = setting.value;
        }
      }
    }

    return result;
  }),

  /**
   * Test Google OAuth connection — validates format and Google endpoint reachability
   */
  testGoogleOAuthConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { success: false, message: "Database not available" };

    // Read Google OAuth settings from DB
    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "oauth"));

    let clientId = "";
    let clientSecretEncrypted = "";

    for (const setting of settings) {
      if (setting.key === "googleClientId" && setting.value) {
        clientId = setting.value;
      } else if (setting.key === "googleClientSecret" && setting.value) {
        clientSecretEncrypted = setting.value;
      }
    }

    // Decrypt and validate credentials format
    const clientSecret = clientSecretEncrypted ? decrypt(clientSecretEncrypted) : "";
    if (clientSecretEncrypted && !clientSecret) {
      return { success: false, message: "Failed to decrypt Google Client Secret — check LLM_ENCRYPTION_KEY" };
    }

    const validation = validateGoogleOAuthFormat(clientId, clientSecret);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }

    // Test Google OAuth endpoint reachability (with 10s timeout)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(
          "https://accounts.google.com/.well-known/openid-configuration",
          { signal: controller.signal }
        );
        if (!response.ok) {
          return {
            success: false,
            message: `Google OAuth endpoints unreachable (HTTP ${response.status})`,
          };
        }
      } finally {
        clearTimeout(timeout);
      }

      return {
        success: true,
        message: "Google OAuth credentials are configured and Google endpoints are reachable. Full credential validation will occur during the first user sign-in.",
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Cannot reach Google OAuth endpoints: ${error.message}`,
      };
    }
  }),

  /**
   * Test Meta configuration without exposing an app access token or secret.
   */
  testMetaOAuthConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { success: false, message: "Database not available" };

    const [oauthSettings, metaChannelSettings] = await Promise.all([
      db.select().from(systemSettings).where(eq(systemSettings.category, "oauth")),
      db.select().from(systemSettings).where(eq(systemSettings.category, "meta_channels")),
    ]);
    const oauthMap = new Map(oauthSettings.map((setting) => [setting.key, setting]));
    const metaChannelMap = new Map(metaChannelSettings.map((setting) => [setting.key, setting]));
    const appId = oauthMap.get("metaAppId")?.value?.trim() || "";
    const oauthAppSecret = oauthMap.get("metaAppSecret")?.value;
    const webhookAppSecret = metaChannelMap.get("app_secret")?.value;
    const appSecret =
      (oauthAppSecret ? decrypt(oauthAppSecret) : "") || (webhookAppSecret ? decrypt(webhookAppSecret) : "");
    const graphVersion = oauthMap.get("metaGraphApiVersion")?.value?.trim() || "v25.0";
    const redirectUri = oauthMap.get("metaRedirectUri")?.value?.trim() || "";
    const verifyTokenConfigured = Boolean(
      metaChannelMap.get("webhook_verify_token")?.value || metaChannelMap.get("verify_token")?.value,
    );

    if (!appId || !appSecret || !redirectUri) {
      return {
        success: false,
        message: "Save the Meta App ID, App Secret, and OAuth Redirect URI before testing.",
      };
    }
    if (!/^v\d+\.\d+$/.test(graphVersion)) {
      return {
        success: false,
        message: "Meta Graph API version must look like v25.0.",
      };
    }
    if (!verifyTokenConfigured) {
      return {
        success: false,
        message: "Save a Webhook Verify Token before testing.",
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: appId,
            client_secret: appSecret,
            grant_type: "client_credentials",
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          return {
            success: false,
            message: `Meta rejected the App ID or App Secret (HTTP ${response.status}).`,
          };
        }
      } finally {
        clearTimeout(timeout);
      }

      return {
        success: true,
        message: "Meta credentials are valid and the webhook verification settings are ready.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error";
      return {
        success: false,
        message: `Cannot reach Meta Graph API: ${message}`,
      };
    }
  }),

  // ============================================================
  // Registration Settings
  // ============================================================

  getRegistrationSettings: domainAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return {
      signupBonusCredits: 100,
      firstUserBonusCredits: 10000,
      autoAssignTenant: true,
      registrationMode: "open" as const,
      userInviteEnabled: false,
      userReferralBonusCredits: 50,
      allowedAuthMethods: ["email", "google", "github"] as string[],
      inviteInactiveDaysLimit: 15,
      maxRegistrationsPerDevice: 2,
    };

    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "registration"));

    const result: Record<string, string | null> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    let allowedAuthMethods: string[] = ["email", "google", "github"];
    try {
      if (result.allowed_auth_methods) {
        allowedAuthMethods = JSON.parse(result.allowed_auth_methods);
      }
    } catch { /* use default */ }

    return {
      signupBonusCredits: parseInt(result.signup_bonus_credits || "100", 10),
      firstUserBonusCredits: parseInt(result.first_user_bonus_credits || "10000", 10),
      autoAssignTenant: result.auto_assign_tenant !== "false",
      registrationMode: (result.registration_mode === "invite_only" ? "invite_only" : "open") as "open" | "invite_only",
      userInviteEnabled: result.user_invite_enabled === "true",
      userReferralBonusCredits: parseInt(result.user_referral_bonus_credits || "50", 10),
      allowedAuthMethods,
      inviteInactiveDaysLimit: parseInt(result.invite_inactive_days_limit || "15", 10),
      maxRegistrationsPerDevice: parseInt(result.max_registrations_per_device || "2", 10),
    };
  }),

  updateRegistrationSettings: domainAdminProcedure
    .input(z.object({
      signupBonusCredits: z.number().min(0).max(1000000),
      firstUserBonusCredits: z.number().min(0).max(1000000),
      autoAssignTenant: z.boolean(),
      registrationMode: z.enum(["open", "invite_only"]).optional(),
      userInviteEnabled: z.boolean().optional(),
      userReferralBonusCredits: z.number().min(0).max(1000000).optional(),
      allowedAuthMethods: z.array(z.enum(["email", "google", "github"])).min(1).optional(),
      inviteInactiveDaysLimit: z.number().min(0).max(365).optional(),
      maxRegistrationsPerDevice: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const pairs: Array<{ key: string; value: string }> = [
        { key: "signup_bonus_credits", value: String(input.signupBonusCredits) },
        { key: "first_user_bonus_credits", value: String(input.firstUserBonusCredits) },
        { key: "auto_assign_tenant", value: String(input.autoAssignTenant) },
      ];

      // Add new invite/registration settings
      if (input.registrationMode !== undefined) {
        pairs.push({ key: "registration_mode", value: input.registrationMode });
      }
      if (input.userInviteEnabled !== undefined) {
        pairs.push({ key: "user_invite_enabled", value: String(input.userInviteEnabled) });
      }
      if (input.userReferralBonusCredits !== undefined) {
        pairs.push({ key: "user_referral_bonus_credits", value: String(input.userReferralBonusCredits) });
      }
      if (input.allowedAuthMethods !== undefined) {
        pairs.push({ key: "allowed_auth_methods", value: JSON.stringify(input.allowedAuthMethods) });
      }
      if (input.inviteInactiveDaysLimit !== undefined) {
        pairs.push({ key: "invite_inactive_days_limit", value: String(input.inviteInactiveDaysLimit) });
      }
      if (input.maxRegistrationsPerDevice !== undefined) {
        pairs.push({ key: "max_registrations_per_device", value: String(input.maxRegistrationsPerDevice) });
      }

      for (const { key, value } of pairs) {
        const [existing] = await db.select().from(systemSettings)
          .where(and(eq(systemSettings.category, "registration"), eq(systemSettings.key, key)))
          .limit(1);

        if (existing) {
          await db.update(systemSettings)
            .set({ value, updatedBy: ctx.user.id, updatedAt: new Date() })
            .where(eq(systemSettings.id, existing.id));
        } else {
          await db.insert(systemSettings).values({
            category: "registration",
            key,
            value,
            updatedBy: ctx.user.id,
          });
        }
      }

      return { success: true };
    }),

  // ============================================================
  // SMTP / Email Settings
  // ============================================================

  getSmtpSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { host: "", port: 587, secure: false, user: "", fromName: "SmartAIHub", fromEmail: "", configured: false };

    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "smtp"));

    const map: Record<string, string | null> = {};
    for (const s of settings) {
      map[s.key] = s.isSensitive ? (s.value ? "••••••••" : null) : s.value;
    }

    return {
      host: map.host || "",
      port: parseInt(map.port || "587", 10),
      secure: map.secure === "true",
      user: map.user || "",
      fromName: map.from_name || "SmartAIHub",
      fromEmail: map.from_email || "",
      configured: !!(map.host && map.user),
    };
  }),

  updateSmtpSettings: adminProcedure
    .input(z.object({
      host: z.string().max(255),
      port: z.number().min(1).max(65535),
      secure: z.boolean(),
      user: z.string().max(320),
      pass: z.string().max(512).optional(),
      fromName: z.string().max(255),
      fromEmail: z.string().email().or(z.string().length(0)),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const pairs: Array<{ key: string; value: string; sensitive: boolean }> = [
        { key: "host", value: input.host, sensitive: false },
        { key: "port", value: String(input.port), sensitive: false },
        { key: "secure", value: String(input.secure), sensitive: false },
        { key: "user", value: input.user, sensitive: false },
        { key: "from_name", value: input.fromName, sensitive: false },
        { key: "from_email", value: input.fromEmail || input.user, sensitive: false },
      ];

      // Only update password if provided (not empty)
      if (input.pass) {
        pairs.push({ key: "pass", value: encrypt(input.pass), sensitive: true });
      }

      for (const { key, value, sensitive } of pairs) {
        const [existing] = await db.select().from(systemSettings)
          .where(and(eq(systemSettings.category, "smtp"), eq(systemSettings.key, key)))
          .limit(1);

        if (existing) {
          await db.update(systemSettings)
            .set({ value, isSensitive: sensitive, updatedBy: ctx.user.id, updatedAt: new Date() })
            .where(eq(systemSettings.id, existing.id));
        } else {
          await db.insert(systemSettings).values({
            category: "smtp",
            key,
            value,
            isSensitive: sensitive,
            updatedBy: ctx.user.id,
          });
        }
      }

      // Clear SMTP cache
      const { clearSmtpCache } = await import("../services/emailService");
      clearSmtpCache();

      return { success: true };
    }),

  testSmtpConnection: adminProcedure.mutation(async () => {
    const { testSmtpConnection } = await import("../services/emailService");
    const db = await getDb();
    if (!db) return { success: false, message: "Database not available" };

    // Read actual SMTP config (with decrypted password)
    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "smtp"));

    const map: Record<string, string | null> = {};
    const rawValues: Record<string, string | null> = {}; // Track original values
    for (const s of settings) {
      rawValues[s.key] = s.value;
      if (s.isSensitive && s.value) {
        const decrypted = decrypt(s.value);
        map[s.key] = decrypted;
      } else {
        map[s.key] = s.value;
      }
    }

    // Check for missing or decryption-failed fields
    const missing: string[] = [];
    if (!map.host) missing.push("host");
    if (!map.user) missing.push("user");
    if (!map.pass) {
      // Check if password was stored but decryption failed (returns empty string)
      if (rawValues.pass) {
        missing.push("pass (decryption failed - check LLM_ENCRYPTION_KEY)");
      } else {
        missing.push("pass");
      }
    }

    if (missing.length > 0) {
      return { success: false, message: `SMTP not configured: missing ${missing.join(", ")}` };
    }

    console.log(`[SMTP Test] Testing connection to ${map.host}:${map.port || "587"} as ${map.user}`);

    return testSmtpConnection({
      host: map.host!,
      port: parseInt(map.port || "587", 10),
      secure: map.secure === "true",
      user: map.user!,
      pass: map.pass!,
    });
  }),

  // ============================================================
  // SMS Provider Settings
  // ============================================================

  getSmsSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { provider: "twilio", accountSid: "", fromNumber: "", configured: false };

    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "sms"));

    const map: Record<string, string | null> = {};
    for (const s of settings) {
      map[s.key] = s.isSensitive ? (s.value ? "••••••••" : null) : s.value;
    }

    return {
      provider: map.provider || "twilio",
      accountSid: map.account_sid || "",
      fromNumber: map.from_number || "",
      configured: !!(map.provider && map.account_sid && map.auth_token && map.from_number),
    };
  }),

  updateSmsSettings: adminProcedure
    .input(z.object({
      provider: z.enum(["twilio", "vonage"]),
      accountSid: z.string().max(255),
      authToken: z.string().max(512).optional(),
      fromNumber: z.string().max(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const pairs: Array<{ key: string; value: string; sensitive: boolean }> = [
        { key: "provider", value: input.provider, sensitive: false },
        { key: "account_sid", value: input.accountSid, sensitive: false },
        { key: "from_number", value: input.fromNumber, sensitive: false },
      ];

      if (input.authToken) {
        pairs.push({ key: "auth_token", value: encrypt(input.authToken), sensitive: true });
      }

      for (const { key, value, sensitive } of pairs) {
        const [existing] = await db.select().from(systemSettings)
          .where(and(eq(systemSettings.category, "sms"), eq(systemSettings.key, key)))
          .limit(1);

        if (existing) {
          await db.update(systemSettings)
            .set({ value, isSensitive: sensitive, updatedBy: ctx.user.id, updatedAt: new Date() })
            .where(eq(systemSettings.id, existing.id));
        } else {
          await db.insert(systemSettings).values({
            category: "sms",
            key,
            value,
            isSensitive: sensitive,
            updatedBy: ctx.user.id,
          });
        }
      }

      const { clearSmsCache } = await import("../services/smsService");
      clearSmsCache();

      return { success: true };
    }),

  testSms: adminProcedure
    .input(z.object({ testNumber: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { testSmsConnection } = await import("../services/smsService");
      const db = await getDb();
      if (!db) return { success: false, message: "Database not available" };

      const settings = await db.select().from(systemSettings)
        .where(eq(systemSettings.category, "sms"));

      const map: Record<string, string | null> = {};
      for (const s of settings) {
        if (s.isSensitive && s.value) {
          try { map[s.key] = decrypt(s.value); } catch { map[s.key] = s.value; }
        } else {
          map[s.key] = s.value;
        }
      }

      if (!map.provider || !map.account_sid || !map.auth_token || !map.from_number) {
        return { success: false, message: "SMS not fully configured" };
      }

      return testSmsConnection({
        provider: map.provider,
        accountSid: map.account_sid,
        authToken: map.auth_token,
        fromNumber: map.from_number,
      }, input.testNumber);
    }),

  // ============================================================
  // Two-Factor Authentication Settings
  // ============================================================

  getTwoFaSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { enabled: true, enforced: false, issuer: "SmartAIHub", backupCodesCount: 10 };

    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "2fa"));

    const map: Record<string, string | null> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }

    return {
      enabled: map.enabled !== "false", // default true
      enforced: map.enforced === "true", // default false
      issuer: map.issuer || "SmartAIHub",
      backupCodesCount: parseInt(map.backup_codes_count || "10", 10),
    };
  }),

  updateTwoFaSettings: adminProcedure
    .input(z.object({
      enabled: z.boolean(),
      enforced: z.boolean(),
      issuer: z.string().min(1).max(255),
      backupCodesCount: z.number().min(5).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const pairs: Array<{ key: string; value: string; sensitive: boolean }> = [
        { key: "enabled", value: String(input.enabled), sensitive: false },
        { key: "enforced", value: String(input.enforced), sensitive: false },
        { key: "issuer", value: input.issuer, sensitive: false },
        { key: "backup_codes_count", value: String(input.backupCodesCount), sensitive: false },
      ];

      for (const { key, value } of pairs) {
        const [existing] = await db.select().from(systemSettings)
          .where(and(eq(systemSettings.category, "2fa"), eq(systemSettings.key, key)))
          .limit(1);

        if (existing) {
          await db.update(systemSettings)
            .set({ value, updatedBy: ctx.user.id, updatedAt: new Date() })
            .where(eq(systemSettings.id, existing.id));
        } else {
          await db.insert(systemSettings).values({
            category: "2fa",
            key,
            value,
            isSensitive: false,
            updatedBy: ctx.user.id,
          });
        }
      }

      return { success: true };
    }),

  // ============================================================
  // Menu Overrides — per menu item × platform × role visibility
  // ============================================================

  getMenuOverrides: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const [row] = await db.select().from(systemSettings)
      .where(and(eq(systemSettings.category, "menu_overrides"), eq(systemSettings.key, "config")))
      .limit(1);

    if (!row?.value) return [];
    try {
      return JSON.parse(row.value) as Array<{
        menuItemId: string;
        web_admin: boolean;
        web_domain_admin: boolean;
        web_user: boolean;
        desktop_admin: boolean;
        desktop_domain_admin: boolean;
        desktop_user: boolean;
      }>;
    } catch {
      return [];
    }
  }),

  updateMenuOverrides: adminProcedure
    .input(z.array(z.object({
      menuItemId: z.string(),
      web_admin: z.boolean(),
      web_domain_admin: z.boolean(),
      web_user: z.boolean(),
      desktop_admin: z.boolean(),
      desktop_domain_admin: z.boolean(),
      desktop_user: z.boolean(),
    }),
      ),)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const value = JSON.stringify(input);

      const [existing] = await db.select().from(systemSettings)
        .where(and(eq(systemSettings.category, "menu_overrides"), eq(systemSettings.key, "config")))
        .limit(1);

      if (existing) {
        await db.update(systemSettings)
          .set({ value, updatedBy: ctx.user.id, updatedAt: new Date() })
          .where(eq(systemSettings.id, existing.id));
      } else {
        await db.insert(systemSettings).values({
          category: "menu_overrides",
          key: "config",
          value,
          isSensitive: false,
          updatedBy: ctx.user.id,
        });
      }

      return { success: true };
    }),

  getMenuVisibility: protectedProcedure
    .input(z.object({ platform: z.enum(["web", "desktop"]) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [row] = await db.select().from(systemSettings)
        .where(and(eq(systemSettings.category, "menu_overrides"), eq(systemSettings.key, "config")))
        .limit(1);

      if (!row?.value) return [];

      let overrides: Array<{
        menuItemId: string;
        web_admin: boolean;
        web_domain_admin: boolean;
        web_user: boolean;
        desktop_admin: boolean;
        desktop_domain_admin: boolean;
        desktop_user: boolean;
      }>;
      try {
        overrides = JSON.parse(row.value);
      } catch {
        return [];
      }

      const role = ctx.user.role as string;
      const platform = input.platform;

      // Map role to column key
      const roleKey = role === "admin" ? "admin" : role === "domain_admin" ? "domain_admin" : "user";
      const colKey = `${platform}_${roleKey}` as keyof ( typeof overrides)[0];

      return overrides
        .filter((o) => o[colKey] === false)
        .map((o) => ({ menuItemId: o.menuItemId, visible: false }));
    }),

  // ============================================================
  // Vector Database Settings
  // ============================================================

  /**
   * Get Vector Database settings
   */
  getVectorDbSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "vectordb"));

    const result: Record<string, any> = {
      provider: "chromadb", // chromadb, pgvector, or cloudflare_vectorize
      embeddingModel: "all-MiniLM-L6-v2",
      embeddingDimension: 384,
      chromaPersistDir: "~/.smartaihub/chroma",
      pgvectorHost: undefined,
      pgvectorPort: undefined,
      pgvectorDatabase: undefined,
      pgvectorUser: undefined,
      openaiApiKeyConfigured: false,
      vectorizeAccountId: undefined,
      vectorizeIndexName: undefined,
      vectorizeApiTokenConfigured: false,
    };

    for (const setting of settings) {
      if (setting.key === "provider") {
        result.provider = setting.value || "chromadb";
      } else if (setting.key === "embeddingModel") {
        result.embeddingModel = setting.value || "all-MiniLM-L6-v2";
      } else if (setting.key === "embeddingDimension") {
        result.embeddingDimension = parseInt(setting.value || "384", 10);
      } else if (setting.key === "chromaPersistDir") {
        result.chromaPersistDir = setting.value || "~/.smartaihub/chroma";
      } else if (setting.key === "pgvectorHost") {
        result.pgvectorHost = setting.value;
      } else if (setting.key === "pgvectorPort") {
        result.pgvectorPort = setting.value;
      } else if (setting.key === "pgvectorDatabase") {
        result.pgvectorDatabase = setting.value;
      } else if (setting.key === "pgvectorUser") {
        result.pgvectorUser = setting.value;
      } else if (setting.key === "pgvectorPassword" && setting.value) {
        result.pgvectorPasswordConfigured = true;
      } else if (setting.key === "openaiApiKey" && setting.value) {
        result.openaiApiKeyConfigured = true;
      } else if (setting.key === "vectorizeAccountId") {
        result.vectorizeAccountId = setting.value;
      } else if (setting.key === "vectorizeIndexName") {
        result.vectorizeIndexName = setting.value;
      } else if (setting.key === "vectorizeApiToken" && setting.value) {
        result.vectorizeApiTokenConfigured = true;
      }
    }

    return result;
  }),

  /**
   * Update Vector Database settings
   */
  updateVectorDbSettings: adminProcedure
    .input(z.object({
      provider: z.enum(["chromadb", "pgvector", "cloudflare_vectorize"]).optional(),
      embeddingModel: z.string().optional(),
      embeddingDimension: z.number().optional(),
      chromaPersistDir: z.string().optional(),
      pgvectorHost: z.string().optional(),
      pgvectorPort: z.string().optional(),
      pgvectorDatabase: z.string().optional(),
      pgvectorUser: z.string().optional(),
      pgvectorPassword: z.string().optional(),
      openaiApiKey: z.string().optional(),
      vectorizeAccountId: z.string().optional(),
      vectorizeApiToken: z.string().optional(),
      vectorizeIndexName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (ctx.user?.id) {
        await assertVectorDbConfigEditAllowedOrThrow({
          userId: ctx.user.id,
          tenantId: null,
          emergency: false,
        });
      }

      const updates = [
        { key: "provider", value: input.provider, sensitive: false },
        { key: "embeddingModel", value: input.embeddingModel, sensitive: false },
        { key: "embeddingDimension", value: input.embeddingDimension?.toString(), sensitive: false },
        { key: "chromaPersistDir", value: input.chromaPersistDir, sensitive: false },
        { key: "pgvectorHost", value: input.pgvectorHost, sensitive: false },
        { key: "pgvectorPort", value: input.pgvectorPort, sensitive: false },
        { key: "pgvectorDatabase", value: input.pgvectorDatabase, sensitive: false },
        { key: "pgvectorUser", value: input.pgvectorUser, sensitive: false },
        { key: "pgvectorPassword", value: input.pgvectorPassword, sensitive: true },
        { key: "openaiApiKey", value: input.openaiApiKey, sensitive: true },
        { key: "vectorizeAccountId", value: input.vectorizeAccountId, sensitive: false },
        { key: "vectorizeApiToken", value: input.vectorizeApiToken, sensitive: true },
        { key: "vectorizeIndexName", value: input.vectorizeIndexName, sensitive: false },
      ];

      for (const update of updates) {
        if (update.value !== undefined && update.value !== null && update.value !== "") {
          const storedValue = update.sensitive ? encrypt(update.value) : update.value;

          const existing = await db
            .select()
            .from(systemSettings)
            .where(and(
              eq(systemSettings.category, "vectordb"),
              eq(systemSettings.key, update.key)
            ))
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(systemSettings)
              .set({
                value: storedValue,
                isSensitive: update.sensitive,
                updatedBy: ctx.user?.id,
                updatedAt: new Date(),
              })
              .where(eq(systemSettings.id, existing[0].id));
          } else {
            await db.insert(systemSettings).values({
              category: "vectordb",
              key: update.key,
              value: storedValue,
              isSensitive: update.sensitive,
              description: `Vector DB ${update.key}`,
              updatedBy: ctx.user?.id,
            });
          }
        }
      }

      return { success: true };
    }),

  /**
   * Test Vector Database connection
   */
  testVectorDbConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "vectordb"));

    const config: Record<string, string> = {};
    for (const setting of settings) {
      if (setting.value) {
        config[setting.key] = setting.isSensitive ? decrypt(setting.value) || "" : setting.value;
      }
    }

    const provider = config.provider || "chromadb";

    try {
      if (provider === "chromadb") {
        // Test ChromaDB connection
        const persistDir = config.chromaPersistDir || "~/.smartaihub/chroma";
        return {
          success: true,
          message: `ChromaDB configured at: ${persistDir}`,
          provider: "chromadb",
          collections: ["episodic_memories", "code_snippets", "conversation_history"],
        };
      } else if (provider === "pgvector") {
        // Test pgvector connection
        if (!config.pgvectorHost || !config.pgvectorDatabase) {
          return {
            success: false,
            message: "pgvector connection details are incomplete",
          };
        }

        // Try to connect to PostgreSQL
        const { Pool } = await import("pg");
        const pool = new Pool({
          host: config.pgvectorHost,
          port: parseInt(config.pgvectorPort || "5432", 10),
          database: config.pgvectorDatabase,
          user: config.pgvectorUser,
          password: config.pgvectorPassword,
        });

        try {
          const result = await pool.query("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'");
          await pool.end();

          if (result.rows.length > 0) {
            return {
              success: true,
              message: `Connected to pgvector database (v${result.rows[0].extversion})`,
              provider: "pgvector",
              version: result.rows[0].extversion,
            };
          } else {
            return {
              success: false,
              message: "pgvector extension not installed in the database",
            };
          }
        } catch (error: any) {
          await pool.end().catch(() => {});
          throw error;
        }
      } else if (provider === "cloudflare_vectorize") {
        // Test Cloudflare Vectorize connection
        if (!config.vectorizeAccountId || !config.vectorizeApiToken || !config.vectorizeIndexName) {
          return {
            success: false,
            message: "Cloudflare Vectorize configuration is incomplete (need Account ID, API Token, and Index Name)",
          };
        }

        const url = `https://api.cloudflare.com/client/v4/accounts/${config.vectorizeAccountId}/vectorize/v2/indexes/${config.vectorizeIndexName}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${config.vectorizeApiToken}` },
        });

        if (!response.ok) {
          const status = response.status;
          if (status === 401) {
            return { success: false, message: "Authentication failed — check your API token" };
          } else if (status === 404) {
            return { success: false, message: `Index '${config.vectorizeIndexName}' not found — create it in the Cloudflare dashboard first` };
          }
          return { success: false, message: `Cloudflare API error (${status}): ${response.statusText}` };
        }

        const data = ( await response.json()) as any;
        if (!data.success) {
          return { success: false, message: `Cloudflare API error: ${JSON.stringify(data.errors)}` };
        }

        const indexConfig = data.result?.config || {};
        return {
          success: true,
          message: `Connected to Vectorize index '${config.vectorizeIndexName}' (${indexConfig.dimensions || "?"}D, ${indexConfig.metric || "cosine"})`,
          provider: "cloudflare_vectorize",
          dimensions: indexConfig.dimensions,
          metric: indexConfig.metric,
        };
      }

      return { success: false, message: "Unknown provider" };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Connection test failed",
      };
    }
  }),

  /**
   * Get Vector Database statistics
   */
  getVectorDbStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "vectordb"));

    const config: Record<string, string> = {};
    for (const setting of settings) {
      if (setting.value) {
        config[setting.key] = setting.isSensitive ? decrypt(setting.value) || "" : setting.value;
      }
    }

    const provider = config.provider || "chromadb";

    try {
      if (provider === "chromadb") {
        return {
          provider: "chromadb",
          totalCollections: 3,
          collections: [
            { name: "episodic_memories", documentCount: 0, embeddingDimension: 384 },
            { name: "code_snippets", documentCount: 0, embeddingDimension: 384 },
            { name: "conversation_history", documentCount: 0, embeddingDimension: 384 },
          ],
          storageLocation: config.chromaPersistDir || "~/.smartaihub/chroma",
        };
      } else if (provider === "pgvector") {
        // Get stats from pgvector
        if (!config.pgvectorHost || !config.pgvectorDatabase) {
          return {
            provider: "pgvector",
            error: "Connection not configured",
          };
        }

        const { Pool } = await import("pg");
        const pool = new Pool({
          host: config.pgvectorHost,
          port: parseInt(config.pgvectorPort || "5432", 10),
          database: config.pgvectorDatabase,
          user: config.pgvectorUser,
          password: config.pgvectorPassword,
        });

        try {
          const result = await pool.query(`
            SELECT
              COUNT(*)::bigint AS total_vectors,
              COUNT(DISTINCT library_item_id)::bigint AS indexed_items
            FROM library_chunk_vectors
          `);
          const activeItems = await pool.query(`
            SELECT COUNT(*)::bigint AS active_items
            FROM library_items
            WHERE deleted_at IS NULL
          `);
          const dimensions = await pool.query(`
            SELECT a.atttypmod AS embedding_dimensions
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = 'public'
              AND c.relname = 'library_chunk_vectors'
              AND a.attname = 'embedding'
          `);
          const rls = await pool.query(`
            SELECT relrowsecurity, relforcerowsecurity
            FROM pg_class
            WHERE oid = to_regclass('public.library_chunk_vectors')
          `);
          await pool.end();

          return {
            provider: "pgvector",
            totalDocuments: parseInt(result.rows[0]?.indexed_items || "0", 10),
            totalVectors: parseInt(result.rows[0]?.total_vectors || "0", 10),
            indexedItems: parseInt(result.rows[0]?.indexed_items || "0", 10),
            activeItems: parseInt(activeItems.rows[0]?.active_items || "0", 10),
            dimensions: parseInt(dimensions.rows[0]?.embedding_dimensions || "0", 10) || undefined,
            rlsEnabled: Boolean(rls.rows[0]?.relrowsecurity),
            forceRls: Boolean(rls.rows[0]?.relforcerowsecurity),
            storageType: "PostgreSQL with pgvector extension",
          };
        } catch (error: any) {
          await pool.end().catch(() => {});
          return {
            provider: "pgvector",
            error: error.message,
          };
        }
      } else if (provider === "cloudflare_vectorize") {
        // Get stats from Cloudflare Vectorize
        if (!config.vectorizeAccountId || !config.vectorizeApiToken || !config.vectorizeIndexName) {
          return {
            provider: "cloudflare_vectorize",
            error: "Configuration incomplete",
          };
        }

        try {
          const url = `https://api.cloudflare.com/client/v4/accounts/${config.vectorizeAccountId}/vectorize/v2/indexes/${config.vectorizeIndexName}`;
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${config.vectorizeApiToken}` },
          });

          if (!response.ok) {
            return {
              provider: "cloudflare_vectorize",
              error: `API error (${response.status})`,
            };
          }

          const data = ( await response.json()) as any;
          const result = data.result || {};
          return {
            provider: "cloudflare_vectorize",
            indexName: config.vectorizeIndexName,
            dimensions: result.config?.dimensions,
            metric: result.config?.metric || "cosine",
            vectorCount: result.vector_count,
            storageType: "Cloudflare Vectorize (Edge)",
          };
        } catch (error: any) {
          return {
            provider: "cloudflare_vectorize",
            error: error.message,
          };
        }
      }

      return { provider, error: "Unknown provider" };
    } catch (error: any) {
      return {
        provider,
        error: error.message || "Failed to fetch stats",
      };
    }
  }),

  getVectorDbHealth: adminProcedure.query(async ({ ctx }) => {
    try {
      return await fetchPythonAdminJson<{
        tenant_id: string | null;
        provider_status: {
          current_read_provider: string;
          target_provider: string | null;
          switch_status: string;
          mirror_writes: boolean;
        };
        queue_status: {
          lag_minutes: number;
          lag_threshold_minutes: number;
          lag_window_minutes: number;
        };
        campaign_progress: {
          campaign_id: number | null;
          status: string;
          domain: string;
          queued: number;
          processed: number;
          succeeded: number;
          failed: number;
          skipped: number;
        };
        latency_status: {
          current_p95_ms: number;
          baseline_p95_ms: number;
          current_sample_count: number;
          baseline_sample_count: number;
          insufficient_baseline: boolean;
        };
        connection_health: {
          healthy: boolean;
          status: string;
          message: string;
          checked_at: string;
        };
        provider_capabilities: Record<string, unknown>;
        recent_failures: Array<{
          job_id: number;
          tenant_id: string | null;
          library_item_id: number;
          error: string;
          failed_at: string | null;
        }>;
        timestamp: string;
      }>({
        path: "/api/admin/vectordb/health",
        userId: ctx.user.id,
      });
    } catch (error: any) {
      return {
        error: error.message || "Failed to fetch vector DB health",
      };
    }
  }),

  /**
   * Trigger full reindex of all library items
   */
  triggerReindex: adminProcedure.mutation(async ({ ctx }) => {
    try {
      return await fetchPythonAdminJson<{ task_id: string; status: string; message: string; }>({
        path: "/api/admin/vectordb/reindex",
        userId: ctx.user.id,
        method: "POST",
        body: {},
      });
    } catch (error: any) {
      return { status: "error", message: error.message || "Failed to trigger reindex" };
    }
  }),

  /**
   * Get reindex job status
   */
  getReindexStatus: adminProcedure.query(async ({ ctx }) => {
    try {
      return await fetchPythonAdminJson<{ status: string; task_id: string | null; result: any; }>({
        path: "/api/admin/vectordb/reindex/status",
        userId: ctx.user.id,
      });
    } catch (error: any) {
      return { status: "error", task_id: null, result: null };
    }
  }),
});
