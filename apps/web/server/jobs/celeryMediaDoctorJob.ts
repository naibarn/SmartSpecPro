import {
  getCeleryMediaDoctorStatus,
  runCeleryMediaDoctor,
  shouldInvokeSafeRepair,
} from "../services/celeryMediaDoctorService";
import { reportSystemFailure } from "../services/systemAutoReportService";
import { isCloudflareHardCutoverEnabled } from "../services/cloudflareRuntimeTarget";

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
    const affectedUsers = status.users.filter((user) => user.stalePendingCount > 0);
    const affectedUserIds = affectedUsers.map((user) => user.userId).slice(0, 5);
    const affectedTaskIds = affectedUsers.flatMap((user) => user.staleTaskIds).slice(0, 10);
    await reportSystemFailure({
      source: "celery_media_doctor",
      title: "Urgent: stale Celery media queue detected",
      errorMessage: "One or more image media tasks remained unclaimed for more than 3 minutes while the owner had available processing capacity.",
      priority: "critical",
      affectedUserIds,
      affectedTaskIds,
      extra: {
        stalePendingCount: status.queue.stalePendingCount,
        processingCount: status.queue.processingCount,
        inFlightCount: status.queue.inFlightCount,
        claimedPendingCount: status.queue.claimedPendingCount,
        unclaimedPendingCount: status.queue.unclaimedPendingCount,
        affectedUserCount: affectedUserIds.length,
        affectedTaskCount: affectedTaskIds.length,
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
  // Media Doctor observes the retired Celery runtime. It must not initialize,
  // repair, or report that runtime as an active production path after the
  // Cloudflare hard cutover. The historical monitor remains available for
  // compatibility-drain/rollback observation when hard cutover is disabled.
  if (isCloudflareHardCutoverEnabled()) return;
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
