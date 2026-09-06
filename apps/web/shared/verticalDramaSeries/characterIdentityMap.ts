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
  /** Provider-bound, deterministic identity lock for linked twins. */
  twinIdentityLock?: string | null;
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
  const twinIdentityLock = character.twinIdentityLock?.trim();

  const label = [name, role ? `(${role})` : null].filter(Boolean).join(" ");
  const parts = [
    label || character.characterKey,
    description ? `: ${description}` : null,
    twinIdentityLock ? ` [${twinIdentityLock}]` : null,
  ]
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

/**
 * One shot-local character identity reference. `imageIndex` is positional in
 * the actual attachment list for this shot; it is never a character-global
 * id. Multiple entries with the same `characterKey` are merged into one lock
 * entry so a primary portrait plus a supplementary sheet does not duplicate
 * the full facial-feature checklist.
 */
export interface VerticalDramaCharacterIdentityReference {
  imageIndex: number;
  characterName: string;
  characterKey?: string | null;
}

const CHARACTER_IDENTITY_LOCK_BLOCK_START =
  "BEGIN CHARACTER IDENTITY LOCKS (SYSTEM-GENERATED)";
const CHARACTER_IDENTITY_LOCK_BLOCK_END = "END CHARACTER IDENTITY LOCKS";

/** Build one combined identity-lock block for every unique attached character. */
export function buildCharacterIdentityLockBlock(
  references: readonly VerticalDramaCharacterIdentityReference[],
): string | undefined {
  const groups = new Map<
    string,
    { name: string; imageIndexes: number[] }
  >();

  for (const reference of references) {
    const name = reference.characterName?.trim();
    if (!name || !Number.isInteger(reference.imageIndex) || reference.imageIndex <= 0) {
      continue;
    }
    const identityKey = reference.characterKey?.trim() || name.toLowerCase();
    const existing = groups.get(identityKey);
    if (existing) {
      if (!existing.imageIndexes.includes(reference.imageIndex)) {
        existing.imageIndexes.push(reference.imageIndex);
      }
      continue;
    }
    groups.set(identityKey, { name, imageIndexes: [reference.imageIndex] });
  }

  if (groups.size === 0) return undefined;

  const mappingLines = Array.from(groups.values()).map(({ name, imageIndexes }) => {
    const referenceLabel =
      imageIndexes.length === 1
        ? `Reference Image ${imageIndexes[0]}`
        : `Reference Images ${imageIndexes.join(", ")}`;
    return `- ${name} — ${referenceLabel}`;
  });

  return [
    CHARACTER_IDENTITY_LOCK_BLOCK_START,
    "CHARACTER IDENTITY LOCK — ALL ATTACHED CHARACTERS (HIGHEST PRIORITY)",
    "For every character listed below, preserve the exact facial identity and recognizable likeness from that character's own reference image.",
    "Reference mapping:",
    ...mappingLines,
    "Preserve for every character:",
    "- facial proportions",
    "- face shape",
    "- forehead shape",
    "- eyebrow shape and spacing",
    "- eye shape, eye spacing and eyelids",
    "- nose bridge, nose width and nostril shape",
    "- cheekbone structure",
    "- jawline and chin",
    "- mouth width",
    "- upper and lower lip shape",
    "- skin tone",
    "- hairline and hairstyle",
    "- apparent age",
    "AGE / MATURITY LOCK (NON-NEGOTIABLE): the apparent age and age impression shown in each character's own reference image are authoritative. Match that same apparent age exactly; do not age the character up or down.",
    "Do not make any character look older, more mature, more lined, more gaunt, or more senior than their own reference image. Do not infer or change age from role, relationship, wardrobe, lighting, makeup, emotional intensity, camera angle, story context, or any textual age label; this reference-image rule overrides those descriptions.",
    "Do not add wrinkles, crow's feet, sagging skin, age spots, gray hair, hollow cheeks, deep nasolabial folds, or aged facial texture unless those features are visible in that character's own reference image.",
    "Each character must match only their own reference image. Do not change, merge, swap, replace, or reinterpret any character's identity.",
    CHARACTER_IDENTITY_LOCK_BLOCK_END,
  ].join("\n");
}

/**
 * Replace the system-generated identity block with the canonical combined
 * block. This is intentionally idempotent and leaves prompts unchanged when
 * no attached character reference is available.
 */
