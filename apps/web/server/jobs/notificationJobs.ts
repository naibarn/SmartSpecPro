/**
 * Centralized initialization module for all notification-related recurring jobs.
 *
 * Called from _core/index.ts at startup. Each job is wrapped in try/catch
 * so one failure doesn't block others.
 */

import {
  initializeEscalationJob,
  shutdownEscalationJob,
} from "./escalationJob";
import {
  initializeDigestJob,
  shutdownDigestJob,
} from "./notificationDigestJob";
import {
  initWebhookDeliveryWorker,
  shutdownWebhookDeliveryWorker,
} from "../services/notificationWebhookService";

export async function initializeNotificationJobs(): Promise<void> {
  try {
    await initializeEscalationJob();
  } catch (e) {
    console.error(
      "[notificationJobs] escalation init failed:",
      e instanceof Error ? e.message : e
    );
  }
  try {
    await initializeDigestJob();
  } catch (e) {
    console.error(
      "[notificationJobs] digest init failed:",
      e instanceof Error ? e.message : e
    );
  }
  try {
    await initWebhookDeliveryWorker();
  } catch (e) {
    console.error(
      "[notificationJobs] webhook worker init failed:",
      e instanceof Error ? e.message : e
    );
  }
  // Section-12 adds: try { await initializeRetentionJob(); } catch (e) { ... }
}

export async function shutdownNotificationJobs(): Promise<void> {
  try {
    await shutdownEscalationJob();
  } catch (e) {
    console.error(
      "[notificationJobs] escalation shutdown failed:",
      e instanceof Error ? e.message : e
    );
  }
  try {
    await shutdownDigestJob();
  } catch (e) {
    console.error(
      "[notificationJobs] digest shutdown failed:",
      e instanceof Error ? e.message : e
    );
  }
  try {
    await shutdownWebhookDeliveryWorker();
  } catch (e) {
    console.error(
      "[notificationJobs] webhook worker shutdown failed:",
      e instanceof Error ? e.message : e
    );
  }
  // Section-12 adds: try { await shutdownRetentionJob(); } catch (e) { ... }
}
