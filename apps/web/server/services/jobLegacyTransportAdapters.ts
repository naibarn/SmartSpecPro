import type { Queue } from "bullmq";

import type { WebhookDispatchJob } from "./webhookDispatchQueue";

/**
 * Compatibility-only transport publication. Business producers must call the
 * control-plane gateway; this module is the sole legacy submission boundary
 * for the webhook-dispatch drain path.
 */
export async function publishLegacyWebhookDispatch(
  queue: Pick<Queue<WebhookDispatchJob>, "add">,
  job: WebhookDispatchJob,
): Promise<void> {
  const jobId = `wh-${job.triggerId}-${job.requestBodyHash}-${job.startTime}`;
  await queue.add("dispatch", job, { jobId });
}

/**
 * Compatibility-only BullMQ calls for job families that have not completed
 * their control-plane migration. Keeping these calls in the adapter module
 * makes the transport boundary explicit and lets the producer audit detect
 * new direct submissions outside the compatibility layer.
 */
export async function publishLegacyBullMqJob(
  queue: Pick<Queue, "add">,
  ...args: Parameters<Queue["add"]>
): Promise<void> {
  await queue.add(...args);
}

export async function upsertLegacyBullMqScheduler(
  queue: Pick<Queue, "upsertJobScheduler">,
  ...args: Parameters<Queue["upsertJobScheduler"]>
): Promise<void> {
  await queue.upsertJobScheduler(...args);
}
