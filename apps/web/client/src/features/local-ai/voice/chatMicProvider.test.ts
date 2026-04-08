import { describe, expect, it } from "vitest";

import { resolveChatMicProvider } from "./chatMicProvider";

describe("resolveChatMicProvider", () => {
  it("keeps legacy_stt when the user selected it", () => {
    expect(
      resolveChatMicProvider({
        preferredMode: "legacy_stt",
        localVoiceSupported: false,
      }),
    ).toMatchObject({
      effectiveMode: "legacy_stt",
      fallbackApplied: false,
    });
  });

  it("auto-falls back to legacy when local voice is unsupported", () => {
    expect(
      resolveChatMicProvider({
        preferredMode: "auto",
        localVoiceSupported: false,
      }),
    ).toMatchObject({
      effectiveMode: "legacy_stt",
      fallbackApplied: true,
    });
  });

  it("promotes auto mode to local when local voice is ready", () => {
    expect(
      resolveChatMicProvider({
        preferredMode: "auto",
        localVoiceSupported: true,
      }),
    ).toMatchObject({
      effectiveMode: "gemma4_local",
      fallbackApplied: false,
    });
  });
});
