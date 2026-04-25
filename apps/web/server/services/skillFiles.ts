import fs from "fs";
import path from "path";
import crypto from "crypto";
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
export const NATIVE_BUNDLE_CORE_FILES = [
  "SKILL.md",
  "skill.md",
  "scripts/run.sh",
  "scripts/verify.sh",
  "references/input_contract.md",
  "references/output_contract.md",
  "references/maintenance.md",
  "MODEL_COMPATIBILITY.md",
  "skill.lock.json",
] as const;
export const NATIVE_BUNDLE_SUBAGENT_FILES = [
  "subagents.json",
  "references/subagents.md",
  "agents/orchestrator.md",
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

function listSpecialistDocs(skillDir: string): string[] {
  const specialistDir = path.join(skillDir, "agents", "specialists");
  if (!fs.existsSync(specialistDir)) {
    return [];
  }

  const entries: string[] = [];
  const walk = (dirPath: string): void => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.name.endsWith(".md")) {
        entries.push(path.relative(skillDir, entryPath).split(path.sep).join("/"));
      }
    }
  };

  walk(specialistDir);
  return entries.sort();
}

export function listNativeSubagentNames(skillDir: string): string[] {
  const manifestPath = path.join(skillDir, "subagents.json");
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return [];
    }

    const subagents = (raw as Record<string, unknown>).subagents;
    if (!Array.isArray(subagents)) {
      return [];
    }

    return subagents
      .map(item => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const name = (item as Record<string, unknown>).name;
        return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
      })
      .filter((name): name is string => Boolean(name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export function hasNativeSubagentTopology(skillDir: string): boolean {
  return fs.existsSync(path.join(skillDir, "subagents.json"))
    || fs.existsSync(path.join(skillDir, "agents", "orchestrator.md"))
    || fs.existsSync(path.join(skillDir, "references", "subagents.md"))
    || listSpecialistDocs(skillDir).length > 0;
}

export function listNativeBundleContractFiles(skillDir: string): string[] {
  const files = new Set<string>();
  for (const relativePath of NATIVE_BUNDLE_CORE_FILES) {
    if (fs.existsSync(path.join(skillDir, relativePath))) {
      files.add(relativePath);
    }
  }

  if (hasNativeSubagentTopology(skillDir)) {
    for (const relativePath of NATIVE_BUNDLE_SUBAGENT_FILES) {
      if (fs.existsSync(path.join(skillDir, relativePath))) {
        files.add(relativePath);
      }
    }
    for (const specialistPath of listSpecialistDocs(skillDir)) {
      files.add(specialistPath);
    }
  }

  return Array.from(files).sort();
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

export function resolveSkillLockPath(skillDir: string): string | null {
  const bundleDir = resolveSkillBundleDir(skillDir);
  if (!bundleDir) {
    return null;
  }

  const lockPath = path.join(bundleDir, "skill.lock.json");
  return fs.existsSync(lockPath) ? lockPath : null;
}

export function isNativeSkillBundle(skillDir: string): boolean {
  const bundleDir = resolveSkillBundleDir(skillDir);
  if (!bundleDir) {
    return false;
  }

  const lockPath = path.join(bundleDir, "skill.lock.json");
  const runPath = path.join(bundleDir, "scripts", "run.sh");
  const verifyPath = path.join(bundleDir, "scripts", "verify.sh");
  const skillMdPath = path.join(bundleDir, "SKILL.md");
  return fs.existsSync(lockPath) && fs.existsSync(runPath) && fs.existsSync(verifyPath) && fs.existsSync(skillMdPath);
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

export interface NativeSkillBundleScaffoldInput {
  slug: string;
  name: string;
  description?: string | null;
  category?: string | null;
  version?: string | null;
  author?: string | null;
  bundleProfile?: "general" | "research" | "workflow" | "media" | "custom" | null;
  skillContent?: string | null;
  systemPrompt?: string | null;
  subagents?: Array<Record<string, any>> | null;
  orchestrator?: Record<string, any> | null;
  routing?: Array<Record<string, any>> | null;
  checkpointPolicy?: Record<string, any> | null;
  verificationPolicy?: Record<string, any> | null;
  fallbackPolicy?: Record<string, any> | null;
  securityPolicy?: Record<string, any> | null;
  subagentManifestVersion?: string | null;
}

function getNativeSkillBundleProfileCopy(profile: NativeSkillBundleScaffoldInput["bundleProfile"]): {
  label: string;
  summary: string;
  checklist: string[];
  performanceNotes: string[];
  qualityNotes: string[];
  guidance: string;
} {
  switch (profile) {
    case "research":
      return {
        label: "Research",
        summary: "Optimized for deep analysis, citations, and structured findings.",
        checklist: [
          "State how sources should be selected and cited.",
          "Define what counts as a reliable source.",
          "Keep outputs concise, traceable, and review-friendly.",
        ],
        performanceNotes: [
          "Batch source retrieval before summarizing.",
          "Avoid repeated lookups for the same evidence.",
          "Prefer structured summaries over verbose prose.",
        ],
        qualityNotes: [
          "Cite claims that depend on external facts.",
          "Call out uncertainty explicitly.",
          "Separate findings from recommendations.",
        ],
        guidance: "Use when the skill needs evidence gathering, synthesis, or grounded reasoning.",
      };
    case "workflow":
      return {
        label: "Workflow",
        summary: "Optimized for repeatable automations, orchestration, and task sequencing.",
        checklist: [
          "List the primary workflow steps and handoff points.",
          "Describe retry and fallback behavior.",
          "Keep side effects within declared outputs.",
        ],
        performanceNotes: [
          "Make each step idempotent where possible.",
          "Group related side effects into a single pass.",
          "Cache intermediate results for repeated use.",
        ],
        qualityNotes: [
          "Define success and failure states for every step.",
          "Document rollback behavior before shipping.",
          "Prefer deterministic transitions over ad hoc branching.",
        ],
        guidance: "Use when the skill coordinates multiple steps, tools, or long-running processes.",
      };
    case "media":
      return {
        label: "Media",
        summary: "Optimized for image, video, and asset generation workflows.",
        checklist: [
          "Specify input formats, output formats, and size limits.",
          "Document any quality or safety constraints.",
          "Describe model and tool dependencies explicitly.",
        ],
        performanceNotes: [
          "Reuse generated assets instead of regenerating them.",
          "Keep image/video dimensions and durations bounded.",
          "Minimize expensive model calls in loops.",
        ],
        qualityNotes: [
          "State acceptable quality thresholds up front.",
          "Note fallback behavior when generation fails.",
          "Record licensing or attribution requirements if relevant.",
        ],
        guidance: "Use when the skill works with creative or media generation tasks.",
      };
    case "custom":
      return {
        label: "Custom",
        summary: "A flexible starting point for specialized native bundles.",
        checklist: [
          "Describe the exact behavior you want from the skill.",
          "Write explicit input and output contracts.",
          "Add project-specific guardrails and verification steps.",
        ],
        performanceNotes: [
          "Keep the happy path short and predictable.",
          "Avoid unnecessary tool calls and retries.",
          "Document expected latency or cost constraints.",
        ],
        qualityNotes: [
          "Define what a correct output looks like.",
          "List the most likely failure modes.",
          "Write a verify script that exercises the critical path.",
        ],
        guidance: "Use when none of the preset templates fit the skill well.",
      };
    case "general":
    default:
      return {
        label: "General",
        summary: "A balanced starter template for most OpenAI Agents Python skills.",
        checklist: [
          "Describe the skill's core responsibility.",
          "Document required inputs and expected outputs.",
          "List any safety or reliability guardrails.",
        ],
        performanceNotes: [
          "Favor concise prompts and structured outputs.",
          "Avoid redundant reads and writes.",
          "Keep the critical path short.",
        ],
        qualityNotes: [
          "Prefer explicit contracts over implied behavior.",
          "Capture verification steps alongside the instructions.",
          "Note edge cases and fallback behavior.",
        ],
        guidance: "Use for most new skills when you want a broad, reusable scaffold.",
      };
  }
}

function normalizeNativeBundlePath(relativePath: string | undefined | null, fallback: string): string {
  const value = (relativePath ?? "").trim();
  if (!value) {
    return fallback;
  }

  const normalized = value.replace(/\\/g, "/");
  if (path.isAbsolute(normalized) || normalized.startsWith("../") || normalized.includes("/../")) {
    return fallback;
  }

  return normalized;
}

function canonicalJsonHash(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(normalize);
    }
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalize(value)))
    .digest("hex");
}

function buildDefaultSubagentSecurityPolicy(subagents: Array<Record<string, any>>): Record<string, any> {
  const modes = new Set(subagents.map(subagent => String(subagent.mode ?? subagent.runtime_mode ?? "tool")));
  const fanoutLimit = Math.max(1, Math.min(subagents.length || 1, 8));
  return {
    toolAllowlist: ["scripts/run.sh", "scripts/verify.sh", "echo", "cat", "ls", "pwd", "find"],
    toolDenylist: ["rm", "curl", "wget", "ssh", "scp", "sudo", "bash", "sh", "python", "python3", "node"],
    networkEgress: "none",
    filesystemScopes: ["bundle", "workspace", "state", "out", "logs", ".agents"],
    secretPolicy: {
      redact: true,
      persist: "never",
    },
    fanoutLimit,
    maxConcurrency: Math.min(fanoutLimit, 2),
    allowedInvocationModes: modes.has("handoff") ? ["tool", "handoff"] : ["tool"],
  };
}

function buildNativeSubagentManifest(input: NativeSkillBundleScaffoldInput): Record<string, any> | null {
  const subagents = Array.isArray(input.subagents) ? input.subagents : [];
  if (subagents.length === 0) {
    return null;
  }

  const skillName = input.slug.trim() || input.name.trim() || "generated-skill";
  const normalizedSubagents = subagents.map((subagent, index) => {
    const name = String(subagent.name ?? subagent.slug ?? subagent.id ?? `specialist-${index + 1}`).trim() || `specialist-${index + 1}`;
    const safeName = name.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase() || `specialist-${index + 1}`;
    const entrypoint = normalizeNativeBundlePath(
      String(subagent.entrypoint ?? subagent.path ?? "").trim(),
      `agents/specialists/${safeName}.md`,
    );
    const toolBoundary = Array.isArray(subagent.toolBoundary)
      ? subagent.toolBoundary.map((item) => String(item).trim()).filter(Boolean)
      : Array.isArray(subagent.tool_boundary)
        ? subagent.tool_boundary.map((item) => String(item).trim()).filter(Boolean)
        : [];

    return {
      name,
      role: String(subagent.role ?? "specialist").trim() || "specialist",
      owner: String(subagent.owner ?? skillName).trim() || skillName,
      runtime_mode: String(subagent.runtime_mode ?? subagent.runtimeMode ?? subagent.mode ?? "tool").trim() || "tool",
      mode: String(subagent.mode ?? subagent.runtime_mode ?? subagent.runtimeMode ?? "tool").trim() || "tool",
      entrypoint,
      toolBoundary: toolBoundary.length > 0 ? toolBoundary : ["scripts/run.sh", "scripts/verify.sh"],
      handoffPolicy: subagent.handoffPolicy ?? subagent.handoff_policy ?? { mode: "never" },
      checkpointPolicy: subagent.checkpointPolicy ?? subagent.checkpoint_policy ?? { mode: "per-run" },
      verificationCommand: String(subagent.verificationCommand ?? subagent.verification_command ?? "scripts/verify.sh").trim() || "scripts/verify.sh",
      fallbackBehavior: String(subagent.fallbackBehavior ?? subagent.fallback_behavior ?? "return-error").trim() || "return-error",
    };
  });

  const orchestratorSource = input.orchestrator ?? {};
  const orchestratorName = String(orchestratorSource.name ?? skillName).trim() || skillName;
  const orchestrator = {
    name: orchestratorName,
    role: String(orchestratorSource.role ?? "orchestrator").trim() || "orchestrator",
    owner: String(orchestratorSource.owner ?? skillName).trim() || skillName,
    runtime_mode: String(orchestratorSource.runtime_mode ?? orchestratorSource.runtimeMode ?? "tool").trim() || "tool",
    mode: String(orchestratorSource.mode ?? "orchestrator").trim() || "orchestrator",
    entrypoint: normalizeNativeBundlePath(orchestratorSource.entrypoint ?? orchestratorSource.path, "agents/orchestrator.md"),
    toolBoundary: Array.isArray(orchestratorSource.toolBoundary)
      ? orchestratorSource.toolBoundary.map((item: any) => String(item).trim()).filter(Boolean)
      : Array.isArray(orchestratorSource.tool_boundary)
        ? orchestratorSource.tool_boundary.map((item: any) => String(item).trim()).filter(Boolean)
        : [],
    handoffPolicy: orchestratorSource.handoffPolicy ?? orchestratorSource.handoff_policy ?? { mode: "never" },
    checkpointPolicy: orchestratorSource.checkpointPolicy ?? orchestratorSource.checkpoint_policy ?? { mode: "parent-run" },
    verificationCommand: String(orchestratorSource.verificationCommand ?? orchestratorSource.verification_command ?? "scripts/verify.sh").trim() || "scripts/verify.sh",
    fallbackBehavior: String(orchestratorSource.fallbackBehavior ?? orchestratorSource.fallback_behavior ?? "escalate-to-parent").trim() || "escalate-to-parent",
  };

  const routing = Array.isArray(input.routing) && input.routing.length > 0
    ? input.routing.map((route, index) => ({
      from: String(route.from ?? route.source ?? "orchestrator").trim() || "orchestrator",
      to: String(route.to ?? route.target ?? route.subagent ?? "").trim() || normalizedSubagents[index % normalizedSubagents.length]?.name || "",
      mode: String(route.mode ?? route.runtime_mode ?? "tool").trim() || "tool",
      purpose: String(route.purpose ?? route.reason ?? "").trim(),
      order: index,
    })).filter((route) => Boolean(route.to))
    : normalizedSubagents.map((subagent, index) => ({
      from: "orchestrator",
      to: subagent.name,
      mode: subagent.mode,
      purpose: subagent.role,
      order: index,
    }));

  return {
    version: String(input.subagentManifestVersion ?? "1").trim() || "1",
    orchestrator,
    subagents: normalizedSubagents,
    routing,
    checkpointPolicy: input.checkpointPolicy ?? { mode: "parent-run" },
    verificationPolicy: input.verificationPolicy ?? { command: "scripts/verify.sh" },
    fallbackPolicy: input.fallbackPolicy ?? { behavior: "escalate-to-parent" },
    securityPolicy: input.securityPolicy ?? buildDefaultSubagentSecurityPolicy(normalizedSubagents),
  };
}

function renderNativeSubagentDocs(input: NativeSkillBundleScaffoldInput, manifest: Record<string, any>): Record<string, string> {
  const docs: Record<string, string> = {};
  const skillName = input.slug.trim() || input.name.trim() || "generated-skill";
  const subagentLines = Array.isArray(manifest.subagents) && manifest.subagents.length > 0
    ? manifest.subagents.map((subagent: any) => `- ${subagent.name} (${subagent.mode}) -> \`${subagent.entrypoint}\``)
    : ["- None"];
  const routingLines = Array.isArray(manifest.routing) && manifest.routing.length > 0
    ? manifest.routing.map((route: any) => `- ${route.from} -> ${route.to}`)
    : ["- None"];

  docs["references/subagents.md"] = [
    "# Subagent Topology",
    "",
    "This bundle declares a machine-readable `subagents.json` manifest.",
    "",
    "## Orchestrator",
    `- Name: ${manifest.orchestrator?.name ?? `${skillName}-orchestrator`}`,
    `- Entry point: \`${manifest.orchestrator?.entrypoint ?? "agents/orchestrator.md"}\``,
    "",
    "## Specialists",
    ...subagentLines,
    "",
    "## Routing",
    ...routingLines,
    "",
    "## Policies",
    `- Checkpoint policy: ${JSON.stringify(manifest.checkpointPolicy)}`,
    `- Verification policy: ${JSON.stringify(manifest.verificationPolicy)}`,
    `- Fallback policy: ${JSON.stringify(manifest.fallbackPolicy)}`,
    `- Security policy: ${JSON.stringify(manifest.securityPolicy)}`,
    "",
  ].join("\n");

  docs["agents/orchestrator.md"] = [
    "# Orchestrator",
    "",
    `- Name: ${manifest.orchestrator?.name ?? `${skillName}-orchestrator`}`,
    `- Role: ${manifest.orchestrator?.role ?? "orchestrator"}`,
    `- Entry point: \`${manifest.orchestrator?.entrypoint ?? "agents/orchestrator.md"}\``,
    `- Owned by: ${manifest.orchestrator?.owner ?? skillName}`,
    `- Specialist coverage: ${Array.isArray(manifest.subagents) ? manifest.subagents.map((item: any) => item.name).join(", ") || "none" : "none"}`,
    "",
    "## Operating Notes",
    "- Keep the orchestrator in control by default.",
    "- Use specialists as bounded tools before escalating ownership.",
    "- Verify checkpoints before finalizing the run.",
    "",
  ].join("\n");

  if (Array.isArray(manifest.subagents)) {
    for (const subagent of manifest.subagents) {
      const safeName = String(subagent.name).replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase() || "specialist";
      const entrypoint = normalizeNativeBundlePath(subagent.entrypoint, `agents/specialists/${safeName}.md`);
      const toolBoundary = Array.isArray(subagent.toolBoundary) ? subagent.toolBoundary : [];
      docs[entrypoint] = [
        `# ${subagent.name}`,
        "",
        `- Role: ${subagent.role}`,
        `- Mode: ${subagent.mode}`,
        `- Entry point: \`${entrypoint}\``,
        `- Owner: ${subagent.owner ?? skillName}`,
        `- Tool boundary: ${toolBoundary.join(", ") || "none"}`,
        `- Handoff policy: ${JSON.stringify(subagent.handoffPolicy)}`,
        `- Checkpoint policy: ${JSON.stringify(subagent.checkpointPolicy)}`,
        `- Verification command: ${subagent.verificationCommand}`,
        `- Fallback behavior: ${subagent.fallbackBehavior}`,
        "",
      ].join("\n");
    }
  }

  return docs;
}

function renderNativeSkillMarkdown(input: NativeSkillBundleScaffoldInput): string {
  const name = input.name.trim() || input.slug;
  const description = input.description?.trim() || `Native skill bundle for ${name}`;
  const version = input.version?.trim() || "1.0.0";
  const category = input.category?.trim() || "other";
  const author = input.author?.trim() || undefined;
  const profile = getNativeSkillBundleProfileCopy(input.bundleProfile ?? "general");
  const topology = buildNativeSubagentManifest(input);
  const frontmatter = yaml.dump(
    {
      name,
      description,
      version,
      category,
      target_platform: "agents_python",
      bundle_profile: input.bundleProfile ?? "general",
      bundle_topology: topology ? "subagent-aware" : "single-agent",
      ...(author ? { author } : {}),
    },
    { lineWidth: 120, noRefs: true, sortKeys: false },
  ).trim();
  const skillContent = input.skillContent?.trim() || input.systemPrompt?.trim() || "Describe the skill behavior, inputs, outputs, and guardrails here.";

  return [
    "---",
    frontmatter,
    "---",
    "",
    `# ${name}`,
    "",
    "## Overview",
    "",
    description,
    "",
    "## Native Bundle Notes",
    "",
    "- This skill is scaffolded as an OpenAI Agents Python native bundle.",
    `- Template profile: ${profile.label}.`,
    `- ${profile.summary}`,
    "- Entry points are declared in `skill.lock.json`.",
    "- Keep writes confined to declared output paths.",
    "",
    "## Template Guidance",
    "",
    ...profile.checklist.map((line) => `- ${line}`),
    "",
    "## Performance Principles",
    "",
    ...profile.performanceNotes.map((line) => `- ${line}`),
    "",
    "## Quality Principles",
    "",
    ...profile.qualityNotes.map((line) => `- ${line}`),
    "",
    "## Skill Instructions",
    "",
    skillContent,
    "",
    "## Verification",
    "",
    "- Run `scripts/verify.sh` before finalizing any run.",
    ...(topology
      ? [
        "",
        "## Subagent Topology",
        "",
        `- Machine-readable topology: \`subagents.json\``,
        `- Orchestrator docs: \`agents/orchestrator.md\``,
        `- Specialist docs: \`agents/specialists/*.md\``,
        `- Routing rules: ${Array.isArray(topology.routing) ? topology.routing.length : 0}`,
      ]
      : []),
    "",
  ].join("\n");
}

export function writeNativeSkillBundleScaffold(
  skillDir: string,
  input: NativeSkillBundleScaffoldInput,
): string[] {
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "agents"), { recursive: true });

  const skillMd = renderNativeSkillMarkdown(input);
  const topology = buildNativeSubagentManifest(input);
  const topologyDocs = topology ? renderNativeSubagentDocs(input, topology) : {};
  const lockData: Record<string, any> = {
    name: input.slug,
    version: input.version?.trim() || "1.0.0",
    target_platform: "agents_python",
    bundle_profile: input.bundleProfile ?? "general",
    bundle_topology: topology ? "subagent-aware" : "single-agent",
    entrypoints: {
      run: "scripts/run.sh",
      verify: "scripts/verify.sh",
    },
    outputs: [
      "SKILL.md",
      "skill.md",
      "scripts/run.sh",
      "scripts/verify.sh",
      "references/input_contract.md",
      "references/output_contract.md",
      "references/maintenance.md",
      "references/performance.md",
      "references/quality.md",
      "references/failure_modes.md",
      "MODEL_COMPATIBILITY.md",
      "skill.lock.json",
    ],
    supported_modes: ["create", "improve", "maintenance"],
    compatibility_mirror_policy: "mirror-skill-md",
    subagent_manifest: topology ? "subagents.json" : null,
  };
  if (topology) {
    lockData.subagent_manifest_sha256 = canonicalJsonHash(topology);
    lockData.outputs = Array.from(new Set([
      ...(lockData.outputs ?? []),
      "subagents.json",
      "references/subagents.md",
      "agents/orchestrator.md",
      ...topology.subagents.map((subagent: any) => subagent.entrypoint),
    ]));
  }
  const lock = JSON.stringify(lockData, null, 2) + "\n";
  const profile = getNativeSkillBundleProfileCopy(input.bundleProfile ?? "general");

  const runScript = `#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
echo "[native-bundle] run scaffold: ${input.slug}"
echo "[native-bundle] skill dir: \${SKILL_DIR}"
`;

  const verifyScript = `#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
echo "[native-bundle] verify scaffold: ${input.slug}"
echo "[native-bundle] skill dir: \${SKILL_DIR}"
`;

  const files: Record<string, string> = {
    "SKILL.md": skillMd,
    "skill.md": skillMd,
    "skill.lock.json": lock,
    "scripts/run.sh": runScript,
    "scripts/verify.sh": verifyScript,
    "references/input_contract.md": "# Input Contract\n\nDescribe the expected request payload here.\n",
    "references/output_contract.md": "# Output Contract\n\nDescribe the expected response and artifact contract here.\n",
    "references/maintenance.md": "# Maintenance Notes\n\n- Safe changes may be auto-applied.\n- Breaking changes require approval.\n- Verification runs before finalize.\n",
    "references/performance.md": `# Performance Notes\n\n- Native bundle profile: ${profile.label}.\n- ${profile.guidance}\n- Keep the happy path short and cache repeated work.\n`,
    "references/quality.md": `# Quality Checklist\n\n- Validate inputs before doing work.\n- Keep outputs structured and traceable.\n- Verify the critical path before finalizing.\n`,
    "references/failure_modes.md": "# Failure Modes\n\n- Missing inputs.\n- Network or tool failures.\n- Unexpected output formats.\n",
    "MODEL_COMPATIBILITY.md": `# Model Compatibility\n\n- Keep provider-specific settings explicit.\n- Native bundle profile: ${profile.label}.\n- ${profile.guidance}\n`,
  };
  if (topology) {
    Object.assign(files, topologyDocs, {
      "subagents.json": JSON.stringify(topology, null, 2) + "\n",
    });
  }

  const written: string[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(skillDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf-8");
    written.push(targetPath);
    if (relativePath.endsWith(".sh")) {
      fs.chmodSync(targetPath, 0o755);
    }
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
