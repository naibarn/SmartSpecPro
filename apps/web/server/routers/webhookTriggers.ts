/**
 * Webhook Triggers tRPC Router — CRUD for inbound webhook trigger configurations.
 *
 * RBAC:
 *   - protectedProcedure: authenticated user (list, create, update, delete own triggers)
 *   - Tenant isolation: every mutation validates that the target trigger belongs
 *     to the caller's tenant before proceeding.
 *
 * Security:
 *   - Auth secrets are stored AES-256-GCM encrypted via crypto.ts
 *   - getById does NOT return the decrypted secret — returns authSecretConfigured flag
 *   - payload_template validated against allowlist at save time (no SSTI)
 *   - Template max 2000 chars (stringified)
 */

import crypto from "crypto";
import { z } from "zod";
import { eq, and, desc, getTableColumns } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { webhookTriggers, webhookTriggerLogs } from "../../drizzle/schema";
import { encrypt } from "../services/crypto";
import { validateTemplate } from "../services/webhookTriggerService";
import { getTenantFeatureFlag } from "../services/featureFlags";

const WEBHOOK_BASE_URL = "https://smartaihub.app/api/webhooks/trigger";

// ── Template validator for Zod ────────────────────────────────────────────────

function templateValidator(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  const str = JSON.stringify(val);
  if (str.length > 2000) return false;
  return validateTemplate(str);
}

// ── Zod schemas ────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  authType: z.enum(["token", "hmac_sha256"]),
  authSecret: z.string().min(8),
  targetType: z.enum(["chat", "agency", "workflow"]),
  targetConversationId: z.number().int().positive().optional(),
  targetAgencyId: z.string().optional(),
  targetWorkflowId: z.number().int().positive().optional(),
  payloadTemplate: z.record(z.unknown())
    .optional()
    .refine(
      (val) => templateValidator(val),
      { message: "payloadTemplate contains non-allowlisted patterns or exceeds 2000 chars" },
    ),
  rateLimitPerMinute: z.number().int().min(1).max(1000).default(10),
  monthlyTriggerBudget: z.number().int().positive().nullable().optional(),
});

