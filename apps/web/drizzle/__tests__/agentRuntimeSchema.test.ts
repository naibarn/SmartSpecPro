import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getTableColumns } from "drizzle-orm";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  agentRuntimeCheckpoints,
  agentRuntimeTraces,
  teamRuns,
  type InsertTeamRun,
  workAutomationRunCheckpoints,
} from "../schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationText = fs.readFileSync(
  path.join(__dirname, "..", "0156_openai_agents_runtime_persistence.sql"),
  "utf8",
);

describe("agent runtime persistence schema", () => {
  it("extends team_runs with additive runtime metadata columns", () => {
    const columns = getTableColumns(teamRuns);

    expect(columns.runtimeEngine).toBeDefined();
    expect(columns.runtimeMode).toBeDefined();
    expect(columns.runtimeSdkVersion).toBeDefined();
    expect(columns.runtimeAdapterVersion).toBeDefined();
    expect(columns.runtimeTraceId).toBeDefined();
    expect(columns.runtimeGatewayRouteId).toBeDefined();
    expect(columns.runtimeFrozenAt).toBeDefined();
    expect(columns.runtimeTerminalReason).toBeDefined();
    expect(columns.runtimeCurrentStepKey).toBeDefined();
    expect(columns.runtimeApprovalState).toBeDefined();
    expect(columns.runtimeStateJson).toBeDefined();
  });

  it("keeps legacy team_runs inserts valid without SDK metadata", () => {
    expectTypeOf<InsertTeamRun>().toMatchTypeOf<{
      roomId: string;
      teamId: string;
      initiatedByUserId: number;
      executionMode: "team_chat" | "auto_team" | "review";
      runtimeStateJson?: Record<string, unknown> | null | undefined;
      runtimeEngine?: string | null | undefined;
      runtimeMode?: string | null | undefined;
    }>();

    const legacyInsert: InsertTeamRun = {
      roomId: "room-1",
      teamId: "team-1",
      initiatedByUserId: 123,
      executionMode: "auto_team",
    };

    expect(legacyInsert.runtimeStateJson).toBeUndefined();
    expect(legacyInsert.runtimeEngine).toBeUndefined();
  });

  it("defines the generic agent_runtime_traces table with redacted metadata and idempotency fields", () => {
    const columns = getTableColumns(agentRuntimeTraces);

    expect(columns.tenantId).toBeDefined();
    expect(columns.surface).toBeDefined();
    expect(columns.traceId).toBeDefined();
    expect(columns.eventId).toBeDefined();
    expect(columns.sequence).toBeDefined();
    expect(columns.eventName).toBeDefined();
    expect(columns.sourceComponent).toBeDefined();
    expect(columns.redactedMetadataJson).toBeDefined();
    expect(columns.runtimeSdkVersion).toBeDefined();
    expect(columns.runtimeAdapterVersion).toBeDefined();
    expect(columns.modelId).toBeDefined();
    expect(columns.providerId).toBeDefined();
    expect(columns.gatewayRouteId).toBeDefined();
    expect(columns.idempotencyKey).toBeDefined();
  });

  it("defines the generic agent_runtime_checkpoints table with resume and approval fields", () => {
    const columns = getTableColumns(agentRuntimeCheckpoints);

    expect(columns.tenantId).toBeDefined();
    expect(columns.surface).toBeDefined();
    expect(columns.checkpointId).toBeDefined();
    expect(columns.checkpointStatus).toBeDefined();
    expect(columns.approvalState).toBeDefined();
    expect(columns.resumeCursor).toBeDefined();
    expect(columns.snapshotJson).toBeDefined();
    expect(columns.detailJson).toBeDefined();
    expect(columns.idempotencyKey).toBeDefined();
    expect(columns.requestedBy).toBeDefined();
    expect(columns.approvedBy).toBeDefined();
    expect(columns.rejectedBy).toBeDefined();
    expect(columns.resumedBy).toBeDefined();
    expect(columns.requestedAt).toBeDefined();
    expect(columns.updatedAt).toBeDefined();
  });

  it("keeps Work OS checkpoint tables unchanged for work-backed Team approvals", () => {
    const columns = getTableColumns(workAutomationRunCheckpoints);

    expect(columns.runId).toBeDefined();
    expect(columns.checkpointStatus).toBeDefined();
    expect(columns.approvalState).toBeDefined();
  });

  it("declares the required runtime persistence indexes in the migration text", () => {
    expect(migrationText).toContain(
      "agent_runtime_traces_tenant_idempotency_unique",
    );
    expect(migrationText).toContain(
      "agent_runtime_traces_tenant_run_sequence_unique",
    );
    expect(migrationText).toContain(
      "agent_runtime_checkpoints_tenant_checkpoint_unique",
    );
    expect(migrationText).toContain(
      "agent_runtime_checkpoints_tenant_status_updated_idx",
    );
  });
});
