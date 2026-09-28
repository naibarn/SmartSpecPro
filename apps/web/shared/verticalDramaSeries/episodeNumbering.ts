/**
 * Numeric episode-number allocation shared by normal and special episodes.
 *
 * `episodeNumber` is intentionally kept numeric because continuation, memory,
 * media labels, and ordering all depend on numeric arithmetic. Special Tie-in
 * episodes use a separate numeric range instead of consuming normal numbers.
 */

export const SPECIAL_EPISODE_NUMBER_START = 501;

export type EpisodeNumberKind = "normal" | "special_tie_in";

export type EpisodeNumberRow = {
  episodeNumber: number;
  episodeKind?: string | null;
};

function normalizedEpisodeNumberRows(
  rows: readonly EpisodeNumberRow[]
): EpisodeNumberRow[] {
  return rows.filter(
    row => Number.isInteger(row.episodeNumber) && row.episodeNumber > 0
  );
}

function nextFreeNumber(
  candidate: number,
  occupied: ReadonlySet<number>
): number {
  let next = candidate;
  while (occupied.has(next)) next += 1;
  return next;
}

export function highestNormalEpisodeNumber(
  rows: readonly EpisodeNumberRow[]
): number {
  return normalizedEpisodeNumberRows(rows).reduce(
    (max, row) =>
      row.episodeKind == null || row.episodeKind === "normal"
        ? Math.max(max, row.episodeNumber)
        : max,
    0
  );
}

export function nextNormalEpisodeNumber(
  rows: readonly EpisodeNumberRow[]
): number {
  const normalized = normalizedEpisodeNumberRows(rows);
  const occupied = new Set(normalized.map(row => row.episodeNumber));
  return nextFreeNumber(highestNormalEpisodeNumber(normalized) + 1, occupied);
}

export function nextSpecialEpisodeNumber(
  rows: readonly EpisodeNumberRow[]
): number {
  const normalized = normalizedEpisodeNumberRows(rows);
  const occupied = new Set(normalized.map(row => row.episodeNumber));
  const highestSpecial = normalized.reduce(
    (max, row) =>
      row.episodeKind === "special_tie_in"
        ? Math.max(max, row.episodeNumber)
        : max,
    SPECIAL_EPISODE_NUMBER_START - 1
  );
  return nextFreeNumber(
    Math.max(SPECIAL_EPISODE_NUMBER_START, highestSpecial + 1),
    occupied
  );
}
