diff --git a/apps/web/scripts/__tests__/seed-media-models-hermes-grok.test.ts b/apps/web/scripts/__tests__/seed-media-models-hermes-grok.test.ts
new file mode 100644
index 000000000..6facb8cd0
--- /dev/null
+++ b/apps/web/scripts/__tests__/seed-media-models-hermes-grok.test.ts
@@ -0,0 +1,185 @@
+import { describe, expect, it } from "vitest";
+
+import {
+  HERMES_GROK_MEDIA_MODEL_SEEDS,
+  buildHermesGrokMediaModelConfigJson,
+  computeHermesGrokUpsertRow,
+} from "../seed-media-models-hermes-grok";
+import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
+
+// Bare kie.ai Grok aliases (`scripts/seed-media-models-kie-ai.ts`) — the new
+// hermes-grok rows must never collide with these (spec §3.1).
+const KIE_AI_BARE_GROK_ALIASES = ["grok", "grok-imagine", "grok-image", "grok-video"];
+
+describe("seed-media-models-hermes-grok", () => {
+  describe("HERMES_GROK_MEDIA_MODEL_SEEDS", () => {
+    it("exports exactly 3 entries with the expected modelIds and modelTypes", () => {
+      expect(HERMES_GROK_MEDIA_MODEL_SEEDS).toHaveLength(3);
+      const byModelId = new Map(
+        HERMES_GROK_MEDIA_MODEL_SEEDS.map(seed => [seed.modelId, seed]),
+      );
+      expect(byModelId.get("hermes-grok/grok-imagine-image")?.modelType).toBe("image");
+      expect(byModelId.get("hermes-grok/grok-imagine-image-quality")?.modelType).toBe("image");
+      expect(byModelId.get("hermes-grok/grok-imagine-video")?.modelType).toBe("video");
+    });
+
+    it("gives every row a 'Grok via Hermes' display name, mutually distinct, never the kie.ai literal", () => {
+      const names = HERMES_GROK_MEDIA_MODEL_SEEDS.map(seed => seed.name);
+      for (const name of names) {
+        expect(name).toContain("Grok via Hermes");
+        expect(name).not.toBe("Grok Imagine");
+      }
+      expect(new Set(names).size).toBe(names.length);
+    });
+
+    it("sets provider hermes-grok and creditCost 0 on every row", () => {
+      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+        expect(seed.provider).toBe("hermes-grok");
+        expect(seed.creditCost).toBe(0);
+      }
+    });
+
+    it("never uses a bare kie.ai Grok alias; every alias is hermes-qualified", () => {
+      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+        for (const alias of seed.aliases) {
+          expect(KIE_AI_BARE_GROK_ALIASES).not.toContain(alias);
+          expect(alias.toLowerCase()).toContain("hermes");
+        }
+      }
+    });
+  });
+
+  describe("buildHermesGrokMediaModelConfigJson", () => {
+    it("marks transport hermes_worker with an xai_grok hermes block per row", () => {
+      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+        const config = buildHermesGrokMediaModelConfigJson(seed);
+        expect(config.transport).toBe("hermes_worker");
+        expect((config.hermes as Record<string, unknown>).providerType).toBe("xai_grok");
+        expect((config.hermes as Record<string, unknown>).providerModelId).toBeTruthy();
+        expect((config.hermes as Record<string, unknown>).providerModelId).toBe(seed.providerModelId);
+      }
+    });
+
+    it("resolves provider-account pricing semantics", () => {
+      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+        const config = buildHermesGrokMediaModelConfigJson(seed);
+        expect(config.pricing).toEqual(
+          expect.objectContaining({ formula: "provider_account", defaultCredits: 0 }),
+        );
+      }
+    });
+
+    it("sets referenceImageLimit 3 on the two image rows and 1 on the video row", () => {
+      const byModelId = new Map(
+        HERMES_GROK_MEDIA_MODEL_SEEDS.map(seed => [
+          seed.modelId,
+          buildHermesGrokMediaModelConfigJson(seed),
+        ]),
+      );
+      expect(byModelId.get("hermes-grok/grok-imagine-image")).toEqual(
+        expect.objectContaining({ supportsReferenceImages: true, referenceImageLimit: 3 }),
+      );
+      expect(byModelId.get("hermes-grok/grok-imagine-image-quality")).toEqual(
+        expect.objectContaining({ supportsReferenceImages: true, referenceImageLimit: 3 }),
+      );
+      expect(byModelId.get("hermes-grok/grok-imagine-video")).toEqual(
+        expect.objectContaining({ supportsReferenceImages: true, referenceImageLimit: 1 }),
+      );
+    });
+
+    it("deep-equals the canonical 9:16/16:9/1:1 aspect ratio set on every row and carries durations on the video row", () => {
+      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+        const config = buildHermesGrokMediaModelConfigJson(seed);
+        expect(config.aspectRatios).toEqual(["9:16", "16:9", "1:1"]);
+      }
+      const videoSeed = HERMES_GROK_MEDIA_MODEL_SEEDS.find(
+        seed => seed.modelId === "hermes-grok/grok-imagine-video",
+      )!;
+      expect(videoSeed.durations).toBeDefined();
+      expect(videoSeed.durations!.length).toBeGreaterThan(0);
+    });
+
+    it("includes a reference-images inputField whose maxItems matches referenceImageLimit", () => {
+      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+        const config = buildHermesGrokMediaModelConfigJson(seed);
+        const inputFields = config.inputFields as Array<Record<string, unknown>>;
+        const referenceField = inputFields.find(field => field.key === "reference_image_urls");
+        expect(referenceField).toBeDefined();
+        expect(referenceField!.maxItems).toBe(seed.referenceImageLimit);
+      }
+    });
+  });
+
+  describe("transport resolution against the REAL seeded config (re-test of section 01's fixture test)", () => {
+    it("resolves every seed to hermes_worker / hermes-grok / provider_account", () => {
+      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+        const resolved = resolveMediaModelTransportConfig({
+          provider: seed.provider,
+          modelId: seed.modelId,
+          configJson: buildHermesGrokMediaModelConfigJson(seed),
+        });
+        expect(resolved.transport).toBe("hermes_worker");
+        expect(resolved.providerKey).toBe("hermes-grok");
+        expect(resolved.providerModelId).toBe(seed.providerModelId);
+        expect(resolved.creditSource).toBe("provider_account");
+      }
+    });
+
+    it("regression: an existing kie.ai-style fixture without a transport key still resolves gateway_api / smartspec_credits", () => {
+      const resolved = resolveMediaModelTransportConfig({
+        provider: "kie.ai",
+        modelId: "grok-imagine/text-to-image",
+        configJson: { kieModelId: "grok-imagine/text-to-image" },
+      });
+      expect(resolved.transport).toBe("gateway_api");
+      expect(resolved.creditSource).toBe("smartspec_credits");
+    });
+
+    it("regression: an mcp fixture still resolves mcp / provider_account", () => {
+      const resolved = resolveMediaModelTransportConfig({
+        configJson: {
+          transport: "mcp",
+          mcp: { providerKey: "magnific", providerModelId: "magnific-upscale" },
+        },
+      });
+      expect(resolved.transport).toBe("mcp");
+      expect(resolved.creditSource).toBe("provider_account");
+    });
+  });
+
+  describe("computeHermesGrokUpsertRow", () => {
+    const seed = HERMES_GROK_MEDIA_MODEL_SEEDS[0];
+
+    it("disables a brand-new row by default (no existing row)", () => {
+      const row = computeHermesGrokUpsertRow(undefined, seed);
+      expect(row.isEnabled).toBe(false);
+    });
+
+    it("preserves isEnabled: true from an existing row while refreshing name/description/configJson", () => {
+      const existingRow = { isEnabled: true };
+      const row = computeHermesGrokUpsertRow(existingRow, seed);
+      expect(row.isEnabled).toBe(true);
+      expect(row.name).toBe(seed.name);
+      expect(row.description).toBe(seed.description);
+      expect(row.configJson).toEqual(buildHermesGrokMediaModelConfigJson(seed));
+    });
+
+    it("is idempotent — re-running with the same seed yields a deep-equal row", () => {
+      const firstRun = computeHermesGrokUpsertRow(undefined, seed);
+      const secondRun = computeHermesGrokUpsertRow(
+        { isEnabled: firstRun.isEnabled },
+        seed,
+      );
+      expect(secondRun).toEqual(firstRun);
+    });
+
+    it("is idempotent when an admin has enabled the row", () => {
+      const firstRun = computeHermesGrokUpsertRow({ isEnabled: true }, seed);
+      const secondRun = computeHermesGrokUpsertRow(
+        { isEnabled: firstRun.isEnabled },
+        seed,
+      );
+      expect(secondRun).toEqual(firstRun);
+    });
+  });
+});
diff --git a/apps/web/scripts/seed-media-models-hermes-grok.ts b/apps/web/scripts/seed-media-models-hermes-grok.ts
new file mode 100644
index 000000000..06462f4dd
--- /dev/null
+++ b/apps/web/scripts/seed-media-models-hermes-grok.ts
@@ -0,0 +1,298 @@
+/**
+ * Feature 135 — Hermes Grok media worker: seed the "Grok via Hermes" media
+ * catalog rows (`hermes-grok/grok-imagine-image`,
+ * `hermes-grok/grok-imagine-image-quality`, `hermes-grok/grok-imagine-video`).
+ *
+ * These rows are deliberately shipped **disabled** (`isEnabled: false`) —
+ * enabling them is an admin rollout action, not part of this seed. Re-running
+ * this script is a no-op for `isEnabled`: the `ON CONFLICT` clause always
+ * preserves whatever value is already in the database, mirroring the pure
+ * `computeHermesGrokUpsertRow` helper's semantics (tested in
+ * `scripts/__tests__/seed-media-models-hermes-grok.test.ts`).
+ *
+ * Two-Grok-paths product rule (spec §3.1): the kie.ai gateway path already
+ * ships Grok models (`grok-imagine/text-to-image` display name "Grok Imagine",
+ * see `scripts/seed-media-models-kie-ai.ts`). Those rows are kept unchanged
+ * and offered side by side — every row here carries the "Grok via Hermes"
+ * distinction in its display name and uses only hermes-qualified aliases
+ * (never the kie.ai rows' bare "grok"/"grok-imagine"/"grok-image"/
+ * "grok-video" aliases).
+ *
+ * Run with: npx tsx scripts/seed-media-models-hermes-grok.ts [--dry-run]
+ */
+
+import postgres from "postgres";
+import { fileURLToPath } from "node:url";
+import { resolve } from "node:path";
+
+const DATABASE_URL =
+  process.env.DATABASE_URL ||
+  "postgresql://smartspec:smartspec123@localhost:5432/smartspec";
+
+export type HermesGrokMediaModelSeed = {
+  modelId: string;
+  name: string;
+  description: string;
+  modelType: "image" | "video";
+  provider: "hermes-grok";
+  providerModelId: string;
+  aliases: string[];
+  creditCost: number;
+  aspectRatios: string[];
+  durations?: number[];
+  referenceImageLimit: number;
+  defaultParams?: Record<string, unknown>;
+  priority: number;
+  sortOrder: number;
+};
+
+/** 9:16 first — VD (Vertical Drama) is the primary consumer of this transport. */
+const HERMES_GROK_ASPECT_RATIOS = ["9:16", "16:9", "1:1"];
+
+// Same underlying provider model as the kie.ai `grok-imagine-video-1-5-preview`
+// row (`scripts/seed-media-models-kie-ai.ts`) — duration options must match
+// what the provider actually renders.
+const HERMES_GROK_VIDEO_DURATIONS = Array.from({ length: 15 }, (_, index) => index + 1);
+
+/**
+ * Exactly 3 rows (spec §10.4 / plan §12). Ordering matches the spec's table:
+ * image, image-quality, video.
+ */
+export const HERMES_GROK_MEDIA_MODEL_SEEDS: HermesGrokMediaModelSeed[] = [
+  {
+    modelId: "hermes-grok/grok-imagine-image",
+    name: "Grok Imagine (Grok via Hermes)",
+    description:
+      "xAI Grok Imagine image generation and editing through a connected Grok account via the Hermes media worker (no SmartSpecPro credits deducted).",
+    modelType: "image",
+    provider: "hermes-grok",
+    providerModelId: "grok-imagine-image",
+    aliases: [
+      "hermes grok imagine",
+      "grok imagine via hermes",
+      "hermes-grok-image",
+      "grok via hermes (image)",
+    ],
+    creditCost: 0,
+    aspectRatios: HERMES_GROK_ASPECT_RATIOS,
+    referenceImageLimit: 3,
+    priority: 90,
+    sortOrder: 290,
+  },
+  {
+    modelId: "hermes-grok/grok-imagine-image-quality",
+    name: "Grok Imagine Quality (Grok via Hermes)",
+    description:
+      "xAI Grok Imagine high-quality image generation and editing through a connected Grok account via the Hermes media worker (no SmartSpecPro credits deducted).",
+    modelType: "image",
+    provider: "hermes-grok",
+    providerModelId: "grok-imagine-image-quality",
+    aliases: [
+      "hermes grok imagine quality",
+      "grok imagine quality via hermes",
+      "hermes-grok-image-quality",
+    ],
+    creditCost: 0,
+    aspectRatios: HERMES_GROK_ASPECT_RATIOS,
+    referenceImageLimit: 3,
+    defaultParams: { quality: "high" },
+    priority: 91,
+    sortOrder: 291,
+  },
+  {
+    modelId: "hermes-grok/grok-imagine-video",
+    name: "Grok Imagine Video (Grok via Hermes)",
+    description:
+      "xAI Grok Imagine image-to-video generation (single start frame) through a connected Grok account via the Hermes media worker (no SmartSpecPro credits deducted).",
+    modelType: "video",
+    provider: "hermes-grok",
+    providerModelId: "grok-imagine-video",
+    aliases: [
+      "hermes grok imagine video",
+      "grok imagine video via hermes",
+      "hermes-grok-video",
+    ],
+    creditCost: 0,
+    aspectRatios: HERMES_GROK_ASPECT_RATIOS,
+    durations: HERMES_GROK_VIDEO_DURATIONS,
+    referenceImageLimit: 1,
+    priority: 92,
+    sortOrder: 292,
+  },
+];
+
+/**
+ * `configJson` shape consumed by section 01's `resolveMediaModelTransportConfig`
+ * (`shared/mediaModelTransport.ts`), section 05's contract builder, section 09's
+ * reference trimmer (via `effectiveHermesCapability`), and section 10's form
+ * renderer. `referenceImageLimit` here is the model-row side of the capability
+ * intersection — the effective limit at submit time is
+ * `effectiveHermesCapability(modelRow, connection.capabilitiesJson, operation)`
+ * (min/AND, section 01); this row value is the ceiling, never the floor.
+ */
+export function buildHermesGrokMediaModelConfigJson(
+  seed: HermesGrokMediaModelSeed,
+): Record<string, unknown> {
+  return {
+    transport: "hermes_worker",
+    hermes: {
+      providerType: "xai_grok",
+      providerModelId: seed.providerModelId,
+      operationDefaults: { aspectRatios: seed.aspectRatios },
+    },
+    generateType: seed.modelType === "video" ? "image-to-video" : "text-to-image",
+    supportsReferenceImages: true,
+    referenceImageLimit: seed.referenceImageLimit,
+    aspectRatios: seed.aspectRatios,
+    inputFields: [
+      {
+        key: "aspect_ratio",
+        label: "Aspect Ratio",
+        type: "select",
+        options: seed.aspectRatios.map(value => ({ value, label: value })),
+        default: seed.aspectRatios[0],
+      },
+      ...(seed.modelType === "video" && seed.durations?.length
+        ? [
+            {
+              key: "duration",
+              label: "Duration",
+              type: "select",
+              options: seed.durations.map(value => ({
+                value: String(value),
+                label: `${value}s`,
+              })),
+              default: String(seed.durations[0]),
+            },
+          ]
+        : []),
+      {
+        key: "reference_image_urls",
+        label: "Reference Images",
+        type: "image_urls",
+        syncWith: "reference_images",
+        maxItems: seed.referenceImageLimit,
+        includeInPayload: false,
+      },
+    ],
+    pricing: {
+      formula: "provider_account",
+      defaultCredits: 0,
+      note: "Uses the connected Grok subscription; SmartSpecPro credits are not deducted (shared-pool fee handled by the scheduler).",
+    },
+    ...(seed.defaultParams ? { defaultParams: seed.defaultParams } : {}),
+  };
+}
+
+/** The row shape written to `media_models` (see `drizzle/schema.ts`). */
+export interface HermesGrokMediaModelRow {
+  modelId: string;
+  name: string;
+  description: string;
+  modelType: "image" | "video";
+  provider: "hermes-grok";
+  aliases: string[];
+  creditCost: number;
+  aspectRatios: string[];
+  durations: number[];
+  priority: number;
+  sortOrder: number;
+  configJson: Record<string, unknown>;
+  isEnabled: boolean;
+}
+
+/**
+ * Pure upsert-row helper — the tested source of truth for the "insert
+ * disabled, re-seed preserves admin enablement" semantics. `existingRow` is
+ * whatever the caller already knows about the row's `isEnabled` state (or
+ * `undefined` if the row does not exist yet).
+ */
+export function computeHermesGrokUpsertRow(
+  existingRow: { isEnabled: boolean } | undefined,
+  seed: HermesGrokMediaModelSeed,
+): HermesGrokMediaModelRow {
+  return {
+    modelId: seed.modelId,
+    name: seed.name,
+    description: seed.description,
+    modelType: seed.modelType,
+    provider: "hermes-grok",
+    aliases: seed.aliases,
+    creditCost: seed.creditCost,
+    aspectRatios: seed.aspectRatios,
+    durations: seed.durations ?? [],
+    priority: seed.priority,
+    sortOrder: seed.sortOrder,
+    configJson: buildHermesGrokMediaModelConfigJson(seed),
+    // Disabled by default; re-seeding preserves whatever an admin already set.
+    isEnabled: existingRow?.isEnabled ?? false,
+  };
+}
+
+export async function seedHermesGrokMediaModels(
+  options: { dryRun?: boolean } = {},
+): Promise<void> {
+  console.log("Seeding Hermes Grok media models (disabled by default)...\n");
+  for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+    console.log(
+      `  ${options.dryRun ? "dry-run " : ""}${seed.modelId} -> hermes-grok:${seed.providerModelId}`,
+    );
+  }
+  if (options.dryRun) return;
+
+  const sql = postgres(DATABASE_URL);
+  try {
+    for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
+      const row = computeHermesGrokUpsertRow(undefined, seed);
+      await sql`
+        INSERT INTO media_models (
+          "modelId", name, description, "modelType", provider,
+          aliases, "creditCost", "aspectRatios", durations,
+          priority, "sortOrder", "configJson", "isEnabled"
+        ) VALUES (
+          ${row.modelId},
+          ${row.name},
+          ${row.description},
+          ${row.modelType},
+          ${row.provider},
+          ${sql.json(row.aliases)},
+          ${row.creditCost},
+          ${sql.json(row.aspectRatios)},
+          ${sql.json(row.durations)},
+          ${row.priority},
+          ${row.sortOrder},
+          ${sql.json(row.configJson)},
+          ${row.isEnabled}
+        )
+        ON CONFLICT ("modelId") DO UPDATE SET
+          name = EXCLUDED.name,
+          description = EXCLUDED.description,
+          "modelType" = EXCLUDED."modelType",
+          provider = EXCLUDED.provider,
+          aliases = EXCLUDED.aliases,
+          "creditCost" = EXCLUDED."creditCost",
+          "aspectRatios" = EXCLUDED."aspectRatios",
+          durations = EXCLUDED.durations,
+          priority = EXCLUDED.priority,
+          "sortOrder" = EXCLUDED."sortOrder",
+          "configJson" = EXCLUDED."configJson",
+          "isEnabled" = media_models."isEnabled"
+      `;
+    }
+    console.log(
+      `\nUpserted ${HERMES_GROK_MEDIA_MODEL_SEEDS.length} Hermes Grok media model records (isEnabled preserved on re-run).`,
+    );
+  } finally {
+    await sql.end();
+  }
+}
+
+const isMainModule = process.argv[1]
+  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
+  : false;
+
+if (isMainModule) {
+  void seedHermesGrokMediaModels({
+    dryRun: process.argv.includes("--dry-run"),
+  });
+}
diff --git a/apps/web/server/services/__tests__/mediaTransportResolver.test.ts b/apps/web/server/services/__tests__/mediaTransportResolver.test.ts
index d1bd4b569..eec92023b 100644
--- a/apps/web/server/services/__tests__/mediaTransportResolver.test.ts
+++ b/apps/web/server/services/__tests__/mediaTransportResolver.test.ts
@@ -1,6 +1,29 @@
-import { describe, expect, it } from "vitest";
+import { describe, expect, it, vi, beforeEach } from "vitest";
+import type { TRPCError } from "@trpc/server";
 
