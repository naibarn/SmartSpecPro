/**
 * Tolerant reader for a series' story bible `refinedCharacters` list —
 * extracted out of `verticalDramaStoryBible.ts` (2026-07-17,
 * `planning/vd-character-visual-bible-occupation-fix/plan.md`) into its OWN
 * file with a minimal dependency graph (only `zod` +
 * `@shared/verticalDramaSeries/narrativeRole`) so it can be a SAFE static
 * top-level import from `server/routers/verticalDramaCharacters.ts`.
 *
 * `verticalDramaStoryBible.ts` itself is NOT safe to statically import from
 * that router file — its module graph transitively pulls in `llmRouter.ts` /
 * `intelligentModelSelector.ts` / `enabledLlmModels.ts` (which reaches all
 * the way into `server/routers/llmProviders.ts`'s `adminProcedure`), none of
 * which `verticalDramaCharacters.ts`'s own minimal-mock test suites mock
 * (confirmed by a real vitest run: statically — or even lazily but
 * unconditionally, at call-time, inside an exercised procedure —
 * importing `verticalDramaStoryBible.ts` from that router broke
 * `verticalDramaCharacters.customInstruction.test.ts` with `No "adminProcedure"
 * export is defined on the "../../_core/trpc" mock`). `verticalDramaStoryBible.ts`
 * re-exports everything from here unchanged, so every existing caller
 * (`verticalDramaSeries.ts`, `verticalDramaLedgerPlanner.ts`,
 * `verticalDramaQualityLedgerReconcile.ts`, etc.) keeps importing from
 * `verticalDramaStoryBible.ts` exactly as before.
 */

import { z } from "zod";
import {
  lenientNarrativeRoleSchema,
  lenientRoleTierSchema,
  type NarrativeRole,
  type RoleTier,
} from "@shared/verticalDramaSeries/narrativeRole";

const bibleRefinedCharacterSchema = z
  .object({
    name: z.string().min(1),
    role: z.string().optional(),
    description: z.string().optional(),
    // Lenient (2026-07-14 fix): this is a documented "tolerant read of a
    // stored bible" — a persisted `narrativeRole`/`roleTier` value that
    // predates the enum values changing (or was written by a model that
    // guessed wrong) must degrade to `undefined`, never fail the whole
    // array via `bibleRefinedCharacterArraySchema`'s `safeParse` below.
    narrativeRole: lenientNarrativeRoleSchema,
    roleTier: lenientRoleTierSchema,
    occupation: z.string().optional(),
    /**
     * `planning/vd-character-identity-repair/plan.md` Phase 2.1 (added
     * 2026-07-17) — every OTHER string this character is called by in the
     * story (given name alone, nickname, romanization) — see
     * `expandedStoryBibleSchema.refinedCharacters`'s own doc comment (in
     * `verticalDramaStoryBible.ts`) for why this exists (root-cause-chain
     * item 1: "legitimate short-form usage"). OPTIONAL, same "absent for
     * every bible that predates this field" convention as every sibling
     * role field above — a persisted bible with NO `aliases` key at all
     * (every bible generated before this date, including series 18's live
     * production data) still parses cleanly via
     * `bibleRefinedCharacterArraySchema`'s `safeParse` below; it simply
     * reads back as `undefined`, never `[]` (callers already treat `?? []`
     * as the "no aliases" case throughout this file).
     */
    aliases: z.array(z.string().min(1)).optional(),
  })
  .passthrough();
const bibleRefinedCharacterArraySchema = z.array(bibleRefinedCharacterSchema);

export type VdBibleRefinedCharacter = {
  name: string;
  role?: string;
  description?: string;
  narrativeRole?: NarrativeRole;
  roleTier?: RoleTier;
  occupation?: string;
  /** See `bibleRefinedCharacterSchema.aliases`'s own doc comment. */
  aliases?: string[];
};

/**
 * Read the complete canonical character profiles persisted in the story
 * bible. This is intentionally tolerant for legacy bibles: malformed or
 * missing optional role fields are preserved as absent so callers can mark
 * the durable roster for review rather than inventing a role. A legacy bible
 * with no `aliases` field at all (every bible predating Phase 2.1) still
 * parses — `aliases` simply reads back `undefined` on every entry.
 */
export function readBibleRefinedCharacterProfiles(
  bible: Record<string, unknown> | null | undefined,
): VdBibleRefinedCharacter[] {
  const raw = (bible as { refinedCharacters?: unknown } | null | undefined)
    ?.refinedCharacters;
  if (raw === undefined) return [];
  const parsed = bibleRefinedCharacterArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
