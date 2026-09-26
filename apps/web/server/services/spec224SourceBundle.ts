import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const BUNDLE_MANIFEST = ".spec224-source-bundle.json";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py"];
const PYTHON_TOP_LEVEL = new Set(["os", "sys", "typing", "pathlib", "json", "re", "hashlib", "datetime", "logging", "asyncio", "subprocess", "importlib"]);
const NODE_BUILTINS = new Set(["assert", "buffer", "child_process", "crypto", "events", "fs", "http", "https", "module", "os", "path", "process", "stream", "url", "util", "zlib"]);

export type SourceBundleFile = { path: string; sha256: string; sizeBytes: number };
export type SourceBundleManifest = {
  schemaVersion: "spec224.source-bundle.v1";
  sourceRevision: string;
  specDigest: string;
  dependencyArtifacts: string[];
  files: SourceBundleFile[];
  externalImports: string[];
  unresolvedImports: Array<{ from: string; specifier: string }>;
  closureComplete: boolean;
  bundleDigest: string;
};

export type SourceClosureInput = {
  sourceRoot: string;
  entryPaths: string[];
  dependencyArtifacts: string[];
  /** Optional roots for absolute in-repository imports such as Python `app.*`. */
  moduleRoots?: Array<{ prefix: string; root: string; language: "python" | "javascript" }>;
};

export type SourceClosureResult = {
  files: string[];
  externalImports: string[];
  unresolvedImports: Array<{ from: string; specifier: string }>;
  closureComplete: boolean;
};

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const sorted = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${sorted.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeRelative(root: string, input: string): string {
  if (!input || isAbsolute(input) || input.includes("\\")) throw new Error("SPEC224_BUNDLE_PATH_INVALID");
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("SPEC224_BUNDLE_PATH_ESCAPE");
  return rel.split(sep).join("/");
}

async function assertRegularFileWithoutSymlinkParents(root: string, relativePath: string): Promise<string> {
  const segments = relativePath.split("/");
  let current = root;
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("SPEC224_BUNDLE_SOURCE_ROOT_INVALID");
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error("SPEC224_BUNDLE_SYMLINK_PATH_REJECTED");
    if (index < segments.length - 1 && !stat.isDirectory()) throw new Error("SPEC224_BUNDLE_PARENT_NOT_DIRECTORY");
    if (index === segments.length - 1 && !stat.isFile()) throw new Error("SPEC224_BUNDLE_SOURCE_NOT_REGULAR_FILE");
  }
  return current;
}

async function resolveLocalImport(sourceRoot: string, from: string, specifier: string, moduleRoots: SourceClosureInput["moduleRoots"]): Promise<string | null> {
  const current = resolve(sourceRoot, from);
  const language = current.endsWith(".py") ? "python" : "javascript";
  let base: string | null = null;
  if (specifier.startsWith(".")) {
    base = resolve(dirname(current), specifier);
  } else {
    const moduleRoot = moduleRoots?.find(item => item.language === language && (specifier === item.prefix || specifier.startsWith(`${item.prefix}.`) || specifier.startsWith(`${item.prefix}/`)));
    if (moduleRoot) {
      const suffix = specifier.slice(moduleRoot.prefix.length).replace(/^[./]+/, "").replace(/\./g, "/");
      base = resolve(sourceRoot, moduleRoot.root, suffix);
    }
  }
  if (!base) return null;
  const candidates = [base, ...SOURCE_EXTENSIONS.map(ext => `${base}${ext}`), ...SOURCE_EXTENSIONS.map(ext => join(base!, `index${ext}`)), join(base, "__init__.py")];
  for (const candidate of candidates) {
    const rel = relative(sourceRoot, candidate);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) continue;
    try {
      const stat = await lstat(candidate);
      if (stat.isFile() && !stat.isSymbolicLink()) return rel.split(sep).join("/");
    } catch { /* try next extension */ }
  }
  return null;
}

