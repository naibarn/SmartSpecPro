import { describe, expect, it } from "vitest";

import {
  MarketplaceAutoReviewStateWriteConflict,
  isMarketplaceAutoReviewStateWriteConflict,
} from "../marketplaceAutoReviewStagedConcurrency";

describe("Marketplace Auto Review staged write conflicts", () => {
  it("recognizes explicit optimistic-lock conflicts without matching malformed state errors", () => {
    expect(
      isMarketplaceAutoReviewStateWriteConflict(
        new MarketplaceAutoReviewStateWriteConflict()
      )
    ).toBe(true);
    expect(
      isMarketplaceAutoReviewStateWriteConflict(new Error("staged_state_drift"))
    ).toBe(false);
  });
});
