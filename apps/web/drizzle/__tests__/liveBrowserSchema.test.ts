import fs from "node:fs";
import path from "node:path";

import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  liveBrowserAssistRequestTypeEnum,
  liveBrowserAssistRequests,
  liveBrowserControlModeEnum,
  liveBrowserControlTransfers,
  liveBrowserEvents,
  liveBrowserIdempotencyKeys,
  liveBrowserSessionStatusEnum,
  liveBrowserSessions,
} from "../schema";

describe("live browser schema", () => {
  it("exports dedicated live-browser enums", () => {
    expect(liveBrowserSessionStatusEnum.enumValues).toEqual([
      "created",
      "provisioning",
      "ready",
      "agent_running",
      "waiting_for_human",
      "human_controlling",
      "waiting_for_runtime_recovery",
      "failed_recovery_required",
      "completed",
      "cancelled",
      "failed",
      "expired",
    ]);

    expect(liveBrowserControlModeEnum.enumValues).toEqual([
      "observe",
      "approve_only",
      "takeover",
      "agent_control",
    ]);

    expect(liveBrowserAssistRequestTypeEnum.enumValues).toEqual([
      "decision",
      "field_input",
      "review_page",
      "takeover_required",
    ]);
  });

  it("defines live_browser_sessions as the authoritative durable session table", () => {
    expect(getTableName(liveBrowserSessions)).toBe("live_browser_sessions");

    const columns = getTableColumns(liveBrowserSessions);
    const config = getTableConfig(liveBrowserSessions);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(columns).toHaveProperty("id");
    expect(columns).toHaveProperty("tenantId");
    expect(columns).toHaveProperty("userId");
    expect(columns).toHaveProperty("sourceType");
    expect(columns).toHaveProperty("sourceId");
    expect(columns).toHaveProperty("status");
    expect(columns).toHaveProperty("controlMode");
    expect(columns).toHaveProperty("sessionVersion");
    expect(columns).toHaveProperty("runtimeOwnerId");
    expect(columns).toHaveProperty("runtimeOwnerClaimedAt");
    expect(columns).toHaveProperty("pendingAssistRequestId");
    expect(columns).toHaveProperty("pendingApprovalRequestId");
    expect(columns).toHaveProperty("policyContextJson");
    expect(columns).toHaveProperty("browserContextRef");
    expect(columns).toHaveProperty("streamRef");
    expect(columns).toHaveProperty("activeTabCount");
    expect(columns).toHaveProperty("startedAt");
    expect(columns).toHaveProperty("lastActivityAt");
    expect(columns).toHaveProperty("endedAt");
    expect(columns).toHaveProperty("endReason");
    expect(columns.sessionVersion.notNull).toBe(true);
    expect(columns.activeTabCount.default).toBe(1);
    expect(indexNames).toContain("live_browser_sessions_tenant_status_idx");
    expect(indexNames).toContain("live_browser_sessions_user_activity_idx");
    expect(indexNames).toContain("live_browser_sessions_runtime_owner_idx");
  });

  it("defines live_browser_idempotency_keys with per-session deduplication", () => {
    expect(getTableName(liveBrowserIdempotencyKeys)).toBe("live_browser_idempotency_keys");

    const columns = getTableColumns(liveBrowserIdempotencyKeys);
    const config = getTableConfig(liveBrowserIdempotencyKeys);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(columns).toHaveProperty("sessionId");
    expect(columns).toHaveProperty("idempotencyKey");
    expect(columns).toHaveProperty("commandType");
    expect(columns).toHaveProperty("responseJson");
    expect(columns).toHaveProperty("expiresAt");
    expect(indexNames).toContain("uq_live_browser_idempotency_keys_session_key");
  });

  it("defines replayable live_browser_events and linked assist/control tables", () => {
    const eventColumns = getTableColumns(liveBrowserEvents);
    const eventConfig = getTableConfig(liveBrowserEvents);
    const eventIndexNames = eventConfig.indexes.map((index) => index.config.name);

    expect(getTableName(liveBrowserEvents)).toBe("live_browser_events");
    expect(eventColumns).toHaveProperty("id");
    expect(eventColumns).toHaveProperty("sessionId");
    expect(eventColumns).toHaveProperty("sessionVersionAt");
    expect(eventColumns).toHaveProperty("tenantId");
    expect(eventColumns).toHaveProperty("eventType");
    expect(eventColumns).toHaveProperty("actorType");
    expect(eventColumns).toHaveProperty("payloadJson");
    expect(eventColumns).toHaveProperty("cursor");
    expect(eventIndexNames).toContain("uq_live_browser_events_session_cursor");
    expect(eventIndexNames).toContain("live_browser_events_session_created_idx");

    const assistColumns = getTableColumns(liveBrowserAssistRequests);
    expect(getTableName(liveBrowserAssistRequests)).toBe("live_browser_assist_requests");
    expect(assistColumns).toHaveProperty("requestType");
    expect(assistColumns).toHaveProperty("status");
    expect(assistColumns).toHaveProperty("responseJson");
    expect(assistColumns).toHaveProperty("resolvedSessionVersionAt");

    const transferColumns = getTableColumns(liveBrowserControlTransfers);
    expect(getTableName(liveBrowserControlTransfers)).toBe("live_browser_control_transfers");
    expect(transferColumns).toHaveProperty("fromActorType");
    expect(transferColumns).toHaveProperty("toActorType");
    expect(transferColumns).toHaveProperty("policyCheckHash");
  });

  it("ships an additive migration that creates the live-browser foundation tables", () => {
    const migrationPath = path.join(
      process.cwd(),
      "drizzle",
      "0069_live_browser_foundation.sql",
    );
    const sqlText = fs.readFileSync(migrationPath, "utf8");

    expect(sqlText).toContain('CREATE TYPE "live_browser_session_status"');
    expect(sqlText).toContain('CREATE TABLE "live_browser_sessions"');
    expect(sqlText).toContain('"runtimeOwnerId" varchar(128)');
    expect(sqlText).toContain(
      'CREATE INDEX "live_browser_sessions_runtime_owner_idx"',
    );
    expect(sqlText).toContain('CREATE TABLE "live_browser_events"');
    expect(sqlText).toContain('CREATE TABLE "live_browser_assist_requests"');
    expect(sqlText).toContain('CREATE TABLE "live_browser_control_transfers"');
    expect(sqlText).toContain('CREATE TABLE "live_browser_idempotency_keys"');
    expect(sqlText).toContain(
      'CREATE UNIQUE INDEX "uq_live_browser_idempotency_keys_session_key"',
    );
  });
});
