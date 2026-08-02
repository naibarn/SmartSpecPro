/**
 * `uploadStagedAutoReviewShotMedia` / `applyStagedAutoReviewShotMediaUpload`
 * — manual shot-media upload into the staged auto-review pipeline.
 *
 * Two layers are tested:
 *  1. `applyStagedAutoReviewShotMediaUpload` — the pure metadata transform,
 *     exercised directly against plain fixtures (no DB mocking needed),
 *     mirroring this file's existing `buildStagedSingleShotRefreshInputForTest`
 *     testability pattern.
 *  2. `uploadStagedAutoReviewShotMedia` — the full DB-transaction wrapper,
 *     exercised against a minimal in-memory fake `getDb()` so the
 *     idempotency/optimistic-concurrency wiring (`mutateOwnedStagedMetadata`)
 *     and the "never touches creditService" guarantee are covered
 *     end-to-end.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  buildStagedCheckpointFixture,
  buildNineShotStoryboardFixture,
} from "@shared/marketplaceAutoReview/stagedFixtures";
import { stagedMetadataStateDigest } from "../marketplaceAutoReviewStagedCheckpointOperations";
import {
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewOutboxJobs,
} from "../../../drizzle/schema";

const { advanceSpy } = vi.hoisted(() => ({ advanceSpy: vi.fn(async () => {}) }));
vi.mock("../marketplaceAutoReviewService", () => ({
  advanceMarketplaceAutoReviewRun: (...args: unknown[]) => advanceSpy(...args),
  // recordStagedProviderFailureAndRefund is imported at top level by
  // marketplaceAutoReviewStagedPipelineService.ts (transitively reachable
  // through this module's static imports) — stub it too so module
  // evaluation never throws on a missing export.
  recordStagedProviderFailureAndRefund: vi.fn(),
}));

const { creditSpies } = vi.hoisted(() => ({
  creditSpies: {
    deductCredits: vi.fn(),
    hasEnoughCredits: vi.fn(),
    refundCredits: vi.fn(),
  },
}));
vi.mock("../creditService", () => creditSpies);

function makeFakeDb(initialRun: Record<string, any>) {
  let run = { ...initialRun };
  const outboxJobs: Record<string, any>[] = [];

  function select() {
    return {
      from(table: unknown) {
        return {
          where(_clause: unknown) {
            return {
              limit: async (_n: number) => {
                if (table === marketplaceAutoReviewRuns) return [run];
                if (table === marketplaceAutoReviewOutboxJobs) return [];
                return [];
              },
            };
          },
        };
      },
    };
  }

  function update(table: unknown) {
    return {
      set(values: Record<string, any>) {
        return {
          where(_clause: unknown) {
            return {
              returning: async (_select: unknown) => {
                if (table !== marketplaceAutoReviewRuns) return [];
                run = { ...run, ...values };
                return [{ id: run.id }];
              },
            };
          },
        };
      },
    };
  }

  function insert(table: unknown) {
    return {
      values: async (vals: Record<string, any>) => {
        if (table === marketplaceAutoReviewOutboxJobs) outboxJobs.push(vals);
      },
    };
  }

  const db: any = {
    select,
    update,
    insert,
    transaction: async (cb: (tx: unknown) => unknown) => cb(db),
  };

  return { db, getRun: () => run, getOutboxJobs: () => outboxJobs };
}

vi.mock("../../db", () => ({ getDb: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

function planFixtureMetadata(overrides: Parameters<typeof buildNineShotStoryboardFixture>[0] = {}) {
  return buildNineShotStoryboardFixture(overrides);
}

describe("applyStagedAutoReviewShotMediaUpload — pure metadata transform", () => {
  it("(a)+(b) image upload supersedes image_prompt/image_result/video_prompt/video_result for the shot, clears both task keys, and the new image_result checkpoint is born approved with the manual-upload contentHash", async () => {
    const { applyStagedAutoReviewShotMediaUpload } = await import(
      "../marketplaceAutoReviewStagedCheckpointRouterService"
    );

    const imagePrompt = buildStagedCheckpointFixture({
      checkpointId: "cp-image-prompt-1",
      kind: "image_prompt",
      scope: "shot",
      shotId: 1,
      state: "approved",
    });
    const imageResult = buildStagedCheckpointFixture({
      checkpointId: "cp-image-result-1",
      kind: "image_result",
      scope: "shot",
      shotId: 1,
      state: "approved",
    });
    const videoPrompt = buildStagedCheckpointFixture({
      checkpointId: "cp-video-prompt-1",
      kind: "video_prompt",
      scope: "shot",
      shotId: 1,
      state: "approved",
    });
    const videoResult = buildStagedCheckpointFixture({
      checkpointId: "cp-video-result-1",
      kind: "video_result",
      scope: "shot",
      shotId: 1,
      state: "approved",
    });
    // A sibling shot's checkpoints must be left completely untouched.
    const siblingImageResult = buildStagedCheckpointFixture({
      checkpointId: "cp-image-result-2",
      kind: "image_result",
      scope: "shot",
      shotId: 2,
      state: "approved",
    });

    const metadata = planFixtureMetadata({
      stagedSequentialStoryboard: {
        ...planFixtureMetadata().stagedSequentialStoryboard,
        reviewCheckpoints: [
          imagePrompt,
          imageResult,
          videoPrompt,
          videoResult,
          siblingImageResult,
        ],
      },
      stagedPipeline: {
        tasks: {
          "image:1": { taskId: "task-image-1" },
          "video:1": { taskId: "task-video-1" },
          "video:2": { taskId: "task-video-2" },
        },
      },
    } as any);

    const result = applyStagedAutoReviewShotMediaUpload({
      metadata,
      runId: "run-1",
      shotId: 1,
      stage: "image",
      url: "https://cdn.example.test/manual-upload-1.png",
      contentHash: "manual-hash-1",
      userId: 42,
      operationId: "op-1",
    });

    const checkpoints =
      result.metadata.stagedSequentialStoryboard.reviewCheckpoints;
    const byId = (id: string) => checkpoints.find(c => c.checkpointId === id);

    expect(byId("cp-image-prompt-1")?.state).toBe("superseded");
    expect(byId("cp-image-result-1")?.state).toBe("superseded");
    expect(byId("cp-video-prompt-1")?.state).toBe("superseded");
    expect(byId("cp-video-result-1")?.state).toBe("superseded");
    // Sibling shot 2's checkpoint is untouched.
    expect(byId("cp-image-result-2")?.state).toBe("approved");

    const newCheckpoint = checkpoints.find(
      c => c.kind === "image_result" && c.state === "approved" && c.shotId === 1
    );
    expect(newCheckpoint).toBeDefined();
    expect(newCheckpoint?.contentHash).toBe("manual-hash-1");
    expect(newCheckpoint?.approvedHash).toBe("manual-hash-1");
    expect(newCheckpoint?.approvedByUserId).toBe(42);
    expect(newCheckpoint?.approvedModel).toBe("manual_upload");
    expect(newCheckpoint?.approvedProvider).toBe("manual_upload");
    expect(newCheckpoint?.estimatedCredits).toBe(0);

    const tasks = (result.metadata as any).stagedPipeline.tasks;
    expect(tasks).not.toHaveProperty("image:1");
    expect(tasks).not.toHaveProperty("video:1");
    // Sibling shot 2's task record is untouched.
    expect(tasks).toHaveProperty("video:2");

    const shot1 = result.metadata.stagedSequentialStoryboard.shots.find(
      s => s.shotId === 1
    ) as any;
    expect(shot1.imageArtifactHash).toBe("manual-hash-1");
    expect(shot1.imageArtifactUrl).toBe(
      "https://cdn.example.test/manual-upload-1.png"
    );
    // Exact field list nulled on an image-stage upload, copied precisely
    // from retryStagedAutoReviewShot's image-retry cascade.
    expect(shot1.videoPrompt).toBeNull();
    expect(shot1.videoPromptHash).toBeNull();
    expect(shot1.videoArtifactHash).toBeNull();
    expect(shot1.videoArtifactUrl).toBeNull();
  });

  it("(c) uploading a video for a shot with no approved image throws staged_image_artifact_missing (PRECONDITION_FAILED)", async () => {
    const { applyStagedAutoReviewShotMediaUpload } = await import(
      "../marketplaceAutoReviewStagedCheckpointRouterService"
    );
    const metadata = planFixtureMetadata();

    expect(() =>
      applyStagedAutoReviewShotMediaUpload({
        metadata,
        runId: "run-1",
        shotId: 1,
        stage: "video",
        url: "https://cdn.example.test/manual-upload-1.mp4",
        contentHash: "manual-hash-video-1",
        userId: 42,
        operationId: "op-2",
      })
    ).toThrowError(
      expect.objectContaining({
        code: "PRECONDITION_FAILED",
        message: "staged_image_artifact_missing",
      })
    );
  });

  it("(d) uploading a video when an approved image exists sets videoArtifactUrl/Hash, supersedes only video-kind checkpoints, and leaves image-kind checkpoints for that shot untouched", async () => {
    const { applyStagedAutoReviewShotMediaUpload } = await import(
      "../marketplaceAutoReviewStagedCheckpointRouterService"
    );

    const imagePrompt = buildStagedCheckpointFixture({
      checkpointId: "cp-image-prompt-1",
      kind: "image_prompt",
      scope: "shot",
      shotId: 1,
      state: "approved",
    });
    const imageResult = buildStagedCheckpointFixture({
      checkpointId: "cp-image-result-1",
      kind: "image_result",
      scope: "shot",
      shotId: 1,
      state: "approved",
    });
    const videoPrompt = buildStagedCheckpointFixture({
      checkpointId: "cp-video-prompt-1",
      kind: "video_prompt",
      scope: "shot",
      shotId: 1,
      state: "approved",
    });

    const baseMetadata = planFixtureMetadata({
      stagedSequentialStoryboard: {
        ...planFixtureMetadata().stagedSequentialStoryboard,
        reviewCheckpoints: [imagePrompt, imageResult, videoPrompt],
      },
      stagedPipeline: {
        tasks: {
          "video:1": { taskId: "task-video-1" },
        },
      },
    } as any);
    const metadata = {
      ...baseMetadata,
      stagedSequentialStoryboard: {
        ...baseMetadata.stagedSequentialStoryboard,
        shots: baseMetadata.stagedSequentialStoryboard.shots.map(shot =>
          shot.shotId === 1
            ? { ...shot, imageArtifactHash: "existing-image-hash" }
            : shot
        ),
      },
    };

    const result = applyStagedAutoReviewShotMediaUpload({
      metadata,
      runId: "run-1",
      shotId: 1,
      stage: "video",
      url: "https://cdn.example.test/manual-upload-1.mp4",
      contentHash: "manual-hash-video-1",
      userId: 42,
      operationId: "op-3",
    });

    const checkpoints =
      result.metadata.stagedSequentialStoryboard.reviewCheckpoints;
    const byId = (id: string) => checkpoints.find(c => c.checkpointId === id);

    // Image-kind checkpoints for the shot are untouched.
    expect(byId("cp-image-prompt-1")?.state).toBe("approved");
    expect(byId("cp-image-result-1")?.state).toBe("approved");
    // Only the video-kind checkpoint is superseded.
    expect(byId("cp-video-prompt-1")?.state).toBe("superseded");

    const newCheckpoint = checkpoints.find(
      c => c.kind === "video_result" && c.state === "approved" && c.shotId === 1
    );
    expect(newCheckpoint).toBeDefined();
    expect(newCheckpoint?.contentHash).toBe("manual-hash-video-1");

    const tasks = (result.metadata as any).stagedPipeline.tasks;
    expect(tasks).not.toHaveProperty("video:1");

    const shot1 = result.metadata.stagedSequentialStoryboard.shots.find(
      s => s.shotId === 1
    ) as any;
    expect(shot1.videoArtifactHash).toBe("manual-hash-video-1");
    expect(shot1.videoArtifactUrl).toBe(
      "https://cdn.example.test/manual-upload-1.mp4"
    );
    // Image fields are untouched by a video-stage upload.
    expect(shot1.imageArtifactHash).toBe("existing-image-hash");
  });

  it("throws staged_invalid_shot_contract for an unknown shotId", async () => {
    const { applyStagedAutoReviewShotMediaUpload } = await import(
      "../marketplaceAutoReviewStagedCheckpointRouterService"
    );
    const metadata = planFixtureMetadata();

    expect(() =>
      applyStagedAutoReviewShotMediaUpload({
        metadata,
        runId: "run-1",
        shotId: 99,
        stage: "image",
        url: "https://cdn.example.test/manual-upload.png",
        contentHash: "manual-hash",
        userId: 42,
        operationId: "op-4",
      })
    ).toThrowError(
      expect.objectContaining({
        code: "BAD_REQUEST",
        message: "staged_invalid_shot_contract",
      })
    );
  });
});

describe("uploadStagedAutoReviewShotMedia — full DB-transaction wrapper", () => {
  it("(e) never calls any creditService function, and wakes the run via advanceMarketplaceAutoReviewRun after a successful upload", async () => {
    const { getDb } = await import("../../db");
    const { uploadStagedAutoReviewShotMedia } = await import(
      "../marketplaceAutoReviewStagedCheckpointRouterService"
    );

    const metadata = planFixtureMetadata();
    const digest = stagedMetadataStateDigest(metadata);

    const fake = makeFakeDb({
      id: "run-1",
      userId: 42,
      tenantId: "tenant-1",
      status: "running",
      metadataJson: metadata,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    (getDb as any).mockResolvedValue(fake.db);

    const result = await uploadStagedAutoReviewShotMedia({
      runId: "run-1",
      shotId: 1,
      stage: "image",
      url: "https://cdn.example.test/manual-upload-1.png",
      expectedStateDigest: digest,
      idempotencyKey: "idem-key-00000001",
      auth: { userId: 42, tenantId: "tenant-1" },
    });

    expect(result.runId).toBe("run-1");
    expect(result.status).toBe("queued");

    // The persisted run's metadata now carries the approved image_result
    // checkpoint born from this upload.
    const persistedMetadata = fake.getRun().metadataJson;
    const shot1 = persistedMetadata.stagedSequentialStoryboard.shots.find(
      (s: any) => s.shotId === 1
    );
    expect(shot1.imageArtifactUrl).toBe(
      "https://cdn.example.test/manual-upload-1.png"
    );

    expect(creditSpies.deductCredits).not.toHaveBeenCalled();
    expect(creditSpies.hasEnoughCredits).not.toHaveBeenCalled();
    expect(creditSpies.refundCredits).not.toHaveBeenCalled();

    // Background "wake the run" call — allow the fire-and-forget dynamic
    // import + call to flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(advanceSpy).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ userId: 42 }),
      expect.objectContaining({ userToken: "internal" })
    );
  });
});
