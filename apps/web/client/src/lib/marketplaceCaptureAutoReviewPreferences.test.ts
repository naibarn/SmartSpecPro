import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY,
  loadStoredAutoStoryboardOverrides,
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
});
