/**
 * Chat Alert Scheduler Service
 *
 * Manages scheduled chat message delivery via Cloud Tasks (replacing BullMQ).
 * Supports both one-time delayed and recurring (cron) schedules.
 *
 * One-time messages: enqueued as delayed Cloud Tasks tasks.
 * Recurring messages: managed by Cloud Scheduler (Section 06) calling
 *   /tasks/deliver-scheduled-message on each cron tick.
 * Fallback sweep: /tasks/deliver-scheduled-fallback runs every minute
 *   to catch any enqueue failures.
 */

import { enqueueTask, deleteTask } from "./cloudTasks";
import { getDb } from "../db";
import {
  scheduledMessages,
  scheduledMessageLogs,
  conversations,
  messages,
} from "../../drizzle/schema";
import { eq, and, lte, isNull, sql } from "drizzle-orm";
import { deductCredits, hasEnoughCredits, calculateCreditsForLLM } from "./creditService";
import { resolveEnabledLlmModelId } from "./enabledLlmModels";
import { getProviderForModel } from "./llmRouter";
import { decrypt } from "./crypto";
import { signBearerToken } from "../_core/tokens";
import crypto from "crypto";

const USE_CLOUD_TASKS = () => process.env.USE_CLOUD_TASKS === "true";

/**
 * Deliver a scheduled message by schedule ID.
 *
 * Extracted from the old BullMQ executeScheduledJob — same business logic,
 * no BullMQ Job dependency. Called by the Cloud Tasks handler endpoint.
 */
