import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { closeDb } from "../../db";
import {
  buildAutoTeamRecoveryEvaluationJob,
  fingerprintAutoTeamRecoveryState,
} from "../autoTeamRecoveryEvaluationJob";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

const exec = promisify(execFile);

describe("AutoTeam recovery no-progress suppression persistence", () => {
  afterEach(async () => closeDb());

  it("suppresses three persisted succeeded no-progress evaluations without blocking another ready run", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");
    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, {
      max: 3,
      connect_timeout: 3,
    });
    const tenantId = "tenant-r7-no-progress";
    const childEnv = { ...process.env, DATABASE_URL: fixture.databaseUrl };
    delete childEnv.PGHOST;
    delete childEnv.PGPORT;
    delete childEnv.PGUSER;
    delete childEnv.PGPASSWORD;

    try {
      await fixture.assertOwned();
      await installSpec277AutoTeamRuntimeSchema(client);
      await client.unsafe(
        `
        INSERT INTO team_rooms (id, "tenantId", "teamId", "orchestratorUserId", "roomType", title)
        VALUES
          ('room-r7-stalled', $1, 'team-r7-no-progress', 1, 'auto_team', 'Stalled run'),
          ('room-r7-ready', $1, 'team-r7-no-progress', 1, 'auto_team', 'Independent ready run'),
          ('room-r7-wildcard', $1, 'team-r7-no-progress', 1, 'auto_team', 'Wildcard isolation run')
      `,
        [tenantId]
      );
      await client.unsafe(
        `
        INSERT INTO team_runs (id, "roomId", "teamId", "initiatedByUserId", "executionMode", status, "runtimeStateJson", "startedAt")
        VALUES
          ('run-r7-stalled', 'room-r7-stalled', 'team-r7-no-progress', 1, 'auto_team', 'running', '{}'::jsonb, now() - interval '2 hours'),
          ('run-r7-ready', 'room-r7-ready', 'team-r7-no-progress', 1, 'auto_team', 'running', '{}'::jsonb, now() - interval '1 hour'),
          ('run_r7_stalled', 'room-r7-wildcard', 'team-r7-no-progress', 1, 'auto_team', 'running', '{}'::jsonb, now() - interval '30 minutes')
      `
      );
      await client.unsafe(
        `
        INSERT INTO run_snapshots ("runId", "artifactCountJson", "capturedAt")
        VALUES
          ('run-r7-stalled', '{"planArtifact":{"runId":"run-r7-stalled","roomId":"room-r7-stalled","teamId":"team-r7-no-progress","objective":"synthetic recovery acceptance","status":"executing","generatedAt":"2026-10-11T00:00:00.000Z","lastUpdatedAt":"2026-10-11T00:00:00.000Z","review":{"status":"passed","iteration":1,"reviewedAt":"2026-10-11T00:00:00.000Z","reviewerPersona":"test-reviewer","issues":[],"score":1,"recommendation":"ready"}}}'::jsonb, now()),
          ('run-r7-ready', '{"planArtifact":{"runId":"run-r7-ready","roomId":"room-r7-ready","teamId":"team-r7-no-progress","objective":"synthetic independent acceptance","status":"executing","generatedAt":"2026-10-11T00:00:00.000Z","lastUpdatedAt":"2026-10-11T00:00:00.000Z","review":{"status":"passed","iteration":1,"reviewedAt":"2026-10-11T00:00:00.000Z","reviewerPersona":"test-reviewer","issues":[],"score":1,"recommendation":"ready"}}}'::jsonb, now()),
          ('run_r7_stalled', '{"planArtifact":{"runId":"run_r7_stalled","roomId":"room-r7-wildcard","teamId":"team-r7-no-progress","objective":"synthetic wildcard isolation acceptance","status":"executing","generatedAt":"2026-10-11T00:00:00.000Z","lastUpdatedAt":"2026-10-11T00:00:00.000Z","review":{"status":"passed","iteration":1,"reviewedAt":"2026-10-11T00:00:00.000Z","reviewerPersona":"test-reviewer","issues":[],"score":1,"recommendation":"ready"}}}'::jsonb, now())
      `
      );

      const priorDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = fixture.databaseUrl;
      let stateFingerprint: string;
      try {
        const { getRun } = await import("../runEngine");
        const run = await getRun("run-r7-stalled", tenantId);
        if (!run) throw new Error("SPEC277_STALLED_RUN_READ_FAILED");
        stateFingerprint = fingerprintAutoTeamRecoveryState(run);
      } finally {
        await closeDb();
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
      }

      for (let slot = 100; slot < 103; slot += 1) {
        const definition = buildAutoTeamRecoveryEvaluationJob({
          tenantId,
          runId: "run-r7-stalled",
          stateFingerprint,
          evaluationSlot: slot,
        });
        await client.unsafe(
          `
          INSERT INTO worker_jobs (
            id, "tenantId", "runtimeType", "jobType", status,
            "executionClass", "contractVersion", "inputJson", "instructionsJson",
            "retryPolicyJson", "timeoutPolicyJson", attempt, "maxAttempts",
            "fencingVersion", "idempotencyKey", "outputJson", "finishedAt"
          ) VALUES (
            $1, $2, 'node_job_worker', 'auto-team.recovery.evaluate', 'succeeded',
            $3, $4,
            jsonb_build_object('contractVersion', 'auto-team-recovery-v1', 'runId', $5::text, 'stateFingerprint', $6::text, 'evaluationSlot', $7::integer),
            '{}', $8::jsonb, $9::jsonb, 1, 3, 1, $10,
            jsonb_build_object('outcome', 'no_action', 'runId', $5),
            now() - (($11)::text || ' minutes')::interval
          )
        `,
          [
            randomUUID(),
            tenantId,
            definition.executionClass,
            definition.contractVersion,
            "run-r7-stalled",
            stateFingerprint,
            slot,
            JSON.stringify(definition.retryPolicy),
            JSON.stringify(definition.timeoutPolicy),
            definition.idempotencyKey,
            4 - slot + 100,
          ]
        );
      }

      const dispatches = await Promise.all(
        [1, 2].map(() =>
          exec(
            process.execPath,
            ["--import", "tsx", "scripts/auto-team-recovery-dispatch-child.ts"],
            {
              cwd: process.cwd(),
              env: childEnv,
              timeout: 20_000,
              maxBuffer: 16 * 1024,
            }
          )
        )
      );
      expect(
        dispatches.every(({ stdout }) =>
          /^SPEC277_DISPATCH_CREATED:\d+\n?$/.test(stdout)
        )
      ).toBe(true);

      const evaluations = await client.unsafe(
        `
        SELECT "inputJson" ->> 'runId' AS run_id, status
        FROM worker_jobs
        WHERE "tenantId" = $1 AND "jobType" = 'auto-team.recovery.evaluate'
        ORDER BY "createdAt", id
      `,
        [tenantId]
      );
      expect(
        evaluations.filter(row => row.run_id === "run-r7-stalled")
      ).toHaveLength(3);
      expect(evaluations.filter(row => row.run_id === "run-r7-ready")).toEqual([
        expect.objectContaining({ run_id: "run-r7-ready", status: "queued" }),
      ]);
      expect(evaluations.filter(row => row.run_id === "run_r7_stalled")).toEqual([
        expect.objectContaining({ run_id: "run_r7_stalled", status: "queued" }),
      ]);
    } finally {
      await closeDb();
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 60_000);
});
