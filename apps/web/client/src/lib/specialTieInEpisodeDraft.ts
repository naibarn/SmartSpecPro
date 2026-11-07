import { z } from "zod";
import {
  marketplaceReviewIdeaSchema,
  marketplaceReviewPresentationStylePreferenceSchema,
  marketplaceReviewStoryStructurePreferenceSchema,
  marketplaceReviewSubjectTypeSchema,
} from "@shared/marketplaceReviewIdeas/contracts";
import { footageBrollPlacementSchema } from "@shared/verticalDramaMedia/contracts";

const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const safeReferenceProvenanceSchema = z
  .object({
    source: z.string().max(128).optional(),
    managed: z.boolean().optional(),
    approved: z.boolean().optional(),
    locationId: z
      .union([z.string().max(128), z.number().int().nonnegative()])
      .nullable()
      .optional(),
    locationKey: z.string().max(64).optional(),
    marketplaceProductId: z
      .union([z.string().max(128), z.number().int().nonnegative()])
      .optional(),
    marketplaceImageId: z
      .union([z.string().max(128), z.number().int().nonnegative()])
      .optional(),
    imageType: z.string().max(255).optional(),
    accessType: z.string().max(128).optional(),
  })
  .strip();
const draftEnvelopeSchema = z.object({
  version: z.literal(DRAFT_VERSION),
  savedAt: z.number().int().positive(),
  values: z.object({
    idea: z.string().max(12_000),
    presentationStyle: marketplaceReviewPresentationStylePreferenceSchema,
    reviewSubjectType: marketplaceReviewSubjectTypeSchema,
    storyStructure: marketplaceReviewStoryStructurePreferenceSchema,
    referenceType: z.enum(["product", "location", "store", "mixed"]),
    references: z
      .array(
        z.object({
          mediaAssetId: z.string().min(1).max(128),
          source: z.enum(["upload", "marketplace_capture", "series_asset"]),
          role: z.enum(["product", "location", "store"]).optional(),
          label: z.string().max(255).optional(),
          provenance: safeReferenceProvenanceSchema.optional(),
        })
      )
      .max(3),
    characterIds: z.array(z.string().min(1).max(128)).max(4),
    speakerCharacterIds: z.array(z.string().min(1).max(128)).max(3),
    durationSeconds: z.union([
      z.literal(8),
      z.literal(10),
      z.literal(12),
      z.literal(15),
      z.literal(20),
      z.literal(24),
      z.literal(30),
    ]),
    dialogueMode: z.enum(["none", "character_dialogue"]),
    dialogueBrief: z.string().max(12_000),
    shotDialogueDrafts: z
      .array(
        z.object({
          shotNumber: z.number().int().min(1).max(9),
          dialogueLines: z
            .array(
              z.object({
                speakerCharacterId: z.string().min(1).max(128),
                line: z.string().max(2_000),
                delivery: z.string().max(500).optional(),
              })
            )
            .max(3),
        })
      )
      .max(9),
    allowAdditionalCharacters: z.boolean(),
    lockCharacterReferences: z.boolean(),
    lockReferenceImages: z.boolean(),
    imageModelId: z.string().max(160),
    videoModelId: z.string().max(160),
    ideaLlmModelId: z.string().max(160),
    productQuery: z.string().max(500),
    selectedProductId: z.string().max(128).nullable(),
    pendingImageIds: z.array(z.string().max(128)).max(30),
    selectedLocationId: z.string().max(128).nullable(),
    sceneSuggestions: z
      .array(
        z.object({
          sceneLabel: z.string().max(255),
          description: z.string().max(2_000),
          candidates: z
            .array(
              z.object({
                locationId: z.string().max(128),
                locationKey: z.string().max(64),
                name: z.string().max(255),
                score: z.number().min(0).max(1),
              })
            )
            .max(30),
        })
      )
      .max(30),
    sceneChoiceByLabel: z.record(z.string(), z.string().max(128)),
    selectedSceneLocationKey: z.string().max(64).nullable(),
    selectedIdeaId: z.string().max(128).nullable(),
    selectedMarketplaceIdea: marketplaceReviewIdeaSchema.nullable(),
    footageAssetId: z.number().int().positive().nullable(),
    footageFileName: z.string().max(255),
    footageAnalysisJobId: z.string().max(160).nullable(),
    footagePrepareJobId: z.string().max(160).nullable(),
    footageTrimStartMs: z.number().int().nonnegative(),
    footageTrimEndMs: z.number().int().nonnegative(),
    brollAssetId: z.string().max(160),
    brollStartMs: z.number().int().nonnegative(),
    brollEndMs: z.number().int().nonnegative(),
    brollSourceInMs: z.number().int().nonnegative(),
    brollPlacements: z.array(footageBrollPlacementSchema).max(32),
    brollRenderJobId: z.string().max(128).nullable(),
  }),
});

