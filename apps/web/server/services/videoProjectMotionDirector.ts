/**
 * Motion stage — multi-variant picker (follow-on to Feature 133/142's
 * scene planner). `video-project-scene-plan` commits ONE motion template
 * choice per scene straight onto `scene.visual`/`scene.motion`.
 * `video-project-motion-director` (this file's skill call) instead proposes
 * 2-3 REAL alternatives per scene into `scene.motionCandidates` — a
 * side-list this planner NEVER writes `scene.visual`/`scene.motion` from.
 * Applying a candidate is a SEPARATE, cheap, non-LLM step
 * (`routers/videoProjects.ts`'s `selectMotionCandidate` mutation), which is
 * what makes generating variants non-destructive by construction: it can
 * never clobber a scene's already-applied, possibly hand-edited motion.
 *
 * Skill-first boundary (`memory/feedback_skill_first_authoring.md`): this
 * file supplies FACTS only (`availableTemplates`, `variantsPerScene`,
 * `scenes`, `brandKit`) and enforces structural INVARIANTS (template
 * exists, params valid for EVERY candidate). It never picks a template,
 * ranks one, or embeds a variation heuristic — that judgment lives entirely
 * in `skills/video-project-motion-director/skill.md`.
 *
 * Reuse-first: `buildAvailableTemplates`/`deriveAspectRatio` are the exact
 * same exported helpers `videoProjectScenePlanner.ts` uses for its own
 * `scene_plan` skill input — never a second, drifting copy of the template
 * fact list.
 */
import {
  VideoProjectDocumentSchema,
  MotionCandidateSchema,
  SceneMotionSchema,
  type Scene,
  type MotionCandidate,
  type VideoProjectDocument,
} from "@shared/videoIntelligence/projectSchemas";
import type { AspectRatio } from "@shared/videoIntelligence/motionTemplates";
import type {
  AssertNever,
  ForbiddenMediaGenerationEffectMembers,
} from "@shared/videoIntelligence/effectGuards";

import { MOTION_TEMPLATE_REGISTRY, type MotionTemplate } from "../remotion/templates";
import {
  buildAvailableTemplates,
  deriveAspectRatio,
  type ScenePlanSkillInput,
} from "./videoProjectScenePlanner";

/* -------------------------------------------------------------------------- */
/* Skill input/output                                                        */
/* -------------------------------------------------------------------------- */

/** How many candidates the skill must propose per scene. `min`/`max` are
 *  both caller-controlled (never hardcoded here) so a future UI affordance
 *  can request e.g. exactly 2 without a code change. */
export type MotionVariantCount = { min: number; max: number };

export type MotionDirectorSkillInput = {
  brief: ScenePlanSkillInput["brief"];
  format: ScenePlanSkillInput["format"];
  aspectRatio: AspectRatio;
  availableTemplates: ScenePlanSkillInput["availableTemplates"];
  variantsPerScene: MotionVariantCount;
  scenes: Array<{
    sceneId: string;
    startMs: number;
    endMs: number;
    narration: string | null;
    captionText: string[];
    /** The template already committed to this scene's `visual`, or `null`
     *  when the scene has no template-kind visual yet. Advisory only — the
     *  skill is asked (not forced) to differ from it. */
    currentTemplateId: string | null;
  }>;
  brandKit: { id: string; lockedTokens: string[] } | null;
};

export type MotionDirectorSkillOutput = {
  scenes: Array<{
    sceneId: string;
    candidates: Array<{
      templateId: string;
      templateParams: Record<string, unknown>;
      motion: { intensity: "low" | "medium" | "high"; camera: string };
      label: string;
      rationale: string;
    }>;
  }>;
  summary: string;
};

/* -------------------------------------------------------------------------- */
/* Effects seam (mirrors ScenePlanEffects)                                   */
/* -------------------------------------------------------------------------- */

