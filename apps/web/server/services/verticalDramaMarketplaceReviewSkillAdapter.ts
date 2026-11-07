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
  resolveSpecialDialogueSpeakerEligibility,
  screenSpecialDialogueCompliance,
} from "../../shared/verticalDramaSeries/advertisingDialoguePolicy";
import {
  findSpecialStorySceneMatches,
  resolveSpecialStorySceneSlotDecision,
} from "./verticalDramaSpecialReferences";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import { isAvailable } from "./providerHealth";
import type { VerticalDramaInteractiveJobPayload } from "./verticalDramaInteractiveJobs";
import {
  marketplaceReviewIdeaInputSchema,
  marketplaceReviewIdeaSchema,
  marketplaceReviewIdeaOutputSchema,
  type MarketplaceReviewIdeaInput,
  type MarketplaceReviewIdeaOutput,
} from "../../shared/marketplaceReviewIdeas/contracts";

const SKILL_SLUG = "vertical-drama-marketplace-review-story-planner";

const MARKETPLACE_REVIEW_IDEA_OUTPUT_CONTRACT =
  'Return exactly one complete JSON object with schemaVersion: 1 and exactly 3 items in ideas. Every idea must include these exact keys: ideaId, title, presentationStyle, storyStructure, logline, episodeStory, dialogueScript, dialogue, shotDialogues, storyFunction, scene, productMentionReason, actions, benefitsMentioned, claimsGuard, continuity, lookSlotRequests, sceneSlotRequests. episodeStory is the primary deliverable: write a coherent human-readable Thai review/story episode in at least 3 connected paragraphs with setup, an observation or character need, a review subject experience that follows the selected presentation style, and scene resolution; allow factual reviews and documentary-style stories, not only product tie-ins. Use input.reviewSubjectType and the written subject description, specifications, claims, and direction as source context when thinking up all 3 ideas. Let relevant details shape the story naturally without forcing exact wording or repeated mentions. Treat attached images as downstream visual references, including multiple angles of one product, object, restaurant, or place. This text-only idea planner receives image URLs and labels rather than image pixels, so do not claim visual observations from them; preserve all references for the later image-generation flow. Do not infer facts such as price, hours, services, software features, performance, or claims. If input.productSource is upload, treat input.product.description and input.direction as the user-provided review-subject brief and story direction; if either is empty, keep the idea general to the selected review-subject type and avoid unsupported factual claims because this text-only planner cannot inspect image pixels. Do not invent brand, specifications, benefits, features, services, safety, efficacy, or claims. If input.footageGuide is present, keep the story compatible with its transcript, scene ranges, speech/silence ranges, and semanticGuide; do not invent actions or spoken content that contradicts known footage evidence, and explicitly keep uncertain facts conservative. Follow input.dialogueMode exactly: when it is character_dialogue, return exactly 9 ordered shotDialogues entries, each with 2 short natural named dialogue lines suitable for one video shot; let dialogue refer to relevant review-subject details when supported and when they fit what a character sees, does, or needs; other shots should advance the story naturally and need not mention the subject. Do not force exact wording or repeat mentions across shots. The dialogue array is only a summary of up to 12 representative lines; shotDialogues is the authoritative full 9-shot script. Do not duplicate all 18-27 shot lines into dialogue. When dialogueMode is none, return 9 ordered shotDialogues entries with empty lines and no spoken text. Keep every speaker 18+; selected children may appear visually but must never speak. Never use medical, cure, treatment, prevention, guaranteed, absolute, miracle, best, or 100% claims. A direct_product_pitch may describe and recommend the selected review subject clearly but must stay factual, modest, and non-pressuring. Keep references evidence-based and match the selected presentation style; natural tie-ins should remain modest while direct pitches may use clear subject-focused dialogue. scene must include location, atmosphere, and at least 2 beats. Each dialogue item must include speaker and line. claimsGuard must include allowed, prohibited, and notes. continuity must include dnaKept, relationshipBeat, and toneFit. Use only the characters in the selectedCharacterIds/characters input. Never introduce, name, or give dialogue to an excluded or dialogue-prohibited character. Every dialogue speaker must be one of the selected adult speaker names, and every lookSlotRequests.characterId must be one of the selectedCharacterIds. Return all arrays even when empty. Never rename keys, omit required keys, return null for an object, return shot prompts, or return markdown/prose outside the JSON object.';

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
              presentationStyle: {
                type: "string",
                enum: [
                  "story_tie_in",
                  "direct_product_pitch",
                  "unboxing",
                  "feature_explainer",
                  "problem_solution",
                  "experience_review",
                  "documentary",
                ],
              },
              storyStructure: {
                type: "string",
                enum: [
                  "three_act",
                  "problem_solution",
                  "aida",
                  "before_after_bridge",
                  "hero_journey",
                ],
              },
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
              shotDialogues: {
                type: "array",
                minItems: 9,
                maxItems: 9,
                items: {
                  type: "object",
                  properties: {
                    shotNumber: { type: "integer", minimum: 1, maximum: 9 },
                    lines: {
                      type: "array",
                      minItems: 0,
                      maxItems: 3,
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
                  },
                  required: ["shotNumber", "lines"],
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
              "presentationStyle",
              "storyStructure",
              "logline",
              "episodeStory",
              "dialogueScript",
              "storyFunction",
              "scene",
              "productMentionReason",
              "dialogue",
              "shotDialogues",
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
function normalizeGeneratedDialogueSummary(
  value: unknown,
  dialogueMode: "none" | "character_dialogue",
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.ideas)) return value;
  return {
    ...record,
    ideas: record.ideas.map(candidate => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return candidate;
      }
      const idea = candidate as Record<string, unknown>;
      if (dialogueMode === "none" && idea.dialogue === undefined) {
        return { ...idea, dialogue: [] };
      }
      if (dialogueMode !== "character_dialogue") return idea;
      const supplied = Array.isArray(idea.dialogue) ? idea.dialogue : [];
      if (supplied.length > 0 && supplied.length <= 12) return idea;
      const shotLines = Array.isArray(idea.shotDialogues)
        ? idea.shotDialogues.flatMap(shot => {
            if (!shot || typeof shot !== "object" || Array.isArray(shot)) return [];
            const lines = (shot as Record<string, unknown>).lines;
            return Array.isArray(lines) ? lines : [];
          })
        : [];
      return {
        ...idea,
        dialogue: (supplied.length > 12 ? supplied : shotLines).slice(0, 12),
      };
    }),
  };
}

