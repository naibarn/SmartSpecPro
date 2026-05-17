import { describe, expect, it } from "vitest";
import {
  collectGenerationQueueTaskIdentityCandidates,
  getGenerationQueueIdentityCandidates,
  isGenerationQueueTaskDismissed,
  isStoryboardReviewOnlyQueuedTask,
  mergeGenerationQueueTasks,
  shouldIncludeHistoryTaskInGenerationQueue,
} from "./mediaStudioGenerationQueue";

describe("mediaStudioGenerationQueue", () => {
  it("collects stable identity candidates across local, backend, and provider ids", () => {
    expect(
      getGenerationQueueIdentityCandidates({
        id: "local-1",
        backendTaskId: "backend-1",
        providerTaskId: "provider-1",
        taskId: "provider-1",
      }),
    ).toEqual(["local-1", "backend-1", "provider-1"]);
  });

  it("deduplicates the same task when local and history entries use different ids", () => {
    const merged = mergeGenerationQueueTasks([
      {
        id: "local-1",
        backendTaskId: "backend-1",
        providerTaskId: "provider-1",
        status: "processing",
        prompt: "A cinematic hero shot",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "provider-1",
        backendTaskId: "backend-1",
        providerTaskId: "provider-1",
        status: "completed",
        prompt: "A cinematic hero shot",
        result: "https://cdn.example.com/out.mp4",
        createdAt: 1,
        updatedAt: 3,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "provider-1",
      status: "completed",
      result: "https://cdn.example.com/out.mp4",
    });
  });

  it("keeps terminal history tasks hidden unless the queue already tracked them", () => {
    expect(
      shouldIncludeHistoryTaskInGenerationQueue(
        "completed",
        { id: "backend-1", taskId: "provider-1" },
        new Set<string>(),
      ),
    ).toBe(false);

    expect(
      shouldIncludeHistoryTaskInGenerationQueue(
        "processing",
        { id: "backend-1", taskId: "provider-1" },
        new Set<string>(),
      ),
    ).toBe(true);

    expect(
      shouldIncludeHistoryTaskInGenerationQueue(
        "completed",
        { id: "backend-1", taskId: "provider-1" },
        new Set<string>(["provider-1"]),
      ),
    ).toBe(true);
  });

  it("hides stale active history tasks unless they are already tracked", () => {
    const nowMs = Date.parse("2026-05-16T07:00:00Z");
    const staleTask = {
      id: "backend-stale",
      taskId: "provider-stale",
      updatedAt: "2026-05-16T03:30:00Z",
    };

    expect(
      shouldIncludeHistoryTaskInGenerationQueue(
        "processing",
        staleTask,
        new Set<string>(),
        { nowMs, activeHistoryMaxAgeMs: 2 * 60 * 60 * 1000 },
      ),
    ).toBe(false);

    expect(
      shouldIncludeHistoryTaskInGenerationQueue(
        "processing",
        staleTask,
        new Set<string>(["provider-stale"]),
        { nowMs, activeHistoryMaxAgeMs: 2 * 60 * 60 * 1000 },
      ),
    ).toBe(true);
  });

  it("treats any known identity as dismissed", () => {
    expect(
      isGenerationQueueTaskDismissed(
        {
          id: "local-1",
          backendTaskId: "backend-1",
          providerTaskId: "provider-1",
        },
        new Set<string>(["provider-1"]),
      ),
    ).toBe(true);
  });

  it("collects every known identity when dismissing terminal tasks", () => {
    expect(
      collectGenerationQueueTaskIdentityCandidates([
        { id: "local-1", backendTaskId: "backend-1", providerTaskId: "provider-1" },
        { id: "local-2", taskId: "provider-2" },
      ]),
    ).toEqual(["local-1", "backend-1", "provider-1", "local-2", "provider-2"]);
  });

  it("identifies queued storyboard review placeholders before real generation starts", () => {
    const reviewTaskIds = new Set<string>(["split-storyboard-1"]);

    expect(
      isStoryboardReviewOnlyQueuedTask(
        {
          id: "split-storyboard-1",
          status: "queued",
          storyboardContext: {
            extraParams: { generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO" },
          },
        },
        reviewTaskIds,
      ),
    ).toBe(true);

    expect(
      isStoryboardReviewOnlyQueuedTask(
        {
          id: "split-storyboard-1",
          status: "queued",
          backendTaskId: "backend-1",
          storyboardContext: {
            extraParams: { generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO" },
          },
        },
        reviewTaskIds,
      ),
    ).toBe(false);

    expect(
      isStoryboardReviewOnlyQueuedTask(
        {
          id: "split-storyboard-1",
          status: "generating",
          storyboardContext: {
            extraParams: { generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO" },
          },
        },
        reviewTaskIds,
      ),
    ).toBe(false);
  });
});
