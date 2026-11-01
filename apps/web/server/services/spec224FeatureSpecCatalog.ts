import { createHash } from "node:crypto";
import { open, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { Spec224IncrementalSpecFile } from "./spec224IncrementalSpecCompiler";

const MAX_SPEC_BYTES = 1024 * 1024;
const SAFE_SPEC_ID = /^[^/\\\u0000-\u001F\u007F]{1,160}$/u;

export type RepositoryFeatureSpec = {
  id: string;
  title: string;
  path: string;
  summary: string;
};

export type RepositoryFeatureSpecHandoff = {
  status: "CURRENT" | "STALE" | "UNAVAILABLE";
  nextReadyWorkunit: string | null;
  nextAction: string | null;
  resumePoint: string | null;
  openRequirements: Array<{ id: string; text: string; nextAction: string }>;
  integratedSha: string | null;
};

type ModularProjectSpecPin = { id: string; specDigest: string; manifestDigest: string; ledgerDigest: string };
type ModularProjectDescriptor = {
  schemaVersion: 1;
  projectId: string;
  source: { repository: string; revision: string };
  implementationRepository: { repository: string; branch: string };
  specs: ModularProjectSpecPin[];
  initialPackages: Array<{
    id: string;
    specRefs: Array<{ specId: string; requirementIds: string[] }>;
    dependencies: string[];
    acceptanceCriteria: string[];
    verification: Array<{ id: string; kind: "test" | "build" | "run" | "review" | "manual"; ref: string }>;
    writeSet: { repository: string; paths: string[] };
  }>;
};
const SHA256 = /^[a-f0-9]{64}$/i;
const SHA_REVISION = /^[a-f0-9]{40,64}$/i;

function validateProjectGraph(specIds: string[], dependencies: Map<string, string[]>) {
  const members = new Set(specIds);
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (specId: string) => {
    if (active.has(specId)) throw new Error("MODULAR_PROJECT_DEPENDENCY_CYCLE");
    if (visited.has(specId)) return;
    active.add(specId);
    for (const dependencyId of dependencies.get(specId) ?? []) {
      if (dependencyId === specId) throw new Error("MODULAR_PROJECT_SELF_DEPENDENCY");
      if (!members.has(dependencyId)) continue;
      visit(dependencyId);
    }
    active.delete(specId);
    visited.add(specId);
  };
  for (const specId of specIds) visit(specId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isModularProjectDescriptor(value: unknown): value is ModularProjectDescriptor {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.projectId !== "string" || !value.projectId.trim()) return false;
  if (!isRecord(value.source) || typeof value.source.repository !== "string" || !SHA_REVISION.test(String(value.source.revision))) return false;
  if (!isRecord(value.implementationRepository) || typeof value.implementationRepository.repository !== "string" || typeof value.implementationRepository.branch !== "string") return false;
  if (!Array.isArray(value.specs) || !Array.isArray(value.initialPackages)) return false;
  return value.specs.every(pin => isRecord(pin) && typeof pin.id === "string" && SHA256.test(String(pin.specDigest)) && SHA256.test(String(pin.manifestDigest)) && SHA256.test(String(pin.ledgerDigest)))
    && value.initialPackages.every(pkg => isRecord(pkg) && typeof pkg.id === "string" && Array.isArray(pkg.specRefs)
      && pkg.specRefs.every(ref => isRecord(ref) && typeof ref.specId === "string" && Array.isArray(ref.requirementIds) && ref.requirementIds.every(id => typeof id === "string"))
      && Array.isArray(pkg.dependencies) && pkg.dependencies.every(id => typeof id === "string")
      && Array.isArray(pkg.acceptanceCriteria) && pkg.acceptanceCriteria.every(item => typeof item === "string")
      && Array.isArray(pkg.verification) && pkg.verification.every(item => isRecord(item) && typeof item.id === "string" && ["test", "build", "run", "review", "manual"].includes(String(item.kind)) && typeof item.ref === "string")
      && isRecord(pkg.writeSet) && typeof pkg.writeSet.repository === "string" && Array.isArray(pkg.writeSet.paths) && pkg.writeSet.paths.every(path => typeof path === "string"));
}

async function readJsonRegularFile(path: string): Promise<{ bytes: Buffer; value: unknown }> {
  const stats = await lstat(path).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink()) throw new Error("MODULAR_PROJECT_HANDOFF_UNAVAILABLE");
  const [resolvedPath, bytes] = await Promise.all([realpath(path), readFile(path)]);
  if (resolve(resolvedPath) !== resolve(path)) throw new Error("MODULAR_PROJECT_HANDOFF_PATH_INVALID");
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) as unknown };
  } catch {
    throw new Error("MODULAR_PROJECT_HANDOFF_INVALID");
  }
}

