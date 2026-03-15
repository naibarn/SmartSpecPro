import { z } from "zod";

import type {
  PresentationAIDesignFitScore,
  PresentationAIDesignSourceTrace,
  PresentationComponentListSlotBinding,
  PresentationComponentSlotBinding,
  PresentationComponentTextSlotBinding,
} from "./contracts";
import {
  PRESENTATION_COMPONENT_SLOT_BUDGETS,
  type BuiltInPresentationComponentId,
} from "./componentRecipes";

export const PRESENTATION_RECIPE_COMPACTION_LEVELS = [
  "none",
  "balanced",
  "compact",
  "aggressive",
] as const;

export const presentationRecipeCompactionLevelSchema = z.enum(
  PRESENTATION_RECIPE_COMPACTION_LEVELS,
);

export const PRESENTATION_RECIPE_FIT_THRESHOLDS = {
  accept: 0.78,
  warn: 0.62,
  warnOverflowRisk: 0.45,
  unsafeOverflowRisk: 0.70,
} as const;

export const presentationRecipeCompactionSlotBudgetSchema = z.object({
  slotId: z.string().min(1).max(128),
  role: z.string().min(1).max(64),
  maxChars: z.number().int().positive().max(2_000).optional(),
  maxItems: z.number().int().positive().max(32).optional(),
  preferredLines: z.number().int().positive().max(24).optional(),
}).strict();

export const presentationRecipeCompactionSourceNarrativeSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.array(z.string().min(1).max(500)).min(1).max(16),
  sections: z.array(z.object({
    id: z.string().min(1).max(128),
    heading: z.string().min(1).max(260),
    details: z.array(z.string().min(1).max(500)).max(8),
  }).strict()).max(12).optional(),
}).strict();

export const presentationRecipeCompactionRequestSchema = z.object({
  mode: z.enum(["structured_block", "long_form_block"]),
  recipeId: z.string().min(1).max(128),
  language: z.string().min(1).max(16),
  compactionLevel: presentationRecipeCompactionLevelSchema.exclude(["none"]),
  contentProfile: z.object({
    headingCount: z.number().int().nonnegative(),
    paragraphCount: z.number().int().nonnegative(),
    bulletCount: z.number().int().nonnegative(),
    avgParagraphChars: z.number().nonnegative(),
    maxParagraphChars: z.number().int().nonnegative(),
  }).strict(),
  slotBudgets: z.array(presentationRecipeCompactionSlotBudgetSchema).min(1).max(32),
  qualityThresholds: z.object({
    minFitScore: z.number().finite().min(0).max(1),
    warnOverflowRisk: z.number().finite().min(0).max(1),
    unsafeOverflowRisk: z.number().finite().min(0).max(1),
  }).strict(),
  textPolicy: z.object({
    language: z.string().min(1).max(16),
    preserveFacts: z.boolean(),
    avoidInventingNewClaims: z.boolean(),
    allowAggressiveRewrite: z.boolean(),
  }).strict(),
  sourceNarrative: presentationRecipeCompactionSourceNarrativeSchema,
}).strict();

export const presentationRecipeCompactionSlotContentSchema = z.discriminatedUnion("type", [
  z.object({
    slotId: z.string().min(1).max(128),
    type: z.literal("text"),
    text: z.string().min(1).max(2_000),
  }).strict(),
  z.object({
    slotId: z.string().min(1).max(128),
    type: z.literal("list"),
    items: z.array(z.string().min(1).max(500)).min(1).max(12),
  }).strict(),
]);

export const presentationRecipeCompactionResponseSchema = z.object({
  status: z.enum(["ok", "needs_fallback"]),
  slotContent: z.array(presentationRecipeCompactionSlotContentSchema).max(32),
  sourceTrace: z.array(z.object({
    sourceId: z.string().min(1).max(128),
    disposition: z.enum(["used", "shortened", "omitted", "deferred", "split"]),
    targetSlotId: z.string().min(1).max(128).optional(),
    targetSlideId: z.string().min(1).max(128).optional(),
    notes: z.string().min(1).max(512).optional(),
  }).strict()).max(64),
  overflowRisk: z.number().finite().min(0).max(1),
  fitConfidence: z.number().finite().min(0).max(1),
  fallbackSuggestion: z.object({
    action: z.enum(["switch_recipe", "switch_mode", "split_slide"]),
    reason: z.string().min(1).max(512),
  }).strict().nullable().optional(),
}).strict();

export type PresentationRecipeCompactionLevel = z.infer<
  typeof presentationRecipeCompactionLevelSchema
>;
export type PresentationRecipeCompactionRequest = z.infer<
  typeof presentationRecipeCompactionRequestSchema
>;
export type PresentationRecipeCompactionResponse = z.infer<
  typeof presentationRecipeCompactionResponseSchema
>;

export interface PresentationRecipeSlotFitDetails {
  slotId: string;
  density: number;
  readability: number;
  overflowRisk: number;
  status: PresentationAIDesignFitScore["status"];
}

