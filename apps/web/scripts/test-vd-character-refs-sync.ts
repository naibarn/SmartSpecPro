import "dotenv/config";
import { getDb } from "../server/db";
import { VerticalDramaEpisodePipeline } from "../server/services/verticalDramaEpisodePipeline";
import { createVerticalDramaProviderRoutingPort } from "../server/services/verticalDramaProviderRouting";

async function main() {
  getDb();
  const owner = { tenantId: "tenant-ZCSKEM9s", userId: 1, seriesId: 2, episodeId: 3 };
  const pipeline = new VerticalDramaEpisodePipeline(createVerticalDramaProviderRoutingPort());
  const outcome = await pipeline.runStage(owner, "generate_or_import_character_refs", {
    mode: "full",
    subShotFlagOn: false,
  });
  console.log(JSON.stringify(outcome.result, null, 2));
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
