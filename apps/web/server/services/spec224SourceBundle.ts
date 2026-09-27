import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import yaml from "js-yaml";

const BUNDLE_MANIFEST = ".spec224-source-bundle.json";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py"];
const PYTHON_TOP_LEVEL = new Set(["os", "sys", "typing", "pathlib", "json", "re", "hashlib", "datetime", "logging", "asyncio", "subprocess", "importlib"]);
const NODE_BUILTINS = new Set(["assert", "buffer", "child_process", "crypto", "events", "fs", "http", "https", "module", "os", "path", "process", "stream", "url", "util", "zlib"]);

export type SourceInputKind = "entry" | "dependency-artifact" | "runtime-config" | "test-fixture" | "generated-artifact" | "executable" | "hook" | "workspace-manifest" | "source-import";
export type SourceDependencyEdge = { from: string; specifier: string; to: string | null; kind: "static-import" | "dynamic-import" | "workspace-dependency" | "declared-package-dependency" | "profile-input"; status: "resolved-local" | "external-package" | "unresolved" };
export type SourceBundleFile = { path: string; sha256: string; sizeBytes: number; mode: number; provenance: SourceInputKind[] };
export type SourcePackageIdentity = { name: string; version: string | null; manifestPath: string; origin: "workspace" };
export type SourceExternalPackageIdentity = { name: string; version: string; packageManager: "npm" | "pnpm" | "uv"; lockfilePath: string; integrity: string[]; source: string | null; dependencies: string[]; artifactBytesCaptured: false; artifactIntegrityVerified: false; installationHooks: "declared-present" | "unknown-without-artifact" };
export type SourceBundleManifest = {
  schemaVersion: "spec224.source-bundle.v2";
  discoveryMode: "static-plus-explicit-profile-v1";
  admissionEligible: false;
  sourceRevision: string;
  specDigest: string;
  profileId: string;
  runtimeIdentity: { node?: string; python?: string; packageManager?: string };
  packageIdentities: SourcePackageIdentity[];
  externalPackageIdentities: SourceExternalPackageIdentity[];
  dependencyArtifacts: string[];
  files: SourceBundleFile[];
  dependencyEdges: SourceDependencyEdge[];
  externalImports: string[];
  unresolvedImports: Array<{ from: string; specifier: string }>;
  closureComplete: boolean;
  bundleDigest: string;
};

export type SourceClosureInput = {
  sourceRoot: string;
  entryPaths: string[];
  dependencyArtifacts: string[];
  /** Explicit runtime, generated, executable and test inputs for the selected profile. */
  profileInputs?: Array<{ path: string; kind: Exclude<SourceInputKind, "entry" | "dependency-artifact" | "source-import"> }>;
  /** Workspace package manifests whose exports and local dependencies are in scope. */
  workspaceManifestPaths?: string[];
  profileId?: string;
  runtimeIdentity?: { node?: string; python?: string; packageManager?: string };
  /** Optional roots for absolute in-repository imports such as Python `app.*`. */
  moduleRoots?: Array<{ prefix: string; root: string; language: "python" | "javascript" }>;
};

export type SourceClosureResult = {
  discoveryMode: "static-plus-explicit-profile-v1";
  admissionEligible: false;
  files: string[];
  provenance: Record<string, SourceInputKind[]>;
  profileId: string;
  runtimeIdentity: { node?: string; python?: string; packageManager?: string };
  packageIdentities: SourcePackageIdentity[];
  externalPackageIdentities: SourceExternalPackageIdentity[];
  dependencyEdges: SourceDependencyEdge[];
  externalImports: string[];
  unresolvedImports: Array<{ from: string; specifier: string }>;
  closureComplete: boolean;
};

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const sorted = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${sorted.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function filesHaveExtension(files: Set<string>, extensions: string[]): boolean {
  return [...files].some(path => extensions.some(extension => path.endsWith(extension)));
}

function safeRelative(root: string, input: string): string {
  if (!input || isAbsolute(input) || input.includes("\\")) throw new Error("SPEC224_BUNDLE_PATH_INVALID");
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("SPEC224_BUNDLE_PATH_ESCAPE");
  const normalized = rel.split(sep).join("/");
  if (
    normalized.split("/").some(part => {
      const name = part.toLowerCase();
      return name.startsWith(".env") || name.endsWith(".pem") || name.endsWith(".key") || name === "id_rsa" || name === "id_ed25519" || name === ".npmrc" || name === ".pypirc" || name === ".netrc" || name.startsWith("credentials.") || name.startsWith("secrets.");
    })
  )
    throw new Error("SPEC224_BUNDLE_SENSITIVE_PATH_REJECTED");
  return normalized;
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
    if (language === "python") {
      const leadingDots = specifier.match(/^\.+/)?.[0].length ?? 1;
      let parent = dirname(current);
      for (let index = 1; index < leadingDots; index++) parent = dirname(parent);
      const suffix = specifier.slice(leadingDots).replace(/\./g, "/");
      base = resolve(parent, suffix);
    } else base = resolve(dirname(current), specifier);
  } else {
    const moduleRoot = moduleRoots?.find(item => item.language === language && (specifier === item.prefix || specifier.startsWith(`${item.prefix}.`) || specifier.startsWith(`${item.prefix}/`)));
    if (moduleRoot) {
      const suffix = specifier
        .slice(moduleRoot.prefix.length)
        .replace(/^[./]+/, "")
        .replace(/\./g, "/");
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
    } catch {
      /* try next extension */
    }
  }
  return null;
}

