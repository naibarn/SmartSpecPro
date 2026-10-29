import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalDramaEpisodeWorkspace } from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";

describe("VerticalDramaEpisodeWorkspace speaker visual detection wiring", () => {
  it("forwards detection action and detected people through to the shot editor", () => {
    const onDetectShotSpeakerPeople = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={{
          id: "ep-1",
          episodeNumber: 1,
          title: "Episode 1",
          status: "in_progress",
        }}
        storyboardPanel={{
          storyboard: {
            shots: [
              {
                shot_number: 4,
                visual_description: "People at a meeting table",
                characters: [],
              },
            ],
          },
          startFramePlan: {
            frames: [
              {
                shotNumber: 4,
                imagePrompt: "meeting room",
                approvedMediaAssetId: "asset-10",
              },
            ],
          },
          canonicalShotDrafts: [
            {
              shotNumber: 4,
              summary: "A meeting",
              dialogueLines: [{ speaker: "นักตรวจผนึก", line: "เริ่มประชุมได้" }],
            },
          ],
          assetUrls: {
            "asset-10": {
              url: "https://example.test/frame.jpg",
              thumbnailUrl: null,
            },
          },
          onSetShotSpeakerVisualBindings: vi.fn(),
          onDetectShotSpeakerPeople,
          detectedShotSpeakerPeopleByShot: {
            4: {
              sourceMediaAssetId: "asset-10",
              people: [
                {
                  id: "person-1",
                  boundingBox: {
                    x: 0.62,
                    y: 0.1,
                    width: 0.24,
                    height: 0.72,
                  },
                  appearance: "ชายชุดเข้มด้านหลังทางซ้าย",
                  confidence: 0.91,
                },
              ],
            },
          },
        }}
      />
    );

    const detectButton = screen.getByRole("button", {
      name: "Detect people in image",
    });
    expect(detectButton).toBeEnabled();
    fireEvent.click(detectButton);
    expect(onDetectShotSpeakerPeople).toHaveBeenCalledWith(4);
    expect(
      screen.getByRole("option", { name: /ชายชุดเข้มด้านหลังทางซ้าย/ })
    ).toBeInTheDocument();
  });
});