function marketplaceReviewIdeaLlmOutputSchema(
  dialogueMode: "none" | "character_dialogue"
) {
  return z.preprocess(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const record = normalizeGeneratedDialogueSummary(value, dialogueMode) as Record<string, unknown>;
    return record.schemaVersion === "1.0"
      ? { ...record, schemaVersion: 1 }
      : record;
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
        if (
          idea.shotDialogues.length !== 9 ||
          idea.shotDialogues.some(
            (shot, shotIndex) =>
              shot.shotNumber !== shotIndex + 1 ||
              shot.lines.length < 2 ||
              shot.lines.length > 3
          )
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["ideas", index, "shotDialogues"],
            message: "character_dialogue ideas must contain 2-3 lines for each of 9 ordered shots",
          });
        }
      } else if (idea.dialogue.length > 0 || idea.dialogueScript.trim().length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ideas", index, "dialogue"],
          message: "No-dialogue ideas must not contain spoken lines",
        });
      }
      if (
        dialogueMode === "none" &&
        idea.shotDialogues.some(shot => shot.lines.length > 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ideas", index, "shotDialogues"],
          message: "No-dialogue ideas must contain empty shot dialogue entries",
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

export type MarketplaceReviewIdeaResumeSnapshot = {
  productSource: "marketplace_capture" | "upload";
  reviewSubjectType?: MarketplaceReviewIdeaInput["reviewSubjectType"];
  presentationStyle?: MarketplaceReviewIdeaInput["presentationStyle"];
  storyStructure?: MarketplaceReviewIdeaInput["storyStructure"];
  productBrief?: string;
  direction?: string;
  referenceImages: Array<{
    mediaAssetId: string;
    imageId?: string;
    url: string;
    label?: string;
  }>;
  selectedCharacterIds: string[];
  dialogueMode: "none" | "character_dialogue";
};

/**
 * Expose only the editor state needed to resume a persisted run. The full
 * generated input can contain product metadata and character DNA, so it must
 * stay server-side and owner-scoped.
 */
export function buildMarketplaceReviewIdeaResumeSnapshot(
  value: unknown,
): MarketplaceReviewIdeaResumeSnapshot | null {
  const parsed = marketplaceReviewIdeaInputSchema.safeParse(value);
  if (!parsed.success) return null;
  const input = parsed.data;
  const referenceImages = input.productImages
    .filter(image => Boolean(image.mediaAssetId))
    .map(image => ({
      mediaAssetId: image.mediaAssetId!,
      ...(image.imageId ? { imageId: image.imageId } : {}),
      url: image.url,
      ...(image.label ? { label: image.label } : {}),
    }));
  if (referenceImages.length === 0 || input.selectedCharacterIds.length === 0) {
    return null;
  }
  const rawInput = asRecord(value);
  return {
    productSource: input.productSource,
    ...(typeof rawInput.reviewSubjectType === "string"
      ? { reviewSubjectType: input.reviewSubjectType }
      : {}),
    ...(typeof rawInput.presentationStyle === "string"
      ? { presentationStyle: input.presentationStyle }
      : {}),
    ...(typeof rawInput.storyStructure === "string"
      ? { storyStructure: input.storyStructure }
      : {}),
    ...(input.productSource === "upload" && input.product.description
      ? { productBrief: input.product.description }
      : {}),
    ...(input.direction ? { direction: input.direction } : {}),
    referenceImages,
    selectedCharacterIds: input.selectedCharacterIds,
    dialogueMode: input.dialogueMode,
  };
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
  dialogueSpeakerCharacterNames?: readonly string[];
  dialogueProhibitedCharacterNames?: readonly string[];
  dialogueMode?: "none" | "character_dialogue";
};

export function validateMarketplaceReviewIdeaOutput(
  value: unknown,
  options: MarketplaceReviewIdeaValidationOptions = {}
): MarketplaceReviewIdeaOutput {
  const output = marketplaceReviewIdeaOutputSchema.parse(
    normalizeGeneratedDialogueSummary(value, options.dialogueMode ?? "character_dialogue")
  );
  const ids = new Set(output.ideas.map(idea => idea.ideaId));
  if (ids.size !== 3)
    throw new Error("MARKETPLACE_REVIEW_OUTPUT_INVALID: duplicate idea ids");
  const dialogueMode = options.dialogueMode ?? "character_dialogue";
  if (
    dialogueMode === "none" &&
    output.ideas.some(
      idea =>
        idea.dialogue.length > 0 ||
        idea.dialogueScript.trim().length > 0 ||
        idea.shotDialogues.some(shot => shot.lines.length > 0)
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
            .filter(line => /^[^:\n]{1,80}:\s*\S+/.test(line.trim())).length < 2 ||
          idea.shotDialogues.length !== 9 ||
          idea.shotDialogues.some(
            (shot, shotIndex) =>
              shot.shotNumber !== shotIndex + 1 ||
              shot.lines.length < 2 ||
              shot.lines.length > 3
          )))
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
      [...idea.dialogue, ...idea.shotDialogues.flatMap(shot => shot.lines)].some(
        line => !allowedCharacterNames.has(line.speaker.trim().toLocaleLowerCase())
      )
    )
  ) {
    throw new Error(
      "MARKETPLACE_REVIEW_OUTPUT_INVALID: dialogue speaker is not selected"
    );
  }
  const dialogueSpeakerNames = new Set(
    (options.dialogueSpeakerCharacterNames ?? [])
      .map(name => name.trim().toLocaleLowerCase())
      .filter(Boolean)
  );
  const dialogueProhibitedNames = new Set(
    (options.dialogueProhibitedCharacterNames ?? [])
      .map(name => name.trim().toLocaleLowerCase())
      .filter(Boolean)
  );
  const allIdeaLines = output.ideas.flatMap(idea => [
    ...idea.dialogue,
    ...idea.shotDialogues.flatMap(shot => shot.lines),
  ]);
  if (
    dialogueMode === "character_dialogue" &&
    dialogueSpeakerNames.size > 0 &&
    allIdeaLines.some(
      line => !dialogueSpeakerNames.has(line.speaker.trim().toLocaleLowerCase())
    )
  ) {
    throw new Error(
      "MARKETPLACE_REVIEW_OUTPUT_INVALID: only age-eligible adult characters may speak"
    );
  }
  if (
    dialogueProhibitedNames.size > 0 &&
    allIdeaLines.some(line =>
      dialogueProhibitedNames.has(line.speaker.trim().toLocaleLowerCase())
    )
  ) {
    throw new Error(
      "MARKETPLACE_REVIEW_OUTPUT_INVALID: a minor or age-unknown character was assigned advertising dialogue"
    );
  }
  const compliance = screenSpecialDialogueCompliance(
    allIdeaLines.map(line => line.line)
  );
  if (compliance.hasViolations) {
    throw new Error(`MARKETPLACE_REVIEW_OUTPUT_INVALID: advertising dialogue compliance failed (${compliance.violations.map(item => item.matchedPattern).join(", ")})`);
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
      shotDialogues: idea.shotDialogues,
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

export function removeMarketplacePriceReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeMarketplacePriceReferences);
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    return value
      .split(/(?<=[.!?。])\s+|\n+/)
      .filter(
        part =>
          !/(ราคา|price|฿|\$|€|£|¥|บาท|\bthb\b|\busd\b|ส่วนลด|discount|coupon|voucher|โปรโมชั่น|promotion|โปรโมชัน)/i.test(part)
      )
      .join(" ")
      .trim();
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(price|discount|coupon|voucher|promotion|promo)/i.test(key))
      .map(([key, item]) => [key, removeMarketplacePriceReferences(item)])
  );
}

