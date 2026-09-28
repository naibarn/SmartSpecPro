import { describe, expect, it, vi } from "vitest";

import {
  buildContinuityRepairInstruction,
  runVerticalDramaContinuityRepairLoop,
  VERTICAL_DRAMA_CONTINUITY_AUTO_REPAIR_MAX_ATTEMPTS,
} from "../verticalDramaEpisodePipeline";

describe("buildContinuityRepairInstruction", () => {
  it("gives finale repair the exact canonical ID and the persisted resolution field", () => {
    const instruction = buildContinuityRepairInstruction([
      {
        code: "season_thread_unresolved",
        threadId: "canonical-witness-thread",
        message:
          "Thread canonical-witness-thread remains open at the season boundary.",
      },
    ]);

    expect(instruction).toContain(
      "canonical thread_id: canonical-witness-thread"
    );
    expect(instruction).toContain("episode_memory.threads_resolved");
    expect(instruction).toContain(
      "Changing only open_loops.expected_resolution"
    );
  });
});

describe("runVerticalDramaContinuityRepairLoop", () => {
  it("reloads and revalidates after a repair until the continuity gate passes", async () => {
    const validate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        issues: [{ code: "season_thread_unresolved", message: "open thread" }],
      })
      .mockResolvedValueOnce({ ok: true, issues: [] });
    const repair = vi.fn().mockResolvedValue({ succeeded: true });
    const reload = vi.fn().mockResolvedValue({ version: 2 });

    const result = await runVerticalDramaContinuityRepairLoop({
      initial: { version: 1 },
      validate,
      repair,
      reload,
    });

    expect(result).toMatchObject({
      value: { version: 2 },
      validation: { ok: true },
      repairAttempts: 1,
      lastRepairErrors: [],
    });
    expect(repair).toHaveBeenCalledWith(
      [{ code: "season_thread_unresolved", message: "open thread" }],
      1
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it("stops after the bounded repair budget and returns the latest failure", async () => {
    const validate = vi.fn().mockResolvedValue({
      ok: false,
      issues: [{ code: "season_thread_unresolved", message: "still open" }],
    });
    const repair = vi.fn().mockResolvedValue({
      succeeded: true,
    });
    const reload = vi.fn().mockResolvedValue({ version: 2 });

    const result = await runVerticalDramaContinuityRepairLoop({
      initial: { version: 1 },
      validate,
      repair,
      reload,
      maxRepairAttempts: VERTICAL_DRAMA_CONTINUITY_AUTO_REPAIR_MAX_ATTEMPTS,
    });

    expect(result.validation.ok).toBe(false);
    expect(result.repairAttempts).toBe(
      VERTICAL_DRAMA_CONTINUITY_AUTO_REPAIR_MAX_ATTEMPTS
    );
    expect(repair).toHaveBeenCalledTimes(
      VERTICAL_DRAMA_CONTINUITY_AUTO_REPAIR_MAX_ATTEMPTS
    );
    expect(reload).toHaveBeenCalledTimes(
      VERTICAL_DRAMA_CONTINUITY_AUTO_REPAIR_MAX_ATTEMPTS
    );
    expect(validate).toHaveBeenCalledTimes(
      VERTICAL_DRAMA_CONTINUITY_AUTO_REPAIR_MAX_ATTEMPTS + 1
    );
  });

  it("does not spend a repair attempt when the initial validation passes", async () => {
    const validate = vi.fn().mockResolvedValue({ ok: true, issues: [] });
    const repair = vi.fn();
    const reload = vi.fn();

    const result = await runVerticalDramaContinuityRepairLoop({
      initial: { version: 1 },
      validate,
      repair,
      reload,
    });

    expect(result.repairAttempts).toBe(0);
    expect(repair).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
