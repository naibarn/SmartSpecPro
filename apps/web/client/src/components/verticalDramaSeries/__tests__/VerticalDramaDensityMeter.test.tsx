import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  clipHasUnspeakableSymbolsIssue,
  computeVerticalDramaDensityMeterView,
  DENSITY_SHOT_CHIPS_SCROLL_THRESHOLD,
  pickVerticalDramaDensityShotBadgeKind,
  VerticalDramaDensityMeter,
  type VerticalDramaDensityMeterClipInput,
  type VerticalDramaDensityShotView,
} from "@/components/verticalDramaSeries/VerticalDramaDensityMeter";
import { vdCopy } from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";
import {
  analyzeVerticalDramaClipDialogueQuality,
  analyzeVerticalDramaClipSilence,
  analyzeVerticalDramaEpisodeDialogueQuality,
  targetVerticalDramaSpeechSeconds,
} from "@shared/verticalDramaSeries/dialogueQuality";

describe("computeVerticalDramaDensityMeterView", () => {
  it("returns null for an empty clip list (State Matrix: empty -> hidden, no fake zeros)", () => {
    expect(computeVerticalDramaDensityMeterView([])).toBeNull();
  });

  it("reuses analyzeVerticalDramaEpisodeDialogueQuality verbatim for the episode block", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = Array.from(
      { length: 9 },
      (_, i) => ({
        shotNumber: i + 1,
        durationSeconds: 6.7,
        dialogue: [
          {
            lineTh:
              "นี่คือประโยคภาษาไทยที่ค่อนข้างยาวสำหรับการทดสอบเวลาพูดในฉากนี้จริงจัง",
          },
        ],
      })
    );
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.episode).toEqual(
      analyzeVerticalDramaEpisodeDialogueQuality(clips)
    );
    expect(view.coverageState).toBe("in_range");
  });

  it("computes underfilled_error for a fully silent >=30s episode", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = Array.from(
      { length: 9 },
      (_, i) => ({
        shotNumber: i + 1,
        durationSeconds: 6.7,
        dialogue: [],
      })
    );
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.coverageState).toBe("underfilled_error");
  });

  it("minTargetSeconds equals the canonical episode-level target (MIN_EPISODE_COVERAGE_RATIO floor)", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 60, dialogue: [] },
    ];
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.minTargetSeconds).toBe(
      analyzeVerticalDramaEpisodeDialogueQuality(clips).targetSpeechSeconds
    );
  });

  it("maxTargetSeconds sums every clip's own targetVerticalDramaSpeechSeconds (no new speech-rate model)", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 8, dialogue: [] },
      { shotNumber: 2, durationSeconds: 6, dialogue: [] },
    ];
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.maxTargetSeconds).toBeCloseTo(
      targetVerticalDramaSpeechSeconds(8) + targetVerticalDramaSpeechSeconds(6),
      6
    );
  });

  it("exempts a shot with a declared silenceIntent from blocking/warning per-clip flags (spec §7.7.2 Layer 3)", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      {
        shotNumber: 1,
        durationSeconds: 8,
        dialogue: [],
        silenceIntent: "establishing",
      },
    ];
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.shots[0].hasBlockingIssue).toBe(false);
    expect(view.shots[0].hasWarningIssue).toBe(false);
    expect(view.shots[0].silenceIntent).toBe("establishing");
  });

  it("flags a blocking issue for a non-exempt severely underfilled shot", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 8, dialogue: [{ lineTh: "สั้น" }] },
    ];
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.shots[0].hasBlockingIssue).toBe(true);
  });

  it("sorts shots ascending by shotNumber regardless of input order", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 3, durationSeconds: 8, dialogue: [] },
      { shotNumber: 1, durationSeconds: 8, dialogue: [] },
      { shotNumber: 2, durationSeconds: 8, dialogue: [] },
    ];
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.shots.map(s => s.shotNumber)).toEqual([1, 2, 3]);
  });

  it("flags isOverLength when estimated speech exceeds the clip's own duration (dialogue cannot physically fit)", () => {
    // 222 Thai chars / 17 chars-per-second (canonical rate, rescaled
    // 2026-07-15 from 8.5) ≈ 13.06s of estimated speech inside an 8s clip
    // (fixture lengthened to 2x the original single sentence so realistic
    // dialogue still genuinely overflows the clip under the faster rate).
    const longLine =
      "ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน";
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 8, dialogue: [{ lineTh: longLine }] },
    ];
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.shots[0].estimatedSpeechSeconds).toBeGreaterThan(
      view.shots[0].durationSeconds
    );
    expect(view.shots[0].isOverLength).toBe(true);
  });

  it("does not flag isOverLength for a normal underfilled or in-range shot", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 8, dialogue: [{ lineTh: "สั้น" }] },
      {
        // Same ~8.1s-of-speech line used elsewhere in this file, but given a
        // long enough clip (15s) that it comfortably fits — proving
        // `isOverLength` reacts to THIS clip's own duration, not a fixed
        // threshold.
        shotNumber: 2,
        durationSeconds: 15,
        dialogue: [
          {
            lineTh:
              "นี่คือประโยคภาษาไทยที่ค่อนข้างยาวสำหรับการทดสอบเวลาพูดในฉากนี้จริงจัง",
          },
        ],
      },
    ];
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.shots[0].isOverLength).toBe(false);
    expect(view.shots[1].isOverLength).toBe(false);
  });

  it("exempts an over-length shot with a declared silenceIntent (Layer 3), matching every other per-clip flag", () => {
    const longLine =
      "ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน";
    const clips: VerticalDramaDensityMeterClipInput[] = [
      {
        shotNumber: 1,
        durationSeconds: 8,
        dialogue: [{ lineTh: longLine }],
        silenceIntent: "montage",
      },
    ];
    const view = computeVerticalDramaDensityMeterView(clips)!;
    expect(view.shots[0].isOverLength).toBe(false);
  });
});

