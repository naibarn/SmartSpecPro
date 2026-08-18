import { describe, expect, it } from "vitest";
import {
  advanceAgencyMigration,
  assertAgencyExecutionFrozen,
} from "../agencyDecommissionService";

describe("Agency Swarm decommission guard", () => {
  it("rejects active Agency execution", () => {
    expect(() =>
      assertAgencyExecutionFrozen({ originSurface: "agency" })
    ).toThrow(/agency_origin_forbidden/);
    expect(() =>
      assertAgencyExecutionFrozen({ migrationState: "active" })
    ).toThrow(/agency_execution_frozen/);
  });

  it("only archives after checksum, credit, and active-run parity", () => {
    const record = {
      agencyId: "a",
      tenantId: "t",
      state: "exporting" as const,
      sourceChecksum: "sum",
      creditOutcomeReconciled: false,
      activeExecutionCount: 0,
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(advanceAgencyMigration(record, {}).state).toBe("exporting");
    expect(
      advanceAgencyMigration(record, {
        exportedChecksum: "wrong",
        creditOutcomeReconciled: true,
      }).state
    ).toBe("parity_review");
    expect(
      advanceAgencyMigration(record, {
        exportedChecksum: "sum",
        creditOutcomeReconciled: true,
      }).state
    ).toBe("read_only_archived");
  });
});
