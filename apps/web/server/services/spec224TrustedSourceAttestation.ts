import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { and, eq } from "drizzle-orm";

import {
  workerJobAttempts,
  workerJobEvents,
  workerJobs,
} from "../../drizzle/schema";
import { db, getDb } from "../db";
import {
  createGitTreeSourceManifestFromPaths,
  verifyReadOnlySourceBundle,
  type SourceBundleManifest,
} from "./spec224SourceBundle";
import {
  bindSpec224ExecutionProfileToSource,
  SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE,
} from "./spec224ExecutionProfile";
import {
  validateRequirementClosureGraph,
  type RequirementClosureGraph,
} from "./spec224RequirementClosureContracts";
import { appendJobEvent } from "./jobControlPlane";

const execFileAsync = promisify(execFile);
const EVENT_TYPE = "SPEC224_SOURCE_ATTESTED";
const SCHEMA_VERSION = "spec224.trusted-source-attestation.v1" as const;

export type Spec224TrustedSourceAttestation = {
  schemaVersion: typeof SCHEMA_VERSION;
  attestationId: string;
  trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY";
  tenantId: string;
  runId: string;
  workerJobId: string;
  workPackageId: string;
  attemptId: string;
  attempt: number;
  projectionRevision: number;
  decisionEpoch: number;
  developmentRunFencingVersion: number;
  workerJobFencingVersion: number;
  developmentRepositoryRef: string;
  developmentBaseRevision: string;
  sourceCommit: string;
  sourceTree: string;
  sourceManifestDigest: string;
  sourceSha256: string;
  specDigest: string;
  profileId: string;
  profileVersion: number;
  profileDigest: string;
  bundleDigest: string;
  artifactEvidenceDigest: string;
  objectRef: string;
  issuer: "spec224-local-source-verifier.v1";
  issuedAt: string;
  status: "ACTIVE";
};

export class Spec224AttestationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "Spec224AttestationError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeRelativePath(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
}

function manifestHasCompleteClosure(manifest: SourceBundleManifest): boolean {
  const accepted = new Set([
    "resolved-local",
    "verified-external-artifact",
    "optional-dependency-excluded",
    "profile-dependency-excluded",
  ]);
  return (
    manifest.closureComplete === true &&
    manifest.unresolvedImports.length === 0 &&
    manifest.dependencyEdges.every(edge => accepted.has(edge.status)) &&
    manifest.externalPackageIdentities
      .filter(item => manifest.requiredExternalPackages.includes(item.locator))
      .every(
        item =>
          item.artifactStatus === "VERIFIED_ARTIFACT" && item.artifactSha256
      )
  );
}

