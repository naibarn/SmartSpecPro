import { createHash } from "node:crypto";
import fs from "fs";
import path from "path";
import { parseSkillFile } from "@smartspec/skills";
import { z } from "zod";

import {
  executeVisionAwareJsonCallWithRetry,
  type VisionAwareImageInput,
  type VisionAwareCallResponse,
} from "./verticalDramaStoryBible";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import { selectHighConfidenceVerticalDramaSpeakerSuggestions } from "./verticalDramaSpeakerVisualAttribution";
import type {
  VerticalDramaDetectedShotPerson,
} from "@shared/verticalDramaSeries/speakerVisualBinding";
import { detectVerticalDramaShotPeopleDirect } from "./verticalDramaSpeakerVisualDetection";
import { generateVerticalDramaShotVideoPromptDirect } from "./verticalDramaVideoMotionPromptGeneration";
import {
  calculateCreditsForLLMDynamic,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import { getSkillRunCreditCost } from "./skillRevenueBilling";
import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { isCompleteStagedVideoPrompt } from "./marketplaceAutoReviewStagedPromptCompiler";
import {
  type SequentialReferenceManifestEntry,
} from "./productReviewSequentialStoryboardSkillRunner";
import {
  isStagedCastMemberMinor,
  removeStagedMinorDialogueLines,
  selectStagedLeadCast,
  type StagedCastMember,
  type StagedDialogueTurn,
  type StagedStoryArcShot,
} from "./marketplaceAutoReviewStoryArcPlanner";

export const MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL =
  "vertical-drama-speaker-visual-detection";
export const MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL =
  "vertical-drama-speaker-visual-attribution";
export const MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL =
  "vertical-drama-shot-video-prompt";

type Usage = {
  promptTokens: number;
  completionTokens: number;
  providerName: string;
};
type DirectUsageObserver = (
  response: VisionAwareCallResponse,
  requestedModel: string,
  providerName: string
) => void;

export type MarketplaceVideoPromptProgress = {
  progress: number;
  stage: string;
  message: string;
};

export type MarketplaceVideoPromptSkillRun = {
  skill: string;
  model: string;
  provider: string;
  estimatedCredits: number;
};

export type MarketplaceSpeakerVisualReference = {
  speakerLabel: string;
  castId: string;
  url: string;
};

export type GenerateMarketplaceAutoReviewVideoPromptInput = {
  userId: number;
  tenantId: string;
  publicUrl?: string | null;
  runId: string;
  shotId: number;
  approvedImageUrl: string;
  promptModel?: string | null;
  requestIdempotencyKey: string;
  shot: StagedStoryArcShot;
  speakerVisualBindings?: Record<string, string>;
  /** Reuse a separately approved-frame-bound detection result when the user
   *  has reviewed speaker identities before generating the video prompt. */
  detectedPeople?: VerticalDramaDetectedShotPerson[];
  detectedPeopleSkillRun?: MarketplaceVideoPromptSkillRun;
  cast: readonly StagedCastMember[];
  productName: string;
  productFacts: string[];
  referenceManifest: readonly SequentialReferenceManifestEntry[];
  instruction?: string | null;
  onProgress?: (progress: MarketplaceVideoPromptProgress) => Promise<void>;
};

export async function detectMarketplaceAutoReviewShotPeople(input: {
  userId: number;
  tenantId: string;
  publicUrl?: string | null;
  runId: string;
  shotId: number;
  approvedImageUrl: string;
  promptModel?: string | null;
  requestIdempotencyKey: string;
  dialogue?: string;
  speakerReferences?: readonly MarketplaceSpeakerVisualReference[];
  singleSpeakerDialogueFallback?: string;
  onProgress?: (progress: MarketplaceVideoPromptProgress) => Promise<void>;
}): Promise<{
  detectedPeople: VerticalDramaDetectedShotPerson[];
  model: string;
  provider: string;
  estimatedCredits: number;
  skillRun: MarketplaceVideoPromptSkillRun;
  speakerVisualBindings: Record<string, string>;
  speakerVisualMatchIssue?:
    | "dialogue_invalid"
    | "speaker_reference_missing"
    | "no_people_detected"
    | "ambiguous_match"
    | "attribution_unavailable";
  attributionSkillRun?: MarketplaceVideoPromptSkillRun;
}> {
  const approvedFrame = absoluteUrl(input.approvedImageUrl, input.publicUrl);
  const detectionModel = await resolveDirectVisionModel(
    MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    input.promptModel
  );
  await assertCreditPreflight({
    userId: input.userId,
    tenantId: input.tenantId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
  });
  await input.onProgress?.({
    progress: 15,
    stage: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    message: `กำลังตรวจจับบุคคลจากภาพที่อนุมัติ · Shot ${input.shotId}`,
  });

  const usage = { current: null as Usage | null };
  let detection: Awaited<ReturnType<typeof detectVerticalDramaShotPeopleDirect>>;
  try {
    detection = await detectVerticalDramaShotPeopleDirect({
      userId: input.userId,
      tenantId: input.tenantId,
      shotNumber: input.shotId,
      imageUrl: approvedFrame,
      model: detectionModel.modelId,
      publicUrl: input.publicUrl,
      onUsage: collectUsageObserver(usage),
    });
  } catch (error) {
    if (usage.current) {
      await chargeActualUsage({
        userId: input.userId,
        tenantId: input.tenantId,
        runId: input.runId,
        shotId: input.shotId,
        skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
        modelId: detectionModel.modelId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        usage: usage.current,
      });
    }
    throw error;
  }
  const estimatedCredits = await chargeActualUsage({
    userId: input.userId,
    tenantId: input.tenantId,
    runId: input.runId,
    shotId: input.shotId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    modelId: detectionModel.modelId,
    providerName: detection.providerName,
    requestIdempotencyKey: input.requestIdempotencyKey,
    usage: usage.current,
  });
  let speakerVisualBindings: Record<string, string> = {};
  let speakerVisualMatchIssue:
    | "dialogue_invalid"
    | "speaker_reference_missing"
    | "no_people_detected"
    | "ambiguous_match"
    | "attribution_unavailable"
    | undefined;
  let attributionSkillRun: MarketplaceVideoPromptSkillRun | undefined;
  if (input.dialogue !== undefined && input.speakerReferences !== undefined) {
    try {
      const attribution = await matchMarketplaceAutoReviewShotSpeakers({
        userId: input.userId,
        tenantId: input.tenantId,
        publicUrl: input.publicUrl,
        runId: input.runId,
        shotId: input.shotId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        approvedImageUrl: approvedFrame,
        dialogue: input.dialogue,
        singleSpeakerDialogueFallback: input.singleSpeakerDialogueFallback,
        people: detection.people,
        references: input.speakerReferences,
        promptModel: input.promptModel,
        onProgress: input.onProgress,
      });
      speakerVisualBindings = attribution.bindings;
      speakerVisualMatchIssue = attribution.issue;
      attributionSkillRun = attribution.skillRun;
    } catch (error) {
      console.warn("[MarketplaceSpeakerAttribution] Matching unavailable:",
        error instanceof Error ? error.message : error
      );
      speakerVisualMatchIssue = "attribution_unavailable";
    }
  }
  return {
    detectedPeople: detection.people,
    model: detectionModel.modelId,
    provider: detection.providerName,
    estimatedCredits,
    skillRun: {
      skill: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
      model: detectionModel.modelId,
      provider: detection.providerName,
      estimatedCredits,
    },
    speakerVisualBindings,
    ...(speakerVisualMatchIssue ? { speakerVisualMatchIssue } : {}),
    ...(attributionSkillRun ? { attributionSkillRun } : {}),
  };
}

const marketplaceSpeakerAttributionSchema = z
  .object({
    speakers: z
      .array(
        z
          .object({
            speaker_label: z.string().trim().min(1).max(120),
            candidates: z
              .array(
                z
                  .object({
                    person_id: z.string().trim().min(1).max(64),
                    identity_confidence: z.number().min(0).max(1),
                    evidence: z.string().max(240),
                  })
                  .strict()
              )
              .max(3),
          })
          .strict()
      )
      .max(12),
  })
  .strict();

function loadSpeakerVisualAttributionSkill(): string {
  const folder = path.join("skills", MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL);
  for (const dir of resolveSkillDirCandidates(folder)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (content?.trim()) return content;
  }
  throw new Error(
    `MARKETPLACE_SKILL_BODY_NOT_FOUND:${MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL}`
  );
}

function normalizeSpeakerLabel(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function inferMarketplaceSingleSpeakerDialogueDefault(
  cast: readonly StagedCastMember[]
): string | undefined {
  const eligibleSpeakers = selectStagedLeadCast([...cast]);
  if (eligibleSpeakers.length !== 1) return undefined;
  return eligibleSpeakers[0]!.name.trim() || undefined;
}

function inferSingleShotDialogueSpeaker(
  shot: Pick<StagedStoryArcShot, "castInShot">,
  cast: readonly StagedCastMember[]
): string | undefined {
  // The story planner emits plain narration when there is one eligible
  // lead, even if silent supporting characters also appear in the frame.
  const leads = selectStagedLeadCast([...cast]);
  if (leads.length !== 1) return undefined;
  const speaker = leads[0]!;
  const selectedCastIds = shot.castInShot ?? [];
  if (
    selectedCastIds.length > 0 &&
    !selectedCastIds.includes(speaker.castId)
  ) {
    return undefined;
  }
  return speaker.name.trim() || undefined;
}

async function matchMarketplaceAutoReviewShotSpeakers(input: {
  userId: number;
  tenantId: string;
  publicUrl?: string | null;
  runId: string;
  shotId: number;
  requestIdempotencyKey: string;
  approvedImageUrl: string;
  dialogue: string;
  singleSpeakerDialogueFallback?: string;
  people: VerticalDramaDetectedShotPerson[];
  references: readonly MarketplaceSpeakerVisualReference[];
  promptModel?: string | null;
  onProgress?: (progress: MarketplaceVideoPromptProgress) => Promise<void>;
}): Promise<{
  bindings: Record<string, string>;
  issue?:
    | "dialogue_invalid"
    | "speaker_reference_missing"
    | "no_people_detected"
    | "ambiguous_match"
    | "attribution_unavailable";
  skillRun?: MarketplaceVideoPromptSkillRun;
}> {
  let dialogue: Array<{ speaker: string; line: string }>;
  try {
    dialogue = parseDialogue(input.dialogue, input.singleSpeakerDialogueFallback);
  } catch {
    return { bindings: {}, issue: "dialogue_invalid" };
  }
  const speakers = Array.from(
    new Map(dialogue.map(turn => [normalizeSpeakerLabel(turn.speaker), turn.speaker])).values()
  );
  if (!speakers.length) return { bindings: {}, issue: "dialogue_invalid" };
  if (!input.people.length) return { bindings: {}, issue: "no_people_detected" };

  const referencesByLabel = new Map<string, MarketplaceSpeakerVisualReference[]>();
  for (const reference of input.references) {
    const key = normalizeSpeakerLabel(reference.speakerLabel);
    const entries = referencesByLabel.get(key) ?? [];
    entries.push(reference);
    referencesByLabel.set(key, entries);
  }
  const exactReferences = speakers.map(speaker => {
    const entries = referencesByLabel.get(normalizeSpeakerLabel(speaker)) ?? [];
    return entries.length === 1 ? entries[0] : undefined;
  });
  if (
    exactReferences.some(reference => !reference?.url.trim()) ||
    new Set(exactReferences.map(reference => reference?.url.trim())).size !== speakers.length
  ) {
    return { bindings: {}, issue: "speaker_reference_missing" };
  }

  const model = await resolveDirectVisionModel(
    MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL,
    input.promptModel
  );
  await assertCreditPreflight({
    userId: input.userId,
    tenantId: input.tenantId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL,
  });
  await input.onProgress?.({
    progress: 55,
    stage: MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL,
    message: `กำลังจับคู่ผู้พูดกับภาพตัวละครตามบท · Shot ${input.shotId}`,
  });

  const images: VisionAwareImageInput[] = [
    {
      url: input.approvedImageUrl,
      label: "CURRENT APPROVED SHOT IMAGE. Match only the listed detected person IDs in this image.",
    },
    ...exactReferences.map((reference, index) => ({
      url: absoluteUrl(reference!.url, input.publicUrl),
      label: `CAST PORTRAIT FOR EXACT DIALOGUE SPEAKER ${JSON.stringify(speakers[index])} (${reference!.castId}). This image is the visual identity reference for that exact label.`,
    })),
  ];
  const usage = { current: null as Usage | null };
  let outcome: Awaited<
    ReturnType<typeof executeVisionAwareJsonCallWithRetry<z.infer<typeof marketplaceSpeakerAttributionSchema>>>
  >;
  try {
    outcome = await executeVisionAwareJsonCallWithRetry<
      z.infer<typeof marketplaceSpeakerAttributionSchema>
    >({
      model: model.modelId,
      systemPrompt: `${loadSpeakerVisualAttributionSkill()}\n\nACTIVE MODE: marketplace_cast_portrait. Follow the Marketplace cast portrait mode rules. The exact Name: line entries below link approved dialogue labels to the supplied cast portrait labeled for each speaker. Use visual face/appearance identity only to link each portrait to one detected person in the current frame. Never assign by dialogue order, sentence meaning, gaze, mouth pose, or screen position. Do not infer which person is actively speaking from a still frame. Abstain if any speaker does not have one clear visual match.\n\nSTRICT RESPONSE CONTRACT: Return one JSON object only: {"speakers":[{"speaker_label":"exact supplied label","candidates":[{"person_id":"exact supplied detected-person ID","identity_confidence":0.0,"evidence":"short visual identity reason"}]}]}. Include each supplied speaker label once. Return no candidate when uncertain.`,
      userPromptText: JSON.stringify({
        mode: "marketplace_cast_portrait",
        shot_number: input.shotId,
        approved_dialogue: dialogue,
        detected_people: input.people.map(person => ({
          id: person.id,
          bounding_box: person.boundingBox,
          appearance: person.appearance,
          detection_confidence: person.confidence,
        })),
        cast_portrait_references: exactReferences.map((reference, index) => ({
          speaker_label: speakers[index],
          cast_id: reference!.castId,
          image_index: index + 2,
        })),
        output_instructions:
          "Use each exact speaker_label from approved_dialogue, and return only person_id values from detected_people. A person may map to at most one speaker. Identity must be supported by visual similarity between that speaker's labeled cast portrait and the detected person. Dialogue text supplies labels and lines only; it is not identity or active-speech evidence.",
      }),
      hasVision: true,
      images,
      userId: input.userId,
      tenantId: input.tenantId,
      publicUrl: input.publicUrl,
      schema: marketplaceSpeakerAttributionSchema,
      firstAttemptMaxTokens: 1600,
      retryMaxTokens: 2200,
      singleAttempt: true,
      onUsage: collectUsageObserver(usage),
    });
  } catch (error) {
    if (usage.current) {
      await chargeActualUsage({
        userId: input.userId,
        tenantId: input.tenantId,
        runId: input.runId,
        shotId: input.shotId,
        skillSlug: MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL,
        modelId: model.modelId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        usage: usage.current,
      });
    }
    console.warn("[MarketplaceSpeakerAttribution] Skill call failed:",
      error instanceof Error ? error.message : error
    );
    return { bindings: {}, issue: "attribution_unavailable" };
  }

  const estimatedCredits = await chargeActualUsage({
    userId: input.userId,
    tenantId: input.tenantId,
    runId: input.runId,
    shotId: input.shotId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL,
    modelId: outcome.response.model?.trim() || model.modelId,
    providerName: outcome.providerName,
    requestIdempotencyKey: input.requestIdempotencyKey,
    usage: usage.current,
  });
  const requestedSpeakerKeys = new Set(speakers.map(normalizeSpeakerLabel));
  const returnedSpeakerKeys = outcome.data.speakers.map(result =>
    normalizeSpeakerLabel(result.speaker_label)
  );
  if (
    returnedSpeakerKeys.length !== requestedSpeakerKeys.size ||
    new Set(returnedSpeakerKeys).size !== requestedSpeakerKeys.size ||
    returnedSpeakerKeys.some(key => !requestedSpeakerKeys.has(key))
  ) {
    return {
      bindings: {},
      issue: "ambiguous_match",
      skillRun: {
        skill: MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL,
        model: outcome.response.model?.trim() || model.modelId,
        provider: outcome.providerName,
        estimatedCredits,
      },
    };
  }
  const suggestions = selectHighConfidenceVerticalDramaSpeakerSuggestions({
    speakers: speakers.map(speakerLabel => ({ speakerLabel })),
    people: input.people,
    output: outcome.data,
  });
  const bindings = Object.fromEntries(
    suggestions.map(suggestion => [suggestion.speakerLabel, suggestion.personId])
  );
  if (
    speakers.some(speaker => !bindings[speaker]) ||
    new Set(Object.values(bindings)).size !== speakers.length
  ) {
    return {
      bindings: {},
      issue: "ambiguous_match",
      skillRun: {
        skill: MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL,
        model: outcome.response.model?.trim() || model.modelId,
        provider: outcome.providerName,
        estimatedCredits,
      },
    };
  }
  return {
    bindings,
    skillRun: {
      skill: MARKETPLACE_VERTICAL_DRAMA_ATTRIBUTION_SKILL,
      model: outcome.response.model?.trim() || model.modelId,
      provider: outcome.providerName,
      estimatedCredits,
    },
  };
}

function clean(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function absoluteUrl(value: string, publicUrl?: string | null): string {
  if (/^https?:\/\//i.test(value)) return value;
  const base = publicUrl?.trim();
  if (!base) throw new Error("MARKETPLACE_PUBLIC_BASE_URL_REQUIRED");
  return new URL(value, `${base.replace(/\/+$/, "")}/`).toString();
}

function parseDialogue(
  dialogue: string,
  defaultSpeaker?: string | null
): Array<{ speaker: string; line: string }> {
  const fallbackSpeaker = defaultSpeaker?.trim();
  const lines = dialogue
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^([^:\n]{1,100}):\s*(.+)$/);
      if (match) return { speaker: match[1].trim(), line: match[2].trim() };
      return fallbackSpeaker ? { speaker: fallbackSpeaker, line } : null;
    });
  if (lines.some(line => line === null)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_DIALOGUE_INVALID");
  }
  return lines as Array<{ speaker: string; line: string }>;
}

function minorSpeechSafetyLock(cast: readonly StagedCastMember[]): string | null {
  const minors = cast.filter(isStagedCastMemberMinor);
  if (minors.length === 0) return null;
  const names = minors.map(member => `${member.name} (${member.castId})`).join(", ");
  return `MINOR SPEECH SAFETY LOCK (mandatory): ${names} are under 18. They must never speak, narrate, sing, ad-lib, or lip-sync. Keep their mouths closed and keep them silent throughout the clip. Remove any dialogue assigned to them. If adult dialogue remains, only its named adult speaker may move their mouth; otherwise use no speech and keep only ambient sound. กฎบังคับ: ตัวละครที่ระบุอายุต่ำกว่า 18 ปี ห้ามพูด บรรยาย ร้องเพลง หรือขยับปากตามเสียง ให้เงียบและปิดปากตลอดคลิป หากไม่มีบทผู้ใหญ่ที่อนุมัติ ให้ใช้เสียงบรรยากาศโดยไม่มีบทพูด`;
}

function filterMinorDialogueTurns<T extends { speaker: string }>(
  turns: T[],
  cast: readonly StagedCastMember[]
): T[] {
  const membersByName = new Map(
    cast.map(member => [member.name.normalize("NFKC").trim().toLowerCase(), member])
  );
  return turns.filter(turn => {
    const member = membersByName.get(
      turn.speaker.normalize("NFKC").trim().toLowerCase()
    );
    return !member || !isStagedCastMemberMinor(member);
  });
}

function modelMatches(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function resolveDirectVisionModel(
  skillSlug: string,
  requestedModel?: string | null
) {
  const skill = await getSkillByIdAsync(skillSlug);
  if (!skill) throw new Error(`MARKETPLACE_SKILL_NOT_FOUND:${skillSlug}`);
  const policy = await resolveSkillExecutionPolicy({
    skill,
    conversationModel: requestedModel?.trim() || null,
  });
  const modelId = policy.modelId?.trim();
  if (!modelId)
    throw new Error(`MARKETPLACE_SKILL_MODEL_NOT_CONFIGURED:${skillSlug}`);
  if (/^wllm_[A-Za-z0-9_-]{8,128}$/.test(modelId)) {
    throw new Error(
      `MARKETPLACE_SKILL_DIRECT_EXECUTION_REQUIRES_PROVIDER_MODEL:${skillSlug}`
    );
  }

  const rows = await loadEnabledLlmModelRows();
  const model = rows.find(row =>
    [row.modelId, row.providerModelId, ...(row.legacyModelAliases ?? [])]
      .filter((value): value is string => typeof value === "string")
      .some(value => modelMatches(value, modelId))
  );
  if (!model || model.supportsVision !== true) {
    throw new Error(
      `MARKETPLACE_SKILL_REQUIRES_VISION_MODEL:${skillSlug}:${modelId}`
    );
  }
  return { modelId, allowFreeModels: policy.allowFreeModels };
}

function makeChargeKey(input: {
  runId: string;
  shotId: number;
  requestIdempotencyKey: string;
  skillSlug: string;
}): string {
  const digest = createHash("sha256")
    .update(
      `${input.runId}\n${input.shotId}\n${input.requestIdempotencyKey}\n${input.skillSlug}`
    )
    .digest("hex");
  return `marketplace-auto-review-skill:${digest}`;
}

async function assertCreditPreflight(input: {
  userId: number;
  tenantId: string;
  skillSlug: string;
}) {
  const credits = await getSkillRunCreditCost({
    skillSlug: input.skillSlug,
    tenantId: input.tenantId,
  });
  if (!(await hasEnoughCredits(input.userId, credits))) {
    throw new Error(
      `MARKETPLACE_SKILL_INSUFFICIENT_CREDITS:${input.skillSlug}`
    );
  }
}

async function chargeActualUsage(input: {
  userId: number;
  tenantId: string;
  runId: string;
  shotId: number;
  skillSlug: string;
  modelId: string;
  providerName?: string;
  requestIdempotencyKey: string;
  usage: Usage | null;
}): Promise<number> {
  if (!input.usage) {
    throw new Error(`MARKETPLACE_SKILL_USAGE_REQUIRED:${input.skillSlug}`);
  }
  const providerName = input.usage.providerName.trim();
  if (!providerName) {
    throw new Error(`MARKETPLACE_SKILL_PROVIDER_REQUIRED:${input.skillSlug}`);
  }
  if (input.providerName && input.providerName.trim() !== providerName) {
    throw new Error(`MARKETPLACE_SKILL_PROVIDER_MISMATCH:${input.skillSlug}`);
  }
  const amount = await calculateCreditsForLLMDynamic(
    input.usage.promptTokens,
    input.usage.completionTokens,
    input.modelId
  );
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`MARKETPLACE_SKILL_USAGE_COST_INVALID:${input.skillSlug}`);
  }
  if (amount > 0) {
    await deductCredits({
      userId: input.userId,
      tenantId: input.tenantId,
      amount,
      description: `Marketplace Auto Review · ${input.skillSlug} · Shot ${input.shotId}`,
      idempotencyKey: makeChargeKey(input),
      skillSlug: input.skillSlug,
      sourceType: "skill",
      metadata: {
        feature: "marketplace_auto_review",
        runId: input.runId,
        shotId: input.shotId,
        operation: input.skillSlug,
        model: input.modelId,
        provider: providerName,
      },
    });
  }
  return amount;
}

