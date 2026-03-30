/**
 * Skill Catalog — generates compact skill summaries for the LLM classifier.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator.
 */

import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { getSkillRegistryAsync } from "./skillRegistry";
import type { SkillCatalogEntry } from "@shared/orchestration/types";

const CACHE_TTL_MS = 60_000;

/** Per-user/per-tenant catalog cache with TTL */
const _skillCatalogCache = new Map<string, { entries: SkillCatalogEntry[]; time: number }>();

/**
 * Maps a skill's DB category value to one of the canonical group names.
 */
function mapCategoryToGroup(category: string): string {
  if (category.startsWith("image_")) return "media_image";
  if (category.startsWith("video_")) return "media_video";
  if (category.startsWith("audio_")) return "media_audio";
  if (category === "article_generation" || category === "blog_writing") return "article_writing";
  if (category === "slide_generation") return "content_tools";
  if (category === "product_review" || category.endsWith("_review")) return "product_review";
  if (category === "prompt_enhancement" || category === "image_prompt_generation") return "media_prompts";
  if (
    category === "chat_assistant" ||
    category === "translation" ||
    category === "brainstorm" ||
    category === "storyboard"
  ) return "content_tools";
  return "specialist";
}

/**
 * Infer output types from a skill's category.
 */
function inferOutputTypes(category: string): string[] {
  if (category.startsWith("image_")) return ["image_url"];
  if (category.startsWith("video_")) return ["video_url"];
  if (category.startsWith("audio_")) return ["audio_url"];
  return ["text"];
}

/**
 * Infer input types from schema properties.
 */
function inferInputTypes(properties: Record<string, Record<string, unknown>> | undefined): string[] {
  const types: string[] = ["text"];
  if (!properties) return types;
  for (const prop of Object.values(properties)) {
    if (prop.format === "uri" || prop.format === "url") {
      if (!types.includes("image_url")) types.push("image_url");
    }
  }
  return types;
}

/**
 * Get a compact skill catalog for the LLM classifier.
 *
 * Filters by user authorization and caches per user/tenant.
 */
export async function getSkillCatalogSummary(
  userId: number,
  tenantId: string,
): Promise<SkillCatalogEntry[]> {
  const cacheKey = `${userId}:${tenantId}`;
  const cached = _skillCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.entries;
  }

  const allSkills = await getSkillRegistryAsync();

  // Get user's restricted skills from DB
  let restrictedSkillIds = new Set<string>();
  try {
    const db = await getDb();
    if (db) {
      const { userSkillVisibility } = await import("../../drizzle/schema");
      const rows = await db
        .select({ skillId: userSkillVisibility.skillId, visible: userSkillVisibility.visible })
        .from(userSkillVisibility)
        .where(eq(userSkillVisibility.userId, userId));
      restrictedSkillIds = new Set(
        rows.filter((r) => !r.visible).map((r) => String(r.skillId)),
      );
    }
  } catch {
    // DB unavailable — proceed without filtering
  }

  const entries: SkillCatalogEntry[] = [];
  for (const skill of allSkills) {
    if (skill.internalOnly) continue;
    if (restrictedSkillIds.has(skill.id)) continue;

    const category = skill.category || skill.type || "specialist";
    const desc = skill.description || "";
    const truncatedDesc = desc.length > 100 ? desc.slice(0, 97) + "..." : desc;

    let hasInputSchema = false;
    let requiredFields: string[] = [];
    let inputTypes: string[] = ["text"];

    if (skill.skillFilePath) {
      const skillFolder = path.dirname(skill.skillFilePath);
      const schemaPath = path.join(skillFolder, "schemas", "input.schema.json");
      hasInputSchema = fs.existsSync(schemaPath);
      if (hasInputSchema) {
        try {
          const raw = fs.readFileSync(schemaPath, "utf-8");
          const schema = JSON.parse(raw) as Record<string, unknown>;
          requiredFields = Array.isArray(schema.required) ? (schema.required as string[]) : [];
          inputTypes = inferInputTypes(
            schema.properties as Record<string, Record<string, unknown>> | undefined,
          );
        } catch {
          hasInputSchema = false;
        }
      }
    }

    // Derive web search capability from executionPolicy
    const ep = skill.executionPolicy;
    const webSearchCapable =
      ep?.requires_web_search === true ||
      ep?.requirements?.supportsWebSearch === true ||
      false;

    entries.push({
      id: skill.id,
      name: skill.name,
      category,
      description: truncatedDesc,
      inputTypes,
      outputTypes: inferOutputTypes(category),
      hasInputSchema,
      requiredFields,
      webSearchCapable,
    });
  }

  _skillCatalogCache.set(cacheKey, { entries, time: Date.now() });
  return entries;
}

/**
 * Builds category groups dynamically from the permitted skills list.
 * Used by the intent classifier (Section 03) for hierarchical tool definitions.
 */
export function buildSkillCategoryGroups(
  skills: SkillCatalogEntry[],
): Record<string, string[]> {
  return skills.reduce<Record<string, string[]>>((acc, skill) => {
    const group = mapCategoryToGroup(skill.category);
    if (!acc[group]) acc[group] = [];
    acc[group].push(skill.id);
    return acc;
  }, {});
}

/**
 * Clear the skill catalog cache. Called from clearSkillRegistryCache().
 */
export function clearSkillCatalogCache(): void {
  _skillCatalogCache.clear();
}
