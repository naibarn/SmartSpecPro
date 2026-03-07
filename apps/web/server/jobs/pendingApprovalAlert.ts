/**
 * Pending Approval Daily Alert Job
 *
 * Sends a daily notification to all admin users when there are
 * items (Skills, Agencies, Workflow Templates) awaiting approval.
 * Runs at 9 AM server time via setInterval.
 */

import { eq, count } from "drizzle-orm";
import { getDb } from "../db";
import { skills, agencies, workflowTemplates, users } from "../../drizzle/schema";

const MS_PER_DAY = 86_400_000;

let intervalId: NodeJS.Timeout | null = null;
let initialTimeoutId: NodeJS.Timeout | null = null;

async function executePendingApprovalAlert(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [skillRow] = await db.select({ cnt: count() }).from(skills).where(eq(skills.visibility, "pending_approval"));
  const [agencyRow] = await db.select({ cnt: count() }).from(agencies).where(eq(agencies.visibility, "pending_approval"));
  const [templateRow] = await db.select({ cnt: count() }).from(workflowTemplates).where(eq(workflowTemplates.status, "pending_review"));

  const s = Number(skillRow?.cnt ?? 0);
  const a = Number(agencyRow?.cnt ?? 0);
  const t = Number(templateRow?.cnt ?? 0);
  const total = s + a + t;

  if (total === 0) {
    console.log("[approval-alert] No pending items, skipping notification");
    return;
  }

  // Build readable content
  const parts: string[] = [];
  if (s > 0) parts.push(`${s} skill${s !== 1 ? "s" : ""}`);
  if (a > 0) parts.push(`${a} agenc${a !== 1 ? "ies" : "y"}`);
  if (t > 0) parts.push(`${t} workflow template${t !== 1 ? "s" : ""}`);

  const content = `There are ${total} items awaiting your review: ${parts.join(", ")}. Visit Admin > Approvals to review.`;

  // Find all admin users
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));

  if (admins.length === 0) {
    console.log("[approval-alert] No admin users found, skipping");
    return;
  }

  const { createNotification } = await import("../services/notificationService");

  let sent = 0;
  for (const admin of admins) {
    try {
      await createNotification({
        db,
        userId: admin.id,
        type: "alert",
        title: "Pending Approvals Reminder",
        content,
        priority: "normal",
      });
      sent++;
    } catch (err) {
      console.error(`[approval-alert] Failed to notify admin ${admin.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[approval-alert] Sent ${sent}/${admins.length} notifications (${total} pending items)`);
}

/**
 * Schedule the daily pending approval alert at 9 AM.
 */
export async function initializePendingApprovalAlertJob(): Promise<void> {
  if (intervalId) return;

  const now = new Date();
  const next9AM = new Date(now);
  next9AM.setHours(9, 0, 0, 0);
  if (next9AM <= now) {
    next9AM.setDate(next9AM.getDate() + 1);
  }
  const initialDelay = next9AM.getTime() - now.getTime();

  initialTimeoutId = setTimeout(() => {
    initialTimeoutId = null;
    runAlert();
    intervalId = setInterval(runAlert, MS_PER_DAY);
  }, initialDelay);

  console.log(`[approval-alert] Daily approval alert scheduled (next run in ${Math.round(initialDelay / 60000)}min)`);
}

async function runAlert(): Promise<void> {
  try {
    await executePendingApprovalAlert();
  } catch (error) {
    console.error("[approval-alert] Job failed:", error instanceof Error ? error.message : error);
  }
}

export async function shutdownPendingApprovalAlert(): Promise<void> {
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId);
    initialTimeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
