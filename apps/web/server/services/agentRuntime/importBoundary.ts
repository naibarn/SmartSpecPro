import fs from "node:fs";
import path from "node:path";

export const FORBIDDEN_OPENAI_AGENTS_SDK_SPECIFIERS = [
  "openai-agents",
  "@openai/agents",
  "openai_agents",
] as const;

const FORBIDDEN_OPENAI_AGENTS_SDK_SPECIFIER_SET: ReadonlySet<string> = new Set(
  FORBIDDEN_OPENAI_AGENTS_SDK_SPECIFIERS
);

const SOURCE_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const IMPORT_SPECIFIER_REGEX =
  /(?:import|export)\s+[^;]*?\s+from\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;

export interface ForbiddenSdkImportMatch {
  filePath: string;
  lineNumber: number;
  specifier: string;
}

function isSourceFile(filePath: string): boolean {
  return SOURCE_FILE_EXTENSIONS.has(path.extname(filePath));
}

function collectFiles(inputPath: string, output: string[]): void {
  if (!fs.existsSync(inputPath)) return;
  const stat = fs.statSync(inputPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(inputPath)) {
      collectFiles(path.join(inputPath, entry), output);
    }
    return;
  }

  if (isSourceFile(inputPath)) {
    output.push(inputPath);
  }
}

export function scanForForbiddenOpenAiAgentsImports(
  inputPaths: string[]
): ForbiddenSdkImportMatch[] {
  const files: string[] = [];
  for (const inputPath of inputPaths) {
    collectFiles(inputPath, files);
  }

  const findings: ForbiddenSdkImportMatch[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const matches = content.matchAll(IMPORT_SPECIFIER_REGEX);
    for (const match of matches) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier) continue;
      if (!FORBIDDEN_OPENAI_AGENTS_SDK_SPECIFIER_SET.has(specifier)) {
        continue;
      }
      const index = match.index ?? 0;
      const lineNumber = content.slice(0, index).split("\n").length;
      findings.push({
        filePath,
        lineNumber,
        specifier,
      });
    }
  }

  return findings;
}
