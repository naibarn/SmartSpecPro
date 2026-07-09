import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dramaturgy critic (W11.5, added 2026-07-08) — `VerticalDramaSeasonCritiqueCard`
 * coverage: visibility gating, running a fresh critique, findings selection
 * -> `applySeasonCritique` input indexes, rejected-episode surfacing, and
 * flag-off/no-drafts byte-identical rendering (the caller
 * — `VerticalDramaDeepStoryDraftsActions` — mounts this card unconditionally
 * but it renders nothing until `hasDrafts` is true, which the caller derives
 * from `Boolean(deepDraftSummary)`; the surface is ALSO gated end-to-end by
 * the existing `verticalDramaSeriesDeepStoryDrafts` flag — see
 * `VerticalDramaSeriesDetailPage.tsx`'s conditional mount of the whole
 * panel family, untouched here).
 *
 * Async story jobs (#28, added 2026-07-08) — `critiqueSeasonDrafts`/
 * `applySeasonCritique` now enqueue (`mutateAsync` resolves with
 * `{ jobId, deduped: false }`) and the card itself polls
 * `getStoryJobStatus.fetch` to completion — see
 * `VerticalDramaDeepStoryDraftsPanel.actions.test.tsx`'s identical mocking
 * convention (this file mirrors it for the critique/apply_critique kinds).
 */

let seriesGetData: unknown = undefined;
const mockInvalidateSeriesGet = vi.fn();
const mockCritiqueMutateAsync = vi.fn();
const mockApplyMutateAsync = vi.fn();
let critiqueShouldFail = false;
let applyShouldFail = false;
let critiqueResult: unknown = {
  critique: {
    critiquedAt: "2026-07-08T00:00:00.000Z",
    overallScore: 7,
    strengths: ["จังหวะเปิดเรื่องดึงดูดดี"],
    findings: [
      {
        kind: "key_character_late_intro",
        evidenceEpisodes: [5],
        problem: "ปัณณ์มีน้ำหนักจริงตอนที่ 5 จาก 10 ตอน ช้าเกินไป",
        fixInstruction: "ให้ปัณณ์ปรากฏตัวอย่างมีน้ำหนักตั้งแต่ตอนที่ 3-4",
      },
      {
        kind: "antagonist_tactic_repetition",
        evidenceEpisodes: [2, 3, 4, 5],
        problem: "ตัวร้ายขู่ซ้ำ ๆ ต่อเนื่อง 4 ตอน",
        fixInstruction: "สลับกลวิธีของตัวร้ายให้หลากหลายขึ้น",
      },
    ],
  },
  deterministicFindings: [],
  creditsUsed: 4,
  callsMade: 1,
  model: "test-model",
};
let applyResult: unknown = {
  updatedEpisodes: [5],
  rejected: [],
  creditsUsed: 3,
  callsMade: 1,
};
/** Async story jobs (#28) — the series' active job, as `getActiveStoryJob` would return it. `null` (default, reset in `beforeEach`) means no resume. */
let activeStoryJobData: { jobId: string; kind: string; status: string; progress: unknown } | null = null;

const mockGetStoryJobStatusFetch = vi.fn(async ({ jobId }: { jobId: string }) => {
  if (jobId === "critique-job") {
    return critiqueShouldFail
      ? { kind: "critique", status: "failed", progress: null, error: "critique boom" }
      : { kind: "critique", status: "succeeded", progress: null, result: critiqueResult };
  }
  if (jobId === "apply-job") {
    return applyShouldFail
      ? { kind: "apply_critique", status: "failed", progress: null, error: "apply boom" }
      : { kind: "apply_critique", status: "succeeded", progress: null, result: applyResult };
  }
  return null;
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: {
        get: { invalidate: mockInvalidateSeriesGet },
        getStoryJobStatus: { fetch: mockGetStoryJobStatusFetch },
      },
    }),
    verticalDramaSeries: {
      get: {
        useQuery: () => ({ data: seriesGetData, isLoading: false }),
      },
      getActiveStoryJob: {
        useQuery: () => ({ data: activeStoryJobData }),
      },
      critiqueSeasonDrafts: {
        useMutation: (_opts: unknown) => ({
          mutateAsync: async (input: unknown) => {
            mockCritiqueMutateAsync(input);
            return { jobId: "critique-job", deduped: false };
          },
          isPending: false,
        }),
      },
      applySeasonCritique: {
        useMutation: (_opts: unknown) => ({
          mutateAsync: async (input: unknown) => {
            mockApplyMutateAsync(input);
            return { jobId: "apply-job", deduped: false };
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { VerticalDramaSeasonCritiqueCard } from "@/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel";

beforeEach(() => {
  vi.clearAllMocks();
  seriesGetData = undefined;
  critiqueShouldFail = false;
  applyShouldFail = false;
  applyResult = { updatedEpisodes: [5], rejected: [], creditsUsed: 3, callsMade: 1 };
  activeStoryJobData = null;
});

describe("VerticalDramaSeasonCritiqueCard — visibility", () => {
  it("renders nothing at all when hasDrafts is false (byte-identical to not mounting)", () => {
    const { container } = render(
      <VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={false} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("vd-season-critique-card")).not.toBeInTheDocument();
  });

  it("shows the primary CTA once hasDrafts is true and readOnly is false", () => {
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    expect(screen.getByTestId("vd-season-critique-card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "วิจารณ์ซีซั่นนี้ (AI)" })).toBeInTheDocument();
  });

  it("hides the primary CTA in read-only mode", () => {
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={true} hasDrafts={true} />);
    expect(screen.queryByTestId("vd-season-critique-cta")).not.toBeInTheDocument();
  });

  it("shows no results card until a critique exists (neither live nor persisted)", () => {
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    expect(screen.queryByTestId("vd-season-critique-results")).not.toBeInTheDocument();
  });
});

describe("VerticalDramaSeasonCritiqueCard — running a fresh critique", () => {
  it("clicking the CTA calls critiqueSeasonDrafts with a fresh idempotencyKey and renders the results", async () => {
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);

    fireEvent.click(screen.getByTestId("vd-season-critique-cta"));

    expect(mockCritiqueMutateAsync).toHaveBeenCalledTimes(1);
    const callArgs = mockCritiqueMutateAsync.mock.calls[0][0] as { seriesId: string; idempotencyKey: string };
    expect(callArgs.seriesId).toBe("10");
    expect(typeof callArgs.idempotencyKey).toBe("string");
    expect(callArgs.idempotencyKey.length).toBeGreaterThan(0);

    await waitFor(() => expect(screen.getByTestId("vd-season-critique-results")).toBeInTheDocument());
    expect(screen.getByTestId("vd-season-critique-score")).toHaveTextContent("คะแนนรวม 7/10");
    expect(screen.getByTestId("vd-season-critique-findings")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^vd-season-critique-finding-\d+$/)).toHaveLength(2);
  });

  it("relabels the primary CTA to 'วิจารณ์ใหม่' once a critique exists", async () => {
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-season-critique-cta"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "วิจารณ์ใหม่" })).toBeInTheDocument(),
    );
  });

  it("defaults every finding checkbox to checked", async () => {
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-season-critique-cta"));
    await waitFor(() => expect(screen.getByTestId("vd-season-critique-finding-checkbox-0")).toBeInTheDocument());
    expect(screen.getByTestId("vd-season-critique-finding-checkbox-0")).toBeChecked();
    expect(screen.getByTestId("vd-season-critique-finding-checkbox-1")).toBeChecked();
  });

  it("shows a live progress region while the critique job is in flight", async () => {
    let resolveFirstFetch!: (value: unknown) => void;
    mockGetStoryJobStatusFetch.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstFetch = resolve; }),
    );
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-season-critique-cta"));

    // Before the first status poll resolves, the job is known to be
    // submitted but no `progress` snapshot exists yet — reads as "queued"
    // (`storyJobProgressText`'s own documented `null` -> queued convention;
    // the "กำลังอ่านทั้งซีซั่น…" phase text itself is unit-tested directly in
    // `verticalDramaCopy.deepStoryDrafts.test.ts`, since exercising it here
    // would need a second poll round-trip after the real 2.5s interval).
    await waitFor(() => expect(screen.getByTestId("vd-season-critique-progress")).toBeInTheDocument());
    const liveRegion = screen.getByTestId("vd-season-critique-progress");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion.textContent).toBe("กำลังอยู่ในคิว…");

    resolveFirstFetch({ kind: "critique", status: "succeeded", progress: null, result: critiqueResult });
    await waitFor(() => expect(screen.queryByTestId("vd-season-critique-progress")).not.toBeInTheDocument());
  });

  it("shows an error toast and no results card when the critique job fails", async () => {
    critiqueShouldFail = true;
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-season-critique-cta"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("critique boom"));
    expect(screen.queryByTestId("vd-season-critique-results")).not.toBeInTheDocument();
  });
});

