import { describe, expect, it, vi } from "vitest";

import {
  dispatchWorkflowWorkerJob,
  getWorkflowWorkerJobStatus,
  triggerWorkflowWorkerRagIndex,
  WorkflowWorkerRuntimeError,
} from "../workflowWorkerRuntimeService";

describe("workflowWorkerRuntimeService", () => {
  it("auto-routes video_assembly dispatches to desktop workers", async () => {
    const queueWorkerJobByRuntime = vi.fn().mockResolvedValue({
      created: true,
      job: {
        id: "job-1",
        tenantId: "tenant-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "video_assembly",
        status: "queued",
        inputJson: { workspacePolicy: { allowedSourceRoots: ["C:\\Media"] } },
        instructionsJson: {},
        outputJson: {},
      },
    });

    const result = await dispatchWorkflowWorkerJob(
      {
        actor: { userId: 7, tenantId: "tenant-1", role: "user" },
        payload: {
          jobType: "video_assembly",
          workflowRunId: "run-1",
          jobRequest: {
            inputRefs: [],
            workspacePolicy: { allowedSourceRoots: ["C:\\Media"] },
            editPlan: { clips: [] },
            subtitlePlan: { mode: "none" },
            renderProfile: { gpuRequired: false },
            outputTargets: [],
          },
        },
      },
      { queueWorkerJobByRuntime: queueWorkerJobByRuntime as any },
    );

    expect(queueWorkerJobByRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeType: "desktop_zeroclaw_managed",
        tenantId: "tenant-1",
        requestedByUserId: 7,
        workflowRunId: "run-1",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        workerJobId: "job-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "video_assembly",
        status: "queued",
      }),
    );
  });

  it("auto-routes local_folder_ingest dispatches to desktop workers", async () => {
    const queueWorkerJobByRuntime = vi.fn().mockResolvedValue({
      created: true,
      job: {
        id: "job-2",
        tenantId: "tenant-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "local_folder_ingest",
        status: "queued",
        inputJson: { workspacePolicy: { allowedSourceRoots: ["C:\\Media"] } },
        instructionsJson: {},
        outputJson: {},
      },
    });

    const result = await dispatchWorkflowWorkerJob(
      {
        actor: { userId: 7, tenantId: "tenant-1", role: "user" },
        payload: {
          jobType: "local_folder_ingest",
          workflowRunId: "run-2",
          jobRequest: {
            roots: [
              {
                rootId: "quotes",
                name: "Quotes",
                path: "C:\\Media\\Quotes",
              },
            ],
            workspacePolicy: { allowedSourceRoots: ["C:\\Media"], mode: "workspace_scoped" },
            ingestPolicy: {
              maxDepth: 4,
              maxFiles: 100,
              includePreviewText: true,
              previewFileLimit: 10,
              snippetFileLimit: 0,
            },
            outputTargets: {
              publishManifestToLibrary: true,
              publishSummaryToLibrary: true,
              triggerIndexing: true,
            },
          },
        },
      },
      { queueWorkerJobByRuntime: queueWorkerJobByRuntime as any },
    );

    expect(queueWorkerJobByRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "local_folder_ingest",
        tenantId: "tenant-1",
        requestedByUserId: 7,
        workflowRunId: "run-2",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        workerJobId: "job-2",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "local_folder_ingest",
        status: "queued",
      }),
    );
  });

  it("auto-routes comfy_image_generation dispatches to desktop workers", async () => {
    const queueWorkerJobByRuntime = vi.fn().mockResolvedValue({
      created: true,
      job: {
        id: "job-comfy-1",
        tenantId: "tenant-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "comfy_image_generation",
        status: "queued",
        inputJson: {},
        instructionsJson: {},
        outputJson: {},
      },
    });

    const result = await dispatchWorkflowWorkerJob(
      {
        actor: { userId: 7, tenantId: "tenant-1", role: "user" },
        payload: {
          jobType: "comfy_image_generation",
          workflowRunId: "run-3",
          jobRequest: {
            service: {
              baseUrl: "http://127.0.0.1:8188",
              submitPath: "/prompt",
              historyPathTemplate: "/history/{promptId}",
              viewPath: "/view",
            },
            workflowJson: { "1": { class_type: "KSampler" } },
            generationSpec: {
              promptSummary: "Editorial portrait",
              gpuRequired: true,
            },
            outputTargets: {
              publishImagesToLibrary: true,
              publishManifestToLibrary: true,
              triggerIndexing: true,
              maxImages: 2,
            },
          },
        },
      },
      { queueWorkerJobByRuntime: queueWorkerJobByRuntime as any },
    );

    expect(queueWorkerJobByRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "comfy_image_generation",
        tenantId: "tenant-1",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        workerJobId: "job-comfy-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "comfy_image_generation",
        status: "queued",
      }),
    );
  });

  it("dispatches explicit NemoClaw jobs through the sandbox runtime lane", async () => {
    const queueWorkerJobByRuntime = vi.fn().mockResolvedValue({
      created: true,
      job: {
        id: "job-nemo-1",
        tenantId: "tenant-1",
        runtimeType: "nemoclaw_sandbox",
        jobType: "secure_browser_task",
        status: "queued",
        inputJson: {},
        instructionsJson: {},
        outputJson: {},
      },
    });

    const result = await dispatchWorkflowWorkerJob(
      {
        actor: { userId: 7, tenantId: "tenant-1", role: "user" },
        payload: {
          runtimeType: "nemoclaw_sandbox",
          jobType: "secure_browser_task",
          inputJson: { url: "https://example.com" },
        },
      },
      { queueWorkerJobByRuntime: queueWorkerJobByRuntime as any },
    );

    expect(queueWorkerJobByRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeType: "nemoclaw_sandbox",
        jobType: "secure_browser_task",
        capabilityFamilies: ["secure-sandbox-exec"],
      }),
    );
    expect(result.runtimeType).toBe("nemoclaw_sandbox");
  });

  it("dispatches explicit HiClaw jobs through the collaborative cluster lane", async () => {
    const queueWorkerJobByRuntime = vi.fn().mockResolvedValue({
      created: true,
      job: {
        id: "job-hiclaw-1",
        tenantId: "tenant-1",
        runtimeType: "hiclaw_cluster",
        jobType: "collaborative_agent_task",
        status: "queued",
        inputJson: {},
        instructionsJson: {},
        outputJson: {},
      },
    });

    const result = await dispatchWorkflowWorkerJob(
      {
        actor: { userId: 7, tenantId: "tenant-1", role: "user" },
        payload: {
          runtimeType: "hiclaw_cluster",
          jobType: "collaborative_agent_task",
          inputJson: { topic: "market scan" },
        },
      },
      { queueWorkerJobByRuntime: queueWorkerJobByRuntime as any },
    );

    expect(queueWorkerJobByRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeType: "hiclaw_cluster",
        jobType: "collaborative_agent_task",
        capabilityFamilies: ["multi-agent-cluster"],
      }),
    );
    expect(result.runtimeType).toBe("hiclaw_cluster");
  });

  it("rejects status access for a different non-admin user", async () => {
    const repo = {
      async getJobById() {
        return {
          id: "job-1",
          tenantId: "tenant-1",
          requestedByUserId: 13,
          runtimeType: "openclaw_gateway",
          jobType: "external_agent_task",
          status: "running",
          inputJson: {},
          instructionsJson: {},
          outputJson: {},
        };
      },
      async listArtifactsByJobId() {
        return [];
      },
      async listJobEventsByJobId() {
        return [];
      },
    };

    await expect(
      getWorkflowWorkerJobStatus(
        {
          actor: { userId: 7, tenantId: "tenant-1", role: "user" },
          jobId: "job-1",
        },
        { repo },
      ),
    ).rejects.toMatchObject<Partial<WorkflowWorkerRuntimeError>>({
      code: "forbidden",
      statusCode: 403,
    });
  });

  it("re-enqueues indexing only for published artifacts", async () => {
    const repo = {
      async getJobById() {
        return {
          id: "job-1",
          tenantId: "tenant-1",
          requestedByUserId: 7,
          runtimeType: "desktop_zeroclaw_managed",
          jobType: "video_assembly",
          status: "completed",
          inputJson: {},
          instructionsJson: {},
          outputJson: {},
        };
      },
      async listArtifactsByJobId() {
        return [
          {
            id: "artifact-1",
            publishedItemId: 101,
          },
          {
            id: "artifact-2",
            publishedItemId: null,
          },
        ];
      },
      async listJobEventsByJobId() {
        return [];
      },
    };
    const safeEnqueueLibraryIndexJob = vi.fn().mockResolvedValue({
      jobId: 901,
      status: "queued",
      created: true,
      dedupeKey: "dedupe-1",
    });

    const result = await triggerWorkflowWorkerRagIndex(
      {
        actor: { userId: 7, tenantId: "tenant-1", role: "user" },
        jobId: "job-1",
      },
      {
        repo,
        safeEnqueueLibraryIndexJob: safeEnqueueLibraryIndexJob as any,
      },
    );

    expect(safeEnqueueLibraryIndexJob).toHaveBeenCalledTimes(1);
    expect(safeEnqueueLibraryIndexJob).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryItemId: 101,
        tenantId: "tenant-1",
        source: "workflow.worker_runtime_reindex",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        workerJobId: "job-1",
        indexedCount: 1,
        publishedItemIds: [101],
      }),
    );
  });
});