/** Loads the R1.4 project descriptor and verifies every member against canonical SPEC handoffs. */
export async function loadModularSaasProject(input: { repositoryRoot?: string } = {}) {
  const featureRoot = await resolveFeatureRoot(input.repositoryRoot);
  const descriptorPath = join(featureRoot, "312-smartaihub-modular-saas-rebuild-master-plan", "handoff", "modular-saas-project.json");
  const descriptorFile = await readJsonRegularFile(descriptorPath);
  if (!isModularProjectDescriptor(descriptorFile.value)) throw new Error("MODULAR_PROJECT_DESCRIPTOR_INVALID");
  const descriptor = descriptorFile.value;
  const ids = descriptor.specs.map(pin => pin.id);
  if (new Set(ids).size !== ids.length) throw new Error("MODULAR_PROJECT_DUPLICATE_SPEC");

  const specs = await Promise.all(descriptor.specs.map(async pin => {
    const spec = await readSpecFile(featureRoot, pin.id);
    const specDigest = createHash("sha256").update(spec.content, "utf8").digest("hex");
    if (specDigest !== pin.specDigest) throw new Error("MODULAR_PROJECT_SOURCE_DIGEST_MISMATCH");
    const directoryPath = join(featureRoot, pin.id);
    const handoffPath = join(directoryPath, "handoff");
    const handoffStats = await lstat(handoffPath).catch(() => null);
    if (!handoffStats?.isDirectory() || handoffStats.isSymbolicLink()) throw new Error("MODULAR_PROJECT_HANDOFF_UNAVAILABLE");
    const [manifestFile, ledgerFile] = await Promise.all([
      readJsonRegularFile(join(handoffPath, "manifest.json")),
      readJsonRegularFile(join(handoffPath, "requirement-ledger.json")),
    ]);
    if (createHash("sha256").update(manifestFile.bytes).digest("hex") !== pin.manifestDigest || createHash("sha256").update(ledgerFile.bytes).digest("hex") !== pin.ledgerDigest) {
      throw new Error("MODULAR_PROJECT_HANDOFF_DIGEST_MISMATCH");
    }
    const manifest = manifestFile.value;
    const ledger = ledgerFile.value;
    const numericId = pin.id.match(/^\d{3}/)?.[0];
    if (!isRecord(manifest) || !isRecord(manifest.identity) || (manifest.identity.spec_id !== pin.id && manifest.identity.spec_id !== numericId) || manifest.identity.digest !== pin.specDigest) {
      throw new Error("MODULAR_PROJECT_HANDOFF_IDENTITY_MISMATCH");
    }
    if (!isRecord(ledger) || ledger.schema_version !== 1 || ledger.spec_digest !== pin.specDigest || ledger.spec_id !== numericId || !Number.isSafeInteger(ledger.generation) || !Array.isArray(ledger.requirements)) throw new Error("MODULAR_PROJECT_LEDGER_IDENTITY_MISMATCH");
    if (manifest.schema_version !== 1 || !Number.isSafeInteger(manifest.generation)) throw new Error("MODULAR_PROJECT_HANDOFF_INVALID");
    const requirementIds = new Set<string>();
    const requirements = ledger.requirements.map(row => {
      if (!isRecord(row) || typeof row.requirement_id !== "string" || typeof row.requirement_text !== "string" || !["PASS", "FAIL", "BLOCKED_TRUE_EXTERNAL", "NOT_APPLICABLE", "OPEN", "PARTIAL", "VALIDATION_PENDING", "STALE_EVIDENCE"].includes(String(row.final_state)) || requirementIds.has(row.requirement_id)) throw new Error("MODULAR_PROJECT_LEDGER_INVALID");
      requirementIds.add(row.requirement_id);
      return { id: row.requirement_id, text: row.requirement_text, finalState: typeof row.final_state === "string" ? row.final_state : "OPEN" };
    });
    const rawDependencies = isRecord(manifest.dependencies) && Array.isArray(manifest.dependencies.specs) ? manifest.dependencies.specs : [];
    const memberNumericIds = new Map(descriptor.specs.map(member => [member.id.match(/^\d{3}/)?.[0] ?? member.id, member.id]));
    const dependencies = rawDependencies.flatMap(edge => {
      if (!isRecord(edge) || typeof edge.spec_id !== "string") throw new Error("MODULAR_PROJECT_DEPENDENCY_INVALID");
      const memberId = memberNumericIds.get(edge.spec_id) ?? (ids.includes(edge.spec_id) ? edge.spec_id : undefined);
      return memberId ? [memberId] : [];
    });
    return {
      id: pin.id, title: spec.title, path: `specs/feature/${pin.id}/spec.md`, content: spec.content, digest: specDigest,
      manifestDigest: pin.manifestDigest, manifestContent: manifestFile.bytes.toString("utf8"),
      ledgerDigest: pin.ledgerDigest, ledgerContent: ledgerFile.bytes.toString("utf8"), requirements, dependencies,
      lifecycleState: isRecord(manifest.lifecycle) && typeof manifest.lifecycle.current_state === "string" ? manifest.lifecycle.current_state : "UNKNOWN",
      nextAction: isRecord(manifest.continuation) && typeof manifest.continuation.next_action === "string" ? manifest.continuation.next_action : null,
    };
  }));
  const specsById = new Map(specs.map(spec => [spec.id, spec]));
  const packageIds = new Set<string>();
  for (const pkg of descriptor.initialPackages) {
    if (packageIds.has(pkg.id)) throw new Error("MODULAR_PROJECT_DUPLICATE_PACKAGE");
    packageIds.add(pkg.id);
    for (const ref of pkg.specRefs) {
      const member = specsById.get(ref.specId);
      if (!member) throw new Error("MODULAR_PROJECT_PACKAGE_SPEC_NOT_FOUND");
      const requirementIds = new Set(member.requirements.map(requirement => requirement.id));
      if (ref.requirementIds.some(id => !requirementIds.has(id))) throw new Error("MODULAR_PROJECT_PACKAGE_REQUIREMENT_NOT_FOUND");
    }
    if (pkg.dependencies.some(id => !packageIds.has(id) && !descriptor.initialPackages.some(candidate => candidate.id === id))) throw new Error("MODULAR_PROJECT_PACKAGE_DEPENDENCY_NOT_FOUND");
  }
  const dependencies = new Map(specs.map(spec => [spec.id, spec.dependencies]));
  validateProjectGraph(ids, dependencies);
  const descriptorDigest = createHash("sha256").update(descriptorFile.bytes).digest("hex");
  const sourceFiles: Array<Spec224IncrementalSpecFile & { projectSource?: { projectId: string; sourceRevision: string; descriptorDigest: string } }> = specs.flatMap(spec => {
    const safeSpecKey = `${spec.id.match(/^\d{3}/)?.[0] ?? "spec"}-${createHash("sha256").update(spec.id).digest("hex").slice(0, 12)}`;
    const sourcePath = spec.path;
    const handoffPath = sourcePath.replace(/spec\.md$/, "handoff/");
    return [
      { path: `canonical-projects/${descriptor.projectId}/specs/${safeSpecKey}/spec.md`, digest: spec.digest, content: spec.content, canonicalSource: { kind: "spec" as const, specId: spec.id, specDigest: spec.digest, sourcePath, sourceDigest: spec.digest } },
      { path: `canonical-projects/${descriptor.projectId}/specs/${safeSpecKey}/manifest.json`, digest: spec.manifestDigest, content: spec.manifestContent, canonicalSource: { kind: "manifest" as const, specId: spec.id, specDigest: spec.digest, sourcePath: `${handoffPath}manifest.json`, sourceDigest: spec.manifestDigest } },
      { path: `canonical-projects/${descriptor.projectId}/specs/${safeSpecKey}/requirement-ledger.json`, digest: spec.ledgerDigest, content: spec.ledgerContent, canonicalSource: { kind: "requirement-ledger" as const, specId: spec.id, specDigest: spec.digest, sourcePath: `${handoffPath}requirement-ledger.json`, sourceDigest: spec.ledgerDigest } },
    ];
  });
  sourceFiles.push({
    path: `canonical-projects/${descriptor.projectId}/project.json`, digest: descriptorDigest, content: descriptorFile.bytes.toString("utf8"),
    projectSource: { projectId: descriptor.projectId, sourceRevision: descriptor.source.revision, descriptorDigest, implementationRepository: descriptor.implementationRepository.repository },
  });
  const dependencyEdges = specs.flatMap(spec => spec.dependencies.map(specId => ({ fromSpecId: spec.id, toSpecId: specId })));
  return { ...descriptor, descriptorDigest, specs, dependencyEdges, sourceFiles };
}

