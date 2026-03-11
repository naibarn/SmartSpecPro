/**
 * Content Staleness Checker — Spec 038 Section 09
 *
 * Pure logic for calculating staleness. DB operations in contentArtifactStore.
 */

export interface ArtifactStalenessInput {
  lastVerifiedAt: Date | null;
  refreshCadenceDays: number | null;
  status: "active" | "stale" | "archived";
}

/**
 * Calculate the next refresh date from lastVerifiedAt + cadence days.
 */
export function calculateNextRefreshAt(
  lastVerifiedAt: Date,
  refreshCadenceDays: number
): Date {
  const next = new Date(lastVerifiedAt);
  next.setDate(next.getDate() + refreshCadenceDays);
  return next;
}

/**
 * Check if a single artifact is stale (past its refresh date).
 */
export function isStale(
  artifact: ArtifactStalenessInput,
  now: Date = new Date()
): boolean {
  if (artifact.status !== "active") return false;
  if (!artifact.lastVerifiedAt || !artifact.refreshCadenceDays) return false;
  const nextRefresh = calculateNextRefreshAt(
    artifact.lastVerifiedAt,
    artifact.refreshCadenceDays
  );
  return now >= nextRefresh;
}

/**
 * Filter a list of artifacts to find stale ones.
 */
export function findStaleArtifacts<T extends ArtifactStalenessInput>(
  artifacts: T[],
  now: Date = new Date()
): T[] {
  return artifacts.filter((a) => isStale(a, now));
}
