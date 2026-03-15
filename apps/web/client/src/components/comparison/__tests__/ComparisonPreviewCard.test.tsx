/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ComparisonPreviewCard } from "../ComparisonPreviewCard";

describe("ComparisonPreviewCard", () => {
  it("renders comparison rows without requiring distance data", () => {
    render(
      <ComparisonPreviewCard
        preview={{
          lifecycleState: "preview_generated",
          summaryText: "Comparison ready.",
          data: {
            comparisonKind: "ticket",
            title: "Bangkok to Tokyo flights",
            summary: "Fastest morning departures first.",
            locationSummary: null,
            comparedAt: "2026-03-12T10:07:00.000Z",
            sortHint: "Lowest total price first",
            recommendations: ["Avoid the non-refundable fare."],
            options: [
              {
                vendor: "Skyscanner",
                optionTitle: "BKK to NRT",
                price: 12990,
                currency: "THB",
                priceLabel: "THB 12,990",
                availabilityState: "available",
                refundable: false,
                evidence: [
                  {
                    label: "Fare snapshot",
                    snippet: "Carry-on included",
                  },
                ],
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Bangkok to Tokyo flights")).toBeInTheDocument();
    expect(screen.getByText("THB 12,990")).toBeInTheDocument();
    expect(screen.getByText("available")).toBeInTheDocument();
    expect(screen.queryByText("350 m")).not.toBeInTheDocument();
    expect(screen.getByText("Fare snapshot")).toBeInTheDocument();
  });
});