async function readCanonicalHandoff(input: { featureRoot: string; directoryPath: string; specDigest: string }): Promise<RepositoryFeatureSpecHandoff> {
  const unavailable: RepositoryFeatureSpecHandoff = {
    status: "UNAVAILABLE", nextReadyWorkunit: null,
    nextAction: "Use the canonical SPEC handoff writer to initialize or reconcile this SPEC handoff.",
    resumePoint: null, openRequirements: [], integratedSha: null,
  };
  try {
    const handoffPath = join(input.directoryPath, "handoff");
    const handoffStats = await lstat(handoffPath);
    if (!handoffStats.isDirectory() || handoffStats.isSymbolicLink()) return unavailable;
    const [resolvedRoot, resolvedDirectory, resolvedHandoff] = await Promise.all([
      realpath(input.featureRoot), realpath(input.directoryPath), realpath(handoffPath),
    ]);
    if (!resolvedDirectory.startsWith(`${resolvedRoot}${sep}`) || !resolvedHandoff.startsWith(`${resolvedDirectory}${sep}`)) return unavailable;
    const manifestPath = join(resolvedHandoff, "manifest.json");
    const ledgerPath = join(resolvedHandoff, "requirement-ledger.json");
    const [manifestStats, ledgerStats] = await Promise.all([lstat(manifestPath), lstat(ledgerPath)]);
    if (!manifestStats.isFile() || manifestStats.isSymbolicLink() || !ledgerStats.isFile() || ledgerStats.isSymbolicLink()) return unavailable;
    const [manifestText, ledgerText] = await Promise.all([readFile(manifestPath, "utf8"), readFile(ledgerPath, "utf8")]);
    const manifest = JSON.parse(manifestText) as { identity?: { digest?: unknown }; continuation?: { next_ready_workunit?: unknown; next_action?: unknown; resume_point?: unknown }; integration?: { canonical_sha?: unknown } };
    const ledger = JSON.parse(ledgerText) as { spec_digest?: unknown; requirements?: Array<Record<string, unknown>> };
    if (manifest.identity?.digest !== input.specDigest || ledger.spec_digest !== input.specDigest) {
      return { ...unavailable, status: "STALE", nextAction: "Reconcile the SPEC handoff against the current canonical spec.md, then reload." };
    }
    const safeText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 4_000) : null;
    const openRequirements = (Array.isArray(ledger.requirements) ? ledger.requirements : [])
      .filter(requirement => requirement.final_state !== "PASS" && requirement.final_state !== "NOT_APPLICABLE")
      .slice(0, 40)
      .map(requirement => ({ id: typeof requirement.requirement_id === "string" ? requirement.requirement_id.slice(0, 80) : "", text: safeText(requirement.requirement_text) ?? "", nextAction: safeText(requirement.next_action) ?? "" }))
      .filter(requirement => requirement.id && requirement.text);
    return {
      status: "CURRENT", nextReadyWorkunit: safeText(manifest.continuation?.next_ready_workunit),
      nextAction: safeText(manifest.continuation?.next_action), resumePoint: safeText(manifest.continuation?.resume_point), openRequirements,
      integratedSha: typeof manifest.integration?.canonical_sha === "string" && /^[a-f0-9]{40,64}$/i.test(manifest.integration.canonical_sha) ? manifest.integration.canonical_sha.toLowerCase() : null,
    };
  } catch {
    return unavailable;
  }
}

