import fs from "fs";
import path from "path";

import type { Message } from "../_core/llm";
import { calculateCreditsForLLM, deductCredits } from "./creditService";
import {
  buildRuntimeModelConfig,
  executeSharedSkillTextRuntime,
  type SharedSkillRuntimeMetadata,
  type SharedSkillRuntimeTextResult,
} from "./agentRuntime/skillRuntimeOrchestrator";
import { executeWithFallback, getProviderForModel } from "./llmRouter";
import {
  getSkillByIdAsync,
  syncSingleSkillIfChanged,
  type SkillDefinition,
} from "./skillRegistry";
import { buildCustomSkillUserPrompt } from "./skillExecutionPromptBuilder";
import {
  buildPromptLengthPlan,
  resolvePromptLanguageHintFromInputs,
  type PromptLengthPlan,
} from "./promptLengthGuard";
import {
  appendProductReferenceStoryboardCategoryRules,
  type ProductReferenceStoryboardCategoryRuleAudit,
} from "./productReferenceStoryboardCategoryRules";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";

export const PRODUCT_REFERENCE_STORYBOARD_SKILL_ID =
  "product-reference-storyboard";
export const PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID =
  "product-reference-storyboard-prompt-optimizer";
export const PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS = 4500;
const PRODUCT_REFERENCE_STORYBOARD_PROMPT_PREFERRED_CHARS = 4300;
const PRODUCT_REFERENCE_STORYBOARD_MIN_COMPLETION_TOKENS = 4000;
const PRODUCT_REFERENCE_STORYBOARD_OUTPUT_AUDIT_PREVIEW_CHARS = 500;
const PRODUCT_REFERENCE_STORYBOARD_FULL_OUTPUT_LOG_DIR = (
  process.env.PRODUCT_REFERENCE_STORYBOARD_FULL_OUTPUT_LOG_DIR || ""
).trim() || path.resolve(process.cwd(), "logs", "product-reference-storyboard");
const PRODUCT_REFERENCE_STORYBOARD_REFERENCE_IMAGE_ARRAY_FIELDS = new Set([
  "reference_product_images",
  "reference_character_images",
  "reference_environment_images",
]);
const PRODUCT_REFERENCE_STORYBOARD_OUTPUT_FATAL_CODES = new Set([
  "storyboard_layout_preset_contract_missing",
  "output_single_image_missing",
  "exact_frame_count_missing",
  "exact_panel_count_missing",
  "exact_cell_count_missing",
  "vertical_frame_count_missing",
  "wide_frame_count_missing",
  "square_frame_count_missing",
  "frame_aspect_ratio_missing",
  "crop_safe_frame_margin_missing",
  "equal_columns_missing",
  "equal_rows_missing",
  "no_collage_lock_missing",
  "no_separator_lock_missing",
  "panel_gutter_lock_missing",
  "single_cell_per_panel_lock_missing",
  "wide_shot_portrait_panel_lock_missing",
  "product_reference_image_exact_recreation_missing",
  "renderable_camera_abbreviation_label_leak",
  "renderable_storyboard_grid_label_leak",
]);

type LoadedSkillInputSchema = {
  schemaPath: string;
  schema: Record<string, unknown>;
};

type ProductReferenceStoryboardSkillInputSchemaAudit = {
  status: "passed" | "failed";
  checkedAt: string;
  schemaPath: string | null;
  blockers: string[];
  warnings: string[];
  inputKeys: string[];
  generationMode: string;
  layoutPreset: string;
  aspectRatio: string;
  productCategory: string;
  marketplacePlatform: string;
  referenceImageRoleCounts: {
    product: number;
    character: number;
    environment: number;
    total: number;
  };
  layoutContract: ProductReferenceStoryboardLayoutContract | null;
  fieldTypes: Record<string, string>;
};

type ProductReferenceStoryboardLayoutContract = {
  preset: string;
  canvasAspectRatio: string;
  gridColumns: number;
  gridRows: number;
  expectedFrameCount: number;
  frameAspectRatio: string | null;
  mode: "exact" | "crop_safe";
  requiredPromptLine: string;
  requiredFragments: Array<readonly [string, readonly string[]]>;
};

type ProductReferenceStoryboardFullOutputLogEntry = {
  loggedAt: string;
  skillId: string;
  runId: string | null;
  unitId: string | null;
  attempt: number | null;
  promptAttempt: number | null;
  modelId: string | null;
  providerName: string | null;
  finishReason: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  maxOutputChars: number;
  rawOutputLengthChars: number;
  trimmedOutputLengthChars: number;
  outputExceededMaxChars: boolean;
  promptLengthPlan: PromptLengthPlan | null;
  layoutPreset: unknown;
  generationMode: unknown;
  aspectRatio: unknown;
  productCategory: unknown;
  marketplacePlatform: unknown;
  rawOutput: string;
};

export class ProductReferenceStoryboardSkillOutputLimitError extends Error {
  skillId = PRODUCT_REFERENCE_STORYBOARD_SKILL_ID;
  runId: string | null;
  unitId: string | null;
  attempt: number | null;
  promptAttempt: number | null;
  maxOutputChars: number;
  rawOutputLengthChars: number;
  trimmedOutputLengthChars: number;
  rawOutput: string;
  fullOutputLogPath: string | null;
  promptLengthPlan: PromptLengthPlan | null;
  modelId: string | null;
  providerName: string | null;
  finishReason: string | null;

  constructor(input: {
    runId: string | null;
    unitId: string | null;
    attempt: number | null;
    promptAttempt: number | null;
    maxOutputChars: number;
    rawOutput: string;
    fullOutputLogPath?: string | null;
    promptLengthPlan: PromptLengthPlan | null;
    modelId: string | null;
    providerName: string | null;
    finishReason: string | null;
  }) {
    const trimmedOutputLengthChars = input.rawOutput.trim().length;
    super(
      `product-reference-storyboard skill output exceeded ${input.maxOutputChars} chars (${trimmedOutputLengthChars}); blocked before image provider submit`
    );
    this.name = "ProductReferenceStoryboardSkillOutputLimitError";
    this.runId = input.runId;
    this.unitId = input.unitId;
    this.attempt = input.attempt;
    this.promptAttempt = input.promptAttempt;
    this.maxOutputChars = input.maxOutputChars;
    this.rawOutput = input.rawOutput;
    this.rawOutputLengthChars = input.rawOutput.length;
    this.trimmedOutputLengthChars = trimmedOutputLengthChars;
    this.fullOutputLogPath = input.fullOutputLogPath ?? null;
    this.promptLengthPlan = input.promptLengthPlan;
    this.modelId = input.modelId;
    this.providerName = input.providerName;
    this.finishReason = input.finishReason;
  }

  toPromptSkillDebug() {
    return {
      skillId: this.skillId,
      runId: this.runId,
      unitId: this.unitId,
      attempt: this.attempt,
      promptAttempt: this.promptAttempt,
      status: "blocked_before_image_provider_submit",
      reasonCode: "skill_output_exceeded_max_chars",
      maxOutputChars: this.maxOutputChars,
      rawOutputLengthChars: this.rawOutputLengthChars,
      trimmedOutputLengthChars: this.trimmedOutputLengthChars,
      outputExceededMaxChars: true,
      fullOutputLogPath: this.fullOutputLogPath,
      promptLengthPlan: this.promptLengthPlan,
      modelId: this.modelId,
      providerName: this.providerName,
      finishReason: this.finishReason,
      rawOutput: this.rawOutput,
    };
  }
}

export class ProductReferenceStoryboardSkillIncompleteOutputError extends Error {
  skillId = PRODUCT_REFERENCE_STORYBOARD_SKILL_ID;
  runId: string | null;
  unitId: string | null;
  attempt: number | null;
  promptAttempt: number | null;
  maxOutputChars: number;
  rawOutputLengthChars: number;
  trimmedOutputLengthChars: number;
  rawOutput: string;
  fullOutputLogPath: string | null;
  promptLengthPlan: PromptLengthPlan | null;
  modelId: string | null;
  providerName: string | null;
  finishReason: string | null;
  blockers: string[];

  constructor(input: {
    runId: string | null;
    unitId: string | null;
    attempt: number | null;
    promptAttempt: number | null;
    maxOutputChars: number;
    rawOutput: string;
    fullOutputLogPath?: string | null;
    promptLengthPlan: PromptLengthPlan | null;
    modelId: string | null;
    providerName: string | null;
    finishReason: string | null;
    blockers: string[];
  }) {
    const trimmedOutputLengthChars = input.rawOutput.trim().length;
    super(
      `product-reference-storyboard returned incomplete output: ${input.blockers.join(", ")}`
    );
    this.name = "ProductReferenceStoryboardSkillIncompleteOutputError";
    this.runId = input.runId;
    this.unitId = input.unitId;
    this.attempt = input.attempt;
    this.promptAttempt = input.promptAttempt;
    this.maxOutputChars = input.maxOutputChars;
    this.rawOutput = input.rawOutput;
    this.rawOutputLengthChars = input.rawOutput.length;
    this.trimmedOutputLengthChars = trimmedOutputLengthChars;
    this.fullOutputLogPath = input.fullOutputLogPath ?? null;
    this.promptLengthPlan = input.promptLengthPlan;
    this.modelId = input.modelId;
    this.providerName = input.providerName;
    this.finishReason = input.finishReason;
    this.blockers = input.blockers;
  }

  toPromptSkillDebug() {
    return {
      skillId: this.skillId,
      runId: this.runId,
      unitId: this.unitId,
      attempt: this.attempt,
      promptAttempt: this.promptAttempt,
      status: "blocked_before_image_provider_submit",
      reasonCode: "skill_output_incomplete",
      maxOutputChars: this.maxOutputChars,
      rawOutputLengthChars: this.rawOutputLengthChars,
      trimmedOutputLengthChars: this.trimmedOutputLengthChars,
      outputExceededMaxChars: false,
      fullOutputLogPath: this.fullOutputLogPath,
      promptLengthPlan: this.promptLengthPlan,
      modelId: this.modelId,
      providerName: this.providerName,
      finishReason: this.finishReason,
      blockers: this.blockers,
      rawOutput: this.rawOutput,
    };
  }
}

export type ProductReferenceStoryboardPromptSkillRunResult = {
  prompt: string;
  rawOutput: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  creditsUsed: number;
  modelId: string | null;
  providerName: string | null;
  runtime: SharedSkillRuntimeMetadata;
  skillAudit: Record<string, unknown>;
};

function hasUsableInputValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" && trimmed !== ".";
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

function appendProductReferenceStoryboardFullOutputLog(
  entry: ProductReferenceStoryboardFullOutputLogEntry
): string | null {
  try {
    fs.mkdirSync(PRODUCT_REFERENCE_STORYBOARD_FULL_OUTPUT_LOG_DIR, {
      recursive: true,
    });
    const datePart = entry.loggedAt.slice(0, 10);
    const logPath = path.join(
      PRODUCT_REFERENCE_STORYBOARD_FULL_OUTPUT_LOG_DIR,
      `full-output-${datePart}.jsonl`
    );
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
    return logPath;
  } catch (error) {
    console.warn(
      "[productReferenceStoryboardSkillRunner] full_output_log_failed",
      {
        skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        runId: entry.runId,
        unitId: entry.unitId,
        attempt: entry.attempt,
        promptAttempt: entry.promptAttempt,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    return null;
  }
}

function sanitizeUserInputs(
  userInputs: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(userInputs || {}).filter(([key, value]) => {
      if (
        PRODUCT_REFERENCE_STORYBOARD_REFERENCE_IMAGE_ARRAY_FIELDS.has(key) &&
        Array.isArray(value)
      ) {
        return true;
      }
      return hasUsableInputValue(value);
    })
  );
}

function cleanInputString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inputStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => cleanInputString(item))
    .filter(Boolean);
}

function uniqueInputStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(item => item.trim()).filter(Boolean)));
}

function resolveProductReferenceStoryboardReferenceUrl(
  value: unknown,
  publicUrl?: string | null
): string {
  const url = cleanInputString(value);
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  if (url.startsWith("/uploads/") || url.startsWith("/api/storage/files/")) {
    const base = cleanInputString(publicUrl);
    if (!base) {
      throw new Error(
        "product-reference-storyboard reference image URL requires publicUrl before LLM dispatch"
      );
    }
    return `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
  }
  return url;
}

function normalizeProductReferenceStoryboardReferenceUrls(
  values: unknown,
  publicUrl?: string | null
): string[] {
  return uniqueInputStrings(
    inputStringArray(values).map(url =>
      resolveProductReferenceStoryboardReferenceUrl(url, publicUrl)
    )
  );
}

function normalizeProductReferenceStoryboardInputReferenceUrls(
  userInputs: Record<string, unknown>,
  publicUrl?: string | null
): Record<string, unknown> {
  const next = { ...userInputs };
  for (const fieldName of PRODUCT_REFERENCE_STORYBOARD_REFERENCE_IMAGE_ARRAY_FIELDS) {
    if (Array.isArray(next[fieldName])) {
      next[fieldName] = normalizeProductReferenceStoryboardReferenceUrls(
        next[fieldName],
        publicUrl
      );
    }
  }
  return next;
}

function inputFieldType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function extractDefaultsFromSchema(schema: unknown): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return defaults;
  }
  const record = schema as Record<string, unknown>;

  if (Array.isArray(record.sections)) {
    for (const section of record.sections) {
      const sectionRecord = section as Record<string, unknown>;
      if (!Array.isArray(sectionRecord.fields)) continue;
      for (const field of sectionRecord.fields) {
        const fieldRecord = field as Record<string, unknown>;
        const id = typeof fieldRecord.id === "string" ? fieldRecord.id : "";
        if (
          id &&
          fieldRecord.default !== undefined &&
          hasUsableInputValue(fieldRecord.default)
        ) {
          defaults[id] = fieldRecord.default;
        }
      }
    }
  }

  const properties = record.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [key, prop] of Object.entries(properties)) {
      const propRecord = prop as Record<string, unknown>;
      if (
        propRecord.default !== undefined &&
        hasUsableInputValue(propRecord.default)
      ) {
        defaults[key] = propRecord.default;
      }
    }
  }

  return defaults;
}

function skillFolderCandidates(skill: SkillDefinition): string[] {
  const candidates: string[] = [];
  if (skill.nativeBundlePath) {
    candidates.push(
      path.resolve(process.cwd(), skill.nativeBundlePath),
      path.resolve(process.cwd(), "..", skill.nativeBundlePath),
      path.resolve(process.cwd(), "apps", "web", skill.nativeBundlePath)
    );
  }
  if (skill.skillFilePath) {
    candidates.push(path.dirname(path.resolve(process.cwd(), skill.skillFilePath)));
  }
  candidates.push(
    path.resolve(process.cwd(), "skills", PRODUCT_REFERENCE_STORYBOARD_SKILL_ID),
    path.resolve(
      process.cwd(),
      "..",
      "skills",
      PRODUCT_REFERENCE_STORYBOARD_SKILL_ID
    ),
    path.resolve(
      process.cwd(),
      "apps",
      "web",
      "skills",
      PRODUCT_REFERENCE_STORYBOARD_SKILL_ID
    )
  );
  return Array.from(new Set(candidates));
}

function loadSkillInputDefaults(skill: SkillDefinition): Record<string, unknown> {
  for (const skillDir of skillFolderCandidates(skill)) {
    for (const schemaName of ["ui.schema.json", "input.schema.json"]) {
      const schemaPath = path.join(skillDir, "schemas", schemaName);
      if (!fs.existsSync(schemaPath)) continue;
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
        const defaults = extractDefaultsFromSchema(schema);
        if (Object.keys(defaults).length > 0) return defaults;
      } catch (error) {
        console.warn(
          "[productReferenceStoryboardSkillRunner] schema_defaults_read_failed",
          {
            skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
            schemaPath,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }
  }
  return {};
}

function loadSkillInputSchema(skill: SkillDefinition): LoadedSkillInputSchema | null {
  for (const skillDir of skillFolderCandidates(skill)) {
    const schemaPath = path.join(skillDir, "schemas", "input.schema.json");
    if (!fs.existsSync(schemaPath)) continue;
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      if (schema && typeof schema === "object" && !Array.isArray(schema)) {
        return {
          schemaPath,
          schema: schema as Record<string, unknown>,
        };
      }
    } catch (error) {
      console.warn(
        "[productReferenceStoryboardSkillRunner] input_schema_read_failed",
        {
          skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
          schemaPath,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }
  return null;
}

function schemaProperties(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties;
  return properties && typeof properties === "object" && !Array.isArray(properties)
    ? (properties as Record<string, unknown>)
    : {};
}

function schemaEnumValues(
  schema: Record<string, unknown>,
  fieldName: string
): string[] {
  const prop = schemaProperties(schema)[fieldName];
  if (!prop || typeof prop !== "object" || Array.isArray(prop)) return [];
  const enumValues = (prop as Record<string, unknown>).enum;
  return Array.isArray(enumValues)
    ? enumValues.map(item => cleanInputString(item)).filter(Boolean)
    : [];
}

function schemaRequiredFields(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.required)
    ? schema.required.map(item => cleanInputString(item)).filter(Boolean)
    : [];
}

const PRODUCT_REFERENCE_STORYBOARD_LAYOUT_CONTRACTS: Record<
  string,
  ProductReferenceStoryboardLayoutContract
> = {
  canvas_1_1_grid_1x1_frame_1_1_exact: buildStoryboardLayoutContract({
    preset: "canvas_1_1_grid_1x1_frame_1_1_exact",
    canvasAspectRatio: "1:1",
    gridColumns: 1,
    gridRows: 1,
    frameAspectRatio: "1:1",
    mode: "exact",
  }),
  canvas_1_1_grid_2x2_frame_1_1_exact: buildStoryboardLayoutContract({
    preset: "canvas_1_1_grid_2x2_frame_1_1_exact",
    canvasAspectRatio: "1:1",
    gridColumns: 2,
    gridRows: 2,
    frameAspectRatio: "1:1",
    mode: "exact",
  }),
  canvas_1_1_grid_3x3_frame_1_1_exact: buildStoryboardLayoutContract({
    preset: "canvas_1_1_grid_3x3_frame_1_1_exact",
    canvasAspectRatio: "1:1",
    gridColumns: 3,
    gridRows: 3,
    frameAspectRatio: "1:1",
    mode: "exact",
  }),
  canvas_16_9_grid_1x1_frame_16_9_exact: buildStoryboardLayoutContract({
    preset: "canvas_16_9_grid_1x1_frame_16_9_exact",
    canvasAspectRatio: "16:9",
    gridColumns: 1,
    gridRows: 1,
    frameAspectRatio: "16:9",
    mode: "exact",
  }),
  canvas_16_9_grid_2x2_frame_16_9_exact: buildStoryboardLayoutContract({
    preset: "canvas_16_9_grid_2x2_frame_16_9_exact",
    canvasAspectRatio: "16:9",
    gridColumns: 2,
    gridRows: 2,
    frameAspectRatio: "16:9",
    mode: "exact",
  }),
  canvas_16_9_grid_3x3_frame_16_9_exact: buildStoryboardLayoutContract({
    preset: "canvas_16_9_grid_3x3_frame_16_9_exact",
    canvasAspectRatio: "16:9",
    gridColumns: 3,
    gridRows: 3,
    frameAspectRatio: "16:9",
    mode: "exact",
  }),
  canvas_16_9_grid_2x1_crop_safe: buildStoryboardLayoutContract({
    preset: "canvas_16_9_grid_2x1_crop_safe",
    canvasAspectRatio: "16:9",
    gridColumns: 2,
    gridRows: 1,
    frameAspectRatio: null,
    mode: "crop_safe",
  }),
  canvas_16_9_grid_3x2_crop_safe: buildStoryboardLayoutContract({
    preset: "canvas_16_9_grid_3x2_crop_safe",
    canvasAspectRatio: "16:9",
    gridColumns: 3,
    gridRows: 2,
    frameAspectRatio: null,
    mode: "crop_safe",
  }),
  canvas_9_16_grid_1x1_frame_9_16_exact: buildStoryboardLayoutContract({
    preset: "canvas_9_16_grid_1x1_frame_9_16_exact",
    canvasAspectRatio: "9:16",
    gridColumns: 1,
    gridRows: 1,
    frameAspectRatio: "9:16",
    mode: "exact",
  }),
  canvas_9_16_grid_2x2_frame_9_16_exact: buildStoryboardLayoutContract({
    preset: "canvas_9_16_grid_2x2_frame_9_16_exact",
    canvasAspectRatio: "9:16",
    gridColumns: 2,
    gridRows: 2,
    frameAspectRatio: "9:16",
    mode: "exact",
  }),
  canvas_9_16_grid_3x3_frame_9_16_exact: buildStoryboardLayoutContract({
    preset: "canvas_9_16_grid_3x3_frame_9_16_exact",
    canvasAspectRatio: "9:16",
    gridColumns: 3,
    gridRows: 3,
    frameAspectRatio: "9:16",
    mode: "exact",
  }),
  canvas_9_16_grid_1x2_crop_safe: buildStoryboardLayoutContract({
    preset: "canvas_9_16_grid_1x2_crop_safe",
    canvasAspectRatio: "9:16",
    gridColumns: 1,
    gridRows: 2,
    frameAspectRatio: null,
    mode: "crop_safe",
  }),
  canvas_9_16_grid_2x3_crop_safe: buildStoryboardLayoutContract({
    preset: "canvas_9_16_grid_2x3_crop_safe",
    canvasAspectRatio: "9:16",
    gridColumns: 2,
    gridRows: 3,
    frameAspectRatio: null,
    mode: "crop_safe",
  }),
  canvas_4_3_grid_4x3_frame_1_1_exact: buildStoryboardLayoutContract({
    preset: "canvas_4_3_grid_4x3_frame_1_1_exact",
    canvasAspectRatio: "4:3",
    gridColumns: 4,
    gridRows: 3,
    frameAspectRatio: "1:1",
    mode: "exact",
  }),
  canvas_3_4_grid_3x4_frame_1_1_exact: buildStoryboardLayoutContract({
    preset: "canvas_3_4_grid_3x4_frame_1_1_exact",
    canvasAspectRatio: "3:4",
    gridColumns: 3,
    gridRows: 4,
    frameAspectRatio: "1:1",
    mode: "exact",
  }),
};

function buildStoryboardLayoutContract(input: {
  preset: string;
  canvasAspectRatio: string;
  gridColumns: number;
  gridRows: number;
  frameAspectRatio: string | null;
  mode: "exact" | "crop_safe";
}): ProductReferenceStoryboardLayoutContract {
  const expectedFrameCount = input.gridColumns * input.gridRows;
  const exactFrameDescriptor =
    input.frameAspectRatio === "9:16"
      ? `${expectedFrameCount} vertical frames`
      : input.frameAspectRatio === "16:9"
        ? `${expectedFrameCount} wide frames`
        : input.frameAspectRatio === "1:1"
          ? `${expectedFrameCount} square frames`
          : `${expectedFrameCount} ${input.frameAspectRatio ?? ""} frames`;
  const exactFrameCode =
    input.frameAspectRatio === "9:16"
      ? "vertical_frame_count_missing"
      : input.frameAspectRatio === "16:9"
        ? "wide_frame_count_missing"
        : input.frameAspectRatio === "1:1"
          ? "square_frame_count_missing"
          : "frame_aspect_ratio_missing";
  const frameShape =
    input.mode === "exact" && input.frameAspectRatio
      ? `, exactly ${exactFrameDescriptor}`
      : `, ${expectedFrameCount} crop-safe frames with generous margins`;
  const isVerticalNinePanelGrid =
    input.canvasAspectRatio === "9:16" &&
    input.gridColumns === 3 &&
    input.gridRows === 3 &&
    expectedFrameCount === 9 &&
    input.frameAspectRatio === "9:16" &&
    input.mode === "exact";
  const requiredPromptLine = isVerticalNinePanelGrid
    ? "LAYOUT LOCK: Create one single 9:16 image as a strict 3x3 grid with EXACTLY 9 PANELS / 9 CELLS ONLY, exactly 3 equal-width columns, exactly 3 equal-height rows, clean narrow gutters between panels, no collage/masonry layout, no labels, no numbers, and no text. Each panel occupies exactly one cell. Never split one panel into two cells. Wide shot means a wide field of view inside a vertical portrait panel, not a horizontal panel."
    : [
        `Create one single ${input.canvasAspectRatio} image as a strict ${input.gridColumns}x${input.gridRows} grid with exactly ${expectedFrameCount} frames${frameShape}`,
        `exactly ${input.gridColumns} equal-width columns`,
        `exactly ${input.gridRows} equal-height rows`,
        "no collage/masonry layout",
        "no separator lines",
        "and no visible dividers.",
      ].join(", ");
  const countFragments: Array<readonly [string, readonly string[]]> =
    isVerticalNinePanelGrid
      ? [
          [
            "exact_panel_count_missing",
            [
              "EXACTLY 9 PANELS",
              "9 PANELS / 9 CELLS ONLY",
              "exactly 9 panels",
            ],
          ],
          [
            "exact_cell_count_missing",
            [
              "9 CELLS ONLY",
              "9 PANELS / 9 CELLS ONLY",
              "exactly 9 cells",
            ],
          ],
        ]
      : [
          [
            "exact_frame_count_missing",
            [
              `exactly ${expectedFrameCount} frames`,
              `${expectedFrameCount} total frames`,
            ],
          ],
        ];
  const shapeFragments: Array<readonly [string, readonly string[]]> =
    isVerticalNinePanelGrid
      ? [
          [
            "single_cell_per_panel_lock_missing",
            [
              "Each panel occupies exactly one cell",
              "Never split one panel into two cells",
            ],
          ],
          [
            "wide_shot_portrait_panel_lock_missing",
            [
              "wide field of view inside a vertical portrait panel",
              "not a horizontal panel",
            ],
          ],
        ]
      : input.mode === "exact" && input.frameAspectRatio
        ? [
            [
              exactFrameCode,
              [
                `exactly ${exactFrameDescriptor}`,
                exactFrameDescriptor,
                `${input.frameAspectRatio} frames`,
              ],
            ],
          ]
        : [
            [
              "crop_safe_frame_margin_missing",
              ["crop-safe frames", "crop safe frames", "generous margins"],
            ],
          ];
  const dividerFragments: Array<readonly [string, readonly string[]]> =
    isVerticalNinePanelGrid
      ? [
          [
            "panel_gutter_lock_missing",
            ["clean narrow gutters", "narrow gutters between panels"],
          ],
        ]
      : [
          [
            "no_separator_lock_missing",
            ["no separator lines", "no visible dividers"],
          ],
        ];
  return {
    ...input,
    expectedFrameCount,
    requiredPromptLine,
    requiredFragments: [
      [
        "output_single_image_missing",
        [
          `one single ${input.canvasAspectRatio} image`,
          `single ${input.canvasAspectRatio} image`,
        ],
      ],
      ...countFragments,
      ...shapeFragments,
      [
        "equal_columns_missing",
        [
          `exactly ${input.gridColumns} equal-width columns`,
          `${input.gridColumns} equal-width columns`,
        ],
      ],
      [
        "equal_rows_missing",
        [
          `exactly ${input.gridRows} equal-height rows`,
          `${input.gridRows} equal-height rows`,
        ],
      ],
      ["no_collage_lock_missing", ["no collage/masonry layout", "no collage"]],
      ...dividerFragments,
    ],
  };
}

function resolveStoryboardLayoutPresetContract(
  preset: unknown
): ProductReferenceStoryboardLayoutContract | null {
  const value = cleanInputString(preset);
  if (!value || value === "auto") return null;
  return PRODUCT_REFERENCE_STORYBOARD_LAYOUT_CONTRACTS[value] ?? null;
}

function normalizeProductReferenceStoryboardSkillInputs(
  defaults: Record<string, unknown>,
  userInputs: Record<string, unknown>,
  maxOutputChars: number
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...defaults,
    ...userInputs,
    maxPromptLength: maxOutputChars,
    prompt_budget_chars: maxOutputChars,
    max_output_chars: maxOutputChars,
  };
  if (cleanInputString(merged.generation_mode) === "auto") {
    merged.generation_mode = "multi_frame_storyboard";
  }
  if (!cleanInputString(merged.generation_mode)) {
    merged.generation_mode = "multi_frame_storyboard";
  }
  if (!cleanInputString(merged.storyboard_layout_preset)) {
    merged.storyboard_layout_preset =
      "canvas_9_16_grid_3x3_frame_9_16_exact";
  }
  const layoutContract = resolveStoryboardLayoutPresetContract(
    merged.storyboard_layout_preset
  );
  if (
    layoutContract &&
    (!cleanInputString(merged.aspect_ratio) ||
      cleanInputString(merged.aspect_ratio) === "auto")
  ) {
    merged.aspect_ratio = layoutContract.canvasAspectRatio;
  }
  if (layoutContract && !Number(merged.required_frame_count ?? 0)) {
    merged.required_frame_count = layoutContract.expectedFrameCount;
  }
  return merged;
}

const PRODUCT_REFERENCE_STORYBOARD_SCHEMA_AUDIT_FIELD_NAMES = [
  "generation_mode",
  "product_category",
  "storyboard_layout_preset",
  "aspect_ratio",
  "storyboard_guide",
  "voiceover_script",
  "product_detail",
  "production_concept_details",
  "reference_product_images",
  "reference_character_images",
  "reference_environment_images",
  "image_text_mode",
  "marketplace_platform",
  "product_item_id",
  "product_source_url",
  "product_title",
] as const;

function buildSkillInputSchemaAudit(params: {
  schema: LoadedSkillInputSchema | null;
  userInputs: Record<string, unknown>;
  referenceImages: string[];
}): ProductReferenceStoryboardSkillInputSchemaAudit {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const schema = params.schema?.schema ?? null;
  const requiredFields = schema ? schemaRequiredFields(schema) : [];
  const requiredRuntimeFields = requiredFields;

  if (!schema) {
    blockers.push("input_schema_missing");
  }

  for (const fieldName of requiredRuntimeFields) {
    if (!hasUsableInputValue(params.userInputs[fieldName])) {
      blockers.push(`${fieldName}_field_missing`);
    }
  }

  function expectEnum(fieldName: string) {
    if (!schema) return;
    const allowed = schemaEnumValues(schema, fieldName);
    if (allowed.length === 0) return;
    const value = cleanInputString(params.userInputs[fieldName]);
    if (!allowed.includes(value)) {
      blockers.push(`${fieldName}_invalid_choice:${value || "empty"}`);
    }
  }

  for (const fieldName of [
    "generation_mode",
    "product_category",
    "storyboard_layout_preset",
    "aspect_ratio",
    "image_text_mode",
    "image_text_language",
    "label_fidelity",
    "label_readability_mode",
    "cinematic_style",
    "marketplace_platform",
  ]) {
    expectEnum(fieldName);
  }

  const generationMode = cleanInputString(params.userInputs.generation_mode);
  const layoutPreset = cleanInputString(params.userInputs.storyboard_layout_preset);
  const aspectRatio = cleanInputString(params.userInputs.aspect_ratio);
  const requiredFrameCount = Number(params.userInputs.required_frame_count ?? 0);
  const productCategory = cleanInputString(params.userInputs.product_category);
  const marketplacePlatform = cleanInputString(params.userInputs.marketplace_platform);
  const layoutContract = resolveStoryboardLayoutPresetContract(layoutPreset);

  if (generationMode !== "multi_frame_storyboard") {
    blockers.push("generation_mode_must_be_multi_frame_storyboard");
  }
  if (!layoutContract) {
    blockers.push(`storyboard_layout_preset_contract_missing:${layoutPreset || "empty"}`);
  }
  if (layoutContract && aspectRatio !== layoutContract.canvasAspectRatio) {
    blockers.push(
      `aspect_ratio_must_match_layout_preset:${layoutContract.canvasAspectRatio}`
    );
  }
  if (
    layoutContract &&
    Number.isFinite(requiredFrameCount) &&
    requiredFrameCount > 0 &&
    requiredFrameCount !== layoutContract.expectedFrameCount
  ) {
    blockers.push(
      `required_frame_count_must_match_layout_preset:${layoutContract.expectedFrameCount}`
    );
  }
  if (!productCategory || productCategory === "auto") {
    blockers.push("product_category_must_be_detected_before_skill_call");
  }

  function expectImageArray(fieldName: string, minItems = 0) {
    const value = params.userInputs[fieldName];
    if (!Array.isArray(value)) {
      blockers.push(`${fieldName}_must_be_array`);
      return;
    }
    const usable = inputStringArray(value);
    if (usable.length < minItems) {
      blockers.push(`${fieldName}_needs_at_least_${minItems}_image`);
    }
    if (usable.length !== value.length) {
      blockers.push(`${fieldName}_contains_empty_or_non_string_value`);
    }
  }

  expectImageArray("reference_product_images", 1);
  expectImageArray("reference_character_images", 0);
  expectImageArray("reference_environment_images", 0);

  const roleCounts = {
    product: inputStringArray(params.userInputs.reference_product_images).length,
    character: inputStringArray(params.userInputs.reference_character_images).length,
    environment: inputStringArray(params.userInputs.reference_environment_images).length,
    total: params.referenceImages.length,
  };
  if (roleCounts.total < roleCounts.product) {
    blockers.push("reference_images_total_less_than_product_refs");
  }
  if (roleCounts.product < 1) {
    blockers.push("reference_product_image_role_empty");
  }
  if (roleCounts.character === 0) {
    warnings.push("reference_character_images_empty");
  }
  if (roleCounts.environment === 0) {
    warnings.push("reference_environment_images_empty");
  }

  const fieldTypes = Object.fromEntries(
    PRODUCT_REFERENCE_STORYBOARD_SCHEMA_AUDIT_FIELD_NAMES.map(fieldName => [
      fieldName,
      inputFieldType(params.userInputs[fieldName]),
    ])
  );

  return {
    status: blockers.length === 0 ? "passed" : "failed",
    checkedAt: new Date().toISOString(),
    schemaPath: params.schema?.schemaPath ?? null,
    blockers,
    warnings,
    inputKeys: Object.keys(params.userInputs).sort(),
    generationMode,
    layoutPreset,
    aspectRatio,
    productCategory,
    marketplacePlatform,
    referenceImageRoleCounts: roleCounts,
    layoutContract,
    fieldTypes,
  };
}

function substituteTemplateVariables(
  template: string,
  userInputs: Record<string, unknown>
): string {
  return template.replace(
    /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_match, variableName: string) => {
      const value = userInputs[variableName];
      return value !== undefined && value !== null ? String(value) : "";
    }
  );
}

function loadPromptTemplate(skill: SkillDefinition): string {
  let systemPrompt = skill.skillContent || skill.systemPrompt || "";
  for (const skillDir of skillFolderCandidates(skill)) {
    for (const promptName of [
      "storyboard.prompt.md",
      "prompt.md",
      `${PRODUCT_REFERENCE_STORYBOARD_SKILL_ID}.prompt.md`,
    ]) {
      const promptPath = path.join(skillDir, "prompts", promptName);
      if (!fs.existsSync(promptPath)) continue;
      try {
        const template = fs.readFileSync(promptPath, "utf-8");
        if (template.trim()) return template;
      } catch (error) {
        console.warn(
          "[productReferenceStoryboardSkillRunner] prompt_template_read_failed",
          {
            skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
            promptPath,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }
  }
  return systemPrompt;
}

function buildSkillRuntimeSystemPrompt(input: {
  skill: SkillDefinition;
  userInputs: Record<string, unknown>;
  maxOutputChars: number;
}): {
  systemPrompt: string;
  categoryRuleAudit: ProductReferenceStoryboardCategoryRuleAudit;
  promptLengthPlan: PromptLengthPlan | null;
} {
  const categoryPrompt = appendProductReferenceStoryboardCategoryRules(
    loadPromptTemplate(input.skill),
    {
      skillSlug: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      folderPath: input.skill.nativeBundlePath ?? null,
      skillDirectories: skillFolderCandidates(input.skill),
      userInputs: input.userInputs,
    }
  );
  const basePrompt = substituteTemplateVariables(
    categoryPrompt.systemPrompt,
    input.userInputs
  );
  const promptLengthPlan = buildPromptLengthPlan(
    input.maxOutputChars,
    resolvePromptLanguageHintFromInputs(input.userInputs)
  );
  const layoutContract = resolveStoryboardLayoutPresetContract(
    input.userInputs.storyboard_layout_preset
  );
  const layoutContractLine =
    layoutContract?.requiredPromptLine ??
    PRODUCT_REFERENCE_STORYBOARD_LAYOUT_CONTRACTS
      .canvas_9_16_grid_3x3_frame_9_16_exact.requiredPromptLine;
  const expectedFrameCount = layoutContract?.expectedFrameCount ?? 9;
  return {
    systemPrompt: [
      basePrompt,
      promptLengthPlan?.directive,
      "## Storyboard Layout Preset Contract",
      `storyboard_layout_preset: ${cleanInputString(input.userInputs.storyboard_layout_preset) || "canvas_9_16_grid_3x3_frame_9_16_exact"}`,
      layoutContract
        ? [
            `Decoded canvas aspect ratio: ${layoutContract.canvasAspectRatio}.`,
            `Decoded grid: ${layoutContract.gridColumns} columns x ${layoutContract.gridRows} rows.`,
            `Decoded frame count: ${layoutContract.expectedFrameCount}.`,
            `Decoded frame mode: ${layoutContract.mode}${layoutContract.frameAspectRatio ? `, frame aspect ratio ${layoutContract.frameAspectRatio}` : ""}.`,
          ].join(" ")
        : "The supplied storyboard_layout_preset is unsupported. Return only: ERROR: product-reference-storyboard contract cannot be satisfied.",
      "The storyboard_layout_preset is the single source of truth for canvas ratio, grid columns, grid rows, frame count, and frame shape. Do not let aspect_ratio, required_frame_count, storyboard_guide, voiceover_script, or prose instructions override it.",
      `The first line after SHOT-BY-SHOT STORYBOARD PROMPT: must be copied exactly as: ${layoutContractLine}`,
      "## Marketplace Auto Review Runtime Contract",
      `Return only the final image-generation prompt text. The output must be <= ${input.maxOutputChars} characters.`,
      "Do not return JSON, Markdown fences, QA notes, explanations, alternatives, or implementation notes.",
      `The final prompt must explicitly include the decoded layout line and these image-generation contract phrases from the preset: ${layoutContractLine}; CINEMATIC REALISM LOCK; PRODUCT REFERENCE LOCK; TEXT RENDERING POLICY.`,
      "The PRODUCT REFERENCE LOCK and PRODUCT VERIFY blocks must explicitly say that @Image1 / the first attached product reference image is the primary visual source of truth, the written product description is secondary and must never override the attached product image, and character/environment images must not change or replace the product shape.",
      "If reference_character_images are supplied, @Image2 is the uploaded presenter/reviewer identity reference by default. Never call @Image2 a child, toddler, kid, or baby unless the user explicitly supplied a child reference. Do not age-transform the uploaded presenter to fit a child product story.",
      `The final prompt must include complete Frame 1 through Frame ${expectedFrameCount} before ending. Frame lines must be visual-only prose: do not use VISUAL:, STORY MATCH:, HUMAN REALISM:, quoted voiceover lines, timecodes, subtitles, or captions. Use one shared CAMERA/LIGHT/DEPTH: block and one shared PRODUCT VERIFY: block outside the frame list. Do not repeat CAMERA/LIGHT/DEPTH: or PRODUCT VERIFY: in every frame.`,
      `Completeness beats polish: never stop at a partial Frame line or a bare label. If the prompt is near the limit, shorten global locks first, then shorten each frame to one compact visual sentence while still returning all ${expectedFrameCount} frames.`,
      "The final prompt must include the text policy phrases no text, dimension text, timecodes, and marketplace/mobile app screenshots when image_text_mode is no_text.",
      "When image_text_mode is no_text, the final prompt must also explicitly forbid added visible camera-shot abbreviations or technical labels such as ECU, CU, MCU, MS, WS, ELS, LS, OS, HA, LA, storyboard_grid, panel names, corner labels, captions, subtitles, or random glyphs. Camera/shot shorthand may be used only as backend planning prose, never as rendered text in the image.",
      "Do not echo runtime/schema field names such as storyboard_guide, voiceover_script, product_detail, production_concept_details, or reference_product_images as validation metadata in the final prompt; use their values to write visual instructions.",
      "If the full answer would be longer, compress wording before returning while preserving the image-generation contract and every exact phrase above.",
      "Do not use fallback content. If the required skill contract cannot be satisfied, say only: ERROR: product-reference-storyboard contract cannot be satisfied.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    categoryRuleAudit: categoryPrompt.audit,
    promptLengthPlan,
  };
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string") {
          return record.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractLlmContent(response: unknown): string {
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = extractTextFromContent(message?.content);
  return content.trim();
}

function extractLlmFinishReason(response: unknown): string | null {
  const record = response as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const finishReason = firstChoice?.finish_reason ?? firstChoice?.finishReason;
  return typeof finishReason === "string" ? finishReason : null;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function restoreProductReferenceStoryboardMandatoryContract(input: {
  prompt: string;
  userInputs: Record<string, unknown>;
  maxOutputChars: number;
}): {
  prompt: string;
  applied: boolean;
  restoredCodes: string[];
} {
  const base = input.prompt.trim();
  if (!base) {
    return { prompt: base, applied: false, restoredCodes: [] };
  }
  const layoutContract = resolveStoryboardLayoutPresetContract(
    input.userInputs.storyboard_layout_preset
  );
  const expectedFrameCount = layoutContract?.expectedFrameCount ?? 9;
  const frameCount = countMatches(base, /\bFrame\s+\d+\s*:/gi);
  if (frameCount < expectedFrameCount) {
    return { prompt: base, applied: false, restoredCodes: [] };
  }

  let prompt = base;
  const restoredCodes: string[] = [];
  const requiredLayoutFragments =
    layoutContract?.requiredFragments ??
    PRODUCT_REFERENCE_STORYBOARD_LAYOUT_CONTRACTS
      .canvas_9_16_grid_3x3_frame_9_16_exact.requiredFragments;
  const missingLayout = requiredLayoutFragments.filter(
    ([, fragments]) =>
      !fragments.some(fragment =>
        prompt.toLowerCase().includes(fragment.toLowerCase())
      )
  );
  if (missingLayout.length > 0 && layoutContract?.requiredPromptLine) {
    const layoutLine = layoutContract.requiredPromptLine;
    const next = /SHOT-BY-SHOT STORYBOARD PROMPT:/i.test(prompt)
      ? prompt.replace(
          /SHOT-BY-SHOT STORYBOARD PROMPT:\s*/i,
          `SHOT-BY-SHOT STORYBOARD PROMPT:\n${layoutLine}\n`
        )
      : `SHOT-BY-SHOT STORYBOARD PROMPT:\n${layoutLine}\n${prompt}`;
    if (next.length <= input.maxOutputChars) {
      prompt = next;
      restoredCodes.push(
        ...missingLayout.map(([code]) => `layout:${code}`)
      );
    }
  }

  const hasExactProductReferenceLock =
    /(?:@Image1|product reference image|attached product image)/i.test(
      prompt
    ) &&
    /(?:primary visual source of truth|strict product visual lock|strict visual source of truth)/i.test(
      prompt
    ) &&
    /(?:text|description)[^\n]{0,100}(?:secondary|must never override|never override)|(?:not|never)[^\n]{0,140}(?:generic product description|text description)/i.test(
      prompt
    ) &&
    /(?:recreate|match|copy|replicate)[^\n]{0,180}(?:exact|same|actual reference|reference image)/i.test(
      prompt
    );
  if (!hasExactProductReferenceLock) {
    const productTitle = cleanInputString(input.userInputs.product_title);
    const productLock = [
      "PRODUCT REFERENCE LOCK: Use @Image1 / the first attached product reference image as the primary visual source of truth; the written product description is secondary and must never override the attached product image or generic product description. Recreate and match the exact same actual reference image product, including silhouette, proportions, material, color, countable parts, construction, and scale.",
      productTitle ? `Product title context: ${productTitle}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const next = /SHOT-BY-SHOT STORYBOARD PROMPT:/i.test(prompt)
      ? prompt.replace(
          /SHOT-BY-SHOT STORYBOARD PROMPT:/i,
          `${productLock}\nSHOT-BY-SHOT STORYBOARD PROMPT:`
        )
      : `${productLock}\n${prompt}`;
    if (next.length <= input.maxOutputChars) {
      prompt = next;
      restoredCodes.push("product_reference_image_exact_recreation_missing");
    }
  }

  return {
    prompt,
    applied: restoredCodes.length > 0,
    restoredCodes,
  };
}

