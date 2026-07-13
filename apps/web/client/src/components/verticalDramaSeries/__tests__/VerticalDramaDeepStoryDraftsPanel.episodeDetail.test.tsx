import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Manual dialogue edits (W10.5, added 2026-07-08) — `VerticalDramaDeepStoryDraftEpisodeDetail`
 * now calls `trpc.useUtils()`/`trpc.verticalDramaSeries.updateEpisodeDraftDialogue.useMutation()`
 * UNCONDITIONALLY (before its `!shotDrafts` early return — React's rules of
 * hooks), so every test in this file needs `@/lib/trpc`/`sonner` mocked, even
 * the pre-existing read-only tests that never touch the editor. Mirrors
 * `VerticalDramaDeepStoryDraftsPanel.actions.test.tsx`'s own mock shape.
 */
const mockInvalidateSeriesGet = vi.fn();
const mockEditMutate = vi.fn();
let editShouldFail = false;
let editErrorMessage: string | undefined = "edit boom";
let editIsPending = false;
let editResult: {
  silenceIntentRemoved: boolean;
  speakabilityWarnings: Array<{
    lineIndex: number;
    violations: Array<{ kind: string; found: string }>;
    cleanedSuggestion: { speaker?: string; line: string; delivery?: string };
  }>;
} = { silenceIntentRemoved: false, speakabilityWarnings: [] };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: { get: { invalidate: mockInvalidateSeriesGet } },
    }),
    verticalDramaSeries: {
      updateEpisodeDraftDialogue: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, variables: unknown) => void;
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            mockEditMutate(input);
            if (editShouldFail) opts?.onError?.({ message: editErrorMessage });
            else opts?.onSuccess?.(editResult, input);
          },
          isPending: editIsPending,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import { VerticalDramaDeepStoryDraftEpisodeDetail } from "@/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel";
import { manualDialogueEditViolationCopy } from "@/components/verticalDramaSeries/verticalDramaCopy";
import {
  estimateVerticalDramaSpeechSeconds,
  targetVerticalDramaSpeechSeconds,
} from "@shared/verticalDramaSeries/dialogueQuality";

function shot(shotNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    shot_number: shotNumber,
    summary: `Shot ${shotNumber} summary`,
    dialogue_lines: [{ speaker: "นางเอก", line: `Line for shot ${shotNumber}` }],
    ...overrides,
  };
}

function nineShots(overrides: (shotNumber: number) => Record<string, unknown> = () => ({})) {
  return Array.from({ length: 9 }, (_, i) => shot(i + 1, overrides(i + 1)));
}

function fullScorecard(overrides: Record<string, number> = {}) {
  return {
    hook_strength: 5,
    reversal_sharpness: 5,
    emotion_variety: 5,
    dialogue_naturalness: 5,
    pacing: 5,
    cliffhanger_strength: 5,
    continuity_with_recap: 5,
    season_cohesion: 5,
    overall: 5,
    judgedAtRound: 0,
    ...overrides,
  };
}

