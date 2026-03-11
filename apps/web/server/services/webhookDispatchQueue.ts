/**
 * Webhook Dispatch Queue — BullMQ-based reliable webhook-to-target dispatch.
 *
 * Replaces the fire-and-forget setImmediate in webhookTrigger.ts with a proper
 * queue that supports retries (4 attempts, exponential backoff), credit
 * idempotency (jobId-keyed deduplication), and final-failure logging.
 *
 * Supports dispatch to: Agency, Chat, Workflow
 */

import { Queue, Worker, UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { getRealtimeClient } from "./redisClients";
import { getDb } from "../db";
import { webhookTriggers, webhookTriggerLogs } from "../../drizzle/schema";
import { deductCredits } from "./creditService";
import { channelGateway } from "./channelGateway";
import { agencyBridge } from "./agencyBridge";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { buildAgencyTaskMetadata } from "./agencyEscalation";
import { stripSecrets } from "./webhookTriggerService";
import { auditLogger } from "./auditLogger";
import { ENV } from "../_core/env";

// ── Constants ────────────────────────────────────────────────────────────

const QUEUE_NAME = "webhook-dispatch";
const MAX_ATTEMPTS = 4;
const PYTHON_BACKEND_URL = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");
const GATEWAY_TOKEN = ENV.webGatewayToken;

// ── Job interface ─────────────────────────────────────────────────────────

export interface WebhookDispatchJob {
  triggerId: string;
  userId: number;
  tenantId: string;
  targetType: "agency" | "chat" | "workflow";
  targetAgencyId?: string;
  targetConversationId?: number;
  targetWorkflowId?: number;
  message: string;                         // template-substituted dispatch message
  payload: Record<string, unknown>;        // full substituted payload
  creditCost: number;
  startTime: number;                       // for processingTimeMs calculation
  requestBodyHash: string;
  requestMethod: string;
  requestBodySize: number;
  requestHeadersSafe: Record<string, string>;
  sourceIpMasked: string;
  parsedBody: Record<string, unknown>;     // raw request body for log storage
}

// ── Module state ─────────────────────────────────────────────────────────

let dispatchQueue: Queue<WebhookDispatchJob> | null = null;
let dispatchWorker: Worker<WebhookDispatchJob> | null = null;

// ── Worker processor ─────────────────────────────────────────────────────

export async function processWebhookDispatch(job: Job<WebhookDispatchJob>): Promise<void> {
  const {
    triggerId, userId, tenantId, targetType,
    targetAgencyId, targetConversationId, targetWorkflowId,
    message, payload, creditCost, startTime,
    requestBodyHash, requestMethod, requestBodySize,
    requestHeadersSafe, sourceIpMasked, parsedBody,
  } = job.data;

  const db = await getDb();
  let targetExecutionId: string | undefined;

  // ── Dispatch to configured target ─────────────────────────────────────

  if (targetType === "agency" && targetAgencyId) {
    const plannerResult = await runPlanner({
      sourceType: "webhook",
      userId,
      tenantId,
    }).catch(() => null);
    const taskMetadata = plannerResult
      ? buildAgencyTaskMetadata({
          taskRunId: plannerResult.taskRunId,
          plan: plannerResult.plan,
          routeReason: "agency:webhook_dispatch",
        })
      : undefined;

    const result = await agencyBridge.executeRun({
      agencyId: targetAgencyId,
      conversationId: targetAgencyId, // agencyId as server-side conv fallback
      message,
      userToken: "",                  // server-side dispatch — no user session
      tenantId,
      userId,
      taskMetadata,
    });
    targetExecutionId = result.runId;

    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model: "agency",
        inputTokens: 0,
        outputTokens: 0,
      }).catch(() => {});
    }

  } else if (targetType === "chat" && targetConversationId) {
    await channelGateway.processMessageServerSide({
      conversationId: targetConversationId,
      userId,
      tenantId,
      content: message,
      connectionId: `webhook_${triggerId}`,
    });

  } else if (targetType === "workflow" && targetWorkflowId) {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/v1/workflows/internal/${targetWorkflowId}/webhook-trigger`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GATEWAY_TOKEN}`,
        },
        body: JSON.stringify({
          input_data: payload,
          webhook_trigger_id: triggerId,
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Workflow dispatch failed: HTTP ${response.status} — ${errText.slice(0, 200)}`,
      );
    }
    const data = await response.json() as { executionId?: string };
    targetExecutionId = data.executionId;

  } else {
    // No valid target configured — permanent failure, don't retry
    throw new UnrecoverableError(
      `No valid dispatch target: type=${targetType}, ` +
      `agencyId=${targetAgencyId ?? "none"}, ` +
      `conversationId=${targetConversationId ?? "none"}, ` +
      `workflowId=${targetWorkflowId ?? "none"}`,
    );
  }

  // ── Credit deduction with idempotency key ─────────────────────────────
  // jobId ensures double-charge is prevented if the job retries after credit is deducted.

  await deductCredits({
    userId,
    tenantId,
    amount: creditCost,
    description: `Webhook trigger dispatch`,
    sourceType: "webhook_trigger",
    idempotencyKey: `wh-dispatch-${job.id}`,
  }).catch((err) => {
    // Non-fatal: audit trail preserved. Don't fail the job over credit errors.
    auditLogger.log({
      eventType: "webhook_credit_deduction_failed" as any,
      userId,
      metadata: { triggerId, error: String(err) },
    });
  });

  // ── Record success log ────────────────────────────────────────────────

  const processingTimeMs = Date.now() - startTime;
  if (db) {
    await db
      .insert(webhookTriggerLogs)
      .values({
        triggerId,
        requestMethod,
        requestBodyHash,
        requestBodySize,
        requestHeadersSafe,
        extractedVariables: stripSecrets(parsedBody),
        sourceIpMasked,
        status: "success",
        targetExecutionId: targetExecutionId ?? null,
        creditsConsumed: String(creditCost),
        processingTimeMs,
      } as any)
      .catch((logErr) => {
        auditLogger.log({
          eventType: "webhook_log_error" as any,
          userId,
          metadata: { triggerId, error: String(logErr) },
        });
      });

    // Atomic counter increment
    await db
      .update(webhookTriggers)
      .set({
        totalTriggers: sql`${webhookTriggers.totalTriggers} + 1`,
        lastTriggeredAt: new Date(),
      } as any)
      .where(eq(webhookTriggers.id, triggerId))
      .catch(() => {});
  }
}

// ── Initialization ────────────────────────────────────────────────────────

export async function initWebhookDispatchQueue(): Promise<void> {
  const redis = getRealtimeClient();

  dispatchQueue = new Queue<WebhookDispatchJob>(QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: 3000 }, // 3s → 9s → 27s → 81s
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });

  dispatchWorker = new Worker<WebhookDispatchJob>(
    QUEUE_NAME,
    processWebhookDispatch,
    {
      connection: redis.duplicate(),
      concurrency: 20,
    },
  );

  // Final-failure handler: record error in webhook trigger log
  dispatchWorker.on("failed", (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts?.attempts ?? MAX_ATTEMPTS;
    const isExhausted = job.attemptsMade >= maxAttempts;
    const isUnrecoverable = err instanceof UnrecoverableError;
    if (!isExhausted && !isUnrecoverable) return;

    const {
      triggerId, userId, requestMethod, requestBodyHash,
      requestBodySize, requestHeadersSafe, sourceIpMasked, startTime,
    } = job.data;

    getDb()
      .then((db) => {
        if (!db) return;
        return db
          .insert(webhookTriggerLogs)
          .values({
            triggerId,
            requestMethod,
            requestBodyHash,
            requestBodySize,
            requestHeadersSafe,
            extractedVariables: {},
            sourceIpMasked,
            status: "target_error",
            creditsConsumed: "0",
            errorMessage: String(err).slice(0, 1000),
            processingTimeMs: Date.now() - startTime,
          } as any);
      })
      .catch(() => {});
  });

  console.log("[WebhookDispatchQueue] Initialized: concurrency=20, attempts=4, backoff=3s exp");
}

// ── Enqueue ───────────────────────────────────────────────────────────────

export async function enqueueWebhookDispatch(job: WebhookDispatchJob): Promise<void> {
  if (!dispatchQueue) {
    // Graceful fallback if queue not initialized (e.g. Redis unavailable at startup)
    console.warn("[WebhookDispatchQueue] Not initialized — running inline (no retry)");
    setImmediate(() => {
      processWebhookDispatch({ id: `inline-${Date.now()}`, data: job, attemptsMade: 0 } as any)
        .catch((err) => {
          console.error("[WebhookDispatchQueue] Inline dispatch failed:", err);
        });
    });
    return;
  }

  // Deterministic jobId prevents duplicate enqueue on transient 200+enqueue failure
  const jobId = `wh-${job.triggerId}-${job.requestBodyHash}-${job.startTime}`;
  await dispatchQueue.add("dispatch", job, { jobId });
}

// ── Shutdown ──────────────────────────────────────────────────────────────

export async function closeWebhookDispatchQueue(): Promise<void> {
  if (dispatchWorker) {
    await dispatchWorker.close();
    dispatchWorker = null;
  }
  if (dispatchQueue) {
    await dispatchQueue.close();
    dispatchQueue = null;
  }
  console.log("[WebhookDispatchQueue] Shut down");
}
