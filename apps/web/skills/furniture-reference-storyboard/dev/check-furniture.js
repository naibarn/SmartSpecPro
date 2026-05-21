import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Self-contained paths relative to the skill folder
const skillDir = join(__dirname, "..");
const skillsDir = join(__dirname, "..", "..");

function safeSkillId(skillId) {
  const id = String(skillId);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return "default";
  return id;
}

function skillPaths(skillId) {
  const id = safeSkillId(skillId);
  const root = join(skillsDir, id);
  return {
    id,
    root,
    entrypoint: join(root, "python", "skill.py"),
    inputSchema: join(root, "schemas", "input.schema.json"),
    uiSchema: join(root, "schemas", "ui.schema.json"),
    skillJson: join(root, "skill.json"),
    skillMdUpper: join(root, "SKILL.md"),
    skillMdLower: join(root, "skill.md")
  };
}

async function readJsonFileDetailed(path) {
  try {
    const raw = await readFile(path, "utf8");
    return { ok: true, value: JSON.parse(raw), error: null };
  } catch (error) {
    return { ok: false, value: null, error };
  }
}

function skillIssue(level, code, message, file = "") {
  return { level, code, message, file };
}

function parseSkillMarkdown(markdown) {
  const nameMatch = markdown.match(/^name:\s*(.+)$/m);
  const descMatch = markdown.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch?.[1],
    description: descMatch?.[1]
  };
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function cleanMarkdown(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, "[code block omitted]")
    .slice(0, 12000);
}

async function inspectSkill(skillId) {
  const paths = skillPaths(skillId);
  const issues = [];
  const [inputResult, uiResult, skillJsonResult] = await Promise.all([
    readJsonFileDetailed(paths.inputSchema),
    readJsonFileDetailed(paths.uiSchema),
    readJsonFileDetailed(paths.skillJson)
  ]);
  let inputSchema = inputResult.value;
  let uiSchema = uiResult.value || {};
  let markdown = "";
  const skillMdPath = existsSync(paths.skillMdUpper) ? paths.skillMdUpper : paths.skillMdLower;
  const hasSkillMd = existsSync(skillMdPath);

  if (!inputResult.ok) {
    const reason = inputResult.error?.code === "ENOENT" ? "missing" : inputResult.error?.message || "invalid JSON";
    issues.push(skillIssue("error", "input_schema_unreadable", `Missing or invalid schemas/input.schema.json (${reason}).`, paths.inputSchema));
  } else if (!inputSchema || inputSchema.type !== "object" || !inputSchema.properties || typeof inputSchema.properties !== "object") {
    issues.push(skillIssue("error", "input_schema_shape", "schemas/input.schema.json must be a JSON object schema with a properties object.", paths.inputSchema));
  }

  if (!uiResult.ok) {
    if (uiResult.error?.code === "ENOENT") {
      issues.push(skillIssue("warning", "ui_schema_missing", "Missing schemas/ui.schema.json. The app can still build a fallback form from input.schema.json.", paths.uiSchema));
    } else {
      issues.push(skillIssue("warning", "ui_schema_invalid", `Invalid schemas/ui.schema.json (${uiResult.error?.message || "invalid JSON"}). The app will use a fallback form.`, paths.uiSchema));
    }
    uiSchema = {};
  }

  if (inputSchema?.properties && Array.isArray(inputSchema.required)) {
    const missingRequired = inputSchema.required.filter((field) => !Object.hasOwn(inputSchema.properties, field));
    if (missingRequired.length) {
      issues.push(skillIssue("error", "required_field_missing", `input.schema required field(s) are not defined in properties: ${missingRequired.join(", ")}.`, paths.inputSchema));
    }
  }

  if (!hasSkillMd) {
    issues.push(skillIssue("warning", "skill_markdown_missing", "Missing SKILL.md or skill.md. The skill can load, but its name/description and LLM instructions may be poor.", paths.root));
  } else {
    try {
      markdown = await readFile(skillMdPath, "utf8");
      const meta = parseSkillMarkdown(markdown);
      if (!meta.name || !meta.description) {
        issues.push(skillIssue("warning", "skill_markdown_metadata", "SKILL.md should include YAML frontmatter name and description.", skillMdPath));
      }
    } catch (error) {
      issues.push(skillIssue("warning", "skill_markdown_unreadable", `Unable to read skill markdown (${error.message}).`, skillMdPath));
    }
  }

  const hasRuntime = existsSync(paths.entrypoint);
  if (!hasRuntime) {
    const configuredEntrypoint = skillJsonResult.value?.entrypoint;
    const entrypointHint = configuredEntrypoint && configuredEntrypoint !== "python/skill.py"
      ? ` skill.json points to "${configuredEntrypoint}", but this web app runs local skills through python/skill.py. Add a python/skill.py adapter or configure an LLM.`
      : " Add python/skill.py for local execution or configure an LLM.";
    issues.push(skillIssue("warning", "runtime_missing", `Missing local runtime python/skill.py.${entrypointHint}`, paths.entrypoint));
  }

  const meta = parseSkillMarkdown(markdown);
  const skillJson = skillJsonResult.value || {};
  const title = firstString(skillJson.display_name, uiSchema.title, uiSchema["ui:title"], meta.name, paths.id);
  const description = firstString(skillJson.description, uiSchema.description, uiSchema["ui:description"], meta.description);
  const errorCount = issues.filter((issue) => issue.level === "error").length;
  return {
    id: paths.id,
    title,
    titleTh: firstString(uiSchema.titleTh, skillJson.display_name, uiSchema.title, uiSchema["ui:title"], meta.name, paths.id),
    description,
    descriptionTh: firstString(uiSchema.descriptionTh, skillJson.description, uiSchema.description, uiSchema["ui:description"], meta.description),
    hasRuntime,
    issues,
    isValid: errorCount === 0
  };
}

(async () => {
  const result = await inspectSkill("furniture-reference-storyboard");
  console.log(JSON.stringify(result, null, 2));
})();
