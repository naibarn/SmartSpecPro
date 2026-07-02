import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

const MARKETPLACE_INTELLIGENCE_FLAGS: (keyof TenantFeatureFlags)[] = [
  "marketplaceConnectorLabEnabled",
  "marketplaceIntelligenceImportsEnabled",
  "marketplaceKeywordDiscoveryEnabled",
  "marketplaceIntelligenceReportsEnabled",
  "marketplaceReportImageSkillsEnabled",
  "marketplaceIntelligenceShareableImageEnabled",
  "marketplaceIntelligenceWatchlistsEnabled",
  "marketplaceIntelligenceMcpWritesEnabled",
];

describe("Marketplace Intelligence tenant feature flags", () => {
  it("declares Marketplace Intelligence tenant flags", () => {
    const flags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS };

    for (const flag of MARKETPLACE_INTELLIGENCE_FLAGS) {
      expect(typeof flags[flag]).toBe("boolean");
    }
  });

  it("defaults Marketplace Intelligence flags off", () => {
    for (const flag of MARKETPLACE_INTELLIGENCE_FLAGS) {
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });

  it("allows exact Marketplace Intelligence flag keys", () => {
    for (const flag of MARKETPLACE_INTELLIGENCE_FLAGS) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
    }
    expect(ALLOWED_FEATURE_FLAGS.has("MARKETPLACE_CONNECTOR_LAB_ENABLED")).toBe(false);
  });
});
