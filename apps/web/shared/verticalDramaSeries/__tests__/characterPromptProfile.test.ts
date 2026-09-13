import { describe, expect, it } from "vitest";
import {
  verticalDramaApprovedCharacterVisualBibleSchema,
  verticalDramaCharacterPromptProfileSchema,
} from "../characterProfile";

const profile = {
  prompt_id: "char-1-portrait-1",
  role: "support_general",
  age_band: "adult_35_plus",
  gender_presentation: "female",
  region_direction: "thai_contemporary",
  series_context: {
    title: "ตลาดใต้เงาฝน",
    genre: "family mystery",
    tone: "warm suspense",
    story_world: "Bangkok old market",
    visual_culture: "grounded Thai live action",
    realism_level: "natural human realism",
    beauty_direction: "ordinary believable faces",
    dominant_colors: ["amber"],
    signature_motifs: ["rain on glass"],
    prohibited_repetition: ["generic influencer beauty"],
  },
  character_identity: {
    character_id: "char-1",
    name: "ป้าแอ๋ว",
    role: "แม่ค้าในตลาด",
    narrative_role: "supporting",
    role_tier: "support_general",
    description: "แม่ค้าขายน้ำสมุนไพรที่จำคนในตลาดได้แม่น",
    occupation: "แม่ค้า",
    personality_traits: ["ช่างสังเกต"],
    region_ethnicity: { descriptor: "Thai Bangkok", explicit: true },
  },
  visual_translation: {
    tone_to_lighting: "warm practical market light",
    world_to_environment: "aged stalls and wet pavement",
    emotional_engine_to_expression: "watchful but kind eyes",
    character_to_wardrobe: "practical vendor clothing",
    prohibited_patterns: ["influencer styling"],
  },
  face_blueprint: {
    face_family: "soft oval",
    jaw_profile: "moderately broad but natural",
    chin_profile: "rounded chin",
    face_length_width: "balanced proportions",
    forehead_brow: "low natural brows",
    eye_geometry: "slightly hooded eyes",
    nose_geometry: "short rounded bridge",
    mouth_geometry: "wide expressive smile",
    cheek_profile: "subtle cheek volume",
    distinctive_detail: "small mole near the left cheek",
  },
  presentation_profile: {
    makeup_level: "minimal practical makeup",
    wardrobe: "faded apron over a cotton blouse",
    lighting: "soft amber stall light",
    pose_expression: "leaning forward with a knowing smile",
    camera: "medium portrait",
    environment: "old Bangkok market stall",
  },
  positive_prompt:
    "A natural human portrait of ป้าแอ๋ว, a Thai Bangkok market vendor, with a soft oval face, slightly hooded eyes, rounded chin, realistic pores, and a knowing smile in a warm old-market setting.",
  negative_prompt:
    "generic influencer beauty, plastic skin, repeated facial template, distorted anatomy",
  hard_gate_checks: {
    jaw_ok: true,
    chin_ok: true,
    proportion_ok: true,
    age_ok: true,
    realism_required: true,
  },
  quality_gate: {
    gate_type: "support_general",
    face_priority: "background_believable",
    disallowed_shortcuts: ["lead beauty styling"],
  },
  diversity_signature: {
    face_family: "soft oval",
    eye_geometry: "slightly hooded",
    nose_geometry: "short rounded bridge",
    mouth_geometry: "wide expressive smile",
    lower_face: "rounded chin",
  },
  safety_mode: "adult_general",
  review_status: "generated",
};

describe("vertical drama character prompt profile contract", () => {
  it("accepts a complete profile from the new skill", () => {
    expect(verticalDramaCharacterPromptProfileSchema.parse(profile)).toEqual(profile);
  });

  it("accepts an approved snapshot with profile data and no invented legacy DNA", () => {
    const snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      model: "openai/gpt-5.6-luna",
      visualIdentitySummary: profile.positive_prompt,
      identityAnchors: [profile.face_blueprint.face_family, profile.face_blueprint.distinctive_detail],
      signatureWardrobe: profile.presentation_profile.wardrobe,
      hairMakeupNotes: profile.presentation_profile.makeup_level,
      performanceEnergy: profile.presentation_profile.pose_expression,
      consistencyStrategy: profile.face_blueprint.distinctive_detail,
      signatureVisualCues: [profile.diversity_signature.lower_face],
      colorPalette: profile.series_context.dominant_colors.join(", "),
      storyWorldRelationship: profile.visual_translation.world_to_environment,
      forbiddenDrift: profile.series_context.prohibited_repetition,
      emotionalRangeNeeded: [profile.visual_translation.emotional_engine_to_expression],
      ageRange: profile.age_band,
      promptContractVersion: "vd_character_natural_human_v1",
      promptProfile: "rich",
      characterPromptProfile: profile,
    };

    expect(verticalDramaApprovedCharacterVisualBibleSchema.parse(snapshot)).toMatchObject({
      characterPromptProfile: profile,
    });
  });

  it("rejects an approved snapshot without legacy DNA or a new profile", () => {
    expect(() =>
      verticalDramaApprovedCharacterVisualBibleSchema.parse({
        version: 1,
        createdAt: new Date().toISOString(),
        model: "openai/gpt-5.6-luna",
        visualIdentitySummary: "summary",
        identityAnchors: [],
        signatureWardrobe: "wardrobe",
        hairMakeupNotes: "hair",
        performanceEnergy: "energy",
        consistencyStrategy: "strategy",
        signatureVisualCues: [],
        colorPalette: "amber",
        storyWorldRelationship: "market",
        forbiddenDrift: [],
        emotionalRangeNeeded: [],
        ageRange: "adult",
      }),
    ).toThrow();
  });
});
