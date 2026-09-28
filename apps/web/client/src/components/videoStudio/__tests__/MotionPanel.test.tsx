/**
 * MotionPanel coverage — the auto-draft awareness banner + per-scene
 * "auto-drafted" badge (pre-existing), and the AI motion-variant picker
 * (this task): estimate -> confirm launcher (D4, same gate as ScenesPanel's
 * scene_plan), candidate cards + selection via `selectMotionCandidate`, the
 * per-scene (never panel-wide) pending guard, and the empty/rejected states.
 * Same hand-rolled `@/lib/trpc` mock convention as `ScenesPanel.test.tsx`.
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
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

const listMotionTemplatesQueryMock = vi.fn();
const getStageEstimateQueryMock = vi.fn();
const getActiveGenerationJobQueryMock = vi.fn();
const getGenerationJobStatusQueryMock = vi.fn();
const runMotionStageMutateMock = vi.fn();
const selectMotionCandidateMutateMock = vi.fn();

let runMotionStageResult: { jobId: string; traceId: string; estimate: unknown } | null = null;
let jobStatusesByJobId: Record<string, unknown> = {};
let selectMotionCandidateState: {
  isPending: boolean;
  variables: { sceneId: string } | undefined;
  onSuccessResult: unknown;
  shouldError: boolean;
} = { isPending: false, variables: undefined, onSuccessResult: { revision: 4 }, shouldError: false };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      listMotionTemplates: { useQuery: (...args: unknown[]) => listMotionTemplatesQueryMock(...args) },
      getStageEstimate: { useQuery: (...args: unknown[]) => getStageEstimateQueryMock(...args) },
      getActiveGenerationJob: { useQuery: (...args: unknown[]) => getActiveGenerationJobQueryMock(...args) },
      getGenerationJobStatus: { useQuery: (...args: unknown[]) => getGenerationJobStatusQueryMock(...args) },
      runMotionStage: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => {
            runMotionStageMutateMock(input, opts);
            if (runMotionStageResult) {
              (opts.onSuccess as (r: unknown) => void)?.(runMotionStageResult);
            }
          },
          isPending: false,
        }),
      },
      selectMotionCandidate: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: { sceneId: string }) => {
            selectMotionCandidateMutateMock(input, opts);
            if (selectMotionCandidateState.shouldError) {
              (opts.onError as (e: unknown, v: unknown) => void)?.(
                { message: "boom" },
                input,
              );
            } else {
              (opts.onSuccess as (r: unknown, v: unknown) => void)?.(
                selectMotionCandidateState.onSuccessResult,
                input,
              );
            }
          },
          isPending: selectMotionCandidateState.isPending,
          variables: selectMotionCandidateState.variables,
        }),
      },
    },
  },
}));

import { MotionPanel } from "../MotionPanel";
import type { Scene, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

const TEMPLATES = [
  { id: "template-a", categories: ["intro"], minDurationMs: 1000, maxDurationMs: 5000 },
  { id: "template-b", categories: ["outro"], minDurationMs: 1000, maxDurationMs: 5000 },
];

const CANDIDATE_A = {
  candidateId: "scene-1-v1",
  templateId: "product_hero",
  templateParams: {},
  motion: { intensity: "low" as const, camera: "static" },
  label: "Calm intro",
  rationale: "Keeps focus on the product without distraction.",
};
const CANDIDATE_B = {
  candidateId: "scene-1-v2",
  templateId: "kinetic_typography",
  templateParams: {},
  motion: { intensity: "high" as const, camera: "push-in" },
  label: "Energetic intro",
  rationale: "Grabs attention fast for short-form video.",
};

const BASE_SCENE: Scene = {
  sceneId: "scene-1",
  startMs: 0,
  endMs: 8000,
  narration: null,
  narrationAudioAssetId: null,
  visual: { kind: "template", templateId: "template-a", params: {} },
  layers: [],
  motion: { intensity: "medium", camera: "static" },
  captionCues: [],
};

const BASE_DOCUMENT: VideoProjectDocument = {
  schemaVersion: 1,
  format: { width: 1080, height: 1920, fps: 30, durationMs: 8000 },
  content: { language: "th", platformPreset: "tiktok_9_16" },
  brandKitId: null,
  scenes: [
    BASE_SCENE,
    {
      sceneId: "scene-2",
      startMs: 8000,
      endMs: 16000,
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
  stage: "motion",
  modelId: "openrouter/gpt-x-structured",
  maxLoops: 1,
  perRoundCredits: 4,
  typicalCredits: 4,
  ceilingCredits: 20,
  callsPerRoundCeiling: 5,
  basis: {
    sceneCount: 2,
    narrationChars: 0,
    captionChars: 0,
    layerCount: 0,
    claimCount: 0,
    estimatedInputTokens: 200,
    estimatedOutputTokens: 100,
  },
  isCeiling: true,
};

function renderPanel(overrides: Partial<Parameters<typeof MotionPanel>[0]> = {}) {
  const onChange = vi.fn();
  const onDocumentSaved = vi.fn();
  const utils = render(
    <MotionPanel
      lang="th"
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
  runMotionStageResult = null;
  jobStatusesByJobId = {};
  selectMotionCandidateState = {
    isPending: false,
    variables: undefined,
    onSuccessResult: { revision: 4 },
    shouldError: false,
  };

  listMotionTemplatesQueryMock.mockReturnValue({ data: TEMPLATES });
  getActiveGenerationJobQueryMock.mockReturnValue({ data: null });
  getGenerationJobStatusQueryMock.mockImplementation((args: { jobId: string }) => ({
    data: jobStatusesByJobId[args.jobId],
  }));
  getStageEstimateQueryMock.mockReturnValue({ data: ESTIMATE, isLoading: false, error: undefined });
});

describe("MotionPanel — auto-draft awareness", () => {
  it("exposes the Remotion motion-graphics surface and procedural presets", () => {
    const onGoToCompose = vi.fn();
    renderPanel({ onGoToCompose });

    expect(screen.getByTestId("motion-graphics-section")).toHaveTextContent(
      "Motion graphics ตามบทพูด",
    );
    expect(screen.getByTestId("motion-graphics-procedural-templates")).toHaveTextContent(
      "สนามอนุภาคพลังงาน",
    );
    fireEvent.click(screen.getByTestId("motion-graphics-open-preview"));
    expect(onGoToCompose).toHaveBeenCalledTimes(1);
  });

  it("lets each scene opt into narration cue sync", () => {
    const doc: VideoProjectDocument = {
      ...BASE_DOCUMENT,
      scenes: [{ ...BASE_SCENE, motion: { ...BASE_SCENE.motion, sync: "scene" } }],
    };
    const { onChange } = renderPanel({ document: doc });

    fireEvent.click(screen.getByTestId("motion-graphics-sync-scene-scene-1"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: [expect.objectContaining({ motion: expect.objectContaining({ sync: "captions" }) })],
      }),
    );
  });

  it("shows a banner explaining motion templates were already drafted during scene planning", () => {
    renderPanel();

    expect(screen.getByTestId("motion-autodraft-banner")).toHaveTextContent(
      "เทมเพลตโมชันถูกร่างให้อัตโนมัติแล้วตอนวางแผนฉาก",
    );
  });

  it("shows the auto-drafted badge for a scene whose visual already carries a planned template", () => {
    renderPanel();

    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-1");
    expect(within(sceneCard).getByText("ร่างอัตโนมัติ")).toBeInTheDocument();
  });

  it("does not show the badge for a scene with no template assigned", () => {
    renderPanel();

    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-2");
    expect(within(sceneCard).queryByText("ร่างอัตโนมัติ")).not.toBeInTheDocument();
  });

  it("shows a Thai name for a known registry template id instead of the raw id", () => {
    listMotionTemplatesQueryMock.mockReturnValue({
      data: [{ id: "product_hero", categories: ["product"], minDurationMs: 2000, maxDurationMs: 15000 }],
    });
    const doc = {
      ...BASE_DOCUMENT,
      scenes: [{ ...BASE_DOCUMENT.scenes[0], visual: { kind: "template" as const, templateId: "product_hero", params: {} } }],
    };
    renderPanel({ document: doc });

    expect(screen.queryByText("product_hero")).not.toBeInTheDocument();
    expect(screen.getAllByText("ฮีโร่สินค้า").length).toBeGreaterThan(0);
  });

  it("falls back to the raw template id for a template not in the client-side name map", () => {
    renderPanel();

    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-1");
    expect(within(sceneCard).getAllByText("template-a").length).toBeGreaterThan(0);
  });

  it("shows an example params JSON block for a known template's params textarea", () => {
    listMotionTemplatesQueryMock.mockReturnValue({
      data: [{ id: "product_hero", categories: ["product"], minDurationMs: 2000, maxDurationMs: 15000 }],
    });
    const doc = {
      ...BASE_DOCUMENT,
      scenes: [{ ...BASE_DOCUMENT.scenes[0], visual: { kind: "template" as const, templateId: "product_hero", params: {} } }],
    };
    renderPanel({ document: doc });

    expect(screen.getByTestId("video-studio-motion-params-example-scene-1")).toHaveTextContent("headline");
  });

  it("labels each scene card with its position and a narration excerpt instead of the raw sceneId", () => {
    const doc = {
      ...BASE_DOCUMENT,
      scenes: [
        { ...BASE_DOCUMENT.scenes[0], narration: "สวัสดีครับ ยินดีต้อนรับสู่วิดีโอของเรา" },
        BASE_DOCUMENT.scenes[1],
      ],
    };
    renderPanel({ document: doc });

    const firstCard = screen.getByTestId("video-studio-motion-scene-scene-1");
    expect(within(firstCard).getByText(/ฉากที่ 1/)).toBeInTheDocument();
    expect(within(firstCard).getByText(/สวัสดีครับ/)).toBeInTheDocument();

    const secondCard = screen.getByTestId("video-studio-motion-scene-scene-2");
    expect(within(secondCard).getByText("ฉากที่ 2")).toBeInTheDocument();
  });

  it("withholds the badge for a scene once the user changes its template in this panel", () => {
    const { onChange, rerender } = renderPanel();

    fireEvent.click(screen.getByTestId("video-studio-motion-select-scene-1"));
    fireEvent.click(screen.getByRole("option", { name: "template-b" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextDocument = onChange.mock.calls[0][0] as VideoProjectDocument;

    rerender(
      <MotionPanel
        lang="th"
        projectId={42}
        document={nextDocument}
        onChange={onChange}
        projectRevision={3}
        hasUnsavedChanges={false}
        onDocumentSaved={vi.fn()}
      />,
    );

    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-1");
    expect(within(sceneCard).queryByText("ร่างอัตโนมัติ")).not.toBeInTheDocument();
  });
});

describe("MotionPanel — AI motion variants launcher (estimate -> confirm gate, D4)", () => {
  it("shows the estimate dialog and does NOT run the stage until confirmed", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("motion-generate-launch"));
    expect(screen.getByTestId("video-studio-stage-estimate-dialog")).toBeInTheDocument();
    expect(runMotionStageMutateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));
    expect(runMotionStageMutateMock).toHaveBeenCalledTimes(1);
  });

  it("passes mode and baseRevision into runMotionStage", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("motion-generate-launch"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(runMotionStageMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 42, baseRevision: 3, mode: "fill_empty" }),
      expect.anything(),
    );
  });

  it("requires a confirmation for the destructive 'replace' re-run mode", () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("video-studio-motion-variant-mode"));
    fireEvent.click(screen.getByText("สร้างตัวเลือกใหม่ทุกฉาก"));

    fireEvent.click(screen.getByTestId("motion-generate-launch"));
    const confirmButton = screen.getByTestId("video-studio-stage-estimate-confirm");
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByTestId("video-studio-estimate-destructive-ack"));
    expect(confirmButton).not.toBeDisabled();
  });

  it("blocks launch with a reason banner while there are unsaved changes", () => {
    renderPanel({ hasUnsavedChanges: true });
    expect(screen.getByTestId("motion-generate-launch-blocked")).toBeInTheDocument();
    expect(screen.getByTestId("motion-generate-launch")).toBeDisabled();
  });

  it("calls onDocumentSaved after a succeeded motion job so candidates are refreshed from the server", () => {
    runMotionStageResult = { jobId: "motion-job-1", traceId: "t1", estimate: ESTIMATE };
    jobStatusesByJobId["motion-job-1"] = {
      status: "succeeded",
      error: null,
      progress: null,
      result: { kind: "motion", proposedSceneIds: ["scene-1"], skippedSceneIds: [], rejectedSceneIds: [] },
    };

    const { onDocumentSaved } = renderPanel();
    fireEvent.click(screen.getByTestId("motion-generate-launch"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(onDocumentSaved).toHaveBeenCalledTimes(1);
  });
});

describe("MotionPanel — candidate cards", () => {
  it("shows an empty-state invitation when a scene has no candidates yet", () => {
    renderPanel();
    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-2");
    expect(within(sceneCard).getByTestId("motion-variants-empty-scene-2")).toHaveTextContent(
      "ยังไม่มีตัวเลือกโมชันสำหรับฉากนี้",
    );
  });

  it("shows the rejected message when the last run produced no valid candidate for an empty scene", () => {
    jobStatusesByJobId["motion-job-rejected"] = {
      status: "succeeded",
      error: null,
      progress: null,
      result: { kind: "motion", proposedSceneIds: [], skippedSceneIds: [], rejectedSceneIds: ["scene-2"] },
    };
    runMotionStageResult = { jobId: "motion-job-rejected", traceId: "t1", estimate: ESTIMATE };

    renderPanel();
    fireEvent.click(screen.getByTestId("motion-generate-launch"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-2");
    expect(within(sceneCard).getByTestId("motion-variants-empty-scene-2")).toHaveTextContent(
      "AI ไม่สามารถสร้างตัวเลือกที่ใช้งานได้",
    );
  });

  it("renders each candidate as a selectable option and marks the currently selected one", () => {
    const doc: VideoProjectDocument = {
      ...BASE_DOCUMENT,
      scenes: [
        {
          ...BASE_SCENE,
          motionCandidates: [CANDIDATE_A, CANDIDATE_B],
          selectedMotionCandidateId: "scene-1-v1",
        },
        BASE_DOCUMENT.scenes[1],
      ],
    };
    renderPanel({ document: doc });

    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-1");
    const options = within(sceneCard).getAllByTestId("motion-candidate-option");
    expect(options).toHaveLength(2);

    // The differences between candidates are actually shown, not identical boxes.
    expect(within(sceneCard).getByText("ฮีโร่สินค้า")).toBeInTheDocument();
    expect(within(sceneCard).getByText("ตัวอักษรเคลื่อนไหว")).toBeInTheDocument();
    expect(within(sceneCard).getByText("Calm intro")).toBeInTheDocument();
    expect(within(sceneCard).getByText("Energetic intro")).toBeInTheDocument();

    // Exactly one card is marked selected.
    expect(within(sceneCard).getAllByTestId("motion-candidate-selected")).toHaveLength(1);
    const selectedCard = options.find((option) =>
      within(option).queryByTestId("motion-candidate-selected"),
    )!;
    expect(selectedCard).toHaveAttribute("data-candidate-id", "scene-1-v1");
  });

  it("calls selectMotionCandidate with projectId/baseRevision/sceneId/candidateId when a candidate is applied", () => {
    const doc: VideoProjectDocument = {
      ...BASE_DOCUMENT,
      scenes: [
        { ...BASE_SCENE, motionCandidates: [CANDIDATE_A, CANDIDATE_B] },
        BASE_DOCUMENT.scenes[1],
      ],
    };
    const { onDocumentSaved } = renderPanel({ document: doc, projectRevision: 7 });

    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-1");
    const applyButtons = within(sceneCard).getAllByText("ใช้ตัวเลือกนี้");
    fireEvent.click(applyButtons[1]);

    expect(selectMotionCandidateMutateMock).toHaveBeenCalledWith(
      { projectId: 42, baseRevision: 7, sceneId: "scene-1", candidateId: "scene-1-v2" },
      expect.anything(),
    );
    expect(onDocumentSaved).toHaveBeenCalledTimes(1);
  });

  it("shows an error banner for that scene when applying a candidate fails", () => {
    selectMotionCandidateState.shouldError = true;
    const doc: VideoProjectDocument = {
      ...BASE_DOCUMENT,
      scenes: [{ ...BASE_SCENE, motionCandidates: [CANDIDATE_A] }, BASE_DOCUMENT.scenes[1]],
    };
    renderPanel({ document: doc });

    const sceneCard = screen.getByTestId("video-studio-motion-scene-scene-1");
    fireEvent.click(within(sceneCard).getByText("ใช้ตัวเลือกนี้"));

    expect(within(sceneCard).getByTestId("motion-candidate-apply-error-scene-1")).toBeInTheDocument();
  });

  it("guards the pending Apply button per-scene only — a pending selection on one scene never disables another scene's Apply button", () => {
    selectMotionCandidateState.isPending = true;
    selectMotionCandidateState.variables = { sceneId: "scene-1" };

    const doc: VideoProjectDocument = {
      ...BASE_DOCUMENT,
      scenes: [
        { ...BASE_SCENE, motionCandidates: [CANDIDATE_A] },
        {
          ...BASE_DOCUMENT.scenes[1],
          motionCandidates: [{ ...CANDIDATE_A, candidateId: "scene-2-v1" }],
        },
      ],
    };
    renderPanel({ document: doc });

    const scene1Card = screen.getByTestId("video-studio-motion-scene-scene-1");
    const scene2Card = screen.getByTestId("video-studio-motion-scene-scene-2");

    expect(within(scene1Card).getByText("ใช้ตัวเลือกนี้").closest("button")).toBeDisabled();
    expect(within(scene2Card).getByText("ใช้ตัวเลือกนี้").closest("button")).not.toBeDisabled();
  });
});
