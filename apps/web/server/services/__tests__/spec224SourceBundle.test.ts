import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assembleReadOnlySourceBundle, discoverSourceClosure, verifyReadOnlySourceBundle } from "../spec224SourceBundle";

const temporaryRoots: string[] = [];
const specDigest = "a".repeat(64);

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

  it("resolves dynamic in-repository TypeScript aliases without treating them as registry packages", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), '// Lazy imports mentioned in docs are not runtime edges: await import("phantom-package");\nconst note = "require(\\\"also-phantom\\\")";\nimport type { Channel } from "@shared/channelTypes";\nexport const load = (): Promise<unknown> => import("@shared/channelTypes");\nexport type { Channel };\n');
    await mkdir(join(root, "shared"), { recursive: true });
    await writeFile(join(root, "shared/channelTypes.ts"), "export type Channel = string;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      moduleRoots: [{ prefix: "@shared", root: "shared", language: "javascript" }],
      profileId: "dynamic-alias-fixture",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
    });

    expect(closure.files).toContain("shared/channelTypes.ts");
    expect(closure.externalImports).not.toContain("@shared/channelTypes");
    expect(closure.externalImports).not.toContain("phantom-package");
    expect(closure.externalImports).not.toContain("also-phantom");
    expect(closure.dependencyEdges).toContainEqual(expect.objectContaining({
      specifier: "@shared/channelTypes",
      to: "shared/channelTypes.ts",
      kind: "dynamic-import",
      status: "resolved-local",
    }));
    expect(closure.dependencyEdges).toContainEqual(expect.objectContaining({
      specifier: "@shared/channelTypes",
      to: "shared/channelTypes.ts",
      kind: "static-import",
      status: "resolved-local",
    }));
  });

  it("records Node builtin modules as runtime edges rather than npm dependencies", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), 'import { readFile } from "node:fs/promises";\nimport { spawn } from "child_process";\nexport { readFile, spawn };\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "node-builtin-runtime-edges",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
    });

    expect(closure.externalImports).toEqual([]);
    expect(closure.dependencyEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ specifier: "node:fs/promises", status: "runtime-builtin" }),
      expect.objectContaining({ specifier: "child_process", status: "runtime-builtin" }),
    ]));
  });

  it("limits script-reference discovery to scripts selected by the execution profile", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), "export const ready = true;\n");
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts/dev-only.ts"), "import 'dev-only-package';\n");
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "fixture",
      scripts: { start: "node src/main.ts", test: "node scripts/dev-only.ts" },
    }));
    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      selectedPackageScripts: [{ manifestPath: "package.json", scripts: ["start"] }],
      profileId: "selected-runtime-script-only",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
    });

    expect(closure.files).not.toContain("scripts/dev-only.ts");
    expect(closure.externalImports).toEqual([]);
    expect(closure.unresolvedImports).toEqual([]);
  });

  it("can model a production install without rooting development-only manifest dependencies", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), "export const ready = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", devDependencies: { "test-only-package": "1.0.0" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'\nimporters:\n  .:\n    devDependencies:\n      test-only-package:\n        specifier: 1.0.0\n        version: 1.0.0\npackages:\n  test-only-package@1.0.0:\n    resolution:\n      integrity: sha512-YWJjZA==\nsnapshots:\n  test-only-package@1.0.0: {}\n`);

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      includeDevelopmentDependencies: false,
      profileId: "production-dependencies-only",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
    });

    expect(closure.requiredExternalPackages).toEqual([]);
    expect(closure.closureComplete).toBe(true);
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

  it("recursively inventories Python requirements and leaves unpinned external packages unresolved", async () => {
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
    expect(closure.unresolvedImports.some(edge => edge.specifier === "unpinned-python-dependency:sample-lib")).toBe(true);
    expect(closure.closureComplete).toBe(false);
  });

  it("records pyproject and uv lock package versions and integrity without claiming source completeness", async () => {
    const root = await sourceFixture();
    const digest = "a".repeat(64);
    await mkdir(join(root, "python"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "import sample_lib\n");
    await writeFile(join(root, "pyproject.toml"), '[project]\nname = "fixture"\ndependencies = [\n  "sample-lib==1.2.3",\n]\n');
    await writeFile(join(root, "uv.lock"), `version = 1\n\n[[package]]\nname = "sample-lib"\nversion = "1.2.3"\nsource = { registry = "https://pypi.org/simple" }\nsdist = { url = "https://example.invalid/sample-lib-1.2.3.tar.gz", hash = "sha256:${digest}" }\n`);

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

  it("resolves pnpm v9 package metadata separately from snapshot dependency edges", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), 'import "root-lib";\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "root-lib": "1.0.0" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      root-lib:\n        specifier: 1.0.0\n        version: 1.0.0\npackages:\n  root-lib@1.0.0:\n    resolution:\n      integrity: sha512-YWJjZA==\n  transitive-lib@2.0.0:\n    resolution:\n      integrity: sha512-ZGVmZA==\nsnapshots:\n  root-lib@1.0.0:\n    dependencies:\n      transitive-lib: 2.0.0\n  transitive-lib@2.0.0: {}\n`);

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "pnpm-v9-package-snapshot-split",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
    });

    expect(closure.requiredExternalPackages).toEqual(expect.arrayContaining([
      "pnpm-lock.yaml#root-lib@1.0.0",
      "pnpm-lock.yaml#transitive-lib@2.0.0",
    ]));
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: expect.stringContaining("external-package-lock-entry-missing") }));
    expect(closure.unresolvedImports.filter(item => item.specifier.startsWith("UNVERIFIED_ARTIFACT:"))).toHaveLength(2);
  });

  it("resolves scoped pnpm v9 importer entries with peer-qualified versions", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "src/main.ts"), 'import "@scope/root-lib";\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "@scope/root-lib": "1.0.0" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@scope/root-lib':\n        specifier: ^1.0.0\n        version: 1.0.0(peer@2.0.0)\npackages:\n  '@scope/root-lib@1.0.0':\n    resolution:\n      integrity: sha512-YWJjZA==\n  peer@2.0.0:\n    resolution:\n      integrity: sha512-ZGVmZA==\n  actual-lib@3.0.0:\n    resolution:\n      integrity: sha512-YWJjZA==\nsnapshots:\n  '@scope/root-lib@1.0.0(peer@2.0.0)':\n    dependencies:\n      peer: 2.0.0\n      aliased-lib: actual-lib@3.0.0\n  peer@2.0.0: {}\n  actual-lib@3.0.0: {}\n`);

    const closure = await discoverSourceClosure({
      sourceRoot: root,
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      profileId: "pnpm-v9-scoped-peer-importer",
      runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1", platform: "linux-x64" },
    });

    expect(closure.requiredExternalPackages).toEqual(expect.arrayContaining([
      "pnpm-lock.yaml#@scope/root-lib@1.0.0(peer@2.0.0)",
      "pnpm-lock.yaml#peer@2.0.0",
      "pnpm-lock.yaml#actual-lib@3.0.0",
    ]));
    expect(closure.unresolvedImports).not.toContainEqual(expect.objectContaining({ specifier: expect.stringContaining("external-package-lock-entry-missing") }));
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
});
