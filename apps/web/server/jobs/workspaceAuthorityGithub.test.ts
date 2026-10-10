import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalGithubRepository } from "./workspaceAuthorityGithub";

const temporaryRepositories: string[] = [];

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) rmSync(repository, { recursive: true, force: true });
});

describe("workspace authority GitHub adapter", () => {
  it("reads the promisified execFile result from stdout for the canonical remote", async () => {
    const repository = mkdtempSync(path.join(os.tmpdir(), "workspace-authority-github-"));
    temporaryRepositories.push(repository);
    execFileSync("git", ["init", repository], { stdio: "ignore" });
    execFileSync("git", ["-C", repository, "remote", "add", "origin", "git@github.com:naibarn/SmartSpecPro.git"], { stdio: "ignore" });

    await expect(canonicalGithubRepository(repository)).resolves.toBe("naibarn/SmartSpecPro");
  });
});
