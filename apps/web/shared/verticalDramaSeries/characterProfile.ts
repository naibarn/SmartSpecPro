import { z } from "zod";
import { speechProfileSchema } from "./speechProfile";
import { verticalDramaConsistencyLedgerSchema } from "./consistencyLedger";
import {
  narrativeRoleSchema,
  roleProvenanceSchema,
  roleReviewStatusSchema,
  roleTierSchema,
  roleVisualIntentSchema,
} from "./narrativeRole";

const boundedDnaText = z.string().trim().min(1).max(1_000);
const boundedDnaList = z.array(boundedDnaText).max(12);
const distinctDnaDimensionList = (minimum: number) =>
  boundedDnaList.min(minimum).superRefine((dimensions, ctx) => {
    const normalized = dimensions.map(dimension => dimension.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Anti-clone dimensions must be materially distinct, not repeated labels.",
      });
    }
  });

export const verticalDramaCharacterNarrativeRoleFieldsSchema = z.object({
  narrativeRole: narrativeRoleSchema.nullable().optional(),
  roleTier: roleTierSchema.nullable().optional(),
  occupation: z.string().trim().max(160).nullable().optional(),
  roleVisualIntent: roleVisualIntentSchema.nullable().optional(),
  roleProvenance: roleProvenanceSchema.nullable().optional(),
  roleReviewStatus: roleReviewStatusSchema.nullable().optional(),
});

export const verticalDramaCharacterDesignDnaSchema = z
  .object({
    version: z.literal(1).default(1),
    designIntent: boundedDnaText,
    seriesDnaAlignment: boundedDnaList.min(1),
    roleTier: z.enum([
      "child",
      "lead_female",
      "lead_male",
      "lead",
      "villain_female",
      "villain_male",
      "villain",
      "second_lead",
      "support",
      "other",
    ]),
    beautyArchetype: boundedDnaText,
    ageRange: boundedDnaText,
    faceIdentity: z.object({
      facialGeometry: boundedDnaText,
      eyesAndGaze: boundedDnaText,
      brows: boundedDnaText,
      nose: boundedDnaText,
      lipsAndSmile: boundedDnaText,
      skinAndTexture: boundedDnaText,
      hair: boundedDnaText,
      distinctiveAsymmetry: boundedDnaText,
    }),
    bodyLanguage: z.object({
      posture: boundedDnaText,
      gesturePattern: boundedDnaText,
      movementRhythm: boundedDnaText,
      tensionTell: boundedDnaText,
    }),
    recallStack: z.object({
      face: boundedDnaText,
      silhouette: boundedDnaText,
      color: boundedDnaText,
      behavior: boundedDnaText,
      emotionalHook: boundedDnaText,
    }),
    costumeGrammar: boundedDnaText,
    publicMask: boundedDnaText,
    hiddenTruth: boundedDnaText,
    narrativePromise: boundedDnaText,
    attractiveContradiction: boundedDnaText,
    forbiddenDrift: boundedDnaList.min(1),
    antiCloneChecks: z.object({
      distinctFacialDimensions: distinctDnaDimensionList(3),
      distinctHairDimensions: distinctDnaDimensionList(2),
      distinctBodyLanguageDimensions: distinctDnaDimensionList(2),
      signatureDifference: boundedDnaText,
    }),
    scores: z.object({
      storyFit: z.number().min(0).max(10),
      screenPresence: z.number().min(0).max(10),
      emotionalReadability: z.number().min(0).max(10),
      ensembleContrast: z.number().min(0).max(10),
      crossSeriesUniqueness: z.number().min(0).max(20),
      thresholdStatus: z.enum(["pass", "redesign_required", "provisional"]),
      rationale: boundedDnaText,
    }),
    comparisonEvidence: z.object({
      // Fixed methodology constant (3 reference comparison directions), never
      // the portrait batch size — defensively coerce a mis-reported count back
      // to 3 (see the matching note in verticalDramaCharacterImageGeneration.ts's
      // `characterDesignDnaOutputSchema`; a 5-candidate batch made the model
      // report `5` here and hard-fail).
      candidateDirectionCount: z.literal(3).catch(3),
      currentCastCompared: z.number().int().min(0).max(29),
      recentSeriesCompared: z.number().int().min(0).max(5),
      priorLeadDnaCompared: z.number().int().min(0).max(10),
      historyCompleteness: z.enum(["structured", "partial", "none"]),
    }),
  })
  .superRefine((dna, ctx) => {
    const isAdultLead = new Set(["lead_female", "lead_male", "lead"]).has(
      dna.roleTier
    );
    if (!isAdultLead) return;
    if (
      dna.comparisonEvidence.historyCompleteness !== "structured" &&
      dna.scores.thresholdStatus === "pass"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scores", "thresholdStatus"],
        message:
          "An adult lead without structured history must remain provisional or require redesign.",
      });
      return;
    }
    if (dna.scores.thresholdStatus !== "pass") return;
    const scoreEntries = [
      ["storyFit", dna.scores.storyFit],
      ["screenPresence", dna.scores.screenPresence],
      ["emotionalReadability", dna.scores.emotionalReadability],
      ["ensembleContrast", dna.scores.ensembleContrast],
    ] as const;
    for (const [field, score] of scoreEntries) {
      if (score < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scores", field],
          message: "A passing adult lead design requires every core score to be at least 8.",
        });
      }
    }
    if (
      dna.comparisonEvidence.historyCompleteness === "structured" &&
      dna.scores.crossSeriesUniqueness < 16
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scores", "crossSeriesUniqueness"],
        message: "A passing adult lead with structured history requires uniqueness of at least 16.",
      });
    }
  });

