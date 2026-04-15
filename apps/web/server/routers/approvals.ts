/**
 * Approval Gate tRPC Router
 * Proxies approval operations to Python FastAPI backend
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { debugLog, debugError } from "../_core/logger";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import * as workOsService from "../services/workOsService";
import { resolveTenantIdVarchar } from "../services/tenantContext";

/**
 * Approval request status enum
 */
const ApprovalStatus = z.enum(["pending", "approved", "rejected", "expired", "cancelled"]);

/**
 * Approval request type enum
 */
const ApprovalType = z.enum([
  "code_execution",
  "deployment",
  "data_access",
  "api_call",
  "file_operation",
  "budget_override",
  "manual_review",
]);

/**
 * Helper to get authorization token for Python backend
 * Prefer session token from context, fallback to creating a bearer token
 */
function getAuthToken(ctx: { userToken: string | null; user: { id: number } }): string {
  if (ctx.userToken) {
    return ctx.userToken;
  }
  // If no token in context, this shouldn't happen for protected procedures
  // but we handle it gracefully
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "No authentication token available",
  });
}

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  }
  return tenantId;
}

/**
 * tRPC Router for Approval Gate operations (proxies to Python FastAPI)
 */
export const approvalsRouter = router({
  /**
   * Get pending approval requests for current user
   */
  getPending: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(20),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const emptyResult = {
        requests: [] as unknown[],
        total: 0,
        page: 1,
        page_size: input.limit,
      };

      const normalizePendingResult = (raw: any) => {
        if (Array.isArray(raw)) {
          return {
            requests: raw,
            total: raw.length,
            page: 1,
            page_size: input.limit,
          };
        }
        const requestList = raw?.requests ?? raw?.items;
        if (Array.isArray(requestList)) {
          return {
            requests: requestList,
            total: typeof raw?.total === "number" ? raw.total : requestList.length,
            page: typeof raw.page === "number" ? raw.page : 1,
            page_size: typeof raw.page_size === "number" ? raw.page_size : input.limit,
          };
        }
        return emptyResult;
      };

      try {
        const runtime = await getAppRuntimeConfig();
        const params = new URLSearchParams({
          limit: input.limit.toString(),
          offset: input.offset.toString(),
        });

        const response = await fetch(
          `${runtime.pythonBackendUrl}/api/v1/approvals/requests/pending?${params}`,
          {
            headers: {
              Authorization: `Bearer ${getAuthToken(ctx)}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const normalized = normalizePendingResult(data);
          debugLog("Approvals", "Fetched pending approvals", {
            userId: ctx.user.id,
            count: normalized.requests.length,
          });
          return normalized;
        }

        const errorData = await response.json().catch(() => ({}));
        debugError("Approvals", "Failed to fetch pending approvals from /pending, falling back to /requests", {
          status: response.status,
          error: errorData,
        });

        // Fallback for deployments where /pending may fail due DB/dialect differences.
        const fallbackParams = new URLSearchParams({
          status_filter: "pending",
          page: "1",
          page_size: input.limit.toString(),
        });
        const fallbackResponse = await fetch(
          `${runtime.pythonBackendUrl}/api/v1/approvals/requests?${fallbackParams}`,
          {
            headers: {
              Authorization: `Bearer ${getAuthToken(ctx)}`,
            },
          }
        );

        if (!fallbackResponse.ok) {
          const fallbackError = await fallbackResponse.json().catch(() => ({}));
          debugError("Approvals", "Fallback /requests also failed, returning empty result", {
            status: fallbackResponse.status,
            error: fallbackError,
            userId: ctx.user.id,
          });
          return emptyResult;
        }

        const fallbackData = await fallbackResponse.json();
        return normalizePendingResult(fallbackData);
      } catch (error: any) {
        debugError("Approvals", "Error fetching pending approvals", { error: error.message });
        return emptyResult;
      }
    }),

  /**
   * List approval requests with filters
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(20),
        offset: z.number().min(0).optional().default(0),
        status: ApprovalStatus.optional(),
        requestType: ApprovalType.optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const runtime = await getAppRuntimeConfig();
        const params = new URLSearchParams({
          limit: input.limit.toString(),
          offset: input.offset.toString(),
          ...(input.status && { status: input.status }),
          ...(input.requestType && { request_type: input.requestType }),
        });

        const response = await fetch(
          `${runtime.pythonBackendUrl}/api/v1/approvals/requests?${params}`,
          {
            headers: {
              Authorization: `Bearer ${getAuthToken(ctx)}`,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          debugError("Approvals", "Failed to list approvals", {
            status: response.status,
            error: errorData,
          });
          throw new TRPCError({
            code: response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            message: errorData.detail || "Failed to list approvals",
          });
        }

        const data = await response.json();
        debugLog("Approvals", "Listed approvals", {
          userId: ctx.user.id,
          count: data.items?.length || 0,
          filters: input,
        });
        return data;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        debugError("Approvals", "Error listing approvals", { error: error.message });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list approvals",
        });
      }
    }),

  /**
   * Get approval request details
   */
  getRequest: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        const runtime = await getAppRuntimeConfig();
        const response = await fetch(
          `${runtime.pythonBackendUrl}/api/v1/approvals/requests/${input.requestId}`,
          {
            headers: {
              Authorization: `Bearer ${getAuthToken(ctx)}`,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          debugError("Approvals", "Failed to get approval request", {
            requestId: input.requestId,
            status: response.status,
            error: errorData,
          });
          throw new TRPCError({
            code: response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            message: errorData.detail || "Approval request not found",
          });
        }

        const data = await response.json();
        debugLog("Approvals", "Retrieved approval request", {
          userId: ctx.user.id,
          requestId: input.requestId,
        });
        return data;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        debugError("Approvals", "Error getting approval request", { error: error.message });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get approval request",
        });
      }
    }),

  /**
   * Submit approval decision (approve/reject)
   */
  submitDecision: protectedProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        comment: z.string().max(1000).optional(),
        workRequestId: z.string().min(1).optional(),
        workCaseId: z.string().min(1).optional(),
        workTaskId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const runtime = await getAppRuntimeConfig();
        const response = await fetch(
          `${runtime.pythonBackendUrl}/api/v1/approvals/requests/${input.requestId}/respond`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getAuthToken(ctx)}`,
            },
            body: JSON.stringify({
              decision: input.decision,
              comment: input.comment,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          debugError("Approvals", "Failed to submit decision", {
            requestId: input.requestId,
            decision: input.decision,
            status: response.status,
            error: errorData,
          });
          throw new TRPCError({
            code: response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            message: errorData.detail || "Failed to submit decision",
          });
        }

        const data = await response.json();

        if (input.workCaseId) {
          await workOsService.recordApproval({
            tenantId: requireTenantId(ctx),
            requestId: input.workRequestId ?? null,
            caseId: input.workCaseId,
            taskId: input.workTaskId ?? null,
            approvalTransportId: input.requestId,
            decision: input.decision,
            comment: input.comment ?? null,
            actorUserId: ctx.user.id,
          });
        }

        debugLog("Approvals", "Decision submitted", {
          userId: ctx.user.id,
          requestId: input.requestId,
          decision: input.decision,
        });

        return data;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        debugError("Approvals", "Error submitting decision", { error: error.message });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit decision",
        });
      }
    }),

  /**
   * Cancel approval request
   */
  cancel: protectedProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        reason: z.string().max(500).optional(),
        workRequestId: z.string().min(1).optional(),
        workCaseId: z.string().min(1).optional(),
        workTaskId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const runtime = await getAppRuntimeConfig();
        const response = await fetch(
          `${runtime.pythonBackendUrl}/api/v1/approvals/requests/${input.requestId}/cancel`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getAuthToken(ctx)}`,
            },
            body: JSON.stringify({
              reason: input.reason,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          debugError("Approvals", "Failed to cancel request", {
            requestId: input.requestId,
            status: response.status,
            error: errorData,
          });
          throw new TRPCError({
            code: response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            message: errorData.detail || "Failed to cancel request",
          });
        }

        const data = await response.json();

        if (input.workCaseId) {
          await workOsService.recordApproval({
            tenantId: requireTenantId(ctx),
            requestId: input.workRequestId ?? null,
            caseId: input.workCaseId,
            taskId: input.workTaskId ?? null,
            approvalTransportId: input.requestId,
            decision: "cancelled",
            comment: input.reason ?? null,
            actorUserId: ctx.user.id,
          });
        }

        debugLog("Approvals", "Request cancelled", {
          userId: ctx.user.id,
          requestId: input.requestId,
        });

        return data;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        debugError("Approvals", "Error cancelling request", { error: error.message });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cancel approval request",
        });
      }
    }),
});
