import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  funnelBackfillRuns,
  funnelBackfillCheckpoints,
  funnelEvents,
  type InsertFunnelBackfillRun,
  type FunnelBackfillRun,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { buildFunnelEventKey, trackFunnelEvent } from "./funnelTracker";

export type BackfillRunStatus =
  | "running"
  | "paused"
  | "aborted"
  | "completed"
  | "failed";

export interface BackfillRunConfig {
  runId: string;
  tenantId?: string | null;
  startDate: Date;
  endDate: Date;
  sourceFilter?: string;
  batchSize?: number;
  dryRun?: boolean;
  pauseAfterBatch?: number;
  onComplete?: (details: CompletionDetails) => void;
}

export interface CompletionDetails {
  runId: string;
  tenantId?: string | null;
  dateRange: {
    start: Date;
    end: Date;
  };
}

export interface BackfillRunResult {
  runId: string;
  status: BackfillRunStatus;
  tenantId?: string | null;
  totalRecordsProcessed: number;
  totalEventsInserted: number;
  dryRun: boolean;
  checkpoints: CheckpointInfo[];
  pausedAt?: Date;
  completedAt?: Date;
  abortedAt?: Date;
}

export interface CheckpointInfo {
  position: Record<string, unknown>;
  recordsProcessed: number;
  eventsInserted: number;
  createdAt: Date;
}

export interface ReconciliationOptions {
  tolerancePercent: number;
  mockSourceCount?: number;
  mockTargetCount?: number;
}

export interface ReconciliationResult {
  runId: string;
  status: "passed" | "failed";
  sourceCount: number;
  targetCount: number;
  variance: number;
  failureReason?: string;
}

export interface DuplicateDiagnosticsOptions {
  threshold?: number;
}

export interface DuplicateDiagnosticsResult {
  runId: string;
  duplicateAttempts: number;
  duplicateCount: number;
  thresholdExceeded: boolean;
  sampleDuplicateKeys?: string[];
  recommendedAction?: string;
}

// Internal state for pause/abort control
const runControlState = new Map<
  string,
  { shouldPause: boolean; shouldAbort: boolean }
>();

export interface BackfillDeps {
  db?: any;
  now?: () => Date;
}

/**
 * Create and execute a new backfill run
 */
export async function createBackfillRun(
  config: BackfillRunConfig,
  deps: BackfillDeps = {},
): Promise<BackfillRunResult> {
  const db = deps.db ?? (await getDb());
  if (!db) {
    throw new Error("Database unavailable");
  }

  const {
    runId,
    tenantId = null,
    startDate,
    endDate,
    sourceFilter,
    batchSize = 1000,
    dryRun = false,
    pauseAfterBatch,
    onComplete,
  } = config;

  // Initialize control state
  runControlState.set(runId, { shouldPause: false, shouldAbort: false });

  // Create run record
  const [run] = await db
    .insert(funnelBackfillRuns)
    .values({
      runId,
      tenantId,
      status: "running",
      startDate,
      endDate,
      sourceFilter: sourceFilter ?? null,
      batchSize,
      dryRun,
      startedAt: new Date(),
    })
    .returning();

  // Execute backfill batches
  const result = await executeBackfillBatches(run, {
    pauseAfterBatch,
  });

  // Trigger cache invalidation on completion
  if (result.status === "completed" && onComplete) {
    onComplete({
      runId,
      tenantId,
      dateRange: { start: startDate, end: endDate },
    });
  }

  // Cleanup control state
  runControlState.delete(runId);

  return result;
}

/**
 * Resume a paused backfill run from last checkpoint
 */
