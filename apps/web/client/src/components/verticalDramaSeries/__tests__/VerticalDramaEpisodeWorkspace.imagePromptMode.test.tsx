/**
 * @vitest-environment jsdom
 *
 * Regression coverage for the EpisodePage -> EpisodeWorkspace ->
 * StoryboardPanel image-prompt-mode prop chain. The selector is conditional
 * on the callback, so dropping either pass-through silently hides the control.
 */
import { fireEvent, render, screen } from "@testing-library/react";
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

describe("VerticalDramaEpisodeWorkspace — image prompt mode prop threading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHermesListConnections.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it("renders the stored mode and forwards changes to the page callback", async () => {
    const onSelectImagePromptMode = vi.fn();

    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={{
          storyboard: {
            shots: [
              { shot_number: 1, visual_description: "test shot", characters: [] },
            ],
          },
          imageModels: [
            {
              id: "gpt-image-2-text-to-image",
              modelId: "gpt-image-2-text-to-image",
              name: "GPT Image 2",
              type: "image",
              provider: "openai",
            },
          ],
          selectedImageModelId: "gpt-image-2-text-to-image",
          onSelectImageModel: vi.fn(),
          imagePromptMode: "cinematic_narrative",
          onSelectImagePromptMode,
        }}
      />,
    );

    const select = (await screen.findByTestId(
      "vd-storyboard-image-prompt-mode-select",
    )) as HTMLSelectElement;
    expect(select.value).toBe("cinematic_narrative");

    fireEvent.change(select, { target: { value: "policy_safe_rewrite" } });
    expect(onSelectImagePromptMode).toHaveBeenCalledWith("policy_safe_rewrite");
  });
});
