import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";

import {
  workerJobAttempts,
  workerJobEvents,
  workerJobs,
} from "../../drizzle/schema";
import { db, getDb } from "../db";
import {
  storageHeadContentAddressedWithClient,
  storagePutContentAddressedIfAbsentWithClient,
  storageReadBufferWithClient,
  type ContentAddressedS3Access,
} from "../storage";
import { appendJobEvent } from "./jobControlPlane";
import {
  validateRequirementClosureGraph,
  type RequirementClosureGraph,
} from "./spec224RequirementClosureContracts";
import { SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE } from "./spec224ExecutionProfile";
import { verifyLocalSpec224SourceBundle } from "./spec224TrustedSourceAttestation";
import type { SourceBundleManifest } from "./spec224SourceBundle";

const MANIFEST_PATH = ".spec224-source-bundle.json";
const EVIDENCE_VERSION = "spec224.remote-storage-evidence.v1" as const;

export type Spec224ContentAddressedWriter = {
  putIfAbsent(
    namespace: string,
    bytes: Buffer,
    contentType?: string
  ): Promise<{ key: string; sha256: string }>;
};

const bundleStorageTargetBrand = Symbol("spec224-bundle-storage-target");
const approvedBundleStorageTargets = new WeakSet<object>();

export type Spec224BundleStorageTarget = {
  readonly [bundleStorageTargetBrand]: true;
  readonly writer: Spec224ContentAddressedWriter;
  readonly provider: "r2" | "s3-compatible" | "local-test";
  readonly bucketIdentityRef: string;
  readonly endpointClass:
    "cloudflare-r2-test" | "s3-compatible-test" | "local-test";
  readonly conditionalCreateMethod: "IF_NONE_MATCH_STAR" | "LOCAL_TEST_ADAPTER";
  readonly writerRoleClass:
    "BUNDLE_WRITER_CONFIGURED_UNVERIFIED" | "TEST_ADAPTER";
  readonly runtimeRoleClass:
    "RUNTIME_READER_CONFIGURED_UNVERIFIED" | "NOT_CONFIGURED";
  readonly trustLevel: "OBJECT_READBACK_ONLY" | "LOCAL_TEST_ONLY";
};

export type Spec224RemoteBundleIndex = {
  schemaVersion: "spec224.remote-bundle-index.v1";
  profileId: string;
  profileDigest: string;
  bundleDigest: string;
  sourceCommit: string;
  sourceTree: string;
  sourceManifestDigest: string;
  specDigest: string;
  specSourceDigest: string;
  specBaselineId: string;
  profileVersion: number;
  artifactEvidenceDigest: string;
  files: Array<{
    path: string;
    sha256: string;
    sizeBytes: number;
    mode: number;
    objectKey: string;
  }>;
};

/** This proves byte read-back only; it is deliberately not an admission trust assertion. */
export type Spec224RemoteStorageEvidence = {
  evidenceVersion: typeof EVIDENCE_VERSION;
  provider: "r2" | "s3-compatible" | "local-test";
  bucketIdentityRef: string;
  endpointClass: "cloudflare-r2-test" | "s3-compatible-test" | "local-test";
  objectKey: string;
  profileDigest: string;
  bundleDigest: string;
  observedSha256: string;
  sizeBytes: number;
  conditionalCreateMethod: "IF_NONE_MATCH_STAR" | "LOCAL_TEST_ADAPTER";
  writerRoleClass: "BUNDLE_WRITER_CONFIGURED_UNVERIFIED" | "TEST_ADAPTER";
  runtimeRoleClass: "RUNTIME_READER_CONFIGURED_UNVERIFIED" | "NOT_CONFIGURED";
  runtimeMutationDenied: "NOT_TESTED";
  runtimeDeleteDenied: "NOT_TESTED";
  trustLevel: "OBJECT_READBACK_ONLY" | "LOCAL_TEST_ONLY";
  verifiedAt: string;
  verifierVersion: "spec224-remote-bundle-storage.v1";
  evidenceDigest: string;
};

export class Spec224RemoteBundleStorageError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "Spec224RemoteBundleStorageError";
  }
}

