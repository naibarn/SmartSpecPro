import { beforeEach, describe, expect, it, vi } from "vitest";

const { createControlPlaneJobMock, createCanonicalJobInTransactionMock } =
  vi.hoisted(() => ({
    createControlPlaneJobMock: vi.fn(),
    createCanonicalJobInTransactionMock: vi.fn(),
  }));

vi.mock("../jobControlPlaneGateway", () => ({
  createControlPlaneJob: createControlPlaneJobMock,
}));

vi.mock("../jobControlPlane", () => ({
  createCanonicalJobInTransaction: createCanonicalJobInTransactionMock,
}));

import { validateJobDefinition } from "../jobCanonicalization";
import { enqueueMarketplaceAutoReviewWorkerJob } from "../marketplaceAutoReviewWorkerJob";

describe("Marketplace Auto Review worker job admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createControlPlaneJobMock.mockResolvedValue({ jobId: "worker-job-1" });
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
    expect(() => validateJobDefinition(definition)).not.toThrow();
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
});
