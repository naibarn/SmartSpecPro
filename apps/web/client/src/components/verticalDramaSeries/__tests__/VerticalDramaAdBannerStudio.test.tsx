import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateMutate = vi.fn();
const mockGeneratePromptMutate = vi.fn();
const mockGenerateImageMutate = vi.fn();
const mockGetAdBannerImageStatusFetch = vi.fn();
const mockInvalidateGet = vi.fn();
const mockMediaModelsQuery = vi.fn();

let generateImageOnSuccess: (() => void) | null = null;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: {
        get: { invalidate: mockInvalidateGet },
        getAdBannerImageStatus: { fetch: mockGetAdBannerImageStatusFetch },
      },
    }),
    verticalDramaSeries: {
      updateSeries: {
        useMutation: (opts: {
          onSuccess?: () => void;
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            mockUpdateMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      generateAdBannerPrompt: {
        useMutation: (opts: {
          onSuccess?: () => void;
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            mockGeneratePromptMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      generateAdBannerImage: {
        useMutation: (opts: {
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutate: (input: unknown, callbacks?: { onSuccess?: () => void }) => {
            mockGenerateImageMutate(input);
            generateImageOnSuccess = callbacks?.onSuccess ?? null;
            callbacks?.onSuccess?.();
          },
          isPending: false,
        }),
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

import { VerticalDramaAdBannerStudio } from "@/components/verticalDramaSeries/VerticalDramaAdBannerStudio";
import {
  createDefaultAdBannerDesign,
  VD_AD_BANNER_MAX_PER_SERIES,
  type VdAdBannerDesign,
} from "@shared/verticalDramaSeries/adBannerPresets";

function banner(overrides: Partial<VdAdBannerDesign> = {}): VdAdBannerDesign {
  return {
    ...createDefaultAdBannerDesign({
      id: overrides.id ?? "banner-1",
      stylePresetId: overrides.stylePresetId ?? "bold_typography",
      placementId: overrides.placementId ?? "bottom_band",
    }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateImageOnSuccess = null;
  mockMediaModelsQuery.mockReturnValue({
    data: {
      models: [
        {
          modelId: "model-a",
          name: "Model A",
          aspectRatios: ["16:9", "1:1"],
          sizes: ["1024x576"],
        },
      ],
    },
    isLoading: false,
  });
});

describe("VerticalDramaAdBannerStudio", () => {
  it("renders the empty state when the series has no banners yet", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{ adBanners: [] }}
      />
    );
    expect(screen.getByTestId("vd-ad-banner-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("vd-ad-banner-add")).toBeInTheDocument();
  });

  it("does not render add/remove/save controls when readOnly", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly
        productTieIn={{ adBanners: [banner()] }}
      />
    );
    expect(screen.queryByTestId("vd-ad-banner-add")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-ad-banner-remove-banner-1")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-ad-banner-save-settings-banner-1")
    ).not.toBeInTheDocument();
  });

  it("adds a new banner design via the updateSeries merge-patch when clicking Add", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{ productName: "Glow Serum", adBanners: [] }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-ad-banner-add"));

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const call = mockUpdateMutate.mock.calls[0][0];
    expect(call.seriesId).toBe("10");
    expect(call.productTieIn.productName).toBe("Glow Serum");
    expect(call.productTieIn.adBanners).toHaveLength(1);
    expect(call.productTieIn.adBanners[0].status).toBe("draft");
  });

  it("disables Add and shows the limit hint once the series has 5 banners", () => {
    const banners = Array.from(
      { length: VD_AD_BANNER_MAX_PER_SERIES },
      (_, i) => banner({ id: `banner-${i}` })
    );
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{ adBanners: banners }}
      />
    );
    expect(screen.getByTestId("vd-ad-banner-add")).toBeDisabled();
    expect(screen.getByTestId("vd-ad-banner-limit-hint")).toBeInTheDocument();
  });

  it("requires confirmation before removing a banner, then persists via updateSeries", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{
          adBanners: [banner({ id: "banner-1" }), banner({ id: "banner-2" })],
        }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-ad-banner-remove-banner-1"));
    expect(mockUpdateMutate).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("vd-ad-banner-remove-confirm-banner-1")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("vd-ad-banner-remove-confirm-submit-banner-1")
    );
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const call = mockUpdateMutate.mock.calls[0][0];
    expect(
      call.productTieIn.adBanners.map((b: VdAdBannerDesign) => b.id)
    ).toEqual(["banner-2"]);
  });

  it("orders style presets with the productCategory-matched one first, marked Recommended", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{
          adBanners: [
            banner({ id: "banner-1", stylePresetId: "reality_warp" }),
          ],
        }}
        productCategory="cosmetics"
      />
    );
    const card = screen.getByTestId("vd-ad-banner-card-banner-1");
    // tactile_sensory's fitCategories includes "cosmetic" -> matches
    // "cosmetics" -> its Thai name ("สัมผัสได้") renders first, with a
    // "แนะนำ" (Recommended) badge.
    expect(
      document.getElementById("vd-ad-banner-style-banner-1-tactile_sensory")
    ).not.toBeNull();
    expect(within(card).getByText("สัมผัสได้")).toBeInTheDocument();
    expect(within(card).getByText("แนะนำ")).toBeInTheDocument();

    const styleRadioGroup = within(card).getAllByRole("radiogroup")[0];
    const radioButtons = within(styleRadioGroup).getAllByRole("radio");
    // The first style radio rendered should be the recommended (matched) one.
    expect(radioButtons[0]).toHaveAttribute("value", "tactile_sensory");
  });

  it("prompt edit -> save persists prompt.final via updateSeries merge-patch, preserving prompt.generated", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{
          adBanners: [
            banner({
              id: "banner-1",
              status: "prompt_ready",
              prompt: { generated: "original generated prompt" },
            }),
          ],
        }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-ad-banner-prompt-banner-1-edit"));
    const textarea = screen.getByTestId(
      "vd-ad-banner-prompt-banner-1-textarea"
    );
    fireEvent.change(textarea, { target: { value: "edited final prompt" } });
    fireEvent.click(screen.getByTestId("vd-ad-banner-prompt-banner-1-save"));

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const nextBanner =
      mockUpdateMutate.mock.calls[0][0].productTieIn.adBanners[0];
    expect(nextBanner.prompt.final).toBe("edited final prompt");
    expect(nextBanner.prompt.generated).toBe("original generated prompt");
    expect(nextBanner.prompt.editedAt).toEqual(expect.any(String));
  });

  it("calls generateAdBannerPrompt with {seriesId, bannerId} when clicking Generate Prompt", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{ adBanners: [banner({ id: "banner-1" })] }}
      />
    );
    fireEvent.click(
      screen.getByTestId("vd-ad-banner-generate-prompt-banner-1")
    );
    expect(mockGeneratePromptMutate).toHaveBeenCalledWith({
      seriesId: "10",
      bannerId: "banner-1",
    });
    expect(mockInvalidateGet).toHaveBeenCalled();
  });

  it("shows the approval-required badge and an Approve action when approval.required and not yet approved", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{
          adBanners: [banner({ id: "banner-1", approval: { required: true } })],
        }}
      />
    );
    expect(
      screen.getByTestId("vd-ad-banner-approval-badge-banner-1")
    ).toHaveTextContent("ต้องอนุมัติก่อนใช้");
    fireEvent.click(screen.getByTestId("vd-ad-banner-approve-banner-1"));
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const nextBanner =
      mockUpdateMutate.mock.calls[0][0].productTieIn.adBanners[0];
    expect(nextBanner.approval.required).toBe(true);
    expect(nextBanner.approval.approvedAt).toEqual(expect.any(String));
  });

  it("does not show the Approve action once already approved", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{
          adBanners: [
            banner({
              id: "banner-1",
              approval: {
                required: true,
                approvedAt: "2026-07-08T00:00:00.000Z",
              },
            }),
          ],
        }}
      />
    );
    expect(
      screen.getByTestId("vd-ad-banner-approval-badge-banner-1")
    ).toHaveTextContent("อนุมัติแล้ว");
    expect(
      screen.queryByTestId("vd-ad-banner-approve-banner-1")
    ).not.toBeInTheDocument();
  });

  it("disables the Generate Image action until a prompt exists", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{
          adBanners: [banner({ id: "banner-1", status: "draft" })],
        }}
      />
    );
    expect(
      screen.getByTestId("vd-ad-banner-generate-image-banner-1")
    ).toBeDisabled();
  });

  it("generating -> ready transition: submits the image job then polls to completion and refreshes", async () => {
    mockGetAdBannerImageStatusFetch.mockResolvedValue({
      banner: banner({ id: "banner-1" }),
      taskStatus: "completed",
    });

    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{
          adBanners: [
            banner({
              id: "banner-1",
              status: "prompt_ready",
              prompt: { generated: "a prompt" },
            }),
          ],
        }}
      />
    );

    fireEvent.click(screen.getByTestId("vd-ad-banner-generate-image-banner-1"));
    expect(mockGenerateImageMutate).toHaveBeenCalledWith({
      seriesId: "10",
      bannerId: "banner-1",
    });
    expect(generateImageOnSuccess).not.toBeNull();

    await waitFor(() => {
      expect(mockGetAdBannerImageStatusFetch).toHaveBeenCalledWith({
        seriesId: "10",
        bannerId: "banner-1",
      });
    });
    // Called at least twice total: once from the mutation's onSuccess invalidate, once more after the poll resolves "completed".
    await waitFor(() => {
      expect(mockInvalidateGet.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("reflects a design already in 'generating' status from props directly (no button needed to show the state)", () => {
    render(
      <VerticalDramaAdBannerStudio
        lang="th"
        seriesId="10"
        readOnly={false}
        productTieIn={{
          adBanners: [banner({ id: "banner-1", status: "generating" })],
        }}
      />
    );
    const card = screen.getByTestId("vd-ad-banner-card-banner-1");
    expect(within(card).getByText("กำลังสร้างภาพ")).toBeInTheDocument();
  });
});
