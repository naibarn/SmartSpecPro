import { describe, expect, it } from "vitest";

import {
  extractBrowserSessionArtifacts,
  extractComparisonPreviews,
} from "./chatArtifactPresentation";

describe("chatArtifactPresentation", () => {
  it("extracts Browser Session artifacts from message metadata", () => {
    expect(
      extractBrowserSessionArtifacts([
        {
          metadata: {
            browserSession: {
              sessionId: "lbs_chat_1",
              summary: {
                sessionId: "lbs_chat_1",
                originSurface: "chat",
                state: "ai_in_control",
                badgeLabel: "AI In Control",
                statusLine: "AI is controlling this Browser Session.",
                primaryActionLabel: "Continue in Browser",
                pageTitle: "Dashboard",
                url: "https://example.com/dashboard",
                compactNotice: null,
                sourceLabel: "Chat",
              },
              launchContext: {
                originSurface: "chat",
                originLabel: "Chat",
                sourceId: "12",
                returnContext: {
                  path: "/chat?c=12&browserSessionId=lbs_chat_1",
                  label: "Return to Chat",
                },
              },
              updatedAt: "2026-03-12T10:05:00.000Z",
            },
          },
        },
      ]),
    ).toHaveLength(1);
  });

  it("extracts comparison previews only when comparison metadata is present", () => {
    expect(
      extractComparisonPreviews([
        {
          metadata: {
            comparisonPreview: {
              lifecycleState: "preview_generated",
              summaryText: "Comparison ready.",
              data: {
                comparisonKind: "hotel",
                title: "Hotels near Asok",
                summary: "Closest options first.",
                recommendations: ["Pick the closest refundable option."],
                options: [
                  {
                    vendor: "Booking.com",
                    optionTitle: "Centre Point Asok",
                    priceLabel: "THB 4,200",
                    availabilityState: "limited",
                    evidence: [],
                  },
                ],
              },
            },
          },
        },
        { metadata: { browserSession: { sessionId: "lbs_chat_1" } } },
      ]),
    ).toMatchObject([
      {
        summaryText: "Comparison ready.",
        data: {
          comparisonKind: "hotel",
          title: "Hotels near Asok",
        },
      },
    ]);
  });
});
