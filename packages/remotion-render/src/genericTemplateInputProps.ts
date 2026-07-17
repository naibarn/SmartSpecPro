/**
 * Maps a validated `RemotionTemplateConfig` (see `layerTemplateSchemas.ts`)
 * into the `inputProps` consumed by `GenericTemplateComposition.tsx`.
 *
 * MOVED (unchanged) from
 * `apps/web/server/services/remotionTemplateService.ts` as part of the
 * `packages/remotion-render` extraction (see
 * planning/remotion-migration/plan.md Phase 10, "Sidecar contract") — this
 * function has no `apps/web`-specific dependency (it is a straightforward
 * passthrough mapping; unlike the HyperFrames-schema mapping, there is no
 * seconds->frames conversion to do here since `RemotionTemplateConfig`
 * already expresses all timing in frames), so it moved cleanly.
 * `apps/web/server/services/remotionTemplateService.ts` now re-exports this
 * for backward compatibility with existing importers.
 */
import type { RemotionTemplateConfig } from "./layerTemplateSchemas";

export interface GenericTemplateInputProps extends RemotionTemplateConfig {
  // Remotion's `Composition`/`CalculateMetadataFunction` generics require
  // Props to satisfy `Record<string, unknown>`; this index signature exists
  // only to satisfy that constraint (see `Root.tsx`), all real fields above
  // (inherited from `RemotionTemplateConfig`) remain concretely typed for
  // consumers.
  [key: string]: unknown;
}

export function buildGenericTemplateInputProps(
  config: RemotionTemplateConfig
): GenericTemplateInputProps {
  return { ...config };
}
