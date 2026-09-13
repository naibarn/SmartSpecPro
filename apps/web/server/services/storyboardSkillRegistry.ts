import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  StoryboardCanonicalSkillResponse,
  StoryboardSkillSnapshot,
} from "./storyboardSkillFrameworkContracts";
import { assertCanonicalGenerationRequest } from "./storyboardSkillFrameworkContracts";

type JsonObject = Record<string, unknown>;

export type StoryboardCompatibleSkill = StoryboardSkillSnapshot & {
  aliases: string[];
  capabilities: {
    promptOnly: boolean;
    generateImage: boolean;
    maxReferenceImages: number;
    aspectRatios: string[];
  };
};

export type StoryboardModelCapability = {
  modelId: string;
  mediaType: "image" | "video";
  providerId?: string;
  qualityOptions: string[];
  maxReferenceImages?: number;
  aspectRatios?: string[];
};

const PARENT_OWNED_FIELDS = [
  "idea",
  "character_reference_images",
  "aspect_ratio",
  "story_type",
  "storyType",
  "title",
  "target_platform",
  "targetPlatform",
  "total_shots",
  "totalShots",
  "shot_duration_sec",
  "shotDurationSec",
  "image_model_selection",
  "imageModelSelection",
  "video_model_selection",
  "videoModelSelection",
  "language",
  "product_context",
  "productContext",
];

function readJson(filePath: string): JsonObject | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
  } catch {
    return null;
  }
}

function hashJson(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function candidateBundleDirs(root: string): string[] {
  const dirs = [root, path.join(root, "imported")];
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules")
        dirs.push(path.join(root, entry.name));
    }
  } catch {
    // Missing skills directory is handled as an empty registry.
  }
  return [...new Set(dirs)];
}

function resolveBundle(
  root: string,
  requestedId?: string
): {
  dir: string;
  meta: JsonObject;
  inputSchema: JsonObject;
  uiSchema: JsonObject;
} | null {
  for (const dir of candidateBundleDirs(root)) {
    const meta = readJson(path.join(dir, "skill.meta.json"));
    const inputSchema = readJson(
      path.join(dir, "schemas", "input.schema.json")
    );
    const uiSchema = readJson(path.join(dir, "schemas", "ui.schema.json"));
    if (!meta || !inputSchema || !uiSchema) continue;
    const metaId = typeof meta.skill_id === "string" ? meta.skill_id : "";
    const slug = path.basename(dir);
    const aliases = [
      metaId,
      slug,
      slug.replaceAll("-", "_"),
      path.basename(root),
      path.basename(root).replaceAll("-", "_"),
    ].filter(Boolean);
    if (!requestedId || aliases.includes(requestedId))
      return { dir, meta, inputSchema, uiSchema };
  }
  return null;
}

function isCompatibleMeta(meta: JsonObject): boolean {
  const supports = (
    meta.supports && typeof meta.supports === "object" ? meta.supports : {}
  ) as JsonObject;
  const category = String(meta.category ?? "");
  return (
    (category === "character_prompt_generation" ||
      meta.subcategory === "character_storyboard_source" ||
      meta.skill_id === "cute_child_image_generator") &&
    supports.prompt_only === true &&
    supports.single_prompt_output === true &&
    supports.storyboard_source_image_generation === true
  );
}

export function buildSkillSnapshot(input: {
  meta: JsonObject;
  inputSchema: JsonObject;
  uiSchema: JsonObject;
}): StoryboardSkillSnapshot {
  const properties =
    input.inputSchema.properties &&
    typeof input.inputSchema.properties === "object"
      ? (input.inputSchema.properties as JsonObject)
      : {};
  const parentOwnedFields = Object.keys(properties).filter(field =>
    PARENT_OWNED_FIELDS.includes(field)
  );
  const metaId = String(input.meta.skill_id ?? "").trim();
  if (
    !metaId ||
    !input.meta.version ||
    !input.inputSchema.type ||
    !input.uiSchema
  ) {
    throw new Error("Malformed storyboard skill bundle");
  }
  return {
    skillId: metaId,
    version: String(input.meta.version),
    displayName: String(input.meta.name ?? metaId),
    category: String(input.meta.category ?? "character_prompt_generation"),
    schemaHash: hashJson({ input: input.inputSchema, ui: input.uiSchema }),
    inputSchema: input.inputSchema,
    uiSchema: input.uiSchema,
    parentOwnedFields,
  };
}

export function listCompatibleStoryboardSkills(
  skillsRoot = path.resolve(process.cwd(), "skills")
): StoryboardCompatibleSkill[] {
  const result: StoryboardCompatibleSkill[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const bundle = resolveBundle(path.join(skillsRoot, entry.name));
    if (!bundle || !isCompatibleMeta(bundle.meta)) continue;
    try {
      const snapshot = buildSkillSnapshot(bundle);
      const supports = (bundle.meta.supports ?? {}) as JsonObject;
      result.push({
        ...snapshot,
        aliases: [
          entry.name,
          entry.name.replaceAll("-", "_"),
          snapshot.skillId,
        ].filter((v, i, a) => a.indexOf(v) === i),
        capabilities: {
          promptOnly: supports.prompt_only === true,
          generateImage: supports.generate_image === true,
          maxReferenceImages:
            typeof supports.reference_images_max === "number"
              ? supports.reference_images_max
              : 5,
          aspectRatios: ["9:16"],
        },
      });
    } catch {
      // Invalid bundles are intentionally not selectable.
    }
  }
  return result;
}

