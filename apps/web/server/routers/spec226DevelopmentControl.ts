import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { auditLogger, type AuditEventType } from "../services/auditLogger";
import { defaultSpec226DevelopmentControlBridge } from "../services/spec226DevelopmentControlBridge";
import {
  defaultSpec224AuthorizationService,
  type Spec224AuthorizationContext,
} from "../services/spec224AuthorizationService";
import { resolveTenantIdVarchar } from "../services/tenantContext";

function requireScope(ctx: {
  tenantId: string | null;
  user?: { id?: number | null; currentTenantId?: string | number | null } | null;
}) {
  const tenantId = resolveTenantIdVarchar(
    ctx.tenantId,
    ctx.user?.currentTenantId
  );
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context required",
    });
  }
  if (!ctx.user?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User context required",
    });
  }
  return { tenantId, actorId: ctx.user.id };
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "CONTROL_BRIDGE_FAILED";
}

function asTrpcError(error: unknown): never {
  const code = errorCode(error);
  if (code === "RUN_NOT_FOUND" || code === "RUN_SCOPE_FORBIDDEN") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Development run not found",
    });
  }
  if (
    code === "RUN_PROJECTION_STALE" ||
    code === "RUN_FENCE_STALE" ||
    code === "RUN_DECISION_EPOCH_STALE"
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Development run changed; refresh and retry",
    });
  }
  if (
    [
      "CONTROL_ACTION_INVALID_STATE",
      "CONTROL_ACTION_UNSUPPORTED",
      "RUN_IDEMPOTENCY_CONFLICT",
      "EVENT_CURSOR_INVALID",
      "EVENT_LIMIT_INVALID",
      "RUNNER_NOT_FOUND",
      "RUNNER_BINDING_REQUIRED",
      "APPROVAL_AUTHENTICATION_REQUIRED",
      "APPROVAL_REQUEST_REJECTED",
      "APPROVAL_REFERENCE_MISSING",
      "APPROVAL_AUTHORITY_UNAVAILABLE",
      "ECONOMIC_LEDGER_ACCOUNTS_NOT_CONFIGURED",
      "BUDGET_REQUIRED",
      "AUTH_BINDING_JOB_NOT_QUEUED",
      "AGENT_MANIFEST_MISSING",
      "APPROVAL_REVOCATION_REJECTED",
      "BUDGET_BINDING_MISMATCH",
      "HOLD_RELEASE_NOT_ALLOWED",
    ].includes(code)
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: code });
  }
  throw error;
}

const runIdSchema = z.string().trim().min(1).max(160);
const actionInput = z.object({
  runId: runIdSchema,
  action: z.enum(["pause", "cancel"]),
  expectedRevision: z.number().int().min(0),
  expectedFencingVersion: z.number().int().min(0),
  expectedDecisionEpoch: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(1).max(200),
});

const authorizationContext = (ctx: {
  tenantId: string | null;
  userToken?: string | null;
  user?: {
    id?: number | null;
    currentTenantId?: string | number | null;
  } | null;
}): Spec224AuthorizationContext => ({
  ...requireScope(ctx),
  userToken: ctx.userToken,
});

const providerInput = z.object({
  runId: runIdSchema,
  runnerId: z.string().trim().min(1).max(160),
  provider: z.literal("codex").default("codex"),
});

/**
 * Spec 226 user-surface adapter. It intentionally has no create, resume,
 * phase-admission, provider or approval implementation: those remain owned
 * by the canonical Spec 224 / Feature 195 / Approval services.
 */
export const spec226DevelopmentControlRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).default(25) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await defaultSpec226DevelopmentControlBridge.list({
          ...requireScope(ctx),
          limit: input?.limit ?? 25,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  get: protectedProcedure
    .input(z.object({ runId: runIdSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await defaultSpec226DevelopmentControlBridge.get({
          ...requireScope(ctx),
          runId: input.runId,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  events: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        afterSequence: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await defaultSpec226DevelopmentControlBridge.events({
          ...requireScope(ctx),
          runId: input.runId,
          afterSequence: input.afterSequence,
          limit: input.limit,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  command: protectedProcedure
    .input(actionInput)
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      try {
        const result = await defaultSpec226DevelopmentControlBridge.command({
          ...scope,
          ...input,
        });
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            action: input.action,
            accepted: result.accepted,
            revision: result.revision,
          },
        });
        return result;
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            action: input.action,
            accepted: false,
            errorCode: errorCode(error),
          },
        });
        return asTrpcError(error);
      }
    }),

  authorizationStatus: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        runnerId: z.string().trim().min(1).max(160).optional(),
        provider: z.literal("codex").default("codex"),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await defaultSpec224AuthorizationService.status({
          context: authorizationContext(ctx),
          ...input,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  requestAuthorizationApproval: protectedProcedure
    .input(
      providerInput.extend({
        deadline: z.string().datetime({ offset: true }),
        spendCeilingMicros: z.number().int().positive().max(10_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await defaultSpec224AuthorizationService.requestApproval({
          context: authorizationContext(ctx),
          ...input,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  reserveAuthorizationBudget: protectedProcedure
    .input(
      providerInput.extend({
        approvalRef: z.string().trim().min(1).max(200),
        budgetId: z.string().trim().min(1).max(160),
        amountMinorUnits: z.number().int().positive().max(10_000_000),
        currency: z.string().regex(/^[A-Za-z]{3}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await defaultSpec224AuthorizationService.reserveBudget({
          context: authorizationContext(ctx),
          ...input,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  bindAuthorization: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        runnerId: z.string().trim().min(1).max(160),
        approvalRef: z.string().trim().min(1).max(200),
        budgetReservationRef: z.string().trim().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      try {
        const result = await defaultSpec224AuthorizationService.bind({
          context: authorizationContext(ctx),
          ...input,
        });
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            status: result.status,
            reasonCount: result.reasons.length,
            // References are opaque policy handles; raw provider credentials
            // never enter this audit record.
            approvalRef: input.approvalRef,
            budgetReservationRef: input.budgetReservationRef,
          },
        });
        return result;
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: { runId: input.runId, status: "error", errorCode: errorCode(error) },
        });
        return asTrpcError(error);
      }
    }),

  revokeAuthorization: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        approvalRef: z.string().trim().min(1).max(200),
        budgetReservationRef: z.string().trim().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      try {
        const result = await defaultSpec224AuthorizationService.revoke({
          context: authorizationContext(ctx),
          ...input,
        });
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: { runId: input.runId, status: result.status, action: "revoke" },
        });
        return result;
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: { runId: input.runId, status: "error", action: "revoke", errorCode: errorCode(error) },
        });
        return asTrpcError(error);
      }
    }),
});
