/**
 * Skill Candidate Scorer — multi-dimensional scoring for skill routing.
 *
 * Retrieves candidate skills from the catalog based on TaskProfile + PolicyDecision,
 * then scores them on multiple dimensions to produce a ranked list.
 *
 * Part of Feature 021: Hybrid Skill Orchestrator.
 */

import type { SkillCatalogEntry } from "@shared/orchestration/types";
import type { TaskProfile } from "./taskProfileParser";
import type { PolicyDecision } from "./routingPolicyEngine";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CandidateScores {
  semantic: number;
  domain: number;
  freshness: number;
  modality: number;
  complexity: number;
  historical: number;
}

export interface ScoredCandidate {
  skillId: string;
  scores: CandidateScores;
  compositeScore: number;
  source: "regex" | "classifier" | "catalog";
}

/** Scoring weights — sum to 1.0 */
const WEIGHTS: CandidateScores = {
  semantic: 0.35,
  domain: 0.25,
  modality: 0.15,
  freshness: 0.10,
  complexity: 0.10,
  historical: 0.05,
};

// ─── Catalog Family Mapping ─────────────────────────────────────────────────

function getCatalogFamily(category: string): string {
  if (category.startsWith("image_")) return "media_image";
  if (category.startsWith("video_")) return "media_video";
  if (category.startsWith("audio_") || category === "sound_effects") return "media_audio";
  if (category === "article_generation" || category === "blog_writing") return "article_writing";
  if (category === "product_review" || category.endsWith("_review")) return "product_review";
  if (category === "prompt_enhancement" || category === "image_prompt_generation") return "media_prompts";
  if (["chat_assistant", "translation", "brainstorm", "summarization"].includes(category)) return "content_tools";
  if (category === "code_assistant" || category === "data_analysis") return "code_tools";
  if (category === "web_search" || category === "document_analysis") return "research";
  return "specialist";
}

// ─── Domain Tag Inference ───────────────────────────────────────────────────

/** Explicit domain overrides — only for skills whose slug doesn't self-describe */
const SKILL_DOMAIN_OVERRIDES: Record<string, string[]> = {
  "lifestyle-article-writer": ["health", "travel"],
  "parenting-article-writer": ["education", "health"],
};

/** Auto-extract domain tags from skill slug segments + category */
const SLUG_DOMAIN_MAP: Record<string, string> = {
  fashion: "beauty", clothing: "beauty", beauty: "beauty", skincare: "beauty",
  electronics: "tech", tech: "tech", gadget: "tech", hardware: "tech",
  food: "food", grocery: "food", restaurant: "food",
  travel: "travel", hotel: "travel",
  finance: "finance", business: "finance",
  health: "health", wellness: "health", sports: "health", fitness: "health",
  "real-estate": "real_estate", property: "real_estate",
  education: "education", parenting: "education",
  marketing: "marketing",
  pet: "pet", baby: "family", kids: "family",
  home: "home", household: "home", decor: "home",
  agriculture: "agriculture", garden: "agriculture",
  hobby: "hobby", craft: "hobby",
};

function inferDomainTags(skillId: string, category: string): string[] {
  // Check explicit overrides first
  const override = SKILL_DOMAIN_OVERRIDES[skillId];
  if (override) return override;

  // Auto-extract from slug segments
  const tags = new Set<string>();
  const segments = skillId.split("-");
  for (const seg of segments) {
    const domain = SLUG_DOMAIN_MAP[seg];
    if (domain) tags.add(domain);
  }
  // Also check multi-word slugs
  for (const [key, domain] of Object.entries(SLUG_DOMAIN_MAP)) {
    if (key.includes("-") && skillId.includes(key)) tags.add(domain);
  }

  // Fallback from category
  if (tags.size === 0) {
    if (category === "product_review" || category.endsWith("_review")) tags.add("product_review");
    if (category === "article_generation") tags.add("article");
  }

  return [...tags];
}

// ─── Capability Inference ────────────────────────────────────────────────────

/**
 * Infer capabilities from skill catalog metadata.
 * Uses webSearchCapable flag (from executionPolicy), category, family, and input types.
 */
function inferSkillCapabilities(skill: SkillCatalogEntry): Set<string> {
  const caps = new Set<string>();
  const family = getCatalogFamily(skill.category);

  // Web search: from catalog's webSearchCapable flag (derived from executionPolicy)
  // or family/name heuristic for research-type skills
  if (skill.webSearchCapable || family === "research" ||
      skill.id.includes("web") || skill.id.includes("search")) {
    caps.add("web_search");
  }

  // Vision: skills that accept image_url input
  if (skill.inputTypes.includes("image_url")) {
    caps.add("vision");
  }

  // Code execution: sandbox-based skills
  if (family === "code_tools" || skill.category === "code_assistant") {
    caps.add("code_execution");
  }

  // Media generation
  if (family === "media_image") caps.add("image_generation");
  if (family === "media_video") caps.add("video_generation");
  if (family === "media_audio") caps.add("audio_generation");

  return caps;
}

// ─── Scoring Functions ──────────────────────────────────────────────────────

function scoreDomain(skillDomains: string[], profileDomains: string[]): number {
  if (profileDomains.length === 0) return 0.5; // neutral when no hint
  const overlap = skillDomains.filter((d) => profileDomains.includes(d)).length;
  if (overlap === 0) return 0.1;
  return Math.min(1.0, 0.5 + overlap * 0.25);
}

