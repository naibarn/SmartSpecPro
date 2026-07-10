/**
 * Text Overlay Suite (F131AB, task #34, plan.md v2) — season batch render
 * dialog additions for `VerticalDramaSeriesDetailPage.tsx`'s `EpisodesTab`:
 * the "ใส่ข้อความตามแผนของแต่ละตอน"/"ใส่ลายน้ำซีรีส์" toggles, their default-
 * checked state, flag gating, and the `assembleSeasonVideos` payload shape.
 * Mirrors `VerticalDramaSeriesDetailPage.finalRenderSuite.test.tsx`'s
 * `@/lib/trpc` mock structure (imports the named `EpisodesTab` export
 * directly) — extended with a `deleteEpisode` mutation stub that file's own
 * mock is missing (a PRE-EXISTING gap unrelated to this feature; this file
 * provides its own complete mock rather than depending on that one).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssembleSeasonVideosMutate = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: { get: { invalidate: vi.fn() } },
    }),
    verticalDramaEpisodes: {
      generateNextEpisodes: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deleteEpisode: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    verticalDramaSeries: {
      assembleSeasonVideos: {
        useMutation: (opts: {
          onSuccess?: (data: { submitted: unknown[]; skipped: unknown[] }) => void;
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            mockAssembleSeasonVideosMutate(input);
            opts?.onSuccess?.({ submitted: [], skipped: [] });
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

import { EpisodesTab } from "@/pages/VerticalDramaSeriesDetailPage";

const episodes = [
  { id: "e1", episodeNumber: 1, title: "EP1", status: "in_progress" },
];

function openDialog() {
  render(<EpisodesTab lang="th" seriesId="10" episodes={episodes} readOnly={false} />);
  fireEvent.click(screen.getByTestId("vd-season-render-button"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTenantFeatureFlag.mockReturnValue(false);
});

describe("EpisodesTab — Text Overlay Suite batch toggles (F131AB, task #34)", () => {
  it("hides both toggles when verticalDramaSeriesTextOverlaySuite is off", () => {
    openDialog();
    expect(
      screen.queryByTestId("vd-season-render-apply-text-overlays"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-season-render-apply-watermark"),
    ).not.toBeInTheDocument();
  });

  it("shows both toggles, checked by default, when the flag is on", () => {
    mockUseTenantFeatureFlag.mockImplementation(
      (flag: string) => flag === "verticalDramaSeriesTextOverlaySuite",
    );
    openDialog();
    expect(
      screen.getByTestId("vd-season-render-apply-text-overlays"),
    ).toHaveAttribute("data-state", "checked");
    expect(
      screen.getByTestId("vd-season-render-apply-watermark"),
    ).toHaveAttribute("data-state", "checked");
  });

  it("sends applyTextOverlays: true / applyWatermark: true by default when confirmed", () => {
    mockUseTenantFeatureFlag.mockImplementation(
      (flag: string) => flag === "verticalDramaSeriesTextOverlaySuite",
    );
    openDialog();
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));
    expect(mockAssembleSeasonVideosMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          applyTextOverlays: true,
          applyWatermark: true,
        }),
      }),
    );
  });

  it("unchecking a toggle sends false for that option only", () => {
    mockUseTenantFeatureFlag.mockImplementation(
      (flag: string) => flag === "verticalDramaSeriesTextOverlaySuite",
    );
    openDialog();
    fireEvent.click(screen.getByTestId("vd-season-render-apply-watermark"));
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));
    expect(mockAssembleSeasonVideosMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          applyTextOverlays: true,
          applyWatermark: false,
        }),
      }),
    );
  });

  it("still sends applyTextOverlays/applyWatermark: true (harmless default) even when the flag is off, since the server independently re-gates on its own tenant flag", () => {
    openDialog();
    fireEvent.click(screen.getByTestId("vd-season-render-confirm"));
    expect(mockAssembleSeasonVideosMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          applyTextOverlays: true,
          applyWatermark: true,
        }),
      }),
    );
  });
});
