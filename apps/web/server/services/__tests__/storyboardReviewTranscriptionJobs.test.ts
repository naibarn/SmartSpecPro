import { beforeEach, describe, expect, it, vi } from "vitest";

const redisStore = vi.hoisted(() => new Map<string, string>());
const transcribeMocks = vi.hoisted(() => ({
  transcribeHyperframesStoryboardShot: vi.fn(),
}));

vi.mock("../redis", () => ({
  getRedisClient: () => ({
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
  }),
}));

vi.mock("../hyperframesTranscriptionService", () => ({
  transcribeHyperframesStoryboardShot:
    transcribeMocks.transcribeHyperframesStoryboardShot,
}));

import {
  getStoryboardReviewTranscribeJob,
  runStoryboardReviewTranscribeJob,
  setStoryboardReviewTranscribeJob,
} from "../storyboardReviewTranscriptionJobs";

describe("storyboardReviewTranscriptionJobs", () => {
  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    transcribeMocks.transcribeHyperframesStoryboardShot.mockResolvedValue({
      text: "เสียงทดสอบ",
      cues: [{ index: 1, text: "เสียงทดสอบ", start: 0, end: 1 }],
      vtt: "WEBVTT\n",
      srt: "1\n",
      model: "large-v3",
      language: "th",
    });
  });

  it("runs a queued transcription job and persists the transcript result", async () => {
    await setStoryboardReviewTranscribeJob({
      jobId: "job_1",
      userId: "1",
      status: "queued",
      submittedAt: 1_000,
      updatedAt: 1_000,
      input: {
        shotId: "shot_1",
        sourceVideoUrl: "/api/storage/files/shot-1.mp4",
        language: "th",
      },
    });

    await runStoryboardReviewTranscribeJob("job_1");

    const job = await getStoryboardReviewTranscribeJob("job_1");
    expect(job).toMatchObject({
      jobId: "job_1",
      status: "completed",
      result: {
        shotId: "shot_1",
        sourceVideoUrl: "/api/storage/files/shot-1.mp4",
        text: "เสียงทดสอบ",
      },
    });
  });

  it("fails stale running jobs so UI polling does not wait forever", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T10:20:00.000Z"));
    await setStoryboardReviewTranscribeJob({
      jobId: "job_stale",
      userId: "1",
      status: "running",
      submittedAt: Date.now() - 20 * 60_000,
      updatedAt: Date.now() - 20 * 60_000,
      input: {
        shotId: "shot_1",
        sourceVideoUrl: "/api/storage/files/shot-1.mp4",
        language: "th",
      },
    });

    const job = await getStoryboardReviewTranscribeJob("job_stale");

    expect(job).toMatchObject({
      jobId: "job_stale",
      status: "failed",
    });
    expect(job?.errorMessage).toMatch(/timed out/i);
  });

  it("allows a failed stale job to be retried by a Cloud Tasks redelivery", async () => {
    await setStoryboardReviewTranscribeJob({
      jobId: "job_retry",
      userId: "1",
      status: "failed",
      submittedAt: 1_000,
      updatedAt: 2_000,
      input: {
        shotId: "shot_1",
        sourceVideoUrl: "/api/storage/files/shot-1.mp4",
        language: "th",
      },
      errorMessage: "previous timeout",
    });

    await runStoryboardReviewTranscribeJob("job_retry");

    const job = await getStoryboardReviewTranscribeJob("job_retry");
    expect(job?.status).toBe("completed");
    expect(transcribeMocks.transcribeHyperframesStoryboardShot).toHaveBeenCalledTimes(1);
  });
});
