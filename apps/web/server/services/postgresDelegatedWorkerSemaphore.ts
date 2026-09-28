import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";

export interface PostgresSemaphoreHandle {
  leaseId: string;
  fencingToken: number;
  renew(): Promise<boolean>;
  isCurrent(): Promise<boolean>;
  commitIfCurrent<T>(mutate: (tx: DrizzleDB) => Promise<T>): Promise<T>;
  release(): Promise<void>;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
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
  const fencingToken = await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${input.scopeKey}, 0))
    `);
    await tx.execute(sql`
      DELETE FROM delegated_worker_concurrency_leases
      WHERE "scopeKey" = ${input.scopeKey} AND "expiresAt" <= clock_timestamp()
    `);
    const countResult = await tx.execute(sql`
      SELECT count(*)::int AS count
      FROM delegated_worker_concurrency_leases
      WHERE "scopeKey" = ${input.scopeKey} AND "expiresAt" > clock_timestamp()
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
    if (activeCount >= input.maxSlots) return null;

    const inserted = await tx.execute(sql`
      INSERT INTO delegated_worker_concurrency_leases
        ("leaseId", "scopeKey", "tenantId", "workerId", "workerJobId", "actionClass", "expiresAt", "createdAt")
      VALUES (
        ${leaseId}, ${input.scopeKey}, ${input.tenantId}, ${input.workerId},
        ${input.workerJobId}, ${input.actionClass},
        clock_timestamp() + (${input.ttlSeconds} * interval '1 second'), clock_timestamp()
      )
      RETURNING "fencingToken"
    `);
    const row = resultRows<{ fencingToken: number | string }>(inserted)[0];
    const token = Number(row?.fencingToken);
    if (!Number.isSafeInteger(token) || token < 1) {
      throw new Error(
        "PostgreSQL semaphore did not return a valid fencing token"
      );
    }
    return token;
  });

  if (fencingToken === null) return null;
  let released = false;
  return {
    leaseId,
    fencingToken,
    async renew(): Promise<boolean> {
      if (released) return false;
      const updated = await db.transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.scopeKey}, 0))`
        );
        return tx.execute(sql`
          UPDATE delegated_worker_concurrency_leases
          SET "expiresAt" = clock_timestamp() + (${input.ttlSeconds} * interval '1 second')
          WHERE "leaseId" = ${leaseId}
            AND "fencingToken" = ${fencingToken}
            AND "expiresAt" > clock_timestamp()
          RETURNING 1
        `);
      });
      return resultRows(updated).length === 1;
    },
    async isCurrent(): Promise<boolean> {
      if (released) return false;
      const current = await db.execute(sql`
        SELECT 1
        FROM delegated_worker_concurrency_leases
        WHERE "leaseId" = ${leaseId}
          AND "fencingToken" = ${fencingToken}
          AND "expiresAt" > clock_timestamp()
      `);
      return resultRows(current).length === 1;
    },
    async commitIfCurrent<T>(
      mutate: (tx: DrizzleDB) => Promise<T>
    ): Promise<T> {
      if (released)
        throw new Error("Delegated-worker lease is no longer current");
      return db.transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.scopeKey}, 0))`
        );
        const current = await tx.execute(sql`
          SELECT 1
          FROM delegated_worker_concurrency_leases
          WHERE "leaseId" = ${leaseId}
            AND "fencingToken" = ${fencingToken}
            AND "expiresAt" > clock_timestamp()
          FOR UPDATE
        `);
        if (resultRows(current).length !== 1) {
          throw new Error("Delegated-worker lease is no longer current");
        }
        return mutate(tx as unknown as DrizzleDB);
      });
    },
    async release(): Promise<void> {
      if (released) return;
      released = true;
      await db.transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.scopeKey}, 0))`
        );
        await tx.execute(sql`
          DELETE FROM delegated_worker_concurrency_leases
          WHERE "leaseId" = ${leaseId} AND "fencingToken" = ${fencingToken}
        `);
      });
    },
  };
}
