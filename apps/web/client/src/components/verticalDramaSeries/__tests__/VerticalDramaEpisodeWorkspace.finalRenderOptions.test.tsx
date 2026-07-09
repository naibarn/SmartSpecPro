/**
 * Task #21 / W12.5 "Final Render Suite" phase B (2026-07-09) coverage for
 * `VerticalDramaEpisodeWorkspace.tsx`'s new dialogue-audio + subtitle
 * options section: flag/shot gating, the loudness sub-checkbox's
 * enabled-only-when-parent-checked rule, the `onChange` payload shape, and
 * the "last render result" summary (counts + excluded ad banner warnings).
 * Mirrors `VerticalDramaEpisodeWorkspace.adBannerPlan.test.tsx`'s
 * render/screen/fireEvent convention exactly.
 *
 * `@/components/ui/select` is mocked with a plain native `<select>` (same
 * "mock the Radix Select for deterministic jsdom interaction" convention as
 * `WorkStatusBridge.chain.test.tsx`), extended so `onValueChange` actually
 * fires on selection (that sibling file's own mock only renders labels, it
 * never wires interaction) — needed here since this section's tests assert
 * on the SELECTED value reaching `onChange`, not just that options render.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select
      data-testid="mock-select"
      value={value}
      disabled={disabled}
      onChange={e => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
}));

import { VerticalDramaEpisodeWorkspace } from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";

const baseEpisode = {
  id: "ep-1",
  episodeNumber: 1,
  title: "Episode 1",
  status: "in_progress",
};

const storyboardPanelWithOneShot = {
  storyboard: {
    shots: [
      { shot_number: 1, visual_description: "s1", characters: [] as string[] },
    ],
  },
};

describe("VerticalDramaEpisodeWorkspace — Final Render Suite options (task #21 phase B)", () => {
  it("renders nothing when there is no storyboard yet, even with the voice-chain flag on", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        voiceChainEnabled
      />
    );
    expect(
      screen.queryByTestId("vd-final-render-options-section")
    ).not.toBeInTheDocument();
  });

  it("subtitle preset picker always renders once a storyboard exists, even with voiceChainEnabled omitted", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    expect(
      screen.getByTestId("vd-final-render-options-section")
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-select")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-final-render-include-audio")
    ).not.toBeInTheDocument();
  });

  it("dialogue-audio checkbox (+ nested loudness sub-checkbox) only renders when voiceChainEnabled is true", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        voiceChainEnabled
      />
    );
    expect(
      screen.getByTestId("vd-final-render-include-audio")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-final-render-loudness-normalize")
    ).toBeInTheDocument();
  });

  it("the loudness sub-checkbox is disabled until the dialogue-audio checkbox is checked", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        voiceChainEnabled
        finalRenderOptionsPanel={{
          value: {
            includeDialogueAudio: false,
            loudnessNormalize: false,
            subtitlePreset: "classic_box",
          },
        }}
      />
    );
    expect(
      screen.getByTestId("vd-final-render-loudness-normalize")
    ).toBeDisabled();
  });

  it("the loudness sub-checkbox becomes enabled once the dialogue-audio checkbox is checked", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        voiceChainEnabled
        finalRenderOptionsPanel={{
          value: {
            includeDialogueAudio: true,
            loudnessNormalize: false,
            subtitlePreset: "classic_box",
          },
        }}
      />
    );
    expect(
      screen.getByTestId("vd-final-render-loudness-normalize")
    ).not.toBeDisabled();
  });

  it("defaults the subtitle preset to classic_box when no value prop is given", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    expect(screen.getByTestId("mock-select")).toHaveValue("classic_box");
  });

  describe("onChange payload shape (all 3 fields)", () => {
    it("checking the dialogue-audio checkbox calls onChange with includeDialogueAudio: true and the other 2 fields unchanged", () => {
      const onChange = vi.fn();
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          voiceChainEnabled
          finalRenderOptionsPanel={{
            value: {
              includeDialogueAudio: false,
              loudnessNormalize: false,
              subtitlePreset: "karaoke_word",
            },
            onChange,
          }}
        />
      );
      fireEvent.click(screen.getByTestId("vd-final-render-include-audio"));
      expect(onChange).toHaveBeenCalledWith({
        includeDialogueAudio: true,
        loudnessNormalize: false,
        subtitlePreset: "karaoke_word",
      });
    });

    it("checking the loudness checkbox calls onChange with loudnessNormalize: true and the other 2 fields unchanged", () => {
      const onChange = vi.fn();
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          voiceChainEnabled
          finalRenderOptionsPanel={{
            value: {
              includeDialogueAudio: true,
              loudnessNormalize: false,
              subtitlePreset: "classic_box",
            },
            onChange,
          }}
        />
      );
      fireEvent.click(
        screen.getByTestId("vd-final-render-loudness-normalize")
      );
      expect(onChange).toHaveBeenCalledWith({
        includeDialogueAudio: true,
        loudnessNormalize: true,
        subtitlePreset: "classic_box",
      });
    });

    it("selecting a subtitle preset calls onChange with the new subtitlePreset and the other 2 fields unchanged", () => {
      const onChange = vi.fn();
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          voiceChainEnabled
          finalRenderOptionsPanel={{
            value: {
              includeDialogueAudio: true,
              loudnessNormalize: true,
              subtitlePreset: "classic_box",
            },
            onChange,
          }}
        />
      );
      fireEvent.change(screen.getByTestId("mock-select"), {
        target: { value: "creator_pop" },
      });
      expect(onChange).toHaveBeenCalledWith({
        includeDialogueAudio: true,
        loudnessNormalize: true,
        subtitlePreset: "creator_pop",
      });
    });

    it("selecting 'no subtitles' sends the literal value \"none\" (not \"no_subtitle_style\")", () => {
      const onChange = vi.fn();
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          finalRenderOptionsPanel={{
            value: {
              includeDialogueAudio: false,
              loudnessNormalize: false,
              subtitlePreset: "classic_box",
            },
            onChange,
          }}
        />
      );
      fireEvent.change(screen.getByTestId("mock-select"), {
        target: { value: "none" },
      });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ subtitlePreset: "none" })
      );
    });
  });

  describe("last render result summary (counts + excluded ad banner warnings)", () => {
    it("renders no summary block when lastResult is absent", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
        />
      );
      expect(
        screen.queryByTestId("vd-final-render-result")
      ).not.toBeInTheDocument();
    });

    it("shows the subtitle-line and audio-segment counts", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          locale="th"
          finalRenderOptionsPanel={{
            lastResult: {
              dialogueAudioSegmentsIncluded: 4,
              subtitleLinesIncluded: 12,
            },
          }}
        />
      );
      expect(
        screen.getByTestId("vd-final-render-result-subtitle-lines")
      ).toHaveTextContent("12");
      expect(
        screen.getByTestId("vd-final-render-result-audio-segments")
      ).toHaveTextContent("4");
      expect(
        screen.queryByTestId("vd-final-render-excluded-banners")
      ).not.toBeInTheDocument();
    });

    it("lists excluded ad banners by resolved design label + short Thai reason for known codes", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          locale="th"
          adBannerOverlayEnabled
          adBannerPlanPanel={{
            designs: [
              {
                id: "banner-1",
                placementId: "bottom_band",
                status: "ready",
                imageUrl: "https://cdn.example.com/b1.png",
                label: "ลดพิเศษ 30%",
                defaultTiming: { mode: "entire" },
                excludedByApproval: false,
              },
            ],
          }}
          finalRenderOptionsPanel={{
            lastResult: {
              dialogueAudioSegmentsIncluded: 0,
              subtitleLinesIncluded: 0,
              excludedAdBanners: [
                {
                  bannerId: "banner-1",
                  code: "VD_EPISODE_AD_BANNER_APPROVAL_REQUIRED",
                },
              ],
            },
          }}
        />
      );
      const excluded = screen.getByTestId("vd-final-render-excluded-banners");
      expect(excluded).toHaveTextContent("ลดพิเศษ 30%");
      expect(excluded).toHaveTextContent("ต้องรออนุมัติก่อน");
    });

    it("falls back to the raw bannerId and a generic reason for an unresolved design / unknown code", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          locale="th"
          finalRenderOptionsPanel={{
            lastResult: {
              dialogueAudioSegmentsIncluded: 0,
              subtitleLinesIncluded: 0,
              excludedAdBanners: [
                { bannerId: "banner-missing", code: "SOME_FUTURE_CODE" },
              ],
            },
          }}
        />
      );
      const excluded = screen.getByTestId("vd-final-render-excluded-banners");
      expect(excluded).toHaveTextContent("banner-missing");
      expect(excluded).toHaveTextContent("ถูกข้ามจากการเรนเดอร์นี้");
    });
  });
});
