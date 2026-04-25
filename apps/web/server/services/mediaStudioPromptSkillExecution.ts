import fs from "fs";
import path from "path";
import yaml from "js-yaml";

type JsonObject = Record<string, any>;

const PROMPT_BUNDLE_FALLBACK_SLUGS = new Set([
  "gpt-image-prompt-engineer",
  "image-prompt-engineer-agents",
]);

const TEXT_PROMPT_FIELDS = new Set(["detailed", "short", "structured", "edit", "variants"]);

export type MediaStudioPromptSkillCapabilities = {
  structuredPromptReview: boolean;
  sourceImagePath: boolean;
  factualReferenceInputs: boolean;
  reasons: string[];
};

export type PreparedMediaStudioPromptSkillExecution = {
  userInputs: Record<string, any>;
  context: Record<string, unknown>;
  extractStructuredPrompt: boolean;
  textPromptField: string;
  capabilities: MediaStudioPromptSkillCapabilities;
  referenceImages: string[];
};

export type StructuredPromptReviewSummary = {
  status: string | null;
  approved: boolean | null;
  requiresRevision: boolean | null;
  missingInputs: string[];
  clarifyingQuestions: string[];
  referenceResearchStatus: string | null;
  selectedSubagents: string[];
  qualityScore: number | null;
  failedChecks: string[];
};

export type StructuredPromptExtraction = {
  promptText: string | null;
  reviewSummary: StructuredPromptReviewSummary | null;
  parseError?: string;
};

function hasUsablePromptSkillValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" && trimmed !== ".";
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function normalizeTextPromptField(value: unknown): string {
  const field = typeof value === "string" ? value.trim() : "";
  return TEXT_PROMPT_FIELDS.has(field) ? field : "detailed";
}

export function normalizeReferenceImageUrls(referenceImages: unknown): string[] {
  if (!Array.isArray(referenceImages)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of referenceImages) {
    const url = typeof item === "string" ? item.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= 5) break;
  }
  return urls;
}

function fieldIdsFromUiSchema(uiSchema: JsonObject | null): Set<string> {
  const ids = new Set<string>();
  if (!uiSchema || !Array.isArray(uiSchema.sections)) return ids;
  for (const section of uiSchema.sections) {
    if (!Array.isArray(section?.fields)) continue;
    for (const field of section.fields) {
      if (typeof field?.id === "string") {
        ids.add(field.id);
      }
    }
  }
  const outputMapping = uiSchema.outputMapping;
  if (outputMapping && typeof outputMapping === "object") {
    for (const value of Object.values(outputMapping)) {
      if (typeof value === "string") {
        ids.add(value);
      }
    }
  }
  return ids;
}

function uiFieldOptionValues(uiSchema: JsonObject | null, fieldId: string): string[] {
  if (!uiSchema || !Array.isArray(uiSchema.sections)) return [];
  const values: string[] = [];
  for (const section of uiSchema.sections) {
    if (!Array.isArray(section?.fields)) continue;
    for (const field of section.fields) {
      if (field?.id !== fieldId || !Array.isArray(field.options)) continue;
      for (const option of field.options) {
        if (typeof option?.value === "string") {
          values.push(option.value);
        }
      }
    }
  }
  return values;
}

