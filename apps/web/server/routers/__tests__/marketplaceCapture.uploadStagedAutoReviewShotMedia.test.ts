/**
 * Marketplace Auto Review staged pipeline — `uploadStagedAutoReviewShotMedia`
 * router-layer contract. Mirrors the convention in
 * `marketplaceCapture.generateStagedAutoReviewShotPrompt.test.ts`: a full
 * mock of `../services/marketplaceAutoReviewStagedCheckpointRouterService`
 * so this test exercises ONLY the router wiring (input validation, file
 * sniffing, storage key shape, auth threading) — not the service's DB
 * transaction internals (covered separately by
 * `marketplaceAutoReviewStagedShotMediaUpload.test.ts`).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = "test-jwt-secret-for-marketplace-capture-router";
  }
});

vi.mock("../../db", () => ({ getDb: vi.fn(async () => null) }));

const { mockUploadStagedAutoReviewShotMedia, mockStoragePut } = vi.hoisted(() => ({
  mockUploadStagedAutoReviewShotMedia: vi.fn(),
  mockStoragePut: vi.fn(),
}));

vi.mock("../../services/marketplaceAutoReviewStagedCheckpointRouterService", () => ({
  uploadStagedAutoReviewShotMedia: mockUploadStagedAutoReviewShotMedia,
  // Every other export this router file imports from the same module —
  // stubbed as no-ops. None of these are invoked by the mutation under
  // test, so a plain vi.fn() (returning undefined) is safe here.
  acceptStagedAutoReviewImage: vi.fn(),
  approveStagedAutoReviewCheckpoint: vi.fn(),
  editStagedAutoReviewAudioPlan: vi.fn(),
  editStagedAutoReviewFinalAssembly: vi.fn(),
  editStagedAutoReviewShot: vi.fn(),
  generateStagedAutoReviewShotPrompt: vi.fn(),
  getStagedAutoReviewCheckpointState: vi.fn(),
  rejectStagedAutoReviewCheckpoint: vi.fn(),
  redraftStagedAutoReviewPlan: vi.fn(),
  retryStagedAutoReviewShot: vi.fn(),
  retryStagedAutoReviewAudioPlan: vi.fn(),
  retryStagedAutoReviewFinalAssembly: vi.fn(),
  updateStagedAutoReviewReferenceManifest: vi.fn(),
}));

vi.mock("../../storage", () => ({
  assertR2StorageActive: vi.fn().mockResolvedValue(undefined),
  storagePut: mockStoragePut,
}));

import { marketplaceCaptureRouter } from "../marketplaceCapture";
import type { TrpcContext } from "../../_core/context";

function createContext(user: Record<string, unknown> | null): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: user as TrpcContext["user"],
    userToken: null,
    privateVaultToken: null,
    tenantId: "tenant_router",
    publicUrl: "https://example.test",
  };
}

// 1x1 transparent PNG (valid PNG magic bytes: 0x89 0x50 ...).
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
// Minimal MP4 "ftyp" box header bytes (valid MP4 magic bytes at offset 4).
const MP4_BASE64 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
]).toString("base64");

const BASE_INPUT = {
  runId: "run-1",
  shotId: 3,
  expectedStateDigest: "digest-1",
  idempotencyKey: "idem-key-00000001",
};

describe("uploadStagedAutoReviewShotMedia router mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a video file uploaded into the image slot with BAD_REQUEST before storage/service are ever touched", async () => {
    const caller = marketplaceCaptureRouter.createCaller(
      createContext({ id: 42, currentTenantId: "tenant_router" })
    );

    await expect(
      caller.uploadStagedAutoReviewShotMedia({
        ...BASE_INPUT,
        stage: "image",
        fileName: "clip.mp4",
        fileType: "video/mp4",
        fileBase64: MP4_BASE64,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockStoragePut).not.toHaveBeenCalled();
    expect(mockUploadStagedAutoReviewShotMedia).not.toHaveBeenCalled();
  });

  it("rejects an image file uploaded into the video slot with BAD_REQUEST before storage/service are ever touched", async () => {
    const caller = marketplaceCaptureRouter.createCaller(
      createContext({ id: 42, currentTenantId: "tenant_router" })
    );

    await expect(
      caller.uploadStagedAutoReviewShotMedia({
        ...BASE_INPUT,
        stage: "video",
        fileName: "frame.png",
        fileType: "image/png",
        fileBase64: PNG_BASE64,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockStoragePut).not.toHaveBeenCalled();
    expect(mockUploadStagedAutoReviewShotMedia).not.toHaveBeenCalled();
  });

  it("accepts a matching image upload, stores it under the staged-pipeline manual-uploads path, and threads runId/shotId/stage/auth to the service", async () => {
    mockStoragePut.mockResolvedValueOnce({
      key: "marketplace-auto-review/run-1/manual-uploads/3-image-abc.png",
      url: "https://cdn.example.test/marketplace-auto-review/run-1/manual-uploads/3-image-abc.png",
    });
    mockUploadStagedAutoReviewShotMedia.mockResolvedValueOnce({
      runId: "run-1",
      operation: { operationId: "staged-op-abc", stateDigest: "digest-2" },
      status: "queued",
    });

    const caller = marketplaceCaptureRouter.createCaller(
      createContext({ id: 42, currentTenantId: "tenant_router" })
    );

    const result = await caller.uploadStagedAutoReviewShotMedia({
      ...BASE_INPUT,
      stage: "image",
      fileName: "frame.png",
      fileType: "image/png",
      fileBase64: PNG_BASE64,
    });

    expect(result).toEqual({
      runId: "run-1",
      operation: { operationId: "staged-op-abc", stateDigest: "digest-2" },
      status: "queued",
    });

    expect(mockStoragePut).toHaveBeenCalledTimes(1);
    const [key, , contentType] = mockStoragePut.mock.calls[0];
    expect(key).toMatch(
      /^marketplace-auto-review\/run-1\/manual-uploads\/3-image-[^/]+\.png$/
    );
    expect(contentType).toBe("image/png");

    expect(mockUploadStagedAutoReviewShotMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        shotId: 3,
        stage: "image",
        url: "https://cdn.example.test/marketplace-auto-review/run-1/manual-uploads/3-image-abc.png",
        expectedStateDigest: "digest-1",
        idempotencyKey: "idem-key-00000001",
        auth: expect.objectContaining({ userId: 42 }),
      })
    );
  });

  it("rejects a claimed image/png upload whose bytes don't match the PNG magic-byte signature", async () => {
    const caller = marketplaceCaptureRouter.createCaller(
      createContext({ id: 42, currentTenantId: "tenant_router" })
    );

    await expect(
      caller.uploadStagedAutoReviewShotMedia({
        ...BASE_INPUT,
        stage: "image",
        fileName: "frame.png",
        fileType: "image/png",
        fileBase64: Buffer.from("not actually a png").toString("base64"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockStoragePut).not.toHaveBeenCalled();
    expect(mockUploadStagedAutoReviewShotMedia).not.toHaveBeenCalled();
  });

  it("rejects with no user (auth enforced by the real protectedProcedure middleware)", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.uploadStagedAutoReviewShotMedia({
        ...BASE_INPUT,
        stage: "image",
        fileName: "frame.png",
        fileType: "image/png",
        fileBase64: PNG_BASE64,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
