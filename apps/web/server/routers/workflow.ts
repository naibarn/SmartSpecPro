/**
 * Workflow Router
 *
 * Proxies workflow operations to Python FastAPI backend.
 * Handles workflow compilation (ReactFlow → LangGraph), execution, and status tracking.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { workflows, workflowTemplates, templateCategories, workflowVersions, users } from "@db/schema";
import { eq, and, desc, sql, count, asc, max, inArray, type SQL } from "drizzle-orm";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { createHash } from "crypto";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import {
  assertWorkflowBrowserSessionNodesAllowed,
  filterWorkflowNodeRegistryForFlags,
} from "../services/workflowBrowserSessionFlags";
import {
  assertWorkflowWorkerRuntimeNodesAllowed,
  filterWorkflowWorkerRuntimeRegistryForFlags,
} from "../services/workflowWorkerRuntimeFlags";

// Loose but structural Zod schemas for workflow nodes/edges.
// Enforce minimum shape to prevent prototype pollution and unbounded payloads
// while remaining compatible with ReactFlow's flexible node/edge format.
const workflowNodeSchema = z
  .object({
    id: z.string().max(256),
    type: z.string().max(64).optional(),
    data: z.record(z.unknown()).optional(),
    position: z
      .object({ x: z.number(), y: z.number() })
      .optional(),
  })
  .passthrough();

const workflowEdgeSchema = z
  .object({
    id: z.string().max(256),
    source: z.string().max(256),
    target: z.string().max(256),
  })
  .passthrough();

const workflowJsonSchema = z.object({
  nodes: z.array(workflowNodeSchema).max(500),
  edges: z.array(workflowEdgeSchema).max(2000),
  viewport: z.record(z.unknown()).optional(),
});

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
  const runtime = await getAppRuntimeConfig();
  const url = `${runtime.pythonBackendUrl}${endpoint}`;
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

async function getWorkflowFeatureGateState(tenantId: string | null) {
  if (!tenantId) {
    return {
      workflowBrowserSessionNodes: false,
      openClawExternalRuntime: false,
      desktopZeroClawWorker: false,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    };
  }

  const flags = await getTenantFeatureFlags(tenantId);
  return {
    workflowBrowserSessionNodes: flags.workflowBrowserSessionNodes,
    openClawExternalRuntime: flags.openClawExternalRuntime,
    desktopZeroClawWorker: flags.desktopZeroClawWorker,
    nemoClawSecureWorkerPool: flags.nemoClawSecureWorkerPool,
    hiClawClusterRuntime: flags.hiClawClusterRuntime,
  };
}

/**
 * Create a workflow version snapshot.
 * Skips if content is identical to the latest version (SHA-256 dedup).
 * Prunes to max 50 versions per workflow.
 */