function buildUserPrompt(
  input: MarketplaceReviewIdeaInput,
  repairFeedback?: string,
): string {
  const promptInput =
    input.productSource === "marketplace_capture"
      ? removeMarketplacePriceReferences(input)
      : input;
  return JSON.stringify({
    task: "สร้างไอเดียรีวิวหรือเล่าเรื่องแบบซีรีย์ 3 ใบ โดยแต่ละใบต้องระบุรูปแบบการนำเสนอและโครงสร้างเรื่องให้ตรงกับประเภทหัวข้อที่ผู้ใช้เลือก",
    reviewSubjectType: input.reviewSubjectType,
    reviewSubjectGuidance: {
      product:
        "รีวิวสินค้า ใช้ชื่อ แบรนด์ คุณสมบัติ ขนาด และข้อเท็จจริงจากข้อมูลเขียนหรือระเบียน Marketplace เท่านั้น",
      object:
        "รีวิววัตถุหรืออุปกรณ์ เน้นรูปลักษณ์ วัสดุ สัดส่วน และการใช้งานเท่าที่ผู้ใช้ระบุ ภาพหลายมุมเป็น reference สำหรับขั้นสร้างภาพภายหลัง ไม่ใช่ข้อเท็จจริงที่ planner นี้ตรวจเห็นได้",
      restaurant:
        "รีวิวร้านอาหาร ใช้คำบรรยายที่ผู้ใช้ให้เพื่อเล่าประสบการณ์ ภาพหลายมุมเป็น reference สำหรับขั้นสร้างภาพภายหลัง ห้ามเดาเมนู ราคา เวลาเปิดบริการ หรือบริการอื่นที่ไม่ได้ระบุ",
      place:
        "รีวิวสถานที่ ใช้คำบรรยายที่ผู้ใช้ให้เพื่อเล่าประสบการณ์ ภาพหลายมุมเป็น reference สำหรับขั้นสร้างภาพภายหลัง ห้ามแต่งสิ่งอำนวยความสะดวก การเดินทาง หรือข้อเท็จจริงที่ไม่มีข้อมูล",
      tourist_attraction:
        "รีวิวสถานที่ท่องเที่ยว ใช้คำบรรยายที่ผู้ใช้ให้เพื่อเล่าประสบการณ์ ภาพหลายมุมเป็น reference สำหรับขั้นสร้างภาพภายหลัง ห้ามเดาค่าเข้า เวลาเปิด หรือสิ่งอำนวยความสะดวก",
      documentary:
        "เล่าแนวสารคดีอย่างสังเกตการณ์ แยกข้อเท็จจริงที่ผู้ใช้ให้จากข้อสันนิษฐาน และไม่สร้างเหตุการณ์ ผู้เชี่ยวชาญ หรือบทสัมภาษณ์ขึ้นเอง",
      app:
        "รีวิวแอป ใช้คำบรรยายและข้อมูลหน้าจอที่ผู้ใช้ให้เท่านั้น ภาพหน้าจอจะส่งต่อเป็น visual reference สำหรับขั้นสร้างภาพและไม่ใช่หลักฐานที่ planner นี้ตรวจเห็นได้ ห้ามเดาฟังก์ชันหรือผลลัพธ์",
      software:
        "รีวิวโปรแกรม ใช้คำบรรยายและข้อมูลหน้าจอที่ผู้ใช้ให้ อธิบายเฉพาะขั้นตอนที่ยืนยันได้ ภาพจะส่งต่อเป็น visual reference สำหรับขั้นสร้างภาพ ห้ามสร้างความสามารถ ประสิทธิภาพ หรือความปลอดภัยขึ้นเอง",
      work_system:
        "รีวิวระบบงาน อธิบาย workflow จากข้อมูลที่ผู้ใช้ให้ ภาพหลายมุมจะส่งต่อเป็น visual reference สำหรับขั้นสร้างภาพ ห้ามกล่าวอ้าง KPI ความเร็ว การประหยัด หรือความปลอดภัยที่ไม่มีหลักฐาน",
    },
    visualReferenceRules:
      "ภาพอ้างอิงทั้งหมดอาจเป็นวัตถุเดียวกันจากหลายมุมหรือภาพหลายมุมของร้าน/สถานที่ ภาพเหล่านี้จะส่งต่อเป็น visual references ไปยังขั้นสร้างภาพ แต่คำขอวางแผนนี้ได้รับเฉพาะ URL/label ไม่ได้รับพิกเซลภาพ จึงห้ามอ้างรายละเอียดที่มองเห็นจากภาพ ใช้ประเภทหัวข้อและข้อความที่ผู้ใช้ให้เป็นข้อเท็จจริง และรักษาภาพทั้งหมดไว้เพื่อคุมอัตลักษณ์และความต่อเนื่องในขั้นสร้างภาพ",
    creativeDirection: {
      presentationStylePreference: input.presentationStyle,
      presentationStyleGuidance: {
        story_tie_in:
          "หัวข้อรีวิวเป็นส่วนหนึ่งของเหตุการณ์และความสัมพันธ์ในละคร ไม่หยุดเรื่องเพื่อขาย",
        direct_product_pitch:
          "ตัวละครแนะนำหัวข้อรีวิวอย่างตรงไปตรงมา บอกเฉพาะข้อมูลหรือประโยชน์ที่มีหลักฐาน และชวนพิจารณาอย่างสุภาพโดยไม่กดดัน",
        unboxing:
          "เปิดกล่อง ทดลองใช้ หรือพาชม/สำรวจครั้งแรกให้เหมาะกับประเภทหัวข้อ โดยไม่แต่งรายละเอียดที่ไม่มีในข้อมูล",
        feature_explainer:
          "สาธิตหรืออธิบายคุณสมบัติ ขั้นตอน หรือจุดเด่นที่ระบุไว้ โดยผูกกับการใช้งานจริง ห้ามสร้างสเปกหรือผลลัพธ์เพิ่ม",
        problem_solution:
          "เริ่มจากปัญหาหรือความต้องการ แล้วแสดงว่าหัวข้อรีวิวเกี่ยวข้องหรือช่วยได้อย่างไรโดยไม่อ้างผลเกินข้อมูล",
        experience_review:
          "เล่าประสบการณ์ตรงและรายละเอียดที่สังเกตได้จากการไปใช้/เยี่ยมชม/ทดลอง โดยแยกความเห็นออกจากข้อเท็จจริง",
        documentary:
          "เล่าเชิงสารคดีด้วยลำดับข้อเท็จจริง การสังเกต และบริบทที่ผู้ใช้ให้ โดยไม่แต่งแหล่งข่าวหรือข้อมูลเพิ่มเติม",
      },
      storyStructurePreference: input.storyStructure,
      storyStructureGuidance: {
        three_act:
          "3 องก์: เปิดสถานการณ์และเป้าหมาย → เกิดอุปสรรคหรือการตัดสินใจ → คลี่คลายและจบด้วยผลทางอารมณ์",
        problem_solution:
          "ปัญหา → สำรวจทางเลือกหรือทดลอง → วิธีที่ช่วยได้และข้อสรุปตามจริง",
        aida:
          "ดึงความสนใจ → ทำให้เข้าใจหรือสนใจ → แสดงความเหมาะสม → ปิดด้วยการตัดสินใจหรือคำชวนอย่างนุ่มนวล ไม่บังคับซื้อ",
        before_after_bridge:
          "สภาพก่อน → จุดเปลี่ยนจากการลองหรือเรียนรู้ → สภาพหลังและสิ่งที่เชื่อมสองช่วง โดยไม่กล่าวอ้างเกินหลักฐาน",
        hero_journey:
          "ตัวละครมีเป้าหมาย → เจออุปสรรค → ลองวิธีหรือได้รับความช่วยเหลือ → เปลี่ยนแปลงและกลับมาพร้อมข้อเรียนรู้",
      },
      variedSelection:
        "เมื่อ preference เป็น varied ให้เลือกแนวที่ต่างกันในไอเดียทั้ง 3 ใบ และใส่รหัสแนวที่ใช้จริงในแต่ละใบ",
      fixedSelection:
        "เมื่อ preference ระบุแนวใดแนวหนึ่ง ให้ใช้แนวนั้นกับไอเดียทั้ง 3 ใบ และใส่รหัสแนวที่ใช้จริงในแต่ละใบ",
    },
    outputContract: MARKETPLACE_REVIEW_IDEA_OUTPUT_CONTRACT,
    outputShape: {
      schemaVersion: 1,
      ideas: [
        {
          ideaId: "unique-card-id",
          title: "ชื่อไอเดีย",
          presentationStyle:
            "story_tie_in | direct_product_pitch | unboxing | feature_explainer | problem_solution | experience_review | documentary",
          storyStructure:
            "three_act | problem_solution | aida | before_after_bridge | hero_journey",
          logline: "ประโยคสรุปเหตุการณ์",
          episodeStory: "เรื่องละครภาษาไทยแบบร้อยแก้วต่อเนื่องอย่างน้อย 3 ย่อหน้า ตั้งแต่เริ่มปัญหาจนจบฉาก",
          dialogueScript: "ชื่อผู้ใหญ่ที่เลือก: (การกระทำ) ประโยคสั้นที่เหมาะกับฉาก\nชื่อผู้ใหญ่ที่เลือก: ประโยคตอบรับหรือพาเรื่องต่อ",
          storyFunction: "หน้าที่ของฉากในเรื่อง",
          scene: {
            location: "สถานที่",
            time: "ช่วงเวลา",
            atmosphere: "บรรยากาศ",
            beats: ["จังหวะที่ 1", "จังหวะที่ 2"],
          },
          productMentionReason: "เหตุผลที่หัวข้อรีวิวเข้ากับเหตุการณ์นี้",
          dialogue: [{ speaker: "ชื่อตัวละคร", line: "บทสนทนา", delivery: "น้ำเสียง" }],
          shotDialogues: Array.from({ length: 9 }, (_, index) => ({
            shotNumber: index + 1,
            lines:
              input.dialogueMode === "character_dialogue"
                ? [
                    { speaker: "ชื่อผู้ใหญ่ที่เลือก", line: "ประโยคสั้นที่เป็นธรรมชาติ" },
                    { speaker: "ชื่อผู้ใหญ่ที่เลือก", line: "ประโยคตอบรับหรือพาเรื่องต่อ" },
                  ]
                : [],
          })),
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
      eachIdeaMustIncludeItsActualPresentationStyleAndStoryStructure: true,
      whenPresentationStyleIsVariedUseDifferentStylesAcrossTheThreeIdeas: true,
      whenStoryStructureIsVariedUseDifferentStructuresAcrossTheThreeIdeas: true,
      whenPreferenceIsSpecificApplyItToAllThreeIdeas: true,
      preserveDna: true,
      addOnlyMissingLookOrSceneSlots: true,
      noUnsupportedClaims: true,
    },
    productSourceRules:
      input.productSource === "upload"
        ? "The product.description and direction are the user's written brief about the selected review subject. Use only those stated facts; when the brief is empty, keep the story visual and conservative. Treat uploaded and selected images as visual references, not as evidence for unseen pricing, services, features, performance, opening hours, or claims."
        : "Use the Marketplace product record as the authoritative source of product facts; optional direction and saved AI insights are creative guidance only and must never override product facts. Never mention current/original prices, discounts, coupons, vouchers, or promotions in the story, ideas, dialogue, or video concepts.",
    dialogueRules: {
      eligibleAdultSpeakerNames: input.dialogueSpeakerCharacterNames,
      prohibitedSpeakerNames: input.dialogueProhibitedCharacterNames,
      everyShotMustHaveDialogue:
        input.dialogueMode === "character_dialogue",
      advertisingCompliance:
        "ห้ามกล่าวอ้างเกินจริงและห้ามให้เด็กพูด; direct_product_pitch สามารถแนะนำหัวข้อรีวิวอย่างชัดเจนด้วยข้อมูลจริงได้ แต่ห้ามกดดันหรือชวนซื้อเกินควร",
      productTieIn:
        input.presentationStyle === "direct_product_pitch"
          ? input.dialogueMode === "character_dialogue"
            ? "แนวนี้ต้องแนะนำหัวข้อรีวิวอย่างชัดเจนในบทพูดของผู้ใหญ่ โดยใช้เฉพาะรายละเอียดหรือประโยชน์ที่มีในข้อมูล และพูดอย่างสุภาพไม่กดดัน ช็อตอื่นยังเล่าเรื่องต่อได้ ไม่ต้องกล่าวถึงหัวข้อในทุกช็อต"
            : "แนวนี้ให้ตัวละครพาชมหรือสาธิตหัวข้อรีวิวอย่างชัดเจนผ่านการกระทำ ใช้เฉพาะข้อมูลที่มี ห้ามมีบทพูด"
          : input.dialogueMode === "character_dialogue"
            ? "ใช้รายละเอียดหัวข้อรีวิวและทิศทางที่ผู้ใช้ให้มาเป็นข้อมูลประกอบการคิดไอเดีย ให้หัวข้อเข้ากับเหตุการณ์อย่างเป็นธรรมชาติ บทพูดจะกล่าวถึงหัวข้อนี้เมื่อเหมาะกับฉาก ไม่จำเป็นต้องกล่าวถึงในทุกช็อต"
            : "ใช้รายละเอียดหัวข้อรีวิวและทิศทางที่ผู้ใช้ให้มาเป็นข้อมูลประกอบการคิดไอเดีย ให้หัวข้อเข้ากับเหตุการณ์หรือการกระทำอย่างเป็นธรรมชาติ ห้ามมีบทพูด",
    },
    repairFeedback: repairFeedback || undefined,
    input: promptInput,
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
  productId?: string;
  productSource: "marketplace_capture" | "upload";
  reviewSubjectType?: MarketplaceReviewIdeaInput["reviewSubjectType"];
  presentationStyle?: MarketplaceReviewIdeaInput["presentationStyle"];
  storyStructure?: MarketplaceReviewIdeaInput["storyStructure"];
  referenceImages: Array<{
    mediaAssetId: string;
    imageId?: string;
    label?: string;
  }>;
  customerJourney?: unknown;
  footageGuide?: unknown;
  direction?: string;
  productBrief?: string;
  llmModelId?: string;
  dialogueMode: "none" | "character_dialogue";
  selectedCharacterIds: string[];
  variationSeed: string;
}): Promise<MarketplaceReviewIdeaInput> {
  const reviewSubjectType = input.reviewSubjectType ?? "product";
  const productSource =
    reviewSubjectType === "product" ? input.productSource : "upload";
  const productBrief = input.productBrief?.trim() || input.direction?.trim() || "";
  if (productSource === "upload" && reviewSubjectType === "product" && !productBrief) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "กรุณาใส่รายละเอียดสินค้าหรือข้อเท็จจริงที่ยืนยันได้ก่อนสร้างไอเดียจากภาพที่อัปโหลด",
    });
  }
  if (productSource === "marketplace_capture" && !input.productId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Marketplace tie-in ideas require a selected product",
    });
  }
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

  const bundle =
    productSource === "marketplace_capture"
      ? await getMarketplaceProductWithAccess(input.productId!, input.actor)
      : null;
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
  const dialogueSpeakerCharacterNames: string[] = [];
  const dialogueProhibitedCharacterNames: string[] = [];
  for (const character of selectedCharacters) {
    if (!character) continue;
    const eligibility = resolveSpecialDialogueSpeakerEligibility({
      name: character.name,
      role: character.role,
      narrativeRole: character.narrativeRole,
      data: character.data,
    });
    if (eligibility.eligible) {
      dialogueSpeakerCharacterNames.push(character.name);
    } else {
      dialogueProhibitedCharacterNames.push(character.name);
    }
  }
  if (
    input.dialogueMode === "character_dialogue" &&
    dialogueSpeakerCharacterNames.length === 0
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "โหมดบทพูดสำหรับโฆษณาต้องเลือกตัวละครที่ยืนยันอายุ 18 ปีขึ้นไปอย่างน้อย 1 คน",
    });
  }
  const bible = (series.bible as Record<string, unknown> | null) ?? {};
  const product = (bundle?.product as Record<string, unknown> | null) ?? {};
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
  const normalizedUploadProductId = `upload:${crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        reviewSubjectType,
        referenceImages: input.referenceImages
          .map(image => image.mediaAssetId)
          .sort(),
      })
    )
    .digest("hex")
    .slice(0, 32)}`;
  const normalizedProductId =
    productSource === "upload"
      ? normalizedUploadProductId
      : input.productId!;
  const normalizedProductDescription =
    productSource === "upload"
      ? bounded(productBrief, 8000)
      : bounded(
          product.descriptionText ??
            descriptionJson.rawText ??
            product.description,
          8000
        );

  const reviewSubjectLabels: Record<
    MarketplaceReviewIdeaInput["reviewSubjectType"],
    string
  > = {
    product: "สินค้า",
    object: "วัตถุ/อุปกรณ์",
    restaurant: "ร้านอาหาร",
    place: "สถานที่",
    tourist_attraction: "สถานที่ท่องเที่ยว",
    documentary: "ประเด็นสารคดี",
    app: "แอป",
    software: "โปรแกรม",
    work_system: "ระบบงาน",
  };

  return marketplaceReviewIdeaInputSchema.parse({
    schemaVersion: 1,
    productSource,
    reviewSubjectType,
    product: {
      productId: normalizedProductId,
      name: String(
        productSource === "upload"
          ? `${reviewSubjectLabels[reviewSubjectType]}จากภาพอ้างอิง`
          : product.productName ?? input.productId
      ),
      brand:
        productSource === "marketplace_capture"
          ? bounded(product.brand, 255)
          : undefined,
      category:
        productSource === "marketplace_capture"
          ? bounded(
              product.productCategory ??
                descriptionJson.categoryText ??
                specsJson.categoryText,
              255
            )
          : reviewSubjectLabels[reviewSubjectType],
      description: normalizedProductDescription,
      specs:
        productSource === "marketplace_capture"
          ? safeJson({ specs: specsJson, source: platformRawJson }, 6000)
          : undefined,
      customerJourney: input.customerJourney ??
        (productSource === "marketplace_capture"
          ? safeJson(
              { description: descriptionJson, platform: platformRawJson },
              6000
            )
          : undefined),
      sourceClaims:
        productSource === "upload"
          ? []
          : [
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
    presentationStyle: input.presentationStyle ?? "varied",
    storyStructure: input.storyStructure ?? "varied",
    selectedCharacterIds,
    excludedCharacterNames,
    dialogueSpeakerCharacterNames,
    dialogueProhibitedCharacterNames,
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
    direction:
      productSource === "upload" ? productBrief : input.direction,
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
  let planningResult: Awaited<
    ReturnType<typeof executeJsonPlanningCallWithRetry>
  > | null = null;
  let output: MarketplaceReviewIdeaOutput | null = null;
  let lastValidationError: unknown = null;
  let repairFeedback = "";
  for (let attempt = 1; attempt <= 3 && !output; attempt += 1) {
    try {
      planningResult = input.execute
        ? null
        : await executeJsonPlanningCallWithRetry({
            model,
            systemPrompt,
            userPrompt: buildUserPrompt(parsed, repairFeedback),
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
            verticalDramaContext: {
              seriesId: input.seriesId,
              taskClass: "script_generation",
            },
            schemaRetryContract: MARKETPLACE_REVIEW_IDEA_OUTPUT_CONTRACT,
          });
      const rawOutput = input.execute
        ? await input.execute({
            systemPrompt,
            userPrompt: buildUserPrompt(parsed, repairFeedback),
            model,
          })
        : planningResult!.data;
      output = validateMarketplaceReviewIdeaOutput(rawOutput, {
        allowedCharacterIds: parsed.selectedCharacterIds,
        allowedCharacterNames: parsed.characters.map(character => character.name),
        excludedCharacterNames: parsed.excludedCharacterNames,
        dialogueSpeakerCharacterNames: parsed.dialogueSpeakerCharacterNames,
        dialogueProhibitedCharacterNames: parsed.dialogueProhibitedCharacterNames,
        dialogueMode: parsed.dialogueMode,
      });
    } catch (error) {
      lastValidationError = error;
      repairFeedback =
        `การตรวจรอบที่ ${attempt} ไม่ผ่าน: ${
          error instanceof Error ? error.message : String(error)
        }. ปรับเรื่องและบทพูดให้ตรงกับประเภทหัวข้อรีวิวและข้อมูลที่ยืนยันได้อย่างเป็นธรรมชาติ ไม่ฝืนกล่าวถึงหัวข้อในทุกช็อต สร้าง JSON ใหม่ทั้งชุดให้ครบตาม schema และกฎบทพูด ห้ามส่งผลลัพธ์บางส่วน`;
    }
  }
  if (!output) {
    throw new Error(
      `MARKETPLACE_REVIEW_IDEA_REPAIR_FAILED: ไม่สามารถสร้างไอเดียและบทพูดที่ผ่านการตรวจได้ภายใน 3 รอบ (${lastValidationError instanceof Error ? lastValidationError.message : String(lastValidationError)})`
    );
  }

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

export async function runMarketplaceReviewIdeasJob(
  payload: VerticalDramaInteractiveJobPayload,
  _execution: { jobId: string; traceId: string }
): Promise<unknown> {
  if (payload.kind !== "marketplace_review_ideas") {
    throw new Error("Invalid Marketplace review idea job kind");
  }
  const seriesId = Number(payload.input.seriesId);
  if (!Number.isInteger(seriesId) || seriesId <= 0) {
    throw new Error("Marketplace review idea job has an invalid series id");
  }
  let rawRequest = payload.input.request;
  if (Array.isArray(payload.input.requestChunks)) {
    const chunks = payload.input.requestChunks;
    if (
      chunks.length === 0 ||
      chunks.length > 128 ||
      chunks.some(chunk => typeof chunk !== "string" || chunk.length > 8_000)
    ) {
      throw new Error("Marketplace review idea job has invalid request chunks");
    }
    try {
      rawRequest = JSON.parse(chunks.join("")) as unknown;
    } catch {
      throw new Error("Marketplace review idea job request is not valid JSON");
    }
  }
  const request = marketplaceReviewIdeaInputSchema.parse(rawRequest);
  return generateMarketplaceReviewIdeas({
    actor: { tenantId: payload.tenantId, userId: payload.userId },
    seriesId,
    request,
  });
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
      resume: buildMarketplaceReviewIdeaResumeSnapshot(row.input),
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
    // Scene creation is an explicit user decision. Eagerly provisioning here
    // made a just-created scene look like a duplicate in the following step.
    // Always return a review choice so the creator can reuse a scene or add a
    // new one deliberately, including when there are no close matches.
    slotResults.sceneSuggestions.push({
      sceneLabel: request.sceneLabel,
      description: request.description,
      candidates: [
        ...(matches.exact
          ? [{
              locationId: matches.exact.id,
              locationKey: matches.exact.locationKey,
              name: matches.exact.name,
              score: 1,
            }]
          : []),
        ...matches.similar,
      ].map(candidate => ({
        locationId: String(candidate.locationId),
        locationKey: candidate.locationKey,
        name: candidate.name,
        score: candidate.score,
      })),
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
