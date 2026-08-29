import { z } from "zod";

export const verticalDramaEpisodeKindSchema = z.enum(["normal", "special_tie_in"]);
export type VerticalDramaEpisodeKind = z.infer<typeof verticalDramaEpisodeKindSchema>;

export const SPECIAL_TIE_IN_DURATIONS_SECONDS = [8, 10, 12, 15, 20, 24, 30] as const;
export type SpecialTieInDurationSeconds = (typeof SPECIAL_TIE_IN_DURATIONS_SECONDS)[number];

const referenceImageSchema = z.object({
  mediaAssetId: z.string().min(1).max(128),
  source: z.enum(["upload", "marketplace_capture", "series_asset"]),
  label: z.string().trim().max(255).optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

export const specialTieInInputSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  idea: z.string().trim().min(1).max(5_000),
  referenceType: z.enum(["product", "location", "store", "mixed"]),
  referenceImages: z.array(referenceImageSchema).min(1).max(3).refine(values => new Set(values.map(value => value.mediaAssetId)).size === values.length, "Reference images must be unique"),
  characterIds: z.array(z.string().min(1).max(128)).max(4).refine(values => new Set(values).size === values.length, "Characters must be unique").default([]),
  durationSeconds: z.union([z.literal(8), z.literal(10), z.literal(12), z.literal(15), z.literal(20), z.literal(24), z.literal(30)]).default(10),
  aspectRatio: z.literal("9:16").default("9:16"),
  imageModelId: z.string().trim().min(1).max(160),
  videoModelId: z.string().trim().min(1).max(160),
  dialogueMode: z.enum(["none", "character_dialogue"]),
  dialogueBrief: z.string().trim().max(3_000).optional(),
  speakerCharacterIds: z.array(z.string().min(1).max(128)).max(3).default([]),
  allowAdditionalCharacters: z.boolean().default(false),
  lockCharacterReferences: z.boolean().default(true),
  lockReferenceImages: z.boolean().default(true),
}).superRefine((value, ctx) => {
  const characterIds = new Set(value.characterIds);
  if (value.speakerCharacterIds.some(id => !characterIds.has(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["speakerCharacterIds"], message: "Speakers must be selected characters" });
  }
  if (value.dialogueMode === "none" && value.speakerCharacterIds.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["speakerCharacterIds"], message: "Speakers are not allowed when dialogue is disabled" });
  }
});

export type SpecialTieInInput = z.infer<typeof specialTieInInputSchema>;
export type SpecialModelSnapshot = {
  modelId: string; label?: string; provider: string; providerModel: string; catalogVersion: string;
  supportedDurationsSeconds: number[]; supportedAspectRatios: string[];
  supportsReferenceConditioning: boolean; supportsDialogueAudio: boolean;
};
export type SpecialSkillRun = {
  schemaVersion: 1; skillId: "idea-to-video-prompt";
  status: "queued" | "running" | "succeeded" | "needs_clarification" | "failed";
  idempotencyKey: string; inputFingerprint: string; attempt: number;
  errorCode?: string; errorMessage?: string; startedAt?: string; completedAt?: string;
};
export type SpecialReferenceBinding = {
  skillReferenceId: string; role: "person" | "product" | "location" | "store";
  mediaAssetId: string; provenance: Record<string, unknown>;
};
export type SpecialEpisodeData = {
  schemaVersion: 1; createIntentId: string; inputVersion: number; outputVersion: number;
  input: SpecialTieInInput; skillRun: SpecialSkillRun;
  referenceBindings: SpecialReferenceBinding[];
  modelSnapshots: { image: SpecialModelSnapshot; video: SpecialModelSnapshot };
  output?: { shotCount: number; assumptions?: string[]; qualityControl?: unknown };
};
export type SpecialTieInShotContract = {
  shotNumber: number; durationSeconds: SpecialTieInDurationSeconds;
  imagePrompt: string; videoPrompt: string; referenceIds: string[];
};
export type VerticalDramaEpisodeShotContract = {
  kind: VerticalDramaEpisodeKind; shotCount: number; clipCount: number; fixedNormalShape: boolean;
};
export function resolveVerticalDramaEpisodeShotContract(kind: VerticalDramaEpisodeKind | null | undefined, shotCount?: number): VerticalDramaEpisodeShotContract {
  if (kind === "special_tie_in") {
    const count = Math.max(1, Math.min(5, Math.trunc(shotCount ?? 1)));
    return { kind, shotCount: count, clipCount: count, fixedNormalShape: false };
  }
  return { kind: "normal", shotCount: 9, clipCount: 8, fixedNormalShape: true };
}
export function isSpecialEpisodeKind(value: unknown): value is "special_tie_in" { return value === "special_tie_in"; }
