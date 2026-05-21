import { describe, expect, it } from "vitest";

import {
  getRecoverableProcessingImageAssets,
  mergeCompletedHistoryImagesIntoGeneratedImages,
} from "./PresentationArticleGeneratorDialog";

describe("mergeCompletedHistoryImagesIntoGeneratedImages", () => {
  const prompt = {
    id: "img-1-1",
    pageNumber: 1,
    imageIndex: 1,
    placementRole: "hero" as const,
    shortLabel: "cover hero",
    prompt: "Create a full slide image",
  };

  it("hydrates a processing builder slot from completed media history by task id", () => {
    const merged = mergeCompletedHistoryImagesIntoGeneratedImages({
      prompts: [prompt],
      generatedImages: [{
        ...prompt,
        taskId: "task-1",
        status: "processing",
        canvasRatio: "3:4",
        updatedAt: "2026-05-20T11:40:00.000Z",
      }],
      historyTasks: [{
        id: "task-1",
        taskId: "provider-task-1",
        status: "completed",
        mediaType: "image",
        model: "gpt-image-2-text-to-image",
        prompt: "Create a full slide image",
        parameters: { aspect_ratio: "3:4" },
        resultUrl: "https://tempfile.aiquickdraw.com/generated.png",
        completedAt: "2026-05-20T11:45:00.000Z",
      }],
      imageModel: "gpt-image-2-text-to-image",
      canvasRatio: "3:4",
      now: "2026-05-20T11:46:00.000Z",
    });

    expect(merged).toEqual([{
      ...prompt,
      taskId: "task-1",
      url: "https://tempfile.aiquickdraw.com/generated.png",
      status: "completed",
      errorMessage: undefined,
      canvasRatio: "3:4",
      model: "gpt-image-2-text-to-image",
      updatedAt: "2026-05-20T11:46:00.000Z",
    }]);
  });

  it("hydrates a missing slot from the newest matching completed history task", () => {
    const merged = mergeCompletedHistoryImagesIntoGeneratedImages({
      prompts: [prompt],
      generatedImages: [],
      historyTasks: [
        {
          id: "older-task",
          status: "completed",
          mediaType: "image",
          model: "gpt-image-2-text-to-image",
          prompt: "Create a full slide image",
          parameters: { extra_params: { aspect_ratio: "3:4" } },
          resultUrl: "https://tempfile.aiquickdraw.com/older.png",
          completedAt: "2026-05-20T11:20:00.000Z",
        },
        {
          id: "newer-task",
          status: "completed",
          mediaType: "image",
          model: "gpt-image-2-text-to-image",
          prompt: "Create a full slide image",
          parameters: { aspect_ratio: "3:4" },
          resultData: {
            response: {
              data: [{ url: "https://tempfile.aiquickdraw.com/newer.png" }],
            },
          },
          completedAt: "2026-05-20T11:45:00.000Z",
        },
      ],
      imageModel: "gpt-image-2-text-to-image",
      canvasRatio: "3:4",
      now: "2026-05-20T11:46:00.000Z",
    });

    expect(merged[0]?.taskId).toBe("newer-task");
    expect(merged[0]?.url).toBe("https://tempfile.aiquickdraw.com/newer.png");
  });

  it("does not replace an already completed current-ratio slot", () => {
    const existing = {
      ...prompt,
      taskId: "existing-task",
      url: "https://cdn.example.com/current.png",
      status: "completed" as const,
      canvasRatio: "3:4" as const,
      model: "gpt-image-2-text-to-image",
    };

    const merged = mergeCompletedHistoryImagesIntoGeneratedImages({
      prompts: [prompt],
      generatedImages: [existing],
      historyTasks: [{
        id: "history-task",
        status: "completed",
        mediaType: "image",
        model: "gpt-image-2-text-to-image",
        prompt: "Create a full slide image",
        parameters: { aspect_ratio: "3:4" },
        resultUrl: "https://tempfile.aiquickdraw.com/history.png",
      }],
      imageModel: "gpt-image-2-text-to-image",
      canvasRatio: "3:4",
    });

    expect(merged).toBeInstanceOf(Array);
    expect(merged[0]).toBe(existing);
  });

  it("finds processing assets that should be fetched from the provider later", () => {
    const recoverable = getRecoverableProcessingImageAssets({
      prompts: [prompt],
      generatedImages: [
        {
          ...prompt,
          taskId: "task-processing",
          status: "processing",
          canvasRatio: "3:4",
          updatedAt: "2026-05-20T11:40:00.000Z",
        },
        {
          ...prompt,
          taskId: "task-completed",
          url: "https://cdn.example.com/done.png",
          status: "completed",
          canvasRatio: "3:4",
        },
        {
          ...prompt,
          taskId: "task-wrong-ratio",
          status: "processing",
          canvasRatio: "16:9",
        },
      ],
      canvasRatio: "3:4",
    });

    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]?.taskId).toBe("task-processing");
  });
});