function importsIn(source: string, filePath: string): { local: string[]; external: string[]; unresolved: string[] } {
  const local = new Set<string>();
  const external = new Set<string>();
  const unresolved = new Set<string>();
  const isPython = filePath.endsWith(".py");
  if (isPython) {
    for (const match of source.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
      const specifier = (match[1] ?? match[2] ?? "").trim();
      if (specifier.startsWith(".")) local.add(specifier);
      else if (specifier.split(".")[0] === "app") local.add(specifier);
      else if (!PYTHON_TOP_LEVEL.has(specifier.split(".")[0])) external.add(specifier.split(".")[0]);
    }
    if (/\b(?:importlib\.import_module|__import__)\s*\(\s*[^"'\s]/.test(source)) unresolved.add("<dynamic-python-import>");
  } else {
    const staticImport = /(?:\bimport\s+(?:[^"'()]*?\s+from\s+)?|\bexport\s+[^"']*?\s+from\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;
    for (const match of source.matchAll(staticImport)) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("/")) local.add(specifier);
      else if (!specifier.startsWith("node:") && !NODE_BUILTINS.has(specifier.split("/")[0])) external.add(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]);
    }
    if (/\bimport\s*\(\s*(?!["'])/.test(source) || /\brequire\s*\(\s*(?!["'])/.test(source)) unresolved.add("<dynamic-javascript-import>");
  }
  return { local: [...local], external: [...external], unresolved: [...unresolved] };
}

/**
 * Resolve static in-repository imports and preserve all unresolved/dynamic or
 * external-package edges as explicit closure gaps. This is discovery evidence,
 * never an admission decision or proof that an external package cache is safe.
 */
export async function discoverSourceClosure(input: SourceClosureInput): Promise<SourceClosureResult> {
  const sourceRoot = resolve(input.sourceRoot);
  const queue = [...input.entryPaths, ...input.dependencyArtifacts].map(path => safeRelative(sourceRoot, path));
  const seen = new Set<string>();
  const external = new Set<string>();
  const unresolved: Array<{ from: string; specifier: string }> = [];
  while (queue.length) {
    const filePath = queue.shift()!;
    if (seen.has(filePath)) continue;
    let file: string;
    try { file = await assertRegularFileWithoutSymlinkParents(sourceRoot, filePath); }
    catch {
      unresolved.push({ from: filePath, specifier: "<missing-or-symlink-file>" });
      continue;
    }
    seen.add(filePath);
    const imports = importsIn(await readFile(file, "utf8"), filePath);
    for (const name of imports.external) external.add(name);
    for (const specifier of imports.unresolved) unresolved.push({ from: filePath, specifier });
    for (const specifier of imports.local) {
      const resolved = await resolveLocalImport(sourceRoot, filePath, specifier, input.moduleRoots);
      if (resolved) queue.push(resolved);
      else unresolved.push({ from: filePath, specifier });
    }
  }
  const externalImports = [...external].sort();
  const files = [...seen].sort();
  return {
    files,
    externalImports,
    unresolvedImports: unresolved.sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0),
    closureComplete: unresolved.length === 0 && externalImports.length === 0,
  };
}

export async function assembleReadOnlySourceBundle(input: {
  sourceRoot: string;
  destination: string;
  files: string[];
  sourceRevision: string;
  specDigest: string;
  dependencyArtifacts: string[];
  externalImports: string[];
  unresolvedImports: Array<{ from: string; specifier: string }>;
}): Promise<SourceBundleManifest> {
  const sourceRoot = resolve(input.sourceRoot);
  const destination = resolve(input.destination);
  if (!input.sourceRevision.trim() || !/^[a-f0-9]{64}$/i.test(input.specDigest))
    throw new Error("SPEC224_BUNDLE_BASELINE_INVALID");
  const destRelative = relative(sourceRoot, destination);
  if (!destRelative || (destRelative !== ".." && !destRelative.startsWith(`..${sep}`)))
    throw new Error("SPEC224_BUNDLE_DESTINATION_INSIDE_SOURCE");
  const files = [...new Set(input.files.map(file => safeRelative(sourceRoot, file)))].sort();
  if (!files.length || files.length !== input.files.length) throw new Error("SPEC224_BUNDLE_FILE_SET_INVALID");
  if (input.dependencyArtifacts.some(file => !files.includes(safeRelative(sourceRoot, file))))
    throw new Error("SPEC224_BUNDLE_DEPENDENCY_ARTIFACT_MISSING");
  const content: Array<{ path: string; bytes: Buffer }> = [];
  for (const filePath of files) {
    const sourcePath = await assertRegularFileWithoutSymlinkParents(sourceRoot, filePath);
    content.push({ path: filePath, bytes: await readFile(sourcePath) });
  }
  await mkdir(destination, { recursive: false, mode: 0o700 });
  for (const entry of content) {
    const target = resolve(destination, entry.path);
    const targetRel = relative(destination, target);
    if (targetRel === ".." || targetRel.startsWith(`..${sep}`)) throw new Error("SPEC224_BUNDLE_PATH_ESCAPE");
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, entry.bytes, { flag: "wx", mode: 0o444 });
    await chmod(target, 0o444);
  }
  const manifestBase = {
    schemaVersion: "spec224.source-bundle.v1" as const,
    sourceRevision: input.sourceRevision,
    specDigest: input.specDigest,
    dependencyArtifacts: [...input.dependencyArtifacts].sort(),
    files: content.map(({ path, bytes }) => ({ path, sha256: sha256(bytes), sizeBytes: bytes.byteLength })),
    externalImports: [...input.externalImports].sort(),
    unresolvedImports: [...input.unresolvedImports].sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0),
    closureComplete: input.externalImports.length === 0 && input.unresolvedImports.length === 0,
  };
  const manifest: SourceBundleManifest = { ...manifestBase, bundleDigest: sha256(canonicalJson(manifestBase)) };
  const manifestPath = join(destination, BUNDLE_MANIFEST);
  await writeFile(manifestPath, `${canonicalJson(manifest)}\n`, { flag: "wx", mode: 0o444 });
  await chmod(manifestPath, 0o444);
  const directories = new Set<string>([destination]);
  for (const filePath of files) {
    let current = dirname(resolve(destination, filePath));
    while (current !== destination) { directories.add(current); current = dirname(current); }
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) await chmod(directory, 0o555);
  return manifest;
}

/** Content-integrity check only; it does not attest owner approval or runtime isolation. */
export async function verifyReadOnlySourceBundle(bundlePath: string): Promise<{
  valid: boolean;
  integrityOnly: true;
  reason: string | null;
}> {
  const root = resolve(bundlePath);
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
      return { valid: false, integrityOnly: true, reason: "bundle_root_invalid" };
    const manifestFile = await assertRegularFileWithoutSymlinkParents(root, BUNDLE_MANIFEST);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as SourceBundleManifest;
    const { bundleDigest, ...base } = manifest;
    if (manifest.schemaVersion !== "spec224.source-bundle.v1" || sha256(canonicalJson(base)) !== bundleDigest)
      return { valid: false, integrityOnly: true, reason: "manifest_digest_mismatch" };
    const expected = new Set([...manifest.files.map(file => file.path), BUNDLE_MANIFEST]);
    const expectedDirectories = new Set<string>([""]);
    for (const file of manifest.files) {
      let parent = dirname(file.path);
      while (parent !== ".") { expectedDirectories.add(parent); parent = dirname(parent); }
    }
    const actual: string[] = [];
    const actualDirectories = new Set<string>([""]);
    const walk = async (directory: string, prefix = "") => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolute = join(directory, entry.name);
        const stat = await lstat(absolute);
        if (stat.isSymbolicLink()) throw new Error("symlink_detected");
        if (entry.isDirectory()) {
          if ((stat.mode & 0o222) !== 0) throw new Error("writable_directory_detected");
          actualDirectories.add(rel);
          await walk(absolute, rel);
        }
        else if (entry.isFile()) actual.push(rel);
        else throw new Error("non_regular_entry_detected");
      }
    };
    await walk(root);
    if (actual.length !== expected.size || actual.some(path => !expected.has(path))
      || actualDirectories.size !== expectedDirectories.size
      || [...actualDirectories].some(path => !expectedDirectories.has(path)))
      return { valid: false, integrityOnly: true, reason: "file_set_mismatch" };
    if ((await lstat(root)).mode & 0o222) return { valid: false, integrityOnly: true, reason: "writable_bundle_root" };
    if ((await lstat(join(root, BUNDLE_MANIFEST))).mode & 0o222) return { valid: false, integrityOnly: true, reason: "writable_manifest" };
    for (const file of manifest.files) {
      const safePath = safeRelative(root, file.path);
      const absolute = await assertRegularFileWithoutSymlinkParents(root, safePath);
      const stat = await lstat(absolute);
      const bytes = await readFile(absolute);
      if (sha256(bytes) !== file.sha256 || bytes.byteLength !== file.sizeBytes || (stat.mode & 0o222) !== 0)
        return { valid: false, integrityOnly: true, reason: "file_content_or_mode_mismatch" };
    }
    return { valid: true, integrityOnly: true, reason: null };
  } catch (error) {
    return { valid: false, integrityOnly: true, reason: error instanceof Error ? error.message : "bundle_read_failed" };
  }
}