async function sourceIdentityFromBundle(
  bundleRoot: string,
  repositoryRoot: string,
  manifest: SourceBundleManifest
): Promise<{
  sourceTree: string;
  sourceManifestDigest: string;
  sourceSha256: string;
  profileDigest: string;
  artifactEvidenceDigest: string;
}> {
  if (!manifestHasCompleteClosure(manifest)) {
    throw new Spec224AttestationError("SOURCE_CLOSURE_INCOMPLETE");
  }
  const sourceCommit = manifest.sourceRevision;
  const { stdout: treeOutput } = await execFileAsync(
    "git",
    ["rev-parse", "--verify", `${sourceCommit}^{tree}`],
    { cwd: repositoryRoot, maxBuffer: 1024 * 1024 }
  );
  const sourceTree = treeOutput.trim();
  if (!/^[a-f0-9]{40}$/i.test(sourceTree)) {
    throw new Spec224AttestationError("SOURCE_TREE_INVALID");
  }

  const bundle = await verifyReadOnlySourceBundle(bundleRoot);
  if (!bundle.valid || bundle.integrityOnly !== true) {
    throw new Spec224AttestationError("SOURCE_BUNDLE_INTEGRITY_INVALID");
  }
  const artifactPaths = new Set(
    manifest.externalPackageIdentities
      .map(item => item.artifactPath)
      .filter((path): path is string => Boolean(path))
  );
  const generatedPaths = new Set(
    manifest.files
      .filter(file => file.provenance.includes("generated-artifact"))
      .map(file => file.path)
  );
  const sourcePaths = manifest.files
    .filter(
      file => !artifactPaths.has(file.path) && !generatedPaths.has(file.path)
    )
    .map(file => file.path)
    .sort();
  const sourceManifest = await createGitTreeSourceManifestFromPaths({
    repositoryRoot,
    sourceRevision: sourceCommit,
    paths: sourcePaths,
  });
  if (
    sourceManifest.manifestDigest !==
      manifest.sourceTreeAttestation?.manifestDigest ||
    sourceManifest.sourceRevision !== sourceCommit ||
    sourceManifest.files.length !== sourcePaths.length
  ) {
    throw new Spec224AttestationError("SOURCE_TREE_MANIFEST_MISMATCH");
  }

  const specPath = resolve(
    repositoryRoot,
    "specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md"
  );
  const specDigest = sha256(await readFile(specPath));
  if (specDigest !== manifest.specDigest) {
    throw new Spec224AttestationError("SPEC_BASELINE_MISMATCH");
  }
  const profile = bindSpec224ExecutionProfileToSource(
    SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE,
    sourceCommit,
    sourceTree
  );
  if (
    profile.profileDigest !== manifest.profileDigest ||
    profile.profileId !== manifest.profileId
  ) {
    throw new Spec224AttestationError("EXECUTION_PROFILE_MISMATCH");
  }
  const artifactEvidence = manifest.externalPackageIdentities
    .filter(item => manifest.requiredExternalPackages.includes(item.locator))
    .map(item => ({
      locator: item.locator,
      packageManager: item.packageManager,
      lockfilePath: item.lockfilePath,
      integrity: [...item.integrity].sort(),
      artifactSha256: item.artifactSha256,
      artifactSizeBytes: item.artifactSizeBytes,
      artifactPlatform: item.artifactPlatform,
      artifactKind: item.artifactKind,
    }))
    .sort((a, b) => a.locator.localeCompare(b.locator));
  const artifactEvidenceDigest = sha256(canonicalJson(artifactEvidence));
  const sourceSha256 = sha256(
    canonicalJson({
      files: sourceManifest.files
        .map(file => ({ path: file.path, sha256: file.sha256 }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      schemaVersion: "spec224.source-manifest.v1",
      sourceCommit,
    })
  );
  return {
    sourceTree,
    sourceManifestDigest: sourceManifest.manifestDigest,
    sourceSha256,
    profileDigest: profile.profileDigest,
    artifactEvidenceDigest,
  };
}

export async function verifyLocalSpec224SourceBundle(
  bundlePath: string
): Promise<{
  bundleRoot: string;
  repositoryRoot: string;
  manifest: SourceBundleManifest;
  sourceTree: string;
  sourceManifestDigest: string;
  sourceSha256: string;
  profileDigest: string;
  artifactEvidenceDigest: string;
}> {
  if (process.env.NODE_ENV === "production") {
    throw new Spec224AttestationError(
      "LOCAL_ATTESTATION_FORBIDDEN_IN_PRODUCTION"
    );
  }
  const configuredBundleRoot = process.env.SPEC224_NONPROD_BUNDLE_ROOT?.trim();
  if (!configuredBundleRoot)
    throw new Spec224AttestationError("BUNDLE_ROOT_NOT_CONFIGURED");
  const bundleRoot = await realpath(resolve(bundlePath)).catch(() => {
    throw new Spec224AttestationError("SOURCE_BUNDLE_NOT_FOUND");
  });
  const bundleBase = await realpath(resolve(configuredBundleRoot)).catch(() => {
    throw new Spec224AttestationError("BUNDLE_ROOT_NOT_FOUND");
  });
  if (!safeRelativePath(bundleBase, bundleRoot)) {
    throw new Spec224AttestationError("SOURCE_BUNDLE_OUTSIDE_CONFIGURED_ROOT");
  }
  const bundleStat = await lstat(bundleRoot);
  if (!bundleStat.isDirectory() || bundleStat.isSymbolicLink()) {
    throw new Spec224AttestationError("SOURCE_BUNDLE_ROOT_INVALID");
  }
  const manifestPath = resolve(bundleRoot, ".spec224-source-bundle.json");
  if (!safeRelativePath(bundleRoot, manifestPath)) {
    throw new Spec224AttestationError("SOURCE_BUNDLE_MANIFEST_PATH_INVALID");
  }
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8")
  ) as SourceBundleManifest;
  const { stdout: rootOutput } = await execFileAsync(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd: process.cwd(), maxBuffer: 1024 * 1024 }
  );
  const repositoryRoot = await realpath(rootOutput.trim());
  const identity = await sourceIdentityFromBundle(
    bundleRoot,
    repositoryRoot,
    manifest
  );
  return { bundleRoot, repositoryRoot, manifest, ...identity };
}

