import { sql } from "drizzle-orm";

import { getDb } from "../db";

export const DEFAULT_HEARTBEAT_RETENTION_DAYS = 30;
export const DEFAULT_HEARTBEAT_RETENTION_BATCH_SIZE = 5_000;

export type WorkerHeartbeatRetentionInput = {
  now?: Date;
  retentionDays?: number;
  batchSize?: number;
};

export type WorkerHeartbeatRetentionResult = {
  deletedHeartbeats: number;
  batches: number;
  cutoff: string;
};

export function getHeartbeatRetentionCutoff(
  now: Date = new Date(),
  retentionDays: number = DEFAULT_HEARTBEAT_RETENTION_DAYS
): Date {
  const days = Number.isFinite(retentionDays)
    ? Math.max(1, Math.min(Math.trunc(retentionDays), 3650))
    : DEFAULT_HEARTBEAT_RETENTION_DAYS;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function boundedBatchSize(batchSize: number | undefined): number {
  if (!Number.isFinite(batchSize))
    return DEFAULT_HEARTBEAT_RETENTION_BATCH_SIZE;
  return Math.max(1, Math.min(Math.trunc(batchSize as number), 50_000));
}

/**
 * Delete historical heartbeat telemetry without deleting the newest row for
 * any worker. The operation is deliberately batched so the daily maintenance
 * job does not hold a long-running transaction or monopolize the DB pool.
 */
export async function cleanupWorkerHeartbeatRetention(
  input: WorkerHeartbeatRetentionInput = {}
): Promise<WorkerHeartbeatRetentionResult> {
  const now = input.now ?? new Date();
  const cutoff = getHeartbeatRetentionCutoff(now, input.retentionDays);
  const batchSize = boundedBatchSize(input.batchSize);
  let deletedHeartbeats = 0;
  let batches = 0;

  while (true) {
    const deletedRows = await getDb().execute(sql`
      WITH candidates AS (
        SELECT candidate."id"
        FROM "worker_heartbeats" candidate
        WHERE candidate."createdAt" < ${cutoff.toISOString()}
          AND EXISTS (
            SELECT 1
            FROM "worker_heartbeats" newer
            WHERE newer."workerId" = candidate."workerId"
              AND (newer."createdAt", newer."id") > (candidate."createdAt", candidate."id")
          )
        ORDER BY candidate."createdAt" ASC, candidate."id" ASC
        LIMIT ${batchSize}
      )
      DELETE FROM "worker_heartbeats" heartbeat
      WHERE heartbeat."id" IN (SELECT candidates."id" FROM candidates)
      RETURNING heartbeat."id"
    `);
    const deletedInBatch = Array.isArray(deletedRows) ? deletedRows.length : 0;
    deletedHeartbeats += deletedInBatch;
    batches += 1;
    if (deletedInBatch < batchSize) break;
  }

  return {
    deletedHeartbeats,
    batches,
    cutoff: cutoff.toISOString(),
  };
}
