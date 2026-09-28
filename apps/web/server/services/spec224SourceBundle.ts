import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import yaml from "js-yaml";
import * as ts from "typescript";
import {
  verifySpec224ExecutionProfile,
  type Spec224ExecutionProfile,
} from "./spec224ExecutionProfile";

const BUNDLE_MANIFEST = ".spec224-source-bundle.json";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs"];
const PYTHON_TOP_LEVEL = new Set(["os", "sys", "typing", "pathlib", "json", "re", "hashlib", "datetime", "logging", "asyncio", "subprocess", "importlib", "__future__"]);
const NODE_BUILTINS = new Set(["assert", "buffer", "child_process", "crypto", "dns", "events", "fs", "http", "https", "module", "net", "os", "path", "process", "stream", "url", "util", "zlib"]);

export type SourceInputKind = "entry" | "dependency-artifact" | "runtime-config" | "test-fixture" | "generated-artifact" | "executable" | "hook" | "workspace-manifest" | "source-import";
export type SourceDependencyEdge = {
  from: string;
  specifier: string;
  to: string | null;
  kind: "static-import" | "dynamic-import" | "workspace-dependency" | "declared-package-dependency" | "profile-input";
  status: "resolved-local" | "verified-external-artifact" | "optional-dependency-excluded" | "profile-dependency-excluded" | "external-package" | "unresolved";
};
export type SourceBundleFile = {
  path: string;
  sha256: string;
  sizeBytes: number;
  mode: number;
  provenance: SourceInputKind[];
};
export type GitTreeSourceFile = Pick<SourceBundleFile, "path" | "sha256" | "sizeBytes" | "mode">;
export type GitTreeSourceManifest = {
  schemaVersion: "spec224.git-tree-source-attestation.v1" | "spec224.git-tree-source-attestation.v2";
  scopeMode?: "exact-path-set";
  sourceRevision: string;
  /** Relative subtree in the immutable repository tree; `.` means the repository root. */
  treePath: string;
  files: GitTreeSourceFile[];
  manifestDigest: string;
};
export type GitTreeSourceAttestation = {
  valid: true;
  sourceRevision: string;
  treePath: string;
  manifestDigest: string;
  fileCount: number;
};
export type SourcePackageIdentity = {
  name: string;
  version: string | null;
  manifestPath: string;
  origin: "workspace";
};
export type SourceLockedArtifact = {
  source: string | null;
  integrity: string[];
  kind: "npm-tarball" | "python-wheel" | "python-sdist" | "cargo-crate";
  sizeBytes: number | null;
};
export type SourceExternalPackageIdentity = {
  name: string;
  version: string;
  locator: string;
  packageManager: "npm" | "pnpm" | "uv" | "cargo";
  lockfilePath: string;
  integrity: string[];
  source: string | null;
  dependencies: string[];
  optionalDependencies: string[];
  /** uv lock edges retain their resolution context for profile-specific verification. */
  uvDependencyRelations?: Array<{ name: string; marker?: string; extra?: string; version?: string; source?: string }>;
  resolutionContext?: string[];
  dependencyLocators: Record<string, string | null>;
  optionalDependencyLocators: Record<string, string | null>;
  lockedArtifacts: SourceLockedArtifact[];
  artifactStatus: "NOT_REQUIRED" | "UNVERIFIED_ARTIFACT" | "VERIFIED_ARTIFACT";
  artifactPath: string | null;
  artifactSha256: string | null;
  artifactSizeBytes: number | null;
  artifactPlatform: string | null;
  artifactSource: string | null;
  artifactKind: SourceLockedArtifact["kind"] | null;
  artifactIntegrity: string[];
  os: string[];
  cpu: string[];
};
export type SourceExternalArtifactBinding = {
  name: string;
  version: string;
  locator: string;
  packageManager: "npm" | "pnpm" | "uv" | "cargo";
  lockfilePath: string;
  path: string;
  source: string | null;
  kind: SourceLockedArtifact["kind"];
  platform: string;
};
export type SourceCargoTargetSelection = {
  manifestPath: string;
  target: string;
  /** Runtime binary dependency graph: ordinary dependencies plus build/proc-macro edges, never dev-dependencies. */
  profile: "runtime-binary-v1";
  cargoVersion: string;
};
export type SourcePythonCompatibility = {
  /** Exact compressed-tag expansion emitted by the selected interpreter's packaging.tags.sys_tags(). */
  compatibleWheelTags: string[];
  markerEnvironment: Record<string, string>;
};
export type SourceBundleManifest = {
  schemaVersion: "spec224.source-bundle.v2";
  discoveryMode: "static-plus-explicit-profile-v1";
  admissionEligible: false;
  sourceRevision: string;
  specDigest: string;
  profileDigest?: string;
  sourceTreeAttestation?: { schemaVersion: GitTreeSourceManifest["schemaVersion"]; scopeMode?: "exact-path-set"; treePath: string; manifestDigest: string };
  profileId: string;
  runtimeIdentity: {
    node?: string;
    python?: string;
    cargo?: string;
    rustc?: string;
    packageManager?: string;
    platform?: string;
    architecture?: string;
  };
  selectedOptionalDependencies: string[];
  selectedPythonDependencyGroups: string[];
  selectedPythonExtras: string[];
  pythonDependencySelections?: Record<string, { runtime?: string[]; test?: string[]; optional?: string[]; devOnly?: string[] }>;
  pythonStandardLibraryModules?: string[];
  selectedCargoTargets: SourceCargoTargetSelection[];
  selectedCargoPackageLocators: Record<string, string[]>;
  rustCompileTimeEnvironment: Record<string, string | null>;
  /** Per-manifest dependencies included by an exact execution profile. */
  selectedManifestDependencies?: Record<string, string[]>;
  /** Per-manifest scripts whose command/runtime edges belong to this profile. */
  selectedManifestScripts?: Record<string, string[]>;
  requiredExternalPackages: string[];
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
  profileInputs?: Array<{
    path: string;
    kind: Exclude<SourceInputKind, "entry" | "dependency-artifact">;
  }>;
  /** Workspace package manifests whose exports and local dependencies are in scope. */
  workspaceManifestPaths?: string[];
  profileId?: string;
  runtimeIdentity?: {
    node?: string;
    python?: string;
    cargo?: string;
    rustc?: string;
    packageManager?: string;
    platform?: string;
    architecture?: string;
    /** Explicit interpreter tags and PEP 508 values; missing values fail closed when required. */
    pythonCompatibility?: SourcePythonCompatibility;
  };
  /** Optional dependency names admitted by this exact execution profile. */
  selectedOptionalDependencies?: string[];
  /** Selected uv dependency groups and project/package extras for this exact Python profile. */
  selectedPythonDependencyGroups?: string[];
  selectedPythonExtras?: string[];
  pythonDependencySelections?: Record<string, { runtime?: string[]; test?: string[]; optional?: string[]; devOnly?: string[] }>;
  /** Exact top-level modules reported by the selected Python interpreter. */
  pythonStandardLibraryModules?: string[];
  /** Require interpreter-derived stdlib evidence for this exact profile. */
  requireCompletePythonStandardLibrary?: boolean;
  /** Cargo's locked/offline target graph for selected executable targets. */
  cargoTargetSelections?: SourceCargoTargetSelection[];
  /** Exact non-secret compile-time Rust environment bindings; null means explicitly absent. */
  rustCompileTimeEnvironment?: Record<string, string | null>;
  /** Narrow manifest roots; statically imported packages remain mandatory. */
  selectedManifestDependencies?: Record<string, string[]>;
  /** Inspect only these script commands; unknown selected names fail closed. */
  selectedManifestScripts?: Record<string, string[]>;
  /** Original artifacts staged in sourceRoot; each binding must exactly match its lock entry. */
  externalArtifacts?: SourceExternalArtifactBinding[];
  /** Optional roots for absolute in-repository imports such as Python `app.*`. */
  moduleRoots?: Array<{
    prefix: string;
    root: string;
    language: "python" | "javascript";
  }>;
  /** Canonical digest from the exact execution profile manifest. */
  profileDigest?: string;
  /** Verified canonical profile; required whenever a digest is supplied. */
  executionProfile?: Spec224ExecutionProfile;
};

