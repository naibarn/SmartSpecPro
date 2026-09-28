import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VerticalDramaDialogueAudioPanel,
  type VerticalDramaDialogueAudioBatchData,
} from "@/components/verticalDramaSeries/VerticalDramaDialogueAudioPanel";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";

function basePlan(overrides: Partial<VerticalDramaDialogueAudioPlan> = {}): VerticalDramaDialogueAudioPlan {
  return {
    planId: "plan-1",
    seriesId: "1",
    episodeId: "2",
    mode: "dialogue",
    audioStrategy: "separate_tts_voiceover",
    language: "th",
    dialogueLines: [
      {
        lineId: "line-1",
        shotNumber: 1,
        speakerName: "นางเอก",
        isNarration: false,
        text: "สวัสดีค่ะ",
        start: 0,
        end: 2,
        targetDurationSeconds: 2,
      },
      {
        lineId: "line-2",
        shotNumber: 2,
        speakerName: "พระเอก",
        isNarration: false,
        text: "สวัสดีครับ",
        start: 0,
        end: 2,
        targetDurationSeconds: 2,
      },
    ],
    speakerVoiceMap: {
      entries: [
        { speakerName: "นางเอก", voiceId: "th-porche", locked: true, missingVoiceId: false },
        { speakerName: "พระเอก", locked: false, missingVoiceId: true },
      ],
    },
    nativeAudioPolicy: {
      requested: false,
      modelSupportsNativeAudio: false,
      modelSupportsRequestedLanguage: false,
      userAcceptedRegenerationCost: false,
      allowed: false,
      blockingReasons: [],
    },
    separateTtsPlan: {
      strategy: "separate_tts_voiceover",
      items: [
        {
          lineId: "line-1",
          speakerName: "นางเอก",
          text: "สวัสดีค่ะ",
          targetDurationSeconds: 2,
          blocked: false,
          audioTask: { audioUrl: "https://example.com/line-1.mp3" },
        },
        {
          lineId: "line-2",
          speakerName: "พระเอก",
          text: "สวัสดีครับ",
          targetDurationSeconds: 2,
          blocked: true,
          blockReason: "missing_voice_id",
        },
      ],
      injectsIntoVideoPrompts: false,
      blockedLineIds: ["line-2"],
    },
    nativeAudioSnippets: [],
    subtitleCues: [],
    subtitleSafeArea: { position: "bottom" } as VerticalDramaDialogueAudioPlan["subtitleSafeArea"],
    timing: {
      episodeTargetSeconds: 60,
      totalDialogueSeconds: 4,
      perShot: [],
      overlongLineIds: [],
      timingMismatch: false,
    },
    repairQueue: [],
    warnings: [],
    subShotsEnabled: false,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
    ...overrides,
  };
}

function baseBatch(overrides: Partial<VerticalDramaDialogueAudioBatchData> = {}): VerticalDramaDialogueAudioBatchData {
  return {
    lineStatusByLineId: {
      "line-1": { status: "ready", audioUrl: "https://example.com/line-1.mp3" },
      "line-2": { status: "blocked", blockReason: "missing_voice_id" },
    },
    pendingCount: 0,
    generating: false,
    onGenerateBatch: vi.fn(),
    castingTabHref: "/drama-series/1?tab=characters",
    ...overrides,
  };
}

describe("VerticalDramaDialogueAudioPanel — flag off (batch omitted) byte-identical", () => {
  it("renders IDENTICAL markup whether `batch` is omitted or explicitly undefined", () => {
    const plan = basePlan();
    const { container: withDefault } = render(<VerticalDramaDialogueAudioPanel plan={plan} />);
    const { container: withExplicitUndefined } = render(
      <VerticalDramaDialogueAudioPanel plan={plan} batch={undefined} locale="th" />,
    );
    expect(withExplicitUndefined.innerHTML).toBe(withDefault.innerHTML);
  });

  it("shows none of the new W12-B testids/copy when `batch` is absent", () => {
    render(<VerticalDramaDialogueAudioPanel plan={basePlan()} />);
    expect(screen.queryByTestId("vd-dialogue-audio-batch")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-dialogue-audio-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-dialogue-audio-missing-cast")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-dialogue-audio-line-status-ready")).not.toBeInTheDocument();
    // Pre-existing behavior is preserved verbatim.
    expect(screen.getByText("Dialogue lines")).toBeInTheDocument();
    expect(screen.getByText("Voice continuity")).toBeInTheDocument();
    expect(screen.getByText(/Missing voice ID/)).toBeInTheDocument();
  });
});

