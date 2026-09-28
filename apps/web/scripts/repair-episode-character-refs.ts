import "dotenv/config";
import { getDb, db } from "../server/db";
import { eq } from "drizzle-orm";
import { verticalDramaEpisodes } from "../drizzle/schema";
import { repairEpisodeShotCharacterReferences } from "../server/services/verticalDramaShotCharacterRepair";

/**
 * One-off runnable repair for missing per-shot character reference slots
 * (concrete repro: series 16, episode 67 — "มินตรา" speaks per the script but
 * is absent from every frame's `requiredCharacterRefs`). Reuses
 * `repairEpisodeShotCharacterReferences` (`server/services/
 * verticalDramaShotCharacterRepair.ts`) — this script only resolves the
 * episode's tenantId/userId/seriesId (the orchestrator's required owner
 * scope) from the episode row itself and prints the summary; it duplicates
 * NO merge/resolution logic of its own.
 *
 * Usage:
 *   cd apps/web && npx tsx scripts/repair-episode-character-refs.ts <episodeId>
 *
 * DB SAFETY: back up the episode row BEFORE running this (root CLAUDE.md
 * Database Safety Protocol) — e.g.:
 *   psql "$DATABASE_URL" -c "\copy (SELECT * FROM vertical_drama_episodes WHERE id = <episodeId>) TO '.db-backups/vertical_drama_episodes_<episodeId>_$(date +%Y%m%d_%H%M%S).csv' CSV HEADER"
 */
async function main() {
  const episodeIdArg = process.argv[2];
  const episodeId = Number(episodeIdArg);
  if (!episodeIdArg || !Number.isInteger(episodeId) || episodeId <= 0) {
    console.error(
      "Usage: npx tsx scripts/repair-episode-character-refs.ts <episodeId>"
    );
    process.exit(1);
  }

  getDb();

  const [episodeRow] = await db
    .select({
      id: verticalDramaEpisodes.id,
      tenantId: verticalDramaEpisodes.tenantId,
      userId: verticalDramaEpisodes.userId,
      seriesId: verticalDramaEpisodes.seriesId,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
    })
    .from(verticalDramaEpisodes)
    .where(eq(verticalDramaEpisodes.id, episodeId))
    .limit(1);

  if (!episodeRow) {
    console.error(`Episode ${episodeId} not found.`);
    process.exit(1);
  }

  console.log(
    `Repairing episode ${episodeRow.id} (episode #${episodeRow.episodeNumber}, series ${episodeRow.seriesId}, tenant ${episodeRow.tenantId}, user ${episodeRow.userId})...`
  );

  const { added, updatedPlan } = await repairEpisodeShotCharacterReferences({
    tenantId: episodeRow.tenantId,
    userId: episodeRow.userId,
    seriesId: episodeRow.seriesId,
    episodeId: episodeRow.id,
  });

  if (added.length === 0) {
    console.log("No missing character references found — nothing to repair.");
  } else {
    console.log(`Repaired ${added.length} shot(s):`);
    for (const a of added) {
      console.log(
        `  Shot ${a.shotNumber}: added ${a.addedKeys.join(", ")} (${a.addedNames.join(", ")})`
      );
    }
    console.log(
      `Final frame count in startFramePlan: ${updatedPlan.frames.length}`
    );
  }

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
