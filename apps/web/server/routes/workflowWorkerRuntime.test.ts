import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthorizeRequest,
  mockAuthenticateRequest,
  mockGetUserById,
  mockGetUserByOpenId,
} = vi.hoisted(() => ({
  mockAuthorizeRequest: vi.fn(),
  mockAuthenticateRequest: vi.fn(),
  mockGetUserById: vi.fn(),
  mockGetUserByOpenId: vi.fn(),
}));

vi.mock("../_core/authz", () => ({
  authorizeRequest: mockAuthorizeRequest,
}));

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: mockAuthenticateRequest,
  },
}));

vi.mock("../db", () => ({
  getUserById: mockGetUserById,
  getUserByOpenId: mockGetUserByOpenId,
}));

describe("workflowWorkerRuntime routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeRequest.mockResolvedValue({ ok: false, error: "Invalid token" });
    mockAuthenticateRequest.mockResolvedValue({
      id: 7,
      currentTenantId: "tenant-1",
      role: "user",
    });
    mockGetUserById.mockResolvedValue({
      id: 7,
      currentTenantId: "tenant-1",
      role: "user",
    });
    mockGetUserByOpenId.mockResolvedValue(undefined);
  });

  async function makeApp() {
    const { registerWorkflowWorkerRuntimeRoutes } = await import("./workflowWorkerRuntime");

    const services = {
      dispatchWorkflowWorkerJob: vi.fn().mockResolvedValue({
        created: true,
        workerJobId: "job-1",
        status: "queued",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "video_assembly",
      }),
      getWorkflowWorkerJobStatus: vi.fn().mockResolvedValue({
        workerJobId: "job-1",
        status: "completed",
        terminal: true,
      }),
      publishWorkflowWorkerArtifacts: vi.fn().mockResolvedValue({
        workerJobId: "job-1",
        publishedArtifacts: [],
        publishedItemIds: [],
        publishedCount: 0,
      }),
      triggerWorkflowWorkerRagIndex: vi.fn().mockResolvedValue({
        workerJobId: "job-1",
        indexingJobs: [],
        indexedCount: 0,
      }),
    };

    const app = express();
    app.use(express.json());
    registerWorkflowWorkerRuntimeRoutes(app, { services });
    return { app, services };
  }

  it("dispatches workflow worker jobs using session-style auth fallback", async () => {
    const { app, services } = await makeApp();

    const res = await request(app)
      .post("/api/internal/workflow-worker-jobs/dispatch")
      .set("Authorization", "Bearer session-like-token")
      .send({
        jobType: "video_assembly",
        jobRequest: {
          inputRefs: [],
          workspacePolicy: { allowedSourceRoots: ["C:\\Media"] },
          editPlan: { clips: [] },
          subtitlePlan: { mode: "none" },
          renderProfile: { gpuRequired: false },
          outputTargets: [],
        },
      })
      .expect(201);

    expect(services.dispatchWorkflowWorkerJob).toHaveBeenCalledWith({
      actor: { userId: 7, tenantId: "tenant-1", role: "user" },
      payload: expect.objectContaining({ jobType: "video_assembly" }),
    });
    expect(res.body.workerJobId).toBe("job-1");
  });

  it("dispatches local_folder_ingest jobs using the same workflow runtime bridge", async () => {
    const { app, services } = await makeApp();

    const res = await request(app)
      .post("/api/internal/workflow-worker-jobs/dispatch")
      .set("Authorization", "Bearer session-like-token")
      .send({
        jobType: "local_folder_ingest",
        jobRequest: {
          roots: [{
            rootId: "notes",
            name: "Notes",
            path: "C:\\\\Media\\\\Notes",
          }],
          workspacePolicy: { allowedSourceRoots: ["C:\\\\Media"] },
          ingestPolicy: { maxDepth: 4, maxFiles: 250 },
          outputTargets: { publishManifestToLibrary: true, publishSummaryToLibrary: true },
        },
      })
      .expect(201);

    expect(services.dispatchWorkflowWorkerJob).toHaveBeenCalledWith({
      actor: { userId: 7, tenantId: "tenant-1", role: "user" },
      payload: expect.objectContaining({ jobType: "local_folder_ingest" }),
    });
    expect(res.body.workerJobId).toBe("job-1");
  });

  it("rejects delegated worker bearer tokens", async () => {
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "delegated_worker",
      sub: "7",
      scopes: ["llm:chat"],
      tenantId: "tenant-1",
      userId: 7,
      ownerUserId: 7,
      workerId: "worker-1",
      workerJobId: "worker-job-1",
      delegatedSessionId: "session-1",
      runtimeType: "openclaw_gateway",
      scopeProfile: "worker_gateway_hybrid_executor",
    });

    const { app, services } = await makeApp();

    const res = await request(app)
      .get("/api/internal/workflow-worker-jobs/job-1")
      .set("Authorization", "Bearer delegated-token")
      .expect(403);

    expect(services.getWorkflowWorkerJobStatus).not.toHaveBeenCalled();
    expect(res.body.error?.code).toBe("forbidden");
  });
});
