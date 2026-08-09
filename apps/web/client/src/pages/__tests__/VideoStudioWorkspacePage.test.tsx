/**
 * VideoStudioWorkspacePage coverage (Feature 133, section-08). Proves the
 * stage rail advances between panels, and that clicking the Render stage's
 * "Render final" button calls `queueRender`. Same hand-rolled `@/lib/trpc`
 * mock convention as the rest of this codebase's page tests — sub-panels
 * are the REAL components (not mocked), but only the active stage's panel
 * ever mounts (conditional rendering), so only its hooks need mock data.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRouteMock = vi.fn();
const getProjectQueryMock = vi.fn();
const saveDocumentMutateMock = vi.fn();
const updateBriefMutateMock = vi.fn();
const compileProjectQueryMock = vi.fn();
const costEstimateQueryMock = vi.fn();
const queueRenderMutateMock = vi.fn();
const getStageEstimateQueryMock = vi.fn();
const listRevisionsQueryMock = vi.fn();
const restoreRevisionMutateMock = vi.fn();
const runScenePlanMutateMock = vi.fn();
const getActiveGenerationJobQueryMock = vi.fn();
const getGenerationJobStatusQueryMock = vi.fn();
const brandKitsListQueryMock = vi.fn();
const setBrandKitMutateMock = vi.fn();
const createBrandKitMutateMock = vi.fn();
const updateBrandKitMutateMock = vi.fn();
const deleteBrandKitMutateMock = vi.fn();
// Feature 143 (Video Studio — Layer & Timeline Editor), P1 — the compose
// stage's own hooks.
const getLayerBudgetQueryMock = vi.fn();
const getFeatureFlagsQueryMock = vi.fn();
const approveStageMutateMock = vi.fn();
const rejectStageMutateMock = vi.fn();
const updateAutomationModeMutateMock = vi.fn();
const getContentDraftQueryMock = vi.fn(() => ({ data: null }));
const listRecommendedStageModelsQueryMock = vi.fn(() => ({
  data: { models: [] },
}));

let queueRenderState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: { message: string } | null;
} = { isPending: false, isError: false, isSuccess: false, error: null };

let runScenePlanResult: {
  jobId: string;
  traceId: string;
  estimate: unknown;
} | null = null;
let jobStatusesByJobId: Record<string, unknown> = {};

vi.mock("wouter", () => ({
  useRoute: (...args: unknown[]) => useRouteMock(...args),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("@remotion/player", () => ({
  Player: () => <div data-testid="mock-remotion-player" />,
}));

const utilsStub = {
  videoProjects: {
    get: { invalidate: vi.fn() },
    exportCaptions: { fetch: vi.fn() },
    listRevisions: { invalidate: vi.fn() },
    getContentDraft: { invalidate: vi.fn() },
    brandKits: { list: { invalidate: vi.fn() } },
  },
};
const listPickerAssetsResult = {
  data: { items: [], nextOffset: null },
  isLoading: false,
  isFetching: false,
  isError: false,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => utilsStub,
    videoProjects: {
      get: { useQuery: (...args: unknown[]) => getProjectQueryMock(...args) },
      saveDocument: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => saveDocumentMutateMock(input, opts),
          isPending: false,
        }),
      },
      updateBrief: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => updateBriefMutateMock(input, opts),
          isPending: false,
        }),
      },
      compileProject: {
        useQuery: (...args: unknown[]) => compileProjectQueryMock(...args),
      },
      getRenderCostEstimate: {
        useQuery: (...args: unknown[]) => costEstimateQueryMock(...args),
      },
      queueRender: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => queueRenderMutateMock(input, opts),
          isPending: queueRenderState.isPending,
          isError: queueRenderState.isError,
          isSuccess: queueRenderState.isSuccess,
          error: queueRenderState.error,
        }),
      },
      // §5.6 ⚠️: extended FIRST — a panel adding a new hook crashes this
      // hand-rolled mock with an unhelpful "cannot read properties of
      // undefined" otherwise.
      getStageEstimate: {
        useQuery: (...args: unknown[]) => getStageEstimateQueryMock(...args),
      },
      listRevisions: {
        useQuery: (...args: unknown[]) => listRevisionsQueryMock(...args),
      },
      restoreRevision: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => restoreRevisionMutateMock(input, opts),
          isPending: false,
        }),
      },
      getActiveGenerationJob: {
        useQuery: (...args: unknown[]) =>
          getActiveGenerationJobQueryMock(...args),
      },
      getGenerationJobStatus: {
        useQuery: (...args: unknown[]) =>
          getGenerationJobStatusQueryMock(...args),
      },
      runScenePlanStage: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => {
            runScenePlanMutateMock(input, opts);
            if (runScenePlanResult) {
              (opts.onSuccess as (r: unknown) => void)?.(runScenePlanResult);
            }
          },
          isPending: false,
        }),
      },
      runAutoDraftStage: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      runContentDraft: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      acceptContentDraft: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getContentDraft: {
        useQuery: (...args: unknown[]) => getContentDraftQueryMock(...args),
      },
      listRecommendedStageModels: {
        useQuery: (...args: unknown[]) =>
          listRecommendedStageModelsQueryMock(...args),
      },
      runQualityReview: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      applyQualityRepairs: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      runNarrationStage: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      runMotionStage: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      selectMotionCandidate: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      listMotionTemplates: { useQuery: () => ({ data: [] }) },
      brandKits: {
        list: {
          useQuery: (...args: unknown[]) => brandKitsListQueryMock(...args),
        },
        create: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (input: unknown) => createBrandKitMutateMock(input, opts),
            isPending: false,
          }),
        },
        update: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (input: unknown) => updateBrandKitMutateMock(input, opts),
            isPending: false,
          }),
        },
        delete: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (input: unknown) => deleteBrandKitMutateMock(input, opts),
            isPending: false,
          }),
        },
      },
      setBrandKit: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => setBrandKitMutateMock(input, opts),
          isPending: false,
        }),
      },
      getLayerBudget: {
        useQuery: (...args: unknown[]) => getLayerBudgetQueryMock(...args),
      },
      createBrollPromptDraft: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
        }),
      },
      listPickerAssets: { useQuery: () => listPickerAssetsResult },
      approveStage: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => approveStageMutateMock(input, opts),
          isPending: false,
        }),
      },
      rejectStage: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => rejectStageMutateMock(input, opts),
          isPending: false,
        }),
      },
      updateAutomationMode: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) =>
            updateAutomationModeMutateMock(input, opts),
          isPending: false,
        }),
      },
    },
    media: {
      listTasks: {
        useQuery: () => ({
          data: { tasks: [] },
          isLoading: false,
          isFetching: false,
          isError: false,
        }),
      },
      generateImageAsync: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
        }),
      },
      generateVideoAsync: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
        }),
      },
      getTask: {
        useQuery: () => ({
          data: null,
          isLoading: false,
          isFetching: false,
          isError: false,
        }),
      },
    },
    mediaModels: {
      listRecommendedImageModels: {
        useQuery: () => ({
          data: { models: [] },
          isLoading: false,
          isError: false,
        }),
      },
      listRecommendedVideoModels: {
        useQuery: () => ({
          data: { models: [] },
          isLoading: false,
          isError: false,
        }),
      },
    },
    library: {
      listDocuments: {
        useQuery: () => ({
          data: { results: [] },
          isLoading: false,
          isFetching: false,
          isError: false,
        }),
      },
    },
    tenantFeatureFlags: {
      getFeatureFlags: {
        useQuery: (...args: unknown[]) => getFeatureFlagsQueryMock(...args),
      },
    },
  },
}));

import VideoStudioWorkspacePage from "../VideoStudioWorkspacePage";

const DOCUMENT = {
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

const PROJECT = {
  id: 42,
  name: "My Motion Project",
  studioType: "motion",
  status: "brief",
  brief: {},
  document: DOCUMENT,
  revision: 3,
  automationMode: "guided",
};

beforeEach(() => {
  // Astryx `Dialog`/`AlertDialog` render a native <dialog> and call
  // showModal()/close() on it — jsdom does not implement these
  // (`CatalogCreateDialog.test.tsx:20-27`).
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });

  vi.clearAllMocks();
  queueRenderState = {
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  };
  runScenePlanResult = null;
  jobStatusesByJobId = {};

  useRouteMock.mockReturnValue([true, { id: "42" }]);
  getProjectQueryMock.mockReturnValue({
    data: PROJECT,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  getStageEstimateQueryMock.mockReturnValue({
    data: {
      stage: "scene_plan",
      modelId: "openrouter/gpt-x-structured",
      maxLoops: 1,
      perRoundCredits: 5,
      typicalCredits: 5,
      ceilingCredits: 25,
      callsPerRoundCeiling: 5,
      basis: {
        sceneCount: 1,
        narrationChars: 0,
        captionChars: 0,
        layerCount: 0,
        claimCount: 0,
        estimatedInputTokens: 200,
        estimatedOutputTokens: 100,
      },
      isCeiling: true,
    },
    isLoading: false,
    error: undefined,
  });
  listRevisionsQueryMock.mockReturnValue({ data: [] });
  brandKitsListQueryMock.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
  });
  getActiveGenerationJobQueryMock.mockReturnValue({ data: null });
  getGenerationJobStatusQueryMock.mockImplementation(
    (args: { jobId: string }) => ({
      data: jobStatusesByJobId[args.jobId],
    })
  );
  compileProjectQueryMock.mockReturnValue({
    data: {
      kind: "single",
      config: {
        id: "compiled",
        name: "compiled",
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 240,
        layers: [],
      },
      cost: { estimatedCredits: 10, estimatedUsd: 0.5 },
    },
    isLoading: false,
    isError: false,
  });
  costEstimateQueryMock.mockReturnValue({
    data: { cost: { estimatedCredits: 10, estimatedUsd: 0.5 } },
  });
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
  getFeatureFlagsQueryMock.mockReturnValue({
    data: { remotionRenderVideoJobEnabled: true },
    isLoading: false,
  });
});

describe("VideoStudioWorkspacePage — stage rail + render", () => {
  it("persists the explicit guided/manual workflow mode", () => {
    render(<VideoStudioWorkspacePage />);
    const modeSelector = screen.getByTestId("video-studio-automation-mode");
    const modeTrigger = within(modeSelector).getByRole("combobox");
    fireEvent.keyDown(modeTrigger, { key: "ArrowDown" });
    fireEvent.keyDown(modeTrigger, { key: "ArrowDown" });
    fireEvent.keyDown(modeTrigger, { key: "Enter" });

    expect(updateAutomationModeMutateMock).toHaveBeenCalledWith(
      { projectId: 42, automationMode: "manual" },
      expect.anything()
    );
  });

  it("defaults to the Brief stage panel", () => {
    render(<VideoStudioWorkspacePage />);
    expect(screen.getByTestId("video-studio-brief-panel")).toBeInTheDocument();
  });

  it("advances to the Scenes stage panel when its stage rail button is clicked", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-scenes"));
    expect(screen.getByTestId("video-studio-scenes-panel")).toBeInTheDocument();
    expect(
      screen.queryByTestId("video-studio-brief-panel")
    ).not.toBeInTheDocument();
  });

  it("keeps the media history panel visible outside the compose stage", () => {
    render(<VideoStudioWorkspacePage />);
    expect(screen.getByTestId("video-studio-asset-dock")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("video-studio-stage-scenes"));
    expect(screen.getByTestId("video-studio-asset-dock")).toBeInTheDocument();
  });

  it("shows a dedicated B-roll stage with one composer and timing range per scene", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-broll"));
    expect(screen.getByTestId("video-studio-broll-panel")).toBeInTheDocument();
    expect(
      screen.getByTestId("video-studio-broll-scene-card")
    ).toBeInTheDocument();
    expect(
      screen.getByText("ช่วงเวลาใน timeline: 0:00 – 0:08")
    ).toBeInTheDocument();
    expect(screen.getByText("สร้าง B-roll จากเนื้อหาฉาก")).toBeInTheDocument();
    expect(
      screen.getByTestId("video-studio-broll-image-slot")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("video-studio-broll-video-slot")
    ).toBeInTheDocument();
  });

  it("advances to the Render stage panel and shows the compiled preview", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    expect(screen.getByTestId("video-studio-render-panel")).toBeInTheDocument();
    expect(
      screen.getByTestId("video-studio-remotion-preview")
    ).toBeInTheDocument();
  });

  it("opens a confirm dialog (does not call queueRender directly) when the Render final button is clicked", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    fireEvent.click(screen.getByText("เรนเดอร์ไฟล์จริง"));
    expect(queueRenderMutateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("render-final-confirm")).toBeInTheDocument();
  });

  it("calls queueRender with profile 'final' only after the confirm dialog's action is clicked", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    fireEvent.click(screen.getByText("เรนเดอร์ไฟล์จริง"));
    fireEvent.click(screen.getByText("ยืนยันเรนเดอร์ไฟล์จริง"));
    expect(queueRenderMutateMock).toHaveBeenCalledWith(
      { projectId: 42, profile: "final" },
      expect.anything()
    );
  });

  it("calls queueRender with profile 'preview' directly (no confirm dialog) when the Render preview button is clicked", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    fireEvent.click(screen.getByText("เรนเดอร์ตัวอย่าง"));
    expect(queueRenderMutateMock).toHaveBeenCalledWith(
      { projectId: 42, profile: "preview" },
      expect.anything()
    );
  });

  /**
   * Regression: a freshly created project has `document: null` until the user
   * initializes it in the Brief stage. Every other stage is gated on
   * `draftDocument`, but Render was not — so it mounted `RenderPanel`, which
   * fired `compileProject`/`getRenderCostEstimate` (both enabled because
   * `hasUnsavedChanges` is false when the draft is still null) and the server
   * threw `VI_DOCUMENT_INVALID`, surfacing a raw Zod dump to the user instead
   * of the friendly "initialize it in the Brief stage first" banner.
   *
   * Fixed and deployed 2026-08-02, BEFORE this feature branch existed; the
   * branch was cut from an older HEAD, so this test is re-applied here to stop
   * the merge silently reverting the fix.
   */
  it("does not mount the Render panel (and fires no compile query) when the project has no document yet", () => {
    getProjectQueryMock.mockReturnValue({
      data: { ...PROJECT, document: null },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));

    expect(
      screen.queryByTestId("video-studio-render-panel")
    ).not.toBeInTheDocument();
    expect(compileProjectQueryMock).not.toHaveBeenCalled();
    expect(costEstimateQueryMock).not.toHaveBeenCalled();
  });

  it("shows breadcrumb links back to the Dashboard and the Video Studio list", () => {
    render(<VideoStudioWorkspacePage />);
    const dashboardLink = screen.getByRole("link", {
      name: /dashboard|แดชบอร์ด/i,
    });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
    const listLink = screen.getByRole("link", {
      name: /video studio|สตูดิโอวิดีโอ/i,
    });
    expect(listLink).toHaveAttribute("href", "/video-studio");
  });
});

