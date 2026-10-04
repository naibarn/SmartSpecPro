import { sql } from "drizzle-orm";

import { getDb } from "../db";

export const SPEC224_RUNNER_INPUT_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
export const SPEC224_RUNNER_INPUT_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SPEC224_RUNNER_INPUT_RETENTION_BATCH_SIZE = 100;

export type Spec224RunnerInputRetentionResult = {
  reconciledSources: number;
  deletedOrphanSources: number;
  deletedTerminalSources: number;
  deletedAttemptInputs: number;
};

function returnedCount(result: unknown): number {
  return Array.isArray(result) ? result.length : 0;
}

/**
 * Retains run-pinned bytes through retries and for 30 days after terminal job
 * completion. Orphan staging rows receive a 24-hour grace period. Reconciliation
 * and deletion always consult canonical worker_jobs state; no second queue or
 * independent run lifecycle is introduced.
 */
export async function executeSpec224RunnerInputRetention(
  now = new Date(),
  batchSize = SPEC224_RUNNER_INPUT_RETENTION_BATCH_SIZE,
): Promise<Spec224RunnerInputRetentionResult> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error("SPEC224_INPUT_RETENTION_BATCH_INVALID");
  }
  const orphanBefore = new Date(now.getTime() - SPEC224_RUNNER_INPUT_ORPHAN_GRACE_MS);
  const terminalBefore = new Date(now.getTime() - SPEC224_RUNNER_INPUT_TERMINAL_RETENTION_MS);
  const db = getDb();
  return db.transaction(async tx => {
    const reconciled = await tx.execute(sql`
      WITH candidates AS (
        SELECT source."id" AS source_id, job."id" AS job_id
        FROM "spec224_runner_input_sources" AS source
        JOIN "worker_jobs" AS job
          ON source."tenantId" = job."tenantId"
          AND source."startRef" = job."inputJson"->'spec224Run'->>'runId'
          AND source."id" = job."inputJson"->'spec224Run'->'metadata'->'spec224Input'->>'inputSourceRef'
          AND source."inputDigest" = job."inputJson"->'spec224Run'->'metadata'->'spec224Input'->>'inputDigest'
        WHERE source."workerJobId" IS NULL
        ORDER BY source."createdAt", source."id"
        FOR UPDATE OF source SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE "spec224_runner_input_sources" AS source
      SET "workerJobId" = candidates.job_id
      FROM candidates
      WHERE source."id" = candidates.source_id
      RETURNING source."id"
    `);

    const orphaned = await tx.execute(sql`
      WITH candidates AS (
        SELECT source."id"
        FROM "spec224_runner_input_sources" AS source
        WHERE source."workerJobId" IS NULL
          AND source."createdAt" <= ${orphanBefore.toISOString()}::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM "worker_jobs" AS job
            WHERE job."tenantId" = source."tenantId"
              AND job."inputJson"->'spec224Run'->>'runId' = source."startRef"
          )
        ORDER BY source."createdAt", source."id"
        FOR UPDATE OF source SKIP LOCKED
        LIMIT ${batchSize}
      )
      DELETE FROM "spec224_runner_input_sources" AS source
      USING candidates
      WHERE source."id" = candidates."id"
      RETURNING source."id"
    `);

    const terminal = await tx.execute(sql`
      WITH candidates AS (
        SELECT source."id" AS source_id, job."id" AS job_id
        FROM "spec224_runner_input_sources" AS source
        JOIN "worker_jobs" AS job ON job."id" = source."workerJobId"
        WHERE job."status" IN ('succeeded', 'failed', 'cancelled', 'canceled', 'completed', 'expired')
          AND job."finishedAt" IS NOT NULL
          AND job."finishedAt" <= ${terminalBefore.toISOString()}::timestamptz
          AND job."leaseOwnerToken" IS NULL
        ORDER BY job."finishedAt", source."id"
        FOR UPDATE OF source, job SKIP LOCKED
        LIMIT ${batchSize}
      ),
      removed_attempt_inputs AS (
        DELETE FROM "spec224_runner_job_inputs" AS attempt_input
        USING candidates
        WHERE attempt_input."workerJobId" = candidates.job_id
        RETURNING attempt_input."id"
      ),
      removed_sources AS (
        DELETE FROM "spec224_runner_input_sources" AS source
        USING candidates
        WHERE source."id" = candidates.source_id
        RETURNING source."id"
      )
      SELECT
        (SELECT count(*)::integer FROM removed_sources) AS "deletedTerminalSources",
        (SELECT count(*)::integer FROM removed_attempt_inputs) AS "deletedAttemptInputs"
    `);
    const reconciledSources = returnedCount(reconciled);
    const deletedOrphanSources = returnedCount(orphaned);
    const terminalRow = Array.isArray(terminal) && terminal[0] && typeof terminal[0] === "object"
      ? terminal[0] as Record<string, unknown>
      : {};
    return {
      reconciledSources,
      deletedOrphanSources,
      deletedTerminalSources: typeof terminalRow.deletedTerminalSources === "number" ? terminalRow.deletedTerminalSources : 0,
      deletedAttemptInputs: typeof terminalRow.deletedAttemptInputs === "number" ? terminalRow.deletedAttemptInputs : 0,
    };
  });
}
