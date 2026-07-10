import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) —
 * `VerticalDramaImproveScriptCard` coverage: visibility gating, the default
 * request text + edit-toggle (save/cancel), starting the improve job +
 * round-aware progress, the fail-closed `needsReview` state (discard-only,
 * no confirm), the success comparison view (both sides rendered through
 * `formatStoryScriptEpisode`), and confirm/discard clearing local state.
 *
 * Mirrors the removed `VerticalDramaDeepStoryDraftsPanel.seasonCritique.test.tsx`'s
 * own mocking/render conventions (this file replaces it).
 */

let seriesGetData: unknown = undefined;
const mockInvalidateSeriesGet = vi.fn();
const mockStartMutateAsync = vi.fn();
const mockConfirmMutateAsync = vi.fn();
const mockDiscardMutateAsync = vi.fn();
let startShouldFail = false;
let improveScriptResult: unknown = {
  scoreSummary: "คะแนนรวม 8/10 — ปรับปรุงบทพูดให้เป็นธรรมชาติขึ้น",
  expectedEpisodeNumbers: [1],
  needsReview: false,
  needsReviewReasons: [],
  improvedItems: [
    {
      episodeNumber: 1,
      workingTitle: "ตอนใหม่: จุดเริ่มต้นที่ดีขึ้น",
      logline: "โลจิกไลน์ใหม่ที่สมเหตุสมผลกว่าเดิม",
      keyBeats: ["จุดใหม่ 1"],
    },
  ],
  partialFailureEpisodeNumbers: [],
  perEpisodeWarnings: [],
  rawText: "ตอนที่ 1: ตอนใหม่: จุดเริ่มต้นที่ดีขึ้น\n...",
};
/** Async story jobs (#28) — the series' active job, as `getActiveStoryJob` would return it. `null` (default, reset in `beforeEach`) means no resume. */
let activeStoryJobData: { jobId: string; kind: string; status: string; progress: unknown } | null = null;

const mockGetStoryJobStatusFetch = vi.fn(async ({ jobId }: { jobId: string }) => {
  if (jobId === "improve-script-job") {
    return startShouldFail
      ? { kind: "improve_script", status: "failed", progress: null, error: "improve boom" }
      : { kind: "improve_script", status: "succeeded", progress: null, result: improveScriptResult };
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
      startImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutateAsync: async (input: unknown) => {
            mockStartMutateAsync(input);
            return { jobId: "improve-script-job", deduped: false };
          },
          isPending: false,
        }),
      },
      confirmImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutateAsync: async (input: unknown) => {
            mockConfirmMutateAsync(input);
            return { updatedEpisodeNumbers: [1] };
          },
          isPending: false,
        }),
      },
      discardImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutateAsync: async (input: unknown) => {
            mockDiscardMutateAsync(input);
            return { ok: true };
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
import { IMPROVE_SCRIPT_DEFAULT_REQUEST_TEXT } from "@/components/verticalDramaSeries/verticalDramaCopy";
import { VerticalDramaImproveScriptCard } from "@/components/verticalDramaSeries/VerticalDramaImproveScriptCard";

beforeEach(() => {
  vi.clearAllMocks();
  seriesGetData = undefined;
  startShouldFail = false;
  activeStoryJobData = null;
  improveScriptResult = {
    scoreSummary: "คะแนนรวม 8/10 — ปรับปรุงบทพูดให้เป็นธรรมชาติขึ้น",
    expectedEpisodeNumbers: [1],
    needsReview: false,
    needsReviewReasons: [],
    improvedItems: [
      {
        episodeNumber: 1,
        workingTitle: "ตอนใหม่: จุดเริ่มต้นที่ดีขึ้น",
        logline: "โลจิกไลน์ใหม่ที่สมเหตุสมผลกว่าเดิม",
        keyBeats: ["จุดใหม่ 1"],
      },
    ],
    partialFailureEpisodeNumbers: [],
    perEpisodeWarnings: [],
    rawText: "ตอนที่ 1: ตอนใหม่: จุดเริ่มต้นที่ดีขึ้น\n...",
  };
});

describe("VerticalDramaImproveScriptCard — visibility", () => {
  it("renders nothing at all when hasDrafts is false (byte-identical to not mounting)", () => {
    const { container } = render(
      <VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={false} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("vd-improve-script-card")).not.toBeInTheDocument();
  });

  it("shows the request box and primary CTA once hasDrafts is true and readOnly is false", () => {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    expect(screen.getByTestId("vd-improve-script-card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ปรับปรุงบทละครให้มีความสมบูรณ์" })).toBeInTheDocument();
  });

  it("hides the primary CTA and the edit affordance in read-only mode", () => {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={true} hasDrafts={true} />);
    expect(screen.queryByTestId("vd-improve-script-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-improve-script-request-edit")).not.toBeInTheDocument();
  });
});

