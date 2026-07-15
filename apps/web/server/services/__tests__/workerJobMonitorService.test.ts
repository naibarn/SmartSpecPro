import { describe, expect, it, vi } from "vitest";

const { mockResetVerticalDramaFfmpegAssemblyStateOnCancel } = vi.hoisted(() => ({
  mockResetVerticalDramaFfmpegAssemblyStateOnCancel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../verticalDramaFfmpegAssemblyRunner", () => ({
  resetVerticalDramaFfmpegAssemblyStateOnCancel: mockResetVerticalDramaFfmpegAssemblyStateOnCancel,
}));

import {
  cancelQueuedUserWorkerJob,
  getUserWorkerJobDetail,
  listUserWorkerJobs,
  type WorkerJobMonitorRepository,
} from "../workerJobMonitorService";

const createdAt = new Date("2026-01-01T10:00:00Z");
const laterAt = new Date("2026-01-01T10:05:00Z");

function createRepo(overrides: Partial<WorkerJobMonitorRepository> = {}): WorkerJobMonitorRepository {
  return {
    listUserJobs: vi.fn().mockResolvedValue([
      {
        id: "job-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
        workflowRunId: "run-1",
        requestedByUserId: 7,
        jobType: "hyperframes_final_composite",
        status: "completed",
        statusReason: null,
        resourceProfile: "cpu_heavy",
        outputJson: {
          outputRefs: [
            {
              artifactType: "video",
              publishedItemId: 42,
              signedUrl: "https://example.test/private-token",
              compositionHtml: "<html>secret</html>",
            },
          ],
        },
        failureReason: null,
        createdAt,
        startedAt: createdAt,
        finishedAt: laterAt,
        worker: {
          id: "worker-1",
          displayName: "Studio Workstation",
          machineName: "M1",
          status: "online",
          runtimeType: "desktop_zeroclaw_managed",
          lastSeenAt: laterAt,
        },
      },
    ]),
    getUserJob: vi.fn().mockResolvedValue({
      id: "job-1",
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      workflowRunId: "run-1",
      requestedByUserId: 7,
      jobType: "hyperframes_final_composite",
      status: "completed",
      statusReason: null,
      resourceProfile: "cpu_heavy",
      outputJson: {},
      failureReason: null,
      createdAt,
      startedAt: createdAt,
      finishedAt: laterAt,
      worker: null,
    }),
    listEvents: vi.fn().mockResolvedValue([
      {
        id: "event-2",
        workerJobId: "job-1",
        eventType: "job.running",
        payloadJson: {
          eventType: "shot.render.started",
          message: "Rendering shot 6/8: shot-6",
          percent: 55,
          shotId: "shot-6",
          shotIndex: 5,
          shotTotal: 8,
          leaseOwnerToken: "must-not-render",
        },
        createdAt: laterAt,
      },
      {
        id: "event-1",
        workerJobId: "job-1",
        eventType: "job.claimed",
        payloadJson: { message: "Worker accepted job" },
        createdAt,
      },
    ]),
    listArtifacts: vi.fn().mockResolvedValue([
      {
        id: "artifact-1",
        workerJobId: "job-1",
        artifactType: "video",
        storageRef: "library://items/42",
        metadataJson: {
          verificationState: "verified",
          mimeType: "video/mp4",
          sizeBytes: 1000,
          sourceUrl: "/api/storage/files/worker-artifacts/tenant-1/job-1/output.mp4",
          signedUrl: "https://example.test/secret",
        },
        publishedItemId: 42,
        createdAt: laterAt,
      },
      {
        id: "artifact-2",
        workerJobId: "job-1",
        artifactType: "partial",
        storageRef: "s3://private/partial",
        metadataJson: { verificationState: "pending" },
        publishedItemId: null,
        createdAt: laterAt,
      },
    ]),
    cancelQueuedJob: vi.fn().mockResolvedValue({
      id: "job-queued",
      tenantId: "tenant-1",
      workerId: null,
      runtimeType: "desktop_zeroclaw_managed",
      workflowRunId: null,
      requestedByUserId: 7,
      jobType: "hyperframes_final_composite",
      status: "canceled",
      statusReason: "Canceled by requester",
      resourceProfile: "cpu_heavy",
      outputJson: null,
      failureReason: null,
      createdAt,
      startedAt: null,
      finishedAt: laterAt,
    }),
    ...overrides,
  };
}

