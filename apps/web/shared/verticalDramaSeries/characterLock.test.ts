import { describe, it, expect } from "vitest";
import {
  VD_CHARACTER_LOCK_INSTRUCTION,
  VD_CHARACTER_LOCK_NEGATIVE_TERMS,
  VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL,
  VD_CHILD_SAFETY_NEGATIVE_TERMS,
  VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT,
  CHILD_SAFETY_DIRECTIVE_MARKER,
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

describe("VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL — still the source of truth for the router's Zod bound", () => {
  it("is 2 (soften authoring itself now lives in the vertical-drama-shot-image-action skill's soften_level input)", () => {
    expect(VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL).toBe(2);
  });
});

describe("VD_CHARACTER_LOCK_NEGATIVE_TERMS / VD_CHILD_SAFETY_NEGATIVE_TERMS — still the shared term lists", () => {
  it("VD_CHARACTER_LOCK_NEGATIVE_TERMS carries the standard identity-lock negative terms", () => {
    expect(VD_CHARACTER_LOCK_NEGATIVE_TERMS).toContain("identity drift");
    expect(VD_CHARACTER_LOCK_NEGATIVE_TERMS).toContain("wrong skin tone");
  });

  it("VD_CHILD_SAFETY_NEGATIVE_TERMS / VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT stay in sync", () => {
    for (const term of VD_CHILD_SAFETY_NEGATIVE_TERMS) {
      expect(VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT).toContain(term);
    }
  });
});

describe("CHILD_SAFETY_DIRECTIVE_MARKER — reused by verticalDramaShotImageAction.ts's post-generation safety net", () => {
  it("matches the child role tier's age-appropriateness directive", () => {
    const prompt =
      "This character MUST be depicted strictly age-appropriately — no adult styling, no glamour.";
    expect(CHILD_SAFETY_DIRECTIVE_MARKER.test(prompt)).toBe(true);
  });

  it("does not match an unrelated prompt", () => {
    expect(CHILD_SAFETY_DIRECTIVE_MARKER.test("A cheerful noodle shop scene at dusk.")).toBe(false);
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
