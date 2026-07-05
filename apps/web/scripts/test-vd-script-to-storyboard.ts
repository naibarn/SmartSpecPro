/**
 * One-off verification script (not part of the app) — exercises the real
 * `update_character_visual_bible` sync and `storyboard_shotgrid` real
 * generation for seriesId=2/episodeId=1, to confirm end-to-end that a real
 * script (already generated, confirmed via psql) leads to a real character
 * sync and a real 9-shot storyboard. Run with:
 *   npx tsx scripts/test-vd-script-to-storyboard.ts
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { verticalDramaEpisodePipeline } from "../server/services/verticalDramaEpisodePipeline";

async function main() {
  getDb();
  const owner = {
    tenantId: "tenant-ZCSKEM9s",
    userId: 1,
    seriesId: 2,
    episodeId: 1,
  };

  console.log("=== update_character_visual_bible (full) ===");
  const charResult = await verticalDramaEpisodePipeline.runStage(
    owner,
    "update_character_visual_bible",
    { mode: "full" }
  );
  console.log(JSON.stringify(charResult.result, null, 2));

  if (charResult.result.status === "failed") {
    console.log("Character bible sync failed — stopping before storyboard.");
    process.exit(1);
  }

  console.log("\n=== storyboard_shotgrid (full) ===");
  const sbResult = await verticalDramaEpisodePipeline.runStage(
    owner,
    "storyboard_shotgrid",
    { mode: "full" }
  );
  console.log(JSON.stringify(sbResult.result, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
