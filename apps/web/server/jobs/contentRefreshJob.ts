/**
 * Content Refresh Background Job — Spec 038 Section 09
 *
 * Checks for stale content artifacts every 6 hours and marks them as stale.
 * Uses setInterval (same pattern as purgeOldTrashItems).
 */

import { checkAndMarkStaleContent } from "../services/contentArtifactStore";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Execute the staleness check. Marks active artifacts past their refresh date as stale.
 */
export async function executeContentStalenessCheck(): Promise<{ markedStale: number }> {
  const markedStale = await checkAndMarkStaleContent();
  return { markedStale };
}

/**
 * Initialize the content refresh job to run every 6 hours.
 */
export async function initializeContentRefreshJob(): Promise<void> {
  // Run once at startup (delayed 60s to let DB connections settle)
  setTimeout(async () => {
    try {
      const result = await executeContentStalenessCheck();
      if (result.markedStale > 0) {
        console.log(`[ContentRefresh] Initial check: marked ${result.markedStale} artifacts as stale`);
      }
    } catch (err) {
      console.error("[ContentRefresh] Initial check failed:", err);
    }
  }, 60_000);

  // Schedule recurring check every 6 hours
  intervalId = setInterval(async () => {
    try {
      const result = await executeContentStalenessCheck();
      if (result.markedStale > 0) {
        console.log(`[ContentRefresh] Marked ${result.markedStale} artifacts as stale`);
      }
    } catch (err) {
      console.error("[ContentRefresh] Staleness check failed:", err);
    }
  }, SIX_HOURS_MS);

  console.log("[ContentRefresh] Job initialized (every 6 hours)");
}

export async function shutdownContentRefreshWorker(): Promise<void> {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
