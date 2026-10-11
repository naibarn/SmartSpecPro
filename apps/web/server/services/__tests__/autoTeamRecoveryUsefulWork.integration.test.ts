import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { closeDb, getDb } from "../../db";
import { createCanonicalJobInTransaction } from "../jobControlPlane";
import {
  buildAutoTeamRecoveryEvaluationJob,
  fingerprintAutoTeamRecoveryState,
} from "../autoTeamRecoveryEvaluationJob";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

const exec = promisify(execFile);

describe("AutoTeam useful-work recovery across worker processes", () => {
  afterEach(async () => closeDb());

  it("completes an expired final-review wait only from persisted resolved evidence", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC277_REFUSES_INHERITED_DATABASE_URL");
    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, {
      max: 3,
      connect_timeout: 3,
    });
    const tenantId = "tenant-r7-useful-work";
    const runId = "run-r7-useful-work";
    const roomId = "room-r7-useful-work";
    const snapshotId = randomUUID();
    const childEnv = {
      ...process.env,
      DATABASE_URL: fixture.databaseUrl,
      FEATURE_186_SYSTEM_TENANT_ID: tenantId,
      JWT_SECRET: "r7-synthetic-fixture-secret-32-bytes",
    };
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
        VALUES ($1, $2, 'team-r7-useful-work', 1, 'auto_team', 'Expired final review')
      `,
        [roomId, tenantId]
      );
      await client.unsafe(
        `
        INSERT INTO team_runs (
          id, "roomId", "teamId", "initiatedByUserId", "executionMode", status,
          "stopReason", "runtimeStateJson", "startedAt"
        ) VALUES (
          $1, $2, 'team-r7-useful-work', 1, 'auto_team', 'paused',
          'awaiting_final_approval',
          jsonb_build_object('choiceDeadlineAt', (now() - interval '1 hour')::text),
          now() - interval '2 hours'
        )
      `,
        [runId, roomId]
      );

      const planArtifact = {
        runId,
        roomId,
        teamId: "team-r7-useful-work",
        objective: "Verify persisted useful recovery work",
        source: "team_run",
        status: "completed",
        generatedAt: "2026-10-11T00:00:00.000Z",
        lastUpdatedAt: "2026-10-11T00:00:00.000Z",
        steps: [
          {
            stepKey: "persisted-final-output",
            title: "Persisted final output",
            objective: "Confirm the final output is durable",
            deliverable: "A stored final result",
            ownerPersona: "Synthetic worker",
            ownerMemberId: null,
            reviewerPersona: "Synthetic reviewer",
            reviewerMemberId: null,
            verificationMethod: "persisted_snapshot_reference",
            retryRule: "retry only after evidence changes",
            evidenceRequirements: ["persisted final snapshot"],
            qualityCriteria: ["snapshot belongs to the same run"],
            reviewChecklist: ["snapshot reference resolves"],
            status: "completed",
            evidenceRefs: [`snapshot:${snapshotId}`],
            notes: null,
            surface: "work_os",
            validationState: { status: "passed" },
          },
        ],
        evidenceRefs: [`snapshot:${snapshotId}`],
        planEvidenceRefs: [`snapshot:${snapshotId}`],
        reviewerMatrix: [],
        exploration: null,
        review: {
          status: "passed",
          iteration: 1,
          reviewedAt: "2026-10-11T00:00:00.000Z",
          reviewerPersona: "Synthetic reviewer",
          issues: [],
          score: 1,
          recommendation: "ready",
        },
      };
      await client.unsafe(
        `
        INSERT INTO run_snapshots (id, "runId", "artifactCountJson", "capturedAt")
        VALUES ($1, $2, jsonb_build_object('planArtifact', $3::jsonb), now())
      `,
        [snapshotId, runId, client.json(planArtifact)]
      );

      const priorDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = fixture.databaseUrl;
      try {
        const run = await (
          await import("../runEngine")
        ).getRun(runId, tenantId);
        if (!run) throw new Error("SPEC277_USEFUL_WORK_RUN_READ_FAILED");
        const definition = buildAutoTeamRecoveryEvaluationJob({
          tenantId,
          runId,
          stateFingerprint: fingerprintAutoTeamRecoveryState(run),
          evaluationSlot: Math.floor(Date.now() / 300_000),
        });
        const db = await getDb();
        if (!db) throw new Error("SPEC277_USEFUL_WORK_DATABASE_UNAVAILABLE");
        await db.transaction(tx =>
          createCanonicalJobInTransaction({
            query: tx,
            definition,
            options: {
              runtimeType: "node_job_worker",
              requestedBySystemComponent: "auto_team_recovery",
            },
            createdPayload: { source: "r7_useful_work_acceptance" },
            queuedPayload: { source: "r7_useful_work_acceptance" },
          })
        );
      } finally {
        await closeDb();
        delete process.env.DATABASE_URL;
        if (priorDatabaseUrl !== undefined)
          process.env.DATABASE_URL = priorDatabaseUrl;
      }

      const child = await exec(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/auto-team-recovery-scheduler-child.ts",
          "evaluate",
        ],
        {
          cwd: process.cwd(),
          env: childEnv,
          timeout: 35_000,
          maxBuffer: 32 * 1024,
        }
      );
      expect(child.stderr).toContain("SPEC277_EVALUATE_RESULT:succeeded");

      const [runAfter] = await client.unsafe(
        `SELECT status, "stopReason" AS stop_reason FROM team_runs WHERE id = $1`,
        [runId]
      );
      const [jobAfter] = await client.unsafe(
        `SELECT status, "outputJson" AS output_json FROM worker_jobs WHERE "jobType" = 'auto-team.recovery.evaluate' AND "inputJson" ->> 'runId' = $1`,
        [runId]
      );
      const [persistedEffects] = await client.unsafe(
        `
        SELECT
          (SELECT COUNT(*)::int FROM team_room_messages WHERE "runId" = $1) AS message_count,
          (SELECT COUNT(*)::int FROM agent_activity_events WHERE "runId" = $1 AND "eventType" = 'run_completed') AS terminal_event_count,
          (SELECT COUNT(*)::int FROM run_snapshots WHERE "runId" = $1) AS snapshot_count
      `,
        [runId]
      );

      expect(runAfter).toEqual({
        status: "completed",
        stop_reason: "final_approved",
      });
      expect(jobAfter.status).toBe("succeeded");
      expect(jobAfter.output_json).toMatchObject({
        outcome: "recovery_verified",
        actionsDispatched: 1,
        usefulWorkEvidence: ["final_review_completed"],
        recoveryVerified: true,
      });
      expect(persistedEffects).toEqual({
        message_count: 1,
        terminal_event_count: 1,
        snapshot_count: 1,
      });
    } finally {
      await closeDb();
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 60_000);
});
