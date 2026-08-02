/**
 * Feature 142 — section-06: the repair applier + round session.
 *
 * Pure, injected-effects application of stage-scoped repairs to a
 * `VideoProjectDocument`. Three of the six repair stages (`captions`,
 * `scenes`, `motion`) are deterministic arithmetic and make ZERO LLM calls;
 * the other three (`content`, `narration`, `claims`) make exactly ONE
 * `RepairEffects.rewriteForStage` call each — never one call per scene (the
 * economic claim this section locks with a test, section-06 §1.1).
 *
 * Skill-first boundary (`memory/feedback_skill_first_authoring.md`): the
 * skill decides WHETHER a stage needs repair (`review.repairInstructions`);
 * this file decides WHICH document elements to touch, always from
 * deterministic metrics (`computeCaptionCps`, `computeDurationVsNarration`,
 * `computeLayerCounts`) and `ClaimValidationResult` — NEVER by parsing
 * `issue.message` (a recorded defect class in this repo, see
 * `memory/project_shipped_but_undiscoverable.md`-adjacent notes and
 * section-06 §1.3).
 *
 * This module does NO I/O of its own: no DB, no LLM call (that lives in
 * `videoProjectRepairRewriter.ts`), no `Date.now()`, no `Math.random()`. The
 * caller (the round session, or ultimately the router) owns persistence.
 *
 * 🔴 This file MUST NEVER charge credits directly — the rewriter's
 * `RepairEffects` implementation already reports spend through `onUsage`;
 * this file never imports the credit-charging service at all. Locked twice:
 * this comment, and an fs source guard in the rewriter's own test file.
 */
import { VideoProjectDocumentSchema, type VideoProjectDocument, type Scene } from "@shared/videoIntelligence/projectSchemas";
import type {
  AssertNever,
  ForbiddenMediaGenerationEffectMembers,
} from "@shared/videoIntelligence/effectGuards";

import {
  computeCaptionCps,
  computeDurationVsNarration,
  computeLayerCounts,
  computeSafeAreaViolations,
  CAPTION_MAX_COMFORTABLE_CPS,
} from "./videoProjectQualityMetrics";
import type { VideoProjectQualityMetrics } from "./videoProjectQualityMetrics";
import { validateProjectClaims, type ResolvedCatalogFacts, type ClaimValidationResult } from "./validateProjectClaims";
import type { QualityRepairStage, VideoProjectQualityLoopEffects, VideoProjectReview } from "./videoProjectQualityLoop";

/* -------------------------------------------------------------------------- */
/* 4.1 — RepairEffects, the only LLM seam                                     */
/* -------------------------------------------------------------------------- */

/** Stable, parseable address of one editable text slot (section-06 §4.1).
 *  Deterministic — no array-index-only forms that shift when a cue is split. */
export type RepairTargetRef = string;

export type RepairTarget = { id: RepairTargetRef; text: string; maxChars: number };
export type RepairRewrite = { id: string; text: string };

/** The ONLY side-effect seam the applier has. ONE call per stage per round —
 *  never one per scene. `targets` is the full set of text slots the stage is
 *  repairing; the model returns replacements keyed by the SAME ids. Ids the
 *  model omits keep their original text; ids it invents are ignored. */
export type RepairEffects = {
  rewriteForStage(args: {
    stage: Extract<QualityRepairStage, "content" | "narration" | "claims">;
    instruction: string;
    targets: RepairTarget[];
  }): Promise<RepairRewrite[]>;
};

/** Compile-time assertion (unified section-08 §4.1 via the shared helper) —
 *  `pnpm check` fails if a media-generation member is ever added to
 *  `RepairEffects`. Exported alias name kept unchanged — section-08's fs
 *  guard references it by name. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AssertNoMediaGenerationRepairEffectMember = AssertNever<
  ForbiddenMediaGenerationEffectMembers<RepairEffects>
>;

/* -------------------------------------------------------------------------- */
/* Target-ref parsing                                                         */
/* -------------------------------------------------------------------------- */

export type RepairTargetSlot =
  | { kind: "narration" }
  | { kind: "cue"; cueIndex: number }
  | { kind: "layer"; layerId: string }
  | { kind: "param"; paramKey: string };

