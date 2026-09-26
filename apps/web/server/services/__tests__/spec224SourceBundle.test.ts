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
  const closure = await discoverSourceClosure({
    sourceRoot,
    entryPaths: ["src/main.ts"],
    dependencyArtifacts: ["pnpm-lock.yaml"],
  });
  return assembleReadOnlySourceBundle({
    sourceRoot,
    destination,
    files: closure.files,
    sourceRevision: "candidate-sha",
    specDigest,
    dependencyArtifacts: ["pnpm-lock.yaml"],
    externalImports: closure.externalImports,
    unresolvedImports: closure.unresolvedImports,
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
    });
    expect(closure.files).toEqual(["pnpm-lock.yaml", "src/dep.ts", "src/main.ts"]);
    expect(closure.externalImports).toEqual(["lodash"]);
    expect(closure.closureComplete).toBe(false);
  });

  it("assembles repeatable read-only bundles and detects post-seal mutation", async () => {
    const root = await sourceFixture();
    const first = await makeBundle(root, join(root, "..", "bundle-one"));
    const second = await makeBundle(root, join(root, "..", "bundle-two"));
    const firstPath = join(root, "..", "bundle-one");
    expect(first.bundleDigest).toBe(second.bundleDigest);
    expect(first.closureComplete).toBe(false);
    expect(await verifyReadOnlySourceBundle(firstPath)).toMatchObject({ valid: true, integrityOnly: true });

    const target = join(firstPath, "src/dep.ts");
    await chmod(join(firstPath, "src"), 0o755);
    await chmod(target, 0o644);
    await writeFile(target, "export const value = 99;\n");
    expect(await verifyReadOnlySourceBundle(firstPath)).toMatchObject({ valid: false, integrityOnly: true });
    await chmod(join(firstPath, "src"), 0o555);
    expect((await readFile(join(firstPath, ".spec224-source-bundle.json"), "utf8")).trim()).toContain(first.bundleDigest);
  });
});
