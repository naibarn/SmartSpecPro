/**
 * VideoStudioWorkspacePage coverage (Feature 133, section-08). Proves the
 * stage rail advances between panels, and that clicking the Render stage's
 * "Render final" button calls `queueRender`. Same hand-rolled `@/lib/trpc`
 * mock convention as the rest of this codebase's page tests — sub-panels
 * are the REAL components (not mocked), but only the active stage's panel
 * ever mounts (conditional rendering), so only its hooks need mock data.
 */
import { fireEvent, render, screen } from "@testing-library/react";
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

let queueRenderState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: { message: string } | null;
} = { isPending: false, isError: false, isSuccess: false, error: null };

let runScenePlanResult: { jobId: string; traceId: string; estimate: unknown } | null = null;
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
  },
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
      compileProject: { useQuery: (...args: unknown[]) => compileProjectQueryMock(...args) },
      getRenderCostEstimate: { useQuery: (...args: unknown[]) => costEstimateQueryMock(...args) },
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
      getStageEstimate: { useQuery: (...args: unknown[]) => getStageEstimateQueryMock(...args) },
      listRevisions: { useQuery: (...args: unknown[]) => listRevisionsQueryMock(...args) },
      restoreRevision: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => restoreRevisionMutateMock(input, opts),
          isPending: false,
        }),
      },
      getActiveGenerationJob: { useQuery: (...args: unknown[]) => getActiveGenerationJobQueryMock(...args) },
      getGenerationJobStatus: {
        useQuery: (...args: unknown[]) => getGenerationJobStatusQueryMock(...args),
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
      runQualityReview: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      applyQualityRepairs: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      runNarrationStage: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      listMotionTemplates: { useQuery: () => ({ data: [] }) },
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
};

beforeEach(() => {
  // Astryx `Dialog`/`AlertDialog` render a native <dialog> and call
  // showModal()/close() on it — jsdom does not implement these
  // (`CatalogCreateDialog.test.tsx:20-27`).
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });

  vi.clearAllMocks();
  queueRenderState = { isPending: false, isError: false, isSuccess: false, error: null };
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
  getActiveGenerationJobQueryMock.mockReturnValue({ data: null });
  getGenerationJobStatusQueryMock.mockImplementation((args: { jobId: string }) => ({
    data: jobStatusesByJobId[args.jobId],
  }));
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
});

describe("VideoStudioWorkspacePage — stage rail + render", () => {
  it("defaults to the Brief stage panel", () => {
    render(<VideoStudioWorkspacePage />);
    expect(screen.getByTestId("video-studio-brief-panel")).toBeInTheDocument();
  });

  it("advances to the Scenes stage panel when its stage rail button is clicked", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-scenes"));
    expect(screen.getByTestId("video-studio-scenes-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("video-studio-brief-panel")).not.toBeInTheDocument();
  });

  it("advances to the Render stage panel and shows the compiled preview", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    expect(screen.getByTestId("video-studio-render-panel")).toBeInTheDocument();
    expect(screen.getByTestId("video-studio-remotion-preview")).toBeInTheDocument();
  });

  it("calls queueRender with profile 'final' when the Render final button is clicked", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    fireEvent.click(screen.getByText("เรนเดอร์ไฟล์จริง"));
    expect(queueRenderMutateMock).toHaveBeenCalledWith(
      { projectId: 42, profile: "final" },
      expect.anything(),
    );
  });

  it("calls queueRender with profile 'preview' when the Render preview button is clicked", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    fireEvent.click(screen.getByText("เรนเดอร์ตัวอย่าง"));
    expect(queueRenderMutateMock).toHaveBeenCalledWith(
      { projectId: 42, profile: "preview" },
      expect.anything(),
    );
  });

  it("shows breadcrumb links back to the Dashboard and the Video Studio list", () => {
    render(<VideoStudioWorkspacePage />);
    const dashboardLink = screen.getByRole("link", { name: /dashboard|แดชบอร์ด/i });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
    const listLink = screen.getByRole("link", { name: /video studio|สตูดิโอวิดีโอ/i });
    expect(listLink).toHaveAttribute("href", "/video-studio");
  });
});

describe("VideoStudioWorkspacePage — section-07 client surfaces wiring", () => {
  it("passes hasUnsavedChanges into the Scenes and QA panels", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-scenes"));
    fireEvent.click(screen.getByText("เพิ่มฉาก")); // Add scene -> draft diverges from saved

    expect(screen.getByTestId("video-studio-run-scene-plan-blocked")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("video-studio-stage-qa"));
    expect(screen.getByTestId("video-studio-run-quality-review-blocked")).toBeInTheDocument();
  });

  it("does not dispatch a stage while the workspace holds unsaved changes", () => {
    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-scenes"));
    fireEvent.click(screen.getByText("เพิ่มฉาก"));

    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    expect(runScenePlanMutateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("video-studio-stage-estimate-dialog")).not.toBeInTheDocument();
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
    runScenePlanResult = { jobId: "scene-plan-job-1", traceId: "t1", estimate: {} };
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
    queueRenderState.error = { message: "VI_CLAIM_VIOLATION: 2 prohibited claims" };

    render(<VideoStudioWorkspacePage />);
    fireEvent.click(screen.getByTestId("video-studio-stage-render"));
    fireEvent.click(screen.getByText("ไปที่ขั้นตอนตรวจสอบคุณภาพ"));

    expect(screen.getByTestId("video-studio-qa-panel")).toBeInTheDocument();
  });
});
