import { describe, expect, it } from "vitest";
import { isFreshNodeWorkerHeartbeat } from "./queueHealthMonitor";

describe("isFreshNodeWorkerHeartbeat", () => {
  const now = 1_800_000_000_000;

  it("accepts a recent heartbeat from the canonical node worker", () => {
    expect(isFreshNodeWorkerHeartbeat(`${now - 10_000}\talive\t1234\n`, now)).toBe(true);
    expect(isFreshNodeWorkerHeartbeat(`${now - 10_000}\tstarting\t1234\n`, now)).toBe(true);
  });

  it("rejects stale, malformed, future-dated, and invalid-process heartbeats", () => {
    expect(isFreshNodeWorkerHeartbeat(`${now - 120_001}\talive\t1234\n`, now)).toBe(false);
    expect(isFreshNodeWorkerHeartbeat(`${now + 1}\talive\t1234\n`, now)).toBe(false);
    expect(isFreshNodeWorkerHeartbeat("not-a-timestamp\talive\t1234\n", now)).toBe(false);
    expect(isFreshNodeWorkerHeartbeat(`${now}\tstopped\t1234\n`, now)).toBe(false);
    expect(isFreshNodeWorkerHeartbeat(`${now}\talive\t0\n`, now)).toBe(false);
  });
});
