import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../db", () => ({ getDb: () => state.db }));
import { prepareCloudflareMediaProbe } from "./cloudflareMediaProbe";
const suite = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("owned media source preparation in disposable PostgreSQL", () => {
  let disposable: Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let sql: postgres.Sql;
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    sql = postgres(disposable.databaseUrl, { max: 2 }); state.db = drizzle(sql);
    await sql.unsafe(`CREATE TABLE media_assets (id bigserial PRIMARY KEY, "tenantId" varchar(36), "userId" integer,
      status varchar(32), "storageKey" text, "originalUrl" text, "checksumSha256" varchar(64), "fileSize" bigint, "mimeType" varchar(100))`);
    vi.stubEnv("CLOUDFLARE_CONTAINER_POLICY", "on-demand"); vi.stubEnv("CLOUDFLARE_MEDIA_PROBE", "container-media-probe-v1"); vi.stubEnv("CLOUDFLARE_WORKFLOW_TENANT_ID", "tenant-a");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_EXPIRES_AT", new Date(Date.now() + 300_000).toISOString());
  }, 30_000);
  afterAll(async () => { vi.unstubAllEnvs(); if (sql) await sql.end({ timeout: 5 }); if (disposable) await disposable.close(); }, 20_000);
  async function fixture() {
    const key = `uploads/7/${randomUUID()}.wav`, url = `https://media.example.test/${key}`;
    const [asset] = await sql`INSERT INTO media_assets ("tenantId","userId",status,"storageKey","originalUrl","checksumSha256","fileSize","mimeType")
      VALUES ('tenant-a',7,'ready',${key},${url},${"a".repeat(64)},16044,'audio/wav') RETURNING id`;
    const args = [JSON.stringify({ jobId: "external-1", jobType: "probe", inputs: { assets: [{ uri: url }] } }), "7", "external-1"];
    const job = { jobId: randomUUID(), tenantId: "tenant-a", requestedByUserId: 7, runtimeType: "python_job_worker", requiredCapabilities: { runtime: "cloudflare-container", operation: "container-media-probe-v1", reason: "media-inspection-isolation" }, jobType: "python.legacy_task", executionClass: "long",
      contractVersion: "feature-186-v1", status: "running", leaseExpiresAt: new Date(Date.now() + 120_000), startedAt: new Date(), timeoutPolicyJson: { hardTimeoutMs: 90_000 }, timeoutSeconds: 90,
      input: { taskName: "app.tasks.media_job_worker.execute_media_job", taskImportPath: "app.tasks.media_job_worker.execute_media_job", args, kwargs: {}, queue: null, legacyUserId: "7" } };
    const lease = { jobId: job.jobId, attemptId: randomUUID(), leaseToken: "disposable-private-lease", fencingVersion: 1, expiresAt: job.leaseExpiresAt.toISOString() };
    return { key, url, assetId: Number(asset.id), job, lease, plane: { assertActive: vi.fn(), heartbeat: vi.fn() } };
  }
  it("resolves only the ready tenant/user asset and bounds scope by lease and hard deadline", async () => {
    const f = await fixture();
    await sql`INSERT INTO media_assets ("tenantId","userId",status,"storageKey","originalUrl","checksumSha256","fileSize","mimeType")
      VALUES ('tenant-b',7,'ready',${f.key},${f.url},${"b".repeat(64)},1,'audio/wav'),('tenant-a',8,'ready',${f.key},${f.url},${"c".repeat(64)},1,'audio/wav')`;
    f.job.leaseExpiresAt = new Date(Date.now() + 10_000);
    const result = await prepareCloudflareMediaProbe(f.job, f.lease, f.plane);
    expect(result.mediaSource).toMatchObject({ tenantId: "tenant-a", userId: 7, assetId: f.assetId, objectKey: f.key, checksumSha256: "a".repeat(64), sizeBytes: 16044 });
    expect(Date.parse(result.mediaSource.expiresAt)).toBeLessThanOrEqual(f.job.leaseExpiresAt.getTime());
    expect(f.plane.assertActive).toHaveBeenCalledTimes(2); expect(f.plane.heartbeat).toHaveBeenCalledOnce();
    f.job.input.args[0] = JSON.stringify({ jobId: "external-1", jobType: "probe", inputs: { assets: [{ uri: `r2://${f.key}` }] } });
    expect((await prepareCloudflareMediaProbe(f.job, f.lease, f.plane)).mediaSource.assetId).toBe(f.assetId);
  });
  it.each(["tenant", "actor", "pending", "checksum", "size", "mime", "path"])("rejects persisted asset %s drift", async scenario => {
    const f = await fixture();
    if (scenario === "tenant") await sql`UPDATE media_assets SET "tenantId"='tenant-b' WHERE id=${f.assetId}`;
    if (scenario === "actor") await sql`UPDATE media_assets SET "userId"=8 WHERE id=${f.assetId}`;
    if (scenario === "pending") await sql`UPDATE media_assets SET status='pending' WHERE id=${f.assetId}`;
    if (scenario === "checksum") await sql`UPDATE media_assets SET "checksumSha256"=NULL WHERE id=${f.assetId}`;
    if (scenario === "size") await sql`UPDATE media_assets SET "fileSize"=3145729 WHERE id=${f.assetId}`;
    if (scenario === "mime") await sql`UPDATE media_assets SET "mimeType"='text/html' WHERE id=${f.assetId}`;
    if (scenario === "path") await sql`UPDATE media_assets SET "storageKey"='../secrets' WHERE id=${f.assetId}`;
    await expect(prepareCloudflareMediaProbe(f.job, f.lease, f.plane)).rejects.toThrow();
  });
  it.each(["identity", "expiry", "hard-deadline", "stale", "normal-probe", "other-task", "url"])("denies %s without external fetching", async scenario => {
    const f = await fixture(), fetchSpy = vi.spyOn(globalThis, "fetch");
    if (scenario === "identity") f.job.requestedByUserId = 8;
    if (scenario === "expiry") f.job.leaseExpiresAt = new Date(0);
    if (scenario === "hard-deadline") f.job.startedAt = new Date(0);
    if (scenario === "stale") f.plane.assertActive.mockRejectedValue(new Error("JOB_LEASE_STALE"));
    if (scenario === "normal-probe") f.job.requiredCapabilities = {} as never;
    if (scenario === "other-task") f.job.input.taskImportPath = "app.tasks.arbitrary";
    if (scenario === "url") f.job.input.args[0] = JSON.stringify({ jobId: "external-1", jobType: "probe", inputs: { assets: [{ uri: "http://169.254.169.254/private" }] } });
    await expect(prepareCloudflareMediaProbe(f.job, f.lease, f.plane)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
});
