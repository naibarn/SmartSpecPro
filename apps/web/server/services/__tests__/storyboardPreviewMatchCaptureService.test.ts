import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

import {
  buildPreviewMatchCompositionPayloadFromHyperframesPreview,
  withPreviewMatchCompositionHashes,
} from "../../../shared/storyboardPreviewMatchCapture";
import {
  createPreviewMatchFinalCompositeCaptureForApi,
  getPreviewMatchCaptureJobForApi,
  projectionFromPreviewMatchCaptureJob,
  readStoryboardPreviewMatchCaptureRuntimeConfig,
  type StoryboardPreviewMatchCaptureRepository,
} from "../storyboardPreviewMatchCaptureService";

function makePayload() {
  return withPreviewMatchCompositionHashes(
    buildPreviewMatchCompositionPayloadFromHyperframesPreview(
      {
        output: { width: 1080, height: 1920, fps: 30, durationSeconds: 6 },
        text: { overlayPreset: "badge_cascade" },
        audio: { preserveNativeAudio: true },
        shots: [
          {
            id: "shot-1",
            index: 0,
            sourceClipId: "clip-1",
            sourceVideoRef: "storage://clip-1.mp4",
            mediaStartSec: 0,
            startSec: 0,
            endSec: 6,
            durationSeconds: 6,
            overlayPreset: "badge_cascade",
            animationPreset: "smooth_reveal",
            transition: "fade",
            textMotionPreset: "smooth",
            onScreenText: ["line"],
            subtitleCues: [{ startSec: 0, endSec: 2, text: "caption" }],
            subtitleText: ["caption"],
          },
        ],
      },
      {
        tenantId: "default",
        productId: "product-1",
        runId: "run-1",
        storyboardReviewId: "review-1",
      },
    ),
  );
}

function makeRepo(): StoryboardPreviewMatchCaptureRepository {
  return {
    findRun: vi.fn(async () => ({
      id: "run-1",
      tenantId: null,
      userId: 7,
      productId: "product-1",
      storyboardReviewId: "review-1",
    })),
    findJobByIdempotencyKey: vi.fn(async () => null),
    findJobById: vi.fn(async () => null),
    findJobForInternalRoute: vi.fn(async () => null),
    findLatestJob: vi.fn(async () => null),
    insertJob: vi.fn(async values => values as any),
    updateJob: vi.fn(async () => null),
    markActiveAttemptStale: vi.fn(async () => undefined),
    insertAttempt: vi.fn(async values => values as any),
    findAttempt: vi.fn(async () => null),
  };
}

function makeManualAliasRepo(): StoryboardPreviewMatchCaptureRepository {
  const repo = makeRepo();
  return {
    ...repo,
    findRun: vi.fn(async input => ({
      id: input.runId,
      tenantId: null,
      userId: 7,
      productId: "product-1",
      storyboardReviewId: input.runId,
    })),
  };
}

