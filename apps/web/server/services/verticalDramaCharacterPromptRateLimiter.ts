import { createRateLimiter } from "./rateLimiterCore";

/**
 * Admission limiter for the LLM prompt-preview lane.
 *
 * This deliberately lives outside the shared media-generation bucket: image
 * renders, storyboard work, and video prompt packs must not consume the
 * admission budget for a character prompt job. Provider-level in-flight
 * capacity is handled separately by the durable BullMQ retry path.
 */
export const verticalDramaCharacterPromptLimiter = createRateLimiter(
  "vertical-drama-character-prompt",
  {
    windowMs: 300000,
    maxRequests: 60,
    blockDurationMs: 120000,
  },
);
