/**
 * Feature 142 — section-05: the scene-planner service.
 *
 * A pure, effect-injected planning service that turns a fact set (the
 * project brief, the motion-template registry's own metadata, and the
 * scenes still needing a visual treatment) plus an LLM skill call into a
 * validated, merged `VideoProjectDocument`. Everything up to the single
 * `effects.persistDocument` call is read-only; every scene the skill returns
 * is structurally validated (template exists, params satisfy that
 * template's own Zod schema, sceneId resolves) BEFORE any merge, and the
 * merged document is re-validated against BOTH of this section's two risk
 * gates (R1 layer budget, R2 timeline invariants) before the one write.
 *
 * Skill-first boundary (`memory/feedback_skill_first_authoring.md`): this
 * file supplies FACTS only (`availableTemplates`, `layerBudget`,
 * `plannableScenes`, `occupiedIntervals`, `catalogFacts`, `brandKit`) and
 * enforces structural INVARIANTS (template exists, params valid, timeline
 * sane, layer budget respected). It never picks a template, ranks one, or
 * embeds a selection heuristic — that judgment lives entirely in
 * `skills/video-project-scene-plan/skill.md`.
 *
 * See
 * `specs/feature/142-video-intelligence-structured-planning-qa-engine/sections/section-05-scene-planner.md`
 * for the normative algorithm this file implements (§7.1 is the canonical
 * pipeline order).
 */
import { z } from "zod";

import {
  VideoProjectDocumentSchema,
  SceneMotionSchema,
  type Scene,
  type VideoProjectDocument,
} from "@shared/videoIntelligence/projectSchemas";
import {
  MOTION_TEMPLATE_IDS,
  type AspectRatio,
} from "@shared/videoIntelligence/motionTemplates";
import type {
  AssertNever,
  ForbiddenMediaGenerationEffectMembers,
} from "@shared/videoIntelligence/effectGuards";

import { MOTION_TEMPLATE_REGISTRY, type MotionTemplate } from "../remotion/templates";
import {
  compileVideoProject,
  VideoProjectCompileError,
  type TemplateBuildContext,
} from "./videoProjectCompiler";
import type { ResolvedCatalogFacts } from "./validateProjectClaims";

/* -------------------------------------------------------------------------- */
/* 4.1 — ScenePlanSkillInput                                                  */
/* -------------------------------------------------------------------------- */

/** The complete fact set the scene-plan skill receives. Built in TypeScript;
 *  contains no judgment, no template recommendation, and no prompt text. */
export type ScenePlanSkillInput = {
  brief: {
    topic: string | null;
    audience: string | null;
    language: string;
    platformPreset: string;
    studioType: string;
  };
  format: { width: number; height: number; fps: number; durationMs: number };
  aspectRatio: AspectRatio;
  /** Templates the planner may choose from — id + the registry's own meta.
   *  Sent as data so the skill never guesses an id that does not exist. */
  availableTemplates: Array<{
    id: string;
    categories: string[];
    minDurationMs: number;
    maxDurationMs: number;
    maxItems: number;
    renderCost: "low" | "medium" | "high";
    supportedAspectRatios: string[];
    brandTokens: string[];
    /** Best-effort JSON Schema hint derived from the template's own Zod
     *  paramsSchema, so params are bound correctly on the first attempt
     *  rather than by retry. */
    paramsJsonSchema: unknown;
  }>;
  /** R1 as a planning CONSTRAINT, not a post-hoc rejection. */
  layerBudget: { max: number; used: number; remaining: number };
  /** Scenes the skill is being asked to plan (mode-filtered, §7.4). */
  plannableScenes: Array<{
    sceneId: string;
    startMs: number;
    endMs: number;
    narration: string | null;
    captionText: string[];
    /** True when timings are frozen because narration audio or caption cues
     *  already exist for this scene (§7.4 rule 4). */
    timingLocked: boolean;
  }>;
  /** Time ranges the skill MUST NOT collide with — R2 as a constraint. */
  occupiedIntervals: Array<{ sceneId: string; startMs: number; endMs: number }>;
  /** Catalog facts for a Catalog Studio project; null for Motion Studio. */
  catalogFacts: {
    productIds: string[];
    claims: Array<{ claim: string; source: string; status: string }>;
    priceFacts?: { current?: string; original?: string; currency?: string };
  } | null;
  /** Brand tokens available to templates. Read-only context; the planner
   *  never writes brand values into the document (§7.7). */
  brandKit: { id: string; lockedTokens: string[] } | null;
};