function collectUsageObserver(target: {
  current: Usage | null;
}): DirectUsageObserver {
  return (response, _requestedModel, providerName) => {
    const promptTokens = Number(response.usage?.prompt_tokens);
    const completionTokens = Number(response.usage?.completion_tokens);
    if (
      !Number.isFinite(promptTokens) ||
      promptTokens < 0 ||
      !Number.isFinite(completionTokens) ||
      completionTokens < 0
    ) {
      target.current = null;
      return;
    }
    target.current = {
      promptTokens,
      completionTokens,
      providerName,
    };
  };
}

function formatDetectedPeople(
  people: readonly VerticalDramaDetectedShotPerson[]
): string {
  if (!people.length)
    return "No visible people were detected in the approved image.";
  return people
    .map(person => {
      const box = person.boundingBox;
      return `- ${person.id}: ${person.appearance}; normalized region x=${box.x.toFixed(3)}, y=${box.y.toFixed(3)}, width=${box.width.toFixed(3)}, height=${box.height.toFixed(3)}; confidence=${person.confidence.toFixed(2)}`;
    })
    .join("\n");
}

type MarketplaceSpeakerVisualEntry = {
  name: string;
  position: string;
  detected_person_id?: string;
};

const MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS = 3000;

const MARKETPLACE_OBJECT_CONTINUITY_LOCK =
  "Preserve visible objects and existing printed labels. Add an object only if the approved action explicitly requires it.";
