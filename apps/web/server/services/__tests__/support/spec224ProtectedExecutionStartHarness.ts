import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { workerJobEvents } from "../../../../drizzle/schema";
import { db, getDb } from "../../../db";
import type { LeaseContext } from "../../jobControlPlaneTypes";
import { appendJobEvent } from "../../jobControlPlane";
import {
  loadSpec224CanonicalAdmissionSnapshot,
  spec224GrantBindingMatchesSnapshot,
  type Spec224CanonicalAdmissionSnapshot,
} from "../../spec224RuntimeAdmission";
import { acquireSpec224RecoveryGrantFence } from "../../spec224RecoveryGrantFence";

export type Spec224TestStartResult =
  | {
      outcome: "STARTED" | "ALREADY_STARTED";
      eventIdempotencyKey: string;
      operationId: string;
      authorizedCommandId: string;
    }
  | { outcome: "DENIED"; reason: string };

async function assertCampaignDatabase(): Promise<void> {
  getDb();
  await db.instance.transaction(async tx => {
    const rows = (await tx.execute(sql`
      SELECT current_database() AS database_name,
             current_user AS role_name,
             r.rolsuper AS is_superuser,
             version() AS server_version
      FROM pg_roles r
      WHERE r.rolname = current_user
    `)) as unknown as Array<{
      database_name: string;
      role_name: string;
      is_superuser: boolean;
      server_version: string;
    }>;
    const identity = rows[0];
    if (
      !identity ||
      process.env.SPEC224_TEST_DATABASE_IDENTITY !==
        "spec224-d377-pg-20260930|spec224_d377_test|spec224_runtime|PostgreSQL 15.17" ||
      identity.database_name !== "spec224_d377_test" ||
      identity.role_name !== "spec224_runtime" ||
      identity.is_superuser ||
      !identity.server_version.startsWith("PostgreSQL 15.17")
    ) {
      throw new Error("SPEC224_EXECUTION_START_TEST_DATABASE_FORBIDDEN");
    }
  });
}

function operationIdentity(snapshot: Spec224CanonicalAdmissionSnapshot) {
  const run = snapshot.run;
  const grant = snapshot.grantBinding;
  if (!run || !grant || typeof grant.grantId !== "string") return null;
  const identity = [
    snapshot.tenantId,
    run.runId,
    snapshot.workerJobId,
    snapshot.currentAttemptId,
    snapshot.attempt,
    run.revision,
    Number(snapshot.attestation?.decisionEpoch),
    run.developmentRunFencingVersion,
    snapshot.workerJobFencingVersion,
    grant.grantId,
    grant.grantVersion,
  ].join("\u0000");
  const operationId = createHash("sha256").update(identity).digest("hex");
  const authorityDigest = createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: snapshot.tenantId,
        run,
        workerJobId: snapshot.workerJobId,
        attemptId: snapshot.currentAttemptId,
        attempt: snapshot.attempt,
        workerJobFencingVersion: snapshot.workerJobFencingVersion,
        attestation: snapshot.attestation,
        grantBinding: snapshot.grantBinding,
      })
    )
    .digest("hex");
  return {
    operationId,
    eventIdempotencyKey: `spec224:protected-start:${operationId}`,
    authorityDigest,
  };
}

/**
 * Synthetic-authority integration harness. This module lives under __tests__
 * and is not imported by application/runtime code. It writes only to the
 * specifically named disposable campaign DB; it never dispatches a Runner.
 */
