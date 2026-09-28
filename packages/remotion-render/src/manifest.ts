/**
 * The Remotion sidecar manifest contract — read by
 * `renderFinalComposite()` (and, transitively, by
 * `apps/worker-app/runtime-pack/remotion-sidecar/render.mjs`) from a JSON
 * file on disk, mirroring the HyperFrames sidecar's manifest contract (see
 * `apps/worker-app/runtime-pack/hyperframes-sidecar/render.mjs`'s
 * `validateManifest()`).
 *
 * IMPORTANT: unlike the HyperFrames sidecar (which receives a raw
 * `compositionHtml` string and does its own asset staging/segmenting), this
 * manifest's `input.inputProps` is expected to be the ALREADY-MAPPED
 * Remotion inputProps object (i.e. the output of `apps/web`'s
 * `buildRemotionInputProps()`/`buildGenericTemplateInputProps()`) — all
 * shot/layer `src` fields must already be directly-fetchable `http(s)://`
 * URLs (Remotion's own asset pipeline requirement, see
 * `apps/web/server/services/remotionRuntimeAdapter.ts`'s module doc
 * comment). The heavy `HyperframesFinalCompositeConfig -> RemotionInputProps`
 * schema-mapping/asset-staging logic intentionally stays server-side
 * (`apps/web`) and is NOT duplicated here — the sidecar's job is strictly
 * "bundle + render + probe", exactly like the HyperFrames sidecar's job is
 * strictly "render + concat", not "build the composition HTML".
 *
 * See planning/remotion-migration/plan.md Phase 10, "Sidecar contract" for
 * the full, stable, documented protocol this file implements.
 */
import { z } from "zod";

import { RemotionInputPropsSchema } from "./compositionTypes";
import { RemotionTemplateConfigSchema } from "./layerTemplateSchemas";
import {
  MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID,
  GENERIC_TEMPLATE_COMPOSITION_ID,
} from "./Root";

export const REMOTION_SIDECAR_RENDER_INTENT = "remotion_final_composite" as const;

/**
 * Same defense-in-depth mock/placeholder marker reject-list style the
 * HyperFrames sidecar's `blockedMarkers` uses — applied against the raw
 * manifest JSON text before structured validation, so an obviously-fake
 * payload (e.g. a leftover local smoke-test fixture) fails closed with a
 * clear error instead of silently rendering placeholder content.
 */
const BLOCKED_MANIFEST_MARKERS = [
  "mock video content",
  "mock-remotion",
  "placeholder sidecar",
  "local_smoke_snapshot",
  "diagnostic_ffmpeg_smoke",
];

const SidecarManifestSchema = z
  .object({
    renderIntent: z.literal(REMOTION_SIDECAR_RENDER_INTENT),
    jobId: z.string().trim().min(1).optional(),
    assignmentAttempt: z.string().trim().min(1).optional(),
    runtimePolicy: z
      .object({
        requireOfficialRuntime: z.literal(true),
        rejectFallbackRender: z.literal(true),
      })
      .strict(),
    input: z
      .discriminatedUnion("compositionId", [
        z
          .object({
            compositionId: z.literal(MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID),
            inputProps: RemotionInputPropsSchema,
          })
          .strict(),
        z
          .object({
            compositionId: z.literal(GENERIC_TEMPLATE_COMPOSITION_ID),
            inputProps: RemotionTemplateConfigSchema,
          })
          .strict(),
      ])
      .refine(value => value.inputProps !== undefined, {
        message: "input.inputProps is required",
      }),
    output: z
      .object({
        finalVideoPath: z.string().trim().min(1).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export type RemotionSidecarManifest = z.infer<typeof SidecarManifestSchema>;

/**
 * Parses and strictly validates raw manifest JSON text, mirroring the
 * HyperFrames sidecar's fail-closed `validateManifest()` posture: malformed
 * or partial manifests throw immediately with a descriptive message rather
 * than silently proceeding with defaults.
 */
export function parseRemotionSidecarManifest(
  rawJsonText: string
): RemotionSidecarManifest {
  const matchedMarker = BLOCKED_MANIFEST_MARKERS.find(marker =>
    rawJsonText.includes(marker)
  );
  if (matchedMarker) {
    throw new Error(
      `Remotion sidecar manifest contains a blocked mock/placeholder marker: "${matchedMarker}"`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Remotion sidecar manifest is not valid JSON: ${message}`);
  }

  const result = SidecarManifestSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(
      `Remotion sidecar manifest failed validation: ${result.error.message}`
    );
  }
  return result.data;
}
