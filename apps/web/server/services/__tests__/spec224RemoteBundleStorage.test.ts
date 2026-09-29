import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { verifyBundle } = vi.hoisted(() => ({ verifyBundle: vi.fn() }));
vi.mock("../spec224TrustedSourceAttestation", () => ({
  verifyLocalSpec224SourceBundle: verifyBundle,
}));

import {
  createSpec224LocalTestStorageTarget,
  createSpec224BundleReaderFromEnvironment,
  createSpec224BundleWriterFromEnvironment,
  storeVerifiedSpec224Bundle,
  validateSpec224RemoteBundleRunBinding,
  type Spec224ContentAddressedWriter,
} from "../spec224RemoteBundleStorage";

const hash = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");

function localWriter(): Spec224ContentAddressedWriter {
  const objects = new Map<string, Buffer>();
  return {
    putIfAbsent: async (namespace, bytes) => {
      const digest = hash(bytes);
      const key = `${namespace}/sha256/${digest}`;
      const existing = objects.get(key);
      if (existing && !existing.equals(bytes)) {
        throw new Error("LOCAL_TEST_CONTENT_ADDRESS_CONFLICT");
      }
      objects.set(key, Buffer.from(bytes));
      return { key, sha256: digest };
    },
  };
}

function localTarget(writer = localWriter()) {
  return createSpec224LocalTestStorageTarget(writer);
}

