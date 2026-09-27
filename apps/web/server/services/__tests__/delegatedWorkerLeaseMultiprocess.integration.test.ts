import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";

const enabled = process.env.RUN_SPEC245_G4_MULTIPROCESS_TEST === "true";
const suite = enabled ? describe : describe.skip;
const WEB_DIR = process.cwd();
const TSX_CLI = resolve(WEB_DIR, "node_modules/tsx/dist/cli.mjs");
const HTTP_FIXTURE = resolve(
  WEB_DIR,
  "server/services/__tests__/fixtures/spec245QuotaHttpProcess.ts"
);
type WebProcess = { process: ChildProcess; port: number; pid: number };

async function startWebProcess(): Promise<WebProcess> {
  const child = spawn(process.execPath, [TSX_CLI, HTTP_FIXTURE], {
    cwd: WEB_DIR,
    env: { ...process.env, PORT: "0", DB_POOL_SIZE: "3" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", chunk => (stdout += chunk.toString()));
  child.stderr?.on("data", chunk => (stderr += chunk.toString()));
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const line = stdout
      .split(/\r?\n/)
      .find(value => value.includes('"ready":true'));
    if (line) {
      const ready = JSON.parse(line) as { port: number; pid: number };
      return { process: child, port: ready.port, pid: ready.pid };
    }
    if (child.exitCode !== null)
      throw new Error(`G4 Web process failed: ${stderr.slice(-1000)}`);
    await delay(25);
  }
  child.kill("SIGKILL");
  throw new Error(`G4 Web process readiness timeout: ${stderr.slice(-1000)}`);
}

async function stopWebProcess(
  processInfo: WebProcess | undefined
): Promise<void> {
  if (!processInfo || processInfo.process.exitCode !== null) return;
  processInfo.process.kill("SIGTERM");
  await Promise.race([
    new Promise<void>(resolveExit =>
      processInfo.process.once("exit", () => resolveExit())
    ),
    delay(2_000),
  ]);
  if (processInfo.process.exitCode === null)
    processInfo.process.kill("SIGKILL");
}

async function post(
  processInfo: WebProcess,
  path: string,
  body: Record<string, unknown>
) {
  const response = await fetch(`http://127.0.0.1:${processInfo.port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>,
  };
}

suite("G4 delegated-worker lease behavior across Web processes", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let processA: WebProcess;
  let processB: WebProcess;
  let processC: WebProcess;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith("_spec245_g3_test")
    ) {
      throw new Error(
        "G4 multi-process tests require an isolated *_spec245_g3_test database"
      );
    }
    db = getDb();
    for (const migrationName of [
      "0351_spec245_postgres_delegated_worker_leases.sql",
      "0352_spec245_delegated_worker_fencing_tokens.sql",
    ]) {
      const migration = await readFile(
        resolve(WEB_DIR, "drizzle", migrationName),
        "utf8"
      );
      const statements = migration
        .replaceAll("--> statement-breakpoint", "")
        .split(";")
        .map(statement => statement.trim())
        .filter(statement => statement && !statement.startsWith("SET LOCAL"));
      await db.transaction(async tx => {
        for (const statement of statements)
          await tx.execute(sql.raw(statement));
      });
    }
    await db.execute(sql`CREATE TABLE spec245_g4_fenced_test_commits (
      "leaseId" varchar(36) NOT NULL,
      "fencingToken" bigint NOT NULL,
      "writerPid" integer NOT NULL
    )`);
    processA = await startWebProcess();
    processB = await startWebProcess();
    processC = await startWebProcess();
    expect(new Set([processA.pid, processB.pid, processC.pid]).size).toBe(3);
  }, 30_000);

  afterAll(async () => {
    await Promise.all([processA, processB, processC].map(stopWebProcess));
    if (db) {
      await db.execute(
        sql`DROP TABLE IF EXISTS spec245_g4_fenced_test_commits`
      );
      await db.execute(
        sql`DROP TABLE IF EXISTS delegated_worker_concurrency_leases`
      );
      await db.$client.end({ timeout: 2 });
    }
  });

  it("renews an active lease and blocks a contender until the renewed expiry", async () => {
    const scopeKey = "mp-renew:tenant:worker:job:mcp_write";
    const input = { scopeKey, ttlSeconds: 2, maxSlots: 1 };
    const first = await post(processA, "/lease/acquire", {
      ...input,
      ref: "renew-owner",
    });
    expect(first.status).toBe(200);
    await delay(1_100);
    expect(
      (await post(processA, "/lease/renew", { ref: "renew-owner" })).body
        .renewed
    ).toBe(true);
    await delay(1_100);
    const held = await post(processB, "/lease/acquire", {
      ...input,
      ref: "renew-contender",
    });
    expect(held.status).toBe(429);
    await delay(1_100);
    const replacement = await post(processB, "/lease/acquire", {
      ...input,
      ref: "renew-replacement",
    });
    expect(replacement.status).toBe(200);
    expect(Number(replacement.body.fencingToken)).toBeGreaterThan(
      Number(first.body.fencingToken)
    );
    await post(processB, "/lease/release", { ref: "renew-replacement" });
  }, 15_000);

  it("fences the stale process from committing a PostgreSQL resource after a new owner acquires", async () => {
    const scopeKey = "mp-fence:tenant:worker:job:mcp_write";
    const input = { scopeKey, ttlSeconds: 2, maxSlots: 1 };
    const oldLease = await post(processA, "/lease/acquire", {
      ...input,
      ref: "old-fence-owner",
    });
    expect(oldLease.status).toBe(200);
    await delay(2_200);
    const newLease = await post(processB, "/lease/acquire", {
      ...input,
      ref: "new-fence-owner",
    });
    expect(newLease.status).toBe(200);
    expect(Number(newLease.body.fencingToken)).toBeGreaterThan(
      Number(oldLease.body.fencingToken)
    );

    const staleCommit = await post(processA, "/lease/commit", {
      ref: "old-fence-owner",
    });
    const currentCommit = await post(processB, "/lease/commit", {
      ref: "new-fence-owner",
    });
    expect(staleCommit.status).toBe(409);
    expect(staleCommit.body.committed).toBe(false);
    expect(currentCommit.status).toBe(200);
    expect(currentCommit.body.committed).toBe(true);
    const rows = await db.execute(
      sql`SELECT "fencingToken" FROM spec245_g4_fenced_test_commits`
    );
    expect(rows).toHaveLength(1);
    expect(Number((rows as any[])[0]?.fencingToken)).toBe(
      Number(newLease.body.fencingToken)
    );
    await post(processB, "/lease/release", { ref: "new-fence-owner" });
  }, 15_000);

  it("rechecks real expiry after waiting on a contended scope lock", async () => {
    const scopeKey = "mp-fence-wait:tenant:worker:job:mcp_write";
    const oldLease = await post(processA, "/lease/acquire", {
      scopeKey,
      ttlSeconds: 2,
      maxSlots: 1,
      ref: "waited-old-owner",
    });
    expect(oldLease.status).toBe(200);
    await db.execute(sql`DELETE FROM spec245_g4_fenced_test_commits`);

    let acquiredBlocker!: () => void;
    let releaseBlocker!: () => void;
    const lockAcquired = new Promise<void>(resolveLock => {
      acquiredBlocker = resolveLock;
    });
    const waitForRelease = new Promise<void>(resolveRelease => {
      releaseBlocker = resolveRelease;
    });
    const blocker = db.transaction(async tx => {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${scopeKey}, 0))
      `);
      acquiredBlocker();
      await waitForRelease;
    });
    await lockAcquired;

    const staleCommitPromise = post(processA, "/lease/commit", {
      ref: "waited-old-owner",
    });
    try {
      await delay(2_200);
    } finally {
      releaseBlocker();
      await blocker;
    }
    const staleCommit = await staleCommitPromise;
    expect(staleCommit.status).toBe(409);
    expect(staleCommit.body.committed).toBe(false);
    const rows = await db.execute(
      sql`SELECT 1 FROM spec245_g4_fenced_test_commits`
    );
    expect(rows).toHaveLength(0);
  }, 15_000);

  it("recovers a slot after its owning Web process crashes and its lease expires", async () => {
    const scopeKey = "mp-crash:tenant:worker:job:mcp_write";
    const input = { scopeKey, ttlSeconds: 2, maxSlots: 1 };
    const crashedOwner = await post(processC, "/lease/acquire", {
      ...input,
      ref: "crashed-owner",
    });
    expect(crashedOwner.status).toBe(200);
    await stopWebProcess(processC);
    const beforeExpiry = await post(processB, "/lease/acquire", {
      ...input,
      ref: "crash-contender",
    });
    expect(beforeExpiry.status).toBe(429);
    await delay(2_100);
    const recovered = await post(processB, "/lease/acquire", {
      ...input,
      ref: "recovered-owner",
    });
    expect(recovered.status).toBe(200);
    await post(processB, "/lease/release", { ref: "recovered-owner" });
  }, 15_000);
});
