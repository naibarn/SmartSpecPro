import { describe, expect, it } from "vitest";

import {
  filterAndGroupVoiceCatalog,
  formatVoiceChipLabel,
  VOICE_CATALOG_UNKNOWN_LANGUAGE_KEY,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterVoiceCastingCard";
import type { VerticalDramaVoiceCatalogEntry } from "@shared/verticalDramaSeries/voiceCasting";

const catalog: VerticalDramaVoiceCatalogEntry[] = [
  { voiceModelId: "uvoice/tts", voiceId: "th-porche", label: "th - ปอร์เช่ (Adult)", language: "th", ageTag: "Adult" },
  { voiceModelId: "uvoice/tts", voiceId: "th-anong", label: "th - อนงค์ (Young)", language: "th", ageTag: "Young" },
  { voiceModelId: "uvoice/tts", voiceId: "en-mike", label: "en - Mike (Adult)", language: "en", ageTag: "Adult" },
  { voiceModelId: "gemini/tts", voiceId: "fallback-1", label: "Fallback voice A" },
];

describe("filterAndGroupVoiceCatalog", () => {
  it("groups voices by language, preserving catalog order within a group", () => {
    const groups = filterAndGroupVoiceCatalog(catalog, "");
    expect(groups.map((g) => g.language)).toEqual(["th", "en", VOICE_CATALOG_UNKNOWN_LANGUAGE_KEY]);
    expect(groups[0].entries.map((e) => e.voiceId)).toEqual(["th-porche", "th-anong"]);
  });

  it("buckets entries with no `language` field under the unknown-language key", () => {
    const groups = filterAndGroupVoiceCatalog(catalog, "");
    const unknownGroup = groups.find((g) => g.language === VOICE_CATALOG_UNKNOWN_LANGUAGE_KEY);
    expect(unknownGroup?.entries.map((e) => e.voiceId)).toEqual(["fallback-1"]);
  });

  it("filters case-insensitively by a Thai label substring", () => {
    const groups = filterAndGroupVoiceCatalog(catalog, "ปอร์เช่");
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[0].entries[0].voiceId).toBe("th-porche");
  });

  it("filters by voiceId substring (ASCII id under a Thai-script label)", () => {
    const groups = filterAndGroupVoiceCatalog(catalog, "PORCHE");
    expect(groups).toHaveLength(1);
    expect(groups[0].entries[0].voiceId).toBe("th-porche");
  });

  it("filters by language code substring", () => {
    const groups = filterAndGroupVoiceCatalog(catalog, "en");
    // "en" matches the English group's language code AND its "en - Mike"
    // label; no other fixture label/id/language/ageTag contains "en".
    expect(groups.map((g) => g.language)).toEqual(["en"]);
  });

  it("filters by age tag substring", () => {
    const groups = filterAndGroupVoiceCatalog(catalog, "young");
    expect(groups).toHaveLength(1);
    expect(groups[0].entries[0].voiceId).toBe("th-anong");
  });

  it("returns no groups when nothing matches", () => {
    expect(filterAndGroupVoiceCatalog(catalog, "zzz-no-match")).toEqual([]);
  });

  it("returns an empty array for an empty catalog", () => {
    expect(filterAndGroupVoiceCatalog([], "")).toEqual([]);
  });
});

describe("formatVoiceChipLabel", () => {
  it("shows the placeholder text when no voice is cast", () => {
    expect(formatVoiceChipLabel("th", undefined)).toBe("ยังไม่กำหนดเสียง");
    expect(formatVoiceChipLabel("en", undefined)).toBe("No voice cast yet");
  });

  it("prefers `voiceLabel` when present", () => {
    expect(
      formatVoiceChipLabel("th", {
        voiceModelId: "uvoice/tts",
        voiceId: "th-porche",
        voiceLabel: "th - ปอร์เช่ (Adult)",
      }),
    ).toBe("th - ปอร์เช่ (Adult)");
  });

  it("falls back to the raw voiceId when voiceLabel is absent", () => {
    expect(
      formatVoiceChipLabel("en", {
        voiceModelId: "uvoice/tts",
        voiceId: "th-porche",
      }),
    ).toBe("th-porche");
  });
});
