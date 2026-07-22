import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Manual synopsis edits (added 2026-07-22) — `StoryBibleOverviewCard`'s
 * inline per-sub-episode logline editor, wired to
 * `verticalDramaSeries.updateEpisodeDraftSynopsis`. Mirrors the mocking
 * harness of `VerticalDramaSeriesDetailPage.deepStoryDrafts.test.tsx`,
 * trimmed to only the hooks `StoryBibleOverviewCard` calls unconditionally
 * with `deepDraftsFlagEnabled` left at its default (false) — see that
 * component's own module header for which mutations are flag-gated.
 */
const mockInvalidateSeriesGet = vi.fn();
const mockInvalidateGetEpisodeDetail = vi.fn();
const mockGenerateNextEpisodesMutate = vi.fn();
const mockGenerateStoryBibleMutate = vi.fn();
const mockUpdateEpisodeDraftSynopsisMutate = vi.fn();
let updateSynopsisIsPending = false;
let updateSynopsisOnSuccess:
  | ((data: unknown, variables: { episodeNumber: number }) => void)
  | undefined;
let updateSynopsisOnError: ((err: { message?: string }) => void) | undefined;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: {
        get: { invalidate: mockInvalidateSeriesGet },
      },
      verticalDramaEpisodes: {
        getEpisodeDetail: { invalidate: mockInvalidateGetEpisodeDetail },
      },
    }),
    verticalDramaEpisodes: {
      generateNextEpisodes: {
        useMutation: (_opts: unknown) => ({
          mutate: mockGenerateNextEpisodesMutate,
          isPending: false,
        }),
      },
    },
    verticalDramaSeries: {
      generateStoryBible: {
        useMutation: (_opts: unknown) => ({
          mutate: mockGenerateStoryBibleMutate,
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      updateEpisodeDraftSynopsis: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, variables: { episodeNumber: number }) => void;
          onError?: (err: { message?: string }) => void;
        }) => {
          updateSynopsisOnSuccess = opts?.onSuccess;
          updateSynopsisOnError = opts?.onError;
          return {
            mutate: (input: unknown) => {
              mockUpdateEpisodeDraftSynopsisMutate(input);
            },
            isPending: updateSynopsisIsPending,
          };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { StoryBibleOverviewCard } from "@/pages/VerticalDramaSeriesDetailPage";

const bible = {
  expandedSeasonArc: "Season arc text",
  episodeBreakdown: [
    { episodeNumber: 1, workingTitle: "EP1 title", logline: "EP1 logline", keyBeats: ["beat 1"] },
    { episodeNumber: 2, workingTitle: "EP2 title", logline: "EP2 logline", keyBeats: ["beat 2"] },
  ],
};

const baseProps = {
  lang: "th" as const,
  seriesId: "10",
  genre: "โรแมนติก",
  tone: "อบอุ่น",
  targetEpisodeCount: 10,
  readOnly: false,
};

describe("StoryBibleOverviewCard — manual synopsis edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSynopsisIsPending = false;
    updateSynopsisOnSuccess = undefined;
    updateSynopsisOnError = undefined;
  });

  it("hides the edit CTA when readOnly", () => {
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} readOnly={true} />);
    expect(screen.queryByTestId("vd-edit-synopsis-cta-1")).not.toBeInTheDocument();
  });

  it("shows the edit CTA and opens a textarea prefilled with the current logline", () => {
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    expect(screen.getByTestId("vd-edit-synopsis-cta-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-edit-synopsis-cta-1"));

    const textarea = screen.getByTestId(
      "vd-edit-synopsis-textarea-1"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("EP1 logline");
  });

  it("Save is disabled while the textarea is empty", () => {
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-cta-1"));

    const textarea = screen.getByTestId("vd-edit-synopsis-textarea-1");
    fireEvent.change(textarea, { target: { value: "   " } });

    expect(screen.getByTestId("vd-edit-synopsis-save-1")).toBeDisabled();
    expect(mockUpdateEpisodeDraftSynopsisMutate).not.toHaveBeenCalled();
  });

  it("Save calls the mutation with the typed logline and a fresh idempotencyKey", () => {
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-cta-1"));

    const textarea = screen.getByTestId("vd-edit-synopsis-textarea-1");
    fireEvent.change(textarea, { target: { value: "Updated EP1 logline" } });
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-save-1"));

    expect(mockUpdateEpisodeDraftSynopsisMutate).toHaveBeenCalledTimes(1);
    const input = mockUpdateEpisodeDraftSynopsisMutate.mock.calls[0][0] as {
      seriesId: string;
      episodeNumber: number;
      logline: string;
      idempotencyKey: string;
    };
    expect(input.seriesId).toBe("10");
    expect(input.episodeNumber).toBe(1);
    expect(input.logline).toBe("Updated EP1 logline");
    expect(typeof input.idempotencyKey).toBe("string");
    expect(input.idempotencyKey.length).toBeGreaterThan(0);
  });

  it("on success — toasts, closes the editor, and invalidates both verticalDramaSeries.get and verticalDramaEpisodes.getEpisodeDetail", () => {
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-cta-1"));
    fireEvent.change(screen.getByTestId("vd-edit-synopsis-textarea-1"), {
      target: { value: "Updated EP1 logline" },
    });
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-save-1"));

    act(() => {
      updateSynopsisOnSuccess?.(
        { ok: true, episodeNumber: 1, logline: "Updated EP1 logline" },
        { episodeNumber: 1 }
      );
    });

    expect(mockInvalidateSeriesGet).toHaveBeenCalledWith({ seriesId: "10" });
    expect(mockInvalidateGetEpisodeDetail).toHaveBeenCalledWith();
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("บันทึกเรื่องย่อตอนย่อยที่ 1")
    );
    expect(screen.queryByTestId("vd-edit-synopsis-textarea-1")).not.toBeInTheDocument();
  });

  it("on error — toasts the server error message and keeps the editor open", () => {
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-cta-1"));
    fireEvent.change(screen.getByTestId("vd-edit-synopsis-textarea-1"), {
      target: { value: "Updated EP1 logline" },
    });
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-save-1"));

    act(() => {
      updateSynopsisOnError?.({ message: "server boom" });
    });

    expect(toast.error).toHaveBeenCalledWith("server boom");
    expect(screen.getByTestId("vd-edit-synopsis-textarea-1")).toBeInTheDocument();
  });

  it("cancel closes the editor without calling the mutation", () => {
    render(<StoryBibleOverviewCard {...baseProps} bible={bible} />);
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-cta-1"));
    fireEvent.click(screen.getByTestId("vd-edit-synopsis-cancel-1"));

    expect(screen.queryByTestId("vd-edit-synopsis-textarea-1")).not.toBeInTheDocument();
    expect(mockUpdateEpisodeDraftSynopsisMutate).not.toHaveBeenCalled();
  });
});
