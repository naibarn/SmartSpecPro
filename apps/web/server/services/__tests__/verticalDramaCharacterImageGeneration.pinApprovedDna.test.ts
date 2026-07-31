import { describe, expect, it } from "vitest";
import { pinApprovedCanonicalDesignDna } from "../verticalDramaCharacterImageGeneration";
import type { VerticalDramaCharacterDesignDna } from "@shared/verticalDramaSeries/characterDesignDna";

/**
 * `planning/vd-look-image-not-replace-primary/plan.md` §8.
 *
 * Reproduced in production 2026-07-31 21:26 (+07): re-rendering an existing
 * LOOK's image with `custom_instruction: "เปลี่ยนชุดเป็นชุดลำลอง ที่สามารถใส่นอนได้
 * เป็นภาพเต็มตัว"` failed schema validation on
 * `characters.0.character_design_dna` for all 3 attempts — "The response changed
 * an already-approved canonical Character DNA identity" — so no image task was
 * ever submitted and the user got nothing after ~90 seconds.
 *
 * The model had not recast anyone; it paraphrased its own approved prose while
 * retyping the camelCase context into snake_case output. Pinning enforces the
 * guard's policy by construction instead of 500-ing on a paraphrase.
 */

const APPROVED = {
  version: 1,
  designIntent: "approved design intent",
  seriesDnaAlignment: ["premium cinematic aviation romance drama", "rivals to lovers"],
  roleTier: "lead_female",
  beautyArchetype: "heroine star-grade warmth",
  ageRange: "late 20s",
  faceIdentity: {
    facialGeometry: "APPROVED oval face",
    eyesAndGaze: "APPROVED dark brown eyes",
    brows: "APPROVED brows",
    nose: "APPROVED nose",
    lipsAndSmile: "APPROVED lips",
    skinAndTexture: "APPROVED skin",
    hair: "APPROVED sleek black high ponytail",
    distinctiveAsymmetry: "APPROVED beauty mark above the left upper lip",
  },
  bodyLanguage: {
    posture: "APPROVED posture",
    gesturePattern: "APPROVED gestures",
    movementRhythm: "APPROVED rhythm",
    tensionTell: "APPROVED tell",
  },
  recallStack: {
    face: "APPROVED recall face",
    silhouette: "APPROVED silhouette",
    color: "APPROVED color",
    behavior: "APPROVED behavior",
    emotionalHook: "APPROVED hook",
  },
  costumeGrammar: "approved uniform",
  publicMask: "APPROVED mask",
  hiddenTruth: "APPROVED truth",
  narrativePromise: "APPROVED promise",
  attractiveContradiction: "APPROVED contradiction",
  forbiddenDrift: "APPROVED drift",
  antiCloneChecks: {
    distinctFacialDimensions: 4,
    distinctHairDimensions: 3,
    distinctBodyLanguageDimensions: 3,
    signatureDifference: "APPROVED signature",
  },
  scores: {
    storyFit: 9,
    screenPresence: 9,
    emotionalReadability: 9,
    ensembleContrast: 8,
    crossSeriesUniqueness: 8,
    thresholdStatus: "pass",
    rationale: "approved rationale",
  },
  comparisonEvidence: {
    candidateDirectionCount: 3,
    currentCastCompared: 5,
    recentSeriesCompared: 2,
    priorLeadDnaCompared: 1,
    historyCompleteness: "structured",
  },
} as unknown as VerticalDramaCharacterDesignDna;

/** A response that paraphrased every identity field — exactly what the failing
 *  production call returned — while correctly following the user's wardrobe
 *  instruction in the non-fingerprinted fields. */
