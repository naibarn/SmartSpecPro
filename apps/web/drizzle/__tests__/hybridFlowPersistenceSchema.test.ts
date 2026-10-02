import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  hybridExecutionStages,
  hybridExecutions,
} from "../schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationText = fs.readFileSync(
  path.join(__dirname, "..", "0210_hybrid_flow_persistence.sql"),
  "utf8",
);

describe("Hybrid Flow persistence schema", () => {
  it("defines durable Hybrid execution columns required by the runtime read model", () => {
    const columns = getTableColumns(hybridExecutions);

    expect(columns.tenantId).toBeDefined();
    expect(columns.userId).toBeDefined();
    expect(columns.conversationId).toBeDefined();
    expect(columns.legacyAgencyId).toBeDefined();
    expect(columns.originSurface).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.objective).toBeDefined();
    expect(columns.routingDecisionJson).toBeDefined();
    expect(columns.currentStageId).toBeDefined();
    expect(columns.totalCreditsUsed).toBeDefined();
    expect(columns.runtimeContractVersion).toBeDefined();
    expect(columns.planSchemaVersion).toBeDefined();
    expect(columns.resultSchemaVersion).toBeDefined();
    expect(columns.runtimeSdkVersion).toBeDefined();
    expect(columns.runtimeAdapterVersion).toBeDefined();
    expect(columns.previewIdempotencyKey).toBeDefined();
  });

  it("defines ordered stage rows with idempotency, envelopes, and trace refs", () => {
    const columns = getTableColumns(hybridExecutionStages);

    expect(columns.executionId).toBeDefined();
    expect(columns.stageIndex).toBeDefined();
    expect(columns.stageType).toBeDefined();
    expect(columns.owner).toBeDefined();
    expect(columns.executorId).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.inputEnvelopeJson).toBeDefined();
    expect(columns.resultEnvelopeJson).toBeDefined();
    expect(columns.errorCode).toBeDefined();
    expect(columns.idempotencyKey).toBeDefined();
    expect(columns.traceRefsJson).toBeDefined();
  });

  it("declares idempotency and status indexes in the additive migration", () => {
    expect(migrationText).toContain("CREATE TABLE IF NOT EXISTS \"hybrid_executions\"");
    expect(migrationText).toContain("CREATE TABLE IF NOT EXISTS \"hybrid_execution_stages\"");
    expect(migrationText).toContain("hybrid_executions_tenant_preview_unique");
    expect(migrationText).toContain("hybrid_execution_stages_execution_index_unique");
    expect(migrationText).toContain("hybrid_execution_stages_tenant_idempotency_unique");
  });
});