export function validateSpec224RemoteBundleRunBinding(input: {
  graph: RequirementClosureGraph;
  run: Record<string, unknown>;
  index: Spec224RemoteBundleIndex;
}): string {
  const { graph, run, index } = input;
  const inventory = graph.sourceInventory;
  if (
    graph.baseline.specId !== "224" ||
    graph.baseline.sourceArtifactDigest !== index.specDigest ||
    graph.baseline.digest !== index.specSourceDigest ||
    graph.baseline.baselineId !== index.specBaselineId ||
    !inventory ||
    inventory.baselineRevision !== run.baseRevision ||
    inventory.coverage.repositoryRef !== run.repositoryRef ||
    inventory.coverage.baselineRevision !== run.baseRevision ||
    inventory.candidateRevision !== index.sourceCommit ||
    inventory.coverage.candidateRevision !== index.sourceCommit ||
    !isSha256(inventory.candidateManifestDigest)
  ) {
    throw new Spec224RemoteBundleStorageError(
      "REMOTE_BUNDLE_SPEC_BASELINE_MISMATCH"
    );
  }
  return inventory.candidateManifestDigest;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function assertSafeRelativePath(root: string, path: string): string {
  if (!path || path.includes("\\") || isAbsolute(path)) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_BUNDLE_PATH_INVALID"
    );
  }
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (
    rel !== path ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    isAbsolute(rel)
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_BUNDLE_PATH_INVALID"
    );
  }
  return absolute;
}

function assertNonProductionEnvironment(): void {
  if (
    process.env.NODE_ENV !== "test" &&
    process.env.NODE_ENV !== "development"
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_BUNDLE_STORAGE_NONPRODUCTION_ONLY"
    );
  }
}

function registerBundleStorageTarget(
  input: Omit<Spec224BundleStorageTarget, typeof bundleStorageTargetBrand>
): Spec224BundleStorageTarget {
  const target = Object.freeze({
    ...input,
    writer: Object.freeze(input.writer),
    [bundleStorageTargetBrand]: true as const,
  });
  approvedBundleStorageTargets.add(target);
  return target;
}

/** Deterministic adapter for tests only; its output can never be called remote-trusted evidence. */
export function createSpec224LocalTestStorageTarget(
  writer: Spec224ContentAddressedWriter
): Spec224BundleStorageTarget {
  if (process.env.NODE_ENV !== "test") {
    throw new Spec224RemoteBundleStorageError(
      "LOCAL_TEST_STORAGE_TARGET_TEST_ONLY"
    );
  }
  return registerBundleStorageTarget({
    writer,
    provider: "local-test",
    bucketIdentityRef: sha256("spec224-local-test-storage"),
    endpointClass: "local-test",
    conditionalCreateMethod: "LOCAL_TEST_ADAPTER",
    writerRoleClass: "TEST_ADAPTER",
    runtimeRoleClass: "NOT_CONFIGURED",
    trustLevel: "LOCAL_TEST_ONLY",
  });
}

/**
 * Uploads each verified bundle file and a deterministic index using the existing
 * conditional content-addressed storage helper. It does not claim trusted remote
 * immutability: separate runtime-reader denial tests and bucket policy evidence
 * are still required before an attestation or protected operation can rely on it.
 */
