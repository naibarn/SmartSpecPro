/**
 * The Motion Template Registry — assembles each template's `meta` (client-
 * safe, `shared/videoIntelligence/motionTemplates.ts`) with its server-only
 * `paramsSchema` + pure `build()` function (Feature 133, Phase 1 MVP). See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.4.
 *
 * Mirrors `server/remotion/scenes/index.ts`'s module-load
 * `assertRegistryMatchesIds()` guard: a missing/extra builder is caught at
 * load time, never silently at compile time in production.
 *
 * Structural-shape note (WAVE 1 contract action for section-02, see
 * `orchestra/contracts.md`): each `MOTION_TEMPLATE_REGISTRY[id]` value below
 * (`{ meta, paramsSchema, build }`) already structurally satisfies
 * `videoProjectCompiler.ts`'s `MotionTemplateBuilder` (`{ build,
 * paramsSchema? }`) — the extra `meta` field is a non-conflicting additional
 * property, `build`'s `(params: unknown, ctx) => RemotionLayer[]` signature
 * is assignable to `MotionTemplateBuilder`'s `(params: Record<string,
 * unknown>, ctx) => RemotionLayer[]` (contravariant parameter widening), and
 * a Zod `.strict()` schema's `.parse` return type is assignable to
 * `Record<string, unknown>`. Section-07 can therefore pass `{
 * resolveTemplate: id => MOTION_TEMPLATE_REGISTRY[id] }` directly as
 * `compileVideoProject`'s 3rd arg — no adapter function needed.
 */
import type { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import {
  MOTION_TEMPLATE_IDS,
  MOTION_TEMPLATE_META,
  type MotionTemplateId,
  type MotionTemplateMeta,
} from "../../../shared/videoIntelligence/motionTemplates";

import { buildProductHero, productHeroParamsSchema } from "./product_hero";
import {
  buildGlassFeatureCards,
  glassFeatureCardsParamsSchema,
} from "./glass_feature_cards";
import { buildHowToSteps, howToStepsParamsSchema } from "./how_to_steps";
import {
  buildComparisonStage,
  comparisonStageParamsSchema,
} from "./comparison_stage";
import {
  buildReviewHighlight,
  reviewHighlightParamsSchema,
} from "./review_highlight";
import {
  buildKineticTypography,
  kineticTypographyParamsSchema,
} from "./kinetic_typography";
import {
  buildFloatingGallery,
  floatingGalleryParamsSchema,
} from "./floating_gallery";
import {
  buildLuxuryEndCard,
  luxuryEndCardParamsSchema,
} from "./luxury_end_card";
import { buildDataFlow, dataFlowParamsSchema } from "./data_flow";
import {
  buildAnimatedChartBasic,
  animatedChartBasicParamsSchema,
} from "./animated_chart_basic";
import { buildParticleField, particleFieldParamsSchema } from "./particle_field";
import { buildNetworkGraph, networkGraphParamsSchema } from "./network_graph";
import { buildGlowingSphere, glowingSphereParamsSchema } from "./glowing_sphere";

export interface MotionTemplate {
  meta: MotionTemplateMeta;
  paramsSchema: z.ZodTypeAny;
  build: (params: unknown, ctx: TemplateBuildContext) => RemotionLayer[];
}

export const MOTION_TEMPLATE_REGISTRY: Record<MotionTemplateId, MotionTemplate> = {
  product_hero: {
    meta: MOTION_TEMPLATE_META.product_hero,
    paramsSchema: productHeroParamsSchema,
    build: buildProductHero,
  },
  glass_feature_cards: {
    meta: MOTION_TEMPLATE_META.glass_feature_cards,
    paramsSchema: glassFeatureCardsParamsSchema,
    build: buildGlassFeatureCards,
  },
  how_to_steps: {
    meta: MOTION_TEMPLATE_META.how_to_steps,
    paramsSchema: howToStepsParamsSchema,
    build: buildHowToSteps,
  },
  comparison_stage: {
    meta: MOTION_TEMPLATE_META.comparison_stage,
    paramsSchema: comparisonStageParamsSchema,
    build: buildComparisonStage,
  },
  review_highlight: {
    meta: MOTION_TEMPLATE_META.review_highlight,
    paramsSchema: reviewHighlightParamsSchema,
    build: buildReviewHighlight,
  },
  kinetic_typography: {
    meta: MOTION_TEMPLATE_META.kinetic_typography,
    paramsSchema: kineticTypographyParamsSchema,
    build: buildKineticTypography,
  },
  floating_gallery: {
    meta: MOTION_TEMPLATE_META.floating_gallery,
    paramsSchema: floatingGalleryParamsSchema,
    build: buildFloatingGallery,
  },
  luxury_end_card: {
    meta: MOTION_TEMPLATE_META.luxury_end_card,
    paramsSchema: luxuryEndCardParamsSchema,
    build: buildLuxuryEndCard,
  },
  data_flow: {
    meta: MOTION_TEMPLATE_META.data_flow,
    paramsSchema: dataFlowParamsSchema,
    build: buildDataFlow,
  },
  animated_chart_basic: {
    meta: MOTION_TEMPLATE_META.animated_chart_basic,
    paramsSchema: animatedChartBasicParamsSchema,
    build: buildAnimatedChartBasic,
  },
  particle_field: {
    meta: MOTION_TEMPLATE_META.particle_field,
    paramsSchema: particleFieldParamsSchema,
    build: buildParticleField,
  },
  network_graph: {
    meta: MOTION_TEMPLATE_META.network_graph,
    paramsSchema: networkGraphParamsSchema,
    build: buildNetworkGraph,
  },
  glowing_sphere: {
    meta: MOTION_TEMPLATE_META.glowing_sphere,
    paramsSchema: glowingSphereParamsSchema,
    build: buildGlowingSphere,
  },
};

function assertRegistryMatchesIds(): void {
  const registryKeys = Object.keys(MOTION_TEMPLATE_REGISTRY).sort();
  const idList = [...MOTION_TEMPLATE_IDS].sort();
  const matches =
    registryKeys.length === idList.length &&
    registryKeys.every((key, index) => key === idList[index]);
  if (!matches) {
    throw new Error(
      "[remotion/templates] MOTION_TEMPLATE_REGISTRY keys " +
        `(${JSON.stringify(registryKeys)}) do not match ` +
        "shared/videoIntelligence/motionTemplates.ts's MOTION_TEMPLATE_IDS " +
        `(${JSON.stringify(idList)}). These two lists must stay in sync — ` +
        "see this file's module doc comment."
    );
  }
}

assertRegistryMatchesIds();

export { MOTION_TEMPLATE_IDS };
