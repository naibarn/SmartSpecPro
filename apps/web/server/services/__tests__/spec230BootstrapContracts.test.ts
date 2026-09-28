import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildRepositoryEngineeringProfile,
  discoverRepositorySkills,
  Spec230BootstrapError,
} from "../spec230BootstrapContracts";

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "spec230-"));
  mkdirSync(path.join(root, "skills", "reviewer"), { recursive: true });
  mkdirSync(path.join(root, "skills", "builder"), { recursive: true });
  writeFileSync(path.join(root, "skills", "reviewer", "SKILL.md"), "# Reviewer\nInspect changed files.\n");
  writeFileSync(path.join(root, "skills", "builder", "SKILL.md"), "# Builder\nRun bounded tests.\n");
  return root;
}

describe("Spec 230 repository bootstrap", () => {
  it("discovers metadata from the repository-owned skills root without loading the catalog", () => {
    const root = fixtureRoot();
    const result = discoverRepositorySkills({
      repositoryRoot: root,
      sourceRevision: "git:abc123",
      requestedSkillIds: ["reviewer"],
    });
    expect(result.discovered).toHaveLength(2);
    expect(result.loaded).toEqual([{ id: "reviewer", content: "# Reviewer\nInspect changed files.\n" }]);
    expect(result.discovered[0]).toMatchObject({ id: "builder", root: "skills" });
  });

  it("rejects symlinked skills so a trusted root cannot escape the repository", () => {
    const root = fixtureRoot();
    const outside = mkdtempSync(path.join(tmpdir(), "spec230-outside-"));
    mkdirSync(path.join(outside, "escaped"));
    writeFileSync(path.join(outside, "escaped", "SKILL.md"), "secret external content");
    symlinkSync(path.join(outside, "escaped"), path.join(root, "skills", "escaped"), "dir");
    expect(() => discoverRepositorySkills({ repositoryRoot: root, sourceRevision: "git:abc123" })).toThrow(
      "SKILL_ROOT_ESCAPE",
    );
  });

  it("builds a pinned context pack and exposes only the implemented Codex/Claude harness profiles", () => {
    const root = fixtureRoot();
    const profile = buildRepositoryEngineeringProfile({
      repositoryRoot: root,
      repositoryRef: "repo:smartspecpro",
      sourceRevision: "git:abc123",
      tenantId: "tenant-acme",
      principalId: "user-42",
      artifactClass: "SKILL",
      requestedSkillIds: ["reviewer"],
    });
    expect(profile.contextPack.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(profile.harnesses.map(harness => harness.family)).toEqual(["codex", "claude_code"]);
    expect(profile.loadedSkillIds).toEqual(["reviewer"]);
    expect(profile).not.toHaveProperty("credentials");
  });

  it("fails closed for an invalid source revision", () => {
    expect(() => buildRepositoryEngineeringProfile({
      repositoryRoot: fixtureRoot(),
      repositoryRef: "repo:smartspecpro",
      sourceRevision: "working-tree",
      tenantId: "tenant-acme",
      principalId: "user-42",
      artifactClass: "SKILL",
    })).toThrow(Spec230BootstrapError);
  });
});