describe("VerticalDramaImproveScriptCard — request text default + edit toggle", () => {
  it("seeds the request text with the exact default value", () => {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    expect(screen.getByTestId("vd-improve-script-request-text")).toHaveTextContent(
      IMPROVE_SCRIPT_DEFAULT_REQUEST_TEXT,
    );
  });

  it("clicking the pencil switches to an editable textarea seeded with the current value", () => {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-request-edit"));
    expect(screen.getByTestId("vd-improve-script-request-textarea")).toHaveValue(
      IMPROVE_SCRIPT_DEFAULT_REQUEST_TEXT,
    );
  });

  it("saving a new value replaces the request text and exits edit mode", () => {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-request-edit"));
    fireEvent.change(screen.getByTestId("vd-improve-script-request-textarea"), {
      target: { value: "ขอให้เพิ่มความตลกในบทพูด" },
    });
    fireEvent.click(screen.getByTestId("vd-improve-script-request-save"));
    expect(screen.queryByTestId("vd-improve-script-request-textarea")).not.toBeInTheDocument();
    expect(screen.getByTestId("vd-improve-script-request-text")).toHaveTextContent("ขอให้เพิ่มความตลกในบทพูด");
  });

  it("canceling an edit discards the draft change and keeps the prior value", () => {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-request-edit"));
    fireEvent.change(screen.getByTestId("vd-improve-script-request-textarea"), {
      target: { value: "ข้อความที่ไม่ต้องการบันทึก" },
    });
    fireEvent.click(screen.getByTestId("vd-improve-script-request-cancel"));
    expect(screen.getByTestId("vd-improve-script-request-text")).toHaveTextContent(
      IMPROVE_SCRIPT_DEFAULT_REQUEST_TEXT,
    );
  });
});

describe("VerticalDramaImproveScriptCard — starting the improve job", () => {
  it("clicking the CTA calls startImproveScript with a fresh idempotencyKey and the request text", async () => {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-cta"));

    expect(mockStartMutateAsync).toHaveBeenCalledTimes(1);
    const callArgs = mockStartMutateAsync.mock.calls[0][0] as {
      seriesId: string;
      userRevisionRequest: string;
      idempotencyKey: string;
    };
    expect(callArgs.seriesId).toBe("10");
    expect(callArgs.userRevisionRequest).toBe(IMPROVE_SCRIPT_DEFAULT_REQUEST_TEXT);
    expect(typeof callArgs.idempotencyKey).toBe("string");
    expect(callArgs.idempotencyKey.length).toBeGreaterThan(0);

    await waitFor(() => expect(screen.getByTestId("vd-improve-script-result")).toBeInTheDocument());
  });

  it("shows a live round-aware progress region while the job is in flight", async () => {
    let resolveFirstFetch!: (value: unknown) => void;
    mockGetStoryJobStatusFetch.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstFetch = resolve; }),
    );
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-cta"));

    await waitFor(() => expect(screen.getByTestId("vd-improve-script-progress")).toBeInTheDocument());
    const liveRegion = screen.getByTestId("vd-improve-script-progress");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");

    resolveFirstFetch({
      kind: "improve_script",
      status: "running",
      progress: { phase: "fix", chunkIndex: 2, chunkCount: 2, callsDone: 2 },
    });
    await waitFor(() =>
      expect(screen.getByTestId("vd-improve-script-progress")).toHaveTextContent("กำลังปรับปรุง... (รอบ 2/2)"),
    );
  });

  it("prefers the episode-aware progress text once episodeIndex/episodeCount are present (per-episode generation rewrite)", async () => {
    let resolveFirstFetch!: (value: unknown) => void;
    mockGetStoryJobStatusFetch.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstFetch = resolve; }),
    );
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-cta"));

    await waitFor(() => expect(screen.getByTestId("vd-improve-script-progress")).toBeInTheDocument());

    resolveFirstFetch({
      kind: "improve_script",
      status: "running",
      progress: {
        phase: "fix",
        chunkIndex: 1,
        chunkCount: 2,
        episodeIndex: 2,
        episodeCount: 3,
        callsDone: 2,
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId("vd-improve-script-progress")).toHaveTextContent(
        "กำลังปรับปรุงตอนที่ 2/3... (รอบ 1/2)",
      ),
    );
  });

  it("shows an error toast and no result card when the job fails", async () => {
    startShouldFail = true;
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-cta"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("improve boom"));
    expect(screen.queryByTestId("vd-improve-script-result")).not.toBeInTheDocument();
  });
});

