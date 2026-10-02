import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDbSelect,
  mockGetPortraitCandidateTaskInfo,
  mockRecordPortraitCandidateTask,
  mockMarkPortraitCandidateSubmissionFailed,
  mockAttachGeneratedPortraitCandidate,
  mockGetUnifiedMediaTask,
  mockGetTransientMediaPollRetryHint,
  mockIngestVerticalDramaMediaAsset,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockGetPortraitCandidateTaskInfo: vi.fn(),
  mockRecordPortraitCandidateTask: vi.fn(),
  mockMarkPortraitCandidateSubmissionFailed: vi.fn(),
  mockAttachGeneratedPortraitCandidate: vi.fn(),
  mockGetUnifiedMediaTask: vi.fn(),
  mockGetTransientMediaPollRetryHint: vi.fn(),
  mockIngestVerticalDramaMediaAsset: vi.fn(),
}));

vi.mock("../../db", () => ({ db: { select: mockDbSelect } }));
vi.mock("../verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPortraitCandidateTaskInfo: mockGetPortraitCandidateTaskInfo,
    recordPortraitCandidateTask: mockRecordPortraitCandidateTask,
    markPortraitCandidateSubmissionFailed:
      mockMarkPortraitCandidateSubmissionFailed,
    attachGeneratedPortraitCandidate: mockAttachGeneratedPortraitCandidate,
  },
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE: "policy rejected",
  summarizePortraitCandidatePolicyReason: vi.fn(() => undefined),
}));
vi.mock("../mediaTaskPollingService", () => ({
  getUnifiedMediaTask: mockGetUnifiedMediaTask,
  getTransientMediaPollRetryHint: mockGetTransientMediaPollRetryHint,
}));
vi.mock("../verticalDramaMediaAssetService", () => ({
  ingestVerticalDramaMediaAsset: mockIngestVerticalDramaMediaAsset,
}));
vi.mock("../verticalDramaMediaUserToken", () => ({
  createVerticalDramaMediaUserToken: vi.fn(() => "internal-token"),
}));
vi.mock("../../routers/media", () => ({
  reconcileTaskCredits: vi.fn(async () => ({ adjusted: false })),
}));

import {
  reconcileStalePortraitCandidates,
  settleVerticalDramaPortraitCandidate,
} from "../verticalDramaPortraitCandidateSettlement";

const owner = { tenantId: "tenant-1", userId: 24, seriesId: 60 };

function candidateInfo(overrides: Record<string, unknown> = {}) {
  return {
    batchId: "batch-1",
    candidateId: "candidate-1",
    index: 0,
    count: 1,
    status: "queued",
    taskId: "task-1",
    characterId: 270,
    mediaAssetId: null,
    imageUrl: null,
    ...overrides,
  };
}

function configureRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  mockDbSelect.mockReturnValue({ from });
  return { limit, orderBy, where, from };
}

describe("settleVerticalDramaPortraitCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPortraitCandidateTaskInfo.mockResolvedValue(candidateInfo());
    mockGetTransientMediaPollRetryHint.mockImplementation((error: unknown) =>
      error instanceof Error && /429/.test(error.message)
        ? { retryAfterSeconds: 60 }
        : null
    );
    mockIngestVerticalDramaMediaAsset.mockResolvedValue({
      mediaAssetId: 900,
      url: "https://cdn.example.test/portrait.jpg",
    });
    mockAttachGeneratedPortraitCandidate.mockResolvedValue({
      assetLinkId: 680,
      mediaAssetId: 900,
    });
  });

  it("ingests and links an already-completed result without submitting another image", async () => {
    mockGetUnifiedMediaTask.mockResolvedValue({
      id: "task-1",
      mediaType: "image",
      status: "completed",
      model: "gpt-image-2-5-sunburst-text-to-image",
      parameters: {},
      resultUrl: "https://provider.example.test/result.jpg",
    });

    const result = await settleVerticalDramaPortraitCandidate({
      ...owner,
      assetLinkId: 680,
    });

    expect(result).toMatchObject({
      status: "completed",
      imageUrl: "https://cdn.example.test/portrait.jpg",
    });
    expect(mockIngestVerticalDramaMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "task-1", purpose: "character_portrait" })
    );
    expect(mockAttachGeneratedPortraitCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ assetLinkId: 680, mediaAssetId: 900 })
    );
  });

  it("keeps an unreadable task queued so a later recovery pass can retry", async () => {
    mockGetUnifiedMediaTask.mockRejectedValue(new Error("Get task failed: 429"));

    const result = await settleVerticalDramaPortraitCandidate({
      ...owner,
      assetLinkId: 680,
    });

    expect(result).toMatchObject({ status: "queued", retryAfterMs: 60_000 });
    expect(mockMarkPortraitCandidateSubmissionFailed).not.toHaveBeenCalled();
    expect(mockIngestVerticalDramaMediaAsset).not.toHaveBeenCalled();
  });

  it("returns an existing durable image without re-ingesting it", async () => {
    mockGetPortraitCandidateTaskInfo.mockResolvedValue(
      candidateInfo({
        status: "completed",
        mediaAssetId: 900,
        imageUrl: "https://cdn.example.test/already-linked.jpg",
      })
    );

    const result = await settleVerticalDramaPortraitCandidate({
      ...owner,
      assetLinkId: 680,
    });

    expect(result).toMatchObject({
      status: "completed",
      imageUrl: "https://cdn.example.test/already-linked.jpg",
    });
    expect(mockGetUnifiedMediaTask).not.toHaveBeenCalled();
    expect(mockIngestVerticalDramaMediaAsset).not.toHaveBeenCalled();
  });
});

describe("reconcileStalePortraitCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPortraitCandidateTaskInfo.mockImplementation(async (_owner, id) =>
      candidateInfo({
        taskId: `task-${id}`,
        candidateId: `candidate-${id}`,
      })
    );
    mockGetTransientMediaPollRetryHint.mockReturnValue(null);
    mockIngestVerticalDramaMediaAsset.mockResolvedValue({
      mediaAssetId: 901,
      url: "https://cdn.example.test/recovered.jpg",
    });
    mockAttachGeneratedPortraitCandidate.mockResolvedValue({});
  });

  it("settles completed results in a bounded batch and isolates per-candidate errors", async () => {
    const { limit } = configureRows([
      {
        assetLinkId: 680,
        ...owner,
        metadata: { portraitCandidate: { taskId: "task-680" } },
      },
      {
        assetLinkId: 681,
        ...owner,
        metadata: { portraitCandidate: { taskId: "task-681" } },
      },
      {
        assetLinkId: 682,
        ...owner,
        metadata: { portraitCandidate: { taskId: "task-682" } },
      },
    ]);
    mockGetUnifiedMediaTask.mockImplementation(async ({ taskId }) => {
      if (taskId === "task-680") {
        return {
          id: taskId,
          mediaType: "image",
          status: "completed",
          model: "gpt-image-2",
          parameters: {},
          resultUrl: "https://provider.example.test/680.jpg",
        };
      }
      if (taskId === "task-681") {
        return {
          id: taskId,
          mediaType: "image",
          status: "processing",
          model: "gpt-image-2",
          parameters: {},
        };
      }
      throw new Error("temporary backend failure");
    });

    const result = await reconcileStalePortraitCandidates(
      new Date("2026-09-30T08:00:00.000Z")
    );

    expect(result).toEqual({ scanned: 3, settled: 1, errors: 1 });
    expect(limit).toHaveBeenCalledWith(10);
    expect(mockIngestVerticalDramaMediaAsset).toHaveBeenCalledTimes(1);
    expect(mockAttachGeneratedPortraitCandidate).toHaveBeenCalledTimes(1);
  });
});
