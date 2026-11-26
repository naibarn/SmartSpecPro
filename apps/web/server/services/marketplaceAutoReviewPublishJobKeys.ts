export type MarketplaceAutoReviewPublishFormat = "photo" | "reels";
export type MarketplaceAutoReviewPublishJobPurpose = "publish" | "resume";

/**
 * Build bounded control-plane keys from the intent hash. The hash already
 * binds tenant, run, target Page and publication content.
 */
export function buildMarketplaceAutoReviewPublishJobKeys(input: {
  format: MarketplaceAutoReviewPublishFormat;
  intentHash: string;
  attempt: number;
  purpose: MarketplaceAutoReviewPublishJobPurpose;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.intentHash) || !Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new Error("MARKETPLACE_PUBLISH_JOB_KEY_INPUT_INVALID");
  }

  const prefix = `marketplace-${input.format}`;
  return {
    idempotencyKey: `${prefix}:${input.intentHash}:${input.purpose}:${input.attempt}`,
    activeDedupeKey: `${prefix}:${input.intentHash}`,
  };
}
