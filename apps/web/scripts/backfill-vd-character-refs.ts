import "dotenv/config";
import { getDb, db } from "../server/db";
import { eq } from "drizzle-orm";
import {
  verticalDramaEpisodes,
  verticalDramaCharacters,
} from "../drizzle/schema";

/**
 * One-off backfill for a bug found 2026-07-05: the storyboard-shotgrid LLM
 * sometimes invents its own character-id slugs instead of using the real
 * `characterKey` values it was given, and a field-name mismatch in
 * `verticalDramaEpisodePipeline.ts` meant the start-frame-plan stage always
 * received an empty character list regardless. Both are now fixed
 * prospectively in the generation services; this script re-derives correct
 * `characters` / `required_character_refs` (storyboard) and
 * `requiredCharacterRefs` (startFramePlan) for already-generated episodes,
 * by matching each real character's actual name against the shot's own
 * narrative text (action/narrative_purpose/visual_description/dialogue).
 */
async function main() {
  getDb();

  const episodes = await db.select().from(verticalDramaEpisodes);
  console.log(`Found ${episodes.length} episode(s) to inspect.`);

  for (const episode of episodes) {
    const characterRows = await db
      .select({
        id: verticalDramaCharacters.id,
        characterKey: verticalDramaCharacters.characterKey,
        name: verticalDramaCharacters.name,
      })
      .from(verticalDramaCharacters)
      .where(eq(verticalDramaCharacters.seriesId, episode.seriesId));
    const validIds = new Set(characterRows.map((c) => c.characterKey));

    const storyboard = episode.storyboard as Record<string, unknown> | null;
    const shots = Array.isArray(storyboard?.shots)
      ? (storyboard!.shots as Array<Record<string, unknown>>)
      : [];

    let storyboardChanged = false;
    for (const shot of shots) {
      const text = [
        shot.action,
        shot.narrative_purpose,
        shot.visual_description,
        shot.dialogue_excerpt,
        shot.subtitle_text,
      ]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .join(" ");
      const nameMatches = characterRows
        .filter((c) => text.includes(c.name))
        .map((c) => c.characterKey);
      const existingCharacters = Array.isArray(shot.characters)
        ? (shot.characters as string[])
        : [];
      const existingRefs = Array.isArray(shot.required_character_refs)
        ? (shot.required_character_refs as string[])
        : [];
      const validExisting = [...existingCharacters, ...existingRefs].filter(
        (id) => validIds.has(id),
      );
      const resolved = Array.from(new Set([...nameMatches, ...validExisting]));
      const before = JSON.stringify([existingCharacters, existingRefs]);
      const after = JSON.stringify([resolved, resolved]);
      if (before !== after) {
        console.log(
          `  Episode ${episode.id} shot ${shot.shot_number}: characters ${JSON.stringify(existingCharacters)} -> ${JSON.stringify(resolved)}, required_character_refs ${JSON.stringify(existingRefs)} -> ${JSON.stringify(resolved)}`,
        );
        shot.characters = resolved;
        shot.required_character_refs = resolved;
        storyboardChanged = true;
      }
    }

    const startFramePlan = episode.startFramePlan as Record<string, unknown> | null;
    const frames = Array.isArray(startFramePlan?.frames)
      ? (startFramePlan!.frames as Array<Record<string, unknown>>)
      : [];
    let planChanged = false;
    for (const frame of frames) {
      const shotNumber = Number(frame.shotNumber);
      const matchingShot = shots.find(
        (s) => Number(s.shot_number ?? s.shotNumber) === shotNumber,
      );
      const groundTruth = Array.isArray(matchingShot?.required_character_refs)
        ? (matchingShot!.required_character_refs as string[])
        : [];
      const existing = Array.isArray(frame.requiredCharacterRefs)
        ? (frame.requiredCharacterRefs as string[])
        : [];
      if (groundTruth.length > 0 && JSON.stringify(existing) !== JSON.stringify(groundTruth)) {
        console.log(
          `  Episode ${episode.id} frame shot ${shotNumber}: requiredCharacterRefs ${JSON.stringify(existing)} -> ${JSON.stringify(groundTruth)}`,
        );
        frame.requiredCharacterRefs = groundTruth;
        planChanged = true;
      }
    }

    if (storyboardChanged || planChanged) {
      await db
        .update(verticalDramaEpisodes)
        .set({
          ...(storyboardChanged ? { storyboard } : {}),
          ...(planChanged ? { startFramePlan } : {}),
        })
        .where(eq(verticalDramaEpisodes.id, episode.id));
      console.log(`Episode ${episode.id}: updated.`);
    } else {
      console.log(`Episode ${episode.id}: no change needed.`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
