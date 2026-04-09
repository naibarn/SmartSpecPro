import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthenticateRequest, mockGetAppRuntimeConfig, mockGetTenantFeatureFlags } = vi.hoisted(
  () => ({
    mockAuthenticateRequest: vi.fn(),
    mockGetAppRuntimeConfig: vi.fn(),
    mockGetTenantFeatureFlags: vi.fn(),
  }),
);

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: mockAuthenticateRequest,
  },
}));

vi.mock("../services/appRuntimeConfig", () => ({
  getAppRuntimeConfig: mockGetAppRuntimeConfig,
}));

vi.mock("../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

describe("workflowNodeTypes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppRuntimeConfig.mockResolvedValue({
      pythonBackendUrl: "http://python-backend.test",
    });
    mockAuthenticateRequest.mockResolvedValue({
      id: 7,
      currentTenantId: "tenant-1",
    });
    mockGetTenantFeatureFlags.mockResolvedValue({
      workflowBrowserSessionNodes: false,
      openClawExternalRuntime: false,
      desktopZeroClawWorker: false,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        node_types: [
          { type: "llm_call", display_name: "LLM", inputs: [], outputs: [] },
          { type: "browser_session_start", display_name: "Browser Session", inputs: [], outputs: [] },
          { type: "dispatch_worker_job", display_name: "Dispatch Worker Job", inputs: [], outputs: [] },
        ],
      }),
    }));
  });

  it("filters browser-session and worker-runtime nodes when tenant flags are disabled", async () => {
    const { registerWorkflowNodeTypesRoute } = await import("./workflowNodeTypes");

    const app = express();
    registerWorkflowNodeTypesRoute(app);

    const res = await request(app)
      .get("/api/v1/workflows/node-types")
      .expect(200);

    expect(res.body.node_types).toEqual([
      expect.objectContaining({ type: "llm_call" }),
    ]);
  });

  it("preserves runtime-aware node types when tenant flags enable them", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      workflowBrowserSessionNodes: true,
      openClawExternalRuntime: false,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

    const { registerWorkflowNodeTypesRoute } = await import("./workflowNodeTypes");

    const app = express();
    registerWorkflowNodeTypesRoute(app);

    const res = await request(app)
      .get("/api/v1/workflows/node-types")
      .expect(200);

    expect(res.body.node_types.map((node: { type: string }) => node.type)).toEqual([
      "llm_call",
      "browser_session_start",
      "dispatch_worker_job",
    ]);
  });
});
