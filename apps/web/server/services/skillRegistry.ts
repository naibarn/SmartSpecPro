/**
 * Skill Registry - Manages skill loading from database and folder
 *
 * Skills are loaded from:
 * 1. Database (primary source) - skills table
 * 2. Folder auto-sync - skills/ directory is scanned and imported to DB on startup
 *
 * NO hardcoded fallback skills - all skills must come from database or folder.
 */

import { getDb } from "../db";
import { skills as skillsTable } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getDefaultModel, getModelIdsByType, refreshModelCache } from "./modelRegistry";
import { sanitizeMediaModelSelection } from "./mediaModelSelection";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import {
  type SkillType,
  type SkillDefinition,
  type SkillMetadata,
  type SkillExecutionPolicyConfig,
  type PatternRule,
  parseSkillFile,
  mapCategoryToEnum,
  categoryToSkillType,
  parseTriggerPatterns,
  normalizeMetadata,
} from "@smartspec/skills";
import {
  resolveRelativeSkillManifestPath,
  resolveSkillManifestPath,
  resolveSkillLockPath,
  isNativeSkillBundle,
  listNativeBundleContractFiles,
  listNativeSubagentNames,
} from "./skillFiles";
import { clearSchemaCache } from "./skillSchemaLoader";
import { clearSkillCatalogCache } from "./skillCatalog";
import { getInternalSkillDefinitions } from "./internalSkills";
import {
  classifySkillReference,
  getLegacySkillSlugAliases,
  resolveSkillSlugAlias,
} from "../../shared/skillReferenceContracts";

export {
  getLegacySkillSlugAliases,
  resolveSkillSlugAlias,
} from "../../shared/skillReferenceContracts";

export type { SkillType, SkillDefinition } from "@smartspec/skills";

/**
 * Skills directory path
 */
const SKILLS_DIR = path.resolve(process.cwd(), "skills");

function getSkillRenameMetadata(canonicalSlug: string): Partial<{
  name: string;
  description: string;
}> {
  if (canonicalSlug === "elevenlabs-product-voiceover-dialogue") {
    return {
      name: "ElevenLabs Product Voiceover & Dialogue",
      description: "Create safe, expressive product voiceover or dialogue scripts for ElevenLabs TTS from product details, storyboards, and optional product images.",
    };
  }
  return {};
}

/**
 * Map skill type to media type for model lookup
 */
const SKILL_TO_MEDIA_TYPE: Record<string, "image" | "video" | "audio"> = {
  "image-generation": "image",
  "video-generation": "video",
  "audio-generation": "audio",
};

function shouldBackfillBuiltInCategory(
  slug: string,
  currentCategory: string | null | undefined,
  nextCategory: string,
): boolean {
  if (
    slug === "furniture-reference-storyboard"
    && currentCategory === "automation"
    && nextCategory === "image_prompt_generation"
  ) {
    return true;
  }
  if (slug === "image_prompt_engineer") {
    return currentCategory === "image_generation" && nextCategory === "image_prompt_generation";
  }
  if (slug === "video-prompt-engineer") {
    return currentCategory === "video_generation" && nextCategory === "video_prompt_generation";
  }
  if (slug === "image-creator") {
    return currentCategory === "automation" && nextCategory === "image_generation";
  }
  if (slug === "video-creator") {
    return currentCategory === "automation" && nextCategory === "video_generation";
  }
  // Allow reviewer skills to migrate from article_generation to product_review
  if (nextCategory === "product_review" && currentCategory === "article_generation") {
    return true;
  }
  return false;
}

function getMetadataChainTarget(metadata: SkillMetadata): string | undefined {
  const chainTo = metadata.chainTo ?? metadata.chain_to;
  return typeof chainTo === "string" && chainTo.trim() ? chainTo.trim() : undefined;
}

/**
 * Convert database skill to SkillDefinition
 */