export type MotionDirectorEffects = {
  runMotionDirectorSkill(input: MotionDirectorSkillInput): Promise<MotionDirectorSkillOutput>;
  /** Persists the document with the new `motionCandidates` merged in.
   *  Called AT MOST ONCE, after every candidate has been structurally
   *  validated. */
  persistDocument(doc: VideoProjectDocument, reason: string): Promise<{ revision: number }>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AssertMotionDirectorHasNoMediaGeneration = AssertNever<
  ForbiddenMediaGenerationEffectMembers<MotionDirectorEffects>
>;

/* -------------------------------------------------------------------------- */
/* Planner entry point                                                       */
/* -------------------------------------------------------------------------- */

export type MotionVariantMode = "replace" | "fill_empty";

export type MotionVariantResult = {
  revision: number;
  /** Scenes that received a fresh set of candidates this round. */
  proposedSceneIds: string[];
  /** `fill_empty`: scenes left alone because the user already picked a
   *  candidate for them (`selectedMotionCandidateId !== null`). */
  skippedSceneIds: string[];
  /** Scenes the skill was asked about but for which EVERY proposed
   *  candidate failed structural validation — candidates are dropped, not
   *  repaired (spec instruction), so these scenes simply keep whatever
   *  candidates (possibly none) they already had. */
  rejectedSceneIds: string[];
  summary: string;
};

/** Mirrors `videoProjectScenePlanner.ts`'s `DRY_COMPILE_PLACEHOLDER_URL`
 *  naming — unused here (this planner never dry-compiles; it only validates
 *  each candidate's params against its own template's Zod schema, which
 *  needs no asset resolution). Kept as a documented non-import to avoid an
 *  unused-dependency false trail. */

/**
 * Proposes motion-template variants for a batch of scenes. PURE apart from
 * `effects`: every candidate the skill returns is validated (template
 * exists, params satisfy that template's own Zod schema) BEFORE any merge;
 * an individual invalid candidate is DROPPED (never persisted, never
 * "repaired" into something the skill didn't actually say) rather than
 * failing the whole call — a scene that ends up with zero valid candidates
 * is reported in `rejectedSceneIds` and keeps its prior candidate list
 * untouched. Never writes `scene.visual`/`scene.motion` — only
 * `scene.motionCandidates`, so this call can never clobber a scene's
 * already-applied motion.
 */
export async function planMotionVariants(args: {
  document: VideoProjectDocument;
  mode: MotionVariantMode;
  studioType: string;
  variantsPerScene: MotionVariantCount;
  brandKit: { id: string; lockedTokens: string[] } | null;
  effects: MotionDirectorEffects;
  /** The document's current revision — used ONLY as the return value when
   *  every scene is skipped (no skill call, no write) so the caller always
   *  gets a real revision number back. */
  baseRevision: number;
}): Promise<MotionVariantResult> {
  const { mode, studioType, variantsPerScene, brandKit, effects } = args;

  const parsedIncoming = VideoProjectDocumentSchema.safeParse(args.document);
  if (!parsedIncoming.success) {
    throw new Error(`VI_DOCUMENT_INVALID: ${parsedIncoming.error.message}`);
  }
  const workingDocument: VideoProjectDocument = JSON.parse(JSON.stringify(parsedIncoming.data));

  // `fill_empty` (default, non-destructive): only scenes the user has not
  // already picked a candidate for. `replace`: every scene, but this STILL
  // never touches `visual`/`motion` — it only refreshes the offered
  // candidate list, so even `replace` mode cannot destroy a user's applied
  // choice (only re-offering fresh alternatives alongside it).
  const targetScenes =
    mode === "replace"
      ? workingDocument.scenes
      : workingDocument.scenes.filter(scene => (scene.selectedMotionCandidateId ?? null) === null);
  const skippedSceneIds =
    mode === "replace"
      ? []
      : workingDocument.scenes
          .filter(scene => (scene.selectedMotionCandidateId ?? null) !== null)
          .map(scene => scene.sceneId);

  if (targetScenes.length === 0) {
    return {
      revision: args.baseRevision,
      proposedSceneIds: [],
      skippedSceneIds,
      rejectedSceneIds: [],
      summary: "No scenes needed motion variants (every scene already has a selected candidate).",
    };
  }

  const skillInput: MotionDirectorSkillInput = {
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
    variantsPerScene,
    scenes: targetScenes.map(scene => ({
      sceneId: scene.sceneId,
      startMs: scene.startMs,
      endMs: scene.endMs,
      narration: scene.narration,
      captionText: scene.captionCues.map(cue => cue.text),
      currentTemplateId: scene.visual.kind === "template" ? scene.visual.templateId : null,
    })),
    brandKit,
  };

  const output = await effects.runMotionDirectorSkill(skillInput);

  const targetIds = new Set(targetScenes.map(scene => scene.sceneId));
  const candidatesBySceneId = new Map<string, MotionCandidate[]>();
  const rejectedSceneIds: string[] = [];

  for (const planned of output.scenes) {
    if (!targetIds.has(planned.sceneId)) {
      // The skill referenced a scene it was not asked about — ignore rather
      // than fail the whole call; every other scene's variants are still
      // valid, real work the user should not lose over one bad reference.
      continue;
    }

    const validated: MotionCandidate[] = [];
    let candidateSeq = 0;
    for (const candidate of planned.candidates ?? []) {
      candidateSeq += 1;
      const template = (MOTION_TEMPLATE_REGISTRY as Record<string, MotionTemplate>)[candidate.templateId];
      if (!template) continue; // unknown template id — drop this candidate only

      let parsedParams: Record<string, unknown>;
      try {
        parsedParams = template.paramsSchema.parse(candidate.templateParams) as Record<string, unknown>;
      } catch {
        continue; // params failed the template's own schema — drop, never repair
      }

      let parsedMotion: Scene["motion"];
      try {
        parsedMotion = SceneMotionSchema.parse(candidate.motion);
      } catch {
        continue;
      }

      const parsedCandidate = MotionCandidateSchema.safeParse({
        candidateId: `${planned.sceneId}-v${candidateSeq}-${Date.now().toString(36)}`,
        templateId: candidate.templateId,
        templateParams: parsedParams,
        motion: parsedMotion,
        label: candidate.label,
        rationale: candidate.rationale,
      });
      if (!parsedCandidate.success) continue;

      validated.push(parsedCandidate.data);
    }

    if (validated.length > 0) {
      candidatesBySceneId.set(planned.sceneId, validated);
    } else {
      rejectedSceneIds.push(planned.sceneId);
    }
  }

  const proposedSceneIds = Array.from(candidatesBySceneId.keys());

  const mergedScenes: Scene[] = workingDocument.scenes.map(scene => {
    const candidates = candidatesBySceneId.get(scene.sceneId);
    if (!candidates) return scene;
    // A scene that already has a `selectedMotionCandidateId` never reaches
    // here in `fill_empty` mode (filtered out above); in `replace` mode the
    // freshly-generated list REPLACES the offered options only —
    // `selectedMotionCandidateId` and `visual`/`motion` are left exactly as
    // they were, so an already-applied choice keeps rendering/compiling
    // identically until the user explicitly re-picks.
    return { ...scene, motionCandidates: candidates };
  });

  const candidate: VideoProjectDocument = { ...workingDocument, scenes: mergedScenes };
  const reparsed = VideoProjectDocumentSchema.safeParse(candidate);
  if (!reparsed.success) {
    throw new Error(
      `VI_MOTION_VARIANT_INVALID: merged document failed schema validation: ${reparsed.error.message}`,
    );
  }

  const { revision } = await effects.persistDocument(reparsed.data, "motion_variants");

  return {
    revision,
    proposedSceneIds,
    skippedSceneIds,
    rejectedSceneIds,
    summary: output.summary,
  };
}
