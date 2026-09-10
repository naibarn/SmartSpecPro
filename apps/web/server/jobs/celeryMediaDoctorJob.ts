import {
  getCeleryMediaDoctorStatus,
  runCeleryMediaDoctor,
  shouldInvokeSafeRepair,
} from "../services/celeryMediaDoctorService";
import { reportSystemFailure } from "../services/systemAutoReportService";

const INTERVAL_MS = 60_000;
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastRepairAt = 0;

export async function runCeleryMediaDoctorMonitorOnce() {
  let status = await getCeleryMediaDoctorStatus();
  if (shouldInvokeSafeRepair(status) && Date.now() - lastRepairAt >= 5 * 60_000) {
    lastRepairAt = Date.now();
    const repair = await runCeleryMediaDoctor();
    status = repair.status;
  }

  if (status.queue.stalePendingCount > 0) {
    await reportSystemFailure({
      source: "celery_media_doctor",
      title: "Urgent: stale Celery media queue detected",
      errorMessage: "One or more image media tasks have remained pending for more than 3 minutes without completing.",
      priority: "critical",
      extra: {
        stalePendingCount: status.queue.stalePendingCount,
        processingCount: status.queue.processingCount,
        redisMediaDepth: status.queue.redisMediaDepth,
        workerStatus: status.workers.media.status,
        beatStatus: status.workers.beat.status,
      },
    });
  }
  if (status.overallStatus === "critical" || status.workers.media.status !== "running" || status.workers.beat.status !== "running") {
    await reportSystemFailure({
      source: "celery_media_doctor",
      title: "Urgent: Celery media infrastructure is unhealthy",
      errorMessage: `Celery media infrastructure status is ${status.overallStatus}; automatic repair was ${status.repair.available ? "attempted" : "blocked for safety"}.`,
      priority: "critical",
      extra: {
        mediaContainerStatus: status.workers.media.status,
        beatContainerStatus: status.workers.beat.status,
        mediaDuplicate: status.workers.media.duplicate,
        beatDuplicate: status.workers.beat.duplicate,
      },
    });
  }
  return status;
}

export async function initializeCeleryMediaDoctorJob() {
  if (intervalId) return;
  await runCeleryMediaDoctorMonitorOnce().catch((error) => {
    console.error("[CeleryMediaDoctor] initial monitor failed:", error);
  });
  intervalId = setInterval(() => {
    runCeleryMediaDoctorMonitorOnce().catch((error) => {
      console.error("[CeleryMediaDoctor] periodic monitor failed:", error);
    });
  }, INTERVAL_MS);
}

export function shutdownCeleryMediaDoctorJob() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}
