import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/imageGridSplitter", () => ({
  splitImage: vi.fn(),
}));

import { splitImage } from "@/lib/imageGridSplitter";
import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: {
      frames: [{ shotNumber: 1, imagePrompt: "a prompt" }],
    },
    loading: false,
    angleVariationGridUrlByShot: {},
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — angle-variation (3x3) picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the 9-tile picker once angleVariationGridUrlByShot[shot] is set", async () => {
    (splitImage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => ({
        dataUrl: `data:image/jpeg;base64,tile${i}`,
        index: i,
        row: Math.floor(i / 3),
        col: i % 3,
        blob: new Blob(),
        width: 100,
        height: 100,
        sourceWidth: 100,
        sourceHeight: 100,
      }))
    );

    const { rerender } = render(
      <VerticalDramaStoryboardPanel {...(baseProps() as any)} />
    );

    // Simulate the live-completion prop update (mirrors
    // `setAngleVariationGridUrlByShot` firing after `pollAngleVariationsTask`
    // reaches "completed").
    await act(async () => {
      rerender(
        <VerticalDramaStoryboardPanel
          {...(baseProps({
            angleVariationGridUrlByShot: { 1: "https://tempfile.aiquickdraw.com/x.jpg" },
          }) as any)}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("vd-angle-candidates-dismiss-1")).toBeInTheDocument();
    });
  });

  it("still shows the picker when the persist round-trip updates startFramePlan.frames mid-split (angleGrid arrives)", async () => {
    // Deferred split promise so we can control exactly when it resolves
    // relative to the startFramePlan prop update (mirrors the real
    // `updateEpisodeDraftMutation` -> invalidate -> refetch round trip that
    // fires right after the live grid URL is set).
    const resolvers: Array<(v: unknown) => void> = [];
    (splitImage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise(resolve => {
          resolvers.push(resolve);
        })
    );
    const resolveSplit = (v: unknown) => resolvers[0]?.(v);

    const { rerender } = render(
      <VerticalDramaStoryboardPanel {...(baseProps() as any)} />
    );

    // 1) Live completion: grid URL prop arrives — kicks off splitImage (live effect).
    await act(async () => {
      rerender(
        <VerticalDramaStoryboardPanel
          {...(baseProps({
            angleVariationGridUrlByShot: { 1: "https://tempfile.aiquickdraw.com/x.jpg" },
          }) as any)}
        />
      );
    });

    // 2) Server round-trip lands: startFramePlan now carries the persisted
    // angleGrid for shot 1 (same URL) BEFORE the live splitImage() call has
    // resolved — this is the exact race the persist effect introduces.
    await act(async () => {
      rerender(
        <VerticalDramaStoryboardPanel
          {...(baseProps({
            startFramePlan: {
              frames: [
                {
                  shotNumber: 1,
                  imagePrompt: "a prompt",
                  angleGrid: {
                    imageUrl: "https://tempfile.aiquickdraw.com/x.jpg",
                    dismissedIndexes: [],
                  },
                },
              ],
            },
            angleVariationGridUrlByShot: { 1: "https://tempfile.aiquickdraw.com/x.jpg" },
          }) as any)}
        />
      );
    });

    // 3) Now let the (only) in-flight splitImage call resolve.
    await act(async () => {
      resolveSplit(
        Array.from({ length: 9 }, (_, i) => ({
          dataUrl: `data:image/jpeg;base64,tile${i}`,
          index: i,
          row: Math.floor(i / 3),
          col: i % 3,
          blob: new Blob(),
          width: 100,
          height: 100,
          sourceWidth: 100,
          sourceHeight: 100,
        }))
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("vd-angle-candidates-dismiss-1")).toBeInTheDocument();
    });

    // Exactly one splitImage call should have been made for this shot — a
    // second concurrent call (from either effect re-firing on a stale
    // `splittingShot`/`angleCandidatesByShot` closure) would race with this
    // one; whichever resolves last silently overwrites the picker's tiles,
    // and if the redundant call fails, flips the picker to "split failed"
    // even though the first call already produced valid candidates.
    expect((splitImage as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  /** 2026-07-07 regression coverage: "ใช้เป็นภาพเริ่มต้น" used to clear the
   *  picker synchronously the instant it was clicked, before the (unawaited)
   *  async `onPickAngleVariationCandidate` swap even resolved — so a failed
   *  swap left the user with no picker AND no updated start frame. The fixed
   *  sequence must await the swap and only clear the picker on success,
   *  keeping it open (with the selection intact) on failure. */
  describe('"ใช้เป็นภาพเริ่มต้น" pick ordering', () => {
    async function renderWithNineTiles() {
      (splitImage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        Array.from({ length: 9 }, (_, i) => ({
          dataUrl: `data:image/jpeg;base64,tile${i}`,
          index: i,
          row: Math.floor(i / 3),
          col: i % 3,
          blob: new Blob(),
          width: 100,
          height: 100,
          sourceWidth: 100,
          sourceHeight: 100,
        }))
      );
      const onPickAngleVariationCandidate = vi.fn();
      const { rerender } = render(
        <VerticalDramaStoryboardPanel
          {...(baseProps({ onPickAngleVariationCandidate }) as any)}
        />
      );
      await act(async () => {
        rerender(
          <VerticalDramaStoryboardPanel
            {...(baseProps({
              onPickAngleVariationCandidate,
              angleVariationGridUrlByShot: { 1: "https://tempfile.aiquickdraw.com/x.jpg" },
            }) as any)}
          />
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId("vd-angle-candidates-dismiss-1")).toBeInTheDocument();
      });
      // Select tile 0 so "ใช้เป็นภาพเริ่มต้น" becomes enabled.
      fireEvent.click(screen.getByTestId("vd-angle-candidate-select-1-0"));
      return { onPickAngleVariationCandidate };
    }

    it("keeps the picker open when the async swap rejects", async () => {
      const { onPickAngleVariationCandidate } = await renderWithNineTiles();
      let rejectSwap: (err: Error) => void = () => {};
      onPickAngleVariationCandidate.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectSwap = reject;
          })
      );

      fireEvent.click(screen.getByTestId("vd-angle-candidate-use-as-start-frame-1"));
      expect(onPickAngleVariationCandidate).toHaveBeenCalledWith(1, "data:image/jpeg;base64,tile0");

      await act(async () => {
        rejectSwap(new Error("upload failed"));
        // Let the button's .catch()/.finally() microtasks flush.
        await Promise.resolve();
      });

      // Picker must still be present — the failed swap must NOT have
      // cleared it optimistically.
      expect(screen.getByTestId("vd-angle-candidates-dismiss-1")).toBeInTheDocument();
      expect(screen.getByTestId("vd-angle-candidate-use-as-start-frame-1")).toBeInTheDocument();
    });

    it("clears the picker only after the async swap resolves", async () => {
      const { onPickAngleVariationCandidate } = await renderWithNineTiles();
      let resolveSwap: () => void = () => {};
      onPickAngleVariationCandidate.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveSwap = resolve;
          })
      );

      fireEvent.click(screen.getByTestId("vd-angle-candidate-use-as-start-frame-1"));

      // Still open immediately after the click — clearing must wait for the
      // swap to resolve, not happen synchronously in the click handler.
      expect(screen.getByTestId("vd-angle-candidates-dismiss-1")).toBeInTheDocument();

      await act(async () => {
        resolveSwap();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.queryByTestId("vd-angle-candidates-dismiss-1")).not.toBeInTheDocument();
      });
    });
  });

  /** Phase 5d (`planning/vd-start-frame-reference-mapping/plan.md`, client
   *  half) — persisted "backup alternate-angle stills" per shot, reopenable
   *  from a compact thumbnail row independent of the live picker state. */
  describe("stored angle-grid re-open (Phase 5d)", () => {
    it("does not render the stored-grids row when angleGridAssetsByShotNumber has no entries for the shot", () => {
      render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);
      expect(
        screen.queryByTestId("vd-stored-angle-grids-1")
      ).not.toBeInTheDocument();
    });

    it("renders one thumbnail per stored grid, most-recent first", () => {
      render(
        <VerticalDramaStoryboardPanel
          {...(baseProps({
            angleGridAssetsByShotNumber: {
              1: [
                { mediaAssetId: 101, url: "https://cdn/grid-101.jpg" },
                { mediaAssetId: 102, url: "https://cdn/grid-102.jpg" },
              ],
            },
          }) as any)}
        />
      );
      const row = screen.getByTestId("vd-stored-angle-grids-1");
      expect(row).toBeInTheDocument();
      expect(
        screen.getByTestId("vd-stored-angle-grid-1-102")
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("vd-stored-angle-grid-1-101")
      ).toBeInTheDocument();
      // Most-recent (last in the persisted array, id 102) renders first.
      const buttons = row.querySelectorAll("button");
      expect(buttons[0].getAttribute("data-testid")).toBe(
        "vd-stored-angle-grid-1-102"
      );
      expect(buttons[1].getAttribute("data-testid")).toBe(
        "vd-stored-angle-grid-1-101"
      );
    });

    it("selecting a stored grid thumbnail calls onOpenStoredAngleGrid with the shot number and url", () => {
      const onOpenStoredAngleGrid = vi.fn();
      render(
        <VerticalDramaStoryboardPanel
          {...(baseProps({
            angleGridAssetsByShotNumber: {
              1: [{ mediaAssetId: 101, url: "https://cdn/grid-101.jpg" }],
            },
            onOpenStoredAngleGrid,
          }) as any)}
        />
      );
      fireEvent.click(screen.getByTestId("vd-stored-angle-grid-1-101"));
      expect(onOpenStoredAngleGrid).toHaveBeenCalledWith(
        1,
        "https://cdn/grid-101.jpg"
      );
    });
  });
});
