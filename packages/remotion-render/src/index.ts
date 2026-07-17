/**
 * `@smartspec/remotion-render` — shared Remotion composition + render
 * orchestration package, extracted from `apps/web/server/remotion/` and
 * `apps/web/server/services/remotion*Service.ts` so both `apps/web`'s
 * in-process render worker and the `apps/worker-app` desktop-fleet Remotion
 * sidecar bundle from a single source of truth.
 *
 * See planning/remotion-migration/plan.md Phase 10.
 */

// Composition entry point + registered composition ids.
export { ROOT_ENTRY_POINT } from "./rootEntryPoint";
export {
  RemotionRoot,
  MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID,
  GENERIC_TEMPLATE_COMPOSITION_ID,
} from "./Root";

// Composition components (rarely imported directly outside this package /
// `Root.tsx`, but exported for completeness / potential Remotion Studio use).
export { MarketplaceAutoReviewComposition } from "./MarketplaceAutoReviewComposition";
export { GenericTemplateComposition } from "./GenericTemplateComposition";

// Generic (app-agnostic) `RemotionInputProps` types + validation schema.
export type {
  RemotionInputProps,
  RemotionShotProps,
  RemotionSubtitleCueProps,
} from "./compositionTypes";
export {
  RemotionInputPropsSchema,
  RemotionShotPropsSchema,
  RemotionSubtitleCuePropsSchema,
} from "./compositionTypes";

// Generic multi-layer template schema + inputProps mapping.
export {
  RemotionLayerSchema,
  RemotionTemplateConfigSchema,
  isSafeInlineSvgMarkup,
} from "./layerTemplateSchemas";
export type {
  RemotionLayer,
  RemotionImageLayer,
  RemotionVideoLayer,
  RemotionTextLayer,
  RemotionSvgLayer,
  RemotionMotionGraphicLayer,
  RemotionScene3dLayer,
  RemotionTemplateConfig,
} from "./layerTemplateSchemas";
export {
  buildGenericTemplateInputProps,
} from "./genericTemplateInputProps";
export type { GenericTemplateInputProps } from "./genericTemplateInputProps";

// Vetted R3F scene registry.
export { REMOTION_SCENE_IDS } from "./sceneRegistryIds";
export type { RemotionSceneId } from "./sceneRegistryIds";
export { REMOTION_SCENE_REGISTRY } from "./scenes";

// Sidecar manifest contract + render orchestration.
export {
  REMOTION_SIDECAR_RENDER_INTENT,
  parseRemotionSidecarManifest,
} from "./manifest";
export type { RemotionSidecarManifest } from "./manifest";
export { renderFinalComposite } from "./renderFinalComposite";
export type {
  SidecarEvent,
  RenderFinalCompositeInput,
  RenderFinalCompositeResult,
} from "./renderFinalComposite";
