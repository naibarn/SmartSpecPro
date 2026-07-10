import { z } from "zod";

export const ANGLE_STORY_FUNCTIONS = [
  "establishing_context",
  "character_pressure",
  "evidence_reveal",
  "power_shift",
  "emotional_closeup",
  "threat_presence",
  "choice_moment",
  "aftermath",
  "mystery_hook",
] as const;

export const angleGridCandidateSchema = z
  .object({
    index: z.number().int().min(0).max(8),
    storyFunction: z.enum(ANGLE_STORY_FUNCTIONS),
    cameraPosition: z.string().min(1),
    shotSize: z.string().min(1),
    lensMood: z.string().min(1),
    subjectPlacement: z.string().min(1),
    foregroundElement: z.string().min(1),
    backgroundElement: z.string().min(1),
    motionPotential: z.string().min(1),
    riskToAvoid: z.string().min(1),
  })
  .passthrough();

export const angleGridCandidateScoreSchema = z
  .object({
    index: z.number().int().min(0).max(8),
    clarity: z.number().min(1).max(10),
    continuity: z.number().min(1).max(10),
    emotionalPrecision: z.number().min(1).max(10),
    characterIdentitySafety: z.number().min(1).max(10),
    motionPotential: z.number().min(1).max(10),
    productionReadiness: z.number().min(1).max(10),
  })
  .passthrough();

export type AngleGridCandidate = z.infer<typeof angleGridCandidateSchema>;
export type AngleGridCandidateScore = z.infer<typeof angleGridCandidateScoreSchema>;
export type AngleStoryFunction = (typeof ANGLE_STORY_FUNCTIONS)[number];

