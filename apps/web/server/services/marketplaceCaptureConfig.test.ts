import { afterEach, describe, expect, it } from "vitest";

import { getMarketplaceCaptureConfig } from "./marketplaceCaptureConfig";

const originalCanonical = process.env.COMPANION_EXTENSION_ALLOWED_ORIGINS;
const originalLegacy = process.env.MARKETPLACE_EXTENSION_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalCanonical == null) delete process.env.COMPANION_EXTENSION_ALLOWED_ORIGINS;
  else process.env.COMPANION_EXTENSION_ALLOWED_ORIGINS = originalCanonical;
  if (originalLegacy == null) delete process.env.MARKETPLACE_EXTENSION_ALLOWED_ORIGINS;
  else process.env.MARKETPLACE_EXTENSION_ALLOWED_ORIGINS = originalLegacy;
});

describe("SmartAIHub Companion origin configuration", () => {
  it("prefers the canonical allowlist variable", () => {
    process.env.COMPANION_EXTENSION_ALLOWED_ORIGINS = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.MARKETPLACE_EXTENSION_ALLOWED_ORIGINS = "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(getMarketplaceCaptureConfig().allowedOrigins).toEqual([
      "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
  });

  it("falls back to the legacy allowlist variable", () => {
    delete process.env.COMPANION_EXTENSION_ALLOWED_ORIGINS;
    process.env.MARKETPLACE_EXTENSION_ALLOWED_ORIGINS = "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(getMarketplaceCaptureConfig().allowedOrigins).toEqual([
      "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
  });
});
