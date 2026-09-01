import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "../db";
import {
  mediaAssets,
  verticalDramaCharacters,
  verticalDramaMarketplaceReviewIdeaRuns,
  verticalDramaSeries,
} from "../../drizzle/schema";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
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
  findSpecialStorySceneMatches,
  reconcileSpecialStorySceneSlot,
  resolveSpecialStorySceneSlotDecision,
} from "./verticalDramaSpecialReferences";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import { isAvailable } from "./providerHealth";
import {
  marketplaceReviewIdeaInputSchema,
  marketplaceReviewIdeaSchema,
  marketplaceReviewIdeaOutputSchema,
  type MarketplaceReviewIdeaInput,
  type MarketplaceReviewIdeaOutput,
} from "../../shared/marketplaceReviewIdeas/contracts";

const SKILL_SLUG = "vertical-drama-marketplace-review-story-planner";

const MARKETPLACE_REVIEW_IDEA_OUTPUT_CONTRACT =
  'Return exactly one complete JSON object with schemaVersion: 1 and exactly 3 items in ideas. Every idea must include these exact keys: ideaId, title, logline, episodeStory, dialogueScript, storyFunction, scene, productMentionReason, dialogue, actions, benefitsMentioned, claimsGuard, continuity, lookSlotRequests, sceneSlotRequests. episodeStory is the primary deliverable: write a coherent human-readable Thai drama episode in at least 3 connected paragraphs with setup, character problem, natural product appearance, believable use, and scene resolution; do not write bullets or a product review. If input.footageGuide is present, keep the story compatible with its transcript, scene ranges, speech/silence ranges, and semanticGuide; do not invent actions or spoken content that contradicts known footage evidence, and explicitly keep uncertain facts conservative. Follow input.dialogueMode exactly: when it is character_dialogue, include clear named spoken lines; when it is none, characters must not speak at all, dialogue must be an empty array, dialogueScript must be an empty string, and replace speech with human-readable actions, facial expressions, body language, and scene narration. scene must include location, atmosphere, and at least 2 beats. Each dialogue item must include speaker and line. claimsGuard must include allowed, prohibited, and notes. continuity must include dnaKept, relationshipBeat, and toneFit. Use only the characters in the selectedCharacterIds/characters input. Never introduce, name, or give dialogue to an excluded character. Every dialogue speaker must be one of the selected characters, and every lookSlotRequests.characterId must be one of the selectedCharacterIds. Return all arrays even when empty. Never rename keys, omit required keys, return null for an object, return shot prompts, or return markdown/prose outside the JSON object.';

const MARKETPLACE_REVIEW_IDEA_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "vertical_drama_marketplace_review_ideas_v1",
    strict: false,
    schema: {
      type: "object",
      properties: {
        schemaVersion: { type: "integer", enum: [1] },
        ideas: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              ideaId: { type: "string", minLength: 1 },
              title: { type: "string", minLength: 1 },
              logline: { type: "string", minLength: 1 },
              episodeStory: { type: "string", minLength: 1 },
              dialogueScript: { type: "string" },
              storyFunction: { type: "string", minLength: 1 },
              scene: {
                type: "object",
                properties: {
                  location: { type: "string", minLength: 1 },
                  time: { type: "string" },
                  atmosphere: { type: "string", minLength: 1 },
                  beats: {
                    type: "array",
                    minItems: 2,
                    maxItems: 8,
                    items: { type: "string", minLength: 1 },
                  },
                },
                required: ["location", "atmosphere", "beats"],
                additionalProperties: false,
              },
              productMentionReason: { type: "string", minLength: 1 },
              dialogue: {
                type: "array",
                minItems: 0,
                maxItems: 12,
                items: {
                  type: "object",
                  properties: {
                    speaker: { type: "string", minLength: 1 },
                    line: { type: "string", minLength: 1 },
                    delivery: { type: "string" },
                  },
                  required: ["speaker", "line"],
                  additionalProperties: false,
                },
              },
              actions: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                items: { type: "string", minLength: 1 },
              },
              benefitsMentioned: {
                type: "array",
                maxItems: 8,
                items: { type: "string", minLength: 1 },
              },
              claimsGuard: {
                type: "object",
                properties: {
                  allowed: {
                    type: "array",
                    maxItems: 12,
                    items: { type: "string", minLength: 1 },
                  },
                  prohibited: {
                    type: "array",
                    maxItems: 20,
                    items: { type: "string", minLength: 1 },
                  },
                  notes: {
                    type: "array",
                    maxItems: 12,
                    items: { type: "string", minLength: 1 },
                  },
                },
                required: ["allowed", "prohibited", "notes"],
                additionalProperties: false,
              },
              continuity: {
                type: "object",
                properties: {
                  dnaKept: {
                    type: "array",
                    maxItems: 12,
                    items: { type: "string", minLength: 1 },
                  },
                  relationshipBeat: { type: "string", minLength: 1 },
                  toneFit: { type: "string", minLength: 1 },
                },
                required: ["dnaKept", "relationshipBeat", "toneFit"],
                additionalProperties: false,
              },
              lookSlotRequests: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  properties: {
                    characterId: { type: "string", minLength: 1 },
                    lookLabel: { type: "string", minLength: 1 },
                    reason: { type: "string", minLength: 1 },
                    dnaConstraints: {
                      type: "array",
                      maxItems: 12,
                      items: { type: "string", minLength: 1 },
                    },
                  },
                  required: [
                    "characterId",
                    "lookLabel",
                    "reason",
                    "dnaConstraints",
                  ],
                  additionalProperties: false,
                },
              },
              sceneSlotRequests: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  properties: {
                    sceneLabel: { type: "string", minLength: 1 },
                    description: { type: "string", minLength: 1 },
                    reason: { type: "string", minLength: 1 },
                  },
                  required: ["sceneLabel", "description", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "ideaId",
              "title",
              "logline",
              "episodeStory",
              "dialogueScript",
              "storyFunction",
              "scene",
              "productMentionReason",
              "dialogue",
              "actions",
              "benefitsMentioned",
              "claimsGuard",
              "continuity",
              "lookSlotRequests",
              "sceneSlotRequests",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["schemaVersion", "ideas"],
      additionalProperties: false,
    },
  },
} as const;

