import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  listRepositoryFeatureSpecs,
  loadRepositoryFeatureSpec,
  loadRepositoryFeatureSpecContext,
  loadModularSaasProject,
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

  it("returns only a digest-matching canonical handoff and fails closed when stale", async () => {
    const { root, featureRoot } = await createFeatureRoot();
    const specPath = join(featureRoot, "101-example feature", "spec.md");
    const digest = createHash("sha256").update(await (await import("node:fs/promises")).readFile(specPath, "utf8")).digest("hex");
    const handoff = join(featureRoot, "101-example feature", "handoff");
    await mkdir(handoff);
    await writeFile(join(handoff, "manifest.json"), JSON.stringify({ identity: { digest }, continuation: { next_ready_workunit: "WU-2", next_action: "Continue WU-2" }, integration: { canonical_sha: "a".repeat(40) } }));
    await writeFile(join(handoff, "requirement-ledger.json"), JSON.stringify({ spec_digest: digest, requirements: [{ requirement_id: "REQ-1", requirement_text: "Keep source integrity", next_action: "Test it", final_state: "OPEN" }] }));
    await expect(loadRepositoryFeatureSpecContext({ repositoryRoot: root, specId: "101-example feature" })).resolves.toMatchObject({ handoff: { status: "CURRENT", nextReadyWorkunit: "WU-2", openRequirements: [{ id: "REQ-1" }] } });
    await writeFile(join(handoff, "manifest.json"), JSON.stringify({ identity: { digest: "0".repeat(64) } }));
    await expect(loadRepositoryFeatureSpec({ repositoryRoot: root, specId: "101-example feature" })).resolves.toMatchObject({ handoff: { status: "STALE", nextReadyWorkunit: null } });
  });

  it("loads a digest-bound modular project descriptor from canonical specs and handoffs", async () => {
    const { root, featureRoot } = await createFeatureRoot();
    await createProjectFixture(featureRoot, ["101-example feature"]);

    const project = await loadModularSaasProject({ repositoryRoot: root });
    expect(project.projectId).toBe("test-project");
    expect(project.specs).toMatchObject([{ id: "101-example feature", requirements: [] }]);
  });

  it("rejects duplicate or missing project members and stale source digests", async () => {
    const { root, featureRoot } = await createFeatureRoot();
    await createProjectFixture(featureRoot, ["101-example feature"]);
    const descriptorPath = join(featureRoot, "312-smartaihub-modular-saas-rebuild-master-plan", "handoff", "modular-saas-project.json");
    const descriptor = JSON.parse(await (await import("node:fs/promises")).readFile(descriptorPath, "utf8"));

    await writeFile(descriptorPath, JSON.stringify({ ...descriptor, specs: [...descriptor.specs, descriptor.specs[0]] }));
    await expect(loadModularSaasProject({ repositoryRoot: root })).rejects.toThrow("MODULAR_PROJECT_DUPLICATE_SPEC");

    await writeFile(descriptorPath, JSON.stringify({ ...descriptor, specs: [{ ...descriptor.specs[0], id: "999-missing" }] }));
    await expect(loadModularSaasProject({ repositoryRoot: root })).rejects.toThrow("FEATURE_SPEC_NOT_FOUND");

    await writeFile(descriptorPath, JSON.stringify({ ...descriptor, specs: [{ ...descriptor.specs[0], specDigest: "0".repeat(64) }] }));
    await expect(loadModularSaasProject({ repositoryRoot: root })).rejects.toThrow("MODULAR_PROJECT_SOURCE_DIGEST_MISMATCH");
  });

  it("rejects self-dependencies and cycles in canonical project handoffs", async () => {
    const { root, featureRoot } = await createFeatureRoot();
    await createProjectFixture(featureRoot, ["101-example feature", "104-second"]);
    await writeProjectHandoff(featureRoot, "101-example feature", ["104-second"]);
    await writeProjectHandoff(featureRoot, "104-second", ["101-example feature"]);
    await refreshProjectPins(featureRoot);
    await expect(loadModularSaasProject({ repositoryRoot: root })).rejects.toThrow("MODULAR_PROJECT_DEPENDENCY_CYCLE");

    await writeProjectHandoff(featureRoot, "101-example feature", ["101-example feature"]);
    await writeProjectHandoff(featureRoot, "104-second", []);
    await refreshProjectPins(featureRoot);
    await expect(loadModularSaasProject({ repositoryRoot: root })).rejects.toThrow("MODULAR_PROJECT_SELF_DEPENDENCY");
  });
});

