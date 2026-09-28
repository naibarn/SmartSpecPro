import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createSpec224ExecutionProfile,
  SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE,
} from "../spec224ExecutionProfile";

import {
  attestGitTreeSourceManifest,
  calculateGitTreeSourceManifestDigest,
  type GitTreeSourceManifest,
  assembleReadOnlySourceBundle,
  discoverSourceClosure,
  verifyReadOnlySourceBundle,
} from "../spec224SourceBundle";

const temporaryRoots: string[] = [];
const specDigest = "a".repeat(64);

function fixtureExecutionProfile() {
  const { profileDigest: _profileDigest, ...base } = SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE;
  return createSpec224ExecutionProfile({
    ...base,
    profileId: "spec224-profile-binding-test",
    repository: { sourceCommit: "f".repeat(40), gitTree: "a".repeat(40) },
    workspaceManifestPaths: ["package.json"],
    workspaces: ["."],
    generatedArtifacts: [],
    entrypoints: {
      node: ["src/profiled.ts"],
      python: [],
      rust: [],
    },
    sourceInputs: ["src/profiled.ts"],
    moduleRoots: [],
    pythonStandardLibrarySha256: createHash("sha256").update("asyncio\njson").digest("hex"),
    dependencyManifests: { runtime: ["package.json", "pnpm-lock.yaml"], testOnly: [] },
    pythonDependencySelections: {},
    selectedManifestDependencies: { "package.json": [] },
    selectedManifestScripts: { "package.json": [] },
    externalArtifacts: ["pnpm-lock.yaml:resolve-required-node-artifacts"],
  });
}

function uvPackageLocator(name: string, version: string, sourceIdentity: string, block: string): string {
  return `uv.lock#uv:${name}@${version}|source=${sourceIdentity}|node=${createHash("sha256").update(block.trim()).digest("hex")}`;
}

async function unlockTree(path: string): Promise<void> {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return;
  if (stat.isDirectory()) {
    for (const name of await readdir(path)) await unlockTree(join(path, name));
  }
  await chmod(path, 0o755).catch(() => undefined);
}

async function sourceFixture() {
  const workspace = await mkdtemp(join(tmpdir(), "spec224-source-bundle-"));
  temporaryRoots.push(workspace);
  const root = join(workspace, "source");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src/main.ts"), 'import { value } from "./dep";\nimport lodash from "lodash";\nexport { value, lodash };\n');
  await writeFile(join(root, "src/dep.ts"), "export const value = 42;\n");
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  return root;
}

async function git(repositoryRoot: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", repositoryRoot, ...args], { encoding: "buffer" }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.toString("utf8").trim() || error.message));
      else resolve(stdout);
    });
  });
}

async function gitTreeFixture() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "spec224-git-tree-attestation-"));
  temporaryRoots.push(repositoryRoot);
  await git(repositoryRoot, ["init"]);
  await git(repositoryRoot, ["config", "user.email", "spec224@example.invalid"]);
  await git(repositoryRoot, ["config", "user.name", "Spec 224 Test"]);
  await mkdir(join(repositoryRoot, "source/bin"), { recursive: true });
  await mkdir(join(repositoryRoot, "source/src"), { recursive: true });
  await writeFile(join(repositoryRoot, "source/bin/run.sh"), "#!/bin/sh\necho source-attestation\n");
  await chmod(join(repositoryRoot, "source/bin/run.sh"), 0o755);
  await writeFile(join(repositoryRoot, "source/src/main.ts"), "export const sourceAttestation = true;\n");
  await git(repositoryRoot, ["add", "source"]);
  await git(repositoryRoot, ["commit", "-m", "source fixture"]);
  const sourceRevision = (await git(repositoryRoot, ["rev-parse", "HEAD"])).toString("utf8").trim();
  return { repositoryRoot, sourceRevision };
}

async function gitTreeManifest(repositoryRoot: string, sourceRevision: string): Promise<GitTreeSourceManifest> {
  const files = await Promise.all(
    ["bin/run.sh", "src/main.ts"].map(async path => {
      const absolute = join(repositoryRoot, "source", path);
      const bytes = await readFile(absolute);
      const stat = await lstat(absolute);
      return {
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: bytes.byteLength,
        mode: stat.mode & 0o111 ? 0o755 : 0o644,
      };
    })
  );
  const base = {
    schemaVersion: "spec224.git-tree-source-attestation.v1" as const,
    sourceRevision,
    treePath: "source",
    files,
  };
  return {
    ...base,
    manifestDigest: calculateGitTreeSourceManifestDigest(base),
  };
}

