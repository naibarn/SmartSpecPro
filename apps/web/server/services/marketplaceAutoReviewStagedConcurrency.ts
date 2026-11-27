/** Optimistic-lock conflict while persisting a staged Auto Review run. */
export class MarketplaceAutoReviewStateWriteConflict extends Error {
  constructor() {
    super("MARKETPLACE_AUTO_REVIEW_STATE_WRITE_CONFLICT");
    this.name = "MarketplaceAutoReviewStateWriteConflict";
  }
}

export function isMarketplaceAutoReviewStateWriteConflict(
  error: unknown
): error is MarketplaceAutoReviewStateWriteConflict {
  return error instanceof MarketplaceAutoReviewStateWriteConflict;
}
