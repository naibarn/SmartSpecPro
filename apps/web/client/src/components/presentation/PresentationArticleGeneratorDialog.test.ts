import { describe, expect, it } from "vitest";

import {
  buildFullSlideImagePrompt,
  getErrorMessage,
  getExistingArticleValidation,
  getRecoverableProcessingImageAssets,
  inferTopicFallbackFromArticle,
  mergeCompletedHistoryImagesIntoGeneratedImages,
  mergePresentationBuilderImageJobsIntoGeneratedImages,
  resolveFullSlideImageStylePreset,
  resolvePresentationSlideImportAction,
} from "./PresentationArticleGeneratorDialog";

describe("full-slide image visual direction", () => {
  it("uses a technology-aware auto style and does not inject parenting direction", () => {
    const stylePreset = resolveFullSlideImageStylePreset({
      styleId: "auto",
      topic: "SmartAIHub และ Domain-Specific AI Harness",
      article: "แพลตฟอร์ม AI ที่เลือกใช้บริการตามความต้องการ",
      bundle: null,
    });
    const prompt = buildFullSlideImagePrompt({
      topic: "SmartAIHub และ Domain-Specific AI Harness",
      title: "โมเดลของ SmartAIHub",
      text: "แพลตฟอร์ม AI ที่เลือกใช้บริการตามความต้องการและคิดค่าบริการตามการใช้งานจริง",
      canvasRatio: "9:16",
      imagePromptContext: "",
      stylePreset,
      requestedStyleId: "auto",
    });

    expect(stylePreset.id).toBe("dark-cinematic");
    expect(prompt).toContain("Dark Cinematic");
    expect(prompt).toContain("SmartAIHub");
    expect(prompt).not.toContain("premium parenting");
    expect(prompt).not.toContain("parenting article cover");
  });

  it("falls back to a neutral infographic preset when the topic has no style signal", () => {
    const stylePreset = resolveFullSlideImageStylePreset({
      styleId: "auto",
      topic: "บทความใหม่",
      article: "เนื้อหาทั่วไปที่ไม่มีหมวดเฉพาะ",
      bundle: null,
    });
    expect(stylePreset.id).toBe("modern-minimal-infographic");
  });
});

describe("existing article input", () => {
  it("validates the same bounds as the slide bundle contract", () => {
    expect(getExistingArticleValidation("   ")).toBe("required");
    expect(getExistingArticleValidation("short article")).toBe("too_short");
    expect(getExistingArticleValidation("a".repeat(20))).toBeNull();
    expect(getExistingArticleValidation("a".repeat(25_001))).toBe("too_long");
  });

  it("derives a bounded presentation topic from the first non-empty line", () => {
    expect(
      inferTopicFallbackFromArticle("\n  Existing article title\nBody")
    ).toBe("Existing article title");
    expect(inferTopicFallbackFromArticle("a".repeat(2_100))).toHaveLength(
      2_000
    );
    expect(inferTopicFallbackFromArticle("\n\n")).toBe("Presentation");
  });

  it("translates the raw topic length validation into a helpful message", () => {
    const message = '[{"code":"too_big","path":["topic"],"maximum":2000}]';
    expect(
      getErrorMessage(message, "fallback", "Use the existing article mode.")
    ).toBe("Use the existing article mode.");
  });
});

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
      generatedImages: [
        {
          ...prompt,
          taskId: "task-1",
          status: "processing",
          canvasRatio: "3:4",
          updatedAt: "2026-05-20T11:40:00.000Z",
        },
      ],
      historyTasks: [
        {
          id: "task-1",
          taskId: "provider-task-1",
          status: "completed",
          mediaType: "image",
          model: "gpt-image-2-text-to-image",
          prompt: "Create a full slide image",
          parameters: { aspect_ratio: "3:4" },
          resultUrl: "https://tempfile.aiquickdraw.com/generated.png",
          completedAt: "2026-05-20T11:45:00.000Z",
        },
      ],
      imageModel: "gpt-image-2-text-to-image",
      canvasRatio: "3:4",
      now: "2026-05-20T11:46:00.000Z",
    });

    expect(merged).toEqual([
      {
        ...prompt,
        taskId: "task-1",
        url: "https://tempfile.aiquickdraw.com/generated.png",
        status: "completed",
        errorMessage: undefined,
        canvasRatio: "3:4",
        model: "gpt-image-2-text-to-image",
        updatedAt: "2026-05-20T11:46:00.000Z",
      },
    ]);
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
      historyTasks: [
        {
          id: "history-task",
          status: "completed",
          mediaType: "image",
          model: "gpt-image-2-text-to-image",
          prompt: "Create a full slide image",
          parameters: { aspect_ratio: "3:4" },
          resultUrl: "https://tempfile.aiquickdraw.com/history.png",
        },
      ],
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

