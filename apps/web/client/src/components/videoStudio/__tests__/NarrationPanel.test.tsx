/**
 * NarrationPanel coverage — narration/captions relationship note + optional
 * jump-to-Scenes affordance. Same hand-rolled `@/lib/trpc` mock convention
 * as `BriefPanel.test.tsx` / `ScenesPanel.test.tsx`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const runNarrationMutateMock = vi.fn();
let narrationAssetsData: { items: Array<{ sceneId: string; assetId: number; audioUrl: string; mimeType: string; durationMs: number | null }> } = { items: [] };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    media: {
      listModelFieldOptions: {
        useQuery: () => ({ data: { options: [] }, isLoading: false }),
      },
    },
    mediaModels: {
      listRecommendedAudioModels: {
        useQuery: () => ({
          data: {
            models: [{
              modelId: "test-tts",
              name: "Test TTS",
              provider: "test",
              creditCost: 1,
              isDefault: true,
              configJson: { inputFields: [{ key: "voice", label: "Voice", type: "select", options: [{ value: "voice-1", label: "Voice 1" }] }] },
            }],
          },
          isLoading: false,
        }),
      },
    },
    videoProjects: {
      getActiveGenerationJob: {
        useQuery: () => ({ data: null }),
      },
      getGenerationJobStatus: {
        useQuery: () => ({ data: undefined }),
      },
      getNarrationAssets: {
        useQuery: () => ({ data: narrationAssetsData, refetch: vi.fn() }),
      },
      runNarrationStageAsync: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => runNarrationMutateMock(input, opts),
          isPending: false,
        }),
      },
    },
  },
}));

import { NarrationPanel } from "../NarrationPanel";
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
      narration: "สวัสดีครับ",
      narrationAudioAssetId: null,
      visual: { kind: "layers" },
      layers: [],
      motion: { intensity: "medium", camera: "static" },
      captionCues: [],
    },
  ],
  audioTracks: [],
  captions: { presetId: "classic_box", burnIn: false, language: "th" },
  claims: [],
  qa: { targetScore: 8, maxLoops: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  narrationAssetsData = { items: [] };
});

describe("NarrationPanel — narration/captions relationship note", () => {
  it("shows a note explaining voice-over also auto-creates subtitle cues from the same script", () => {
    render(
      <NarrationPanel
        lang="th"
        projectId={1}
        document={BASE_DOCUMENT}
        onDocumentSaved={vi.fn()}
      />,
    );

    const note = screen.getByTestId("narration-captions-note");
    expect(note).toHaveTextContent(
      "การสร้างเสียงพากย์จะสร้างซับไทเทิลให้อัตโนมัติจากบทเดียวกัน",
    );
    expect(note).toHaveTextContent('แก้ไขข้อความบทพูดได้ที่แท็บ "ฉาก"');
  });

  it("shows the accepted draft narration before TTS is started", () => {
    render(
      <NarrationPanel
        lang="th"
        projectId={1}
        document={BASE_DOCUMENT}
        onDocumentSaved={vi.fn()}
      />,
    );

    expect(screen.getByTestId("narration-script-scene-1")).toHaveTextContent("สวัสดีครับ");
    expect(screen.getByText("รอสังเคราะห์เสียง")).toBeInTheDocument();
  });

  it("does not render a jump-to-scenes button when no callback is provided", () => {
    render(
      <NarrationPanel
        lang="th"
        projectId={1}
        document={BASE_DOCUMENT}
        onDocumentSaved={vi.fn()}
      />,
    );

    expect(screen.queryByText("ไปที่แท็บฉาก")).not.toBeInTheDocument();
  });

  it("renders a jump-to-scenes button and calls the callback when provided", () => {
    const onGoToScenes = vi.fn();
    render(
      <NarrationPanel
        lang="th"
        projectId={1}
        document={BASE_DOCUMENT}
        onDocumentSaved={vi.fn()}
        onGoToScenes={onGoToScenes}
      />,
    );

    fireEvent.click(screen.getByText("ไปที่แท็บฉาก"));
    expect(onGoToScenes).toHaveBeenCalledTimes(1);
  });
});

describe("NarrationPanel — regression: run voice-over stage still works", () => {
  it("calls runNarrationStage when the button is clicked", () => {
    render(
      <NarrationPanel
        lang="th"
        projectId={7}
        document={BASE_DOCUMENT}
        onDocumentSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("สร้างเสียงพากย์ (TTS)"));
    expect(runNarrationMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 7,
        narrationSettings: expect.objectContaining({ modelId: "test-tts", voice: "voice-1" }),
      }),
      expect.anything(),
    );
  });

  it("renders a playable audio control for a completed narration asset", () => {
    narrationAssetsData = {
      items: [{
        sceneId: "scene-1",
        assetId: 77,
        audioUrl: "/api/storage/files/video-intelligence/1/scene-1.mp3",
        mimeType: "audio/mpeg",
        durationMs: 3200,
      }],
    };
    const document = {
      ...BASE_DOCUMENT,
      scenes: [{ ...BASE_DOCUMENT.scenes[0]!, narrationAudioAssetId: 77, narrationAudioDurationMs: 3200 }],
    };

    render(
      <NarrationPanel
        lang="th"
        projectId={1}
        document={document}
        onDocumentSaved={vi.fn()}
      />,
    );

    expect(screen.getByTestId("narration-audio-scene-1")).toHaveAttribute(
      "src",
      "/api/storage/files/video-intelligence/1/scene-1.mp3",
    );
  });
});
