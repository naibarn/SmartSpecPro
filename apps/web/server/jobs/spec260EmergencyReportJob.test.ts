import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn() }));
vi.mock("../db", () => ({ getDb: () => ({ transaction: (run: (tx: unknown) => Promise<void>) => run(mocks) }) }));
vi.mock("../../drizzle/schema", () => ({ emergencyReports: {}, emergencyCases: {}, emergencyCaseEvents: {} }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), desc: vi.fn(), eq: vi.fn() }));

import { markEmergencyReportReadyForTriage } from "./spec260EmergencyReportJob";

beforeEach(() => vi.clearAllMocks());

describe("canonical emergency intake domain binding", () => {
  function reportRow(workerJobId: string, status = "triage") {
    const chain = { from: vi.fn(), where: vi.fn(), for: vi.fn(), limit: vi.fn(async () => [{ workerJobId, status }]) };
    chain.from.mockReturnValue(chain); chain.where.mockReturnValue(chain); chain.for.mockReturnValue(chain);
    mocks.select.mockReturnValue(chain);
  }

  it("rejects a report belonging to another canonical job before any mutation", async () => {
    reportRow("different-job", "received");
    await expect(markEmergencyReportReadyForTriage({ reportId: "report-1", tenantId: "tenant-a", canonicalJobId: "job-1" }))
      .rejects.toThrow("EMERGENCY_REPORT_JOB_MISMATCH");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("replays an already processed report without another event or write", async () => {
    reportRow("job-1");
    await markEmergencyReportReadyForTriage({ reportId: "report-1", tenantId: "tenant-a", canonicalJobId: "job-1" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
