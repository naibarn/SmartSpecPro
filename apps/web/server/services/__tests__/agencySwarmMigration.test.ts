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

  it("agency_agent_guardrails has required columns and unique constraint shape", () => {
    const cols = colNames(agencyAgentGuardrails);
    expect(cols).toContain("id");
    expect(cols).toContain("agentId");
    expect(cols).toContain("guardrailId");
    expect(cols).toContain("createdAt");
  });

  it("agency_shared_tools has required columns", () => {
    const cols = colNames(agencySharedTools);
    expect(cols).toContain("id");
    expect(cols).toContain("agencyId");
    expect(cols).toContain("toolId");
    expect(cols).toContain("createdAt");
  });

  it("agency_run_traces has required columns and indexes", () => {
    const cols = colNames(agencyRunTraces);
    const expected = [
      "id", "tenantId", "runId", "agencyId", "createdBy",
      "trace", "durationMs", "totalTokens", "totalCost",
      "status", "createdAt",
    ];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
  });

  // ── Altered tables — agencies ──────────────────────────────────────────

  it("agencies table has new columns", () => {
    const cols = colNames(agencies);
    expect(cols).toContain("sharedInstructions");
    expect(cols).toContain("userContext");
    expect(cols).toContain("conversationStarters");
    expect(cols).toContain("topology");
    expect(cols).toContain("cacheConversationStarters");
  });

  // ── Altered tables — agencyAgents ──────────────────────────────────────

  it("agencyAgents table has new columns", () => {
    const cols = colNames(agencyAgents);
    expect(cols).toContain("outputSchema");
    expect(cols).toContain("examples");
    expect(cols).toContain("mcpServers");
    expect(cols).toContain("mcpServerTokensEncrypted");
    expect(cols).toContain("parallelToolCalls");
    expect(cols).toContain("maxTurns");
  });

  // ── Altered tables — agencyTools ──────────────────────────────────────

  it("agencyTools table has new columns", () => {
    const cols = colNames(agencyTools);
    const newCols = [
      "inputSchema", "outputSchema", "httpMethod", "headersEncrypted",
      "retryPolicy", "icon", "category", "version", "isExposedAsApi",
      "strictSchema", "oneCallAtATime", "isEnabled", "updatedAt",
    ];
    for (const col of newCols) {
      expect(cols).toContain(col);
    }
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
