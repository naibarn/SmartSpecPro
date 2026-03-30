import { describe, it, expect } from "vitest";
import {
  retrieveAndScoreCandidates,
  getCatalogFamily,
  WEIGHTS,
} from "../skillCandidateScorer";
import type { TaskProfile } from "../taskProfileParser";
import type { PolicyDecision } from "../routingPolicyEngine";
import type { SkillCatalogEntry } from "@shared/orchestration/types";

const baseCatalog: SkillCatalogEntry[] = [
  { id: "general-article-writer", name: "General Article Writer", category: "article_generation", description: "Writes articles", inputTypes: ["text"], outputTypes: ["text"], hasInputSchema: false, requiredFields: [] },
  { id: "fashion-clothing-reviewer", name: "Fashion Reviewer", category: "product_review", description: "Reviews fashion items", inputTypes: ["text", "image_url"], outputTypes: ["text"], hasInputSchema: true, requiredFields: ["topic"], webSearchCapable: true },
  { id: "image-creator", name: "Image Creator", category: "image_generation", description: "Creates images", inputTypes: ["text"], outputTypes: ["image_url"], hasInputSchema: true, requiredFields: ["prompt"] },
  { id: "video-creator", name: "Video Creator", category: "video_generation", description: "Creates videos", inputTypes: ["text"], outputTypes: ["video_url"], hasInputSchema: true, requiredFields: ["prompt"] },
  { id: "audio-creator", name: "Audio Creator", category: "audio_generation", description: "Creates audio", inputTypes: ["text"], outputTypes: ["audio_url"], hasInputSchema: true, requiredFields: ["prompt"] },
  { id: "food-grocery-reviewer", name: "Food Reviewer", category: "product_review", description: "Reviews food products", inputTypes: ["text", "image_url"], outputTypes: ["text"], hasInputSchema: true, requiredFields: ["topic"], webSearchCapable: true },
  { id: "business-article-writer", name: "Business Writer", category: "article_generation", description: "Writes business content", inputTypes: ["text"], outputTypes: ["text"], hasInputSchema: false, requiredFields: [] },
];

const baseProfile: TaskProfile = {
  freshness: "none",
  modalities: ["text"],
  complexity: "single",
  domainHints: [],
  capabilityNeeds: { webSearch: false, webSearchExplicit: false, citations: false, vision: false, codeExecution: false },
  languageHint: "en",
};

const basePolicy: PolicyDecision = {
  requiredCapabilities: [],
  excludedFamilies: [],
  preferredFamilies: [],
  forceWebSearch: false,
  forceMultiSkill: false,
  policyReasons: [],
};

describe("getCatalogFamily", () => {
  it("maps image categories to media_image", () => {
    expect(getCatalogFamily("image_generation")).toBe("media_image");
    expect(getCatalogFamily("image_prompt_generation")).toBe("media_image");
  });

  it("maps video categories to media_video", () => {
    expect(getCatalogFamily("video_generation")).toBe("media_video");
  });

  it("maps audio categories to media_audio", () => {
    expect(getCatalogFamily("audio_generation")).toBe("media_audio");
    expect(getCatalogFamily("sound_effects")).toBe("media_audio");
  });

  it("maps article to article_writing", () => {
    expect(getCatalogFamily("article_generation")).toBe("article_writing");
  });

  it("maps slide generation to content_tools", () => {
    expect(getCatalogFamily("slide_generation")).toBe("content_tools");
  });

  it("maps review to product_review", () => {
    expect(getCatalogFamily("product_review")).toBe("product_review");
  });
});

