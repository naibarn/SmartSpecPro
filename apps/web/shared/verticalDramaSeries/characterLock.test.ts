import { describe, it, expect } from "vitest";
import {
  VD_CHARACTER_LOCK_INSTRUCTION,
  VD_CHARACTER_LOCK_NEGATIVE_TERMS,
  VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL,
  VD_CHILD_SAFETY_NEGATIVE_TERMS,
  VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT,
  softenCharacterLockPrompt,
  softenCharacterLockNegativePrompt,
  isCharacterLockPolicyFailure,
  isCharacterLockPolicyFailureMessage,
} from "./characterLock";

describe("VD_CHARACTER_LOCK_INSTRUCTION — two-tier structure", () => {
  it("names both tiers and their traits", () => {
    expect(VD_CHARACTER_LOCK_INSTRUCTION).toMatch(/PERSISTENT/);
    expect(VD_CHARACTER_LOCK_INSTRUCTION).toMatch(/VARIABLE/);
    // Persistent traits.
    for (const trait of ["face", "body proportions", "skin tone", "hair color", "eye color", "clothing"]) {
      expect(VD_CHARACTER_LOCK_INSTRUCTION.toLowerCase()).toContain(trait);
    }
    // Variable traits.
    for (const trait of ["pose", "emotion", "camera angle", "scene", "action"]) {
      expect(VD_CHARACTER_LOCK_INSTRUCTION.toLowerCase()).toContain(trait);
    }
  });
});

describe("softenCharacterLockPrompt — soften ladder", () => {
  it("level 0 is a no-op", () => {
    const prompt = `${VD_CHARACTER_LOCK_INSTRUCTION} Render exactly identical to the reference.`;
    expect(softenCharacterLockPrompt(prompt, 0)).toBe(prompt);
  });

  it("level 1 replaces hard lock verbs and drops skin-tone emphasis", () => {
    const prompt = "The face must match the attached reference image exactly, with flawless skin tone and perfect symmetry.";
    const result = softenCharacterLockPrompt(prompt, 1);
    expect(result).not.toMatch(/\bexactly\b/i);
    expect(result).not.toMatch(/flawless/i);
    expect(result).not.toMatch(/perfect/i);
    expect(result).not.toMatch(/skin tone/i);
    expect(result).toMatch(/closely resembling the reference|closely/i);
  });

  it("level 1 replaces 'identical' with a softer paraphrase", () => {
    const result = softenCharacterLockPrompt("The character must look identical to the reference.", 1);
    expect(result).not.toMatch(/\bidentical\b/i);
    expect(result).toContain("closely resembling the reference");
  });

  it("level 2 collapses the full two-tier lock block to the minimal instruction", () => {
    const prompt = `${VD_CHARACTER_LOCK_INSTRUCTION} Extra detail here.`;
    const result = softenCharacterLockPrompt(prompt, 2);
    expect(result).not.toContain("PERSISTENT");
    expect(result).toMatch(/minimal lock/i);
    expect(result).toMatch(/recognizable appearance/i);
    expect(result).toContain("Extra detail here.");
  });

  it("level 2 strips ethnicity/skin/complexion descriptors", () => {
    const result = softenCharacterLockPrompt(
      "Keep the same ethnicity, skin complexion, and race consistent with the reference.",
      2,
    );
    expect(result.toLowerCase()).not.toContain("ethnicity");
    expect(result.toLowerCase()).not.toContain("complexion");
    expect(result.toLowerCase()).not.toContain("race");
  });

  it("clamps an out-of-range level to the max", () => {
    const prompt = "exactly identical, flawless, skin tone";
    const clamped = softenCharacterLockPrompt(prompt, 99);
    const level2 = softenCharacterLockPrompt(prompt, VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL);
    expect(clamped).toBe(level2);
  });

  it("clamps a negative level to 0 (no-op)", () => {
    const prompt = "exactly identical";
    expect(softenCharacterLockPrompt(prompt, -1)).toBe(prompt);
  });
});

