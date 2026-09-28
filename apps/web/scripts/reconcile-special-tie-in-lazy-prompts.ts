import "dotenv/config";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  verticalDramaEpisodes,
  verticalDramaSpecialTieInDebugEvents,
} from "../drizzle/schema";
import {
  buildSpecialTieInPromptArtifacts,
  buildSpecialTieInStoryboard,
  repairSpecialTieInOutput,
  validateSpecialSkillOutput,
  validateSpecialTieInStoryOutput,
} from "../server/services/verticalDramaSpecialSkillAdapter";
import { resolveSpecialReferenceBindings } from "../server/services/verticalDramaSpecialReferences";
import type { SpecialEpisodeData } from "../shared/verticalDramaSeries/specialTieInContracts";
import type {
  VerticalDramaMotionPromptPack,
  VerticalDramaStartFramePlan,
} from "../shared/verticalDramaSeries/contracts";

const episodeId = Number(process.argv[2]);
if (!Number.isInteger(episodeId) || episodeId <= 0) {
  throw new Error("Usage: tsx scripts/reconcile-special-tie-in-lazy-prompts.ts <episodeId>");
}

const db = getDb();
const [row] = await db
  .select()
  .from(verticalDramaEpisodes)
  .where(eq(verticalDramaEpisodes.id, episodeId))
  .limit(1);
if (!row || row.episodeKind !== "special_tie_in") {
  throw new Error(`Episode ${episodeId} is not a special tie-in episode`);
}

const specialData = row.specialData as SpecialEpisodeData;
const [forensic] = await db
  .select({ parsedOutput: verticalDramaSpecialTieInDebugEvents.parsedOutput })
  .from(verticalDramaSpecialTieInDebugEvents)
  .where(
    and(
      eq(verticalDramaSpecialTieInDebugEvents.episodeId, episodeId),
      eq(verticalDramaSpecialTieInDebugEvents.eventType, "output_accepted"),
      isNotNull(verticalDramaSpecialTieInDebugEvents.parsedOutput)
    )
  )
  .orderBy(
    desc(verticalDramaSpecialTieInDebugEvents.createdAt),
    desc(verticalDramaSpecialTieInDebugEvents.id)
  )
  .limit(1);
if (!forensic?.parsedOutput) {
  throw new Error(`Episode ${episodeId} has no accepted raw skill output to repair`);
}

const normalized = validateSpecialSkillOutput(forensic.parsedOutput);
const output = repairSpecialTieInOutput(
  normalized,
  specialData.input,
  specialData.referenceBindings
);
validateSpecialTieInStoryOutput({
  output,
  specialInput: specialData.input,
  bindings: specialData.referenceBindings,
});

const actor = { tenantId: row.tenantId, userId: row.userId };
const resolved = await resolveSpecialReferenceBindings(
  actor,
  specialData.referenceBindings
);
const existingPlan = row.startFramePlan as VerticalDramaStartFramePlan | null;
const existingPack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
const locationKey =
  existingPlan?.frames?.find(frame => frame.locationKey)?.locationKey ??
  specialData.input.referenceImages.find(reference =>
    reference.role === "location" || reference.role === "store"
  )?.provenance?.locationKey;
const artifacts = buildSpecialTieInPromptArtifacts({
  specialData,
  output,
  productReferenceUrls: resolved
    .filter(binding => binding.role === "product")
    .map(binding => binding.authorizedUrl),
  locationKey,
});
if (!artifacts.startFramePlan || !artifacts.motionPromptPack) {
  throw new Error(`Episode ${episodeId} could not materialize nine lazy-prompt shots`);
}

const oldFrames = new Map(
  (existingPlan?.frames ?? []).map(frame => [frame.shotNumber, frame])
);
const startFramePlan: VerticalDramaStartFramePlan = {
  ...artifacts.startFramePlan,
  frames: artifacts.startFramePlan.frames.map(frame => {
    const old = oldFrames.get(frame.shotNumber);
    if (!old) return frame;
    const {
      imagePromptHash: _imagePromptHash,
      promptMode: _promptMode,
      promptSafetyAdjustments: _promptSafetyAdjustments,
      promptAnalysis: _promptAnalysis,
      startFrameSemanticHandoff: _startFrameSemanticHandoff,
      ...durableOldFrame
    } = old;
    return {
      ...durableOldFrame,
      ...frame,
      imagePrompt: "",
      negativePrompt: "",
    };
  }),
};
const oldClips = new Map(
  (existingPack?.clips ?? []).map(clip => [clip.clipNumber, clip])
);
const motionPromptPack: VerticalDramaMotionPromptPack = {
  ...artifacts.motionPromptPack,
  clips: artifacts.motionPromptPack.clips.map(clip => {
    const old = oldClips.get(clip.clipNumber);
    const hasCompletedVideo = Boolean(old?.videoTask?.videoUrl);
    return old
      ? {
          ...old,
          ...clip,
          // An old prompt without a rendered video is the stale artifact this
          // repair removes. Keep a prompt only when a paid video already
          // exists and needs its source prompt for replay/audit.
          prompt: hasCompletedVideo ? old.prompt : "",
        }
      : clip;
  }),
};

const repairedSpecialData: SpecialEpisodeData = {
  ...specialData,
  outputVersion: Number(specialData.outputVersion ?? 0) + 1,
  output: {
    ...specialData.output,
    shotCount: 9,
    storySummaries: startFramePlan.frames.map(frame => ({
      shotNumber: frame.shotNumber,
      summary: frame.canonicalShotSummary ?? "",
    })),
    qualityControl: output.quality_control,
    needsReview: true,
  },
};

await db
  .update(verticalDramaEpisodes)
  .set({
    specialData: repairedSpecialData,
    startFramePlan,
    motionPromptPack,
    ...(locationKey
      ? {
          storyboard: buildSpecialTieInStoryboard(
            specialData.input,
            locationKey,
            specialData.input.referenceImages.find(
              reference =>
                reference.role === "location" || reference.role === "store"
            )?.label
          ),
        }
      : {}),
    updatedAt: new Date(),
  })
  .where(eq(verticalDramaEpisodes.id, episodeId));

console.info("[VD_SPECIAL_RECONCILE] lazy_prompt_artifacts_repaired", {
  episodeId,
  frameCount: startFramePlan.frames.length,
  clipCount: motionPromptPack.clips.length,
  imagePromptsMaterialized: startFramePlan.frames.filter(frame => frame.imagePrompt.trim()).length,
  videoPromptsMaterialized: motionPromptPack.clips.filter(clip => clip.prompt.trim()).length,
  dialogueTurnsPerShot: motionPromptPack.clips.map(clip => clip.dialogue?.length ?? 0),
  preservedCompletedVideos: motionPromptPack.clips.filter(clip => clip.videoTask?.videoUrl).length,
});
