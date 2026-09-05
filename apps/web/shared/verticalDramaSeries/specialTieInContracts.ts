import { z } from "zod";
import { marketplaceReviewIdeaSchema } from "../marketplaceReviewIdeas/contracts";
import { footageGuideSchema } from "../verticalDramaMedia/contracts";
import {
  footageBrollPlacementSchema,
  mediaSourceManifestSchema,
} from "../verticalDramaMedia/contracts";

export const verticalDramaEpisodeKindSchema = z.enum([
  "normal",
  "special_tie_in",
]);
export type VerticalDramaEpisodeKind = z.infer<
  typeof verticalDramaEpisodeKindSchema
>;

export const SPECIAL_TIE_IN_DURATIONS_SECONDS = [
  8, 10, 12, 15, 20, 24, 30,
] as const;
export type SpecialTieInDurationSeconds =
  (typeof SPECIAL_TIE_IN_DURATIONS_SECONDS)[number];

const referenceImageSchema = z.object({
  mediaAssetId: z.string().min(1).max(128),
  source: z.enum(["upload", "marketplace_capture", "series_asset"]),
  role: z.enum(["product", "location", "store"]).optional(),
  label: z.string().trim().max(255).optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

export const specialTieInInputSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    idea: z.string().trim().min(1).max(12_000),
    referenceType: z.enum(["product", "location", "store", "mixed"]),
    referenceImages: z
      .array(referenceImageSchema)
      .min(1)
      .max(3)
      .refine(
        values =>
          new Set(values.map(value => value.mediaAssetId)).size ===
          values.length,
        "Reference images must be unique"
      ),
    characterIds: z
      .array(z.string().min(1).max(128))
      .max(4)
      .refine(
        values => new Set(values).size === values.length,
        "Characters must be unique"
      )
      .default([]),
    durationSeconds: z
      .union([
        z.literal(8),
        z.literal(10),
        z.literal(12),
        z.literal(15),
        z.literal(20),
        z.literal(24),
        z.literal(30),
      ])
      .default(10),
    aspectRatio: z.literal("9:16").default("9:16"),
    imageModelId: z.string().trim().min(1).max(160),
    videoModelId: z.string().trim().min(1).max(160),
    dialogueMode: z.enum(["none", "character_dialogue"]),
    dialogueBrief: z.string().trim().max(12_000).optional(),
    speakerCharacterIds: z.array(z.string().min(1).max(128)).max(3).default([]),
    /** Structured nine-shot dialogue selected/reviewed in the idea dialog.
     * Optional only for legacy/manual inputs; selected Marketplace ideas and
     * all new character-dialogue submissions must provide it at the service
     * gate before episode allocation. */
    shotDialogues: z
      .array(
        z.object({
          shotNumber: z.number().int().min(1).max(9),
          dialogueLines: z
            .array(
              z.object({
                speakerCharacterId: z.string().min(1).max(128),
                line: z.string().trim().min(1).max(2_000),
                delivery: z.string().trim().max(500).optional(),
              })
            )
            .max(3),
        })
      )
      .length(9)
      .optional(),
    allowAdditionalCharacters: z.boolean().default(false),
    lockCharacterReferences: z.boolean().default(true),
    lockReferenceImages: z.boolean().default(true),
    /** Canonical series scene selected during near-duplicate review. */
    sceneLocationKey: z.string().trim().min(1).max(64).optional(),
    marketplaceReviewIdea: marketplaceReviewIdeaSchema.optional(),
    footage: z
      .object({
        sourceMediaAssetId: z.string().min(1).max(160),
        analysisJobId: z.string().min(1).max(160),
        prepareJobId: z.string().min(1).max(160),
        sourceRevision: z.string().min(1).max(160),
        guide: footageGuideSchema,
      })
      .strict()
      .optional(),
    broll: z.object({
      preparedSource: mediaSourceManifestSchema,
      preparedRevision: z.string().min(1).max(160),
      baseDurationMs: z.number().int().positive().max(90_000),
      placements: z.array(footageBrollPlacementSchema).max(32),
      storyRevisionId: z.string().min(1).max(160),
      shotPlanRevisionId: z.string().min(1).max(160),
      assetManifest: z.array(mediaSourceManifestSchema).max(64),
      renderJobId: z.string().min(1).max(128).optional(),
    }).strict().optional(),
  })
  .superRefine((value, ctx) => {
    const characterIds = new Set(value.characterIds);
    if (value.speakerCharacterIds.some(id => !characterIds.has(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["speakerCharacterIds"],
        message: "Speakers must be selected characters",
      });
    }
    if (value.dialogueMode === "none" && value.speakerCharacterIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["speakerCharacterIds"],
        message: "Speakers are not allowed when dialogue is disabled",
      });
    }
    if (
      value.dialogueMode === "none" &&
      value.shotDialogues?.some(shot => shot.dialogueLines.length > 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shotDialogues"],
        message: "Silent episodes must not contain shot dialogue",
      });
    }
    if (value.shotDialogues) {
      value.shotDialogues.forEach((shot, index) => {
        if (shot.shotNumber !== index + 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shotDialogues", index, "shotNumber"],
            message: "Shot dialogue entries must be ordered from 1 to 9",
          });
        }
        if (
          value.dialogueMode === "character_dialogue" &&
          shot.dialogueLines.length === 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shotDialogues", index, "dialogueLines"],
            message: "Every speaking-mode shot must contain dialogue",
          });
        }
        for (const line of shot.dialogueLines) {
          if (!value.speakerCharacterIds.includes(line.speakerCharacterId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shotDialogues", index, "dialogueLines"],
              message: "Shot dialogue speakers must be selected speakers",
            });
          }
        }
      });
    }
    if (
      value.dialogueMode === "character_dialogue" &&
      value.speakerCharacterIds.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["speakerCharacterIds"],
        message: "At least one speaker is required when dialogue is enabled",
      });
    }
  });