/* -------------------------------------------------------------------------- */
/* 4.2 — ScenePlanSkillOutput                                                 */
/* -------------------------------------------------------------------------- */

/** Template SELECTION + parameter BINDING. Deliberately contains no field
 *  that could hold an image/video prompt — the skill-bundle test and
 *  section-08's repo-wide guard both assert no key matches
 *  `/prompt|imagePrompt|videoPrompt|negativePrompt/i`. */
export type ScenePlanSkillOutput = {
  scenes: Array<{
    /** Existing scene id, or a NEW id (§7.4). */
    sceneId: string;
    /** Must key into MOTION_TEMPLATE_REGISTRY. */
    templateId: string;
    /** Must satisfy that template's own Zod paramsSchema. */
    templateParams: Record<string, unknown>;
    startMs: number;
    endMs: number;
    motion?: { intensity: "low" | "medium" | "high"; camera: string };
    /** Why this template fits this beat. */
    rationale: string;
    /** Statements the plan intends to put on screen — forward-compat for a
     *  future claim-join extension; this section validates the shape but
     *  does not persist it anywhere (Scene has no such field, and adding one
     *  would tighten `VideoProjectDocumentSchema`, which this section must
     *  not do). */
    onScreenStatements: string[];
  }>;
  summary: string;
};

/* -------------------------------------------------------------------------- */
/* 4.3 — ScenePlanEffects + the non-duplication guard                        */
/* -------------------------------------------------------------------------- */

/** Effects seam. Mirrors the QA loop's DI style so the planner is
 *  unit-testable with zero I/O, and so the media-generation guard applies. */
export type ScenePlanEffects = {
  /** Calls the skill via callLLMStructured. Injected so tests never hit an LLM. */
  runPlanSkill(input: ScenePlanSkillInput): Promise<ScenePlanSkillOutput>;
  /** Pure catalog read, no writes. Null for a Motion Studio project. */
  resolveFacts(productIds: string[]): Promise<ResolvedCatalogFacts | null>;
  /** Persists the planned document; returns the new revision. Called AT MOST
   *  ONCE, and only after every validation gate has passed. */
  persistDocument(doc: VideoProjectDocument, reason: string): Promise<{ revision: number }>;
};

/** Compile-time assertion (unified section-08 §4.1 via the shared helper) —
 *  `pnpm check` fails if a media-generation member is ever added to
 *  `ScenePlanEffects`. Type-only, zero runtime cost. Exported alias name kept
 *  unchanged — section-08's fs guard references it by name. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AssertScenePlanHasNoMediaGeneration = AssertNever<
  ForbiddenMediaGenerationEffectMembers<ScenePlanEffects>
>;

/* -------------------------------------------------------------------------- */
/* 4.4 — The planner entry point                                             */
/* -------------------------------------------------------------------------- */

export type ScenePlanMode = "replace" | "fill_empty";

export type ScenePlanResult = {
  revision: number;
  /** Existing scenes whose visual was (re)planned. */
  plannedSceneIds: string[];
  /** New scenes the skill added. */
  appendedSceneIds: string[];
  /** fill_empty: already-planned scenes left alone. */
  skippedSceneIds: string[];
  /** Timeline gaps are permitted but always reported. */
  gaps: Array<{ afterSceneId: string | null; startMs: number; endMs: number; ms: number }>;
  /** True for any gap > SCENE_PLAN_REPORTABLE_GAP_MS. */
  hasLongGap: boolean;
  layerBudget: { max: number; used: number };
  summary: string;
};

/** 40 — mirrors `videoProjectCompiler.ts`'s private `MAX_LAYERS_PER_CONFIG`.
 *  Used only to build the `layerBudget` FACT for the skill; the
 *  authoritative gate is a dry compile (§7.2), so the two can never
 *  silently diverge. */
export const MAX_RENDERABLE_LAYERS = 40;
/** 1000 — a gap longer than this is reported as `hasLongGap`. */
export const SCENE_PLAN_REPORTABLE_GAP_MS = 1000;

/** Never resolves to a real asset — the dry-compile gate's assetResolver
 *  must never throw (§7.2), so it always returns this fixed placeholder
 *  regardless of the id it is asked to resolve. */
const DRY_COMPILE_PLACEHOLDER_URL = "https://dry-compile.invalid/placeholder";

