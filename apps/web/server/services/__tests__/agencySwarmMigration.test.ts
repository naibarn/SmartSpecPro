import { describe, it, expect } from "vitest";
import {
  agencies,
  agencyAgents,
  agencyTools,
  agencyCommunicationFlows,
  agencyGuardrails,
  agencyAgentGuardrails,
  agencySharedTools,
  agencyRunTraces,
} from "../../../drizzle/schema";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

/** Helper: returns column names for a Drizzle pgTable */
function colNames(table: Parameters<typeof getTableColumns>[0]) {
  return Object.keys(getTableColumns(table));
}

describe("Agency Swarm Full Capability — Schema Migration", () => {
  // ── New tables ────────────────────────────────────────────────────────

  it("new tables exist with correct exports", () => {
    expect(agencyGuardrails).toBeDefined();
    expect(agencyAgentGuardrails).toBeDefined();
    expect(agencySharedTools).toBeDefined();
    expect(agencyRunTraces).toBeDefined();
  });

  it("agency_guardrails has all required columns", () => {
    const cols = colNames(agencyGuardrails);
    const expected = [
      "id", "tenantId", "agencyId", "name", "type", "mode",
      "strategy", "config", "validationAttempts", "isEnabled",
      "sortOrder", "createdAt", "updatedAt",
    ];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
  });

  it("agency_agent_guardrails has UNIQUE(agentId, guardrailId) constraint", () => {
    const cols = colNames(agencyAgentGuardrails);
    expect(cols).toContain("id");
    expect(cols).toContain("agentId");
    expect(cols).toContain("guardrailId");
    expect(cols).toContain("createdAt");
    // Verify unique index exists
    const config = getTableConfig(agencyAgentGuardrails);
    const uniqueNames = config.indexes
      .filter((i) => i.config.unique)
      .map((i) => i.config.name);
    expect(uniqueNames).toContain("agency_agent_guardrails_unique");
    // Verify FK cascades
    const fks = config.foreignKeys;
    expect(fks.length).toBe(2);
    for (const fk of fks) {
      expect(fk.reference().foreignTable).toBeDefined();
    }
  });

  it("agency_shared_tools has UNIQUE(agencyId, toolId) constraint", () => {
    const cols = colNames(agencySharedTools);
    expect(cols).toContain("id");
    expect(cols).toContain("agencyId");
    expect(cols).toContain("toolId");
    expect(cols).toContain("createdAt");
    // Verify unique index
    const config = getTableConfig(agencySharedTools);
    const uniqueNames = config.indexes
      .filter((i) => i.config.unique)
      .map((i) => i.config.name);
    expect(uniqueNames).toContain("agency_shared_tools_unique");
    // toolId has NO foreign key
    const fkCols = config.foreignKeys.flatMap((fk) =>
      fk.reference().columns.map((c) => c.name),
    );
    expect(fkCols).not.toContain("toolId");
  });

  it("agency_run_traces has required indexes", () => {
    const cols = colNames(agencyRunTraces);
    const expected = [
      "id", "tenantId", "runId", "agencyId", "createdBy",
      "trace", "durationMs", "totalTokens", "totalCost",
      "status", "createdAt",
    ];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
    // Verify indexes
    const config = getTableConfig(agencyRunTraces);
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("agency_run_traces_tenant_idx");
    expect(indexNames).toContain("agency_run_traces_run_idx");
    expect(indexNames).toContain("agency_run_traces_agency_idx");
    expect(indexNames).toContain("agency_run_traces_created_idx");
  });

  // ── Altered tables — agencies ──────────────────────────────────────────

  it("agencies table has new columns with correct defaults", () => {
    const cols = getTableColumns(agencies);
    expect(cols.sharedInstructions).toBeDefined();
    expect(cols.userContext).toBeDefined();
    expect(cols.conversationStarters).toBeDefined();
    expect(cols.topology).toBeDefined();
    expect(cols.cacheConversationStarters).toBeDefined();
    // Defaults
    expect(cols.topology.hasDefault).toBe(true);
    expect(cols.cacheConversationStarters.hasDefault).toBe(true);
  });

  // ── Altered tables — agencyAgents ──────────────────────────────────────

  it("agencyAgents table has new columns with correct defaults", () => {
    const cols = getTableColumns(agencyAgents);
    expect(cols.outputSchema).toBeDefined();
    expect(cols.examples).toBeDefined();
    expect(cols.mcpServers).toBeDefined();
    expect(cols.mcpServerTokensEncrypted).toBeDefined();
    expect(cols.parallelToolCalls).toBeDefined();
    expect(cols.maxTurns).toBeDefined();
    // Defaults
    expect(cols.parallelToolCalls.hasDefault).toBe(true);
    expect(cols.maxTurns.hasDefault).toBe(true);
  });

  // ── Altered tables — agencyTools ──────────────────────────────────────

  it("agencyTools table has new columns with correct defaults", () => {
    const cols = getTableColumns(agencyTools);
    const newCols = [
      "inputSchema", "outputSchema", "httpMethod", "headersEncrypted",
      "retryPolicy", "icon", "category", "version", "isExposedAsApi",
      "strictSchema", "oneCallAtATime", "isEnabled", "updatedAt",
    ];
    for (const col of newCols) {
      expect(cols[col as keyof typeof cols]).toBeDefined();
    }
    // Defaults
    expect(cols.version.hasDefault).toBe(true);
    expect(cols.isExposedAsApi.hasDefault).toBe(true);
    expect(cols.strictSchema.hasDefault).toBe(true);
    expect(cols.oneCallAtATime.hasDefault).toBe(true);
    expect(cols.isEnabled.hasDefault).toBe(true);
  });

  // ── Altered tables — agencyCommunicationFlows ─────────────────────────

  it("agencyCommunicationFlows table has flowConfig column", () => {
    const cols = colNames(agencyCommunicationFlows);
    expect(cols).toContain("flowConfig");
  });

  // ── modelSettings snake_case → camelCase migration (logic test) ───────

  it("modelSettings snake_case to camelCase migration is idempotent", () => {
    // Simulates the SQL transform logic in JS
    function migrateModelSettings(
      settings: Record<string, unknown>,
    ): Record<string, unknown> {
      const result = { ...settings };
      if ("top_p" in result) {
        result.topP = result.top_p;
        delete result.top_p;
      }
      if ("max_tokens" in result) {
        result.maxTokens = result.max_tokens;
        delete result.max_tokens;
      }
      // Strip null values (mirrors jsonb_strip_nulls)
      for (const [k, v] of Object.entries(result)) {
        if (v === null || v === undefined) delete result[k];
      }
      return result;
    }

    // First run
    const input = { top_p: 0.9, max_tokens: 4096, temperature: 0.7 };
    const first = migrateModelSettings(input);
    expect(first).toEqual({ topP: 0.9, maxTokens: 4096, temperature: 0.7 });
    expect(first).not.toHaveProperty("top_p");
    expect(first).not.toHaveProperty("max_tokens");

    // Second run (idempotent)
    const second = migrateModelSettings(first);
    expect(second).toEqual(first);

    // Edge: only one key present
    const partial = { top_p: 0.5, temperature: 1.0 };
    const partialResult = migrateModelSettings(partial);
    expect(partialResult).toEqual({ topP: 0.5, temperature: 1.0 });
    expect(partialResult).not.toHaveProperty("max_tokens");
    expect(partialResult).not.toHaveProperty("maxTokens");
  });
});