function paraphrasedOutput() {
  return {
    characters: [
      {
        character_id: "character-2-variant",
        primary_portrait_prompt: "full-body sleepwear portrait …",
        character_design_dna: {
          version: 1,
          design_intent: "Preserve ลลิน's identity in comfortable sleepwear",
          series_dna_alignment: ["premium aviation romance", "adult melodrama"],
          role_tier: "lead_female",
          beauty_archetype: "warm heroine radiance",
          age_range: "late twenties",
          face_identity: {
            facial_geometry: "sleek Thai oval face locked to the reference",
            eyes_and_gaze: "expressive dark brown eyes",
            brows: "neatly arched dark brows",
            nose: "straight delicate bridge",
            lips_and_smile: "defined Cupid's bow",
            skin_and_texture: "luminous warm golden skin",
            hair: "jet-black hair in the established high ponytail",
            distinctive_asymmetry: "small mole near the upper lip",
          },
          body_language: {
            posture: "relaxed evening posture",
            gesture_pattern: "softer gestures",
            movement_rhythm: "unhurried",
            tension_tell: "fingers curling",
          },
          recall_stack: {
            face: "restated recall face",
            silhouette: "soft cotton sleep set silhouette",
            color: "muted cream palette",
            behavior: "restated behavior",
            emotional_hook: "restated hook",
          },
          costume_grammar: "soft cotton sleepwear set",
          public_mask: "restated mask",
          hidden_truth: "restated truth",
          narrative_promise: "restated promise",
          attractive_contradiction: "restated contradiction",
          forbidden_drift: "restated drift",
          anti_clone_checks: {
            distinct_facial_dimensions: 5,
            distinct_hair_dimensions: 4,
            distinct_body_language_dimensions: 4,
            signature_difference: "restated signature",
          },
        },
      },
    ],
  };
}

function pinnedDna(output: unknown) {
  return (output as { characters: Array<{ character_design_dna: Record<string, any> }> })
    .characters[0].character_design_dna;
}

