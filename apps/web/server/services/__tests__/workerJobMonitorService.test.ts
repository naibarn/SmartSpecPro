import { describe, expect, it, vi } from "vitest";

const {
  mockResetVerticalDramaFfmpegAssemblyStateOnCancel,
  mockResetEpisodePreviewStateOnCancel,
} = vi.hoisted(() => ({
  mockResetVerticalDramaFfmpegAssemblyStateOnCancel: vi.fn().mockResolvedValue(undefined),
  mockResetEpisodePreviewStateOnCancel: vi.fn().mockResolvedValue(true),
}));

vi.mock("../verticalDramaFfmpegAssemblyRunner", () => ({
  resetVerticalDramaFfmpegAssemblyStateOnCancel: mockResetVerticalDramaFfmpegAssemblyStateOnCancel,
}));
vi.mock("../verticalDramaEpisodePreview", () => ({
  resetEpisodePreviewStateOnCancel: mockResetEpisodePreviewStateOnCancel,
}));

import {
  cancelQueuedUserWorkerJob,
  getUserWorkerJobDetail,
  getUserWorkerJobRetryPolicy,
  listUserWorkerTaskGroups,
  listUserWorkerJobs,
  retryUserWorkerJob,
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
  it("requeues a safe retry-scheduled job through the canonical control plane", async () => {
    const repo = createRepo({
      getUserJob: vi.fn().mockResolvedValue({
        id: "job-retry",
        tenantId: "tenant-1",
        workerId: null,
        runtimeType: "node_job_worker",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "remotion_render_video",
        status: "retry_scheduled",
        statusReason: "TEMPORARY_UNAVAILABLE",
        resourceProfile: "cpu_heavy",
        outputJson: {},
        failureReason: "Temporary worker failure",
        errorCode: "TEMPORARY_UNAVAILABLE",
        errorMessage: "Temporary worker failure",
        operatorReviewRequired: false,
        operatorReviewReason: null,
        createdAt,
        startedAt: createdAt,
        finishedAt: null,
        worker: null,
      }),
    });
    const makeRetryDue = vi.fn().mockResolvedValue(true);

    await expect(retryUserWorkerJob(
      {
        auth: { tenantId: "tenant-1", userId: 7 },
        jobId: "job-retry",
        actionId: "retry-action-1",
      },
      { repo, controlPlane: { makeRetryDue, recoverReviewGatedJob: vi.fn() } },
    )).resolves.toEqual({
      retried: true,
      jobId: "job-retry",
      mode: "retry_scheduled",
    });

    expect(makeRetryDue).toHaveBeenCalledWith(
      "job-retry",
      "retry-action-1",
      7,
      "user_requested_retry",
      { tenantId: "tenant-1", requestedByUserId: 7, authorizationScope: "worker_jobs.user_retry" },
    );
  });

  it("recovers the known fixed Remotion runtime failure without creating a replacement job", async () => {
    const repo = createRepo({
      getUserJob: vi.fn().mockResolvedValue({
        id: "job-remotion-failure",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "node_job_worker",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "remotion_render_video",
        status: "failed",
        statusReason: "ReferenceError",
        resourceProfile: "cpu_heavy",
        outputJson: {},
        failureReason: "revisionId is not defined",
        errorCode: "render_failed",
        errorMessage: "revisionId is not defined",
        operatorReviewRequired: false,
        operatorReviewReason: null,
        createdAt,
        startedAt: createdAt,
        finishedAt: laterAt,
        worker: null,
      }),
    });
    const recoverReviewGatedJob = vi.fn().mockResolvedValue(true);

    await expect(retryUserWorkerJob(
      {
        auth: { tenantId: "tenant-1", userId: 7 },
        jobId: "job-remotion-failure",
        actionId: "retry-action-2",
      },
      { repo, controlPlane: { makeRetryDue: vi.fn(), recoverReviewGatedJob } },
    )).resolves.toEqual({
      retried: true,
      jobId: "job-remotion-failure",
      mode: "review_recovery",
    });

    expect(recoverReviewGatedJob).toHaveBeenCalledWith(
      "job-remotion-failure",
      "retry-action-2",
      "user_requested_retry",
      {
        disposition: "pre_submission_failure",
        knownRuntime: "remotion_revision_id",
      },
      7,
      { tenantId: "tenant-1", requestedByUserId: 7, authorizationScope: "worker_jobs.user_retry" },
    );
  });

  it("creates a replacement for a completed Remotion job with no verified artifact", async () => {
    const repo = createRepo({
      getUserJob: vi.fn().mockResolvedValue({
        id: "job-remotion-completed-no-artifact",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "remotion_render_video",
        status: "completed",
        statusReason: null,
        resourceProfile: "cpu_heavy",
        outputJson: {},
        failureReason: null,
        errorCode: null,
        errorMessage: null,
        operatorReviewRequired: false,
        operatorReviewReason: null,
        createdAt,
        startedAt: createdAt,
        finishedAt: laterAt,
        worker: null,
      }),
      listArtifacts: vi.fn().mockResolvedValue([]),
    });
    const retryCompletedRemotionJob = vi.fn().mockResolvedValue({
      jobId: "job-remotion-replacement",
    });

    await expect(retryUserWorkerJob(
      {
        auth: { tenantId: "tenant-1", userId: 7 },
        jobId: "job-remotion-completed-no-artifact",
        actionId: "retry-action-qc-1",
      },
      { repo, retryCompletedRemotionJob },
    )).resolves.toEqual({
      retried: true,
      jobId: "job-remotion-replacement",
      mode: "replacement_job",
    });

    expect(retryCompletedRemotionJob).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: 7,
      actionId: "retry-action-qc-1",
      job: expect.objectContaining({ id: "job-remotion-completed-no-artifact" }),
    }));
  });

  it("publishes an existing raw Remotion artifact instead of rerendering", async () => {
    const repo = createRepo({
      getUserJob: vi.fn().mockResolvedValue({
        id: "job-remotion-completed-unpublished",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "remotion_render_video",
        status: "completed",
        statusReason: null,
        resourceProfile: "cpu_heavy",
        outputJson: { contentProtection: { status: "PROTECTION_REQUESTED" } },
        failureReason: null,
        errorCode: null,
        errorMessage: null,
        operatorReviewRequired: false,
        operatorReviewReason: null,
        createdAt,
        startedAt: createdAt,
        finishedAt: laterAt,
        worker: null,
      }),
      listArtifacts: vi.fn().mockResolvedValue([{
        id: "raw-artifact-1",
        workerJobId: "job-remotion-completed-unpublished",
        artifactType: "remotion_render_mp4",
        storageRef: "worker-artifacts/tenant-1/job-remotion-completed-unpublished/render.mp4",
        metadataJson: {
          contentType: "video/mp4",
          checksumSha256: "a".repeat(64),
          sizeBytes: 1024,
        },
        publishedItemId: null,
        createdAt: laterAt,
      }]),
    });
    const publishRawArtifacts = vi.fn().mockResolvedValue(undefined);
    const retryCompletedRemotionJob = vi.fn();

    await expect(retryUserWorkerJob(
      {
        auth: { tenantId: "tenant-1", userId: 7 },
        jobId: "job-remotion-completed-unpublished",
        actionId: "retry-action-publish-1",
      },
      { repo, publishRawArtifacts, retryCompletedRemotionJob },
    )).resolves.toEqual({
      retried: true,
      jobId: "job-remotion-completed-unpublished",
      mode: "artifact_publication_recovery",
    });

    expect(publishRawArtifacts).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 7,
      jobId: "job-remotion-completed-unpublished",
    });
    expect(retryCompletedRemotionJob).not.toHaveBeenCalled();
  });

  it("retries only the failed content-protection job without rerunning the render", async () => {
    const repo = createRepo({
      getUserJob: vi.fn().mockResolvedValue({
        id: "protection-job-failed",
        tenantId: "tenant-1",
        workerId: null,
        runtimeType: "node_job_worker",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "content_protection.protect",
        status: "failed",
        statusReason: "PROTECTION_PROVIDER_CAPABILITY_UNAVAILABLE",
        resourceProfile: "external",
        outputJson: {},
        failureReason: "PROTECTION_PROVIDER_CAPABILITY_UNAVAILABLE",
        errorCode: "PROTECTION_PROVIDER_CAPABILITY_UNAVAILABLE",
        errorMessage: "provider capability unavailable",
        operatorReviewRequired: false,
        operatorReviewReason: null,
        createdAt,
        startedAt: createdAt,
        finishedAt: laterAt,
        worker: null,
      }),
    });
    const recoverReviewGatedJob = vi.fn().mockResolvedValue(true);

    await expect(retryUserWorkerJob(
      {
        auth: { tenantId: "tenant-1", userId: 7 },
        jobId: "protection-job-failed",
        actionId: "retry-action-protection-1",
      },
      { repo, controlPlane: { makeRetryDue: vi.fn(), recoverReviewGatedJob } },
    )).resolves.toEqual({
      retried: true,
      jobId: "protection-job-failed",
      mode: "review_recovery",
    });

    expect(recoverReviewGatedJob).toHaveBeenCalledWith(
      "protection-job-failed",
      "retry-action-protection-1",
      "user_requested_retry",
      {
        disposition: "provider_operation_resolved",
        knownRuntime: "content_protection_provider",
      },
      7,
      { tenantId: "tenant-1", requestedByUserId: 7, authorizationScope: "worker_jobs.user_retry" },
    );
  });

  it("allows an expired content-protection job to retry after the runtime is installed", () => {
    expect(getUserWorkerJobRetryPolicy({
      status: "expired",
      jobType: "content_protection.protect",
      statusReason: "job_deadline",
      errorCode: "JOB_DEADLINE_EXPIRED",
      errorMessage: "Job deadline has elapsed",
      failureReason: null,
      operatorReviewRequired: false,
      operatorReviewReason: null,
    })).toEqual({
      mode: "review_recovery",
      reason: "protection_provider_unavailable",
    });
  });

  it("rejects an ambiguous provider failure instead of blindly retrying it", async () => {
    const repo = createRepo({
      getUserJob: vi.fn().mockResolvedValue({
        id: "job-ambiguous",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "node_job_worker",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "storyboard.image",
        status: "failed",
        statusReason: "IMAGE_OPERATION_AMBIGUOUS",
        resourceProfile: "external",
        outputJson: {},
        failureReason: "Provider operation may still be running",
        errorCode: "IMAGE_OPERATION_AMBIGUOUS",
        errorMessage: "Provider operation may still be running",
        operatorReviewRequired: true,
        operatorReviewReason: "Provider operation may still be running",
        createdAt,
        startedAt: createdAt,
        finishedAt: laterAt,
        worker: null,
      }),
    });

    await expect(retryUserWorkerJob(
      {
        auth: { tenantId: "tenant-1", userId: 7 },
        jobId: "job-ambiguous",
        actionId: "retry-action-3",
      },
      { repo, controlPlane: { makeRetryDue: vi.fn(), recoverReviewGatedJob: vi.fn() } },
    )).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lists only jobs scoped by tenant and requester and applies status filters", async () => {
    const repo = createRepo();

    const result = await listUserWorkerJobs(
      {
        auth: { tenantId: "tenant-1", userId: 7 },
        status: "completed",
        jobType: "remotion_render_video",
        limit: 25,
        offset: 5,
      },
      { repo },
    );

    expect(repo.listUserJobs).toHaveBeenCalledWith({
      auth: { tenantId: "tenant-1", userId: 7 },
      statuses: ["completed"],
      jobType: "remotion_render_video",
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

  it("resets the linked preview slot when a Remotion preview job is canceled", async () => {
    mockResetEpisodePreviewStateOnCancel.mockClear();
    const previewInput = {
      videoProjectId: "vd-episode-preview:53:234",
      projectRevision: 2,
    };
    const repo = createRepo({
      cancelQueuedJob: vi.fn().mockResolvedValue({
        id: "job-preview-1",
        tenantId: "tenant-1",
        workerId: null,
        runtimeType: "desktop_zeroclaw_managed",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "remotion_render_video",
        status: "canceled",
        statusReason: "Canceled by requester",
        resourceProfile: "cpu_heavy",
        outputJson: null,
        failureReason: null,
        createdAt,
        startedAt: null,
        finishedAt: laterAt,
        inputJson: previewInput,
      }),
    });

    await expect(cancelQueuedUserWorkerJob(
      { auth: { tenantId: "tenant-1", userId: 7 }, jobId: "job-preview-1" },
      { repo },
    )).resolves.toEqual({ canceled: true, jobId: "job-preview-1" });

    expect(mockResetEpisodePreviewStateOnCancel).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 7,
      jobId: "job-preview-1",
      inputJson: previewInput,
    });
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

  it("groups open plan jobs and includes scoped completed predecessors", async () => {
    const makeJob = (id: string, status: string, stepIndex: number, dependsOnJobIds: string[], created: Date) => ({
      id,
      tenantId: "tenant-1",
      workerId: null,
      runtimeType: "node",
      workflowRunId: null,
      requestedByUserId: 7,
      jobType: `agent.step.${stepIndex}`,
      status,
      statusReason: null,
      resourceProfile: "standard",
      outputJson: { providerSecret: "must-not-render" },
      failureReason: null,
      inputJson: {
        orchestration: {
          planId: "plan-1",
          stepId: `plan-1:step:${stepIndex}`,
          stepIndex,
          totalSteps: 3,
          dependsOnJobIds,
          providerPayload: "must-not-render",
        },
      },
      progressJson: { progressPercent: stepIndex === 2 ? 45 : 0, phase: `phase-${stepIndex}` },
      createdAt: created,
      startedAt: created,
      finishedAt: status === "succeeded" ? laterAt : null,
      worker: null,
    });
    const completed = makeJob("job-1", "succeeded", 1, [], createdAt);
    const running = makeJob("job-2", "running", 2, ["job-1"], laterAt);
    const queued = makeJob("job-3", "queued", 3, ["job-2"], new Date("2026-01-01T10:10:00Z"));
    const repo = createRepo({
      listUserJobs: vi.fn().mockResolvedValue([queued, running]),
      listUserJobsByIds: vi.fn().mockImplementation(({ jobIds }: { jobIds: string[] }) =>
        Promise.resolve(jobIds.includes("job-1") ? [completed] : [])),
      listEvents: vi.fn().mockImplementation((jobIds: string[]) => Promise.resolve(jobIds.map(jobId => ({
        id: `event-${jobId}`,
        workerJobId: jobId,
        eventSequence: 1,
        eventType: "job.progress",
        payloadJson: { message: `Progress ${jobId}`, percent: jobId === "job-2" ? 45 : 0 },
        createdAt: jobId === "job-2" ? laterAt : createdAt,
      })))),
      listArtifacts: vi.fn().mockResolvedValue([]),
    });

    const result = await listUserWorkerTaskGroups(
      { auth: { tenantId: "tenant-1", userId: 7 }, limit: 25, offset: 0 },
      { repo },
    );

    expect(repo.listUserJobs).toHaveBeenCalledWith(expect.objectContaining({
      auth: { tenantId: "tenant-1", userId: 7 },
      statuses: expect.arrayContaining(["waiting_external", "running", "queued"]),
      offset: 0,
    }));
    expect(repo.listUserJobsByIds).toHaveBeenCalledWith({
      auth: { tenantId: "tenant-1", userId: 7 },
      jobIds: expect.arrayContaining(["job-1", "job-2"]),
    });
    expect(result.groups).toHaveLength(1);
    expect(result.sourceTruncated).toBe(false);
    expect(result.groups[0]).toMatchObject({
      groupId: "plan:plan-1",
      groupKind: "plan",
      status: "running",
      completedSteps: 1,
      totalSteps: 3,
      progressPercent: 48,
      activeStepId: "plan-1:step:2",
    });
    expect(result.groups[0].jobs.map(job => job.id)).toEqual(["job-1", "job-2", "job-3"]);
    expect(JSON.stringify(result)).not.toContain("providerSecret");
    expect(JSON.stringify(result)).not.toContain("providerPayload");
  });

  it("isolates malformed orchestration metadata as a degraded single job", async () => {
    const repo = createRepo({
      listUserJobs: vi.fn().mockResolvedValue([{
        id: "job-malformed",
        tenantId: "tenant-1",
        workerId: null,
        runtimeType: "node",
        workflowRunId: null,
        requestedByUserId: 7,
        jobType: "agent.task",
        status: "running",
        statusReason: null,
        resourceProfile: "standard",
        outputJson: null,
        failureReason: null,
        inputJson: { orchestration: { planId: "plan-without-step" } },
        progressJson: { progressPercent: 101, phase: "running" },
        createdAt,
        startedAt: createdAt,
        finishedAt: null,
        worker: null,
      }]),
      listEvents: vi.fn().mockResolvedValue([]),
      listArtifacts: vi.fn().mockResolvedValue([]),
    });

    const result = await listUserWorkerTaskGroups(
      { auth: { tenantId: "tenant-1", userId: 7 } },
      { repo },
    );

    expect(result.groups[0]).toMatchObject({
      groupId: "job:job-malformed",
      groupKind: "single",
      metadataState: "degraded",
      progressPercent: 100,
    });
  });
});