describe("child-safety negatives survive the soften ladder — policy-risk mitigation", () => {
  it("softenCharacterLockPrompt is a no-op when the prompt contains the child-safety directive marker, at any level", () => {
    const childPrompt =
      `${VD_CHARACTER_LOCK_INSTRUCTION} This character MUST be depicted strictly ` +
      "age-appropriately — no adult styling, no glamour, no romantic framing.";
    expect(softenCharacterLockPrompt(childPrompt, 1)).toBe(childPrompt);
    expect(softenCharacterLockPrompt(childPrompt, 2)).toBe(childPrompt);
  });

  it("softenCharacterLockNegativePrompt preserves every VD_CHILD_SAFETY_NEGATIVE_TERMS term verbatim at level 1", () => {
    const negative = `${VD_CHARACTER_LOCK_NEGATIVE_TERMS.join(", ")}, ${VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT}`;
    const result = softenCharacterLockNegativePrompt(negative, 1)!;
    for (const term of VD_CHILD_SAFETY_NEGATIVE_TERMS) {
      expect(result).toContain(term);
    }
  });

  it("softenCharacterLockNegativePrompt preserves every VD_CHILD_SAFETY_NEGATIVE_TERMS term verbatim at level 2 (the level that would otherwise corrupt 'plastic skin' -> 'plastic')", () => {
    const negative = `${VD_CHARACTER_LOCK_NEGATIVE_TERMS.join(", ")}, ${VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT}`;
    const result = softenCharacterLockNegativePrompt(negative, 2)!;
    for (const term of VD_CHILD_SAFETY_NEGATIVE_TERMS) {
      expect(result).toContain(term);
    }
    // Specifically guard the exact corruption this test suite exists to prevent.
    expect(result).toContain("plastic skin");
    expect(result).not.toMatch(/\bplastic\b(?!\s+skin)/);
    // The ordinary character-lock negative terms are still stripped at level 2.
    for (const term of VD_CHARACTER_LOCK_NEGATIVE_TERMS) {
      expect(result).not.toContain(term);
    }
  });

  it("still softens non-child-safety terms normally when child-safety terms are absent", () => {
    const negative = `${VD_CHARACTER_LOCK_NEGATIVE_TERMS.join(", ")}, altered product design`;
    const result = softenCharacterLockNegativePrompt(negative, 2)!;
    expect(result).toContain("altered product design");
    for (const term of VD_CHARACTER_LOCK_NEGATIVE_TERMS) {
      expect(result).not.toContain(term);
    }
  });
});

describe("softenCharacterLockNegativePrompt", () => {
  it("level 0 is a no-op", () => {
    const negative = VD_CHARACTER_LOCK_NEGATIVE_TERMS.join(", ");
    expect(softenCharacterLockNegativePrompt(negative, 0)).toBe(negative);
  });

  it("is a no-op on undefined input", () => {
    expect(softenCharacterLockNegativePrompt(undefined, 2)).toBeUndefined();
  });

  it("level 2 strips character-lock negative terms but keeps unrelated terms", () => {
    const negative = `${VD_CHARACTER_LOCK_NEGATIVE_TERMS.join(", ")}, altered product design`;
    const result = softenCharacterLockNegativePrompt(negative, 2);
    for (const term of VD_CHARACTER_LOCK_NEGATIVE_TERMS) {
      expect(result).not.toContain(term);
    }
    expect(result).toContain("altered product design");
  });
});

describe("isCharacterLockPolicyFailure / isCharacterLockPolicyFailureMessage — policy-error matcher", () => {
  const policyLikeMessages = [
    "Request rejected: content policy violation detected in prompt.",
    "Image generation blocked due to safety filter.",
    "This request was flagged by our moderation system.",
    "Your prompt violates the content policy guidelines.",
    "The generated content was rejected by content moderation.",
    "Request blocked: sensitive content detected.",
    "This content is not allowed under our guidelines.",
    "Prohibited content detected in the request.",
  ];

  it("matches a variety of real-looking provider policy-rejection strings", () => {
    for (const message of policyLikeMessages) {
      expect(isCharacterLockPolicyFailureMessage(message)).toBe(true);
      expect(isCharacterLockPolicyFailure(new Error(message))).toBe(true);
    }
  });

  it("does not match unrelated failures (capacity, network, validation)", () => {
    const nonPolicyMessages = [
      "Points used by apiKey has exceeded the hourly limit. Try again in 300 seconds.",
      "Network timeout while contacting the provider.",
      "Invalid request: missing required field 'prompt'.",
      "Internal server error, please try again later.",
    ];
    for (const message of nonPolicyMessages) {
      expect(isCharacterLockPolicyFailureMessage(message)).toBe(false);
      expect(isCharacterLockPolicyFailure(new Error(message))).toBe(false);
    }
  });

  it("returns false for null/undefined/empty input", () => {
    expect(isCharacterLockPolicyFailureMessage(null)).toBe(false);
    expect(isCharacterLockPolicyFailureMessage(undefined)).toBe(false);
    expect(isCharacterLockPolicyFailureMessage("")).toBe(false);
    expect(isCharacterLockPolicyFailure(null)).toBe(false);
    expect(isCharacterLockPolicyFailure(undefined)).toBe(false);
  });

  it("matches when the policy keyword is nested inside an object/array error shape", () => {
    const nested = {
      responsePayload: { error: { message: "Content rejected: policy violation" } },
    };
    expect(isCharacterLockPolicyFailure(nested)).toBe(true);
  });

  it("matches a plain string error", () => {
    expect(isCharacterLockPolicyFailure("blocked_reason: unsafe_content")).toBe(true);
  });
});
