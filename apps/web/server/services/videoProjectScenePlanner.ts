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
import type { BrandKit, BrandKitLocks } from "@shared/videoIntelligence/brandKit";
import { markUntrustedCatalogText } from "@shared/videoIntelligence/untrustedCatalogData";

/* -------------------------------------------------------------------------- */
/* 4.1 — ScenePlanSkillInput                                                  */
/* -------------------------------------------------------------------------- */

/** The complete fact set the scene-plan skill receives. Built in TypeScript;
 *  contains no judgment, no template recommendation, and no prompt text. */
export type ScenePlanSkillInput = {
  brief: {
    topic: string | null;
    audience: string | null;
    notes?: string;
    motionStyle?: string;
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
  /** The validated candidate document, exposed for review-first draft flows. */
  document: VideoProjectDocument;
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
  briefNotes?: string | null;
  briefMotionStyle?: string | null;
  productIds: string[];
  brandKit: { id: string; lockedTokens: string[] } | null;
  /**
   * R10 self-healing (Feature 142 §7.7 follow-up / CMD-2 closure): the FULL
   * resolved brand kit (not just the advisory `{id, lockedTokens}` fact sent
   * to the skill above), used ONLY to deterministically re-apply locked
   * tokens onto the skill's output after it returns (`healPlannedScenes`
   * below) — never fed into the skill itself, and never used for creative
   * judgment. Optional/nullable so existing callers/tests that don't pass it
   * keep working with zero self-heal (identical to today's behavior).
   */
  resolvedBrandKit?: BrandKit | null;
  effects: ScenePlanEffects;
}): Promise<ScenePlanResult> {
  const { mode, studioType, briefNotes, briefMotionStyle, productIds, brandKit, resolvedBrandKit, effects } = args;

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

  // Step 3 — layerBudget.used. Before spec 143 §4.9.3, "plannable" and
  // "has zero layers" were the same set (the old predicate REQUIRED
  // `scene.layers.length === 0` to be plannable), so summing over
  // `preserved` only was equivalent to summing over every scene — a
  // plannable scene could never contribute a non-zero layer count. §4.9.3
  // breaks that equivalence: a scene can now be plannable (no narration, no
  // template) while still carrying hand-authored `scene.layers[]` (and
  // caption cues), and those layers/cues are NOT wiped by a re-plan
  // (`applyPlannedScene` only ever replaces `visual`) — they survive
  // regardless of whether this round re-plans that scene's template. The
  // budget FACT sent to the skill must therefore sum over EVERY scene, not
  // just the preserved ones, or a plannable scene's hand-authored layers
  // would silently vanish from the budget the skill is told to respect.
  const used =
    workingDocument.scenes.reduce((sum, scene) => sum + estimateSceneLayerCount(scene, workingDocument), 0) +
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
      ...(briefNotes?.trim() ? { notes: briefNotes.trim().slice(0, 4000) } : {}),
      ...(briefMotionStyle?.trim() ? { motionStyle: briefMotionStyle.trim().slice(0, 80) } : {}),
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

  // R10 self-healing (§7.7 follow-up): the skill only receives locked tokens
  // as ADVISORY facts (`skillInput.brandKit.lockedTokens` above) — if it
  // ignores them, the compiler's `enforceBrandLocks` (`videoProjectCompiler.ts`)
  // is the only backstop, and today that backstop is a compile-time THROW
  // (unrenderable project) rather than a fix. This deterministically
  // corrects the two lock-relevant fields this planner's own output can
  // actually set — `motion.intensity` and `luxury_end_card`'s `ctaText`
  // param (see `enforceBrandLocks`'s doc comment for why these are the only
  // two: colors/fonts/iconStyle/productFidelity are never planner-authored,
  // every template computes them from `ctx.brandKit` itself at compile time)
  // — on ONLY the scenes this round touched (`plannedSceneIds`/
  // `appendedSceneIds`), never on untouched preserved scenes. A fact
  // correction, not a creative judgment — stays in TS per skill-first
  // authoring.
  healPlannedScenes({
    preserved,
    mergedExisting,
    appendedScenes,
    plannedSceneIds,
    locks: resolvedBrandKit?.locks,
  });

  // Rule 5 — scene order is by startMs ascending, stable for equal values
  // (Array#sort is stable in the runtimes this project targets).
  const mergedScenes = [...mergedExisting, ...appendedScenes].sort((a, b) => a.startMs - b.startMs);

  // §4.9.2 (P0, silent-data-loss fix): `applyPlannedScene` above may have
  // rewritten a scene's `startMs`/`endMs` (whenever it was not timing-
  // locked). `layer.startFrame` is scene-RELATIVE and the compiler adds the
  // OWNING scene's `startMs` (`offsetLayerToAbsoluteFrame`), so without this
  // step every layer on a retimed scene would silently slide in ABSOLUTE
  // time even though neither the layer nor its `startFrame` field ever
  // changed. `workingDocument.scenes` (pre-plan) supplies each scene's OLD
  // `startMs`; `mergedScenes` (post-plan, already layer-preserving via the
  // `...scene` spreads above) supplies the NEW timing.
  const rehomedScenes = rehomeLayersForSceneTimingChange(
    workingDocument.scenes,
    mergedScenes,
    workingDocument.format.fps,
  );

  const candidate: VideoProjectDocument = { ...workingDocument, scenes: rehomedScenes };
  const reparsedCandidate = VideoProjectDocumentSchema.safeParse(candidate);
  if (!reparsedCandidate.success) {
    throw new Error(
      `VI_PLAN_PARAMS_INVALID: merged document failed schema validation: ${reparsedCandidate.error.message}`,
    );
  }
  const mergedDocument = reparsedCandidate.data;

  // Step 9 — merged-document gates: timeline invariants, then layer budget.
  const { gaps, hasLongGap } = assertSceneTimelineValid(mergedDocument);
  assertLayerBudgetOrThrow(mergedDocument);

  // Step 10 — the only write.
  const { revision } = await effects.persistDocument(mergedDocument, "scene_plan");

  return {
    document: mergedDocument,
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
/* R10 self-heal — deterministically re-apply locked brand tokens (§7.7)     */
/* -------------------------------------------------------------------------- */

/** `luxury_end_card`'s CTA param key — see `server/remotion/templates/luxury_end_card.ts`.
 *  Duplicated as a literal (not imported) to avoid this pure, DI-only
 *  service reaching into the template registry's param shapes; the template
 *  id/param-key pair is itself a stable, spec-documented convention. */
const LUXURY_END_CARD_TEMPLATE_ID = "luxury_end_card";
const LUXURY_END_CARD_CTA_PARAM = "ctaText";

function sceneCtaText(scene: Scene): string | undefined {
  if (scene.visual.kind !== "template" || scene.visual.templateId !== LUXURY_END_CARD_TEMPLATE_ID) {
    return undefined;
  }
  const value = scene.visual.params[LUXURY_END_CARD_CTA_PARAM];
  return typeof value === "string" ? value : undefined;
}

function healScene(
  scene: Scene,
  canonicalIntensity: Scene["motion"]["intensity"] | undefined,
  canonicalCta: string | undefined,
): Scene {
  let next = scene;
  if (canonicalIntensity !== undefined && next.motion.intensity !== canonicalIntensity) {
    next = { ...next, motion: { ...next.motion, intensity: canonicalIntensity } };
  }
  if (
    canonicalCta !== undefined &&
    next.visual.kind === "template" &&
    next.visual.templateId === LUXURY_END_CARD_TEMPLATE_ID &&
    next.visual.params[LUXURY_END_CARD_CTA_PARAM] !== canonicalCta
  ) {
    next = {
      ...next,
      visual: {
        ...next.visual,
        params: { ...next.visual.params, [LUXURY_END_CARD_CTA_PARAM]: canonicalCta },
      },
    };
  }
  return next;
}

/**
 * Mutates `mergedExisting`/`appendedScenes` IN PLACE (element-by-element
 * reassignment, not array replacement — both arrays stay `const`-bindable at
 * the call site), correcting only the scenes this planning round actually
 * touched (`plannedSceneIds` — appended scenes are always "touched" by
 * definition). `preserved` scenes are read-only anchors for deriving the
 * canonical value and are never themselves rewritten (§7.4 preserves them
 * untouched by design; self-healing must not violate that).
 *
 * Canonical value derivation order: existing preserved scenes first (an
 * already-committed, human-approved precedent), then the newly-planned
 * scenes in document order — the first non-undefined value found wins. No
 * stored `brand_kits` value exists for either token (see
 * `enforceBrandLocks`'s doc comment), so "make everything this round
 * touched agree with each other and with anything already committed" is the
 * most conservative deterministic reading available.
 */
function healPlannedScenes(args: {
  preserved: Scene[];
  mergedExisting: Scene[];
  appendedScenes: Scene[];
  plannedSceneIds: string[];
  locks: BrandKitLocks | undefined;
}): void {
  const { preserved, mergedExisting, appendedScenes, plannedSceneIds, locks } = args;
  if (!locks || (!locks.motionIntensity && !locks.cta)) return;

  const plannedIdSet = new Set(plannedSceneIds);
  const touchedExisting = mergedExisting.filter(scene => plannedIdSet.has(scene.sceneId));
  const anchorOrder: Scene[] = [...preserved, ...touchedExisting, ...appendedScenes];

  let canonicalIntensity: Scene["motion"]["intensity"] | undefined;
  let canonicalCta: string | undefined;
  for (const scene of anchorOrder) {
    if (locks.motionIntensity && canonicalIntensity === undefined) {
      canonicalIntensity = scene.motion.intensity;
    }
    if (locks.cta && canonicalCta === undefined) {
      canonicalCta = sceneCtaText(scene);
    }
    if (
      (canonicalIntensity !== undefined || !locks.motionIntensity) &&
      (canonicalCta !== undefined || !locks.cta)
    ) {
      break;
    }
  }

  if (canonicalIntensity === undefined && canonicalCta === undefined) return;

  for (let i = 0; i < mergedExisting.length; i += 1) {
    const scene = mergedExisting[i];
    if (!plannedIdSet.has(scene.sceneId)) continue;
    mergedExisting[i] = healScene(scene, canonicalIntensity, canonicalCta);
  }
  for (let i = 0; i < appendedScenes.length; i += 1) {
    appendedScenes[i] = healScene(appendedScenes[i], canonicalIntensity, canonicalCta);
  }
}

/* -------------------------------------------------------------------------- */
/* Partitioning + timing lock (§7.4)                                          */
/* -------------------------------------------------------------------------- */

function isTimingLocked(scene: Scene): boolean {
  return scene.narrationAudioAssetId !== null || scene.captionCues.length > 0;
}

/** D2 / spec 143 §4.9.3 (P0, was silently destructive): "empty" for
 *  `fill_empty` purposes means NO NARRATION and NO TEMPLATE — NOT "no
 *  layers". `visual.kind === "layers"` already means "no template" (§4.9.6's
 *  naming trap: it does NOT mean "has layers"), so this predicate no longer
 *  inspects `scene.layers` at all. Before this fix, the moment a user
 *  placed one hand-authored layer on a scene, `scene.layers.length === 0`
 *  went false and that scene silently fell out of `fill_empty` forever —
 *  auto-draft would never plan a visual for it again. A scene that already
 *  has a template (`visual.kind === "template"`) is still excluded here, so
 *  this fix cannot cause an already-templated scene to be unexpectedly
 *  re-planned. */
function isEmptyForFillMode(scene: Scene): boolean {
  return scene.visual.kind === "layers" && (scene.narration === null || scene.narration.trim().length === 0);
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
    if (isEmptyForFillMode(scene)) {
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

/**
 * implementation-progress.md gap #3 (CLOSED): the R2 timeline-invariant gate
 * this planner has always applied to its OWN merged output, now also
 * exported so `routers/videoProjects.ts`'s `saveDocument` (a hand-edit path
 * that never goes through this planner) can reject the exact same class of
 * invalid timeline BEFORE persisting it, instead of only discovering it
 * later at compile/render time. Semantics are UNCHANGED from the planner's
 * own call site (`assertSceneTimelineValid`'s only addition is defensively
 * sorting a COPY of `document.scenes` by `startMs` first — the planner's own
 * merge step already guarantees that order (Rule 5, line ~338 above) so this
 * sort is a no-op there; a hand-edited `saveDocument` payload has no such
 * guarantee, and checking adjacency without sorting first would silently
 * miss an overlap between two scenes that merely appear out of array order).
 * Never tightened beyond the planner's own rules: gaps between scenes
 * (`ScenePlanResult["gaps"]`) remain explicitly legal, exactly as before.
 */
export function assertSceneTimelineValid(
  document: VideoProjectDocument,
): { gaps: ScenePlanResult["gaps"]; hasLongGap: boolean } {
  const scenes = [...document.scenes].sort((a, b) => a.startMs - b.startMs);

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
/* §4.9.2 — re-home layers across a scene-timing change (spec 143)           */
/* -------------------------------------------------------------------------- */

/** Mirrors `videoProjectCompiler.ts`'s private `msToFrames` (rounds to the
 *  nearest frame, never negative). Duplicated as a literal function rather
 *  than imported to keep this planner independent of the compiler's
 *  internals — both copies are one-line and trivially auditable. */
function msToFrames(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

function framesToMs(frames: number, fps: number): number {
  return (frames / fps) * 1000;
}

/**
 * Feature 143 §4.9.2 — re-homes every layer on every scene so its ABSOLUTE
 * start time (and therefore its absolute span) is preserved across a
 * scene-timing change, recomputing `startFrame` (scene-relative) and, when
 * the layer's absolute start now falls inside a DIFFERENT scene's new
 * `[startMs, endMs)` span, moving the layer onto that scene.
 *
 * Layer `startFrame` is scene-RELATIVE; the compiler adds the OWNING
 * scene's `startMs` at compile time (`offsetLayerToAbsoluteFrame`). Any
 * caller that rewrites a scene's `startMs`/`endMs` — this file's own
 * `applyPlannedScene` re-plan, the QA repair applier's boundary-borrow step
 * (`applySceneBoundaryHandler`), and — per the spec — the client's
 * `ScenesPanel` reorder/duplicate/delete paths — MUST run every affected
 * layer through this (or an equivalent re-homing step), or every layer on a
 * retimed scene silently slides in absolute time with no warning and no
 * validation failure (spec 143 §4.9.2, §3.2's "fragile in one direction").
 *
 * `beforeScenes` only needs each scene's `sceneId` + its OLD `startMs`
 * (read-only anchor for computing each layer's OLD absolute position);
 * `afterScenes` is the full scene list AFTER the timing change, with
 * `layers` still holding their PRE-rehome (now-stale) `startFrame` values.
 * A `sceneId` present in `afterScenes` but absent from `beforeScenes` (a
 * newly-appended scene) is treated as unchanged — its own `layers` are
 * always `[]` at creation, so this is a safe no-op fallback, not a silent
 * bug.
 *
 * When a layer's absolute start falls inside NO scene's new span (e.g. the
 * document's last scene was shortened past the layer's start), it stays on
 * its ORIGINAL scene id, clamped to `[0, that scene's new duration)` rather
 * than being dropped — losing track of a layer is worse than a slightly
 * wrong position, and this is the same "leave it, don't destroy it"
 * philosophy as §4.9.1.
 */
export function rehomeLayersForSceneTimingChange(
  beforeScenes: ReadonlyArray<Pick<Scene, "sceneId" | "startMs">>,
  afterScenes: Scene[],
  fps: number,
): Scene[] {
  const oldStartMsBySceneId = new Map(beforeScenes.map(s => [s.sceneId, s.startMs]));
  const sortedAfter = [...afterScenes].sort((a, b) => a.startMs - b.startMs);
  const afterBySceneId = new Map(afterScenes.map(s => [s.sceneId, s]));

  const nextLayersBySceneId = new Map<string, Scene["layers"]>();
  for (const scene of afterScenes) nextLayersBySceneId.set(scene.sceneId, []);

  let anyRehomed = false;

  for (const scene of afterScenes) {
    const oldStartMs = oldStartMsBySceneId.get(scene.sceneId);
    if (oldStartMs === undefined || oldStartMs === scene.startMs) {
      // No timing change recorded for this scene (new scene, or untouched)
      // — layers stay exactly where they are, byte-identical.
      if (scene.layers.length > 0) {
        nextLayersBySceneId.set(scene.sceneId, scene.layers);
      }
      continue;
    }

    for (const layer of scene.layers) {
      anyRehomed = true;
      const absoluteStartMs = oldStartMs + framesToMs(layer.startFrame, fps);
      const owningScene =
        sortedAfter.find(s => absoluteStartMs >= s.startMs && absoluteStartMs < s.endMs) ??
        afterBySceneId.get(scene.sceneId) ??
        scene;
      const relativeMs = Math.max(0, absoluteStartMs - owningScene.startMs);
      const bucket = nextLayersBySceneId.get(owningScene.sceneId) ?? [];
      bucket.push({ ...layer, startFrame: msToFrames(relativeMs, fps) });
      nextLayersBySceneId.set(owningScene.sceneId, bucket);
    }
  }

  if (!anyRehomed) return afterScenes;

  return afterScenes.map(scene => ({
    ...scene,
    layers: nextLayersBySceneId.get(scene.sceneId) ?? [],
  }));
}

/* -------------------------------------------------------------------------- */
/* §4.9.4 — pre-spend layer-budget forecast (spec 143)                       */
/* -------------------------------------------------------------------------- */

export type ForecastableStage =
  | "scene_plan"
  | "narration"
  | "captions"
  | "content"
  | "claims"
  | "motion";

/** Documented Phase-1 estimate for a template scene's average emitted-layer
 *  count, used ONLY by `forecastPostStageLayerCount`'s pre-LLM projection —
 *  the real count depends on which template the skill ends up picking,
 *  which this pure, non-LLM-calling forecast cannot know in advance. Not
 *  derived from telemetry; a conservative mid-range guess consistent with
 *  §4.4's own worked example ("แม่แบบฉาก 18" across a handful of scenes). */
export const AVERAGE_TEMPLATE_LAYER_COUNT_ESTIMATE = 6;

export type LayerBudgetForecast = { currentTotal: number; projectedTotal: number; max: number };

/**
 * Feature 143 §4.9.4 (P0) — pure, non-throwing forecast of the projected
 * TOTAL layer count a document would compile to AFTER running `stage`, so
 * `StageEstimateDialog` can show a "เลเยอร์หลังร่างเสร็จ: ~31/40" figure BEFORE
 * the user spends credits on a stage that could otherwise hard-fail
 * `VI_PLAN_LAYER_BUDGET_EXCEEDED` (or the repair applier's `MAX_TOTAL_LAYERS`
 * check) only AFTER payment (`assertLayerBudgetOrThrow` runs on the merged
 * document, §4.9.4's own problem statement).
 *
 * Only `"scene_plan"` changes the forecast today — it is the only stage in
 * this file able to add/replace a scene's visual template, which is the
 * only lever that moves template-layer count. Every other stage value
 * returns `currentTotal === projectedTotal` (narration/caption/content/
 * claims/motion repair stages never add or remove a `scene.visual` template
 * or a `scene.layers[]` entry).
 *
 * Router wiring (`StageEstimateDialog`'s data source) is explicitly out of
 * scope for this file/round — this only exports the pure computation. See
 * this round's Result Report for the signature the router owner should call.
 */
export function forecastPostStageLayerCount(args: {
  document: VideoProjectDocument;
  stage: ForecastableStage;
  mode?: ScenePlanMode;
}): LayerBudgetForecast {
  const { document, stage, mode = "fill_empty" } = args;

  const currentTotal =
    document.scenes.reduce((sum, scene) => sum + estimateSceneLayerCount(scene, document), 0) +
    countAudioTrackLayers(document);

  if (stage !== "scene_plan") {
    return { currentTotal, projectedTotal: currentTotal, max: MAX_RENDERABLE_LAYERS };
  }

  const { plannable, preserved } = partitionScenes(document, mode);
  const preservedTotal = preserved.reduce(
    (sum, scene) => sum + estimateSceneLayerCount(scene, document),
    0,
  );
  // Every plannable scene is assumed to receive exactly one NEW template at
  // the average estimate above, PLUS whatever it already carries
  // (hand-authored layers + captions, unaffected by scene_plan).
  const plannableOwnLayers = plannable.reduce(
    (sum, scene) =>
      sum +
      scene.layers.length +
      (document.captions.burnIn ? 0 : scene.captionCues.length) +
      AVERAGE_TEMPLATE_LAYER_COUNT_ESTIMATE,
    0,
  );
  const projectedTotal = preservedTotal + plannableOwnLayers + countAudioTrackLayers(document);

  return { currentTotal, projectedTotal, max: MAX_RENDERABLE_LAYERS };
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

/** Exported for the same reuse reason as `buildAvailableTemplates` above —
 *  `videoProjectMotionDirector.ts` needs the identical aspect-ratio fact. */
export function deriveAspectRatio(format: VideoProjectDocument["format"]): AspectRatio {
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
      claim: markUntrustedCatalogText(claim.claim),
      source: markUntrustedCatalogText(claim.source),
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

/** Exported so `videoProjectMotionDirector.ts` (the motion-variant stage)
 *  reuses the SAME "real templates + their real paramsSchema" fact list
 *  rather than re-deriving a second, potentially-drifting copy. */
export function buildAvailableTemplates(): ScenePlanSkillInput["availableTemplates"] {
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
