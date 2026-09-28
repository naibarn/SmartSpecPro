import { describe, expect, it } from "vitest";
import {
  resolveTransparentBackgroundCapability,
  resolveTransparentBackgroundRequest,
} from "../mediaModelCapabilities";

describe("media model transparent background capability", () => {
  it("fails closed when a model does not explicitly opt in", () => {
    expect(resolveTransparentBackgroundCapability({})).toBeNull();
    expect(resolveTransparentBackgroundRequest({}, { background: "transparent" })).toEqual({
      capability: null,
      requested: true,
    });
  });

  it("uses safe defaults for an opted-in model", () => {
    const capability = resolveTransparentBackgroundCapability({
      supportsTransparentBackground: true,
    });
    expect(capability).toEqual({
      inputKey: "background",
      enabledValue: "transparent",
      disabledValue: "auto",
      outputFormat: "png",
    });
  });

  it("supports provider-specific input values", () => {
    const config = {
      supportsTransparentBackground: true,
      transparentBackground: {
        inputKey: "alpha_mode",
        enabledValue: "alpha",
        disabledValue: "opaque",
        outputFormat: "webp",
      },
    };
    expect(resolveTransparentBackgroundRequest(config, { alpha_mode: "alpha" })).toEqual({
      capability: {
        inputKey: "alpha_mode",
        enabledValue: "alpha",
        disabledValue: "opaque",
        outputFormat: "webp",
      },
      requested: true,
    });
  });

  it("does not treat the configured off value as a request", () => {
    expect(resolveTransparentBackgroundRequest(
      { supportsTransparentBackground: true },
      { background: "auto" },
    ).requested).toBe(false);
  });
});

