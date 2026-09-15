export interface VerticalDramaEpisodeStoryPlanShot {
  shotNumber: number;
  summary: string;
}

export interface VerticalDramaEpisodeStoryPlanView {
  summary: string | null;
  shots: VerticalDramaEpisodeStoryPlanShot[];
}

const MAX_SHOT_SUMMARY_LENGTH = 2_000;
const MAX_EPISODE_SUMMARY_LENGTH = 1_600;
const MAX_EPISODE_INPUT_SUMMARY_LENGTH = 12_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asPositiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function asText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * Normalize the durable shot-summary shapes used by normal and Special
 * Tie-in episodes into one display-only contract. Invalid rows are ignored so
 * old or partially-written JSON cannot render raw values in the workspace.
 */
export function normalizeVerticalDramaEpisodeStoryPlanShots(
  value: unknown
): VerticalDramaEpisodeStoryPlanShot[] {
  if (!Array.isArray(value)) return [];
  const byShot = new Map<number, VerticalDramaEpisodeStoryPlanShot>();
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const shotNumber = asPositiveInteger(row.shotNumber ?? row.shot_number);
    const summary = asText(
      row.summary ?? row.story_summary,
      MAX_SHOT_SUMMARY_LENGTH
    );
    if (shotNumber === undefined || !summary || byShot.has(shotNumber))
      continue;
    byShot.set(shotNumber, { shotNumber, summary });
  }
  return Array.from(byShot.values()).sort(
    (left, right) => left.shotNumber - right.shotNumber
  );
}

/**
 * Legacy-safe summary for successful outputs created before episodeSummary
 * existed. It intentionally uses every valid ordered shot, but stays bounded
 * for the always-visible compact section.
 */
export function buildVerticalDramaEpisodeStorySummary(
  shots: readonly VerticalDramaEpisodeStoryPlanShot[],
  shotLabel = "Shot"
): string | null {
  if (shots.length === 0) return null;
  const summary = shots
    .map(shot => `${shotLabel} ${shot.shotNumber}: ${shot.summary}`)
    .join(" ");
  return summary.slice(0, MAX_EPISODE_SUMMARY_LENGTH).trim();
}

export function normalizeVerticalDramaEpisodeStorySummary(
  value: unknown
): string | null {
  const summary = asText(value, MAX_EPISODE_SUMMARY_LENGTH);
  return summary || null;
}

/**
 * The selected idea is the authored episode summary for Special Tie-ins. It
 * is already validated and persisted as `SpecialTieInInput.idea`, so retain
 * the full bounded input instead of replacing it with an LLM re-summary of
 * the nine shots.
 */
export function normalizeVerticalDramaEpisodeStoryInputSummary(
  value: unknown
): string | null {
  const summary = asText(value, MAX_EPISODE_INPUT_SUMMARY_LENGTH);
  return summary || null;
}

/**
 * Resolve the display summary without allowing generated shot text to replace
 * the user's selected idea. The latter two sources exist only for legacy
 * Special Tie-in records that predate durable idea-based summaries.
 */
export function resolveVerticalDramaEpisodeStorySummary(input: {
  selectedIdea?: unknown;
  legacyEpisodeSummary?: unknown;
  shots: readonly VerticalDramaEpisodeStoryPlanShot[];
  shotLabel?: string;
}): string | null {
  return (
    normalizeVerticalDramaEpisodeStoryInputSummary(input.selectedIdea) ??
    normalizeVerticalDramaEpisodeStorySummary(input.legacyEpisodeSummary) ??
    buildVerticalDramaEpisodeStorySummary(input.shots, input.shotLabel)
  );
}
