import { sql } from "drizzle-orm";
import { getDb } from "../db";

export const FEEDBACK_AUTO_CLOSE_AFTER_MS = 5 * 24 * 60 * 60 * 1000;
const FEEDBACK_AUTO_CLOSE_INTERVAL_MS = 60 * 60 * 1000;
let intervalId: NodeJS.Timeout | null = null;
let startupTimeoutId: NodeJS.Timeout | null = null;

/** Close active feedback tickets whose latest activity is older than five days. */
export async function closeStaleFeedbackTickets(
  now = new Date()
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(now.getTime() - FEEDBACK_AUTO_CLOSE_AFTER_MS);
  const nowIso = now.toISOString();
  const cutoffIso = cutoff.toISOString();
  const result = await db.execute(sql`
    UPDATE feedback_tickets
    SET status = 'closed',
        "closedAt" = COALESCE("closedAt", ${nowIso}::timestamptz),
        "updatedAt" = ${nowIso}::timestamptz
    WHERE status <> 'closed'
      AND "updatedAt" < ${cutoffIso}::timestamptz
    RETURNING id
  `);
  return (result as unknown as Array<{ id: number }>).length;
}

async function runAutoClose(source: string): Promise<void> {
  try {
    const closed = await closeStaleFeedbackTickets();
    if (closed > 0) {
      console.log(
        `[FeedbackAutoCloseJob] ${source}: closed ${closed} stale tickets`
      );
    }
  } catch (error) {
    console.error(`[FeedbackAutoCloseJob] ${source} check failed:`, error);
  }
}

export async function initializeFeedbackAutoCloseJob(): Promise<void> {
  shutdownFeedbackAutoCloseJob();
  startupTimeoutId = setTimeout(() => void runAutoClose("initial"), 120_000);
  intervalId = setInterval(
    () => void runAutoClose("scheduled"),
    FEEDBACK_AUTO_CLOSE_INTERVAL_MS
  );
  console.log(
    "[FeedbackAutoCloseJob] initialized (hourly; five-day inactivity)"
  );
}

export function shutdownFeedbackAutoCloseJob(): void {
  if (startupTimeoutId) {
    clearTimeout(startupTimeoutId);
    startupTimeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
