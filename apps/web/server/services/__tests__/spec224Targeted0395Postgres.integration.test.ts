import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  assertSpec224DisposableDatabaseUrl,
  assertSpec224OwnedPostgresContainer,
} from "./support/spec224DisposablePostgres";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const connectionString = process.env.DATABASE_URL ?? "";
let sql: ReturnType<typeof postgres> | undefined;

describeDb("SPEC-224 migration 0395 on disposable PostgreSQL", () => {
  beforeAll(async () => {
    assertSpec224DisposableDatabaseUrl(connectionString);
    assertSpec224OwnedPostgresContainer();
    sql = postgres(connectionString, { max: 1, connect_timeout: 5 });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("adds external_runtime to the pre-migration enum without production authority", async () => {
    const [existing] = await sql!`
      SELECT to_regtype('public.worker_runtime_type') AS type_name
    `;
    expect(existing.type_name).toBeNull();

    await sql!`
      CREATE TYPE public.worker_runtime_type AS ENUM ('local_llm_worker')
    `;
    const migration = await readFile(
      new URL("../../../drizzle/0395_spec224_external_runtime_job_type.sql", import.meta.url),
      "utf8",
    );
    await sql!.unsafe(migration.replace(/-->\s*statement-breakpoint/g, ""));

    const labels = await sql!`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = 'public.worker_runtime_type'::regtype
      ORDER BY enumsortorder
    `;
    expect(labels.map(row => row.enumlabel)).toEqual([
      "local_llm_worker",
      "external_runtime",
    ]);
  });
});