describe("retrieveAndScoreCandidates", () => {
  it("returns all candidates sorted by composite score", () => {
    const result = retrieveAndScoreCandidates(baseProfile, basePolicy, baseCatalog);
    expect(result.length).toBe(baseCatalog.length);
    // Should be sorted descending
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].compositeScore).toBeGreaterThanOrEqual(result[i].compositeScore);
    }
  });

  it("excludes skills in excluded families", () => {
    const policy = { ...basePolicy, excludedFamilies: ["media_image"] };
    const result = retrieveAndScoreCandidates(baseProfile, policy, baseCatalog);
    expect(result.find((c) => c.skillId === "image-creator")).toBeUndefined();
  });

  it("boosts skills in preferred families", () => {
    const policy = { ...basePolicy, preferredFamilies: ["product_review"] };
    const result = retrieveAndScoreCandidates(baseProfile, policy, baseCatalog);
    const reviewer = result.find((c) => c.skillId === "fashion-clothing-reviewer")!;
    const writer = result.find((c) => c.skillId === "general-article-writer")!;
    expect(reviewer.scores.domain).toBeGreaterThan(writer.scores.domain);
  });

  it("scores image skills higher for image modality requests", () => {
    const profile = { ...baseProfile, modalities: ["text", "image"] as TaskProfile["modalities"] };
    const result = retrieveAndScoreCandidates(profile, basePolicy, baseCatalog);
    const imgCreator = result.find((c) => c.skillId === "image-creator")!;
    const writer = result.find((c) => c.skillId === "general-article-writer")!;
    expect(imgCreator.scores.modality).toBeGreaterThan(writer.scores.modality);
  });

  it("scores domain-matching skills higher", () => {
    const profile = { ...baseProfile, domainHints: ["food", "product_review"] };
    const result = retrieveAndScoreCandidates(profile, basePolicy, baseCatalog);
    const foodReviewer = result.find((c) => c.skillId === "food-grocery-reviewer")!;
    const writer = result.find((c) => c.skillId === "general-article-writer")!;
    expect(foodReviewer.scores.domain).toBeGreaterThan(writer.scores.domain);
  });

  it("merges regex match score into semantic", () => {
    const result = retrieveAndScoreCandidates(
      baseProfile, basePolicy, baseCatalog,
      { skillId: "general-article-writer", confidence: 0.85 },
    );
    const writer = result.find((c) => c.skillId === "general-article-writer")!;
    expect(writer.scores.semantic).toBe(0.85);
    expect(writer.source).toBe("regex");
  });

  it("merges classifier results into semantic", () => {
    const result = retrieveAndScoreCandidates(
      baseProfile, basePolicy, baseCatalog,
      undefined,
      [{ skillId: "business-article-writer", confidence: 0.78 }],
    );
    const biz = result.find((c) => c.skillId === "business-article-writer")!;
    expect(biz.scores.semantic).toBe(0.78);
    expect(biz.source).toBe("classifier");
  });

  it("scoring weights sum to 1.0", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("filters out skills missing required capabilities", () => {
    const policy = { ...basePolicy, requiredCapabilities: ["web_search"] };
    const result = retrieveAndScoreCandidates(baseProfile, policy, baseCatalog);
    // general-article-writer and business-article-writer don't have web_search
    const articleWriter = result.find((c) => c.skillId === "general-article-writer");
    expect(articleWriter).toBeUndefined();
    // food-grocery-reviewer should still be present (it's in WEB_SEARCH_SKILL_IDS)
    const foodReviewer = result.find((c) => c.skillId === "food-grocery-reviewer");
    expect(foodReviewer).toBeDefined();
  });

  it("filters out skills missing vision capability", () => {
    const policy = { ...basePolicy, requiredCapabilities: ["vision"] };
    const result = retrieveAndScoreCandidates(baseProfile, policy, baseCatalog);
    // Only skills with image_url in inputTypes should remain
    for (const c of result) {
      const entry = baseCatalog.find((s) => s.id === c.skillId)!;
      expect(entry.inputTypes).toContain("image_url");
    }
  });

  it("applies language boost for Thai-oriented skills on Thai input", () => {
    const thProfile = { ...baseProfile, languageHint: "th" as const };
    // Add a skill with Thai name
    const catalogWithThai = [
      ...baseCatalog,
      { id: "thai-article-writer", name: "นักเขียนบทความไทย", category: "article_generation", description: "เขียนบทความภาษาไทย", inputTypes: ["text"], outputTypes: ["text"], hasInputSchema: false, requiredFields: [] },
    ];
    const result = retrieveAndScoreCandidates(thProfile, basePolicy, catalogWithThai);
    const thaiWriter = result.find((c) => c.skillId === "thai-article-writer")!;
    const enWriter = result.find((c) => c.skillId === "general-article-writer")!;
    expect(thaiWriter.scores.semantic).toBeGreaterThan(enWriter.scores.semantic);
  });

  it("auto-infers domain tags from skill slug", () => {
    // food-grocery-reviewer → should infer "food" domain
    const profileWithFood = { ...baseProfile, domainHints: ["food"] };
    const result = retrieveAndScoreCandidates(profileWithFood, basePolicy, baseCatalog);
    const food = result.find((c) => c.skillId === "food-grocery-reviewer")!;
    const general = result.find((c) => c.skillId === "general-article-writer")!;
    expect(food.scores.domain).toBeGreaterThan(general.scores.domain);
  });
});
