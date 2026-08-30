import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { verticalDramaEpisodes } from "../../drizzle/schema";
import {
  executeJsonPlanningCallWithRetry,
  resolveStoryBibleModel,
} from "./verticalDramaStoryBible";
import {
  calculateCreditsForLLM,
  deductCredits,
  refundCredits,
} from "./creditService";
import {
  reconcileSpecialLocationSlot,
  resolveSpecialReferenceBindings,
} from "./verticalDramaSpecialReferences";
import { listSpecialTieInModels } from "./verticalDramaSpecialModelCatalog";
import { listConnectedMcpProviderKeys } from "./mcpConnectionService";
import {
  analyzeVerticalDramaStorySafety,
  isBlockingVerticalDramaStorySafety,
} from "./verticalDramaStorySafety";
import {
  specialTieInInputSchema,
  type SpecialEpisodeData,
} from "../../shared/verticalDramaSeries/specialTieInContracts";
import type { VerticalDramaInteractiveJobPayload } from "./verticalDramaInteractiveJobs";

const specialSkillOutputSchema = z
  .object({
    status: z.enum(["ready", "assumptions_used", "needs_clarification"]),
    aspect_ratio: z.literal("9:16"),
    shot_duration_seconds: z.union([
      z.literal(8),
      z.literal(10),
      z.literal(12),
      z.literal(15),
      z.literal(20),
      z.literal(24),
      z.literal(30),
    ]),
    shot_count: z.literal(9),
    shots: z
      .array(
        z.object({
          shot_number: z.number().int().min(1).max(9),
          image_prompt: z.string().min(1).max(20_000),
          video_prompt: z.string().min(1).max(20_000),
          reference_ids: z.array(z.string().min(1).max(64)).max(20).default([]),
          dialogue_mode: z.enum(["none", "character_dialogue"]).optional(),
        })
      )
      .length(9),
    dialogue: z
      .object({
        mode: z.enum(["none", "character_dialogue"]),
        speaker_count: z.number().int().min(0).max(3).optional(),
        speaker_reference_ids: z
          .array(z.string().min(1).max(64))
          .max(3)
          .default([]),
        speaking_turns: z
          .array(
            z.object({
              speaker_reference_id: z.string().min(1).max(64),
              exact_dialogue: z.string().min(1).max(2_000),
            })
          )
          .max(3)
          .default([]),
      })
      .optional(),
    assumptions: z.array(z.string().max(2_000)).max(20).optional(),
    quality_control: z.unknown().optional(),
  })
  .superRefine((output, ctx) => {
    if (output.shots.length !== output.shot_count)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shots"],
        message: "shot_count must match shots length",
      });
    output.shots.forEach((shot, index) => {
      if (shot.shot_number !== index + 1)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shots", index, "shot_number"],
          message: "shots must be sequential",
        });
    });
  });

export type SpecialSkillOutput = z.infer<typeof specialSkillOutputSchema>;

export function validateSpecialSkillOutput(value: unknown): SpecialSkillOutput {
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { shots?: unknown[] }).shots)
  ) {
    const shots = (value as { shots: Array<Record<string, unknown>> }).shots;
    const first = shots[0];
    // The installed skill's canonical output keeps the complete workflow
    // contract and calls the per-shot video prompt `prompt`. The adapter's
    // persisted contract is intentionally smaller, so normalize that shape
    // without changing the skill package or the normal episode pipeline.
    if (
      first &&
      typeof first.image_prompt !== "string" &&
      typeof first.video_prompt !== "string" &&
      typeof first.prompt === "string"
    ) {
      value = {
        status: (value as Record<string, unknown>).status ?? "ready",
        aspect_ratio: (value as Record<string, unknown>).aspect_ratio,
        shot_duration_seconds: (value as Record<string, unknown>)
          .shot_duration_seconds,
        shot_count:
          (value as Record<string, unknown>).shot_count ?? shots.length,
        assumptions: (value as Record<string, unknown>).assumptions,
        dialogue: (value as Record<string, unknown>).dialogue,
        quality_control: (value as Record<string, unknown>).quality_control,
        shots: shots.map(shot => ({
          shot_number: shot.shot_number,
          image_prompt:
            typeof (shot.keyframe_plan as Record<string, unknown> | undefined)
              ?.start_frame === "string"
              ? (shot.keyframe_plan as Record<string, unknown>).start_frame
              : shot.prompt,
          video_prompt: shot.prompt,
          reference_ids: [
            ...(((shot.reference_lock as Record<string, unknown> | undefined)
              ?.person_reference_ids as string[] | undefined) ?? []),
            ...(((shot.reference_lock as Record<string, unknown> | undefined)
              ?.product_reference_ids as string[] | undefined) ?? []),
          ],
          dialogue_mode:
            shot.dialogue_mode ??
            (value.dialogue as Record<string, unknown> | undefined)?.mode ??
            "none",
        })),
      };
    }
  }
  return specialSkillOutputSchema.parse(value);
}

