import "dotenv/config";
import { getDb } from "../server/db";
import { deductCredits } from "../server/services/creditService";

async function main() {
  getDb();
  await deductCredits({
    userId: 1,
    tenantId: "tenant-ZCSKEM9s",
    amount: 20,
    description: "Vertical Drama — verification test render (episode #1, shot 1) — reconciling credit spend from a live test call",
    sourceType: "media_image",
    metadata: { model: "google-banana-2-lite", feature: "vertical_drama_series", seriesId: 2, episodeId: 1, shotNumber: 1, note: "manual reconciliation for test-vd-generate-image.ts" },
  });
  console.log("Reconciled.");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
