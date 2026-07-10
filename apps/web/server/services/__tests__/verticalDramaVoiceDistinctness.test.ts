import { describe, expect, it } from "vitest";
import {
  buildAnonymizedSpeakerLabels,
  buildVoiceDistinctnessJudgePrompt,
  computeVoiceDistinctnessScore,
  findMostIdenticalSpeechProfileAxis,
  sampleAlternatingExchanges,
  toVoicesTooSimilarFinding,
  VOICE_DISTINCTNESS_MIN_ACCURACY,
  type VdVoiceDistinctnessAttributionResult,
  type VdVoiceDistinctnessExchange,
} from "../verticalDramaVoiceDistinctness";
import type { VerticalDramaSpeechProfile } from "@shared/verticalDramaSeries/speechProfile";

const DIVERGENT_PROFILE_A: VerticalDramaSpeechProfile = {
  speakingSpeed: "fast",
  vocabularyLevel: "simple",
  emotionalDefault: "brittle sarcasm",
  typicalSentenceLength: "very_short",
  metaphorUsage: "none",
  commonLineFunction: "deflects with humor",
};

const DIVERGENT_PROFILE_B: VerticalDramaSpeechProfile = {
  speakingSpeed: "slow",
  vocabularyLevel: "archaic_or_stylized",
  emotionalDefault: "measured menace",
  typicalSentenceLength: "long",
  metaphorUsage: "constant",
  commonLineFunction: "delivers ominous warnings",
};

const NEAR_IDENTICAL_PROFILE_A: VerticalDramaSpeechProfile = {
  speakingSpeed: "normal",
  vocabularyLevel: "everyday",
  emotionalDefault: "guarded warmth",
  typicalSentenceLength: "medium",
  metaphorUsage: "occasional",
  commonLineFunction: "asks a direct question",
};

const NEAR_IDENTICAL_PROFILE_B: VerticalDramaSpeechProfile = {
  speakingSpeed: "normal",
  vocabularyLevel: "everyday",
  emotionalDefault: "guarded curiosity",
  typicalSentenceLength: "medium",
  metaphorUsage: "frequent",
  commonLineFunction: "confirms details",
};

describe("sampleAlternatingExchanges", () => {
  it("returns every exchange verbatim when input is already <= sampleSize", () => {
    const exchanges: VdVoiceDistinctnessExchange[] = [
      { exchangeId: "1", actualCharacterKey: "a", line: "hi" },
      { exchangeId: "2", actualCharacterKey: "b", line: "hey" },
    ];
    expect(sampleAlternatingExchanges(exchanges, 8)).toEqual(exchanges);
  });

  it("is deterministic — identical input yields identical output", () => {
    const exchanges: VdVoiceDistinctnessExchange[] = Array.from({ length: 20 }, (_, i) => ({
      exchangeId: String(i),
      actualCharacterKey: i % 2 === 0 ? "a" : "b",
      line: `line ${i}`,
    }));
    expect(sampleAlternatingExchanges(exchanges, 6)).toEqual(sampleAlternatingExchanges(exchanges, 6));
  });

  it("prefers alternating speakers over consecutive same-speaker picks", () => {
    const exchanges: VdVoiceDistinctnessExchange[] = [
      { exchangeId: "1", actualCharacterKey: "a", line: "a1" },
      { exchangeId: "2", actualCharacterKey: "a", line: "a2" },
      { exchangeId: "3", actualCharacterKey: "b", line: "b1" },
      { exchangeId: "4", actualCharacterKey: "a", line: "a3" },
      { exchangeId: "5", actualCharacterKey: "b", line: "b2" },
    ];
    const sampled = sampleAlternatingExchanges(exchanges, 3);
    expect(sampled).toHaveLength(3);
    for (let i = 1; i < sampled.length; i++) {
      expect(sampled[i].actualCharacterKey).not.toBe(sampled[i - 1].actualCharacterKey);
    }
  });
});

describe("buildAnonymizedSpeakerLabels", () => {
  it("assigns stable Speaker A/B/... labels in first-seen order", () => {
    const labels = buildAnonymizedSpeakerLabels(["char-1", "char-2", "char-1", "char-3"]);
    expect(labels.get("char-1")).toBe("Speaker A");
    expect(labels.get("char-2")).toBe("Speaker B");
    expect(labels.get("char-3")).toBe("Speaker C");
  });
});

