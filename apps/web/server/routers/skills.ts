/**
 * Skills tRPC Router
 * Handles skill management and prompt enhancement
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getAvailableSkills,
  getSkillById,
  getSkillByIdOrType,
  SkillDefinition,
  refreshSkillCache,
  syncSingleSkillIfChanged,
} from "../services/skillRegistry";
import {
  getStyleCategories,
  getVFXCategories,
  getPromptOptions,
  buildSystemPrompt,
  buildUserPrompt,
  parsePromptResponse,
  loadSkillFile,
  type PromptEnhancementRequest,
} from "../services/promptEnhancementService";
import { db, getDb } from "../db";
import { llmProviders, skills, type Skill, type InsertSkill } from "../../drizzle/schema";
import { eq, asc, desc, like, or, and, sql } from "drizzle-orm";
import { deductCredits, calculateCreditsForLLM, hasEnoughCredits } from "../services/creditService";
import { getProviderForModel } from "../services/llmRouter";
import { getUploadsDir } from "../storage";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import AdmZip from "adm-zip";
import {
  getUserVisibleSkills as _getUserVisibleSkills,
  getAllSkillsForUser,
  setSkillVisibility,
  batchSetVisibility,
  setAutoTrigger,
} from "../services/userSkillService";
import { generateMarketplaceContent } from "../services/marketplaceContentGenerator";
import { decrypt } from "../services/crypto";

// Skills directory path
const SKILLS_DIR = path.resolve(process.cwd(), "skills");

/**
 * Parse skill.md frontmatter and content
 */
export interface SkillMetadata {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  auto_trigger?: boolean;
  trigger_patterns?: string[];
  credit_multiplier?: number;
  priority?: number;
  enabled_by_default?: boolean;
  config?: Record<string, any>;
}

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
 * Map category string to enum value
 */
function mapCategoryToEnum(category?: string): string {
  const categoryMap: Record<string, string> = {
    "prompt_enhancement": "prompt_enhancement",
    "prompt-enhancement": "prompt_enhancement",
    "image_generation": "image_generation",
    "image-generation": "image_generation",
    "video_generation": "video_generation",
    "video-generation": "video_generation",
    "image_video_generation": "image_video_generation",
    "image-video-generation": "image_video_generation",
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
    "data_analysis": "data_analysis",
    "data-analysis": "data_analysis",
    "translation": "translation",
    "summarization": "summarization",
    "chat_assistant": "chat_assistant",
    "chat-assistant": "chat_assistant",
    "automation": "automation",
    "other": "other",
  };
  const cat = category?.toLowerCase() || "";
  if (categoryMap[cat]) return categoryMap[cat];
  // Fuzzy mapping for external skills with free-text categories
  if (cat.includes("code") || cat.includes("dev") || cat.includes("engineer") || cat.includes("programming")) return "code_assistant";
  if (cat.includes("write") || cat.includes("content") || cat.includes("blog") || cat.includes("copy")) return "chat_assistant";
  if (cat.includes("data") || cat.includes("analy")) return "data_analysis";
  if (cat.includes("image") || cat.includes("photo") || cat.includes("visual")) return "image_generation";
  if (cat.includes("video") || cat.includes("film") || cat.includes("movie")) return "video_generation";
  if (cat.includes("audio") || cat.includes("music") || cat.includes("sound")) return "audio_generation";
  if (cat.includes("translat")) return "translation";
  if (cat.includes("summar")) return "summarization";
  if (cat.includes("search")) return "web_search";
  if (cat.includes("doc") || cat.includes("document")) return "document_analysis";
  if (cat.includes("automat") || cat.includes("workflow")) return "automation";
  return "chat_assistant"; // default for external skills (most are chat-based)
}

function decryptApiKey(text: string): string {
  return decrypt(text);
}

// Note: getActiveLlmProvider removed — now uses getProviderForModel from llmRouter

/**
 * Convert image URL to a format the LLM can use
 * - Relative URLs (/uploads/...) are converted to base64 data URLs
 * - Full URLs are passed through as-is
 */
async function convertImageUrlForLLM(url: string): Promise<string> {
  // If it's already a data URL or full HTTP URL, return as-is
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    console.log(`[Skills] Image URL is already accessible: ${url.substring(0, 50)}...`);
    return url;
  }

  // If it's a relative URL, read the file and convert to base64
  if (url.startsWith("/uploads/")) {
    try {
      // Use the same uploads directory as storage.ts
      const uploadsDir = getUploadsDir();
      const relativePath = url.replace("/uploads/", "");
      const filePath = path.join(uploadsDir, relativePath);

      console.log(`[Skills] Converting image to base64: ${url}`);
      console.log(`[Skills] Uploads dir: ${uploadsDir}`);
      console.log(`[Skills] Full path: ${filePath}`);

      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");

        // Detect mime type from extension
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
        };
        const mimeType = mimeTypes[ext] || "image/png";

        console.log(`[Skills] Successfully converted image to base64 (${fileBuffer.length} bytes, ${mimeType})`);
        return `data:${mimeType};base64,${base64}`;
      } else {
        console.warn(`[Skills] Image file not found: ${filePath}`);
        // Try alternate path (cwd-relative)
        const altPath = path.resolve(process.cwd(), "uploads", relativePath);
        console.log(`[Skills] Trying alternate path: ${altPath}`);
        if (fs.existsSync(altPath)) {
          const fileBuffer = fs.readFileSync(altPath);
          const base64 = fileBuffer.toString("base64");
          const ext = path.extname(altPath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
          };
          const mimeType = mimeTypes[ext] || "image/png";
          console.log(`[Skills] Successfully converted from alternate path (${fileBuffer.length} bytes)`);
          return `data:${mimeType};base64,${base64}`;
        }
        console.error(`[Skills] Image not found at either path`);
        return url; // Return original URL as fallback
      }
    } catch (error) {
      console.error(`[Skills] Failed to convert image to base64:`, error);
      return url; // Return original URL as fallback
    }
  }

  console.warn(`[Skills] Unknown URL format, returning as-is: ${url}`);
  return url;
}

/**
 * Call LLM with vision support
 * @param maxTokens - Maximum tokens for response. Default 2000. For multi-prompt, use ~500 per prompt.
 */
async function callLLMWithVision(
  systemPrompt: string,
  userPrompt: string,
  imageUrls: string[] = [],
  model?: string,
  maxTokens: number = 2000
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number } }> {
  const useModel = model || "gpt-4o-mini";
  const provider = await getProviderForModel(useModel);
  if (!provider) {
    throw new Error("No LLM provider configured");
  }

  // Build messages with vision support
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: userPrompt }
  ];

  // Add images if provided (for vision analysis)
  // Convert relative URLs to base64 data URLs so LLM can access them
  for (const imageUrl of imageUrls) {
    const convertedUrl = await convertImageUrlForLLM(imageUrl);
    userContent.push({
      type: "image_url",
      image_url: { url: convertedUrl }
    });
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const url = baseUrl.includes("/v1")
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    throw new Error(`LLM request failed: ${error}`);
  }

  const data = await response.json();

  // Extract content - reasoning models like GPT-5.2 may put response in `reasoning` field
  const message = data.choices?.[0]?.message;
  let content = message?.content || "";

  // Fallback: If content is empty, try to extract from reasoning field (for reasoning models)
  if (!content && message?.reasoning) {
    const reasoning = message.reasoning as string;
    // Try to extract content after "Output:" or similar markers
    const outputMatch = reasoning.match(/(?:Output|Result|Final prompt|Generated prompt):\s*(.+?)(?:\n\n|$)/is);
    if (outputMatch) {
      content = outputMatch[1].trim();
    } else {
      // If no clear marker, use the last substantial paragraph as fallback
      const paragraphs = reasoning.split(/\n\n+/).filter(p => p.trim().length > 20);
      if (paragraphs.length > 0) {
        content = paragraphs[paragraphs.length - 1].trim();
      }
    }
  }

  const usage = data.usage || {};

  return {
    content,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
    }
  };
}

// ==================== Zod Schemas ====================

const skillTypeSchema = z.enum([
  "image-generation",
  "video-generation",
  "audio-generation",
  "code-assistant",
  "document-analysis",
  "web-search",
  "prompt-enhancement",
]);