// Some JSON-mode providers serialize the numeric contract version as "1.0".
// Normalize that harmless representation before applying the strict business
// contract; all other missing or malformed fields must still be repaired by
// the schema retry loop rather than fabricated here.
function marketplaceReviewIdeaLlmOutputSchema(
  dialogueMode: "none" | "character_dialogue"
) {
  return z.preprocess(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const record = value as Record<string, unknown>;
    return record.schemaVersion === "1.0"
      ? { ...record, schemaVersion: 1 }
      : value;
  }, marketplaceReviewIdeaOutputSchema.superRefine((output, ctx) => {
    output.ideas.forEach((idea, index) => {
      if (idea.episodeStory.trim().length < 280) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          minimum: 280,
          type: "string",
          inclusive: true,
          path: ["ideas", index, "episodeStory"],
          message: "episodeStory must be a usable multi-paragraph drama scene",
        });
      }
      if (idea.episodeStory.trim().split(/\n\s*\n/).filter(Boolean).length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ideas", index, "episodeStory"],
          message: "episodeStory must contain at least three connected paragraphs",
        });
      }
      if (dialogueMode === "character_dialogue") {
        if (idea.dialogue.length < 1 || idea.dialogueScript.trim().length < 60) {
          ctx.addIssue({
            code: z.ZodIssueCode.too_small,
            minimum: 60,
            type: "string",
            inclusive: true,
            path: ["ideas", index, "dialogueScript"],
            message: "dialogueScript must contain usable dialogue and actions",
          });
        }
        if (
          idea.dialogueScript
            .split(/\r?\n/)
            .filter(line => /^[^:\n]{1,80}:\s*\S+/.test(line.trim())).length < 2
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["ideas", index, "dialogueScript"],
            message: "dialogueScript must contain at least two named dialogue lines",
          });
        }
      } else if (idea.dialogue.length > 0 || idea.dialogueScript.trim().length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ideas", index, "dialogue"],
          message: "No-dialogue ideas must not contain spoken lines",
        });
      }
    });
  }));
}

function bounded(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result ? result.slice(0, max) : undefined;
}

async function loadSkillText(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "apps/web/skills", SKILL_SLUG, "skill.md"),
    path.resolve(process.cwd(), "skills", SKILL_SLUG, "skill.md"),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf8");
    } catch {
      // Try the next supported app/repository layout.
    }
  }
  throw new Error(`Skill ${SKILL_SLUG} is not installed`);
}