async function writeProjectHandoff(featureRoot: string, specId: string, dependencyIds: string[]) {
  const handoff = join(featureRoot, specId, "handoff");
  await mkdir(handoff, { recursive: true });
  const spec = await (await import("node:fs/promises")).readFile(join(featureRoot, specId, "spec.md"), "utf8");
  const digest = createHash("sha256").update(spec).digest("hex");
  const manifest = {
    identity: { spec_id: specId.slice(0, 3), digest },
    dependencies: { specs: dependencyIds.map(spec_id => ({ spec_id, relationship: "PREREQUISITE", status: "CANONICALIZED_PENDING_INTEGRATION" })) },
  };
  const ledger = { spec_digest: digest, requirements: [] };
  await writeFile(join(handoff, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(handoff, "requirement-ledger.json"), JSON.stringify(ledger));
}

async function createProjectFixture(featureRoot: string, specIds: string[]) {
  await mkdir(join(featureRoot, "312-smartaihub-modular-saas-rebuild-master-plan", "handoff"), { recursive: true });
  for (const specId of specIds) {
    if (specId === "101-example feature") continue;
    await mkdir(join(featureRoot, specId), { recursive: true });
    await writeFile(join(featureRoot, specId, "spec.md"), `# ${specId}\n\nA second canonical feature.\n`);
  }
  for (const specId of specIds) await writeProjectHandoff(featureRoot, specId, []);
  const specs = await Promise.all(specIds.map(async id => {
    const spec = await (await import("node:fs/promises")).readFile(join(featureRoot, id, "spec.md"));
    const handoff = join(featureRoot, id, "handoff");
    return {
      id,
      specDigest: createHash("sha256").update(spec).digest("hex"),
      manifestDigest: createHash("sha256").update(await (await import("node:fs/promises")).readFile(join(handoff, "manifest.json"))).digest("hex"),
      ledgerDigest: createHash("sha256").update(await (await import("node:fs/promises")).readFile(join(handoff, "requirement-ledger.json"))).digest("hex"),
    };
  }));
  await writeFile(join(featureRoot, "312-smartaihub-modular-saas-rebuild-master-plan", "handoff", "modular-saas-project.json"), JSON.stringify({
    schemaVersion: 1,
    projectId: "test-project",
    source: { repository: "owner/repo", revision: "a".repeat(40) },
    implementationRepository: { repository: "owner/app", branch: "main" },
    specs,
    initialPackages: [],
  }));
}

async function refreshProjectPins(featureRoot: string) {
  const descriptorPath = join(featureRoot, "312-smartaihub-modular-saas-rebuild-master-plan", "handoff", "modular-saas-project.json");
  const descriptor = JSON.parse(await (await import("node:fs/promises")).readFile(descriptorPath, "utf8"));
  descriptor.specs = await Promise.all(descriptor.specs.map(async (pin: { id: string }) => {
    const handoff = join(featureRoot, pin.id, "handoff");
    const manifest = await (await import("node:fs/promises")).readFile(join(handoff, "manifest.json"));
    const ledger = await (await import("node:fs/promises")).readFile(join(handoff, "requirement-ledger.json"));
    return { ...pin, manifestDigest: createHash("sha256").update(manifest).digest("hex"), ledgerDigest: createHash("sha256").update(ledger).digest("hex") };
  }));
  await writeFile(descriptorPath, JSON.stringify(descriptor));
}
