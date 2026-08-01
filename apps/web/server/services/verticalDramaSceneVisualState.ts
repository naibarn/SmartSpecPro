/**
 * Feature 138 P1 — authors one durable Scene Visual State for one scene.
 *
 * This service ships dark with no call sites. Sections 10/11/13 own gating,
 * persistence, lazy fail-open behavior, and UI mutations. The location row only
 * supplies description/reference facts; the skill authors concrete lighting and
 * layout within the caller-authorized Feature 139 series look. Identity fields
 * (location, membership, revision, timestamp, version) are stamped by code.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";
import type { VdSceneVisualState } from "@shared/verticalDramaSeries/sceneContinuity";
import type { StoryScriptLang } from "@shared/verticalDramaSeries/storyScriptText";
import { calculateCreditsForLLM, deductCredits, hasEnoughCredits } from "./creditService";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { resolveStartFramePlanModel } from "./verticalDramaImproveScript";
import {
  executeVisionAwareJsonCallWithRetry,
  InsufficientCreditsError,
  VD_COMPACT_JSON_INSTRUCTION,
  VdSchemaValidationError,
  type VisionAwareImageInput,
} from "./verticalDramaStoryBible";

export { InsufficientCreditsError, VdSchemaValidationError };

export const VD_SCENE_VISUAL_STATE_SKILL_FOLDER = "vertical-drama-scene-visual-state";
export const VD_SCENE_VISUAL_STATE_OUTPUT_KEY = "scene_visual_state";
export const VD_SCENE_VISUAL_STATE_CONTRACT_FIELDS = [
  "lighting_state",
  "fixed_elements",
  "spatial_layout",
  "staging_axis",
  "wardrobe_in_scene",
  "active_props",
  "palette_mood",
  "time_jump_suspected",
  "coverage_gaps",
] as const;
export const VD_SCENE_VISUAL_STATE_REQUIRED_SECTION_HEADERS = [
  "SCENE VISUAL STATE CONTRACT",
  "LOCK, DO NOT DESCRIBE",
  "LIGHTING STATE",
  "SET, LAYOUT AND STAGING AXIS",
  "WARDROBE AND PROPS CONTINUITY",
  "TIME JUMP AND COVERAGE GAPS",
] as const;

const SKILL_FOLDER_PATH = path.join("skills", VD_SCENE_VISUAL_STATE_SKILL_FOLDER);
let cachedSkill: { systemPrompt: string; skillVersion?: string } | null = null;

function loadSkill(): { systemPrompt: string; skillVersion?: string } {
  if (cachedSkill) return cachedSkill;
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const parsed = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (!parsed.content?.trim()) continue;
    const rawVersion = (parsed.metadata as { version?: unknown } | undefined)?.version;
    const skillVersion = typeof rawVersion === "string" && rawVersion.trim()
      ? rawVersion.trim()
      : undefined;
    cachedSkill = {
      systemPrompt: parsed.content,
      ...(skillVersion ? { skillVersion } : {}),
    };
    return cachedSkill;
  }
  throw new Error(
    `Could not locate skill.md for "${VD_SCENE_VISUAL_STATE_SKILL_FOLDER}" under any known skills directory`,
  );
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lenientMembers<T extends z.ZodTypeAny>(schema: T) {
  return z.unknown().transform((value): Array<z.infer<T>> => {
    if (!Array.isArray(value)) return [];
    return value.flatMap(member => {
      const parsed = schema.safeParse(member);
      return parsed.success ? [parsed.data] : [];
    });
  });
}

const fixedElementSchema = z.object({
  name: z.string().trim().min(1),
  placement: z.string().trim().min(1),
}).passthrough();
const wardrobeSchema = z.object({
  character: z.string().trim().min(1),
  wardrobe: z.string().trim().min(1),
}).passthrough();
const activePropSchema = z.object({
  name: z.string().trim().min(1),
  placement: z.string().trim().min(1),
  from_shot: z.unknown().transform(value =>
    typeof value === "number" && Number.isInteger(value) && value > 0
      ? value
      : undefined,
  ),
}).passthrough();

const stateSchema = z.object({
  lighting_state: z.unknown().transform(cleanString),
  fixed_elements: lenientMembers(fixedElementSchema),
  spatial_layout: z.unknown().transform(cleanString),
  staging_axis: z.unknown().transform(cleanString),
  wardrobe_in_scene: lenientMembers(wardrobeSchema),
  active_props: lenientMembers(activePropSchema),
  palette_mood: z.unknown().transform(cleanString),
  time_jump_suspected: z.unknown().transform(value => value === true),
  coverage_gaps: z.unknown().transform(value =>
    Array.isArray(value) ? value.map(cleanString).filter(Boolean).slice(0, 20) : [],
  ),
}).passthrough();

/** Lenient write-side validator; `resolveSceneVisualState` remains the read side. */
export const sceneVisualStatePlanOutputSchema = z.object({
  contract_version: z.literal(1).optional(),
  [VD_SCENE_VISUAL_STATE_OUTPUT_KEY]: stateSchema,
}).passthrough();