function safeJson(value: unknown, max = 6000): unknown {
  try {
    const parsed = JSON.parse(JSON.stringify(value ?? null)) as unknown;
    if (JSON.stringify(parsed).length <= max) return parsed;

    // Keep the prompt payload valid when a large top-level object exceeds the
    // budget. Never return null here: optional contract fields may be omitted,
    // but null is not a valid replacement for an object such as character DNA.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const bounded: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(parsed)) {
        const candidate = { ...bounded, [key]: entry };
        if (JSON.stringify(candidate).length <= max) bounded[key] = entry;
      }
      return bounded;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Older idea runs were persisted before the editable story/script fields were
 * added. Keep those runs selectable and editable by deriving a conservative
 * display version from fields that were already stored; never invent product
 * claims or character facts here.
 */
function normalizePersistedIdea(value: unknown) {
  const record = asRecord(value);
  const scene = asRecord(record.scene);
  const dialogue = Array.isArray(record.dialogue)
    ? record.dialogue
        .map(item => asRecord(item))
        .filter(item => typeof item.speaker === "string" && typeof item.line === "string")
    : [];
  const dialogueScript =
    bounded(record.dialogueScript, 12_000) ??
    dialogue
      .map(item => `${String(item.speaker)}: ${String(item.line)}`)
      .join("\n");
  const storyParts = [
    bounded(record.logline, 2_000),
    bounded(scene.location, 1_000)
      ? `ฉากเกิดขึ้นที่${String(scene.location)}${bounded(scene.atmosphere, 1_000) ? ` บรรยากาศ${String(scene.atmosphere)}` : ""}`
      : undefined,
    ...stringList(scene.beats).slice(0, 8),
    bounded(record.productMentionReason, 2_000),
    ...stringList(record.actions).slice(0, 12),
  ].filter((part): part is string => Boolean(part));
  return marketplaceReviewIdeaSchema.parse({
    ...record,
    episodeStory: bounded(record.episodeStory, 12_000) ?? storyParts.join("\n\n"),
    dialogueScript,
  });
}

function normalizePersistedOutput(value: unknown): MarketplaceReviewIdeaOutput {
  const record = asRecord(value);
  return marketplaceReviewIdeaOutputSchema.parse({
    ...record,
    schemaVersion: record.schemaVersion === "1.0" ? 1 : record.schemaVersion,
    ideas: Array.isArray(record.ideas)
      ? record.ideas.map(normalizePersistedIdea)
      : [],
  });
}

function fingerprint(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export type MarketplaceReviewIdeaValidationOptions = {
  allowedCharacterIds?: readonly string[];
  allowedCharacterNames?: readonly string[];
  excludedCharacterNames?: readonly string[];
  dialogueMode?: "none" | "character_dialogue";
};

export function validateMarketplaceReviewIdeaOutput(
  value: unknown,
  options: MarketplaceReviewIdeaValidationOptions = {}
): MarketplaceReviewIdeaOutput {
  const output = marketplaceReviewIdeaOutputSchema.parse(value);
  const ids = new Set(output.ideas.map(idea => idea.ideaId));
  if (ids.size !== 3)
    throw new Error("MARKETPLACE_REVIEW_OUTPUT_INVALID: duplicate idea ids");
  const dialogueMode = options.dialogueMode ?? "character_dialogue";
  if (
    dialogueMode === "none" &&
    output.ideas.some(
      idea => idea.dialogue.length > 0 || idea.dialogueScript.trim().length > 0
    )
  ) {
    throw new Error(
      "MARKETPLACE_REVIEW_OUTPUT_INVALID: No-dialogue ideas must not contain spoken lines"
    );
  }
  if (
    output.ideas.some(idea =>
      idea.episodeStory.trim().length < 280 ||
      idea.episodeStory.trim().split(/\n\s*\n/).filter(Boolean).length < 3 ||
      (dialogueMode === "character_dialogue" &&
        (idea.dialogue.length < 1 ||
          idea.dialogueScript.trim().length < 60 ||
          idea.dialogueScript
            .split(/\r?\n/)
            .filter(line => /^[^:\n]{1,80}:\s*\S+/.test(line.trim())).length < 2))
    )
  ) {
    throw new Error(
      "MARKETPLACE_REVIEW_OUTPUT_INVALID: episode story or dialogue script is not usable"
    );
  }
  const allowedCharacterIds = new Set(
    (options.allowedCharacterIds ?? []).map(id => String(id).trim())
  );
  if (
    allowedCharacterIds.size > 0 &&
    output.ideas.some(idea =>
      idea.lookSlotRequests.some(request => !allowedCharacterIds.has(request.characterId))
    )
  ) {
    throw new Error(
      "MARKETPLACE_REVIEW_OUTPUT_INVALID: look slot requested for an unselected character"
    );
  }
  const allowedCharacterNames = new Set(
    (options.allowedCharacterNames ?? [])
      .map(name => name.trim().toLocaleLowerCase())
      .filter(Boolean)
  );
  if (
    allowedCharacterNames.size > 0 &&
    output.ideas.some(idea =>
      idea.dialogue.some(
        line => !allowedCharacterNames.has(line.speaker.trim().toLocaleLowerCase())
      )
    )
  ) {
    throw new Error(
      "MARKETPLACE_REVIEW_OUTPUT_INVALID: dialogue speaker is not selected"
    );
  }
  const rendered = JSON.stringify(
    output.ideas.map(idea => ({
      title: idea.title,
      logline: idea.logline,
      episodeStory: idea.episodeStory,
      dialogueScript: idea.dialogueScript,
      storyFunction: idea.storyFunction,
      scene: idea.scene,
      productMentionReason: idea.productMentionReason,
      dialogue: idea.dialogue,
      actions: idea.actions,
      benefitsMentioned: idea.benefitsMentioned,
      continuity: idea.continuity,
      lookSlotRequests: idea.lookSlotRequests,
      sceneSlotRequests: idea.sceneSlotRequests,
    }))
  ).toLowerCase();
  const excludedCharacterName = (options.excludedCharacterNames ?? []).find(name => {
    const normalizedName = name.trim().toLocaleLowerCase();
    return normalizedName.length >= 2 && rendered.includes(normalizedName);
  });
  if (excludedCharacterName) {
    throw new Error(
      `MARKETPLACE_REVIEW_OUTPUT_INVALID: unselected character "${excludedCharacterName}" was used`
    );
  }
  if (
    /\b(?:guaranteed|cures?|miracle|best in the world)\b|รักษาได้ทุกอย่าง|ไม่มีผลข้างเคียง|ดีที่สุด/.test(
      rendered
    )
  ) {
    throw new Error(
      "MARKETPLACE_REVIEW_OUTPUT_INVALID: unsupported product claim"
    );
  }
  return output;
}

function buildUserPrompt(input: MarketplaceReviewIdeaInput): string {
  return JSON.stringify({
    task: "สร้างไอเดีย 3 ใบสำหรับตอนซีรีย์ tie-in สินค้าแบบเนียนเป็นละคร ไม่ใช่รีวิวตรง ๆ",
    outputContract: MARKETPLACE_REVIEW_IDEA_OUTPUT_CONTRACT,
    outputShape: {
      schemaVersion: 1,
      ideas: [
        {
          ideaId: "unique-card-id",
          title: "ชื่อไอเดีย",
          logline: "ประโยคสรุปเหตุการณ์",
          episodeStory: "เรื่องละครภาษาไทยแบบร้อยแก้วต่อเนื่องอย่างน้อย 3 ย่อหน้า ตั้งแต่เริ่มปัญหาจนจบฉาก",
          dialogueScript: "พิมพ์ชนก: (ก้มเก็บของเล่น) เราต้องค่อย ๆ ดูกันว่าชิ้นไหนเหมาะกับภูมิ\nลุงชาญ: ลองชิ้นนี้ดูไหม",
          storyFunction: "หน้าที่ของฉากในเรื่อง",
          scene: {
            location: "สถานที่",
            time: "ช่วงเวลา",
            atmosphere: "บรรยากาศ",
            beats: ["จังหวะที่ 1", "จังหวะที่ 2"],
          },
          productMentionReason: "เหตุผลที่ตัวละครพูดถึงสินค้าในเหตุการณ์นี้",
          dialogue: [{ speaker: "ชื่อตัวละคร", line: "บทสนทนา", delivery: "น้ำเสียง" }],
          actions: ["ท่าทางหรือการกระทำ"],
          benefitsMentioned: ["ข้อดีที่มีหลักฐานรองรับ"],
          claimsGuard: { allowed: ["คำกล่าวที่พูดได้"], prohibited: ["คำกล่าวห้ามใช้"], notes: ["ข้อควรระวัง"] },
          continuity: { dnaKept: ["DNA ที่คงไว้"], relationshipBeat: "พัฒนาความสัมพันธ์", toneFit: "ความกลมกลืนกับโทนเรื่อง" },
          lookSlotRequests: [],
          sceneSlotRequests: [],
        },
      ],
    },
    contract: {
      outputCount: 3,
      eachIdeaMustBeDifferent: true,
      preserveDna: true,
      addOnlyMissingLookOrSceneSlots: true,
      noUnsupportedClaims: true,
    },
    input,
  });
}

export type MarketplaceReviewIdeaActor = { tenantId: string; userId: number };

type MarketplaceReviewIdeaModel = {
  modelId: string;
  label: string;
  provider: string;
  isRecommended: boolean;
  isDefault: boolean;
};

async function getMarketplaceReviewLlmRows() {
  const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
  return rows.filter(
    row => isAvailable(row.providerId) && row.supportsStructuredOutputs === true
  );
}

async function resolveMarketplaceReviewLlmModel(
  requestedModelId?: string,
): Promise<string> {
  const rows = await getMarketplaceReviewLlmRows();
  const recommendedRows = rows.filter(row => row.isRecommended === true);
  const allowedRows = recommendedRows.length > 0 ? recommendedRows : rows;

  if (requestedModelId) {
    const selected = allowedRows.find(row => row.modelId === requestedModelId);
    if (!selected) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "LLM model is not available in the admin-recommended set for Marketplace tie-in ideas",
      });
    }
    return selected.modelId;
  }

  const automatic = selectBestLlmModel(
    {
      supportsStructuredOutputs: true,
      recommendedOnly: recommendedRows.length > 0,
    },
    rows,
  );
  return automatic ?? (await resolveStoryBibleModel());
}