/**
 * Plan scenes for one project.
 *
 * PURE apart from `effects`: no db, no Redis, no LLM, no Date.now beyond
 * what the caller injects. Validates EVERY scene of the MERGED document
 * before calling `effects.persistDocument` once. On any validation failure
 * it throws and `persistDocument` is never called — the stored document
 * stays byte-identical (this function never mutates its `document` argument;
 * every step operates on a deep copy).
 */
export async function planScenes(args: {
  document: VideoProjectDocument;
  mode: ScenePlanMode;
  studioType: string;
  productIds: string[];
  brandKit: { id: string; lockedTokens: string[] } | null;
  effects: ScenePlanEffects;
}): Promise<ScenePlanResult> {
  const { mode, studioType, productIds, brandKit, effects } = args;

  // Step 1 — re-parse: a stored document can predate a schema fix.
  const parsedIncoming = VideoProjectDocumentSchema.safeParse(args.document);
  if (!parsedIncoming.success) {
    throw new Error(`VI_DOCUMENT_INVALID: ${parsedIncoming.error.message}`);
  }

  // Deep copy — `args.document` (and even `parsedIncoming.data`) must never
  // be touched by anything below, so a thrown error provably leaves the
  // caller's document byte-identical.
  const workingDocument: VideoProjectDocument = JSON.parse(JSON.stringify(parsedIncoming.data));

  // Step 2 — partition plannable vs preserved by mode.
  const { plannable, preserved } = partitionScenes(workingDocument, mode);

  // Step 3 — layerBudget.used from the PRESERVED scenes only.
  const used =
    preserved.reduce((sum, scene) => sum + estimateSceneLayerCount(scene, workingDocument), 0) +
    countAudioTrackLayers(workingDocument);
  const remaining = MAX_RENDERABLE_LAYERS - used;

  // Step 4 — occupiedIntervals from the preserved scenes.
  const occupiedIntervals = preserved.map(scene => ({
    sceneId: scene.sceneId,
    startMs: scene.startMs,
    endMs: scene.endMs,
  }));

  // Step 5 — catalog facts, only for a catalog project with product ids.
  const resolvedCatalog =
    studioType === "catalog" && productIds.length > 0 ? await effects.resolveFacts(productIds) : null;

  // Step 6 — build the skill input and call the skill.
  const skillInput: ScenePlanSkillInput = {
    brief: {
      topic: workingDocument.content.topic ?? null,
      audience: workingDocument.content.audience ?? null,
      language: workingDocument.content.language,
      platformPreset: workingDocument.content.platformPreset,
      studioType,
    },
    format: { ...workingDocument.format },
    aspectRatio: deriveAspectRatio(workingDocument.format),
    availableTemplates: buildAvailableTemplates(),
    layerBudget: { max: MAX_RENDERABLE_LAYERS, used, remaining },
    plannableScenes: plannable.map(scene => ({
      sceneId: scene.sceneId,
      startMs: scene.startMs,
      endMs: scene.endMs,
      narration: scene.narration,
      captionText: scene.captionCues.map(cue => cue.text),
      timingLocked: isTimingLocked(scene),
    })),
    occupiedIntervals,
    catalogFacts: toSkillCatalogFacts(resolvedCatalog),
    brandKit,
  };

  const output = await effects.runPlanSkill(skillInput);

  // Step 7 — per-scene structural validation, ALL scenes, nothing partial.
  const plannableIds = new Set(plannable.map(scene => scene.sceneId));
  const existingIds = new Set(workingDocument.scenes.map(scene => scene.sceneId));
  const validatedParams = new Map<string, Record<string, unknown>>();

  for (const planned of output.scenes) {
    const template = (MOTION_TEMPLATE_REGISTRY as Record<string, MotionTemplate>)[planned.templateId];
    if (!template) {
      throw new Error(
        `VI_PLAN_TEMPLATE_UNKNOWN: scene "${planned.sceneId}" selected unknown templateId "${planned.templateId}"`,
      );
    }
    let parsedParams: Record<string, unknown>;
    try {
      parsedParams = template.paramsSchema.parse(planned.templateParams) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `VI_PLAN_PARAMS_INVALID: scene "${planned.sceneId}" templateParams failed template ` +
          `"${planned.templateId}"'s schema: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (existingIds.has(planned.sceneId) && !plannableIds.has(planned.sceneId)) {
      throw new Error(
        `VI_PLAN_PARAMS_INVALID: scene "${planned.sceneId}" is not plannable in mode "${mode}" ` +
          "(it already has content and was not offered to the skill)",
      );
    }
    validatedParams.set(planned.sceneId, parsedParams);
  }

  // Step 8 — merge into a candidate document, then re-parse.
  const plannedById = new Map(output.scenes.map(planned => [planned.sceneId, planned]));
  const plannedSceneIds: string[] = [];
  const appendedSceneIds: string[] = [];
  const skippedSceneIds: string[] = [];

  const mergedExisting: Scene[] = workingDocument.scenes.map(scene => {
    if (!plannableIds.has(scene.sceneId)) {
      return scene; // preserved, untouched
    }
    const planned = plannedById.get(scene.sceneId);
    if (!planned) {
      skippedSceneIds.push(scene.sceneId);
      return scene;
    }
    plannedSceneIds.push(scene.sceneId);
    plannedById.delete(scene.sceneId); // remaining entries are new/appended
    return applyPlannedScene(scene, planned, validatedParams.get(planned.sceneId)!);
  });

  const appendedScenes: Scene[] = [];
  for (const planned of plannedById.values()) {
    appendedSceneIds.push(planned.sceneId);
    appendedScenes.push(buildNewScene(planned, validatedParams.get(planned.sceneId)!));
  }

  // Rule 5 — scene order is by startMs ascending, stable for equal values
  // (Array#sort is stable in the runtimes this project targets).
  const mergedScenes = [...mergedExisting, ...appendedScenes].sort((a, b) => a.startMs - b.startMs);

  const candidate: VideoProjectDocument = { ...workingDocument, scenes: mergedScenes };
  const reparsedCandidate = VideoProjectDocumentSchema.safeParse(candidate);
  if (!reparsedCandidate.success) {
    throw new Error(
      `VI_PLAN_PARAMS_INVALID: merged document failed schema validation: ${reparsedCandidate.error.message}`,
    );
  }
  const mergedDocument = reparsedCandidate.data;

  // Step 9 — merged-document gates: timeline invariants, then layer budget.
  const { gaps, hasLongGap } = computeTimelineGapsOrThrow(mergedDocument);
  assertLayerBudgetOrThrow(mergedDocument);

  // Step 10 — the only write.
  const { revision } = await effects.persistDocument(mergedDocument, "scene_plan");

  return {
    revision,
    plannedSceneIds,
    appendedSceneIds,
    skippedSceneIds,
    gaps,
    hasLongGap,
    layerBudget: { max: MAX_RENDERABLE_LAYERS, used },
    summary: output.summary,
  };
}

/* -------------------------------------------------------------------------- */
/* Partitioning + timing lock (§7.4)                                          */
/* -------------------------------------------------------------------------- */

function isTimingLocked(scene: Scene): boolean {
  return scene.narrationAudioAssetId !== null || scene.captionCues.length > 0;
}

function partitionScenes(
  document: VideoProjectDocument,
  mode: ScenePlanMode,
): { plannable: Scene[]; preserved: Scene[] } {
  if (mode === "replace") {
    return { plannable: document.scenes, preserved: [] };
  }
  const plannable: Scene[] = [];
  const preserved: Scene[] = [];
  for (const scene of document.scenes) {
    if (scene.visual.kind === "layers" && scene.layers.length === 0) {
      plannable.push(scene);
    } else {
      preserved.push(scene);
    }
  }
  return { plannable, preserved };
}

/* -------------------------------------------------------------------------- */
/* Layer counting (§7.2 — the trap that makes R1 real)                       */
/* -------------------------------------------------------------------------- */

function makeDryTemplateBuildContext(format: VideoProjectDocument["format"]): TemplateBuildContext {
  return {
    format,
    brandKit: null,
    assetResolver: {
      url: () => DRY_COMPILE_PLACEHOLDER_URL,
      sha256: () => undefined,
    },
  };
}

/** Cheap, pre-LLM estimate for the `layerBudget` FACT. Not the authoritative
 *  gate (that is a dry compile, see `assertLayerBudgetOrThrow`) — this only
 *  needs to be a reasonable estimate, never a hard rejection. */
function estimateSceneLayerCount(scene: Scene, document: VideoProjectDocument): number {
  let count = scene.layers.length;
  if (scene.visual.kind === "template") {
    const template = (MOTION_TEMPLATE_REGISTRY as Record<string, MotionTemplate>)[scene.visual.templateId];
    if (template) {
      try {
        const params = template.paramsSchema.parse(scene.visual.params) as Record<string, unknown>;
        count += template.build(params, makeDryTemplateBuildContext(document.format)).length;
      } catch {
        // Unknown/invalid params on an existing (preserved) scene cannot be
        // dry-built for this estimate; the authoritative dry-compile gate
        // (§7.2) still catches any real structural problem later.
      }
    }
  }
  if (!document.captions.burnIn) {
    count += scene.captionCues.length;
  }
  return count;
}

function countAudioTrackLayers(document: VideoProjectDocument): number {
  let count = 0;
  for (const track of document.audioTracks) {
    count += track.kind === "sfx" ? track.events.length : track.assetRefs.length;
  }
  return count;
}

/* -------------------------------------------------------------------------- */
/* R1 authoritative gate — a dry compile IS the budget authority (§7.2)      */
/* -------------------------------------------------------------------------- */

function assertLayerBudgetOrThrow(document: VideoProjectDocument): void {
  const dryCtx = makeDryTemplateBuildContext(document.format);
  let result;
  try {
    result = compileVideoProject(document, dryCtx, {
      resolveTemplate: id => (MOTION_TEMPLATE_REGISTRY as Record<string, MotionTemplate>)[id],
    });
  } catch (error) {
    if (error instanceof VideoProjectCompileError) {
      throw new Error(
        `VI_PLAN_PARAMS_INVALID: dry compile failed while checking the layer budget ` +
          `(${error.code}): ${error.message}`,
      );
    }
    throw error;
  }
  if (result.kind === "segmented") {
    throw new Error(
      `VI_PLAN_LAYER_BUDGET_EXCEEDED: the merged document compiles to ${result.parts.length} ` +
        "segments (>40 layers); reduce scene count or template density",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* R2 timeline invariants (§7.3, verbatim)                                    */
/* -------------------------------------------------------------------------- */

function computeTimelineGapsOrThrow(
  document: VideoProjectDocument,
): { gaps: ScenePlanResult["gaps"]; hasLongGap: boolean } {
  const scenes = document.scenes; // already sorted ascending, stable

  for (const scene of scenes) {
    if (scene.endMs <= scene.startMs) {
      throw new Error(
        `VI_PLAN_TIMELINE_INVALID: scene "${scene.sceneId}" has endMs (${scene.endMs}) <= ` +
          `startMs (${scene.startMs})`,
      );
    }
  }
  for (let i = 1; i < scenes.length; i += 1) {
    if (scenes[i].startMs < scenes[i - 1].endMs) {
      throw new Error(
        `VI_PLAN_TIMELINE_INVALID: scene "${scenes[i].sceneId}" (startMs ${scenes[i].startMs}) ` +
          `overlaps scene "${scenes[i - 1].sceneId}" (endMs ${scenes[i - 1].endMs})`,
      );
    }
  }
  const maxEndMs = scenes.reduce((max, scene) => Math.max(max, scene.endMs), 0);
  if (maxEndMs > document.format.durationMs) {
    throw new Error(
      `VI_PLAN_TIMELINE_INVALID: the merged document's last scene ends at ${maxEndMs}ms, ` +
        `exceeding format.durationMs (${document.format.durationMs}ms)`,
    );
  }

  const gaps: ScenePlanResult["gaps"] = [];
  if (scenes.length > 0 && scenes[0].startMs > 0) {
    gaps.push({ afterSceneId: null, startMs: 0, endMs: scenes[0].startMs, ms: scenes[0].startMs });
  }
  for (let i = 1; i < scenes.length; i += 1) {
    const gapMs = scenes[i].startMs - scenes[i - 1].endMs;
    if (gapMs > 0) {
      gaps.push({
        afterSceneId: scenes[i - 1].sceneId,
        startMs: scenes[i - 1].endMs,
        endMs: scenes[i].startMs,
        ms: gapMs,
      });
    }
  }
  const last = scenes[scenes.length - 1];
  if (last && last.endMs < document.format.durationMs) {
    gaps.push({
      afterSceneId: last.sceneId,
      startMs: last.endMs,
      endMs: document.format.durationMs,
      ms: document.format.durationMs - last.endMs,
    });
  }

  const hasLongGap = gaps.some(gap => gap.ms > SCENE_PLAN_REPORTABLE_GAP_MS);
  return { gaps, hasLongGap };
}

