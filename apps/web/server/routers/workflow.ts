/**
 * Workflow Router
 *
 * Proxies workflow operations to Python FastAPI backend.
 * Handles workflow compilation (ReactFlow → LangGraph), execution, and status tracking.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { workflows } from "@db/schema";
import { eq, and, desc, type SQL } from "drizzle-orm";

// Python backend URL from environment (default to localhost:8000)
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

function workflowOwnershipConditions(
  workflowId: number,
  userId: number,
  tenantId: string | null,
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(workflows.id, workflowId),
    eq(workflows.userId, userId),
  ];
  if (tenantId) {
    conditions.push(eq(workflows.tenantId, tenantId));
  }
  return conditions;
}

/**
 * Helper to make authenticated requests to Python backend
 */
async function fetchPythonBackend(
  endpoint: string,
  options: RequestInit,
  userToken: string | null
): Promise<Response> {
  const url = `${PYTHON_BACKEND_URL}${endpoint}`;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  // Pass user's JWT token to Python backend if available
  if (userToken) {
    headers.set("Authorization", `Bearer ${userToken}`);
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
   * Save workflow draft (create or update)
   *
   * Persists workflow JSON to database. Upserts by id.
   */
  save: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1, "Workflow name is required"),
        description: z.string().optional(),
        defaultModel: z.string().optional(),
        workflowJson: z.object({
          nodes: z.array(z.any()),
          edges: z.array(z.any()),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;

        if (input.id) {
          // Update existing workflow
          const [updated] = await db
            .update(workflows)
            .set({
              name: input.name,
              description: input.description || null,
              defaultModel: input.defaultModel || null,
              workflowJson: input.workflowJson,
              updatedAt: new Date(),
            })
            .where(
              and(...workflowOwnershipConditions(input.id, userId, tenantId))
            )
            .returning();

          if (!updated) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Workflow not found or access denied",
            });
          }

          console.log("[Workflow] Updated workflow", {
            workflowId: updated.id,
            userId,
          });

          return { id: updated.id, status: "draft" };
        } else {
          // Create new workflow
          const [created] = await db
            .insert(workflows)
            .values({
              name: input.name,
              description: input.description || null,
              defaultModel: input.defaultModel || null,
              workflowJson: input.workflowJson,
              userId,
              tenantId,
              status: "draft",
              schemaVersion: "1.0.0",
            })
            .returning();

          console.log("[Workflow] Created workflow", {
            workflowId: created.id,
            userId,
          });

          return { id: created.id, status: "draft" };
        }
      } catch (error: any) {
        console.error("[Workflow] Save error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save workflow",
        });
      }
    }),

  /**
   * Load workflow by ID
   *
   * Retrieves workflow from database with ownership verification.
   */
  load: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;

        const [workflow] = await db
          .select()
          .from(workflows)
          .where(
            and(...workflowOwnershipConditions(input.id, userId, tenantId))
          )
          .limit(1);

        if (!workflow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Workflow not found or access denied",
          });
        }

        console.log("[Workflow] Loaded workflow", {
          workflowId: workflow.id,
          userId,
        });

        return workflow;
      } catch (error: any) {
        console.error("[Workflow] Load error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load workflow",
        });
      }
    }),

  /**
   * List user's workflows
   *
   * Returns workflows with optional status filter.
   */
  listSaved: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["draft", "compiled", "running", "completed", "failed"])
          .optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;

        const conditions = [
          eq(workflows.userId, userId),
          tenantId ? eq(workflows.tenantId, tenantId) : undefined,
          input.status ? eq(workflows.status, input.status) : undefined,
        ].filter(Boolean);

        const userWorkflows = await db
          .select({
            id: workflows.id,
            name: workflows.name,
            description: workflows.description,
            status: workflows.status,
            workflowJson: workflows.workflowJson,
            lastCompiledAt: workflows.lastCompiledAt,
            createdAt: workflows.createdAt,
            updatedAt: workflows.updatedAt,
          })
          .from(workflows)
          .where(and(...conditions))
          .orderBy(desc(workflows.updatedAt));

        console.log("[Workflow] Listed workflows", {
          userId,
          count: userWorkflows.length,
          statusFilter: input.status,
        });

        return userWorkflows;
      } catch (error: any) {
        console.error("[Workflow] List saved error:", error.message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list workflows",
        });
      }
    }),

  /**
   * Delete workflow
   *
   * Soft delete by setting status to 'deleted' (or hard delete if preferred).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;

        // Soft delete: update status to 'deleted'
        // Alternative: Hard delete with .delete()
        const [deleted] = await db
          .update(workflows)
          .set({
            status: "deleted" as any, // Will need to add 'deleted' to enum
            updatedAt: new Date(),
          })
          .where(
            and(...workflowOwnershipConditions(input.id, userId, tenantId))
          )
          .returning();

        if (!deleted) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Workflow not found or access denied",
          });
        }

        console.log("[Workflow] Deleted workflow", {
          workflowId: deleted.id,
          userId,
        });

        return { success: true };
      } catch (error: any) {
        console.error("[Workflow] Delete error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete workflow",
        });
      }
    }),

  /**
   * Estimate workflow execution cost
   *
   * Proxies to Python backend for cost analysis.
   */
  estimateCost: protectedProcedure
    .input(
      z.object({
        workflowJson: z.object({
          nodes: z.array(z.any()),
          edges: z.array(z.any()),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          "/api/v1/workflows/estimate-cost",
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
            message: error.detail || "Cost estimation failed",
          });
        }

        const data = await response.json();

        console.log("[Workflow] Cost estimated", {
          userId: ctx.user.id,
          estimatedCredits: data.estimatedCredits,
          hasWarning: !!data.warning,
        });

        return data;
      } catch (error: any) {
        console.error("[Workflow] Cost estimation error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to estimate cost",
        });
      }
    }),

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

        // Section 14: Handle new errors/warnings response format
        if (!data.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: data.errors?.join("; ") || data.error || "Compilation failed",
          });
        }

        console.log("[Workflow] Compilation successful", {
          userId: ctx.user.id,
          nodeCount: data.manifest?.nodes?.length || 0,
          warnings: data.warnings?.length || 0,
        });

        // Pass through warnings to frontend
        return { ...data, warnings: data.warnings || [] };
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
   * Submit async workflow generation to the task queue.
   * Returns a taskId immediately — frontend polls autoGenerateStatus for result.
   */
  autoGenerate: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(150000),
        nodeTypes: z.array(z.record(z.any())).optional(),
        modelId: z.string().optional(),
        defaultModel: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          "/api/v1/workflows/generate",
          {
            method: "POST",
            body: JSON.stringify({
              prompt: input.prompt,
              node_types: input.nodeTypes ?? [],
              model_id: input.modelId ?? null,
              default_model: input.defaultModel ?? input.modelId ?? null,
            }),
          },
          ctx.userToken
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.detail || "Workflow generation failed",
          });
        }

        const data = await response.json();
        console.log("[Workflow] Auto-generation submitted to queue", {
          userId: ctx.user.id,
          taskId: data.task_id,
        });
        return { taskId: data.task_id as string };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit workflow generation",
        });
      }
    }),

  /**
   * Poll async workflow generation status.
   * Returns status + result when completed.
   */
  autoGenerateStatus: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/generate/status/${input.taskId}`,
          { method: "GET" },
          ctx.userToken
        );

        if (!response.ok) {
          if (response.status === 404) {
            return { status: "not_found" as const, error: "Task not found or expired" };
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Failed to check generation status",
          });
        }

        const data = await response.json();
        return data as {
          status: "queued" | "processing" | "completed" | "failed";
          message?: string;
          error?: string;
          nodes?: unknown[];
          edges?: unknown[];
          description?: string;
        };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to check generation status",
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
        limit: z.number().min(1).max(100).optional().default(20),
        offset: z.number().min(0).optional().default(0),
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
   * Starts workflow execution with compiled workflow JSON.
   */
  execute: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        workflowJson: z.object({
          nodes: z.array(z.any()),
          edges: z.array(z.any()),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          "/api/v1/workflows/execute",
          {
            method: "POST",
            body: JSON.stringify({ workflowJson: input.workflowJson }),
          },
          ctx.userToken
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          throw new TRPCError({
            code: error.status === 402 ? "PAYMENT_REQUIRED" as any : "BAD_REQUEST",
            message: error.detail || "Execution failed",
          });
        }

        const data = await response.json();

        console.log("[Workflow] Execution started", {
          userId: ctx.user.id,
          executionId: data.executionId,
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
          `/api/v1/workflows/report/${input.executionId}`,
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

  /**
   * Get all registered node types from Python backend registry
   */
  getNodeTypes: protectedProcedure.query(async ({ ctx }) => {
    try {
      const response = await fetchPythonBackend(
        "/api/v1/workflows/node-types",
        { method: "GET" },
        ctx.userToken
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          detail: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.detail || "Failed to fetch node types",
        });
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error("[Workflow] Get node types error:", error.message);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch node types",
      });
    }
  }),

  /**
   * Resume a paused workflow (HITL response) - Section 14
   */
  resume: protectedProcedure
    .input(
      z.object({
        executionId: z.string().regex(/^exec-[a-f0-9]{12}$/),
        response: z.record(z.any()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/execute/${input.executionId}/resume`,
          {
            method: "POST",
            body: JSON.stringify({ response: input.response }),
          },
          ctx.userToken
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          const code =
            response.status === 404
              ? "NOT_FOUND"
              : response.status === 409
                ? "CONFLICT"
                : "BAD_REQUEST";
          throw new TRPCError({
            code: code as any,
            message: error.detail || "Failed to resume workflow",
          });
        }

        const data = await response.json();
        console.log("[Workflow] Resumed", {
          userId: ctx.user.id,
          executionId: input.executionId,
        });
        return data;
      } catch (error: any) {
        console.error("[Workflow] Resume error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resume workflow",
        });
      }
    }),

  /**
   * List Dead Letter Queue items - Section 14
   */
  listDLQ: protectedProcedure
    .input(
      z.object({
        workflowId: z.string().optional(),
        status: z.enum(["pending", "reprocessed", "discarded"]).optional(),
        limit: z.number().min(1).max(200).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const params = new URLSearchParams({
          limit: input.limit.toString(),
          offset: input.offset.toString(),
          ...(input.workflowId && { workflow_id: input.workflowId }),
          ...(input.status && { status: input.status }),
        });

        const response = await fetchPythonBackend(
          `/api/v1/workflows/dlq?${params}`,
          { method: "GET" },
          ctx.userToken
        );

        if (!response.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Failed to fetch DLQ items",
          });
        }

        return await response.json();
      } catch (error: any) {
        console.error("[Workflow] DLQ list error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list DLQ items",
        });
      }
    }),

  /**
   * Reprocess a DLQ item - Section 14
   */
  reprocessDLQ: protectedProcedure
    .input(
      z.object({
        dlqId: z.string(),
        overrideInput: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/dlq/${input.dlqId}/reprocess`,
          {
            method: "POST",
            body: JSON.stringify({
              override_input: input.overrideInput || null,
            }),
          },
          ctx.userToken
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          const code = response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST";
          throw new TRPCError({
            code: code as any,
            message: error.detail || "Failed to reprocess DLQ item",
          });
        }

        const data = await response.json();
        console.log("[Workflow] DLQ reprocessed", {
          userId: ctx.user.id,
          dlqId: input.dlqId,
        });
        return data;
      } catch (error: any) {
        console.error("[Workflow] DLQ reprocess error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to reprocess DLQ item",
        });
      }
    }),
});
