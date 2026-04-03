import { describe, expect, it } from "vitest";
import {
  collectGenerationQueueTaskIdentityCandidates,
  getGenerationQueueIdentityCandidates,
  isGenerationQueueTaskDismissed,
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
});
