import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  runnerCapabilitySnapshots,
  runnerNodes,
  tenants,
  workerJobAttempts,
  workerJobEvents,
  workerJobs,
} from "../../drizzle/schema";
import { db, getDb } from "../db";
import { appendJobEvent } from "./jobControlPlane";
import { validateSpec224RecoveryGrant } from "./spec224RecoveryGrantValidator";
import { assertSpec224TrustedAttestationContract } from "./spec224TrustedSourceAttestation";

const BOUND_EVENT = "SPEC224_RECOVERY_GRANT_BOUND";
const BINDABLE_OPERATIONS = new Set([
  "read_source",
  "modify_owned_paths",
  "run_focused_tests",
  "commit_owned_changes",
]);

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function bindingPayload(value: unknown): RecordValue | null {
  const raw = record(value);
  if (
    !raw ||
    raw.schemaVersion !== "spec224.recovery-grant-binding.v1" ||
    typeof raw.grantId !== "string" ||
    typeof raw.scopeDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.scopeDigest) ||
    !Number.isSafeInteger(raw.grantVersion) ||
    Number(raw.grantVersion) < 1 ||
    typeof raw.tenantId !== "string" ||
    !Number.isSafeInteger(raw.ownerId) ||
    Number(raw.ownerId) < 1 ||
    typeof raw.runId !== "string" ||
    typeof raw.workerJobId !== "string" ||
    typeof raw.workPackageId !== "string" ||
    typeof raw.attestationId !== "string" ||
    typeof raw.operation !== "string" ||
    typeof raw.path !== "string" ||
    typeof raw.boundAt !== "string"
  )
    return null;
  return raw;
}

export class Spec224RecoveryGrantBindingError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "Spec224RecoveryGrantBindingError";
  }
}

export function sameSpec224RecoveryGrantBinding(
  existing: unknown,
  candidate: unknown
): boolean {
  const prior = record(existing);
  const next = record(candidate);
  if (!prior || !next) return false;
  const { boundAt: _priorBoundAt, ...priorIdentity } = prior;
  const { boundAt: _nextBoundAt, ...nextIdentity } = next;
  return isDeepStrictEqual(priorIdentity, nextIdentity);
}

export function createSpec224RecoveryGrantBindingPayload(input: {
  grantId: string;
  grantVersion: number;
  scopeDigest: string;
  canonical: RecordValue;
  operation: string;
  path: string;
  boundAt: string;
}): RecordValue {
  const canonical = input.canonical;
  return {
    schemaVersion: "spec224.recovery-grant-binding.v1",
    grantId: input.grantId,
    grantVersion: input.grantVersion,
    scopeDigest: input.scopeDigest,
    tenantId: canonical.tenantId,
    ownerId: canonical.ownerId,
    runId: canonical.runId,
    workerJobId: canonical.workerJobId,
    workPackageId: canonical.workPackageId,
    operation: input.operation,
    path: input.path,
    sourceCommit: canonical.sourceCommit,
    sourceTree: canonical.sourceTree,
    sourceSha256: canonical.sourceSha256,
    sourceManifestDigest: canonical.sourceManifestDigest,
    profileId: canonical.profileId,
    profileVersion: canonical.profileVersion,
    profileDigest: canonical.profileDigest,
    bundleDigest: canonical.bundleDigest,
    artifactEvidenceDigest: canonical.artifactEvidenceDigest,
    trustClass: canonical.trustClass,
    trustLevel: canonical.trustLevel,
    attestationId: canonical.attestationId,
    attemptId: canonical.attemptId,
    attempt: canonical.attempt,
    revision: canonical.revision,
    decisionEpoch: canonical.decisionEpoch,
    developmentRunFencingVersion: canonical.developmentRunFencingVersion,
    workerJobFencingVersion: canonical.workerJobFencingVersion,
    runtimeBinding: canonical.runtimeBinding,
    admissionBinding: canonical.admissionBinding,
    boundAt: input.boundAt,
  };
}