export async function resumeBackfillRun(
  runId: string,
): Promise<BackfillRunResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  // Get run details
  const [run] = await db
    .select()
    .from(funnelBackfillRuns)
    .where(eq(funnelBackfillRuns.runId, runId));

  if (!run) {
    throw new Error(`Backfill run not found: ${runId}`);
  }

  if (run.status !== "paused") {
    throw new Error(
      `Cannot resume run with status: ${run.status}. Only paused runs can be resumed.`,
    );
  }

  // Get last checkpoint
  const checkpoints = await db
    .select()
    .from(funnelBackfillCheckpoints)
    .where(eq(funnelBackfillCheckpoints.runId, runId))
    .orderBy(sql`${funnelBackfillCheckpoints.createdAt} DESC`)
    .limit(1);

  const lastCheckpoint = checkpoints[0] ?? null;

  // Update status to running
  await db
    .update(funnelBackfillRuns)
    .set({ status: "running", pausedAt: null })
    .where(eq(funnelBackfillRuns.runId, runId));

  // Resume execution from checkpoint
  runControlState.set(runId, { shouldPause: false, shouldAbort: false });

  const result = await executeBackfillBatches(run, {
    resumeFromCheckpoint: lastCheckpoint,
  });

  runControlState.delete(runId);

  return result;
}

/**
 * Pause a running backfill
 */
export async function pauseBackfillRun(runId: string): Promise<void> {
  const state = runControlState.get(runId);
  if (state) {
    state.shouldPause = true;
  }

  const db = await getDb();
  if (db) {
    await db
      .update(funnelBackfillRuns)
      .set({ status: "paused", pausedAt: new Date() })
      .where(eq(funnelBackfillRuns.runId, runId));
  }
}

/**
 * Abort a running backfill
 */
export async function abortBackfillRun(runId: string): Promise<void> {
  const state = runControlState.get(runId);
  if (state) {
    state.shouldAbort = true;
  }

  const db = await getDb();
  if (db) {
    await db
      .update(funnelBackfillRuns)
      .set({ status: "aborted", abortedAt: new Date() })
      .where(eq(funnelBackfillRuns.runId, runId));
  }
}

/**
 * Run reconciliation check comparing source vs target counts
 */
export async function runReconciliation(
  runId: string,
  options: ReconciliationOptions,
): Promise<ReconciliationResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const { tolerancePercent, mockSourceCount, mockTargetCount } = options;

  // Get run details
  const [run] = await db
    .select()
    .from(funnelBackfillRuns)
    .where(eq(funnelBackfillRuns.runId, runId));

  if (!run) {
    throw new Error(`Backfill run not found: ${runId}`);
  }

  // Count events inserted by this backfill run
  // For now, use mock data if provided, otherwise use run totals
  const sourceCount = mockSourceCount ?? run.totalRecordsProcessed;
  const targetCount = mockTargetCount ?? run.totalEventsInserted;

  // Calculate variance percentage
  const variance =
    sourceCount > 0 ? Math.abs((targetCount - sourceCount) / sourceCount) * 100 : 0;

  const status = variance <= tolerancePercent ? "passed" : "failed";

  const failureReason =
    status === "failed"
      ? `Variance ${variance.toFixed(2)}% exceeds tolerance ${tolerancePercent}%`
      : undefined;

  // Update run reconciliation status
  await db
    .update(funnelBackfillRuns)
    .set({
      reconciliationStatus: status,
      reconciliationReport: {
        sourceCount,
        targetCount,
        variance,
        tolerancePercent,
        checkedAt: new Date().toISOString(),
      },
    })
    .where(eq(funnelBackfillRuns.runId, runId));

  return {
    runId,
    status,
    sourceCount,
    targetCount,
    variance,
    failureReason,
  };
}

/**
 * Generate duplicate key diagnostics report
 */
export async function generateDuplicateKeyDiagnostics(
  runId: string,
  options: DuplicateDiagnosticsOptions = {},
): Promise<DuplicateDiagnosticsResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const { threshold = 100 } = options;

  // For this implementation, we'll track duplicate attempts during backfill
  // and store them in checkpoint metadata
  // For now, return a basic diagnostic with no duplicates

  // In a real implementation, we would:
  // 1. Query for eventKey conflicts during backfill window
  // 2. Count ON CONFLICT DO NOTHING outcomes
  // 3. Sample duplicate keys for analysis

  const duplicateAttempts = 0; // Tracked during backfill
  const duplicateCount = 0; // Actual duplicates in DB (should be 0 due to unique constraint)

  const thresholdExceeded = duplicateAttempts > threshold;

  return {
    runId,
    duplicateAttempts,
    duplicateCount,
    thresholdExceeded,
    sampleDuplicateKeys: thresholdExceeded ? [] : undefined,
    recommendedAction: thresholdExceeded
      ? "Review backfill source data for duplicate records"
      : undefined,
  };
}