function importsIn(source: string, filePath: string): { local: string[]; external: string[]; dynamic: string[]; unresolved: string[] } {
  const local = new Set<string>();
  const external = new Set<string>();
  const dynamic = new Set<string>();
  const unresolved = new Set<string>();
  const isPython = filePath.endsWith(".py");
  if (isPython) {
    if (/\b(?:exec|eval)\s*\(/.test(source)) unresolved.add("<dynamic-python-code-evaluation>");
    for (const match of source.matchAll(/^\s*(?:from\s+([.\w]+)\s+import|import\s+([\w.]+))/gm)) {
      const specifier = (match[1] ?? match[2] ?? "").trim();
      if (specifier.startsWith(".")) local.add(specifier);
      else if (specifier.split(".")[0] === "app") local.add(specifier);
      else if (!PYTHON_TOP_LEVEL.has(specifier.split(".")[0])) external.add(specifier.split(".")[0]);
    }
    for (const match of source.matchAll(/\b(?:importlib\.import_module|__import__)\s*\(\s*["']([^"']+)["']/g)) dynamic.add(match[1]);
    if (/\b(?:importlib\.import_module|__import__)\s*\(\s*[^"'\s]/.test(source)) unresolved.add("<dynamic-python-import>");
  } else {
    if (/\b(?:eval\s*\(|new\s+Function\s*\()/.test(source)) unresolved.add("<dynamic-code-evaluation>");
    const staticImport = /(?:\bimport\s+(?:[^"'()]*?\s+from\s+)?|\bexport\s+[^"']*?\s+from\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
    for (const match of source.matchAll(staticImport)) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("/")) local.add(specifier);
      else if (!specifier.startsWith("node:") && !NODE_BUILTINS.has(specifier.split("/")[0])) external.add(specifier);
    }
    const dynamicLiterals = [...[...source.matchAll(/\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g)].map(match => match[2]), ...[...source.matchAll(/\bimport\s*\(\s*`([^$`]+)`\s*\)/g)].map(match => match[1])];
    for (const specifier of dynamicLiterals) {
      dynamic.add(specifier);
      if (specifier.startsWith(".") || specifier.startsWith("/")) local.delete(specifier);
      else if (!specifier.startsWith("node:") && !NODE_BUILTINS.has(specifier.split("/")[0])) external.delete(specifier);
    }
    if (/\bimport\s*\(\s*(?!["']|`[^$`]*`)/.test(source) || /\brequire\s*\(\s*(?!["'])/.test(source)) unresolved.add("<dynamic-javascript-import>");
  }
  return { local: [...local], external: [...external], dynamic: [...dynamic], unresolved: [...unresolved] };
}

type WorkspacePackage = { manifestPath: string; name: string; manifest: Record<string, unknown> };

function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function unresolvedCommandDependencies(command: string, declaredDependencies: Set<string>): string[] {
  const runtimeCommands = new Set(["node", "npm", "pnpm", "yarn", "bun", "git", "sh", "bash", "python", "python3", "uv", "echo", "cd", "export", "env", "mkdir", "rm", "cp", "mv", "grep", "sed", "cat", "find", "chmod", "sleep"]);
  const binaryAliases: Record<string, string> = { tsc: "typescript", eslint: "eslint", prettier: "prettier", vitest: "vitest", vite: "vite", tsx: "tsx", "lint-staged": "lint-staged", husky: "husky" };
  const unresolved = new Set<string>();
  for (const clause of command.split(/(?:&&|\|\||;|\n)/)) {
    const tokens = clause.trim().split(/\s+/).filter(Boolean);
    let index = 0;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] ?? "")) index++;
    if (["node", "sh", "bash"].includes(tokens[index] ?? "") && tokens.slice(index + 1).some(token => token === "-e" || token === "--eval" || token === "-c")) {
      unresolved.add("inline-eval");
      continue;
    }
    let executable = tokens[index];
    if (["pnpm", "npm", "yarn", "bun"].includes(executable ?? "")) {
      const operation = tokens[index + 1];
      if (operation === "run" || operation === "exec" || operation === "dlx" || operation === "x") {
        if (operation === "run") continue;
        executable = tokens[index + 2];
      } else continue;
    } else if (["npx", "bunx"].includes(executable ?? "")) executable = tokens[index + 1];
    if (!executable || runtimeCommands.has(executable) || executable.startsWith("#")) continue;
    const normalized = normalizePackageName(binaryAliases[executable] ?? executable);
    if (!declaredDependencies.has(normalized)) unresolved.add(executable);
  }
  return [...unresolved].sort();
}

function pythonProjectRequirements(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const requirements: string[] = [];
  let section = "";
  let collectingDependencies = false;
  let bracketDepth = 0;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1];
      collectingDependencies = false;
      continue;
    }
    const start = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*\[/);
    const key = start?.[1];
    const dependencyArray = (section === "project" && key === "dependencies") || (section === "project.optional-dependencies" && Boolean(key)) || (section === "dependency-groups" && Boolean(key)) || (section === "build-system" && key === "requires") || (section === "tool.uv" && key === "dev-dependencies");
    if (dependencyArray && start) {
      collectingDependencies = true;
      bracketDepth = 0;
    }
    if (!collectingDependencies) continue;
    bracketDepth += (line.match(/\[/g) ?? []).length - (line.match(/\]/g) ?? []).length;
    for (const match of line.matchAll(/(?:"([^"]+)"|'([^']+)')/g)) {
      const requirement = match[1] ?? match[2];
      if (/^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?\s*(?:[<>=!~;@]|$)/.test(requirement)) requirements.push(requirement);
    }
    if (bracketDepth <= 0 && line.includes("]")) collectingDependencies = false;
  }
  return requirements;
}

function parseUvLockPackages(source: string, lockfilePath: string): SourceExternalPackageIdentity[] {
  const packageBlocks = source.split(/^\[\[package\]\]\s*$/m).slice(1);
  const identities: SourceExternalPackageIdentity[] = [];
  for (const block of packageBlocks) {
    const name = block.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
    const version = block.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1];
    if (!name || !version || /source\s*=\s*\{\s*editable\s*=/.test(block)) continue;
    const sourceValue = block.match(/^source\s*=\s*\{([^}]*)\}/m)?.[1] ?? "";
    const source = sourceValue.match(/(?:registry|git|url)\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
    const integrity = [...new Set([...block.matchAll(/hash\s*=\s*["'](sha256:[a-f0-9]{64})["']/gi)].map(match => match[1].toLowerCase()))].sort();
    const dependencySection = block.match(/^dependencies\s*=\s*\[([\s\S]*?)^\s*\]/m)?.[1] ?? "";
    const dependencies = [...new Set([...dependencySection.matchAll(/name\s*=\s*["']([^"']+)["']/g)].map(match => normalizePackageName(match[1])))].sort();
    identities.push({ name: normalizePackageName(name), version, packageManager: "uv", lockfilePath, integrity, source, dependencies, artifactBytesCaptured: false, artifactIntegrityVerified: false, installationHooks: "unknown-without-artifact" });
  }
  return identities;
}

function parseNodeLockPackages(source: string, lockfilePath: string): SourceExternalPackageIdentity[] {
  if (lockfilePath.endsWith("package-lock.json") || lockfilePath.endsWith("npm-shrinkwrap.json")) {
    const lock = JSON.parse(source) as { packages?: Record<string, Record<string, unknown>> };
    const result: SourceExternalPackageIdentity[] = [];
    for (const [path, value] of Object.entries(lock.packages ?? {})) {
      const marker = "node_modules/";
      const index = path.lastIndexOf(marker);
      if (index < 0) continue;
      const name = path.slice(index + marker.length);
      if (value.link === true || typeof value.version !== "string") continue;
      const integrity =
        typeof value.integrity === "string"
          ? value.integrity
              .split(/\s+/)
              .filter(hash => /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(hash))
              .sort()
          : [];
      const dependencies = ["dependencies", "optionalDependencies"].flatMap(key => Object.keys((value[key] && typeof value[key] === "object" ? value[key] : {}) as Record<string, unknown>)).map(normalizePackageName);
      result.push({ name: normalizePackageName(name), version: value.version, packageManager: "npm", lockfilePath, integrity, source: typeof value.resolved === "string" ? value.resolved : null, dependencies: [...new Set(dependencies)].sort(), artifactBytesCaptured: false, artifactIntegrityVerified: false, installationHooks: value.hasInstallScript === true ? "declared-present" : "unknown-without-artifact" });
    }
    return result;
  }
  const lock = yaml.load(source) as { packages?: Record<string, Record<string, unknown>> } | undefined;
  const result: SourceExternalPackageIdentity[] = [];
  for (const [rawKey, value] of Object.entries(lock?.packages ?? {})) {
    let key = rawKey.replace(/^\//, "").replace(/\([^)]*\)$/, "");
    let name: string;
    let version: string;
    if (key.startsWith("@")) {
      const versionAt = key.indexOf("@", key.indexOf("/") + 1);
      if (versionAt < 0) continue;
      name = key.slice(0, versionAt);
      version = key.slice(versionAt + 1);
    } else {
      const versionAt = key.lastIndexOf("@");
      if (versionAt <= 0) continue;
      name = key.slice(0, versionAt);
      version = key.slice(versionAt + 1);
    }
    const resolution = (value.resolution && typeof value.resolution === "object" ? value.resolution : {}) as Record<string, unknown>;
    const integrityValue = resolution.integrity ?? value.integrity;
    const integrity = typeof integrityValue === "string" ? [integrityValue] : [];
    const dependencies = ["dependencies", "optionalDependencies"].flatMap(dependencyKey => Object.keys((value[dependencyKey] && typeof value[dependencyKey] === "object" ? value[dependencyKey] : {}) as Record<string, unknown>)).map(normalizePackageName);
    result.push({ name: normalizePackageName(name), version, packageManager: "pnpm", lockfilePath, integrity, source: typeof resolution.tarball === "string" ? resolution.tarball : null, dependencies: [...new Set(dependencies)].sort(), artifactBytesCaptured: false, artifactIntegrityVerified: false, installationHooks: value.requiresBuild === true ? "declared-present" : "unknown-without-artifact" });
  }
  return result;
}

function workspaceExportTargets(manifest: Record<string, unknown>, subpath: string): string[] {
  const exportsValue = manifest.exports;
  let selected = exportsValue;
  if (exportsValue && typeof exportsValue === "object" && !Array.isArray(exportsValue)) {
    const exportsObject = exportsValue as Record<string, unknown>;
    if (Object.keys(exportsObject).some(key => key.startsWith("."))) {
      if (Object.prototype.hasOwnProperty.call(exportsObject, subpath)) selected = exportsObject[subpath];
      else {
        const patterns = Object.keys(exportsObject)
          .filter(key => key.includes("*") && key.split("*").length === 2)
          .map(key => {
            const [prefix, suffix] = key.split("*");
            return subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= prefix.length + suffix.length ? { key, prefix, suffix, capture: subpath.slice(prefix.length, subpath.length - suffix.length || undefined) } : null;
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => b.prefix.length + b.suffix.length - (a.prefix.length + a.suffix.length));
        const match = patterns[0];
        selected = match ? replaceExportWildcard(exportsObject[match.key], match.capture) : undefined;
      }
    }
  }
  const targets = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string" && value.startsWith("./")) targets.add(value.slice(2));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(visit);
  };
  if (exportsValue !== undefined) visit(selected);
  else
    for (const key of ["types", "typings", "module", "main"]) {
      const value = manifest[key];
      if (typeof value === "string") targets.add(value.replace(/^\.\//, ""));
    }
  if (!targets.size && subpath === "." && exportsValue === undefined) targets.add("src/index.ts");
  return [...targets].sort();
}

function replaceExportWildcard(value: unknown, capture: string): unknown {
  if (typeof value === "string") return value.replaceAll("*", capture);
  if (Array.isArray(value)) return value.map(item => replaceExportWildcard(item, capture));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, replaceExportWildcard(child, capture)]));
  return value;
}

async function resolveWorkspacePackageFiles(root: string, item: WorkspacePackage, subpath: string): Promise<{ files: string[]; unresolved: string[] }> {
  const packageRoot = dirname(resolve(root, item.manifestPath));
  const found = new Set<string>();
  const unresolved = new Set<string>();
  for (const exportTarget of workspaceExportTargets(item.manifest, subpath)) {
    if (exportTarget.includes("*") || isAbsolute(exportTarget)) {
      unresolved.add(exportTarget);
      continue;
    }
    const base = resolve(packageRoot, exportTarget);
    const rel = relative(root, base);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) {
      unresolved.add(exportTarget);
      continue;
    }
    let targetFound = false;
    for (const candidate of [rel, ...SOURCE_EXTENSIONS.map(ext => `${rel}${ext}`), ...SOURCE_EXTENSIONS.map(ext => join(rel, `index${ext}`))]) {
      try {
        const safePath = safeRelative(root, candidate);
        const absolute = await assertRegularFileWithoutSymlinkParents(root, safePath);
        if ((await lstat(absolute)).isFile()) {
          found.add(safePath);
          targetFound = true;
        }
      } catch {
        /* absent export target is reported by the caller */
      }
    }
    if (!targetFound) unresolved.add(exportTarget);
  }
  return { files: [...found].sort(), unresolved: [...unresolved].sort() };
}

/**
 * Resolve static in-repository imports and preserve all unresolved/dynamic or
 * external-package edges as explicit closure gaps. This is discovery evidence,
 * never an admission decision or proof that an external package cache is safe.
 */
export async function discoverSourceClosure(input: SourceClosureInput): Promise<SourceClosureResult> {
  const sourceRoot = resolve(input.sourceRoot);
  const queue: Array<{ path: string; kind: SourceInputKind }> = [...input.entryPaths.map(path => ({ path, kind: "entry" as const })), ...input.dependencyArtifacts.map(path => ({ path, kind: "dependency-artifact" as const })), ...(input.profileInputs ?? []).map(item => ({ path: item.path, kind: item.kind })), ...(input.workspaceManifestPaths ?? []).map(path => ({ path, kind: "workspace-manifest" as const }))].map(item => ({ ...item, path: safeRelative(sourceRoot, item.path) }));
  const seen = new Set<string>();
  const provenance = new Map<string, Set<SourceInputKind>>();
  const dependencyEdges: SourceDependencyEdge[] = [];
  const external = new Set<string>();
  const declaredExternal = new Set<string>();
  const unresolved: Array<{ from: string; specifier: string }> = [];
  const workspacePackages: WorkspacePackage[] = [];
  for (const manifestPath of input.workspaceManifestPaths ?? []) {
    const safePath = safeRelative(sourceRoot, manifestPath);
    try {
      const manifest = JSON.parse(await readFile(await assertRegularFileWithoutSymlinkParents(sourceRoot, safePath), "utf8")) as Record<string, unknown>;
      if (typeof manifest.name !== "string" || workspacePackages.some(item => item.name === manifest.name)) unresolved.push({ from: safePath, specifier: "<invalid-or-duplicate-workspace-package-name>" });
      else workspacePackages.push({ manifestPath: safePath, name: manifest.name, manifest });
    } catch {
      unresolved.push({ from: safePath, specifier: "<invalid-workspace-package-manifest>" });
    }
  }
  for (const item of input.profileInputs ?? []) {
    dependencyEdges.push({ from: `<profile:${input.profileId ?? "unspecified"}>`, specifier: item.path, to: safeRelative(sourceRoot, item.path), kind: "profile-input", status: "resolved-local" });
  }
  while (queue.length) {
    const queued = queue.shift()!;
    const filePath = queued.path;
    const fileProvenance = provenance.get(filePath) ?? new Set<SourceInputKind>();
    fileProvenance.add(queued.kind);
    provenance.set(filePath, fileProvenance);
    if (seen.has(filePath)) continue;
    let file: string;
    try {
      file = await assertRegularFileWithoutSymlinkParents(sourceRoot, filePath);
    } catch {
      unresolved.push({ from: filePath, specifier: "<missing-or-symlink-file>" });
      continue;
    }
    seen.add(filePath);
    const source = await readFile(file, "utf8");
    if (/(^|\/)(?:requirements|constraints)(?:(?:[-_.][^/]*)|(?:\/[^/]+))?\.txt$/i.test(filePath)) {
      for (const [lineIndex, rawLine] of source.split(/\r?\n/).entries()) {
        const line = rawLine.replace(/\s+#.*$/, "").trim();
        if (!line || line.startsWith("#") || line.startsWith("--")) continue;
        const include = line.match(/^(?:-r|--requirement)\s+(.+)$/);
        if (include) {
          const target = relative(sourceRoot, resolve(sourceRoot, dirname(filePath), include[1].trim().replace(/^['"]|['"]$/g, "")))
            .split(sep)
            .join("/");
          try {
            const safePath = safeRelative(sourceRoot, target);
            await assertRegularFileWithoutSymlinkParents(sourceRoot, safePath);
            dependencyEdges.push({ from: filePath, specifier: `requirement-include:${include[1]}`, to: safePath, kind: "profile-input", status: "resolved-local" });
            queue.push({ path: safePath, kind: "dependency-artifact" });
          } catch {
            unresolved.push({ from: filePath, specifier: `requirement-include:${include[1]}` });
            dependencyEdges.push({ from: filePath, specifier: `requirement-include:${include[1]}`, to: null, kind: "profile-input", status: "unresolved" });
          }
          continue;
        }
        const requirement = line.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?(.*)$/);
        if (!requirement) {
          unresolved.push({ from: filePath, specifier: `requirement-line:${lineIndex + 1}` });
          continue;
        }
        const packageName = requirement[1].toLowerCase().replace(/[-_.]+/g, "-");
        external.add(packageName);
        declaredExternal.add(packageName);
        dependencyEdges.push({ from: filePath, specifier: `${packageName}${requirement[2]}`, to: null, kind: "declared-package-dependency", status: "external-package" });
        if (!/^\s*===?\s*[^;\s]+(?:\s*;.*)?$/.test(requirement[2])) unresolved.push({ from: filePath, specifier: `unpinned-python-dependency:${packageName}` });
      }
    }
    if (filePath.endsWith("pyproject.toml")) {
      for (const requirement of pythonProjectRequirements(source)) {
        const name = requirement.match(/^([A-Za-z0-9_.-]+)/)?.[1];
        if (!name) continue;
        const packageName = normalizePackageName(name);
        external.add(packageName);
        declaredExternal.add(packageName);
        dependencyEdges.push({ from: filePath, specifier: requirement, to: null, kind: "declared-package-dependency", status: "external-package" });
      }
    }
    if (filePath.endsWith("package.json")) {
      try {
        const manifest = JSON.parse(source) as Record<string, unknown>;
        const hasHookConfiguration = ["simple-git-hooks", "husky", "lint-staged", "pre-commit"].some(key => manifest[key] !== undefined);
        if (hasHookConfiguration) {
          if (!(input.profileInputs ?? []).some(item => item.kind === "hook")) unresolved.push({ from: filePath, specifier: "<hook-inputs-not-declared-in-profile>" });
        }
        const dependencies = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"].flatMap(key => Object.entries((manifest[key] && typeof manifest[key] === "object" ? manifest[key] : {}) as Record<string, unknown>));
        const manifestDependencyNames = new Set(dependencies.map(([name]) => normalizePackageName(name)));
        for (const [name, range] of dependencies) {
          const local = workspacePackages.find(item => item.name === name);
          if (!local) {
            external.add(name);
            declaredExternal.add(normalizePackageName(name));
            dependencyEdges.push({ from: filePath, specifier: `${name}@${String(range)}`, to: null, kind: "declared-package-dependency", status: "external-package" });
            continue;
          }
          const resolution = await resolveWorkspacePackageFiles(sourceRoot, local, ".");
          dependencyEdges.push({ from: filePath, specifier: `${name}@${String(range)}`, to: resolution.files[0] ?? local.manifestPath, kind: "workspace-dependency", status: resolution.files.length && !resolution.unresolved.length ? "resolved-local" : "unresolved" });
          queue.push({ path: local.manifestPath, kind: "workspace-manifest" });
          for (const target of resolution.files) queue.push({ path: target, kind: "source-import" });
          for (const target of resolution.unresolved) unresolved.push({ from: filePath, specifier: `${name}<unresolved-export:${target}>` });
          if (!resolution.files.length) unresolved.push({ from: filePath, specifier: `${name}<workspace-export-unresolved>` });
        }
        if (hasHookConfiguration) {
          const hookConfig = manifest["simple-git-hooks"] ?? (manifest.husky && typeof manifest.husky === "object" ? (manifest.husky as Record<string, unknown>).hooks : undefined) ?? manifest["lint-staged"] ?? manifest["pre-commit"];
          const hookCommands: string[] = [];
          const collectCommands = (value: unknown) => {
            if (typeof value === "string") hookCommands.push(value);
            else if (Array.isArray(value)) value.forEach(collectCommands);
            else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(collectCommands);
          };
          collectCommands(hookConfig);
          for (const profileHook of (input.profileInputs ?? []).filter(item => item.kind === "hook")) {
            try {
              const hookPath = safeRelative(sourceRoot, profileHook.path);
              const hookSource = await readFile(await assertRegularFileWithoutSymlinkParents(sourceRoot, hookPath), "utf8");
              collectCommands(hookSource.split(/\r?\n/).filter(line => !line.trim().startsWith("#")));
              dependencyEdges.push({ from: filePath, specifier: `hook-input:${profileHook.path}`, to: hookPath, kind: "profile-input", status: "resolved-local" });
            } catch {
              unresolved.push({ from: filePath, specifier: `<missing-hook-input:${profileHook.path}>` });
            }
          }
          for (const hookCommand of hookCommands) {
            for (const executable of unresolvedCommandDependencies(hookCommand, manifestDependencyNames)) unresolved.push({ from: filePath, specifier: `<hook-command-dependency:${executable}>` });
          }
        }
        const scripts = (manifest.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {}) as Record<string, unknown>;
        for (const [scriptName, command] of Object.entries(scripts)) {
          if (typeof command !== "string") continue;
          for (const executable of unresolvedCommandDependencies(command, manifestDependencyNames)) unresolved.push({ from: filePath, specifier: `<script-command-dependency:${scriptName}:${executable}>` });
          const refs = [...command.matchAll(/(?:^|\s)(?:node|tsx|vitest|vite|python(?:3)?|bash|sh)\s+([\w./@-]+\.(?:ts|tsx|js|mjs|cjs|py|sh))(?:\s|$)/g)].map(match => match[1]);
          for (const ref of refs) {
            const candidate = relative(sourceRoot, resolve(sourceRoot, dirname(filePath), ref))
              .split(sep)
              .join("/");
            try {
              const safePath = safeRelative(sourceRoot, candidate);
              await assertRegularFileWithoutSymlinkParents(sourceRoot, safePath);
              dependencyEdges.push({ from: filePath, specifier: `script:${scriptName}:${ref}`, to: safePath, kind: "profile-input", status: "resolved-local" });
              queue.push({ path: safePath, kind: "executable" });
            } catch {
              dependencyEdges.push({ from: filePath, specifier: `script:${scriptName}:${ref}`, to: null, kind: "profile-input", status: "unresolved" });
              unresolved.push({ from: filePath, specifier: `script:${scriptName}:${ref}` });
            }
          }
        }
      } catch {
        unresolved.push({ from: filePath, specifier: "<invalid-package-json>" });
      }
    }
    const declaredProfileInput = (input.profileInputs ?? []).find(item => item.path === filePath);
    if (declaredProfileInput?.kind === "hook" && !SOURCE_EXTENSIONS.some(ext => filePath.endsWith(ext))) unresolved.push({ from: filePath, specifier: "<hook-executable-closure-unverified>" });
    const imports = SOURCE_EXTENSIONS.some(ext => filePath.endsWith(ext)) ? importsIn(source, filePath) : { local: [] as string[], external: [] as string[], dynamic: [] as string[], unresolved: [] as string[] };
    for (const name of imports.external) {
      const local = workspacePackages.find(item => name === item.name || name.startsWith(`${item.name}/`));
      if (local) {
        const subpath = name === local.name ? "." : `./${name.slice(local.name.length + 1)}`;
        const resolution = await resolveWorkspacePackageFiles(sourceRoot, local, subpath);
        dependencyEdges.push({ from: filePath, specifier: name, to: resolution.files[0] ?? null, kind: "static-import", status: resolution.files.length && !resolution.unresolved.length ? "resolved-local" : "unresolved" });
        queue.push({ path: local.manifestPath, kind: "workspace-manifest" });
        for (const target of resolution.files) queue.push({ path: target, kind: "source-import" });
        for (const target of resolution.unresolved) unresolved.push({ from: filePath, specifier: `${name}<unresolved-export:${target}>` });
        if (!resolution.files.length) unresolved.push({ from: filePath, specifier: name });
      } else {
        external.add(name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0]);
        dependencyEdges.push({ from: filePath, specifier: name, to: null, kind: "static-import", status: "external-package" });
      }
    }
    for (const specifier of imports.unresolved) {
      unresolved.push({ from: filePath, specifier });
      dependencyEdges.push({ from: filePath, specifier, to: null, kind: "dynamic-import", status: "unresolved" });
    }
    for (const specifier of imports.dynamic) {
      if (filePath.endsWith(".py") || specifier.startsWith(".") || specifier.startsWith("/")) {
        const resolved = await resolveLocalImport(sourceRoot, filePath, specifier, input.moduleRoots);
        if (resolved) {
          dependencyEdges.push({ from: filePath, specifier, to: resolved, kind: "dynamic-import", status: "resolved-local" });
          queue.push({ path: resolved, kind: "source-import" });
        } else {
          unresolved.push({ from: filePath, specifier });
          dependencyEdges.push({ from: filePath, specifier, to: null, kind: "dynamic-import", status: "unresolved" });
        }
      } else {
        const local = workspacePackages.find(item => specifier === item.name || specifier.startsWith(`${item.name}/`));
        if (local) {
          const subpath = specifier === local.name ? "." : `./${specifier.slice(local.name.length + 1)}`;
          const resolution = await resolveWorkspacePackageFiles(sourceRoot, local, subpath);
          dependencyEdges.push({ from: filePath, specifier, to: resolution.files[0] ?? null, kind: "dynamic-import", status: resolution.files.length && !resolution.unresolved.length ? "resolved-local" : "unresolved" });
          queue.push({ path: local.manifestPath, kind: "workspace-manifest" });
          for (const target of resolution.files) queue.push({ path: target, kind: "source-import" });
          for (const target of resolution.unresolved) unresolved.push({ from: filePath, specifier: `${specifier}<unresolved-export:${target}>` });
          if (!resolution.files.length) unresolved.push({ from: filePath, specifier });
        } else {
          const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
          external.add(packageName);
          dependencyEdges.push({ from: filePath, specifier, to: null, kind: "dynamic-import", status: "external-package" });
        }
      }
    }
    for (const specifier of imports.local) {
      const resolved = await resolveLocalImport(sourceRoot, filePath, specifier, input.moduleRoots);
      if (resolved) {
        dependencyEdges.push({ from: filePath, specifier, to: resolved, kind: "static-import", status: "resolved-local" });
        queue.push({ path: resolved, kind: "source-import" });
      } else {
        unresolved.push({ from: filePath, specifier });
        dependencyEdges.push({ from: filePath, specifier, to: null, kind: "static-import", status: "unresolved" });
      }
    }
  }
  const hasJavaScript = filesHaveExtension(seen, [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
  const hasPython = filesHaveExtension(seen, [".py"]);
  if (hasJavaScript) {
    if (![...seen].some(path => path.endsWith("package.json"))) unresolved.push({ from: "<profile>", specifier: "<node-package-manifest-not-in-profile>" });
    if (![...seen].some(path => ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"].some(name => path.endsWith(name)))) unresolved.push({ from: "<profile>", specifier: "<node-lockfile-not-in-profile>" });
  }
  if (hasPython && ![...seen].some(path => path === "pyproject.toml" || path === "Pipfile.lock" || path === "poetry.lock" || path === "uv.lock" || /(^|\/)requirements[^/]*\.txt$/i.test(path))) unresolved.push({ from: "<profile>", specifier: "<python-dependency-manifest-not-in-profile>" });
  if (hasPython)
    for (const path of seen) {
      if (["poetry.lock", "Pipfile.lock"].includes(path)) unresolved.push({ from: path, specifier: "<python-lockfile-package-edges-unresolved>" });
    }
  const lockfilePaths = [...seen].filter(path => path.endsWith("package-lock.json") || path.endsWith("npm-shrinkwrap.json") || path.endsWith("pnpm-lock.yaml") || path.endsWith("yarn.lock") || path.endsWith("uv.lock"));
  const lockedPackages: SourceExternalPackageIdentity[] = [];
  for (const lockfilePath of lockfilePaths) {
    try {
      const lockSource = await readFile(await assertRegularFileWithoutSymlinkParents(sourceRoot, lockfilePath), "utf8");
      if (lockfilePath.endsWith("uv.lock")) lockedPackages.push(...parseUvLockPackages(lockSource, lockfilePath));
      else lockedPackages.push(...parseNodeLockPackages(lockSource, lockfilePath));
    } catch {
      unresolved.push({ from: lockfilePath, specifier: "<dependency-lockfile-parse-failed>" });
    }
  }
  for (const name of [...external].sort()) {
    const normalized = normalizePackageName(name);
    const matches = lockedPackages.filter(item => item.name === normalized);
    if (!matches.length) {
      if (declaredExternal.has(normalized) || lockfilePaths.length) unresolved.push({ from: "<dependency-lockfile>", specifier: `external-package-lock-entry-missing:${normalized}` });
    } else if (matches.every(item => item.integrity.length === 0)) {
      unresolved.push({ from: matches[0].lockfilePath, specifier: `external-package-integrity-missing:${normalized}` });
    }
  }
  for (const lockfilePath of lockfilePaths) {
    const packages = lockedPackages.filter(item => item.lockfilePath === lockfilePath);
    const packageNameCounts = new Map<string, number>();
    for (const item of packages) packageNameCounts.set(item.name, (packageNameCounts.get(item.name) ?? 0) + 1);
    for (const item of packages) {
      if (!item.integrity.length) unresolved.push({ from: lockfilePath, specifier: `external-package-integrity-missing:${item.name}@${item.version}` });
      for (const dependency of item.dependencies) {
        const matches = packageNameCounts.get(dependency) ?? 0;
        if (!matches) unresolved.push({ from: lockfilePath, specifier: `transitive-package-lock-entry-missing:${item.name}->${dependency}` });
        else if (matches > 1) unresolved.push({ from: lockfilePath, specifier: `transitive-package-resolution-ambiguous:${item.name}->${dependency}` });
      }
    }
  }
  const externalPackageIdentities = [...lockedPackages].sort((a, b) => compareText(a.lockfilePath, b.lockfilePath) || compareText(a.name, b.name) || compareText(a.version, b.version));
  if (!input.profileId?.trim()) unresolved.push({ from: "<profile>", specifier: "<profile-id-missing>" });
  if (!input.runtimeIdentity?.packageManager?.trim() || (!input.runtimeIdentity.node?.trim() && !input.runtimeIdentity.python?.trim())) unresolved.push({ from: "<profile>", specifier: "<runtime-identity-incomplete>" });
  const externalImports = [...external].sort();
  const files = [...seen].sort();
  return {
    discoveryMode: "static-plus-explicit-profile-v1",
    admissionEligible: false,
    files,
    provenance: Object.fromEntries([...provenance].sort(([a], [b]) => compareText(a, b)).map(([path, kinds]) => [path, [...kinds].sort()])),
    profileId: input.profileId ?? "",
    runtimeIdentity: input.runtimeIdentity ?? {},
    packageIdentities: workspacePackages.map(item => ({ name: item.name, version: typeof item.manifest.version === "string" ? item.manifest.version : null, manifestPath: item.manifestPath, origin: "workspace" as const })).sort((a, b) => compareText(a.name, b.name)),
    externalPackageIdentities,
    dependencyEdges: dependencyEdges.sort((a, b) => compareText(a.from, b.from) || compareText(a.specifier, b.specifier) || compareText(a.to ?? "", b.to ?? "")),
    externalImports,
    unresolvedImports: unresolved.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0)),
    closureComplete: unresolved.length === 0 && externalImports.length === 0,
  };
}

export async function assembleReadOnlySourceBundle(input: { sourceRoot: string; destination: string; closure: SourceClosureResult; sourceRevision: string; specDigest: string; dependencyArtifacts: string[] }): Promise<SourceBundleManifest> {
  const sourceRoot = resolve(input.sourceRoot);
  const destination = resolve(input.destination);
  const closure = input.closure;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(input.sourceRevision) || !/^[a-f0-9]{64}$/i.test(input.specDigest) || !closure.profileId.trim() || !closure.runtimeIdentity.packageManager?.trim() || (!closure.runtimeIdentity.node?.trim() && !closure.runtimeIdentity.python?.trim())) throw new Error("SPEC224_BUNDLE_BASELINE_INVALID");
  if (!closure.closureComplete || closure.externalImports.length || closure.unresolvedImports.length || closure.dependencyEdges.some(edge => edge.status !== "resolved-local")) throw new Error("SPEC224_BUNDLE_CLOSURE_INCOMPLETE");
  const destRelative = relative(sourceRoot, destination);
  if (!destRelative || (destRelative !== ".." && !destRelative.startsWith(`..${sep}`))) throw new Error("SPEC224_BUNDLE_DESTINATION_INSIDE_SOURCE");
  const files = [...new Set(closure.files.map(file => safeRelative(sourceRoot, file)))].sort();
  if (!files.length || files.length !== closure.files.length) throw new Error("SPEC224_BUNDLE_FILE_SET_INVALID");
  const dependencyArtifacts = input.dependencyArtifacts.map(file => safeRelative(sourceRoot, file)).sort();
  if (new Set(dependencyArtifacts).size !== dependencyArtifacts.length) throw new Error("SPEC224_BUNDLE_DEPENDENCY_ARTIFACT_DUPLICATE");
  if (dependencyArtifacts.some(file => !files.includes(file))) throw new Error("SPEC224_BUNDLE_DEPENDENCY_ARTIFACT_MISSING");
  const content: Array<{ path: string; bytes: Buffer; mode: number }> = [];
  for (const filePath of files) {
    const sourcePath = await assertRegularFileWithoutSymlinkParents(sourceRoot, filePath);
    const before = await lstat(sourcePath);
    const bytes = await readFile(sourcePath);
    const after = await lstat(sourcePath);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.mode !== after.mode || bytes.byteLength !== after.size) throw new Error("SPEC224_BUNDLE_SOURCE_CHANGED_DURING_ASSEMBLY");
    content.push({ path: filePath, bytes, mode: before.mode & 0o777 });
  }
  const fileSet = new Set(files);
  const provenanceEntries = Object.entries(closure.provenance);
  if (provenanceEntries.length !== files.length || provenanceEntries.some(([path, kinds]) => !fileSet.has(safeRelative(sourceRoot, path)) || !Array.isArray(kinds) || kinds.length === 0)) throw new Error("SPEC224_BUNDLE_PROVENANCE_INVALID");
  const dependencyEdges = [...closure.dependencyEdges];
  const packageIdentities = [...closure.packageIdentities];
  if (new Set(packageIdentities.map(item => item.name)).size !== packageIdentities.length || packageIdentities.some(item => !item.name.trim() || !fileSet.has(safeRelative(sourceRoot, item.manifestPath)) || !item.manifestPath.endsWith("package.json"))) throw new Error("SPEC224_BUNDLE_PACKAGE_IDENTITY_INVALID");
  if (closure.externalPackageIdentities.some(item => !item.name.trim() || !item.version.trim() || !fileSet.has(safeRelative(sourceRoot, item.lockfilePath)) || item.artifactBytesCaptured !== false || item.artifactIntegrityVerified !== false || !["declared-present", "unknown-without-artifact"].includes(item.installationHooks) || item.integrity.some(hash => !/^(?:sha256:[a-f0-9]{64}|sha(?:256|384|512)-[A-Za-z0-9+/=]+)$/i.test(hash)))) throw new Error("SPEC224_BUNDLE_EXTERNAL_PACKAGE_IDENTITY_INVALID");
  if (dependencyEdges.some(edge => edge.status === "resolved-local" && (!edge.to || !fileSet.has(safeRelative(sourceRoot, edge.to))))) throw new Error("SPEC224_BUNDLE_EDGE_TARGET_MISSING");
  if (dependencyEdges.some(edge => (edge.from.startsWith("<profile:") ? false : !fileSet.has(safeRelative(sourceRoot, edge.from))))) throw new Error("SPEC224_BUNDLE_EDGE_SOURCE_MISSING");
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
    schemaVersion: "spec224.source-bundle.v2" as const,
    discoveryMode: "static-plus-explicit-profile-v1" as const,
    admissionEligible: false as const,
    sourceRevision: input.sourceRevision,
    specDigest: input.specDigest,
    profileId: closure.profileId,
    runtimeIdentity: closure.runtimeIdentity,
    packageIdentities: packageIdentities.sort((a, b) => compareText(a.name, b.name)),
    externalPackageIdentities: [...closure.externalPackageIdentities].sort((a, b) => compareText(a.name, b.name) || compareText(a.version, b.version) || compareText(a.lockfilePath, b.lockfilePath)),
    dependencyArtifacts,
    files: content.map(({ path, bytes, mode }) => ({ path, sha256: sha256(bytes), sizeBytes: bytes.byteLength, mode, provenance: [...new Set(closure.provenance[path] ?? [])].sort() as SourceInputKind[] })),
    dependencyEdges: dependencyEdges.sort((a, b) => compareText(a.from, b.from) || compareText(a.specifier, b.specifier) || compareText(a.to ?? "", b.to ?? "")),
    externalImports: [...closure.externalImports].sort(),
    unresolvedImports: [...closure.unresolvedImports].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0)),
    closureComplete: true,
  };
  const manifest: SourceBundleManifest = { ...manifestBase, bundleDigest: sha256(canonicalJson(manifestBase)) };
  const manifestPath = join(destination, BUNDLE_MANIFEST);
  await writeFile(manifestPath, `${canonicalJson(manifest)}\n`, { flag: "wx", mode: 0o444 });
  await chmod(manifestPath, 0o444);
  const directories = new Set<string>([destination]);
  for (const filePath of files) {
    let current = dirname(resolve(destination, filePath));
    while (current !== destination) {
      directories.add(current);
      current = dirname(current);
    }
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) await chmod(directory, 0o555);
  return manifest;
}

/** Content-integrity check only; it does not attest owner approval or runtime isolation. */
export async function verifyReadOnlySourceBundle(bundlePath: string): Promise<{ valid: boolean; integrityOnly: true; reason: string | null }> {
  const root = resolve(bundlePath);
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return { valid: false, integrityOnly: true, reason: "bundle_root_invalid" };
    const manifestFile = await assertRegularFileWithoutSymlinkParents(root, BUNDLE_MANIFEST);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as SourceBundleManifest;
    const { bundleDigest, ...base } = manifest;
    if (((manifest.schemaVersion as string) !== "spec224.source-bundle.v1" && (manifest.schemaVersion as string) !== "spec224.source-bundle.v2") || sha256(canonicalJson(base)) !== bundleDigest) return { valid: false, integrityOnly: true, reason: "manifest_digest_mismatch" };
    const expected = new Set([...manifest.files.map(file => file.path), BUNDLE_MANIFEST]);
    const expectedDirectories = new Set<string>([""]);
    for (const file of manifest.files) {
      let parent = dirname(file.path);
      while (parent !== ".") {
        expectedDirectories.add(parent);
        parent = dirname(parent);
      }
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
        } else if (entry.isFile()) actual.push(rel);
        else throw new Error("non_regular_entry_detected");
      }
    };
    await walk(root);
    if (actual.length !== expected.size || actual.some(path => !expected.has(path)) || actualDirectories.size !== expectedDirectories.size || [...actualDirectories].some(path => !expectedDirectories.has(path))) return { valid: false, integrityOnly: true, reason: "file_set_mismatch" };
    if ((await lstat(root)).mode & 0o222) return { valid: false, integrityOnly: true, reason: "writable_bundle_root" };
    if ((await lstat(join(root, BUNDLE_MANIFEST))).mode & 0o222) return { valid: false, integrityOnly: true, reason: "writable_manifest" };
    for (const file of manifest.files) {
      const safePath = safeRelative(root, file.path);
      const absolute = await assertRegularFileWithoutSymlinkParents(root, safePath);
      const stat = await lstat(absolute);
      const bytes = await readFile(absolute);
      if (sha256(bytes) !== file.sha256 || bytes.byteLength !== file.sizeBytes || (stat.mode & 0o222) !== 0 || (manifest.schemaVersion === "spec224.source-bundle.v2" && (!Number.isInteger(file.mode) || !Array.isArray(file.provenance) || file.provenance.length === 0))) return { valid: false, integrityOnly: true, reason: "file_content_or_mode_mismatch" };
    }
    return { valid: true, integrityOnly: true, reason: null };
  } catch (error) {
    return { valid: false, integrityOnly: true, reason: error instanceof Error ? error.message : "bundle_read_failed" };
  }
}
