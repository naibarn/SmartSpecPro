import { createHash } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import {
  runnerCapabilitySnapshots,
  runnerNodes,
  tenants,
  workerJobAttempts,
  workerJobEvents,
  workerJobs,
} from "../../drizzle/schema";
import { db, getDb } from "../db";
import type { DrizzleDB } from "../db";
import type { LeaseContext } from "./jobControlPlaneTypes";
import { validateSpec224RecoveryGrant } from "./spec224RecoveryGrantValidator";
import { acquireSpec224RecoveryGrantFence } from "./spec224RecoveryGrantFence";
import { appendJobEvent } from "./jobControlPlane";

export type Spec224AdmissionDenialReason =
  | "DENIED_NO_ATTESTATION"
  | "DENIED_LOCAL_ONLY_ATTESTATION"
  | "DENIED_REMOTE_TRUST_MISSING"
  | "DENIED_ATTESTATION_INVALID"
  | "DENIED_ATTESTATION_BINDING"
  | "DENIED_STALE_REVISION"
  | "DENIED_STALE_FENCE"
  | "DENIED_LEASE_INVALID"
  | "DENIED_CANCELLED"
  | "DENIED_ADMISSION_NOT_ENABLED"
  | "DENIED_ADMISSION_AUTHORITY_UNAVAILABLE"
  | "DENIED_NO_GRANT"
  | "DENIED_GRANT_BINDING"
  | "DENIED_GRANT_INVALID"
  | "DENIED_REMOTE_TRUST_REQUIRED"
  | "DENIED_RUNNER_BINDING";

export type Spec224RuntimeAdmissionDecision =
  | { decision: "NOT_APPLICABLE" }
  | { decision: "DENY"; reason: Spec224AdmissionDenialReason };