const promptEnhancementRequestSchema = z.object({
  userInput: z.string().max(5000), // Allow empty when images are provided
  // Accept any string for images - they may be relative URLs (/uploads/...) or full URLs
  referenceImages: z.array(z.string().min(1)).max(5).optional(),
  referenceImageRoles: z.array(z.object({
    role: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  styleCategory: z.string().optional(),
  styleName: z.string().optional(),
  styleCustom: z.string().optional(),
  vfxCategory: z.string().optional(),
  vfxEffect: z.string().optional(),
  vfxEffects: z.array(z.string()).optional(),
  vfxCustom: z.array(z.string()).optional(),
  realisticSkin: z.boolean().optional(),
  faceLock: z.boolean().optional(),
  identityLock: z.enum(["none", "soft_lock_person", "strict_lock_product"]).optional(),
  aspectRatio: z.string().optional(),
  aspectRatioCustom: z.string().optional(),
  language: z.enum(["en", "th", "both"]).optional(),
  // LLM model selection for Advanced Mode - allows user to choose vision-capable model
  model: z.string().optional(), // e.g., "openai/gpt-4o", "anthropic/claude-3.5-sonnet"

  // === Full Schema Support (v2.1) ===
  generationMode: z.enum(["text_to_image", "image_to_image", "inpaint", "outpaint", "variation"]).optional(),
  backgroundType: z.enum(["normal", "green_screen", "blue_screen", "transparent"]).optional(),
  task: z.enum(["final_prompt", "background_10", "ideas_10", "angles_10", "storyboard_continue", "storyboard_6", "infographic_layout", "style_catalog", "vfx_catalog", "typography_catalog"]).optional(),
  // prompt_count can be "1", "2_distinct", "4_2x2", etc. - extract the leading number
  prompt_count: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const num = parseInt(val, 10);
        return isNaN(num) ? undefined : num;
      }
      return val;
    },
    z.number().int().min(1).max(16).optional()
  ),
  detailLevel: z.enum(["compact", "standard", "full"]).optional(),
  textOnImage: z.boolean().optional(),
  headline: z.string().optional(),
  bodyText: z.string().optional(),
  typography: z.object({
    fontPersonality: z.array(z.string()).optional(),
    compositionStyle: z.array(z.string()).optional(),
    moodTone: z.array(z.string()).optional(),
    colorDirection: z.array(z.string()).optional(),
    textEffects: z.array(z.string()).optional(),
    useCaseTemplates: z.array(z.string()).optional(),
    modernTrendPacks: z.array(z.string()).optional(),
    layoutAddOns: z.array(z.string()).optional(),
    typographyCustom: z.string().optional(),
  }).optional(),
  editMask: z.object({
    type: z.string().optional(),
    segmentPrompt: z.string().optional(),
    preserveAreas: z.array(z.string()).optional(),
    feather: z.number().optional(),
    invert: z.boolean().optional(),
  }).optional(),
  outpaintConfig: z.object({
    expandLeft: z.number().optional(),
    expandRight: z.number().optional(),
    expandTop: z.number().optional(),
    expandBottom: z.number().optional(),
    blendWidth: z.number().optional(),
    matchStyle: z.boolean().optional(),
  }).optional(),
  advancedParams: z.object({
    denoisingStrength: z.number().optional(),
    guidanceScale: z.number().optional(),
    steps: z.number().optional(),
    seed: z.number().optional(),
    sampler: z.string().optional(),
    clipSkip: z.number().optional(),
  }).optional(),
  controlnet: z.object({
    enabled: z.boolean().optional(),
    type: z.string().optional(),
    weight: z.number().optional(),
    guidanceStart: z.number().optional(),
    guidanceEnd: z.number().optional(),
  }).optional(),
  ipAdapter: z.object({
    enabled: z.boolean().optional(),
    mode: z.string().optional(),
    weight: z.number().optional(),
    startStep: z.number().optional(),
    endStep: z.number().optional(),
  }).optional(),
  targetPlatform: z.enum(["generic", "stable_diffusion", "midjourney", "dall_e_3", "gemini_imagen", "flux", "firefly"]).optional(),
  preferences: z.array(z.string()).optional(),
  // Max prompt length from selected media model - skill will respect this limit
  maxPromptLength: z.number().int().min(100).max(10000).optional(),
});

// ==================== Schema Conversion Helpers ====================

interface SkillInputSchema {
  version: string;
  skillId: string;
  title: string;
  description?: string;
  sections: SchemaSection[];
  outputMapping?: Record<string, string>;
}

interface SchemaSection {
  id: string;
  title: string;
  collapsed?: boolean;
  fields: SchemaField[];
}

interface SchemaField {
  id: string;
  type: "text" | "textarea" | "select" | "boolean" | "imageUpload" | "number";
  label: string;
  labelTh?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  default?: any;
  rows?: number;
  options?: SelectOption[];
  optionGroups?: Record<string, SelectOption[]>;
  dependsOn?: {
    field: string;
    value?: string;
    notEmpty?: boolean;
  };
}

interface SelectOption {
  value: string;
  label: string;
  labelTh?: string;
}

/**
 * Convert standard JSON Schema to our custom skill input schema format
 */
function convertJsonSchemaToSkillSchema(jsonSchema: any, skillId: string): SkillInputSchema {
  const title = jsonSchema.title || skillId;
  const description = jsonSchema.description || "";
  const properties = jsonSchema.properties || {};
  const requiredFields = jsonSchema.required || [];

  // Group fields into sections based on property names or structure
  const fields: SchemaField[] = [];

  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    const field = convertPropertyToField(key, prop, requiredFields.includes(key));
    if (field) {
      fields.push(field);
    }
  }

  // Group fields into logical sections
  const basicFields = fields.filter(f =>
    ["request", "userIdea", "prompt", "input", "text", "description"].some(k =>
      f.id.toLowerCase().includes(k)
    )
  );
  const configFields = fields.filter(f => !basicFields.includes(f));

  const sections: SchemaSection[] = [];

  if (basicFields.length > 0) {
    sections.push({
      id: "basic",
      title: "Basic Input",
      collapsed: false,
      fields: basicFields,
    });
  }

  if (configFields.length > 0) {
    sections.push({
      id: "options",
      title: "Options",
      collapsed: true,
      fields: configFields,
    });
  }

  return {
    version: "1.0",
    skillId,
    title,
    description,
    sections,
    outputMapping: Object.fromEntries(fields.map(f => [f.id, f.id])),
  };
}

/**
 * Convert a JSON Schema property to our field format
 */
function convertPropertyToField(key: string, prop: any, isRequired: boolean): SchemaField | null {
  const baseField = {
    id: key,
    label: prop.title || key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
    helpText: prop.description,
    required: isRequired,
    default: prop.default,
  };

  // Determine field type based on JSON Schema type and format
  if (prop.oneOf || prop.enum) {
    // Select field with options
    const options: SelectOption[] = [];

    if (prop.oneOf) {
      for (const opt of prop.oneOf) {
        options.push({
          value: opt.const || opt.value || "",
          label: opt.title || opt.const || "",
          labelTh: opt.description,
        });
      }
    } else if (prop.enum) {
      for (const val of prop.enum) {
        options.push({
          value: val,
          label: val.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
        });
      }
    }

    return {
      ...baseField,
      type: "select",
      options,
    };
  }

  switch (prop.type) {
    case "string":
      if (prop.format === "uri" || key.toLowerCase().includes("image") || key.toLowerCase().includes("url")) {
        return null; // Skip image URLs - handled separately
      }
      // Check if long text is expected
      if (prop.maxLength && prop.maxLength > 500) {
        return {
          ...baseField,
          type: "textarea",
          rows: 4,
        };
      }
      return {
        ...baseField,
        type: key.toLowerCase().includes("prompt") || key.toLowerCase().includes("request") ? "textarea" : "text",
        rows: key.toLowerCase().includes("prompt") || key.toLowerCase().includes("request") ? 3 : undefined,
      };

    case "boolean":
      return {
        ...baseField,
        type: "boolean",
      };

    case "integer":
    case "number":
      return {
        ...baseField,
        type: "number",
      };

    case "array":
      // Skip arrays for now - complex handling needed
      return null;

    case "object":
      // Skip nested objects - complex handling needed
      return null;

    default:
      return {
        ...baseField,
        type: "text",
      };
  }
}

/**
 * Substitute template variables in a prompt template
 * Replaces {variableName} with actual values from userInputs
 */
function substituteTemplateVariables(template: string, userInputs: Record<string, any>): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_match, variableName: string) => {
    const value = userInputs[variableName];
    return value !== undefined && value !== null ? String(value) : "";
  });
}

function hasUsableInputValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" && trimmed !== ".";
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true; // booleans and numbers are meaningful
}

function sanitizeUserInputs(userInputs: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(userInputs || {}).filter(([, value]) => hasUsableInputValue(value))
  );
}

