/**
 * Feature 135 — Hermes Grok media worker: seed the "Grok via Hermes" media
 * catalog rows (`hermes-grok/grok-imagine-image`,
 * `hermes-grok/grok-imagine-image-quality`, `hermes-grok/grok-imagine-video`).
 *
 * These rows are deliberately shipped **disabled** (`isEnabled: false`) —
 * enabling them is an admin rollout action, not part of this seed. Re-running
 * this script is a no-op for `isEnabled`: the `ON CONFLICT` clause always
 * preserves whatever value is already in the database, mirroring the pure
 * `computeHermesGrokUpsertRow` helper's semantics (tested in
 * `scripts/__tests__/seed-media-models-hermes-grok.test.ts`).
 *
 * Two-Grok-paths product rule (spec §3.1): the kie.ai gateway path already
 * ships Grok models (`grok-imagine/text-to-image` display name "Grok Imagine",
 * see `scripts/seed-media-models-kie-ai.ts`). Those rows are kept unchanged
 * and offered side by side — every row here carries the "Grok via Hermes"
 * distinction in its display name and uses only hermes-qualified aliases
 * (never the kie.ai rows' bare "grok"/"grok-imagine"/"grok-image"/
 * "grok-video" aliases).
 *
 * Run with: npx tsx scripts/seed-media-models-hermes-grok.ts [--dry-run]
 */

import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

export type HermesGrokMediaModelSeed = {
  modelId: string;
  name: string;
  description: string;
  modelType: "image" | "video";
  provider: "hermes-grok";
  providerModelId: string;
  aliases: string[];
  creditCost: number;
  aspectRatios: string[];
  durations?: number[];
  referenceImageLimit: number;
  defaultParams?: Record<string, unknown>;
  priority: number;
  sortOrder: number;
};

/** 9:16 first — VD (Vertical Drama) is the primary consumer of this transport. */
const HERMES_GROK_ASPECT_RATIOS = ["9:16", "16:9", "1:1"];

// Same underlying provider model as the kie.ai `grok-imagine-video-1-5-preview`
// row (`scripts/seed-media-models-kie-ai.ts`) — duration options must match
// what the provider actually renders.
const HERMES_GROK_VIDEO_DURATIONS = Array.from({ length: 15 }, (_, index) => index + 1);

/**
 * Exactly 3 rows (spec §10.4 / plan §12). Ordering matches the spec's table:
 * image, image-quality, video.
 */
export const HERMES_GROK_MEDIA_MODEL_SEEDS: HermesGrokMediaModelSeed[] = [
  {
    modelId: "hermes-grok/grok-imagine-image",
    name: "Grok Imagine (Grok via Hermes)",
    description:
      "xAI Grok Imagine image generation and editing through a connected Grok account via the Hermes media worker (no SmartSpecPro credits deducted).",
    modelType: "image",
    provider: "hermes-grok",
    providerModelId: "grok-imagine-image",
    aliases: [
      "hermes grok imagine",
      "grok imagine via hermes",
      "hermes-grok-image",
      "grok via hermes (image)",
    ],
    creditCost: 0,
    aspectRatios: HERMES_GROK_ASPECT_RATIOS,
    referenceImageLimit: 3,
    priority: 90,
    sortOrder: 290,
  },
  {
    modelId: "hermes-grok/grok-imagine-image-quality",
    name: "Grok Imagine Quality (Grok via Hermes)",
    description:
      "xAI Grok Imagine high-quality image generation and editing through a connected Grok account via the Hermes media worker (no SmartSpecPro credits deducted).",
    modelType: "image",
    provider: "hermes-grok",
    providerModelId: "grok-imagine-image-quality",
    aliases: [
      "hermes grok imagine quality",
      "grok imagine quality via hermes",
      "hermes-grok-image-quality",
    ],
    creditCost: 0,
    aspectRatios: HERMES_GROK_ASPECT_RATIOS,
    referenceImageLimit: 3,
    defaultParams: { quality: "high" },
    priority: 91,
    sortOrder: 291,
  },
  {
    modelId: "hermes-grok/grok-imagine-video",
    name: "Grok Imagine Video (Grok via Hermes)",
    description:
      "xAI Grok Imagine image-to-video generation (single start frame) through a connected Grok account via the Hermes media worker (no SmartSpecPro credits deducted).",
    modelType: "video",
    provider: "hermes-grok",
    providerModelId: "grok-imagine-video",
    aliases: [
      "hermes grok imagine video",
      "grok imagine video via hermes",
      "hermes-grok-video",
    ],
    creditCost: 0,
    aspectRatios: HERMES_GROK_ASPECT_RATIOS,
    durations: HERMES_GROK_VIDEO_DURATIONS,
    referenceImageLimit: 1,
    priority: 92,
    sortOrder: 292,
  },
];

/**
 * `configJson` shape consumed by section 01's `resolveMediaModelTransportConfig`
 * (`shared/mediaModelTransport.ts`), section 05's contract builder, section 09's
 * reference trimmer (via `effectiveHermesCapability`), and section 10's form
 * renderer. `referenceImageLimit` here is the model-row side of the capability
 * intersection — the effective limit at submit time is
 * `effectiveHermesCapability(modelRow, connection.capabilitiesJson, operation)`
 * (min/AND, section 01); this row value is the ceiling, never the floor.
 */
