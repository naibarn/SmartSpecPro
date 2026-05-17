import { describe, expect, it } from "vitest";
import {
  buildFirstLastFrameStoryboardTasks,
  mergeFresherStoryboardReviewTasks,
  replaceStoryboardVideoSlot,
  replaceStoryboardReferenceFrame,
  storyboardDraftToReviewTasks,
  type StoryboardReviewDraft,
} from "./storyboardReviewWorkspace";

describe("buildFirstLastFrameStoryboardTasks", () => {
  it("creates one queued video task per adjacent image pair", () => {
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1" },
        { url: "https://example.com/2.jpg", name: "Frame 2" },
        { url: "https://example.com/3.jpg", name: "Frame 3" },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        extraParams: { resolution: "1080p" },
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      id: "split-storyboard-12345-1",
      index: 0,
      status: "queued",
      type: "video",
      model: "veo-3-1",
      durationSeconds: 8,
    });
    expect(tasks[0]?.storyboardContext?.referenceImages.map((image) => image.url)).toEqual([
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
    ]);
    expect(tasks[1]?.storyboardContext?.referenceImages.map((image) => image.url)).toEqual([
      "https://example.com/2.jpg",
      "https://example.com/3.jpg",
    ]);
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      resolution: "1080p",
      generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    });
  });

  it("does not create tasks without at least two usable images", () => {
    expect(buildFirstLastFrameStoryboardTasks([{ url: "https://example.com/1.jpg" }], { model: "veo-3-1", aspectRatio: "auto" })).toEqual([]);
    expect(buildFirstLastFrameStoryboardTasks([{ url: "" }, { url: "   " }], { model: "veo-3-1", aspectRatio: "auto" })).toEqual([]);
  });

  it("replaces shared boundary frames and invalidates affected queued videos", () => {
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1" },
        { url: "https://example.com/2.jpg", name: "Frame 2" },
        { url: "https://example.com/3.jpg", name: "Frame 3" },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        now: 1000,
      },
    );
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: 1000,
      taskIds: tasks.map((task) => task.id),
      selectedTaskIds: tasks.map((task) => task.id),
      tasks: tasks.map((task) => ({ ...task, status: "completed", url: `https://example.com/${task.id}.mp4` })),
      companionAudio: [],
      compoundStatus: "ready",
      projectLink: "/video-editor?projectId=1",
      renderJobId: "render-1",
    };

    const next = replaceStoryboardReferenceFrame(draft, {
      taskId: tasks[0]!.id,
      frameIndex: 1,
      image: { url: "https://example.com/replacement.jpg", name: "Replacement" },
      now: 2000,
      statusDetail: "Frame changed",
    });

    expect(next.projectLink).toBeNull();
    expect(next.renderJobId).toBeNull();
    expect(next.compoundStatus).toBeNull();
    expect(next.tasks[0]?.status).toBe("queued");
    expect(next.tasks[0]?.url).toBeUndefined();
    expect(next.tasks[0]?.storyboardContext?.referenceImages[1]?.url).toBe("https://example.com/replacement.jpg");
    expect(next.tasks[1]?.status).toBe("queued");
    expect(next.tasks[1]?.url).toBeUndefined();
    expect(next.tasks[1]?.storyboardContext?.referenceImages[0]?.url).toBe("https://example.com/replacement.jpg");
  });

  it("carries imported video aspect ratio into review tasks", () => {
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: 1000,
      taskIds: ["imported-1"],
      selectedTaskIds: ["imported-1"],
      tasks: [
        {
          id: "imported-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Uploaded clip",
          model: "Imported",
          createdAt: 1000,
          updatedAt: 1000,
          url: "https://example.com/uploaded.mp4",
          source: "imported",
          aspectRatio: "9:16",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };

    expect(storyboardDraftToReviewTasks(draft)[0]?.generationAspectRatio).toBe("9:16");
  });

  it("replaces a video slot with the uploaded clip and invalidates stale render links", () => {
    const draft: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 1000,
      taskIds: ["shot-1"],
      selectedTaskIds: [],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Old generated clip",
          model: "veo-3-1",
          createdAt: 900,
          updatedAt: 1000,
          url: "https://example.com/old.mp4",
          storyboardContext: {
            aspectRatio: "16:9",
            model: "veo-3-1",
            referenceImages: [],
            referenceVideos: [],
          },
        },
      ],
      companionAudio: [],
      compoundStatus: "Rendered old project",
      projectLink: "/video-editor?projectId=old",
      renderJobId: "old-render",
    };

    const next = replaceStoryboardVideoSlot(draft, {
      taskId: "shot-1",
      mode: "replace",
      now: 2000,
      importedTask: {
        id: "uploaded-video-replace-1",
        index: 0,
        status: "completed",
        type: "video",
        prompt: "Uploaded replacement",
        model: "Uploaded video",
        durationSeconds: 6,
        createdAt: 2000,
        updatedAt: 2000,
        url: "https://example.com/new.mp4",
        source: "imported",
        aspectRatio: "9:16",
      },
    });

    expect(next.updatedAt).toBe(2000);
    expect(next.taskIds).toEqual(["shot-1"]);
    expect(next.selectedTaskIds).toEqual(["shot-1"]);
    expect(next.projectLink).toBeNull();
    expect(next.renderJobId).toBeNull();
    expect(next.compoundStatus).toBeNull();
    expect(next.tasks[0]).toMatchObject({
      id: "shot-1",
      index: 0,
      status: "completed",
      url: "https://example.com/new.mp4",
      source: "imported",
      aspectRatio: "9:16",
      createdAt: 900,
      updatedAt: 2000,
    });
    expect(next.tasks[0]?.storyboardContext).toBeUndefined();
  });

  it("keeps fresher task media when merging a stale draft with a newer timestamp", () => {
    const existing = {
      version: 1 as const,
      updatedAt: 3000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed" as const,
          type: "video",
          prompt: "v7.mp4",
          model: "Uploaded",
          createdAt: 1000,
          updatedAt: 3000,
          url: "/files/v7.mp4",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming = {
      ...existing,
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        {
          ...existing.tasks[0]!,
          updatedAt: 1000,
          url: "/files/v4.mp4",
        },
      ],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [{ id: "shot-1", updatedAt: 3000, url: "/files/v7.mp4" }],
    });
  });
});
