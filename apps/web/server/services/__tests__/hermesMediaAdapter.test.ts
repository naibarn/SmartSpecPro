import { describe, expect, it, vi } from "vitest";

import {
  cancelHermesMediaTask,
  extractHermesJobReferenceAssetIds,
  getHermesMediaTask,
  HermesReferenceAssetOwnershipError,
  hermesTaskIdToJobId,
  isHermesMediaTaskId,
  listHermesMediaTasks,
  mintHermesMediaReferenceUrls,
  reconcileHermesMediaJobFee,
  type HermesMediaAdapterRepo,
} from "../hermesMediaAdapter";
import type { HermesMediaJobContract } from "../../../shared/hermesMedia";
import type { WorkerJob } from "../../../drizzle/schema";

const TENANT_ID = "tenant-1";
const USER_ID = 42;
const OTHER_USER_ID = 99;
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
    status: "queued",
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
    startedAt: null,
    finishedAt: null,
    ...overrides,
  } as WorkerJob;
}

function buildRepo(overrides: Partial<HermesMediaAdapterRepo> = {}): HermesMediaAdapterRepo {
  return {
    getJobById: vi.fn(async () => null),
    getMediaAssetForOwner: vi.fn(async () => null),
    appendJobEvent: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("isHermesMediaTaskId", () => {
  it("is true for hermes_<jobId>", () => {
    expect(isHermesMediaTaskId("hermes_abc123")).toBe(true);
  });
  it("is false for mcp_ ids", () => {
    expect(isHermesMediaTaskId("mcp_abc123")).toBe(false);
  });
  it("is false for gateway ids", () => {
    expect(isHermesMediaTaskId("gw_abc123")).toBe(false);
    expect(isHermesMediaTaskId("abc123")).toBe(false);
  });
  it("is false for the bare 'hermes_' edge case", () => {
    expect(isHermesMediaTaskId("hermes_")).toBe(false);
  });
});

describe("hermesTaskIdToJobId", () => {
  it("strips the prefix", () => {
    expect(hermesTaskIdToJobId("hermes_job-1")).toBe("job-1");
  });
});

describe("getHermesMediaTask — status mapping", () => {
  const cases: Array<[WorkerJob["status"], "pending" | "processing" | "completed" | "failed"]> = [
    ["queued", "pending"],
    ["claimed", "pending"],
    ["preparing", "pending"],
    ["running", "processing"],
    ["uploading", "processing"],
    ["publishing", "processing"],
    ["completed", "completed"],
    ["failed", "failed"],
    ["expired", "failed"],
    ["canceled", "failed"],
  ];

  it.each(cases)("maps worker_jobs status %s to MediaTask status %s", async (jobStatus, expected) => {
    const job = buildJob({ status: jobStatus, failureReason: jobStatus === "failed" ? "[HERMES_TIMEOUT] timed out" : null });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.status).toBe(expected);
  });

  it("derives errorMessage from the typed failureReason via hermesErrorCopy for failed", async () => {
    const job = buildJob({ status: "failed", failureReason: "[HERMES_TIMEOUT] Processing timed out. Please try again." });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.status).toBe("failed");
    expect(task?.errorMessage).toBeTruthy();
    expect(task?.errorMessage).not.toContain("[HERMES_TIMEOUT]");
  });

  it("canceled maps to failed with HERMES_JOB_CANCELLED copy", async () => {
    const job = buildJob({ status: "canceled" });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.status).toBe("failed");
    expect(task?.errorMessage).toBeTruthy();
  });

  // ── Section-06 amendment: MediaTask.errorCode round-trips alongside
  // the existing localized errorMessage, so section-10's client can parse
  // it (extractHermesErrorCode) for retry affordances. ──

  it("populates errorCode (typed, unstripped) alongside the localized errorMessage for a [HERMES_X]-coded failureReason", async () => {
    const job = buildJob({ status: "failed", failureReason: "[HERMES_TIMEOUT] Processing timed out. Please try again." });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.errorCode).toBe("HERMES_TIMEOUT");
    // errorMessage stays exactly as before — localized copy, no [HERMES_X] prefix.
    expect(task?.errorMessage).toBeTruthy();
    expect(task?.errorMessage).not.toContain("[HERMES_TIMEOUT]");
  });

  it("populates errorCode HERMES_JOB_CANCELLED for a canceled job", async () => {
    const job = buildJob({ status: "canceled" });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.errorCode).toBe("HERMES_JOB_CANCELLED");
    expect(task?.errorMessage).toBeTruthy();
  });

  it("populates errorCode HERMES_TIMEOUT (retryable) for an expired job whose failureReason carries the code", async () => {
    const job = buildJob({ status: "expired", failureReason: "[HERMES_TIMEOUT] Processing timed out. Please try again." });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.status).toBe("failed");
    expect(task?.errorCode).toBe("HERMES_TIMEOUT");
  });

  it("leaves errorCode undefined when failureReason doesn't follow the [HERMES_X] convention (never fabricates a code)", async () => {
    const job = buildJob({ status: "failed", failureReason: "raw worker stderr, no code" });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.errorCode).toBeUndefined();
    expect(task?.errorMessage).toBe("raw worker stderr, no code");
  });

  it("leaves both errorCode and errorMessage undefined for non-failed statuses", async () => {
    const job = buildJob({ status: "completed" });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.errorCode).toBeUndefined();
    expect(task?.errorMessage).toBeUndefined();
  });
});

