import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  economicHolds,
  economicIntents,
  economicReconciliations,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { admitEconomicIntent } from "../services/economicControlPlaneTypes";

const previewSchema = z.object({
  jobId: z.string().min(1).max(36),
  attemptId: z.string().min(1).max(36),
  idempotencyKey: z.string().min(8).max(128),
  effectType: z.enum(["workflow_run", "tool_call", "provider_charge"]),
  resourceRef: z.string().min(1).max(255),
  amount: z.object({
    minorUnits: z.number().int().nonnegative().safe(),
    currency: z.string().length(3),
  }),
});

function requireEconomicTenant(ctx: {
  tenantId: unknown;
  user: { currentTenantId?: unknown };
}): string {
  const tenantId = resolveTenantIdVarchar(
    ctx.tenantId,
    ctx.user.currentTenantId
  );
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for economic operations",
    });
  }
  return tenantId;
}

export function redactEconomicRecord<T extends Record<string, unknown>>(
  record: T
): T {
  const copy = { ...record };
  delete copy.secret;
  delete copy.token;
  delete copy.rawProviderPayload;
  return copy;
}

const emergencyFreezeByTenant = new Map<
  string,
  { frozen: boolean; reason: string; updatedAt: string }
>();

export function previewEconomicAdmission(
  ctx: { tenantId: unknown; user: { id: number; currentTenantId?: unknown } },
  input: z.infer<typeof previewSchema>
) {
  const tenantId = requireEconomicTenant(ctx);
  return {
    tenantId,
    ...admitEconomicIntent({
      context: {
        tenantId,
        actorId: String(ctx.user.id),
        actorType: "user",
        policyVersion: "economic-control-plane-v1",
      },
      request: {
        jobId: input.jobId,
        attemptId: input.attemptId,
        idempotencyKey: input.idempotencyKey,
        effectType: input.effectType,
        resourceRef: input.resourceRef,
        amount: {
          ...input.amount,
          currency: input.amount.currency.toUpperCase(),
        },
      },
    }),
  };
}

export const economicControlPlaneRouter = router({
  preview: protectedProcedure.input(previewSchema).query(({ ctx, input }) => {
    const tenantId = requireEconomicTenant(ctx);
    const freeze = emergencyFreezeByTenant.get(tenantId);
    if (freeze?.frozen) {
      return {
        decision: "denied" as const,
        reasonCode: "EMERGENCY_FREEZE",
        policyVersion: "economic-control-plane-v1",
        tenantId,
      };
    }
    return redactEconomicRecord(previewEconomicAdmission(ctx, input));
  }),

  getIntent: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireEconomicTenant(ctx);
      const [row] = await getDb()
        .select()
        .from(economicIntents)
        .where(
          and(
            eq(economicIntents.id, input.id),
            eq(economicIntents.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Economic intent not found",
        });
      return redactEconomicRecord(row as unknown as Record<string, unknown>);
    }),

  listHolds: protectedProcedure
    .input(
      z.object({ intentId: z.string().min(1).max(36).optional() }).optional()
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireEconomicTenant(ctx);
      const conditions = input?.intentId
        ? and(
            eq(economicHolds.tenantId, tenantId),
            eq(economicHolds.intentId, input.intentId)
          )
        : eq(economicHolds.tenantId, tenantId);
      const rows = await getDb()
        .select()
        .from(economicHolds)
        .where(conditions)
        .orderBy(desc(economicHolds.updatedAt))
        .limit(100);
      return rows.map(row =>
        redactEconomicRecord(row as unknown as Record<string, unknown>)
      );
    }),

  listReconciliation: protectedProcedure
    .input(
      z.object({ status: z.string().min(1).max(32).optional() }).optional()
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireEconomicTenant(ctx);
      const conditions = input?.status
        ? and(
            eq(economicReconciliations.tenantId, tenantId),
            eq(economicReconciliations.status, input.status)
          )
        : eq(economicReconciliations.tenantId, tenantId);
      const rows = await getDb()
        .select()
        .from(economicReconciliations)
        .where(conditions)
        .orderBy(desc(economicReconciliations.createdAt))
        .limit(100);
      return rows.map(row =>
        redactEconomicRecord(row as unknown as Record<string, unknown>)
      );
    }),

  setEmergencyFreeze: protectedProcedure
    .input(
      z.object({ frozen: z.boolean(), reason: z.string().min(1).max(500) })
    )
    .mutation(({ ctx, input }) => {
      const tenantId = requireEconomicTenant(ctx);
      if (ctx.user.role !== "admin" && ctx.user.role !== "system_agent") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Economic freeze requires an administrator",
        });
      }
      const value = {
        frozen: input.frozen,
        reason: input.reason,
        updatedAt: new Date().toISOString(),
      };
      emergencyFreezeByTenant.set(tenantId, value);
      return { tenantId, ...value };
    }),
});
