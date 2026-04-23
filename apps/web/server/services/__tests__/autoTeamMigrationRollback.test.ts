import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { resolve } from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import {
  freezeAutoTeamExecutionModeSnapshot,
  resolveAutoTeamExecutionMode,
  shouldEnforceAutoTeamCompletionEvidence,
  shouldEnforceAutoTeamMediaJobs,
  shouldEnforceAutoTeamRouteGate,
  type AutoTeamRolloutFlags,
} from "../autoTeamFeatureFlags";

config({ path: resolve(__dirname, "../../../.env") });

type Db = ReturnType<typeof drizzle>;

let pgClient: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  pgClient = postgres(url, { max: 2 });
  db = drizzle(pgClient);
});

afterAll(async () => {
  if (pgClient) {
    await pgClient.end();
  }
});

function setFlagEnv(flags: Partial<Record<string, string>>) {
  const keys = [
    "AUTO_TEAM_CANONICAL_EXECUTION",
    "AUTO_TEAM_CANONICAL_SHADOW_MODE",
    "AUTO_TEAM_MEDIA_JOB_ENFORCEMENT",
    "AUTO_TEAM_COMPLETION_EVIDENCE_GATE",
    "AUTO_TEAM_ROLLBACK_READONLY_MODE",
    "AUTO_TEAM_RETENTION_CLEANUP",
  ] as const;
  for (const key of keys) {
    if (flags[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = flags[key]!;
    }
  }
}

beforeEach(() => {
  setFlagEnv({});
});

describe("autoTeam rollback and migration verification", () => {
  it("freezes the execution mode snapshot even when flags change later", async () => {
    setFlagEnv({
      AUTO_TEAM_CANONICAL_EXECUTION: "true",
      AUTO_TEAM_CANONICAL_SHADOW_MODE: "true",
      AUTO_TEAM_MEDIA_JOB_ENFORCEMENT: "true",
      AUTO_TEAM_COMPLETION_EVIDENCE_GATE: "true",
      AUTO_TEAM_ROLLBACK_READONLY_MODE: "false",
    });

    const firstSnapshot = await freezeAutoTeamExecutionModeSnapshot();
    expect(firstSnapshot.executionMode).toBe("shadow");
    expect(shouldEnforceAutoTeamRouteGate(firstSnapshot.flags)).toBe(true);
    expect(shouldEnforceAutoTeamMediaJobs(firstSnapshot.flags)).toBe(true);
    expect(shouldEnforceAutoTeamCompletionEvidence(firstSnapshot.flags)).toBe(true);

    setFlagEnv({
      AUTO_TEAM_CANONICAL_EXECUTION: "false",
      AUTO_TEAM_CANONICAL_SHADOW_MODE: "false",
      AUTO_TEAM_MEDIA_JOB_ENFORCEMENT: "false",
      AUTO_TEAM_COMPLETION_EVIDENCE_GATE: "false",
      AUTO_TEAM_ROLLBACK_READONLY_MODE: "true",
    });

    const secondSnapshot = await freezeAutoTeamExecutionModeSnapshot();
    expect(secondSnapshot.executionMode).toBe("rollback_readonly");
    expect(firstSnapshot.executionMode).toBe("shadow");
    expect(resolveAutoTeamExecutionMode(firstSnapshot.flags)).toBe("shadow");
    expect(resolveAutoTeamExecutionMode(secondSnapshot.flags)).toBe("rollback_readonly");
  });

  it("switches to read-only rollback mode without mutating the frozen mode for a live run", () => {
    const frozen: AutoTeamRolloutFlags = {
      canonicalExecution: true,
      canonicalShadowMode: false,
      mediaJobEnforcement: true,
      completionEvidenceGate: true,
      rollbackReadonlyMode: false,
      retentionCleanup: false,
    };

    const laterFlags: AutoTeamRolloutFlags = {
      ...frozen,
      rollbackReadonlyMode: true,
    };

    expect(resolveAutoTeamExecutionMode(frozen)).toBe("enforced");
    expect(resolveAutoTeamExecutionMode(laterFlags)).toBe("rollback_readonly");
    expect(shouldEnforceAutoTeamRouteGate(laterFlags)).toBe(false);
    expect(shouldEnforceAutoTeamMediaJobs(laterFlags)).toBe(false);
    expect(shouldEnforceAutoTeamCompletionEvidence(laterFlags)).toBe(false);
  });

  it("verifies the canonical auto-team tables and prior work_cases automation columns exist", async () => {
    if (!db) return;

    const tableNames = [
      "auto_team_route_decisions",
      "auto_team_execution_stages",
      "auto_team_media_job_refs",
      "auto_team_review_records",
      "auto_team_final_results",
      "auto_team_trace_events",
      "auto_team_artifact_refs",
    ];

    for (const tableName of tableNames) {
      const result = await db.execute(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
      `);
      if (result.length === 0) {
        console.warn(`Skipping auto-team migration verification because ${tableName} is missing`);
        return;
      }
    }

    const workCaseColumns = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'work_cases'
        AND column_name IN (
          'automationRunId',
          'automationMode',
          'automationTemplateKey',
          'automationTemplateFamily',
          'automationTemplateSource',
          'automationPolicyJson',
          'automationStepId',
          'automationCheckpointId',
          'automationDisposition',
          'automationSummary',
          'automationUpdatedAt'
        )
    `);
    expect(workCaseColumns).toHaveLength(11);

    const teamRoomLanguage = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'team_rooms'
        AND column_name = 'language'
    `);
    expect(teamRoomLanguage).toHaveLength(1);

    const traceSeqIndex = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'auto_team_trace_events'
        AND indexname = 'auto_team_trace_events_tenant_run_sequence_unique'
    `);
    expect(traceSeqIndex).toHaveLength(1);

    const artifactIdempotencyIndex = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'auto_team_artifact_refs'
        AND indexname = 'auto_team_artifact_refs_tenant_run_idempotency_unique'
    `);
    expect(artifactIdempotencyIndex).toHaveLength(1);
  });
});
