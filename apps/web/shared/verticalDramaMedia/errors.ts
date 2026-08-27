import { mediaErrorCodeSchema, VERTICAL_DRAMA_MEDIA_CONTRACT_VERSION } from "./contracts";
import { z } from "zod";

export const verticalDramaMediaErrorSchema = z.object({
  code: mediaErrorCodeSchema,
  messageKey: z.string().trim().min(1).max(160),
  contractVersion: z.literal(VERTICAL_DRAMA_MEDIA_CONTRACT_VERSION),
  retryable: z.boolean(),
  requestId: z.string().trim().min(1).max(128),
}).strict();

export function createVerticalDramaMediaError(code: z.infer<typeof mediaErrorCodeSchema>, requestId: string, retryable = false) {
  return verticalDramaMediaErrorSchema.parse({ code, messageKey: `verticalDramaMedia.${code}`, contractVersion: VERTICAL_DRAMA_MEDIA_CONTRACT_VERSION, retryable, requestId });
}