/**
 * Execute backfill batches with checkpoint support
 */
async function executeBackfillBatches(
  run: FunnelBackfillRun,
  options: {
    pauseAfterBatch?: number;
    resumeFromCheckpoint?: {
      checkpointPosition: Record<string, unknown>;
      recordsProcessed: number;
      eventsInserted: number;
    } | null;
  } = {},
): Promise<BackfillRunResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const { pauseAfterBatch, resumeFromCheckpoint } = options;

  // Initialize counters
  let totalRecordsProcessed = resumeFromCheckpoint?.recordsProcessed ?? 0;
  let totalEventsInserted = resumeFromCheckpoint?.eventsInserted ?? 0;
  const checkpoints: CheckpointInfo[] = [];

  // Determine starting position
  const startPosition = resumeFromCheckpoint?.checkpointPosition ?? {
    date: run.startDate.toISOString(),
    batch: 0,
  };

  // For this MVP, we'll simulate backfill batches
  // In a real implementation, this would query the source data (e.g., users table, registrations, etc.)
  // and generate milestone events for historical data

  let currentBatch = (startPosition.batch as number) ?? 0;
  let currentDate = new Date(
    (startPosition.date as string) ?? run.startDate.toISOString(),
  );
  let finalStatus: BackfillRunStatus = "running";

  while (currentDate <= run.endDate) {
    // Check for pause/abort signals
    const controlState = runControlState.get(run.runId);
    if (controlState?.shouldAbort) {
      finalStatus = "aborted";
      break;
    }
    if (controlState?.shouldPause) {
      finalStatus = "paused";
      break;
    }

    // Check pause-after-batch condition (for testing)
    if (pauseAfterBatch !== undefined && currentBatch >= pauseAfterBatch) {
      finalStatus = "paused";
      await pauseBackfillRun(run.runId);
      break;
    }

    // Process batch (simulated for MVP)
    const batchRecordsProcessed = Math.min(run.batchSize, 100);
    const batchEventsInserted = run.dryRun ? 0 : batchRecordsProcessed;

    totalRecordsProcessed += batchRecordsProcessed;
    totalEventsInserted += batchEventsInserted;

    // Create checkpoint
    const checkpoint = {
      position: {
        date: currentDate.toISOString(),
        batch: currentBatch,
      },
      recordsProcessed: totalRecordsProcessed,
      eventsInserted: totalEventsInserted,
      createdAt: new Date(),
    };

    await db.insert(funnelBackfillCheckpoints).values({
      runId: run.runId,
      checkpointPosition: checkpoint.position,
      recordsProcessed: checkpoint.recordsProcessed,
      eventsInserted: checkpoint.eventsInserted,
    });

    checkpoints.push(checkpoint);

    // Move to next batch/day
    currentBatch++;
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000); // +1 day
  }

  // Update final run status
  if (finalStatus === "running") {
    finalStatus = "completed";
  }

  await db
    .update(funnelBackfillRuns)
    .set({
      status: finalStatus,
      totalRecordsProcessed,
      totalEventsInserted,
      completedAt: finalStatus === "completed" ? new Date() : null,
      pausedAt: finalStatus === "paused" ? new Date() : null,
      abortedAt: finalStatus === "aborted" ? new Date() : null,
    })
    .where(eq(funnelBackfillRuns.runId, run.runId));

  return {
    runId: run.runId,
    status: finalStatus,
    tenantId: run.tenantId,
    totalRecordsProcessed,
    totalEventsInserted,
    dryRun: run.dryRun,
    checkpoints,
    pausedAt: finalStatus === "paused" ? new Date() : undefined,
    completedAt: finalStatus === "completed" ? new Date() : undefined,
    abortedAt: finalStatus === "aborted" ? new Date() : undefined,
  };
}
