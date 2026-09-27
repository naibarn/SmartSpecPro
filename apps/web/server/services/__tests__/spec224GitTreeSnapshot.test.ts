import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import {
  assembleGitTreeAttestedSourceBundle,
  calculateGitTreeSourceManifestDigest,
  type GitTreeSourceManifest,
} from "../spec224SourceBundle";
import {
  materializeAttestedGitTreeSnapshot,
  verifyAttestedGitTreeSnapshot,
} from "../spec224GitTreeSnapshot";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

async function makeGitSource() {
  const root = await mkdtemp(join(tmpdir(), "spec224-git-snapshot-"));
  temporaryRoots.push(root);
  await execFileAsync("git", ["init", root]);
  await execFileAsync("git", [
    "-C",
    root,
    "config",
    "user.email",
    "spec224@example.invalid",
  ]);
  await execFileAsync("git", [
    "-C",
    root,
    "config",
    "user.name",
    "Spec 224 Snapshot Test",
  ]);
  await mkdir(join(root, "source", "bin"), { recursive: true });
  await writeFile(
    join(root, "source", "main.ts"),
    "export const committed = true;\n"
  );
  await writeFile(
    join(root, "source", "bin", "run.sh"),
    "#!/bin/sh\necho committed\n"
  );
  await writeFile(
    join(root, "source", "package.json"),
    JSON.stringify({ name: "spec224-snapshot-fixture", version: "1.0.0" })
  );
  await writeFile(
    join(root, "source", "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\nsettings: {}\nimporters:\n  .: {}\npackages: {}\n"
  );
  await chmod(join(root, "source", "bin", "run.sh"), 0o755);
  await execFileAsync("git", ["-C", root, "add", "source"]);
  await execFileAsync("git", ["-C", root, "commit", "-m", "snapshot fixture"]);
  const { stdout } = await execFileAsync("git", [
    "-C",
    root,
    "rev-parse",
    "HEAD",
  ]);
  const sourceRevision = stdout.trim();
  const files = await Promise.all(
    ["bin/run.sh", "main.ts", "package.json", "pnpm-lock.yaml"].map(
      async path => {
        const absolute = join(root, "source", path);
        const bytes = await readFile(absolute);
        const mode = path.endsWith(".sh") ? 0o755 : 0o644;
        return {
          path,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          sizeBytes: bytes.byteLength,
          mode,
        };
      }
    )
  );
  const base = {
    schemaVersion: "spec224.git-tree-source-attestation.v1" as const,
    sourceRevision,
    treePath: "source",
    files,
  };
  const manifest: GitTreeSourceManifest = {
    ...base,
    manifestDigest: calculateGitTreeSourceManifestDigest(base),
  };
  return { root, manifest };
}

async function cleanup() {
  for (const root of temporaryRoots.splice(0)) {
    await execFileAsync("chmod", ["-R", "u+w", root]).catch(() => undefined);
    const fs = await import("node:fs/promises");
    await fs.rm(root, { recursive: true, force: true });
  }
}

afterEach(cleanup);

describe("Spec 224 immutable Git-tree snapshot", () => {
  it("seals a dependency-closed bundle against an exact Git-tree attestation", async () => {
    const { root, manifest } = await makeGitSource();
    const destination = join(root, "..", `attested-bundle-${Date.now()}`);
    temporaryRoots.push(destination);
    const result = await assembleGitTreeAttestedSourceBundle({
      repositoryRoot: root,
      sourceRoot: join(root, "source"),
      destination,
      sourceManifest: manifest,
      sourceRevision: manifest.sourceRevision,
      specDigest: "a".repeat(64),
      closure: {
        entryPaths: ["main.ts"],
        dependencyArtifacts: ["pnpm-lock.yaml"],
        workspaceManifestPaths: ["package.json"],
        profileId: "spec224-source-only-test",
        runtimeIdentity: {
          node: "22.22.0",
          packageManager: "pnpm@10.4.1",
          platform: "linux-x64",
        },
      },
    });
    expect(result.sourceManifestDigest).toBe(manifest.manifestDigest);
    expect(result.bundle.sourceTreeAttestation).toEqual({
      treePath: manifest.treePath,
      manifestDigest: manifest.manifestDigest,
    });
    expect(result.bundle.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "main.ts", mode: 0o644 }),
        expect.objectContaining({ path: "package.json", mode: 0o644 }),
        expect.objectContaining({ path: "pnpm-lock.yaml", mode: 0o644 }),
      ])
    );
  });

  it("rejects source bytes that differ from the attested Git tree", async () => {
    const { root, manifest } = await makeGitSource();
    const destination = join(root, "..", `mismatched-bundle-${Date.now()}`);
    temporaryRoots.push(destination);
    await writeFile(
      join(root, "source", "main.ts"),
      "export const committed = false;\n"
    );
    await expect(
      assembleGitTreeAttestedSourceBundle({
        repositoryRoot: root,
        sourceRoot: join(root, "source"),
        destination,
        sourceManifest: manifest,
        sourceRevision: manifest.sourceRevision,
        specDigest: "a".repeat(64),
        closure: {
          entryPaths: ["main.ts"],
          dependencyArtifacts: ["pnpm-lock.yaml"],
          workspaceManifestPaths: ["package.json"],
          profileId: "spec224-source-only-test",
          runtimeIdentity: {
            node: "22.22.0",
            packageManager: "pnpm@10.4.1",
            platform: "linux-x64",
          },
        },
      })
    ).rejects.toThrow("SPEC224_BUNDLE_SOURCE_TREE_FILE_MISMATCH:main.ts");
  });

  it("materializes committed blob bytes and modes, not later working-tree edits", async () => {
    const { root, manifest } = await makeGitSource();
    const destination = join(root, "..", `snapshot-${Date.now()}`);
    temporaryRoots.push(destination);

    await writeFile(
      join(root, "source", "main.ts"),
      "export const committed = false;\n"
    );
    const result = await materializeAttestedGitTreeSnapshot({
      repositoryRoot: root,
      manifest,
      destination,
    });

    expect(result).toMatchObject({
      sourceRevision: manifest.sourceRevision,
      sourceManifestDigest: manifest.manifestDigest,
      admissionEligible: false,
      fileCount: 4,
    });
    expect(await readFile(join(destination, "main.ts"), "utf8")).toBe(
      "export const committed = true;\n"
    );
    await expect(
      (await import("node:fs/promises"))
        .stat(join(destination, "main.ts"))
        .then(stat => stat.mode & 0o777)
    ).resolves.toBe(0o444);
    expect(
      await verifyAttestedGitTreeSnapshot(destination, {
        sourceRevision: manifest.sourceRevision,
        sourceManifestDigest: manifest.manifestDigest,
      })
    ).toMatchObject({ valid: true, integrityOnly: true });
  });

  it("requires the caller's trusted source revision and manifest digest", async () => {
    const { root, manifest } = await makeGitSource();
    const destination = join(root, "..", `snapshot-trust-${Date.now()}`);
    temporaryRoots.push(destination);
    await materializeAttestedGitTreeSnapshot({
      repositoryRoot: root,
      manifest,
      destination,
    });
    expect(
      await verifyAttestedGitTreeSnapshot(destination, {
        sourceRevision: "f".repeat(40),
        sourceManifestDigest: manifest.manifestDigest,
      })
    ).toMatchObject({
      valid: false,
      integrityOnly: true,
      reason: "SPEC224_GIT_SNAPSHOT_TRUSTED_BASELINE_MISMATCH",
    });
  });

  it("rejects a tampered snapshot and never replaces an existing destination", async () => {
    const { root, manifest } = await makeGitSource();
    const destination = join(root, "..", `snapshot-tamper-${Date.now()}`);
    temporaryRoots.push(destination);
    await materializeAttestedGitTreeSnapshot({
      repositoryRoot: root,
      manifest,
      destination,
    });
    await chmod(join(destination, "main.ts"), 0o644);
    await writeFile(join(destination, "main.ts"), "tampered\n");
    expect(
      await verifyAttestedGitTreeSnapshot(destination, {
        sourceRevision: manifest.sourceRevision,
        sourceManifestDigest: manifest.manifestDigest,
      })
    ).toMatchObject({ valid: false, integrityOnly: true });
    await expect(
      materializeAttestedGitTreeSnapshot({
        repositoryRoot: root,
        manifest,
        destination,
      })
    ).rejects.toThrow("SPEC224_GIT_SNAPSHOT_DESTINATION_EXISTS");
  });

  it("rejects a symlink substituted for a snapshot file without following its target", async () => {
    const { root, manifest } = await makeGitSource();
    const destination = join(root, "..", `snapshot-symlink-${Date.now()}`);
    const outside = join(root, "..", `snapshot-outside-${Date.now()}`);
    temporaryRoots.push(destination, outside);
    await materializeAttestedGitTreeSnapshot({
      repositoryRoot: root,
      manifest,
      destination,
    });
    await writeFile(outside, "outside sentinel\n");
    await chmod(destination, 0o755);
    await rm(join(destination, "main.ts"));
    await symlink(outside, join(destination, "main.ts"));
    await chmod(destination, 0o555);

    expect(
      await verifyAttestedGitTreeSnapshot(destination, {
        sourceRevision: manifest.sourceRevision,
        sourceManifestDigest: manifest.manifestDigest,
      })
    ).toMatchObject({
      valid: false,
      integrityOnly: true,
      reason: "SPEC224_GIT_SNAPSHOT_SYMLINK_REJECTED",
    });
    expect(await readFile(outside, "utf8")).toBe("outside sentinel\n");
  });
});
