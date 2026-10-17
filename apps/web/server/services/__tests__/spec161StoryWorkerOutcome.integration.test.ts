import { createHash, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSpec267NativePostgres } from "./support/spec267NativePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

const { database, storyExecutor } = vi.hoisted(() => ({
  database: { current: null as any },
  storyExecutor: { execute: null as null | ((...args: any[]) => Promise<unknown>), calls: 0 },
}));

const suite = process.env.RUN_NATIVE_WORKER_POSTGRES_TESTS === "true" ? describe : describe.skip;

suite("SPEC-161 vertical drama story worker outcome projection", () => {
  let fixture: Awaited<ReturnType<typeof createSpec267NativePostgres>> | undefined;
  let client: ReturnType<Awaited<ReturnType<typeof createSpec267NativePostgres>>["connect"]> | undefined;
  let controlPlane: ReturnType<typeof import("../jobControlPlane").createJobControlPlane>;
  const tenantId = randomUUID();
  const userId = 161017;
  const seriesId = 161017;

  beforeAll(async () => {
    vi.doMock("../../db", () => ({
      getDb: () => {
        if (!database.current) throw new Error("Native test database is not ready");
        return database.current;
      },
      db: new Proxy({}, { get: (_target, property) => {
        const value = database.current?.[property as keyof typeof database.current];
        return typeof value === "function" ? value.bind(database.current) : value;
      } }),
    }));
    vi.doMock("../auditLogger", () => ({ auditLogger: { log: vi.fn() } }));
    vi.doMock("../notificationService", () => ({ createNotification: vi.fn() }));
    vi.doMock("../../routers/verticalDramaSeries", () => ({
      runVerticalDramaStoryJobExecutor: (...args: any[]) => {
        storyExecutor.calls += 1;
        if (!storyExecutor.execute) throw new Error("SPEC161_TEST_STORY_EXECUTOR_UNSET");
        return storyExecutor.execute(...args);
      },
    }));
    fixture = await createSpec267NativePostgres();
    client = fixture.connect();
    database.current = drizzle(client);
    vi.stubEnv("JWT_SECRET", randomUUID());
    await installSpec277AutoTeamRuntimeSchema(client);
    await client.unsafe(`CREATE TABLE users (id integer PRIMARY KEY)`);
    await client.unsafe(`CREATE TABLE tenant_data_transfer_plans ("tenantId" varchar(36), "sourceUserId" integer, "operationId" varchar(36))`);
    await client.unsafe(`CREATE TABLE tenant_identity_actions (id varchar(36) PRIMARY KEY, "userId" integer, "sourceTenantId" varchar(36), phase varchar(40))`);
    await client.unsafe(`CREATE TABLE runtime_ephemeral_values (
      "namespace" varchar(100) NOT NULL, "key_hash" varchar(64) NOT NULL, value jsonb NOT NULL,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("namespace", "key_hash"))`);
    await client`INSERT INTO users (id) VALUES (${userId})`;
    controlPlane = (await import("../jobControlPlane")).createJobControlPlane();
  }, 40_000);

  afterAll(async () => {
    database.current = null;
    await client?.end({ timeout: 2 });
    if (fixture) await fixture.close();
    vi.unstubAllEnvs();
    vi.doUnmock("../../db");
    vi.doUnmock("../auditLogger");
    vi.doUnmock("../notificationService");
    vi.doUnmock("../../routers/verticalDramaSeries");
    vi.resetModules();
  }, 20_000);

  async function enqueueStoryJob() {
    const { enqueueVerticalDramaStoryJob } = await import("../verticalDramaStoryJobs");
    return enqueueVerticalDramaStoryJob({
      tenantId,
      userId,
      seriesId,
      kind: "improve_script",
      input: { episodeId: 1 },
    });
  }

  async function execute(jobId: string) {
    const { executeCanonicalJobEnvelope } = await import("../../jobs/unifiedJobConsumer");
    const { defaultJobExecutorRegistry } = await import("../jobExecutorRegistry");
    return executeCanonicalJobEnvelope({ jobId, contractVersion: "feature-186-v1", businessAttempt: 1 }, {
      controlPlane,
      executorRegistry: defaultJobExecutorRegistry,
      runnerId: "spec161-story-outcome-native",
      adapter: "postgres-pull",
    });
  }

  async function expectNoProviderReservation(jobId: string) {
    const reservations = await client!`SELECT id FROM worker_job_provider_reservations WHERE "workerJobId" = ${jobId}`;
    expect(reservations).toHaveLength(0);
  }

  async function expectForeignStoryOwnerRejected(
    label: string,
    domainOwner: { tenantId: string; userId: number; seriesId: number },
  ) {
    const jobId = `spec161-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const now = new Date().toISOString();
    const domainRecord = {
      jobId,
      kind: "improve_script",
      tenantId: domainOwner.tenantId,
      userId: domainOwner.userId,
      seriesId: domainOwner.seriesId,
      input: { episodeId: 1 },
      status: "queued",
      progress: null,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      dispatchId: randomUUID(),
    };
    const keyHash = createHash("sha256").update(`vd:story-job:${jobId}`).digest("hex");
    await client!`
      INSERT INTO runtime_ephemeral_values ("namespace", key_hash, value, expires_at)
      VALUES ('vd-story-jobs', ${keyHash}, ${JSON.stringify(domainRecord)}::jsonb, now() + interval '1 hour')`;
    const { createFeature186VerticalDramaJob } = await import("../feature186VerticalDramaJobAdapter");
    await createFeature186VerticalDramaJob({
      jobId,
      tenantId,
      userId,
      jobType: "vertical_drama.story",
      executionClass: "long",
      payload: { jobId, tenantId, userId, seriesId, kind: "improve_script", input: {} },
    });

    storyExecutor.calls = 0;
    storyExecutor.execute = async () => ({ accepted: true });
    await expect(execute(jobId)).rejects.toThrow("status=missing");
    expect((await controlPlane.getStatus(jobId))?.status).toBe("failed");
    expect(storyExecutor.calls).toBe(0);
    const [stored] = await client!`SELECT value FROM runtime_ephemeral_values WHERE "namespace" = 'vd-story-jobs' AND key_hash = ${keyHash}`;
    expect(stored.value).toMatchObject({
      status: "queued",
      tenantId: domainOwner.tenantId,
      userId: domainOwner.userId,
      seriesId: domainOwner.seriesId,
    });
    expect((await client!`SELECT count(*)::int AS count FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`)[0].count).toBe(1);
    await expectNoProviderReservation(jobId);
    process.stdout.write(`${JSON.stringify({ evidence: "SPEC161_STORY_OWNER_REJECTED", label, jobId,
      workerStatus: (await controlPlane.getStatus(jobId))?.status, storyRecordStatus: stored.value.status,
      executorCalls: storyExecutor.calls, workerAttempts: 1, providerReservations: 0 })}\n`);
  }

  it("keeps a successful domain result when canonical status is still running during executor finalization", async () => {
    storyExecutor.calls = 0;
    storyExecutor.execute = async () => ({ accepted: true, resultId: "deterministic-test-result" });
    const { jobId } = await enqueueStoryJob();
    const result = await execute(jobId);

    expect(result).toMatchObject({ state: "succeeded", jobId });
    expect((await controlPlane.getStatus(jobId))?.status).toBe("succeeded");
    expect(storyExecutor.calls).toBe(1);
    const domain = await (await import("../verticalDramaStoryJobs")).getVerticalDramaStoryJobStatus(jobId, { tenantId, seriesId });
    expect(domain).toMatchObject({ status: "succeeded", result: { accepted: true, resultId: "deterministic-test-result" }, error: null });
    const replay = await execute(jobId);
    expect(replay).toEqual({ state: "ignored", jobId });
    expect(storyExecutor.calls).toBe(1);
    expect((await client!`SELECT count(*)::int AS count FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`)[0].count).toBe(1);
    await expectNoProviderReservation(jobId);
    process.stdout.write(`${JSON.stringify({ evidence: "SPEC161_STORY_OUTCOME_SUCCESS", jobId,
      workerStatus: (await controlPlane.getStatus(jobId))?.status,
      domainStatus: domain?.status, replay: replay.state, executorCalls: storyExecutor.calls,
      workerAttempts: 1, providerReservations: 0, resultId: "deterministic-test-result" })}\n`);
  }, 30_000);

  it("projects a domain failure and checkpoint into canonical failure", async () => {
    storyExecutor.calls = 0;
    storyExecutor.execute = async (_input, _progress, resume) => {
      await resume.persistCheckpointAndWait({
        draftedItems: [{ episodeNumber: 1, text: "partial" }],
        completedEpisodeNumbers: [],
        chunkSizesDone: [],
        creditsUsed: 0,
        updatedAt: new Date().toISOString(),
      });
      throw new Error("SPEC161_STORY_EXECUTOR_FAILURE");
    };
    const { jobId } = await enqueueStoryJob();
    await expect(execute(jobId)).rejects.toThrow("SPEC161_STORY_EXECUTOR_FAILURE");
    expect((await controlPlane.getStatus(jobId))?.status).toBe("failed");
    expect(storyExecutor.calls).toBe(1);
    const domain = await (await import("../verticalDramaStoryJobs")).getVerticalDramaStoryJobStatus(jobId, { tenantId, seriesId });
    expect(domain?.status).toBe("failed");
    expect(domain?.error).toContain("SPEC161_STORY_EXECUTOR_FAILURE");
    expect(domain?.checkpoint?.draftedItems).toEqual([{ episodeNumber: 1, text: "partial" }]);
    expect((await client!`SELECT count(*)::int AS count FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`)[0].count).toBe(1);
    await expectNoProviderReservation(jobId);
    process.stdout.write(`${JSON.stringify({ evidence: "SPEC161_STORY_OUTCOME_FAILURE", jobId,
      workerStatus: (await controlPlane.getStatus(jobId))?.status, domainStatus: domain?.status,
      error: "SPEC161_STORY_EXECUTOR_FAILURE", checkpointItems: domain?.checkpoint?.draftedItems?.length ?? 0,
      executorCalls: storyExecutor.calls, workerAttempts: 1, providerReservations: 0 })}\n`);
  }, 30_000);

  it("fails closed if canonical input references a missing story-domain record", async () => {
    storyExecutor.calls = 0;
    const missingJobId = `spec161-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const { createFeature186VerticalDramaJob } = await import("../feature186VerticalDramaJobAdapter");
    await createFeature186VerticalDramaJob({
      jobId: missingJobId,
      tenantId,
      userId,
      jobType: "vertical_drama.story",
      executionClass: "long",
      payload: { jobId: missingJobId, tenantId, userId, seriesId, kind: "improve_script", input: {} },
    });

    await expect(execute(missingJobId)).rejects.toThrow("status=missing");
    expect((await controlPlane.getStatus(missingJobId))?.status).toBe("failed");
    expect(storyExecutor.calls).toBe(0);
    expect((await client!`SELECT count(*)::int AS count FROM worker_job_attempts WHERE "workerJobId" = ${missingJobId}`)[0].count).toBe(1);
    await expectNoProviderReservation(missingJobId);
    process.stdout.write(`${JSON.stringify({ evidence: "SPEC161_STORY_OUTCOME_MISSING_FAIL_CLOSED", jobId: missingJobId,
      workerStatus: (await controlPlane.getStatus(missingJobId))?.status, executorCalls: storyExecutor.calls,
      workerAttempts: 1, providerReservations: 0 })}\n`);
  }, 30_000);

  it("rejects a story row owned by a foreign tenant before executor side effects", async () => {
    await expectForeignStoryOwnerRejected("foreign_tenant", {
      tenantId: randomUUID(),
      userId,
      seriesId,
    });
  }, 30_000);

  it("rejects a story row for another series before executor side effects", async () => {
    await expectForeignStoryOwnerRejected("foreign_series", {
      tenantId,
      userId,
      seriesId: seriesId + 1,
    });
  }, 30_000);

  it("rejects a story row owned by another user before executor side effects", async () => {
    await expectForeignStoryOwnerRejected("foreign_user", {
      tenantId,
      userId: userId + 1,
      seriesId,
    });
  }, 30_000);
});