export async function storeVerifiedSpec224Bundle(input: {
  bundlePath: string;
  target: Spec224BundleStorageTarget;
}): Promise<{
  index: Spec224RemoteBundleIndex;
  evidence: Spec224RemoteStorageEvidence;
}> {
  assertNonProductionEnvironment();
  if (!approvedBundleStorageTargets.has(input.target)) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_STORAGE_TARGET_UNVERIFIED"
    );
  }

  const verified = await verifyLocalSpec224SourceBundle(input.bundlePath);
  const bundleRoot = await realpath(resolve(input.bundlePath)).catch(() => {
    throw new Spec224RemoteBundleStorageError("SOURCE_BUNDLE_NOT_FOUND");
  });
  if ((await realpath(verified.bundleRoot)) !== bundleRoot) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_BUNDLE_ROOT_MISMATCH"
    );
  }
  const manifest = verified.manifest;
  if (
    !isSha256(manifest.profileDigest) ||
    !isSha256(manifest.bundleDigest) ||
    !isSha256(manifest.specDigest) ||
    !isSha256(verified.sourceManifestDigest) ||
    !isSha256(verified.specSourceDigest) ||
    !isSha256(verified.artifactEvidenceDigest) ||
    typeof verified.specBaselineId !== "string" ||
    !/^[a-f0-9]{40}$/i.test(verified.sourceTree) ||
    verified.profileDigest !== manifest.profileDigest ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(manifest.sourceRevision)
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_BUNDLE_IDENTITY_INVALID"
    );
  }

  const manifestBytes = await readFile(
    assertSafeRelativePath(bundleRoot, MANIFEST_PATH)
  );
  let diskManifest: SourceBundleManifest;
  try {
    diskManifest = JSON.parse(
      manifestBytes.toString("utf8")
    ) as SourceBundleManifest;
  } catch {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_BUNDLE_MANIFEST_INVALID"
    );
  }
  if (canonicalJson(diskManifest) !== canonicalJson(manifest)) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_BUNDLE_MANIFEST_CHANGED"
    );
  }

  const namespace = `spec224/profiles/${manifest.profileDigest}/bundles/${manifest.bundleDigest}`;
  const entries: Spec224RemoteBundleIndex["files"] = [];
  const files = [
    ...manifest.files,
    {
      path: MANIFEST_PATH,
      sha256: sha256(manifestBytes),
      sizeBytes: manifestBytes.length,
      mode: 0o444,
    },
  ].sort((left, right) => left.path.localeCompare(right.path));

  for (const file of files) {
    if (
      !isSha256(file.sha256) ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 0
    ) {
      throw new Spec224RemoteBundleStorageError(
        "SPEC224_REMOTE_BUNDLE_FILE_MANIFEST_INVALID"
      );
    }
    const absolute = assertSafeRelativePath(bundleRoot, file.path);
    const resolvedFile = await realpath(absolute).catch(() => null);
    if (resolvedFile !== absolute) {
      throw new Spec224RemoteBundleStorageError(
        "SPEC224_REMOTE_BUNDLE_FILE_NOT_SEALED"
      );
    }
    const stat = await lstat(absolute).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || (stat.mode & 0o222) !== 0) {
      throw new Spec224RemoteBundleStorageError(
        "SPEC224_REMOTE_BUNDLE_FILE_NOT_SEALED"
      );
    }
    let bytes: Buffer;
    let fileHandle;
    try {
      fileHandle = await open(
        absolute,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
      );
      const openedStat = await fileHandle.stat();
      if (
        !openedStat.isFile() ||
        openedStat.dev !== stat.dev ||
        openedStat.ino !== stat.ino ||
        (openedStat.mode & 0o555) !== (file.mode & 0o555) ||
        (openedStat.mode & 0o222) !== 0
      ) {
        throw new Spec224RemoteBundleStorageError(
          "SPEC224_REMOTE_BUNDLE_FILE_NOT_SEALED"
        );
      }
      bytes = await fileHandle.readFile();
    } catch (error) {
      if (error instanceof Spec224RemoteBundleStorageError) throw error;
      throw new Spec224RemoteBundleStorageError(
        "SPEC224_REMOTE_BUNDLE_FILE_NOT_SEALED"
      );
    } finally {
      await fileHandle?.close();
    }
    const actualDigest = sha256(bytes);
    if (bytes.length !== file.sizeBytes || actualDigest !== file.sha256) {
      throw new Spec224RemoteBundleStorageError(
        "SPEC224_REMOTE_BUNDLE_FILE_MISMATCH"
      );
    }
    const stored = await input.target.writer.putIfAbsent(
      `${namespace}/files`,
      bytes
    );
    const expectedKey = `${namespace}/files/sha256/${actualDigest}`;
    if (stored.key !== expectedKey || stored.sha256 !== actualDigest) {
      throw new Spec224RemoteBundleStorageError(
        "SPEC224_REMOTE_BUNDLE_OBJECT_REF_MISMATCH"
      );
    }
    entries.push({
      path: file.path,
      sha256: actualDigest,
      sizeBytes: bytes.length,
      mode: file.mode,
      objectKey: stored.key,
    });
  }

  const index: Spec224RemoteBundleIndex = {
    schemaVersion: "spec224.remote-bundle-index.v1",
    profileId: manifest.profileId,
    profileDigest: manifest.profileDigest,
    bundleDigest: manifest.bundleDigest,
    sourceCommit: manifest.sourceRevision,
    sourceTree: verified.sourceTree,
    sourceManifestDigest: verified.sourceManifestDigest,
    specDigest: manifest.specDigest,
    specSourceDigest: verified.specSourceDigest,
    specBaselineId: verified.specBaselineId,
    profileVersion: SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.version,
    artifactEvidenceDigest: verified.artifactEvidenceDigest,
    files: entries,
  };
  const indexBytes = Buffer.from(canonicalJson(index), "utf8");
  const indexNamespace = `${namespace}/index`;
  const indexObject = await input.target.writer.putIfAbsent(
    indexNamespace,
    indexBytes,
    "application/json"
  );
  const expectedIndexKey = `${indexNamespace}/sha256/${sha256(indexBytes)}`;
  if (
    indexObject.key !== expectedIndexKey ||
    indexObject.sha256 !== sha256(indexBytes)
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_BUNDLE_INDEX_REF_MISMATCH"
    );
  }

  const evidenceCore = {
    evidenceVersion: EVIDENCE_VERSION,
    provider: input.target.provider,
    bucketIdentityRef: input.target.bucketIdentityRef,
    endpointClass: input.target.endpointClass,
    objectKey: indexObject.key,
    profileDigest: manifest.profileDigest,
    bundleDigest: manifest.bundleDigest,
    observedSha256: indexObject.sha256,
    sizeBytes: indexBytes.length,
    conditionalCreateMethod: input.target.conditionalCreateMethod,
    writerRoleClass: input.target.writerRoleClass,
    runtimeRoleClass: input.target.runtimeRoleClass,
    runtimeMutationDenied: "NOT_TESTED" as const,
    runtimeDeleteDenied: "NOT_TESTED" as const,
    trustLevel: input.target.trustLevel,
    verifiedAt: new Date().toISOString(),
    verifierVersion: "spec224-remote-bundle-storage.v1" as const,
  };
  return {
    index,
    evidence: {
      ...evidenceCore,
      evidenceDigest: sha256(canonicalJson(evidenceCore)),
    },
  };
}

