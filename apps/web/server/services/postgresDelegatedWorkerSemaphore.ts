import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export interface PostgresSemaphoreHandle {
  release(): Promise<void>;
}

/** Cross-instance bounded lease slots for delegated worker actions. */
export async function acquirePostgresSemaphore(input: {
  scopeKey: string;
  tenantId: string;
  workerId: string;
  workerJobId: string;
  actionClass: "read" | "compute" | "media" | "mcp_write";
  maxSlots: number;
  ttlSeconds: number;
}): Promise<PostgresSemaphoreHandle | null> {
  if (
    !Number.isInteger(input.maxSlots) ||
    input.maxSlots < 1 ||
    !Number.isInteger(input.ttlSeconds) ||
    input.ttlSeconds < 1
  ) {
    throw new Error("Semaphore limits must be positive integers");
  }

  const db = getDb();
  const leaseId = randomUUID();
  const acquired = await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${input.scopeKey}, 0))
    `);
    await tx.execute(sql`
      DELETE FROM delegated_worker_concurrency_leases
      WHERE "scopeKey" = ${input.scopeKey} AND "expiresAt" <= now()
    `);
    const countResult = await tx.execute(sql`
      SELECT count(*)::int AS count
      FROM delegated_worker_concurrency_leases
      WHERE "scopeKey" = ${input.scopeKey} AND "expiresAt" > now()
    `);
    const rows = Array.isArray(countResult)
      ? countResult
      : (countResult as { rows?: unknown }).rows;
    const activeCount = Number(
      Array.isArray(rows) ? (rows[0] as { count?: number | string })?.count : 0
    );
    if (!Number.isSafeInteger(activeCount) || activeCount < 0) {
      throw new Error("PostgreSQL semaphore count is invalid");
    }
    if (activeCount >= input.maxSlots) return false;

    await tx.execute(sql`
      INSERT INTO delegated_worker_concurrency_leases
        ("leaseId", "scopeKey", "tenantId", "workerId", "workerJobId", "actionClass", "expiresAt", "createdAt")
      VALUES (
        ${leaseId}, ${input.scopeKey}, ${input.tenantId}, ${input.workerId},
        ${input.workerJobId}, ${input.actionClass},
        now() + (${input.ttlSeconds} * interval '1 second'), now()
      )
    `);
    return true;
  });

  if (!acquired) return null;
  let released = false;
  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      await db.execute(sql`
        DELETE FROM delegated_worker_concurrency_leases WHERE "leaseId" = ${leaseId}
      `);
    },
  };
}