const MARKETPLACE_NO_ADDED_VIDEO_TEXT_LOCK =
  "Do not add subtitles, captions, or other on-screen text.";
const MARKETPLACE_SPEAKER_TURN_TAKING_LOCK =
  "Only the current speaker moves their mouth. Everyone else stays silent with mouths closed.";

const CAMERA_CUES = {
  locked: "Keep the camera steady.",
  slow_push_in: "Use a very slow push-in.",
  slow_push_in_drift_right: "Use a very slow push-in with a slight rightward camera drift.",
  slow_push_in_drift_left: "Use a very slow push-in with a slight leftward camera drift.",
  slow_pull_back: "Use a gentle pullback.",
  slow_pan_left: "Use a slow leftward pan.",
  slow_pan_right: "Use a slow rightward pan.",
  gentle_tilt_up: "Use a gentle upward tilt.",
  gentle_tilt_down: "Use a gentle downward tilt.",
  gentle_tracking: "Use a restrained camera tracking move.",
} as const;

function cameraCue(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const key = value.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (key === "push_in") return CAMERA_CUES.slow_push_in;
  if (key === "pull_back") return CAMERA_CUES.slow_pull_back;
  if (Object.hasOwn(CAMERA_CUES, key)) {
    return CAMERA_CUES[key as keyof typeof CAMERA_CUES];
  }
}