function validateProductReferenceStoryboardOutputCompleteness(
  prompt: string,
  layoutPreset: unknown = "canvas_9_16_grid_3x3_frame_9_16_exact",
  imageTextMode: unknown = "no_text"
): string[] {
  const warnings: string[] = [];
  const lower = prompt.toLowerCase();
  const layoutContract = resolveStoryboardLayoutPresetContract(layoutPreset);
  if (!layoutContract) {
    warnings.push(
      `storyboard_layout_preset_contract_missing:${cleanInputString(layoutPreset) || "empty"}`
    );
  }
  const requiredLayoutFragments =
    layoutContract?.requiredFragments ??
    PRODUCT_REFERENCE_STORYBOARD_LAYOUT_CONTRACTS
      .canvas_9_16_grid_3x3_frame_9_16_exact.requiredFragments;
  for (const [code, fragments] of requiredLayoutFragments) {
    if (!fragments.some(fragment => lower.includes(fragment.toLowerCase()))) {
      warnings.push(code);
    }
  }
  const expectedFrameCount = layoutContract?.expectedFrameCount ?? 9;
  for (let index = 1; index <= expectedFrameCount; index += 1) {
    if (!new RegExp(`\\bFrame\\s+${index}\\b`, "i").test(prompt)) {
      warnings.push(`frame_${index}_missing`);
    }
  }
  for (let index = 1; index <= expectedFrameCount; index += 1) {
    const match = prompt.match(
      new RegExp(
        `\\bFrame\\s+${index}\\s*:\\s*([\\s\\S]*?)(?=\\bFrame\\s+${index + 1}\\s*:|$)`,
        "i"
      )
    );
    if (!match || match[1].trim().length < 24) {
      warnings.push(`frame_${index}_content_incomplete`);
    }
  }
  if (/(?:VISUAL|STORY MATCH|HUMAN REALISM)\s*:/i.test(prompt)) {
    warnings.push("renderable_frame_label_leak");
  }
  if (productReferenceStoryboardNoAddedTextModeIsActive(imageTextMode)) {
    warnings.push(...detectProductReferenceStoryboardNoTextPromptLeaks(prompt));
  }
  if (!/CAMERA\/LIGHT\/DEPTH:/i.test(prompt)) {
    warnings.push("camera_light_depth_global_missing");
  }
  if (!/PRODUCT VERIFY:/i.test(prompt)) {
    warnings.push("product_verify_global_missing");
  }
  if (
    !/(?:@Image1|product reference image|attached product image)/i.test(
      prompt
    ) ||
    !/(?:primary visual source of truth|strict product visual lock|strict visual source of truth)/i.test(
      prompt
    ) ||
    !/(?:text|description)[^\n]{0,100}(?:secondary|must never override|never override)|(?:not|never)[^\n]{0,140}(?:generic product description|text description)/i.test(
      prompt
    ) ||
    !/(?:recreate|match|copy|replicate)[^\n]{0,180}(?:exact|same|actual reference|reference image)/i.test(
      prompt
    )
  ) {
    warnings.push("product_reference_image_exact_recreation_missing");
  }
  if (
    /(?:^|\n)\s*(?:Frame\s+\d+\s*:?\s*|(?:VISUAL|STORY MATCH|HUMAN REALISM|CAMERA\/LIGHT\/DEPTH|PRODUCT VERIFY)\s*:?\s*)$/i.test(
      prompt.trim()
    )
  ) {
    warnings.push("output_ended_mid_field");
  }
  return warnings;
}