describe("VideoStudioWorkspacePage — section-07 client surfaces wiring", () => {
  it("passes hasUnsavedChanges into the Scenes and QA panels", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-scenes"));
    fireEvent.click(screen.getByText("เพิ่มฉาก")); // Add scene -> draft diverges from saved

    expect(
      screen.getByTestId("video-studio-run-scene-plan-blocked")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("video-studio-stage-qa"));
    expect(
      screen.getByTestId("video-studio-run-quality-review-blocked")
    ).toBeInTheDocument();
  });

  it("does not dispatch a stage while the workspace holds unsaved changes", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-scenes"));
    fireEvent.click(screen.getByText("เพิ่มฉาก"));

    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    expect(runScenePlanMutateMock).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("video-studio-stage-estimate-dialog")
    ).not.toBeInTheDocument();
  });

  it("refetches the project after a stage job completes (onDocumentSaved)", () => {
    const refetchMock = vi.fn();
    getProjectQueryMock.mockReturnValue({
      data: PROJECT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    });
    runScenePlanResult = {
      jobId: "scene-plan-job-1",
      traceId: "t1",
      estimate: {},
    };
    jobStatusesByJobId["scene-plan-job-1"] = {
      status: "succeeded",
      error: null,
      progress: null,
      result: { kind: "scene_plan", creditsUsed: 5 },
    };

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-scenes"));
    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(refetchMock).toHaveBeenCalled();
  });

  it("navigates to the QA stage from the RenderPanel claim-violation action", () => {
    queueRenderState.isError = true;
    queueRenderState.error = {
      message: "VI_CLAIM_VIOLATION: 2 prohibited claims",
    };

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    fireEvent.click(screen.getByText("ไปที่ขั้นตอนตรวจสอบคุณภาพ"));

    expect(screen.getByTestId("video-studio-qa-panel")).toBeInTheDocument();
  });
});

