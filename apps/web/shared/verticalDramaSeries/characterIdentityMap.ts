/**
 * Vertical Drama Series — compact character identity descriptor map
 * (2026-07-07 non-human-character-vanishing fix).
 *
 * Bug this fixes: shot-level image/video prompts only ever passed the LLM a
 * bare `characterKey` (e.g. `"character-8"`) for each shot's required
 * characters — never the character's name, role, or stored description. For
 * an ordinary human character this is usually harmless (the LLM infers "a
 * person"), but for a NON-human required character (e.g. เจ้าเกลือ, a white
 * cat who is the shop's mascot — confirmed via
 * `vertical_drama_characters.data.description`) the LLM has no signal at all
 * that `character-8` is a cat, not a person, and silently renders it as a
 * generic human figure ("a figure... face mostly obscured by shadows") —
 * the required character effectively vanishes from the generated image.
 *
 * Fix: build a compact `key = name, role — one-line descriptor` map from the
 * series' stored character rows and inject it wherever a planning/prompt LLM
 * call is given a shot's required character KEYS, so every prompt-writing
 * call site knows each character's real identity (including species/age)
 * before it ever fills in an appearance guess. Used by:
 *  - `verticalDramaStartFrameGeneration.ts`'s `buildUserPrompt`
 *    (`start_frame_render_plan` generation)
 *  - the one-click silent-repair instruction
 *    (`verticalDramaEpisodePipeline.ts`'s repair-prompt builder)
 *  - `generateStartFrameAngleVariations`'s grid prompt
 *    (`verticalDramaCharacterImageGeneration.ts` / the router)
 *  - `verticalDramaVideoMotionPromptGeneration.ts`'s shot-video-prompt
 *    service context
 *
 * Pure module — no server/db imports, importable from both client and
 * server (same convention as `characterLock.ts`/`targetAudienceRegion.ts`).
 */

/** Minimal character row shape this module needs — a subset of
 *  `vertical_drama_characters` (`characterKey`/`name`/`role` columns +
 *  `data.description`). */
export interface VerticalDramaCharacterDescriptorSource {
  characterKey: string;
  name?: string | null;
  role?: string | null;
  description?: string | null;
}

/** Compact "key = descriptor" line for one character — e.g.
 *  `character-8 = เจ้าเกลือ (มาสคอตของร้าน): แมวขาวปุยตาสีทะเลที่ชอบนอนทับขวดสำคัญ`.
 *  Keeps a single character's descriptor to one line so the caller's overall
 *  prompt-length budget (e.g. the 3500-char cap) isn't blown by the map
 *  alone — callers should truncate `description` upstream if it is
 *  unusually long, this function does not enforce a cap itself. */
export function buildCharacterDescriptorLine(
  character: VerticalDramaCharacterDescriptorSource,
): string {
  const name = character.name?.trim();
  const role = character.role?.trim();
  const description = character.description?.trim();

  const label = [name, role ? `(${role})` : null].filter(Boolean).join(" ");
  const parts = [label || character.characterKey, description ? `: ${description}` : null]
    .filter(Boolean)
    .join("");

  return `${character.characterKey} = ${parts}`;
}

/**
 * Build the full compact character-identity map block for a set of required
 * character keys, in the given order (deduplicated), skipping any key with
 * no matching character row (nothing to add for those — callers still get a
 * bare key, same as before this fix, for characters the series bible
 * doesn't have a row for yet).
 *
 * Returns `undefined` when there are no required keys or none resolve to a
 * known character — callers should omit the instruction block entirely in
 * that case rather than injecting an empty/useless header.
 */
export function buildCharacterIdentityMapBlock(
  requiredCharacterKeys: readonly string[],
  characters: readonly VerticalDramaCharacterDescriptorSource[],
): string | undefined {
  if (requiredCharacterKeys.length === 0 || characters.length === 0) return undefined;

  const byKey = new Map(characters.map((c) => [c.characterKey, c]));
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const key of requiredCharacterKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const character = byKey.get(key);
    if (!character) continue;
    lines.push(buildCharacterDescriptorLine(character));
  }

  if (lines.length === 0) return undefined;

  return [
    "CHARACTER IDENTITY MAP (MANDATORY — read before writing any character description):",
    ...lines,
    "Every required character listed above MUST be depicted true to this identity — " +
      "including species and approximate age. NEVER render a non-human character " +
      "(animal, mascot, spirit, etc.) as a generic human figure, and never omit a " +
      "required character from the image just because their identity is unusual.",
  ].join("\n");
}

/**
 * Light, non-blocking QC check (2026-07-07 fix): after a start-frame plan is
 * generated, warn (never fail the stage) when a frame's own `imagePrompt`
 * doesn't mention a required character's name/descriptor at all — the
 * closest cheap signal that the LLM silently dropped/genericized that
 * character (the exact failure mode from the เจ้าเกลือ repro). This is a
 * best-effort substring check, not a semantic one: it only flags a frame
 * when NEITHER the character's name NOR any word from their description
 * appears anywhere in the prompt, so it stays deliberately conservative
 * (never blocks generation, only surfaces a heads-up to the user).
 */
export function findMissingCharacterIdentityWarnings(
  frames: readonly { shotNumber: number; imagePrompt: string; requiredCharacterRefs: string[] }[],
  characters: readonly VerticalDramaCharacterDescriptorSource[],
): Array<{ shotNumber: number; characterKey: string; characterName?: string }> {
  const byKey = new Map(characters.map((c) => [c.characterKey, c]));
  const warnings: Array<{ shotNumber: number; characterKey: string; characterName?: string }> = [];

  for (const frame of frames) {
    const normalizedPrompt = frame.imagePrompt.toLowerCase();
    for (const key of frame.requiredCharacterRefs) {
      const character = byKey.get(key);
      if (!character) continue; // no stored identity to check against
      const name = character.name?.trim();
      const nameMentioned = Boolean(name) && normalizedPrompt.includes(name!.toLowerCase());
      // A handful of "meaningful" words from the description (skip short/
      // common connector words) — if ANY of them appears, treat the
      // character as acknowledged rather than silently genericized.
      const descriptorWords = (character.description ?? "")
        .toLowerCase()
        .split(/[\s,.;:()]+/)
        .filter((w) => w.length >= 3);
      const descriptorMentioned = descriptorWords.some((w) => normalizedPrompt.includes(w));
      if (!nameMentioned && !descriptorMentioned) {
        warnings.push({ shotNumber: frame.shotNumber, characterKey: key, characterName: name });
      }
    }
  }

  return warnings;
}