describe("mergePresentationBuilderImageJobsIntoGeneratedImages", () => {
  it("hydrates the exact slot from a server job after the builder is reopened", () => {
    const prompt = {
      id: "img-2-1",
      pageNumber: 2,
      imageIndex: 1,
      placementRole: "hero" as const,
      shortLabel: "page hero",
      prompt: "Create the page hero",
    };

    expect(
      mergePresentationBuilderImageJobsIntoGeneratedImages({
        prompts: [prompt],
        generatedImages: [],
        jobs: [
          {
            slotId: "2:1:hero",
            pageNumber: 2,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "page hero",
            prompt: "Create the page hero",
            mediaTaskId: "task-2",
            status: "completed",
            resultUrl:
              "/api/storage/files/presentation/tenant/deck-9/image/2_1/task.png",
            completedAt: "2026-08-30T10:05:00.000Z",
          },
        ],
        canvasRatio: "16:9",
      })
    ).toEqual([
      {
        ...prompt,
        taskId: "task-2",
        url: "/api/storage/files/presentation/tenant/deck-9/image/2_1/task.png",
        status: "completed",
        canvasRatio: "16:9",
        model: undefined,
        updatedAt: "2026-08-30T10:05:00.000Z",
      },
    ]);
  });

  it("keeps a slot visibly processing while the background task is still running", () => {
    const prompt = {
      id: "img-1-1",
      pageNumber: 1,
      imageIndex: 1,
      placementRole: "hero" as const,
      shortLabel: "cover hero",
      prompt: "Create the cover",
    };

    const merged = mergePresentationBuilderImageJobsIntoGeneratedImages({
      prompts: [prompt],
      generatedImages: [],
      jobs: [
        {
          slotId: "1:1:hero",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Create the cover",
          mediaTaskId: "task-1",
          status: "processing",
          lastCheckedAt: "2026-08-30T10:00:00.000Z",
        },
      ],
      canvasRatio: "16:9",
    });

    expect(merged[0]).toMatchObject({
      taskId: "task-1",
      status: "processing",
      updatedAt: "2026-08-30T10:00:00.000Z",
    });
  });
});

describe("presentation slide import action", () => {
  it("allows one-click generation and import when all images are ready", () => {
    expect(
      resolvePresentationSlideImportAction({
        hasDraft: false,
        canInsert: false,
        imagesReady: true,
        isGeneratingSlideDraft: false,
        isBlocked: false,
      })
    ).toBe("generate_and_insert");
  });

  it("keeps import blocked while images or the slide draft are not ready", () => {
    expect(
      resolvePresentationSlideImportAction({
        hasDraft: false,
        canInsert: false,
        imagesReady: false,
        isGeneratingSlideDraft: false,
        isBlocked: true,
      })
    ).toBe("blocked");
    expect(
      resolvePresentationSlideImportAction({
        hasDraft: true,
        canInsert: true,
        imagesReady: true,
        isGeneratingSlideDraft: false,
        isBlocked: false,
      })
    ).toBe("insert");
  });
});
