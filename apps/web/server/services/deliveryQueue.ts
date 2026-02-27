/**
 * Delivery Queue — BullMQ-based outbound message delivery.
 *
 * Stub for section-05 (channel gateway). Full implementation in section-06.
 */

import type { DeliveryJob } from "@shared/channelTypes";

/**
 * Enqueue a delivery job for outbound Telegram message.
 * Section-06 replaces this stub with BullMQ implementation.
 */
export async function enqueueDelivery(job: DeliveryJob): Promise<void> {
  console.info(
    "[DeliveryQueue] Enqueue (stub):",
    job.channelMessageId,
    "→",
    job.chatId,
  );
}
