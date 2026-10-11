import { and, eq } from "drizzle-orm";
import {
  appIdentities,
  canonicalProjectAppBindings,
  canonicalProjects,
  providerDeploymentCredentials,
} from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import type { MigrationEvidence } from "./drizzleMigrationEvidence";
import { resolveProviderDeploymentTarget } from "./providerDeploymentTargetAuthority";
import { collectRuntimeHealthEvidence } from "./runtimeHealthMonitor";

export type ProjectWikiHostedRouteOutcome =
  | "PROJECT_BINDING_REQUIRED"
  | "PACKAGE_EVIDENCE_REQUIRED"
  | "HOST_COMPATIBILITY_REQUIRED"
  | "TARGET_AUTHORITY_REQUIRED"
  | "TARGET_INCOMPATIBLE"
  | "DEPLOYMENT_APPROVAL_REQUIRED"
  | "DATABASE_AUTHORITY_REQUIRED"
  | "MIGRATION_QUALIFICATION_REQUIRED"
  | "MIGRATION_RECOVERY_REQUIRED"
  | "TRUSTED_EVIDENCE_REQUIRED"
  | "READY_FOR_AUTHORIZED_STAGING";

export type HostedRouteGateState = "PASS" | "PENDING" | "BLOCKED" | "UNKNOWN";
export type AuthorityState =
  | "OBSERVED"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "STALE"
  | "REVOKED"
  | "PERMISSION_DENIED"
  | "UNKNOWN";

export type HostedRouteIdentity = {
  tenantId: string;
  projectId: string;
  appId: "app_project_wiki_pages";
  environment: "staging";
};

export type AuthorityFact<T> = {
  state: AuthorityState;
  source: string;
  observedAt: string | null;
  scope?: Partial<HostedRouteIdentity> & {
    targetId?: string;
    databaseId?: string;
  };
  evidenceRef?: string | null;
  value: T | null;
  reason?: string;
};

export type ProjectWikiHostedRouteAuthorities = {
  project: AuthorityFact<{ active: boolean; appBound: boolean }>;
  target: AuthorityFact<{
    targetId: string;
    provider: string;
    shape: "worker" | "container" | "unresolved";
    targetAuthorized: boolean;
    deploymentApproval: "APPROVED" | "REQUIRED" | "REVOKED" | "UNKNOWN";
  }>;
  host: AuthorityFact<{
    targetId: string;
    hostRequirement: "smartspec-web";
    compatibility: "COMPATIBLE" | "INCOMPATIBLE";
    hostSourceRevision: string;
  }>;
  package: AuthorityFact<{
    sourceRevision: string;
    packageDigest: string;
    archiveSha256: string;
    contentVerified: boolean;
    appId: string;
  }>;
  database: AuthorityFact<{
    databaseId: string;
    databaseIdentity: string;
    dedicated: boolean;
    authorized: boolean;
  }>;
  migration: AuthorityFact<{
    databaseId: string;
    evidence: MigrationEvidence;
    prerequisites: Array<{
      tag: string;
      sha256: string;
      state: "APPLIED" | "PENDING" | "UNKNOWN";
    }>;
  }>;
  recovery: AuthorityFact<{
    databaseId: string;
    targetId: string;
    approved: boolean;
    strategyId: string;
  }>;
  trustedQualification: AuthorityFact<{
    verifierId: string;
    sourceRevision: string;
    packageDigest: string;
    archiveSha256: string;
    v5TargetId: string;
    v6TargetId: string;
    v6DatabaseId: string;
    v5EvidenceRef: string;
    v6EvidenceRef: string;
    expiresAt: string;
    outcome: "PASS" | "FAIL";
  }>;
  deployment: AuthorityFact<{
    targetId: string;
    packageDigest: string;
    sourceRevision: string;
    deploymentId: string;
  }>;
  smoke: AuthorityFact<{
    targetId: string;
    deploymentId: string;
    packageDigest: string;
    passed: boolean;
  }>;
  uat: AuthorityFact<{
    targetId: string;
    deploymentId: string;
    packageDigest: string;
    passed: boolean;
  }>;
};

