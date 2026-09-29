import { createHash } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import {
  workerJobAttempts,
  workerJobEvents,
  workerJobs,
} from "../../drizzle/schema";
import { db, getDb } from "../db";
import type { LeaseContext } from "./jobControlPlaneTypes";

export type Spec224AdmissionDenialReason =
  | "DENIED_NO_ATTESTATION"
  | "DENIED_LOCAL_ONLY_ATTESTATION"
  | "DENIED_REMOTE_TRUST_MISSING"
  | "DENIED_ATTESTATION_INVALID"
  | "DENIED_ATTESTATION_BINDING"
  | "DENIED_STALE_REVISION"
  | "DENIED_STALE_FENCE"
  | "DENIED_LEASE_INVALID"
  | "DENIED_ADMISSION_NOT_ENABLED"
  | "DENIED_ADMISSION_AUTHORITY_UNAVAILABLE";

export type Spec224RuntimeAdmissionDecision =
  | { decision: "NOT_APPLICABLE" }
  | { decision: "DENY"; reason: Spec224AdmissionDenialReason };

export type Spec224CanonicalAdmissionSnapshot = {
  tenantId: string;
  workerJobId: string;
  actorId: number;
  attempt: number;
  currentAttemptId: string;
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

async function loadCanonicalSnapshot(input: {
  tenantId: string;
  workerJobId: string;
  lease: LeaseContext;
}): Promise<Spec224CanonicalAdmissionSnapshot | null> {
  getDb();
  return db.instance.transaction(async tx => {
    const [job] = await tx
      .select({
        id: workerJobs.id,
        tenantId: workerJobs.tenantId,
        requestedByUserId: workerJobs.requestedByUserId,
        status: workerJobs.status,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        leaseExpiresAt: workerJobs.leaseExpiresAt,
        progressJson: workerJobs.progressJson,
        inputJson: workerJobs.inputJson,
      })
      .from(workerJobs)
      .where(eq(workerJobs.id, input.workerJobId))
      .for("update")
      .limit(1);
    if (!job || job.tenantId !== input.tenantId) return null;
    const run = runFromJob(job);
    if (!run) return null;
    const [attempt] = await tx
      .select({
        id: workerJobAttempts.id,
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
      )
      .limit(1);
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
        workerJobId: job.id,
        actorId: job.requestedByUserId ?? -1,
        attempt: job.attempt,
        currentAttemptId: attempt?.id ?? "",
        workerJobFencingVersion: job.fencingVersion,
        leaseValid: false,
        lease: {
          jobId: input.lease.jobId,
          attemptId: input.lease.attemptId,
          fencingVersion: input.lease.fencingVersion,
        },
        run,
        attestation: null,
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
      const [invalidationEvent] = await tx
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
        )
        .limit(1);
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
            workerJobId: job.id,
            actorId: job.requestedByUserId ?? -1,
            attempt: job.attempt,
            currentAttemptId: attempt!.id,
            workerJobFencingVersion: job.fencingVersion,
            leaseValid: true,
            lease: input.lease,
            run,
            attestation: null,
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
    return {
      tenantId: job.tenantId,
      workerJobId: job.id,
      actorId: job.requestedByUserId ?? -1,
      attempt: job.attempt,
      currentAttemptId: attempt!.id,
      workerJobFencingVersion: job.fencingVersion,
      leaseValid: true,
      lease: input.lease,
      run,
      attestation,
    };
  });
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

export async function checkSpec224RuntimeAdmission(input: {
  tenantId: string;
  workerJobId: string;
  lease: LeaseContext;
}): Promise<Spec224RuntimeAdmissionDecision> {
  try {
    const snapshot = await (testSnapshotLoader ?? loadCanonicalSnapshot)(input);
    if (!snapshot) {
      return { decision: "DENY", reason: "DENIED_ATTESTATION_BINDING" };
    }
    return evaluateSpec224RuntimeAdmission(snapshot);
  } catch {
    return {
      decision: "DENY",
      reason: "DENIED_ADMISSION_AUTHORITY_UNAVAILABLE",
    };
  }
}
