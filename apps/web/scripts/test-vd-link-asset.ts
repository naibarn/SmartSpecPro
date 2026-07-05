import "dotenv/config";
import { getDb } from "../server/db";
import { verticalDramaCharacterStockService } from "../server/services/verticalDramaCharacterStock";

// Mirrors exactly what the "switch image" panel's linkAsset call does, to
// rule out a real bug vs a transient 502 during the recent service restart.
async function main() {
  getDb();
  const owner = { tenantId: "tenant-ZCSKEM9s", userId: 1, seriesId: 2 };
  const asset = await verticalDramaCharacterStockService.linkAsset({
    ...owner,
    characterId: 2,
    mediaAssetId: 20,
    assetType: "character_reference",
    role: "primary_portrait",
    source: "imported",
    containsHumanFace: null,
    checksumSha256: null,
    metadata: null,
  });
  console.log("SUCCESS:", JSON.stringify(asset, null, 2));
  process.exit(0);
}
main().catch(e => {
  console.error("FAILED:", e);
  process.exit(1);
});