describe("getHermesMediaTask — ownership", () => {
  it("returns null when requestedByUserId !== userId", async () => {
    const job = buildJob({ requestedByUserId: OTHER_USER_ID });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task).toBeNull();
  });

  it("returns null when the job does not exist", async () => {
    const repo = buildRepo({ getJobById: vi.fn(async () => null) });
    const task = await getHermesMediaTask("hermes_missing", USER_ID, { repo });
    expect(task).toBeNull();
  });
});

describe("getHermesMediaTask — resultUrl", () => {
  it("exposes resultUrl ONLY when finalize registered the asset (job.outputJson.mediaAssetId + owned media_assets row)", async () => {
    const job = buildJob({
      status: "completed",
      outputJson: { mediaAssetId: "77", libraryItemId: "5", hermesFinalized: true },
    });
    const repo = buildRepo({
      getJobById: vi.fn(async () => job),
      getMediaAssetForOwner: vi.fn(async () => ({ id: 77, storageKey: "hermes-media/tenant-1/42/output.png" })),
    });
    const presign = vi.fn(async () => ({ url: "https://signed.example/output.png", key: "hermes-media/tenant-1/42/output.png" }));
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo, presign });
    expect(task?.status).toBe("completed");
    expect(task?.resultUrl).toBe("https://signed.example/output.png");
    expect(presign).toHaveBeenCalledWith("hermes-media/tenant-1/42/output.png", expect.any(Number));
  });

  it("a completed job WITHOUT a registered asset never fabricates a resultUrl", async () => {
    const job = buildJob({ status: "completed", outputJson: null });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.status).toBe("completed");
    expect(task?.resultUrl).toBeUndefined();
  });

  it("never returns a worker-local or provider-hosted path — only the signed media_assets URL", async () => {
    const job = buildJob({
      status: "completed",
      outputJson: { mediaAssetId: "9" },
    });
    const repo = buildRepo({
      getJobById: vi.fn(async () => job),
      getMediaAssetForOwner: vi.fn(async () => ({ id: 9, storageKey: "hermes-media/tenant-1/42/out.png" })),
    });
    const presign = vi.fn(async () => null);
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo, presign });
    expect(task?.resultUrl).not.toMatch(/^https:\/\/api\.x\.ai/);
  });
});

