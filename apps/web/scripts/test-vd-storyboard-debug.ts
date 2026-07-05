import "dotenv/config";
import { getDb } from "../server/db";
import { db } from "../server/db";
import { and, eq } from "drizzle-orm";
import {
  verticalDramaSeries,
  verticalDramaCharacters,
} from "../drizzle/schema";
import { generateStoryboardShotgrid, VdSchemaValidationError } from "../server/services/verticalDramaStoryboardGeneration";

async function main() {
  getDb();
  const owner = { tenantId: "tenant-ZCSKEM9s", userId: 1, seriesId: 2, episodeId: 1 };

  const [seriesRow] = await db
    .select()
    .from(verticalDramaSeries)
    .where(and(eq(verticalDramaSeries.id, owner.seriesId), eq(verticalDramaSeries.tenantId, owner.tenantId)))
    .limit(1);

  const characterRows = await db
    .select({ characterKey: verticalDramaCharacters.characterKey, name: verticalDramaCharacters.name, role: verticalDramaCharacters.role })
    .from(verticalDramaCharacters)
    .where(and(eq(verticalDramaCharacters.tenantId, owner.tenantId), eq(verticalDramaCharacters.seriesId, owner.seriesId)));

  const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
  const episodeBreakdown = Array.isArray(bible?.episodeBreakdown) ? (bible!.episodeBreakdown as Array<Record<string, unknown>>) : [];
  const matchingBreakdown = episodeBreakdown.find(item => Number(item.episodeNumber) === 1);

  try {
    const result = await generateStoryboardShotgrid({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      episodeTitle: "คลุมถุงชน…เพื่อสัญญา (ตอนที่ 1)",
      episodeNumber: 1,
      locale: (seriesRow?.locale as "th" | "en") ?? "th",
      durationSeconds: 60,
      storySource: {
        logline: typeof matchingBreakdown?.logline === "string" ? (matchingBreakdown.logline as string) : undefined,
        mainPlot: typeof bible?.mainPlot === "string" ? (bible.mainPlot as string) : undefined,
        seasonArc: typeof bible?.expandedSeasonArc === "string" ? (bible.expandedSeasonArc as string) : undefined,
        tone: seriesRow?.tone ?? undefined,
      },
      characters: characterRows.map(c => ({ characterId: c.characterKey, name: c.name, role: c.role })),
    });
    console.log("SUCCESS", JSON.stringify(result.storyboard.shots?.length));
  } catch (err) {
    if (err instanceof VdSchemaValidationError) {
      console.log("SCHEMA VALIDATION ERROR");
      console.log(JSON.stringify((err as any).issues ?? (err as any).details ?? err, null, 2));
    } else {
      console.log("OTHER ERROR", err);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
