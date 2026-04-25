import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  resolveSkillBundleDir,
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
  resolveSkillLockPath,
  isNativeSkillBundle,
  listNativeBundleContractFiles,
} from "./skillFiles";

export interface SkillMaintenanceTarget {
  id?: number;
  slug: string;
  name?: string | null;
  description?: string | null;
  folderPath?: string | null;
  executionMode?: string | null;
  configJson?: Record<string, unknown> | null;
  sandboxProfileSlug?: string | null;
  requiresNetwork?: boolean | null;
  requiresBrowser?: boolean | null;
}

export interface SkillSchemaSummary {
  present: boolean;
  requiredFields: string[];
  propertyTypes: Record<string, string>;
  propertyCount: number;
}

export interface SkillContractSnapshotData {
  skillSlug: string;
  skillDir: string | null;
  bundleDir: string | null;
  manifestPath: string | null;
  lockPath: string | null;
  executionMode: string | null;
  runtimeProfile: string;
  nativeBundleReady: boolean;
  nativeBundleFiles: string[];
  inputSchemaHash: string | null;
  outputSchemaHash: string | null;
  testsHash: string | null;
  fixtureHash: string | null;
  manifestHash: string | null;
  subagentManifestHash: string | null;
  contractHash: string;
  schemaSummary: {
    input: SkillSchemaSummary;
    output: SkillSchemaSummary;
    uiPresent: boolean;
  };
  fileInventory: string[];
}

export interface CompatibilityIssue {
  severity: "warning" | "blocked";
  kind: string;
  path: string;
  message: string;
}

export interface SkillCompatibilityReport {
  status: "compatible" | "warning" | "blocked";
  issues: CompatibilityIssue[];
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function resolveExistingSkillDir(folderPath?: string | null): string | null {
  if (!folderPath?.trim()) {
    return null;
  }

  for (const candidate of resolveSkillDirCandidates(folderPath)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function safeReadText(filePath: string | null): string | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function safeReadJson(filePath: string | null): Record<string, unknown> | null {
  const raw = safeReadText(filePath);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function summarizeSchema(schema: Record<string, unknown> | null): SkillSchemaSummary {
  if (!schema) {
    return {
      present: false,
      requiredFields: [],
      propertyTypes: {},
      propertyCount: 0,
    };
  }

  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? schema.properties as Record<string, Record<string, unknown>>
    : {};
  const requiredFields = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === "string").sort()
    : [];

  const propertyTypes: Record<string, string> = {};
  for (const [name, property] of Object.entries(properties)) {
    const rawType = property?.type;
    if (typeof rawType === "string") {
      propertyTypes[name] = rawType;
      continue;
    }
    if (Array.isArray(rawType)) {
      const joined = rawType.filter((value): value is string => typeof value === "string").sort().join("|");
      if (joined) {
        propertyTypes[name] = joined;
      }
    }
  }

  return {
    present: true,
    requiredFields,
    propertyTypes,
    propertyCount: Object.keys(properties).length,
  };
}

function collectFilesRecursively(dirPath: string, baseDir: string, sink: string[]): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(entryPath, baseDir, sink);
      continue;
    }
    sink.push(path.relative(baseDir, entryPath).split(path.sep).join("/"));
  }
}

function hashRelativeFiles(baseDir: string | null, predicate: (relativePath: string) => boolean): string | null {
  if (!baseDir || !fs.existsSync(baseDir)) {
    return null;
  }

  const matches: string[] = [];
  collectFilesRecursively(baseDir, baseDir, matches);
  const filtered = matches.filter(predicate).sort();
  if (filtered.length === 0) {
    return null;
  }

  const payload = filtered.map((relativePath) => {
    const absolutePath = path.join(baseDir, relativePath);
    return {
      relativePath,
      content: safeReadText(absolutePath),
    };
  });

  return sha256(JSON.stringify(payload));
}

