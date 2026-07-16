import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET ??= "hermes-reference-urls-route-test-secret-0123456789";

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn().mockResolvedValue({
    openClawExternalRuntime: true,
    desktopZeroClawWorker: true,
    nemoClawSecureWorkerPool: true,
    hiClawClusterRuntime: true,
    hermesMediaWorker: true,
  }),
}));

const {
  mockGetJobById,
  mockMintHermesMediaReferenceUrls,
  mockExtractHermesJobReferenceAssetIds,
} = vi.hoisted(() => ({
  mockGetJobById: vi.fn(),
  mockMintHermesMediaReferenceUrls: vi.fn(),
  mockExtractHermesJobReferenceAssetIds: vi.fn(),
}));

vi.mock("../hermesMediaAdapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hermesMediaAdapter")>();
  return {
    ...actual,
    defaultHermesMediaAdapterRepo: {
      ...actual.defaultHermesMediaAdapterRepo,
      getJobById: mockGetJobById,
    },
    mintHermesMediaReferenceUrls: mockMintHermesMediaReferenceUrls,
    extractHermesJobReferenceAssetIds: mockExtractHermesJobReferenceAssetIds,
  };
});

const { mockFinalizeHermesMediaArtifact } = vi.hoisted(() => ({
  mockFinalizeHermesMediaArtifact: vi.fn(),
}));
vi.mock("../hermesMediaFinalizeService", () => ({
  finalizeHermesMediaArtifact: mockFinalizeHermesMediaArtifact,
}));

const TENANT_ID = "tenant-1";
const WORKER_ID = "worker-1";

function buildHermesJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    tenantId: TENANT_ID,
    teamId: null,
    workerId: WORKER_ID,
    runtimeType: "openclaw_gateway",
    requestedByUserId: 7,
    jobType: "hermes_media_image_generate",
    status: "claimed",
    inputJson: {
      references: [{ assetId: "1", index: 1, role: "subject", label: "Image 1", sha256: "a".repeat(64) }],
    },
    instructionsJson: {},
    outputJson: null,
    leaseOwnerToken: "lease-token-1",
    leaseExpiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    startedAt: new Date(),
    finishedAt: null,
    ...overrides,
  };
}

async function makeApp(overrides: {
  claimWorkerJob?: (...args: any[]) => Promise<any>;
  completeWorkerArtifact?: (...args: any[]) => Promise<any>;
} = {}) {
  const { registerWorkerRuntimeRoutes } = await import("../../routes/workerRuntime");
  const app = express();
  app.use(express.json());
  registerWorkerRuntimeRoutes(app, {
    workerRegistry: {
      registerWorker: vi.fn(),
      recordWorkerHeartbeat: vi.fn(),
      claimWorkerJob: overrides.claimWorkerJob ?? vi.fn().mockResolvedValue({ job: null, queueDepth: 0 }),
      recordWorkerJobEvent: vi.fn(),
      initWorkerArtifactUpload: vi.fn(),
      completeWorkerArtifact: overrides.completeWorkerArtifact ?? vi.fn().mockResolvedValue({
        created: true,
        artifact: { id: "artifact-1" },
      }),
      recordWorkerDiagnostics: vi.fn(),
    } as any,
  });
  return app;
}

async function issueTokens(scopes?: string[]) {
  const { issueWorkerAccessTokens } = await import("../workerAuthService");
  return issueWorkerAccessTokens({
    tenantId: TENANT_ID,
    workerId: WORKER_ID,
    runtimeType: "openclaw_gateway" as any,
    scopes: scopes as any,
  });
}

async function issueToken(scopes?: string[]) {
  return (await issueTokens(scopes)).executionToken;
}

async function issueUploadToken() {
  return (await issueTokens()).uploadToken;
}

