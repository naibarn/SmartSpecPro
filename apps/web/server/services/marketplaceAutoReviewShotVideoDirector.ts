import {
  buildStagedVideoPromptContentHash,
  compileStagedVideoPrompt,
} from "./marketplaceAutoReviewStagedPromptCompiler";
import type {
  StagedStoryArcPlan,
  StagedStoryArcShot,
} from "./marketplaceAutoReviewStoryArcPlanner";

export function buildStagedShotVideoDirectorPrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
  acceptedImageArtifactHash: string;
}) {
  return compileStagedVideoPrompt({
    plan: input.plan,
    shot: input.shot,
    imageArtifactHash: input.acceptedImageArtifactHash,
  });
}
export function isStagedShotVideoPromptBoundToImage(input: {
  revision: number;
  shotId: number;
  prompt: string;
  acceptedImageArtifactHash: string;
  contentHash: string;
}) {
  return (
    buildStagedVideoPromptContentHash({
      revision: input.revision,
      shotId: input.shotId,
      prompt: input.prompt,
      imageArtifactHash: input.acceptedImageArtifactHash,
    }) === input.contentHash
  );
}
