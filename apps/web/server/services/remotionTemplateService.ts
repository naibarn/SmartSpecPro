/**
 * Maps a validated `RemotionTemplateConfig` (see
 * `shared/remotion/layerTemplateSchemas.ts`) into the `inputProps` consumed
 * by `server/remotion/GenericTemplateComposition.tsx`. Mirrors the style of
 * `buildRemotionInputProps` in `remotionCompositionService.ts` — this is a
 * mostly-direct passthrough mapping (unlike the HyperFrames-schema mapping,
 * there is no seconds->frames conversion to do here: `RemotionTemplateConfig`
 * already expresses all timing in frames) plus the `[key: string]: unknown`
 * index signature Remotion's `Composition`/`CalculateMetadataFunction`
 * generics require Props to satisfy.
 *
 * See planning/remotion-migration/plan.md section 8 (Phase 7).
 */
import type { RemotionTemplateConfig } from "../../shared/remotion/layerTemplateSchemas";

export interface GenericTemplateInputProps extends RemotionTemplateConfig {
  // Remotion's `Composition`/`CalculateMetadataFunction` generics require
  // Props to satisfy `Record<string, unknown>`; this index signature exists
  // only to satisfy that constraint (see `server/remotion/Root.tsx`), all
  // real fields above (inherited from `RemotionTemplateConfig`) remain
  // concretely typed for consumers.
  [key: string]: unknown;
}

export function buildGenericTemplateInputProps(
  config: RemotionTemplateConfig
): GenericTemplateInputProps {
  return { ...config };
}