/**
 * Store a verified bundle and persist only its bounded reference/evidence through
 * the canonical worker-job event authority. A remote write that races a stale
 * job may leave an unreferenced content-addressed object; it never authorizes work.
 */
export async function storeAndRecordSpec224RemoteBundle(input: {
  bundlePath: string;
  target: Spec224BundleStorageTarget;
  workerJobId: string;
  tenantId: string;
  runId: string;
  workPackageId: string;
  expectedAttempt: number;
  expectedProjectionRevision: number;
  expectedDevelopmentRunFencingVersion: number;
  expectedWorkerJobFencingVersion: number;
}): Promise<{
  index: Spec224RemoteBundleIndex;
  evidence: Spec224RemoteStorageEvidence;
  attemptId: string;
}> {
  const stored = await storeVerifiedSpec224Bundle(input);
  getDb();
  const persisted = await db.instance.transaction(async tx => {
    const [job] = await tx
      .select({
        id: workerJobs.id,
        tenantId: workerJobs.tenantId,
        requestedByUserId: workerJobs.requestedByUserId,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        status: workerJobs.status,
        progressJson: workerJobs.progressJson,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.id, input.workerJobId),
          eq(workerJobs.tenantId, input.tenantId)
        )
      )
      .for("update")
      .limit(1);
    if (
      !job ||
      [
        "succeeded",
        "failed",
        "cancelled",
        "canceled",
        "completed",
        "expired",
      ].includes(job.status)
    ) {
      throw new Spec224RemoteBundleStorageError("CANONICAL_JOB_NOT_ADMISSIBLE");
    }
    const run = job.progressJson?.spec224 as
      Record<string, unknown> | undefined;
    if (
      !run ||
      run.runId !== input.runId ||
      run.workerJobId !== job.id ||
      run.tenantId !== job.tenantId ||
      Number(run.actorId) !== job.requestedByUserId ||
      Number(run.projectionVersion) !== input.expectedProjectionRevision ||
      Number(run.fencingVersion) !==
        input.expectedDevelopmentRunFencingVersion ||
      job.attempt !== input.expectedAttempt ||
      job.fencingVersion !== input.expectedWorkerJobFencingVersion
    ) {
      throw new Spec224RemoteBundleStorageError("CANONICAL_RUN_BINDING_STALE");
    }
    const [attempt] = await tx
      .select({ id: workerJobAttempts.id })
      .from(workerJobAttempts)
      .where(
        and(
          eq(workerJobAttempts.workerJobId, job.id),
          eq(workerJobAttempts.attempt, job.attempt)
        )
      )
      .limit(1);
    if (!attempt)
      throw new Spec224RemoteBundleStorageError("CANONICAL_ATTEMPT_NOT_FOUND");
    const metadata =
      run.metadata && typeof run.metadata === "object"
        ? (run.metadata as Record<string, unknown>)
        : {};
    const closure = metadata.spec224RequirementClosure as
      { graph?: RequirementClosureGraph; graphDigest?: string } | undefined;
    if (
      !closure?.graph ||
      typeof closure.graphDigest !== "string" ||
      sha256(canonicalJson(closure.graph)) !== closure.graphDigest
    ) {
      throw new Spec224RemoteBundleStorageError(
        "PERSISTED_REQUIREMENT_CLOSURE_INVALID"
      );
    }
    let graph: RequirementClosureGraph;
    try {
      graph = validateRequirementClosureGraph(closure.graph);
    } catch {
      throw new Spec224RemoteBundleStorageError(
        "PERSISTED_REQUIREMENT_CLOSURE_INVALID"
      );
    }
    const runCandidateManifestDigest = validateSpec224RemoteBundleRunBinding({
      graph,
      run,
      index: stored.index,
    });
    if (!graph.workPackages.some(item => item.id === input.workPackageId)) {
      throw new Spec224RemoteBundleStorageError(
        "WORK_PACKAGE_NOT_IN_PERSISTED_CLOSURE"
      );
    }

    const eventIdempotencyKey = `spec224:remote-bundle:${sha256(
      canonicalJson({
        workerJobId: job.id,
        runId: input.runId,
        workPackageId: input.workPackageId,
        attempt: job.attempt,
        bundleDigest: stored.index.bundleDigest,
      })
    )}`;
    const [existing] = await tx
      .select({
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
      })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, job.id),
          eq(workerJobEvents.eventIdempotencyKey, eventIdempotencyKey)
        )
      )
      .limit(1);
    const eventPayload = {
      runId: input.runId,
      workPackageId: input.workPackageId,
      attemptId: attempt.id,
      attempt: job.attempt,
      projectionRevision: input.expectedProjectionRevision,
      developmentRunFencingVersion: input.expectedDevelopmentRunFencingVersion,
      workerJobFencingVersion: input.expectedWorkerJobFencingVersion,
      sourceCommit: stored.index.sourceCommit,
      sourceTree: stored.index.sourceTree,
      sourceManifestDigest: stored.index.sourceManifestDigest,
      runCandidateManifestDigest,
      specDigest: stored.index.specDigest,
      specSourceDigest: stored.index.specSourceDigest,
      specBaselineId: stored.index.specBaselineId,
      profileVersion: stored.index.profileVersion,
      profileDigest: stored.index.profileDigest,
      bundleDigest: stored.index.bundleDigest,
      artifactEvidenceDigest: stored.index.artifactEvidenceDigest,
      index: {
        objectKey: stored.evidence.objectKey,
        sha256: stored.evidence.observedSha256,
        sizeBytes: stored.evidence.sizeBytes,
      },
      remoteStorageEvidence: stored.evidence,
    };
    if (existing) {
      const prior = existing.payloadJson as typeof eventPayload | undefined;
      const stableEvidence = (
        value: Spec224RemoteStorageEvidence | undefined
      ) =>
        value
          ? { ...value, verifiedAt: undefined, evidenceDigest: undefined }
          : null;
      if (
        existing.eventType !== "SPEC224_REMOTE_BUNDLE_STORED" ||
        !prior ||
        canonicalJson({
          ...prior,
          remoteStorageEvidence: stableEvidence(prior.remoteStorageEvidence),
        }) !==
          canonicalJson({
            ...eventPayload,
            remoteStorageEvidence: stableEvidence(
              eventPayload.remoteStorageEvidence
            ),
          })
      ) {
        throw new Spec224RemoteBundleStorageError(
          "REMOTE_BUNDLE_EVENT_IDEMPOTENCY_CONFLICT"
        );
      }
      return { attemptId: attempt.id, evidence: prior.remoteStorageEvidence };
    }
    await appendJobEvent(tx, {
      workerJobId: job.id,
      attemptId: attempt.id,
      eventType: "SPEC224_REMOTE_BUNDLE_STORED",
      eventIdempotencyKey,
      payloadJson: eventPayload,
    });
    return { attemptId: attempt.id, evidence: stored.evidence };
  });
  return {
    index: stored.index,
    evidence: persisted.evidence,
    attemptId: persisted.attemptId,
  };
}