async function loadIdeaToVideoSkill(): Promise<{
  skill: string;
  rules: string;
  inputSchema: string;
  outputSchema: string;
  uiSchema: string;
}> {
  const root = path.resolve(
    process.cwd(),
    "apps",
    "web",
    "skills",
    "idea-to-video-prompt"
  );
  const [skill, rules, inputSchema, outputSchema, uiSchema] = await Promise.all(
    [
      fs.readFile(path.join(root, "SKILL.md"), "utf8"),
      fs.readFile(
        path.join(root, "references", "video-prompt-rules.md"),
        "utf8"
      ),
      fs.readFile(path.join(root, "schemas", "input.schema.json"), "utf8"),
      fs.readFile(path.join(root, "schemas", "output.schema.json"), "utf8"),
      fs.readFile(path.join(root, "schemas", "ui.schema.json"), "utf8"),
    ]
  );
  return { skill, rules, inputSchema, outputSchema, uiSchema };
}

function compactViolationCodes(error: z.ZodError): string[] {
  return error.issues
    .slice(0, 12)
    .map(issue => `OUTPUT_${issue.path.join("_").toUpperCase() || "ROOT"}`);
}

export function extractSpecialExactDialogueLines(
  dialogueBrief?: string
): string[] {
  return (dialogueBrief ?? "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(line =>
      line
        .match(
          /^(?:EXACT(?: SPOKEN DIALOGUE)?|ตรงตัว|บทพูดตรงตัว)\s*:\s*(.+)$/i
        )?.[1]
        ?.trim()
    )
    .filter((line): line is string => Boolean(line));
}

