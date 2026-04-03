import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import AdmZip from "adm-zip";

export const SKILL_MANIFEST_FILENAMES = ["skill.md", "SKILL.md"] as const;
export const SKILL_AGENT_DOC_FILENAMES = [
  "CLAUDE.md",
  "claude.md",
  "CODEX.md",
  "codex.md",
  "AGENTS.md",
  "agents.md",
] as const;
const ZIP_METADATA_DIR_NAMES = new Set(["__MACOSX"]);
const ZIP_METADATA_FILE_NAMES = new Set([".DS_Store", "Thumbs.db"]);

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function shouldIgnoreExtractedEntryName(name: string): boolean {
  return ZIP_METADATA_DIR_NAMES.has(name) || ZIP_METADATA_FILE_NAMES.has(name) || name.startsWith("._");
}

function readUsefulDirEntries(dirPath: string): fs.Dirent[] {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !shouldIgnoreExtractedEntryName(entry.name));
}

function moveEntry(sourcePath: string, destinationPath: string): void {
  try {
    fs.renameSync(sourcePath, destinationPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("EXDEV")) {
      throw error;
    }

    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    fs.rmSync(sourcePath, { recursive: true, force: true });
  }
}

function resolveDirectSkillManifestPath(skillDir: string): string | null {
  for (const fileName of SKILL_MANIFEST_FILENAMES) {
    const fullPath = path.join(skillDir, fileName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export function resolveSkillBundleDir(skillDir: string): string | null {
  if (!fs.existsSync(skillDir)) {
    return null;
  }

  try {
    const directManifestPath = resolveDirectSkillManifestPath(skillDir);
    const directCommandManifestPath = path.join(skillDir, "skill.manifest.json");
    const entries = fs.readdirSync(skillDir, { withFileTypes: true });
    const nestedDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(skillDir, entry.name));

    const candidates = nestedDirs.filter((dirPath) => {
      const nestedSkillManifestPath = resolveDirectSkillManifestPath(dirPath);
      const nestedCommandManifestPath = path.join(dirPath, "skill.manifest.json");
      return Boolean(nestedSkillManifestPath) || fs.existsSync(nestedCommandManifestPath);
    });

    if (candidates.length === 0) {
      return (directManifestPath || fs.existsSync(directCommandManifestPath)) ? skillDir : null;
    }

    const directHasCommandManifest = fs.existsSync(directCommandManifestPath);
    if (!directHasCommandManifest) {
      const nestedCommandBundle = candidates.find((dirPath) => fs.existsSync(path.join(dirPath, "skill.manifest.json")));
      if (nestedCommandBundle) {
        return nestedCommandBundle;
      }
    }

    if (directManifestPath || directHasCommandManifest) {
      return skillDir;
    }

    return candidates.find((dirPath) => fs.existsSync(path.join(dirPath, "skill.manifest.json")))
      ?? candidates[0]
      ?? null;
  } catch {
    return null;
  }
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
  const directManifestPath = resolveDirectSkillManifestPath(skillDir);
  if (directManifestPath) {
    return directManifestPath;
  }

  const bundleDir = resolveSkillBundleDir(skillDir);
  if (!bundleDir) {
    return null;
  }

  return resolveDirectSkillManifestPath(bundleDir);
}

export function hasSkillManifest(skillDir: string): boolean {
  return resolveSkillManifestPath(skillDir) !== null;
}

export function resolveRelativeSkillManifestPath(folderPath: string): string | null {
  for (const skillDir of resolveSkillDirCandidates(folderPath)) {
    const bundleDir = resolveSkillBundleDir(skillDir);
    if (!bundleDir) {
      continue;
    }
    const manifestPath = resolveSkillManifestPath(skillDir);
    if (manifestPath) {
      return path.join(folderPath, path.relative(skillDir, manifestPath)).split(path.sep).join("/");
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

export function extractZipToDirectory(
  zip: AdmZip,
  destinationDir: string,
): { extractedEntries: string[]; flattenedWrapperDir: string | null } {
  fs.mkdirSync(destinationDir, { recursive: true });
  const parentDir = path.dirname(destinationDir);
  fs.mkdirSync(parentDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(parentDir, `.${path.basename(destinationDir)}-extract-`));

  try {
    zip.extractAllTo(tempDir, true);

    const rootEntries = readUsefulDirEntries(tempDir);
    const wrapperDir = rootEntries.length === 1 && rootEntries[0]?.isDirectory()
      ? rootEntries[0]
      : null;
    const sourceDir = wrapperDir ? path.join(tempDir, wrapperDir.name) : tempDir;
    const extractedEntries = readUsefulDirEntries(sourceDir).map((entry) => entry.name);

    for (const entry of readUsefulDirEntries(sourceDir)) {
      moveEntry(path.join(sourceDir, entry.name), path.join(destinationDir, entry.name));
    }

    return {
      extractedEntries,
      flattenedWrapperDir: wrapperDir?.name ?? null,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
  sandbox_profile?: string | null;
  requires_network?: boolean | null;
  requires_browser?: boolean | null;
  max_runtime_seconds?: number | null;
  max_input_mb?: number | null;
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
  assignManifestValue(nextMetadata, "sandbox_profile", metadataUpdates.sandbox_profile);
  assignManifestValue(nextMetadata, "requires_network", metadataUpdates.requires_network);
  assignManifestValue(nextMetadata, "requires_browser", metadataUpdates.requires_browser);
  assignManifestValue(nextMetadata, "max_runtime_seconds", metadataUpdates.max_runtime_seconds);
  assignManifestValue(nextMetadata, "max_input_mb", metadataUpdates.max_input_mb);
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
