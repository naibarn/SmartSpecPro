/**
 * Restrict a staged advance worker to the shots explicitly dispatched by the
 * user. Undefined preserves the existing full-run reconciliation behavior.
 */
export function selectMarketplaceAutoReviewTargetShots<
  T extends { shotId: number }
>(shots: T[], targetShotIds?: number[]): T[] {
  if (targetShotIds === undefined) return shots;

  const selected = new Set(targetShotIds);
  if (
    selected.size === 0 ||
    selected.size !== targetShotIds.length ||
    targetShotIds.some(shotId => !Number.isInteger(shotId) || shotId < 1)
  ) {
    throw new Error("staged_target_shot_ids_invalid");
  }

  const scopedShots = shots.filter(shot => selected.has(shot.shotId));
  if (scopedShots.length !== selected.size) {
    throw new Error("staged_target_shot_not_found");
  }
  return scopedShots;
}
