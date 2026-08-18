/**
 * Vertical Drama Series — Create Series input field length limits.
 *
 * Single source of truth for the `createSeriesInput` zod schema
 * (server/routers/verticalDramaSeries.ts) so every producer of these fields
 * (AI preset synthesis, curated genre presets, the wizard UI) can clamp to
 * the exact same limits the server will enforce. Keeping the numbers in one
 * place means the zod schema and the clamp logic can never drift apart.
 */

export const CREATE_SERIES_FIELD_LIMITS = {
  title: 255,
  genre: 100,
  tone: 100,
  targetAudience: 100,
  agePolicyId: 64,
  // Feature 132 §4.2 (F132A) — free-form "โจทย์เรื่องที่อยากได้" premise input.
  // Keep enough room for a complete treatment such as title, genre, premise,
  // character arc, theme, selling points, and tagline. The value is persisted
  // in the jsonb `bible.userPremise`, so increasing this limit needs no schema
  // migration; client and server continue to share this single contract.
  userPremise: 12000,
} as const;

export type CreateSeriesFieldLimitKey = keyof typeof CREATE_SERIES_FIELD_LIMITS;

/**
 * Clamp a string to a field's create-series limit, trimming first and
 * cutting cleanly at the last whitespace boundary before the limit (falling
 * back to a hard cut if no boundary is found) so the result never ends
 * mid-word. Returns undefined for empty/whitespace-only input.
 */
export function clampToCreateSeriesLimit(
  value: string | undefined | null,
  field: CreateSeriesFieldLimitKey,
): string | undefined {
  const limit = CREATE_SERIES_FIELD_LIMITS[field];
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= limit) return trimmed;

  const hardCut = trimmed.slice(0, limit);
  const lastBoundary = Math.max(hardCut.lastIndexOf(" "), hardCut.lastIndexOf("\n"));
  // Only prefer the word-boundary cut if it doesn't throw away too much text.
  const clean = lastBoundary > limit * 0.6 ? hardCut.slice(0, lastBoundary) : hardCut;
  return clean.trim();
}
