import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { verticalDramaEpisodes } from "../../drizzle/schema";
import {
  executeJsonPlanningCallWithRetry,
  type JsonPlanningAttemptEvent,
  type JsonPlanningRetryEvent,
  resolveStoryBibleModel,
} from "./verticalDramaStoryBible";
import type { RawLlmPayloadEvent } from "./llmRouter";
import { createSpecialTieInForensicRecorder } from "./verticalDramaSpecialTieInForensics";
import {
  calculateCreditsForLLM,
  deductCredits,
  refundCredits,
} from "./creditService";
import {
  reconcileSpecialStorySceneSlot,
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

const SPECIAL_TIE_IN_STAGES = [
  "context_setup",
  "introduction",
  "preparation",
  "demonstration",
  "hands_on_use",
  "result",
  "retry",
  "hero",
] as const;

type SpecialTieInStage = (typeof SPECIAL_TIE_IN_STAGES)[number];

const ACTIVE_TIE_IN_ACTION_PATTERN =
  /(เปิด|ปิด|หยิบ|จับ|ถือ|เท|บีบ|กด|ตัก|ทา|ลูบ|ถู|นวด|สระ|ล้าง|หมุน|ต่อ|ซ้อน|ประกอบ|เล่น|ลอง|สาธิต|ใช้|นั่ง|เอน|นอน|เดินเข้า|เดิน|เลือก|สำรวจ|หยิบดู|ทดลอง|ชิม|ดื่ม|กิน|ทำความสะอาด|จัดวาง|แสดง|open|close|pick up|hold|pour|dispense|press|scoop|apply|rub|massage|wash|rinse|rotate|stack|assemble|play|try|demonstrate|use|sit|lie|enter|walk|browse|inspect|taste|drink|eat|clean|arrange|show)/i;

function mapCanonicalProductHandlingToTieInStage(
  value: unknown
): SpecialTieInStage {
  switch (value) {
    case "controlled_use":
      return "hands_on_use";
    case "controlled_handling":
      return "preparation";
    case "static_hero":
      return "hero";
    default:
      return "context_setup";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
          // The story beat is the authoritative source for downstream prompt
          // generation. Keep it separate from the image/video prompt so a
          // prompt cannot become the story summary by accident.
          story_summary: z.string().trim().min(8).max(4_000).optional(),
          // Special storyboard planning is story/dialogue only. Prompt
          // authoring is deliberately deferred to the normal per-shot image
          // and video actions after the user clicks them. Keep these fields
          // optional for backwards-compatible provider output, but never
          // require or persist their planning-pass values.
          image_prompt: z.string().max(20_000).optional().default(""),
          video_prompt: z.string().max(20_000).optional().default(""),
          reference_ids: z.array(z.string().min(1).max(64)).max(20).default([]),
          dialogue_mode: z.enum(["none", "character_dialogue"]).optional(),
          continuity_in: z.string().max(4_000).default(""),
          continuity_out: z.string().max(4_000).default(""),
          continuity_anchor: z.string().trim().min(4).max(1_000),
          tie_in_stage: z.enum(SPECIAL_TIE_IN_STAGES),
          tie_in_action: z.string().trim().min(8).max(4_000),
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
      )
      .length(9),
    dialogue: z
      .object({
        mode: z.enum(["none", "character_dialogue"]),
        speaker_count: z.number().int().min(0).max(3).optional(),
        speaker_reference_ids: z
          .array(z.string().min(1).max(64))
          .max(18)
          .default([]),
        speaking_turns: z
          .array(
            z.object({
              speaker_reference_id: z.string().min(1).max(64),
              exact_dialogue: z.string().min(1).max(2_000),
            })
          )
          .max(18)
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

type ResolvedSpecialReferenceBinding =
  SpecialEpisodeData["referenceBindings"][number] & { authorizedUrl: string };

export function resolveSpecialProductReferenceUrls(
  bindings: readonly ResolvedSpecialReferenceBinding[]
): string[] {
  return bindings
    .filter(binding => binding.role === "product")
    .map(binding => binding.authorizedUrl);
}

/**
 * The scene is a separate visual track from a product reference. Product
 * images are additive props; they must never become the background merely
 * because a product tie-in has no uploaded location image.
 */
export function buildSpecialTieInSceneDescription(
  input: SpecialEpisodeData["input"]
): string {
  const scene = input.marketplaceReviewIdea?.scene;
  if (!scene) {
    return "ฉากหลังต้องสร้างจากสถานที่และการกระทำในเรื่องย่อของช็อตนี้ โดยห้ามใช้ภาพสินค้าแทนฉาก";
  }
  return [
    `สถานที่: ${scene.location}`,
    scene.time ? `เวลา: ${scene.time}` : null,
    `บรรยากาศ: ${scene.atmosphere}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

export function buildSpecialTieInSceneInstruction(
  input: SpecialEpisodeData["input"]
): string {
  return `Scene/background (primary environment, generated from the story): ${buildSpecialTieInSceneDescription(input)}. Keep this scene as the background. Product reference images are additive props only and must never replace the scene.`;
}

export function buildSpecialTieInSceneSlot(input: SpecialEpisodeData["input"]): {
  label: string;
  description: string;
} {
  const scene = input.marketplaceReviewIdea?.scene;
  const label = scene?.location?.trim() || "ฉากตอนพิเศษ";
  const description = scene
    ? [
        `สถานที่: ${scene.location}`,
        scene.time ? `เวลา: ${scene.time}` : null,
        `บรรยากาศ: ${scene.atmosphere}`,
        ...scene.beats.map((beat, index) => `จังหวะฉาก ${index + 1}: ${beat}`),
      ]
        .filter((part): part is string => Boolean(part))
        .join("; ")
    : `สถานที่และบรรยากาศสำหรับเรื่องย่อ Tie-in: ${input.idea}`;
  return { label, description };
}

/**
 * Materialize the special episode's scene in the same storyboard shape used
 * by normal episodes. The location roster remains the source of the approved
 * establishing image; this group binds all nine shots to that durable scene
 * so the existing Scenes tab and start-frame resolver can use it. Product
 * references remain a separate additive track.
 */
export function buildSpecialTieInStoryboard(
  input: SpecialEpisodeData["input"],
  locationKey: string,
  locationLabel?: string,
  shots?: Array<{
    shotNumber: number;
    summary: string;
    action?: string;
    requiredCharacterRefs?: string[];
    durationSeconds?: number;
  }>
): {
  distinct_locations: Array<{
    location_key: string;
    location_name: string;
    shot_numbers: number[];
    description: string;
  }>;
  shots?: Array<Record<string, unknown>>;
} {
  const sceneSlot = buildSpecialTieInSceneSlot(input);
  return {
    distinct_locations: [
      {
        location_key: locationKey,
        location_name: locationLabel?.trim() || sceneSlot.label,
        shot_numbers: Array.from({ length: 9 }, (_, index) => index + 1),
        description: sceneSlot.description,
      },
    ],
    ...(shots?.length
      ? {
          shots: shots.map(shot => ({
            shot_number: shot.shotNumber,
            shotNumber: shot.shotNumber,
            visual_description: shot.summary,
            description: shot.summary,
            ...(shot.action ? { action: shot.action } : {}),
            ...(shot.requiredCharacterRefs?.length
              ? {
                  required_character_refs: shot.requiredCharacterRefs,
                  characterIds: shot.requiredCharacterRefs,
                }
              : {}),
            ...(shot.durationSeconds
              ? {
                  duration_seconds: shot.durationSeconds,
                  durationSeconds: shot.durationSeconds,
                }
              : {}),
          })),
        }
      : {}),
  };
}

export function buildSpecialTieInPromptArtifacts(input: {
  specialData: SpecialEpisodeData;
  output: SpecialSkillOutput;
  productReferenceUrls: string[];
  locationKey?: string;
}) {
  const selectedCharacterIds = new Set(
    (input.specialData.input.characterIds ?? []).map(String)
  );
  const personBindings = input.specialData.referenceBindings.filter(
    binding =>
      binding.role === "person" &&
      selectedCharacterIds.has(String(binding.provenance.characterId ?? ""))
  );
  const productReferenceAssetIds = input.productReferenceUrls;
  const productSkillReferenceIds = new Set(
    input.specialData.referenceBindings
      .filter(binding => binding.role === "product")
      .map(binding => binding.skillReferenceId)
  );
  const productMediaAssetIds = input.specialData.referenceBindings
    .filter(binding => binding.role === "product")
    .map(binding => binding.mediaAssetId);
  // A validated nine-shot output is usable by the existing storyboard flow.
  // `needs_clarification` is a review signal, not a reason to discard all
  // nine shots and leave the user with an empty episode.
  const promptReady =
    input.output.shot_count === 9 && input.output.shots.length === 9;
  const sceneDescription = buildSpecialTieInSceneDescription(
    input.specialData.input
  );
  const speakerKeyByReferenceId = new Map(
    personBindings.map(binding => [
      binding.skillReferenceId,
      String(binding.provenance.characterKey ?? binding.skillReferenceId),
    ])
  );
  const storySummary = (shot: SpecialSkillOutput["shots"][number]) =>
    buildSpecialCanonicalShotSummary(shot);
  return {
    startFramePlan: promptReady
      ? {
          mode: "single_frame_per_shot" as const,
          selectedImageModelId: input.specialData.input.imageModelId,
          aspectRatio: "9:16" as const,
          frames: input.output.shots.map(shot => ({
            shotNumber: shot.shot_number,
            // Special tie-ins follow the normal episode flow: the story beat
            // is materialized now, but the paid image prompt is authored only
            // when the user clicks "Generate image (AI)". This prevents a
            // stale pre-authored prompt from diverging from the final story.
            imagePrompt: "",
            negativePrompt: "",
            requiredCharacterRefs: personBindings.map(binding =>
              String(binding.provenance.characterKey ?? binding.skillReferenceId)
            ),
            productReferenceAssetIds,
            sceneDescription,
            // This is the only story source sent to the existing per-shot
            // prompt authoring flow. Do not derive it from image_prompt.
            canonicalShotSummary: storySummary(shot),
            ...(input.locationKey ? { locationKey: input.locationKey } : {}),
            // Keep product refs in the dedicated product track. This generic
            // list is consumed by older storyboard/reference readers and must
            // never make a product image look like a scene reference.
            referenceAssetIds: shot.reference_ids.filter(
              referenceId => !productSkillReferenceIds.has(referenceId)
            ),
          })),
        }
      : null,
    motionPromptPack: promptReady
      ? {
          selectedVideoModelId: input.specialData.input.videoModelId,
          durationProfileId: `vertical_drama_special_${input.output.shot_duration_seconds}s_variable_shots`,
          motionMode: "image_to_video" as const,
          aspectRatio: "9:16" as const,
          clips: input.output.shots.map(shot => ({
            clipNumber: shot.shot_number,
            sourceShotNumbers: [shot.shot_number],
            // Video prompts are also lazy. The existing per-shot video prompt
            // action requires the approved image and will author this field
            // after the start frame is ready.
            prompt: "",
            durationSeconds: input.output.shot_duration_seconds,
            extraReferenceAssetIds: productMediaAssetIds,
            dialogue: shot.speaking_turns.map(turn => ({
              characterKey:
                speakerKeyByReferenceId.get(turn.speaker_reference_id) ??
                turn.speaker_reference_id,
              lineTh: turn.exact_dialogue,
            })),
          })),
        }
      : null,
  };
}

/**
 * The installed idea-to-video skill returns its canonical workflow contract
 * while the special episode persists a smaller shot contract. Normalize before
 * the planning schema is applied so a valid skill response cannot be rejected
 * for using the skill's own field names.
 */
export function normalizeSpecialSkillOutput(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.shots)) return value;
  const shots = value.shots.filter(isRecord);
  const first = shots[0];
  if (
    shots.length === value.shots.length &&
    first &&
    typeof first.image_prompt !== "string" &&
    typeof first.video_prompt !== "string" &&
    typeof first.prompt === "string"
  ) {
    return {
      status: value.status ?? "ready",
      aspect_ratio: value.aspect_ratio,
      shot_duration_seconds: value.shot_duration_seconds,
      shot_count: value.shot_count ?? shots.length,
      assumptions: value.assumptions,
      dialogue: value.dialogue,
      quality_control: value.quality_control,
      shots: shots.map(shot => ({
        shot_number: shot.shot_number,
        story_summary: deriveSpecialStorySummary(shot),
        // The generic skill may still return a legacy `prompt` field. It is
        // not a special storyboard prompt and must not be promoted into the
        // image/video prompt slots; those are authored later by the normal
        // per-shot flow.
        image_prompt: "",
        video_prompt: "",
        reference_ids: [
          ...(((shot.reference_lock as Record<string, unknown> | undefined)
            ?.person_reference_ids as string[] | undefined) ?? []),
          ...(((shot.reference_lock as Record<string, unknown> | undefined)
            ?.product_reference_ids as string[] | undefined) ?? []),
          ...(((shot.reference_lock as Record<string, unknown> | undefined)
            ?.location_reference_ids as string[] | undefined) ?? []),
          ...(((shot.reference_lock as Record<string, unknown> | undefined)
            ?.store_reference_ids as string[] | undefined) ?? []),
        ],
        dialogue_mode:
          shot.dialogue_mode ??
          (value.dialogue as Record<string, unknown> | undefined)?.mode ??
          "none",
        continuity_in:
          typeof shot.continuity_in === "string"
            ? shot.continuity_in
            : "ต่อเนื่องจากช็อตก่อนหน้า",
        continuity_out:
          typeof shot.continuity_out === "string"
            ? shot.continuity_out
            : "ส่งต่อการกระทำและอารมณ์ไปยังช็อตถัดไป",
        continuity_anchor:
          typeof shot.continuity_anchor === "string"
            ? shot.continuity_anchor
            : typeof shot.continuity_out === "string"
              ? shot.continuity_out
              : "สถานะการกระทำต่อเนื่องของช็อตนี้",
        tie_in_stage: SPECIAL_TIE_IN_STAGES.includes(
          shot.tie_in_stage as SpecialTieInStage
        )
          ? (shot.tie_in_stage as SpecialTieInStage)
          : mapCanonicalProductHandlingToTieInStage(shot.product_handling),
        tie_in_action:
          typeof shot.tie_in_action === "string"
            ? shot.tie_in_action
            : Array.isArray(shot.sub_shots)
              ? shot.sub_shots
                  .filter(isRecord)
                  .map(subShot =>
                    typeof subShot.action === "string" ? subShot.action : ""
                  )
                  .filter(Boolean)
                  .join("; ")
              : "ดำเนินการตามไอเดียในฉากเดิมอย่างต่อเนื่อง",
        speaking_turns: Array.isArray(shot.speaking_turns)
          ? shot.speaking_turns
              .filter(isRecord)
              .map(turn => ({
                speaker_reference_id: String(turn.speaker_reference_id ?? ""),
                exact_dialogue: String(turn.exact_dialogue ?? ""),
              }))
          : [],
      })),
    };
  }
  return value;
}

function deriveSpecialStorySummary(
  shot: Record<string, unknown>,
  fallback = "ดำเนินเรื่องต่อจากการกระทำของช็อตก่อนหน้าอย่างต่อเนื่อง"
): string {
  const directCandidates = [
    shot.story_summary,
    shot.summary,
    shot.purpose,
    shot.title,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim().length >= 8) {
      return candidate.trim().slice(0, 4_000);
    }
  }
  if (Array.isArray(shot.sub_shots)) {
    const actions = shot.sub_shots
      .filter(isRecord)
      .map(subShot => subShot.action)
      .filter((action): action is string => typeof action === "string")
      .map(action => action.trim())
      .filter(Boolean)
      .join("; ");
    if (actions.length >= 8) return actions.slice(0, 4_000);
  }
  return fallback;
}

function buildSpecialCanonicalShotSummary(
  shot: SpecialSkillOutput["shots"][number]
): string {
  const existingStory = shot.story_summary?.trim() || "";
  const story = existingStory || shot.tie_in_action.trim();
  const parts = [
    existingStory.startsWith("เรื่องย่อช็อต:")
      ? existingStory
      : `เรื่องย่อช็อต: ${story}`,
  ];
  if (!existingStory.includes("การกระทำ Tie-in ที่ต้องเห็นจริง:")) {
    parts.push(`การกระทำ Tie-in ที่ต้องเห็นจริง: ${shot.tie_in_action.trim()}`);
  }
  for (const turn of shot.speaking_turns) {
    const line = `บทพูด: ${turn.exact_dialogue.trim()}`;
    if (line !== "บทพูด:" && !existingStory.includes(line)) parts.push(line);
  }
  if (
    shot.continuity_out.trim() &&
    !existingStory.includes("ความต่อเนื่องไปช็อตถัดไป:")
  ) {
    parts.push(`ความต่อเนื่องไปช็อตถัดไป: ${shot.continuity_out.trim()}`);
  }
  return parts
    .filter(Boolean)
    .join(" ")
    .slice(0, 2_000);
}

function materializeSpecialStorySummaries(
  output: SpecialSkillOutput
): SpecialSkillOutput {
  return {
    ...output,
    shots: output.shots.map(shot => ({
      ...shot,
      story_summary: buildSpecialCanonicalShotSummary(shot),
    })),
  };
}

/**
 * Remove any prompt text a provider returned despite the story-only planning
 * contract. This keeps the returned special storyboard deterministic and
 * prevents a legacy/provider response from bypassing the normal per-shot
 * prompt-generation flow.
 */
export function clearSpecialPromptDrafts(
  output: SpecialSkillOutput
): SpecialSkillOutput {
  return {
    ...output,
    shots: output.shots.map(shot => ({
      ...shot,
      image_prompt: "",
      video_prompt: "",
    })),
  };
}

function buildFallbackDialogueTurns(
  input: SpecialSkillInput,
  speakerReferenceIds: string[]
): Array<{ speaker_reference_id: string; exact_dialogue: string }> {
  const lines = extractSpecialDialogueLines(input);
  const sourceLines = lines.length > 0 ? lines : ["เราค่อย ๆ ทำไปทีละขั้นกันนะ"];
  if (speakerReferenceIds.length === 0) {
    throw new Error(
      "SPECIAL_FALLBACK_PRECONDITION: character dialogue has no resolved selected speaker"
    );
  }
  const connectiveLines = [
    "ค่อย ๆ ดูการกระทำตรงหน้าไปด้วยกันนะ",
    "ลองทำต่ออีกขั้นอย่างใจเย็นนะ",
    "ตอนนี้เราเห็นการใช้งานชัดเจนแล้ว",
    "เราอยู่ตรงนี้และทำต่อไปด้วยกัน",
    "จบช่วงนี้ด้วยการเก็บของให้เรียบร้อยนะ",
  ];
  // Two short turns are the minimum conversational unit for a ten-second
  // special shot. Keep the reviewed lines verbatim and add only safe,
  // connective lines so every one of the nine shots remains speakable.
  return Array.from({ length: 9 }, (_, shotIndex) => {
    const firstLine = sourceLines[shotIndex % sourceLines.length]!;
    const secondLine = connectiveLines[shotIndex % connectiveLines.length]!;
    return [
      {
        speaker_reference_id:
          speakerReferenceIds[shotIndex % speakerReferenceIds.length]!,
        exact_dialogue: firstLine,
      },
      {
        speaker_reference_id:
          speakerReferenceIds[(shotIndex + 1) % speakerReferenceIds.length]!,
        exact_dialogue: secondLine,
      },
    ];
  }).flat();
}

/**
 * Produces a usable nine-shot draft without a provider. It only uses the
 * reviewed idea and selected reference IDs, describes observable actions
 * without inventing product claims, and marks the result for review.
 */
export function buildDeterministicSpecialTieInFallback(input: {
  specialInput: SpecialSkillInput;
  bindings: SpecialEpisodeData["referenceBindings"];
  failureReason: string;
}): SpecialSkillOutput {
  const { specialInput, bindings } = input;
  const selectedCharacterIds = new Set(specialInput.characterIds.map(String));
  const selectedPersonRefs = bindings
    .filter(binding => binding.role === "person")
    .filter(binding =>
      selectedCharacterIds.has(String(binding.provenance.characterId ?? ""))
    )
    .map(binding => binding.skillReferenceId);
  const selectedSpeakerRefs = bindings
    .filter(binding => binding.role === "person")
    .filter(binding =>
      specialInput.speakerCharacterIds.includes(
        String(binding.provenance.characterId ?? "")
      )
    )
    .map(binding => binding.skillReferenceId);
  const productRefs = bindings
    .filter(binding => binding.role === "product")
    .map(binding => binding.skillReferenceId);
  const placeRefs = bindings
    .filter(binding => binding.role === "location" || binding.role === "store")
    .map(binding => binding.skillReferenceId);
  const tieInRefs = [
    ...(specialInput.referenceType === "location" ||
    specialInput.referenceType === "store"
      ? placeRefs
      : []),
    ...(specialInput.referenceType === "product" ? productRefs : []),
    ...(specialInput.referenceType === "mixed"
      ? [...productRefs, ...placeRefs]
      : []),
  ];
  const referenceIds = [...new Set([...selectedPersonRefs, ...tieInRefs])];
  const requiresProduct =
    productRefs.length > 0 &&
    (specialInput.referenceType === "product" ||
      specialInput.referenceType === "mixed");
  const productStages: SpecialTieInStage[] = [
    "context_setup",
    "introduction",
    "preparation",
    "demonstration",
    "hands_on_use",
    "hands_on_use",
    "retry",
    "result",
    "hero",
  ];
  const placeStages: SpecialTieInStage[] = [
    "context_setup",
    "introduction",
    "preparation",
    "hands_on_use",
    "hands_on_use",
    "hands_on_use",
    "retry",
    "result",
    "hero",
  ];
  const stages = requiresProduct ? productStages : placeStages;
  const reviewedProductActions = (specialInput.marketplaceReviewIdea?.actions ?? [])
    .filter(action => typeof action === "string" && action.trim().length > 0)
    .map(action => action.trim());
  const productEvidence = [
    specialInput.idea,
    specialInput.marketplaceReviewIdea?.title,
    specialInput.marketplaceReviewIdea?.episodeStory,
    ...reviewedProductActions,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const productActions = productEvidence.match(/ของเล่น|ปราสาท|เด็ก|เล่น/)
    ? [
        "ผู้ใหญ่จัดพื้นที่เล่นและนำของเล่นที่เลือกออกจากถุง วางให้เห็นชัดในฉากเดิม",
        "ผู้ใหญ่ตรวจดูฐานและชิ้นส่วนของเล่นที่เลือก แล้วเลื่อนออกจากขอบโต๊ะอย่างปลอดภัย",
        "เด็กเอื้อมมือหยิบชิ้นส่วนของเล่นที่เลือก โดยผู้ใหญ่ประคองพื้นที่รอบตัว",
        "เด็กลองวางชิ้นส่วนของเล่นที่เลือกลงบนฐาน ให้เห็นการหยิบจับและการวางซ้อนจริง",
        "เด็กเล่นของเล่นที่เลือกต่อเนื่อง หมุนหรือประกอบชิ้นส่วนด้วยมือในฉากจริง",
        "เด็กลองเล่นซ้ำและสำรวจสีหรือพื้นผิวของของเล่น โดยผู้ใหญ่ไม่แย่งการควบคุม",
        "ผู้ใหญ่ปรับตำแหน่งของเล่นที่เลือกเล็กน้อย แล้วให้เด็กลองทำกิจกรรมต่อเอง",
        "เด็กวางชิ้นส่วนของเล่นได้และหันมาสบตาผู้ใหญ่ เห็นผลลัพธ์ที่สังเกตได้ในฉาก",
        "ของเล่นที่เลือกอยู่ข้างเด็กขณะเด็กเล่นต่อ ผู้ใหญ่ดูแลใกล้ ๆ และปิดช่วงเวลาร่วมกัน",
      ]
    : reviewedProductActions.length > 0
      ? Array.from({ length: 9 }, (_, index) =>
          `ตัวละครดำเนินกิจกรรมกับสินค้าที่เลือกตามไอเดียที่ตรวจทานแล้ว: ${reviewedProductActions[index % reviewedProductActions.length]}`
        )
      : [
        "ตัวละครจัดพื้นที่ในฉากเดิมและนำสินค้าที่เลือกเข้ามาใกล้จุดใช้งาน",
        "ตัวละครหยิบสินค้าที่เลือกขึ้นมาและแสดงรูปทรงกับรายละเอียดตามภาพอ้างอิง",
        "ตัวละครเปิดหรือเตรียมสินค้าตามวิธีใช้ที่ข้อมูลรองรับ โดยไม่สร้างคุณสมบัติใหม่",
        "ตัวละครสาธิตการใช้สินค้ากับบริบทจริง ให้เห็นมือและการสัมผัสอย่างชัดเจน",
        "ตัวละครใช้สินค้าจริงในฉากต่อเนื่อง เห็นการกระทำหลักเต็มช่วงเวลา",
        "ตัวละครใช้สินค้าต่อเนื่องและตรวจดูการเปลี่ยนแปลงที่สังเกตได้",
        "ตัวละครลองใช้สินค้าซ้ำหรือปรับวิธีใช้ โดยคงสินค้าและฉากเดิม",
        "ตัวละครแสดงผลลัพธ์ที่สังเกตได้จากการใช้สินค้าในฉากจริง",
        "ตัวละครวางหรือใช้งานสินค้าในฉากเดิม พร้อมแสดงผลลัพธ์และปิดเรื่อง",
      ];
  const actions = requiresProduct
    ? productActions
    : [
        "ตัวละครจัดจังหวะเริ่มต้นในฉากที่เลือกและหันความสนใจไปยังสถานที่หรือร้านค้า",
        "ตัวละครเดินเข้าและสำรวจสถานที่หรือร้านค้าที่เลือกอย่างชัดเจน",
        "ตัวละครเตรียมตัวและเลือกจุดใช้งานในสถานที่ที่เลือก",
        "ตัวละครมีปฏิสัมพันธ์กับพื้นที่หรือสิ่งของในสถานที่ที่เลือก",
        "ตัวละครใช้พื้นที่ที่เลือกจริงตามเหตุการณ์ในไอเดีย",
        "ตัวละครใช้พื้นที่ต่อเนื่องและสังเกตประสบการณ์ที่เกิดขึ้น",
        "ตัวละครลองทำกิจกรรมในสถานที่นั้นอีกครั้งโดยคงตำแหน่งและบรรยากาศเดิม",
        "ตัวละครแสดงผลลัพธ์หรือประสบการณ์ที่สังเกตได้จากสถานที่ที่เลือก",
        "ตัวละครปิดเรื่องในสถานที่เดิมพร้อมแสดงประสบการณ์ที่ได้รับ",
      ];
  const dialogueTurns =
    specialInput.dialogueMode === "character_dialogue"
      ? buildFallbackDialogueTurns(specialInput, selectedSpeakerRefs)
      : [];
  const turnsByShot = Array.from({ length: 9 }, () => [] as typeof dialogueTurns);
  dialogueTurns.forEach((turn, index) => {
    turnsByShot[Math.floor(index / 2)]!.push(turn);
  });
  const shots = Array.from({ length: 9 }, (_, index) => {
    const action = actions[index]!;
    const anchor = `สถานะต่อเนื่องช็อต ${index + 1}: ${action}`;
    const continuityIn =
      index === 0
        ? `เริ่มจากไอเดียที่ตรวจทานแล้ว: ${specialInput.idea}`
        : `ต่อจาก สถานะต่อเนื่องช็อต ${index}: ${actions[index - 1]}`;
    const shared = [
      `Standalone special tie-in shot ${index + 1}/9, ${specialInput.durationSeconds} seconds, 9:16.`,
      `Reviewed idea: ${specialInput.idea}`,
      `Selected references only: ${referenceIds.join(", ") || "none"}.`,
      "Keep the original scene and environment as the scene; references are additive props and must never replace the scene.",
      `Visible action: ${action}`,
      `Continuity in: ${continuityIn}`,
      `Continuity out: ${anchor}`,
      "Do not add people, voices, products, claims, or locations outside the reviewed input.",
    ];
    return {
      shot_number: index + 1,
      story_summary: [
        action,
        turnsByShot[index]!.map(turn => `บทพูด: ${turn.exact_dialogue}`).join(" "),
      ]
        .filter(Boolean)
        .join(" "),
      // A deterministic fallback must still produce all nine usable story
      // beats, but it must not recreate the paid prompt stages that this
      // special planning pass intentionally defers.
      image_prompt: "",
      video_prompt: "",
      reference_ids: referenceIds,
      dialogue_mode: specialInput.dialogueMode,
      continuity_in: continuityIn,
      continuity_out: anchor,
      continuity_anchor: anchor,
      tie_in_stage: stages[index]!,
      tie_in_action: action,
      speaking_turns: turnsByShot[index]!,
    };
  });
  return {
    status: "ready",
    aspect_ratio: "9:16",
    shot_duration_seconds: specialInput.durationSeconds,
    shot_count: 9,
    shots,
    dialogue:
      specialInput.dialogueMode === "character_dialogue"
        ? {
            mode: "character_dialogue",
            speaker_count: new Set(selectedSpeakerRefs).size,
            speaker_reference_ids: selectedSpeakerRefs,
            speaking_turns: dialogueTurns,
          }
        : {
            mode: "none",
            speaker_count: 0,
            speaker_reference_ids: [],
            speaking_turns: [],
          },
    assumptions: [
      "สร้างจาก deterministic fallback หลัง self-repair/provider ไม่สามารถคืนผลลัพธ์ที่ผ่าน contract ได้",
      `เหตุผลล่าสุด: ${input.failureReason.slice(0, 500)}`,
    ],
    quality_control: {
      passed: false,
      source: "deterministic_fallback",
      needs_review: true,
      review_reason:
        "ตรวจโครงสร้างและข้อกำหนดพื้นฐานแล้ว แต่ควรตรวจความสร้างสรรค์และรายละเอียดการใช้สินค้าก่อนผลิตจริง",
    },
  };
}

export function validateSpecialSkillOutput(value: unknown): SpecialSkillOutput {
  return materializeSpecialStorySummaries(
    specialSkillOutputSchema.parse(normalizeSpecialSkillOutput(value))
  );
}

export function repairSpecialTieInOutput(
  output: SpecialSkillOutput,
  input: SpecialSkillInput,
  bindings: SpecialEpisodeData["referenceBindings"]
): SpecialSkillOutput {
  const selectedCharacterIds = new Set(input.characterIds.map(String));
  const selectedPersonRefs = bindings
    .filter(binding => binding.role === "person")
    .filter(binding => selectedCharacterIds.has(String(binding.provenance.characterId ?? "")))
    .map(binding => binding.skillReferenceId);
  const productRefs = bindings
    .filter(binding => binding.role === "product")
    .map(binding => binding.skillReferenceId);
  const placeRefs = bindings
    .filter(binding => binding.role === "location" || binding.role === "store")
    .map(binding => binding.skillReferenceId);
  const requiredRefs = [
    ...selectedPersonRefs,
    ...(input.referenceType === "product" || input.referenceType === "mixed" ? productRefs : []),
    ...(input.referenceType === "location" || input.referenceType === "store" || input.referenceType === "mixed" ? placeRefs : []),
  ];
  const knownRefs = new Set(bindings.map(binding => binding.skillReferenceId));
  const requiresProduct = productRefs.length > 0 && (input.referenceType === "product" || input.referenceType === "mixed");
  const requiresPlace = placeRefs.length > 0 && (input.referenceType === "location" || input.referenceType === "store" || input.referenceType === "mixed");
  const requiredStages = requiresProduct
    ? (["context_setup", "introduction", "preparation", "demonstration", "hands_on_use", "hands_on_use", "retry", "result", "hero"] as const)
    : (["context_setup", "introduction", "preparation", "hands_on_use", "hands_on_use", "hands_on_use", "retry", "result", "hero"] as const);
  const currentStages = new Set(output.shots.map(shot => shot.tie_in_stage));
  const needsStageRepair =
    (requiresProduct && ["preparation", "demonstration", "hands_on_use", "result"].some(stage => !currentStages.has(stage as SpecialTieInStage))) ||
    (requiresPlace && ["introduction", "hands_on_use", "result"].some(stage => !currentStages.has(stage as SpecialTieInStage)));
  const dialogueFallback =
    input.dialogueMode === "character_dialogue"
      ? buildFallbackDialogueTurns(
          input,
          bindings
            .filter(binding => binding.role === "person")
            .filter(binding => input.speakerCharacterIds.includes(String(binding.provenance.characterId ?? "")))
            .map(binding => binding.skillReferenceId)
        )
      : [];
  const dialogueFallbackByShot = Array.from({ length: 9 }, (_, shotIndex) =>
    dialogueFallback.slice(shotIndex * 2, shotIndex * 2 + 2)
  );
  const allowedSpeakerRefs = new Set(
    bindings
      .filter(binding => binding.role === "person")
      .filter(binding => input.speakerCharacterIds.includes(String(binding.provenance.characterId ?? "")))
      .map(binding => binding.skillReferenceId)
  );
  const repairedShots = output.shots.map((shot, index) => {
    const authorizedRefs = shot.reference_ids.filter(referenceId => {
      const binding = bindings.find(candidate => candidate.skillReferenceId === referenceId);
      return knownRefs.has(referenceId) && (binding?.role !== "person" || selectedPersonRefs.includes(referenceId));
    });
    const referenceIds = [...new Set([...authorizedRefs, ...requiredRefs])];
    const normalizedTurns = shot.speaking_turns.map((turn, turnIndex) =>
      allowedSpeakerRefs.has(turn.speaker_reference_id)
        ? turn
        : {
            ...turn,
            speaker_reference_id:
              [...allowedSpeakerRefs][
                turnIndex % Math.max(1, allowedSpeakerRefs.size)
              ] ?? turn.speaker_reference_id,
          }
    );
    const speakingTurns =
      input.dialogueMode === "character_dialogue"
        ? [
            ...normalizedTurns,
            ...dialogueFallbackByShot[index]!,
          ]
            // Preserve the model's lines first, then fill the minimum two
            // turns from the deterministic reviewed-input fallback. This
            // keeps good model dialogue while repairing underfilled shots.
            .filter(
              (turn, turnIndex, all) =>
                all.findIndex(
                  candidate =>
                    candidate.speaker_reference_id ===
                      turn.speaker_reference_id &&
                    candidate.exact_dialogue.trim() ===
                      turn.exact_dialogue.trim()
                ) === turnIndex
            )
            .slice(0, 2)
        : [];
    return {
      ...shot,
      story_summary:
        shot.story_summary?.trim() || shot.tie_in_action.trim(),
      reference_ids: referenceIds,
      ...(needsStageRepair ? { tie_in_stage: requiredStages[index] } : {}),
      speaking_turns: speakingTurns,
      dialogue_mode: input.dialogueMode,
    };
  });
  return {
    ...output,
    shots: repairedShots,
    dialogue:
      input.dialogueMode === "character_dialogue"
        ? {
            ...(output.dialogue ?? {}),
            mode: "character_dialogue",
            speaker_reference_ids: [...allowedSpeakerRefs],
            speaker_count: allowedSpeakerRefs.size,
            speaking_turns: repairedShots.flatMap(shot => shot.speaking_turns),
          }
        : output.dialogue,
  };
}

const SPECIAL_SKILL_SLUG = "idea-to-video-prompt";

const SPECIAL_SKILL_FILES = [
  "SKILL.md",
  "references/video-prompt-rules.md",
  "schemas/input.schema.json",
  "schemas/output.schema.json",
  "schemas/ui.schema.json",
] as const;

export async function resolveSpecialSkillRoot(
  cwd = process.cwd()
): Promise<string> {
  const candidates = [
    path.resolve(cwd, "skills", SPECIAL_SKILL_SLUG),
    path.resolve(cwd, "apps", "web", "skills", SPECIAL_SKILL_SLUG),
    path.resolve(cwd, "..", "..", "apps", "web", "skills", SPECIAL_SKILL_SLUG),
    path.resolve(cwd, "..", "skills", SPECIAL_SKILL_SLUG),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    try {
      await Promise.all(
        SPECIAL_SKILL_FILES.map(file => fs.access(path.join(candidate, file)))
      );
      console.info("[VD_SPECIAL_RETRY] skill_root_resolved", {
        cwd,
        root: candidate,
      });
      return candidate;
    } catch {
      // Try the next known monorepo layout.
    }
  }

  throw new Error(
    `SPECIAL_SKILL_NOT_FOUND: unable to locate ${SPECIAL_SKILL_SLUG} from cwd ${cwd}`
  );
}

async function loadIdeaToVideoSkill(): Promise<{
  skill: string;
  rules: string;
  inputSchema: string;
  outputSchema: string;
  uiSchema: string;
}> {
  const root = await resolveSpecialSkillRoot();
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

export function buildSpecialPrompt(
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
  const selectedCharacterIds = new Set(input.characterIds.map(String));
  const selectedBindings = bindings.filter(
    binding =>
      binding.role !== "person" ||
      selectedCharacterIds.has(String(binding.provenance.characterId ?? ""))
  );
  const speakerReferenceIds = selectedBindings
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
  const prompt = {
    systemPrompt: `${skillText.skill}\n\nVIDEO PROMPT RULES:\n${skillText.rules}\n\nINPUT SCHEMA:\n${skillText.inputSchema}\n\nGENERIC OUTPUT SCHEMA (REFERENCE ONLY; its image/video prompt fields are NOT part of this planning pass):\n${skillText.outputSchema}\n\nUI SCHEMA:\n${skillText.uiSchema}\n\nSPECIAL TIE-IN OVERRIDE: This is a standalone special tie-in episode, not a continuation of the parent series. Return exactly 9 sequential shots numbered 1 through 9. Ignore any generic max_shots=5 limit in the supplied idea-to-video schema; this adapter's exactly-9 contract is authoritative. Use ONLY the reviewed special-episode idea, dialogue, selected character references, and selected product/location references. Do not read, infer, copy, or continue the parent series bible, episode breakdown, normal script, cliffhanger, normal cast, or any unrelated character. The nine shots must form one continuous beginning-middle-end story: every shot must declare continuity_in and continuity_out, a concise concrete continuity_anchor, and each next shot's continuity_in must repeat the prior shot's continuity_anchor exactly. In character_dialogue mode, every one of the 9 shots must carry at least one speaking_turn so the dialogue remains continuous across the full episode.\n\nSTORY-FIRST PLANNING CONTRACT: Write one concise, concrete story_summary for each shot. story_summary is the authoritative per-shot story beat derived only from the reviewed idea and selected dialogue. It must describe the visible action, the selected characters, the reviewed scene, the tie-in action, and the handoff to the next shot. This initial planning pass creates the storyboard narrative and dialogue only. Do NOT author image_prompt or video_prompt now: omit both fields or return them as empty strings. The application will pass each stored story_summary, dialogue, selected characters, generated scene, and product references through the existing normal per-shot prompt/image/video flow only when the user requests that action. Never invent a separate story or copy the parent series into any later prompt.\n\nTie-in presentation is the story engine, not a passive product placement. Every shot must include tie_in_stage and a concrete, observable tie_in_action describing what hands, body, product, or environment visibly does; never write only \"product is present\", \"holds the product\", or \"product on table\". For a product, the nine-shot sequence must cover preparation/opening, demonstration, hands_on_use, and a visible result; use the real action appropriate to the product: shampoo = open/pump/pour onto hand, apply and lather hair, rinse, then show the result; cream = open/scoop/apply to face, then show the result; toy = child picks up/assembles/plays/retries; bed = character approaches/sits/lies down/uses it; store or location = enter, browse/inspect, interact with and use the space, then show the resulting experience. Do not invent a function or claim not supported by the reviewed input/evidence. For a store/location tie-in, make the selected place visibly drive the action rather than serving as a background.\n\nCharacter isolation is mandatory: allow_additional_characters is always false. Only selected person reference IDs may appear; do not invent background people, reflections, silhouettes, or unnamed speakers. Product references are additive props, never replacement scenes: keep the reviewed location and action as the scene, place the selected product naturally inside it, and never turn a product image into the background or full scene. For a product tie-in, include at least one selected product reference ID in every shot and make the product's use/benefit materially visible in the story.\n\nReturn JSON only matching the supplied special output contract. This planning pass owns story and dialogue wording only; prompt engineering is deferred to the existing normal per-shot flow. Put every spoken line in that shot's speaking_turns in delivery order. If exact_dialogue_lines is non-empty, preserve every line verbatim in shots[].speaking_turns[].exact_dialogue.\n\nHIGHEST PRIORITY: Do not spend this planning pass generating image or video prompts. Empty image_prompt and video_prompt values are correct and expected.`,
    userPrompt: JSON.stringify({
      idea: input.idea,
      reference_type: input.referenceType,
      reference_images: selectedBindings.map(binding => ({
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
      // The special episode contract is intentionally stricter than the
      // generic skill input: selected-cast isolation is mandatory here.
      allow_additional_characters: false,
      lock_character_references: input.lockCharacterReferences,
      lock_reference_images: input.lockReferenceImages,
      marketplace_review_idea: input.marketplaceReviewIdea
        ? {
            title: input.marketplaceReviewIdea.title,
            logline: input.marketplaceReviewIdea.logline,
            episodeStory: input.marketplaceReviewIdea.episodeStory,
            dialogueScript: input.marketplaceReviewIdea.dialogueScript,
            dialogue: input.marketplaceReviewIdea.dialogue,
            scene: input.marketplaceReviewIdea.scene,
            productMentionReason: input.marketplaceReviewIdea.productMentionReason,
            actions: input.marketplaceReviewIdea.actions,
            benefitsMentioned: input.marketplaceReviewIdea.benefitsMentioned,
            claimsGuard: input.marketplaceReviewIdea.claimsGuard,
            continuity: input.marketplaceReviewIdea.continuity,
          }
        : undefined,
      special_episode_scope: "standalone_special_tie_in_only",
      semantic_retry_violation_codes: violationCodes,
    }),
  };
  prompt.systemPrompt +=
    "\n\nDIALOGUE DENSITY OVERRIDE: In character_dialogue mode, return exactly 2 short speaking_turns for every shot (18 total). Use only the selected speaker_reference_ids. Preserve every reviewed line verbatim and add a natural response or bridge; never leave shots 5-9 silent or with only one sentence.";
  return prompt;
}

type SpecialSkillInput = ReturnType<typeof specialTieInInputSchema.parse>;

function extractSpecialDialogueLines(input: SpecialSkillInput): string[] {
  const source = input.dialogueBrief?.trim()
    ? input.dialogueBrief
    : input.marketplaceReviewIdea?.dialogueScript ?? "";
  return source
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(line => {
      const separator = line.indexOf(":");
      return separator > 0 ? line.slice(separator + 1).trim() : "";
    })
    .filter(Boolean);
}

/**
 * Validate the semantic boundaries that Zod cannot express: the model output
 * must stay inside the selected cast, carry the selected product through the
 * whole special episode, and preserve the complete reviewed dialogue across
 * the nine shot-local turns. This is deliberately pure so it can be tested
 * without a provider or database.
 */
export function validateSpecialTieInStoryOutput(input: {
  output: SpecialSkillOutput;
  specialInput: SpecialSkillInput;
  bindings: SpecialEpisodeData["referenceBindings"];
}): void {
  if (input.output.status === "needs_clarification") return;

  const knownReferenceIds = new Set(
    input.bindings.map(binding => binding.skillReferenceId)
  );
  const productReferenceIds = new Set(
    input.bindings
      .filter(binding => binding.role === "product")
      .map(binding => binding.skillReferenceId)
  );
  const placeReferenceIds = new Set(
    input.bindings
      .filter(binding => binding.role === "location" || binding.role === "store")
      .map(binding => binding.skillReferenceId)
  );
  const requiresProductReference =
    productReferenceIds.size > 0 &&
    (input.specialInput.referenceType === "product" ||
      input.specialInput.referenceType === "mixed");
  const requiresPlaceReference =
    placeReferenceIds.size > 0 &&
    (input.specialInput.referenceType === "location" ||
      input.specialInput.referenceType === "store" ||
      input.specialInput.referenceType === "mixed");
  const selectedPersonReferenceIds = new Set(
    input.bindings
      .filter(binding => binding.role === "person")
      .filter(binding => {
        const characterId = String(binding.provenance.characterId ?? "");
        return (
          characterId.length > 0 &&
          input.specialInput.characterIds.includes(characterId)
        );
      })
      .map(binding => binding.skillReferenceId)
  );
  const allowedSpeakerIds = new Set(
    input.bindings
      .filter(binding => binding.role === "person")
      .filter(binding =>
        input.specialInput.speakerCharacterIds.includes(
          String(binding.provenance.characterId ?? "")
        )
      )
      .map(binding => binding.skillReferenceId)
  );

  for (const [shotIndex, shot] of input.output.shots.entries()) {
    if (!shot.continuity_in.trim() || !shot.continuity_out.trim()) {
      throw new Error(
        "SPECIAL_OUTPUT_INVALID: every shot must declare continuity_in and continuity_out"
      );
    }
    if (!shot.continuity_anchor.trim()) {
      throw new Error(
        `SPECIAL_OUTPUT_INVALID: continuity anchor is missing from shot ${shot.shot_number}`
      );
    }
    if (
      shotIndex > 0 &&
      !shot.continuity_in.includes(input.output.shots[shotIndex - 1]!.continuity_anchor)
    ) {
      throw new Error(
        `SPECIAL_OUTPUT_INVALID: shot ${shot.shot_number} does not continue the prior continuity anchor`
      );
    }
    if (!shot.tie_in_action.trim()) {
      throw new Error(
        `SPECIAL_OUTPUT_INVALID: tie-in action is missing from shot ${shot.shot_number}`
      );
    }
    if (
      input.specialInput.dialogueMode === "character_dialogue" &&
      (shot.speaking_turns.length < 2 || shot.speaking_turns.length > 3)
    ) {
      throw new Error(
        `SPECIAL_OUTPUT_INVALID: shot ${shot.shot_number} must contain 2-3 dialogue turns`
      );
    }
    for (const referenceId of shot.reference_ids) {
      if (!knownReferenceIds.has(referenceId)) {
        throw new Error(
          "SPECIAL_OUTPUT_INVALID: output referenced an unknown asset"
        );
      }
      const binding = input.bindings.find(
        candidate => candidate.skillReferenceId === referenceId
      );
      if (binding?.role === "person" && !selectedPersonReferenceIds.has(referenceId)) {
        throw new Error(
          "SPECIAL_OUTPUT_INVALID: output referenced a character outside the selected cast"
        );
      }
    }
    if (
      requiresProductReference &&
      !shot.reference_ids.some(referenceId => productReferenceIds.has(referenceId))
    ) {
      throw new Error(
        "SPECIAL_OUTPUT_INVALID: every product tie-in shot must carry a selected product reference"
      );
    }
    if (
      requiresPlaceReference &&
      !shot.reference_ids.some(referenceId => placeReferenceIds.has(referenceId))
    ) {
      throw new Error(
        "SPECIAL_OUTPUT_INVALID: every location/store tie-in shot must carry the selected place reference"
      );
    }
    if (
      requiresProductReference &&
      ["preparation", "demonstration", "hands_on_use", "retry"].includes(
        shot.tie_in_stage
      ) &&
      !ACTIVE_TIE_IN_ACTION_PATTERN.test(shot.tie_in_action)
    ) {
      throw new Error(
        `SPECIAL_OUTPUT_INVALID: shot ${shot.shot_number} tie-in action is not an observable product action`
      );
    }
    for (const turn of shot.speaking_turns) {
      if (!allowedSpeakerIds.has(turn.speaker_reference_id)) {
        throw new Error(
          "SPECIAL_OUTPUT_INVALID: dialogue speaker is not an authorized selected character"
        );
      }
    }
  }

  if (requiresProductReference) {
    const stages = new Set(input.output.shots.map(shot => shot.tie_in_stage));
    for (const requiredStage of [
      "preparation",
      "demonstration",
      "hands_on_use",
      "result",
    ] as const) {
      if (!stages.has(requiredStage)) {
        throw new Error(
          `SPECIAL_OUTPUT_INVALID: product tie-in is missing the ${requiredStage} presentation stage`
        );
      }
    }
  }
  if (requiresPlaceReference) {
    const stages = new Set(input.output.shots.map(shot => shot.tie_in_stage));
    for (const requiredStage of [
      "introduction",
      "hands_on_use",
      "result",
    ] as const) {
      if (!stages.has(requiredStage)) {
        throw new Error(
          `SPECIAL_OUTPUT_INVALID: location/store tie-in is missing the ${requiredStage} presentation stage`
        );
      }
    }
  }

  const shotDialogueTurns = input.output.shots.flatMap(
    shot => shot.speaking_turns
  );
  const expectedDialogue = extractSpecialDialogueLines(input.specialInput);
  if (input.specialInput.dialogueMode === "none") {
    if (shotDialogueTurns.length > 0) {
      throw new Error(
        "SPECIAL_OUTPUT_INVALID: dialogue was returned while dialogue mode is none"
      );
    }
    return;
  }
  if (shotDialogueTurns.length === 0) {
    throw new Error(
      "SPECIAL_OUTPUT_INVALID: complete shot-local dialogue is missing"
    );
  }
  const silentShot = input.output.shots.find(
    shot => shot.speaking_turns.length === 0
  );
  if (silentShot) {
    throw new Error(
      `SPECIAL_OUTPUT_INVALID: character dialogue is missing from shot ${silentShot.shot_number}`
    );
  }
  if (
    expectedDialogue.some(
      line =>
        !shotDialogueTurns.some(turn => turn.exact_dialogue.trim() === line)
    )
  ) {
    throw new Error(
      "SPECIAL_OUTPUT_INVALID: reviewed dialogue was not preserved across the nine shots"
    );
  }
  const exactDialogueLines = extractSpecialExactDialogueLines(
    input.specialInput.dialogueBrief
  );
  if (
    exactDialogueLines.some(
      line =>
        !shotDialogueTurns.some(turn => turn.exact_dialogue.trim() === line)
    )
  ) {
    throw new Error(
      "SPECIAL_OUTPUT_INVALID: exact dialogue line was not preserved"
    );
  }
}

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
  onBindingsResolved?: (bindings: ResolvedSpecialReferenceBinding[]) => void;
  onLlmSuccess?: (usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  }) => Promise<void>;
  forensics?: {
    onSkillLoaded?: (event: { skillText: unknown; skillHash: string }) => Promise<unknown> | unknown;
    onInputCaptured?: (event: { input: unknown; bindings: unknown }) => Promise<unknown> | unknown;
    rawPayloadObserver?: (event: RawLlmPayloadEvent) => Promise<unknown> | unknown;
    planningAttemptObserver?: (event: JsonPlanningAttemptEvent) => Promise<unknown> | unknown;
    retryDecisionObserver?: (event: JsonPlanningRetryEvent) => Promise<unknown> | unknown;
    onAttemptStarted?: (event: { attempt: number }) => Promise<unknown> | unknown;
    onValidationFailure?: (event: { error: unknown; candidate?: unknown; attempt: number }) => Promise<unknown> | unknown;
    onFallback?: (event: { output: SpecialSkillOutput; reason: string }) => Promise<unknown> | unknown;
  };
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
    characterReferenceCount: parsed.characterIds.length,
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
  input.onBindingsResolved?.(resolved);
  const skillText = await loadIdeaToVideoSkill();
  await input.forensics?.onSkillLoaded?.({
    skillText,
    skillHash: crypto.createHash("sha256").update(JSON.stringify(skillText)).digest("hex"),
  });
  await input.forensics?.onInputCaptured?.({
    input: parsed,
    bindings: resolved.map(binding => ({
      skillReferenceId: binding.skillReferenceId,
      role: binding.role,
      mediaAssetId: binding.mediaAssetId,
      provenance: binding.provenance,
    })),
  });
  const model = await resolveStoryBibleModel();
  let violationCodes: string[] = [];
  let lastError: unknown = null;
  let lastValidationMessage = "validation";
  const planningSchema = {
    safeParse(value: unknown): {
      success: boolean;
      data?: SpecialSkillOutput;
      error?: unknown;
    } {
      try {
        const normalized = validateSpecialSkillOutput(value);
        return {
          success: true,
          data: repairSpecialTieInOutput(normalized, parsed, input.bindings),
        };
      } catch (error) {
        return { success: false, error };
      }
    },
  };
  // Keep the wall-clock bound finite. The planner already owns bounded
  // physical/schema retries; two logical passes are enough before the local
  // deterministic repair takes over.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await input.forensics?.onAttemptStarted?.({ attempt: attempt + 1 });
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
          maxSchemaRetries: 1,
          maxTransientRetries: 1,
          schema: planningSchema,
          label: "special tie-in idea-to-video-prompt",
          rawPayloadObserver: input.forensics?.rawPayloadObserver
            ? async event => { await input.forensics?.rawPayloadObserver?.(event); }
            : undefined,
          planningAttemptObserver: input.forensics?.planningAttemptObserver
            ? async event => { await input.forensics?.planningAttemptObserver?.(event); }
            : undefined,
          retryDecisionObserver: input.forensics?.retryDecisionObserver
            ? async event => { await input.forensics?.retryDecisionObserver?.(event); }
            : undefined,
          schemaRetryContract:
            "SPECIAL TIE-IN OUTPUT REQUIREMENT: return exactly 9 story-only shots, with shot_count=9 and shot_number values 1 through 9 in order. Every shot must include story_summary, continuity_in, continuity_out, continuity_anchor, tie_in_stage, and tie_in_action. Every shot must include its required dialogue turns. Do not generate image_prompt or video_prompt in this planning pass; omit them or return empty strings. Never return 5 shots or pad a shorter result. For product references, include preparation, demonstration, hands_on_use, and result stages, with concrete observable actions rather than passive placement.",
        });
        candidate = planning.data;
        effectiveModel = planning.model;
        inputTokens = planning.response?.usage?.prompt_tokens ?? 0;
        outputTokens = planning.response?.usage?.completion_tokens ?? 0;
      }
      const output = clearSpecialPromptDrafts(
        repairSpecialTieInOutput(
          validateSpecialSkillOutput(candidate),
          parsed,
          input.bindings
        )
      );
      validateSpecialTieInStoryOutput({
        output,
        specialInput: parsed,
        bindings: input.bindings,
      });
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
        const findingCodes = outputSafety.findings
          .map(finding => finding.code)
          .join(",") || "unknown";
        throw new Error(
          `SPECIAL_SAFETY_BLOCKED: generated prompts contain a high-risk policy context; findings=${findingCodes}`
        );
      }
      await input.onLlmSuccess?.({
        model: effectiveModel,
        inputTokens,
        outputTokens,
      });
      return output;
    } catch (error) {
      lastError = error;
      await input.forensics?.onValidationFailure?.({ error, attempt: attempt + 1 });
      if (error instanceof z.ZodError) {
        lastError = error;
        violationCodes = compactViolationCodes(error);
        continue;
      }
      // Semantic contract failures must go back through the same bounded
      // repair loop as schema failures. Previously these errors escaped on
      // the first attempt, leaving the special episode in a failed/quiet
      // state even though the model could have repaired its 9-shot output.
      if (
        error instanceof Error &&
        error.message.startsWith("SPECIAL_OUTPUT_INVALID:")
      ) {
        lastValidationMessage = error.message;
        violationCodes = [error.message.slice(0, 240)];
        console.warn("[VD_SPECIAL_RETRY] semantic_output_retry", {
          seriesId: input.seriesId,
          attempt: attempt + 1,
          violation: error.message.slice(0, 240),
        });
        continue;
      }
      // A generated output safety finding is recoverable when the submitted
      // idea already passed the input safety gate: materialize the local,
      // deterministic safe fallback instead of spending another provider
      // call and failing the whole special episode. The fallback is marked
      // needs_review in quality_control so the user can repair only the
      // affected prompt/content when needed. Input-level safety blocks still
      // throw before this loop and remain hard stops.
      if (
        error instanceof Error &&
        error.message.startsWith("SPECIAL_SAFETY_BLOCKED: generated prompts")
      ) {
        lastValidationMessage = error.message;
        console.warn("[VD_SPECIAL_FALLBACK] generated_output_safety_repair", {
          seriesId: input.seriesId,
          attempt: attempt + 1,
          reason: error.message.slice(0, 500),
        });
        break;
      }
      const errorCode = (error as { code?: unknown } | null)?.code;
      if (errorCode === "VD_JSON_PARSE_FAILED" || errorCode === "VD_SCHEMA_VALIDATION_FAILED") {
        lastValidationMessage = error instanceof Error ? error.message : String(error);
        violationCodes = [lastValidationMessage.slice(0, 240)];
        continue;
      }
      throw error;
    }
  }
  const failureReason = lastError instanceof Error ? lastError.message : lastValidationMessage;
  try {
    const fallback = buildDeterministicSpecialTieInFallback({
      specialInput: parsed,
      bindings: input.bindings,
      failureReason,
    });
    validateSpecialTieInStoryOutput({
      output: fallback,
      specialInput: parsed,
      bindings: input.bindings,
    });
    await input.forensics?.onFallback?.({ output: fallback, reason: failureReason });
    return fallback;
  } catch (fallbackError) {
    throw new Error(
      `SPECIAL_FALLBACK_FAILED: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}; original=${failureReason}`
    );
  }
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
  const isRetry = payload.idempotencyKey?.includes(":retry:") === true;
  if (isRetry) {
    console.info("[VD_SPECIAL_RETRY]", {
      event: "worker_start",
      episodeId: raw.episodeId,
      inputVersion: raw.inputVersion,
      jobId: execution.jobId,
      traceId: execution.traceId,
    });
  }
  const [row] = await db
    .select({
      specialData: verticalDramaEpisodes.specialData,
      episodeKind: verticalDramaEpisodes.episodeKind,
      storyboard: verticalDramaEpisodes.storyboard,
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
  const forensicRecorder = createSpecialTieInForensicRecorder({
    tenantId: payload.tenantId,
    userId: payload.userId,
    seriesId: raw.seriesId,
    episodeId: raw.episodeId,
    jobId: execution.jobId,
    traceId: execution.traceId,
    createIntentId: specialData.createIntentId,
    inputVersion: raw.inputVersion,
    skillSlug: "idea-to-video-prompt",
  });
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
  await forensicRecorder.emit({
    eventType: "job_started",
    stage: "context_setup",
    logicalAttempt: attempt,
    outcome: "started",
    startedAt: new Date(startedAt),
  });
  let output: SpecialSkillOutput;
  let resolvedSpecialReferences: ResolvedSpecialReferenceBinding[] = [];
  let llmUsage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  } | null = null;
  let billedSkillRunId: string | null = null;
  let billedAmount = 0;
  let billingSettled = false;
  const existingSpecialLocationReference =
    specialData.input.referenceImages.find(
      reference =>
        (reference.role === "location" ||
          reference.role === "store" ||
          specialData.input.referenceType === "location" ||
          specialData.input.referenceType === "store") &&
        typeof reference.provenance?.locationKey === "string" &&
        reference.provenance.locationKey.trim().length > 0
    );
  const personBindings = specialData.referenceBindings.filter(
    binding => binding.role === "person"
  );
  let specialLocationKey =
    specialData.input.sceneLocationKey?.trim() ||
    (typeof existingSpecialLocationReference?.provenance?.locationKey === "string"
      ? existingSpecialLocationReference.provenance.locationKey
      : undefined);
  try {
    output = await generateSpecialSkillOutput({
      actor: { tenantId: payload.tenantId, userId: payload.userId },
      seriesId: raw.seriesId,
      specialData,
      bindings: specialData.referenceBindings,
      onBindingsResolved: bindings => {
        resolvedSpecialReferences = bindings;
      },
      onLlmSuccess: async ({ model, inputTokens, outputTokens }) => {
        // Defer charging until post-generation work (including automatic
        // scene/look slot reconciliation) has also succeeded.
        llmUsage = { model, inputTokens, outputTokens };
      },
      forensics: {
        onSkillLoaded: event => forensicRecorder.emit({
          eventType: "skill_loaded",
          stage: "context_setup",
          logicalAttempt: attempt,
          skillVersion: event.skillHash,
          skillHash: event.skillHash,
          responsePayload: JSON.stringify(event.skillText),
          outcome: "loaded",
        }),
        onInputCaptured: event => forensicRecorder.emit({
          eventType: "input_captured",
          stage: "context_setup",
          logicalAttempt: attempt,
          metadata: { input: event.input, bindings: event.bindings },
          outcome: "captured",
        }),
        rawPayloadObserver: event => forensicRecorder.emit({
          eventType: event.phase === "request_started" ? "llm_request_started" : "llm_response_received",
          stage: "generation",
          logicalAttempt: attempt,
          planningAttemptNumber: event.planningAttemptNumber,
          model: event.model,
          providerId: event.providerId,
          providerName: event.providerName,
          providerCallId: event.providerCallId,
          statusCode: event.statusCode,
          metadata: {
            attemptOrdinal: event.attemptOrdinal,
            contentType: event.contentType,
            responseCharCount: event.responseCharCount,
            elapsedMs: event.elapsedMs,
          },
          requestPayload: event.requestBody,
          responsePayload: event.responseBody,
          outcome: event.phase,
        }),
        planningAttemptObserver: event => forensicRecorder.emit({
          eventType: event.phase === "success"
            ? "output_accepted"
            : event.errorCode === "VD_JSON_PARSE_FAILED"
              ? "json_parse_failed"
              : event.errorCode === "VD_SCHEMA_VALIDATION_FAILED"
                ? "schema_validation_failed"
                : "output_rejected",
          stage: "validation",
          logicalAttempt: attempt,
          planningAttemptNumber: event.planningAttemptNumber,
          model: event.model,
          providerId: event.providerId,
          providerName: event.providerName,
          providerCallId: event.providerCallId,
          parsedOutput: event.parsedOutput,
          responsePayload: event.rawOutput,
          schemaIssues: event.schemaIssues,
          metadata: {
            ...(event.responseMetadata ?? {}),
            physicalAttempts: event.physicalAttempts,
            promptHash: event.promptHash,
            systemPromptLength: event.systemPromptLength,
            userPromptLength: event.userPromptLength,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            finishReason: event.finishReason,
          },
          outcome: event.phase,
          startedAt: event.startedAt,
          completedAt: event.completedAt,
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
        }),
        retryDecisionObserver: event => forensicRecorder.emit({
          eventType: "retry_decided",
          stage: "retry",
          logicalAttempt: attempt,
          planningAttemptNumber: event.planningAttemptNumber,
          model: event.currentModel,
          retryCategory: event.classification,
          retryReason: event.reason,
          nextAction: event.nextModel ? "model_fallback" : "retry",
          remainingBudget: event.remainingBudget,
          metadata: {
            nextModel: event.nextModel,
            schemaRetryNumber: event.schemaRetryNumber,
            transientRetryNumber: event.transientRetryNumber,
            modelFallbackAttempt: event.modelFallbackAttempt,
          },
          outcome: "retrying",
        }),
        onValidationFailure: event => forensicRecorder.emit({
          eventType: event.error instanceof Error && event.error.message.startsWith("SPECIAL_OUTPUT_INVALID:")
            ? "semantic_validation_failed"
            : "output_rejected",
          stage: "validation",
          logicalAttempt: attempt,
          retryReason: event.error instanceof Error ? event.error.message : String(event.error),
          metadata: { attempt: event.attempt },
          outcome: "rejected",
        }),
        onFallback: event => forensicRecorder.emit({
          eventType: "fallback_materialized",
          stage: "repair",
          logicalAttempt: attempt,
          outcome: "needs_review",
          errorCode: "SPECIAL_DETERMINISTIC_FALLBACK",
          errorMessage: event.reason.slice(0, 1000),
          parsedOutput: event.output,
          metadata: {
            source: "deterministic_fallback",
            shotCount: event.output.shot_count,
            referenceIds: [...new Set(event.output.shots.flatMap(shot => shot.reference_ids))],
          },
        }),
        onAttemptStarted: event => forensicRecorder.emit({
          eventType: "heartbeat",
          stage: "generation",
          logicalAttempt: event.attempt,
          outcome: "attempt_started",
        }),
      },
    });
    await forensicRecorder.emit({
      eventType: "output_accepted",
      stage: "generation",
      logicalAttempt: attempt,
      outcome: output.status,
      metadata: { shotCount: output.shot_count },
    });
    const locationReferences = specialData.input.referenceImages.filter(
      reference =>
        reference.role === "location" ||
        reference.role === "store" ||
        specialData.input.referenceType === "location" ||
        specialData.input.referenceType === "store"
    );
    if (
      output.shot_count === 9 &&
      output.shots.length === 9 &&
      locationReferences.length > 0 &&
      !locationReferences.some(
        reference =>
          typeof reference.provenance?.locationKey === "string" &&
          reference.provenance.locationKey.trim().length > 0
      )
    ) {
      const locationSlot = await reconcileSpecialLocationSlot({
        actor: { tenantId: payload.tenantId, userId: payload.userId },
        seriesId: raw.seriesId,
        referenceType:
          specialData.input.referenceType === "store" ? "store" : "location",
        label:
          locationReferences[0]?.label ??
          specialData.input.referenceType,
        mediaAssetIds: locationReferences.map(
          reference => reference.mediaAssetId
        ),
      }).catch(error => {
        const message =
          error instanceof Error ? error.message : "location link failed";
        throw new Error(`SPECIAL_LOCATION_LINK_FAILED: ${message}`);
      });
      specialLocationKey = locationSlot.locationKey;
    }
    if (
      output.shot_count === 9 &&
      output.shots.length === 9 &&
      !specialLocationKey &&
      (specialData.input.referenceType === "product" ||
        specialData.input.referenceType === "mixed")
    ) {
      // Product/mixed tie-ins do not have a scene image in their selected
      // references. Provision the existing Scenes roster slot now so the
      // normal Scenes tab can generate/approve its establishing plate; the
      // product images remain exclusively in the additive product track.
      const sceneSlot = buildSpecialTieInSceneSlot(specialData.input);
      try {
        const location = await reconcileSpecialStorySceneSlot({
          actor: { tenantId: payload.tenantId, userId: payload.userId },
          seriesId: raw.seriesId,
          label: sceneSlot.label,
          description: sceneSlot.description,
          metadata: {
            referenceType: specialData.input.referenceType,
            source: "special_tie_in",
          },
        });
        specialLocationKey = location.locationKey;
        console.info("[VD_SPECIAL_SCENE] provisioned_scene_slot", {
          episodeId: raw.episodeId,
          seriesId: raw.seriesId,
          locationId: location.locationId,
          locationKey: location.locationKey,
          hasApprovedImage: false,
          productReferenceCount: specialData.input.referenceImages.length,
        });
      } catch (error) {
        // A scene-slot write is additive. Preserve the complete nine-shot
        // story if the roster is temporarily unavailable; the forensic log
        // makes the missing normal scene step actionable without turning it
        // into a paid/provider failure.
        console.warn("[VD_SPECIAL_SCENE] provision_scene_slot_failed", {
          episodeId: raw.episodeId,
          seriesId: raw.seriesId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const settledUsage = llmUsage as {
      model: string;
      inputTokens: number;
      outputTokens: number;
    } | null;
    if (settledUsage) {
      const skillRunId =
        payload.idempotencyKey ??
        `vd-special-tie-in:${payload.tenantId}:${raw.episodeId}:${raw.inputVersion}`;
      billedSkillRunId = skillRunId;
      billedAmount = calculateCreditsForLLM(
        settledUsage.inputTokens,
        settledUsage.outputTokens,
        settledUsage.model
      );
      await deductCredits({
        userId: payload.userId,
        tenantId: payload.tenantId,
        amount: billedAmount,
        description: `Vertical Drama — create special tie-in storyboard (episode #${raw.episodeId})`,
        idempotencyKey: skillRunId,
        skillRunId,
        skillSlug: "idea-to-video-prompt",
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_special_tie_in",
          model: settledUsage.model,
          inputTokens: settledUsage.inputTokens,
          outputTokens: settledUsage.outputTokens,
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
    await forensicRecorder.emit({
      eventType: "job_failed",
      stage: "generation",
      logicalAttempt: attempt,
      outcome: "failed",
      errorCode,
      errorMessage,
      retryReason: errorMessage,
      completedAt: new Date(),
    });
    if (isRetry) {
      console.error("[VD_SPECIAL_RETRY]", {
        event: "worker_error",
        episodeId: raw.episodeId,
        inputVersion: raw.inputVersion,
        jobId: execution.jobId,
        traceId: execution.traceId,
        errorCode,
        message: errorMessage.slice(0, 500),
      });
    }
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
  const { startFramePlan, motionPromptPack } =
    buildSpecialTieInPromptArtifacts({
      specialData,
      output,
      productReferenceUrls: resolveSpecialProductReferenceUrls(
        resolvedSpecialReferences
      ),
      locationKey: specialLocationKey,
    });
  const specialStoryboard = specialLocationKey
    ? buildSpecialTieInStoryboard(
        specialData.input,
        specialLocationKey,
        specialData.input.referenceImages.find(
          reference =>
            reference.role === "location" || reference.role === "store"
        )?.label,
        output.shots.map(shot => ({
          shotNumber: shot.shot_number,
          summary: buildSpecialCanonicalShotSummary(shot),
          action: shot.tie_in_action,
          requiredCharacterRefs: personBindings.map(binding =>
            String(binding.provenance.characterKey ?? binding.skillReferenceId)
          ),
          durationSeconds: output.shot_duration_seconds,
        }))
      )
    : row.storyboard;
  // Persist every validated nine-shot result. Planner clarification notes are
  // retained as review metadata so the user can refine individual shots after
  // the complete storyboard is available.
  const promptReady = output.shot_count === 9 && output.shots.length === 9;
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
      storySummaries: output.shots.map(shot => ({
        shotNumber: shot.shot_number,
        summary:
          startFramePlan?.frames.find(frame => frame.shotNumber === shot.shot_number)
            ?.canonicalShotSummary ??
          (shot.story_summary?.trim() || shot.tie_in_action.trim()).slice(0, 2_000),
      })),
      assumptions: output.assumptions,
      qualityControl: output.quality_control,
      source:
        isRecord(output.quality_control) &&
        output.quality_control.source === "deterministic_fallback"
          ? "deterministic_fallback"
          : "llm",
      needsReview:
        output.status === "needs_clarification" ||
        (isRecord(output.quality_control) &&
          output.quality_control.needs_review === true),
    },
  };
  let updated: Array<{ id: number }>;
  await forensicRecorder.emit({
    eventType: "persistence_started",
    stage: "persistence",
    logicalAttempt: attempt,
    outcome: "started",
  });
  try {
    updated = await db
      .update(verticalDramaEpisodes)
      .set({
        specialData: nextData,
        startFramePlan,
        motionPromptPack,
        storyboard: specialStoryboard,
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
    const persistenceErrorMessage = error instanceof Error ? error.message : String(error);
    await forensicRecorder.emit({
      eventType: "persistence_failed",
      stage: "persistence",
      logicalAttempt: attempt,
      outcome: "failed",
      errorCode: "SPECIAL_OUTPUT_PERSISTENCE_FAILED",
      errorMessage: persistenceErrorMessage,
      completedAt: new Date(),
    });
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
            errorCode: "SPECIAL_OUTPUT_PERSISTENCE_FAILED",
            errorMessage: persistenceErrorMessage.slice(0, 1000),
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
      )
      .catch(statusError => {
        console.error("[VD_SPECIAL_FORENSICS] persistence_failure_status_update_failed", {
          episodeId: raw.episodeId,
          message: statusError instanceof Error ? statusError.message : String(statusError),
        });
      });
    await forensicRecorder.emit({
      eventType: "job_failed",
      stage: "persistence",
      logicalAttempt: attempt,
      outcome: "failed",
      errorCode: "SPECIAL_OUTPUT_PERSISTENCE_FAILED",
      errorMessage: persistenceErrorMessage,
      completedAt: new Date(),
    });
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
    const staleError = new Error(
      "SPECIAL_OUTPUT_STALE_INPUT: special episode input changed before output could be saved"
    );
    await forensicRecorder.emit({
      eventType: "persistence_failed",
      stage: "persistence",
      logicalAttempt: attempt,
      outcome: "stale",
      errorCode: "SPECIAL_OUTPUT_STALE_INPUT",
      errorMessage: staleError.message,
      completedAt: new Date(),
    });
    await forensicRecorder.emit({
      eventType: "job_failed",
      stage: "persistence",
      logicalAttempt: attempt,
      outcome: "failed",
      errorCode: "SPECIAL_OUTPUT_STALE_INPUT",
      errorMessage: staleError.message,
      completedAt: new Date(),
    });
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
    throw staleError;
  }
  await forensicRecorder.emit({
    eventType: "persistence_succeeded",
    stage: "persistence",
    logicalAttempt: attempt,
    outcome: "succeeded",
    metadata: { outputVersion: nextOutputVersion, shotCount: output.shot_count },
    completedAt: new Date(),
  });
  console.info("[VD_SPECIAL_RETRY] artifact_persisted", {
    episodeId: raw.episodeId,
    inputVersion: raw.inputVersion,
    outputVersion: nextOutputVersion,
    shotCount: output.shot_count,
    clipCount: motionPromptPack?.clips.length ?? 0,
    selectedCharacterCount: specialData.input.characterIds.length,
    selectedProductCount: specialData.referenceBindings.filter(
      binding => binding.role === "product"
    ).length,
    productReferenceUrlCount: resolveSpecialProductReferenceUrls(
      resolvedSpecialReferences
    ).length,
  });
  if (isRetry) {
    console.info("[VD_SPECIAL_RETRY]", {
      event: "worker_completed",
      episodeId: raw.episodeId,
      inputVersion: raw.inputVersion,
      jobId: execution.jobId,
      traceId: execution.traceId,
      status: promptReady ? "succeeded" : "needs_clarification",
      outputVersion: nextOutputVersion,
    });
  }
  await forensicRecorder.emit({
    eventType: "job_succeeded",
    stage: "completed",
    logicalAttempt: attempt,
    outcome: promptReady ? "succeeded" : "needs_clarification",
    completedAt: new Date(),
  });
  return {
    shotCount: output.shot_count,
    outputVersion: nextOutputVersion,
    promptReady,
  };
}
