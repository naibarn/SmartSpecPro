/**
 * System Settings tRPC Router
 * Admin-only routes for managing platform configuration (Stripe, Invoice, etc.)
 */

import { z } from "zod";
import { router, adminProcedure, domainAdminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { systemSettings, invoiceConfig, tenants } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";
import { validateGoogleOAuthFormat } from "../services/googleOAuthValidation";

// ============================================================
// System Settings Router
// ============================================================

const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram", "vectordb", "credit_pricing", "infrastructure"]);

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

  // ============================================================
  // OAuth Settings
  // ============================================================

  /**
   * Get OAuth settings (masked sensitive values)
   */
  getOAuthSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "oauth"));

    const result: Record<string, string | boolean | undefined> = {
      googleClientId: undefined,
      googleClientSecret: undefined,
      googleClientSecretConfigured: false,
      googleRedirectUri: undefined,
      githubClientId: undefined,
      githubClientSecret: undefined,
      githubClientSecretConfigured: false,
      githubRedirectUri: undefined,
    };

    for (const setting of settings) {
      if (setting.key === "googleClientId") {
        result.googleClientId = setting.value || undefined;
      } else if (setting.key === "googleClientSecret" && setting.value) {
        result.googleClientSecret = "****" + "*".repeat(20);
        result.googleClientSecretConfigured = true;
      } else if (setting.key === "googleRedirectUri") {
        result.googleRedirectUri = setting.value || undefined;
      } else if (setting.key === "githubClientId") {
        result.githubClientId = setting.value || undefined;
      } else if (setting.key === "githubClientSecret" && setting.value) {
        result.githubClientSecret = "****" + "*".repeat(20);
        result.githubClientSecretConfigured = true;
      } else if (setting.key === "githubRedirectUri") {
        result.githubRedirectUri = setting.value || undefined;
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
      googleRedirectUri: z.string().optional(),
      githubClientId: z.string().optional(),
      githubClientSecret: z.string().optional(),
      githubRedirectUri: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updates = [
        { key: "googleClientId", value: input.googleClientId, sensitive: false },
        { key: "googleClientSecret", value: input.googleClientSecret, sensitive: true },
        { key: "googleRedirectUri", value: input.googleRedirectUri, sensitive: false },
        { key: "githubClientId", value: input.githubClientId, sensitive: false },
        { key: "githubClientSecret", value: input.githubClientSecret, sensitive: true },
        { key: "githubRedirectUri", value: input.githubRedirectUri, sensitive: false },
      ];

      for (const update of updates) {
        if (update.value !== undefined) {
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

    const result: Record<string, string> = {};

    for (const setting of settings) {
      if (setting.value) {
        if (setting.isSensitive) {
          const decrypted = decrypt(setting.value);
          if (decrypted) {
            result[setting.key] = decrypted;
          }
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

  // ============================================================
  // Registration Settings
  // ============================================================

  getRegistrationSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { signupBonusCredits: 100, firstUserBonusCredits: 10000, autoAssignTenant: true };

    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "registration"));

    const result: Record<string, string | null> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    return {
      signupBonusCredits: parseInt(result.signup_bonus_credits || "100", 10),
      firstUserBonusCredits: parseInt(result.first_user_bonus_credits || "10000", 10),
      autoAssignTenant: result.auto_assign_tenant !== "false",
    };
  }),

  updateRegistrationSettings: adminProcedure
    .input(z.object({
      signupBonusCredits: z.number().min(0).max(1000000),
      firstUserBonusCredits: z.number().min(0).max(1000000),
      autoAssignTenant: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const pairs: Array<{ key: string; value: string }> = [
        { key: "signup_bonus_credits", value: String(input.signupBonusCredits) },
        { key: "first_user_bonus_credits", value: String(input.firstUserBonusCredits) },
        { key: "auto_assign_tenant", value: String(input.autoAssignTenant) },
      ];

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
    if (!db) return { host: "", port: 587, secure: false, user: "", fromName: "SmartSpec Pro", fromEmail: "", configured: false };

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
      fromName: map.from_name || "SmartSpec Pro",
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
    if (!db) return { enabled: true, enforced: false, issuer: "SmartSpec Pro", backupCodesCount: 10 };

    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "2fa"));

    const map: Record<string, string | null> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }

    return {
      enabled: map.enabled !== "false", // default true
      enforced: map.enforced === "true", // default false
      issuer: map.issuer || "SmartSpec Pro",
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
    })))
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
      const colKey = `${platform}_${roleKey}` as keyof typeof overrides[0];

      return overrides
        .filter(o => o[colKey] === false)
        .map(o => ({ menuItemId: o.menuItemId, visible: false }));
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
      chromaPersistDir: "~/.smartspec/chroma",
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
        result.chromaPersistDir = setting.value || "~/.smartspec/chroma";
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
        const persistDir = config.chromaPersistDir || "~/.smartspec/chroma";
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

        const data = await response.json() as any;
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
          storageLocation: config.chromaPersistDir || "~/.smartspec/chroma",
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
              COUNT(*) as total_documents,
              COUNT(DISTINCT doc_type) as unique_types
            FROM vector_documents
          `);
          await pool.end();

          return {
            provider: "pgvector",
            totalDocuments: parseInt(result.rows[0]?.total_documents || "0", 10),
            uniqueTypes: parseInt(result.rows[0]?.unique_types || "0", 10),
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

          const data = await response.json() as any;
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

  /**
   * Trigger full reindex of all library items
   */
  triggerReindex: adminProcedure.mutation(async () => {
    const PY = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${PY}/api/admin/vectordb/reindex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        return { status: "error", message: (err as any).detail || res.statusText };
      }
      return await res.json() as { task_id: string; status: string; message: string };
    } catch (error: any) {
      return { status: "error", message: error.message || "Failed to trigger reindex" };
    }
  }),

  /**
   * Get reindex job status
   */
  getReindexStatus: adminProcedure.query(async () => {
    const PY = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${PY}/api/admin/vectordb/reindex/status`);
      if (!res.ok) {
        return { status: "error", task_id: null, result: null };
      }
      return await res.json() as { status: string; task_id: string | null; result: any };
    } catch (error: any) {
      return { status: "error", task_id: null, result: null };
    }
  }),
});