function productReferenceStoryboardOutputCodeIsFatal(code: string): boolean {
  const normalized = code.split(":")[0] ?? code;
  if (PRODUCT_REFERENCE_STORYBOARD_OUTPUT_FATAL_CODES.has(normalized)) {
    return true;
  }
  return /^frame_\d+_(?:missing|content_incomplete)$/.test(normalized);
}

function productReferenceStoryboardNoAddedTextModeIsActive(
  imageTextMode: unknown
): boolean {
  return cleanInputString(imageTextMode).toLowerCase() !== "with_text";
}

export function detectProductReferenceStoryboardNoTextPromptLeaks(
  prompt: string
): string[] {
  const warnings: string[] = [];
  if (
    productReferenceStoryboardPromptHasRenderableTextLeak(
      prompt,
      /\b(?:ECU|CU|MCU|MS|WS|ELS|LS|OS|HA|LA)\b/
    )
  ) {
    warnings.push("renderable_camera_abbreviation_label_leak");
  }
  if (
    productReferenceStoryboardPromptHasRenderableTextLeak(
      prompt,
      /\bstoryboard[\s_-]?grid\b/i
    )
  ) {
    warnings.push("renderable_storyboard_grid_label_leak");
  }
  return warnings;
}

function productReferenceStoryboardPromptHasRenderableTextLeak(
  prompt: string,
  tokenPattern: RegExp
): boolean {
  const lines = prompt.split(/\n+/);
  return lines.some(line => {
    if (!tokenPattern.test(line)) return false;
    tokenPattern.lastIndex = 0;
    if (
      /\b(?:no|not|never|forbid|forbidden|without|do not|don't|avoid|suppress)\b|(?:ห้าม|ไม่มี|ไม่ให้|ไม่ต้อง)/i.test(
        line
      )
    ) {
      return false;
    }
    return /(?:render|show|display|add|include|label|labeled|text|corner|top[-\s]?left|bottom|caption|visible|write|put|appear|วาง|แสดง|ข้อความ|มุม|ป้าย)/i.test(
      line
    );
  });
}

