/**
 * Semantic preflight for storyboard shot presence.
 *
 * The storyboard skill creates the visual story. This sibling skill answers a
 * narrower question before persistence: which named people are physically
 * visible, remote/on a device, off-screen speakers, or merely mentioned.
 * Its output is explicit input to the image stages; prose name matching is
 * deliberately not used here because a mention is not scene presence.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  calculateCreditsForLLM,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  type JsonPlanningAttemptEvent,
} from "./verticalDramaStoryBible";
import { resolveStoryboardModel } from "./verticalDramaImproveScript";

export const VERTICAL_DRAMA_SHOT_SCENE_INTENT_VERSION =
  "vd-shot-scene-intent-v1" as const;

const communicationModes = [
  "none",
  "phone_call",
  "video_call",
  "text_message",
  "shout_through_barrier",
  "barrier_dialogue",
  "separate_locations",
  "voice_only",
] as const;

const visualModes = [
  "single_view",
  "device_screen",
  "dual_view",
  "text_ui",
  "voice_only",
  "no_character",
] as const;

const dialogueRoles = [
  "physical",
  "screen_caller",
  "offscreen",
  "mentioned_only",
  "unknown",
] as const;

const dialogueVisualTargets = [
  "body",
  "virtual_screen",
  "none",
  "text_ui",
] as const;

const supportingPresenceSchema = z
  .object({
    role: z.string().min(1).max(120),
    count: z.number().int().positive().max(20).optional(),
    visibility: z.enum(["visible", "background"]).optional(),
    action: z.string().max(500).optional(),
  })
  .passthrough();

const sceneIntentSchema = z
  .object({
    contract_version: z.literal(VERTICAL_DRAMA_SHOT_SCENE_INTENT_VERSION),
    physical_character_refs: z.array(z.string().min(1)).max(10),
    screen_caller_refs: z.array(z.string().min(1)).max(10),
    offscreen_speaker_refs: z.array(z.string().min(1)).max(10),
    mentioned_only_refs: z.array(z.string().min(1)).max(20),
    supporting_presence: z.array(supportingPresenceSchema).max(6),
    communication_mode: z.enum(communicationModes),
    visual_plan: z
      .object({
        mode: z.enum(visualModes),
        reason_codes: z.array(z.string().min(1)).max(8),
        primary_character_refs: z.array(z.string().min(1)).max(10),
        secondary_character_refs: z.array(z.string().min(1)).max(10),
        primary_location_key: z.string().min(1).max(160).optional(),
        secondary_location_key: z.string().min(1).max(160).optional(),
      })
      .passthrough(),
    dialogue_routing: z
      .array(
        z
          .object({
            line_index: z.number().int().nonnegative(),
            speaker_ref: z.string().min(1).optional(),
            role: z.enum(dialogueRoles),
            visual_target: z.enum(dialogueVisualTargets),
            must_be_on_screen: z.boolean(),
            must_not_appear_physically: z.boolean(),
          })
          .passthrough()
      )
      .max(50),
    confidence: z.enum(["high", "medium", "low"]),
    needs_review: z.boolean(),
    reason_codes: z.array(z.string().min(1)).max(12),
  })
  .passthrough();

export const verticalDramaShotSceneIntentOutputSchema = z
  .object({
    contract_version: z.literal(VERTICAL_DRAMA_SHOT_SCENE_INTENT_VERSION),
    shots: z
      .array(
        z.object({
          shot_number: z.number().int().positive(),
          scene_intent: sceneIntentSchema,
        })
      )
      .length(9),
  })
  .passthrough();

export type VerticalDramaShotSceneIntent = z.infer<typeof sceneIntentSchema>;
export type VerticalDramaShotSceneIntentOutput = z.infer<
  typeof verticalDramaShotSceneIntentOutputSchema
>;

export type VerticalDramaShotSceneIntentShotInput = {
  shotNumber: number;
  synopsis: string;
  action?: string;
  dialogueExcerpt?: string;
  visualDescription?: string;
  location?: string;
};

export type VerticalDramaShotSceneIntentParams = {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  currentEpisodeNumber: number;
  locale?: string;
  characters: Array<{
    characterId: string;
    name: string;
    role?: string | null;
  }>;
  shots: VerticalDramaShotSceneIntentShotInput[];
  sceneBeats?: Array<{
    scene?: number;
    location?: string;
    summary?: string;
    keyLine?: string;
  }>;
  previousEpisodeContext?: unknown;
  episodeGenerationSettings?: unknown;
  deferCreditDeduction?: boolean;
  planningAttemptObserver?: (
    event: JsonPlanningAttemptEvent
  ) => Promise<void> | void;
};

type CreditCharge = {
  amount: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  skillSlug: string;
  description: string;
};

export class VerticalDramaShotSceneIntentReviewRequiredError extends Error {
  readonly code = "VD_SHOT_SCENE_INTENT_REVIEW_REQUIRED" as const;

  constructor(readonly issues: string[]) {
    super(
      `Storyboard scene intent requires review before image generation: ${issues.slice(0, 4).join("; ")}`
    );
    this.name = "VerticalDramaShotSceneIntentReviewRequiredError";
  }
}

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-shot-scene-intent"
);
let cachedSystemPrompt: string | null = null;

function loadSkillSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf-8"));
    if (content?.trim()) {
      cachedSystemPrompt = content;
      return content;
    }
  }
  throw new Error(
    `Could not locate skill.md for "vertical-drama-shot-scene-intent" under any known skills directory`
  );
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value === "string") return value.trim().slice(0, maxLength);
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized.slice(0, maxLength) : "";
  } catch {
    return "";
  }
}

function renderShot(shot: VerticalDramaShotSceneIntentShotInput): string {
  return [
    `Shot ${shot.shotNumber}`,
    `synopsis: ${boundedText(shot.synopsis, 1800)}`,
    shot.action ? `action: ${boundedText(shot.action, 700)}` : null,
    shot.dialogueExcerpt
      ? `dialogue: ${boundedText(shot.dialogueExcerpt, 900)}`
      : null,
    shot.visualDescription
      ? `visual_description: ${boundedText(shot.visualDescription, 900)}`
      : null,
    shot.location ? `location: ${boundedText(shot.location, 240)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildVerticalDramaShotSceneIntentPrompt(
  params: Pick<
    VerticalDramaShotSceneIntentParams,
    | "episodeTitle"
    | "currentEpisodeNumber"
    | "characters"
    | "shots"
    | "sceneBeats"
    | "previousEpisodeContext"
  >
): string {
  const roster = params.characters
    .map(
      character =>
        `- ${character.characterId}: ${character.name}${character.role ? ` (${character.role})` : ""}`
    )
    .join("\n");
  const currentShots = params.shots.map(renderShot).join("\n\n");
  const previousShotContext = params.shots
    .map((shot, index) => {
      const previous = params.shots[index - 1];
      return previous
        ? `Before Shot ${shot.shotNumber}, the immediately previous shot was:\n${renderShot(previous)}`
        : `Shot ${shot.shotNumber} starts the current episode sequence.`;
    })
    .join("\n\n");
  const previousEpisode = params.previousEpisodeContext
    ? `PREVIOUS EPISODE ENDING (bounded):\n${boundedText(params.previousEpisodeContext, 5000)}`
    : "PREVIOUS EPISODE ENDING: unavailable; do not invent continuity facts.";
  const sceneBeats = params.sceneBeats?.length
    ? `CANONICAL SCENE/DIALOGUE CONTEXT:\n${params.sceneBeats
        .map(beat =>
          [
            beat.scene ? `Scene ${beat.scene}` : null,
            beat.location
              ? `location: ${boundedText(beat.location, 180)}`
              : null,
            beat.summary ? `summary: ${boundedText(beat.summary, 900)}` : null,
            beat.keyLine ? `key line: ${boundedText(beat.keyLine, 900)}` : null,
          ]
            .filter(Boolean)
            .join(" | ")
        )
        .join("\n")}`
    : "CANONICAL SCENE/DIALOGUE CONTEXT: unavailable; rely on current shot text only.";

  return [
    `Interpret scene intent for ${params.episodeTitle} (episode ${params.currentEpisodeNumber}).`,
    "Read every current shot together, then use the immediately previous shot and the bounded previous-episode ending as continuity context.",
    "A person named in narration, backstory, gossip, a remembered event, a news/TV reference, or a text message is mentioned-only unless the shot explicitly places them visibly or makes them a remote caller.",
    "A phone/video caller is not physically present. A text-message sender is not a caller. A voice through a closed door/wall is offscreen or barrier dialogue, not a visible body unless the shot explicitly says to show them.",
    "When two people talk from different places, across a closed barrier, or through a video call and the image must show both environments, use dual_view. Use device_screen for a caller shown only inside a phone/tablet/monitor.",
    "Do not use character names as a reason to include them. Only use exact character ids from the roster. If the wording is ambiguous or categories contradict one another, set needs_review=true and confidence=low.",
    "Return exactly nine shot interpretations and preserve shot numbers.",
    `CHARACTER ROSTER:\n${roster}`,
    previousEpisode,
    sceneBeats,
    `CURRENT SHOTS:\n${currentShots}`,
    `PREVIOUS-SHOT CONTEXT:\n${previousShotContext}`,
    "Output fields are mandatory: physical_character_refs, screen_caller_refs, offscreen_speaker_refs, mentioned_only_refs, supporting_presence, communication_mode, visual_plan, dialogue_routing, confidence, needs_review, reason_codes. The image planner will use only the explicit physical/screen/visual_plan fields.",
  ].join("\n\n");
}

export async function generateVerticalDramaShotSceneIntent(
  params: VerticalDramaShotSceneIntentParams
): Promise<{
  intent: VerticalDramaShotSceneIntentOutput;
  creditsUsed: number;
  model: string;
  creditCharge?: CreditCharge;
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new Error("Rate limit exceeded for shot scene intent generation");
  }
  if (!(await hasEnoughCredits(params.userId, 1))) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryboardModel(params.seriesId);
  const result = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt: loadSkillSystemPrompt(),
    userPrompt: buildVerticalDramaShotSceneIntentPrompt(params),
    temperature: 0.1,
    userId: params.userId,
    maxTokens: 7000,
    schema: verticalDramaShotSceneIntentOutputSchema,
    label: "Vertical Drama shot scene intent",
    planningAttemptObserver: params.planningAttemptObserver,
    verticalDramaContext: {
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      taskClass: "semantic_quality_review",
      settings: params.episodeGenerationSettings,
    },
  });
  const usage = result.response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );
  const creditCharge: CreditCharge = {
    amount: creditsUsed,
    model,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    skillSlug: "vertical-drama-shot-scene-intent",
    description: `Vertical Drama — interpret shot scene intent (episode #${params.episodeId})`,
  };
  if (!params.deferCreditDeduction) {
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: creditCharge.amount,
      description: creditCharge.description,
      skillSlug: creditCharge.skillSlug,
      sourceType: "skill",
      metadata: {
        model,
        llmModel: model,
        feature: "vertical_drama_series",
        seriesId: params.seriesId,
        episodeId: params.episodeId,
        inputTokens: creditCharge.inputTokens,
        outputTokens: creditCharge.outputTokens,
      },
    });
  }
  return {
    intent: result.data,
    creditsUsed,
    model,
    ...(params.deferCreditDeduction ? { creditCharge } : {}),
  };
}

function addIssue(issues: string[], message: string): void {
  if (!issues.includes(message)) issues.push(message);
}

function validateSceneIntent(
  shotNumber: number,
  scene: VerticalDramaShotSceneIntent,
  validIds: Set<string>
): string[] {
  const issues: string[] = [];
  const groups = [
    ["physical", scene.physical_character_refs],
    ["screen caller", scene.screen_caller_refs],
    ["offscreen speaker", scene.offscreen_speaker_refs],
    ["mentioned-only", scene.mentioned_only_refs],
  ] as const;
  const seen = new Map<string, string>();
  for (const [label, refs] of groups) {
    for (const ref of refs) {
      if (!validIds.has(ref))
        addIssue(issues, `shot ${shotNumber}: unknown ${label} ref ${ref}`);
      const previous = seen.get(ref);
      if (previous)
        addIssue(
          issues,
          `shot ${shotNumber}: ${ref} is both ${previous} and ${label}`
        );
      seen.set(ref, label);
    }
  }
  if (scene.confidence === "low" || scene.needs_review) {
    addIssue(
      issues,
      `shot ${shotNumber}: model marked interpretation for review`
    );
  }
  if (
    (scene.communication_mode === "phone_call" ||
      scene.communication_mode === "video_call") &&
    scene.screen_caller_refs.length === 0
  ) {
    addIssue(issues, `shot ${shotNumber}: call mode has no screen caller`);
  }
  if (
    scene.visual_plan.mode === "device_screen" &&
    scene.screen_caller_refs.length === 0
  ) {
    addIssue(issues, `shot ${shotNumber}: device screen has no caller`);
  }
  if (scene.visual_plan.mode === "dual_view") {
    const primary = scene.visual_plan.primary_character_refs;
    const secondary = scene.visual_plan.secondary_character_refs;
    if (primary.length === 0 || secondary.length === 0) {
      addIssue(
        issues,
        `shot ${shotNumber}: dual view needs two character groups`
      );
    }
    if (
      !scene.visual_plan.primary_location_key ||
      !scene.visual_plan.secondary_location_key
    ) {
      addIssue(issues, `shot ${shotNumber}: dual view needs two locations`);
    }
    if (primary.some(ref => secondary.includes(ref))) {
      addIssue(issues, `shot ${shotNumber}: dual view groups overlap`);
    }
  }
  for (const ref of [
    ...scene.visual_plan.primary_character_refs,
    ...scene.visual_plan.secondary_character_refs,
  ]) {
    if (!validIds.has(ref)) {
      addIssue(
        issues,
        `shot ${shotNumber}: visual plan has unknown ref ${ref}`
      );
    }
  }
  const refsByRole = new Map<
    VerticalDramaShotSceneIntent["dialogue_routing"][number]["role"],
    Set<string>
  >([
    ["physical", new Set(scene.physical_character_refs)],
    ["screen_caller", new Set(scene.screen_caller_refs)],
    ["offscreen", new Set(scene.offscreen_speaker_refs)],
    ["mentioned_only", new Set(scene.mentioned_only_refs)],
  ]);
  for (const route of scene.dialogue_routing) {
    if (route.speaker_ref && !validIds.has(route.speaker_ref)) {
      addIssue(
        issues,
        `shot ${shotNumber}: dialogue has unknown speaker ${route.speaker_ref}`
      );
    }
    if (
      route.role === "screen_caller" &&
      route.must_be_on_screen &&
      route.visual_target !== "virtual_screen"
    ) {
      addIssue(
        issues,
        `shot ${shotNumber}: screen caller is not routed to a virtual screen`
      );
    }
    if (route.role === "mentioned_only" && route.must_be_on_screen) {
      addIssue(
        issues,
        `shot ${shotNumber}: mentioned-only speaker cannot be on screen`
      );
    }
    if (
      route.speaker_ref &&
      route.role !== "unknown" &&
      !refsByRole.get(route.role)?.has(route.speaker_ref)
    ) {
      addIssue(
        issues,
        `shot ${shotNumber}: dialogue speaker does not match its routed category`
      );
    }
  }
  return issues;
}

export function applyVerticalDramaShotSceneIntent(params: {
  storyboard: { shots: Array<Record<string, any>> };
  intents: VerticalDramaShotSceneIntentOutput["shots"];
  validCharacterIds: string[];
}): { shots: Array<Record<string, any>> } {
  const validIds = new Set(params.validCharacterIds);
  const issues: string[] = [];
  const byShot = new Map<
    number,
    VerticalDramaShotSceneIntentOutput["shots"][number]
  >();
  for (const entry of params.intents) {
    if (byShot.has(entry.shot_number))
      addIssue(issues, `duplicate intent for shot ${entry.shot_number}`);
    byShot.set(entry.shot_number, entry);
  }
  const seenStoryboardShots = new Set<number>();
  const shots = params.storyboard.shots.map(shot => {
    const shotNumber = Number(shot.shot_number);
    seenStoryboardShots.add(shotNumber);
    const entry = byShot.get(shotNumber);
    if (!entry) {
      addIssue(issues, `missing intent for shot ${shotNumber}`);
      return shot;
    }
    issues.push(
      ...validateSceneIntent(shotNumber, entry.scene_intent, validIds)
    );
    const scene = entry.scene_intent;
    const physical = Array.from(new Set(scene.physical_character_refs));
    const callers = Array.from(new Set(scene.screen_caller_refs));
    const next: Record<string, any> = {
      ...shot,
      characters: physical,
      required_character_refs: physical,
      screen_caller_refs: callers,
      supporting_presence: scene.supporting_presence,
      scene_intent: scene,
    };
    if (scene.visual_plan.mode === "dual_view") {
      next.view_mode = "dual";
      next.dual_view = {
        scenario:
          scene.communication_mode === "video_call"
            ? "remote_call"
            : scene.communication_mode === "separate_locations"
              ? "separate_locations"
              : "physical_barrier",
        primary_character_refs: scene.visual_plan.primary_character_refs,
        secondary_character_refs: scene.visual_plan.secondary_character_refs,
        primary_location_key: scene.visual_plan.primary_location_key,
        secondary_location_key: scene.visual_plan.secondary_location_key,
        confidence: scene.confidence === "high" ? 1 : 0.7,
        reason_codes: scene.visual_plan.reason_codes,
      };
    } else {
      next.view_mode = "single";
      delete next.dual_view;
    }
    return next;
  });
  for (const entry of params.intents) {
    if (!seenStoryboardShots.has(entry.shot_number)) {
      addIssue(issues, `intent references unknown shot ${entry.shot_number}`);
    }
  }
  if (issues.length > 0) {
    throw new VerticalDramaShotSceneIntentReviewRequiredError(issues);
  }
  return { shots };
}