describe("VerticalDramaDensityMeter", () => {
  it("renders nothing for an empty clip list", () => {
    const { container } = render(
      <VerticalDramaDensityMeter locale="th" clips={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the episode coverage line using the exact Copy Contract template", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 60, dialogue: [] },
    ];
    render(<VerticalDramaDensityMeter locale="th" clips={clips} />);
    const view = computeVerticalDramaDensityMeterView(clips)!;
    const expected = `บทพูดรวม ${view.episode.totalSpeechSeconds.toFixed(1)} วิ จากเป้า ${view.minTargetSeconds.toFixed(0)}-${view.maxTargetSeconds.toFixed(0)} วิ`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows the coverage state as TEXT (never color-only)", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 60, dialogue: [] },
    ];
    render(<VerticalDramaDensityMeter locale="th" clips={clips} />);
    expect(screen.getByTestId("vd-density-meter")).toHaveAttribute(
      "data-state",
      "underfilled_error"
    );
    expect(screen.getByText("ต่ำกว่าเป้ามาก (บล็อก)")).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-density-blocking-message").textContent
    ).toContain("บทยังบางเกินไป — ซ่อมบททั้งตอนย่อยก่อน");
  });

  it("shows the in-range state without the blocking message or repair CTA", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = Array.from(
      { length: 9 },
      (_, i) => ({
        shotNumber: i + 1,
        durationSeconds: 6.7,
        dialogue: [
          {
            lineTh:
              "นี่คือประโยคภาษาไทยที่ค่อนข้างยาวสำหรับการทดสอบเวลาพูดในฉากนี้จริงจัง",
          },
        ],
      })
    );
    render(
      <VerticalDramaDensityMeter
        locale="th"
        clips={clips}
        onRepairWholeEpisode={vi.fn()}
      />
    );
    expect(screen.getByText("อยู่ในเกณฑ์")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-density-blocking-message")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-density-repair-whole-episode")
    ).not.toBeInTheDocument();
  });

  it("calls onRepairWholeEpisode when the repair CTA is clicked in an underfilled state", () => {
    const onRepairWholeEpisode = vi.fn();
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 60, dialogue: [] },
    ];
    render(
      <VerticalDramaDensityMeter
        locale="th"
        clips={clips}
        onRepairWholeEpisode={onRepairWholeEpisode}
      />
    );
    fireEvent.click(screen.getByTestId("vd-density-repair-whole-episode"));
    expect(onRepairWholeEpisode).toHaveBeenCalledTimes(1);
  });

  it("renders a silence-gap badge with an accessible name including the gap length", () => {
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 8,
      dialogue: [{ lineTh: "หนึ่ง" }],
    };
    const silence = analyzeVerticalDramaClipSilence(
      clip.dialogue,
      clip.durationSeconds
    );
    expect(silence.exceedsLimit).toBe(true); // sanity-check the fixture actually triggers the badge
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    const gapText = `ช็อตนี้เงียบเกิน ${silence.maxContinuousSilenceSeconds.toFixed(1)} วิ`;
    const badge = screen.getByTestId("vd-density-silence-gap-1");
    expect(badge).toHaveAttribute("aria-label", gapText);
    expect(badge.textContent).toContain(gapText);
  });

  it("shows the declared silenceIntent label instead of a silence-gap badge for an exempt shot", () => {
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 8,
      dialogue: [{ lineTh: "หนึ่ง" }],
      silenceIntent: "montage",
    };
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    expect(screen.getByTestId("vd-density-silence-intent-1").textContent).toBe(
      "มอนทาจ"
    );
    expect(
      screen.queryByTestId("vd-density-silence-gap-1")
    ).not.toBeInTheDocument();
  });

  it("renders a generic issue badge (never color-only) for a non-exempt shot whose issue is NOT a silence gap or a speakability violation", () => {
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 3,
      // "เสียง " prefix matches the stage-direction pattern WITHOUT tripping
      // the (2026-07-08/W9-A, landed mid-task) speakability rule — unlike
      // the bracket-wrapped form (`"[sound cue]"`), which ALSO now raises
      // VD_DIALOGUE_UNSPEAKABLE_SYMBOLS since brackets are themselves a
      // forbidden symbol (spec §14.1 rule 6b); see the dedicated
      // speakability-priority test below for that overlap case.
      dialogue: [{ lineTh: "เสียง หมาเห่า" }],
    };
    const silence = analyzeVerticalDramaClipSilence(
      clip.dialogue,
      clip.durationSeconds
    );
    expect(silence.exceedsLimit).toBe(false); // sanity-check: not a silence-gap case
    const clipQuality = analyzeVerticalDramaClipDialogueQuality(clip);
    expect(clipQuality.estimatedSpeechSeconds).toBeLessThanOrEqual(
      clip.durationSeconds
    ); // sanity-check: not an over-length case
    expect(
      clipQuality.issues.some(i => i.code === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS")
    ).toBe(false); // sanity-check: not a speakability case
    expect(
      clipQuality.issues.some(i => i.code === "VD_DIALOGUE_STAGE_DIRECTION")
    ).toBe(true); // sanity-check: still IS a stage-direction case
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    expect(
      screen.queryByTestId("vd-density-silence-gap-1")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-density-unspeakable-1")
    ).not.toBeInTheDocument();
    const badge = screen.getByTestId("vd-density-issue-badge-1");
    expect(badge.textContent).toContain("เป็นคำสั่งฉาก ไม่ใช่บทพูด");
  });

  it("renders a visible over-length warning (text + tone) when speech cannot fit the clip's duration", () => {
    const longLine =
      "ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน";
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 8,
      dialogue: [{ lineTh: longLine }],
    };
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    const badge = screen.getByTestId("vd-density-overlength-1");
    expect(badge.textContent).toContain("ยาวเกินช็อต");
    // Never a silence-gap badge at the same time — over-length takes priority.
    expect(
      screen.queryByTestId("vd-density-silence-gap-1")
    ).not.toBeInTheDocument();
  });

  it("2026-07-08 wizard cross-link: an over-length chip ALSO gets the actionable hint line, pointing at the dialogue/audio step and the repair CTA", () => {
    const longLine =
      "ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน";
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 8,
      dialogue: [{ lineTh: longLine }],
    };
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    const hint = screen.getByTestId("vd-density-overlength-hint-1");
    expect(hint.textContent).toBe(
      "เกลี่ยบทในขั้น 'บทพูด/เสียง' หรือกด 'ซ่อมบททั้งตอนย่อย'"
    );
  });

  it("2026-07-08 wizard cross-link: shows the dialogue-forecast note only when dialoguePlanExists is explicitly false AND a 'no dialogue' chip exists", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 8, dialogue: [] },
    ];
    render(
      <VerticalDramaDensityMeter
        locale="th"
        clips={clips}
        dialoguePlanExists={false}
      />
    );
    const note = screen.getByTestId("vd-density-dialogue-forecast-note");
    expect(note.textContent).toBe(
      "บทพูดจะถูกแจกลงช็อตในขั้น 'บทพูด/เสียง' — ตัวเลขนี้เป็นการคาดการณ์ล่วงหน้า"
    );
  });

  it("does not show the dialogue-forecast note when dialoguePlanExists is true, even with empty-dialogue shots", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 8, dialogue: [] },
    ];
    render(
      <VerticalDramaDensityMeter
        locale="th"
        clips={clips}
        dialoguePlanExists={true}
      />
    );
    expect(
      screen.queryByTestId("vd-density-dialogue-forecast-note")
    ).not.toBeInTheDocument();
  });

  it("flags-off byte-identical: omitting dialoguePlanExists entirely never shows the forecast note, even with empty-dialogue shots", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = [
      { shotNumber: 1, durationSeconds: 8, dialogue: [] },
    ];
    render(<VerticalDramaDensityMeter locale="th" clips={clips} />);
    expect(
      screen.queryByTestId("vd-density-dialogue-forecast-note")
    ).not.toBeInTheDocument();
  });

  it("renders one chip per shot", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = Array.from(
      { length: 9 },
      (_, i) => ({
        shotNumber: i + 1,
        durationSeconds: 6.7,
        dialogue: [],
      })
    );
    render(<VerticalDramaDensityMeter locale="th" clips={clips} />);
    for (const shot of clips) {
      expect(
        screen.getByTestId(`vd-density-shot-chip-${shot.shotNumber}`)
      ).toBeInTheDocument();
    }
  });
});

