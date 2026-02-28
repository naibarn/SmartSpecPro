import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock ENV before importing agencyBridge
vi.mock("../../_core/env", () => ({
  ENV: {
    pythonBackendUrl: "http://localhost:8000",
    webGatewayToken: "test-gateway-token",
  },
}));

import { AgencyBridge, agencyBridge } from "../agencyBridge";

describe("AgencyBridge", () => {
  let bridge: AgencyBridge;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bridge = new AgencyBridge();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("executeRun", () => {
    it("calls Python POST /api/v1/agencies/{id}/run with correct body", async () => {
      const mockResponse = {
        run_id: "run-001",
        status: "completed",
        response: "Analysis complete",
        credits_used: 5.0,
        duration_ms: 1200,
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await bridge.executeRun({
        agencyId: "agency-001",
        conversationId: "conv-001",
        message: "Analyze this data",
        userToken: "user-jwt-token",
        tenantId: "tenant-001",
        userId: 42,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://localhost:8000/api/v1/agencies/agency-001/run");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({
        conversation_id: "conv-001",
        message: "Analyze this data",
      });
      expect(result.runId).toBe("run-001");
      expect(result.status).toBe("completed");
      expect(result.response).toBe("Analysis complete");
    });

    it("passes auth headers (Authorization + X-User-Token + X-Tenant-Id)", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          run_id: "run-002",
          status: "completed",
          response: "Done",
          credits_used: 1,
          duration_ms: 500,
        }),
      });

      await bridge.executeRun({
        agencyId: "agency-001",
        conversationId: "conv-001",
        message: "Test",
        userToken: "user-bearer-token",
        tenantId: "tenant-xyz",
        userId: 99,
      });

      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers["Authorization"]).toBe("Bearer test-gateway-token");
      expect(headers["X-User-Token"]).toBe("user-bearer-token");
      expect(headers["X-Tenant-Id"]).toBe("tenant-xyz");
      expect(headers["X-User-Id"]).toBe("99");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("throws on non-2xx response from Python", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: "Internal server error" }),
      });

      await expect(
        bridge.executeRun({
          agencyId: "agency-001",
          conversationId: "conv-001",
          message: "Test",
          userToken: "token",
          tenantId: "tenant",
          userId: 1,
        }),
      ).rejects.toThrow();
    });

    it("maps HTTP 402 to credit-insufficient error", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({ detail: "Insufficient credits" }),
      });

      await expect(
        bridge.executeRun({
          agencyId: "agency-001",
          conversationId: "conv-001",
          message: "Test",
          userToken: "token",
          tenantId: "tenant",
          userId: 1,
        }),
      ).rejects.toThrow(/insufficient credits/i);
    });
  });

  describe("cancelRun", () => {
    it("calls Python POST /api/v1/agencies/{id}/runs/{runId}/cancel", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "cancelled" }),
      });

      await bridge.cancelRun("agency-001", "run-001", "user-token");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        "http://localhost:8000/api/v1/agencies/agency-001/runs/run-001/cancel",
      );
      expect(options.method).toBe("POST");
    });
  });

  describe("listRuns", () => {
    it("calls Python GET /api/v1/agencies/{id}/runs with query params", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          runs: [{ id: "run-001", status: "completed" }],
          total: 1,
        }),
      });

      const result = await bridge.listRuns("agency-001", "user-token", {
        status: "completed",
        limit: 10,
        offset: 0,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0][0];
      expect(url).toContain("/api/v1/agencies/agency-001/runs");
      expect(url).toContain("status=completed");
      expect(url).toContain("limit=10");
      expect(result.runs).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("handles empty result set", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ runs: [], total: 0 }),
      });

      const result = await bridge.listRuns("agency-001", "user-token", {});
      expect(result.runs).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe("singleton", () => {
    it("exports a singleton instance", () => {
      expect(agencyBridge).toBeInstanceOf(AgencyBridge);
    });
  });
});