function detectRuntimeProfile(bundleDir: string | null): string {
  if (!bundleDir) {
    return "unknown";
  }

  if (isNativeSkillBundle(bundleDir)) {
    return "agents-python-native";
  }
  if (fs.existsSync(path.join(bundleDir, "skill.manifest.json")) || fs.existsSync(path.join(bundleDir, "src", "index.mjs"))) {
    return "genjs";
  }
  if (fs.existsSync(path.join(bundleDir, "js", "skill.mjs"))) {
    return "javascript-esm";
  }
  if (fs.existsSync(path.join(bundleDir, "js", "skill.js"))) {
    return "javascript-classic";
  }
  if (fs.existsSync(path.join(bundleDir, "python", "skill.py"))) {
    return "python";
  }
  if (resolveSkillManifestPath(bundleDir)) {
    return "markdown-only";
  }
  return "unknown";
}

function readSubagentManifestHash(bundleDir: string | null): string | null {
  if (!bundleDir) {
    return null;
  }

  const manifestPath = path.join(bundleDir, "subagents.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const manifest = safeReadJson(manifestPath);
  return manifest ? sha256(JSON.stringify(manifest)) : null;
}

export function buildSkillContractSnapshot(skill: SkillMaintenanceTarget): SkillContractSnapshotData {
  const skillDir = resolveExistingSkillDir(skill.folderPath);
  const bundleDir = skillDir ? (resolveSkillBundleDir(skillDir) ?? skillDir) : null;
  const markdownManifestPath = skillDir ? resolveSkillManifestPath(skillDir) : null;
  const commandManifestPath = bundleDir ? path.join(bundleDir, "skill.manifest.json") : null;
  const manifestPath = markdownManifestPath ?? (commandManifestPath && fs.existsSync(commandManifestPath) ? commandManifestPath : null);
  const lockPath = bundleDir ? resolveSkillLockPath(bundleDir) : null;
  const inputSchemaPath = bundleDir ? path.join(bundleDir, "schemas", "input.schema.json") : null;
  const outputSchemaPath = bundleDir ? path.join(bundleDir, "schemas", "output.schema.json") : null;
  const uiSchemaPath = bundleDir ? path.join(bundleDir, "schemas", "ui.schema.json") : null;

  const inputSchema = safeReadJson(inputSchemaPath);
  const outputSchema = safeReadJson(outputSchemaPath);
  const uiPresent = Boolean(uiSchemaPath && fs.existsSync(uiSchemaPath));
  const inputSummary = summarizeSchema(inputSchema);
  const outputSummary = summarizeSchema(outputSchema);
  const runtimeProfile = detectRuntimeProfile(bundleDir);
  const nativeBundleReady = Boolean(bundleDir && isNativeSkillBundle(bundleDir));
  const nativeBundleFiles = bundleDir ? listNativeBundleContractFiles(bundleDir) : [];
  const fileInventory = bundleDir ? (() => {
    const files: string[] = [];
    collectFilesRecursively(bundleDir, bundleDir, files);
    return files.sort();
  })() : [];

  const inputSchemaHash = inputSchema ? sha256(JSON.stringify(inputSchema)) : null;
  const outputSchemaHash = outputSchema ? sha256(JSON.stringify(outputSchema)) : null;
  const manifestHash = manifestPath ? sha256(safeReadText(manifestPath) ?? "") : null;
  const subagentManifestHash = readSubagentManifestHash(bundleDir);
  const testsHash = hashRelativeFiles(bundleDir, (relativePath) => relativePath.startsWith("tests/"));
  const fixtureHash = hashRelativeFiles(bundleDir, (relativePath) =>
    relativePath.startsWith("tests/fixtures/")
    || relativePath.startsWith("examples/")
  );

  return {
    skillSlug: skill.slug,
    skillDir,
    bundleDir,
    manifestPath,
    lockPath,
    executionMode: skill.executionMode ?? null,
    runtimeProfile,
    nativeBundleReady,
    nativeBundleFiles,
    inputSchemaHash,
    outputSchemaHash,
    testsHash,
    fixtureHash,
    manifestHash,
    contractHash: sha256(JSON.stringify({
      executionMode: skill.executionMode ?? null,
      runtimeProfile,
      nativeBundleReady,
      nativeBundleFiles,
      inputSummary,
      outputSummary,
      uiPresent,
      manifestHash,
      subagentManifestHash,
      lockPath,
    })),
    schemaSummary: {
      input: inputSummary,
      output: outputSummary,
      uiPresent,
    },
    fileInventory,
    subagentManifestHash,
  };
}

function compareRequiredFields(
  issues: CompatibilityIssue[],
  kind: "input" | "output",
  baseline: SkillSchemaSummary,
  candidate: SkillSchemaSummary,
): void {
  const removedRequired = baseline.requiredFields.filter((field) => !candidate.requiredFields.includes(field));
  for (const field of removedRequired) {
    issues.push({
      severity: "blocked",
      kind: `${kind}-required-field-removed`,
      path: `${kind}.${field}`,
      message: `Required ${kind} field '${field}' was removed from the contract.`,
    });
  }
}

function comparePropertyTypes(
  issues: CompatibilityIssue[],
  kind: "input" | "output",
  baseline: SkillSchemaSummary,
  candidate: SkillSchemaSummary,
): void {
  for (const [field, baselineType] of Object.entries(baseline.propertyTypes)) {
    const candidateType = candidate.propertyTypes[field];
    if (!candidateType || baselineType === candidateType) {
      continue;
    }
    issues.push({
      severity: "blocked",
      kind: `${kind}-type-changed`,
      path: `${kind}.${field}`,
      message: `${kind} field '${field}' changed type from '${baselineType}' to '${candidateType}'.`,
    });
  }
}

function compareNativeBundleFiles(
  issues: CompatibilityIssue[],
  baseline: SkillContractSnapshotData,
  candidate: SkillContractSnapshotData,
): void {
  const candidateFiles = new Set(candidate.nativeBundleFiles);
  for (const relativePath of baseline.nativeBundleFiles) {
    if (!candidateFiles.has(relativePath)) {
      issues.push({
        severity: "blocked",
        kind: "native-bundle-file-removed",
        path: relativePath,
        message: `Native bundle contract file '${relativePath}' was removed.`,
      });
    }
  }

  if (baseline.subagentManifestHash && !candidate.subagentManifestHash) {
    issues.push({
      severity: "blocked",
      kind: "subagent-manifest-invalid-or-missing",
      path: "subagents.json",
      message: "The subagent manifest is missing or invalid in the candidate snapshot.",
    });
  } else if (baseline.subagentManifestHash && candidate.subagentManifestHash && baseline.subagentManifestHash !== candidate.subagentManifestHash) {
    issues.push({
      severity: "warning",
      kind: "subagent-manifest-changed",
      path: "subagents.json",
      message: "The subagent manifest changed between snapshots.",
    });
  }
}

export function compareSkillContractSnapshots(
  baseline: SkillContractSnapshotData,
  candidate: SkillContractSnapshotData,
): SkillCompatibilityReport {
  const issues: CompatibilityIssue[] = [];

  compareRequiredFields(issues, "input", baseline.schemaSummary.input, candidate.schemaSummary.input);
  compareRequiredFields(issues, "output", baseline.schemaSummary.output, candidate.schemaSummary.output);
  comparePropertyTypes(issues, "input", baseline.schemaSummary.input, candidate.schemaSummary.input);
  comparePropertyTypes(issues, "output", baseline.schemaSummary.output, candidate.schemaSummary.output);
  compareNativeBundleFiles(issues, baseline, candidate);

  if (baseline.executionMode && candidate.executionMode && baseline.executionMode !== candidate.executionMode) {
    issues.push({
      severity: "warning",
      kind: "execution-mode-changed",
      path: "executionMode",
      message: `Execution mode changed from '${baseline.executionMode}' to '${candidate.executionMode}'.`,
    });
  }

  if (baseline.nativeBundleReady && !candidate.nativeBundleReady) {
    issues.push({
      severity: "blocked",
      kind: "native-bundle-surface-removed",
      path: "nativeBundleReady",
      message: "Native bundle surface was removed.",
    });
  }

  const status = issues.some((issue) => issue.severity === "blocked")
    ? "blocked"
    : issues.length > 0
      ? "warning"
      : "compatible";

  return { status, issues };
}
