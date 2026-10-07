import { and, eq } from "drizzle-orm";
import { providerDeploymentTargets } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";

export type DeploymentTargetIdentity = { tenantId: string; projectId: string; environment: string; provider: string };
export type DeploymentTargetResolution =
  | { status: "CONFIGURED"; target: typeof providerDeploymentTargets.$inferSelect }
  | { status: "NOT_CONFIGURED" | "PERMISSION_DENIED" | "TARGET_AUTHORITY_CONFLICT"; target: null };

/** Credential references carry scope; the secret remains in the existing credential center. */
export function deploymentCredentialRef(identity: DeploymentTargetIdentity): string {
  return `cloudflare:deployment:${encodeURIComponent(identity.tenantId)}:${encodeURIComponent(identity.projectId)}:${encodeURIComponent(identity.environment)}`;
}

export async function resolveProviderDeploymentTarget(db: DrizzleDB, identity: DeploymentTargetIdentity): Promise<DeploymentTargetResolution> {
  const rows = await db.select().from(providerDeploymentTargets).where(and(
    eq(providerDeploymentTargets.tenantId, identity.tenantId),
    eq(providerDeploymentTargets.projectId, identity.projectId),
    eq(providerDeploymentTargets.environment, identity.environment),
    eq(providerDeploymentTargets.provider, identity.provider),
  ));
  const enabled = rows.filter(row => row.enabled);
  if (enabled.length > 1) return { status: "TARGET_AUTHORITY_CONFLICT", target: null };
  if (enabled.length === 0 && rows.length > 0) return { status: "PERMISSION_DENIED", target: null };
  if (!enabled.length) return { status: "NOT_CONFIGURED", target: null };
  if (enabled[0].credentialRef !== deploymentCredentialRef(identity)) return { status: "PERMISSION_DENIED", target: null };
  return { status: "CONFIGURED", target: enabled[0] };
}

export function authorizeDeploymentTarget(input: {
  target: typeof providerDeploymentTargets.$inferSelect;
  callerTenantId: string;
  projectId: string;
  environment: string;
  provider: string;
  credentialRef?: string | null;
}): "AUTHORIZED" | "PERMISSION_DENIED" {
  const target = input.target;
  if (!target.enabled || target.tenantId !== input.callerTenantId || target.projectId !== input.projectId ||
      target.environment !== input.environment || target.provider !== input.provider ||
      target.credentialRef !== deploymentCredentialRef({ tenantId: target.tenantId, projectId: target.projectId,
        environment: target.environment, provider: target.provider }) ||
      (input.credentialRef !== undefined && input.credentialRef !== target.credentialRef)) return "PERMISSION_DENIED";
  return "AUTHORIZED";
}

export async function createProviderDeploymentTarget(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity;
  deploymentTargetId: string;
  accountRef?: string | null;
  workerRef?: string | null;
  containerApplicationRef?: string | null;
  provenance: string;
  actorUserId?: number;
}) {
  if (input.identity.provider !== "cloudflare") throw new Error("UNSUPPORTED_DEPLOYMENT_TARGET_PROVIDER");
  const values = {
    ...input.identity,
    deploymentTargetId: input.deploymentTargetId,
    accountRef: input.accountRef ?? null,
    workerRef: input.workerRef ?? null,
    containerApplicationRef: input.containerApplicationRef ?? null,
    credentialRef: deploymentCredentialRef(input.identity),
    enabled: true,
    provenance: input.provenance,
    createdBy: input.actorUserId ?? null,
    updatedBy: input.actorUserId ?? null,
  };
  try {
    const [created] = await db.insert(providerDeploymentTargets).values(values).returning();
    return { status: "CREATED" as const, target: created };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const constraint = error && typeof error === "object" && "constraint" in error ? String(error.constraint) : "";
    if (code === "23505" && constraint === "provider_deployment_targets_active_identity_unique")
      return { status: "TARGET_AUTHORITY_CONFLICT" as const, target: null };
    throw error;
  }
}

export async function listProviderDeploymentTargets(db: DrizzleDB, identity: Pick<DeploymentTargetIdentity, "tenantId" | "projectId" | "environment">) {
  return db.select().from(providerDeploymentTargets).where(and(
    eq(providerDeploymentTargets.tenantId, identity.tenantId),
    eq(providerDeploymentTargets.projectId, identity.projectId),
    eq(providerDeploymentTargets.environment, identity.environment),
  ));
}

export type DeploymentTargetUpdate = Partial<Pick<typeof providerDeploymentTargets.$inferInsert,
  "deploymentTargetId" | "accountRef" | "workerRef" | "containerApplicationRef" | "credentialRef" | "enabled" | "provenance" | "region" | "runtimePolicy">>;

/** Update only a target inside its full ownership scope; callers must separately authorize the actor. */
export async function updateProviderDeploymentTarget(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity;
  targetRowId: string;
  changes: DeploymentTargetUpdate;
  actorUserId?: number;
}) {
  if (input.identity.provider !== "cloudflare") throw new Error("UNSUPPORTED_DEPLOYMENT_TARGET_PROVIDER");
  if (input.changes.credentialRef !== undefined && input.changes.credentialRef !== deploymentCredentialRef(input.identity))
    return { status: "PERMISSION_DENIED" as const, target: null };
  try {
    const [updated] = await db.update(providerDeploymentTargets).set({ ...input.changes, updatedBy: input.actorUserId ?? null, updatedAt: new Date() }).where(and(
      eq(providerDeploymentTargets.id, input.targetRowId),
      eq(providerDeploymentTargets.tenantId, input.identity.tenantId),
      eq(providerDeploymentTargets.projectId, input.identity.projectId),
      eq(providerDeploymentTargets.environment, input.identity.environment),
      eq(providerDeploymentTargets.provider, input.identity.provider),
    )).returning();
    if (!updated) return { status: "NOT_FOUND" as const, target: null };
    return { status: updated.enabled ? "UPDATED" as const : "DISABLED" as const, target: updated };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const constraint = error && typeof error === "object" && "constraint" in error ? String(error.constraint) : "";
    if (code === "23505" && constraint === "provider_deployment_targets_active_identity_unique")
      return { status: "TARGET_AUTHORITY_CONFLICT" as const, target: null };
    throw error;
  }
}

export async function disableProviderDeploymentTarget(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity;
  targetRowId: string;
  actorUserId?: number;
}) {
  return updateProviderDeploymentTarget(db, { ...input, changes: { enabled: false } });
}