/**
 * Issue a local-only attestation from persisted job/run state and a verified
 * source bundle. This deliberately cannot grant protected execution: an
 * external immutable-store verifier and the authenticated owner grant remain
 * separate admission requirements.
 */
export async function issueLocalSpec224SourceAttestation(input: {
  workerJobId: string;
  tenantId: string;
  runId: string;
  workPackageId: string;
  expectedAttempt: number;
  expectedProjectionRevision: number;
  expectedDevelopmentRunFencingVersion: number;
  expectedWorkerJobFencingVersion: number;
  bundlePath: string;
}): Promise<Spec224TrustedSourceAttestation> {
  if (process.env.NODE_ENV === "production") {
    throw new Spec224AttestationError(
      "LOCAL_ATTESTATION_FORBIDDEN_IN_PRODUCTION"
    );
  }
  const verified = await verifyLocalSpec224SourceBundle(input.bundlePath);
  const { manifest, sourceTree } = verified;

  getDb();
  return db.instance.transaction(async tx => {
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
      throw new Spec224AttestationError("CANONICAL_JOB_NOT_ADMISSIBLE");
    }
    const run = job.progressJson?.spec224 as
      Record<string, unknown> | undefined;
    if (
      !run ||
      run.runId !== input.runId ||
      run.workerJobId !== job.id ||
      run.tenantId !== job.tenantId ||
      Number(run.actorId) !== job.requestedByUserId ||
      !Number.isSafeInteger(Number(run.projectionVersion)) ||
      Number(run.projectionVersion) !== input.expectedProjectionRevision ||
      !Number.isSafeInteger(Number(run.fencingVersion)) ||
      Number(run.fencingVersion) !==
        input.expectedDevelopmentRunFencingVersion ||
      !Number.isSafeInteger(Number(run.decisionEpoch)) ||
      Number(run.decisionEpoch) < 0 ||
      job.attempt !== input.expectedAttempt ||
      job.fencingVersion !== input.expectedWorkerJobFencingVersion
    ) {
      throw new Spec224AttestationError("CANONICAL_RUN_BINDING_STALE");
    }
    const [attempt] = await tx
      .select({ id: workerJobAttempts.id, attempt: workerJobAttempts.attempt })
      .from(workerJobAttempts)
      .where(
        and(
          eq(workerJobAttempts.workerJobId, job.id),
          eq(workerJobAttempts.attempt, job.attempt)
        )
      )
      .limit(1);
    if (!attempt)
      throw new Spec224AttestationError("CANONICAL_ATTEMPT_NOT_FOUND");
    const metadata =
      run.metadata && typeof run.metadata === "object"
        ? (run.metadata as Record<string, unknown>)
        : {};
    const closure = metadata.spec224RequirementClosure as
      { graph?: RequirementClosureGraph; graphDigest?: string } | undefined;
    if (!closure?.graph || typeof closure.graphDigest !== "string") {
      throw new Spec224AttestationError(
        "PERSISTED_REQUIREMENT_CLOSURE_MISSING"
      );
    }
    let graph: RequirementClosureGraph;
    try {
      graph = validateRequirementClosureGraph(closure.graph);
    } catch {
      throw new Spec224AttestationError(
        "PERSISTED_REQUIREMENT_CLOSURE_INVALID"
      );
    }
    if (sha256(canonicalJson(graph)) !== closure.graphDigest) {
      throw new Spec224AttestationError(
        "PERSISTED_REQUIREMENT_CLOSURE_DIGEST_MISMATCH"
      );
    }
    if (!graph.workPackages.some(item => item.id === input.workPackageId)) {
      throw new Spec224AttestationError(
        "WORK_PACKAGE_NOT_IN_PERSISTED_CLOSURE"
      );
    }
    const issuedAt = new Date().toISOString();
    const core = {
      schemaVersion: SCHEMA_VERSION,
      trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY" as const,
      tenantId: job.tenantId,
      runId: input.runId,
      workerJobId: job.id,
      workPackageId: input.workPackageId,
      attemptId: attempt.id,
      attempt: job.attempt,
      projectionRevision: input.expectedProjectionRevision,
      decisionEpoch: Number(run.decisionEpoch),
      developmentRunFencingVersion: Number(run.fencingVersion),
      workerJobFencingVersion: job.fencingVersion,
      developmentRepositoryRef: String(run.repositoryRef ?? ""),
      developmentBaseRevision: String(run.baseRevision ?? ""),
      sourceCommit: manifest.sourceRevision,
      sourceTree,
      sourceManifestDigest: verified.sourceManifestDigest,
      sourceSha256: verified.sourceSha256,
      specDigest: manifest.specDigest,
      profileId: manifest.profileId,
      profileVersion: SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.version,
      profileDigest: verified.profileDigest,
      bundleDigest: manifest.bundleDigest,
      artifactEvidenceDigest: verified.artifactEvidenceDigest,
      objectRef: `local-nonprod-bundle:sha256:${manifest.bundleDigest}`,
      issuer: "spec224-local-source-verifier.v1" as const,
      issuedAt,
      status: "ACTIVE" as const,
    };
    const { issuedAt: _issuedAt, ...stableIdentity } = core;
    const attestation: Spec224TrustedSourceAttestation = {
      ...core,
      attestationId: sha256(canonicalJson(stableIdentity)),
    };
    const eventIdempotencyKey = `spec224:source-attestation:${attestation.attestationId}`;
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
    if (existing) {
      const previous = existing.payloadJson?.attestation;
      if (
        existing.eventType !== EVENT_TYPE ||
        !previous ||
        canonicalJson({
          ...(previous as Record<string, unknown>),
          issuedAt: undefined,
        }) !== canonicalJson({ ...attestation, issuedAt: undefined })
      ) {
        throw new Spec224AttestationError("ATTESTATION_IDEMPOTENCY_CONFLICT");
      }
      return previous as Spec224TrustedSourceAttestation;
    }
    await appendJobEvent(tx, {
      workerJobId: job.id,
      attemptId: attempt.id,
      eventType: EVENT_TYPE,
      eventIdempotencyKey,
      payloadJson: { attestation },
    });
    return attestation;
  });
}