/**
 * Owner-reported fix (2026-07-08, screenshot review) — the shot-chip list
 * used a fixed `max-h-40` `ScrollArea` regardless of how many shots there
 * were, clipping chips mid-row for a completely normal single-episode
 * count (shots 7-9 half-cut in the owner's screenshot, out of the usual 9
 * total). At or under `DENSITY_SHOT_CHIPS_SCROLL_THRESHOLD` shots, the list
 * now gets no height cap at all (natural wrap, nothing ever clipped).
 * Above it, a taller cap (`max-h-56`) still applies, but now with an
 * always-visible scrollbar, a bottom fade, and a one-line hint.
 */
describe("shot chip list height cap (owner-reported fix, 2026-07-08)", () => {
  function manyClips(n: number): VerticalDramaDensityMeterClipInput[] {
    return Array.from({ length: n }, (_, i) => ({
      shotNumber: i + 1,
      durationSeconds: 6.7,
      dialogue: [{ lineTh: "หนึ่ง สอง สาม สี่ ห้า" }],
    }));
  }

  it("matches the owner-approved threshold (12 shots)", () => {
    expect(DENSITY_SHOT_CHIPS_SCROLL_THRESHOLD).toBe(12);
  });

  it("applies NO height cap for 9 shots (the normal single-episode count) — no scroll wrapper or hint", () => {
    render(<VerticalDramaDensityMeter locale="th" clips={manyClips(9)} />);
    expect(
      screen.queryByTestId("vd-density-shot-chips-scroll")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-density-shot-chips-scroll-hint")
    ).not.toBeInTheDocument();
    const chipsList = screen.getByTestId("vd-density-shot-chips");
    expect(chipsList).not.toHaveClass("max-h-40");
    expect(chipsList).not.toHaveClass("max-h-56");
    for (let i = 1; i <= 9; i++) {
      expect(screen.getByTestId(`vd-density-shot-chip-${i}`)).toBeInTheDocument();
    }
  });

  it("still applies no cap at exactly the threshold (12 shots)", () => {
    render(<VerticalDramaDensityMeter locale="th" clips={manyClips(12)} />);
    expect(
      screen.queryByTestId("vd-density-shot-chips-scroll")
    ).not.toBeInTheDocument();
  });

  it("applies the taller cap + visible scrollbar + hint above the threshold (13 shots)", () => {
    render(<VerticalDramaDensityMeter locale="th" clips={manyClips(13)} />);
    expect(screen.getByTestId("vd-density-shot-chips-scroll")).toBeInTheDocument();
  });

  it("applies a taller cap + hint for 20 shots, and still renders every chip", () => {
    render(<VerticalDramaDensityMeter locale="th" clips={manyClips(20)} />);
    const scrollWrapper = screen.getByTestId("vd-density-shot-chips-scroll");
    expect(scrollWrapper).toHaveClass("max-h-56");
    // "Clearly visible" scrollbar — Radix's `type="always"` mounts the
    // scrollbar track unconditionally at render time (unlike the default
    // hover-only behavior, which only mounts it after a pointer-enter
    // event — nothing would be queryable here without a real hover).
    expect(
      scrollWrapper.querySelector('[data-slot="scroll-area-scrollbar"]')
    ).toBeInTheDocument();
    expect(screen.getByTestId("vd-density-shot-chips-scroll-hint")).toHaveTextContent(
      "เลื่อนดูช็อตเพิ่มเติม"
    );
    for (let i = 1; i <= 20; i++) {
      expect(screen.getByTestId(`vd-density-shot-chip-${i}`)).toBeInTheDocument();
    }
  });
});

