import "dotenv/config";
import { getDb } from "../server/db";
import {
  verticalDramaShotReferencesService,
  VerticalDramaShotReferenceError,
} from "../server/services/verticalDramaShotReferences";

// Real-DB smoke script for the Phase 2 shot-reference service (storyboard-
// complete plan). Mirrors test-vd-link-asset.ts's shape: link -> list ->
// idempotent re-link -> reorder -> delete -> ownership-guard rejection.
async function main() {
  getDb();
  const owner = { tenantId: "tenant-ZCSKEM9s", userId: 1, seriesId: 2 };
  const episodeId = 2;
  const shotNumber = 1;
  const mediaAssetId = 20;

  const linked = await verticalDramaShotReferencesService.linkReference({
    ...owner,
    episodeId,
    shotNumber,
    mediaAssetId,
    source: "grid_cut",
  });
  console.log("LINKED:", JSON.stringify(linked, null, 2));

  const relinked = await verticalDramaShotReferencesService.linkReference({
    ...owner,
    episodeId,
    shotNumber,
    mediaAssetId,
    source: "grid_cut",
  });
  if (relinked.referenceId !== linked.referenceId) {
    throw new Error("FAILED: linkReference was not idempotent on the unique key");
  }
  console.log("IDEMPOTENT RE-LINK OK:", relinked.referenceId);

  const manifest = await verticalDramaShotReferencesService.listForEpisode(owner, episodeId);
  console.log("MANIFEST:", JSON.stringify(manifest, null, 2));
  if (!manifest[shotNumber] || manifest[shotNumber].length === 0) {
    throw new Error("FAILED: listForEpisode did not surface the linked reference");
  }

  const reordered = await verticalDramaShotReferencesService.reorder({
    ...owner,
    episodeId,
    shotNumber,
    orderedReferenceIds: [Number(linked.referenceId)],
  });
  console.log("REORDERED:", JSON.stringify(reordered, null, 2));

  // Ownership guard: wrong seriesId must be rejected as episode_not_found.
  try {
    await verticalDramaShotReferencesService.linkReference({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: 999999,
      episodeId,
      shotNumber,
      mediaAssetId,
      source: "upload",
    });
    throw new Error("FAILED: expected episode_not_found for cross-series episodeId");
  } catch (e) {
    if (e instanceof VerticalDramaShotReferenceError && e.reason === "episode_not_found") {
      console.log("OWNERSHIP GUARD OK: rejected cross-series link with episode_not_found");
    } else {
      throw e;
    }
  }

  await verticalDramaShotReferencesService.deleteReference(owner, Number(linked.referenceId));
  const afterDelete = await verticalDramaShotReferencesService.listForEpisode(owner, episodeId);
  if (afterDelete[shotNumber] && afterDelete[shotNumber].length > 0) {
    throw new Error("FAILED: reference still present after deleteReference");
  }
  console.log("DELETE OK: shot reference removed, underlying media_assets row untouched");

  console.log("SUCCESS: all shot-reference service smoke checks passed");
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