export type MarketplaceVideoSpeakerBinding = {
  speaker: string;
  line: string;
  person: Pick<VerticalDramaDetectedShotPerson, "id" | "appearance">;
  cue: string;
};

export function renderMarketplaceVideoSpeakerSections(
  bindings: readonly MarketplaceVideoSpeakerBinding[]
): string {
  const normalizedName = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const uniqueBindings = bindings.filter(
    (binding, index) =>
      bindings.findIndex(
        item => normalizedName(item.speaker) === normalizedName(binding.speaker)
      ) === index
  );
  if (!bindings.length) {
    return "Use natural ambient sound with no speech.";
  }
  return [
    "SPEAKER VISUAL MAP FOR THIS SHOT:",
    ...uniqueBindings.map(binding => {
      const appearance = clean(binding.person.appearance, 100);
      return `- ${binding.speaker}: ${binding.cue}${appearance ? ` — ${appearance}` : ""}`;
    }),
    "",
    "Approved dialogue: Speak naturally. Use these lines once, in order, with no overlap or extra dialogue.",
    ...bindings.map(
      (binding, index) => `${index + 1}. ${binding.speaker}: “${binding.line}”`
    ),
    "",
    MARKETPLACE_SPEAKER_TURN_TAKING_LOCK,
  ].join("\n");
}

function marketplaceApprovedShotAction(shot: StagedStoryArcShot): string {
  return clean(shot.approvedShotAction, 420) ||
    clean(shot.visualSummary, 420) ||
    clean(shot.movementDirection, 260);
}

function positionTargetX(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();
  if (/far[- ]left/.test(normalized)) return 0.08;
  if (/center[- ]left|centre[- ]left/.test(normalized)) return 0.4;
  if (/\bleft\b/.test(normalized)) return 0.25;
  if (/far[- ]right/.test(normalized)) return 0.92;
  if (/center[- ]right|centre[- ]right/.test(normalized)) return 0.6;
  if (/\bright\b/.test(normalized)) return 0.75;
  if (/center|centre|middle/.test(normalized)) return 0.5;
  return undefined;
}

export function isMarketplaceAutoReviewVideoPromptComplete(input: {
  value: unknown;
  approvedDialogue: string;
  detectedPersonIds?: readonly string[];
  derivedDialogueTurns?: readonly StagedDialogueTurn[];
  cast?: readonly StagedCastMember[];
}): boolean {
  const validator = isCompleteStagedVideoPrompt as unknown as (
    ...args: unknown[]
  ) => boolean;
  const detectedPersonIds = input.detectedPersonIds ?? [];
  // This working tree may contain the in-flight v2 validator signature while
  // canonical HEAD still uses the v1 argument order. Keep callsites safe on
  // both revisions without changing the validator owned by that work.
  return validator.length >= 5
    ? validator(
        input.value,
        input.approvedDialogue,
        detectedPersonIds,
        input.derivedDialogueTurns,
        input.cast
      )
    : validator(
        input.value,
        input.approvedDialogue,
        input.derivedDialogueTurns,
        input.cast,
        detectedPersonIds
      );
}

