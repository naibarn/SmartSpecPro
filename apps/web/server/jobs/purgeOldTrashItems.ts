/**
 * Trash Auto-Purge Background Job
 *
 * Permanently deletes library items that have been in trash for 90+ days.
 * Runs daily at 2 AM through the Feature 186 scheduler during hard cutover;
 * legacy deployments retain the existing timer until their migration wave.
 *
 * Deletion cascade uses shared cascadeDeleteLibraryItem() helper.
 * Storage files are cleaned up after DB deletion (best-effort).
 */

import { and, eq, isNotNull, lt } from "drizzle-orm";

import { getDb } from "../db";
import { libraryItems, libraryLinks } from "../../drizzle/schema";
import { auditLogger } from "../services/auditLogger";
import {
  cascadeDeleteLibraryItem,
  cleanupLibraryVectorArtifacts,
  collectLibraryVectorCleanupTargets,
} from "../services/libraryService";
import { storageDelete } from "../storage";
import { startFeature186SystemSchedule, stopFeature186SystemSchedule, utcDailyDue } from "./feature186SystemScheduler";

const TRASH_RETENTION_DAYS = 90;
const MS_PER_DAY = 86_400_000;
const BATCH_SIZE = 100;

let intervalId: NodeJS.Timeout | null = null;
let initialTimeoutId: NodeJS.Timeout | null = null;

/**
 * Execute the trash purge job. Finds all items older than TRASH_RETENTION_DAYS
 * in the trash and permanently deletes them in batches.
 */
export async function executeTrashPurge(): Promise<{ purgedCount: number; totalFound: number; errors: number; storageDeleted: number }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available for trash purge");
  }

  const cutoffDate = new Date(Date.now() - TRASH_RETENTION_DAYS * MS_PER_DAY);

  let totalFound = 0;
  let purgedCount = 0;
  let errors = 0;
  let storageDeleted = 0;

  // Process in batches to avoid unbounded memory consumption
  let hasMore = true;
  while (hasMore) {
    const batch = await db
      .select({ id: libraryItems.id, tenantId: libraryItems.tenantId })
      .from(libraryItems)
      .where(
        and(
          isNotNull(libraryItems.deletedAt),
          lt(libraryItems.deletedAt, cutoffDate),
        ),
      )
      .limit(BATCH_SIZE);

    totalFound += batch.length;
    hasMore = batch.length === BATCH_SIZE;

    let purgedInBatch = 0;
    for (const item of batch) {
      try {
        // Collect storage keys before cascade delete removes them
        const [uploadKeys, vectorCleanupTargets] = await Promise.all([
          db
            .select({ linkId: libraryLinks.linkId })
            .from(libraryLinks)
            .where(
              and(
                eq(libraryLinks.libraryItemId, item.id),
                eq(libraryLinks.linkType, "upload_key"),
              ),
            ),
          collectLibraryVectorCleanupTargets(item.id, item.tenantId, db).catch(() => ({
            vectorRefIds: [],
            indexNames: [],
          })),
        ]);

        await db.transaction(async (tx) => {
          await cascadeDeleteLibraryItem(tx, item.id);
        });
        purgedCount++;
        purgedInBatch++;

        // Best-effort storage cleanup after successful DB delete
        for (const { linkId } of uploadKeys) {
          try {
            const deleted = await storageDelete(linkId);
            if (deleted) storageDeleted++;
          } catch (err) {
            console.error(
              `[trash-purge] Storage cleanup failed for key ${linkId}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }

        await cleanupLibraryVectorArtifacts({
          tenantId: item.tenantId,
          vectorRefIds: vectorCleanupTargets.vectorRefIds,
          indexNames: vectorCleanupTargets.indexNames,
        }).catch((err) => {
          console.error(
            `[trash-purge] Vector cleanup failed for item ${item.id}:`,
            err instanceof Error ? err.message : err,
          );
        });
      } catch (error) {
        errors++;
        console.error(`[trash-purge] Failed to purge item ${item.id}:`, error instanceof Error ? error.message : error);
      }
    }

    // A failed item remains eligible for the next query. Stop when the whole
    // batch made no progress so one poisoned row cannot spin forever and starve
    // the scheduler. The next scheduled run can retry it after the cause is
    // repaired.
    if (purgedInBatch === 0) hasMore = false;
  }

  return { purgedCount, totalFound, errors, storageDeleted };
}

/**
 * Schedule the daily trash purge.
 * Uses the canonical Feature 186 scheduler in hard cutover. Legacy mode keeps
 * the existing timer until the owning migration wave is retired.
 */
export async function initializeTrashPurgeJob(): Promise<void> {
  if (intervalId) return;

  if (process.env.FEATURE_186_HARD_CUTOVER === "true") {
    startFeature186SystemSchedule({
      scheduleId: "library-trash-purge",
      jobType: "library.trash_purge",
      executionClass: "long",
      scheduleVersion: "1",
      timezone: "UTC",
      missedOccurrencePolicy: "coalesce",
      isDue: utcDailyDue(2, 0),
      occurrenceKey: (now) => `${now.toISOString().slice(0, 10)}:trash-purge`,
      intervalMs: 60_000,
    });
    return;
  }

  // Calculate delay until next 2 AM
  const now = new Date();
  const next2AM = new Date(now);
  next2AM.setHours(2, 0, 0, 0);
  if (next2AM <= now) {
    next2AM.setDate(next2AM.getDate() + 1);
  }
  const initialDelay = next2AM.getTime() - now.getTime();

  // Start after initial delay, then repeat daily
  initialTimeoutId = setTimeout(() => {
    initialTimeoutId = null;
    runPurge();
    intervalId = setInterval(runPurge, 24 * 60 * 60 * 1000); // Daily
  }, initialDelay);

  console.log(`[trash-purge] Trash auto-purge scheduled (next run in ${Math.round(initialDelay / 60000)}min)`);
}

async function runPurge() {
  const startTime = Date.now();
  console.log("[trash-purge] Starting purge job");

  try {
    const result = await executeTrashPurge();
    const executionTimeMs = Date.now() - startTime;

    console.log(`[trash-purge] Completed: ${result.purgedCount}/${result.totalFound} purged, ${result.storageDeleted} files cleaned, ${result.errors} errors (${executionTimeMs}ms)`);

    auditLogger.log({
      eventType: "library_mutation",
      userId: null,
      endpoint: "jobs.purgeOldTrashItems",
      requestType: "job",
      requestPayload: {
        cutoffDays: TRASH_RETENTION_DAYS,
      },
      responsePayload: {
        ...result,
        executionTimeMs,
      },
    });
  } catch (error) {
    console.error("[trash-purge] Job failed:", error instanceof Error ? error.message : error);
  }
}

/**
 * Gracefully shut down.
 */
export async function shutdownTrashPurgeWorker(): Promise<void> {
  if (process.env.FEATURE_186_HARD_CUTOVER === "true") {
    stopFeature186SystemSchedule("library-trash-purge");
  }
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId);
    initialTimeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