function dbSkillToDefinition(dbSkill: {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  isAutoTrigger: boolean;
  triggerPatterns: Array<string | PatternRule> | null;
  isEnabled: boolean;
  enabledByDefault: boolean;
  creditMultiplier: string | null;
  tenantCreditCost?: number | null;
  skillOwnerCreditCost?: number | null;
  tenantId?: string | null;
  priority: number;
  availableModels: string[] | null;
  defaultModel: string | null;
  llmModelId?: string | null;
  preferredProviderId?: number | null;
  strictProviderPin?: boolean | null;
  systemPrompt: string | null;
  skillContent: string | null;
  folderPath: string | null;
  executionMode: string | null;
  chainTo: string | null;
  sandboxProfileSlug?: string | null;
  requiresNetwork?: boolean | null;
  requiresBrowser?: boolean | null;
  maxRuntimeSeconds?: number | null;
  maxInputMb?: number | null;
  executionPolicyJson?: Record<string, any> | null;
}): SkillDefinition {
  const skillType = categoryToSkillType(dbSkill.category) as SkillType;
  const mediaType = SKILL_TO_MEDIA_TYPE[skillType];

  // Get models for media skills if not explicitly set
  let models = dbSkill.availableModels || undefined;
  let defaultModel = dbSkill.defaultModel || undefined;
  const llmModelId = dbSkill.llmModelId || undefined;

  if (mediaType && (!models || models.length === 0)) {
    const modelIds = getModelIdsByType(mediaType);
    models = modelIds;
    // Only override defaultModel if not explicitly set in DB
    if (!defaultModel) {
      const defaultModelDef = getDefaultModel(mediaType);
      defaultModel = defaultModelDef?.id;
    }
  }

  if (mediaType) {
    const sanitizedSelection = sanitizeMediaModelSelection(mediaType, {
      availableModels: models,
      defaultModel,
    });
    models = sanitizedSelection.availableModels ?? undefined;
    defaultModel = sanitizedSelection.defaultModel ?? undefined;
  }

  return {
    id: dbSkill.slug,
    dbId: dbSkill.id,
    name: dbSkill.name,
    description: dbSkill.description || "",
    icon: dbSkill.icon || "sparkles",
    type: skillType,
    category: dbSkill.category,
    triggers: dbSkill.isAutoTrigger ? parseTriggerPatterns(dbSkill.triggerPatterns) : [],
    requiresExplicit: !dbSkill.isAutoTrigger,
    creditMultiplier: Number(dbSkill.creditMultiplier) || 1.0,
    tenantCreditCost: Number.isInteger(dbSkill.tenantCreditCost) ? dbSkill.tenantCreditCost : 2,
    skillOwnerCreditCost: Number.isInteger(dbSkill.skillOwnerCreditCost) ? dbSkill.skillOwnerCreditCost : 0,
    tenantId: dbSkill.tenantId ?? undefined,
    enabledByDefault: dbSkill.enabledByDefault,
    priority: dbSkill.priority,
    models,
    defaultModel,
    llmModelId: llmModelId || defaultModel,
    preferredProviderId: dbSkill.preferredProviderId ?? undefined,
    strictProviderPin: dbSkill.strictProviderPin ?? undefined,
    systemPrompt: dbSkill.systemPrompt || undefined,
    skillContent: dbSkill.skillContent || undefined,
    skillFilePath: dbSkill.folderPath
      ? resolveRelativeSkillManifestPath(dbSkill.folderPath) ?? `${dbSkill.folderPath}/skill.md`
      : undefined,
    nativeBundleReady: dbSkill.folderPath ? isNativeSkillBundle(dbSkill.folderPath) : undefined,
    nativeBundleLockPath: dbSkill.folderPath ? resolveSkillLockPath(dbSkill.folderPath) ?? undefined : undefined,
    nativeBundlePath: dbSkill.folderPath || undefined,
    nativeBundleFiles: dbSkill.folderPath && isNativeSkillBundle(dbSkill.folderPath)
      ? listNativeBundleContractFiles(dbSkill.folderPath)
      : undefined,
    nativeSubagentNames: dbSkill.folderPath && isNativeSkillBundle(dbSkill.folderPath)
      ? listNativeSubagentNames(dbSkill.folderPath)
      : undefined,
    executionMode: (dbSkill.executionMode as any) || "llm-only",
    chainTo: dbSkill.chainTo || undefined,
    sandboxProfileSlug: dbSkill.sandboxProfileSlug ?? undefined,
    requiresNetwork: dbSkill.requiresNetwork ?? undefined,
    requiresBrowser: dbSkill.requiresBrowser ?? undefined,
    maxRuntimeSeconds: dbSkill.maxRuntimeSeconds ?? undefined,
    maxInputMb: dbSkill.maxInputMb ?? undefined,
    executionPolicy: dbSkill.executionPolicyJson ?? undefined,
  } as SkillDefinition;
}