/** Parses `scene:<sceneId>:narration|cue:<n>|layer:<id>|param:<key>`. Returns
 *  `null` for anything else — the applier ignores ids it cannot address
 *  rather than throwing. */
export function parseRepairTargetRef(
  ref: string,
): { sceneId: string; slot: RepairTargetSlot } | null {
  const parts = ref.split(":");
  if (parts.length < 3 || parts[0] !== "scene") return null;
  const sceneId = parts[1];
  if (!sceneId) return null;
  const kind = parts[2];

  if (kind === "narration" && parts.length === 3) {
    return { sceneId, slot: { kind: "narration" } };
  }
  if (kind === "cue" && parts.length === 4) {
    const cueIndex = Number(parts[3]);
    if (!Number.isInteger(cueIndex) || cueIndex < 0) return null;
    return { sceneId, slot: { kind: "cue", cueIndex } };
  }
  if (kind === "layer" && parts.length === 4 && parts[3]) {
    return { sceneId, slot: { kind: "layer", layerId: parts[3] } };
  }
  if (kind === "param" && parts.length === 4 && parts[3]) {
    return { sceneId, slot: { kind: "param", paramKey: parts[3] } };
  }
  return null;
}

function buildTargetRef(sceneId: string, slot: RepairTargetSlot): RepairTargetRef {
  switch (slot.kind) {
    case "narration":
      return `scene:${sceneId}:narration`;
    case "cue":
      return `scene:${sceneId}:cue:${slot.cueIndex}`;
    case "layer":
      return `scene:${sceneId}:layer:${slot.layerId}`;
    case "param":
      return `scene:${sceneId}:param:${slot.paramKey}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Documented Phase-1 constants (zero-cost handlers)                          */
/* -------------------------------------------------------------------------- */

/** A caption cue split may never leave either half shorter than this. */
const MIN_CUE_DURATION_MS = 500;
/** Bounds recursive cue splitting — a cue this many splits deep is left as-is
 *  rather than fragmented indefinitely. */
const MAX_CUE_SPLIT_DEPTH = 3;
/** A scene boundary move may never leave either neighbouring scene shorter
 *  than this. */
const MIN_SCENE_DURATION_MS = 1000;
/** A scene at or above this layer count is "cluttered" for the motion
 *  handler's targeting, independent of any timing-stress flag. */
const MOTION_CLUTTER_LAYER_THRESHOLD = 8;
/** Text-param cap for template-visual scenes — the schema itself leaves
 *  `params` values untyped, so this is a documented Phase-1 ceiling sent to
 *  the model as a fact, not a schema-enforced bound. */
const TEMPLATE_PARAM_MAX_CHARS = 2000;
/** `SceneSchema.narration` cap (`projectSchemas.ts`). */
const NARRATION_MAX_CHARS = 4000;
/** `CaptionCueSchema.text` cap. */
const CUE_TEXT_MAX_CHARS = 500;
/** `RemotionTextLayerSchema.content` cap (`layerTemplateSchemas.ts`). */
const LAYER_CONTENT_MAX_CHARS = 2000;

/* -------------------------------------------------------------------------- */
/* Stage order + outcome vocabulary                                          */
/* -------------------------------------------------------------------------- */

/** Cheap stages first: a free arithmetic fix may resolve an issue that would
 *  otherwise be paid for by a text rewrite in the same round. */
export const REPAIR_STAGE_ORDER: readonly QualityRepairStage[] = [
  "captions",
  "scenes",
  "motion",
  "content",
  "narration",
  "claims",
] as const;

type HandlerOutcome = {
  document: VideoProjectDocument;
  targetCount: number;
  changed: boolean;
};

function updateScenes(
  document: VideoProjectDocument,
  updater: (scene: Scene) => Scene,
  predicate: (scene: Scene) => boolean,
): VideoProjectDocument {
  return {
    ...document,
    scenes: document.scenes.map(scene => (predicate(scene) ? updater(scene) : scene)),
  };
}

/* -------------------------------------------------------------------------- */
/* 6.1 — captions handler (zero cost)                                        */
/* -------------------------------------------------------------------------- */

function cueCharsPerSecond(text: string, startMs: number, endMs: number): number {
  const durationSec = Math.max(0, endMs - startMs) / 1000;
  return durationSec > 0 ? text.length / durationSec : text.length;
}

/** Finds the whitespace boundary nearest the character midpoint. Returns
 *  `null` when the text has no interior boundary (a single word). */
function findMidpointSplit(text: string): number | null {
  const mid = Math.floor(text.length / 2);
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " ") continue;
    const distance = Math.abs(i - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex >= 0 ? bestIndex : null;
}

type Cue = Scene["captionCues"][number];

function splitCueOnce(cue: Cue): [Cue, Cue] | null {
  const boundary = findMidpointSplit(cue.text);
  if (boundary === null) return null;

  const firstText = cue.text.slice(0, boundary).trim();
  const secondText = cue.text.slice(boundary + 1).trim();
  if (!firstText || !secondText) return null;

  const totalMs = Math.max(1, cue.endMs - cue.startMs);
  const splitRatio = boundary / cue.text.length;
  const splitOffsetMs = Math.round(totalMs * splitRatio);

  const firstEndMs = cue.startMs + splitOffsetMs;
  if (firstEndMs - cue.startMs < MIN_CUE_DURATION_MS) return null;
  if (cue.endMs - firstEndMs < MIN_CUE_DURATION_MS) return null;

  return [
    { startMs: cue.startMs, endMs: firstEndMs, text: firstText },
    { startMs: firstEndMs, endMs: cue.endMs, text: secondText },
  ];
}

function splitCueRecursively(cue: Cue, depth: number): Cue[] {
  if (depth >= MAX_CUE_SPLIT_DEPTH) return [cue];
  if (cueCharsPerSecond(cue.text, cue.startMs, cue.endMs) <= CAPTION_MAX_COMFORTABLE_CPS) return [cue];

  const split = splitCueOnce(cue);
  if (!split) return [cue];

  const [first, second] = split;
  return [...splitCueRecursively(first, depth + 1), ...splitCueRecursively(second, depth + 1)];
}

function applyCaptionsHandler(document: VideoProjectDocument): HandlerOutcome {
  let targetCount = 0;
  let changed = false;

  const nextScenes = document.scenes.map(scene => {
    const flaggedCues = scene.captionCues.filter(
      cue => cueCharsPerSecond(cue.text, cue.startMs, cue.endMs) > CAPTION_MAX_COMFORTABLE_CPS,
    );
    targetCount += flaggedCues.length;
    if (flaggedCues.length === 0) return scene;

    const nextCues = scene.captionCues.flatMap(cue => splitCueRecursively(cue, 0));
    if (nextCues.length !== scene.captionCues.length) changed = true;
    else {
      for (let i = 0; i < nextCues.length; i++) {
        if (nextCues[i].text !== scene.captionCues[i].text) {
          changed = true;
          break;
        }
      }
    }
    return { ...scene, captionCues: nextCues };
  });

  return { document: { ...document, scenes: nextScenes }, targetCount, changed };
}

/* -------------------------------------------------------------------------- */
/* 6.2 — scenes handler (zero cost)                                          */
/* -------------------------------------------------------------------------- */

function retimeCuesProportionally(cues: Cue[], oldStartMs: number, oldEndMs: number, newStartMs: number, newEndMs: number): Cue[] {
  const oldDuration = Math.max(1, oldEndMs - oldStartMs);
  const newDuration = Math.max(1, newEndMs - newStartMs);
  const scale = newDuration / oldDuration;
  return cues.map(cue => {
    const relativeStart = cue.startMs - oldStartMs;
    const relativeEnd = cue.endMs - oldStartMs;
    return {
      ...cue,
      startMs: Math.max(0, Math.round(relativeStart * scale)),
      endMs: Math.max(1, Math.round(relativeEnd * scale)),
    };
  });
}

function applySceneBoundaryHandler(document: VideoProjectDocument): HandlerOutcome {
  const durationMetrics = computeDurationVsNarration(document);
  const flaggedIds = new Set(durationMetrics.filter(m => m.flagged).map(m => m.sceneId));
  const targetCount = flaggedIds.size;
  if (targetCount === 0) return { document, targetCount: 0, changed: false };

  const scenes = document.scenes.map(scene => ({ ...scene }));
  const metricsBySceneId = new Map(durationMetrics.map(m => [m.sceneId, m]));
  let changed = false;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const metric = metricsBySceneId.get(scene.sceneId);
    if (!metric || !metric.flagged || metric.expectedNarrationMs === null) continue;

    const durationMs = scene.endMs - scene.startMs;
    const needsMoreTime = durationMs < metric.expectedNarrationMs;
    const deltaMs = Math.abs(metric.expectedNarrationMs - durationMs);

    if (needsMoreTime) {
      // Try borrowing from the NEXT scene's startMs (this scene's shared
      // endMs), else the PREVIOUS scene's endMs (this scene's shared
      // startMs). The last scene's endMs and the first scene's startMs are
      // never moved (invariant by construction — only interior loop indices
      // touch a shared boundary).
      const next = i < scenes.length - 1 ? scenes[i + 1] : null;
      const prev = i > 0 ? scenes[i - 1] : null;
      const nextSlack = next ? next.endMs - next.startMs - MIN_SCENE_DURATION_MS : 0;
      const prevSlack = prev ? prev.endMs - prev.startMs - MIN_SCENE_DURATION_MS : 0;

      if (next && nextSlack > 0) {
        const moveMs = Math.min(deltaMs, nextSlack);
        const oldEnd = scene.endMs;
        scene.endMs += moveMs;
        next.startMs += moveMs;
        scene.captionCues = retimeCuesProportionally(scene.captionCues, scene.startMs, oldEnd, scene.startMs, scene.endMs);
        changed = true;
      } else if (prev && prevSlack > 0) {
        const moveMs = Math.min(deltaMs, prevSlack);
        const oldStart = scene.startMs;
        scene.startMs -= moveMs;
        prev.endMs -= moveMs;
        scene.captionCues = retimeCuesProportionally(scene.captionCues, oldStart, scene.endMs, scene.startMs, scene.endMs);
        changed = true;
      }
      // No slack anywhere: scene is left untouched (skipped, not force-fit).
    } else {
      // Too loose — shrink by giving time to the NEXT scene if this is not
      // the last scene (shrinking the last scene would move the document's
      // own final endMs, which must stay invariant).
      const next = i < scenes.length - 1 ? scenes[i + 1] : null;
      if (next) {
        const shrinkable = durationMs - MIN_SCENE_DURATION_MS;
        const moveMs = Math.max(0, Math.min(deltaMs, shrinkable));
        if (moveMs > 0) {
          const oldEnd = scene.endMs;
          scene.endMs -= moveMs;
          next.startMs -= moveMs;
          scene.captionCues = retimeCuesProportionally(scene.captionCues, scene.startMs, oldEnd, scene.startMs, scene.endMs);
          changed = true;
        }
      }
    }
  }

  return { document: { ...document, scenes }, targetCount, changed };
}

/* -------------------------------------------------------------------------- */
/* 6.3 — motion handler (zero cost)                                          */
/* -------------------------------------------------------------------------- */

const MOTION_INTENSITY_STEP_DOWN: Record<Scene["motion"]["intensity"], Scene["motion"]["intensity"]> = {
  high: "medium",
  medium: "low",
  low: "low",
};

function applyMotionHandler(document: VideoProjectDocument): HandlerOutcome {
  const durationMetrics = computeDurationVsNarration(document);
  const timingFlagged = new Set(durationMetrics.filter(m => m.flagged).map(m => m.sceneId));
  const layerCounts = computeLayerCounts(document);
  const clutterFlagged = new Set(
    layerCounts.perScene.filter(s => s.layerCount > MOTION_CLUTTER_LAYER_THRESHOLD).map(s => s.sceneId),
  );

  const targetIds = new Set<string>([...timingFlagged, ...clutterFlagged]);
  const targetCount = targetIds.size;
  if (targetCount === 0) return { document, targetCount: 0, changed: false };

  let changed = false;
  const nextScenes = document.scenes.map(scene => {
    if (!targetIds.has(scene.sceneId)) return scene;
    const nextIntensity = MOTION_INTENSITY_STEP_DOWN[scene.motion.intensity];
    const nextCamera = scene.motion.camera !== "static" ? "static" : scene.motion.camera;
    if (nextIntensity === scene.motion.intensity && nextCamera === scene.motion.camera) return scene;
    changed = true;
    return { ...scene, motion: { intensity: nextIntensity, camera: nextCamera } };
  });

  return { document: { ...document, scenes: nextScenes }, targetCount, changed };
}

/* -------------------------------------------------------------------------- */
/* 6.4 — narration / content / claims handlers (1 LLM call each)             */
/* -------------------------------------------------------------------------- */

function buildNarrationTargets(document: VideoProjectDocument): RepairTarget[] {
  const flaggedIds = new Set(
    computeDurationVsNarration(document).filter(m => m.flagged).map(m => m.sceneId),
  );
  const targets: RepairTarget[] = [];
  for (const scene of document.scenes) {
    if (!flaggedIds.has(scene.sceneId)) continue;
    if (scene.narration === null || scene.narration.trim().length === 0) continue;
    targets.push({
      id: buildTargetRef(scene.sceneId, { kind: "narration" }),
      text: scene.narration,
      maxChars: NARRATION_MAX_CHARS,
    });
  }
  return targets;
}

function buildContentTargets(document: VideoProjectDocument): RepairTarget[] {
  const targets: RepairTarget[] = [];
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === "text") {
        targets.push({
          id: buildTargetRef(scene.sceneId, { kind: "layer", layerId: layer.id }),
          text: layer.content,
          maxChars: LAYER_CONTENT_MAX_CHARS,
        });
      }
    }
    if (scene.visual.kind === "template") {
      for (const [key, value] of Object.entries(scene.visual.params)) {
        if (typeof value === "string" && value.length > 0) {
          targets.push({
            id: buildTargetRef(scene.sceneId, { kind: "param", paramKey: key }),
            text: value,
            maxChars: TEMPLATE_PARAM_MAX_CHARS,
          });
        }
      }
    }
  }
  return targets;
}

/** Finds the slot (narration / cue / text-layer) whose CURRENT text exactly
 *  matches `statement`, mirroring `validateProjectClaims.ts`'s
 *  `extractStatements` search order (narration, then captions, then text
 *  layers). Returns `null` when no slot in this scene currently holds it. */
function findSlotForStatement(scene: Scene, statement: string): { ref: RepairTargetRef; maxChars: number } | null {
  const normalized = statement.trim();
  if (scene.narration !== null && scene.narration.trim() === normalized) {
    return { ref: buildTargetRef(scene.sceneId, { kind: "narration" }), maxChars: NARRATION_MAX_CHARS };
  }
  const cueIndex = scene.captionCues.findIndex(cue => cue.text.trim() === normalized);
  if (cueIndex >= 0) {
    return { ref: buildTargetRef(scene.sceneId, { kind: "cue", cueIndex }), maxChars: CUE_TEXT_MAX_CHARS };
  }
  const layer = scene.layers.find(l => l.type === "text" && l.content.trim() === normalized);
  if (layer) {
    return { ref: buildTargetRef(scene.sceneId, { kind: "layer", layerId: layer.id }), maxChars: LAYER_CONTENT_MAX_CHARS };
  }
  return null;
}

function buildClaimsTargets(
  document: VideoProjectDocument,
  claimValidation: ClaimValidationResult,
): RepairTarget[] {
  const prohibitedClaimTexts = new Set(claimValidation.prohibitedClaims.map(c => c.claim));
  const candidates: Array<{ sceneId: string; statement: string }> = [
    ...claimValidation.unmappedStatements,
    ...claimValidation.mappedClaims
      .filter(m => prohibitedClaimTexts.has(m.claim))
      .map(m => ({ sceneId: m.sceneId, statement: m.statement })),
  ];

  const scenesById = new Map(document.scenes.map(scene => [scene.sceneId, scene]));
  const targets: RepairTarget[] = [];
  const seenRefs = new Set<string>();

  for (const candidate of candidates) {
    const scene = scenesById.get(candidate.sceneId);
    if (!scene) continue;
    const slot = findSlotForStatement(scene, candidate.statement);
    if (!slot || seenRefs.has(slot.ref)) continue;
    seenRefs.add(slot.ref);
    targets.push({ id: slot.ref, text: candidate.statement, maxChars: slot.maxChars });
  }

  return targets;
}

function applyRewritesToDocument(
  document: VideoProjectDocument,
  targets: RepairTarget[],
  rewriteById: Map<string, string>,
): { document: VideoProjectDocument; changed: boolean } {
  let working = document;
  let changed = false;

  for (const target of targets) {
    const newText = rewriteById.get(target.id);
    // Ids the model omits keep their original text (§4.1) — a no-op, not a
    // removal.
    if (newText === undefined || newText === target.text) continue;

    const parsed = parseRepairTargetRef(target.id);
    if (!parsed) continue;
    const { sceneId, slot } = parsed;

    working = updateScenes(
      working,
      scene => {
        if (slot.kind === "narration") return { ...scene, narration: newText };
        if (slot.kind === "cue") {
          return {
            ...scene,
            captionCues: scene.captionCues.map((cue, idx) => (idx === slot.cueIndex ? { ...cue, text: newText } : cue)),
          };
        }
        if (slot.kind === "layer") {
          return {
            ...scene,
            layers: scene.layers.map(layer =>
              layer.id === slot.layerId && layer.type === "text" ? { ...layer, content: newText } : layer,
            ),
          };
        }
        // slot.kind === "param"
        if (scene.visual.kind !== "template") return scene;
        return { ...scene, visual: { ...scene.visual, params: { ...scene.visual.params, [slot.paramKey]: newText } } };
      },
      scene => scene.sceneId === sceneId,
    );
    changed = true;
  }

  return { document: working, changed };
}

async function applyLlmBackedHandler(args: {
  stage: Extract<QualityRepairStage, "content" | "narration" | "claims">;
  document: VideoProjectDocument;
  instruction: string;
  resolvedCatalog: ResolvedCatalogFacts | null;
  effects: RepairEffects;
}): Promise<HandlerOutcome> {
  const { stage, document, instruction, resolvedCatalog, effects } = args;

  const targets =
    stage === "narration"
      ? buildNarrationTargets(document)
      : stage === "content"
        ? buildContentTargets(document)
        : buildClaimsTargets(document, validateProjectClaims(document, resolvedCatalog));

  if (targets.length === 0) {
    return { document, targetCount: 0, changed: false };
  }

  // ONE call for the whole stage — never one per scene (§1.1, the economic
  // claim this section locks with a test).
  const rewrites = await effects.rewriteForStage({ stage, instruction, targets });
  const rewriteById = new Map(rewrites.map(r => [r.id, r.text]));

  const { document: nextDocument, changed } = applyRewritesToDocument(document, targets, rewriteById);
  return { document: nextDocument, targetCount: targets.length, changed };
}

/* -------------------------------------------------------------------------- */
/* 4.2 — applyRepairs, the pure batch entry point                            */
/* -------------------------------------------------------------------------- */

async function runHandlerForStage(
  stage: QualityRepairStage,
  document: VideoProjectDocument,
  instruction: string,
  resolvedCatalog: ResolvedCatalogFacts | null,
  effects: RepairEffects,
): Promise<HandlerOutcome> {
  switch (stage) {
    case "captions":
      return applyCaptionsHandler(document);
    case "scenes":
      return applySceneBoundaryHandler(document);
    case "motion":
      return applyMotionHandler(document);
    case "content":
    case "narration":
    case "claims":
      return applyLlmBackedHandler({ stage, document, instruction, resolvedCatalog, effects });
  }
}

/** After a `claims` repair, `document.claims` may only shrink or stay
 *  identical vs. the pre-handler document — never gain an entry. Defense in
 *  depth: structurally, this handler never writes `document.claims` (it only
 *  edits narration/caption/layer TEXT), so this should always hold; the
 *  check exists so a future change to the handler can never silently violate
 *  it without a test catching it. */
function claimsRegistryWorsened(before: VideoProjectDocument, after: VideoProjectDocument): boolean {
  return after.claims.length > before.claims.length;
}

/** Rollback gate shared by every handler (§6.6): a prohibited-claim count or
 *  unmapped-statement count that increases, or `blocksFinalRender` flipping
 *  false -> true, reverts the WHOLE stage — never a partial edit. */
function claimSafetyWorsened(before: ClaimValidationResult, after: ClaimValidationResult): boolean {
  if (after.prohibitedClaims.length > before.prohibitedClaims.length) return true;
  if (after.unmappedStatements.length > before.unmappedStatements.length) return true;
  if (!before.blocksFinalRender && after.blocksFinalRender) return true;
  return false;
}

export type ApplyRepairsResult = {
  document: VideoProjectDocument;
  applied: QualityRepairStage[];
  skipped: QualityRepairStage[];
  rolledBack: QualityRepairStage[];
  notes: Array<{ stage: QualityRepairStage; targetCount: number; reason?: string }>;
};

/**
 * Apply stage-scoped repair instructions to `args.document`. Pure
 * transformation — the caller owns persistence. Stage order is FIXED
 * (`REPAIR_STAGE_ORDER`) so the same review always yields the same document.
 * After EVERY handler the result is re-parsed against
 * `VideoProjectDocumentSchema` and re-validated for claims; a handler that
 * produces an invalid document, or that worsens `blocksFinalRender` (or the
 * claim/statement counts feeding it), is rolled back to the pre-handler
 * document and reported in `rolledBack`.
 */
export async function applyRepairs(args: {
  document: VideoProjectDocument;
  review: VideoProjectReview;
  stages?: QualityRepairStage[];
  resolvedCatalog: ResolvedCatalogFacts | null;
  effects: RepairEffects;
  recomputeMetrics: (doc: VideoProjectDocument) => VideoProjectQualityMetrics;
}): Promise<ApplyRepairsResult> {
  const instructionByStage = new Map(
    (args.review.repairInstructions ?? []).map(entry => [entry.stage, entry.instruction]),
  );
  const requestedStages = new Set(args.stages ?? Array.from(instructionByStage.keys()));

  let workingDocument = args.document;
  const applied: QualityRepairStage[] = [];
  const skipped: QualityRepairStage[] = [];
  const rolledBack: QualityRepairStage[] = [];
  const notes: ApplyRepairsResult["notes"] = [];

  for (const stage of REPAIR_STAGE_ORDER) {
    if (!requestedStages.has(stage)) continue;

    const instruction = instructionByStage.get(stage);
    if (instruction === undefined) {
      skipped.push(stage);
      notes.push({ stage, targetCount: 0, reason: "no repairInstruction for this stage" });
      continue;
    }

    const before = workingDocument;
    const outcome = await runHandlerForStage(stage, before, instruction, args.resolvedCatalog, args.effects);

    if (outcome.targetCount === 0) {
      skipped.push(stage);
      notes.push({ stage, targetCount: 0, reason: "no deterministic target found" });
      continue;
    }
    if (!outcome.changed) {
      skipped.push(stage);
      notes.push({ stage, targetCount: outcome.targetCount, reason: "no edit produced" });
      continue;
    }

    const parsed = VideoProjectDocumentSchema.safeParse(outcome.document);
    if (!parsed.success) {
      rolledBack.push(stage);
      notes.push({ stage, targetCount: outcome.targetCount, reason: "failed schema re-parse" });
      continue;
    }
    const candidateDocument = parsed.data;

    if (stage === "claims" && claimsRegistryWorsened(before, candidateDocument)) {
      rolledBack.push(stage);
      notes.push({ stage, targetCount: outcome.targetCount, reason: "claims registry grew" });
      continue;
    }

    const beforeClaimValidation = validateProjectClaims(before, args.resolvedCatalog);
    const afterClaimValidation = validateProjectClaims(candidateDocument, args.resolvedCatalog);
    if (claimSafetyWorsened(beforeClaimValidation, afterClaimValidation)) {
      rolledBack.push(stage);
      notes.push({ stage, targetCount: outcome.targetCount, reason: "worsened claim/compliance safety" });
      continue;
    }

    workingDocument = candidateDocument;
    applied.push(stage);
    notes.push({ stage, targetCount: outcome.targetCount });
    // Recompute after each successfully-applied handler so a subsequent
    // handler (and ultimately the caller's re-review) sees fresh facts.
    args.recomputeMetrics(workingDocument);
  }

  return { document: workingDocument, applied, skipped, rolledBack, notes };
}

/* -------------------------------------------------------------------------- */
/* 4.3 — createRepairRoundSession                                            */
/* -------------------------------------------------------------------------- */

export function createRepairRoundSession(args: {
  document: VideoProjectDocument;
  baseRevision: number;
  resolvedCatalog: ResolvedCatalogFacts | null;
  effects: RepairEffects;
  reviewFor: () => VideoProjectReview;
  persistDocument: (doc: VideoProjectDocument, baseRevision: number) => Promise<{ revision: number }>;
  renderCostFor: (doc: VideoProjectDocument) => VideoProjectQualityMetrics["renderCost"];
}): {
  repairStage: VideoProjectQualityLoopEffects["repairStage"];
  recomputeMetrics: VideoProjectQualityLoopEffects["recomputeMetrics"];
  snapshot(): {
    document: VideoProjectDocument;
    revision: number;
    roundsPersisted: number;
    applied: QualityRepairStage[];
    skipped: QualityRepairStage[];
    rolledBack: QualityRepairStage[];
  };
} {
  let workingDocument = args.document;
  let revision = args.baseRevision;
  let roundsPersisted = 0;
  let dirty = false;

  const appliedAcc: QualityRepairStage[] = [];
  const skippedAcc: QualityRepairStage[] = [];
  const rolledBackAcc: QualityRepairStage[] = [];

  const repairStage: VideoProjectQualityLoopEffects["repairStage"] = async (stage, instruction) => {
    const review = args.reviewFor();
    const singleStageReview: VideoProjectReview = {
      ...review,
      repairInstructions: [{ stage, instruction }],
    };

    const result = await applyRepairs({
      document: workingDocument,
      review: singleStageReview,
      stages: [stage],
      resolvedCatalog: args.resolvedCatalog,
      effects: args.effects,
      recomputeMetrics: doc => computeMetricsSnapshot(doc, args.resolvedCatalog, args.renderCostFor),
    });

    workingDocument = result.document;
    appliedAcc.push(...result.applied);
    skippedAcc.push(...result.skipped);
    rolledBackAcc.push(...result.rolledBack);
    if (result.applied.length > 0) dirty = true;
  };

  const recomputeMetrics: VideoProjectQualityLoopEffects["recomputeMetrics"] = async () => {
    // The ROUND BOUNDARY: persists ONCE (reason "quality_repair"), bumps the
    // revision, and is a no-op write when nothing was applied this round.
    if (dirty) {
      const persisted = await args.persistDocument(workingDocument, revision);
      revision = persisted.revision;
      roundsPersisted += 1;
      dirty = false;
    }
    return computeMetricsSnapshot(workingDocument, args.resolvedCatalog, args.renderCostFor);
  };

  return {
    repairStage,
    recomputeMetrics,
    snapshot: () => ({
      document: workingDocument,
      revision,
      roundsPersisted,
      applied: [...appliedAcc],
      skipped: [...skippedAcc],
      rolledBack: [...rolledBackAcc],
    }),
  };
}

function computeMetricsSnapshot(
  document: VideoProjectDocument,
  resolvedCatalog: ResolvedCatalogFacts | null,
  renderCostFor: (doc: VideoProjectDocument) => VideoProjectQualityMetrics["renderCost"],
): VideoProjectQualityMetrics {
  const claimValidation = validateProjectClaims(document, resolvedCatalog);
  return {
    sceneDurations: computeDurationVsNarration(document),
    captionCps: computeCaptionCps(document),
    layerCounts: computeLayerCounts(document),
    safeAreaViolations: computeSafeAreaViolations(document),
    claimCoverage: {
      coverage: claimValidation.coverage,
      mappedCount: claimValidation.mappedClaims.length,
      unmappedCount: claimValidation.unmappedStatements.length,
      prohibitedCount: claimValidation.prohibitedClaims.length,
    },
    renderCost: renderCostFor(document),
  };
}

/* -------------------------------------------------------------------------- */
/* 4.4 — the revision guard                                                   */
/* -------------------------------------------------------------------------- */

/** Throws when the review being applied judged a document revision that is
 *  no longer current. Evaluated ONCE, at job start, against the stored
 *  ledger review — closes both a BullMQ redelivery of an already-completed
 *  repair job and a human edit between review and repair. */
export function assertReviewRevisionCurrent(args: { reviewedRevision: number; currentRevision: number }): void {
  if (args.reviewedRevision !== args.currentRevision) {
    throw new Error(
      `VI_REPAIR_STALE_REVIEW: the stored review judged revision ${args.reviewedRevision}, ` +
        `but the document is now at revision ${args.currentRevision} (redelivery or a concurrent edit)`,
    );
  }
}
