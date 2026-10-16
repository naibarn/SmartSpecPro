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
    await client.unsafe('CREATE TABLE users (id integer PRIMARY KEY, role text, "currentTenantId" text)');
    await client`INSERT INTO users VALUES (101, 'admin', 'spec224-budget-tenant')`;
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
    process.env.SPEC224_CODEX_MAX_OUTPUT_TOKENS_PER_TURN = "100";
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
  function receiptDigest(value: unknown): string {
    const stable = (item: any): string => item && typeof item === "object"
      ? Array.isArray(item) ? `[${item.map(stable).join(",")}]`
        : `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${stable(item[key])}`).join(",")}}`
      : JSON.stringify(item);
    return createHash("sha256").update(stable(value)).digest("hex");
  }

  async function settledUnderreportedTurn() {
    const { runId, lease } = await createAuthorizedDeveloperLease();
    process.env.SPEC224_CODEX_MAX_OUTPUT_TOKENS_PER_TURN = "2048";
    const admitted = await repository.reserveCodexModelCall({ lease, runId, modelCallId: "reported-live-discrepancy",
      phase: "PLAN", role: "planner", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 7893 });
    if (admitted.kind !== "reserved") throw new Error("TEST_RESERVATION_REQUIRED");
    const operationKey = admitted.operationKey;
    await repository.markCodexModelCallDispatching({ lease, operationKey });
    await repository.recordCodexModelThreadIdentity({ lease, operationKey, threadId: "original-thread" });
    await repository.recordCodexModelTurnIdentity({ lease, operationKey, threadId: "original-thread", turnId: "original-turn" });
    const originalUsage = { inputTokens: 18510, cachedInputTokens: 18176, outputTokens: 59,
      threadId: "original-thread", turnId: "original-turn", effectiveModel: null, observedAt: new Date().toISOString() };
    expect(await repository.settleCodexModelCall({ lease, runId, operationKey, usage: originalUsage })).toMatchObject({ kind: "settled", chargedTokens: 18569 });
    const [original] = await client`SELECT * FROM worker_job_provider_reservations WHERE "operationKey" = ${operationKey}`;
    const correction = { lease, runId, operationKey, correctionId: "verified-full-turn-omission",
      expectedReceiptSha256: receiptDigest(original.usageReceiptJson), expectedChargedTokens: 18569,
      usage: { ...originalUsage, inputTokens: 36933, cachedInputTokens: 18176, outputTokens: 122 },
      authorization: { actorId: 101, tenantId: "spec224-budget-tenant", reference: "owner-approved-accounting-repair",
        providerEvidenceSha256: "e".repeat(64) } };
    return { runId, lease, operationKey, original, originalUsage, correction };
  }

  it("corrects the 37055 vs 18569 omission atomically without rewriting historical receipts", async () => {
    const { lease, runId, operationKey, original, originalUsage, correction } = await settledUnderreportedTurn();
    const [beforeEvent] = await client`SELECT "payloadJson" FROM worker_job_events WHERE "workerJobId" = ${lease.jobId} AND "eventType" = 'CODEX_MODEL_USAGE_SETTLED'`;
    const outcomes = await Promise.all([repository.correctCodexModelUsage(correction), repository.correctCodexModelUsage(correction)]);
    expect(outcomes.map(item => item.kind).sort()).toEqual(["corrected", "duplicate"]);
    expect(outcomes).toEqual(expect.arrayContaining([
      { kind: "corrected", operationKey, chargedTokens: 37055, additionalTokens: 18486 },
      { kind: "duplicate", operationKey, chargedTokens: 37055, additionalTokens: 18486 },
    ]));
    const [after] = await client`SELECT * FROM worker_job_provider_reservations WHERE "operationKey" = ${operationKey}`;
    expect(after).toMatchObject({ inputTokens: 36933, cachedInputTokens: 18176, outputTokens: 122,
      threadId: original.threadId, turnId: original.turnId, usageState: "known", reservationStatus: "released",
      tokenWindowStartedAt: original.tokenWindowStartedAt, usageReceiptJson: original.usageReceiptJson });
    const settled = await client`SELECT "payloadJson" FROM worker_job_events WHERE "workerJobId" = ${lease.jobId} AND "eventType" = 'CODEX_MODEL_USAGE_SETTLED'`;
    expect(settled).toHaveLength(1);
    expect(settled[0].payloadJson).toEqual(beforeEvent.payloadJson);
    const corrected = await client`SELECT "payloadJson" FROM worker_job_events WHERE "workerJobId" = ${lease.jobId} AND "eventType" = 'CODEX_MODEL_USAGE_CORRECTED'`;
    expect(corrected).toHaveLength(1);
    expect(corrected[0].payloadJson).toMatchObject({ additionalCharge: 18486, chargedTokens: 37055, overrunTokens: 27114,
      originalReceiptSha256: correction.expectedReceiptSha256, operator: correction.authorization });
    expect(JSON.stringify(corrected)).not.toContain(lease.leaseToken);
    // Original replay returns the corrected projection; changed settled receipts still conflict.
    expect(await repository.settleCodexModelCall({ lease, runId, operationKey, usage: originalUsage })).toMatchObject({ kind: "duplicate", chargedTokens: 37055 });
    expect(await repository.settleCodexModelCall({ lease, runId, operationKey, usage: correction.usage, reconcile: true })).toEqual({ kind: "denied", reason: "receipt_conflict" });
    expect(await repository.correctCodexModelUsage({ ...correction, correctionId: "another-key" })).toEqual({ kind: "denied", reason: "receipt_conflict" });
    process.env.SPEC224_CODEX_MAX_TOKENS_PER_WINDOW = "25000";
    const next = await createAuthorizedDeveloperLease();
    expect(await repository.reserveCodexModelCall({ lease: next.lease, runId: next.runId, modelCallId: "after-correction",
      phase: "IMPLEMENT", role: "implementer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 1 }))
      .toMatchObject({ kind: "waiting_budget", reason: "token_budget" });
  });

  it("denies unauthorized, stale, mismatched and downward corrections without mutating accounting", async () => {
    const { lease, operationKey, original, correction } = await settledUnderreportedTurn();
    const cases = [
      { ...correction, lease: { ...lease, fencingVersion: 2 } },
      { ...correction, lease: { ...lease, leaseToken: "wrong-lease" } },
      { ...correction, lease: { ...lease, attemptId: randomUUID() } },
      { ...correction, now: new Date(Date.parse(lease.expiresAt) + 1) },
      { ...correction, runId: randomUUID() },
      { ...correction, authorization: { ...correction.authorization, actorId: 102 } },
      { ...correction, authorization: { ...correction.authorization, tenantId: "other-tenant" } },
      { ...correction, authorization: { ...correction.authorization, reference: "" } },
      { ...correction, expectedReceiptSha256: "f".repeat(64) },
      { ...correction, expectedChargedTokens: 0 },
      { ...correction, usage: { ...correction.usage, turnId: "replacement-turn" } },
      { ...correction, usage: { ...correction.usage, inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } },
      { ...correction, usage: { ...correction.usage, cachedInputTokens: 999999 } },
    ];
    for (const input of cases) expect((await repository.correctCodexModelUsage(input)).kind).toBe("denied");
    const [after] = await client`SELECT * FROM worker_job_provider_reservations WHERE "operationKey" = ${operationKey}`;
    expect(after).toEqual(original);
    const events = await client`SELECT * FROM worker_job_events WHERE "workerJobId" = ${lease.jobId} AND "eventType" = 'CODEX_MODEL_USAGE_CORRECTED'`;
    expect(events).toHaveLength(0);
  });

  it("allows a fresh fenced attempt to reconcile the same settled turn and rejects conflicting replay", async () => {
    const { lease: oldLease, correction } = await settledUnderreportedTurn();
    const lease = { ...oldLease, attemptId: randomUUID(), fencingVersion: 2, leaseToken: randomUUID() };
    await client`UPDATE worker_jobs SET attempt=2, "fencingVersion"=2, "leaseOwnerToken"=${createHash("sha256").update(lease.leaseToken).digest("hex")} WHERE id=${lease.jobId}`;
    await client`INSERT INTO worker_job_attempts (id, "workerJobId", attempt, "leaseGeneration", "leaseTokenHash", "leaseExpiresAt")
      VALUES (${lease.attemptId}, ${lease.jobId}, 2, 2, ${createHash("sha256").update(lease.leaseToken).digest("hex")}, ${lease.expiresAt})`;
    expect(await repository.correctCodexModelUsage(correction)).toEqual({ kind: "denied", reason: "stale_lease" });
    expect(await repository.correctCodexModelUsage({ ...correction, lease })).toMatchObject({ kind: "corrected", additionalTokens: 18486 });
    expect(await repository.correctCodexModelUsage({ ...correction, lease })).toMatchObject({ kind: "duplicate", chargedTokens: 37055 });
    expect(await repository.correctCodexModelUsage({ ...correction, lease, usage: { ...correction.usage, outputTokens: 123 } })).toEqual({ kind: "denied", reason: "receipt_conflict" });
  });

  it("does not turn unknown usage into a known zero or a fabricated correction", async () => {
    const { lease, runId, operationKey, correction } = await settledUnderreportedTurn();
    const unknown = await repository.reserveCodexModelCall({ lease, runId, modelCallId: "unknown-evidence",
      phase: "REVIEW", role: "reviewer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 30 });
    if (unknown.kind !== "reserved") throw new Error("TEST_RESERVATION_REQUIRED");
    await repository.markCodexModelCallDispatching({ lease, operationKey: unknown.operationKey });
    await repository.recordCodexModelThreadIdentity({ lease, operationKey: unknown.operationKey, threadId: "unknown-thread" });
    await repository.recordCodexModelTurnIdentity({ lease, operationKey: unknown.operationKey, threadId: "unknown-thread", turnId: "unknown-turn" });
    await repository.settleCodexModelCall({ lease, runId, operationKey: unknown.operationKey, usage: null });
    expect(await repository.correctCodexModelUsage({ ...correction, operationKey: unknown.operationKey,
      usage: { ...correction.usage, threadId: "unknown-thread", turnId: "unknown-turn" } }))
      .toEqual({ kind: "denied", reason: "receipt_conflict" });
    const [row] = await client`SELECT "usageState", "reservationStatus", "reservedTokens", "usageReceiptJson" FROM worker_job_provider_reservations WHERE "operationKey"=${unknown.operationKey}`;
    expect(row).toEqual({ usageState: "unknown", reservationStatus: "unknown", reservedTokens: 2078, usageReceiptJson: null });
    expect(operationKey).not.toBe(unknown.operationKey);
  });

  it("audits a terminal Job correction with real persisted Admin and final fence without reopening execution", async () => {
    const { lease, runId, operationKey, correction } = await settledUnderreportedTurn();
    const { lease: _oldExecutionLease, ...base } = correction;
    const terminalAuthority = { jobId: lease.jobId, attemptId: lease.attemptId, fencingVersion: lease.fencingVersion, status: "expired" as const };
    expect(await repository.correctCodexModelUsage({ ...base, terminalAuthority })).toEqual({ kind: "denied", reason: "stale_lease" });
    await client`UPDATE worker_jobs SET status='expired', "leaseOwnerToken"=NULL, "leaseExpiresAt"=NULL, "finishedAt"=NOW() WHERE id=${lease.jobId}`;
    const [before] = await client`SELECT * FROM worker_jobs WHERE id=${lease.jobId}`;
    expect(await repository.correctCodexModelUsage({ ...base, terminalAuthority: { ...terminalAuthority, fencingVersion: 2 } })).toEqual({ kind: "denied", reason: "stale_lease" });
    expect(await repository.correctCodexModelUsage({ ...base, terminalAuthority: { ...terminalAuthority, attemptId: randomUUID() } })).toEqual({ kind: "denied", reason: "stale_lease" });
    await client`UPDATE users SET role='user' WHERE id=101`;
    expect(await repository.correctCodexModelUsage({ ...base, terminalAuthority })).toEqual({ kind: "denied", reason: "authorization" });
    await client`UPDATE users SET role='admin' WHERE id=101`;
    expect(await repository.correctCodexModelUsage({ ...base, terminalAuthority })).toMatchObject({ kind: "corrected", chargedTokens: 37055, additionalTokens: 18486 });
    expect(await repository.correctCodexModelUsage({ ...base, terminalAuthority })).toMatchObject({ kind: "duplicate", chargedTokens: 37055 });
    const [after] = await client`SELECT * FROM worker_jobs WHERE id=${lease.jobId}`;
    expect(after).toEqual(before);
    const events = await client`SELECT "payloadJson" FROM worker_job_events WHERE "workerJobId"=${lease.jobId} AND "eventType"='CODEX_MODEL_USAGE_CORRECTED'`;
    expect(events).toHaveLength(1);
    expect(events[0].payloadJson).toMatchObject({ authorityMode: "terminal_admin_accounting_only", jobStatus: "expired", additionalCharge: 18486 });
    const [projection] = await client`SELECT "inputTokens", "outputTokens", "usageReceiptJson" FROM worker_job_provider_reservations WHERE "operationKey"=${operationKey}`;
    expect(projection.inputTokens + projection.outputTokens).toBe(37055);
    expect(projection.usageReceiptJson.actualTotalTokens).toBe(18569);
    expect(await repository.reserveCodexModelCall({ lease, runId, modelCallId: "terminal-must-not-dispatch", phase: "IMPLEMENT",
      role: "implementer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 1 }))
      .toEqual({ kind: "denied", reason: "stale_lease" });
  });

});
