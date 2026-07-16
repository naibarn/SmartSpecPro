import { describe, expect, it, vi } from "vitest";

import {
  finalizeHermesMediaArtifact,
  HermesMediaFinalizeError,
  type HermesMediaFinalizeDeps,
  type HermesMediaFinalizeRepo,
} from "../hermesMediaFinalizeService";
import type { HermesMediaJobContract } from "../../../shared/hermesMedia";
import type { WorkerArtifact, WorkerJob } from "../../../drizzle/schema";

const TENANT_ID = "tenant-1";
const USER_ID = 42;
const NOW = new Date("2026-06-01T12:00:00.000Z");

function buildContract(overrides: Partial<HermesMediaJobContract> = {}): HermesMediaJobContract {
  return {
    contractVersion: 1,
    operation: "image.generate",
    connectionId: "conn-1",
    prompt: "a cinematic portrait",
    settings: { model: "grok-image-1" },
    references: [],
    traceId: "trace-1",
    ...overrides,
  } as HermesMediaJobContract;
}

function buildJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: "job-1",
    tenantId: TENANT_ID,
    teamId: null,
    workerId: "worker-1",
    runtimeType: "hermes_agent_gateway",
    workflowRunId: null,
    requestedByUserId: USER_ID,
    requestedByPersonaId: null,
    requestedBySystemComponent: "hermes_media_scheduler",
    jobType: "hermes_media_image_generate",
    status: "publishing",
    statusReason: null,
    priority: 25,
    resourceProfile: "network_heavy",
    capabilityRequirementsJson: { connectionId: "conn-1" },
    inputJson: buildContract(),
    instructionsJson: {},
    outputJson: null,
    failureReason: null,
    timeoutSeconds: 600,
    retryPolicyJson: {},
    idempotencyKey: null,
    leaseOwnerToken: null,
    leaseExpiresAt: null,
    createdAt: NOW,
    startedAt: NOW,
    finishedAt: null,
    ...overrides,
  } as WorkerJob;
}

function buildArtifact(overrides: Partial<WorkerArtifact> = {}): WorkerArtifact {
  return {
    id: "artifact-1",
    workerJobId: "job-1",
    artifactType: "output_image",
    storageRef: "hermes-media/tenant-1/42/job-1/output.png",
    metadataJson: {
      checksumSha256: "a".repeat(64),
      contentType: "image/png",
      sizeBytes: 1024,
      width: 1024,
      height: 1024,
    },
    publishedItemId: null,
    createdAt: NOW,
    ...overrides,
  } as WorkerArtifact;
}

