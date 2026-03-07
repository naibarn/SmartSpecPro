/**
 * Automation Copilot tRPC Router
 *
 * Proxies requests to the Python backend's FastAPI endpoints
 * with credit management and tenant feature flags.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  analyzeInputSchema,
  cancelInputSchema,
  executeInputSchema,
  getStatusInputSchema,
} from "../../shared/automation/contracts";
import { protectedProcedure, router } from "../_core/trpc";
import {
  deductCredits,
  hasEnoughCredits,
  refundCredits,
} from "../services/creditService";
import { getTenantFeatureFlag } from "../services/featureFlags";

const PY_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const PROXY_TOKEN = process.env.SMARTSPEC_PROXY_TOKEN || process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || "";
const AUTOMATION_PREFIX = "/api/v1/automation-copilot";
const CREDIT_RESERVE_AMOUNT = 100;
const MIN_CREDITS_TO_START = 10;

async function callPythonBackend(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<Response> {
  const { method, body, timeoutMs = 30_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${PY_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(PROXY_TOKEN ? { "x-proxy-token": PROXY_TOKEN } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readPythonError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") {
      try {
        const parsed = JSON.parse(data.detail);
        return parsed.error || data.detail;
      } catch {
        return data.detail;
      }
    }
    return JSON.stringify(data);
  } catch {
    return res.statusText;
  }
}

export const automationCopilotRouter = router({
  /**
   * Parse a natural-language prompt into an automation intent.
   */
  analyze: protectedProcedure
    .input(analyzeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      // Feature flag check
      const enabled = await getTenantFeatureFlag("automationCopilot", tenantId);
      if (!enabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Automation Copilot is disabled for this tenant",
        });
      }

      // Credit balance check
      const hasCreds = await hasEnoughCredits(ctx.user.id, MIN_CREDITS_TO_START);
      if (!hasCreds) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits (minimum ${MIN_CREDITS_TO_START} required)`,
        });
      }

      const res = await callPythonBackend(`${AUTOMATION_PREFIX}/analyze`, {
        method: "POST",
        body: {
          prompt: input.prompt,
          tenant_id: tenantId,
          user_id: ctx.user.id,
          user_jwt: ctx.userToken ?? "",
        },
      });

      if (!res.ok) {
        const msg = await readPythonError(res);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }

      const data = (await res.json()) as { task_id: string };
      return { taskId: data.task_id };
    }),

  /**
   * Get the status of an automation task.
   */
  getStatus: protectedProcedure
    .input(getStatusInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      const res = await callPythonBackend(
        `${AUTOMATION_PREFIX}/status/${encodeURIComponent(input.taskId)}?tenant_id=${encodeURIComponent(tenantId)}`,
        { method: "GET" },
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
        }
        const msg = await readPythonError(res);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }

      return (await res.json()) as Record<string, unknown>;
    }),

  /**
   * Execute an automation task (generates + runs Playwright scripts).
   */
  execute: protectedProcedure
    .input(executeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      // Feature flag check
      const enabled = await getTenantFeatureFlag("automationCopilot", tenantId);
      if (!enabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Automation Copilot is disabled for this tenant",
        });
      }

      // Pre-reserve credits
      const hasCreds = await hasEnoughCredits(ctx.user.id, CREDIT_RESERVE_AMOUNT);
      if (!hasCreds) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits (${CREDIT_RESERVE_AMOUNT} required for execution)`,
        });
      }

      await deductCredits({
        userId: ctx.user.id,
        amount: CREDIT_RESERVE_AMOUNT,
        sourceType: "browser_automation",
        idempotencyKey: input.executionId,
        description: "Automation Copilot execution reservation",
        metadata: { taskId: input.taskId, executionId: input.executionId },
      });

      // Fetch tenant allowed_domains from system_settings
      let allowedDomains: string[] = [];
      try {
        const { getDb } = await import("../db");
        const { systemSettings } = await import("../../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const rows = await db
            .select({ value: systemSettings.value })
            .from(systemSettings)
            .where(
              and(
                eq(systemSettings.category, "tenant_automation"),
                eq(systemSettings.key, "allowed_domains"),
              ),
            )
            .limit(1);
          const row = rows[0];
          if (row?.value) {
            allowedDomains = row.value
              .split(",")
              .map((d: string) => d.trim())
              .filter(Boolean);
          }
        }
      } catch {
        // If system_settings query fails, use empty list (deny all)
      }

      // Fetch vision model preference
      let visionModel = "gpt-4o";
      try {
        const { getDb } = await import("../db");
        const { systemSettings } = await import("../../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const rows = await db
            .select({ value: systemSettings.value })
            .from(systemSettings)
            .where(
              and(
                eq(systemSettings.category, "tenant_automation"),
                eq(systemSettings.key, "automation_vision_model"),
              ),
            )
            .limit(1);
          const row = rows[0];
          if (row?.value) {
            visionModel = row.value;
          }
        }
      } catch {
        // Use default
      }

      const res = await callPythonBackend(`${AUTOMATION_PREFIX}/execute`, {
        method: "POST",
        body: {
          task_id: input.taskId,
          execution_id: input.executionId,
          intent_json: input.intentJson,
          user_jwt: ctx.userToken ?? "",
          tenant_id: tenantId,
          user_id: ctx.user.id,
          vision_model: visionModel,
          allowed_domains: allowedDomains,
        },
        timeoutMs: 60_000,
      });

      if (!res.ok) {
        // Refund on failure to enqueue
        await refundCredits({
          userId: ctx.user.id,
          amount: CREDIT_RESERVE_AMOUNT,
          description: "Automation Copilot reservation refund (enqueue failed)",
          metadata: { taskId: input.taskId, executionId: input.executionId },
        });
        const msg = await readPythonError(res);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }

      return { ok: true };
    }),

  /**
   * Cancel a running automation task.
   */
  cancel: protectedProcedure
    .input(cancelInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      const res = await callPythonBackend(
        `${AUTOMATION_PREFIX}/cancel/${encodeURIComponent(input.taskId)}`,
        {
          method: "POST",
          body: { tenant_id: tenantId },
        },
      );

      if (!res.ok) {
        const msg = await readPythonError(res);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }

      return { cancelled: true };
    }),

  /**
   * Save a successful automation as a reusable template.
   */
  saveTemplate: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        intentJson: z.string().min(1),
        scriptsJson: z.string().min(1),
        isPublic: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      const { getDb } = await import("../db");
      const { automationTemplates } = await import("../../drizzle/schema");
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const [row] = await db
        .insert(automationTemplates)
        .values({
          tenantId,
          userId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          intent: JSON.parse(input.intentJson),
          scripts: JSON.parse(input.scriptsJson),
          isPublic: input.isPublic,
        })
        .returning({ id: automationTemplates.id });

      return { id: row.id };
    }),

  /**
   * List automation templates (own + public).
   */
  listTemplates: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).optional().default(20),
        cursor: z.string().optional(),
        publicOnly: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      const { getDb } = await import("../db");
      const { automationTemplates } = await import("../../drizzle/schema");
      const { eq, or, lt, desc, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const conditions = input.publicOnly
        ? [eq(automationTemplates.isPublic, true)]
        : [
            or(
              eq(automationTemplates.tenantId, tenantId),
              eq(automationTemplates.isPublic, true),
            )!,
          ];

      if (input.cursor) {
        conditions.push(lt(automationTemplates.createdAt, new Date(input.cursor)));
      }

      const rows = await db
        .select()
        .from(automationTemplates)
        .where(and(...conditions))
        .orderBy(desc(automationTemplates.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const templates = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore
        ? templates[templates.length - 1].createdAt.toISOString()
        : undefined;

      return { templates, nextCursor };
    }),

  /**
   * Use a template (increment usage count and return intent/scripts).
   */
  useTemplate: protectedProcedure
    .input(z.object({ templateId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      const { getDb } = await import("../db");
      const { automationTemplates } = await import("../../drizzle/schema");
      const { eq, or, and, sql: sqlFn } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      // Only allow access to own or public templates
      const [template] = await db
        .select()
        .from(automationTemplates)
        .where(
          and(
            eq(automationTemplates.id, input.templateId),
            or(
              eq(automationTemplates.tenantId, tenantId),
              eq(automationTemplates.isPublic, true),
            ),
          ),
        )
        .limit(1);

      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }

      // Increment usage
      await db
        .update(automationTemplates)
        .set({
          usageCount: sqlFn`${automationTemplates.usageCount} + 1`,
          lastUsedAt: new Date(),
        })
        .where(eq(automationTemplates.id, input.templateId));

      return {
        intent: template.intent,
        scripts: template.scripts,
        name: template.name,
      };
    }),

  /**
   * Delete a template (own templates only).
   */
  deleteTemplate: protectedProcedure
    .input(z.object({ templateId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      const { getDb } = await import("../db");
      const { automationTemplates } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const result = await db
        .delete(automationTemplates)
        .where(
          and(
            eq(automationTemplates.id, input.templateId),
            eq(automationTemplates.tenantId, tenantId),
          ),
        );

      return { deleted: true };
    }),
});