/** Resolve only dedicated non-production writer credentials; never use global storage settings. */
export function createSpec224BundleWriterFromEnvironment(): {
  target: Spec224BundleStorageTarget;
} {
  assertNonProductionEnvironment();
  const provider = process.env.SPEC224_REMOTE_STORAGE_PROVIDER;
  const endpoint = process.env.SPEC224_REMOTE_STORAGE_ENDPOINT?.trim();
  const bucket = process.env.SPEC224_REMOTE_STORAGE_TEST_BUCKET?.trim();
  const accessKeyId = process.env.SPEC224_BUNDLE_WRITER_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SPEC224_BUNDLE_WRITER_SECRET_ACCESS_KEY;
  assertRemoteRoleCredentialsDistinct({
    primaryAccessKeyId: accessKeyId,
    primarySecretAccessKey: secretAccessKey,
    otherAccessKeyId: process.env.SPEC224_RUNTIME_READER_ACCESS_KEY_ID,
    otherSecretAccessKey: process.env.SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY,
  });
  if (
    (provider !== "r2" && provider !== "s3-compatible") ||
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !/^spec224-admission-test(?:-[a-z0-9-]+)?$/i.test(bucket)
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_WRITER_CONFIG_INCOMPLETE"
    );
  }
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_ENDPOINT_INVALID"
    );
  }
  if (
    parsedEndpoint.protocol !== "https:" ||
    parsedEndpoint.username ||
    parsedEndpoint.password ||
    parsedEndpoint.search ||
    parsedEndpoint.hash ||
    parsedEndpoint.pathname !== "/"
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_ENDPOINT_INVALID"
    );
  }
  validateApprovedEndpoint(provider, parsedEndpoint);
  const client = new S3Client({
    endpoint: parsedEndpoint.origin,
    region:
      provider === "r2"
        ? "auto"
        : process.env.SPEC224_REMOTE_STORAGE_REGION || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
  });
  const access: ContentAddressedS3Access = { client, bucket };
  const endpointClass =
    provider === "r2" ? "cloudflare-r2-test" : "s3-compatible-test";
  return {
    target: registerBundleStorageTarget({
      provider,
      endpointClass,
      bucketIdentityRef: sha256(
        `${provider}\n${parsedEndpoint.origin}\n${bucket}`
      ),
      conditionalCreateMethod: "IF_NONE_MATCH_STAR",
      writerRoleClass: "BUNDLE_WRITER_CONFIGURED_UNVERIFIED",
      runtimeRoleClass: "RUNTIME_READER_CONFIGURED_UNVERIFIED",
      trustLevel: "OBJECT_READBACK_ONLY",
      writer: {
        putIfAbsent: (namespace, bytes, contentType) =>
          storagePutContentAddressedIfAbsentWithClient(
            access,
            namespace,
            bytes,
            contentType
          ),
      },
    }),
  };
}

