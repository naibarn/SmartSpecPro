export interface VerticalDramaEpisodeCompletionInput {
  episodeNumber: number;
  shotDrafts: unknown;
}

export interface VerticalDramaEpisodeCompletionViolation {
  episodeNumber: number;
  codes: Array<"missing_shots" | "invalid_shot_numbers" | "missing_dialogue">;
}

export interface VerticalDramaCompletionReport {
  completeEpisodeNumbers: number[];
  missingEpisodeNumbers: number[];
  violations: VerticalDramaEpisodeCompletionViolation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function inspectVerticalDramaEpisodeCompletion(input: {
  episodeNumber: number;
  shotDrafts: unknown;
  expectedShotCount?: number;
}): VerticalDramaEpisodeCompletionViolation | null {
  const expectedShotCount = input.expectedShotCount ?? 9;
  const shots = Array.isArray(input.shotDrafts) ? input.shotDrafts : [];
  const codes: VerticalDramaEpisodeCompletionViolation["codes"] = [];
  if (shots.length !== expectedShotCount) codes.push("missing_shots");

  const shotNumbers = shots
    .filter(isRecord)
    .map(shot => shot.shot_number)
    .filter((value): value is number => typeof value === "number");
  const expectedNumbers = Array.from({ length: expectedShotCount }, (_, index) => index + 1);
  if (
    shotNumbers.length !== expectedShotCount ||
    new Set(shotNumbers).size !== expectedShotCount ||
    expectedNumbers.some(number => !shotNumbers.includes(number))
  ) {
    codes.push("invalid_shot_numbers");
  }

  const hasDialogue = shots.some(shot => {
    if (!isRecord(shot) || !Array.isArray(shot.dialogue_lines)) return false;
    return shot.dialogue_lines.some(line => {
      if (!isRecord(line)) return false;
      return typeof line.line === "string" && line.line.trim().length > 0;
    });
  });
  if (!hasDialogue) codes.push("missing_dialogue");

  return codes.length > 0
    ? { episodeNumber: input.episodeNumber, codes }
    : null;
}

export function inspectVerticalDramaCompletionSet(input: {
  targetEpisodeNumbers: number[];
  items: ReadonlyArray<VerticalDramaEpisodeCompletionInput>;
  expectedShotCount?: number;
}): VerticalDramaCompletionReport {
  const itemByEpisode = new Map(input.items.map(item => [item.episodeNumber, item]));
  const violations: VerticalDramaEpisodeCompletionViolation[] = [];
  const completeEpisodeNumbers: number[] = [];
  const missingEpisodeNumbers: number[] = [];

  for (const episodeNumber of [...new Set(input.targetEpisodeNumbers)].sort((a, b) => a - b)) {
    const item = itemByEpisode.get(episodeNumber);
    if (!item) {
      missingEpisodeNumbers.push(episodeNumber);
      violations.push({ episodeNumber, codes: ["missing_shots", "missing_dialogue"] });
      continue;
    }
    const violation = inspectVerticalDramaEpisodeCompletion({
      episodeNumber,
      shotDrafts: item.shotDrafts,
      expectedShotCount: input.expectedShotCount,
    });
    if (violation) {
      missingEpisodeNumbers.push(episodeNumber);
      violations.push(violation);
    } else {
      completeEpisodeNumbers.push(episodeNumber);
    }
  }

  return { completeEpisodeNumbers, missingEpisodeNumbers, violations };
}
