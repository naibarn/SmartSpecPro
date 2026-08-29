import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { verticalDramaEpisodes } from "../../drizzle/schema";
import { executeJsonPlanningCallWithRetry, resolveStoryBibleModel } from "./verticalDramaStoryBible";
import { resolveSpecialCharacterBindings, resolveSpecialReferenceBindings } from "./verticalDramaSpecialReferences";
import { specialTieInInputSchema, type SpecialEpisodeData } from "../../shared/verticalDramaSeries/specialTieInContracts";
import type { VerticalDramaInteractiveJobPayload } from "./verticalDramaInteractiveJobs";

const specialSkillOutputSchema = z.object({
  status: z.enum(["ready", "assumptions_used", "needs_clarification"]),
  aspect_ratio: z.literal("9:16"),
  shot_duration_seconds: z.union([z.literal(8), z.literal(10), z.literal(12), z.literal(15), z.literal(20), z.literal(24), z.literal(30)]),
  shot_count: z.number().int().min(1).max(5),
  shots: z.array(z.object({
    shot_number: z.number().int().min(1).max(5),
    image_prompt: z.string().min(1).max(20_000),
    video_prompt: z.string().min(1).max(20_000),
    reference_ids: z.array(z.string().min(1).max(64)).max(20).default([]),
  })).min(1).max(5),
  assumptions: z.array(z.string().max(2_000)).max(20).optional(),
}).superRefine((output, ctx) => {
  if (output.shots.length !== output.shot_count) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shots"], message: "shot_count must match shots length" });
  output.shots.forEach((shot, index) => {
    if (shot.shot_number !== index + 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shots", index, "shot_number"], message: "shots must be sequential" });
  });
});

export type SpecialSkillOutput = z.infer<typeof specialSkillOutputSchema>;

export function validateSpecialSkillOutput(value: unknown): SpecialSkillOutput {
  if (value && typeof value === "object" && Array.isArray((value as { shots?: unknown[] }).shots)) {
    const shots = (value as { shots: Array<Record<string, unknown>> }).shots;
    const first = shots[0];
    // The installed skill's canonical output keeps the complete workflow
    // contract and calls the per-shot video prompt `prompt`. The adapter's
    // persisted contract is intentionally smaller, so normalize that shape
    // without changing the skill package or the normal episode pipeline.
    if (first && typeof first.image_prompt !== "string" && typeof first.video_prompt !== "string" && typeof first.prompt === "string") {
      value = {
        status: (value as Record<string, unknown>).status ?? "ready",
        aspect_ratio: (value as Record<string, unknown>).aspect_ratio,
        shot_duration_seconds: (value as Record<string, unknown>).shot_duration_seconds,
        shot_count: (value as Record<string, unknown>).shot_count ?? shots.length,
        assumptions: (value as Record<string, unknown>).assumptions,
        shots: shots.map(shot => ({
          shot_number: shot.shot_number,
          image_prompt: typeof (shot.keyframe_plan as Record<string, unknown> | undefined)?.start_frame === "string"
            ? (shot.keyframe_plan as Record<string, unknown>).start_frame
            : shot.prompt,
          video_prompt: shot.prompt,
          reference_ids: [
            ...(((shot.reference_lock as Record<string, unknown> | undefined)?.person_reference_ids as string[] | undefined) ?? []),
            ...(((shot.reference_lock as Record<string, unknown> | undefined)?.product_reference_ids as string[] | undefined) ?? []),
          ],
        })),
      };
    }
  }
  return specialSkillOutputSchema.parse(value);
}

async function loadIdeaToVideoSkill(): Promise<{ skill: string; rules: string }> {
  const root = path.resolve(process.cwd(), "apps", "web", "skills", "idea-to-video-prompt");
  const [skill, rules] = await Promise.all([
    fs.readFile(path.join(root, "SKILL.md"), "utf8"),
    fs.readFile(path.join(root, "references", "video-prompt-rules.md"), "utf8"),
  ]);
  return { skill, rules };
}

function compactViolationCodes(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map(issue => `OUTPUT_${issue.path.join("_").toUpperCase() || "ROOT"}`);
}

function buildSpecialPrompt(input: SpecialSkillInput, skillText: { skill: string; rules: string }, bindings: Array<{ skillReferenceId: string; role: string; authorizedUrl: string }>, violationCodes: string[] = []): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: `${skillText.skill}\n\nVIDEO PROMPT RULES:\n${skillText.rules}\n\nReturn JSON only matching the supplied special output contract. The skill owns all creative prompt wording.`,
    userPrompt: JSON.stringify({
      idea: input.idea,
      reference_type: input.referenceType,
      reference_images: bindings.map(binding => ({ id: binding.skillReferenceId, role: binding.role, source: binding.authorizedUrl })),
      character_ids: input.characterIds,
      duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio,
      dialogue_mode: input.dialogueMode,
      dialogue_brief: input.dialogueBrief ?? "",
      speaker_character_ids: input.speakerCharacterIds,
      allow_additional_characters: input.allowAdditionalCharacters,
      lock_character_references: input.lockCharacterReferences,
      lock_reference_images: input.lockReferenceImages,
      semantic_retry_violation_codes: violationCodes,
    }),
  };
}

type SpecialSkillInput = ReturnType<typeof specialTieInInputSchema.parse>;

