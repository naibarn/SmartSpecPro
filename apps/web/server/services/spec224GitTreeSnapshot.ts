import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  open,
  type FileHandle,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { promisify } from "node:util";

import {
  attestGitTreeSourceManifest,
  type GitTreeSourceManifest,
} from "./spec224SourceBundle";

const execFileAsync = promisify(execFile);
const SNAPSHOT_MANIFEST = ".spec224-git-tree-snapshot.json";
const DIRECTORY_FLAGS =
  fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;
const READ_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;
const WRITE_FLAGS =
  fsConstants.O_WRONLY |
  fsConstants.O_CREAT |
  fsConstants.O_EXCL |
  fsConstants.O_NOFOLLOW;
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
  if (value === SNAPSHOT_MANIFEST)
    throw new Error("SPEC224_GIT_SNAPSHOT_RESERVED_PATH");
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

function descriptorPath(handle: FileHandle): string {
  if (
    process.platform !== "linux" ||
    !Number.isInteger(handle.fd) ||
    handle.fd < 0
  ) {
    throw new Error("SPEC224_GIT_SNAPSHOT_DESCRIPTOR_PATH_UNSUPPORTED");
  }
  return `/proc/self/fd/${handle.fd}`;
}

function sameIdentity(
  left: { dev: number; ino: number },
  right: { dev: number; ino: number }
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function openDirectoryAt(
  parent: FileHandle,
  name: string
): Promise<FileHandle> {
  const path = join(descriptorPath(parent), name);
  const before = await lstat(path).catch(() => null);
  if (!before?.isDirectory() || before.isSymbolicLink())
    throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_INVALID");
  const handle = await open(path, DIRECTORY_FLAGS).catch(() => {
    throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_OPEN_FAILED");
  });
  const opened = await handle.stat();
  const after = await lstat(path).catch(() => null);
  if (
    !after?.isDirectory() ||
    after.isSymbolicLink() ||
    !sameIdentity(before, opened) ||
    !sameIdentity(opened, after)
  ) {
    await handle.close();
    throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_CHANGED");
  }
  return handle;
}

async function readFileAt(
  parent: FileHandle,
  name: string,
  expectedMode: number
): Promise<Buffer> {
  const path = join(descriptorPath(parent), name);
  const before = await lstat(path).catch(() => null);
  if (!before?.isFile() || before.isSymbolicLink())
    throw new Error("SPEC224_GIT_SNAPSHOT_FILE_INVALID");
  const handle = await open(path, READ_FLAGS).catch(() => {
    throw new Error("SPEC224_GIT_SNAPSHOT_FILE_OPEN_FAILED");
  });
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      !sameIdentity(before, opened) ||
      (opened.mode & 0o777) !== expectedMode
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_FILE_CHANGED");
    const bytes = await handle.readFile();
    const afterRead = await handle.stat();
    const afterPath = await lstat(path).catch(() => null);
    if (
      !afterPath?.isFile() ||
      afterPath.isSymbolicLink() ||
      !sameIdentity(opened, afterRead) ||
      !sameIdentity(afterRead, afterPath) ||
      afterRead.size !== bytes.byteLength ||
      (afterRead.mode & 0o777) !== expectedMode
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_FILE_CHANGED");
    return bytes;
  } finally {
    await handle.close();
  }
}

async function writeFileAt(
  root: FileHandle,
  path: string,
  bytes: Buffer,
  mode: number
): Promise<void> {
  const segments = relativeSourcePath(path).split("/");
  const openedDirectories: FileHandle[] = [];
  let parent = root;
  try {
    for (const segment of segments.slice(0, -1)) {
      const childPath = join(descriptorPath(parent), segment);
      try {
        await mkdir(childPath, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const child = await openDirectoryAt(parent, segment);
      if (((await child.stat()).mode & 0o777) !== 0o700) {
        await child.close();
        throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_MODE_MISMATCH");
      }
      openedDirectories.push(child);
      parent = child;
    }
    const target = join(descriptorPath(parent), segments.at(-1)!);
    const file = await open(target, WRITE_FLAGS, mode).catch(() => {
      throw new Error("SPEC224_GIT_SNAPSHOT_FILE_CREATE_FAILED");
    });
    try {
      await file.writeFile(bytes);
      await file.chmod(mode);
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size !== bytes.byteLength ||
        (stat.mode & 0o777) !== mode
      )
        throw new Error("SPEC224_GIT_SNAPSHOT_FILE_WRITE_FAILED");
    } finally {
      await file.close();
    }
  } finally {
    for (const handle of openedDirectories.reverse()) await handle.close();
  }
}

async function sealDirectories(root: FileHandle): Promise<void> {
  const seal = async (directory: FileHandle): Promise<void> => {
    const names = await readdir(descriptorPath(directory));
    for (const name of names) {
      if (name === SNAPSHOT_MANIFEST) continue;
      const stat = await lstat(join(descriptorPath(directory), name));
      if (stat.isSymbolicLink())
        throw new Error("SPEC224_GIT_SNAPSHOT_SYMLINK_REJECTED");
      if (stat.isDirectory()) {
        const child = await openDirectoryAt(directory, name);
        try {
          await seal(child);
          await child.chmod(0o555);
        } finally {
          await child.close();
        }
      }
    }
  };
  await seal(root);
  await root.chmod(0o555);
}

async function verifySnapshotRoot(
  root: string
): Promise<AttestedGitTreeSnapshotResult> {
  if (process.platform !== "linux")
    throw new Error("SPEC224_GIT_SNAPSHOT_DESCRIPTOR_PATH_UNSUPPORTED");
  const absoluteRoot = resolve(root);
  const rootBefore = await lstat(absoluteRoot);
  if (
    !rootBefore.isDirectory() ||
    rootBefore.isSymbolicLink() ||
    (rootBefore.mode & 0o777) !== 0o555
  )
    throw new Error("SPEC224_GIT_SNAPSHOT_ROOT_INVALID");
  if ((await realpath(absoluteRoot)) !== absoluteRoot)
    throw new Error("SPEC224_GIT_SNAPSHOT_ROOT_INVALID");
  const rootHandle = await open(absoluteRoot, DIRECTORY_FLAGS).catch(() => {
    throw new Error("SPEC224_GIT_SNAPSHOT_ROOT_OPEN_FAILED");
  });
  try {
    const rootOpened = await rootHandle.stat();
    if (
      !sameIdentity(rootBefore, rootOpened) ||
      (rootOpened.mode & 0o777) !== 0o555
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_ROOT_CHANGED");
    let parsed: AttestedGitTreeSnapshotManifest;
    try {
      parsed = JSON.parse(
        (await readFileAt(rootHandle, SNAPSHOT_MANIFEST, 0o444)).toString(
          "utf8"
        )
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
    const actual = new Map<string, { bytes: Buffer; mode: number }>();
    const walk = async (directory: FileHandle, prefix = ""): Promise<void> => {
      const beforeNames = (await readdir(descriptorPath(directory))).sort();
      for (const name of beforeNames) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (!prefix && name === SNAPSHOT_MANIFEST) continue;
        const childPath = join(descriptorPath(directory), name);
        const before = await lstat(childPath);
        if (before.isSymbolicLink())
          throw new Error("SPEC224_GIT_SNAPSHOT_SYMLINK_REJECTED");
        if (before.isDirectory()) {
          if ((before.mode & 0o777) !== 0o555)
            throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_MODE_MISMATCH");
          const child = await openDirectoryAt(directory, name);
          try {
            if (((await child.stat()).mode & 0o777) !== 0o555)
              throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_MODE_MISMATCH");
            await walk(child, path);
            const afterOpen = await child.stat();
            const afterPath = await lstat(childPath);
            if (
              !afterPath.isDirectory() ||
              afterPath.isSymbolicLink() ||
              !sameIdentity(afterOpen, afterPath)
            )
              throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_CHANGED");
          } finally {
            await child.close();
          }
        } else if (before.isFile()) {
          const mode = before.mode & 0o777;
          actual.set(path, {
            bytes: await readFileAt(directory, name, mode),
            mode,
          });
        } else {
          throw new Error("SPEC224_GIT_SNAPSHOT_FILE_TYPE_UNSUPPORTED");
        }
      }
      const afterNames = (await readdir(descriptorPath(directory))).sort();
      if (
        beforeNames.length !== afterNames.length ||
        beforeNames.some((name, index) => name !== afterNames[index])
      )
        throw new Error("SPEC224_GIT_SNAPSHOT_DIRECTORY_CHANGED");
    };
    await walk(rootHandle);
    const actualPaths = [...actual.keys()].sort();
    const expectedPaths = [...expected.keys()].sort();
    if (
      actualPaths.length !== expectedPaths.length ||
      actualPaths.some((path, index) => path !== expectedPaths[index])
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_FILE_SET_MISMATCH");
    for (const path of actualPaths) {
      const file = expected.get(path)!;
      const actualFile = actual.get(path)!;
      const expectedMode = file.mode === 0o755 ? 0o555 : 0o444;
      if (actualFile.mode !== expectedMode)
        throw new Error("SPEC224_GIT_SNAPSHOT_FILE_MODE_MISMATCH");
      if (
        actualFile.bytes.byteLength !== file.sizeBytes ||
        digest(actualFile.bytes) !== file.sha256
      )
        throw new Error("SPEC224_GIT_SNAPSHOT_FILE_DIGEST_MISMATCH");
    }
    const rootAfter = await rootHandle.stat();
    const rootPathAfter = await lstat(absoluteRoot);
    if (
      !rootPathAfter.isDirectory() ||
      rootPathAfter.isSymbolicLink() ||
      !sameIdentity(rootOpened, rootAfter) ||
      !sameIdentity(rootAfter, rootPathAfter)
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_ROOT_CHANGED");
    return {
      valid: true,
      integrityOnly: true,
      sourceRevision: parsed.sourceRevision,
      sourceManifestDigest: parsed.sourceManifestDigest,
      snapshotDigest: parsed.snapshotDigest,
      fileCount: parsed.files.length,
      admissionEligible: false,
    };
  } finally {
    await rootHandle.close();
  }
}

/** Materializes a read-only snapshot from immutable Git blobs; it is not a complete dependency bundle or runtime admission. */
export async function materializeAttestedGitTreeSnapshot(input: {
  repositoryRoot: string;
  manifest: GitTreeSourceManifest;
  destination: string;
}): Promise<AttestedGitTreeSnapshotResult> {
  if (process.platform !== "linux")
    throw new Error("SPEC224_GIT_SNAPSHOT_DESCRIPTOR_PATH_UNSUPPORTED");
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
  const parentHandle = await open(parent, DIRECTORY_FLAGS).catch(() => {
    throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_PARENT_INVALID");
  });
  try {
    const openedParent = await parentHandle.stat();
    const currentParent = await lstat(parent);
    if (
      !sameIdentity(openedParent, currentParent) ||
      (await realpath(parent)) !== parent
    )
      throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_PARENT_CHANGED");
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
    const destinationName = basename(destination);
    if (!destinationName || destinationName === "." || destinationName === "..")
      throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_INVALID");
    await mkdir(join(descriptorPath(parentHandle), destinationName), {
      recursive: false,
      mode: 0o700,
    }).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_EXISTS");
      throw error;
    });
    const rootHandle = await openDirectoryAt(parentHandle, destinationName);
    try {
      for (const [index, file] of snapshotManifest.files.entries()) {
        await writeFileAt(
          rootHandle,
          file.path,
          files[index],
          file.mode === 0o755 ? 0o555 : 0o444
        );
      }
      const manifestHandle = await open(
        join(descriptorPath(rootHandle), SNAPSHOT_MANIFEST),
        WRITE_FLAGS,
        0o444
      ).catch(() => {
        throw new Error("SPEC224_GIT_SNAPSHOT_MANIFEST_WRITE_FAILED");
      });
      try {
        await manifestHandle.writeFile(`${canonicalJson(snapshotManifest)}\n`);
        await manifestHandle.chmod(0o444);
      } finally {
        await manifestHandle.close();
      }
      await sealDirectories(rootHandle);
      const rootAfterSeal = await rootHandle.stat();
      const pathAfterSeal = await lstat(destination).catch(() => null);
      if (
        !pathAfterSeal?.isDirectory() ||
        pathAfterSeal.isSymbolicLink() ||
        !sameIdentity(rootAfterSeal, pathAfterSeal) ||
        (await realpath(parent)) !== parent
      )
        throw new Error("SPEC224_GIT_SNAPSHOT_DESTINATION_CHANGED");
      return await verifySnapshotRoot(destination);
    } finally {
      await rootHandle.close();
    }
  } finally {
    await parentHandle.close();
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
