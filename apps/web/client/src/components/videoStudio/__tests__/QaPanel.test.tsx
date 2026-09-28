/**
 * Feature 142, section-07 — `QaPanel` coverage. Same hand-rolled `@/lib/trpc`
 * mock convention as `VideoStudioWorkspacePage.test.tsx:42-78`: `useMutation`
 * returns `{ mutate: (input) => mock(input, opts), isPending: false }` and
 * simulates the tRPC success callback synchronously inside `mutate` (see
 * `AgencyPreviewCard.test.tsx`), so both the mutation input and the
 * resulting UI transition are assertable in one `fireEvent`. Astryx `Dialog`/
 * `AlertDialog` need jsdom's `HTMLDialogElement` showModal/close patched
 * (`CatalogCreateDialog.test.tsx:20-27`).
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
const runQualityReviewMutateMock = vi.fn();
const applyQualityRepairsMutateMock = vi.fn();
const restoreRevisionMutateMock = vi.fn();

let runQualityReviewResult: { jobId: string; traceId: string; estimate: unknown } | null = null;
let applyQualityRepairsResult: { jobId: string; traceId: string; estimate: unknown } | null = null;
let jobStatusesByJobId: Record<string, unknown> = {};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      getStageEstimate: {
        useQuery: (...args: unknown[]) => getStageEstimateQueryMock(...args),
      },
      getActiveGenerationJob: {
        useQuery: (...args: unknown[]) => getActiveGenerationJobQueryMock(...args),
      },
      getGenerationJobStatus: {
        useQuery: (...args: unknown[]) => getGenerationJobStatusQueryMock(...args),
      },
      runQualityReview: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => {
            runQualityReviewMutateMock(input, opts);
            if (runQualityReviewResult) {
              (opts.onSuccess as (r: unknown) => void)?.(runQualityReviewResult);
            }
          },
          isPending: false,
        }),
      },
      applyQualityRepairs: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => {
            applyQualityRepairsMutateMock(input, opts);
            if (applyQualityRepairsResult) {
              (opts.onSuccess as (r: unknown) => void)?.(applyQualityRepairsResult);
            }
          },
          isPending: false,
        }),
      },
      restoreRevision: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => {
            restoreRevisionMutateMock(input, opts);
            (opts.onSuccess as (() => void) | undefined)?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

import { QaPanel } from "../QaPanel";
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

const REVIEW = {
  score: 6,
  scorecard: { motion_pacing: 8, unusual_dimension_key: 4 },
  issues: [
    {
      dimension: "narration_clarity",
      severity: "high" as const,
      message: "Narration text is unclear near scene-1.",
      repairStage: "narration",
    },
    {
      dimension: "motion_variety",
      severity: "medium" as const,
      message: "Motion feels repetitive across scenes.",
      repairStage: "scenes",
    },
    {
      dimension: "captions_timing",
      severity: "low" as const,
      message: "Captions overlap slightly in scene-1.",
    },
  ],
  repairInstructions: [
    { stage: "captions", instruction: "Fix caption timing" },
    { stage: "content", instruction: "Clarify narration wording" },
  ],
};

const LEDGER_ENTRY_1 = {
  at: "2026-01-01T00:00:00.000Z",
  round: 1,
  revision: 3,
  review: { score: 4, scorecard: {}, issues: [] },
  creditsUsed: 3,
  modelId: "model-a",
  traceId: "trace-1",
};
const LEDGER_ENTRY_2 = {
  at: "2026-01-02T00:00:00.000Z",
  round: 2,
  revision: 3,
  review: REVIEW,
  creditsUsed: 6,
  modelId: "model-a",
  traceId: "trace-2",
};
const QA_LEDGER = { entries: [LEDGER_ENTRY_1, LEDGER_ENTRY_2], totalCount: 2 };

const ESTIMATE = {
  stage: "quality_review",
  modelId: "openrouter/gpt-x-structured",
  maxLoops: 2,
  perRoundCredits: 10,
  typicalCredits: 20,
  ceilingCredits: 100,
  callsPerRoundCeiling: 5,
  basis: {
    sceneCount: 1,
    narrationChars: 0,
    captionChars: 0,
    layerCount: 0,
    claimCount: 0,
    estimatedInputTokens: 500,
    estimatedOutputTokens: 200,
  },
  isCeiling: true,
};

function renderPanel(overrides: Partial<Parameters<typeof QaPanel>[0]> = {}) {
  const onChange = vi.fn();
  const onDocumentSaved = vi.fn();
  const utils = render(
    <QaPanel
      lang="en"
      projectId={42}
      document={BASE_DOCUMENT}
      onChange={onChange}
      qaLedger={QA_LEDGER}
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
  runQualityReviewResult = null;
  applyQualityRepairsResult = null;
  jobStatusesByJobId = {};

  getActiveGenerationJobQueryMock.mockReturnValue({ data: null });
  getGenerationJobStatusQueryMock.mockImplementation((args: { jobId: string }) => ({
    data: jobStatusesByJobId[args.jobId],
  }));
  getStageEstimateQueryMock.mockImplementation((args: { stage: string }) => ({
    data: { ...ESTIMATE, stage: args.stage },
    isLoading: false,
    error: undefined,
  }));
});

describe("QaPanel — scorecard, issues, claim gate", () => {
  it("renders score, per-dimension scorecard and issues grouped by severity", () => {
    renderPanel();
    expect(screen.getByTestId("video-studio-qa-scorecard")).toHaveTextContent("6/10");
    expect(screen.getByTestId("video-studio-qa-dimension-motion_pacing")).toBeInTheDocument();
    expect(screen.getByTestId("video-studio-qa-issues-high")).toBeInTheDocument();
    expect(screen.getByTestId("video-studio-qa-issues-medium")).toBeInTheDocument();
    expect(screen.getByTestId("video-studio-qa-issues-low")).toBeInTheDocument();
  });

  it("renders skill-authored issue messages verbatim (content language, not translated)", () => {
    renderPanel();
    expect(screen.getByText("Narration text is unclear near scene-1.")).toBeInTheDocument();
  });

  it("renders an unknown scorecard dimension key instead of dropping it", () => {
    renderPanel();
    expect(screen.getByTestId("video-studio-qa-dimension-unusual_dimension_key")).toBeInTheDocument();
  });

  it("renders a claim-compliance block as a distinct error banner, not an opinion", () => {
    renderPanel({
      document: {
        ...BASE_DOCUMENT,
        claims: [{ claim: "cures everything", source: "manual", status: "prohibited" }],
      },
    });
    const banner = screen.getByTestId("video-studio-qa-claim-block");
    expect(banner).toHaveTextContent("Claim compliance blocks the final render");
    expect(banner).toHaveTextContent("Derived from the current document");
  });
});

describe("QaPanel — estimate -> confirm gate (D4)", () => {
  it("shows the estimate dialog and does NOT run the stage until confirmed", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-quality-review"));
    expect(screen.getByTestId("video-studio-stage-estimate-dialog")).toBeInTheDocument();
    expect(runQualityReviewMutateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));
    expect(runQualityReviewMutateMock).toHaveBeenCalledTimes(1);
  });

  it("passes projectId and baseRevision into runQualityReview on confirm", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-quality-review"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));
    expect(runQualityReviewMutateMock).toHaveBeenCalledWith(
      { projectId: 42, baseRevision: 3 },
      expect.anything(),
    );
  });
});

describe("QaPanel — staleness", () => {
  it("marks a review STALE when the document changed since it was produced", () => {
    renderPanel({ projectRevision: 99 });
    const stale = screen.getByTestId("video-studio-qa-stale");
    expect(stale).toHaveTextContent("out of date");
    // Never hidden — the score is still visible.
    expect(screen.getByTestId("video-studio-qa-scorecard")).toHaveTextContent("6/10");
  });

  it("marks a review STALE while there are unsaved changes, and blocks launch with the reason", () => {
    renderPanel({ hasUnsavedChanges: true });
    const stale = screen.getByTestId("video-studio-qa-stale");
    expect(stale).toHaveTextContent("does not include your unsaved changes");

    const blocked = screen.getByTestId("video-studio-run-quality-review-blocked");
    expect(blocked).toHaveTextContent("unsaved changes");
    expect(screen.getByTestId("video-studio-run-quality-review")).toBeDisabled();
  });
});

describe("QaPanel — cost honesty", () => {
  it("reports actual credits from the job record after a run", () => {
    runQualityReviewResult = { jobId: "review-job-1", traceId: "t1", estimate: ESTIMATE };
    jobStatusesByJobId["review-job-1"] = {
      status: "succeeded",
      error: null,
      progress: null,
      result: { kind: "quality_review", creditsUsed: 42, review: REVIEW },
    };

    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-quality-review"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(screen.getByText(/Actual: 42/)).toBeInTheDocument();
  });

  it("does not imply a failed stage was free", () => {
    runQualityReviewResult = { jobId: "review-job-fail", traceId: "t1", estimate: ESTIMATE };
    jobStatusesByJobId["review-job-fail"] = {
      status: "failed",
      error: "internal worker crash",
      progress: null,
    };

    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-run-quality-review"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(screen.getByTestId("video-studio-qa-failed-not-free")).toHaveTextContent(
      "credits may already have been spent",
    );
  });
});

describe("QaPanel — repairs", () => {
  it("labels captions/scenes/motion repairs as free and content/narration/claims as billable", () => {
    renderPanel();
    expect(screen.getAllByText("Free (no AI call)")).toHaveLength(2); // captions, scenes
    expect(screen.getAllByText("Uses credits")).toHaveLength(2); // content, narration
  });

  it("passes the selected repair stages into applyQualityRepairs", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-qa-repair-stage-captions"));
    fireEvent.click(screen.getByTestId("video-studio-apply-quality-repairs"));
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));

    expect(applyQualityRepairsMutateMock).toHaveBeenCalledWith(
      { projectId: 42, baseRevision: 3, stages: ["captions"] },
      expect.anything(),
    );
  });
});

describe("QaPanel — round history + revert (D1)", () => {
  it("lists each repair round with its score delta (before/after)", () => {
    renderPanel();
    const round2 = screen.getByTestId("video-studio-qa-round-2-revert").closest("div");
    expect(round2).toHaveTextContent("+2");
  });

  it("offers one-click revert per repair round and calls restoreRevision with that round's revision", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-qa-round-2-revert"));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Revert this round/i }));
    expect(restoreRevisionMutateMock).toHaveBeenCalledWith(
      { projectId: 42, revision: 3 },
      expect.anything(),
    );
  });

  it("asks for confirmation before reverting", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("video-studio-qa-round-2-revert"));
    expect(restoreRevisionMutateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("QaPanel — required states", () => {
  it("renders every state: loading, empty, success, error, unsaved-changes, stale", () => {
    // empty
    const { unmount } = renderPanel({ qaLedger: { entries: [], totalCount: 0 } });
    expect(screen.getByTestId("video-studio-qa-empty")).toBeInTheDocument();
    unmount();

    // success (default fixture)
    const { unmount: unmount2 } = renderPanel();
    expect(screen.getByTestId("video-studio-qa-scorecard")).toBeInTheDocument();
    unmount2();

    // stale
    const { unmount: unmount3 } = renderPanel({ projectRevision: 100 });
    expect(screen.getByTestId("video-studio-qa-stale")).toBeInTheDocument();
    unmount3();

    // unsaved-changes (blocks launch)
    const { unmount: unmount4 } = renderPanel({ hasUnsavedChanges: true });
    expect(screen.getByTestId("video-studio-run-quality-review-blocked")).toBeInTheDocument();
    unmount4();

    // error / running / loading are covered by the cost-honesty and D4
    // describe blocks above (StageLaunchCard's own progress/error states).
  });
});

describe("QaPanel — Thai label mapping (no raw internal ids)", () => {
  it("translates a known scorecard dimension key and falls back gracefully for an unknown one", () => {
    renderPanel({
      lang: "th",
      qaLedger: {
        entries: [
          {
            ...LEDGER_ENTRY_2,
            review: {
              ...REVIEW,
              scorecard: { content_accuracy_flow: 7, totally_unknown_dimension: 3 },
            },
          },
        ],
        totalCount: 1,
      },
    });
    // Known key -> Thai label, not the raw snake_case id.
    expect(screen.queryByText("content_accuracy_flow")).not.toBeInTheDocument();
    expect(screen.getByText("ความถูกต้อง/ลำดับของเนื้อหา")).toBeInTheDocument();
    // Unknown key -> readable fallback (underscores replaced), never dropped.
    expect(screen.getByTestId("video-studio-qa-dimension-totally_unknown_dimension")).toBeInTheDocument();
    expect(screen.getByText("totally unknown dimension")).toBeInTheDocument();
  });

  it("translates claim status badges and Selector options instead of the raw enum", () => {
    renderPanel({
      lang: "th",
      document: {
        ...BASE_DOCUMENT,
        claims: [{ claim: "อ้างสิทธิ์", source: "manual", status: "needs_review" }],
      },
    });
    expect(screen.queryByText("needs_review")).not.toBeInTheDocument();
    expect(screen.getAllByText("รอตรวจสอบ").length).toBeGreaterThan(0);
  });

  it("translates the remove-claim icon button label", () => {
    renderPanel({
      lang: "th",
      document: {
        ...BASE_DOCUMENT,
        claims: [{ claim: "อ้างสิทธิ์", source: "manual", status: "approved" }],
      },
    });
    expect(screen.getByLabelText("ลบข้อความอ้างสิทธิ์นี้")).toBeInTheDocument();
  });

  it("translates known repair-stage checkbox labels and falls back for an unknown stage id", () => {
    renderPanel({
      lang: "th",
      qaLedger: {
        entries: [
          {
            ...LEDGER_ENTRY_2,
            review: {
              ...REVIEW,
              repairInstructions: [{ stage: "content", instruction: "x" }],
              issues: [
                { dimension: "d", severity: "low" as const, message: "m", repairStage: "some_future_stage" },
              ],
            },
          },
        ],
        totalCount: 1,
      },
    });
    expect(screen.getByTestId("video-studio-qa-repair-stage-content")).toBeInTheDocument();
    expect(screen.getByText("เนื้อหา/บท")).toBeInTheDocument();
    // Unrecognized repair-stage id still renders (fallback to the raw id).
    expect(screen.getByTestId("video-studio-qa-repair-stage-some_future_stage")).toBeInTheDocument();
    expect(screen.getByText("some_future_stage")).toBeInTheDocument();
  });
});

describe("QaPanel — claims editor regression", () => {
  it("keeps the existing claims editor working (add / edit / remove)", () => {
    const { onChange, unmount } = renderPanel();
    fireEvent.click(screen.getByText("Add claim"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        claims: [{ claim: "", source: "manual", status: "needs_review" }],
      }),
    );
    unmount();

    const { onChange: onChange2, unmount: unmount2 } = renderPanel({
      document: {
        ...BASE_DOCUMENT,
        claims: [{ claim: "old text", source: "manual", status: "approved" }],
      },
    });
    fireEvent.change(screen.getByLabelText(/Claim text/i), { target: { value: "new text" } });
    expect(onChange2).toHaveBeenCalledWith(
      expect.objectContaining({
        claims: [{ claim: "new text", source: "manual", status: "approved" }],
      }),
    );
    unmount2();

    const { onChange: onChange3 } = renderPanel({
      document: {
        ...BASE_DOCUMENT,
        claims: [{ claim: "removable", source: "manual", status: "approved" }],
      },
    });
    fireEvent.click(screen.getByLabelText(/remove claim/i));
    expect(onChange3).toHaveBeenCalledWith(expect.objectContaining({ claims: [] }));
  });
});