export type SpecialTieInInput = z.infer<typeof specialTieInInputSchema>;
export type SpecialModelSnapshot = {
  modelId: string;
  label?: string;
  provider: string;
  providerModel: string;
  catalogVersion: string;
  supportedDurationsSeconds: number[];
  supportedAspectRatios: string[];
  supportsReferenceConditioning: boolean;
  maxReferenceImages?: number;
  supportsDialogueAudio: boolean;
};
export type SpecialSkillRun = {
  schemaVersion: 1;
  skillId: "idea-to-video-prompt";
  status: "queued" | "running" | "succeeded" | "needs_clarification" | "failed";
  idempotencyKey: string;
  inputFingerprint: string;
  attempt: number;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
};
export type SpecialReferenceBinding = {
  skillReferenceId: string;
  role: "person" | "product" | "location" | "store";
  mediaAssetId: string;
  provenance: Record<string, unknown>;
};
export type SpecialEpisodeData = {
  schemaVersion: 1;
  createIntentId: string;
  inputVersion: number;
  outputVersion: number;
  input: SpecialTieInInput;
  skillRun: SpecialSkillRun;
  referenceBindings: SpecialReferenceBinding[];
  modelSnapshots: { image: SpecialModelSnapshot; video: SpecialModelSnapshot };
  output?: {
    shotCount: number;
    /** Materialized story-first beats used by the existing prompt consumers. */
    storySummaries?: Array<{
      shotNumber: number;
      summary: string;
    }>;
    /** Structured dialogue projection retained for review, repair, and the
     * normal dialogue/audio prompt flow. */
    shotDialogues?: Array<{
      shotNumber: number;
      lines: Array<{
        speakerCharacterKey: string;
        speakerName?: string;
        line: string;
        delivery?: string;
      }>;
    }>;
    assumptions?: string[];
    qualityControl?: unknown;
    source?: "llm" | "deterministic_fallback";
    needsReview?: boolean;
  };
};
export type SpecialTieInShotContract = {
  shotNumber: number;
  durationSeconds: SpecialTieInDurationSeconds;
  imagePrompt: string;
  videoPrompt: string;
  referenceIds: string[];
};
export type VerticalDramaEpisodeShotContract = {
  kind: VerticalDramaEpisodeKind;
  shotCount: number;
  clipCount: number;
  fixedNormalShape: boolean;
};
export function resolveVerticalDramaEpisodeShotContract(
  kind: VerticalDramaEpisodeKind | null | undefined,
  shotCount?: number
): VerticalDramaEpisodeShotContract {
  if (kind === "special_tie_in") {
    return {
      kind,
      shotCount: 9,
      clipCount: 9,
      fixedNormalShape: false,
    };
  }
  return { kind: "normal", shotCount: 9, clipCount: 8, fixedNormalShape: true };
}
export function isSpecialEpisodeKind(
  value: unknown
): value is "special_tie_in" {
  return value === "special_tie_in";
}
