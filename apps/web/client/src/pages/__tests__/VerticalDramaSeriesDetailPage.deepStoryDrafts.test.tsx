import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvalidateSeriesGet = vi.fn();
const mockGenerateNextEpisodesMutate = vi.fn();
const mockGenerateStoryBibleMutate = vi.fn();
const mockGenerateStoryBibleMutateAsync = vi.fn();
const mockGenerateStoryBibleDeepMutate = vi.fn();
const mockGenerateStoryBibleDeepMutateAsync = vi.fn();
const mockExtendMutate = vi.fn();
/**
 * Manual dialogue edits (W10.5) — `VerticalDramaDeepStoryDraftEpisodeDetail`
 * now calls this mutation's `useMutation()` unconditionally (React's rules of
 * hooks; see that component's own doc comment), so every test in this file
 * that mounts it (any `deepDraftsFlagEnabled: true` case with a shot-drafted
 * episode) needs it mocked, even though this file doesn't exercise the
 * editor itself — that is covered end-to-end by
 * `VerticalDramaDeepStoryDraftsPanel.episodeDetail.test.tsx`.
 */
const mockUpdateEpisodeDraftDialogueMutate = vi.fn();

let generateStoryBibleShouldFail = false;
let generateStoryBibleDeepShouldFail = false;
let generateStoryBibleResult: { creditsUsed: number } = { creditsUsed: 8 };
let generateStoryBibleDeepResult: { partial: boolean; horizonEndEpisode: number; chunkSizes: number[] } = {
  partial: false,
  horizonEndEpisode: 5,
  chunkSizes: [5],
};
let callOrder: string[] = [];

/**
 * Async story jobs (#28, added 2026-07-08) — `generateStoryBibleDeep`/
 * `extendStoryDraftHorizon` now enqueue (`mutateAsync` resolves with
 * `{ jobId: "gen-job", deduped: false }`) and
 * `VerticalDramaDeepStoryDraftsActions` itself polls `getStoryJobStatus.fetch`
 * to completion — see `VerticalDramaDeepStoryDraftsPanel.actions.test.tsx`'s
 * identical mocking convention (this file mirrors it for page-level coverage).
 */