export type SourceClosureResult = {
  discoveryMode: "static-plus-explicit-profile-v1";
  admissionEligible: false;
  files: string[];
  provenance: Record<string, SourceInputKind[]>;
  profileId: string;
  profileDigest?: string;
  runtimeIdentity: {
    node?: string;
    python?: string;
    cargo?: string;
    rustc?: string;
    packageManager?: string;
    platform?: string;
    architecture?: string;
    pythonCompatibility?: SourcePythonCompatibility;
  };
  selectedOptionalDependencies: string[];
  selectedPythonDependencyGroups: string[];
  selectedPythonExtras: string[];
  pythonDependencySelections?: Record<string, { runtime?: string[]; test?: string[]; optional?: string[]; devOnly?: string[] }>;
  pythonStandardLibraryModules: string[];
  selectedCargoTargets: SourceCargoTargetSelection[];
  selectedCargoPackageLocators: Record<string, string[]>;
  dependencyArtifacts: string[];
  rustCompileTimeEnvironment: Record<string, string | null>;
  selectedManifestDependencies?: Record<string, string[]>;
  selectedManifestScripts?: Record<string, string[]>;
  requiredExternalPackages: string[];
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

function integrityMatches(bytes: Buffer, integrity: string[]): boolean {
  return integrity.some(value => {
    const item = value.trim();
    const colonHash = item.match(/^sha256:([a-f0-9]{64})$/i);
    if (colonHash) return sha256(bytes) === colonHash[1].toLowerCase();
    const sri = item.match(/^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/);
    if (!sri) return false;
    const digest = createHash(sri[1]).update(bytes).digest("base64");
    return digest === sri[2];
  });
}

function artifactBindingsFor(identity: SourceExternalPackageIdentity, bindings: SourceExternalArtifactBinding[]): SourceExternalArtifactBinding[] {
  return bindings.filter(binding => binding.name === identity.name && binding.version === identity.version && binding.locator === identity.locator && binding.packageManager === identity.packageManager && binding.lockfilePath === identity.lockfilePath);
}

function platformMatches(runtimePlatform: string | undefined, artifactPlatform: string, source: string | null): boolean {
  if (!runtimePlatform || runtimePlatform !== artifactPlatform) return false;
  // Wheel tags encode ABI/architecture/OS; require the profile tokens to be
  // represented in the pinned artifact filename rather than guessing support.
  if (/\.whl(?:$|[?#])/i.test(source ?? "")) {
    const normalized = (source ?? "").toLowerCase().replaceAll("-", "_");
    const tokens = runtimePlatform.toLowerCase().replaceAll("-", "_").split("_").filter(Boolean);
    return tokens.every(token => normalized.includes(token));
  }
  return true;
}

function pythonWheelMatchesProfile(source: string | null, profile: SourcePythonCompatibility | undefined): boolean {
  if (!source || !profile || !profile.compatibleWheelTags.length) return false;
  const filename = source.split(/[?#]/, 1)[0].split("/").at(-1) ?? "";
  if (!filename.endsWith(".whl")) return false;
  const parts = filename.slice(0, -4).split("-");
  if (parts.length < 5) return false;
  const pythonTags = parts.at(-3)!.split(".");
  const abiTags = parts.at(-2)!.split(".");
  const platformTags = parts.at(-1)!.split(".");
  const compatible = new Set(profile.compatibleWheelTags);
  return pythonTags.some(python => abiTags.some(abi => platformTags.some(platform => compatible.has(`${python}-${abi}-${platform}`))));
}

function packagePlatformCompatible(identity: SourceExternalPackageIdentity, runtimePlatform: string | undefined): boolean {
  if (!runtimePlatform) return false;
  const [runtimeOs, runtimeCpu] = runtimePlatform.toLowerCase().split(/[-_]/, 2);
  const matches = (constraints: string[], actual: string | undefined) => {
    const positive = constraints.filter(item => !item.startsWith("!")).map(item => item.toLowerCase());
    const negative = constraints.filter(item => item.startsWith("!")).map(item => item.slice(1).toLowerCase());
    return (!positive.length || positive.includes(actual ?? "")) && !negative.includes(actual ?? "");
  };
  return matches(identity.os, runtimeOs) && matches(identity.cpu, runtimeCpu);
}

function cargoTargetMatchesRuntime(target: string, runtimePlatform: string | undefined): boolean {
  const targetByPlatform: Record<string, string> = {
    "linux-x86_64": "x86_64-unknown-linux-gnu",
    "linux-aarch64": "aarch64-unknown-linux-gnu",
    "windows-x86_64": "x86_64-pc-windows-msvc",
    "macos-x86_64": "x86_64-apple-darwin",
    "macos-aarch64": "aarch64-apple-darwin",
  };
  return Boolean(runtimePlatform && targetByPlatform[runtimePlatform] === target);
}

type ExternalRoot = { name: string; requesterPath: string; specifier?: string; source?: string; extras?: string[]; marker?: string; lockfileAlias?: string };
type ParsedDependencyLock = { packages: SourceExternalPackageIdentity[]; importers: Record<string, Record<string, string | null>> };

function importerPathFor(requesterPath: string, importers: Record<string, Record<string, string | null>>): string | null {
  const requesterDirectory = dirname(requesterPath).split(sep).join("/");
  return Object.keys(importers).filter(path => !path || path === "." || requesterDirectory === path || requesterDirectory.startsWith(`${path}/`)).sort((a, b) => b.length - a.length)[0] ?? null;
}

function resolveNpmLocator(name: string, requesterPath: string, locators: Set<string>): string | null {
  let directory = dirname(requesterPath).split(sep).join("/");
  while (true) {
    const candidate = `${directory && directory !== "." ? `${directory}/` : ""}node_modules/${name}`;
    if (locators.has(candidate)) return candidate;
    if (!directory || directory === ".") break;
    const parent = dirname(directory).split(sep).join("/");
    directory = parent === directory ? "" : parent;
  }
  return null;
}

type PythonMarkerResult = "true" | "false" | "unknown";

function cargoPackageLocator(name: string, version: string, source: string): string {
  return `${name}@${version}|source=${source}`;
}

function normalizeCargoPackageName(name: string): string {
  return name.toLowerCase().replaceAll("_", "-");
}

function parseCargoLockPackages(source: string, lockfilePath: string): ParsedDependencyLock {
  const packageBlocks = source.split(/^\[\[package\]\]\s*$/m).slice(1);
  const identities: SourceExternalPackageIdentity[] = [];
  const dependencySpecsByLocator = new Map<string, Map<string, { version: string | null; source: string | null }>>();
  for (const block of packageBlocks) {
    const name = block.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
    const version = block.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1];
    const sourceValue = block.match(/^source\s*=\s*["']([^"']+)["']/m)?.[1];
    const checksum = block.match(/^checksum\s*=\s*["']([a-f0-9]{64})["']/im)?.[1]?.toLowerCase();
    // Workspace packages have no registry source/checksum and are represented
    // by the source manifest, not as downloadable crate artifacts.
    if (!name || !version || !sourceValue) continue;
    const integrity = checksum ? [`sha256:${checksum}`] : [];
    const locator = cargoPackageLocator(name, version, sourceValue);
    const dependencySection = block.match(/^dependencies\s*=\s*\[([\s\S]*?)^\s*\]/m)?.[1] ?? "";
    const dependencyEntries = [...dependencySection.matchAll(/^[ \t]*["']([^"']+)["'][,]?[ \t]*$/gm)].map(match => match[1]);
    const dependencies = dependencyEntries.map(entry => entry.match(/^([^\s]+)(?:\s|$)/)?.[1]).filter((value): value is string => Boolean(value));
    const dependencySpecs = new Map(dependencyEntries.flatMap(entry => {
      const match = entry.match(/^([^\s]+)(?:\s+([^\s(]+))?(?:\s+\(([^)]+)\))?/);
      return match ? [[normalizeCargoPackageName(match[1]), { version: match[2] ?? null, source: match[3] ?? null }] as const] : [];
    }));
    const identity: SourceExternalPackageIdentity = {
      name: normalizeCargoPackageName(name),
      version,
      locator: packageLocatorId(lockfilePath, locator),
      packageManager: "cargo",
      lockfilePath,
      integrity,
      source: sourceValue,
      dependencies: [...new Set(dependencies.map(normalizeCargoPackageName))].sort(),
      optionalDependencies: [],
      dependencyLocators: Object.fromEntries([...dependencySpecs.keys()].map(dependency => [dependency, null])),
      optionalDependencyLocators: {},
      lockedArtifacts: [{ source: sourceValue === "registry+https://github.com/rust-lang/crates.io-index" ? `https://static.crates.io/crates/${name}/${name}-${version}.crate` : null, integrity, kind: "cargo-crate", sizeBytes: null }],
      artifactStatus: "NOT_REQUIRED",
      artifactPath: null,
      artifactSha256: null,
      artifactSizeBytes: null,
      artifactPlatform: null,
      artifactSource: null,
      artifactKind: null,
      artifactIntegrity: [],
      os: [],
      cpu: [],
    };
    identities.push(identity);
    dependencySpecsByLocator.set(identity.locator, dependencySpecs);
  }

  for (const identity of identities) {
    const specs = dependencySpecsByLocator.get(identity.locator);
    for (const dependency of identity.dependencies) {
      const spec = specs?.get(dependency);
      const candidates = identities.filter(candidate => candidate.name === dependency
        && (!spec?.version || candidate.version === spec.version)
        && (!spec?.source || candidate.source === spec.source));
      identity.dependencyLocators[dependency] = candidates.length === 1 ? candidates[0].locator : null;
    }
  }
  return { packages: identities, importers: {} };
}

function cargoRequirementMatches(version: string, requirement: string): boolean | null {
  const normalized = requirement.trim().replace(/^v/, "");
  if (!normalized || normalized === "*") return true;
  const target = normalized.replace(/^[~^=\s]+/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || !/^\d+(?:\.\d+){0,2}(?:\.\*)?$/.test(target)) return null;
  // Cargo's prerelease ordering has additional rules; do not treat a prerelease
  // as a stable match using only its numeric components.
  if (version.includes("-")) return null;
  const actualParts = version.split(/[.-]/).slice(0, 3).map(value => Number.parseInt(value, 10));
  const targetParts = target.replace(/\.\*$/, "").split(".").map(value => Number.parseInt(value, 10));
  if (target.endsWith(".*")) return actualParts[0] === targetParts[0] && (targetParts.length === 1 || actualParts[1] === targetParts[1]);
  const padded = [...targetParts, 0, 0].slice(0, 3);
  const compare = (left: number[], right: number[]) => {
    for (let index = 0; index < 3; index++) if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) < (right[index] ?? 0) ? -1 : 1;
    return 0;
  };
  if (normalized.startsWith(">=")) return compare(actualParts, padded) >= 0;
  if (normalized.startsWith("<=")) return compare(actualParts, padded) <= 0;
  if (normalized.startsWith(">")) return compare(actualParts, padded) > 0;
  if (normalized.startsWith("<")) return compare(actualParts, padded) < 0;
  if (normalized.startsWith("=")) return compare(actualParts, padded) === 0;
  if (normalized.startsWith("~")) return actualParts[0] === padded[0] && (targetParts.length < 2 || actualParts[1] === padded[1]) && compare(actualParts, padded) >= 0;
  // Cargo's default caret requirement.
  if (actualParts[0] !== padded[0] || compare(actualParts, padded) < 0) return false;
  if (padded[0] === 0 && targetParts.length > 1 && actualParts[1] !== padded[1]) return false;
  if (padded[0] === 0 && (targetParts[1] ?? 0) === 0 && targetParts.length > 2 && actualParts[2] !== padded[2]) return false;
  return true;
}

function cargoManifestDependencies(source: string, includeDevDependencies = false): Array<{ name: string; alias: string; version: string | null; pathDependency: boolean }> {
  const dependencies = new Map<string, { name: string; alias: string; version: string | null; pathDependency: boolean }>();
  let section = "";
  for (const line of source.split(/\r?\n/)) {
    const header = line.match(/^\s*\[(.+)\]\s*(?:#.*)?$/);
    if (header) {
      section = header[1];
      continue;
    }
    const dependencyKind = section.split(".").at(-1);
    if (dependencyKind !== "dependencies" && dependencyKind !== "build-dependencies" && !(includeDevDependencies && dependencyKind === "dev-dependencies")) continue;
    const assignment = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
    if (!assignment) continue;
    const [, alias, rawValue] = assignment;
    const value = rawValue.replace(/,$/, "").trim();
    const version = value.match(/^(?:"([^"]+)"|'([^']+)')$/)?.slice(1).find(Boolean)
      ?? value.match(/\bversion\s*=\s*["']([^"']+)["']/)?.[1]
      ?? null;
    const packageName = value.match(/\bpackage\s*=\s*["']([^"']+)["']/)?.[1] ?? alias;
    dependencies.set(normalizeCargoPackageName(packageName), { name: packageName, alias, version, pathDependency: /\bpath\s*=/.test(value) });
  }
  return [...dependencies.values()];
}

function hasNestedOutOfLineRustModule(source: string): boolean {
  const inlineModulePattern = /\bmod\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/g;
  for (const match of source.matchAll(inlineModulePattern)) {
    const openBrace = (match.index ?? 0) + match[0].lastIndexOf("{");
    let depth = 0;
    let index = openBrace;
    while (index < source.length) {
      const current = source[index];
      if (current === "m" && source.startsWith("mod", index) && !/[A-Za-z0-9_]/.test(source[index + 3] ?? "")) {
        const moduleDeclaration = source.slice(index + 3).match(/^\s+[A-Za-z_][A-Za-z0-9_]*\s*;/);
        if (moduleDeclaration) return true;
      }
      const rawStringPrefix = source.slice(index).match(/^(?:br|r)(#+)?"/);
      if (rawStringPrefix) {
        const terminator = `"${rawStringPrefix[1] ?? ""}`;
        const stringEnd = source.indexOf(terminator, index + rawStringPrefix[0].length);
        if (stringEnd < 0) return true;
        index = stringEnd + terminator.length;
        continue;
      }
      if (current === "/" && source[index + 1] === "/") {
        index = source.indexOf("\n", index + 2);
        if (index < 0) break;
        continue;
      }
      if (current === "/" && source[index + 1] === "*") {
        let commentDepth = 1;
        index += 2;
        while (index < source.length && commentDepth) {
          if (source[index] === "/" && source[index + 1] === "*") { commentDepth++; index += 2; }
          else if (source[index] === "*" && source[index + 1] === "/") { commentDepth--; index += 2; }
          else index++;
        }
        continue;
      }
      if (current === '"') {
        index++;
        while (index < source.length) {
          if (source[index] === "\\") index += 2;
          else if (source[index++] === '"') break;
        }
        continue;
      }
      if (current === "'") {
        const charEnd = source.indexOf("'", index + 1);
        if (charEnd >= 0 && charEnd - index <= 4 && !source.slice(index, charEnd).includes("\n")) { index = charEnd + 1; continue; }
      }
      if (current === "{") depth++;
      else if (current === "}" && --depth === 0) {
        break;
      }
      index++;
    }
    if (depth !== 0) return true;
  }
  return false;
}

function rustSyntaxOnly(source: string): { source: string; complete: boolean } {
  const characters = source.split("");
  const mask = (start: number, end: number) => {
    for (let offset = start; offset < end; offset++) if (characters[offset] !== "\n" && characters[offset] !== "\r") characters[offset] = " ";
  };
  let complete = true;
  for (let index = 0; index < characters.length;) {
    const remainder = source.slice(index);
    const rawString = remainder.match(/^(?:br|r)(#+)?"/);
    if (rawString) {
      const terminator = `"${rawString[1] ?? ""}`;
      const endAt = source.indexOf(terminator, index + rawString[0].length);
      if (endAt < 0) { mask(index, characters.length); complete = false; break; }
      const end = endAt + terminator.length;
      mask(index, end);
      index = end;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "/") {
      const newline = source.indexOf("\n", index + 2);
      const end = newline < 0 ? source.length : newline;
      mask(index, end);
      index = end;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      const start = index;
      let depth = 1;
      index += 2;
      while (index < source.length && depth) {
        if (source[index] === "/" && source[index + 1] === "*") { depth++; index += 2; }
        else if (source[index] === "*" && source[index + 1] === "/") { depth--; index += 2; }
        else index++;
      }
      mask(start, index);
      if (depth) { complete = false; break; }
      continue;
    }
    const literalPrefix = source[index] === '"' ? 0 : source[index] === "b" && source[index + 1] === '"' ? 1 : -1;
    if (literalPrefix >= 0) {
      const start = index;
      index += literalPrefix + 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] === "\\") index += 2;
        else if (source[index++] === '"') { closed = true; break; }
      }
      mask(start, index);
      if (!closed) { complete = false; break; }
      continue;
    }
    const charLiteral = source.slice(index).match(/^b?'(?:\\.|[^'\\\r\n])'/);
    if (charLiteral) { mask(index, index + charLiteral[0].length); index += charLiteral[0].length; continue; }
    index++;
  }
  return { source: characters.join(""), complete };
}

function markerTokens(expression: string): string[] | null {
  const tokens: string[] = [];
  const pattern = /\s*(and\b|or\b|not\s+in\b|in\b|not\s+|==|!=|<=|>=|~=|===|<|>|\(|\)|[A-Za-z_][A-Za-z0-9_]*|'(?:\\.|[^'])*'|"(?:\\.|[^"])*")/gy;
  let offset = 0;
  while (offset < expression.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(expression);
    if (!match) return null;
    tokens.push(match[1].replace(/\s+/g, " ").trim());
    offset = pattern.lastIndex;
  }
  return tokens;
}

function evaluatePythonMarker(expression: string, environment: Record<string, string>): PythonMarkerResult {
  const tokens = markerTokens(expression);
  if (!tokens?.length) return "unknown";
  let index = 0;
  const readValue = (): string | null => {
    const token = tokens[index++];
    if (!token) return null;
    if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) return token.slice(1, -1);
    return Object.hasOwn(environment, token) ? environment[token] : null;
  };
  const compare = (): boolean | null => {
    const left = readValue();
    const operator = tokens[index++];
    if (operator === "not" && tokens[index] === "in") index++;
    const right = readValue();
    if (left === null || right === null || !operator) return null;
    const versionLike = /(?:python|implementation)_version/.test(expression) || /^(?:\d+\.)+\d+$/.test(left + right);
    const cmp = versionLike ? compareNumericVersion(left, right) : left.localeCompare(right);
    switch (operator) {
      case "==":
      case "===": return left === right;
      case "!=": return left !== right;
      case "<": return cmp < 0;
      case "<=": return cmp <= 0;
      case ">": return cmp > 0;
      case ">=": return cmp >= 0;
      case "in": return right.includes(left);
      case "not in":
      case "not": return !right.includes(left);
      case "~=": return left === right || left.startsWith(`${right.split(".").slice(0, -1).join(".")}.`);
      default: return null;
    }
  };
  const atom = (): boolean | null => tokens[index] === "(" ? (index++, (() => { const value = orExpr(); if (tokens[index++] !== ")") return null; return value; })()) : compare();
  const andExpr = (): boolean | null => {
    let value = atom();
    while (tokens[index] === "and") {
      index++;
      const next = atom();
      value = value === false || next === false ? false : value === true && next === true ? true : null;
    }
    return value;
  };
  const orExpr = (): boolean | null => {
    let value = andExpr();
    while (tokens[index] === "or") {
      index++;
      const next = andExpr();
      value = value === true || next === true ? true : value === false && next === false ? false : null;
    }
    return value;
  };
  const result = orExpr();
  if (index !== tokens.length || result === null) return "unknown";
  return result ? "true" : "false";
}

function compareNumericVersion(left: string, right: string): number {
  const a = left.split(".").map(part => Number.parseInt(part, 10));
  const b = right.split(".").map(part => Number.parseInt(part, 10));
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function pythonVersionSatisfies(version: string, specifier: string | undefined): boolean | null {
  if (!specifier?.trim()) return true;
  for (const clause of specifier.split(",").map(item => item.trim()).filter(Boolean)) {
    const match = clause.match(/^(===|==|!=|~=|<=|>=|<|>)\s*([0-9]+(?:\.[0-9]+)*)$/);
    if (!match) return null;
    const [, operator, target] = match;
    const comparison = compareNumericVersion(version, target);
    const valid = operator === "==" || operator === "===" ? comparison === 0 : operator === "!=" ? comparison !== 0 : operator === "<" ? comparison < 0 : operator === "<=" ? comparison <= 0 : operator === ">" ? comparison > 0 : operator === ">=" ? comparison >= 0 : comparison >= 0 && version.split(".")[0] === target.split(".")[0];
    if (!valid) return false;
  }
  return true;
}

function selectExternalClosure(identities: SourceExternalPackageIdentity[], roots: ExternalRoot[], importersByLockfile: Map<string, Record<string, Record<string, string | null>>>, selectedOptionals: Set<string>, pythonExtras: Set<string>, markerEnvironment: Record<string, string>, cargoTargetLockfiles: Set<string> = new Set()): { required: Set<string>; unresolved: string[]; rootLocators: Map<string, string> } {
  const required = new Set<string>();
  const unresolved: string[] = [];
  const rootLocators = new Map<string, string>();
  const byLocator = new Map(identities.map(identity => [identity.locator, identity]));
  const queue: Array<{ locator: string; label: string; extras: string[] }> = [];
  for (const root of roots) {
    const isPythonRoot = isPythonDependencyPath(root.requesterPath);
    const isCargoRoot = root.requesterPath.endsWith("Cargo.toml") || root.requesterPath.endsWith(".rs");
    const declaredPythonRoot = root.specifier ? undefined : roots.find(candidate => normalizePythonPackageName(candidate.name) === normalizePythonPackageName(root.name) && candidate.specifier !== undefined && candidate.requesterPath.endsWith("pyproject.toml"));
    const effectiveRoot = declaredPythonRoot ? { ...root, specifier: declaredPythonRoot.specifier, marker: declaredPythonRoot.marker, extras: declaredPythonRoot.extras, source: declaredPythonRoot.source } : root;
    if (effectiveRoot.marker) {
      const markerResult = evaluatePythonMarker(effectiveRoot.marker, markerEnvironment);
      if (markerResult === "false") continue;
      if (markerResult === "unknown") {
        unresolved.push(`python-marker-environment-unresolved:${effectiveRoot.name}:${effectiveRoot.marker}`);
        continue;
      }
    }
    const effectiveIsPythonRoot = isPythonDependencyPath(effectiveRoot.requesterPath);
    const effectiveNormalizeName = (name: string) => effectiveIsPythonRoot ? normalizePythonPackageName(name) : isCargoRoot ? normalizeCargoPackageName(name) : normalizePackageName(name);
    const candidates = identities.filter(item => item.name === effectiveNormalizeName(effectiveRoot.name) && (effectiveIsPythonRoot ? item.packageManager === "uv" : isCargoRoot ? item.packageManager === "cargo" : item.packageManager !== "uv" && item.packageManager !== "cargo"));
    const matches: string[] = [];
    for (const item of candidates) {
      const versionMatches = isCargoRoot ? cargoRequirementMatches(item.version, effectiveRoot.specifier ?? "*") : pythonVersionSatisfies(item.version, effectiveRoot.specifier);
      if (versionMatches === null) {
        unresolved.push(`${isCargoRoot ? "cargo" : "python"}-version-specifier-unresolved:${effectiveRoot.name}:${effectiveRoot.specifier}`);
        continue;
      }
      if (!versionMatches) continue;
      if (effectiveRoot.source && item.source !== effectiveRoot.source) continue;
      const importers = importersByLockfile.get(item.lockfilePath) ?? {};
      const importerPath = importerPathFor(effectiveRoot.requesterPath, importers);
      const importerDependencyName = effectiveRoot.lockfileAlias ? effectiveNormalizeName(effectiveRoot.lockfileAlias) : item.name;
      const importedLocator = importerPath === null ? undefined : importers[importerPath]?.[importerDependencyName];
      if (importerPath !== null && Object.hasOwn(importers[importerPath] ?? {}, importerDependencyName)) {
        if (importedLocator === item.locator) matches.push(item.locator);
        continue;
      }
      if (item.packageManager === "npm" && resolveNpmLocator(item.name, effectiveRoot.requesterPath, new Set(identities.filter(candidate => candidate.lockfilePath === item.lockfilePath).map(candidate => candidate.locator))) === item.locator) matches.push(item.locator);
      else if (item.packageManager === "uv") matches.push(item.locator);
    }
    if (matches.length !== 1) {
      unresolved.push(`${matches.length ? "external-package-resolution-ambiguous" : "external-package-lock-entry-missing"}:${effectiveNormalizeName(effectiveRoot.name)}:${effectiveRoot.requesterPath}`);
      continue;
    }
    rootLocators.set(`${effectiveRoot.requesterPath}\0${effectiveNormalizeName(effectiveRoot.name)}`, matches[0]);
    queue.push({ locator: matches[0], label: effectiveRoot.name, extras: effectiveRoot.extras ?? [] });
  }
  const processedExtrasByLocator = new Map<string, Set<string>>();
  while (queue.length) {
    const { locator, label, extras } = queue.shift()!;
    const processedExtras = processedExtrasByLocator.get(locator) ?? new Set<string>();
    const newExtras = extras.filter(extra => !processedExtras.has(extra));
    if (required.has(locator) && newExtras.length === 0) continue;
    required.add(locator);
    for (const extra of newExtras) processedExtras.add(extra);
    processedExtrasByLocator.set(locator, processedExtras);
    const item = byLocator.get(locator);
    if (!item) {
      unresolved.push(`transitive-package-locator-missing:${label}:${locator}`);
      continue;
    }
    if (item.packageManager === "cargo" && cargoTargetLockfiles.has(item.lockfilePath)) continue;
    if (item.packageManager === "uv" && item.uvDependencyRelations) {
      for (const relation of item.uvDependencyRelations) {
        if (relation.extra && !pythonExtras.has(relation.extra) && !processedExtras.has(relation.extra)) continue;
        if (relation.marker) {
          const markerResult = evaluatePythonMarker(relation.marker, markerEnvironment);
          if (markerResult === "false") continue;
          if (markerResult === "unknown") {
            unresolved.push(`python-marker-environment-unresolved:${item.locator}->${relation.name}:${relation.marker}`);
            continue;
          }
        }
        const candidates = identities.filter(candidate => candidate.packageManager === "uv" && candidate.name === normalizePythonPackageName(relation.name) && (!relation.version || candidate.version === relation.version.replace(/^(?:==|=)\s*/, "")) && (!relation.source || candidate.source === relation.source));
        if (candidates.length !== 1) {
          unresolved.push(`transitive-package-resolution-${candidates.length ? "ambiguous" : "missing"}:${item.name}->${relation.name}`);
          continue;
        }
        item.dependencyLocators[relation.name] = candidates[0].locator;
        queue.push({ locator: candidates[0].locator, label: `${item.name}->${relation.name}`, extras: [] });
      }
    } else for (const dependency of item.dependencies) {
      const dependencyLocator = item.dependencyLocators[dependency];
      if (!dependencyLocator) unresolved.push(`transitive-package-resolution-ambiguous:${item.name}->${dependency}`);
      else queue.push({ locator: dependencyLocator, label: `${item.name}->${dependency}`, extras: [] });
    }
    for (const dependency of item.optionalDependencies) {
      if (!selectedOptionals.has(dependency)) continue;
      const dependencyLocator = item.optionalDependencyLocators[dependency];
      if (!dependencyLocator) unresolved.push(`optional-package-resolution-ambiguous:${item.name}->${dependency}`);
      else queue.push({ locator: dependencyLocator, label: `${item.name}->optional:${dependency}`, extras: [] });
    }
  }
  return { required, unresolved, rootLocators };
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

function gitTreeRelativePath(input: string, allowRoot = false): string {
  if (allowRoot && input === ".") return ".";
  if (!input || isAbsolute(input) || input.includes("\\") || input.includes("\0")) throw new Error("SPEC224_GIT_TREE_PATH_INVALID");
  const parts = input.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) throw new Error("SPEC224_GIT_TREE_PATH_INVALID");
  return parts.join("/");
}

function gitTreeManifestBase(manifest: Omit<GitTreeSourceManifest, "manifestDigest"> | GitTreeSourceManifest): Omit<GitTreeSourceManifest, "manifestDigest"> {
  return {
    schemaVersion: manifest.schemaVersion,
    ...(manifest.scopeMode ? { scopeMode: manifest.scopeMode } : {}),
    sourceRevision: manifest.sourceRevision,
    treePath: manifest.treePath,
    files: manifest.files.map(file => ({
      path: file.path,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      mode: file.mode,
    })),
  };
}

/** Canonical digest for a complete, exact Git-tree source manifest. */
export function calculateGitTreeSourceManifestDigest(manifest: Omit<GitTreeSourceManifest, "manifestDigest"> | GitTreeSourceManifest): string {
  return sha256(canonicalJson(gitTreeManifestBase(manifest)));
}

/** Creates a complete source manifest from one immutable Git tree revision. */
export async function createGitTreeSourceManifest(input: { repositoryRoot: string; sourceRevision: string; treePath: string }): Promise<GitTreeSourceManifest> {
  const treePath = gitTreeRelativePath(input.treePath, true);
  const sourceRevision = await gitText(input.repositoryRoot, ["rev-parse", "--verify", `${input.sourceRevision}^{commit}`], "SPEC224_GIT_TREE_SOURCE_REVISION_INVALID");
  let entries: GitTreeEntry[];
  try {
    entries = parseGitTreeEntries(await runGit(input.repositoryRoot, ["ls-tree", "-rz", "--full-tree", sourceRevision, "--", treePath]), treePath);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SPEC224_GIT_TREE_")) throw error;
    throw new Error("SPEC224_GIT_TREE_READ_FAILED");
  }
  if (!entries.length) throw new Error("SPEC224_GIT_TREE_MANIFEST_FILES_INVALID");
  const files: GitTreeSourceFile[] = [];
  for (const entry of entries) {
    const bytes = await runGit(input.repositoryRoot, ["cat-file", "blob", entry.objectId]).catch(() => {
      throw new Error("SPEC224_GIT_TREE_BLOB_READ_FAILED");
    });
    files.push({
      path: entry.path,
      sha256: sha256(bytes),
      sizeBytes: bytes.byteLength,
      mode: Number.parseInt(entry.mode, 8) & 0o777,
    });
  }
  const base = {
    schemaVersion: "spec224.git-tree-source-attestation.v1" as const,
    sourceRevision,
    treePath,
    files,
  };
  const manifest = { ...base, manifestDigest: calculateGitTreeSourceManifestDigest(base) };
  await attestGitTreeSourceManifest({ repositoryRoot: input.repositoryRoot, manifest });
  return manifest;
}

/** Creates a Git manifest for an exact selected path projection, not a whole subtree. */
export async function createGitTreeSourceManifestFromPaths(input: { repositoryRoot: string; sourceRevision: string; paths: string[] }): Promise<GitTreeSourceManifest> {
  const sourceRevision = await gitText(input.repositoryRoot, ["rev-parse", "--verify", `${input.sourceRevision}^{commit}`], "SPEC224_GIT_TREE_SOURCE_REVISION_INVALID");
  const paths = [...new Set(input.paths.map(path => gitTreeRelativePath(path)))].sort(compareText);
  if (!paths.length || paths.length !== input.paths.length) throw new Error("SPEC224_GIT_TREE_MANIFEST_FILES_INVALID");
  const files: GitTreeSourceFile[] = [];
  for (const path of paths) {
    let entries: GitTreeEntry[];
    try {
      entries = parseGitTreeEntries(await runGit(input.repositoryRoot, ["ls-tree", "-z", "--full-tree", sourceRevision, "--", path]), ".");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("SPEC224_GIT_TREE_")) throw error;
      throw new Error("SPEC224_GIT_TREE_READ_FAILED");
    }
    const entry = entries.find(item => item.path === path);
    if (entries.length !== 1 || !entry) throw new Error("SPEC224_GIT_TREE_PATH_NOT_FOUND");
    const bytes = await runGit(input.repositoryRoot, ["cat-file", "blob", entry.objectId]).catch(() => {
      throw new Error("SPEC224_GIT_TREE_BLOB_READ_FAILED");
    });
    files.push({ path, sha256: sha256(bytes), sizeBytes: bytes.byteLength, mode: Number.parseInt(entry.mode, 8) & 0o777 });
  }
  const base = {
    schemaVersion: "spec224.git-tree-source-attestation.v2" as const,
    scopeMode: "exact-path-set" as const,
    sourceRevision,
    treePath: "." as const,
    files,
  };
  const manifest = { ...base, manifestDigest: calculateGitTreeSourceManifestDigest(base) };
  await attestGitTreeSourceManifest({ repositoryRoot: input.repositoryRoot, manifest });
  return manifest;
}

function assertGitTreeManifest(manifest: GitTreeSourceManifest): void {
  if ((manifest.schemaVersion !== "spec224.git-tree-source-attestation.v1" && manifest.schemaVersion !== "spec224.git-tree-source-attestation.v2") || (manifest.schemaVersion === "spec224.git-tree-source-attestation.v1" && manifest.scopeMode !== undefined) || (manifest.schemaVersion === "spec224.git-tree-source-attestation.v2" && manifest.scopeMode !== "exact-path-set") || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(manifest.sourceRevision) || !/^[a-f0-9]{64}$/i.test(manifest.manifestDigest))
    throw new Error("SPEC224_GIT_TREE_MANIFEST_INVALID");
  gitTreeRelativePath(manifest.treePath, true);
  if (!Array.isArray(manifest.files) || !manifest.files.length)
    throw new Error("SPEC224_GIT_TREE_MANIFEST_FILES_INVALID");
  let previousPath = "";
  for (const file of manifest.files) {
    const path = gitTreeRelativePath(file.path);
    if (path <= previousPath || !/^[a-f0-9]{64}$/i.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || !Number.isInteger(file.mode) || ![0o644, 0o755].includes(file.mode))
      throw new Error("SPEC224_GIT_TREE_MANIFEST_FILES_INVALID");
    previousPath = path;
  }
  if (calculateGitTreeSourceManifestDigest(manifest) !== manifest.manifestDigest)
    throw new Error("SPEC224_GIT_TREE_MANIFEST_DIGEST_MISMATCH");
}

async function runGit(repositoryRoot: string, args: string[]): Promise<Buffer> {
  const environment = { ...process.env };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_COMMON_DIR;
  return new Promise((resolveCommand, rejectCommand) => {
    execFile("git", ["--no-replace-objects", "-C", repositoryRoot, ...args], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
      env: environment,
    }, (error, stdout) => {
      if (error) rejectCommand(error);
      else resolveCommand(stdout);
    });
  });
}

async function gitText(repositoryRoot: string, args: string[], errorCode: string): Promise<string> {
  try {
    return (await runGit(repositoryRoot, args)).toString("utf8").trim();
  } catch {
    throw new Error(errorCode);
  }
}

async function runCargoTargetPackageList(sourceRoot: string, selection: SourceCargoTargetSelection): Promise<string[]> {
  const manifestPath = safeRelative(sourceRoot, selection.manifestPath);
  const manifest = await assertRegularFileWithoutSymlinkParents(sourceRoot, manifestPath);
  const cargoVersion = await new Promise<string>((resolveCommand, rejectCommand) => {
    execFile("cargo", ["-V"], { encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) rejectCommand(error);
      else resolveCommand(stdout.trim());
    });
  }).catch(() => "");
  const actualCargoRelease = cargoVersion.match(/^cargo \d+\.\d+\.\d+/)?.[0];
  if (actualCargoRelease !== selection.cargoVersion) throw new Error("SPEC224_CARGO_VERSION_MISMATCH");
  const stdout = await new Promise<string>((resolveCommand, rejectCommand) => {
    const environment = { ...process.env, CARGO_NET_OFFLINE: "true", CARGO_TERM_COLOR: "never" };
    execFile("cargo", ["tree", "--quiet", "--locked", "--offline", "--target", selection.target, "--edges", "normal,build", "--prefix", "none", "--format", "{p}", "--manifest-path", manifest], {
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      env: environment,
    }, (error, output) => {
      if (error) rejectCommand(error);
      else resolveCommand(output);
    });
  });
  return [...new Set(stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
}

type GitTreeEntry = { mode: string; type: string; objectId: string; path: string };

function parseGitTreeEntries(bytes: Buffer, treePath: string): GitTreeEntry[] {
  const prefix = treePath === "." ? "" : `${treePath}/`;
  const entries: GitTreeEntry[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const terminator = bytes.indexOf(0, offset);
    if (terminator < 0) throw new Error("SPEC224_GIT_TREE_ENTRY_INVALID");
    const rawItem = bytes.subarray(offset, terminator);
    offset = terminator + 1;
    if (!rawItem.byteLength) continue;
    const item = rawItem.toString("utf8");
    if (!Buffer.from(item, "utf8").equals(rawItem)) throw new Error("SPEC224_GIT_TREE_PATH_INVALID");
    const match = item.match(/^(\d+)\s+(\S+)\s+([a-f0-9]{40}(?:[a-f0-9]{24})?)\t(.+)$/i);
    if (!match) throw new Error("SPEC224_GIT_TREE_ENTRY_INVALID");
    const [, mode, type, objectId, absolutePath] = match;
    if (!absolutePath.startsWith(prefix)) throw new Error("SPEC224_GIT_TREE_ENTRY_INVALID");
    const path = gitTreeRelativePath(absolutePath.slice(prefix.length));
    if (mode === "120000") throw new Error("SPEC224_GIT_TREE_SYMLINK_UNSUPPORTED");
    if (mode === "160000" || type === "commit") throw new Error("SPEC224_GIT_TREE_SUBMODULE_UNSUPPORTED");
    if (mode !== "100644" && mode !== "100755") throw new Error("SPEC224_GIT_TREE_MODE_UNSUPPORTED");
    if (type !== "blob") throw new Error("SPEC224_GIT_TREE_ENTRY_UNSUPPORTED");
    entries.push({ mode, type, objectId, path });
  }
  return entries.sort((a, b) => compareText(a.path, b.path));
}

/**
 * Attests a complete manifest against immutable Git blobs reachable from one
 * exact commit. It never reads the working tree, follows symlinks, or trusts a
 * caller-supplied Git ref. This is source identity evidence only; it does not
 * establish dependency closure, owner approval, or runtime admission.
 */
export async function attestGitTreeSourceManifest(input: { repositoryRoot: string; manifest: GitTreeSourceManifest }): Promise<GitTreeSourceAttestation> {
  const manifest = input.manifest;
  assertGitTreeManifest(manifest);
  let repositoryRoot: string;
  try {
    const stat = await lstat(input.repositoryRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid root");
    repositoryRoot = await realpath(input.repositoryRoot);
  } catch {
    throw new Error("SPEC224_GIT_TREE_REPOSITORY_ROOT_INVALID");
  }
  const actualRepositoryRoot = await gitText(repositoryRoot, ["rev-parse", "--show-toplevel"], "SPEC224_GIT_TREE_REPOSITORY_ROOT_INVALID");
  let resolvedRepositoryRoot: string;
  try {
    resolvedRepositoryRoot = await realpath(actualRepositoryRoot);
  } catch {
    throw new Error("SPEC224_GIT_TREE_REPOSITORY_ROOT_INVALID");
  }
  if (resolvedRepositoryRoot !== repositoryRoot) throw new Error("SPEC224_GIT_TREE_REPOSITORY_ROOT_MISMATCH");
  const sourceRevision = await gitText(repositoryRoot, ["rev-parse", "--verify", `${manifest.sourceRevision}^{commit}`], "SPEC224_GIT_TREE_SOURCE_REVISION_INVALID");
  if (sourceRevision !== manifest.sourceRevision.toLowerCase()) throw new Error("SPEC224_GIT_TREE_SOURCE_REVISION_MISMATCH");
  const treeReference = manifest.treePath === "." ? `${sourceRevision}^{tree}` : `${sourceRevision}:${manifest.treePath}`;
  const treeObjectId = await gitText(repositoryRoot, ["rev-parse", "--verify", treeReference], "SPEC224_GIT_TREE_PATH_NOT_FOUND");
  const treeType = await gitText(repositoryRoot, ["cat-file", "-t", treeObjectId], "SPEC224_GIT_TREE_PATH_NOT_FOUND");
  if (treeType !== "tree") throw new Error("SPEC224_GIT_TREE_PATH_NOT_FOUND");
  let entries: GitTreeEntry[];
  if (manifest.schemaVersion === "spec224.git-tree-source-attestation.v1") {
    try {
      entries = parseGitTreeEntries(await runGit(repositoryRoot, ["ls-tree", "-rz", "--full-tree", sourceRevision, "--", manifest.treePath]), manifest.treePath);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("SPEC224_GIT_TREE_")) throw error;
      throw new Error("SPEC224_GIT_TREE_READ_FAILED");
    }
    const expectedPaths = manifest.files.map(file => file.path);
    if (entries.length !== expectedPaths.length || entries.some((entry, index) => entry.path !== expectedPaths[index]))
      throw new Error("SPEC224_GIT_TREE_FILE_SET_MISMATCH");
  }
  for (const [index, expected] of manifest.files.entries()) {
    let entry: GitTreeEntry | undefined;
    if (manifest.schemaVersion === "spec224.git-tree-source-attestation.v1") {
      entry = entries[index];
    } else {
      const fullPath = manifest.treePath === "." ? expected.path : `${manifest.treePath}/${expected.path}`;
      let selected: GitTreeEntry[];
      try {
        selected = parseGitTreeEntries(await runGit(repositoryRoot, ["ls-tree", "-z", "--full-tree", sourceRevision, "--", fullPath]), ".");
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("SPEC224_GIT_TREE_")) throw error;
        throw new Error("SPEC224_GIT_TREE_READ_FAILED");
      }
      if (selected.length !== 1 || selected[0].path !== fullPath) throw new Error("SPEC224_GIT_TREE_FILE_SET_MISMATCH");
      entry = selected[0];
    }
    if (!entry) throw new Error("SPEC224_GIT_TREE_FILE_SET_MISMATCH");
    const bytes = await runGit(repositoryRoot, ["cat-file", "blob", entry.objectId]).catch(() => {
      throw new Error("SPEC224_GIT_TREE_BLOB_READ_FAILED");
    });
    if (sha256(bytes) !== expected.sha256 || bytes.byteLength !== expected.sizeBytes)
      throw new Error("SPEC224_GIT_TREE_BLOB_DIGEST_MISMATCH");
    if (Number.parseInt(entry.mode, 8) !== 0o100000 + expected.mode)
      throw new Error("SPEC224_GIT_TREE_MODE_MISMATCH");
  }
  return {
    valid: true,
    sourceRevision,
    treePath: manifest.treePath,
    manifestDigest: manifest.manifestDigest,
    fileCount: manifest.files.length,
  };
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

async function resolveLocalImport(sourceRoot: string, from: string, specifier: string, moduleRoots: SourceClosureInput["moduleRoots"], rustCrateRoots: ReadonlySet<string> = new Set()): Promise<string | null> {
  const current = resolve(sourceRoot, from);
  const language = current.endsWith(".py") ? "python" : "javascript";
  let base: string | null = null;
  if (current.endsWith(".rs") && specifier.startsWith("rust-path:")) {
    const sourceName = current.slice(current.lastIndexOf(sep) + 1);
    const moduleDirectory = rustCrateRoots.has(from) || ["main.rs", "lib.rs", "mod.rs", "build.rs"].includes(sourceName)
      ? dirname(current)
      : resolve(dirname(current), sourceName.slice(0, -".rs".length));
    base = resolve(moduleDirectory, specifier.slice("rust-path:".length));
  } else if (current.endsWith(".rs") && specifier.startsWith("rust-mod:")) {
    const moduleName = specifier.slice("rust-mod:".length);
    const sourceName = current.slice(current.lastIndexOf(sep) + 1);
    const moduleDirectory = rustCrateRoots.has(from) || ["main.rs", "lib.rs", "mod.rs", "build.rs"].includes(sourceName)
      ? dirname(current)
      : resolve(dirname(current), sourceName.slice(0, -".rs".length));
    base = resolve(moduleDirectory, moduleName);
  } else if (specifier.startsWith(".")) {
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
  const candidates = [base, ...SOURCE_EXTENSIONS.map(ext => `${base}${ext}`), ...SOURCE_EXTENSIONS.map(ext => join(base!, `index${ext}`)), join(base, "__init__.py"), join(base, "mod.rs")];
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

function importsIn(
  source: string,
  filePath: string,
  pythonStandardLibrary: ReadonlySet<string> = PYTHON_TOP_LEVEL,
): {
  local: string[];
  external: string[];
  externalSpecifiers: string[];
  dynamic: string[];
  unresolved: string[];
} {
  const local = new Set<string>();
  const external = new Set<string>();
  const externalSpecifiers = new Set<string>();
  const dynamic = new Set<string>();
  const unresolved = new Set<string>();
  const isPython = filePath.endsWith(".py");
  const isRust = filePath.endsWith(".rs");
  if (isRust) {
    const profileSource = excludeRustTestModules(source);
    const rustSyntax = rustSyntaxOnly(profileSource);
    const rustCode = rustSyntax.source;
    if (!rustSyntax.complete) unresolved.add("<rust-lexical-scan-incomplete>");
    if (hasNestedOutOfLineRustModule(profileSource)) unresolved.add("<nested-rust-module-path-unresolved>");
    if (/#\s*\[\s*cfg(?:_attr)?\s*\((?!\s*test\s*\))[^\]]*\)\s*\]\s*(?:#\s*\[[^\]]+\]\s*)*(?:pub(?:\([^)]*\))?\s+)?mod\s+[A-Za-z_][A-Za-z0-9_]*\s*;/s.test(rustCode)) unresolved.add("<rust-cfg-module-selection-unresolved>");
    const pathAttributeRanges: Array<{ start: number; end: number }> = [];
    const pathAttributePatterns = [
      /#\s*\[\s*path\s*=\s*"([^"\n]+)"\s*\]\s*mod\s+[A-Za-z_][A-Za-z0-9_]*\s*;/g,
      /#\s*\[\s*path\s*=\s*r(#+)?"([\s\S]*?)"\1\s*\]\s*mod\s+[A-Za-z_][A-Za-z0-9_]*\s*;/g,
    ];
    for (const pattern of pathAttributePatterns) {
      for (const match of profileSource.matchAll(pattern)) {
        const start = match.index ?? 0;
        pathAttributeRanges.push({ start, end: start + match[0].length });
        local.add(`rust-path:${match[2] ?? match[1]}`);
      }
    }
    const pathAttributeCount = [...rustCode.matchAll(/#[ \t]*\[[ \t]*path\s*=/g)].length;
    if (pathAttributeCount !== pathAttributeRanges.length) unresolved.add("<rust-path-attribute-unresolved>");
    for (const match of rustCode.matchAll(/\bmod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) {
      const moduleIndex = (match.index ?? 0) + match[0].lastIndexOf("mod");
      if (!pathAttributeRanges.some(range => moduleIndex >= range.start && moduleIndex < range.end)) local.add(`rust-mod:${match[1]}`);
    }
    for (const match of rustCode.matchAll(/\b(?:use|extern\s+crate)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const name = match[1];
      if (!["std", "core", "alloc", "crate", "self", "super"].includes(name)) external.add(name);
    }
    const localModuleNames = new Set([...rustCode.matchAll(/\bmod\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:;|\{)/g)].map(match => match[1]));
    const qualifiedPathSource = rustCode.replace(/#\s*\[[^\]]*\]/g, " ").replace(/\buse\s+[\s\S]*?;/g, " ").replace(/\bextern\s+crate\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*;/g, " ");
    const rustStandardNamespaces = new Set(["std", "core", "alloc", "crate", "self", "super", "fs", "io", "path", "process", "time", "collections", "env", "thread", "sync", "str", "cmp", "fmt", "mem", "ops", "convert", "iter", "option", "result", "slice", "string", "vec", "cell", "rc", "borrow", "num", "marker", "any", "ffi", "net", "os", "array", "char", "task", "pin", "future", "parse", "collect", "clippy", "i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64", "u128", "usize"]);
    for (const match of qualifiedPathSource.matchAll(/(?<![:A-Za-z0-9_])([a-z][A-Za-z0-9_]*)::(?=[A-Za-z_])/g)) {
      const name = match[1];
      if (!rustStandardNamespaces.has(name) && !localModuleNames.has(name)) external.add(name);
    }
    for (const match of profileSource.matchAll(/\binclude_(?:str|bytes)!\s*\(\s*["']([^"']+)["']\s*\)/g)) local.add(match[1].startsWith(".") ? match[1] : `./${match[1]}`);
    if (/\binclude(?:_str|_bytes)?!\s*\(\s*(?!["'])/.test(profileSource)) unresolved.add("<dynamic-rust-include>");
  } else if (isPython) {
    if (/\b(?:exec|eval)\s*\(/.test(source)) unresolved.add("<dynamic-python-code-evaluation>");
    for (const match of source.matchAll(/^\s*(?:from\s+([.\w]+)\s+import|import\s+([\w.]+))/gm)) {
      const specifier = (match[1] ?? match[2] ?? "").trim();
      if (specifier.startsWith(".")) local.add(specifier);
      else if (specifier.split(".")[0] === "app") local.add(specifier);
      else if (!pythonStandardLibrary.has(specifier.split(".")[0])) {
        external.add(specifier.split(".")[0]);
        externalSpecifiers.add(specifier);
      }
    }
    for (const match of source.matchAll(/\b(?:importlib\.import_module|__import__)\s*\(\s*["']([^"']+)["']/g)) dynamic.add(match[1]);
    if (/\b(?:importlib\.import_module|__import__)\s*\(\s*[^"'\s]/.test(source)) unresolved.add("<dynamic-python-import>");
  } else {
    const scriptKind = filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
    if (sourceFile.parseDiagnostics.length > 0) unresolved.add("<javascript-parse-error>");
    const addModule = (specifier: string, isDynamic: boolean) => {
      if (isDynamic) dynamic.add(specifier);
      if (specifier.startsWith(".") || specifier.startsWith("/")) local.add(specifier);
      else if (!specifier.startsWith("node:") && !NODE_BUILTINS.has(specifier.split("/")[0])) external.add(specifier);
    };
    const visit = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        addModule(node.moduleSpecifier.text, false);
      }
      if (
        ts.isImportEqualsDeclaration(node)
        && ts.isExternalModuleReference(node.moduleReference)
      ) {
        const expression = node.moduleReference.expression;
        if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)))
          addModule(expression.text, false);
        else unresolved.add("<dynamic-javascript-import>");
      }
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const argument = node.arguments[0];
          if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) addModule(argument.text, true);
          else unresolved.add("<dynamic-javascript-import>");
        } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteral(argument)) addModule(argument.text, false);
          else unresolved.add("<dynamic-javascript-import>");
        } else if (
          ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression)
          && node.expression.expression.text === "module"
          && node.expression.name.text === "require"
        ) {
          const argument = node.arguments[0];
          if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)))
            addModule(argument.text, false);
          else unresolved.add("<dynamic-javascript-import>");
        } else if (ts.isIdentifier(node.expression) && node.expression.text === "eval") {
          unresolved.add("<dynamic-code-evaluation>");
        }
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") {
        unresolved.add("<dynamic-code-evaluation>");
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return {
    local: [...local],
    external: [...external],
    externalSpecifiers: [...externalSpecifiers],
    dynamic: [...dynamic],
    unresolved: [...unresolved],
  };
}

/** Runtime binary profiles do not compile cfg(test) modules or their dev-only imports. */
function excludeRustTestModules(source: string): string {
  const masked = rustSyntaxOnly(source).source;
  const ranges: Array<{ start: number; end: number }> = [];
  const modulePattern = /#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/g;
  for (const match of masked.matchAll(modulePattern)) {
    const start = match.index ?? 0;
    const open = start + match[0].lastIndexOf("{");
    let depth = 0;
    let end = open;
    for (; end < masked.length; end++) {
      if (masked[end] === "{") depth++;
      else if (masked[end] === "}" && --depth === 0) {
        end++;
        break;
      }
    }
    if (depth !== 0) continue;
    ranges.push({ start, end });
  }
  if (!ranges.length) return source;
  const chars = [...source];
  for (const { start, end } of ranges) for (let index = start; index < end; index++) if (chars[index] !== "\n" && chars[index] !== "\r") chars[index] = " ";
  return chars.join("");
}

type WorkspacePackage = {
  manifestPath: string;
  name: string;
  manifest: Record<string, unknown>;
};

function normalizePackageName(name: string): string {
  // npm package names are case-insensitive but punctuation is significant.
  return name.toLowerCase();
}

function normalizePythonPackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

const PYTHON_IMPORT_DISTRIBUTION_ALIASES: Record<string, string> = {
  jose: "python-jose",
  pil: "pillow",
  "google.generativeai": "google-generativeai",
  "google.oauth2": "google-auth",
  "google.auth": "google-auth",
  googleapiclient: "google-api-python-client",
  "google.cloud.tasks": "google-cloud-tasks",
};

function pythonDistributionForImport(moduleName: string): string {
  const normalized = moduleName.toLowerCase().replaceAll("_", "-");
  const alias = Object.entries(PYTHON_IMPORT_DISTRIBUTION_ALIASES)
    .filter(([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}.`))
    .sort(([left], [right]) => right.length - left.length)[0]?.[1];
  return alias ?? normalizePythonPackageName(normalized.split(".")[0]);
}

function isPythonDependencyPath(path: string): boolean {
  return path.endsWith(".py") || path.endsWith("pyproject.toml") || /(^|\/)(?:requirements|constraints)(?:(?:[-_.][^/]*)|(?:\/[^/]+))?\.txt$/i.test(path);
}

function packageLocatorId(lockfilePath: string, locator: string): string {
  return `${lockfilePath}#${locator.replace(/^\//, "")}`;
}

function packageNameFromSpecifier(specifier: string): string {
  return specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
}

function unresolvedCommandDependencies(command: string, declaredDependencies: Set<string>): string[] {
  const runtimeCommands = new Set(["node", "npm", "pnpm", "yarn", "bun", "git", "sh", "bash", "python", "python3", "uv", "echo", "cd", "export", "env", "mkdir", "rm", "cp", "mv", "grep", "sed", "cat", "find", "chmod", "sleep"]);
  const binaryAliases: Record<string, string> = {
    tsc: "typescript",
    eslint: "eslint",
    prettier: "prettier",
    vitest: "vitest",
    vite: "vite",
    tsx: "tsx",
    "lint-staged": "lint-staged",
    husky: "husky",
  };
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

function packageScriptReferences(command: string): { names: string[]; unresolved: boolean } {
  const names = [...command.matchAll(/\b(?:npm|pnpm|yarn|bun)\s+run\s+([^\s;&|]+)/g)].map(match => match[1]);
  const containsRun = /\b(?:npm|pnpm|yarn|bun)\s+run\b/.test(command);
  return { names: [...new Set(names)], unresolved: containsRun && names.length === 0 };
}

type PythonProjectRequirement = { value: string; selection: "required" | "extra" | "group" | "build"; group: string | null };

function pythonProjectRequirements(source: string): PythonProjectRequirement[] {
  const lines = source.split(/\r?\n/);
  const requirements: PythonProjectRequirement[] = [];
  let section = "";
  let collectingDependencies = false;
  let bracketDepth = 0;
  let selectedGroup: string | null = null;
  let selection: PythonProjectRequirement["selection"] = "required";
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
      selectedGroup = section === "project.optional-dependencies" || section === "dependency-groups" ? key! : section === "tool.uv" ? "dev" : null;
      selection = section === "project.optional-dependencies" ? "extra" : section === "dependency-groups" || section === "tool.uv" ? "group" : section === "build-system" ? "build" : "required";
    }
    if (!collectingDependencies) continue;
    bracketDepth += (line.match(/\[/g) ?? []).length - (line.match(/\]/g) ?? []).length;
    for (const match of line.matchAll(/(?:"([^"]+)"|'([^']+)')/g)) {
      const requirement = match[1] ?? match[2];
      if (/^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?\s*(?:[<>=!~;@]|$)/.test(requirement)) requirements.push({ value: requirement, selection, group: selectedGroup });
    }
    if (bracketDepth <= 0 && line.includes("]")) collectingDependencies = false;
  }
  return requirements;
}

function tomlStringField(source: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|[,\\s])${escapedKey}\\s*=\\s*(?:"((?:\\\\.|[^"\\\\])*)"|'([^']*)')`));
  return match?.[1]?.replace(/\\(["\\])/g, "$1") ?? match?.[2];
}

function tomlInlineTables(source: string): string[] {
  const tables: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let start = -1;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "{") {
      if (depth++ === 0) start = index + 1;
    } else if (character === "}" && depth && --depth === 0 && start >= 0) {
      tables.push(source.slice(start, index));
      start = -1;
    }
  }
  return tables;
}

function parseUvLockPackages(source: string, lockfilePath: string): ParsedDependencyLock {
  const packageBlocks = source.split(/^\[\[package\]\]\s*$/m).slice(1);
  const identities: SourceExternalPackageIdentity[] = [];
  for (const block of packageBlocks) {
    const name = block.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
    const version = block.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1];
    if (!name || !version || /source\s*=\s*\{\s*editable\s*=/.test(block)) continue;
    const sourceValue = block.match(/^source\s*=\s*\{([^}]*)\}/m)?.[1] ?? "";
    const source = sourceValue.match(/(?:registry|git|url)\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
    const lockedArtifacts: SourceLockedArtifact[] = [];
    const sdist = block.match(/^sdist\s*=\s*\{([^}]*)\}/m)?.[1];
    if (sdist) {
      const artifactUrl = sdist.match(/url\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
      const hash = sdist.match(/hash\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
      const size = Number(sdist.match(/size\s*=\s*(\d+)/)?.[1]);
      lockedArtifacts.push({
        source: artifactUrl,
        integrity: hash ? [hash] : [],
        kind: "python-sdist",
        sizeBytes: Number.isSafeInteger(size) ? size : null,
      });
    }
    const wheels = block.match(/^wheels\s*=\s*\[([\s\S]*?)^\]/m)?.[1] ?? "";
    for (const match of wheels.matchAll(/\{\s*url\s*=\s*["']([^"']+)["']\s*,\s*hash\s*=\s*["']([^"']+)["'](?:\s*,\s*size\s*=\s*(\d+))?/g)) {
      const size = Number(match[3]);
      lockedArtifacts.push({
        source: match[1],
        integrity: [match[2]],
        kind: "python-wheel",
        sizeBytes: Number.isSafeInteger(size) ? size : null,
      });
    }
    const integrity = [...new Set(lockedArtifacts.flatMap(item => item.integrity))].sort();
    const dependencySection = block.match(/^dependencies\s*=\s*\[([\s\S]*?)^\s*\]/m)?.[1] ?? "";
    const dependencyEntries = tomlInlineTables(dependencySection);
    const uvDependencyRelations = dependencyEntries.flatMap(entry => {
      const dependencyName = tomlStringField(entry, "name");
      if (!dependencyName) return [];
      const marker = tomlStringField(entry, "marker");
      const extra = tomlStringField(entry, "extra");
      const dependencyVersion = tomlStringField(entry, "version");
      const dependencySource = tomlStringField(entry, "registry") ?? tomlStringField(entry, "url");
      return [{ name: normalizePythonPackageName(dependencyName), ...(marker ? { marker } : {}), ...(extra ? { extra } : {}), ...(dependencyVersion ? { version: dependencyVersion } : {}), ...(dependencySource ? { source: dependencySource } : {}) }];
    });
    const dependencies = [
      ...new Set(
        dependencyEntries
          .filter(item => !/\bextra\s*=/.test(item))
          .map(item => item.match(/name\s*=\s*["']([^"']+)["']/)?.[1])
          .filter((item): item is string => Boolean(item))
          .map(normalizePythonPackageName)
      ),
    ].sort();
    const optionalDependencies = [
      ...new Set(
        dependencyEntries
          .filter(item => /\bextra\s*=/.test(item))
          .map(item => item.match(/name\s*=\s*["']([^"']+)["']/)?.[1])
          .filter((item): item is string => Boolean(item))
          .map(normalizePythonPackageName)
      ),
    ].sort();
    const contextMarkers = [...(block.match(/^resolution-markers\s*=\s*\[([\s\S]*?)^\]/m)?.[1] ?? "").matchAll(/["']([^"']+)["']/g)].map(match => match[1]);
    const sourceIdentity = sourceValue.split(",").map(value => value.trim()).filter(Boolean).sort().join(",");
    const packageBlockDigest = sha256(block.trim());
    identities.push({
      name: normalizePythonPackageName(name),
      version,
      locator: packageLocatorId(lockfilePath, `uv:${normalizePythonPackageName(name)}@${version}|source=${sourceIdentity}|node=${packageBlockDigest}`),
      packageManager: "uv",
      lockfilePath,
      integrity,
      source,
      dependencies,
      optionalDependencies,
      uvDependencyRelations,
      resolutionContext: contextMarkers,
      dependencyLocators: {},
      optionalDependencyLocators: {},
      lockedArtifacts,
      artifactStatus: "NOT_REQUIRED",
      artifactPath: null,
      artifactSha256: null,
      artifactSizeBytes: null,
      artifactPlatform: null,
      artifactSource: null,
      artifactKind: null,
      artifactIntegrity: [],
      os: [],
      cpu: [],
    });
  }
  return { packages: identities, importers: {} };
}

function parseNodeLockPackages(source: string, lockfilePath: string): ParsedDependencyLock {
  if (lockfilePath.endsWith("package-lock.json") || lockfilePath.endsWith("npm-shrinkwrap.json")) {
    const lock = JSON.parse(source) as {
      packages?: Record<string, Record<string, unknown>>;
    };
    const result: SourceExternalPackageIdentity[] = [];
    const importerRaw: Record<string, Record<string, unknown>> = {};
    for (const [path, value] of Object.entries(lock.packages ?? {})) {
      const marker = "node_modules/";
      const index = path.lastIndexOf(marker);
      if (index < 0) {
        importerRaw[path || "."] = value;
        continue;
      }
      const name = path.slice(index + marker.length);
      if (value.link === true || typeof value.version !== "string") continue;
      const integrity =
        typeof value.integrity === "string"
          ? value.integrity
              .split(/\s+/)
              .filter(hash => /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(hash))
              .sort()
          : [];
      const dependencies = Object.keys((value.dependencies && typeof value.dependencies === "object" ? value.dependencies : {}) as Record<string, unknown>).map(normalizePackageName);
      const optionalDependencies = Object.keys((value.optionalDependencies && typeof value.optionalDependencies === "object" ? value.optionalDependencies : {}) as Record<string, unknown>).map(normalizePackageName);
      const source = typeof value.resolved === "string" ? value.resolved : null;
      result.push({
        name: normalizePackageName(name),
        version: value.version,
        locator: packageLocatorId(lockfilePath, path),
        packageManager: "npm",
        lockfilePath,
        integrity,
        source,
        dependencies: [...new Set(dependencies)].sort(),
        optionalDependencies: [...new Set(optionalDependencies)].sort(),
        dependencyLocators: {},
        optionalDependencyLocators: {},
        lockedArtifacts: [{ source, integrity, kind: "npm-tarball", sizeBytes: null }],
        artifactStatus: "NOT_REQUIRED",
        artifactPath: null,
        artifactSha256: null,
        artifactSizeBytes: null,
        artifactPlatform: null,
        artifactSource: null,
        artifactKind: null,
        artifactIntegrity: [],
        os: Array.isArray(value.os) ? value.os.filter((item): item is string => typeof item === "string") : [],
        cpu: Array.isArray(value.cpu) ? value.cpu.filter((item): item is string => typeof item === "string") : [],
      });
    }
    const locatorPrefix = `${lockfilePath}#`;
    const locators = new Set(result.map(item => item.locator.slice(locatorPrefix.length)));
    for (const identity of result) {
      const parent = identity.locator;
      const rawParent = parent.slice(locatorPrefix.length);
      for (const name of identity.dependencies) {
        const resolved = resolveNpmLocator(name, `${rawParent}/package.json`, locators);
        identity.dependencyLocators[name] = resolved ? packageLocatorId(lockfilePath, resolved) : null;
      }
      for (const name of identity.optionalDependencies) {
        const resolved = resolveNpmLocator(name, `${rawParent}/package.json`, locators);
        identity.optionalDependencyLocators[name] = resolved ? packageLocatorId(lockfilePath, resolved) : null;
      }
    }
    const importers: Record<string, Record<string, string | null>> = {};
    for (const [importerPath, value] of Object.entries(importerRaw)) {
      const dependencyMaps = ["dependencies", "optionalDependencies", "devDependencies"].map(key => value[key] && typeof value[key] === "object" ? value[key] as Record<string, unknown> : {});
      const entries = Object.assign({}, ...dependencyMaps);
      const requester = importerPath === "." ? "package.json" : `${importerPath}/package.json`;
      importers[importerPath] = Object.fromEntries(Object.keys(entries).map(name => {
        const resolved = resolveNpmLocator(name, requester, locators);
        return [normalizePackageName(name), resolved ? packageLocatorId(lockfilePath, resolved) : null];
      }));
    }
    return { packages: result, importers };
  }
  const lock = yaml.load(source) as { packages?: Record<string, Record<string, unknown>>; snapshots?: Record<string, Record<string, unknown>>; importers?: Record<string, Record<string, unknown>> } | undefined;
  const result: SourceExternalPackageIdentity[] = [];
  for (const [rawKey, value] of Object.entries(lock?.packages ?? {})) {
    const locator = rawKey.replace(/^\//, "");
    let key = locator.replace(/\([^)]*\)$/, "");
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
    const dependencies = Object.keys((value.dependencies && typeof value.dependencies === "object" ? value.dependencies : {}) as Record<string, unknown>).map(normalizePackageName);
    const optionalDependencies = Object.keys((value.optionalDependencies && typeof value.optionalDependencies === "object" ? value.optionalDependencies : {}) as Record<string, unknown>).map(normalizePackageName);
    const source = typeof resolution.tarball === "string" ? resolution.tarball : null;
    result.push({
      name: normalizePackageName(name),
      version,
      locator: packageLocatorId(lockfilePath, locator),
      packageManager: "pnpm",
      lockfilePath,
      integrity,
      source,
      dependencies: [...new Set(dependencies)].sort(),
      optionalDependencies: [...new Set(optionalDependencies)].sort(),
      dependencyLocators: {},
      optionalDependencyLocators: {},
      lockedArtifacts: [{ source, integrity, kind: "npm-tarball", sizeBytes: null }],
      artifactStatus: "NOT_REQUIRED",
      artifactPath: null,
      artifactSha256: null,
      artifactSizeBytes: null,
      artifactPlatform: null,
      artifactSource: null,
      artifactKind: null,
      artifactIntegrity: [],
      os: Array.isArray(value.os) ? value.os.filter((item): item is string => typeof item === "string") : [],
      cpu: Array.isArray(value.cpu) ? value.cpu.filter((item): item is string => typeof item === "string") : [],
    });
  }
  const snapshotEntries = Object.entries(lock?.snapshots ?? {});
  if (snapshotEntries.length > 0) {
    const baseIdentities = new Map(result.map(identity => [identity.locator.slice(`${lockfilePath}#`.length), identity]));
    const snapshotBaseLocators = new Set<string>();
    const peerQualifiedIdentities: SourceExternalPackageIdentity[] = [];
    for (const [rawSnapshotLocator, snapshotValue] of snapshotEntries) {
      const snapshotLocator = rawSnapshotLocator.replace(/^\//, "");
      const peerBoundary = snapshotLocator.indexOf("(");
      const baseLocator = peerBoundary < 0 ? snapshotLocator : snapshotLocator.slice(0, peerBoundary);
      const baseIdentity = baseIdentities.get(baseLocator);
      if (!baseIdentity) continue;
      snapshotBaseLocators.add(baseLocator);
      const snapshotDependencies = (snapshotValue.dependencies && typeof snapshotValue.dependencies === "object" ? snapshotValue.dependencies : {}) as Record<string, unknown>;
      const snapshotOptionalDependencies = (snapshotValue.optionalDependencies && typeof snapshotValue.optionalDependencies === "object" ? snapshotValue.optionalDependencies : {}) as Record<string, unknown>;
      const dependencies = Object.keys(snapshotDependencies).length > 0
        ? Object.keys(snapshotDependencies).map(normalizePackageName)
        : baseIdentity.dependencies;
      const optionalDependencies = Object.keys(snapshotOptionalDependencies).length > 0
        ? Object.keys(snapshotOptionalDependencies).map(normalizePackageName)
        : baseIdentity.optionalDependencies;
      peerQualifiedIdentities.push({
        ...baseIdentity,
        locator: packageLocatorId(lockfilePath, snapshotLocator),
        dependencies: [...new Set(dependencies)].sort(),
        optionalDependencies: [...new Set(optionalDependencies)].sort(),
        dependencyLocators: {},
        optionalDependencyLocators: {},
      });
    }
    const packagesWithoutSnapshots = result.filter(identity => !snapshotBaseLocators.has(identity.locator.slice(`${lockfilePath}#`.length)));
    result.splice(0, result.length, ...peerQualifiedIdentities, ...packagesWithoutSnapshots);
  }
  const resolvePnpmLocator = (name: string, value: unknown): string | null => {
    const resolution = typeof value === "string" ? value : value && typeof value === "object" && typeof (value as Record<string, unknown>).version === "string" ? (value as Record<string, unknown>).version as string : null;
    if (!resolution) return null;
    // pnpm importer resolutions may carry the full peer-qualified package
    // locator (name@version(peer@...)); dependency entries usually carry only
    // a version. Preserve the full locator when present so peer variants do
    // not collapse into an ambiguous name/version match. npm: aliases carry
    // the target package descriptor rather than the dependency's alias name.
    const candidate = (resolution.startsWith("npm:") ? resolution.slice("npm:".length) : resolution).replace(/^\//, "");
    const packageDescriptor = candidate.split("(", 1)[0];
    const versionBoundary = packageDescriptor.startsWith("@")
      ? packageDescriptor.indexOf("@", packageDescriptor.indexOf("/") + 1)
      : packageDescriptor.lastIndexOf("@");
    const carriesPackageName = versionBoundary > 0 && versionBoundary < packageDescriptor.length - 1;
    const descriptor = carriesPackageName ? candidate : `${name}@${candidate}`;
    const descriptorBase = carriesPackageName ? packageDescriptor : `${name}@${packageDescriptor}`;
    const exact = result.filter(item => item.locator === packageLocatorId(lockfilePath, descriptor));
    if (exact.length === 1) return exact[0].locator;
    if (exact.length > 1) return null;
    const base = result.filter(item => item.locator === packageLocatorId(lockfilePath, descriptorBase));
    if (base.length === 1) return base[0].locator;
    if (base.length > 1) return null;
    const boundary = descriptorBase.startsWith("@")
      ? descriptorBase.indexOf("@", descriptorBase.indexOf("/") + 1)
      : descriptorBase.lastIndexOf("@");
    if (boundary <= 0) return null;
    const targetName = normalizePackageName(descriptorBase.slice(0, boundary));
    const targetVersion = descriptorBase.slice(boundary + 1);
    const sameVersion = result.filter(item => item.name === targetName && item.version === targetVersion);
    return sameVersion.length === 1 ? sameVersion[0].locator : null;
  };
  for (const identity of result) {
    const rawLocator = identity.locator.slice(`${lockfilePath}#`.length);
    const packageEntry = lock?.snapshots?.[rawLocator] ?? lock?.snapshots?.[`/${rawLocator}`] ?? lock?.packages?.[rawLocator] ?? lock?.packages?.[`/${rawLocator}`] ?? {};
    for (const name of identity.dependencies) identity.dependencyLocators[name] = resolvePnpmLocator(name, (packageEntry.dependencies as Record<string, unknown> | undefined)?.[name]);
    for (const name of identity.optionalDependencies) identity.optionalDependencyLocators[name] = resolvePnpmLocator(name, (packageEntry.optionalDependencies as Record<string, unknown> | undefined)?.[name]);
  }
  const importers: Record<string, Record<string, string | null>> = {};
  for (const [importerPath, value] of Object.entries(lock?.importers ?? {})) {
    const dependencyMaps = ["dependencies", "optionalDependencies", "devDependencies"].map(key => value[key] && typeof value[key] === "object" ? value[key] as Record<string, unknown> : {});
    const entries = Object.assign({}, ...dependencyMaps);
    importers[importerPath === "." ? "." : importerPath] = Object.fromEntries(Object.entries(entries).map(([name, resolution]) => [normalizePackageName(name), resolvePnpmLocator(name, resolution)]));
  }
  return { packages: result, importers };
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
            return subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= prefix.length + suffix.length
              ? {
                  key,
                  prefix,
                  suffix,
                  capture: subpath.slice(prefix.length, subpath.length - suffix.length || undefined),
                }
              : null;
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
  const queue: Array<{ path: string; kind: SourceInputKind }> = [
    ...input.entryPaths.map(path => ({ path, kind: "entry" as const })),
    ...input.dependencyArtifacts.map(path => ({
      path,
      kind: "dependency-artifact" as const,
    })),
    ...(input.profileInputs ?? []).map(item => ({
      path: item.path,
      kind: item.kind,
    })),
    ...(input.workspaceManifestPaths ?? []).map(path => ({
      path,
      kind: "workspace-manifest" as const,
    })),
  ].map(item => ({ ...item, path: safeRelative(sourceRoot, item.path) }));
  const seen = new Set<string>();
  const provenance = new Map<string, Set<SourceInputKind>>();
  const dependencyEdges: SourceDependencyEdge[] = [];
  const external = new Set<string>();
  const declaredExternal = new Set<string>();
  const externalRoots: ExternalRoot[] = [];
  const cargoImports = new Map<string, Set<string>>();
  const cargoAliasesByManifest = new Map<string, Map<string, string>>();
  const cargoSelfLibraryByManifest = new Map<string, string>();
  const rustCrateRoots = new Set(input.entryPaths.filter(path => path.endsWith(".rs")));
  const selectedOptionalNames = new Set((input.selectedOptionalDependencies ?? []).map(normalizePackageName));
  const declaredOptionalNames = new Set<string>();
  const unresolved: Array<{ from: string; specifier: string }> = [];
  const profile = input.executionProfile;
  const rawPythonDependencySelections = input.pythonDependencySelections ?? profile?.pythonDependencySelections ?? {};
  const normalizePythonSelections = (selections: typeof rawPythonDependencySelections) => Object.fromEntries(Object.entries(selections)
    .map(([path, categories]) => [safeRelative(sourceRoot, path), Object.fromEntries(
      Object.entries(categories).map(([category, names]) => [category, [...new Set((names ?? []).map(normalizePythonPackageName))].sort(compareText)]),
    )])
    .sort(([left], [right]) => compareText(left, right)));
  const pythonDependencySelections = normalizePythonSelections(rawPythonDependencySelections) as typeof rawPythonDependencySelections;
  if (profile && canonicalJson(pythonDependencySelections) !== canonicalJson(normalizePythonSelections(profile.pythonDependencySelections ?? {}))) {
    unresolved.push({ from: "<profile>", specifier: "<execution-profile-python-requirement-selection-mismatch>" });
  }
  if (input.profileDigest && !profile) {
    unresolved.push({ from: "<profile>", specifier: "<verified-execution-profile-required>" });
  } else if (profile) {
    if (!verifySpec224ExecutionProfile(profile)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-digest-mismatch>" });
    }
    if (input.profileId !== profile.profileId) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-id-mismatch>" });
    }
    if (input.profileDigest && input.profileDigest.toLowerCase() !== profile.profileDigest) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-digest-mismatch>" });
    }
    const expectedEntries = [...profile.entrypoints.node, ...profile.entrypoints.python, ...profile.entrypoints.rust].sort(compareText);
    const actualEntries = [...input.entryPaths].map(path => safeRelative(sourceRoot, path)).sort(compareText);
    if (canonicalJson(actualEntries) !== canonicalJson(expectedEntries)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-entrypoints-mismatch>" });
    }
    const expectedCargoTargets = profile.entrypoints.rust.length ? [profile.cargoTarget] : [];
    const actualCargoTargets = [...new Set((input.cargoTargetSelections ?? []).map(selection => selection.target))].sort(compareText);
    if (canonicalJson(actualCargoTargets) !== canonicalJson(expectedCargoTargets)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-cargo-target-mismatch>" });
    }
    const expectedDependencyManifests = [...new Set(
      [...profile.dependencyManifests.runtime, ...profile.dependencyManifests.testOnly].map(value => value.split("#", 1)[0]),
    )].sort(compareText);
    const actualDependencyManifests = [...new Set(input.dependencyArtifacts.map(path => safeRelative(sourceRoot, path)))].sort(compareText);
    if (canonicalJson(actualDependencyManifests) !== canonicalJson(expectedDependencyManifests)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-dependency-manifests-mismatch>" });
    }
    const expectedPythonGroups = [...new Set(profile.dependencyManifests.testOnly
      .filter(value => value.split("#", 1)[0].endsWith("pyproject.toml") && value.includes("#"))
      .map(value => value.slice(value.indexOf("#") + 1).toLowerCase()))].sort(compareText);
    if (canonicalJson([...new Set(input.selectedPythonDependencyGroups ?? [])].map(value => value.toLowerCase()).sort(compareText)) !== canonicalJson(expectedPythonGroups)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-python-groups-mismatch>" });
    }
    const actualWorkspaceManifests = [...new Set((input.workspaceManifestPaths ?? []).map(path => safeRelative(sourceRoot, path)))].sort(compareText);
    if (canonicalJson(actualWorkspaceManifests) !== canonicalJson([...profile.workspaceManifestPaths].sort(compareText))) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-workspaces-mismatch>" });
    }
    const expectedWorkspaceDirs = [...new Set([
      ...profile.workspaceManifestPaths.map(path => dirname(path).split(sep).join("/") || "."),
      ...profile.dependencyManifests.runtime
        .filter(path => /(?:^|\/)(?:Cargo\.toml|pyproject\.toml)$/.test(path))
        .map(path => dirname(path).split(sep).join("/") || "."),
    ])].filter(path => path !== "." || profile.workspaces.includes(".")).sort(compareText);
    if (canonicalJson([...new Set(profile.workspaces.map(path => path === "." ? "." : safeRelative(sourceRoot, path)))].sort(compareText)) !== canonicalJson(expectedWorkspaceDirs)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-workspace-set-mismatch>" });
    }
    const expectedSourceInputs = [...new Set(profile.sourceInputs.map(path => safeRelative(sourceRoot, path)))].filter(path => !expectedEntries.includes(path)).sort(compareText);
    const actualSourceInputs = [...new Set((input.profileInputs ?? []).map(item => safeRelative(sourceRoot, item.path)))].sort(compareText);
    if (canonicalJson(actualSourceInputs) !== canonicalJson(expectedSourceInputs)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-source-inputs-mismatch>" });
    }
    const actualModuleRoots = [...(input.moduleRoots ?? [])].sort((left, right) => compareText(left.prefix, right.prefix));
    const expectedModuleRoots = [...profile.moduleRoots].sort((left, right) => compareText(left.prefix, right.prefix));
    if (canonicalJson(actualModuleRoots) !== canonicalJson(expectedModuleRoots)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-module-roots-mismatch>" });
    }
    const runtime = input.runtimeIdentity ?? {};
    if (
      runtime.node !== profile.runtime.node ||
      runtime.packageManager !== `pnpm@${profile.runtime.pnpm}` ||
      runtime.python !== profile.runtime.python ||
      runtime.rustc !== profile.runtime.rustc ||
      (profile.entrypoints.rust.length > 0 && runtime.cargo !== profile.runtime.cargo) ||
      runtime.platform !== `${profile.runtime.platform}-${profile.runtime.architecture}` ||
      runtime.architecture !== profile.runtime.architecture
    ) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-runtime-mismatch>" });
    }
    const stdlibDigest = input.pythonStandardLibraryModules?.length
      ? sha256([...new Set(input.pythonStandardLibraryModules)].sort(compareText).join("\n"))
      : "";
    if (profile.entrypoints.python.length && stdlibDigest !== profile.pythonStandardLibrarySha256) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-python-stdlib-mismatch>" });
    }
    if (Object.values(input.selectedManifestScripts ?? {}).some(scripts => scripts.length > 0)) {
      unresolved.push({ from: "<profile>", specifier: "<execution-profile-script-selection-unbound>" });
    }
  }
  const pythonStandardLibraryModules = [...new Set(
    (input.pythonStandardLibraryModules ?? [...PYTHON_TOP_LEVEL]).map(name => name.trim()).filter(Boolean),
  )].sort(compareText);
  const pythonStandardLibrary = new Set(pythonStandardLibraryModules);
  if (
    input.requireCompletePythonStandardLibrary &&
    input.entryPaths.some(path => path.endsWith(".py")) &&
    !input.pythonStandardLibraryModules?.length
  ) {
    unresolved.push({ from: "<profile>", specifier: "<python-stdlib-inventory-required>" });
  }
  const normalizeManifestSelection = (selection: Record<string, string[]> | undefined, kind: string) => {
    const normalized: Record<string, string[]> = {};
    for (const [rawPath, rawNames] of Object.entries(selection ?? {})) {
      const path = safeRelative(sourceRoot, rawPath);
      if (!path.endsWith("package.json") || !Array.isArray(rawNames) || rawNames.some(name => typeof name !== "string" || !name.trim())) {
        unresolved.push({ from: rawPath, specifier: `<invalid-${kind}-selection>` });
        continue;
      }
      if (Object.hasOwn(normalized, path)) {
        unresolved.push({ from: path, specifier: `<duplicate-${kind}-selection-path>` });
        continue;
      }
      const names = rawNames.map(name => kind === "dependency" ? normalizePackageName(name) : name.trim());
      if (new Set(names).size !== names.length) {
        unresolved.push({ from: path, specifier: `<duplicate-${kind}-selection>` });
        continue;
      }
      normalized[path] = names.sort(compareText);
    }
    return normalized;
  };
  const selectedManifestDependencies = normalizeManifestSelection(
    input.selectedManifestDependencies ?? profile?.selectedManifestDependencies,
    "dependency",
  );
  const selectedManifestScripts = normalizeManifestSelection(
    input.selectedManifestScripts ?? profile?.selectedManifestScripts,
    "script",
  );
  if (profile && (
    canonicalJson(selectedManifestDependencies) !== canonicalJson(normalizeManifestSelection(profile.selectedManifestDependencies, "profile-dependency")) ||
    canonicalJson(selectedManifestScripts) !== canonicalJson(normalizeManifestSelection(profile.selectedManifestScripts, "profile-script"))
  )) {
    unresolved.push({ from: "<profile>", specifier: "<execution-profile-manifest-selection-mismatch>" });
  }
  const consumedDependencySelections = new Set<string>();
  const consumedScriptSelections = new Set<string>();
  const workspacePackages: WorkspacePackage[] = [];
  for (const manifestPath of input.workspaceManifestPaths ?? []) {
    const safePath = safeRelative(sourceRoot, manifestPath);
    try {
      const manifest = JSON.parse(await readFile(await assertRegularFileWithoutSymlinkParents(sourceRoot, safePath), "utf8")) as Record<string, unknown>;
      if (typeof manifest.name !== "string" || workspacePackages.some(item => item.name === manifest.name))
        unresolved.push({
          from: safePath,
          specifier: "<invalid-or-duplicate-workspace-package-name>",
        });
      else
        workspacePackages.push({
          manifestPath: safePath,
          name: manifest.name,
          manifest,
        });
    } catch {
      unresolved.push({
        from: safePath,
        specifier: "<invalid-workspace-package-manifest>",
      });
    }
  }
  for (const item of input.profileInputs ?? []) {
    dependencyEdges.push({
      from: `<profile:${input.profileId ?? "unspecified"}>`,
      specifier: item.path,
      to: safeRelative(sourceRoot, item.path),
      kind: "profile-input",
      status: "resolved-local",
    });
  }
  while (queue.length) {
    const queued = queue.shift()!;
    const filePath = queued.path;
    const candidateStat = await lstat(resolve(sourceRoot, filePath)).catch(() => null);
    if (!candidateStat) {
      unresolved.push({ from: filePath, specifier: "<missing-or-symlink-file>" });
      continue;
    }
    if (candidateStat.isDirectory() && !candidateStat.isSymbolicLink()) {
      const directoryPath = resolve(sourceRoot, filePath);
      try {
        const actualDirectory = await realpath(directoryPath);
        const relativeDirectory = relative(sourceRoot, actualDirectory);
        if (!relativeDirectory || relativeDirectory === ".." || relativeDirectory.startsWith(`..${sep}`)) {
          unresolved.push({ from: filePath, specifier: "<profile-source-directory-escape>" });
          continue;
        }
        const names = (await readdir(directoryPath)).sort(compareText);
        if (!names.length) {
          unresolved.push({ from: filePath, specifier: "<profile-source-directory-empty>" });
          continue;
        }
        for (const name of names) {
          try {
            queue.push({ path: safeRelative(sourceRoot, `${filePath}/${name}`), kind: queued.kind });
          } catch (error) {
            unresolved.push({ from: filePath, specifier: error instanceof Error ? error.message : "<profile-source-entry-invalid>" });
          }
        }
      } catch {
        unresolved.push({ from: filePath, specifier: "<profile-source-directory-read-failed>" });
      }
      continue;
    }
    const fileProvenance = provenance.get(filePath) ?? new Set<SourceInputKind>();
    fileProvenance.add(queued.kind);
    provenance.set(filePath, fileProvenance);
    if (seen.has(filePath)) continue;
    let file: string;
    try {
      file = await assertRegularFileWithoutSymlinkParents(sourceRoot, filePath);
    } catch {
      unresolved.push({
        from: filePath,
        specifier: "<missing-or-symlink-file>",
      });
      continue;
    }
    seen.add(filePath);
    const source = await readFile(file, "utf8");
    if (filePath.endsWith(".rs")) {
      const rustEnv = input.rustCompileTimeEnvironment ?? {};
      const literalMacros = [...source.matchAll(/\b(env|option_env)!\s*\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g)];
      const macroCount = [...source.matchAll(/\b(?:env|option_env)!\s*\(/g)].length;
      if (macroCount !== literalMacros.length) unresolved.push({ from: filePath, specifier: "<rust-compile-time-environment-dynamic>" });
      for (const [, macro, name] of literalMacros) {
        if (!Object.hasOwn(rustEnv, name) || (macro === "env" && rustEnv[name] === null)) unresolved.push({ from: filePath, specifier: `rust-compile-time-environment-unbound:${name}` });
      }
    }
    if (/(^|\/)(?:requirements|constraints)(?:(?:[-_.][^/]*)|(?:\/[^/]+))?\.txt$/i.test(filePath)) {
      const selection = pythonDependencySelections[filePath];
      const selectedNames = new Set(Object.values(selection ?? {}).flat());
      const observedNames = new Set<string>();
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
            dependencyEdges.push({
              from: filePath,
              specifier: `requirement-include:${include[1]}`,
              to: safePath,
              kind: "profile-input",
              status: "resolved-local",
            });
            queue.push({ path: safePath, kind: "dependency-artifact" });
          } catch {
            unresolved.push({
              from: filePath,
              specifier: `requirement-include:${include[1]}`,
            });
            dependencyEdges.push({
              from: filePath,
              specifier: `requirement-include:${include[1]}`,
              to: null,
              kind: "profile-input",
              status: "unresolved",
            });
          }
          continue;
        }
        const requirement = line.match(/^([A-Za-z0-9_.-]+)(?:\[([^\]]+)\])?\s*(.*)$/);
        if (!requirement) {
          unresolved.push({
            from: filePath,
            specifier: `requirement-line:${lineIndex + 1}`,
          });
          continue;
        }
        const packageName = normalizePythonPackageName(requirement[1]);
        const extras = requirement[2]?.split(",").map(value => value.trim().toLowerCase()).filter(Boolean) ?? [];
        const [versionSpecifier, marker] = requirement[3].split(";", 2).map(value => value.trim());
        const edgeSpecifier = `${packageName}${extras.length ? `[${extras.join(",")}]` : ""}${versionSpecifier ? ` ${versionSpecifier}` : ""}${marker ? `; ${marker}` : ""}`;
        observedNames.add(packageName);
        if (selection && !selectedNames.has(packageName)) {
          dependencyEdges.push({
            from: filePath,
            specifier: edgeSpecifier,
            to: null,
            kind: "declared-package-dependency",
            status: "profile-dependency-excluded",
          });
          continue;
        }
        external.add(packageName);
        declaredExternal.add(packageName);
        externalRoots.push({
          name: packageName,
          requesterPath: filePath,
          ...(versionSpecifier ? { specifier: versionSpecifier } : {}),
          ...(extras.length ? { extras } : {}),
          ...(marker ? { marker } : {}),
        });
        dependencyEdges.push({
          from: filePath,
          specifier: edgeSpecifier,
          to: null,
          kind: "declared-package-dependency",
          status: "external-package",
        });
      }
      if (selection) {
        for (const name of selectedNames) {
          if (!observedNames.has(name)) unresolved.push({ from: filePath, specifier: `selected-python-requirement-not-declared:${name}` });
        }
      }
    }
    if (filePath.endsWith("pyproject.toml")) {
      const selectedGroups = new Set((input.selectedPythonDependencyGroups ?? []).map(value => value.toLowerCase()));
      const selectedExtras = new Set((input.selectedPythonExtras ?? []).map(value => value.toLowerCase()));
      for (const requirement of pythonProjectRequirements(source)) {
        const selected = requirement.selection === "required" || requirement.selection === "build" && selectedGroups.has("build") || requirement.selection === "group" && Boolean(requirement.group && selectedGroups.has(requirement.group.toLowerCase())) || requirement.selection === "extra" && Boolean(requirement.group && selectedExtras.has(requirement.group.toLowerCase()));
        if (!selected) {
          dependencyEdges.push({ from: filePath, specifier: `${requirement.group ?? "optional"}:${requirement.value}`, to: null, kind: "declared-package-dependency", status: "optional-dependency-excluded" });
          continue;
        }
        const [requirementPart, markerPart] = requirement.value.split(";", 2).map(item => item.trim());
        const requirementMatch = requirementPart.match(/^([A-Za-z0-9_.-]+)(?:\[([^\]]+)\])?\s*(.*)$/);
        const name = requirementMatch?.[1];
        if (!name) continue;
        const packageName = normalizePythonPackageName(name);
        const extras = requirementMatch?.[2]?.split(",").map(item => item.trim().toLowerCase()).filter(Boolean) ?? [];
        const rawSpecifier = requirementMatch?.[3]?.trim() ?? "";
        const root: ExternalRoot = { name: packageName, requesterPath: filePath, ...(rawSpecifier ? { specifier: rawSpecifier } : {}), ...(extras.length ? { extras } : {}), ...(markerPart ? { marker: markerPart } : {}) };
        external.add(packageName);
        declaredExternal.add(packageName);
        externalRoots.push(root);
        dependencyEdges.push({
          from: filePath,
          specifier: requirement.value,
          to: null,
          kind: "declared-package-dependency",
          status: "external-package",
        });
      }
    }
    if (filePath.endsWith("package.json")) {
      try {
        const manifest = JSON.parse(source) as Record<string, unknown>;
        const hasHookConfiguration = ["simple-git-hooks", "husky", "lint-staged", "pre-commit"].some(key => manifest[key] !== undefined);
        if (hasHookConfiguration) {
          if (!(input.profileInputs ?? []).some(item => item.kind === "hook"))
            unresolved.push({
              from: filePath,
              specifier: "<hook-inputs-not-declared-in-profile>",
            });
        }
        const dependencies = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"].flatMap(key => Object.entries((manifest[key] && typeof manifest[key] === "object" ? manifest[key] : {}) as Record<string, unknown>).map(entry => ({ entry, optional: key === "optionalDependencies" })));
        const manifestDependencyNames = new Set(dependencies.map(({ entry: [name] }) => normalizePackageName(name)));
        const selectedDependencies = selectedManifestDependencies[filePath];
        if (selectedDependencies) {
          consumedDependencySelections.add(filePath);
          for (const selected of selectedDependencies) {
            if (!manifestDependencyNames.has(selected)) unresolved.push({ from: filePath, specifier: `<selected-dependency-not-declared:${selected}>` });
          }
        }
        for (const {
          entry: [name, range],
          optional,
        } of dependencies) {
          if (selectedDependencies && !selectedDependencies.includes(normalizePackageName(name))) {
            dependencyEdges.push({ from: filePath, specifier: `${name}@${String(range)}`, to: null, kind: "declared-package-dependency", status: "profile-dependency-excluded" });
            continue;
          }
          if (optional) declaredOptionalNames.add(normalizePackageName(name));
          if (optional && !selectedOptionalNames.has(normalizePackageName(name))) {
            dependencyEdges.push({
              from: filePath,
              specifier: `${name}@${String(range)}`,
              to: null,
              kind: "declared-package-dependency",
              status: "optional-dependency-excluded",
            });
            continue;
          }
          const local = workspacePackages.find(item => item.name === name);
          if (!local) {
            external.add(name);
            declaredExternal.add(normalizePackageName(name));
            externalRoots.push({ name, requesterPath: filePath });
            dependencyEdges.push({
              from: filePath,
              specifier: `${name}@${String(range)}`,
              to: null,
              kind: "declared-package-dependency",
              status: "external-package",
            });
            continue;
          }
          const resolution = await resolveWorkspacePackageFiles(sourceRoot, local, ".");
          dependencyEdges.push({
            from: filePath,
            specifier: `${name}@${String(range)}`,
            to: resolution.files[0] ?? local.manifestPath,
            kind: "workspace-dependency",
            status: resolution.files.length && !resolution.unresolved.length ? "resolved-local" : "unresolved",
          });
          queue.push({ path: local.manifestPath, kind: "workspace-manifest" });
          for (const target of resolution.files) queue.push({ path: target, kind: "source-import" });
          for (const target of resolution.unresolved)
            unresolved.push({
              from: filePath,
              specifier: `${name}<unresolved-export:${target}>`,
            });
          if (!resolution.files.length)
            unresolved.push({
              from: filePath,
              specifier: `${name}<workspace-export-unresolved>`,
            });
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
              dependencyEdges.push({
                from: filePath,
                specifier: `hook-input:${profileHook.path}`,
                to: hookPath,
                kind: "profile-input",
                status: "resolved-local",
              });
            } catch {
              unresolved.push({
                from: filePath,
                specifier: `<missing-hook-input:${profileHook.path}>`,
              });
            }
          }
          for (const hookCommand of hookCommands) {
            for (const executable of unresolvedCommandDependencies(hookCommand, manifestDependencyNames))
              unresolved.push({
                from: filePath,
                specifier: `<hook-command-dependency:${executable}>`,
              });
          }
        }
        const scripts = (manifest.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {}) as Record<string, unknown>;
        const selectedScripts = selectedManifestScripts[filePath];
        const selectedScriptSet = selectedScripts ? new Set(selectedScripts) : null;
        if (selectedScripts) {
          consumedScriptSelections.add(filePath);
          for (const selected of selectedScripts) {
            if (!Object.hasOwn(scripts, selected)) unresolved.push({ from: filePath, specifier: `<selected-script-not-declared:${selected}>` });
          }
        }
        const lifecycleScripts = new Set([
          "preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "preshrink", "publish", "postpublish",
          ...(selectedScripts ?? []).flatMap(script => [`pre${script}`, `post${script}`]),
        ]);
        for (const lifecycle of lifecycleScripts) {
          if (typeof scripts[lifecycle] === "string" && selectedScriptSet?.has(lifecycle)) {
            continue;
          }
          if (typeof scripts[lifecycle] === "string" && selectedScripts?.some(script => lifecycle === `pre${script}` || lifecycle === `post${script}`)) {
            unresolved.push({
              from: filePath,
              specifier: `<lifecycle-script-not-authorized:${lifecycle}>`,
            });
          } else if (typeof scripts[lifecycle] === "string" && !selectedScripts) {
            unresolved.push({
              from: filePath,
              specifier: `<lifecycle-script-not-authorized:${lifecycle}>`,
            });
          } else if (typeof scripts[lifecycle] === "string") {
            dependencyEdges.push({
              from: filePath,
              specifier: lifecycle,
              to: null,
              kind: "profile-input",
              status: "profile-dependency-excluded",
            });
          }
        }
        for (const [scriptName, command] of Object.entries(scripts)) {
          if (selectedScriptSet && !selectedScriptSet.has(scriptName)) continue;
          if (typeof command !== "string") continue;
          const scriptDependencies = selectedDependencies ? new Set(selectedDependencies) : manifestDependencyNames;
          for (const executable of unresolvedCommandDependencies(command, scriptDependencies))
            unresolved.push({
              from: filePath,
              specifier: `<script-command-dependency:${scriptName}:${executable}>`,
            });
          const scriptReferences = packageScriptReferences(command);
          if (scriptReferences.unresolved) unresolved.push({ from: filePath, specifier: `<script-command-target-unresolved:${scriptName}>` });
          for (const referencedScript of scriptReferences.names) {
            if (!Object.hasOwn(scripts, referencedScript)) unresolved.push({ from: filePath, specifier: `<script-command-target-missing:${scriptName}:${referencedScript}>` });
            else if (selectedScripts && !selectedScripts.includes(referencedScript)) unresolved.push({ from: filePath, specifier: `<script-command-not-selected:${scriptName}:${referencedScript}>` });
          }
          const refs = [...command.matchAll(/(?:^|\s)(?:node|tsx|vitest|vite|python(?:3)?|bash|sh)\s+([\w./@-]+\.(?:ts|tsx|js|mjs|cjs|py|sh))(?:\s|$)/g)].map(match => match[1]);
          for (const ref of refs) {
            const candidate = relative(sourceRoot, resolve(sourceRoot, dirname(filePath), ref))
              .split(sep)
              .join("/");
            try {
              const safePath = safeRelative(sourceRoot, candidate);
              await assertRegularFileWithoutSymlinkParents(sourceRoot, safePath);
              dependencyEdges.push({
                from: filePath,
                specifier: `script:${scriptName}:${ref}`,
                to: safePath,
                kind: "profile-input",
                status: "resolved-local",
              });
              queue.push({ path: safePath, kind: "executable" });
            } catch {
              dependencyEdges.push({
                from: filePath,
                specifier: `script:${scriptName}:${ref}`,
                to: null,
                kind: "profile-input",
                status: "unresolved",
              });
              unresolved.push({
                from: filePath,
                specifier: `script:${scriptName}:${ref}`,
              });
            }
          }
        }
      } catch {
        unresolved.push({
          from: filePath,
          specifier: "<invalid-package-json>",
        });
      }
    }
    if (filePath.endsWith("Cargo.toml")) {
      const aliases = cargoAliasesByManifest.get(filePath) ?? new Map<string, string>();
      const packageBlock = source.match(/^\[package\]\s*([\s\S]*?)(?=^\[|(?![\s\S]))/m)?.[1] ?? "";
      const packageName = packageBlock.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
      const packageVersion = packageBlock.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1];
      if (Object.hasOwn(input.rustCompileTimeEnvironment ?? {}, "CARGO_PKG_VERSION") && input.rustCompileTimeEnvironment?.CARGO_PKG_VERSION !== packageVersion)
        unresolved.push({ from: filePath, specifier: "<rust-cargo-pkg-version-binding-mismatch>" });
      const libraryBlock = source.match(/^\[lib\]\s*([\s\S]*?)(?=^\[|^\[\[|$)/m)?.[1] ?? "";
      const libraryPath = libraryBlock.match(/^path\s*=\s*["']([^"']+)["']/m)?.[1] ?? "src/lib.rs";
      if (packageName) {
        try {
          const safeLibraryPath = safeRelative(dirname(filePath) === "." ? "" : dirname(filePath), libraryPath).split(sep).join("/");
          const candidate = join(dirname(filePath), safeLibraryPath).split(sep).join("/").replace(/^\.\//, "");
          await assertRegularFileWithoutSymlinkParents(sourceRoot, candidate);
          aliases.set(normalizeCargoPackageName(packageName.replaceAll("-", "_")), "@self");
          cargoSelfLibraryByManifest.set(filePath, candidate);
          rustCrateRoots.add(candidate);
          queue.push({ path: candidate, kind: "source-import" });
        } catch {
          // A package without a library target is valid; unresolved self imports
          // are rejected later if source actually refers to the package crate.
        }
      }
      for (const dependency of cargoManifestDependencies(source)) {
        const name = normalizeCargoPackageName(dependency.name);
        aliases.set(normalizeCargoPackageName(dependency.alias), name);
        external.add(name);
        declaredExternal.add(name);
        externalRoots.push({ name, requesterPath: filePath, lockfileAlias: dependency.alias });
        if (dependency.pathDependency) unresolved.push({ from: filePath, specifier: `cargo-path-dependency-unresolved:${dependency.name}` });
        if (!dependency.version) unresolved.push({ from: filePath, specifier: `cargo-version-requirement-unresolved:${dependency.name}` });
        dependencyEdges.push({ from: filePath, specifier: `${dependency.name}@${dependency.version ?? "<missing-version>"}`, to: null, kind: "declared-package-dependency", status: dependency.pathDependency ? "unresolved" : "external-package" });
      }
      cargoAliasesByManifest.set(filePath, aliases);
    }
    const declaredProfileInput = (input.profileInputs ?? []).find(item => item.path === filePath);
    if (declaredProfileInput?.kind === "hook" && !SOURCE_EXTENSIONS.some(ext => filePath.endsWith(ext)))
      unresolved.push({
        from: filePath,
        specifier: "<hook-executable-closure-unverified>",
      });
    const imports = SOURCE_EXTENSIONS.some(ext => filePath.endsWith(ext))
      ? importsIn(source, filePath, pythonStandardLibrary)
      : {
          local: [] as string[],
          external: [] as string[],
          externalSpecifiers: [] as string[],
          dynamic: [] as string[],
          unresolved: [] as string[],
        };
    for (const name of imports.externalSpecifiers.length ? imports.externalSpecifiers : imports.external) {
      if (filePath.endsWith(".py")) external.add(name.split(".")[0]);
      const aliased = await resolveLocalImport(sourceRoot, filePath, name, input.moduleRoots, rustCrateRoots);
      if (aliased) {
        dependencyEdges.push({
          from: filePath,
          specifier: name,
          to: aliased,
          kind: "static-import",
          status: "resolved-local",
        });
        queue.push({ path: aliased, kind: "source-import" });
        continue;
      }
      const local = workspacePackages.find(item => name === item.name || name.startsWith(`${item.name}/`));
      if (local) {
        const subpath = name === local.name ? "." : `./${name.slice(local.name.length + 1)}`;
        const resolution = await resolveWorkspacePackageFiles(sourceRoot, local, subpath);
        dependencyEdges.push({
          from: filePath,
          specifier: name,
          to: resolution.files[0] ?? null,
          kind: "static-import",
          status: resolution.files.length && !resolution.unresolved.length ? "resolved-local" : "unresolved",
        });
        queue.push({ path: local.manifestPath, kind: "workspace-manifest" });
        for (const target of resolution.files) queue.push({ path: target, kind: "source-import" });
        for (const target of resolution.unresolved)
          unresolved.push({
            from: filePath,
            specifier: `${name}<unresolved-export:${target}>`,
          });
        if (!resolution.files.length) unresolved.push({ from: filePath, specifier: name });
      } else {
        const pythonImport = filePath.endsWith(".py");
        const packageName = pythonImport ? pythonDistributionForImport(name) : packageNameFromSpecifier(name);
        if (!pythonImport) external.add(packageName);
        if (filePath.endsWith(".rs")) {
          const imports = cargoImports.get(filePath) ?? new Set<string>();
          imports.add(normalizeCargoPackageName(packageName.split("::")[0]));
          cargoImports.set(filePath, imports);
        } else externalRoots.push({ name: packageName, requesterPath: filePath });
        dependencyEdges.push({
          from: filePath,
          specifier: name,
          to: null,
          kind: "static-import",
          status: "external-package",
        });
      }
    }
    for (const specifier of imports.unresolved) {
      unresolved.push({ from: filePath, specifier });
      dependencyEdges.push({
        from: filePath,
        specifier,
        to: null,
        kind: "dynamic-import",
        status: "unresolved",
      });
    }
    for (const specifier of imports.dynamic) {
      if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier.split("/")[0])) continue;
      if (filePath.endsWith(".py") && pythonStandardLibrary.has(specifier.split(".")[0])) continue;
      if (filePath.endsWith(".py") || specifier.startsWith(".") || specifier.startsWith("/")) {
        const resolved = await resolveLocalImport(sourceRoot, filePath, specifier, input.moduleRoots, rustCrateRoots);
        if (resolved) {
          dependencyEdges.push({
            from: filePath,
            specifier,
            to: resolved,
            kind: "dynamic-import",
            status: "resolved-local",
          });
          queue.push({ path: resolved, kind: "source-import" });
        } else if (filePath.endsWith(".py") && !specifier.startsWith(".") && !specifier.startsWith("app.")) {
          const packageName = pythonDistributionForImport(specifier);
          external.add(specifier.split(".")[0]);
          externalRoots.push({ name: packageName, requesterPath: filePath });
          dependencyEdges.push({ from: filePath, specifier, to: null, kind: "dynamic-import", status: "external-package" });
        } else {
          unresolved.push({ from: filePath, specifier });
          dependencyEdges.push({
            from: filePath,
            specifier,
            to: null,
            kind: "dynamic-import",
            status: "unresolved",
          });
        }
      } else {
        const aliased = await resolveLocalImport(sourceRoot, filePath, specifier, input.moduleRoots, rustCrateRoots);
        if (aliased) {
          dependencyEdges.push({
            from: filePath,
            specifier,
            to: aliased,
            kind: "dynamic-import",
            status: "resolved-local",
          });
          queue.push({ path: aliased, kind: "source-import" });
          continue;
        }
        const local = workspacePackages.find(item => specifier === item.name || specifier.startsWith(`${item.name}/`));
        if (local) {
          const subpath = specifier === local.name ? "." : `./${specifier.slice(local.name.length + 1)}`;
          const resolution = await resolveWorkspacePackageFiles(sourceRoot, local, subpath);
          dependencyEdges.push({
            from: filePath,
            specifier,
            to: resolution.files[0] ?? null,
            kind: "dynamic-import",
            status: resolution.files.length && !resolution.unresolved.length ? "resolved-local" : "unresolved",
          });
          queue.push({ path: local.manifestPath, kind: "workspace-manifest" });
          for (const target of resolution.files) queue.push({ path: target, kind: "source-import" });
          for (const target of resolution.unresolved)
            unresolved.push({
              from: filePath,
              specifier: `${specifier}<unresolved-export:${target}>`,
            });
          if (!resolution.files.length) unresolved.push({ from: filePath, specifier });
        } else {
          const packageName = packageNameFromSpecifier(specifier);
          external.add(packageName);
          externalRoots.push({ name: packageName, requesterPath: filePath });
          dependencyEdges.push({
            from: filePath,
            specifier,
            to: null,
            kind: "dynamic-import",
            status: "external-package",
          });
        }
      }
    }
    for (const specifier of imports.local) {
      const resolved = await resolveLocalImport(sourceRoot, filePath, specifier, input.moduleRoots, rustCrateRoots);
      if (resolved) {
        dependencyEdges.push({
          from: filePath,
          specifier,
          to: resolved,
          kind: "static-import",
          status: "resolved-local",
        });
        queue.push({ path: resolved, kind: "source-import" });
      } else {
        unresolved.push({ from: filePath, specifier });
        dependencyEdges.push({
          from: filePath,
          specifier,
          to: null,
          kind: "static-import",
          status: "unresolved",
        });
      }
    }
  }
  for (const path of Object.keys(selectedManifestDependencies)) {
    if (!consumedDependencySelections.has(path)) unresolved.push({ from: path, specifier: "<dependency-selection-manifest-not-in-profile>" });
  }
  for (const path of Object.keys(pythonDependencySelections)) {
    if (!seen.has(path)) unresolved.push({ from: path, specifier: "<python-requirement-selection-file-not-in-profile>" });
  }
  for (const path of Object.keys(selectedManifestScripts)) {
    if (!consumedScriptSelections.has(path)) unresolved.push({ from: path, specifier: "<script-selection-manifest-not-in-profile>" });
  }
  const hasRust = [...seen].some(path => path.endsWith(".rs"));
  if (hasRust) {
    if (![...seen].some(path => path.endsWith("Cargo.toml"))) unresolved.push({ from: "<profile>", specifier: "<cargo-manifest-not-in-profile>" });
    if (![...seen].some(path => path.endsWith("Cargo.lock"))) unresolved.push({ from: "<profile>", specifier: "<cargo-lockfile-not-in-profile>" });
    const declaredCargoNames = new Set(externalRoots.filter(root => root.requesterPath.endsWith("Cargo.toml")).map(root => normalizeCargoPackageName(root.name)));
    for (const path of [...seen].filter(item => item.endsWith("Cargo.toml"))) {
      try {
        const manifest = await readFile(await assertRegularFileWithoutSymlinkParents(sourceRoot, path), "utf8");
        for (const dependency of cargoManifestDependencies(manifest)) declaredCargoNames.add(normalizeCargoPackageName(dependency.alias));
        for (const alias of cargoAliasesByManifest.get(path)?.keys() ?? []) declaredCargoNames.add(alias);
      } catch {
        unresolved.push({ from: path, specifier: "<cargo-manifest-read-failed>" });
      }
    }
    for (const [path, imports] of cargoImports) for (const name of imports) {
      if (!declaredCargoNames.has(name)) unresolved.push({ from: path, specifier: `cargo-import-not-declared:${name}` });
    }
  }
  const hasJavaScript = filesHaveExtension(seen, [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
  const hasPython = filesHaveExtension(seen, [".py"]);
  if (hasJavaScript) {
    if (![...seen].some(path => path.endsWith("package.json")))
      unresolved.push({
        from: "<profile>",
        specifier: "<node-package-manifest-not-in-profile>",
      });
    if (![...seen].some(path => ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"].some(name => path.endsWith(name))))
      unresolved.push({
        from: "<profile>",
        specifier: "<node-lockfile-not-in-profile>",
      });
  }
  if (hasPython && ![...seen].some(path => /(^|\/)(?:pyproject\.toml|Pipfile\.lock|poetry\.lock|uv\.lock)$/i.test(path) || /(^|\/)requirements[^/]*\.txt$/i.test(path)))
    unresolved.push({
      from: "<profile>",
      specifier: "<python-dependency-manifest-not-in-profile>",
    });
  if (hasPython)
    for (const path of seen) {
      if (["poetry.lock", "Pipfile.lock"].includes(path))
        unresolved.push({
          from: path,
          specifier: "<python-lockfile-package-edges-unresolved>",
        });
    }
  const lockfilePaths = [...seen].filter(path => path.endsWith("package-lock.json") || path.endsWith("npm-shrinkwrap.json") || path.endsWith("pnpm-lock.yaml") || path.endsWith("yarn.lock") || path.endsWith("uv.lock") || path.endsWith("Cargo.lock"));
  const lockedPackages: SourceExternalPackageIdentity[] = [];
  const importersByLockfile = new Map<string, Record<string, Record<string, string | null>>>();
  for (const lockfilePath of lockfilePaths) {
    try {
      const lockSource = await readFile(await assertRegularFileWithoutSymlinkParents(sourceRoot, lockfilePath), "utf8");
      const parsed = lockfilePath.endsWith("uv.lock")
        ? parseUvLockPackages(lockSource, lockfilePath)
        : lockfilePath.endsWith("Cargo.lock")
          ? parseCargoLockPackages(lockSource, lockfilePath)
          : parseNodeLockPackages(lockSource, lockfilePath);
      lockedPackages.push(...parsed.packages);
      if (lockfilePath.endsWith("Cargo.lock")) {
        const importerPath = dirname(lockfilePath).split(sep).join("/") || ".";
        const importer: Record<string, string | null> = {};
        const manifestPath = join(importerPath === "." ? "" : importerPath, "Cargo.toml").split(sep).join("/");
        if (seen.has(manifestPath)) {
          const manifest = await readFile(await assertRegularFileWithoutSymlinkParents(sourceRoot, manifestPath), "utf8");
          for (const dependency of cargoManifestDependencies(manifest)) {
            const matches = parsed.packages.filter(identity => identity.name === normalizeCargoPackageName(dependency.name)
              && dependency.version !== null
              && cargoRequirementMatches(identity.version, dependency.version) === true);
            importer[normalizeCargoPackageName(dependency.alias)] = matches.length === 1 ? matches[0].locator : null;
          }
        }
        parsed.importers[importerPath] = importer;
      }
      importersByLockfile.set(lockfilePath, parsed.importers);
    } catch {
      unresolved.push({
        from: lockfilePath,
        specifier: "<dependency-lockfile-parse-failed>",
      });
    }
  }
  const selectedOptionalDependencies = [...new Set((input.selectedOptionalDependencies ?? []).map(normalizePackageName))].sort();
  const selectedPythonDependencyGroups = [...new Set((input.selectedPythonDependencyGroups ?? []).map(value => value.toLowerCase()))].sort();
  const selectedPythonExtras = [...new Set((input.selectedPythonExtras ?? []).map(value => value.toLowerCase()))].sort();
  const selectedOptionalSet = new Set(selectedOptionalDependencies);
  for (const name of selectedOptionalSet) {
    if (!declaredOptionalNames.has(name) && !lockedPackages.some(item => item.optionalDependencies.includes(name)))
      unresolved.push({
        from: "<profile>",
        specifier: `optional-dependency-not-declared:${name}`,
      });
  }
  const markerEnvironment = input.runtimeIdentity?.pythonCompatibility?.markerEnvironment ?? {};
  const selectedCargoTargets = [...(input.cargoTargetSelections ?? [])].map(item => ({ ...item })).sort((a, b) => compareText(a.manifestPath, b.manifestPath) || compareText(a.target, b.target));
  const rustCompileTimeEnvironment = Object.fromEntries(Object.entries(input.rustCompileTimeEnvironment ?? {}).sort(([a], [b]) => compareText(a, b)));
  const cargoTargetLockfiles = new Set<string>();
  const selectedCargoLocators = new Map<string, Set<string>>();
  for (const selection of selectedCargoTargets) {
    const manifestPath = safeRelative(sourceRoot, selection.manifestPath);
    const lockfilePath = join(dirname(manifestPath), "Cargo.lock").split(sep).join("/");
    const cargoIdentities = lockedPackages.filter(identity => identity.packageManager === "cargo" && identity.lockfilePath === lockfilePath);
    if (selection.profile !== "runtime-binary-v1" || !seen.has(manifestPath) || !seen.has(lockfilePath) || !cargoIdentities.length || !cargoTargetMatchesRuntime(selection.target, input.runtimeIdentity?.platform)) {
      unresolved.push({ from: manifestPath, specifier: "<cargo-target-profile-binding-invalid>" });
      continue;
    }
    try {
      const selectedPackages = await runCargoTargetPackageList(sourceRoot, selection);
      const selected = new Set<string>();
      const manifestSource = await readFile(await assertRegularFileWithoutSymlinkParents(sourceRoot, manifestPath), "utf8");
      const rootBlock = manifestSource.match(/^\[package\]\s*([\s\S]*?)(?=^\[|(?![\s\S]))/m)?.[1] ?? "";
      const rootName = rootBlock.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
      const rootVersion = rootBlock.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1];
      for (const value of selectedPackages) {
        const match = value.match(/^(.+?) v([^\s]+)(?: \([^)]*\))?$/);
        if (!match) {
          unresolved.push({ from: manifestPath, specifier: `cargo-target-package-unparseable:${value}` });
          continue;
        }
        const [, packageName, version] = match;
        if (packageName === rootName && version === rootVersion) continue;
        const candidates = cargoIdentities.filter(identity => identity.name === normalizeCargoPackageName(packageName) && identity.version === version);
        if (candidates.length !== 1) {
          unresolved.push({ from: manifestPath, specifier: `cargo-target-package-${candidates.length ? "ambiguous" : "not-in-lock"}:${packageName}@${version}` });
          continue;
        }
        selected.add(candidates[0].locator);
      }
      if (!selected.size) {
        unresolved.push({ from: manifestPath, specifier: "<cargo-target-package-graph-empty>" });
        continue;
      }
      cargoTargetLockfiles.add(lockfilePath);
      selectedCargoLocators.set(lockfilePath, selected);
    } catch (error) {
      unresolved.push({ from: manifestPath, specifier: `cargo-target-resolution-failed-locked-offline:${error instanceof Error ? error.message : "unknown"}` });
    }
  }
  const { required: requiredExternalSet, unresolved: dependencyClosureIssues, rootLocators } = selectExternalClosure(lockedPackages, externalRoots, importersByLockfile, selectedOptionalSet, new Set(selectedPythonExtras), markerEnvironment, cargoTargetLockfiles);
  for (const selected of selectedCargoLocators.values()) for (const locator of selected) requiredExternalSet.add(locator);
  const selectedCargoPackageLocators = Object.fromEntries([...selectedCargoLocators].sort(([a], [b]) => compareText(a, b)).map(([path, locators]) => [path, [...locators].sort()]));
  for (const issue of dependencyClosureIssues) unresolved.push({ from: "<dependency-lockfile>", specifier: issue });
  const externalArtifacts = input.externalArtifacts ?? [];
  if (profile) {
    const selectors = new Map<string, string>();
    for (const selector of profile.externalArtifacts) {
      const separator = selector.lastIndexOf(":");
      if (separator <= 0 || separator === selector.length - 1) {
        unresolved.push({ from: "<profile>", specifier: `<external-artifact-selector-invalid:${selector}>` });
        continue;
      }
      const lockfilePath = selector.slice(0, separator);
      const resolver = selector.slice(separator + 1);
      if (selectors.has(lockfilePath)) unresolved.push({ from: "<profile>", specifier: `<external-artifact-selector-duplicate:${lockfilePath}>` });
      selectors.set(lockfilePath, resolver);
    }
    for (const locator of requiredExternalSet) {
      const identity = lockedPackages.find(item => item.locator === locator);
      if (!identity) continue;
      const expectedResolver = identity.packageManager === "cargo"
        ? "resolve-linux-x86_64-runtime-artifacts"
        : identity.packageManager === "uv"
          ? `resolve-python-${profile.runtime.python.split(".").slice(0, 2).join(".")}-linux-x86_64-artifacts`
          : "resolve-required-node-artifacts";
      if (selectors.get(identity.lockfilePath) !== expectedResolver) {
        unresolved.push({ from: "<profile>", specifier: `<external-artifact-selector-missing:${identity.lockfilePath}:${expectedResolver}>` });
      }
    }
    for (const binding of externalArtifacts) {
      if (!requiredExternalSet.has(binding.locator)) unresolved.push({ from: "<profile>", specifier: `<external-artifact-binding-out-of-scope:${binding.locator}>` });
    }
  }
  const externalPackageIdentities: SourceExternalPackageIdentity[] = [];
  for (const identity of lockedPackages) {
    if (!requiredExternalSet.has(identity.locator)) {
      externalPackageIdentities.push(identity);
      continue;
    }
    const bindingMatches = artifactBindingsFor(identity, externalArtifacts);
    if (bindingMatches.length !== 1) {
      unresolved.push({
        from: identity.lockfilePath,
        specifier: `UNVERIFIED_ARTIFACT:${identity.name}@${identity.version}`,
      });
      externalPackageIdentities.push({
        ...identity,
        artifactStatus: "UNVERIFIED_ARTIFACT",
      });
      continue;
    }
    const binding = bindingMatches[0];
    if (!packagePlatformCompatible(identity, input.runtimeIdentity?.platform)) {
      unresolved.push({
        from: identity.lockfilePath,
        specifier: `PLATFORM_INCOMPATIBLE:${identity.name}@${identity.version}`,
      });
      externalPackageIdentities.push({
        ...identity,
        artifactStatus: "UNVERIFIED_ARTIFACT",
      });
      continue;
    }
    const locked = identity.lockedArtifacts.find(item => item.kind === binding.kind && item.source === binding.source);
    if (!locked || !locked.integrity.length) {
      unresolved.push({
        from: identity.lockfilePath,
        specifier: `UNVERIFIED_ARTIFACT:${identity.name}@${identity.version}`,
      });
      externalPackageIdentities.push({
        ...identity,
        artifactStatus: "UNVERIFIED_ARTIFACT",
      });
      continue;
    }
    if (binding.kind === "python-sdist") {
      unresolved.push({ from: identity.lockfilePath, specifier: `SDIST_BUILD_NOT_AUTHORIZED:${identity.name}@${identity.version}` });
      externalPackageIdentities.push({ ...identity, artifactStatus: "UNVERIFIED_ARTIFACT" });
      continue;
    }
    let artifactPath: string;
    try {
      artifactPath = safeRelative(sourceRoot, binding.path);
    } catch {
      unresolved.push({
        from: identity.lockfilePath,
        specifier: `UNVERIFIED_ARTIFACT:${identity.name}@${identity.version}`,
      });
      externalPackageIdentities.push({
        ...identity,
        artifactStatus: "UNVERIFIED_ARTIFACT",
      });
      continue;
    }
    try {
      const fullPath = await assertRegularFileWithoutSymlinkParents(sourceRoot, artifactPath);
      const bytes = await readFile(fullPath);
      const digest = sha256(bytes);
      const artifactProfileMatches = binding.kind === "python-wheel"
        ? input.runtimeIdentity?.platform === binding.platform && pythonWheelMatchesProfile(binding.source, input.runtimeIdentity.pythonCompatibility)
        : platformMatches(input.runtimeIdentity?.platform, binding.platform, binding.source);
      const cargoSourceMatches = identity.packageManager !== "cargo" || locked.source === binding.source;
      const artifactKindMatches = locked.kind === binding.kind;
      if ((locked.sizeBytes !== null && locked.sizeBytes !== bytes.byteLength) || !integrityMatches(bytes, locked.integrity) || !artifactProfileMatches || !cargoSourceMatches || !artifactKindMatches) throw new Error("artifact mismatch");
      seen.add(artifactPath);
      const artifactProvenance = provenance.get(artifactPath) ?? new Set<SourceInputKind>();
      artifactProvenance.add("dependency-artifact");
      provenance.set(artifactPath, artifactProvenance);
      dependencyEdges.push({
        from: identity.lockfilePath,
        specifier: `${identity.name}@${identity.version}`,
        to: artifactPath,
        kind: "declared-package-dependency",
        status: "verified-external-artifact",
      });
      externalPackageIdentities.push({
        ...identity,
        artifactStatus: "VERIFIED_ARTIFACT",
        artifactPath,
        artifactSha256: digest,
        artifactSizeBytes: bytes.byteLength,
        artifactPlatform: binding.platform,
        artifactSource: binding.source,
        artifactKind: binding.kind,
        artifactIntegrity: [...locked.integrity],
      });
    } catch {
      unresolved.push({
        from: identity.lockfilePath,
        specifier: `UNVERIFIED_ARTIFACT:${identity.name}@${identity.version}`,
      });
      externalPackageIdentities.push({
        ...identity,
        artifactStatus: "UNVERIFIED_ARTIFACT",
        artifactPath,
        artifactPlatform: binding.platform,
      });
    }
  }
  externalPackageIdentities.sort((a, b) => compareText(a.lockfilePath, b.lockfilePath) || compareText(a.name, b.name) || compareText(a.version, b.version));
  for (const edge of dependencyEdges) {
    if (edge.status !== "external-package") continue;
    if (edge.from.endsWith(".rs")) {
      const importName = normalizeCargoPackageName(packageNameFromSpecifier(edge.specifier).split("::")[0]);
      const ownerManifest = [...cargoAliasesByManifest.keys()]
        .filter(path => {
          const manifestDirectory = dirname(path).split(sep).join("/");
          return manifestDirectory === "." || edge.from.startsWith(`${manifestDirectory}/`);
        })
        .sort((left, right) => right.length - left.length)[0];
      const packageName = ownerManifest ? cargoAliasesByManifest.get(ownerManifest)?.get(importName) : undefined;
      const selectedRoot = ownerManifest && packageName ? rootLocators.get(`${ownerManifest}\0${packageName}`) : undefined;
      if (packageName === "@self" && ownerManifest) {
        edge.status = "resolved-local";
        edge.to = cargoSelfLibraryByManifest.get(ownerManifest) ?? null;
        continue;
      }
      const matches = externalPackageIdentities.filter(item => item.packageManager === "cargo"
        && item.name === packageName
        && (!selectedRoot || item.locator === selectedRoot)
        && requiredExternalSet.has(item.locator)
        && item.artifactStatus === "VERIFIED_ARTIFACT");
      if (matches.length === 1) {
        edge.status = "verified-external-artifact";
        edge.to = matches[0].artifactPath;
      } else {
        edge.status = "unresolved";
        unresolved.push({ from: edge.from, specifier: `cargo-import-resolution-${matches.length ? "ambiguous" : "missing"}:${packageName ?? importName}` });
      }
      continue;
    }
    const pythonImport = edge.from.endsWith(".py") && (edge.kind === "static-import" || edge.kind === "dynamic-import");
    const resolvedPythonName = pythonImport ? pythonDistributionForImport(edge.specifier) : null;
    const declaredRoot = externalRoots.find(root => root.requesterPath === edge.from && (
      root.name === resolvedPythonName || edge.specifier === root.name || edge.specifier.startsWith(`${root.name}@`) || edge.specifier.startsWith(`${root.name}=`) || edge.specifier.startsWith(`${root.name}<`) || edge.specifier.startsWith(`${root.name}/`)
    ));
    const rawPackageName = declaredRoot?.name ?? resolvedPythonName ?? packageNameFromSpecifier(edge.specifier);
    const packageName = isPythonDependencyPath(edge.from) ? normalizePythonPackageName(rawPackageName) : edge.from.endsWith("Cargo.toml") ? normalizeCargoPackageName(rawPackageName) : normalizePackageName(rawPackageName);
    const locator = rootLocators.get(`${edge.from}\0${packageName}`);
    let identity = externalPackageIdentities.find(item => item.locator === locator);
    if (!identity && edge.from.endsWith("Cargo.toml")) {
      const at = edge.specifier.lastIndexOf("@");
      const dependencyName = normalizeCargoPackageName(at > 0 ? edge.specifier.slice(0, at) : rawPackageName);
      const requirement = at > 0 ? edge.specifier.slice(at + 1) : "*";
      const candidates = externalPackageIdentities.filter(item => item.packageManager === "cargo"
        && item.lockfilePath === join(dirname(edge.from), "Cargo.lock").split(sep).join("/")
        && item.name === dependencyName
        && cargoRequirementMatches(item.version, requirement) === true
        && requiredExternalSet.has(item.locator)
        && item.artifactStatus === "VERIFIED_ARTIFACT");
      if (candidates.length === 1) identity = candidates[0];
      else if (candidates.length > 1) unresolved.push({ from: edge.from, specifier: `cargo-root-artifact-ambiguous:${dependencyName}` });
    }
    if (identity?.artifactStatus === "VERIFIED_ARTIFACT") {
      edge.status = "verified-external-artifact";
      edge.to = identity.artifactPath;
    }
  }
  if (!input.profileId?.trim()) unresolved.push({ from: "<profile>", specifier: "<profile-id-missing>" });
  if (input.profileDigest !== undefined && !/^[a-f0-9]{64}$/i.test(input.profileDigest)) {
    unresolved.push({ from: "<profile>", specifier: "<invalid-profile-digest>" });
  }
  if (!input.runtimeIdentity?.packageManager?.trim() || (!input.runtimeIdentity.node?.trim() && !input.runtimeIdentity.python?.trim() && !input.runtimeIdentity.cargo?.trim()))
    unresolved.push({
      from: "<profile>",
      specifier: "<runtime-identity-incomplete>",
    });
  const externalImports = [...external].sort();
  const files = [...seen].sort();
  return {
    discoveryMode: "static-plus-explicit-profile-v1",
    admissionEligible: false,
    files,
    provenance: Object.fromEntries([...provenance].sort(([a], [b]) => compareText(a, b)).map(([path, kinds]) => [path, [...kinds].sort()])),
    profileId: input.profileId ?? "",
    ...(profile && verifySpec224ExecutionProfile(profile) ? { profileDigest: profile.profileDigest } : {}),
    runtimeIdentity: input.runtimeIdentity ?? {},
    packageIdentities: workspacePackages
      .map(item => ({
        name: item.name,
        version: typeof item.manifest.version === "string" ? item.manifest.version : null,
        manifestPath: item.manifestPath,
        origin: "workspace" as const,
      }))
      .sort((a, b) => compareText(a.name, b.name)),
    externalPackageIdentities,
    dependencyEdges: dependencyEdges.sort((a, b) => compareText(a.from, b.from) || compareText(a.specifier, b.specifier) || compareText(a.to ?? "", b.to ?? "")),
    externalImports,
    unresolvedImports: unresolved.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0)),
    selectedOptionalDependencies,
    selectedPythonDependencyGroups,
    selectedPythonExtras,
    ...(Object.keys(pythonDependencySelections).length ? { pythonDependencySelections } : {}),
    pythonStandardLibraryModules,
    selectedCargoTargets,
    selectedCargoPackageLocators,
    dependencyArtifacts: [...new Set(input.dependencyArtifacts.map(path => safeRelative(sourceRoot, path)))].sort(compareText),
    rustCompileTimeEnvironment,
    ...(Object.keys(selectedManifestDependencies).length ? { selectedManifestDependencies } : {}),
    ...(Object.keys(selectedManifestScripts).length ? { selectedManifestScripts } : {}),
    requiredExternalPackages: [...requiredExternalSet].sort(),
    closureComplete: unresolved.length === 0 && [...requiredExternalSet].every(locator => externalPackageIdentities.find(item => item.locator === locator)?.artifactStatus === "VERIFIED_ARTIFACT"),
  };
}

type ReadOnlyBundleInput = { sourceRoot: string; destination: string; closure: SourceClosureResult; sourceRevision: string; specDigest: string; dependencyArtifacts: string[]; executionProfile?: Spec224ExecutionProfile; sourceTreeAttestation?: SourceBundleManifest["sourceTreeAttestation"]; sourceTreeFileModes?: ReadonlyMap<string, number> };

export async function assembleReadOnlySourceBundle(input: ReadOnlyBundleInput): Promise<SourceBundleManifest> {
  return assembleReadOnlySourceBundleInternal(input, false);
}

async function assembleReadOnlySourceBundleInternal(input: ReadOnlyBundleInput, sourceTreeVerified: boolean): Promise<SourceBundleManifest> {
  const sourceRoot = resolve(input.sourceRoot);
  const destination = resolve(input.destination);
  const closure = input.closure;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(input.sourceRevision) || !/^[a-f0-9]{64}$/i.test(input.specDigest) || !closure.profileId.trim() || !closure.runtimeIdentity.packageManager?.trim() || (!closure.runtimeIdentity.node?.trim() && !closure.runtimeIdentity.python?.trim() && !closure.runtimeIdentity.cargo?.trim())) throw new Error("SPEC224_BUNDLE_BASELINE_INVALID");
  if (closure.profileDigest && (!input.executionProfile || !verifySpec224ExecutionProfile(input.executionProfile))) {
    throw new Error("SPEC224_BUNDLE_VERIFIED_PROFILE_REQUIRED");
  }
  if (input.executionProfile && (
    input.executionProfile.profileDigest !== closure.profileDigest ||
    input.executionProfile.profileId !== closure.profileId ||
    input.executionProfile.repository.sourceCommit.toLowerCase() !== input.sourceRevision.toLowerCase()
  )) throw new Error("SPEC224_BUNDLE_PROFILE_SOURCE_MISMATCH");
  if (closure.profileDigest && !sourceTreeVerified) throw new Error("SPEC224_BUNDLE_PROFILE_SOURCE_ATTESTATION_REQUIRED");
  if (input.sourceTreeAttestation && ((input.sourceTreeAttestation.schemaVersion !== "spec224.git-tree-source-attestation.v1" && input.sourceTreeAttestation.schemaVersion !== "spec224.git-tree-source-attestation.v2") || !input.sourceTreeAttestation.treePath.trim() || !/^[a-f0-9]{64}$/i.test(input.sourceTreeAttestation.manifestDigest) || (input.sourceTreeAttestation.schemaVersion === "spec224.git-tree-source-attestation.v1" && input.sourceTreeAttestation.scopeMode !== undefined) || (input.sourceTreeAttestation.schemaVersion === "spec224.git-tree-source-attestation.v2" && input.sourceTreeAttestation.scopeMode !== "exact-path-set"))) throw new Error("SPEC224_BUNDLE_SOURCE_TREE_ATTESTATION_INVALID");
  if (!closure.closureComplete || closure.unresolvedImports.length || closure.dependencyEdges.some(edge => edge.status !== "resolved-local" && edge.status !== "verified-external-artifact" && edge.status !== "optional-dependency-excluded" && edge.status !== "profile-dependency-excluded")) throw new Error("SPEC224_BUNDLE_CLOSURE_INCOMPLETE");
  const destRelative = relative(sourceRoot, destination);
  if (!destRelative || (destRelative !== ".." && !destRelative.startsWith(`..${sep}`))) throw new Error("SPEC224_BUNDLE_DESTINATION_INSIDE_SOURCE");
  const files = [...new Set(closure.files.map(file => safeRelative(sourceRoot, file)))].sort();
  if (!files.length || files.length !== closure.files.length) throw new Error("SPEC224_BUNDLE_FILE_SET_INVALID");
  const dependencyArtifacts = input.dependencyArtifacts.map(file => safeRelative(sourceRoot, file)).sort();
  if (canonicalJson(dependencyArtifacts) !== canonicalJson(closure.dependencyArtifacts)) {
    throw new Error("SPEC224_BUNDLE_DEPENDENCY_ARTIFACT_SET_MISMATCH");
  }
  if (new Set(dependencyArtifacts).size !== dependencyArtifacts.length) throw new Error("SPEC224_BUNDLE_DEPENDENCY_ARTIFACT_DUPLICATE");
  if (dependencyArtifacts.some(file => !files.includes(file))) throw new Error("SPEC224_BUNDLE_DEPENDENCY_ARTIFACT_MISSING");
  const content: Array<{ path: string; bytes: Buffer; mode: number }> = [];
  for (const filePath of files) {
    const sourcePath = await assertRegularFileWithoutSymlinkParents(sourceRoot, filePath);
    const before = await lstat(sourcePath);
    const bytes = await readFile(sourcePath);
    const after = await lstat(sourcePath);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.mode !== after.mode || bytes.byteLength !== after.size) throw new Error("SPEC224_BUNDLE_SOURCE_CHANGED_DURING_ASSEMBLY");
    const sourceTreeMode = input.sourceTreeFileModes?.get(filePath);
    if (sourceTreeMode !== undefined && sourceTreeMode !== 0o644 && sourceTreeMode !== 0o755) throw new Error("SPEC224_BUNDLE_SOURCE_TREE_MODE_INVALID");
    if (sourceTreeMode !== undefined && (before.mode & 0o111 ? 0o755 : 0o644) !== sourceTreeMode) throw new Error(`SPEC224_BUNDLE_SOURCE_TREE_MODE_MISMATCH:${filePath}`);
    content.push({ path: filePath, bytes, mode: sourceTreeMode ?? (before.mode & 0o777) });
  }
  const fileSet = new Set(files);
  const provenanceEntries = Object.entries(closure.provenance);
  if (provenanceEntries.length !== files.length || provenanceEntries.some(([path, kinds]) => !fileSet.has(safeRelative(sourceRoot, path)) || !Array.isArray(kinds) || kinds.length === 0)) throw new Error("SPEC224_BUNDLE_PROVENANCE_INVALID");
  const dependencyEdges = [...closure.dependencyEdges];
  const packageIdentities = [...closure.packageIdentities];
  if (new Set(packageIdentities.map(item => item.name)).size !== packageIdentities.length || packageIdentities.some(item => !item.name.trim() || !fileSet.has(safeRelative(sourceRoot, item.manifestPath)) || !item.manifestPath.endsWith("package.json"))) throw new Error("SPEC224_BUNDLE_PACKAGE_IDENTITY_INVALID");
  if (closure.externalPackageIdentities.some(item => !item.name.trim() || !item.version.trim() || !fileSet.has(safeRelative(sourceRoot, item.lockfilePath)) || item.integrity.some(hash => !/^(?:sha256:[a-f0-9]{64}|sha(?:256|384|512)-[A-Za-z0-9+/=]+)$/i.test(hash)))) throw new Error("SPEC224_BUNDLE_EXTERNAL_PACKAGE_IDENTITY_INVALID");
  for (const name of closure.requiredExternalPackages) {
    const matches = closure.externalPackageIdentities.filter(item => item.locator === name);
    if (matches.length !== 1 || matches[0].artifactStatus !== "VERIFIED_ARTIFACT" || !matches[0].artifactPath || !matches[0].artifactSha256 || !fileSet.has(safeRelative(sourceRoot, matches[0].artifactPath))) throw new Error("SPEC224_BUNDLE_REQUIRED_ARTIFACT_UNVERIFIED");
    const identity = matches[0];
    const entry = content.find(item => item.path === identity.artifactPath);
    const lockedArtifact = identity.lockedArtifacts.find(artifact => artifact.kind === identity.artifactKind && artifact.source === identity.artifactSource && canonicalJson([...artifact.integrity].sort()) === canonicalJson([...identity.artifactIntegrity].sort()));
    const artifactProfileMatches = identity.artifactKind === "python-wheel"
      ? closure.runtimeIdentity.platform === identity.artifactPlatform && pythonWheelMatchesProfile(identity.artifactSource, closure.runtimeIdentity.pythonCompatibility)
      : platformMatches(closure.runtimeIdentity.platform, identity.artifactPlatform ?? "", identity.artifactSource);
    if (!entry || sha256(entry.bytes) !== identity.artifactSha256 || !lockedArtifact || !integrityMatches(entry.bytes, lockedArtifact.integrity) || !packagePlatformCompatible(identity, closure.runtimeIdentity.platform) || !artifactProfileMatches) throw new Error("SPEC224_BUNDLE_REQUIRED_ARTIFACT_DIGEST_MISMATCH");
  }
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
    ...(input.sourceTreeAttestation ? { sourceTreeAttestation: input.sourceTreeAttestation } : {}),
    profileId: closure.profileId,
    ...(closure.profileDigest ? { profileDigest: closure.profileDigest } : {}),
    runtimeIdentity: closure.runtimeIdentity,
    selectedOptionalDependencies: [...closure.selectedOptionalDependencies].sort(),
    selectedPythonDependencyGroups: [...closure.selectedPythonDependencyGroups].sort(),
    selectedPythonExtras: [...closure.selectedPythonExtras].sort(),
    ...(closure.pythonDependencySelections ? { pythonDependencySelections: closure.pythonDependencySelections } : {}),
    ...(closure.pythonStandardLibraryModules.length
      ? { pythonStandardLibraryModules: [...closure.pythonStandardLibraryModules].sort() }
      : {}),
    selectedCargoTargets: [...closure.selectedCargoTargets],
    selectedCargoPackageLocators: Object.fromEntries(Object.entries(closure.selectedCargoPackageLocators).map(([path, locators]) => [path, [...locators].sort()])),
    rustCompileTimeEnvironment: { ...closure.rustCompileTimeEnvironment },
    ...(closure.selectedManifestDependencies ? { selectedManifestDependencies: closure.selectedManifestDependencies } : {}),
    ...(closure.selectedManifestScripts ? { selectedManifestScripts: closure.selectedManifestScripts } : {}),
    requiredExternalPackages: [...closure.requiredExternalPackages].sort(),
    packageIdentities: packageIdentities.sort((a, b) => compareText(a.name, b.name)),
    externalPackageIdentities: [...closure.externalPackageIdentities].sort((a, b) => compareText(a.name, b.name) || compareText(a.version, b.version) || compareText(a.lockfilePath, b.lockfilePath)),
    dependencyArtifacts,
    files: content.map(({ path, bytes, mode }) => ({
      path,
      sha256: sha256(bytes),
      sizeBytes: bytes.byteLength,
      mode,
      provenance: [...new Set(closure.provenance[path] ?? [])].sort() as SourceInputKind[],
    })),
    dependencyEdges: dependencyEdges.sort((a, b) => compareText(a.from, b.from) || compareText(a.specifier, b.specifier) || compareText(a.to ?? "", b.to ?? "")),
    externalImports: [...closure.externalImports].sort(),
    unresolvedImports: [...closure.unresolvedImports].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0)),
    closureComplete: true,
  };
  const manifest: SourceBundleManifest = {
    ...manifestBase,
    bundleDigest: sha256(canonicalJson(manifestBase)),
  };
  const manifestPath = join(destination, BUNDLE_MANIFEST);
  await writeFile(manifestPath, `${canonicalJson(manifest)}\n`, {
    flag: "wx",
    mode: 0o444,
  });
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

/**
 * Binds a dependency-closed bundle to one exact Git tree and rejects files
 * whose bytes or origin do not match that tree or a verified locked artifact.
 * This is integrity evidence only, not runtime admission or isolation proof.
 */
export async function assembleGitTreeAttestedSourceBundle(input: {
  repositoryRoot: string;
  sourceRoot: string;
  destination: string;
  sourceManifest: GitTreeSourceManifest;
  sourceRevision: string;
  closure: Omit<SourceClosureInput, "sourceRoot">;
  specDigest: string;
}): Promise<{ bundle: SourceBundleManifest; sourceManifestDigest: string }> {
  if (input.sourceManifest.sourceRevision.toLowerCase() !== input.sourceRevision.toLowerCase()) throw new Error("SPEC224_BUNDLE_SOURCE_REVISION_MISMATCH");
  if (input.closure.executionProfile) {
    const profile = input.closure.executionProfile;
    if (!verifySpec224ExecutionProfile(profile) || profile.repository.sourceCommit.toLowerCase() !== input.sourceRevision.toLowerCase()) {
      throw new Error("SPEC224_BUNDLE_PROFILE_SOURCE_MISMATCH");
    }
    const actualGitTree = await gitText(input.repositoryRoot, ["rev-parse", `${input.sourceRevision}^{tree}`], "SPEC224_BUNDLE_PROFILE_GIT_TREE_UNAVAILABLE");
    if (actualGitTree.toLowerCase() !== profile.repository.gitTree.toLowerCase()) {
      throw new Error("SPEC224_BUNDLE_PROFILE_GIT_TREE_MISMATCH");
    }
  }
  const [repositoryStat, sourceStat] = await Promise.all([lstat(input.repositoryRoot).catch(() => null), lstat(input.sourceRoot).catch(() => null)]);
  if (!repositoryStat?.isDirectory() || repositoryStat.isSymbolicLink() || !sourceStat?.isDirectory() || sourceStat.isSymbolicLink()) throw new Error("SPEC224_BUNDLE_SOURCE_ROOT_INVALID");
  const [repositoryRealPath, sourceRealPath] = await Promise.all([realpath(input.repositoryRoot), realpath(input.sourceRoot)]);
  const expectedSourceRoot = resolve(repositoryRealPath, input.sourceManifest.treePath === "." ? "." : input.sourceManifest.treePath);
  if (sourceRealPath !== expectedSourceRoot) throw new Error("SPEC224_BUNDLE_SOURCE_ROOT_MISMATCH");
  await attestGitTreeSourceManifest({ repositoryRoot: input.repositoryRoot, manifest: input.sourceManifest });
  const closure = await discoverSourceClosure({ ...input.closure, sourceRoot: input.sourceRoot });
  if (!closure.closureComplete) throw new Error("SPEC224_BUNDLE_CLOSURE_INCOMPLETE");
  const bundle = await assembleReadOnlySourceBundleInternal({
    sourceRoot: input.sourceRoot,
    destination: input.destination,
    closure,
    sourceRevision: input.sourceRevision,
    specDigest: input.specDigest,
    dependencyArtifacts: input.closure.dependencyArtifacts,
    ...(input.closure.executionProfile ? { executionProfile: input.closure.executionProfile } : {}),
    sourceTreeAttestation: { schemaVersion: input.sourceManifest.schemaVersion, ...(input.sourceManifest.scopeMode ? { scopeMode: input.sourceManifest.scopeMode } : {}), treePath: input.sourceManifest.treePath, manifestDigest: input.sourceManifest.manifestDigest },
    sourceTreeFileModes: new Map(input.sourceManifest.files.map(file => [file.path, file.mode])),
  }, true);
  const sourceFiles = new Map(input.sourceManifest.files.map(file => [file.path, file]));
  const verifiedArtifacts = new Map(closure.externalPackageIdentities.filter(item => item.artifactStatus === "VERIFIED_ARTIFACT" && item.artifactPath && item.artifactSha256).map(item => [item.artifactPath!, item]));
  for (const file of bundle.files) {
    const source = sourceFiles.get(file.path);
    if (source) {
      if (source.sha256 !== file.sha256 || source.sizeBytes !== file.sizeBytes || source.mode !== file.mode) throw new Error(`SPEC224_BUNDLE_SOURCE_TREE_FILE_MISMATCH:${file.path}`);
      continue;
    }
    const artifact = verifiedArtifacts.get(file.path);
    if (!artifact || artifact.artifactSha256 !== file.sha256) throw new Error(`SPEC224_BUNDLE_FILE_OUTSIDE_ATTESTED_INPUTS:${file.path}`);
  }
  const verified = await verifyReadOnlySourceBundle(input.destination);
  if (!verified.valid) throw new Error("SPEC224_BUNDLE_POST_ASSEMBLY_INTEGRITY_FAILED");
  await attestGitTreeSourceManifest({ repositoryRoot: input.repositoryRoot, manifest: input.sourceManifest });
  return { bundle, sourceManifestDigest: input.sourceManifest.manifestDigest };
}

/** Content-integrity check only; it does not attest owner approval or runtime isolation. */
export async function verifyReadOnlySourceBundle(bundlePath: string): Promise<{ valid: boolean; integrityOnly: true; reason: string | null }> {
  const root = resolve(bundlePath);
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
      return {
        valid: false,
        integrityOnly: true,
        reason: "bundle_root_invalid",
      };
    const manifestFile = await assertRegularFileWithoutSymlinkParents(root, BUNDLE_MANIFEST);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as SourceBundleManifest;
    const { bundleDigest, ...base } = manifest;
    if (((manifest.schemaVersion as string) !== "spec224.source-bundle.v1" && (manifest.schemaVersion as string) !== "spec224.source-bundle.v2") || sha256(canonicalJson(base)) !== bundleDigest)
      return {
        valid: false,
        integrityOnly: true,
        reason: "manifest_digest_mismatch",
      };
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
    if ((await lstat(root)).mode & 0o222)
      return {
        valid: false,
        integrityOnly: true,
        reason: "writable_bundle_root",
      };
    if ((await lstat(join(root, BUNDLE_MANIFEST))).mode & 0o222) return { valid: false, integrityOnly: true, reason: "writable_manifest" };
    for (const file of manifest.files) {
      const safePath = safeRelative(root, file.path);
      const absolute = await assertRegularFileWithoutSymlinkParents(root, safePath);
      const stat = await lstat(absolute);
      const bytes = await readFile(absolute);
      if (sha256(bytes) !== file.sha256 || bytes.byteLength !== file.sizeBytes || (stat.mode & 0o222) !== 0 || (manifest.schemaVersion === "spec224.source-bundle.v2" && (!Number.isInteger(file.mode) || !Array.isArray(file.provenance) || file.provenance.length === 0)))
        return {
          valid: false,
          integrityOnly: true,
          reason: "file_content_or_mode_mismatch",
        };
    }
    return { valid: true, integrityOnly: true, reason: null };
  } catch (error) {
    return {
      valid: false,
      integrityOnly: true,
      reason: error instanceof Error ? error.message : "bundle_read_failed",
    };
  }
}
