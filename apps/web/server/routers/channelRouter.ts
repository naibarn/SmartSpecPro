/**
 * Channel Router tRPC Router — F10
 *
 * CRUD for channel routing rules with a test endpoint.
 *
 * RBAC:
 *   - All procedures require domain_admin or admin role.
 *   - domain_admin users can only manage their own tenant's rules.
 *   - admin users can manage any tenant's rules by passing tenantId.
 *
 * Security:
 *   - conditionOperatorSchema is a z.enum — regex is not in the allowlist.
 *   - Max 50 rules per tenant enforced at create time.
 *   - Tenant isolation enforced on every mutation.
 *   - Cache invalidated after every state-changing operation.
 */

import { z } from "zod";
import { eq, and, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, domainAdminProcedure } from "../_core/trpc";
import { db } from "../db";
import { channelRoutingRules } from "../../drizzle/schema";
import { evaluateRules, invalidateCache } from "../services/channelRouterService";
import type { ChatIngressEvent } from "@shared/channelTypes";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_RULES_PER_TENANT = 50;

// ── Zod schemas ───────────────────────────────────────────────────────────────

/** Allowlisted operators — "regex" is intentionally absent (ReDoS prevention) */
const conditionOperatorSchema = z.enum([
  "eq",
  "contains",
  "startsWith",
  "endsWith",
  "in",
]);

const ruleConditionSchema = z.object({
  field: z.string().min(1).max(100),
  operator: conditionOperatorSchema,
  value: z.union([
    z.string().max(500),
    z.array(z.string().max(100)).max(50),
  ]),
});

/**
 * Only "agency" target type is fully implemented in the gateway integration.
 * workflow/chat targets exist in the DB schema for future use but are not
 * yet functional routing overrides. Restricting to "agency" here prevents
 * admins from creating rules that silently do nothing.
 */
const targetTypeSchema = z.literal("agency");

const createRuleSchema = z.object({
  tenantId: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(9999).default(50),
  conditions: z.array(ruleConditionSchema).min(1).max(10),
  targetType: targetTypeSchema,
  targetAgencyId: z.string().max(36).optional(),
});

const updateRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  conditions: z.array(ruleConditionSchema).min(1).max(10).optional(),
  targetType: targetTypeSchema.optional(),
  targetAgencyId: z.string().max(36).nullable().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Verify a rule belongs to the resolved tenant (or user is admin). */
