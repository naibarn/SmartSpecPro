import { afterEach, describe, expect, it } from "vitest";
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assembleReadOnlySourceBundle, discoverSourceClosure, verifyReadOnlySourceBundle } from "../spec224SourceBundle";

const temporaryRoots: string[] = [];
const specDigest = "a".repeat(64);

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
  const closure = await discoverSourceClosure({ sourceRoot, entryPaths: ["src/main.ts"], dependencyArtifacts: ["pnpm-lock.yaml"], profileInputs: [{ path: "package.json", kind: "runtime-config" }], profileId: "spec224-test-node", runtimeIdentity: { node: process.version, packageManager: "fixture-pnpm@10.4.1" } });
  return assembleReadOnlySourceBundle({ sourceRoot, destination, closure, sourceRevision: "c".repeat(40), specDigest, dependencyArtifacts: ["pnpm-lock.yaml"] });
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
    const closure = await discoverSourceClosure({ sourceRoot: root, entryPaths: ["src/main.ts"], dependencyArtifacts: ["pnpm-lock.yaml"], profileId: "external-package-fail-closed", runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" } });
    expect(closure.files).toEqual(["pnpm-lock.yaml", "src/dep.ts", "src/main.ts"]);
    expect(closure.externalImports).toEqual(["lodash"]);
    expect(closure.closureComplete).toBe(false);
    await expect(assembleReadOnlySourceBundle({ sourceRoot: root, destination: join(root, "..", "incomplete-bundle"), closure, sourceRevision: "e".repeat(40), specDigest, dependencyArtifacts: ["pnpm-lock.yaml"] })).rejects.toThrow("SPEC224_BUNDLE_CLOSURE_INCOMPLETE");
  });

  it("assembles repeatable read-only bundles and detects post-seal mutation", async () => {
    const root = await sourceFixture();
    const first = await makeBundle(root, join(root, "..", "bundle-one"));
    const second = await makeBundle(root, join(root, "..", "bundle-two"));
    const firstPath = join(root, "..", "bundle-one");
    expect(first.bundleDigest).toBe(second.bundleDigest);
    expect(first.closureComplete).toBe(true);
    expect(await verifyReadOnlySourceBundle(firstPath)).toMatchObject({ valid: true, integrityOnly: true });

    const target = join(firstPath, "src/dep.ts");
    await chmod(join(firstPath, "src"), 0o755);
    await chmod(target, 0o644);
    await writeFile(target, "export const value = 99;\n");
    expect(await verifyReadOnlySourceBundle(firstPath)).toMatchObject({ valid: false, integrityOnly: true });
    await chmod(join(firstPath, "src"), 0o555);
    expect((await readFile(join(firstPath, ".spec224-source-bundle.json"), "utf8")).trim()).toContain(first.bundleDigest);
  });

  it("follows workspace exports and declared local package edges while retaining package provenance", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "generated"), { recursive: true });
    await mkdir(join(root, "tests/fixtures"), { recursive: true });
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-app", version: "1.0.0", scripts: { smoke: "node scripts/task.ts" }, dependencies: { "@fixture/shared": "workspace:*" } }));
    await writeFile(join(root, "generated/contract.ts"), "export const contractVersion = 1;\n");
    await writeFile(join(root, "tests/fixtures/requirements.json"), "{}\n");
    await writeFile(join(root, "scripts/task.ts"), "export {};\n");
    await mkdir(join(root, "packages/shared/src"), { recursive: true });
    await writeFile(join(root, "packages/shared/package.json"), JSON.stringify({ name: "@fixture/shared", exports: { ".": { types: "./src/index.ts", import: "./src/index.ts" }, "./extra": "./src/extra.ts" }, dependencies: { "@fixture/math": "workspace:*" } }));
    await writeFile(join(root, "packages/shared/src/index.ts"), 'export { add } from "@fixture/math";\n');
    await writeFile(join(root, "packages/shared/src/extra.ts"), "export const extra = true;\n");
    await mkdir(join(root, "packages/math/src"), { recursive: true });
    await writeFile(join(root, "packages/math/package.json"), JSON.stringify({ name: "@fixture/math", exports: { ".": "./src/index.ts" } }));
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
      runtimeIdentity: { node: process.version, packageManager: "fixture-pnpm@10.4.1" },
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
    const manifest = await assembleReadOnlySourceBundle({ sourceRoot: root, destination: join(root, "..", "workspace-bundle"), closure, sourceRevision: "d".repeat(40), specDigest, dependencyArtifacts: ["pnpm-lock.yaml"] });
    expect(manifest.packageIdentities.map(item => item.name)).toEqual(["@fixture/math", "@fixture/shared"]);
    expect(manifest.closureComplete).toBe(true);
    expect(manifest.admissionEligible).toBe(false);
  });

  it("rejects environment and credential paths during closure discovery", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, ".env.local"), "TOKEN=not-for-bundling\n");
    await expect(discoverSourceClosure({ sourceRoot: root, entryPaths: [".env.local"], dependencyArtifacts: [] })).rejects.toThrow("SPEC224_BUNDLE_SENSITIVE_PATH_REJECTED");
  });

  it("recursively inventories Python requirements and leaves unpinned external packages unresolved", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "python/app"), { recursive: true });
    await writeFile(join(root, "python/main.py"), "from app.module import value\n");
    await writeFile(join(root, "python/app/module.py"), "value = 1\n");
    await writeFile(join(root, "requirements.txt"), "-r requirements/base.txt\n");
    await mkdir(join(root, "requirements"), { recursive: true });
    await writeFile(join(root, "requirements/base.txt"), "sample-lib>=1.0\n");

    const closure = await discoverSourceClosure({ sourceRoot: root, entryPaths: ["python/main.py"], dependencyArtifacts: ["requirements.txt"], moduleRoots: [{ prefix: "app", root: "python/app", language: "python" }], profileId: "python-test", runtimeIdentity: { python: "3.12", packageManager: "pip" } });

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

    const closure = await discoverSourceClosure({ sourceRoot: root, entryPaths: ["python/main.py"], dependencyArtifacts: ["pyproject.toml", "uv.lock"], profileId: "python-uv-test", runtimeIdentity: { python: "3.12", packageManager: "uv@0.8.0" } });

    expect(closure.externalPackageIdentities).toContainEqual(expect.objectContaining({ name: "sample-lib", version: "1.2.3", packageManager: "uv", lockfilePath: "uv.lock", integrity: [`sha256:${digest}`] }));
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(false);
    expect(closure.externalImports).toContain("sample_lib");
  });

  it("records npm lock integrity for external packages and keeps external content outside closure", async () => {
    const root = await sourceFixture();
    const integrity = "sha512-YWJjZA==";
    await writeFile(join(root, "src/main.ts"), 'import samplePkg from "sample-pkg";\nexport default samplePkg;\n');
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "sample-pkg": "1.0.0" } }));
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "fixture", dependencies: { "sample-pkg": "1.0.0" } }, "node_modules/sample-pkg": { version: "1.0.0", resolved: "https://registry.npmjs.org/sample-pkg/-/sample-pkg-1.0.0.tgz", integrity, dependencies: { "transitive-pkg": "^2.0.0" } }, "node_modules/transitive-pkg": { version: "2.1.0", resolved: "https://registry.npmjs.org/transitive-pkg/-/transitive-pkg-2.1.0.tgz", integrity: "sha512-cHJvZw==" } } })
    );
    const closure = await discoverSourceClosure({ sourceRoot: root, entryPaths: ["src/main.ts"], dependencyArtifacts: ["package-lock.json"], profileInputs: [{ path: "package.json", kind: "runtime-config" }], profileId: "npm-lock-test", runtimeIdentity: { node: process.version, packageManager: "npm@10.9.8" } });
    expect(closure.externalPackageIdentities).toContainEqual(expect.objectContaining({ name: "sample-pkg", version: "1.0.0", packageManager: "npm", lockfilePath: "package-lock.json", integrity: [integrity] }));
    expect(closure.externalPackageIdentities).toContainEqual(expect.objectContaining({ name: "transitive-pkg", version: "2.1.0" }));
    expect(closure.externalPackageIdentities.find(item => item.name === "sample-pkg")?.dependencies).toEqual(["transitive-pkg"]);
    expect(closure.closureComplete).toBe(false);
    expect(closure.unresolvedImports).toEqual([]);
  });

  it("resolves statically known template-literal dynamic imports and wildcard package exports", async () => {
    const root = await sourceFixture();
    await mkdir(join(root, "packages/shared/src/features"), { recursive: true });
    await writeFile(join(root, "src/main.ts"), 'export const load = () => import(`./lazy`);\nimport { feature } from "@fixture/shared/features/one";\nexport { feature };\n');
    await writeFile(join(root, "src/lazy.ts"), "export const lazy = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-app", version: "1.0.0" }));
    await writeFile(join(root, "packages/shared/package.json"), JSON.stringify({ name: "@fixture/shared", exports: { "./*": "./src/*" } }));
    await writeFile(join(root, "packages/shared/src/features/one.ts"), "export const feature = true;\n");

    const closure = await discoverSourceClosure({ sourceRoot: root, entryPaths: ["src/main.ts"], dependencyArtifacts: ["pnpm-lock.yaml"], workspaceManifestPaths: ["packages/shared/package.json"], profileInputs: [{ path: "package.json", kind: "runtime-config" }], profileId: "wildcard-export-test", runtimeIdentity: { node: process.version, packageManager: "pnpm@10.4.1" } });

    expect(closure.files).toContain("src/lazy.ts");
    expect(closure.files).toContain("packages/shared/src/features/one.ts");
    expect(closure.dependencyEdges.some(edge => edge.kind === "dynamic-import" && edge.status === "resolved-local")).toBe(true);
    expect(closure.dependencyEdges.some(edge => edge.kind === "static-import" && edge.status === "resolved-local")).toBe(true);
    expect(closure.unresolvedImports).toEqual([]);
    expect(closure.closureComplete).toBe(true);
  });

  it("rejects hook commands whose executable is not provided by the package manifest", async () => {
    const root = await sourceFixture();
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "hook-fixture", "simple-git-hooks": { "pre-commit": "eslint ." }, scripts: { "check:custom": "missing-tool verify" }, devDependencies: { vitest: "1.0.0" } }));
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
    expect(closure.unresolvedImports).toContainEqual(expect.objectContaining({ specifier: "<script-command-dependency:check:custom:missing-tool>" }));
    expect(closure.closureComplete).toBe(false);
  });
});
