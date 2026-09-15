/**
 * Google Drive Edit Session Cleanup Job
 *
 * Marks expired edit sessions as "discarded" to prevent stale locks.
 * Runs through the canonical Feature 186 system schedule in hard cutover;
 * compatibility mode retains the legacy six-hour interval for drain only.
 * Production scheduling is owned by the Cloudflare Cron/Worker deployment.
 *
 * Sessions that have been expired for 7+ days are cleaned up.
 * Uses "discarded" status (existing enum value) to avoid DB migration.
 */

import { and, eq, lt } from "drizzle-orm";

import { getDb } from "../db";
import { googleDriveEditSessions } from "../../drizzle/schema";
import { startFeature186SystemSchedule, stopFeature186SystemSchedule, utcMinuteOccurrence } from "./feature186SystemScheduler";

const EXPIRED_BUFFER_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

export async function runGDriveSessionCleanup(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[GDrive Cleanup] DB not available, skipping");
    return;
  }

  const cutoff = new Date(Date.now() - EXPIRED_BUFFER_DAYS * MS_PER_DAY);

  const expired = await db
    .update(googleDriveEditSessions)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(
      and(
        eq(googleDriveEditSessions.status, "active"),
        lt(googleDriveEditSessions.expiresAt, cutoff),
      ),
    )
    .returning({ id: googleDriveEditSessions.id });

  if (expired.length > 0) {
    console.log(
      `[GDrive Cleanup] Marked ${expired.length} expired sessions as discarded`,
    );
  }
}

export async function initializeGDriveCleanupJob(): Promise<void> {
  if (process.env.FEATURE_186_HARD_CUTOVER === "true") {
    startFeature186SystemSchedule({
      scheduleId: "gdrive-edit-session-cleanup",
      jobType: "gdrive.edit_session_cleanup",
      executionClass: "short",
      scheduleVersion: "1",
      timezone: "UTC",
      missedOccurrencePolicy: "coalesce",
      isDue: now => now.getUTCHours() % 6 === 0 && now.getUTCMinutes() === 0,
      occurrenceKey: now => utcMinuteOccurrence(now, 360),
      intervalMs: 60_000,
    });
    console.info("[GDrive Cleanup] Cloudflare canonical schedule active");
    return;
  }
  if (intervalId) return;

  // Run immediately on startup, then every 6 hours
  runGDriveSessionCleanup().catch((err) => {
    console.error("[GDrive Cleanup] Initial cleanup failed:", err.message);
  });

  intervalId = setInterval(() => {
    runGDriveSessionCleanup().catch((err) => {
      console.error("[GDrive Cleanup] Cleanup failed:", err.message);
    });
  }, SIX_HOURS_MS);

  console.log("[GDrive Cleanup] Session cleanup job initialized (every 6h)");
}

export async function shutdownGDriveCleanupWorker(): Promise<void> {
  stopFeature186SystemSchedule("gdrive-edit-session-cleanup");
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
