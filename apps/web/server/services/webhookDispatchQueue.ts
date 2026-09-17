/**
 * Webhook Dispatch Queue — BullMQ-based reliable webhook-to-target dispatch.
 *
 * Replaces the fire-and-forget setImmediate in webhookTrigger.ts with a proper
 * queue that supports retries (4 attempts, exponential backoff), credit
 * idempotency (jobId-keyed deduplication), and final-failure logging.
 *
 * Supports dispatch to the chat channel only.
 */

import { UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { webhookTriggers, webhookTriggerLogs } from "../../drizzle/schema";
import { deductCredits } from "./creditService";
import { channelGateway } from "./channelGateway";
import { stripSecrets } from "./webhookTriggerService";
import { auditLogger } from "./auditLogger";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { defaultJobExecutorRegistry } from "./jobExecutorRegistry";
import { sanitizePayload } from "./webhookDeliveryService";

// ── Constants ────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 4;

// ── Job interface ─────────────────────────────────────────────────────────

export interface WebhookDispatchJob {
  triggerId: string;
  userId: number;
  tenantId: string;
  targetType: "chat";
  targetConversationId?: number;
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
  idempotencyKey?: string;
}

// ── Module state ─────────────────────────────────────────────────────────

const FEATURE_186_WEBHOOK_JOB_TYPE = "webhook.dispatch";
const FEATURE_186_CONTRACT_VERSION = "feature-186-v1";

if (!defaultJobExecutorRegistry.has(FEATURE_186_WEBHOOK_JOB_TYPE, FEATURE_186_CONTRACT_VERSION)) {
  defaultJobExecutorRegistry.register({
    jobType: FEATURE_186_WEBHOOK_JOB_TYPE,
    executionClass: "short",
    contractVersions: new Set([FEATURE_186_CONTRACT_VERSION]),
    executor: async ({ context }) => {
      const job = context.input as unknown as WebhookDispatchJob;
      await processWebhookDispatch({ id: context.jobId, data: job, attemptsMade: 0 } as Job<WebhookDispatchJob>);
      return { output: { triggerId: job.triggerId } };
    },
  });
}

// ── Worker processor ─────────────────────────────────────────────────────

export async function processWebhookDispatch(job: Job<WebhookDispatchJob>): Promise<void> {
  const {
    triggerId, userId, tenantId, targetType,
    targetConversationId,
    message, payload, creditCost, startTime,
    requestBodyHash, requestMethod, requestBodySize,
    requestHeadersSafe, sourceIpMasked, parsedBody,
  } = job.data;

  const db = await getDb();
  let targetExecutionId: string | undefined;

  // ── Dispatch to configured target ─────────────────────────────────────

  if (targetType === "chat" && targetConversationId) {
    await channelGateway.processMessageServerSide({
      conversationId: targetConversationId,
      userId,
      tenantId,
      content: message,
      connectionId: `webhook_${triggerId}`,
    });

  } else {
    // No valid target configured — permanent failure, don't retry
    throw new UnrecoverableError(
      `No valid dispatch target: type=${targetType}, ` +
      `conversationId=${targetConversationId ?? "none"}`,
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
  console.log("[WebhookDispatchQueue] Legacy transport disabled; canonical worker_jobs is active");
}

// ── Enqueue ───────────────────────────────────────────────────────────────

export async function enqueueWebhookDispatch(job: WebhookDispatchJob): Promise<void> {
  const safeJob: WebhookDispatchJob = {
    ...job,
    payload: sanitizePayload(job.payload),
    parsedBody: stripSecrets(job.parsedBody),
    requestHeadersSafe: { ...job.requestHeadersSafe },
  };
  await createControlPlaneJob({
      context: {
        tenantId: job.tenantId,
        actorType: "system",
        authorizationScope: "system:webhook-dispatch",
        correlationId: `webhook:${job.triggerId}:${job.startTime}`,
        idempotencyKey: job.idempotencyKey ?? `webhook-dispatch:${job.triggerId}:${job.requestBodyHash}:${job.startTime}`,
      },
      definition: {
        contractVersion: FEATURE_186_CONTRACT_VERSION,
        jobType: FEATURE_186_WEBHOOK_JOB_TYPE,
        executionClass: "short",
        input: safeJob as unknown as Record<string, unknown>,
        retryPolicy: {
          maxAttempts: MAX_ATTEMPTS,
          baseDelayMs: 3_000,
          maxDelayMs: 60_000,
          jitter: "bounded",
          deadlineMs: 15 * 60_000,
          allowedErrorClasses: ["timeout", "connection_reset", "provider_5xx"],
        },
        timeoutPolicy: { softTimeoutMs: 10_000, hardTimeoutMs: 60_000 },
      },
  });
}

// ── Shutdown ──────────────────────────────────────────────────────────────

export async function closeWebhookDispatchQueue(): Promise<void> {
  console.log("[WebhookDispatchQueue] Shut down");
}
