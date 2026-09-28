import { describe, expect, it } from "vitest";
import { normalizeStoryboardGlobalInput } from "../storyboardSkillFrameworkContracts";
import {
  buildCuteChildPromptOnlyRequest,
  planStoryboardShots,
} from "../storyboardSkillFrameworkPipeline";
import { buildStoryboardReviewProjection } from "../storyboardSkillFrameworkProjection";

describe("Storyboard Framework Review projection", () => {
  it.each([2, 9, 12])("projects exactly %s ordered review tasks", count => {
    const global = normalizeStoryboardGlobalInput({
      title: "Story",
      idea: "A child helps a bird",
      storyType: "mime",
      totalShots: count,
      selectedSkillId: "cute_child_image_generator",
      selectedSkillVersion: "3.0.0",
      imageModelSelection: { modelId: "image" },
      videoModelSelection: { modelId: "video" },
    });
    const shots = planStoryboardShots(global).map(shot => ({
      shot,
      response: buildCuteChildPromptOnlyRequest(global, shot),
    }));
    const projection = buildStoryboardReviewProjection({
      projectId: "p",
      runId: "r",
      projectName: "Story",
      global,
      shots,
    });
    expect(projection.tasks).toHaveLength(count);
    expect(projection.taskIds).toEqual(projection.tasks.map(task => task.id));
    expect(
      projection.tasks[0].generationExtraParams.generationRequest
    ).toBeDefined();
    expect(projection.modelProvenance).toEqual({
      image: { requestedModelId: "image" },
      video: { requestedModelId: "video" },
    });
    expect(projection.tasks[0].storyboardContext).toMatchObject({
      modelProvenance: projection.modelProvenance,
    });
  });

  it("emits completed image tasks using the storyboard review URL contract", () => {
    const global = normalizeStoryboardGlobalInput({
      title: "Story",
      idea: "A child helps a bird",
      storyType: "mime",
      totalShots: 2,
      selectedSkillId: "cute_child_image_generator",
      selectedSkillVersion: "3.0.0",
      imageModelSelection: { modelId: "image" },
      videoModelSelection: { modelId: "video" },
    });
    const shots = planStoryboardShots(global).map(shot => ({
      shot,
      response: buildCuteChildPromptOnlyRequest(global, shot),
      imageUrl: `/api/storage/files/storyboard/${shot.shotNumber}.png`,
      imageEffectiveModelId: shot.shotNumber === 1 ? "provider-image-model" : null,
    }));
    const projection = buildStoryboardReviewProjection({
      projectId: "p",
      runId: "r",
      projectName: "Story",
      global,
      shots,
    });
    expect(projection.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "image",
        status: "completed",
        source: "generated",
        url: "/api/storage/files/storyboard/1.png",
      }),
    ]));
    expect(projection.tasks[0].storyboardContext).toMatchObject({
      modelProvenance: {
        image: { requestedModelId: "image" },
        video: { requestedModelId: "video" },
      },
    });
    expect(projection.modelProvenance.image).toEqual({
      requestedModelId: "image",
      effectiveModelId: "provider-image-model",
    });
  });
});
