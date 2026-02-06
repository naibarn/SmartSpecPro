/**
 * Chat Alert Scheduler Service
 *
 * Uses BullMQ + Redis to manage scheduled chat messages.
 * Supports both one-time and recurring (cron) schedules.
 */

import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { getDb } from "../db";
import {
  scheduledMessages,
  scheduledMessageLogs,
  userNotifications,
  conversations,
  messages,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { deductCredits, hasEnoughCredits, calculateCreditsForLLM } from "./creditService";
import { getProviderForModel } from "./llmRouter";

const QUEUE_NAME = "chat-alerts";

let connection: IORedis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;

function getRedisConnection(): IORedis {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

export function getSchedulerQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return queue;
}

// Note: getActiveLlmProvider removed — now uses getProviderForModel from llmRouter

/**
 * Execute a scheduled message job
 */
async function executeScheduledJob(job: Job) {
  const { scheduleId } = job.data;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Fetch schedule
  const [schedule] = await db
    .select()
    .from(scheduledMessages)
    .where(eq(scheduledMessages.id, scheduleId))
    .limit(1);

  if (!schedule || schedule.status !== "active") {
    console.log(`[Scheduler] Schedule ${scheduleId} not active, skipping`);
    return;
  }

  const userId = schedule.targetUserId || schedule.userId;
  const model = schedule.modelId || "gpt-4o-mini";
  const provider = await getProviderForModel(model);

  if (!provider) {
    await logExecution(db, scheduleId, null, "failed", "No LLM provider configured");
    return;
  }

  try {
    // Check credits
    const enough = await hasEnoughCredits(schedule.userId, 1);
    if (!enough) {
      await logExecution(db, scheduleId, null, "failed", "Insufficient credits");
      return;
    }

    // Call LLM (non-streaming)
    const base = (provider.baseUrl || "").replace(/\/+$/, "");
    const chatUrl = base.includes("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a helpful assistant. Answer the user's question concisely." },
          { role: "user", content: schedule.prompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`LLM error ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    const content = data?.choices?.[0]?.message?.content || "No response";
    const usage = data?.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const creditsUsed = calculateCreditsForLLM(promptTokens, completionTokens, model);

    // Deduct credits
    await deductCredits({
      userId: schedule.userId,
      amount: creditsUsed,
      description: `Chat Alert: ${schedule.description || schedule.prompt.slice(0, 50)}`,
      metadata: {
        type: "chat-alert",
        scheduleId,
        model,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
      },
    });

    // Find or create conversation
    let convId = schedule.conversationId;
    if (!convId) {
      const [newConv] = await db
        .insert(conversations)
        .values({
          userId,
          title: `Alert: ${schedule.description || schedule.prompt.slice(0, 40)}`,
          model,
        })
        .returning({ id: conversations.id });
      convId = newConv.id;

      // Update schedule with new conversation
      await db
        .update(scheduledMessages)
        .set({ conversationId: convId })
        .where(eq(scheduledMessages.id, scheduleId));
    }

    // Save user prompt message
    await db.insert(messages).values({
      conversationId: convId,
      role: "user",
      content: `[Scheduled] ${schedule.prompt}`,
      modelUsed: model,
    });

    // Save assistant response message
    await db.insert(messages).values({
      conversationId: convId,
      role: "assistant",
      content,
      modelUsed: model,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      creditsUsed: creditsUsed.toString(),
      skillUsed: "chat-alert",
    });

    // Create notification
    await db.insert(userNotifications).values({
      userId,
      type: "scheduled_message",
      title: schedule.description || `Scheduled Alert`,
      content: content.slice(0, 500),
      conversationId: convId,
      scheduledMessageId: scheduleId,
    });

    // Update schedule timestamps
    await db
      .update(scheduledMessages)
      .set({
        lastRunAt: new Date(),
        updatedAt: new Date(),
        ...(schedule.isRecurring ? {} : { status: "completed" as const }),
      })
      .where(eq(scheduledMessages.id, scheduleId));

    // Log execution
    await logExecution(db, scheduleId, content, "success", null, creditsUsed);

    // Send email notification if enabled
    if (schedule.emailNotify) {
      try {
        await sendAlertEmail(db, userId, schedule, content);
      } catch (emailErr) {
        console.error("[Scheduler] Email notification failed:", emailErr);
      }
    }

    console.log(`[Scheduler] Executed schedule ${scheduleId} successfully`);
  } catch (err: any) {
    await logExecution(db, scheduleId, null, "failed", err.message);
    throw err; // Let BullMQ handle retries
  }
}

async function logExecution(
  db: any,
  scheduleId: number,
  responseContent: string | null,
  status: string,
  error: string | null,
  creditsUsed?: number
) {
  await db.insert(scheduledMessageLogs).values({
    scheduledMessageId: scheduleId,
    responseContent,
    status,
    error,
    creditsUsed: (creditsUsed || 0).toString(),
  });
}

async function sendAlertEmail(db: any, userId: number, schedule: any, content: string) {
  // Import user for email
  const { users } = await import("../../drizzle/schema");
  const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email) return;

  // Use nodemailer if email settings configured
  const { systemSettings } = await import("../../drizzle/schema");
  const emailSettings = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, "email"));

  const smtpHost = emailSettings.find((s: any) => s.key === "smtpHost")?.value;
  if (!smtpHost) return; // No email configured

  const smtpPort = emailSettings.find((s: any) => s.key === "smtpPort")?.value || "587";
  const smtpUser = emailSettings.find((s: any) => s.key === "smtpUser")?.value;
  const smtpPass = emailSettings.find((s: any) => s.key === "smtpPass")?.value;
  const fromEmail = emailSettings.find((s: any) => s.key === "fromEmail")?.value || smtpUser;

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: parseInt(smtpPort) === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass ? decrypt(smtpPass) : undefined } : undefined,
    });

    await transporter.sendMail({
      from: fromEmail,
      to: user.email,
      subject: `🔔 Chat Alert: ${schedule.description || schedule.prompt.slice(0, 50)}`,
      html: `
        <h3>Chat Alert</h3>
        <p><strong>Prompt:</strong> ${schedule.prompt}</p>
        <hr />
        <div>${content.replace(/\n/g, "<br>")}</div>
        <hr />
        <p style="color: #666; font-size: 12px;">This is an automated alert from SmartSpec Chat.</p>
      `,
    });
  } catch {
    // Silently fail email
  }
}

/**
 * Create a BullMQ job for a scheduled message
 */
export async function createScheduledJob(scheduleId: number, cronExpression?: string | null, scheduledAt?: Date | null): Promise<string> {
  const q = getSchedulerQueue();

  if (cronExpression) {
    // Recurring job using job scheduler
    await q.upsertJobScheduler(
      `schedule-${scheduleId}`,
      { pattern: cronExpression },
      {
        name: `chat-alert-${scheduleId}`,
        data: { scheduleId },
      }
    );
    return `schedule-${scheduleId}`;
  } else if (scheduledAt) {
    // One-time delayed job
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    const job = await q.add(`chat-alert-${scheduleId}`, { scheduleId }, { delay });
    return job.id || `once-${scheduleId}`;
  }

  throw new Error("Either cronExpression or scheduledAt is required");
}

/**
 * Cancel a scheduled job
 */
export async function cancelScheduledJob(scheduleId: number, bullmqJobId?: string | null) {
  const q = getSchedulerQueue();

  try {
    // Remove repeatable/scheduler job
    await q.removeJobScheduler(`schedule-${scheduleId}`);
  } catch {
    // Ignore if not found
  }

  if (bullmqJobId) {
    try {
      const job = await q.getJob(bullmqJobId);
      if (job) await job.remove();
    } catch {
      // Ignore
    }
  }
}

/**
 * Initialize the scheduler worker (call on server startup)
 */
export function initializeScheduler() {
  if (worker) return;

  const conn = getRedisConnection();

  worker = new Worker(QUEUE_NAME, executeScheduledJob, {
    connection: conn,
    concurrency: 3,
  });

  worker.on("completed", (job) => {
    console.log(`[Scheduler] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Scheduler] Job ${job?.id} failed:`, err.message);
  });

  console.log("[Scheduler] Worker initialized");
}

/**
 * Gracefully shut down the scheduler
 */
export async function shutdownScheduler() {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    connection.disconnect();
    connection = null;
  }
}
