import { beforeEach, describe, expect, it, vi } from "vitest";

const { createControlPlaneJobMock, createCanonicalJobInTransactionMock } =
  vi.hoisted(() => ({
    createControlPlaneJobMock: vi.fn(),
    createCanonicalJobInTransactionMock: vi.fn(),
  }));

const workerRuntimeMocks = vi.hoisted(() => ({
  advanceRun: vi.fn(),
  createRuntime: vi.fn(),
  generateSocialPostImages: vi.fn(),
}));

vi.mock("../jobControlPlaneGateway", () => ({
  createControlPlaneJob: createControlPlaneJobMock,
}));

vi.mock("../jobControlPlane", () => ({
  createCanonicalJobInTransaction: createCanonicalJobInTransactionMock,
}));

vi.mock("../marketplaceAutoReviewService", () => ({
  advanceMarketplaceAutoReviewRun: workerRuntimeMocks.advanceRun,
}));

vi.mock("../marketplaceAutoReviewWorkerRuntime", () => ({
  createMarketplaceAutoReviewWorkerRuntime: workerRuntimeMocks.createRuntime,
}));

vi.mock("../marketplaceAutoReviewStagedCheckpointRouterService", () => ({
  generateStagedAutoReviewSocialPostImages:
    workerRuntimeMocks.generateSocialPostImages,
}));

import { validateJobDefinition } from "../jobCanonicalization";
import {
  enqueueMarketplaceAutoReviewWorkerJob,
  marketplaceAutoReviewWorkerInputSchema,
  executeMarketplaceAutoReviewWorkerJob,
} from "../marketplaceAutoReviewWorkerJob";

