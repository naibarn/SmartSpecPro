/**
 * Canonical lifecycle status for a Vertical Drama series.
 *
 * `draft` is reserved for a shell/brief that does not yet contain a usable
 * story. A generated story is represented by `story_ready`; production work
 * uses `active`. Keeping this distinction prevents the UI from calling a
 * completed story draft when it is already ready for the next workflow.
 */
export const VERTICAL_DRAMA_SERIES_STATUS_VALUES = [
  "draft",
  "planning",
  "story_ready",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export type VerticalDramaSeriesStatus =
  (typeof VERTICAL_DRAMA_SERIES_STATUS_VALUES)[number];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Returns true only when the Series bible contains a story, not merely a
 * premise or visual/profile metadata. The structure check deliberately
 * accepts both modern Story Architecture and legacy episode-breakdown data.
 */
export function hasVerticalDramaGeneratedStory(bible: unknown): boolean {
  const value = record(bible);
  if (!value || !text(value.mainPlot)) return false;

  const hasNarrativeStructure =
    text(value.logline) ||
    text(value.seasonArc) ||
    text(value.expandedSeasonArc) ||
    Boolean(record(value.storyContract)) ||
    Boolean(record(value.storyDesign)) ||
    (Array.isArray(value.episodeBreakdown) && value.episodeBreakdown.length > 0);

  return hasNarrativeStructure;
}

/**
 * Compatibility resolver for old rows that persisted a generated story as
 * `status = draft`/`planning` before the Series-first lifecycle was introduced.
 */
export function resolveVerticalDramaSeriesStatus(params: {
  status: unknown;
  bible: unknown;
}): string {
  if (
    (params.status === "draft" || params.status === "planning") &&
    hasVerticalDramaGeneratedStory(params.bible)
  ) {
    return "story_ready";
  }
  return typeof params.status === "string" && params.status.trim().length > 0
    ? params.status
    : "draft";
}
