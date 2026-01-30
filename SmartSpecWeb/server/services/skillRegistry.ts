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
import { getModelIdsByType, getDefaultModel } from "./modelRegistry";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

export type SkillType =
  | "image-generation"
  | "video-generation"
  | "audio-generation"
  | "code-assistant"
  | "document-analysis"
  | "web-search"
  | "prompt-enhancement"
  | "automation"
  | "chat-assistant"
  | "translation";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: SkillType;

  /** Regex patterns that trigger this skill */
  triggers: RegExp[];

  /** Whether this skill requires explicit invocation */
  requiresExplicit: boolean;

  /** Credit cost multiplier */
  creditMultiplier: number;

  /** Available models for this skill */
  models?: string[];

  /** Default model if multiple available */
  defaultModel?: string;

  /** Whether skill is enabled by default */
  enabledByDefault: boolean;

  /** Priority for detection (higher = checked first) */
  priority: number;

  /** System prompt for LLM-based skills (like prompt-enhancement) */
  systemPrompt?: string;

  /** Skill content (markdown instructions) */
  skillContent?: string;

  /** Reference to external skill file path */
  skillFilePath?: string;

  /** Database ID if from database */
  dbId?: number;
}

/**
 * Skills directory path
 */
const SKILLS_DIR = path.resolve(process.cwd(), "skills");

/**
 * Skill metadata from skill.md frontmatter
 */
interface SkillMetadata {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  // Support both snake_case and camelCase from YAML frontmatter
  auto_trigger?: boolean;
  isAutoTrigger?: boolean;
  trigger_patterns?: string[];
  triggerPatterns?: string[];
  credit_multiplier?: number;
  creditMultiplier?: number;
  priority?: number;
  enabled_by_default?: boolean;
  enabledByDefault?: boolean;
  config?: Record<string, any>;
}

/**
 * Parse skill.md file - extract frontmatter and content
 */
function parseSkillFile(content: string): { metadata: SkillMetadata; content: string } {
  if (content.startsWith("---")) {
    const parts = content.split("---");
    if (parts.length >= 3) {
      try {
        const frontmatter = yaml.load(parts[1]) as SkillMetadata;
        const body = parts.slice(2).join("---").trim();
        return { metadata: frontmatter || {}, content: body };
      } catch {
        return { metadata: {} as SkillMetadata, content };
      }
    }
  }
  return { metadata: {} as SkillMetadata, content };
}

/**
 * Map category string to database enum value
 */
function mapCategoryToEnum(category?: string): string {
  const categoryMap: Record<string, string> = {
    "prompt_enhancement": "prompt_enhancement",
    "prompt-enhancement": "prompt_enhancement",
    "image_generation": "image_generation",
    "image-generation": "image_generation",
    "video_generation": "video_generation",
    "video-generation": "video_generation",
    "audio_generation": "audio_generation",
    "audio-generation": "audio_generation",
    "sound_effects": "sound_effects",
    "sound-effects": "sound_effects",
    "code_assistant": "code_assistant",
    "code-assistant": "code_assistant",
    "document_analysis": "document_analysis",
    "document-analysis": "document_analysis",
    "web_search": "web_search",
    "web-search": "web_search",
    "automation": "automation",
    "chat_assistant": "chat_assistant",
    "chat-assistant": "chat_assistant",
    "translation": "translation",
    "summarization": "summarization",
    "data_analysis": "data_analysis",
    "data-analysis": "data_analysis",
    "other": "other",
  };
  return categoryMap[category || ""] || "prompt_enhancement";
}

/**
 * Map database category to skill type
 */
function categoryToType(category: string): SkillType {
  const categoryMap: Record<string, SkillType> = {
    "image_generation": "image-generation",
    "video_generation": "video-generation",
    "audio_generation": "audio-generation",
    "sound_effects": "audio-generation",
    "code_assistant": "code-assistant",
    "document_analysis": "document-analysis",
    "web_search": "web-search",
    "prompt_enhancement": "prompt-enhancement",
    "automation": "automation",
    "chat_assistant": "chat-assistant",
    "translation": "translation",
  };
  return categoryMap[category] || "prompt-enhancement";
}

/**
 * Parse trigger patterns from database (stored as JSON array of strings)
 */
function parseTriggerPatterns(patterns: string[] | null | undefined): RegExp[] {
  if (!patterns || !Array.isArray(patterns)) return [];
  return patterns
    .map((p) => {
      try {
        return new RegExp(p, "i");
      } catch {
        return null;
      }
    })
    .filter((r): r is RegExp => r !== null);
}

/**
 * Map skill type to media type for model lookup
 */
