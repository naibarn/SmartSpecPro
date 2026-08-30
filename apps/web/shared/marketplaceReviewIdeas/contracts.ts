import { z } from "zod";
import { footageGuideSchema } from "../verticalDramaMedia/contracts";

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const marketplaceReviewIdeaInputSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  product: z.object({
    productId: boundedText(128),
    name: boundedText(255),
    brand: z.string().trim().max(255).optional(),
    category: z.string().trim().max(255).optional(),
    description: z.string().trim().max(8000).optional(),
    specs: z.record(z.string(), z.unknown()).optional(),
    customerJourney: z.unknown().optional(),
    sourceClaims: z
      .array(z.string().trim().min(1).max(500))
      .max(40)
      .default([]),
  }),
  productImages: z
    .array(
      z.object({
        mediaAssetId: boundedText(128).optional(),
        imageId: boundedText(128).optional(),
        url: boundedText(2000),
        label: z.string().trim().max(255).optional(),
      })
    )
    .min(1)
    .max(5),
  series: z.object({
    seriesId: boundedText(128),
    title: z.string().trim().max(255).optional(),
    genre: z.string().trim().max(255).optional(),
    tone: z.string().trim().max(1000).optional(),
    continuity: z.string().trim().max(6000).optional(),
  }),
  dialogueMode: z.enum(["none", "character_dialogue"]),
  /** Character IDs explicitly selected by the user for this idea run. */
  selectedCharacterIds: z.array(boundedText(128)).min(1).max(4),
  /** Names that must not be introduced as characters in the generated story. */
  excludedCharacterNames: z
    .array(boundedText(255))
    .max(100)
    .default([]),
  characters: z
    .array(
      z.object({
        characterId: boundedText(128),
        name: boundedText(255),
        role: z.string().trim().max(255).optional(),
        dna: z.record(z.string(), z.unknown()).optional(),
        relationships: z
          .array(z.string().trim().min(1).max(1000))
          .max(20)
          .default([]),
        availableLooks: z
          .array(z.string().trim().min(1).max(255))
          .max(30)
          .default([]),
      })
    )
    .max(4)
    .default([]),
  customerJourney: z.unknown().optional(),
  /** Worker-produced evidence used to keep the story compatible with real footage. */
  footageGuide: footageGuideSchema.optional(),
  direction: z.string().trim().max(2000).optional(),
  /** Optional admin-recommended LLM override; omitted means automatic selection. */
  llmModelId: z.string().trim().min(1).max(160).optional(),
  variationSeed: boundedText(128),
});

export const marketplaceReviewIdeaSchema = z.object({
  ideaId: boundedText(128),
  title: boundedText(255),
  logline: boundedText(2000),
  episodeStory: boundedText(12000),
  dialogueScript: z.string().trim().max(12000),
  storyFunction: boundedText(2000),
  scene: z.object({
    location: boundedText(1000),
    time: z.string().trim().max(255).optional(),
    atmosphere: boundedText(1000),
    beats: z.array(boundedText(2000)).min(2).max(8),
  }),
  productMentionReason: boundedText(2000),
  dialogue: z
    .array(
      z.object({
        speaker: boundedText(255),
        line: boundedText(2000),
        delivery: z.string().trim().max(500).optional(),
      })
    )
    .max(12),
  actions: z.array(boundedText(1000)).min(1).max(12),
  benefitsMentioned: z.array(boundedText(500)).max(8).default([]),
  claimsGuard: z.object({
    allowed: z.array(boundedText(500)).max(12).default([]),
    prohibited: z.array(boundedText(500)).max(20).default([]),
    notes: z.array(boundedText(1000)).max(12).default([]),
  }),
  continuity: z.object({
    dnaKept: z.array(boundedText(500)).max(12).default([]),
    relationshipBeat: boundedText(1500),
    toneFit: boundedText(1000),
  }),
  lookSlotRequests: z
    .array(
      z.object({
        characterId: boundedText(128),
        lookLabel: boundedText(255),
        reason: boundedText(1000),
        dnaConstraints: z.array(boundedText(500)).max(12).default([]),
      })
    )
    .max(4)
    .default([]),
  sceneSlotRequests: z
    .array(
      z.object({
        sceneLabel: boundedText(255),
        description: boundedText(2000),
        reason: boundedText(1000),
      })
    )
    .max(4)
    .default([]),
});

export const marketplaceReviewIdeaOutputSchema = z.object({
  schemaVersion: z.literal(1),
  ideas: z.array(marketplaceReviewIdeaSchema).length(3),
});

export type MarketplaceReviewIdeaInput = z.infer<
  typeof marketplaceReviewIdeaInputSchema
>;
export type MarketplaceReviewIdea = z.infer<typeof marketplaceReviewIdeaSchema>;
export type MarketplaceReviewIdeaOutput = z.infer<
  typeof marketplaceReviewIdeaOutputSchema
>;
