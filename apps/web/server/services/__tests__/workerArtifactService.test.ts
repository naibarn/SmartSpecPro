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
});
