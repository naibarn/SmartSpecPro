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

    it("sends resolved retrieval scope when provided", async () => {
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

      await bridge.executeRun({
        ...baseParams,
        retrievalScope: {
          version: 1,
          experienceKey: "deep_research",
          templateDefault: "tenant_accessible",
          userOverride: "library_only",
          effectiveMode: "library_only",
          permissionFilter: {
            tenantId: "tenant-1",
            userId: 42,
          },
        },
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.retrieval_scope).toEqual({
        version: 1,
        experienceKey: "deep_research",
        templateDefault: "tenant_accessible",
        userOverride: "library_only",
        effectiveMode: "library_only",
        permissionFilter: {
          tenantId: "tenant-1",
          userId: 42,
        },
      });
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
      expect(body.retrieval_scope).toBeUndefined();
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

    it("normalizes canonical response and structured result metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          run_id: "run-1",
          status: "completed",
          response: "Research preview ready.",
          output: "Research preview ready.",
          credits_used: 0,
          duration_ms: 500,
          structured_result: {
            version: "1.0",
            intent: "research_report",
            summary: "Research preview ready.",
            payload: { title: "Market scan" },
            artifacts: [{ artifact_type: "research_report", title: "Market scan" }],
            references: [],
            metrics: {},
          },
          preview_artifacts: [{
            id: "artifact-1",
            intent: "research_report",
            artifact_type: "research_report",
            state: "preview_generated",
            summary: "Research preview ready.",
            commit_status: "not_committed",
            commit_token: "commit-token-1",
          }],
        }),
      });

      const result = await bridge.executeRun(baseParams);

      expect(result.response).toBe("Research preview ready.");
      expect(result.structuredResult?.intent).toBe("research_report");
      expect(result.previewArtifacts[0]?.state).toBe("preview_generated");
    });

    it("falls back to legacy output when canonical response is absent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          run_id: "run-1",
          status: "completed",
          output: "Legacy output text",
          credits_used: 0,
          duration_ms: 500,
        }),
      });

      const result = await bridge.executeRun(baseParams);

      expect(result.response).toBe("Legacy output text");
      expect(result.structuredResult).toBeNull();
      expect(result.previewArtifacts).toEqual([]);
    });
  });
});
