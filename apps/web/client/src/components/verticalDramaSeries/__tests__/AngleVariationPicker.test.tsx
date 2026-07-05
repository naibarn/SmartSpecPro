import { render, screen, waitFor, act } from "@testing-library/react";
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
});