describe("VerticalDramaSeasonCritiqueCard — persisted critique on reopen", () => {
  it("renders a persisted series.lastCritique WITHOUT needing to click the button", () => {
    seriesGetData = {
      series: {
        lastCritique: {
          critiquedAt: "2026-07-01T00:00:00.000Z",
          overallScore: 8,
          strengths: [],
          findings: [
            {
              kind: "finale_no_price_paid",
              evidenceEpisodes: [10],
              problem: "ตอนจบไม่มีราคาที่ต้องจ่าย",
              fixInstruction: "เพิ่มการเสียสละบางอย่างให้พระเอกในตอนจบ",
            },
          ],
        },
      },
    };
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    expect(screen.getByTestId("vd-season-critique-results")).toBeInTheDocument();
    expect(screen.getByTestId("vd-season-critique-score")).toHaveTextContent("คะแนนรวม 8/10");
    expect(mockCritiqueMutateAsync).not.toHaveBeenCalled();
  });

  it("still shows the score for a persisted critique in read-only mode, but hides findings/apply", () => {
    seriesGetData = {
      series: {
        lastCritique: {
          critiquedAt: "2026-07-01T00:00:00.000Z",
          overallScore: 6,
          strengths: [],
          findings: [
            { kind: "other", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" },
          ],
        },
      },
    };
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={true} hasDrafts={true} />);
    expect(screen.getByTestId("vd-season-critique-score")).toHaveTextContent("คะแนนรวม 6/10");
    expect(screen.queryByTestId("vd-season-critique-findings")).not.toBeInTheDocument();
  });
});

