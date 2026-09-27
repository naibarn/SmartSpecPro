import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import {
  attestGitTreeSourceManifest,
  type GitTreeSourceManifest,
} from "./spec224SourceBundle";

const execFileAsync = promisify(execFile);
const SNAPSHOT_MANIFEST = ".spec224-git-tree-snapshot.json";
const SECRET_PATH_SEGMENT =
  /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.pypirc|credentials\..*|secrets\..*)$/i;

export type AttestedGitTreeSnapshotManifest = {
  schemaVersion: "spec224.git-tree-snapshot.v1";
  admissionEligible: false;
  sourceRevision: string;
  treePath: string;
  sourceManifestDigest: string;
  files: GitTreeSourceManifest["files"];
  snapshotDigest: string;
};

export type AttestedGitTreeSnapshotResult = {
  valid: true;
  integrityOnly: true;
  sourceRevision: string;
  sourceManifestDigest: string;
  snapshotDigest: string;
  fileCount: number;
  admissionEligible: false;
};

function digest(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
    );
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function relativeSourcePath(value: string): string {
  if (
    !value ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("\0")
  )
    throw new Error("SPEC224_GIT_SNAPSHOT_PATH_INVALID");
  const segments = value.split("/");
  if (
    segments.some(
      segment =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        SECRET_PATH_SEGMENT.test(segment) ||
        /\.(?:pem|key)$/i.test(segment) ||
        /^(?:id_rsa|id_ed25519)$/i.test(segment)
    )
  ) {
    throw new Error("SPEC224_GIT_SNAPSHOT_PATH_REJECTED");
  }
  return value;
}

async function git(repositoryRoot: string, args: string[]): Promise<Buffer> {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  try {
    const result = await execFileAsync(
      "git",
      ["--no-replace-objects", "-C", repositoryRoot, ...args],
      {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
        env,
      }
    );
    return result.stdout as Buffer;
  } catch {
    throw new Error("SPEC224_GIT_SNAPSHOT_GIT_READ_FAILED");
  }
}

async function gitText(
  repositoryRoot: string,
  args: string[]
): Promise<string> {
  return (await git(repositoryRoot, args)).toString("utf8").trim();
}

type TreeBlob = { mode: string; objectId: string; path: string };

function parseTree(raw: Buffer, treePath: string): TreeBlob[] {
  const prefix = treePath === "." ? "" : `${treePath}/`;
  const entries: TreeBlob[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const end = raw.indexOf(0, offset);
    if (end < 0) throw new Error("SPEC224_GIT_SNAPSHOT_TREE_INVALID");
    const record = raw.subarray(offset, end);
    offset = end + 1;
    if (!record.length) continue;
    const text = record.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(record))
      throw new Error("SPEC224_GIT_SNAPSHOT_PATH_INVALID");
    const match = text.match(
      /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)\t(.+)$/i
    );
    if (!match) throw new Error("SPEC224_GIT_SNAPSHOT_UNSUPPORTED_TREE_ENTRY");
    const [, mode, objectId, fullPath] = match;
    if (!fullPath.startsWith(prefix))
      throw new Error("SPEC224_GIT_SNAPSHOT_TREE_INVALID");
    entries.push({
      mode,
      objectId,
      path: relativeSourcePath(fullPath.slice(prefix.length)),
    });
  }
  return entries.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
}

function snapshotBase(
  manifest:
    | Omit<AttestedGitTreeSnapshotManifest, "snapshotDigest">
    | AttestedGitTreeSnapshotManifest
) {
  return {
    schemaVersion: manifest.schemaVersion,
    admissionEligible: false as const,
    sourceRevision: manifest.sourceRevision,
    treePath: manifest.treePath,
    sourceManifestDigest: manifest.sourceManifestDigest,
    files: manifest.files.map(file => ({
      path: file.path,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      mode: file.mode,
    })),
  };
}

function expectedSnapshotDigest(
  manifest:
    | Omit<AttestedGitTreeSnapshotManifest, "snapshotDigest">
    | AttestedGitTreeSnapshotManifest
): string {
  return digest(canonicalJson(snapshotBase(manifest)));
}

async function removeOwnedTree(path: string): Promise<void> {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return;
  if (stat.isSymbolicLink()) {
    await rm(path);
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of await readdir(path))
      await removeOwnedTree(join(path, entry));
    await chmod(path, 0o700).catch(() => undefined);
  } else {
    await chmod(path, 0o600).catch(() => undefined);
  }
  await rm(path);
}