export function buildHermesGrokMediaModelConfigJson(
  seed: HermesGrokMediaModelSeed,
): Record<string, unknown> {
  return {
    transport: "hermes_worker",
    hermes: {
      providerType: "xai_grok",
      providerModelId: seed.providerModelId,
      operationDefaults: { aspectRatios: seed.aspectRatios },
    },
    generateType: seed.modelType === "video" ? "image-to-video" : "text-to-image",
    supportsReferenceImages: true,
    referenceImageLimit: seed.referenceImageLimit,
    aspectRatios: seed.aspectRatios,
    inputFields: [
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: seed.aspectRatios.map(value => ({ value, label: value })),
        default: seed.aspectRatios[0],
      },
      ...(seed.modelType === "video" && seed.durations?.length
        ? [
            {
              key: "duration",
              label: "Duration",
              type: "select",
              options: seed.durations.map(value => ({
                value: String(value),
                label: `${value}s`,
              })),
              default: String(seed.durations[0]),
            },
          ]
        : []),
      {
        key: "reference_image_urls",
        label: "Reference Images",
        type: "image_urls",
        syncWith: "reference_images",
        maxItems: seed.referenceImageLimit,
        includeInPayload: false,
      },
    ],
    pricing: {
      formula: "provider_account",
      defaultCredits: 0,
      note: "Uses the connected Grok subscription; SmartSpecPro credits are not deducted (shared-pool fee handled by the scheduler).",
    },
    ...(seed.defaultParams ? { defaultParams: seed.defaultParams } : {}),
  };
}

/** The row shape written to `media_models` (see `drizzle/schema.ts`). */
export interface HermesGrokMediaModelRow {
  modelId: string;
  name: string;
  description: string;
  modelType: "image" | "video";
  provider: "hermes-grok";
  aliases: string[];
  creditCost: number;
  aspectRatios: string[];
  durations: number[];
  priority: number;
  sortOrder: number;
  configJson: Record<string, unknown>;
  isEnabled: boolean;
}

/**
 * Pure upsert-row helper — the tested source of truth for the "insert
 * disabled, re-seed preserves admin enablement" semantics. `existingRow` is
 * whatever the caller already knows about the row's `isEnabled` state (or
 * `undefined` if the row does not exist yet).
 */
export function computeHermesGrokUpsertRow(
  existingRow: { isEnabled: boolean } | undefined,
  seed: HermesGrokMediaModelSeed,
): HermesGrokMediaModelRow {
  return {
    modelId: seed.modelId,
    name: seed.name,
    description: seed.description,
    modelType: seed.modelType,
    provider: "hermes-grok",
    aliases: seed.aliases,
    creditCost: seed.creditCost,
    aspectRatios: seed.aspectRatios,
    durations: seed.durations ?? [],
    priority: seed.priority,
    sortOrder: seed.sortOrder,
    configJson: buildHermesGrokMediaModelConfigJson(seed),
    // Disabled by default; re-seeding preserves whatever an admin already set.
    isEnabled: existingRow?.isEnabled ?? false,
  };
}

export async function seedHermesGrokMediaModels(
  options: { dryRun?: boolean } = {},
): Promise<void> {
  console.log("Seeding Hermes Grok media models (disabled by default)...\n");
  for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
    console.log(
      `  ${options.dryRun ? "dry-run " : ""}${seed.modelId} -> hermes-grok:${seed.providerModelId}`,
    );
  }
  if (options.dryRun) return;

  const sql = postgres(DATABASE_URL);
  try {
    for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
      const row = computeHermesGrokUpsertRow(undefined, seed);
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, "creditCost", "aspectRatios", durations,
          priority, "sortOrder", "configJson", "isEnabled"
        ) VALUES (
          ${row.modelId},
          ${row.name},
          ${row.description},
          ${row.modelType},
          ${row.provider},
          ${sql.json(row.aliases)},
          ${row.creditCost},
          ${sql.json(row.aspectRatios)},
          ${sql.json(row.durations)},
          ${row.priority},
          ${row.sortOrder},
          ${sql.json(row.configJson)},
          ${row.isEnabled}
        )
        ON CONFLICT ("modelId") DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          "modelType" = EXCLUDED."modelType",
          provider = EXCLUDED.provider,
          aliases = EXCLUDED.aliases,
          "creditCost" = EXCLUDED."creditCost",
          "aspectRatios" = EXCLUDED."aspectRatios",
          durations = EXCLUDED.durations,
          priority = EXCLUDED.priority,
          "sortOrder" = EXCLUDED."sortOrder",
          "configJson" = EXCLUDED."configJson",
          "isEnabled" = media_models."isEnabled"
      `;
    }
    console.log(
      `\nUpserted ${HERMES_GROK_MEDIA_MODEL_SEEDS.length} Hermes Grok media model records (isEnabled preserved on re-run).`,
    );
  } finally {
    await sql.end();
  }
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  void seedHermesGrokMediaModels({
    dryRun: process.argv.includes("--dry-run"),
  });
}