/** Known capability keys for model_requirements frontmatter (Feature 041) */
const KNOWN_REQUIREMENT_KEYS = new Set([
  "supportsVision",
  "supportsThinking",
  "supportsFunctionTools",
  "supportsStructuredOutputs",
  "supportsJsonMode",
  "supportsStrictToolSchema",
  "supportsWebSearch",
  "supportsCodeExecution",
  "supportsComputerUse",
  "supportsBackground",
  "supportsResponses",
  "contextLength",
]);

/**
 * Validates that a raw frontmatter object only contains known capability keys.
 * Filters out unknown keys with a warning.
 */
function parseSkillRequirements(
  raw: Record<string, unknown>,
  skillSlug: string,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (KNOWN_REQUIREMENT_KEYS.has(key)) {
      result[key] = value;
    } else {
      console.warn(
        `[SkillRegistry] Unknown key in model_requirements for skill "${skillSlug}": "${key}" — ignored`,
      );
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function getFrontmatterRoutingConfig(metadata: SkillMetadata, slug?: string): {
  llmModelId?: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  modelRequirements?: Record<string, unknown>;
} {
  const meta = metadata as SkillMetadata & {
    llmModelId?: string;
    llm_model_id?: string;
    preferredProviderId?: number | string;
    preferred_provider_id?: number | string;
    strictProviderPin?: boolean;
    strict_provider_pin?: boolean;
  };

  const rawProviderId = meta.preferredProviderId ?? meta.preferred_provider_id;
  const parsedProviderId = typeof rawProviderId === "string"
    ? Number.parseInt(rawProviderId, 10)
    : rawProviderId;

  // Extract model_requirements (snake_case or camelCase)
  const metaRecord = metadata as unknown as Record<string, unknown>;
  const rawRequirements =
    metaRecord.model_requirements ??
    metaRecord.modelRequirements;

  const modelRequirements =
    rawRequirements != null && typeof rawRequirements === "object"
      ? parseSkillRequirements(rawRequirements as Record<string, unknown>, slug ?? "unknown")
      : undefined;

  return {
    llmModelId: meta.llmModelId ?? meta.llm_model_id,
    preferredProviderId: Number.isFinite(parsedProviderId as number) ? parsedProviderId as number : undefined,
    strictProviderPin: meta.strictProviderPin ?? meta.strict_provider_pin,
    modelRequirements,
  };
}

/**
 * Cached skill registry
 */
let _skillRegistryCache: SkillDefinition[] | null = null;
let _skillRegistryCacheTime: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Auto-sync flag to prevent multiple syncs
 */
let _autoSyncCompleted = false;

/**
 * Scan skills folder and return folder info
 */
function scanSkillsFolder(): Array<{
  slug: string;
  skillMdPath: string;
  hasSkillMd: boolean;
}> {
  const folders: Array<{
    slug: string;
    skillMdPath: string;
    hasSkillMd: boolean;
  }> = [];

  // Check multiple possible paths
  const possibleDirs = [
    SKILLS_DIR,
    path.resolve(process.cwd(), "..", "skills"),
    path.resolve(process.cwd(), "apps", "web", "skills"),
  ];

  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const slug = entry.name;
          const skillDir = path.join(dir, slug);
          const skillMdPath = resolveSkillManifestPath(skillDir);
          const hasSkillMd = !!skillMdPath;

          // Only add if not already found
          if (hasSkillMd && skillMdPath && !folders.find(f => f.slug === slug)) {
            folders.push({ slug, skillMdPath, hasSkillMd });
          }
        }
      } catch (error) {
        console.error(`[SkillRegistry] Error scanning ${dir}:`, error);
      }
    }
  }

  return folders;
}

/**
 * Auto-sync skills from folder to database
 * Called on startup to ensure all folder skills are in database
 */