describe("Hermes media claim-time reference URL enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches referenceUrls to the claim response job payload for hermes_media_* jobs", async () => {
    const job = buildHermesJob({ status: "claimed", leaseOwnerToken: "lease-x" });
    mockExtractHermesJobReferenceAssetIds.mockReturnValue([{ assetId: "1" }]);
    mockMintHermesMediaReferenceUrls.mockResolvedValue([
      { assetId: "1", url: "https://signed.example/1.png", expiresAt: "2026-06-01T12:15:00.000Z" },
    ]);
    const claimWorkerJob = vi.fn().mockResolvedValue({ job, queueDepth: 0 });
    const app = await makeApp({ claimWorkerJob });
    const token = await issueToken();

    const res = await request(app)
      .post(`/api/workers/${WORKER_ID}/jobs/claim`)
      .set("Authorization", `Bearer ${token}`)
      .send({ maxJobs: 1, capabilityHints: ["hermes_media"] });

    expect(res.status).toBe(200);
    expect(res.body.job.referenceUrls).toEqual([
      { assetId: "1", url: "https://signed.example/1.png", expiresAt: "2026-06-01T12:15:00.000Z" },
    ]);
    expect(mockMintHermesMediaReferenceUrls).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, requestedByUserId: 7, references: [{ assetId: "1" }] }),
    );
  });

  it("claim response for non-hermes jobs is byte-identical to before (no referenceUrls key, regression)", async () => {
    const job = buildHermesJob({ jobType: "remotion_render_video" });
    const claimWorkerJob = vi.fn().mockResolvedValue({ job, queueDepth: 0 });
    const app = await makeApp({ claimWorkerJob });
    const token = await issueToken();

    const res = await request(app)
      .post(`/api/workers/${WORKER_ID}/jobs/claim`)
      .set("Authorization", `Bearer ${token}`)
      .send({ maxJobs: 1, capabilityHints: [] });

    expect(res.status).toBe(200);
    expect(res.body.job.referenceUrls).toBeUndefined();
    expect(mockMintHermesMediaReferenceUrls).not.toHaveBeenCalled();
  });

  it("a reference asset the requester no longer owns fails the claim path with a typed error, not a silent skip", async () => {
    const { HermesReferenceAssetOwnershipError } = await import("../hermesMediaAdapter");
    const job = buildHermesJob();
    mockExtractHermesJobReferenceAssetIds.mockReturnValue([{ assetId: "1" }]);
    mockMintHermesMediaReferenceUrls.mockRejectedValue(new HermesReferenceAssetOwnershipError("1"));
    const claimWorkerJob = vi.fn().mockResolvedValue({ job, queueDepth: 0 });
    const app = await makeApp({ claimWorkerJob });
    const token = await issueToken();

    const res = await request(app)
      .post(`/api/workers/${WORKER_ID}/jobs/claim`)
      .set("Authorization", `Bearer ${token}`)
      .send({ maxJobs: 1, capabilityHints: ["hermes_media"] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("hermes_reference_asset_not_found");
  });
});

