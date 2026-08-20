import { describe, expect, it } from "vitest";
import {
  assureVideoPromptMotion,
  applyVideoPromptMotionSafetyFallback,
  buildVideoPromptMotionAssuranceDirective,
  isVideoPromptSourceBlockingFinding,
  resolveVideoPromptGenrePolicy,
} from "../videoPromptMotionAssurance";

describe("video prompt motion assurance", () => {
  it("blocks unlisted people when no supporting presence is declared", () => {
    const result = assureVideoPromptMotion({
      prompt: "Exactly two established faces; a crowd of background people gathers behind them.",
      family: "grok",
      establishedCharacterNames: ["A", "B"],
    });
    expect(result.blocking.some(f => f.code === "unlisted_people")).toBe(true);
  });

  it("allows only declared generic supporting presence", () => {
    const result = assureVideoPromptMotion({
      prompt: "Exactly two established faces and two police officers in the background; preserve identity and readable faces.",
      family: "seedance",
      establishedCharacterNames: ["A", "B"],
      supportingPresence: [{ id: "police", role: "police officers", countMin: 2, countMax: 2, visibility: "background", source: "manual" }],
    });
    expect(result.blocking).toHaveLength(0);
  });

  it("blocks face morphing and impossible grounded motion", () => {
    const result = assureVideoPromptMotion({
      prompt: "The speaker's face morphs into another identity and teleports across the room.",
      family: "minimax_h3",
      establishedCharacterNames: ["A"],
    });
    expect(result.blocking.map(f => f.code)).toEqual(expect.arrayContaining(["face_identity_risk", "grounded_physics_violation"]));
  });

  it("allows genre-consistent supernatural motion while retaining identity locks", () => {
    expect(resolveVideoPromptGenrePolicy("supernatural fantasy").physics).toBe("genre_consistent");
    const result = assureVideoPromptMotion({
      prompt: "A supernatural teleport effect surrounds the established face; preserve identity, eyes, and readable facial geometry.",
      family: "flux3",
      genre: "supernatural",
      establishedCharacterNames: ["A"],
    });
    expect(result.blocking).toHaveLength(0);
  });

  it("does not treat an inline negative-constraint tail as a requested action", () => {
    const result = assureVideoPromptMotion({
      prompt:
        "Exactly two established cast members, preserve each attached identity and keep faces readable. Negative constraints: no extras, no background people, no full profile, no back of head, no face morphing.",
      family: "grok",
      establishedCharacterNames: ["A", "B"],
    });
    expect(result.blocking).toHaveLength(0);
  });

  it("emits provider/model and cast/physics directives", () => {
    const directive = buildVideoPromptMotionAssuranceDirective({
      family: "flux3",
      genre: "sci-fi",
      establishedCharacterCount: 2,
    });
    expect(directive).toContain("physics_mode: genre_consistent");
    expect(directive).toContain("Flux3");
    expect(directive).toContain("exactly the 2 established cast members");
  });

  it("repairs non-source blocking findings deterministically", () => {
    const unsafe = assureVideoPromptMotion({
      prompt: "A crowd watches while the speaker's face morphs and teleports.",
      family: "grok",
      establishedCharacterNames: ["A"],
    });
    const repaired = applyVideoPromptMotionSafetyFallback(
      "A crowd watches while the speaker's face morphs and teleports.",
      unsafe.blocking,
    );
    const after = assureVideoPromptMotion({
      prompt: repaired,
      family: "grok",
      establishedCharacterNames: ["A"],
    });
    expect(after.blocking).toHaveLength(0);
    expect(repaired).toContain("established cast only");
    expect(repaired).toContain("faces remain readable");
  });

  it("reserves user action for genuinely ambiguous source frames", () => {
    const result = assureVideoPromptMotion({
      prompt: "Exactly one established face, preserve identity and readable eyes.",
      family: "grok",
      establishedCharacterNames: ["A"],
      dialogueSpeakerNames: ["A"],
      frameAnalysis: { facesSeparated: false },
    });
    expect(result.blocking.some(isVideoPromptSourceBlockingFinding)).toBe(true);
  });

  it("does not block a naturally soft or overlapping screen-only caller", () => {
    const result = assureVideoPromptMotion({
      prompt: "A physical character speaks while the caller appears only inside a visible phone screen; preserve both identities.",
      family: "grok",
      establishedCharacterNames: ["A", "Caller"],
      dialogueSpeakerNames: ["Caller"],
      screenCallerCharacterNames: ["caller"],
      frameAnalysis: {
        facesSeparated: false,
        people: [
          {
            name: "Caller",
            eyesVisible: false,
            faceSize: "tiny",
            occlusion: "occluded by screen glare",
            overlappedByOtherFace: true,
          },
        ],
      },
    });
    expect(result.blocking.some(isVideoPromptSourceBlockingFinding)).toBe(false);
  });

  it("still blocks an explicitly ambiguous physical-scene speaker when a screen caller is present", () => {
    const result = assureVideoPromptMotion({
      prompt: "The physical speaker and the screen caller keep their identities.",
      family: "grok",
      establishedCharacterNames: ["A", "Caller"],
      dialogueSpeakerNames: ["A", "Caller"],
      screenCallerCharacterNames: ["Caller"],
      frameAnalysis: {
        facesSeparated: false,
        people: [
          {
            name: "A",
            eyesVisible: false,
            faceSize: "small",
            overlappedByOtherFace: true,
          },
          {
            name: "Caller",
            eyesVisible: false,
            faceSize: "tiny",
            overlappedByOtherFace: true,
          },
        ],
      },
    });
    expect(result.blocking.some(isVideoPromptSourceBlockingFinding)).toBe(true);
  });
});