const updateSchema = z.object({
  triggerId: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  authSecret: z.string().min(8).optional(),
  targetType: z.enum(["chat", "agency", "workflow"]).optional(),
  targetConversationId: z.number().int().positive().nullable().optional(),
  targetAgencyId: z.string().nullable().optional(),
  targetWorkflowId: z.number().int().positive().nullable().optional(),
  payloadTemplate: z.record(z.unknown())
    .optional()
    .refine(
      (val) => templateValidator(val),
      { message: "payloadTemplate contains non-allowlisted patterns or exceeds 2000 chars" },
    ),
  rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
  monthlyTriggerBudget: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

const getLogsSchema = z.object({
  triggerId: z.string(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ── Helper: require trigger ownership ────────────────────────────────────────

async function requireTriggerOwnership(triggerId: string, tenantId: string, userId?: string) {
  const [trigger] = await db
    .select()
    .from(webhookTriggers)
    .where(eq(webhookTriggers.id, triggerId))
    .limit(1);

  if (!trigger) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Trigger not found" });
  }
  if (trigger.tenantId !== tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
  // Regular users can only manage their own triggers.
  // Passing userId=undefined skips user-level check (e.g. for admin callers).
  if (userId !== undefined && trigger.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
  return trigger;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const webhookTriggersRouter = router({
  /** List all triggers for the caller's tenant — excludes authSecretEncrypted */
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");

    // Feature flag gate — same flag checked by the inbound route handler
    const flagEnabled = await getTenantFeatureFlag("webhookTriggers", tenantId);
    if (!flagEnabled) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Webhook triggers not enabled for this tenant" });
    }

    // Exclude authSecretEncrypted from the list response (least-privilege)
    const { authSecretEncrypted: _secret, ...columns } = getTableColumns(webhookTriggers);

    return db
      .select(columns)
      .from(webhookTriggers)
      .where(eq(webhookTriggers.tenantId, tenantId))
      .orderBy(desc(webhookTriggers.createdAt));
  }),

  /** Get a single trigger by ID — does NOT return decrypted secret */
  getById: protectedProcedure
    .input(z.object({ triggerId: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      const trigger = await requireTriggerOwnership(input.triggerId, tenantId, userId);

      const { authSecretEncrypted: _secret, ...rest } = trigger;
      return {
        ...rest,
        authSecretConfigured: Boolean(_secret),
        webhookUrl: `${WEBHOOK_BASE_URL}/${trigger.id}`,
      };
    }),

  /** Create a new webhook trigger */
  create: protectedProcedure
    .input(createSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;

      // Explicit template validation (belt-and-suspenders alongside Zod .refine())
      if (input.payloadTemplate !== undefined) {
        const str = JSON.stringify(input.payloadTemplate);
        if (str.length > 2000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "payloadTemplate exceeds 2000 chars" });
        }
        if (!validateTemplate(str)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "payloadTemplate contains non-allowlisted patterns" });
        }
      }

      const encryptedSecret = encrypt(input.authSecret);

      const [created] = await db
        .insert(webhookTriggers)
        .values({
          tenantId,
          userId,
          name: input.name,
          description: input.description ?? null,
          authType: input.authType,
          authSecretEncrypted: encryptedSecret,
          targetType: input.targetType,
          targetConversationId: input.targetConversationId ?? null,
          targetAgencyId: input.targetAgencyId ?? null,
          targetWorkflowId: input.targetWorkflowId ?? null,
          payloadTemplate: input.payloadTemplate ?? {},
          rateLimitPerMinute: input.rateLimitPerMinute,
          monthlyTriggerBudget: input.monthlyTriggerBudget ?? null,
          isActive: true,
        } as any)
        .returning();

      return {
        ...created,
        triggerId: created.id,
        webhookUrl: `${WEBHOOK_BASE_URL}/${created.id}`,
        authSecretConfigured: true,
      };
    }),

  /** Update an existing trigger */
  update: protectedProcedure
    .input(updateSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      const trigger = await requireTriggerOwnership(input.triggerId, tenantId, userId);

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.authSecret !== undefined) updateData.authSecretEncrypted = encrypt(input.authSecret);
      if (input.targetType !== undefined) updateData.targetType = input.targetType;
      if (input.targetConversationId !== undefined) updateData.targetConversationId = input.targetConversationId;
      if (input.targetAgencyId !== undefined) updateData.targetAgencyId = input.targetAgencyId;
      if (input.targetWorkflowId !== undefined) updateData.targetWorkflowId = input.targetWorkflowId;
      if (input.payloadTemplate !== undefined) updateData.payloadTemplate = input.payloadTemplate;
      if (input.rateLimitPerMinute !== undefined) updateData.rateLimitPerMinute = input.rateLimitPerMinute;
      if (input.monthlyTriggerBudget !== undefined) updateData.monthlyTriggerBudget = input.monthlyTriggerBudget;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const [updated] = await db
        .update(webhookTriggers)
        .set(updateData as any)
        .where(and(eq(webhookTriggers.id, input.triggerId), eq(webhookTriggers.tenantId, tenantId)))
        .returning();

      return updated ?? trigger;
    }),

  /** Soft-delete a trigger (set is_active = false) */
  delete: protectedProcedure
    .input(z.object({ triggerId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      await requireTriggerOwnership(input.triggerId, tenantId, userId);

      await db
        .update(webhookTriggers)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(and(eq(webhookTriggers.id, input.triggerId), eq(webhookTriggers.tenantId, tenantId)));

      return { success: true };
    }),

  /** Get delivery logs for a trigger, ordered by created_at DESC */
  getLogs: protectedProcedure
    .input(getLogsSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      await requireTriggerOwnership(input.triggerId, tenantId, userId);

      return db
        .select()
        .from(webhookTriggerLogs)
        .where(eq(webhookTriggerLogs.triggerId, input.triggerId))
        .orderBy(desc(webhookTriggerLogs.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /** Regenerate auth secret — returns the new plaintext once */
  regenerateSecret: protectedProcedure
    .input(z.object({ triggerId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      await requireTriggerOwnership(input.triggerId, tenantId, userId);

      const newSecret = crypto.randomBytes(32).toString("hex");
      const encryptedSecret = encrypt(newSecret);

      await db
        .update(webhookTriggers)
        .set({ authSecretEncrypted: encryptedSecret, updatedAt: new Date() } as any)
        .where(and(eq(webhookTriggers.id, input.triggerId), eq(webhookTriggers.tenantId, tenantId)));

      return { newSecret };
    }),
});
