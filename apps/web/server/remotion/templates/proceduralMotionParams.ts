import { z } from "zod";

export const MotionBeatEventSchema = z
  .object({
    frame: z.number().int().min(0).max(180_000),
    kind: z.enum(["enter", "emphasis", "reveal", "transition"]),
    strength: z.number().min(0).max(1).default(1),
  })
  .strict();

export type MotionBeatEvent = z.infer<typeof MotionBeatEventSchema>;

export const MotionTextParamsSchema = z.object({
  title: z.string().trim().max(120).optional(),
  subtitle: z.string().trim().max(180).optional(),
  events: z.array(MotionBeatEventSchema).max(32).default([]),
});

export const MotionPaletteSchema = z
  .array(z.string().trim().min(1).max(64))
  .min(1)
  .max(6)
  .default(["#60a5fa", "#22d3ee", "#facc15"]);
