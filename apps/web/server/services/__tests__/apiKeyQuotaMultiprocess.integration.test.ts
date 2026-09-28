import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { getDb } from "../../db";

const enabled = process.env.RUN_SPEC245_G3_MULTIPROCESS_TEST === "true";
const suite = enabled ? describe : describe.skip;
const WEB_DIR = process.cwd();
const TSX_CLI = resolve(WEB_DIR, "node_modules/tsx/dist/cli.mjs");
const HTTP_FIXTURE = resolve(
  WEB_DIR,
  "server/services/__tests__/fixtures/spec245QuotaHttpProcess.ts"
);
const IMPORTER = resolve(WEB_DIR, "scripts/migrate-api-key-quota-counters.ts");

type ReadyProcess = {
  process: ChildProcess;
  port: number;
  pid: number;
  output: string;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function startWebProcess(
  overrides: NodeJS.ProcessEnv = {}
): Promise<ReadyProcess> {
  const child = spawn(process.execPath, [TSX_CLI, HTTP_FIXTURE], {
    cwd: WEB_DIR,
    env: {
      ...process.env,
      PORT: "0",
      DB_POOL_SIZE: "4",
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let stderr = "";
  const onData = (chunk: Buffer) => {
    output += chunk.toString();
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const timeout = Date.now() + 15_000;
  while (Date.now() < timeout) {
    const readyLine = output
      .split(/\r?\n/)
      .find(line => line.includes('"ready":true'));
    if (readyLine) {
      const ready = JSON.parse(readyLine) as { port: number; pid: number };
      return { process: child, port: ready.port, pid: ready.pid, output };
    }
    if (child.exitCode !== null) {
      throw new Error(
        `Quota Web process exited before ready: ${stderr.slice(-2000)}`
      );
    }
    await delay(25);
  }
  child.kill("SIGKILL");
  throw new Error(
    `Quota Web process readiness timeout: ${stderr.slice(-2000)}`
  );
}

async function stopProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>(resolveExit => child.once("exit", () => resolveExit())),
    delay(2_000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function request(
  processInfo: ReadyProcess,
  path: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any; elapsedMs: number }> {
  const started = performance.now();
  const response = await fetch(`http://127.0.0.1:${processInfo.port}${path}`, {
    method: path === "/ready" ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: path === "/ready" ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep non-JSON middleware responses observable in the assertion.
  }
  return {
    status: response.status,
    body: parsed,
    elapsedMs: performance.now() - started,
  };
}

function runImporter(
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ code: number; output: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, IMPORTER, ...args], {
      cwd: WEB_DIR,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let stderr = "";
    child.stdout?.on("data", chunk => (output += chunk.toString()));
    child.stderr?.on("data", chunk => (stderr += chunk.toString()));
    child.once("error", reject);
    child.once("exit", code => {
      if (code === null)
        return reject(new Error("Quota importer exited without status"));
      resolveResult({ code, output: `${output}${stderr}` });
    });
  });
}

suite("G3 quota behavior across independent Web processes", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let redis: Redis;
  let processA: ReadyProcess;
  let processB: ReadyProcess;
  let observedLatencyMs: number[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    const redisUrl = process.env.REDIS_URL;
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith("_spec245_g3_test")
    ) {
      throw new Error(
        "G3 multi-process tests require an isolated *_spec245_g3_test database"
      );
    }
    if (!redisUrl)
      throw new Error("G3 multi-process tests require a disposable REDIS_URL");
    const redisTarget = new URL(redisUrl);
    if (redisTarget.hostname !== "127.0.0.1" || redisTarget.port === "6379") {
      throw new Error(
        "Refusing to use the shared/default Redis endpoint in multi-process tests"
      );
    }
    db = getDb();
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    });
    await redis.ping();

    const migration = await (
      await import("node:fs/promises")
    ).readFile(
      resolve(
        WEB_DIR,
        "drizzle/0350_spec245_postgres_api_key_quota_counters.sql"
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
      await tx.execute(sql`
        CREATE TABLE IF NOT EXISTS api_keys (
          id varchar(36) PRIMARY KEY,
          "tenantId" varchar(36) NOT NULL
        )
      `);
    });
    processA = await startWebProcess();
    processB = await startWebProcess();
    expect(processA.pid).not.toBe(processB.pid);
    expect((await request(processA, "/ready")).status).toBe(200);
    expect((await request(processB, "/ready")).status).toBe(200);
  }, 30_000);

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE api_key_quota_counters`);
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        "quota:*",
        "COUNT",
        500
      );
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
    cursor = "0";
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        "idempotency:*",
        "COUNT",
        500
      );
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
    observedLatencyMs = [];
  });

  afterAll(async () => {
    await stopProcess(processA?.process);
    await stopProcess(processB?.process);
    if (redis) await redis.quit();
    if (db) {
      await db.execute(sql`DROP TABLE IF EXISTS api_key_quota_counters`);
      await db.execute(sql`DROP TABLE IF EXISTS api_keys`);
      await db.$client.end({ timeout: 2 });
    }
  });

  it("enforces one shared hard limit across two concurrent Web processes and records contention metrics", async () => {
    const count = 100;
    let finished = false;
    let maxConnections = 0;
    let maxAdvisoryWaiters = 0;
    const monitor = (async () => {
      while (!finished) {
        const [connections, locks] = await Promise.all([
          db.execute(
            sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()`
          ),
          db.execute(
            sql`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`
          ),
        ]);
        maxConnections = Math.max(
          maxConnections,
          Number(rowsOf<{ n: number }>(connections)[0]?.n ?? 0)
        );
        maxAdvisoryWaiters = Math.max(
          maxAdvisoryWaiters,
          Number(rowsOf<{ n: number }>(locks)[0]?.n ?? 0)
        );
        await delay(10);
      }
    })();

    const responsesPromise = Promise.all(
      Array.from({ length: count }, (_, index) =>
        request(index % 2 ? processA : processB, "/quota", {
          apiKeyId: "multiprocess-api-key",
          tenantId: "multiprocess-tenant",
          limit: 30,
        }).then(result => {
          observedLatencyMs.push(result.elapsedMs);
          return result;
        })
      )
    );
    const responses = await responsesPromise;
    finished = true;
    await monitor;

    expect(responses.filter(response => response.status === 200)).toHaveLength(
      30
    );
    expect(responses.filter(response => response.status === 429)).toHaveLength(
      70
    );
    expect(
      new Set(
        responses
          .filter(response => response.status === 200)
          .map(response => response.body.pid)
      )
    ).toEqual(new Set([processA.pid, processB.pid]));

    const period = String(Math.floor(Date.now() / 3_600_000));
    const counter = await db.execute(sql`
      SELECT "requestCount" FROM api_key_quota_counters
      WHERE "apiKeyId" = 'multiprocess-api-key' AND "window" = 'hourly' AND "periodKey" = ${period}
    `);
    expect(
      Number(rowsOf<{ requestCount: number }>(counter)[0]?.requestCount)
    ).toBe(count);

    const wrongTenant = await request(processB, "/quota", {
      apiKeyId: "multiprocess-api-key",
      tenantId: "another-tenant",
      limit: 30,
    });
    expect(wrongTenant.status).toBe(503);
    const unchanged = await db.execute(sql`
      SELECT "tenantId", "requestCount" FROM api_key_quota_counters
      WHERE "apiKeyId" = 'multiprocess-api-key' AND "window" = 'hourly' AND "periodKey" = ${period}
    `);
    expect(
      rowsOf<{ tenantId: string; requestCount: number }>(unchanged)[0]
    ).toMatchObject({
      tenantId: "multiprocess-tenant",
      requestCount: count,
    });

    const sorted = [...observedLatencyMs].sort((a, b) => a - b);
    console.info(
      "spec245_g3_multiprocess_metrics",
      JSON.stringify({
        processes: 2,
        requests: count,
        p50_ms: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(1)),
        p95_ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)),
        max_active_connections_observed: maxConnections,
        max_advisory_waiters_observed: maxAdvisoryWaiters,
        pool_limit_per_process: 4,
      })
    );
    expect(maxConnections).toBeLessThanOrEqual(11);
  }, 30_000);

  it("counts concurrent retries before shared Redis idempotency response replay", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        request(
          index % 2 ? processA : processB,
          "/idempotent",
          {
            apiKeyId: "idempotent-multiprocess-key",
            tenantId: "multiprocess-tenant",
            limit: 100,
          },
          { "idempotency-key": "same-operation-key" }
        )
      )
    );
    const executions = attempts.filter(response => response.status === 201);
    expect(executions).toHaveLength(1);
    expect(attempts.filter(response => response.status === 409)).toHaveLength(
      11
    );

    await delay(120);
    const replay = await request(
      processB,
      "/idempotent",
      {
        apiKeyId: "idempotent-multiprocess-key",
        tenantId: "multiprocess-tenant",
        limit: 100,
      },
      { "idempotency-key": "same-operation-key" }
    );
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(executions[0].body);

    const period = String(Math.floor(Date.now() / 3_600_000));
    const counter = await db.execute(sql`
      SELECT "requestCount" FROM api_key_quota_counters
      WHERE "apiKeyId" = 'idempotent-multiprocess-key' AND "window" = 'hourly' AND "periodKey" = ${period}
    `);
    expect(
      Number(rowsOf<{ requestCount: number }>(counter)[0]?.requestCount)
    ).toBe(13);
  }, 30_000);

  it("starts a new quota window after the bucket boundary across process calls", async () => {
    const first = await request(processA, "/quota-at", {
      apiKeyId: "window-boundary-key",
      tenantId: "tenant-window",
      at: "2026-09-27T10:59:59.000Z",
      limit: 1,
    });
    const nextWindow = await request(processB, "/quota-at", {
      apiKeyId: "window-boundary-key",
      tenantId: "tenant-window",
      at: "2026-09-27T11:00:01.000Z",
      limit: 1,
    });
    expect(first.status).toBe(200);
    expect(nextWindow.status).toBe(200);
    const rows = await db.execute(sql`
      SELECT "periodKey", "requestCount" FROM api_key_quota_counters
      WHERE "apiKeyId" = 'window-boundary-key' AND "window" = 'hourly'
      ORDER BY "periodKey"
    `);
    expect(
      rowsOf<{ periodKey: string; requestCount: number }>(rows).map(row =>
        Number(row.requestCount)
      )
    ).toEqual([1, 1]);
  });

  it("rolls back all windows on failure, fails closed on database failure, and reconciles a writer-fenced Redis snapshot", async () => {
    await db.execute(sql`
      ALTER TABLE api_key_quota_counters
      ADD CONSTRAINT spec245_mp_reject_daily CHECK ("window" <> 'daily') NOT VALID
    `);
    try {
      const failedTransaction = await request(
        processA,
        "/quota",
        {
          apiKeyId: "rollback-multiprocess-key",
          tenantId: "tenant-rollback",
          limit: 100,
        },
        { "x-spec245-daily": "true" }
      );
      expect(failedTransaction.status).toBe(503);
      const rows = await db.execute(sql`
        SELECT count(*)::int AS n FROM api_key_quota_counters
        WHERE "apiKeyId" = 'rollback-multiprocess-key'
      `);
      expect(Number(rowsOf<{ n: number }>(rows)[0]?.n)).toBe(0);
    } finally {
      await db.execute(
        sql`ALTER TABLE api_key_quota_counters DROP CONSTRAINT IF EXISTS spec245_mp_reject_daily`
      );
    }

    const badDbUrl = new URL(process.env.DATABASE_URL!);
    badDbUrl.pathname = "/missing_spec245_g3_test";
    const failureProcess = await startWebProcess({
      DATABASE_URL: badDbUrl.toString(),
    });
    try {
      const unavailable = await request(failureProcess, "/quota", {
        apiKeyId: "database-failure-key",
        tenantId: "tenant-failure",
        limit: 10,
      });
      expect(unavailable.status).toBe(503);
    } finally {
      await stopProcess(failureProcess.process);
    }

    const period = String(Math.floor(Date.now() / 3_600_000));
    const counterKey = `quota:apikey:import-multiprocess-key:h:${period}`;
    const warningKey = `quota:warn:import-multiprocess-key:h:${period}`;
    await db.execute(
      sql`INSERT INTO api_keys (id, "tenantId") VALUES ('import-multiprocess-key', 'tenant-import')`
    );
    await db.execute(sql`
      INSERT INTO api_keys (id, "tenantId") VALUES ('preserve-high-key', 'tenant-preserve')
    `);
    await db.execute(sql`
      INSERT INTO api_key_quota_counters ("tenantId", "apiKeyId", "window", "periodKey", "requestCount", "warnedAt", "expiresAt")
      VALUES ('tenant-import', 'import-multiprocess-key', 'hourly', ${period}, 20, now(), now() + interval '1 hour'),
             ('tenant-preserve', 'preserve-high-key', 'hourly', ${period}, 60, now(), now() + interval '1 hour'),
             ('tenant-pg-only', 'postgres-only-key', 'daily', '2026-09-27', 7, NULL, now() + interval '1 day')
    `);
    await redis.set(counterKey, "24", "EX", 3600);
    await redis.set(warningKey, "1", "EX", 3600);
    await redis.set(
      `quota:apikey:preserve-high-key:h:${period}`,
      "21",
      "EX",
      3600
    );

    // Simulate still-active legacy counter writers while the dry-run snapshot is taken.
    const dryRunPromise = runImporter([], {
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
    });
    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        request(index % 2 ? processA : processB, "/legacy-increment", {
          key: counterKey,
        })
      )
    );
    const dryRun = await dryRunPromise;
    expect(dryRun.code).toBe(0);
    expect(dryRun.output).toContain('"identifiers_logged":false');

    // Writer fence: no simulated old writer remains before guarded Apply.
    const frozenRedisCount = Number(await redis.get(counterKey));
    const applied = await runImporter(["--apply"], {
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      G3_QUOTA_WRITERS_PAUSED: "true",
      G3_QUOTA_IMPORT_CONFIRM: "apply-active-api-key-quotas",
    });
    expect(applied.code).toBe(0);
    expect(applied.output).toContain('"reconciliation":"passed"');

    const imported = await db.execute(sql`
      SELECT "tenantId", "requestCount", "warnedAt" FROM api_key_quota_counters
      WHERE "apiKeyId" = 'import-multiprocess-key' AND "window" = 'hourly' AND "periodKey" = ${period}
    `);
    const importedRow = rowsOf<{
      tenantId: string;
      requestCount: number;
      warnedAt: unknown;
    }>(imported)[0];
    expect(importedRow.tenantId).toBe("tenant-import");
    expect(Number(importedRow.requestCount)).toBe(frozenRedisCount);
    expect(importedRow.warnedAt).not.toBeNull();

    const preservedHigh = await db.execute(sql`
      SELECT "requestCount", "warnedAt" FROM api_key_quota_counters
      WHERE "apiKeyId" = 'preserve-high-key' AND "window" = 'hourly' AND "periodKey" = ${period}
    `);
    expect(
      Number(rowsOf<{ requestCount: number }>(preservedHigh)[0]?.requestCount)
    ).toBe(60);
    expect(
      rowsOf<{ warnedAt: unknown }>(preservedHigh)[0]?.warnedAt
    ).not.toBeNull();

    const pgOnly = await db.execute(
      sql`SELECT count(*)::int AS n FROM api_key_quota_counters WHERE "apiKeyId" = 'postgres-only-key'`
    );
    expect(Number(rowsOf<{ n: number }>(pgOnly)[0]?.n)).toBe(1);
  }, 45_000);
});
