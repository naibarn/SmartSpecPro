import "dotenv/config";
import { getDb, db } from "../server/db";
import { and, eq } from "drizzle-orm";
import {
  verticalDramaEpisodes,
  verticalDramaSeries,
  verticalDramaCharacters,
} from "../drizzle/schema";

// Re-implements the exact extraction logic added to
// `generateRealStoryboard`/`generateRealMotionPromptPack` in
// verticalDramaEpisodePipeline.ts, so we can print the resulting prompt text
// without spending any LLM credits (no network call — this only exercises
// the pure data-transform + prompt-string-building code paths).
async function main() {
  getDb();
  const [episode] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(eq(verticalDramaEpisodes.id, 1))
    .limit(1);
  const [seriesRow] = await db
    .select()
    .from(verticalDramaSeries)
    .where(eq(verticalDramaSeries.id, episode.seriesId))
    .limit(1);
  const characterRows = await db
    .select({
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
      role: verticalDramaCharacters.role,
    })
    .from(verticalDramaCharacters)
    .where(eq(verticalDramaCharacters.seriesId, episode.seriesId));

  const script = (episode.script as Record<string, unknown> | null) ?? null;
  const sceneDialogueSummary = Array.isArray(script?.scene_dialogue_summary)
    ? (script!.scene_dialogue_summary as Array<Record<string, unknown>>)
    : [];
  const sceneBeats = sceneDialogueSummary
    .map(s => ({
      scene: typeof s.scene === "number" ? s.scene : undefined,
      location: typeof s.location === "string" ? s.location : undefined,
      summary: typeof s.summary === "string" ? s.summary : undefined,
      keyLine:
        typeof s.key_line === "string"
          ? s.key_line
          : typeof s.dialogue_line === "string"
            ? s.dialogue_line
            : undefined,
    }))
    .filter(s => s.summary);

  console.log(`=== Scene beats extracted (${sceneBeats.length}) ===`);
  sceneBeats.forEach(s => console.log(`Scene ${s.scene} @ ${s.location}: ${s.summary} | line: "${s.keyLine}"`));

  const sceneBeatLines = sceneBeats.length
    ? sceneBeats
        .map(s => {
          const parts = [s.scene != null ? `Scene ${s.scene}` : null, s.location ? `@ ${s.location}` : null]
            .filter(Boolean)
            .join(" ");
          const line = s.keyLine ? ` | line: "${s.keyLine}"` : "";
          return `- ${parts}: ${s.summary}${line}`;
        })
        .join("\n")
    : null;
  const sceneBeatInstruction = sceneBeatLines
    ? `Episode scenes (this is what ACTUALLY happens in this episode's script — ground every shot in these, in order; do not invent generic mood shots disconnected from this list):\n${sceneBeatLines}\nDistribute the 9 shots across these scenes in order (multiple shots may cover the same scene). For any shot depicting a scene that has a "line", use that exact line (translated/adapted only if needed for length) as the shot's "dialogue_excerpt" and a short version as "subtitle_text" — do not invent unrelated dialogue.`
    : null;

  console.log("\n=== Scene-beat instruction that will be inserted into the storyboard prompt ===\n");
  console.log(sceneBeatInstruction);

  // Video motion prompt dialogue wiring check
  const storyboard = (episode.storyboard as Record<string, unknown> | null) ?? null;
  const shots = Array.isArray(storyboard?.shots) ? (storyboard!.shots as Array<Record<string, unknown>>) : [];
  console.log("\n=== Per-shot dialogueExcerpt that will feed the motion-prompt stage ===");
  shots.forEach(s => {
    const dialogueExcerpt =
      typeof s.dialogue_excerpt === "string" && s.dialogue_excerpt
        ? s.dialogue_excerpt
        : typeof s.subtitle_text === "string"
          ? s.subtitle_text
          : undefined;
    console.log(`Shot ${s.shot_number}: dialogue="${dialogueExcerpt ?? "(none)"}"`);
  });

  console.log(`\nSeries: ${seriesRow?.title}, characters: ${characterRows.map(c => c.name).join(", ")}`);
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
