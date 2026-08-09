/**
 * Task #21 / W12.5 "Final Render Suite" phase B (season batch render,
 * added 2026-07-09) coverage for `VerticalDramaSeriesDetailPage.tsx`'s
 * `EpisodesTab`: the "เรนเดอร์ทั้งซีซั่น" button, its options dialog
 * (voice-chain-flag-gated audio checkbox, always-visible subtitle preset
 * picker), the `assembleSeasonVideos` mutation payload, and the submitted/
 * skipped inline summary. Mirrors
 * `VerticalDramaSeriesDetailPage.deepStoryDrafts.test.tsx`'s `@/lib/trpc`
 * mock structure (imports the named `EpisodesTab` export directly rather
 * than mounting the full default-exported page), extended with
 * `verticalDramaSeries.assembleSeasonVideos` per that file's own convention.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateNextEpisodesMutate = vi.fn();
const mockAssembleSeasonVideosMutate = vi.fn();

let assembleSeasonVideosResult: {
  submitted: Array<{ episodeId: string; jobId: string }>;
  skipped: Array<{ episodeId: string; reason: string }>;
} = { submitted: [], skipped: [] };
let assembleSeasonVideosShouldFail = false;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: { get: { invalidate: vi.fn() } },
      verticalDramaEpisodes: {
        getEpisodeCoverStatus: { fetch: vi.fn() },
      },
    }),
    verticalDramaEpisodes: {
      generateNextEpisodes: {
        useMutation: (_opts: unknown) => ({
          mutate: mockGenerateNextEpisodesMutate,
          isPending: false,
        }),
      },
      generateEpisodeCover: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          variables: undefined,
        }),
      },
      setEpisodeCoverAsset: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deleteEpisode: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    mediaModels: {
      list: {
        useQuery: () => ({
          data: { models: [] },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
    },
    verticalDramaSeries: {
      assembleSeasonVideos: {
        useMutation: (opts: {
          onSuccess?: (data: typeof assembleSeasonVideosResult) => void;
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            mockAssembleSeasonVideosMutate(input);
            if (assembleSeasonVideosShouldFail) {
              opts?.onError?.({ message: "season render boom" });
            } else {
              opts?.onSuccess?.(assembleSeasonVideosResult);
            }
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockUseTenantFeatureFlag = vi.fn(() => false);
vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: (flag: string) => mockUseTenantFeatureFlag(flag),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      data-testid="mock-select"
      value={value}
      onChange={e => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
}));

import { toast } from "sonner";
import { EpisodesTab } from "@/pages/VerticalDramaSeriesDetailPage";

const episodes = [
  { id: "e1", episodeNumber: 1, title: "EP1", status: "in_progress" },
  { id: "e2", episodeNumber: 2, title: "EP2", status: "in_progress" },
];

describe("EpisodesTab — season batch render (task #21 phase B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTenantFeatureFlag.mockReturnValue(false);
    assembleSeasonVideosResult = { submitted: [], skipped: [] };
    assembleSeasonVideosShouldFail = false;
  });

  it("renders the season render button whenever the series has at least one episode", () => {
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    expect(screen.getByTestId("vd-season-render-button")).toHaveTextContent(
      "เรนเดอร์ทั้งซีซั่น"
    );
  });

  it("renders the button even when the series is read-only/archived (export isn't a content edit)", () => {
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={true}
      />
    );
    expect(screen.getByTestId("vd-season-render-button")).toBeInTheDocument();
  });

  it("keeps the episode cover and compiled video in one responsive media row", () => {
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={[
          {
            ...episodes[0],
            compiledVideo: {
              videoUrl: "https://cdn.example.test/episode-1.mp4",
              status: "completed",
            },
          },
        ]}
        readOnly={false}
      />
    );

    const settingsRow = screen.getByTestId("vd-episode-cover-settings-row");
    expect(settingsRow).toHaveClass("md:grid-cols-2");
    expect(settingsRow.children).toHaveLength(2);

    const mediaRow = screen.getByTestId("vd-episode-media-row-1");
    expect(mediaRow).toHaveClass("md:grid-cols-[minmax(0,1fr)_11rem]");
    const coverSurface = screen.getByTestId("vd-episode-cover-surface-1");
    const coverActions = screen.getByTestId("vd-episode-cover-actions-1");
    expect(coverSurface).toHaveClass("w-full");
    expect(coverActions).toHaveClass("mt-2");
    expect(coverSurface).not.toContainElement(coverActions);
    expect(
      mediaRow.querySelector(
        '[data-testid="vd-episode-card-compiled-video-player"]'
      )
    ).toBeInTheDocument();
  });

  it("clicking the button opens the options dialog with the subtitle preset picker always visible", () => {
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    expect(screen.getAllByTestId("mock-select")[1]).toHaveValue("classic_box");
  });

  it("the dialogue-audio checkbox is absent when the voice-chain flag is off", () => {
    mockUseTenantFeatureFlag.mockReturnValue(false);
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    expect(
      screen.queryByTestId("vd-season-render-include-audio")
    ).not.toBeInTheDocument();
  });

  it("the dialogue-audio checkbox (+ nested loudness sub-checkbox, disabled until checked) renders when the voice-chain flag is on", () => {
    mockUseTenantFeatureFlag.mockReturnValue(true);
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    expect(
      screen.getByTestId("vd-season-render-include-audio")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-season-render-loudness-normalize")
    ).toBeDisabled();
    fireEvent.click(screen.getByTestId("vd-season-render-include-audio"));
    expect(
      screen.getByTestId("vd-season-render-loudness-normalize")
    ).not.toBeDisabled();
  });

  it("confirming submits the assembleSeasonVideos payload with the selected options", () => {
    mockUseTenantFeatureFlag.mockReturnValue(true);
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    fireEvent.click(screen.getByTestId("vd-season-render-include-audio"));
    fireEvent.click(screen.getByTestId("vd-season-render-loudness-normalize"));
    fireEvent.change(screen.getAllByTestId("mock-select")[1], {
      target: { value: "karaoke_word" },
    });
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));

    expect(mockAssembleSeasonVideosMutate).toHaveBeenCalledWith({
      seriesId: "10",
      options: {
        applyTextOverlays: true,
        applyWatermark: true,
        includeDialogueAudio: true,
        loudnessNormalize: true,
        subtitlePreset: "karaoke_word",
      },
    });
  });

  it("never sends includeDialogueAudio: true when the voice-chain flag is off, even if local state were somehow set", () => {
    mockUseTenantFeatureFlag.mockReturnValue(false);
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));
    expect(mockAssembleSeasonVideosMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ includeDialogueAudio: false }),
      })
    );
  });

  it("shows a submitted summary with queued episode numbers after a successful call", async () => {
    assembleSeasonVideosResult = {
      submitted: [
        { episodeId: "e1", jobId: "job-1" },
        { episodeId: "e2", jobId: "job-2" },
      ],
      skipped: [],
    };
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));

    await waitFor(() =>
      expect(
        screen.getByTestId("vd-season-render-submitted-summary")
      ).toHaveTextContent("2")
    );
    expect(
      screen.getByTestId("vd-season-render-submitted-summary")
    ).toHaveTextContent("1, 2");
    expect(toast.success).toHaveBeenCalled();
    // Dialog closes on success.
    expect(
      screen.queryByTestId("vd-season-render-confirm")
    ).not.toBeInTheDocument();
  });

  it("shows a skipped summary with per-episode reasons mapped to short Thai text", async () => {
    assembleSeasonVideosResult = {
      submitted: [{ episodeId: "e1", jobId: "job-1" }],
      skipped: [
        {
          episodeId: "e2",
          reason:
            "No video clips exist for this episode yet — generate the video motion prompt pack and render clips first.",
        },
      ],
    };
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));

    await waitFor(() =>
      expect(
        screen.getByTestId("vd-season-render-skipped-summary")
      ).toBeInTheDocument()
    );
    const skipped = screen.getByTestId("vd-season-render-skipped-summary");
    expect(skipped).toHaveTextContent("1");
    expect(skipped).toHaveTextContent(
      "ยังไม่มีคลิปวิดีโอ — ต้องสร้างชุดพรอมป์วิดีโอและเรนเดอร์คลิปก่อน"
    );
  });

  it("shows an unrecognized skip reason RAW (defensive fallback), not silently dropped", async () => {
    assembleSeasonVideosResult = {
      submitted: [],
      skipped: [
        { episodeId: "e1", reason: "a brand-new precondition message" },
      ],
    };
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));

    await waitFor(() =>
      expect(
        screen.getByTestId("vd-season-render-skipped-summary")
      ).toHaveTextContent("a brand-new precondition message")
    );
  });

  it("shows an error toast when the mutation fails, and does not crash", async () => {
    assembleSeasonVideosShouldFail = true;
    render(
      <EpisodesTab
        lang="th"
        seriesId="10"
        episodes={episodes}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByTestId("vd-season-render-button"));
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("season render boom")
    );
  });
});
