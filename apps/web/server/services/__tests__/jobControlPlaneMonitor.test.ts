import { describe, expect, it } from "vitest";

import { decodeJobMonitorCursor, encodeJobMonitorCursor, getLatestWorkerHeartbeats } from "../jobControlPlaneMonitor";

describe("canonical job monitor cursor", () => {
  it("round-trips a deterministic createdAt/id cursor", () => {
    const encoded = encodeJobMonitorCursor({ createdAt: "2026-09-13T00:00:00.000Z", jobId: "job-1" });
    expect(decodeJobMonitorCursor(encoded)).toEqual({ createdAt: "2026-09-13T00:00:00.000Z", jobId: "job-1" });
  });

  it("rejects tampered or malformed cursors", () => {
    expect(() => decodeJobMonitorCursor("not-a-cursor")).toThrow("JOB_MONITOR_CURSOR_INVALID");
    const encoded = encodeJobMonitorCursor({ createdAt: "2026-09-13T00:00:00.000Z", jobId: "job-1" });
    const [payload, signature] = encoded.split(".");
    expect(() => decodeJobMonitorCursor(`${Buffer.from(JSON.stringify({ createdAt: "2026-09-14T00:00:00.000Z", jobId: "job-1" })).toString("base64url")}.${signature}`)).toThrow("JOB_MONITOR_CURSOR_INVALID");
    expect(() => decodeJobMonitorCursor(`${payload}.bad`)).toThrow("JOB_MONITOR_CURSOR_INVALID");
  });
});

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("worker heartbeat dashboard reads", () => {
  it("returns at most one heartbeat row per worker", async () => {
    const { getDb } = await import("../../db");
    const { workers } = await import("../../../drizzle/schema");
    const db = await getDb();

    const workerRows = await db.select({ id: workers.id }).from(workers);
    const rows = await getLatestWorkerHeartbeats(workerRows.map((worker) => worker.id));

    expect(rows.length).toBeLessThanOrEqual(workerRows.length);
    expect(new Set(rows.map((row) => row.workerId)).size).toBe(rows.length);
  });

  it("does not load fleet capacity for a user-scoped dashboard summary", async () => {
    const { getWorkerJobDashboardSummary } = await import("../jobControlPlaneMonitor");

    const summary = await getWorkerJobDashboardSummary({
      tenantId: "tenant-test-dashboard",
      userId: 999999999,
    });

    expect(summary.scope).toBe("user");
    expect(summary.capacity.workersTotal).toBe(0);
    expect(summary.capacity.slotSources).toEqual([]);
  });
});