export function assertSpec224AttestationMatches(input: {
  attestation: Spec224TrustedSourceAttestation;
  tenantId: string;
  runId: string;
  workerJobId: string;
  workPackageId: string;
  attemptId: string;
  attempt: number;
  projectionRevision: number;
  decisionEpoch: number;
  developmentRunFencingVersion: number;
  workerJobFencingVersion: number;
  sourceCommit: string;
  sourceTree: string;
  profileDigest: string;
  bundleDigest: string;
}): void {
  const { attestation, ...expected } = input;
  const { attestationId, issuedAt: _issuedAt, ...stableIdentity } = attestation;
  if (
    attestation.schemaVersion !== SCHEMA_VERSION ||
    attestation.issuer !== "spec224-local-source-verifier.v1" ||
    sha256(canonicalJson(stableIdentity)) !== attestationId
  ) {
    throw new Spec224AttestationError("ATTESTATION_IDENTITY_INVALID");
  }
  for (const [key, value] of Object.entries(expected)) {
    if (attestation[key as keyof Spec224TrustedSourceAttestation] !== value) {
      throw new Spec224AttestationError(`ATTESTATION_BINDING_MISMATCH:${key}`);
    }
  }
  if (
    attestation.status !== "ACTIVE" ||
    attestation.trustClass !== "LOCAL_NONPRODUCTION_INTEGRITY_ONLY"
  ) {
    throw new Spec224AttestationError("ATTESTATION_NOT_ADMISSIBLE");
  }
}
