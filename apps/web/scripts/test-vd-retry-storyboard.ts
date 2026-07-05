import "dotenv/config";
import { getDb } from "../server/db";
import { verticalDramaEpisodePipeline } from "../server/services/verticalDramaEpisodePipeline";

async function main() {
  getDb();
  const owner = { tenantId: "tenant-ZCSKEM9s", userId: 1, seriesId: 2, episodeId: 1 };
  const result = await verticalDramaEpisodePipeline.runStage(owner, "storyboard_shotgrid", { mode: "full" });
  console.log(JSON.stringify(result.result, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
