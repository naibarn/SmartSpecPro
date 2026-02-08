/**
 * Workflow Router
 *
 * Proxies workflow operations to Python FastAPI backend.
 * Handles workflow compilation (ReactFlow → LangGraph), execution, and status tracking.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// Python backend URL from environment (default to localhost:8000)
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

/**
 * Helper to make authenticated requests to Python backend
 */
async function fetchPythonBackend(
  endpoint: string,
  options: RequestInit,
  userToken: string | null
): Promise<Response> {
  const url = `${PYTHON_BACKEND_URL}${endpoint}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Pass user's JWT token to Python backend if available
  if (userToken) {
    headers["Authorization"] = `Bearer ${userToken}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * tRPC Router for Workflow operations
 */
export const workflowRouter = router({
  /**
   * Compile ReactFlow JSON to LangGraph manifest
   *
   * Takes a ReactFlow graph (nodes + edges) and compiles it into a LangGraph execution manifest.
   */
  compile: protectedProcedure
    .input(
      z.object({
        nodes: z.array(z.record(z.any())),
        edges: z.array(z.record(z.any())),
        metadata: z
          .object({
            name: z.string().optional(),
            version: z.string().optional(),
            description: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          "/api/v1/workflows/compile",
          {
            method: "POST",
            body: JSON.stringify(input),
          },
          ctx.userToken
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.detail || "Compilation failed",
          });
        }

        const data = await response.json();

        if (!data.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: data.error || "Compilation failed",
          });
        }

        console.log("[Workflow] Compilation successful", {
          userId: ctx.user.id,
          nodeCount: data.manifest?.nodes?.length || 0,
        });

        return data;
      } catch (error: any) {
        console.error("[Workflow] Compilation error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to compile workflow",
        });
      }
    }),

  /**
   * List user's workflow executions
   *
   * Returns paginated list of workflow execution history with filters.
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z
          .enum(["pending", "running", "completed", "failed", "cancelled"])
          .optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const params = new URLSearchParams({
          limit: input.limit.toString(),
          offset: input.offset.toString(),
          ...(input.status && { status: input.status }),
        });

        const response = await fetchPythonBackend(
          `/api/v1/workflows/?${params}`,
          {
            method: "GET",
          },
          ctx.userToken
        );

        if (!response.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Failed to fetch workflows",
          });
        }

        const data = await response.json();
        return data;
      } catch (error: any) {
        console.error("[Workflow] List error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list workflows",
        });
      }
    }),

  /**
   * Execute a workflow
   *
   * Starts workflow execution either from a saved manifest ID or inline manifest.
   */
  execute: protectedProcedure
    .input(
      z.object({
        manifestId: z.string().optional(),
        manifest: z.record(z.any()).optional(),
        inputs: z.record(z.any()).default({}),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          "/api/v1/workflows/execute",
          {
            method: "POST",
            body: JSON.stringify(input),
          },
          ctx.userToken
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.detail || "Execution failed",
          });
        }

        const data = await response.json();

        console.log("[Workflow] Execution started", {
          userId: ctx.user.id,
          executionId: data.execution_id,
        });

        return data;
      } catch (error: any) {
        console.error("[Workflow] Execution error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to execute workflow",
        });
      }
    }),

  /**
   * Get workflow execution status
   *
   * Returns detailed execution report including status, outputs, and error details.
   */
  getStatus: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/${input.executionId}/report`,
          {
            method: "GET",
          },
          ctx.userToken
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Workflow execution not found",
            });
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Failed to get workflow status",
          });
        }

        const data = await response.json();
        return data;
      } catch (error: any) {
        console.error("[Workflow] Status error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get workflow status",
        });
      }
    }),

  /**
   * Cancel a running workflow execution
   */
  cancel: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/${input.executionId}/cancel`,
          {
            method: "POST",
          },
          ctx.userToken
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Workflow execution not found",
            });
          }
          const error = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.detail || "Failed to cancel workflow",
          });
        }

        const data = await response.json();

        console.log("[Workflow] Cancelled", {
          userId: ctx.user.id,
          executionId: input.executionId,
        });

        return data;
      } catch (error: any) {
        console.error("[Workflow] Cancel error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cancel workflow",
        });
      }
    }),
});