const verticalDramaCharacterDesignCastEntrySchema = z.object({
  characterId: z.number().int().positive(),
  characterKey: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  role: z.string().trim().max(100).nullable(),
  relationshipKind: z.enum([
    "target",
    "distinct_person",
    "same_person_variant",
    "face_linked_twin",
  ]),
  visualSummary: boundedDnaText.optional(),
  designDna: verticalDramaCharacterDesignDnaSchema.optional(),
});

export const verticalDramaCharacterDesignContextSchema = z
  .object({
    seriesDna: z.object({
      title: z.string().trim().min(1).max(255),
      genre: z.string().trim().max(100).nullable().optional(),
      tone: z.string().trim().max(100).nullable().optional(),
      locale: z.string().trim().max(32).nullable().optional(),
      targetAudience: z.string().trim().max(200).nullable().optional(),
      dialogueLanguage: boundedDnaText.optional(),
      storyWorld: boundedDnaText,
      emotionalEngine: boundedDnaText,
      visualCulture: boundedDnaText,
      realismLevel: boundedDnaText,
      beautyDirection: boundedDnaText,
      dominantColors: boundedDnaList,
      signatureMotifs: boundedDnaList,
      prohibitedRepetition: boundedDnaList,
    }),
    archiveStatus: z.enum(["available", "unavailable"]),
    currentCast: z.array(verticalDramaCharacterDesignCastEntrySchema).max(30),
    recentLeadArchive: z
      .array(
        z.object({
          seriesId: z.number().int().positive(),
          title: z.string().trim().min(1).max(255),
          genre: z.string().trim().max(100).nullable(),
          tone: z.string().trim().max(100).nullable(),
          leads: z.array(verticalDramaCharacterDesignCastEntrySchema).min(1).max(2),
        })
      )
      .max(5),
    approvedDesignDna: verticalDramaCharacterDesignDnaSchema.optional(),
  })
  .superRefine((context, ctx) => {
    if (
      context.archiveStatus === "unavailable" &&
      context.recentLeadArchive.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recentLeadArchive"],
        message: "An unavailable archive cannot carry historical lead evidence.",
      });
    }
  });

export const verticalDramaApprovedCharacterVisualBibleSchema = z
  .object({
    version: z.number().int().positive(),
    createdAt: z.string().trim().min(1).max(64),
    model: z.string().trim().min(1).max(255),
    visualIdentitySummary: z.string().trim().min(1).max(2_000),
    identityAnchors: z.array(boundedDnaText).max(12),
    signatureWardrobe: z.string().trim().min(1).max(2_000),
    hairMakeupNotes: z.string().trim().min(1).max(2_000),
    performanceEnergy: z.string().trim().min(1).max(2_000),
    consistencyStrategy: z.string().trim().min(1).max(4_000),
    signatureVisualCues: z.array(boundedDnaText).max(12),
    colorPalette: z.string().trim().min(1).max(2_000),
    storyWorldRelationship: z.string().trim().min(1).max(4_000),
    forbiddenDrift: z.array(boundedDnaText).max(12),
    emotionalRangeNeeded: z.array(boundedDnaText).max(12),
    ageRange: z.string().trim().min(1).max(255),
    eraStyling: z.string().trim().min(1).max(1_000).optional(),
    audienceAppealNotes: z.string().trim().min(1).max(2_000).optional(),
    promptContractVersion: z.string().trim().max(80).optional(),
    promptProfile: z.enum(["rich", "compact", "legacy"]).optional(),
    castingPreferencesFingerprint: z.string().trim().max(1_000).optional(),
    // Bounded planning retry count carried with the approved snapshot so
    // later paid renders can report the same prompt-generation diagnostics.
    semanticRetryCount: z.number().int().min(0).max(8).optional(),
    designDna: verticalDramaCharacterDesignDnaSchema,
  })
  .strict();

/**
 * Browser round-trip contract for an unedited prompt preview. This is
 * intentionally much stricter and more tightly bounded than the legacy
 * persisted visual-bible reader above; arbitrary character `data` cannot be
 * smuggled back through the confirmation mutation.
 */
export const verticalDramaApprovedCharacterDesignSnapshotSchema = z
  .object({
    characterKey: z.string().trim().min(1).max(64),
    portraitPrompt: z.string().trim().min(1).max(20_000),
    negativePrompt: z.string().trim().max(3_500).optional(),
    promptContractVersion: z.string().trim().max(80).optional(),
    promptProfile: z.enum(["rich", "compact", "legacy"]).optional(),
    visualBible: verticalDramaApprovedCharacterVisualBibleSchema,
  })
  .strict();

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
    identityDnaRevision: z.number().int().positive().optional(),
    identityDnaSource: z.enum(["ai_generated", "user_edited"]).optional(),
    identityDnaUpdatedAt: z.string().min(1).optional(),
    promptDnaRevision: z.number().int().positive().optional(),
    eraStyling: z.string().min(1).optional(),
    audienceAppealNotes: z.string().min(1).optional(),
    designDna: verticalDramaCharacterDesignDnaSchema.optional(),
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
export type VerticalDramaCharacterDesignDna = z.infer<
  typeof verticalDramaCharacterDesignDnaSchema
>;
export type VerticalDramaCharacterDesignContext = z.infer<
  typeof verticalDramaCharacterDesignContextSchema
>;
export type VerticalDramaApprovedCharacterDesignSnapshot = z.infer<
  typeof verticalDramaApprovedCharacterDesignSnapshotSchema
>;
export type VerticalDramaApprovedCharacterVisualBible = z.infer<
  typeof verticalDramaApprovedCharacterVisualBibleSchema
>;
export type VerticalDramaCharacterVisualBible = z.infer<
  typeof verticalDramaCharacterVisualBibleSchema
>;
export type VerticalDramaCharacterTypedData = z.infer<
  typeof verticalDramaCharacterTypedDataSchema
>;
