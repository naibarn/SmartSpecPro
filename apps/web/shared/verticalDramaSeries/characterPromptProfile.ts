import { z } from "zod";

const text = z.string().trim().min(1);
const textList = z.array(text);

export const characterPromptRoleSchema = z.enum([
  "hero",
  "heroine",
  "protagonist",
  "child_hero",
  "child_heroine",
  "supporting",
  "antagonist",
  "antagonist_male",
  "antagonist_female",
  "supporting_male",
  "supporting_female",
  "elder_patriarch",
  "elder_matriarch",
  "support_memorable",
  "support_general",
]);

const seriesContextSchema = z
  .object({
    title: text,
    genre: text,
    tone: text,
    story_world: text,
    visual_culture: text,
    realism_level: text,
    beauty_direction: text,
    dominant_colors: textList,
    signature_motifs: textList,
    prohibited_repetition: textList,
  })
  .strict();

const characterIdentitySchema = z
  .object({
    character_id: text.optional(),
    name: text,
    role: text.optional(),
    age: z.number().int().min(6).max(90).optional(),
    narrative_role: text,
    role_tier: text,
    description: text,
    occupation: z.string().optional(),
    personality_traits: textList.optional(),
    relationship_to_lead: z.string().optional(),
    timeline_stage: z.string().optional(),
    adult_character_id: z.string().optional(),
    continuity_anchors: textList.optional(),
    region_ethnicity: z
      .object({ descriptor: text, explicit: z.boolean() })
      .strict(),
  })
  .strict();

const visualTranslationSchema = z
  .object({
    tone_to_lighting: text,
    world_to_environment: text,
    emotional_engine_to_expression: text,
    character_to_wardrobe: text,
    prohibited_patterns: textList,
  })
  .strict();

const faceBlueprintSchema = z
  .object({
    face_family: text,
    jaw_profile: text,
    chin_profile: text,
    face_length_width: text,
    forehead_brow: z.string().optional(),
    eye_geometry: text,
    nose_geometry: text,
    mouth_geometry: text,
    cheek_profile: z.string().optional(),
    distinctive_detail: text,
  })
  .strict();

const presentationProfileSchema = z
  .object({
    makeup_level: text,
    wardrobe: text,
    lighting: text,
    pose_expression: text,
    camera: z.string().optional(),
    environment: text,
  })
  .strict();

const hardGateChecksSchema = z
  .object({
    jaw_ok: z.boolean(),
    chin_ok: z.boolean(),
    proportion_ok: z.boolean(),
    age_ok: z.boolean(),
    realism_required: z.boolean(),
  })
  .strict();

const qualityGateSchema = z
  .object({
    gate_type: z.enum([
      "lead",
      "child",
      "antagonist",
      "supporting",
      "elder",
      "support_memorable",
      "support_general",
    ]),
    face_priority: z.enum([
      "lead_beauty",
      "child_continuity",
      "threat_without_distortion",
      "ordinary_believable",
      "ordinary_memorable",
      "background_believable",
    ]),
    disallowed_shortcuts: textList,
  })
  .strict();

const diversitySignatureSchema = z
  .object({
    face_family: text,
    eye_geometry: text,
    nose_geometry: text,
    mouth_geometry: text,
    lower_face: text,
  })
  .strict();

export const verticalDramaCharacterPromptProfileSchema = z
  .object({
    prompt_id: text,
    role: characterPromptRoleSchema,
    age_band: z.enum([
      "child_6_12",
      "teen_13_17",
      "adult_18_24",
      "adult_25_34",
      "adult_35_plus",
    ]),
    gender_presentation: z.enum(["female", "male", "androgynous"]).optional(),
    region_direction: z
      .enum([
        "thai_contemporary",
        "east_asian_contemporary",
        "southeast_asian_contemporary",
        "custom",
      ])
      .optional(),
    series_context: seriesContextSchema,
    character_identity: characterIdentitySchema,
    visual_translation: visualTranslationSchema,
    face_blueprint: faceBlueprintSchema,
    presentation_profile: presentationProfileSchema,
    positive_prompt: z.string().trim().min(50),
    negative_prompt: z.string().trim().min(20),
    hard_gate_checks: hardGateChecksSchema,
    quality_gate: qualityGateSchema.optional(),
    diversity_signature: diversitySignatureSchema,
    safety_mode: z.enum([
      "adult_general",
      "adult_tasteful_allure",
      "teen_age_appropriate",
      "child_age_appropriate",
    ]),
    review_status: z.enum(["generated", "approved", "rejected", "near_duplicate"]),
    rejection_reason: z.string().optional(),
    source_references: textList.optional(),
  })
  .strict();

export type VerticalDramaCharacterPromptProfile = z.infer<
  typeof verticalDramaCharacterPromptProfileSchema
>;
