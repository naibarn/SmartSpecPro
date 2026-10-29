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
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — detected speaker mapping", () => {
  it("hides the legacy left-to-right cast editor", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);

    expect(
      screen.queryByTestId("vd-storyboard-cast-position-lock-1")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-confirm-cast-position-1")
    ).not.toBeInTheDocument();
  });

  it("asks for detected speaker mappings when a multi-person shot has dialogue", () => {
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
    expect(status).toHaveTextContent("จับคู่ผู้พูดกับคนที่ตรวจพบในภาพให้ครบก่อน");
    expect(status).not.toHaveTextContent("ยังไม่มีภาพ");

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

  it("enables both prompt actions after every dialogue speaker has a detected mapping", () => {
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
      screen.queryByTestId("vd-storyboard-speaker-mapping-review-1")
    ).not.toBeInTheDocument();
  });
});