export function inferMediaStudioPromptSkillCapabilities(params: {
  skillSlug?: string | null;
  inputSchema?: JsonObject | null;
  uiSchema?: JsonObject | null;
  metadata?: JsonObject | null;
}): MediaStudioPromptSkillCapabilities {
  const reasons: string[] = [];
  const props = params.inputSchema?.properties && typeof params.inputSchema.properties === "object"
    ? params.inputSchema.properties as JsonObject
    : {};
  const metadata = mediaStudioMetadataFromSkillMetadata(params.metadata ?? null);
  const uiFieldIds = fieldIdsFromUiSchema(params.uiSchema ?? null);
  const responseModeEnum = Array.isArray(props.response_mode?.enum)
    ? props.response_mode.enum.map((item: unknown) => String(item))
    : [];
  const responseModeValues = Array.from(new Set([
    ...responseModeEnum,
    ...uiFieldOptionValues(params.uiSchema ?? null, "response_mode"),
  ]));

  const structuredPromptReviewFromSchema = (
    responseModeValues.includes("text_prompt")
    && responseModeValues.includes("json_bundle")
    && (Boolean(props.text_prompt_field) || uiFieldIds.has("text_prompt_field"))
  );
  const structuredPromptReviewFromMetadata = Boolean(
    metadata.prompt_bundle_review === true
    || metadata.structured_prompt_review === true
  );
  const structuredPromptReview = structuredPromptReviewFromSchema || structuredPromptReviewFromMetadata;
  if (structuredPromptReview) {
    reasons.push(structuredPromptReviewFromMetadata
      ? "skill metadata opts into Media Studio prompt-bundle review"
      : "schema exposes text_prompt/json_bundle response modes");
  }

  const sourceImagePathFromSchema = Boolean(props.source_image_path) || uiFieldIds.has("source_image_path");
  const sourceImagePathFromMetadata = Boolean(
    metadata.accepts_reference_images === true
    || metadata.source_image_path === true
  );
  const sourceImagePath = sourceImagePathFromSchema || sourceImagePathFromMetadata;
  if (sourceImagePath) {
    reasons.push(sourceImagePathFromMetadata
      ? "skill metadata opts into Media Studio reference image handoff"
      : "schema accepts source_image_path references");
  }

  const factualReferenceInputsFromSchema = (
    Boolean(props.verified_reference_facts)
    && Boolean(props.reference_sources)
  ) || (uiFieldIds.has("verified_reference_facts") && uiFieldIds.has("reference_sources"));
  const factualReferenceInputsFromMetadata = Boolean(
    metadata.supports_factual_grounding === true
    || metadata.factual_reference_inputs === true
  );
  const factualReferenceInputs = factualReferenceInputsFromSchema || factualReferenceInputsFromMetadata;
  if (factualReferenceInputs) {
    reasons.push(factualReferenceInputsFromMetadata
      ? "skill metadata opts into factual reference grounding"
      : "schema accepts verified reference facts and sources");
  }

  const slug = String(params.skillSlug || "").trim().toLowerCase();
  if (PROMPT_BUNDLE_FALLBACK_SLUGS.has(slug)) {
    return {
      structuredPromptReview: true,
      sourceImagePath: true,
      factualReferenceInputs: true,
      reasons: Array.from(new Set([...reasons, "known prompt-bundle skill fallback"])),
    };
  }

  return {
    structuredPromptReview,
    sourceImagePath,
    factualReferenceInputs,
    reasons,
  };
}

function readJsonFile(filePath: string): JsonObject | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function asJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function mediaStudioMetadataFromSkillMetadata(metadata: JsonObject | null): JsonObject {
  const rootMediaStudio = asJsonObject(metadata?.media_studio);
  const config = asJsonObject(metadata?.config);
  const configMediaStudio = asJsonObject(config?.media_studio);
  return {
    ...(rootMediaStudio || {}),
    ...(configMediaStudio || {}),
  };
}

function readSkillFrontmatterMetadata(skillDir: string): JsonObject | null {
  for (const fileName of ["SKILL.md", "skill.md"]) {
    const filePath = path.join(skillDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
      if (!match) continue;
      const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
      return asJsonObject(parsed);
    } catch {
      continue;
    }
  }
  return null;
}

function skillDirCandidates(skillSlug: string, folderPath?: string | null): string[] {
  const cwd = process.cwd();
  const candidates: string[] = [];
  if (folderPath) {
    candidates.push(
      path.resolve(cwd, folderPath),
      path.resolve(cwd, "..", folderPath),
      path.resolve(cwd, "..", "..", folderPath),
      path.resolve(cwd, "apps", "web", folderPath),
    );
  }
  const slugVariants = [
    skillSlug,
    skillSlug.replace(/-/g, "_"),
    skillSlug.replace(/_/g, "-"),
  ].filter(Boolean);
  for (const slug of slugVariants) {
    candidates.push(
      path.resolve(cwd, "skills", slug),
      path.resolve(cwd, "..", "skills", slug),
      path.resolve(cwd, "..", "..", "apps", "web", "skills", slug),
    );
  }
  return Array.from(new Set(candidates));
}

export function loadMediaStudioPromptSkillCapabilities(params: {
  skillSlug: string;
  folderPath?: string | null;
}): MediaStudioPromptSkillCapabilities {
  for (const skillDir of skillDirCandidates(params.skillSlug, params.folderPath)) {
    const inputSchema = readJsonFile(path.join(skillDir, "schemas", "input.schema.json"));
    const uiSchema = readJsonFile(path.join(skillDir, "schemas", "ui.schema.json"));
    const metadata = readSkillFrontmatterMetadata(skillDir);
    if (!inputSchema && !uiSchema && !metadata) continue;
    return inferMediaStudioPromptSkillCapabilities({
      skillSlug: params.skillSlug,
      inputSchema,
      uiSchema,
      metadata,
    });
  }

  return inferMediaStudioPromptSkillCapabilities({
    skillSlug: params.skillSlug,
  });
}

