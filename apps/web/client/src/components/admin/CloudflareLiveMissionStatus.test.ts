import { describe, expect, it } from "vitest";
import { missionCondition } from "./CloudflareLiveMissionStatus";

describe("canonical migration job condition", () => {
  const now = Date.parse("2026-10-27T15:00:00Z");
  it("distinguishes queue, worker claim, waiting and active execution", () => {
    expect(missionCondition({ status: "queued" }, now)).toBe("QUEUED");
    expect(missionCondition({ status: "claimed" }, now)).toBe("CLAIMED");
    expect(missionCondition({ status: "waiting_external" }, now)).toBe("WAITING");
    expect(missionCondition({ status: "running", heartbeatAt: new Date(now - 5000), leaseExpiresAt: new Date(now + 5000) }, now)).toBe("RUNNING");
  });
  it("does not confuse stale or expired active leases with terminal jobs", () => {
    expect(missionCondition({ status: "running", heartbeatAt: new Date(now - 100_000) }, now)).toBe("HEARTBEAT_STALE");
    expect(missionCondition({ status: "running", leaseExpiresAt: new Date(now - 1) }, now)).toBe("LEASE_EXPIRED");
    expect(missionCondition({ status: "failed", leaseExpiresAt: new Date(now - 1) }, now)).toBe("FAILED");
    expect(missionCondition({ status: "succeeded" }, now)).toBe("SUCCEEDED");
  });
});