/**
 * 2026-07-08 W9-B, owner directive (spec §14.1 rule 6b speakability) —
 * `VD_DIALOGUE_UNSPEAKABLE_SYMBOLS` landed for real (2026-07-08/W9-A) mid-
 * task, so every test below drives the REAL canonical analyzer
 * (`analyzeVerticalDramaClipDialogueQuality` /
 * `analyzeVerticalDramaLineSpeakability`) with real forbidden-symbol text —
 * no mocking needed.
 */
describe("clipHasUnspeakableSymbolsIssue", () => {
  it("is true when the issues array contains VD_DIALOGUE_UNSPEAKABLE_SYMBOLS", () => {
    expect(
      clipHasUnspeakableSymbolsIssue([
        { code: "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS" },
      ])
    ).toBe(true);
  });

  it("is false for an issues array with other codes only", () => {
    expect(
      clipHasUnspeakableSymbolsIssue([
        { code: "VD_DIALOGUE_EMPTY" },
        { code: "VD_DIALOGUE_STAGE_DIRECTION" },
      ])
    ).toBe(false);
  });

  it("is false for an empty issues array (missing-field/flags-off byte-identical proof)", () => {
    expect(clipHasUnspeakableSymbolsIssue([])).toBe(false);
  });

  it("reflects the REAL analyzer's output for dialogue with a wrapping quote mark", () => {
    const clipQuality = analyzeVerticalDramaClipDialogueQuality({
      shotNumber: 1,
      durationSeconds: 6,
      dialogue: [{ lineTh: "“ไม่นะ อย่าทำแบบนี้เลย”" }],
    });
    expect(clipHasUnspeakableSymbolsIssue(clipQuality.issues)).toBe(true);
  });

  it("reflects the REAL analyzer's output for ordinary clean dialogue (false)", () => {
    const clipQuality = analyzeVerticalDramaClipDialogueQuality({
      shotNumber: 1,
      durationSeconds: 6,
      dialogue: [{ lineTh: "ไม่นะ อย่าทำแบบนี้เลย จริงจังนะ" }],
    });
    expect(clipHasUnspeakableSymbolsIssue(clipQuality.issues)).toBe(false);
  });
});

