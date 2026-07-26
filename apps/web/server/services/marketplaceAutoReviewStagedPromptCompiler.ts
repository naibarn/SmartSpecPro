import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  buildStagedImagePrompt,
  buildStagedVideoPrompt,
  type StagedStoryArcPlan,
  type StagedStoryArcShot,
} from "./marketplaceAutoReviewStoryArcPlanner";

export function buildStagedImagePromptContentHash(input: {
  revision: number;
  shotId: number;
  prompt: string;
  referenceManifestHash: string;
}) {
  return buildProductionStableHash({
    kind: "image_prompt",
    revision: input.revision,
    shotId: input.shotId,
    prompt: input.prompt,
    referenceManifestHash: input.referenceManifestHash,
  });
}

export function buildStagedVideoPromptContentHash(input: {
  revision: number;
  shotId: number;
  prompt: string;
  imageArtifactHash: string;
}) {
  return buildProductionStableHash({
    kind: "video_prompt",
    shotId: input.shotId,
    revision: input.revision,
    prompt: input.prompt,
    imageArtifactHash: input.imageArtifactHash,
  });
}

export function compileStagedImagePrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
}) {
  const prompt = buildStagedImagePrompt(input);
  return {
    prompt,
    contentHash: buildStagedImagePromptContentHash({
      revision: input.plan.planRevision,
      shotId: input.shot.shotId,
      prompt,
      referenceManifestHash: input.plan.referenceManifestHash,
    }),
  };
}

export function compileStagedVideoPrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
  imageArtifactHash: string;
}) {
  const prompt = buildStagedVideoPrompt(input);
  return {
    prompt,
    contentHash: buildStagedVideoPromptContentHash({
      revision: input.plan.planRevision,
      shotId: input.shot.shotId,
      prompt,
      imageArtifactHash: input.imageArtifactHash,
    }),
  };
}