function validateApprovedEndpoint(
  provider: "r2" | "s3-compatible",
  endpoint: URL
): void {
  if (
    provider === "r2" &&
    !/^[a-z0-9-]+\.r2\.cloudflarestorage\.com$/i.test(endpoint.hostname)
  ) {
    throw new Spec224RemoteBundleStorageError("SPEC224_R2_ENDPOINT_INVALID");
  }
  if (
    provider === "s3-compatible" &&
    process.env.SPEC224_REMOTE_STORAGE_ALLOWED_ENDPOINT?.trim() !==
      endpoint.origin
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_ENDPOINT_NOT_ALLOWLISTED"
    );
  }
}

/** Reject a shared identity/secret whenever both remote roles are configured. */
function assertRemoteRoleCredentialsDistinct(input: {
  primaryAccessKeyId: string | undefined;
  primarySecretAccessKey: string | undefined;
  otherAccessKeyId: string | undefined;
  otherSecretAccessKey: string | undefined;
}): void {
  const otherRoleConfigured =
    input.otherAccessKeyId !== undefined ||
    input.otherSecretAccessKey !== undefined;
  if (!otherRoleConfigured) return;
  if (!input.otherAccessKeyId || !input.otherSecretAccessKey) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_ROLE_CREDENTIALS_INCOMPLETE"
    );
  }
  if (
    input.primaryAccessKeyId === input.otherAccessKeyId ||
    (input.primarySecretAccessKey !== undefined &&
      input.primarySecretAccessKey === input.otherSecretAccessKey)
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_ROLE_CREDENTIALS_NOT_DISTINCT"
    );
  }
}

