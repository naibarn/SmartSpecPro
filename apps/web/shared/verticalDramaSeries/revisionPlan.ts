import { z } from "zod";

export const verticalDramaRevisionScopeSchema = z.enum([
  "line",
  "shot_dialogue",
  "full_shot",
  "episode_beat",
  "episode_outline",
  "cross_episode",
]);

export const verticalDramaRevisionSeveritySchema = z.enum([
  "minor",
  "moderate",
  "major",
  "structural",
]);

export const verticalDramaRevisionPlanEntrySchema = z
  .object({
    issueId: z.string().min(1),
    episode: z.number().int().positive(),
    shot: z.number().int().positive().optional(),
    lineRef: z.string().min(1).optional(),
    problemKind: z.string().min(1),
    severity: verticalDramaRevisionSeveritySchema.default("moderate"),
    evidenceFromDraft: z.string().min(1),
    whyItWeakens: z.string().min(1),
    fixStrategy: z.string().min(1),
    affectedLedgers: z.array(z.string().min(1)).default([]),
    needsRegeneration: z.boolean(),
    scope: verticalDramaRevisionScopeSchema,
  })
  .passthrough();

export const verticalDramaRevisionPlanSchema = z.array(
  verticalDramaRevisionPlanEntrySchema,
);

export type VerticalDramaRevisionScope = z.infer<
  typeof verticalDramaRevisionScopeSchema
>;
export type VerticalDramaRevisionSeverity = z.infer<
  typeof verticalDramaRevisionSeveritySchema
>;
export type VerticalDramaRevisionPlanEntry = z.infer<
  typeof verticalDramaRevisionPlanEntrySchema
>;
export type VerticalDramaRevisionPlan = z.infer<
  typeof verticalDramaRevisionPlanSchema
>;

