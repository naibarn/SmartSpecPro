/**
 * Workflow Router
 *
 * Proxies workflow operations to Python FastAPI backend.
 * Handles workflow compilation (ReactFlow → LangGraph), execution, and status tracking.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { workflows, workflowTemplates, templateCategories } from "@db/schema";
import { eq, and, desc, sql, count, asc, type SQL } from "drizzle-orm";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";

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
        // Normalize generic "output"/"input" handle names to null before sending to Python.
        // Template-seeded edges use these generic placeholder names. The Python validator
        // skips port compatibility checks when handles are null/falsy, which is correct
        // because these edges represent simple sequential connections.
        const normalizedEdges = input.edges.map((edge: Record<string, any>) => ({
          ...edge,
          sourceHandle: edge.sourceHandle === "output" ? null : (edge.sourceHandle ?? null),
          targetHandle: edge.targetHandle === "input" ? null : (edge.targetHandle ?? null),
        }));

        const response = await fetchPythonBackend(
          "/api/v1/workflows/compile",
          {
            method: "POST",
            body: JSON.stringify({ ...input, edges: normalizedEdges }),
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
    .use(createRateLimitMiddleware({ namespace: "workflow-generate", limit: 10, windowMs: 60_000 }))
    .input(
      z.object({
        prompt: z.string().min(1).max(50000),
        nodeTypes: z.array(z.record(z.any())).max(100).optional(),
        modelId: z.string().max(100).optional(),
        defaultModel: z.string().max(100).optional(),
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
    .input(z.object({ taskId: z.string().regex(/^wfgen-[a-f0-9]{12}$/) }))
    .query(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/generate/status/${encodeURIComponent(input.taskId)}`,
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
          validationError?: string;
          hint?: string;
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
    .input(z.object({ executionId: z.string().regex(/^exec-[a-f0-9]{12}$/).max(17) }))
    .query(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/report/${encodeURIComponent(input.executionId)}`,
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
    .input(z.object({ executionId: z.string().regex(/^exec-[a-f0-9]{12}$/).max(17) }))
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/${encodeURIComponent(input.executionId)}/cancel`,
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
        dlqId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/).max(50),
        overrideInput: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/dlq/${encodeURIComponent(input.dlqId)}/reprocess`,
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

  /**
   * Analyze workflow for conversion to skill - Workflow Addition Feature
   */
  analyzeConversion: protectedProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/${input.workflowId}/analyze-conversion`,
          { method: "GET" },
          ctx.userToken
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          throw new TRPCError({
            code: response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            message: error.detail || "Failed to analyze workflow",
          });
        }

        return await response.json();
      } catch (error: any) {
        console.error("[Workflow] Analyze conversion error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to analyze workflow for conversion",
        });
      }
    }),

  /**
   * Convert workflow to skill - Workflow Addition Feature
   */
  convertToSkill: protectedProcedure
    .input(
      z.object({
        workflowId: z.number(),
        config: z.object({
          name: z.string(),
          description: z.string().optional(),
          triggerPatterns: z.array(z.string()),
          isEnabled: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/${input.workflowId}/convert-to-skill`,
          {
            method: "POST",
            body: JSON.stringify({
              name: input.config.name,
              description: input.config.description,
              trigger_patterns: input.config.triggerPatterns,
              is_enabled: input.config.isEnabled ?? false,
            }),
          },
          ctx.userToken
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: ${response.statusText}`,
          }));
          throw new TRPCError({
            code: response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            message: error.detail || "Failed to convert workflow",
          });
        }

        const data = await response.json();
        console.log("[Workflow] Converted to skill", {
          userId: ctx.user.id,
          workflowId: input.workflowId,
          skillId: data.skill_id,
        });
        return data;
      } catch (error: any) {
        console.error("[Workflow] Convert error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to convert workflow to skill",
        });
      }
    }),

  // =========================================================================
  // Feature 017: Gallery Template Endpoints
  // =========================================================================

  /**
   * List published public templates for the Gallery grid.
   * Excludes workflowJson and previewSvg (fetched lazily via getTemplate).
   */
  listTemplates: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        search: z.string().max(200).optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).optional().default(24),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const conditions: SQL<unknown>[] = [
          eq(workflowTemplates.isPublic, true),
          eq(workflowTemplates.status, "published"),
        ];

        // Category filter: resolve name → id
        if (input.category) {
          const [cat] = await db
            .select({ id: templateCategories.id })
            .from(templateCategories)
            .where(eq(templateCategories.name, input.category))
            .limit(1);
          if (cat) {
            conditions.push(eq(workflowTemplates.categoryId, cat.id));
          } else {
            // Unknown category — return empty results
            return { items: [], total: 0 };
          }
        }

        // Full-text search via searchVector
        if (input.search) {
          conditions.push(
            sql`${workflowTemplates.searchVector} @@ plainto_tsquery('english', ${input.search})`
          );
        }

        const whereClause = and(...conditions)!;

        // Explicit column selection — excludes workflowJson and previewSvg
        const items = await db
          .select({
            id: workflowTemplates.id,
            name: workflowTemplates.name,
            description: workflowTemplates.description,
            category: templateCategories.name,
            tags: workflowTemplates.tags,
            isPublic: workflowTemplates.isPublic,
            isFeatured: workflowTemplates.isFeatured,
            status: workflowTemplates.status,
            downloadCount: workflowTemplates.downloadCount,
            version: workflowTemplates.version,
            industry: workflowTemplates.industry,
            stepCount: workflowTemplates.stepCount,
            estimatedSetupMinutes: workflowTemplates.estimatedSetupMinutes,
            templateKey: workflowTemplates.templateKey,
            createdAt: workflowTemplates.createdAt,
            updatedAt: workflowTemplates.updatedAt,
          })
          .from(workflowTemplates)
          .leftJoin(templateCategories, eq(workflowTemplates.categoryId, templateCategories.id))
          .where(whereClause)
          .orderBy(desc(workflowTemplates.downloadCount))
          .limit(input.limit)
          .offset(input.offset);

        // Total count (same conditions, no limit/offset)
        const [countResult] = await db
          .select({ cnt: count() })
          .from(workflowTemplates)
          .where(whereClause);

        return {
          items,
          total: Number(countResult?.cnt ?? 0),
        };
      } catch (error: any) {
        console.error("[Workflow] listTemplates error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list templates",
        });
      }
    }),

  /**
   * List all template categories with count of published public templates.
   * Zero-count categories still appear.
   */
  listTemplateCategories: publicProcedure.query(async () => {
    try {
      const categories = await db
        .select({
          id: templateCategories.id,
          name: templateCategories.name,
          templateCount: count(workflowTemplates.id),
        })
        .from(templateCategories)
        .leftJoin(
          workflowTemplates,
          and(
            eq(workflowTemplates.categoryId, templateCategories.id),
            eq(workflowTemplates.isPublic, true),
            eq(workflowTemplates.status, "published")
          )
        )
        .groupBy(templateCategories.id, templateCategories.name)
        .orderBy(asc(templateCategories.name));

      return categories;
    } catch (error: any) {
      console.error(
        "[Workflow] listTemplateCategories error:",
        error.message
      );
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list template categories",
      });
    }
  }),

  /**
   * Get full template record including workflowJson and previewSvg.
   * Called lazily when user opens template detail.
   */
  getTemplate: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      try {
        // M-03: Explicit column selection — excludes authorId, tenantId, searchVector
        const [template] = await db
          .select({
            id: workflowTemplates.id,
            name: workflowTemplates.name,
            description: workflowTemplates.description,
            workflowJson: workflowTemplates.workflowJson,
            previewSvg: workflowTemplates.previewSvg,
            tags: workflowTemplates.tags,
            isPublic: workflowTemplates.isPublic,
            isFeatured: workflowTemplates.isFeatured,
            status: workflowTemplates.status,
            downloadCount: workflowTemplates.downloadCount,
            version: workflowTemplates.version,
            industry: workflowTemplates.industry,
            stepCount: workflowTemplates.stepCount,
            estimatedSetupMinutes: workflowTemplates.estimatedSetupMinutes,
            templateKey: workflowTemplates.templateKey,
            createdAt: workflowTemplates.createdAt,
            updatedAt: workflowTemplates.updatedAt,
          })
          .from(workflowTemplates)
          .where(
            and(
              eq(workflowTemplates.id, input.id),
              eq(workflowTemplates.isPublic, true),
              eq(workflowTemplates.status, "published") // M-01: require published status
            )
          )
          .limit(1);

        if (!template) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Template not found",
          });
        }

        // H-06: SVG sanitization — defense-in-depth against stored XSS
        let safeSvg = template.previewSvg;
        if (safeSvg) {
          const forbiddenSvgPattern = /<script|javascript:|on\w+\s*=|<foreignObject|<iframe|xlink:href\s*=\s*["']javascript/i;
          if (forbiddenSvgPattern.test(safeSvg)) {
            console.error("[Security] Rejected poisoned previewSvg from DB, templateId:", input.id);
            safeSvg = null;
          }
        }

        return { ...template, previewSvg: safeSvg };
      } catch (error: any) {
        console.error("[Workflow] getTemplate error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get template",
        });
      }
    }),

  /**
   * Clone a template into a new draft workflow owned by the caller.
   * Increments downloadCount on the source template.
   */
  useTemplate: protectedProcedure
    .use(createRateLimitMiddleware({ namespace: "gallery-use-template", limit: 20, windowMs: 60_000 }))
    .input(
      z.object({
        templateId: z.number(),
        name: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // 1. Fetch the template (must be public + published)
        const [template] = await db
          .select()
          .from(workflowTemplates)
          .where(
            and(
              eq(workflowTemplates.id, input.templateId),
              eq(workflowTemplates.isPublic, true),
              eq(workflowTemplates.status, "published")
            )
          )
          .limit(1);

        if (!template) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Template not found",
          });
        }

        const userId = ctx.user.id;
        const tenantId = ctx.user.currentTenantId
          ? String(ctx.user.currentTenantId)
          : null;

        // 2. Create new draft workflow + increment downloadCount in transaction
        const result = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(workflows)
            .values({
              name: input.name ?? template.name,
              description: template.description,
              workflowJson: template.workflowJson,
              userId,
              tenantId,
              status: "draft",
              schemaVersion: "1.0.0",
            })
            .returning();

          await tx
            .update(workflowTemplates)
            .set({
              downloadCount: sql`${workflowTemplates.downloadCount} + 1`,
            })
            .where(eq(workflowTemplates.id, input.templateId));

          return created;
        });

        console.log("[Workflow] Template used", {
          templateId: input.templateId,
          newWorkflowId: result.id,
          userId,
        });

        return { id: result.id };
      } catch (error: any) {
        console.error("[Workflow] useTemplate error:", error.message);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to use template",
        });
      }
    }),
});
