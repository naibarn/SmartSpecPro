import { describe, expect, it } from "vitest";

import {
  getMediaModelTransportLabel,
  modelUsesHermesTransport,
  modelUsesMcpTransport,
  resolveMediaModelTransportConfig,
} from "../mediaModelTransport";

describe("hermes_worker transport resolution (Feature 135)", () => {
  it("resolves the hermes_worker transport arm from configJson", () => {
    const config = resolveMediaModelTransportConfig({
      provider: "xai",
      modelId: "grok-imagine-image",
      configJson: {
        transport: "hermes_worker",
        hermes: { providerType: "xai_grok", providerModelId: "grok-imagine-image" },
      },
    });

    expect(config).toEqual({
      transport: "hermes_worker",
      providerKey: "hermes-grok",
      providerModelId: "grok-imagine-image",
      toolName: undefined,
      argumentShape: undefined,
      defaultParams: {},
      creditSource: "provider_account",
    });
  });

  it("returns a distinct label for the hermes arm", () => {
    expect(
      getMediaModelTransportLabel({ transport: "hermes_worker", creditSource: "provider_account" }),
    ).toBe("Hermes");
  });

  it("regression: an existing mcp fixture still resolves to mcp / provider_account", () => {
    const config = resolveMediaModelTransportConfig({
      configJson: {
        transport: "mcp",
        mcp: {
          providerKey: "magnific",
          providerModelId: "magnific-upscale",
          toolName: "upscale",
          argumentShape: "flat",
        },
      },
    });

    expect(config.transport).toBe("mcp");
    expect(config.creditSource).toBe("provider_account");
    expect(config.providerKey).toBe("magnific");
    expect(getMediaModelTransportLabel(config)).toBe("MCP");
  });

  it("regression: a plain/absent transport still resolves to gateway_api / smartspec_credits", () => {
    const config = resolveMediaModelTransportConfig({
      provider: "kie",
      modelId: "some-model",
      configJson: {},
    });

    expect(config.transport).toBe("gateway_api");
    expect(config.creditSource).toBe("smartspec_credits");
    expect(getMediaModelTransportLabel(config)).toBe("API");
  });

  describe("modelUsesHermesTransport / modelUsesMcpTransport (section-10 gating helpers)", () => {
    it("modelUsesHermesTransport is true only for a hermes_worker configJson", () => {
      expect(modelUsesHermesTransport({ transport: "hermes_worker" })).toBe(true);
      expect(modelUsesHermesTransport({ transport: "mcp" })).toBe(false);
      expect(modelUsesHermesTransport({})).toBe(false);
      expect(modelUsesHermesTransport(undefined)).toBe(false);
    });

    it("modelUsesMcpTransport is true only for an mcp configJson (regression)", () => {
      expect(modelUsesMcpTransport({ transport: "mcp" })).toBe(true);
      expect(modelUsesMcpTransport({ transport: "hermes_worker" })).toBe(false);
      expect(modelUsesMcpTransport({})).toBe(false);
    });
  });
});