export type Spec224CanonicalAdmissionSnapshot = {
  tenantId: string;
  tenantOwnerId: number | null;
  workerJobId: string;
  jobStatus: string;
  jobStatusReason: string | null;
  actorId: number;
  attempt: number;
  currentAttemptId: string;
  attemptLeaseGeneration: number | null;
  workerJobFencingVersion: number;
  leaseValid: boolean;
  lease: Pick<LeaseContext, "jobId" | "attemptId" | "fencingVersion">;
  run: {
    runId: string;
    tenantId: string;
    workerJobId: string;
    actorId: number;
    workPackageId: string;
    attempt: number;
    revision: number;
    developmentRunFencingVersion: number;
  } | null;
  attestation: Record<string, unknown> | null;
  grantBinding: Record<string, unknown> | null;
  runnerBindingValid: boolean;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

/**
 * This evaluator is intentionally deny-only. Remote trust does not authorize
 * work until its verifier, grant resolver, and protected callsite contract are
 * implemented and independently tested.
 */
export function evaluateSpec224RuntimeAdmission(
  snapshot: Spec224CanonicalAdmissionSnapshot
): Spec224RuntimeAdmissionDecision {
  const { run, lease } = snapshot;
  if (snapshot.jobStatusReason?.startsWith("cancel_requested:")) {
    return { decision: "DENY", reason: "DENIED_CANCELLED" };
  }
  if (snapshot.jobStatus !== "running") {
    return { decision: "DENY", reason: "DENIED_LEASE_INVALID" };
  }
  if (!run) return { decision: "DENY", reason: "DENIED_ATTESTATION_BINDING" };
  if (!snapshot.leaseValid) {
    return { decision: "DENY", reason: "DENIED_LEASE_INVALID" };
  }
  if (
    run.tenantId !== snapshot.tenantId ||
    run.workerJobId !== snapshot.workerJobId ||
    run.actorId !== snapshot.actorId ||
    !run.runId ||
    !run.workPackageId
  ) {
    return { decision: "DENY", reason: "DENIED_ATTESTATION_BINDING" };
  }
  if (
    lease.jobId !== snapshot.workerJobId ||
    lease.attemptId !== snapshot.currentAttemptId ||
    lease.fencingVersion !== snapshot.workerJobFencingVersion ||
    run.attempt !== snapshot.attempt
  ) {
    return { decision: "DENY", reason: "DENIED_STALE_FENCE" };
  }
  if (!snapshot.attestation) {
    return { decision: "DENY", reason: "DENIED_NO_ATTESTATION" };
  }
  const attestation = snapshot.attestation;
  if (attestation.status !== "ACTIVE") {
    return { decision: "DENY", reason: "DENIED_ATTESTATION_INVALID" };
  }
  if (attestation.projectionRevision !== run.revision) {
    return { decision: "DENY", reason: "DENIED_STALE_REVISION" };
  }
  if (
    attestation.attempt !== snapshot.attempt ||
    attestation.developmentRunFencingVersion !==
      run.developmentRunFencingVersion ||
    attestation.workerJobFencingVersion !== snapshot.workerJobFencingVersion
  ) {
    return { decision: "DENY", reason: "DENIED_STALE_FENCE" };
  }
  if (
    attestation.tenantId !== run.tenantId ||
    attestation.runId !== run.runId ||
    attestation.workerJobId !== run.workerJobId ||
    attestation.workPackageId !== run.workPackageId ||
    attestation.actorId !== run.actorId ||
    attestation.attempt !== run.attempt
  ) {
    return { decision: "DENY", reason: "DENIED_ATTESTATION_BINDING" };
  }

  const trustLevel =
    attestation.schemaVersion === "spec224.trusted-source-attestation.v1"
      ? attestation.trustClass
      : attestation.trustLevel;
  if (trustLevel === "LOCAL_NONPRODUCTION_INTEGRITY_ONLY") {
    return { decision: "DENY", reason: "DENIED_LOCAL_ONLY_ATTESTATION" };
  }
  if (trustLevel === "REMOTE_TEST_TRUSTED") {
    if (
      typeof attestation.remoteTrustEvidenceDigest !== "string" ||
      !SHA256_PATTERN.test(attestation.remoteTrustEvidenceDigest) ||
      typeof attestation.storageObjectReference !== "string" ||
      !attestation.storageObjectReference.startsWith("s3://")
    ) {
      return { decision: "DENY", reason: "DENIED_REMOTE_TRUST_MISSING" };
    }
    return { decision: "DENY", reason: "DENIED_ADMISSION_NOT_ENABLED" };
  }
  return { decision: "DENY", reason: "DENIED_ATTESTATION_INVALID" };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function runFromJob(job: {
  id: string;
  tenantId: string;
  requestedByUserId: number | null;
  attempt: number;
  progressJson: Record<string, unknown>;
  inputJson: Record<string, unknown>;
}): Spec224CanonicalAdmissionSnapshot["run"] {
  const progress = asObject(job.progressJson.spec224);
  const input = asObject(job.inputJson.spec224Run);
  const run = progress ?? input;
  if (!run) return null;
  const revision = Number(run.projectionVersion);
  const fencingVersion = Number(run.fencingVersion);
  const actorId = Number(run.actorId);
  if (
    typeof run.runId !== "string" ||
    typeof run.workPackageId !== "string" ||
    !Number.isSafeInteger(revision) ||
    !Number.isSafeInteger(fencingVersion) ||
    !Number.isSafeInteger(actorId)
  ) {
    return null;
  }
  return {
    runId: run.runId,
    tenantId: String(run.tenantId ?? ""),
    workerJobId: String(run.workerJobId ?? ""),
    actorId,
    workPackageId: run.workPackageId,
    attempt: job.attempt,
    revision,
    developmentRunFencingVersion: fencingVersion,
  };
}

export async function loadSpec224CanonicalAdmissionSnapshot(
  input: {
    tenantId: string;
    workerJobId: string;
    lease: LeaseContext;
  },
  transaction?: DrizzleDB
): Promise<Spec224CanonicalAdmissionSnapshot | null> {
  getDb();
  const load = async (tx: DrizzleDB) => {
    const jobQuery = tx
      .select({
        id: workerJobs.id,
        tenantId: workerJobs.tenantId,
        tenantOwnerId: tenants.ownerId,
        requestedByUserId: workerJobs.requestedByUserId,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        leaseExpiresAt: workerJobs.leaseExpiresAt,
        progressJson: workerJobs.progressJson,
        inputJson: workerJobs.inputJson,
      })
      .from(workerJobs)
      .innerJoin(tenants, eq(tenants.id, workerJobs.tenantId))
      .where(eq(workerJobs.id, input.workerJobId));
    const [job] = await (transaction ? jobQuery.for("update") : jobQuery).limit(
      1
    );
    if (!job || job.tenantId !== input.tenantId) return null;
    const run = runFromJob(job);
    if (!run) return null;
    const attemptQuery = tx
      .select({
        id: workerJobAttempts.id,
        leaseGeneration: workerJobAttempts.leaseGeneration,
        leaseTokenHash: workerJobAttempts.leaseTokenHash,
        leaseExpiresAt: workerJobAttempts.leaseExpiresAt,
        finishedAt: workerJobAttempts.finishedAt,
      })
      .from(workerJobAttempts)
      .where(
        and(
          eq(workerJobAttempts.workerJobId, job.id),
          eq(workerJobAttempts.attempt, job.attempt)
        )
      );
    const [attempt] = await (
      transaction ? attemptQuery.for("update") : attemptQuery
    ).limit(1);
    const now = Date.now();
    const leaseValid = Boolean(
      job.status === "running" &&
      attempt &&
      !attempt.finishedAt &&
      attempt.id === input.lease.attemptId &&
      job.id === input.lease.jobId &&
      job.fencingVersion === input.lease.fencingVersion &&
      attempt.leaseTokenHash ===
        createHash("sha256").update(input.lease.leaseToken).digest("hex") &&
      job.leaseExpiresAt &&
      job.leaseExpiresAt.getTime() > now &&
      attempt.leaseExpiresAt &&
      attempt.leaseExpiresAt.getTime() > now
    );
    if (!leaseValid) {
      return {
        tenantId: job.tenantId,
        tenantOwnerId: job.tenantOwnerId,
        workerJobId: job.id,
        jobStatus: job.status,
        jobStatusReason: job.statusReason,
        actorId: job.requestedByUserId ?? -1,
        attempt: job.attempt,
        currentAttemptId: attempt?.id ?? "",
        attemptLeaseGeneration: attempt?.leaseGeneration ?? null,
        workerJobFencingVersion: job.fencingVersion,
        leaseValid: false,
        lease: {
          jobId: input.lease.jobId,
          attemptId: input.lease.attemptId,
          fencingVersion: input.lease.fencingVersion,
        },
        run,
        attestation: null,
        grantBinding: null,
        runnerBindingValid: false,
      };
    }
    const [event] = await tx
      .select({ payloadJson: workerJobEvents.payloadJson })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, job.id),
          eq(workerJobEvents.eventType, "SPEC224_SOURCE_ATTESTED")
        )
      )
      .orderBy(desc(workerJobEvents.createdAt))
      .limit(1);
    const persistedAttestation = asObject(event?.payloadJson?.attestation);
    const attestationId = persistedAttestation?.attestationId;
    let attestation = persistedAttestation;
    if (typeof attestationId === "string") {
      const invalidationQuery = tx
        .select({
          eventType: workerJobEvents.eventType,
          payloadJson: workerJobEvents.payloadJson,
        })
        .from(workerJobEvents)
        .where(
          and(
            eq(workerJobEvents.workerJobId, job.id),
            eq(
              workerJobEvents.eventIdempotencyKey,
              `spec224:source-attestation-invalidated:${attestationId}`
            )
          )
        );
      const [invalidationEvent] = await (
        transaction ? invalidationQuery.for("share") : invalidationQuery
      ).limit(1);
      if (invalidationEvent) {
        const invalidation = invalidationEvent.payloadJson ?? {};
        if (
          invalidationEvent.eventType !==
            "SPEC224_SOURCE_ATTESTATION_INVALIDATED" ||
          invalidation.attestationId !== attestationId ||
          invalidation.actorId !== persistedAttestation?.ownerId ||
          typeof invalidation.invalidatedAt !== "string" ||
          ![
            "SOURCE_CHANGED",
            "BUNDLE_REVOKED",
            "OWNER_REVOKED",
            "SECURITY_REVIEW",
          ].includes(String(invalidation.reason))
        ) {
          return {
            tenantId: job.tenantId,
            tenantOwnerId: job.tenantOwnerId,
            workerJobId: job.id,
            jobStatus: job.status,
            jobStatusReason: job.statusReason,
            actorId: job.requestedByUserId ?? -1,
            attempt: job.attempt,
            currentAttemptId: attempt!.id,
            attemptLeaseGeneration: attempt!.leaseGeneration,
            workerJobFencingVersion: job.fencingVersion,
            leaseValid: true,
            lease: input.lease,
            run,
            attestation: null,
            grantBinding: null,
            runnerBindingValid: false,
          };
        }
        attestation = {
          ...persistedAttestation,
          status: "INVALIDATED",
          invalidatedAt: invalidation.invalidatedAt,
          invalidationReason: invalidation.reason,
        };
      }
    }
    const [grantEvent] = await tx
      .select({
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
      })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, job.id),
          eq(
            workerJobEvents.eventIdempotencyKey,
            `spec224:recovery-grant-binding:${run.runId}`
          )
        )
      )
      .limit(1);
    const grantBinding =
      grantEvent?.eventType === "SPEC224_RECOVERY_GRANT_BOUND"
        ? asObject(grantEvent.payloadJson)
        : null;
    let runnerBindingValid = false;
    const runtimeBinding = asObject(grantBinding?.runtimeBinding);
    if (grantBinding && runtimeBinding) {
      const runnerQuery = tx
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
            eq(runnerNodes.runnerId, String(runtimeBinding.runnerId ?? "")),
            eq(runnerNodes.tenantId, job.tenantId)
          )
        );
      const [runner] = await (
        transaction ? runnerQuery.for("share") : runnerQuery
      ).limit(1);
      const capabilityQuery = tx
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
              String(runtimeBinding.runnerId ?? "")
            ),
            eq(runnerCapabilitySnapshots.tenantId, job.tenantId),
            eq(
              runnerCapabilitySnapshots.revision,
              String(runtimeBinding.capabilitySnapshotRevision ?? "")
            )
          )
        );
      const [capability] = await (
        transaction ? capabilityQuery.for("share") : capabilityQuery
      ).limit(1);
      const capabilityJson = asObject(capability?.snapshotJson);
      runnerBindingValid = Boolean(
        runner &&
        capability &&
        runner.ownerUserId === run.actorId &&
        runner.status === "online" &&
        runner.trustState === "trusted" &&
        !runner.revokedAt &&
        runner.activeSessionId === runtimeBinding.runnerSessionId &&
        runner.currentSnapshotRevision ===
          runtimeBinding.capabilitySnapshotRevision &&
        capability.revision === runtimeBinding.capabilitySnapshotRevision &&
        capability.expiresAt.getTime() > now &&
        capabilityJson?.capabilitySnapshotId ===
          runtimeBinding.capabilitySnapshotId &&
        capabilityJson?.runnerSessionId === runtimeBinding.runnerSessionId
      );
    }
    return {
      tenantId: job.tenantId,
      tenantOwnerId: job.tenantOwnerId,
      workerJobId: job.id,
      jobStatus: job.status,
      jobStatusReason: job.statusReason,
      actorId: job.requestedByUserId ?? -1,
      attempt: job.attempt,
      currentAttemptId: attempt!.id,
      attemptLeaseGeneration: attempt!.leaseGeneration,
      workerJobFencingVersion: job.fencingVersion,
      leaseValid: true,
      lease: input.lease,
      run,
      attestation,
      grantBinding,
      runnerBindingValid,
    };
  };
  return transaction ? load(transaction) : db.transaction(load);
}

