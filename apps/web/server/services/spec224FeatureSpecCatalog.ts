import { createHash } from "node:crypto";
import { open, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

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