export function ensureCharacterIdentityLockPrompt(
  prompt: string,
  references: readonly VerticalDramaCharacterIdentityReference[],
): { prompt: string; identityLockBlock?: string } {
  const identityLockBlock = buildCharacterIdentityLockBlock(references);
  if (!identityLockBlock) {
    return { prompt };
  }
  const basePrompt = stripExistingIdentityLockSuffix(prompt).trimEnd();
  const mappingBoundaryMarkers = [
    "PHYSICAL CAST LOCK",
    "CURRENT SHOT COMPOSITION LOCK",
    "SCENE CONTINUITY LOCK",
    "VIDEO-FACE VISIBILITY LOCK",
    "NEGATIVE PROMPT:",
  ];
  const mappingStart = basePrompt.indexOf("REFERENCE MAPPING:");
  const mappingBoundary =
    mappingStart === 0
      ? mappingBoundaryMarkers
          .map(marker => basePrompt.indexOf(marker, "REFERENCE MAPPING:".length))
          .filter(index => index > "REFERENCE MAPPING:".length)
          .sort((a, b) => a - b)[0]
      : undefined;
  if (mappingBoundary !== undefined) {
    const mapping = basePrompt.slice(0, mappingBoundary).trimEnd();
    const remainder = basePrompt.slice(mappingBoundary).trimStart();
    return {
      prompt: `${mapping}\n\n${identityLockBlock}\n\n${remainder}`,
      identityLockBlock,
    };
  }
  return {
    prompt: `${identityLockBlock}${basePrompt ? `\n\n${basePrompt}` : ""}`,
    identityLockBlock,
  };
}

const IDENTITY_LOCK_BRACKET_MARKER = "[Attached character reference images:";
const IDENTITY_LOCK_GENERIC_MARKER =
  "Use the attached reference image as this character's exact identity —";

/* -------------------------------------------------------------------------- */
/* Reference mapping validator (2026-07-16 start-frame contradiction fix,     */
/* `planning/vd-start-frame-reference-mapping/plan.md` Phase 2)               */
/* -------------------------------------------------------------------------- */

/**
 * A single "Image N ↔ character name" explicit claim, as actually written in
 * an authored prompt, alongside what the real attachment manifest says that
 * claim SHOULD be.
 */
export interface CharacterImageIndexMappingMismatch {
  /** The known reference character name the prompt bound to the wrong index. */
  characterName: string;
  /** The image index the prompt's own text explicitly claimed for that name. */
  claimedImageIndex: number;
  /** The image index the attachment manifest actually assigns to that name. */
  expectedImageIndex: number;
}

/** One reference the prompt is allowed to talk about — its real attachment index + name. */
export interface CharacterImageIndexMappingReference {
  imageIndex: number;
  characterName: string;
}

/**
 * Longest-match-first, non-overlapping scan for every occurrence of any
 * `knownNames` entry inside `text`. Thai script has no reliable regex word
 * boundary (`\b` only fires at an ASCII-word/non-word edge, so it is useless
 * — and actively misleading — against Thai text), so this does NOT use `\b`
 * anywhere; instead it guarantees substring safety by claiming the longer
 * name's character range first and refusing to let a shorter name (that
 * happens to be a substring of it, e.g. "Rin" inside "Katarin") re-match the
 * same span. `knownNames` must already be sorted longest-first by the caller.
 */
function findKnownNameOccurrences(
  text: string,
  knownNamesLongestFirst: readonly string[],
): Array<{ name: string; start: number; end: number }> {
  const lowerText = text.toLowerCase();
  const claimedRanges: Array<[number, number]> = [];
  const occurrences: Array<{ name: string; start: number; end: number }> = [];

  for (const name of knownNamesLongestFirst) {
    const lowerName = name.toLowerCase();
    if (!lowerName) continue;
    let searchFrom = 0;
    for (;;) {
      const idx = lowerText.indexOf(lowerName, searchFrom);
      if (idx === -1) break;
      const end = idx + lowerName.length;
      const overlapsLongerMatch = claimedRanges.some(
        ([start, claimedEnd]) => idx < claimedEnd && end > start,
      );
      if (!overlapsLongerMatch) {
        claimedRanges.push([idx, end]);
        occurrences.push({ name, start: idx, end });
      }
      searchFrom = idx + 1;
    }
  }

  return occurrences.sort((a, b) => a.start - b.start);
}

