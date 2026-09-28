/**
 * @vitest-environment jsdom
 *
 * Feature 135 (Hermes/Grok media worker), section-10 §3.3 — EpisodeWorkspace
 * threading: `storyboardPanel.hermesConnectionId` /
 * `storyboardPanel.onHermesConnectionChange` forward unchanged to
 * `VerticalDramaStoryboardPanel` (pure plumbing, mirroring how
 * `mcpConnectionId` already threads through today).
 */
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHermesListConnections } = vi.hoisted(() => ({
  mockHermesListConnections: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    hermesConnections: {
      listConnections: { useQuery: mockHermesListConnections },
    },
  },
}));

import { VerticalDramaEpisodeWorkspace } from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";

const baseEpisode = {
  id: "ep-1",
  episodeNumber: 1,
  title: "Episode 1",
  status: "in_progress",
};

const HERMES_MODEL = {
  id: "hermes-grok/grok-imagine-image",
  modelId: "hermes-grok/grok-imagine-image",
  name: "Grok via Hermes",
  type: "image",
  provider: "xai",
  configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-image" } },
};

describe("VerticalDramaEpisodeWorkspace — Hermes connection prop threading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards hermesConnectionId/onHermesConnectionChange from storyboardPanel unchanged to StoryboardPanel", async () => {
    mockHermesListConnections.mockReturnValue({
      data: [
        {
          id: "conn-hermes-1",
          scope: "server_personal",
          status: "authorized",
          accountLabel: "My Grok",
          accountHint: null,
          defaultForImage: false,
          defaultForVideo: false,
          assignedWorkerOnline: true,
          capabilitySummary: { imageEnabled: true, videoEnabled: true },
        },
      ],
      isLoading: false,
    });
    const onHermesConnectionChange = vi.fn();

    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={{
          storyboard: {
            shots: [{ shot_number: 1, visual_description: "s1", characters: [] }],
          },
          imageModels: [HERMES_MODEL],
          selectedImageModelId: HERMES_MODEL.modelId,
          onSelectImageModel: vi.fn(),
          hermesConnectionId: null,
          onHermesConnectionChange,
        }}
      />,
    );

    // The picker inside StoryboardPanel auto-selects the single eligible
    // connection and reports it back through the exact callback threaded
    // in from the top — proof the plumbing is unbroken end-to-end.
    await waitFor(() => {
      expect(onHermesConnectionChange).toHaveBeenCalledWith("conn-hermes-1");
    });
  });
});
