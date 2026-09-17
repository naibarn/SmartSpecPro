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

type StartFramePlanFrame = VerticalDramaStartFramePlan["frames"][number];

/**
 * Reconciles only task markers that have an owner-scoped, ready artifact.
 * Provider completion alone is not enough: the durable artifact is the
 * canonical handoff that makes the episode safe to render and reload.
 */
export function reconcileStartFramePlanWithDurableArtifacts(
  plan: VerticalDramaStartFramePlan,
  artifacts: readonly DurableStartFrameArtifact[]
): { plan: VerticalDramaStartFramePlan; repaired: StartFrameRepair[] } {
  const artifactByTaskId = new Map(
    artifacts.map(artifact => [artifact.sourceTaskId, artifact.mediaAssetId])
  );
  const repaired: StartFrameRepair[] = [];
  const frames = plan.frames.map(frame => {
    let nextFrame: StartFramePlanFrame = frame;
    const imageTaskId = frame.imageTask?.pendingTaskId;
    const startAssetId = imageTaskId
      ? artifactByTaskId.get(imageTaskId)
      : undefined;
    if (startAssetId !== undefined) {
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
    }

    const stopTaskId = frame.stopFrameTask?.pendingTaskId;
    const stopAssetId = stopTaskId
      ? artifactByTaskId.get(stopTaskId)
      : undefined;
    if (stopAssetId !== undefined) {
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
    }
    return nextFrame;
  });

  return repaired.length > 0
    ? { plan: { ...plan, frames }, repaired }
    : { plan, repaired };
}
