import fs from "fs";
import path from "path";

import { describe, it, expect } from "vitest";

import {
  characterPresenceDirectiveForTest,
  marketplaceAutoReviewVoiceConsistencyLockForTest,
  normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest,
  buildMarketplaceAutoReviewSubmittedVideoPrompt,
} from "../marketplaceAutoReviewService";

// ---------------------------------------------------------------------------
// Feature A — character presence planner directive (byte-identical guarantee)
// ---------------------------------------------------------------------------

describe("marketplace auto review character presence directive", () => {
  it("emits an empty directive for auto/absent OR when no character reference exists", () => {
    // The directive is inserted into an array filtered with
    // `.filter(value => value !== "")`, so "" adds zero bytes ⇒ byte-identical.
    expect(characterPresenceDirectiveForTest("auto", true)).toBe("");
    expect(characterPresenceDirectiveForTest(undefined, true)).toBe("");
    expect(characterPresenceDirectiveForTest(null, true)).toBe("");
    // Mode set but no character reference for the run ⇒ still empty.
    expect(characterPresenceDirectiveForTest("every_frame", false)).toBe("");
    expect(characterPresenceDirectiveForTest("most_frames", false)).toBe("");
  });

  it("emits the USER-SELECTED CHARACTER PRESENCE LOCK exactly once for every_frame", () => {
    const directive = characterPresenceDirectiveForTest("every_frame", true);
    const occurrences =
      directive.split("USER-SELECTED CHARACTER PRESENCE LOCK:").length - 1;
    expect(occurrences).toBe(1);
    expect(directive.toLowerCase()).toContain(
      "every one of the 9 storyboard frames"
    );
    expect(directive).toContain("ADDITIONAL");
    expect(directive.toLowerCase()).toContain("never replaces or overrides");
    expect(directive.toLowerCase()).toContain("product readability wins");
    expect(directive.toLowerCase()).toContain("minor-safety");
  });

  it("allows up to 2 product-only frames for most_frames (>= 7/9)", () => {
    const directive = characterPresenceDirectiveForTest("most_frames", true);
    expect(directive).toContain("USER-SELECTED CHARACTER PRESENCE LOCK:");
    expect(directive).toContain("At least 7 of the 9 storyboard frames");
    expect(directive).toContain("at most 2 product-only close-up frames");
  });
});

// ---------------------------------------------------------------------------
// Feature A — QA reasonCode mapping (fail-open)
// ---------------------------------------------------------------------------

describe("marketplace auto review character presence QA mapping", () => {
  const qaPlan = {
    productTruth: {
      productId: "mp_1",
      productName: "Sample gadget",
      productCategory: "electronics",
      categoryText: "",
      categoryPath: [],
      description: "",
    },
    productDetail: "",
    shots: [],
  } as any;
  const passingParsed = {
    verdict: "pass",
    score: 95,
    productMatchesReference: true,
    continuityMatchesShot: true,
    characterConsistencySafe: true,
    adWarningTextSafe: true,
    minorPresent: false,
    minorSafetyClothingSafe: true,
  };

  it("maps a missing-presence result to character_presence_missing + repair when expected", () => {
    const result =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        plan: qaPlan,
        parsed: { ...passingParsed, characterPresenceSatisfied: false },
        reasonCodes: [],
        characterPresenceExpected: true,
      });
    expect(result.verdict).toBe("repair");
    expect(result.characterPresenceSatisfied).toBe(false);
    expect(result.reasonCodes).toContain("character_presence_missing");
  });

  it("is fail-open: a missing/unparseable presence field passes when expected", () => {
    const result =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        plan: qaPlan,
        parsed: { ...passingParsed },
        reasonCodes: [],
        characterPresenceExpected: true,
      });
    expect(result.verdict).toBe("pass");
    expect(result.characterPresenceSatisfied).toBe(true);
    expect(result.reasonCodes).not.toContain("character_presence_missing");
  });

  it("is inert when presence is NOT expected (byte-identical to today)", () => {
    const result =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        plan: qaPlan,
        // Even an explicit false must be ignored when the run did not opt in.
        parsed: { ...passingParsed, characterPresenceSatisfied: false },
        reasonCodes: [],
      });
    expect(result.verdict).toBe("pass");
    expect(result.characterPresenceSatisfied).toBe(true);
    expect(result.reasonCodes).not.toContain("character_presence_missing");
  });
});