let testSnapshotLoader:
  | ((input: {
      tenantId: string;
      workerJobId: string;
      lease: LeaseContext;
    }) => Promise<Spec224CanonicalAdmissionSnapshot | null>)
  | null = null;

export function setSpec224AdmissionSnapshotLoaderForTests(
  loader: typeof testSnapshotLoader
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("SPEC224_ADMISSION_TEST_OVERRIDE_FORBIDDEN");
  }
  testSnapshotLoader = loader;
}

export function resetSpec224AdmissionSnapshotLoaderForTests(): void {
  testSnapshotLoader = null;
}

async function recordGrantValidation(input: {
  snapshot: Spec224CanonicalAdmissionSnapshot;
  result: string;
  validatedAt: string;
  transaction?: DrizzleDB;
}): Promise<void> {
  const binding = input.snapshot.grantBinding;
  const run = input.snapshot.run;
  if (!run) return;
  const grantId = binding?.grantId ?? "none";
  const key = `spec224:grant-validation:${run.runId}:${input.snapshot.attempt}:${input.snapshot.workerJobFencingVersion}:${String(grantId)}:${input.result}`;
  const payload = {
    schemaVersion: "spec224.recovery-grant-validation-audit.v1",
    grantId,
    grantVersion: binding?.grantVersion ?? null,
    scopeDigest: binding?.scopeDigest ?? null,
    tenantId: input.snapshot.tenantId,
    runId: run.runId,
    workerJobId: input.snapshot.workerJobId,
    workPackageId: run.workPackageId,
    operation: binding?.operation ?? null,
    result: input.result,
    validatedAt: input.validatedAt,
    revision: run.revision,
    attempt: input.snapshot.attempt,
    developmentRunFencingVersion: run.developmentRunFencingVersion,
    workerJobFencingVersion: input.snapshot.workerJobFencingVersion,
    attestationId:
      binding?.attestationId ??
      input.snapshot.attestation?.attestationId ??
      null,
  };
  getDb();
  const persist = async (tx: DrizzleDB) => {
    const [existing] = await tx
      .select({
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
      })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, input.snapshot.workerJobId),
          eq(workerJobEvents.eventIdempotencyKey, key)
        )
      )
      .limit(1);
    if (existing) {
      if (
        existing.eventType !== "SPEC224_RECOVERY_GRANT_VALIDATED" ||
        existing.payloadJson?.schemaVersion !== payload.schemaVersion ||
        existing.payloadJson?.result !== payload.result ||
        existing.payloadJson?.grantId !== payload.grantId ||
        existing.payloadJson?.scopeDigest !== payload.scopeDigest
      ) {
        throw new Error("SPEC224_GRANT_VALIDATION_AUDIT_CONFLICT");
      }
      return;
    }
    await appendJobEvent(tx, {
      workerJobId: input.snapshot.workerJobId,
      eventType: "SPEC224_RECOVERY_GRANT_VALIDATED",
      eventIdempotencyKey: key,
      attemptId: input.snapshot.currentAttemptId,
      payloadJson: payload,
    });
  };
  if (input.transaction) await persist(input.transaction);
  else await db.instance.transaction(persist);
}