describe("VideoStudioWorkspacePage — stage rail per-stage state (this task)", () => {
  function dotFor(stage: string) {
    return screen
      .getAllByTestId("stage-rail-state")
      .find(el => el.getAttribute("data-stage") === stage);
  }

  it("shows brief as done and every other stage as empty for a fresh single-scene document", () => {
    render(<VideoStudioWorkspacePage />);
    expect(dotFor("brief")).toHaveAttribute("data-state", "done");
    expect(dotFor("scenes")).toHaveAttribute("data-state", "empty");
    expect(dotFor("narration")).toHaveAttribute("data-state", "empty");
    expect(dotFor("motion")).toHaveAttribute("data-state", "empty");
    expect(dotFor("captions")).toHaveAttribute("data-state", "empty");
    expect(dotFor("qa")).toHaveAttribute("data-state", "empty");
    expect(dotFor("render")).toHaveAttribute("data-state", "empty");
  });

  it("shows scenes and motion as running while a scene_plan job is active", () => {
    getActiveGenerationJobQueryMock.mockReturnValue({
      data: { jobId: "j1", kind: "scene_plan", status: "running" },
    });
    render(<VideoStudioWorkspacePage />);
    expect(dotFor("scenes")).toHaveAttribute("data-state", "running");
    expect(dotFor("motion")).toHaveAttribute("data-state", "running");
  });

  it("shows qa and render as error when the document has a prohibited claim", () => {
    getProjectQueryMock.mockReturnValue({
      data: {
        ...PROJECT,
        document: {
          ...DOCUMENT,
          claims: [
            {
              claim: "cures everything",
              source: "scene-1",
              status: "prohibited",
            },
          ],
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<VideoStudioWorkspacePage />);
    expect(dotFor("qa")).toHaveAttribute("data-state", "error");
    expect(dotFor("render")).toHaveAttribute("data-state", "error");
  });

  it("does not render stage dots before the project has loaded", () => {
    getProjectQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<VideoStudioWorkspacePage />);
    expect(screen.queryAllByTestId("stage-rail-state")).toHaveLength(0);
  });

  // Feature 143 §2.1 D1 — the compose stage's dot must NEVER render `empty`.
  it("never shows the compose stage dot as empty, even for a fresh document with zero hand-authored layers", () => {
    render(<VideoStudioWorkspacePage />);
    expect(dotFor("compose")).not.toHaveAttribute("data-state", "empty");
    expect(dotFor("compose")).toHaveAttribute("data-state", "drafted");
  });
});

describe("VideoStudioWorkspacePage — compose stage (Feature 143 P1)", () => {
  it("advances to the compose (timeline) stage panel when its stage rail button is clicked", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-compose"));
    expect(screen.getByTestId("vs-timeline-stage")).toBeInTheDocument();
    expect(screen.getByTestId("vs-budget-meter")).toBeInTheDocument();
  });

  it("shows the sourced budget breakdown and the 40/40 remedies inline (§4.6, AC11)", () => {
    getLayerBudgetQueryMock.mockReturnValue({
      data: {
        handAuthoredLayers: 4,
        templateLayers: 18,
        captionLayers: 16,
        audioLayers: 2,
        hiddenLayers: 0,
        compiledTotal: 40,
        max: 40,
      },
      isLoading: false,
    });
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-compose"));
    const meter = screen.getByTestId("vs-budget-meter");
    expect(within(meter).getAllByText(/40\/40/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("vs-budget-meter-remedies")).toBeInTheDocument();
  });

  it("shows the empty-state launchers when the document has no hand-authored layers", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-compose"));
    expect(
      screen.getByTestId("vs-timeline-empty-launchers")
    ).toBeInTheDocument();
  });

  it("shows the read-only banner while a scene-timing-affecting generation job is active (§4.13)", () => {
    getActiveGenerationJobQueryMock.mockReturnValue({
      data: { jobId: "j1", kind: "auto_draft", status: "running" },
    });
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-compose"));
    expect(
      screen.getByTestId("vs-timeline-readonly-banner")
    ).toBeInTheDocument();
  });

  it("does not show the read-only banner when no generation job is active", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-compose"));
    expect(
      screen.queryByTestId("vs-timeline-readonly-banner")
    ).not.toBeInTheDocument();
  });

  it("syncs selection between the Timeline and the LayerListPanel for a hand-authored clip", () => {
    getProjectQueryMock.mockReturnValue({
      data: {
        ...PROJECT,
        document: {
          ...DOCUMENT,
          scenes: [
            {
              ...DOCUMENT.scenes[0],
              layers: [
                {
                  id: "layer_overlay_1",
                  type: "text",
                  startFrame: 0,
                  durationFrames: 30,
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
                },
              ],
            },
          ],
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-compose"));

    const clipId = "layer:scene-1:layer_overlay_1";
    const timelineClip = screen
      .getAllByTestId("vs-timeline-clip")
      .find(el => el.getAttribute("data-clip-id") === clipId);
    expect(timelineClip).toBeDefined();

    // jsdom's default viewport (1024px) lands in the 1024-1280px band
    // (§4.14), where the permanent layer list is collapsed behind a
    // toggle — open it first.
    const layerListToggle = screen.getByRole("button", { name: "รายการคลิป" });
    fireEvent.click(layerListToggle);

    fireEvent.click(
      within(screen.getByTestId("vs-layer-list")).getAllByTestId(
        "vs-layer-list-row"
      )[0]
    );
    expect(timelineClip).toHaveAttribute("aria-pressed", "true");
    expect(timelineClip).toHaveAttribute("data-clip-id", clipId);
  });
});

describe("VideoStudioWorkspacePage — revision history (real-bug fix, unreachable listRevisions)", () => {
  it("opens the revision history dialog from the header trigger and lists revisions", () => {
    listRevisionsQueryMock.mockReturnValue({
      data: [
        {
          revision: 3,
          reason: "saveDocument",
          createdAt: "2026-01-02T00:00:00.000Z",
        },
        {
          revision: 2,
          reason: "restore:1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("revision-history-open"));

    const items = screen.getAllByTestId("revision-history-item");
    expect(items).toHaveLength(2);
  });

  it("restores a revision only after the confirm dialog's action is clicked, then refetches the project", () => {
    listRevisionsQueryMock.mockReturnValue({
      data: [
        {
          revision: 2,
          reason: "saveDocument",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
    });
    const refetchMock = vi.fn();
    getProjectQueryMock.mockReturnValue({
      data: PROJECT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("revision-history-open"));
    fireEvent.click(
      within(screen.getByTestId("revision-history-item")).getByText("กู้คืน")
    );
    expect(restoreRevisionMutateMock).not.toHaveBeenCalled();

    const confirmDialog = screen.getByTestId("revision-restore-confirm");
    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "กู้คืน" })
    );

    expect(restoreRevisionMutateMock).toHaveBeenCalledWith(
      { projectId: 42, revision: 2 },
      expect.anything()
    );

    // Simulate the mutation's onSuccess (this mock doesn't auto-resolve).
    const [, opts] = restoreRevisionMutateMock.mock.calls[0] as [
      unknown,
      { onSuccess?: () => void },
    ];
    act(() => opts.onSuccess?.());
    expect(refetchMock).toHaveBeenCalled();
  });
});

describe("VideoStudioWorkspacePage — brand kit dialog wiring", () => {
  it("opens the brand kit dialog from the header trigger and lists brand kits in the attach selector", () => {
    brandKitsListQueryMock.mockReturnValue({
      data: [
        {
          id: 7,
          name: "Acme brand",
          colors: { primary: "#111111" },
          fonts: { heading: "Inter", body: "Inter" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("brand-kit-open"));

    expect(
      screen.getByTestId("video-studio-brand-kit-dialog")
    ).toBeInTheDocument();
    expect(screen.getByTestId("brand-kit-select")).toBeInTheDocument();
    expect(screen.getByTestId("brand-kit-none-attached")).toBeInTheDocument();
  });

  it("attaches a brand kit with the project's current revision as baseRevision, then refetches the project", () => {
    const refetchMock = vi.fn();
    getProjectQueryMock.mockReturnValue({
      data: PROJECT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    });
    brandKitsListQueryMock.mockReturnValue({
      data: [
        {
          id: 7,
          name: "Acme brand",
          colors: { primary: "#111111" },
          fonts: { heading: "Inter", body: "Inter" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("brand-kit-open"));
    fireEvent.click(screen.getByTestId("brand-kit-select"));
    fireEvent.click(screen.getByRole("option", { name: "Acme brand" }));

    expect(setBrandKitMutateMock).toHaveBeenCalledWith(
      { projectId: 42, baseRevision: 3, brandKitId: 7 },
      expect.anything()
    );

    const [, opts] = setBrandKitMutateMock.mock.calls[0] as [
      unknown,
      { onSuccess?: (r: unknown) => void },
    ];
    act(() =>
      opts.onSuccess?.({ revision: 3, brandKitId: 7, documentUpdated: true })
    );
    expect(refetchMock).toHaveBeenCalled();
  });

  it("detaches the currently attached brand kit with brandKitId: null", () => {
    getProjectQueryMock.mockReturnValue({
      data: { ...PROJECT, brandKitId: 7 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    brandKitsListQueryMock.mockReturnValue({
      data: [
        {
          id: 7,
          name: "Acme brand",
          colors: { primary: "#111111" },
          fonts: { heading: "Inter", body: "Inter" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("brand-kit-open"));
    expect(screen.getByTestId("brand-kit-current-preview")).toHaveTextContent(
      "Acme brand"
    );

    fireEvent.click(screen.getByTestId("brand-kit-detach"));

    expect(setBrandKitMutateMock).toHaveBeenCalledWith(
      { projectId: 42, baseRevision: 3, brandKitId: null },
      expect.anything()
    );
  });

  it("shows a Thai message telling the user to initialize the document first when documentUpdated is false", async () => {
    const { toast } = await import("sonner");
    const infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "");
    brandKitsListQueryMock.mockReturnValue({
      data: [
        {
          id: 7,
          name: "Acme brand",
          colors: { primary: "#111111" },
          fonts: { heading: "Inter", body: "Inter" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("brand-kit-open"));
    fireEvent.click(screen.getByTestId("brand-kit-select"));
    fireEvent.click(screen.getByRole("option", { name: "Acme brand" }));

    const [, opts] = setBrandKitMutateMock.mock.calls[0] as [
      unknown,
      { onSuccess?: (r: unknown) => void },
    ];
    act(() =>
      opts.onSuccess?.({ revision: 3, brandKitId: 7, documentUpdated: false })
    );

    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("shows an empty-state invitation to create the first brand kit when none exist", () => {
    brandKitsListQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("brand-kit-open"));

    expect(screen.getByText("สร้าง Brand Kit แรก")).toBeInTheDocument();
  });

  it("creates a new brand kit with its name and the 6 lock toggles", () => {
    brandKitsListQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("brand-kit-open"));
    fireEvent.click(screen.getByText("สร้าง Brand Kit แรก"));

    fireEvent.change(screen.getByLabelText("ชื่อ Brand Kit"), {
      target: { value: "แบรนด์ทดสอบ" },
    });

    const lockToggles = screen.getAllByTestId("brand-kit-lock-toggle");
    expect(lockToggles).toHaveLength(6);
    fireEvent.click(within(lockToggles[0]).getByRole("switch"));

    fireEvent.click(screen.getByTestId("brand-kit-create"));

    expect(createBrandKitMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "แบรนด์ทดสอบ",
        locks: expect.objectContaining({ colors: true }),
      }),
      expect.anything()
    );
  });

  it("deletes a brand kit only after the confirm dialog's action is clicked", () => {
    brandKitsListQueryMock.mockReturnValue({
      data: [
        {
          id: 7,
          name: "Acme brand",
          colors: { primary: "#111111" },
          fonts: { heading: "Inter", body: "Inter" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("brand-kit-open"));
    fireEvent.click(
      within(screen.getByTestId("brand-kit-list-item")).getByText(
        "ลบ Brand Kit"
      )
    );
    expect(deleteBrandKitMutateMock).not.toHaveBeenCalled();

    const confirmDialog = screen.getByTestId("brand-kit-delete-confirm");
    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "ลบ Brand Kit" })
    );

    expect(deleteBrandKitMutateMock).toHaveBeenCalledWith(
      { brandKitId: 7 },
      expect.anything()
    );
  });
});