export async function commitSpec224ProtectedExecutionStartForTests(input: {
  tenantId: string;
  workerJobId: string;
  lease: LeaseContext;
  afterGrantFenceAcquired?: () => Promise<void>;
  syntheticGrantVerifier: (
    snapshot: Spec224CanonicalAdmissionSnapshot
  ) => Promise<boolean>;
}): Promise<Spec224TestStartResult> {
  if (
    (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE !==
      "test" ||
    process.env.NODE_ENV !== "test" ||
    process.env.RUN_DB_INTEGRATION_TESTS !== "true" ||
    process.env.SPEC224_EXECUTION_START_TEST_HARNESS !== "true"
  ) {
    throw new Error("SPEC224_EXECUTION_START_TEST_HARNESS_FORBIDDEN");
  }
  await assertCampaignDatabase();
  const initial = await loadSpec224CanonicalAdmissionSnapshot(input);
  const grantId = initial?.grantBinding?.grantId;
  if (!initial || typeof grantId !== "string")
    return { outcome: "DENIED", reason: "DENIED_GRANT_BINDING" };

  return db.instance.transaction(async tx => {
    await acquireSpec224RecoveryGrantFence(tx, {
      tenantId: initial.tenantId,
      grantId,
    });
    await input.afterGrantFenceAcquired?.();
    let snapshot = await loadSpec224CanonicalAdmissionSnapshot(input, tx);
    if (!snapshot || snapshot.grantBinding?.grantId !== grantId)
      return { outcome: "DENIED", reason: "DENIED_GRANT_BINDING" };
    // Match canonical job-transition order: row/attempt locks before event lock.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.workerJobId}))`
    );
    snapshot = await loadSpec224CanonicalAdmissionSnapshot(input, tx);
    if (!snapshot)
      return { outcome: "DENIED", reason: "DENIED_CANONICAL_STATE" };
    const run = snapshot.run;
    const attestation = snapshot.attestation;
    const binding = snapshot.grantBinding;
    const identity = operationIdentity(snapshot);
    if (!snapshot.leaseValid)
      return { outcome: "DENIED", reason: "DENIED_LEASE_INVALID" };
    if (
      !Number.isSafeInteger(snapshot.attemptLeaseGeneration) ||
      Number(snapshot.attemptLeaseGeneration) < 1
    ) {
      return { outcome: "DENIED", reason: "DENIED_STALE_FENCE" };
    }
    if (snapshot.jobStatusReason?.startsWith("cancel_requested:"))
      return { outcome: "DENIED", reason: "DENIED_CANCELLED" };
    if (snapshot.jobStatus !== "running")
      return { outcome: "DENIED", reason: "DENIED_TERMINAL_JOB" };
    if (!snapshot.runnerBindingValid)
      return { outcome: "DENIED", reason: "DENIED_RUNNER_BINDING" };
    if (!run || !attestation || !binding || !identity)
      return { outcome: "DENIED", reason: "DENIED_CANONICAL_STATE" };
    if (
      attestation.status !== "ACTIVE" ||
      !spec224GrantBindingMatchesSnapshot(snapshot)
    ) {
      return {
        outcome: "DENIED",
        reason: "DENIED_ATTESTATION_OR_GRANT_BINDING",
      };
    }

    const [prior] = await tx
      .select({
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
      })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, input.workerJobId),
          eq(workerJobEvents.eventIdempotencyKey, identity.eventIdempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      const payload = prior.payloadJson ?? {};
      if (
        prior.eventType !== "SPEC224_PROTECTED_EXECUTION_STARTED" ||
        payload.schemaVersion !== "spec224.protected-execution-start.v1" ||
        payload.evidenceClass !== "SYNTHETIC_TEST_ONLY" ||
        payload.authorityDigest !== identity.authorityDigest ||
        typeof payload.authorizedCommandId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(payload.authorizedCommandId)
      ) {
        const conflictKey = `spec224:protected-start-conflict:${createHash(
          "sha256"
        )
          .update(`${identity.eventIdempotencyKey}:${identity.authorityDigest}`)
          .digest("hex")}`;
        await appendJobEvent(tx, {
          workerJobId: input.workerJobId,
          eventType: "SPEC224_PROTECTED_EXECUTION_START_CONFLICT",
          eventIdempotencyKey: conflictKey,
          attemptId: snapshot.currentAttemptId,
          payloadJson: {
            schemaVersion: "spec224.protected-execution-start-conflict.v1",
            tenantId: snapshot.tenantId,
            runId: run.runId,
            operationId: identity.operationId,
            conflictingAuthorityDigest: identity.authorityDigest,
            detectedAt: new Date().toISOString(),
          },
        });
        return {
          outcome: "DENIED",
          reason: "DENIED_START_IDEMPOTENCY_CONFLICT",
        };
      }
      return {
        outcome: "ALREADY_STARTED",
        eventIdempotencyKey: identity.eventIdempotencyKey,
        operationId: identity.operationId,
        authorizedCommandId: payload.authorizedCommandId,
      };
    }

    if (!(await input.syntheticGrantVerifier(snapshot))) {
      await appendJobEvent(tx, {
        workerJobId: input.workerJobId,
        eventType: "SPEC224_PROTECTED_EXECUTION_START_DENIED",
        eventIdempotencyKey: `spec224:protected-start-denied:${identity.operationId}`,
        attemptId: snapshot.currentAttemptId,
        payloadJson: {
          schemaVersion: "spec224.protected-execution-start-denied.v1",
          evidenceClass: "SYNTHETIC_TEST_ONLY",
          tenantId: snapshot.tenantId,
          runId: run.runId,
          workerJobId: snapshot.workerJobId,
          attemptId: snapshot.currentAttemptId,
          operationId: identity.operationId,
          grantId: binding.grantId,
          grantVersion: binding.grantVersion,
          reasonCode: "DENIED_SYNTHETIC_TEST_GRANT",
          deniedAt: new Date().toISOString(),
        },
      });
      return { outcome: "DENIED", reason: "DENIED_SYNTHETIC_TEST_GRANT" };
    }
    const authorizedCommandId = randomUUID();
    const startedAt = new Date().toISOString();
    const runtimeBinding = binding.runtimeBinding as Record<string, unknown>;
    await appendJobEvent(tx, {
      workerJobId: input.workerJobId,
      eventType: "SPEC224_PROTECTED_EXECUTION_STARTED",
      eventIdempotencyKey: identity.eventIdempotencyKey,
      attemptId: snapshot.currentAttemptId,
      payloadJson: {
        schemaVersion: "spec224.protected-execution-start.v1",
        evidenceClass: "SYNTHETIC_TEST_ONLY",
        tenantId: snapshot.tenantId,
        runId: run.runId,
        workerJobId: snapshot.workerJobId,
        workPackageId: run.workPackageId,
        attemptId: snapshot.currentAttemptId,
        attempt: snapshot.attempt,
        leaseGeneration: snapshot.attemptLeaseGeneration,
        revision: run.revision,
        decisionEpoch: Number(attestation.decisionEpoch),
        developmentRunFencingVersion: run.developmentRunFencingVersion,
        workerJobFencingVersion: snapshot.workerJobFencingVersion,
        grantId: binding.grantId,
        grantVersion: binding.grantVersion,
        grantScopeDigest: binding.scopeDigest,
        attestationId: attestation.attestationId,
        sourceCommit: attestation.sourceCommit,
        sourceTree: attestation.sourceTree,
        sourceSha256: attestation.sourceSha256,
        sourceManifestDigest: attestation.sourceManifestDigest,
        artifactEvidenceDigest: attestation.artifactEvidenceDigest,
        profileId: attestation.profileId,
        profileVersion: attestation.profileVersion,
        profileDigest: attestation.profileDigest,
        bundleDigest: attestation.bundleDigest,
        trustClass: attestation.trustClass,
        trustLevel: attestation.trustLevel,
        operation: binding.operation,
        path: binding.path,
        runnerId: runtimeBinding.runnerId,
        runnerSessionId: runtimeBinding.runnerSessionId,
        capabilitySnapshotId: runtimeBinding.capabilitySnapshotId,
        capabilitySnapshotRevision: runtimeBinding.capabilitySnapshotRevision,
        operationId: identity.operationId,
        authorityDigest: identity.authorityDigest,
        authorizedCommandId,
        startedAt,
        testHarness: true,
      },
    });
    return {
      outcome: "STARTED",
      eventIdempotencyKey: identity.eventIdempotencyKey,
      operationId: identity.operationId,
      authorizedCommandId,
    };
  });
}
