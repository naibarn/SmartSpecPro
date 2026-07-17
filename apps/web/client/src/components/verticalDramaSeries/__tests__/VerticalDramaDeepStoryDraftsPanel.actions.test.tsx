import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvalidateSeriesGet = vi.fn();
const mockGenerateMutateAsync = vi.fn();
const mockExtendMutateAsync = vi.fn();
let generateShouldFail = false;
let extendShouldFail = false;
let generateResult: {
  partial: boolean;
  horizonEndEpisode: number;
  chunkSizes: number[];
} = {
  partial: false,
  horizonEndEpisode: 10,
  chunkSizes: [5, 5],
};
let extendResult: {
  partial: boolean;
  horizonEndEpisode: number;
  chunkSizes: number[];
  /** Task #22 (season-level product tie-in draft awareness, added 2026-07-09) — see its own dedicated describe block below. */
  tieInMismatchCount?: number;
} = {
  partial: false,
  horizonEndEpisode: 10,
  chunkSizes: [5],
};

// "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) —
// `VerticalDramaImproveScriptCard` is mounted unconditionally at the end of
// `VerticalDramaDeepStoryDraftsActions` (see that component's own module
// header), so every render in this file goes through its hooks too
// (`enabled: false` unless `deepDraftSummary` is passed, so no real fetch
// fires) — these harmless defaults exist purely so none of the OTHER
// (pre-existing) tests below break. Dedicated behavior tests for the card
// itself live in `VerticalDramaDeepStoryDraftsPanel.improveScript.test.tsx`.
let seasonCritiqueSeriesGetData: unknown = undefined;
const mockStartImproveScriptMutateAsync = vi.fn();
const mockConfirmImproveScriptMutateAsync = vi.fn();
const mockDiscardImproveScriptMutateAsync = vi.fn();

/** Async story jobs (#28) — the series' active job, as `getActiveStoryJob` would return it. `null` (default, reset in `beforeEach`) means no resume. */
let activeStoryJobData: {
  jobId: string;
  kind: string;
  status: string;
  progress: unknown;
} | null = null;

/**
 * Async story jobs (#28, added 2026-07-08) — `generateStoryBibleDeep`/
 * `extendStoryDraftHorizon`/`startImproveScript` now
 * enqueue (`mutateAsync` resolves with `{ jobId, deduped: false }`
 * immediately) and the component itself polls `getStoryJobStatus.fetch` to
 * completion. This fake resolves EVERY poll to a TERMINAL status on the
 * FIRST call (no `setTimeout` wait is ever hit inside
 * `pollVerticalDramaStoryJob`), so tests stay fast and only need
 * `await waitFor(...)` for the handful of extra microtask hops between
 * `mutateAsync` resolving and the poll's `onSucceeded`/`onFailed` running —
 * never real timers.
 */
