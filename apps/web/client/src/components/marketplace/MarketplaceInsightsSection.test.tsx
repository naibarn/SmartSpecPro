import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketplaceInsightsSection } from "./MarketplaceInsightsSection";

describe("MarketplaceInsightsSection", () => {
  it("shows all product brief fields expanded, including pain points and later list items", () => {
    const sellingPoints = Array.from({ length: 9 }, (_, index) => `Selling point ${index + 1}`);
    render(
      <MarketplaceInsightsSection
        insights={[
          {
            id: "insight-1",
            insightType: "product_brief",
            payloadJson: {
              productName: "SKG Espresso Machine",
              category: "Coffee machines",
              shortSummary: "Grinder and espresso machine in one unit.",
              keySellingPoints: sellingPoints,
              targetAudiences: ["Home cafe owners"],
              buyerPainPoints: ["Limited counter space"],
              buyerObjections: ["Unsure about the grinder"],
              trustSignals: ["One year warranty"],
              contentAngles: ["Quick home cafe demo"],
              suggestedHooks: ["Make espresso at home"],
              suggestedCTAs: ["See product details"],
              confidence: 0.9,
              evidenceIds: [],
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/Product name:/).parentElement).toHaveTextContent("SKG Espresso Machine");
    expect(screen.getByText("Buyer pain points")).toBeInTheDocument();
    expect(screen.getByText("Limited counter space")).toBeInTheDocument();
    expect(screen.getByText("Buyer objections")).toBeInTheDocument();
    expect(screen.getByText("Trust signals")).toBeInTheDocument();
    expect(screen.getByText("Selling point 9")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ย่อ" })).toHaveAttribute("aria-expanded", "true");
  });
});
