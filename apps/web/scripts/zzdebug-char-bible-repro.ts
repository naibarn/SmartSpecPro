import "dotenv/config";
process.chdir("/home/dev/projects/SmartSpecPro/apps/web");
import { getDb } from "../server/db";
import { executeWithFallback } from "../server/services/llmRouter";
import fs from "fs";
import path from "path";
import { parseSkillFile } from "@smartspec/skills";

async function main() {
  getDb();
  const sourcePath = path.resolve(process.cwd(), "skills", "vertical-drama-character-visual-bible", "skill.md");
  const raw = fs.readFileSync(sourcePath, "utf-8");
  const { content: systemPrompt } = parseSkillFile(raw);
  console.log("System prompt length:", systemPrompt.length);

  const userPrompt = `Generate the character visual bible for exactly ONE character using the following input (matches this skill's schemas/input.schema.json shape): { "characters": [ { "character_id": "character", "name": "หนูนา", "role": "ตัวเอก", "description": "Description: test child character" } ], "story_context": "Series title: Test | Genre: test | Tone: test", "output_options": { "include_image_generation_prompts": true, "include_plain_text_summary": true, "include_storyboard_attachment_manifest": true, "generate_primary_portrait_prompt": true } } Return ONLY a single JSON object. Do not pretty-print or indent — emit compact JSON (no unnecessary whitespace/newlines) to keep the response as short as possible.`;

  const result = await executeWithFallback({
    model: "openai/gpt-5.4-nano",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    userId: 1,
    maxTokens: 3500,
    temperature: 0.7,
  });

  if (result.type !== "success") {
    console.error("FAILED:", result);
    process.exit(1);
  }
  const content = result.response.choices?.[0]?.message?.content ?? "";
  console.log("=== RAW CONTENT LENGTH ===", content.length);
  console.log("=== FINISH REASON ===", result.response.choices?.[0]?.finish_reason);
  console.log("=== RAW CONTENT ===");
  console.log(content);
  fs.writeFileSync("/tmp/claude-1000/-home-dev-projects-SmartSpecPro/fd00a71c-eee1-4167-b28d-c736c7f516c7/scratchpad/raw-response.json", content);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