function buildAuthoritativeSpeakerSections(input: {
  shotId: number;
  dialogue: Array<{ speaker: string; line: string }>;
  detectedPeople: readonly VerticalDramaDetectedShotPerson[];
  frameAnalysisPeople: readonly MarketplaceSpeakerVisualEntry[];
  speakerVisualBindings?: Record<string, string>;
}): string {
  const matchError = (reason: string) => {
    console.warn("[MarketplaceVideoPrompt] speaker matching failed", {
      shotId: input.shotId,
      reason,
      speakerCount: new Set(input.dialogue.map(turn => turn.speaker)).size,
      detectedPeople: input.detectedPeople.map(person => ({
        id: person.id,
        centerX: Math.round((person.boundingBox.x + person.boundingBox.width / 2) * 100) / 100,
      })),
      frameAnalysis: input.frameAnalysisPeople.map(person => ({
        position: person.position,
        detectedPersonId: person.detected_person_id,
      })),
    });
    return new Error(
      `MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING:shot-${input.shotId}:${reason}`
    );
  };
  const normalizedName = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const usedPersonIds = new Set<string>();
  const bySpeaker = new Map<
    string,
    { person: VerticalDramaDetectedShotPerson; cue: string }
  >();
  const bindings = input.dialogue.map(turn => {
    const speakerKey = normalizedName(turn.speaker);
    const previous = bySpeaker.get(speakerKey);
    if (previous) return { ...turn, ...previous };
    const userBoundId = input.speakerVisualBindings?.[turn.speaker];
    if (input.speakerVisualBindings && !userBoundId) {
      throw matchError("manual-speaker-binding-missing");
    }
    if (userBoundId) {
      const person = input.detectedPeople.find(candidate => candidate.id === userBoundId);
      if (!person) throw matchError("manual-detected-person-id");
      if (usedPersonIds.has(person.id)) {
        throw matchError("manual-detected-person-already-used");
      }
      usedPersonIds.add(person.id);
      const cue = person.id;
      bySpeaker.set(speakerKey, { person, cue });
      return { ...turn, person, cue };
    }
    const matches = input.frameAnalysisPeople.filter(
      person => normalizedName(person.name) === speakerKey
    );
    if (matches.length !== 1) {
      throw matchError("speaker-label");
    }
    const analysis = matches[0]!;
    const explicitId = analysis.detected_person_id?.trim();
    const explicitPerson = explicitId
      ? input.detectedPeople.find(person => person.id === explicitId)
      : undefined;
    if (explicitId && !explicitPerson) throw matchError("detected-person-id");
    const targetX = positionTargetX(analysis.position);
    if (
      explicitPerson &&
      targetX !== undefined &&
      Math.abs(
        explicitPerson.boundingBox.x + explicitPerson.boundingBox.width / 2 - targetX
      ) >= 0.34
    ) {
      throw matchError("detected-person-position-conflict");
    }
    let person =
      explicitPerson && !usedPersonIds.has(explicitPerson.id)
        ? explicitPerson
        : undefined;
    if (!person) {
      if (targetX === undefined) {
        throw matchError("speaker-position");
      }
      const positionalCandidates = input.detectedPeople
        .map(candidate => ({
          person: candidate,
          distance: Math.abs(
            candidate.boundingBox.x + candidate.boundingBox.width / 2 - targetX
          ),
        }))
        .sort((left, right) => left.distance - right.distance);
      const nearestCandidate = positionalCandidates[0];
      const nextCandidate = positionalCandidates[1];
      person =
        nearestCandidate &&
        !usedPersonIds.has(nearestCandidate.person.id) &&
        (!nextCandidate ||
          nextCandidate.distance - nearestCandidate.distance >= 0.08)
          ? nearestCandidate?.person
          : undefined;
    }
    if (!person || usedPersonIds.has(person.id)) {
      throw matchError("detected-person-binding");
    }
    usedPersonIds.add(person.id);
    const cue = person.id;
    bySpeaker.set(speakerKey, { person, cue });
    return { ...turn, person, cue };
  });
  return renderMarketplaceVideoSpeakerSections(bindings);
}

export function composeMarketplaceAutoReviewVideoPrompt(input: {
  cameraMotion?: string;
  durationSeconds: number;
  speakerSections: string;
  approvedShotAction: string;
}): string {
  // If the approved action already directs the camera, use that instruction
  // alone. Never copy free-form skill prose into the final provider prompt.
  const actionDirectsCamera =
    /กล้อง\s*(?:ค่อย|แพน|เลื่อน|ขยับ|เคลื่อน|ติดตาม|นิ่ง|ซูม|ดัน|ถอย|กวาด)|มุมกล้อง|ซูม|\bcamera\s*(?::|(?:slowly\s+)?(?:moves?|pans?|tilts?|drifts?|tracks?|pushes?|pulls?|stays?|follows?)\b)|\b(?:zoom\s+(?:in|out)|push[- ]in|pull[- ]back|close[- ]up)\b/i
      .test(input.approvedShotAction);
  const camera = actionDirectsCamera
    ? ""
    : cameraCue(input.cameraMotion) ?? CAMERA_CUES.locked;
  const prompt = [
    `Create a ${input.durationSeconds}-second vertical 9:16 video using the approved image (Image 1) as the exact first frame. Preserve each person's identity and visible appearance; honor changes only when the approved action explicitly requires them. Use one continuous shot with no cuts.`,
    [
      input.approvedShotAction
        ? `APPROVED SHOT ACTION (authoritative): ${input.approvedShotAction}`
        : "Keep movement subtle and natural.",
      camera ? `Camera: ${camera} Keep the subjects and relevant visible objects in frame.` : "",
      MARKETPLACE_OBJECT_CONTINUITY_LOCK,
    ].filter(Boolean).join("\n"),
    input.speakerSections,
    MARKETPLACE_NO_ADDED_VIDEO_TEXT_LOCK,
  ].filter(Boolean).join("\n\n");
  if (prompt.length > MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_CONTENT_TOO_LONG");
  }
  return prompt;
}