-import { defaultMcpToolNameForProvider } from "../mediaTransportResolver";
+// Feature 135 — Hermes Grok media worker transport arm tests. The resolver's
+// static imports are mocked so the hermes_worker branch never touches the DB
+// or the MCP connection-sharing policy — see the "never calls" assertions
+// below.
+const mockGetTenantFeatureFlags = vi.hoisted(() => vi.fn());
+const mockGetHermesWorkerSettings = vi.hoisted(() => vi.fn());
+const mockAssertMcpSharePolicyAllowed = vi.hoisted(() => vi.fn());
+const mockGetDb = vi.hoisted(() => vi.fn());
+
+vi.mock("../tenantFeatureFlagService", () => ({
+  getTenantFeatureFlags: mockGetTenantFeatureFlags,
+}));
+vi.mock("../hermesWorkerSettings", () => ({
+  getHermesWorkerSettings: mockGetHermesWorkerSettings,
+}));
+vi.mock("../mcpConnectionSharingService", () => ({
+  assertMcpSharePolicyAllowed: mockAssertMcpSharePolicyAllowed,
+}));
+vi.mock("../../db", () => ({
+  getDb: mockGetDb,
+}));
+
+import { defaultMcpToolNameForProvider, resolveMediaTransport } from "../mediaTransportResolver";
 
 describe("mediaTransportResolver", () => {
   it("defaults Higgsfield MCP tools to provider-native tool names", () => {
@@ -33,3 +56,157 @@ describe("mediaTransportResolver", () => {
     ).toBe("video_generate");
   });
 });
+
+describe("resolveMediaTransport (Feature 135 — hermes_worker arm)", () => {
+  const BASE_INPUT = {
+    tenantId: "tenant-1",
+    actorUserId: 7,
+    originSurface: "media_studio" as const,
+    assetType: "image" as const,
+  };
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetTenantFeatureFlags.mockResolvedValue({ hermesMediaWorker: true } as any);
+    mockGetHermesWorkerSettings.mockResolvedValue({ enabled: true } as any);
+  });
+
+  describe("regression — existing gateway/mcp behavior stays byte-identical", () => {
+    it("gateway happy path (no requestedTransport, no connection ids) returns the exact metadata shape it returns today", async () => {
+      const result = await resolveMediaTransport({
+        ...BASE_INPUT,
+        idempotencyKey: "idem-1",
+      });
+
+      expect(result).toEqual({
+        transport: "gateway_api",
+        tenantId: "tenant-1",
+        originSurface: "media_studio",
+        assetType: "image",
+        actorUserId: 7,
+        creditPolicy: "smartspec_credits",
+        idempotencyKey: "idem-1",
+      });
+      expect(mockGetTenantFeatureFlags).not.toHaveBeenCalled();
+      expect(mockGetHermesWorkerSettings).not.toHaveBeenCalled();
+      expect(mockAssertMcpSharePolicyAllowed).not.toHaveBeenCalled();
+      expect(mockGetDb).not.toHaveBeenCalled();
+    });
+
+    it("gateway happy path with explicit requestedTransport: gateway_api behaves identically", async () => {
+      const result = await resolveMediaTransport({
+        ...BASE_INPUT,
+        requestedTransport: "gateway_api",
+      });
+      expect(result.transport).toBe("gateway_api");
+      expect(result.creditPolicy).toBe("smartspec_credits");
+    });
+  });
+
+  describe("cross-transport connection-id rejections", () => {
+    it("rejects hermesConnectionId on a gateway request (no requestedTransport)", async () => {
+      await expect(
+        resolveMediaTransport({ ...BASE_INPUT, hermesConnectionId: "hc-1" })
+      ).rejects.toMatchObject<Partial<TRPCError>>({
+        code: "BAD_REQUEST",
+        message: "hermesConnectionId requires transport=hermes_worker",
+      });
+    });
+
+    it("rejects hermesConnectionId on requestedTransport: mcp", async () => {
+      await expect(
+        resolveMediaTransport({
+          ...BASE_INPUT,
+          requestedTransport: "mcp",
+          hermesConnectionId: "hc-1",
+        })
+      ).rejects.toMatchObject<Partial<TRPCError>>({
+        code: "BAD_REQUEST",
+        message: "hermesConnectionId requires transport=hermes_worker",
+      });
+      expect(mockGetTenantFeatureFlags).not.toHaveBeenCalled();
+    });
+
+    it("rejects mcpConnectionId on requestedTransport: hermes_worker (reverse mirror)", async () => {
+      await expect(
+        resolveMediaTransport({
+          ...BASE_INPUT,
+          requestedTransport: "hermes_worker",
+          mcpConnectionId: "mcp-1",
+        })
+      ).rejects.toMatchObject<Partial<TRPCError>>({
+        code: "BAD_REQUEST",
+        message: "mcpConnectionId requires transport=mcp",
+      });
+    });
+
+    it("rejects a hermes_worker request with no hermesConnectionId", async () => {
+      const promise = resolveMediaTransport({
+        ...BASE_INPUT,
+        requestedTransport: "hermes_worker",
+      });
+      await expect(promise).rejects.toMatchObject<Partial<TRPCError>>({
+        code: "BAD_REQUEST",
+      });
+      await promise.catch((error: TRPCError) => {
+        expect(error.message.startsWith("[HERMES_CONNECTION_REQUIRED]")).toBe(true);
+      });
+    });
+  });
+
+  describe("hermes branch — fail-closed flags", () => {
+    it("rejects with FORBIDDEN when the tenant flag hermesMediaWorker is false", async () => {
+      mockGetTenantFeatureFlags.mockResolvedValue({ hermesMediaWorker: false } as any);
+      const promise = resolveMediaTransport({
+        ...BASE_INPUT,
+        requestedTransport: "hermes_worker",
+        hermesConnectionId: "hc-1",
+      });
+      await expect(promise).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
+      await promise.catch((error: TRPCError) => {
+        expect(error.message.startsWith("[HERMES_DISABLED]")).toBe(true);
+      });
+      expect(mockGetHermesWorkerSettings).not.toHaveBeenCalled();
+    });
+
+    it("rejects with FORBIDDEN when the tenant flag is true but the global kill switch is disabled", async () => {
+      mockGetHermesWorkerSettings.mockResolvedValue({ enabled: false } as any);
+      const promise = resolveMediaTransport({
+        ...BASE_INPUT,
+        requestedTransport: "hermes_worker",
+        hermesConnectionId: "hc-1",
+      });
+      await expect(promise).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
+      await promise.catch((error: TRPCError) => {
+        expect(error.message.startsWith("[HERMES_DISABLED]")).toBe(true);
+      });
+    });
+  });
+
+  describe("hermes branch — happy path", () => {
+    it("returns hermes_worker metadata and never touches DB or MCP share policy", async () => {
+      const result = await resolveMediaTransport({
+        ...BASE_INPUT,
+        requestedTransport: "hermes_worker",
+        hermesConnectionId: "hc-1",
+        providerModelId: "grok-imagine-image",
+        idempotencyKey: "idem-42",
+      });
+
+      expect(result).toEqual({
+        transport: "hermes_worker",
+        tenantId: "tenant-1",
+        originSurface: "media_studio",
+        assetType: "image",
+        actorUserId: 7,
+        connectionId: "hc-1",
+        providerKey: "hermes-grok",
+        providerModelId: "grok-imagine-image",
+        creditPolicy: "provider_account",
+        idempotencyKey: "idem-42",
+      });
+      expect(mockAssertMcpSharePolicyAllowed).not.toHaveBeenCalled();
+      expect(mockGetDb).not.toHaveBeenCalled();
+    });
+  });
+});
diff --git a/apps/web/server/services/mediaTransportResolver.ts b/apps/web/server/services/mediaTransportResolver.ts
index bd2acf295..196e265a1 100644
--- a/apps/web/server/services/mediaTransportResolver.ts
+++ b/apps/web/server/services/mediaTransportResolver.ts
@@ -7,9 +7,17 @@ import type {
 } from "../../shared/mcpConnectTypes";
 import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
 import { assertMcpSharePolicyAllowed } from "./mcpConnectionSharingService";