describe("VerticalDramaDeepStoryDraftEpisodeDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editShouldFail = false;
    editErrorMessage = "edit boom";
    editIsPending = false;
    editResult = { silenceIntentRemoved: false, speakabilityWarnings: [] };
  });

  it("renders nothing when item is undefined (episode outside the drafted horizon)", () => {
    const { container } = render(
      <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={4} item={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when item has no shotDrafts", () => {
    const { container } = render(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={4}
        item={{ episodeNumber: 4, workingTitle: "T", logline: "L", keyBeats: ["b"] }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the shot-viewer toggle and cliffhanger line when shotDrafts is present", () => {
    render(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={1}
        item={
          {
            episodeNumber: 1,
            workingTitle: "T",
            logline: "L",
            keyBeats: ["b"],
            shotDrafts: nineShots(),
            cliffhanger_line: "ประตูเปิดออกช้าๆ",
          } as never
        }
      />,
    );
    expect(screen.getByText("ดูร่าง 9 ช็อต + บทพูด")).toBeInTheDocument();
    expect(screen.getByText("จุดค้าง: ประตูเปิดออกช้าๆ")).toBeInTheDocument();
  });

  it("expands to show every shot's 'ช็อต N — summary' line and 'speaker: line' dialogue", () => {
    render(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={2}
        item={{ episodeNumber: 2, workingTitle: "T", logline: "L", keyBeats: ["b"], shotDrafts: nineShots() } as never}
      />,
    );
    // <details> content is present in the DOM regardless of open state.
    expect(screen.getByText("ช็อต 1 — Shot 1 summary")).toBeInTheDocument();
    expect(screen.getByText("นางเอก: Line for shot 1")).toBeInTheDocument();
    expect(screen.getByText("ช็อต 9 — Shot 9 summary")).toBeInTheDocument();
  });

  it("shows the silence_intent label instead of dialogue when a shot has no lines", () => {
    render(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={3}
        item={
          {
            episodeNumber: 3,
            workingTitle: "T",
            logline: "L",
            keyBeats: ["b"],
            shotDrafts: nineShots((n) =>
              n === 5 ? { dialogue_lines: [], silence_intent: "establishing" } : {},
            ),
          } as never
        }
      />,
    );
    expect(screen.getByText(/ช็อตปูฉาก/)).toBeInTheDocument();
  });

  it("renders only the ✓ badges whose completeness flag is true (never a false-negative badge)", () => {
    render(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={1}
        item={
          {
            episodeNumber: 1,
            workingTitle: "T",
            logline: "L",
            keyBeats: ["b"],
            shotDrafts: nineShots(),
            draftCompleteness: {
              dialogueEveryShot: true,
              allSpeakable: false,
              estimatedSpeechSeconds: 38,
              coverageStatus: "ok",
            },
          } as never
        }
      />,
    );
    expect(screen.getByText("✓ บทพูดครบทุกช็อต")).toBeInTheDocument();
    expect(screen.queryByText("✓ อ่านออกเสียงได้")).not.toBeInTheDocument();
  });

  it("shows the coverage badge text+status for each of the 3 coverageStatus values (never color-only)", () => {
    const base = { episodeNumber: 1, workingTitle: "T", logline: "L", keyBeats: ["b"], shotDrafts: nineShots() };

    const { rerender } = render(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={1}
        item={
          {
            ...base,
            draftCompleteness: { dialogueEveryShot: false, allSpeakable: false, estimatedSpeechSeconds: 40, coverageStatus: "ok" },
          } as never
        }
      />,
    );
    expect(screen.getByText(/บทพูดรวม 40 วิ/)).toBeInTheDocument();
    expect(screen.getByText(/ครอบคลุมตามเป้า/)).toBeInTheDocument();

    rerender(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={1}
        item={
          {
            ...base,
            draftCompleteness: { dialogueEveryShot: false, allSpeakable: false, estimatedSpeechSeconds: 20, coverageStatus: "warning" },
          } as never
        }
      />,
    );
    expect(screen.getByText(/ครอบคลุมต่ำกว่าเป้า$/)).toBeInTheDocument();

    rerender(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={1}
        item={
          {
            ...base,
            draftCompleteness: { dialogueEveryShot: false, allSpeakable: false, estimatedSpeechSeconds: 5, coverageStatus: "error" },
          } as never
        }
      />,
    );
    expect(screen.getByText(/ครอบคลุมต่ำกว่าเป้ามาก/)).toBeInTheDocument();
  });

  it("keyboard-toggles the native <details> disclosure (family convention)", () => {
    render(
      <VerticalDramaDeepStoryDraftEpisodeDetail
        lang="th"
        seriesId="10"
        episodeNumber={1}
        item={{ episodeNumber: 1, workingTitle: "T", logline: "L", keyBeats: ["b"], shotDrafts: nineShots() } as never}
      />,
    );
    const details = screen.getByTestId("vd-deep-story-draft-shot-viewer-1") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("ดูร่าง 9 ช็อต + บทพูด"));
    expect(details.open).toBe(true);
  });

  /**
   * Premium multi-round drafts (W11-B) — scorecard header badge + expandable
   * below-floor dimension rows. Additive: `draftScorecard` is only ever
   * present when the active version's deep draft used `mode: "premium"`
   * (W11-A) — every case here must stay feature-detected (absent field ->
   * identical markup to before W11-B).
   */
  describe("premium draft scorecard (W11-B)", () => {
    it("renders no scorecard badge when draftScorecard is absent (feature-detect, byte-identical)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={
            { episodeNumber: 1, workingTitle: "T", logline: "L", keyBeats: ["b"], shotDrafts: nineShots() } as never
          }
        />,
      );
      expect(screen.queryByTestId("vd-deep-story-draft-scorecard-1")).not.toBeInTheDocument();
      expect(screen.queryByText(/คะแนน/)).not.toBeInTheDocument();
    });

    it("renders the 'คะแนน {overall}/5' header badge when draftScorecard is present", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={
            {
              episodeNumber: 1,
              workingTitle: "T",
              logline: "L",
              keyBeats: ["b"],
              shotDrafts: nineShots(),
              draftScorecard: fullScorecard({ overall: 4 }),
            } as never
          }
        />,
      );
      expect(screen.getByTestId("vd-deep-story-draft-scorecard-badge-1")).toHaveTextContent("คะแนน 4/5");
    });

    it("colors the badge emerald (text-emerald-600) when overall >= 4", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={
            {
              episodeNumber: 1,
              workingTitle: "T",
              logline: "L",
              keyBeats: ["b"],
              shotDrafts: nineShots(),
              draftScorecard: fullScorecard({ overall: 4 }),
            } as never
          }
        />,
      );
      expect(screen.getByTestId("vd-deep-story-draft-scorecard-badge-1")).toHaveClass("text-emerald-600");
    });

    it("colors the badge amber (text-amber-700) when overall is 3-3.9", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={
            {
              episodeNumber: 1,
              workingTitle: "T",
              logline: "L",
              keyBeats: ["b"],
              shotDrafts: nineShots(),
              draftScorecard: fullScorecard({ overall: 3.5 }),
            } as never
          }
        />,
      );
      const badge = screen.getByTestId("vd-deep-story-draft-scorecard-badge-1");
      expect(badge).toHaveClass("text-amber-700");
      expect(badge).toHaveTextContent("คะแนน 3.5/5");
    });

    it("colors the badge destructive (text-destructive) when overall < 3", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={
            {
              episodeNumber: 1,
              workingTitle: "T",
              logline: "L",
              keyBeats: ["b"],
              shotDrafts: nineShots(),
              draftScorecard: fullScorecard({ overall: 2 }),
            } as never
          }
        />,
      );
      expect(screen.getByTestId("vd-deep-story-draft-scorecard-badge-1")).toHaveClass("text-destructive");
    });

    it("renders no below-floor toggle when every dimension meets the floor", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={
            {
              episodeNumber: 1,
              workingTitle: "T",
              logline: "L",
              keyBeats: ["b"],
              shotDrafts: nineShots(),
              draftScorecard: fullScorecard(),
            } as never
          }
        />,
      );
      expect(screen.queryByTestId("vd-deep-story-draft-scorecard-below-floor-1")).not.toBeInTheDocument();
    });

    it("renders one row per below-floor dimension, formatted 'จุดที่ยังต่ำ: {label} {score}/5', and omits dims at/above the floor", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={
            {
              episodeNumber: 1,
              workingTitle: "T",
              logline: "L",
              keyBeats: ["b"],
              shotDrafts: nineShots(),
              draftScorecard: fullScorecard({ pacing: 2, hook_strength: 3 }),
            } as never
          }
        />,
      );
      expect(screen.getByTestId("vd-deep-story-draft-scorecard-dim-1-pacing")).toHaveTextContent(
        "จุดที่ยังต่ำ: จังหวะเรื่อง 2/5",
      );
      expect(screen.queryByTestId("vd-deep-story-draft-scorecard-dim-1-hook_strength")).not.toBeInTheDocument();
    });

    it("keyboard-toggles the below-floor <details> disclosure (family convention)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={
            {
              episodeNumber: 1,
              workingTitle: "T",
              logline: "L",
              keyBeats: ["b"],
              shotDrafts: nineShots(),
              draftScorecard: fullScorecard({ pacing: 2 }),
            } as never
          }
        />,
      );
      const details = screen.getByTestId(
        "vd-deep-story-draft-scorecard-below-floor-1",
      ) as HTMLDetailsElement;
      expect(details.open).toBe(false);
      fireEvent.click(screen.getByText("จุดที่ยังต่ำกว่าเกณฑ์"));
      expect(details.open).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Manual dialogue edits (W10.5) — inline per-shot editor                     */
  /* -------------------------------------------------------------------------- */

  function itemFixture(overrides: Record<string, unknown> = {}) {
    return {
      episodeNumber: 1,
      workingTitle: "T",
      logline: "L",
      keyBeats: ["b"],
      shotDrafts: nineShots(),
      ...overrides,
    } as never;
  }

  function openEditor(shotNumber = 1) {
    fireEvent.click(screen.getByTestId(`vd-deep-story-draft-edit-cta-1-${shotNumber}`));
  }

  describe("edit affordance visibility", () => {
    it("shows a 'แก้บทพูด' edit button for every shot by default (readOnly omitted)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      expect(screen.getByTestId("vd-deep-story-draft-edit-cta-1-1")).toHaveTextContent("แก้บทพูด");
      expect(screen.getByTestId("vd-deep-story-draft-edit-cta-1-9")).toBeInTheDocument();
    });

    it("hides every edit button when readOnly is true", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture()}
          readOnly
        />,
      );
      expect(screen.queryByTestId("vd-deep-story-draft-edit-cta-1-1")).not.toBeInTheDocument();
    });
  });

  describe("opening the editor", () => {
    it("replaces the read-only dialogue view with the edit form, seeded from the shot's existing lines", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      expect(screen.getByTestId("vd-deep-story-draft-edit-form-1-1")).toBeInTheDocument();
      expect(screen.queryByText("นางเอก: Line for shot 1")).not.toBeInTheDocument();

      const row = screen.getByTestId("vd-deep-story-draft-edit-line-1-1-0");
      expect(within(row).getByTestId("vd-deep-story-draft-edit-speaker-1-1-0")).toHaveValue("นางเอก");
      expect(within(row).getByTestId("vd-deep-story-draft-edit-line-input-1-1-0")).toHaveValue(
        "Line for shot 1",
      );
    });

    it("seeds an empty editor (no rows) for a silent shot with zero dialogue_lines", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            shotDrafts: nineShots((n) => (n === 1 ? { dialogue_lines: [], silence_intent: "establishing" } : {})),
          })}
        />,
      );
      openEditor(1);
      expect(screen.queryByTestId("vd-deep-story-draft-edit-line-1-1-0")).not.toBeInTheDocument();
    });

    it("every input has an accessible label, scoped per line via a 'บรรทัดที่ N' group", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      const group = screen.getByRole("group", { name: "บรรทัดที่ 1" });
      expect(within(group).getByLabelText("ผู้พูด (ถ้ามี)")).toBeInTheDocument();
      expect(within(group).getByLabelText("บทพูด")).toBeInTheDocument();
      expect(within(group).getByLabelText("อารมณ์/วิธีพูด")).toBeInTheDocument();
      expect(within(group).getByLabelText("ลบบรรทัดนี้")).toBeInTheDocument();
    });

    it("ยกเลิก (cancel) closes the editor and discards in-progress edits", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.change(screen.getByTestId("vd-deep-story-draft-edit-line-input-1-1-0"), {
        target: { value: "แก้ไขแล้วแต่ยังไม่บันทึก" },
      });
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-cancel-1-1"));

      expect(screen.queryByTestId("vd-deep-story-draft-edit-form-1-1")).not.toBeInTheDocument();
      expect(screen.getByText("นางเอก: Line for shot 1")).toBeInTheDocument();
      expect(mockEditMutate).not.toHaveBeenCalled();

      // Re-opening seeds fresh from the (unsaved) shot again, not the discarded draft.
      openEditor(1);
      expect(screen.getByTestId("vd-deep-story-draft-edit-line-input-1-1-0")).toHaveValue("Line for shot 1");
    });
  });

  describe("adding/removing lines", () => {
    it("เพิ่มบรรทัด appends one new, empty row", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-add-line-1-1"));
      const newRow = screen.getByTestId("vd-deep-story-draft-edit-line-1-1-1");
      expect(within(newRow).getByTestId("vd-deep-story-draft-edit-line-input-1-1-1")).toHaveValue("");
    });

    it("caps at 8 lines — the add button disables and a hint appears at the max", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      const addButton = screen.getByTestId("vd-deep-story-draft-edit-add-line-1-1");
      // Starts with 1 seeded line; 7 more clicks reach the 8-line cap.
      for (let i = 0; i < 7; i += 1) fireEvent.click(addButton);
      expect(screen.getByTestId("vd-deep-story-draft-edit-line-1-1-7")).toBeInTheDocument();
      expect(addButton).toBeDisabled();
      expect(screen.getByText("ถึงจำนวนบรรทัดสูงสุดแล้ว (8 บรรทัด)")).toBeInTheDocument();

      // One more click is a no-op (already at the cap).
      fireEvent.click(addButton);
      expect(screen.queryByTestId("vd-deep-story-draft-edit-line-1-1-8")).not.toBeInTheDocument();
    });

    it("removes the targeted row when its remove button is clicked", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            shotDrafts: nineShots((n) =>
              n === 1
                ? {
                    dialogue_lines: [
                      { speaker: "A", line: "First line here" },
                      { speaker: "B", line: "Second line here" },
                    ],
                  }
                : {},
            ),
          })}
        />,
      );
      openEditor(1);
      expect(screen.getByTestId("vd-deep-story-draft-edit-line-input-1-1-1")).toHaveValue("Second line here");
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-remove-line-1-1-0"));
      expect(screen.queryByTestId("vd-deep-story-draft-edit-line-1-1-1")).not.toBeInTheDocument();
      expect(screen.getByTestId("vd-deep-story-draft-edit-line-input-1-1-0")).toHaveValue("Second line here");
    });

    it("removing every line leaves a valid, save-able empty editor (0 lines is allowed)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-remove-line-1-1-0"));
      expect(screen.queryByTestId("vd-deep-story-draft-edit-line-1-1-0")).not.toBeInTheDocument();
      expect(screen.getByTestId("vd-deep-story-draft-edit-save-1-1")).not.toBeDisabled();
    });
  });

  describe("live per-line speakability validation", () => {
    it("shows no violation hint for a clean line", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      expect(screen.queryByTestId("vd-deep-story-draft-edit-violation-1-1-0")).not.toBeInTheDocument();
    });

    it("flags a wrapping-quotes line with its Thai reason + an 'ใช้เวอร์ชันที่แก้ให้' fix button", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            shotDrafts: nineShots((n) =>
              n === 1 ? { dialogue_lines: [{ speaker: "หนูนา", line: "“สวัสดี”" }] } : {},
            ),
          })}
        />,
      );
      openEditor(1);
      const violation = screen.getByTestId("vd-deep-story-draft-edit-violation-1-1-0");
      expect(violation).toHaveTextContent(manualDialogueEditViolationCopy.wrapping_quotes.th);
      expect(within(violation).getByText("ใช้เวอร์ชันที่แก้ให้")).toBeInTheDocument();
    });

    it("clicking 'ใช้เวอร์ชันที่แก้ให้' applies the cleaned suggestion into the line input, clearing the violation", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            shotDrafts: nineShots((n) =>
              n === 1 ? { dialogue_lines: [{ speaker: "หนูนา", line: "“สวัสดี”" }] } : {},
            ),
          })}
        />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-apply-cleaned-1-1-0"));

      expect(screen.getByTestId("vd-deep-story-draft-edit-line-input-1-1-0")).toHaveValue("สวัสดี");
      expect(screen.queryByTestId("vd-deep-story-draft-edit-violation-1-1-0")).not.toBeInTheDocument();
    });

    it("typing a violation into a previously-clean line surfaces the hint live (no save needed)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      expect(screen.queryByTestId("vd-deep-story-draft-edit-violation-1-1-0")).not.toBeInTheDocument();
      fireEvent.change(screen.getByTestId("vd-deep-story-draft-edit-line-input-1-1-0"), {
        target: { value: "มีเสียง~แบบนี้" },
      });
      expect(screen.getByTestId("vd-deep-story-draft-edit-violation-1-1-0")).toBeInTheDocument();
    });

    it("shows 'บทพูดห้ามว่าง' and disables Save when a line is emptied", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.change(screen.getByTestId("vd-deep-story-draft-edit-line-input-1-1-0"), {
        target: { value: "   " },
      });
      expect(screen.getByText("บทพูดห้ามว่าง")).toBeInTheDocument();
      expect(screen.getByTestId("vd-deep-story-draft-edit-save-1-1")).toBeDisabled();
    });
  });

  describe("live speech-seconds chip (sum vs target)", () => {
    it("reads 'ok' (on target) when the live sum already meets the shot's target", () => {
      // Shot 1's canonical fallback duration is 8s; feed a long enough Thai
      // line that estimateVerticalDramaSpeechSeconds(line) alone clears
      // targetVerticalDramaSpeechSeconds(8).
      const longLine = "สวัสดีตอนเช้าวันนี้อากาศดีมากและฉันอยากไปเดินเล่นที่สวนสาธารณะกับเธอ";
      const target = targetVerticalDramaSpeechSeconds(8);
      const live = estimateVerticalDramaSpeechSeconds(longLine);
      expect(live).toBeGreaterThanOrEqual(target); // fixture sanity check
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            shotDrafts: nineShots((n) => (n === 1 ? { dialogue_lines: [{ speaker: "A", line: longLine }] } : {})),
          })}
        />,
      );
      openEditor(1);
      const chip = screen.getByTestId("vd-deep-story-draft-edit-live-seconds-1-1");
      expect(chip).toHaveTextContent("ครอบคลุมตามเป้า");
      expect(chip).toHaveClass("text-emerald-600");
    });

    it("reads 'well below target' (error) for an empty (0-line) editor", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            shotDrafts: nineShots((n) => (n === 1 ? { dialogue_lines: [], silence_intent: "establishing" } : {})),
          })}
        />,
      );
      openEditor(1);
      const chip = screen.getByTestId("vd-deep-story-draft-edit-live-seconds-1-1");
      expect(chip).toHaveTextContent("ครอบคลุมต่ำกว่าเป้ามาก");
      expect(chip).toHaveClass("text-destructive");
    });

    it("updates live as the user types (no save round-trip needed)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            shotDrafts: nineShots((n) => (n === 1 ? { dialogue_lines: [] } : {})),
          })}
        />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-add-line-1-1"));
      const before = screen.getByTestId("vd-deep-story-draft-edit-live-seconds-1-1").textContent;
      fireEvent.change(screen.getByTestId("vd-deep-story-draft-edit-line-input-1-1-0"), {
        target: { value: "สวัสดีตอนเช้าวันนี้อากาศดีมากและฉันอยากไปเดินเล่น" },
      });
      const after = screen.getByTestId("vd-deep-story-draft-edit-live-seconds-1-1").textContent;
      expect(after).not.toBe(before);
    });
  });

  describe("save flow", () => {
    it("calls the mutation with {seriesId, episodeNumber, shotNumber, lines, idempotencyKey}", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));

      expect(mockEditMutate).toHaveBeenCalledTimes(1);
      const input = mockEditMutate.mock.calls[0][0] as {
        seriesId: string;
        episodeNumber: number;
        shotNumber: number;
        lines: Array<{ speaker?: string; line: string; delivery?: string }>;
        idempotencyKey: string;
      };
      expect(input.seriesId).toBe("10");
      expect(input.episodeNumber).toBe(1);
      expect(input.shotNumber).toBe(1);
      expect(input.lines).toEqual([{ speaker: "นางเอก", line: "Line for shot 1" }]);
      expect(typeof input.idempotencyKey).toBe("string");
      expect(input.idempotencyKey.length).toBeGreaterThan(0);
    });

    it("generates a fresh idempotencyKey on every save click (family convention)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));
      // The mutation succeeds synchronously in this mock and closes the
      // editor — re-open to save again.
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));

      const first = (mockEditMutate.mock.calls[0][0] as { idempotencyKey: string }).idempotencyKey;
      const second = (mockEditMutate.mock.calls[1][0] as { idempotencyKey: string }).idempotencyKey;
      expect(first).not.toBe(second);
    });

    it("omits blank speaker/delivery from the submitted line payload", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            shotDrafts: nineShots((n) => (n === 1 ? { dialogue_lines: [{ speaker: "A", line: "Hi" }] } : {})),
          })}
        />,
      );
      openEditor(1);
      fireEvent.change(screen.getByTestId("vd-deep-story-draft-edit-speaker-1-1-0"), { target: { value: "" } });
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));
      const input = mockEditMutate.mock.calls[0][0] as { lines: Array<Record<string, unknown>> };
      expect(input.lines).toEqual([{ line: "Hi" }]);
    });

    it("on success: invalidates verticalDramaSeries.get({seriesId}), toasts success with the shot number, and closes the editor", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(3);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-3"));

      expect(mockInvalidateSeriesGet).toHaveBeenCalledWith({ seriesId: "10" });
      expect(toast.success).toHaveBeenCalledWith("บันทึกบทช็อต 3 แล้ว");
      expect(screen.queryByTestId("vd-deep-story-draft-edit-form-1-3")).not.toBeInTheDocument();
    });

    it("on success with silenceIntentRemoved: true — shows the info toast", () => {
      editResult = { silenceIntentRemoved: true, speakabilityWarnings: [] };
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));
      expect(toast.info).toHaveBeenCalledWith("นำป้ายช็อตภาพล้วนออก เพราะมีบทพูดแล้ว");
    });

    it("omits the info toast when silenceIntentRemoved is false", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("on success with non-empty speakabilityWarnings — shows the warning toast with the count", () => {
      editResult = {
        silenceIntentRemoved: false,
        speakabilityWarnings: [
          { lineIndex: 0, violations: [{ kind: "wrapping_quotes", found: "“”" }], cleanedSuggestion: { line: "x" } },
          { lineIndex: 1, violations: [{ kind: "em_dash", found: "—" }], cleanedSuggestion: { line: "y" } },
        ],
      };
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));
      expect(toast.warning).toHaveBeenCalledWith("บันทึกแล้ว แต่ยังมี 2 จุดที่อ่านออกเสียงยาก");
    });

    it("omits the warning toast when speakabilityWarnings is empty", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it("on error: shows the server's error message and keeps the editor open", () => {
      editShouldFail = true;
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));

      expect(toast.error).toHaveBeenCalledWith("edit boom");
      expect(screen.getByTestId("vd-deep-story-draft-edit-form-1-1")).toBeInTheDocument();
      expect(mockInvalidateSeriesGet).not.toHaveBeenCalled();
    });

    it("on error without a server message: falls back to the generic Thai error copy", () => {
      editShouldFail = true;
      editErrorMessage = undefined;
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-save-1-1"));
      expect(toast.error).toHaveBeenCalledWith("แก้ไขบทพูดไม่สำเร็จ");
    });

    it("shows a spinner + 'กำลังบันทึก…' and disables Cancel/Save while the mutation is pending", () => {
      editIsPending = true;
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      expect(screen.getByTestId("vd-deep-story-draft-edit-save-1-1")).toHaveTextContent("กำลังบันทึก…");
      expect(screen.getByTestId("vd-deep-story-draft-edit-save-1-1")).toBeDisabled();
      expect(screen.getByTestId("vd-deep-story-draft-edit-cancel-1-1")).toBeDisabled();
    });
  });

  describe("'แก้แล้ว' (edited) badge", () => {
    it("shows the badge only for shots included in manualDialogueEdit.shotNumbers", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({
            manualDialogueEdit: {
              editedAt: "2026-07-08T00:00:00.000Z",
              editedByUserId: 42,
              shotNumbers: [3],
            },
          })}
        />,
      );
      expect(screen.getByTestId("vd-deep-story-draft-edited-badge-1-3")).toHaveTextContent("แก้แล้ว");
      expect(screen.queryByTestId("vd-deep-story-draft-edited-badge-1-1")).not.toBeInTheDocument();
    });

    it("shows no badge at all when manualDialogueEdit is absent (tolerant read, never throws)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      for (let n = 1; n <= 9; n += 1) {
        expect(screen.queryByTestId(`vd-deep-story-draft-edited-badge-1-${n}`)).not.toBeInTheDocument();
      }
    });

    it("shows no badge when manualDialogueEdit is malformed (tolerant read, never throws)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture({ manualDialogueEdit: { shotNumbers: "not-an-array" } })}
        />,
      );
      expect(screen.queryByTestId("vd-deep-story-draft-edited-badge-1-1")).not.toBeInTheDocument();
    });
  });

  describe("already-created-episode hint", () => {
    it("shows the muted hint inside the editor when episodeAlreadyCreated is true", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail
          lang="th"
          seriesId="10"
          episodeNumber={1}
          item={itemFixture()}
          episodeAlreadyCreated
        />,
      );
      openEditor(1);
      expect(screen.getByTestId("vd-deep-story-draft-edit-already-created-1-1")).toHaveTextContent(
        "ตอนย่อยนี้ถูกสร้างแล้ว",
      );
    });

    it("omits the hint when episodeAlreadyCreated is false (default)", () => {
      render(
        <VerticalDramaDeepStoryDraftEpisodeDetail lang="th" seriesId="10" episodeNumber={1} item={itemFixture()} />,
      );
      openEditor(1);
      expect(screen.queryByTestId("vd-deep-story-draft-edit-already-created-1-1")).not.toBeInTheDocument();
    });
  });
});