export type SceneVisualStatePlan = z.infer<typeof sceneVisualStatePlanOutputSchema>;

/** One member shot of the scene, as the caller already has it. */
export interface SceneVisualStateShotInput {
  shotNumber: number;
  /** Canonical start-frame summary, else the storyboard synopsis. */
  summary?: string;
  /** Character display names in roster order. */
  characters?: string[];
}

/** Known wardrobe facts from the character bible/roster. */
export interface SceneVisualStateWardrobeInput {
  character: string;
  wardrobe: string;
}

export interface GenerateSceneVisualStateParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  /** Provenance/logging only; never reaches the prompt. */
  episodeId?: number;
  locationKey: string;
  locationName?: string;
  locationDescription?: string;
  locationImageUrl?: string;
  sceneDescription?: string;
  shots: SceneVisualStateShotInput[];
  characterWardrobe?: SceneVisualStateWardrobeInput[];
  /** Authorized effective Feature 139 look; never resolved in this service. */
  seriesLook?: VerticalDramaPresetVisualIdentity;
  /** Code-owned invalidation identity computed by the caller. */
  membershipHash: string;
  /** Code-owned lifecycle revision selected by the caller. */
  revision: number;
  lang?: StoryScriptLang;
  idempotencyKey?: string;
}

function cleanList(values: readonly string[] | undefined): string {
  const cleaned = (values ?? []).map(value => value.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : "(none)";
}

/** Assemble structured facts only; all creative rules live in the skill. */
export function buildSceneVisualStatePlannerUserPrompt(
  params: GenerateSceneVisualStateParams,
): string {
  const lang = params.lang ?? "th";
  const shotLines = params.shots.map(shot =>
    `- shot ${shot.shotNumber}: ${cleanString(shot.summary) || "(none)"} [characters: ${cleanList(shot.characters)}]`,
  );
  const wardrobeLines = (params.characterWardrobe ?? []).map(entry =>
    `- ${cleanString(entry.character)}: ${cleanString(entry.wardrobe) || "(none)"}`,
  );
  const lookLines = params.seriesLook
    ? [
        `- style_name: ${cleanString(params.seriesLook.styleName) || "(none)"}`,
        `- palette: ${cleanList(params.seriesLook.palette)}`,
        `- lighting_treatment: ${cleanString(params.seriesLook.lighting) || "(none)"}`,
      ]
    : ["(none)"];

  return [
    "contract_version: 1",
    `locale: ${lang}`,
    `location_key: ${cleanString(params.locationKey)}`,
    `location_name: ${cleanString(params.locationName) || "(none)"}`,
    `location_description: ${cleanString(params.locationDescription) || "(none)"}`,
    `location_reference_image: ${cleanString(params.locationImageUrl) ? "attached" : "none"}`,
    `scene_description: ${cleanString(params.sceneDescription) || "(none)"}`,
    `series_look:\n${lookLines.join("\n")}`,
    `scene_shots:\n${shotLines.join("\n") || "(none)"}`,
    `character_wardrobe:\n${wardrobeLines.join("\n") || "(none)"}`,
    `requested_output: ${VD_SCENE_VISUAL_STATE_OUTPUT_KEY}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ].join("\n\n");
}

/** At most one location reference image is attached. */
export function buildSceneVisualStateVisionImages(
  params: Pick<GenerateSceneVisualStateParams, "locationImageUrl" | "locationName">,
): VisionAwareImageInput[] {
  const url = cleanString(params.locationImageUrl);
  if (!url) return [];
  return [{
    url,
    label: `Location reference: ${cleanString(params.locationName) || "scene location"}`,
  }];
}

async function resolveSceneVisualStateModel(
  seriesId: number,
  hasLocationImage: boolean,
): Promise<{ model: string; hasVision: boolean }> {
  const configured = await resolveStartFramePlanModel(seriesId);
  if (!hasLocationImage) return { model: configured, hasVision: false };
  try {
    const rows = await loadEnabledLlmModelRows();
    const configuredRow = rows.find(row =>
      row.modelId === configured ||
      row.providerModelId === configured ||
      Boolean(row.legacyModelAliases?.includes(configured)),
    );
    if (configuredRow?.supportsVision === true) return { model: configured, hasVision: true };
    const visionModel = selectBestLlmModel(
      { supportsVision: true, supportsStructuredOutputs: true },
      rows,
    );
    if (visionModel) return { model: visionModel, hasVision: true };
  } catch {
    // A planner can still author a consistent state from text facts.
  }
  return { model: configured, hasVision: false };
}

function normalizedShotNumbers(shots: readonly SceneVisualStateShotInput[]): number[] {
  return Array.from(new Set(shots
    .map(shot => shot.shotNumber)
    .filter(value => Number.isInteger(value) && value > 0)))
    .sort((a, b) => a - b);
}

/** Pure snake_case to camelCase mapper with code-owned identity fields. */
export function toSceneVisualState(
  parsed: SceneVisualStatePlan,
  owner: {
    locationKey: string;
    membershipHash: string;
    revision: number;
    memberShotNumbers: number[];
    plannedAt: string;
    skillVersion?: string;
  },
): VdSceneVisualState {
  const raw = parsed.scene_visual_state;
  return {
    locationKey: owner.locationKey,
    membershipHash: owner.membershipHash,
    revision: Number.isInteger(owner.revision) && owner.revision > 0 ? owner.revision : 1,
    lightingState: raw.lighting_state,
    fixedElements: raw.fixed_elements.map(entry => ({
      name: entry.name,
      placement: entry.placement,
    })),
    spatialLayout: raw.spatial_layout,
    stagingAxis: raw.staging_axis,
    wardrobeInScene: raw.wardrobe_in_scene.map(entry => ({
      character: entry.character,
      wardrobe: entry.wardrobe,
    })),
    activeProps: raw.active_props.map(entry => ({
      name: entry.name,
      placement: entry.placement,
      ...(entry.from_shot ? { fromShot: entry.from_shot } : {}),
    })),
    paletteMood: raw.palette_mood,
    timeJumpSuspected: raw.time_jump_suspected,
    coverageGaps: raw.coverage_gaps,
    memberShotNumbers: Array.from(new Set(owner.memberShotNumbers
      .filter(value => Number.isInteger(value) && value > 0)))
      .sort((a, b) => a - b),
    plannedAt: owner.plannedAt,
    ...(owner.skillVersion ? { skillVersion: owner.skillVersion } : {}),
  };
}

/** Author one Scene Visual State; callers own gating, persistence, and failure policy. */
export async function generateSceneVisualState(
  params: GenerateSceneVisualStateParams,
): Promise<{ state: VdSceneVisualState; creditsUsed: number; model: string; usedVision: boolean }> {
  if (!params.shots.length) throw new Error("Scene Visual State requires at least one member shot");
  if (!await hasEnoughCredits(params.userId, 1)) throw new InsufficientCreditsError();

  const images = buildSceneVisualStateVisionImages(params);
  const resolution = await resolveSceneVisualStateModel(params.seriesId, images.length > 0);
  const skill = loadSkill();
  const userPromptText = buildSceneVisualStatePlannerUserPrompt(params);
  const { data, response } = await executeVisionAwareJsonCallWithRetry<SceneVisualStatePlan>({
    model: resolution.model,
    systemPrompt: skill.systemPrompt,
    userPromptText,
    hasVision: resolution.hasVision,
    images,
    userId: params.userId,
    schema: sceneVisualStatePlanOutputSchema,
    firstAttemptMaxTokens: 2000,
    retryMaxTokens: 3000,
  });
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const creditsUsed = calculateCreditsForLLM(inputTokens, outputTokens, resolution.model);

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: "Vertical Drama — scene visual state",
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey
      ? `${params.idempotencyKey}:scene-visual-state`
      : undefined,
    metadata: {
      model: resolution.model,
      llmModel: resolution.model,
      feature: "vertical_drama_series",
      operation: "scene_visual_state",
      inputTokens,
      outputTokens,
    },
  });

  return {
    state: toSceneVisualState(data, {
      locationKey: params.locationKey,
      membershipHash: params.membershipHash,
      revision: params.revision,
      memberShotNumbers: normalizedShotNumbers(params.shots),
      plannedAt: new Date().toISOString(),
      skillVersion: skill.skillVersion,
    }),
    creditsUsed,
    model: resolution.model,
    usedVision: resolution.hasVision && images.length > 0,
  };
}
