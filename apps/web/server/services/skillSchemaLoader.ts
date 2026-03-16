/**
 * Skill Schema Loader — loads and caches input.schema.json per skill.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator.
 */

import fs from "fs";
import path from "path";
import type { SkillInputSchemaInfo } from "@shared/orchestration/types";

/** Skills root directory */
const SKILLS_ROOT_DIR = path.resolve(process.cwd(), "skills");

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

  // Derive skill folder by stripping manifest filename
  const skillFolder = path.dirname(skill.skillFilePath);
  const schemaPath = path.join(skillFolder, "schemas", "input.schema.json");

  // Path traversal guard
  const resolvedSchema = path.resolve(schemaPath);
  const resolvedSkillsRoot = path.resolve(SKILLS_ROOT_DIR);
  if (!resolvedSchema.startsWith(resolvedSkillsRoot + path.sep)) {
    console.warn("loadInputSchema: path traversal attempt blocked", {
      skillId,
      resolvedSchema,
      resolvedSkillsRoot,
    });
    _schemaCache.set(skillId, null);
    return null;
  }

  if (!fs.existsSync(resolvedSchema)) {
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
