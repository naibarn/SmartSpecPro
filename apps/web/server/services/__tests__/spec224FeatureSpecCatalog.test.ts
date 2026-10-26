import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  listRepositoryFeatureSpecs,
  loadRepositoryFeatureSpec,
} from "../spec224FeatureSpecCatalog";

const temporaryRoots: string[] = [];

async function createFeatureRoot() {
  const root = await mkdtemp(join(tmpdir(), "spec224-feature-catalog-"));
  temporaryRoots.push(root);
  const featureRoot = join(root, "specs", "feature");
  await mkdir(join(featureRoot, "101-example feature"), { recursive: true });
  await writeFile(
    join(featureRoot, "101-example feature", "spec.md"),
    "# Example Feature\n\nBuild a safe example feature.\n\n## Requirements\n- Keep source integrity.\n",
  );
  await mkdir(join(featureRoot, "102-no-spec"), { recursive: true });
  return { root, featureRoot };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("repository feature spec catalog", () => {
  it("lists canonical spec.md files with searchable metadata", async () => {
    const { root } = await createFeatureRoot();

    await expect(listRepositoryFeatureSpecs({ repositoryRoot: root, search: "safe example" })).resolves.toEqual({
      specs: [{
        id: "101-example feature",
        title: "Example Feature",
        path: "specs/feature/101-example feature/spec.md",
        summary: "Build a safe example feature.",
      }],
    });
  });

  it("loads exact source content and rejects traversal or symlink entries", async () => {
    const { root, featureRoot } = await createFeatureRoot();
    const outside = join(root, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "spec.md"), "# Outside\n");
    await symlink(outside, join(featureRoot, "103-linked"));

    const loaded = await loadRepositoryFeatureSpec({ repositoryRoot: root, specId: "101-example feature" });
    expect(loaded.path).toBe("specs/feature/101-example feature/spec.md");
    expect(loaded.content).toContain("Keep source integrity");
    await expect(loadRepositoryFeatureSpec({ repositoryRoot: root, specId: "../outside" })).rejects.toThrow("FEATURE_SPEC_ID_INVALID");
    await expect(loadRepositoryFeatureSpec({ repositoryRoot: root, specId: "103-linked" })).rejects.toThrow("FEATURE_SPEC_NOT_FOUND");
  });

  it("reads the packaged private runtime catalog used by Linux releases", async () => {
    const { root } = await createFeatureRoot();
    await mkdir(join(root, "server", "feature-spec-catalog", "224-runtime-example"), { recursive: true });
    await writeFile(
      join(root, "server", "feature-spec-catalog", "224-runtime-example", "spec.md"),
      "# Packaged Runtime Spec\n\nAvailable inside the immutable server release.\n",
    );
    await mkdir(join(root, "server", "feature-spec-catalog", "225-Interop & UI — Recovery"), { recursive: true });
    await writeFile(
      join(root, "server", "feature-spec-catalog", "225-Interop & UI — Recovery", "spec.md"),
      "# Unicode Feature Spec\n\nNames retain their repository spelling.\n",
    );

    await expect(listRepositoryFeatureSpecs({ repositoryRoot: root })).resolves.toMatchObject({
      specs: expect.arrayContaining([
        expect.objectContaining({ id: "224-runtime-example", title: "Packaged Runtime Spec" }),
        expect.objectContaining({ id: "225-Interop & UI — Recovery", title: "Unicode Feature Spec" }),
      ]),
    });
    await expect(loadRepositoryFeatureSpec({ repositoryRoot: root, specId: "224-runtime-example" })).resolves.toMatchObject({
      content: expect.stringContaining("immutable server release"),
    });
    await expect(loadRepositoryFeatureSpec({ repositoryRoot: root, specId: "225-Interop & UI — Recovery" })).resolves.toMatchObject({
      title: "Unicode Feature Spec",
    });
  });
});
