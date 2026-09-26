import { describe, expect, it } from "vitest";

import {
  decideNodeWorkerRecovery,
  type NodeWorkerHealthSnapshot,
} from "./nodeWorkerRecoveryPolicy";

function snapshot(
  overrides: Partial<NodeWorkerHealthSnapshot> = {},
): NodeWorkerHealthSnapshot {
  return {
    serviceActive: true,
    serviceAgeMs: 60_000,
    heartbeatAgeMs: 5_000,
    queuedUnconsumedCount: 0,
    oldestQueuedUnconsumedAgeMs: null,
    activeJobCount: 0,
    activeLeaseValidCount: 0,
    restartsInWindow: 0,
    ...overrides,
  };
}

describe("node worker recovery policy", () => {
  it("restarts an active service that stopped heartbeating", () => {
    expect(decideNodeWorkerRecovery(snapshot({ heartbeatAgeMs: 31_000 }))).toMatchObject({
      action: "restart",
      reason: "heartbeat_stale",
    });
  });

  it("does not restart a stale-heartbeat service while an active lease is valid", () => {
    expect(decideNodeWorkerRecovery(snapshot({
      heartbeatAgeMs: 31_000,
      activeJobCount: 1,
      activeLeaseValidCount: 1,
    }))).toMatchObject({
      action: "healthy",
      reason: "active_lease",
    });
  });

  it("restarts after the active job lease has expired", () => {
    expect(decideNodeWorkerRecovery(snapshot({
      heartbeatAgeMs: 31_000,
      activeJobCount: 1,
      activeLeaseValidCount: 0,
    }))).toMatchObject({
      action: "restart",
      reason: "active_lease_expired",
    });
  });

  it("restarts when an active job remains after every lease has expired", () => {
    expect(decideNodeWorkerRecovery({
      serviceActive: true,
      serviceAgeMs: 300_000,
      heartbeatAgeMs: 0,
      queuedUnconsumedCount: 0,
      oldestQueuedUnconsumedAgeMs: null,
      activeJobCount: 1,
      activeLeaseValidCount: 0,
      restartsInWindow: 0,
    })).toEqual({ action: "restart", reason: "active_lease_expired" });
  });

  it("allows startup time before treating a missing heartbeat as stale", () => {
    expect(decideNodeWorkerRecovery(snapshot({
      heartbeatAgeMs: null,
      serviceAgeMs: 10_000,
    }))).toMatchObject({
      action: "healthy",
      reason: "startup_grace",
    });
  });

  it("restarts when published work is waiting for a free worker slot", () => {
    expect(decideNodeWorkerRecovery(snapshot({
      queuedUnconsumedCount: 4,
      oldestQueuedUnconsumedAgeMs: 121_000,
      activeJobCount: 0,
    }))).toMatchObject({
      action: "restart",
      reason: "dispatch_backlog",
    });
  });

  it("does not restart while the worker is actively dispatching work", () => {
    expect(decideNodeWorkerRecovery(snapshot({
      queuedUnconsumedCount: 4,
      oldestQueuedUnconsumedAgeMs: 121_000,
      activeJobCount: 4,
      activeLeaseValidCount: 4,
    }))).toMatchObject({ action: "healthy" });
  });

  it("opens a circuit after repeated restarts", () => {
    expect(decideNodeWorkerRecovery(snapshot({
      serviceActive: false,
      restartsInWindow: 3,
    }))).toMatchObject({
      action: "alert",
      reason: "restart_circuit_open",
    });
  });
});
