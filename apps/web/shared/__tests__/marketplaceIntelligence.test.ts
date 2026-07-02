import { describe, expect, it } from "vitest";
import {
  marketplaceConnectorGrantStatusResponseSchema,
  marketplaceConnectorGrantStatuses,
  marketplaceConnectorProviderSchema,
} from "../marketplaceIntelligence";
import {
  createRecordedShopeeMcpProbe,
  discoverMarketplaceFieldCoverage,
} from "../marketplaceMcpProbeFixture";

describe("marketplace intelligence shared contracts", () => {
  it("accepts the supported connector provider and grant statuses", () => {
    expect(marketplaceConnectorProviderSchema.parse("shopee")).toBe("shopee");
    expect(marketplaceConnectorGrantStatuses).toContain("pending");
    expect(marketplaceConnectorGrantStatuses).toContain("scope_missing");
    expect(marketplaceConnectorGrantStatuses).toContain("provider_unavailable");
  });

  it("normalizes nullable grant status response fields", () => {
    const parsed = marketplaceConnectorGrantStatusResponseSchema.parse({
      provider: "shopee",
      status: "active",
      scopes: ["marketplace.search.read"],
    });

    expect(parsed.startedAt).toBeNull();
    expect(parsed.expiresAt).toBeNull();
    expect(parsed.authorizationAttemptId).toBeNull();
  });

  it("builds useful field discovery from the recorded Shopee MCP probe", () => {
    const probe = createRecordedShopeeMcpProbe({ keyword: "CGM", limit: 4 });
    const priceField = probe.fieldCoverage.find((field) => field.path === "item_data.item_card_display_price.price");
    const monthlySoldField = probe.fieldCoverage.find((field) => field.path === "item_data.item_card_display_sold_count.monthly_sold_count");

    expect(probe.source).toBe("recorded_mcp_sample");
    expect(probe.capabilitySummary.pricing).toBeGreaterThanOrEqual(90);
    expect(probe.capabilitySummary.sales).toBeGreaterThanOrEqual(90);
    expect(priceField).toMatchObject({ percent: 100, use: "pricing", keep: "normalized" });
    expect(monthlySoldField).toMatchObject({ percent: 100, use: "sales", keep: "normalized" });
    expect(discoverMarketplaceFieldCoverage(probe.items.map((item) => item.raw)).length).toBeGreaterThan(20);
  });
});
