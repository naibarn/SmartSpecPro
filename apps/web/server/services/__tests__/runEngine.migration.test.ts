import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Mock db module before imports
vi.mock("../../db", () => ({
  getDb: vi.fn(() => ({})),
}));

// Mock schema imports
vi.mock("../../../drizzle/schema", () => ({
  teamRuns: { id: "id", status: "status", stopReason: "stopReason", endedAt: "endedAt", roomId: "roomId", executionMode: "executionMode", startedAt: "startedAt" },
  teamRooms: { id: "id", tenantId: "tenantId" },
  teamRoomMessages: {},
  assistantProfiles: {},
  agentActivityEvents: { runId: "runId", eventType: "eventType", createdAt: "createdAt" },
  agentRunSummaries: {},
  teamWorkItems: {},
  personaTemplates: {},
  agencyAgents: {},
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  sql: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn((...args: unknown[]) => ({ type: "inArray", args })),
  or: vi.fn((...args: unknown[]) => ({ type: "or", args })),
}));

// Mock other imports used by runEngine
vi.mock("../turnOrderEngine", () => ({
  getCoordinatorProfile: vi.fn(),
  getNextSpeaker: vi.fn(),
}));
vi.mock("../workItemService", () => ({}));
vi.mock("../roomService", () => ({}));
vi.mock("../monitoringService", () => ({}));

describe("migration — stop old runs", () => {
  it("should have migration SQL file for stopping legacy team runs", () => {
    const migrationDir = path.resolve(__dirname, "../../../drizzle");
    const files = fs.readdirSync(migrationDir);
    const migrationFile = files.find(
      (f) => f.includes("stop_legacy_team_runs") && f.endsWith(".sql"),
    );
    expect(migrationFile).toBeDefined();
  });

  it("migration SQL should target running and paused statuses", () => {
    const migrationDir = path.resolve(__dirname, "../../../drizzle");
    const files = fs.readdirSync(migrationDir);
    const migrationFile = files.find(
      (f) => f.includes("stop_legacy_team_runs") && f.endsWith(".sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationDir, migrationFile!),
      "utf-8",
    );
    expect(sql).toContain("running");
    expect(sql).toContain("paused");
    expect(sql).toContain("queued");
    expect(sql).toContain("system_migration_051");
    expect(sql).toContain("stopped");
    expect(sql).toContain('"stopReason" IS NULL');
  });

  it("migration SQL should include time-bound guard", () => {
    const migrationDir = path.resolve(__dirname, "../../../drizzle");
    const files = fs.readdirSync(migrationDir);
    const migrationFile = files.find(
      (f) => f.includes("stop_legacy_team_runs") && f.endsWith(".sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationDir, migrationFile!),
      "utf-8",
    );
    // MED-1: time-bound guard to prevent stopping newly created runs
    expect(sql).toContain("INTERVAL");
  });

  it("should not affect already stopped or completed runs", () => {
    const migrationDir = path.resolve(__dirname, "../../../drizzle");
    const files = fs.readdirSync(migrationDir);
    const migrationFile = files.find(
      (f) => f.includes("stop_legacy_team_runs") && f.endsWith(".sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationDir, migrationFile!),
      "utf-8",
    );
    // WHERE clause only targets running/paused — extract WHERE clause and verify
    const whereClause = sql.split(/WHERE/i)[1] ?? "";
    expect(whereClause).toContain("running");
    expect(whereClause).toContain("paused");
    // WHERE should not target stopped/completed/failed directly
    expect(whereClause).not.toMatch(/IN\s*\([^)]*'stopped'/);
    expect(whereClause).not.toMatch(/IN\s*\([^)]*'completed'/);
    expect(whereClause).not.toMatch(/IN\s*\([^)]*'failed'/);
  });
});

describe("startup recovery — protect Work OS auto-team runs", () => {
  it("should recover Work OS auto-team runs stopped by the legacy migration safety net", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../runEngine.ts"),
      "utf-8",
    );

    expect(source).toContain("recoveredAutoTeamRuns");
    expect(source).toContain('eq(teamRuns.stopReason, "system_migration_051")');
    expect(source).toContain('eq(teamRuns.executionMode, "auto_team")');
    expect(source).toContain("teamRuns.constraintsJson}->>'source' = 'work_os'");
    expect(source).toContain('status: "running"');
    expect(source).toContain("runtimeTerminalReason: null");
  });

  it("legacy startup cleanup should not stop modern auto-team or Work OS runs", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../runEngine.ts"),
      "utf-8",
    );

    expect(source).toContain("Modern Work OS auto-team runs are recovered above");
    expect(source).toContain("teamRuns.executionMode} <> 'auto_team'");
    expect(source).toContain(
      "COALESCE(${teamRuns.constraintsJson}->>'source', '') <> 'work_os'",
    );
  });
});

describe("migration — journal entry", () => {
  it("should have journal entry for the migration", () => {
    const journalPath = path.resolve(
      __dirname,
      "../../../drizzle/meta/_journal.json",
    );
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const entry = journal.entries.find((e: { tag: string }) =>
      e.tag.includes("stop_legacy_team_runs"),
    );
    expect(entry).toBeDefined();
    expect(entry.idx).toBe(105);
    expect(entry.version).toBe("7");
  });
});
