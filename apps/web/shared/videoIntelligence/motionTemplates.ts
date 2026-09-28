/**
 * Motion Template Registry — client-safe **metadata** for the ~10 reusable
 * 2D `layer_pack` motion templates (Feature 133, Phase 1 MVP). See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.1 for the normative shape this file implements.
 *
 * This file (and its exports) may be pulled into client bundles — it MUST
 * NOT import anything from `server/**`. The concrete Zod `paramsSchema` and
 * pure `build()` function for each template id live beside their builder in
 * `server/remotion/templates/<id>.ts` and are assembled together with this
 * metadata into the full `MotionTemplate` shape by
 * `server/remotion/templates/index.ts` (kept server-only, per §4.1's
 * "preferred" split).
 */

export const MOTION_TEMPLATE_IDS = [
  "product_hero",
  "glass_feature_cards",
  "how_to_steps",
  "comparison_stage",
  "review_highlight",
  "kinetic_typography",
  "floating_gallery",
  "luxury_end_card",
  "data_flow",
  "animated_chart_basic",
  "particle_field",
  "network_graph",
  "glowing_sphere",
] as const;
export type MotionTemplateId = (typeof MOTION_TEMPLATE_IDS)[number];

export type AspectRatio = "16:9" | "9:16" | "1:1";
export type RenderCostClass = "low" | "medium" | "high";
export type BrandToken =
  | "primaryColor"
  | "accentColor"
  | "font"
  | "captionStyle";

export interface MotionTemplateMeta {
  id: MotionTemplateId;
  /** Procedural entries remain registry-resolved and emit bounded layers. */
  kind: "layer_pack" | "procedural";
  categories: string[];
  minDurationMs: number;
  maxDurationMs: number;
  maxItems: number;
  renderCost: RenderCostClass;
  supportedAspectRatios: AspectRatio[];
  brandTokens: BrandToken[];
}

const ALL_ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1"];
const WIDE_OR_SQUARE_ASPECT_RATIOS: AspectRatio[] = ["16:9", "1:1"];

export const MOTION_TEMPLATE_META: Record<MotionTemplateId, MotionTemplateMeta> = {
  product_hero: {
    id: "product_hero",
    kind: "layer_pack",
    categories: ["product", "hero"],
    minDurationMs: 2000,
    maxDurationMs: 15000,
    maxItems: 1,
    renderCost: "low",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["primaryColor", "font"],
  },
  glass_feature_cards: {
    id: "glass_feature_cards",
    kind: "layer_pack",
    categories: ["product", "features"],
    minDurationMs: 3000,
    maxDurationMs: 20000,
    maxItems: 4,
    renderCost: "medium",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["accentColor", "font"],
  },
  how_to_steps: {
    id: "how_to_steps",
    kind: "layer_pack",
    categories: ["tutorial", "howto"],
    minDurationMs: 5000,
    maxDurationMs: 60000,
    maxItems: 6,
    renderCost: "medium",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["primaryColor", "captionStyle"],
  },
  comparison_stage: {
    id: "comparison_stage",
    kind: "layer_pack",
    categories: ["comparison", "product"],
    minDurationMs: 3000,
    maxDurationMs: 20000,
    maxItems: 2,
    renderCost: "medium",
    supportedAspectRatios: WIDE_OR_SQUARE_ASPECT_RATIOS,
    brandTokens: ["accentColor", "font"],
  },
  review_highlight: {
    id: "review_highlight",
    kind: "layer_pack",
    categories: ["review", "social_proof"],
    minDurationMs: 2000,
    maxDurationMs: 12000,
    maxItems: 1,
    renderCost: "low",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["accentColor", "captionStyle"],
  },
  kinetic_typography: {
    id: "kinetic_typography",
    kind: "layer_pack",
    categories: ["hook", "text"],
    minDurationMs: 1000,
    maxDurationMs: 10000,
    maxItems: 8,
    renderCost: "low",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["primaryColor", "font"],
  },
  floating_gallery: {
    id: "floating_gallery",
    kind: "layer_pack",
    categories: ["gallery", "product"],
    minDurationMs: 3000,
    maxDurationMs: 20000,
    maxItems: 9,
    renderCost: "medium",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["font"],
  },
  luxury_end_card: {
    id: "luxury_end_card",
    kind: "layer_pack",
    categories: ["end_card", "cta", "brand"],
    minDurationMs: 2000,
    maxDurationMs: 8000,
    maxItems: 1,
    renderCost: "low",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["primaryColor", "accentColor", "font"],
  },
  data_flow: {
    id: "data_flow",
    kind: "layer_pack",
    categories: ["diagram", "explainer"],
    minDurationMs: 3000,
    maxDurationMs: 20000,
    maxItems: 6,
    renderCost: "medium",
    supportedAspectRatios: WIDE_OR_SQUARE_ASPECT_RATIOS,
    brandTokens: ["accentColor"],
  },
  animated_chart_basic: {
    id: "animated_chart_basic",
    kind: "layer_pack",
    categories: ["chart", "data"],
    minDurationMs: 3000,
    maxDurationMs: 15000,
    maxItems: 8,
    renderCost: "medium",
    supportedAspectRatios: WIDE_OR_SQUARE_ASPECT_RATIOS,
    brandTokens: ["primaryColor", "accentColor"],
  },
  particle_field: {
    id: "particle_field",
    kind: "procedural",
    categories: ["science", "energy", "explainer", "cinematic"],
    minDurationMs: 2000,
    maxDurationMs: 60000,
    maxItems: 1,
    renderCost: "medium",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["primaryColor", "accentColor", "font"],
  },
  network_graph: {
    id: "network_graph",
    kind: "procedural",
    categories: ["relationship", "network", "explainer", "data"],
    minDurationMs: 3000,
    maxDurationMs: 60000,
    maxItems: 12,
    renderCost: "medium",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["primaryColor", "accentColor", "font"],
  },
  glowing_sphere: {
    id: "glowing_sphere",
    kind: "procedural",
    categories: ["science", "technology", "cinematic", "energy"],
    minDurationMs: 3000,
    maxDurationMs: 60000,
    maxItems: 1,
    renderCost: "high",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    brandTokens: ["primaryColor", "accentColor", "font"],
  },
};

/**
 * Pure filter over `MOTION_TEMPLATE_META`'s values — never throws, never
 * does I/O. Used by the Studios UI's manual template picker (section-08)
 * and (in-process) by any Phase-2+ metadata-driven skill routing.
 */
export function selectTemplatesFor(filter: {
  categories?: string[];
  durationMs?: number;
  aspectRatio?: AspectRatio;
}): MotionTemplateMeta[] {
  return Object.values(MOTION_TEMPLATE_META).filter(meta => {
    if (filter.categories && filter.categories.length > 0) {
      const matchesCategory = filter.categories.some(category =>
        meta.categories.includes(category)
      );
      if (!matchesCategory) return false;
    }
    if (filter.aspectRatio && !meta.supportedAspectRatios.includes(filter.aspectRatio)) {
      return false;
    }
    if (
      filter.durationMs !== undefined &&
      (filter.durationMs < meta.minDurationMs || filter.durationMs > meta.maxDurationMs)
    ) {
      return false;
    }
    return true;
  });
}