async function verifySnapshotRoot(
  root: string
): Promise<AttestedGitTreeSnapshotResult> {
  const rootStat = await lstat(root);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    (rootStat.mode & 0o777) !== 0o555
  )
    throw new Error("SPEC224_GIT_SNAPSHOT_ROOT_INVALID");
  const manifestStat = await lstat(join(root, SNAPSHOT_MANIFEST));
  if (
    !manifestStat.isFile() ||
    manifestStat.isSymbolicLink() ||
    (manifestStat.mode & 0o777) !== 0o444
  )
    throw new Error("SPEC224_GIT_SNAPSHOT_MANIFEST_INVALID");
  let parsed: AttestedGitTreeSnapshotManifest;
  try {
    parsed = JSON.parse(
      await readFile(join(root, SNAPSHOT_MANIFEST), "utf8")
    ) as AttestedGitTreeSnapshotManifest;
  } catch {
    throw new Error("SPEC224_GIT_SNAPSHOT_MANIFEST_INVALID");
  }
  if (
    parsed.schemaVersion !== "spec224.git-tree-snapshot.v1" ||
    parsed.admissionEligible !== false ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(parsed.sourceRevision) ||
    !/^[a-f0-9]{64}$/i.test(parsed.sourceManifestDigest) ||
    parsed.snapshotDigest !== expectedSnapshotDigest(parsed)
  ) {
    throw new Error("SPEC224_GIT_SNAPSHOT_MANIFEST_INVALID");
  }
  if (!Array.isArray(parsed.files) || !parsed.files.length)
    throw new Error("SPEC224_GIT_SNAPSHOT_FILE_SET_INVALID");
  const expected = new Map<string, GitTreeSourceManifest["files"][number]>();
  for (const file of parsed.files) {
    const path = relativeSourcePath(file.path);
    if (
      expected.has(path) ||
      !/^[a-f0-9]{64}$/i.test(file.sha256) ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 0 ||
      ![0o644, 0o755].includes(file.mode)
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_MANIFEST_INVALID");
    expected.set(path, file);
  }
  const actual: string[] = [];
  const walk = async (directory: string, prefix = ""): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (!prefix && name === SNAPSHOT_MANIFEST) continue;
      const stat = await lstat(join(directory, name));
      if (stat.isSymbolicLink())
        throw new Error("SPEC224_GIT_SNAPSHOT_SYMLINK_REJECTED");
      if (stat.isDirectory()) {
        if ((stat.mode & 0o777) !== 0o555)
          throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_MODE_MISMATCH");
        await walk(join(directory, name), path);
      } else if (stat.isFile()) actual.push(path);
      else throw new Error("SPEC224_GIT_SNAPSHOT_FILE_TYPE_UNSUPPORTED");
    }
  };
  await walk(root);
  actual.sort();
  const expectedPaths = [...expected.keys()].sort();
  if (
    actual.length !== expectedPaths.length ||
    actual.some((path, index) => path !== expectedPaths[index])
  )
    throw new Error("SPEC224_GIT_SNAPSHOT_FILE_SET_MISMATCH");
  for (const path of actual) {
    const file = expected.get(path)!;
    const stat = await lstat(join(root, path));
    const expectedMode = file.mode === 0o755 ? 0o555 : 0o444;
    const bytes = await readFile(join(root, path));
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o777) !== expectedMode
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_FILE_MODE_MISMATCH");
    if (bytes.byteLength !== file.sizeBytes || digest(bytes) !== file.sha256)
      throw new Error("SPEC224_GIT_SNAPSHOT_FILE_DIGEST_MISMATCH");
  }
  return {
    valid: true,
    integrityOnly: true,
    sourceRevision: parsed.sourceRevision,
    sourceManifestDigest: parsed.sourceManifestDigest,
    snapshotDigest: parsed.snapshotDigest,
    fileCount: parsed.files.length,
    admissionEligible: false,
  };
}

