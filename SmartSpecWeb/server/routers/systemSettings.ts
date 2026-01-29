/**
 * System Settings tRPC Router
 * Admin-only routes for managing platform configuration (Stripe, Invoice, etc.)
 */

import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { systemSettings, invoiceConfig, tenants } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";

// ============================================================
// System Settings Router
// ============================================================

const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general"]);

const stripeSettingsSchema = z.object({
  secretKey: z.string().optional(),
  publishableKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  currency: z.string().default("usd"),
  // Price IDs for subscription plans (legacy, now stored in packages)
  priceIds: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

const invoiceConfigSchema = z.object({
  tenantId: z.number().optional().nullable(),
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
  getGlobalInvoiceConfig: adminProcedure.query(async () => {
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
  getTenantInvoiceConfig: adminProcedure
    .input(z.object({ tenantId: z.number() }))
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
          domain: tenants.domain,
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
  upsertInvoiceConfig: adminProcedure
    .input(invoiceConfigSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const whereClause = input.tenantId
        ? eq(invoiceConfig.tenantId, input.tenantId)
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
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(invoiceConfig.id, existing[0].id));

        return { success: true, id: existing[0].id, updated: true };
      } else {
        const [result] = await db.insert(invoiceConfig).values(input).returning();
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
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

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
            value: input.value,
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
          value: input.value,
          valueJson: input.valueJson,
          isSensitive: input.isSensitive ?? false,
          description: input.description,
          updatedBy: ctx.user?.id,
        });
      }

      return { success: true };
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
});
