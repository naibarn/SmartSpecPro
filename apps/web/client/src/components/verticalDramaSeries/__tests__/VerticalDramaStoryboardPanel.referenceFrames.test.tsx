/**
 * Coverage for the supplementary reference-frame trigger button + growing
 * row on `VerticalDramaStoryboardPanel` (Phase 6c, `planning/vd-start-frame-
 * reference-mapping/plan.md`). The dialog's own step/gating logic is covered
 * in `VerticalDramaReferenceFrameDialog.test.tsx`; this file covers how the
 * panel surfaces the trigger, gates it at the 10-frame cap, and renders the
 * DISTINCT "เฟรมอ้างอิงที่สร้างไว้" row filtered to `source:
 * "reference_frame"` (design decision (a) in the plan — a separate row from
 * the general `ShotReferenceStrip`, most-recent-first).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: {
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "a prompt",
          requiredCharacterRefs: ["hero"],
        },
      ],
    },
    characterPortraits: {
      hero: { characterId: "1", name: "พระเอก", portraitUrl: "https://cdn/hero.jpg" },
    },
    loading: false,
    onGenerateReferenceFramePrompt: vi.fn(),
    onGenerateReferenceFrameImage: vi.fn(),
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — supplementary reference frames (Phase 6c)", () => {
  it("does not render the generate button when neither callback is wired", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onGenerateReferenceFramePrompt: undefined,
          onGenerateReferenceFrameImage: undefined,
        }) as any)}
      />
    );
    expect(
      screen.queryByTestId("vd-generate-reference-frame-1")
    ).not.toBeInTheDocument();
  });

  it("renders the generate button and opens the dialog on click", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);
    const button = screen.getByTestId("vd-generate-reference-frame-1");
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(
      screen.getByTestId("vd-reference-frame-dialog-1")
    ).toBeInTheDocument();
    // Default selection seeds from requiredCharacterRefs — the roster
    // checkbox for "hero" starts checked.
    const heroRow = screen.getByTestId("vd-reference-frame-character-1-hero");
    expect(
      heroRow.querySelector('button[role="checkbox"]')
    ).toHaveAttribute("data-state", "checked");
  });

  it("disables the generate button once the shot has 10 linked reference_frame rows", () => {
    const tenFrames = Array.from({ length: 10 }, (_, i) => ({
      referenceId: `ref-${i}`,
      mediaAssetId: `asset-${i}`,
      role: "reference" as const,
      source: "reference_frame" as const,
      sortOrder: i,
      thumbnailUrl: `https://cdn/frame-${i}.jpg`,
    }));
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          shotReferencesByShot: { 1: tenFrames },
        }) as any)}
      />
    );
    expect(
      screen.getByTestId("vd-generate-reference-frame-1")
    ).toBeDisabled();
  });

  it("does not render the generated-frames row when there are no reference_frame entries yet", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);
    expect(
      screen.queryByTestId("vd-reference-frame-row-1")
    ).not.toBeInTheDocument();
  });

  it("renders only reference_frame-sourced entries (filters out other sources), most-recent first", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          shotReferencesByShot: {
            1: [
              {
                referenceId: "gen-1",
                mediaAssetId: "a1",
                role: "reference",
                source: "generated",
                sortOrder: 0,
                thumbnailUrl: "https://cdn/generated.jpg",
              },
              {
                referenceId: "rf-1",
                mediaAssetId: "a2",
                role: "reference",
                source: "reference_frame",
                sortOrder: 1,
                thumbnailUrl: "https://cdn/rf-1.jpg",
              },
              {
                referenceId: "rf-2",
                mediaAssetId: "a3",
                role: "reference",
                source: "reference_frame",
                sortOrder: 2,
                thumbnailUrl: "https://cdn/rf-2.jpg",
              },
            ],
          },
        }) as any)}
      />
    );
    const row = screen.getByTestId("vd-reference-frame-row-1");
    expect(row).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-reference-frame-thumb-1-gen-1")
    ).not.toBeInTheDocument();

    const buttons = row.querySelectorAll("button");
    // Most-recent-first (server persists oldest-first) — rf-2 before rf-1.
    expect(buttons[0].getAttribute("data-testid")).toBe(
      "vd-reference-frame-thumb-1-rf-2"
    );
    expect(buttons[1].getAttribute("data-testid")).toBe(
      "vd-reference-frame-thumb-1-rf-1"
    );
  });

  it("opens the fullscreen lightbox when a generated reference-frame thumbnail is clicked", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          shotReferencesByShot: {
            1: [
              {
                referenceId: "rf-1",
                mediaAssetId: "a2",
                role: "reference",
                source: "reference_frame",
                sortOrder: 1,
                thumbnailUrl: "https://cdn/rf-1.jpg",
              },
            ],
          },
        }) as any)}
      />
    );
    fireEvent.click(screen.getByTestId("vd-reference-frame-thumb-1-rf-1"));
    // ImageLightbox renders the full-size image once opened.
    expect(screen.getByAltText("เฟรมอ้างอิงที่สร้างไว้")).toBeInTheDocument();
  });
});
