/**
 * Text Overlay Suite (F131AB, task #34, plan.md v2) section coverage for
 * `VerticalDramaEpisodeWorkspace.tsx`: flag/shot gating, per-kind toggles,
 * auto-fill/revert editors for end card + opener recap, title-bumper/episode-
 * indicator previews, character-intro read-only list, mid-episode card list
 * editor, the rendered-text preview block, and the save payload shape.
 * Mirrors `VerticalDramaEpisodeWorkspace.adBannerPlan.test.tsx`'s
 * render/screen/fireEvent convention exactly.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VerticalDramaEpisodeWorkspace,
  type VerticalDramaTextOverlayPreviewView,
} from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";

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

const previewFixture: VerticalDramaTextOverlayPreviewView = {
  endCard: { text: "ปมค้างจากเรื่อง", source: "cliffhanger" },
  openerRecap: { text: "", source: "none" },
  titleBumper: { primary: "รักนี้ต้องลุ้น", secondary: "SUB-EP 1" },
  episodeIndicator: { label: "SUB-EP 1/10" },
  characterIntroCards: [
    { characterKey: "char-a", shotNumber: 1, name: "มาลี", role: "นางเอก" },
  ],
};

describe("VerticalDramaEpisodeWorkspace — Text Overlay Suite section (F131AB, task #34)", () => {
  it("renders nothing when textOverlaySuiteEnabled is false, even with a storyboard", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled={false}
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    expect(
      screen.queryByTestId("vd-text-overlay-section")
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is no storyboard yet, even with the flag on", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    expect(
      screen.queryByTestId("vd-text-overlay-section")
    ).not.toBeInTheDocument();
  });

  it("renders the section once both the flag is on and a storyboard exists", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    const section = screen.getByTestId("vd-text-overlay-section");
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent("Text overlays");
  });

  it("renders in Thai locale", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        locale="th"
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    expect(screen.getByTestId("vd-text-overlay-section")).toHaveTextContent(
      "ข้อความบนวิดีโอ"
    );
  });

  it("end card: toggling on reveals the editor with the auto-derived source badge and placeholder", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        locale="th"
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-text-overlay-end-card-toggle"));
    expect(screen.getByTestId("vd-text-overlay-end-card-text")).toHaveAttribute(
      "placeholder",
      "ปมค้างจากเรื่อง"
    );
    expect(screen.getByTestId("vd-text-overlay-end-card")).toHaveTextContent(
      "จากปมค้างท้ายตอน"
    );
  });

  it("end card: auto-fill copies the preview text into the editable field, then a revert button clears it back to auto", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-text-overlay-end-card-toggle"));
    fireEvent.click(screen.getByTestId("vd-text-overlay-end-card-autofill"));
    const textarea = screen.getByTestId(
      "vd-text-overlay-end-card-text"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("ปมค้างจากเรื่อง");
    expect(
      screen.getByTestId("vd-text-overlay-end-card-revert")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-text-overlay-end-card-revert"));
    expect(
      (
        screen.getByTestId(
          "vd-text-overlay-end-card-text"
        ) as HTMLTextAreaElement
      ).value
    ).toBe("");
    expect(
      screen.getByTestId("vd-text-overlay-end-card-autofill")
    ).toBeInTheDocument();
  });

  it("end card: typing directly switches the source badge to manual", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-text-overlay-end-card-toggle"));
    fireEvent.change(screen.getByTestId("vd-text-overlay-end-card-text"), {
      target: { value: "ข้อความที่พิมพ์เอง" },
    });
    expect(screen.getByTestId("vd-text-overlay-end-card")).toHaveTextContent(
      "Manual"
    );
  });

  it("end card: pre-populates the editor from an existing manual plan", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{
          plan: {
            endCard: {
              enabled: true,
              text: "ข้อความที่บันทึกไว้",
              source: "manual",
              durationSec: 4,
              showFollowLine: false,
              styleVariant: "lower_band",
            },
          },
          preview: previewFixture,
        }}
      />
    );
    expect(
      (
        screen.getByTestId(
          "vd-text-overlay-end-card-text"
        ) as HTMLTextAreaElement
      ).value
    ).toBe("ข้อความที่บันทึกไว้");
    expect(
      (
        screen.getByTestId(
          "vd-text-overlay-end-card-duration"
        ) as HTMLInputElement
      ).value
    ).toBe("4");
    expect(
      screen.getByTestId("vd-text-overlay-end-card-follow-line")
    ).toHaveAttribute("data-state", "unchecked");
  });

  it("opener recap: episode 1's preview source is none, and the section still renders the editor when toggled on", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-text-overlay-opener-recap-toggle"));
    expect(
      screen.getByTestId("vd-text-overlay-opener-recap")
    ).toHaveTextContent("None (Sub-episode 1 has no recap)");
  });

  it("title bumper: shows a live preview combining the series title with the manual override text", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-text-overlay-title-bumper-toggle"));
    expect(
      screen.getByTestId("vd-text-overlay-title-bumper")
    ).toHaveTextContent("Preview: รักนี้ต้องลุ้น / SUB-EP 1");

    fireEvent.change(screen.getByTestId("vd-text-overlay-title-bumper-text"), {
      target: { value: "ตอนพิเศษ" },
    });
    expect(
      screen.getByTestId("vd-text-overlay-title-bumper")
    ).toHaveTextContent("Preview: รักนี้ต้องลุ้น / ตอนพิเศษ");
  });

  it("episode indicator: shows the derived Sub-episode N/total preview label", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    fireEvent.click(
      screen.getByTestId("vd-text-overlay-episode-indicator-toggle")
    );
    expect(
      screen.getByTestId("vd-text-overlay-episode-indicator")
    ).toHaveTextContent("Preview: SUB-EP 1/10");
  });

  it("character intro: lists every preview character with name/role/shot once toggled on", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    fireEvent.click(
      screen.getByTestId("vd-text-overlay-character-intro-toggle")
    );
    expect(
      screen.getByTestId("vd-text-overlay-character-intro")
    ).toHaveTextContent("มาลี");
    expect(
      screen.getByTestId("vd-text-overlay-character-intro")
    ).toHaveTextContent("นางเอก");
  });

  it("character intro: shows the empty-state hint when the preview has no characters yet", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{
          plan: null,
          preview: { ...previewFixture, characterIntroCards: [] },
        }}
      />
    );
    fireEvent.click(
      screen.getByTestId("vd-text-overlay-character-intro-toggle")
    );
    expect(
      screen.getByText(/No characters found in any shot yet/)
    ).toBeInTheDocument();
  });

  it("mid-episode cards: starts empty, add creates a row, remove deletes it", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayShotNumbers={[1, 2, 3]}
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    expect(screen.getByText(/No mid-episode cards yet/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-text-overlay-card-add"));
    const cardRows = screen.getAllByTestId(/^vd-text-overlay-card-text-/);
    expect(cardRows).toHaveLength(1);

    const removeButtons = screen.getAllByTestId(
      /^vd-text-overlay-card-remove-/
    );
    fireEvent.click(removeButtons[0]!);
    expect(screen.getByText(/No mid-episode cards yet/)).toBeInTheDocument();
  });

  it("mid-episode cards: editing text updates the live preview block", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        locale="th"
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayShotNumbers={[1]}
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-text-overlay-card-add"));
    const textInput = screen.getAllByTestId(/^vd-text-overlay-card-text-/)[0]!;
    fireEvent.change(textInput, { target: { value: "ปี 1980" } });
    expect(screen.getByTestId("vd-text-overlay-preview")).toHaveTextContent(
      "ปี 1980"
    );
  });

  it("preview block shows the empty state when nothing is enabled", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture }}
      />
    );
    expect(screen.getByTestId("vd-text-overlay-preview")).toHaveTextContent(
      "No text overlays are enabled yet"
    );
  });

  it("save button calls onSave with the current draft plan", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{ plan: null, preview: previewFixture, onSave }}
      />
    );
    fireEvent.click(
      screen.getByTestId("vd-text-overlay-episode-indicator-toggle")
    );
    fireEvent.click(screen.getByTestId("vd-text-overlay-save"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeIndicator: { enabled: true, position: "top_right" },
      })
    );
  });

  it("shows the save error message when the panel provides one", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{
          plan: null,
          preview: previewFixture,
          error: "VD_TEXT_OVERLAY_END_CARD_DURATION_OUT_OF_RANGE: bad duration",
        }}
      />
    );
    expect(screen.getByTestId("vd-text-overlay-save-error")).toHaveTextContent(
      "VD_TEXT_OVERLAY_END_CARD_DURATION_OUT_OF_RANGE"
    );
  });

  it("disables the save button while saving", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        textOverlaySuiteEnabled
        textOverlayPlanPanel={{
          plan: null,
          preview: previewFixture,
          saving: true,
        }}
      />
    );
    expect(screen.getByTestId("vd-text-overlay-save")).toBeDisabled();
  });
});