describe("VerticalDramaImproveScriptCard — needsReview (fail-closed)", () => {
  beforeEach(() => {
    improveScriptResult = {
      scoreSummary: "",
      expectedEpisodeNumbers: [1, 2],
      needsReview: true,
      needsReviewReasons: ["ขาดตอนที่ 2 ในผลลัพธ์", "พบหมายเลขตอนซ้ำในผลลัพธ์"],
      improvedItems: [],
      partialFailureEpisodeNumbers: [],
      perEpisodeWarnings: [],
      rawText: "ตอนที่ 1: ...\n(เนื้อหาไม่ครบ)",
    };
  });

  async function renderAndStart() {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-cta"));
    await waitFor(() => expect(screen.getByTestId("vd-improve-script-needs-review")).toBeInTheDocument());
  }

  it("shows the needs-review warning with every reason listed", async () => {
    await renderAndStart();
    expect(screen.getByTestId("vd-improve-script-needs-review-reasons")).toHaveTextContent(
      "ขาดตอนที่ 2 ในผลลัพธ์",
    );
    expect(screen.getByTestId("vd-improve-script-needs-review-reasons")).toHaveTextContent(
      "พบหมายเลขตอนซ้ำในผลลัพธ์",
    );
  });

  it("shows a raw-text disclosure with the full rawText", async () => {
    await renderAndStart();
    expect(screen.getByTestId("vd-improve-script-raw-text-toggle")).toHaveTextContent("(เนื้อหาไม่ครบ)");
  });

  it("shows ONLY a discard action — never a confirm button — and never renders the comparison view", async () => {
    await renderAndStart();
    expect(screen.getByTestId("vd-improve-script-discard-cta")).toBeInTheDocument();
    expect(screen.queryByTestId("vd-improve-script-confirm-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-improve-script-comparison")).not.toBeInTheDocument();
  });

  it("discarding calls discardImproveScript and clears the result", async () => {
    await renderAndStart();
    fireEvent.click(screen.getByTestId("vd-improve-script-discard-cta"));
    await waitFor(() =>
      expect(mockDiscardMutateAsync).toHaveBeenCalledWith({ seriesId: "10", jobId: "improve-script-job" }),
    );
    await waitFor(() => expect(screen.queryByTestId("vd-improve-script-result")).not.toBeInTheDocument());
    expect(mockConfirmMutateAsync).not.toHaveBeenCalled();
  });
});