+import { listMcpConnections } from "./mcpConnectionService";
 import { getDb } from "../db";
 import { mcpProviderTemplates } from "../../drizzle/schema";
 import { eq } from "drizzle-orm";
+// Feature 135 — Hermes Grok media worker transport arm. `getHermesWorkerSettings`
+// is the global kill switch reader; `formatHermesErrorMessage` is the shared
+// typed error-code wire convention (section 01). This resolver performs no DB
+// reads and no connection-ownership checks for the hermes_worker arm — the
+// hermes media scheduler (section 05) is the single authority for that.
+import { getHermesWorkerSettings } from "./hermesWorkerSettings";
+import { formatHermesErrorMessage } from "../../shared/hermesMedia";
 
 export interface MediaTransportResolveInput {
   tenantId: string;
@@ -18,6 +26,7 @@ export interface MediaTransportResolveInput {
   assetType: MediaAssetType;
   requestedTransport?: MediaTransport;
   mcpConnectionId?: string;
+  hermesConnectionId?: string;
   sharedGroupId?: number;
   approvalId?: string;
   providerKey?: string;
@@ -60,6 +69,9 @@ export async function resolveMediaTransport(input: MediaTransportResolveInput):
     if (input.mcpConnectionId) {
       throw new TRPCError({ code: "BAD_REQUEST", message: "mcpConnectionId requires transport=mcp" });
     }
+    if (input.hermesConnectionId) {
+      throw new TRPCError({ code: "BAD_REQUEST", message: "hermesConnectionId requires transport=hermes_worker" });
+    }
     return {
       transport: "gateway_api",
       tenantId: input.tenantId,
@@ -70,6 +82,58 @@ export async function resolveMediaTransport(input: MediaTransportResolveInput):
       idempotencyKey: input.idempotencyKey,
     };
   }
+
+  // Feature 135 — Hermes Grok media worker transport arm. Inserted after the
+  // gateway early-return and before any MCP flag logic below. Shallow
+  // validation only — no DB reads, no connection ownership check. The
+  // hermes media scheduler (section 05) is the single authority that
+  // authorizes/admits a specific hermesConnectionId; duplicating that check
+  // here would create two sources of truth.
+  if (input.requestedTransport === "hermes_worker") {
+    if (input.mcpConnectionId) {
+      throw new TRPCError({ code: "BAD_REQUEST", message: "mcpConnectionId requires transport=mcp" });
+    }
+    const flags = await getTenantFeatureFlags(input.tenantId);
+    if (!flags.hermesMediaWorker) {
+      throw new TRPCError({
+        code: "FORBIDDEN",
+        message: formatHermesErrorMessage("HERMES_DISABLED", "tenant flag disabled"),
+      });
+    }
+    const settings = await getHermesWorkerSettings();
+    if (!settings.enabled) {
+      // Global kill switch. The hermes media scheduler re-checks per-scope
+      // flags on submit — duplication here is deliberate defense in depth.
+      throw new TRPCError({
+        code: "FORBIDDEN",
+        message: formatHermesErrorMessage("HERMES_DISABLED", "worker disabled"),
+      });
+    }
+    if (!input.hermesConnectionId) {
+      throw new TRPCError({
+        code: "BAD_REQUEST",
+        message: formatHermesErrorMessage("HERMES_CONNECTION_REQUIRED"),
+      });
+    }
+    return {
+      transport: "hermes_worker",
+      tenantId: input.tenantId,
+      originSurface: input.originSurface,
+      assetType: input.assetType,
+      actorUserId: input.actorUserId,
+      connectionId: input.hermesConnectionId,
+      providerKey: "hermes-grok",
+      providerModelId: input.providerModelId,
+      creditPolicy: "provider_account",
+      idempotencyKey: input.idempotencyKey,
+    };
+  }
+
+  // MCP branch (requestedTransport === "mcp"): a request can never carry
+  // both connection ids.
+  if (input.hermesConnectionId) {
+    throw new TRPCError({ code: "BAD_REQUEST", message: "hermesConnectionId requires transport=hermes_worker" });
+  }
   const flags = await getTenantFeatureFlags(input.tenantId);
   if (!flags.mcpConnectEnabled || !flags[surfaceFlag(input.originSurface)]) {
     throw new TRPCError({ code: "FORBIDDEN", message: "MCP transport is disabled for this surface" });
@@ -83,8 +147,39 @@ export async function resolveMediaTransport(input: MediaTransportResolveInput):
   if (!flags.mcpProviderCreditsTrackedEnabled) {
     throw new TRPCError({ code: "FORBIDDEN", message: "MCP provider credit tracking is disabled" });
   }
-  if (!input.mcpConnectionId) {
-    throw new TRPCError({ code: "BAD_REQUEST", message: "MCP connection is required" });
+  // Resolve which connection this job runs on. The client normally pins one via
+  // the MCP connection picker, but that picker populates asynchronously and its
+  // localStorage cache can silently fail (full/blocked storage), so a generate
+  // fired before it settles arrives with no connection id. Rather than reject a
+  // request the actor is fully entitled to make, resolve it from the actor's OWN
+  // eligible connections — `listMcpConnections` already enforces ownership for
+  // personal ones and enabled-share + ACTIVE membership for shared ones, so this
+  // never widens access. Only auto-resolve when the choice is unambiguous
+  // (personal default, or a single eligible account); with several eligible
+  // accounts the caller must pick, since each bills a different provider account.
+  let connectionId = input.mcpConnectionId;
+  if (!connectionId) {
+    const eligible = (
+      await listMcpConnections({ tenantId: input.tenantId, userId: input.actorUserId })
+    ).filter((candidate) => (
+      candidate.status === "connected" &&
+      (!input.providerKey || candidate.providerKey === input.providerKey) &&
+      (!candidate.allowedAssetTypes?.length || candidate.allowedAssetTypes.includes(input.assetType))
+    ));
+    const personalDefault = eligible.find((candidate) => (
+      candidate.connectionScope === "personal" &&
+      (input.assetType === "image" ? candidate.defaultForImage : candidate.defaultForVideo)
+    ));
+    const resolved = personalDefault ?? (eligible.length === 1 ? eligible[0] : undefined);
+    if (!resolved) {
+      throw new TRPCError({
+        code: "BAD_REQUEST",
+        message: eligible.length > 1
+          ? `Select an MCP account — several ${input.providerKey ?? "MCP"} accounts are available.`
+          : `This model requires a connected ${input.providerKey ?? "MCP"} MCP account. Connect one (or ask the owner to share theirs with your group) first.`,
+      });
+    }
+    connectionId = resolved.id;
   }
   const toolName =
     input.toolName ??
@@ -95,7 +190,7 @@ export async function resolveMediaTransport(input: MediaTransportResolveInput):
   const policy = await assertMcpSharePolicyAllowed({
     tenantId: input.tenantId,
     actorUserId: input.actorUserId,
-    connectionId: input.mcpConnectionId,
+    connectionId,
     groupId: input.sharedGroupId,
     assetType: input.assetType,
     toolName,
@@ -124,8 +219,13 @@ export async function resolveMediaTransport(input: MediaTransportResolveInput):
     assetType: input.assetType,
     actorUserId: input.actorUserId,
     ownerUserId: policy.connection.ownerUserId,
-    connectionId: input.mcpConnectionId,
-    sharedGroupId: input.sharedGroupId,
+    connectionId,
+    // Use the group the policy actually resolved (see
+    // `assertMcpSharePolicyAllowed`) so task metadata + usage events record the
+    // authorizing group even when the client submitted no/stale `sharedGroupId`
+    // — falls back to the client value for owner/personal use where there's no
+    // share.
+    sharedGroupId: policy.share?.groupId ?? input.sharedGroupId,
     shareId: policy.share?.id,
     connectionScope: policy.scope,
     providerKey: providerTemplate?.providerKey ?? input.providerKey,
diff --git a/apps/web/shared/mcpConnectTypes.ts b/apps/web/shared/mcpConnectTypes.ts
index e5f04e60c..fb6762ad1 100644
--- a/apps/web/shared/mcpConnectTypes.ts
+++ b/apps/web/shared/mcpConnectTypes.ts
@@ -10,7 +10,15 @@ export type MediaOriginSurface =
   | "auto_storyboard_review"
   | "marketplace_capture"
   | "storyboard_review";
-export type McpCreditPolicy = "smartspec_credits" | "provider_credits_tracked";
+// "provider_account" is the hermes_worker transport arm's value (Feature 135
+// — matches `MediaModelTransportConfig.creditSource` in
+// `shared/mediaModelTransport.ts`). Additive widening only — existing
+// `smartspec_credits` / `provider_credits_tracked` equality checks in
+// consumers are unaffected.
+export type McpCreditPolicy =
+  | "smartspec_credits"
+  | "provider_credits_tracked"
+  | "provider_account";
 export type McpConnectionScope = "personal" | "shared";
 
 export interface MediaTaskTransportMetadata {
