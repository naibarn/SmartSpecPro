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
          imagePrompt: "a start frame prompt",
          stopFramePrompt: "a stop frame prompt",
        },
      ],
    },
    loading: false,
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — Stop Frame prompt and image actions", () => {
  it("requires confirmation before generating a Stop Frame prompt", () => {
    const onGenerateStopFramePrompt = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onGenerateStopFramePrompt }) as any)}
      />
    );

    fireEvent.click(
      screen.getByTestId("vd-storyboard-generate-stop-frame-prompt-1")
    );
    expect(onGenerateStopFramePrompt).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("vd-credit-confirm-stop-frame-prompt-1")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("vd-credit-confirm-stop-frame-prompt-1-confirm")
    );
    expect(onGenerateStopFramePrompt).toHaveBeenCalledTimes(1);
    expect(onGenerateStopFramePrompt).toHaveBeenCalledWith(1);
  });

  it("does not generate a Stop Frame prompt when confirmation is canceled", () => {
    const onGenerateStopFramePrompt = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onGenerateStopFramePrompt }) as any)}
      />
    );

    fireEvent.click(
      screen.getByTestId("vd-storyboard-generate-stop-frame-prompt-1")
    );
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));

    expect(onGenerateStopFramePrompt).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("vd-credit-confirm-stop-frame-prompt-1")
    ).not.toBeInTheDocument();
  });

  it("disables the prompt action while that shot is generating", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onGenerateStopFramePrompt: vi.fn(),
          generatingStopFramePromptForShot: new Set([1]),
        }) as any)}
      />
    );

    const button = screen.getByTestId(
      "vd-storyboard-generate-stop-frame-prompt-1"
    );
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("กำลังสร้าง");
  });

  it("shows the Stop Frame image action only when a prompt exists", () => {
    const { rerender } = render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onGenerateStopFrameImage: vi.fn(),
          startFramePlan: {
            frames: [{ shotNumber: 1, imagePrompt: "a start frame prompt" }],
          },
        }) as any)}
      />
    );
    expect(
      screen.queryByTestId("vd-storyboard-generate-stop-frame-image-1")
    ).not.toBeInTheDocument();

    rerender(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onGenerateStopFrameImage: vi.fn() }) as any)}
      />
    );
    expect(
      screen.getByTestId("vd-storyboard-generate-stop-frame-image-1")
    ).toBeInTheDocument();
  });

  it("requires confirmation before generating the Stop Frame image", () => {
    const onGenerateStopFrameImage = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onGenerateStopFrameImage }) as any)}
      />
    );

    fireEvent.click(
      screen.getByTestId("vd-storyboard-generate-stop-frame-image-1")
    );
    expect(onGenerateStopFrameImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(onGenerateStopFrameImage).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByTestId("vd-storyboard-generate-stop-frame-image-1")
    );
    fireEvent.click(
      screen.getByTestId("vd-credit-confirm-stop-frame-image-1-confirm")
    );
    expect(onGenerateStopFrameImage).toHaveBeenCalledTimes(1);
    expect(onGenerateStopFrameImage).toHaveBeenCalledWith(1);
  });

  it("disables the Stop Frame image action while the image is generating", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onGenerateStopFrameImage: vi.fn(),
          generatingStopFrameImageForShot: new Set([1]),
        }) as any)}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-generate-stop-frame-image-1")
    ).toBeDisabled();
  });

  it("offers a slot-only remove action for an existing Stop Frame image", () => {
    const onClearStopFrame = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onClearStopFrame,
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "a start frame prompt",
                stopFramePrompt: "a stop frame prompt",
                approvedStopFrameAssetId: "42",
              },
            ],
          },
          assetUrls: {
            "42": { url: "https://cdn.example.test/stop-frame.png" },
          },
        }) as any)}
      />
    );

    const clearButton = screen.getByTestId("vd-storyboard-clear-stop-frame-1");
    expect(clearButton).toHaveClass("absolute", "right-1", "top-1");
    fireEvent.click(clearButton);

    expect(onClearStopFrame).toHaveBeenCalledTimes(1);
    expect(onClearStopFrame).toHaveBeenCalledWith(1);
  });
});