export async function autoSyncSkillsFromFolder(options?: { force?: boolean }): Promise<{
  synced: string[];
  skipped: string[];
  errors: string[];
}> {
  const result = {
    synced: [] as string[],
    skipped: [] as string[],
    errors: [] as string[],
  };

  if (_autoSyncCompleted && !options?.force) {
    console.log("[SkillRegistry] Auto-sync already completed, skipping");
    return result;
  }

  const db = await getDb();
  if (!db) {
    console.warn("[SkillRegistry] Database not available, cannot auto-sync skills");
    return result;
  }

  // Get existing skills from database (with contentHash for change detection)
  const existingSkills = await db
    .select({ slug: skillsTable.slug, contentHash: skillsTable.contentHash, category: skillsTable.category })
    .from(skillsTable);
  const existingSlugs = new Map(existingSkills.map((s) => [s.slug, s]));

  // Scan folder for skills
  const folderSkills = scanSkillsFolder();
  console.log(`[SkillRegistry] Found ${folderSkills.length} skill folder(s): ${folderSkills.map(f => f.slug).join(", ")}`);

  for (const folder of folderSkills) {
    try {
      const legacySlugs = getLegacySkillSlugAliases(folder.slug);
      const legacyExistingSlug = legacySlugs.find((legacySlug) => existingSlugs.has(legacySlug));

      if (!existingSlugs.has(folder.slug) && legacyExistingSlug) {
        await db.update(skillsTable).set({
          slug: folder.slug,
          folderPath: `skills/${folder.slug}`,
          ...getSkillRenameMetadata(folder.slug),
        }).where(eq(skillsTable.slug, legacyExistingSlug));

        const migratedSkill = existingSlugs.get(legacyExistingSlug);
        if (migratedSkill) {
          existingSlugs.delete(legacyExistingSlug);
          existingSlugs.set(folder.slug, {
            ...migratedSkill,
            slug: folder.slug,
          });
        }

        console.log(`[SkillRegistry] Migrated legacy skill slug ${legacyExistingSlug} -> ${folder.slug}`);
      }

      // Read and parse skill.md
      const content = fs.readFileSync(folder.skillMdPath, "utf-8");
      const parsed = parseSkillFile(content);
      const metadata: SkillMetadata = { ...parsed.metadata, name: parsed.metadata.name ?? folder.slug };
      const routingConfig = getFrontmatterRoutingConfig(metadata, folder.slug);

      // Merge model_requirements into executionPolicyJson (Feature 041)
      const baseExecutionPolicy = metadata.execution_policy ?? metadata.executionPolicy ?? null;
      const executionPolicyJson: SkillExecutionPolicyConfig | null =
        routingConfig.modelRequirements != null
          ? { ...(baseExecutionPolicy ?? {}), requirements: routingConfig.modelRequirements } as SkillExecutionPolicyConfig
          : baseExecutionPolicy;

      const skillData = {
        name: metadata.name || folder.slug,
        description: metadata.description || `Auto-imported from skills/${folder.slug}`,
        category: mapCategoryToEnum(metadata.category) as any,
        version: metadata.version || "1.0.0",
        author: metadata.author,
        icon: metadata.icon || "sparkles",
        tags: metadata.tags || [],
        folderPath: `skills/${folder.slug}`,
        isAutoTrigger: metadata.isAutoTrigger ?? metadata.auto_trigger ?? false,
        triggerPatterns: metadata.triggerPatterns ?? metadata.trigger_patterns ?? [],
        isEnabled: true,
        enabledByDefault: metadata.enabledByDefault ?? metadata.enabled_by_default ?? true,
        creditMultiplier: String(metadata.creditMultiplier ?? metadata.credit_multiplier ?? 1.0),
        tenantCreditCost: 2,
        skillOwnerCreditCost: 0,
        priority: metadata.priority ?? 50,
        skillContent: parsed.content,
        configJson: metadata.config,
        executionMode: metadata.executionMode ?? metadata.execution_mode ?? "llm-only",
        defaultModel: metadata.defaultModel ?? metadata.default_model ?? null,
        llmModelId: routingConfig.llmModelId ?? null,
        preferredProviderId: routingConfig.preferredProviderId ?? null,
        strictProviderPin: routingConfig.strictProviderPin ?? false,
        chainTo: getMetadataChainTarget(metadata) ?? null,
        sandboxProfileSlug: metadata.sandbox_profile ?? null,
        requiresNetwork: metadata.requires_network ?? null,
        requiresBrowser: metadata.requires_browser ?? null,
        maxRuntimeSeconds: metadata.max_runtime_seconds ?? null,
        maxInputMb: metadata.max_input_mb ?? null,
        executionPolicyJson,
        importSource: "folder" as const,
      };

      if (existingSlugs.has(folder.slug)) {
        // Existing skill — only update content-related fields if content actually changed
        // Never overwrite admin-customized fields (name, description, category, icon, tags, etc.)
        const rawContent = fs.readFileSync(folder.skillMdPath, "utf-8");
        const newHash = crypto.createHash("md5").update(rawContent).digest("hex");
        const existingSkill = existingSlugs.get(folder.slug);
        const oldHash = existingSkill?.contentHash;

        if (oldHash !== newHash) {
          const fileDefaultModel = metadata.defaultModel ?? metadata.default_model ?? null;
          const fileTriggerPatterns = metadata.triggerPatterns ?? metadata.trigger_patterns ?? undefined;
          const filePriority = metadata.priority ?? undefined;
          const fileIsAutoTrigger = metadata.isAutoTrigger ?? metadata.auto_trigger ?? undefined;
          const fileCreditMultiplier = metadata.creditMultiplier ?? metadata.credit_multiplier ?? undefined;
          const fileLlmModelId = routingConfig.llmModelId;
          const filePreferredProviderId = routingConfig.preferredProviderId;
          const fileStrictProviderPin = routingConfig.strictProviderPin;
          const normalizedCategory = mapCategoryToEnum(metadata.category);
          const shouldUpdateCategory = shouldBackfillBuiltInCategory(
            folder.slug,
            existingSkill?.category,
            normalizedCategory,
          );
          await db.update(skillsTable).set({
            skillContent: parsed.content,
            systemPrompt: parsed.content,
            contentHash: newHash,
            version: metadata.version || undefined,
            executionMode: metadata.executionMode ?? metadata.execution_mode ?? undefined,
            configJson: metadata.config,
            ...(shouldUpdateCategory ? { category: normalizedCategory as any } : {}),
            ...(fileDefaultModel ? { defaultModel: fileDefaultModel } : {}),
            ...(fileTriggerPatterns ? { triggerPatterns: fileTriggerPatterns } : {}),
            ...(filePriority !== undefined ? { priority: filePriority } : {}),
            ...(fileIsAutoTrigger !== undefined ? { isAutoTrigger: fileIsAutoTrigger } : {}),
            ...(fileCreditMultiplier !== undefined ? { creditMultiplier: String(fileCreditMultiplier) } : {}),
            ...(fileLlmModelId !== undefined ? { llmModelId: fileLlmModelId } : {}),
            ...(filePreferredProviderId !== undefined ? { preferredProviderId: filePreferredProviderId } : {}),
            ...(fileStrictProviderPin !== undefined ? { strictProviderPin: fileStrictProviderPin } : {}),
            ...(getMetadataChainTarget(metadata) !== undefined ? { chainTo: getMetadataChainTarget(metadata) } : {}),
            ...(metadata.sandbox_profile !== undefined ? { sandboxProfileSlug: metadata.sandbox_profile } : {}),
            ...(metadata.requires_network !== undefined ? { requiresNetwork: metadata.requires_network } : {}),
            ...(metadata.requires_browser !== undefined ? { requiresBrowser: metadata.requires_browser } : {}),
            ...(metadata.max_runtime_seconds !== undefined ? { maxRuntimeSeconds: metadata.max_runtime_seconds } : {}),
            ...(metadata.max_input_mb !== undefined ? { maxInputMb: metadata.max_input_mb } : {}),
            ...(executionPolicyJson !== null ? { executionPolicyJson } : {}),
          }).where(eq(skillsTable.slug, folder.slug));
          result.synced.push(folder.slug);
          console.log(`[SkillRegistry] Updated skill content (hash changed): ${folder.slug}`);
        } else {
          result.skipped.push(folder.slug);
        }
      } else {
        // Insert new skill
        const rawContent = fs.readFileSync(folder.skillMdPath, "utf-8");
        const newHash = crypto.createHash("md5").update(rawContent).digest("hex");
        await db.insert(skillsTable).values({ slug: folder.slug, ...skillData, systemPrompt: parsed.content, contentHash: newHash });
        result.synced.push(folder.slug);
        console.log(`[SkillRegistry] Auto-synced new skill: ${folder.slug}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`${folder.slug}: ${errorMsg}`);
      console.error(`[SkillRegistry] Error syncing skill ${folder.slug}:`, error);
    }
  }

  _autoSyncCompleted = true;

  // Clear cache to reload with new skills
  if (result.synced.length > 0) {
    clearSkillRegistryCache();
  }

  console.log(`[SkillRegistry] Auto-sync complete: ${result.synced.length} synced, ${result.skipped.length} skipped, ${result.errors.length} errors`);
  return result;
}

/**
 * Sync a single skill if its contentHash has changed
 * Called when user selects a skill or loads Media Studio
 * Returns true if skill was synced, false if already up-to-date
 */
export async function syncSingleSkillIfChanged(slug: string): Promise<{ synced: boolean; error?: string }> {
  slug = resolveSkillSlugAlias(slug);
  const db = await getDb();
  if (!db) {
    return { synced: false, error: "Database not available" };
  }

  // Find skill manifest file
  const folders = scanSkillsFolder();
  const folder = folders.find(f => f.slug === slug);

  if (!folder || !folder.hasSkillMd) {
    // Not a folder-based skill, skip
    return { synced: false };
  }

  try {
    // Get current hash from database
    const [dbSkill] = await db
      .select({
        contentHash: skillsTable.contentHash,
        category: skillsTable.category,
      })
      .from(skillsTable)
      .where(eq(skillsTable.slug, slug))
      .limit(1);

    // Calculate current file hash
    const rawContent = fs.readFileSync(folder.skillMdPath, "utf-8");
    const fileHash = crypto.createHash("md5").update(rawContent).digest("hex");

    // Compare hashes
    if (dbSkill?.contentHash === fileHash) {
      // Already up-to-date
      return { synced: false };
    }

    // Hash mismatch - sync the skill
    console.log(`[SkillRegistry] Hash mismatch for ${slug}, syncing...`);
    console.log(`[SkillRegistry]   DB hash: ${dbSkill?.contentHash || "(none)"}`);
    console.log(`[SkillRegistry]   File hash: ${fileHash}`);

    // Parse skill.md
    const parsed = parseSkillFile(rawContent);
    const metadata: SkillMetadata = { ...parsed.metadata, name: parsed.metadata.name ?? slug };
    const routingConfig = getFrontmatterRoutingConfig(metadata, slug);

    // Merge model_requirements into executionPolicyJson (Feature 041)
    const baseExecutionPolicy = metadata.execution_policy ?? metadata.executionPolicy ?? null;
    const executionPolicyJson: SkillExecutionPolicyConfig | null =
      routingConfig.modelRequirements != null
        ? { ...(baseExecutionPolicy ?? {}), requirements: routingConfig.modelRequirements } as SkillExecutionPolicyConfig
        : baseExecutionPolicy;

    const normalizedCategory = mapCategoryToEnum(metadata.category);
    const shouldUpdateCategory = dbSkill
      ? shouldBackfillBuiltInCategory(slug, dbSkill.category, normalizedCategory)
      : Boolean(metadata.category);

    const updateData = {
      skillContent: parsed.content,
      systemPrompt: parsed.content,
      contentHash: fileHash,
      version: metadata.version || undefined,
      executionMode: metadata.executionMode ?? metadata.execution_mode ?? undefined,
      configJson: metadata.config,
      ...(shouldUpdateCategory ? { category: normalizedCategory as any } : {}),
      ...(metadata.defaultModel ?? metadata.default_model ? { defaultModel: metadata.defaultModel ?? metadata.default_model } : {}),
      ...(routingConfig.llmModelId !== undefined ? { llmModelId: routingConfig.llmModelId } : {}),
      ...(routingConfig.preferredProviderId !== undefined ? { preferredProviderId: routingConfig.preferredProviderId } : {}),
      ...(routingConfig.strictProviderPin !== undefined ? { strictProviderPin: routingConfig.strictProviderPin } : {}),
      ...(getMetadataChainTarget(metadata) !== undefined ? { chainTo: getMetadataChainTarget(metadata) } : {}),
      ...(metadata.sandbox_profile !== undefined ? { sandboxProfileSlug: metadata.sandbox_profile } : {}),
      ...(metadata.requires_network !== undefined ? { requiresNetwork: metadata.requires_network } : {}),
      ...(metadata.requires_browser !== undefined ? { requiresBrowser: metadata.requires_browser } : {}),
      ...(metadata.max_runtime_seconds !== undefined ? { maxRuntimeSeconds: metadata.max_runtime_seconds } : {}),
      ...(metadata.max_input_mb !== undefined ? { maxInputMb: metadata.max_input_mb } : {}),
      ...(metadata.triggerPatterns ?? metadata.trigger_patterns ? { triggerPatterns: metadata.triggerPatterns ?? metadata.trigger_patterns } : {}),
      ...(metadata.priority !== undefined ? { priority: metadata.priority } : {}),
      ...(metadata.isAutoTrigger ?? metadata.auto_trigger !== undefined ? { isAutoTrigger: metadata.isAutoTrigger ?? metadata.auto_trigger } : {}),
      ...(metadata.creditMultiplier ?? metadata.credit_multiplier !== undefined ? { creditMultiplier: String(metadata.creditMultiplier ?? metadata.credit_multiplier) } : {}),
      ...(executionPolicyJson !== null ? { executionPolicyJson } : {}),
    };

    if (dbSkill) {
      // Update existing
      await db.update(skillsTable).set(updateData).where(eq(skillsTable.slug, slug));
    } else {
      // Insert new (shouldn't happen normally, but handle gracefully)
      const skillData = {
        slug,
        name: metadata.name || slug,
        description: metadata.description || `Auto-imported from skills/${slug}`,
        category: mapCategoryToEnum(metadata.category) as any,
        version: metadata.version || "1.0.0",
        author: metadata.author,
        icon: metadata.icon || "sparkles",
        tags: metadata.tags || [],
        folderPath: `skills/${slug}`,
        isAutoTrigger: metadata.isAutoTrigger ?? metadata.auto_trigger ?? false,
        triggerPatterns: metadata.triggerPatterns ?? metadata.trigger_patterns ?? [],
        isEnabled: true,
        enabledByDefault: metadata.enabledByDefault ?? metadata.enabled_by_default ?? true,
        creditMultiplier: String(metadata.creditMultiplier ?? metadata.credit_multiplier ?? 1.0),
        tenantCreditCost: 2,
        skillOwnerCreditCost: 0,
        priority: metadata.priority ?? 50,
        skillContent: parsed.content,
        systemPrompt: parsed.content,
        contentHash: fileHash,
        configJson: metadata.config,
        executionMode: metadata.executionMode ?? metadata.execution_mode ?? "llm-only",
        defaultModel: metadata.defaultModel ?? metadata.default_model ?? null,
        llmModelId: routingConfig.llmModelId ?? null,
        preferredProviderId: routingConfig.preferredProviderId ?? null,
        strictProviderPin: routingConfig.strictProviderPin ?? false,
        chainTo: getMetadataChainTarget(metadata) ?? null,
        sandboxProfileSlug: metadata.sandbox_profile ?? null,
        requiresNetwork: metadata.requires_network ?? null,
        requiresBrowser: metadata.requires_browser ?? null,
        maxRuntimeSeconds: metadata.max_runtime_seconds ?? null,
        maxInputMb: metadata.max_input_mb ?? null,
        executionPolicyJson,
        importSource: "folder" as const,
      };
      await db.insert(skillsTable).values(skillData);
    }

    // Clear cache to reload
    clearSkillRegistryCache();

    console.log(`[SkillRegistry] Synced skill: ${slug}`);
    return { synced: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SkillRegistry] Error syncing skill ${slug}:`, error);
    return { synced: false, error: errorMsg };
  }
}

/**
 * Load skills from database
 */
async function loadSkillsFromDatabase(): Promise<SkillDefinition[]> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[SkillRegistry] Database not available");
      return [];
    }

    await refreshModelCache();

    // Run auto-sync first if not done
    if (!_autoSyncCompleted) {
      await autoSyncSkillsFromFolder();
    }

    const dbSkills = await db
      .select()
      .from(skillsTable)
      .where(eq(skillsTable.isEnabled, true))
      .orderBy(desc(skillsTable.priority));
    const registry = dbSkills.map((s) => dbSkillToDefinition(s as any));
    const internalSkills = getInternalSkillDefinitions();

    for (const internalSkill of internalSkills) {
      if (!registry.some((skill) => skill.id === internalSkill.id)) {
        registry.push(internalSkill);
      }
    }

    console.log(`[SkillRegistry] Loaded ${dbSkills.length} skills from database (+${internalSkills.length} internal)`);
    return registry;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Database not configured|Database not available/i.test(message)) {
      return getInternalSkillDefinitions();
    }
    console.error("[SkillRegistry] Error loading skills from database:", error);
    return getInternalSkillDefinitions();
  }
}

