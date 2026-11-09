import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY,
  loadStoredAutoStoryboardOverrides,
  persistStoredAutoReviewImageModel,
  persistStoredAutoReviewVideoModel,
  persistStoredStoryPlanningModel,
} from "./marketplaceCaptureAutoReviewPreferences";

describe("marketplace Auto Review preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers the LLM choice without replacing image and video model choices", () => {
    window.localStorage.setItem(
      AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY,
      JSON.stringify({
        imageModel: "image-model-1",
        videoModel: "video-model-1",
      })
    );

    persistStoredStoryPlanningModel("story-model-1");

    expect(loadStoredAutoStoryboardOverrides()).toMatchObject({
      imageModel: "image-model-1",
      videoModel: "video-model-1",
      storyPlanningModel: "story-model-1",
    });
  });

  it("remembers image, video, and story-planning models together", () => {
    persistStoredAutoReviewImageModel("image-model-2");
    persistStoredAutoReviewVideoModel("video-model-2");
    persistStoredStoryPlanningModel("story-model-2");

    expect(loadStoredAutoStoryboardOverrides()).toMatchObject({
      imageModel: "image-model-2",
      videoModel: "video-model-2",
      storyPlanningModel: "story-model-2",
    });
  });

  it("migrates legacy 3x3 defaults to the sequential nine-image default and preserves model choices", () => {
    window.localStorage.setItem(
      "smartSpecPro.marketplaceCapture.autoStoryboardOverrides.v1",
      JSON.stringify({
        frameStrategy: "storyboard_3x3_split",
        imageModel: "image-model-legacy",
        videoModel: "video-model-legacy",
        storyPlanningModel: "story-model-legacy",
      })
    );

    expect(loadStoredAutoStoryboardOverrides()).toMatchObject({
      frameStrategy: "sequential_shot_storyboard",
      imageModel: "image-model-legacy",
      videoModel: "video-model-legacy",
      storyPlanningModel: "story-model-legacy",
    });
    expect(
      window.localStorage.getItem(AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY)
    ).not.toBeNull();
  });
});
