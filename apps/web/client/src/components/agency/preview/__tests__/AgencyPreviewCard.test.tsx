/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMutate = vi.fn();
const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/agencies/a-1", mockSetLocation],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      commitPreview: {
        useMutation: (opts: any) => {
          return {
            mutate: (input: any) => {
              mockMutate(input);
              if (opts?.onSuccess) {
                opts.onSuccess({ ok: true, targetType: "library_item", targetId: "lib-1" });
              }
            },
            isPending: false,
          };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  AgencyPreviewCard,
  type AgencyPreviewProps,
} from "../AgencyPreviewCard";

function makePreview(
  overrides: Partial<AgencyPreviewProps> = {},
): AgencyPreviewProps {
  return {
    previewType: "research",
    artifactId: "art-1",
    intent: "research_report",
    lifecycleState: "preview_generated",
    summaryText: "A research summary",
    provenance: [],
    commit: {
      status: "preview_generated",
      token: "tok-1",
      available: true,
      supported: true,
      targetType: null,
      targetId: null,
    },
    data: {
      title: "AI Marketing Trends",
      executiveSummary: "AI is transforming marketing.",
      sections: [
        {
          heading: "Section 1",
          content: "Content here.",
          sources: ["Source A"],
        },
      ],
      keyFindings: ["Finding 1", "Finding 2"],
      recommendations: ["Recommendation 1"],
    },
    ...overrides,
  };
}

describe("AgencyPreviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders research preview with title and summary", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview()}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("AI Marketing Trends")).toBeTruthy();
    expect(screen.getByText("A research summary")).toBeTruthy();
    expect(screen.getByText("Research Report")).toBeTruthy();
    expect(screen.getByText("Preview Ready")).toBeTruthy();
  });

  it("renders executive summary and key findings", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview()}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("AI is transforming marketing.")).toBeTruthy();
    expect(screen.getByText(/Finding 1/)).toBeTruthy();
    expect(screen.getByText(/Finding 2/)).toBeTruthy();
    expect(screen.getByText(/Recommendation 1/)).toBeTruthy();
  });

  it("renders sections with sources", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview()}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("Section 1")).toBeTruthy();
    expect(screen.getByText("Content here.")).toBeTruthy();
    expect(screen.getByText("Source A")).toBeTruthy();
  });

  it("renders storyboard preview", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview({
          previewType: "storyboard",
          intent: "video_storyboard",
          data: {
            title: "Product Launch Video",
            totalDurationSeconds: 90,
            style: "cinematic",
            scenes: [
              {
                sceneNumber: 1,
                durationSeconds: 15,
                description: "Opening shot",
                dialogue: "Welcome!",
                camera: "Wide angle",
                lighting: "Natural",
                videoPrompt: "Aerial view of city",
                audioPrompt: "Upbeat music",
              },
            ],
          },
        })}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("Product Launch Video")).toBeTruthy();
    expect(screen.getByText("Storyboard")).toBeTruthy();
    expect(screen.getByText("cinematic")).toBeTruthy();
    expect(screen.getByText("1m 30s")).toBeTruthy();
    expect(screen.getByText("Opening shot")).toBeTruthy();
    expect(screen.getByText(/Welcome!/)).toBeTruthy();
  });

  it("renders deck preview with slides", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview({
          previewType: "deck",
          intent: "presentation_deck",
          data: {
            title: "Q4 Report",
            description: "Quarterly results",
            language: "en",
            stylePreset: "corporate",
            slides: [
              {
                templateId: "title_subtitle",
                title: "Q4 Overview",
                body: ["Revenue up 20%", "Costs down 5%"],
                graphicCategory: "business",
                imagePromptKeywords: "chart growth",
              },
            ],
          },
        })}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("Q4 Report")).toBeTruthy();
    expect(screen.getByText("Presentation Deck")).toBeTruthy();
    expect(screen.getByText("1 slides")).toBeTruthy();
    expect(screen.getByText("Q4 Overview")).toBeTruthy();
    expect(screen.getByText(/Revenue up 20%/)).toBeTruthy();
  });

  it("renders comparison preview with options", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview({
          previewType: "comparison",
          intent: "hotel_comparison",
          data: {
            comparisonKind: "hotel",
            title: "Chiang Mai Hotels",
            summary: "3 hotels compared",
            locationSummary: "Chiang Mai, Thailand",
            comparedAt: null,
            sortHint: null,
            recommendations: ["Hotel A is best value"],
            options: [
              {
                vendor: "Agoda",
                optionTitle: "Art Mai Gallery",
                price: 2400,
                currency: "THB",
                availabilityState: "available",
                refundable: true,
                evidence: [
                  { label: "Agoda Search", url: "https://example.com" },
                ],
              },
            ],
          },
        })}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("Chiang Mai Hotels")).toBeTruthy();
    expect(screen.getByText("Hotel Compare")).toBeTruthy();
    expect(screen.getByText("Art Mai Gallery")).toBeTruthy();
    expect(screen.getByText("THB 2400")).toBeTruthy();
  });

  it("shows commit button and triggers mutation", async () => {
    render(
      <AgencyPreviewCard
        preview={makePreview()}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    const commitButton = screen.getByText("Save to Library");
    expect(commitButton).toBeTruthy();
    fireEvent.click(commitButton);
    expect(mockMutate).toHaveBeenCalledWith({
      agencyId: "a-1",
      runId: "r-1",
      artifactId: "art-1",
      commitToken: "tok-1",
    });
  });

  it("shows committed state", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview({
          lifecycleState: "committed",
          commit: {
            status: "committed",
            token: "tok-1",
            available: false,
            supported: true,
            targetType: "library_item",
            targetId: "lib-1",
          },
        })}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("Committed")).toBeTruthy();
    expect(screen.getByText(/Saved to Library/)).toBeTruthy();
  });

  it("shows expired state with disabled button", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview({
          lifecycleState: "expired_preview",
          commit: {
            status: "expired",
            token: "tok-1",
            available: false,
            supported: true,
            targetType: null,
            targetId: null,
          },
        })}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Preview Expired")).toBeTruthy();
  });

  it("renders provenance sources", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview({
          provenance: [
            {
              documentId: "doc-1",
              title: "Research Paper",
              url: "https://example.com/paper",
            },
          ],
        })}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("Sources")).toBeTruthy();
    expect(screen.getByText("Research Paper")).toBeTruthy();
  });

  it("shows dismiss button when onDismiss is provided", () => {
    const onDismiss = vi.fn();
    render(
      <AgencyPreviewCard
        preview={makePreview()}
        agencyId="a-1"
        runId="r-1"
        onDismiss={onDismiss}
      />,
    );
    const dismissBtn = screen.getByLabelText("Dismiss preview");
    expect(dismissBtn).toBeTruthy();
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("hides dismiss button when onDismiss is not provided", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview()}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.queryByLabelText("Dismiss preview")).toBeNull();
  });

  it("shows commit_failed state with Save Failed badge", () => {
    render(
      <AgencyPreviewCard
        preview={makePreview({
          lifecycleState: "commit_failed",
          commit: {
            status: "commit_failed",
            token: "tok-1",
            available: true,
            supported: true,
            targetType: null,
            targetId: null,
          },
        })}
        agencyId="a-1"
        runId="r-1"
      />,
    );
    expect(screen.getByText("Save Failed")).toBeTruthy();
    // Commit button should still be available for retry
    expect(screen.getByText("Save to Library")).toBeTruthy();
  });
});
