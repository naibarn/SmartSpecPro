/**
 * CaptionsPanel coverage — new read-only subtitle-cue preview
 * ("ข้อความซับไทเทิล") separated from the existing style/export controls
 * ("สไตล์ & การส่งออก"), plus the Thai empty state. Same hand-rolled
 * `@/lib/trpc` mock convention as `ScenesPanel.test.tsx`.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const exportCaptionsFetchMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      videoProjects: { exportCaptions: { fetch: exportCaptionsFetchMock } },
    }),
  },
}));

import { CaptionsPanel, captionPresetLabel } from "../CaptionsPanel";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

const BASE_DOCUMENT: VideoProjectDocument = {
  schemaVersion: 1,
  format: { width: 1080, height: 1920, fps: 30, durationMs: 8000 },
  content: { language: "th", platformPreset: "tiktok_9_16" },
  brandKitId: null,
  scenes: [
    {
      sceneId: "scene-1",
      startMs: 0,
      endMs: 8000,
      narration: "สวัสดีครับ ยินดีต้อนรับ",
      narrationAudioAssetId: 42,
      visual: { kind: "layers" },
      layers: [],
      motion: { intensity: "medium", camera: "static" },
      captionCues: [
        { startMs: 0, endMs: 2000, text: "สวัสดีครับ" },
        { startMs: 2000, endMs: 4000, text: "ยินดีต้อนรับ" },
      ],
    },
  ],
  audioTracks: [],
  captions: { presetId: "classic_box", burnIn: false, language: "th" },
  claims: [],
  qa: { targetScore: 8, maxLoops: 2 },
};

const EMPTY_CUES_DOCUMENT: VideoProjectDocument = {
  ...BASE_DOCUMENT,
  scenes: [{ ...BASE_DOCUMENT.scenes[0], captionCues: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CaptionsPanel — subtitle text vs style/export separation", () => {
  it("renders the subtitle-text section title and the style/export section title", () => {
    render(<CaptionsPanel lang="th" projectId={1} document={BASE_DOCUMENT} onChange={vi.fn()} />);

    expect(screen.getByText("ข้อความซับไทเทิล")).toBeInTheDocument();
    expect(screen.getByText("สไตล์ & การส่งออก")).toBeInTheDocument();
  });

  it("lists the derived caption cues per scene with text and timing", () => {
    render(<CaptionsPanel lang="th" projectId={1} document={BASE_DOCUMENT} onChange={vi.fn()} />);

    const list = screen.getByTestId("captions-cue-list");
    const items = within(list).getAllByTestId("captions-cue-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("สวัสดีครับ");
    expect(items[1]).toHaveTextContent("ยินดีต้อนรับ");
    expect(within(list).getByText("scene-1")).toBeInTheDocument();
  });

  it("shows a Thai empty state explaining cues appear after voice-over is generated", () => {
    render(
      <CaptionsPanel lang="th" projectId={1} document={EMPTY_CUES_DOCUMENT} onChange={vi.fn()} />,
    );

    expect(screen.queryByTestId("captions-cue-list")).not.toBeInTheDocument();
    expect(
      screen.getByText(/ยังไม่มีซับไทเทิล/),
    ).toBeInTheDocument();
  });

  it("keeps the existing preset/burn-in/language/export controls intact", () => {
    render(<CaptionsPanel lang="th" projectId={1} document={BASE_DOCUMENT} onChange={vi.fn()} />);

    expect(screen.getByTestId("video-studio-caption-preset-select")).toBeInTheDocument();
    expect(screen.getByText("ส่งออก SRT")).toBeInTheDocument();
    expect(screen.getByText("ส่งออก VTT")).toBeInTheDocument();
  });
});

describe("CaptionsPanel — Thai preset labels (no raw preset ids)", () => {
  it("shows a Thai label for the selected preset instead of the raw preset id", () => {
    render(<CaptionsPanel lang="th" projectId={1} document={BASE_DOCUMENT} onChange={vi.fn()} />);

    // BASE_DOCUMENT uses "classic_box".
    expect(screen.queryByText("classic_box")).not.toBeInTheDocument();
    expect(screen.getAllByText("กล่องคลาสสิก").length).toBeGreaterThan(0);
  });

  it("falls back to the raw id for a preset not in the label map", () => {
    expect(captionPresetLabel("th", "future_preset")).toBe("future_preset");
    expect(captionPresetLabel("en", "future_preset")).toBe("future_preset");
  });

  it("translates every known preset id to a non-empty, non-raw Thai label", () => {
    for (const id of [
      "classic_box",
      "minimal_shadow",
      "creator_pop",
      "karaoke_word",
      "highlight_bar",
      "lower_third",
      "cinematic_wide",
      "neon_glow",
      "review_bubble",
      "no_subtitle_style",
    ] as const) {
      const label = captionPresetLabel("th", id);
      expect(label).not.toBe(id);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
