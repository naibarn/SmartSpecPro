/**
 * Pure render-cost estimator for a compiled `RemotionTemplateConfig` (Feature
 * 133, Phase 1 MVP). Owned exclusively by section-01 per the cross-section
 * consistency resolution #1 (`sections/index.md`): `estimateRenderCost` +
 * `RenderCostEstimate` live here as the single source of truth; section-02
 * only adds `cost.test.ts` re-testing this exact contract (export name +
 * return shape are locked — do not rename/reshape without updating both).
 *
 * Score model (plan §4.3): `score = Σ layers (durationFrames × class-weight)`
 * — a simple, deterministic weighted sum, no I/O, no randomness. Each layer
 * type maps to a fixed cost-class weight reflecting its real render cost
 * (a `scene3d` WebGL layer is far more expensive per frame than a static
 * `image`/`text` layer; `video`/`svg`/`motionGraphic` sit in between).
 */
import type { RemotionLayer, RemotionTemplateConfig } from "../remotion/layerTemplateSchemas";

export type RenderCostClass = "low" | "medium" | "high";

export interface RenderCostEstimate {
  score: number;
  cls: RenderCostClass;
  recommendPreRender: boolean;
}

/** Fixed per-layer-type cost-class weight — deterministic, documented, never
 *  derived from external input. */
const LAYER_TYPE_COST_WEIGHT: Record<RemotionLayer["type"], number> = {
  image: 1,
  text: 1,
  audio: 1,
  svg: 2,
  motionGraphic: 2,
  video: 3,
  scene3d: 6,
};

/** Score buckets — tuned so a handful of image/text layers over a short clip
 *  stays "low", a typical multi-scene video with some video/svg layers lands
 *  "medium", and heavy scene3d/video-heavy configs land "high". */
const COST_SCORE_MEDIUM_THRESHOLD = 5_000;
const COST_SCORE_HIGH_THRESHOLD = 20_000;

/** Phase 1 has no scene3d pre-render pipeline yet (plan §4.3) — this flag is
 *  informational only, set once the config crosses the same "high" budget. */
const COST_SCORE_PRE_RENDER_BUDGET = COST_SCORE_HIGH_THRESHOLD;

function classifyScore(score: number): RenderCostClass {
  if (score >= COST_SCORE_HIGH_THRESHOLD) return "high";
  if (score >= COST_SCORE_MEDIUM_THRESHOLD) return "medium";
  return "low";
}

export function estimateRenderCost(
  config: RemotionTemplateConfig
): RenderCostEstimate {
  const score = config.layers.reduce((sum, layer) => {
    const weight = LAYER_TYPE_COST_WEIGHT[layer.type] ?? 1;
    return sum + layer.durationFrames * weight;
  }, 0);

  return {
    score,
    cls: classifyScore(score),
    recommendPreRender: score >= COST_SCORE_PRE_RENDER_BUDGET,
  };
}
