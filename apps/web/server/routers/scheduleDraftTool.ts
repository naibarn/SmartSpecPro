import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { eq, and, count } from "drizzle-orm";

import { ENV } from "../_core/env";
import { getDb } from "../db";
import { autoDraftSchedules } from "../../drizzle/schema";
import { encrypt } from "../services/crypto";
import { auditLogger } from "../services/auditLogger";
import type { AuditEventType } from "../services/auditLogger";
import { contentAutomationGate } from "../middleware/contentAutomationGate";
import { ScheduleDraftRequestSchema } from "@shared/contentAutomation/types";

const MAX_ACTIVE_SCHEDULES_PER_USER = 10;
const ALLOWED_PLACEHOLDERS = new Set(["date", "day_of_week"]);
const PRIVATE_IP_PATTERNS = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^localhost$/i,
];

function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function validateCronStrict(cron: string): { valid: boolean; error?: string } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { valid: false, error: "Cron must have exactly 5 fields (min hour dom mon dow)" };
  }

  const [min, hour] = parts;

  // Block every-minute pattern
  if (min === "*" && hour === "*") {
    return { valid: false, error: "Cron runs every minute. Minimum interval is 1 hour." };
  }

  // Block sub-hourly intervals: */N where N < 60 and hour is *
  if (min.startsWith("*/")) {
    const interval = parseInt(min.slice(2), 10);
    if (!isNaN(interval) && hour === "*") {
      // Any */N for minutes with * hour means sub-hourly
      return { valid: false, error: `Cron runs every ${interval} minutes. Minimum interval is 1 hour.` };
    }
  }

  // Validate field ranges
  const ranges = [
    { name: "minute", min: 0, max: 59 },
    { name: "hour", min: 0, max: 23 },
    { name: "day of month", min: 1, max: 31 },
    { name: "month", min: 1, max: 12 },
    { name: "day of week", min: 0, max: 7 },
  ];

  for (let i = 0; i < 5; i++) {
    const field = parts[i];
    if (field === "*") continue;
    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2), 10);
      if (isNaN(step) || step < 1) {
        return { valid: false, error: `Invalid step in ${ranges[i].name}: ${field}` };
      }
      continue;
    }
    const segments = field.split(",");
    for (const seg of segments) {
      const rangeParts = seg.split("-");
      for (const p of rangeParts) {
        const n = parseInt(p, 10);
        if (isNaN(n) || n < ranges[i].min || n > ranges[i].max) {
          return {
            valid: false,
            error: `Invalid value in ${ranges[i].name}: ${p} (must be ${ranges[i].min}-${ranges[i].max})`,
          };
        }
      }
    }
  }

  return { valid: true };
}

function validateTopicTemplate(template: string): { valid: boolean; error?: string } {
  const placeholders = [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const unsupported = placeholders.filter((p) => !ALLOWED_PLACEHOLDERS.has(p));
  if (unsupported.length > 0) {
    return {
      valid: false,
      error: `Unsupported placeholders: ${unsupported.join(", ")}. Allowed: {{date}}, {{day_of_week}}`,
    };
  }
  return { valid: true };
}

function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid webhook URL" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, error: "Webhook URL must use http or https scheme" };
  }

  const host = parsed.hostname;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(host)) {
      return { valid: false, error: "Webhook URL cannot point to private or local host" };
    }
  }

  return { valid: true };
}

/**
 * Compute the next run time for a schedule.
 * For one_time: returns run_at.
 * For recurring: returns the next occurrence after now based on cron_expression.
 */
export function computeNextRun(
  scheduleType: string,
  cronExpression: string | undefined,
  runAt: Date | undefined,
): Date | null {
  if (scheduleType === "one_time") {
    return runAt ?? null;
  }

  if (!cronExpression) return null;

  // Simple cron next-occurrence algorithm
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const now = new Date();
  const candidate = new Date(now.getTime() + 60_000); // start from next minute
  candidate.setSeconds(0, 0);

  const maxTime = now.getTime() + 366 * 24 * 60 * 60_000; // 1 year max

  while (candidate.getTime() <= maxTime) {
    if (matchesCronField(parts[1], candidate.getUTCHours()) &&
        matchesCronField(parts[2], candidate.getUTCDate()) &&
        matchesCronField(parts[3], candidate.getUTCMonth() + 1) &&
        matchesCronField(parts[4], candidate.getUTCDay()) &&
        matchesCronField(parts[0], candidate.getUTCMinutes())) {
      return new Date(candidate);
    }
    candidate.setTime(candidate.getTime() + 60_000);
  }

  return null;
}