export async function deliverScheduledMessage(scheduleId: number): Promise<void> {
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

  // ── Simple Reminder: skip LLM, 0 credits, just fire notification ──
  if (schedule.isSimpleReminder) {
    try {
      const content = schedule.prompt;

      const { createNotification } = await import("./notificationService");
      await createNotification({
        db,
        userId,
        type: "scheduled_message",
        title: schedule.description || "Reminder",
        content: content.slice(0, 500),
        scheduledMessageId: scheduleId,
        priority: schedule.priority || "normal",
      });

      await db
        .update(scheduledMessages)
        .set({
          lastRunAt: new Date(),
          updatedAt: new Date(),
          ...(schedule.isRecurring ? {} : { status: "completed" as const }),
        })
        .where(eq(scheduledMessages.id, scheduleId));

      await logExecution(db, scheduleId, content, "success", null, 0);

      if (schedule.emailNotify) {
        try {
          await sendAlertEmail(db, userId, schedule, content);
        } catch (emailErr) {
          console.error("[Scheduler] Email notification failed:", emailErr);
        }
      }

      console.log(`[Scheduler] Simple reminder ${scheduleId} fired (0 credits)`);
      return;
    } catch (err: any) {
      await logExecution(db, scheduleId, null, "failed", err.message);
      throw err;
    }
  }

  // ── Custom Skill Execution ──
  if (schedule.skillId && schedule.skillId !== "chat-alert") {
    try {
      const { skills } = await import("../../drizzle/schema");
      const { executeSkill } = await import("./skillExecutor");

      const [skillDef] = await db
        .select()
        .from(skills)
        .where(eq(skills.slug, schedule.skillId))
        .limit(1);

      if (!skillDef) {
        await logExecution(db, scheduleId, null, "failed", `Skill ${schedule.skillId} not found`);
        return;
      }

      // Check credits
      const enough = await hasEnoughCredits(schedule.userId, 10);
      if (!enough) {
        await logExecution(db, scheduleId, null, "failed", "Insufficient credits for skill execution");
        return;
      }

      // Generate a temporary execution token
      const userToken = signBearerToken({
        sub: String(userId),
        type: "access",
        scopes: ["skill:execute"],
        jti: `skill_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
      }, "15m");

      const result = await executeSkill(
        skillDef as any,
        {
          prompt: schedule.prompt || "",
          extraParams: (schedule as any).dynamicParams || {},
          publicUrl: process.env.PUBLIC_URL || "http://localhost:3000",
        },
        userId,
        userToken,
        typeof (schedule as any).tenantId === "string" ? (schedule as any).tenantId : undefined,
      );

      if (!result.success) {
        await logExecution(db, scheduleId, null, "failed", result.error || "Skill execution failed", result.creditsUsed);

        // Optionally update status
        await db
          .update(scheduledMessages)
          .set({
            lastRunAt: new Date(),
            updatedAt: new Date(),
            ...(schedule.isRecurring ? {} : { status: "failed" as const }),
          })
          .where(eq(scheduledMessages.id, scheduleId));

        return;
      }

      const content = result.message || "Skill executed successfully";
      const creditsUsed = result.creditsUsed || 0;
      const resolvedScheduleModel = await resolveEnabledLlmModelId([schedule.modelId]);

      // Find or create conversation
      let convId = schedule.conversationId;
      if (!convId) {
        const [newConv] = await db
          .insert(conversations)
          .values({
            userId,
            title: `Alert: ${schedule.description || schedule.prompt.slice(0, 40)}`,
            model: resolvedScheduleModel || null,
          })
          .returning({ id: conversations.id });
        convId = newConv.id;

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
        modelUsed: resolvedScheduleModel || undefined,
      });

      // Save assistant response message
      await db.insert(messages).values({
        conversationId: convId,
        role: "assistant",
        content,
        modelUsed: resolvedScheduleModel || undefined,
        inputTokens: 0,
        outputTokens: 0,
        creditsUsed: creditsUsed.toString(),
        skillUsed: schedule.skillId,
        skillArgs: (schedule as any).dynamicParams || {},
        artifacts: result.data ? [result.data as any] : [],
      });

      // Create notification
      const { createNotification } = await import("./notificationService");
      await createNotification({
        db,
        userId,
        type: "scheduled_message",
        title: schedule.description || `Skill Update: ${skillDef.name}`,
        content: content.slice(0, 500),
        conversationId: convId,
        scheduledMessageId: scheduleId,
        priority: schedule.priority || "normal",
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

      await logExecution(db, scheduleId, content, "success", null, creditsUsed);

      if (schedule.emailNotify) {
        try {
          await sendAlertEmail(db, userId, schedule, content);
        } catch (emailErr) {
          console.error("[Scheduler] Email notification failed:", emailErr);
        }
      }

      console.log(`[Scheduler] Executed skill ${schedule.skillId} successfully (schedule ${scheduleId})`);
      return;
    } catch (err: any) {
      await logExecution(db, scheduleId, null, "failed", err.message);
      throw err;
    }
  }

  // ── LLM-powered alert: standard flow ──
  const model = await resolveEnabledLlmModelId([schedule.modelId]);
  if (!model) {
    await logExecution(db, scheduleId, null, "failed", "No enabled LLM model configured");
    return;
  }
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
      sourceType: "scheduler",
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
    const { createNotification } = await import("./notificationService");
    await createNotification({
      db,
      userId,
      type: "scheduled_message",
      title: schedule.description || `Scheduled Alert`,
      content: content.slice(0, 500),
      conversationId: convId,
      scheduledMessageId: scheduleId,
      priority: schedule.priority || "normal",
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
    throw err;
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

/**
 * Sanitize text for use in email headers (subject line)
 * Removes newlines, control characters, and limits length to prevent header injection
 */
function sanitizeEmailHeader(text: string): string {
  return text.replace(/[\r\n\x00-\x1F\x7F]/g, ' ').trim().slice(0, 78);
}

/**
 * Escape HTML entities to prevent XSS in email body
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
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

    const safeDescription = sanitizeEmailHeader(schedule.description || schedule.prompt.slice(0, 50));

    await transporter.sendMail({
      from: fromEmail,
      to: user.email,
      subject: `🔔 Chat Alert: ${safeDescription}`,
      html: `
        <h3>Chat Alert</h3>
        <p><strong>Prompt:</strong> ${escapeHtml(schedule.prompt)}</p>
        <hr />
        <div>${escapeHtml(content).replace(/\n/g, "<br>")}</div>
        <hr />
        <p style="color: #666; font-size: 12px;">This is an automated alert from SmartAIHub Chat.</p>
      `,
    });
  } catch {
    // Silently fail email
  }
}

/**
 * Create a scheduled job via Cloud Tasks (or locally in dev mode).
 *
 * For one-time messages: enqueues a delayed Cloud Tasks task.
 * For recurring messages with cron: handled by Cloud Scheduler (Section 06).
 *   As an interim measure, stores the cron expression on the DB record
 *   and the fallback sweep handles delivery.
 */
export async function createScheduledJob(
  scheduleId: number,
  cronExpression?: string | null,
  scheduledAt?: Date | null
): Promise<string> {
  if (!USE_CLOUD_TASKS()) {
    // Development mode: store a local identifier, delivery via fallback sweep
    console.log(`[Scheduler] Dev mode: scheduled job local-${scheduleId}`);
    return `local-${scheduleId}`;
  }

  if (cronExpression) {
    // Recurring: Cloud Scheduler (Section 06) will handle this.
    // For now, store a marker and let the fallback sweep handle delivery.
    console.log(`[Scheduler] Recurring schedule ${scheduleId} registered (cron: ${cronExpression})`);
    return `cron-${scheduleId}`;
  } else if (scheduledAt) {
    // One-time delayed task
    const delaySeconds = Math.max(0, Math.floor((scheduledAt.getTime() - Date.now()) / 1000));

    const taskName = await enqueueTask({
      queueName: "periodic-tasks",
      handlerPath: "/_internal/tasks/deliver-scheduled-message",
      payload: { scheduleId },
      delaySeconds,
      taskId: `schedule-${scheduleId}`,
      targetService: "node",
    });

    return taskName;
  }

  throw new Error("Either cronExpression or scheduledAt is required");
}

/**
 * Cancel a scheduled job by deleting the Cloud Tasks task.
 */
export async function cancelScheduledJob(
  scheduleId: number,
  cloudTaskId?: string | null
): Promise<void> {
  if (!USE_CLOUD_TASKS()) {
    console.log(`[Scheduler] Dev mode: cancelled schedule ${scheduleId}`);
    return;
  }

  if (cloudTaskId && cloudTaskId.startsWith("projects/")) {
    // Full Cloud Tasks resource name — delete it
    await deleteTask(cloudTaskId);
  }
  // For cron/local markers, nothing to delete in Cloud Tasks
}

/**
 * Fallback sweep: find undelivered scheduled messages and enqueue them.
 * Called by Cloud Scheduler every minute via /tasks/deliver-scheduled-fallback.
 */
export async function sweepUndeliveredMessages(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const now = new Date();
  const undelivered = await db
    .select({ id: scheduledMessages.id })
    .from(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.status, "active"),
        lte(scheduledMessages.scheduledAt, now),
        isNull(scheduledMessages.lastRunAt)
      )
    );

  let enqueued = 0;
  for (const msg of undelivered) {
    try {
      if (USE_CLOUD_TASKS()) {
        await enqueueTask({
          queueName: "periodic-tasks",
          handlerPath: "/_internal/tasks/deliver-scheduled-message",
          payload: { scheduleId: msg.id },
          taskId: `sweep-${msg.id}-${Date.now()}`,
          targetService: "node",
        });
      } else {
        // Dev mode: deliver directly
        await deliverScheduledMessage(msg.id);
      }
      enqueued++;
    } catch (err) {
      console.error(`[Scheduler] Failed to sweep message ${msg.id}:`, err);
    }
  }

  if (enqueued > 0) {
    console.log(`[Scheduler] Sweep enqueued ${enqueued} undelivered messages`);
  }

  return enqueued;
}
