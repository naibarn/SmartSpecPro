import { TRPCError } from "@trpc/server";

export type MarketplaceAutoReviewPublishFormat = "photo" | "reels";
export type MarketplaceAutoReviewPublishJobPurpose = "publish" | "resume";

/**
 * Build bounded control-plane keys from the intent hash. The hash already
 * binds tenant, run, target Page and publication content.
 */
export function buildMarketplaceAutoReviewPublishJobKeys(input: {
  format: MarketplaceAutoReviewPublishFormat;
  intentHash: string;
  attempt: number;
  purpose: MarketplaceAutoReviewPublishJobPurpose;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.intentHash) || !Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new Error("MARKETPLACE_PUBLISH_JOB_KEY_INPUT_INVALID");
  }

  const prefix = `marketplace-${input.format}`;
  return {
    idempotencyKey: `${prefix}:${input.intentHash}:${input.purpose}:${input.attempt}`,
    activeDedupeKey: `${prefix}:${input.intentHash}`,
  };
}

export function parseMarketplaceAutoReviewScheduledAt(value?: string | null): Date | null {
  if (!value) return null;
  const scheduledAt = new Date(value);
  if (!Number.isFinite(scheduledAt.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "SCHEDULED_AT_INVALID: กำหนดวันเวลาโพสต์ไม่ถูกต้อง" });
  }
  const now = Date.now();
  if (scheduledAt.getTime() < now + 10 * 60_000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "SCHEDULED_AT_TOO_SOON: ตั้งเวลาโพสต์ล่วงหน้าอย่างน้อย 10 นาที" });
  }
  if (scheduledAt.getTime() > now + 30 * 24 * 60 * 60_000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "SCHEDULED_AT_TOO_LATE: ตั้งเวลาโพสต์ล่วงหน้าได้ไม่เกิน 30 วัน" });
  }
  return scheduledAt;
}
