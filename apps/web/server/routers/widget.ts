/**
 * Widget tRPC Router — CRUD for chat widget configurations.
 *
 * All procedures require domain_admin or admin role and check the chatWidget
 * feature flag before executing.
 *
 * Tenant isolation: every mutation validates that the target widget belongs
 * to the caller's tenant before proceeding.
 *
 * Theme sanitization: only keys from ALLOWED_THEME_KEYS are stored; values
 * are stripped of HTML tags and limited to 200 characters.
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, domainAdminProcedure } from "../_core/trpc";
import { db } from "../db";
import { chatWidgets } from "../../drizzle/schema";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { getOrCreateSystemUser } from "../services/widgetService";
import { getCacheClient } from "../services/redisClients";

// ── Theme key allowlist & sanitization ────────────────────────────────────────

const ALLOWED_THEME_KEYS = new Set([
  "primaryColor",
  "backgroundColor",
  "textColor",
  "fontFamily",
  "borderRadius",
  "headerText",
]);

const HTML_TAG_RE = /<[^>]*>/g;

function sanitizeTheme(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_THEME_KEYS.has(key)) continue;
    if (typeof value !== "string") continue;
    out[key] = value.replace(HTML_TAG_RE, "").slice(0, 200);
  }
  return out;
}

// ── Zod schemas ────────────────────────────────────────────────────────────────

const widgetCreateSchema = z.object({
  name: z.string().min(1).max(255),
  targetType: z.enum(["chat", "agency"]).optional(),
  targetAgencyId: z.string().optional(),
  defaultPersonaId: z.string().optional(),
  allowedOrigins: z.array(z.string()).default([]),
  rateLimitPerMinute: z.number().int().min(1).max(1000).default(10),
  maxConversationLength: z.number().int().min(1).default(100),
  requireEmail: z.boolean().default(false),
  creditSource: z.enum(["tenant", "visitor"]).default("tenant"),
  monthlyCreditBudget: z.number().int().positive().nullable().optional(),
  maxCreditsPerVisitorSession: z.number().int().positive().default(50),
  maxCreditsPerVisitorDay: z.number().int().positive().default(100),
  theme: z.record(z.unknown()).optional(),
});

const widgetUpdateSchema = z.object({
  widgetId: z.string(),
  name: z.string().min(1).max(255).optional(),
  targetType: z.enum(["chat", "agency"]).optional(),
  targetAgencyId: z.string().nullable().optional(),
  defaultPersonaId: z.string().nullable().optional(),
  allowedOrigins: z.array(z.string()).optional(),
  rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
  maxConversationLength: z.number().int().min(1).optional(),
  requireEmail: z.boolean().optional(),
  creditSource: z.enum(["tenant", "visitor"]).optional(),
  monthlyCreditBudget: z.number().int().positive().nullable().optional(),
  maxCreditsPerVisitorSession: z.number().int().positive().optional(),
  maxCreditsPerVisitorDay: z.number().int().positive().optional(),
  theme: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ── Helper: check feature flag and return caller's tenantId ──────────────────

async function requireWidgetFeature(tenantId: string): Promise<void> {
  const enabled = await getTenantFeatureFlag("chatWidget", tenantId);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Chat widget feature is not enabled for this tenant",
    });
  }
}

async function requireWidgetOwnership(widgetId: string, tenantId: string) {
  const [widget] = await db
    .select()
    .from(chatWidgets)
    .where(eq(chatWidgets.id, widgetId))
    .limit(1);

  if (!widget) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Widget not found" });
  }
  if (widget.tenantId !== tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
  return widget;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const widgetRouter = router({
  /** List all widgets for the caller's tenant */
  list: domainAdminProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
    await requireWidgetFeature(tenantId);

    return db
      .select()
      .from(chatWidgets)
      .where(eq(chatWidgets.tenantId, tenantId))
      .orderBy(desc(chatWidgets.createdAt));
  }),

  /** Get a single widget by ID (validates tenant ownership) */
  getById: domainAdminProcedure
    .input(z.object({ widgetId: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await requireWidgetFeature(tenantId);
      return requireWidgetOwnership(input.widgetId, tenantId);
    }),

  /** Create a new widget */
  create: domainAdminProcedure
    .input(widgetCreateSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await requireWidgetFeature(tenantId);

      // Ensure system user exists for this tenant
      await getOrCreateSystemUser(tenantId);

      const sanitizedTheme = input.theme ? sanitizeTheme(input.theme as Record<string, unknown>) : {};

      const [created] = await db
        .insert(chatWidgets)
        .values({
          tenantId,
          name: input.name,
          targetType: input.targetType ?? "chat",
          targetAgencyId: input.targetAgencyId ?? null,
          defaultPersonaId: input.defaultPersonaId ?? null,
          allowedOrigins: input.allowedOrigins,
          rateLimitPerMinute: input.rateLimitPerMinute,
          maxConversationLength: input.maxConversationLength,
          requireEmail: input.requireEmail,
          creditSource: input.creditSource,
          monthlyCreditBudget: input.monthlyCreditBudget ?? null,
          maxCreditsPerVisitorSession: input.maxCreditsPerVisitorSession,
          maxCreditsPerVisitorDay: input.maxCreditsPerVisitorDay,
          theme: sanitizedTheme,
          isActive: true,
        } as any)
        .returning();

      return created;
    }),

  /** Update widget config */
  update: domainAdminProcedure
    .input(widgetUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await requireWidgetFeature(tenantId);

      const widget = await requireWidgetOwnership(input.widgetId, tenantId);

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.targetType !== undefined) updateData.targetType = input.targetType;
      if (input.targetAgencyId !== undefined) updateData.targetAgencyId = input.targetAgencyId;
      if (input.defaultPersonaId !== undefined) updateData.defaultPersonaId = input.defaultPersonaId;
      if (input.allowedOrigins !== undefined) updateData.allowedOrigins = input.allowedOrigins;
      if (input.rateLimitPerMinute !== undefined) updateData.rateLimitPerMinute = input.rateLimitPerMinute;
      if (input.maxConversationLength !== undefined) updateData.maxConversationLength = input.maxConversationLength;
      if (input.requireEmail !== undefined) updateData.requireEmail = input.requireEmail;
      if (input.creditSource !== undefined) updateData.creditSource = input.creditSource;
      if (input.monthlyCreditBudget !== undefined) updateData.monthlyCreditBudget = input.monthlyCreditBudget;
      if (input.maxCreditsPerVisitorSession !== undefined) updateData.maxCreditsPerVisitorSession = input.maxCreditsPerVisitorSession;
      if (input.maxCreditsPerVisitorDay !== undefined) updateData.maxCreditsPerVisitorDay = input.maxCreditsPerVisitorDay;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.theme !== undefined) {
        updateData.theme = sanitizeTheme(input.theme as Record<string, unknown>);
      }

      const [updated] = await db
        .update(chatWidgets)
        .set(updateData as any)
        .where(and(eq(chatWidgets.id, input.widgetId), eq(chatWidgets.tenantId, tenantId)))
        .returning();

      return updated ?? widget;
    }),

  /** Soft-delete a widget (set is_active = false) */
  delete: domainAdminProcedure
    .input(z.object({ widgetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await requireWidgetFeature(tenantId);

      await requireWidgetOwnership(input.widgetId, tenantId);

      await db
        .update(chatWidgets)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(and(eq(chatWidgets.id, input.widgetId), eq(chatWidgets.tenantId, tenantId)));

      return { success: true };
    }),

  /** Get embed HTML snippet for a widget */
  getEmbedCode: domainAdminProcedure
    .input(z.object({ widgetId: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await requireWidgetFeature(tenantId);

      await requireWidgetOwnership(input.widgetId, tenantId);

      const embedCode = `<script src="https://smartaihub.app/widget/v1/embed.js"\n  data-widget-id="${input.widgetId}"\n  data-position="bottom-right">\n</script>`;

      return { embedCode, widgetId: input.widgetId };
    }),

  /** Get monthly credit usage stats for a widget */
  getUsageStats: domainAdminProcedure
    .input(z.object({ widgetId: z.string(), month: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await requireWidgetFeature(tenantId);

      await requireWidgetOwnership(input.widgetId, tenantId);

      const month = input.month ?? new Date().toISOString().slice(0, 7);

      // Read from Redis monthly counter
      const redis = getCacheClient();
      const monthlyKey = `widget:monthly:${input.widgetId}:${month}`;
      const rawCount = await redis.get(monthlyKey);
      const creditsUsed = rawCount ? parseInt(rawCount, 10) : 0;

      return { widgetId: input.widgetId, month, creditsUsed };
    }),
});
