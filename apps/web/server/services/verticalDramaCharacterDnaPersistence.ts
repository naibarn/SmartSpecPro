import { and, eq, sql } from "drizzle-orm";
import { verticalDramaCharacters } from "../../drizzle/schema";
import type { VerticalDramaCharacterVisualBible } from "@shared/verticalDramaSeries/characterProfile";
import { db } from "../db";

export interface CharacterVisualBibleOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

/**
 * Atomically replaces only `data.visualBible`, preserving every sibling key
 * in the character's JSONB payload. The owner scope is repeated in the write
 * predicate so this helper remains safe if reused outside today's router.
 */
export async function persistCharacterVisualBible(
  owner: CharacterVisualBibleOwner,
  characterId: number,
  visualBible: VerticalDramaCharacterVisualBible
): Promise<void> {
  const [updated] = await db
    .update(verticalDramaCharacters)
    .set({
      data: sql`jsonb_set(COALESCE(${verticalDramaCharacters.data}, '{}'::jsonb), '{visualBible}', ${JSON.stringify(
        visualBible
      )}::jsonb, true)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaCharacters.id, characterId),
        eq(verticalDramaCharacters.tenantId, owner.tenantId),
        eq(verticalDramaCharacters.userId, owner.userId),
        eq(verticalDramaCharacters.seriesId, owner.seriesId)
      )
    )
    .returning({ id: verticalDramaCharacters.id });

  if (!updated) {
    throw new Error(
      "Unable to persist Character DNA: owned character was not found."
    );
  }
}
