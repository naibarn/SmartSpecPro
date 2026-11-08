import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  VerticalDramaDetectedShotPerson,
  VerticalDramaShotSpeakerSuggestion,
} from "@shared/verticalDramaSeries/speakerVisualBinding";

export const VERTICAL_DRAMA_SPEAKER_PEOPLE_DETECTION_JOB_TYPE =
  "vertical_drama.speaker_people_detection";
export const VERTICAL_DRAMA_SPEAKER_PEOPLE_DETECTION_CONTRACT =
  "feature-186-v1";

export const verticalDramaSpeakerPeopleDetectionJobPayloadSchema = z
  .object({
    seriesId: z.number().int().positive(),
    episodeId: z.number().int().positive(),
    shotNumber: z.number().int().positive(),
    sourceMediaAssetId: z
      .string()
      .trim()
      .regex(/^[1-9]\d{0,17}$/),
    speakers: z
      .array(
        z
          .object({
            speakerLabel: z.string().trim().min(1).max(120),
          })
          .strict()
      )
      .max(12),
    publicUrl: z.string().url().nullable().optional(),
  })
  .strict();

export const verticalDramaSpeakerPeopleDetectionResultSchema = z
  .object({
    people: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            boundingBox: z
              .object({
                x: z.number().min(0).max(1),
                y: z.number().min(0).max(1),
                width: z.number().gt(0).max(1),
                height: z.number().gt(0).max(1),
              })
              .strict(),
            appearance: z.string().max(240),
            confidence: z.number().min(0).max(1),
          })
          .strict()
      )
      .max(16),
    suggestions: z
      .array(
        z
          .object({
            speakerLabel: z.string().min(1).max(120),
            personId: z.string().min(1).max(64),
            confidence: z.number().min(0).max(1),
          })
          .strict()
      )
      .max(12),
    creditsUsed: z.number().nonnegative(),
    model: z.string(),
    sourceMediaAssetId: z.string().min(1).max(128),
    appearanceProfileStatus: z.enum([
      "built",
      "reused",
      "incomplete",
      "no_cast_references",
    ]),
    appearanceProfileShotCount: z.number().int().nonnegative(),
    appearanceProfileTotalShotCount: z.number().int().nonnegative(),
    appearanceProfileSkippedShotNumbers: z.array(z.number().int().positive()),
    attributionIssue: z.string().optional(),
  })
  .strict();

export type VerticalDramaSpeakerPeopleDetectionJobPayload = z.infer<
  typeof verticalDramaSpeakerPeopleDetectionJobPayloadSchema
>;
export type VerticalDramaSpeakerPeopleDetectionResult = z.infer<
  typeof verticalDramaSpeakerPeopleDetectionResultSchema
> & {
  people: VerticalDramaDetectedShotPerson[];
  suggestions: VerticalDramaShotSpeakerSuggestion[];
};

export function createVerticalDramaSpeakerPeopleDetectionDedupeKey(input: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  sourceMediaAssetId: string;
  speakers: Array<{ speakerLabel: string }>;
}): string {
  const speakerLabels = input.speakers
    .map(speaker =>
      speaker.speakerLabel.trim().toLocaleLowerCase().replace(/\s+/g, " ")
    )
    .sort();
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: input.tenantId,
        userId: input.userId,
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        shotNumber: input.shotNumber,
        sourceMediaAssetId: input.sourceMediaAssetId,
        speakerLabels,
      })
    )
    .digest("hex");
  return `vd-speaker-people:${digest}`;
}
