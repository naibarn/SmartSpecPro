import { z } from "zod";

const skillCreateActionSchema = z.object({
  type: z.literal("create_skill"),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  skillContent: z.string(),
  triggerPatterns: z.array(z.string()),
});

export type SkillCreateAction = z.infer<typeof skillCreateActionSchema>;

/** Validate the structured action returned by the Python skill runtime. */
export function parseSkillCreateAction(
  value: unknown
): SkillCreateAction | null {
  const parsed = skillCreateActionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