/**
 * Conservative extraction of every EXPLICIT "this image index is this
 * character" claim in a prompt's own text. Deliberately narrow — three
 * patterns only, chosen to match how both the skill's own authored prose and
 * the (now-removed) code-authored bracket block phrase this claim:
 *
 * 1. `Image N = <name>` — the canonical single REFERENCE MAPPING declaration
 *    style (skill.md rule) and the legacy code-authored bracket phrasing
 *    (`"Image 1 = ไอริณ; Image 2 = ภาคิน"`). `Image N = location: ...` is
 *    explicitly ignored — locations are a separate concern from character
 *    identity and must never be treated as a character-name claim.
 * 2. `<name> (Image N` / `<name> (attached Image N` — including trailing
 *    position descriptors inside the same parenthetical, e.g. the exact
 *    observed bug text `"ภาคิน (Image 1, leftmost...)"`.
 * 3. `(Image N, ... <name>` — the index-first mirror of pattern 2, e.g.
 *    `"(Image 1, leftmost, ไอริณ)"`; the name must appear within the same
 *    parenthetical aside (or the first ~60 characters after the comma if the
 *    aside never closes).
 *
 * A name that never appears anywhere in `knownNames` (e.g. a location name)
 * never produces a claim — this function only ever reasons about characters
 * the caller already told it are real, known references.
 */
