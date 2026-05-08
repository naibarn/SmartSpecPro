import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getTableColumns } from "drizzle-orm";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type InsertVoiceAgentConfig,
  type InsertVoiceAgentSession,
  voiceAgentConfigs,
  voiceAgentEvents,
  voiceAgentSessions,
  voiceAgentToolCalls,
} from "../schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationText = fs.readFileSync(
  path.join(__dirname, "..", "0170_voice_agents_runtime.sql"),
  "utf8",
);

describe("voice agents schema", () => {
  it("defines tenant-scoped voice agent configs without raw API key storage", () => {
    const columns = getTableColumns(voiceAgentConfigs);

    expect(columns.tenantId).toBeDefined();
    expect(columns.provider).toBeDefined();
    expect(columns.externalAgentId).toBeDefined();
    expect(columns.credentialProviderName).toBeDefined();
    expect(columns.allowedSurfaces).toBeDefined();
    expect(columns.allowedTools).toBeDefined();
    expect(columns.lastTestResult).toBeDefined();
    expect(columns.apiKey).toBeUndefined();
    expect(columns.apiKeyEncrypted).toBeUndefined();
  });

  it("defines voice agent sessions with lifecycle, billing, and idempotency columns", () => {
    const columns = getTableColumns(voiceAgentSessions);

    expect(columns.tenantId).toBeDefined();
    expect(columns.userId).toBeDefined();
    expect(columns.conversationId).toBeDefined();
    expect(columns.configId).toBeDefined();
    expect(columns.providerConversationId).toBeDefined();
    expect(columns.connectionType).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.billingStatus).toBeDefined();
    expect(columns.creditReservationTransactionId).toBeDefined();
    expect(columns.idempotencyKey).toBeDefined();
    expect(columns.transcriptPending).toBeDefined();
  });

  it("defines voice agent events with sequence and provider-event dedupe fields", () => {
    const columns = getTableColumns(voiceAgentEvents);

    expect(columns.sessionId).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.providerEventId).toBeDefined();
    expect(columns.sequence).toBeDefined();
    expect(columns.source).toBeDefined();
    expect(columns.redactionStatus).toBeDefined();
    expect(columns.conversationMessageId).toBeDefined();
  });

  it("defines tool calls with provider ID and idempotency fields", () => {
    const columns = getTableColumns(voiceAgentToolCalls);

    expect(columns.sessionId).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.providerToolCallId).toBeDefined();
    expect(columns.idempotencyKey).toBeDefined();
    expect(columns.toolName).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.policyDecisionJson).toBeDefined();
  });

  it("keeps inserts additive and defaults voice-agent values where possible", () => {
    expectTypeOf<InsertVoiceAgentConfig>().toMatchTypeOf<{
      tenantId: string;
      externalAgentId: string;
      displayName: string;
      provider?: "elevenlabs" | undefined;
      allowedSurfaces?: Array<"chat" | "work_os" | "team_room" | "agency"> | undefined;
    }>();

    expectTypeOf<InsertVoiceAgentSession>().toMatchTypeOf<{
      tenantId: string;
      userId: number;
      conversationId: number;
      configId: number;
      idempotencyKey: string;
      provider?: "elevenlabs" | undefined;
      surface?: "chat" | "work_os" | "team_room" | "agency" | undefined;
    }>();
  });

  it("migration is additive and extends credit source with voice_agent", () => {
    expect(migrationText).toContain("ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'voice_agent'");
    expect(migrationText).toContain("CREATE TABLE IF NOT EXISTS voice_agent_configs");
    expect(migrationText).toContain("CREATE TABLE IF NOT EXISTS voice_agent_sessions");
    expect(migrationText).toContain("CREATE TABLE IF NOT EXISTS voice_agent_events");
    expect(migrationText).toContain("CREATE TABLE IF NOT EXISTS voice_agent_tool_calls");
    expect(migrationText).not.toMatch(/DROP TABLE|TRUNCATE|ALTER TABLE media_models/i);
  });
});
