/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockHermesListConnections,
  mockLocationList,
  mockImageModelList,
  mockPlanSceneVisualState,
  mockPreviewLocationPrompt,
  mockGenerateLocationImage,
  mockResolveMediaAsset,
  mockLinkAsset,
  mockApproveAsset,
  mockTaskFetch,
} = vi.hoisted(() => ({
  mockHermesListConnections: vi.fn(),
  mockLocationList: vi.fn(),
  mockImageModelList: vi.fn(),
  mockPlanSceneVisualState: vi.fn(),
  mockPreviewLocationPrompt: vi.fn(),
  mockGenerateLocationImage: vi.fn(),
  mockResolveMediaAsset: vi.fn(),
  mockLinkAsset: vi.fn(),
  mockApproveAsset: vi.fn(),
  mockTaskFetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaLocations: {
        list: { invalidate: vi.fn() },
        listLocationAssets: { invalidate: vi.fn() },
      },
      verticalDramaEpisodes: { getEpisodeDetail: { invalidate: vi.fn() } },
      media: { getTask: { fetch: mockTaskFetch } },
    }),
    hermesConnections: {
      listConnections: { useQuery: mockHermesListConnections },
    },
    verticalDramaLocations: {
      list: { useQuery: mockLocationList },
      previewLocationPrompt: {
        useMutation: () => ({ mutate: mockPreviewLocationPrompt }),
      },
      generateLocationImage: {
        useMutation: () => ({ mutate: mockGenerateLocationImage }),
      },
      resolveMediaAssetForImport: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: mockResolveMediaAsset,
        }),
      },
      linkAsset: {
        useMutation: () => ({ mutate: vi.fn(), mutateAsync: mockLinkAsset }),
      },
      approveAsset: {
        useMutation: () => ({ mutate: vi.fn(), mutateAsync: mockApproveAsset }),
      },
    },
    mediaModels: { list: { useQuery: mockImageModelList } },
  },
}));

import { VerticalDramaEpisodeWorkspace } from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";

const episode = {
  id: "episode-1",
  episodeNumber: 1,
  title: "Episode 1",
  status: "in_progress",
};

const storyboardPanel = {
  seriesId: "series-1",
  storyboard: {
    distinct_locations: [
      {
        location_key: "hall",
        location_name: "Hall",
        shot_numbers: [1],
      },
    ],
    shots: [
      { shot_number: 1, visual_description: "Hero enters", characters: [] },
    ],
  },
  startFramePlan: {
    frames: [{ shotNumber: 1, imagePrompt: "hall", locationKey: "hall" }],
  },
  sceneContinuityEnabled: true,
  onPlanSceneVisualState: mockPlanSceneVisualState,
};

describe("VerticalDramaEpisodeWorkspace — scene continuity prop threading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem(
      "smartspec_vd_location_image_model",
      "test-image-model"
    );
    mockHermesListConnections.mockReturnValue({ data: [], isLoading: false });
    mockLocationList.mockReturnValue({
      data: { locations: [] },
      isLoading: false,
    });
    mockImageModelList.mockReturnValue({
      data: {
        models: [{ modelId: "test-image-model", name: "Test image model" }],
      },
      isLoading: false,
    });
    mockPreviewLocationPrompt.mockImplementation((_input, options) => {
      options?.onSuccess?.({
        establishingPlatePrompt:
          "wide view of the hall from the missing rear corner",
        negativePrompt: "no people, no text",
      });
    });
    mockGenerateLocationImage.mockImplementation((_input, options) => {
      options?.onSuccess?.({ taskId: "task-1" });
    });
    mockTaskFetch.mockResolvedValue({
      status: "completed",
      resultUrl: "/generated-rear-corner.png",
    });
    mockResolveMediaAsset.mockResolvedValue({ mediaAssetId: "media-55" });
    mockLinkAsset.mockResolvedValue({ asset: { assetLinkId: "asset-77" } });
    mockApproveAsset.mockResolvedValue({});
  });

  it("forwards scene continuity to the primary storyboard mount and reaches the plan callback", async () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={episode}
        storyboardPanel={storyboardPanel}
      />
    );

    expect(
      await screen.findByTestId("vd-location-bible-row-hall")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vd-scene-lock-plan-hall"));
    expect(mockPlanSceneVisualState).toHaveBeenCalledWith("hall", undefined, 0);
  });

  it("does not render a scene-lock affordance through the no-shot fallback mount", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={episode}
        focusedStage="storyboard_shotgrid"
        storyboardPanel={{
          ...storyboardPanel,
          storyboard: { ...storyboardPanel.storyboard, shots: [] },
        }}
      />
    );

    expect(
      screen.queryByTestId("vd-scene-lock-plan-hall")
    ).not.toBeInTheDocument();
  });

  it("turns a missing angle into an editable reusable sub-view without hiding behind the primary image", async () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={episode}
        storyboardPanel={{
          ...storyboardPanel,
          sceneContinuityQcEnabled: true,
          startFramePlan: {
            ...storyboardPanel.startFramePlan,
            sceneVisualStates: {
              hall: { locationKey: "hall", coverageGaps: ["rear corner"] },
            },
          },
          episodeLocations: [
            {
              locationKey: "hall",
              name: "Hall",
              locationId: "5",
              primaryReferenceUrl: "/primary-hall.png",
            },
          ],
        }}
      />
    );

    expect(
      screen
        .getByTestId("vd-location-bible-row-hall")
        .querySelector('img[alt="Hall"]')
    ).toHaveAttribute("src", "/primary-hall.png");
    fireEvent.click(
      await screen.findByTestId("vd-location-coverage-gap-hall-0")
    );
    expect(mockPreviewLocationPrompt).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByTestId(
        "vd-credit-confirm-episode-location-prompt-hall-confirm"
      )
    );
    expect(mockPreviewLocationPrompt).toHaveBeenCalledTimes(1);

    const promptEditor = await screen.findByTestId(
      "vd-location-prompt-editor-hall"
    );
    expect(promptEditor).toHaveValue(
      "wide view of the hall from the missing rear corner"
    );
    expect(
      screen.queryByTestId("vd-location-negative-prompt-editor-hall")
    ).not.toBeInTheDocument();
    fireEvent.change(promptEditor, {
      target: {
        value: "edited rear-corner view, keep the coffee counter fixed",
      },
    });
    fireEvent.click(screen.getByTestId("vd-location-generate-image-hall"));
    expect(mockGenerateLocationImage).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByTestId(
        "vd-credit-confirm-episode-location-image-hall-confirm"
      )
    );

    expect(mockGenerateLocationImage).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "5",
        approvedPrompt:
          "edited rear-corner view, keep the coffee counter fixed",
        coverageRole: "detail_corner",
        gapDescription: "rear corner",
      }),
      expect.anything()
    );

    await waitFor(() =>
      expect(screen.getByTestId("vd-location-approve-hall")).toBeInTheDocument()
    );
    expect(
      screen
        .getByTestId("vd-location-bible-row-hall")
        .querySelector('img[alt="Hall"]')
    ).toHaveAttribute("src", "/primary-hall.png");
    fireEvent.click(screen.getByTestId("vd-location-approve-hall"));
    await waitFor(() =>
      expect(mockLinkAsset).toHaveBeenCalledWith(
        expect.objectContaining({ role: "detail_corner" })
      )
    );
  });
});