describe("Marketplace Auto Review worker job admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createControlPlaneJobMock.mockResolvedValue({ jobId: "worker-job-1" });
    workerRuntimeMocks.createRuntime.mockResolvedValue({ publicUrl: "https://app.test" });
    workerRuntimeMocks.advanceRun.mockResolvedValue({ runId: "run-auto-review-1" });
    workerRuntimeMocks.generateSocialPostImages.mockResolvedValue({
      status: "completed",
    });
  });

  it("queues and executes one worker operation for selected social post image variants", async () => {
    const operation = {
      operation: "staged_social_post_images_generation" as const,
      runId: "run-social-post-images",
      batchId: "social-batch-1",
      expectedRequestHash: "social-request-hash",
      requestIdempotencyKey: "social-image-request-1",
      modelId: "image-model-a",
      aspectRatio: "4:5" as const,
      characterReferenceIndex: 3,
      productReferenceIndex: 1,
      variants: [
        "caption_source" as const,
        "character_reference" as const,
        "product_reference" as const,
      ],
    };
    await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId: "tenant-marketplace",
      userId: 42,
      runId: operation.runId,
      idempotencyKey: operation.requestIdempotencyKey,
      operation,
    });
    const [{ definition }] = createControlPlaneJobMock.mock.calls[0];
    expect(definition.input).toMatchObject(operation);
    expect(() => validateJobDefinition(definition)).not.toThrow();

    await executeMarketplaceAutoReviewWorkerJob({
      job: marketplaceAutoReviewWorkerInputSchema.parse(operation),
      tenantId: "tenant-marketplace",
      userId: 42,
      jobId: "worker-social-post-images",
      reportProgress: vi.fn(),
    });

    expect(workerRuntimeMocks.createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-marketplace",
        runId: operation.runId,
        jobId: "worker-social-post-images",
        schedulerSource: "worker_jobs:staged_social_post_images_generation",
      })
    );
    expect(workerRuntimeMocks.generateSocialPostImages).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: operation.runId,
        batchId: operation.batchId,
        expectedRequestHash: operation.expectedRequestHash,
        modelId: operation.modelId,
        variants: operation.variants,
        workerExecution: true,
      })
    );
  });

  it("accepts dialogue previews when a staged story concept is selected", () => {
    const dialoguePreview = "พิมพ์ชนก: วันนี้ลองใช้แล้วรู้สึกสบายผิวขึ้นมาก ธีร์: ดีเลย เล่าให้ฟังหน่อยว่าใช้ยังไง";

    const parsed = marketplaceAutoReviewWorkerInputSchema.parse({
      operation: "staged_story_redraft",
      runId: "run-auto-review-1",
      expectedStateDigest: "state-digest-1",
      requestIdempotencyKey: "request-story-redraft-1",
      selectedConcept: {
        conceptId: "concept-1",
        title: "รีวิวจากประสบการณ์จริง",
        angle: "เล่าความรู้สึกหลังทดลองใช้",
        storySummary: "ตัวละครคุยกันถึงประสบการณ์ใช้สินค้าในชีวิตประจำวัน",
        dialoguePreview,
      },
    });

    expect(parsed).toMatchObject({
      selectedConcept: { dialoguePreview },
    });
  });

  it("omits undefined optional prompt fields before canonical job validation", async () => {
    await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId: "tenant-marketplace",
      userId: 42,
      runId: "run-auto-review-1",
      idempotencyKey: "request-image-prompt-1",
      operation: {
        operation: "staged_prompt_generation",
        runId: "run-auto-review-1",
        shotId: 7,
        stage: "image",
        expectedStateDigest: "state-digest-1",
        requestIdempotencyKey: "request-image-prompt-1",
        instruction: undefined,
        model: undefined,
      },
    });

    const [{ definition }] = createControlPlaneJobMock.mock.calls[0];
    expect(definition.input).toEqual({
      operation: "staged_prompt_generation",
      runId: "run-auto-review-1",
      shotId: 7,
      stage: "image",
      expectedStateDigest: "state-digest-1",
      requestIdempotencyKey: "request-image-prompt-1",
    });
    expect(definition.retryPolicy).toMatchObject({
      maxAttempts: 1,
      baseDelayMs: 5_000,
      maxDelayMs: 5 * 60_000,
    });
    expect(() => validateJobDefinition(definition)).not.toThrow();
  });

  it("queues approved-frame person detection as a durable worker job", async () => {
    await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId: "tenant-marketplace",
      userId: 42,
      runId: "run-person-detection",
      idempotencyKey: "request-person-detection-1",
      operation: {
        operation: "staged_person_detection",
        runId: "run-person-detection",
        shotId: 6,
        expectedImageArtifactHash: "approved-frame-hash",
        requestIdempotencyKey: "request-person-detection-1",
      },
    });

    const [{ definition }] = createControlPlaneJobMock.mock.calls[0];
    expect(definition.input).toEqual({
      operation: "staged_person_detection",
      runId: "run-person-detection",
      shotId: 6,
      expectedImageArtifactHash: "approved-frame-hash",
      requestIdempotencyKey: "request-person-detection-1",
    });
    expect(definition.retryPolicy.maxAttempts).toBe(1);
    expect(() => validateJobDefinition(definition)).not.toThrow();
  });

  it("runs bulk prompt-only skill work once and surfaces a failure", async () => {
    await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId: "tenant-marketplace",
      userId: 42,
      runId: "run-auto-review-bulk-prompt",
      idempotencyKey: "request-video-prompt-bulk-1",
      operation: {
        operation: "staged_bulk_generation",
        runId: "run-auto-review-bulk-prompt",
        expectedStateDigest: "state-digest-1",
        requestIdempotencyKey: "request-video-prompt-bulk-1",
        targets: [
          { shotId: 1, stage: "video", promptOnly: true, refreshPrompt: true },
          { shotId: 2, stage: "video", promptOnly: true, refreshPrompt: true },
        ],
      },
    });

    const [{ definition }] = createControlPlaneJobMock.mock.calls[0];
    expect(definition.retryPolicy.maxAttempts).toBe(1);
    expect(() => validateJobDefinition(definition)).not.toThrow();
  });

  it("forwards reconciliation-only polls through advance_run without enabling dispatch", async () => {
    const job = marketplaceAutoReviewWorkerInputSchema.parse({
      operation: "advance_run",
      runId: "run-auto-review-poll",
      targetShotIds: [4],
      reconcileOnly: true,
      operationId: "staged_provider_poll:60000:1:fingerprint",
    });

    await executeMarketplaceAutoReviewWorkerJob({
      job,
      tenantId: "tenant-marketplace",
      userId: 42,
      jobId: "provider-poll-job",
    });

    expect(workerRuntimeMocks.advanceRun).toHaveBeenCalledWith(
      "run-auto-review-poll",
      { userId: 42, tenantId: "tenant-marketplace" },
      { publicUrl: "https://app.test" },
      [4],
      true
    );
  });

  it("keeps populated model and instruction fields in the durable job input", async () => {
    await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId: "tenant-marketplace",
      userId: 42,
      runId: "run-auto-review-1",
      idempotencyKey: "request-image-prompt-2",
      operation: {
        operation: "staged_prompt_generation",
        runId: "run-auto-review-1",
        shotId: 7,
        stage: "image",
        expectedStateDigest: "state-digest-1",
        requestIdempotencyKey: "request-image-prompt-2",
        instruction: "Keep the product label visible",
        model: "openai/gpt-5.6-sol",
      },
    });

    const [{ definition }] = createControlPlaneJobMock.mock.calls[0];
    expect(definition.input).toMatchObject({
      instruction: "Keep the product label visible",
      model: "openai/gpt-5.6-sol",
    });
    expect(() => validateJobDefinition(definition)).not.toThrow();
  });

  it("persists a per-shot prompt snapshot for safe queued execution", async () => {
    await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId: "tenant-marketplace",
      userId: 42,
      runId: "run-auto-review-1",
      idempotencyKey: "request-image-prompt-3",
      operation: {
        operation: "staged_prompt_generation",
        runId: "run-auto-review-1",
        shotId: 8,
        stage: "image",
        expectedStateDigest: "state-digest-1",
        expectedShotRevision: 4,
        promptContextDigest: "prompt-context-digest-1",
        requestIdempotencyKey: "request-image-prompt-3",
      },
    });

    const [{ definition }] = createControlPlaneJobMock.mock.calls[0];
    expect(definition.input).toMatchObject({
      expectedShotRevision: 4,
      promptContextDigest: "prompt-context-digest-1",
    });
    expect(() => validateJobDefinition(definition)).not.toThrow();
  });

  it("queues per-shot media replacement without unsupported undefined fields", async () => {
    await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId: "tenant-marketplace",
      userId: 42,
      runId: "run-auto-review-1",
      idempotencyKey: "request-image-generation-1",
      operation: {
        operation: "staged_bulk_generation",
        runId: "run-auto-review-1",
        expectedStateDigest: "state-digest-1",
        requestIdempotencyKey: "request-image-generation-1",
        targets: [
          {
            shotId: 1,
            stage: "image",
            model: undefined,
            promptModel: undefined,
            refreshPrompt: undefined,
            promptOnly: undefined,
            replaceExisting: true,
          },
        ],
      },
    });

    const [{ definition }] = createControlPlaneJobMock.mock.calls[0];
    expect(definition.input).toEqual({
      operation: "staged_bulk_generation",
      runId: "run-auto-review-1",
      expectedStateDigest: "state-digest-1",
      requestIdempotencyKey: "request-image-generation-1",
      targets: [{ shotId: 1, stage: "image", replaceExisting: true }],
    });
    expect(() => validateJobDefinition(definition)).not.toThrow();
  });
});