const SKILL_TO_MEDIA_TYPE: Record<string, "image" | "video" | "audio"> = {
  "image-generation": "image",
  "video-generation": "video",
  "audio-generation": "audio",
};

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
  triggerPatterns: string[] | null;
  isEnabled: boolean;
  enabledByDefault: boolean;
  creditMultiplier: string | null;
  priority: number;
  availableModels: string[] | null;
  defaultModel: string | null;
  systemPrompt: string | null;
  skillContent: string | null;
  folderPath: string | null;
}): SkillDefinition {
  const skillType = categoryToType(dbSkill.category);
  const mediaType = SKILL_TO_MEDIA_TYPE[skillType];

  // Get models for media skills if not explicitly set
  let models = dbSkill.availableModels || undefined;
  let defaultModel = dbSkill.defaultModel || undefined;

  if (mediaType && (!models || models.length === 0)) {
    const modelIds = getModelIdsByType(mediaType);
    const defaultModelDef = getDefaultModel(mediaType);
    models = modelIds;
    defaultModel = defaultModelDef?.id;
  }

  return {
    id: dbSkill.slug,
    dbId: dbSkill.id,
    name: dbSkill.name,
    description: dbSkill.description || "",
    icon: dbSkill.icon || "sparkles",
    type: skillType,
    triggers: dbSkill.isAutoTrigger ? parseTriggerPatterns(dbSkill.triggerPatterns) : [],
    requiresExplicit: !dbSkill.isAutoTrigger,
    creditMultiplier: Number(dbSkill.creditMultiplier) || 1.0,
    enabledByDefault: dbSkill.enabledByDefault,
    priority: dbSkill.priority,
    models,
    defaultModel,
    systemPrompt: dbSkill.systemPrompt || undefined,
    skillContent: dbSkill.skillContent || undefined,
    skillFilePath: dbSkill.folderPath ? `${dbSkill.folderPath}/skill.md` : undefined,
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
    path.resolve(process.cwd(), "SmartSpecWeb", "skills"),
  ];

  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const slug = entry.name;
          const skillMdPath = path.join(dir, slug, "skill.md");
          const hasSkillMd = fs.existsSync(skillMdPath);

          // Only add if not already found
          if (hasSkillMd && !folders.find(f => f.slug === slug)) {
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
export async function autoSyncSkillsFromFolder(): Promise<{
  synced: string[];
  skipped: string[];
  errors: string[];
}> {
  const result = {
    synced: [] as string[],
    skipped: [] as string[],
    errors: [] as string[],
  };

  if (_autoSyncCompleted) {
    console.log("[SkillRegistry] Auto-sync already completed, skipping");
    return result;
  }

  const db = await getDb();
  if (!db) {
    console.warn("[SkillRegistry] Database not available, cannot auto-sync skills");
    return result;
  }

  // Get existing skills from database
  const existingSkills = await db.select({ slug: skillsTable.slug }).from(skillsTable);
  const existingSlugs = new Set(existingSkills.map(s => s.slug));

  // Scan folder for skills
  const folderSkills = scanSkillsFolder();
  console.log(`[SkillRegistry] Found ${folderSkills.length} skill folder(s): ${folderSkills.map(f => f.slug).join(", ")}`);

  for (const folder of folderSkills) {
    try {
      // Read and parse skill.md
      const content = fs.readFileSync(folder.skillMdPath, "utf-8");
      const parsed = parseSkillFile(content);
      const metadata: SkillMetadata = { name: folder.slug, ...parsed.metadata };

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
        priority: metadata.priority ?? 50,
        skillContent: parsed.content,
        configJson: metadata.config,
        importSource: "folder" as const,
      };

      if (existingSlugs.has(folder.slug)) {
        // Update existing skill with latest content from folder
        await db.update(skillsTable).set(skillData).where(eq(skillsTable.slug, folder.slug));
        result.synced.push(folder.slug);
        console.log(`[SkillRegistry] Updated skill from folder: ${folder.slug}`);
      } else {
        // Insert new skill
        await db.insert(skillsTable).values({ slug: folder.slug, ...skillData });
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
 * Load skills from database
 */
async function loadSkillsFromDatabase(): Promise<SkillDefinition[]> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[SkillRegistry] Database not available");
      return [];
    }

    // Run auto-sync first if not done
    if (!_autoSyncCompleted) {
      await autoSyncSkillsFromFolder();
    }

    const dbSkills = await db
      .select()
      .from(skillsTable)
      .where(eq(skillsTable.isEnabled, true))
      .orderBy(desc(skillsTable.priority));

    if (dbSkills.length === 0) {
      console.log("[SkillRegistry] No skills in database");
      return [];
    }

    console.log(`[SkillRegistry] Loaded ${dbSkills.length} skills from database`);
    return dbSkills.map((s) => dbSkillToDefinition(s as any));
  } catch (error) {
    console.error("[SkillRegistry] Error loading skills from database:", error);
    return [];
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
  return [...skills].sort((a, b) => b.priority - a.priority);
}

/**
 * Get all available skills (sync version for backward compatibility)
 */
export function getAvailableSkills(): SkillDefinition[] {
  return [...getSkillRegistry()].sort((a, b) => b.priority - a.priority);
}

/**
 * Get skill by ID (async version)
 */
export async function getSkillByIdAsync(id: string): Promise<SkillDefinition | undefined> {
  const skills = await getSkillRegistryAsync();
  return skills.find((s) => s.id === id);
}

/**
 * Get skill by ID (sync version for backward compatibility)
 */
export function getSkillById(id: string): SkillDefinition | undefined {
  return getSkillRegistry().find((s) => s.id === id);
}

/**
 * Get skill by ID or by type (returns first matching skill of that type)
 * This allows looking up skills by either their slug ID or their type
 */
export function getSkillByIdOrType(idOrType: string): SkillDefinition | undefined {
  const skills = getSkillRegistry();

  // First try exact ID match
  const byId = skills.find((s) => s.id === idOrType);
  if (byId) return byId;

  // Then try type match (return first skill of that type)
  const byType = skills.find((s) => s.type === idOrType);
  if (byType) return byType;

  // Try normalized variations (underscore <-> hyphen)
  const normalized = idOrType.replace(/-/g, "_");
  const normalizedHyphen = idOrType.replace(/_/g, "-");

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
  return getSkillRegistry().filter((s) => s.type === type);
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