async function resolveFeatureRoot(repositoryRoot?: string): Promise<string> {
  const rootsToCheck = repositoryRoot
    ? [
      join(resolve(repositoryRoot), "server", "feature-spec-catalog"),
      join(resolve(repositoryRoot), "specs", "feature"),
    ]
    : [join(process.cwd(), "server", "feature-spec-catalog")];
  for (const root of rootsToCheck) {
    try {
      const resolved = await realpath(root);
      if ((await lstat(resolved)).isDirectory()) return resolved;
    } catch {
      // Development runs resolve the canonical repository catalog below.
    }
  }
  if (repositoryRoot) throw new Error("FEATURE_SPEC_CATALOG_UNAVAILABLE");

  let current = resolve(process.cwd());
  let bestRoot: string | null = null;
  let bestEntryCount = -1;
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      const candidate = await realpath(join(current, "specs", "feature"));
      const stats = await lstat(candidate);
      if (stats.isDirectory()) {
        const entries = await readdir(candidate, { withFileTypes: true });
        const entryCount = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).length;
        if (entryCount > bestEntryCount) {
          bestRoot = candidate;
          bestEntryCount = entryCount;
        }
      }
    } catch {
      // The web service may start from the monorepo root, apps/web, or its
      // immutable release root. Walk only ancestors of the process directory.
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (bestRoot) return bestRoot;
  throw new Error("FEATURE_SPEC_CATALOG_UNAVAILABLE");
}

