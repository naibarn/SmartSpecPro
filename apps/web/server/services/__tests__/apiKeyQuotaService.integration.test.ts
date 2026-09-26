import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { checkAndIncrementQuota } from "../apiKeyQuotaService";

vi.mock("../webhookDeliveryService", () => ({
  emitPublicApiEvent: vi.fn().mockResolvedValue(undefined),
}));

const enabled = process.env.RUN_SPEC245_G3_PG_TEST === "true";
const suite = enabled ? describe : describe.skip;

suite("PostgreSQL API key quota counters", () => {
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    const configuredUrl = process.env.DATABASE_URL;
    if (!configuredUrl)
      throw new Error("DATABASE_URL is required for the isolated quota test");
    const databaseName = new URL(configuredUrl).pathname.slice(1);
    if (!databaseName.endsWith("_spec245_g3_test")) {
      throw new Error(
        "Refusing to run quota integration test outside a *_spec245_g3_test database"
      );
    }

    db = await getDb();
    const migration = await readFile(
      resolve(
        process.cwd(),
        "drizzle/0350_spec245_postgres_api_key_quota_counters.sql"
      ),
      "utf8"
    );
    const statements = migration
      .replaceAll("--> statement-breakpoint", "")
      .split(";")
      .map(statement => statement.trim())
      .filter(Boolean);
    await db.transaction(async tx => {
      for (const statement of statements) await tx.execute(sql.raw(statement));
    });
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE api_key_quota_counters`);
  });

  afterAll(async () => {
    if (db) await db.execute(sql`DROP TABLE IF EXISTS api_key_quota_counters`);
  });

  it("enforces a hard hourly limit across concurrent requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        checkAndIncrementQuota("api-key-concurrent", "tenant-concurrent", {
          quotaHourly: 12,
        })
      )
    );

    expect(results.filter(result => result.allowed)).toHaveLength(12);
    expect(results.filter(result => !result.allowed)).toHaveLength(28);
    expect(
      results.every(
        result => result.blockedWindow === "hourly" || result.allowed
      )
    ).toBe(true);

    const count = await db.execute(sql`
      SELECT "requestCount" FROM api_key_quota_counters
      WHERE "apiKeyId" = 'api-key-concurrent'
        AND "window" = 'hourly'
    `);
    const countRows = Array.isArray(count) ? count : count.rows;
    expect(Number(countRows[0]?.requestCount)).toBe(40);
  });

  it("increments every configured window and emits its warning once", async () => {
    const emitPublicApiEvent = vi.mocked(
      await import("../webhookDeliveryService").then(
        module => module.emitPublicApiEvent
      )
    );
    emitPublicApiEvent.mockClear();

    const allowed = await Promise.all(
      Array.from({ length: 5 }, () =>
        checkAndIncrementQuota("api-key-windows", "tenant-windows", {
          quotaHourly: 5,
          quotaDaily: 100,
        })
      )
    );
    expect(allowed.every(result => result.allowed)).toBe(true);

    const denied = await checkAndIncrementQuota(
      "api-key-windows",
      "tenant-windows",
      {
        quotaHourly: 5,
        quotaDaily: 100,
      }
    );
    expect(denied).toMatchObject({ allowed: false, blockedWindow: "hourly" });
    expect(denied.headers["X-Quota-Hourly-Remaining"]).toBe("0");

    const rows = await db.execute(sql`
      SELECT "window", "requestCount" FROM api_key_quota_counters
      WHERE "apiKeyId" = 'api-key-windows'
    `);
    const quotaRows = Array.isArray(rows) ? rows : rows.rows;
    expect(
      Object.fromEntries(
        quotaRows.map((row: any) => [row.window, Number(row.requestCount)])
      )
    ).toEqual({
      hourly: 6,
      daily: 6,
    });
    expect(emitPublicApiEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps request retry and API-key isolation semantics", async () => {
    // A retry is another request-count unit, matching Redis INCR semantics.
    const firstAttempt = await checkAndIncrementQuota(
      "api-key-retry",
      "tenant-a",
      { quotaHourly: 2 }
    );
    const retriedAttempt = await checkAndIncrementQuota(
      "api-key-retry",
      "tenant-a",
      { quotaHourly: 2 }
    );
    const overLimit = await checkAndIncrementQuota(
      "api-key-retry",
      "tenant-a",
      { quotaHourly: 2 }
    );
    const otherKey = await checkAndIncrementQuota(
      "api-key-retry-other",
      "tenant-a",
      { quotaHourly: 2 }
    );

    expect(firstAttempt.allowed).toBe(true);
    expect(retriedAttempt.allowed).toBe(true);
    expect(overLimit).toMatchObject({
      allowed: false,
      blockedWindow: "hourly",
    });
    expect(otherKey.allowed).toBe(true);

    const tenantBKey = await checkAndIncrementQuota(
      "api-key-tenant-b",
      "tenant-b",
      { quotaHourly: 2 }
    );
    expect(tenantBKey.allowed).toBe(true);
    const tenantRows = await db.execute(sql`
      SELECT "apiKeyId", "tenantId", "requestCount"
      FROM api_key_quota_counters
      WHERE "apiKeyId" IN ('api-key-retry', 'api-key-tenant-b')
      ORDER BY "apiKeyId"
    `);
    const isolatedRows = Array.isArray(tenantRows)
      ? tenantRows
      : tenantRows.rows;
    expect(isolatedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: "api-key-retry",
          tenantId: "tenant-a",
        }),
        expect.objectContaining({
          apiKeyId: "api-key-tenant-b",
          tenantId: "tenant-b",
        }),
      ])
    );
  });

  it("preserves hourly, daily, weekly, and monthly bucket contracts", async () => {
    const now = new Date();
    const result = await checkAndIncrementQuota(
      "api-key-all-windows",
      "tenant-all-windows",
      {
        quotaHourly: 10,
        quotaDaily: 20,
        quotaWeekly: 30,
        quotaMonthly: 40,
      }
    );

    expect(result.allowed).toBe(true);
    expect(result.headers).toMatchObject({
      "X-Quota-Hourly-Limit": "10",
      "X-Quota-Daily-Limit": "20",
      "X-Quota-Weekly-Limit": "30",
      "X-Quota-Monthly-Limit": "40",
    });
    const reset = Number(result.headers["X-Quota-Hourly-Reset"]);
    expect(reset).toBeGreaterThan(Math.floor(now.getTime() / 1000));
    expect(reset).toBeLessThanOrEqual(Math.floor(now.getTime() / 1000) + 3600);

    const rows = await db.execute(sql`
      SELECT "window", "periodKey", "requestCount", "expiresAt"
      FROM api_key_quota_counters WHERE "apiKeyId" = 'api-key-all-windows'
    `);
    const windowRows = Array.isArray(rows) ? rows : rows.rows;
    expect(windowRows).toHaveLength(4);
    expect(
      Object.fromEntries(
        windowRows.map((row: any) => [row.window, row.periodKey])
      )
    ).toMatchObject({
      hourly: expect.stringMatching(/^\d+$/),
      daily: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      weekly: expect.stringMatching(/^\d{4}-W\d{2}$/),
      monthly: expect.stringMatching(/^\d{4}-\d{2}$/),
    });
    expect(windowRows.every((row: any) => Number(row.requestCount) === 1)).toBe(
      true
    );
    expect(
      windowRows.every(
        (row: any) => new Date(row.expiresAt).getTime() > now.getTime()
      )
    ).toBe(true);
  });

  it("enforces per-key limits under concurrent multi-key database load", async () => {
    const results = await Promise.all(
      Array.from({ length: 120 }, (_, index) => {
        const keyIndex = index % 12;
        return checkAndIncrementQuota(
          `api-key-load-${keyIndex}`,
          `tenant-load-${keyIndex}`,
          { quotaHourly: 5 }
        );
      })
    );

    expect(results.filter(result => result.allowed)).toHaveLength(60);
    expect(results.filter(result => !result.allowed)).toHaveLength(60);
    const rows = await db.execute(sql`
      SELECT count(*)::int AS row_count, sum("requestCount")::int AS total_count
      FROM api_key_quota_counters WHERE "apiKeyId" LIKE 'api-key-load-%'
    `);
    const loadRows = Array.isArray(rows) ? rows : rows.rows;
    expect(Number(loadRows[0]?.row_count)).toBe(12);
    expect(Number(loadRows[0]?.total_count)).toBe(120);
  });

  it("rolls back all window counters if a later window write fails", async () => {
    await db.execute(sql`
      ALTER TABLE api_key_quota_counters
      ADD CONSTRAINT spec245_test_reject_daily CHECK ("window" <> 'daily') NOT VALID
    `);

    try {
      await expect(
        checkAndIncrementQuota("api-key-rollback", "tenant-rollback", {
          quotaHourly: 5,
          quotaDaily: 5,
        })
      ).rejects.toThrow();

      const rows = await db.execute(sql`
        SELECT count(*)::int AS count
        FROM api_key_quota_counters WHERE "apiKeyId" = 'api-key-rollback'
      `);
      const resultRows = Array.isArray(rows) ? rows : rows.rows;
      expect(Number(resultRows[0]?.count)).toBe(0);
    } finally {
      await db.execute(sql`
        ALTER TABLE api_key_quota_counters
        DROP CONSTRAINT IF EXISTS spec245_test_reject_daily
      `);
    }
  });

  it("bounds cross-instance advisory-lock waits", async () => {
    let releaseLock!: () => void;
    let lockHeld!: () => void;
    const held = new Promise<void>(resolve => (lockHeld = resolve));
    const release = new Promise<void>(resolve => (releaseLock = resolve));
    const lockOwner = db.transaction(async tx => {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(hashtextextended('api-key-lock-timeout', 0))
      `);
      lockHeld();
      await release;
    });

    try {
      await held;
      await expect(
        checkAndIncrementQuota("api-key-lock-timeout", "tenant-lock", {
          quotaHourly: 5,
        })
      ).rejects.toMatchObject({ cause: { code: "55P03" } });
    } finally {
      releaseLock();
      await lockOwner;
    }
  });

  it("fails the request when PostgreSQL quota state cannot be read or written", async () => {
    await db.execute(sql`DROP TABLE api_key_quota_counters`);
    await expect(
      checkAndIncrementQuota("api-key-db-failure", "tenant-db-failure", {
        quotaDaily: 5,
      })
    ).rejects.toThrow();
  });
});