function buildSpecialPrompt(
  input: SpecialSkillInput,
  skillText: {
    skill: string;
    rules: string;
    inputSchema: string;
    outputSchema: string;
    uiSchema: string;
  },
  bindings: Array<{
    skillReferenceId: string;
    role: string;
    authorizedUrl: string;
    provenance: Record<string, unknown>;
  }>,
  violationCodes: string[] = []
): { systemPrompt: string; userPrompt: string } {
  const speakerReferenceIds = bindings
    .filter(binding => binding.role === "person")
    .filter(binding =>
      input.speakerCharacterIds.includes(
        String(binding.provenance.characterId ?? "")
      )
    )
    .map(binding => binding.skillReferenceId);
  const exactDialogueLines = extractSpecialExactDialogueLines(
    input.dialogueBrief
  );
  return {
    systemPrompt: `${skillText.skill}\n\nVIDEO PROMPT RULES:\n${skillText.rules}\n\nINPUT SCHEMA:\n${skillText.inputSchema}\n\nOUTPUT SCHEMA:\n${skillText.outputSchema}\n\nUI SCHEMA:\n${skillText.uiSchema}\n\nSPECIAL TIE-IN OVERRIDE: This workflow must return exactly 9 sequential shots numbered 1 through 9. Ignore any generic max_shots=5 limit in the supplied idea-to-video schema; this adapter's exactly-9 contract is authoritative. Do not create shots before the user has reviewed and submitted the story and dialogue. The approved story and dialogue are the source for the 9-shot continuity.\n\nReturn JSON only matching the supplied special output contract. The skill owns all creative prompt wording. If exact_dialogue_lines is non-empty, preserve every line verbatim in speaking_turns.exact_dialogue.`,
    userPrompt: JSON.stringify({
      idea: input.idea,
      reference_type: input.referenceType,
      reference_images: bindings.map(binding => ({
        id: binding.skillReferenceId,
        role: binding.role === "store" ? "location" : binding.role,
        source: binding.authorizedUrl,
        lock_identity:
          binding.role === "person"
            ? input.lockCharacterReferences
            : input.lockReferenceImages,
        lock_wardrobe:
          binding.role === "person" && input.lockCharacterReferences,
      })),
      shot_duration_seconds: input.durationSeconds,
      shot_count: 9,
      max_shots: 9,
      aspect_ratio: input.aspectRatio,
      dialogue_mode: input.dialogueMode,
      dialogue_language: input.dialogueMode === "none" ? "none" : "th",
      speaker_count: speakerReferenceIds.length,
      speaker_reference_ids: speakerReferenceIds,
      dialogue_constraints: input.dialogueBrief ?? "",
      exact_dialogue_lines: exactDialogueLines,
      allow_additional_characters: input.allowAdditionalCharacters,
      lock_character_references: input.lockCharacterReferences,
      lock_reference_images: input.lockReferenceImages,
      marketplace_review_idea: input.marketplaceReviewIdea,
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
  execute?: (params: {
    systemPrompt: string;
    userPrompt: string;
    model: string;
    schema: typeof specialSkillOutputSchema;
  }) => Promise<SpecialSkillOutput>;
  onLlmSuccess?: (usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  }) => Promise<void>;
}): Promise<SpecialSkillOutput> {
  const parsed = specialTieInInputSchema.parse(input.specialData.input);
  const inputSafety = analyzeVerticalDramaStorySafety({
    idea: parsed.idea,
    dialogueBrief: parsed.dialogueBrief,
  });
  if (isBlockingVerticalDramaStorySafety(inputSafety)) {
    throw new Error(
      "SPECIAL_SAFETY_BLOCKED: submitted idea contains a high-risk policy context"
    );
  }
  const modelCatalog = await listSpecialTieInModels({
    durationSeconds: parsed.durationSeconds,
    aspectRatio: parsed.aspectRatio,
    dialogueMode: parsed.dialogueMode,
    referenceType: parsed.referenceType,
    referenceImageCount: parsed.referenceImages.length,
    connectedMcpProviderKeys: await listConnectedMcpProviderKeys(input.actor),
  });
  if (
    !modelCatalog.imageModels.some(
      model => model.modelId === parsed.imageModelId
    ) ||
    !modelCatalog.videoModels.some(
      model => model.modelId === parsed.videoModelId
    )
  ) {
    throw new Error(
      "SPECIAL_MODEL_UNAVAILABLE: selected special tie-in model is no longer available"
    );
  }
  const resolved = await resolveSpecialReferenceBindings(
    input.actor,
    input.bindings
  );
  const skillText = await loadIdeaToVideoSkill();
  const model = await resolveStoryBibleModel();
  let violationCodes: string[] = [];
  let lastError: z.ZodError | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prompts = buildSpecialPrompt(
      parsed,
      skillText,
      resolved,
      violationCodes
    );
    try {
      let effectiveModel = model;
      let inputTokens = 0;
      let outputTokens = 0;
      let candidate: SpecialSkillOutput;
      if (input.execute) {
        candidate = await input.execute({
          ...prompts,
          model,
          schema: specialSkillOutputSchema,
        });
      } else {
        const planning = await executeJsonPlanningCallWithRetry({
          model,
          ...prompts,
          temperature: 0.45,
          userId: input.actor.userId,
          maxTokens: 16_000,
          modelFallbackPolicy: "recommended",
          modelFallbackOnSchema: true,
          modelFallbackMaxAttempts: 1,
          schema: specialSkillOutputSchema,
          label: "special tie-in idea-to-video-prompt",
          schemaRetryContract:
            "SPECIAL TIE-IN OUTPUT REQUIREMENT: return exactly 9 shots, with shot_count=9 and shot_number values 1 through 9 in order. Never return 5 shots or pad a shorter result.",
        });
        candidate = planning.data;
        effectiveModel = planning.model;
        inputTokens = planning.response?.usage?.prompt_tokens ?? 0;
        outputTokens = planning.response?.usage?.completion_tokens ?? 0;
      }
      const output = validateSpecialSkillOutput(candidate);
      const knownReferenceIds = new Set(
        resolved.map(binding => binding.skillReferenceId)
      );
      if (
        output.shots.some(shot =>
          shot.reference_ids.some(
            referenceId => !knownReferenceIds.has(referenceId)
          )
        )
      ) {
        throw new Error(
          "SPECIAL_OUTPUT_INVALID: output referenced an unknown asset"
        );
      }
      if (output.shot_duration_seconds !== parsed.durationSeconds)
        throw new Error("SPECIAL_OUTPUT_INVALID: duration mismatch");
      if (output.aspect_ratio !== "9:16")
        throw new Error("SPECIAL_OUTPUT_INVALID: aspect ratio mismatch");
      if (
        output.shots.some(
          shot =>
            (shot.dialogue_mode ??
              output.dialogue?.mode ??
              parsed.dialogueMode) !== parsed.dialogueMode
        )
      ) {
        throw new Error("SPECIAL_OUTPUT_INVALID: dialogue mode mismatch");
      }
      const allowedSpeakerIds = new Set(
        resolved
          .filter(binding => binding.role === "person")
          .filter(binding =>
            parsed.speakerCharacterIds.includes(
              String(binding.provenance.characterId ?? "")
            )
          )
          .map(binding => binding.skillReferenceId)
      );
      if (parsed.dialogueMode === "none") {
        if (
          output.dialogue &&
          (output.dialogue.mode !== "none" ||
            output.dialogue.speaking_turns.length > 0 ||
            (output.dialogue.speaker_count ?? 0) > 0)
        ) {
          throw new Error(
            "SPECIAL_OUTPUT_INVALID: dialogue was returned while dialogue mode is none"
          );
        }
      } else {
        if (!output.dialogue || output.dialogue.mode !== "character_dialogue") {
          throw new Error(
            "SPECIAL_OUTPUT_INVALID: character dialogue plan is missing"
          );
        }
        if (
          output.dialogue.speaker_reference_ids.length === 0 ||
          (output.dialogue.speaker_count !== undefined &&
            output.dialogue.speaker_count !==
              output.dialogue.speaker_reference_ids.length) ||
          output.dialogue.speaker_reference_ids.some(
            referenceId => !allowedSpeakerIds.has(referenceId)
          ) ||
          output.dialogue.speaking_turns.some(
            turn => !allowedSpeakerIds.has(turn.speaker_reference_id)
          )
        ) {
          throw new Error(
            "SPECIAL_OUTPUT_INVALID: dialogue speaker is not an authorized selected character"
          );
        }
        const exactDialogueLines = extractSpecialExactDialogueLines(
          parsed.dialogueBrief
        );
        if (
          exactDialogueLines.some(
            line =>
              !output.dialogue?.speaking_turns.some(
                turn => turn.exact_dialogue === line
              )
          )
        ) {
          throw new Error(
            "SPECIAL_OUTPUT_INVALID: exact dialogue line was not preserved"
          );
        }
      }
      const outputSafety = analyzeVerticalDramaStorySafety(
        output.shots.map(shot => ({
          imagePrompt: shot.image_prompt,
          videoPrompt: shot.video_prompt,
          dialogue: output.dialogue,
        }))
      );
      if (isBlockingVerticalDramaStorySafety(outputSafety)) {
        throw new Error(
          "SPECIAL_SAFETY_BLOCKED: generated prompts contain a high-risk policy context"
        );
      }
      await input.onLlmSuccess?.({
        model: effectiveModel,
        inputTokens,
        outputTokens,
      });
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
  throw new Error(
    `SPECIAL_OUTPUT_INVALID: skill output failed after two semantic retries (${lastError ? compactViolationCodes(lastError).join(",") : "validation"})`
  );
}

export async function executeSpecialTieInSkill(
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
): Promise<{ shotCount: number; outputVersion: number; promptReady: boolean }> {
  const raw = payload.input as {
    episodeId: number;
    seriesId: number;
    inputVersion: number;
    input: SpecialSkillInput;
  };
  const [row] = await db
    .select({
      specialData: verticalDramaEpisodes.specialData,
      episodeKind: verticalDramaEpisodes.episodeKind,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, raw.episodeId),
        eq(verticalDramaEpisodes.seriesId, raw.seriesId),
        eq(verticalDramaEpisodes.tenantId, payload.tenantId),
        eq(verticalDramaEpisodes.userId, payload.userId)
      )
    )
    .limit(1);
  if (!row || row.episodeKind !== "special_tie_in")
    throw new Error(
      "SPECIAL_REFERENCE_UNAUTHORIZED: special episode not found"
    );
  const specialData = row.specialData as SpecialEpisodeData;
  if (!specialData || specialData.inputVersion !== raw.inputVersion)
    return {
      shotCount: 0,
      outputVersion: specialData?.outputVersion ?? 0,
      promptReady: false,
    };
  const attempt = specialData.skillRun.attempt + 1;
  const startedAt = new Date().toISOString();
  await db
    .update(verticalDramaEpisodes)
    .set({
      specialData: {
        ...specialData,
        skillRun: {
          ...specialData.skillRun,
          status: "running",
          attempt,
          startedAt,
          errorCode: undefined,
          errorMessage: undefined,
        },
      },
      startFramePlan: null,
      motionPromptPack: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaEpisodes.id, raw.episodeId),
        eq(verticalDramaEpisodes.tenantId, payload.tenantId),
        eq(verticalDramaEpisodes.userId, payload.userId),
        sql`${verticalDramaEpisodes.specialData}->>'createIntentId' = ${specialData.createIntentId}`,
        sql`${verticalDramaEpisodes.specialData}->>'inputVersion' = ${String(raw.inputVersion)}`
      )
    );
  let output: SpecialSkillOutput;
  let llmUsage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  } | null = null;
  let billedSkillRunId: string | null = null;
  let billedAmount = 0;
  let billingSettled = false;
  try {
    output = await generateSpecialSkillOutput({
      actor: { tenantId: payload.tenantId, userId: payload.userId },
      seriesId: raw.seriesId,
      specialData,
      bindings: specialData.referenceBindings,
      onLlmSuccess: async ({ model, inputTokens, outputTokens }) => {
        // Defer charging until post-generation work (including automatic
        // scene/look slot reconciliation) has also succeeded.
        llmUsage = { model, inputTokens, outputTokens };
      },
    });
    if (
      output.status !== "needs_clarification" &&
      (specialData.input.referenceType === "location" ||
        specialData.input.referenceType === "store") &&
      !specialData.input.referenceImages.some(
        reference =>
          reference.source === "series_asset" &&
          typeof reference.provenance?.locationKey === "string"
      )
    ) {
      await reconcileSpecialLocationSlot({
        actor: { tenantId: payload.tenantId, userId: payload.userId },
        seriesId: raw.seriesId,
        referenceType: specialData.input.referenceType,
        label:
          specialData.input.referenceImages[0]?.label ??
          specialData.input.referenceType,
        mediaAssetIds: specialData.input.referenceImages.map(
          reference => reference.mediaAssetId
        ),
      }).catch(error => {
        const message =
          error instanceof Error ? error.message : "location link failed";
        throw new Error(`SPECIAL_LOCATION_LINK_FAILED: ${message}`);
      });
    }
    if (llmUsage) {
      const skillRunId =
        payload.idempotencyKey ??
        `vd-special-tie-in:${payload.tenantId}:${raw.episodeId}:${raw.inputVersion}`;
      billedSkillRunId = skillRunId;
      billedAmount = calculateCreditsForLLM(
        llmUsage.inputTokens,
        llmUsage.outputTokens,
        llmUsage.model
      );
      await deductCredits({
        userId: payload.userId,
        tenantId: payload.tenantId,
        amount: billedAmount,
        description: `Vertical Drama — create special tie-in prompts (episode #${raw.episodeId})`,
        idempotencyKey: skillRunId,
        skillRunId,
        skillSlug: "idea-to-video-prompt",
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_special_tie_in",
          model: llmUsage.model,
          inputTokens: llmUsage.inputTokens,
          outputTokens: llmUsage.outputTokens,
          seriesId: raw.seriesId,
          episodeId: raw.episodeId,
          inputVersion: raw.inputVersion,
          jobId: execution.jobId,
          traceId: execution.traceId,
        },
      });
      billingSettled = true;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Special skill failed";
    const errorCode = errorMessage.startsWith("SPECIAL_SAFETY_BLOCKED")
      ? "SPECIAL_SAFETY_BLOCKED"
      : errorMessage.startsWith("SPECIAL_OUTPUT_INVALID")
        ? "SPECIAL_OUTPUT_INVALID"
        : errorMessage.startsWith("SPECIAL_MODEL_UNAVAILABLE")
          ? "SPECIAL_MODEL_UNAVAILABLE"
          : errorMessage.startsWith("SPECIAL_MODEL_INCOMPATIBLE")
            ? "SPECIAL_MODEL_INCOMPATIBLE"
            : errorMessage.startsWith("SPECIAL_LOCATION_LINK_FAILED")
              ? "SPECIAL_LOCATION_LINK_FAILED"
              : "SPECIAL_SKILL_FAILED";
    await db
      .update(verticalDramaEpisodes)
      .set({
        specialData: {
          ...specialData,
          skillRun: {
            ...specialData.skillRun,
            status: "failed",
            attempt,
            startedAt,
            completedAt: new Date().toISOString(),
            errorCode,
            errorMessage: errorMessage.slice(0, 1000),
          },
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodes.id, raw.episodeId),
          eq(verticalDramaEpisodes.tenantId, payload.tenantId),
          eq(verticalDramaEpisodes.userId, payload.userId),
          sql`${verticalDramaEpisodes.specialData}->>'createIntentId' = ${specialData.createIntentId}`,
          sql`${verticalDramaEpisodes.specialData}->>'inputVersion' = ${String(raw.inputVersion)}`
        )
      );
    throw error;
  }
  const nextOutputVersion = specialData.outputVersion + 1;
  const personBindings = specialData.referenceBindings.filter(
    binding => binding.role === "person"
  );
  const productReferenceAssetIds = specialData.referenceBindings
    .filter(binding => binding.role !== "person")
    .map(binding => binding.mediaAssetId);
  const promptReady = output.status !== "needs_clarification";
  const startFramePlan = promptReady
    ? {
        mode: "single_frame_per_shot",
        selectedImageModelId: specialData.input.imageModelId,
        aspectRatio: "9:16",
        frames: output.shots.map(shot => ({
          shotNumber: shot.shot_number,
          imagePrompt: shot.image_prompt,
          negativePrompt: "",
          requiredCharacterRefs: personBindings.map(binding =>
            String(binding.provenance.characterKey ?? binding.skillReferenceId)
          ),
          productReferenceAssetIds,
          referenceAssetIds: shot.reference_ids,
        })),
      }
    : null;
  const motionPromptPack = promptReady
    ? {
        selectedVideoModelId: specialData.input.videoModelId,
        durationProfileId: `vertical_drama_special_${output.shot_duration_seconds}s_variable_shots`,
        motionMode: "image_to_video",
        aspectRatio: "9:16",
        clips: output.shots.map(shot => ({
          clipNumber: shot.shot_number,
          sourceShotNumbers: [shot.shot_number],
          prompt: shot.video_prompt,
          durationSeconds: output.shot_duration_seconds,
          referenceIds: shot.reference_ids,
        })),
      }
    : null;
  const nextData: SpecialEpisodeData = {
    ...specialData,
    outputVersion: nextOutputVersion,
    skillRun: {
      ...specialData.skillRun,
      status: promptReady ? "succeeded" : "needs_clarification",
      attempt,
      startedAt,
      completedAt: new Date().toISOString(),
      errorCode: undefined,
      errorMessage: undefined,
    },
    output: {
      shotCount: output.shot_count,
      assumptions: output.assumptions,
      qualityControl: output.quality_control,
    },
  };
  let updated: Array<{ id: number }>;
  try {
    updated = await db
      .update(verticalDramaEpisodes)
      .set({
        specialData: nextData,
        startFramePlan,
        motionPromptPack,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodes.id, raw.episodeId),
          eq(verticalDramaEpisodes.tenantId, payload.tenantId),
          eq(verticalDramaEpisodes.userId, payload.userId),
          sql`${verticalDramaEpisodes.specialData}->>'createIntentId' = ${specialData.createIntentId}`,
          sql`${verticalDramaEpisodes.specialData}->>'inputVersion' = ${String(raw.inputVersion)}`
        )
      )
      .returning({ id: verticalDramaEpisodes.id });
  } catch (error) {
    if (billingSettled && billedSkillRunId) {
      await refundCredits({
        userId: payload.userId,
        tenantId: payload.tenantId,
        amount: billedAmount,
        description: `Refund failed special tie-in output persistence (episode #${raw.episodeId})`,
        skillRunId: billedSkillRunId,
        skillSlug: "idea-to-video-prompt",
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_special_tie_in",
          episodeId: raw.episodeId,
          inputVersion: raw.inputVersion,
          reason: "special_output_persistence_failed",
        },
      }).catch(refundError => {
        console.error(
          "[VerticalDramaSpecial] failed to compensate billing after output persistence failure",
          refundError
        );
      });
    }
    throw error;
  }
  if (!updated.length) {
    if (billingSettled && billedSkillRunId) {
      await refundCredits({
        userId: payload.userId,
        tenantId: payload.tenantId,
        amount: billedAmount,
        description: `Refund stale special tie-in output (episode #${raw.episodeId})`,
        skillRunId: billedSkillRunId,
        skillSlug: "idea-to-video-prompt",
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_special_tie_in",
          episodeId: raw.episodeId,
          inputVersion: raw.inputVersion,
          reason: "special_output_update_stale",
        },
      });
    }
    return {
      shotCount: 0,
      outputVersion: specialData.outputVersion,
      promptReady: false,
    };
  }
  return {
    shotCount: output.shot_count,
    outputVersion: nextOutputVersion,
    promptReady,
  };
}
