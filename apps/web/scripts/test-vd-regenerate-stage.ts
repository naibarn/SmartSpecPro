import "dotenv/config";
import { getDb, db } from "../server/db";
import { and, eq } from "drizzle-orm";
import { verticalDramaEpisodeRuns, verticalDramaEpisodes } from "../drizzle/schema";
import { VerticalDramaEpisodePipeline } from "../server/services/verticalDramaEpisodePipeline";
import { createVerticalDramaProviderRoutingPort } from "../server/services/verticalDramaProviderRouting";

async function main() {
  getDb();
  const owner = {
    tenantId: "tenant-ZCSKEM9s",
    userId: 1,
    seriesId: 2,
    episodeId: 1,
  };
  const stage = "storyboard_shotgrid" as const;

  const before = await db
    .select()
    .from(verticalDramaEpisodeRuns)
    .where(and(eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId), eq(verticalDramaEpisodeRuns.stage, stage)));
  console.log("Runs BEFORE:", before.map(r => ({ id: r.id, status: r.status, nextAction: r.nextAction })));

  console.log("Deleting run rows for stage...");
  const deleted = await db
    .delete(verticalDramaEpisodeRuns)
    .where(
      and(
        eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
        eq(verticalDramaEpisodeRuns.userId, owner.userId),
        eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
        eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
        eq(verticalDramaEpisodeRuns.stage, stage),
      ),
    )
    .returning();
  console.log("Deleted rows:", deleted.length);

  console.log("Calling runStage in full mode...");
  const pipeline = new VerticalDramaEpisodePipeline(createVerticalDramaProviderRoutingPort());
  try {
    const outcome = await pipeline.runStage(owner, stage, {
      mode: "full",
      subShotFlagOn: false,
    });
    console.log("Outcome:", JSON.stringify(outcome.result, null, 2));
  } catch (err) {
    console.error("THROWN ERROR:", err);
  }

  const after = await db
    .select()
    .from(verticalDramaEpisodeRuns)
    .where(and(eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId), eq(verticalDramaEpisodeRuns.stage, stage)));
  console.log("Runs AFTER:", after.map(r => ({ id: r.id, status: r.status, nextAction: r.nextAction })));

  const [episode] = await db
    .select({ storyboard: verticalDramaEpisodes.storyboard, updatedAt: verticalDramaEpisodes.updatedAt })
    .from(verticalDramaEpisodes)
    .where(eq(verticalDramaEpisodes.id, owner.episodeId))
    .limit(1);
  const shots = (episode?.storyboard as any)?.shots;
  console.log("episode.storyboard.shots length:", Array.isArray(shots) ? shots.length : "N/A", "updatedAt:", episode?.updatedAt);
  if (Array.isArray(shots) && shots[0]) {
    console.log("First shot image_prompt:", shots[0].image_prompt);
  }
  process.exit(0);
}
main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
