import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../db", () => ({
  getDb: () => ({
    transaction: async (callback: (tx: { execute: typeof mocks.execute }) => Promise<unknown>) =>
      callback({ execute: mocks.execute }),
  }),
}));

import {
  executeSpec224RunnerInputRetention,
  SPEC224_RUNNER_INPUT_ORPHAN_GRACE_MS,
  SPEC224_RUNNER_INPUT_RETENTION_BATCH_SIZE,
  SPEC224_RUNNER_INPUT_TERMINAL_RETENTION_MS,
} from "./spec224RunnerInputRetentionService";

describe("Spec224 Runner input retention", () => {
  beforeEach(() => mocks.execute.mockReset());

  it("uses bounded transactional reconciliation and terminal/orphan cleanup", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ id: "reconciled-1" }])
      .mockResolvedValueOnce([{ id: "orphan-1" }, { id: "orphan-2" }])
      .mockResolvedValueOnce([{ deletedTerminalSources: 3, deletedAttemptInputs: 7 }]);

    await expect(executeSpec224RunnerInputRetention(new Date("2026-10-04T00:00:00Z")))
      .resolves.toEqual({
        reconciledSources: 1,
        deletedOrphanSources: 2,
        deletedTerminalSources: 3,
        deletedAttemptInputs: 7,
      });
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    expect(SPEC224_RUNNER_INPUT_ORPHAN_GRACE_MS).toBe(24 * 60 * 60 * 1000);
    expect(SPEC224_RUNNER_INPUT_TERMINAL_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("rejects an unbounded or invalid cleanup batch before accessing the database", async () => {
    await expect(executeSpec224RunnerInputRetention(new Date(), 0))
      .rejects.toThrow("SPEC224_INPUT_RETENTION_BATCH_INVALID");
    await expect(executeSpec224RunnerInputRetention(new Date(), SPEC224_RUNNER_INPUT_RETENTION_BATCH_SIZE + 1_000))
      .rejects.toThrow("SPEC224_INPUT_RETENTION_BATCH_INVALID");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