export function spec224GrantBindingMatchesSnapshot(
  snapshot: Spec224CanonicalAdmissionSnapshot
): boolean {
  const binding = snapshot.grantBinding;
  const run = snapshot.run;
  const attestation = snapshot.attestation;
  const runtime = asObject(binding?.runtimeBinding);
  const admission = asObject(binding?.admissionBinding);
  if (!binding || !run || !attestation || !runtime || !admission) return false;
  const pairs: Array<[unknown, unknown]> = [
    [binding.schemaVersion, "spec224.recovery-grant-binding.v1"],
    [binding.tenantId, run.tenantId],
    [binding.runId, run.runId],
    [binding.workerJobId, run.workerJobId],
    [binding.workPackageId, run.workPackageId],
    [binding.attestationId, attestation.attestationId],
    [binding.sourceCommit, attestation.sourceCommit],
    [binding.sourceTree, attestation.sourceTree],
    [binding.sourceSha256, attestation.sourceSha256],
    [binding.sourceManifestDigest, attestation.sourceManifestDigest],
    [binding.profileId, attestation.profileId],
    [binding.profileVersion, attestation.profileVersion],
    [binding.profileDigest, attestation.profileDigest],
    [binding.bundleDigest, attestation.bundleDigest],
    [binding.artifactEvidenceDigest, attestation.artifactEvidenceDigest],
    [binding.trustClass, attestation.trustClass],
    [binding.trustLevel, attestation.trustLevel],
    [binding.attemptId, snapshot.currentAttemptId],
    [binding.attempt, snapshot.attempt],
    [binding.revision, run.revision],
    [binding.decisionEpoch, Number(attestation.decisionEpoch)],
    [binding.developmentRunFencingVersion, run.developmentRunFencingVersion],
    [binding.workerJobFencingVersion, snapshot.workerJobFencingVersion],
    [runtime.tenantId, run.tenantId],
    [binding.ownerId, snapshot.tenantOwnerId],
    [runtime.ownerId, snapshot.tenantOwnerId],
    [runtime.runId, run.runId],
    [runtime.workerJobId, run.workerJobId],
    [runtime.attempt, snapshot.attempt],
    [runtime.revision, run.revision],
    [runtime.decisionEpoch, Number(attestation.decisionEpoch)],
    [runtime.developmentRunFencingVersion, run.developmentRunFencingVersion],
    [runtime.workerJobFencingVersion, snapshot.workerJobFencingVersion],
    [admission.runnerId, runtime.runnerId],
    [admission.runnerSessionId, runtime.runnerSessionId],
    [admission.capabilitySnapshotId, runtime.capabilitySnapshotId],
    [admission.capabilitySnapshotRevision, runtime.capabilitySnapshotRevision],
    [admission.tenantId, run.tenantId],
    [admission.ownerId, snapshot.tenantOwnerId],
    [admission.runId, run.runId],
    [admission.workerJobId, run.workerJobId],
    [admission.workPackageId, run.workPackageId],
    [admission.attemptId, snapshot.currentAttemptId],
    [admission.attempt, snapshot.attempt],
    [admission.revision, run.revision],
    [admission.decisionEpoch, Number(attestation.decisionEpoch)],
    [admission.developmentRunFencingVersion, run.developmentRunFencingVersion],
    [admission.workerJobFencingVersion, snapshot.workerJobFencingVersion],
    [admission.attestationId, attestation.attestationId],
    [admission.sourceCommit, attestation.sourceCommit],
    [admission.sourceTree, attestation.sourceTree],
    [admission.sourceSha256, attestation.sourceSha256],
    [admission.sourceManifestDigest, attestation.sourceManifestDigest],
    [admission.profileId, attestation.profileId],
    [admission.profileVersion, attestation.profileVersion],
    [admission.profileDigest, attestation.profileDigest],
    [admission.bundleDigest, attestation.bundleDigest],
    [admission.artifactEvidenceDigest, attestation.artifactEvidenceDigest],
  ];
  return (
    pairs.every(([actual, expected]) => actual === expected) &&
    typeof binding.grantId === "string" &&
    /^[0-9a-f-]{36}$/i.test(binding.grantId) &&
    typeof binding.operation === "string" &&
    typeof binding.path === "string" &&
    typeof runtime.runnerId === "string" &&
    runtime.runnerId.length > 0 &&
    typeof runtime.runnerSessionId === "string" &&
    runtime.runnerSessionId.length > 0 &&
    typeof runtime.capabilitySnapshotId === "string" &&
    runtime.capabilitySnapshotId.length > 0 &&
    typeof runtime.capabilitySnapshotRevision === "string" &&
    runtime.capabilitySnapshotRevision.length > 0 &&
    typeof binding.scopeDigest === "string" &&
    /^[a-f0-9]{64}$/.test(binding.scopeDigest) &&
    Number.isSafeInteger(binding.grantVersion) &&
    Number(binding.grantVersion) >= 1
  );
}