function stripRenderableStoryboardFrameLabels(prompt: string): string {
  return prompt
    .replace(
      /\s+STORY MATCH:\s*(?:"[^"]*"|"[^"]*|“[^”]*”|[^\n]*?)(?=\s+HUMAN REALISM:|\n\s*Frame\s+\d+\s*:|$)/gi,
      ""
    )
    .replace(/\bVISUAL:\s*/gi, "")
    .replace(/\bHUMAN REALISM:\s*/gi, "");
}

export function validateProductReferenceStoryboardOutputCompletenessForTest(
  prompt: string,
  layoutPreset?: string | null,
  imageTextMode?: string | null
): string[] {
  return validateProductReferenceStoryboardOutputCompleteness(
    prompt,
    layoutPreset ?? "canvas_9_16_grid_3x3_frame_9_16_exact",
    imageTextMode ?? "no_text"
  );
}

export function restoreProductReferenceStoryboardMandatoryContractForTest(input: {
  prompt: string;
  userInputs?: Record<string, unknown> | null;
  maxOutputChars?: number | null;
}): {
  prompt: string;
  applied: boolean;
  restoredCodes: string[];
} {
  return restoreProductReferenceStoryboardMandatoryContract({
    prompt: input.prompt,
    userInputs: input.userInputs ?? {},
    maxOutputChars:
      input.maxOutputChars ?? PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS,
  });
}

export function resolveStoryboardLayoutPresetContractForTest(
  preset: string
): ProductReferenceStoryboardLayoutContract | null {
  return resolveStoryboardLayoutPresetContract(preset);
}

export function stripRenderableStoryboardFrameLabelsForTest(
  prompt: string
): string {
  return stripRenderableStoryboardFrameLabels(prompt);
}

export function sanitizeProductReferenceStoryboardUserInputsForTest(
  userInputs: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeUserInputs(userInputs);
}

function shouldOptimizeProductReferenceStoryboardPrompt(
  prompt: string,
  maxOutputChars: number
): boolean {
  return prompt.trim().length > maxOutputChars;
}

export function shouldOptimizeProductReferenceStoryboardPromptForTest(
  prompt: string,
  maxOutputChars: number
): boolean {
  return shouldOptimizeProductReferenceStoryboardPrompt(prompt, maxOutputChars);
}

function resolveProductReferenceStoryboardLlmMaxTokens(
  promptLengthPlan: PromptLengthPlan | null
): number {
  return Math.max(
    promptLengthPlan?.maxTokens ?? PRODUCT_REFERENCE_STORYBOARD_MIN_COMPLETION_TOKENS,
    PRODUCT_REFERENCE_STORYBOARD_MIN_COMPLETION_TOKENS
  );
}

export function resolveProductReferenceStoryboardLlmMaxTokensForTest(
  maxOutputChars: number,
  languageHint?: unknown
): {
  promptLengthPlan: PromptLengthPlan | null;
  llmMaxTokens: number;
} {
  const promptLengthPlan = buildPromptLengthPlan(maxOutputChars, languageHint) ?? null;
  return {
    promptLengthPlan,
    llmMaxTokens: resolveProductReferenceStoryboardLlmMaxTokens(promptLengthPlan),
  };
}

function buildVisionMessages(input: {
  systemPrompt: string;
  userPrompt: string;
  referenceImages: string[];
}): Message[] {
  const userContent: Message["content"] = [
    {
      type: "text",
      text: input.userPrompt,
    },
    ...input.referenceImages.map(url => ({
      type: "image_url" as const,
      image_url: {
        url,
        detail: "high" as const,
      },
    })),
  ];
  return [
    {
      role: "system",
      content: input.systemPrompt,
    },
    {
      role: "user",
      content: userContent,
    },
  ];
}

export async function optimizeProductReferenceStoryboardPrompt(input: {
  tenantId: string;
  userId: number;
  sourcePrompt: string;
  originSurface?:
    | "unknown"
    | "chat"
    | "media_studio"
    | "marketplace_capture"
    | "media_production"
    | "media_studio_production"
    | "media_studio_video_shot"
    | "storyboard_review"
    | null;
  runId?: string | null;
  unitId?: string | null;
  attempt?: number | null;
  promptAttempt?: number | null;
  model?: string | null;
  maxOutputChars: number;
}): Promise<{
  execution: Awaited<ReturnType<typeof executeSharedSkillTextRuntime>>;
  value: SharedSkillRuntimeTextResult;
  preferredTargetChars: number;
  llmMaxTokens: number;
  promptLengthPlan: PromptLengthPlan | null;
  systemPromptLengthChars: number;
  userPromptLengthChars: number;
}> {
  const synced = await syncSingleSkillIfChanged(
    PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID
  );
  if (synced.error) {
    throw new Error(
      `product-reference-storyboard prompt optimizer skill sync failed: ${synced.error}`
    );
  }
  const optimizerSkill = await getSkillByIdAsync(
    PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID
  );
  if (!optimizerSkill) {
    throw new Error(
      "product-reference-storyboard prompt optimizer skill not found or not enabled"
    );
  }

  const preferredTargetChars = Math.min(
    input.maxOutputChars,
    PRODUCT_REFERENCE_STORYBOARD_PROMPT_PREFERRED_CHARS
  );
  const optimizerInputs = sanitizeUserInputs({
    ...loadSkillInputDefaults(optimizerSkill),
    source_prompt: input.sourcePrompt,
    target_max_chars: input.maxOutputChars,
    preferred_target_chars: preferredTargetChars,
    preserve_storyboard_contract: true,
    optimization_strength: "auto",
  });
  const promptLengthPlan = buildPromptLengthPlan(
    input.maxOutputChars,
    resolvePromptLanguageHintFromInputs(optimizerInputs)
  );
  const systemPrompt = [
    loadPromptTemplate(optimizerSkill),
    promptLengthPlan?.directive,
    "## Product Reference Storyboard Optimizer Runtime Contract",
    `Return only the optimized image-generation prompt text at or below ${input.maxOutputChars} characters.`,
    "Preserve complete Frame 1 through Frame 9 with non-empty visual-only frame prose.",
    "Use one shared CAMERA/LIGHT/DEPTH: block and one shared PRODUCT VERIFY: block. Do not repeat those blocks in every frame.",
    "Remove VISUAL:, STORY MATCH:, HUMAN REALISM:, quoted voiceover lines, timecodes, subtitles, captions, and any frame labels likely to render as visible text.",
    "Never return JSON, markdown fences, analysis, character counts, or a partial prompt.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = buildCustomSkillUserPrompt(optimizerInputs, {
    referenceImageCount: 0,
  });
  const policy = await resolveSkillExecutionPolicy({
    skill: optimizerSkill,
    conversationModel: input.model ?? null,
  });
  if (!policy.modelId) {
    throw new Error(
      "product-reference-storyboard prompt optimizer has no enabled LLM model"
    );
  }
  const provider = await getProviderForModel(policy.modelId, {
    preferredProviderId: policy.preferredProviderId,
    strictProviderPin: policy.strictProviderPin,
    allowFreeModels: policy.allowFreeModels,
  });
  if (!provider) {
    throw new Error(
      `No provider available for product-reference-storyboard prompt optimizer model ${policy.modelId}`
    );
  }
  const llmMaxTokens = resolveProductReferenceStoryboardLlmMaxTokens(
    promptLengthPlan
  );

  const execution = await executeSharedSkillTextRuntime({
    tenantId: input.tenantId,
    userId: input.userId,
    objective:
      "Optimize an over-length product-reference-storyboard image prompt before image generation.",
    originSurface: input.originSurface ?? "marketplace_capture",
    entryPoint: "execute_custom_skill",
    modelConfig: buildRuntimeModelConfig({
      modelId: policy.modelId,
      providerId: provider.providerId,
      resolvedGatewayModelId: policy.modelId,
    }),
    skillSlugs: [PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID],
    systemPrompt,
    userPrompt,
    planContext: {
      caller: input.originSurface ?? "marketplace_capture",
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      promptAttempt: input.promptAttempt ?? null,
      requiredSkill: PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
      selectedSkill: PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
      sourceSkill: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      sourcePromptLengthChars: input.sourcePrompt.length,
      maxOutputChars: input.maxOutputChars,
      preferredTargetChars,
      promptLengthPlan,
      llmMaxTokens,
    },
    dynamicParams: optimizerInputs,
    referenceImages: [],
    requestLabel: "marketplace-auto-review-product-reference-storyboard-prompt-optimizer",
    runId: input.runId ?? undefined,
    schemaHint: {
      name: "product_reference_storyboard_optimized_prompt_text_output",
      validationMode: "text_output",
    },
    legacyExecute: async () => {
      const llmResult = await executeWithFallback({
        model: policy.modelId!,
        messages: buildVisionMessages({
          systemPrompt,
          userPrompt,
          referenceImages: [],
        }),
        stream: false,
        userId: input.userId,
        preferredProvider: policy.preferredProviderId,
        strictProviderPin: policy.strictProviderPin,
        maxTokens: llmMaxTokens,
        temperature: 0.25,
        disableProviderFallbacks: true,
        allowFreeModels: policy.allowFreeModels,
      });
      if (llmResult.type !== "success") {
        const errorMessage =
          llmResult.type === "error"
            ? llmResult.error
            : `provider fallback required from ${llmResult.from.providerName} to ${llmResult.to.providerName}, but provider fallback is disabled`;
        throw new Error(
          `product-reference-storyboard prompt optimizer LLM call failed: ${errorMessage}`
        );
      }
      const rawContent = extractLlmContent(llmResult.response);
      if (!rawContent) {
        throw new Error(
          "product-reference-storyboard prompt optimizer returned empty output"
        );
      }
      const usage = {
        promptTokens: Number(llmResult.response?.usage?.prompt_tokens ?? 0),
        completionTokens: Number(
          llmResult.response?.usage?.completion_tokens ?? 0
        ),
      };
      const creditsUsed = calculateCreditsForLLM(
        usage.promptTokens,
        usage.completionTokens,
        policy.modelId!
      );
      await deductCredits({
        userId: input.userId,
        tenantId: input.tenantId,
        amount: creditsUsed,
        description:
          "Marketplace Auto Review prompt skill: product-reference-storyboard-prompt-optimizer",
        idempotencyKey: [
          "marketplace-auto-review",
          "prompt-skill",
          PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
          input.runId ?? "no-run",
          input.unitId ?? "no-unit",
          input.attempt ?? "no-attempt",
          input.promptAttempt ?? "no-prompt-attempt",
        ].join(":"),
        skillSlug: PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
        sourceType: "skill",
        metadata: {
          skill: PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
          skillName: optimizerSkill.name,
          sourceSkill: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
          runtimeKind: "llm",
          originSurface: "marketplace_capture",
          entryPoint: "marketplace_auto_review_stage_prompt_optimizer",
          model: policy.modelId ?? undefined,
          provider: llmResult.providerName,
          tokensUsed: usage.promptTokens + usage.completionTokens,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          sourcePromptLengthChars: input.sourcePrompt.length,
          optimizedPromptLengthChars: rawContent.trim().length,
          maxOutputChars: input.maxOutputChars,
          preferredTargetChars,
          promptLengthPlan,
          runId: input.runId ?? null,
          unitId: input.unitId ?? null,
          attempt: input.attempt ?? null,
          promptAttempt: input.promptAttempt ?? null,
        },
      });
      return {
        rawContent,
        usage,
        creditsUsed,
        providerName: llmResult.providerName,
        modelId: policy.modelId,
        rawResponse: llmResult.response,
      };
    },
  });

  return {
    execution,
    value: execution.value,
    preferredTargetChars,
    llmMaxTokens,
    promptLengthPlan,
    systemPromptLengthChars: systemPrompt.length,
    userPromptLengthChars: userPrompt.length,
  };
}

