import { describe, expect, it } from "vitest";

import {
  getLocalAiVoiceConsentSummary,
  mergeLocalAiPreferences,
  resolveLocalAiPreferences,
  sanitizeUserPreferencesWithLocalAi,
} from "../localAiPreferences";

describe("resolveLocalAiPreferences", () => {
  it("returns safe defaults when localAi is absent", () => {
    expect(resolveLocalAiPreferences(undefined)).toMatchObject({
      enabled: false,
      mode: "off",
      voiceInputMode: "legacy_stt",
      enableVoiceCommands: false,
    });
  });

  it("drops malformed values and keeps defaults", () => {
    expect(
      resolveLocalAiPreferences({
        enabled: "yes",
        mode: "root-shell",
        voiceInputMode: "custom",
      }),
    ).toMatchObject({
      enabled: false,
      mode: "off",
      voiceInputMode: "legacy_stt",
    });
  });

  it("drops unknown defaultModelId values", () => {
    expect(
      resolveLocalAiPreferences({
        defaultModelId: "totally-unknown-local-profile",
      }).defaultModelId,
    ).toBeNull();
  });
});

describe("mergeLocalAiPreferences", () => {
  it("merges partial updates without losing other stored values", () => {
    expect(
      mergeLocalAiPreferences(
        {
          enabled: true,
          mode: "auto",
          voiceInputMode: "legacy_stt",
        },
        {
          voiceInputMode: "auto",
          enableVoiceCommands: true,
        },
      ),
    ).toMatchObject({
      enabled: true,
      mode: "auto",
      voiceInputMode: "auto",
      enableVoiceCommands: true,
    });
  });
});

describe("sanitizeUserPreferencesWithLocalAi", () => {
  it("preserves unrelated preference keys while adding normalized localAi", () => {
    expect(
      sanitizeUserPreferencesWithLocalAi({
        translationLanguage: "th",
      }),
    ).toMatchObject({
      translationLanguage: "th",
      localAi: {
        mode: "off",
      },
    });
  });
});

describe("getLocalAiVoiceConsentSummary", () => {
  it("maps voice modes to distinct privacy summaries", () => {
    expect(getLocalAiVoiceConsentSummary("legacy_stt")).toBe(
      "server_or_provider",
    );
    expect(getLocalAiVoiceConsentSummary("gemma4_local")).toBe(
      "local_device",
    );
    expect(getLocalAiVoiceConsentSummary("auto")).toBe("mixed_auto");
  });
});