export async function checkSpec224RuntimeAdmission(input: {
  tenantId: string;
  workerJobId: string;
  lease: LeaseContext;
}): Promise<Spec224RuntimeAdmissionDecision> {
  try {
    const initialSnapshot = await (
      testSnapshotLoader ?? loadSpec224CanonicalAdmissionSnapshot
    )(input);
    if (!initialSnapshot) {
      return { decision: "DENY", reason: "DENIED_ATTESTATION_BINDING" };
    }
    // Preserve the test seam for pure/unit tests. Production admission with a
    // grant binding is always reloaded and validated while holding the same
    // PostgreSQL transaction fence as grant revocation.
    if (!testSnapshotLoader && initialSnapshot.grantBinding) {
      const grantId = String(initialSnapshot.grantBinding.grantId ?? "");
      return await db.instance.transaction(async tx => {
        await acquireSpec224RecoveryGrantFence(tx, {
          tenantId: initialSnapshot.tenantId,
          grantId,
        });
        const snapshot = await loadSpec224CanonicalAdmissionSnapshot(input, tx);
        if (!snapshot) {
          return { decision: "DENY", reason: "DENIED_ATTESTATION_BINDING" };
        }
        if (snapshot.grantBinding?.grantId !== grantId) {
          await recordGrantValidation({
            snapshot,
            result: "DENIED_GRANT_BINDING",
            validatedAt: new Date().toISOString(),
            transaction: tx,
          });
          return { decision: "DENY", reason: "DENIED_GRANT_BINDING" };
        }
        return evaluateAndValidateSnapshot(snapshot, tx);
      });
    }
    return evaluateAndValidateSnapshot(initialSnapshot);
  } catch {
    return {
      decision: "DENY",
      reason: "DENIED_ADMISSION_AUTHORITY_UNAVAILABLE",
    };
  }
}