describe("storyboardPreviewMatchCaptureService", () => {
  it("projects elapsed capture time for completed jobs", () => {
    const payload = makePayload();
    const projection = projectionFromPreviewMatchCaptureJob({
      id: "capture-1",
      tenantId: "default",
      userId: 7,
      productId: "product-1",
      runId: "run-1",
      storyboardReviewId: "review-1",
      engine: "preview_match_browser_capture",
      quality: "standard",
      status: "saved_to_library",
      stage: "publish_library",
      progressPercent: 100,
      failureCode: null,
      safeMessage: null,
      safeDiagnosticsJson: [],
      idempotencyKey: "idem",
      previewCompositionHash: payload.previewCompositionHash,
      timelineHash: payload.timelineHash,
      finalCompositeConfigHash: payload.finalCompositeConfigHash,
      payloadJson: payload,
      outputJson: { url: "https://example.test/final.mp4", libraryItemId: 12 },
      evidenceJson: {},
      billingJson: {},
      activeAttemptId: null,
      createdAt: new Date("2026-06-28T10:00:00.000Z"),
      updatedAt: new Date("2026-06-28T10:02:05.000Z"),
      completedAt: new Date("2026-06-28T10:02:03.000Z"),
      cancelledAt: null,
    } as any);

    expect(projection.captureElapsedSeconds).toBe(123);
  });

  it("creates a queued capture job from a normalized preview-match payload", async () => {
    const payload = makePayload();
    const repo = makeRepo();
    const reserveCredits = vi.fn(async () => ({ reservedCredits: 4 }) as any);
    const dispatchCaptureJob = vi.fn(async () => undefined);

    const result = await createPreviewMatchFinalCompositeCaptureForApi(
      {
        auth: { userId: 7 },
        productId: "product-1",
        runId: "run-1",
        storyboardReviewId: "review-1",
        quality: "standard",
        expectedPreviewCompositionHash: payload.previewCompositionHash,
        expectedTimelineHash: payload.timelineHash,
        finalCompositeConfigHash: payload.finalCompositeConfigHash,
        output: payload.output,
        payload,
      },
      { repo, reserveCredits, dispatchCaptureJob, runtimeConfig: { serverWorkerEnabled: true } },
    );

    expect(result.capture.status).toBe("queued");
    expect(result.capture.previewCompositionHash).toBe(payload.previewCompositionHash);
    expect(reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tenantId: "default",
        requestedCredits: expect.any(Number),
      }),
    );
    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "default",
        productId: "product-1",
        runId: "run-1",
        storyboardReviewId: "review-1",
      }),
    );
    expect(dispatchCaptureJob).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "default" }),
    );
  });

  it("accepts manual Storyboard Review run aliases while storing the page review id", async () => {
    const payload = makePayload();
    const repo = makeManualAliasRepo();

    const result = await createPreviewMatchFinalCompositeCaptureForApi(
      {
        auth: { userId: 7 },
        productId: "product-1",
        runId: "manual-run-1",
        storyboardReviewId: "1",
        quality: "standard",
        expectedPreviewCompositionHash: payload.previewCompositionHash,
        expectedTimelineHash: payload.timelineHash,
        finalCompositeConfigHash: payload.finalCompositeConfigHash,
        output: payload.output,
        payload: {
          ...payload,
          runId: "manual-run-1",
          storyboardReviewId: "1",
        },
      },
      {
        repo,
        reserveCredits: vi.fn(async () => ({ reservedCredits: 4 }) as any),
        dispatchCaptureJob: vi.fn(async () => undefined),
        runtimeConfig: { serverWorkerEnabled: true },
      },
    );

    expect(result.capture.status).toBe("queued");
    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "manual-run-1",
        storyboardReviewId: "1",
      }),
    );
  });

  it("does not require a marketplace product/run row for manual Storyboard Review capture", async () => {
    const payload = makePayload();
    const repo = {
      ...makeRepo(),
      findRun: vi.fn(async () => null),
      ensureManualStoryboardParents: vi.fn(async () => undefined),
    };
    const reserveCredits = vi.fn(async () => ({ reservedCredits: 4 }) as any);
    const dispatchCaptureJob = vi.fn(async () => undefined);

    const result = await createPreviewMatchFinalCompositeCaptureForApi(
      {
        auth: { userId: 7 },
        productId: "manual_storyboard_product_1782006453374-k5236d",
        runId: "manual_storyboard_run_1782006453374-k5236d",
        storyboardReviewId: "94",
        quality: "standard",
        expectedPreviewCompositionHash: payload.previewCompositionHash,
        expectedTimelineHash: payload.timelineHash,
        finalCompositeConfigHash: payload.finalCompositeConfigHash,
        output: payload.output,
        payload: {
          ...payload,
          productId: "manual_storyboard_product_1782006453374-k5236d",
          runId: "manual_storyboard_run_1782006453374-k5236d",
          storyboardReviewId: "94",
        },
      },
      { repo, reserveCredits, dispatchCaptureJob, runtimeConfig: { serverWorkerEnabled: true } },
    );

    expect(result.capture.status).toBe("queued");
    expect(repo.findRun).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "manual_storyboard_product_1782006453374-k5236d",
        runId: "manual_storyboard_run_1782006453374-k5236d",
      }),
    );
    expect(repo.ensureManualStoryboardParents).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "manual_storyboard_product_1782006453374-k5236d",
        runId: "manual_storyboard_run_1782006453374-k5236d",
        storyboardReviewId: "94",
      }),
    );
    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "manual_storyboard_product_1782006453374-k5236d",
        runId: "manual_storyboard_run_1782006453374-k5236d",
        storyboardReviewId: "94",
      }),
    );
  });

  it("still requires a real run row for non-manual preview-match captures", async () => {
    const payload = makePayload();
    const repo = {
      ...makeRepo(),
      findRun: vi.fn(async () => null),
    };

    await expect(
      createPreviewMatchFinalCompositeCaptureForApi(
        {
          auth: { userId: 7 },
          productId: "product-1",
          runId: "run-1",
          storyboardReviewId: "94",
          quality: "standard",
          expectedPreviewCompositionHash: payload.previewCompositionHash,
          expectedTimelineHash: payload.timelineHash,
          finalCompositeConfigHash: payload.finalCompositeConfigHash,
          output: payload.output,
          payload: {
            ...payload,
            storyboardReviewId: "94",
          },
        },
        {
          repo,
          reserveCredits: vi.fn() as any,
          runtimeConfig: { serverWorkerEnabled: true },
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Storyboard Review run was not found for this product.",
    });
  });

  it("sanitizes insert failures after credit reservation and reconciles credits", async () => {
    const payload = makePayload();
    const rawDbError = new Error(
      'insert failed [{"payloadJson":{"shots":[{"subtitleCues":[{"text":"raw subtitle should not leak"}]}]}}]'
    );
    const repo = {
      ...makeRepo(),
      insertJob: vi.fn(async () => {
        throw rawDbError;
      }),
      findJobByIdempotencyKey: vi.fn(async () => null),
    };
    const reserveCredits = vi.fn(async () => ({ reservedCredits: 4 }) as any);
    const reconcileCredits = vi.fn(async () => undefined);

    const capturedError = await createPreviewMatchFinalCompositeCaptureForApi(
      {
        auth: { userId: 7 },
        productId: "product-1",
        runId: "run-1",
        storyboardReviewId: "review-1",
        quality: "standard",
        expectedPreviewCompositionHash: payload.previewCompositionHash,
        expectedTimelineHash: payload.timelineHash,
        finalCompositeConfigHash: payload.finalCompositeConfigHash,
        output: payload.output,
        payload,
      },
      {
        repo,
        reserveCredits,
        reconcileCredits: reconcileCredits as any,
        runtimeConfig: { serverWorkerEnabled: true },
      },
    ).catch(error => error);

    expect(capturedError).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "เริ่ม Capture ตาม Preview ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    });
    expect(capturedError.message).not.toContain("payloadJson");
    expect(reconcileCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tenantId: "default",
        finalStatus: "failed",
      }),
    );
  });

  it("still rejects mismatched numeric Storyboard Review identities", async () => {
    const payload = makePayload();
    const repo = {
      ...makeRepo(),
      findRun: vi.fn(async () => ({
        id: "run-1",
        tenantId: null,
        userId: 7,
        productId: "product-1",
        storyboardReviewId: "2",
      })),
    };

    await expect(
      createPreviewMatchFinalCompositeCaptureForApi(
        {
          auth: { userId: 7 },
          productId: "product-1",
          runId: "run-1",
          storyboardReviewId: "1",
          quality: "standard",
          expectedPreviewCompositionHash: payload.previewCompositionHash,
          expectedTimelineHash: payload.timelineHash,
          finalCompositeConfigHash: payload.finalCompositeConfigHash,
          output: payload.output,
          payload: {
            ...payload,
            storyboardReviewId: "1",
          },
        },
        {
          repo,
          reserveCredits: vi.fn() as any,
          runtimeConfig: { serverWorkerEnabled: true },
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Storyboard Review identity does not match this run.",
    });
  });

  it("rejects stale preview hashes before reserving credits", async () => {
    const payload = makePayload();
    const reserveCredits = vi.fn();

    await expect(
      createPreviewMatchFinalCompositeCaptureForApi(
        {
          auth: { userId: 7 },
          productId: "product-1",
          runId: "run-1",
          storyboardReviewId: "review-1",
          quality: "standard",
          expectedPreviewCompositionHash: "pmc_stale",
          expectedTimelineHash: payload.timelineHash,
          finalCompositeConfigHash: payload.finalCompositeConfigHash,
          output: payload.output,
          payload,
        },
        {
          repo: makeRepo(),
          reserveCredits: reserveCredits as any,
          runtimeConfig: { serverWorkerEnabled: true },
        },
      ),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("fails closed when preview-match capture is disabled", async () => {
    const payload = makePayload();

    await expect(
      createPreviewMatchFinalCompositeCaptureForApi(
        {
          auth: { userId: 7 },
          productId: "product-1",
          runId: "run-1",
          storyboardReviewId: "review-1",
          quality: "standard",
          expectedPreviewCompositionHash: payload.previewCompositionHash,
          expectedTimelineHash: payload.timelineHash,
          finalCompositeConfigHash: payload.finalCompositeConfigHash,
          output: payload.output,
          payload,
        },
        {
          repo: makeRepo(),
          reserveCredits: vi.fn() as any,
          runtimeConfig: { captureEnabled: false },
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("Render Final Composite remains available"),
    });
  });

  it("fails closed when the server worker is not enabled", async () => {
    const payload = makePayload();
    const reserveCredits = vi.fn();

    await expect(
      createPreviewMatchFinalCompositeCaptureForApi(
        {
          auth: { userId: 7 },
          productId: "product-1",
          runId: "run-1",
          storyboardReviewId: "review-1",
          quality: "standard",
          expectedPreviewCompositionHash: payload.previewCompositionHash,
          expectedTimelineHash: payload.timelineHash,
          finalCompositeConfigHash: payload.finalCompositeConfigHash,
          output: payload.output,
          payload,
        },
        {
          repo: makeRepo(),
          reserveCredits: reserveCredits as any,
          runtimeConfig: { captureEnabled: true, serverWorkerEnabled: false },
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("server worker is currently disabled"),
    });
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("marks queued jobs blocked when status is read while the worker is disabled", async () => {
    const payload = makePayload();
    const queuedJob = {
      id: "capture-1",
      tenantId: "default",
      userId: 7,
      productId: "product-1",
      runId: "run-1",
      storyboardReviewId: "review-1",
      engine: "preview_match_browser_capture",
      quality: "standard",
      status: "queued",
      stage: "queue",
      progressPercent: 0,
      failureCode: null,
      safeMessage: "queued",
      safeDiagnosticsJson: [],
      idempotencyKey: "idem",
      previewCompositionHash: payload.previewCompositionHash,
      timelineHash: payload.timelineHash,
      finalCompositeConfigHash: payload.finalCompositeConfigHash,
      payloadJson: payload,
      outputJson: {},
      evidenceJson: {},
      billingJson: {},
      activeAttemptId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      cancelledAt: null,
    };
    const repo = {
      ...makeRepo(),
      findJobById: vi.fn(async () => queuedJob as any),
      updateJob: vi.fn(async (_id, values) => ({ ...queuedJob, ...values } as any)),
    };

    const result = await getPreviewMatchCaptureJobForApi(
      {
        auth: { userId: 7 },
        captureJobId: "capture-1",
        productId: "product-1",
        runId: "run-1",
      },
      { repo },
    );

    expect(result.capture.status).toBe("blocked");
    expect(result.capture.failureCode).toBe("server_worker_disabled");
    expect(repo.updateJob).toHaveBeenCalledWith(
      "capture-1",
      expect.objectContaining({
        status: "blocked",
        failureCode: "server_worker_disabled",
      }),
    );
  });

  it("keeps high quality gated by rollout config", async () => {
    const payload = makePayload();

    await expect(
      createPreviewMatchFinalCompositeCaptureForApi(
        {
          auth: { userId: 7 },
          productId: "product-1",
          runId: "run-1",
          storyboardReviewId: "review-1",
          quality: "high",
          expectedPreviewCompositionHash: payload.previewCompositionHash,
          expectedTimelineHash: payload.timelineHash,
          finalCompositeConfigHash: payload.finalCompositeConfigHash,
          output: payload.output,
          payload,
        },
        {
          repo: makeRepo(),
          reserveCredits: vi.fn() as any,
          runtimeConfig: { highQualityEnabled: false, serverWorkerEnabled: true },
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reads operational controls from environment with safe defaults", () => {
    const config = readStoryboardPreviewMatchCaptureRuntimeConfig({
      STORYBOARD_PREVIEW_MATCH_CAPTURE_ENABLED: "false",
      STORYBOARD_PREVIEW_MATCH_CAPTURE_GLOBAL_CONCURRENCY: "8",
    });

    expect(config.captureEnabled).toBe(false);
    expect(config.highQualityEnabled).toBe(true);
    expect(config.serverWorkerEnabled).toBe(false);
    expect(config.globalConcurrency).toBe(8);
    expect(config.perUserConcurrency).toBe(1);
  });
});