async function makeBundle(sourceRoot: string, destination: string) {
  await writeFile(join(sourceRoot, "src/main.ts"), 'import { value } from "./dep";\nexport { value };\n');
  await writeFile(join(sourceRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  const closure = await discoverSourceClosure({
    sourceRoot,
    entryPaths: ["src/main.ts"],
    dependencyArtifacts: ["pnpm-lock.yaml"],
    profileInputs: [{ path: "package.json", kind: "runtime-config" }],
    profileId: "spec224-test-node",
    runtimeIdentity: {
      node: process.version,
      packageManager: "fixture-pnpm@10.4.1",
    },
  });
  return assembleReadOnlySourceBundle({
    sourceRoot,
    destination,
    closure,
    sourceRevision: "c".repeat(40),
    specDigest,
    dependencyArtifacts: ["pnpm-lock.yaml"],
  });
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await unlockTree(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("Spec 224 source bundle tooling", () => {
  it("recursively discovers local imports and leaves external package edges explicit", async () => {
    const root = await sourceFixture();
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileId: "external-package-fail-closed",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" },
    });
    expect(closure.files).toEqual(["pnpm-lock.yaml", "src/dep.ts", "src/main.ts"]);
    expect(closure.externalImports).toEqual(["lodash"]);
    expect(closure.closureComplete).toBe(false);
    await expect(
      assembleReadOnlySourceBundle({
        sourceRoot: root,
        destination: join(root, "..", "incomplete-bundle"),
        closure,
        sourceRevision: "e".repeat(40),
        specDigest,
        dependencyArtifacts: ["pnpm-lock.yaml"],
      })
    ).rejects.toThrow("SPEC224_BUNDLE_CLOSURE_INCOMPLETE");
  });

  it("assembles repeatable read-only bundles and detects post-seal mutation", async () => {
    const root = await sourceFixture();
    const first = await makeBundle(root, join(root, "..", "bundle-one"));
    const second = await makeBundle(root, join(root, "..", "bundle-two"));
    const firstPath = join(root, "..", "bundle-one");
    expect(first.bundleDigest).toBe(second.bundleDigest);
    expect(first.closureComplete).toBe(true);
    expect(await verifyReadOnlySourceBundle(firstPath)).toMatchObject({
      valid: true,
      integrityOnly: true,
    });

    const target = join(firstPath, "src/dep.ts");
    await chmod(join(firstPath, "src"), 0o755);
    await chmod(target, 0o644);
    await writeFile(target, "export const value = 99;\n");
    expect(await verifyReadOnlySourceBundle(firstPath)).toMatchObject({
      valid: false,
      integrityOnly: true,
    });
    await chmod(join(firstPath, "src"), 0o555);
    expect((await readFile(join(firstPath, ".spec224-source-bundle.json"), "utf8")).trim()).toContain(first.bundleDigest);
  });

  it("follows workspace exports and declared local package edges while retaining package provenance", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "generated"), { recursive: true });
    await mkdir(join(root, "tests/fixtures"), { recursive: true });
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "fixture-app",
        version: "1.0.0",
        scripts: { smoke: "node scripts/task.ts" },
        dependencies: { "@fixture/shared": "workspace:*" },
      })
    );
    await writeFile(join(root, "generated/contract.ts"), "export const contractVersion = 1;\n");
    await writeFile(join(root, "tests/fixtures/requirements.json"), "{}\n");
    await writeFile(join(root, "scripts/task.ts"), "export {};\n");
    await mkdir(join(root, "packages/shared/src"), { recursive: true });
    await writeFile(
      join(root, "packages/shared/package.json"),
      JSON.stringify({
        name: "@fixture/shared",
        exports: {
          ".": { types: "./src/index.ts", import: "./src/index.ts" },
          "./extra": "./src/extra.ts",
        },
        dependencies: { "@fixture/math": "workspace:*" },
      })
    );
    await writeFile(join(root, "packages/shared/src/index.ts"), 'export { add } from "@fixture/math";\n');
    await writeFile(join(root, "packages/shared/src/extra.ts"), "export const extra = true;\n");
    await mkdir(join(root, "packages/math/src"), { recursive: true });
    await writeFile(
      join(root, "packages/math/package.json"),
      JSON.stringify({
        name: "@fixture/math",
        exports: { ".": "./src/index.ts" },
      })
    );
    await writeFile(join(root, "packages/math/src/index.ts"), "export const add = (a: number, b: number) => a + b;\n");
    await writeFile(join(root, "src/main.ts"), 'import { add } from "@fixture/shared";\nexport const loadExtra = () => import("@fixture/shared/extra");\nexport { add };\n');

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [
        { path: "package.json", kind: "runtime-config" },
        { path: "generated/contract.ts", kind: "generated-artifact" },
        { path: "tests/fixtures/requirements.json", kind: "test-fixture" },
      ],
      workspaceManifestPaths: ["packages/shared/package.json", "packages/math/package.json"],
      profileId: "workspace-test",
      runtimeIdentity: {
        node: process.version,
        packageManager: "fixture-pnpm@10.4.1",
      },
    });

    expect(closure.files).toContain("packages/shared/src/index.ts");
    expect(closure.files).toContain("packages/math/src/index.ts");
    expect(closure.files).toContain("packages/shared/src/extra.ts");
    expect(closure.files).toContain("generated/contract.ts");
    expect(closure.files).toContain("tests/fixtures/requirements.json");
    expect(closure.files).toContain("scripts/task.ts");
    expect(closure.dependencyEdges.some(edge => edge.kind === "workspace-dependency" && edge.status === "resolved-local")).toBe(true);
    expect(closure.dependencyEdges.some(edge => edge.kind === "dynamic-import" && edge.status === "resolved-local")).toBe(true);
    expect(closure.provenance["src/main.ts"]).toContain("entry");
    expect(closure.provenance["generated/contract.ts"]).toContain("generated-artifact");
    const manifest = await assembleReadOnlySourceBundle({
      sourceRoot: root,
      destination: join(root, "..", "workspace-bundle"),
      closure,
      sourceRevision: "d".repeat(40),
      specDigest,
      dependencyArtifacts: ["pnpm-lock.yaml"],
    });
    expect(manifest.packageIdentities.map(item => item.name)).toEqual(["@fixture/math", "@fixture/shared"]);
    expect(manifest.closureComplete).toBe(true);
    expect(manifest.admissionEligible).toBe(false);
  });

  it("rejects environment and credential paths during closure discovery", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, ".env.local"), "TOKEN=not-for-bundling\n");
    await expect(
      discoverSourceClosure({
        sourceRoot: root,
        entryPaths: [".env.local"],
        dependencyArtifacts: [],
      })
    ).rejects.toThrow("SPEC224_BUNDLE_SENSITIVE_PATH_REJECTED");
  });

  it("recursively inventories Python requirements and requires a matching lock entry", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python/app"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "from app.module import value\n");
    await writeFile(join(root, "python/app/module.py"), "value = 1\n");
    await writeFile(join(root, "requirements.txt"), "-r requirements/base.txt\n");
    await mkdir(join(root, "requirements"), { recursive: true });
    await writeFile(join(root, "requirements/base.txt"), "sample-lib>=1.0\n");

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python/main.py"],
      dependencyArtifacts: ["requirements.txt"],
      moduleRoots: [{ prefix: "app", root: "python/app", language: "python" }],
      profileId: "python-test",
      runtimeIdentity: { python: "3.12", packageManager: "pip" },
    });

    expect(closure.files).toContain("requirements/base.txt");
    expect(closure.files).toContain("python/app/module.py");
    expect(closure.unresolvedImports.some(edge => edge.specifier.includes("sample-lib"))).toBe(true);
    expect(closure.unresolvedImports.some(edge => edge.specifier === "unpinned-python-dependency:sample-lib")).toBe(false);
    expect(closure.closureComplete).toBe(false);
  });

  it("resolves Python from-import members inside namespace packages", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python/app/api"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "from app.api import approvals\n");
    await writeFile(join(root, "python/app/api/approvals.py"), "approval_service = object()\n");
    await writeFile(join(root, "python/pyproject.toml"), '[project]\nname = "namespace-fixture"\nversion = "1.0.0"\nrequires-python = ">=3.12"\n');
    await writeFile(join(root, "python/uv.lock"), 'version = 1\nrevision = 3\nrequires-python = ">=3.12"\n');
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python/main.py"],
      dependencyArtifacts: ["python/pyproject.toml", "python/uv.lock"],
      profileId: "python-namespace-from-import",
      runtimeIdentity: { python: "3.12.12", packageManager: "uv@0.9.28" },
      moduleRoots: [{ prefix: "app", root: "python/app", language: "python" }],
    });

    expect(closure.files).toContain("python/app/api/approvals.py");
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(true);
  });

  it("uses the selected interpreter standard-library inventory for Python closure", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python"), { recursive: true });
    await writeFile(join(root, "python/main.py"), 'import asyncio\nimport zoneinfo\nimport importlib\nimport sample_lib\nimportlib.import_module("zoneinfo")\n');

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python/main.py"],
      dependencyArtifacts: [],
      profileId: "python-3.13-stdlib-inventory",
      runtimeIdentity: { python: "3.13.5", platform: "linux-x86_64" },
      requireCompletePythonStandardLibrary: true,
      pythonStandardLibraryModules: ["asyncio", "zoneinfo"],
    });

    expect(closure.pythonStandardLibraryModules).toEqual(["asyncio", "zoneinfo"]);
    expect(closure.externalImports).toContain("sample_lib");
    expect(closure.externalImports).not.toContain("asyncio");
    expect(closure.externalImports).not.toContain("zoneinfo");
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: "zoneinfo" }));
  });

  it("recursively closes explicitly declared source directories and rejects nested symlinks", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python/app/services/nested"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), "export const main = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "recursive-source-fixture", version: "1.0.0" }));
    await writeFile(join(root, "python/app/services/nested/worker.py"), "value = 42\n");
    await writeFile(join(root, "requirements.txt"), "# no third-party requirements in this fixture\n");
    const input = {
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json", "requirements.txt"],
      profileInputs: [{ path: "python/app/services", kind: "source-import" as const }],
      profileId: "recursive-profile-source-directory",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
    };
    const closure = await discoverSourceClosure(input);
    expect(closure.files).toContain("python/app/services/nested/worker.py");
    expect(closure.files).not.toContain("python/app/services");
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(true);

    await symlink(join(root, "python/app/services/nested/worker.py"), join(root, "python/app/services/nested/linked.py"));
    const withNestedSymlink = await discoverSourceClosure(input);
    expect(withNestedSymlink.closureComplete).toBe(false);
    expect(withNestedSymlink.unresolvedImports).toContainEqual(expect.objectContaining({
      from: "python/app/services/nested/linked.py",
      specifier: "<missing-or-symlink-file>",
    }));
  });

  it("fails closed when an exact Python profile omits its stdlib inventory", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "import asyncio\n");

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python/main.py"],
      dependencyArtifacts: [],
      profileId: "python-stdlib-required",
      runtimeIdentity: { python: "3.13.5" },
      requireCompletePythonStandardLibrary: true,
    });

    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports).toContainEqual({
      from: "<profile>",
      specifier: "<python-stdlib-inventory-required>",
    });
  });

  it("recognizes dependency manifests nested under a Python workspace root", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python-backend"), { recursive: true });
    await writeFile(join(root, "python-backend/app.py"), "import sys\n");
    await writeFile(join(root, "python-backend/pyproject.toml"), '[project]\nname = "nested-python"\nversion = "1.0.0"\nrequires-python = ">=3.12"\n');
    await writeFile(join(root, "python-backend/uv.lock"), `version = 1\nrevision = 3\nrequires-python = ">=3.12"\n`);
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python-backend/app.py"],
      dependencyArtifacts: ["python-backend/pyproject.toml", "python-backend/uv.lock"],
      profileId: "nested-python-workspace",
      runtimeIdentity: { python: "3.13.5", packageManager: "uv@0.9.28" },
    });

    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: "<python-dependency-manifest-not-in-profile>" }));
    expect(closure.closureComplete).toBe(true);
  });

  it("requires Git-tree attestation before sealing a canonical execution profile", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/profiled.ts"), "export const profileBound = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "profile-fixture", version: "1.0.0", dependencies: {} }));
    const executionProfile = fixtureExecutionProfile();
    const profileDigest = executionProfile.profileDigest;
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/profiled.ts"],
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml"],
      workspaceManifestPaths: ["package.json"],
      profileId: executionProfile.profileId,
      profileDigest,
      executionProfile,
      moduleRoots: [],
      runtimeIdentity: {
        node: executionProfile.runtime.node,
        packageManager: `pnpm@${executionProfile.runtime.pnpm}`,
        python: executionProfile.runtime.python,
        rustc: executionProfile.runtime.rustc,
        platform: `${executionProfile.runtime.platform}-${executionProfile.runtime.architecture}`,
        architecture: executionProfile.runtime.architecture,
      },
    });
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(true);
    await expect(assembleReadOnlySourceBundle({
      sourceRoot: root,
      destination: join(root, "..", "profile-bound-bundle"),
      closure,
      sourceRevision: "f".repeat(40),
      specDigest,
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml"],
      executionProfile,
    })).rejects.toThrow("SPEC224_BUNDLE_PROFILE_SOURCE_ATTESTATION_REQUIRED");
  });

  it("compares Python dependency selections canonically while retaining selected requirement edges", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/profiled.ts"), "export const ready = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "profile-fixture", version: "1.0.0", dependencies: {} }));
    await writeFile(join(root, "requirements.txt"), "z-lib>=1\na-lib>=1\n");
    const { profileDigest: _digest, ...base } = fixtureExecutionProfile();
    const executionProfile = createSpec224ExecutionProfile({
      ...base,
      sourceInputs: ["src/profiled.ts", "requirements.txt"],
      dependencyManifests: { runtime: ["package.json", "pnpm-lock.yaml", "requirements.txt"], testOnly: [] },
      pythonDependencySelections: { "requirements.txt": { runtime: ["z-lib", "a-lib"] } },
    });
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/profiled.ts"],
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml", "requirements.txt"],
      profileInputs: [{ path: "requirements.txt", kind: "runtime-config" }],
      workspaceManifestPaths: ["package.json"],
      profileId: executionProfile.profileId,
      profileDigest: executionProfile.profileDigest,
      executionProfile,
      runtimeIdentity: {
        node: executionProfile.runtime.node,
        packageManager: `pnpm@${executionProfile.runtime.pnpm}`,
        python: executionProfile.runtime.python,
        rustc: executionProfile.runtime.rustc,
        platform: `${executionProfile.runtime.platform}-${executionProfile.runtime.architecture}`,
        architecture: executionProfile.runtime.architecture,
      },
    });
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: "<execution-profile-python-requirement-selection-mismatch>" }));
    expect(closure.pythonDependencySelections?.["requirements.txt"]?.runtime).toEqual(["a-lib", "z-lib"]);
    expect(closure.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: expect.stringContaining("external-package-lock-entry-missing:a-lib") }));
    expect(closure.closureComplete).toBe(false);
  });

  it("fails closed when closure inputs do not match the verified profile", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "profile-fixture", version: "1.0.0", dependencies: {} }));
    const executionProfile = fixtureExecutionProfile();
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/dep.ts"],
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml"],
      workspaceManifestPaths: ["package.json"],
      profileId: executionProfile.profileId,
      profileDigest: executionProfile.profileDigest,
      executionProfile,
      moduleRoots: [],
      runtimeIdentity: {
        node: executionProfile.runtime.node,
        packageManager: `pnpm@${executionProfile.runtime.pnpm}`,
        python: executionProfile.runtime.python,
        rustc: executionProfile.runtime.rustc,
        platform: `${executionProfile.runtime.platform}-${executionProfile.runtime.architecture}`,
        architecture: executionProfile.runtime.architecture,
      },
    });
    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports).toContainEqual({
      from: "<profile>",
      specifier: "<execution-profile-entrypoints-mismatch>",
    });
    await expect(assembleReadOnlySourceBundle({
      sourceRoot: root,
      destination: join(root, "..", "mismatched-profile-bundle"),
      closure: { ...closure, closureComplete: true, unresolvedImports: [] },
      sourceRevision: "e".repeat(40),
      specDigest,
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml"],
      executionProfile,
    })).rejects.toThrow("SPEC224_BUNDLE_PROFILE_SOURCE_MISMATCH");
  });

  it("fails closed when a profile selector has no verified exact artifact binding", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/profiled.ts"), "export const profileBound = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "profile-fixture",
      version: "1.0.0",
      dependencies: { "fixture-external": "1.0.0" },
    }));
    await writeFile(join(root, "pnpm-lock.yaml"), [
      "lockfileVersion: '9.0'",
      "importers:",
      "  .:",
      "    dependencies:",
      "      fixture-external:",
      "        specifier: 1.0.0",
      "        version: 1.0.0",
      "packages:",
      "  fixture-external@1.0.0:",
      "    resolution:",
      "      integrity: sha512-YWJjZA==",
      "snapshots:",
      "  fixture-external@1.0.0: {}",
      "",
    ].join("\n"));
    const { profileDigest: _digest, ...baseProfile } = fixtureExecutionProfile();
    const executionProfile = createSpec224ExecutionProfile({
      ...baseProfile,
      selectedManifestDependencies: { "package.json": ["fixture-external"] },
    });
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: executionProfile.entrypoints.node,
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml"],
      workspaceManifestPaths: executionProfile.workspaceManifestPaths,
      profileId: executionProfile.profileId,
      profileDigest: executionProfile.profileDigest,
      executionProfile,
      moduleRoots: executionProfile.moduleRoots,
      runtimeIdentity: {
        node: executionProfile.runtime.node,
        packageManager: `pnpm@${executionProfile.runtime.pnpm}`,
        python: executionProfile.runtime.python,
        rustc: executionProfile.runtime.rustc,
        platform: `${executionProfile.runtime.platform}-${executionProfile.runtime.architecture}`,
        architecture: executionProfile.runtime.architecture,
      },
    });

    expect(closure.unresolvedImports).toContainEqual(expect.objectContaining({
      specifier: "UNVERIFIED_ARTIFACT:fixture-external@1.0.0",
    }));
    expect(closure.closureComplete).toBe(false);
  });

  it("accepts profile artifact selectors only after the exact locked bytes verify", async () => {
    const root = await sourceFixture();
    const bytes = Buffer.from("locked profile artifact");
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const source = "https://registry.npmjs.org/fixture-external/-/fixture-external-1.0.0.tgz";
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "src/profiled.ts"), "export const profileBound = true;\n");
    await writeFile(join(root, "artifacts/fixture-external.tgz"), bytes);
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "profile-fixture", version: "1.0.0", dependencies: { "fixture-external": "1.0.0" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), [
      "lockfileVersion: '9.0'",
      "importers:",
      "  .:",
      "    dependencies:",
      "      fixture-external:",
      "        specifier: 1.0.0",
      "        version: 1.0.0",
      "packages:",
      "  fixture-external@1.0.0:",
      "    resolution:",
      `      tarball: ${source}`,
      `      integrity: ${integrity}`,
      "snapshots:",
      "  fixture-external@1.0.0: {}",
      "",
    ].join("\n"));
    const { profileDigest: _digest, ...baseProfile } = fixtureExecutionProfile();
    const executionProfile = createSpec224ExecutionProfile({
      ...baseProfile,
      selectedManifestDependencies: { "package.json": ["fixture-external"] },
    });
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: executionProfile.entrypoints.node,
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml"],
      workspaceManifestPaths: executionProfile.workspaceManifestPaths,
      profileId: executionProfile.profileId,
      profileDigest: executionProfile.profileDigest,
      executionProfile,
      moduleRoots: executionProfile.moduleRoots,
      runtimeIdentity: {
        node: executionProfile.runtime.node,
        packageManager: `pnpm@${executionProfile.runtime.pnpm}`,
        python: executionProfile.runtime.python,
        rustc: executionProfile.runtime.rustc,
        platform: `${executionProfile.runtime.platform}-${executionProfile.runtime.architecture}`,
        architecture: executionProfile.runtime.architecture,
      },
      externalArtifacts: [{
        name: "fixture-external",
        version: "1.0.0",
        locator: "pnpm-lock.yaml#fixture-external@1.0.0",
        packageManager: "pnpm",
        lockfilePath: "pnpm-lock.yaml",
        path: "artifacts/fixture-external.tgz",
        source,
        kind: "npm-tarball",
        platform: "linux-x86_64",
      }],
    });

    expect(closure.externalPackageIdentities.find(item => item.name === "fixture-external")).toMatchObject({ locator: "pnpm-lock.yaml#fixture-external@1.0.0", packageManager: "pnpm", source, integrity: [integrity], lockedArtifacts: [{ source, integrity: [integrity], kind: "npm-tarball", sizeBytes: null }] });
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(true);
    expect(closure.externalPackageIdentities).toContainEqual(expect.objectContaining({
      locator: "pnpm-lock.yaml#fixture-external@1.0.0",
      artifactStatus: "VERIFIED_ARTIFACT",
      artifactSha256: createHash("sha256").update(bytes).digest("hex"),
      artifactIntegrity: [integrity],
    }));
  });

  it("fails closed for a supplied profile digest without its verified manifest", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/profiled.ts"), "export const profileBound = true;\n");
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/profiled.ts"],
      dependencyArtifacts: [],
      profileId: "untrusted-profile",
      profileDigest: "b".repeat(64),
      runtimeIdentity: { node: "v22.22.3", packageManager: "pnpm@10.4.1" },
    });

    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports).toContainEqual({
      from: "<profile>",
      specifier: "<verified-execution-profile-required>",
    });
  });

  it("treats __future__ imports as a Python built-in instead of an external package", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "from __future__ import annotations\nimport json\nvalue: str = \\\"ok\\\"\n");
    await writeFile(join(root, "requirements.txt"), "");

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python/main.py"],
      dependencyArtifacts: ["requirements.txt"],
      profileId: "python-future-builtin-test",
      runtimeIdentity: { python: "3.12", packageManager: "pip" },
    });

    expect(closure.externalImports).not.toContain("__future__");
    expect(closure.requiredExternalPackages).not.toContain("__future__");
    expect(closure.closureComplete, JSON.stringify(closure.unresolvedImports)).toBe(true);
  });

  it("records pyproject and uv lock package versions and integrity without claiming source completeness", async () => {
    const root = await sourceFixture();
    const digest = "a".repeat(64);
    await mkdir(join(root, "python"), { recursive: true });
    await writeFile(join(root, "python/main.py"), 'import sample_lib\nfrom jose import jwt\nimport importlib\nimportlib.import_module("jose")\n');
    await writeFile(join(root, "pyproject.toml"), '[project]\nname = "fixture"\ndependencies = [\n  "sample-lib==1.2.3",\n  "python-jose==3.3.0",\n]\n');
    await writeFile(join(root, "uv.lock"), `version = 1\n\n[[package]]\nname = "sample-lib"\nversion = "1.2.3"\nsource = { registry = "https://pypi.org/simple" }\nsdist = { url = "https://example.invalid/sample-lib-1.2.3.tar.gz", hash = "sha256:${digest}" }\n\n[[package]]\nname = "python-jose"\nversion = "3.3.0"\nsource = { registry = "https://pypi.org/simple" }\nsdist = { url = "https://example.invalid/python_jose-3.3.0.tar.gz", hash = "sha256:${"b".repeat(64)}" }\n`);

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python/main.py"],
      dependencyArtifacts: ["pyproject.toml", "uv.lock"],
      profileId: "python-uv-test",
      runtimeIdentity: { python: "3.12", packageManager: "uv@0.8.0" },
    });

    expect(closure.externalPackageIdentities).toContainEqual(
      expect.objectContaining({
        name: "sample-lib",
        version: "1.2.3",
        packageManager: "uv",
        lockfilePath: "uv.lock",
        integrity: [`sha256:${digest}`],
      })
    );
    expect(closure.unresolvedImports).toContainEqual(
      expect.objectContaining({
        specifier: "UNVERIFIED_ARTIFACT:sample-lib@1.2.3",
      })
    );
    expect(closure.unresolvedImports).not.toContainEqual(
      expect.objectContaining({ specifier: "external-package-lock-entry-missing:jose:python/main.py" })
    );
    expect(closure.requiredExternalPackages.some(locator => locator.includes("python-jose@3.3.0"))).toBe(true);
    expect(closure.closureComplete).toBe(false);
    expect(closure.externalImports).toContain("sample_lib");
  });

  it("records npm lock integrity for external packages and keeps external content outside closure", async () => {
    const root = await sourceFixture();
    const integrity = "sha512-YWJjZA==";
    await writeFile(join(root, "src/main.ts"), 'import samplePkg from "sample-pkg";\nexport default samplePkg;\n');
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "fixture",
        dependencies: { "sample-pkg": "1.0.0" },
      })
    );
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture", dependencies: { "sample-pkg": "1.0.0" } },
          "node_modules/sample-pkg": {
            version: "1.0.0",
            resolved: "https://registry.npmjs.org/sample-pkg/-/sample-pkg-1.0.0.tgz",
            integrity,
            dependencies: { "transitive-pkg": "^2.0.0" },
          },
          "node_modules/transitive-pkg": {
            version: "2.1.0",
            resolved: "https://registry.npmjs.org/transitive-pkg/-/transitive-pkg-2.1.0.tgz",
            integrity: "sha512-cHJvZw==",
          },
        },
      })
    );
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["package-lock.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "npm-lock-test",
      runtimeIdentity: { node: process.version, packageManager: "npm@10.9.8" },
    });
    expect(closure.externalPackageIdentities).toContainEqual(
      expect.objectContaining({
        name: "sample-pkg",
        version: "1.0.0",
        packageManager: "npm",
        lockfilePath: "package-lock.json",
        integrity: [integrity],
      })
    );
    expect(closure.externalPackageIdentities).toContainEqual(expect.objectContaining({ name: "transitive-pkg", version: "2.1.0" }));
    expect(closure.externalPackageIdentities.find(item => item.name === "sample-pkg")?.dependencies).toEqual(["transitive-pkg"]);
    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports).toContainEqual(
      expect.objectContaining({
        specifier: "UNVERIFIED_ARTIFACT:sample-pkg@1.0.0",
      })
    );
  });

  it("derives pnpm v9 tarball origin from the digest-bound trusted registry when the lock omits a URL", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/profiled.ts"), 'import value from "selected-runtime"; export { value };\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "selected-runtime": "1.0.0" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      selected-runtime:\n        specifier: 1.0.0\n        version: 1.0.0\npackages:\n  selected-runtime@1.0.0:\n    resolution:\n      integrity: sha512-YWJjZA==\nsnapshots:\n  selected-runtime@1.0.0: {}\n`);
    const { profileDigest: _profileDigest, ...profileBase } = fixtureExecutionProfile();
    const profile = createSpec224ExecutionProfile({
      ...profileBase,
      selectedManifestDependencies: { "package.json": ["selected-runtime"] },
      externalArtifacts: ["pnpm-lock.yaml:resolve-required-node-artifacts"],
    });
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/profiled.ts"],
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: profile.profileId,
      profileDigest: profile.profileDigest,
      executionProfile: profile,
      runtimeIdentity: { node: profile.runtime.node, packageManager: `pnpm@${profile.runtime.pnpm}`, platform: "linux-x64" },
      selectedManifestDependencies: profile.selectedManifestDependencies,
    });

    expect(closure.externalPackageIdentities).toContainEqual(expect.objectContaining({
      name: "selected-runtime",
      lockedArtifacts: [expect.objectContaining({
        source: "https://registry.npmjs.org/selected-runtime/-/selected-runtime-1.0.0.tgz",
        integrity: ["sha512-YWJjZA=="],
      })],
    }));
    expect(closure.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "UNVERIFIED_ARTIFACT:selected-runtime@1.0.0" }));
    expect(closure.closureComplete).toBe(false);
  });

  it("resolves runtime workspace exports without requiring type-only outputs and marks generated runtime files", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/profiled.ts"), 'import { value } from "@fixture/runtime"; export { value };\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", workspaces: ["packages/*"] }));
    await mkdir(join(root, "packages/runtime/src"), { recursive: true });
    await mkdir(join(root, "packages/runtime/dist"), { recursive: true });
    await writeFile(join(root, "packages/runtime/package.json"), JSON.stringify({
      name: "@fixture/runtime",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
    }));
    await writeFile(join(root, "packages/runtime/src/index.ts"), "export const value = 42;\n");
    await writeFile(join(root, "packages/runtime/dist/index.js"), "export const value = 42;\n");
    const { profileDigest: _profileDigest, ...profileBase } = fixtureExecutionProfile();
    const profile = createSpec224ExecutionProfile({
      ...profileBase,
      workspaceManifestPaths: ["package.json", "packages/runtime/package.json"],
      workspaces: [".", "packages/runtime"],
      sourceInputs: ["src/profiled.ts", "packages/runtime/src/index.ts"],
      selectedManifestDependencies: { "package.json": [], "packages/runtime/package.json": [] },
      selectedManifestScripts: { "package.json": [], "packages/runtime/package.json": [] },
      generatedArtifacts: [{
        path: "packages/runtime/dist/index.js",
        command: "pnpm exec esbuild packages/runtime/src/index.ts --bundle --outfile=packages/runtime/dist/index.js",
        inputs: ["packages/runtime/src/index.ts"],
        sha256: createHash("sha256").update("export const value = 42;\n").digest("hex"),
      }],
    });
    const closureInput = {
      sourceRoot: root,
      entryPaths: ["src/profiled.ts"],
      dependencyArtifacts: ["package.json", "pnpm-lock.yaml"],
      profileInputs: [{ path: "packages/runtime/src/index.ts", kind: "source-import" }],
      workspaceManifestPaths: profile.workspaceManifestPaths,
      profileId: profile.profileId,
      profileDigest: profile.profileDigest,
      executionProfile: profile,
      runtimeIdentity: {
        node: profile.runtime.node,
        packageManager: `pnpm@${profile.runtime.pnpm}`,
        python: profile.runtime.python,
        rustc: profile.runtime.rustc,
        platform: `${profile.runtime.platform}-${profile.runtime.architecture}`,
        architecture: profile.runtime.architecture,
      },
      selectedManifestDependencies: profile.selectedManifestDependencies,
      selectedManifestScripts: profile.selectedManifestScripts,
    };
    const closure = await discoverSourceClosure(closureInput);

    expect(closure.files).toContain("packages/runtime/dist/index.js");
    expect(closure.provenance["packages/runtime/dist/index.js"]).toContain("generated-artifact");
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: "@fixture/runtime<unresolved-export:dist/index.d.ts>" }));
    expect(closure.closureComplete).toBe(true);

    await writeFile(join(root, "packages/runtime/dist/index.js"), "export const value = 43;\n");
    const tamperedClosure = await discoverSourceClosure(closureInput);
    expect(tamperedClosure.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<generated-artifact-digest-mismatch>" }));
    expect(tamperedClosure.closureComplete).toBe(false);
  });

  it("resolves statically known template-literal dynamic imports and wildcard package exports", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "packages/shared/src/features"), {
      recursive: true,
    });
    await writeFile(join(root, "src/main.ts"), 'export const load = () => import(`./lazy`);\nimport { feature } from "@fixture/shared/features/one";\nexport { feature };\n');
    await writeFile(join(root, "src/lazy.ts"), "export const lazy = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-app", version: "1.0.0" }));
    await writeFile(join(root, "packages/shared/package.json"), JSON.stringify({ name: "@fixture/shared", exports: { "./*": "./src/*" } }));
    await writeFile(join(root, "packages/shared/src/features/one.ts"), "export const feature = true;\n");

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      workspaceManifestPaths: ["packages/shared/package.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "wildcard-export-test",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" },
    });

    expect(closure.files).toContain("src/lazy.ts");
    expect(closure.files).toContain("packages/shared/src/features/one.ts");
    expect(closure.dependencyEdges.some(edge => edge.kind === "dynamic-import" && edge.status === "resolved-local")).toBe(true);
    expect(closure.dependencyEdges.some(edge => edge.kind === "static-import" && edge.status === "resolved-local")).toBe(true);
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(true);
  });

  it("ignores dynamic-import and eval examples in comments but keeps executable dynamic imports fail-closed", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "comment-fixture", packageManager: "pnpm@10.4.1" }));
    await writeFile(
      join(root, "src/main.ts"),
      [
        "/** Example only: await import(moduleName); new Function('return import(name)'); */",
        'export const load = () => import("./dep");',
      ].join("\n"),
    );
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json"],
      profileId: "comment-aware-dynamic-import-test",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: `${process.platform}-${process.arch}` },
      selectedManifestDependencies: { "package.json": [] },
      selectedManifestScripts: { "package.json": [] },
    });

    expect(closure.files).toContain("src/dep.ts");
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(true);

    await writeFile(join(root, "src/main.ts"), 'export const count = client.eval("return redis.call()", 1);\n');
    const redisScript = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json"],
      profileId: "redis-eval-is-not-code-eval-test",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: `${process.platform}-${process.arch}` },
      selectedManifestDependencies: { "package.json": [] },
      selectedManifestScripts: { "package.json": [] },
    });
    expect(redisScript.unresolvedImports).toEqual([]);

    await writeFile(join(root, "src/main.ts"), "export const load = (moduleName: string) => import(moduleName);\n");
    const unresolved = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json"],
      profileId: "executable-dynamic-import-test",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: `${process.platform}-${process.arch}` },
      selectedManifestDependencies: { "package.json": [] },
      selectedManifestScripts: { "package.json": [] },
    });
    expect(unresolved.unresolvedImports).toContainEqual({
      from: "src/main.ts",
      specifier: "<dynamic-javascript-import>",
    });
    expect(unresolved.closureComplete).toBe(false);

    await writeFile(join(root, "src/main.ts"), "eval(source);\n");
    const evaluated = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json"],
      profileId: "direct-eval-is-unresolved-test",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: `${process.platform}-${process.arch}` },
      selectedManifestDependencies: { "package.json": [] },
      selectedManifestScripts: { "package.json": [] },
    });
    expect(evaluated.unresolvedImports).toContainEqual({
      from: "src/main.ts",
      specifier: "<dynamic-code-evaluation>",
    });
    expect(evaluated.closureComplete).toBe(false);
  });

  it("verifies a literal dynamic package import against its exact locked artifact", async () => {
    const root = await sourceFixture();
    const artifact = Buffer.from("hyperframes producer fixture artifact");
    const integrity = `sha512-${createHash("sha512").update(artifact).digest("base64")}`;
    const registryUrl = "https://registry.npmjs.org/@hyperframes/producer/-/producer-0.7.109.tgz";
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), 'export const load = () => import("@hyperframes/producer");\n');
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "spec224-dynamic-package-profile",
      dependencies: { "@hyperframes/producer": "0.7.109" },
    }));
    await writeFile(join(root, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { "@hyperframes/producer": "0.7.109" } },
        "node_modules/@hyperframes/producer": {
          version: "0.7.109",
          resolved: registryUrl,
          integrity,
        },
      },
    }));
    await writeFile(join(root, "artifacts/producer.tgz"), artifact);

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["package-lock.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "spec224-hyperframes-producer",
      runtimeIdentity: { node: process.version, packageManager: "npm@10.9.8", platform: "linux-x64" },
      externalArtifacts: [{
        name: "@hyperframes/producer",
        version: "0.7.109",
        locator: "package-lock.json#node_modules/@hyperframes/producer",
        packageManager: "npm",
        lockfilePath: "package-lock.json",
        path: "artifacts/producer.tgz",
        source: registryUrl,
        kind: "npm-tarball",
        platform: "linux-x64",
      }],
    });

    expect(closure.closureComplete).toBe(true);
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.requiredExternalPackages).toContain(
      "package-lock.json#node_modules/@hyperframes/producer",
    );
    expect(closure.dependencyEdges).toContainEqual(expect.objectContaining({
      from: "src/main.ts",
      specifier: "@hyperframes/producer",
      kind: "dynamic-import",
      status: "verified-external-artifact",
    }));
    expect(closure.externalPackageIdentities).toContainEqual(expect.objectContaining({
      name: "@hyperframes/producer",
      version: "0.7.109",
      artifactStatus: "VERIFIED_ARTIFACT",
    }));
  });

  it("does not require an install lifecycle hook omitted by the exact execution profile", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), "export const value = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "profile-hook-fixture",
      scripts: { preinstall: "node scripts/check-node-version.mjs" },
    }));
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json"],
      profileId: "no-install-hooks-profile",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: `${process.platform}-${process.arch}` },
      selectedManifestDependencies: { "package.json": [] },
      selectedManifestScripts: { "package.json": [] },
    });

    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.dependencyEdges).toContainEqual(expect.objectContaining({
      from: "package.json",
      specifier: "preinstall",
      kind: "profile-input",
      status: "profile-dependency-excluded",
    }));
    expect(closure.closureComplete).toBe(true);
  });

  it("follows TypeScript import-equals dependencies and rejects malformed source", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), 'import dependency = require("./dep");\nexport { dependency };\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "import-equals-fixture", packageManager: "pnpm@10.4.1" }));
    const baseInput = {
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json"],
      profileId: "import-equals-and-parse-errors-test",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: `${process.platform}-${process.arch}` },
      selectedManifestDependencies: { "package.json": [] },
      selectedManifestScripts: { "package.json": [] },
    };
    const importEquals = await discoverSourceClosure(baseInput);
    expect(importEquals.files).toContain("src/dep.ts");
    expect(importEquals.closureComplete).toBe(true);

    await writeFile(join(root, "src/main.ts"), 'import { dependency from "./dep";\n');
    const malformed = await discoverSourceClosure(baseInput);
    expect(malformed.unresolvedImports).toContainEqual({
      from: "src/main.ts",
      specifier: "<javascript-parse-error>",
    });
    expect(malformed.closureComplete).toBe(false);
  });

  it("fails closed on computed import-equals and resolves module.require calls", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "computed-require-fixture", packageManager: "pnpm@10.4.1" }));
    const input = {
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json"],
      profileId: "computed-require-closure-test",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: `${process.platform}-${process.arch}` },
      selectedManifestDependencies: { "package.json": [] },
      selectedManifestScripts: { "package.json": [] },
    };

    await writeFile(join(root, "src/main.ts"), 'import dependency = require("./dep");\nmodule.require("./dep");\nexport { dependency };\n');
    const literalModuleRequire = await discoverSourceClosure(input);
    expect(literalModuleRequire.files).toContain("src/dep.ts");
    expect(literalModuleRequire.unresolvedImports).toEqual([]);

    await writeFile(join(root, "src/main.ts"), 'declare const moduleName: string;\nimport dependency = require(moduleName);\nexport { dependency };\n');
    const computedImportEquals = await discoverSourceClosure(input);
    expect(computedImportEquals.unresolvedImports).toContainEqual({
      from: "src/main.ts",
      specifier: "<dynamic-javascript-import>",
    });
    expect(computedImportEquals.closureComplete).toBe(false);

    await writeFile(join(root, "src/main.ts"), 'module.require(moduleName);\n');
    const computedModuleRequire = await discoverSourceClosure(input);
    expect(computedModuleRequire.unresolvedImports).toContainEqual({
      from: "src/main.ts",
      specifier: "<dynamic-javascript-import>",
    });
    expect(computedModuleRequire.closureComplete).toBe(false);
  });

  it("fails closed when a selected package script would auto-run an unapproved pre/post hook", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), "export const value = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "selected-hook-fixture",
      scripts: {
        pretest: "node scripts/pretest.mjs",
        test: "vitest run",
        posttest: "node scripts/posttest.mjs",
      },
    }));
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml", "package.json"],
      profileId: "selected-test-hook-not-authorized",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: `${process.platform}-${process.arch}` },
      selectedManifestDependencies: { "package.json": [] },
      selectedManifestScripts: { "package.json": ["test"] },
    });

    expect(closure.unresolvedImports).toContainEqual({
      from: "package.json",
      specifier: "<lifecycle-script-not-authorized:pretest>",
    });
    expect(closure.unresolvedImports).toContainEqual({
      from: "package.json",
      specifier: "<lifecycle-script-not-authorized:posttest>",
    });
    expect(closure.closureComplete).toBe(false);
  });

  it("rejects hook commands whose executable is not provided by the package manifest", async () => {
    const root = await sourceFixture();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "hook-fixture",
        "simple-git-hooks": { "pre-commit": "eslint ." },
        scripts: { "check:custom": "missing-tool verify" },
        devDependencies: { vitest: "1.0.0" },
      })
    );
    await mkdir(join(root, ".hooks"), { recursive: true });
    await writeFile(join(root, ".hooks/pre-commit"), "#!/bin/sh\necho ok\n");
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [
        { path: "package.json", kind: "runtime-config" },
        { path: ".hooks/pre-commit", kind: "hook" },
      ],
      profileId: "hook-closure-test",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" },
    });
    expect(closure.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<hook-command-dependency:eslint>" }));
    expect(closure.unresolvedImports).toContainEqual(
      expect.objectContaining({
        specifier: "<script-command-dependency:check:custom:missing-tool>",
      })
    );
    expect(closure.closureComplete).toBe(false);
  });

  it("verifies npm tarball bytes against lock integrity and seals only verified profile artifacts", async () => {
    const root = await sourceFixture();
    const mainBytes = Buffer.from("locked npm package archive");
    const transitiveBytes = Buffer.from("locked transitive archive");
    const sri = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts/sample-pkg.tgz"), mainBytes);
    await writeFile(join(root, "artifacts/transitive-pkg.tgz"), transitiveBytes);
    await writeFile(join(root, "src/main.ts"), 'import value from "sample-pkg"; export default value;\n');
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "fixture",
        dependencies: { "sample-pkg": "1.0.0" },
      })
    );
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { dependencies: { "sample-pkg": "1.0.0" } },
          "node_modules/sample-pkg": {
            version: "1.0.0",
            resolved: "https://registry.npmjs.org/sample-pkg/-/sample-pkg-1.0.0.tgz",
            integrity: sri(mainBytes),
            dependencies: { "transitive-pkg": "2.1.0" },
          },
          "node_modules/transitive-pkg": {
            version: "2.1.0",
            resolved: "https://registry.npmjs.org/transitive-pkg/-/transitive-pkg-2.1.0.tgz",
            integrity: sri(transitiveBytes),
          },
        },
      })
    );

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["package-lock.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "npm-linux-test",
      runtimeIdentity: {
        node: process.version,
        packageManager: "npm@10.9.8",
        platform: "linux-x64",
      },
      externalArtifacts: [
        {
          name: "sample-pkg",
          version: "1.0.0",
          locator: "package-lock.json#node_modules/sample-pkg",
          packageManager: "npm",
          lockfilePath: "package-lock.json",
          path: "artifacts/sample-pkg.tgz",
          source: "https://registry.npmjs.org/sample-pkg/-/sample-pkg-1.0.0.tgz",
          kind: "npm-tarball",
          platform: "linux-x64",
        },
        {
          name: "transitive-pkg",
          version: "2.1.0",
          locator: "package-lock.json#node_modules/transitive-pkg",
          packageManager: "npm",
          lockfilePath: "package-lock.json",
          path: "artifacts/transitive-pkg.tgz",
          source: "https://registry.npmjs.org/transitive-pkg/-/transitive-pkg-2.1.0.tgz",
          kind: "npm-tarball",
          platform: "linux-x64",
        },
      ],
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.files).toContain("artifacts/sample-pkg.tgz");
    expect(closure.externalPackageIdentities.find(item => item.name === "sample-pkg")).toMatchObject({
      artifactStatus: "VERIFIED_ARTIFACT",
      artifactSha256: createHash("sha256").update(mainBytes).digest("hex"),
      artifactPlatform: "linux-x64",
    });
    const bundle = await assembleReadOnlySourceBundle({
      sourceRoot: root,
      destination: join(root, "..", "npm-artifact-bundle"),
      closure,
      sourceRevision: "f".repeat(40),
      specDigest,
      dependencyArtifacts: ["package-lock.json"],
    });
    expect(bundle.files.map(file => file.path)).toContain("artifacts/sample-pkg.tgz");
    expect(await verifyReadOnlySourceBundle(join(root, "..", "npm-artifact-bundle"))).toMatchObject({ valid: true });

    const forgedClosure = structuredClone(closure);
    const forgedIdentity = forgedClosure.externalPackageIdentities.find(item => item.name === "sample-pkg")!;
    const forgedBytes = Buffer.from("attacker-selected archive");
    forgedIdentity.artifactSha256 = createHash("sha256").update(forgedBytes).digest("hex");
    forgedIdentity.artifactIntegrity = [`sha512-${createHash("sha512").update(forgedBytes).digest("base64")}`];
    await expect(assembleReadOnlySourceBundle({ sourceRoot: root, destination: join(root, "..", "forged-artifact-bundle"), closure: forgedClosure, sourceRevision: "f".repeat(40), specDigest, dependencyArtifacts: ["package-lock.json"] })).rejects.toThrow("SPEC224_BUNDLE_REQUIRED_ARTIFACT_DIGEST_MISMATCH");

    await writeFile(join(root, "artifacts/sample-pkg.tgz"), Buffer.from("tampered bytes"));
    const tampered = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["package-lock.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "npm-linux-tamper-test",
      runtimeIdentity: {
        node: process.version,
        packageManager: "npm@10.9.8",
        platform: "linux-x64",
      },
      externalArtifacts: [
        {
          name: "sample-pkg",
          version: "1.0.0",
          locator: "package-lock.json#node_modules/sample-pkg",
          packageManager: "npm",
          lockfilePath: "package-lock.json",
          path: "artifacts/sample-pkg.tgz",
          source: "https://registry.npmjs.org/sample-pkg/-/sample-pkg-1.0.0.tgz",
          kind: "npm-tarball",
          platform: "linux-x64",
        },
        {
          name: "transitive-pkg",
          version: "2.1.0",
          locator: "package-lock.json#node_modules/transitive-pkg",
          packageManager: "npm",
          lockfilePath: "package-lock.json",
          path: "artifacts/transitive-pkg.tgz",
          source: "https://registry.npmjs.org/transitive-pkg/-/transitive-pkg-2.1.0.tgz",
          kind: "npm-tarball",
          platform: "linux-x64",
        },
      ],
    });
    expect(tampered.closureComplete).toBe(false);
    expect(tampered.unresolvedImports).toContainEqual(
      expect.objectContaining({
        specifier: "UNVERIFIED_ARTIFACT:sample-pkg@1.0.0",
      })
    );
    await expect(
      assembleReadOnlySourceBundle({
        sourceRoot: root,
        destination: join(root, "..", "tampered-artifact-bundle"),
        closure: tampered,
        sourceRevision: "f".repeat(40),
        specDigest,
        dependencyArtifacts: ["package-lock.json"],
      })
    ).rejects.toThrow("SPEC224_BUNDLE_CLOSURE_INCOMPLETE");
  });

  it("verifies a selected uv wheel by exact lock URL, SHA-256 and platform profile", async () => {
    const root = await sourceFixture();
    const wheel = Buffer.from("locked python wheel bytes");
    const digest = createHash("sha256").update(wheel).digest("hex");
    const url = "https://files.pythonhosted.org/packages/sample_lib-1.2.3-cp312-cp312-manylinux_x86_64.whl";
    await mkdir(join(root, "python"), { recursive: true });
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "import sample_lib\n");
    await writeFile(join(root, "pyproject.toml"), '[project]\nname = "fixture"\ndependencies = ["sample-lib==1.2.3"]\n');
    const lockSource = `version = 1\n[[package]]\nname = "sample-lib"\nversion = "1.2.3"\nsource = { registry = "https://pypi.org/simple" }\nwheels = [\n  { url = "${url}", hash = "sha256:${digest}" },\n]\n`;
    const packageBlock = lockSource.split(/^\[\[package\]\]\s*$/m)[1].trim();
    const locator = `uv.lock#uv:sample-lib@1.2.3|source=registry = "https://pypi.org/simple"|node=${createHash("sha256").update(packageBlock).digest("hex")}`;
    await writeFile(join(root, "uv.lock"), lockSource);
    await writeFile(join(root, "artifacts/sample_lib-1.2.3-cp312-cp312-manylinux_x86_64.whl"), wheel);

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python/main.py"],
      dependencyArtifacts: ["pyproject.toml", "uv.lock"],
      profileId: "python-linux-cp312",
      runtimeIdentity: {
        python: "3.12",
        packageManager: "uv@0.8.0",
        platform: "linux-x86_64-cp312",
        pythonCompatibility: { compatibleWheelTags: ["cp312-cp312-manylinux_x86_64"], markerEnvironment: { python_version: "3.12", python_full_version: "3.12.8", sys_platform: "linux", platform_machine: "x86_64", os_name: "posix" } },
      },
      externalArtifacts: [
        {
          name: "sample-lib",
          version: "1.2.3",
          locator,
          packageManager: "uv",
          lockfilePath: "uv.lock",
          path: "artifacts/sample_lib-1.2.3-cp312-cp312-manylinux_x86_64.whl",
          source: url,
          kind: "python-wheel",
          platform: "linux-x86_64-cp312",
        },
      ],
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.externalPackageIdentities[0]).toMatchObject({
      artifactStatus: "VERIFIED_ARTIFACT",
      artifactSha256: digest,
      artifactPlatform: "linux-x86_64-cp312",
    });
    expect(closure.unresolvedImports).toEqual([]);
  });

  it("records lifecycle scripts as unverified and never executes them", async () => {
    const root = await sourceFixture();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "fixture",
        scripts: { postinstall: "node scripts/postinstall.js" },
      })
    );
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "no-lifecycle-execution",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" },
    });
    expect(closure.unresolvedImports).toContainEqual(
      expect.objectContaining({
        specifier: "<lifecycle-script-not-authorized:postinstall>",
      })
    );
    expect(closure.closureComplete).toBe(false);
  });

  it("excludes optional npm artifacts unless the execution profile selects them", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), 'import { value } from "./dep"; export { value };\n');
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "fixture",
        optionalDependencies: { "optional-pkg": "1.0.0" },
      })
    );
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { optionalDependencies: { "optional-pkg": "1.0.0" } },
          "node_modules/optional-pkg": {
            version: "1.0.0",
            resolved: "https://registry.npmjs.org/optional-pkg/-/optional-pkg-1.0.0.tgz",
            integrity: "sha512-YWJjZA==",
          },
        },
      })
    );
    const baseInput = {
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["package-lock.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" as const }],
      profileId: "optional-profile",
      runtimeIdentity: {
        node: process.version,
        packageManager: "npm@10.9.8",
        platform: "linux-x64",
      },
    };
    const excluded = await discoverSourceClosure(baseInput);
    expect(excluded.closureComplete).toBe(true);
    expect(excluded.requiredExternalPackages).toEqual([]);
    expect(excluded.externalPackageIdentities[0]).toMatchObject({
      name: "optional-pkg",
      optionalDependencies: [],
      artifactStatus: "NOT_REQUIRED",
    });
    const selected = await discoverSourceClosure({
      ...baseInput,
      selectedOptionalDependencies: ["optional-pkg"],
    });
    expect(selected.closureComplete).toBe(false);
    expect(selected.unresolvedImports).toContainEqual(
      expect.objectContaining({
        specifier: "UNVERIFIED_ARTIFACT:optional-pkg@1.0.0",
      })
    );
  });

  it("binds exact manifest dependency and script selections into a scoped profile bundle", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), 'import { value } from "selected-runtime"; export { value };\n');
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts/test-profile.mjs"), "console.log('focused profile');\n");
    const artifact = Buffer.from("selected-runtime-tarball");
    const integrity = `sha512-${createHash("sha512").update(artifact).digest("base64")}`;
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts/selected-runtime.tgz"), artifact);
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "fixture",
      dependencies: { "selected-runtime": "1.0.0", "unused-runtime": "2.0.0" },
      scripts: { "test:profile": "node scripts/test-profile.mjs", "build:unselected": "vite build" },
    }));
    await writeFile(join(root, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { "selected-runtime": "1.0.0", "unused-runtime": "2.0.0" } },
        "node_modules/selected-runtime": { version: "1.0.0", resolved: "https://registry.npmjs.org/selected-runtime/-/selected-runtime-1.0.0.tgz", integrity },
        "node_modules/unused-runtime": { version: "2.0.0", resolved: "https://registry.npmjs.org/unused-runtime/-/unused-runtime-2.0.0.tgz", integrity: `sha512-${createHash("sha512").update("unused").digest("base64")}` },
      },
    }));
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["package-lock.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "focused-runtime-profile",
      runtimeIdentity: { node: process.version, packageManager: "npm@10.9.8", platform: "linux-x64" },
      selectedManifestDependencies: { "package.json": ["selected-runtime"] },
      selectedManifestScripts: { "package.json": ["test:profile"] },
      externalArtifacts: [{ name: "selected-runtime", version: "1.0.0", locator: "package-lock.json#node_modules/selected-runtime", packageManager: "npm", lockfilePath: "package-lock.json", path: "artifacts/selected-runtime.tgz", source: "https://registry.npmjs.org/selected-runtime/-/selected-runtime-1.0.0.tgz", kind: "npm-tarball", platform: "linux-x64" }],
    });

    expect(closure.closureComplete).toBe(true);
    expect(closure.requiredExternalPackages).toEqual(["package-lock.json#node_modules/selected-runtime"]);
    expect(closure.files).toContain("scripts/test-profile.mjs");
    expect(closure.files).not.toContain("scripts/build-unselected.mjs");
    expect(closure.selectedManifestDependencies).toEqual({ "package.json": ["selected-runtime"] });
    expect(closure.selectedManifestScripts).toEqual({ "package.json": ["test:profile"] });
    expect(closure.dependencyEdges).toContainEqual(expect.objectContaining({ specifier: "unused-runtime@2.0.0", status: "profile-dependency-excluded" }));

    const bundle = await assembleReadOnlySourceBundle({
      sourceRoot: root,
      destination: join(root, "..", "scoped-profile-bundle"),
      closure,
      sourceRevision: "f".repeat(40),
      specDigest,
      dependencyArtifacts: ["package-lock.json"],
    });
    expect(bundle.selectedManifestDependencies).toEqual({ "package.json": ["selected-runtime"] });
    expect(bundle.selectedManifestScripts).toEqual({ "package.json": ["test:profile"] });
    expect(await verifyReadOnlySourceBundle(join(root, "..", "scoped-profile-bundle"))).toMatchObject({ valid: true, integrityOnly: true });

    const invalidSelection = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["package-lock.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "focused-runtime-profile-invalid-selection",
      runtimeIdentity: { node: process.version, packageManager: "npm@10.9.8", platform: "linux-x64" },
      selectedManifestDependencies: { "package.json": ["not-declared"] },
      selectedManifestScripts: { "package.json": ["unknown-script"] },
    });
    expect(invalidSelection.closureComplete).toBe(false);
    expect(invalidSelection.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<selected-script-not-declared:unknown-script>" }));
    expect(invalidSelection.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<selected-dependency-not-declared:not-declared>" }));
    expect(invalidSelection.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "UNVERIFIED_ARTIFACT:selected-runtime@1.0.0" }));

    const collidingManifestPaths = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["package-lock.json"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "focused-runtime-profile-colliding-paths",
      runtimeIdentity: { node: process.version, packageManager: "npm@10.9.8", platform: "linux-x64" },
      selectedManifestDependencies: { "package.json": [], "./package.json": ["selected-runtime"] },
    });
    expect(collidingManifestPaths.closureComplete).toBe(false);
    expect(collidingManifestPaths.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<duplicate-dependency-selection-path>" }));
  });

  it("fails closed when a Rust profile has no verified Cargo dependency graph", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.rs"), "fn call_external() { serde::serialize(); }\n");
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\n');
    await writeFile(join(root, "Cargo.lock"), 'version = 4\n[[package]]\nname = "serde"\nversion = "1.0.0"\n');
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-cargo-profile",
      runtimeIdentity: { packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
    });
    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "cargo-import-not-declared:serde" }));

    await writeFile(join(root, "src/main.rs"), 'const DOCUMENTATION: &str = r#"\nmod serde {}\n"#;\nfn call_external() { serde::serialize(); }\n');
    const rawStringCannotDeclareModule = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-raw-string-module-spoof-profile",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
    });
    expect(rawStringCannotDeclareModule.closureComplete).toBe(false);
    expect(rawStringCannotDeclareModule.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "cargo-import-not-declared:serde" }));
  });

  it("fails closed when nested inline Rust module paths cannot be proven", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.rs"), "mod parent { mod child; }\n");
    await writeFile(join(root, "src/child.rs"), "pub fn wrong() {}\n");
    await mkdir(join(root, "src/parent"), { recursive: true });
    await writeFile(join(root, "src/parent/child.rs"), "pub fn expected() {}\n");
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\n');
    await writeFile(join(root, "Cargo.lock"), "version = 4\n");
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-nested-module-profile",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
    });
    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<nested-rust-module-path-unresolved>" }));

    await writeFile(join(root, "src/main.rs"), 'mod support;\nmod tests { const S: &str = r#"} mod fake_child; {"#; }\n');
    await writeFile(join(root, "src/support.rs"), "pub fn supported() {}\n");
    const unrelatedInlineModule = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-inline-test-module-profile",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
    });
    expect(unrelatedInlineModule.closureComplete).toBe(true);
    expect(unrelatedInlineModule.unresolvedImports).toEqual([]);
  });

  it("resolves out-of-line Rust modules relative to file-module directories", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.rs"), "mod parent;\n");
    await writeFile(join(root, "src/parent.rs"), "mod child;\n");
    await mkdir(join(root, "src/parent"), { recursive: true });
    await writeFile(join(root, "src/parent/child.rs"), "pub fn expected() {}\n");
    await writeFile(join(root, "src/child.rs"), "pub fn decoy() {}\n");
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\n');
    await writeFile(join(root, "Cargo.lock"), "version = 4\n");
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-file-module-relative-profile",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.files).toContain("src/parent/child.rs");
    expect(closure.files).not.toContain("src/child.rs");

    await writeFile(join(root, "src/main.rs"), "#[cfg(unix)] mod parent;\n");
    const cfgModule = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-cfg-module-unresolved-profile",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
    });
    expect(cfgModule.closureComplete).toBe(false);
    expect(cfgModule.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<rust-cfg-module-selection-unresolved>" }));
  });

  it("resolves raw-string Rust path attributes without treating their contents as code", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.rs"), ' #[path = r#"support.rs"#] mod support;\n');
    await writeFile(join(root, "src/support.rs"), "pub fn support() {}\n");
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\n');
    await writeFile(join(root, "Cargo.lock"), "version = 4\n");
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-path-attribute-profile",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.files).toContain("src/support.rs");
  });

  it("does not match a Cargo prerelease to a stable semver requirement", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.rs"), "use serde::Serialize;\n");
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\n\n[dependencies]\nserde = "^1.2.3"\n');
    const registry = "registry+https://github.com/rust-lang/crates.io-index";
    const checksum = createHash("sha256").update("prerelease crate").digest("hex");
    await writeFile(join(root, "Cargo.lock"), `version = 4\n\n[[package]]\nname = "serde"\nversion = "1.2.3-alpha"\nsource = "${registry}"\nchecksum = "${checksum}"\n`);
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-prerelease-rejection-profile",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
    });
    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports.some(item => item.specifier.includes("serde"))).toBe(true);
  });

  it("excludes Cargo dev-dependencies from a runtime binary profile", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.rs"), "fn main() {}\n");
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\n\n[dependencies]\nruntime-crate = "1"\n\n[dev-dependencies]\ntest-only-crate = "1"\n');
    const registry = "registry+https://github.com/rust-lang/crates.io-index";
    const runtimeHash = createHash("sha256").update("runtime crate").digest("hex");
    const testHash = createHash("sha256").update("test crate").digest("hex");
    await writeFile(join(root, "Cargo.lock"), `version = 4\n\n[[package]]\nname = "runtime-crate"\nversion = "1.0.0"\nsource = "${registry}"\nchecksum = "${runtimeHash}"\n\n[[package]]\nname = "test-only-crate"\nversion = "1.0.0"\nsource = "${registry}"\nchecksum = "${testHash}"\n`);

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-runtime-only-profile",
      runtimeIdentity: { cargo: "cargo 1.94.1", packageManager: "cargo@1.94.1", platform: "linux-x86_64" },
    });

    expect(closure.requiredExternalPackages).toEqual([`Cargo.lock#runtime-crate@1.0.0|source=${registry}`]);
    expect(closure.externalPackageIdentities.find(item => item.name === "test-only-crate")?.artifactStatus).toBe("NOT_REQUIRED");
    expect(closure.closureComplete).toBe(false); // Runtime artifact bytes are still required.
  });

  it("excludes cfg(test) module source and imports from a runtime Rust profile", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.rs"), '#[cfg(test)]\nmod tests { use test_only_crate::Fixture; }\nfn main() {}\n');
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\n\n[dev-dependencies]\ntest-only-crate = "1"\n');
    const registry = "registry+https://github.com/rust-lang/crates.io-index";
    const checksum = createHash("sha256").update("test crate").digest("hex");
    await writeFile(join(root, "Cargo.lock"), `version = 4\n\n[[package]]\nname = "test-only-crate"\nversion = "1.0.0"\nsource = "${registry}"\nchecksum = "${checksum}"\n`);

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-runtime-cfg-test-excluded",
      runtimeIdentity: { cargo: "cargo 1.94.1", packageManager: "cargo@1.94.1", platform: "linux-x86_64" },
    });

    expect(closure.closureComplete).toBe(true);
    expect(closure.requiredExternalPackages).toEqual([]);
    expect(closure.unresolvedImports).toEqual([]);
  });

  it("resolves Rust modules and Cargo.lock locators, then verifies crate bytes before sealing", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.rs"), 'mod support;\nuse wire::Serialize;\n');
    await writeFile(join(root, "src/support.rs"), "pub fn value() -> u8 { 1 }\n");
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture-runner"\nversion = "0.1.0"\n\n[dependencies]\nwire = { package = "serde", version = "1" }\n');
    const registry = "registry+https://github.com/rust-lang/crates.io-index";
    const serdeBytes = Buffer.from("verified serde crate");
    const coreBytes = Buffer.from("verified serde_core crate");
    const serdeHash = createHash("sha256").update(serdeBytes).digest("hex");
    const coreHash = createHash("sha256").update(coreBytes).digest("hex");
    const decoyCoreHash = createHash("sha256").update("unused older serde_core").digest("hex");
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts/serde-1.0.0.crate"), serdeBytes);
    await writeFile(join(root, "artifacts/serde_core-1.0.0.crate"), coreBytes);
    await writeFile(join(root, "Cargo.lock"), `version = 4\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "${registry}"\nchecksum = "${serdeHash}"\ndependencies = [\n "serde_core 1.0.0 (${registry})",\n]\n\n[[package]]\nname = "serde_core"\nversion = "1.0.0"\nsource = "${registry}"\nchecksum = "${coreHash}"\n\n[[package]]\nname = "serde_core"\nversion = "0.9.0"\nsource = "${registry}"\nchecksum = "${decoyCoreHash}"\n`);
    const bindings = [
      { name: "serde", version: "1.0.0", locator: `Cargo.lock#serde@1.0.0|source=${registry}`, packageManager: "cargo" as const, lockfilePath: "Cargo.lock", path: "artifacts/serde-1.0.0.crate", source: "https://static.crates.io/crates/serde/serde-1.0.0.crate", kind: "cargo-crate" as const, platform: "linux-x86_64" },
      { name: "serde-core", version: "1.0.0", locator: `Cargo.lock#serde_core@1.0.0|source=${registry}`, packageManager: "cargo" as const, lockfilePath: "Cargo.lock", path: "artifacts/serde_core-1.0.0.crate", source: "https://static.crates.io/crates/serde_core/serde_core-1.0.0.crate", kind: "cargo-crate" as const, platform: "linux-x86_64" },
    ];
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-cargo-profile-v1",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
      externalArtifacts: bindings,
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.files).toContain("src/support.rs");
    expect(closure.requiredExternalPackages).toHaveLength(2);
    expect(closure.externalPackageIdentities.filter(item => item.artifactStatus === "VERIFIED_ARTIFACT")).toHaveLength(2);
    expect(closure.dependencyEdges.filter(edge => edge.from === "Cargo.toml" && edge.status === "external-package")).toEqual([]);
    const destination = join(root, "..", "sealed-rust-bundle");
    const bundle = await assembleReadOnlySourceBundle({ sourceRoot: root, destination, closure, sourceRevision: "d".repeat(40), specDigest, dependencyArtifacts: ["Cargo.toml", "Cargo.lock"] });
    expect(bundle.files.map(file => file.path)).toContain("artifacts/serde_core-1.0.0.crate");
    expect(await verifyReadOnlySourceBundle(destination)).toMatchObject({ valid: true });

    const forgedSource = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-cargo-profile-v1",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
      externalArtifacts: bindings.map(binding => binding.name === "serde" ? { ...binding, source: "https://attacker.invalid/serde.crate" } : binding),
    });
    expect(forgedSource.closureComplete).toBe(false);
    expect(forgedSource.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "UNVERIFIED_ARTIFACT:serde@1.0.0" }));

    await writeFile(join(root, "artifacts/serde-1.0.0.crate"), Buffer.from("tampered crate"));
    const tampered = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-cargo-profile-v1",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
      externalArtifacts: bindings,
    });
    expect(tampered.closureComplete).toBe(false);
    expect(tampered.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "UNVERIFIED_ARTIFACT:serde@1.0.0" }));

    await writeFile(join(root, "src/main.rs"), 'include_str!(concat!(env!("OUT_DIR"), "/generated.rs"));\n');
    const dynamicInclude = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "rust-cargo-profile-v1",
      runtimeIdentity: { cargo: "cargo 1.91.0", packageManager: "cargo@1.91.0", platform: "linux-x86_64" },
      externalArtifacts: bindings,
    });
    expect(dynamicInclude.closureComplete).toBe(false);
    expect(dynamicInclude.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<dynamic-rust-include>" }));
  });

  it("resolves configured TypeScript path aliases as local source edges", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "shared"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), 'import { shared } from "@shared/const"; export { shared };\n');
    await writeFile(join(root, "shared/const.ts"), "export const shared = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      moduleRoots: [{ prefix: "@shared", root: "shared", language: "javascript" }],
      profileId: "typescript-path-alias-profile",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" },
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.files).toContain("shared/const.ts");
    expect(closure.externalImports).not.toContain("@shared/const");
    expect(closure.dependencyEdges).toContainEqual(expect.objectContaining({ specifier: "@shared/const", to: "shared/const.ts", status: "resolved-local" }));
  });

  it("keeps the real registered Runner profile unsealed when Cargo artifacts are absent", async () => {
    const runnerRoot = resolve(process.cwd(), "../runner-app");
    const closure = await discoverSourceClosure({
      sourceRoot: runnerRoot,
      entryPaths: ["src/main.rs"],
      dependencyArtifacts: ["Cargo.toml", "Cargo.lock"],
      profileId: "spec224-registered-rust-runner-linux-x86_64",
      runtimeIdentity: { cargo: "cargo 1.94.1", packageManager: "cargo@1.94.1", platform: "linux-x86_64" },
    });
    expect(closure.files).toContain("Cargo.toml");
    expect(closure.files).toContain("Cargo.lock");
    expect(closure.files).toContain("src/main.rs");
    expect(closure.requiredExternalPackages.length).toBeGreaterThan(0);
    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports.some(item => item.specifier.startsWith("UNVERIFIED_ARTIFACT:"))).toBe(true);
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: "cargo-import-resolution-missing:smartaihub-runner" }));
    expect(closure.unresolvedImports.filter(item => ["config", "connection", "container", "diagnostics", "process"].some(name => item.specifier === `cargo-import-resolution-missing:${name}`))).toEqual([]);
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: "external-package-lock-entry-missing:serde-json:Cargo.toml" }));
  });

  it("keeps dynamically imported Node builtins in the runtime, not package closure", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), 'export const load = () => Promise.all([import("node:crypto"), import("fs/promises"), import("dns/promises"), import("net")]);\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "node-builtin-dynamic-imports",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" },
    });
    expect(closure.closureComplete, JSON.stringify(closure.unresolvedImports)).toBe(true);
    expect(closure.externalImports).not.toContain("crypto");
    expect(closure.externalImports).not.toContain("fs");
    expect(closure.requiredExternalPackages).not.toContain("crypto");
    expect(closure.requiredExternalPackages).not.toContain("fs");
    expect(closure.requiredExternalPackages).not.toContain("dns");
    expect(closure.requiredExternalPackages).not.toContain("net");
  });

  it("requires selected scripts to include their executable dependency and nested scripts", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), "export const profile = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "fixture",
      dependencies: { vite: "1.0.0" },
      scripts: { build: "vite build", test: "pnpm run build" },
    }));
    const baseInput = {
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" as const }],
      profileId: "selected-script-dependencies",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" },
      selectedManifestDependencies: { "package.json": [] },
    };
    const omittedBinary = await discoverSourceClosure({
      ...baseInput,
      selectedManifestScripts: { "package.json": ["build"] },
    });
    expect(omittedBinary.closureComplete).toBe(false);
    expect(omittedBinary.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<script-command-dependency:build:vite>" }));

    const omittedNestedScript = await discoverSourceClosure({
      ...baseInput,
      selectedManifestScripts: { "package.json": ["test"] },
    });
    expect(omittedNestedScript.closureComplete).toBe(false);
    expect(omittedNestedScript.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<script-command-not-selected:test:build>" }));
  });

  it("resolves npm multi-version transitive dependencies by install locator and rejects cross-version artifact bytes", async () => {
    const root = await sourceFixture();
    const pkgA = Buffer.from("pkg-a 1.0.0 tarball");
    const sharedV1 = Buffer.from("shared-dep 1.0.0 tarball");
    const sharedV2 = Buffer.from("shared-dep 2.0.0 tarball");
    const sri = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const pkgAUrl = "https://registry.npmjs.org/pkg-a/-/pkg-a-1.0.0.tgz";
    const sharedV1Url = "https://registry.npmjs.org/shared-dep/-/shared-dep-1.0.0.tgz";
    const sharedV2Url = "https://registry.npmjs.org/shared-dep/-/shared-dep-2.0.0.tgz";
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), 'import "pkg-a"; import "shared-dep";\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "pkg-a": "1.0.0", "shared-dep": "2.0.0" } }));
    await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {
      "": { dependencies: { "pkg-a": "1.0.0", "shared-dep": "2.0.0" } },
      "node_modules/pkg-a": { version: "1.0.0", resolved: pkgAUrl, integrity: sri(pkgA), dependencies: { "shared-dep": "^1.0.0" } },
      "node_modules/pkg-a/node_modules/shared-dep": { version: "1.0.0", resolved: sharedV1Url, integrity: sri(sharedV1) },
      "node_modules/shared-dep": { version: "2.0.0", resolved: sharedV2Url, integrity: sri(sharedV2) },
    } }));
    await writeFile(join(root, "artifacts/pkg-a.tgz"), pkgA);
    await writeFile(join(root, "artifacts/shared-v1.tgz"), sharedV1);
    await writeFile(join(root, "artifacts/shared-v2.tgz"), sharedV2);

    const bindings = [
      { name: "pkg-a", version: "1.0.0", locator: "package-lock.json#node_modules/pkg-a", packageManager: "npm" as const, lockfilePath: "package-lock.json", path: "artifacts/pkg-a.tgz", source: pkgAUrl, kind: "npm-tarball" as const, platform: "linux-x64" },
      { name: "shared-dep", version: "1.0.0", locator: "package-lock.json#node_modules/pkg-a/node_modules/shared-dep", packageManager: "npm" as const, lockfilePath: "package-lock.json", path: "artifacts/shared-v1.tgz", source: sharedV1Url, kind: "npm-tarball" as const, platform: "linux-x64" },
      { name: "shared-dep", version: "2.0.0", locator: "package-lock.json#node_modules/shared-dep", packageManager: "npm" as const, lockfilePath: "package-lock.json", path: "artifacts/shared-v2.tgz", source: sharedV2Url, kind: "npm-tarball" as const, platform: "linux-x64" },
    ];
    const input = { sourceRoot: root, entryPaths: ["src/main.ts"], dependencyArtifacts: ["package-lock.json"], profileInputs: [{ path: "package.json", kind: "runtime-config" as const }], profileId: "npm-multi-locator", runtimeIdentity: { node: process.version, packageManager: "npm@10.9.8", platform: "linux-x64" }, externalArtifacts: bindings };
    const closure = await discoverSourceClosure(input);
    expect(closure.closureComplete).toBe(true);
    expect(closure.requiredExternalPackages).toEqual(expect.arrayContaining(bindings.map(item => item.locator)));
    expect(closure.externalPackageIdentities.filter(item => item.name === "shared-dep").map(item => [item.version, item.locator, item.artifactStatus])).toEqual([
      ["1.0.0", "package-lock.json#node_modules/pkg-a/node_modules/shared-dep", "VERIFIED_ARTIFACT"],
      ["2.0.0", "package-lock.json#node_modules/shared-dep", "VERIFIED_ARTIFACT"],
    ]);
    const bundlePath = join(root, "..", "npm-multi-locator-bundle");
    const sealed = await assembleReadOnlySourceBundle({ sourceRoot: root, destination: bundlePath, closure, sourceRevision: "f".repeat(40), specDigest, dependencyArtifacts: ["package-lock.json"] });
    expect(sealed.files.filter(file => file.path.startsWith("artifacts/") && file.provenance.includes("dependency-artifact"))).toHaveLength(3);
    expect(await verifyReadOnlySourceBundle(bundlePath)).toMatchObject({ valid: true });

    await writeFile(join(root, "artifacts/shared-v1.tgz"), sharedV2);
    const mismatched = await discoverSourceClosure(input);
    expect(mismatched.closureComplete).toBe(false);
    expect(mismatched.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "UNVERIFIED_ARTIFACT:shared-dep@1.0.0" }));
    await expect(assembleReadOnlySourceBundle({ sourceRoot: root, destination: join(root, "..", "npm-mismatch-bundle"), closure: mismatched, sourceRevision: "f".repeat(40), specDigest, dependencyArtifacts: ["package-lock.json"] })).rejects.toThrow("SPEC224_BUNDLE_CLOSURE_INCOMPLETE");
  });

  it("selects the exact pnpm peer-dependency locator through the workspace importer", async () => {
    const root = await sourceFixture();
    const selectedBytes = Buffer.from("peer-consumer with peer@2");
    const peerV2Bytes = Buffer.from("peer dependency 2.0.0");
    const peerV1Bytes = Buffer.from("peer dependency 1.0.0");
    const sri = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const consumerV1Url = "https://registry.npmjs.org/peer-consumer/-/peer-consumer-1.0.0.tgz";
    const peerV1Url = "https://registry.npmjs.org/peer/-/peer-1.0.0.tgz";
    const peerV2Url = "https://registry.npmjs.org/peer/-/peer-2.0.0.tgz";
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), 'import "peer-consumer";\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "peer-consumer": "1.0.0" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      peer-consumer:\n        specifier: 1.0.0\n        version: peer-consumer@1.0.0(peer@2.0.0)\npackages:\n  peer-consumer@1.0.0(peer@1.0.0):\n    resolution:\n      tarball: ${consumerV1Url}\n      integrity: ${sri(selectedBytes)}\n    dependencies:\n      peer: 1.0.0\n  peer-consumer@1.0.0(peer@2.0.0):\n    resolution:\n      tarball: ${consumerV1Url}\n      integrity: ${sri(selectedBytes)}\n    dependencies:\n      peer: 2.0.0\n  peer@1.0.0:\n    resolution:\n      tarball: ${peerV1Url}\n      integrity: ${sri(peerV1Bytes)}\n  peer@2.0.0:\n    resolution:\n      tarball: ${peerV2Url}\n      integrity: ${sri(peerV2Bytes)}\n`);
    await writeFile(join(root, "artifacts/consumer.tgz"), selectedBytes);
    await writeFile(join(root, "artifacts/peer-v1.tgz"), peerV1Bytes);
    await writeFile(join(root, "artifacts/peer-v2.tgz"), peerV2Bytes);
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "pnpm-peer-variant",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
      externalArtifacts: [
        { name: "peer-consumer", version: "1.0.0", locator: "pnpm-lock.yaml#peer-consumer@1.0.0(peer@2.0.0)", packageManager: "pnpm", lockfilePath: "pnpm-lock.yaml", path: "artifacts/consumer.tgz", source: consumerV1Url, kind: "npm-tarball", platform: "linux-x64" },
        { name: "peer", version: "2.0.0", locator: "pnpm-lock.yaml#peer@2.0.0", packageManager: "pnpm", lockfilePath: "pnpm-lock.yaml", path: "artifacts/peer-v2.tgz", source: peerV2Url, kind: "npm-tarball", platform: "linux-x64" },
      ],
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.requiredExternalPackages).toEqual(expect.arrayContaining([
      "pnpm-lock.yaml#peer-consumer@1.0.0(peer@2.0.0)",
      "pnpm-lock.yaml#peer@2.0.0",
    ]));
    expect(closure.requiredExternalPackages).not.toContain("pnpm-lock.yaml#peer-consumer@1.0.0(peer@1.0.0)");
    expect(closure.requiredExternalPackages).not.toContain("pnpm-lock.yaml#peer@1.0.0");
    const bundlePath = join(root, "..", "pnpm-peer-variant-bundle");
    await assembleReadOnlySourceBundle({ sourceRoot: root, destination: bundlePath, closure, sourceRevision: "f".repeat(40), specDigest, dependencyArtifacts: ["pnpm-lock.yaml"] });
    expect(await verifyReadOnlySourceBundle(bundlePath)).toMatchObject({ valid: true });
  });

  it("resolves pnpm npm-alias transitive dependencies to the aliased package locator", async () => {
    const root = await sourceFixture();
    const parentBytes = Buffer.from("parent 1.0.0");
    const targetBytes = Buffer.from("string-width 4.2.3");
    const sri = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const parentUrl = "https://registry.npmjs.org/parent/-/parent-1.0.0.tgz";
    const targetUrl = "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz";
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), 'import "parent";\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { parent: "1.0.0" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      parent:\n        specifier: 1.0.0\n        version: 1.0.0\npackages:\n  parent@1.0.0:\n    resolution:\n      tarball: ${parentUrl}\n      integrity: ${sri(parentBytes)}\n  string-width@4.2.3:\n    resolution:\n      tarball: ${targetUrl}\n      integrity: ${sri(targetBytes)}\nsnapshots:\n  parent@1.0.0:\n    dependencies:\n      string-width-cjs: string-width@4.2.3\n  string-width@4.2.3: {}\n`);
    await writeFile(join(root, "artifacts/parent.tgz"), parentBytes);
    await writeFile(join(root, "artifacts/string-width.tgz"), targetBytes);
    const bindings = [
      { name: "parent", version: "1.0.0", locator: "pnpm-lock.yaml#parent@1.0.0", packageManager: "pnpm" as const, lockfilePath: "pnpm-lock.yaml", path: "artifacts/parent.tgz", source: parentUrl, kind: "npm-tarball" as const, platform: "linux-x64" },
      { name: "string-width", version: "4.2.3", locator: "pnpm-lock.yaml#string-width@4.2.3", packageManager: "pnpm" as const, lockfilePath: "pnpm-lock.yaml", path: "artifacts/string-width.tgz", source: targetUrl, kind: "npm-tarball" as const, platform: "linux-x64" },
    ];
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "pnpm-alias-transitive",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
      externalArtifacts: bindings,
    });
    expect(closure.externalPackageIdentities.find(item => item.name === "parent")?.dependencyLocators).toEqual({ "string-width-cjs": "pnpm-lock.yaml#string-width@4.2.3" });
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(true);
    expect(closure.requiredExternalPackages).toEqual(expect.arrayContaining(bindings.map(item => item.locator)));
  });

  it("matches profile workspace roots without requiring the root package as an execution workspace", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "apps/web"), { recursive: true });
    await mkdir(join(root, "apps/runner-app"), { recursive: true });
    await mkdir(join(root, "python-backend"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), "export const ready = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "root", version: "1.0.0" }));
    await writeFile(join(root, "apps/web/package.json"), JSON.stringify({ name: "web", version: "1.0.0" }));
    await writeFile(join(root, "apps/runner-app/Cargo.toml"), '[package]\nname = "runner"\nversion = "1.0.0"\n');
    await writeFile(join(root, "apps/runner-app/Cargo.lock"), "version = 4\n");
    await writeFile(join(root, "python-backend/pyproject.toml"), '[project]\nname = "backend"\nversion = "1.0.0"\nrequires-python = ">=3.12"\n');
    await writeFile(join(root, "python-backend/uv.lock"), 'version = 1\nrevision = 3\nrequires-python = ">=3.12"\n');
    const { profileDigest: _digest, ...base } = SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE;
    const profile = createSpec224ExecutionProfile({
      ...base,
      profileId: "workspace-roots-without-root-execution-workspace",
      repository: { sourceCommit: "f".repeat(40), gitTree: "a".repeat(40) },
      workspaceManifestPaths: ["package.json", "apps/web/package.json"],
      workspaces: ["apps/web", "apps/runner-app", "python-backend"],
      entrypoints: { node: ["src/main.ts"], python: [], rust: [] },
      sourceInputs: ["src/main.ts"],
      generatedArtifacts: [],
      moduleRoots: [],
      dependencyManifests: {
        runtime: ["package.json", "pnpm-lock.yaml", "apps/web/package.json", "apps/runner-app/Cargo.toml", "apps/runner-app/Cargo.lock", "python-backend/pyproject.toml", "python-backend/uv.lock"],
        testOnly: [],
      },
      pythonDependencySelections: {},
      externalArtifacts: [],
    });
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: profile.dependencyManifests.runtime,
      workspaceManifestPaths: profile.workspaceManifestPaths,
      profileInputs: [],
      profileId: profile.profileId,
      profileDigest: profile.profileDigest,
      executionProfile: profile,
      runtimeIdentity: { node: profile.runtime.node, packageManager: `pnpm@${profile.runtime.pnpm}`, python: profile.runtime.python, rustc: profile.runtime.rustc, platform: `${profile.runtime.platform}-${profile.runtime.architecture}`, architecture: profile.runtime.architecture },
    });
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: "<execution-profile-workspace-set-mismatch>" }));
  });

  it("resolves pnpm v9 peer variants from snapshots while taking integrity from packages", async () => {
    const root = await sourceFixture();
    const consumer = Buffer.from("peer consumer artifact");
    const peerV1 = Buffer.from("peer v1 artifact");
    const peerV2 = Buffer.from("peer v2 artifact");
    const sri = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), 'import "peer-consumer";\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "peer-consumer": "1.0.0" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      peer-consumer:
        specifier: 1.0.0
        version: 1.0.0(peer@2.0.0)
packages:
  peer-consumer@1.0.0:
    resolution:
      integrity: ${sri(consumer)}
    peerDependencies:
      peer: ^1.0.0
  peer@1.0.0:
    resolution:
      integrity: ${sri(peerV1)}
  peer@2.0.0:
    resolution:
      integrity: ${sri(peerV2)}
snapshots:
  peer-consumer@1.0.0(peer@1.0.0):
    dependencies:
      peer: 1.0.0
  peer-consumer@1.0.0(peer@2.0.0):
    dependencies:
      peer: 2.0.0
  peer@1.0.0: {}
  peer@2.0.0: {}
`);
    await writeFile(join(root, "artifacts/consumer.tgz"), consumer);
    await writeFile(join(root, "artifacts/peer-v1.tgz"), peerV1);
    await writeFile(join(root, "artifacts/peer-v2.tgz"), peerV2);
    const consumerLocator = "pnpm-lock.yaml#peer-consumer@1.0.0(peer@2.0.0)";
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "pnpm-v9-snapshot-peer-variant",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
      externalArtifacts: [
        { name: "peer-consumer", version: "1.0.0", locator: consumerLocator, packageManager: "pnpm", lockfilePath: "pnpm-lock.yaml", path: "artifacts/consumer.tgz", source: null, kind: "npm-tarball", platform: "linux-x64" },
        { name: "peer", version: "2.0.0", locator: "pnpm-lock.yaml#peer@2.0.0", packageManager: "pnpm", lockfilePath: "pnpm-lock.yaml", path: "artifacts/peer-v2.tgz", source: null, kind: "npm-tarball", platform: "linux-x64" },
      ],
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.requiredExternalPackages).toEqual(expect.arrayContaining([consumerLocator, "pnpm-lock.yaml#peer@2.0.0"]));
    expect(closure.requiredExternalPackages).not.toContain("pnpm-lock.yaml#peer-consumer@1.0.0(peer@1.0.0)");
    expect(closure.externalPackageIdentities.find(item => item.locator === consumerLocator)).toMatchObject({ artifactStatus: "VERIFIED_ARTIFACT", artifactSha256: createHash("sha256").update(consumer).digest("hex") });
  });

  it("keeps distinct dotted and dashed npm package names distinct in the lock graph", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), 'import "root-package";\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "root-package": "1.0.0" } }));
    const lock = [
      "lockfileVersion: '9.0'",
      "importers:",
      "  .:",
      "    dependencies:",
      "      root-package:",
      "        specifier: 1.0.0",
      "        version: 1.0.0",
      "packages:",
      "  root-package@1.0.0:",
      "    resolution:",
      "      integrity: sha512-cm9vdA==",
      "    dependencies:",
      "      lodash.camelcase: 4.3.0",
      "      lodash-camelcase: 4.3.0",
      "  lodash.camelcase@4.3.0:",
      "    resolution:",
      "      integrity: sha512-YWJj",
      "  lodash-camelcase@4.3.0:",
      "    resolution:",
      "      integrity: sha512-ZGVm",
      "snapshots:",
      "  root-package@1.0.0:",
      "    dependencies:",
      "      lodash.camelcase: 4.3.0",
      "      lodash-camelcase: 4.3.0",
      "  lodash.camelcase@4.3.0: {}",
      "  lodash-camelcase@4.3.0: {}",
      "",
    ].join("\n");
    await writeFile(join(root, "pnpm-lock.yaml"), lock);
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "npm-distinct-name-normalization",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
    });
    expect(closure.requiredExternalPackages).toContain("pnpm-lock.yaml#lodash.camelcase@4.3.0");
    expect(closure.requiredExternalPackages).toContain("pnpm-lock.yaml#lodash-camelcase@4.3.0");
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: expect.stringContaining("external-package-resolution-ambiguous") }));
  });

  it("selects the uv resolution fork by version and environment marker, then seals only the compatible wheel", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python"), { recursive: true });
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "import forked_lib\n");
    await writeFile(join(root, "pyproject.toml"), '[project]\nname = "uv-fork-fixture"\nrequires-python = ">=3.12,<3.14"\ndependencies = ["forked-lib==2.0.0"]\n');
    const artifactV1 = Buffer.from("fork v1 cp312 wheel");
    const artifactV2 = Buffer.from("fork v2 cp313 wheel");
    const sri = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const lockSource = `version = 1\nrevision = 3\nrequires-python = ">=3.12,<3.14"\nresolution-markers = ["python_full_version < '3.13'", "python_full_version >= '3.13'"]\n\n[[package]]\nname = "forked-lib"\nversion = "1.0.0"\nsource = { registry = "https://pypi.org/simple" }\nwheels = [\n  { url = "https://files.pythonhosted.org/packages/forked_lib-1.0.0-cp312-cp312-manylinux_x86_64.whl", hash = "${sri(artifactV1)}" },\n]\n\n[[package]]\nname = "forked-lib"\nversion = "2.0.0"\nsource = { registry = "https://pypi.org/simple" }\nwheels = [\n  { url = "https://files.pythonhosted.org/packages/forked_lib-2.0.0-cp313-cp313-manylinux_x86_64.whl", hash = "${sri(artifactV2)}" },\n]\n`;
    const [blockV1, blockV2] = lockSource.split(/^\[\[package\]\]\s*$/m).slice(1).map(block => block.trim());
    const sourceIdentity = 'registry = "https://pypi.org/simple"';
    const locatorV1 = uvPackageLocator("forked-lib", "1.0.0", sourceIdentity, blockV1);
    const locatorV2 = uvPackageLocator("forked-lib", "2.0.0", sourceIdentity, blockV2);
    await writeFile(join(root, "uv.lock"), lockSource);
    await writeFile(join(root, "artifacts/forked-lib-1.0.0.whl"), artifactV1);
    await writeFile(join(root, "artifacts/forked-lib-2.0.0.whl"), artifactV2);
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["python/main.py"],
      dependencyArtifacts: ["pyproject.toml", "uv.lock"],
      profileId: "python-cp313-marker-fork",
      runtimeIdentity: { python: "3.13.5", packageManager: "uv@0.9.28", platform: "linux-x86_64-cp313", pythonCompatibility: { compatibleWheelTags: ["cp313-cp313-manylinux_x86_64", "py3-none-any"], markerEnvironment: { python_version: "3.13", python_full_version: "3.13.5", sys_platform: "linux", platform_machine: "x86_64", os_name: "posix" } } },
      externalArtifacts: [
        { name: "forked-lib", version: "1.0.0", locator: locatorV1, packageManager: "uv", lockfilePath: "uv.lock", path: "artifacts/forked-lib-1.0.0.whl", source: "https://files.pythonhosted.org/packages/forked_lib-1.0.0-cp312-cp312-manylinux_x86_64.whl", kind: "python-wheel", platform: "linux-x86_64-cp313" },
        { name: "forked-lib", version: "2.0.0", locator: locatorV2, packageManager: "uv", lockfilePath: "uv.lock", path: "artifacts/forked-lib-2.0.0.whl", source: "https://files.pythonhosted.org/packages/forked_lib-2.0.0-cp313-cp313-manylinux_x86_64.whl", kind: "python-wheel", platform: "linux-x86_64-cp313" },
      ],
    });
    expect(closure.closureComplete).toBe(true);
    expect(closure.requiredExternalPackages).toEqual([locatorV2]);
    expect(closure.externalPackageIdentities.find(item => item.locator === locatorV2)).toMatchObject({ artifactStatus: "VERIFIED_ARTIFACT", artifactSha256: createHash("sha256").update(artifactV2).digest("hex") });
    expect(closure.externalPackageIdentities.find(item => item.locator === locatorV1)?.artifactStatus).toBe("NOT_REQUIRED");
    const bundlePath = join(root, "..", "python-cp313-marker-fork-bundle");
    const manifest = await assembleReadOnlySourceBundle({ sourceRoot: root, destination: bundlePath, closure, sourceRevision: "f".repeat(40), specDigest, dependencyArtifacts: ["pyproject.toml", "uv.lock"] });
    expect(manifest.selectedPythonExtras).toEqual([]);
    expect(await verifyReadOnlySourceBundle(bundlePath)).toMatchObject({ valid: true });
  });

  it("fails closed when Python marker environment is incomplete or a transitive uv edge is missing", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "import parent_lib\nmodule_name = input()\n__import__(module_name)\n");
    await writeFile(join(root, "pyproject.toml"), '[project]\nname = "uv-missing-edge"\ndependencies = ["parent-lib==1.0.0"]\n');
    await writeFile(join(root, "uv.lock"), `version = 1\n[[package]]\nname = "parent-lib"\nversion = "1.0.0"\nsource = { registry = "https://pypi.org/simple" }\ndependencies = [\n  { name = "child-lib", version = "2.0.0", marker = "python_full_version >= '3.12'" },\n]\nwheels = [\n  { url = "https://files.pythonhosted.org/parent_lib-1.0.0-py3-none-any.whl", hash = "sha256:${"a".repeat(64)}" },\n]\n`);
    const common = { sourceRoot: root, entryPaths: ["python/main.py"], dependencyArtifacts: ["pyproject.toml", "uv.lock"], profileId: "python-missing-transitive", runtimeIdentity: { python: "3.12", packageManager: "uv@0.9.28" } };
    const unknownMarker = await discoverSourceClosure(common);
    expect(unknownMarker.closureComplete).toBe(false);
    expect(unknownMarker.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: expect.stringContaining("python-marker-environment-unresolved") }));
    const missingTransitive = await discoverSourceClosure({ ...common, runtimeIdentity: { ...common.runtimeIdentity, pythonCompatibility: { compatibleWheelTags: ["py3-none-any"], markerEnvironment: { python_full_version: "3.12.1", python_version: "3.12" } } } });
    expect(missingTransitive.closureComplete).toBe(false);
    expect(missingTransitive.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: expect.stringContaining("transitive-package-resolution-missing") }));
    expect(missingTransitive.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<dynamic-python-import>" }));
  });

  it("includes only the selected uv extras and dependency groups", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "import base_lib\n");
    await writeFile(join(root, "pyproject.toml"), '[project]\nname = "uv-groups-fixture"\ndependencies = ["base-lib==1.0.0"]\n\n[project.optional-dependencies]\ntests = ["extra-lib==2.0.0"]\n\n[dependency-groups]\ndev = ["dev-lib==3.0.0"]\n');
    await writeFile(join(root, "uv.lock"), `version = 1\n${[
      ["base-lib", "1.0.0"], ["extra-lib", "2.0.0"], ["dev-lib", "3.0.0"],
    ].map(([name, version]) => `[[package]]\nname = "${name}"\nversion = "${version}"\nsource = { registry = "https://pypi.org/simple" }\n`).join("\n")}`);
    const common = { sourceRoot: root, entryPaths: ["python/main.py"], dependencyArtifacts: ["pyproject.toml", "uv.lock"], profileId: "uv-selected-groups", runtimeIdentity: { python: "3.13.5", packageManager: "uv@0.9.28" } };
    const baseOnly = await discoverSourceClosure(common);
    expect(baseOnly.externalPackageIdentities.filter(item => baseOnly.requiredExternalPackages.includes(item.locator)).map(item => item.name)).toEqual(["base-lib"]);
    const selected = await discoverSourceClosure({ ...common, selectedPythonExtras: ["tests"], selectedPythonDependencyGroups: ["dev"] });
    expect(selected.externalPackageIdentities.filter(item => selected.requiredExternalPackages.includes(item.locator)).map(item => item.name).sort()).toEqual(["base-lib", "dev-lib", "extra-lib"]);
    expect(selected.selectedPythonExtras).toEqual(["tests"]);
    expect(selected.selectedPythonDependencyGroups).toEqual(["dev"]);
  });

  it("rejects a uv wheel with wrong bytes or incompatible interpreter tags", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python"), { recursive: true });
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "import wheel_fixture\n");
    await writeFile(join(root, "pyproject.toml"), '[project]\nname = "uv-wheel-mismatch"\ndependencies = ["wheel-fixture==1.0.0"]\n');
    const lockedBytes = Buffer.from("expected wheel bytes");
    const wrongBytes = Buffer.from("different artifact bytes");
    const integrity = `sha256:${createHash("sha256").update(lockedBytes).digest("hex")}`;
    const url = "https://files.pythonhosted.org/packages/wheel_fixture-1.0.0-cp313-cp313-manylinux_x86_64.whl";
    const lockSource = `version = 1\n[[package]]\nname = "wheel-fixture"\nversion = "1.0.0"\nsource = { registry = "https://pypi.org/simple" }\nwheels = [\n  { url = "${url}", hash = "${integrity}" },\n]\n`;
    const block = lockSource.split(/^\[\[package\]\]\s*$/m)[1].trim();
    const locator = uvPackageLocator("wheel-fixture", "1.0.0", 'registry = "https://pypi.org/simple"', block);
    await writeFile(join(root, "uv.lock"), lockSource);
    await writeFile(join(root, "artifacts/wrong.whl"), wrongBytes);
    await writeFile(join(root, "artifacts/locked.whl"), lockedBytes);
    const common = { sourceRoot: root, entryPaths: ["python/main.py"], dependencyArtifacts: ["pyproject.toml", "uv.lock"], profileId: "uv-wheel-mismatch", runtimeIdentity: { python: "3.13.5", packageManager: "uv@0.9.28", platform: "linux-x86_64-cp313", pythonCompatibility: { compatibleWheelTags: ["cp313-cp313-manylinux_x86_64"], markerEnvironment: { python_full_version: "3.13.5", python_version: "3.13" } } } };
    const binding = { name: "wheel-fixture", version: "1.0.0", locator, packageManager: "uv" as const, lockfilePath: "uv.lock", source: url, kind: "python-wheel" as const, platform: "linux-x86_64-cp313" };
    const wrongHash = await discoverSourceClosure({ ...common, externalArtifacts: [{ ...binding, path: "artifacts/wrong.whl" }] });
    expect(wrongHash.closureComplete).toBe(false);
    expect(wrongHash.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "UNVERIFIED_ARTIFACT:wheel-fixture@1.0.0" }));
    const incompatible = await discoverSourceClosure({ ...common, runtimeIdentity: { ...common.runtimeIdentity, pythonCompatibility: { compatibleWheelTags: ["cp312-cp312-manylinux_x86_64"], markerEnvironment: { python_full_version: "3.12.8", python_version: "3.12" } } }, externalArtifacts: [{ ...binding, path: "artifacts/locked.whl" }] });
    expect(incompatible.closureComplete).toBe(false);
    expect(incompatible.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "UNVERIFIED_ARTIFACT:wheel-fixture@1.0.0" }));
  });

  it("attests a complete manifest against immutable Git tree blobs at an exact commit", async () => {
    const { repositoryRoot, sourceRevision } = await gitTreeFixture();
    const manifest = await gitTreeManifest(repositoryRoot, sourceRevision);

    await expect(attestGitTreeSourceManifest({ repositoryRoot, manifest })).resolves.toMatchObject({
      valid: true,
      sourceRevision,
      treePath: "source",
    });
  });

  it("fails closed for Git tree manifest digest, path, file-set, blob, and mode mismatches", async () => {
    const { repositoryRoot, sourceRevision } = await gitTreeFixture();
    const manifest = await gitTreeManifest(repositoryRoot, sourceRevision);
    const invalid = (change: (value: GitTreeSourceManifest) => void) => {
      const value = structuredClone(manifest);
      change(value);
      return attestGitTreeSourceManifest({ repositoryRoot, manifest: value });
    };

    await expect(invalid(value => { value.manifestDigest = "0".repeat(64); })).rejects.toThrow("SPEC224_GIT_TREE_MANIFEST_DIGEST_MISMATCH");
    await expect(invalid(value => { value.files.pop(); value.manifestDigest = calculateGitTreeSourceManifestDigest(value); })).rejects.toThrow("SPEC224_GIT_TREE_FILE_SET_MISMATCH");
    await expect(invalid(value => { value.files.push({ ...value.files[0], path: "zz-extra.ts" }); value.manifestDigest = calculateGitTreeSourceManifestDigest(value); })).rejects.toThrow("SPEC224_GIT_TREE_FILE_SET_MISMATCH");
    await expect(invalid(value => { value.files[0].sha256 = "f".repeat(64); value.manifestDigest = calculateGitTreeSourceManifestDigest(value); })).rejects.toThrow("SPEC224_GIT_TREE_BLOB_DIGEST_MISMATCH");
    await expect(invalid(value => { value.files[0].mode = 0o644; value.manifestDigest = calculateGitTreeSourceManifestDigest(value); })).rejects.toThrow("SPEC224_GIT_TREE_MODE_MISMATCH");
    await expect(invalid(value => { value.files[0].path = "../outside.ts"; value.manifestDigest = calculateGitTreeSourceManifestDigest(value); })).rejects.toThrow("SPEC224_GIT_TREE_PATH_INVALID");
  });

  it("rejects a wrong repository root, missing tree path, and unsupported Git symlink or submodule entries", async () => {
    const { repositoryRoot, sourceRevision } = await gitTreeFixture();
    const manifest = await gitTreeManifest(repositoryRoot, sourceRevision);
    await expect(attestGitTreeSourceManifest({ repositoryRoot: join(repositoryRoot, "source"), manifest })).rejects.toThrow("SPEC224_GIT_TREE_REPOSITORY_ROOT_MISMATCH");

    const missingTree = structuredClone(manifest);
    missingTree.treePath = "missing";
    missingTree.manifestDigest = calculateGitTreeSourceManifestDigest(missingTree);
    await expect(attestGitTreeSourceManifest({ repositoryRoot, manifest: missingTree })).rejects.toThrow("SPEC224_GIT_TREE_PATH_NOT_FOUND");

    const wrongRevision = structuredClone(manifest);
    wrongRevision.sourceRevision = "f".repeat(40);
    wrongRevision.manifestDigest = calculateGitTreeSourceManifestDigest(wrongRevision);
    await expect(attestGitTreeSourceManifest({ repositoryRoot, manifest: wrongRevision })).rejects.toThrow("SPEC224_GIT_TREE_SOURCE_REVISION_INVALID");

    await symlink("src/main.ts", join(repositoryRoot, "source/link.ts"));
    await git(repositoryRoot, ["add", "source/link.ts"]);
    await git(repositoryRoot, ["commit", "-m", "symlink fixture"]);
    const symlinkCommit = (await git(repositoryRoot, ["rev-parse", "HEAD"])).toString("utf8").trim();
    const symlinkManifest = await gitTreeManifest(repositoryRoot, symlinkCommit);
    symlinkManifest.manifestDigest = calculateGitTreeSourceManifestDigest(symlinkManifest);
    await expect(attestGitTreeSourceManifest({ repositoryRoot, manifest: symlinkManifest })).rejects.toThrow("SPEC224_GIT_TREE_SYMLINK_UNSUPPORTED");

    await git(repositoryRoot, ["rm", "--cached", "source/link.ts"]);
    const tree = (await git(repositoryRoot, ["write-tree"])).toString("utf8").trim();
    await git(repositoryRoot, ["update-index", "--add", "--cacheinfo", `160000,${symlinkCommit},source/submodule`]);
    const submoduleTree = (await git(repositoryRoot, ["write-tree"])).toString("utf8").trim();
    const submoduleCommit = (await git(repositoryRoot, ["commit-tree", submoduleTree, "-p", symlinkCommit, "-m", "submodule fixture"])).toString("utf8").trim();
    await git(repositoryRoot, ["update-ref", "HEAD", submoduleCommit]);
    expect(tree).not.toBe(submoduleTree);
    const submoduleManifest = await gitTreeManifest(repositoryRoot, submoduleCommit);
    submoduleManifest.manifestDigest = calculateGitTreeSourceManifestDigest(submoduleManifest);
    await expect(attestGitTreeSourceManifest({ repositoryRoot, manifest: submoduleManifest })).rejects.toThrow("SPEC224_GIT_TREE_SUBMODULE_UNSUPPORTED");
  });
});
