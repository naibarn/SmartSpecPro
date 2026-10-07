import type { DrizzleDB } from "../db";
import { getCloudflareDeploymentCredentialState } from "./cloudflareCredentialCenter";
import { drizzleMigrationEvidenceSource, type MigrationEvidenceSource } from "./drizzleMigrationEvidence";
import { getPersistedCloudflareContainerEvidence, getPersistedCloudflareWorkerDeploymentEvidence, type RuntimeEvidence } from "./cloudflareRuntimeEvidence";
import { resolveProviderDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { collectRuntimeHealthEvidence } from "./runtimeHealthMonitor";

export type ProductionEvidenceState = "OBSERVED" | "NOT_CONFIGURED" | "INVALID_TARGET_CONFIGURATION" | "PERMISSION_DENIED" | "REVOKED" | "UNAVAILABLE" | "STALE" | "PENDING" | "FAILED" | "PARTIAL" | "DEGRADED" | "CONVERGED" | "UNKNOWN_EVIDENCE";

export type ProductionEvidenceDependencies = {
  migrationSource?: MigrationEvidenceSource;
  runtimeEvidence?: (now?: Date) => ReturnType<typeof collectRuntimeHealthEvidence>;
  workerEvidence?: (input: { db: DrizzleDB; callerTenantId: string; projectId: string; environment: string; now?: Date }) => Promise<RuntimeEvidence<unknown>>;
  containerEvidence?: (input: { db: DrizzleDB; callerTenantId: string; projectId: string; environment: string; now?: Date }) => Promise<RuntimeEvidence<unknown>>;
};

/** Normalized read model for Mission Control. Provider payloads are already reduced by their adapters. */
export async function getProductionEvidence(input: {
  db: DrizzleDB;
  identity: DeploymentTargetIdentity;
  now?: Date;
  dependencies?: ProductionEvidenceDependencies;
}) {
  const observedAt = (input.now ?? new Date()).toISOString();
  const { identity } = input;
  const target = await resolveProviderDeploymentTarget(input.db, identity);
  const credential = target.status === "CONFIGURED"
    ? await getCloudflareDeploymentCredentialState(input.db, { identity, credentialRef: target.target.credentialRef })
    : { status: target.status === "PERMISSION_DENIED" ? "PERMISSION_DENIED" as const : "NOT_CONFIGURED" as const,
      credentialRef: null };
  const workerRead = input.dependencies?.workerEvidence ?? getPersistedCloudflareWorkerDeploymentEvidence;
  const containerRead = input.dependencies?.containerEvidence ?? getPersistedCloudflareContainerEvidence;
  const [worker, container, migration] = await Promise.all([
    workerRead({ db: input.db, callerTenantId: identity.tenantId, projectId: identity.projectId, environment: identity.environment, now: input.now }),
    containerRead({ db: input.db, callerTenantId: identity.tenantId, projectId: identity.projectId, environment: identity.environment, now: input.now }),
    (input.dependencies?.migrationSource ?? drizzleMigrationEvidenceSource).observe({ db: input.db, now: input.now }),
  ]);
  const runtime = (input.dependencies?.runtimeEvidence ?? (now => collectRuntimeHealthEvidence({ now })))(input.now);
  return {
    schemaVersion: "production-evidence.v1" as const,
    observedAt,
    scope: { tenantId: identity.tenantId, projectId: identity.projectId, environment: identity.environment, provider: identity.provider },
    deploymentTarget: {
      status: target.status,
      targetId: target.status === "CONFIGURED" ? target.target.deploymentTargetId : null,
      provenance: target.status === "CONFIGURED" ? target.target.provenance : null,
      observedAt,
    },
    credential: { status: credential.status, credentialRef: credential.credentialRef, observedAt },
    artifacts: { status: "UNKNOWN_EVIDENCE" as const, source: "deployment_artifact_attestation", value: null, observedAt },
    migration,
    worker,
    container,
    runtime,
    instanceConvergence: { status: "UNKNOWN_EVIDENCE" as const, source: "multi_instance_convergence_evaluator", value: null, observedAt },
    externalRuntimeVerification: "NOT_VERIFIED" as const,
  };
}
