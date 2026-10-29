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
          requiredCharacterRefs: ["left-character", "right-character"],
        },
      ],
    },
    characterPortraits: {
      "left-character": {
        characterId: "1",
        name: "ตัวละครซ้าย",
        portraitUrl: null,
      },
      "right-character": {
        characterId: "2",
        name: "ตัวละครขวา",
        portraitUrl: null,
      },
    },
    loading: false,
    onSetShotCastPositionLock: vi.fn(),
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — cast position swaps", () => {
  it("keeps every character option selectable so users can swap positions", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);

    const firstSelect = selects[0] as HTMLSelectElement;
    const rightCharacterOption = firstSelect.querySelector(
      'option[value="right-character"]'
    );
    expect(rightCharacterOption).not.toBeNull();
    expect(rightCharacterOption).not.toBeDisabled();

    // Selecting the other slot's value is the first step of a manual swap.
    fireEvent.change(firstSelect, { target: { value: "right-character" } });
    expect(firstSelect).toHaveValue("right-character");

    // The temporary duplicate is visible, but confirmation remains guarded
    // until the user finishes the swap and restores a unique order.
    expect(
      screen.getByTestId("vd-storyboard-confirm-cast-position-1")
    ).toBeDisabled();
  });

  it("gates Enhanced prompt generation on the current cast-position confirmation", () => {
    const onGenerateEnhanced = vi.fn();
    const props = baseProps({
      startFramePlan: {
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            approvedMediaAssetId: "10",
            requiredCharacterRefs: ["left-character", "right-character"],
          },
        ],
      },
      assetUrls: {
        "10": {
          url: "https://example.com/start-frame.png",
          thumbnailUrl: null,
        },
      },
      selectedVideoModelId: "video-model",
      enhancedVideoPromptUiEnabled: true,
      onGenerateShotVideoPrompt: vi.fn(),
      onGenerateEnhancedShotVideoPrompt: onGenerateEnhanced,
      enhancedReadinessByShot: { 1: { ready: false, reasons: ["SHOT_PRECONDITION_FAILED"] } },
      enhancedGeneratingForShot: new Set(),
    });
    const { rerender } = render(
      <VerticalDramaStoryboardPanel {...(props as any)} />
    );

    const enhancedButton = screen.getByTestId(
      "vd-storyboard-generate-enhanced-video-prompt-1"
    );
    expect(enhancedButton).toBeDisabled();
    const status = document.getElementById("vd-storyboard-enhanced-status-1")!;
    expect(status).toHaveTextContent("ต้องยืนยันลำดับตัวละครซ้าย→ขวาจากภาพปัจจุบันก่อน");
    expect(status).not.toHaveTextContent("ยังไม่มีภาพ");
    const scrollIntoView = vi.fn();
    const review = screen.getByTestId("vd-storyboard-cast-position-lock-1");
    review.scrollIntoView = scrollIntoView;
    fireEvent.click(screen.getByRole("button", { name: "ไปยืนยันลำดับตัวละคร" }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(review).toHaveFocus();

    rerender(
      <VerticalDramaStoryboardPanel
        {...({
          ...props,
          enhancedReadinessByShot: { 1: { ready: true, reasons: [] } },
          startFramePlan: {
            ...props.startFramePlan,
            frames: [
              {
                ...props.startFramePlan.frames[0],
                castPositionLock: {
                  assetId: "10",
                  orderedCharacterRefs: ["left-character", "right-character"],
                  confirmedAt: "2026-09-08T00:00:00.000Z",
                },
              },
            ],
          },
        } as any)}
      />
    );

    expect(enhancedButton).toBeEnabled();
    fireEvent.click(enhancedButton);
    expect(onGenerateEnhanced).toHaveBeenCalledWith(1);
    expect(
      screen.queryByTestId("vd-credit-confirm-enhanced-video-prompt-1")
    ).not.toBeInTheDocument();
  });

  it("uses complete detected speaker mappings instead of requiring the legacy left-to-right lock", () => {
    const props = baseProps({
      canonicalShotDrafts: [
        {
          shotNumber: 1,
          summary: "A conversation",
          dialogueLines: [
            { speaker: "left-character", line: "First line" },
            { speaker: "right-character", line: "Reply" },
          ],
        },
      ],
      startFramePlan: {
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            approvedMediaAssetId: "10",
            requiredCharacterRefs: ["left-character", "right-character"],
            speakerVisualBindings: [
              {
                id: "speaker-left",
                speakerLabel: "left-character",
                visualCue: "person by the doorway",
                personId: "person-1",
                boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.8 },
                sourceMediaAssetId: "10",
              },
              {
                id: "speaker-right",
                speakerLabel: "right-character",
                visualCue: "person at the table",
                personId: "person-2",
                boundingBox: { x: 0.6, y: 0.2, width: 0.2, height: 0.7 },
                sourceMediaAssetId: "10",
              },
            ],
          },
        ],
      },
      assetUrls: {
        "10": {
          url: "https://example.com/start-frame.png",
          thumbnailUrl: null,
        },
      },
      selectedVideoModelId: "video-model",
      enhancedVideoPromptUiEnabled: true,
      onGenerateShotVideoPrompt: vi.fn(),
      onGenerateEnhancedShotVideoPrompt: vi.fn(),
      enhancedReadinessByShot: { 1: { ready: true, reasons: [] } },
      enhancedGeneratingForShot: new Set(),
    });

    render(<VerticalDramaStoryboardPanel {...(props as any)} />);

    expect(
      screen.getByTestId("vd-storyboard-generate-shot-video-prompt-1")
    ).toBeEnabled();
    expect(
      screen.getByTestId("vd-storyboard-generate-enhanced-video-prompt-1")
    ).toBeEnabled();
    expect(
      screen.queryByTestId("vd-storyboard-cast-position-review-1")
    ).not.toBeInTheDocument();
  });
});
