import {
  transcribeHyperframesStoryboardShot,
} from "./hyperframesTranscriptionService";
import { getRedisClient } from "./redis";

export type StoryboardReviewTranscribeJobStatus = "queued" | "running" | "completed" | "failed";

export type StoryboardReviewTranscribeJobResult = Awaited<ReturnType<typeof transcribeHyperframesStoryboardShot>> & {
  shotId: string;
  sourceVideoUrl: string;
};

export type StoryboardReviewTranscribeJob = {
  jobId: string;
  userId: string;
  status: StoryboardReviewTranscribeJobStatus;
  submittedAt: number;
  updatedAt: number;
  workerPid?: number | null;
  startedAt?: number;
  heartbeatAt?: number;
  input: {
    shotId: string;
    sourceVideoUrl: string;
    mediaStartSec?: number;
    durationSec?: number;
    language: string;
    model?: string;
  };
  result?: StoryboardReviewTranscribeJobResult;
  errorMessage?: string;
};

const STORYBOARD_REVIEW_TRANSCRIBE_JOB_TTL_SECONDS = 60 * 60;
const STORYBOARD_REVIEW_TRANSCRIBE_RUNNING_STALE_MS = 30 * 60 * 1000;
const STORYBOARD_REVIEW_TRANSCRIBE_ORPHANED_RUNNING_STALE_MS = 5 * 60 * 1000;

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isRunningTranscribeJobStale(job: StoryboardReviewTranscribeJob): boolean {
  if (job.status !== "running") return false;
  const lastUpdateAgeMs = Date.now() - Number(job.heartbeatAt || job.updatedAt || job.submittedAt || 0);
  const workerPid = Number(job.workerPid);
  if (Number.isFinite(workerPid) && workerPid > 0 && !isProcessAlive(workerPid)) return true;
  if ((!Number.isFinite(workerPid) || workerPid <= 0) && lastUpdateAgeMs > STORYBOARD_REVIEW_TRANSCRIBE_ORPHANED_RUNNING_STALE_MS) {
    return true;
  }
  return lastUpdateAgeMs > STORYBOARD_REVIEW_TRANSCRIBE_RUNNING_STALE_MS;
}

export async function setStoryboardReviewTranscribeJob(job: StoryboardReviewTranscribeJob): Promise<void> {
  await getRedisClient().set(
    `storyboard-review-transcribe-job:${job.jobId}`,
    JSON.stringify(job),
    "EX",
    STORYBOARD_REVIEW_TRANSCRIBE_JOB_TTL_SECONDS,
  );
}

export async function getStoryboardReviewTranscribeJob(jobId: string): Promise<StoryboardReviewTranscribeJob | null> {
  const raw = await getRedisClient().get(`storyboard-review-transcribe-job:${jobId}`);
  if (!raw) return null;
  const job = JSON.parse(raw) as StoryboardReviewTranscribeJob;
  if (!isRunningTranscribeJobStale(job)) return job;
  const failedJob = {
    ...job,
    status: "failed" as const,
    updatedAt: Date.now(),
    errorMessage:
      "HyperFrames transcribe worker stopped before completing this shot. Please try Transcribe again; the next run will start a fresh background job.",
  };
  await setStoryboardReviewTranscribeJob(failedJob);
  return failedJob;
}

export async function attachStoryboardReviewTranscribeWorkerPid(input: {
  jobId: string;
  workerPid: number | null | undefined;
}): Promise<void> {
  const workerPid = Number(input.workerPid);
  if (!Number.isFinite(workerPid) || workerPid <= 0) return;
  const current = await getStoryboardReviewTranscribeJob(input.jobId);
  if (!current) return;
  await setStoryboardReviewTranscribeJob({
    ...current,
    workerPid,
  });
}

export async function runStoryboardReviewTranscribeJob(jobId: string): Promise<void> {
  const current = await getStoryboardReviewTranscribeJob(jobId);
  if (!current) {
    throw new Error(`Storyboard Review transcribe job ${jobId} was not found.`);
  }
  if (current.status === "completed" || current.status === "running") {
    return;
  }
  const startedAt = Date.now();
  await setStoryboardReviewTranscribeJob({
    ...current,
    status: "running",
    updatedAt: startedAt,
    startedAt,
    heartbeatAt: startedAt,
    workerPid: process.pid,
    errorMessage: undefined,
  });
  try {
    const result = await transcribeHyperframesStoryboardShot({
      sourceVideoUrl: current.input.sourceVideoUrl,
      mediaStartSec: current.input.mediaStartSec,
      durationSec: current.input.durationSec,
      language: current.input.language,
      model: current.input.model,
    });
    await setStoryboardReviewTranscribeJob({
      ...current,
      status: "completed",
      updatedAt: Date.now(),
      heartbeatAt: Date.now(),
      workerPid: process.pid,
      result: {
        shotId: current.input.shotId,
        sourceVideoUrl: current.input.sourceVideoUrl,
        ...result,
      },
      errorMessage: undefined,
    });
  } catch (error) {
    await setStoryboardReviewTranscribeJob({
      ...current,
      status: "failed",
      updatedAt: Date.now(),
      heartbeatAt: Date.now(),
      workerPid: process.pid,
      errorMessage: error instanceof Error ? error.message : "HyperFrames transcribe failed.",
    });
  }
}
