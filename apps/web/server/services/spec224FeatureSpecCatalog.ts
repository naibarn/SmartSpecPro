import { open, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

const MAX_SPEC_BYTES = 1024 * 1024;
const SAFE_SPEC_ID = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/;

export type RepositoryFeatureSpec = {
  id: string;
  title: string;
  path: string;
  summary: string;
};

async function resolveFeatureRoot(repositoryRoot?: string): Promise<string> {
  if (repositoryRoot) return realpath(join(resolve(repositoryRoot), "specs", "feature"));

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
  if (!SAFE_SPEC_ID.test(specId) || specId.includes("..")) {
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
}): Promise<{ id: string; title: string; path: string; content: string }> {
  const featureRoot = await resolveFeatureRoot(input.repositoryRoot);
  const spec = await readSpecFile(featureRoot, input.specId);
  return {
    id: input.specId,
    title: spec.title,
    path: `specs/feature/${input.specId}/spec.md`,
    content: spec.content,
  };
}