const mockGetStoryJobStatusFetch = vi.fn(async ({ jobId }: { jobId: string }) => {
  if (jobId === "gen-job") {
    return generateStoryBibleDeepShouldFail
      ? { kind: "deep_generate", status: "failed", progress: null, error: "deep boom" }
      : { kind: "deep_generate", status: "succeeded", progress: null, result: generateStoryBibleDeepResult };
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
    verticalDramaEpisodes: {
      generateNextEpisodes: {
        useMutation: (_opts: unknown) => ({ mutate: mockGenerateNextEpisodesMutate, isPending: false }),
      },
    },
    verticalDramaSeries: {
      generateStoryBible: {
        useMutation: (opts: {
          onSuccess?: (data: unknown) => void;
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            mockGenerateStoryBibleMutate(input);
            if (generateStoryBibleShouldFail) opts?.onError?.({ message: "story boom" });
            else opts?.onSuccess?.(generateStoryBibleResult);
          },
          mutateAsync: async (input: unknown) => {
            mockGenerateStoryBibleMutateAsync(input);
            callOrder.push("story");
            if (generateStoryBibleShouldFail) {
              opts?.onError?.({ message: "story boom" });
              throw new Error("story boom");
            }
            opts?.onSuccess?.(generateStoryBibleResult);
            return generateStoryBibleResult;
          },
          isPending: false,
        }),
      },
      generateStoryBibleDeep: {
        useMutation: (_opts: { onError?: (err: { message?: string }) => void }) => ({
          mutate: mockGenerateStoryBibleDeepMutate,
          mutateAsync: async (input: unknown) => {
            mockGenerateStoryBibleDeepMutateAsync(input);
            callOrder.push("deep");
            return { jobId: "gen-job", deduped: false };
          },
          isPending: false,
        }),
      },
      extendStoryDraftHorizon: {
        useMutation: (_opts: unknown) => ({
          mutate: mockExtendMutate,
          mutateAsync: async (input: unknown) => {
            mockExtendMutate(input);
            return { jobId: "extend-job", deduped: false };
          },
          isPending: false,
        }),
      },
      getActiveStoryJob: {
        // No active job to resume in this file's tests — resume behavior has
        // its own dedicated coverage in `VerticalDramaDeepStoryDraftsPanel.actions.test.tsx`.
        useQuery: () => ({ data: null }),
      },
      updateEpisodeDraftDialogue: {
        useMutation: (_opts: unknown) => ({
          mutate: mockUpdateEpisodeDraftDialogueMutate,
          isPending: false,
        }),
      },
      // "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) —
      // `VerticalDramaImproveScriptCard` is mounted unconditionally at the
      // end of `VerticalDramaDeepStoryDraftsActions` (self-contained,
      // queries its own `get` and owns three new mutations — see that
      // component's own module header in
      // `VerticalDramaImproveScriptCard.tsx`). These harmless stubs exist
      // purely so this file's own (pre-existing) assertions keep passing;
      // the card's own behavior is covered by
      // `VerticalDramaDeepStoryDraftsPanel.improveScript.test.tsx`.
      get: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
      startImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({ jobId: "improve-script-job", deduped: false }),
          isPending: false,
        }),
      },
      confirmImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({ updatedEpisodeNumbers: [] }),
          isPending: false,
        }),
      },
      discardImproveScript: {
        useMutation: (_opts: unknown) => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
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
import {
  StoryBibleOverviewCard,
  buildVerticalDramaStoryCopyText,
} from "@/pages/VerticalDramaSeriesDetailPage";

const mockClipboardWriteText = vi.fn();

function nineShots() {
  return Array.from({ length: 9 }, (_, i) => ({
    shot_number: i + 1,
    summary: `Shot ${i + 1} summary`,
    dialogue_lines: [{ speaker: "นางเอก", line: `Line ${i + 1}` }],
  }));
}

const bibleWithStoryOnly = {
  expandedSeasonArc: "Season arc text",
  episodeBreakdown: [
    { episodeNumber: 1, workingTitle: "EP1 title", logline: "EP1 logline", keyBeats: ["beat 1"] },
    { episodeNumber: 2, workingTitle: "EP2 title", logline: "EP2 logline", keyBeats: ["beat 2"] },
  ],
};

const bibleWithDeepDraft = {
  ...bibleWithStoryOnly,
  activeBreakdownVersionId: "v1",
  breakdownVersions: [
    {
      versionId: "v1",
      createdAt: "2026-07-08T00:00:00.000Z",
      createdByUserId: 1,
      source: "generate_story",
      items: [
        {
          episodeNumber: 1,
          workingTitle: "EP1 title",
          logline: "EP1 logline",
          keyBeats: ["beat 1"],
          shotDrafts: nineShots(),
          cliffhanger_line: "จุดค้างตอน 1",
          draftCompleteness: {
            dialogueEveryShot: true,
            allSpeakable: true,
            estimatedSpeechSeconds: 40,
            coverageStatus: "ok",
          },
        },
        { episodeNumber: 2, workingTitle: "EP2 title", logline: "EP2 logline", keyBeats: ["beat 2"] },
      ],
    },
  ],
};

/** No story bible generated yet — `hasStory` is false. */
const bibleEmpty = {};

const baseProps = {
  lang: "th" as const,
  seriesId: "10",
  genre: "โรแมนติก",
  tone: "อบอุ่น",
  targetEpisodeCount: 10,
  readOnly: false,
};

describe("StoryBibleOverviewCard — deep story drafts (W10-C, F131T)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mockClipboardWriteText },
    });
    generateStoryBibleShouldFail = false;
    generateStoryBibleDeepShouldFail = false;
    generateStoryBibleResult = { creditsUsed: 8 };
    generateStoryBibleDeepResult = { partial: false, horizonEndEpisode: 5, chunkSizes: [5] };
    callOrder = [];
  });

  it("builds copy text with per-episode summaries and every drafted shot dialogue, capped by episode range", () => {
    const result = buildVerticalDramaStoryCopyText({
      lang: "th",
      title: "หนูน้อยช่างสงสัย",
      genre: "แม่ลูกเรียนรู้ด้วยกัน",
      tone: "อบอุ่น",
      seasonArc: "Season arc text",
      episodes: [
        bibleWithStoryOnly.episodeBreakdown[0],
        {
          ...bibleWithStoryOnly.episodeBreakdown[1],
          logline: "EP2 logline ".repeat(200),
        },
      ],
      activeItems: bibleWithDeepDraft.breakdownVersions[0].items,
      fromEpisode: 1,
      toEpisode: 2,
      maxChars: 1_200,
    });

    expect(result.copiedEpisodeNumbers).toEqual([1]);
    expect(result.omittedEpisodeNumbers).toEqual([2]);
    expect(result.text).toContain("ซีรีส์: หนูน้อยช่างสงสัย");
    expect(result.text).toContain("ตอนที่ 1: EP1 title");
    expect(result.text).toContain("เรื่องย่อ: EP1 logline");
    expect(result.text).toContain("ช็อต 1: Shot 1 summary");
    expect(result.text).toContain("นางเอก: Line 1");
    expect(result.text).toContain("ช็อต 9: Shot 9 summary");
    expect(result.text).toContain("นางเอก: Line 9");
    expect(result.text).toContain("จุดค้าง: จุดค้างตอน 1");
  });

  it("copies the selected full-story range to the clipboard from the overview card", async () => {
    render(
      <StoryBibleOverviewCard
        {...baseProps}
        seriesTitle="หนูน้อยช่างสงสัย"
        bible={bibleWithDeepDraft}
        deepDraftsFlagEnabled={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /คัดลอกเนื้อเรื่อง/ }));
    expect(screen.getByRole("dialog", { name: /คัดลอกเนื้อเรื่องพร้อมบทพูด/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /คัดลอกช่วงที่เลือก/ }));

    await waitFor(() => expect(mockClipboardWriteText).toHaveBeenCalledTimes(1));
    const copied = mockClipboardWriteText.mock.calls[0][0] as string;
    expect(copied).toContain("ซีรีส์: หนูน้อยช่างสงสัย");
    expect(copied).toContain("ตอนที่ 1: EP1 title");
    expect(copied).toContain("เรื่องย่อ: EP1 logline");
    expect(copied).toContain("ช็อต 1: Shot 1 summary");
    expect(copied).toContain("นางเอก: Line 1");
    expect(copied).toContain("ช็อต 9: Shot 9 summary");
    expect(copied).toContain("นางเอก: Line 9");
    expect(copied).toContain("ตอนที่ 2: EP2 title");
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("คัดลอกเนื้อเรื่องตอน"));
  });

  it("renders BYTE-IDENTICAL markup whether deepDraftsFlagEnabled is omitted or explicitly false", () => {
    const { container: withDefault } = render(
      <StoryBibleOverviewCard {...baseProps} bible={bibleWithDeepDraft} />,
    );
    const defaultHtml = withDefault.innerHTML;

    const { container: withExplicitFalse } = render(
      <StoryBibleOverviewCard
        {...baseProps}
        bible={bibleWithDeepDraft}
        deepDraftsFlagEnabled={false}
        deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
      />,
    );
    const explicitFalseHtml = withExplicitFalse.innerHTML;

    expect(explicitFalseHtml).toBe(defaultHtml);
  });

  it("flag off — shows no deep-draft testids/copy at all, existing Regenerate action is untouched", () => {
    render(
      <StoryBibleOverviewCard
        {...baseProps}
        bible={bibleWithDeepDraft}
        deepDraftsFlagEnabled={false}
        deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
      />,
    );

    expect(screen.queryByTestId("vd-deep-story-drafts-actions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-deep-story-draft-episode-1")).not.toBeInTheDocument();
    expect(screen.queryByText(/สร้างเนื้อเรื่องละเอียดทุกตอน/)).not.toBeInTheDocument();
    expect(screen.queryByText("ดูร่าง 9 ช็อต + บทพูด")).not.toBeInTheDocument();
    // Pre-existing behavior is preserved.
    expect(screen.getByRole("button", { name: /สร้างใหม่อีกครั้ง/ })).toBeInTheDocument();
    expect(screen.getByText("EP1 title", { exact: false })).toBeInTheDocument();
  });

  it("flag on — episode 1 (which has shotDrafts) shows badges + shot viewer; episode 2 (no shotDrafts) shows neither", () => {
    render(
      <StoryBibleOverviewCard
        {...baseProps}
        bible={bibleWithDeepDraft}
        deepDraftsFlagEnabled={true}
        deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
      />,
    );

    expect(screen.getByTestId("vd-deep-story-draft-episode-1")).toBeInTheDocument();
    expect(screen.getByText("✓ บทพูดครบทุกช็อต")).toBeInTheDocument();
    expect(screen.getByText("✓ อ่านออกเสียงได้")).toBeInTheDocument();
    expect(screen.getByText("จุดค้าง: จุดค้างตอน 1")).toBeInTheDocument();
    expect(screen.queryByTestId("vd-deep-story-draft-episode-2")).not.toBeInTheDocument();
  });

  /**
   * Manual dialogue edits (W10.5) — `createdEpisodeNumbers` prop threading:
   * this page's own `episodes` list (VerticalDramaSeriesDetailPage.tsx) ->
   * `StoryBibleOverviewCard`'s `createdEpisodeNumbers` -> per-episode
   * `episodeAlreadyCreated` boolean on `VerticalDramaDeepStoryDraftEpisodeDetail`.
   * The hint itself only ever renders INSIDE the inline editor (while editing
   * one of that episode's shots) — see
   * `VerticalDramaDeepStoryDraftsPanel.episodeDetail.test.tsx` for the full
   * editor behavior; this file only proves the prop reaches the right place.
   */
  describe("createdEpisodeNumbers prop threading (W10.5)", () => {
    it("shows the 'already created' hint while editing a shot whose episode IS in createdEpisodeNumbers", () => {
      render(
        <StoryBibleOverviewCard
          {...baseProps}
          bible={bibleWithDeepDraft}
          deepDraftsFlagEnabled={true}
          deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
          createdEpisodeNumbers={[1]}
        />,
      );
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-cta-1-1"));
      expect(screen.getByTestId("vd-deep-story-draft-edit-already-created-1-1")).toHaveTextContent(
        "ตอนนี้ถูกสร้างแล้ว",
      );
    });

    it("omits the hint while editing a shot whose episode is NOT in createdEpisodeNumbers", () => {
      render(
        <StoryBibleOverviewCard
          {...baseProps}
          bible={bibleWithDeepDraft}
          deepDraftsFlagEnabled={true}
          deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
          createdEpisodeNumbers={[]}
        />,
      );
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-cta-1-1"));
      expect(screen.queryByTestId("vd-deep-story-draft-edit-already-created-1-1")).not.toBeInTheDocument();
    });

    it("defaults to omitted (no hint) when createdEpisodeNumbers is not passed at all", () => {
      render(
        <StoryBibleOverviewCard
          {...baseProps}
          bible={bibleWithDeepDraft}
          deepDraftsFlagEnabled={true}
          deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
        />,
      );
      fireEvent.click(screen.getByTestId("vd-deep-story-draft-edit-cta-1-1"));
      expect(screen.queryByTestId("vd-deep-story-draft-edit-already-created-1-1")).not.toBeInTheDocument();
    });
  });

  describe("Consolidated primary action (kills the two-competing-buttons confusion)", () => {
    it("flag on, no plan yet — shows the 'generate full + detailed' primary CTA (not the legacy 'Generate story' button)", () => {
      render(<StoryBibleOverviewCard {...baseProps} bible={bibleEmpty} deepDraftsFlagEnabled={true} />);
      expect(
        screen.getByRole("button", { name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/ }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "สร้างเนื้อเรื่องเต็ม" })).not.toBeInTheDocument();
    });

    it("flag off, no plan yet — the legacy 'Generate story' button is unchanged", () => {
      render(<StoryBibleOverviewCard {...baseProps} bible={bibleEmpty} deepDraftsFlagEnabled={false} />);
      expect(screen.getByRole("button", { name: "สร้างเนื้อเรื่องเต็ม" })).toBeInTheDocument();
    });

    it("flag on, no plan yet — confirming chains generateStoryBible -> generateStoryBibleDeep, in order", async () => {
      render(<StoryBibleOverviewCard {...baseProps} bible={bibleEmpty} deepDraftsFlagEnabled={true} />);
      fireEvent.click(screen.getByRole("button", { name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/ }));
      fireEvent.click(screen.getByTestId("vd-deep-story-drafts-confirm-submit"));

      await waitFor(() => expect(mockGenerateStoryBibleDeepMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockGenerateStoryBibleMutateAsync).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["story", "deep"]);

      const deepInput = mockGenerateStoryBibleDeepMutateAsync.mock.calls[0][0] as {
        seriesId: string;
        idempotencyKey: string;
      };
      expect(deepInput.seriesId).toBe("10");
      expect(typeof deepInput.idempotencyKey).toBe("string");
      expect(deepInput.idempotencyKey.length).toBeGreaterThan(0);
    });

    it("flag on, no plan yet — a generateStoryBible failure aborts the chain (deep never called), shows the story error toast", async () => {
      generateStoryBibleShouldFail = true;
      render(<StoryBibleOverviewCard {...baseProps} bible={bibleEmpty} deepDraftsFlagEnabled={true} />);
      fireEvent.click(screen.getByRole("button", { name: /สร้างเนื้อเรื่องเต็ม \+ ร่างละเอียดทุกตอน/ }));
      fireEvent.click(screen.getByTestId("vd-deep-story-drafts-confirm-submit"));

      await waitFor(() => expect(mockGenerateStoryBibleMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockGenerateStoryBibleDeepMutateAsync).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("story boom");
    });

    it("flag on, plan exists — shows the 'update detailed story' primary CTA", () => {
      render(
        <StoryBibleOverviewCard {...baseProps} bible={bibleWithStoryOnly} deepDraftsFlagEnabled={true} />,
      );
      expect(screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })).toBeInTheDocument();
    });

    it("flag on, plan exists — default (keep) scope calls generateStoryBibleDeep only, generateStoryBible is never called", async () => {
      render(
        <StoryBibleOverviewCard {...baseProps} bible={bibleWithStoryOnly} deepDraftsFlagEnabled={true} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ }));
      fireEvent.click(screen.getByTestId("vd-deep-story-drafts-confirm-submit"));

      await waitFor(() => expect(mockGenerateStoryBibleDeepMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockGenerateStoryBibleMutate).not.toHaveBeenCalled();
      expect(mockGenerateStoryBibleMutateAsync).not.toHaveBeenCalled();
    });

    it("flag on, plan exists — selecting 'rewrite everything' chains generateStoryBible -> generateStoryBibleDeep, in order", async () => {
      render(
        <StoryBibleOverviewCard {...baseProps} bible={bibleWithStoryOnly} deepDraftsFlagEnabled={true} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ }));
      fireEvent.click(screen.getByRole("radio", { name: /คิดโครงเรื่องใหม่ทั้งหมด/ }));
      fireEvent.click(screen.getByTestId("vd-deep-story-drafts-confirm-submit"));

      await waitFor(() => expect(mockGenerateStoryBibleDeepMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockGenerateStoryBibleMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockGenerateStoryBibleDeepMutate).not.toHaveBeenCalled();
      expect(mockGenerateStoryBibleMutate).not.toHaveBeenCalled();
      expect(callOrder).toEqual(["story", "deep"]);
    });

    it("flag on — the legacy standalone 'สร้างใหม่อีกครั้ง' (Regenerate) button is absent", () => {
      render(
        <StoryBibleOverviewCard {...baseProps} bible={bibleWithStoryOnly} deepDraftsFlagEnabled={true} />,
      );
      expect(screen.queryByRole("button", { name: /สร้างใหม่อีกครั้ง/ })).not.toBeInTheDocument();
    });

    it("flag off — the legacy standalone 'สร้างใหม่อีกครั้ง' (Regenerate) button is present and unchanged", () => {
      render(
        <StoryBibleOverviewCard {...baseProps} bible={bibleWithStoryOnly} deepDraftsFlagEnabled={false} />,
      );
      expect(screen.getByRole("button", { name: /สร้างใหม่อีกครั้ง/ })).toBeInTheDocument();
      expect(screen.queryByTestId("vd-deep-story-drafts-actions")).not.toBeInTheDocument();
    });

    it("flag on, plan exists with a deepDraftSummary — summary banner + extend CTA render alongside the primary CTA (not instead of it)", () => {
      render(
        <StoryBibleOverviewCard
          {...baseProps}
          bible={bibleWithDeepDraft}
          deepDraftsFlagEnabled={true}
          deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
        />,
      );
      expect(screen.getByTestId("vd-deep-story-drafts-summary")).toBeInTheDocument();
      expect(screen.getByText("ร่างละเอียดแล้ว 1/10 ตอน (ถึงตอนที่ 1)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /อัปเดตเนื้อเรื่องละเอียดทุกตอน/ })).toBeInTheDocument();
    });
  });

  /**
   * Premium multi-round drafts (W11-B) — end-to-end through the real page
   * component (not the isolated Panel sub-component), proving the
   * `draftScorecard`/`deepDraftSummary.premium` wiring reaches the DOM the
   * same way a real `verticalDramaSeries.get` response would deliver it.
   */
  describe("Premium multi-round drafts (W11-B)", () => {
    const bibleWithPremiumScorecard = {
      ...bibleWithStoryOnly,
      activeBreakdownVersionId: "v1",
      breakdownVersions: [
        {
          versionId: "v1",
          createdAt: "2026-07-08T00:00:00.000Z",
          createdByUserId: 1,
          source: "generate_story",
          items: [
            {
              episodeNumber: 1,
              workingTitle: "EP1 title",
              logline: "EP1 logline",
              keyBeats: ["beat 1"],
              shotDrafts: nineShots(),
              draftScorecard: {
                hook_strength: 4,
                reversal_sharpness: 4,
                emotion_variety: 4,
                dialogue_naturalness: 4,
                pacing: 2,
                cliffhanger_strength: 4,
                continuity_with_recap: 4,
                season_cohesion: 4,
                overall: 3.5,
                judgedAtRound: 1,
              },
            },
            { episodeNumber: 2, workingTitle: "EP2 title", logline: "EP2 logline", keyBeats: ["beat 2"] },
          ],
        },
      ],
    };

    it("flag on — episode 1's scorecard badge + below-floor pacing row render through the page's per-episode wiring", () => {
      render(
        <StoryBibleOverviewCard
          {...baseProps}
          bible={bibleWithPremiumScorecard}
          deepDraftsFlagEnabled={true}
          deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
        />,
      );
      expect(screen.getByTestId("vd-deep-story-draft-scorecard-badge-1")).toHaveTextContent("คะแนน 3.5/5");
      expect(screen.getByTestId("vd-deep-story-draft-scorecard-dim-1-pacing")).toHaveTextContent(
        "จุดที่ยังต่ำ: จังหวะเรื่อง 2/5",
      );
    });

    it("flag off — the scorecard badge never renders even when draftScorecard is present in the bible", () => {
      render(
        <StoryBibleOverviewCard
          {...baseProps}
          bible={bibleWithPremiumScorecard}
          deepDraftsFlagEnabled={false}
          deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
        />,
      );
      expect(screen.queryByTestId("vd-deep-story-draft-scorecard-badge-1")).not.toBeInTheDocument();
    });

    it("flag on — the summary banner appends '· โหมดพรีเมียม' when deepDraftSummary.premium is true", () => {
      render(
        <StoryBibleOverviewCard
          {...baseProps}
          bible={bibleWithDeepDraft}
          deepDraftsFlagEnabled={true}
          deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10, premium: true }}
        />,
      );
      expect(screen.getByText("ร่างละเอียดแล้ว 1/10 ตอน (ถึงตอนที่ 1) · โหมดพรีเมียม")).toBeInTheDocument();
    });

    it("flag on — the summary banner omits the premium marker when deepDraftSummary.premium is absent (byte-identical)", () => {
      render(
        <StoryBibleOverviewCard
          {...baseProps}
          bible={bibleWithDeepDraft}
          deepDraftsFlagEnabled={true}
          deepDraftSummary={{ horizonEndEpisode: 1, episodesWithDrafts: 1, totalEpisodes: 10 }}
        />,
      );
      // Scoped to the summary paragraph itself — the page also renders an
      // unrelated "ใช้โหมดพรีเมียม..." extend checkbox label in this same
      // scenario (canExtend is true), which a page-wide text search would
      // false-match on the shared "โหมดพรีเมียม" substring.
      expect(screen.getByTestId("vd-deep-story-drafts-summary")).toHaveTextContent(
        "ร่างละเอียดแล้ว 1/10 ตอน (ถึงตอนที่ 1)",
      );
      expect(screen.getByTestId("vd-deep-story-drafts-summary")).not.toHaveTextContent("โหมดพรีเมียม");
    });
  });
});

