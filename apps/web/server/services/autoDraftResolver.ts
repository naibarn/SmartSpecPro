/**
 * AutoDraftResolver
 *
 * Centralized service that resolves ALL parameters for AI draft generation
 * from just a topic string. Used by:
 * - Auto mode in AIDraftModal (UI)
 * - Chat-based presentation creation (headless)
 * - autoDraftTool (Python agent)
 *
 * Resolution strategy: detect from topic → DB priority → fallback chain
 * Every resolution step is logged for audit trail.
 */

import { AI_STYLE_PRESET_IDS } from "@shared/presentation/aiTypes";
import { detectSkill } from "./skillDetector";
import { getAvailableSkillsAsync, getSkillByIdAsync } from "./skillRegistry";
import { getModelsByTypeAsync, getDefaultModel } from "./modelRegistry";
import { suggestModel } from "../routers/modelSuggestTool";
import { loadEnabledModelsWithPricing } from "./capabilityRegistry";
import { auditLogger } from "./auditLogger";
import { resolveProviders } from "./llmRouter";

// ── Types ──────────────────────────────────────────────────

export interface AutoDraftResolution {
  /** Resolved article/draft skill ID */
  draftSkillId: string;
  /** How skill was resolved */
  draftSkillSource: "detected" | "category_match" | "fallback";

  /** Resolved style preset ID */
  stylePresetId: (typeof AI_STYLE_PRESET_IDS)[number];
  /** How style was resolved */
  styleSource: "topic_analysis" | "default";

  /** Resolved image/video model ID (if available) */
  imageModel: string | undefined;
  /** How media model was resolved */
  imageModelSource: "suggested" | "priority" | "fallback" | "none";

  /** Resolved image skill ID (if available) */
  imageSkillId: string | undefined;
  /** How image skill was resolved */
  imageSkillSource: "detected" | "category_match" | "none";

  /** Resolved LLM model for text generation (best available) */
  textModel: string | undefined;

  /** Language detection hint */
  language: "auto" | "en" | "th";

  /** Audit trail of all resolution steps */
  resolutionLog: ResolutionStep[];
}

interface ResolutionStep {
  step: string;
  result: string;
  source: string;
  fallbackUsed: boolean;
  timestamp: string;
}

// ── Style keywords → preset mapping ────────────────────────

const STYLE_KEYWORD_MAP: Record<string, (typeof AI_STYLE_PRESET_IDS)[number]> = {
  // dark-professional
  "business": "dark-professional",
  "ธุรกิจ": "dark-professional",
  "professional": "dark-professional",
  "มืออาชีพ": "dark-professional",
  "corporate": "corporate-blue",
  "องค์กร": "corporate-blue",
  // light-minimalist
  "minimal": "light-minimalist",
  "clean": "light-minimalist",
  "simple": "light-minimalist",
  "สะอาด": "light-minimalist",
  "เรียบ": "light-minimalist",
  // nature-green
  "nature": "nature-green",
  "ธรรมชาติ": "nature-green",
  "environment": "nature-green",
  "สิ่งแวดล้อม": "nature-green",
  "green": "nature-green",
  "eco": "nature-green",
  "organic": "nature-green",
  "health": "nature-green",
  "สุขภาพ": "nature-green",
  // warm-sunset
  "creative": "warm-sunset",
  "สร้างสรรค์": "warm-sunset",
  "art": "warm-sunset",
  "ศิลปะ": "warm-sunset",
  "warm": "warm-sunset",
  "อบอุ่น": "warm-sunset",
  "food": "warm-sunset",
  "อาหาร": "warm-sunset",
  "travel": "warm-sunset",
  "ท่องเที่ยว": "warm-sunset",
  // editorial-clean
  "education": "editorial-clean",
  "การศึกษา": "editorial-clean",
  "research": "editorial-clean",
  "วิจัย": "editorial-clean",
  "academic": "editorial-clean",
  "วิชาการ": "editorial-clean",
  "report": "editorial-clean",
  "รายงาน": "editorial-clean",
  // midnight-luxe
  "luxury": "midnight-luxe",
  "หรูหรา": "midnight-luxe",
  "premium": "midnight-luxe",
  "fashion": "midnight-luxe",
  "แฟชั่น": "midnight-luxe",
  "technology": "midnight-luxe",
  "เทคโนโลยี": "midnight-luxe",
  "tech": "midnight-luxe",
  "ai": "midnight-luxe",
};

// ── Language detection ──────────────────────────────────────

