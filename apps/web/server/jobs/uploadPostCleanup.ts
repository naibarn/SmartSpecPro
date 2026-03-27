/**
 * Upload-Post retention cleanup job.
 *
 * Best-effort maintenance:
 * - Nullify job metadata/platform results after 30 days
 * - Delete terminal jobs after 90 days
 */

import { sweepUploadPostJobRetention } from "../services/uploadPostService";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

async function runCleanup(): Promise<void> {
  const result = await sweepUploadPostJobRetention();
  if (result.metadataCleared > 0 || result.deleted > 0) {
    console.log(
      `[Upload-Post Cleanup] Cleared metadata on ${result.metadataCleared} jobs and deleted ${result.deleted} stale jobs`,
    );
  }
}

export async function initializeUploadPostCleanupJob(): Promise<void> {
  if (intervalId) return;

  runCleanup().catch((err) => {
    console.error("[Upload-Post Cleanup] Initial cleanup failed:", err instanceof Error ? err.message : String(err));
  });

  intervalId = setInterval(() => {
    runCleanup().catch((err) => {
      console.error("[Upload-Post Cleanup] Cleanup failed:", err instanceof Error ? err.message : String(err));
    });
  }, SIX_HOURS_MS);

  intervalId.unref?.();
  console.log("[Upload-Post Cleanup] Job initialized (every 6h)");
}

export async function shutdownUploadPostCleanupWorker(): Promise<void> {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