describe("pickVerticalDramaDensityShotBadgeKind — priority order (over-length > speakability > silence > no-dialogue/generic)", () => {
  const baseShot: Pick<
    VerticalDramaDensityShotView,
    | "silenceIntent"
    | "isOverLength"
    | "hasUnspeakableSymbols"
    | "silence"
    | "hasBlockingIssue"
    | "hasWarningIssue"
    | "issueCode"
  > = {
    silenceIntent: undefined,
    isOverLength: false,
    hasUnspeakableSymbols: false,
    silence: {
      exceedsLimit: false,
      maxContinuousSilenceSeconds: 0,
    } as VerticalDramaDensityShotView["silence"],
    hasBlockingIssue: false,
    hasWarningIssue: false,
    issueCode: undefined,
  };

  it("silence_intent wins over everything else", () => {
    expect(
      pickVerticalDramaDensityShotBadgeKind({
        ...baseShot,
        silenceIntent: "montage",
        isOverLength: true,
        hasUnspeakableSymbols: true,
      })
    ).toBe("silence_intent");
  });

  it("over_length wins over unspeakable, silence_gap, and generic_issue", () => {
    expect(
      pickVerticalDramaDensityShotBadgeKind({
        ...baseShot,
        isOverLength: true,
        hasUnspeakableSymbols: true,
        silence: {
          exceedsLimit: true,
          maxContinuousSilenceSeconds: 3,
        } as VerticalDramaDensityShotView["silence"],
        hasBlockingIssue: true,
        issueCode: "VD_DIALOGUE_DUPLICATE",
      })
    ).toBe("over_length");
  });

  it("unspeakable wins over silence_gap and generic_issue (but not over over_length)", () => {
    expect(
      pickVerticalDramaDensityShotBadgeKind({
        ...baseShot,
        hasUnspeakableSymbols: true,
        silence: {
          exceedsLimit: true,
          maxContinuousSilenceSeconds: 3,
        } as VerticalDramaDensityShotView["silence"],
        hasBlockingIssue: true,
        issueCode: "VD_DIALOGUE_DUPLICATE",
      })
    ).toBe("unspeakable");
  });

  it("silence_gap wins over generic_issue", () => {
    expect(
      pickVerticalDramaDensityShotBadgeKind({
        ...baseShot,
        silence: {
          exceedsLimit: true,
          maxContinuousSilenceSeconds: 3,
        } as VerticalDramaDensityShotView["silence"],
        hasWarningIssue: true,
        issueCode: "VD_DIALOGUE_EMPTY",
      })
    ).toBe("silence_gap");
  });

  it("generic_issue is the catch-all (covers VD_DIALOGUE_EMPTY, i.e. 'no dialogue') when nothing higher-priority applies", () => {
    expect(
      pickVerticalDramaDensityShotBadgeKind({
        ...baseShot,
        hasWarningIssue: true,
        issueCode: "VD_DIALOGUE_EMPTY",
      })
    ).toBe("generic_issue");
  });

  it("none when there is no non-exempt issue at all", () => {
    expect(pickVerticalDramaDensityShotBadgeKind(baseShot)).toBe("none");
  });
});

