/**
 * Feature 142, section-07 — `ScenesPanel` coverage. Same hand-rolled
 * `@/lib/trpc` mock convention as `QaPanel.test.tsx` / the workspace page
 * test: `useMutation` returns `{ mutate: (input) => mock(input, opts), ... }`
 * and simulates the tRPC success callback synchronously inside `mutate`.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

const getStageEstimateQueryMock = vi.fn();
const getActiveGenerationJobQueryMock = vi.fn();
const getGenerationJobStatusQueryMock = vi.fn();
const runScenePlanMutateMock = vi.fn();

let runScenePlanResult: { jobId: string; traceId: string; estimate: unknown } | null = null;
let jobStatusesByJobId: Record<string, unknown> = {};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      getStageEstimate: { useQuery: (...args: unknown[]) => getStageEstimateQueryMock(...args) },
      getActiveGenerationJob: { useQuery: (...args: unknown[]) => getActiveGenerationJobQueryMock(...args) },
      getGenerationJobStatus: { useQuery: (...args: unknown[]) => getGenerationJobStatusQueryMock(...args) },
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
    },
  },
}));

import { ScenesPanel } from "../ScenesPanel";
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

const ESTIMATE = {
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
};

function renderPanel(overrides: Partial<Parameters<typeof ScenesPanel>[0]> = {}) {
  const onChange = vi.fn();
  const onDocumentSaved = vi.fn();
  const utils = render(
    <ScenesPanel
      lang="en"
      projectId={42}
      document={BASE_DOCUMENT}
      onChange={onChange}
      projectRevision={3}
      hasUnsavedChanges={false}
      onDocumentSaved={onDocumentSaved}
      {...overrides}
    />,
  );
  return { ...utils, onChange, onDocumentSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  runScenePlanResult = null;
  jobStatusesByJobId = {};

  getActiveGenerationJobQueryMock.mockReturnValue({ data: null });
  getGenerationJobStatusQueryMock.mockImplementation((args: { jobId: string }) => ({
    data: jobStatusesByJobId[args.jobId],
  }));
  getStageEstimateQueryMock.mockReturnValue({ data: ESTIMATE, isLoading: false, error: undefined });
});

describe("ScenesPanel — estimate -> confirm gate (D4)", () => {
  it("shows the estimate dialog and does NOT run the stage until confirmed", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    expect(screen.getByTestId("video-studio-stage-estimate-dialog")).toBeInTheDocument();
    expect(runScenePlanMutateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));
    expect(runScenePlanMutateMock).toHaveBeenCalledTimes(1);
  });

  it("defaults the re-run mode to fill_empty", () => {
    renderPanel();
    const modeSelector = screen.getByTestId("video-studio-scene-plan-mode");
    expect(within(modeSelector).getByText("Plan only empty scenes")).toBeInTheDocument();
  });

  it("requires a confirmation for the destructive 'replace' re-run mode", () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("video-studio-scene-plan-mode"));
    fireEvent.click(screen.getByText("Re-plan everything (replaces existing)"));

    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    const confirmButton = screen.getByTestId("video-studio-stage-estimate-confirm");
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByTestId("video-studio-estimate-destructive-ack"));
    expect(confirmButton).not.toBeDisabled();
  });

  it("passes mode and baseRevision into runScenePlanStage", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(runScenePlanMutateMock).toHaveBeenCalledWith(
      { projectId: 42, baseRevision: 3, mode: "fill_empty" },
      expect.anything(),
    );
  });
});

describe("ScenesPanel — unsaved-changes guard", () => {
  it("blocks launch with a reason banner while there are unsaved changes", () => {
    renderPanel({ hasUnsavedChanges: true });
    expect(screen.getByTestId("video-studio-run-scene-plan-blocked")).toHaveTextContent(
      "unsaved changes",
    );
    expect(screen.getByTestId("video-studio-run-scene-plan")).toBeDisabled();
  });
});

describe("ScenesPanel — planner error copy", () => {
  it("surfaces VI_PLAN_LAYER_BUDGET_EXCEEDED / VI_PLAN_TIMELINE_INVALID as specific copy", () => {
    runScenePlanResult = { jobId: "plan-job-1", traceId: "t1", estimate: ESTIMATE };
    jobStatusesByJobId["plan-job-1"] = {
      status: "failed",
      error: "VI_PLAN_LAYER_BUDGET_EXCEEDED: the merged document compiles to 45 layers",
      progress: null,
    };

    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    const banner = screen.getByTestId("video-studio-scene-plan-error");
    expect(banner).toHaveTextContent("exceeds the 40-layer budget");
    expect(banner).toHaveTextContent("left unchanged");
    // The generic job-error banner must not ALSO render the raw code.
    expect(screen.queryByText(/VI_PLAN_LAYER_BUDGET_EXCEEDED/)).not.toBeInTheDocument();
  });

  it("does not echo a non-VI_ job error verbatim", () => {
    runScenePlanResult = { jobId: "plan-job-2", traceId: "t1", estimate: ESTIMATE };
    jobStatusesByJobId["plan-job-2"] = {
      status: "failed",
      error: "TypeError: unexpected worker crash",
      progress: null,
    };

    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(screen.queryByText(/unexpected worker crash/)).not.toBeInTheDocument();
    expect(screen.getByText(/The job failed/i)).toBeInTheDocument();
  });
});

describe("ScenesPanel — draft refresh (spec §6.4)", () => {
  it("calls onDocumentSaved after a succeeded scene_plan job so the draft is refreshed", () => {
    runScenePlanResult = { jobId: "plan-job-3", traceId: "t1", estimate: ESTIMATE };
    jobStatusesByJobId["plan-job-3"] = {
      status: "succeeded",
      error: null,
      progress: null,
      result: { kind: "scene_plan", creditsUsed: 5 },
    };

    const { onDocumentSaved } = renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-scene-plan"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(onDocumentSaved).toHaveBeenCalledTimes(1);
  });
});

describe("ScenesPanel — scene editor regression", () => {
  it("keeps the existing scene editor working (add / remove / edit timing)", () => {
    const { onChange, unmount } = renderPanel();
    fireEvent.click(screen.getByText("Add scene"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ scenes: expect.arrayContaining([expect.objectContaining({ sceneId: "scene-2" })]) }),
    );
    unmount();

    const { onChange: onChange2, unmount: unmount2 } = renderPanel({
      document: {
        ...BASE_DOCUMENT,
        scenes: [
          { ...BASE_DOCUMENT.scenes[0] },
          { ...BASE_DOCUMENT.scenes[0], sceneId: "scene-2", startMs: 8000, endMs: 16000 },
        ],
      },
    });
    fireEvent.change(screen.getAllByLabelText(/Start \(ms\)/i)[0], { target: { value: "1000" } });
    expect(onChange2).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: expect.arrayContaining([expect.objectContaining({ sceneId: "scene-1", startMs: 1000 })]),
      }),
    );
    unmount2();

    const { onChange: onChange3 } = renderPanel({
      document: {
        ...BASE_DOCUMENT,
        scenes: [
          { ...BASE_DOCUMENT.scenes[0] },
          { ...BASE_DOCUMENT.scenes[0], sceneId: "scene-2", startMs: 8000, endMs: 16000 },
        ],
      },
    });
    fireEvent.click(screen.getAllByLabelText(/Remove scene/i)[0]);
    expect(onChange3).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: [expect.objectContaining({ sceneId: "scene-2" })],
      }),
    );
  });
});
