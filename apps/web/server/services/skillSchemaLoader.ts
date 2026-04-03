/**
 * Skill Schema Loader — loads and caches input.schema.json per skill.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator.
 */

import fs from "fs";
import path from "path";
import type { SkillInputSchemaInfo } from "@shared/orchestration/types";

/** Skills root directories */
const SKILLS_ROOT_DIRS = [
  path.resolve(process.cwd(), "skills"),
  path.resolve(process.cwd(), "apps", "web", "skills"),
  path.resolve(process.cwd(), "..", "skills"),
];

/** Module-level cache: skillId → parsed schema info (null = no schema or error) */
const _schemaCache = new Map<string, SkillInputSchemaInfo | null>();

/**
 * Load and parse a skill's input.schema.json file.
 *
 * Returns parsed schema info with metadata about required fields,
 * fields with defaults, and enum fields. Returns null if the schema
 * file doesn't exist or can't be parsed.
 */
export async function loadInputSchema(
  skillId: string,
): Promise<SkillInputSchemaInfo | null> {
  if (_schemaCache.has(skillId)) {
    return _schemaCache.get(skillId)!;
  }

  // Lazy import to avoid circular dependency with skillRegistry
  const { getSkillByIdAsync } = await import("./skillRegistry");
  const skill = await getSkillByIdAsync(skillId);
  if (!skill?.skillFilePath) {
    _schemaCache.set(skillId, null);
    return null;
  }

  const skillFolder = path.dirname(skill.skillFilePath);
  const schemaCandidates = [
    path.join(skillFolder, "input.schema.json"),
    path.join(skillFolder, "schemas", "input.schema.json"),
  ];

  let resolvedSchema: string | null = null;
  for (const candidatePath of schemaCandidates) {
    const resolvedCandidate = path.resolve(candidatePath);
    const allowedRoot = SKILLS_ROOT_DIRS.find((rootDir) => {
      const resolvedRoot = path.resolve(rootDir);
      return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep);
    });
    if (!allowedRoot) {
      console.warn("loadInputSchema: path traversal attempt blocked", {
        skillId,
        resolvedSchema: resolvedCandidate,
        resolvedSkillsRoot: SKILLS_ROOT_DIRS,
      });
      continue;
    }
    if (fs.existsSync(resolvedCandidate)) {
      resolvedSchema = resolvedCandidate;
      break;
    }
  }

  if (!resolvedSchema) {
    _schemaCache.set(skillId, null);
    return null;
  }

  try {
    const raw = fs.readFileSync(resolvedSchema, "utf-8");
    const schema = JSON.parse(raw) as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;

    const requiredFields = Array.isArray(schema.required)
      ? (schema.required as string[])
      : [];

    const fieldsWithDefaults: string[] = [];
    const enumFields: string[] = [];

    for (const [name, prop] of Object.entries(properties)) {
      if ("default" in prop) fieldsWithDefaults.push(name);
      if ("enum" in prop) enumFields.push(name);
    }

    const info: SkillInputSchemaInfo = {
      schema,
      requiredFields,
      fieldsWithDefaults,
      enumFields,
    };

    _schemaCache.set(skillId, info);
    return info;
  } catch {
    console.warn(`loadInputSchema: failed to parse schema for ${skillId}`);
    _schemaCache.set(skillId, null);
    return null;
  }
}

/**
 * Clear the schema cache. Called from clearSkillRegistryCache().
 */
export function clearSchemaCache(): void {
  _schemaCache.clear();
}
