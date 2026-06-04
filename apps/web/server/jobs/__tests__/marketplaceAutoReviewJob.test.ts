import { describe, expect, it } from "vitest";

import { isMarketplaceAutoReviewAdvanceOutboxJobType } from "../marketplaceAutoReviewJob";

describe("marketplaceAutoReviewJob", () => {
  it("only claims auto-review advance outbox jobs", () => {
    expect(isMarketplaceAutoReviewAdvanceOutboxJobType("advance_run")).toBe(true);
    expect(
      isMarketplaceAutoReviewAdvanceOutboxJobType(
        "provider_reconciliation_recovery"
      )
    ).toBe(true);
    expect(isMarketplaceAutoReviewAdvanceOutboxJobType("hyperframes_render")).toBe(
      false
    );
    expect(isMarketplaceAutoReviewAdvanceOutboxJobType("hyperframes_finalize")).toBe(
      false
    );
  });
});
