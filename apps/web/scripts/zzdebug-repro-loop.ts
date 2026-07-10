import "dotenv/config";
import { getDb } from "../server/db";
import { executeWithFallback } from "../server/services/llmRouter";
import fs from "fs";
import path from "path";
import { parseSkillFile } from "@smartspec/skills";
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
    attachment_package: z.array(z.record(z.string(), z.unknown())).min(1).optional(),
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

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const jsonSlice = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonSlice);
}

async function main() {
  getDb();
  const sourcePath = path.resolve(process.cwd(), "skills", "vertical-drama-character-visual-bible", "skill.md");
  const raw = fs.readFileSync(sourcePath, "utf-8");
  const { content: systemPrompt } = parseSkillFile(raw);

  // EXACT same user prompt as the real failing trace (from audit log)
  const userPrompt = `Generate the character visual bible for exactly ONE character using the following input (matches this skill's schemas/input.schema.json shape): { "characters": [ { "character_id": "character", "name": "หนูนา", "role": "ตัวเอก", "description": "Description: เด็กหญิงผู้รับช่วงร้านรับฝากความทรงจำจากยายทวด ใจอ่อนโยน ช่างสังเกต และกล้าพอจะถามความจริง แม้จะกลัวการเผชิญหน้ากับผู้ใหญ่ก็ตาม" } ], "story_context": "Series title: สาวบ้านไร่ทวงสิทธิ์ | Genre: ความทรงจำในขวดแก้ว: คดีลูกหลานที่ถูกลืม | Tone: อบอุ่นแบบงานรับฝากความทรงจำปนดราม่าหนักใจ ลุ้นระทึกแบบคดีครอบครัว ทว่ามีความหวังจากการดูแลกันในชุมชน", "output_options": { "include_image_generation_prompts": true, "include_plain_text_summary": true, "include_storyboard_attachment_manifest": true, "generate_primary_portrait_prompt": true } } MANDATORY solo-portrait rule: every generated prompt (primary_portrait_prompt, turnaround_prompt, full_body_prompt, expression_sheet_prompt, outfit_sheet_prompt) is an IDENTITY REFERENCE and must depict EXACTLY ONE person — solo portrait, exactly one person in frame, no other people, no children, no second person, no hands of others, no crowd, no background figures. If the character's backstory or personality mentions other people (e.g. a child, a spouse, a rival), use that ONLY to inform this one character's mood, expression, or emotional state — NEVER render, imply, or add another person, body part of another person, or silhouette of another person into the frame. Also append these solo-portrait negative terms to every generated negative_prompt: "no other people, no second person, no children, no extra person, no crowd, no background figures, no hands of others". Render every portrait/turnaround/sheet prompt with full cinematic language: a portrait lens look (e.g. 85mm f/1.8, shallow depth of field), a cinematic color grade matching the series' tone/genre, subtle film grain and skin texture (not overly smooth/plastic), professional key light with a soft rim/edge light for separation, and a background that hints at story/location but stays clearly out of focus (bokeh) so it never competes with the subject. CHARACTER IDENTITY LOCK — two-tier (MANDATORY): PERSISTENT (must match the attached reference image exactly, never altered): face and facial features, body proportions, skin tone, hair color and style, eye color, clothing and accessories, and overall personality/presence. VARIABLE (free to change to match this shot): pose, emotion/facial expression, camera angle, scene/background, and action. Default region/ethnicity (series-level target audience setting): Thai/Southeast Asian features and styling appropriate for Thai audiences. Apply this ONLY as a default when the character's own description does not already state an ethnicity/nationality/region — an explicit ethnicity/nationality in the character's description always takes precedence over this default. Return ONLY the JSON object described in your instructions — no markdown fences, no commentary. Return ONLY a single JSON object. Do not pretty-print or indent — emit compact JSON (no unnecessary whitespace/newlines) to keep the response as short as possible.`;

  for (let i = 0; i < 5; i++) {
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
      console.log(`Run ${i}: LLM FAILED`, result);
      continue;
    }
    const content = result.response.choices?.[0]?.message?.content ?? "";
    const finishReason = result.response.choices?.[0]?.finish_reason;
    let parsed: unknown;
    let parseError: string | null = null;
    try {
      parsed = extractJson(content);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
    if (parseError) {
      console.log(`Run ${i}: JSON PARSE FAILED: ${parseError}, contentLength=${content.length}, finishReason=${finishReason}`);
      fs.writeFileSync(`/tmp/claude-1000/-home-dev-projects-SmartSpecPro/fd00a71c-eee1-4167-b28d-c736c7f516c7/scratchpad/fail-${i}.json`, content);
      continue;
    }
    const validation = characterVisualBibleOutputSchema.safeParse(parsed);
    console.log(`Run ${i}: success=${validation.success}, contentLength=${content.length}, outputTokens=${result.response.usage?.completion_tokens}, finishReason=${finishReason}`);
    if (!validation.success) {
      console.log(JSON.stringify(validation.error.issues, null, 2));
      fs.writeFileSync(`/tmp/claude-1000/-home-dev-projects-SmartSpecPro/fd00a71c-eee1-4167-b28d-c736c7f516c7/scratchpad/fail-${i}.json`, content);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
