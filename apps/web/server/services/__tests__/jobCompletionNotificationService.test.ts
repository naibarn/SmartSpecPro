import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateNotification = vi.hoisted(() => vi.fn());

vi.mock("../notificationService", () => ({
  createNotification: mockCreateNotification,
}));

import {
  buildJobCompletionNotification,
  buildVerticalDramaEpisodeUrl,
  buildWorkerJobActionUrl,
  notifyJobCompletion,
} from "../jobCompletionNotificationService";

describe("jobCompletionNotificationService", () => {
  beforeEach(() => {
    mockCreateNotification.mockReset();
    mockCreateNotification.mockResolvedValue({
      notificationId: 11,
      deduplicated: false,
    });
  });

  it("builds an owner-scoped success notification with a stable dedup key", () => {
    const payload = buildJobCompletionNotification({
      db: {} as any,
      userId: 42,
      tenantId: "tenant-1",
      jobId: "job-1",
      jobType: "vertical_drama_interactive:special_tie_in_prompt",
      status: "succeeded",
      title: "สร้าง Prompt ตอนพิเศษ",
      actionUrl: "/drama-series/53/episodes/248",
      startedAt: "2026-08-31T00:00:00.000Z",
      finishedAt: "2026-08-31T00:00:03.000Z",
      traceId: "trace-1",
    });

    expect(payload).toEqual(
      expect.objectContaining({
        userId: 42,
        type: "system",
        priority: "normal",
        actionUrl: "/drama-series/53/episodes/248",
        groupKey:
          "job_completion:vertical_drama_interactive:special_tie_in_prompt:job-1",
      })
    );
    expect(payload?.metadata).toEqual(
      expect.objectContaining({
        source: "job_completion",
        eventId:
          "job-completion:vertical_drama_interactive:special_tie_in_prompt:job-1",
        metrics: { durationMs: 3000 },
      })
    );
  });

  it("does not build a notification without an owner", () => {
    expect(
      buildJobCompletionNotification({
        db: {} as any,
        userId: null,
        jobId: "job-1",
        jobType: "worker:test",
        status: "failed",
        title: "Test",
      })
    ).toBeNull();
  });

  it("creates a notification and returns deduplication information", async () => {
    const result = await notifyJobCompletion({
      db: {} as any,
      userId: 42,
      jobId: "job-1",
      jobType: "worker:test",
      status: "failed",
      title: "งาน test",
      errorMessage: "provider unavailable",
    });

    expect(result).toEqual({ notificationId: 11, deduplicated: false });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        type: "alert",
        groupKey: "job_completion:worker:test:job-1",
      })
    );
  });

  it("swallows notification failures after logging so job completion is not changed", async () => {
    mockCreateNotification.mockRejectedValue(new Error("database unavailable"));
    await expect(
      notifyJobCompletion({
        db: {} as any,
        userId: 42,
        jobId: "job-1",
        jobType: "worker:test",
        status: "succeeded",
        title: "งาน test",
      })
    ).resolves.toBeNull();
  });

  it("builds result links only from validated internal identifiers", () => {
    expect(buildVerticalDramaEpisodeUrl(53, 248)).toBe(
      "/drama-series/53/episodes/248"
    );
    expect(buildVerticalDramaEpisodeUrl("bad", 248)).toBeUndefined();
    expect(
      buildWorkerJobActionUrl({ inputJson: { seriesId: 53, episodeId: 248 } })
    ).toBe("/drama-series/53/episodes/248");
    expect(buildWorkerJobActionUrl({ workflowRunId: "run/1" })).toBe(
      "/work/requests?runId=run%2F1"
    );
  });
});
