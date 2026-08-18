import { describe, expect, it } from "vitest";

import { reconcileShotVideoPromptJobUiState } from "../shotVideoPromptJobState";

describe("reconcileShotVideoPromptJobUiState", () => {
  it("clears a stale running label when the server reports no active jobs", () => {
    const result = reconcileShotVideoPromptJobUiState({
      jobs: [],
      locallyPollingShots: new Set(),
      previousStatusByShot: { 6: "running" },
    });

    expect(result.statusByShot).toEqual({});
    expect([...result.generatingShots]).toEqual([]);
  });

  it("projects active server jobs and ignores terminal jobs", () => {
    const result = reconcileShotVideoPromptJobUiState({
      jobs: [
        { shotNumber: 2, status: "queued" },
        { shotNumber: 6, status: "running" },
        { shotNumber: 8, status: "failed" },
      ],
      locallyPollingShots: new Set(),
      previousStatusByShot: { 8: "running" },
    });

    expect(result.statusByShot).toEqual({ 2: "queued", 6: "running" });
    expect([...result.generatingShots]).toEqual([2, 6]);
  });

  it("preserves a just-submitted local job while the active-job query catches up", () => {
    const result = reconcileShotVideoPromptJobUiState({
      jobs: [],
      locallyPollingShots: new Set([6, 7]),
      previousStatusByShot: { 6: "running" },
    });

    expect(result.statusByShot).toEqual({ 6: "running", 7: "queued" });
    expect([...result.generatingShots]).toEqual([6, 7]);
  });
});
