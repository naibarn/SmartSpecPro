import { describe, expect, it } from "vitest";

import { decodeJobMonitorCursor, encodeJobMonitorCursor } from "../jobControlPlaneMonitor";

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