function sameRunnerBinding(value: unknown, expected: RecordValue): boolean {
  const binding = record(value);
  return Boolean(
    binding &&
    binding.runnerId === expected.runnerId &&
    binding.runnerSessionId === expected.runnerSessionId &&
    binding.capabilitySnapshotId === expected.capabilitySnapshotId &&
    binding.capabilitySnapshotRevision === expected.capabilitySnapshotRevision
  );
}

export function spec224RecoveryGrantBindingStateIsCurrent(input: {
  tenantOwnerId: number;
  expectedOwnerId: number;
  jobStatus: string;
  jobStatusReason: string | null;
  jobAttempt: number;
  jobFencingVersion: number;
  expectedJobFencingVersion: number;
  expectedAttempt: number;
  run: RecordValue;
  requestedByUserId: number;
  expectedRunId: string;
  expectedRevision: number;
  expectedDecisionEpoch: number;
  expectedRunFencingVersion: number;
  authorizationBinding: unknown;
  expectedRunnerBinding: RecordValue;
  attemptId: string;
  expectedAttemptId: string;
  attemptFinishedAt: Date | null;
  runner: {
    ownerUserId: number | null;
    status: string;
    trustState: string;
    activeSessionId: string | null;
    currentSnapshotRevision: string | null;
    revokedAt: Date | null;
  } | null;
  capability: {
    expiresAt: Date;
    snapshotJson: unknown;
  } | null;
  now: Date;
}): boolean {
  const policy = input.expectedRunnerBinding;
  const capability = record(input.capability?.snapshotJson);
  return Boolean(
    input.tenantOwnerId === input.expectedOwnerId &&
    ["pending", "queued", "running"].includes(input.jobStatus) &&
    !input.jobStatusReason?.startsWith("cancel_requested:") &&
    input.jobAttempt === input.expectedAttempt &&
    input.jobFencingVersion === input.expectedJobFencingVersion &&
    input.run.actorId === input.requestedByUserId &&
    input.run.runId === input.expectedRunId &&
    Number(input.run.projectionVersion) === input.expectedRevision &&
    Number(input.run.decisionEpoch) === input.expectedDecisionEpoch &&
    Number(input.run.fencingVersion) === input.expectedRunFencingVersion &&
    input.attemptId === input.expectedAttemptId &&
    input.attemptFinishedAt === null &&
    sameRunnerBinding(input.authorizationBinding, policy) &&
    input.runner?.ownerUserId === input.expectedOwnerId &&
    input.runner.status === "online" &&
    input.runner.trustState === "trusted" &&
    input.runner.revokedAt === null &&
    input.runner.activeSessionId === policy.runnerSessionId &&
    input.runner.currentSnapshotRevision ===
      policy.capabilitySnapshotRevision &&
    input.capability !== null &&
    input.capability.expiresAt > input.now &&
    capability?.capabilitySnapshotId === policy.capabilitySnapshotId &&
    capability?.runnerSessionId === policy.runnerSessionId
  );
}

/**
 * Bind an already-issued Python-authority grant to exactly one canonical run/job.
 * The grant ID is only an assertion: Python validates owner, tenant, scope,
 * source, revision, lease, Runner and attestation bindings before this event is
 * persisted. A conflicting second grant cannot overwrite the first.
 */
