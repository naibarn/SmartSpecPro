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
  autoDraftSchedules,
} from "../../drizzle/schema";
import { eq, and, lte, isNull, sql } from "drizzle-orm";
import { deductCredits, hasEnoughCredits, calculateCreditsForLLM } from "./creditService";
import { resolveEnabledLlmModelId } from "./enabledLlmModels";
import { getProviderForModel } from "./llmRouter";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
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

  // Check skip flag (set by skipNextRun endpoint)
  const skipUntil = (schedule.dynamicParams as Record<string, unknown> | null)?._skipUntil;
  if (typeof skipUntil === "string") {
    const skipDate = new Date(skipUntil);
    if (!isNaN(skipDate.getTime()) && new Date() < skipDate) {
      console.log(`[Scheduler] Schedule ${scheduleId} skipped (skipUntil: ${skipUntil})`);
      // Clear the skip flag after honoring it
      const cleaned = { ...(schedule.dynamicParams || {}) };
      delete (cleaned as Record<string, unknown>)._skipUntil;
      await db.update(scheduledMessages)
        .set({ dynamicParams: Object.keys(cleaned).length > 0 ? cleaned : undefined, updatedAt: new Date() })
        .where(eq(scheduledMessages.id, scheduleId));
      // Log the skip
      await db.insert(scheduledMessageLogs).values({
        scheduledMessageId: scheduleId,
        status: "skipped",
        responseContent: "Run skipped by user request",
        creditsUsed: "0",
      });
      return;
    }
    // Skip time has passed — clear the flag
    const cleaned = { ...(schedule.dynamicParams || {}) };
    delete (cleaned as Record<string, unknown>)._skipUntil;
    await db.update(scheduledMessages)
      .set({ dynamicParams: Object.keys(cleaned).length > 0 ? cleaned : undefined })
      .where(eq(scheduledMessages.id, scheduleId));
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

  // ── Auto Draft Presentation: headless generation + notification ──
  if (schedule.skillId === "auto-draft-presentation") {
    try {
      const params = (schedule as any).dynamicParams as {
        topic?: string;
        numSlides?: number;
      } | null;
      const topic = params?.topic || schedule.prompt || "Untitled Presentation";
      const numSlides = params?.numSlides ?? 5;

      // Generate a temporary token for this user
      const userToken = signBearerToken({
        sub: String(userId),
        type: "access",
        scopes: ["media:generate"],
        jti: `auto_draft_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
      }, "15m");

      // Lazy-import to avoid circular dependencies
      const { resolveAutoDraftParams } = await import("./autoDraftResolver");
      const { generateAIDraft } = await import("./aiPresentationService");
      const { createLibraryItem } = await import("./libraryService");
      const { createPresentationDeckForLibraryItem } = await import("./presentationService");

      const traceId = crypto.randomUUID();

      // 1. Resolve all params from topic
      const resolution = await resolveAutoDraftParams(topic, {
        userId,
        traceId,
      });

      // 2. Create library item + deck
      const actor = {
        userId,
        tenantId: typeof (schedule as any).tenantId === "string" ? (schedule as any).tenantId : "default",
        role: "user" as const,
      };
      const libraryItemResult = await createLibraryItem(
        { itemType: "presentation", source: "scheduled_auto_draft", title: topic.slice(0, 200) },
        actor,
      );
      const deckResult = await createPresentationDeckForLibraryItem(
        { libraryItemId: libraryItemResult.item.id, title: topic.slice(0, 200) },
        actor,
      );
      const deckId = deckResult.deck.id;

      // 3. Run the pipeline (awaited, not fire-and-forget — we want to know the result)
      const draftInput = {
        deckId,
        expectedVersion: 0,
        prompt: topic,
        numSlides,
        language: resolution.language,
        textModel: resolution.textModel,
        draftSkillId: resolution.draftSkillId,
        articleSkillId: resolution.draftSkillId,
        imageSkillId: resolution.imageSkillId,
        imageModel: resolution.imageModel,
        canvasWidth: 1280,
        canvasHeight: 720,
        stylePresetId: resolution.stylePresetId,
        useCustomArticle: false,
        hideTextOnSlides: false,
        generateAudio: false,
      };

      let generationError: string | null = null;
      try {
        await generateAIDraft(draftInput as any, actor, userToken, traceId);
      } catch (genErr: any) {
        generationError = genErr instanceof Error ? genErr.message : "Unknown error";
        generationError = generationError!.replace(/https?:\/\/[^\s]+/g, "[redacted]").slice(0, 200);
      }

      // 4. Build notification content
      const editorUrl = `/presentation/${libraryItemResult.item.id}`;
      const content = generationError
        ? `Scheduled presentation failed\n\nTopic: ${topic}\nError: ${generationError}\n\nEditor: ${editorUrl}`
        : `Scheduled presentation is ready!\n\nTopic: ${topic}\nSlides: ${numSlides}\n\nEditor: ${editorUrl}`;

      // 5. Create notification
      const { createNotification } = await import("./notificationService");
      await createNotification({
        db,
        userId,
        type: "scheduled_message",
        title: generationError
          ? `Presentation failed: ${topic.slice(0, 50)}`
          : `Presentation ready: ${topic.slice(0, 50)}`,
        content: content.slice(0, 500),
        scheduledMessageId: scheduleId,
        priority: generationError ? "high" : "normal",
      });

      // 6. Write to conversation (find or create)
      let convId = schedule.conversationId;
      if (!convId) {
        const [newConv] = await db
          .insert(conversations)
          .values({
            userId,
            title: `Auto Draft: ${topic.slice(0, 80)}`,
            model: null,
          })
          .returning({ id: conversations.id });
        convId = newConv.id;

        await db
          .update(scheduledMessages)
          .set({ conversationId: convId })
          .where(eq(scheduledMessages.id, scheduleId));
      }

      await db.insert(messages).values({
        conversationId: convId,
        role: "assistant",
        content,
        skillUsed: "auto-draft-presentation",
      });

      // 7. Update schedule timestamps
      await db
        .update(scheduledMessages)
        .set({
          lastRunAt: new Date(),
          updatedAt: new Date(),
          ...(schedule.isRecurring ? {} : { status: (generationError ? "failed" : "completed") as any }),
        })
        .where(eq(scheduledMessages.id, scheduleId));

      await logExecution(db, scheduleId, content, generationError ? "failed" : "success", generationError, 0);

      if (schedule.emailNotify) {
        try {
          await sendAlertEmail(db, userId, schedule, content);
        } catch (emailErr) {
          console.error("[Scheduler] Auto-draft email notification failed:", emailErr);
        }
      }

      console.log(`[Scheduler] Auto-draft presentation ${scheduleId} ${generationError ? "failed" : "completed"} (topic: ${topic.slice(0, 40)})`);
      return;
    } catch (err: any) {
      await logExecution(db, scheduleId, null, "failed", err.message);
      throw err;
    }
  }

  // ── LLM-powered alert: standard flow ──
  const scheduleTenantId = typeof (schedule as any).tenantId === "string"
    ? (schedule as any).tenantId
    : "default";

  // Run planner (returns null if disabled — zero overhead)
  const plannerResult = await runPlanner({
    sourceType: "scheduled",
    userId: schedule.userId,
    tenantId: scheduleTenantId,
    conversationModel: schedule.modelId,
  });

  let model: string | null;
  if (plannerResult?.resolvedModel) {
    model = plannerResult.resolvedModel;
  } else {
    model = await resolveEnabledLlmModelId([schedule.modelId]);
  }
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

    // Record step attempt for planner telemetry
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model,
        provider: provider.providerName,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        snapshot: plannerResult.snapshot,
        creditsUsed,
      }).catch(() => {}); // fire-and-forget
    }

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

/**
 * Sweep due auto-draft schedules and dispatch execution for each.
 * Called from the same polling loop as sweepUndeliveredMessages.
 */
export async function sweepDueAutoDraftSchedules(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const now = new Date();
  const dueSchedules = await db
    .select()
    .from(autoDraftSchedules)
    .where(
      and(
        eq(autoDraftSchedules.status, "active"),
        lte(autoDraftSchedules.nextRun, now),
      ),
    );

  let dispatched = 0;
  for (const schedule of dueSchedules) {
    try {
      // Substitute placeholders in topic template
      const dateStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayOfWeek = dayNames[now.getUTCDay()];
      const topic = schedule.topicTemplate
        .replace(/\{\{date\}\}/g, dateStr)
        .replace(/\{\{day_of_week\}\}/g, dayOfWeek);

      // Override source attribution
      const draftParams = {
        ...(schedule.draftParams as Record<string, unknown>),
        source: `schedule:${schedule.id}`,
        topic,
      };

      if (USE_CLOUD_TASKS()) {
        await enqueueTask({
          queueName: "periodic-tasks",
          handlerPath: "/_internal/tasks/dispatch-auto-draft",
          payload: { scheduleId: schedule.id, draftParams },
          taskId: `auto-draft-schedule-${schedule.id}-${Date.now()}`,
          targetService: "node",
        });
      } else {
        // Dev mode: fire via HTTP to auto-draft tool (best-effort)
        console.log(`[Scheduler] Auto-draft schedule ${schedule.id} due — dispatching topic: ${topic}`);
      }

      // Update schedule state
      if (schedule.scheduleType === "one_time") {
        await db
          .update(autoDraftSchedules)
          .set({ status: "completed", lastRun: now, updatedAt: now })
          .where(eq(autoDraftSchedules.id, schedule.id));
      } else {
        // Compute next run for recurring schedule
        const { computeNextRun } = await import("../routers/scheduleDraftTool");
        const nextRun = computeNextRun("recurring", schedule.cronExpression ?? undefined, undefined);
        await db
          .update(autoDraftSchedules)
          .set({ lastRun: now, nextRun: nextRun ?? undefined, updatedAt: now })
          .where(eq(autoDraftSchedules.id, schedule.id));
      }

      dispatched++;
    } catch (err) {
      console.error(`[Scheduler] Failed to dispatch auto-draft schedule ${schedule.id}:`, err);
    }
  }

  if (dispatched > 0) {
    console.log(`[Scheduler] Dispatched ${dispatched} auto-draft schedules`);
  }

  return dispatched;
}
