import { describe, expect, it } from "vitest";
import {
  reconcileStartFramePlanWithDurableArtifacts,
  verifyStartFrameArtifactBindings,
  type DurableStartFrameArtifact,
} from "../verticalDramaStartFrameReconciliation";

describe("verifyStartFrameArtifactBindings", () => {
  const artifact = {
    sourceTaskId: "task-1",
    mediaAssetId: 7024,
    tenantId: "tenant-1",
    userId: 42,
    r2Status: "ready",
    r2StorageKey: "tenant-1/users/42/task-1/image.png",
  };
  const asset = {
    id: 7024,
    tenantId: "tenant-1",
    userId: 42,
    status: "ready",
    mimeType: "image/png",
    storageKey: "tenant-1/users/42/task-1/image.png",
    checksumSha256: "a".repeat(64),
  };

  it("accepts a ready owner-scoped image with matching artifact key and checksum metadata", () => {
    expect(
      verifyStartFrameArtifactBindings({
        tenantId: "tenant-1",
        userId: 42,
        artifacts: [artifact],
        assets: [asset],
      })
    ).toEqual([{ sourceTaskId: "task-1", mediaAssetId: 7024 }]);
  });

  it.each([
    ["cross-tenant asset", { ...asset, tenantId: "tenant-2" }],
    ["non-ready asset", { ...asset, status: "pending" }],
    ["wrong storage key", { ...asset, storageKey: "other/object.png" }],
    ["malformed checksum", { ...asset, checksumSha256: "not-a-sha256" }],
  ])("rejects %s without producing a promotable artifact", (_label, invalidAsset) => {
    expect(
      verifyStartFrameArtifactBindings({
        tenantId: "tenant-1",
        userId: 42,
        artifacts: [artifact],
        assets: [invalidAsset],
      })
    ).toEqual([]);
  });
});

describe("reconcileStartFramePlanWithDurableArtifacts", () => {
  it("promotes completed durable start and stop frame artifacts and clears their pending tasks", () => {
    const plan = {
      mode: "single_frame_per_shot" as const,
      selectedImageModelId: "gpt-image",
      frames: [
        {
          shotNumber: 8,
          imagePrompt: "start",
          negativePrompt: "none",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          imageTask: {
            pendingTaskId: "start-task",
            promptHash: "start-hash",
            status: "submitted" as const,
          },
          imagePromptHash: "start-hash",
          stopFrameTask: {
            pendingTaskId: "stop-task",
            promptHash: "stop-hash",
            status: "processing" as const,
          },
          stopFramePromptHash: "stop-hash",
        },
      ],
    };
    const artifacts: DurableStartFrameArtifact[] = [
      { sourceTaskId: "start-task", mediaAssetId: 7024 },
      { sourceTaskId: "stop-task", mediaAssetId: 7025 },
    ];

    const result = reconcileStartFramePlanWithDurableArtifacts(plan, artifacts);

    expect(result.repaired).toEqual([
      { shotNumber: 8, frameRole: "start", mediaAssetId: 7024 },
      { shotNumber: 8, frameRole: "stop", mediaAssetId: 7025 },
    ]);
    expect(result.plan.frames[0]).toMatchObject({
      approvedMediaAssetId: "7024",
      approvedStopFrameAssetId: "7025",
    });
    expect(result.plan.frames[0].imageTask).toBeUndefined();
    expect(result.plan.frames[0].stopFrameTask).toBeUndefined();
  });

  it("does not alter a plan when the artifact is not durable", () => {
    const plan = {
      mode: "single_frame_per_shot" as const,
      selectedImageModelId: "gpt-image",
      frames: [
        {
          shotNumber: 8,
          imagePrompt: "start",
          negativePrompt: "none",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          imageTask: {
            pendingTaskId: "missing-task",
            status: "submitted" as const,
          },
        },
      ],
    };

    expect(
      reconcileStartFramePlanWithDurableArtifacts(plan, [
        { sourceTaskId: "other-task", mediaAssetId: 7024 },
      ])
    ).toEqual({ plan, repaired: [], staleTasks: [] });
  });

  it("discards a durable result from an older prompt while preserving the current approved image", () => {
    const plan = {
      mode: "single_frame_per_shot" as const,
      selectedImageModelId: "gpt-image",
      frames: [
        {
          shotNumber: 8,
          imagePrompt: "current prompt",
          imagePromptHash: "current-hash",
          negativePrompt: "none",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          approvedMediaAssetId: "7023",
          imageTask: {
            pendingTaskId: "stale-task",
            promptHash: "old-hash",
            status: "processing" as const,
          },
        },
      ],
    };

    const result = reconcileStartFramePlanWithDurableArtifacts(plan, [
      { sourceTaskId: "stale-task", mediaAssetId: 7024 },
    ]);

    expect(result.repaired).toEqual([]);
    expect(result.staleTasks).toEqual([
      { shotNumber: 8, frameRole: "start", taskId: "stale-task" },
    ]);
    expect(result.plan.frames[0]).toMatchObject({
      approvedMediaAssetId: "7023",
      imagePromptHash: "current-hash",
    });
    expect(result.plan.frames[0].imageTask).toBeUndefined();
  });

  it("does not promote legacy task markers whose source prompt revision cannot be proven", () => {
    const plan = {
      mode: "single_frame_per_shot" as const,
      selectedImageModelId: "gpt-image",
      frames: [
        {
          shotNumber: 8,
          imagePrompt: "current prompt",
          imagePromptHash: "current-hash",
          negativePrompt: "none",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          approvedMediaAssetId: "7023",
          imageTask: {
            pendingTaskId: "unbound-task",
            status: "processing" as const,
          },
        },
      ],
    };

    const result = reconcileStartFramePlanWithDurableArtifacts(plan, [
      { sourceTaskId: "unbound-task", mediaAssetId: 7024 },
    ]);

    expect(result.repaired).toEqual([]);
    expect(result.staleTasks).toEqual([
      { shotNumber: 8, frameRole: "start", taskId: "unbound-task" },
    ]);
    expect(result.plan.frames[0].approvedMediaAssetId).toBe("7023");
    expect(result.plan.frames[0].imageTask).toBeUndefined();
  });
});
