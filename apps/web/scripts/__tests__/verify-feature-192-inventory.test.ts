import { describe, expect, it } from "vitest";

import {
  FEATURE_192_GOOGLE_PRODUCT_ALLOWLIST,
  buildFeature192Inventory,
} from "../verify-feature-192-inventory";

describe("Feature 192 inventory", () => {
  it("classifies the current drain and preserves the OAuth/Drive exception", () => {
    const result = buildFeature192Inventory();
    expect(result.feature).toBe(192);
    expect(result.classification.compatibilityDrain.length).toBeGreaterThan(0);
    expect(result.classification.productIntegrationAllowed).toEqual([...FEATURE_192_GOOGLE_PRODUCT_ALLOWLIST]);
    expect(result.googleRuntimeFailClosed).toBe(true);
    expect(result.evidenceSafe).toBe(true);
    expect(result.classification.operatorReview).toEqual([]);
  });
});