function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true;
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }
  const segments = field.split(",");
  for (const seg of segments) {
    if (seg.includes("-")) {
      const [lo, hi] = seg.split("-").map(Number);
      if (value >= lo && value <= hi) return true;
    } else {
      if (parseInt(seg, 10) === value) return true;
    }
  }
  return false;
}

function emitAudit(eventType: string, metadata: Record<string, unknown>): void {
  auditLogger.log({ eventType: eventType as AuditEventType, userId: null, metadata });
}

export async function scheduleDraftHandler(req: Request, res: Response): Promise<void> {
  // 1. Authenticate
  if (!verifyInternalToken(req)) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // 2. Validate request body
  const parseResult = ScheduleDraftRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ success: false, error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }
  const input = parseResult.data;

  const bodyRecord = req.body as Record<string, unknown>;
  const userId = bodyRecord.userId as number | undefined;
  const tenantId = bodyRecord.tenantId as string | undefined;

  if (typeof userId !== "number" || !tenantId) {
    res.status(400).json({ success: false, error: "userId and tenantId are required" });
    return;
  }

  // 3. Cron expression validation
  if (input.schedule_type === "recurring" && input.cron_expression) {
    const cronCheck = validateCronStrict(input.cron_expression);
    if (!cronCheck.valid) {
      res.status(400).json({ success: false, error: { code: "invalid_cron", message: cronCheck.error } });
      return;
    }
  }

  // 4. Topic template placeholder validation
  const templateCheck = validateTopicTemplate(input.topic_template);
  if (!templateCheck.valid) {
    res.status(400).json({ success: false, error: { code: "invalid_template", message: templateCheck.error } });
    return;
  }

  // 5. Webhook URL SSRF validation
  if (input.notify_webhook_url) {
    const webhookCheck = validateWebhookUrl(input.notify_webhook_url);
    if (!webhookCheck.valid) {
      res.status(400).json({ success: false, error: { code: "invalid_webhook_url", message: webhookCheck.error } });
      return;
    }
  }

  // 6. Per-user schedule limit
  const db = await getDb();
  if (!db) {
    res.status(503).json({ success: false, error: "Database unavailable" });
    return;
  }

  const activeSchedules = await db
    .select({ id: autoDraftSchedules.id })
    .from(autoDraftSchedules)
    .where(
      and(
        eq(autoDraftSchedules.userId, userId),
        eq(autoDraftSchedules.status, "active"),
      ),
    );

  if (activeSchedules.length >= MAX_ACTIVE_SCHEDULES_PER_USER) {
    res.status(403).json({ success: false, error: "Maximum 10 active schedules per user" });
    return;
  }

  // 7. Generate webhook HMAC secret
  let webhookSecretEncrypted: string | undefined;
  if (input.notify_webhook_url) {
    const secret = crypto.randomBytes(32).toString("hex");
    webhookSecretEncrypted = encrypt(secret);
  }

  // 8. Compute next_run
  const nextRun = computeNextRun(
    input.schedule_type,
    input.cron_expression,
    input.run_at ? new Date(input.run_at) : undefined,
  );

  emitAudit("schedule_draft.created", { userId, tenantId, schedule_type: input.schedule_type });

  // 9. Insert record
  const inserted = await db
    .insert(autoDraftSchedules)
    .values({
      tenantId,
      userId,
      topicTemplate: input.topic_template,
      scheduleType: input.schedule_type,
      cronExpression: input.cron_expression ?? null,
      runAt: input.run_at ? new Date(input.run_at) : null,
      timezone: input.timezone ?? "UTC",
      draftParams: (input.draft_params ?? {}) as Record<string, unknown>,
      notifyWebhookUrl: input.notify_webhook_url ?? null,
      webhookSecretEncrypted: webhookSecretEncrypted ?? null,
      status: "active",
      nextRun: nextRun ?? undefined,
    })
    .returning();

  const record = inserted[0];

  res.json({
    success: true,
    schedule_id: record.id,
    next_run: record.nextRun?.toISOString() ?? nextRun?.toISOString() ?? null,
    status: record.status,
  });
}

export function registerScheduleDraftToolRoute(app: Express): void {
  app.post("/api/internal/tools/schedule-draft", contentAutomationGate, scheduleDraftHandler);
}
