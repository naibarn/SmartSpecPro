import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgencyBridge, type RunResult } from "./agencyBridge";
import type { AgencyTaskMetadata } from "./agencyEscalation";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("AgencyBridge", () => {
  let bridge: AgencyBridge;

  beforeEach(() => {
    bridge = new AgencyBridge();
    mockFetch.mockReset();
  });

  describe("executeRun with task metadata", () => {
    const baseParams = {
      agencyId: "agency-1",
      conversationId: "conv-1",
      message: "test message",
      userToken: "tok-123",
      tenantId: "tenant-1",
      userId: 42,
    };

    const taskMetadata: AgencyTaskMetadata = {
      task_run_id: 99,
      task_type: "agency",
      execution_strategy: "cheapest",
      capability_requirements: { supportsResponses: true },
      budget_class: "standard",
      route_reason: "agency task type",
      plan_version: 1,
    };

    it("sends task metadata when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          run_id: "run-1",
          status: "completed",
          response: "done",
          credits_used: 5,
          duration_ms: 1000,
        }),
      });

      await bridge.executeRun({ ...baseParams, taskMetadata });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.task_metadata).toEqual(taskMetadata);
    });

    it("omits task_metadata when not provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          run_id: "run-1",
          status: "completed",
          response: "done",
          credits_used: 0,
          duration_ms: 500,
        }),
      });

      await bridge.executeRun(baseParams);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.task_metadata).toBeUndefined();
    });

    it("returns step attempt snapshots when present in response", async () => {
      const snapshots = [
        {
          model_id: "gpt-4o",
          provider: "openai",
          input_tokens: 100,
          output_tokens: 50,
          credits_used: 3,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          run_id: "run-1",
          status: "completed",
          response: "done",
          credits_used: 3,
          duration_ms: 800,
          step_attempt_snapshots: snapshots,
        }),
      });

      const result = await bridge.executeRun({
        ...baseParams,
        taskMetadata,
      });

      expect(result.runId).toBe("run-1");
      expect(result.stepAttemptSnapshots).toEqual(snapshots);
    });

    it("returns empty snapshots array when not in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          run_id: "run-1",
          status: "completed",
          response: "done",
          credits_used: 0,
          duration_ms: 500,
        }),
      });

      const result = await bridge.executeRun(baseParams);
      expect(result.stepAttemptSnapshots).toEqual([]);
    });
  });
});