describe("getHermesMediaTask — projection", () => {
  it("carries instructionsJson.workerBilling through parameters.workerBilling (round-trip)", async () => {
    const job = buildJob({
      instructionsJson: {
        workerBilling: { reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" },
      },
    });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(task?.parameters?.workerBilling).toEqual({
      reservationId: "res-1",
      reservedCredits: 5,
      sourceType: "worker_runtime",
    });
  });

  it("derives mediaType from jobType", async () => {
    const imageJob = buildJob({ jobType: "hermes_media_image_generate" });
    const videoJob = buildJob({ jobType: "hermes_media_video_generate", id: "job-2" });
    const repo = buildRepo({
      getJobById: vi.fn(async (jobId: string) => (jobId === "job-1" ? imageJob : videoJob)),
    });
    const imageTask = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
    const videoTask = await getHermesMediaTask("hermes_job-2", USER_ID, { repo });
    expect(imageTask?.mediaType).toBe("image");
    expect(videoTask?.mediaType).toBe("video");
  });
});

describe("cancelHermesMediaTask", () => {
  it("delegates to cancelQueuedUserWorkerJob for queued jobs", async () => {
    const job = buildJob({ status: "queued" });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    const cancelQueuedJob = vi.fn(async () => ({ canceled: true as const, jobId: job.id }));
    await cancelHermesMediaTask("hermes_job-1", USER_ID, { repo, cancelQueuedJob });
    expect(cancelQueuedJob).toHaveBeenCalledWith({ auth: { tenantId: TENANT_ID, userId: USER_ID }, jobId: "job-1" });
  });

  it("posts a cancel-requested event for claimed/running jobs", async () => {
    const job = buildJob({ status: "running" });
    const appendJobEvent = vi.fn(async () => {});
    const repo = buildRepo({ getJobById: vi.fn(async () => job), appendJobEvent });
    await cancelHermesMediaTask("hermes_job-1", USER_ID, { repo });
    expect(appendJobEvent).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", eventType: expect.stringContaining("cancel") }),
    );
  });

  it("rejects a foreign user's cancel", async () => {
    const job = buildJob({ requestedByUserId: OTHER_USER_ID });
    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
    await expect(cancelHermesMediaTask("hermes_job-1", USER_ID, { repo })).rejects.toThrow();
  });
});

describe("reconcileHermesMediaJobFee", () => {
  function buildRedis(existing?: string) {
    const store = new Map<string, string>();
    if (existing) store.set("credit:reconciled:hermes_job-1", existing);
    return {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      }),
    };
  }

  it("no-ops when there is no billing envelope (personal/private jobs)", async () => {
    const result = await reconcileHermesMediaJobFee({ taskId: "hermes_job-1", status: "failed", billing: null });
    expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
  });

  it("refunds the full reserved fee once for a failed job, and is a no-op on the second call", async () => {
    const redis = buildRedis();
    const refundReservation = vi.fn(async () => ({ refundedAmount: 5 }));
    const billing = { reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" as const };
    const first = await reconcileHermesMediaJobFee(
      { taskId: "hermes_job-1", status: "failed", billing },
      { getRedis: () => redis, refundReservation },
    );
    expect(first).toEqual({ adjusted: true, difference: -5, action: "refund" });
    expect(refundReservation).toHaveBeenCalledWith("res-1");

    const second = await reconcileHermesMediaJobFee(
      { taskId: "hermes_job-1", status: "failed", billing },
      { getRedis: () => redis, refundReservation },
    );
    expect(second).toEqual({ adjusted: false, difference: 0, action: "none" });
    expect(refundReservation).toHaveBeenCalledTimes(1);
  });

  it("keeps the fee (no refund) for a completed job", async () => {
    const redis = buildRedis();
    const refundReservation = vi.fn(async () => ({ refundedAmount: 0 }));
    const billing = { reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" as const };
    const result = await reconcileHermesMediaJobFee(
      { taskId: "hermes_job-1", status: "completed", billing },
      { getRedis: () => redis, refundReservation },
    );
    expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
    expect(refundReservation).not.toHaveBeenCalled();
  });

  it("refunds for canceled/expired terminal statuses too (raw status, not just 'failed')", async () => {
    for (const status of ["canceled", "expired"]) {
      const redis = buildRedis();
      const refundReservation = vi.fn(async () => ({ refundedAmount: 5 }));
      const billing = { reservationId: `res-${status}`, reservedCredits: 5, sourceType: "worker_runtime" as const };
      const result = await reconcileHermesMediaJobFee(
        { taskId: "hermes_job-1", status, billing },
        { getRedis: () => redis, refundReservation },
      );
      expect(result).toEqual({ adjusted: true, difference: -5, action: "refund" });
      expect(refundReservation).toHaveBeenCalledWith(`res-${status}`);
    }
  });

  // ── Code review FIX 2: internal terminal-status guard ──
  it("is a no-op (never refunds) for any non-terminal / in-flight status, even with a billing envelope present", async () => {
    for (const status of ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing"]) {
      const redis = buildRedis();
      const refundReservation = vi.fn(async () => ({ refundedAmount: 5 }));
      const billing = { reservationId: "res-inflight", reservedCredits: 5, sourceType: "worker_runtime" as const };
      const result = await reconcileHermesMediaJobFee(
        { taskId: "hermes_job-1", status, billing },
        { getRedis: () => redis, refundReservation },
      );
      expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
      expect(refundReservation).not.toHaveBeenCalled();
    }
  });
});

