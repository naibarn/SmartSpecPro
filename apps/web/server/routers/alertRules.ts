import { z } from "zod";
import { eq, and, count, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { alertRules, escalationPolicies } from "../../drizzle/schema";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";

async function requirePreferencesEnabled(tenantId: string | null): Promise<void> {
  if (!tenantId) return;
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.notificationPreferencesEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Notification preferences feature is not enabled for this tenant",
    });
  }
}

const operatorSchema = z.enum(["gt", "lt", "gte", "lte", "eq"]);

const paginationInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const createRuleInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  metricName: z.string().min(1).max(100),
  operator: operatorSchema,
  threshold: z.number().finite(),
  windowMinutes: z.number().int().positive().default(5),
  severity: z.enum(["low", "normal", "high", "critical"]).default("high"),
  channels: z.array(z.string()).default(["in_app"]),
  targetRole: z.string().max(20).optional(),
  targetUserId: z.number().int().optional(),
  cooldownMinutes: z.number().int().positive().default(10),
  isEnabled: z.boolean().default(true),
});

const updateRuleInput = createRuleInput.partial().extend({
  id: z.number(),
});

const createEscalationPolicyInput = z
  .object({
    name: z.string().min(1).max(100),
    triggerSeverity: z.enum(["low", "normal", "high", "critical"]),
    triggerMinutes: z.number().int().positive(),
    escalateToRole: z.string().max(20).optional(),
    escalateToUserId: z.number().int().optional(),
    escalateChannels: z.array(z.string()),
    escalateMessage: z.string().optional(),
    isEnabled: z.boolean().default(true),
  })
  .refine(
    (d) => d.escalateToRole || d.escalateToUserId,
    { message: "At least one of escalateToRole or escalateToUserId is required" }
  );

const updateEscalationPolicyInput = z
  .object({
    id: z.number(),
    name: z.string().min(1).max(100).optional(),
    triggerSeverity: z.enum(["low", "normal", "high", "critical"]).optional(),
    triggerMinutes: z.number().int().positive().optional(),
    escalateToRole: z.string().max(20).optional().nullable(),
    escalateToUserId: z.number().int().optional().nullable(),
    escalateChannels: z.array(z.string()).optional(),
    escalateMessage: z.string().optional().nullable(),
    isEnabled: z.boolean().optional(),
  })
  .refine(
    (d) => {
      // Only enforce if both target fields are explicitly being set to empty/null
      if (d.escalateToRole === null && d.escalateToUserId === null) return false;
      return true;
    },
    { message: "At least one of escalateToRole or escalateToUserId is required" }
  );

export const alertRulesRouter = router({
  // ---- Alert Rules ----
  listRules: adminProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    await requirePreferencesEnabled(ctx.tenantId);
    const db = getDb();
    const tenantId = ctx.tenantId;
    if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

    const [rules, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(alertRules)
        .where(eq(alertRules.tenantId, tenantId))
        .orderBy(desc(alertRules.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      db
        .select({ value: count() })
        .from(alertRules)
        .where(eq(alertRules.tenantId, tenantId)),
    ]);
    return { rules, total };
  }),

  createRule: adminProcedure.input(createRuleInput).mutation(async ({ ctx, input }) => {
    await requirePreferencesEnabled(ctx.tenantId);
    const db = getDb();
    const tenantId = ctx.tenantId;
    if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

    const [rule] = await db
      .insert(alertRules)
      .values({ ...input, tenantId })
      .returning();
    return rule;
  }),

  updateRule: adminProcedure.input(updateRuleInput).mutation(async ({ ctx, input }) => {
    await requirePreferencesEnabled(ctx.tenantId);
    const db = getDb();
    const tenantId = ctx.tenantId;
    if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

    const { id, ...updates } = input;
    const [updated] = await db
      .update(alertRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(alertRules.id, id), eq(alertRules.tenantId, tenantId)))
      .returning();

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Alert rule not found" });
    }
    return updated;
  }),

  deleteRule: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requirePreferencesEnabled(ctx.tenantId);
      const db = getDb();
      const tenantId = ctx.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      const [deleted] = await db
        .delete(alertRules)
        .where(and(eq(alertRules.id, input.id), eq(alertRules.tenantId, tenantId)))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert rule not found" });
      }
      return { success: true };
    }),

  // ---- Escalation Policies ----
  listEscalationPolicies: adminProcedure
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      await requirePreferencesEnabled(ctx.tenantId);
      const db = getDb();
      const tenantId = ctx.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      const [policies, [{ value: total }]] = await Promise.all([
        db
          .select()
          .from(escalationPolicies)
          .where(eq(escalationPolicies.tenantId, tenantId))
          .orderBy(desc(escalationPolicies.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ value: count() })
          .from(escalationPolicies)
          .where(eq(escalationPolicies.tenantId, tenantId)),
      ]);
      return { policies, total };
    }),

  createEscalationPolicy: adminProcedure
    .input(createEscalationPolicyInput)
    .mutation(async ({ ctx, input }) => {
      await requirePreferencesEnabled(ctx.tenantId);
      const db = getDb();
      const tenantId = ctx.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      const [policy] = await db
        .insert(escalationPolicies)
        .values({ ...input, tenantId })
        .returning();
      return policy;
    }),

  updateEscalationPolicy: adminProcedure
    .input(updateEscalationPolicyInput)
    .mutation(async ({ ctx, input }) => {
      await requirePreferencesEnabled(ctx.tenantId);
      const db = getDb();
      const tenantId = ctx.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      const { id, ...updates } = input;
      const [updated] = await db
        .update(escalationPolicies)
        .set(updates)
        .where(
          and(eq(escalationPolicies.id, id), eq(escalationPolicies.tenantId, tenantId))
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Escalation policy not found" });
      }
      return updated;
    }),

  deleteEscalationPolicy: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requirePreferencesEnabled(ctx.tenantId);
      const db = getDb();
      const tenantId = ctx.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      const [deleted] = await db
        .delete(escalationPolicies)
        .where(
          and(
            eq(escalationPolicies.id, input.id),
            eq(escalationPolicies.tenantId, tenantId)
          )
        )
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Escalation policy not found" });
      }
      return { success: true };
    }),
});
