import { describe, expect, it } from "vitest";
import {
  formStateToSpeechProfile,
  speechProfileToFormState,
  VD_SPEECH_PROFILE_FORM_DEFAULTS,
  type VdSpeechProfileFormState,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import { speechProfileSchema, type VerticalDramaSpeechProfile } from "@shared/verticalDramaSeries/speechProfile";

const FULL_PROFILE: VerticalDramaSpeechProfile = {
  speakingSpeed: "fast",
  vocabularyLevel: "educated",
  emotionalDefault: "brittle sarcasm",
  typicalSentenceLength: "short",
  metaphorUsage: "occasional",
  commonLineFunction: "deflects with humor",
  forbiddenStyle: ["never uses slang", "never swears"],
  signaturePhrases: ["ก็ได้ไง", "แล้วแต่เธอ"],
};

describe("speechProfileToFormState", () => {
  it("returns the form defaults for a legacy character with no profile", () => {
    expect(speechProfileToFormState(undefined)).toEqual(VD_SPEECH_PROFILE_FORM_DEFAULTS);
  });

  it("maps a full profile's arrays into newline-joined text", () => {
    const form = speechProfileToFormState(FULL_PROFILE);
    expect(form.forbiddenStyleText).toBe("never uses slang\nnever swears");
    expect(form.signaturePhrasesText).toBe("ก็ได้ไง\nแล้วแต่เธอ");
    expect(form.emotionalDefault).toBe("brittle sarcasm");
  });
});

describe("formStateToSpeechProfile", () => {
  it("round-trips a full profile through form state and back, validating against the shared schema", () => {
    const form = speechProfileToFormState(FULL_PROFILE);
    const rebuilt = formStateToSpeechProfile(form);
    const parsed = speechProfileSchema.parse(rebuilt);
    expect(parsed).toEqual(FULL_PROFILE);
  });

  it("splits newline-separated text into a trimmed array, dropping empty lines", () => {
    const form: VdSpeechProfileFormState = {
      ...VD_SPEECH_PROFILE_FORM_DEFAULTS,
      emotionalDefault: "calm",
      commonLineFunction: "asks questions",
      forbiddenStyleText: "  never swears  \n\n never yells ",
    };
    const rebuilt = formStateToSpeechProfile(form);
    expect(rebuilt.forbiddenStyle).toEqual(["never swears", "never yells"]);
  });

  it("omits array fields entirely (undefined, not []) when the textarea is empty", () => {
    const form: VdSpeechProfileFormState = {
      ...VD_SPEECH_PROFILE_FORM_DEFAULTS,
      emotionalDefault: "calm",
      commonLineFunction: "asks questions",
    };
    const rebuilt = formStateToSpeechProfile(form);
    expect(rebuilt.forbiddenStyle).toBeUndefined();
    expect(rebuilt.signaturePhrases).toBeUndefined();
  });
});