async function readSpecFile(featureRoot: string, specId: string, metadataOnly = false) {
  if (!SAFE_SPEC_ID.test(specId) || specId === "." || specId.includes("..")) {
    throw new Error("FEATURE_SPEC_ID_INVALID");
  }

  const lexicalPath = resolve(featureRoot, specId, "spec.md");
  if (!lexicalPath.startsWith(`${featureRoot}${sep}`) || isAbsolute(specId)) {
    throw new Error("FEATURE_SPEC_ID_INVALID");
  }

  const directoryPath = join(featureRoot, specId);
  const directoryStats = await lstat(directoryPath).catch(() => null);
  const fileStats = await lstat(lexicalPath).catch(() => null);
  if (!directoryStats?.isDirectory() || directoryStats.isSymbolicLink() || !fileStats?.isFile() || fileStats.isSymbolicLink()) {
    throw new Error("FEATURE_SPEC_NOT_FOUND");
  }

  const [resolvedRoot, resolvedDirectory, resolvedFile] = await Promise.all([
    realpath(featureRoot),
    realpath(directoryPath),
    realpath(lexicalPath),
  ]);
  if (
    !resolvedDirectory.startsWith(`${resolvedRoot}${sep}`) ||
    !resolvedFile.startsWith(`${resolvedDirectory}${sep}`)
  ) {
    throw new Error("FEATURE_SPEC_PATH_INVALID");
  }

  if (!fileStats || fileStats.size === 0 || fileStats.size > MAX_SPEC_BYTES) {
    throw new Error("FEATURE_SPEC_SIZE_INVALID");
  }
  let text: string;
  if (metadataOnly) {
    const handle = await open(resolvedFile, "r");
    try {
      const prefix = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
      text = new TextDecoder("utf-8").decode(prefix.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } else {
    const content = await readFile(resolvedFile);
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  }
  const lines = text.split(/\r?\n/);
  const title = lines.find(line => /^#\s+\S/.test(line))?.replace(/^#\s+/, "").trim() ?? specId;
  const summary = lines
    .slice(lines.findIndex(line => /^#\s+\S/.test(line)) + 1)
    .find(line => line.trim() && !line.startsWith("#"))
    ?.trim()
    .slice(0, 240) ?? "";
  return { content: text, title, summary };
}

export async function listRepositoryFeatureSpecs(input: {
  search?: string;
  repositoryRoot?: string;
} = {}): Promise<{ specs: RepositoryFeatureSpec[] }> {
  const featureRoot = await resolveFeatureRoot(input.repositoryRoot);
  const search = input.search?.trim().toLocaleLowerCase() ?? "";
  const entries = await readdir(featureRoot, { withFileTypes: true });
  const candidates = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink());
  const specs = await Promise.all(candidates.map(async entry => {
    try {
      const spec = await readSpecFile(featureRoot, entry.name, true);
      return {
        id: entry.name,
        title: spec.title,
        path: `specs/feature/${entry.name}/spec.md`,
        summary: spec.summary,
      };
    } catch {
      return null;
    }
  }));

  return {
    specs: specs
      .filter((spec): spec is RepositoryFeatureSpec => Boolean(spec))
      .filter(spec => !search || `${spec.id} ${spec.title} ${spec.summary}`.toLocaleLowerCase().includes(search))
      .sort((left, right) => left.title.localeCompare(right.title)),
  };
}

export async function loadRepositoryFeatureSpec(input: {
  specId: string;
  repositoryRoot?: string;
}): Promise<{ id: string; title: string; path: string; content: string; handoff: RepositoryFeatureSpecHandoff }> {
  const featureRoot = await resolveFeatureRoot(input.repositoryRoot);
  const spec = await readSpecFile(featureRoot, input.specId);
  const directoryPath = join(featureRoot, input.specId);
  const specDigest = createHash("sha256").update(spec.content, "utf8").digest("hex");
  return {
    id: input.specId,
    title: spec.title,
    path: `specs/feature/${input.specId}/spec.md`,
    content: spec.content,
    handoff: await readCanonicalHandoff({ featureRoot, directoryPath, specDigest }),
  };
}

export async function loadRepositoryFeatureSpecContext(input: { specId: string; repositoryRoot?: string }) {
  const loaded = await loadRepositoryFeatureSpec(input);
  const lines = loaded.content.split(/\r?\n/);
  const titleIndex = lines.findIndex(line => /^#\s+\S/.test(line));
  return {
    id: loaded.id, title: loaded.title, path: loaded.path,
    summary: lines.slice(titleIndex + 1).find(line => line.trim() && !line.startsWith("#"))?.trim().slice(0, 240) ?? "",
    digest: createHash("sha256").update(loaded.content, "utf8").digest("hex"), handoff: loaded.handoff,
  };
}