function extractExplicitMappingClaims(
  prompt: string,
  knownNamesLongestFirst: readonly string[],
): Array<{ characterName: string; claimedImageIndex: number }> {
  if (knownNamesLongestFirst.length === 0) return [];

  const nameOccurrences = findKnownNameOccurrences(prompt, knownNamesLongestFirst);
  const claims: Array<{ characterName: string; claimedImageIndex: number }> = [];

  // Pattern 2: "<name> (Image N" / "<name> (attached Image N ...".
  const afterNameImageRe = /^\s*\(\s*(?:attached\s+)?Image\s*(\d+)/i;
  for (const occurrence of nameOccurrences) {
    const tail = prompt.slice(occurrence.end, occurrence.end + 40);
    const match = afterNameImageRe.exec(tail);
    if (match) {
      claims.push({ characterName: occurrence.name, claimedImageIndex: Number(match[1]) });
    }
  }

  // Pattern 1: "Image N = <name>" (locations explicitly excluded).
  const indexEqualsRe = /Image\s*(\d+)\s*=\s*/gi;
  for (const match of prompt.matchAll(indexEqualsRe)) {
    const tailStart = match.index! + match[0].length;
    const tail = prompt.slice(tailStart, tailStart + 40);
    if (/^\s*location\s*:/i.test(tail)) continue;
    // Only accept a name occurrence that starts essentially right at the
    // "=" — a few characters of slack absorbs a stray leading quote/space,
    // without risking picking up an unrelated later mention of a name.
    const occurrence = nameOccurrences.find(
      (o) => o.start >= tailStart && o.start <= tailStart + 3,
    );
    if (occurrence) {
      claims.push({ characterName: occurrence.name, claimedImageIndex: Number(match[1]) });
    }
  }

  // Pattern 3: "(Image N, ... <name>" — index-first, name shortly after.
  const imageThenCommaRe = /\(\s*(?:attached\s+)?Image\s*(\d+)\s*,/gi;
  for (const match of prompt.matchAll(imageThenCommaRe)) {
    const spanStart = match.index! + match[0].length;
    const closeParenIdx = prompt.indexOf(")", spanStart);
    const spanEnd =
      closeParenIdx === -1
        ? Math.min(prompt.length, spanStart + 60)
        : Math.min(closeParenIdx, spanStart + 60);
    const occurrence = nameOccurrences.find(
      (o) => o.start >= spanStart && o.start < spanEnd,
    );
    if (occurrence) {
      claims.push({ characterName: occurrence.name, claimedImageIndex: Number(match[1]) });
    }
  }

  return claims;
}

/**
 * Find every EXPLICIT character↔image-index claim in `prompt` that
 * contradicts `references` (the real attachment manifest — the order
 * reference images actually get attached to the paid render call in). This
 * is the shared validator behind the 2026-07-16 fix for a reported live bug
 * (series 16, episode 66, shot 9): the skill's own prose said
 * `"ภาคิน (Image 1)"` / `"ไอริณ (Image 2)"` while a code-appended tail block
 * said `"Image 1 = ไอริณ; Image 2 = ภาคิน"` — a direct, silent self-
 * contradiction that can swap faces/wardrobe between characters in the
 * rendered image.
 *
 * Deliberately LENIENT by design (see `extractExplicitMappingClaims`'s doc
 * comment for the exact patterns matched): a character that is never given
 * an explicit "Image N" claim anywhere is NOT a mismatch — only an EXPLICIT
 * claim that contradicts the manifest counts. This keeps the validator safe
 * to run as a fail-closed gate in front of a PAID render: it only ever
 * blocks a prompt that is provably, textually self-contradictory, never one
 * that is merely silent about the mapping.
 *
 * Pure — no I/O, importable from client and server (same convention as every
 * other export in this module).
 */
export function findCharacterImageIndexMappingMismatches(
  prompt: string,
  references: readonly CharacterImageIndexMappingReference[],
): CharacterImageIndexMappingMismatch[] {
  if (!prompt || references.length === 0) return [];

  const expectedIndexByNormalizedName = new Map<string, number>();
  const knownNames: string[] = [];
  for (const reference of references) {
    const name = reference.characterName?.trim();
    if (!name) continue;
    const normalized = name.toLowerCase();
    // First occurrence wins — mirrors `resolveShotCharacterReferenceEntries`'s
    // own "portraits before sheets, first entry per character" ordering
    // guarantee, so a character with more than one reference entry is still
    // validated against its PRIMARY (portrait) index.
    if (!expectedIndexByNormalizedName.has(normalized)) {
      expectedIndexByNormalizedName.set(normalized, reference.imageIndex);
      knownNames.push(name);
    }
  }
  if (knownNames.length === 0) return [];
  const knownNamesLongestFirst = knownNames.sort((a, b) => b.length - a.length);

  const claims = extractExplicitMappingClaims(prompt, knownNamesLongestFirst);

  const mismatches: CharacterImageIndexMappingMismatch[] = [];
  const seen = new Set<string>();
  for (const claim of claims) {
    const normalized = claim.characterName.toLowerCase();
    const expectedImageIndex = expectedIndexByNormalizedName.get(normalized);
    if (expectedImageIndex === undefined) continue; // not a known reference — ignore
    if (expectedImageIndex === claim.claimedImageIndex) continue; // consistent claim
    const dedupeKey = `${normalized}:${claim.claimedImageIndex}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    mismatches.push({
      characterName: claim.characterName,
      claimedImageIndex: claim.claimedImageIndex,
      expectedImageIndex,
    });
  }
  return mismatches;
}

/**
 * Strips a previously-appended identity-lock suffix (the bracketed
 * multi-character mapping block, or the generic single-character fallback
 * sentence) from the end of a prompt.
 *
 * Historically this made `formatIdentityLockedImagePrompt` (removed
 * 2026-07-11, vertical-drama-skill-first-architecture plan Phase 3, item 2 —
 * both the canonical copy here and the router's drifted duplicate) idempotent
 * — that function is gone now (the `vertical-drama-shot-start-frame-render`
 * skill authors the identity-lock text itself, in its own prose, at planning
 * time), but this stripper is KEPT as a standalone back-compat safety net:
 * episodes whose `startFramePlan.frames[].imagePrompt` was persisted BEFORE
 * this migration may still carry an old bracket-style suffix on disk, and
 * every render-time call site that reads a stored prompt
 * (`generateStartFrameImage`, `generateStartFrameAngleVariations`,
 * `repairShotImage`) still strips it defensively so a stale suffix is never
 * echoed back as if it were story content. Observed live (2026-07-10, series
 * 6 episode 2 shot 2): the SAME shot's start-frame prompt accumulated FOUR
 * stacked copies of this block across repeated image-render/retry clicks
 * (each one persisted back to storage as the new base for the next),
 * ballooning the prompt toward its length cap and degrading face fidelity.
 * Strips from the FIRST marker occurrence onward, so it removes any number of
 * stacked copies in one pass.
 */
export function stripExistingIdentityLockSuffix(prompt: string): string {
  const generatedIdx = prompt.indexOf(CHARACTER_IDENTITY_LOCK_BLOCK_START);
  let promptWithoutGeneratedBlock = prompt;
  if (generatedIdx !== -1) {
    const generatedEndIdx = prompt.indexOf(
      CHARACTER_IDENTITY_LOCK_BLOCK_END,
      generatedIdx
    );
    if (generatedEndIdx === -1) {
      promptWithoutGeneratedBlock = prompt.slice(0, generatedIdx).trimEnd();
    } else {
      const before = prompt.slice(0, generatedIdx).trimEnd();
      const after = prompt
        .slice(generatedEndIdx + CHARACTER_IDENTITY_LOCK_BLOCK_END.length)
        .trimStart();
      promptWithoutGeneratedBlock = [before, after]
        .filter(Boolean)
        .join("\n\n");
    }
  }
  const bracketIdx = promptWithoutGeneratedBlock.indexOf(
    IDENTITY_LOCK_BRACKET_MARKER
  );
  const genericIdx = promptWithoutGeneratedBlock.indexOf(
    IDENTITY_LOCK_GENERIC_MARKER
  );
  const candidates = [bracketIdx, genericIdx].filter((i) => i !== -1);
  if (candidates.length === 0) return promptWithoutGeneratedBlock;
  return promptWithoutGeneratedBlock.slice(0, Math.min(...candidates)).trimEnd();
}
