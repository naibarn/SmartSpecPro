import type { VerticalDramaCharacterVisualBible } from "@shared/verticalDramaSeries/characterProfile";

export type VerticalDramaCastContrastCharacter = {
  characterId: number;
  characterKey: string;
  tier: string;
  visualBible: VerticalDramaCharacterVisualBible;
  hasApprovedAnchor: boolean;
};

export type CastContrastAxis = "palette" | "wardrobe" | "hair";

export type CastContrastComparison = {
  characterKeyA: string;
  characterKeyB: string;
  overlapAxes: CastContrastAxis[];
  score: number;
};

export type CastVisuallySimilarFinding = CastContrastComparison & {
  suggestedDifferentiation: string;
  requiresUserApproval: boolean;
};

const CAST_VISUAL_SIMILARITY_THRESHOLD = 0.55;

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );
}

function overlapRatio(a: string, b: string): number {
  const aTokens = tokens(a);
  const bTokens = tokens(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let hits = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) hits += 1;
  }
  return hits / Math.max(aTokens.size, bTokens.size);
}

function tierGroup(tier: string): string {
  if (tier.includes("lead")) return "lead";
  if (tier.includes("villain")) return "villain";
  return tier;
}

function isComparable(a: VerticalDramaCastContrastCharacter, b: VerticalDramaCastContrastCharacter): boolean {
  return a.tier === b.tier || tierGroup(a.tier) === tierGroup(b.tier);
}

export function compareVisualBiblesPairwise(
  a: VerticalDramaCastContrastCharacter,
  b: VerticalDramaCastContrastCharacter,
): CastContrastComparison | null {
  if (!isComparable(a, b)) return null;

  const palette = overlapRatio(
    `${a.visualBible.colorPalette} ${a.visualBible.signatureVisualCues.join(" ")}`,
    `${b.visualBible.colorPalette} ${b.visualBible.signatureVisualCues.join(" ")}`,
  );
  const wardrobe = overlapRatio(a.visualBible.signatureWardrobe, b.visualBible.signatureWardrobe);
  const hair = overlapRatio(a.visualBible.hairMakeupNotes, b.visualBible.hairMakeupNotes);
  const overlapAxes: CastContrastAxis[] = [];
  if (palette >= CAST_VISUAL_SIMILARITY_THRESHOLD) overlapAxes.push("palette");
  if (wardrobe >= CAST_VISUAL_SIMILARITY_THRESHOLD) overlapAxes.push("wardrobe");
  if (hair >= CAST_VISUAL_SIMILARITY_THRESHOLD) overlapAxes.push("hair");
  const score = (palette + wardrobe + hair) / 3;

  return {
    characterKeyA: a.characterKey,
    characterKeyB: b.characterKey,
    overlapAxes,
    score,
  };
}

export function findCastVisuallySimilarPairs(
  cast: VerticalDramaCastContrastCharacter[],
): CastVisuallySimilarFinding[] {
  const findings: CastVisuallySimilarFinding[] = [];
  for (let i = 0; i < cast.length; i += 1) {
    for (let j = i + 1; j < cast.length; j += 1) {
      const comparison = compareVisualBiblesPairwise(cast[i], cast[j]);
      if (!comparison || comparison.overlapAxes.length === 0) continue;
      const anyAnchor = cast[i].hasApprovedAnchor || cast[j].hasApprovedAnchor;
      const bothAnchored = cast[i].hasApprovedAnchor && cast[j].hasApprovedAnchor;
      const target = cast[i].hasApprovedAnchor ? cast[j] : cast[i];
      findings.push({
        ...comparison,
        requiresUserApproval: anyAnchor,
        suggestedDifferentiation: bothAnchored
          ? ""
          : `Differentiate ${target.characterKey} on ${comparison.overlapAxes.join(", ")} without contradicting approved anchors.`,
      });
    }
  }
  return findings;
}