describe("POST /api/worker-jobs/:jobId/references/urls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("code review FIX 3: rejects a non-hermes_media_* job id (404, matching the claim-enrichment/finalize gates)", async () => {
    mockGetJobById.mockResolvedValue(buildHermesJob({ jobType: "remotion_render_video", leaseOwnerToken: "lease-1" }));
    const app = await makeApp();
    const token = await issueToken();

    const res = await request(app)
      .post("/api/worker-jobs/job-1/references/urls")
      .set("Authorization", `Bearer ${token}`)
      .send({ leaseOwnerToken: "lease-1" });

    expect(res.status).toBe(404);
    expect(mockMintHermesMediaReferenceUrls).not.toHaveBeenCalled();
  });

  it("rejects a missing/stale lease token", async () => {
    mockGetJobById.mockResolvedValue(buildHermesJob({ leaseOwnerToken: "real-lease" }));
    const app = await makeApp();
    const token = await issueToken();

    const res = await request(app)
      .post("/api/worker-jobs/job-1/references/urls")
      .set("Authorization", `Bearer ${token}`)
      .send({ leaseOwnerToken: "wrong-lease" });

    expect(res.status).toBe(409);
  });

  it("rejects an expired lease", async () => {
    mockGetJobById.mockResolvedValue(
      buildHermesJob({ leaseOwnerToken: "lease-1", leaseExpiresAt: new Date(Date.now() - 1000) }),
    );
    const app = await makeApp();
    const token = await issueToken();

    const res = await request(app)
      .post("/api/worker-jobs/job-1/references/urls")
      .set("Authorization", `Bearer ${token}`)
      .send({ leaseOwnerToken: "lease-1" });

    expect(res.status).toBe(409);
  });

  it("rejects jobs not in an active state (claimed/preparing/running/uploading)", async () => {
    mockGetJobById.mockResolvedValue(buildHermesJob({ status: "completed", leaseOwnerToken: "lease-1" }));
    const app = await makeApp();
    const token = await issueToken();

    const res = await request(app)
      .post("/api/worker-jobs/job-1/references/urls")
      .set("Authorization", `Bearer ${token}`)
      .send({ leaseOwnerToken: "lease-1" });

    expect(res.status).toBe(409);
  });

  it("returns re-minted URLs for an active lease", async () => {
    mockGetJobById.mockResolvedValue(buildHermesJob({ status: "running", leaseOwnerToken: "lease-1" }));
    mockExtractHermesJobReferenceAssetIds.mockReturnValue([{ assetId: "1" }]);
    mockMintHermesMediaReferenceUrls.mockResolvedValue([
      { assetId: "1", url: "https://signed.example/1.png", expiresAt: "2026-06-01T12:15:00.000Z" },
    ]);
    const app = await makeApp();
    const token = await issueToken();

    const res = await request(app)
      .post("/api/worker-jobs/job-1/references/urls")
      .set("Authorization", `Bearer ${token}`)
      .send({ leaseOwnerToken: "lease-1" });

    expect(res.status).toBe(200);
    expect(res.body.referenceUrls).toEqual([
      { assetId: "1", url: "https://signed.example/1.png", expiresAt: "2026-06-01T12:15:00.000Z" },
    ]);
  });
});

describe("Hermes media finalize dispatch (artifacts/complete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches finalizeHermesMediaArtifact for hermes_media_* job artifacts", async () => {
    mockGetJobById.mockResolvedValue(buildHermesJob({ status: "publishing" }));
    mockFinalizeHermesMediaArtifact.mockResolvedValue({ mediaAssetId: "501", libraryItemId: "900" });
    const app = await makeApp();
    const token = await issueUploadToken();

    const res = await request(app)
      .post("/api/worker-jobs/job-1/artifacts/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({
        artifactType: "output_image",
        storageRef: "hermes-media/tenant-1/7/job-1/output.png",
        checksumSha256: "a".repeat(64),
        sizeBytes: 1024,
        contentType: "image/png",
        leaseOwnerToken: "lease-token-1",
      });

    expect(res.status).toBe(200);
    expect(mockFinalizeHermesMediaArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ artifact: { id: "artifact-1" } }),
    );
  });

  it("ignores non-hermes_media_* job artifacts (hyperframes finalize regression untouched)", async () => {
    mockGetJobById.mockResolvedValue(buildHermesJob({ jobType: "remotion_render_video", status: "publishing" }));
    const app = await makeApp();
    const token = await issueUploadToken();

    const res = await request(app)
      .post("/api/worker-jobs/job-1/artifacts/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({
        artifactType: "output_video",
        storageRef: "renders/tenant-1/job-1/output.mp4",
        checksumSha256: "b".repeat(64),
        sizeBytes: 2048,
        contentType: "video/mp4",
        leaseOwnerToken: "lease-token-1",
      });

    expect(res.status).toBe(200);
    expect(mockFinalizeHermesMediaArtifact).not.toHaveBeenCalled();
  });
});

describe("At-rest contract: no /url/i keys in the stored hermes job contract", () => {
  it("the scheduler's persisted inputJson (assetId + sha256 only) never carries a URL-shaped key", async () => {
    const { hermesMediaReferenceSchema } = await import("../../../shared/hermesMedia");
    const shape = hermesMediaReferenceSchema.shape;
    for (const key of Object.keys(shape)) {
      expect(key).not.toMatch(/url/i);
    }
    // .strict() schema — an extra url-ish key must be a hard parse failure.
    const parsed = hermesMediaReferenceSchema.safeParse({
      assetId: "1",
      index: 1,
      role: "subject",
      label: "Image 1",
      sha256: "a".repeat(64),
      url: "https://example.com/leak.png",
    });
    expect(parsed.success).toBe(false);
  });
});
