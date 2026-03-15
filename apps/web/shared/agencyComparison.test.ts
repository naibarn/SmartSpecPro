import { describe, expect, it } from "vitest";

import {
  comparisonKindFromIntent,
  normalizeAgencyComparisonPayload,
} from "./agencyComparison";

describe("agency comparison contract", () => {
  it("normalizes browse-and-compare payloads across snake_case and camelCase fields", () => {
    const payload = normalizeAgencyComparisonPayload({
      title: "Hotels near BTS Asok",
      summary: "Best balance of price and distance.",
      options: [
        {
          vendor: "Booking.com",
          option_title: "Centre Point Asok",
          price: "4200",
          currency_code: "THB",
          distance_meters: "350",
          availability: "few_left",
          refundable: "true",
          booking_link: "https://example.com/hotel-1",
          evidence: [
            {
              title: "Rate card",
              url: "https://example.com/rate-1",
              snippet: "Breakfast included",
            },
          ],
        },
      ],
    }, "hotel");

    expect(payload).toEqual({
      comparisonKind: "hotel",
      title: "Hotels near BTS Asok",
      summary: "Best balance of price and distance.",
      locationSummary: null,
      comparedAt: null,
      sortHint: null,
      recommendations: [],
      options: [
        expect.objectContaining({
          vendor: "Booking.com",
          optionTitle: "Centre Point Asok",
          price: 4200,
          currency: "THB",
          distance: 350,
          availabilityState: "limited",
          refundable: true,
          bookingLink: "https://example.com/hotel-1",
          evidence: [
            expect.objectContaining({
              label: "Rate card",
            }),
          ],
        }),
      ],
    });
  });

  it("degrades cleanly when distance data is missing", () => {
    const payload = normalizeAgencyComparisonPayload({
      title: "Flight shortlist",
      rows: [
        {
          vendor: "Skyscanner",
          title: "Bangkok to Tokyo",
          priceAmount: 12990,
          currency: "THB",
        },
      ],
    }, "ticket");

    expect(payload?.options[0]).toEqual(
      expect.objectContaining({
        optionTitle: "Bangkok to Tokyo",
        distance: null,
        distanceLabel: null,
      }),
    );
  });

  it("maps comparison-capable intents to stable comparison kinds", () => {
    expect(comparisonKindFromIntent("research_report")).toBe("research");
    expect(comparisonKindFromIntent("ticket_comparison")).toBe("ticket");
    expect(comparisonKindFromIntent("hotel_comparison")).toBe("hotel");
    expect(comparisonKindFromIntent("shortlist")).toBe("shortlist");
    expect(comparisonKindFromIntent("media_prompt")).toBeNull();
  });
});