export function prepareMediaStudioPythonPromptSkillExecution(params: {
  skillSlug: string;
  folderPath?: string | null;
  userInputs: Record<string, any>;
  referenceImages?: unknown;
  originSurface?: string | null;
}): PreparedMediaStudioPromptSkillExecution {
  const capabilities = loadMediaStudioPromptSkillCapabilities({
    skillSlug: params.skillSlug,
    folderPath: params.folderPath,
  });
  const referenceImages = normalizeReferenceImageUrls(params.referenceImages);
  const userInputs = { ...(params.userInputs || {}) };
  const textPromptField = normalizeTextPromptField(userInputs.text_prompt_field);

  if (
    capabilities.sourceImagePath
    && referenceImages.length > 0
    && !hasUsablePromptSkillValue(userInputs.source_image_path)
  ) {
    userInputs.source_image_path = referenceImages;
  }

  const extractStructuredPrompt = (
    params.originSurface === "media_studio"
    && capabilities.structuredPromptReview
    && userInputs.response_mode !== "json_bundle"
  );
  if (extractStructuredPrompt) {
    userInputs.response_mode = "json_bundle";
    userInputs.text_prompt_field = textPromptField;
  }

  return {
    userInputs,
    context: referenceImages.length > 0 && capabilities.sourceImagePath
      ? { referenceImages }
      : {},
    extractStructuredPrompt,
    textPromptField,
    capabilities,
    referenceImages,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function selectPromptText(prompts: JsonObject, field: string): string | null {
  const selected = normalizeTextPromptField(field);
  if (selected === "variants") {
    const variants = Array.isArray(prompts.variants) ? prompts.variants : [];
    const text = variants.map((item) => String(item).trim()).filter(Boolean).join("\n\n");
    return text || null;
  }
  if (selected === "edit") {
    const edit = typeof prompts.edit === "string" ? prompts.edit.trim() : "";
    const detailed = typeof prompts.detailed === "string" ? prompts.detailed.trim() : "";
    return edit || detailed || null;
  }
  const text = typeof prompts[selected] === "string" ? prompts[selected].trim() : "";
  const detailed = typeof prompts.detailed === "string" ? prompts.detailed.trim() : "";
  return text || detailed || null;
}

function summarizeStructuredPromptReview(bundle: JsonObject): StructuredPromptReviewSummary {
  const finalReview = bundle.final_review && typeof bundle.final_review === "object"
    ? bundle.final_review as JsonObject
    : {};
  const referenceResearch = bundle.reference_research && typeof bundle.reference_research === "object"
    ? bundle.reference_research as JsonObject
    : {};
  const orchestration = bundle.orchestration && typeof bundle.orchestration === "object"
    ? bundle.orchestration as JsonObject
    : {};
  const promptQuality = bundle.prompt_quality && typeof bundle.prompt_quality === "object"
    ? bundle.prompt_quality as JsonObject
    : {};
  const failedChecks = Array.isArray(finalReview.checks)
    ? finalReview.checks
      .filter((check: JsonObject) => check && check.passed === false)
      .map((check: JsonObject) => String(check.name || "unnamed_check"))
      .filter(Boolean)
    : [];

  return {
    status: typeof finalReview.status === "string" ? finalReview.status : null,
    approved: typeof finalReview.approved === "boolean" ? finalReview.approved : null,
    requiresRevision: typeof finalReview.requires_revision === "boolean" ? finalReview.requires_revision : null,
    missingInputs: asStringArray(finalReview.missing_inputs),
    clarifyingQuestions: asStringArray(finalReview.clarifying_questions),
    referenceResearchStatus: typeof referenceResearch.status === "string" ? referenceResearch.status : null,
    selectedSubagents: asStringArray(orchestration.selected_subagents),
    qualityScore: typeof promptQuality.score === "number" ? promptQuality.score : null,
    failedChecks,
  };
}

export function extractStructuredPromptBundleTextOutput(
  rawOutput: string,
  textPromptField: string = "detailed",
): StructuredPromptExtraction {
  try {
    const bundle = JSON.parse(rawOutput) as JsonObject;
    const prompts = bundle.prompts && typeof bundle.prompts === "object"
      ? bundle.prompts as JsonObject
      : {};
    return {
      promptText: selectPromptText(prompts, textPromptField),
      reviewSummary: summarizeStructuredPromptReview(bundle),
    };
  } catch (error) {
    return {
      promptText: null,
      reviewSummary: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}
