import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries/contracts";

export type DurableStartFrameArtifact = {
  sourceTaskId: string;
  mediaAssetId: number;
};

export type StartFrameRepair = {
  shotNumber: number;
  frameRole: "start" | "stop";
  mediaAssetId: number;
};

export type StaleStartFrameTask = {
  shotNumber: number;
  frameRole: "start" | "stop";
  taskId: string;
};

export type StartFrameArtifactCandidate = {
  sourceTaskId: string;
  mediaAssetId: number | null;
  tenantId: string;
  userId: number;
  r2Status: string;
  r2StorageKey: string | null;
};

export type ReadyStartFrameMediaAsset = {
  id: number;
  tenantId: string;
  userId: number;
  status: string | null;
  mimeType: string;
  storageKey: string;
  checksumSha256: string | null;
};

/**
 * Verify the canonical artifact-to-asset binding before a task result may be
 * promoted. The ledger's ready key must identify the same owner-scoped,
 * ready image row; malformed stored checksums fail closed when present.
 */
export function verifyStartFrameArtifactBindings(input: {
  tenantId: string;
  userId: number;
  artifacts: readonly StartFrameArtifactCandidate[];
  assets: readonly ReadyStartFrameMediaAsset[];
}): DurableStartFrameArtifact[] {
  const assetById = new Map(input.assets.map(asset => [asset.id, asset]));
  return input.artifacts.flatMap(artifact => {
    const asset =
      artifact.mediaAssetId == null
        ? undefined
        : assetById.get(artifact.mediaAssetId);
    const checksumIsValid =
      asset?.checksumSha256 == null ||
      /^[a-f0-9]{64}$/i.test(asset.checksumSha256);
    if (
      artifact.tenantId !== input.tenantId ||
      artifact.userId !== input.userId ||
      artifact.r2Status !== "ready" ||
      !artifact.r2StorageKey ||
      !asset ||
      asset.tenantId !== input.tenantId ||
      asset.userId !== input.userId ||
      asset.status !== "ready" ||
      !asset.mimeType.toLowerCase().startsWith("image/") ||
      asset.storageKey !== artifact.r2StorageKey ||
      !checksumIsValid
    ) {
      return [];
    }
    return [{ sourceTaskId: artifact.sourceTaskId, mediaAssetId: asset.id }];
  });
}

type StartFramePlanFrame = VerticalDramaStartFramePlan["frames"][number];

/**
 * Reconciles only task markers that have an owner-scoped, ready artifact
 * bound to the frame's current prompt hash. Provider completion alone is not
 * enough: the durable artifact and matching source revision make the episode
 * safe to render and reload. A stale durable result clears only its own task
 * marker and never replaces the last approved asset.
 */
export function reconcileStartFramePlanWithDurableArtifacts(
  plan: VerticalDramaStartFramePlan,
  artifacts: readonly DurableStartFrameArtifact[]
): {
  plan: VerticalDramaStartFramePlan;
  repaired: StartFrameRepair[];
  staleTasks: StaleStartFrameTask[];
} {
  const artifactByTaskId = new Map(
    artifacts.map(artifact => [artifact.sourceTaskId, artifact.mediaAssetId])
  );
  const repaired: StartFrameRepair[] = [];
  const staleTasks: StaleStartFrameTask[] = [];
  const frames = plan.frames.map(frame => {
    let nextFrame: StartFramePlanFrame = frame;
    const imageTaskId = frame.imageTask?.pendingTaskId;
    const startAssetId = imageTaskId
      ? artifactByTaskId.get(imageTaskId)
      : undefined;
    const imageSourceIsCurrent = Boolean(
      frame.imageTask?.promptHash &&
        frame.imagePromptHash &&
        frame.imageTask.promptHash === frame.imagePromptHash
    );
    if (startAssetId !== undefined && imageSourceIsCurrent) {
      nextFrame = {
        ...nextFrame,
        approvedMediaAssetId: String(startAssetId),
        imageTask: undefined,
      };
      repaired.push({
        shotNumber: frame.shotNumber,
        frameRole: "start",
        mediaAssetId: startAssetId,
      });
    } else if (startAssetId !== undefined && imageTaskId) {
      const { imageTask: _staleTask, ...withoutStaleTask } = nextFrame;
      nextFrame = withoutStaleTask;
      staleTasks.push({
        shotNumber: frame.shotNumber,
        frameRole: "start",
        taskId: imageTaskId,
      });
    }

    const stopTaskId = frame.stopFrameTask?.pendingTaskId;
    const stopAssetId = stopTaskId
      ? artifactByTaskId.get(stopTaskId)
      : undefined;
    const stopSourceIsCurrent = Boolean(
      frame.stopFrameTask?.promptHash &&
        frame.stopFramePromptHash &&
        frame.stopFrameTask.promptHash === frame.stopFramePromptHash
    );
    if (stopAssetId !== undefined && stopSourceIsCurrent) {
      nextFrame = {
        ...nextFrame,
        approvedStopFrameAssetId: String(stopAssetId),
        stopFrameTask: undefined,
      };
      repaired.push({
        shotNumber: frame.shotNumber,
        frameRole: "stop",
        mediaAssetId: stopAssetId,
      });
    } else if (stopAssetId !== undefined && stopTaskId) {
      const { stopFrameTask: _staleTask, ...withoutStaleTask } = nextFrame;
      nextFrame = withoutStaleTask;
      staleTasks.push({
        shotNumber: frame.shotNumber,
        frameRole: "stop",
        taskId: stopTaskId,
      });
    }
    return nextFrame;
  });

  return repaired.length > 0 || staleTasks.length > 0
    ? { plan: { ...plan, frames }, repaired, staleTasks }
    : { plan, repaired, staleTasks };
}