describe("VerticalDramaSeasonCritiqueCard — findings selection -> apply input indexes", () => {
  async function renderWithCritique() {
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-season-critique-cta"));
    await waitFor(() => expect(screen.getByTestId("vd-season-critique-apply-cta")).toBeInTheDocument());
  }

  it("applies ALL findings by default (no clicks needed)", async () => {
    await renderWithCritique();
    fireEvent.click(screen.getByTestId("vd-season-critique-apply-cta"));

    expect(mockApplyMutateAsync).toHaveBeenCalledTimes(1);
    const callArgs = mockApplyMutateAsync.mock.calls[0][0] as { findingIndexes: number[] };
    expect(callArgs.findingIndexes.slice().sort()).toEqual([0, 1]);
  });

  it("unchecking one finding excludes ONLY that index from the apply call", async () => {
    await renderWithCritique();
    fireEvent.click(screen.getByTestId("vd-season-critique-finding-checkbox-0"));
    fireEvent.click(screen.getByTestId("vd-season-critique-apply-cta"));

    const callArgs = mockApplyMutateAsync.mock.calls[0][0] as { findingIndexes: number[] };
    expect(callArgs.findingIndexes).toEqual([1]);
  });

  it("disables the apply button once every finding is unchecked", async () => {
    await renderWithCritique();
    fireEvent.click(screen.getByTestId("vd-season-critique-finding-checkbox-0"));
    fireEvent.click(screen.getByTestId("vd-season-critique-finding-checkbox-1"));
    expect(screen.getByTestId("vd-season-critique-apply-cta")).toBeDisabled();
  });

  it("shows the exact 'ปรับตามคำวิจารณ์' footer label with the selected count", async () => {
    await renderWithCritique();
    expect(screen.getByTestId("vd-season-critique-apply-cta")).toHaveTextContent(
      "ปรับตามคำวิจารณ์ (2 ข้อ, มีค่าใช้จ่าย)",
    );
    fireEvent.click(screen.getByTestId("vd-season-critique-finding-checkbox-0"));
    expect(screen.getByTestId("vd-season-critique-apply-cta")).toHaveTextContent(
      "ปรับตามคำวิจารณ์ (1 ข้อ, มีค่าใช้จ่าย)",
    );
  });
});

describe("VerticalDramaSeasonCritiqueCard — apply result surfacing", () => {
  async function renderWithCritique() {
    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-season-critique-cta"));
    await waitFor(() => expect(screen.getByTestId("vd-season-critique-apply-cta")).toBeInTheDocument());
  }

  it("shows a success toast with the updated-episode count and invalidates get on success", async () => {
    await renderWithCritique();
    fireEvent.click(screen.getByTestId("vd-season-critique-apply-cta"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("ปรับปรุงแล้ว 1 ตอน"));
    expect(mockInvalidateSeriesGet).toHaveBeenCalledWith({ seriesId: "10" });
  });

  it("surfaces rejected episodes in a warning block", async () => {
    applyResult = {
      updatedEpisodes: [],
      rejected: [{ episodeNumber: 5, reason: "การแก้ไขทำให้เกิดปัญหาใหม่ จึงเก็บเวอร์ชันเดิมไว้" }],
      creditsUsed: 3,
      callsMade: 1,
    };
    await renderWithCritique();
    fireEvent.click(screen.getByTestId("vd-season-critique-apply-cta"));

    await waitFor(() => expect(screen.getByTestId("vd-season-critique-rejected")).toBeInTheDocument());
    expect(screen.getByTestId("vd-season-critique-rejected")).toHaveTextContent(
      "ตอนที่ 5: การแก้ไขทำให้เกิดปัญหาใหม่ จึงเก็บเวอร์ชันเดิมไว้",
    );
  });

  it("shows an error toast when the apply job fails", async () => {
    applyShouldFail = true;
    await renderWithCritique();
    fireEvent.click(screen.getByTestId("vd-season-critique-apply-cta"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("apply boom"));
  });
});

describe("VerticalDramaSeasonCritiqueCard — async story jobs (#28) resume-on-mount", () => {
  it("resumes polling an active apply_critique job found on mount, disabling both CTAs", async () => {
    seriesGetData = {
      series: {
        lastCritique: {
          critiquedAt: "2026-07-01T00:00:00.000Z",
          overallScore: 7,
          strengths: [],
          findings: [{ kind: "other", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
        },
      },
    };
    activeStoryJobData = { jobId: "apply-job", kind: "apply_critique", status: "running", progress: null };

    render(<VerticalDramaSeasonCritiqueCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);

    expect(screen.getByTestId("vd-season-critique-cta")).toBeDisabled();
    await waitFor(() => expect(mockGetStoryJobStatusFetch).toHaveBeenCalledWith({ seriesId: "10", jobId: "apply-job" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("ปรับปรุงแล้ว 1 ตอน"));
  });
});