describe("VerticalDramaDensityMeter — speakability badge (2026-07-08 W9-B, real end-to-end)", () => {
  it("renders the dedicated 'มีสัญลักษณ์ที่อ่านไม่ได้' badge for a shot whose dialogue has a real speakability violation", () => {
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 6,
      // Parenthetical stage direction inline with the line — a real
      // VD_DIALOGUE_UNSPEAKABLE_SYMBOLS trigger (spec §14.1 rule 6b), and
      // short enough that this line alone does not also trigger an
      // over-length or silence-gap issue.
      dialogue: [{ lineTh: "หนูนา(สะดุ้ง) ไม่เอาน่า อย่าทำแบบนี้เลยนะ" }],
    };
    const clipQuality = analyzeVerticalDramaClipDialogueQuality(clip);
    expect(
      clipQuality.issues.some(i => i.code === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS")
    ).toBe(true); // sanity-check: this fixture really does trigger it
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    const badge = screen.getByTestId("vd-density-unspeakable-1");
    expect(badge.textContent).toContain("มีสัญลักษณ์ที่อ่านไม่ได้");
    expect(badge).toHaveAttribute(
      "aria-label",
      vdCopy("th").densityUnspeakableSymbolsBadge
    );
  });

  it("over-length still wins over speakability when both are true for the same shot", () => {
    // Rescaled 2026-07-15: THAI_CHARS_PER_SECOND doubled (8.5->17), so the
    // inner quoted sentence is now tripled (228 Thai chars ≈ 13.41s) to keep
    // this fixture genuinely overflowing the 8s clip under the faster rate,
    // while the leading/trailing wrapping-quote violation stays intact.
    const longUnspeakableLine =
      "“ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีก ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีก ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีก”";
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 8,
      dialogue: [{ lineTh: longUnspeakableLine }],
    };
    const clipQuality = analyzeVerticalDramaClipDialogueQuality(clip);
    expect(clipQuality.estimatedSpeechSeconds).toBeGreaterThan(
      clip.durationSeconds
    ); // sanity-check: really over-length
    expect(
      clipQuality.issues.some(i => i.code === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS")
    ).toBe(true); // sanity-check: really also unspeakable (wrapping quotes)
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    expect(screen.getByTestId("vd-density-overlength-1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-density-unspeakable-1")
    ).not.toBeInTheDocument();
  });

  it("speakability wins over a silence gap when both are true for the same shot", () => {
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 8,
      // One short quoted line near the start, then nothing — long enough
      // continuous silence afterward to also exceed the silence-gap limit.
      dialogue: [{ lineTh: "“หนึ่ง”" }],
    };
    const silence = analyzeVerticalDramaClipSilence(
      clip.dialogue,
      clip.durationSeconds
    );
    expect(silence.exceedsLimit).toBe(true); // sanity-check: really a silence-gap case
    const clipQuality = analyzeVerticalDramaClipDialogueQuality(clip);
    expect(
      clipQuality.issues.some(i => i.code === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS")
    ).toBe(true); // sanity-check: really also unspeakable (wrapping quotes)
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    expect(screen.getByTestId("vd-density-unspeakable-1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-density-silence-gap-1")
    ).not.toBeInTheDocument();
  });

  it("speakability wins over the bracket-wrapped stage-direction case (both trigger from the SAME bracket text)", () => {
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 3,
      dialogue: [{ lineTh: "[sound cue]" }],
    };
    const clipQuality = analyzeVerticalDramaClipDialogueQuality(clip);
    expect(
      clipQuality.issues.some(i => i.code === "VD_DIALOGUE_STAGE_DIRECTION")
    ).toBe(true);
    expect(
      clipQuality.issues.some(i => i.code === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS")
    ).toBe(true);
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    expect(screen.getByTestId("vd-density-unspeakable-1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-density-issue-badge-1")
    ).not.toBeInTheDocument();
  });

  it("exempts an unspeakable shot with a declared silenceIntent (Layer 3), matching every other per-clip flag", () => {
    const clip: VerticalDramaDensityMeterClipInput = {
      shotNumber: 1,
      durationSeconds: 8,
      dialogue: [{ lineTh: "“หนึ่ง”" }],
      silenceIntent: "establishing",
    };
    const view = computeVerticalDramaDensityMeterView([clip])!;
    expect(view.shots[0].hasUnspeakableSymbols).toBe(false);
    render(<VerticalDramaDensityMeter locale="th" clips={[clip]} />);
    expect(
      screen.queryByTestId("vd-density-unspeakable-1")
    ).not.toBeInTheDocument();
  });

  it("missing-issue byte-identical: hasUnspeakableSymbols is false for ordinary clean dialogue with no violations", () => {
    const clips: VerticalDramaDensityMeterClipInput[] = Array.from(
      { length: 9 },
      (_, i) => ({
        shotNumber: i + 1,
        durationSeconds: 6.7,
        dialogue: [
          {
            lineTh:
              "นี่คือประโยคภาษาไทยที่ค่อนข้างยาวสำหรับการทดสอบเวลาพูดในฉากนี้จริงจัง",
          },
        ],
      })
    );
    const view = computeVerticalDramaDensityMeterView(clips)!;
    for (const shot of view.shots) {
      expect(shot.hasUnspeakableSymbols).toBe(false);
    }
  });
});
