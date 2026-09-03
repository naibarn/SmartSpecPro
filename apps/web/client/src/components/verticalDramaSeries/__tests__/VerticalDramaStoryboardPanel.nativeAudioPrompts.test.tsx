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

  it("renders the toggle, checked by default, plus the helper hint, when wired and the selected model supports native audio", async () => {
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

    // `HermesConnectionPicker`/`ModelSelectorDialog` (elsewhere in this
    // panel's tree) call `useScopedTranslation` -> `react-i18next`'s
    // `useTranslation`, which suspends on namespace load in jsdom with no
    // local `<Suspense>` boundary — same fix as the sibling
    // `VerticalDramaStoryboardPanel.modelFamilyBadge.test.tsx` suite: await
    // the first query so the commit lands before asserting.
    expect(
      await screen.findByTestId("vd-storyboard-native-audio-toggle")
    ).toBeInTheDocument();
    const toggle = screen.getByTestId("vd-storyboard-native-audio-switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByTestId("vd-storyboard-native-audio-hint")
    ).toBeInTheDocument();
  });

  it("calls onSelectNativeAudioEnabled with the new value when the switch is clicked", async () => {
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

    fireEvent.click(
      await screen.findByTestId("vd-storyboard-native-audio-switch")
    );
    expect(onSelectNativeAudioEnabled).toHaveBeenCalledWith(false);
  });

  it("reflects nativeAudioEnabled: false as an unchecked switch", async () => {
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
      (
        await screen.findByTestId("vd-storyboard-native-audio-switch")
      ).getAttribute("aria-checked")
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

  it("toggles the 3-stem audio inspector when audio inspector button is clicked", () => {
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

    const openBtn = screen.getByTestId("vd-storyboard-open-audio-inspector-1");
    expect(openBtn.textContent).toContain("สตูดิโอมิกซ์");
    expect(screen.queryByTestId("vd-storyboard-audio-inspector-container-1")).not.toBeInTheDocument();

    fireEvent.click(openBtn);
    expect(screen.getByTestId("vd-storyboard-audio-inspector-container-1")).toBeInTheDocument();
    expect(openBtn.textContent).toContain("ปิดสตูดิโอมิกซ์");

    fireEvent.click(openBtn);
    expect(screen.queryByTestId("vd-storyboard-audio-inspector-container-1")).not.toBeInTheDocument();
  });

  it("invokes onTriggerSurgicalAudioRepair and onRollbackAudioTake and onUpdateShotAudioMixDeltas when user interacts", () => {
    const onTriggerSurgicalAudioRepair = vi.fn();
    const onRollbackAudioTake = vi.fn();
    const onUpdateShotAudioMixDeltas = vi.fn();

    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [VEO_MODEL_WITH_NATIVE_AUDIO],
          selectedVideoModelId: VEO_MODEL_WITH_NATIVE_AUDIO.id,
          nativeAudioEnabled: true,
          onTriggerSurgicalAudioRepair,
          onRollbackAudioTake,
          onUpdateShotAudioMixDeltas,
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

    // Open inspector
    fireEvent.click(screen.getByTestId("vd-storyboard-open-audio-inspector-1"));
    expect(screen.getByTestId("vd-storyboard-audio-inspector-container-1")).toBeInTheDocument();

    // Trigger repair
    const repairBtn = screen.getByTestId("vd-audio-trigger-repair-btn");
    fireEvent.click(repairBtn);
    expect(onTriggerSurgicalAudioRepair).toHaveBeenCalledWith(1);

    // Reset faders (triggers onUpdateShotAudioMixDeltas)
    const resetBtn = screen.getByTestId("vd-audio-reset-faders-btn");
    fireEvent.click(resetBtn);
    expect(onUpdateShotAudioMixDeltas).toHaveBeenCalledWith(1, { dialogueDb: 0, foleyDb: -2, ambienceDb: -6 });
  });
});
