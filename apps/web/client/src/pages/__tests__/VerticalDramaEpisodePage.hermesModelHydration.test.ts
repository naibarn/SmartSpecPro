import { describe, expect, it } from "vitest";

import { shouldHydrateRememberedVdModel } from "../VerticalDramaEpisodePage";

/**
 * Feature 135 (Hermes/Grok media worker), section-10 §3.4 — pure guard for
 * the "hydrate the remembered per-series model into a brand-new episode"
 * auto-hydration effect. Mirrors the codebase's convention of unit-testing
 * extracted pure helpers directly (see `VerticalDramaEpisodePage.voiceChainFlag.test.ts`).
 */
const HERMES_MODEL_ROW = {
  isEnabled: true,
  configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-image" } },
};

const GATEWAY_MODEL_ROW = {
  isEnabled: true,
  configJson: {},
};

const MCP_MODEL_ROW = {
  isEnabled: true,
  configJson: { transport: "mcp", mcp: { providerKey: "magnific" } },
};

describe("shouldHydrateRememberedVdModel", () => {
  it("hydrates a remembered hermes model when the row is enabled AND an authorized connection exists", () => {
    expect(
      shouldHydrateRememberedVdModel({
        rememberedModelId: "hermes-grok/grok-imagine-image",
        modelRow: HERMES_MODEL_ROW,
        hasAuthorizedHermesConnection: true,
      }),
    ).toBe(true);
  });

  it("does NOT hydrate a remembered hermes model when no authorized connection exists (no fallback)", () => {
    expect(
      shouldHydrateRememberedVdModel({
        rememberedModelId: "hermes-grok/grok-imagine-image",
        modelRow: HERMES_MODEL_ROW,
        hasAuthorizedHermesConnection: false,
      }),
    ).toBe(false);
  });

  it("does NOT hydrate a remembered hermes model when the row is disabled, even with an authorized connection", () => {
    expect(
      shouldHydrateRememberedVdModel({
        rememberedModelId: "hermes-grok/grok-imagine-image",
        modelRow: { ...HERMES_MODEL_ROW, isEnabled: false },
        hasAuthorizedHermesConnection: true,
      }),
    ).toBe(false);
  });

  it("regression: a remembered gateway model hydrates for an enabled row without consulting hermes connections", () => {
    expect(
      shouldHydrateRememberedVdModel({
        rememberedModelId: "kie/some-model",
        modelRow: GATEWAY_MODEL_ROW,
        hasAuthorizedHermesConnection: false,
      }),
    ).toBe(true);
  });

  it("regression: a remembered MCP model hydrates for an enabled row without consulting hermes connections", () => {
    expect(
      shouldHydrateRememberedVdModel({
        rememberedModelId: "magnific/upscale",
        modelRow: MCP_MODEL_ROW,
        hasAuthorizedHermesConnection: false,
      }),
    ).toBe(true);
  });

  it("does not hydrate a disabled gateway/MCP row (regression, pre-existing behavior)", () => {
    expect(
      shouldHydrateRememberedVdModel({
        rememberedModelId: "kie/some-model",
        modelRow: { ...GATEWAY_MODEL_ROW, isEnabled: false },
        hasAuthorizedHermesConnection: false,
      }),
    ).toBe(false);
  });

  it("does not hydrate when the model row cannot be resolved at all (stale/unknown id)", () => {
    expect(
      shouldHydrateRememberedVdModel({
        rememberedModelId: "unknown-model",
        modelRow: null,
        hasAuthorizedHermesConnection: true,
      }),
    ).toBe(false);
  });

  it("does not hydrate when there is no remembered model id", () => {
    expect(
      shouldHydrateRememberedVdModel({
        rememberedModelId: "",
        modelRow: HERMES_MODEL_ROW,
        hasAuthorizedHermesConnection: true,
      }),
    ).toBe(false);
  });
});