describe("buildVoiceDistinctnessJudgePrompt", () => {
  it("never includes real character keys/names in the returned cast members or instructions", () => {
    const { castMembers, lines, instructions } = buildVoiceDistinctnessJudgePrompt(
      [
        { characterKey: "aria-secret-name", speechProfile: DIVERGENT_PROFILE_A },
        { characterKey: "somchai-secret-name", speechProfile: DIVERGENT_PROFILE_B },
      ],
      [{ exchangeId: "e1", actualCharacterKey: "aria-secret-name", line: "hello" }],
    );

    const serialized = JSON.stringify({ castMembers, lines });
    expect(serialized).not.toContain("aria-secret-name");
    expect(serialized).not.toContain("somchai-secret-name");
    expect(instructions).not.toContain("aria-secret-name");
    expect(castMembers[0].speakerLabel).toBe("Speaker A");
    expect(castMembers[1].speakerLabel).toBe("Speaker B");
  });

  it("returns a speakerLabelsByCharacterKey map that resolves back to the real character keys", () => {
    const { speakerLabelsByCharacterKey } = buildVoiceDistinctnessJudgePrompt(
      [{ characterKey: "char-1", speechProfile: DIVERGENT_PROFILE_A }],
      [],
    );
    expect(speakerLabelsByCharacterKey.get("char-1")).toBe("Speaker A");
  });
});

describe("computeVoiceDistinctnessScore", () => {
  it("computes the fraction of correct attributions", () => {
    const results: VdVoiceDistinctnessAttributionResult[] = [
      { exchangeId: "1", predictedSpeakerLabel: "A", actualSpeakerLabel: "A", correct: true },
      { exchangeId: "2", predictedSpeakerLabel: "B", actualSpeakerLabel: "A", correct: false },
      { exchangeId: "3", predictedSpeakerLabel: "B", actualSpeakerLabel: "B", correct: true },
      { exchangeId: "4", predictedSpeakerLabel: "A", actualSpeakerLabel: "B", correct: false },
    ];
    expect(computeVoiceDistinctnessScore(results)).toBe(0.5);
  });

  it("returns 1 for an empty results array", () => {
    expect(computeVoiceDistinctnessScore([])).toBe(1);
  });
});

describe("findMostIdenticalSpeechProfileAxis", () => {
  it("returns null for two genuinely divergent profiles", () => {
    expect(findMostIdenticalSpeechProfileAxis(DIVERGENT_PROFILE_A, DIVERGENT_PROFILE_B)).toBeNull();
  });

  it("finds the actual identical axis (speakingSpeed) for a near-identical pair, not an arbitrary one", () => {
    const axis = findMostIdenticalSpeechProfileAxis(
      NEAR_IDENTICAL_PROFILE_A,
      NEAR_IDENTICAL_PROFILE_B,
    );
    expect(axis).toBe("speaking speed");
  });

  it("finds the correct identical axis across a second fixture permutation (vocabularyLevel tied, speakingSpeed differs)", () => {
    const a: VerticalDramaSpeechProfile = { ...NEAR_IDENTICAL_PROFILE_A, speakingSpeed: "fast" };
    const b: VerticalDramaSpeechProfile = { ...NEAR_IDENTICAL_PROFILE_B, speakingSpeed: "slow" };
    const axis = findMostIdenticalSpeechProfileAxis(a, b);
    expect(axis).toBe("vocabulary level");
  });
});

describe("toVoicesTooSimilarFinding — fixtures A/B (mock LLM judge scenarios)", () => {
  it("fixture A: divergent speech profiles -> high accuracy, no finding produced by the caller (threshold check happens at the call site)", () => {
    const results: VdVoiceDistinctnessAttributionResult[] = Array.from({ length: 10 }, (_, i) => ({
      exchangeId: String(i),
      predictedSpeakerLabel: i % 2 === 0 ? "Speaker A" : "Speaker B",
      actualSpeakerLabel: i % 2 === 0 ? "Speaker A" : "Speaker B",
      correct: true,
    }));
    const score = computeVoiceDistinctnessScore(results);
    expect(score).toBeGreaterThanOrEqual(VOICE_DISTINCTNESS_MIN_ACCURACY);
  });

  it("fixture B: near-identical speech profiles -> low accuracy -> voices_too_similar finding names both characters and the most-identical axis", () => {
    const results: VdVoiceDistinctnessAttributionResult[] = Array.from({ length: 10 }, (_, i) => ({
      exchangeId: String(i),
      predictedSpeakerLabel: "Speaker A",
      actualSpeakerLabel: i % 2 === 0 ? "Speaker A" : "Speaker B",
      correct: i % 2 === 0,
    }));
    const score = computeVoiceDistinctnessScore(results);
    expect(score).toBeLessThan(VOICE_DISTINCTNESS_MIN_ACCURACY);

    const finding = toVoicesTooSimilarFinding({
      episodeNumber: 4,
      confusedPairs: [["char-a", "char-b"]],
      characters: new Map([
        ["char-a", NEAR_IDENTICAL_PROFILE_A],
        ["char-b", NEAR_IDENTICAL_PROFILE_B],
      ]),
    });

    expect(finding.kind).toBe("voices_too_similar");
    expect(finding.evidenceEpisodes).toEqual([4]);
    expect(finding.detail).toContain("char-a");
    expect(finding.detail).toContain("char-b");
    expect(finding.detail).toContain("speaking speed");
  });
});
