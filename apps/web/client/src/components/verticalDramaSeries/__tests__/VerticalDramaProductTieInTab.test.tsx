import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListCapturesQuery = vi.fn();
const mockGetStorytellingHandoffQuery = vi.fn();
const mockUpdateSeriesMutate = vi.fn();
const mockMediaModelsQuery = vi.fn();
const mockUseTenantFeatureFlag = vi.fn();

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: (flag: string) => mockUseTenantFeatureFlag(flag),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: {
        get: { invalidate: vi.fn() },
        getAdBannerImageStatus: { fetch: vi.fn() },
      },
    }),
    verticalDramaSeries: {
      updateSeries: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            mockUpdateSeriesMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      generateAdBannerPrompt: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      generateAdBannerImage: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    marketplaceCapture: {
      listCaptures: { useQuery: () => mockListCapturesQuery() },
      getStorytellingHandoff: {
        useQuery: () => mockGetStorytellingHandoffQuery(),
      },
    },
    mediaModels: {
      list: { useQuery: () => mockMediaModelsQuery() },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { VerticalDramaProductTieInTab } from "@/components/verticalDramaSeries/VerticalDramaProductTieInTab";

beforeEach(() => {
  vi.clearAllMocks();
  mockListCapturesQuery.mockReturnValue({ data: [], isLoading: false });
  mockGetStorytellingHandoffQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
  });
  mockMediaModelsQuery.mockReturnValue({
    data: { models: [] },
    isLoading: false,
  });
});

describe("VerticalDramaProductTieInTab — Ad Banner Overlay (F131W) gating", () => {
  it("does not render the ad banner studio when the tenant flag is off", () => {
    mockUseTenantFeatureFlag.mockReturnValue(false);
    render(
      <VerticalDramaProductTieInTab
        lang="th"
        seriesId="10"
        productTieIn={{ enabled: true, productName: "Glow Serum" }}
        readOnly={false}
      />
    );
    expect(mockUseTenantFeatureFlag).toHaveBeenCalledWith(
      "verticalDramaSeriesAdBannerOverlay"
    );
    expect(screen.queryByTestId("vd-ad-banner-studio")).not.toBeInTheDocument();
  });

  it("renders the ad banner studio (empty state) when the tenant flag is on", () => {
    mockUseTenantFeatureFlag.mockReturnValue(true);
    render(
      <VerticalDramaProductTieInTab
        lang="th"
        seriesId="10"
        productTieIn={{ enabled: true, productName: "Glow Serum" }}
        readOnly={false}
      />
    );
    expect(screen.getByTestId("vd-ad-banner-studio")).toBeInTheDocument();
    expect(screen.getByTestId("vd-ad-banner-empty-state")).toBeInTheDocument();
  });

  it("still renders the studio read-only (no Add button) when the series tab itself is read-only", () => {
    mockUseTenantFeatureFlag.mockReturnValue(true);
    render(
      <VerticalDramaProductTieInTab
        lang="th"
        seriesId="10"
        productTieIn={{ enabled: true, productName: "Glow Serum" }}
        readOnly
      />
    );
    expect(screen.getByTestId("vd-ad-banner-studio")).toBeInTheDocument();
    expect(screen.queryByTestId("vd-ad-banner-add")).not.toBeInTheDocument();
  });
});
