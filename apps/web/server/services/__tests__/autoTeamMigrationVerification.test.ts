import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import { verifyAutoTeamMigrationBaseline } from "../autoTeamMigrationVerificationService";

function makeDb() {
  let callIndex = 0;
  const responses = [
    ...Array.from({ length: 7 }, () => [{ table_name: "present" }]),
    ...Array.from({ length: 11 }, () => [{ column_name: "present" }]),
    [{ column_name: "present" }],
    ...Array.from({ length: 9 }, () => [{ indexname: "present" }]),
  ];

  return {
    execute: vi.fn(async () => responses[callIndex++] ?? []),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("autoTeamMigrationVerificationService", () => {
  it("reports the canonical tables, columns, and indexes as present when the schema is migrated", async () => {
    mockGetDb.mockResolvedValue(makeDb());

    const summary = await verifyAutoTeamMigrationBaseline({
      tenantId: "tenant-1",
    });

    expect(summary.ok).toBe(true);
    expect(summary.missingTables).toHaveLength(0);
    expect(summary.missingColumns).toHaveLength(0);
    expect(summary.missingIndexes).toHaveLength(0);
    expect(summary.tables).toHaveLength(7);
    expect(summary.workCaseAutomationColumns).toHaveLength(11);
    expect(summary.teamRoomsLanguageColumn.present).toBe(true);
  });
});