type ParsedSpecialTieInEpisodeDraftValues = z.infer<
  typeof draftEnvelopeSchema
>["values"];
export type SpecialTieInEpisodeDraftValues = Omit<
  ParsedSpecialTieInEpisodeDraftValues,
  "references"
> & {
  references: Array<
    Omit<ParsedSpecialTieInEpisodeDraftValues["references"][number], "provenance"> & {
      provenance?: Record<string, unknown>;
      previewUrl?: string;
    }
  >;
};
export type SpecialTieInEpisodeDraft = z.infer<typeof draftEnvelopeSchema>;

export type SpecialTieInDraftIdentity = {
  tenantId?: string | number | null;
  userId?: string | number | null;
  seriesId?: string | number | null;
};

export function specialTieInEpisodeDraftKey(
  identity: SpecialTieInDraftIdentity
): string | null {
  const values = [identity.tenantId, identity.userId, identity.seriesId];
  if (values.some(value => value == null || String(value).trim() === ""))
    return null;
  return `smarthub:special-tie-in-draft:v1:${values
    .map(value => encodeURIComponent(String(value)))
    .join(":")}`;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasMeaningfulSpecialTieInDraft(
  values: SpecialTieInEpisodeDraftValues
): boolean {
  return Boolean(
    values.idea.trim() ||
    values.references.length ||
    values.characterIds.length ||
    values.speakerCharacterIds.length ||
    values.dialogueBrief.trim() ||
    values.shotDialogueDrafts.some(shot => shot.dialogueLines.length > 0) ||
    values.selectedProductId ||
    values.pendingImageIds.length ||
    values.selectedLocationId ||
    values.sceneSuggestions.length ||
    values.selectedSceneLocationKey ||
    values.selectedIdeaId ||
    values.selectedMarketplaceIdea ||
    values.footageAssetId ||
    values.footageAnalysisJobId ||
    values.footagePrepareJobId ||
    values.brollAssetId ||
    values.brollPlacements.length ||
    values.brollRenderJobId ||
    values.productQuery.trim() ||
    values.presentationStyle !== "varied" ||
    values.reviewSubjectType !== "product" ||
    values.storyStructure !== "varied" ||
    values.referenceType !== "product" ||
    values.durationSeconds !== 10 ||
    values.dialogueMode !== "character_dialogue" ||
    values.allowAdditionalCharacters ||
    !values.lockCharacterReferences ||
    !values.lockReferenceImages
  );
}

export function readSpecialTieInEpisodeDraft(
  key: string | null,
  storage: Storage | null = browserStorage(),
  now = Date.now()
): SpecialTieInEpisodeDraft | null {
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = draftEnvelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      storage.removeItem(key);
      return null;
    }
    if (
      parsed.data.savedAt > now + 5 * 60 * 1000 ||
      now - parsed.data.savedAt > DRAFT_TTL_MS
    ) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore blocked storage while handling a malformed draft.
    }
    return null;
  }
}

export function writeSpecialTieInEpisodeDraft(
  key: string | null,
  values: SpecialTieInEpisodeDraftValues,
  storage: Storage | null = browserStorage(),
  now = Date.now()
): boolean {
  if (!key || !storage) return false;
  if (!hasMeaningfulSpecialTieInDraft(values)) {
    clearSpecialTieInEpisodeDraft(key, storage);
    return true;
  }
  const parsed = draftEnvelopeSchema.safeParse({
    version: DRAFT_VERSION,
    savedAt: now,
    values,
  });
  if (!parsed.success) return false;
  try {
    storage.setItem(key, JSON.stringify(parsed.data));
    return true;
  } catch {
    // Autosave is best effort and must never block editing or episode creation.
    return false;
  }
}

export function clearSpecialTieInEpisodeDraft(
  key: string | null,
  storage: Storage | null = browserStorage()
): void {
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Storage may be disabled; keep the active form usable.
  }
}
