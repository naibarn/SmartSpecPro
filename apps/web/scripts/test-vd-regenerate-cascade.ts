import "dotenv/config";
import { getDb, db } from "../server/db";
import { and, eq, inArray } from "drizzle-orm";
import { verticalDramaEpisodeRuns, verticalDramaEpisodes } from "../drizzle/schema";
import { VerticalDramaEpisodePipeline } from "../server/services/verticalDramaEpisodePipeline";
import { createVerticalDramaProviderRoutingPort } from "../server/services/verticalDramaProviderRouting";

async function main() {
  getDb();
  const owner = { tenantId: "tenant-ZCSKEM9s", userId: 1, seriesId: 2, episodeId: 1 };
  const stage = "plan_episode_script" as const;

  const before = await db
    .select({ script: verticalDramaEpisodes.script, storyboard: verticalDramaEpisodes.storyboard, startFramePlan: verticalDramaEpisodes.startFramePlan })
    .from(verticalDramaEpisodes)
    .where(eq(verticalDramaEpisodes.id, owner.episodeId))
    .limit(1);
  console.log(
    "BEFORE — script present:", Boolean(before[0]?.script),
    "| storyboard shots:", (before[0]?.storyboard as any)?.shots?.length,
    "| startFramePlan frames:", (before[0]?.startFramePlan as any)?.frames?.length,
  );

  const downstream = VerticalDramaEpisodePipeline.downstreamStages(stage);
  console.log("Downstream stages of", stage, ":", downstream);
  const stagesToClear = [stage, ...downstream];

  await db
    .delete(verticalDramaEpisodeRuns)
    .where(
      and(
        eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
        eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
        inArray(verticalDramaEpisodeRuns.stage, stagesToClear as string[]),
      ),
    );

  const downstreamColumnByStage: Record<string, string> = {
    plan_episode_script: "script",
    storyboard_shotgrid: "storyboard",
    start_frame_render_plan: "startFramePlan",
    dialogue_audio_plan: "dialogueAudioPlan",
    video_motion_prompt_pack: "motionPromptPack",
    assemble_episode_manifest: "assemblyManifest",
  };
  const columnUpdates: Record<string, null> = {};
  for (const s of downstream) {
    const col = downstreamColumnByStage[s];
    if (col) columnUpdates[col] = null;
  }
  if (downstream.includes("create_storyboard_review_project" as any)) {
    columnUpdates.storyboardReviewId = null;
  }
  console.log("Columns being nulled:", Object.keys(columnUpdates));
  if (Object.keys(columnUpdates).length > 0) {
    await db
      .update(verticalDramaEpisodes)
      .set({ ...columnUpdates, updatedAt: new Date() })
      .where(eq(verticalDramaEpisodes.id, owner.episodeId));
  }

  const pipeline = new VerticalDramaEpisodePipeline(createVerticalDramaProviderRoutingPort());
  const outcome = await pipeline.runStage(owner, stage, { mode: "full", subShotFlagOn: false });
  console.log("Regenerate outcome status:", outcome.result.status, outcome.result.next_action);

  const after = await db
    .select({ script: verticalDramaEpisodes.script, storyboard: verticalDramaEpisodes.storyboard, startFramePlan: verticalDramaEpisodes.startFramePlan })
    .from(verticalDramaEpisodes)
    .where(eq(verticalDramaEpisodes.id, owner.episodeId))
    .limit(1);
  console.log(
    "AFTER — script present:", Boolean(after[0]?.script),
    "| storyboard:", after[0]?.storyboard,
    "| startFramePlan:", after[0]?.startFramePlan,
  );
  process.exit(0);
}
main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
