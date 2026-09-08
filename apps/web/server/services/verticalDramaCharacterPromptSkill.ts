/**
 * Deliverable-aware adapter for the shared `character-prompt-skill`.
 *
 * The legacy visual-bible service asks the model for five prompt siblings on
 * every call. This adapter keeps the existing router inputs and persistence
 * contracts, but sends one character and one requested render context to the
 * new skill and returns only its single validated profile.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { parseSkillFile } from "@smartspec/skills";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  InsufficientCreditsError,
  executeJsonPlanningCallWithRetry,
  type GenerateCharacterVisualPromptsParams,
} from "./verticalDramaCharacterImageGeneration";
import { resolveCharacterVisualBibleModel } from "./verticalDramaCharacterImageGeneration";
import {
  VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION,
  assertVerticalDramaCharacterPromptLength,
  type VerticalDramaCharacterPromptCapability,
} from "./verticalDramaCharacterPromptContract";
import {
  verticalDramaApprovedCharacterVisualBibleSchema,
  type VerticalDramaApprovedCharacterVisualBible,
} from "@shared/verticalDramaSeries/characterProfile";
import {
  verticalDramaCharacterPromptProfileSchema,
  type VerticalDramaCharacterPromptProfile,
} from "@shared/verticalDramaSeries/characterPromptProfile";
import { resolveCharacterRoleTier } from "./verticalDramaCharacterImageGeneration";

const SKILL_SLUG = "character-prompt-skill";
const MIN_SKILL_CREDITS = 2;
const MAX_SUMMARY_CHARS = 1_900;

let cachedSystemPrompt: string | null = null;

function loadSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  const candidates = [
    path.resolve(process.cwd(), "skills", SKILL_SLUG, "skill.md"),
    path.resolve(process.cwd(), "apps/web/skills", SKILL_SLUG, "skill.md"),
  ];
  const source = candidates.find(candidate => fs.existsSync(candidate));
  if (!source) throw new Error(`Skill '${SKILL_SLUG}' skill.md not found`);
  const parsed = parseSkillFile(fs.readFileSync(source, "utf8"));
  if (!parsed.content.trim()) throw new Error(`Skill '${SKILL_SLUG}' has no prompt body`);
  cachedSystemPrompt = parsed.content;
  return cachedSystemPrompt;
}

function bounded(value: string, max: number): string {
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function ageBand(params: GenerateCharacterVisualPromptsParams): VerticalDramaCharacterPromptProfile["age_band"] {
  const age = params.castingAgeProfile;
  const role = params.roleTier ?? "";
  const min = age?.min ?? 18;
  const max = age?.max ?? 34;
  if (role.includes("child") || max <= 12) return "child_6_12";
  if (max <= 17) return "teen_13_17";
  if (min >= 35 || role.includes("elder")) return "adult_35_plus";
  if (min >= 25 || max >= 35) return "adult_25_34";
  return "adult_18_24";
}

function roleTier(params: GenerateCharacterVisualPromptsParams): string {
  const coarse = resolveCharacterRoleTier(params.role, params.description, params.roleTier);
  const roleText = `${params.role ?? ""} ${params.description ?? ""}`.toLowerCase();
  if (coarse === "child") return /หญิง|female|girl|daughter|น้องสาว/.test(roleText) ? "child_heroine" : "child_hero";
  if (coarse === "lead_female") return "lead_female";
  if (coarse === "lead_male") return "lead_male";
  if (coarse === "lead") return "protagonist";
  if (coarse === "villain_female") return "antagonist_female";
  if (coarse === "villain_male") return "antagonist_male";
  if (coarse === "villain") return "antagonist_male";
  if (["elder_patriarch", "grandfather", "great_grandfather", "parent_father"].includes(params.roleTier ?? "")) return "elder_patriarch";
  if (["elder_matriarch", "grandmother", "great_grandmother", "parent_mother"].includes(params.roleTier ?? "")) return "elder_matriarch";
  if (coarse === "support") {
    const intent = params.roleVisualIntent;
    const memorable = Boolean(
      intent &&
        (intent.screenPresenceLevel !== undefined && intent.screenPresenceLevel >= 7 ||
          intent.firstImpression?.toLowerCase().includes("memorable")),
    );
    return memorable ? "support_memorable" : "support_general";
  }
  return /หญิง|female|woman|แม่|ยาย/.test(roleText) ? "supporting_female" : "supporting_male";
}

function narrativeRole(params: GenerateCharacterVisualPromptsParams): string {
  if (params.narrativeRole) return params.narrativeRole;
  const tier = roleTier(params);
  if (tier.startsWith("child_")) return "child_flashback";
  if (tier.startsWith("antagonist")) return "antagonist";
  if (tier.startsWith("lead") || tier === "protagonist") return "protagonist";
  return "supporting";
}

function genderPresentation(params: GenerateCharacterVisualPromptsParams): "female" | "male" | "androgynous" {
  const tier = roleTier(params);
  if (tier.endsWith("female") || tier.endsWith("heroine") || tier === "elder_matriarch") return "female";
  if (tier.endsWith("male") || tier.endsWith("hero") || tier === "elder_patriarch") return "male";
  return "androgynous";
}

function buildRequest(params: GenerateCharacterVisualPromptsParams, renderContext: string) {
  const dna = params.characterDesignContext?.seriesDna;
  const region = params.resolvedCharacterRegion?.descriptor ?? "Thai contemporary features and styling";
  const description = params.description?.trim() || "A fictional character whose visual identity must be grounded in the story role.";
  const story = params.storyContext;
  const seriesDna = {
    title: dna?.title ?? story?.title ?? `Series ${params.seriesId}`,
    genre: dna?.genre ?? story?.genre ?? "contemporary drama",
    tone: dna?.tone ?? story?.tone ?? "emotionally grounded",
    locale: dna?.locale ?? story?.locale ?? "th",
    targetAudience: dna?.targetAudience ?? story?.targetAudience ?? "general audiences",
    dialogueLanguage: dna?.dialogueLanguage ?? "Natural spoken Thai appropriate to the story setting",
    storyWorld: dna?.storyWorld ?? "A contemporary Asian story world",
    emotionalEngine: dna?.emotionalEngine ?? "Relationships, pressure, and personal choice",
    visualCulture: dna?.visualCulture ?? "Contemporary Southeast Asian visual culture",
    realismLevel: dna?.realismLevel ?? "Photorealistic natural skin and physically plausible light",
    beautyDirection: dna?.beautyDirection ?? "Distinctive human faces with believable, non-template beauty",
    dominantColors: dna?.dominantColors?.length ? dna.dominantColors : ["natural neutrals", "story-world accents"],
    signatureMotifs: dna?.signatureMotifs?.length ? dna.signatureMotifs : ["human-scale details"],
    prohibitedRepetition: dna?.prohibitedRepetition ?? ["generic influencer face", "identical facial template"],
  };
  const character = {
    character_id: params.characterKey,
    name: params.name,
    role: params.role ?? undefined,
    ...(params.castingAgeProfile && params.castingAgeProfile.min === params.castingAgeProfile.max
      ? { age: params.castingAgeProfile.min }
      : {}),
    age_band: ageBand(params),
    gender_presentation: genderPresentation(params),
    narrative_role: narrativeRole(params),
    role_tier: roleTier(params),
    description,
    ...(params.occupation ? { occupation: params.occupation } : {}),
    personality_traits: [
      ...(params.roleVisualIntent?.firstImpression
        ? [params.roleVisualIntent.firstImpression]
        : []),
      ...(params.roleVisualIntent?.audienceShouldFeel ?? []),
      ...(params.characterDesignContext?.approvedDesignDna?.recallStack.behavior
        ? [params.characterDesignContext.approvedDesignDna.recallStack.behavior]
        : []),
    ],
    ...(params.characterDesignContext?.approvedDesignDna
      ? {
          visual_overrides: {
            face_archetype: params.characterDesignContext.approvedDesignDna.faceIdentity.facialGeometry,
            hair_direction: params.characterDesignContext.approvedDesignDna.faceIdentity.hair,
            expression_direction: params.characterDesignContext.approvedDesignDna.bodyLanguage.gesturePattern,
            wardrobe_direction: params.characterDesignContext.approvedDesignDna.costumeGrammar,
          },
        }
      : {}),
    ...((params.castingAgeProfile || params.faceSourceReference?.relationshipNote)
      ? {
          continuity_anchors: [
            ...(params.castingAgeProfile
              ? [`Authoritative casting age: ${params.castingAgeProfile.label}`]
              : []),
            ...(params.faceSourceReference?.relationshipNote
              ? [params.faceSourceReference.relationshipNote]
              : []),
          ],
        }
      : {}),
    region_ethnicity: { descriptor: region, explicit: Boolean(params.resolvedCharacterRegion?.isExplicit) },
  };
  return {
    series_dna: seriesDna,
    characters: [character],
    generation: {
      images_per_character: 1,
      face_diversity: "high",
      render_context: renderContext,
    },
  };
}

function summaryFor(profile: VerticalDramaCharacterPromptProfile): string {
  return bounded(
    [
      profile.face_blueprint.face_family,
      profile.face_blueprint.distinctive_detail,
      profile.presentation_profile.wardrobe,
      profile.presentation_profile.pose_expression,
      profile.visual_translation.world_to_environment,
    ].join("; "),
    MAX_SUMMARY_CHARS,
  );
}

function buildSnapshot(
  profile: VerticalDramaCharacterPromptProfile,
  model: string,
  params: GenerateCharacterVisualPromptsParams,
  retryCount: number,
): VerticalDramaApprovedCharacterVisualBible {
  const snapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    model,
    visualIdentitySummary: summaryFor(profile),
    identityAnchors: [
      profile.face_blueprint.face_family,
      profile.face_blueprint.distinctive_detail,
      profile.diversity_signature.lower_face,
    ],
    signatureWardrobe: profile.presentation_profile.wardrobe,
    hairMakeupNotes: profile.presentation_profile.makeup_level,
    performanceEnergy: profile.presentation_profile.pose_expression,
    consistencyStrategy: [
      profile.face_blueprint.face_family,
      profile.face_blueprint.eye_geometry,
      profile.face_blueprint.nose_geometry,
      profile.diversity_signature.mouth_geometry,
    ].join("; "),
    signatureVisualCues: [
      profile.face_blueprint.distinctive_detail,
      profile.diversity_signature.eye_geometry,
      profile.presentation_profile.lighting,
    ],
    colorPalette: profile.series_context.dominant_colors.join(", "),
    storyWorldRelationship: profile.visual_translation.world_to_environment,
    forbiddenDrift: profile.visual_translation.prohibited_patterns,
    emotionalRangeNeeded: [profile.visual_translation.emotional_engine_to_expression],
    ageRange: profile.age_band,
    audienceAppealNotes: profile.quality_gate?.face_priority ?? "distinctive believable face",
    promptContractVersion: VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION,
    promptProfile: params.imagePromptCapability?.promptProfile ?? "rich",
    ...(params.castingPreferences
      ? { castingPreferencesFingerprint: crypto.createHash("sha256").update(JSON.stringify(params.castingPreferences)).digest("hex") }
      : {}),
    semanticRetryCount: Math.max(0, Math.min(8, retryCount)),
    characterPromptProfile: profile,
  };
  return verticalDramaApprovedCharacterVisualBibleSchema.parse(snapshot);
}

export interface CharacterPromptSkillResult {
  prompt: string;
  negativePrompt?: string;
  deliverable: "portrait" | "turnaround" | "sheet";
  characterPromptProfile: VerticalDramaCharacterPromptProfile;
  visualBibleSummary: Record<string, unknown>;
  visualBibleSnapshot: VerticalDramaApprovedCharacterVisualBible;
  creditsUsed: number;
  model: string;
  semanticRetryCount: number;
  promptContractVersion: typeof VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION;
  promptProfile: "rich" | "compact" | "legacy";
}

function renderContextFor(params: GenerateCharacterVisualPromptsParams): { value: string; deliverable: CharacterPromptSkillResult["deliverable"] } {
  let deliverable: CharacterPromptSkillResult["deliverable"] = "portrait";
  let label = "portrait";
  if (params.requestedSheetType && params.requestedSheetType !== "turnaround") {
    deliverable = "sheet";
    label = `sheet:${params.requestedSheetType}`;
  } else if (params.requestedSheetType === "turnaround") {
    deliverable = "turnaround";
    label = "turnaround";
  }
  const facts = {
    deliverable,
    ...(params.customInstruction?.trim() ? { custom_instruction: params.customInstruction.trim() } : {}),
    ...(params.hasOwnReferenceImage ? { has_own_reference_image: true } : {}),
    ...(params.faceSourceReference
      ? { face_source_reference: params.faceSourceReference }
      : {}),
    ...(params.presetVisualIdentity ? { preset_visual_identity: params.presetVisualIdentity } : {}),
  };
  const hasFacts = Object.keys(facts).length > 1;
  return { value: hasFacts ? `${label}\nFACTS_JSON:${JSON.stringify(facts)}` : label, deliverable };
}

export async function generateCharacterPromptWithSkill(
  params: GenerateCharacterVisualPromptsParams,
): Promise<CharacterPromptSkillResult> {
  const hasCredits = await hasEnoughCredits(params.userId, MIN_SKILL_CREDITS);
  if (!hasCredits) throw new InsufficientCreditsError();
  const model = await resolveCharacterVisualBibleModel(params.seriesId);
  const capability: VerticalDramaCharacterPromptCapability | undefined =
    params.imagePromptContractMode === "target" ? params.imagePromptCapability : undefined;
  const context = renderContextFor(params);
  const userPrompt = JSON.stringify(buildRequest(params, context.value), null, 2);
  const planning = await executeJsonPlanningCallWithRetry<VerticalDramaCharacterPromptProfile>({
    model,
    systemPrompt: loadSystemPrompt(),
    userPrompt,
    temperature: 0.55,
    userId: params.userId,
    maxTokens: 3_200,
    retryMaxTokens: 5_000,
    timeoutMs: 150_000,
    maxTransientRetries: 1,
    maxSchemaRetries: 1,
    schema: verticalDramaCharacterPromptProfileSchema,
    label: `Character prompt skill (${context.value})`,
  });
  const profile = planning.data;
  if (capability) assertVerticalDramaCharacterPromptLength(profile.positive_prompt, capability);
  const retryCount = planning.retryCount ?? (planning.retried ? 1 : 0);
  const usage = planning.response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );
  // `character-prompt-skill` is a fixed-price tenant skill (currently two
  // credits). The provider token estimate is retained as audit metadata, but
  // it must not turn one deliverable into a variable multi-credit charge.
  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: MIN_SKILL_CREDITS,
    description: `Character Prompt Skill — ${context.value} (character #${params.characterId})`,
    skillSlug: SKILL_SLUG,
    skillRunId: crypto.randomUUID(),
    sourceType: "skill",
    metadata: {
      feature: "vertical_drama_character_prompt_skill",
      seriesId: params.seriesId,
      characterId: params.characterId,
      deliverable: context.deliverable,
      renderContext: context.value,
      model,
      promptProfile: params.imagePromptCapability?.promptProfile ?? "rich",
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      retryCount,
    },
  });
  const snapshot = buildSnapshot(profile, model, params, retryCount);
  return {
    prompt: profile.positive_prompt,
    negativePrompt: params.imagePromptContractMode === "target" ? undefined : profile.negative_prompt,
    deliverable: context.deliverable,
    characterPromptProfile: profile,
    visualBibleSummary: {
      faceBlueprint: profile.face_blueprint,
      presentationProfile: profile.presentation_profile,
      visualTranslation: profile.visual_translation,
      diversitySignature: profile.diversity_signature,
    },
    visualBibleSnapshot: snapshot,
    creditsUsed: MIN_SKILL_CREDITS,
    model,
    semanticRetryCount: retryCount,
    promptContractVersion: VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION,
    promptProfile: params.imagePromptCapability?.promptProfile ?? "rich",
  };
}