export async function bindSpec224RecoveryGrant(input: {
  tenantId: string;
  actorId: number;
  runId: string;
  grantId: string;
  operation: string;
  path: string;
}): Promise<{
  grantId: string;
  scopeDigest: string;
  grantVersion: number;
  replayed: boolean;
}> {
  if (
    !input.tenantId ||
    !Number.isSafeInteger(input.actorId) ||
    input.actorId < 1 ||
    !input.runId ||
    !/^[0-9a-f-]{36}$/i.test(input.grantId) ||
    !BINDABLE_OPERATIONS.has(input.operation) ||
    !input.path ||
    input.path.length > 500 ||
    input.path.startsWith("/") ||
    input.path.split("/").some(part => !part || part === "." || part === "..")
  )
    throw new Spec224RecoveryGrantBindingError(
      "SPEC224_GRANT_BINDING_REQUEST_INVALID"
    );

  getDb();
  const idempotencyKey = `spec224:recovery-grant-binding:${input.runId}`;
  const canonical = await db.instance.transaction(async tx => {
    const [tenant] = await tx
      .select({ ownerId: tenants.ownerId })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .for("share")
      .limit(1);
    if (!tenant?.ownerId || tenant.ownerId !== input.actorId)
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_OWNER_REQUIRED"
      );
    const [job] = await tx
      .select({
        id: workerJobs.id,
        tenantId: workerJobs.tenantId,
        requestedByUserId: workerJobs.requestedByUserId,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        status: workerJobs.status,
        inputJson: workerJobs.inputJson,
        progressJson: workerJobs.progressJson,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, input.tenantId),
          sql`${workerJobs.progressJson}->'spec224'->>'runId' = ${input.runId}`
        )
      )
      .for("update")
      .limit(1);
    if (!job || !record(job.progressJson.spec224))
      throw new Spec224RecoveryGrantBindingError("RUN_NOT_FOUND");
    if (!["pending", "queued", "running"].includes(job.status))
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_JOB_STATE_INVALID"
      );
    const run = record(job.progressJson.spec224)!;
    const runRevision = asInt(run.projectionVersion);
    const runFence = asInt(run.fencingVersion);
    const decisionEpoch = asInt(run.decisionEpoch);
    const authorization = record(job.progressJson.spec224Authorization);
    const policyBinding = record(authorization?.binding);
    if (
      run.tenantId !== input.tenantId ||
      run.runId !== input.runId ||
      run.workerJobId !== job.id ||
      run.actorId !== job.requestedByUserId ||
      !run.workPackageId ||
      runRevision === null ||
      runFence === null ||
      decisionEpoch === null ||
      !policyBinding
    ) {
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_CANONICAL_STATE_INVALID"
      );
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
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_ATTEMPT_MISSING"
      );
    const [attestedEvent] = await tx
      .select({
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
      })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, job.id),
          eq(workerJobEvents.eventType, "SPEC224_SOURCE_ATTESTED")
        )
      )
      .orderBy(desc(workerJobEvents.createdAt))
      .limit(1);
    const attestation = record(attestedEvent?.payloadJson?.attestation);
    if (attestedEvent?.eventType !== "SPEC224_SOURCE_ATTESTED" || !attestation)
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_ATTESTATION_MISSING"
      );
    try {
      assertSpec224TrustedAttestationContract(attestation);
    } catch {
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_ATTESTATION_INVALID"
      );
    }
    const attestationId = attestation.attestationId;
    if (
      attestation.tenantId !== input.tenantId ||
      attestation.ownerId !== run.actorId ||
      attestation.runId !== input.runId ||
      attestation.workerJobId !== job.id ||
      attestation.workPackageId !== run.workPackageId ||
      attestation.attempt !== job.attempt ||
      attestation.projectionRevision !== runRevision ||
      attestation.developmentRunFencingVersion !== runFence ||
      attestation.workerJobFencingVersion !== job.fencingVersion ||
      typeof attestationId !== "string" ||
      attestation.status !== "ACTIVE"
    )
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_ATTESTATION_STALE"
      );
    const [invalidation] = await tx
      .select({ id: workerJobEvents.id })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, job.id),
          eq(
            workerJobEvents.eventIdempotencyKey,
            `spec224:source-attestation-invalidated:${attestationId}`
          )
        )
      )
      .limit(1);
    if (invalidation)
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_ATTESTATION_INVALIDATED"
      );

    const requiredPolicyFields = [
      "runnerId",
      "runnerSessionId",
      "capabilitySnapshotId",
      "capabilitySnapshotRevision",
    ];
    if (
      requiredPolicyFields.some(
        field =>
          typeof policyBinding[field] !== "string" ||
          !String(policyBinding[field]).trim()
      )
    )
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_RUNNER_SNAPSHOT_MISSING"
      );
    const [runner] = await tx
      .select({
        runnerId: runnerNodes.runnerId,
        ownerUserId: runnerNodes.ownerUserId,
        status: runnerNodes.status,
        trustState: runnerNodes.trustState,
        activeSessionId: runnerNodes.activeSessionId,
        currentSnapshotRevision: runnerNodes.currentSnapshotRevision,
        revokedAt: runnerNodes.revokedAt,
      })
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.runnerId, String(policyBinding.runnerId)),
          eq(runnerNodes.tenantId, input.tenantId)
        )
      )
      .for("share")
      .limit(1);
    const [capabilitySnapshot] = await tx
      .select({
        id: runnerCapabilitySnapshots.id,
        revision: runnerCapabilitySnapshots.revision,
        expiresAt: runnerCapabilitySnapshots.expiresAt,
        snapshotJson: runnerCapabilitySnapshots.snapshotJson,
      })
      .from(runnerCapabilitySnapshots)
      .where(
        and(
          eq(
            runnerCapabilitySnapshots.runnerId,
            String(policyBinding.runnerId)
          ),
          eq(runnerCapabilitySnapshots.tenantId, input.tenantId),
          eq(
            runnerCapabilitySnapshots.revision,
            String(policyBinding.capabilitySnapshotRevision)
          )
        )
      )
      .for("share")
      .limit(1);
    const snapshotJson = record(capabilitySnapshot?.snapshotJson);
    if (
      !runner ||
      runner.ownerUserId !== input.actorId ||
      runner.status !== "online" ||
      runner.trustState !== "trusted" ||
      runner.revokedAt ||
      runner.activeSessionId !== policyBinding.runnerSessionId ||
      runner.currentSnapshotRevision !==
        policyBinding.capabilitySnapshotRevision ||
      !capabilitySnapshot ||
      capabilitySnapshot.expiresAt <= new Date() ||
      snapshotJson?.capabilitySnapshotId !==
        policyBinding.capabilitySnapshotId ||
      snapshotJson?.runnerSessionId !== policyBinding.runnerSessionId
    )
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_RUNNER_SNAPSHOT_MISSING"
      );
    const runtimeBinding = {
      tenantId: input.tenantId,
      ownerId: tenant.ownerId,
      runId: input.runId,
      workerJobId: job.id,
      attempt: job.attempt,
      revision: runRevision,
      decisionEpoch,
      developmentRunFencingVersion: runFence,
      workerJobFencingVersion: job.fencingVersion,
      runnerId: policyBinding.runnerId,
      runnerSessionId: policyBinding.runnerSessionId,
      capabilitySnapshotId: policyBinding.capabilitySnapshotId,
      capabilitySnapshotRevision: policyBinding.capabilitySnapshotRevision,
    };
    const admissionBinding = {
      ...runtimeBinding,
      workPackageId: run.workPackageId,
      attemptId: attempt.id,
      sourceCommit: attestation.sourceCommit,
      sourceTree: attestation.sourceTree,
      sourceSha256: attestation.sourceSha256,
      sourceManifestDigest: attestation.sourceManifestDigest,
      profileId: attestation.profileId,
      profileVersion: attestation.profileVersion,
      profileDigest: attestation.profileDigest,
      bundleDigest: attestation.bundleDigest,
      artifactEvidenceDigest: attestation.artifactEvidenceDigest,
      attestationId,
    };
    return {
      workerJobId: job.id,
      tenantId: input.tenantId,
      ownerId: tenant.ownerId,
      runId: input.runId,
      workPackageId: String(run.workPackageId),
      attemptId: attempt.id,
      attempt: job.attempt,
      revision: runRevision,
      decisionEpoch,
      developmentRunFencingVersion: runFence,
      workerJobFencingVersion: job.fencingVersion,
      sourceCommit: String(attestation.sourceCommit),
      sourceTree: String(attestation.sourceTree),
      sourceSha256: String(attestation.sourceSha256),
      sourceManifestDigest: String(attestation.sourceManifestDigest),
      profileId: String(attestation.profileId),
      profileVersion: Number(attestation.profileVersion),
      profileDigest: String(attestation.profileDigest),
      bundleDigest: String(attestation.bundleDigest),
      artifactEvidenceDigest: String(attestation.artifactEvidenceDigest),
      trustClass: attestation.trustClass,
      trustLevel: attestation.trustLevel,
      attestationId,
      runtimeBinding,
      admissionBinding,
      idempotencyKey,
    };
  });

  const validation = await validateSpec224RecoveryGrant({
    grantId: input.grantId,
    tenantId: canonical.tenantId,
    sourceCommit: canonical.sourceCommit,
    sourceSha256: canonical.sourceSha256,
    workpackageId: canonical.workPackageId,
    operation: input.operation,
    path: input.path,
    runtimeScope: "node-control-plane",
    environmentScope: "isolated-non-production",
    runtimeBinding: canonical.runtimeBinding,
    admissionBinding: canonical.admissionBinding,
  });
  if (
    validation.result !== "VALID" ||
    !validation.scopeDigest ||
    !validation.grantVersion
  )
    throw new Spec224RecoveryGrantBindingError(
      `SPEC224_GRANT_BINDING_${validation.result}`
    );

  const payload = createSpec224RecoveryGrantBindingPayload({
    grantId: input.grantId,
    grantVersion: validation.grantVersion,
    scopeDigest: validation.scopeDigest,
    canonical,
    operation: input.operation,
    path: input.path,
    boundAt: validation.validatedAt,
  });

  return db.instance.transaction(async tx => {
    const [tenant] = await tx
      .select({ ownerId: tenants.ownerId })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .for("share")
      .limit(1);
    const [job] = await tx
      .select({
        id: workerJobs.id,
        tenantId: workerJobs.tenantId,
        requestedByUserId: workerJobs.requestedByUserId,
        progressJson: workerJobs.progressJson,
        fencingVersion: workerJobs.fencingVersion,
        attempt: workerJobs.attempt,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.id, canonical.workerJobId),
          eq(workerJobs.tenantId, input.tenantId)
        )
      )
      .for("update")
      .limit(1);
    const currentRun = record(job?.progressJson.spec224);
    const currentAuthorization = record(job?.progressJson.spec224Authorization);
    if (
      !tenant ||
      tenant.ownerId !== canonical.ownerId ||
      !job ||
      !currentRun ||
      !["pending", "queued", "running"].includes(job.status) ||
      job.statusReason?.startsWith("cancel_requested:") ||
      currentRun.actorId !== job.requestedByUserId ||
      currentRun.runId !== canonical.runId ||
      Number(currentRun.projectionVersion) !== canonical.revision ||
      Number(currentRun.decisionEpoch) !== canonical.decisionEpoch ||
      Number(currentRun.fencingVersion) !==
        canonical.developmentRunFencingVersion ||
      job.fencingVersion !== canonical.workerJobFencingVersion ||
      job.attempt !== canonical.attempt ||
      !sameRunnerBinding(
        currentAuthorization?.binding,
        canonical.runtimeBinding
      )
    ) {
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_CANONICAL_STATE_CHANGED"
      );
    }
    const [attempt] = await tx
      .select({
        id: workerJobAttempts.id,
        finishedAt: workerJobAttempts.finishedAt,
      })
      .from(workerJobAttempts)
      .where(
        and(
          eq(workerJobAttempts.workerJobId, job.id),
          eq(workerJobAttempts.attempt, canonical.attempt)
        )
      )
      .for("update")
      .limit(1);
    const [invalidation] = await tx
      .select({ id: workerJobEvents.id })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, job.id),
          eq(
            workerJobEvents.eventIdempotencyKey,
            `spec224:source-attestation-invalidated:${canonical.attestationId}`
          )
        )
      )
      .limit(1);
    if (invalidation)
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_ATTESTATION_INVALIDATED"
      );
    const [runner] = await tx
      .select({
        ownerUserId: runnerNodes.ownerUserId,
        status: runnerNodes.status,
        trustState: runnerNodes.trustState,
        activeSessionId: runnerNodes.activeSessionId,
        currentSnapshotRevision: runnerNodes.currentSnapshotRevision,
        revokedAt: runnerNodes.revokedAt,
      })
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.runnerId, String(canonical.runtimeBinding.runnerId)),
          eq(runnerNodes.tenantId, input.tenantId)
        )
      )
      .for("share")
      .limit(1);
    const [capability] = await tx
      .select({
        revision: runnerCapabilitySnapshots.revision,
        expiresAt: runnerCapabilitySnapshots.expiresAt,
        snapshotJson: runnerCapabilitySnapshots.snapshotJson,
      })
      .from(runnerCapabilitySnapshots)
      .where(
        and(
          eq(
            runnerCapabilitySnapshots.runnerId,
            String(canonical.runtimeBinding.runnerId)
          ),
          eq(runnerCapabilitySnapshots.tenantId, input.tenantId),
          eq(
            runnerCapabilitySnapshots.revision,
            String(canonical.runtimeBinding.capabilitySnapshotRevision)
          )
        )
      )
      .for("share")
      .limit(1);
    if (
      !spec224RecoveryGrantBindingStateIsCurrent({
        tenantOwnerId: tenant?.ownerId ?? 0,
        expectedOwnerId: canonical.ownerId,
        jobStatus: job?.status ?? "missing",
        jobStatusReason: job?.statusReason ?? null,
        jobAttempt: job?.attempt ?? 0,
        jobFencingVersion: job?.fencingVersion ?? 0,
        expectedJobFencingVersion: canonical.workerJobFencingVersion,
        expectedAttempt: canonical.attempt,
        run: currentRun ?? {},
        requestedByUserId: job?.requestedByUserId ?? 0,
        expectedRunId: canonical.runId,
        expectedRevision: canonical.revision,
        expectedDecisionEpoch: canonical.decisionEpoch,
        expectedRunFencingVersion: canonical.developmentRunFencingVersion,
        authorizationBinding: currentAuthorization?.binding,
        expectedRunnerBinding: canonical.runtimeBinding,
        attemptId: attempt?.id ?? "",
        expectedAttemptId: canonical.attemptId,
        attemptFinishedAt: attempt?.finishedAt ?? null,
        runner: runner ?? null,
        capability: capability ?? null,
        now: new Date(),
      })
    )
      throw new Spec224RecoveryGrantBindingError(
        "SPEC224_GRANT_BINDING_STATE_STALE"
      );
    const [existing] = await tx
      .select({
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
      })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, job.id),
          eq(workerJobEvents.eventIdempotencyKey, canonical.idempotencyKey)
        )
      )
      .limit(1);
    if (existing) {
      if (
        existing.eventType !== BOUND_EVENT ||
        !sameSpec224RecoveryGrantBinding(existing.payloadJson, payload)
      )
        throw new Spec224RecoveryGrantBindingError(
          "SPEC224_GRANT_BINDING_CONFLICT"
        );
      return {
        grantId: input.grantId,
        scopeDigest: validation.scopeDigest,
        grantVersion: validation.grantVersion,
        replayed: true,
      };
    }
    await appendJobEvent(tx, {
      workerJobId: job.id,
      eventType: BOUND_EVENT,
      eventIdempotencyKey: canonical.idempotencyKey,
      attemptId: canonical.attemptId,
      payloadJson: payload,
    });
    return {
      grantId: input.grantId,
      scopeDigest: validation.scopeDigest,
      grantVersion: validation.grantVersion,
      replayed: false,
    };
  });
}

export function parseSpec224RecoveryGrantBinding(
  value: unknown
): RecordValue | null {
  return bindingPayload(value);
}
