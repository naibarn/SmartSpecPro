import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { acquirePostgresSemaphore } from "../postgresDelegatedWorkerSemaphore";

const enabled = process.env.RUN_SPEC245_G4_PG_TEST === "true";
const suite = enabled ? describe : describe.skip;

suite("PostgreSQL delegated worker concurrency leases", () => {
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    const configuredUrl = process.env.DATABASE_URL;
    if (!configuredUrl)
      throw new Error("DATABASE_URL is required for G4 tests");
    if (
      !new URL(configuredUrl).pathname.slice(1).endsWith("_spec245_g3_test")
    ) {
      throw new Error(
        "Refusing to run G4 tests outside the isolated Spec 245 database"
      );
    }
    db = getDb();
    const migration = await readFile(
      resolve(
        process.cwd(),
        "drizzle/0351_spec245_postgres_delegated_worker_leases.sql"
      ),
      "utf8"
    );
    const statements = migration
      .replaceAll("--> statement-breakpoint", "")
      .split(";")
      .map(statement => statement.trim())
      .filter(statement => statement && !statement.startsWith("SET LOCAL"));
    await db.transaction(async tx => {
      for (const statement of statements) await tx.execute(sql.raw(statement));
    });
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE delegated_worker_concurrency_leases`);
  });

  afterAll(async () => {
    if (db)
      await db.execute(
        sql`DROP TABLE IF EXISTS delegated_worker_concurrency_leases`
      );
  });

  it("enforces one exact scope limit under concurrent DB sessions", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        acquirePostgresSemaphore({
          scopeKey: "tenant-1:worker-1:job-1:compute",
          tenantId: "tenant-1",
          workerId: "worker-1",
          workerJobId: "job-1",
          actionClass: "compute",
          maxSlots: 3,
          ttlSeconds: 180,
        })
      )
    );
    const acquired = results.filter(Boolean);
    expect(acquired).toHaveLength(3);
    expect(results.filter(result => result === null)).toHaveLength(17);
  });

  it("releases leases idempotently and admits the next action", async () => {
    const input = {
      scopeKey: "tenant-2:worker-2:job-2:media",
      tenantId: "tenant-2",
      workerId: "worker-2",
      workerJobId: "job-2",
      actionClass: "media" as const,
      maxSlots: 1,
      ttlSeconds: 300,
    };
    const first = await acquirePostgresSemaphore(input);
    expect(first).not.toBeNull();
    await first!.release();
    await first!.release();
    const replacement = await acquirePostgresSemaphore(input);
    expect(replacement).not.toBeNull();
    await replacement!.release();
  });

  it("removes expired leases before counting and fails closed on database errors", async () => {
    await db.execute(sql`
      INSERT INTO delegated_worker_concurrency_leases
        ("leaseId", "scopeKey", "tenantId", "workerId", "workerJobId", "actionClass", "expiresAt")
      VALUES ('expired-lease', 'tenant-3:worker-3:job-3:read', 'tenant-3', 'worker-3', 'job-3', 'read', now() - interval '1 second')
    `);
    const lease = await acquirePostgresSemaphore({
      scopeKey: "tenant-3:worker-3:job-3:read",
      tenantId: "tenant-3",
      workerId: "worker-3",
      workerJobId: "job-3",
      actionClass: "read",
      maxSlots: 1,
      ttlSeconds: 90,
    });
    expect(lease).not.toBeNull();
    await lease!.release();

    await db.execute(sql`DROP TABLE delegated_worker_concurrency_leases`);
    await expect(
      acquirePostgresSemaphore({
        scopeKey: "tenant-3:worker-3:job-3:read",
        tenantId: "tenant-3",
        workerId: "worker-3",
        workerJobId: "job-3",
        actionClass: "read",
        maxSlots: 1,
        ttlSeconds: 90,
      })
    ).rejects.toThrow();
  });
});
