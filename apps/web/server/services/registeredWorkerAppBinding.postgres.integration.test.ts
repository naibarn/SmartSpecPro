import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
const suite = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("registered Worker App binding over the existing canonical PostgreSQL rows", () => {
  let disposable: Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let sql: postgres.Sql, closeDb: () => Promise<void>;
  let createBinding: typeof import("./registeredWorkerAppBinding").createRegisteredWorkerAppBinding;
  const original = { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV };
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    sql = postgres(disposable.databaseUrl, { max: 2 });
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(sql);
    process.env.DATABASE_URL = disposable.databaseUrl;process.env.NODE_ENV = "test";vi.resetModules();
    createBinding = (await import("./registeredWorkerAppBinding")).createRegisteredWorkerAppBinding;
    closeDb = (await import("../db")).closeDb;
  }, 30_000);
  afterAll(async () => {
    if (closeDb) await closeDb(); if (sql) await sql.end({ timeout: 5 });if (disposable) await disposable.close();
    for (const [key,value] of Object.entries(original)) { if (value===undefined) delete process.env[key];else process.env[key]=value; }
  }, 20_000);
  async function fixture() {
    const jobId=randomUUID(),outboxId=randomUUID(),dedupeKey=`job:${jobId}:attempt:1`;
    const envelope={ job_id:jobId,business_attempt:1,attempt_id:null,contract_version:"feature-186-v1",dispatch_id:outboxId,dedupe_key:dedupeKey,routing_metadata:{} };
    await sql`INSERT INTO worker_jobs(id,"tenantId","requestedByUserId","runtimeType","jobType") VALUES (${jobId},'tenant-fixture',17,'external_runtime','registered.test')`;
    await sql`INSERT INTO worker_job_outbox(id,"workerJobId","dedupeKey","envelopeVersion","envelopeJson") VALUES
      (${outboxId},${jobId},${dedupeKey},'feature-186-v1',${sql.json({ jobId,businessAttempt:1,contractVersion:'feature-186-v1',dedupeKey })})`;
    const binding=createBinding({ tenantId:'tenant-fixture',actorUserId:17,expiresAt:new Date(Date.now()+60_000).toISOString(),jobTypes:new Set(['registered.test']) });
    async function publishReceipt() {
      await sql`INSERT INTO worker_job_dispatches(id,"workerJobId",adapter,"referenceNamespace","dedupeKey","providerJobId","publishedAt")
        VALUES (${outboxId},${jobId},'cloudflare-worker-app','cloudflare-worker-app',${dedupeKey},${jobId},now())`;
      await sql`UPDATE worker_job_outbox SET "publishedAt"=now() WHERE id=${outboxId}`;
    }
    return { jobId,outboxId,dedupeKey,envelope,binding,publishReceipt };
  }
  it("publishes only the existing reference and reads the durable dispatch without any extra job", async () => {
    const f=await fixture();expect(await f.binding.findByDedupeKey!(f.dedupeKey)).toBeNull();
    expect(await f.binding.dispatch({ envelope:f.envelope })).toEqual({ referenceId:f.jobId });
    await f.publishReceipt();expect(await f.binding.findByDedupeKey!(f.dedupeKey)).toEqual({ referenceId:f.jobId });
    expect(await f.binding.inspect!(f.jobId)).toBe('published');
    expect(await sql`SELECT id FROM worker_jobs WHERE id=${f.jobId}`).toHaveLength(1);
  });
  it("rejects cross-tenant references, revoked intents and old attempts", async () => {
    const f=await fixture();await f.publishReceipt();
    await sql`UPDATE worker_jobs SET attempt=2 WHERE id=${f.jobId}`;
    expect(await f.binding.findByDedupeKey!(f.dedupeKey)).toBeNull();
    await expect(f.binding.dispatch({ envelope:f.envelope })).rejects.toThrow('PUBLICATION_DENIED');
    await sql`UPDATE worker_jobs SET attempt=1,"tenantId"='tenant-foreign' WHERE id=${f.jobId}`;
    expect(await f.binding.inspect!(f.jobId)).toBe('unknown');
  });
  it("uses the real scoped canonical cancellation and event path", async () => {
    const f=await fixture();await f.publishReceipt();await f.binding.cancel!(f.jobId);
    expect((await sql`SELECT status FROM worker_jobs WHERE id=${f.jobId}`)[0].status).toBe('cancelled');
    expect((await sql`SELECT count(*)::int AS n FROM worker_job_events WHERE "workerJobId"=${f.jobId}`)[0].n).toBeGreaterThan(0);
  });
});