/** Materializes a read-only snapshot from immutable Git blobs; it is not a complete dependency bundle or runtime admission. */
export async function materializeAttestedGitTreeSnapshot(input: {
  repositoryRoot: string;
  manifest: GitTreeSourceManifest;
  destination: string;
}): Promise<AttestedGitTreeSnapshotResult> {
  await attestGitTreeSourceManifest({
    repositoryRoot: input.repositoryRoot,
    manifest: input.manifest,
  });
  const repositoryRoot = await realpath(input.repositoryRoot);
  const destination = resolve(input.destination);
  const parent = dirname(destination);
  const parentStat = await lstat(parent).catch(() => null);
  if (!parentStat?.isDirectory() || parentStat.isSymbolicLink())
    throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_PARENT_INVALID");
  const realParent = await realpath(parent);
  if (realParent !== parent)
    throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_PARENT_INVALID");
  const destinationRelative = relative(repositoryRoot, destination);
  if (
    destinationRelative === "" ||
    (!destinationRelative.startsWith(`..${sep}`) &&
      destinationRelative !== "..")
  )
    throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_INSIDE_REPOSITORY");
  if (await lstat(destination).catch(() => null))
    throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_EXISTS");
  const treeOutput = await git(repositoryRoot, [
    "ls-tree",
    "-rz",
    "--full-tree",
    input.manifest.sourceRevision,
    "--",
    input.manifest.treePath,
  ]);
  const entries = parseTree(treeOutput, input.manifest.treePath);
  if (
    entries.length !== input.manifest.files.length ||
    entries.some(
      (entry, index) => entry.path !== input.manifest.files[index]?.path
    )
  )
    throw new Error("SPEC224_GIT_SNAPSHOT_FILE_SET_MISMATCH");
  const files: Buffer[] = [];
  for (const [index, entry] of entries.entries()) {
    const expected = input.manifest.files[index];
    const bytes = await git(repositoryRoot, [
      "cat-file",
      "blob",
      entry.objectId,
    ]);
    if (
      digest(bytes) !== expected.sha256 ||
      bytes.byteLength !== expected.sizeBytes ||
      Number.parseInt(entry.mode, 8) !== 0o100000 + expected.mode
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_SOURCE_MISMATCH");
    files.push(bytes);
  }
  const base = {
    schemaVersion: "spec224.git-tree-snapshot.v1" as const,
    admissionEligible: false as const,
    sourceRevision: input.manifest.sourceRevision,
    treePath: input.manifest.treePath,
    sourceManifestDigest: input.manifest.manifestDigest,
    files: input.manifest.files.map(file => ({ ...file })),
  };
  const snapshotManifest: AttestedGitTreeSnapshotManifest = {
    ...base,
    snapshotDigest: expectedSnapshotDigest(base),
  };
  await mkdir(destination, { recursive: false, mode: 0o700 }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_EXISTS");
    throw error;
  });
  try {
    for (const [index, file] of snapshotManifest.files.entries()) {
      const full = join(destination, file.path);
      const rel = relative(destination, full);
      if (!rel || rel === ".." || rel.startsWith(`..${sep}`))
        throw new Error("SPEC224_GIT_SNAPSHOT_PATH_INVALID");
      await mkdir(dirname(full), { recursive: true, mode: 0o700 });
      await writeFile(full, files[index], {
        flag: "wx",
        mode: file.mode === 0o755 ? 0o555 : 0o444,
      });
      await chmod(full, file.mode === 0o755 ? 0o555 : 0o444);
    }
    await writeFile(
      join(destination, SNAPSHOT_MANIFEST),
      `${canonicalJson(snapshotManifest)}\n`,
      { flag: "wx", mode: 0o444 }
    );
    const directories: string[] = [];
    const collect = async (directory: string): Promise<void> => {
      for (const name of await readdir(directory)) {
        if (name === SNAPSHOT_MANIFEST) continue;
        const child = join(directory, name);
        if ((await lstat(child)).isDirectory()) {
          await collect(child);
          directories.push(child);
        }
      }
    };
    await collect(destination);
    for (const directory of directories.reverse())
      await chmod(directory, 0o555);
    await chmod(destination, 0o555);
    return await verifySnapshotRoot(destination);
  } catch (error) {
    await removeOwnedTree(destination).catch(() => undefined);
    throw error;
  }
}

/** Verifies bytes and read-only modes only; it does not prove dependency closure or runtime isolation. */
export async function verifyAttestedGitTreeSnapshot(
  path: string,
  expected: { sourceRevision: string; sourceManifestDigest: string }
): Promise<
  | AttestedGitTreeSnapshotResult
  | { valid: false; integrityOnly: true; reason: string }
> {
  try {
    const actual = await verifySnapshotRoot(resolve(path));
    if (
      actual.sourceRevision !== expected.sourceRevision.toLowerCase() ||
      actual.sourceManifestDigest !==
        expected.sourceManifestDigest.toLowerCase()
    ) {
      throw new Error("SPEC224_GIT_SNAPSHOT_TRUSTED_BASELINE_MISMATCH");
    }
    return actual;
  } catch (error) {
    return {
      valid: false,
      integrityOnly: true,
      reason:
        error instanceof Error ? error.message : "SPEC224_GIT_SNAPSHOT_INVALID",
    };
  }
}