const mockGetStoryJobStatusFetch = vi.fn(
  async ({ jobId }: { jobId: string }) => {
    if (jobId === "gen-job") {
      return generateShouldFail
        ? {
            kind: "deep_generate",
            status: "failed",
            progress: null,
            error: "generate boom",
          }
        : {
            kind: "deep_generate",
            status: "succeeded",
            progress: null,
            result: generateResult,
          };
    }
    if (jobId === "extend-job") {
      return extendShouldFail
        ? {
            kind: "extend",
            status: "failed",
            progress: null,
            error: "extend boom",
          }
        : {
            kind: "extend",
            status: "succeeded",
            progress: null,
            result: extendResult,
          };
    }
    return null;
  }
);

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
        useQuery: () => ({
          data: seasonCritiqueSeriesGetData,
          isLoading: false,
        }),
      },
      getActiveStoryJob: {
        // No active job to resume in this file's tests by default — resume
        // behavior has its own dedicated coverage below.
        useQuery: () => ({ data: activeStoryJobData }),
      },
      generateStoryBibleDeep: {
        useMutation: (opts: {
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutateAsync: async (input: unknown) => {
            mockGenerateMutateAsync(input);
            return { jobId: "gen-job", deduped: false };
          },
          isPending: false,
        }),
      },
      extendStoryDraftHorizon: {
        useMutation: (opts: {
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutateAsync: async (input: unknown) => {
            mockExtendMutateAsync(input);
            return { jobId: "extend-job", deduped: false };
          },
          isPending: false,
        }),
      },
      startImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutateAsync: async (input: unknown) => {
            mockStartImproveScriptMutateAsync(input);
            return { jobId: "improve-script-job", deduped: false };
          },
          isPending: false,
        }),
      },
      confirmImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutateAsync: async (input: unknown) => {
            mockConfirmImproveScriptMutateAsync(input);
            return { updatedEpisodeNumbers: [] };
          },
          isPending: false,
        }),
      },
      discardImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutateAsync: async (input: unknown) => {
            mockDiscardImproveScriptMutateAsync(input);
            return { ok: true };
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  // Task #22 (added 2026-07-09) — `warning`/`info` added for the tie-in
  // reconciliation summary toast (see its own dedicated describe block
  // below); every pre-existing test only ever asserts on `success`/`error`
  // and never triggers a `tieInMismatchCount`-bearing result, so this
  // addition is a no-op for them.
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { toast } from "sonner";
import { VerticalDramaDeepStoryDraftsActions } from "@/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel";

function resolvedOnGenerateStoryBible() {
  return vi.fn().mockResolvedValue(undefined);
}

function rejectedOnGenerateStoryBible() {
  return vi.fn().mockRejectedValue(new Error("story boom"));
}

describe("VerticalDramaDeepStoryDraftsActions — consolidated primary action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateShouldFail = false;
    extendShouldFail = false;
    generateResult = {
      partial: false,
      horizonEndEpisode: 10,
      chunkSizes: [5, 5],
    };
    extendResult = { partial: false, horizonEndEpisode: 10, chunkSizes: [5] };
    seasonCritiqueSeriesGetData = undefined;
    activeStoryJobData = null;
  });

  describe("no plan yet (hasPlan=false) — always chains both calls", () => {
    it("shows the 'generate full story + detailed drafts' primary CTA", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/,
        })
      ).toBeInTheDocument();
    });

    it("still shows the primary CTA even when targetEpisodeCount is missing/zero (must stay actionable)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={0}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/,
        })
      ).toBeInTheDocument();
    });

    it("opens the confirm dialog WITHOUT the scope radio (nothing to choose yet)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/,
        })
      );
      expect(
        screen.getByTestId("vd-deep-story-drafts-confirm")
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("vd-deep-story-drafts-scope")
      ).not.toBeInTheDocument();
    });

    it("DOES show the quality-mode picker (debt-item-5, 2026-07-08) — defaults to premium (production-grade full-story generation upgrade, 2026-07-13), leaving it untouched sends mode: 'premium'", async () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/,
        })
      );
      expect(
        screen.getByTestId("vd-deep-story-drafts-mode")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "คิดหลายรอบ (พรีเมียม) — แนะนำ" })
      ).toHaveAttribute("aria-checked", "true");

      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );
      await waitFor(() =>
        expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1)
      );
      const deepInput = mockGenerateMutateAsync.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(deepInput.mode).toBe("premium");
    });

    it("selecting standard at the no-plan bootstrap threads mode: 'standard' into the CHAINED generateStoryBibleDeep call (2026-07-13 — mode is now always sent explicitly, never omitted)", async () => {
      const callOrder: string[] = [];
      const onGenerateStoryBible = vi.fn(async () => {
        callOrder.push("story");
      });
      mockGenerateMutateAsync.mockImplementationOnce((input: unknown) => {
        callOrder.push("deep");
        return { jobId: "gen-job", deduped: false };
      });

      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={false}
          onGenerateStoryBible={onGenerateStoryBible}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/,
        })
      );
      // No scope radio at bootstrap (nothing to "keep" yet), but the mode
      // radio is present and selectable.
      expect(
        screen.queryByTestId("vd-deep-story-drafts-scope")
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("radio", { name: "มาตรฐาน (เร็ว ประหยัด)" })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1)
      );
      expect(callOrder).toEqual(["story", "deep"]);
      const input = mockGenerateMutateAsync.mock.calls[0][0] as {
        mode?: string;
      };
      expect(input.mode).toBe("standard");
    });

    it("confirming chains onGenerateStoryBible THEN generateStoryBibleDeep, in order, with a fresh idempotency key", async () => {
      const callOrder: string[] = [];
      const onGenerateStoryBible = vi.fn(async () => {
        callOrder.push("story");
      });
      mockGenerateMutateAsync.mockImplementationOnce((input: unknown) => {
        callOrder.push("deep");
        return { jobId: "gen-job", deduped: false };
      });

      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={false}
          onGenerateStoryBible={onGenerateStoryBible}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/,
        })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1)
      );
      expect(onGenerateStoryBible).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["story", "deep"]);

      const deepInput = mockGenerateMutateAsync.mock.calls[0][0] as {
        seriesId: string;
        idempotencyKey: string;
      };
      expect(deepInput.seriesId).toBe("10");
      expect(typeof deepInput.idempotencyKey).toBe("string");
      expect(deepInput.idempotencyKey.length).toBeGreaterThan(0);
    });

    it("phase-1 (story) failure aborts the chain — generateStoryBibleDeep is never called", async () => {
      const onGenerateStoryBible = rejectedOnGenerateStoryBible();
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={false}
          onGenerateStoryBible={onGenerateStoryBible}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/,
        })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(onGenerateStoryBible).toHaveBeenCalledTimes(1)
      );
      expect(mockGenerateMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe("plan exists (hasPlan=true) — scope radio controls chaining", () => {
    it("shows the 'update detailed story' primary CTA (not the old 'generate' wording)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      ).toBeInTheDocument();
    });

    it("opens the confirm dialog WITH the scope radio, defaulting to 'keep the current plot'", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      expect(
        screen.getByTestId("vd-deep-story-drafts-scope")
      ).toBeInTheDocument();
      const keepRadio = screen.getByRole("radio", {
        name: /เก็บโครงเรื่องเดิม/,
      });
      const rewriteRadio = screen.getByRole("radio", {
        name: /คิดโครงเรื่องใหม่ทั้งหมด/,
      });
      expect(keepRadio).toHaveAttribute("aria-checked", "true");
      expect(rewriteRadio).toHaveAttribute("aria-checked", "false");
    });

    it("default scope (keep) confirm calls generateStoryBibleDeep ONLY — onGenerateStoryBible is never called", async () => {
      const onGenerateStoryBible = resolvedOnGenerateStoryBible();
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={true}
          onGenerateStoryBible={onGenerateStoryBible}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1);
      expect(onGenerateStoryBible).not.toHaveBeenCalled();
      const input = mockGenerateMutateAsync.mock.calls[0][0] as {
        seriesId: string;
        idempotencyKey: string;
      };
      expect(input.seriesId).toBe("10");
      expect(typeof input.idempotencyKey).toBe("string");
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("ร่างแล้ว 10 ตอนย่อย")
      );
    });

    it("selecting 'rewrite everything' then confirming chains onGenerateStoryBible THEN generateStoryBibleDeep, in order", async () => {
      const callOrder: string[] = [];
      const onGenerateStoryBible = vi.fn(async () => {
        callOrder.push("story");
      });
      mockGenerateMutateAsync.mockImplementationOnce((input: unknown) => {
        callOrder.push("deep");
        return { jobId: "gen-job", deduped: false };
      });

      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={true}
          onGenerateStoryBible={onGenerateStoryBible}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByRole("radio", { name: /คิดโครงเรื่องใหม่ทั้งหมด/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1)
      );
      expect(callOrder).toEqual(["story", "deep"]);
    });

    it("phase-1 failure (rewrite scope) aborts — generateStoryBibleDeep never called", async () => {
      const onGenerateStoryBible = rejectedOnGenerateStoryBible();
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={true}
          onGenerateStoryBible={onGenerateStoryBible}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByRole("radio", { name: /คิดโครงเรื่องใหม่ทั้งหมด/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(onGenerateStoryBible).toHaveBeenCalledTimes(1)
      );
      expect(mockGenerateMutateAsync).not.toHaveBeenCalled();
    });

    it("reopening the dialog after a keep-scope confirm resets the scope back to 'keep' (predictable default)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByRole("radio", { name: /คิดโครงเรื่องใหม่ทั้งหมด/ })
      );
      // Switch back to keep before submitting, so this run stays a single (non-chained) call.
      fireEvent.click(
        screen.getByRole("radio", { name: /เก็บโครงเรื่องเดิม/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      expect(
        screen.getByRole("radio", { name: /เก็บโครงเรื่องเดิม/ })
      ).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("scope radio keyboard accessibility", () => {
    it("is implemented with real role=radio controls inside a role=radiogroup", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      const scopeGroup = screen.getByRole("radiogroup", {
        name: "ขอบเขตการสร้าง",
      });
      expect(scopeGroup).toBeInTheDocument();
      // Scoped to the scope group specifically — W11-B adds a SIBLING mode
      // radiogroup (also 2 radios) to the same dialog; see the "premium mode
      // picker" describe block below for its own role=radiogroup coverage.
      expect(within(scopeGroup).getAllByRole("radio")).toHaveLength(2);
    });

    it("Tab focuses the checked radio, ArrowDown moves focus to the sibling, and Space then selects it", async () => {
      const user = userEvent.setup();
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      const keepRadio = screen.getByRole("radio", {
        name: /เก็บโครงเรื่องเดิม/,
      });
      const rewriteRadio = screen.getByRole("radio", {
        name: /คิดโครงเรื่องใหม่ทั้งหมด/,
      });

      await user.click(keepRadio);
      expect(document.activeElement).toBe(keepRadio);

      // Roving-tabindex: ArrowDown moves DOM focus to the sibling radio.
      await user.keyboard("{ArrowDown}");
      expect(document.activeElement).toBe(rewriteRadio);

      // Space activates whatever is currently focused (native <button> semantics).
      await user.keyboard(" ");
      expect(rewriteRadio).toHaveAttribute("aria-checked", "true");
      expect(keepRadio).toHaveAttribute("aria-checked", "false");
    });
  });

  describe("horizon/rounds/credits dialog copy — unchanged mechanics", () => {
    it("shows horizon count, call rounds, and the credits warning when a plan exists", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={12}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      expect(
        screen.getByText("จำนวนตอนย่อยที่จะร่าง: 12 ตอนย่อย")
      ).toBeInTheDocument();
      expect(screen.getByText("จำนวนรอบเรียก: 3 รอบ")).toBeInTheDocument();
      expect(screen.getByText(/หักเครดิตตามจริงต่อรอบ/)).toBeInTheDocument();
    });
  });

  describe("partial banner + errors (unchanged mechanics)", () => {
    it("shows the amber partial-warning banner when the (keep-scope) mutation returns partial:true", async () => {
      generateResult = { partial: true, horizonEndEpisode: 3, chunkSizes: [3] };
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );
      await waitFor(() =>
        expect(
          screen.getByText(
            "ร่างสำเร็จบางส่วน (ถึงตอนย่อยที่ 3) — กดขยายเพื่อทำต่อ"
          )
        ).toBeInTheDocument()
      );
    });

    it("shows an error toast when the deep-draft job itself fails (keep scope)", async () => {
      generateShouldFail = true;
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("generate boom")
      );
    });
  });

  describe("readOnly", () => {
    it("hides the primary CTA when readOnly, for both hasPlan states", () => {
      const { rerender } = render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={true}
          targetEpisodeCount={10}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.queryByTestId("vd-deep-story-drafts-primary-cta")
      ).not.toBeInTheDocument();

      rerender(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={true}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.queryByTestId("vd-deep-story-drafts-primary-cta")
      ).not.toBeInTheDocument();
    });
  });

  describe("summary + extend (unchanged mechanics)", () => {
    it("shows the summary banner + extend CTA once deepDraftSummary exists, alongside the primary CTA", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.getByText("ร่างละเอียดแล้ว 5/10 ตอนย่อย (ถึงตอนย่อยที่ 5)")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      ).toBeInTheDocument();
      // The primary "update" CTA still coexists — the summary does not replace it.
      expect(
        screen.getByRole("button", {
          name: /อัปเดตเนื้อเรื่องละเอียดทุกตอนย่อย/,
        })
      ).toBeInTheDocument();
    });

    it("hides the extend CTA once horizonEndEpisode reaches totalEpisodes", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 10,
            episodesWithDrafts: 10,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.getByText("ร่างละเอียดแล้ว 10/10 ตอนย่อย (ถึงตอนย่อยที่ 10)")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      ).not.toBeInTheDocument();
    });

    it("extend calls extendStoryDraftHorizon with {seriesId, additionalEpisodes: 5, idempotencyKey}", async () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      );

      await waitFor(() =>
        expect(mockExtendMutateAsync).toHaveBeenCalledTimes(1)
      );
      const input = mockExtendMutateAsync.mock.calls[0][0] as {
        seriesId: string;
        additionalEpisodes: number;
        idempotencyKey: string;
      };
      expect(input).toEqual(
        expect.objectContaining({ seriesId: "10", additionalEpisodes: 5 })
      );
      expect(typeof input.idempotencyKey).toBe("string");
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("ร่างแล้ว 5 ตอนย่อย")
      );
      expect(mockInvalidateSeriesGet).toHaveBeenCalledWith({ seriesId: "10" });
    });

    it("hides the extend button (but keeps the summary text) when readOnly", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={true}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.getByText("ร่างละเอียดแล้ว 5/10 ตอนย่อย (ถึงตอนย่อยที่ 5)")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      ).not.toBeInTheDocument();
    });

    it("shows an error toast when extend's job fails", async () => {
      extendShouldFail = true;
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      );
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("extend boom")
      );
    });
  });

  /**
   * Premium multi-round drafts (W11-B) — quality-mode picker inside the
   * confirm dialog. Rendered unconditionally (debt-item-5, 2026-07-08 — see
   * the "DOES show the quality-mode picker" / "selecting premium at the
   * no-plan bootstrap" tests above for the `hasPlan=false` coverage); this
   * describe block exercises the `hasPlan=true` rendering specifically
   * (scope + mode both present, a11y radiogroup shape, credit estimate,
   * default/selected submit payloads, and the dialog-reopen reset).
   */
  describe("premium mode picker (W11-B, hasPlan=true)", () => {
    it("opens the confirm dialog WITH the mode radio, defaulting to 'premium' (production-grade full-story generation upgrade, 2026-07-13)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      expect(
        screen.getByTestId("vd-deep-story-drafts-mode")
      ).toBeInTheDocument();
      const standardRadio = screen.getByRole("radio", {
        name: "มาตรฐาน (เร็ว ประหยัด)",
      });
      const premiumRadio = screen.getByRole("radio", {
        name: "คิดหลายรอบ (พรีเมียม) — แนะนำ",
      });
      expect(standardRadio).toHaveAttribute("aria-checked", "false");
      expect(premiumRadio).toHaveAttribute("aria-checked", "true");
    });

    it("is a real role=radiogroup with 2 role=radio options (a11y convention, matches the scope group)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      expect(
        screen.getByRole("radiogroup", { name: "โหมดคุณภาพการร่าง" })
      ).toBeInTheDocument();
      // 2 scope radios + 2 mode radios = 4 total.
      expect(screen.getAllByRole("radio")).toHaveLength(4);
    });

    it("shows the premium option's one-line call-estimate hint, matching chunks*6+2", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={12}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      // horizon=12 -> rounds(chunks)=ceil(12/5)=3 -> premium estimate = 3*10+2 = 32.
      expect(screen.getByText(/~32 ครั้งเรียก\)/)).toBeInTheDocument();
    });

    it("default (premium) confirm sends generateStoryBibleDeep WITH mode: 'premium' (production-grade full-story generation upgrade, 2026-07-13 — mode is always sent explicitly now)", async () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1)
      );
      const input = mockGenerateMutateAsync.mock.calls[0][0] as {
        mode?: string;
      };
      expect(input.mode).toBe("premium");
    });

    it("selecting standard + keep scope sends generateStoryBibleDeep WITH mode: 'standard'", async () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByRole("radio", { name: "มาตรฐาน (เร็ว ประหยัด)" })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1)
      );
      const input = mockGenerateMutateAsync.mock.calls[0][0] as {
        mode?: string;
      };
      expect(input.mode).toBe("standard");
    });

    it("selecting premium + rewrite scope threads mode: 'premium' into the CHAINED generateStoryBibleDeep call", async () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByRole("radio", { name: /คิดโครงเรื่องใหม่ทั้งหมด/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1)
      );
      const input = mockGenerateMutateAsync.mock.calls[0][0] as {
        mode?: string;
      };
      expect(input.mode).toBe("premium");
    });

    it("reopening the dialog after selecting standard resets the mode back to 'premium' (predictable default, mirrors scope)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByRole("radio", { name: "มาตรฐาน (เร็ว ประหยัด)" })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      expect(
        screen.getByRole("radio", { name: "คิดหลายรอบ (พรีเมียม) — แนะนำ" })
      ).toHaveAttribute("aria-checked", "true");
    });
  });

  /**
   * Premium multi-round drafts (W11-B) — the extend CTA has no confirm
   * dialog, so it gets its own small "use premium" checkbox instead of the
   * dialog's mode RadioGroup (owner-approved simplification — see the module
   * header doc comment). Default unchecked; does NOT auto-reset after firing
   * (ordinary persistent toggle — simplest, least-surprising behavior for a
   * dialog-less control, unlike the confirm dialog's per-open reset).
   */
  describe("extend premium checkbox (W11-B)", () => {
    it("renders unchecked by default, alongside the extend CTA", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      const checkbox = screen.getByRole("checkbox", {
        name: "ใช้โหมดพรีเมียมสำหรับการขยายนี้",
      });
      expect(checkbox).toHaveAttribute("aria-checked", "false");
    });

    it("checking it then clicking extend sends extendStoryDraftHorizon WITH mode: 'premium'", async () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "ใช้โหมดพรีเมียมสำหรับการขยายนี้",
        })
      );
      fireEvent.click(
        screen.getByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      );

      await waitFor(() =>
        expect(mockExtendMutateAsync).toHaveBeenCalledTimes(1)
      );
      const input = mockExtendMutateAsync.mock.calls[0][0] as { mode?: string };
      expect(input.mode).toBe("premium");
    });

    it("leaving it unchecked sends extendStoryDraftHorizon WITHOUT a `mode` key", async () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      );

      await waitFor(() =>
        expect(mockExtendMutateAsync).toHaveBeenCalledTimes(1)
      );
      const input = mockExtendMutateAsync.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect("mode" in input).toBe(false);
    });

    it("does NOT auto-reset after a successful extend (ordinary persistent toggle, not a per-open reset)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      const checkbox = screen.getByRole("checkbox", {
        name: "ใช้โหมดพรีเมียมสำหรับการขยายนี้",
      });
      fireEvent.click(checkbox);
      fireEvent.click(
        screen.getByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      );
      expect(checkbox).toHaveAttribute("aria-checked", "true");
    });

    it("is hidden when readOnly (same gate as the extend button itself)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={true}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.queryByRole("checkbox", {
          name: "ใช้โหมดพรีเมียมสำหรับการขยายนี้",
        })
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Owner-reported fix (2026-07-08, screenshot review) — the confirm
   * dialog's radio cards previously rendered inconsistently (one option
   * looked square/checkbox-like, the other circular) and the selected state
   * was nearly invisible, with the default not visibly selected on open.
   * ONE shared card treatment now applies to BOTH the scope group AND the
   * mode group: whole-card-clickable, a clear `border-primary`/`bg-primary/5`
   * + bold-title treatment while selected, and a plain bordered/hoverable
   * card otherwise.
   */
  describe("confirm-dialog radio card styling (owner-reported fix, 2026-07-08)", () => {
    function openDialogWithPlan() {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
    }

    it("every scope + mode option is a real role=radio control (4 total, both groups)", () => {
      openDialogWithPlan();
      expect(screen.getAllByRole("radio")).toHaveLength(4);
      expect(
        screen.getByRole("radio", { name: /เก็บโครงเรื่องเดิม/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /คิดโครงเรื่องใหม่ทั้งหมด/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "มาตรฐาน (เร็ว ประหยัด)" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "คิดหลายรอบ (พรีเมียม) — แนะนำ" })
      ).toBeInTheDocument();
    });

    it("the defaults (keep + premium) are visibly checked on open: aria-checked=true AND the selected card styling (production-grade full-story generation upgrade, 2026-07-13 — mode default flipped from standard to premium)", () => {
      openDialogWithPlan();
      const keepRadio = screen.getByRole("radio", {
        name: /เก็บโครงเรื่องเดิม/,
      });
      const premiumRadio = screen.getByRole("radio", {
        name: "คิดหลายรอบ (พรีเมียม) — แนะนำ",
      });
      expect(keepRadio).toHaveAttribute("aria-checked", "true");
      expect(premiumRadio).toHaveAttribute("aria-checked", "true");

      const keepCard = keepRadio.closest("label");
      const premiumCard = premiumRadio.closest("label");
      expect(keepCard).toHaveClass(
        "border-2",
        "border-primary",
        "bg-primary/5"
      );
      expect(premiumCard).toHaveClass(
        "border-2",
        "border-primary",
        "bg-primary/5"
      );

      // The unchecked siblings render the plain (unselected) card treatment.
      const rewriteRadio = screen.getByRole("radio", {
        name: /คิดโครงเรื่องใหม่ทั้งหมด/,
      });
      const standardRadio = screen.getByRole("radio", {
        name: "มาตรฐาน (เร็ว ประหยัด)",
      });
      expect(rewriteRadio).toHaveAttribute("aria-checked", "false");
      expect(standardRadio).toHaveAttribute("aria-checked", "false");
      expect(rewriteRadio.closest("label")).toHaveClass(
        "border",
        "border-border",
        "bg-background"
      );
      expect(rewriteRadio.closest("label")).not.toHaveClass("border-primary");
      expect(standardRadio.closest("label")).toHaveClass(
        "border",
        "border-border",
        "bg-background"
      );
      expect(standardRadio.closest("label")).not.toHaveClass("border-primary");
    });

    it("selected card styling toggles when a different option is chosen, in BOTH the scope and mode groups", () => {
      openDialogWithPlan();
      const keepRadio = screen.getByRole("radio", {
        name: /เก็บโครงเรื่องเดิม/,
      });
      const rewriteRadio = screen.getByRole("radio", {
        name: /คิดโครงเรื่องใหม่ทั้งหมด/,
      });
      fireEvent.click(rewriteRadio);
      expect(rewriteRadio.closest("label")).toHaveClass("border-primary");
      expect(keepRadio.closest("label")).not.toHaveClass("border-primary");
      expect(keepRadio.closest("label")).toHaveClass(
        "border-border",
        "bg-background"
      );

      const standardRadio = screen.getByRole("radio", {
        name: "มาตรฐาน (เร็ว ประหยัด)",
      });
      const premiumRadio = screen.getByRole("radio", {
        name: "คิดหลายรอบ (พรีเมียม) — แนะนำ",
      });
      fireEvent.click(standardRadio);
      expect(standardRadio.closest("label")).toHaveClass("border-primary");
      expect(premiumRadio.closest("label")).not.toHaveClass("border-primary");
      expect(premiumRadio.closest("label")).toHaveClass(
        "border-border",
        "bg-background"
      );
    });

    it("the selected card's title is font-medium; the unselected sibling's title is not", () => {
      openDialogWithPlan();
      const keepRadio = screen.getByRole("radio", {
        name: /เก็บโครงเรื่องเดิม/,
      });
      const rewriteRadio = screen.getByRole("radio", {
        name: /คิดโครงเรื่องใหม่ทั้งหมด/,
      });
      const keepCard = keepRadio.closest("label") as HTMLElement;
      const rewriteCard = rewriteRadio.closest("label") as HTMLElement;
      const keepTitle = within(keepCard).getByText(/เก็บโครงเรื่องเดิม/);
      const rewriteTitle = within(rewriteCard).getByText(
        /คิดโครงเรื่องใหม่ทั้งหมด/
      );
      expect(keepTitle).toHaveClass("font-medium");
      expect(rewriteTitle).not.toHaveClass("font-medium");
    });
  });

  /**
   * Owner-reported fix (2026-07-08) — the extend CTA's label always read a
   * hardcoded "+5" regardless of how many episodes were actually left (e.g.
   * 9/10 drafted still showed "ขยายร่างอีก 5 ตอน" even though only 1 episode
   * remained). The label now reads `min(5, totalEpisodes - horizonEndEpisode)`.
   */
  describe("extend CTA label matches remaining episodes (owner-reported fix, 2026-07-08)", () => {
    it("shows '+1' when only 1 episode remains (9/10)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 9,
            episodesWithDrafts: 9,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.getByRole("button", { name: /ขยายร่างอีก 1 ตอนย่อย/ })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      ).not.toBeInTheDocument();
    });

    it("caps at '+5' when many episodes remain (3/100)", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={100}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 3,
            episodesWithDrafts: 3,
            totalEpisodes: 100,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.getByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      ).toBeInTheDocument();
    });
  });

  it("generates a fresh idempotencyKey on every keep-scope confirm click (family convention)", async () => {
    render(
      <VerticalDramaDeepStoryDraftsActions
        lang="th"
        seriesId="10"
        readOnly={false}
        targetEpisodeCount={5}
        hasPlan={true}
        onGenerateStoryBible={resolvedOnGenerateStoryBible()}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
    );
    fireEvent.click(screen.getByTestId("vd-deep-story-drafts-confirm-submit"));
    await waitFor(() =>
      expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1)
    );

    fireEvent.click(
      screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
    );
    fireEvent.click(screen.getByTestId("vd-deep-story-drafts-confirm-submit"));
    await waitFor(() =>
      expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(2)
    );

    const first = (
      mockGenerateMutateAsync.mock.calls[0][0] as { idempotencyKey: string }
    ).idempotencyKey;
    const second = (
      mockGenerateMutateAsync.mock.calls[1][0] as { idempotencyKey: string }
    ).idempotencyKey;
    expect(first).not.toBe(second);
  });

  /* -------------------------------------------------------------------------- */
  /* Async story jobs (#28, added 2026-07-08) — progress text + resume-on-mount */
  /* -------------------------------------------------------------------------- */

  describe("async story jobs (#28) — progress + a11y live region", () => {
    it("shows the queued/progress live region while a job is in flight, and clears it once terminal", async () => {
      // Delay the first status fetch resolution to observe the "queued" state mid-flight.
      let resolveFirstFetch!: (value: unknown) => void;
      mockGetStoryJobStatusFetch.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirstFetch = resolve;
          })
      );

      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })
      );
      fireEvent.click(
        screen.getByTestId("vd-deep-story-drafts-confirm-submit")
      );

      await waitFor(() =>
        expect(
          screen.getByTestId("vd-deep-story-drafts-progress")
        ).toBeInTheDocument()
      );
      const liveRegion = screen.getByTestId("vd-deep-story-drafts-progress");
      expect(liveRegion).toHaveAttribute("aria-live", "polite");
      expect(liveRegion.textContent).toBe("กำลังอยู่ในคิว…");

      resolveFirstFetch({
        kind: "deep_generate",
        status: "succeeded",
        progress: null,
        result: generateResult,
      });
      await waitFor(() =>
        expect(
          screen.queryByTestId("vd-deep-story-drafts-progress")
        ).not.toBeInTheDocument()
      );
    });

    it("resumes polling an active deep_generate job found on mount, disabling the primary CTA", async () => {
      activeStoryJobData = {
        jobId: "gen-job",
        kind: "deep_generate",
        status: "running",
        progress: null,
      };

      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );

      expect(
        screen.getByTestId("vd-deep-story-drafts-primary-cta")
      ).toBeDisabled();
      await waitFor(() =>
        expect(mockGetStoryJobStatusFetch).toHaveBeenCalledWith({
          seriesId: "10",
          jobId: "gen-job",
        })
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("ร่างแล้ว 10 ตอนย่อย")
      );
    });

    it("ignores an active job of a DIFFERENT kind (critique/apply_critique belong to the season critique card)", () => {
      seasonCritiqueSeriesGetData = undefined;
      const { rerender } = render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      rerender(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={5}
          hasPlan={true}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      // No active deep_generate/extend job was ever injected in this test — the
      // primary CTA stays enabled (default `getActiveStoryJob` mock returns null).
      expect(
        screen.getByTestId("vd-deep-story-drafts-primary-cta")
      ).not.toBeDisabled();
    });
  });

  describe("format profile chip (task #23)", () => {
    it("shows the format profile chip in the confirm dialog for a 3-episode (ultra_short) series", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={3}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอนย่อย/,
        })
      );
      expect(
        screen.getByTestId("vd-deep-story-drafts-format-profile-chip")
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("vd-deep-story-drafts-format-profile-chip")
      ).toHaveTextContent(
        "โปรไฟล์ความยาว: ซีรีส์สั้นมาก — ทุกตอนย่อยเปิดด้วย hook ใน 3 วิ / เนื้อแน่นไม่มีตอนเติม"
      );
    });

    it("does NOT show the format profile chip for a 20-episode (standard) series", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={20}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอนย่อย/,
        })
      );
      expect(
        screen.getByTestId("vd-deep-story-drafts-confirm")
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("vd-deep-story-drafts-format-profile-chip")
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Task #22 (season-level product tie-in draft awareness, added 2026-07-09)
   * — the generate/extend success toast appends a tie-in reconciliation
   * summary line ONLY when the job result carries `tieInMismatchCount` (i.e.
   * tie-in draft awareness was actually active this run). Triggered via the
   * "extend" CTA (mirrors "summary + extend (unchanged mechanics)" above) —
   * the simplest existing path to a `onSucceeded` toast in this file.
   */
  describe("tie-in reconciliation summary toast (task #22)", () => {
    function renderWithExtend() {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={true}
          deepDraftSummary={{
            horizonEndEpisode: 5,
            episodesWithDrafts: 5,
            totalEpisodes: 10,
          }}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /ขยายร่างอีก 5 ตอนย่อย/ })
      );
    }

    it("appends NO extra toast when tieInMismatchCount is absent (grandfather — unchanged from before task #22)", async () => {
      extendResult = { partial: false, horizonEndEpisode: 10, chunkSizes: [5] };
      renderWithExtend();
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("ร่างแล้ว 5 ตอนย่อย")
      );
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("shows a warning toast naming the mismatch count when tieInMismatchCount > 0", async () => {
      extendResult = {
        partial: false,
        horizonEndEpisode: 10,
        chunkSizes: [5],
        tieInMismatchCount: 2,
      };
      renderWithExtend();
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("ร่างแล้ว 5 ตอนย่อย")
      );
      await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("2"));
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("shows an info toast confirming full reconciliation when tieInMismatchCount is exactly 0", async () => {
      extendResult = {
        partial: false,
        horizonEndEpisode: 10,
        chunkSizes: [5],
        tieInMismatchCount: 0,
      };
      renderWithExtend();
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("ร่างแล้ว 5 ตอนย่อย")
      );
      await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* User Premise read-only preview (F132A, section-02)                     */
  /* ---------------------------------------------------------------------- */
  describe("read-only premise preview (F132A)", () => {
    it("renders no preview when userPremise is absent", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
        />
      );
      expect(
        screen.queryByTestId("vd-deep-story-drafts-premise-preview")
      ).not.toBeInTheDocument();
    });

    it("renders the premise text and an edit-affordance link when userPremise is present", () => {
      const onEditPremiseClick = vi.fn();
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
          userPremise="ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล"
          onEditPremiseClick={onEditPremiseClick}
        />
      );
      const preview = screen.getByTestId(
        "vd-deep-story-drafts-premise-preview"
      );
      expect(preview).toHaveTextContent("ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล");

      fireEvent.click(
        screen.getByRole("button", { name: /แก้ไขที่การตั้งค่าซีรีย์/ })
      );
      expect(onEditPremiseClick).toHaveBeenCalledTimes(1);
    });

    it("renders no edit-affordance link when onEditPremiseClick is not provided", () => {
      render(
        <VerticalDramaDeepStoryDraftsActions
          lang="th"
          seriesId="10"
          readOnly={false}
          targetEpisodeCount={10}
          hasPlan={false}
          onGenerateStoryBible={resolvedOnGenerateStoryBible()}
          userPremise="โจทย์ไม่มีลิงก์แก้ไข"
        />
      );
      expect(
        screen.queryByRole("button", { name: /แก้ไขที่การตั้งค่าซีรีย์/ })
      ).not.toBeInTheDocument();
    });
  });
});