export async function listMarketplaceReviewIdeaModels(): Promise<{
  defaultModelId: string | null;
  models: MarketplaceReviewIdeaModel[];
}> {
  const rows = await getMarketplaceReviewLlmRows();
  const recommendedRows = rows.filter(row => row.isRecommended === true);
  const allowedRows = recommendedRows.length > 0 ? recommendedRows : rows;
  const defaultModelId = allowedRows.length
    ? selectBestLlmModel(
        {
          supportsStructuredOutputs: true,
          recommendedOnly: recommendedRows.length > 0,
        },
        rows,
      )
    : null;

  return {
    defaultModelId,
    models: allowedRows.map(row => ({
      modelId: row.modelId,
      label: row.modelId,
      provider: row.providerName,
      isRecommended: row.isRecommended === true,
      isDefault: row.modelId === defaultModelId,
    })),
  };
}

export async function buildMarketplaceReviewIdeaInput(input: {
  actor: MarketplaceReviewIdeaActor;
  seriesId: number;
  productId: string;
  referenceImages: Array<{
    mediaAssetId: string;
    imageId?: string;
    label?: string;
  }>;
  customerJourney?: unknown;
  footageGuide?: unknown;
  direction?: string;
  llmModelId?: string;
  dialogueMode: "none" | "character_dialogue";
  selectedCharacterIds: string[];
  variationSeed: string;
}): Promise<MarketplaceReviewIdeaInput> {
  const [series] = await db
    .select({
      id: verticalDramaSeries.id,
      title: verticalDramaSeries.title,
      genre: verticalDramaSeries.genre,
      tone: verticalDramaSeries.tone,
      bible: verticalDramaSeries.bible,
    })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, input.seriesId),
        eq(verticalDramaSeries.tenantId, input.actor.tenantId),
        eq(verticalDramaSeries.userId, input.actor.userId)
      )
    )
    .limit(1);
  if (!series)
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });

  const bundle = await getMarketplaceProductWithAccess(
    input.productId,
    input.actor
  );
  const imageIds = input.referenceImages.map(image => image.mediaAssetId);
  const assets: Array<{
    id: number;
    originalUrl: string | null;
    status: string;
    mimeType: string;
  }> = await db
    .select({
      id: mediaAssets.id,
      originalUrl: mediaAssets.originalUrl,
      status: mediaAssets.status,
      mimeType: mediaAssets.mimeType,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, input.actor.tenantId),
        eq(mediaAssets.userId, input.actor.userId),
        inArray(mediaAssets.id, imageIds.map(Number))
      )
    );
  const assetsById = new Map(assets.map(asset => [String(asset.id), asset]));
  if (
    assets.length !== new Set(imageIds).size ||
    input.referenceImages.some(image => {
      const asset = assetsById.get(image.mediaAssetId);
      return (
        !asset ||
        asset.status !== "ready" ||
        !asset.originalUrl ||
        !asset.mimeType.toLowerCase().startsWith("image/")
      );
    })
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "One or more Marketplace reference images are not ready managed media",
    });
  }

  const selectedCharacterIds = Array.from(
    new Set(input.selectedCharacterIds.map(value => String(value).trim()))
  );
  const selectedNumericCharacterIds = selectedCharacterIds.map(Number);
  if (
    selectedCharacterIds.length < 1 ||
    selectedCharacterIds.length > 4 ||
    selectedNumericCharacterIds.some(
      id => !Number.isInteger(id) || id <= 0
    )
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selected characters are invalid",
    });
  }

  const characters: Array<{
    id: number;
    name: string;
    role: string | null;
    narrativeRole: string | null;
    data: unknown;
  }> = await db
    .select({
      id: verticalDramaCharacters.id,
      name: verticalDramaCharacters.name,
      role: verticalDramaCharacters.role,
      narrativeRole: verticalDramaCharacters.narrativeRole,
      data: verticalDramaCharacters.data,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, input.actor.tenantId),
        eq(verticalDramaCharacters.userId, input.actor.userId),
        eq(verticalDramaCharacters.seriesId, input.seriesId),
        inArray(verticalDramaCharacters.id, selectedNumericCharacterIds)
      )
    );
  const charactersById = new Map(
    characters.map(character => [String(character.id), character])
  );
  const selectedCharacters = selectedCharacterIds.map(id => charactersById.get(id));
  if (selectedCharacters.some(character => !character)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more selected characters were not found in this series",
    });
  }
  const selectedCharacterNames = new Set(
    selectedCharacters
      .filter((character): character is NonNullable<typeof character> => Boolean(character))
      .map(character => character.name)
  );
  const allCharacterNames: Array<{ name: string }> = await db
    .select({ name: verticalDramaCharacters.name })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, input.actor.tenantId),
        eq(verticalDramaCharacters.userId, input.actor.userId),
        eq(verticalDramaCharacters.seriesId, input.seriesId)
      )
    );
  const excludedCharacterNames = Array.from(
    new Set(
      allCharacterNames
        .map(character => character.name)
        .filter(name => !selectedCharacterNames.has(name))
    )
  );
  const bible = (series.bible as Record<string, unknown> | null) ?? {};
  const product = bundle.product as Record<string, unknown>;
  const descriptionJson =
    (product.descriptionJson as Record<string, unknown> | null) ?? {};
  const specsJson = (product.specsJson as Record<string, unknown> | null) ?? {};
  const platformRawJson =
    (product.platformRawJson as Record<string, unknown> | null) ?? {};
  const seriesContinuity = safeJson(
    {
      visualStyle: bible.visualStyle,
      cameraGrammar: bible.cameraGrammar,
      storyControlSeed: bible.storyControlSeed,
    },
    6000
  );

  return marketplaceReviewIdeaInputSchema.parse({
    schemaVersion: 1,
    product: {
      productId: input.productId,
      name: String(product.productName ?? input.productId),
      brand: bounded(product.brand, 255),
      category: bounded(
        product.productCategory ??
          descriptionJson.categoryText ??
          specsJson.categoryText,
        255
      ),
      description: bounded(
        product.descriptionText ??
          descriptionJson.rawText ??
          product.description,
        8000
      ),
      specs: safeJson({ specs: specsJson, source: platformRawJson }, 6000),
      customerJourney:
        input.customerJourney ??
        safeJson(
          { description: descriptionJson, platform: platformRawJson },
          6000
        ),
      sourceClaims: [
        ...(Array.isArray(descriptionJson.claims)
          ? descriptionJson.claims
          : []),
        ...(Array.isArray(descriptionJson.keySellingPoints)
          ? descriptionJson.keySellingPoints
          : []),
      ]
        .filter((claim): claim is string => typeof claim === "string")
        .slice(0, 40),
    },
    productImages: input.referenceImages.map(image => ({
      mediaAssetId: image.mediaAssetId,
      imageId: image.imageId,
      url: assetsById.get(image.mediaAssetId)!.originalUrl!,
      label: image.label,
    })),
    series: {
      seriesId: String(series.id),
      title: series.title ?? undefined,
      genre: series.genre ?? undefined,
      tone: series.tone ?? undefined,
      continuity:
        typeof seriesContinuity === "string"
          ? seriesContinuity
          : JSON.stringify(seriesContinuity),
    },
    dialogueMode: input.dialogueMode,
    selectedCharacterIds,
    excludedCharacterNames,
    characters: selectedCharacters.map(character => {
      if (!character) throw new Error("Selected character disappeared during lookup");
      const data = (character.data as Record<string, unknown> | null) ?? {};
      const looks = Array.isArray(data.looks)
        ? data.looks
        : Array.isArray(data.wardrobeRules)
          ? data.wardrobeRules
          : [];
      const dna = safeJson(data, 5000);
      return {
        characterId: String(character.id),
        name: character.name,
        role: character.narrativeRole ?? character.role ?? undefined,
        dna:
          dna && typeof dna === "object" && !Array.isArray(dna)
            ? (dna as Record<string, unknown>)
            : undefined,
        relationships: Array.isArray(data.relationships)
          ? data.relationships
              .filter((item): item is string => typeof item === "string")
              .slice(0, 20)
          : [],
        availableLooks: looks
          .filter((item): item is string => typeof item === "string")
          .slice(0, 30),
      };
    }),
    customerJourney: input.customerJourney,
    footageGuide: input.footageGuide,
    direction: input.direction,
    llmModelId: input.llmModelId,
    variationSeed: input.variationSeed,
  });
}