async function evaluateAndValidateSnapshot(
  snapshot: Spec224CanonicalAdmissionSnapshot,
  transaction?: DrizzleDB
): Promise<Spec224RuntimeAdmissionDecision> {
  if (!snapshot) {
    return { decision: "DENY", reason: "DENIED_ATTESTATION_BINDING" };
  }
  const preflight = evaluateSpec224RuntimeAdmission(snapshot);
  if (
    preflight.decision === "DENY" &&
    preflight.reason !== "DENIED_LOCAL_ONLY_ATTESTATION" &&
    preflight.reason !== "DENIED_ADMISSION_NOT_ENABLED"
  ) {
    if (!testSnapshotLoader) {
      await recordGrantValidation({
        snapshot,
        result: preflight.reason,
        validatedAt: new Date().toISOString(),
        transaction,
      });
    }
    return preflight;
  }
  if (!snapshot.grantBinding) {
    if (!testSnapshotLoader) {
      await recordGrantValidation({
        snapshot,
        result: "DENIED_NO_GRANT",
        validatedAt: new Date().toISOString(),
        transaction,
      });
    }
    return { decision: "DENY", reason: "DENIED_NO_GRANT" };
  }
  if (
    !snapshot.runnerBindingValid ||
    !spec224GrantBindingMatchesSnapshot(snapshot)
  ) {
    await recordGrantValidation({
      snapshot,
      result: "DENIED_GRANT_BINDING",
      validatedAt: new Date().toISOString(),
      transaction,
    });
    return { decision: "DENY", reason: "DENIED_GRANT_BINDING" };
  }
  const binding = snapshot.grantBinding;
  const runtimeBinding = asObject(binding.runtimeBinding);
  const admissionBinding = asObject(binding.admissionBinding);
  if (
    !runtimeBinding ||
    !admissionBinding ||
    !snapshot.attestation ||
    !snapshot.run
  ) {
    await recordGrantValidation({
      snapshot,
      result: "DENIED_GRANT_BINDING",
      validatedAt: new Date().toISOString(),
      transaction,
    });
    return { decision: "DENY", reason: "DENIED_GRANT_BINDING" };
  }
  const validation = await validateSpec224RecoveryGrant({
    grantId: String(binding.grantId),
    tenantId: snapshot.tenantId,
    sourceCommit: String(snapshot.attestation.sourceCommit),
    sourceSha256: String(snapshot.attestation.sourceSha256),
    workpackageId: snapshot.run.workPackageId,
    operation: String(binding.operation),
    path: String(binding.path),
    runtimeScope: "node-control-plane",
    environmentScope: "isolated-non-production",
    runtimeBinding,
    admissionBinding,
  });
  if (!testSnapshotLoader) {
    await recordGrantValidation({
      snapshot,
      result: validation.result,
      validatedAt: validation.validatedAt,
      transaction,
    });
  }
  if (validation.result === "UNKNOWN") {
    return {
      decision: "DENY",
      reason: "DENIED_ADMISSION_AUTHORITY_UNAVAILABLE",
    };
  }
  if (validation.result === "REQUIRES_REMOTE_TRUST") {
    return { decision: "DENY", reason: "DENIED_REMOTE_TRUST_REQUIRED" };
  }
  if (
    validation.result !== "VALID" ||
    validation.grantId !== binding.grantId ||
    validation.grantVersion !== binding.grantVersion ||
    validation.scopeDigest !== binding.scopeDigest
  ) {
    return { decision: "DENY", reason: "DENIED_GRANT_INVALID" };
  }
  const finalDecision = evaluateSpec224RuntimeAdmission(snapshot);
  if (finalDecision.decision === "DENY" && !testSnapshotLoader) {
    await recordGrantValidation({
      snapshot,
      result: finalDecision.reason,
      validatedAt: new Date().toISOString(),
      transaction,
    });
  }
  return finalDecision;
}
