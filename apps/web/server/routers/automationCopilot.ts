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
const PROXY_TOKEN = process.env.SMARTSPEC_PROXY_TOKEN ?? "";
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
      const tenantId = ctx.user.tenantId;
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
          user_jwt: ctx.token ?? "",
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
      const tenantId = ctx.user.tenantId;
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
      const tenantId = ctx.user.tenantId;
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
        const db = getDb();
        const row = await db
          .select({ value: systemSettings.value })
          .from(systemSettings)
          .where(
            and(
              eq(systemSettings.category, "tenant_automation"),
              eq(systemSettings.key, `allowed_domains_${tenantId}`),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]);
        if (row?.value) {
          allowedDomains = row.value
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean);
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
        const db = getDb();
        const row = await db
          .select({ value: systemSettings.value })
          .from(systemSettings)
          .where(
            and(
              eq(systemSettings.category, "tenant_automation"),
              eq(systemSettings.key, "automation_vision_model"),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]);
        if (row?.value) {
          visionModel = row.value;
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
          user_jwt: ctx.token ?? "",
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
      const tenantId = ctx.user.tenantId;
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
});