describe("pinApprovedCanonicalDesignDna", () => {
  it("restores every paraphrased face_identity field to the approved prose", () => {
    const { output } = pinApprovedCanonicalDesignDna(paraphrasedOutput(), APPROVED);

    expect(pinnedDna(output).face_identity).toEqual({
      facial_geometry: "APPROVED oval face",
      eyes_and_gaze: "APPROVED dark brown eyes",
      brows: "APPROVED brows",
      nose: "APPROVED nose",
      lips_and_smile: "APPROVED lips",
      skin_and_texture: "APPROVED skin",
      hair: "APPROVED sleek black high ponytail",
      distinctive_asymmetry: "APPROVED beauty mark above the left upper lip",
    });
  });

  it("restores body_language, the identity members of recall_stack, essence fields and anti_clone_checks", () => {
    const dna = pinnedDna(pinApprovedCanonicalDesignDna(paraphrasedOutput(), APPROVED).output);

    expect(dna.body_language.posture).toBe("APPROVED posture");
    expect(dna.recall_stack.face).toBe("APPROVED recall face");
    expect(dna.recall_stack.behavior).toBe("APPROVED behavior");
    expect(dna.recall_stack.emotional_hook).toBe("APPROVED hook");
    expect(dna.public_mask).toBe("APPROVED mask");
    expect(dna.forbidden_drift).toBe("APPROVED drift");
    expect(dna.anti_clone_checks.signature_difference).toBe("APPROVED signature");
    expect(dna.anti_clone_checks.distinct_facial_dimensions).toBe(4);
    expect(dna.series_dna_alignment).toEqual([
      "premium cinematic aviation romance drama",
      "rivals to lovers",
    ]);
    expect(dna.beauty_archetype).toBe("heroine star-grade warmth");
    expect(dna.age_range).toBe("late 20s");
  });

  it("NEVER touches the wardrobe/scene fields the fingerprint deliberately excludes — the user's instruction survives", () => {
    const dna = pinnedDna(pinApprovedCanonicalDesignDna(paraphrasedOutput(), APPROVED).output);

    expect(dna.costume_grammar).toBe("soft cotton sleepwear set");
    expect(dna.design_intent).toBe("Preserve ลลิน's identity in comfortable sleepwear");
    expect(dna.recall_stack.silhouette).toBe("soft cotton sleep set silhouette");
    expect(dna.recall_stack.color).toBe("muted cream palette");
  });

  it("leaves role_tier alone — a tier change is a real identity-class change, validated separately", () => {
    const dna = pinnedDna(pinApprovedCanonicalDesignDna(paraphrasedOutput(), APPROVED).output);

    expect(dna.role_tier).toBe("lead_female");
    const { output } = pinApprovedCanonicalDesignDna(
      {
        characters: [
          {
            character_design_dna: {
              ...paraphrasedOutput().characters[0].character_design_dna,
              role_tier: "villain_female",
            },
          },
        ],
      },
      APPROVED
    );
    expect(pinnedDna(output).role_tier).toBe("villain_female");
  });

  it("reports every field it had to correct, so drift stays observable", () => {
    const { corrections } = pinApprovedCanonicalDesignDna(paraphrasedOutput(), APPROVED);

    expect(corrections).toContain("characters.0.character_design_dna.face_identity.hair");
    expect(corrections).toContain("characters.0.character_design_dna.age_range");
    expect(corrections).not.toContain("characters.0.character_design_dna.version");
  });

  it("reports NO corrections when the model already echoed the approved identity verbatim", () => {
    const faithful = paraphrasedOutput();
    const dna = faithful.characters[0].character_design_dna;
    dna.series_dna_alignment = [...APPROVED.seriesDnaAlignment];
    dna.beauty_archetype = APPROVED.beautyArchetype;
    dna.age_range = APPROVED.ageRange;
    dna.face_identity = {
      facial_geometry: APPROVED.faceIdentity.facialGeometry,
      eyes_and_gaze: APPROVED.faceIdentity.eyesAndGaze,
      brows: APPROVED.faceIdentity.brows,
      nose: APPROVED.faceIdentity.nose,
      lips_and_smile: APPROVED.faceIdentity.lipsAndSmile,
      skin_and_texture: APPROVED.faceIdentity.skinAndTexture,
      hair: APPROVED.faceIdentity.hair,
      distinctive_asymmetry: APPROVED.faceIdentity.distinctiveAsymmetry,
    };
    dna.body_language = {
      posture: APPROVED.bodyLanguage.posture,
      gesture_pattern: APPROVED.bodyLanguage.gesturePattern,
      movement_rhythm: APPROVED.bodyLanguage.movementRhythm,
      tension_tell: APPROVED.bodyLanguage.tensionTell,
    };
    dna.recall_stack.face = APPROVED.recallStack.face;
    dna.recall_stack.behavior = APPROVED.recallStack.behavior;
    dna.recall_stack.emotional_hook = APPROVED.recallStack.emotionalHook;
    dna.public_mask = APPROVED.publicMask;
    dna.hidden_truth = APPROVED.hiddenTruth;
    dna.narrative_promise = APPROVED.narrativePromise;
    dna.attractive_contradiction = APPROVED.attractiveContradiction;
    dna.forbidden_drift = APPROVED.forbiddenDrift;
    dna.anti_clone_checks = {
      distinct_facial_dimensions: APPROVED.antiCloneChecks.distinctFacialDimensions,
      distinct_hair_dimensions: APPROVED.antiCloneChecks.distinctHairDimensions,
      distinct_body_language_dimensions:
        APPROVED.antiCloneChecks.distinctBodyLanguageDimensions,
      signature_difference: APPROVED.antiCloneChecks.signatureDifference,
    };

    expect(pinApprovedCanonicalDesignDna(faithful, APPROVED).corrections).toEqual([]);
  });

  it("passes through malformed shapes untouched — schema errors stay the schema's job", () => {
    expect(pinApprovedCanonicalDesignDna(null, APPROVED).output).toBeNull();
    expect(pinApprovedCanonicalDesignDna({}, APPROVED).output).toEqual({});
    expect(
      pinApprovedCanonicalDesignDna({ characters: [{ character_id: "x" }] }, APPROVED).output
    ).toEqual({ characters: [{ character_id: "x" }] });
  });

  it("does not mutate the caller's input object", () => {
    const original = paraphrasedOutput();
    pinApprovedCanonicalDesignDna(original, APPROVED);

    expect(original.characters[0].character_design_dna.face_identity.hair).toBe(
      "jet-black hair in the established high ponytail"
    );
  });
});