describe("mintHermesMediaReferenceUrls", () => {
  it("mints one URL per reference, re-verifying tenant + owner", async () => {
    const getMediaAssetForOwner = vi.fn(async ({ id }: { id: number }) => ({ id, storageKey: `key-${id}` }));
    const presign = vi.fn(async (key: string) => ({ url: `https://signed.example/${key}`, key }));
    const repo = buildRepo({ getMediaAssetForOwner });
    const results = await mintHermesMediaReferenceUrls(
      { tenantId: TENANT_ID, requestedByUserId: USER_ID, references: [{ assetId: "1" }, { assetId: "2" }] },
      { repo, presign },
    );
    expect(results).toHaveLength(2);
    expect(getMediaAssetForOwner).toHaveBeenCalledWith({ id: 1, tenantId: TENANT_ID, userId: USER_ID });
    expect(results[0].url).toContain("key-1");
  });

  it("throws a typed ownership error for an asset the requester no longer owns (never a silent skip)", async () => {
    const repo = buildRepo({ getMediaAssetForOwner: vi.fn(async () => null) });
    await expect(
      mintHermesMediaReferenceUrls(
        { tenantId: TENANT_ID, requestedByUserId: USER_ID, references: [{ assetId: "1" }] },
        { repo },
      ),
    ).rejects.toBeInstanceOf(HermesReferenceAssetOwnershipError);
  });

  it("presigns the object key when a legacy media_assets row stores a storage proxy URL", async () => {
    const getMediaAssetForOwner = vi.fn(async () => ({
      id: 1,
      storageKey: "/api/storage/files/mcp-media/tenant-1/42/output.png",
    }));
    const presign = vi.fn(async (key: string) => ({
      url: `https://signed.example/${key}`,
      key,
    }));
    const repo = buildRepo({ getMediaAssetForOwner });

    const [result] = await mintHermesMediaReferenceUrls(
      { tenantId: TENANT_ID, requestedByUserId: USER_ID, references: [{ assetId: "1" }] },
      { repo, presign },
    );

    expect(presign).toHaveBeenCalledWith(
      "mcp-media/tenant-1/42/output.png",
      expect.any(Number),
    );
    expect(result.url).toBe(
      "https://signed.example/mcp-media/tenant-1/42/output.png",
    );
  });

  it("turns a local-storage relative URL into an absolute Worker-downloadable URL", async () => {
    const getMediaAssetForOwner = vi.fn(async () => ({
      id: 1,
      storageKey: "/uploads/characters/portrait.png",
    }));
    const repo = buildRepo({ getMediaAssetForOwner });

    const [result] = await mintHermesMediaReferenceUrls(
      {
        tenantId: TENANT_ID,
        requestedByUserId: USER_ID,
        references: [{ assetId: "1" }],
      },
      {
        repo,
        presign: vi.fn(async () => null),
        resolve: vi.fn(async key => `/uploads/${key}`),
        publicAppUrl: () => "https://smartaihub.app",
      },
    );

    expect(result.url).toBe(
      "https://smartaihub.app/uploads/characters/portrait.png",
    );
  });

  it("turns the storage proxy fallback into an absolute Worker-downloadable URL", async () => {
    const repo = buildRepo({
      getMediaAssetForOwner: vi.fn(async () => ({
        id: 1,
        storageKey: "characters/portrait.png",
      })),
    });

    const [result] = await mintHermesMediaReferenceUrls(
      {
        tenantId: TENANT_ID,
        requestedByUserId: USER_ID,
        references: [{ assetId: "1" }],
      },
      {
        repo,
        presign: vi.fn(async () => null),
        resolve: vi.fn(async () => null),
        publicAppUrl: () => "https://smartaihub.app/",
      },
    );

    expect(result.url).toBe(
      "https://smartaihub.app/api/storage/files/characters/portrait.png",
    );
  });
});

