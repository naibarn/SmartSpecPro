import fs from "fs";
import path from "path";

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