export type ProjectWikiHostedRoutePreflight = {
  schemaVersion: "project-wiki-hosted-route-preflight.v2";
  identity: HostedRouteIdentity;
  currentProcessDiagnostic: {
    scope: "PREFLIGHT_API_PROCESS_ONLY";
    status: "OBSERVED" | "UNAVAILABLE";
    observedAt: string;
    runtimeIdentity: string | null;
    expectedRevision: string | null;
    observedRevision: string | null;
  };
  packageSourceRevision: string | null;
  packageDigest: string | null;
  archiveSha256: string | null;
  hostSourceRevision: string | null;
  target: {
    state: AuthorityState;
    targetId: string | null;
    provider: string | null;
    shape: string | null;
    compatibility: "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";
    deploymentApproval: "APPROVED" | "REQUIRED" | "REVOKED" | "UNKNOWN";
  };
  dedicatedDatabase: {
    state: AuthorityState;
    databaseId: string | null;
    identity: string | null;
    authorized: boolean;
  };
  migration: {
    sourcePath: typeof PROJECT_WIKI_MIGRATION_0394.sourcePath;
    expectedSha256: string;
    prerequisites: typeof PROJECT_WIKI_MIGRATION_0394.prerequisites;
    qualification: "VALID" | "INVALID" | "UNKNOWN";
    migration0394: "PENDING" | "APPLIED" | "INVALID" | "UNKNOWN";
    reverseSqlMigration: "UNSUPPORTED";
    recoveryPolicy: AuthorityState | "AUTHORIZED" | "REQUIRED";
    receiptReference: string | null;
  };
  trustedVerifier: {
    state: AuthorityState;
    verifierId: string | null;
    v5EvidenceRef: string | null;
    v6EvidenceRef: string | null;
  };
  stages: {
    PACKAGE_CONTENT_VERIFIED: HostedRouteGateState;
    STAGING_PREFLIGHT_READY: HostedRouteGateState;
    DEPLOYMENT_COMPLETED: HostedRouteGateState;
    MIGRATION_COMPLETED: HostedRouteGateState;
    SMOKE_READY: HostedRouteGateState;
    UAT_COMPLETED: HostedRouteGateState;
    FACTORY_COMPLETED: HostedRouteGateState;
  };
  provenance: Record<
    string,
    {
      state: AuthorityState;
      source: string;
      observedAt: string | null;
      evidenceRef: string | null;
      reason?: string;
    }
  >;
  outcomes: ProjectWikiHostedRouteOutcome[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_SHA = /^[a-f0-9]{40}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const PACKAGE_DIGEST = /^spaas-package-v1:sha256:[a-f0-9]{64}$/;
const MIGRATION_TAG = "0394_project_wiki_pages_mini_app";
const PREREQUISITE_HASHES = {
  "0392_spec304_app_identity_and_route_aliases":
    "f2069748b46f8024a8cf8d89bd7440803318f46da6871dfb47c7932610ded0fd",
  "0393_spec302_canonical_project_identity":
    "6e5237357edde02315244dc69cf50ebf450f71d43d8f11927007f50df4c67738",
} as const;

export const PROJECT_WIKI_MIGRATION_0394 = {
  sourcePath: "apps/web/drizzle/0394_project_wiki_pages_mini_app.sql" as const,
  expectedSha256:
    "a49d23e221cdd2efac1ed426530e4d8643dc7446224c3959ab1f97ffa792afc7",
  prerequisites: [
    "0392_spec304_app_identity_and_route_aliases",
    "0393_spec302_canonical_project_identity",
  ] as const,
};

function unknownFact<T>(
  source: string,
  reason: string,
  scope: Partial<HostedRouteIdentity> = {}
): AuthorityFact<T> {
  return {
    state: "UNKNOWN",
    source,
    observedAt: null,
    scope,
    evidenceRef: null,
    value: null,
    reason,
  };
}

function factSummary<T>(
  fact: AuthorityFact<T>,
  identity: HostedRouteIdentity,
  targetId?: string,
  databaseId?: string
) {
  const scopeMismatch =
    fact.state === "OBSERVED" &&
    !factScopeMatches(fact, identity, targetId, databaseId);
  return {
    state: scopeMismatch ? "UNKNOWN" : fact.state,
    source: fact.source,
    observedAt: fact.observedAt,
    scope: fact.scope ?? null,
    evidenceRef: fact.evidenceRef ?? null,
    ...(scopeMismatch || fact.reason
      ? { reason: scopeMismatch ? "authority_scope_mismatch" : fact.reason }
      : {}),
  };
}

function factScopeMatches<T>(
  fact: AuthorityFact<T>,
  identity: HostedRouteIdentity,
  targetId?: string,
  databaseId?: string
): boolean {
  const scope = fact.scope;
  return (
    !!scope &&
    scope.tenantId === identity.tenantId &&
    scope.projectId === identity.projectId &&
    scope.appId === identity.appId &&
    scope.environment === identity.environment &&
    (targetId === undefined || scope.targetId === targetId) &&
    (databaseId === undefined || scope.databaseId === databaseId)
  );
}

function scopedFactState<T>(
  fact: AuthorityFact<T>,
  identity: HostedRouteIdentity,
  targetId?: string,
  databaseId?: string
): AuthorityState {
  return fact.state === "OBSERVED" &&
    !factScopeMatches(fact, identity, targetId, databaseId)
    ? "UNKNOWN"
    : fact.state;
}

function observed<T>(fact: AuthorityFact<T>): fact is AuthorityFact<T> & {
  state: "OBSERVED";
  value: T;
  observedAt: string;
} {
  return (
    fact.state === "OBSERVED" &&
    !!fact.value &&
    !!fact.observedAt &&
    Number.isFinite(Date.parse(fact.observedAt))
  );
}

function prerequisiteState(
  authorities: ProjectWikiHostedRouteAuthorities
): "VALID" | "INVALID" | "UNKNOWN" {
  const fact = authorities.migration;
  if (
    !observed(fact) ||
    !factScopeMatches(
      fact,
      identityOf(authorities),
      undefined,
      fact.value.databaseId
    )
  )
    return "UNKNOWN";
  const checks = fact.value.prerequisites;
  if (
    checks.some(
      item =>
        !PROJECT_WIKI_MIGRATION_0394.prerequisites.includes(
          item.tag as (typeof PROJECT_WIKI_MIGRATION_0394.prerequisites)[number]
        ) ||
        item.sha256 !==
          PREREQUISITE_HASHES[item.tag as keyof typeof PREREQUISITE_HASHES] ||
        item.state !== "APPLIED"
    )
  )
    return "INVALID";
  if (
    PROJECT_WIKI_MIGRATION_0394.prerequisites.some(
      tag => checks.filter(item => item.tag === tag).length !== 1
    )
  )
    return "UNKNOWN";
  const evidence = fact.value.evidence;
  if (
    evidence.status !== "OBSERVED" ||
    !evidence.value ||
    evidence.value.environment !== "staging" ||
    evidence.value.databaseIdentity !==
      authorities.database.value?.databaseIdentity ||
    !evidence.value.expectedMigrations ||
    !evidence.value.appliedMigrations
  )
    return "UNKNOWN";
  for (const tag of PROJECT_WIKI_MIGRATION_0394.prerequisites) {
    const expected = evidence.value.expectedMigrations.filter(
      item => item.tag === tag
    );
    const applied = evidence.value.appliedMigrations.filter(
      item => item.tag === tag
    );
    const pending = evidence.value.pendingMigrations.filter(
      item => item.tag === tag
    );
    if (
      expected.length !== 1 ||
      expected[0]!.hash !==
        PREREQUISITE_HASHES[tag as keyof typeof PREREQUISITE_HASHES]
    )
      return "INVALID";
    if (
      applied.some(item => item.hash !== expected[0]!.hash) ||
      pending.some(item => item.hash !== expected[0]!.hash)
    )
      return "INVALID";
    if (applied.length !== 1 || pending.length !== 0) return "UNKNOWN";
  }
  return "VALID";
}

function identityOf(
  authorities: ProjectWikiHostedRouteAuthorities
): HostedRouteIdentity {
  const project = authorities.project.scope;
  return {
    tenantId: project?.tenantId ?? "",
    projectId: project?.projectId ?? "",
    appId: "app_project_wiki_pages",
    environment: "staging",
  };
}

function migrationState(
  authorities: ProjectWikiHostedRouteAuthorities,
  identity: HostedRouteIdentity,
  databaseId: string | null
) {
  const fact = authorities.migration;
  if (
    !observed(fact) ||
    !databaseId ||
    !factScopeMatches(fact, identity, undefined, databaseId) ||
    fact.value.databaseId !== databaseId
  )
    return {
      qualification: "UNKNOWN" as const,
      state: "UNKNOWN" as const,
      receiptReference: null,
    };
  const evidence = fact.value.evidence;
  const value = evidence.value;
  if (
    !value ||
    evidence.status !== "OBSERVED" ||
    value.environment !== "staging" ||
    value.databaseIdentity !== authorities.database.value?.databaseIdentity
  ) {
    return {
      qualification: "UNKNOWN" as const,
      state: "UNKNOWN" as const,
      receiptReference: null,
    };
  }
  const prereqs = prerequisiteState(authorities);
  if (prereqs !== "VALID")
    return {
      qualification: prereqs,
      state:
        prereqs === "INVALID" ? ("INVALID" as const) : ("UNKNOWN" as const),
      receiptReference: null,
    };
  const expected0394 =
    value.expectedMigrations?.filter(item => item.tag === MIGRATION_TAG) ?? [];
  const applied0394 =
    value.appliedMigrations?.filter(item => item.tag === MIGRATION_TAG) ?? [];
  if (
    expected0394.length !== 1 ||
    expected0394[0]!.hash !== PROJECT_WIKI_MIGRATION_0394.expectedSha256
  ) {
    return {
      qualification: "INVALID" as const,
      state: "INVALID" as const,
      receiptReference: null,
    };
  }
  const pending = value.pendingMigrations.find(
    item => item.tag === MIGRATION_TAG
  );
  if (pending)
    return pending.hash === PROJECT_WIKI_MIGRATION_0394.expectedSha256 &&
      applied0394.length === 0
      ? {
          qualification: "VALID" as const,
          state: "PENDING" as const,
          receiptReference: null,
        }
      : {
          qualification: "INVALID" as const,
          state: "INVALID" as const,
          receiptReference: null,
        };

  if (
    applied0394.length !== 1 ||
    applied0394[0]!.hash !== PROJECT_WIKI_MIGRATION_0394.expectedSha256
  )
    return {
      qualification: "UNKNOWN" as const,
      state: "UNKNOWN" as const,
      receiptReference: null,
    };

  const receipt = value.executionReconciliation;
  const applied = value.latestExecution;
  const reconciled =
    value.currentState === "APPLIED" &&
    receipt.state === "CONSISTENT" &&
    receipt.receiptState === "SUCCEEDED" &&
    applied?.tag === MIGRATION_TAG &&
    applied.hash === PROJECT_WIKI_MIGRATION_0394.expectedSha256 &&
    applied.result === "APPLIED" &&
    typeof receipt.executionId === "string" &&
    receipt.executionId.length > 0;
  if (reconciled)
    return {
      qualification: "VALID" as const,
      state: "APPLIED" as const,
      receiptReference: receipt.executionId,
    };
  if (
    value.currentState === "APPLIED" ||
    value.currentState === "PARTIALLY_APPLIED"
  )
    return {
      qualification: "UNKNOWN" as const,
      state: "UNKNOWN" as const,
      receiptReference: receipt.executionId,
    };
  return {
    qualification: "VALID" as const,
    state: "PENDING" as const,
    receiptReference: null,
  };
}

export function buildProjectWikiHostedRoutePreflight(input: {
  identity: HostedRouteIdentity;
  authorities: ProjectWikiHostedRouteAuthorities;
  now?: Date;
}): ProjectWikiHostedRoutePreflight {
  const { identity, authorities } = input;
  if (
    !UUID.test(identity.tenantId) ||
    !UUID.test(identity.projectId) ||
    identity.appId !== "app_project_wiki_pages" ||
    identity.environment !== "staging"
  )
    throw new Error("PROJECT_WIKI_PREFLIGHT_IDENTITY_INVALID");
  const projectValid =
    observed(authorities.project) &&
    factScopeMatches(authorities.project, identity) &&
    authorities.project.value.active &&
    authorities.project.value.appBound;
  const packageFact = authorities.package;
  const packageValid =
    observed(packageFact) &&
    factScopeMatches(packageFact, identity) &&
    packageFact.value.appId === identity.appId &&
    SOURCE_SHA.test(packageFact.value.sourceRevision) &&
    PACKAGE_DIGEST.test(packageFact.value.packageDigest) &&
    DIGEST.test(packageFact.value.archiveSha256) &&
    packageFact.value.contentVerified;
  const targetFact = authorities.target;
  const target =
    targetFact.value &&
    factScopeMatches(targetFact, identity, targetFact.value.targetId)
      ? targetFact.value
      : null;
  const targetId = target?.targetId ?? null;
  const hostFact = authorities.host;
  const host =
    targetId &&
    observed(hostFact) &&
    factScopeMatches(hostFact, identity, targetId) &&
    hostFact.value.targetId === targetId
      ? hostFact.value
      : null;
  const targetCompatible =
    !!target &&
    target.provider === "cloudflare" &&
    target.shape === "container" &&
    !!host &&
    host.compatibility === "COMPATIBLE" &&
    host.hostRequirement === "smartspec-web";
  const targetIncompatible =
    !!target &&
    (target.shape === "worker" ||
      target.shape === "unresolved" ||
      target.provider !== "cloudflare" ||
      (!!host && host.compatibility === "INCOMPATIBLE"));
  const targetAuthorized =
    !!target &&
    observed(targetFact) &&
    target.targetAuthorized &&
    target.deploymentApproval === "APPROVED" &&
    targetCompatible;
  const databaseFact = authorities.database;
  const database =
    observed(databaseFact) && factScopeMatches(databaseFact, identity)
      ? databaseFact.value
      : null;
  const databaseAuthorized =
    !!database &&
    database.dedicated &&
    database.authorized &&
    factScopeMatches(databaseFact, identity, undefined, database.databaseId);
  const migration = migrationState(
    authorities,
    identity,
    databaseAuthorized ? database!.databaseId : null
  );
  const recoveryFact = authorities.recovery;
  const recoveryAuthorized =
    !!targetId &&
    !!database &&
    observed(recoveryFact) &&
    factScopeMatches(recoveryFact, identity, targetId, database.databaseId) &&
    recoveryFact.value.targetId === targetId &&
    recoveryFact.value.databaseId === database.databaseId &&
    recoveryFact.value.approved &&
    !!recoveryFact.value.strategyId;
  const verifierFact = authorities.trustedQualification;
  const qualification =
    observed(verifierFact) &&
    targetId &&
    database?.databaseId &&
    factScopeMatches(verifierFact, identity, targetId, database.databaseId)
      ? verifierFact.value
      : null;
  const qualificationValid =
    !!qualification &&
    packageValid &&
    qualification.outcome === "PASS" &&
    qualification.sourceRevision === packageFact.value.sourceRevision &&
    qualification.packageDigest === packageFact.value.packageDigest &&
    qualification.archiveSha256 === packageFact.value.archiveSha256 &&
    qualification.v5TargetId === targetId &&
    qualification.v6TargetId === targetId &&
    qualification.v6DatabaseId === database?.databaseId &&
    !!qualification.verifierId &&
    !!qualification.v5EvidenceRef &&
    !!qualification.v6EvidenceRef &&
    Date.parse(qualification.expiresAt) > (input.now ?? new Date()).getTime();
  const hostRevision =
    host && SOURCE_SHA.test(host.hostSourceRevision)
      ? host.hostSourceRevision
      : null;

  const outcomes: ProjectWikiHostedRouteOutcome[] = [];
  if (!projectValid) outcomes.push("PROJECT_BINDING_REQUIRED");
  if (!packageValid) outcomes.push("PACKAGE_EVIDENCE_REQUIRED");
  if (!target && targetFact.state !== "NOT_FOUND")
    outcomes.push("TARGET_AUTHORITY_REQUIRED");
  else if (!target) outcomes.push("TARGET_AUTHORITY_REQUIRED");
  if (targetIncompatible) outcomes.push("TARGET_INCOMPATIBLE");
  else if (!targetCompatible) outcomes.push("HOST_COMPATIBILITY_REQUIRED");
  if (target && target.deploymentApproval !== "APPROVED")
    outcomes.push("DEPLOYMENT_APPROVAL_REQUIRED");
  if (!databaseAuthorized) outcomes.push("DATABASE_AUTHORITY_REQUIRED");
  if (migration.qualification !== "VALID")
    outcomes.push("MIGRATION_QUALIFICATION_REQUIRED");
  if (!recoveryAuthorized) outcomes.push("MIGRATION_RECOVERY_REQUIRED");
  if (!qualificationValid) outcomes.push("TRUSTED_EVIDENCE_REQUIRED");

  const preflightReady =
    projectValid &&
    packageValid &&
    targetAuthorized &&
    databaseAuthorized &&
    migration.qualification === "VALID" &&
    recoveryAuthorized &&
    qualificationValid;
  if (preflightReady) outcomes.push("READY_FOR_AUTHORIZED_STAGING");

  const deploymentFact = authorities.deployment;
  const deployment =
    observed(deploymentFact) &&
    targetId &&
    factScopeMatches(deploymentFact, identity, targetId) &&
    packageValid &&
    deploymentFact.value.targetId === targetId &&
    deploymentFact.value.packageDigest === packageFact.value.packageDigest &&
    deploymentFact.value.sourceRevision === packageFact.value.sourceRevision
      ? deploymentFact.value
      : null;
  const migrationComplete =
    migration.state === "APPLIED" &&
    !!deployment &&
    migration.receiptReference !== null;
  const smokeFact = authorities.smoke;
  const smokeReady =
    migrationComplete &&
    !!deployment &&
    observed(smokeFact) &&
    factScopeMatches(smokeFact, identity, targetId!, database?.databaseId) &&
    smokeFact.value.targetId === targetId &&
    smokeFact.value.deploymentId === deployment.deploymentId &&
    smokeFact.value.packageDigest === packageFact.value.packageDigest &&
    smokeFact.value.passed;
  const uatFact = authorities.uat;
  const uatComplete =
    smokeReady &&
    !!deployment &&
    observed(uatFact) &&
    factScopeMatches(uatFact, identity, targetId!) &&
    uatFact.value.targetId === targetId &&
    uatFact.value.deploymentId === deployment.deploymentId &&
    uatFact.value.packageDigest === packageFact.value.packageDigest &&
    uatFact.value.passed;
  const stages = {
    PACKAGE_CONTENT_VERIFIED: packageValid
      ? ("PASS" as const)
      : ("UNKNOWN" as const),
    STAGING_PREFLIGHT_READY: preflightReady
      ? ("PASS" as const)
      : ("PENDING" as const),
    DEPLOYMENT_COMPLETED: deployment ? ("PASS" as const) : ("PENDING" as const),
    MIGRATION_COMPLETED: migrationComplete
      ? ("PASS" as const)
      : migration.state === "INVALID"
        ? ("BLOCKED" as const)
        : ("PENDING" as const),
    SMOKE_READY: smokeReady ? ("PASS" as const) : ("PENDING" as const),
    UAT_COMPLETED: uatComplete ? ("PASS" as const) : ("PENDING" as const),
    FACTORY_COMPLETED:
      preflightReady &&
      !!deployment &&
      migrationComplete &&
      smokeReady &&
      uatComplete
        ? ("PASS" as const)
        : ("PENDING" as const),
  };

  return {
    schemaVersion: "project-wiki-hosted-route-preflight.v2",
    identity,
    packageSourceRevision: packageValid
      ? packageFact.value.sourceRevision
      : null,
    packageDigest: packageValid ? packageFact.value.packageDigest : null,
    archiveSha256: packageValid ? packageFact.value.archiveSha256 : null,
    hostSourceRevision: hostRevision,
    target: {
      state: scopedFactState(targetFact, identity, target?.targetId),
      targetId,
      provider: target?.provider ?? null,
      shape: target?.shape ?? null,
      compatibility: targetIncompatible
        ? "INCOMPATIBLE"
        : targetCompatible
          ? "COMPATIBLE"
          : "UNKNOWN",
      deploymentApproval: target?.deploymentApproval ?? "UNKNOWN",
    },
    dedicatedDatabase: {
      state: scopedFactState(
        databaseFact,
        identity,
        undefined,
        database?.databaseId
      ),
      databaseId: databaseAuthorized ? database!.databaseId : null,
      identity: databaseAuthorized ? database!.databaseIdentity : null,
      authorized: databaseAuthorized,
    },
    migration: {
      ...PROJECT_WIKI_MIGRATION_0394,
      qualification: migration.qualification,
      migration0394: migration.state,
      reverseSqlMigration: "UNSUPPORTED",
      recoveryPolicy: recoveryAuthorized
        ? "AUTHORIZED"
        : scopedFactState(
              recoveryFact,
              identity,
              targetId ?? undefined,
              database?.databaseId
            ) === "OBSERVED"
          ? "REQUIRED"
          : scopedFactState(
              recoveryFact,
              identity,
              targetId ?? undefined,
              database?.databaseId
            ),
      receiptReference: migration.receiptReference,
    },
    trustedVerifier: {
      state: scopedFactState(
        verifierFact,
        identity,
        targetId ?? undefined,
        database?.databaseId
      ),
      verifierId: qualificationValid ? qualification!.verifierId : null,
      v5EvidenceRef: qualificationValid ? qualification!.v5EvidenceRef : null,
      v6EvidenceRef: qualificationValid ? qualification!.v6EvidenceRef : null,
    },
    stages,
    provenance: {
      project: factSummary(authorities.project, identity),
      target: factSummary(targetFact, identity, targetId ?? undefined),
      host: factSummary(hostFact, identity, targetId ?? undefined),
      package: factSummary(packageFact, identity),
      database: factSummary(
        databaseFact,
        identity,
        undefined,
        database?.databaseId
      ),
      migration: factSummary(
        authorities.migration,
        identity,
        undefined,
        database?.databaseId
      ),
      recovery: factSummary(
        recoveryFact,
        identity,
        targetId ?? undefined,
        database?.databaseId
      ),
      trustedQualification: factSummary(verifierFact, identity),
      deployment: factSummary(deploymentFact, identity, targetId ?? undefined),
      smoke: factSummary(
        smokeFact,
        identity,
        targetId ?? undefined,
        database?.databaseId
      ),
      uat: factSummary(uatFact, identity, targetId ?? undefined),
    },
    outcomes,
  };
}

export type ProjectWikiHostedRoutePreflightProviders = {
  observeProject(
    db: DrizzleDB,
    identity: HostedRouteIdentity
  ): Promise<AuthorityFact<{ active: boolean; appBound: boolean }>>;
  observeTarget(
    db: DrizzleDB,
    identity: HostedRouteIdentity
  ): Promise<
    AuthorityFact<ProjectWikiHostedRouteAuthorities["target"]["value"]>
  >;
  observeHost(
    identity: HostedRouteIdentity,
    target: ProjectWikiHostedRouteAuthorities["target"]
  ): Promise<ProjectWikiHostedRouteAuthorities["host"]>;
  observePackage(
    identity: HostedRouteIdentity
  ): Promise<ProjectWikiHostedRouteAuthorities["package"]>;
  observeDatabase(
    identity: HostedRouteIdentity
  ): Promise<ProjectWikiHostedRouteAuthorities["database"]>;
  observeMigration(
    db: DrizzleDB,
    identity: HostedRouteIdentity,
    database: ProjectWikiHostedRouteAuthorities["database"]
  ): Promise<ProjectWikiHostedRouteAuthorities["migration"]>;
  observeRecovery(
    identity: HostedRouteIdentity,
    target: ProjectWikiHostedRouteAuthorities["target"],
    database: ProjectWikiHostedRouteAuthorities["database"]
  ): Promise<ProjectWikiHostedRouteAuthorities["recovery"]>;
  observeTrustedQualification(
    identity: HostedRouteIdentity,
    packageFact: ProjectWikiHostedRouteAuthorities["package"]
  ): Promise<ProjectWikiHostedRouteAuthorities["trustedQualification"]>;
  observeDeployment(
    identity: HostedRouteIdentity,
    target: ProjectWikiHostedRouteAuthorities["target"],
    packageFact: ProjectWikiHostedRouteAuthorities["package"]
  ): Promise<ProjectWikiHostedRouteAuthorities["deployment"]>;
  observeSmoke(
    identity: HostedRouteIdentity
  ): Promise<ProjectWikiHostedRouteAuthorities["smoke"]>;
  observeUat(
    identity: HostedRouteIdentity
  ): Promise<ProjectWikiHostedRouteAuthorities["uat"]>;
};

function unknownProviders(): Omit<
  ProjectWikiHostedRoutePreflightProviders,
  "observeProject" | "observeTarget"
> {
  return {
    observeHost: async identity =>
      unknownFact(
        "host-capability-registry",
        "smartspec_web_host_capability_not_registered",
        identity
      ),
    observePackage: async identity =>
      unknownFact(
        "mini-app-factory-package-evidence",
        "package_evidence_not_bound_to_project",
        identity
      ),
    observeDatabase: async identity =>
      unknownFact(
        "staging-database-authority",
        "dedicated_staging_database_authority_not_registered",
        identity
      ),
    observeMigration: async identity =>
      unknownFact(
        "drizzleMigrationEvidence",
        "dedicated_staging_database_connection_not_registered",
        identity
      ),
    observeRecovery: async identity =>
      unknownFact(
        "staging-recovery-approval",
        "staging_recovery_authority_not_registered",
        identity
      ),
    observeTrustedQualification: async identity =>
      unknownFact(
        "trusted-spaas-verifier",
        "trusted_v5_v6_verifier_not_registered",
        identity
      ),
    observeDeployment: async identity =>
      unknownFact(
        "spec295-deployment-receipt",
        "deployment_receipt_not_observed",
        identity
      ),
    observeSmoke: async identity =>
      unknownFact(
        "spec295-runtime-health",
        "staging_smoke_evidence_not_observed",
        identity
      ),
    observeUat: async identity =>
      unknownFact(
        "mini-app-factory-uat",
        "staging_uat_evidence_not_observed",
        identity
      ),
  };
}

export const projectWikiHostedRoutePreflightProviders: ProjectWikiHostedRoutePreflightProviders =
  {
    ...unknownProviders(),
    async observeProject(db, identity) {
      const [row] = await db
        .select({
          projectId: canonicalProjects.projectId,
          lifecycle: canonicalProjects.lifecycle,
          appId: canonicalProjectAppBindings.appId,
          bindingLifecycle: canonicalProjectAppBindings.lifecycle,
          appLifecycle: appIdentities.lifecycle,
        })
        .from(canonicalProjects)
        .innerJoin(
          canonicalProjectAppBindings,
          and(
            eq(
              canonicalProjectAppBindings.tenantId,
              canonicalProjects.tenantId
            ),
            eq(
              canonicalProjectAppBindings.projectId,
              canonicalProjects.projectId
            )
          )
        )
        .innerJoin(
          appIdentities,
          and(
            eq(appIdentities.tenantId, canonicalProjectAppBindings.tenantId),
            eq(appIdentities.appId, canonicalProjectAppBindings.appId)
          )
        )
        .where(
          and(
            eq(canonicalProjects.tenantId, identity.tenantId),
            eq(canonicalProjects.projectId, identity.projectId),
            eq(canonicalProjects.lifecycle, "ACTIVE"),
            eq(canonicalProjectAppBindings.appId, identity.appId),
            eq(canonicalProjectAppBindings.lifecycle, "ACTIVE"),
            eq(appIdentities.lifecycle, "active")
          )
        )
        .limit(1);
      const observedAt = new Date().toISOString();
      return row
        ? {
            state: "OBSERVED",
            source: "canonical_projects+canonical_project_app_bindings",
            observedAt,
            scope: identity,
            value: { active: true, appBound: row.appId === identity.appId },
          }
        : {
            state: "NOT_FOUND",
            source: "canonical_projects+canonical_project_app_bindings",
            observedAt,
            scope: identity,
            value: null,
            reason: "active_project_app_binding_not_found",
          };
    },
    async observeTarget(db, identity) {
      const resolution = await resolveProviderDeploymentTarget(db, {
        tenantId: identity.tenantId,
        projectId: identity.projectId,
        environment: identity.environment,
        provider: "cloudflare",
      });
      const observedAt = new Date().toISOString();
      if (resolution.status !== "CONFIGURED")
        return {
          state:
            resolution.status === "PERMISSION_DENIED"
              ? "PERMISSION_DENIED"
              : "NOT_FOUND",
          source: "providerDeploymentTargetAuthority",
          observedAt,
          scope: identity,
          value: null,
          reason: resolution.status,
        };
      const row = resolution.target;
      const [credential] = await db
        .select({
          status: providerDeploymentCredentials.status,
          revokedAt: providerDeploymentCredentials.revokedAt,
        })
        .from(providerDeploymentCredentials)
        .where(
          and(
            eq(providerDeploymentCredentials.tenantId, identity.tenantId),
            eq(providerDeploymentCredentials.projectId, identity.projectId),
            eq(providerDeploymentCredentials.environment, identity.environment),
            eq(providerDeploymentCredentials.provider, row.provider),
            eq(providerDeploymentCredentials.credentialRef, row.credentialRef)
          )
        )
        .limit(1);
      const verifiedAt = row.lastVerifiedAt?.getTime() ?? Number.NaN;
      const targetAgeMs = Date.now() - verifiedAt;
      const targetFresh =
        Number.isFinite(verifiedAt) &&
        targetAgeMs >= 0 &&
        targetAgeMs <= 24 * 60 * 60 * 1000;
      const credentialValid =
        credential?.status === "CONFIGURED" && credential.revokedAt === null;
      const shape = row.workerRef
        ? "worker"
        : row.containerApplicationRef
          ? "container"
          : "unresolved";
      const state = !targetFresh
        ? ("STALE" as const)
        : credentialValid
          ? ("OBSERVED" as const)
          : credential?.status === "REVOKED" || credential?.revokedAt
            ? ("REVOKED" as const)
            : ("UNAVAILABLE" as const);
      return {
        state,
        source:
          "providerDeploymentTargetAuthority+providerDeploymentCredentials",
        observedAt,
        scope: { ...identity, targetId: row.deploymentTargetId },
        value: {
          targetId: row.deploymentTargetId,
          provider: row.provider,
          shape,
          targetAuthorized: credentialValid && targetFresh,
          deploymentApproval: "UNKNOWN",
        },
        reason: !targetFresh
          ? "target_verification_missing_or_stale"
          : credentialValid
            ? undefined
            : "scoped_deployment_credential_unavailable",
      };
    },
  };

export async function composeProjectWikiHostedRoutePreflight(input: {
  db: DrizzleDB;
  tenantId: string;
  projectId: string;
  providers?: ProjectWikiHostedRoutePreflightProviders;
  now?: Date;
}): Promise<ProjectWikiHostedRoutePreflight> {
  const identity: HostedRouteIdentity = {
    tenantId: input.tenantId,
    projectId: input.projectId,
    appId: "app_project_wiki_pages",
    environment: "staging",
  };
  if (!UUID.test(identity.tenantId) || !UUID.test(identity.projectId))
    throw new Error("PROJECT_WIKI_PREFLIGHT_IDENTITY_INVALID");
  const providers = input.providers ?? projectWikiHostedRoutePreflightProviders;
  const project = await providers.observeProject(input.db, identity);
  const target = await providers.observeTarget(input.db, identity);
  const [host, packageFact, database] = await Promise.all([
    providers.observeHost(identity, target),
    providers.observePackage(identity),
    providers.observeDatabase(identity),
  ]);
  const [migration, recovery, trustedQualification, deployment, smoke, uat] =
    await Promise.all([
      providers.observeMigration(input.db, identity, database),
      providers.observeRecovery(identity, target, database),
      providers.observeTrustedQualification(identity, packageFact),
      providers.observeDeployment(identity, target, packageFact),
      providers.observeSmoke(identity),
      providers.observeUat(identity),
    ]);
  const processEvidence = collectRuntimeHealthEvidence({ now: input.now });
  return {
    ...buildProjectWikiHostedRoutePreflight({
      identity,
      authorities: {
        project,
        target,
        host,
        package: packageFact,
        database,
        migration,
        recovery,
        trustedQualification,
        deployment,
        smoke,
        uat,
      },
      now: input.now,
    }),
    currentProcessDiagnostic: {
      scope: "PREFLIGHT_API_PROCESS_ONLY",
      status: processEvidence.status,
      observedAt: processEvidence.observedAt,
      runtimeIdentity: processEvidence.value?.runtimeIdentity ?? null,
      expectedRevision: processEvidence.value?.expectedRevision ?? null,
      observedRevision: processEvidence.value?.observedRevision ?? null,
    },
  };
}
