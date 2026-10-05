import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../0387_spec278_durable_execution_sessions.sql", import.meta.url),
  "utf8",
);
const journal = JSON.parse(readFileSync(new URL("../meta/_journal.json", import.meta.url), "utf8"));

describe("Spec 278 durable execution sessions migration", () => {
  it("creates tenant/job-linked session projection and ordered deduplicated events", () => {
    expect(migration).toContain('REFERENCES "worker_jobs"("id") ON DELETE RESTRICT');
    expect(migration).toContain('"jobControlRevision" bigint NOT NULL');
    expect(migration).toContain('"workerJobAttempt" integer NOT NULL');
    expect(migration).toContain('"leaseFencingVersion" bigint NOT NULL');
    expect(migration).toContain('"runner_execution_session_events_sequence_unique"');
    expect(migration).toContain('"runner_execution_session_events_idempotency_unique"');
    expect(migration).toContain('"runner_execution_sessions_one_active_job_unique"');
  });

  it("registers migration 0387 after the current journal head", () => {
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 373,
      tag: "0387_spec278_durable_execution_sessions",
      breakpoints: true,
    });
  });
});
