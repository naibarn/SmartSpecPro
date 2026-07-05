import "dotenv/config";
import { getDb, db } from "../server/db";
import { eq } from "drizzle-orm";
import { verticalDramaEpisodes } from "../drizzle/schema";
import { VerticalDramaEpisodePipeline } from "../server/services/verticalDramaEpisodePipeline";
import { createVerticalDramaProviderRoutingPort } from "../server/services/verticalDramaProviderRouting";

// Mirrors the exact client-side orchestration in
// `VerticalDramaEpisodePage.tsx`'s `handleGenerateEpisodeStoryboard`, but
// calling the pipeline service directly instead of through tRPC — verifies
// the new `checkpointId` propagation + `approveRunCheckpoint` auto-approve
// chain works end-to-end, with zero manual approval clicks required.
async function main() {
  getDb();
  const owner = { tenantId: "tenant-ZCSKEM9s", userId: 1, seriesId: 2, episodeId: 5 };
  const pipeline = new VerticalDramaEpisodePipeline(createVerticalDramaProviderRoutingPort());

  const stages = [
    "normalize_series_input",
    "plan_episode_script",
    "update_character_visual_bible",
    "generate_or_import_character_refs",
    "storyboard_shotgrid",
  ] as const;

  let creditChargingStages = 0;
  for (const stage of stages) {
    console.log(`\n=== ${stage} ===`);
    const outcome = await pipeline.runStage(owner, stage, { mode: "full", subShotFlagOn: false });
    console.log("status:", outcome.result.status, "next_action:", outcome.result.next_action, "checkpointId:", outcome.checkpointId);
    if (outcome.result.status === "failed") {
      console.log("FAILED:", JSON.stringify(outcome.result.errors));
      process.exit(1);
    }
    if (stage === "plan_episode_script" || stage === "storyboard_shotgrid") creditChargingStages++;
    if (outcome.result.status === "approval_required" && outcome.checkpointId != null) {
      const approveResult = await pipeline.approveRunCheckpoint(owner, outcome.checkpointId, "approve");
      console.log("Auto-approved checkpoint", outcome.checkpointId, "-> state:", approveResult?.checkpoint.state);
    }
  }

  console.log(`\nCredit-charging LLM stages run: ${creditChargingStages} (expect 2: script + storyboard)`);

  const [episode] = await db
    .select({ storyboard: verticalDramaEpisodes.storyboard })
    .from(verticalDramaEpisodes)
    .where(eq(verticalDramaEpisodes.id, owner.episodeId))
    .limit(1);
  const shots = (episode?.storyboard as any)?.shots;
  console.log("Final storyboard shot count:", Array.isArray(shots) ? shots.length : "N/A");
  if (Array.isArray(shots) && shots[0]) {
    console.log("Shot 1 characters:", shots[0].characters, "| required_character_refs:", shots[0].required_character_refs);
  }
  process.exit(0);
}
main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