function scoreFreshness(
  skill: SkillCatalogEntry,
  profile: TaskProfile,
  policy: PolicyDecision,
): number {
  if (profile.freshness === "none" && !policy.forceWebSearch) return 0.5;
  // Skills in research family or with web_search in name get higher score
  const family = getCatalogFamily(skill.category);
  if (family === "research") return 0.9;
  if (skill.id.includes("web") || skill.id.includes("search")) return 0.8;
  if (policy.forceWebSearch) return 0.2; // penalty for non-web skills when web required
  return 0.4;
}

function scoreModality(skill: SkillCatalogEntry, profile: TaskProfile): number {
  const profileNonText = profile.modalities.filter((m) => m !== "text");
  if (profileNonText.length === 0) {
    // Text-only request — text output skills get high score
    return skill.outputTypes.includes("text") ? 0.8 : 0.3;
  }
  // Check output type overlap
  const outputMatch = profileNonText.some((m) => {
    if (m === "image") return skill.outputTypes.includes("image_url");
    if (m === "video") return skill.outputTypes.includes("video_url");
    if (m === "audio") return skill.outputTypes.includes("audio_url");
    return false;
  });
  return outputMatch ? 0.9 : 0.2;
}

function scoreComplexity(skill: SkillCatalogEntry, profile: TaskProfile): number {
  const family = getCatalogFamily(skill.category);
  if (profile.complexity === "single") return 0.7;
  if (profile.complexity === "multi_deliverable") {
    // Orchestration/agency skills score higher for complex tasks
    return family === "specialist" ? 0.6 : 0.5;
  }
  return 0.5;
}

function computeComposite(scores: CandidateScores): number {
  return (
    scores.semantic * WEIGHTS.semantic +
    scores.domain * WEIGHTS.domain +
    scores.freshness * WEIGHTS.freshness +
    scores.modality * WEIGHTS.modality +
    scores.complexity * WEIGHTS.complexity +
    scores.historical * WEIGHTS.historical
  );
}

// ─── Main Functions ─────────────────────────────────────────────────────────

/**
 * Retrieve and score candidate skills from the catalog.
 *
 * Steps:
 * 1. Filter catalog by policy (exclude families, require capabilities)
 * 2. Score each candidate on multiple dimensions
 * 3. Merge regex/classifier scores if available
 * 4. Sort by composite score descending
 */
export function retrieveAndScoreCandidates(
  profile: TaskProfile,
  policy: PolicyDecision,
  catalog: SkillCatalogEntry[],
  regexMatch?: { skillId: string; confidence: number },
  classifierResults?: Array<{ skillId: string; confidence: number }>,
): ScoredCandidate[] {
  // Step 1: Filter by policy (excluded families + required capabilities)
  const filtered = catalog.filter((skill) => {
    const family = getCatalogFamily(skill.category);
    if (policy.excludedFamilies.includes(family)) return false;

    // Enforce requiredCapabilities — infer capabilities from skill metadata
    if (policy.requiredCapabilities.length > 0) {
      const skillCaps = inferSkillCapabilities(skill);
      const missingCap = policy.requiredCapabilities.find((cap) => !skillCaps.has(cap));
      if (missingCap) return false;
    }

    return true;
  });

  // Step 2: Score each candidate
  const candidates: ScoredCandidate[] = filtered.map((skill) => {
    const skillDomains = inferDomainTags(skill.id, skill.category);
    const family = getCatalogFamily(skill.category);

    // Semantic: start neutral, boosted by regex/classifier matches
    let semantic = 0.3;
    if (regexMatch?.skillId === skill.id) {
      semantic = regexMatch.confidence;
    }

    // Domain match
    const domain = scoreDomain(skillDomains, profile.domainHints);

    // Freshness capability
    const freshness = scoreFreshness(skill, profile, policy);

    // Modality match
    const modality = scoreModality(skill, profile);

    // Complexity fit
    const complexity = scoreComplexity(skill, profile);

    // Historical success (default 0.5, fed by telemetry later)
    const historical = 0.5;

    // Language affinity boost — Thai-named skills score higher for Thai requests
    let languageBoost = 0;
    if (profile.languageHint === "th" || profile.languageHint === "mixed") {
      // Skills with Thai triggers or Thai-oriented names get a boost
      const isThaiOriented = skill.name.match(/[\u0E00-\u0E7F]/) ||
        skill.description.match(/[\u0E00-\u0E7F]/) ||
        skill.id.includes("thai");
      if (isThaiOriented) languageBoost = 0.10;
    }

    // Preferred family boost
    let familyBoost = 0;
    if (policy.preferredFamilies.includes(family)) {
      familyBoost = 0.15;
    }

    const scores: CandidateScores = {
      semantic: Math.min(1.0, semantic + languageBoost),
      domain: Math.min(1.0, domain + familyBoost),
      freshness,
      modality,
      complexity,
      historical,
    };

    return {
      skillId: skill.id,
      scores,
      compositeScore: computeComposite(scores),
      source: regexMatch?.skillId === skill.id ? "regex" as const : "catalog" as const,
    };
  });

  // Step 3: Merge classifier results
  if (classifierResults) {
    for (const cr of classifierResults) {
      const existing = candidates.find((c) => c.skillId === cr.skillId);
      if (existing) {
        existing.scores.semantic = Math.max(existing.scores.semantic, cr.confidence);
        existing.compositeScore = computeComposite(existing.scores);
        if (cr.confidence > 0.5) existing.source = "classifier";
      }
    }
  }

  // Step 4: Sort by composite score descending
  candidates.sort((a, b) => b.compositeScore - a.compositeScore);

  return candidates;
}

/** Export for testing */
export { computeComposite, getCatalogFamily, inferDomainTags, WEIGHTS };
