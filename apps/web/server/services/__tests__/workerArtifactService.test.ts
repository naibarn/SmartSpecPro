import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  publishWorkerArtifacts,
  WorkerArtifactValidationError,
} from "../workerArtifactService";

describe("workerArtifactService", () => {
  const repo = {
    getJobById: vi.fn(),
    listArtifactsByJobId: vi.fn(),
    updateArtifactPublishedItem: vi.fn(),
    updateJobOutput: vi.fn(),
  };
  const createLibraryItemMock = vi.fn();
  const enqueueIndexMock = vi.fn();
  const storageGetMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    repo.getJobById.mockResolvedValue({
      id: "job-1",
      tenantId: "tenant-1",
      jobType: "external_agent_task",
      runtimeType: "openclaw_gateway",
      workerId: "worker-1",
      requestedByUserId: 7,
      inputJson: { description: "Artifact publication test" },
      outputJson: {},
    });
    repo.listArtifactsByJobId.mockResolvedValue([
      {
        id: "artifact-1",
        artifactType: "final_report",
        storageRef: "worker-artifacts/tenant-1/job-1/report.pdf",
        metadataJson: {
          checksumSha256: "a".repeat(64),
          contentType: "application/pdf",
          sizeBytes: 2048,
          fileName: "report.pdf",
        },
        publishedItemId: null,
      },
    ]);
    createLibraryItemMock.mockResolvedValue({
      item: { id: 101 },
      idempotent: false,
    });
    enqueueIndexMock.mockResolvedValue({
      status: "queued",
      jobId: 55,
      created: true,
    });
    storageGetMock.mockResolvedValue({
      key: "worker-artifacts/tenant-1/job-1/report.pdf",
      url: "https://cdn.example.com/report.pdf",
    });
  });

  it("publishes validated worker artifacts into library items", async () => {
    const results = await publishWorkerArtifacts(
      {
        tenantId: "tenant-1",
        jobId: "job-1",
      },
      {
        repo: repo as any,
        createLibraryItem: createLibraryItemMock as any,
        safeEnqueueLibraryIndexJob: enqueueIndexMock as any,
        storageGet: storageGetMock as any,
      },
    );

    expect(createLibraryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: "document",
        source: "worker_runtime",
        sourceLink: expect.objectContaining({
          linkType: "worker_artifact",
          linkId: "artifact-1",
        }),
        metadata: expect.objectContaining({
          safeServing: "inline",
          workerJobId: "job-1",
        }),
      }),
      expect.objectContaining({
        userId: 7,
        tenantId: "tenant-1",
      }),
    );
    expect(repo.updateArtifactPublishedItem).toHaveBeenCalledWith("artifact-1", 101);
    expect(results[0]).toEqual(
      expect.objectContaining({
        artifactId: "artifact-1",
        publishedItemId: 101,
        safeServing: "inline",
      }),
    );
  });

  it("redacts sensitive metadata before publishing artifacts into the library", async () => {
    repo.listArtifactsByJobId.mockResolvedValueOnce([
      {
        id: "artifact-secret",
        artifactType: "final_report",
        storageRef: "worker-artifacts/tenant-1/job-1/report.pdf",
        metadataJson: {
          checksumSha256: "e".repeat(64),
          contentType: "application/pdf",
          sizeBytes: 2048,
          fileName: "report.pdf",
          Authorization: "Bearer secret-value",
          nested: {
            session_token: "session-secret",
          },
        },
        publishedItemId: null,
      },
    ]);

    await publishWorkerArtifacts(
      {
        tenantId: "tenant-1",
        jobId: "job-1",
      },
      {
        repo: repo as any,
        createLibraryItem: createLibraryItemMock as any,
        safeEnqueueLibraryIndexJob: enqueueIndexMock as any,
        storageGet: storageGetMock as any,
      },
    );

    expect(createLibraryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          Authorization: "[REDACTED]",
          nested: {
            session_token: "[REDACTED]",
          },
        }),
      }),
      expect.any(Object),
    );
  });

  it("marks active content like SVG as download-only", async () => {
    repo.listArtifactsByJobId.mockResolvedValueOnce([
      {
        id: "artifact-svg",
        artifactType: "thumbnail",
        storageRef: "worker-artifacts/tenant-1/job-1/thumbnail.svg",
        metadataJson: {
          checksumSha256: "b".repeat(64),
          contentType: "image/svg+xml",
          sizeBytes: 1024,
          fileName: "thumbnail.svg",
        },
        publishedItemId: null,
      },
    ]);
    storageGetMock.mockResolvedValueOnce({
      key: "worker-artifacts/tenant-1/job-1/thumbnail.svg",
      url: "https://cdn.example.com/thumbnail.svg",
    });

    const results = await publishWorkerArtifacts(
      {
        tenantId: "tenant-1",
        jobId: "job-1",
      },
      {
        repo: repo as any,
        createLibraryItem: createLibraryItemMock as any,
        safeEnqueueLibraryIndexJob: enqueueIndexMock as any,
        storageGet: storageGetMock as any,
      },
    );

    expect(createLibraryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          safeServing: "download_only",
        }),
        thumbnailUrl: null,
      }),
      expect.any(Object),
    );
    expect(results[0]?.safeServing).toBe("download_only");
  });

  it("rejects artifacts with invalid storage prefixes", async () => {
    repo.listArtifactsByJobId.mockResolvedValueOnce([
      {
        id: "artifact-bad",
        artifactType: "final_report",
        storageRef: "worker-artifacts/tenant-OTHER/job-1/report.pdf",
        metadataJson: {
          checksumSha256: "c".repeat(64),
          contentType: "application/pdf",
          sizeBytes: 512,
        },
        publishedItemId: null,
      },
    ]);

    await expect(
      publishWorkerArtifacts(
        {
          tenantId: "tenant-1",
          jobId: "job-1",
        },
        {
          repo: repo as any,
          createLibraryItem: createLibraryItemMock as any,
          safeEnqueueLibraryIndexJob: enqueueIndexMock as any,
          storageGet: storageGetMock as any,
        },
      ),
    ).rejects.toMatchObject<Partial<WorkerArtifactValidationError>>({
      code: "invalid_storage_ref",
    });
  });

  it("rejects executable content types from publication", async () => {
    repo.listArtifactsByJobId.mockResolvedValueOnce([
      {
        id: "artifact-exe",
        artifactType: "binary",
        storageRef: "worker-artifacts/tenant-1/job-1/payload.bin",
        metadataJson: {
          checksumSha256: "d".repeat(64),
          contentType: "application/x-msdownload",
          sizeBytes: 512,
        },
        publishedItemId: null,
      },
    ]);

    await expect(
      publishWorkerArtifacts(
        {
          tenantId: "tenant-1",
          jobId: "job-1",
        },
        {
          repo: repo as any,
          createLibraryItem: createLibraryItemMock as any,
          safeEnqueueLibraryIndexJob: enqueueIndexMock as any,
          storageGet: storageGetMock as any,
        },
      ),
    ).rejects.toMatchObject<Partial<WorkerArtifactValidationError>>({
      code: "unsupported_content_type",
    });
  });

  it("verifies HyperFrames artifacts before publishing only the final MP4", async () => {
    repo.getJobById.mockResolvedValueOnce({
      id: "job-hf-1",
      tenantId: "tenant-1",
      jobType: "hyperframes_final_composite",
      runtimeType: "desktop_zeroclaw_managed",
      workerId: "worker-1",
      requestedByUserId: 7,
      inputJson: {
        finalVideoLengthSec: 30,
        outputRequirements: {
          aspectRatio: "9:16",
          fps: 30,
        },
      },
      outputJson: {
        assignmentAttempt: "attempt_1",
      },
    });
    repo.listArtifactsByJobId.mockResolvedValueOnce([
      {
        id: "artifact-final",
        artifactType: "hyperframes_final_video",
        storageRef: "worker-artifacts/tenant-1/job-hf-1/final.mp4",
        metadataJson: {
          assignmentAttempt: "attempt_1",
          checksumSha256: "f".repeat(64),
          contentType: "video/mp4",
          sizeBytes: 4096,
          fileName: "final.mp4",
        },
        publishedItemId: null,
      },
      {
        id: "artifact-manifest",
        artifactType: "hyperframes_render_manifest",
        storageRef: "worker-artifacts/tenant-1/job-hf-1/manifest.json",
        metadataJson: {
          assignmentAttempt: "attempt_1",
          checksumSha256: "1".repeat(64),
          contentType: "application/json",
          sizeBytes: 512,
          finalVideoChecksumSha256: "f".repeat(64),
        },
        publishedItemId: null,
      },
      {
        id: "artifact-doctor",
        artifactType: "hyperframes_runtime_doctor",
        storageRef: "worker-artifacts/tenant-1/job-hf-1/doctor.json",
        metadataJson: {
          assignmentAttempt: "attempt_1",
          checksumSha256: "2".repeat(64),
          contentType: "application/json",
          sizeBytes: 512,
          officialHyperframesRuntime: true,
        },
        publishedItemId: null,
      },
      {
        id: "artifact-probe",
        artifactType: "hyperframes_probe_report",
        storageRef: "worker-artifacts/tenant-1/job-hf-1/probe.json",
        metadataJson: {
          assignmentAttempt: "attempt_1",
          checksumSha256: "3".repeat(64),
          contentType: "application/json",
          sizeBytes: 512,
          durationSec: 30,
          aspectRatio: "9:16",
          fps: 30,
        },
        publishedItemId: null,
      },
    ]);
    storageGetMock.mockResolvedValueOnce({
      key: "worker-artifacts/tenant-1/job-hf-1/final.mp4",
      url: "https://cdn.example.com/final.mp4",
    });

    const results = await publishWorkerArtifacts(
      {
        tenantId: "tenant-1",
        jobId: "job-hf-1",
      },
      {
        repo: repo as any,
        createLibraryItem: createLibraryItemMock as any,
        safeEnqueueLibraryIndexJob: enqueueIndexMock as any,
        storageGet: storageGetMock as any,
      },
    );

    expect(createLibraryItemMock).toHaveBeenCalledTimes(1);
    expect(createLibraryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: "video",
        title: "final.mp4",
      }),
      expect.any(Object),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.artifactId).toBe("artifact-final");
    expect(repo.updateJobOutput).toHaveBeenCalledWith("job-hf-1", expect.objectContaining({
      hyperframesWorkerVerification: expect.objectContaining({
        status: "passed",
        publishableArtifactIds: ["artifact-final"],
      }),
    }));
  });

  it("stores a HyperFrames verification report and rejects fallback artifacts", async () => {
    repo.getJobById.mockResolvedValueOnce({
      id: "job-hf-1",
      tenantId: "tenant-1",
      jobType: "hyperframes_final_composite",
      runtimeType: "desktop_zeroclaw_managed",
      workerId: "worker-1",
      requestedByUserId: 7,
      inputJson: {
        finalVideoLengthSec: 30,
      },
      outputJson: {
        assignmentAttempt: "attempt_1",
      },
    });
    repo.listArtifactsByJobId.mockResolvedValueOnce([
      {
        id: "artifact-final",
        artifactType: "hyperframes_final_video",
        storageRef: "worker-artifacts/tenant-1/job-hf-1/final.mp4",
        metadataJson: {
          assignmentAttempt: "attempt_1",
          checksumSha256: "f".repeat(64),
          contentType: "video/mp4",
          sizeBytes: 4096,
          ffmpegAssFallback: true,
        },
        publishedItemId: null,
      },
      {
        id: "artifact-manifest",
        artifactType: "hyperframes_render_manifest",
        storageRef: "worker-artifacts/tenant-1/job-hf-1/manifest.json",
        metadataJson: {
          assignmentAttempt: "attempt_1",
          checksumSha256: "1".repeat(64),
          contentType: "application/json",
          sizeBytes: 512,
          finalVideoChecksumSha256: "f".repeat(64),
        },
        publishedItemId: null,
      },
      {
        id: "artifact-doctor",
        artifactType: "hyperframes_runtime_doctor",
        storageRef: "worker-artifacts/tenant-1/job-hf-1/doctor.json",
        metadataJson: {
          assignmentAttempt: "attempt_1",
          checksumSha256: "2".repeat(64),
          contentType: "application/json",
          sizeBytes: 512,
          officialHyperframesRuntime: true,
        },
        publishedItemId: null,
      },
      {
        id: "artifact-probe",
        artifactType: "hyperframes_probe_report",
        storageRef: "worker-artifacts/tenant-1/job-hf-1/probe.json",
        metadataJson: {
          assignmentAttempt: "attempt_1",
          checksumSha256: "3".repeat(64),
          contentType: "application/json",
          sizeBytes: 512,
          durationSec: 30,
          aspectRatio: "9:16",
          fps: 30,
        },
        publishedItemId: null,
      },
    ]);

    await expect(publishWorkerArtifacts(
      {
        tenantId: "tenant-1",
        jobId: "job-hf-1",
      },
      {
        repo: repo as any,
        createLibraryItem: createLibraryItemMock as any,
        safeEnqueueLibraryIndexJob: enqueueIndexMock as any,
        storageGet: storageGetMock as any,
      },
    )).rejects.toMatchObject({
      code: "fallback_output_rejected",
    });
    expect(createLibraryItemMock).not.toHaveBeenCalled();
    expect(repo.updateJobOutput).toHaveBeenCalledWith("job-hf-1", expect.objectContaining({
      hyperframesWorkerVerification: expect.objectContaining({
        status: "failed",
        failureCode: "fallback_output_rejected",
      }),
    }));
  });
});
