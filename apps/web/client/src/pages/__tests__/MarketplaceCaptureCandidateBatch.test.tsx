/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MarketplaceCaptureCandidateBatch from "../MarketplaceCaptureCandidateBatch";

vi.mock("wouter", () => ({
  useLocation: () => ["/marketplace-capture/candidates/mcb_1", vi.fn()],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceCapture: {
      getCandidateBatch: {
        useQuery: () => ({
          isLoading: false,
          data: {
            batch: {
              id: "mcb_1",
              platform: "shopee",
              sourceUrl: "https://shopee.co.th/search?keyword=CGM",
              categoryName: "CGM",
              count: 2,
              createdAt: "2026-07-01T00:00:00.000Z",
              filtersJson: {
                source: "marketplace_intelligence_snapshot",
                snapshotId: "mss_1",
                capturedAt: "2026-07-01T00:00:00.000Z",
              },
            },
            items: [
              {
                id: "mci_1",
                title: "CGM Starter Kit Official Store",
                sourceUrl: "https://shopee.co.th/product/2001/1001",
                priceText: "1,890 THB",
                soldCountText: "5,320 monthly sold",
                badgesJson: ["verified_or_mall"],
                scoreReasonsJson: ["Rank #1 in keyword snapshot"],
                score: 98,
                imageUrl: "https://example.test/cgm.jpg",
                rawJson: {
                  platformRawJson: {
                    marketplaceIntelligenceSnapshotId: "mss_1",
                    sellerName: "HealthPlus Official",
                    sourceCapturedAt: "2026-07-01T00:00:00.000Z",
                  },
                },
              },
              {
                id: "mci_2",
                title: "CGM Sensor Pack",
                sourceUrl: "https://shopee.co.th/product/2002/1002",
                priceText: "1,650 THB",
                soldCountText: "3,110 monthly sold",
                badgesJson: [],
                scoreReasonsJson: ["Marketplace seller signal"],
                score: 92,
                imageUrl: null,
                rawJson: {
                  platformRawJson: {
                    marketplaceIntelligenceSnapshotId: "mss_1",
                    sellerName: "Care Supply TH",
                  },
                },
              },
            ],
          },
        }),
      },
    },
  },
}));

describe("MarketplaceCaptureCandidateBatch", () => {
  it("shows marketplace intelligence provenance and handoff actions", () => {
    render(<MarketplaceCaptureCandidateBatch />);

    expect(screen.getByRole("heading", { name: "Candidate batch created from keyword snapshot" })).toBeInTheDocument();
    expect(screen.getByText("mss_1")).toBeInTheDocument();
    expect(screen.getByText("1,890 THB")).toBeInTheDocument();
    expect(screen.getByText("8,430")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open snapshot" })).toHaveAttribute("href", "/marketplace-capture/intelligence/snapshots/mss_1");
    expect(screen.getByRole("link", { name: "Discovery map" })).toHaveAttribute("href", "/marketplace-capture/intelligence/discovery?keyword=CGM");
  });
});