function extractDefaultsFromSchema(schema: any): Record<string, any> {
  const defaults: Record<string, any> = {};
  if (!schema || typeof schema !== "object") return defaults;

  // Custom UI schema format
  if (Array.isArray(schema.sections)) {
    for (const section of schema.sections) {
      if (!Array.isArray(section?.fields)) continue;
      for (const field of section.fields) {
        if (field?.id && field.default !== undefined && hasUsableInputValue(field.default)) {
          defaults[field.id] = field.default;
        }
      }
    }
  }

  // Standard JSON schema format
  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
      if (prop?.default !== undefined && hasUsableInputValue(prop.default)) {
        defaults[key] = prop.default;
      }
    }
  }

  return defaults;
}

function loadSkillInputDefaults(skillSlug: string, folderPath?: string | null): Record<string, any> {
  const schemaPaths: string[] = [];

  if (folderPath) {
    schemaPaths.push(
      path.resolve(process.cwd(), folderPath, "schemas", "ui.schema.json"),
      path.resolve(process.cwd(), folderPath, "schemas", "input.schema.json"),
      path.resolve(process.cwd(), "..", folderPath, "schemas", "ui.schema.json"),
      path.resolve(process.cwd(), "..", folderPath, "schemas", "input.schema.json"),
    );
  }

  const slugVariants = [
    skillSlug,
    skillSlug.replace(/-/g, "_"),
    skillSlug.replace(/_/g, "-"),
  ];

  for (const slug of slugVariants) {
    schemaPaths.push(
      path.resolve(SKILLS_DIR, slug, "schemas", "ui.schema.json"),
      path.resolve(SKILLS_DIR, slug, "schemas", "input.schema.json"),
      path.resolve(process.cwd(), "..", "skills", slug, "schemas", "ui.schema.json"),
      path.resolve(process.cwd(), "..", "skills", slug, "schemas", "input.schema.json"),
      path.resolve(process.cwd(), "skills", slug, "schemas", "ui.schema.json"),
      path.resolve(process.cwd(), "skills", slug, "schemas", "input.schema.json"),
    );
  }

  for (const schemaPath of schemaPaths) {
    if (!fs.existsSync(schemaPath)) continue;
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      return extractDefaultsFromSchema(schema);
    } catch (error) {
      console.warn(`[Skills] Failed to parse schema defaults at ${schemaPath}:`, error);
    }
  }

  return {};
}

// ==================== Router ====================

