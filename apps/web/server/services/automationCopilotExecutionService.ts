import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../db";
import { creditTransactions } from "../../drizzle/schema";
import { createCreditReservation, hasEnoughCredits, refundCredits, refundReservation } from "./creditService";
import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";
import { getRedisClient, isRedisAvailable } from "./redis";
import { buildAutomationCopilotBrowserPolicyContext } from "./browserPolicyRuntime";
import { getTenantFeatureFlag } from "./featureFlags";
import { assertBrowserPolicySurfaceReady } from "./browserPolicyReleaseControl";
import { loadLegacyAutomationSettings } from "./browserPolicySettingsBridge";

const AUTOMATION_PREFIX = "/api/v1/automation-copilot";
const CREDIT_RESERVE_AMOUNT = 100;
const MIN_CREDITS_TO_START = 10;

async function callPythonBackend(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<Response> {
  const { method, body, timeoutMs = 30_000 } = options;
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${runtime.pythonBackendUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
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

export interface ExecuteAutomationCopilotTaskInput {
  tenantId: string;
  userId: number;
  taskId: string;
  executionId: string;
  intentJson: string;
}

export interface ExecuteAutomationCopilotTaskResult {
  ok: true;
  taskId: string;
  executionId: string;
  reservationId: string;
}

export interface AutomationCopilotTaskStatusResult {
  status: string;
  tenant_id?: string;
  user_id?: number;
  actual_credits_used?: number;
  intent?: Record<string, unknown>;
  error_message?: string;
  steps_completed?: number;
  steps_total?: number;
  [key: string]: unknown;
}

async function findDurableAutomationReservation(taskId: string, tenantId?: string) {
  const tenantPredicate = tenantId ? sql`AND job."tenantId" = ${tenantId}` : sql``;
  const [transaction] = await db
    .select({
      id: creditTransactions.id,
      userId: creditTransactions.userId,
      amount: creditTransactions.amount,
      tenantId: creditTransactions.tenantId,
      metadata: creditTransactions.metadata,
    })
    .from(creditTransactions)
    .where(and(
      eq(creditTransactions.type, "usage"),
      sql`${creditTransactions.amount} < 0`,
      sql`${creditTransactions.metadata}->>'taskId' = ${taskId}`,
      sql`${creditTransactions.metadata}->>'reservationId' IS NOT NULL`,
      sql`EXISTS (
        SELECT 1
        FROM "worker_jobs" job
        WHERE job."jobType" = 'python.legacy_task'
          AND job."inputJson"->'args'->>0 = ${taskId}
          ${tenantPredicate}
      )`,
    ))
    .orderBy(desc(creditTransactions.createdAt), desc(creditTransactions.id))
    .limit(1);
  if (!transaction || !transaction.metadata || typeof transaction.metadata !== "object") return null;
  const reservationId = (transaction.metadata as Record<string, unknown>).reservationId;
  return typeof reservationId === "string" && reservationId
    ? { ...transaction, reservationId }
    : null;
}

/**
 * Refund the fixed Automation Copilot reservation from the PostgreSQL credit
 * ledger when the Redis reservation/map is unavailable. Automation Copilot
 * does not draw incremental reservation amounts, so the original usage row is
 * the complete refund basis. The reversal idempotency key makes concurrent
 * status polls safe.
 */
async function refundDurableAutomationReservation(taskId: string, tenantId?: string): Promise<boolean> {
  const reservation = await findDurableAutomationReservation(taskId, tenantId);
  if (!reservation) return false;
  await refundCredits({
    userId: reservation.userId,
    amount: Math.abs(reservation.amount),
    description: `Automation Copilot reservation refund (${reservation.reservationId})`,
    originalTransactionId: reservation.id,
    idempotencyKey: `automation:reservation-refund:${reservation.reservationId}`,
    tenantId: reservation.tenantId ?? undefined,
    sourceType: "browser_automation",
    metadata: { reservationId: reservation.reservationId, taskId, source: "feature-186-durable-fallback" },
  });
  return true;
}

export async function finalizeAutomationCopilotTaskReservation(
  taskId: string,
  status: string,
  tenantId?: string,
): Promise<void> {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized !== "success" && normalized !== "failed" && normalized !== "cancelled" && normalized !== "canceled") {
    return;
  }
  let reservationId: string | null = null;
  let redis: ReturnType<typeof getRedisClient> | null = null;
  if (isRedisAvailable()) {
    redis = getRedisClient();
    reservationId = await redis.get(`automation:task_reservation:${taskId}`);
  }
  if (reservationId) {
    // Distinguish an expired/missing Redis reservation from a valid fully
    // drawn reservation. A zero refund on a valid reservation is not evidence
    // that the durable ledger should be refunded in full.
    const redisReservation = await redis?.get(`credit:reservation:${reservationId}`);
    const refunded = await refundReservation(reservationId);
    if (refunded.refundedAmount > 0 || redisReservation) {
      await redis?.del(`automation:task_reservation:${taskId}`);
      return;
    }
  }
  if (await refundDurableAutomationReservation(taskId, tenantId)) {
    if (redis) await redis.del(`automation:task_reservation:${taskId}`);
  }
}

export async function executeAutomationCopilotTask(
  input: ExecuteAutomationCopilotTaskInput,
): Promise<ExecuteAutomationCopilotTaskResult> {
  const enabled = await getTenantFeatureFlag("automationCopilot", input.tenantId);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Automation Copilot is disabled for this tenant",
    });
  }

  await assertBrowserPolicySurfaceReady({
    tenantId: input.tenantId,
    surface: "automationCopilot",
  }).catch((error) => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: error instanceof Error ? error.message : "Browser policy release gate blocked automation copilot",
    });
  });

  const hasCreds = await hasEnoughCredits(input.userId, MIN_CREDITS_TO_START);
  if (!hasCreds) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Insufficient credits (minimum ${MIN_CREDITS_TO_START} required)`,
    });
  }

  const reservation = await createCreditReservation(
    input.userId,
    CREDIT_RESERVE_AMOUNT,
    "browser_automation",
    { taskId: input.taskId, executionId: input.executionId },
    `automation:reservation:${input.tenantId}:${input.taskId}`,
    undefined,
    { allowWithoutRedis: true },
  );

  const { allowedDomains, visionModel } = await loadLegacyAutomationSettings();
  const browserPolicyContext = await buildAutomationCopilotBrowserPolicyContext({
    tenantId: input.tenantId,
    userId: input.userId,
    executionId: input.executionId,
    allowedDomains,
    visionModel,
  });

  const res = await callPythonBackend(`${AUTOMATION_PREFIX}/execute`, {
    method: "POST",
    body: {
      task_id: input.taskId,
      execution_id: input.executionId,
      intent_json: input.intentJson,
      tenant_id: input.tenantId,
      user_id: input.userId,
      vision_model: visionModel,
      allowed_domains: allowedDomains,
      browser_policy_context: browserPolicyContext,
      reservation_id: reservation.reservationId,
    },
    timeoutMs: 60_000,
  });

  if (!res.ok) {
    await refundReservation(reservation.reservationId, false, reservation);
    const msg = await readPythonError(res);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
  }

  if (isRedisAvailable()) {
    const redis = getRedisClient();
    await redis.set(
      `automation:task_reservation:${input.taskId}`,
      reservation.reservationId,
      "EX",
      900,
    );
  }

  return {
    ok: true,
    taskId: input.taskId,
    executionId: input.executionId,
    reservationId: reservation.reservationId,
  };
}

export async function getAutomationCopilotTaskStatus(
  tenantId: string,
  taskId: string,
): Promise<AutomationCopilotTaskStatusResult> {
  const enabled = await getTenantFeatureFlag("automationCopilot", tenantId);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Automation Copilot is disabled for this tenant",
    });
  }

  await assertBrowserPolicySurfaceReady({
    tenantId,
    surface: "automationCopilot",
  }).catch((error) => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: error instanceof Error ? error.message : "Browser policy release gate blocked automation copilot",
    });
  });

  const res = await callPythonBackend(`${AUTOMATION_PREFIX}/status/${encodeURIComponent(taskId)}?tenant_id=${encodeURIComponent(tenantId)}`, {
    method: "GET",
    timeoutMs: 30_000,
  });

  if (!res.ok) {
    const msg = await readPythonError(res);
    if (res.status === 404) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
  }

  return (await res.json()) as AutomationCopilotTaskStatusResult;
}