const THAI_CHAR_REGEX = /[\u0E00-\u0E7F]/;

async function pickFirstRoutableTextModel(candidateModelIds: string[]): Promise<string | undefined> {
  const seen = new Set<string>();
  for (const modelId of candidateModelIds) {
    const trimmed = modelId.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    const providers = await resolveProviders(trimmed).catch(() => []);
    if (providers.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function detectLanguage(topic: string): "auto" | "en" | "th" {
  const thaiChars = (topic.match(/[\u0E00-\u0E7F]/g) || []).length;
  const totalChars = topic.replace(/\s/g, "").length;
  if (totalChars === 0) return "auto";
  const thaiRatio = thaiChars / totalChars;
  if (thaiRatio > 0.3) return "th";
  if (thaiRatio < 0.05) return "en";
  return "auto";
}

// ── Main resolver ──────────────────────────────────────────

export async function resolveAutoDraftParams(
  topic: string,
  options?: {
    userId?: number;
    tenantId?: string;
    traceId?: string;
    /** Override number of slides */
    numSlides?: number;
  },
): Promise<AutoDraftResolution> {
  const log: ResolutionStep[] = [];
  const traceId = options?.traceId ?? "auto-resolve";

  const addStep = (step: string, result: string, source: string, fallbackUsed: boolean) => {
    log.push({ step, result, source, fallbackUsed, timestamp: new Date().toISOString() });
  };

  // ── 1. Resolve draft skill ─────────────────────────────
  let draftSkillId: string | undefined;
  let draftSkillSource: AutoDraftResolution["draftSkillSource"] = "fallback";

  // Try skill detection from topic text
  try {
    const detection = await detectSkill(topic);
    if (detection.detected && detection.skill?.id) {
      // Verify the detected skill exists and is an article/text type
      const skill = await getSkillByIdAsync(detection.skill.id);
      if (skill) {
        const category = (skill as unknown as Record<string, unknown>).category as string | undefined;
        if (!category || category === "prompt_enhancement" || category === "chat_assistant") {
          draftSkillId = skill.id;
          draftSkillSource = "detected";
          addStep("draftSkill", skill.id, `detectSkill (confidence: ${detection.confidence})`, false);
        }
      }
    }
  } catch {
    // Detection failed
  }

  // Fallback: find first enabled article-type skill by priority
  if (!draftSkillId) {
    try {
      const allSkills = await getAvailableSkillsAsync();
      const articleSkill = allSkills.find(
        (s) =>
          s.category === "prompt_enhancement" &&
          s.enabledByDefault &&
          s.systemPrompt &&
          s.systemPrompt.length > 0,
      );
      if (articleSkill) {
        draftSkillId = articleSkill.id;
        draftSkillSource = "category_match";
        addStep("draftSkill", articleSkill.id, "first enabled prompt_enhancement skill", true);
      }
    } catch {
      // Registry unavailable
    }
  }

  // Last resort: use general-article-writer
  if (!draftSkillId) {
    draftSkillId = "general-article-writer";
    draftSkillSource = "fallback";
    addStep("draftSkill", "general-article-writer", "last-resort fallback", true);
  }

  // ── 2. Resolve style preset from topic ─────────────────
  let stylePresetId: (typeof AI_STYLE_PRESET_IDS)[number] = "dark-professional";
  let styleSource: AutoDraftResolution["styleSource"] = "default";

  const topicLower = topic.toLowerCase();
  for (const [keyword, preset] of Object.entries(STYLE_KEYWORD_MAP)) {
    if (topicLower.includes(keyword.toLowerCase())) {
      stylePresetId = preset;
      styleSource = "topic_analysis";
      addStep("stylePreset", preset, `keyword match: "${keyword}"`, false);
      break;
    }
  }
  if (styleSource === "default") {
    addStep("stylePreset", stylePresetId, "default (no keyword match)", true);
  }

  // ── 3. Resolve image model ─────────────────────────────
  let imageModel: string | undefined;
  let imageModelSource: AutoDraftResolution["imageModelSource"] = "none";

  // Try suggestModel (uses DB priority + quality heuristics)
  try {
    const suggestion = await suggestModel("image", "balanced");
    if (suggestion.recommended?.model_id) {
      imageModel = suggestion.recommended.model_id;
      imageModelSource = "suggested";
      addStep("imageModel", imageModel, "suggestModel(balanced)", false);
    }
  } catch {
    // Suggest failed
  }

  // Fallback: get highest-priority enabled image model
  if (!imageModel) {
    try {
      const imageModels = await getModelsByTypeAsync("image");
      // Models are already sorted by priority
      if (imageModels.length > 0) {
        imageModel = imageModels[0].id;
        imageModelSource = "priority";
        addStep("imageModel", imageModel, "first enabled image model by priority", true);
      }
    } catch {
      // Registry unavailable
    }
  }

  // Last resort: static default
  if (!imageModel) {
    const defaultModel = getDefaultModel("image");
    if (defaultModel) {
      imageModel = defaultModel.id;
      imageModelSource = "fallback";
      addStep("imageModel", imageModel, "static registry default", true);
    } else {
      addStep("imageModel", "none", "no image models available", true);
    }
  }

  // ── 4. Resolve image skill ─────────────────────────────
  let imageSkillId: string | undefined;
  let imageSkillSource: AutoDraftResolution["imageSkillSource"] = "none";

  try {
    const allSkills = await getAvailableSkillsAsync();
    const imgSkill = allSkills.find(
      (s) =>
        s.category === "image_generation" &&
        s.enabledByDefault &&
        s.systemPrompt &&
        s.systemPrompt.length > 0,
    );
    if (imgSkill) {
      imageSkillId = imgSkill.id;
      imageSkillSource = "category_match";
      addStep("imageSkill", imgSkill.id, "first enabled image_generation skill", false);
    }
  } catch {
    // No image skill available — that's OK, system degrades gracefully
  }

  if (!imageSkillId) {
    addStep("imageSkill", "none", "no image skills available (will use model-based generation)", false);
  }

  // ── 5. Resolve best text LLM model ────────────────────
  let textModel: string | undefined;
  try {
    const models = await loadEnabledModelsWithPricing();
    if (models.length > 0) {
      // Score models for text generation suitability
      const scored = models.map((m) => {
        let score = 0;
        if (m.capabilities.supportsStructuredOutputs) score += 10;
        if (m.capabilities.supportsFunctionTools) score += 5;
        if ((m.capabilities.contextLength ?? 0) >= 100_000) score += 8;
        else if ((m.capabilities.contextLength ?? 0) >= 30_000) score += 4;
        if (m.isFree) score += 3;
        else if (m.pricingInput + m.pricingOutput < 10) score += 2;
        return { modelId: m.modelId, score };
      });

      // Deduplicate
      const best = new Map<string, number>();
      for (const s of scored) {
        const existing = best.get(s.modelId) ?? -1;
        if (s.score > existing) best.set(s.modelId, s.score);
      }
      const sorted = [...best.entries()].sort((a, b) => b[1] - a[1]);
      textModel = await pickFirstRoutableTextModel(sorted.map(([modelId]) => modelId));
      if (textModel) {
        const selectedScore = sorted.find(([modelId]) => modelId === textModel)?.[1];
        addStep("textModel", textModel, `capability-scored routable${selectedScore != null ? ` (score: ${selectedScore})` : ""}`, false);
      } else {
        textModel = await pickFirstRoutableTextModel(models.map((model) => model.modelId));
        if (textModel) {
          addStep("textModel", textModel, "first enabled routable text model", true);
        } else {
          const defaultTextModel = models[0];
          if (defaultTextModel) {
            textModel = defaultTextModel.modelId;
            addStep("textModel", textModel, "first enabled text model", true);
          }
        }
      }
    }
  } catch {
    // DB unavailable
  }

  if (!textModel) {
    addStep("textModel", "none", "no routable text models available", true);
  }

  // ── 6. Detect language ────────────────────────────────
  const language = detectLanguage(topic);
  addStep("language", language, THAI_CHAR_REGEX.test(topic) ? "thai chars detected" : "auto detection", false);

  // ── Log full resolution to audit ──────────────────────
  auditLogger.log({
    traceId,
    timestamp: new Date().toISOString(),
    eventType: "skill_execute",
    userId: options?.userId,
    requestPayload: {
      operation: "auto_draft_resolve",
      topic: topic.slice(0, 200),
      resolutionLog: log,
      resolved: {
        draftSkillId,
        draftSkillSource,
        stylePresetId,
        styleSource,
        imageModel,
        imageModelSource,
        imageSkillId,
        imageSkillSource,
        textModel,
        language,
      },
    },
  });

  return {
    draftSkillId,
    draftSkillSource,
    stylePresetId,
    styleSource,
    imageModel,
    imageModelSource,
    imageSkillId,
    imageSkillSource,
    textModel,
    language,
    resolutionLog: log,
  };
}