describe("VerticalDramaImproveScriptCard — success comparison view", () => {
  beforeEach(() => {
    seriesGetData = {
      series: {
        bible: {
          episodeBreakdown: [
            {
              episodeNumber: 1,
              workingTitle: "เดิม: จุดเริ่มต้น",
              logline: "โลจิกไลน์เดิม",
              keyBeats: ["จุดเดิม 1"],
            },
          ],
        },
      },
    };
  });

  async function renderAndStart() {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-cta"));
    await waitFor(() => expect(screen.getByTestId("vd-improve-script-comparison")).toBeInTheDocument());
  }

  it("renders one diff row per expected episode with both old and new sides", async () => {
    await renderAndStart();
    const row = screen.getByTestId("vd-improve-script-diff-row-1");
    expect(row).toHaveTextContent("เดิม: จุดเริ่มต้น");
    expect(row).toHaveTextContent("ตอนใหม่: จุดเริ่มต้นที่ดีขึ้น");
  });

  it("shows the confirm and discard buttons together (never needs-review copy)", async () => {
    await renderAndStart();
    expect(screen.getByTestId("vd-improve-script-confirm-cta")).toBeInTheDocument();
    expect(screen.getByTestId("vd-improve-script-discard-cta")).toBeInTheDocument();
    expect(screen.queryByTestId("vd-improve-script-needs-review")).not.toBeInTheDocument();
  });

  it("confirming calls confirmImproveScript, shows a success toast, invalidates get, and clears the result", async () => {
    await renderAndStart();
    fireEvent.click(screen.getByTestId("vd-improve-script-confirm-cta"));

    await waitFor(() =>
      expect(mockConfirmMutateAsync).toHaveBeenCalledWith({ seriesId: "10", jobId: "improve-script-job" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("ปรับปรุงแล้ว 1 ตอน"));
    expect(mockInvalidateSeriesGet).toHaveBeenCalledWith({ seriesId: "10" });
    await waitFor(() => expect(screen.queryByTestId("vd-improve-script-result")).not.toBeInTheDocument());
  });

  it("discarding calls discardImproveScript and clears the result without invalidating", async () => {
    await renderAndStart();
    fireEvent.click(screen.getByTestId("vd-improve-script-discard-cta"));

    await waitFor(() =>
      expect(mockDiscardMutateAsync).toHaveBeenCalledWith({ seriesId: "10", jobId: "improve-script-job" }),
    );
    await waitFor(() => expect(screen.queryByTestId("vd-improve-script-result")).not.toBeInTheDocument());
    expect(mockInvalidateSeriesGet).not.toHaveBeenCalled();
  });
});

describe("VerticalDramaImproveScriptCard — partial success (per-episode generation rewrite)", () => {
  beforeEach(() => {
    seriesGetData = {
      series: {
        bible: {
          episodeBreakdown: [
            { episodeNumber: 1, workingTitle: "เดิม: ตอน 1", logline: "โลจิกไลน์เดิม 1", keyBeats: ["จุดเดิม 1"] },
            { episodeNumber: 2, workingTitle: "เดิม: ตอน 2", logline: "โลจิกไลน์เดิม 2", keyBeats: ["จุดเดิม 2"] },
            { episodeNumber: 3, workingTitle: "เดิม: ตอน 3", logline: "โลจิกไลน์เดิม 3", keyBeats: ["จุดเดิม 3"] },
          ],
        },
      },
    };
    improveScriptResult = {
      scoreSummary: "ตอนที่ 1: คะแนน 8/10\nตอนที่ 2: คะแนน 8/10",
      expectedEpisodeNumbers: [1, 2, 3],
      needsReview: false,
      needsReviewReasons: [],
      improvedItems: [
        { episodeNumber: 1, workingTitle: "ตอนใหม่ 1", logline: "โลจิกไลน์ใหม่ 1", keyBeats: ["จุดใหม่ 1"] },
        { episodeNumber: 2, workingTitle: "ตอนใหม่ 2", logline: "โลจิกไลน์ใหม่ 2", keyBeats: ["จุดใหม่ 2"] },
      ],
      partialFailureEpisodeNumbers: [3],
      perEpisodeWarnings: [{ episodeNumber: 3, reasons: ["จำนวนช็อตไม่ครบ 9 ช็อต"] }],
      rawText: "ตอนที่ 1: ...\nตอนที่ 2: ...\nตอนที่ 3: (ไม่ผ่านการตรวจสอบ)",
    };
  });

  async function renderAndStart() {
    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);
    fireEvent.click(screen.getByTestId("vd-improve-script-cta"));
    await waitFor(() => expect(screen.getByTestId("vd-improve-script-comparison")).toBeInTheDocument());
  }

  it("renders the non-blocking partial-failure warning with the failed episode's reasons", async () => {
    await renderAndStart();
    const warning = screen.getByTestId("vd-improve-script-partial-failure-warning");
    expect(warning).toHaveTextContent("1 ตอนไม่ผ่านการตรวจสอบ");
    expect(screen.getByTestId("vd-improve-script-partial-failure-reasons")).toHaveTextContent(
      "ตอนที่ 3: จำนวนช็อตไม่ครบ 9 ช็อต",
    );
  });

  it("keeps Confirm/Discard enabled and visible alongside the partial-failure warning", async () => {
    await renderAndStart();
    expect(screen.getByTestId("vd-improve-script-confirm-cta")).toBeEnabled();
    expect(screen.getByTestId("vd-improve-script-discard-cta")).toBeEnabled();
    expect(screen.queryByTestId("vd-improve-script-needs-review")).not.toBeInTheDocument();
  });

  it("shows the comparison list for only the successfully improved episodes (not the failed one)", async () => {
    await renderAndStart();
    expect(screen.getByTestId("vd-improve-script-diff-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("vd-improve-script-diff-row-2")).toBeInTheDocument();
    expect(screen.queryByTestId("vd-improve-script-diff-row-3")).not.toBeInTheDocument();
  });
});

describe("VerticalDramaImproveScriptCard — async story jobs (#28) resume-on-mount", () => {
  it("resumes polling an active improve_script job found on mount, disabling the CTA", async () => {
    activeStoryJobData = { jobId: "improve-script-job", kind: "improve_script", status: "running", progress: null };

    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);

    expect(screen.getByTestId("vd-improve-script-cta")).toBeDisabled();
    await waitFor(() =>
      expect(mockGetStoryJobStatusFetch).toHaveBeenCalledWith({ seriesId: "10", jobId: "improve-script-job" }),
    );
    await waitFor(() => expect(screen.getByTestId("vd-improve-script-result")).toBeInTheDocument());
  });

  it("ignores a resumed job of a different kind — never polls it, CTA stays enabled (that job belongs to `VerticalDramaDeepStoryDraftsActions` instead)", async () => {
    activeStoryJobData = { jobId: "gen-job", kind: "deep_generate", status: "running", progress: null };

    render(<VerticalDramaImproveScriptCard lang="th" seriesId="10" readOnly={false} hasDrafts={true} />);

    expect(screen.getByTestId("vd-improve-script-cta")).not.toBeDisabled();
    expect(mockGetStoryJobStatusFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("vd-improve-script-result")).not.toBeInTheDocument();
  });
});