export async function generateMarketplaceReviewIdeas(input: {
  actor: MarketplaceReviewIdeaActor;
  seriesId: number;
  request: MarketplaceReviewIdeaInput;
  execute?: (params: {
    systemPrompt: string;
    userPrompt: string;
    model: string;
  }) => Promise<unknown>;
}) {
  const parsed = marketplaceReviewIdeaInputSchema.parse(input.request);
  const model = await resolveMarketplaceReviewLlmModel(parsed.llmModelId);
  const systemPrompt = await loadSkillText();
  const planningResult = input.execute
    ? null
    : await executeJsonPlanningCallWithRetry({
        model,
        systemPrompt,
        userPrompt: buildUserPrompt(parsed),
        temperature: 0.75,
        userId: input.actor.userId,
        maxTokens: 12_000,
        modelFallbackPolicy: "recommended",
        modelFallbackOnSchema: true,
        modelFallbackMaxAttempts: 1,
        label: "vertical drama marketplace review story planner",
        schema: marketplaceReviewIdeaLlmOutputSchema(parsed.dialogueMode),
        extraBodyParams: {
          response_format: MARKETPLACE_REVIEW_IDEA_RESPONSE_FORMAT,
        },
        schemaRetryContract: MARKETPLACE_REVIEW_IDEA_OUTPUT_CONTRACT,
      });
  const rawOutput = input.execute
    ? await input.execute({
        systemPrompt,
        userPrompt: buildUserPrompt(parsed),
        model,
      })
    : planningResult!.data;
  const output = validateMarketplaceReviewIdeaOutput(rawOutput, {
    allowedCharacterIds: parsed.selectedCharacterIds,
    allowedCharacterNames: parsed.characters.map(character => character.name),
    excludedCharacterNames: parsed.excludedCharacterNames,
    dialogueMode: parsed.dialogueMode,
  });

  // This is a user-visible skill entry point. Charge once after a successful,
  // schema-valid response; the fixed skill settlement makes duplicate runs
  // idempotent and exposes the usage in Credits.
  let billingRunId: string | null = null;
  let billingAmount = 0;
  if (planningResult) {
    const usage = planningResult.response?.usage;
    const effectiveModel = planningResult.model;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const skillRunId = `vd-marketplace-review:${input.actor.tenantId}:${input.seriesId}:${parsed.product.productId}:${parsed.variationSeed}`;
    billingRunId = skillRunId;
    billingAmount = calculateCreditsForLLM(
      inputTokens,
      outputTokens,
      effectiveModel
    );
    await deductCredits({
      userId: input.actor.userId,
      tenantId: input.actor.tenantId,
      amount: billingAmount,
      description: `Vertical Drama — Marketplace tie-in ideas (series #${input.seriesId})`,
      idempotencyKey: skillRunId,
      skillRunId,
      skillSlug: SKILL_SLUG,
      sourceType: "skill",
      metadata: {
        feature: "vertical_drama_marketplace_review_ideas",
        model: effectiveModel,
        llmModel: effectiveModel,
        inputTokens,
        outputTokens,
        seriesId: input.seriesId,
        productId: parsed.product.productId,
        variationSeed: parsed.variationSeed,
      },
    });
  }
  const inputFingerprint = fingerprint(parsed);
  let run:
    | { id: number; createdAt: Date }
    | undefined;
  try {
    const [insertedRun] = await db
      .insert(verticalDramaMarketplaceReviewIdeaRuns)
      .values({
        tenantId: input.actor.tenantId,
        userId: input.actor.userId,
        seriesId: input.seriesId,
        productId: parsed.product.productId,
        variationSeed: parsed.variationSeed,
        inputFingerprint,
        status: "succeeded",
        input: parsed,
        output,
      })
      .returning({
        id: verticalDramaMarketplaceReviewIdeaRuns.id,
        createdAt: verticalDramaMarketplaceReviewIdeaRuns.createdAt,
      });
    run = insertedRun;
  } catch (error) {
    if (billingRunId) {
      await refundCredits({
        userId: input.actor.userId,
        tenantId: input.actor.tenantId,
        amount: billingAmount,
        description: `Refund failed Marketplace tie-in idea persistence (series #${input.seriesId})`,
        skillRunId: billingRunId,
        skillSlug: SKILL_SLUG,
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_marketplace_review_ideas",
          seriesId: input.seriesId,
          productId: parsed.product.productId,
          variationSeed: parsed.variationSeed,
          reason: "idea_run_persistence_failed",
        },
      });
    }
    throw error;
  }
  if (!run) throw new Error("MARKETPLACE_REVIEW_RUN_NOT_CREATED");
  return {
    runId: String(run.id),
    createdAt: run.createdAt.toISOString(),
    ...output,
  };
}

