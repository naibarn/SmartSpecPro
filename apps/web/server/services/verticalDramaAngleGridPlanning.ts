import type {
  AngleGridCandidate,
  AngleGridCandidateScore,
  AngleStoryFunction,
} from "@shared/verticalDramaSeries/angleGrid";

export function checkAngleGridDiversity(candidates: AngleGridCandidate[]): string[] {
  const warnings: string[] = [];
  const byFunction = new Map<AngleStoryFunction, AngleGridCandidate[]>();
  for (const candidate of candidates) {
    const rows = byFunction.get(candidate.storyFunction) ?? [];
    rows.push(candidate);
    byFunction.set(candidate.storyFunction, rows);
  }

  for (const [storyFunction, rows] of byFunction) {
    if (rows.length > 2) {
      warnings.push(`storyFunction ${storyFunction} appears ${rows.length} times; target is no more than 2`);
    }
  }
  if (byFunction.size < 5) {
    warnings.push(`Only ${byFunction.size} distinct storyFunction values; target is at least 5`);
  }

  for (const rows of byFunction.values()) {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        if (
          normalized(rows[i].shotSize) === normalized(rows[j].shotSize) &&
          normalized(rows[i].cameraPosition) === normalized(rows[j].cameraPosition)
        ) {
          warnings.push(
            `Angle ${rows[i].index} and ${rows[j].index} repeat the same framing for ${rows[i].storyFunction}`,
          );
        }
      }
    }
  }

  return warnings;
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function scoreTotal(score: AngleGridCandidateScore): number {
  return (
    score.clarity +
    score.continuity +
    score.emotionalPrecision +
    score.characterIdentitySafety +
    score.motionPotential +
    score.productionReadiness
  );
}

export function deriveRecommendedAngleIndex(
  candidates: AngleGridCandidate[],
  scores: AngleGridCandidateScore[],
  seasonFunctionUsageCounts: Partial<Record<AngleStoryFunction, number>> = {},
): number {
  const candidateByIndex = new Map(candidates.map((candidate) => [candidate.index, candidate]));
  const withinGridCounts = candidates.reduce<Partial<Record<AngleStoryFunction, number>>>(
    (acc, candidate) => {
      acc[candidate.storyFunction] = (acc[candidate.storyFunction] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return [...scores].sort((a, b) => {
    const totalDelta = scoreTotal(b) - scoreTotal(a);
    if (totalDelta !== 0) return totalDelta;
    const candidateA = candidateByIndex.get(a.index);
    const candidateB = candidateByIndex.get(b.index);
    const countA = candidateA
      ? seasonFunctionUsageCounts[candidateA.storyFunction] ?? withinGridCounts[candidateA.storyFunction] ?? 0
      : 0;
    const countB = candidateB
      ? seasonFunctionUsageCounts[candidateB.storyFunction] ?? withinGridCounts[candidateB.storyFunction] ?? 0
      : 0;
    if (countA !== countB) return countA - countB;
    return a.index - b.index;
  })[0]?.index ?? 0;
}

