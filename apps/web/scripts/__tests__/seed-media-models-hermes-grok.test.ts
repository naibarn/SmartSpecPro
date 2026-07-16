import { describe, expect, it } from "vitest";

import {
  HERMES_GROK_MEDIA_MODEL_SEEDS,
  buildHermesGrokMediaModelConfigJson,
  computeHermesGrokUpsertRow,
} from "../seed-media-models-hermes-grok";
import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";

// Bare kie.ai Grok aliases (`scripts/seed-media-models-kie-ai.ts`) — the new
// hermes-grok rows must never collide with these (spec §3.1).
const KIE_AI_BARE_GROK_ALIASES = ["grok", "grok-imagine", "grok-image", "grok-video"];

describe("seed-media-models-hermes-grok", () => {
  describe("HERMES_GROK_MEDIA_MODEL_SEEDS", () => {
    it("exports exactly 3 entries with the expected modelIds and modelTypes", () => {
      expect(HERMES_GROK_MEDIA_MODEL_SEEDS).toHaveLength(3);
      const byModelId = new Map(
        HERMES_GROK_MEDIA_MODEL_SEEDS.map(seed => [seed.modelId, seed]),
      );
      expect(byModelId.get("hermes-grok/grok-imagine-image")?.modelType).toBe("image");
      expect(byModelId.get("hermes-grok/grok-imagine-image-quality")?.modelType).toBe("image");
      expect(byModelId.get("hermes-grok/grok-imagine-video")?.modelType).toBe("video");
    });

    it("gives every row a 'Grok via Hermes' display name, mutually distinct, never the kie.ai literal", () => {
      const names = HERMES_GROK_MEDIA_MODEL_SEEDS.map(seed => seed.name);
      for (const name of names) {
        expect(name).toContain("Grok via Hermes");
        expect(name).not.toBe("Grok Imagine");
      }
      expect(new Set(names).size).toBe(names.length);
    });

    it("sets provider hermes-grok and creditCost 0 on every row", () => {
      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
        expect(seed.provider).toBe("hermes-grok");
        expect(seed.creditCost).toBe(0);
      }
    });

    it("never uses a bare kie.ai Grok alias; every alias is hermes-qualified", () => {
      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
        for (const alias of seed.aliases) {
          expect(KIE_AI_BARE_GROK_ALIASES).not.toContain(alias);
          expect(alias.toLowerCase()).toContain("hermes");
        }
      }
    });
  });

  describe("buildHermesGrokMediaModelConfigJson", () => {
    it("marks transport hermes_worker with an xai_grok hermes block per row", () => {
      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
        const config = buildHermesGrokMediaModelConfigJson(seed);
        expect(config.transport).toBe("hermes_worker");
        expect((config.hermes as Record<string, unknown>).providerType).toBe("xai_grok");
        expect((config.hermes as Record<string, unknown>).providerModelId).toBeTruthy();
        expect((config.hermes as Record<string, unknown>).providerModelId).toBe(seed.providerModelId);
      }
    });

    it("resolves provider-account pricing semantics", () => {
      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
        const config = buildHermesGrokMediaModelConfigJson(seed);
        expect(config.pricing).toEqual(
          expect.objectContaining({ formula: "provider_account", defaultCredits: 0 }),
        );
      }
    });

    it("sets referenceImageLimit 3 on the two image rows and 1 on the video row", () => {
      const byModelId = new Map(
        HERMES_GROK_MEDIA_MODEL_SEEDS.map(seed => [
          seed.modelId,
          buildHermesGrokMediaModelConfigJson(seed),
        ]),
      );
      expect(byModelId.get("hermes-grok/grok-imagine-image")).toEqual(
        expect.objectContaining({ supportsReferenceImages: true, referenceImageLimit: 3 }),
      );
      expect(byModelId.get("hermes-grok/grok-imagine-image-quality")).toEqual(
        expect.objectContaining({ supportsReferenceImages: true, referenceImageLimit: 3 }),
      );
      expect(byModelId.get("hermes-grok/grok-imagine-video")).toEqual(
        expect.objectContaining({ supportsReferenceImages: true, referenceImageLimit: 1 }),
      );
    });

    it("deep-equals the canonical 9:16/16:9/1:1 aspect ratio set on every row and carries durations on the video row", () => {
      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
        const config = buildHermesGrokMediaModelConfigJson(seed);
        expect(config.aspectRatios).toEqual(["9:16", "16:9", "1:1"]);
      }
      const videoSeed = HERMES_GROK_MEDIA_MODEL_SEEDS.find(
        seed => seed.modelId === "hermes-grok/grok-imagine-video",
      )!;
      expect(videoSeed.durations).toBeDefined();
      expect(videoSeed.durations!.length).toBeGreaterThan(0);
    });

    it("includes a reference-images inputField whose maxItems matches referenceImageLimit", () => {
      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
        const config = buildHermesGrokMediaModelConfigJson(seed);
        const inputFields = config.inputFields as Array<Record<string, unknown>>;
        const referenceField = inputFields.find(field => field.key === "reference_image_urls");
        expect(referenceField).toBeDefined();
        expect(referenceField!.maxItems).toBe(seed.referenceImageLimit);
      }
    });
  });

  describe("transport resolution against the REAL seeded config (re-test of section 01's fixture test)", () => {
    it("resolves every seed to hermes_worker / hermes-grok / provider_account", () => {
      for (const seed of HERMES_GROK_MEDIA_MODEL_SEEDS) {
        const resolved = resolveMediaModelTransportConfig({
          provider: seed.provider,
          modelId: seed.modelId,
          configJson: buildHermesGrokMediaModelConfigJson(seed),
        });
        expect(resolved.transport).toBe("hermes_worker");
        expect(resolved.providerKey).toBe("hermes-grok");
        expect(resolved.providerModelId).toBe(seed.providerModelId);
        expect(resolved.creditSource).toBe("provider_account");
      }
    });

    it("regression: an existing kie.ai-style fixture without a transport key still resolves gateway_api / smartspec_credits", () => {
      const resolved = resolveMediaModelTransportConfig({
        provider: "kie.ai",
        modelId: "grok-imagine/text-to-image",
        configJson: { kieModelId: "grok-imagine/text-to-image" },
      });
      expect(resolved.transport).toBe("gateway_api");
      expect(resolved.creditSource).toBe("smartspec_credits");
    });

    it("regression: an mcp fixture still resolves mcp / provider_account", () => {
      const resolved = resolveMediaModelTransportConfig({
        configJson: {
          transport: "mcp",
          mcp: { providerKey: "magnific", providerModelId: "magnific-upscale" },
        },
      });
      expect(resolved.transport).toBe("mcp");
      expect(resolved.creditSource).toBe("provider_account");
    });
  });

  describe("computeHermesGrokUpsertRow", () => {
    const seed = HERMES_GROK_MEDIA_MODEL_SEEDS[0];

    it("disables a brand-new row by default (no existing row)", () => {
      const row = computeHermesGrokUpsertRow(undefined, seed);
      expect(row.isEnabled).toBe(false);
    });

    it("preserves isEnabled: true from an existing row while refreshing name/description/configJson", () => {
      const existingRow = { isEnabled: true };
      const row = computeHermesGrokUpsertRow(existingRow, seed);
      expect(row.isEnabled).toBe(true);
      expect(row.name).toBe(seed.name);
      expect(row.description).toBe(seed.description);
      expect(row.configJson).toEqual(buildHermesGrokMediaModelConfigJson(seed));
    });

    it("is idempotent — re-running with the same seed yields a deep-equal row", () => {
      const firstRun = computeHermesGrokUpsertRow(undefined, seed);
      const secondRun = computeHermesGrokUpsertRow(
        { isEnabled: firstRun.isEnabled },
        seed,
      );
      expect(secondRun).toEqual(firstRun);
    });

    it("is idempotent when an admin has enabled the row", () => {
      const firstRun = computeHermesGrokUpsertRow({ isEnabled: true }, seed);
      const secondRun = computeHermesGrokUpsertRow(
        { isEnabled: firstRun.isEnabled },
        seed,
      );
      expect(secondRun).toEqual(firstRun);
    });
  });
});
