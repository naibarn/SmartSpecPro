import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { is, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  verticalDramaEpisodes,
  verticalDramaEpisodeRuns,
  verticalDramaMemoryEvents,
  verticalDramaRunArtifacts,
  verticalDramaSeries,
} from "../../../drizzle/schema";
import { createSpec267NativePostgres } from "./support/spec267NativePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

const execFileAsync = promisify(execFile);
const { database } = vi.hoisted(() => ({ database: { current: null as any } }));
vi.mock("../../db", () => ({ getDb: () => {
  if (!database.current) throw new Error("Native test database is not ready");
  return database.current;
}, db: new Proxy({}, { get: (_target, property) => {
  const value = database.current?.[property as keyof typeof database.current];
  return typeof value === "function" ? value.bind(database.current) : value;
} }) }));
vi.mock("../auditLogger", () => ({ auditLogger: { log: vi.fn() } }));

const suite = process.env.RUN_NATIVE_WORKER_POSTGRES_TESTS === "true" ? describe : describe.skip;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const literal = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const dialect = new PgDialect();

async function installDomainTables(client: ReturnType<Awaited<ReturnType<typeof createSpec267NativePostgres>>["connect"]>) {
  for (const table of [verticalDramaSeries, verticalDramaEpisodes, verticalDramaEpisodeRuns,
    verticalDramaRunArtifacts, verticalDramaMemoryEvents] as PgTable[]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let definition = `${quote(column.name)} ${column.getSQLType()}`;
      if (column.primary) definition += " PRIMARY KEY";
      if (column.notNull) definition += " NOT NULL";
      if (column.default !== undefined) {
        if (is(column.default, SQL)) {
          const expression = dialect.sqlToQuery(column.default);
          if (expression.params.length) throw new Error("SPEC161_SCHEMA_DEFAULT_HAS_PARAMETERS");
          definition += ` DEFAULT ${expression.sql}`;
        } else definition += ` DEFAULT ${literal(column.mapToDriverValue(column.default))}`;
      }
      return definition;
    });
    // These scoped acceptance tables intentionally omit cross-domain FKs;
    // their columns/defaults/indexes come from the canonical Drizzle schema.
    await client.unsafe(`CREATE TABLE ${quote(config.name)} (${columns.join(", ")})`);
    for (const index of config.indexes) {
      const c = index.config;
      const names = c.columns.map(column => {
        if (is(column, SQL)) throw new Error("SPEC161_SCHEMA_EXPRESSION_INDEX_UNSUPPORTED");
        return quote(column.name);
      });
      const predicate = c.where ? dialect.sqlToQuery(c.where) : null;
      if (predicate?.params.length) throw new Error("SPEC161_SCHEMA_INDEX_HAS_PARAMETERS");
      await client.unsafe(`CREATE ${c.unique ? "UNIQUE " : ""}INDEX ${quote(c.name)} ON ${quote(config.name)} (${names.join(", ")})${predicate ? ` WHERE ${predicate.sql}` : ""}`);
    }
  }
}