async function _createWorkflowVersion(params: {
  workflowId: number;
  tenantId: string | null;
  userId: number;
  name: string;
  description: string | null;
  defaultModel: string | null;
  workflowJson: object;
  changeDescription?: string | null;
}) {
  const contentHash = createHash("sha256")
    .update(JSON.stringify(params.workflowJson))
    .digest("hex");

  // Deduplication: skip if content unchanged
  const [latest] = await db
    .select({ contentHash: workflowVersions.contentHash })
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, params.workflowId))
    .orderBy(desc(workflowVersions.createdAt))
    .limit(1);
  if (latest?.contentHash === contentHash) return;

  const maxResult = await db
    .select({ maxVer: max(workflowVersions.versionNumber) })
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, params.workflowId));
  const nextVersionNumber = ((maxResult[0]?.maxVer as number | null) ?? 0) + 1;

  await db.insert(workflowVersions).values({
    workflowId: params.workflowId,
    tenantId: params.tenantId,
    versionNumber: nextVersionNumber,
    workflowJson: params.workflowJson as any,
    name: params.name,
    description: params.description,
    defaultModel: params.defaultModel,
    contentHash,
    changeDescription: params.changeDescription ?? null,
    createdByUserId: params.userId,
  });

  // Prune: keep only latest 50 versions per workflow (single SQL DELETE, no memory load)
  await db.instance.execute(sql`
    DELETE FROM workflow_versions
    WHERE id IN (
      SELECT id FROM workflow_versions
      WHERE "workflowId" = ${params.workflowId}
      ORDER BY "createdAt" DESC
      OFFSET 50
    )
  `);
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
        workflowJson: workflowJsonSchema,
        changeDescription: z
          .string()
          .max(500)
          .transform((s) => s.replace(/[\r\n\0]/g, " ").trim())
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;
        const workflowFlags = await getWorkflowFeatureGateState(tenantId);
        assertWorkflowBrowserSessionNodesAllowed(workflowFlags, input.workflowJson.nodes);
        assertWorkflowWorkerRuntimeNodesAllowed(workflowFlags, input.workflowJson.nodes);

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

          // Auto-create version snapshot
          await _createWorkflowVersion({
            workflowId: updated.id as number,
            tenantId,
            userId,
            name: input.name,
            description: input.description ?? null,
            defaultModel: input.defaultModel ?? null,
            workflowJson: input.workflowJson,
            changeDescription: input.changeDescription ?? null,
          });

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

          // Auto-create initial version snapshot
          await _createWorkflowVersion({
            workflowId: created.id as number,
            tenantId,
            userId,
            name: input.name,
            description: input.description ?? null,
            defaultModel: input.defaultModel ?? null,
            workflowJson: input.workflowJson,
            changeDescription: input.changeDescription ?? null,
          });

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
        workflowJson: workflowJsonSchema,
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
        const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;
        const workflowFlags = await getWorkflowFeatureGateState(tenantId);
        assertWorkflowBrowserSessionNodesAllowed(workflowFlags, input.nodes);
        assertWorkflowWorkerRuntimeNodesAllowed(workflowFlags, input.nodes);

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
   * Submit async workflow AI editing to the task queue.
   * Takes existing workflow JSON + errors/warnings + instructions.
   * Returns a taskId immediately — frontend polls autoEditStatus for result.
   */
  autoEdit: protectedProcedure
    .use(createRateLimitMiddleware({ namespace: "workflow-edit", limit: 10, windowMs: 60_000 }))
    .input(
      z.object({
        currentWorkflow: z.record(z.any()),
        errors: z.array(z.string()).max(50).optional().default([]),
        warnings: z.array(z.string()).max(50).optional().default([]),
        instructions: z.string().max(5000).optional().default(""),
        nodeTypes: z.array(z.record(z.any())).max(100).optional(),
        modelId: z.string().max(100).optional(),
        defaultModel: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          "/api/v1/workflows/edit",
          {
            method: "POST",
            body: JSON.stringify({
              current_workflow: input.currentWorkflow,
              errors: input.errors ?? [],
              warnings: input.warnings ?? [],
              instructions: input.instructions ?? "",
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
            message: err.detail || "Workflow editing failed",
          });
        }

        const data = await response.json();
        console.log("[Workflow] Auto-edit submitted to queue", {
          userId: ctx.user.id,
          taskId: data.task_id,
        });
        return { taskId: data.task_id as string };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit workflow editing",
        });
      }
    }),

  /**
   * Poll async workflow AI editing status.
   * Returns status + fixed workflow result when completed.
   */
  autoEditStatus: protectedProcedure
    .input(z.object({ taskId: z.string().regex(/^wfedit-[a-f0-9]{12}$/) }))
    .query(async ({ input, ctx }) => {
      try {
        const response = await fetchPythonBackend(
          `/api/v1/workflows/edit/status/${encodeURIComponent(input.taskId)}`,
          { method: "GET" },
          ctx.userToken
        );

        if (!response.ok) {
          if (response.status === 404) {
            return { status: "not_found" as const, error: "Task not found or expired" };
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Failed to check edit status",
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
          changes?: string[];
          validationError?: string;
          hint?: string;
        };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to check edit status",
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
          _compiledMetadata: z.record(z.unknown()).optional(),
        }),
        inputData: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;
        if (!tenantId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Tenant context is required before executing a workflow",
          });
        }
        const workflowFlags = await getWorkflowFeatureGateState(tenantId);
        assertWorkflowBrowserSessionNodesAllowed(workflowFlags, input.workflowJson.nodes);
        assertWorkflowWorkerRuntimeNodesAllowed(workflowFlags, input.workflowJson.nodes);
        const response = await fetchPythonBackend(
          "/api/v1/workflows/execute",
          {
            method: "POST",
            body: JSON.stringify({
              workflowJson: input.workflowJson,
              workflow_id: input.id ?? null,
              tenant_id: tenantId,
              input_data: input.inputData ?? null,
            }),
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
      const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;
      const workflowFlags = await getWorkflowFeatureGateState(tenantId);
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
      return {
        ...data,
        node_types: filterWorkflowWorkerRuntimeRegistryForFlags(
          filterWorkflowNodeRegistryForFlags(
            Array.isArray(data.node_types) ? data.node_types : [],
            workflowFlags,
          ),
          workflowFlags,
        ),
      };
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

  // ─────────────────────────────────────────────────────────────────────────
  // Workflow Version History
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List version metadata for a workflow (no full JSON — fast).
   * Includes server-computed nodeCount and edgeCount via SQL.
   * Returns items + total count for pagination.
   */
  listVersions: protectedProcedure
    .input(
      z.object({
        workflowId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;

      // Verify ownership with tenantId for multi-tenant isolation
      const ownershipConditions = workflowOwnershipConditions(input.workflowId, userId, tenantId);
      const [wf] = await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(and(...ownershipConditions))
        .limit(1);
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });

      const [items, [{ total }]] = await Promise.all([
        db
          .select({
            id: workflowVersions.id,
            versionNumber: workflowVersions.versionNumber,
            name: workflowVersions.name,
            changeDescription: workflowVersions.changeDescription,
            nodeCount: sql<number>`jsonb_array_length((workflow_versions."workflowJson"::jsonb->'nodes'))`,
            edgeCount: sql<number>`jsonb_array_length((workflow_versions."workflowJson"::jsonb->'edges'))`,
            createdAt: workflowVersions.createdAt,
          })
          .from(workflowVersions)
          .where(eq(workflowVersions.workflowId, input.workflowId))
          .orderBy(desc(workflowVersions.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ total: count() })
          .from(workflowVersions)
          .where(eq(workflowVersions.workflowId, input.workflowId)),
      ]);

      return { items, total };
    }),

  /**
   * Get full version content (workflowJson) for preview or restore.
   * Checks ownership BEFORE fetching version content (ownership-then-fetch pattern).
   */
  getVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;

      // Fetch version to learn its workflowId, then verify ownership with tenantId
      const [version] = await db
        .select()
        .from(workflowVersions)
        .where(eq(workflowVersions.id, input.versionId))
        .limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      // Ownership check with tenantId for multi-tenant isolation
      const ownershipConditions = workflowOwnershipConditions(version.workflowId, userId, tenantId);
      const [wf] = await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(and(...ownershipConditions))
        .limit(1);
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      return version;
    }),

  /**
   * Restore a previous version.
   * Auto-saves current state first, then overwrites workflow with the snapshot.
   */
  restoreVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const tenantId = ctx.user.currentTenantId ? String(ctx.user.currentTenantId) : null;

      // Fetch version first, then verify ownership with tenantId
      const [version] = await db
        .select()
        .from(workflowVersions)
        .where(eq(workflowVersions.id, input.versionId))
        .limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      // Ownership check with tenantId for multi-tenant isolation
      const ownershipConditions = workflowOwnershipConditions(version.workflowId, userId, tenantId);
      const [wf] = await db
        .select()
        .from(workflows)
        .where(and(...ownershipConditions))
        .limit(1);
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      // Snapshot current state BEFORE overwriting
      await _createWorkflowVersion({
        workflowId: wf.id,
        tenantId,
        userId,
        name: wf.name,
        description: wf.description,
        defaultModel: wf.defaultModel,
        workflowJson: wf.workflowJson as object,
        changeDescription: `Auto-saved before restoring version ${version.versionNumber}`,
      });

      // Restore: overwrite workflow with version snapshot
      await db
        .update(workflows)
        .set({
          workflowJson: version.workflowJson,
          name: version.name,
          description: version.description,
          defaultModel: version.defaultModel,
          status: "draft",
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, wf.id));

      console.log("[Workflow] Restored version", {
        workflowId: wf.id,
        versionNumber: version.versionNumber,
        userId,
      });

      return { workflowId: wf.id, restoredVersionNumber: version.versionNumber };
    }),

  // ──────────────────────────────────────────────────────────────
  //  Publish Request & Admin Approval for Workflow Templates
  // ──────────────────────────────────────────────────────────────

  /**
   * User requests their workflow be published to the public Gallery.
   * Creates (or updates) a workflowTemplate with status = "pending_review".
   */
  requestPublishTemplate: protectedProcedure
    .input(z.object({ workflowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");

      // Verify ownership
      const [wf] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, input.workflowId), eq(workflows.userId, userId)))
        .limit(1);

      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });

      const wfJson = wf.workflowJson as { nodes?: any[]; edges?: any[] } | null;
      if (!wfJson?.nodes?.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Workflow must have at least 1 node" });
      }

      // Generate preview SVG
      let previewSvg: string | null = null;
      try {
        const { generateWorkflowSvg } = await import("../lib/workflowSvgGenerator");
        previewSvg = generateWorkflowSvg({
          nodes: (wfJson.nodes || []) as any[],
          edges: (wfJson.edges || []) as any[],
        });
      } catch (_) { /* non-fatal */ }

      // Upsert: find existing template from this workflow or create new
      const [existing] = await db
        .select({ id: workflowTemplates.id, status: workflowTemplates.status })
        .from(workflowTemplates)
        .where(and(eq(workflowTemplates.authorId, userId), eq(workflowTemplates.name, wf.name || "Untitled")))
        .limit(1);

      let templateId: number;

      if (existing) {
        if (existing.status === "pending_review") {
          throw new TRPCError({ code: "CONFLICT", message: "This workflow already has a pending publish request" });
        }
        // Update existing template
        const [updated] = await db
          .update(workflowTemplates)
          .set({
            description: wf.description,
            workflowJson: wf.workflowJson,
            status: "pending_review",
            isPublic: false,
            requestedPublishAt: new Date(),
            rejectionReason: null,
            approvedBy: null,
            approvedAt: null,
            previewSvg,
            stepCount: wfJson.nodes?.length ?? 0,
            updatedAt: new Date(),
          })
          .where(eq(workflowTemplates.id, existing.id))
          .returning({ id: workflowTemplates.id });
        templateId = updated.id;
      } else {
        // Create new template
        const [created] = await db
          .insert(workflowTemplates)
          .values({
            name: wf.name || "Untitled Workflow",
            description: wf.description,
            workflowJson: wf.workflowJson,
            authorId: userId,
            tenantId,
            status: "pending_review",
            isPublic: false,
            requestedPublishAt: new Date(),
            previewSvg,
            stepCount: wfJson.nodes?.length ?? 0,
          })
          .returning({ id: workflowTemplates.id });
        templateId = created.id;
      }

      // Notify all admins
      try {
        const { createNotification } = await import("../services/notificationService");
        const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
        for (const admin of admins) {
          await createNotification({
            db: db.instance,
            userId: admin.id,
            type: "system",
            title: "Workflow Template Publish Request",
            content: `User requested to publish workflow "${wf.name}" to the Gallery.`,
            priority: "normal",
            relatedResourceType: "workflow",
            relatedResourceId: String(templateId),
            actionUrl: `/admin/workflows?templateId=${templateId}`,
            actionLabel: "Review Workflow",
            metadata: { source: "workflow.publishRequest" },
          });
        }
      } catch (_) { /* non-fatal */ }

      return { success: true, templateId };
    }),

  /**
   * User cancels their pending publish request.
   */
  cancelPublishRequest: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      const [tpl] = await db
        .select({ id: workflowTemplates.id, authorId: workflowTemplates.authorId, status: workflowTemplates.status })
        .from(workflowTemplates)
        .where(eq(workflowTemplates.id, input.templateId))
        .limit(1);

      if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      if (tpl.authorId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Not the template author" });
      if (tpl.status !== "pending_review") throw new TRPCError({ code: "BAD_REQUEST", message: "Template is not pending review" });

      await db
        .update(workflowTemplates)
        .set({ status: "draft", requestedPublishAt: null, updatedAt: new Date() })
        .where(eq(workflowTemplates.id, input.templateId));

      return { success: true };
    }),

  /**
   * Admin approves a pending workflow template for public gallery.
   */
  adminApproveTemplate: adminProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [tpl] = await db
        .select({ id: workflowTemplates.id, authorId: workflowTemplates.authorId, name: workflowTemplates.name, status: workflowTemplates.status })
        .from(workflowTemplates)
        .where(eq(workflowTemplates.id, input.templateId))
        .limit(1);

      if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      if (tpl.status !== "pending_review") throw new TRPCError({ code: "BAD_REQUEST", message: "Template is not pending review" });

      await db
        .update(workflowTemplates)
        .set({
          status: "published",
          isPublic: true,
          approvedBy: ctx.user!.id,
          approvedAt: new Date(),
          rejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowTemplates.id, input.templateId));

      // Notify creator
      try {
        if (tpl.authorId) {
          const { createNotification } = await import("../services/notificationService");
          await createNotification({
            db: db.instance,
            userId: tpl.authorId,
            type: "system",
            title: "Workflow Template Approved!",
            content: `Your workflow "${tpl.name}" has been approved and is now visible in the Gallery.`,
            priority: "normal",
            relatedResourceType: "workflow",
            relatedResourceId: String(input.templateId),
            actionUrl: `/workflows?templateId=${input.templateId}`,
            actionLabel: "View Workflow",
            metadata: { source: "workflow.approved" },
          });
        }
      } catch (_) { /* non-fatal */ }

      return { success: true };
    }),

  /**
   * Admin rejects a pending workflow template.
   */
  adminRejectTemplate: adminProcedure
    .input(z.object({
      templateId: z.number(),
      reason: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [tpl] = await db
        .select({ id: workflowTemplates.id, authorId: workflowTemplates.authorId, name: workflowTemplates.name, status: workflowTemplates.status })
        .from(workflowTemplates)
        .where(eq(workflowTemplates.id, input.templateId))
        .limit(1);

      if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      if (tpl.status !== "pending_review") throw new TRPCError({ code: "BAD_REQUEST", message: "Template is not pending review" });

      await db
        .update(workflowTemplates)
        .set({
          status: "rejected",
          rejectionReason: input.reason?.trim() || null,
          approvedBy: null,
          approvedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowTemplates.id, input.templateId));

      // Notify creator
      try {
        if (tpl.authorId) {
          const { createNotification } = await import("../services/notificationService");
          const reasonText = input.reason?.trim() ? ` Reason: ${input.reason.trim()}` : "";
          await createNotification({
            db: db.instance,
            userId: tpl.authorId,
            type: "system",
            title: "Workflow Template Rejected",
            content: `Your workflow "${tpl.name}" was not approved for the Gallery.${reasonText}`,
            priority: "normal",
            relatedResourceType: "workflow",
            relatedResourceId: String(input.templateId),
            actionUrl: `/workflows?templateId=${input.templateId}`,
            actionLabel: "View Workflow",
            metadata: { source: "workflow.rejected" },
          });
        }
      } catch (_) { /* non-fatal */ }

      return { success: true };
    }),

  /**
   * Returns the current user's template submissions with their approval status.
   * Allows users to see pending/approved/rejected templates.
   */
  getMyTemplateSubmissions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;
    const items = await db
      .select({
        id: workflowTemplates.id,
        name: workflowTemplates.name,
        status: workflowTemplates.status,
        requestedPublishAt: workflowTemplates.requestedPublishAt,
        approvedAt: workflowTemplates.approvedAt,
        rejectionReason: workflowTemplates.rejectionReason,
      })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.authorId, userId))
      .orderBy(desc(workflowTemplates.requestedPublishAt));
    return items;
  }),

  /**
   * Admin lists all pending workflow template approval requests.
   */
  adminListPendingTemplates: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const [totalRow] = await db
        .select({ cnt: count() })
        .from(workflowTemplates)
        .where(eq(workflowTemplates.status, "pending_review"));

      const items = await db
        .select({
          id: workflowTemplates.id,
          name: workflowTemplates.name,
          description: workflowTemplates.description,
          stepCount: workflowTemplates.stepCount,
          requestedPublishAt: workflowTemplates.requestedPublishAt,
          ownerName: users.name,
          ownerEmail: users.email,
        })
        .from(workflowTemplates)
        .leftJoin(users, eq(workflowTemplates.authorId, users.id))
        .where(eq(workflowTemplates.status, "pending_review"))
        .orderBy(asc(workflowTemplates.requestedPublishAt))
        .limit(input.limit)
        .offset(input.offset);

      return { items, total: Number(totalRow?.cnt ?? 0) };
    }),
});
