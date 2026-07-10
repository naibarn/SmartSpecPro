/**
 * Vertical Drama Series — voice casting contracts tests (W12-A voice chain
 * wave). Pure, DB-free — schema validation + the `characterId -> config`
 * map builder.
 */
import { describe, expect, it } from "vitest";
import {
  buildCharacterVoiceConfigMap,
  verticalDramaCharacterVoiceConfigInputSchema,
  verticalDramaCharacterVoiceConfigMapEntrySchema,
  verticalDramaCharacterVoiceConfigSchema,
} from "./voiceCasting";

describe("verticalDramaCharacterVoiceConfigSchema", () => {
  it("accepts a minimal valid casting (voiceModelId + voiceId only)", () => {
    const result = verticalDramaCharacterVoiceConfigSchema.safeParse({
      voiceModelId: "uvoice/tts-premium",
      voiceId: "th-porche",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a casting missing voiceModelId", () => {
    const result = verticalDramaCharacterVoiceConfigSchema.safeParse({
      voiceId: "th-porche",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a casting missing voiceId", () => {
    const result = verticalDramaCharacterVoiceConfigSchema.safeParse({
      voiceModelId: "uvoice/tts-premium",
    });
    expect(result.success).toBe(false);
  });

  it("is tolerant of unknown/future fields (passthrough)", () => {
    const result = verticalDramaCharacterVoiceConfigSchema.safeParse({
      voiceModelId: "uvoice/tts-premium",
      voiceId: "th-porche",
      someFutureField: "value",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).someFutureField).toBe("value");
    }
  });

  it("accepts the full field set including styleHints array and lock metadata", () => {
    const result = verticalDramaCharacterVoiceConfigSchema.safeParse({
      voiceProvider: "uvoice",
      voiceModelId: "uvoice/tts-premium",
      voiceId: "th-porche",
      voiceLabel: "th - ปอร์เช่ (Adult)",
      styleHints: ["warm", "slightly raspy"],
      lockedAt: "2026-07-08T00:00:00.000Z",
      lockedByUserId: 42,
    });
    expect(result.success).toBe(true);
  });
});

describe("verticalDramaCharacterVoiceConfigInputSchema", () => {
  it("rejects lockedAt/lockedByUserId as client input (server-stamped only)", () => {
    // `.omit()` drops the keys from the schema's shape entirely, so a
    // strict parse type-narrows them away; this just documents/locks the
    // contract that the mutation input type has no such fields.
    const parsed = verticalDramaCharacterVoiceConfigInputSchema.parse({
      voiceModelId: "uvoice/tts-premium",
      voiceId: "th-porche",
    });
    expect("lockedAt" in parsed).toBe(false);
    expect("lockedByUserId" in parsed).toBe(false);
  });
});

describe("verticalDramaCharacterVoiceConfigMapEntrySchema", () => {
  it("requires characterId alongside the casting fields", () => {
    const missingCharacterId = verticalDramaCharacterVoiceConfigMapEntrySchema.safeParse({
      voiceModelId: "uvoice/tts-premium",
      voiceId: "th-porche",
    });
    expect(missingCharacterId.success).toBe(false);

    const valid = verticalDramaCharacterVoiceConfigMapEntrySchema.safeParse({
      characterId: "12",
      voiceModelId: "uvoice/tts-premium",
      voiceId: "th-porche",
    });
    expect(valid.success).toBe(true);
  });
});

describe("buildCharacterVoiceConfigMap", () => {
  it("returns an empty map for undefined input", () => {
    const map = buildCharacterVoiceConfigMap(undefined);
    expect(map.size).toBe(0);
  });

  it("keys entries by characterId and strips characterId out of the stored config", () => {
    const map = buildCharacterVoiceConfigMap([
      { characterId: "1", voiceModelId: "uvoice/tts-premium", voiceId: "th-porche" },
      { characterId: "2", voiceModelId: "uvoice/tts-natural", voiceId: "th-nalinee" },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("1")).toEqual({ voiceModelId: "uvoice/tts-premium", voiceId: "th-porche" });
    expect(map.get("2")?.voiceId).toBe("th-nalinee");
    expect((map.get("1") as Record<string, unknown>).characterId).toBeUndefined();
  });

  it("skips entries with an empty characterId", () => {
    const map = buildCharacterVoiceConfigMap([
      { characterId: "", voiceModelId: "uvoice/tts-premium", voiceId: "th-porche" },
    ]);
    expect(map.size).toBe(0);
  });

  it("last entry wins when the same characterId appears twice", () => {
    const map = buildCharacterVoiceConfigMap([
      { characterId: "1", voiceModelId: "model-a", voiceId: "voice-a" },
      { characterId: "1", voiceModelId: "model-b", voiceId: "voice-b" },
    ]);
    expect(map.get("1")?.voiceId).toBe("voice-b");
  });
});
