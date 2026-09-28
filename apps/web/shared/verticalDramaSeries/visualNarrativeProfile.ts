import { z } from "zod";
import type { VerticalDramaPresetVisualIdentity } from "./presetVisualIdentity";

/**
 * Additive story-facing interpretation of a series visual identity.
 *
 * `VerticalDramaPresetVisualIdentity` remains the production look contract
 * (palette, lighting, camera, wardrobe and provider prompt fragments). This
 * contract is deliberately smaller and creator-readable: it tells story
 * skills how a look may enrich scenes without allowing the look to rewrite
 * premise, canon, characters or continuity.
 */
export const verticalDramaVisualNarrativeMotifSchema = z.object({
  motif: z.string().trim().min(1).max(180),
  narrativeFunction: z.string().trim().min(1).max(360),
});

export const verticalDramaVisualRelationshipLanguageSchema = z.object({
  phase: z.string().trim().min(1).max(120),
  visualExpression: z.string().trim().min(1).max(360),
});

export const verticalDramaVisualNarrativeProfileSchema = z
  .object({
    version: z.literal(1),
    emotionalRegister: z.string().trim().min(1).max(280),
    worldTexture: z.string().trim().min(1).max(500),
    recurringMotifs: z
      .array(verticalDramaVisualNarrativeMotifSchema)
      .min(1)
      .max(5),
    relationshipVisualLanguage: z
      .array(verticalDramaVisualRelationshipLanguageSchema)
      .max(6),
    sceneOpportunities: z
      .array(z.string().trim().min(1).max(260))
      .max(6),
    constraints: z
      .array(z.string().trim().min(1).max(260))
      .min(1)
      .max(6),
  })
  .passthrough();

export type VerticalDramaVisualNarrativeProfile = z.infer<
  typeof verticalDramaVisualNarrativeProfileSchema
>;

/**
 * Fallback context for legacy series that have a production look but were
 * created before `visualNarrativeProfile` existed. After the creator
 * explicitly opts in, it keeps the old look usable during future story
 * generation without changing any persisted plot.
 */
export function renderVisualNarrativeIdentityBlock(
  identity: VerticalDramaPresetVisualIdentity | null | undefined,
): string | null {
  if (!identity) return null;
  return [
    "VISUAL LOOK CONTEXT (LEGACY-SAFE, SOFT STORY GUIDANCE):",
    JSON.stringify({
      styleName: identity.styleName,
      palette: identity.palette,
      lighting: identity.lighting,
      environmentMotifs: identity.environmentMotifs,
      wardrobeGrammar: identity.wardrobeGrammar,
      signaturePropsAndCompanions: identity.signaturePropsAndCompanions,
      cameraGrammar: identity.cameraGrammar,
    }),
    "Use this only to enrich the texture of already-approved scenes, selective motifs, emotional staging, wardrobe meaning, and relationship visual language.",
    "It is not a plot instruction and must never create, remove, resolve, or contradict premise, canon, character facts, relationship states, continuity, or romance phases.",
    "Keep narrative/content language and spoken-language contracts unchanged.",
  ].join("\n");
}

/**
 * Renders the bounded profile as a reusable fact block for story skills.
 * Keeping the precedence rules here prevents individual callers from
 * accidentally turning a soft visual guide into a second story canon.
 */
export function renderVisualNarrativeProfileBlock(
  profile: VerticalDramaVisualNarrativeProfile | null | undefined,
): string | null {
  if (!profile) return null;
  return [
    "VISUAL NARRATIVE DNA (SOFT STORY GUIDANCE):",
    JSON.stringify(profile),
    "Use this profile only to enrich scene texture, recurring motifs, emotional staging, locations, wardrobe choices, and relationship visual language.",
    "Precedence is strict: user premise and established canon > story-control/continuity facts > genre, audience and market > this visual narrative profile > production look details.",
    "Do not create, remove, resolve, or contradict a plot thread, character fact, relationship state, setting fact, or romance phase merely to satisfy the visual profile.",
    "Use motifs selectively when they have a story function; do not repeat every motif in every episode or shot, and omit any opportunity that does not fit the episode's actual beat.",
    "Keep the narrative/content language supplied by the caller. This profile is not a dialogue-language instruction and must not change spoken language.",
  ].join("\n");
}