describe("Spec 224 remote bundle object preparation", () => {
  let root: string;

  afterEach(async () => {
    verifyBundle.mockReset();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("derives profile/bundle object keys and only returns readback-level evidence", async () => {
    root = await mkdtemp(join(tmpdir(), "spec224-remote-bundle-"));
    const content = Buffer.from("sealed source file");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "main.ts"), content);
    await chmod(join(root, "src", "main.ts"), 0o444);
    const manifest = {
      schemaVersion: "spec224.source-bundle.v2",
      profileId: "spec224-test-profile",
      profileDigest: "a".repeat(64),
      bundleDigest: "b".repeat(64),
      sourceRevision: "c".repeat(40),
      specDigest: "f".repeat(64),
      files: [
        {
          path: "src/main.ts",
          sha256: hash(content),
          sizeBytes: content.length,
          mode: 0o444,
        },
      ],
    };
    await writeFile(
      join(root, ".spec224-source-bundle.json"),
      JSON.stringify(manifest)
    );
    await chmod(join(root, ".spec224-source-bundle.json"), 0o444);
    verifyBundle.mockResolvedValue({
      bundleRoot: root,
      manifest,
      profileDigest: manifest.profileDigest,
      sourceTree: "1".repeat(40),
      sourceManifestDigest: "2".repeat(64),
      specSourceDigest: "3".repeat(64),
      specBaselineId: "baseline:test",
      artifactEvidenceDigest: "d".repeat(64),
    });

    const target = localTarget();
    const result = await storeVerifiedSpec224Bundle({
      bundlePath: root,
      target,
    });
    const duplicate = await storeVerifiedSpec224Bundle({
      bundlePath: root,
      target,
    });

    expect(result.evidence).toMatchObject({
      profileDigest: manifest.profileDigest,
      bundleDigest: manifest.bundleDigest,
      conditionalCreateMethod: "LOCAL_TEST_ADAPTER",
      writerRoleClass: "TEST_ADAPTER",
      runtimeRoleClass: "NOT_CONFIGURED",
      runtimeMutationDenied: "NOT_TESTED",
      runtimeDeleteDenied: "NOT_TESTED",
      trustLevel: "LOCAL_TEST_ONLY",
    });
    expect(result.evidence.objectKey).toContain(
      `spec224/profiles/${manifest.profileDigest}/bundles/${manifest.bundleDigest}/index/sha256/`
    );
    expect(result.evidence.observedSha256).toBe(
      result.evidence.objectKey.split("/sha256/").at(-1)
    );
    expect(result.index.files).toHaveLength(2);
    expect(result.index.specDigest).toBe(manifest.specDigest);
    expect(result.index.files[0]!.path).toBe(".spec224-source-bundle.json");
    expect(result.index.files[1]!.path).toBe("src/main.ts");
    expect(duplicate.index).toEqual(result.index);
    expect(duplicate.evidence.objectKey).toBe(result.evidence.objectKey);
    expect(duplicate.evidence.trustLevel).toBe("LOCAL_TEST_ONLY");
  });

  it("rejects a file whose bytes changed after bundle verification", async () => {
    root = await mkdtemp(join(tmpdir(), "spec224-remote-bundle-tamper-"));
    await writeFile(join(root, "source.ts"), "mutated after verification");
    await chmod(join(root, "source.ts"), 0o444);
    const manifest = {
      schemaVersion: "spec224.source-bundle.v2",
      profileId: "spec224-test-profile",
      profileDigest: "a".repeat(64),
      bundleDigest: "b".repeat(64),
      sourceRevision: "c".repeat(40),
      specDigest: "f".repeat(64),
      files: [
        {
          path: "source.ts",
          sha256: "e".repeat(64),
          sizeBytes: 12,
          mode: 0o444,
        },
      ],
    };
    await writeFile(
      join(root, ".spec224-source-bundle.json"),
      JSON.stringify(manifest)
    );
    await chmod(join(root, ".spec224-source-bundle.json"), 0o444);
    verifyBundle.mockResolvedValue({
      bundleRoot: root,
      manifest,
      profileDigest: manifest.profileDigest,
      sourceTree: "1".repeat(40),
      sourceManifestDigest: "2".repeat(64),
      specSourceDigest: "3".repeat(64),
      specBaselineId: "baseline:test",
      artifactEvidenceDigest: "d".repeat(64),
    });
    const target = localTarget();

    await expect(
      storeVerifiedSpec224Bundle({
        bundlePath: root,
        target,
      })
    ).rejects.toThrow("SPEC224_REMOTE_BUNDLE_FILE_MISMATCH");
  });

  it("rejects malformed profile digests before any object write", async () => {
    root = await mkdtemp(join(tmpdir(), "spec224-remote-bundle-deny-"));
    const manifest = {
      schemaVersion: "spec224.source-bundle.v2",
      profileId: "spec224-test-profile",
      profileDigest: "../escape",
      bundleDigest: "b".repeat(64),
      sourceRevision: "c".repeat(40),
      specDigest: "f".repeat(64),
      files: [],
    };
    await writeFile(
      join(root, ".spec224-source-bundle.json"),
      JSON.stringify(manifest)
    );
    await chmod(join(root, ".spec224-source-bundle.json"), 0o444);
    verifyBundle.mockResolvedValue({
      bundleRoot: root,
      manifest,
      profileDigest: manifest.profileDigest,
      sourceTree: "1".repeat(40),
      sourceManifestDigest: "2".repeat(64),
      specSourceDigest: "3".repeat(64),
      specBaselineId: "baseline:test",
      artifactEvidenceDigest: "d".repeat(64),
    });

    await expect(
      storeVerifiedSpec224Bundle({
        bundlePath: root,
        target: localTarget(),
      })
    ).rejects.toThrow("SPEC224_REMOTE_BUNDLE_IDENTITY_INVALID");
  });

  it("rejects any verified-manifest field that differs from the sealed manifest", async () => {
    root = await mkdtemp(join(tmpdir(), "spec224-remote-bundle-manifest-"));
    const manifestOnDisk = {
      schemaVersion: "spec224.source-bundle.v2",
      profileId: "spec224-test-profile",
      profileDigest: "a".repeat(64),
      bundleDigest: "b".repeat(64),
      sourceRevision: "c".repeat(40),
      specDigest: "f".repeat(64),
      files: [],
    };
    await writeFile(
      join(root, ".spec224-source-bundle.json"),
      JSON.stringify(manifestOnDisk)
    );
    await chmod(join(root, ".spec224-source-bundle.json"), 0o444);
    verifyBundle.mockResolvedValue({
      bundleRoot: root,
      manifest: { ...manifestOnDisk, specDigest: "e".repeat(64) },
      profileDigest: manifestOnDisk.profileDigest,
      sourceTree: "1".repeat(40),
      sourceManifestDigest: "2".repeat(64),
      specSourceDigest: "3".repeat(64),
      specBaselineId: "baseline:test",
      artifactEvidenceDigest: "d".repeat(64),
    });

    await expect(
      storeVerifiedSpec224Bundle({
        bundlePath: root,
        target: localTarget(),
      })
    ).rejects.toThrow("SPEC224_REMOTE_BUNDLE_MANIFEST_CHANGED");
  });

  it("preserves source mode metadata while verifying read-only sealed bundle mode", async () => {
    root = await mkdtemp(join(tmpdir(), "spec224-remote-bundle-mode-"));
    const content = Buffer.from(
      "source mode is metadata, not writable bundle mode"
    );
    await writeFile(join(root, "source.ts"), content);
    await chmod(join(root, "source.ts"), 0o444);
    const manifest = {
      schemaVersion: "spec224.source-bundle.v2",
      profileId: "spec224-test-profile",
      profileDigest: "a".repeat(64),
      bundleDigest: "b".repeat(64),
      sourceRevision: "c".repeat(40),
      specDigest: "f".repeat(64),
      files: [
        {
          path: "source.ts",
          sha256: hash(content),
          sizeBytes: content.length,
          mode: 0o644,
        },
      ],
    };
    await writeFile(
      join(root, ".spec224-source-bundle.json"),
      JSON.stringify(manifest)
    );
    await chmod(join(root, ".spec224-source-bundle.json"), 0o444);
    verifyBundle.mockResolvedValue({
      bundleRoot: root,
      manifest,
      profileDigest: manifest.profileDigest,
      sourceTree: "1".repeat(40),
      sourceManifestDigest: "2".repeat(64),
      specSourceDigest: "3".repeat(64),
      specBaselineId: "baseline:test",
      artifactEvidenceDigest: "d".repeat(64),
    });

    const result = await storeVerifiedSpec224Bundle({
      bundlePath: root,
      target: localTarget(),
    });
    expect(
      result.index.files.find(file => file.path === "source.ts")?.mode
    ).toBe(0o644);
  });

  it("requires dedicated remote role configuration and exposes no writer through the reader", async () => {
    const names = [
      "SPEC224_REMOTE_STORAGE_PROVIDER",
      "SPEC224_REMOTE_STORAGE_ENDPOINT",
      "SPEC224_REMOTE_STORAGE_TEST_BUCKET",
      "SPEC224_REMOTE_STORAGE_ALLOWED_ENDPOINT",
      "SPEC224_BUNDLE_WRITER_ACCESS_KEY_ID",
      "SPEC224_BUNDLE_WRITER_SECRET_ACCESS_KEY",
      "SPEC224_RUNTIME_READER_ACCESS_KEY_ID",
      "SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY",
    ];
    const prior = new Map(names.map(name => [name, process.env[name]]));
    const priorNodeEnv = process.env.NODE_ENV;
    try {
      for (const name of names) delete process.env[name];
      process.env.NODE_ENV = "test";
      expect(() => createSpec224BundleWriterFromEnvironment()).toThrow(
        "SPEC224_REMOTE_WRITER_CONFIG_INCOMPLETE"
      );

      process.env.SPEC224_REMOTE_STORAGE_PROVIDER = "r2";
      process.env.SPEC224_REMOTE_STORAGE_ENDPOINT =
        "https://unit-test.r2.cloudflarestorage.com";
      process.env.SPEC224_REMOTE_STORAGE_TEST_BUCKET =
        "spec224-admission-test-unit";
      process.env.SPEC224_RUNTIME_READER_ACCESS_KEY_ID = "redacted-test-value";
      process.env.SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY =
        "redacted-test-value";
      const { reader } = createSpec224BundleReaderFromEnvironment();
      expect(Object.keys(reader)).toEqual(["readVerified"]);
      await expect(
        reader.readVerified("untrusted/key", "a".repeat(64), 1)
      ).rejects.toThrow("SPEC224_REMOTE_OBJECT_REF_INVALID");
    } finally {
      for (const [name, value] of prior) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = priorNodeEnv;
    }
  });

  it("rejects the same credential pair for bundle writer and runtime reader", () => {
    const names = [
      "SPEC224_REMOTE_STORAGE_PROVIDER",
      "SPEC224_REMOTE_STORAGE_ENDPOINT",
      "SPEC224_REMOTE_STORAGE_TEST_BUCKET",
      "SPEC224_REMOTE_STORAGE_ALLOWED_ENDPOINT",
      "SPEC224_BUNDLE_WRITER_ACCESS_KEY_ID",
      "SPEC224_BUNDLE_WRITER_SECRET_ACCESS_KEY",
      "SPEC224_RUNTIME_READER_ACCESS_KEY_ID",
      "SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY",
    ];
    const prior = new Map(names.map(name => [name, process.env[name]]));
    const priorNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "test";
      process.env.SPEC224_REMOTE_STORAGE_PROVIDER = "r2";
      process.env.SPEC224_REMOTE_STORAGE_ENDPOINT =
        "https://unit-test.r2.cloudflarestorage.com";
      process.env.SPEC224_REMOTE_STORAGE_TEST_BUCKET =
        "spec224-admission-test-unit";
      process.env.SPEC224_BUNDLE_WRITER_ACCESS_KEY_ID = "same-access-id";
      process.env.SPEC224_BUNDLE_WRITER_SECRET_ACCESS_KEY = "same-secret";
      process.env.SPEC224_RUNTIME_READER_ACCESS_KEY_ID = "same-access-id";
      process.env.SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY = "same-secret";

      expect(() => createSpec224BundleWriterFromEnvironment()).toThrow(
        "SPEC224_REMOTE_ROLE_CREDENTIALS_NOT_DISTINCT"
      );
      expect(() => createSpec224BundleReaderFromEnvironment()).toThrow(
        "SPEC224_REMOTE_ROLE_CREDENTIALS_NOT_DISTINCT"
      );

      process.env.SPEC224_RUNTIME_READER_ACCESS_KEY_ID = "same-access-id";
      process.env.SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY = "different-secret";
      expect(() => createSpec224BundleWriterFromEnvironment()).toThrow(
        "SPEC224_REMOTE_ROLE_CREDENTIALS_NOT_DISTINCT"
      );

      process.env.SPEC224_RUNTIME_READER_ACCESS_KEY_ID = "different-access-id";
      process.env.SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY = "same-secret";
      expect(() => createSpec224BundleReaderFromEnvironment()).toThrow(
        "SPEC224_REMOTE_ROLE_CREDENTIALS_NOT_DISTINCT"
      );

      delete process.env.SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY;
      expect(() => createSpec224BundleWriterFromEnvironment()).toThrow(
        "SPEC224_REMOTE_ROLE_CREDENTIALS_INCOMPLETE"
      );
    } finally {
      for (const [name, value] of prior) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = priorNodeEnv;
    }
  });

  it("fails closed unless the process explicitly identifies as test or development", async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const target = localTarget();
    try {
      delete process.env.NODE_ENV;
      await expect(
        storeVerifiedSpec224Bundle({
          bundlePath: "/not-read-in-production-mode",
          target,
        })
      ).rejects.toThrow("SPEC224_REMOTE_BUNDLE_STORAGE_NONPRODUCTION_ONLY");
      process.env.NODE_ENV = "production";
      await expect(
        storeVerifiedSpec224Bundle({
          bundlePath: "/not-read-in-production-mode",
          target,
        })
      ).rejects.toThrow("SPEC224_REMOTE_BUNDLE_STORAGE_NONPRODUCTION_ONLY");
    } finally {
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = priorNodeEnv;
    }
  });

  it("rejects a caller-forged storage target before verifying or writing a bundle", async () => {
    root = await mkdtemp(
      join(tmpdir(), "spec224-remote-bundle-forged-target-")
    );
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      await expect(
        storeVerifiedSpec224Bundle({
          bundlePath: root,
          target: {
            provider: "r2",
            bucketIdentityRef: "a".repeat(64),
            endpointClass: "cloudflare-r2-test",
            conditionalCreateMethod: "IF_NONE_MATCH_STAR",
            writerRoleClass: "BUNDLE_WRITER_CONFIGURED_UNVERIFIED",
            runtimeRoleClass: "RUNTIME_READER_CONFIGURED_UNVERIFIED",
            trustLevel: "OBJECT_READBACK_ONLY",
            writer: localWriter(),
          } as never,
        })
      ).rejects.toThrow("SPEC224_STORAGE_TARGET_UNVERIFIED");
    } finally {
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = priorNodeEnv;
    }
  });

  it("requires an exact trusted endpoint allowlist for generic S3-compatible providers", async () => {
    const names = [
      "SPEC224_REMOTE_STORAGE_PROVIDER",
      "SPEC224_REMOTE_STORAGE_ENDPOINT",
      "SPEC224_REMOTE_STORAGE_TEST_BUCKET",
      "SPEC224_REMOTE_STORAGE_ALLOWED_ENDPOINT",
      "SPEC224_BUNDLE_WRITER_ACCESS_KEY_ID",
      "SPEC224_BUNDLE_WRITER_SECRET_ACCESS_KEY",
      "SPEC224_RUNTIME_READER_ACCESS_KEY_ID",
      "SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY",
    ];
    const prior = new Map(names.map(name => [name, process.env[name]]));
    const priorNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "test";
      process.env.SPEC224_REMOTE_STORAGE_PROVIDER = "s3-compatible";
      process.env.SPEC224_REMOTE_STORAGE_ENDPOINT =
        "https://storage.example.test";
      process.env.SPEC224_REMOTE_STORAGE_TEST_BUCKET =
        "spec224-admission-test-unit";
      process.env.SPEC224_BUNDLE_WRITER_ACCESS_KEY_ID = "redacted-test-value";
      process.env.SPEC224_BUNDLE_WRITER_SECRET_ACCESS_KEY =
        "redacted-test-value";
      delete process.env.SPEC224_REMOTE_STORAGE_ALLOWED_ENDPOINT;
      expect(() => createSpec224BundleWriterFromEnvironment()).toThrow(
        "SPEC224_REMOTE_ENDPOINT_NOT_ALLOWLISTED"
      );
      process.env.SPEC224_REMOTE_STORAGE_ALLOWED_ENDPOINT =
        "https://different.example.test";
      expect(() => createSpec224BundleWriterFromEnvironment()).toThrow(
        "SPEC224_REMOTE_ENDPOINT_NOT_ALLOWLISTED"
      );
    } finally {
      for (const [name, value] of prior) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = priorNodeEnv;
    }
  });

  it("rejects a bundle whose repository candidate or canonical Spec baseline differs from the run", () => {
    const graph = {
      baseline: {
        specId: "224",
        sourceArtifactDigest: "f".repeat(64),
        digest: "3".repeat(64),
        baselineId: "baseline:test",
      },
      sourceInventory: {
        baselineRevision: "base-revision",
        candidateRevision: "candidate-revision",
        candidateManifestDigest: "4".repeat(64),
        coverage: {
          repositoryRef: "git:smartspec",
          baselineRevision: "base-revision",
          candidateRevision: "candidate-revision",
        },
      },
    } as any;
    const index = {
      sourceCommit: "candidate-revision",
      specDigest: "f".repeat(64),
      specSourceDigest: "3".repeat(64),
      specBaselineId: "baseline:test",
    } as any;
    const run = {
      baseRevision: "base-revision",
      repositoryRef: "git:smartspec",
    };

    expect(validateSpec224RemoteBundleRunBinding({ graph, run, index })).toBe(
      "4".repeat(64)
    );
    expect(() =>
      validateSpec224RemoteBundleRunBinding({
        graph,
        run,
        index: { ...index, sourceCommit: "other-candidate" },
      })
    ).toThrow("REMOTE_BUNDLE_SPEC_BASELINE_MISMATCH");
    expect(() =>
      validateSpec224RemoteBundleRunBinding({
        graph,
        run: { ...run, repositoryRef: "git:other" },
        index,
      })
    ).toThrow("REMOTE_BUNDLE_SPEC_BASELINE_MISMATCH");
  });
});