export async function generateSpecialSkillOutput(input: {
  actor: { tenantId: string; userId: number };
  seriesId: number;
  specialData: SpecialEpisodeData;
  bindings: SpecialEpisodeData["referenceBindings"];
  execute?: (params: { systemPrompt: string; userPrompt: string; model: string; schema: typeof specialSkillOutputSchema }) => Promise<SpecialSkillOutput>;
}): Promise<SpecialSkillOutput> {
  const parsed = specialTieInInputSchema.parse(input.specialData.input);
  const resolved = [
    ...(await resolveSpecialReferenceBindings(input.actor, input.bindings)),
    ...(await resolveSpecialCharacterBindings({ actor: input.actor, seriesId: input.seriesId, characterIds: parsed.characterIds })),
  ];
  const skillText = await loadIdeaToVideoSkill();
  const model = await resolveStoryBibleModel();
  let violationCodes: string[] = [];
  let lastError: z.ZodError | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prompts = buildSpecialPrompt(parsed, skillText, resolved, violationCodes);
    try {
      const candidate = input.execute
        ? await input.execute({ ...prompts, model, schema: specialSkillOutputSchema })
        : (await executeJsonPlanningCallWithRetry({ model, ...prompts, temperature: 0.45, userId: input.actor.userId, maxTokens: 8_000, schema: specialSkillOutputSchema, label: "special tie-in idea-to-video-prompt" })).data;
      const output = validateSpecialSkillOutput(candidate);
      if (output.shot_duration_seconds !== parsed.durationSeconds) throw new Error("SPECIAL_OUTPUT_INVALID: duration mismatch");
      if (output.aspect_ratio !== "9:16") throw new Error("SPECIAL_OUTPUT_INVALID: aspect ratio mismatch");
      return output;
    } catch (error) {
      if (error instanceof z.ZodError) {
        lastError = error;
        violationCodes = compactViolationCodes(error);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`SPECIAL_OUTPUT_INVALID: skill output failed after two semantic retries (${lastError ? compactViolationCodes(lastError).join(",") : "validation"})`);
}

export async function executeSpecialTieInSkill(payload: VerticalDramaInteractiveJobPayload, execution: { jobId: string; traceId: string }): Promise<{ shotCount: number; outputVersion: number; promptReady: boolean }> {
  const raw = payload.input as { episodeId: number; seriesId: number; inputVersion: number; input: SpecialSkillInput };
  const [row] = await db.select({ specialData: verticalDramaEpisodes.specialData, episodeKind: verticalDramaEpisodes.episodeKind }).from(verticalDramaEpisodes).where(and(eq(verticalDramaEpisodes.id, raw.episodeId), eq(verticalDramaEpisodes.seriesId, raw.seriesId), eq(verticalDramaEpisodes.tenantId, payload.tenantId), eq(verticalDramaEpisodes.userId, payload.userId))).limit(1);
  if (!row || row.episodeKind !== "special_tie_in") throw new Error("SPECIAL_REFERENCE_UNAUTHORIZED: special episode not found");
  const specialData = row.specialData as SpecialEpisodeData;
  if (!specialData || specialData.inputVersion !== raw.inputVersion) return { shotCount: 0, outputVersion: specialData?.outputVersion ?? 0, promptReady: false };
  const output = await generateSpecialSkillOutput({ actor: { tenantId: payload.tenantId, userId: payload.userId }, seriesId: raw.seriesId, specialData, bindings: specialData.referenceBindings });
  const nextOutputVersion = specialData.outputVersion + 1;
  const personBindings = await resolveSpecialCharacterBindings({ actor: { tenantId: payload.tenantId, userId: payload.userId }, seriesId: raw.seriesId, characterIds: specialData.input.characterIds });
  const productReferenceAssetIds = specialData.referenceBindings.map(binding => binding.mediaAssetId);
  const startFramePlan = { mode: "single_frame_per_shot", selectedImageModelId: specialData.input.imageModelId, aspectRatio: "9:16", frames: output.shots.map(shot => ({ shotNumber: shot.shot_number, imagePrompt: shot.image_prompt, negativePrompt: "", requiredCharacterRefs: personBindings.map(binding => String(binding.provenance.characterKey ?? binding.skillReferenceId)), productReferenceAssetIds, referenceAssetIds: shot.reference_ids })) };
  const motionPromptPack = { selectedVideoModelId: specialData.input.videoModelId, durationProfileId: `vertical_drama_special_${output.shot_duration_seconds}s_variable_shots`, motionMode: "image_to_video", aspectRatio: "9:16", clips: output.shots.map(shot => ({ clipNumber: shot.shot_number, sourceShotNumbers: [shot.shot_number], prompt: shot.video_prompt, durationSeconds: output.shot_duration_seconds, referenceIds: shot.reference_ids })) };
  const nextData: SpecialEpisodeData = { ...specialData, outputVersion: nextOutputVersion, skillRun: { ...specialData.skillRun, status: output.status === "needs_clarification" ? "needs_clarification" : "succeeded", attempt: specialData.skillRun.attempt + 1, completedAt: new Date().toISOString(), errorCode: undefined, errorMessage: undefined }, output: { shotCount: output.shot_count, assumptions: output.assumptions } };
  const updated = await db.update(verticalDramaEpisodes).set({ specialData: nextData, startFramePlan, motionPromptPack, updatedAt: new Date() }).where(and(eq(verticalDramaEpisodes.id, raw.episodeId), eq(verticalDramaEpisodes.tenantId, payload.tenantId), eq(verticalDramaEpisodes.userId, payload.userId), sql`${verticalDramaEpisodes.specialData}->>'createIntentId' = ${specialData.createIntentId}`, sql`${verticalDramaEpisodes.specialData}->>'inputVersion' = ${String(raw.inputVersion)}`)).returning({ id: verticalDramaEpisodes.id });
  if (!updated.length) return { shotCount: 0, outputVersion: specialData.outputVersion, promptReady: false };
  return { shotCount: output.shot_count, outputVersion: nextOutputVersion, promptReady: output.status !== "needs_clarification" };
}