export function buildMarketplaceVerticalDramaVideoPromptInput(input: {
  shotId: number;
  shot: StagedStoryArcShot;
  cast: readonly StagedCastMember[];
  productName: string;
  productFacts: string[];
  detectedPeople: readonly VerticalDramaDetectedShotPerson[];
  speakerVisualBindings?: Record<string, string>;
  characterPortraits: ReadonlyArray<{
    imageNumber: number;
    characterName: string;
    role?: string;
    descriptor?: string;
  }>;
  instruction?: string | null;
}): string {
  if (!clean(input.productName, 200)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_PRODUCT_NAME_REQUIRED");
  }
  const safeDialogueText = removeStagedMinorDialogueLines(
    input.shot.dialogue,
    input.cast
  );
  const dialogue = filterMinorDialogueTurns(
    parseDialogue(
      safeDialogueText,
      inferSingleShotDialogueSpeaker(input.shot, input.cast)
    ),
    input.cast
  );
  const productName = clean(input.productName, 200);
  const approvedShotAction = marketplaceApprovedShotAction(input.shot);
  const approvedProductFacts = input.productFacts
    .map(fact => clean(fact, 240))
    .filter(Boolean);
  const approvedProductContext = approvedShotAction
    .normalize("NFKC")
    .toLocaleLowerCase()
    .includes(productName.normalize("NFKC").toLocaleLowerCase())
    ? [
        `Product: ${productName}`,
        approvedProductFacts.length
          ? `Verified product facts:\n${approvedProductFacts.map(fact => `- ${fact}`).join("\n")}`
          : null,
      ]
        .filter((section): section is string => Boolean(section))
        .join("\n")
    : null;
  const castByName = new Map(
    input.cast.map(member => [
      member.name.normalize("NFKC").trim().toLowerCase(),
      member,
    ])
  );
  const portraitsByName = new Map(
    input.characterPortraits.map(member => [
      member.characterName.normalize("NFKC").trim().toLowerCase(),
      member,
    ])
  );
  const unknownSpeaker = dialogue.find(
    line => !castByName.has(line.speaker.normalize("NFKC").trim().toLowerCase())
  );
  if (unknownSpeaker) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SPEAKER_NOT_IN_CAST:${unknownSpeaker.speaker}`
    );
  }
  const missingPortrait = dialogue.find(line => {
    const key = line.speaker.normalize("NFKC").trim().toLowerCase();
    return castByName.has(key) && !portraitsByName.has(key);
  });
  if (missingPortrait) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SPEAKER_PORTRAIT_MISSING:${missingPortrait.speaker}`
    );
  }

  const portraitManifest = input.characterPortraits.length
    ? input.characterPortraits
        .map(
          person =>
            `- Image ${person.imageNumber} = ${person.characterName}${person.role ? ` (${person.role})` : ""}${person.descriptor ? `; reference description: ${clean(person.descriptor, 240)}` : ""}`
        )
        .join("\n")
    : "(No character portrait references are attached.)";
  const approvedDialogue = dialogue.length
    ? dialogue
        .map((line, index) => `${index + 1}. ${line.speaker}: "${line.line}"`)
        .join("\n")
    : "(No spoken dialogue is approved for this shot.)";
  const uniqueSpeakers = Array.from(new Set(dialogue.map(line => line.speaker)));
  const savedSpeakerMap = input.speakerVisualBindings
    ? uniqueSpeakers.map(speaker => {
        const personId = input.speakerVisualBindings?.[speaker];
        const person = input.detectedPeople.find(
          candidate => candidate.id === personId
        );
        return personId && person
          ? { speaker, personId, person }
          : null;
      })
    : [];
  const verifiedSpeakerMap = savedSpeakerMap.filter(
    (binding): binding is NonNullable<typeof binding> => binding !== null
  );
  const hasCompleteSavedSpeakerMap = Boolean(
    input.speakerVisualBindings &&
      uniqueSpeakers.length > 0 &&
      Object.keys(input.speakerVisualBindings).length === uniqueSpeakers.length &&
      verifiedSpeakerMap.length === uniqueSpeakers.length &&
      new Set(verifiedSpeakerMap.map(binding => binding.personId)).size ===
        uniqueSpeakers.length
  );
  if (input.speakerVisualBindings && !hasCompleteSavedSpeakerMap) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_SAVED_SPEAKER_BINDINGS_INVALID");
  }
  const speakerMatchingInstruction = hasCompleteSavedSpeakerMap
    ? [
        "SAVED SPEAKER-TO-PERSON MATCH (authoritative and already reviewed):",
        ...verifiedSpeakerMap.map(
          binding =>
            `- ${binding.speaker} = ${binding.personId} — ${clean(binding.person.appearance, 180)}`
        ),
        "Do not run visual matching again, change these assignments, or infer identity from cast/dialogue order. In JSON frame_analysis.people, echo the exact saved speaker label and detected_person_id. The application will use this saved mapping as the source of truth.",
      ].join("\n")
    : "SHOT-LOCAL SPEAKER MAP (mandatory): Before writing the prompt, compare each attached portrait with the detected people in Image 1. In JSON frame_analysis.people, include every dialogue speaker using the exact speaker label from Approved dialogue as name and detected_person_id copied from the matching person-N entry above. Include an observed position only as structured matching evidence; the final video prompt identifies people by person ID and appearance only. Do not add honorifics, translate, abbreviate, or otherwise rewrite names. Do not infer identity from cast order, dialogue order, or left-to-right order. If a visual match is ambiguous, omit that speaker rather than guessing; the application will request a safe correction.";
  return [
    `Create one video motion prompt for Marketplace Auto Review shot ${input.shotId}. This action creates prompt text only; do not render or generate a video.`,
    "Use Image 1 as the exact approved start frame and the source of truth for the people, product, blocking, and scene.",
    `Format: vertical 9:16, ${input.shot.durationSeconds} seconds.`,
    `Choose one camera preset for the prompt field: ${Object.keys(CAMERA_CUES).join(", ")}. Use locked when the requested motion does not fit a preset or the frame cannot support it.`,
    approvedProductContext,
    `Shot title: ${clean(input.shot.title, 200)}`,
    "ACTION AUTHORITY (mandatory): The APPROVED SHOT ACTION below is the only source for actor, hand, product, and prop actions. Do not add, restate, paraphrase, reorder, or contradict any physical action. Other shot notes and user instructions are secondary and must be ignored wherever they conflict with this action.",
    `APPROVED SHOT ACTION (authoritative): ${approvedShotAction}`,
    (input.shot.cameraDirection || input.shot.movementDirection)
      ? `Secondary movement notes for camera preset selection: ${clean(input.shot.cameraDirection || input.shot.movementDirection, 240)}`
      : null,
    `CHARACTER IDENTITY MAP (portraits attached after Image 1):\n${portraitManifest}`,
    `People detected from Image 1 by ${MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL}:\n${formatDetectedPeople(input.detectedPeople)}`,
    `Approved dialogue for speaker matching only; the application adds the exact dialogue later:\n${approvedDialogue}`,
    speakerMatchingInstruction,
    "This shot uses one continuous take. Choose a camera move that keeps the essential subjects and objects visible. If the approved action includes a camera instruction, use locked so the application can preserve that instruction directly. Do not invent product claims, graphics, or new label text.",
    clean(input.instruction, 1200)
      ? `Secondary user instruction; honor camera or pacing requests only when consistent with the authoritative action:\n${clean(input.instruction, 1200)}`
      : null,
    "Return the required skill JSON. In prompt, repeat only the selected camera preset key. The application composes the final prompt using the verified speaker mapping and approved action and dialogue.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

export async function generateMarketplaceAutoReviewVideoPrompt(
  input: GenerateMarketplaceAutoReviewVideoPromptInput
): Promise<{
  prompt: string;
  detectedPeople: VerticalDramaDetectedShotPerson[];
  model: string;
  provider: string;
  estimatedCredits: number;
  skillRuns: MarketplaceVideoPromptSkillRun[];
}> {
  if (!input.approvedImageUrl.trim()) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_IMAGE_REQUIRED");
  }
  if (!clean(input.productName, 200)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_PRODUCT_NAME_REQUIRED");
  }
  const approvedFrame = absoluteUrl(input.approvedImageUrl, input.publicUrl);
  if (!approvedFrame) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_IMAGE_URL_INVALID");
  }
  const safeShotDialogue = removeStagedMinorDialogueLines(
    input.shot.dialogue,
    input.cast
  );
  const defaultDialogueSpeaker = inferSingleShotDialogueSpeaker(
    input.shot,
    input.cast
  );
  const dialogue = filterMinorDialogueTurns(
    parseDialogue(safeShotDialogue, defaultDialogueSpeaker),
    input.cast
  );
  if (dialogue.reduce((size, turn) => size + turn.speaker.length + turn.line.length, 0) >=
    MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_CONTENT_TOO_LONG");
  }
  const safeSpeakerNames = new Set(
    dialogue.map(turn => turn.speaker.normalize("NFKC").trim().toLowerCase())
  );
  const safeBindingEntries = Object.entries(input.speakerVisualBindings ?? {}).filter(
    ([speaker]) =>
      safeSpeakerNames.has(speaker.normalize("NFKC").trim().toLowerCase())
  );
  const safeSpeakerVisualBindings = safeBindingEntries.length
    ? Object.fromEntries(safeBindingEntries)
    : undefined;
  const safeShot: StagedStoryArcShot = {
    ...input.shot,
    dialogue: safeShotDialogue,
    ...(input.shot.dialogueTurns
      ? {
          dialogueTurns: input.shot.dialogueTurns.filter(turn => {
            const member = input.cast.find(
              candidate => candidate.castId === turn.castId
            );
            return !member || !isStagedCastMemberMinor(member);
          }),
        }
      : {}),
  };
  if (safeShotDialogue !== input.shot.dialogue) {
    console.warn("[MarketplaceVideoPrompt] removed dialogue assigned to minor", {
      shotId: input.shotId,
      removedLines:
        input.shot.dialogue.split(/\r?\n/).filter(line => line.trim()).length -
        dialogue.length,
    });
  }
  const castNames = new Set(
    input.cast.map(member => member.name.normalize("NFKC").trim().toLowerCase())
  );
  const portraitNames = new Set(
    input.referenceManifest
      .filter(
        entry => entry.role === "character" && entry.characterName?.trim()
      )
      .map(entry => entry.characterName!.normalize("NFKC").trim().toLowerCase())
  );
  for (const line of dialogue) {
    const speaker = line.speaker.normalize("NFKC").trim().toLowerCase();
    if (!castNames.has(speaker)) {
      throw new Error(
        `MARKETPLACE_VIDEO_PROMPT_SPEAKER_NOT_IN_CAST:${line.speaker}`
      );
    }
    if (!portraitNames.has(speaker)) {
      throw new Error(
        `MARKETPLACE_VIDEO_PROMPT_SPEAKER_PORTRAIT_MISSING:${line.speaker}`
      );
    }
  }
  const characterPortraits = input.referenceManifest
    .filter(entry => entry.role === "character" && entry.characterName?.trim())
    .map(entry => {
      const url = absoluteUrl(entry.url, input.publicUrl);
      if (!url) {
        throw new Error(
          `MARKETPLACE_VIDEO_PROMPT_CHARACTER_REFERENCE_URL_INVALID:${entry.characterName}`
        );
      }
      return { entry, url };
    });
  const videoPromptModel = await resolveDirectVisionModel(
    MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    input.promptModel
  );
  await assertCreditPreflight({
    userId: input.userId,
    tenantId: input.tenantId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
  });
  let detectedPeople = input.detectedPeople;
  let detectionSkillRun = input.detectedPeopleSkillRun;
  let detectionCredits = 0;
  if (!detectedPeople) {
    const detectionModel = await resolveDirectVisionModel(
      MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
      input.promptModel
    );
    await assertCreditPreflight({
      userId: input.userId,
      tenantId: input.tenantId,
      skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    });
    await input.onProgress?.({
      progress: 15,
      stage: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
      message: `กำลังตรวจจับบุคคลจากภาพที่อนุมัติ · ${MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL} · Shot ${input.shotId}`,
    });
    const detection = await detectMarketplaceAutoReviewShotPeople({
      userId: input.userId,
      tenantId: input.tenantId,
      publicUrl: input.publicUrl,
      runId: input.runId,
      shotId: input.shotId,
      approvedImageUrl: approvedFrame,
      promptModel: input.promptModel,
      requestIdempotencyKey: input.requestIdempotencyKey,
    });
    detectedPeople = detection.detectedPeople;
    detectionSkillRun = detection.skillRun;
    detectionCredits = detection.estimatedCredits;
  }
  if (dialogue.length > 0 && detectedPeople.length === 0) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_NO_PEOPLE_DETECTED:shot-${input.shotId}`
    );
  }

  await input.onProgress?.({
    progress: 50,
    stage: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    message: `${input.detectedPeople ? "ใช้ผลตรวจจับและการจับคู่ที่บันทึกไว้แล้ว" : "ตรวจจับบุคคลแล้ว"} ${detectedPeople.length} คน · กำลังสร้าง Prompt วิดีโอ · ${MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL} · Shot ${input.shotId}`,
  });
  const imageInputs: VisionAwareImageInput[] = [
    {
      url: approvedFrame,
      label:
        "Image 1 — exact approved start frame. This image defines actual shot composition and visible people.",
    },
    ...characterPortraits.map((item, index) => ({
      url: item.url,
      label: `Image ${index + 2} — character portrait for ${item.entry.characterName}${item.entry.characterRole ? ` (${item.entry.characterRole})` : ""}. Use only to match identity to a person visible in Image 1.`,
    })),
  ];
  const promptInput = buildMarketplaceVerticalDramaVideoPromptInput({
    shotId: input.shotId,
    shot: safeShot,
    cast: input.cast,
    productName: input.productName,
    productFacts: input.productFacts,
    detectedPeople,
    speakerVisualBindings: safeSpeakerVisualBindings,
    characterPortraits: characterPortraits.map((item, index) => ({
      imageNumber: index + 2,
      characterName: item.entry.characterName!,
      role: item.entry.characterRole,
      descriptor: input.cast.find(
        cast => cast.name === item.entry.characterName
      )?.descriptor,
    })),
    instruction: input.instruction,
  });

  const promptUsage = { current: null as Usage | null };
  let generated: Awaited<
    ReturnType<typeof generateVerticalDramaShotVideoPromptDirect>
  >;
  try {
    generated = await generateVerticalDramaShotVideoPromptDirect({
      model: videoPromptModel.modelId,
      userId: input.userId,
      tenantId: input.tenantId,
      publicUrl: input.publicUrl,
      userPromptText: promptInput,
      images: imageInputs,
      cameraPresetKeys: Object.keys(CAMERA_CUES),
      onUsage: collectUsageObserver(promptUsage),
    });
  } catch (error) {
    if (promptUsage.current) {
      await chargeActualUsage({
        userId: input.userId,
        tenantId: input.tenantId,
        runId: input.runId,
        shotId: input.shotId,
        skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
        modelId: videoPromptModel.modelId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        usage: promptUsage.current,
      });
    }
    throw error;
  }
  let promptCredits = await chargeActualUsage({
    userId: input.userId,
    tenantId: input.tenantId,
    runId: input.runId,
    shotId: input.shotId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    modelId: videoPromptModel.modelId,
    providerName: generated.providerName,
    requestIdempotencyKey: input.requestIdempotencyKey,
    usage: promptUsage.current,
  });

  const approvedTurns = dialogue;
  const buildSpeakerSections = (data: typeof generated.data) => {
    const positionSource = data.frame_analysis?.position_source
      ?.trim()
      .toLowerCase();
    if (
      !input.speakerVisualBindings &&
      approvedTurns.length &&
      positionSource &&
      positionSource !== "image"
    ) {
      throw new Error(
        `MARKETPLACE_VIDEO_PROMPT_FRAME_ANALYSIS_REQUIRED:shot-${input.shotId}`
      );
    }
    const sections = buildAuthoritativeSpeakerSections({
      shotId: input.shotId,
      dialogue: approvedTurns,
      detectedPeople,
      frameAnalysisPeople: (data.frame_analysis?.people ??
        []) as MarketplaceSpeakerVisualEntry[],
      speakerVisualBindings: safeSpeakerVisualBindings,
    });
    const minorLock = minorSpeechSafetyLock(input.cast);
    return [sections, minorLock].filter(Boolean).join("\n\n");
  };
  let speakerSections: string;
  try {
    speakerSections = buildSpeakerSections(generated.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const repairable =
      message.startsWith("MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING") ||
      message.startsWith("MARKETPLACE_VIDEO_PROMPT_FRAME_ANALYSIS_REQUIRED");
    if (!repairable || approvedTurns.length === 0) throw error;

    await assertCreditPreflight({
      userId: input.userId,
      tenantId: input.tenantId,
      skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    });
    await input.onProgress?.({
      progress: 65,
      stage: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
      message: `กำลังแก้การจับคู่ผู้พูดกับบุคคลในภาพ · Shot ${input.shotId}`,
    });
    const repairUsage = { current: null as Usage | null };
    const repairInstruction = [
      "SPEAKER MAP CORRECTION REQUIRED: Your previous frame_analysis could not be safely matched to the approved dialogue.",
      "Return the same JSON contract and camera preset, but correct frame_analysis.people.",
      "For every approved dialogue speaker that is visibly matched to a portrait, use the exact approved speaker label as name, the visually verified position, and the exact detected_person_id from the detected-person map.",
      "Do not guess, use cast/order assumptions, rename speakers, or omit a speaker that can be visually matched. If a speaker cannot be confidently identified from the supplied images, omit that person and do not invent a binding.",
      `Approved speaker labels: ${approvedTurns.map(turn => turn.speaker).join(" | ")}`,
      `Detected people: ${formatDetectedPeople(detectedPeople)}`,
    ].join("\n");
    let repaired: Awaited<
      ReturnType<typeof generateVerticalDramaShotVideoPromptDirect>
    >;
    try {
      repaired = await generateVerticalDramaShotVideoPromptDirect({
        model: videoPromptModel.modelId,
        userId: input.userId,
        tenantId: input.tenantId,
        publicUrl: input.publicUrl,
        userPromptText: `${promptInput}\n\n${repairInstruction}`,
        images: imageInputs,
        cameraPresetKeys: Object.keys(CAMERA_CUES),
        onUsage: collectUsageObserver(repairUsage),
      });
    } catch (repairError) {
      if (repairUsage.current) {
        promptCredits += await chargeActualUsage({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.runId,
          shotId: input.shotId,
          skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
          modelId: videoPromptModel.modelId,
          requestIdempotencyKey: `${input.requestIdempotencyKey}:speaker-map-repair`,
          usage: repairUsage.current,
        });
      }
      throw repairError;
    }
    promptCredits += await chargeActualUsage({
      userId: input.userId,
      tenantId: input.tenantId,
      runId: input.runId,
      shotId: input.shotId,
      skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
      modelId: videoPromptModel.modelId,
      providerName: repaired.providerName,
      requestIdempotencyKey: `${input.requestIdempotencyKey}:speaker-map-repair`,
      usage: repairUsage.current,
    });
    generated = repaired;
    speakerSections = buildSpeakerSections(generated.data);
  }
  const skillPrompt = generated.data.prompt.trim();
  if (/^(?:i\s+)?(?:cannot|can['’]t|am unable|am sorry|apolog)/i.test(skillPrompt)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_MOTION_INCOMPLETE");
  }
  const cameraMotion = generated.data.motion_profile?.camera_motion;
  const prompt = composeMarketplaceAutoReviewVideoPrompt({
    cameraMotion: cameraCue(skillPrompt) ? skillPrompt : cameraMotion,
    durationSeconds: safeShot.durationSeconds,
    speakerSections,
    approvedShotAction: marketplaceApprovedShotAction(safeShot),
  });
  if (
    !isMarketplaceAutoReviewVideoPromptComplete({
      value: prompt,
      approvedDialogue: safeShot.dialogue,
      detectedPersonIds: detectedPeople.map(person => person.id),
      derivedDialogueTurns: safeShot.dialogueTurns,
      cast: input.cast,
    })
  ) {
    const detectedPersonIds = detectedPeople.map(person => person.id);
    const approvedTurnKeys = new Set(
      parseDialogue(safeShot.dialogue, defaultDialogueSpeaker).map(turn =>
        `${turn.speaker.normalize("NFKC").trim().toLocaleLowerCase()}\n${turn.line}`
      )
    );
    const containsStaleDialogue = (safeShot.dialogueTurns ?? []).some(turn => {
      const key = `${turn.speakerName.normalize("NFKC").trim().toLocaleLowerCase()}\n${turn.line}`;
      return (
        !approvedTurnKeys.has(key) &&
        turn.line.trim().length >= 4 &&
        prompt.includes(turn.line.trim())
      );
    });
    const failedCheck = !isMarketplaceAutoReviewVideoPromptComplete({
      value: prompt,
      approvedDialogue: "",
    })
      ? "format_or_length"
      : containsStaleDialogue
        ? "stale_dialogue"
        : !isMarketplaceAutoReviewVideoPromptComplete({
              value: prompt,
              approvedDialogue: safeShot.dialogue,
            })
          ? "dialogue"
          : !isMarketplaceAutoReviewVideoPromptComplete({
                value: prompt,
                approvedDialogue: safeShot.dialogue,
                detectedPersonIds,
                derivedDialogueTurns: safeShot.dialogueTurns,
              })
            ? "detected_people"
            : !isMarketplaceAutoReviewVideoPromptComplete({
                  value: prompt,
                  approvedDialogue: safeShot.dialogue,
                  detectedPersonIds,
                  derivedDialogueTurns: safeShot.dialogueTurns,
                  cast: input.cast,
                })
              ? "speaker_map"
              : "detected_people";
    console.warn("[MarketplaceVideoPrompt] validation failed", {
      shotId: input.shotId,
      failedCheck,
      promptLength: prompt.length,
      maxLength: MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS,
    });
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SKILL_OUTPUT_INCOMPLETE:shot-${input.shotId}`
    );
  }
  return {
    prompt,
    detectedPeople,
    model: videoPromptModel.modelId,
    provider: generated.providerName,
    estimatedCredits: detectionCredits + promptCredits,
    skillRuns: [
      {
        skill: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
        ...(detectionSkillRun ?? {
          skill: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
          model: "previously-reviewed-detection",
          provider: "saved-result",
          estimatedCredits: 0,
        }),
      },
      {
        skill: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
        model: videoPromptModel.modelId,
        provider: generated.providerName,
        estimatedCredits: promptCredits,
      },
    ],
  };
}