describe("workerJobMonitorService", () => {
  it("lists only jobs scoped by tenant and requester and applies status filters", async () => {
    const repo = createRepo();

    const result = await listUserWorkerJobs(
      {
        auth: { tenantId: "tenant-1", userId: 7 },
        status: "completed",
        limit: 25,
        offset: 5,
      },
      { repo },
    );

    expect(repo.listUserJobs).toHaveBeenCalledWith({
      auth: { tenantId: "tenant-1", userId: 7 },
      statuses: ["completed"],
      limit: 25,
      offset: 5,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].latestEvent).toMatchObject({
      eventType: "job.running",
      sidecarEventType: "shot.render.started",
      message: "Rendering shot 6/8: shot-6",
      progressPercent: 55,
      shotId: "shot-6",
      shotIndex: 5,
      shotTotal: 8,
    });
  });

  it("projects only safe verified output refs", async () => {
    const repo = createRepo();

    const detail = await getUserWorkerJobDetail(
      { auth: { tenantId: "tenant-1", userId: 7 }, jobId: "job-1" },
      { repo },
    );

    expect(detail.outputRefs).toEqual([
      expect.objectContaining({
        artifactId: "artifact-1",
        artifactType: "video",
        storageRef: "library://items/42",
        publishedItemId: 42,
        sourceUrl: "/api/storage/files/worker-artifacts/tenant-1/job-1/output.mp4",
        verificationState: "verified",
      }),
    ]);
    expect(JSON.stringify(detail)).not.toContain("signedUrl");
    expect(JSON.stringify(detail)).not.toContain("compositionHtml");
    expect(JSON.stringify(detail)).not.toContain("leaseOwnerToken");
  });

  it("does not expose corrupt HyperFrames final video artifacts as downloadable outputs", async () => {
    const repo = createRepo({
      getUserJob: vi.fn().mockResolvedValue({
        id: "job-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
        workflowRunId: "run-1",
        requestedByUserId: 7,
        jobType: "hyperframes_final_composite",
        status: "completed",
        statusReason: null,
        resourceProfile: "cpu_heavy",
        outputJson: {
          publishedArtifacts: [
            {
              artifactType: "hyperframes_final_video",
              publishedItemId: 511,
              sourceUrl: "/api/storage/files/worker-artifacts/tenant-1/job-1/final.mp4",
              sizeBytes: 18,
              verificationState: "passed",
            },
          ],
        },
        failureReason: null,
        createdAt,
        startedAt: createdAt,
        finishedAt: laterAt,
        worker: null,
      }),
      listArtifacts: vi.fn().mockResolvedValue([
        {
          id: "artifact-final",
          workerJobId: "job-1",
          artifactType: "hyperframes_final_video",
          storageRef: "worker-artifacts/tenant-1/job-1/final.mp4",
          metadataJson: {
            contentType: "video/mp4",
            sizeBytes: 18,
          },
          publishedItemId: 511,
          sourceUrl: "/api/storage/files/worker-artifacts/tenant-1/job-1/final.mp4",
          createdAt: laterAt,
        },
      ]),
    });

    const detail = await getUserWorkerJobDetail(
      { auth: { tenantId: "tenant-1", userId: 7 }, jobId: "job-1" },
      { repo },
    );

    expect(detail.outputRefs).toEqual([]);
    expect(detail.status).toBe("failed");
    expect(detail.failureReason).toBe("HyperFrames final video verification failed.");
  });

  it("cancels queued jobs through the repository", async () => {
    const repo = createRepo();

    await expect(cancelQueuedUserWorkerJob(
      { auth: { tenantId: "tenant-1", userId: 7 }, jobId: "job-queued" },
      { repo },
    )).resolves.toEqual({ canceled: true, jobId: "job-queued" });

    expect(repo.cancelQueuedJob).toHaveBeenCalledWith({
      auth: { tenantId: "tenant-1", userId: 7 },
      jobId: "job-queued",
    });
  });

  it("rejects cancel when the job is no longer queued", async () => {
    const repo = createRepo({
      cancelQueuedJob: vi.fn().mockResolvedValue(null),
    });

    await expect(cancelQueuedUserWorkerJob(
      { auth: { tenantId: "tenant-1", userId: 7 }, jobId: "job-1" },
      { repo },
    )).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not reset VD state when the canceled job is not a vertical_drama_ffmpeg_assembly job", async () => {
    mockResetVerticalDramaFfmpegAssemblyStateOnCancel.mockClear();
    const repo = createRepo();

    await cancelQueuedUserWorkerJob(
      { auth: { tenantId: "tenant-1", userId: 7 }, jobId: "job-queued" },
      { repo },
    );

    expect(mockResetVerticalDramaFfmpegAssemblyStateOnCancel).not.toHaveBeenCalled();
  });

  it("resets the linked VD state when a vertical_drama_ffmpeg_assembly job is canceled", async () => {
    mockResetVerticalDramaFfmpegAssemblyStateOnCancel.mockClear();
    const contractInput = {
      kind: "sub_episode" as const,
      owner: { tenantId: "tenant-1", userId: "7", seriesId: "9", episodeId: "3" },
      renderFeed: { owner: { tenantId: "tenant-1", userId: 7, seriesId: 9, episodeId: 3 } },
      contractVersion: 1 as const,
    };
    const repo = createRepo({
      cancelQueuedJob: vi.fn().mockResolvedValue({
        id: "job-vd-1",
        tenantId: "tenant-1",
        workerId: null,
        runtimeType: "desktop_zeroclaw_managed",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "vertical_drama_ffmpeg_assembly",
        status: "canceled",
        statusReason: "Canceled by requester",
        resourceProfile: "cpu_heavy",
        outputJson: null,
        failureReason: null,
        createdAt,
        startedAt: null,
        finishedAt: laterAt,
        inputJson: contractInput,
      }),
    });

    await expect(cancelQueuedUserWorkerJob(
      { auth: { tenantId: "tenant-1", userId: 7 }, jobId: "job-vd-1" },
      { repo },
    )).resolves.toEqual({ canceled: true, jobId: "job-vd-1" });

    expect(mockResetVerticalDramaFfmpegAssemblyStateOnCancel).toHaveBeenCalledTimes(1);
    expect(mockResetVerticalDramaFfmpegAssemblyStateOnCancel).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sub_episode", owner: contractInput.owner }),
    );
  });

  it("never fails the cancel when the VD state reset throws", async () => {
    mockResetVerticalDramaFfmpegAssemblyStateOnCancel.mockClear();
    mockResetVerticalDramaFfmpegAssemblyStateOnCancel.mockRejectedValueOnce(new Error("boom"));
    const contractInput = {
      kind: "trailer" as const,
      owner: { tenantId: "tenant-1", userId: "7", seriesId: "9" },
      renderFeed: { owner: { tenantId: "tenant-1", userId: 7, seriesId: 9 } },
      contractVersion: 1 as const,
    };
    const repo = createRepo({
      cancelQueuedJob: vi.fn().mockResolvedValue({
        id: "job-vd-2",
        tenantId: "tenant-1",
        workerId: null,
        runtimeType: "desktop_zeroclaw_managed",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "vertical_drama_ffmpeg_assembly",
        status: "canceled",
        statusReason: "Canceled by requester",
        resourceProfile: "cpu_heavy",
        outputJson: null,
        failureReason: null,
        createdAt,
        startedAt: null,
        finishedAt: laterAt,
        inputJson: contractInput,
      }),
    });

    await expect(cancelQueuedUserWorkerJob(
      { auth: { tenantId: "tenant-1", userId: 7 }, jobId: "job-vd-2" },
      { repo },
    )).resolves.toEqual({ canceled: true, jobId: "job-vd-2" });
  });
});
