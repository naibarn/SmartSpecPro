import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: () => ({ execute: mockExecute }),
}));

import {
  cleanupWorkerHeartbeatRetention,
  getHeartbeatRetentionCutoff,
} from "../workerHeartbeatRetentionService";

describe("worker heartbeat retention", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("calculates a deterministic cutoff from the configured retention window", () => {
    const now = new Date("2026-09-17T00:00:00.000Z");
    expect(getHeartbeatRetentionCutoff(now, 30)).toEqual(
      new Date("2026-08-18T00:00:00.000Z")
    );
  });

  it("deletes old rows in bounded batches until the database is drained", async () => {
    mockExecute
      .mockResolvedValueOnce([{ id: "heartbeat-1" }, { id: "heartbeat-2" }])
      .mockResolvedValueOnce([]);

    const result = await cleanupWorkerHeartbeatRetention({
      now: new Date("2026-09-17T00:00:00.000Z"),
      retentionDays: 30,
      batchSize: 2,
    });

    expect(result).toEqual({
      deletedHeartbeats: 2,
      batches: 2,
      cutoff: "2026-08-18T00:00:00.000Z",
    });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});