export function getStoryboardSkillSchema(
  skillId: string,
  skillsRoot = path.resolve(process.cwd(), "skills")
): StoryboardCompatibleSkill {
  let bundle: ReturnType<typeof resolveBundle> = null;
  try {
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      bundle = resolveBundle(path.join(skillsRoot, entry.name), skillId);
      if (bundle) break;
    }
  } catch {
    bundle = null;
  }
  if (!bundle || !isCompatibleMeta(bundle.meta))
    throw new Error("Storyboard skill is not compatible");
  const snapshot = buildSkillSnapshot(bundle);
  const supports = (bundle.meta.supports ?? {}) as JsonObject;
  return {
    ...snapshot,
    aliases: [
      path.basename(bundle.dir),
      snapshot.skillId,
      snapshot.skillId.replaceAll("_", "-"),
    ],
    capabilities: {
      promptOnly: supports.prompt_only === true,
      generateImage: supports.generate_image === true,
      maxReferenceImages:
        typeof supports.reference_images_max === "number"
          ? supports.reference_images_max
          : 5,
      aspectRatios: ["9:16"],
    },
  };
}

export function filterParentOwnedSkillFields(
  snapshot: StoryboardSkillSnapshot
): JsonObject {
  const properties =
    snapshot.inputSchema.properties &&
    typeof snapshot.inputSchema.properties === "object"
      ? (snapshot.inputSchema.properties as JsonObject)
      : {};
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) => !snapshot.parentOwnedFields.includes(key)
    )
  );
}

export function assertStoryboardSkillInputs(
  snapshot: StoryboardSkillSnapshot,
  values: Record<string, unknown>
): void {
  const properties =
    snapshot.inputSchema.properties &&
    typeof snapshot.inputSchema.properties === "object"
      ? (snapshot.inputSchema.properties as JsonObject)
      : {};
  const required = Array.isArray(snapshot.inputSchema.required)
    ? snapshot.inputSchema.required.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  for (const key of required) {
    if (values[key] === undefined || values[key] === null || values[key] === "")
      throw new Error(`Required skill input is missing: ${key}`);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    const schema = properties[key];
    if (!schema || typeof schema !== "object")
      throw new Error(`Unknown skill input: ${key}`);
    const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
    if (enumValues.length > 0 && !enumValues.includes(value))
      throw new Error(`Invalid value for skill input: ${key}`);
    const types = Array.isArray(schema.type)
      ? schema.type.filter((type): type is string => typeof type === "string")
      : typeof schema.type === "string"
        ? [schema.type]
        : [];
    const actualType = Array.isArray(value)
      ? "array"
      : typeof value === "number" && Number.isInteger(value)
        ? "integer"
        : typeof value;
    if (types.length > 0 && !types.includes(actualType))
      throw new Error(`Invalid type for skill input: ${key}`);
    if (
      actualType === "array" &&
      typeof schema.maxItems === "number" &&
      value.length > schema.maxItems
    )
      throw new Error(`Too many items for skill input: ${key}`);
    if (
      typeof value === "string" &&
      typeof schema.maxLength === "number" &&
      value.length > schema.maxLength
    )
      throw new Error(`Skill input is too long: ${key}`);
    if (
      typeof value === "number" &&
      typeof schema.minimum === "number" &&
      value < schema.minimum
    )
      throw new Error(`Skill input is below minimum: ${key}`);
    if (
      typeof value === "number" &&
      typeof schema.maximum === "number" &&
      value > schema.maximum
    )
      throw new Error(`Skill input is above maximum: ${key}`);
  }
}

export function normalizeModelCapability(input: {
  id: string;
  type: string;
  providerId?: string | null;
  configJson?: unknown;
}): StoryboardModelCapability {
  const config =
    input.configJson && typeof input.configJson === "object"
      ? (input.configJson as JsonObject)
      : {};
  const inputFields = Array.isArray(config.inputFields)
    ? (config.inputFields as JsonObject[])
    : [];
  const qualityField = inputFields.find(
    field => field.name === "quality" || field.key === "quality"
  );
  const options =
    qualityField && Array.isArray(qualityField.options)
      ? qualityField.options.filter(
          (option): option is string => typeof option === "string"
        )
      : [];
  if (input.type !== "image" && input.type !== "video")
    throw new Error("Unsupported storyboard media model type");
  return {
    modelId: input.id,
    mediaType: input.type,
    providerId: input.providerId ?? undefined,
    qualityOptions: options,
    maxReferenceImages:
      typeof config.maxReferenceImages === "number"
        ? config.maxReferenceImages
        : undefined,
    aspectRatios: Array.isArray(config.aspectRatios)
      ? config.aspectRatios.filter((v): v is string => typeof v === "string")
      : undefined,
  };
}

export function assertModelSelection(
  capability: StoryboardModelCapability,
  selection: { modelId: string; quality?: string; providerId?: string }
): void {
  if (capability.modelId !== selection.modelId)
    throw new Error("Selected model is unavailable");
  if (
    selection.quality &&
    !capability.qualityOptions.includes(selection.quality)
  )
    throw new Error("Selected quality is unavailable for this model");
  if (
    selection.providerId &&
    capability.providerId &&
    selection.providerId !== capability.providerId
  )
    throw new Error("Selected provider is unavailable");
  if (capability.aspectRatios && !capability.aspectRatios.includes("9:16"))
    throw new Error("Selected model does not support 9:16");
}

export function validateCanonicalSkillResponse(
  response: StoryboardCanonicalSkillResponse
): StoryboardCanonicalSkillResponse {
  return assertCanonicalGenerationRequest(response);
}