export async function listMarketplaceReviewIdeaRuns(input: {
  actor: MarketplaceReviewIdeaActor;
  seriesId: number;
  productId?: string;
}) {
  const rows: Array<{
    id: number;
    productId: string;
    variationSeed: string;
    output: unknown;
    input: unknown;
    selectedIdeaId: string | null;
    createdAt: Date;
  }> = await db
    .select({
      id: verticalDramaMarketplaceReviewIdeaRuns.id,
      productId: verticalDramaMarketplaceReviewIdeaRuns.productId,
      variationSeed: verticalDramaMarketplaceReviewIdeaRuns.variationSeed,
      output: verticalDramaMarketplaceReviewIdeaRuns.output,
      input: verticalDramaMarketplaceReviewIdeaRuns.input,
      selectedIdeaId: verticalDramaMarketplaceReviewIdeaRuns.selectedIdeaId,
      createdAt: verticalDramaMarketplaceReviewIdeaRuns.createdAt,
    })
    .from(verticalDramaMarketplaceReviewIdeaRuns)
    .where(
      and(
        eq(
          verticalDramaMarketplaceReviewIdeaRuns.tenantId,
          input.actor.tenantId
        ),
        eq(verticalDramaMarketplaceReviewIdeaRuns.userId, input.actor.userId),
        eq(verticalDramaMarketplaceReviewIdeaRuns.seriesId, input.seriesId),
        input.productId
          ? eq(
              verticalDramaMarketplaceReviewIdeaRuns.productId,
              input.productId
            )
          : undefined
      )
    )
    .orderBy(desc(verticalDramaMarketplaceReviewIdeaRuns.createdAt))
    .limit(20);
  return rows
    .filter(row => {
      const storedInput = row.input as Record<string, unknown> | null;
      const selectedCharacterIds = storedInput?.selectedCharacterIds;
      return Array.isArray(selectedCharacterIds) && selectedCharacterIds.length > 0;
    })
    .map(row => ({
      id: String(row.id),
      productId: row.productId,
      variationSeed: row.variationSeed,
      selectedIdeaId: row.selectedIdeaId,
      createdAt: row.createdAt.toISOString(),
      ...normalizePersistedOutput(row.output),
    }));
}