describe("VerticalDramaDialogueAudioPanel — W12-B batch UI (flag on)", () => {
  it("shows the ready/total summary row", () => {
    render(<VerticalDramaDialogueAudioPanel plan={basePlan()} batch={baseBatch()} locale="th" />);
    expect(screen.getByTestId("vd-dialogue-audio-summary")).toHaveTextContent("เสียงพูด: 1/2 บรรทัด");
  });

  it("disables the generate button and shows the no-pending-lines note when pendingCount is 0", () => {
    render(<VerticalDramaDialogueAudioPanel plan={basePlan()} batch={baseBatch({ pendingCount: 0 })} locale="th" />);
    expect(screen.getByTestId("vd-dialogue-audio-generate-batch")).toBeDisabled();
    expect(screen.getByTestId("vd-dialogue-audio-no-pending")).toBeInTheDocument();
  });

  it("requires confirmation before calling onGenerateBatch (paid action)", () => {
    const onGenerateBatch = vi.fn();
    render(
      <VerticalDramaDialogueAudioPanel
        plan={basePlan()}
        batch={baseBatch({ pendingCount: 3, onGenerateBatch })}
        locale="th"
      />,
    );
    const cta = screen.getByTestId("vd-dialogue-audio-generate-batch");
    expect(cta).not.toBeDisabled();
    expect(cta).toHaveTextContent("สร้างเสียงพูดทั้งตอนย่อย (มีค่าใช้จ่าย ≈ ตามจำนวนบรรทัดที่ยังไม่มีเสียง)");

    fireEvent.click(cta);
    expect(onGenerateBatch).not.toHaveBeenCalled();
    expect(screen.getByTestId("vd-dialogue-audio-batch-confirm")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-dialogue-audio-batch-confirm-submit"));
    expect(onGenerateBatch).toHaveBeenCalledTimes(1);
  });

  it("shows the missing-cast banner with a link to the Characters tab", () => {
    render(<VerticalDramaDialogueAudioPanel plan={basePlan()} batch={baseBatch()} locale="th" />);
    const banner = screen.getByTestId("vd-dialogue-audio-missing-cast");
    expect(banner).toHaveTextContent("พระเอก");
    const link = screen.getByTestId("vd-dialogue-audio-missing-cast-link");
    expect(link).toHaveAttribute("href", "/drama-series/1?tab=characters");
    expect(link).toHaveTextContent("ไปกำหนดเสียงที่แท็บตัวละคร");
  });

  it("omits the missing-cast banner when every speaker has a voice", () => {
    const plan = basePlan({
      speakerVoiceMap: {
        entries: [{ speakerName: "นางเอก", voiceId: "th-porche", locked: true, missingVoiceId: false }],
      },
    });
    render(<VerticalDramaDialogueAudioPanel plan={plan} batch={baseBatch()} locale="th" />);
    expect(screen.queryByTestId("vd-dialogue-audio-missing-cast")).not.toBeInTheDocument();
  });

  it("renders a ready line's status chip + playable audio element", () => {
    render(<VerticalDramaDialogueAudioPanel plan={basePlan()} batch={baseBatch()} locale="th" />);
    expect(screen.getByTestId("vd-dialogue-audio-line-status-ready")).toHaveTextContent("พร้อมใช้งาน");
    const player = screen.getByTestId("vd-dialogue-audio-line-player");
    expect(player).toHaveAttribute("src", "https://example.com/line-1.mp3");
    expect(player).toHaveAccessibleName("เสียงพูดของ นางเอก บรรทัดที่ 1");
  });

  it("renders a blocked line's status chip (no player, no retry)", () => {
    render(<VerticalDramaDialogueAudioPanel plan={basePlan()} batch={baseBatch()} locale="th" />);
    expect(screen.getByTestId("vd-dialogue-audio-line-status-blocked")).toHaveTextContent("ต้องกำหนดเสียงก่อน");
    expect(screen.queryByTestId("vd-dialogue-audio-line-retry")).not.toBeInTheDocument();
  });

  it("renders a failed line's retry button and calls onRetryLine with the lineId", () => {
    const onRetryLine = vi.fn();
    const batch = baseBatch({
      lineStatusByLineId: {
        "line-1": { status: "failed" },
        "line-2": { status: "blocked" },
      },
      onRetryLine,
    });
    render(<VerticalDramaDialogueAudioPanel plan={basePlan()} batch={batch} locale="th" />);
    expect(screen.getByTestId("vd-dialogue-audio-line-status-failed")).toHaveTextContent("ล้มเหลว");
    fireEvent.click(screen.getByTestId("vd-dialogue-audio-line-retry"));
    expect(onRetryLine).toHaveBeenCalledWith("line-1");
  });

  it("renders a generating line's status chip with no player", () => {
    const batch = baseBatch({
      lineStatusByLineId: {
        "line-1": { status: "generating" },
        "line-2": { status: "blocked" },
      },
    });
    render(<VerticalDramaDialogueAudioPanel plan={basePlan()} batch={batch} locale="th" />);
    expect(screen.getByTestId("vd-dialogue-audio-line-status-generating")).toHaveTextContent("กำลังสร้าง");
    expect(screen.queryByTestId("vd-dialogue-audio-line-player")).not.toBeInTheDocument();
  });

  it("omits the entire batch block when the plan has no separateTtsPlan (e.g. native audio)", () => {
    const plan = basePlan({ audioStrategy: "native_video_audio", separateTtsPlan: undefined });
    render(<VerticalDramaDialogueAudioPanel plan={plan} batch={baseBatch()} locale="th" />);
    expect(screen.queryByTestId("vd-dialogue-audio-batch")).not.toBeInTheDocument();
  });
});