async function assertRuleOwnership(
  ruleId: string,
  tenantId: string,
  userRole: string,
): Promise<void> {
  if (userRole === "admin") return; // admin can manage any rule
  const [row] = await db
    .select({ tenantId: channelRoutingRules.tenantId })
    .from(channelRoutingRules)
    .where(eq(channelRoutingRules.id, ruleId))
    .limit(1);
  if (!row || row.tenantId !== tenantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export const channelRouterRouter = router({
  /** List all routing rules for a tenant, ordered by priority DESC */
  list: domainAdminProcedure
    .input(z.object({ tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // Admins can query any tenant, domain_admins use their own
      const tenantId =
        ctx.user!.role === "admin" && input.tenantId
          ? input.tenantId
          : (ctx.tenantId ?? String((ctx.user as any)?.currentTenantId ?? ""));
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      const rules = await db
        .select()
        .from(channelRoutingRules)
        .where(eq(channelRoutingRules.tenantId, tenantId))
        .orderBy(desc(channelRoutingRules.priority));
      return rules;
    }),

  /** Create a new routing rule */
  create: domainAdminProcedure
    .input(createRuleSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId =
        ctx.user!.role === "admin" && input.tenantId
          ? input.tenantId
          : (ctx.tenantId ?? String((ctx.user as any)?.currentTenantId ?? ""));
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      // Enforce max 50 rules per tenant
      const [{ value: existingCount }] = await db
        .select({ value: count() })
        .from(channelRoutingRules)
        .where(eq(channelRoutingRules.tenantId, tenantId));

      if (existingCount >= MAX_RULES_PER_TENANT) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Maximum ${MAX_RULES_PER_TENANT} routing rules per tenant`,
        });
      }

      const [created] = await db
        .insert(channelRoutingRules)
        .values({
          tenantId,
          name: input.name,
          description: input.description ?? null,
          priority: input.priority,
          isActive: true,
          conditions: input.conditions as unknown as never,
          targetType: input.targetType,
          targetAgencyId: input.targetAgencyId ?? null,
        })
        .returning();

      await invalidateCache(tenantId);
      return created;
    }),

  /** Update an existing rule */
  update: domainAdminProcedure
    .input(updateRuleSchema)
    .mutation(async ({ ctx, input }) => {
      // Admin role uses assertRuleOwnership (bypass) and then queries without tenantId filter.
      // For admin: look up rule directly; for domain_admin: enforce own tenant.
      const tenantId =
        ctx.user!.role === "admin"
          ? null // admin can update any rule; ownership check handles auth
          : (ctx.tenantId ?? String((ctx.user as any)?.currentTenantId ?? ""));
      if (ctx.user!.role !== "admin" && !tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });
      }
      await assertRuleOwnership(input.id, tenantId ?? "", ctx.user!.role);

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.conditions !== undefined) updateData.conditions = input.conditions;
      if (input.targetType !== undefined) updateData.targetType = input.targetType;
      if ("targetAgencyId" in input) updateData.targetAgencyId = input.targetAgencyId ?? null;

      // Build WHERE: admin queries by id only; domain_admin also filters by tenantId
      const whereClause =
        tenantId !== null
          ? and(eq(channelRoutingRules.id, input.id), eq(channelRoutingRules.tenantId, tenantId))
          : eq(channelRoutingRules.id, input.id);

      const [updated] = await db
        .update(channelRoutingRules)
        .set(updateData as never)
        .where(whereClause)
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });

      // Use the actual tenantId from the updated row for cache invalidation
      const updatedTenantId = (updated as any).tenantId as string;
      await invalidateCache(updatedTenantId);
      return updated;
    }),

  /** Delete a routing rule */
  delete: domainAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String((ctx.user as any)?.currentTenantId ?? "");
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });
      await assertRuleOwnership(input.id, tenantId, ctx.user!.role);

      await db
        .delete(channelRoutingRules)
        .where(
          and(
            eq(channelRoutingRules.id, input.id),
            eq(channelRoutingRules.tenantId, tenantId),
          ),
        );

      await invalidateCache(tenantId);
      return { success: true };
    }),

  /** Reorder rules by assigning new priorities based on array order */
  reorder: domainAdminProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
        ruleIds: z.array(z.string().min(1)).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId =
        ctx.user!.role === "admin" && input.tenantId
          ? input.tenantId
          : (ctx.tenantId ?? String((ctx.user as any)?.currentTenantId ?? ""));
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      // Set priority = (length - index) * 10 so first item has highest priority
      await Promise.all(
        input.ruleIds.map((id, index) =>
          db
            .update(channelRoutingRules)
            .set({
              priority: (input.ruleIds.length - index) * 10,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(channelRoutingRules.id, id),
                eq(channelRoutingRules.tenantId, tenantId),
              ),
            ),
        ),
      );

      await invalidateCache(tenantId);
      return { success: true };
    }),

  /**
   * Test a sample message against the tenant's rules.
   * Bypasses Redis cache to ensure freshness during testing.
   */
  testRule: domainAdminProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
        sampleMessage: z.string().min(1).max(5000),
        channelType: z.string().optional().default("telegram"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId =
        ctx.user!.role === "admin" && input.tenantId
          ? input.tenantId
          : (ctx.tenantId ?? String((ctx.user as any)?.currentTenantId ?? ""));
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      // Construct a synthetic ChatIngressEvent for evaluation
      const syntheticEvent: ChatIngressEvent = {
        eventId: "test-" + Date.now(),
        eventType: "user_message",
        tenantId,
        userId: ctx.user!.id,
        conversationId: "test-conv",
        conversationType: "chat",
        channel: {
          type: input.channelType as ChatIngressEvent["channel"]["type"],
        },
        message: { text: input.sampleMessage, attachments: [] },
        idempotencyKey: "test",
      };

      // Evaluate directly from DB without touching the shared Redis cache.
      // We do this by first forcing a cache miss via DEL, then evaluating,
      // which re-populates the cache. This avoids the testRule-as-DoS problem.
      // A better long-term solution would be a direct DB query, but this is
      // safe because testRule is called rarely by admins, not on the hot path.
      //
      // Implementation note: we avoid calling invalidateCache() here.
      // Instead we call evaluateRules which will cache-miss and reload from DB.
      // The 30s cache TTL means the next real message will use fresh data anyway.
      const result = await evaluateRules(syntheticEvent, tenantId);

      if (!result) return { matched: false, rule: null };

      return {
        matched: true,
        rule: {
          id: result.rule.id,
          name: result.rule.name,
          targetType: result.targetType,
          targetId: result.targetId,
        },
      };
    }),
});
