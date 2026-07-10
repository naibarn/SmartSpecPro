import { describe, expect, it } from "vitest";
import {
  renderVoiceCardBlock,
  speechProfileSchema,
  type VerticalDramaSpeechProfile,
} from "./speechProfile";

const FULL_PROFILE: VerticalDramaSpeechProfile = {
  speakingSpeed: "fast",
  vocabularyLevel: "educated",
  emotionalDefault: "brittle sarcasm masking fear",
  typicalSentenceLength: "short",
  metaphorUsage: "occasional",
  commonLineFunction: "deflects with humor then pivots to the real ask",
  forbiddenStyle: ["never uses slang", "never swears"],
  signaturePhrases: ["ก็ได้ไง", "แล้วแต่เธอ"],
};

const MINIMAL_PROFILE: VerticalDramaSpeechProfile = {
  speakingSpeed: "measured",
  vocabularyLevel: "simple",
  emotionalDefault: "guarded warmth",
  typicalSentenceLength: "medium",
  metaphorUsage: "none",
  commonLineFunction: "soothes then asks a direct question",
};

describe("speechProfileSchema", () => {
  it("accepts a fully-populated profile", () => {
    const parsed = speechProfileSchema.parse(FULL_PROFILE);
    expect(parsed).toMatchObject(FULL_PROFILE);
  });

  it("accepts a minimal profile with only required enums/fields (no forbiddenStyle/signaturePhrases)", () => {
    const parsed = speechProfileSchema.parse(MINIMAL_PROFILE);
    expect(parsed.forbiddenStyle).toBeUndefined();
    expect(parsed.signaturePhrases).toBeUndefined();
  });

  it("round-trips through JSON.parse(JSON.stringify(...)) unchanged", () => {
    const roundTripped = JSON.parse(JSON.stringify(FULL_PROFILE));
    expect(speechProfileSchema.parse(roundTripped)).toEqual(FULL_PROFILE);
  });

  it("rejects an invalid speakingSpeed enum value", () => {
    const invalid = { ...MINIMAL_PROFILE, speakingSpeed: "supersonic" };
    expect(() => speechProfileSchema.parse(invalid)).toThrow();
  });

  it("tolerates unknown/future extra fields via .passthrough()", () => {
    const withExtra = { ...MINIMAL_PROFILE, futureField: "some new axis" };
    const parsed = speechProfileSchema.parse(withExtra);
    expect((parsed as Record<string, unknown>).futureField).toBe("some new axis");
  });
});

describe("renderVoiceCardBlock", () => {
  it("produces a deterministic, stable string for a given profile", () => {
    expect(renderVoiceCardBlock(FULL_PROFILE)).toBe(renderVoiceCardBlock(FULL_PROFILE));
  });

  it("includes every populated field on its own line", () => {
    const block = renderVoiceCardBlock(FULL_PROFILE);
    expect(block).toContain("Voice:");
    expect(block).toContain("Speaking speed: fast");
    expect(block).toContain("Vocabulary level: educated");
    expect(block).toContain("Typical sentence length: short");
    expect(block).toContain("Metaphor usage: occasional");
    expect(block).toContain("Emotional default: brittle sarcasm masking fear");
    expect(block).toContain("Common line function: deflects with humor then pivots to the real ask");
    expect(block).toContain("Forbidden style: never uses slang; never swears");
    expect(block).toContain("Signature phrases: ก็ได้ไง; แล้วแต่เธอ");
  });

  it("omits the 'Forbidden style'/'Signature phrases' lines cleanly when absent", () => {
    const block = renderVoiceCardBlock(MINIMAL_PROFILE);
    expect(block).not.toContain("Forbidden style:");
    expect(block).not.toContain("Signature phrases:");
  });

  it("omits the arrays lines when present but empty", () => {
    const block = renderVoiceCardBlock({
      ...MINIMAL_PROFILE,
      forbiddenStyle: [],
      signaturePhrases: [],
    });
    expect(block).not.toContain("Forbidden style:");
    expect(block).not.toContain("Signature phrases:");
  });
});
