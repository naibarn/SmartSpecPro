import { createHash } from "node:crypto";
import Ajv from "ajv";

import recipeSchema from "../../shared/videoIntelligence/promptRecipe.schema.json";
import {
  MOTION_TEMPLATE_META,
  selectTemplatesFor,
  type AspectRatio,
  type MotionTemplateMeta,
} from "../../shared/videoIntelligence/motionTemplates";

export type PromptRecipe = {
  recipeId: string;
  version: number;
  title: string;
  intentTags: string[];
  styleTags: string[];
  supportedAspectRatios: AspectRatio[];
  durationMs: { min: number; max: number };
  promptTemplate: string;
  source: {
    repository: string;
    revision: string;
    path: string;
    sourceUrl: string;
    author: string;
    authorUrl: string;
    attribution: string;
    contentDigest: string;
    rightsStatus: "approved" | "denied" | "unverified";
    rightsEvidenceRef?: string;
  };
  reuseScope: "user_private" | "tenant" | "marketplace";
  tenantId?: string;
  ownerUserId?: string;
  promotionApprovalRef?: string;
};

export type OpusVideoSource = {
  slug: string;
  author: string;
  author_url: string;
  post_url: string;
  category: string;
  tech_tags: string[];
  prompt: string;
  prompt_partial: boolean;
  poster_url?: string;
  skillry_url?: string;
  added?: string;
};

export type RightsDecision = { status: "approved"; evidenceRef: string } | { status: "denied" | "unverified" };
export type RecipeImportResult = {
  accepted: PromptRecipe[];
  rejected: Array<{ sourceSlug: string; reason: "invalid_source" | "rights_not_approved" | "missing_attribution" | "partial_prompt" | "missing_scope" }>;
  duplicates: string[];
};

const validateRecipe = new Ajv({ allErrors: true, strict: false, validateFormats: false }).compile<PromptRecipe>(recipeSchema);
const SOURCE_REPOSITORY = "yihui-dev/awesome-opus5-5-videos";
const REPOSITORY_URL = "https://github.com/yihui-dev/awesome-opus5-5-videos";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseSource(value: unknown): OpusVideoSource | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<OpusVideoSource>;
  if (
    typeof source.slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,127}$/i.test(source.slug) ||
    typeof source.author !== "string" || !source.author.trim() ||
    typeof source.author_url !== "string" || !safeUrl(source.author_url) ||
    typeof source.post_url !== "string" || !safeUrl(source.post_url) ||
    typeof source.category !== "string" || !source.category.trim() ||
    !Array.isArray(source.tech_tags) || !source.tech_tags.every(tag => typeof tag === "string") ||
    typeof source.prompt !== "string" || !source.prompt.trim() ||
    typeof source.prompt_partial !== "boolean"
  ) return undefined;
  return source as OpusVideoSource;
}