describe("listHermesMediaTasks", () => {
  it("projects both image and video worker jobs for Media History", async () => {
    const imageJob = buildJob({
      id: "image-job",
      status: "failed",
      failureReason: "[HERMES_REFERENCE_DOWNLOAD_FAILED] HTTP 404",
    });
    const videoJob = buildJob({
      id: "video-job",
      jobType: "hermes_media_video_generate",
      status: "completed",
      createdAt: new Date(NOW.getTime() - 1_000),
    });
    const listJobs = vi.fn(async () => [imageJob, videoJob]);
    const repo = buildRepo();

    const tasks = await listHermesMediaTasks(
      { userId: USER_ID, limit: 50 },
      { listJobs, repo },
    );

    expect(tasks.map((task) => task.id)).toEqual([
      "hermes_image-job",
      "hermes_video-job",
    ]);
    expect(tasks.map((task) => task.mediaType)).toEqual(["image", "video"]);
    expect(tasks.map((task) => task.status)).toEqual(["failed", "completed"]);
  });

  it("applies media type and status filters before limiting the result", async () => {
    const listJobs = vi.fn(async () => [
      buildJob({ id: "pending-image", status: "queued" }),
      buildJob({ id: "completed-image", status: "completed" }),
      buildJob({
        id: "completed-video",
        jobType: "hermes_media_video_generate",
        status: "completed",
      }),
    ]);

    const tasks = await listHermesMediaTasks(
      { userId: USER_ID, mediaType: "image", status: "completed", limit: 1 },
      { listJobs, repo: buildRepo() },
    );

    expect(tasks.map((task) => task.id)).toEqual(["hermes_completed-image"]);
  });
});

describe("extractHermesJobReferenceAssetIds", () => {
  it("extracts assetIds from inputJson.references", () => {
    const job = buildJob({ inputJson: buildContract({ references: [
      { assetId: "1", index: 1, role: "subject", label: "Image 1", sha256: "a".repeat(64) },
    ] }) });
    expect(extractHermesJobReferenceAssetIds(job)).toEqual([{ assetId: "1" }]);
  });

  it("returns [] for a malformed/absent references array", () => {
    expect(extractHermesJobReferenceAssetIds({ inputJson: {} } as any)).toEqual([]);
    expect(extractHermesJobReferenceAssetIds({ inputJson: null } as any)).toEqual([]);
  });
});
