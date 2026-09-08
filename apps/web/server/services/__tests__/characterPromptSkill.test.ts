import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeJsonPlanningCallWithRetry: vi.fn(),
  resolveCharacterVisualBibleModel: vi.fn(),
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));

vi.mock("../verticalDramaCharacterImageGeneration", () => ({
  resolveCharacterVisualBibleModel: mocks.resolveCharacterVisualBibleModel,
  resolveCharacterRoleTier: vi.fn(() => "support"),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
}));
vi.mock("../verticalDramaStoryBible", () => ({
  executeJsonPlanningCallWithRetry: mocks.executeJsonPlanningCallWithRetry,
}));
vi.mock("../creditService", () => mocks);

import { generateCharacterPromptWithSkill } from "../verticalDramaCharacterPromptSkill";

const profile = {
  prompt_id: "char-1-portrait",
  role: "support_general",
  age_band: "adult_25_34",
  gender_presentation: "female",
  region_direction: "thai_contemporary",
  series_context: {
    title: "ตลาดฝนพรำ",
    genre: "romantic drama",
    tone: "warm and bittersweet",
    story_world: "A riverside market in Bangkok",
    visual_culture: "Thai contemporary street life",
    realism_level: "photorealistic natural skin",
    beauty_direction: "distinctive believable human face",
    dominant_colors: ["indigo", "amber"],
    signature_motifs: ["rain", "woven baskets"],
    prohibited_repetition: ["generic influencer face"],
  },
  character_identity: {
    character_id: "char-1",
    name: "ป้าสายใจ",
    role: "ตลาดสด",
    narrative_role: "supporting",
    role_tier: "support_general",
    description: "A practical market vendor who notices everyone’s secrets.",
    occupation: "market vendor",
    personality_traits: ["observant", "warm"],
    region_ethnicity: { descriptor: "Thai contemporary features", explicit: true },
  },
  visual_translation: {
    tone_to_lighting: "warm amber practicals after rain",
    world_to_environment: "wet market stalls and woven baskets",
    emotional_engine_to_expression: "watchful eyes and a restrained smile",
    character_to_wardrobe: "indigo apron over a faded blouse",
    prohibited_patterns: ["generic influencer face"],
  },
  face_blueprint: {
    face_family: "soft oval with a broad upper face",
    jaw_profile: "gentle tapered jaw",
    chin_profile: "small rounded chin",
    face_length_width: "slightly wider than long",
    forehead_brow: "low forehead with straight brows",
    eye_geometry: "deep-set almond eyes",
    nose_geometry: "short rounded bridge",
    mouth_geometry: "wide lips with a left smile crease",
    cheek_profile: "full cheeks",
    distinctive_detail: "faint sun freckles across the nose",
  },
  presentation_profile: {
    makeup_level: "minimal practical makeup",
    wardrobe: "indigo apron and faded cotton blouse",
    lighting: "soft overcast rain light with amber stall glow",
    pose_expression: "three-quarter stance, observant half-smile",
    camera: "50mm eye-level portrait",
    environment: "busy Bangkok market stall after rain",
  },
  positive_prompt:
    "Photorealistic Thai market vendor, adult woman in her late twenties, soft oval face with a broad upper face, gentle tapered jaw, deep-set almond eyes, short rounded nose, faint sun freckles, natural pores, indigo apron, warm rain-lit market stall, observant half-smile, eye-level 50mm portrait.",
  negative_prompt:
    "generic influencer face, repeated facial template, plastic skin, porcelain skin, broad square jaw, adult glamour, anatomy errors, text, watermark",
  hard_gate_checks: { jaw_ok: true, chin_ok: true, proportion_ok: true, age_ok: true, realism_required: true },
  quality_gate: { gate_type: "support_general", face_priority: "background_believable", disallowed_shortcuts: ["generic influencer face"] },
  diversity_signature: { face_family: "soft oval", eye_geometry: "deep-set almond", nose_geometry: "short rounded", mouth_geometry: "wide lips", lower_face: "gentle tapered jaw" },
  safety_mode: "adult_general",
  review_status: "generated",
};

describe("character-prompt-skill adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasEnoughCredits.mockResolvedValue(true);
    mocks.resolveCharacterVisualBibleModel.mockResolvedValue("openai/gpt-5.6-luna");
    mocks.calculateCreditsForLLM.mockReturnValue(7);
    mocks.deductCredits.mockResolvedValue(undefined);
    mocks.executeJsonPlanningCallWithRetry.mockResolvedValue({
      data: profile,
      response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
      retried: false,
      retryCount: 0,
      model: "openai/gpt-5.6-luna",
    });
  });

  it("requests one portrait deliverable and settles one skill charge", async () => {
    const result = await generateCharacterPromptWithSkill({
      userId: 10,
      tenantId: "tenant-1",
      seriesId: 20,
      characterId: 30,
      characterKey: "char-1",
      name: "ป้าสายใจ",
      role: "แม่ค้าในตลาด",
      narrativeRole: "supporting",
      roleTier: "support_memorable",
      description: "A practical market vendor.",
      storyContext: { title: "ตลาดฝนพรำ", genre: "romantic drama", tone: "warm", locale: "th", targetAudience: "Thai viewers" },
      resolvedCharacterRegion: { source: "character_region", isExplicit: true, enforceDeterministically: true, region: "thai", descriptor: "Thai contemporary features", anchorKeywords: ["thai"] },
    });

    expect(result.deliverable).toBe("portrait");
    expect(result.prompt).toBe(profile.positive_prompt);
    expect(result).not.toHaveProperty("turnaroundPrompt");
    expect(result).not.toHaveProperty("sheetPrompt");
    expect(mocks.executeJsonPlanningCallWithRetry).toHaveBeenCalledTimes(1);
    const request = JSON.parse(mocks.executeJsonPlanningCallWithRetry.mock.calls[0][0].userPrompt);
    expect(request.generation).toEqual({ images_per_character: 1, face_diversity: "high", render_context: "portrait" });
    expect(mocks.deductCredits).toHaveBeenCalledWith(expect.objectContaining({ amount: 2, skillSlug: "character-prompt-skill", sourceType: "skill" }));
    expect(result.visualBibleSnapshot.characterPromptProfile).toEqual(profile);
  });

  it("changes only render context for a requested sheet", async () => {
    const result = await generateCharacterPromptWithSkill({
      userId: 10,
      seriesId: 20,
      characterId: 30,
      characterKey: "char-1",
      name: "ป้าสายใจ",
      role: "แม่ค้า",
      description: "A practical vendor.",
      requestedSheetType: "face_detail",
    });
    expect(result.deliverable).toBe("sheet");
    const request = JSON.parse(mocks.executeJsonPlanningCallWithRetry.mock.calls[0][0].userPrompt);
    expect(request.generation.render_context).toBe("sheet:face_detail");
    expect(mocks.executeJsonPlanningCallWithRetry).toHaveBeenCalledTimes(1);
  });
});
