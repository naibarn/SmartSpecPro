import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

describe("VerticalDramaStoryboardPanel — bulk missing video prompts", () => {
  it("queues only shots that have no video prompt and preserves the all-shots action", () => {
    const onGenerateAllShotVideoPrompts = vi.fn();
    const storyboard = {
      shots: [1, 2, 3, 4, 5].map(shot_number => ({
        shot_number,
        visual_description: `Shot ${shot_number}`,
        characters: [],
      })),
    };

    render(
      <VerticalDramaStoryboardPanel
        {...({
          locale: "th",
          storyboard,
          startFramePlan: { frames: [] },
          motionPromptPack: {
            clips: [
              {
                clipNumber: 2,
                parentShotNumber: 2,
                prompt: "Existing video prompt",
              },
              {
                clipNumber: 3,
                parentShotNumber: 3,
                prompt: "   ",
              },
              {
                clipNumber: 4,
                parentShotNumber: 4,
                prompt: "Existing prompt on one clip",
                subShotNumber: 1,
              },
              {
                clipNumber: 5,
                parentShotNumber: 4,
                prompt: "",
                subShotNumber: 2,
              },
              {
                clipNumber: 6,
                parentShotNumber: 5,
                prompt: "",
                videoPromptVariants: {
                  version: "vd-video-prompt-variants/1",
                  activeVariant: "legacy",
                  revision: 1,
                  variants: {
                    legacy: {
                      variantId: "legacy",
                      status: "ready",
                      prompt: "Existing prompt in active variant",
                      inputFingerprint: "a".repeat(64),
                      revision: 1,
                      createdAt: "2026-11-08T00:00:00.000Z",
                      updatedAt: "2026-11-08T00:00:00.000Z",
                    },
                  },
                },
              },
            ],
          },
          loading: false,
          selectedVideoModelId: "video-model",
          onGenerateAllShotVideoPrompts,
        } as any)}
      />
    );

    const missingButton = screen.getByTestId(
      "vd-generate-missing-video-prompts"
    );
    expect(missingButton).toHaveTextContent("(2)");
    expect(
      screen.getByTestId("vd-generate-all-standard-video-prompts")
    ).toBeEnabled();

    fireEvent.click(missingButton);
    expect(
      screen.getByText(/เฉพาะ 2 ช็อตที่ยังไม่มี prompt/)
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByTestId("vd-confirm-generate-missing-video-prompts")
    );

    expect(onGenerateAllShotVideoPrompts).toHaveBeenCalledExactlyOnceWith([
      1, 3,
    ]);
  });
});
