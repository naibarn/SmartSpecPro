/**
 * Google Drive Edit Session Cleanup Job
 *
 * Marks expired edit sessions as "discarded" to prevent stale locks.
 * Runs every 6 hours via setInterval (interim; Cloud Scheduler in Section 06).
 *
 * Sessions that have been expired for 7+ days are cleaned up.
 * Uses "discarded" status (existing enum value) to avoid DB migration.
 */

import { and, eq, lt } from "drizzle-orm";

import { getDb } from "../db";
import { googleDriveEditSessions } from "../../drizzle/schema";

const EXPIRED_BUFFER_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

async function runCleanup(): Promise<void> {
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
  if (intervalId) return;

  // Run immediately on startup, then every 6 hours
  runCleanup().catch((err) => {
    console.error("[GDrive Cleanup] Initial cleanup failed:", err.message);
  });

  intervalId = setInterval(() => {
    runCleanup().catch((err) => {
      console.error("[GDrive Cleanup] Cleanup failed:", err.message);
    });
  }, SIX_HOURS_MS);

  console.log("[GDrive Cleanup] Session cleanup job initialized (every 6h)");
}

export async function shutdownGDriveCleanupWorker(): Promise<void> {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
