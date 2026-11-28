import { describe, expect, it } from "vitest";
import { findStagedVideoPromptShotsMissingSpeakerBindings } from "../marketplaceAutoReviewStagedCheckpointRouterService";

const plan = {
  cast: [
    { castId: "adult-1", name: "Adult", role: "host", ageRange: "adult" },
    {
      castId: "minor-1",
      name: "Child",
      role: "support",
      ageRange: "under 18",
      depictsMinor: true,
    },
  ],
};

function shot(
  shotId: number,
  dialogue: string,
  bindings?: Record<string, string>
) {
  return {
    shotId,
    dialogue,
    castInShot: ["adult-1", "minor-1"],
    imageArtifactHash: `image-${shotId}`,
    speakerVisualBindingsImageHash: bindings ? `image-${shotId}` : undefined,
    speakerVisualBindings: bindings,
  };
}

describe("staged video prompt speaker-binding gate", () => {
  it("blocks video prompt refresh when any speaking adult has no current visual binding", () => {
    const metadata = {
      stagedSequentialStoryboard: {
        shots: [
          shot(1, "Adult: พร้อมแล้ว"),
          shot(2, "Adult: เริ่มกันเลย", { Adult: "person-1" }),
        ],
      },
    };

    expect(
      findStagedVideoPromptShotsMissingSpeakerBindings({
        metadata,
        plan,
        targets: [
          { shotId: 1, stage: "video", refreshPrompt: true, promptOnly: true },
          { shotId: 2, stage: "video", refreshPrompt: true, promptOnly: true },
        ],
      })
    ).toEqual([1]);
  });

  it("does not require a speaking binding for a minor-only line removed by safety rules", () => {
    const metadata = {
      stagedSequentialStoryboard: {
        shots: [shot(1, "Child: สวัสดี")],
      },
    };

    expect(
      findStagedVideoPromptShotsMissingSpeakerBindings({
        metadata,
        plan,
        targets: [{ shotId: 1, stage: "video", refreshPrompt: true }],
      })
    ).toEqual([]);
  });

  it("blocks unattributed dialogue when multiple eligible adults are in the shot", () => {
    const metadata = {
      stagedSequentialStoryboard: {
        shots: [
          {
            ...shot(1, "เริ่มจากตรงนี้ได้เลย"),
            castInShot: ["adult-1", "adult-2"],
          },
        ],
      },
    };

    expect(
      findStagedVideoPromptShotsMissingSpeakerBindings({
        metadata,
        plan: {
          cast: [
            ...plan.cast,
            {
              castId: "adult-2",
              name: "Second Adult",
              role: "guest",
              ageRange: "adult",
            },
          ],
        },
        targets: [{ shotId: 1, stage: "video", refreshPrompt: true }],
      })
    ).toEqual([1]);
  });

  it("ignores saved-prompt and image targets because they do not author a video prompt", () => {
    const metadata = {
      stagedSequentialStoryboard: {
        shots: [shot(1, "Adult: พร้อมแล้ว")],
      },
    };

    expect(
      findStagedVideoPromptShotsMissingSpeakerBindings({
        metadata,
        plan,
        targets: [
          { shotId: 1, stage: "video", promptOnly: true },
          { shotId: 1, stage: "image", refreshPrompt: true },
        ],
      })
    ).toEqual([]);
  });
});
