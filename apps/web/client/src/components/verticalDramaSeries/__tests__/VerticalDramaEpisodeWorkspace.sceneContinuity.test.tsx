/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockHermesListConnections,
  mockLocationList,
  mockImageModelList,
  mockPlanSceneVisualState,
} = vi.hoisted(() => ({
  mockHermesListConnections: vi.fn(),
  mockLocationList: vi.fn(),
  mockImageModelList: vi.fn(),
  mockPlanSceneVisualState: vi.fn(),
}));

function mutationStub() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  };
}

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaLocations: { list: { invalidate: vi.fn() } },
      media: { getTask: { fetch: vi.fn() } },
    }),
    hermesConnections: {
      listConnections: { useQuery: mockHermesListConnections },
    },
    verticalDramaLocations: {
      list: { useQuery: mockLocationList },
      previewLocationPrompt: { useMutation: mutationStub },
      generateLocationImage: { useMutation: mutationStub },
      resolveMediaAssetForImport: { useMutation: mutationStub },
      linkAsset: { useMutation: mutationStub },
      approveAsset: { useMutation: mutationStub },
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
    mockHermesListConnections.mockReturnValue({ data: [], isLoading: false });
    mockLocationList.mockReturnValue({
      data: { locations: [] },
      isLoading: false,
    });
    mockImageModelList.mockReturnValue({
      data: { models: [] },
      isLoading: false,
    });
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
});
