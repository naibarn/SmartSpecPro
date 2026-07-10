import fs from "fs";
import { z } from "zod";

const characterVisualBibleCharacterSchema = z
  .object({
    character_id: z.string().min(1),
    name: z.string().min(1),
    visual_identity_summary: z.string().min(1),
    primary_portrait_prompt: z.string().min(1),
    negative_prompt: z.string().optional(),
    turnaround_prompt: z.string().min(1).optional(),
    full_body_prompt: z.string().min(1).optional(),
    expression_sheet_prompt: z.string().min(1).optional(),
    outfit_sheet_prompt: z.string().min(1).optional(),
    attachment_package: z.array(z.record(z.string(), z.unknown())).min(1),
  })
  .passthrough();

const characterVisualBibleOutputSchema = z
  .object({
    visual_bible_summary: z.record(z.string(), z.unknown()),
    characters: z.array(characterVisualBibleCharacterSchema).min(1),
    plain_text_summary: z.string().min(1),
    storyboard_attachment_manifest: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const content = fs.readFileSync("/tmp/claude-1000/-home-dev-projects-SmartSpecPro/fd00a71c-eee1-4167-b28d-c736c7f516c7/scratchpad/raw-response.json", "utf-8");
const parsed = JSON.parse(content);
const result = characterVisualBibleOutputSchema.safeParse(parsed);
console.log("success:", result.success);
if (!result.success) {
  console.log(JSON.stringify(result.error.issues, null, 2));
}