// ---------------------------------------------------------------------------
// Feature B — deterministic voice consistency lock (per audio strategy)
// ---------------------------------------------------------------------------

describe("marketplace auto review voice consistency lock (per audio strategy)", () => {
  const plan = { productDetail: "" } as any;

  it("emits the VOICE CONSISTENCY LOCK only for native_video_audio", () => {
    const nativeLock = marketplaceAutoReviewVoiceConsistencyLockForTest({
      resolvedAudioStrategy: "native_video_audio",
      plan,
      metadata: { speechLanguage: "th" } as any,
    });
    expect(nativeLock).toContain("VOICE CONSISTENCY LOCK:");
    expect(nativeLock).toContain("same single narrator voice");
    expect(nativeLock).toContain("never switch narrator between clips");
    // Deterministic language descriptor from existing facts (no LLM call).
    expect(nativeLock).toContain("Thai");
  });

  it("emits nothing for separate TTS and silent strategies", () => {
    expect(
      marketplaceAutoReviewVoiceConsistencyLockForTest({
        resolvedAudioStrategy: "separate_tts_voiceover",
        plan,
        metadata: { speechLanguage: "th" } as any,
      })
    ).toBe("");
    expect(
      marketplaceAutoReviewVoiceConsistencyLockForTest({
        resolvedAudioStrategy: "silent",
        plan,
        metadata: { speechLanguage: "th" } as any,
      })
    ).toBe("");
    expect(
      marketplaceAutoReviewVoiceConsistencyLockForTest({
        resolvedAudioStrategy: "auto",
        plan,
        metadata: { speechLanguage: "th" } as any,
      })
    ).toBe("");
  });

  it("falls back to a neutral narrator when no gender/age/language facts exist", () => {
    const lock = marketplaceAutoReviewVoiceConsistencyLockForTest({
      resolvedAudioStrategy: "native_video_audio",
      plan,
      metadata: null,
    });
    expect(lock).toContain("VOICE CONSISTENCY LOCK:");
    expect(lock).toContain("narrator voice");
  });
});

// ---------------------------------------------------------------------------
// Feature B — submitted video prompt voice lock append behavior
// ---------------------------------------------------------------------------

describe("marketplace auto review submitted video prompt (voice lock append)", () => {
  const basePrompt = "Video prompt body. Action: hero pours product.";

  it("is byte-identical when no voice lock is supplied", () => {
    expect(
      buildMarketplaceAutoReviewSubmittedVideoPrompt({ basePrompt })
    ).toBe(basePrompt);
  });

  it("appends the voice lock line to the REAL submitted prompt when present", () => {
    const lock =
      "VOICE CONSISTENCY LOCK: every clip uses the same single narrator voice.";
    const prompt = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt,
      voiceConsistencyLock: lock,
    });
    expect(prompt).toBe(`${basePrompt}\n${lock}`);
  });

  it("keeps motion direction, then voice lock ordering after the base prompt", () => {
    const lock = "VOICE CONSISTENCY LOCK: same narrator voice.";
    const prompt = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt,
      motionDirection: "pump and pour then showcase",
      voiceConsistencyLock: lock,
    });
    const motionIndex = prompt.indexOf("User motion direction");
    const voiceIndex = prompt.indexOf("VOICE CONSISTENCY LOCK");
    expect(motionIndex).toBeGreaterThan(basePrompt.length - 1);
    expect(voiceIndex).toBeGreaterThan(motionIndex);
  });
});

// ---------------------------------------------------------------------------
// Skill twins must stay byte-identical (loader reads lowercase skill.md first)
// ---------------------------------------------------------------------------

describe("skill twins are byte-identical", () => {
  const skillsDir = path.resolve(__dirname, "..", "..", "..", "skills");

  for (const skill of [
    "product-reference-storyboard",
    "product-video-motion-prompt",
  ]) {
    it(`${skill}: skill.md === SKILL.md`, () => {
      const lower = fs.readFileSync(
        path.join(skillsDir, skill, "skill.md")
      );
      const upper = fs.readFileSync(
        path.join(skillsDir, skill, "SKILL.md")
      );
      expect(lower.equals(upper)).toBe(true);
    });
  }
});