/**
 * Get the complete skill registry (with caching)
 * Note: This is now async to support database loading
 */
export async function getSkillRegistryAsync(): Promise<SkillDefinition[]> {
  const now = Date.now();

  if (_skillRegistryCache && now - _skillRegistryCacheTime < CACHE_TTL_MS) {
    return _skillRegistryCache;
  }

  _skillRegistryCache = await loadSkillsFromDatabase();
  _skillRegistryCacheTime = now;
  return _skillRegistryCache;
}

/**
 * Get the skill registry (synchronous, uses cache only)
 * For backward compatibility with existing synchronous code
 * NOTE: Returns empty array if cache not populated - use async version when possible
 */
export function getSkillRegistry(): SkillDefinition[] {
  if (_skillRegistryCache) {
    return _skillRegistryCache;
  }

  // Load from database in background
  loadSkillsFromDatabase().then((skills) => {
    _skillRegistryCache = skills;
    _skillRegistryCacheTime = Date.now();
  }).catch((error) => {
    console.error("[SkillRegistry] Background load failed:", error);
  });

  // Return empty array - no fallback
  return [];
}

/**
 * Clear skill registry cache (call when skills are updated)
 */
export function clearSkillRegistryCache(): void {
  _skillRegistryCache = null;
  _skillRegistryCacheTime = 0;
  clearSkillCatalogCache();
  clearSchemaCache();
}

