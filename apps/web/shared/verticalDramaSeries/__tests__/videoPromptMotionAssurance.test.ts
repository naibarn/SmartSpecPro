import { describe, expect, it } from "vitest";
import {
  assureVideoPromptMotion,
  buildVideoPromptMotionAssuranceDirective,
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
});