export async function runProductReferenceStoryboardPromptSkill(input: {
  tenantId: string;
  userId: number;
  userInputs: Record<string, unknown>;
  referenceImages: string[];
  runId?: string | null;
  unitId?: string | null;
  attempt?: number | null;
  promptAttempt?: number | null;
  model?: string | null;
  maxOutputChars?: number | null;
  publicUrl?: string | null;
  originSurface?: "marketplace_capture" | "media_studio" | null;
}): Promise<ProductReferenceStoryboardPromptSkillRunResult> {
  const maxOutputChars =
    input.maxOutputChars && input.maxOutputChars > 0
      ? Math.floor(input.maxOutputChars)
      : PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS;
  const synced = await syncSingleSkillIfChanged(
    PRODUCT_REFERENCE_STORYBOARD_SKILL_ID
  );
  if (synced.error) {
    throw new Error(
      `product-reference-storyboard skill sync failed: ${synced.error}`
    );
  }
  const skill = await getSkillByIdAsync(PRODUCT_REFERENCE_STORYBOARD_SKILL_ID);
  if (!skill) {
    throw new Error(
      "product-reference-storyboard skill not found or not enabled"
    );
  }

  const mergedUserInputs = sanitizeUserInputs(
    normalizeProductReferenceStoryboardInputReferenceUrls(
      normalizeProductReferenceStoryboardSkillInputs(
        loadSkillInputDefaults(skill),
        input.userInputs,
        maxOutputChars
      ),
      input.publicUrl
    )
  );
  const referenceImages = uniqueInputStrings([
    ...normalizeProductReferenceStoryboardReferenceUrls(
      input.referenceImages,
      input.publicUrl
    ),
    ...inputStringArray(mergedUserInputs.reference_product_images),
    ...inputStringArray(mergedUserInputs.reference_character_images),
    ...inputStringArray(mergedUserInputs.reference_environment_images),
  ]);
  const inputSchema = loadSkillInputSchema(skill);
  const schemaAudit = buildSkillInputSchemaAudit({
    schema: inputSchema,
    userInputs: mergedUserInputs,
    referenceImages,
  });
  if (schemaAudit.status === "failed") {
    console.error(
      "[productReferenceStoryboardSkillRunner] input_schema_validation_failed",
      {
        skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        runId: input.runId ?? null,
        unitId: input.unitId ?? null,
        attempt: input.attempt ?? null,
        promptAttempt: input.promptAttempt ?? null,
        schemaAudit,
        fallbackUsed: false,
        providerSubmitBlockedBeforeCredit: true,
      }
    );
    throw new Error(
      [
        "product-reference-storyboard input schema validation failed",
        `schema=${schemaAudit.schemaPath ?? "missing"}`,
        `blockers=${schemaAudit.blockers.join(", ") || "none"}`,
        `product_category=${schemaAudit.productCategory || "empty"}`,
        `layout=${schemaAudit.layoutPreset || "empty"}`,
        `aspect=${schemaAudit.aspectRatio || "empty"}`,
        `reference_counts=${JSON.stringify(
          schemaAudit.referenceImageRoleCounts
        )}`,
      ].join(": ")
    );
  }
  const systemPromptBuild = buildSkillRuntimeSystemPrompt({
    skill,
    userInputs: mergedUserInputs,
    maxOutputChars,
  });
  if (systemPromptBuild.categoryRuleAudit.status !== "appended") {
    console.error(
      "[productReferenceStoryboardSkillRunner] category_rule_validation_failed",
      {
        skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        runId: input.runId ?? null,
        unitId: input.unitId ?? null,
        attempt: input.attempt ?? null,
        promptAttempt: input.promptAttempt ?? null,
        categoryRuleAudit: systemPromptBuild.categoryRuleAudit,
        fallbackUsed: false,
        providerSubmitBlockedBeforeCredit: true,
      }
    );
    throw new Error(
      [
        "product-reference-storyboard category rule validation failed",
        `status=${systemPromptBuild.categoryRuleAudit.status}`,
        `category=${systemPromptBuild.categoryRuleAudit.category ?? "empty"}`,
        `error=${systemPromptBuild.categoryRuleAudit.error ?? "none"}`,
      ].join(": ")
    );
  }
  const systemPrompt = systemPromptBuild.systemPrompt;
  if (!systemPrompt.trim()) {
    throw new Error(
      "product-reference-storyboard skill has no executable prompt content"
    );
  }
  const userPrompt = buildCustomSkillUserPrompt(mergedUserInputs, {
    referenceImageCount: referenceImages.length,
  });
  const policy = await resolveSkillExecutionPolicy({
    skill,
    conversationModel: input.model ?? null,
  });
  if (!policy.modelId) {
    throw new Error(
      "product-reference-storyboard skill has no enabled vision-capable LLM model"
    );
  }
  const provider = await getProviderForModel(policy.modelId, {
    preferredProviderId: policy.preferredProviderId,
    strictProviderPin: policy.strictProviderPin,
    allowFreeModels: policy.allowFreeModels,
  });
  if (!provider) {
    throw new Error(
      `No provider available for product-reference-storyboard model ${policy.modelId}`
    );
  }
  const promptLengthPlan = systemPromptBuild.promptLengthPlan;
  const llmMaxTokens =
    resolveProductReferenceStoryboardLlmMaxTokens(promptLengthPlan);

  console.info("[productReferenceStoryboardSkillRunner] dispatch", {
    skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
    runId: input.runId ?? null,
    unitId: input.unitId ?? null,
    attempt: input.attempt ?? null,
    promptAttempt: input.promptAttempt ?? null,
    modelId: policy.modelId,
    modelSource: policy.modelSource,
    providerId: provider.providerId,
    providerName: provider.providerName,
    referenceImageCount: referenceImages.length,
    referenceProductImageCount: Array.isArray(
      mergedUserInputs.reference_product_images
    )
      ? mergedUserInputs.reference_product_images.length
      : 0,
    referenceCharacterImageCount: Array.isArray(
      mergedUserInputs.reference_character_images
    )
      ? mergedUserInputs.reference_character_images.length
      : 0,
    referenceEnvironmentImageCount: Array.isArray(
      mergedUserInputs.reference_environment_images
    )
      ? mergedUserInputs.reference_environment_images.length
      : 0,
    maxOutputChars,
    promptLengthPlan,
    llmMaxTokens,
    systemPromptLengthChars: systemPrompt.length,
    userPromptLengthChars: userPrompt.length,
    inputKeys: Object.keys(mergedUserInputs).sort(),
    layoutPreset: mergedUserInputs.storyboard_layout_preset,
    generationMode: mergedUserInputs.generation_mode,
    aspectRatio: mergedUserInputs.aspect_ratio,
    productCategory: mergedUserInputs.product_category,
    marketplacePlatform: mergedUserInputs.marketplace_platform,
    categoryRuleAudit: systemPromptBuild.categoryRuleAudit,
    schemaAudit,
    fallbackPolicy: "disabled_fail_fast",
  });

  const execution = await executeSharedSkillTextRuntime({
    tenantId: input.tenantId,
    userId: input.userId,
    objective:
      "Generate a product-reference-storyboard image prompt for Marketplace Auto Review.",
    originSurface: "marketplace_capture",
    entryPoint: "marketplace_auto_review_stage",
    modelConfig: buildRuntimeModelConfig({
      modelId: policy.modelId,
      providerId: provider.providerId,
      resolvedGatewayModelId: policy.modelId,
    }),
    skillSlugs: [PRODUCT_REFERENCE_STORYBOARD_SKILL_ID],
    systemPrompt,
    userPrompt,
    planContext: {
      caller: "marketplace_auto_review",
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      promptAttempt: input.promptAttempt ?? null,
      requiredSkill: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      selectedSkill: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      hardcodedPromptBuilder: false,
      fallbackUsed: false,
      fallbackPolicy: "error",
      maxOutputChars,
      layoutPreset: mergedUserInputs.storyboard_layout_preset,
      generationMode: mergedUserInputs.generation_mode,
      aspectRatio: mergedUserInputs.aspect_ratio,
      referenceImageCount: referenceImages.length,
      referenceProductImageCount: Array.isArray(
        mergedUserInputs.reference_product_images
      )
        ? mergedUserInputs.reference_product_images.length
        : 0,
      referenceCharacterImageCount: Array.isArray(
        mergedUserInputs.reference_character_images
      )
        ? mergedUserInputs.reference_character_images.length
        : 0,
      referenceEnvironmentImageCount: Array.isArray(
        mergedUserInputs.reference_environment_images
      )
        ? mergedUserInputs.reference_environment_images.length
        : 0,
      productCategory: mergedUserInputs.product_category,
      marketplacePlatform: mergedUserInputs.marketplace_platform,
      categoryRuleAudit: systemPromptBuild.categoryRuleAudit,
      promptLengthPlan,
      llmMaxTokens,
      systemPromptLengthChars: systemPrompt.length,
      userPromptLengthChars: userPrompt.length,
      schemaAudit,
    },
    dynamicParams: mergedUserInputs,
    referenceImages,
    publicUrl: input.publicUrl ?? null,
    requestLabel: "marketplace-auto-review-product-reference-storyboard",
    runId: input.runId ?? undefined,
    schemaHint: {
      name: "product_reference_storyboard_prompt_text_output",
      validationMode: "text_output",
    },
    legacyExecute: async () => {
      const llmResult = await executeWithFallback({
        model: policy.modelId!,
        messages: buildVisionMessages({
          systemPrompt,
          userPrompt,
          referenceImages,
        }),
        stream: false,
        userId: input.userId,
        preferredProvider: policy.preferredProviderId,
        strictProviderPin: policy.strictProviderPin,
        maxTokens: llmMaxTokens,
        temperature: 0.45,
        disableProviderFallbacks: true,
        allowFreeModels: policy.allowFreeModels,
      });
      if (llmResult.type !== "success") {
        const errorMessage =
          llmResult.type === "error"
            ? llmResult.error
            : `provider fallback required from ${llmResult.from.providerName} to ${llmResult.to.providerName}, but provider fallback is disabled`;
        throw new Error(
          `product-reference-storyboard LLM call failed: ${errorMessage}`
        );
      }
      const rawContent = extractLlmContent(llmResult.response);
      if (!rawContent) {
        throw new Error("product-reference-storyboard returned empty output");
      }
      const finishReason = extractLlmFinishReason(llmResult.response);
      const usage = {
        promptTokens: Number(llmResult.response?.usage?.prompt_tokens ?? 0),
        completionTokens: Number(
          llmResult.response?.usage?.completion_tokens ?? 0
        ),
      };
      const fullOutputLogPath = appendProductReferenceStoryboardFullOutputLog({
        loggedAt: new Date().toISOString(),
        skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        runId: input.runId ?? null,
        unitId: input.unitId ?? null,
        attempt: input.attempt ?? null,
        promptAttempt: input.promptAttempt ?? null,
        modelId: policy.modelId,
        providerName: llmResult.providerName,
        finishReason,
        usage,
        maxOutputChars,
        rawOutputLengthChars: rawContent.length,
        trimmedOutputLengthChars: rawContent.trim().length,
        outputExceededMaxChars: rawContent.length > maxOutputChars,
        promptLengthPlan,
        layoutPreset: mergedUserInputs.storyboard_layout_preset,
        generationMode: mergedUserInputs.generation_mode,
        aspectRatio: mergedUserInputs.aspect_ratio,
        productCategory: mergedUserInputs.product_category,
        marketplacePlatform: mergedUserInputs.marketplace_platform,
        rawOutput: rawContent,
      });
      console.info(
        "[productReferenceStoryboardSkillRunner] full_output_logged",
        {
          skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
          runId: input.runId ?? null,
          unitId: input.unitId ?? null,
          attempt: input.attempt ?? null,
          promptAttempt: input.promptAttempt ?? null,
          rawOutputLengthChars: rawContent.length,
          trimmedOutputLengthChars: rawContent.trim().length,
          maxOutputChars,
          outputExceededMaxChars: rawContent.length > maxOutputChars,
          logPath: fullOutputLogPath,
        }
      );
      const creditsUsed = calculateCreditsForLLM(
        usage.promptTokens,
        usage.completionTokens,
        policy.modelId!
      );
      await deductCredits({
        userId: input.userId,
        tenantId: input.tenantId,
        amount: creditsUsed,
        description:
          "Marketplace Auto Review prompt skill: product-reference-storyboard",
        idempotencyKey: [
          "marketplace-auto-review",
          "prompt-skill",
          PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
          input.runId ?? "no-run",
          input.unitId ?? "no-unit",
          input.attempt ?? "no-attempt",
          input.promptAttempt ?? "no-prompt-attempt",
        ].join(":"),
        skillSlug: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        sourceType: "skill",
        metadata: {
          skill: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
          skillName: skill.name,
          runtimeKind: "llm",
          originSurface: "marketplace_capture",
          entryPoint: "marketplace_auto_review_stage",
          model: policy.modelId ?? undefined,
          provider: llmResult.providerName,
          tokensUsed: usage.promptTokens + usage.completionTokens,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          referenceImageCount: referenceImages.length,
          maxOutputChars,
          llmMaxTokens,
          llmFinishReason: finishReason,
          rawOutputLengthChars: rawContent.length,
          rawOutputPreview: rawContent.slice(
            0,
            PRODUCT_REFERENCE_STORYBOARD_OUTPUT_AUDIT_PREVIEW_CHARS
          ),
          promptLengthPlan,
          categoryRuleAudit: systemPromptBuild.categoryRuleAudit,
          runId: input.runId ?? null,
          unitId: input.unitId ?? null,
          attempt: input.attempt ?? null,
          promptAttempt: input.promptAttempt ?? null,
          schemaAudit,
          fallbackUsed: false,
        },
      });
      console.info("[productReferenceStoryboardSkillRunner] llm_response", {
        skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        runId: input.runId ?? null,
        unitId: input.unitId ?? null,
        attempt: input.attempt ?? null,
        promptAttempt: input.promptAttempt ?? null,
        modelId: policy.modelId,
        providerName: llmResult.providerName,
        llmMaxTokens,
        finishReason,
        usage,
        rawOutputLengthChars: rawContent.length,
        maxOutputChars,
        rawOutputPreview: rawContent.slice(
          0,
          PRODUCT_REFERENCE_STORYBOARD_OUTPUT_AUDIT_PREVIEW_CHARS
        ),
      });
      return {
        rawContent,
        usage,
        creditsUsed,
        providerName: llmResult.providerName,
        modelId: policy.modelId,
        rawResponse: llmResult.response,
        fullOutputLogPath,
      };
    },
  });

  const executionValue = execution.value as typeof execution.value & {
    fullOutputLogPath?: string | null;
  };
  const usageValue = (executionValue.usage ?? {}) as unknown as Record<
    string,
    unknown
  >;
  const executionUsage = {
    promptTokens: Number(
      usageValue.promptTokens ?? usageValue.prompt_tokens ?? 0
    ),
    completionTokens: Number(
      usageValue.completionTokens ?? usageValue.completion_tokens ?? 0
    ),
  };
  let fullOutputLogPath = executionValue.fullOutputLogPath ?? null;
  const finishReason = extractLlmFinishReason(executionValue.rawResponse);
  if (!fullOutputLogPath) {
    fullOutputLogPath = appendProductReferenceStoryboardFullOutputLog({
      loggedAt: new Date().toISOString(),
      skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      promptAttempt: input.promptAttempt ?? null,
      modelId: executionValue.modelId,
      providerName: executionValue.providerName,
      finishReason,
      usage: executionUsage,
      maxOutputChars,
      rawOutputLengthChars: executionValue.rawContent.length,
      trimmedOutputLengthChars: executionValue.rawContent.trim().length,
      outputExceededMaxChars: executionValue.rawContent.length > maxOutputChars,
      promptLengthPlan,
      layoutPreset: mergedUserInputs.storyboard_layout_preset,
      generationMode: mergedUserInputs.generation_mode,
      aspectRatio: mergedUserInputs.aspect_ratio,
      productCategory: mergedUserInputs.product_category,
      marketplacePlatform: mergedUserInputs.marketplace_platform,
      rawOutput: executionValue.rawContent,
    });
    console.info(
      "[productReferenceStoryboardSkillRunner] full_output_logged",
      {
        skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        runId: input.runId ?? null,
        unitId: input.unitId ?? null,
        attempt: input.attempt ?? null,
        promptAttempt: input.promptAttempt ?? null,
        rawOutputLengthChars: executionValue.rawContent.length,
        trimmedOutputLengthChars: executionValue.rawContent.trim().length,
        maxOutputChars,
        outputExceededMaxChars:
          executionValue.rawContent.length > maxOutputChars,
        logPath: fullOutputLogPath,
        runtimeEngine: execution.runtime.selection.engine,
        runtimeMode: execution.runtime.selection.mode,
      }
    );
  }
  const originalRawOutput = executionValue.rawContent.trim();
  let rawOutput = stripRenderableStoryboardFrameLabels(originalRawOutput);
  let finalUsage = execution.value.usage;
  let finalCreditsUsed = execution.value.creditsUsed;
  let finalModelId = execution.value.modelId;
  let finalProviderName = execution.value.providerName;
  let finalRuntime = execution.runtime;
  let promptOptimizerAudit: Record<string, unknown> = {
    used: false,
    skillId: PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
    sourcePromptLengthChars: originalRawOutput.length,
    optimizedPromptLengthChars: null,
    maxOutputChars,
  };
  if (
    shouldOptimizeProductReferenceStoryboardPrompt(
      originalRawOutput,
      maxOutputChars
    )
  ) {
    console.info("[productReferenceStoryboardSkillRunner] optimizer_dispatch", {
      skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      optimizerSkillId: PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      promptAttempt: input.promptAttempt ?? null,
      sourcePromptLengthChars: originalRawOutput.length,
      maxOutputChars,
    });
    const optimizerResult = await optimizeProductReferenceStoryboardPrompt({
      tenantId: input.tenantId,
      userId: input.userId,
      sourcePrompt: originalRawOutput,
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      promptAttempt: input.promptAttempt ?? null,
      model: input.model ?? null,
      maxOutputChars,
    });
    rawOutput = stripRenderableStoryboardFrameLabels(
      optimizerResult.value.rawContent.trim()
    );
    finalUsage = {
      promptTokens:
        Number(execution.value.usage?.promptTokens ?? 0) +
        Number(optimizerResult.value.usage?.promptTokens ?? 0),
      completionTokens:
        Number(execution.value.usage?.completionTokens ?? 0) +
        Number(optimizerResult.value.usage?.completionTokens ?? 0),
    };
    finalCreditsUsed =
      Number(execution.value.creditsUsed ?? 0) +
      Number(optimizerResult.value.creditsUsed ?? 0);
    finalModelId = execution.value.modelId;
    finalProviderName = execution.value.providerName;
    finalRuntime = execution.runtime;
    promptOptimizerAudit = {
      used: true,
      skillId: PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
      runtimeStatus: optimizerResult.execution.runtime.status,
      runtimeEngine: optimizerResult.execution.runtime.selection.engine,
      runtimeMode: optimizerResult.execution.runtime.selection.mode,
      requestId: optimizerResult.execution.runtime.requestId,
      traceId: optimizerResult.execution.runtime.traceId,
      sourcePromptLengthChars: originalRawOutput.length,
      optimizedPromptLengthChars: rawOutput.length,
      maxOutputChars,
      preferredTargetChars: optimizerResult.preferredTargetChars,
      promptLengthPlan: optimizerResult.promptLengthPlan,
      llmMaxTokens: optimizerResult.llmMaxTokens,
      modelId: optimizerResult.value.modelId,
      providerName: optimizerResult.value.providerName,
      systemPromptLengthChars: optimizerResult.systemPromptLengthChars,
      userPromptLengthChars: optimizerResult.userPromptLengthChars,
      outputPreview: rawOutput.slice(
        0,
        PRODUCT_REFERENCE_STORYBOARD_OUTPUT_AUDIT_PREVIEW_CHARS
      ),
    };
    console.info("[productReferenceStoryboardSkillRunner] optimizer_completed", {
      skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      optimizerSkillId: PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      promptAttempt: input.promptAttempt ?? null,
      sourcePromptLengthChars: originalRawOutput.length,
      optimizedPromptLengthChars: rawOutput.length,
      maxOutputChars,
      runtimeStatus: optimizerResult.execution.runtime.status,
    });
  }
  const contractRestore =
    restoreProductReferenceStoryboardMandatoryContract({
      prompt: rawOutput,
      userInputs: mergedUserInputs,
      maxOutputChars,
    });
  if (contractRestore.applied) {
    rawOutput = contractRestore.prompt;
    console.info(
      "[productReferenceStoryboardSkillRunner] mandatory_contract_restored",
      {
        skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        runId: input.runId ?? null,
        unitId: input.unitId ?? null,
        attempt: input.attempt ?? null,
        promptAttempt: input.promptAttempt ?? null,
        restoredCodes: contractRestore.restoredCodes,
        outputLengthChars: rawOutput.length,
        fallbackUsed: false,
      }
    );
  }
  if (rawOutput.length > maxOutputChars) {
    throw new ProductReferenceStoryboardSkillOutputLimitError({
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      promptAttempt: input.promptAttempt ?? null,
      maxOutputChars,
      rawOutput,
      fullOutputLogPath,
      promptLengthPlan,
      modelId: finalModelId,
      providerName: finalProviderName,
      finishReason,
    });
  }
  if (/^ERROR:/i.test(rawOutput)) {
    throw new Error(rawOutput);
  }
  const completenessWarnings =
    validateProductReferenceStoryboardOutputCompleteness(
      rawOutput,
      mergedUserInputs.storyboard_layout_preset,
      mergedUserInputs.image_text_mode
    );
  if (completenessWarnings.length > 0) {
    console.warn("[productReferenceStoryboardSkillRunner] output_contract_warning", {
      skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      promptAttempt: input.promptAttempt ?? null,
      warnings: completenessWarnings,
      outputLengthChars: rawOutput.length,
      fullOutputLogPath,
    });
    const fatalWarnings = completenessWarnings.filter(
      productReferenceStoryboardOutputCodeIsFatal
    );
    if (fatalWarnings.length > 0) {
      throw new ProductReferenceStoryboardSkillIncompleteOutputError({
        runId: input.runId ?? null,
        unitId: input.unitId ?? null,
        attempt: input.attempt ?? null,
        promptAttempt: input.promptAttempt ?? null,
        maxOutputChars,
        rawOutput,
        fullOutputLogPath,
        promptLengthPlan,
        modelId: finalModelId,
        providerName: finalProviderName,
        finishReason,
        blockers: fatalWarnings,
      });
    }
  }

  const skillAudit = {
    selectedSkill: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
    skillName: skill.name,
    runtimeStatus: execution.runtime.status,
    runtimeEngine: execution.runtime.selection.engine,
    runtimeMode: execution.runtime.selection.mode,
    requestId: execution.runtime.requestId,
    traceId: execution.runtime.traceId,
    promptLengthPlan,
    llmMaxTokens,
    llmFinishReason: extractLlmFinishReason(execution.value.rawResponse),
    modelId: execution.value.modelId,
    providerName: execution.value.providerName,
    fullOutputLogPath,
    maxOutputChars,
    outputLengthChars: rawOutput.length,
    originalOutputLengthChars: originalRawOutput.length,
    systemPromptLengthChars: systemPrompt.length,
    userPromptLengthChars: userPrompt.length,
    outputPreview: rawOutput.slice(
      0,
      PRODUCT_REFERENCE_STORYBOARD_OUTPUT_AUDIT_PREVIEW_CHARS
    ),
    referenceImageCount: referenceImages.length,
    referenceProductImageCount: Array.isArray(
      mergedUserInputs.reference_product_images
    )
      ? mergedUserInputs.reference_product_images.length
      : 0,
    referenceCharacterImageCount: Array.isArray(
      mergedUserInputs.reference_character_images
    )
      ? mergedUserInputs.reference_character_images.length
      : 0,
    referenceEnvironmentImageCount: Array.isArray(
      mergedUserInputs.reference_environment_images
    )
      ? mergedUserInputs.reference_environment_images.length
      : 0,
    fallbackUsed: false,
    generationMode: mergedUserInputs.generation_mode,
    layoutPreset: mergedUserInputs.storyboard_layout_preset,
    aspectRatio: mergedUserInputs.aspect_ratio,
    productCategory: mergedUserInputs.product_category,
    marketplacePlatform: mergedUserInputs.marketplace_platform,
    categoryRuleAudit: systemPromptBuild.categoryRuleAudit,
    promptAttempt: input.promptAttempt ?? null,
    schemaAudit,
    completenessWarnings,
    completenessStatus:
      completenessWarnings.length === 0 ? "passed" : "warning",
    mandatoryContractRestore: contractRestore.applied
      ? {
          applied: true,
          restoredCodes: contractRestore.restoredCodes,
          fallbackUsed: false,
        }
      : {
          applied: false,
          restoredCodes: [],
          fallbackUsed: false,
        },
    layoutContract: schemaAudit.layoutContract,
    promptOptimizer: promptOptimizerAudit,
    inputKeys: Object.keys(mergedUserInputs).sort(),
  };
  console.info("[productReferenceStoryboardSkillRunner] completed", {
    skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
    runId: input.runId ?? null,
    unitId: input.unitId ?? null,
    attempt: input.attempt ?? null,
    promptAttempt: input.promptAttempt ?? null,
    outputLengthChars: rawOutput.length,
    originalOutputLengthChars: originalRawOutput.length,
    maxOutputChars,
    runtimeStatus: execution.runtime.status,
    modelId: execution.value.modelId,
    providerName: execution.value.providerName,
    llmMaxTokens,
    llmFinishReason: extractLlmFinishReason(execution.value.rawResponse),
    promptLengthPlan,
    promptOptimizer: promptOptimizerAudit,
    categoryRuleAudit: systemPromptBuild.categoryRuleAudit,
    schemaAudit,
    completenessWarnings,
  });

  return {
    prompt: rawOutput,
    rawOutput,
    usage: finalUsage,
    creditsUsed: finalCreditsUsed,
    modelId: finalModelId,
    providerName: finalProviderName,
    runtime: finalRuntime,
    skillAudit,
  };
}

export function normalizeProductReferenceStoryboardReferenceUrlsForTest(input: {
  values: unknown;
  publicUrl?: string | null;
}): string[] {
  return normalizeProductReferenceStoryboardReferenceUrls(
    input.values,
    input.publicUrl
  );
}

export function normalizeProductReferenceStoryboardUserInputsReferenceUrlsForTest(
  input: {
    userInputs: Record<string, unknown>;
    publicUrl?: string | null;
  }
): Record<string, unknown> {
  return normalizeProductReferenceStoryboardInputReferenceUrls(
    input.userInputs,
    input.publicUrl
  );
}
