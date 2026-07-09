/**
 * Task #36 (optional NATIVE AUDIO DIRECTION prompt option, added
 * 2026-07-09) integration coverage for `VerticalDramaStoryboardPanel.tsx`:
 * the native-audio-direction toggle (visibility gated on the caller wiring
 * `onSelectNativeAudioEnabled` AND the currently-selected video model's
 * `supportsNativeAudio` capability) and the per-clip `audioDirection` muted
 * display line under the video prompt box.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

const VEO_MODEL_WITH_NATIVE_AUDIO = {
  id: "veo3/generate-veo-3-video-lite",
  modelId: "veo3/generate-veo-3-video-lite",
  name: "Veo 3.1 Lite",
  type: "video",
  provider: "kie.ai",
  supportsNativeAudio: true,
};

const GENERIC_MODEL_WITHOUT_NATIVE_AUDIO = {
  id: "kling-2.6",
  modelId: "kling-2.6",
  name: "Kling 2.6",
  type: "video",
  provider: "kie.ai",
  supportsNativeAudio: false,
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: { frames: [{ shotNumber: 1, imagePrompt: "a prompt" }] },
    loading: false,
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — native audio direction toggle (task #36)", () => {
  it("does not render the toggle when onSelectNativeAudioEnabled is not wired at all", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [VEO_MODEL_WITH_NATIVE_AUDIO],
          selectedVideoModelId: VEO_MODEL_WITH_NATIVE_AUDIO.id,
          onSelectVideoModel: vi.fn(),
        }) as any)}
      />
    );

    expect(
      screen.queryByTestId("vd-storyboard-native-audio-toggle")
    ).not.toBeInTheDocument();
  });

  it("does not render the toggle when wired but the selected video model does not support native audio", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [GENERIC_MODEL_WITHOUT_NATIVE_AUDIO],
          selectedVideoModelId: GENERIC_MODEL_WITHOUT_NATIVE_AUDIO.id,
          onSelectVideoModel: vi.fn(),
          onSelectNativeAudioEnabled: vi.fn(),
        }) as any)}
      />
    );

    expect(
      screen.queryByTestId("vd-storyboard-native-audio-toggle")
    ).not.toBeInTheDocument();
  });

  it("renders the toggle, checked by default, plus the helper hint, when wired and the selected model supports native audio", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [VEO_MODEL_WITH_NATIVE_AUDIO],
          selectedVideoModelId: VEO_MODEL_WITH_NATIVE_AUDIO.id,
          onSelectVideoModel: vi.fn(),
          onSelectNativeAudioEnabled: vi.fn(),
          nativeAudioEnabled: true,
        }) as any)}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-native-audio-toggle")
    ).toBeInTheDocument();
    const toggle = screen.getByTestId("vd-storyboard-native-audio-switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByTestId("vd-storyboard-native-audio-hint")
    ).toBeInTheDocument();
  });

  it("calls onSelectNativeAudioEnabled with the new value when the switch is clicked", () => {
    const onSelectNativeAudioEnabled = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [VEO_MODEL_WITH_NATIVE_AUDIO],
          selectedVideoModelId: VEO_MODEL_WITH_NATIVE_AUDIO.id,
          onSelectVideoModel: vi.fn(),
          onSelectNativeAudioEnabled,
          nativeAudioEnabled: true,
        }) as any)}
      />
    );

    fireEvent.click(screen.getByTestId("vd-storyboard-native-audio-switch"));
    expect(onSelectNativeAudioEnabled).toHaveBeenCalledWith(false);
  });

  it("reflects nativeAudioEnabled: false as an unchecked switch", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [VEO_MODEL_WITH_NATIVE_AUDIO],
          selectedVideoModelId: VEO_MODEL_WITH_NATIVE_AUDIO.id,
          onSelectVideoModel: vi.fn(),
          onSelectNativeAudioEnabled: vi.fn(),
          nativeAudioEnabled: false,
        }) as any)}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-native-audio-switch").getAttribute(
        "aria-checked"
      )
    ).toBe("false");
  });
});

describe("VerticalDramaStoryboardPanel — per-clip audioDirection display (task #36)", () => {
  it("shows the muted audio-direction line under the video prompt box when the clip has one", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "Slow push-in on the hallway.",
                audioDirection:
                  "Door slams shut; distant rain patters against the window.",
              },
            ],
          },
        }) as any)}
      />
    );

    const line = screen.getByTestId("vd-storyboard-audio-direction-1");
    expect(line.textContent).toContain(
      "Door slams shut; distant rain patters against the window."
    );
  });

  it("omits the audio-direction line entirely when the clip never opted in", () => {
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

    expect(
      screen.queryByTestId("vd-storyboard-audio-direction-1")
    ).not.toBeInTheDocument();
  });
});
