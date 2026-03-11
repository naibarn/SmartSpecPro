/**
 * Tests for taskRunStore.ts — updateTaskRunArtifact and linkArtifactToTaskRun
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    update: (...args: any[]) => mockUpdate(...args),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  }),
}));

vi.mock("./taskExecutionPlanner", () => ({
  validatePlanVersion: vi.fn().mockReturnValue(true),
}));

vi.mock("./artifactRouter", () => ({
  classifyArtifactIntent: vi.fn(),
  selectExecutionRoute: vi.fn(),
}));

import { updateTaskRunArtifact, linkArtifactToTaskRun } from "./taskRunStore";

describe("taskRunStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateTaskRunArtifact", () => {
    it("updates artifact metadata on existing task_run", async () => {
      await updateTaskRunArtifact(42, {
        artifactIntent: "presentation_deck",
        executionRoute: "deterministic_pipeline",
        routeReason: "presentation routed to deterministic pipeline",
      });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("does nothing when db is null", async () => {
      const { getDb } = await import("../db");
      vi.mocked(getDb).mockResolvedValueOnce(null as any);

      await updateTaskRunArtifact(42, {
        artifactIntent: "presentation_deck",
        executionRoute: "deterministic_pipeline",
        routeReason: "test",
      });

      // Should not throw
    });
  });

  describe("linkArtifactToTaskRun", () => {
    it("links presentation deck ID to task run", async () => {
      await linkArtifactToTaskRun(42, {
        presentationDeckId: 100,
      });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("links artifact message ID to task run", async () => {
      await linkArtifactToTaskRun(42, {
        artifactMessageId: 200,
      });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("does nothing when neither ID provided", async () => {
      await linkArtifactToTaskRun(42, {});

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