/** Offline transform only. It does not fetch, persist, execute, or trust source code. */
export async function importOpusVideoRecipes(input: unknown, options: {
  sourceRevision: string;
  rightsCheck: (source: OpusVideoSource) => Promise<RightsDecision>;
  existing?: PromptRecipe[];
  reuseScope?: "user_private" | "tenant";
  tenantId?: string;
  ownerUserId?: string;
}): Promise<RecipeImportResult> {
  if (!Array.isArray(input)) throw new Error("Source catalog must be a JSON array");
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(options.sourceRevision)) {
    throw new Error("Source catalog revision must be an immutable Git commit SHA");
  }
  const accepted: PromptRecipe[] = [];
  const rejected: RecipeImportResult["rejected"] = [];
  const duplicates: string[] = [];
  const seen = new Set((options.existing ?? []).map(recipe => `${recipe.source.sourceUrl}:${recipe.source.contentDigest}`));

  for (const raw of input) {
    if (raw && typeof raw === "object") {
      const candidate = raw as Partial<OpusVideoSource>;
      const sourceSlug = typeof candidate.slug === "string" ? candidate.slug : "unknown";
      if (
        typeof candidate.author !== "string" || !candidate.author.trim() ||
        typeof candidate.author_url !== "string" || !safeUrl(candidate.author_url) ||
        typeof candidate.post_url !== "string" || !safeUrl(candidate.post_url)
      ) {
        rejected.push({ sourceSlug, reason: "missing_attribution" });
        continue;
      }
    }
    const source = parseSource(raw);
    if (!source) {
      rejected.push({ sourceSlug: "unknown", reason: "invalid_source" });
      continue;
    }
    if (!source.author.trim() || !source.author_url || !source.post_url) {
      rejected.push({ sourceSlug: source.slug, reason: "missing_attribution" });
      continue;
    }
    if (source.prompt_partial) {
      rejected.push({ sourceSlug: source.slug, reason: "partial_prompt" });
      continue;
    }
    const reuseScope = options.reuseScope ?? "user_private";
    if ((reuseScope === "user_private" && (!options.tenantId || !options.ownerUserId)) || (reuseScope === "tenant" && !options.tenantId)) {
      rejected.push({ sourceSlug: source.slug, reason: "missing_scope" });
      continue;
    }
    const promptDigest = digest(source.prompt.trim());
    const sourceUrl = source.skillry_url && safeUrl(source.skillry_url) ? source.skillry_url : source.post_url;
    const duplicateKey = `${sourceUrl}:${promptDigest}`;
    if (seen.has(duplicateKey)) {
      duplicates.push(source.slug);
      continue;
    }
    const rights = await options.rightsCheck(source);
    if (rights.status !== "approved" || !rights.evidenceRef.trim()) {
      rejected.push({ sourceSlug: source.slug, reason: "rights_not_approved" });
      continue;
    }

    const recipeId = `opus55.${source.slug.toLowerCase()}`;
    const prior = (options.existing ?? []).find(item => item.recipeId === recipeId);
    const recipe: PromptRecipe = {
      recipeId,
      version: prior ? prior.version + (prior.source.contentDigest === promptDigest ? 0 : 1) : 1,
      title: `${source.category}: ${source.author}`.slice(0, 160),
      intentTags: [source.category.toLowerCase(), ...source.tech_tags.map(tag => tag.toLowerCase())].slice(0, 32),
      styleTags: source.tech_tags.map(tag => tag.toLowerCase()).slice(0, 32),
      supportedAspectRatios: ["16:9", "9:16", "1:1"],
      durationMs: { min: 1000, max: 120000 },
      promptTemplate: source.prompt.trim(),
      source: {
        repository: SOURCE_REPOSITORY,
        revision: options.sourceRevision,
        path: `data/videos.json#${source.slug}`,
        sourceUrl,
        author: source.author,
        authorUrl: source.author_url,
        attribution: `${source.author} — ${source.post_url}; catalog: ${REPOSITORY_URL}`,
        contentDigest: promptDigest,
        rightsStatus: "approved",
        rightsEvidenceRef: rights.evidenceRef,
      },
      reuseScope,
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      ...(options.ownerUserId ? { ownerUserId: options.ownerUserId } : {}),
    };
    if (!validateRecipe(recipe)) throw new Error(`Imported recipe violates schema: ${source.slug}`);
    seen.add(duplicateKey);
    accepted.push(recipe);
  }
  return { accepted, rejected, duplicates };
}

export function retrievePromptRecipes(recipes: PromptRecipe[], query: {
  text: string;
  aspectRatio: AspectRatio;
  durationMs: number;
  tenantId?: string;
  ownerUserId?: string;
  limit?: number;
}): Array<{ recipe: PromptRecipe; score: number }> {
  const words = new Set(query.text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1));
  return recipes
    .filter(recipe => recipe.source.rightsStatus === "approved" && recipe.supportedAspectRatios.includes(query.aspectRatio) && query.durationMs >= recipe.durationMs.min && query.durationMs <= recipe.durationMs.max)
    .filter(recipe => recipe.reuseScope === "marketplace" ? Boolean(recipe.promotionApprovalRef) : (recipe.tenantId === query.tenantId && (recipe.reuseScope === "tenant" || recipe.ownerUserId === query.ownerUserId)))
    .map(recipe => {
      const terms = [...recipe.intentTags, ...recipe.styleTags, recipe.title].flatMap(value => value.toLowerCase().split(/[^\p{L}\p{N}]+/u));
      const score = terms.reduce((total, term) => total + (words.has(term) ? 1 : 0), 0);
      return { recipe, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.recipe.recipeId.localeCompare(b.recipe.recipeId))
    .slice(0, query.limit ?? 5);
}

export type MotionRoute =
  | { route: "template"; template: MotionTemplateMeta; reason: "compatible_registry_template" }
  | { route: "generate_candidate"; recipe?: PromptRecipe; reason: "no_compatible_template" | "user_requested_novelty" };

/** Template-first decision; generate_candidate is only a plan and never executes code. */
export function routePromptToMotion(input: {
  text: string;
  categories: string[];
  aspectRatio: AspectRatio;
  durationMs: number;
  userRequestedNovelty?: boolean;
  recipes?: PromptRecipe[];
  tenantId?: string;
  ownerUserId?: string;
}): MotionRoute {
  if (!input.userRequestedNovelty) {
    const costOrder = { low: 0, medium: 1, high: 2 } as const;
    const compatible = selectTemplatesFor({ categories: input.categories, aspectRatio: input.aspectRatio, durationMs: input.durationMs })
      .sort((a, b) => costOrder[a.renderCost] - costOrder[b.renderCost] || a.id.localeCompare(b.id))[0];
    if (compatible) return { route: "template", template: compatible, reason: "compatible_registry_template" };
  }
  const recipe = retrievePromptRecipes(input.recipes ?? [], input)[0]?.recipe;
  return {
    route: "generate_candidate",
    ...(recipe ? { recipe } : {}),
    reason: input.userRequestedNovelty ? "user_requested_novelty" : "no_compatible_template",
  };
}

export const registeredTemplateCount = Object.keys(MOTION_TEMPLATE_META).length;