function buildRepo(overrides: Partial<HermesMediaFinalizeRepo> = {}): HermesMediaFinalizeRepo {
  return {
    insertMediaAsset: vi.fn(async () => ({ id: 501, storageKey: "hermes-media/tenant-1/42/job-1/output.png" })),
    updateArtifact: vi.fn(async () => {}),
    updateJob: vi.fn(async () => {}),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<HermesMediaFinalizeDeps> = {}): HermesMediaFinalizeDeps {
  return {
    now: () => NOW,
    verifyStoredObject: vi.fn(async () => ({ valid: true })),
    contentSafetyGate: vi.fn(async () => ({ safe: true })),
    createLibraryItem: vi.fn(async () => ({
      item: { id: 900 } as any,
      idempotent: false,
    })),
    resolveStorageUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
    resolveLibraryFolderOwner: vi.fn(async () => true),
    ...overrides,
  };
}

describe("finalizeHermesMediaArtifact", () => {
  it("checksum/mime/size mismatch → typed OUTPUT_INVALID failure, job failed, no rows created", async () => {
    const job = buildJob();
    const artifact = buildArtifact();
    const repo = buildRepo();
    const deps = buildDeps({ verifyStoredObject: vi.fn(async () => ({ valid: false, reason: "checksum_mismatch" })) });

    await expect(finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo })).rejects.toThrow(HermesMediaFinalizeError);

    expect(repo.insertMediaAsset).not.toHaveBeenCalled();
    expect(deps.createLibraryItem).not.toHaveBeenCalled();
    expect(repo.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({
      status: "failed",
      failureReason: expect.stringContaining("HERMES_OUTPUT_INVALID"),
    }));
  });

  it("happy path: creates media_assets + library_items, sets publishedItemId, writes lineage, completes the job", async () => {
    const job = buildJob({ inputJson: buildContract({ storage: { libraryFolderId: "12" } }) });
    const artifact = buildArtifact();
    const repo = buildRepo();
    const deps = buildDeps();

    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });

    expect(result).toEqual({ mediaAssetId: "501", libraryItemId: "900" });
    expect(repo.insertMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID,
      userId: USER_ID,
      storageKey: artifact.storageRef,
      mimeType: "image/png",
      checksumSha256: "a".repeat(64),
      width: 1024,
      height: 1024,
    }));
    expect(deps.createLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: "image",
        source: "hermes_media",
        parentId: 12,
        metadata: expect.objectContaining({
          operation: "image.generate",
          prompt: "a cinematic portrait",
          model: "grok-image-1",
          workerJobId: "job-1",
        }),
      }),
      expect.objectContaining({ userId: USER_ID, tenantId: TENANT_ID }),
    );
    expect(repo.updateArtifact).toHaveBeenCalledWith("artifact-1", expect.objectContaining({
      publishedItemId: 900,
      metadataJson: expect.objectContaining({ mediaAssetId: "501" }),
    }));
    expect(repo.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({
      status: "completed",
      outputJson: expect.objectContaining({ mediaAssetId: "501", libraryItemId: "900", hermesFinalized: true }),
    }));
  });

  it("defaults to the root folder when storage.libraryFolderId is absent", async () => {
    const job = buildJob();
    const artifact = buildArtifact();
    const repo = buildRepo();
    const deps = buildDeps();

    await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });

    expect(deps.createLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null }),
      expect.anything(),
    );
  });

  it("content-safety gate failure blocks publication — no rows created, job failed typed", async () => {
    const job = buildJob();
    const artifact = buildArtifact();
    const repo = buildRepo();
    const deps = buildDeps({ contentSafetyGate: vi.fn(async () => ({ safe: false, reason: "malware_detected" })) });

    await expect(finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo })).rejects.toThrow(HermesMediaFinalizeError);

    expect(repo.insertMediaAsset).not.toHaveBeenCalled();
    expect(deps.createLibraryItem).not.toHaveBeenCalled();
    expect(repo.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({
      status: "failed",
      failureReason: expect.stringContaining("HERMES_LIBRARY_REGISTRATION_FAILED"),
    }));
  });

  it("a passing content-safety scan proceeds to publication", async () => {
    const job = buildJob();
    const artifact = buildArtifact();
    const repo = buildRepo();
    const deps = buildDeps({ contentSafetyGate: vi.fn(async () => ({ safe: true })) });

    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });
    expect(result.mediaAssetId).toBe("501");
  });

  it("is idempotent on (workerJobId, artifact.id) — a duplicate completion returns the existing ids without duplicating rows", async () => {
    const job = buildJob();
    const artifact = buildArtifact({
      publishedItemId: 900,
      metadataJson: { ...buildArtifact().metadataJson, mediaAssetId: "501" },
    });
    const repo = buildRepo();
    const deps = buildDeps();

    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });

    expect(result).toEqual({ mediaAssetId: "501", libraryItemId: "900" });
    expect(repo.insertMediaAsset).not.toHaveBeenCalled();
    expect(deps.createLibraryItem).not.toHaveBeenCalled();
    expect(repo.updateJob).not.toHaveBeenCalled();
  });

  // ── Code review FIX 1: publish-phase try/catch + checkpoint recovery ──

  it("a publish-phase throw (e.g. createLibraryItem failure) fails the job typed and never leaves it stuck in 'publishing'", async () => {
    const job = buildJob();
    const artifact = buildArtifact();
    const repo = buildRepo();
    const deps = buildDeps({ createLibraryItem: vi.fn(async () => { throw new Error("library db exploded"); }) });

    await expect(finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo })).rejects.toThrow("library db exploded");

    // The media_assets row WAS inserted (checkpointed) before the failure —
    // that's expected and handled by the recovery path, not a leak.
    expect(repo.insertMediaAsset).toHaveBeenCalledTimes(1);
    expect(deps.createLibraryItem).toHaveBeenCalledTimes(1);
    expect(repo.updateArtifact).not.toHaveBeenCalled();

    // Every updateJob call must be either the checkpoint (outputJson only,
    // no status change) or the final failure — NEVER "completed", and the
    // LAST call must be the typed failure (job never stuck in "publishing").
    const calls = (repo.updateJob as any).mock.calls;
    expect(calls.some(([, values]: [string, any]) => values.status === "completed")).toBe(false);
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toEqual(expect.objectContaining({
      status: "failed",
      failureReason: expect.stringContaining("HERMES_LIBRARY_REGISTRATION_FAILED"),
    }));
  });

  it("does not mask the original error if the failure-marking updateJob call itself throws", async () => {
    const job = buildJob();
    const artifact = buildArtifact();
    let updateJobCall = 0;
    const repo = buildRepo({
      updateJob: vi.fn(async (_jobId, values) => {
        updateJobCall += 1;
        // First call is the insertMediaAsset checkpoint — let it succeed so
        // the publish phase can proceed to the point of failure.
        if (updateJobCall === 1) return;
        throw new Error("db down while marking job failed");
      }),
    });
    const deps = buildDeps({ createLibraryItem: vi.fn(async () => { throw new Error("original publish error"); }) });

    await expect(finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo })).rejects.toThrow("original publish error");
  });

  it("an interrupted-after-insert retry (job.outputJson.mediaAssetId already checkpointed) reuses the existing asset row instead of double-inserting", async () => {
    const job = buildJob({ outputJson: { mediaAssetId: "999" } });
    const artifact = buildArtifact({ publishedItemId: null });
    const repo = buildRepo();
    const deps = buildDeps();

    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });

    expect(result).toEqual({ mediaAssetId: "999", libraryItemId: "900" });
    expect(repo.insertMediaAsset).not.toHaveBeenCalled();
    expect(deps.createLibraryItem).toHaveBeenCalledTimes(1);
    expect(repo.updateArtifact).toHaveBeenCalledWith("artifact-1", expect.objectContaining({
      publishedItemId: 900,
      metadataJson: expect.objectContaining({ mediaAssetId: "999" }),
    }));
    expect(repo.updateJob).toHaveBeenLastCalledWith("job-1", expect.objectContaining({
      status: "completed",
      outputJson: expect.objectContaining({ mediaAssetId: "999" }),
    }));
  });

  // ── Code review FIX 4: library folder ownership validation ──

  it("uses the requested library folder as parentId only when ownership resolves true", async () => {
    const job = buildJob({ inputJson: buildContract({ storage: { libraryFolderId: "12" } }) });
    const artifact = buildArtifact();
    const repo = buildRepo();
    const resolveLibraryFolderOwner = vi.fn(async () => true);
    const deps = buildDeps({ resolveLibraryFolderOwner });

    await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });

    expect(resolveLibraryFolderOwner).toHaveBeenCalledWith({ folderId: 12, tenantId: TENANT_ID, userId: USER_ID });
    expect(deps.createLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 12 }),
      expect.anything(),
    );
  });

  it("defaults to root and records a lineage note when the requested folder is not owned by the requester (or missing)", async () => {
    const job = buildJob({ inputJson: buildContract({ storage: { libraryFolderId: "999999" } }) });
    const artifact = buildArtifact();
    const repo = buildRepo();
    const resolveLibraryFolderOwner = vi.fn(async () => false);
    const deps = buildDeps({ resolveLibraryFolderOwner });

    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });

    expect(result.mediaAssetId).toBe("501");
    expect(deps.createLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        metadata: expect.objectContaining({
          requestedLibraryFolderId: "999999",
          libraryFolderNote: "requested_library_folder_not_owned_by_requester",
        }),
      }),
      expect.anything(),
    );
  });
});