export async function selectMarketplaceReviewIdea(input: {
  actor: MarketplaceReviewIdeaActor;
  seriesId: number;
  runId: number;
  ideaId: string;
  selectedCharacterIds?: string[];
}) {
  const [row] = await db
    .select()
    .from(verticalDramaMarketplaceReviewIdeaRuns)
    .where(
      and(
        eq(verticalDramaMarketplaceReviewIdeaRuns.id, input.runId),
        eq(
          verticalDramaMarketplaceReviewIdeaRuns.tenantId,
          input.actor.tenantId
        ),
        eq(verticalDramaMarketplaceReviewIdeaRuns.userId, input.actor.userId),
        eq(verticalDramaMarketplaceReviewIdeaRuns.seriesId, input.seriesId)
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Idea run not found" });
  if (input.selectedCharacterIds) {
    const storedInput = row.input as Record<string, unknown> | null;
    const storedIds = Array.isArray(storedInput?.selectedCharacterIds)
      ? storedInput.selectedCharacterIds.map(value => String(value).trim()).sort()
      : [];
    const currentIds = Array.from(new Set(input.selectedCharacterIds.map(value => String(value).trim()))).sort();
    if (storedIds.length !== currentIds.length || storedIds.some((value, index) => value !== currentIds[index])) {
      throw new TRPCError({ code: "CONFLICT", message: "This idea was generated for a different character selection; generate a new idea for the selected characters" });
    }
  }
  const output = normalizePersistedOutput(row.output);
  const idea = output.ideas.find(
    candidate => candidate.ideaId === input.ideaId
  );
  if (!idea)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Idea is not part of this run",
    });
  await db
    .update(verticalDramaMarketplaceReviewIdeaRuns)
    .set({ selectedIdeaId: input.ideaId, updatedAt: new Date() })
    .where(eq(verticalDramaMarketplaceReviewIdeaRuns.id, input.runId));
  const slotResults = {
    looks: [] as Array<{
      characterId: string;
      label: string;
      status: "pending";
    }>,
    scenes: [] as Array<{
      locationId: string;
      label: string;
      locationKey: string;
      status: "pending";
      reused?: boolean;
    }>,
    sceneSuggestions: [] as Array<{
      sceneLabel: string;
      description: string;
      candidates: Array<{
        locationId: string;
        locationKey: string;
        name: string;
        score: number;
      }>;
    }>,
  };
  for (const request of idea.lookSlotRequests) {
    const [parent] = await db
      .select({
        id: verticalDramaCharacters.id,
        characterKey: verticalDramaCharacters.characterKey,
        name: verticalDramaCharacters.name,
        role: verticalDramaCharacters.role,
        narrativeRole: verticalDramaCharacters.narrativeRole,
        roleTier: verticalDramaCharacters.roleTier,
        occupation: verticalDramaCharacters.occupation,
        roleVisualIntent: verticalDramaCharacters.roleVisualIntent,
        roleProvenance: verticalDramaCharacters.roleProvenance,
        roleReviewStatus: verticalDramaCharacters.roleReviewStatus,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.id, Number(request.characterId)),
          eq(verticalDramaCharacters.tenantId, input.actor.tenantId),
          eq(verticalDramaCharacters.userId, input.actor.userId),
          eq(verticalDramaCharacters.seriesId, input.seriesId)
        )
      )
      .limit(1);
    if (!parent) continue;
    const existing = await db
      .select({ id: verticalDramaCharacters.id })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.parentCharacterId, parent.id),
          eq(verticalDramaCharacters.tenantId, input.actor.tenantId),
          eq(verticalDramaCharacters.userId, input.actor.userId),
          eq(verticalDramaCharacters.variantLabel, request.lookLabel),
          eq(verticalDramaCharacters.variantType, "outfit"),
          eq(verticalDramaCharacters.seriesId, input.seriesId)
        )
      )
      .limit(1);
    let variantId = existing[0]?.id;
    if (!variantId) {
      const suffix = crypto
        .createHash("sha256")
        .update(`${input.runId}:${request.characterId}:${request.lookLabel}`)
        .digest("hex")
        .slice(0, 10);
      const [variant] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId: input.actor.tenantId,
          userId: input.actor.userId,
          seriesId: input.seriesId,
          characterKey: `${parent.characterKey}-tie-${suffix}`.slice(0, 64),
          name: parent.name,
          role: parent.role,
          narrativeRole: parent.narrativeRole,
          roleTier: parent.roleTier,
          occupation: parent.occupation,
          roleVisualIntent: parent.roleVisualIntent,
          roleProvenance: parent.roleProvenance,
          roleReviewStatus: parent.roleReviewStatus,
          parentCharacterId: parent.id,
          variantLabel: request.lookLabel,
          variantType: "outfit",
          data: {
            description: request.lookLabel,
            wardrobeRules: [request.lookLabel],
            slotStatus: "pending",
            slotReason: request.reason,
            dnaConstraints: request.dnaConstraints,
            source: "marketplace_review_idea",
          },
        })
        .returning({ id: verticalDramaCharacters.id });
      variantId = variant?.id;
    }
    if (variantId)
      slotResults.looks.push({
        characterId: String(variantId),
        label: request.lookLabel,
        status: "pending",
      });
  }
  // The scene is required even when the model correctly reports no *new*
  // scene slot request: a product tie-in still needs a normal background
  // location before its start-frame prompt can resolve a reference image.
  const primarySceneRequest = {
    sceneLabel: idea.scene.location,
    description: [
      `สถานที่: ${idea.scene.location}`,
      idea.scene.time ? `เวลา: ${idea.scene.time}` : null,
      `บรรยากาศ: ${idea.scene.atmosphere}`,
      ...idea.scene.beats.map((beat, index) => `จังหวะฉาก ${index + 1}: ${beat}`),
    ]
      .filter((part): part is string => Boolean(part))
      .join("; "),
    reason: "ฉากพื้นหลังหลักของเรื่อง Tie-in",
  };
  const sceneRequests = [...idea.sceneSlotRequests];
  if (
    primarySceneRequest.sceneLabel.trim() &&
    !sceneRequests.some(
      request =>
        request.sceneLabel.trim().toLocaleLowerCase() ===
        primarySceneRequest.sceneLabel.trim().toLocaleLowerCase()
    )
  ) {
    sceneRequests.push(primarySceneRequest);
  }
  const seenSceneLabels = new Set<string>();
  for (const request of sceneRequests) {
    if (!request.sceneLabel.trim()) continue;
    const normalizedLabel = request.sceneLabel.trim().toLocaleLowerCase();
    if (seenSceneLabels.has(normalizedLabel)) continue;
    seenSceneLabels.add(normalizedLabel);
    const matches = await findSpecialStorySceneMatches({
      actor: input.actor,
      seriesId: input.seriesId,
      label: request.sceneLabel,
    });
    if (matches.exact) {
      slotResults.scenes.push({
        locationId: String(matches.exact.id),
        locationKey: matches.exact.locationKey,
        label: request.sceneLabel,
        status: "pending",
        reused: true,
      });
      continue;
    }
    if (matches.similar.length > 0) {
      slotResults.sceneSuggestions.push({
        sceneLabel: request.sceneLabel,
        description: request.description,
        candidates: matches.similar.map(candidate => ({
          locationId: String(candidate.locationId),
          locationKey: candidate.locationKey,
          name: candidate.name,
          score: candidate.score,
        })),
      });
      continue;
    }
    const location = await reconcileSpecialStorySceneSlot({
      actor: input.actor,
      seriesId: input.seriesId,
      label: request.sceneLabel,
      description: request.description,
      metadata: {
        source: "marketplace_review_idea",
        slotReason: request.reason,
      },
    });
    slotResults.scenes.push({
      locationId: String(location.locationId),
      locationKey: location.locationKey,
      label: request.sceneLabel,
      status: "pending",
    });
  }
  return { idea, runId: String(row.id), slotRequests: slotResults };
}

export async function resolveMarketplaceReviewScene(input: {
  actor: MarketplaceReviewIdeaActor;
  seriesId: number;
  decision: "reuse" | "create";
  locationId?: number;
  sceneLabel: string;
  description: string;
}) {
  return resolveSpecialStorySceneSlotDecision({
    actor: input.actor,
    seriesId: input.seriesId,
    decision: input.decision,
    locationId: input.locationId,
    label: input.sceneLabel,
    description: input.description,
  });
}