export const skillsRouter = router({
  // List all available skills
  list: protectedProcedure
    .input(
      z.object({
        type: skillTypeSchema.optional(),
        enabledOnly: z.boolean().optional(),
      }).optional()
    )
    .query(({ input }) => {
      let skills = getAvailableSkills();

      if (input?.type) {
        skills = skills.filter((s) => s.type === input.type);
      }

      if (input?.enabledOnly) {
        skills = skills.filter((s) => s.enabledByDefault);
      }

      // Return simplified skill info for listing
      return skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        icon: skill.icon,
        type: skill.type,
        creditMultiplier: skill.creditMultiplier,
        enabledByDefault: skill.enabledByDefault,
        priority: skill.priority,
        hasSkillFile: !!skill.skillFilePath,
      }));
    }),

  // List skills visible to the current user (for workflow node)
  listForWorkflow: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      // Import here to avoid circular dependency
      const { getUserVisibleSkills } = await import("../services/userSkillService");
      
      const result = await getUserVisibleSkills(userId, {
        search: input?.search,
        limit: input?.limit || 50,
      });

      // Return skills in format suitable for workflow node dropdown
      return {
        skills: result.skills.map((skill) => ({
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          icon: skill.icon,
          category: skill.category,
          creditMultiplier: skill.creditMultiplier,
        })),
        total: result.total,
      };
    }),

  // Get a specific skill by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found`,
        });
      }

      // Load skill file content if available
      let skillContent: string | null = null;
      if (skill.skillFilePath) {
        skillContent = await loadSkillFile(input.id);
      }

      return {
        ...skill,
        triggers: skill.triggers.map((t) => t.pattern), // Return original pattern string
        skillContent,
      };
    }),

  // Get skill file content (for editing)
  getSkillFile: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found`,
        });
      }

      if (!skill.skillFilePath) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Skill '${input.id}' does not have an editable skill file`,
        });
      }

      const content = await loadSkillFile(input.id);

      if (!content) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill file not found for '${input.id}'`,
        });
      }

      return {
        skillId: input.id,
        filePath: skill.skillFilePath,
        content,
      };
    }),

  // Update skill file content (admin only)
  updateSkillFile: adminProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.string().min(1).max(100000),
      })
    )
    .mutation(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found`,
        });
      }

      if (!skill.skillFilePath) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Skill '${input.id}' does not have an editable skill file`,
        });
      }

      try {
        // Try to find the skill file path
        let filePath = path.resolve(process.cwd(), "..", skill.skillFilePath);
        if (!fs.existsSync(filePath)) {
          filePath = path.resolve(process.cwd(), skill.skillFilePath);
        }

        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write the updated content
        fs.writeFileSync(filePath, input.content, "utf-8");

        return {
          success: true,
          skillId: input.id,
          filePath: skill.skillFilePath,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update skill file: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Get skill input schema (for dynamic form generation)
  getInputSchema: protectedProcedure
    .input(z.object({ skillId: z.string() }))
    .query(async ({ input }) => {
      // Sync skill if contentHash changed (ensures latest skill.md is used)
      await syncSingleSkillIfChanged(input.skillId);

      // Use getSkillByIdOrType to support both slug and type lookup
      const skill = getSkillByIdOrType(input.skillId);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.skillId}' not found`,
        });
      }

      // Convert skill ID variations (hyphen to underscore)
      const skillIdVariations = [
        input.skillId,
        input.skillId.replace(/-/g, "_"), // create-image-prompt -> create_image_prompt
        input.skillId.replace(/_/g, "-"), // image_prompt_engineer -> image-prompt-engineer
      ];

      // Try to find the input schema file
      // Check multiple possible paths - ui.schema.json first (custom format), then input.schema.json
      const possiblePaths: string[] = [];

      // From skill folder path (if available) - ui.schema.json first
      if (skill.skillFilePath) {
        possiblePaths.push(
          path.resolve(process.cwd(), "..", path.dirname(skill.skillFilePath), "schemas", "ui.schema.json"),
          path.resolve(process.cwd(), path.dirname(skill.skillFilePath), "schemas", "ui.schema.json"),
          path.resolve(process.cwd(), "..", path.dirname(skill.skillFilePath), "schemas", "input.schema.json"),
          path.resolve(process.cwd(), path.dirname(skill.skillFilePath), "schemas", "input.schema.json"),
        );
      }

      // From skills directory using skill ID variations - ui.schema.json first
      for (const skillIdVariant of skillIdVariations) {
        possiblePaths.push(
          path.resolve(SKILLS_DIR, skillIdVariant, "schemas", "ui.schema.json"),
          path.resolve(process.cwd(), "..", "skills", skillIdVariant, "schemas", "ui.schema.json"),
          path.resolve(process.cwd(), "skills", skillIdVariant, "schemas", "ui.schema.json"),
          path.resolve(SKILLS_DIR, skillIdVariant, "schemas", "input.schema.json"),
          path.resolve(process.cwd(), "..", "skills", skillIdVariant, "schemas", "input.schema.json"),
          path.resolve(process.cwd(), "skills", skillIdVariant, "schemas", "input.schema.json"),
        );
      }

      // Also check skills directory for partial matches - ui.schema.json first
      try {
        const skillsDirs = [SKILLS_DIR, path.resolve(process.cwd(), "..", "skills"), path.resolve(process.cwd(), "skills")];
        for (const skillsDir of skillsDirs) {
          if (fs.existsSync(skillsDir)) {
            const folders = fs.readdirSync(skillsDir);
            for (const folder of folders) {
              possiblePaths.push(path.resolve(skillsDir, folder, "schemas", "ui.schema.json"));
            }
            for (const folder of folders) {
              possiblePaths.push(path.resolve(skillsDir, folder, "schemas", "input.schema.json"));
            }
          }
        }
      } catch (e) {
        // Ignore errors when scanning directories
      }

      for (const schemaPath of possiblePaths) {
        if (fs.existsSync(schemaPath)) {
          try {
            const content = fs.readFileSync(schemaPath, "utf-8");
            const schema = JSON.parse(content);

            // Check if schema has our custom format with sections
            // or if it's a standard JSON Schema that needs conversion
            if (schema.sections) {
              // Our custom format - use directly
              return {
                skillId: input.skillId,
                hasSchema: true,
                schema,
              };
            } else if (schema.properties) {
              // Standard JSON Schema - convert to our format
              const convertedSchema = convertJsonSchemaToSkillSchema(schema, input.skillId);
              return {
                skillId: input.skillId,
                hasSchema: true,
                schema: convertedSchema,
              };
            }
          } catch (error) {
            console.error(`[Skills] Error parsing schema for ${input.skillId}:`, error);
          }
        }
      }

      // No schema found - return hasSchema: false
      return {
        skillId: input.skillId,
        hasSchema: false,
        schema: null,
      };
    }),

  // Get prompt enhancement options (styles, VFX, features)
  getPromptOptions: protectedProcedure.query(() => {
    return getPromptOptions();
  }),

  // Get available LLM models for skill execution (Advanced Mode)
  // Returns ALL models from enabled providers - Auto Prompt works with any model
  // (vision capability is a bonus when reference images are provided)
  getVisionModels: protectedProcedure.query(async () => {
    try {
      // Get enabled LLM providers
      const providers = await db
        .select({
          providerName: llmProviders.providerName,
          displayName: llmProviders.displayName,
          defaultModel: llmProviders.defaultModel,
          availableModels: llmProviders.availableModels,
          configJson: llmProviders.configJson,
        })
        .from(llmProviders)
        .where(eq(llmProviders.isEnabled, true));

      // Build list of ALL available models
      const allModels: Array<{
        id: string;
        name: string;
        provider: string;
        providerDisplayName: string;
        isDefault?: boolean;
        supportsVision?: boolean;
      }> = [];

      // Known vision-capable model patterns (for informational purposes)
      const visionPatterns = [
        "gpt-4o", "gpt-4-vision", "gpt-4-turbo", "gpt-5",
        "claude-3", "claude-haiku", "claude-sonnet", "claude-opus",
        "gemini", "llava", "qwen-vl",
      ];

      for (const provider of providers) {
        const config = provider.configJson as { supportsVision?: boolean } | null;
        const models = provider.availableModels || [];

        // If provider has availableModels, add ALL of them
        if (models.length > 0) {
          for (const model of models) {
            const modelId = typeof model === "string" ? model : model.id;
            const modelName = typeof model === "string" ? model : model.name;

            // Check if model likely supports vision (informational only)
            const supportsVision = config?.supportsVision ||
              visionPatterns.some(pattern => modelId.toLowerCase().includes(pattern.toLowerCase()));

            // For OpenRouter format, the model.id already includes provider prefix
            // e.g., "openai/gpt-4o-mini" - don't double-prefix
            const fullModelId = modelId.includes("/") ? modelId : `${provider.providerName}/${modelId}`;

            allModels.push({
              id: fullModelId,
              name: modelName,
              provider: provider.providerName,
              providerDisplayName: provider.displayName,
              isDefault: modelId === provider.defaultModel || fullModelId === provider.defaultModel,
              supportsVision,
            });
          }
        } else if (provider.defaultModel) {
          // If no availableModels but has defaultModel, add it
          const fullModelId = provider.defaultModel.includes("/")
            ? provider.defaultModel
            : `${provider.providerName}/${provider.defaultModel}`;

          allModels.push({
            id: fullModelId,
            name: provider.defaultModel,
            provider: provider.providerName,
            providerDisplayName: provider.displayName,
            isDefault: true,
            supportsVision: visionPatterns.some(pattern =>
              provider.defaultModel?.toLowerCase().includes(pattern.toLowerCase())
            ),
          });
        }
      }

      // If no models found, add common defaults
      if (allModels.length === 0) {
        allModels.push(
          { id: "openai/gpt-4o", name: "GPT-4o", provider: "openai", providerDisplayName: "OpenAI", isDefault: true, supportsVision: true },
          { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", providerDisplayName: "OpenAI", supportsVision: true },
          { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic", providerDisplayName: "Anthropic", supportsVision: true },
        );
      }

      console.log(`[Skills] Returning ${allModels.length} models for skill selection`);
      return { models: allModels };
    } catch (error) {
      console.error("[Skills] Error fetching models:", error);
      // Return fallback models on error
      return {
        models: [
          { id: "openai/gpt-4o", name: "GPT-4o", provider: "openai", providerDisplayName: "OpenAI", isDefault: true, supportsVision: true },
          { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", providerDisplayName: "OpenAI", supportsVision: true },
        ],
      };
    }
  }),

  // Get skill's default model configuration
  getSkillConfig: protectedProcedure
    .input(z.object({ skillId: z.string() }))
    .query(async ({ input }) => {
      // Sync skill if contentHash changed
      await syncSingleSkillIfChanged(input.skillId);

      try {
        const [skill] = await db
          .select({
            id: skills.id,
            slug: skills.slug,
            name: skills.name,
            defaultModel: skills.defaultModel,
            availableModels: skills.availableModels,
          })
          .from(skills)
          .where(eq(skills.slug, input.skillId))
          .limit(1);

        if (!skill) {
          return { defaultModel: "openai/gpt-4o", availableModels: null };
        }

        return {
          defaultModel: skill.defaultModel || "openai/gpt-4o",
          availableModels: skill.availableModels,
        };
      } catch (error) {
        console.error("[Skills] Error fetching skill config:", error);
        return { defaultModel: "openai/gpt-4o", availableModels: null };
      }
    }),

  // Get style categories
  getStyleCategories: protectedProcedure.query(() => {
    return getStyleCategories();
  }),

  // Get VFX categories
  getVFXCategories: protectedProcedure.query(() => {
    return getVFXCategories();
  }),

  // Build prompt using CreateImagePrompt skill (returns system prompt for LLM)
  buildPrompt: protectedProcedure
    .input(promptEnhancementRequestSchema)
    .mutation(({ input }) => {
      try {
        const systemPrompt = buildSystemPrompt(input);
        const userPrompt = buildUserPrompt(input);

        return {
          success: true,
          systemPrompt,
          userPrompt,
          skillId: "create-image-prompt",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to build prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Enhance prompt using CreateImagePrompt skill with LLM
   * This procedure:
   * 1. Builds the system and user prompts
   * 2. Calls the LLM (with vision for reference images)
   * 3. Parses the response and returns the enhanced prompt
   */
  enhancePrompt: protectedProcedure
    .input(promptEnhancementRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      // Check if user has enough credits
      const hasCredits = await hasEnoughCredits(userId, 1);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient credits",
        });
      }

      try {
        // DEBUG: Log maxPromptLength to verify it's being passed
        console.log(`[Skills] enhancePrompt called with maxPromptLength: ${input.maxPromptLength}`);

        // Build prompts using the CreateImagePrompt skill
        const systemPrompt = buildSystemPrompt(input);

        // Build user prompt with image context
        let userPrompt = input.userInput;

        // If only images without text, describe the task
        if (!input.userInput.trim() && input.referenceImages && input.referenceImages.length > 0) {
          userPrompt = `Please analyze the provided reference image(s) and create a detailed prompt that describes what you see. The prompt should be suitable for AI image generation that recreates or reimagines the scene/subject.`;
        } else if (input.referenceImages && input.referenceImages.length > 0) {
          userPrompt = `User's idea: "${input.userInput}"\n\nPlease analyze the provided reference image(s) and incorporate what you see into an enhanced prompt that combines the user's idea with visual elements from the images.`;
        }

        // Add context about images count
        if (input.referenceImages && input.referenceImages.length > 0) {
          userPrompt += `\n\n[${input.referenceImages.length} reference image(s) provided - analyze them for visual details]`;
        }

        // Call LLM with vision support
        // Use user-selected model or default to openai/gpt-4o for vision capability
        const visionModel = input.model || "openai/gpt-4o";

        // Calculate max_tokens based on prompt_count and maxPromptLength
        // If maxPromptLength is provided (from model config), use it to constrain output
        // Otherwise use default of 5000 characters
        const promptCount = input.prompt_count || 1;
        const maxCharLength = input.maxPromptLength || 5000;

        // Convert character limit to approximate token limit (1 token ≈ 3-4 chars)
        // For single prompt: full character budget
        // For multiple prompts: divide budget per prompt with some overhead
        const charsPerToken = 3.5;
        // Use proportional overhead (10%) instead of fixed, with min 50 chars
        const overheadChars = Math.max(50, Math.ceil(maxCharLength * 0.1));
        const effectiveMaxChars = maxCharLength - overheadChars;
        // Set minimum 800 tokens - reasoning models (like GPT-5.2) use tokens for encrypted thinking before output
        // With 300 tokens, all were consumed by reasoning with nothing left for content output
        const calculatedMaxTokens = Math.max(
          800, // Minimum tokens - reasoning models need ~500+ just for thinking overhead
          Math.min(
            Math.ceil(effectiveMaxChars / charsPerToken),
            2000 // Hard cap at 2000 tokens
          )
        );

        const result = await callLLMWithVision(
          systemPrompt,
          userPrompt,
          input.referenceImages || [],
          visionModel,
          calculatedMaxTokens
        );

        // Check if LLM refused the request (safety filter)
        const refusalPatterns = [
          /I'm sorry/i,
          /I cannot/i,
          /I can't/i,
          /I am not able to/i,
          /I won't be able to/i,
          /I apologize/i,
          /against my guidelines/i,
          /inappropriate/i,
          /not appropriate/i,
        ];

        const isRefusal = refusalPatterns.some(pattern => pattern.test(result.content));

        if (isRefusal) {
          console.warn("[Skills] LLM refused prompt enhancement:", result.content.substring(0, 200));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unable to generate prompt. Please try with different text or images.",
          });
        }

        // Parse the response to extract prompts
        const parsed = parsePromptResponse(result.content);

        // HARD LIMIT ENFORCEMENT: Truncate prompt if it exceeds maxPromptLength
        // LLMs don't always follow character limit instructions strictly,
        // so we enforce the limit server-side as a safety net
        let finalPromptEn = parsed.promptEn;
        let finalPromptTh = parsed.promptTh;
        let wasTruncated = false;

        if (input.maxPromptLength && finalPromptEn.length > input.maxPromptLength) {
          console.warn(
            `[Skills] Prompt exceeded limit: ${finalPromptEn.length}/${input.maxPromptLength} chars - truncating`
          );

          // Smart truncation: try to cut at sentence boundary if possible
          const targetLength = input.maxPromptLength - 3; // Leave room for "..."
          let truncatedPrompt = finalPromptEn.substring(0, targetLength);

          // Find the last sentence boundary (., !, ?) within the truncated portion
          const lastSentenceEnd = Math.max(
            truncatedPrompt.lastIndexOf(". "),
            truncatedPrompt.lastIndexOf("! "),
            truncatedPrompt.lastIndexOf("? "),
            truncatedPrompt.lastIndexOf(".\n"),
            truncatedPrompt.lastIndexOf("!\n"),
            truncatedPrompt.lastIndexOf("?\n")
          );

          // If we found a sentence boundary in the last 20% of the truncated text, use it
          const minSentencePosition = targetLength * 0.8;
          if (lastSentenceEnd > minSentencePosition) {
            truncatedPrompt = finalPromptEn.substring(0, lastSentenceEnd + 1);
          } else {
            // Otherwise, just add ellipsis
            truncatedPrompt = truncatedPrompt.trimEnd() + "...";
          }

          finalPromptEn = truncatedPrompt;
          wasTruncated = true;
          console.log(`[Skills] Truncated prompt to ${finalPromptEn.length} chars`);
        }

        // Also truncate Thai prompt if provided
        if (input.maxPromptLength && finalPromptTh && finalPromptTh.length > input.maxPromptLength) {
          const targetLength = input.maxPromptLength - 3;
          finalPromptTh = finalPromptTh.substring(0, targetLength).trimEnd() + "...";
        }

        // Calculate and deduct credits based on the model used
        const creditsUsed = calculateCreditsForLLM(
          result.usage.promptTokens,
          result.usage.completionTokens,
          visionModel
        );

        await deductCredits({
          userId,
          amount: creditsUsed,
          description: "Auto Prompt enhancement (CreateImagePrompt skill)",
          metadata: {
            model: visionModel,
            skill: "create-image-prompt",
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            hasReferenceImages: (input.referenceImages?.length || 0) > 0,
            referenceImageCount: input.referenceImages?.length || 0,
          },
        });

        return {
          success: true,
          promptEn: finalPromptEn,
          promptTh: finalPromptTh,
          wasTruncated,
          creditsUsed,
          usage: result.usage,
          skillId: "create-image-prompt",
        };
      } catch (error) {
        console.error("[Skills] enhancePrompt error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to enhance prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Parse LLM response to extract prompts
  parsePromptResponse: protectedProcedure
    .input(
      z.object({
        response: z.string().min(1),
      })
    )
    .mutation(({ input }) => {
      const result = parsePromptResponse(input.response);
      return {
        success: true,
        ...result,
      };
    }),

  /**
   * Execute a custom skill with LLM using skill's content as system prompt
   * This is for skills that need their skill.md content to guide the LLM
   * (not for media-generation skills which are auto-executed)
   */
  executeCustomSkill: protectedProcedure
    .input(
      z.object({
        skillId: z.string().min(1),
        userInputs: z.record(z.any()), // Dynamic form values
        model: z.string().optional(),
        referenceImages: z.array(z.string()).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      // Check credits
      const hasCredits = await hasEnoughCredits(userId, 1);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient credits",
        });
      }

      // Sync skill if contentHash changed (ensures latest skill.md is used)
      const syncResult = await syncSingleSkillIfChanged(input.skillId);
      if (syncResult.synced) {
        console.log(`[Skills] Skill '${input.skillId}' was auto-synced before execution`);
      } else {
        console.log(`[Skills] Skill '${input.skillId}' already up-to-date, no sync needed`);
      }

      // Get skill from database
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [skill] = await dbInstance
        .select({
          id: skills.id,
          slug: skills.slug,
          name: skills.name,
          skillContent: skills.skillContent,
          systemPrompt: skills.systemPrompt,
          folderPath: skills.folderPath,
        })
        .from(skills)
        .where(eq(skills.slug, input.skillId))
        .limit(1);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.skillId}' not found`,
        });
      }

      // Try to load prompt template from prompts/ directory first
      let systemPrompt = skill.skillContent || skill.systemPrompt;

      if (skill.folderPath) {
        // Check for prompt template files in prompts/ directory
        const possiblePromptPaths = [
          path.resolve(process.cwd(), skill.folderPath, 'prompts', 'storyboard.prompt.md'),
          path.resolve(process.cwd(), skill.folderPath, 'prompts', 'prompt.md'),
          path.resolve(process.cwd(), skill.folderPath, 'prompts', `${skill.slug}.prompt.md`),
        ];

        for (const promptPath of possiblePromptPaths) {
          if (fs.existsSync(promptPath)) {
            try {
              systemPrompt = fs.readFileSync(promptPath, 'utf-8');
              console.log(`[Skills] Loaded prompt template from: ${promptPath}`);
              break;
            } catch (error) {
              console.warn(`[Skills] Failed to read prompt template at ${promptPath}:`, error);
            }
          }
        }
      }

      if (!systemPrompt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Skill '${input.skillId}' has no content to execute`,
        });
      }

      // Merge user inputs with schema defaults, and drop null/empty placeholders
      const sanitizedUserInputs = sanitizeUserInputs(input.userInputs);
      const schemaDefaults = loadSkillInputDefaults(skill.slug, skill.folderPath);
      const mergedUserInputs = {
        ...schemaDefaults,
        ...sanitizedUserInputs,
      };

      // Substitute template variables with actual values
      systemPrompt = substituteTemplateVariables(systemPrompt, mergedUserInputs);

      // Build user prompt - simpler now since template variables are already substituted
      let userPrompt = "Please execute the skill based on the inputs provided in the system prompt template and generate the output as specified.";

      try {
        const visionModel = input.model || "openai/gpt-4o";

        // Call LLM with substituted system prompt
        const result = await callLLMWithVision(
          systemPrompt,
          userPrompt,
          input.referenceImages || [],
          visionModel,
          4000 // Higher token limit for complex outputs
        );


        // Calculate and deduct credits
        const creditsUsed = calculateCreditsForLLM(
          result.usage.promptTokens,
          result.usage.completionTokens,
          visionModel
        );

        await deductCredits({
          userId,
          amount: creditsUsed,
          description: `Skill execution: ${skill.name}`,
          metadata: {
            model: visionModel,
            skill: input.skillId,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
          },
        });

        return {
          success: true,
          content: result.content,
          skillId: input.skillId,
          skillName: skill.name,
          creditsUsed,
          usage: result.usage,
        };
      } catch (error) {
        console.error("[Skills] executeCustomSkill error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to execute skill: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // List editable skills (skills with skill files)
  listEditable: adminProcedure.query(() => {
    const skills = getAvailableSkills();
    const editableSkills = skills.filter((s) => s.skillFilePath);

    return editableSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      type: skill.type,
      skillFilePath: skill.skillFilePath,
    }));
  }),

  // Get skill reference files (for skills with references directory)
  getSkillReferences: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill || !skill.skillFilePath) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found or has no skill file`,
        });
      }

      // Get references directory
      const skillDir = path.dirname(skill.skillFilePath);
      const refsDir = path.join(skillDir, "references");

      try {
        // Try both possible paths
        let fullRefsDir = path.resolve(process.cwd(), "..", refsDir);
        if (!fs.existsSync(fullRefsDir)) {
          fullRefsDir = path.resolve(process.cwd(), refsDir);
        }

        if (!fs.existsSync(fullRefsDir)) {
          return { references: [] };
        }

        const files = fs.readdirSync(fullRefsDir);
        const references = files
          .filter((f) => f.endsWith(".md"))
          .map((f) => ({
            name: f.replace(".md", ""),
            fileName: f,
            path: path.join(refsDir, f),
          }));

        return { references };
      } catch (error) {
        return { references: [] };
      }
    }),

  // Get skill reference file content
  getSkillReferenceFile: adminProcedure
    .input(
      z.object({
        id: z.string(),
        fileName: z.string(),
      })
    )
    .query(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill || !skill.skillFilePath) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found or has no skill file`,
        });
      }

      // Validate filename to prevent path traversal
      if (input.fileName.includes("..") || input.fileName.includes("/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file name",
        });
      }

      const skillDir = path.dirname(skill.skillFilePath);
      const refPath = path.join(skillDir, "references", input.fileName);

      try {
        // Try both possible paths
        let fullPath = path.resolve(process.cwd(), "..", refPath);
        if (!fs.existsSync(fullPath)) {
          fullPath = path.resolve(process.cwd(), refPath);
        }

        if (!fs.existsSync(fullPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Reference file '${input.fileName}' not found`,
          });
        }

        const content = fs.readFileSync(fullPath, "utf-8");

        return {
          fileName: input.fileName,
          content,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to read reference file: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Update skill reference file content
  updateSkillReferenceFile: adminProcedure
    .input(
      z.object({
        id: z.string(),
        fileName: z.string(),
        content: z.string().min(1).max(100000),
      })
    )
    .mutation(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill || !skill.skillFilePath) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found or has no skill file`,
        });
      }

      // Validate filename to prevent path traversal
      if (input.fileName.includes("..") || input.fileName.includes("/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file name",
        });
      }

      const skillDir = path.dirname(skill.skillFilePath);
      const refPath = path.join(skillDir, "references", input.fileName);

      try {
        // Try both possible paths
        let fullPath = path.resolve(process.cwd(), "..", refPath);
        if (!fs.existsSync(path.dirname(fullPath))) {
          fullPath = path.resolve(process.cwd(), refPath);
        }

        // Create directory if it doesn't exist
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, input.content, "utf-8");

        return {
          success: true,
          fileName: input.fileName,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update reference file: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // ==================== Database-based Skill Management ====================

  /**
   * List all skills from database (unified source)
   */
  listFromDb: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        enabledOnly: z.boolean().optional(),
        autoTriggerOnly: z.boolean().optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [];

      if (input?.category) {
        conditions.push(eq(skills.category, input.category as any));
      }

      if (input?.enabledOnly) {
        conditions.push(eq(skills.isEnabled, true));
      }

      if (input?.autoTriggerOnly) {
        conditions.push(eq(skills.isAutoTrigger, true));
      }

      if (input?.search) {
        conditions.push(
          or(
            like(skills.name, `%${input.search}%`),
            like(skills.description, `%${input.search}%`),
          )
        );
      }

      let query = dbInstance.select().from(skills);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      query = query.orderBy(desc(skills.priority), asc(skills.name)) as typeof query;

      if (input?.limit) {
        query = query.limit(input.limit) as typeof query;
      }

      if (input?.offset) {
        query = query.offset(input.offset) as typeof query;
      }

      const result = await query;

      return result.map((skill) => ({
        ...skill,
        creditMultiplier: Number(skill.creditMultiplier) || 1,
        tags: skill.tags || [],
        triggerPatterns: skill.triggerPatterns || [],
      }));
    }),

  /**
   * Get skill by slug from database
   */
  getFromDb: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [skill] = await dbInstance
        .select()
        .from(skills)
        .where(eq(skills.slug, input.slug))
        .limit(1);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.slug}' not found`,
        });
      }

      return {
        ...skill,
        creditMultiplier: Number(skill.creditMultiplier) || 1,
        tags: skill.tags || [],
        triggerPatterns: skill.triggerPatterns || [],
      };
    }),

  /**
   * Create a new skill (admin only)
   */
  create: adminProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        category: z.string().default("other"),
        version: z.string().optional(),
        author: z.string().optional(),
        icon: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isAutoTrigger: z.boolean().optional(),
        triggerPatterns: z.array(z.string()).optional(),
        isEnabled: z.boolean().optional(),
        enabledByDefault: z.boolean().optional(),
        visibleByDefault: z.boolean().optional(),
        creditMultiplier: z.number().min(0).max(100).optional(),
        priority: z.number().min(0).max(100).optional(),
        systemPrompt: z.string().optional(),
        skillContent: z.string().optional(),
        marketplaceContent: z.string().optional(),
        knowledgebase: z.string().optional(),
        configJson: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if slug already exists
      const [existing] = await dbInstance
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.slug, input.slug))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Skill with slug '${input.slug}' already exists`,
        });
      }

      const [newSkill] = await dbInstance
        .insert(skills)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description,
          category: mapCategoryToEnum(input.category) as any,
          version: input.version || "1.0.0",
          author: input.author,
          icon: input.icon || "sparkles",
          tags: input.tags || [],
          isAutoTrigger: input.isAutoTrigger ?? false,
          triggerPatterns: input.triggerPatterns || [],
          isEnabled: input.isEnabled ?? true,
          enabledByDefault: input.enabledByDefault ?? true,
          visibleByDefault: input.visibleByDefault ?? true,
          creditMultiplier: String(input.creditMultiplier ?? 1.0),
          priority: input.priority ?? 50,
          systemPrompt: input.systemPrompt,
          skillContent: input.skillContent,
          marketplaceContent: input.marketplaceContent || generateMarketplaceContent(input.skillContent || "", { name: input.name, description: input.description }),
          knowledgebase: input.knowledgebase,
          configJson: input.configJson,
          importSource: "manual",
          createdBy: ctx.user?.id,
        })
        .returning();

      // Refresh skill cache
      await refreshSkillCache();

      return newSkill;
    }),

  /**
   * Update an existing skill (admin only)
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        version: z.string().optional(),
        author: z.string().optional(),
        icon: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isAutoTrigger: z.boolean().optional(),
        triggerPatterns: z.array(z.string()).optional(),
        isEnabled: z.boolean().optional(),
        enabledByDefault: z.boolean().optional(),
        visibleByDefault: z.boolean().optional(),
        creditMultiplier: z.number().min(0).max(100).optional(),
        priority: z.number().min(0).max(100).optional(),
        defaultModel: z.string().nullable().optional(),
        executionMode: z.enum(["llm-only", "media-generate", "enhance-prompt", "python"]).optional(),
        systemPrompt: z.string().nullable().optional(),
        skillContent: z.string().nullable().optional(),
        marketplaceContent: z.string().nullable().optional(),
        knowledgebase: z.string().nullable().optional(),
        configJson: z.record(z.any()).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { id, ...updateData } = input;

      // Build update object
      const updateObj: Record<string, any> = { updatedAt: new Date() };

      if (updateData.name !== undefined) updateObj.name = updateData.name;
      if (updateData.description !== undefined) updateObj.description = updateData.description;
      if (updateData.category !== undefined) updateObj.category = mapCategoryToEnum(updateData.category);
      if (updateData.version !== undefined) updateObj.version = updateData.version;
      if (updateData.author !== undefined) updateObj.author = updateData.author;
      if (updateData.icon !== undefined) updateObj.icon = updateData.icon;
      if (updateData.tags !== undefined) updateObj.tags = updateData.tags;
      if (updateData.isAutoTrigger !== undefined) updateObj.isAutoTrigger = updateData.isAutoTrigger;
      if (updateData.triggerPatterns !== undefined) updateObj.triggerPatterns = updateData.triggerPatterns;
      if (updateData.isEnabled !== undefined) updateObj.isEnabled = updateData.isEnabled;
      if (updateData.enabledByDefault !== undefined) updateObj.enabledByDefault = updateData.enabledByDefault;
      if (updateData.visibleByDefault !== undefined) updateObj.visibleByDefault = updateData.visibleByDefault;
      if (updateData.creditMultiplier !== undefined) updateObj.creditMultiplier = String(updateData.creditMultiplier);
      if (updateData.priority !== undefined) updateObj.priority = updateData.priority;
      if (updateData.defaultModel !== undefined) updateObj.defaultModel = updateData.defaultModel;
      if (updateData.executionMode !== undefined) updateObj.executionMode = updateData.executionMode;
      if (updateData.systemPrompt !== undefined) updateObj.systemPrompt = updateData.systemPrompt;
      if (updateData.skillContent !== undefined) updateObj.skillContent = updateData.skillContent;
      if (updateData.marketplaceContent !== undefined) updateObj.marketplaceContent = updateData.marketplaceContent;
      if (updateData.knowledgebase !== undefined) updateObj.knowledgebase = updateData.knowledgebase;
      if (updateData.configJson !== undefined) updateObj.configJson = updateData.configJson;

      const [updated] = await dbInstance
        .update(skills)
        .set(updateObj)
        .where(eq(skills.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill with id ${id} not found`,
        });
      }

      // Refresh skill cache
      await refreshSkillCache();

      return updated;
    }),

  /**
   * Delete a skill (admin only)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get skill slug before deleting (to clean up folder)
      const [skill] = await dbInstance
        .select({ slug: skills.slug })
        .from(skills)
        .where(eq(skills.id, input.id))
        .limit(1);

      await dbInstance.delete(skills).where(eq(skills.id, input.id));

      // Delete skill folder to prevent auto-sync re-import
      if (skill?.slug) {
        const fs = await import("fs");
        const path = await import("path");
        const skillDir = path.resolve(process.cwd(), "skills", skill.slug);
        if (fs.existsSync(skillDir)) {
          fs.rmSync(skillDir, { recursive: true, force: true });
        }
      }

      // Refresh skill cache
      await refreshSkillCache();

      return { success: true };
    }),

  /**
   * Regenerate marketplace content from skillContent (admin only)
   */
  regenerateMarketplaceContent: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [skill] = await dbInstance
        .select({ id: skills.id, name: skills.name, description: skills.description, skillContent: skills.skillContent })
        .from(skills)
        .where(eq(skills.id, input.id))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.id} not found` });
      }

      const marketplaceContent = generateMarketplaceContent(
        skill.skillContent || "",
        { name: skill.name, description: skill.description || undefined }
      );

      await dbInstance
        .update(skills)
        .set({ marketplaceContent, updatedAt: new Date() })
        .where(eq(skills.id, input.id));

      return { success: true, marketplaceContent };
    }),

  /**
   * Scan skills directory for new skill folders (admin only)
   */
  scanFolders: adminProcedure.query(async () => {
    const folders: Array<{
      slug: string;
      hasSkillMd: boolean;
      hasPython: boolean;
      hasJs: boolean;
      metadata?: SkillMetadata;
      existsInDb: boolean;
    }> = [];

    if (!fs.existsSync(SKILLS_DIR)) {
      return folders;
    }

    const dbInstance = await getDb();
    const existingSlugs = dbInstance
      ? (await dbInstance.select({ slug: skills.slug }).from(skills)).map((s) => s.slug)
      : [];

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const slug = entry.name;
      const skillDir = path.join(SKILLS_DIR, slug);
      const skillMdPath = path.join(skillDir, "skill.md");
      const pythonDir = path.join(skillDir, "python");
      const jsDir = path.join(skillDir, "js");

      const hasSkillMd = fs.existsSync(skillMdPath);
      const hasPython = fs.existsSync(pythonDir);
      const hasJs = fs.existsSync(jsDir);

      let metadata: SkillMetadata | undefined;
      if (hasSkillMd) {
        const content = fs.readFileSync(skillMdPath, "utf-8");
        const parsed = parseSkillFile(content);
        metadata = parsed.metadata;
      }

      folders.push({
        slug,
        hasSkillMd,
        hasPython,
        hasJs,
        metadata,
        existsInDb: existingSlugs.includes(slug),
      });
    }

    return folders;
  }),

  /**
   * Import skill from folder (admin only)
   */
  importFolder: adminProcedure
    .input(z.object({ slug: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/) }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const skillDir = path.join(SKILLS_DIR, input.slug);
      const skillMdPath = [
        path.join(skillDir, "skill.md"),
        path.join(skillDir, "SKILL.md"),
      ].find(p => fs.existsSync(p)) || path.join(skillDir, "skill.md");

      if (!fs.existsSync(skillDir)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill folder '${input.slug}' not found`,
        });
      }

      // Check if already exists
      const [existing] = await dbInstance
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.slug, input.slug))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Skill '${input.slug}' already exists in database`,
        });
      }

      // Read skill.md
      let metadata: SkillMetadata = { name: input.slug };
      let skillContent = "";

      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, "utf-8");
        const parsed = parseSkillFile(content);
        metadata = { ...metadata, ...parsed.metadata };
        skillContent = parsed.content;
      }

      // Insert into database
      const [newSkill] = await dbInstance
        .insert(skills)
        .values({
          slug: input.slug,
          name: metadata.name || input.slug,
          description: metadata.description,
          category: mapCategoryToEnum(metadata.category) as any,
          version: metadata.version || "1.0.0",
          author: metadata.author,
          icon: metadata.icon || "sparkles",
          tags: metadata.tags || [],
          folderPath: `skills/${input.slug}`,
          isAutoTrigger: metadata.auto_trigger ?? false,
          triggerPatterns: metadata.trigger_patterns || [],
          isEnabled: true,
          enabledByDefault: metadata.enabled_by_default ?? false,
          creditMultiplier: String(metadata.credit_multiplier ?? 1.0),
          priority: metadata.priority ?? 50,
          systemPrompt: skillContent || undefined,
          skillContent,
          marketplaceContent: generateMarketplaceContent(skillContent, { name: metadata.name || input.slug, description: metadata.description }),
          configJson: metadata.config,
          visibleByDefault: false,
          importSource: "folder",
          createdBy: ctx.user?.id,
        })
        .returning();

      // Refresh skill cache
      await refreshSkillCache();

      return newSkill;
    }),

  /**
   * Import skill from ZIP file (admin only)
   * Supports both:
   * 1. Claude/OpenCode skills format (has skill.md)
   * 2. SystemPrompt+KnowledgeBase format (Custom GPT)
   */
  importZip: adminProcedure
    .input(
      z.object({
        fileName: z.string(),
        base64Content: z.string(),
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if slug already exists
      const [existing] = await dbInstance
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.slug, input.slug))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Skill with slug '${input.slug}' already exists`,
        });
      }

      // Decode ZIP
      const zipBuffer = Buffer.from(input.base64Content, "base64");
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();

      // Detect format by checking for skill.md
      let skillMdEntry: AdmZip.IZipEntry | null = null;
      let skillMdPath = "";
      let hasPythonDir = false;
      let hasJsDir = false;

      for (const entry of entries) {
        const name = entry.entryName.toLowerCase();
        if (name.endsWith("skill.md") || name.endsWith("skill.yaml") || name.endsWith("skill.yml")) {
          skillMdEntry = entry;
          skillMdPath = entry.entryName;
        }
        if (name.includes("/python/") || name.startsWith("python/")) {
          hasPythonDir = true;
        }
        if (name.includes("/js/") || name.startsWith("js/")) {
          hasJsDir = true;
        }
      }

      const isClaudeFormat = skillMdEntry !== null;
      let metadata: SkillMetadata = { name: input.slug };
      let skillContent = "";
      let systemPrompt = "";
      let knowledgebase = "";
      const knowledgeFiles: string[] = [];
      let importFormat: "claude" | "custom-gpt" = "custom-gpt";

      if (isClaudeFormat && skillMdEntry) {
        // Claude/OpenCode skills format
        importFormat = "claude";
        const skillMdContent = skillMdEntry.getData().toString("utf-8");
        const parsed = parseSkillFile(skillMdContent);
        metadata = { ...metadata, ...parsed.metadata };
        skillContent = skillMdContent;
        // Body of skill.md IS the system prompt for Claude-format skills
        if (parsed.content) {
          systemPrompt = parsed.content;
        }

        // Extract knowledgebase from other text files
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const name = entry.entryName.toLowerCase();
          if (name === skillMdPath.toLowerCase()) continue;
          if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".json")) {
            // Skip python/js files
            if (!name.includes("/python/") && !name.includes("/js/")) {
              knowledgeFiles.push(entry.entryName);
              knowledgebase += `--- ${entry.entryName} ---\n`;
              knowledgebase += entry.getData().toString("utf-8") + "\n\n";
            }
          }
        }
      } else {
        // SystemPrompt+KnowledgeBase format (Custom GPT)
        importFormat = "custom-gpt";

        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const name = entry.entryName.toLowerCase();

          if (name.includes("system") || name.includes("prompt") || name.includes("instructions")) {
            if (name.endsWith(".txt") || name.endsWith(".md")) {
              systemPrompt += entry.getData().toString("utf-8") + "\n\n";
            }
          } else if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".json")) {
            knowledgeFiles.push(entry.entryName);
            knowledgebase += `--- ${entry.entryName} ---\n`;
            knowledgebase += entry.getData().toString("utf-8") + "\n\n";
          }
        }

        // Create skill.md content from system prompt
        skillContent = `---
name: ${input.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
version: 1.0.0
description: Imported from Custom GPT (${input.fileName})
category: other
icon: bot
auto_trigger: false
enabled_by_default: true
---

# ${input.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}

## System Prompt

${systemPrompt || "(No system prompt found in ZIP)"}

## Knowledgebase Files

${knowledgeFiles.map((f) => `- ${f}`).join("\n") || "(No knowledge files found)"}
`;
      }

      // Create skill folder
      const skillDir = path.join(SKILLS_DIR, input.slug);
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
      }

      // Write skill.md if not claude format (claude format already has it in zip)
      if (!isClaudeFormat) {
        fs.writeFileSync(path.join(skillDir, "skill.md"), skillContent);
      }

      // Extract the ZIP to the skill folder
      if (isClaudeFormat) {
        // For Claude format, extract to root of skill folder
        zip.extractAllTo(skillDir, true);
      } else {
        // For Custom GPT format, extract to imported subfolder
        zip.extractAllTo(path.join(skillDir, "imported"), true);
        fs.writeFileSync(path.join(skillDir, "skill.md"), skillContent);
      }

      // Determine values based on format
      const skillName = metadata.name || input.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const skillDescription = metadata.description || (isClaudeFormat
        ? `Imported from Claude/OpenCode skill (${input.fileName})`
        : `Imported from Custom GPT (${input.fileName})`);
      const skillCategory = mapCategoryToEnum(metadata.category) as any || "other";
      const skillIcon = metadata.icon || (isClaudeFormat ? "sparkles" : "bot");
      const skillTags = metadata.tags || (isClaudeFormat ? ["claude", "imported"] : ["custom-gpt", "imported"]);

      // Insert into database
      const [newSkill] = await dbInstance
        .insert(skills)
        .values({
          slug: input.slug,
          name: skillName,
          description: skillDescription,
          category: skillCategory,
          version: metadata.version || "1.0.0",
          author: metadata.author,
          icon: skillIcon,
          tags: skillTags,
          folderPath: `skills/${input.slug}`,
          isAutoTrigger: metadata.auto_trigger ?? false,
          triggerPatterns: metadata.trigger_patterns || [],
          isEnabled: true,
          enabledByDefault: metadata.enabled_by_default ?? false,
          creditMultiplier: String(metadata.credit_multiplier ?? 1.0),
          priority: metadata.priority ?? 50,
          systemPrompt: systemPrompt || undefined,
          skillContent,
          marketplaceContent: generateMarketplaceContent(skillContent, { name: skillName, description: skillDescription }),
          knowledgebase: knowledgebase || undefined,
          configJson: metadata.config,
          visibleByDefault: false,
          importSource: "zip",
          importedFromZip: input.fileName,
          createdBy: ctx.user?.id,
        })
        .returning();

      // Refresh skill cache
      await refreshSkillCache();

      return {
        ...newSkill,
        importFormat,
        knowledgeFilesCount: knowledgeFiles.length,
        hasSystemPrompt: !!systemPrompt,
        hasPython: hasPythonDir,
        hasJs: hasJsDir,
      };
    }),

  /**
   * Get skill categories for filtering
   */
  getCategories: protectedProcedure.query(async () => {
    const dbInstance = await getDb();
    if (!dbInstance) return [];

    const result = await dbInstance
      .select({
        category: skills.category,
        count: sql<number>`COUNT(*)`,
      })
      .from(skills)
      .where(eq(skills.isEnabled, true))
      .groupBy(skills.category);

    return result.map((r) => ({
      id: r.category,
      name: r.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      count: Number(r.count),
    }));
  }),

  // ── User Skill Visibility ──────────────────────────────────────

  /**
   * Get user's visible skills (paginated, for chat panel)
   */
  getUserVisibleSkills: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      return _getUserVisibleSkills(ctx.user.id, input ?? {});
    }),

  /**
   * Browse ALL skills with visibility flag (for settings page)
   */
  browseAllSkills: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      return getAllSkillsForUser(ctx.user.id, input ?? {});
    }),

  /**
   * Toggle skill visibility for current user
   */
  toggleSkillVisibility: protectedProcedure
    .input(z.object({
      skillId: z.number(),
      visible: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await setSkillVisibility(ctx.user.id, input.skillId, input.visible);
      return { success: true };
    }),

  /**
   * Batch toggle visibility
   */
  batchToggleVisibility: protectedProcedure
    .input(z.object({
      updates: z.array(z.object({
        skillId: z.number(),
        visible: z.boolean(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await batchSetVisibility(ctx.user.id, input.updates);
      return { success: true };
    }),

  /**
   * List ISC (Intelligence Skill Creator) proposals pending admin review.
   * Proposals are unified diffs saved in:
   *   apps/web/skills/intelligence-skill-creator/runs/proposals/<skill_name>/*.diff
   */
  listIscProposals: adminProcedure
    .query(async () => {
      const fsp = await import("fs/promises");
      const pathLib = await import("path");

      const proposalsRoot = pathLib.default.resolve(
        process.cwd(),
        "skills",
        "intelligence-skill-creator",
        "runs",
        "proposals"
      );

      let skillDirs: string[] = [];
      try {
        skillDirs = await fsp.default.readdir(proposalsRoot);
      } catch {
        return { proposals: [] };
      }

      const proposals: Array<{
        skillName: string;
        diffFile: string;
        diffRelPath: string;
        createdAt: string;
        round: number;
      }> = [];

      for (const skillName of skillDirs) {
        const skillDir = pathLib.default.join(proposalsRoot, skillName);
        const stat = await fsp.default.stat(skillDir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        const files = (await fsp.default.readdir(skillDir)).filter((f) => f.endsWith(".diff"));
        for (const file of files) {
          // filename: 20260217T123000_r1.diff → parse timestamp + round
          const m = file.match(/^(\d{8}T?\d{6})_r(\d+)\.diff$/);
          proposals.push({
            skillName,
            diffFile: file,
            diffRelPath: pathLib.default.join("skills", "intelligence-skill-creator", "runs", "proposals", skillName, file),
            createdAt: m ? m[1] : file,
            round: m ? parseInt(m[2], 10) : 0,
          });
        }
      }

      return { proposals: proposals.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    }),

  /**
   * Apply an ISC proposal diff to the skill files (admin only).
   * Runs: patch -N -r - -p0 < <diff_file>
   * Working directory: apps/web/skills/intelligence-skill-creator/
   */
  applyIscProposal: adminProcedure
    .input(z.object({
      skillName: z.string().min(1).max(100).regex(/^[\w-]+$/),
      diffFile: z.string().min(1).max(200).regex(/^[\w.\-]+\.diff$/),
    }))
    .mutation(async ({ input }) => {
      const pathLib = await import("path");
      const fsp = await import("fs/promises");
      const { spawnSync } = await import("child_process");

      const iscRoot = pathLib.default.resolve(
        process.cwd(),
        "skills",
        "intelligence-skill-creator"
      );
      const diffPath = pathLib.default.join(
        iscRoot,
        "runs",
        "proposals",
        input.skillName,
        input.diffFile
      );

      // Verify diff file exists and is within expected directory (path traversal guard)
      const resolvedDiff = pathLib.default.resolve(diffPath);
      const expectedBase = pathLib.default.resolve(iscRoot, "runs", "proposals");
      if (!resolvedDiff.startsWith(expectedBase)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid diff path" });
      }

      const diffContent = await fsp.default.readFile(resolvedDiff, "utf8").catch(() => null);
      if (!diffContent) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Diff file not found: ${input.diffFile}` });
      }

      const result = spawnSync("patch", ["-N", "-r", "-", "-p0"], {
        input: diffContent,
        encoding: "utf8",
        cwd: iscRoot,
      });

      if (result.status !== 0) {
        const msg = (result.stderr || result.stdout || "patch failed").trim();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Apply failed: ${msg}` });
      }

      return { success: true, output: (result.stdout || "").trim() };
    }),

  /**
   * Toggle auto-trigger for a specific skill
   */
  toggleAutoTrigger: protectedProcedure
    .input(z.object({
      skillId: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await setAutoTrigger(ctx.user.id, input.skillId, input.enabled);
      return { success: true };
    }),
});
