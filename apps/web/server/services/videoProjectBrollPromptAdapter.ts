/** Skill-first prompt authoring for Video Studio B-roll review cards. */
import { z } from "zod";

import {
  callLLMStructured,
  LLMStructuredOutputError,
} from "./callLLMStructured";

export const brollPromptOutputSchema = z.object({
  kind: z.enum(["image", "video"]),
  sceneId: z.string().trim().min(1),
  prompt: z.string().trim().min(20).max(4000),
  negativePrompt: z.string().trim().max(1000).default(""),
  shotSummary: z.string().trim().min(1).max(500),
  motionDirection: z.string().trim().max(500).default(""),
  suggestedDurationSeconds: z.number().min(1).max(60),
});

export type BrollPromptSkillInput = {
  kind: "image" | "video";
  brief: {
    topic: string | null;
    audience: string | null;
    language: string;
    platformPreset: string;
    studioType: string;
  };
  scene: {
    sceneId: string;
    startMs: number;
    endMs: number;
    narration: string | null;
    captionText: string[];
  };
  referenceImageUrl?: string | null;
  userInstructions?: string | null;
};

export type BrollPromptSkillOutput = z.infer<typeof brollPromptOutputSchema>;

export const VIDEO_PROJECT_BROLL_PROMPT_SYSTEM_FRAMING =
  "This is a Video Studio B-roll prompt drafting call. The user message is one JSON object " +
  "containing the project brief, one scene, the requested media kind, and optional reference context. " +
  "Use only the supplied facts, preserve the scene meaning, and return one detailed reviewable prompt. " +
  "Do not call media providers and do not submit a generation task. Respond with ONLY one valid JSON object " +
  "matching the expected schema, with no markdown or commentary outside JSON.";

export function makeRunBrollPromptSkill(deps: {
  tenantId: string;
  userId: number;
  projectId: number;
  traceId: string;
  modelId: string;
  onUsage?: (usage: { creditsUsed: number; modelId: string | null }) => void;
}) {
  return async (
    input: BrollPromptSkillInput
  ): Promise<BrollPromptSkillOutput> => {
    try {
      const result = await callLLMStructured({
        systemPrompt: VIDEO_PROJECT_BROLL_PROMPT_SYSTEM_FRAMING,
        userMessage: JSON.stringify(input),
        zodSchema: brollPromptOutputSchema,
        maxRetries: 2,
        maxTokens: 1800,
        model: deps.modelId,
        userId: deps.userId,
        tenantId: deps.tenantId,
        runtimeOptions: {
          skillSlugs: ["video-project-broll-prompt"],
          originSurface: "video_edit",
          entryPoint: "system",
          requestLabel: "video-project-broll-prompt",
        },
        billingDescription: "video-project B-roll prompt draft",
        billingMetadata: {
          skillSlug: "video-project-broll-prompt",
          traceId: deps.traceId,
          projectId: deps.projectId,
        },
      });
      deps.onUsage?.({
        creditsUsed: result.creditsUsed,
        modelId: result.modelId,
      });
      return result.data;
    } catch (error) {
      if (error instanceof LLMStructuredOutputError) {
        deps.onUsage?.({
          creditsUsed: error.creditsUsed ?? 0,
          modelId: deps.modelId,
        });
        throw new Error(
          `VI_BROLL_PROMPT_INVALID: video-project-broll-prompt output failed its schema after 2 retries`,
          { cause: error }
        );
      }
      throw error;
    }
  };
}