/**
 * Reset auto-sync flag (for testing)
 */
export function resetAutoSyncFlag(): void {
  _autoSyncCompleted = false;
}

/**
 * Get all available skills (async version)
 */
export async function getAvailableSkillsAsync(): Promise<SkillDefinition[]> {
  const skills = await getSkillRegistryAsync();
  return [...skills]
    .filter((skill) => !skill.internalOnly)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Get all available skills (sync version for backward compatibility)
 */
export function getAvailableSkills(): SkillDefinition[] {
  return [...getSkillRegistry()]
    .filter((skill) => !skill.internalOnly)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Get skill by ID (async version)
 */
export async function getSkillByIdAsync(id: string): Promise<SkillDefinition | undefined> {
  if (classifySkillReference(id) !== "executable-skill") return undefined;
  const skills = await getSkillRegistryAsync();
  const resolvedId = resolveSkillSlugAlias(id);
  return skills.find((s) => s.id === resolvedId) ?? skills.find((s) => s.id === id);
}

/**
 * Get skill by ID (sync version for backward compatibility)
 */
export function getSkillById(id: string): SkillDefinition | undefined {
  if (classifySkillReference(id) !== "executable-skill") return undefined;
  const skills = getSkillRegistry();
  const resolvedId = resolveSkillSlugAlias(id);
  return skills.find((s) => s.id === resolvedId) ?? skills.find((s) => s.id === id);
}

/**
 * Get skill by ID or by type (returns first matching skill of that type)
 * This allows looking up skills by either their slug ID or their type
 */
export function getSkillByIdOrType(idOrType: string): SkillDefinition | undefined {
  if (classifySkillReference(idOrType) !== "executable-skill") return undefined;
  const skills = getSkillRegistry();
  const resolvedId = resolveSkillSlugAlias(idOrType);

  // First try exact ID match
  const byId = skills.find((s) => s.id === resolvedId) ?? skills.find((s) => s.id === idOrType);
  if (byId) return byId;

  // Then try type match (return first skill of that type)
  const byType = skills.find((s) => s.type === resolvedId) ?? skills.find((s) => s.type === idOrType);
  if (byType) return byType;

  // Try normalized variations (underscore <-> hyphen)
  const normalized = resolvedId.replace(/-/g, "_");
  const normalizedHyphen = resolvedId.replace(/_/g, "-");

  return skills.find((s) =>
    s.id === normalized ||
    s.id === normalizedHyphen ||
    s.type === normalized ||
    s.type === normalizedHyphen
  );
}

/**
 * Get skills by type
 */
export function getSkillsByType(type: SkillType): SkillDefinition[] {
  return getSkillRegistry().filter((s) => s.type === type && !s.internalOnly);
}

/**
 * Get default enabled skills
 */
export function getDefaultEnabledSkills(): string[] {
  return getSkillRegistry()
    .filter((s) => s.enabledByDefault)
    .map((s) => s.id);
}

/**
 * Refresh the skill cache from database
 * Call this when skills are updated via admin panel
 */
export async function refreshSkillCache(): Promise<void> {
  clearSkillRegistryCache();
  await getSkillRegistryAsync();
}

/**
 * Initialize skill registry on server startup
 * Should be called once when server starts
 */
export async function initializeSkillRegistry(): Promise<void> {
  console.log("[SkillRegistry] Initializing...");

  // Run auto-sync
  const syncResult = await autoSyncSkillsFromFolder();

  // Load skills into cache
  await getSkillRegistryAsync();

  console.log("[SkillRegistry] Initialization complete");
}

// Re-export catalog functions from skillCatalog.ts (Feature 045)
export { getSkillCatalogSummary, buildSkillCategoryGroups } from "./skillCatalog";
