import { describe, expect, it } from "vitest";
import {
  isWhiteLabelEligibleTopUp,
  WHITE_LABEL_MIN_TOPUP_USD,
} from "./pricingPackageEligibility";

describe("isWhiteLabelEligibleTopUp", () => {
  it("includes one-time packages at the minimum price", () => {
    expect(
      isWhiteLabelEligibleTopUp({
        packageType: "one_time",
        priceUsd: WHITE_LABEL_MIN_TOPUP_USD,
      }),
    ).toBe(true);
  });

  it("excludes one-time packages below the minimum price", () => {
    expect(
      isWhiteLabelEligibleTopUp({
        packageType: "one_time",
        priceUsd: WHITE_LABEL_MIN_TOPUP_USD - 0.01,
      }),
    ).toBe(false);
  });

  it("excludes recurring packages even when they meet the price threshold", () => {
    expect(
      isWhiteLabelEligibleTopUp({
        packageType: "subscription",
        priceUsd: WHITE_LABEL_MIN_TOPUP_USD,
      }),
    ).toBe(false);
  });

  it("fails closed for non-finite prices", () => {
    expect(
      isWhiteLabelEligibleTopUp({ packageType: "one_time", priceUsd: Number.NaN }),
    ).toBe(false);
  });
});
