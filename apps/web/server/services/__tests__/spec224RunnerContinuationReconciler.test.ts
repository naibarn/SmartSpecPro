import { describe, expect, it } from "vitest";

import { runnerCapabilitySnapshotCoversReceipt } from "../spec224RunnerContinuationReconciler";

const intent = {
  capabilitySnapshotId: "snapshot-id-1",
  capabilitySnapshotRevision: "revision-1",
  runnerSessionId: "runner-session-1",
};

function snapshot(overrides: Partial<{
  revision: string;
  observedAt: Date;
  expiresAt: Date;
  snapshotJson: Record<string, unknown>;
}> = {}) {
  return {
    revision: "revision-1",
    observedAt: new Date("2026-11-02T14:49:45.623Z"),
    expiresAt: new Date("2026-11-02T14:54:45.623Z"),
    snapshotJson: {
      capabilitySnapshotId: "snapshot-id-1",
      runnerSessionId: "runner-session-1",
    },
    ...overrides,
  };
}

describe("runnerCapabilitySnapshotCoversReceipt", () => {
  it("accepts a receipt covered by its bound historical snapshot after a newer snapshot is published", () => {
    expect(
      runnerCapabilitySnapshotCoversReceipt(
        intent,
        snapshot(),
        new Date("2026-11-02T14:51:38.497Z")
      )
    ).toBe(true);
  });

  it.each([
    ["wrong snapshot revision", { revision: "revision-2" }],
    ["wrong snapshot identity", { snapshotJson: { capabilitySnapshotId: "other", runnerSessionId: intent.runnerSessionId } }],
    ["wrong Runner session", { snapshotJson: { capabilitySnapshotId: intent.capabilitySnapshotId, runnerSessionId: "other-session" } }],
    ["not yet observed", { observedAt: new Date("2026-11-02T14:52:00.000Z") }],
    ["expired before receipt", { expiresAt: new Date("2026-11-02T14:51:00.000Z") }],
  ])("rejects a snapshot with %s", (_description, overrides) => {
    expect(
      runnerCapabilitySnapshotCoversReceipt(
        intent,
        snapshot(overrides),
        new Date("2026-11-02T14:51:38.497Z")
      )
    ).toBe(false);
  });
});
