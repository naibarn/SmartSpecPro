/**
 * Finance OCR retention cleanup job.
 *
 * Best-effort maintenance:
 * - Redact raw OCR text after the configured retention window.
 */

import { sweepDocumentExtractionOcrRetention } from "../services/financeDocumentExtractionService";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

async function runCleanup(): Promise<void> {
  const result = await sweepDocumentExtractionOcrRetention();
  if (result.redacted > 0) {
    console.log(
      `[Finance OCR Retention] Redacted ${result.redacted} extractions after ${result.retentionDays} days`,
    );
  }
}

export async function initializeFinanceOcrRetentionJob(): Promise<void> {
  if (intervalId) return;

  runCleanup().catch((err) => {
    console.error(
      "[Finance OCR Retention] Initial cleanup failed:",
      err instanceof Error ? err.message : String(err),
    );
  });

  intervalId = setInterval(() => {
    runCleanup().catch((err) => {
      console.error(
        "[Finance OCR Retention] Cleanup failed:",
        err instanceof Error ? err.message : String(err),
      );
    });
  }, SIX_HOURS_MS);

  intervalId.unref?.();
  console.log("[Finance OCR Retention] Job initialized (every 6h)");
}

export async function shutdownFinanceOcrRetentionJob(): Promise<void> {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
