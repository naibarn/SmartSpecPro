/**
 * TimelineStagePanel coverage (Feature 143 §4.13/§4.14 states, P2 §4.5/§4.4/
 * §4.8/G7/AC15). Sub-panels (`Timeline`, `LayerListPanel`,
 * `LayerInspectorPanel`, `TransformOverlay`, `LayerBudgetMeter`,
 * `RemotionProjectPreview`) are REAL components — only their own trpc/
 * `@remotion/player` dependencies are mocked, matching this codebase's page-
 * test convention (`ScenesPanel.test.tsx`/`BriefPanel.test.tsx`).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("@remotion/player", () => ({
  Player: () => <div data-testid="mock-remotion-player" />,
}));

const compileProjectQueryMock = vi.fn();
const compileProjectInvalidateMock = vi.fn();
const getLayerBudgetQueryMock = vi.fn();
const getFeatureFlagsQueryMock = vi.fn();
const brandKitsListQueryMock = vi.fn();
const listPickerAssetsQueryMock = vi.fn();
const listMediaTasksQueryMock = vi.fn();
const listRecommendedImageModelsQueryMock = vi.fn();
const listRecommendedVideoModelsQueryMock = vi.fn();
const generateImageMutationMock = vi.fn();
const generateVideoMutationMock = vi.fn();
const getTaskQueryMock = vi.fn();
const createBrollPromptDraftMutationMock = vi.fn();
const listLibraryDocumentsQueryMock = vi.fn();
const saveDocumentMutateMock = vi.fn();
const getFetchMock = vi.fn();

let saveDocumentOpts: Record<string, unknown> = {};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      compileProject: { useQuery: (...args: unknown[]) => compileProjectQueryMock(...args) },
      getLayerBudget: { useQuery: (...args: unknown[]) => getLayerBudgetQueryMock(...args) },
      brandKits: { list: { useQuery: (...args: unknown[]) => brandKitsListQueryMock(...args) } },
      listPickerAssets: { useQuery: (...args: unknown[]) => listPickerAssetsQueryMock(...args) },
      createBrollPromptDraft: { useMutation: (...args: unknown[]) => createBrollPromptDraftMutationMock(...args) },
      saveDocument: {
        useMutation: (opts: Record<string, unknown>) => {
          saveDocumentOpts = opts;
          return {
            mutate: (input: unknown) => saveDocumentMutateMock(input, opts),
            isPending: false,
          };
        },
      },
    },
    media: {
      listTasks: { useQuery: (...args: unknown[]) => listMediaTasksQueryMock(...args) },
      getTask: { useQuery: (...args: unknown[]) => getTaskQueryMock(...args) },
      generateImageAsync: { useMutation: (...args: unknown[]) => generateImageMutationMock(...args) },
      generateVideoAsync: { useMutation: (...args: unknown[]) => generateVideoMutationMock(...args) },
    },
    mediaModels: {
      listRecommendedImageModels: { useQuery: (...args: unknown[]) => listRecommendedImageModelsQueryMock(...args) },
      listRecommendedVideoModels: { useQuery: (...args: unknown[]) => listRecommendedVideoModelsQueryMock(...args) },
    },
    library: {
      listDocuments: { useQuery: (...args: unknown[]) => listLibraryDocumentsQueryMock(...args) },
    },
    tenantFeatureFlags: {
      getFeatureFlags: { useQuery: (...args: unknown[]) => getFeatureFlagsQueryMock(...args) },
    },
    useUtils: () => ({
      videoProjects: {
        get: { fetch: getFetchMock },
        compileProject: { invalidate: compileProjectInvalidateMock },
      },
    }),
  },
}));

// P3 launchers open `VideoStudioAssetPicker` in DIALOG mode, which renders a
// native <dialog> — jsdom doesn't implement showModal()/close() (same fix as
// VideoStudioAssetPicker.test.tsx/CatalogCreateDialog.test.tsx).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

// The background/logo/concat launchers probe the picked asset's own media
// duration client-side (`mediaDurationProbe.ts`) — mocked so tests control
// the resolved value deterministically instead of racing jsdom's (nonexistent)
// media loading pipeline.
const probeMediaDurationMsMock = vi.fn();
vi.mock("../mediaDurationProbe", () => ({
  probeMediaDurationMs: (...args: unknown[]) => probeMediaDurationMsMock(...args),
}));

import { TimelineStagePanel } from "../TimelineStagePanel";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

function textLayer(overrides: Partial<RemotionLayer> = {}): RemotionLayer {
  return {
    id: "layer_overlay_1",
    type: "text",
    startFrame: 0,
    durationFrames: 90,
    x: 10,
    y: 10,
    width: 30,
    height: 10,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 200,
    content: "Hi",
    fontFamily: "Inter",
    fontSizePx: 24,
    color: "#fff",
    textAlign: "center",
    fontWeight: "normal",
    ...overrides,
  } as RemotionLayer;
}

function docWithLayers(layers: RemotionLayer[]): VideoProjectDocument {
  return {
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 8000 },
    content: { language: "th", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [
      {
        sceneId: "scene-1",
        startMs: 0,
        endMs: 8000,
        narration: null,
        narrationAudioAssetId: null,
        visual: { kind: "layers" },
        layers,
        motion: { intensity: "medium", camera: "static" },
        captionCues: [],
      },
    ],
    audioTracks: [],
    captions: { presetId: "classic_box", burnIn: false, language: "th" },
    claims: [],
    qa: { targetScore: 8, maxLoops: 2 },
  };
}

const DOCUMENT = docWithLayers([]);

const COMPILED = {
  kind: "single" as const,
  config: {
    id: "compiled",
    name: "compiled",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 240,
    layers: [] as RemotionLayer[],
  },
  cost: { estimatedCredits: 10, estimatedUsd: 0.5 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  window.innerWidth = 1400;
  compileProjectQueryMock.mockReturnValue({ data: COMPILED, isLoading: false, isError: false });
  getLayerBudgetQueryMock.mockReturnValue({
    data: {
      handAuthoredLayers: 0,
      templateLayers: 0,
      captionLayers: 0,
      audioLayers: 0,
      hiddenLayers: 0,
      compiledTotal: 0,
      max: 40,
    },
    isLoading: false,
  });
  getFeatureFlagsQueryMock.mockReturnValue({ data: { remotionRenderVideoJobEnabled: true }, isLoading: false });
  brandKitsListQueryMock.mockReturnValue({ data: [] });
  listPickerAssetsQueryMock.mockReturnValue({
    data: { items: [], nextOffset: null },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  });
  listMediaTasksQueryMock.mockReturnValue({ data: { tasks: [] }, isLoading: false, isFetching: false, isError: false });
  listRecommendedImageModelsQueryMock.mockReturnValue({ data: { models: [] }, isLoading: false, isError: false });
  listRecommendedVideoModelsQueryMock.mockReturnValue({ data: { models: [] }, isLoading: false, isError: false });
  generateImageMutationMock.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn() });
  generateVideoMutationMock.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn() });
  getTaskQueryMock.mockReturnValue({ data: null, isLoading: false, isError: false });
  createBrollPromptDraftMutationMock.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn() });
  listLibraryDocumentsQueryMock.mockReturnValue({ data: { results: [] }, isLoading: false, isFetching: false, isError: false });
  probeMediaDurationMsMock.mockResolvedValue(null);
  getFetchMock.mockResolvedValue(null);
});

function renderPanel(overrides: Partial<Parameters<typeof TimelineStagePanel>[0]> = {}) {
  const onDocumentChange = overrides.onDocumentChange ?? vi.fn();
  const onRevisionSaved = overrides.onRevisionSaved ?? vi.fn();
  const props = {
    lang: "th" as const,
    projectId: 1,
    document: DOCUMENT,
    hasUnsavedChanges: false,
    isGenerationJobActive: false,
    baseRevision: 5,
    onDocumentChange,
    onRevisionSaved,
    ...overrides,
  };
  const utils = render(<TimelineStagePanel {...props} />);
  return { ...utils, onDocumentChange, onRevisionSaved };
}

describe("TimelineStagePanel — P1 states", () => {
  it("renders the timeline stage shell with the budget meter", () => {
    renderPanel();
    expect(screen.getByTestId("vs-timeline-stage")).toBeInTheDocument();
    expect(screen.getByTestId("vs-budget-meter")).toBeInTheDocument();
    expect(screen.getByTestId("vs-timeline-preview-frame")).toHaveClass("max-w-md");
    expect(screen.getByTestId("video-studio-preview-fullscreen")).toBeInTheDocument();
  });

  it("empty state: shows the four launcher buttons (not an error) when there are no hand-authored layers", () => {
    renderPanel();
    expect(screen.getByTestId("vs-timeline-empty-launchers")).toBeInTheDocument();
  });

  it("generation-job-running state: shows the read-only banner", () => {
    renderPanel({ isGenerationJobActive: true });
    expect(screen.getByTestId("vs-timeline-readonly-banner")).toBeInTheDocument();
  });

  it("feature-flag-off state: shows a persistent non-blocking note, editor stays usable", () => {
    getFeatureFlagsQueryMock.mockReturnValue({ data: { remotionRenderVideoJobEnabled: false }, isLoading: false });
    renderPanel();
    expect(screen.getByTestId("vs-timeline-flag-off-note")).toBeInTheDocument();
    expect(screen.getByTestId("vs-timeline")).toBeInTheDocument();
  });

  it("segmented compile: renders a combined preview and explains the render handoff", () => {
    compileProjectQueryMock.mockReturnValue({
      data: {
        kind: "segmented",
        parts: [COMPILED.config, { ...COMPILED.config, id: "compiled-2", durationInFrames: 60 }],
        concat: { parts: [{ index: 0, durationInFrames: 240 }, { index: 1, durationInFrames: 60 }] },
        cost: COMPILED.cost,
      },
      isLoading: false,
      isError: false,
    });
    renderPanel();
    expect(screen.getByTestId("vs-timeline-segmented-warning")).toBeInTheDocument();
    expect(screen.getByTestId("video-studio-remotion-preview")).toBeInTheDocument();
  });
});

describe("TimelineStagePanel — undo/redo (G7/AC15) + drag", () => {
  it("a drag along the timeline emits edits and undoes in a single step", () => {
    const doc = docWithLayers([textLayer()]);
    const { onDocumentChange } = renderPanel({ document: doc });

    const handle = screen
      .getAllByTestId("vs-clip-drag")
      .find((el) => el.closest("[data-clip-id='layer:scene-1:layer_overlay_1']"));
    expect(handle).toBeDefined();

    fireEvent.pointerDown(handle!, { clientX: 0, clientY: 10 });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 10 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    const lastCall = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(lastCall.scenes[0].layers[0].startFrame).not.toBe(0);

    onDocumentChange.mockClear();
    fireEvent.click(screen.getByTestId("vs-undo"));
    const undone = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(undone.scenes[0].layers[0].startFrame).toBe(0);
  });

  it("a locked clip renders no drag handle at all (refuses to drag)", () => {
    const doc = docWithLayers([textLayer({ locked: true })]);
    renderPanel({ document: doc });
    expect(screen.queryByTestId("vs-clip-drag")).not.toBeInTheDocument();
  });
});

describe("TimelineStagePanel — audio-track controls (P3 §4.8/§6)", () => {
  function docWithMusicTrack(): VideoProjectDocument {
    return { ...docWithLayers([]), audioTracks: [{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }] };
  }

  it("selecting the audio clip shows the AudioTrackInspectorPanel and edits are undoable (G7/AC15)", () => {
    const doc = docWithMusicTrack();
    const { onDocumentChange } = renderPanel({ document: doc });

    // Select the music clip (its own row in the scrolling clip strip).
    fireEvent.click(
      screen.getAllByTestId("vs-timeline-clip").find((el) => el.getAttribute("data-clip-id") === "audio:0")!,
    );

    const inspector = screen.getByTestId("vs-inspector");
    const slider = inspector.querySelector('[data-testid="vs-audio-volume"] [role="slider"]')!;
    expect(slider).toHaveAttribute("aria-valuenow", "-14");

    onDocumentChange.mockClear();
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    const afterEdit = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(afterEdit.audioTracks[0]).toMatchObject({ gainDb: -13 });

    onDocumentChange.mockClear();
    fireEvent.click(screen.getByTestId("vs-undo"));
    const undone = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(undone.audioTracks[0]).toMatchObject({ gainDb: -14 });
  });

  it("toggling ducking from the inspector updates the document and undoes", () => {
    const doc = docWithMusicTrack();
    const { onDocumentChange } = renderPanel({ document: doc });
    fireEvent.click(
      screen.getAllByTestId("vs-timeline-clip").find((el) => el.getAttribute("data-clip-id") === "audio:0")!,
    );
    const inspector = screen.getByTestId("vs-inspector");
    const duckingSwitch = inspector.querySelector('[data-testid="vs-audio-ducking"] input')!;

    onDocumentChange.mockClear();
    fireEvent.click(duckingSwitch);
    const afterEdit = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(afterEdit.audioTracks[0]).toMatchObject({ ducking: false });

    fireEvent.click(screen.getByTestId("vs-undo"));
    const undone = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(undone.audioTracks[0]).toMatchObject({ ducking: true });
  });

  it("setting a bounded span from the inspector produces a valid start<end span within the document duration", () => {
    const doc = docWithMusicTrack();
    const { onDocumentChange } = renderPanel({ document: doc });
    fireEvent.click(
      screen.getAllByTestId("vs-timeline-clip").find((el) => el.getAttribute("data-clip-id") === "audio:0")!,
    );
    const inspector = screen.getByTestId("vs-inspector");
    // Turn on the "custom time range" switch (span was implicit/full-video).
    const spanToggle = inspector.querySelectorAll('input[role="switch"]')[1];
    fireEvent.click(spanToggle);

    const span = inspector.querySelector('[data-testid="vs-audio-span"]')!;
    const startInput = span.querySelectorAll("input")[0];
    fireEvent.change(startInput, { target: { value: "1000" } });
    fireEvent.blur(startInput);

    const afterEdit = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    const track = afterEdit.audioTracks[0];
    expect(track.kind).toBe("music");
    if (track.kind === "music") {
      expect(track.startMs).toBe(1000);
      expect(track.endMs).toBeGreaterThan(track.startMs!);
      expect(track.endMs!).toBeLessThanOrEqual(afterEdit.format.durationMs);
    }
  });
});

describe("TimelineStagePanel — inspector brand-lock constraint (§4.8)", () => {
  it("constrains the color/font fields to the locked brand token", () => {
    const doc = { ...docWithLayers([textLayer({ color: "#000000", fontFamily: "Sarabun" })]), brandKitId: "1" };
    brandKitsListQueryMock.mockReturnValue({
      data: [
        {
          id: 1,
          colors: { primary: "#ff0000" },
          fonts: { body: "Prompt" },
          locks: { colors: true, fonts: true },
        },
      ],
    });
    renderPanel({ document: doc });

    fireEvent.click(
      screen.getAllByTestId("vs-timeline-clip").find((el) => el.getAttribute("data-clip-id") === "layer:scene-1:layer_overlay_1")!,
    );

    const inspector = screen.getByTestId("vs-inspector");
    const colorInput = screen.getByTestId("vs-inspector-color") as HTMLInputElement;
    const fontInput = screen.getByTestId("vs-inspector-font") as HTMLInputElement;
    expect(colorInput).toBeDisabled();
    expect(fontInput).toBeDisabled();
    expect(colorInput.value).toBe("#ff0000");
    expect(fontInput.value).toBe("Prompt");
    expect(inspector.querySelector('[data-testid="vs-inspector-color-locked-hint"]')).not.toBeNull();
    expect(inspector.querySelector('[data-testid="vs-inspector-font-locked-hint"]')).not.toBeNull();
  });
});

describe("TimelineStagePanel — keyboard (§4.5)", () => {
  it("arrow-right nudges the selected clip by exactly one frame", () => {
    const doc = docWithLayers([textLayer()]);
    const { onDocumentChange } = renderPanel({ document: doc });

    fireEvent.click(
      screen.getAllByTestId("vs-timeline-clip").find((el) => el.getAttribute("data-clip-id") === "layer:scene-1:layer_overlay_1")!,
    );
    onDocumentChange.mockClear();
    fireEvent.keyDown(window, { key: "ArrowRight" });

    const next = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(next.scenes[0].layers[0].startFrame).toBe(1);
  });
});

describe("TimelineStagePanel — autosave (§4.5)", () => {
  it("does not autosave while a drag gesture is open, autosaves after idle once it ends", () => {
    vi.useFakeTimers();
    const doc = docWithLayers([textLayer()]);
    renderPanel({ document: doc });

    const handle = screen
      .getAllByTestId("vs-clip-drag")
      .find((el) => el.closest("[data-clip-id='layer:scene-1:layer_overlay_1']"));
    fireEvent.pointerDown(handle!, { clientX: 0, clientY: 10 });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 10 }));
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(saveDocumentMutateMock).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(saveDocumentMutateMock).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("TimelineStagePanel — save conflict recovery (§4.13/RK4)", () => {
  it("offers 'keep my edits', reloads the server doc and re-applies local layers", async () => {
    const doc = docWithLayers([textLayer()]);
    const { onDocumentChange, onRevisionSaved } = renderPanel({ document: doc });

    fireEvent.click(
      screen.getAllByTestId("vs-timeline-clip").find((el) => el.getAttribute("data-clip-id") === "layer:scene-1:layer_overlay_1")!,
    );
    // Local edit (nudge by one frame) — must survive the conflict reload.
    fireEvent.keyDown(window, { key: "ArrowRight" });

    // Simulate the server rejecting the (eventual) autosave with CONFLICT —
    // `saveDocumentOpts` is bound at mount by the `useMutation` mock, so this
    // doesn't need to wait for the real ~1.5s autosave timer to fire first.
    act(() => {
      (saveDocumentOpts.onError as (e: unknown) => void)({ data: { code: "CONFLICT" } });
    });
    expect(screen.getByTestId("vs-timeline-conflict-banner")).toBeInTheDocument();

    const freshDoc = docWithLayers([]);
    (freshDoc.scenes[0] as unknown as { narration: string }).narration = "updated elsewhere";
    getFetchMock.mockResolvedValue({ document: freshDoc, revision: 99 });

    fireEvent.click(screen.getByTestId("vs-timeline-conflict-keep-mine"));

    await waitFor(() => expect(onRevisionSaved).toHaveBeenCalledWith(99, expect.anything()));
    const merged = onRevisionSaved.mock.calls.at(-1)?.[1] as VideoProjectDocument;
    // The local edit (the nudged layer) survived the reload.
    expect(merged.scenes[0].layers[0].id).toBe("layer_overlay_1");
    expect(merged.scenes[0].layers[0].startFrame).toBe(1);
    // The fresh server document's own field (outside scene.layers) came
    // through unmodified.
    expect((merged.scenes[0] as unknown as { narration: string }).narration).toBe("updated elsewhere");

    const lastEmitted = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(lastEmitted.scenes[0].layers[0].startFrame).toBe(1);
  });
});

describe("TimelineStagePanel — P3 launchers (G9)", () => {
  function mockPickerAssets(items: Array<{ assetId: number; storageUrl: string; kind: "image" | "video" | "audio" }>) {
    listPickerAssetsQueryMock.mockReturnValue({
      data: { items: items.map((item) => ({ ...item, sha256: "h" })), nextOffset: null },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });
  }

  it("ใส่วิดีโอพื้นหลัง: produces a full-bleed background video layer starting at 0, spanning the document duration", async () => {
    mockPickerAssets([{ assetId: 10, storageUrl: "https://example.com/api/storage/files/bg.mp4", kind: "video" }]);
    const { onDocumentChange } = renderPanel();

    fireEvent.click(screen.getByTestId("vs-launcher-background"));
    const item = await screen.findByTestId("asset-picker-item");
    fireEvent.click(item);

    await waitFor(() => expect(onDocumentChange).toHaveBeenCalled());
    const next = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    const layer = next.scenes[0].layers[0];
    expect(layer.type).toBe("video");
    expect(layer.role).toBe("background");
    expect(layer.x).toBe(0);
    expect(layer.y).toBe(0);
    expect(layer.width).toBe(100);
    expect(layer.height).toBe(100);
    expect(layer.startFrame).toBe(0);
    // No probed duration (mocked null) -> falls back to the document's own
    // duration: 8000ms @30fps = 240 frames.
    expect(layer.durationFrames).toBe(240);
  });

  it("ใส่ข้อความ: produces an overlay text layer with no asset picker involved", () => {
    const { onDocumentChange } = renderPanel();

    fireEvent.click(screen.getByTestId("vs-launcher-text"));

    expect(screen.queryByTestId("vs-launcher-asset-picker")).not.toBeInTheDocument();
    const next = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    const layer = next.scenes[0].layers[0];
    expect(layer.type).toBe("text");
    expect(layer.role).toBe("overlay");
    expect(layer.startFrame).toBe(0);
  });

  it("ใส่โลโก้/ลายน้ำ: persists a project-level brand overlay", async () => {
    mockPickerAssets([{ assetId: 20, storageUrl: "https://example.com/api/storage/files/logo.png", kind: "image" }]);
    const { onDocumentChange } = renderPanel();

    fireEvent.click(screen.getByTestId("vs-launcher-logo"));
    const item = await screen.findByTestId("asset-picker-item");
    fireEvent.click(item);

    await waitFor(() => expect(onDocumentChange).toHaveBeenCalled());
    const next = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(next.scenes[0].layers).toHaveLength(0);
    expect(next.watermark).toMatchObject({
      enabled: true,
      assetId: 20,
      position: "top_right",
      opacity: 0.45,
      scalePct: 10,
    });
  });

  it("ใส่เพลงประกอบ: adds a music audio track (document.audioTracks), never a scene.layers entry", async () => {
    mockPickerAssets([{ assetId: 30, storageUrl: "https://example.com/api/storage/files/song.mp3", kind: "audio" }]);
    const { onDocumentChange } = renderPanel();

    fireEvent.click(screen.getByTestId("vs-launcher-music"));
    const item = await screen.findByTestId("asset-picker-item");
    fireEvent.click(item);

    await waitFor(() => expect(onDocumentChange).toHaveBeenCalled());
    const next = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    expect(next.audioTracks).toHaveLength(1);
    expect(next.audioTracks[0].kind).toBe("music");
    if (next.audioTracks[0].kind === "music") {
      expect(next.audioTracks[0].assetRefs).toEqual([30]);
    }
    expect(next.scenes[0].layers).toHaveLength(0);
  });

  it("40/40 budget: every launcher is disabled with the remedy inline (never a toast)", () => {
    getLayerBudgetQueryMock.mockReturnValue({
      data: {
        handAuthoredLayers: 0,
        templateLayers: 0,
        captionLayers: 0,
        audioLayers: 0,
        hiddenLayers: 0,
        compiledTotal: 40,
        max: 40,
      },
      isLoading: false,
    });
    renderPanel();

    expect(screen.getByTestId("vs-launcher-background")).toBeDisabled();
    expect(screen.getByTestId("vs-launcher-text")).toBeDisabled();
    expect(screen.getByTestId("vs-launcher-logo")).toBeDisabled();
    expect(screen.getByTestId("vs-launcher-music")).toBeDisabled();
    expect(screen.getByTestId("vs-launcher-budget-full")).toBeInTheDocument();
  });
});

describe("TimelineStagePanel — background concatenation (G3)", () => {
  function docWithBackgroundClip(): VideoProjectDocument {
    return docWithLayers([
      {
        id: "bg-1",
        type: "video",
        startFrame: 0,
        durationFrames: 90, // 3000ms @30fps
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotationDeg: 0,
        opacity: 1,
        zIndex: 0,
        role: "background",
        src: "https://example.com/a.mp4",
        trimStartSec: 0,
        volume: 1,
        muted: false,
      } as RemotionLayer,
    ]);
  }

  it("does not show 'ต่อคลิป' before any background clip exists", () => {
    renderPanel();
    expect(screen.queryByTestId("vs-concat-clip")).not.toBeInTheDocument();
  });

  it("ต่อคลิป appends a new background clip CONTIGUOUSLY after the last one, same band/geometry, no transition implied", async () => {
    listPickerAssetsQueryMock.mockReturnValue({
      data: {
        items: [{ assetId: 50, storageUrl: "https://example.com/api/storage/files/b.mp4", sha256: "h", kind: "video" }],
        nextOffset: null,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });
    probeMediaDurationMsMock.mockResolvedValue(2000); // the new clip's own 2s duration

    const { onDocumentChange } = renderPanel({ document: docWithBackgroundClip() });
    expect(screen.getByTestId("vs-concat-clip")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vs-concat-clip"));
    const item = await screen.findByTestId("asset-picker-item");
    fireEvent.click(item);

    await waitFor(() => expect(onDocumentChange).toHaveBeenCalled());
    const next = onDocumentChange.mock.calls.at(-1)?.[0] as VideoProjectDocument;
    const layers = next.scenes[0].layers;
    expect(layers).toHaveLength(2);
    const appended = layers.find((l) => l.id !== "bg-1")!;
    // bg-1 ends at 90 frames (3000ms) — the appended clip must start exactly there.
    expect(appended.startFrame).toBe(90);
    expect(appended.durationFrames).toBe(60); // 2000ms probed @30fps
    expect(appended.role).toBe("background");
    expect(appended.x).toBe(0);
    expect(appended.width).toBe(100);
  });
});