export interface PresentationRecipeFitEvaluation {
  fitScore: PresentationAIDesignFitScore;
  slotDetails: PresentationRecipeSlotFitDetails[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeBindingText(binding: PresentationComponentTextSlotBinding): string {
  return binding.text.replace(/\s+/g, " ").trim();
}

function listChars(binding: PresentationComponentListSlotBinding): number[] {
  return binding.items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0)
    .map((item) => item.length);
}

function deriveSlotFitStatus(overall: number, overflowRisk: number): PresentationAIDesignFitScore["status"] {
  if (
    overall >= PRESENTATION_RECIPE_FIT_THRESHOLDS.accept
    && overflowRisk <= PRESENTATION_RECIPE_FIT_THRESHOLDS.warnOverflowRisk
  ) {
    return "fits";
  }
  if (
    overall >= PRESENTATION_RECIPE_FIT_THRESHOLDS.warn
    && overflowRisk <= PRESENTATION_RECIPE_FIT_THRESHOLDS.unsafeOverflowRisk
  ) {
    return "cramped";
  }
  return "unsafe";
}

export function evaluatePresentationRecipeSlotFit(
  componentId: BuiltInPresentationComponentId,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationRecipeFitEvaluation {
  const slotDetails: PresentationRecipeSlotFitDetails[] = [];

  for (const binding of slotBindings) {
    const budget = PRESENTATION_COMPONENT_SLOT_BUDGETS[componentId]?.[binding.slotId];
    if (!budget) {
      continue;
    }

    if (binding.type === "text") {
      const text = normalizeBindingText(binding);
      const charRatio = budget.maxChars ? text.length / budget.maxChars : 0.7;
      const density = clamp01(1 - Math.max(0, charRatio - 0.82));
      const inferredLines = budget.preferredLines && budget.maxChars
        ? Math.max(1, Math.ceil(text.length / Math.max(1, budget.maxChars / budget.preferredLines)))
        : 1;
      const lineOverflow = budget.preferredLines
        ? Math.max(0, inferredLines - budget.preferredLines) / budget.preferredLines
        : 0;
      const overflowRisk = clamp01(
        Math.max(
          budget.maxChars ? Math.max(0, charRatio - 1) : 0,
          lineOverflow * 0.7,
        ),
      );
      const readability = clamp01(1 - ((lineOverflow * 0.8) + Math.max(0, charRatio - 0.9) * 0.35));
      const overall = clamp01((density * 0.45) + (readability * 0.35) + ((1 - overflowRisk) * 0.20));
      slotDetails.push({
        slotId: binding.slotId,
        density,
        readability,
        overflowRisk,
        status: deriveSlotFitStatus(overall, overflowRisk),
      });
      continue;
    }

    if (binding.type === "list") {
      const chars = listChars(binding);
      const avgChars = chars.length > 0 ? chars.reduce((sum, value) => sum + value, 0) / chars.length : 0;
      const maxItemChars = chars.reduce((max, value) => Math.max(max, value), 0);
      const itemOverflow = budget.maxItems ? Math.max(0, binding.items.length - budget.maxItems) / budget.maxItems : 0;
      const charOverflow = budget.maxChars ? Math.max(0, maxItemChars - budget.maxChars) / budget.maxChars : 0;
      const density = clamp01(1 - ((itemOverflow * 0.55) + Math.max(0, (avgChars / Math.max(1, budget.maxChars ?? avgChars)) - 0.85)));
      const readability = clamp01(1 - ((itemOverflow * 0.65) + (charOverflow * 0.45)));
      const overflowRisk = clamp01(Math.max(itemOverflow, charOverflow));
      const overall = clamp01((density * 0.40) + (readability * 0.35) + ((1 - overflowRisk) * 0.25));
      slotDetails.push({
        slotId: binding.slotId,
        density,
        readability,
        overflowRisk,
        status: deriveSlotFitStatus(overall, overflowRisk),
      });
    }
  }

  if (slotDetails.length === 0) {
    return {
      fitScore: {
        overall: 1,
        density: 1,
        readability: 1,
        overflowRisk: 0,
        status: "fits",
      },
      slotDetails: [],
    };
  }

  const avgDensity = slotDetails.reduce((sum, slot) => sum + slot.density, 0) / slotDetails.length;
  const avgReadability = slotDetails.reduce((sum, slot) => sum + slot.readability, 0) / slotDetails.length;
  const overflowRisk = slotDetails.reduce((max, slot) => Math.max(max, slot.overflowRisk), 0);
  const overall = clamp01((avgDensity * 0.42) + (avgReadability * 0.33) + ((1 - overflowRisk) * 0.25));
  const status = deriveSlotFitStatus(overall, overflowRisk);

  return {
    fitScore: {
      overall: Number(overall.toFixed(3)),
      density: Number(avgDensity.toFixed(3)),
      readability: Number(avgReadability.toFixed(3)),
      overflowRisk: Number(overflowRisk.toFixed(3)),
      status,
    },
    slotDetails,
  };
}

export function buildDefaultRecipeSourceTrace(
  entries: Array<{
    sourceId: string;
    sourceType: PresentationAIDesignSourceTrace["sourceType"];
    sourceExcerpt?: string;
    targetSlotId?: string;
    disposition?: PresentationAIDesignSourceTrace["disposition"];
    notes?: string;
  }>,
): PresentationAIDesignSourceTrace[] {
  return entries.map((entry) => ({
    sourceId: entry.sourceId,
    sourceType: entry.sourceType,
    ...(entry.sourceExcerpt ? { sourceExcerpt: entry.sourceExcerpt.slice(0, 512) } : {}),
    disposition: entry.disposition ?? "used",
    ...(entry.targetSlotId ? { targetSlotId: entry.targetSlotId } : {}),
    ...(entry.notes ? { notes: entry.notes.slice(0, 512) } : {}),
  }));
}
