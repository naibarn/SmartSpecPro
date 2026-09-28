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
  // The section renders TWO selects (subtitle preset + subtitle font size), so
  // a single shared "mock-select" testid is ambiguous. Forward each
  // `SelectTrigger`'s own `data-testid` onto the native <select> instead, and
  // keep "mock-select" only as the fallback for triggers without one.
  Select: ({ value, onValueChange, disabled, children }: any) => {
    const kids: any[] = Array.isArray(children) ? children : [children];
    const trigger = kids.find(kid => kid?.props?.["data-testid"]);
    return (
      <select
        data-testid={trigger?.props?.["data-testid"] ?? "mock-select"}
        value={value}
        disabled={disabled}
        onChange={e => onValueChange?.(e.target.value)}
      >
        {children}
      </select>
    );
  },
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
  // The render-options section is rendered through
  // `VerticalDramaStoryboardPanel`'s `renderOptionsSlot`, and that slot lives
  // INSIDE the compiled-video card — which only renders when
  // `onAssembleCompiledVideo` is supplied (the options were deliberately moved
  // next to the button they configure). Without this, the whole section under
  // test is absent and every assertion below fails.
  onAssembleCompiledVideo: () => {},
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
    expect(screen.getByTestId("vd-final-render-subtitle-preset")).toBeInTheDocument();
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
    expect(screen.getByTestId("vd-final-render-subtitle-preset")).toHaveValue("classic_box");
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
      // `objectContaining` (same convention as the "none" case below): the
      // section deliberately re-emits a FULLY populated value, so newer
      // options (subtitleFontSize/showAgeBadge/renderEngine) ride along. The
      // named fields are still asserted unchanged.
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          includeDialogueAudio: true,
          loudnessNormalize: false,
          subtitlePreset: "karaoke_word",
        })
      );
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
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          includeDialogueAudio: true,
          loudnessNormalize: true,
          subtitlePreset: "classic_box",
        })
      );
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
      fireEvent.change(screen.getByTestId("vd-final-render-subtitle-preset"), {
        target: { value: "creator_pop" },
      });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          includeDialogueAudio: true,
          loudnessNormalize: true,
          subtitlePreset: "creator_pop",
        })
      );
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
      fireEvent.change(screen.getByTestId("vd-final-render-subtitle-preset"), {
        target: { value: "none" },
      });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ subtitlePreset: "none" })
      );
    });
  });

  describe("Remotion render toggle (planning/vd-remotion-render-option/plan.md wave 2)", () => {
    it("defaults to unchecked (ffmpeg) when no value prop is given", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
        />
      );
      expect(
        screen.getByTestId("vd-final-render-use-remotion")
      ).not.toBeChecked();
    });

    it("checking the toggle calls onChange with renderEngine: 'remotion_queue', other fields unchanged", () => {
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
              subtitleFontSize: "medium",
              showAgeBadge: false,
              renderEngine: "ffmpeg",
            },
            onChange,
          }}
        />
      );
      fireEvent.click(screen.getByTestId("vd-final-render-use-remotion"));
      expect(onChange).toHaveBeenCalledWith({
        includeDialogueAudio: false,
        loudnessNormalize: false,
        subtitlePreset: "classic_box",
        subtitleFontSize: "medium",
        showAgeBadge: false,
        renderEngine: "remotion_queue",
      });
    });

    // Unchecking no longer emits directly: server-side ffmpeg is resource-heavy,
    // so it now requires an explicit confirmation first (user policy
    // 2026-07-31). The click only OPENS the dialog; the accept button emits.
    it("unchecking the toggle calls onChange with renderEngine: 'ffmpeg' only after confirmation", async () => {
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
              subtitleFontSize: "medium",
              showAgeBadge: false,
              renderEngine: "remotion_queue",
            },
            onChange,
          }}
        />
      );
      fireEvent.click(screen.getByTestId("vd-final-render-use-remotion"));
      expect(onChange).not.toHaveBeenCalled();

      fireEvent.click(await screen.findByTestId("vd-ffmpeg-confirm-accept"));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ renderEngine: "ffmpeg" })
      );
    });

    it("greys out the subtitle font-size select and shows the limitation hint when the toggle is on", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          finalRenderOptionsPanel={{
            value: {
              includeDialogueAudio: false,
              loudnessNormalize: false,
              subtitlePreset: "classic_box",
              subtitleFontSize: "medium",
              showAgeBadge: false,
              renderEngine: "remotion_queue",
            },
          }}
        />
      );
      expect(
        screen.getByTestId("vd-final-render-subtitle-font-size-remotion-hint")
      ).toBeInTheDocument();
    });

    it("does not show the limitation hint when the toggle is off", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
        />
      );
      expect(
        screen.queryByTestId("vd-final-render-subtitle-font-size-remotion-hint")
      ).not.toBeInTheDocument();
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

    it("shows the Remotion fallback reason when present on lastResult", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          locale="th"
          finalRenderOptionsPanel={{
            lastResult: {
              dialogueAudioSegmentsIncluded: 0,
              subtitleLinesIncluded: 0,
              renderEngineFallbackReason: "queue unavailable",
            },
          }}
        />
      );
      const fallback = screen.getByTestId(
        "vd-final-render-engine-fallback-reason"
      );
      expect(fallback).toHaveTextContent("queue unavailable");
      expect(fallback).toHaveTextContent("Remotion");
    });

    it("renders no fallback reason block when absent", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          finalRenderOptionsPanel={{
            lastResult: {
              dialogueAudioSegmentsIncluded: 0,
              subtitleLinesIncluded: 0,
            },
          }}
        />
      );
      expect(
        screen.queryByTestId("vd-final-render-engine-fallback-reason")
      ).not.toBeInTheDocument();
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

  /**
   * Field incident 2026-08-01 (series 21 / episode 124): the user picked the
   * "creator" subtitle preset, the render succeeded, and the video came out
   * with no captions at all — because subtitle lines are built ONLY from
   * `dialogueAudioPlan.dialogueLines`, which that episode never had. Nothing
   * on screen said so.
   */
  describe("no-dialogue subtitle warning", () => {
    const warningTestId = "vd-final-render-subtitle-no-dialogue-warning";

    it("warns when a real preset is selected but the episode has no dialogue lines", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          locale="th"
          finalRenderOptionsPanel={{
            value: {
              includeDialogueAudio: false,
              loudnessNormalize: false,
              subtitlePreset: "classic_box",
            },
            subtitleSourceLineCount: 0,
          }}
        />
      );
      expect(screen.getByTestId(warningTestId)).toHaveTextContent(
        "ยังไม่มีบทพูด"
      );
      // The picker stays usable — the preset is still worth saving.
      expect(screen.getByTestId("vd-final-render-subtitle-preset")).not.toBeDisabled();
    });

    it("stays silent once the episode has dialogue lines", () => {
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
            subtitleSourceLineCount: 12,
          }}
        />
      );
      expect(screen.queryByTestId(warningTestId)).not.toBeInTheDocument();
    });

    it("stays silent when subtitles are turned off entirely", () => {
      render(
        <VerticalDramaEpisodeWorkspace
          episode={baseEpisode}
          storyboardPanel={storyboardPanelWithOneShot}
          finalRenderOptionsPanel={{
            value: {
              includeDialogueAudio: false,
              loudnessNormalize: false,
              subtitlePreset: "none",
            },
            subtitleSourceLineCount: 0,
          }}
        />
      );
      expect(screen.queryByTestId(warningTestId)).not.toBeInTheDocument();
    });

    it("stays silent while the episode is still loading (count omitted)", () => {
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
          }}
        />
      );
      expect(screen.queryByTestId(warningTestId)).not.toBeInTheDocument();
    });
  });
});
