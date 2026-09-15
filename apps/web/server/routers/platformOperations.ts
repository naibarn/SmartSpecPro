import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../_core/trpc";
import {
  getOverview,
  getPromotion,
  listEvidence,
  listGates,
  listPromotionBatches,
  PlatformOperationError,
  requestAction,
  type PlatformAction,
} from "../services/platformOperations";
import { reconcileCutover } from "../services/cutoverControlPlane";

const environmentSchema = z.string().trim().min(1).max(24);
const scopeSchema = z.string().trim().min(1).max(120);
const readInput = z.object({ environment: environmentSchema, scope: scopeSchema.optional().default("global") }).strict();
const actionInput = readInput.extend({
  expectedControlVersion: z.number().int().min(0),
  actionKey: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(500),
  targetIdentity: z.string().trim().max(255).optional(),
  releaseIdentity: z.string().trim().max(255).optional(),
  promotionId: z.string().trim().max(36).optional(),
  manifestVersion: z.string().trim().max(80).optional(),
}).strict();

function platformActor(ctx: { user: { id: number; role: string } }) {
  return { actorId: ctx.user.id, authorizationScope: `platform-admin:${ctx.user.role}`, correlationId: `platform-admin:${ctx.user.id}` };
}

function mapError(error: unknown): never {
  if (error instanceof PlatformOperationError) {
    const code = error.code === "IDEMPOTENCY_CONFLICT" || error.code.includes("CONFLICT") ? "CONFLICT" : error.code === "DATABASE_UNAVAILABLE" ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.code });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Platform operation failed" });
}

async function doAction(ctx: any, input: z.infer<typeof actionInput>, action: PlatformAction) {
  try {
    return await requestAction({ ...input, ...platformActor(ctx), action });
  } catch (error) {
    return mapError(error);
  }
}

export const platformOperationsRouter = router({
  getOverview: adminProcedure.input(readInput).query(async ({ input }) => {
    try { return await getOverview(input); } catch (error) { return mapError(error); }
  }),
  listGates: adminProcedure.input(readInput.extend({ cursor: z.string().max(1500).nullable().optional(), limit: z.number().int().min(1).max(100).optional() })).query(async ({ input }) => {
    try { return await listGates(input); } catch (error) { return mapError(error); }
  }),
  getPromotion: adminProcedure.input(readInput.extend({ promotionId: z.string().trim().min(1).max(36) })).query(async ({ input }) => {
    try { return await getPromotion(input); } catch (error) { return mapError(error); }
  }),
  listPromotionBatches: adminProcedure.input(z.object({ promotionId: z.string().trim().min(1).max(36), cursor: z.string().max(1500).nullable().optional(), limit: z.number().int().min(1).max(100).optional() }).strict()).query(async ({ input }) => {
    try { return await listPromotionBatches(input); } catch (error) { return mapError(error); }
  }),
  listEvidence: adminProcedure.input(readInput.extend({ cursor: z.string().max(1500).nullable().optional(), limit: z.number().int().min(1).max(100).optional(), category: z.string().trim().max(80).optional() })).query(async ({ input }) => {
    try { return await listEvidence(input); } catch (error) { return mapError(error); }
  }),
  requestAction: adminProcedure.input(actionInput.extend({ action: z.enum(["prepare", "validate", "requestMaintenance", "activate", "cancelActivation", "requestRollback", "separateSync", "reconcileActivation"]) })).mutation(async ({ ctx, input }) => doAction(ctx, input, input.action)),
  prepare: adminProcedure.input(actionInput).mutation(async ({ ctx, input }) => doAction(ctx, input, "prepare")),
  validate: adminProcedure.input(actionInput).mutation(async ({ ctx, input }) => doAction(ctx, input, "validate")),
  requestMaintenance: adminProcedure.input(actionInput).mutation(async ({ ctx, input }) => doAction(ctx, input, "requestMaintenance")),
  activate: adminProcedure.input(actionInput).mutation(async ({ ctx, input }) => doAction(ctx, input, "activate")),
  cancelActivation: adminProcedure.input(actionInput).mutation(async ({ ctx, input }) => doAction(ctx, input, "cancelActivation")),
  requestRollback: adminProcedure.input(actionInput).mutation(async ({ ctx, input }) => doAction(ctx, input, "requestRollback")),
  separateSync: adminProcedure.input(actionInput).mutation(async ({ ctx, input }) => doAction(ctx, input, "separateSync")),
  reconcileActivation: adminProcedure.input(actionInput).mutation(async ({ ctx, input }) => {
    try { return await reconcileCutover({ ...input, ...platformActor(ctx) }); } catch (error) { return mapError(error); }
  }),
});
