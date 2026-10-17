import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";

// Rehearse historical migrations rather than projecting today's schema.
describe("SPEC-224 historical provider reservation upgrade", () => {
  let fixture: Awaited<ReturnType<typeof createSpec277DisposablePostgres>>;
  let client: postgres.Sql;
  const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), "utf8");

  beforeAll(async () => {
    if (process.env.DATABASE_URL) throw new Error("SPEC224_MIGRATION_TEST_REFUSES_INHERITED_DATABASE_URL");
    fixture = await createSpec277DisposablePostgres();
    await fixture.assertOwned();
    client = postgres(fixture.databaseUrl, { max: 1, onnotice: () => {} });
    await client.unsafe('CREATE TABLE worker_jobs (id varchar(36) PRIMARY KEY, attempt integer NOT NULL)');
    await client.unsafe('CREATE TABLE worker_job_attempts (id varchar(36) PRIMARY KEY, "workerJobId" varchar(36), attempt integer)');
    const original = await migration("0325_feature_186_provider_admission_polling.sql");
    for (const statement of original.split("--> statement-breakpoint")) {
      if (/CREATE TABLE IF NOT EXISTS "worker_job_provider_reservations"/.test(statement)
        || /ON "worker_job_provider_reservations"/.test(statement)) await client.unsafe(statement);
    }
    await client.unsafe(await migration("0326_feature_186_provider_attempt_windows.sql"));
    await client`INSERT INTO worker_jobs VALUES ('job-a', 1)`;
    await client`INSERT INTO worker_job_attempts VALUES ('attempt-a', 'job-a', 1)`;
    await client`INSERT INTO worker_job_provider_reservations
      (id, "workerJobId", "attemptId", "providerKind", "providerName", "reservationKind", "operationKey")
      VALUES ('legacy', 'job-a', 'attempt-a', 'llm', 'codex', 'running', 'legacy-op')`;
    await client.unsafe(await migration("0403_spec224_codex_model_call_admission.sql"));
    const repair = await migration("0404_spec224_legacy_reservation_kind_guard.sql");
    await client.unsafe(`BEGIN; ${repair} ROLLBACK;`);
    const retained = await client`SELECT conname FROM pg_constraint WHERE conrelid='worker_job_provider_reservations'::regclass AND conname='worker_job_provider_reservations_reservationKind_check'`;
    expect(retained).toHaveLength(1);
    await client.unsafe(await migration("0404_spec224_legacy_reservation_kind_guard.sql"));
    await client.unsafe(await migration("0404_spec224_legacy_reservation_kind_guard.sql"));
  }, 30000);

  afterAll(async () => {
    await client?.end();
    await fixture?.assertOwned();
    await fixture?.close();
  });

  it("preserves old reservations and their uniqueness", async () => {
    const [row] = await client`SELECT id, "operationKey", "reservationKind", "businessAttempt", "usageState" FROM worker_job_provider_reservations WHERE id='legacy'`;
    expect(row).toEqual({ id: "legacy", operationKey: "legacy-op", reservationKind: "running", businessAttempt: 1, usageState: null });
    await expect(client`INSERT INTO worker_job_provider_reservations
      (id, "workerJobId", "attemptId", "providerKind", "providerName", "reservationKind", "operationKey")
      VALUES ('duplicate-legacy', 'job-a', 'attempt-a', 'llm', 'codex', 'running', 'different-op')`).rejects.toMatchObject({ code: "23505" });
  });

  it("retains the expanded guard against unknown kinds and incomplete model bindings", async () => {
    for (const kind of ["invented_kind", "model_call"]) {
      await expect(client`INSERT INTO worker_job_provider_reservations
        (id, "workerJobId", "attemptId", "providerKind", "providerName", "reservationKind", "operationKey")
        VALUES (${kind}, 'job-a', 'attempt-a', 'llm', 'codex', ${kind}, ${kind})`).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("admits distinct model calls on one attempt, retains unknown usage, and rejects duplicates", async () => {
    for (const call of ["call-a", "call-b"]) {
      await client`INSERT INTO worker_job_provider_reservations
        (id, "workerJobId", "attemptId", "providerKind", "providerName", "reservationKind", "operationKey",
         "modelCallId", "leaseFencingVersion", "reservedTokens", "modelPhase", "modelRole", "requestedModel", "reasoningEffort")
        VALUES (${call}, 'job-a', 'attempt-a', 'llm', 'codex', 'model_call', ${call}, ${call}, 1, 100, 'IMPLEMENT', 'developer', 'gpt-6-luna', 'medium')`;
    }
    const rows = await client`SELECT "usageState", "inputTokens", "outputTokens" FROM worker_job_provider_reservations WHERE "reservationKind"='model_call'`;
    expect(rows).toEqual([{ usageState: null, inputTokens: null, outputTokens: null }, { usageState: null, inputTokens: null, outputTokens: null }]);
    await expect(client`INSERT INTO worker_job_provider_reservations
      (id, "workerJobId", "attemptId", "providerKind", "providerName", "reservationKind", "operationKey",
       "modelCallId", "leaseFencingVersion", "reservedTokens", "modelPhase", "modelRole", "requestedModel", "reasoningEffort")
      VALUES ('duplicate-model', 'job-a', 'attempt-a', 'llm', 'codex', 'model_call', 'different-model-op', 'call-a', 1, 100, 'IMPLEMENT', 'developer', 'gpt-6-luna', 'medium')`).rejects.toMatchObject({ code: "23505" });
  });
});
