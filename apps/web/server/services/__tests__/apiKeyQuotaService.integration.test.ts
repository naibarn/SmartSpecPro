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

  it("fails the request when PostgreSQL quota state cannot be read or written", async () => {
    await db.execute(sql`DROP TABLE api_key_quota_counters`);
    await expect(
      checkAndIncrementQuota("api-key-db-failure", "tenant-db-failure", {
        quotaDaily: 5,
      })
    ).rejects.toThrow();
  });
});
