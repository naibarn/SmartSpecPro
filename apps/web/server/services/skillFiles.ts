import fs from "fs";
import path from "path";
import yaml from "js-yaml";

export const SKILL_MANIFEST_FILENAMES = ["skill.md", "SKILL.md"] as const;
export const SKILL_AGENT_DOC_FILENAMES = [
  "CLAUDE.md",
  "claude.md",
  "CODEX.md",
  "codex.md",
  "AGENTS.md",
  "agents.md",
] as const;

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

export function resolveSkillDirCandidates(folderPath: string): string[] {
  if (path.isAbsolute(folderPath)) {
    return [folderPath];
  }

  return dedupe([
    path.resolve(process.cwd(), folderPath),
    path.resolve(process.cwd(), "..", folderPath),
    path.resolve(process.cwd(), "..", "..", folderPath),
    path.resolve(process.cwd(), "apps", "web", folderPath),
  ]);
}

export function resolveSkillManifestPath(skillDir: string): string | null {
  for (const fileName of SKILL_MANIFEST_FILENAMES) {
    const fullPath = path.join(skillDir, fileName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export function hasSkillManifest(skillDir: string): boolean {
  return resolveSkillManifestPath(skillDir) !== null;
}

export function resolveRelativeSkillManifestPath(folderPath: string): string | null {
  for (const skillDir of resolveSkillDirCandidates(folderPath)) {
    const manifestPath = resolveSkillManifestPath(skillDir);
    if (manifestPath) {
      return path.join(folderPath, path.basename(manifestPath)).split(path.sep).join("/");
    }
  }

  return null;
}

export function hasRelativeSkillManifest(folderPath: string): boolean {
  return resolveRelativeSkillManifestPath(folderPath) !== null;
}

export function mirrorExistingSkillManifest(skillDir: string): string[] {
  const manifestPath = resolveSkillManifestPath(skillDir);
  if (!manifestPath) {
    return [];
  }

  const content = fs.readFileSync(manifestPath, "utf-8");
  const written: string[] = [];
  for (const fileName of SKILL_MANIFEST_FILENAMES) {
    const targetPath = path.join(skillDir, fileName);
    if (!fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, content, "utf-8");
      written.push(targetPath);
    }
  }
  return written;
}

export function writeSkillManifestFiles(skillDir: string, content: string): string[] {
  fs.mkdirSync(skillDir, { recursive: true });
  const written: string[] = [];
  for (const fileName of SKILL_MANIFEST_FILENAMES) {
    const targetPath = path.join(skillDir, fileName);
    fs.writeFileSync(targetPath, content, "utf-8");
    written.push(targetPath);
  }
  return written;
}

export interface SkillManifestMetadataUpdate {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  version?: string | null;
  author?: string | null;
  icon?: string | null;
  tags?: string[] | null;
  auto_trigger?: boolean | null;
  trigger_patterns?: string[] | null;
  enabled_by_default?: boolean | null;
  credit_multiplier?: number | null;
  priority?: number | null;
  execution_mode?: string | null;
  default_model?: string | null;
  llm_model_id?: string | null;
  preferred_provider_id?: number | null;
  strict_provider_pin?: boolean | null;
}

function splitManifest(rawContent: string): { metadata: Record<string, unknown>; body: string } {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, body: rawContent };
  }

  try {
    return {
      metadata: (yaml.load(match[1], { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>) || {},
      body: match[2] || "",
    };
  } catch {
    return { metadata: {}, body: match[2] || "" };
  }
}

function assignManifestValue(
  metadata: Record<string, unknown>,
  key: string,
  value: string | number | boolean | string[] | null | undefined,
): void {
  if (value === undefined) {
    return;
  }
  if (value === null) {
    delete metadata[key];
    return;
  }
  metadata[key] = value;
}

export function buildUpdatedSkillManifest(
  rawContent: string,
  metadataUpdates: SkillManifestMetadataUpdate,
  nextBody?: string | null,
): string {
  const { metadata, body } = splitManifest(rawContent);
  const nextMetadata = { ...metadata };

  assignManifestValue(nextMetadata, "name", metadataUpdates.name);
  assignManifestValue(nextMetadata, "description", metadataUpdates.description);
  assignManifestValue(nextMetadata, "category", metadataUpdates.category);
  assignManifestValue(nextMetadata, "version", metadataUpdates.version);
  assignManifestValue(nextMetadata, "author", metadataUpdates.author);
  assignManifestValue(nextMetadata, "icon", metadataUpdates.icon);
  assignManifestValue(nextMetadata, "tags", metadataUpdates.tags);
  assignManifestValue(nextMetadata, "auto_trigger", metadataUpdates.auto_trigger);
  assignManifestValue(nextMetadata, "trigger_patterns", metadataUpdates.trigger_patterns);
  assignManifestValue(nextMetadata, "enabled_by_default", metadataUpdates.enabled_by_default);
  assignManifestValue(nextMetadata, "credit_multiplier", metadataUpdates.credit_multiplier);
  assignManifestValue(nextMetadata, "priority", metadataUpdates.priority);
  assignManifestValue(nextMetadata, "execution_mode", metadataUpdates.execution_mode);
  assignManifestValue(nextMetadata, "default_model", metadataUpdates.default_model);
  assignManifestValue(nextMetadata, "llm_model_id", metadataUpdates.llm_model_id);
  assignManifestValue(nextMetadata, "preferred_provider_id", metadataUpdates.preferred_provider_id);
  assignManifestValue(nextMetadata, "strict_provider_pin", metadataUpdates.strict_provider_pin);

  const serializedMetadata = yaml.dump(nextMetadata, {
    schema: yaml.JSON_SCHEMA,
    noRefs: true,
    lineWidth: -1,
    sortKeys: false,
  }).trimEnd();

  const serializedBody = nextBody === undefined ? body : (nextBody ?? "");
  return serializedBody
    ? `---\n${serializedMetadata}\n---\n${serializedBody}`
    : `---\n${serializedMetadata}\n---\n`;
}

export function updateSkillManifestFiles(
  skillDir: string,
  metadataUpdates: SkillManifestMetadataUpdate,
  nextBody?: string | null,
): { content: string; written: string[] } {
  const manifestPath = resolveSkillManifestPath(skillDir);
  const rawContent = manifestPath ? fs.readFileSync(manifestPath, "utf-8") : "";
  const nextContent = buildUpdatedSkillManifest(rawContent, metadataUpdates, nextBody);
  return {
    content: nextContent,
    written: writeSkillManifestFiles(skillDir, nextContent),
  };
}