export type Spec224ContentAddressedReader = {
  readVerified(
    objectKey: string,
    expectedSha256: string,
    expectedSizeBytes: number
  ): Promise<Buffer>;
};

/** Resolve a distinct read-only identity; this client exposes no write operation. */
export function createSpec224BundleReaderFromEnvironment(): {
  reader: Spec224ContentAddressedReader;
  bucketIdentityRef: string;
} {
  assertNonProductionEnvironment();
  const provider = process.env.SPEC224_REMOTE_STORAGE_PROVIDER;
  const endpoint = process.env.SPEC224_REMOTE_STORAGE_ENDPOINT?.trim();
  const bucket = process.env.SPEC224_REMOTE_STORAGE_TEST_BUCKET?.trim();
  const accessKeyId = process.env.SPEC224_RUNTIME_READER_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SPEC224_RUNTIME_READER_SECRET_ACCESS_KEY;
  assertRemoteRoleCredentialsDistinct({
    primaryAccessKeyId: accessKeyId,
    primarySecretAccessKey: secretAccessKey,
    otherAccessKeyId: process.env.SPEC224_BUNDLE_WRITER_ACCESS_KEY_ID,
    otherSecretAccessKey: process.env.SPEC224_BUNDLE_WRITER_SECRET_ACCESS_KEY,
  });
  if (
    (provider !== "r2" && provider !== "s3-compatible") ||
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !/^spec224-admission-test(?:-[a-z0-9-]+)?$/i.test(bucket)
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_READER_CONFIG_INCOMPLETE"
    );
  }
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_ENDPOINT_INVALID"
    );
  }
  if (
    parsedEndpoint.protocol !== "https:" ||
    parsedEndpoint.username ||
    parsedEndpoint.password ||
    parsedEndpoint.search ||
    parsedEndpoint.hash ||
    parsedEndpoint.pathname !== "/" ||
    (provider === "r2" &&
      !/^[a-z0-9-]+\.r2\.cloudflarestorage\.com$/i.test(
        parsedEndpoint.hostname
      ))
  ) {
    throw new Spec224RemoteBundleStorageError(
      "SPEC224_REMOTE_ENDPOINT_INVALID"
    );
  }
  validateApprovedEndpoint(provider, parsedEndpoint);
  const client = new S3Client({
    endpoint: parsedEndpoint.origin,
    region:
      provider === "r2"
        ? "auto"
        : process.env.SPEC224_REMOTE_STORAGE_REGION || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
  });
  const access: ContentAddressedS3Access = { client, bucket };
  const bucketIdentityRef = sha256(
    `${provider}\n${parsedEndpoint.origin}\n${bucket}`
  );
  return {
    bucketIdentityRef,
    reader: {
      async readVerified(objectKey, expectedSha256, expectedSizeBytes) {
        if (
          !/^spec224\/profiles\/[a-f0-9]{64}\/bundles\/[a-f0-9]{64}\/(?:files|index)\/sha256\/[a-f0-9]{64}$/i.test(
            objectKey
          ) ||
          !isSha256(expectedSha256) ||
          !Number.isSafeInteger(expectedSizeBytes) ||
          expectedSizeBytes < 0 ||
          objectKey.endsWith(`/sha256/${expectedSha256}`) === false
        ) {
          throw new Spec224RemoteBundleStorageError(
            "SPEC224_REMOTE_OBJECT_REF_INVALID"
          );
        }
        const head = await storageHeadContentAddressedWithClient(
          access,
          objectKey
        );
        if (!head || head.contentLength !== expectedSizeBytes) {
          throw new Spec224RemoteBundleStorageError(
            "SPEC224_REMOTE_OBJECT_METADATA_MISMATCH"
          );
        }
        const bytes = await storageReadBufferWithClient(access, objectKey);
        if (
          !bytes ||
          bytes.length !== expectedSizeBytes ||
          sha256(bytes) !== expectedSha256
        ) {
          throw new Spec224RemoteBundleStorageError(
            "SPEC224_REMOTE_OBJECT_READBACK_MISMATCH"
          );
        }
        return bytes;
      },
    },
  };
}
