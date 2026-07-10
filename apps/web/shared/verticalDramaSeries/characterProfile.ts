import { z } from "zod";
import { speechProfileSchema } from "./speechProfile";
import { verticalDramaConsistencyLedgerSchema } from "./consistencyLedger";

export const verticalDramaCharacterPersonalitySchema = z
  .object({
    keywords: z.array(z.string().min(1)).min(1),
    emotionalBaseline: z.string().min(1),
    want: z.string().min(1),
    fear: z.string().min(1),
    contradiction: z.string().min(1),
  })
  .passthrough();

export const verticalDramaCharacterVisualBibleSchema = z
  .object({
    version: z.number().int().positive().default(1),
    createdAt: z.string().min(1),
    model: z.string().min(1),
    visualIdentitySummary: z.string().min(1),
    identityAnchors: z.array(z.string().min(1)).default([]),
    signatureWardrobe: z.string().min(1),
    hairMakeupNotes: z.string().min(1),
    performanceEnergy: z.string().min(1),
    consistencyStrategy: z.string().min(1),
    signatureVisualCues: z.array(z.string().min(1)).default([]),
    colorPalette: z.string().min(1),
    storyWorldRelationship: z.string().min(1),
    forbiddenDrift: z.array(z.string().min(1)).default([]),
    emotionalRangeNeeded: z.array(z.string().min(1)).default([]),
    ageRange: z.string().min(1),
    eraStyling: z.string().min(1).optional(),
    audienceAppealNotes: z.string().min(1).optional(),
  })
  .passthrough();

export const verticalDramaCharacterTypedDataSchema = z
  .object({
    personality: verticalDramaCharacterPersonalitySchema.optional(),
    speechProfile: speechProfileSchema.optional(),
    visualBible: verticalDramaCharacterVisualBibleSchema.optional(),
    consistencyLedger: verticalDramaConsistencyLedgerSchema.optional(),
  })
  .passthrough();

export type VerticalDramaCharacterPersonality = z.infer<
  typeof verticalDramaCharacterPersonalitySchema
>;
export type VerticalDramaCharacterVisualBible = z.infer<
  typeof verticalDramaCharacterVisualBibleSchema
>;
export type VerticalDramaCharacterTypedData = z.infer<
  typeof verticalDramaCharacterTypedDataSchema
>;
