import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

describe("SPEC-224 Codex model-call admission on isolated PostgreSQL", () => {
  const priorEnv = { DATABASE_URL: process.env.DATABASE_URL, PGHOST: process.env.PGHOST, PGPORT: process.env.PGPORT, PGUSER: process.env.PGUSER, PGPASSWORD: process.env.PGPASSWORD };
  let fixture: Awaited<ReturnType<typeof createSpec277DisposablePostgres>>;
  let client: postgres.Sql;
  let repository: Awaited<ReturnType<typeof import("../postgresProviderSchedulerRepository").createPostgresProviderSchedulerRepository>>;
  let closeDb: typeof import("../../db").closeDb;

  beforeAll(async () => {
    if (process.env.DATABASE_URL) throw new Error("SPEC224_CODEX_TEST_REFUSES_INHERITED_DATABASE_URL");
    fixture = await createSpec277DisposablePostgres();
    await fixture.assertOwned();
    client = postgres(fixture.databaseUrl, { max: 8, connect_timeout: 3 });
    await client.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await installSpec277AutoTeamRuntimeSchema(client);
    process.env.DATABASE_URL = fixture.databaseUrl;
    delete process.env.PGHOST; delete process.env.PGPORT; delete process.env.PGUSER; delete process.env.PGPASSWORD;
    process.env.SPEC224_CODEX_TOKEN_WINDOW_SECONDS = "3600";
    process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
    process.env.SPEC224_CODEX_MAX_CONCURRENT_TURNS_PER_USER = "2";
    process.env.SPEC224_CODEX_MAX_OUTPUT_TOKENS_PER_TURN = "100";
    ({ closeDb } = await import("../../db"));
    repository = (await import("../postgresProviderSchedulerRepository")).createPostgresProviderSchedulerRepository();
    await (await import("../../db")).getDb();
  });

  afterAll(async () => {
    await closeDb?.();
    await client?.end();
    await fixture?.assertOwned();
    await fixture?.close();
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    delete process.env.SPEC224_CODEX_TOKEN_WINDOW_SECONDS;
    delete process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW;
    delete process.env.SPEC224_CODEX_MAX_CONCURRENT_TURNS_PER_USER;
    delete process.env.SPEC224_CODEX_MAX_OUTPUT_TOKENS_PER_TURN;
  });

  beforeEach(async () => {
    process.env.SPEC224_CODEX_MAX_CONCURRENT_TURNS_PER_USER = "2";
    process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "100000";
    await client`DELETE FROM worker_job_provider_reservations WHERE "reservationKind" = 'model_call'`;
    await client`DELETE FROM provider_scheduler_states WHERE "providerPoolKey" = 'llm:codex_subscription:shared'`;
  });

  async function createAuthorizedDeveloperLease() {
    const runId = randomUUID();
    const jobId = randomUUID();
    const attemptId = randomUUID();
    const leaseToken = randomUUID();
    const fencingVersion = 1;
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    const tenantId = "spec224-budget-tenant";
    const actorId = 101;
    const inputJson = JSON.stringify({ developerWorkUnit: { contractVersion: "developer-fast-lane-v1", runId, workerJobId: jobId, tenantId, actorId } });
    await client.unsafe(`INSERT INTO worker_jobs (
      id, "tenantId", "requestedByUserId", "runtimeType", "jobType", status, "executionClass", "contractVersion",
      "inputJson", attempt, "maxAttempts", "leaseOwnerToken", "leaseExpiresAt", "fencingVersion"
    ) VALUES ($1, $2, $3, 'node_job_worker', 'developer.fast_lane', 'running', 'long', 'developer-fast-lane-v1',
      $4::jsonb, 1, 3, $5, $6, $7)`,
    [jobId, tenantId, actorId, inputJson, createHash("sha256").update(leaseToken).digest("hex"), expiresAt, fencingVersion]);
    await client.unsafe(`INSERT INTO worker_job_attempts (id, "workerJobId", attempt, "leaseGeneration", "leaseTokenHash", "leaseExpiresAt")
      VALUES ($1, $2, 1, $3, $4, $5)`, [attemptId, jobId, fencingVersion, createHash("sha256").update(leaseToken).digest("hex"), expiresAt]);
    return { runId, lease: { jobId, attemptId, leaseToken, fencingVersion, expiresAt } };
  }

  it("serializes reservations across WorkUnits and refuses over-reservation", async () => {
    const [left, right] = await Promise.all([createAuthorizedDeveloperLease(), createAuthorizedDeveloperLease()]);
    process.env.SPEC224_CODEX_MAX_CONCURRENT_TURNS_PER_USER = "1";
    const reserve = (runId: string, lease: typeof left.lease, modelCallId: string) => repository.reserveCodexModelCall({
      lease, runId, modelCallId, phase: "IMPLEMENT", role: "implementer", requestedModel: "gpt-6-luna",
      reasoningEffort: "medium", promptBytes: 500, now: new Date("2026-10-15T00:00:00.000Z"),
    });
    const outcomes = await Promise.all([reserve(left.runId, left.lease, "call-left"), reserve(right.runId, right.lease, "call-right")]);
    expect(outcomes.filter(item => item.kind === "reserved")).toHaveLength(1);
    expect(outcomes.filter(item => item.kind === "waiting_budget" && item.reason === "concurrent_capacity")).toHaveLength(1);
    const reservationCount = await client`SELECT count(*)::int AS count FROM worker_job_provider_reservations WHERE "reservationKind" = 'model_call'`;
    expect(reservationCount[0].count).toBe(1);
  });

  it("persists turn identity and settles usage idempotently; unknown usage stays charged", async () => {
    const { runId, lease } = await createAuthorizedDeveloperLease();
    const admitted = await repository.reserveCodexModelCall({ lease, runId, modelCallId: "call-receipt", phase: "REVIEW", role: "reviewer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 200 });
    expect(admitted.kind).toBe("reserved");
    if (admitted.kind !== "reserved") return;
    const replayBeforeDispatch = await repository.reserveCodexModelCall({ lease, runId, modelCallId: "call-receipt", phase: "REVIEW", role: "reviewer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 200 });
    expect(replayBeforeDispatch).toMatchObject({ kind: "reserved", operationKey: admitted.operationKey, replayed: true });
    expect(await repository.markCodexModelCallDispatching({ lease, operationKey: admitted.operationKey })).toEqual({ kind: "marked" });
    expect(await repository.recordCodexModelThreadIdentity({ lease, operationKey: admitted.operationKey, threadId: "thread-a" })).toEqual({ kind: "recorded" });
    expect(await repository.recordCodexModelTurnIdentity({ lease, operationKey: admitted.operationKey, threadId: "thread-a", turnId: "turn-a" })).toEqual({ kind: "recorded" });
    expect(await repository.reserveCodexModelCall({ lease, runId, modelCallId: "call-receipt", phase: "REVIEW", role: "reviewer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 200 })).toMatchObject({ kind: "reconcile_required", threadId: "thread-a", turnId: "turn-a" });
    const usage = { inputTokens: 80, cachedInputTokens: 20, outputTokens: 16, threadId: "thread-a", turnId: "turn-a", effectiveModel: "gpt-6-luna", observedAt: new Date().toISOString() };
    expect((await repository.settleCodexModelCall({ lease, runId, operationKey: admitted.operationKey, usage })).kind).toBe("settled");
    expect((await repository.settleCodexModelCall({ lease, runId, operationKey: admitted.operationKey, usage })).kind).toBe("duplicate");

    const next = await createAuthorizedDeveloperLease();
    const unknownCall = await repository.reserveCodexModelCall({ lease: next.lease, runId: next.runId, modelCallId: "call-unknown", phase: "IMPLEMENT", role: "implementer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 300 });
    expect(unknownCall.kind).toBe("reserved");
    if (unknownCall.kind !== "reserved") return;
    await repository.markCodexModelCallDispatching({ lease: next.lease, operationKey: unknownCall.operationKey });
    await repository.recordCodexModelThreadIdentity({ lease: next.lease, operationKey: unknownCall.operationKey, threadId: "thread-unknown" });
    await repository.recordCodexModelTurnIdentity({ lease: next.lease, operationKey: unknownCall.operationKey, threadId: "thread-unknown", turnId: "turn-unknown" });
    expect((await repository.settleCodexModelCall({ lease: next.lease, runId: next.runId, operationKey: unknownCall.operationKey, usage: null })).kind).toBe("unknown");
    const row = await client`SELECT "usageState", "reservationStatus", "reservedTokens" FROM worker_job_provider_reservations WHERE "operationKey" = ${unknownCall.operationKey}`;
    expect(row[0]).toMatchObject({ usageState: "unknown", reservationStatus: "unknown", reservedTokens: 400 });
    process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "500";
    const third = await createAuthorizedDeveloperLease();
    const afterUnknown = await repository.reserveCodexModelCall({ lease: third.lease, runId: third.runId, modelCallId: "call-after-unknown", phase: "IMPLEMENT", role: "implementer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 10 });
    expect(afterUnknown).toMatchObject({ kind: "waiting_budget", reason: "token_budget" });
  });

  it("denies a stale lease and preserves legacy reservation rows when applying the migration", async () => {
    const legacy = await createAuthorizedDeveloperLease();
    await client`INSERT INTO worker_job_provider_reservations ("workerJobId", "attemptId", "businessAttempt", "providerKind", "providerName", "reservationKind", "reservationStatus", "userKey", "operationKey") VALUES (${legacy.lease.jobId}, ${legacy.lease.attemptId}, 1, 'llm', 'openrouter', 'poll', 'reserved', 'legacy-user', 'legacy-poll-op')`;
    const migration = await readFile(new URL("../../../drizzle/0403_spec224_codex_model_call_admission.sql", import.meta.url), "utf8");
    for (const statement of migration.split(/--> statement-breakpoint/g).map(part => part.trim()).filter(Boolean)) await client.unsafe(statement);
    const old = await client`SELECT "reservationKind", "reservationStatus" FROM worker_job_provider_reservations WHERE "operationKey" = 'legacy-poll-op'`;
    expect(old[0]).toEqual({ reservationKind: "poll", reservationStatus: "reserved" });
    const stale = { ...legacy.lease, fencingVersion: 2 };
    const result = await repository.reserveCodexModelCall({ lease: stale, runId: legacy.runId, modelCallId: "stale", phase: "IMPLEMENT", role: "implementer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 20 });
    expect(result).toEqual({ kind: "denied", reason: "stale_lease" });
  });

  it("records usage above the estimate and admits later calls against actual usage", async () => {
    const { runId, lease } = await createAuthorizedDeveloperLease();
    process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "500";
    const admitted = await repository.reserveCodexModelCall({ lease, runId, modelCallId: "call-overrun", phase: "IMPLEMENT", role: "implementer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 1 });
    expect(admitted.kind).toBe("reserved");
    if (admitted.kind !== "reserved") return;
    await repository.markCodexModelCallDispatching({ lease, operationKey: admitted.operationKey });
    await repository.recordCodexModelThreadIdentity({ lease, operationKey: admitted.operationKey, threadId: "thread-overrun" });
    await repository.recordCodexModelTurnIdentity({ lease, operationKey: admitted.operationKey, threadId: "thread-overrun", turnId: "turn-overrun" });
    const usage = { inputTokens: 420, cachedInputTokens: 0, outputTokens: 120, threadId: "thread-overrun", turnId: "turn-overrun", effectiveModel: "gpt-6-luna", observedAt: new Date().toISOString() };
    expect(await repository.settleCodexModelCall({ lease, runId, operationKey: admitted.operationKey, usage })).toMatchObject({ kind: "settled", chargedTokens: 540, overrunTokens: 439 });
    const receipt = await client`SELECT "usageReceiptJson" FROM worker_job_provider_reservations WHERE "operationKey" = ${admitted.operationKey}`;
    expect(receipt[0].usageReceiptJson).toMatchObject({
      reservationEstimateTokens: 101,
      actualTotalTokens: 540,
      overrunTokens: 439,
      reservationBasis: "utf8_prompt_bytes_plus_configured_output_allowance",
    });
    const overrunEvent = await client`SELECT "payloadJson" FROM worker_job_events WHERE "workerJobId" = ${lease.jobId} AND "eventType" = 'CODEX_MODEL_BUDGET_OVERRUN'`;
    expect(overrunEvent[0].payloadJson).toMatchObject({ actualTokens: 540, overrunTokens: 439, nextAdmissionUsesActualUsage: true });

    const next = await createAuthorizedDeveloperLease();
    const blocked = await repository.reserveCodexModelCall({ lease: next.lease, runId: next.runId, modelCallId: "call-after-overrun", phase: "IMPLEMENT", role: "implementer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 1 });
    expect(blocked).toMatchObject({ kind: "waiting_budget", reason: "token_budget" });
  });
});