suite("SPEC-161 episode worker PostgreSQL persistence/restart acceptance", () => {
  let fixture: Awaited<ReturnType<typeof createSpec267NativePostgres>> | undefined;
  let client: ReturnType<Awaited<ReturnType<typeof createSpec267NativePostgres>>["connect"]> | undefined;
  const tenantId = randomUUID();
  const userId = 161001;
  const seriesId = 161001;
  const episodeId = 161001;
  let runId: number;
  const owner = { tenantId, userId, seriesId, episodeId };
  const jobId = `spec161-${randomUUID().slice(0, 20)}`;
  const attempt = 1;
  let controlPlane: ReturnType<typeof import("../jobControlPlane").createJobControlPlane>;

  function reconnect() {
    client = fixture!.connect();
    database.current = drizzle(client);
  }

  beforeAll(async () => {
    fixture = await createSpec267NativePostgres();
    reconnect();
    vi.stubEnv("JWT_SECRET", randomUUID());
    await installSpec277AutoTeamRuntimeSchema(client!);
    await client!.unsafe(`CREATE TABLE users (id integer PRIMARY KEY)`);
    await client!.unsafe(`CREATE TABLE tenant_data_transfer_plans ("tenantId" varchar(36), "sourceUserId" integer, "operationId" varchar(36))`);
    await client!.unsafe(`CREATE TABLE tenant_identity_actions (id varchar(36) PRIMARY KEY, "userId" integer, "sourceTenantId" varchar(36), phase varchar(40))`);
    await client!`INSERT INTO users (id) VALUES (${userId})`;
    await installDomainTables(client!);
    const registration = (await import("../jobExecutorRegistry")).defaultJobExecutorRegistry.resolve("vertical_drama.episode_stage", "feature-186-v1")!;
    const [series] = await database.current.insert(verticalDramaSeries).values({
      id: seriesId, tenantId, userId, title: "SPEC-161 native persistence", locale: "en", status: "draft",
    }).returning({ id: verticalDramaSeries.id });
    expect(series.id).toBe(seriesId);
    await database.current.insert(verticalDramaEpisodes).values({
      id: episodeId, tenantId, userId, seriesId, episodeNumber: 1, episodeKind: "normal", title: "Episode 1",
    });
    const [run] = await database.current.insert(verticalDramaEpisodeRuns).values({
      tenantId, userId, seriesId, episodeId, stage: "normalize_series_input", runMode: "plan_only", status: "queued",
      nextAction: "none", artifactIds: [], warnings: [], errors: [],
    }).returning({ id: verticalDramaEpisodeRuns.id });
    runId = run.id;
    const input = { runId, owner, stage: "normalize_series_input", opts: { mode: "plan_only" } };
    const [{ createJobControlPlane }, { createFeature186VerticalDramaJob }] = await Promise.all([
      import("../jobControlPlane"), import("../feature186VerticalDramaJobAdapter"),
    ]);
    controlPlane = createJobControlPlane();
    await createFeature186VerticalDramaJob({
      jobId, tenantId, userId, jobType: "vertical_drama.episode_stage", executionClass: "long",
      payload: input, idempotencyKey: `spec161-native:${jobId}`,
    });
    // Keep the actual registration reachable to prove the canonical consumer resolves it.
    expect(registration).toBeDefined();
  }, 40_000);

  afterAll(async () => {
    database.current = null;
    await client?.end({ timeout: 2 });
    if (fixture) await fixture.close();
    vi.unstubAllEnvs();
  }, 20_000);

  it("executes the registered deterministic stage, ignores terminal redelivery, and survives a new process plus PostgreSQL restart", async () => {
    const { executeCanonicalJobEnvelope } = await import("../../jobs/unifiedJobConsumer");
    const { defaultJobExecutorRegistry } = await import("../jobExecutorRegistry");
    const first = await executeCanonicalJobEnvelope({ jobId, contractVersion: "feature-186-v1", businessAttempt: attempt }, {
      controlPlane, executorRegistry: defaultJobExecutorRegistry, runnerId: "spec161-native", adapter: "postgres-pull",
    });
    expect(first).toMatchObject({ state: "succeeded", jobId });
    expect((await controlPlane.getStatus(jobId))?.status).toBe("succeeded");
    const [run] = await client!`SELECT status, "artifactIds" FROM vertical_drama_episode_runs WHERE id = ${runId}`;
    const artifacts = await client!`SELECT id, stage, "jsonPayload", "checksumSha256" FROM vertical_drama_run_artifacts WHERE "runId" = ${runId}`;
    expect(run.status).toBe("succeeded");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].stage).toBe("normalize_series_input");
    expect(run.artifactIds).toEqual([String(artifacts[0].id)]);

    const replay = await executeCanonicalJobEnvelope({ jobId, contractVersion: "feature-186-v1", businessAttempt: attempt }, {
      controlPlane, executorRegistry: defaultJobExecutorRegistry, runnerId: "spec161-native", adapter: "postgres-pull",
    });
    expect(replay).toEqual({ state: "ignored", jobId });
    expect((await client!`SELECT count(*)::int AS count FROM vertical_drama_run_artifacts WHERE "runId" = ${runId}`)[0].count).toBe(1);

    await client!.end({ timeout: 2 });
    database.current = null;
    await fixture!.restart();
    reconnect();
    const persistedJob = await controlPlane.getStatus(jobId);
    expect(persistedJob?.status).toBe("succeeded");
    const freshControlPlane = (await import("../jobControlPlane")).createJobControlPlane();
    const replayAfterRestart = await executeCanonicalJobEnvelope({
      jobId, contractVersion: "feature-186-v1", businessAttempt: attempt,
    }, { controlPlane: freshControlPlane, executorRegistry: defaultJobExecutorRegistry,
      runnerId: "spec161-native-restarted", adapter: "postgres-pull" });
    expect(replayAfterRestart).toEqual({ state: "ignored", jobId });
    expect((await client!`SELECT count(*)::int AS count FROM vertical_drama_run_artifacts WHERE "runId" = ${runId}`)[0].count).toBe(1);
    expect((await client!`SELECT count(*)::int AS count FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`)[0].count).toBe(1);
    expect(await client!`SELECT id FROM worker_job_provider_reservations WHERE "workerJobId" = ${jobId}`).toHaveLength(0);
    const child = `import postgres from 'postgres'; const sql=postgres({host:${JSON.stringify(fixture!.socket)},database:${JSON.stringify(fixture!.database)},username:${JSON.stringify(fixture!.username)},max:1}); const rows=await sql\`SELECT r.status, r.\\"artifactIds\\", a.\\"jsonPayload\\", a.\\"checksumSha256\\", (SELECT status FROM worker_jobs WHERE id='${jobId}') AS \\"workerStatus\\" FROM vertical_drama_episode_runs r JOIN vertical_drama_run_artifacts a ON a.\\"runId\\"=r.id WHERE r.id=${runId}\`; console.log(JSON.stringify(rows)); await sql.end();`;
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", child], {
      cwd: process.cwd(), timeout: 10_000, maxBuffer: 64 * 1024,
    });
    const [afterRestart] = JSON.parse(stdout.trim());
    expect(afterRestart.status).toBe("succeeded");
    expect(afterRestart.workerStatus).toBe("succeeded");
    expect(afterRestart.artifactIds).toEqual([String(artifacts[0].id)]);
    expect(afterRestart.checksumSha256).toBe(artifacts[0].checksumSha256);
    expect(afterRestart.jsonPayload).toEqual(artifacts[0].jsonPayload);
    process.stdout.write(`${JSON.stringify({ evidence: "SPEC161_NATIVE_WORKER_SUCCESS",
      jobId, runId, artifactId: artifacts[0].id, checksumSha256: artifacts[0].checksumSha256,
      workerStatus: afterRestart.workerStatus, domainStatus: afterRestart.status,
      replayAfterRestart: replayAfterRestart.state, workerAttempts: 1, providerReservations: 0 })}\n`);
  }, 60_000);

  it("projects the special tie-in guard into both the durable domain run and worker failure", async () => {
    const { executeCanonicalJobEnvelope } = await import("../../jobs/unifiedJobConsumer");
    const { createFeature186VerticalDramaJob } = await import("../feature186VerticalDramaJobAdapter");
    const specialEpisodeId = episodeId + 1;
    const specialOwner = { ...owner, episodeId: specialEpisodeId };
    const [episode] = await database.current.insert(verticalDramaEpisodes).values({
      id: specialEpisodeId, tenantId, userId, seriesId, episodeNumber: 2,
      episodeKind: "special_tie_in", title: "Special tie-in",
    }).returning({ id: verticalDramaEpisodes.id });
    expect(episode.id).toBe(specialEpisodeId);
    const [specialRun] = await database.current.insert(verticalDramaEpisodeRuns).values({
      tenantId, userId, seriesId, episodeId: specialEpisodeId, stage: "normalize_series_input",
      runMode: "plan_only", status: "queued", nextAction: "none", artifactIds: [], warnings: [], errors: [],
    }).returning({ id: verticalDramaEpisodeRuns.id });
    const specialJobId = `spec161-${randomUUID().slice(0, 20)}`;
    await createFeature186VerticalDramaJob({
      jobId: specialJobId, tenantId, userId, jobType: "vertical_drama.episode_stage", executionClass: "long",
      payload: { runId: specialRun.id, owner: specialOwner, stage: "normalize_series_input", opts: { mode: "plan_only" } },
      idempotencyKey: `spec161-native:${specialJobId}`,
    });

    await expect(executeCanonicalJobEnvelope({
      jobId: specialJobId, contractVersion: "feature-186-v1", businessAttempt: 1,
    }, { controlPlane, executorRegistry: (await import("../jobExecutorRegistry")).defaultJobExecutorRegistry,
      runnerId: "spec161-native", adapter: "postgres-pull" })).rejects.toMatchObject({ code: "DOMAIN_EXECUTION_FAILED" });
    expect((await controlPlane.getStatus(specialJobId))?.status).toBe("failed");
    const [failedRun] = await client!`SELECT status, errors FROM vertical_drama_episode_runs WHERE id = ${specialRun.id}`;
    expect(failedRun.status).toBe("failed");
    expect(JSON.stringify(failedRun.errors)).toContain("SPECIAL_PIPELINE_ISOLATED");
    expect((await client!`SELECT count(*)::int AS count FROM vertical_drama_run_artifacts WHERE "runId" = ${specialRun.id}`)[0].count).toBe(0);
    process.stdout.write(`${JSON.stringify({ evidence: "SPEC161_NATIVE_WORKER_FAILURE",
      jobId: specialJobId, runId: specialRun.id, workerStatus: "failed", domainStatus: failedRun.status,
      errors: failedRun.errors, artifacts: 0 })}\n`);
  }, 30_000);
});