/* -------------------------------------------------------------------------- */
/* Merge helpers (§7.4, normative)                                           */
/* -------------------------------------------------------------------------- */

function applyPlannedScene(
  scene: Scene,
  planned: ScenePlanSkillOutput["scenes"][number],
  parsedParams: Record<string, unknown>,
): Scene {
  const locked = isTimingLocked(scene);
  return {
    ...scene,
    visual: { kind: "template", templateId: planned.templateId, params: parsedParams },
    startMs: locked ? scene.startMs : planned.startMs,
    endMs: locked ? scene.endMs : planned.endMs,
    motion: planned.motion ? SceneMotionSchema.parse(planned.motion) : scene.motion,
  };
}

function buildNewScene(
  planned: ScenePlanSkillOutput["scenes"][number],
  parsedParams: Record<string, unknown>,
): Scene {
  return {
    sceneId: planned.sceneId,
    startMs: planned.startMs,
    endMs: planned.endMs,
    narration: null,
    narrationAudioAssetId: null,
    visual: { kind: "template", templateId: planned.templateId, params: parsedParams },
    layers: [],
    motion: planned.motion ? SceneMotionSchema.parse(planned.motion) : SceneMotionSchema.parse({}),
    captionCues: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Small pure helpers                                                         */
/* -------------------------------------------------------------------------- */

function deriveAspectRatio(format: VideoProjectDocument["format"]): AspectRatio {
  const ratio = format.width / format.height;
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  return ratio > 1 ? "16:9" : "9:16";
}

function toSkillCatalogFacts(
  resolved: ResolvedCatalogFacts | null,
): ScenePlanSkillInput["catalogFacts"] {
  if (!resolved) return null;
  return {
    productIds: resolved.productIds,
    claims: resolved.claimResolutions.map(claim => ({
      claim: claim.claim,
      source: claim.source,
      status: claim.status,
    })),
    ...(resolved.priceFacts
      ? {
          priceFacts: {
            current: resolved.priceFacts.current,
            original: resolved.priceFacts.original,
            currency: resolved.priceFacts.currency,
          },
        }
      : {}),
  };
}

function buildAvailableTemplates(): ScenePlanSkillInput["availableTemplates"] {
  return MOTION_TEMPLATE_IDS.map(id => {
    const template = MOTION_TEMPLATE_REGISTRY[id];
    const meta = template.meta;
    return {
      id,
      categories: meta.categories,
      minDurationMs: meta.minDurationMs,
      maxDurationMs: meta.maxDurationMs,
      maxItems: meta.maxItems,
      renderCost: meta.renderCost,
      supportedAspectRatios: meta.supportedAspectRatios,
      brandTokens: meta.brandTokens,
      paramsJsonSchema: zodTypeToJsonSchemaHint(template.paramsSchema),
    };
  });
}

/**
 * Best-effort, dependency-free Zod -> JSON-Schema-ish projection. This is a
 * FACT hint for the skill's first-attempt param binding, not a validated
 * contract (the real gate is `template.paramsSchema.parse` at §7's
 * structural-validation step) — an unrecognized Zod node degrades to `{}`
 * rather than throwing.
 */
function zodTypeToJsonSchemaHint(schema: unknown): unknown {
  const def = (schema as { _def?: { typeName?: string } } | undefined)?._def;
  if (!def?.typeName) return {};

  switch (def.typeName) {
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodTypeToJsonSchemaHint(value);
        if (!isOptionalZodNode(value)) required.push(key);
      }
      return required.length > 0
        ? { type: "object", properties, required }
        : { type: "object", properties };
    }
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: (def as { values: string[] }).values };
    case "ZodArray":
      return { type: "array", items: zodTypeToJsonSchemaHint((def as { type: unknown }).type) };
    case "ZodOptional":
    case "ZodDefault":
    case "ZodNullable":
      return zodTypeToJsonSchemaHint((def as { innerType: unknown }).innerType);
    case "ZodUnion":
      return { anyOf: ((def as { options: unknown[] }).options).map(zodTypeToJsonSchemaHint) };
    case "ZodRecord":
      return { type: "object" };
    default:
      return {};
  }
}

function isOptionalZodNode(schema: unknown): boolean {
  const typeName = (schema as { _def?: { typeName?: string } } | undefined)?._def?.typeName;
  return typeName === "ZodOptional" || typeName === "ZodDefault";
}
