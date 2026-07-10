/**
 * Speaker-aware sub-shots (2026-07-10) frontend coverage for
 * `VerticalDramaStoryboardPanel.tsx`: rendering one video-prompt box PER
 * clip instead of the old "first-clip-wins" single box, with distinct
 * per-clip labels/testids and independent save/edit wiring — see
 * `apps/web/shared/verticalDramaSeries/contracts.ts`
 * (`VerticalDramaMotionPromptPack.clips[]`) for the underlying shape a split
 * shot's clips carry (`clipNumber = shotNumber * 100 + subShotNumber`,
 * `sourceShotNumbers`, `parentShotNumber`, `subShotNumber`, per-clip
 * `dialogue[]`).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

const CHARACTER_PORTRAITS = {
  anna: { characterId: "char-anna", name: "Anna", portraitUrl: null },
  ben: { characterId: "char-ben", name: "Ben", portraitUrl: null },
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: { frames: [{ shotNumber: 1, imagePrompt: "a prompt" }] },
    characterPortraits: CHARACTER_PORTRAITS,
    loading: false,
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — speaker-aware sub-shots (regression guard)", () => {
  it("a shot with exactly one clip renders exactly one video-prompt box, plain title, unchanged from before this feature", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "Slow push-in on the hallway.",
              },
            ],
          },
        }) as any)}
      />
    );

    // Plain, non-split title text.
    expect(screen.getByText("พรอมต์วิดีโอ")).toBeInTheDocument();
    // Exactly one prompt box for this shot/clip.
    expect(
      screen.getByTestId("vd-storyboard-video-prompt-1-copy")
    ).toBeInTheDocument();
    // No split-only affordance (duration badge) rendered for the common case.
    expect(
      screen.queryByTestId("vd-storyboard-video-prompt-1-duration-badge")
    ).not.toBeInTheDocument();
  });

  it("a shot with no clip generated yet still renders exactly one (empty) video-prompt box, keyed by shotNumber", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ motionPromptPack: { clips: [] } }) as any)}
      />
    );

    expect(screen.getByText("พรอมต์วิดีโอ")).toBeInTheDocument();
    expect(screen.getByText("ยังไม่มีพรอมต์วิดีโอ")).toBeInTheDocument();
    // No prompt yet, so the copy button (only shown when a prompt exists)
    // never renders — and there is only ONE such (absent) box, not several.
    expect(
      screen.queryByTestId("vd-storyboard-video-prompt-1-copy")
    ).not.toBeInTheDocument();
  });
});

describe("VerticalDramaStoryboardPanel — speaker-aware sub-shots (split shot)", () => {
  function splitProps(overrides: Record<string, unknown> = {}) {
    return baseProps({
      motionPromptPack: {
        clips: [
          {
            clipNumber: 101,
            sourceShotNumbers: [1],
            parentShotNumber: 1,
            subShotNumber: 1,
            durationSeconds: 3,
            prompt: "Anna leans in, urgent.",
            dialogue: [{ characterKey: "anna", lineTh: "รอด้วยสิ!" }],
          },
          {
            clipNumber: 102,
            sourceShotNumbers: [1],
            parentShotNumber: 1,
            subShotNumber: 2,
            durationSeconds: 4,
            prompt: "Ben turns away, cold.",
            dialogue: [{ characterKey: "ben", lineTh: "ไม่มีอะไรจะพูดแล้ว" }],
          },
        ],
      },
      ...overrides,
    });
  }

  it("renders two video-prompt boxes, each with a distinct speaker-cut title and its own testid", () => {
    render(<VerticalDramaStoryboardPanel {...(splitProps() as any)} />);

    expect(
      screen.getByText("พรอมต์วิดีโอ — ตัดไปหา Anna (1/2)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("พรอมต์วิดีโอ — ตัดไปหา Ben (2/2)")
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("vd-storyboard-video-prompt-101-copy")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-video-prompt-102-copy")
    ).toBeInTheDocument();

    // Per-clip duration badges only shown once a shot has split.
    expect(
      screen.getByTestId("vd-storyboard-video-prompt-101-duration-badge")
    ).toHaveTextContent("3");
    expect(
      screen.getByTestId("vd-storyboard-video-prompt-102-duration-badge")
    ).toHaveTextContent("4");
  });

  it("editing one clip's prompt saves only that clip's clipNumber, never the sibling clip", () => {
    const onSaveVideoPrompt = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(splitProps({ onSaveVideoPrompt }) as any)}
      />
    );

    fireEvent.click(
      screen.getByTestId("vd-storyboard-video-prompt-102-edit-inline")
    );
    const textarea = screen.getByTestId(
      "vd-storyboard-video-prompt-102-textarea"
    );
    fireEvent.change(textarea, {
      target: { value: "Ben slams the door instead." },
    });
    fireEvent.click(screen.getByTestId("vd-storyboard-video-prompt-102-save"));

    expect(onSaveVideoPrompt).toHaveBeenCalledTimes(1);
    expect(onSaveVideoPrompt).toHaveBeenCalledWith(
      1,
      102,
      "Ben slams the door instead."
    );
  });

  it("falls back to the raw characterKey when no display name is available, and to a generic cut label when there's no dialogue at all", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          motionPromptPack: {
            clips: [
              {
                clipNumber: 101,
                sourceShotNumbers: [1],
                parentShotNumber: 1,
                subShotNumber: 1,
                prompt: "First cut.",
                dialogue: [{ characterKey: "unknown_char", lineTh: "..." }],
              },
              {
                clipNumber: 102,
                sourceShotNumbers: [1],
                parentShotNumber: 1,
                subShotNumber: 2,
                prompt: "Second cut, no dialogue.",
              },
            ],
          },
        }) as any)}
      />
    );

    expect(
      screen.getByText("พรอมต์วิดีโอ — ตัดไปหา unknown_char (1/2)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("พรอมต์วิดีโอ — ตัดไปหา ตัดที่ 2 (2/2)")
    ).toBeInTheDocument();
  });
});