/**
 * Task #22 (season-level product tie-in draft awareness, added 2026-07-09) —
 * `StoryBibleOverviewCard`'s per-episode tie-in badge, EXTENDED with
 * draft-awareness: planned+marked (or planned+not-yet-drafted) reads
 * "normal" (task #31's original badge text, unchanged); planned-but-
 * draft-unmarked reads "warning" (a distinct label + `destructive` Badge
 * variant). Independent of `deepDraftsFlagEnabled` — see that prop's own
 * doc comment on `tieInStateByEpisode`.
 */
describe("StoryBibleOverviewCard — tie-in draft-awareness badge (task #22)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function bibleWithTieIn(items: unknown[]) {
    return {
      expandedSeasonArc: "Season arc text",
      episodeBreakdown: items,
      activeBreakdownVersionId: "v1",
      breakdownVersions: [
        {
          versionId: "v1",
          createdAt: "2026-07-08T00:00:00.000Z",
          createdByUserId: 1,
          source: "generate_story",
          items,
        },
      ],
    };
  }

  it("planned + NOT YET drafted (no shotDrafts) — normal badge, no warning", () => {
    const bible = bibleWithTieIn([
      {
        episodeNumber: 1,
        workingTitle: "EP1 title",
        logline: "EP1 logline",
        keyBeats: ["beat 1"],
        tieIn: { planned: true, source: "planned" },
      },
    ]);
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    const badge = screen.getByTestId("vd-overview-tie-in-badge-1");
    expect(badge).toHaveTextContent("มีสินค้าตามแผน");
    expect(badge).not.toHaveTextContent("ยังไม่ระบุ");
  });

  it("planned + drafted + a shot marked has_product_moment:true — normal badge", () => {
    const shots = nineShots();
    (shots[3] as Record<string, unknown>).tie_in = { has_product_moment: true, benefit_line: "ดีต่อผิว" };
    const bible = bibleWithTieIn([
      {
        episodeNumber: 1,
        workingTitle: "EP1 title",
        logline: "EP1 logline",
        keyBeats: ["beat 1"],
        tieIn: { planned: true, source: "planned" },
        shotDrafts: shots,
      },
    ]);
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    const badge = screen.getByTestId("vd-overview-tie-in-badge-1");
    expect(badge).toHaveTextContent("มีสินค้าตามแผน");
    expect(badge).not.toHaveTextContent("ยังไม่ระบุ");
  });

  it("planned + drafted + NO shot marked — warning badge (draft/plan mismatch)", () => {
    const bible = bibleWithTieIn([
      {
        episodeNumber: 1,
        workingTitle: "EP1 title",
        logline: "EP1 logline",
        keyBeats: ["beat 1"],
        tieIn: { planned: true, source: "planned" },
        shotDrafts: nineShots(),
      },
    ]);
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    const badge = screen.getByTestId("vd-overview-tie-in-badge-1");
    expect(badge).toHaveTextContent("ยังไม่ระบุ");
  });

  it("not planned — no badge at all", () => {
    const bible = bibleWithTieIn([
      {
        episodeNumber: 1,
        workingTitle: "EP1 title",
        logline: "EP1 logline",
        keyBeats: ["beat 1"],
        tieIn: { planned: false, source: "planned" },
        shotDrafts: nineShots(),
      },
    ]);
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    expect(screen.queryByTestId("vd-overview-tie-in-badge-1")).not.toBeInTheDocument();
  });

  it("no tieIn field at all (legacy/grandfather series) — no badge, no crash", () => {
    render(<StoryBibleOverviewCard {...baseProps} bible={bibleWithStoryOnly} />);
    expect(screen.queryByTestId(/vd-overview-tie-in-badge-/)).not.toBeInTheDocument();
  });
});
