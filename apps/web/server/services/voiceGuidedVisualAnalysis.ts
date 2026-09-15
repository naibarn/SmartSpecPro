import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { callLLMWithVision } from "../routers/skills";

const analysisSchema = z.object({
  caption: z.string().trim().min(1).max(600),
  subjects: z.array(z.string().trim().min(1).max(120)).max(16).default([]),
  actions: z.array(z.string().trim().min(1).max(120)).max(16).default([]),
  setting: z.array(z.string().trim().min(1).max(120)).max(16).default([]),
  objects: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
  ocrText: z.array(z.string().trim().min(1).max(180)).max(24).default([]),
  keywords: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  safety: z.array(z.string().trim().min(1).max(80)).max(16).default([]),
  confidence: z.number().min(0).max(1),
});

export type VoiceGuidedVisualAnalysis = z.infer<typeof analysisSchema> & {
  analyzer: "voice-guided-visual-match-skill";
  modelRevision: string;
};

let promptPromise: Promise<string> | null = null;
async function loadPrompt(): Promise<string> {
  promptPromise ??= fs.readFile(path.resolve(process.cwd(), "apps/web/skills/voice-guided-visual-match/skill.md"), "utf8");
  return promptPromise;
}

function parseJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("vision_skill_invalid_json");
  return JSON.parse(fenced.slice(start, end + 1));
}

export async function analyzeVoiceGuidedImage(input: {
  userId: number;
  tenantId: string;
  imageDataUrl: string;
  model?: string;
}): Promise<VoiceGuidedVisualAnalysis> {
  const prompt = await loadPrompt();
  const result = await callLLMWithVision(
    prompt,
    "Return JSON only. Analyze the supplied slide image for visual matching.",
    input.userId,
    [input.imageDataUrl],
    input.model,
    700,
    { tenantId: input.tenantId },
  );
  const parsed = analysisSchema.parse(parseJson(result.content));
  return {
    ...parsed,
    analyzer: "voice-guided-visual-match-skill",
    modelRevision: input.model ?? "configured-vision-model",
  };
}
