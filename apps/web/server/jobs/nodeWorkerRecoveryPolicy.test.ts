import { describe, expect, it } from "vitest";

import {
  appendNodeWorkerRecoveryRestart,
  decideNodeWorkerRecovery,
  NODE_WORKER_RESTART_WINDOW_MS,
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

  it("leaves expired lease recovery to the canonical reconciler", () => {
    expect(decideNodeWorkerRecovery(snapshot({
      heartbeatAgeMs: 31_000,
      activeJobCount: 1,
      activeLeaseValidCount: 0,
    }))).toMatchObject({
      action: "healthy",
      reason: "active_lease_expired",
    });
  });

  it("does not restart the worker when active job leases have expired", () => {
    expect(decideNodeWorkerRecovery({
      serviceActive: true,
      serviceAgeMs: 300_000,
      heartbeatAgeMs: 0,
      queuedUnconsumedCount: 0,
      oldestQueuedUnconsumedAgeMs: null,
      activeJobCount: 1,
      activeLeaseValidCount: 0,
      restartsInWindow: 0,
    })).toEqual({ action: "healthy", reason: "active_lease_expired" });
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

  it("keeps only recent restart timestamps when recording a restart", () => {
    const now = 1_000_000;
    expect(appendNodeWorkerRecoveryRestart([
      now - NODE_WORKER_RESTART_WINDOW_MS - 1,
      now - 5_000,
      Number.NaN,
    ], now)).toEqual([now - 5_000, now]);
  });
});
